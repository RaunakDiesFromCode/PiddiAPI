# PiddiAPI Building & Packaging Guide

This document is the official, step-by-step guide for performing reproducible production builds and creating native standalone desktop application packages of PiddiAPI.

---

## 1. Build Pipeline Overview

The complete build pipeline proceeds in four main stages:

```text
[1. Source Checkout] 
       │
       ▼
[2. Frontend Compilation] ──► Vite + TypeScript ──► piddi/static/ (HTML, JS, CSS)
       │
       ▼
[3. Test & Lint Suite]   ──► Pytest (128) + Vitest (84) + Ruff + tsc
       │
       ▼
[4. PyInstaller Package] ──► ONEDIR Frozen Engine + macOS Terminal Wrapper
       │
       ▼
[5. Invariant Audit]     ──► SHA-256 Manifest + 0-Secrets Verification ──► dist/PiddiAPI.app
```

---

## 2. Step-by-Step Production Build Workflow

### Step 1: Clean Repository State
Ensure all ephemeral caches and old build artifacts are cleared:
```bash
rm -rf build/ dist/ frontend/dist/ piddi/static/*
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete
```

### Step 2: Install All Dependencies
```bash
# Python dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Frontend dependencies
cd frontend
npm ci || npm install
cd ..
```

### Step 3: Compile Frontend Assets
Build the production Single Page Application directly into `piddi/static/`:
```bash
cd frontend
npm run build
cd ..
```
*Verification*: Check that `piddi/static/index.html` and `piddi/static/assets/*.js`, `piddi/static/assets/*.css` exist.

### Step 4: Run Automated Verification Suite
All quality gates must pass before packaging:
```bash
# 1. Type check frontend
cd frontend && npx tsc && cd ..

# 2. Run frontend unit & component tests
cd frontend && npm test -- --run && cd ..

# 3. Check Python formatting and lint rules
.venv/bin/ruff check .
.venv/bin/ruff format --check .

# 4. Run full Python test suite
.venv/bin/pytest -v
```

### Step 5: Execute Native Packaging Script
Run the automated packaging builder:
```bash
.venv/bin/python scripts/build_package.py
```

This script automatically:
1. Validates or recompiles `piddi/static/`.
2. Executes PyInstaller in `ONEDIR` mode using `piddi.spec`.
3. Injects the native Terminal launcher script into `dist/PiddiAPI.app/Contents/MacOS/PiddiAPI` (on macOS).
4. Verifies `Info.plist` properties (`LSBackgroundOnly=False`, `LSUIElement=False`).
5. Scans all bundled files to ensure zero user credentials (`.piddi`, `.env`, `*.secrets.json`) exist in the package.
6. Emits `dist/BUILD_MANIFEST.json` with SHA-256 digests.

---

## 3. Locating & Inspecting Build Artifacts

Upon a successful build, the following files are produced in `dist/`:

| Path | Type | Description |
| :--- | :--- | :--- |
| `dist/PiddiAPI.app` | macOS App Bundle | Self-contained, clickable macOS application bundle. |
| `dist/piddi_engine/` | Directory | Frozen Python executable runtime and compiled dynamic libraries. |
| `dist/BUILD_MANIFEST.json` | JSON Document | Verifiable build record containing checksums and environment metadata. |

### Inspecting `BUILD_MANIFEST.json`
Verify the manifest contents:
```bash
cat dist/BUILD_MANIFEST.json
```
Ensure that:
- `"static_index_present": true`
- `"static_js_present": true`
- `"zero_user_secrets": true`
- `"zero_dot_piddi_in_bundle": true`

---

## 4. macOS Native Distribution Behavior

PiddiAPI on macOS provides a transparent, developer-first desktop experience:

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
User Works in Web UI
       │
       ▼
User Switches to Terminal & Presses Ctrl+C
       │
       ▼
Graceful Engine Shutdown (Port Released, Logs Flushed)
```

### Key Behavioral Invariants:
1. **System Browser as UI**: Rather than embedding a heavy Electron webview (which bloats download size by ~200MB+ and wastes system RAM), PiddiAPI uses the user's native web browser.
2. **Terminal Visibility**: The Terminal window displays real-time server output, execution timings, and error diagnostics.
3. **Closing Browser vs Server**: Closing the browser tab does **not** terminate the server (preventing accidental loss of work). The server lifecycle is explicitly controlled via the Terminal window using `Ctrl+C`.

---

## 5. Build Output vs User Data Separation

It is critical to distinguish build artifacts from user data:

| Classification | File Path | Purpose | Commit to Git? |
| :--- | :--- | :--- | :--- |
| **Application Package** | `dist/PiddiAPI.app` | Read-only compiled binary bundle. | ❌ No (`.gitignore`) |
| **Intermediate Build Cache** | `build/` | PyInstaller temporary object cache. | ❌ No (`.gitignore`) |
| **Global User Preferences** | `~/.piddi/preferences.json` | Machine-level UI preferences and state. | ❌ No (User Home) |
| **Global Runtime Logs** | `~/.piddi/piddi.log` | Rotating engine execution logs. | ❌ No (User Home) |
| **Project Workspace Data** | `<workspace>/.piddi/` | Collections, public environments, and history. | ✅ Yes (`.piddi/environments/*.secrets.json` ignored) |
