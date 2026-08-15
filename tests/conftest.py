"""Pytest fixtures and deterministic local test echo server."""

import asyncio
import base64
import json
import socket
import threading
import time
from collections.abc import AsyncGenerator, Generator

import httpx
import pytest
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse
from starlette.datastructures import UploadFile

from piddi.config import AppConfig, set_config
from piddi.main import create_app


def find_free_port() -> int:
    """Locate an open TCP port on loopback."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def create_echo_server() -> FastAPI:
    """Construct the minimal deterministic echo testing server."""
    echo = FastAPI(title="Echo Test Server")

    @echo.api_route("/echo/get", methods=["GET", "HEAD"])
    async def echo_get(request: Request) -> dict:
        return {
            "method": request.method,
            "params": dict(request.query_params),
            "headers": {k.lower(): v for k, v in request.headers.items()},
            "cookies": dict(request.cookies),
        }

    @echo.options("/echo/options")
    async def echo_options() -> Response:
        return Response(headers={"allow": "GET, POST, OPTIONS, HEAD", "x-options-test": "ok"})

    @echo.api_route("/echo/post", methods=["POST", "PUT", "PATCH", "DELETE"])
    async def echo_post(request: Request) -> dict:
        content_type = request.headers.get("content-type", "")
        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8", errors="replace")

        json_data = None
        form_data = None
        files_data = []

        if "application/json" in content_type:
            try:
                json_data = json.loads(body_str)
            except (ValueError, json.JSONDecodeError):
                json_data = None
        elif "multipart/form-data" in content_type:
            form = await request.form()
            form_data = {}
            for key, value in form.multi_items():
                if isinstance(value, UploadFile) or hasattr(value, "filename"):
                    content = await value.read() if hasattr(value, "read") else b""
                    files_data.append(
                        {
                            "key": key,
                            "filename": getattr(value, "filename", ""),
                            "content_type": getattr(value, "content_type", ""),
                            "size": len(content),
                            "preview": content.decode("utf-8", errors="replace")[:100],
                        }
                    )
                else:
                    form_data[key] = value
        elif "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            form_data = dict(form)

        return {
            "method": request.method,
            "headers": {k.lower(): v for k, v in request.headers.items()},
            "cookies": dict(request.cookies),
            "params": dict(request.query_params),
            "raw_body": body_str,
            "json": json_data,
            "form": form_data,
            "files": files_data,
        }

    @echo.get("/echo/redirect")
    async def echo_redirect() -> RedirectResponse:
        return RedirectResponse(url="/echo/get?redirected=true", status_code=302)

    @echo.get("/echo/delay")
    async def echo_delay(ms: int = 100) -> dict:
        await asyncio.sleep(ms / 1000.0)
        return {"delayed_ms": ms}

    @echo.get("/echo/status/{code}")
    async def echo_status(code: int) -> Response:
        return Response(content=f"Status {code} response", status_code=code)

    @echo.get("/echo/bytes")
    async def echo_bytes(n: int = 100) -> StreamingResponse:
        chunk_size = 64 * 1024

        async def stream_bytes() -> AsyncGenerator[bytes, None]:
            remaining = n
            while remaining > 0:
                cur = min(remaining, chunk_size)
                yield b"X" * cur
                remaining -= cur

        return StreamingResponse(stream_bytes(), media_type="application/octet-stream")

    @echo.get("/echo/large")
    async def echo_large(size_mb: int = 12) -> StreamingResponse:
        chunk = b"A" * (1024 * 1024)

        async def stream_generator() -> AsyncGenerator[bytes, None]:
            for _ in range(size_mb):
                yield chunk

        return StreamingResponse(stream_generator(), media_type="application/octet-stream")

    @echo.get("/echo/auth")
    async def echo_auth(request: Request) -> dict:
        auth_header = request.headers.get("authorization", "")
        api_key_header = request.headers.get("x-api-key")
        api_key_param = request.query_params.get("api_key")

        if auth_header.startswith("Bearer "):
            return {"type": "bearer", "token": auth_header[7:]}
        elif auth_header.startswith("Basic "):
            encoded = auth_header[6:]
            try:
                decoded = base64.b64decode(encoded).decode("utf-8")
                user, pwd = decoded.split(":", 1)
                return {"type": "basic", "username": user, "password": pwd}
            except (ValueError, UnicodeDecodeError):
                return {"type": "basic", "invalid": True}
        elif api_key_header:
            return {"type": "apikey", "placement": "header", "value": api_key_header}
        elif api_key_param:
            return {"type": "apikey", "placement": "query", "value": api_key_param}
        return {"type": "none"}

    return echo


@pytest.fixture(scope="session")
def echo_server_url() -> Generator[str, None, None]:
    """Start the real local echo server on an ephemeral loopback port for the test session."""
    port = find_free_port()
    echo_app = create_echo_server()
    config = uvicorn.Config(echo_app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    def run_server() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(server.serve())
        finally:
            loop.close()

    thread = threading.Thread(target=run_server, daemon=True)
    thread.start()

    # Wait for server ready
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            with httpx.Client() as client:
                res = client.get(f"{url}/echo/get", timeout=1.0)
                if res.status_code == 200:
                    break
        except (httpx.HTTPError, OSError):
            time.sleep(0.05)
    else:
        raise RuntimeError("Echo test server failed to start within timeout.")

    yield url
    server.should_exit = True
    thread.join(timeout=2.0)


@pytest.fixture
def test_config() -> Generator[AppConfig, None, None]:
    """Configure a fresh test AppConfig with known session token."""
    port = 4111
    cfg = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token="test-secret-session-token-32bytes-hex123456",
        debug=True,
    )
    set_config(cfg)
    yield cfg


@pytest.fixture
async def app_client(test_config: AppConfig) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Async HTTP test client for the FastAPI backend engine."""
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url=f"http://127.0.0.1:{test_config.port}",
    ) as client:
        yield client
