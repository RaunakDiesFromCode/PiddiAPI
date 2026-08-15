import re
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

from piddi.config import AppConfig
from piddi.models.history import HistoryRecord
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
)
from piddi.models.response import CanonicalResponseModel
from piddi.storage.environment_manager import EnvironmentFileManager
from piddi.storage.history import (
    HistoryManager,
    HistorySanitizer,
    get_history_manager,
    set_history_manager,
)


@pytest.fixture
def temp_history_file(tmp_path: Path) -> Path:
    """Provide an isolated temporary history.jsonl file."""
    history_file = tmp_path / "test_history.jsonl"
    manager = HistoryManager(history_file)
    set_history_manager(manager)
    yield history_file
    set_history_manager(None)


def test_history_id_format_12_hex():
    """Verify HistoryRecord generates IDs matching ^hist_[0-9a-f]{12}$."""
    record = HistoryRecord(
        method=HTTPMethod.GET,
        url="http://localhost:8000/api",
        status=200,
        duration_ms=10.0,
        size_bytes=100,
        request_snapshot=CanonicalRequestModel(url="http://localhost:8000/api"),
    )
    assert re.match(r"^hist_[0-9a-f]{12}$", record.id)
    assert (
        record.timestamp.endswith("+00:00")
        or record.timestamp.endswith("Z")
        or "T" in record.timestamp
    )


def test_history_literal_authorization_redacted():
    """Verify literal Authorization header is redacted to [REDACTED]."""
    req = CanonicalRequestModel(
        url="http://example.com/api",
        headers=[KeyValueItem(key="Authorization", value="Bearer secret_token_12345")],
        auth=AuthConfig(type=AuthType.BEARER, token="secret_token_12345"),
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert sanitized.headers[0].value == "[REDACTED]"
    assert sanitized.auth.token == "[REDACTED]"


def test_history_templated_authorization_preserved():
    """Verify templated Authorization header is preserved verbatim."""
    req = CanonicalRequestModel(
        url="http://example.com/api",
        headers=[KeyValueItem(key="Authorization", value="Bearer {{authToken}}")],
        auth=AuthConfig(type=AuthType.BEARER, token="{{authToken}}"),
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert sanitized.headers[0].value == "Bearer {{authToken}}"
    assert sanitized.auth.token == "{{authToken}}"


def test_history_literal_x_api_key_redacted():
    """Verify literal X-API-Key header is redacted."""
    req = CanonicalRequestModel(
        url="http://example.com/api",
        headers=[KeyValueItem(key="X-API-Key", value="live_key_99999")],
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert sanitized.headers[0].value == "[REDACTED]"


def test_history_literal_cookie_redacted():
    """Verify literal Cookie and Set-Cookie headers are redacted."""
    req = CanonicalRequestModel(
        url="http://example.com/api",
        headers=[
            KeyValueItem(key="Cookie", value="session_id=abc123xyz"),
            KeyValueItem(key="Set-Cookie", value="jwt=token123"),
        ],
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert sanitized.headers[0].value == "[REDACTED]"
    assert sanitized.headers[1].value == "[REDACTED]"


def test_history_literal_api_key_query_param_redacted():
    """Verify literal sensitive query params in params table and URL string are redacted."""
    req = CanonicalRequestModel(
        url="http://example.com/api?api_key=secret_in_url&page=1",
        params=[
            KeyValueItem(key="api_key", value="secret_in_params"),
            KeyValueItem(key="page", value="1"),
        ],
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert "api_key=%5BREDACTED%5D" in sanitized.url or "api_key=[REDACTED]" in sanitized.url
    assert "page=1" in sanitized.url
    assert sanitized.params[0].value == "[REDACTED]"
    assert sanitized.params[1].value == "1"


def test_history_templated_api_key_query_param_preserved():
    """Verify templated query params are preserved verbatim."""
    req = CanonicalRequestModel(
        url="http://example.com/api?api_key={{myApiKey}}&page=1",
        params=[
            KeyValueItem(key="api_key", value="{{myApiKey}}"),
        ],
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert (
        "api_key=%7B%7BmyApiKey%7D%7D" in sanitized.url or "api_key={{myApiKey}}" in sanitized.url
    )
    assert sanitized.params[0].value == "{{myApiKey}}"


def test_history_mixed_case_sensitive_names():
    """Verify case-insensitive matching on headers and query parameters."""
    req = CanonicalRequestModel(
        url="http://example.com/api?AcCeSs_ToKeN=my_token",
        headers=[
            KeyValueItem(key="x-ApI-kEy", value="secret1"),
            KeyValueItem(key="AUTH_TOKEN", value="secret2"),
            KeyValueItem(key="pRoXy-AuThOrIzAtIoN", value="Basic 123"),
            KeyValueItem(key="sEt-CoOkIe", value="sess=456"),
        ],
        params=[
            KeyValueItem(key="ClIeNt_SeCrEt", value="secret3"),
            KeyValueItem(key="PassWord", value="secret4"),
        ],
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    for h in sanitized.headers:
        assert h.value == "[REDACTED]"
    for p in sanitized.params:
        assert p.value == "[REDACTED]"
    assert (
        "AcCeSs_ToKeN=%5BREDACTED%5D" in sanitized.url or "AcCeSs_ToKeN=[REDACTED]" in sanitized.url
    )


def test_history_arbitrary_json_body_preserved_verbatim():
    """Verify arbitrary JSON body containing sensitive keys is preserved verbatim without alteration."""
    raw_body = '{\n  "password": "SuperSecretPassword123!",\n  "client_secret": "my_secret"\n}'
    req = CanonicalRequestModel(
        url="http://example.com/login",
        method=HTTPMethod.POST,
        body=RequestBody(type=BodyType.JSON, raw=raw_body),
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    assert sanitized.body.raw == raw_body


@pytest.mark.asyncio
async def test_history_resolved_environment_secret_never_persisted(
    app_client: httpx.AsyncClient,
    test_config: AppConfig,
    temp_history_file: Path,
):
    """Verify that executing a request with an active environment secret records only the template snapshot."""
    from piddi.models.environment import Environment, EnvironmentVariableDefinition

    # 1. Setup environment with secret
    env_id = "env_112233445566"
    env_obj = Environment(
        id=env_id,
        name="Secret Test Env",
        variables=[
            EnvironmentVariableDefinition(key="userPass", value=None, enabled=True, is_secret=True),
        ],
    )

    await EnvironmentFileManager.save_environment(
        test_config.workspace_path,
        env_obj,
    )
    await EnvironmentFileManager.set_secret(
        test_config.workspace_path, env_id, "userPass", "SUPER_SECRET_VALUE_999"
    )

    # 2. Execute request referencing {{userPass}}
    req_payload = {
        "method": "POST",
        "url": "http://127.0.0.1:4111/echo/get",
        "environment_id": env_id,
        "headers": [{"key": "X-Auth-Token", "value": "{{userPass}}", "enabled": True}],
        "body": {"type": "json", "raw": '{"token": "{{userPass}}"}'},
    }

    res = await app_client.post(
        "/api/execute",
        json=req_payload,
        headers={"X-Piddi-Token": test_config.session_token},
    )
    assert res.status_code == 200

    # Await pending history writes
    await get_history_manager().flush_pending_tasks(timeout=2.0)

    # 3. Inspect history file
    records = await get_history_manager().get_history()
    assert len(records) > 0
    rec = records[0]
    assert rec.request_snapshot.headers[0].value == "{{userPass}}"
    assert rec.request_snapshot.body.raw == '{"token": "{{userPass}}"}'

    # Ensure resolved secret was never written to history.jsonl
    file_content = temp_history_file.read_text(encoding="utf-8")
    assert "SUPER_SECRET_VALUE_999" not in file_content
    assert "{{userPass}}" in file_content


@pytest.mark.asyncio
async def test_history_writer_failure_does_not_fail_execute(
    app_client: httpx.AsyncClient,
    test_config: AppConfig,
    temp_history_file: Path,
):
    """Verify that if the history writer fails, POST /api/execute still returns the HTTP response successfully."""
    # Force append_record to fail with an OSError
    with patch.object(
        HistoryManager, "append_record", side_effect=OSError("Disk full or permission denied")
    ):
        req_payload = {
            "method": "GET",
            "url": "http://127.0.0.1:4111/echo/get",
        }
        res = await app_client.post(
            "/api/execute",
            json=req_payload,
            headers={"X-Piddi-Token": test_config.session_token},
        )
        assert res.status_code == 200
        data = res.json()
        assert "status" in data


@pytest.mark.asyncio
async def test_history_capping_200_and_pruning_at_250(temp_history_file: Path):
    """Verify writing 260 records automatically prunes the file to the newest 200 records."""
    manager = get_history_manager()

    for i in range(260):
        rec = HistoryRecord(
            method=HTTPMethod.GET,
            url=f"http://example.com/api/{i}",
            status=200,
            duration_ms=float(i),
            size_bytes=100,
            request_snapshot=CanonicalRequestModel(url=f"http://example.com/api/{i}"),
        )
        await manager.append_record(rec)

    # 1. get_history default limit=200 returns 200
    records = await manager.get_history(limit=200)
    assert len(records) == 200
    assert records[0].url == "http://example.com/api/259"
    assert records[-1].url == "http://example.com/api/60"

    # 2. Reading raw lines on disk after pruning confirms circular capping pruned the oldest 60
    raw_lines = temp_history_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(raw_lines) == 209  # 200 from prune at line 251 + 9 subsequent appends


@pytest.mark.asyncio
async def test_history_corrupted_json_lines_skipped(temp_history_file: Path):
    """Verify corrupted JSON lines in history.jsonl are silently skipped on read."""
    manager = get_history_manager()

    valid_rec_1 = HistoryRecord(
        method=HTTPMethod.GET,
        url="http://example.com/api/1",
        status=200,
        duration_ms=10.0,
        size_bytes=100,
        request_snapshot=CanonicalRequestModel(url="http://example.com/api/1"),
    )
    valid_rec_2 = HistoryRecord(
        method=HTTPMethod.POST,
        url="http://example.com/api/2",
        status=201,
        duration_ms=20.0,
        size_bytes=200,
        request_snapshot=CanonicalRequestModel(url="http://example.com/api/2"),
    )

    # Write valid, corrupted, empty, and invalid schema lines
    lines = [
        valid_rec_1.model_dump_json() + "\n",
        "{malformed_json_without_closing_brackets\n",
        "\n",
        '{"id": "hist_1", "invalid_schema": true}\n',
        valid_rec_2.model_dump_json() + "\n",
    ]
    temp_history_file.write_text("".join(lines), encoding="utf-8")

    records = await manager.get_history()
    assert len(records) == 2
    assert records[0].url == "http://example.com/api/2"
    assert records[1].url == "http://example.com/api/1"


@pytest.mark.asyncio
async def test_history_get_and_delete_endpoints(
    app_client: httpx.AsyncClient,
    test_config: AppConfig,
    temp_history_file: Path,
):
    """Verify GET /api/history and DELETE /api/history endpoints."""
    manager = get_history_manager()
    rec = HistoryRecord(
        method=HTTPMethod.GET,
        url="http://example.com/test",
        status=200,
        duration_ms=15.0,
        size_bytes=50,
        request_snapshot=CanonicalRequestModel(url="http://example.com/test"),
    )
    await manager.append_record(rec)

    # 1. GET /api/history
    res = await app_client.get(
        "/api/history",
        headers={"X-Piddi-Token": test_config.session_token},
    )
    assert res.status_code == 200
    records = res.json()
    assert len(records) == 1
    assert records[0]["url"] == "http://example.com/test"

    # 2. DELETE /api/history
    res_del = await app_client.delete(
        "/api/history",
        headers={"X-Piddi-Token": test_config.session_token},
    )
    assert res_del.status_code == 200
    assert res_del.json() == {"cleared": True}

    # Verify history empty
    res_after = await app_client.get(
        "/api/history",
        headers={"X-Piddi-Token": test_config.session_token},
    )
    assert res_after.status_code == 200
    assert res_after.json() == []


def test_history_restoration_template_executable():
    """Verify restoring a templated history snapshot produces an executable model."""
    req = CanonicalRequestModel(
        url="http://example.com/users",
        headers=[KeyValueItem(key="Authorization", value="Bearer {{token}}")],
        auth=AuthConfig(type=AuthType.BEARER, token="{{token}}"),
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    record = HistoryRecord(
        method=req.method,
        url=req.url,
        status=200,
        duration_ms=12.0,
        size_bytes=100,
        request_snapshot=sanitized,
    )

    restored = record.request_snapshot
    assert "{{token}}" in restored.headers[0].value
    assert restored.auth.token == "{{token}}"


def test_history_restoration_literal_redacted():
    """Verify restoring a redacted literal snapshot retains [REDACTED] in credential fields."""
    req = CanonicalRequestModel(
        url="http://example.com/users",
        headers=[KeyValueItem(key="X-API-Key", value="secret123")],
        auth=AuthConfig(type=AuthType.BEARER, token="secret123"),
    )
    sanitized = HistorySanitizer.sanitize_request(req)
    record = HistoryRecord(
        method=req.method,
        url=req.url,
        status=200,
        duration_ms=12.0,
        size_bytes=100,
        request_snapshot=sanitized,
    )

    restored = record.request_snapshot
    assert restored.headers[0].value == "[REDACTED]"
    assert restored.auth.token == "[REDACTED]"


@pytest.mark.asyncio
async def test_history_graceful_shutdown_task_flush(temp_history_file: Path):
    """Verify flush_pending_tasks() awaits and flushes in-flight history writes during shutdown."""
    manager = get_history_manager()
    req = CanonicalRequestModel(url="http://example.com/flush-test")
    res = CanonicalResponseModel(
        status=200,
        status_text="OK",
        headers={},
        cookies={},
        body="",
        content_type="text/plain",
        size_bytes=10,
        duration_ms=5.0,
    )

    # Schedule write
    task = manager.schedule_record(req, res)
    assert task in manager._pending_tasks

    # Flush on shutdown
    await manager.flush_pending_tasks(timeout=2.0)
    assert len(manager._pending_tasks) == 0

    records = await manager.get_history()
    assert len(records) == 1
    assert records[0].url == "http://example.com/flush-test"
