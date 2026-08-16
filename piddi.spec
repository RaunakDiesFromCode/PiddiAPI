# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller ONEDIR build specification for PiddiAPI (Cross-Platform)."""

import sys
from pathlib import Path

block_cipher = None

repo_root = Path.cwd()
static_src = repo_root / "piddi" / "static"
assets_dir = repo_root / "assets"

datas = []
if static_src.exists():
    datas.append((str(static_src), "piddi/static"))

# Linux / general platform desktop icon data
linux_icon = assets_dir / "PiddiAPI.png"
if linux_icon.exists():
    datas.append((str(linux_icon), "piddi/static"))

hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "anyio",
    "anyio._backends",
    "anyio._backends._asyncio",
    "pydantic",
    "pydantic_core",
    "httpx",
    "httpcore",
    "h11",
    "h2",
    "aiofiles",
    "multipart",
    "python_multipart",
    "piddi.paths",
    "piddi.launcher",
    "piddi.config",
    "piddi.main",
    "piddi.routers.workspace",
    "piddi.routers.collections",
    "piddi.routers.environments",
    "piddi.routers.preferences",
    "piddi.routers.history",
    "piddi.routers.execute",
    "piddi.engine.dispatcher",
    "piddi.engine.variables",
    "piddi.storage.file_manager",
    "piddi.storage.environment_manager",
    "piddi.storage.preferences_manager",
    "piddi.storage.history",
    "piddi.security.middleware",
    "piddi.security.tokens",
]

a = Analysis(
    ["piddi/cli.py"],
    pathex=[str(repo_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "numpy",
        "scipy",
        "pandas",
        "IPython",
        "pytest",
        "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

is_darwin = sys.platform == "darwin"
is_windows = sys.platform.startswith("win")

exe_name = "piddi_engine" if is_darwin else "PiddiAPI"

# Platform-specific icon selection
exe_icon = None
mac_icon = assets_dir / "PiddiAPI.icns"
win_icon = assets_dir / "PiddiAPI.ico"

if is_windows and win_icon.exists():
    exe_icon = str(win_icon)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=exe_name,
    icon=exe_icon,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=not is_darwin,  # on macOS, console=False prevents PyInstaller injecting LSBackgroundOnly=true
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=exe_name if not is_darwin else "piddi_engine",
)

if is_darwin:
    app = BUNDLE(
        coll,
        name="PiddiAPI.app",
        icon=str(mac_icon) if mac_icon.exists() else None,
        bundle_identifier="com.piddiapi.engine",
        info_plist={
            "CFBundleName": "PiddiAPI",
            "CFBundleDisplayName": "PiddiAPI",
            "CFBundleExecutable": "PiddiAPI",
            "CFBundleIconFile": "PiddiAPI.icns",
            "CFBundleIdentifier": "com.piddiapi.engine",
            "CFBundlePackageType": "APPL",
            "CFBundleVersion": "0.1.0",
            "CFBundleShortVersionString": "0.1.0",
            "LSBackgroundOnly": False,
            "LSUIElement": False,
            "NSHighResolutionCapable": True,
            "NSRequiresAquaSystemAppearance": False,
        },
    )
