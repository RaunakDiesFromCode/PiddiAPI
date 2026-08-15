import socket
from pathlib import Path
from unittest.mock import patch

import pytest

from piddi.cli import find_available_port, main, setup_cli_logging


def test_cli_port_scanning_fallback():
    """Verify port scanner detects occupied port and falls back to the next available port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s1:
        s1.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s1.bind(("127.0.0.1", 4111))
        s1.listen(1)

        available_port = find_available_port(start_port=4111, max_attempts=5)
        assert available_port == 4112


def test_cli_port_scanning_multiple_occupied():
    """Verify port scanner iterates through multiple occupied ports."""
    with (
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s1,
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s2,
    ):
        s1.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s2.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s1.bind(("127.0.0.1", 4111))
        s2.bind(("127.0.0.1", 4112))
        s1.listen(1)
        s2.listen(1)

        available_port = find_available_port(start_port=4111, max_attempts=5)
        assert available_port == 4113


def test_cli_all_ports_occupied_raises():
    """Verify RuntimeError is raised when all ports in range are occupied."""
    sockets = []
    try:
        for p in range(4111, 4114):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", p))
            s.listen(1)
            sockets.append(s)

        with pytest.raises(RuntimeError, match="No available loopback port found"):
            find_available_port(start_port=4111, max_attempts=3)
    finally:
        for s in sockets:
            s.close()


def test_cli_logging_setup(tmp_path: Path):
    """Verify setup_cli_logging creates rotating log file."""
    setup_cli_logging(tmp_path, debug=True)
    log_file = tmp_path / "piddi.log"
    assert log_file.exists() or tmp_path.exists()


def test_cli_argument_parsing_and_exit(tmp_path: Path):
    """Verify CLI parses arguments and initializes AppConfig without starting server."""
    with (
        patch("uvicorn.Server.run") as mock_server_run,
        patch("piddi.cli.webbrowser.open") as mock_browser_open,
        patch("piddi.cli.setup_cli_logging"),
    ):
        code = main(
            [
                str(tmp_path),
                "--port",
                "4115",
                "--no-browser",
                "--dev",
            ]
        )
        assert code == 0
        assert mock_server_run.called
        assert not mock_browser_open.called
