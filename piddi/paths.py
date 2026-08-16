"""Path resolution abstractions for standard and PyInstaller frozen environments."""

import os
import sys
from pathlib import Path


def get_bundle_dir() -> Path:
    """Return the root directory of the application bundle or repository root."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS).resolve()
    # In standard development: repository root (parent of piddi package)
    return Path(__file__).resolve().parent.parent


def get_static_dir() -> Path:
    """Return the absolute path to packaged frontend static assets."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        # In PyInstaller onedir/bundle, static assets are located in sys._MEIPASS/piddi/static
        bundle_static = Path(sys._MEIPASS).resolve() / "piddi" / "static"
        if bundle_static.exists():
            return bundle_static
        # Fallback to direct static subfolder if packaged at top level
        top_static = Path(sys._MEIPASS).resolve() / "static"
        if top_static.exists():
            return top_static
    return Path(__file__).resolve().parent / "static"


def get_user_piddi_home() -> Path:
    """Return the global user-profile .piddi directory (~/.piddi)."""
    return (Path.home() / ".piddi").resolve()


def resolve_desktop_workspace(arg_workspace: str | None = None) -> Path:
    """
    Resolve workspace path preserving Phase 1–5 semantics across CLI and Desktop launches.

    Priority:
    1. Explicit CLI argument (if provided and != ".") -> resolve directly.
    2. Terminal launch with default "." -> Path.cwd().resolve().
    3. GUI Desktop launch (macOS Finder, Windows Explorer double-click):
       If cwd is root ('/') or the application bundle, check ~/.piddi/preferences.json
       for last_workspace_path, or default to ~/PiddiWorkspace.
    """
    if arg_workspace and arg_workspace != ".":
        return Path(arg_workspace).resolve()

    cwd = Path(os.getcwd()).resolve()

    # Detect if launched from root or application bundle in GUI mode
    is_root_or_bundle = (
        cwd == Path("/").resolve()
        or cwd == Path.home().resolve()
        or (getattr(sys, "frozen", False) and cwd.is_relative_to(get_bundle_dir()))
    )

    if is_root_or_bundle:
        # Check preferences.json for last remembered workspace
        pref_file = get_user_piddi_home() / "preferences.json"
        if pref_file.exists():
            try:
                import json

                data = json.loads(pref_file.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    last_ws = data.get("last_workspace_path")
                    if last_ws and Path(last_ws).is_dir():
                        return Path(last_ws).resolve()
            except (OSError, json.JSONDecodeError, KeyError, TypeError):
                pass

        # Default desktop workspace in user home
        default_ws = Path.home() / "PiddiWorkspace"
        return default_ws.resolve()

    return cwd
