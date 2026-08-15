"""Comprehensive tests for the HTTP execution dispatcher and API execute endpoint."""

import json
import tempfile
from pathlib import Path

import httpx
import pytest

from piddi.config import AppConfig
from piddi.engine.dispatcher import execute_request
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
    RequestSettings,
)


@pytest.mark.asyncio
async def test_http_methods(echo_server_url: str) -> None:
    """Verify all supported HTTP verbs execute correctly."""
    methods = [
        HTTPMethod.GET,
        HTTPMethod.POST,
        HTTPMethod.PUT,
        HTTPMethod.PATCH,
        HTTPMethod.DELETE,
    ]

    for method in methods:
        endpoint = "/echo/get" if method == HTTPMethod.GET else "/echo/post"
        req = CanonicalRequestModel(
            method=method,
            url=f"{echo_server_url}{endpoint}",
        )
        res = await execute_request(req)
        assert res.status == 200
        assert res.error is None
        assert res.duration_ms > 0
        data = json.loads(res.body)
        assert data["method"] == method.value

    # HEAD request: body is empty but headers are present
    req_head = CanonicalRequestModel(
        method=HTTPMethod.HEAD,
        url=f"{echo_server_url}/echo/get",
    )
    res_head = await execute_request(req_head)
    assert res_head.status == 200
    assert res_head.error is None
    assert res_head.body == ""

    # OPTIONS request: headers inspected
    req_options = CanonicalRequestModel(
        method=HTTPMethod.OPTIONS,
        url=f"{echo_server_url}/echo/options",
    )
    res_options = await execute_request(req_options)
    assert res_options.status == 200
    assert res_options.error is None
    assert "x-options-test" in res_options.headers


@pytest.mark.asyncio
async def test_query_params(echo_server_url: str) -> None:
    """Verify query parameters and enabled toggles."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get",
        params=[
            KeyValueItem(key="search", value="hello world"),
            KeyValueItem(key="page", value="2"),
            KeyValueItem(key="disabled_param", value="ignored", enabled=False),
        ],
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["params"]["search"] == "hello world"
    assert data["params"]["page"] == "2"
    assert "disabled_param" not in data["params"]


@pytest.mark.asyncio
async def test_custom_headers(echo_server_url: str) -> None:
    """Verify custom headers and enabled toggles."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/get",
        headers=[
            KeyValueItem(key="X-Custom-Header", value="CustomValue123"),
            KeyValueItem(key="X-Disabled-Header", value="None", enabled=False),
        ],
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["headers"]["x-custom-header"] == "CustomValue123"
    assert "x-disabled-header" not in data["headers"]


@pytest.mark.asyncio
async def test_auth_bearer(echo_server_url: str) -> None:
    """Verify Bearer token auth header injection."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/auth",
        auth=AuthConfig(type=AuthType.BEARER, token="my-secret-jwt-token"),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["type"] == "bearer"
    assert data["token"] == "my-secret-jwt-token"


@pytest.mark.asyncio
async def test_auth_basic(echo_server_url: str) -> None:
    """Verify Basic auth header base64 encoding."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/auth",
        auth=AuthConfig(type=AuthType.BASIC, username="aladdin", password="opensesame"),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["type"] == "basic"
    assert data["username"] == "aladdin"
    assert data["password"] == "opensesame"


@pytest.mark.asyncio
async def test_auth_apikey_header(echo_server_url: str) -> None:
    """Verify API Key injection into request headers."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/auth",
        auth=AuthConfig(
            type=AuthType.API_KEY,
            key="x-api-key",
            value="key_12345",
            placement="header",
        ),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["type"] == "apikey"
    assert data["placement"] == "header"
    assert data["value"] == "key_12345"


@pytest.mark.asyncio
async def test_auth_apikey_query(echo_server_url: str) -> None:
    """Verify API Key injection into query parameters."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/auth",
        auth=AuthConfig(
            type=AuthType.API_KEY,
            key="api_key",
            value="query_secret_key",
            placement="query",
        ),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["type"] == "apikey"
    assert data["placement"] == "query"
    assert data["value"] == "query_secret_key"


@pytest.mark.asyncio
async def test_body_json(echo_server_url: str) -> None:
    """Verify JSON body transmission and content-type header."""
    payload = {"name": "Alice", "tags": ["admin", "developer"], "active": True}
    req = CanonicalRequestModel(
        method=HTTPMethod.POST,
        url=f"{echo_server_url}/echo/post",
        body=RequestBody(type=BodyType.JSON, raw=json.dumps(payload)),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert "application/json" in data["headers"]["content-type"]
    assert data["json"] == payload


@pytest.mark.asyncio
async def test_body_urlencoded(echo_server_url: str) -> None:
    """Verify URL-encoded form data transmission."""
    req = CanonicalRequestModel(
        method=HTTPMethod.POST,
        url=f"{echo_server_url}/echo/post",
        body=RequestBody(
            type=BodyType.FORM_URLENCODED,
            form_params=[
                KeyValueItem(key="username", value="dev_user"),
                KeyValueItem(key="grant_type", value="password"),
            ],
        ),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert "application/x-www-form-urlencoded" in data["headers"]["content-type"]
    assert data["form"]["username"] == "dev_user"
    assert data["form"]["grant_type"] == "password"


@pytest.mark.asyncio
async def test_body_multipart(echo_server_url: str) -> None:
    """Verify multipart form-data upload with text fields and file attachments."""
    with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False) as tmp_file:
        tmp_file.write("Sample test file content for multipart upload.")
        tmp_path = tmp_file.name

    try:
        req = CanonicalRequestModel(
            method=HTTPMethod.POST,
            url=f"{echo_server_url}/echo/post",
            body=RequestBody(
                type=BodyType.MULTIPART,
                form_params=[
                    KeyValueItem(key="title", value="Document Title", type="text"),
                    KeyValueItem(key="attachment", value=tmp_path, type="file"),
                ],
            ),
        )
        res = await execute_request(req)
        assert res.status == 200
        data = json.loads(res.body)
        assert "multipart/form-data" in data["headers"]["content-type"]
        assert data["form"]["title"] == "Document Title"
        assert len(data["files"]) == 1
        assert data["files"][0]["key"] == "attachment"
        assert data["files"][0]["filename"] == Path(tmp_path).name
        assert data["files"][0]["preview"] == "Sample test file content for multipart upload."
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_body_raw(echo_server_url: str) -> None:
    """Verify raw text payload transmission."""
    req = CanonicalRequestModel(
        method=HTTPMethod.POST,
        url=f"{echo_server_url}/echo/post",
        headers=[KeyValueItem(key="Content-Type", value="text/plain")],
        body=RequestBody(type=BodyType.RAW, raw="RAW_STRING_CONTENT_12345"),
    )
    res = await execute_request(req)
    assert res.status == 200
    data = json.loads(res.body)
    assert data["raw_body"] == "RAW_STRING_CONTENT_12345"


@pytest.mark.asyncio
async def test_redirect_following(echo_server_url: str) -> None:
    """Verify follow_redirects toggle."""
    # When follow_redirects is True
    req_follow = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/redirect",
        settings=RequestSettings(follow_redirects=True),
    )
    res_follow = await execute_request(req_follow)
    assert res_follow.status == 200
    data = json.loads(res_follow.body)
    assert data["params"]["redirected"] == "true"

    # When follow_redirects is False
    req_no_follow = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/redirect",
        settings=RequestSettings(follow_redirects=False),
    )
    res_no_follow = await execute_request(req_no_follow)
    assert res_no_follow.status == 302


@pytest.mark.asyncio
async def test_timeout_handling(echo_server_url: str) -> None:
    """Verify timeout error handling when endpoint latency exceeds timeout_ms."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/delay?ms=500",
        settings=RequestSettings(timeout_ms=100),
    )
    res = await execute_request(req)
    assert res.status == 0
    assert res.status_text == "Error"
    assert res.error is not None
    assert res.error.code == "REQUEST_TIMEOUT"


@pytest.mark.asyncio
async def test_response_payload_guardrails(echo_server_url: str) -> None:
    """Verify response size guardrails and >10MB temp file streaming."""
    # 1. Normal payload (<= 2MB)
    req_normal = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/large?size_mb=1",
    )
    res_normal = await execute_request(req_normal)
    assert res_normal.status == 200
    assert res_normal.is_truncated is False
    assert res_normal.size_bytes == 1 * 1024 * 1024
    assert res_normal.temp_file_path is None

    # 2. Large payload (> 10MB: 12MB)
    req_large = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/large?size_mb=12",
    )
    res_large = await execute_request(req_large)
    assert res_large.status == 200
    assert res_large.is_truncated is True
    assert res_large.size_bytes == 12 * 1024 * 1024
    assert res_large.temp_file_path is not None
    assert Path(res_large.temp_file_path).is_file()
    assert res_large.body == "[Response exceeds 10MB limit. Preview truncated.]"
    # Clean up temp file
    Path(res_large.temp_file_path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_error_handling_graceful() -> None:
    """Verify graceful error reporting for connection refused and invalid URLs."""
    # 1. Invalid URL scheme
    req_invalid_url = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url="ftp://invalid-scheme.example.com",
    )
    res_invalid_url = await execute_request(req_invalid_url)
    assert res_invalid_url.status == 0
    assert res_invalid_url.error is not None
    assert res_invalid_url.error.code == "INVALID_URL"

    # 2. Connection refused (closed port)
    req_refused = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url="http://127.0.0.1:59998/closed",
        settings=RequestSettings(timeout_ms=2000),
    )
    res_refused = await execute_request(req_refused)
    assert res_refused.status == 0
    assert res_refused.error is not None
    assert res_refused.error.code == "CONNECTION_REFUSED"


@pytest.mark.asyncio
async def test_execute_via_api_endpoint(
    app_client: httpx.AsyncClient,
    test_config: AppConfig,
    echo_server_url: str,
) -> None:
    """Verify end-to-end execution through the FastAPI POST /api/execute endpoint."""
    headers = {
        "x-piddi-token": test_config.session_token,
        "origin": f"http://127.0.0.1:{test_config.port}",
    }
    req_payload = {
        "method": "POST",
        "url": f"{echo_server_url}/echo/post",
        "headers": [{"key": "X-Engine-Test", "value": "FastAPIOk", "enabled": True}],
        "body": {
            "type": "json",
            "raw": json.dumps({"test_id": "api_exec_123"}),
        },
    }

    res = await app_client.post("/api/execute", json=req_payload, headers=headers)
    assert res.status_code == 200
    canonical_res = res.json()
    assert canonical_res["status"] == 200
    assert canonical_res["error"] is None
    data = json.loads(canonical_res["body"])
    assert data["headers"]["x-engine-test"] == "FastAPIOk"
    assert data["json"]["test_id"] == "api_exec_123"


@pytest.mark.asyncio
async def test_response_payload_too_large(echo_server_url: str) -> None:
    """Verify that payloads exceeding the max allowed threshold return PAYLOAD_TOO_LARGE."""
    from piddi.config import get_config

    config = get_config()
    orig_limit = config.max_payload_size_bytes
    # Temporarily set limit to 2MB for testing decompression bomb guardrail
    config.max_payload_size_bytes = 2 * 1024 * 1024
    try:
        req = CanonicalRequestModel(
            method=HTTPMethod.GET,
            url=f"{echo_server_url}/echo/large?size_mb=4",
        )
        res = await execute_request(req)
        assert res.status == 0
        assert res.error is not None
        assert res.error.code == "PAYLOAD_TOO_LARGE"
    finally:
        config.max_payload_size_bytes = orig_limit


@pytest.mark.asyncio
async def test_timing_metrics_recorded(echo_server_url: str) -> None:
    """Verify timing metrics are recorded accurately without fabrication."""
    req = CanonicalRequestModel(
        method=HTTPMethod.GET,
        url=f"{echo_server_url}/echo/delay?ms=50",
    )
    res = await execute_request(req)
    assert res.status == 200
    assert res.duration_ms >= 40.0
    assert res.timing is not None
    assert res.timing.ttfb_ms >= 0.0
    assert res.timing.transfer_ms >= 0.0
