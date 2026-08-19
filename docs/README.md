# PiddiAPI Documentation Hub

Welcome to the **PiddiAPI** technical documentation. This documentation covers the architecture, development workflow, reproducible builds, automated testing, packaging specifications, and operational troubleshooting for PiddiAPI.

---

## 📚 Documentation Index

### 1. 🏗️ Architecture & Specifications
- [**System Architecture Overview**](architecture/README.md): High-level system design, data flow diagrams, security boundaries, and storage guarantees.
- [**Architecture Review & Principles**](architecture/ARCHITECTURE_REVIEW.md): Approved baseline architectural design document.
- [**Technical Specification**](architecture/TECHNICAL_SPEC.md): Complete technical specification and implementation contract.

---

### 2. 🛠️ Development & Engineering
- [**Development Guide**](development/DEVELOPMENT.md): Prerequisites, virtual environments, running the backend and frontend dev servers, ports, and workspace behavior.
- [**Building Guide**](development/BUILDING.md): Step-by-step instructions for building the frontend, static assets, Python distribution, and standalone desktop binaries.
- [**Testing Guide**](development/TESTING.md): Automated testing workflows (Pytest, Vitest, Ruff, TypeScript compiler) and manual QA scripts.
- [**Packaging Specification**](development/PACKAGING.md): Deep dive into PyInstaller ONEDIR bundles, Windows executable (`PiddiAPI.exe`) directory layout, macOS `.app` Terminal integration, `Info.plist`, and `BUILD_MANIFEST.json` validation.
- [**Project Cleanup Record**](development/PROJECT_CLEANUP.md): Comprehensive log of repository restructuring, dependency audit, and file organization.

---

### 3. 🚨 Operations & Troubleshooting
- [**Troubleshooting Guide**](operations/TROUBLESHOOTING.md): Matrix of common errors (Engine Offline, 403 Forbidden, port conflicts, secrets permissions, Windows Defender/SmartScreen alerts, and macOS launcher issues) with causes and remediation commands.

---

### 4. 📜 Historical Phase Audits & Plans
- **Phase 1 (Core Engine & Dispatcher)**:
  - [Phase 1 Plan](phases/phase-1/PLAN.md)
  - [Phase 1 Audit Report](phases/phase-1/AUDIT.md)
- **Phase 2 (Frontend UI & Workspace Composer)**:
  - [Phase 2 Audit Report](phases/phase-2/AUDIT.md)
- **Phase 3 (Workspace Persistence & File Manager)**:
  - [Phase 3 Audit Report](phases/phase-3/AUDIT.md)
- **Phase 4 (Environments & POSIX 0600 Secrets Vault)**:
  - [Phase 4 Audit Report](phases/phase-4/AUDIT.md)
- **Phase 5 (History, Command Palette & UX Refinements)**:
  - [Phase 5 Roadmap Audit](phases/phase-5/ROADMAP_AUDIT.md)
  - [Phase 5 Certified Final Audit](phases/phase-5/FINAL_AUDIT.md)
  - [Phase 5 UX/UI Refinement Audit](phases/phase-5/UX_UI_AUDIT.md)
- **Phase 6 (Native Desktop Distribution - Windows & macOS)**:
  - [Phase 6 Distribution Architecture & Verification](phases/phase-6/DISTRIBUTION_ARCHITECTURE.md)

---

## 🎯 Quick Links for Contributors

| Task | Guide | Windows Command | macOS / Linux Command |
| :--- | :--- | :--- | :--- |
| **Run Backend Dev Server** | [Development Guide](development/DEVELOPMENT.md) | `piddi . --dev` | `piddi . --dev` |
| **Run Frontend Dev Server** | [Development Guide](development/DEVELOPMENT.md) | `cd frontend; npm run dev` | `cd frontend && npm run dev` |
| **Run All Python Tests** | [Testing Guide](development/TESTING.md) | `.venv\Scripts\pytest -v` | `.venv/bin/pytest -v` |
| **Run All Frontend Tests** | [Testing Guide](development/TESTING.md) | `cd frontend; npm test; cd ..` | `cd frontend && npm test && cd ..` |
| **Run Code Linters** | [Testing Guide](development/TESTING.md) | `.venv\Scripts\ruff check .` | `.venv/bin/ruff check .` |
| **Build Native Executable / App** | [Building Guide](development/BUILDING.md) | `.venv\Scripts\python scripts/build_package.py` | `.venv/bin/python scripts/build_package.py` |
