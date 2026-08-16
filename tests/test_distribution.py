"""Automated tests for Phase 6 native distribution and packaging invariants."""

import json
import os
import sys
from pathlib import Path


def test_build_manifest_structure_and_invariants():
    """Verify BUILD_MANIFEST.json is generated and satisfies all security and structure checks."""
    repo_root = Path(__file__).resolve().parent.parent
    manifest_file = repo_root / "dist" / "BUILD_MANIFEST.json"

    if not manifest_file.exists():
        # If running before package build, skip
        return

    data = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert data["app_name"] == "PiddiAPI"
    assert data["version"] == "0.1.0"
    assert "platform" in data
    assert "bundle_type" in data
    assert data["checks"]["static_index_present"] is True
    assert data["checks"]["static_js_present"] is True
    assert data["checks"]["zero_user_secrets"] is True
    assert data["checks"]["zero_dot_piddi_in_bundle"] is True
    assert data["total_bundle_files"] > 50


def test_piddi_spec_declares_onedir_and_static_datas():
    """Verify piddi.spec is properly configured for ONEDIR mode with static assets."""
    repo_root = Path(__file__).resolve().parent.parent
    spec_file = repo_root / "piddi.spec"
    assert spec_file.exists()

    content = spec_file.read_text(encoding="utf-8")
    assert "piddi/static" in content
    assert "COLLECT(" in content
    assert "hiddenimports" in content
    assert "uvicorn" in content
    assert "pydantic_core" in content


def test_macos_app_has_terminal_launcher():
    """Verify that macOS bundle has PiddiAPI terminal launcher script and piddi_engine."""
    if sys.platform != "darwin":
        return

    repo_root = Path(__file__).resolve().parent.parent
    app_dir = repo_root / "dist" / "PiddiAPI.app"
    if not app_dir.exists():
        return

    macos_dir = app_dir / "Contents" / "MacOS"
    launcher = macos_dir / "PiddiAPI"
    engine = macos_dir / "piddi_engine"
    assert launcher.exists()
    assert engine.exists()
    assert os.access(launcher, os.X_OK)
    content = launcher.read_text(encoding="utf-8")
    assert "Terminal" in content
    assert "piddi_engine" in content
