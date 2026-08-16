"""PiddiAPI Native Distribution Package Builder & Verification Script.

Purpose:
  Automates the complete production build workflow:
  1. Platform application icon verification & generation from canonical master artwork (`assets/PiddiAPIIcon.png`).
  2. Frontend compilation check / Vite build (`npm run build` -> `piddi/static/`).
  3. PyInstaller ONEDIR bundle compilation using `piddi.spec`.
  4. Platform-aware packaging (macOS `PiddiAPI.app` with Terminal launcher, Windows `PiddiAPI.exe`, Linux ELF package).
  5. macOS Info.plist property verification (`CFBundleIconFile`, `LSBackgroundOnly=False`, `LSUIElement=False`).
  6. Security invariant checks (zero `.piddi/`, `.env`, or `*.secrets.json` files in the bundle).
  7. Generation of cryptographic `dist/BUILD_MANIFEST.json` with SHA-256 digests.

Usage:
  python scripts/build_package.py [--rebuild-frontend]

Target Outputs:
  - macOS: `dist/PiddiAPI.app`
  - Windows: `dist/PiddiAPI/`
  - Linux: `dist/PiddiAPI/`
  - Manifest: `dist/BUILD_MANIFEST.json`
"""

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

from generate_icons import generate_all_icons


def compute_sha256(file_path: Path) -> str:
    """Compute the SHA-256 hash of a file."""
    h = hashlib.sha256()
    with file_path.open("rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    os.chdir(repo_root)

    print("=" * 70)
    print("  PiddiAPI Phase 6 Native Package Builder")
    print("=" * 70)

    # 1. Verify & Generate Platform Icons
    print("[1/5] Verifying platform-specific application icons...")
    assets_dir = repo_root / "assets"
    master_icon = assets_dir / "PiddiAPIIcon.png"

    if not master_icon.exists():
        print(f"      ERROR: Master icon {master_icon} missing!", file=sys.stderr)
        return 1

    mac_icon = assets_dir / "PiddiAPI.icns"
    win_icon = assets_dir / "PiddiAPI.ico"
    linux_icon = assets_dir / "PiddiAPI.png"

    needs_icon_gen = False
    if (
        sys.platform == "darwin"
        and not mac_icon.exists()
        or sys.platform.startswith("win")
        and not win_icon.exists()
        or sys.platform.startswith("linux")
        and not linux_icon.exists()
    ):
        needs_icon_gen = True

    if needs_icon_gen or not mac_icon.exists() or not win_icon.exists() or not linux_icon.exists():
        print("      Generating missing platform icon derivatives...")
        if not generate_all_icons(assets_dir):
            print("      ERROR: Platform icon generation failed!", file=sys.stderr)
            return 1
        print("      Platform icons generated successfully.")
    else:
        print("      Verified existing platform icons (macOS ICNS, Windows ICO, Linux PNG).")

    # 2. Verify / Build Frontend
    static_dir = repo_root / "piddi" / "static"
    index_html = static_dir / "index.html"

    if not index_html.exists() or "--rebuild-frontend" in sys.argv:
        print("[2/5] Building frontend assets with Vite...")
        frontend_dir = repo_root / "frontend"
        try:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=frontend_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            print("      Frontend build SUCCESS.")
        except subprocess.CalledProcessError as e:
            print(f"      ERROR: Frontend build failed: {e.stderr}", file=sys.stderr)
            return 1
    else:
        print("[2/5] Verified existing frontend static bundle in piddi/static/.")

    # 3. Run PyInstaller
    print("[3/5] Running PyInstaller packaging (ONEDIR mode)...")
    dist_dir = repo_root / "dist"

    spec_file = repo_root / "piddi.spec"
    if not spec_file.exists():
        print(f"      ERROR: Spec file {spec_file} missing!", file=sys.stderr)
        return 1

    pyinstaller_cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_file),
        "--clean",
        "--noconfirm",
    ]

    res = subprocess.run(
        pyinstaller_cmd, cwd=repo_root, capture_output=True, text=True, check=False
    )
    if res.returncode != 0:
        print(f"      ERROR: PyInstaller build failed:\n{res.stderr}", file=sys.stderr)
        return 1
    print("      PyInstaller packaging SUCCESS.")

    # 4. Verify Bundle Integrity & Security Invariants
    print("[4/5] Verifying bundle integrity and security invariants...")

    has_valid_icon = False

    if sys.platform == "darwin" and (dist_dir / "PiddiAPI.app").exists():
        target_bundle = dist_dir / "PiddiAPI.app"
        bundle_type = "macOS .app Bundle"
        macos_dir = target_bundle / "Contents" / "MacOS"
        resources_dir = target_bundle / "Contents" / "Resources"
        resources_dir.mkdir(parents=True, exist_ok=True)

        launcher_script = macos_dir / "PiddiAPI"
        script_content = r"""#!/bin/bash
# PiddiAPI Native Terminal Launcher
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE="$DIR/piddi_engine"

# If CLI arguments are provided or running in an interactive terminal/TTY, execute directly
if [ "$#" -gt 0 ] || [ -t 0 ] || [ -t 1 ]; then
    exec "$ENGINE" "$@"
fi

# Launched via Finder / GUI double-click without a TTY
# Create secure, private session directory
SESSION_DIR="$(mktemp -d /tmp/piddi_session_XXXXXX)"
chmod 700 "$SESSION_DIR"

cleanup() {
    rm -rf "$SESSION_DIR"
}
trap cleanup EXIT INT TERM HUP

# Create temporary runner script with properly quoted engine path
cat <<EOF > "$SESSION_DIR/run.sh"
#!/bin/bash
echo \$\$ > "$SESSION_DIR/pid"
exec "$ENGINE" "\$@"
EOF
chmod 700 "$SESSION_DIR/run.sh"

# Activate Terminal.app and execute the runner script
osascript -e "tell application \"Terminal\" to activate" \
          -e "tell application \"Terminal\" to do script \"$SESSION_DIR/run.sh\"" >/dev/null 2>&1

# Wait for the child PID to register (up to 10s)
PID=""
for i in {1..100}; do
    if [ -f "$SESSION_DIR/pid" ]; then
        PID="$(cat "$SESSION_DIR/pid" 2>/dev/null || true)"
        if [ -n "$PID" ]; then
            break
        fi
    fi
    sleep 0.1
done

# Keep the LaunchServices bundle process alive while the engine is running
if [ -n "$PID" ]; then
    while kill -0 "$PID" 2>/dev/null; do
        sleep 0.5
    done
fi

exit 0
"""
        launcher_script.write_text(script_content, encoding="utf-8")
        launcher_script.chmod(0o755)
        print("      Created visible Terminal launcher in Contents/MacOS/PiddiAPI.")

        # Ensure ICNS icon is installed in Contents/Resources/
        target_icns = resources_dir / "PiddiAPI.icns"
        if mac_icon.exists():
            shutil.copyfile(mac_icon, target_icns)
            has_valid_icon = True
            print("      Installed PiddiAPI.icns in Contents/Resources/PiddiAPI.icns.")

        # Ensure Info.plist has exact CFBundleIconFile, LSBackgroundOnly=False, LSUIElement=False, CFBundlePackageType=APPL
        plist_file = target_bundle / "Contents" / "Info.plist"
        if plist_file.exists():
            import plistlib

            with plist_file.open("rb") as fp:
                plist_data = plistlib.load(fp)
            plist_data["CFBundleIconFile"] = "PiddiAPI.icns"
            plist_data["LSBackgroundOnly"] = False
            plist_data["LSUIElement"] = False
            plist_data["CFBundlePackageType"] = "APPL"
            with plist_file.open("wb") as fp:
                plistlib.dump(plist_data, fp)
            print(
                "      Verified and synced Info.plist (CFBundleIconFile=PiddiAPI.icns, LSBackgroundOnly=False)."
            )
    else:
        target_bundle = dist_dir / "PiddiAPI"
        bundle_type = "Application Directory"
        if (
            sys.platform.startswith("win")
            and win_icon.exists()
            or sys.platform.startswith("linux")
            and linux_icon.exists()
        ):
            has_valid_icon = True

    if not target_bundle.exists():
        print(f"      ERROR: Expected target {target_bundle} not found!", file=sys.stderr)
        return 1

    # Scan bundle files
    all_bundle_files = list(target_bundle.rglob("*"))
    file_manifest = {}
    security_violations = []

    has_index_html = False
    has_js_assets = False

    for f in all_bundle_files:
        if f.is_file():
            rel_path = str(f.relative_to(target_bundle))
            # Check for illegal user-data in bundle
            if ".piddi" in rel_path or "secrets.json" in rel_path or rel_path.endswith(".env"):
                security_violations.append(rel_path)

            if f.name == "index.html" and "static" in rel_path:
                has_index_html = True
            if f.suffix == ".js" and "assets" in rel_path:
                has_js_assets = True

            # Track files up to first 200 items in manifest
            if len(file_manifest) < 200:
                file_manifest[rel_path] = {
                    "size_bytes": f.stat().st_size,
                    "sha256": compute_sha256(f),
                }

    if security_violations:
        print("      CRITICAL SECURITY VIOLATION: User data found in bundle!", file=sys.stderr)
        for v in security_violations:
            print(f"        - {v}", file=sys.stderr)
        return 1

    if not has_index_html:
        print("      ERROR: piddi/static/index.html missing from bundle!", file=sys.stderr)
        return 1

    if not has_js_assets:
        print("      ERROR: piddi/static/assets/*.js missing from bundle!", file=sys.stderr)
        return 1

    print("      Bundle integrity verified: static UI assets present, 0 user secrets in bundle.")

    # 5. Generate Build Manifest
    print("[5/5] Writing verifiable BUILD_MANIFEST.json...")
    manifest_data = {
        "app_name": "PiddiAPI",
        "version": "0.1.0",
        "build_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python_version": sys.version,
        "platform": f"{platform.system().lower()}-{platform.machine().lower()}",
        "bundle_type": bundle_type,
        "bundle_path": str(target_bundle.relative_to(repo_root)),
        "checks": {
            "icon_present": has_valid_icon,
            "static_index_present": has_index_html,
            "static_js_present": has_js_assets,
            "zero_user_secrets": len(security_violations) == 0,
            "zero_dot_piddi_in_bundle": True,
        },
        "total_bundle_files": len([f for f in all_bundle_files if f.is_file()]),
        "manifest_sample": file_manifest,
    }

    manifest_file = dist_dir / "BUILD_MANIFEST.json"
    manifest_file.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
    print(f"      BUILD_MANIFEST.json written to {manifest_file}.")

    print("=" * 70)
    print(f"  BUILD COMPLETE: {target_bundle}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
