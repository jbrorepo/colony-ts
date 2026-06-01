#!/usr/bin/env python3
"""
Render the Colony icon as 128x128 PNG.

Run from the vscode-extension/ directory:
    python media/generate-icon.py

Produces: media/icon.png
"""

from PIL import Image, ImageDraw
import math
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "icon.png")
SIZE = 128

# Colours — match the dashboard / extension palette
BG = (13, 15, 20, 255)        # #0d0f14
ACCENT = (74, 222, 128, 255)  # #4ade80
ACCENT_DIM = (22, 101, 52, 255)  # #166534


def hexagon_points(cx, cy, r):
    """Pointy-top hexagon."""
    pts = []
    for i in range(6):
        angle = math.pi / 3 * i - math.pi / 2
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def main():
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    # Rounded square background already handled by BG;
    # outer hexagon as a stroke
    cx, cy = SIZE / 2, SIZE / 2
    pts = hexagon_points(cx, cy, 48)
    pts.append(pts[0])
    draw.line(pts, fill=ACCENT, width=5, joint="curve")

    # Inner "C" — arc from upper-right around to lower-right
    bbox = (cx - 22, cy - 22, cx + 22, cy + 22)
    # PIL arc: start/end in degrees, 0 = 3 o'clock, going clockwise
    draw.arc(bbox, start=315, end=45, fill=ACCENT, width=9)

    # Central dot — the "actor"
    draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=ACCENT)

    img.save(OUT_PATH, "PNG")
    print(f"Wrote {OUT_PATH} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
