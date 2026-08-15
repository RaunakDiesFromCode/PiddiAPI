"""Tests for request execution with environment and secret variable interpolation."""

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.models.environment import (
    Environment,
    EnvironmentVariableDefinition,
    UserPreferences,
)
from piddi.storage.environment_manager import (
    EnvironmentFileManager,
    generate_environment_id,
)
from piddi.storage.preferences_manager import PreferencesManager


@pytest.fixture
def temp_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    ws_path = tmp_path / "workspace"
    config = AppConfig(
        host="127.0.0.1",
        port=4111,
        session_token="test_sec_token_exec",
        workspace_path=ws_path,
        debug=True,
    )
    set_config(config)
    return ws_path


@pytest.mark.asyncio
async def test_environment_selection_precedence(temp_workspace: Path, echo_server_url: str) -> None:
    """Verify 3-tier environment selection precedence during /api/execute."""
    app = create_app()

    # Create Environment 1: Dev
    env_dev_id = generate_environment_id()
    env_dev = Environment(
        id=env_dev_id,
        name="Dev",
        variables=[
            EnvironmentVariableDefinition(key="targetHost", value=echo_server_url, is_secret=False),
            EnvironmentVariableDefinition(key="envTag", value="dev_environment", is_secret=False),
            EnvironmentVariableDefinition(key="apiKey", value=None, is_secret=True),
        ],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env_dev)
    await EnvironmentFileManager.set_secret(temp_workspace, env_dev_id, "apiKey", "dev_secret_key")

    # Create Environment 2: Staging
    env_stg_id = generate_environment_id()
    env_stg = Environment(
        id=env_stg_id,
        name="Staging",
        variables=[
            EnvironmentVariableDefinition(key="targetHost", value=echo_server_url, is_secret=False),
            EnvironmentVariableDefinition(
                key="envTag", value="staging_environment", is_secret=False
            ),
            EnvironmentVariableDefinition(key="apiKey", value=None, is_secret=True),
        ],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env_stg)
    await EnvironmentFileManager.set_secret(
        temp_workspace, env_stg_id, "apiKey", "staging_secret_key"
    )

    # Set Global Active Environment to Dev
    await PreferencesManager.save_preferences(UserPreferences(active_environment_id=env_dev_id))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_exec"}

        # Case 1: Explicit request.environment_id = Staging (Overrides Global Dev)
        req_payload_override = {
            "method": "GET",
            "url": "{{targetHost}}/echo/get",
            "headers": [
                {"key": "X-Env-Tag", "value": "{{envTag}}", "enabled": True},
                {"key": "X-API-Key", "value": "{{apiKey}}", "enabled": True},
            ],
            "environment_id": env_stg_id,
        }
        res1 = await client.post("/api/execute", headers=auth_headers, json=req_payload_override)
        assert res1.status_code == 200
        res1_data = res1.json()
        assert res1_data["status"] == 200
        echo_body1 = json.loads(res1_data["body"])
        assert echo_body1["headers"]["x-env-tag"] == "staging_environment"
        assert echo_body1["headers"]["x-api-key"] == "staging_secret_key"

        # Case 2: Null request.environment_id (Falls back to Global Active Dev)
        req_payload_global = {
            "method": "GET",
            "url": "{{targetHost}}/echo/get",
            "headers": [
                {"key": "X-Env-Tag", "value": "{{envTag}}", "enabled": True},
                {"key": "X-API-Key", "value": "{{apiKey}}", "enabled": True},
            ],
            "environment_id": None,
        }
        res2 = await client.post("/api/execute", headers=auth_headers, json=req_payload_global)
        assert res2.status_code == 200
        res2_data = res2.json()
        assert res2_data["status"] == 200
        echo_body2 = json.loads(res2_data["body"])
        assert echo_body2["headers"]["x-env-tag"] == "dev_environment"
        assert echo_body2["headers"]["x-api-key"] == "dev_secret_key"

        # Case 3: Set Global Active Environment to None -> No environment (literal fallback)
        await PreferencesManager.save_preferences(UserPreferences(active_environment_id=None))
        req_payload_no_env = {
            "method": "GET",
            "url": f"{echo_server_url}/echo/get",
            "headers": [{"key": "X-Missing", "value": "{{unresolvedKey}}", "enabled": True}],
            "environment_id": None,
        }
        res3 = await client.post("/api/execute", headers=auth_headers, json=req_payload_no_env)
        assert res3.status_code == 200
        res3_data = res3.json()
        echo_body3 = json.loads(res3_data["body"])
        assert echo_body3["headers"]["x-missing"] == "{{unresolvedKey}}"


@pytest.mark.asyncio
async def test_missing_secret_key_leaves_literal(
    temp_workspace: Path, echo_server_url: str
) -> None:
    """Verify missing secret in .secrets.json leaves literal tag {{secretKey}} intact without substituting empty string."""
    app = create_app()
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Dev",
        variables=[
            EnvironmentVariableDefinition(key="targetHost", value=echo_server_url, is_secret=False),
            EnvironmentVariableDefinition(key="missingSecretKey", value=None, is_secret=True),
        ],
    )
    await EnvironmentFileManager.save_environment(temp_workspace, env)
    # Do NOT set secret in secrets vault

    await PreferencesManager.save_preferences(UserPreferences(active_environment_id=env_id))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_exec"}

        req_payload = {
            "method": "GET",
            "url": "{{targetHost}}/echo/get",
            "headers": [
                {
                    "key": "Authorization",
                    "value": "Bearer {{missingSecretKey}}",
                    "enabled": True,
                }
            ],
        }
        res = await client.post("/api/execute", headers=auth_headers, json=req_payload)
        assert res.status_code == 200
        data = res.json()
        echo_body = json.loads(data["body"])
        assert echo_body["headers"]["authorization"] == "Bearer {{missingSecretKey}}"
