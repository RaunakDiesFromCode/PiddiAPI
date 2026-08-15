"""Tests for user preferences router and persistence in ~/.piddi/preferences.json."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from piddi.config import AppConfig, set_config
from piddi.main import create_app
from piddi.storage.preferences_manager import PreferencesManager


@pytest.fixture
def temp_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    # Point Path.home() to tmp_path for isolated ~/.piddi/preferences.json
    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    config = AppConfig(
        host="127.0.0.1",
        port=4111,
        session_token="test_sec_token_pref",
        workspace_path=tmp_path / "workspace",
        debug=True,
    )
    set_config(config)
    return tmp_path / "workspace"


@pytest.mark.asyncio
async def test_preferences_lifecycle(temp_workspace: Path) -> None:
    """Verify getting and setting active environment preferences."""
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        auth_headers = {"X-Piddi-Token": "test_sec_token_pref"}

        # 1. Initial GET -> active_environment_id is None
        get_res = await client.get("/api/preferences", headers=auth_headers)
        assert get_res.status_code == 200
        assert get_res.json()["active_environment_id"] is None

        # 2. PUT -> set active environment
        put_res = await client.put(
            "/api/preferences",
            headers=auth_headers,
            json={"active_environment_id": "env_112233445566"},
        )
        assert put_res.status_code == 200
        assert put_res.json()["active_environment_id"] == "env_112233445566"

        # 3. GET -> verify persisted
        get_res2 = await client.get("/api/preferences", headers=auth_headers)
        assert get_res2.status_code == 200
        assert get_res2.json()["active_environment_id"] == "env_112233445566"

        # Verify directly in PreferencesManager
        loaded = await PreferencesManager.load_preferences()
        assert loaded.active_environment_id == "env_112233445566"
