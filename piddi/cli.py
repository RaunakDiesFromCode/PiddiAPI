"""Command-line interface and standalone launcher for PiddiAPI."""

import argparse
import logging
import logging.handlers
import secrets
import socket
import sys
from pathlib import Path

import uvicorn

from piddi.config import AppConfig, set_config
from piddi.launcher import poll_health_and_launch_browser
from piddi.main import create_app
from piddi.paths import get_user_piddi_home, resolve_desktop_workspace
from piddi.storage.environment_manager import EnvironmentFileManager
from piddi.storage.file_manager import WorkspaceFileManager
from piddi.storage.history import get_history_manager

__version__ = "0.1.0"


def find_available_port(
    host: str = "127.0.0.1",
    start_port: int = 4111,
    max_attempts: int = 10,
) -> int:
    """Scan and find the first available TCP port in the specified loopback range."""
    for offset in range(max_attempts):
        port = start_port + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            else:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    raise RuntimeError(
        f"No available loopback port found in range {start_port}–{start_port + max_attempts - 1}."
    )


def setup_cli_logging(
    log_dir: Path,
    debug: bool = False,
    console: bool = False,
) -> None:
    """
    Configure rotating file logging to ~/.piddi/piddi.log and optional console stream output.

    --console: Attaches stream output to stdout/stderr.
    --dev: Sets log level to DEBUG.
    """
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "piddi.log"

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # Clear existing handlers to prevent duplicate lines on re-init
    root_logger.handlers.clear()

    # Rotating file handler (5MB, 3 backups)
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=5_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG if debug else logging.INFO)
    file_fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler.setFormatter(file_fmt)
    root_logger.addHandler(file_handler)

    # Console stream handler for interactive terminal or explicit --console/--dev
    if console or debug or (hasattr(sys.stdout, "isatty") and sys.stdout.isatty()):
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setLevel(logging.DEBUG if debug else logging.INFO)
        stream_fmt = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S",
        )
        stream_handler.setFormatter(stream_fmt)
        root_logger.addHandler(stream_handler)


def main(args_list: list[str] | None = None) -> int:
    """Main CLI entrypoint and standalone launcher for PiddiAPI."""
    parser = argparse.ArgumentParser(
        prog="piddi",
        description="Fast, local-first API testing engine with secure loopback execution.",
    )
    parser.add_argument(
        "workspace",
        nargs="?",
        default=".",
        help="Path to workspace directory containing .piddi/ data (default: current directory)",
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=4111,
        help="Starting port for local loopback server (default: 4111)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Start engine without automatically opening the default web browser",
    )
    parser.add_argument(
        "--console",
        action="store_true",
        help="Show backend engine log output in stdout/stderr",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Run in development mode with debug routes and open API documentation",
    )
    parser.add_argument(
        "-v",
        "--version",
        action="version",
        version=f"piddi {__version__}",
        help="Show PiddiAPI version and exit",
    )

    args = parser.parse_args(args_list)

    # 1. Resolve workspace path with desktop launch fallbacks
    workspace_path = resolve_desktop_workspace(args.workspace)

    # 2. Setup logging directory
    piddi_home = get_user_piddi_home()
    setup_cli_logging(piddi_home, debug=args.dev, console=args.console)
    logger = logging.getLogger("piddi.cli")

    # 3. Find available port (4111 -> 4120)
    try:
        port = find_available_port(start_port=args.port)
    except RuntimeError as e:
        sys.stderr.write(f"Error: {e}\n")
        logger.error(str(e))
        return 1

    if port != args.port:
        print(f"Notice: Port {args.port} is in use. Bound to next available port {port}.")

    # 4. Generate 32-byte cryptographic session token
    session_token = secrets.token_hex(32)

    # 5. Initialize application configuration singleton
    config = AppConfig(
        host="127.0.0.1",
        port=port,
        session_token=session_token,
        workspace_path=workspace_path,
        debug=args.dev,
    )
    set_config(config)

    # 6. Ensure workspace and history directory structures
    WorkspaceFileManager.ensure_workspace_structure(workspace_path)
    EnvironmentFileManager.ensure_environments_structure(workspace_path)
    get_history_manager().ensure_history_structure()

    # 7. Print startup banner
    app_url = f"http://127.0.0.1:{port}/"
    print("=" * 60)
    print(f"  PiddiAPI Engine v{__version__}")
    print(f"  Local URL:  {app_url}")
    print(f"  Workspace:  {workspace_path}")
    print(f"  Logs:       {piddi_home / 'piddi.log'}")
    print("=" * 60)
    print("Press Ctrl+C in this terminal to stop the server.")

    # 8. Trigger browser auto-launch only after authoritative /api/health readiness
    if not args.no_browser:
        poll_health_and_launch_browser(
            host="127.0.0.1",
            port=port,
            session_token=session_token,
            max_timeout=5.0,
            poll_interval=0.05,
        )

    # 9. Create FastAPI application and start Uvicorn server
    app = create_app()
    uvicorn_config = uvicorn.Config(
        app=app,
        host="127.0.0.1",
        port=port,
        log_level="warning" if not args.dev else "info",
        access_log=args.dev,
    )
    server = uvicorn.Server(uvicorn_config)

    try:
        server.run()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        print("\nPiddiAPI Engine shutdown complete.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
