"""Tests for dev bootstrap endpoint and static index token injection."""

import httpx
import pytest

from piddi.config import AppConfig, set_config
from piddi.main import create_app


@pytest.mark.asyncio
async def test_dev_bootstrap_allowed_in_debug_mode(tmp_path):
    port = 4111
    token = "test-secret-dev-token-1234567890abcdef"
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token=token,
        workspace_path=tmp_path,
        debug=True,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        # Dev server request from http://localhost:5173 without token
        res = await client.get(
            "/api/bootstrap",
            headers={"Host": f"127.0.0.1:{port}", "Origin": "http://localhost:5173"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["token"] == token
        assert data["workspace_path"] == str(tmp_path)
        assert data["port"] == port


@pytest.mark.asyncio
async def test_dev_bootstrap_rejected_untrusted_origin(tmp_path):
    port = 4111
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token="test-token-123",
        workspace_path=tmp_path,
        debug=True,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        res = await client.get(
            "/api/bootstrap",
            headers={"Host": f"127.0.0.1:{port}", "Origin": "http://evil.com"},
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_dev_bootstrap_disabled_in_production(tmp_path):
    port = 4111
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token="test-token-prod",
        workspace_path=tmp_path,
        debug=False,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        res = await client.get(
            "/api/bootstrap",
            headers={
                "Host": f"127.0.0.1:{port}",
                "Origin": f"http://127.0.0.1:{port}",
                "X-Piddi-Token": "test-token-prod",
            },
        )
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_static_index_serving_token_injection(tmp_path):
    port = 4111
    token = "deterministic-session-token-998877"
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token=token,
        workspace_path=tmp_path,
        debug=False,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        res = await client.get("/")
        assert res.status_code == 200
        assert f'<meta name="piddi-token" content="{token}">' in res.text
        # Ensure static on disk is NOT mutated
        from pathlib import Path

        static_index = Path("piddi/static/index.html")
        if static_index.exists():
            disk_content = static_index.read_text(encoding="utf-8")
            assert f'content="{token}"' not in disk_content


@pytest.mark.asyncio
async def test_dev_bootstrap_and_full_api_lifecycle_with_vite_host_and_origin(tmp_path):
    """Verify that local development requests proxied with Vite Host/Origin succeed end-to-end."""
    port = 4111
    token = "test-secret-dev-token-xyz789"
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token=token,
        workspace_path=tmp_path,
        debug=True,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        vite_headers = {
            "Host": "localhost:5173",
            "Origin": "http://localhost:5173",
        }

        # 1. Bootstrap to acquire token
        boot_res = await client.get("/api/bootstrap", headers=vite_headers)
        assert boot_res.status_code == 200
        boot_data = boot_res.json()
        assert boot_data["token"] == token

        # 2. Authenticated health check
        auth_headers = {
            **vite_headers,
            "X-Piddi-Token": boot_data["token"],
        }
        health_res = await client.get("/api/health", headers=auth_headers)
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "ok"

        # 3. Workspace load
        ws_res = await client.get("/api/workspace", headers=auth_headers)
        assert ws_res.status_code == 200
        assert "collections" in ws_res.json()

        # 4. Environments load
        env_res = await client.get("/api/environments", headers=auth_headers)
        assert env_res.status_code == 200
        assert isinstance(env_res.json(), list)

        # 5. Preferences load
        pref_res = await client.get("/api/preferences", headers=auth_headers)
        assert pref_res.status_code == 200


@pytest.mark.asyncio
async def test_production_rejects_vite_host_and_origin(tmp_path):
    """Verify that in production mode, Vite dev Host and Origin are strictly rejected."""
    port = 4111
    token = "test-token-prod-secure"
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token=token,
        workspace_path=tmp_path,
        debug=False,
    )
    set_config(cfg)
    app = create_app()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=f"http://127.0.0.1:{port}"
    ) as client:
        # Dev Host in production -> 403 FORBIDDEN_HOST
        res_host = await client.get(
            "/api/health",
            headers={"Host": "localhost:5173", "X-Piddi-Token": token},
        )
        assert res_host.status_code == 403
        assert res_host.json()["code"] == "FORBIDDEN_HOST"

        # Dev Origin in production -> 403 FORBIDDEN_ORIGIN
        res_origin = await client.get(
            "/api/health",
            headers={
                "Host": f"127.0.0.1:{port}",
                "Origin": "http://localhost:5173",
                "X-Piddi-Token": token,
            },
        )
        assert res_origin.status_code == 403
        assert res_origin.json()["code"] == "FORBIDDEN_ORIGIN"
