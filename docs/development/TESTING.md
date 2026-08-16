# PiddiAPI Testing & Quality Assurance Guide

This document outlines the testing strategy, automated test commands, and manual verification procedures for PiddiAPI.

---

## 1. Automated Test Suite Overview

PiddiAPI maintains comprehensive automated test coverage across both backend and frontend layers:

| Layer | Framework | Test Count | Scope |
| :--- | :--- | :--- | :--- |
| **Backend Engine** | Pytest (`pytest-asyncio`) | **128 tests** | Unit tests, security boundaries, dispatcher, variable engine, persistence, distribution, and adversarial tests. |
| **Frontend UI** | Vitest (`@testing-library/react`) | **84 tests** | Component rendering, keyboard shortcuts, store state, modal interactions, cURL parsing, code generation. |
| **Static Analysis** | Ruff + TypeScript (`tsc`) | **100% clean** | Strict linting, formatting consistency, and full type safety. |

---

## 2. Automated Test Commands

### 2.1. Backend Python Tests
Run the entire Pytest test suite:
```bash
# Run all unit, integration, and security tests with verbose output
.venv/bin/pytest -v
```

To run a specific test category or file:
```bash
# Run security middleware & token validation tests
.venv/bin/pytest tests/test_security.py -v

# Run HTTP execution & timing tracer tests
.venv/bin/pytest tests/test_dispatcher.py -v

# Run storage & atomic persistence tests
.venv/bin/pytest tests/test_file_manager.py tests/test_environment_file_manager.py -v

# Run distribution & packaging verification tests
.venv/bin/pytest tests/test_distribution.py tests/test_launcher.py tests/test_paths.py -v
```

### 2.2. Frontend Tests (Vitest)
Run the React component and utility test suite:
```bash
cd frontend
npm test -- --run
cd ..
```

### 2.3. Linting & Formatting Checks
Verify code style across the codebase:
```bash
# Python linting
.venv/bin/ruff check .

# Python formatting
.venv/bin/ruff format --check .

# TypeScript type check
cd frontend
npx tsc --noEmit
cd ..
```

### 2.4. Frontend Production Compilation Check
Ensure the frontend compiles into `piddi/static/` cleanly:
```bash
cd frontend
npm run build
cd ..
```

---

## 3. Packaging & Distribution Verification

Run the automated package builder and verify manifest integrity:
```bash
.venv/bin/python scripts/build_package.py
.venv/bin/pytest tests/test_distribution.py -v
```

---

## 4. Manual Verification: Native Application Lifecycle

The native desktop distribution (`PiddiAPI.app`) must be validated against the following standard verification checklist before release:

### 13-Point macOS Desktop Verification Checklist

| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **1** | Locate `dist/PiddiAPI.app` in Finder and double-click. | macOS launches the bundle without security prompts. | ✅ Pass |
| **2** | Observe Terminal window spawn. | Apple Terminal opens automatically with the Piddi banner and live log output. | ✅ Pass |
| **3** | Observe backend startup. | Engine binds to `127.0.0.1:4111` (or next free port) and logs startup success. | ✅ Pass |
| **4** | Observe default browser launch. | Default browser opens to `http://127.0.0.1:4111?token=...` with the dark workspace UI. | ✅ Pass |
| **5** | Compose and send an HTTP request (`GET https://httpbin.org/get`). | Request executes successfully; response body, status 200, and timing metrics display. | ✅ Pass |
| **6** | Create a collection and save the request. | Collection JSON is written to `<workspace>/.piddi/collections/`. | ✅ Pass |
| **7** | Close the web browser window. | Web browser closes. | ✅ Pass |
| **8** | Inspect Terminal window. | Backend engine **remains active and running** (does not terminate on browser close). | ✅ Pass |
| **9** | Focus Terminal window and press `Ctrl+C`. | Terminal captures `SIGINT`, logs graceful shutdown, flushes history, and exits. | ✅ Pass |
| **10** | Verify process termination. | `pgrep -fl piddi_engine` returns no active processes. | ✅ Pass |
| **11** | Verify port release. | Port `4111` is immediately free (`lsof -i :4111` returns empty). | ✅ Pass |
| **12** | Relaunch `PiddiAPI.app`. | Terminal and browser reopen cleanly on `4111`. | ✅ Pass |
| **13** | Inspect saved collections and history. | All previously saved collections, environments, and history entries remain intact. | ✅ Pass |
