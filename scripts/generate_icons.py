"""PiddiAPI Cross-Platform Icon Generation Script.

Generates platform-specific icon derivatives from the canonical master artwork
(`assets/PiddiAPIIcon.png`):
  - macOS:   `assets/PiddiAPI.icns` (multi-resolution Apple Iconset)
  - Windows: `assets/PiddiAPI.ico`  (multi-resolution Windows Icon: 16, 24, 32, 48, 64, 128, 256)
  - Linux:   `assets/PiddiAPI.png`  (512x512 High-Res PNG)
"""

import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


def generate_png_size(src_png: Path, dst_png: Path, width: int, height: int) -> bool:
    """Resize PNG to exact width and height using available tools (sips or Pillow)."""
    if shutil.which("sips"):
        res = subprocess.run(
            ["sips", "-z", str(height), str(width), str(src_png), "--out", str(dst_png)],
            capture_output=True,
            text=True,
            check=False,
        )
        return res.returncode == 0 and dst_png.exists()

    try:
        from PIL import Image

        with Image.open(src_png) as img:
            resized = img.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(dst_png, format="PNG")
        return True
    except ImportError:
        pass

    return False


def generate_icns(src_png: Path, dst_icns: Path) -> bool:
    """Generate macOS .icns file using native sips and iconutil."""
    if not shutil.which("iconutil") or not shutil.which("sips"):
        print(
            "      WARNING: iconutil or sips not found. Skipping .icns generation.", file=sys.stderr
        )
        return False

    with tempfile.TemporaryDirectory(suffix=".iconset") as temp_dir_str:
        iconset_dir = Path(temp_dir_str)

        icon_sizes = [
            ("icon_16x16.png", 16, 16),
            ("icon_16x16@2x.png", 32, 32),
            ("icon_32x32.png", 32, 32),
            ("icon_32x32@2x.png", 64, 64),
            ("icon_128x128.png", 128, 128),
            ("icon_128x128@2x.png", 256, 256),
            ("icon_256x256.png", 256, 256),
            ("icon_256x256@2x.png", 512, 512),
            ("icon_512x512.png", 512, 512),
            ("icon_512x512@2x.png", 1024, 1024),
        ]

        for filename, w, h in icon_sizes:
            target = iconset_dir / filename
            if not generate_png_size(src_png, target, w, h):
                print(f"      ERROR: Failed to generate icon variant {filename}", file=sys.stderr)
                return False

        res = subprocess.run(
            ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(dst_icns)],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            print(f"      ERROR: iconutil failed: {res.stderr}", file=sys.stderr)
            return False

    return dst_icns.exists()


def generate_ico(src_png: Path, dst_ico: Path) -> bool:
    """Generate multi-resolution Windows .ico container with embedded PNGs."""
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    png_buffers = []

    with tempfile.TemporaryDirectory() as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        for size in ico_sizes:
            tmp_png = temp_dir / f"icon_{size}.png"
            if not generate_png_size(src_png, tmp_png, size, size):
                print(
                    f"      ERROR: Failed to generate {size}x{size} PNG for .ico", file=sys.stderr
                )
                return False
            png_buffers.append((size, tmp_png.read_bytes()))

    # Build binary ICO format
    # Header: idReserved (2), idType (2), idCount (2)
    header = struct.pack("<HHH", 0, 1, len(png_buffers))

    # Calculate offsets
    entries = []
    # 6 bytes header + 16 bytes per entry
    offset = 6 + (16 * len(png_buffers))

    for size, data in png_buffers:
        width_byte = size if size < 256 else 0
        height_byte = size if size < 256 else 0
        entry = struct.pack(
            "<BBBBHHII",
            width_byte,  # bWidth
            height_byte,  # bHeight
            0,  # bColorCount
            0,  # bReserved
            1,  # wPlanes
            32,  # wBitCount
            len(data),  # dwBytesInRes
            offset,  # dwImageOffset
        )
        entries.append(entry)
        offset += len(data)

    with dst_ico.open("wb") as f:
        f.write(header)
        for entry in entries:
            f.write(entry)
        for _, data in png_buffers:
            f.write(data)

    return dst_ico.exists()


def generate_all_icons(assets_dir: Path | None = None) -> bool:
    """Generate all platform icons from canonical master assets/PiddiAPIIcon.png."""
    if assets_dir is None:
        repo_root = Path(__file__).resolve().parent.parent
        assets_dir = repo_root / "assets"

    master_icon = assets_dir / "PiddiAPIIcon.png"
    if not master_icon.exists():
        print(f"ERROR: Master icon not found at {master_icon}", file=sys.stderr)
        return False

    print(f"Generating platform icons from master: {master_icon}")

    # 1. macOS .icns
    dst_icns = assets_dir / "PiddiAPI.icns"
    if generate_icns(master_icon, dst_icns):
        print(f"  [macOS]   Created {dst_icns} ({dst_icns.stat().st_size} bytes)")
    else:
        print(f"  [macOS]   Skipped or failed {dst_icns}")

    # 2. Windows .ico
    dst_ico = assets_dir / "PiddiAPI.ico"
    if generate_ico(master_icon, dst_ico):
        print(f"  [Windows] Created {dst_ico} ({dst_ico.stat().st_size} bytes)")
    else:
        print(f"  [Windows] Skipped or failed {dst_ico}")

    # 3. Linux .png (512x512 standard desktop icon)
    dst_linux_png = assets_dir / "PiddiAPI.png"
    if generate_png_size(master_icon, dst_linux_png, 512, 512):
        print(f"  [Linux]   Created {dst_linux_png} ({dst_linux_png.stat().st_size} bytes)")
    else:
        # Fallback: copy master PNG
        shutil.copyfile(master_icon, dst_linux_png)
        print(f"  [Linux]   Copied master to {dst_linux_png}")

    return True


if __name__ == "__main__":
    success = generate_all_icons()
    sys.exit(0 if success else 1)
