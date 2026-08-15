"""End-to-End full application loopback lifecycle test suite for PiddiAPI."""

from pathlib import Path

import httpx
import pytest

from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.models.environment import Environment, EnvironmentVariableDefinition
from piddi.storage.environment_manager import EnvironmentFileManager
from piddi.storage.history import HistoryManager, get_history_manager, set_history_manager


@pytest.mark.asyncio
async def test_e2e_full_lifecycle(tmp_path: Path):
    """Verify complete application lifecycle from boot to collections, environments, execution, history, and disk persistence."""
    workspace_path = tmp_path / "test_workspace"
    workspace_path.mkdir(parents=True, exist_ok=True)
    history_file = tmp_path / "history.jsonl"

    token = "e2e-session-token-32-bytes-abcdef123456"
    config = AppConfig(
        host="127.0.0.1",
        port=4111,
        session_token=token,
        workspace_path=workspace_path,
        temp_dir=tmp_path / "temp",
        debug=True,
    )
    set_config(config)

    history_mgr = HistoryManager(history_file)
    set_history_manager(history_mgr)

    app = create_app()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://127.0.0.1:4111",
    ) as client:
        auth_headers = {
            "X-Piddi-Token": token,
            "Host": "127.0.0.1:4111",
            "Origin": "http://127.0.0.1:4111",
        }

        # 1. Verify Root HTML serving & Token Injection
        res_root = await client.get("/", headers={"Host": "127.0.0.1:4111"})
        assert res_root.status_code == 200
        # If static index exists, it injects token; if fallback HTML, it returns 200
        assert "PiddiAPI" in res_root.text

        # 2. Create Collection
        col_payload = {
            "name": "E2E Integration Collection",
            "description": "Created during E2E verification test",
        }
        res_col = await client.post("/api/collections", json=col_payload, headers=auth_headers)
        assert res_col.status_code == 201
        col_data = res_col.json()
        col_id = col_data["id"]

        # 3. Create Environment with Secrets
        env_id = "env_aabbccddeeff"
        env_obj = Environment(
            id=env_id,
            name="E2E Production Environment",
            variables=[
                EnvironmentVariableDefinition(
                    key="baseUrl",
                    value="http://127.0.0.1:4111/echo/get",
                    enabled=True,
                    is_secret=False,
                ),
                EnvironmentVariableDefinition(
                    key="apiKey", value=None, enabled=True, is_secret=True
                ),
            ],
        )
        await EnvironmentFileManager.save_environment(workspace_path, env_obj)
        await EnvironmentFileManager.set_secret(
            workspace_path, env_id, "apiKey", "SUPER_SECRET_E2E_KEY"
        )

        # 4. Execute HTTP Request via /api/execute referencing {{baseUrl}} and {{apiKey}}
        req_payload = {
            "method": "GET",
            "url": "{{baseUrl}}?key={{apiKey}}",
            "environment_id": env_id,
            "headers": [
                {"key": "Authorization", "value": "Bearer {{apiKey}}", "enabled": True},
                {"key": "X-Literal-Secret", "value": "literal_secret_to_redact", "enabled": True},
            ],
        }

        res_exec = await client.post("/api/execute", json=req_payload, headers=auth_headers)
        assert res_exec.status_code == 200
        exec_data = res_exec.json()
        assert "status" in exec_data

        # Flush pending history writes
        await get_history_manager().flush_pending_tasks(timeout=2.0)

        # 5. Query Request History
        res_hist = await client.get("/api/history", headers=auth_headers)
        assert res_hist.status_code == 200
        history_records = res_hist.json()
        assert len(history_records) == 1
        record = history_records[0]

        # Invariant checks:
        # - Template variable in url and auth header preserved
        assert "{{baseUrl}}" in record["request_snapshot"]["url"]
        assert "{{apiKey}}" in record["request_snapshot"]["url"]
        assert record["request_snapshot"]["headers"][0]["value"] == "Bearer {{apiKey}}"
        # - Resolved environment secret never persisted to disk
        hist_raw = history_file.read_text(encoding="utf-8")
        assert "SUPER_SECRET_E2E_KEY" not in hist_raw
        assert "{{apiKey}}" in hist_raw

        # 6. Clear History
        res_del = await client.delete("/api/history", headers=auth_headers)
        assert res_del.status_code == 200
        assert res_del.json() == {"cleared": True}

        res_hist_after = await client.get("/api/history", headers=auth_headers)
        assert res_hist_after.json() == []

        # 7. Check Workspace Storage Integrity
        assert (
            workspace_path / ".piddi" / "collections" / f"col_{col_id.replace('col_', '')}.json"
        ).exists()
        assert (workspace_path / ".piddi" / "environments" / f"{env_id}.json").exists()
        assert (workspace_path / ".piddi" / "environments" / f"{env_id}.secrets.json").exists()
        assert (workspace_path / ".piddi" / ".gitignore").exists()

    set_history_manager(None)
