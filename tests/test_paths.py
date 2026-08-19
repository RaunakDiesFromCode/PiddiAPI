"""Unit tests for centralized path resolution abstractions."""

import sys
from pathlib import Path
from unittest.mock import patch

from piddi.paths import (
    get_bundle_dir,
    get_static_dir,
    get_user_documents_dir,
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

    if sys.platform == "win32":
        assert get_user_piddi_home() == (Path.home() / "Documents" / ".piddi").resolve()
    else:
        assert get_user_piddi_home() == (Path.home() / ".piddi").resolve()


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


def test_get_user_documents_dir(tmp_path: Path):
    """Verify get_user_documents_dir creates and returns Documents or falls back to home."""
    with patch("pathlib.Path.home", return_value=tmp_path):
        docs = get_user_documents_dir()
        assert docs == (tmp_path / "Documents").resolve()
        assert docs.is_dir()

    # Verify fallback on OSError
    with (
        patch("pathlib.Path.home", return_value=tmp_path),
        patch.object(Path, "mkdir", side_effect=OSError("Read-only filesystem")),
    ):
        fallback_docs = get_user_documents_dir()
        assert fallback_docs == tmp_path.resolve()


def test_get_user_piddi_home_windows(tmp_path: Path):
    """Verify Windows returns Documents/.piddi."""
    with (
        patch("pathlib.Path.home", return_value=tmp_path),
        patch("sys.platform", "win32"),
    ):
        piddi_home = get_user_piddi_home()
        assert piddi_home == (tmp_path / "Documents" / ".piddi").resolve()


def test_get_user_piddi_home_posix(tmp_path: Path):
    """Verify macOS/Linux returns ~/.piddi."""
    with (
        patch("pathlib.Path.home", return_value=tmp_path),
        patch("sys.platform", "darwin"),
    ):
        piddi_home = get_user_piddi_home()
        assert piddi_home == (tmp_path / ".piddi").resolve()


def test_resolve_desktop_workspace_explicit_arg(tmp_path: Path):
    """Verify explicit CLI argument is resolved directly on all platforms."""
    target = tmp_path / "custom_ws"
    target.mkdir()
    resolved = resolve_desktop_workspace(str(target))
    assert resolved == target.resolve()


def test_resolve_desktop_workspace_windows_default(tmp_path: Path):
    """Verify Windows default launch resolves to Documents folder."""
    with (
        patch("pathlib.Path.home", return_value=tmp_path),
        patch("sys.platform", "win32"),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == (tmp_path / "Documents").resolve()

        resolved_none = resolve_desktop_workspace(None)
        assert resolved_none == (tmp_path / "Documents").resolve()


def test_resolve_desktop_workspace_posix_cli_default(tmp_path: Path):
    """Verify POSIX CLI launch in a standard workspace directory returns cwd."""
    with (
        patch("os.getcwd", return_value=str(tmp_path)),
        patch("sys.platform", "linux"),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == tmp_path.resolve()


def test_resolve_desktop_workspace_posix_gui_launch_with_preference(tmp_path: Path):
    """Verify POSIX GUI desktop launch from root resolves to last_workspace_path in preferences.json."""
    fake_pref_dir = tmp_path / ".piddi"
    fake_pref_dir.mkdir(parents=True)
    pref_file = fake_pref_dir / "preferences.json"

    remembered_ws = tmp_path / "remembered_project"
    remembered_ws.mkdir()

    import json

    pref_file.write_text(json.dumps({"last_workspace_path": str(remembered_ws)}), encoding="utf-8")

    with (
        patch("os.getcwd", return_value="/"),
        patch("sys.platform", "darwin"),
        patch("piddi.paths.get_user_piddi_home", return_value=fake_pref_dir),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == remembered_ws.resolve()


def test_resolve_desktop_workspace_posix_gui_launch_fallback_default(tmp_path: Path):
    """Verify POSIX GUI desktop launch without valid preferences falls back to ~/PiddiWorkspace."""
    fake_pref_dir = tmp_path / ".piddi"
    fake_pref_dir.mkdir(parents=True)

    with (
        patch("os.getcwd", return_value="/"),
        patch("sys.platform", "darwin"),
        patch("piddi.paths.get_user_piddi_home", return_value=fake_pref_dir),
        patch("pathlib.Path.home", return_value=tmp_path),
    ):
        resolved = resolve_desktop_workspace(".")
        assert resolved == (tmp_path / "PiddiWorkspace").resolve()

