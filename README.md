# PiddiAPI 🚀

> **Fast, local-first API client and testing engine with zero cloud dependency.**

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178c6.svg)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac.svg)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/tests-194%20passed-brightgreen.svg)](#testing)

PiddiAPI is a developer-centric, lightweight, local-first API client designed for privacy, speed, and Git-native collaboration. It replaces bloated, cloud-dependent GUI clients with a lean Python execution engine and a polished dark-mode web workspace that stores your requests, collections, and environments directly in your repository.

---

## ✨ Features

- 🔒 **Zero Cloud & Privacy First**: Everything stays on your local machine (`127.0.0.1`). No accounts, no cloud sync, no telemetry tracking.
- 📁 **Git-Native Persistence**: Collections and public environment configurations are saved as clean, formatted JSON files in `.piddi/` inside your project directory.
- 🛡️ **Two-Tier Secrets Vault**: Environment variables are split into version-controlled public files (`env_<id>.json`) and POSIX `0600` local secret files (`env_<id>.secrets.json`) that are automatically gitignored.
- ⚡ **High-Performance Dispatcher**: Powered by `httpx` and `uvicorn` with HTTP/2 support, custom timeouts, redirect policies, and detailed microsecond network phase timings (DNS, TCP, TLS, TTFB, Transfer).
- 🧩 **Variable Interpolation & Dynamic Generators**: Supports `{{base_url}}`, nested variables, and built-in generators (`{{$timestamp}}`, `{{$guid}}`, `{{$randomInt}}`).
- 📜 **Security-Hardened History**: Automatic execution logging with mandatory redaction of literal Authorization tokens, API keys, and sensitive cookies.
- ⌨️ **Command Palette & Ergonomic Shortcuts**: Fast power-user navigation with `⌘K` / `Ctrl+K`, Piddi Application Shortcuts (`⌘⇧N`, `⌘⇧W`, `⌘↵`, `⌘⇧S`), and a 3-tier responsive layout operable down to 600px.
- 🔄 **Two-Way cURL & Code Generation**: Instant cURL paste parsing and multi-language code export (Python `requests`/`httpx`, JavaScript `fetch`, cURL).
- 🛡️ **Payload Guardrails**: Automatic stream-to-disk protection for responses exceeding 10MB to keep the UI smooth and responsive.

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Browser["Frontend Workspace (React + CodeMirror + Tailwind)"]
        UI[Request Composer & Response Panel]
        CP[Command Palette & Shortcuts]
        ST[Zustand State Stores]
        UI --> ST
        CP --> ST
    end

    subgraph Backend["Local Python Engine (FastAPI + httpx) @ 127.0.0.1"]
        Sec[Security Middleware / Token Validation]
        Disp[HTTP Dispatcher & Timing Tracer]
        Hist[Sanitizing History Writer]
        FM[Workspace & Environment File Manager]
        
        ST -- "Loopback API (X-Piddi-Token)" --> Sec
        Sec --> Disp
        Sec --> FM
        Disp --> Hist
    end

    subgraph Disk["Local Project Filesystem (.piddi/)"]
        Col[".piddi/collections/*.json (Git Tracked)"]
        EnvPub[".piddi/environments/env_*.json (Git Tracked)"]
        EnvSec[".piddi/environments/env_*.secrets.json (0600 / Ignored)"]
        HistLog[".piddi/history.jsonl (Redacted)"]
        
        FM <--> Col
        FM <--> EnvPub
        FM <--> EnvSec
        Hist --> HistLog
    end

    subgraph Target["External / Local Target APIs"]
        Disp -- "HTTP/1.1 & HTTP/2" --> Target
    end
```

---

## 🚀 Quick Start

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/PiddiAPI.git
cd PiddiAPI

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Piddi in editable mode with development tools
pip install -e ".[dev]"
```

### 2. Build Frontend Assets

```bash
cd frontend
npm install
npm run build
cd ..
```

### 3. Launch PiddiAPI

Run `piddi` pointing to your current repository or any directory:

```bash
piddi .
```

Piddi will:
1. Scan for an available local port starting at `4111`.
2. Generate an ephemeral per-session security token.
3. Automatically launch your default web browser to `http://127.0.0.1:4111?token=...`.
4. Initialize the `.piddi/` workspace structure in the selected folder.

---

## ⚙️ Command Line Options

```text
usage: piddi [workspace_dir] [--port PORT] [--no-browser] [--debug]

positional arguments:
  workspace_dir         Path to the workspace root directory (defaults to current directory)

options:
  -p, --port PORT       Preferred starting port (default: 4111)
  --no-browser          Start the backend engine without opening the browser
  --debug               Enable debug mode with verbose logging and hot reloading
  -v, --version         Show application version
  -h, --help            Show this help message
```

---

## 🗂️ Workspace File Format

PiddiAPI stores all data as deterministic, human-readable JSON files in `.piddi/`:

```text
my-project/
├── .piddi/
│   ├── .gitignore                # Auto-generated: ignores secrets and temp files
│   ├── collections/
│   │   └── col_auth_api.json     # Requests, headers, params, and body templates
│   ├── environments/
│   │   ├── env_staging.json      # Public environment variables (committed to Git)
│   │   └── env_staging.secrets.json  # Sensitive vault (mode 0600, ignored by Git)
│   └── history.jsonl             # Sanitized execution history log
```

### Example: Collection File (`col_user_api.json`)
```json
{
  "schema_version": 1,
  "id": "col_user_api",
  "name": "User Service API",
  "description": "Endpoints for user management",
  "created_at": "2026-08-15T12:00:00Z",
  "updated_at": "2026-08-15T12:00:00Z",
  "requests": [
    {
      "id": "req_get_profile",
      "name": "Get Current User Profile",
      "method": "GET",
      "url": "{{base_url}}/api/v1/users/me",
      "headers": {
        "Accept": "application/json"
      },
      "query_params": {},
      "auth": {
        "type": "bearer",
        "token": "{{jwt_token}}"
      },
      "body": {
        "type": "none"
      },
      "settings": {
        "timeout_ms": 10000,
        "follow_redirects": true,
        "verify_ssl": true
      }
    }
  ]
}
```

---

## ⌨️ Keyboard Shortcuts

| Action | Piddi Recommended Shortcut | Browser Best-Effort |
| :--- | :--- | :--- |
| **Send Request** | `⌘↵` / `Ctrl+↵` | `⌘↵` / `Ctrl+↵` |
| **New Scratchpad Tab** | `⌘⇧N` / `Ctrl+Shift+N` | `⌘T` / `Ctrl+T` |
| **Close Active Tab** | `⌘⇧W` / `Ctrl+Shift+W` | `⌘W` / `Ctrl+W` |
| **Save to Collection** | `⌘⇧S` / `Ctrl+Shift+S` | `⌘S` / `Ctrl+S` |
| **Command Palette** | `⌘⇧K` / `Ctrl+Shift+K` | `⌘K` / `Ctrl+K` |
| **Toggle Sidebar** | `⌘⇧B` / `Ctrl+Shift+B` | `⌘B` / `Ctrl+B` |
| **Shortcuts Reference** | `?` | `?` |

> *Note: All actions are 100% accessible via visible UI buttons. Keyboard shortcuts serve as power-user enhancements.*

---

## 🧪 Testing & Verification

PiddiAPI includes an automated test suite covering unit tests, adversarial security checks, concurrency tests, and end-to-end integration flows.

### Run Backend Tests (Pytest)
```bash
.venv/bin/pytest -v
```

### Run Frontend Tests (Vitest)
```bash
cd frontend
npm test
```

### Run Linters and Formatters
```bash
.venv/bin/ruff check .
.venv/bin/ruff format --check .
```

---

## 🔒 Security Architecture

1. **Loopback Isolation**: The backend server binds strictly to `127.0.0.1` and validates the `Host` header to block DNS rebinding.
2. **Entropy-Backed Token**: Requests require a 256-bit cryptographically secure per-session bearer token (`X-Piddi-Token`).
3. **CORS & Origin Hardening**: Only requests with matching localhost origins and valid tokens are processed.
4. **POSIX 0600 Secrets**: Local secret files are saved with read/write permissions restricted exclusively to the current OS user.
5. **Redaction Engine**: Hardcoded credentials and secret tokens are stripped from history logs before disk serialization.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
