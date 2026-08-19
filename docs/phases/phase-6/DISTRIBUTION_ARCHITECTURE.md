# Phase 6: Native Distribution & One-Click Launcher Architecture

**Status**: APPROVED WITH AMENDMENTS  
**Target Milestone**: Phase 6 — Native Distribution & One-Click Launcher  
**Target Artifacts**: `PiddiAPI.app` (macOS), `PiddiAPI/` with `PiddiAPI.exe` (Windows), `PiddiAPI/` (Linux)  
**Security Tier**: High (Local Loopback Isolated, Cryptographic Session Token, Zero Secret Leakage)  
**Author**: Antigravity Systems & Security Architect  

---

## 1. Executive Summary

Phase 5 concluded with the full certification of PiddiAPI v1 (115/115 backend pytest tests passing, 73/73 frontend vitest tests passing, ruff compliant, 0 errors). The core application is a fast, local-first API testing engine combining an async Python/FastAPI backend with a modern React/Vite web interface.

The objective of **Phase 6** is to deliver a native one-click distribution package for macOS (`PiddiAPI.app`), Windows (`PiddiAPI.exe` within application directory), and Linux (`PiddiAPI` application directory) without altering the fundamental architectural invariants of the project:
1. **Zero Desktop GUI Frameworks**: No Electron (avoiding multi-hundred megabyte runtime bloat), no Tauri, and no PyWebView (avoiding native GUI deadlocks and WebKitGTK packaging complexities).
2. **The Default Browser Remains the UI**: The launcher starts the engine and immediately opens the user's default browser to the locally served React application.
3. **Browser Lifecycle Decoupled from Engine Lifecycle**: Closing the browser window/tab does NOT kill the backend engine. The user can close tabs, reopen `http://127.0.0.1:<port>/`, or open multiple tabs concurrently. Process termination is an explicit, platform-appropriate action.
4. **The FastAPI/Python Engine Remains the Core**: The execution dispatcher, variable resolution, and local file storage systems run unmodified within the bundled runtime.
5. **Zero User Data in the Application Bundle**: Workspace collections (`.piddi/collections/`), environments (`.piddi/environments/`), secret vaults (`*.secrets.json`), history (`~/.piddi/history.jsonl`), preferences (`~/.piddi/preferences.json`), and logs (`~/.piddi/piddi.log`) strictly reside outside the application bundle.

---

## 2. Current Architecture (Phase 5 Baseline)

The existing PiddiAPI architecture consists of:
- **Backend**: Python 3.10+ package (`piddi`) containing FastAPI routers, Uvicorn ASGI server, HTTPX execution engine, and asynchronous file storage managers.
- **Frontend**: Single Page Application (React 18, TypeScript, Tailwind CSS, Zustand, CodeMirror 6) built via Vite into `piddi/static/`.
- **CLI Entrypoint**: `piddi/cli.py` (`piddi` command), which:
  1. Resolves workspace directory from `sys.argv[1]` or defaults to `.` (`os.getcwd()`).
  2. Scans for an available port in the range `4111`–`4120`.
  3. Generates a 32-byte hexadecimal session token (`secrets.token_hex(32)`).
  4. Configures rotating file logs to `~/.piddi/piddi.log`.
  5. Dynamically injects the session token into `piddi/static/index.html` on `GET /`.
  6. Launches the default browser in a background thread via `webbrowser.open()`.
  7. Runs Uvicorn synchronously on `127.0.0.1:<port>`.

### Current Limitations Addressed by Phase 6:
- Requires a pre-installed Python 3.10+ environment and virtual environment setup (`pip install -e .`).
- Standalone execution without a terminal on macOS/Windows requires native packaging metadata, application icons, and frozen-bundle path resolution abstractions.
- Browser launch must use deterministic health readiness polling against `/api/health` rather than timer delays.

---

## 3. Target Packaged Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          User Launches Application                          │
│        macOS: PiddiAPI.app | Windows: PiddiAPI.exe | Linux: PiddiAPI        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Native PiddiAPI Launcher Engine                       │
│  • Resolves frozen bundle paths (sys._MEIPASS / Contents/MacOS)             │
│  • Establishes application logging to ~/.piddi/piddi.log                    │
│  • Resolves workspace directory (CLI argument, cwd, or remembered)          │
│  • Selects available loopback port (4111 -> 4120)                            │
│  • Generates cryptographic 32-byte session token                            │
│  • Spawns background deterministic readiness poller                         │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
                   ▼ (Main Thread)                         ▼ (Background Thread)
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     Bundled Python / FastAPI Core    │  │       Readiness Poller Task       │
│  • Uvicorn bound to 127.0.0.1:<port> │  │  • Polls GET /api/health with    │
│  • Serves /api REST endpoints        │  │    X-Piddi-Token header           │
│  • Serves static React bundle        │  │  • On HTTP 200 OK: opens browser  │
│  • Injects <meta name="piddi-token"> │  │    to http://127.0.0.1:<port>/     │
└──────────────────┬───────────────────┘  └───────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         System Default Web Browser                          │
│  • Navigates to http://127.0.0.1:<port>/                                    │
│  • Receives compiled React SPA with injected session token                  │
│  • React ApiClient executes authenticated requests via X-Piddi-Token        │
│  • Browser closure does NOT kill backend; tabs can be reopened freely       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Packaging Technology & Mode Comparison

### Packaging Technologies Overview:
- **PyInstaller**: Mature upstream ASGI hooks (`uvicorn`, `fastapi`, `anyio`, `pydantic`, `httpx`), native macOS `.app` bundle support, fast reproducible build pipeline.
- **Nuitka**: C-transpilation causes fragile async frame introspection with FastAPI/Starlette, requires complex native C compiler toolchains, and increases build times to 15+ minutes.
- **PyOxidizer**: Dormant upstream development; high configuration complexity with compiled wheels.
- **Shiv / PEX / Zipapp**: Requires host Python installation; fails standalone clean-machine requirement.

---

### Detailed Comparison: PyInstaller ONEDIR vs ONEFILE

| Evaluation Dimension | PyInstaller ONEDIR (Recommended) | PyInstaller ONEFILE |
|---|---|---|
| **Cold Startup Time** | **Instantaneous (150–250ms)**. Binary and shared libraries are directly mapped from disk. | **Slow (600–1500ms)**. Entire 40MB+ compressed archive must decompress to a temporary directory on every launch. |
| **Temporary Extraction Overhead** | **Zero**. No runtime decompression into `/tmp` or `%TEMP%`. `sys._MEIPASS` points to the application folder. | **High**. Extracts hundreds of files to `/tmp/_MEIxxxxxx` (POSIX) or `AppData\Local\Temp\_MEIxxxxxx` (Windows). |
| **Antivirus & Heuristics** | **Low False-Positive Risk**. Files reside in plain directory on install/unpack. | **High False-Positive Risk**. Self-extracting stub binaries unpacking executables into `%TEMP%` frequently trigger Windows Defender / corporate EDR alerts. |
| **Asset & Static File Access** | **Direct & Predictable**. `piddi/static/` is immediately accessible at a permanent path. | Requires extracting every static chunk, CSS, and HTML file to temp storage on boot. |
| **Disk Cleanup & Crash Recovery** | **Clean**. No temporary directories left behind if the process is killed or the machine loses power. | **Dirty**. Hard kills (SIGKILL, power outage, Task Manager kill) orphan extraction directories in `%TEMP%`, consuming disk space over time. |
| **Application Bundle Layout** | **Native**. Maps 1:1 to macOS `.app` standard (`Contents/MacOS/`, `Contents/Resources/`). On Windows, resides in clean app directory. | Creates an artificial single `.exe` that defeats native macOS `.app` structures. |
| **Debugging & Diagnostics** | **Transparent**. Developers and users can inspect bundled binaries, static assets, and dependency metadata directly. | Opaque. Requires extracting the archive or running specialized unpacking tools to diagnose issues. |
| **Future Delta Updates** | **Efficient**. Enables replacing individual bytecode or static assets without redownloading the entire bundle. | Inefficient. Every minor update requires redownloading and replacing the entire monolithic binary. |

### **Recommendation: PyInstaller ONEDIR Mode**
PyInstaller in **ONEDIR** mode is selected for Phase 6.
- **macOS**: Built as a native `PiddiAPI.app` bundle containing the onedir runtime in `Contents/MacOS/` and `Contents/Resources/`.
- **Windows**: Built as a `PiddiAPI` application folder containing `PiddiAPI.exe` and supporting DLLs (distributable as a `.zip` or installer).
- **Linux**: Built as a `PiddiAPI` application folder containing the `PiddiAPI` executable (distributable as a `.tar.gz`).

---

## 5. Recommended Packaging Technology

### **Specification: PyInstaller ONEDIR with `piddi.spec`**

1. **Zero Runtime Host Dependencies**: Operates on clean machines with no Python, Node.js, npm, or developer toolchains installed.
2. **First-Class ASGI Support**: Uses standard upstream hooks for `uvicorn`, `fastapi`, `starlette`, `anyio`, `httpx`, `pydantic`, and `pydantic_core`.
3. **Platform-Native Layouts**:
   - macOS: Standard `PiddiAPI.app` with `Info.plist`, application icon (`piddi.icns`), and correct Apple Silicon (`arm64`) / Intel (`x86_64`) architecture.
   - Windows: `PiddiAPI/` application directory containing `PiddiAPI.exe` with embedded version resources and application icon (`piddi.ico`).
   - Linux: `PiddiAPI/` application directory with standalone ELF launcher.
4. **Deterministic Static Asset Embedding**: Bundles `piddi/static/` directly into the package structure.
5. **Verifiable & Reproducible Builds**: Fast (<60s per platform) builds on standard GitHub Actions runners with dependency locking.

---

## 6. Process Architecture & Tradeoff Analysis

### **Selection: Option A (Single Unified In-Process Architecture)**
The packaged executable runs as a single, cohesive operating system process. The launcher initializes paths, port bindings, session tokens, and spawns the background readiness poller, then runs Uvicorn on the main event loop.

### Explicit Tradeoff Documentation:
- **Design Tradeoff**: If the unified PiddiAPI process crashes or is terminated, the backend engine also terminates immediately.
- **Intentional Rationale**: This behavior is deliberate and required. It guarantees that no orphan or zombie backend processes survive in the background to silently consume memory, lock workspace files, or hold network ports (4111–4120).
- **Subprocess Comparison**: Spawning the backend as a child subprocess introduces severe risks on Windows and macOS where parent termination does not reliably kill child processes without complex OS Job Objects. Option A eliminates orphan backend risks entirely.

---

## 7. Application Lifecycle & Explicit Termination

### Browser vs Application Lifecycle Separation:
Because the UI is hosted in the user's default web browser, **the browser lifecycle is completely decoupled from the PiddiAPI application lifecycle**:
1. **Closing the Browser Tab/Window**:
   - Does **NOT** terminate the PiddiAPI backend engine.
   - The engine continues listening on `127.0.0.1:<port>`.
   - All state, active collections, environments, and background tasks remain intact.
2. **Reopening the Browser**:
   - The user can reopen `http://127.0.0.1:<port>/` at any time in any browser tab or window.
   - The root handler serves the React SPA with the active session token injected, immediately restoring the UI session.
3. **Multiple Tabs / Windows**:
   - Multiple browser tabs can access `http://127.0.0.1:<port>/` simultaneously.
   - Each tab communicates with the same active engine instance authenticated via `X-Piddi-Token`.

---

### Explicit Application Termination Mechanisms (By Platform):

PiddiAPI's lifecycle is intentionally anchored to its visible control console:

- **macOS (`PiddiAPI.app`)**:
  - Double-clicking `PiddiAPI.app` in Finder automatically opens a visible **Terminal.app window** running the PiddiAPI engine.
  - The Terminal window serves as the application's interactive control console, displaying startup banner, port, workspace, and live engine logs.
  - Pressing **`Ctrl+C`** in the PiddiAPI Terminal console is the primary termination mechanism, triggering graceful shutdown.
  - Standard process signals (`SIGINT` / `SIGTERM` via `kill <pid>` or Activity Monitor) also trigger graceful shutdown.
- **Windows (`PiddiAPI.exe`)**:
  - Running `PiddiAPI.exe` executes in a visible command console window.
  - Pressing **`Ctrl+C`** in the terminal console initiates graceful shutdown.
  - Closing the console window or terminating via Task Manager cleanly stops the engine.
- **Linux (`PiddiAPI`)**:
  - Executing `PiddiAPI` runs in the active terminal session.
  - Pressing **`Ctrl+C`** in the terminal initiates graceful shutdown.

### Graceful Shutdown Sequence:
Upon receiving a termination signal (`SIGINT` via `Ctrl+C` in the terminal, `SIGTERM`, or `CTRL_CLOSE_EVENT`):
1. Terminal delivers `SIGINT` / `KeyboardInterrupt` to the engine.
2. Uvicorn initiates ASGI shutdown sequence.
3. FastAPI lifespan context manager executes exit block:
   - Awaits `HistoryManager.flush_pending_tasks(timeout=3.0)` to ensure all pending history writes are flushed to disk.
   - Closes HTTPX client connection pools cleanly via `ClientManager.close()`.
4. Process prints `\nPiddiAPI Engine shutdown complete.`, releases loopback port immediately, and exits with exit code `0`.
5. Zero orphan background processes survive the shutdown.

---

## 8. Authoritative Engine Readiness via `/api/health`

### Readiness Polling Protocol:
The launcher must not use `GET /` or arbitrary sleep timers as readiness indicators. The `/api/health` endpoint is the authoritative readiness signal:

```
Launcher Starts Uvicorn Server
                │
                ▼
Background Readiness Poller Thread
                │
                ├── Polls http://127.0.0.1:<port>/api/health
                │   • Headers:
                │       Host: 127.0.0.1:<port>
                │       X-Piddi-Token: <session_token>
                │   • Interval: 50ms
                │   • Max Timeout: 5.0s (100 attempts)
                │
                ├── Validates Response:
                │   • HTTP Status == 200 OK
                │   • JSON Body contains { "status": "ok", "version": "..." }
                │
                └── Once Validated:
                    • Calls webbrowser.open("http://127.0.0.1:<port>/")
                    • Background poller thread exits cleanly
```

### Protocol Invariants:
1. **Authoritative Health Check**: Polling hits `http://127.0.0.1:<port>/api/health` with `X-Piddi-Token` matching the in-memory session token.
2. **Root Endpoint Dedicated to Frontend**: `GET /` is accessed strictly by the browser to load the HTML/React bundle with token injection.
3. **No Arbitrary Delays**: The browser opens the millisecond `/api/health` returns `200 OK`.
4. **Timeout Safety**: If `/api/health` does not respond with 200 within 5.0 seconds, the poller logs an error to `~/.piddi/piddi.log` and aborts browser opening, preventing blank/broken browser tabs while allowing the engine to continue starting if disk I/O was slow.

---

## 9. Static Asset Packaging & Centralized Path Abstraction

### Centralized Path Resolver (`piddi/paths.py`):
To prevent scattering `if frozen` or `sys._MEIPASS` checks across the codebase, a single path abstraction module is introduced:

```python
import sys
from pathlib import Path


def get_bundle_dir() -> Path:
    """Return the base directory of the running application (source or PyInstaller frozen bundle)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def get_static_dir() -> Path:
    """Return the absolute path to packaged frontend static assets."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "piddi" / "static"
    return Path(__file__).resolve().parent / "static"
```

### Static Asset Verification:
The build pipeline verifies the presence of:
- `piddi/static/index.html` (containing `<meta name="piddi-token" content="" />`)
- `piddi/static/assets/index-*.js` (compiled React application)
- `piddi/static/assets/index-*.css` (compiled Tailwind styles)

---

## 10. Application Directory Boundaries & User Data Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BUNDLED APPLICATION FILES                          │
│   (Read-Only, Immutable, Discarded on Update / Reinstall)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  • CPython runtime & dynamic shared libraries (.so / .dylib / .dll)         │
│  • Piddi core Python bytecode & dependencies (FastAPI, Uvicorn, HTTPX)       │
│  • Frontend static assets (piddi/static/index.html, /assets/*.js, *.css)    │
│  • Package metadata, icons, and licenses                                    │
│                                                                             │
│  ⚠️ STRICT INVARIANT: ZERO USER DATA EVER WRITTEN TO THIS DIRECTORY          │
└─────────────────────────────────────────────────────────────────────────────┘

                                     ▲
                             BOUNDARY │ ISOLATION
                                     ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER DATA FILES                                │
│   (Persistent, User-Owned, Version-Controlled, Outside Application Bundle)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Workspace-Specific Data (<workspace_path>/.piddi/):                     │
│     ├── collections/          <- Git-tracked JSON collection files          │
│     ├── environments/         <- Environment definitions                    │
│     │   ├── *.json            <- Non-sensitive variables (Git-tracked)      │
│     │   └── *.secrets.json    <- Isolated secrets (chmod 0o600, Git-ignored)│
│     └── .gitignore            <- Auto-generated local exclusion rules       │
│                                                                             │
│  2. Global User-Profile Data (~/.piddi/):                                   │
│     ├── preferences.json      <- Machine-specific settings (active env)     │
│     ├── history.jsonl         <- Circular request history buffer (200 items)│
│     ├── history.jsonl.tmp     <- Atomic rewrite scratch file                │
│     ├── piddi.log             <- Rotating engine diagnostic logs (5MB x 3)  │
│     └── temp/                 <- Ephemeral execution scratch directory      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Workspace Discovery Semantics (Preserving Phase 1–5 Invariants)

The workspace discovery semantics preserve certified Phase 1–5 behavior with explicit handling across launch modes:

1. **Terminal / CLI Launch (`piddi [workspace]`)**:
   - If an explicit path argument is passed (e.g. `piddi /path/to/project`), it resolves to that exact path.
   - If no argument is passed, it resolves to `Path(os.getcwd()).resolve()` (current working directory).
2. **GUI Desktop Launch (macOS Finder, Windows Explorer, Linux Desktop Entry)**:
   - When launched by double-clicking without arguments, operating systems set `os.getcwd()` to root (`/`), user home (`~`), or the application directory.
   - To provide an intuitive user experience without polluting root directories:
     - Checks `~/.piddi/preferences.json` for a valid, existing `last_workspace_path`.
     - If valid and directory exists, loads that workspace.
     - If invalid, missing, or pointing to root/bundle, falls back to `~/PiddiWorkspace` (or `~/.piddi/default_workspace`).
3. **Workspace Invariants**:
   - `WorkspaceFileManager.ensure_workspace_structure(workspace_path)` always ensures `.piddi/collections/` and `.piddi/.gitignore` exist.
   - `EnvironmentFileManager.ensure_environments_structure(workspace_path)` always ensures `.piddi/environments/` and `.piddi/.gitignore` exist.

---

## 12. Multiple-Instance Behavior

PiddiAPI fully supports running multiple concurrent instances:

1. **Dynamic Port Allocation**: Instance 1 binds to `4111`. Instance 2 detects port 4111 is busy and automatically claims `4112` (scanning through `4120`).
2. **Cryptographic Token Isolation**: Each instance generates an independent 32-byte session token in memory. Requests from Instance 1 cannot reach Instance 2.
3. **Storage Concurrency**:
   - Workspace collections and environments are scoped to their respective workspace directory.
   - Global `~/.piddi/preferences.json` and `~/.piddi/history.jsonl` use atomic file replacement (`os.replace`) with asynchronous locking, preventing file corruption across concurrent instances.

---

## 13. Console & Logging Architecture: Separation of `--console` and `--dev`

### Explicit CLI Flag Separation:

- **`--console`**:
  - **Purpose**: Controls terminal log output visibility.
  - **Behavior**: Directs backend and application logs to `stdout`/`stderr` in addition to the rotating file log (`~/.piddi/piddi.log`).
  - **Security Impact**: **Zero**. Does NOT weaken loopback binding, token authentication, host validation, or origin validation.
- **`--dev`**:
  - **Purpose**: Controls developer diagnostics and OpenAPI documentation.
  - **Behavior**: Enables `/api/docs` (Swagger UI), `/api/openapi.json`, and allows Vite dev server origins (`localhost:5173`) in CORS/Host middleware for local frontend development. Sets log level to `DEBUG`.
  - **Security Invariant**: **Never weakens loopback binding**. Engine remains bound strictly to `127.0.0.1`. Host header, Origin header, and `X-Piddi-Token` verification remain strictly active.

### Production Desktop Default:
- Runs windowed with logs written to `~/.piddi/piddi.log` (Rotating: 5MB max, 3 backups, UTF-8 encoded).

---

## 14. Comprehensive Security Model & Invariants

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY DEFENSE IN DEPTH                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Loopback-Only Binding:                                                    │
│    • Uvicorn binds strictly to 127.0.0.1. Never 0.0.0.0 or external IPs.    │
│                                                                             │
│ 2. Host Header Rebinding Guard:                                             │
│    • Middleware rejects requests where Host != 127.0.0.1:<port> or localhost│
│                                                                             │
│ 3. Origin Header SSRF Guard:                                                │
│    • Middleware strictly validates Origin header against loopback origins.  │
│    • External web origins receive HTTP 403 FORBIDDEN.                       │
│                                                                             │
│ 4. Session Token Authentication:                                            │
│    • All /api endpoints require matching X-Piddi-Token header.             │
│    • Token is generated per-run, held only in process memory, and injected  │
│      into the served HTML meta tag.                                         │
│    • Token is NEVER exposed in CLI arguments, process lists, or browser URLs.│
│                                                                             │
│ 5. Clean Bundle Guarantee:                                                  │
│    • Zero user API keys, secrets, or workspace files in build artifacts.    │
│    • Build exclusion rules strictly omit .piddi/, .env, and local caches.   │
│                                                                             │
│ 6. Secret Vault Isolation:                                                  │
│    • Workspace secret vaults (*.secrets.json) are created with 0o600        │
│      filesystem permissions (owner read/write only) and added to .gitignore.│
│                                                                             │
│ 7. Path Traversal Guard:                                                    │
│    • All file manager routes verify path containment using is_relative_to().│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Platform Targets & Build Matrix

| Platform | Architecture | Target OS Version | Distribution Output | Build Host Required |
|---|---|---|---|---|
| **macOS** | Apple Silicon (`arm64`) | macOS 12.0+ (Monterey+) | `PiddiAPI-darwin-arm64.dmg` containing `PiddiAPI.app` | macOS `arm64` Runner |
| **macOS** | Intel (`x86_64`) | macOS 11.0+ (Big Sur+) | `PiddiAPI-darwin-x64.dmg` containing `PiddiAPI.app` | macOS `x86_64` Runner |
| **Windows** | x64 (`AMD64`) | Windows 10 / 11 (x64) | `PiddiAPI-Setup.exe` (Inno Setup Installer) & `dist/PiddiAPI/` app directory | Windows Runner |
| **Linux** | x64 (`x86_64`) | Ubuntu 20.04+, Debian 11+, Fedora 36+ (GLIBC ≥ 2.31) | `PiddiAPI-linux-x64.tar.gz` containing `PiddiAPI/` app directory | Linux x64 Runner |

---

## 16. Code Signing & Distribution Requirements

### Local Developer & Evaluation Builds:
- **macOS**: Ad-hoc code signing (`codesign --force --deep -s - PiddiAPI.app`).
- **Windows**: Unsigned binary for internal testing (requires dismissing SmartScreen warning on first run).
- **Linux**: Native binary with executable permissions (`chmod +x PiddiAPI`).

### Public Production Release Requirements:
- **macOS**: Apple Developer ID Application certificate, Hardened Runtime (`--options runtime`), entitlements allowing loopback networking, and Apple Notarization via `xcrun notarytool`.
- **Windows**: Authenticode Standard or EV Code Signing Certificate via `signtool.exe` to establish Windows SmartScreen reputation.
- **Linux**: Distribution via standalone `.tar.gz` or AppImage.

---

## 17. Update Strategy & Future Roadmap

- **Phase 6 Scope**: Focuses strictly on the distribution engine and one-click packaging. No automatic updater client or background auto-updater dependency is introduced in Phase 6.
- **Future Update Pathways**: The ONEDIR structure enables future in-place binary replacement or GitHub Releases release checking without requiring architectural refactoring.

---

## 18. Clean Machine Testing Strategy & Failure Modes

### Verification Matrix on Clean Environments (Zero Python, Zero Node.js):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLEAN MACHINE TEST WORKFLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Launch Verification:                                                     │
│    • Double-click PiddiAPI.app / PiddiAPI.exe / ./PiddiAPI                  │
│    • Verify backend starts on loopback without error dialogs                │
│                                                                             │
│ 2. Health & Browser Handshake:                                              │
│    • Readiness poller detects 200 OK from /api/health                       │
│    • Default browser opens automatically to http://127.0.0.1:4111/          │
│    • React SPA loads successfully with dark theme and UI intact             │
│                                                                             │
│ 3. Browser Decoupling Verification:                                         │
│    • Close the browser tab -> verify backend continues running              │
│    • Reopen http://127.0.0.1:4111/ in a new tab -> verify full functionality│
│                                                                             │
│ 4. Full Feature Lifecycle Verification:                                     │
│    • Create collection -> persisted to <workspace>/.piddi/collections/      │
│    • Create environment & secret -> secret saved to *.secrets.json (0o600)  │
│    • Send HTTP Request -> receives canonical response with headers & body   │
│    • History recorded -> sanitized snapshot appended to ~/.piddi/history    │
│    • Code snippet generator -> produces cURL/fetch/httpx snippets           │
│                                                                             │
│ 5. Explicit Application Termination & Persistence:                          │
│    • Explicitly terminate app (Cmd+Q, Dock Quit, Ctrl+C, or Task Manager)   │
│    • Verify zero zombie backend processes remain in Activity Monitor/TaskMgr│
│    • Relaunch application -> all collections, environments, history restored│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Adversarial & Failure Mode Test Cases:
1. **Port Conflict**: Launch a dummy server on `127.0.0.1:4111`, launch PiddiAPI -> verifies smooth fallback to `4112`.
2. **Corrupted History File**: Inject invalid JSON syntax into `~/.piddi/history.jsonl`, launch PiddiAPI -> verifies app starts without crash and skips bad lines.
3. **Missing Workspace Directory**: Pass a non-existent path to launcher -> verifies directory is automatically created with `.piddi/`.
4. **Host Header Spoofing**: Attempt to send request with `Host: evil.com` -> receives HTTP 403 Forbidden.

---

## 19. Phase 6 Acceptance Criteria

- [ ] **AC-P6-1 (Clean Machine Execution)**: A user on macOS, Windows, or Linux can launch PiddiAPI without Python, Node.js, npm, or any development tooling installed.
- [ ] **AC-P6-2 (Strict Loopback Binding)**: Backend engine binds strictly to `127.0.0.1` and is inaccessible from external network interfaces.
- [ ] **AC-P6-3 (Deterministic Health Readiness via `/api/health`)**: Launcher uses HTTP readiness polling against `/api/health` before initiating browser launch; zero arbitrary sleep delays.
- [ ] **AC-P6-4 (Automatic Browser Launch)**: Default system browser opens automatically to `http://127.0.0.1:<port>/`.
- [ ] **AC-P6-5 (Browser Lifecycle Decoupling)**: Closing the browser tab or window does not terminate the backend engine; sessions can be reopened seamlessly.
- [ ] **AC-P6-6 (Embedded Frontend Serving)**: React SPA loads correctly from bundled static assets within the ONEDIR package.
- [ ] **AC-P6-7 (Request Execution Parity)**: HTTP request dispatcher executes requests with HTTP/1.1, HTTP/2, custom headers, and query parameters identical to CLI mode.
- [ ] **AC-P6-8 (Collection Persistence)**: Collections persist to `.piddi/collections/*.json` and survive application restart.
- [ ] **AC-P6-9 (Environment Persistence)**: Environments persist to `.piddi/environments/*.json` and survive application restart.
- [ ] **AC-P6-10 (Secret Vault Isolation)**: Secrets remain isolated in `.piddi/environments/*.secrets.json` with `0o600` permissions and never leak to history.
- [ ] **AC-P6-11 (History Persistence)**: Request history persists to `~/.piddi/history.jsonl` with automatic circular buffer pruning.
- [ ] **AC-P6-12 (Explicit Graceful Shutdown)**: Explicit application termination (Cmd+Q, Dock Quit, Ctrl+C, or Task Manager) cleanly flushes pending background tasks and closes connection pools.
- [ ] **AC-P6-13 (Zero Orphan Processes)**: No background Python or engine processes remain after explicit application shutdown.
- [ ] **AC-P6-14 (Directory Boundary Enforcement)**: No user data, secrets, history, or logs are written into the application bundle or temporary extraction folders.
- [ ] **AC-P6-15 (Deterministic Port Fallback)**: When port 4111 is occupied, the application automatically scans and binds to the next available port in range `4111`–`4120`.
- [ ] **AC-P6-16 (Arbitrary Working Directory Execution)**: The packaged application functions correctly when invoked from any arbitrary directory.
- [ ] **AC-P6-17 (Regression Guard)**: All existing Phase 1–5 backend tests (115) and frontend tests (73) remain 100% passing.
- [ ] **AC-P6-18 (Reproducible & Verifiable Builds)**: Building from source using pinned dependencies, pinned Python/PyInstaller versions, and documented native build environments produces verifiable artifacts with documented file manifests, version metadata, and SHA-256 hashes.
- [ ] **AC-P6-19 (Zero Secret Leakage in Artifacts)**: Packaged application bundles contain zero `.piddi/` user directories, `.secrets.json` files, or development tokens.

---

## 20. Implementation Order & Phased Execution

When Phase 6 execution begins, implementation will follow this exact dependency sequence:

1. **Step 1: Centralized Path & Bundle Resolver (`piddi/paths.py`)**  
   Create the frozen-aware path resolution module and integrate it into `piddi/config.py` and `piddi/main.py`.
2. **Step 2: Deterministic Readiness Poller (`piddi/launcher.py`)**  
   Implement the `/api/health` readiness poller and integrate with the browser launch subsystem.
3. **Step 3: CLI Flag Refinement (`--console` vs `--dev`)**  
   Update `piddi/cli.py` to cleanly separate console logging from developer mode flags.
4. **Step 4: Frontend Build Integration**  
   Ensure `frontend/` production build cleanly deposits assets into `piddi/static/`.
5. **Step 5: PyInstaller ONEDIR Specification (`piddi.spec`)**  
   Define data files, binary dependencies, hidden imports (`uvicorn`, `pydantic_core`, `anyio`), application icons, and packaging rules.
6. **Step 6: Local Packaging & Binary Validation**  
   Build native packages on macOS, Windows, and Linux; verify binary size, startup time, and resource footprint.
7. **Step 7: Clean Machine & Adversarial Audit**  
   Execute the full verification matrix across clean VMs/test environments against all acceptance criteria.

---

## 21. Decisions Requiring User Approval

All design decisions have been reconciled and are documented in Section 22 below for final sign-off.

---

## 22. Approved Phase 6 Decisions

The following architectural decisions are established as the canonical baseline for Phase 6 implementation:

1. **Packaging Framework**: **PyInstaller**.
2. **Packaging Layout**: **ONEDIR** mode (wrapped in `PiddiAPI.app` on macOS, application directory on Windows/Linux) unless implementation testing proves otherwise.
3. **Process Architecture**: **Single unified operating system process** (Launcher + FastAPI/Uvicorn in one process).
4. **Readiness Signal**: **`/api/health` readiness polling** with `X-Piddi-Token` authentication; root `GET /` is reserved exclusively for frontend browser loading.
5. **UI & Browser Decoupling**: **The browser is the UI**; closing the browser window/tab does NOT terminate the PiddiAPI backend engine.
6. **Application Termination**: **Visible Terminal/Console as Control Console**; pressing `Ctrl+C` in the terminal console triggers graceful FastAPI/Uvicorn shutdown (flushing pending history tasks within bounded 3.0s timeout and closing connection pools). Closing the browser alone does NOT terminate the backend.
7. **User Data Boundaries**: **User data remains strictly outside the application bundle** (`<workspace>/.piddi/`, `~/.piddi/`).
8. **Loopback Security Invariants**: **Loopback security remains unchanged**; `--dev` and `--console` flags never weaken loopback binding, Host validation, Origin validation, or session token authentication.
9. **Build Verification**: **Reproducible/verifiable builds** based on pinned dependencies, Python/PyInstaller versions, artifact manifests, and SHA-256 hashes rather than byte-for-byte binary parity.
