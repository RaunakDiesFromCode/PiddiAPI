"""Unit tests for centralized path resolution abstractions."""

import sys
from pathlib import Path
from unittest.mock import patch

from piddi.paths import (
    get_bundle_dir,
    get_static_dir,
    get_user_piddi_home,
    resolve_desktop_workspace,
)


def test_paths_in_unfrozen_development_mode():
    """Verify paths resolve to repository root and piddi/static in standard development mode."""
    bundle_dir = get_bundle_dir()
    assert (bundle_dir / "piddi").is_dir()
    assert (bundle_dir / "pyproject.toml").is_file()

    static_dir = get_static_dir()
    assert static_dir == (bundle_dir / "piddi" / "static")

    user_home = get_user_piddi_home()
    assert user_home == (Path.home() / ".piddi")


def test_paths_in_simulated_frozen_mode(tmp_path: Path):
    """Verify paths resolve to sys._MEIPASS when running in a frozen PyInstaller bundle."""
    fake_meipass = tmp_path / "meipass_bundle"
    fake_static = fake_meipass / "piddi" / "static"
    fake_static.mkdir(parents=True, exist_ok=True)
    (fake_static / "index.html").write_text("<html></html>", encoding="utf-8")

    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "_MEIPASS", str(fake_meipass), create=True),
    ):
        bundle_dir = get_bundle_dir()
        assert bundle_dir == fake_meipass.resolve()

        static_dir = get_static_dir()
        assert static_dir == fake_static.resolve()
        assert (static_dir / "index.html").exists()


def test_resolve_desktop_workspace_explicit_arg(tmp_path: Path):
    """Verify explicit CLI argument is resolved directly."""
    target = tmp_path / "custom_ws"
    target.mkdir()
    resolved = resolve_desktop_workspace(str(target))
    assert resolved == target.resolve()


def test_resolve_desktop_workspace_cli_default(tmp_path: Path):
    """Verify CLI launch in a standard workspace directory returns cwd."""
    with patch("os.getcwd", return_value=str(tmp_path)):
        resolved = resolve_desktop_workspace(".")
        assert resolved == tmp_path.resolve()


def test_resolve_desktop_workspace_gui_launch_with_preference(tmp_path: Path):
    """Verify GUI desktop launch from root resolves to last_workspace_path in preferences.json."""
    fake_pref_dir = tmp_path / ".piddi"
    fake_pref_dir.mkdir(parents=True)
    pref_file = fake_pref_dir / "preferences.json"

    remembered_ws = tmp_path / "remembered_project"
    remembered_ws.mkdir()

    import json

    pref_file.write_text(json.dumps({"last_workspace_path": str(remembered_ws)}), encoding="utf-8")

    with (
        patch("os.getcwd", return_value="/"),
        patch("piddi.paths.get_user_piddi_home", return_value=fake_pref_dir),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == remembered_ws.resolve()


def test_resolve_desktop_workspace_gui_launch_fallback_default(tmp_path: Path):
    """Verify GUI desktop launch without valid preferences falls back to ~/PiddiWorkspace."""
    fake_pref_dir = tmp_path / ".piddi"
    fake_pref_dir.mkdir(parents=True)

    with (
        patch("os.getcwd", return_value="/"),
        patch("piddi.paths.get_user_piddi_home", return_value=fake_pref_dir),
        patch("pathlib.Path.home", return_value=tmp_path),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == (tmp_path / "PiddiWorkspace").resolve()
