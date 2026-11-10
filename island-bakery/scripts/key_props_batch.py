#!/usr/bin/env python3
"""道具/装备/角色/图鉴 PNG：按格或整图抠纸底，写回 assets 并同步 package。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from alpha_key_ui_png import corner_flood_alpha  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
PKG = ROOT / "island-bakery/package/res/Image"

SKIP_PARTS = ("场景参考", "风格参考", "全屏皮肤", "ui-skin", "scene-")
PKG_MAP = {
    "图鉴/鱼种图集.png": "e1_fish_icons.png",
    "道具/椰子图集.png": "e3_coconuts.png",
    "道具/烤鱼成品图集.png": "e4_grilled_fish.png",
}


def key_image(path: Path, tolerance: float = 42.0) -> None:
    im = Image.open(path)
    w, h = im.size
    if w >= 1024 and h >= 1024 and w / h > 1.2:
        arr = np.array(im.convert("RGBA"))
        atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        cw, ch = w // 2, h // 2
        for row in range(2):
            for col in range(2):
                box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
                cell = arr[box[1] : box[3], box[0] : box[2]].copy()
                out = corner_flood_alpha(cell, tolerance)
                atlas.paste(Image.fromarray(out), box[:2])
        im = atlas
    else:
        arr = np.array(im.convert("RGBA"))
        im = Image.fromarray(corner_flood_alpha(arr.copy(), tolerance))
    im.save(path, optimize=True)
    rel = path.relative_to(ASSETS).as_posix()
    if rel in PKG_MAP:
        dest = PKG / PKG_MAP[rel]
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, optimize=True)
        print("sync", dest.name)


def main() -> None:
    for png in sorted(ASSETS.rglob("*.png")):
        s = str(png)
        if any(p in s for p in SKIP_PARTS):
            continue
        if "/ui/" in s and "ui-skin" in s:
            continue
        if "弹窗与气泡/顾客订单气泡" in s or "order-bubble" in s:
            continue
        key_image(png)
        print("key", png.relative_to(ASSETS))
    print("done")


if __name__ == "__main__":
    main()
