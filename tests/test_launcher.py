import http.server
import json
import socket
import threading
from unittest.mock import patch

from piddi.launcher import poll_health_and_launch_browser


class MockHealthServer(http.server.HTTPServer):
    """Minimal local mock HTTP server for testing readiness polling."""

    def __init__(self, server_address, RequestHandlerClass, token_expected="valid-token"):
        super().__init__(server_address, RequestHandlerClass)
        self.token_expected = token_expected
        self.requests_received = []


class MockHealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        token = self.headers.get("X-Piddi-Token")
        host = self.headers.get("Host")
        self.server.requests_received.append({"path": self.path, "token": token, "host": host})

        if self.path == "/api/health" and token == self.server.token_expected:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "version": "0.1.0"}).encode("utf-8"))
        else:
            self.send_response(401)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress console logging during tests


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_poll_health_and_launch_browser_success():
    """Verify readiness poller validates /api/health with token and opens browser."""
    port = get_free_port()
    token = "test-secret-token-12345"

    server = MockHealthServer(("127.0.0.1", port), MockHealthHandler, token_expected=token)
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    with patch("webbrowser.open") as mock_browser_open:
        thread = poll_health_and_launch_browser(
            host="127.0.0.1",
            port=port,
            session_token=token,
            max_timeout=2.0,
            poll_interval=0.01,
        )
        thread.join(timeout=2.0)

        assert mock_browser_open.called
        mock_browser_open.assert_called_once_with(f"http://127.0.0.1:{port}/")
        assert len(server.requests_received) > 0
        assert server.requests_received[0]["token"] == token
        assert server.requests_received[0]["path"] == "/api/health"

    server.server_close()


def test_poll_health_and_launch_browser_timeout():
    """Verify readiness poller aborts browser launch when health endpoint does not become ready."""
    port = get_free_port()
    # No server started on port

    with patch("webbrowser.open") as mock_browser_open:
        thread = poll_health_and_launch_browser(
            host="127.0.0.1",
            port=port,
            session_token="any-token",
            max_timeout=0.1,  # Short timeout for test speed
            poll_interval=0.01,
        )
        thread.join(timeout=1.0)

        assert not mock_browser_open.called
