# PiddiAPI Packaging & Distribution Specification

This document details the internal architecture, bundle layout, launcher mechanisms, application icon pipeline, and verification standards used to package PiddiAPI for native desktop distribution across macOS, Windows, and Linux.

---

## 1. Packaging Philosophy & Architecture

PiddiAPI uses **PyInstaller in `ONEDIR` mode** to produce self-contained native application distributions. 

### Why `ONEDIR` over `ONEFILE`?
- **Instant Launch Speed**: `ONEFILE` archives must decompress the entire Python runtime and native shared libraries to a temporary folder (`/tmp/_MEIxxxxxx`) on *every single launch*, causing severe 2–5 second startup latency. `ONEDIR` provides instant, zero-decompression startup.
- **Direct Asset Resolution**: Static assets (`piddi/static/`) are mounted directly from fixed relative paths within the bundle.
- **Robust Code Signing**: Native macOS `.app` code signing and notarization require structured bundle directories (`Contents/MacOS/`, `Contents/Resources/`, `Contents/Frameworks/`).

---

## 2. Application Icon Pipeline

PiddiAPI maintains a single source-of-truth master artwork:
- **Canonical Master Artwork**: `assets/PiddiAPIIcon.png` (1254×1254 RGBA 32-bit PNG)

From this master image, platform-specific icon derivatives are reproducibly generated via `scripts/generate_icons.py`:

```text
                  assets/PiddiAPIIcon.png (Master Artwork)
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
assets/PiddiAPI.icns  assets/PiddiAPI.ico  assets/PiddiAPI.png
  (Apple Iconset)      (Windows Multi-Res)     (512×512 Linux)
         │                   │                   │
         ▼                   ▼                   ▼
    macOS .app          Windows .exe        Linux Desktop
```

### 2.1. Platform Icon Specifications

| Platform | Format & Path | Resolutions Included | Packaging Mechanism |
| :--- | :--- | :--- | :--- |
| **macOS** | `assets/PiddiAPI.icns` | 16×16, 32×32, 64×64, 128×128, 256×256, 512×512, 1024×1024 (with `@2x` retina variants) | Copied into `Contents/Resources/PiddiAPI.icns` and declared in `Info.plist` |
| **Windows** | `assets/PiddiAPI.ico` | 16×16, 24×24, 32×32, 48×48, 64×64, 128×128, 256×256 (32-bit RGBA PNG container) | Embedded as PE binary icon via PyInstaller `EXE(..., icon="assets/PiddiAPI.ico")` |
| **Linux** | `assets/PiddiAPI.png` | 512×512 High-Res RGBA PNG | Included in static data directory and referenced by FreeDesktop `.desktop` entry |

### 2.2. Regenerating Platform Icons
To manually rebuild all platform icons from `assets/PiddiAPIIcon.png`:
```bash
python scripts/generate_icons.py
```
`scripts/build_package.py` automatically checks for platform icons before every build and regenerates them if missing.

---

## 3. macOS Application Bundle Layout

On macOS, the build generates a standard Apple Application Bundle at `dist/PiddiAPI.app`:

```text
dist/PiddiAPI.app/
└── Contents/
    ├── Info.plist                    # Apple Application Property List
    ├── MacOS/
    │   ├── PiddiAPI                  # Executable bash launcher wrapper (mode 0755)
    │   └── piddi_engine              # Compiled PyInstaller entrypoint executable
    └── Resources/                    # App metadata and icon assets
        └── PiddiAPI.icns             # Multi-resolution macOS Application Icon
```

Alongside the `.app`, PyInstaller produces the frozen engine directory:
```text
dist/piddi_engine/
├── piddi_engine                      # Native compiled bootstrap binary
├── _internal/                        # Bundled Python runtime, C-extensions, stdlib .pyz
│   ├── base_library.zip
│   ├── libpython3.14.dylib
│   ├── pydantic_core/
│   ├── httpx/
│   ├── uvicorn/
│   └── piddi/
│       └── static/                   # Bundled React SPA assets
│           ├── index.html
│           └── assets/
│               ├── index-*.js
│               └── index-*.css
```

---

## 4. macOS Launcher Script & Terminal Integration

To satisfy the requirement that double-clicking `PiddiAPI.app` in Finder opens an interactive Terminal session:

1. **Executable Role**: `Info.plist` defines `CFBundleExecutable = "PiddiAPI"`.
2. **Terminal Launcher**: `Contents/MacOS/PiddiAPI` contains an AppleScript-powered shell wrapper:
   ```bash
   #!/bin/bash
   set -e
   DIR="$(cd "$(dirname "$0")" && pwd)"
   ENGINE="$DIR/piddi_engine"

   # If arguments provided or already attached to a TTY, execute directly
   if [ "$#" -gt 0 ] || [ -t 0 ] || [ -t 1 ]; then
       exec "$ENGINE" "$@"
   fi

   # GUI Launch: Create secure session temp directory
   SESSION_DIR="$(mktemp -d /tmp/piddi_session_XXXXXX)"
   chmod 700 "$SESSION_DIR"

   cleanup() {
       rm -rf "$SESSION_DIR"
   }
   trap cleanup EXIT INT TERM HUP

   # Emit runner script
   cat <<EOF > "$SESSION_DIR/run.sh"
   #!/bin/bash
   echo \$\$ > "$SESSION_DIR/pid"
   exec "$ENGINE" "\$@"
   EOF
   chmod 700 "$SESSION_DIR/run.sh"

   # Activate Terminal.app and execute runner script
   osascript -e "tell application \"Terminal\" to activate" \
             -e "tell application \"Terminal\" to do script \"$SESSION_DIR/run.sh\"" >/dev/null 2>&1

   # Track child process and wait until engine terminates
   PID=""
   for i in {1..100}; do
       if [ -f "$SESSION_DIR/pid" ]; then
           PID="$(cat "$SESSION_DIR/pid" 2>/dev/null || true)"
           [ -n "$PID" ] && break
       fi
       sleep 0.1
   done

   if [ -n "$PID" ]; then
       while kill -0 "$PID" 2>/dev/null; do
           sleep 0.5
       done
   fi
   exit 0
   ```

### 4.1. `Info.plist` Invariants
The bundle's `Info.plist` is explicitly validated to ensure:
- `CFBundleIconFile = "PiddiAPI.icns"`
- `LSBackgroundOnly = False` (Application is not a hidden background daemon)
- `LSUIElement = False` (Application is a standard user application)
- `CFBundlePackageType = "APPL"`

---

## 5. Path Resolution: Frozen vs Source

PiddiAPI dynamically detects its execution environment via `piddi/paths.py`:

```python
import sys
from pathlib import Path


def is_frozen() -> bool:
    """Returns True if running within a PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def get_bundle_dir() -> Path:
    """Returns the base bundle directory or the source repository root."""
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def get_static_dir() -> Path:
    """Returns the directory containing static frontend assets."""
    if is_frozen():
        return get_bundle_dir() / "piddi" / "static"
    return Path(__file__).resolve().parent / "static"


def get_user_piddi_home() -> Path:
    """Returns global user data directory (~/.piddi)."""
    p = Path.home() / ".piddi"
    p.mkdir(parents=True, exist_ok=True)
    return p
```

---

## 6. Build Verification & Integrity Manifest

Every packaging run produces `dist/BUILD_MANIFEST.json`, which computes SHA-256 digests of all bundled assets and asserts key security invariants:

```json
{
  "app_name": "PiddiAPI",
  "version": "0.1.0",
  "build_timestamp": "2026-08-16T11:13:30Z",
  "python_version": "3.14.0",
  "platform": "darwin-arm64",
  "bundle_type": "macOS .app Bundle",
  "bundle_path": "dist/PiddiAPI.app",
  "checks": {
    "icon_present": true,
    "static_index_present": true,
    "static_js_present": true,
    "zero_user_secrets": true,
    "zero_dot_piddi_in_bundle": true
  },
  "total_bundle_files": 313
}
```

---

## 7. Platform Implementation & Verification Status

| Platform | Target Package | Icon | Status | Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **macOS (Apple Silicon & Intel)** | `PiddiAPI.app` (ONEDIR) | `PiddiAPI.icns` | **BUILT & RUNTIME VERIFIED** | Tested on macOS. Icon verified in Finder/Dock, Terminal launcher, readiness polling, browser opening, and graceful shutdown verified. |
| **Windows** | `PiddiAPI.exe` (ONEDIR) | `PiddiAPI.ico` | **CONFIGURED (Spec Ready)** | `piddi.spec` configured with `PiddiAPI.ico` and `console=True`. |
| **Linux** | `PiddiAPI` executable (ONEDIR) | `PiddiAPI.png` | **CONFIGURED (Spec Ready)** | `piddi.spec` configured with `PiddiAPI.png` data embedding and `console=True`. |
