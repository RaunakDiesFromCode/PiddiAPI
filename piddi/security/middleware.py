"""Loopback security and authentication middleware."""

import json
from collections.abc import Callable

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from piddi.config import AppConfig, get_config
from piddi.security.tokens import validate_session_token


class LoopbackSecurityMiddleware:
    """Enforces Host header, Origin header, and X-Piddi-Token verification for all /api routes."""

    def __init__(
        self,
        app: ASGIApp,
        config_provider: Callable[[], AppConfig] | None = None,
    ) -> None:
        self.app = app
        self.config_provider = config_provider or get_config

    def _get_allowed_hosts(self, config: AppConfig) -> set[str]:
        """Return the set of valid loopback Host headers."""
        hosts = {
            f"127.0.0.1:{config.port}",
            f"localhost:{config.port}",
            "127.0.0.1",
            "localhost",
            "testserver",  # Allow Starlette TestClient in test environments
        }
        if config.debug:
            hosts.add("127.0.0.1:5173")
            hosts.add("localhost:5173")
        return hosts

    def _get_allowed_origins(self, config: AppConfig) -> set[str]:
        """Return the set of valid loopback Origin headers."""
        origins = {
            f"http://127.0.0.1:{config.port}",
            f"http://localhost:{config.port}",
            "http://127.0.0.1",
            "http://localhost",
            "http://testserver",
        }
        if config.debug:
            origins.add("http://127.0.0.1:5173")
            origins.add("http://localhost:5173")
        return origins

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        # Only enforce on /api routes
        if not path.startswith("/api"):
            await self.app(scope, receive, send)
            return

        headers = Headers(raw=scope.get("headers", []))
        config = self.config_provider()

        # 1. Host Validation (Defense against DNS Rebinding)
        host_header = headers.get("host", "").strip().lower()
        if not host_header:
            await self._send_json(
                send,
                status=403,
                data={"code": "FORBIDDEN_HOST", "message": "Forbidden: Missing Host header"},
            )
            return

        allowed_hosts = self._get_allowed_hosts(config)
        if host_header not in allowed_hosts:
            await self._send_json(
                send,
                status=403,
                data={"code": "FORBIDDEN_HOST", "message": "Forbidden: Invalid Host header"},
            )
            return

        # 2. Origin Validation (Defense against Cross-Origin Drive-By SSRF)
        origin_header = headers.get("origin")
        if origin_header is not None:
            normalized_origin = origin_header.strip().rstrip("/").lower()
            allowed_origins = self._get_allowed_origins(config)
            if normalized_origin not in allowed_origins:
                await self._send_json(
                    send,
                    status=403,
                    data={"code": "FORBIDDEN_ORIGIN", "message": "Forbidden: Untrusted Origin"},
                )
                return

        # Special dev-mode handshake: allow /api/bootstrap without X-Piddi-Token
        if path == "/api/bootstrap" and config.debug:
            await self.app(scope, receive, send)
            return

        # 3. Session Token Validation (Primary Cryptographic Authentication)
        provided_token = headers.get("x-piddi-token")
        if not validate_session_token(provided_token, config.session_token):
            await self._send_json(
                send,
                status=401,
                data={
                    "code": "UNAUTHORIZED_LOOPBACK",
                    "message": "Unauthorized: Session token missing or invalid.",
                },
            )
            return

        # Pass through to the next application handler
        await self.app(scope, receive, send)

    async def _send_json(self, send: Send, status: int, data: dict) -> None:
        """Send a JSON error response directly via ASGI."""
        body = json.dumps(data).encode("utf-8")
        headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"connection", b"close"),
        ]
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": headers,
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": body,
            }
        )
