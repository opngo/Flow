#!/usr/bin/env python3
"""Draw Flow's application and tray icons.

The packaging config points at `electron/assets/icon.png` (Linux),
`icon.ico` (Windows) and `icon.icns` (macOS). None of those files existed, so
`npm run dist` failed at the icon step — and `npm run icon` called a script that
was missing entirely.

Everything is drawn from one description of the mark, on a 32-unit grid, so the
16 px tray icon and the 1024 px store icon are the same shape.

    python3 scripts/make-icon.py

Pillow is the only dependency, and only this script needs it — the app itself
carries the generated files.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "electron" / "assets"
INK = (11, 13, 18, 255)
ACCENT = (124, 140, 255, 255)


def draw_mark(size: int) -> Image.Image:
    """The mark: accent tile, rounded, with a centred F knocked out of it."""
    scale = 8  # draw large, then downsample so the edges are clean
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.28), fill=ACCENT)

    u = s / 32.0
    # stem, top arm, middle arm — the same proportions as the in-app mark
    d.rectangle([11 * u, 8 * u, 15.4 * u, 24 * u], fill=INK)
    d.rectangle([11 * u, 8 * u, 22 * u, 12.4 * u], fill=INK)
    d.rectangle([11 * u, 14.6 * u, 19 * u, 19 * u], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    png = draw_mark(1024)
    png.save(ASSETS / "icon.png")
    print("electron/assets/icon.png       1024x1024")

    # electron-builder wants a multi-size .ico for Windows
    sizes = [16, 24, 32, 48, 64, 128, 256]
    png.save(ASSETS / "icon.ico", sizes=[(n, n) for n in sizes])
    print(f"electron/assets/icon.ico       {', '.join(str(n) for n in sizes)}")

    # and an .icns for macOS (Pillow writes the modern icns containers)
    try:
        png.save(ASSETS / "icon.icns")
        print("electron/assets/icon.icns      16-1024")
    except Exception as exc:  # pragma: no cover - depends on Pillow build
        print(f"electron/assets/icon.icns      skipped ({exc}); electron-builder will convert icon.png")

    # tray sizes beside the main process
    for n in (16, 32):
        draw_mark(n).save(ASSETS / f"tray-{n}.png")
    draw_mark(512).save(ASSETS / "icon-512.png")
    print("electron/assets/               tray-16.png tray-32.png icon-512.png")


if __name__ == "__main__":
    main()
