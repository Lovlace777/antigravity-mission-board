#!/usr/bin/env python3
"""Generate crisp antialiased desktop & tray icon assets for Antigravity Mission Board.

Outputs into desktop/assets/:
  - icon.png      (512x512 RGBA PNG)
  - tray-icon.png (32x32 RGBA PNG tuned for crisp 16x16 & 32x32 system tray clarity)
  - icon.ico      (multi-resolution Windows ICO: 16, 24, 32, 48, 64, 128, 256)
"""

from __future__ import annotations

import math
from pathlib import Path
from PIL import Image, ImageDraw

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def render_app_icon(size: int, *, tray_optimized: bool = False) -> Image.Image:
    """Render the Antigravity Mission Board mark with 4x supersampling."""
    scale = 4
    w = size * scale
    s = w / 32.0

    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer warm-obsidian rounded squircle
    pad = 0.6 * s if tray_optimized else 0.8 * s
    radius = 7.6 * s
    bg_color = (20, 20, 19, 255)  # #141413 warm obsidian
    border_color = (58, 56, 52, 255) if tray_optimized else (46, 45, 42, 255)

    draw.rounded_rectangle(
        [pad, pad, w - pad, w - pad],
        radius=radius,
        fill=bg_color,
        outline=border_color,
        width=max(1, round((1.15 if tray_optimized else 0.9) * s)),
    )

    # Subtle top-edge highlight inside squircle (editorial hardware feel)
    if not tray_optimized:
        highlight = Image.new("RGBA", (w, w), (0, 0, 0, 0))
        hdraw = ImageDraw.Draw(highlight)
        hdraw.rounded_rectangle(
            [pad + 0.9 * s, pad + 0.9 * s, w - pad - 0.9 * s, w - pad - 0.9 * s],
            radius=max(1.0, radius - 0.9 * s),
            outline=(255, 255, 255, 18),
            width=max(1, round(0.55 * s)),
        )
        img = Image.alpha_composite(img, highlight)
        draw = ImageDraw.Draw(img)

    # Subtle orbital radar arc (cubic bezier from favicon.svg: M5.5 19.5 C7.8 11.2, 16.5 6.8, 25.8 9.2)
    arc_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    adraw = ImageDraw.Draw(arc_layer)
    p0 = (5.5 * s, 19.5 * s)
    p1 = (7.8 * s, 11.2 * s)
    p2 = (16.5 * s, 6.8 * s)
    p3 = (25.8 * s, 9.2 * s)
    steps = 64
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1.0 - t
        x = (mt**3) * p0[0] + 3 * (mt**2) * t * p1[0] + 3 * mt * (t**2) * p2[0] + (t**3) * p3[0]
        y = (mt**3) * p0[1] + 3 * (mt**2) * t * p1[1] + 3 * mt * (t**2) * p2[1] + (t**3) * p3[1]
        pts.append((x, y))

    arc_width = max(1, round((1.55 if tray_optimized else 1.25) * s))
    arc_color = (229, 227, 220, 72) if not tray_optimized else (242, 241, 238, 84)
    adraw.line(pts, fill=arc_color, width=arc_width, joint="curve")
    # Rounded endcaps
    cap_r = arc_width / 2.0
    for cx, cy in (pts[0], pts[-1]):
        adraw.ellipse([cx - cap_r, cy - cap_r, cx + cap_r, cy + cap_r], fill=arc_color)
    img = Image.alpha_composite(img, arc_layer)
    draw = ImageDraw.Draw(img)

    # Three crisp vertical Kanban columns (editorial ivory/stone hierarchy)
    if tray_optimized:
        bars = [
            (6.4, 13.0, 5.0, 12.6, (242, 241, 238, 255)),  # #F2F1EE crisp warm white
            (13.5, 9.4, 5.0, 16.2, (242, 241, 238, 255)),  # #F2F1EE hero column
            (20.6, 15.6, 5.0, 10.0, (168, 162, 158, 255)), # #A8A29E warm muted stone
        ]
        bar_r = 1.6 * s
    else:
        bars = [
            (7.0, 13.2, 4.6, 11.8, (230, 228, 222, 255)),  # #E6E4DE soft paper
            (13.7, 9.6, 4.6, 15.4, (250, 249, 246, 255)),  # #FAF9F6 bright alabaster
            (20.4, 15.8, 4.6, 9.2, (168, 162, 158, 255)),  # #A8A29E warm stone
        ]
        bar_r = 1.55 * s

    for bx, by, bw, bh, color in bars:
        draw.rounded_rectangle(
            [bx * s, by * s, (bx + bw) * s, (by + bh) * s],
            radius=bar_r,
            fill=color,
        )

    # Subtle live telemetry pulse dot (calm emerald #22C55E with soft halo)
    dot_cx = 24.0 * s
    dot_cy = 9.4 * s
    dot_r = (3.0 if tray_optimized else 2.55) * s

    halo_layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo_layer)
    halo_r = dot_r * 1.65
    halo_draw.ellipse(
        [dot_cx - halo_r, dot_cy - halo_r, dot_cx + halo_r, dot_cy + halo_r],
        fill=(34, 197, 94, 56),
    )
    img = Image.alpha_composite(img, halo_layer)
    draw = ImageDraw.Draw(img)

    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=(34, 197, 94, 255),
    )

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    # High-res 512x512 master PNG
    master_512 = render_app_icon(512, tray_optimized=False)
    icon_png = ASSETS_DIR / "icon.png"
    master_512.save(icon_png, format="PNG", optimize=True)

    # Crisp 32x32 tray PNG
    tray_32 = render_app_icon(32, tray_optimized=True)
    tray_png = ASSETS_DIR / "tray-icon.png"
    tray_32.save(tray_png, format="PNG", optimize=True)

    # Multi-size Windows ICO (crisp per-size rendering for small sizes)
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    rendered = [
        render_app_icon(sz, tray_optimized=(sz <= 32))
        for sz in ico_sizes
    ]
    icon_ico = ASSETS_DIR / "icon.ico"
    # Pillow writes all supplied append_images into the multi-resolution ICO cleanly
    rendered[-1].save(
        icon_ico,
        format="ICO",
        sizes=[(im.width, im.height) for im in rendered],
        append_images=rendered[:-1],
    )

    # Quick sanity report
    for p in (icon_png, tray_png, icon_ico):
        size_bytes = p.stat().st_size
        print(f"Generated {p.name}: {size_bytes:,} bytes")


if __name__ == "__main__":
    main()
