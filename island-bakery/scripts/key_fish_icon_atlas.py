#!/usr/bin/env python3
"""e1 鱼种 2×2 图集：按格从四角抠米白纸底，输出透明 RGBA 图集 + 单鱼 PNG。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# 复用 flood 逻辑
sys.path.insert(0, str(Path(__file__).parent))
from alpha_key_ui_png import corner_flood_alpha  # noqa: E402

SPECIES = [
    ("small", "小海鱼", 0, 0),
    ("salmon", "三文鱼", 1, 0),
    ("tuna", "金枪鱼", 0, 1),
    ("golden", "金色传说", 1, 1),
]


def key_cell(cell: Image.Image, tolerance: float) -> Image.Image:
    arr = np.array(cell.convert("RGBA"))
    out = corner_flood_alpha(arr.copy(), tolerance)
    return Image.fromarray(out)


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    src = root / "island-bakery/package/res/Image/e1_fish_icons.png"
    if not src.is_file():
        src = root / "assets/图鉴/鱼种图集.png"
    im = Image.open(src)
    w, h = im.size
    cw, ch = w // 2, h // 2
    atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_dir = root / "assets/图鉴/鱼种"
    out_dir.mkdir(parents=True, exist_ok=True)
    tol = 42.0
    for sid, cname, col, row in SPECIES:
        box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
        cell = im.crop(box)
        keyed = key_cell(cell, tol)
        atlas.paste(keyed, box[:2])
        keyed.save(out_dir / f"{cname}.png", optimize=True)
        trans = (np.array(keyed)[:, :, 3] == 0).mean()
        print(f"{sid} {cname}: transparent {trans * 100:.1f}%")
    pkg = root / "island-bakery/package/res/Image/e1_fish_icons.png"
    atlas.save(pkg, optimize=True)
    assets = root / "assets/图鉴/鱼种图集.png"
    atlas.save(assets, optimize=True)
    print("saved", pkg, assets)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
