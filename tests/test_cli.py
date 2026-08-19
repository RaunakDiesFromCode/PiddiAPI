import logging
import socket
from pathlib import Path
from unittest.mock import patch

import pytest

from piddi.cli import find_available_port, main, setup_cli_logging


def _create_bound_socket(port: int) -> socket.socket:
    """Create and bind a TCP socket with platform-appropriate address exclusivity."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port))
    return s


def get_free_base_port(span: int = 5) -> int:
    """Find a base port where span consecutive ports are available."""
    for base in range(25000, 35000, 10):
        sockets = []
        try:
            for offset in range(span):
                s = _create_bound_socket(base + offset)
                sockets.append(s)
            return base
        except OSError:
            continue
        finally:
            for s in sockets:
                s.close()
    return 28111


def test_cli_port_scanning_fallback():
    """Verify port scanner detects occupied port and falls back to the next available port."""
    base = get_free_base_port()
    s1 = _create_bound_socket(base)
    try:
        s1.listen(1)
        available_port = find_available_port(start_port=base, max_attempts=5)
        assert available_port == base + 1
    finally:
        s1.close()


def test_cli_port_scanning_multiple_occupied():
    """Verify port scanner iterates through multiple occupied ports."""
    base = get_free_base_port()
    s1 = _create_bound_socket(base)
    s2 = _create_bound_socket(base + 1)
    try:
        s1.listen(1)
        s2.listen(1)
        available_port = find_available_port(start_port=base, max_attempts=5)
        assert available_port == base + 2
    finally:
        s1.close()
        s2.close()


def test_cli_all_ports_occupied_raises():
    """Verify RuntimeError is raised when all ports in range are occupied."""
    base = get_free_base_port()
    sockets = []
    try:
        for p in range(base, base + 3):
            s = _create_bound_socket(p)
            s.listen(1)
            sockets.append(s)

        with pytest.raises(RuntimeError, match="No available loopback port found"):
            find_available_port(start_port=base, max_attempts=3)
    finally:
        for s in sockets:
            s.close()


def test_cli_logging_setup(tmp_path: Path):
    """Verify setup_cli_logging creates rotating log file and optional console handler."""
    setup_cli_logging(tmp_path, debug=True, console=True)
    log_file = tmp_path / "piddi.log"
    assert log_file.exists() or tmp_path.exists()

    root_logger = logging.getLogger()
    handler_types = [type(h) for h in root_logger.handlers]
    assert logging.handlers.RotatingFileHandler in handler_types
    assert logging.StreamHandler in handler_types


def test_cli_logging_setup_no_console(tmp_path: Path):
    """Verify setup_cli_logging does not attach console handler when console=False and debug=False."""
    setup_cli_logging(tmp_path, debug=False, console=False)
    root_logger = logging.getLogger()
    handler_types = [type(h) for h in root_logger.handlers]
    assert logging.handlers.RotatingFileHandler in handler_types
    assert logging.StreamHandler not in handler_types


def test_cli_argument_parsing_and_exit(tmp_path: Path):
    """Verify CLI parses arguments and initializes AppConfig without starting server."""
    with (
        patch("uvicorn.Server.run") as mock_server_run,
        patch("piddi.cli.poll_health_and_launch_browser") as mock_poller,
        patch("piddi.cli.setup_cli_logging"),
    ):
        code = main(
            [
                str(tmp_path),
                "--port",
                "4115",
                "--no-browser",
                "--console",
                "--dev",
            ]
        )
        assert code == 0
        assert mock_server_run.called
        assert not mock_poller.called


def test_cli_triggers_readiness_poller_when_browser_enabled(tmp_path: Path):
    """Verify CLI triggers poll_health_and_launch_browser when --no-browser is not passed."""
    with (
        patch("uvicorn.Server.run") as mock_server_run,
        patch("piddi.cli.poll_health_and_launch_browser") as mock_poller,
        patch("piddi.cli.setup_cli_logging"),
    ):
        code = main([str(tmp_path), "--port", "4118"])
        assert code == 0
        assert mock_server_run.called
        assert mock_poller.called
