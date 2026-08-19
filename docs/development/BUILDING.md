# PiddiAPI Building & Packaging Guide

This document is the official, step-by-step guide for performing reproducible production builds and creating native standalone desktop application packages of PiddiAPI on **Windows** and **macOS**.

---

## 1. Build Pipeline Overview

The complete build pipeline proceeds in five deterministic stages across all platforms:

```text
[1. Source Checkout] 
       │
       ▼
[2. Frontend Compilation] ──► Vite + TypeScript ──► piddi/static/ (HTML, JS, CSS)
       │
       ▼
[3. Test & Lint Suite]   ──► Pytest (129) + Vitest (84) + Ruff + tsc
       │
       ▼
[4. PyInstaller Package] ──► ONEDIR Frozen Engine + Platform Launcher + Embedded Icons
       │
       ▼
[5. Invariant Audit]     ──► SHA-256 Manifest + 0-Secrets Verification
                                │
       ┌────────────────────────┴────────────────────────┐
       ▼                                                 ▼
Windows Package (dist/PiddiAPI/PiddiAPI.exe)    macOS Package (dist/PiddiAPI.app)
```

---

## 2. Step-by-Step Production Build Workflow

### Step 1: Clean Repository State

Clear all ephemeral caches, build outputs, and Python bytecode.

**On Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue build, dist, frontend/dist
Get-ChildItem -Path piddi/static -Exclude index.html, assets | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Filter "__pycache__" -Recurse -Directory | Remove-Item -Recurse -Force
Get-ChildItem -Path . -Filter "*.pyc" -Recurse -File | Remove-Item -Force
```

**On macOS / Linux (Bash):**
```bash
rm -rf build/ dist/ frontend/dist/ piddi/static/*
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete
```

---

### Step 2: Install All Dependencies

**On Windows (PowerShell):**
```powershell
# 1. Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate

# 2. Install backend package with dev tools and Pillow (for icon generation)
pip install -e ".[dev]" pillow

# 3. Install frontend dependencies
cd frontend
npm ci
cd ..
```

**On macOS / Linux (Bash):**
```bash
# 1. Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install backend package with dev tools and Pillow
pip install -e ".[dev]" pillow

# 3. Install frontend dependencies
cd frontend
npm ci || npm install
cd ..
```

---

### Step 3: Compile Frontend Assets

Build the production Single Page Application directly into `piddi/static/`:

**On All Platforms:**
```bash
cd frontend
npm run build
cd ..
```

*Verification*: Check that `piddi/static/index.html` and `piddi/static/assets/*.js`, `piddi/static/assets/*.css` exist.

---

### Step 4: Run Automated Quality Gates

All verification suites must pass with zero errors before packaging:

**On Windows (PowerShell):**
```powershell
# 1. Type check frontend
cd frontend; npx tsc --noEmit; cd ..

# 2. Run frontend unit & component tests (84 tests)
cd frontend; npm test -- --run; cd ..

# 3. Check Python formatting and lint rules
.venv\Scripts\ruff check .
.venv\Scripts\ruff format --check .

# 4. Run full Python test suite (129 tests)
.venv\Scripts\pytest -v
```

**On macOS / Linux (Bash):**
```bash
# 1. Type check frontend
cd frontend && npx tsc --noEmit && cd ..

# 2. Run frontend unit & component tests (84 tests)
cd frontend && npm test -- --run && cd ..

# 3. Check Python formatting and lint rules
.venv/bin/ruff check .
.venv/bin/ruff format --check .

# 4. Run full Python test suite (129 tests)
.venv/bin/pytest -v
```

---

### Step 5: Execute Native Packaging Script

Run the automated cross-platform builder:

**On Windows (PowerShell):**
```powershell
.venv\Scripts\python scripts/build_package.py
```

**On macOS / Linux (Bash):**
```bash
.venv/bin/python scripts/build_package.py
```

This script automatically:
1. Validates and generates platform icon derivatives (`assets/PiddiAPI.ico` on Windows, `assets/PiddiAPI.icns` on macOS).
2. Verifies or compiles `piddi/static/` via Vite.
3. Executes PyInstaller in `ONEDIR` mode using `piddi.spec`.
4. Configures platform entrypoints:
   - **Windows**: Embeds `PiddiAPI.ico` as the Windows PE binary icon in `dist/PiddiAPI/PiddiAPI.exe` with console window support.
   - **macOS**: Injects the native Terminal launcher script into `dist/PiddiAPI.app/Contents/MacOS/PiddiAPI` and validates `Info.plist` properties.
5. Scans all bundled files to enforce zero secret leakage (`.piddi/`, `.env`, `*.secrets.json`).
6. Emits cryptographic `dist/BUILD_MANIFEST.json` with SHA-256 digests.

---

## 3. Locating & Inspecting Build Artifacts

Upon a successful build, the following files are produced in `dist/`:

### Windows Distribution Outputs

| Path | Type | Description |
| :--- | :--- | :--- |
| `dist/PiddiAPI/PiddiAPI.exe` | Windows PE Executable | Main entrypoint binary with embedded icon and console window integration. |
| `dist/PiddiAPI/_internal/` | Directory | Bundled Python runtime, C-extensions, stdlib `.pyz`, and `piddi/static/` assets. |
| `dist/BUILD_MANIFEST.json` | JSON Document | Verifiable build record containing checksums, platform metadata, and invariant checks. |

### macOS Distribution Outputs

| Path | Type | Description |
| :--- | :--- | :--- |
| `dist/PiddiAPI.app` | macOS Application Bundle | Self-contained, double-clickable macOS bundle with `PiddiAPI.icns` and Apple Terminal launcher. |
| `dist/piddi_engine/` | Directory | Frozen Python executable runtime and compiled dynamic libraries. |
| `dist/BUILD_MANIFEST.json` | JSON Document | Verifiable build record containing checksums, platform metadata, and invariant checks. |

### Inspecting `BUILD_MANIFEST.json`

Verify the manifest contents:
```bash
# Windows PowerShell:
Get-Content dist/BUILD_MANIFEST.json | ConvertFrom-Json | Select-Object -ExpandProperty checks

# macOS / Linux Bash:
cat dist/BUILD_MANIFEST.json
```

Ensure that:
- `"icon_present": true`
- `"static_index_present": true`
- `"static_js_present": true`
- `"zero_user_secrets": true`
- `"zero_dot_piddi_in_bundle": true`

---

## 4. Platform-Specific Runtime & Launcher Behavior

### 4.1. Windows Native Distribution (`PiddiAPI.exe`)

```text
Windows Explorer (User Double-Clicks PiddiAPI.exe)
       │
       ▼
PiddiAPI Console Window Spawns (Command Prompt Console)
       │
       ▼
PiddiAPI Engine Starts & Binds to 127.0.0.1:4111 (or scans 4112+)
       │
       ▼
Default Browser Opens (http://127.0.0.1:4111?token=...)
       │
       ▼
User Works in React Web UI
       │
       ▼
User Focuses Console Window & Presses Ctrl+C (or closes console)
       │
       ▼
Graceful Engine Shutdown (Port Released, History Flushed, 0 Orphan Processes)
```

#### Windows Behavioral Invariants:
1. **Console Visibility**: Double-clicking `PiddiAPI.exe` launches a visible console window showing the PiddiAPI startup banner, local URL, active workspace directory, and live request logs.
2. **Browser Decoupling**: Closing the browser tab does **not** stop the engine. You can open multiple tabs or reopen the browser anytime while the console is open.
3. **Controlled Termination**: Pressing `Ctrl+C` in the console cleanly shuts down Uvicorn, flushes pending history disk writes, and releases loopback ports.

---

### 4.2. macOS Native Distribution (`PiddiAPI.app`)

```text
Finder (User Double-Clicks PiddiAPI.app)
       │
       ▼
PiddiAPI.app (LaunchServices Executable Wrapper)
       │
       ▼
Apple Terminal.app Opens (Live Server Console Window)
       │
       ▼
piddi_engine Starts & Binds to 127.0.0.1:4111
       │
       ▼
Default Browser Opens (http://127.0.0.1:4111?token=...)
       │
       ▼
User Works in React Web UI
       │
       ▼
User Switches to Terminal & Presses Ctrl+C
       │
       ▼
Graceful Engine Shutdown (Port Released, Logs Flushed)
```

---

## 5. Build Output vs User Data Separation

It is critical to distinguish build artifacts from user data across all operating systems:

| Classification | File Path (Windows) | File Path (macOS / Linux) | Commit to Git? |
| :--- | :--- | :--- | :--- |
| **Application Package** | `dist/PiddiAPI/` | `dist/PiddiAPI.app` | ❌ No (`.gitignore`) |
| **Intermediate Build Cache** | `build/` | `build/` | ❌ No (`.gitignore`) |
| **Global User Preferences** | `%USERPROFILE%\.piddi\preferences.json` | `~/.piddi/preferences.json` | ❌ No (User Home) |
| **Global Runtime Logs** | `%USERPROFILE%\.piddi\piddi.log` | `~/.piddi/piddi.log` | ❌ No (User Home) |
| **Project Workspace Data** | `<workspace>\.piddi\` | `<workspace>/.piddi/` | ✅ Yes (`.piddi/environments/*.secrets.json` ignored) |
