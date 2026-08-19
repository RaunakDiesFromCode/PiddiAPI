# PiddiAPI Development Guide

This guide details the setup, daily development workflow, debugging options, and architectural lifecycle when developing PiddiAPI.

---

## 1. Prerequisites

Ensure the following tools are installed on your workstation:

| Requirement | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Python** | `>= 3.10` | `3.11` or `3.12` | Required for the backend engine and PyInstaller packaging. |
| **Node.js** | `>= 18.0.0` | `20.x LTS` | Required for building and developing the React frontend. |
| **npm** | `>= 9.0.0` | `10.x` | Node package manager (comes bundled with Node.js). |
| **Git** | `>= 2.30.0` | Latest | Version control system. |
| **Windows** | Windows 10/11 x64 | Windows 11 (23H2+) | Supported OS for running, developing, and building `PiddiAPI.exe`. |
| **macOS** | macOS 12+ | macOS 14+ Sonoma | Supported OS for running, developing, and building `PiddiAPI.app`. |

---

## 2. Initial Repository Setup

Clone the repository and set up both backend and frontend environments:

### On Windows (PowerShell):
```powershell
# 1. Clone the project
git clone https://github.com/your-username/PiddiAPI.git
cd PiddiAPI

# 2. Set up Python virtual environment
python -m venv .venv
.venv\Scripts\activate

# 3. Install Python dependencies in editable mode with development tools
pip install -e ".[dev]" pillow

# 4. Install Frontend dependencies
cd frontend
npm install
cd ..
```

### On macOS / Linux (Bash):
```bash
# 1. Clone the project
git clone https://github.com/your-username/PiddiAPI.git
cd PiddiAPI

# 2. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python dependencies in editable mode with development tools
pip install -e ".[dev]" pillow

# 4. Install Frontend dependencies
cd frontend
npm install
cd ..
```

---

## 3. Development Workflow & Running the Application

There are two primary ways to run PiddiAPI during development:

### Option A: Full Development Mode (Hot-Reloading UI + Backend)

This is the standard mode when actively making changes to both the React UI and the Python engine.

1. **Start the Backend Engine** in terminal 1:
   - On Windows: `.venv\Scripts\activate; piddi . --dev --no-browser --port 4111`
   - On macOS/Linux: `source .venv/bin/activate && piddi . --dev --no-browser --port 4111`

2. **Start the Frontend Vite Dev Server** in terminal 2:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser to:
   ```text
   http://localhost:5173
   ```
   *Note: Vite's development server on `5173` automatically proxies all `/api/*` network requests to `http://127.0.0.1:4111`.*

---

### Option B: Standalone Python Mode (Single Process)

This mode runs the production-compiled frontend directly through the Python FastAPI engine, identical to end-user execution:

1. **Compile Frontend Assets**:
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

2. **Launch Piddi CLI**:
   ```bash
   piddi .
   ```

3. Piddi will:
   - Scan for an available loopback port (default: `4111`).
   - Generate a one-time cryptographic session token.
   - Serve static HTML/JS/CSS assets from `piddi/static/`.
   - Automatically launch your default web browser to `http://127.0.0.1:4111?token=...`.

---

## 4. CLI Arguments & Debugging Flags

```bash
piddi [workspace_dir] [options]
```

| Argument / Flag | Default | Description |
| :--- | :--- | :--- |
| `workspace_dir` | Current working directory (`.`) | Directory where `.piddi/` collections, environments, and history will be loaded and saved. |
| `-p`, `--port PORT` | `4111` | Preferred loopback port. If occupied, Piddi scans incrementally (`4112`, `4113`, etc.) until a free port is found. |
| `--no-browser` | `False` | Disables automatic browser launching on startup (ideal for headless testing or separate Vite dev server). |
| `--dev` / `--debug` | `False` | Enables verbose debug logging, unformatted stack traces, and development mode headers. |
| `--console` | `False` | Forces standard console output logging alongside the rotating file handler. |
| `-v`, `--version` | — | Displays current application version and exits. |

---

## 5. Session Authentication & Security in Development

1. **Token Generation**: On startup, `piddi.security.tokens.generate_session_token()` produces a 32-byte URL-safe entropy token.
2. **Frontend Consumption**: When the browser opens `http://127.0.0.1:4111?token=XYZ`:
   - `frontend/src/api/client.ts` captures the token.
   - The token is placed into memory state.
   - `window.history.replaceState` removes `?token=...` from the address bar to prevent shoulder-surfing.
3. **API Validation**: Every subsequent API call transmits the header:
   ```http
   X-Piddi-Token: XYZ
   Host: 127.0.0.1:4111
   ```
4. **Development Token Override**: In frontend dev mode (`npm run dev`), the Vite proxy forwards requests with whatever token is active, or you can supply custom tokens via environment configuration if needed.

---

## 6. Workspace Filesystem Structure

When running against a directory, PiddiAPI maintains:

```text
<workspace_path>/
└── .piddi/
    ├── .gitignore                    # Ensures private secrets are never committed
    ├── collections/
    │   └── col_<id>.json             # Saved request collections
    ├── environments/
    │   ├── env_<id>.json             # Public variables (committed to version control)
    │   └── env_<id>.secrets.json     # Secret variables (mode 0600, ignored by git)
    └── history.jsonl                 # Local execution history log (redacted)
```

Additionally, global application logs and preferences are stored in:
- `~/.piddi/preferences.json` (User UI preferences, e.g. theme, sidebar width, layout).
- `~/.piddi/piddi.log` (Rotating engine execution logs).
- `~/.piddi/temp/` (Spooling directory for large response payload downloads > 10MB).
