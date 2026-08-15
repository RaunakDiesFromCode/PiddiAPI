"""Tests for environments and secret vault REST API router."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.models.environment import (
    Environment,
    EnvironmentVariableDefinition,
)
from piddi.storage.environment_manager import (
    EnvironmentFileManager,
    generate_environment_id,
)


@pytest.fixture
def temp_workspace(tmp_path: Path) -> Path:
    config = AppConfig(
        host="127.0.0.1",
        port=4111,
        session_token="test_sec_token_12345",
        workspace_path=tmp_path,
        debug=True,
    )
    set_config(config)
    return tmp_path


@pytest.mark.asyncio
async def test_get_environments_does_not_contain_secrets(
    temp_workspace: Path,
) -> None:
    """Verify GET /api/environments returns variable definitions with value=None for secrets."""
    app = create_app()
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Dev",
        variables=[
            EnvironmentVariableDefinition(
                key="baseUrl", value="http://localhost:8000", is_secret=False
            ),
            EnvironmentVariableDefinition(key="apiKey", value=None, is_secret=True),
        ],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env)
    await EnvironmentFileManager.set_secret(temp_workspace, env_id, "apiKey", "my_super_secret")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get(
            "/api/environments",
            headers={"X-Piddi-Token": "test_sec_token_12345"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        vars_list = data[0]["variables"]
        assert vars_list[0]["key"] == "baseUrl"
        assert vars_list[0]["value"] == "http://localhost:8000"
        assert vars_list[1]["key"] == "apiKey"
        assert vars_list[1]["value"] is None
        # Verify secret is not in raw response text
        assert "my_super_secret" not in resp.text


@pytest.mark.asyncio
async def test_reveal_and_update_secrets(temp_workspace: Path) -> None:
    """Verify setting, revealing, and deleting secret values through dedicated endpoints."""
    app = create_app()
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Staging",
        variables=[EnvironmentVariableDefinition(key="apiSecret", value=None, is_secret=True)],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_12345"}

        # 1. Reveal missing secret -> 404
        rev_missing = await client.get(
            f"/api/environments/{env_id}/secrets/apiSecret",
            headers=auth_headers,
        )
        assert rev_missing.status_code == 404

        # 2. Set secret value
        set_res = await client.put(
            f"/api/environments/{env_id}/secrets/apiSecret",
            headers=auth_headers,
            json={"value": "stg_secret_999"},
        )
        assert set_res.status_code == 200
        assert set_res.json()["is_set"] is True

        # 3. Reveal secret value (authenticated)
        rev_res = await client.get(
            f"/api/environments/{env_id}/secrets/apiSecret",
            headers=auth_headers,
        )
        assert rev_res.status_code == 200
        assert rev_res.json()["value"] == "stg_secret_999"

        # 4. Reveal secret unauthenticated -> 401
        rev_unauth = await client.get(
            f"/api/environments/{env_id}/secrets/apiSecret",
        )
        assert rev_unauth.status_code == 401

        # 5. Delete secret value
        del_res = await client.delete(
            f"/api/environments/{env_id}/secrets/apiSecret",
            headers=auth_headers,
        )
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] is True

        # 6. Verify deleted -> 404
        rev_after_del = await client.get(
            f"/api/environments/{env_id}/secrets/apiSecret",
            headers=auth_headers,
        )
        assert rev_after_del.status_code == 404


@pytest.mark.asyncio
async def test_put_environment_rejects_secret_values(
    temp_workspace: Path,
) -> None:
    """Verify PUT /api/environments/{id} with secret values is rejected with HTTP 422 / 400."""
    app = create_app()
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Dev",
        variables=[EnvironmentVariableDefinition(key="apiKey", value=None, is_secret=True)],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_12345"}

        # Attempt to PUT with secret value in body
        bad_payload = {
            "name": "Dev",
            "variables": [
                {
                    "key": "apiKey",
                    "value": "ATTEMPTED_SECRET_IN_PUT",
                    "is_secret": True,
                    "enabled": True,
                }
            ],
        }
        res = await client.put(
            f"/api/environments/{env_id}",
            headers=auth_headers,
            json=bad_payload,
        )
        assert res.status_code == 422 or res.status_code == 400


@pytest.mark.asyncio
async def test_secret_endpoints_reject_invalid_keys(
    temp_workspace: Path,
) -> None:
    """Verify GET/PUT/DELETE /api/environments/{id}/secrets/{key} rejects invalid keys with HTTP 400."""
    app = create_app()
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Dev",
        variables=[EnvironmentVariableDefinition(key="validKey", value=None, is_secret=True)],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env)

    invalid_handler_keys = [
        "key with spaces",
        "key\\with\\backslash",
        "key@invalid!",
        "key🔑emoji",
        "   ",
        "key$variable",
        "key;injection",
    ]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_12345"}

        for invalid_k in invalid_handler_keys:
            import urllib.parse

            encoded_k = urllib.parse.quote(invalid_k, safe="")

            # Test GET (Reveal) -> 400
            res_get = await client.get(
                f"/api/environments/{env_id}/secrets/{encoded_k}",
                headers=auth_headers,
            )
            assert res_get.status_code == 400, (
                f"Expected 400 for GET key '{invalid_k}', got {res_get.status_code}"
            )

            # Test PUT (Set) -> 400
            res_put = await client.put(
                f"/api/environments/{env_id}/secrets/{encoded_k}",
                headers=auth_headers,
                json={"value": "secret_val"},
            )
            assert res_put.status_code == 400, (
                f"Expected 400 for PUT key '{invalid_k}', got {res_put.status_code}"
            )

            # Test DELETE -> 400
            res_del = await client.delete(
                f"/api/environments/{env_id}/secrets/{encoded_k}",
                headers=auth_headers,
            )
            assert res_del.status_code == 400, (
                f"Expected 400 for DELETE key '{invalid_k}', got {res_del.status_code}"
            )

        # Test traversal and slash keys (rejected by routing or validation with 400/404)
        for slash_key in ["../traversal", "key/with/slash"]:
            encoded_slash = urllib.parse.quote(slash_key, safe="")
            res_slash = await client.get(
                f"/api/environments/{env_id}/secrets/{encoded_slash}",
                headers=auth_headers,
            )
            assert res_slash.status_code in (400, 404)
