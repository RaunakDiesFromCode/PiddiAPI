# PiddiAPI Operations & Troubleshooting Guide

This guide provides diagnostic procedures, root cause explanations, and verified remediation steps for common runtime and configuration issues in PiddiAPI.

---

## Quick Diagnostic Index

1. [🔴 UI Shows "Engine Offline" or Network Errors](#1-ui-shows-engine-offline-or-network-errors)
2. [🔴 HTTP 403 Forbidden on API Requests](#2-http-403-forbidden-on-api-requests)
3. [🔴 Port Already in Use on Startup](#3-port-already-in-use-on-startup)
4. [🔴 Browser Does Not Open Automatically](#4-browser-does-not-open-automatically)
5. [🔴 macOS PiddiAPI.app Fails to Launch Terminal](#5-macos-piddiapiapp-fails-to-launch-terminal)
6. [🔴 Static Assets Missing (Blank Page or 404 on Assets)](#6-static-assets-missing-blank-page-or-404-on-assets)
7. [🔴 Secret Variables Not Resolving or Permission Denied](#7-secret-variables-not-resolving-or-permission-denied)
8. [🔴 Corrupted or Invalid JSON in Collections/Environments](#8-corrupted-or-invalid-json-in-collectionsenvironments)

---

### 1. UI Shows "Engine Offline" or Network Errors

#### Symptoms
- Red banner in UI header indicating `Engine Offline`.
- Request executions fail immediately with "Network Error" or "Unable to connect to loopback engine".

#### Root Cause
- The backend FastAPI daemon is either not running, was terminated, or is bound to a different port than the frontend expects.

#### Diagnostic Command
```bash
# Check if Piddi process is running
pgrep -fl piddi

# Check if loopback port 4111 is actively listening
lsof -i :4111
```

#### Fix
1. Restart the backend engine:
   ```bash
   piddi . --port 4111
   ```
2. If running the Vite frontend dev server (`localhost:5173`), ensure `frontend/vite.config.ts` has the proxy target set to `http://127.0.0.1:4111`.

---

### 2. HTTP 403 Forbidden on API Requests

#### Symptoms
- API calls return HTTP status code `403 Forbidden` with body:
  `{"detail": "Invalid or missing security token"}` or `{"detail": "Invalid Host header"}`.

#### Root Cause
- **Token Mismatch**: The request omitted or sent an outdated `X-Piddi-Token` header.
- **Host Header Violation**: Request sent a non-loopback Host header (e.g. DNS rebinding protection triggered).
- **Origin Violation**: Request initiated from an unauthorized origin domain.

#### Diagnostic Command
```bash
# Test loopback health endpoint with explicit token
curl -i -H "X-Piddi-Token: <YOUR_SESSION_TOKEN>" http://127.0.0.1:4111/api/health
```

#### Fix
1. Ensure you access PiddiAPI through the launched URL containing the ephemeral token parameter (`?token=...`).
2. If calling via `curl` or external automation, pass the correct `X-Piddi-Token` header printed in the engine startup banner.

---

### 3. Port Already in Use on Startup

#### Symptoms
- Warning in CLI log: `Port 4111 is occupied. Scanning for next available port...`.

#### Root Cause
- Another process (or a previous orphan instance of Piddi) is already listening on `127.0.0.1:4111`.

#### Diagnostic Command
```bash
lsof -i :4111
```

#### Fix
- **Automatic Handling**: Piddi automatically detects the conflict and increments to the next available port (`4112`, `4113`, etc.).
- **Manual Cleanup**: To kill the process occupying `4111`:
  ```bash
  kill -9 $(lsof -t -i :4111)
  ```

---

### 4. Browser Does Not Open Automatically

#### Symptoms
- The engine starts and prints the startup banner, but your default web browser does not open.

#### Root Cause
- The CLI was invoked with `--no-browser`, or the default OS browser handler failed or timed out during the health check poll.

#### Diagnostic Command
```bash
# Test manual URL access in browser
open "http://127.0.0.1:4111"
```

#### Fix
1. Copy the full URL with the token printed in the Terminal output (e.g. `http://127.0.0.1:4111?token=...`) and paste it into your browser.
2. In headless/CI environments, use `--no-browser` explicitly.

---

### 5. macOS PiddiAPI.app Fails to Launch Terminal

#### Symptoms
- Double-clicking `PiddiAPI.app` in Finder results in no visible window or an immediate exit.

#### Root Cause
- macOS permissions restriction for AppleScript controlling Terminal.app, or missing executable permissions on `Contents/MacOS/PiddiAPI`.

#### Diagnostic Command
```bash
# Verify execute permissions on the launcher script
ls -la dist/PiddiAPI.app/Contents/MacOS/

# Run the launcher script directly from terminal to inspect output
./dist/PiddiAPI.app/Contents/MacOS/PiddiAPI
```

#### Fix
1. Grant execute permissions:
   ```bash
   chmod +x dist/PiddiAPI.app/Contents/MacOS/PiddiAPI
   chmod +x dist/PiddiAPI.app/Contents/MacOS/piddi_engine
   ```
2. If prompted by macOS for Automation permission ("PiddiAPI wants to control Terminal"), click **Allow** in System Settings -> Privacy & Security -> Automation.

---

### 6. Static Assets Missing (Blank Page or 404 on Assets)

#### Symptoms
- Navigating to `http://127.0.0.1:4111` displays a blank white screen, or browser DevTools shows `404 Not Found` for `/assets/index-*.js`.

#### Root Cause
- Frontend static assets were not compiled before packaging or running the standalone Python engine.

#### Diagnostic Command
```bash
ls -la piddi/static/ piddi/static/assets/
```

#### Fix
Rebuild the frontend bundle:
```bash
cd frontend
npm run build
cd ..
```

---

### 7. Secret Variables Not Resolving or Permission Denied

#### Symptoms
- Requests send raw literal `{{secret_name}}` strings instead of resolved values.
- File manager logs `PermissionError` when reading `.secrets.json`.

#### Root Cause
- The secrets file has corrupted permissions or was created under a different OS user account.

#### Diagnostic Command
```bash
ls -la .piddi/environments/
```

#### Fix
1. Ensure the secret file permissions are `0600` (`-rw-------` owned by the current user):
   ```bash
   chmod 600 .piddi/environments/*.secrets.json
   ```
2. Verify that variable keys match exact case-sensitive names in the active environment.

---

### 8. Corrupted or Invalid JSON in Collections/Environments

#### Symptoms
- Warning in engine log: `Skipping malformed collection file ...: Invalid JSON`.

#### Root Cause
- A JSON file in `.piddi/collections/` or `.piddi/environments/` was edited manually and contains syntax errors (trailing commas, unclosed brackets, etc.).

#### Diagnostic Command
```bash
# Validate collection JSON files
python3 -m json.tool .piddi/collections/*.json > /dev/null
```

#### Fix
- Fix syntax errors in the JSON file using standard JSON formatting.
- PiddiAPI isolates malformed files and continues running safely without crashing the server.
