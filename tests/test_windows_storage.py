"""Tests for Windows-specific storage paths and Program Files execution isolation."""

from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from piddi.cli import setup_cli_logging
from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.models.collection import Collection
from piddi.models.environment import Environment, EnvironmentVariableDefinition
from piddi.models.history import HistoryRecord
from piddi.models.request import CanonicalRequestModel, HTTPMethod
from piddi.paths import get_user_documents_dir, get_user_piddi_home, resolve_desktop_workspace
from piddi.storage.environment_manager import EnvironmentFileManager
from piddi.storage.file_manager import WorkspaceFileManager
from piddi.storage.history import HistoryManager
from piddi.storage.preferences_manager import PreferencesManager


@pytest.fixture
def fake_windows_home(tmp_path: Path):
    """Set up a simulated Windows user home with Documents."""
    user_home = tmp_path / "Users" / "TestUser"
    user_home.mkdir(parents=True)
    return user_home


@pytest.mark.asyncio
async def test_windows_storage_paths_under_documents(fake_windows_home: Path):
    """Verify that on Windows, default workspace, collections, environments, preferences,
    history, and logs are all written under Documents\\.piddi\\ and not in Program Files."""
    with (
        patch("pathlib.Path.home", return_value=fake_windows_home),
        patch("sys.platform", "win32"),
    ):
        docs_dir = get_user_documents_dir()
        assert docs_dir == (fake_windows_home / "Documents").resolve()
        assert docs_dir.exists()

        piddi_home = get_user_piddi_home()
        assert piddi_home == (fake_windows_home / "Documents" / ".piddi").resolve()

        # 1. Resolve default workspace on Windows
        ws = resolve_desktop_workspace(".")
        assert ws == docs_dir

        # 2. Ensure structures
        collections_dir = WorkspaceFileManager.ensure_workspace_structure(ws)
        assert collections_dir == piddi_home / "collections"
        assert collections_dir.is_dir()
        assert (piddi_home / ".gitignore").exists()

        environments_dir = EnvironmentFileManager.ensure_environments_structure(ws)
        assert environments_dir == piddi_home / "environments"
        assert environments_dir.is_dir()

        # 3. Save a collection and verify location
        col = Collection(
            id="col_123456789012",
            name="Windows API",
            requests=[
                CanonicalRequestModel(
                    id="req_123456789012",
                    name="Test Req",
                    method=HTTPMethod.GET,
                    url="http://localhost:8000/test",
                )
            ],
        )
        await WorkspaceFileManager.save_collection(ws, col)
        col_file = piddi_home / "collections" / "col_123456789012.json"
        assert col_file.exists()

        # 4. Save an environment and verify location
        env = Environment(
            id="env_123456789012",
            name="Prod",
            variables=[EnvironmentVariableDefinition(key="HOST", value="api.example.com")],
        )
        await EnvironmentFileManager.save_environment(ws, env)
        env_file = piddi_home / "environments" / "env_123456789012.json"
        assert env_file.exists()

        # 5. Preferences
        pref_path = PreferencesManager.get_preferences_path()
        assert pref_path == piddi_home / "preferences.json"
        prefs = await PreferencesManager.load_preferences()
        prefs.active_environment_id = "env_123456789012"
        await PreferencesManager.save_preferences(prefs)
        assert pref_path.exists()

        # 6. History
        hist_mgr = HistoryManager()
        assert hist_mgr.history_file_path == piddi_home / "history.jsonl"
        await hist_mgr.append_record(
            HistoryRecord(
                method=HTTPMethod.GET,
                url="http://localhost:8000/test",
                status=200,
                duration_ms=10.5,
                size_bytes=100,
                request_snapshot=CanonicalRequestModel(
                    name="Test Req",
                    method=HTTPMethod.GET,
                    url="http://localhost:8000/test",
                ),
            )
        )
        assert (piddi_home / "history.jsonl").exists()

        # 7. Logging
        setup_cli_logging(piddi_home, debug=False, console=False)
        assert (piddi_home / "piddi.log").exists()


@pytest.mark.asyncio
async def test_windows_explicit_custom_workspace(fake_windows_home: Path, tmp_path: Path):
    """Verify that an explicit workspace (piddi C:\\path\\to\\custom) is preserved and NOT redirected."""
    custom_ws = tmp_path / "custom_project"
    custom_ws.mkdir()

    with (
        patch("pathlib.Path.home", return_value=fake_windows_home),
        patch("sys.platform", "win32"),
    ):
        resolved = resolve_desktop_workspace(str(custom_ws))
        assert resolved == custom_ws.resolve()
        assert resolved != (fake_windows_home / "Documents").resolve()

        collections_dir = WorkspaceFileManager.ensure_workspace_structure(resolved)
        assert collections_dir == custom_ws / ".piddi" / "collections"
        assert collections_dir.is_dir()


@pytest.mark.asyncio
async def test_simulated_program_files_launch_no_writes_to_bundle(
    fake_windows_home: Path, tmp_path: Path
):
    """Simulate launching from C:\\Program Files\\PiddiAPI (read-only installation directory).
    Verify that launching the application creates data in Documents\\.piddi, never in Program Files."""
    fake_program_files = tmp_path / "Program Files" / "PiddiAPI"
    fake_program_files.mkdir(parents=True)

    with (
        patch("pathlib.Path.home", return_value=fake_windows_home),
        patch("os.getcwd", return_value=str(fake_program_files)),
        patch("sys.platform", "win32"),
    ):
        # 1. Default workspace resolution when launched from Program Files
        ws = resolve_desktop_workspace(".")
        assert ws == (fake_windows_home / "Documents").resolve()
        assert not ws.is_relative_to(fake_program_files)

        # 2. Initialize AppConfig with defaults
        config = AppConfig(
            host="127.0.0.1",
            port=4111,
            session_token="win_test_token",
            debug=True,
        )
        assert config.workspace_path == (fake_windows_home / "Documents").resolve()
        set_config(config)

        # 3. Create app and verify /api/workspace loads from Documents
        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/workspace", headers={"X-Piddi-Token": "win_test_token"})
            assert res.status_code == 200
            data = res.json()
            assert data["workspace_path"] == str((fake_windows_home / "Documents").resolve())

        # 4. Verify ZERO files or .piddi directory created inside fake_program_files
        program_files_items = list(fake_program_files.rglob("*"))
        assert len(program_files_items) == 0, (
            f"Files created in Program Files: {program_files_items}"
        )
