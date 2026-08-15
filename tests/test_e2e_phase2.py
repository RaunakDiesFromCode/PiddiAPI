"""End-to-end verification test for Phase 2 frontend serving and request execution."""

import httpx
import pytest

from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
)


@pytest.mark.asyncio
async def test_full_e2e_frontend_serving_and_request_execution(echo_server_url: str, tmp_path):
    port = 4111
    token = "test-phase-2-e2e-token-1234567890abcdef"
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
        # 1. Verify static index.html is served with token injected
        res_index = await client.get("/")
        assert res_index.status_code == 200
        assert f'<meta name="piddi-token" content="{token}">' in res_index.text

        # 2. Verify dev bootstrap endpoint returns metadata and token
        res_boot = await client.get(
            "/api/bootstrap",
            headers={"Host": f"127.0.0.1:{port}", "Origin": "http://localhost:5173"},
        )
        assert res_boot.status_code == 200
        boot_data = res_boot.json()
        assert boot_data["token"] == token
        assert boot_data["port"] == port

        # 3. Verify health check with session token
        res_health = await client.get(
            "/api/health",
            headers={"Host": f"127.0.0.1:{port}", "X-Piddi-Token": token},
        )
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "ok"

        # 4. Execute a GET request with query params and headers against echo server
        req_get = CanonicalRequestModel(
            method=HTTPMethod.GET,
            url=f"{echo_server_url}/echo/get",
            params=[
                KeyValueItem(key="search", value="piddi", enabled=True),
                KeyValueItem(key="page", value="2", enabled=True),
                KeyValueItem(key="ignored", value="skip", enabled=False),
            ],
            headers=[
                KeyValueItem(key="X-Client", value="PiddiFrontend", enabled=True),
                KeyValueItem(key="Accept", value="application/json", enabled=True),
            ],
        )

        res_exec_get = await client.post(
            "/api/execute",
            headers={"Host": f"127.0.0.1:{port}", "X-Piddi-Token": token},
            json=req_get.model_dump(mode="json"),
        )
        assert res_exec_get.status_code == 200
        canon_res_get = res_exec_get.json()
        assert canon_res_get["status"] == 200
        assert canon_res_get["status_text"] == "OK"
        assert "piddi" in canon_res_get["body"]
        assert canon_res_get["duration_ms"] > 0

        # 5. Execute a POST request with JSON body
        req_post_json = CanonicalRequestModel(
            method=HTTPMethod.POST,
            url=f"{echo_server_url}/echo/post",
            headers=[
                KeyValueItem(key="X-Request-Source", value="ComposerTest", enabled=True),
            ],
            body=RequestBody(
                type=BodyType.JSON,
                raw='{"title": "Phase 2 Success", "items": [1, 2, 3]}',
            ),
        )

        res_exec_post = await client.post(
            "/api/execute",
            headers={"Host": f"127.0.0.1:{port}", "X-Piddi-Token": token},
            json=req_post_json.model_dump(mode="json"),
        )
        assert res_exec_post.status_code == 200
        canon_res_post = res_exec_post.json()
        assert canon_res_post["status"] == 200
        assert "Phase 2 Success" in canon_res_post["body"]

        # 6. Execute an Auth request with Bearer token
        req_auth = CanonicalRequestModel(
            method=HTTPMethod.GET,
            url=f"{echo_server_url}/echo/auth",
            auth=AuthConfig(type=AuthType.BEARER, token="test-jwt-secret-xyz"),
        )

        res_exec_auth = await client.post(
            "/api/execute",
            headers={"Host": f"127.0.0.1:{port}", "X-Piddi-Token": token},
            json=req_auth.model_dump(mode="json"),
        )
        assert res_exec_auth.status_code == 200
        canon_res_auth = res_exec_auth.json()
        assert canon_res_auth["status"] == 200
        assert "test-jwt-secret-xyz" in canon_res_auth["body"]
