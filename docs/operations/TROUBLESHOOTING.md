# PiddiAPI Operations & Troubleshooting Guide

This guide provides diagnostic procedures, root cause explanations, and verified remediation steps for common runtime and configuration issues across Windows and macOS.

---

## Quick Diagnostic Index

1. [🔴 UI Shows "Engine Offline" or Network Errors](#1-ui-shows-engine-offline-or-network-errors)
2. [🔴 HTTP 403 Forbidden on API Requests](#2-http-403-forbidden-on-api-requests)
3. [🔴 Port Already in Use on Startup](#3-port-already-in-use-on-startup)
4. [🔴 Browser Does Not Open Automatically](#4-browser-does-not-open-automatically)
5. [🔴 Windows SmartScreen / Windows Defender Warning on `PiddiAPI.exe`](#5-windows-smartscreen--windows-defender-warning-on-piddiapiexe)
6. [🔴 macOS PiddiAPI.app Fails to Launch Terminal](#6-macos-piddiapiapp-fails-to-launch-terminal)
7. [🔴 Static Assets Missing (Blank Page or 404 on Assets)](#7-static-assets-missing-blank-page-or-404-on-assets)
8. [🔴 Secret Variables Not Resolving or Permission Denied](#8-secret-variables-not-resolving-or-permission-denied)
9. [🔴 Corrupted or Invalid JSON in Collections/Environments](#9-corrupted-or-invalid-json-in-collectionsenvironments)

---

### 1. UI Shows "Engine Offline" or Network Errors

#### Symptoms
- Red banner in UI header indicating `Engine Offline`.
- Request executions fail immediately with "Network Error" or "Unable to connect to loopback engine".

#### Root Cause
- The backend FastAPI daemon is either not running, was terminated, or is bound to a different port than the frontend expects.

#### Diagnostic Commands

**On Windows (PowerShell):**
```powershell
# Check if Piddi process is running
Get-Process PiddiAPI, python -ErrorAction SilentlyContinue

# Check if loopback port 4111 is actively listening
netstat -ano | findstr :4111
```

**On macOS / Linux (Bash):**
```bash
# Check if Piddi process is running
pgrep -fl piddi

# Check if loopback port 4111 is actively listening
lsof -i :4111
```

#### Fix
1. Restart the backend engine:
   - On Windows: `piddi . --port 4111` or run `dist\PiddiAPI\PiddiAPI.exe`
   - On macOS: `piddi . --port 4111` or double-click `dist/PiddiAPI.app`
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

#### Diagnostic Commands

**On Windows (PowerShell):**
```powershell
netstat -ano | findstr :4111
```

**On macOS / Linux (Bash):**
```bash
lsof -i :4111
```

#### Fix
- **Automatic Handling**: Piddi automatically detects the conflict and increments to the next available port (`4112`, `4113`, etc.).
- **Manual Cleanup**:
  - On Windows: `Stop-Process -Id <PID> -Force` (where `<PID>` is the PID shown by `netstat`).
  - On macOS / Linux: `kill -9 $(lsof -t -i :4111)`.

---

### 4. Browser Does Not Open Automatically

#### Symptoms
- The engine starts and prints the startup banner, but your default web browser does not open.

#### Root Cause
- The CLI was invoked with `--no-browser`, or the default OS browser handler failed or timed out during the health check poll.

#### Fix
1. Copy the full URL with the token printed in the console output (e.g. `http://127.0.0.1:4111?token=...`) and paste it into your browser.
2. In headless/CI environments, use `--no-browser` explicitly.

---

### 5. Windows SmartScreen / Windows Defender Warning on `PiddiAPI.exe`

#### Symptoms
- Windows SmartScreen displays a blue dialog: "Windows protected your PC - Microsoft Defender SmartScreen prevented an unrecognized app from starting."

#### Root Cause
- Freshly compiled local binaries or un-signed release packages have not accumulated Microsoft cloud reputation.

#### Fix
1. Click **More info** on the SmartScreen dialog.
2. Click **Run anyway**.
3. For enterprise distribution, sign the binary with an Authenticode certificate (`signtool.exe sign /a /tr http://timestamp.digicert.com dist\PiddiAPI\PiddiAPI.exe`).

---

### 6. macOS PiddiAPI.app Fails to Launch Terminal

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

### 7. Static Assets Missing (Blank Page or 404 on Assets)

#### Symptoms
- Navigating to `http://127.0.0.1:4111` displays a blank white screen, or browser DevTools shows `404 Not Found` for `/assets/index-*.js`.

#### Root Cause
- Frontend static assets were not compiled before packaging or running the standalone Python engine.

#### Fix
Rebuild the frontend bundle:
```bash
cd frontend
npm run build
cd ..
```

---

### 8. Secret Variables Not Resolving or Permission Denied

#### Symptoms
- Requests send raw literal `{{secret_name}}` strings instead of resolved values.
- File manager logs `PermissionError` when reading `.secrets.json`.

#### Root Cause
- The secrets file has corrupted permissions or was created under a different OS user account.

#### Diagnostic Command
- On Windows: `Get-Acl .piddi\environments\*.secrets.json`
- On macOS / Linux: `ls -la .piddi/environments/`

#### Fix
1. Ensure the current user has read/write permissions to `.secrets.json`.
2. On macOS/Linux, ensure permissions are `0600`: `chmod 600 .piddi/environments/*.secrets.json`.
3. Verify that variable keys match exact case-sensitive names in the active environment.

---

### 9. Corrupted or Invalid JSON in Collections/Environments

#### Symptoms
- Warning in engine log: `Skipping malformed collection file ...: Invalid JSON`.

#### Root Cause
- A JSON file in `.piddi/collections/` or `.piddi/environments/` was edited manually and contains syntax errors (trailing commas, unclosed brackets, etc.).

#### Diagnostic Command
```bash
python -m json.tool .piddi/collections/*.json > /dev/null
```

#### Fix
- Fix syntax errors in the JSON file using standard JSON formatting.
- PiddiAPI isolates malformed files and continues running safely without crashing the server.
