"""HTTPX Request Dispatcher and Connection Management."""

import asyncio
import base64
import http
import mimetypes
import os
import stat
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit, urlunsplit

import aiofiles
import httpx


def _encode_headers(headers: list[tuple[str, str]]) -> list[tuple[bytes, bytes]]:
    """Encode headers to bytes preserving latin-1 and utf-8 values without ASCII codec failures."""
    encoded: list[tuple[bytes, bytes]] = []
    for k, v in headers:
        k_bytes = k.strip().encode("ascii", errors="replace")
        try:
            v_bytes = v.encode("latin-1")
        except UnicodeEncodeError:
            v_bytes = v.encode("utf-8")
        encoded.append((k_bytes, v_bytes))
    return encoded


from piddi.config import get_config
from piddi.engine.variables import interpolate_request
from piddi.models.request import AuthType, BodyType, CanonicalRequestModel
from piddi.models.response import CanonicalResponseModel, ResponseError, TimingMetrics

MAX_PREVIEW_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ALLOWED_BYTES = 50 * 1024 * 1024  # 50 MB


class HTTPClientManager:
    """Manages the shared HTTPX async client connection pool."""

    def __init__(self) -> None:
        self._clients: dict[tuple[bool, float, int], httpx.AsyncClient] = {}

    def get_client(
        self, verify_ssl: bool = True, timeout_seconds: float = 30.0
    ) -> httpx.AsyncClient:
        """Retrieve or initialize a pooled HTTPX AsyncClient matching SSL and timeout requirements."""
        try:
            loop_id = id(asyncio.get_running_loop())
        except RuntimeError:
            loop_id = 0
        key = (verify_ssl, timeout_seconds, loop_id)
        client = self._clients.get(key)
        if client is None or client.is_closed:
            limits = httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=30.0,
            )
            client = httpx.AsyncClient(
                verify=verify_ssl,
                timeout=httpx.Timeout(timeout_seconds, connect=10.0),
                limits=limits,
                http2=True,
                follow_redirects=False,
            )
            self._clients[key] = client
        return client

    async def close(self) -> None:
        """Close all open pooled HTTPX AsyncClients."""
        for client in self._clients.values():
            if not client.is_closed:
                await client.aclose()
        self._clients.clear()


_client_manager: HTTPClientManager | None = None


def get_client_manager() -> HTTPClientManager:
    """Get the singleton HTTPClientManager."""
    global _client_manager
    if _client_manager is None:
        _client_manager = HTTPClientManager()
    return _client_manager


class _TraceRecorder:
    """Records network event timestamps using httpcore trace hooks without fabricating numbers."""

    def __init__(self) -> None:
        self.tcp_connect_start: float | None = None
        self.tcp_connect_end: float | None = None
        self.tls_start: float | None = None
        self.tls_end: float | None = None

    async def __call__(self, event_name: str, info: dict[str, Any]) -> None:
        now = time.perf_counter()
        if event_name == "connection.connect_tcp.started":
            self.tcp_connect_start = now
        elif event_name == "connection.connect_tcp.complete":
            self.tcp_connect_end = now
        elif event_name == "connection.start_tls.started":
            self.tls_start = now
        elif event_name == "connection.start_tls.complete":
            self.tls_end = now

    def calculate_metrics(self, ttfb_ms: float, transfer_ms: float) -> TimingMetrics:
        connect_ms = 0.0
        if self.tcp_connect_start is not None and self.tcp_connect_end is not None:
            connect_ms = max(0.0, (self.tcp_connect_end - self.tcp_connect_start) * 1000.0)

        tls_ms = 0.0
        if self.tls_start is not None and self.tls_end is not None:
            tls_ms = max(0.0, (self.tls_end - self.tls_start) * 1000.0)

        return TimingMetrics(
            dns_ms=0.0,  # DNS time reported as 0.0 when not separated by OS resolver
            connect_ms=round(connect_ms, 2),
            tls_ms=round(tls_ms, 2),
            ttfb_ms=round(ttfb_ms, 2),
            transfer_ms=round(transfer_ms, 2),
        )


async def execute_request(
    raw_request: CanonicalRequestModel,
    variables: dict[str, str] | None = None,
) -> CanonicalResponseModel:
    """Execute an HTTP request according to the canonical specification and return a CanonicalResponseModel."""
    # 1. Variable interpolation
    request = interpolate_request(raw_request, variables)

    # 2. Build URL and query parameters
    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        return CanonicalResponseModel(
            status=0,
            status_text="Error",
            body="",
            duration_ms=0.0,
            error=ResponseError(
                code="INVALID_URL",
                message="Invalid URL: Please provide a valid HTTP or HTTPS address.",
            ),
        )

    parsed_url = urlsplit(url)
    base_url = urlunsplit(
        (parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", parsed_url.fragment)
    )
    existing_params = parse_qsl(parsed_url.query, keep_blank_values=True)

    explicit_params: list[tuple[str, str]] = [
        (param.key, param.value) for param in request.params if param.enabled and param.key
    ]

    # Handle API Key query param placement
    if (
        request.auth.type == AuthType.API_KEY
        and request.auth.placement == "query"
        and request.auth.key
    ):
        explicit_params.append((request.auth.key, request.auth.value or ""))

    combined_params = existing_params + explicit_params

    # 3. Build Headers (preserve multi-value header order)
    headers_list: list[tuple[str, str]] = [
        (header.key, header.value) for header in request.headers if header.enabled and header.key
    ]

    # Handle Auth headers (override or append)
    if request.auth.type == AuthType.BEARER and request.auth.token:
        headers_list = [(k, v) for k, v in headers_list if k.lower() != "authorization"]
        headers_list.append(("Authorization", f"Bearer {request.auth.token}"))
    elif request.auth.type == AuthType.BASIC:
        user = request.auth.username or ""
        pwd = request.auth.password or ""
        user_pass = f"{user}:{pwd}".encode()
        encoded = base64.b64encode(user_pass).decode("ascii")
        headers_list = [(k, v) for k, v in headers_list if k.lower() != "authorization"]
        headers_list.append(("Authorization", f"Basic {encoded}"))
    elif (
        request.auth.type == AuthType.API_KEY
        and request.auth.placement == "header"
        and request.auth.key
    ):
        headers_list.append((request.auth.key, request.auth.value or ""))

    # 4. Prepare Body
    content: bytes | None = None
    data: dict[str, Any] | None = None
    files: list[tuple[str, tuple[str | None, Any, str | None]]] | None = None

    if request.method not in ("GET", "HEAD"):
        if request.body.type == BodyType.JSON:
            content = request.body.raw.encode("utf-8")
            if not any(k.lower() == "content-type" for k, _ in headers_list):
                headers_list.append(("Content-Type", "application/json; charset=utf-8"))
        elif request.body.type == BodyType.FORM_URLENCODED:
            data = {
                param.key: param.value
                for param in request.body.form_params
                if param.enabled and param.key
            }
            if not any(k.lower() == "content-type" for k, _ in headers_list):
                headers_list.append(("Content-Type", "application/x-www-form-urlencoded"))
        elif request.body.type == BodyType.MULTIPART:
            files_list = []
            data_dict = {}
            for item in request.body.form_params:
                if not item.enabled or not item.key:
                    continue
                if item.type == "file":
                    file_path = Path(item.value).resolve()
                    try:
                        file_stat = file_path.stat()
                        is_regular = stat.S_ISREG(file_stat.st_mode)
                    except (OSError, ValueError):
                        is_regular = False

                    if not is_regular or not file_path.is_file():
                        return CanonicalResponseModel(
                            status=0,
                            status_text="Error",
                            body="",
                            duration_ms=0.0,
                            error=ResponseError(
                                code="FILE_NOT_FOUND",
                                message=f"Multipart upload file not found or not a regular file: {item.value}",
                            ),
                        )
                    try:
                        async with aiofiles.open(file_path, "rb") as af:
                            file_bytes = await af.read()
                    except OSError as e:
                        return CanonicalResponseModel(
                            status=0,
                            status_text="Error",
                            body="",
                            duration_ms=0.0,
                            error=ResponseError(
                                code="FILE_READ_ERROR",
                                message=f"Failed to read file {item.value}: {e}",
                            ),
                        )
                    mime_type, _ = mimetypes.guess_type(str(file_path))
                    files_list.append(
                        (
                            item.key,
                            (file_path.name, file_bytes, mime_type or "application/octet-stream"),
                        )
                    )
                else:
                    data_dict[item.key] = item.value
            files = files_list if files_list else None
            data = data_dict if data_dict else None
        elif request.body.type == BodyType.RAW:
            content = request.body.raw.encode("utf-8")

    # 5. Execute via HTTPX client
    client_manager = get_client_manager()
    timeout_sec = max(0.1, request.settings.timeout_ms / 1000.0)
    client = client_manager.get_client(
        verify_ssl=request.settings.verify_ssl,
        timeout_seconds=timeout_sec,
    )

    trace = _TraceRecorder()
    t_start = time.perf_counter()

    try:
        req = client.build_request(
            method=request.method.value,
            url=base_url,
            params=combined_params if combined_params else None,
            headers=_encode_headers(headers_list),
            content=content,
            data=data,
            files=files,
            extensions={"trace": trace},
        )

        response = await client.send(
            req,
            follow_redirects=request.settings.follow_redirects,
            stream=True,
        )

        t_headers = time.perf_counter()
        ttfb_ms = max(0.0, (t_headers - t_start) * 1000.0)

        # Extract response metadata
        status_code = response.status_code
        try:
            status_text = http.HTTPStatus(status_code).phrase
        except ValueError:
            status_text = response.reason_phrase or "Unknown"

        res_headers = {k: v for k, v in response.headers.items()}
        res_cookies = {k: v for k, v in response.cookies.items()}
        content_type = response.headers.get("content-type", "text/plain")

        # Stream body with size guardrails
        body_chunks = []
        total_bytes = 0
        is_truncated = False
        temp_file_path: str | None = None
        temp_file = None

        config = get_config()
        max_allowed = config.max_payload_size_bytes or MAX_ALLOWED_BYTES

        try:
            async for chunk in response.aiter_bytes():
                total_bytes += len(chunk)
                if total_bytes > max_allowed:
                    await response.aclose()
                    if temp_file:
                        await temp_file.close()
                    if temp_file_path:
                        Path(temp_file_path).unlink(missing_ok=True)
                    return CanonicalResponseModel(
                        status=0,
                        status_text="Error",
                        body="",
                        duration_ms=round((time.perf_counter() - t_start) * 1000.0, 2),
                        error=ResponseError(
                            code="PAYLOAD_TOO_LARGE",
                            message="Response exceeded 50MB maximum payload limit.",
                        ),
                    )

                if total_bytes > MAX_PREVIEW_BYTES:
                    if not is_truncated:
                        is_truncated = True
                        config.temp_dir.mkdir(parents=True, exist_ok=True)
                        dest_path = (
                            config.temp_dir / f"response_{int(time.time())}_{os.getpid()}.bin"
                        )
                        temp_file_path = str(dest_path)
                        temp_file = await aiofiles.open(dest_path, "wb")
                        # Write buffered chunks
                        for prev_chunk in body_chunks:
                            await temp_file.write(prev_chunk)
                        body_chunks.clear()
                    await temp_file.write(chunk)
                else:
                    body_chunks.append(chunk)
        finally:
            await response.aclose()
            if temp_file:
                await temp_file.close()

        t_end = time.perf_counter()
        transfer_ms = max(0.0, (t_end - t_headers) * 1000.0)
        duration_ms = max(0.0, (t_end - t_start) * 1000.0)

        timing_metrics = trace.calculate_metrics(ttfb_ms=ttfb_ms, transfer_ms=transfer_ms)

        if is_truncated:
            body_str = "[Response exceeds 10MB limit. Preview truncated.]"
        else:
            raw_bytes = b"".join(body_chunks)
            body_str = raw_bytes.decode("utf-8", errors="replace")

        return CanonicalResponseModel(
            status=status_code,
            status_text=status_text,
            headers=res_headers,
            cookies=res_cookies,
            body=body_str,
            content_type=content_type,
            size_bytes=total_bytes,
            duration_ms=round(duration_ms, 2),
            timing=timing_metrics,
            is_truncated=is_truncated,
            temp_file_path=temp_file_path,
            error=None,
        )

    except httpx.TimeoutException:
        duration_ms = (time.perf_counter() - t_start) * 1000.0
        return CanonicalResponseModel(
            status=0,
            status_text="Error",
            body="",
            duration_ms=round(duration_ms, 2),
            error=ResponseError(
                code="REQUEST_TIMEOUT",
                message=f"Request timed out after {request.settings.timeout_ms} ms.",
            ),
        )
    except httpx.ConnectError as e:
        duration_ms = (time.perf_counter() - t_start) * 1000.0
        err_msg = str(e).lower()
        if "name resolution" in err_msg or "nodename nor servname" in err_msg or "dns" in err_msg:
            code = "DNS_LOOKUP_FAILED"
            msg = "DNS failure: Host could not be resolved."
        else:
            code = "CONNECTION_REFUSED"
            msg = "Connection refused: Target server is not accepting connections."
        return CanonicalResponseModel(
            status=0,
            status_text="Error",
            body="",
            duration_ms=round(duration_ms, 2),
            error=ResponseError(
                code=code,
                message=msg,
                details=str(e),
            ),
        )
    except httpx.HTTPError as e:
        duration_ms = (time.perf_counter() - t_start) * 1000.0
        err_str = str(e).lower()
        if "certificate" in err_str or "ssl" in err_str:
            code = "SSL_CERTIFICATE_ERROR"
            msg = (
                "SSL Error: Self-signed certificate. Toggle 'Verify SSL' off in settings to bypass."
            )
        else:
            code = "HTTP_ERROR"
            msg = f"HTTP error during execution: {e}"
        return CanonicalResponseModel(
            status=0,
            status_text="Error",
            body="",
            duration_ms=round(duration_ms, 2),
            error=ResponseError(
                code=code,
                message=msg,
                details=str(e),
            ),
        )
    except Exception as e:  # noqa: BLE001
        duration_ms = (time.perf_counter() - t_start) * 1000.0
        return CanonicalResponseModel(
            status=0,
            status_text="Error",
            body="",
            duration_ms=round(duration_ms, 2),
            error=ResponseError(
                code="INTERNAL_EXECUTION_ERROR",
                message=f"Unexpected error executing request: {e}",
                details=str(e),
            ),
        )
