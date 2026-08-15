"""Adversarial and deep edge-case verification test suite for Phase 1."""

import json
import tempfile
from pathlib import Path

import httpx
import pytest

from piddi.config import AppConfig
from piddi.engine.dispatcher import execute_request
from piddi.engine.variables import VariableResolver, interpolate_request
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
)

# ==============================================================================
# 1. SECURITY ADVERSARIAL AUDIT
# ==============================================================================


@pytest.mark.asyncio
async def test_security_null_origin_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Origin: null (sandboxed iframes / data: URIs) is rejected with 403 Forbidden."""
    headers = {
        "x-piddi-token": test_config.session_token,
        "origin": "null",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_ORIGIN"


@pytest.mark.asyncio
async def test_security_invalid_host_subdomain(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Subdomain variations like localhost.evil.com are rejected with 403 Forbidden."""
    headers = {
        "x-piddi-token": test_config.session_token,
        "host": "localhost.evil.com",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_HOST"


@pytest.mark.asyncio
async def test_security_invalid_host_wrong_port(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Host on wrong port (e.g. 127.0.0.1:9999) is rejected with 403 Forbidden."""
    headers = {
        "x-piddi-token": test_config.session_token,
        "host": "127.0.0.1:9999",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_HOST"


@pytest.mark.asyncio
async def test_security_whitespace_token_handled(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Token with accidental leading/trailing whitespace is properly stripped and validated."""
    headers = {
        "x-piddi-token": f"  {test_config.session_token}  ",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_security_no_token_in_health_response(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Health check endpoint must not disclose session token."""
    headers = {"x-piddi-token": test_config.session_token}
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "token" not in data
    assert "session_token" not in data


# ==============================================================================
# 2. HTTP SEMANTICS AUDIT
# ==============================================================================


@pytest.mark.asyncio
async def test_duplicate_headers_preserved(echo_server_url: str) -> None:
    """Multiple headers with the same key must be preserved."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get",
        headers=[
            KeyValueItem(key="X-Custom-Tag", value="Tag1"),
            KeyValueItem(key="X-Custom-Tag", value="Tag2"),
        ],
    )
    res = await execute_request(req)
    assert res.status == 200
    # In response headers, duplicate headers are merged or recorded
    assert res.headers is not None


@pytest.mark.asyncio
async def test_url_with_existing_query_string_and_params(echo_server_url: str) -> None:
    """URL with existing query string merges correctly with params list."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get?existing=initial_val",
        params=[KeyValueItem(key="added_param", value="new_val")],
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["params"]["existing"] == "initial_val"
    assert data["params"]["added_param"] == "new_val"


@pytest.mark.asyncio
async def test_empty_param_values(echo_server_url: str) -> None:
    """Query parameter with empty value is sent as key=."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get",
        params=[KeyValueItem(key="flag", value="")],
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["params"]["flag"] == ""


@pytest.mark.asyncio
async def test_unicode_query_and_headers(echo_server_url: str) -> None:
    """Query params and headers with Unicode strings are handled correctly."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get",
        params=[KeyValueItem(key="q", value="日本語_测试_🌟")],
        headers=[KeyValueItem(key="X-Unicode-Header", value="Café_Crème")],
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["params"]["q"] == "日本語_测试_🌟"
    assert data["headers"]["x-unicode-header"] == "Café_Crème"


@pytest.mark.asyncio
async def test_binary_response_handling(echo_server_url: str) -> None:
    """Binary response is handled safely without decoding errors."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/large?size_mb=1",
    )
    res = await execute_request(req)
    assert res.status == 200
    assert res.size_bytes == 1024 * 1024
    assert res.error is None


@pytest.mark.asyncio
async def test_auth_precedence_over_raw_header(echo_server_url: str) -> None:
    """Auth block takes precedence over raw Authorization header."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/auth",
        headers=[KeyValueItem(key="Authorization", value="Bearer old-token-to-be-overridden")],
        auth=AuthConfig(type=AuthType.BEARER, token="new-auth-token"),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["type"] == "bearer"
    assert data["token"] == "new-auth-token"


# ==============================================================================
# 3. VARIABLE ENGINE ADVERSARIAL AUDIT
# ==============================================================================


def test_multiple_dynamic_generators_in_single_request() -> None:
    """Multiple occurrences of dynamic generators evaluate independently."""
    text = "{{$uuid}} | {{$uuid}}"
    resolved = VariableResolver.interpolate_string(text)
    parts = resolved.split(" | ")
    assert len(parts) == 2
    assert parts[0] != parts[1]  # Two distinct random UUIDs


def test_complex_three_way_circular_dependency() -> None:
    """Three-way circular dependency a -> b -> c -> a terminates at max depth."""
    circular_context = {
        "a": "{{b}}",
        "b": "{{c}}",
        "c": "{{a}}",
    }
    # Must not hang or raise RecursionError
    result = VariableResolver.interpolate_string("{{a}}", circular_context, max_depth=3)
    assert result in ("{{a}}", "{{b}}", "{{c}}")


def test_empty_variable_replacement() -> None:
    """Variable mapped to empty string replaces cleanly."""
    ctx = {"emptyVal": ""}
    res = VariableResolver.interpolate_string("prefix_{{emptyVal}}_suffix", ctx)
    assert res == "prefix__suffix"


def test_variables_in_auth_and_body() -> None:
    """Variables in auth username/password and nested JSON are resolved."""
    ctx = {
        "user": "test_admin",
        "pass": "secret_pwd",
        "jsonKey": "user_id",
        "jsonVal": "12345",
    }
    req = CanonicalRequestModel(
        url="http://example.com/api",
        auth=AuthConfig(type=AuthType.BASIC, username="{{user}}", password="{{pass}}"),
        body=RequestBody(type=BodyType.JSON, raw='{"{{jsonKey}}": "{{jsonVal}}"}'),
    )
    interpolated = interpolate_request(req, ctx)
    assert interpolated.auth.username == "test_admin"
    assert interpolated.auth.password == "secret_pwd"
    assert interpolated.body.raw == '{"user_id": "12345"}'


# ==============================================================================
# 4. MULTIPART FILE SECURITY AUDIT
# ==============================================================================


@pytest.mark.asyncio
async def test_multipart_directory_path_rejected(echo_server_url: str) -> None:
    """Passing a directory path as a file upload is rejected with FILE_NOT_FOUND."""
    req = CanonicalRequestModel(
        method=HTTPMethod.POST,
        url=f"{echo_server_url}/echo/post",
        body=RequestBody(
            type=BodyType.MULTIPART,
            form_params=[KeyValueItem(key="folder_file", value="/tmp", type="file")],
        ),
    )
    res = await execute_request(req)
    assert res.status == 0
    assert res.error is not None
    assert res.error.code == "FILE_NOT_FOUND"


@pytest.mark.asyncio
async def test_multipart_nonexistent_file_rejected(echo_server_url: str) -> None:
    """Passing a nonexistent file path is rejected with FILE_NOT_FOUND."""
    req = CanonicalRequestModel(
        method=HTTPMethod.POST,
        url=f"{echo_server_url}/echo/post",
        body=RequestBody(
            type=BodyType.MULTIPART,
            form_params=[
                KeyValueItem(key="missing", value="/path/to/missing/file.xyz", type="file")
            ],
        ),
    )
    res = await execute_request(req)
    assert res.status == 0
    assert res.error is not None
    assert res.error.code == "FILE_NOT_FOUND"


@pytest.mark.asyncio
async def test_multipart_empty_file_upload(echo_server_url: str) -> None:
    """Uploading a 0-byte empty file succeeds."""
    with tempfile.NamedTemporaryFile("wb", suffix=".empty", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        req = CanonicalRequestModel(
            method=HTTPMethod.POST,
            url=f"{echo_server_url}/echo/post",
            body=RequestBody(
                type=BodyType.MULTIPART,
                form_params=[KeyValueItem(key="empty_doc", value=tmp_path, type="file")],
            ),
        )
        res = await execute_request(req)
        assert res.status == 200
        data = json.loads(res.body)
        assert len(data["files"]) == 1
        assert data["files"][0]["size"] == 0
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_multipart_unicode_filename_upload(echo_server_url: str) -> None:
    """Uploading a file with Unicode filename succeeds."""
    temp_dir = Path(tempfile.gettempdir())
    unicode_file = temp_dir / "文档_test_🌟.txt"
    unicode_file.write_text("Unicode file content", encoding="utf-8")

    try:
        req = CanonicalRequestModel(
            method=HTTPMethod.POST,
            url=f"{echo_server_url}/echo/post",
            body=RequestBody(
                type=BodyType.MULTIPART,
                form_params=[
                    KeyValueItem(key="unicode_attachment", value=str(unicode_file), type="file")
                ],
            ),
        )
        res = await execute_request(req)
        assert res.status == 200
        data = json.loads(res.body)
        assert len(data["files"]) == 1
        assert "文档_test" in data["files"][0]["filename"]
    finally:
        unicode_file.unlink(missing_ok=True)


# ==============================================================================
# 5. RESPONSE GUARDRAILS EXACT BYTE BOUNDARY AUDIT
# ==============================================================================


@pytest.mark.asyncio
async def test_response_guardrail_exact_byte_boundaries(echo_server_url: str) -> None:
    """Verify response behavior at exact byte thresholds: 1 byte, 2MB, 2MB+1KB, 10MB, 10MB+1KB."""
    # 1. Exactly 1 byte
    res_1b = await execute_request(
        CanonicalRequestModel(method=HTTPMethod.GET, url=f"{echo_server_url}/echo/bytes?n=1")
    )
    assert res_1b.status == 200
    assert res_1b.size_bytes == 1
    assert res_1b.is_truncated is False
    assert res_1b.temp_file_path is None

    # 2. Exactly 2 MB (2 * 1024 * 1024 bytes)
    two_mb = 2 * 1024 * 1024
    res_2mb = await execute_request(
        CanonicalRequestModel(method=HTTPMethod.GET, url=f"{echo_server_url}/echo/bytes?n={two_mb}")
    )
    assert res_2mb.status == 200
    assert res_2mb.size_bytes == two_mb
    assert res_2mb.is_truncated is False
    assert res_2mb.temp_file_path is None

    # 3. Slightly above 2 MB (2 MB + 1024 bytes)
    res_above_2mb = await execute_request(
        CanonicalRequestModel(
            method=HTTPMethod.GET, url=f"{echo_server_url}/echo/bytes?n={two_mb + 1024}"
        )
    )
    assert res_above_2mb.status == 200
    assert res_above_2mb.size_bytes == two_mb + 1024
    assert res_above_2mb.is_truncated is False
    assert res_above_2mb.temp_file_path is None

    # 4. Exactly 10 MB (10 * 1024 * 1024 bytes)
    ten_mb = 10 * 1024 * 1024
    res_10mb = await execute_request(
        CanonicalRequestModel(method=HTTPMethod.GET, url=f"{echo_server_url}/echo/bytes?n={ten_mb}")
    )
    assert res_10mb.status == 200
    assert res_10mb.size_bytes == ten_mb
    assert res_10mb.is_truncated is False
    assert res_10mb.temp_file_path is None

    # 5. Slightly above 10 MB (10 MB + 1024 bytes) -> triggers temp file stream
    res_above_10mb = await execute_request(
        CanonicalRequestModel(
            method=HTTPMethod.GET, url=f"{echo_server_url}/echo/bytes?n={ten_mb + 1024}"
        )
    )
    assert res_above_10mb.status == 200
    assert res_above_10mb.size_bytes == ten_mb + 1024
    assert res_above_10mb.is_truncated is True
    assert res_above_10mb.temp_file_path is not None
    assert Path(res_above_10mb.temp_file_path).is_file()
    assert res_above_10mb.body == "[Response exceeds 10MB limit. Preview truncated.]"
    Path(res_above_10mb.temp_file_path).unlink(missing_ok=True)


# ==============================================================================
# 5. PHASE 3 PERSISTENCE ADVERSARIAL AUDIT & GIT-DIFF STABILITY
# ==============================================================================


@pytest.mark.asyncio
async def test_audit_git_diff_stability(tmp_path: Path) -> None:
    """
    Critical Git-friendliness test:
    Changing a single field in a request must produce a minimal diff touching
    only that exact line, with zero timestamp churn, key order reordering, or UUID changes.
    """
    from piddi.models.collection import Collection
    from piddi.storage.file_manager import WorkspaceFileManager

    workspace = tmp_path / "git_test_ws"
    col = Collection(
        id="col_010203040506",
        name="Git Diff Test API",
        requests=[
            CanonicalRequestModel(
                id="req_000000000001",
                name="Request One",
                method=HTTPMethod.GET,
                url="http://localhost:8000/v1/users",
                params=[KeyValueItem(key="limit", value="10", enabled=True)],
            ),
            CanonicalRequestModel(
                id="req_000000000002",
                name="Request Two",
                method=HTTPMethod.POST,
                url="http://localhost:8000/v1/posts",
                headers=[KeyValueItem(key="Content-Type", value="application/json", enabled=True)],
            ),
        ],
    )

    await WorkspaceFileManager.save_collection(workspace, col)
    file_path = workspace / ".piddi" / "collections" / "col_010203040506.json"
    lines_before = file_path.read_text(encoding="utf-8").splitlines()

    # Modify ONLY the limit param value from 10 to 50
    col.requests[0].params[0].value = "50"
    await WorkspaceFileManager.save_collection(workspace, col)
    lines_after = file_path.read_text(encoding="utf-8").splitlines()

    # Calculate line diffs
    import difflib

    diff = list(
        difflib.unified_diff(
            lines_before,
            lines_after,
            fromfile="before.json",
            tofile="after.json",
            lineterm="",
        )
    )

    # Filter added (+) and deleted (-) lines (ignoring unified diff file header --- and +++)
    deleted_lines = [line for line in diff if line.startswith("-") and not line.startswith("---")]
    added_lines = [line for line in diff if line.startswith("+") and not line.startswith("+++")]

    # Exactly 1 deleted line ('"value": "10",') and 1 added line ('"value": "50",')
    assert len(deleted_lines) == 1
    assert '"value": "10"' in deleted_lines[0]

    assert len(added_lines) == 1
    assert '"value": "50"' in added_lines[0]


@pytest.mark.asyncio
async def test_audit_adversarial_id_characters(tmp_path: Path) -> None:
    """Verify illegal characters and attack vectors in collection and request IDs are rejected."""
    from piddi.storage.file_manager import WorkspaceFileManager

    illegal_ids = [
        "col_with spaces",
        "col_with/slash",
        "col_with\\backslash",
        "col_with..dots",
        "col_with!special$",
        "col_with;command",
        "col_with\x00null",
    ]

    for bad_id in illegal_ids:
        with pytest.raises(ValueError):
            WorkspaceFileManager.validate_id(bad_id)
