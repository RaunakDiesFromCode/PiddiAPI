# PiddiAPI 🚀

> **Fast, local-first API client and testing engine with zero cloud dependency.**

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178c6.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-212%20passed-brightgreen.svg)](#-testing--quality-assurance)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

**PiddiAPI** is a developer-centric, lightweight, local-first API client and testing engine designed for privacy, speed, and Git-native collaboration. It replaces bloated, cloud-dependent GUI clients with a lean Python execution engine and a polished dark-mode web workspace that stores your requests, collections, and environments directly in your repository.

The user interface runs in your default web browser, communicating over an authenticated loopback connection (`127.0.0.1`) with the local Python engine.

---

## ✨ Key Features

- 🔒 **Zero Cloud & Privacy First**: Everything stays strictly on your local machine. No mandatory accounts, no cloud sync, and zero telemetry tracking.
- 📁 **Git-Native Persistence**: Collections and public environment configurations are saved as clean, formatted JSON files inside `.piddi/` in your project workspace.
- 🛡️ **Two-Tier Secrets Vault**: Environment variables are split into version-controlled public files (`env_<id>.json`) and POSIX `0600` local secret files (`env_<id>.secrets.json`) that are automatically gitignored.
- ⚡ **High-Performance Dispatcher**: Powered by `httpx` and `uvicorn` with HTTP/2 support, custom timeouts, redirect policies, and detailed microsecond network phase timings (DNS, TCP, TLS, TTFB, Transfer).
- 🧩 **Variable Interpolation & Dynamic Generators**: Supports `{{base_url}}`, nested variables, and built-in generators (`{{$timestamp}}`, `{{$guid}}`, `{{$randomInt}}`).
- 📜 **Security-Hardened History**: Automatic execution logging with mandatory redaction of literal Authorization tokens, API keys, and sensitive cookies.
- ⌨️ **Command Palette & Ergonomic Shortcuts**: Fast power-user navigation with `⌘K` / `Ctrl+K`, Piddi Application Shortcuts (`⌘⇧N`, `⌘⇧W`, `⌘↵`, `⌘⇧S`), and a 3-tier responsive layout operable down to 600px.
- 🛡️ **Payload Guardrails**: Automatic stream-to-disk protection for responses exceeding 10MB to keep the UI responsive.
- 🖥️ **Native Desktop Distribution**: Self-contained standalone application packages (e.g. macOS `PiddiAPI.app`, Windows `PiddiAPI.exe`, Linux) with native platform icons, automatic Terminal session integration, and browser launch.

---

## 🏗️ Architecture Overview

```text
+-------------------------------------------------------------------------+
|                              USER BROWSER                               |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                       React 18 SPA (Vite)                       |   |
|   |   - Request Composer               - Response Viewer            |   |
|   |   - Command Palette (Cmd+K)        - CodeMirror JSON Editor     |   |
|   |   - Environment Selector           - Zustand State Stores       |   |
|   +-----------------------------------------------------------------+   |
+------------------------------------|------------------------------------+
                                     | HTTP/1.1 Loopback (127.0.0.1)
                                     | Header: X-Piddi-Token: <token>
+------------------------------------v------------------------------------+
|                         PIDDI ENGINE (FastAPI)                          |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                 Security & Host Middleware                      |   |
|   +--------------------------------|--------------------------------+   |
|                                    |                                    |
|   +--------------------------------v--------------------------------+   |
|   |     HTTPX Dispatcher     |    Filesystem Workspace Manager      |   |
|   |   - Timing Tracer        |    - Deterministic JSON Serialization|   |
|   |   - Variable Engine      |    - POSIX 0600 Secrets Vault        |   |
|   |   - Disk Guardrails      |    - History Sanitizer & Redactor    |   |
|   +----------------|-------------------------------|----------------+   |
+--------------------|-------------------------------|--------------------+
                     |                               |
                     v                               v
        +-------------------------+     +-------------------------+
        |   Target External API   |     |  Workspace (.piddi/)    |
        +-------------------------+     +-------------------------+
```

For complete technical specifications, see [docs/architecture/README.md](docs/architecture/README.md).

---

## 🚀 Quick Start

### Option 1: Using the Pre-Packaged Application

#### On Windows:
1. Download **`PiddiAPI-Setup.exe`** from GitHub Releases.
2. Run the installer and follow the setup wizard to install PiddiAPI.
3. Launch PiddiAPI from the Desktop shortcut or Start Menu.
4. Windows Command Console opens automatically with the startup banner, starts the engine, and launches your default web browser to the workspace.
5. When finished, switch to the console window and press `Ctrl+C` for graceful shutdown.

#### On macOS:
1. Download `PiddiAPI.app` from releases or build it locally (`dist/PiddiAPI.app`).
2. Double-click `PiddiAPI.app` in Finder.
3. Apple Terminal opens automatically, starts the engine, and launches your browser to the workspace.
4. When finished, switch to the Terminal window and press `Ctrl+C` for graceful shutdown.

---

### Option 2: Running from Source (Python CLI)

#### 1. Clone & Install Dependencies

**On Windows (PowerShell):**
```powershell
git clone https://github.com/your-username/PiddiAPI.git
cd PiddiAPI

# Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install Piddi in editable mode with development tools
pip install -e ".[dev]"
```

**On macOS / Linux (Bash):**
```bash
git clone https://github.com/your-username/PiddiAPI.git
cd PiddiAPI

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Piddi in editable mode with development tools
pip install -e ".[dev]"
```

#### 2. Build Frontend Static Assets
```bash
cd frontend
npm install
npm run build
cd ..
```

#### 3. Start Piddi
```bash
piddi .
```
Piddi will:
1. Scan for an available local port starting at `4111`.
2. Generate an ephemeral per-session security token.
3. Automatically launch your default web browser to `http://127.0.0.1:4111?token=...`.
4. Initialize the `.piddi/` workspace structure in the selected folder.

---

## ⚙️ Command-Line Interface

```text
usage: piddi [workspace_dir] [--port PORT] [--no-browser] [--dev] [--console] [-v] [-h]

positional arguments:
  workspace_dir         Path to the workspace root directory (default: current directory)

options:
  -p, --port PORT       Preferred starting port (default: 4111)
  --no-browser          Start the backend engine without opening the browser
  --dev, --debug        Enable debug mode with verbose logging and hot reloading
  --console             Attach standard console logging alongside file logging
  -v, --version         Show application version
  -h, --help            Show this help message
```

---

## 🗂️ Project & Workspace Structure

### Project Repository Tree
```text
PiddiAPI/
├── piddi/                    # Python FastAPI Engine & Routers
│   ├── engine/               # HTTPX dispatcher & variable interpolation
│   ├── models/               # Pydantic schemas (Request, Response, Collection, Env)
│   ├── routers/              # REST endpoints (/api/execute, /api/collections, etc.)
│   ├── security/             # Token verification & Host validation middleware
│   ├── storage/              # Atomic JSON persistence, secrets vault, history
│   └── static/               # Bundled frontend production assets
├── frontend/                 # React 18 + TypeScript + Tailwind CSS UI
│   ├── src/components/       # UI components (RequestBuilder, ResponseViewer, Modals)
│   └── src/store/            # Zustand state stores
├── tests/                    # Automated Python backend tests (129 tests)
├── scripts/                  # Automated native packaging build scripts
├── docs/                     # Comprehensive architecture and developer documentation
├── pyproject.toml            # Package configuration and dependencies
├── piddi.spec                # PyInstaller ONEDIR specification (Windows & macOS)
├── README.md                 # Root project overview
└── LICENSE                   # MIT License
```

### Workspace Directory (`<your-project>/.piddi/`)
```text
my-project/
├── .piddi/
│   ├── .gitignore            # Auto-generated: strictly ignores secrets and temp files
│   ├── collections/
│   │   └── col_auth_api.json # Saved requests, headers, params, and body templates
│   ├── environments/
│   │   ├── env_staging.json  # Public environment variables (committed to Git)
│   │   └── env_staging.secrets.json # Sensitive secrets (mode 0600, ignored by Git)
│   └── history.jsonl         # Sanitized execution history log
```

---

## 🧪 Testing & Quality Assurance

PiddiAPI is covered by an automated test suite across both Python and React codebases:

**On Windows (PowerShell):**
```powershell
# Run all 129 Python backend tests
.venv\Scripts\pytest -v

# Run all 84 Frontend component and store tests
cd frontend; npm test -- --run; cd ..

# Run Python linter and formatter checks
.venv\Scripts\ruff check .
.venv\Scripts\ruff format --check .

# Run TypeScript type validation
cd frontend; npx tsc --noEmit; cd ..
```

**On macOS / Linux (Bash):**
```bash
# Run all 129 Python backend tests
.venv/bin/pytest -v

# Run all 84 Frontend component and store tests
cd frontend && npm test -- --run && cd ..

# Run Python linter and formatter checks
.venv/bin/ruff check .
.venv/bin/ruff format --check .

# Run TypeScript type validation
cd frontend && npx tsc --noEmit && cd ..
```

---

## 📦 Building & Native Packaging

To create a standalone native application package on either platform:

### On Windows (PowerShell):
```powershell
# 1. Build frontend and execute PyInstaller ONEDIR packager
.venv\Scripts\python scripts/build_package.py
```
- **Output**: `dist/PiddiAPI/` containing `PiddiAPI.exe` (Self-contained application folder with embedded `PiddiAPI.ico`, console window launcher, and zero startup decompression).
- **Manifest**: `dist/BUILD_MANIFEST.json` (Cryptographic SHA-256 digests and security assertions).

### On macOS (Bash):
```bash
# 1. Build frontend and execute PyInstaller ONEDIR packager
.venv/bin/python scripts/build_package.py
```
- **Output**: `dist/PiddiAPI.app` (Self-contained, double-clickable application bundle with integrated Terminal launcher and `PiddiAPI.icns`).
- **Manifest**: `dist/BUILD_MANIFEST.json` (Cryptographic SHA-256 digests and security assertions).

For full details, see [docs/development/BUILDING.md](docs/development/BUILDING.md) and [docs/development/PACKAGING.md](docs/development/PACKAGING.md).

---

## 📚 Complete Documentation

Explore the detailed documentation in [`docs/`](docs/README.md):

- [Architecture & System Design](docs/architecture/README.md)
- [Technical Specification Contract](docs/architecture/TECHNICAL_SPEC.md)
- [Development Setup Guide](docs/development/DEVELOPMENT.md)
- [Build & Packaging Guide](docs/development/BUILDING.md)
- [Testing & QA Guide](docs/development/TESTING.md)
- [Packaging Specification](docs/development/PACKAGING.md)
- [Troubleshooting & Runbook](docs/operations/TROUBLESHOOTING.md)
- [Historical Phase Audits (Phases 1–6)](docs/phases/)

---

## 🔒 Security Summary

1. **Loopback Isolation**: The engine binds strictly to `127.0.0.1` and validates `Host` headers to prevent DNS rebinding.
2. **Entropy-Backed Token**: Requests require a 256-bit cryptographically secure per-session token (`X-Piddi-Token`).
3. **POSIX 0600 Secrets**: Local secret files are saved with read/write permissions restricted exclusively to the current OS user.
4. **Redaction Engine**: Hardcoded credentials and secret tokens are stripped from history logs before disk serialization.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
