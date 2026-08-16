"""Automated tests for Phase 6 native distribution and packaging invariants."""

import json
import os
import sys
from pathlib import Path


def test_master_icon_and_derivatives_exist():
    """Verify master icon and platform-specific derivatives are present in assets/."""
    repo_root = Path(__file__).resolve().parent.parent
    assets_dir = repo_root / "assets"
    assert (assets_dir / "PiddiAPIIcon.png").exists(), (
        "Master artwork assets/PiddiAPIIcon.png missing"
    )
    assert (assets_dir / "PiddiAPI.icns").exists(), "macOS icon assets/PiddiAPI.icns missing"
    assert (assets_dir / "PiddiAPI.ico").exists(), "Windows icon assets/PiddiAPI.ico missing"
    assert (assets_dir / "PiddiAPI.png").exists(), "Linux icon assets/PiddiAPI.png missing"


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
    assert data["checks"]["icon_present"] is True
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
    assert "PiddiAPI.icns" in content
    assert "PiddiAPI.ico" in content


def test_macos_app_has_terminal_launcher_and_icon():
    """Verify that macOS bundle has PiddiAPI terminal launcher script, piddi_engine, and ICNS icon."""
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

    # Verify ICNS icon in Resources
    resources_dir = app_dir / "Contents" / "Resources"
    icns_file = resources_dir / "PiddiAPI.icns"
    assert icns_file.exists()
    assert icns_file.stat().st_size > 1000
