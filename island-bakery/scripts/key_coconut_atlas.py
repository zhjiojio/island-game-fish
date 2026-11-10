#!/usr/bin/env python3
"""椰子图集 2×2 抠图 + 导出单图到 assets/道具/椰子/"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from alpha_key_ui_png import key_sprite_cell  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/道具/椰子图集.png"
OUT = ROOT / "assets/道具/椰子"
PKG = ROOT / "island-bakery/package/res/Image/e3_coconuts.png"
NAMES = [(0, 0, "青椰"), (1, 0, "椰子汁杯"), (0, 1, "金椰"), (1, 1, "开口椰")]


def main() -> None:
    im = Image.open(SRC)
    w, h = im.size
    cw, ch = w // 2, h // 2
    atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    OUT.mkdir(parents=True, exist_ok=True)
    for col, row, name in NAMES:
        box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
        cell = np.array(im.crop(box).convert("RGBA"))
        keyed = key_sprite_cell(cell.copy(), 50)
        atlas.paste(Image.fromarray(keyed), box[:2])
        Image.fromarray(keyed).save(OUT / f"{name}.png", optimize=True)
    atlas.save(SRC, optimize=True)
    atlas.save(PKG, optimize=True)
    print("e3 coconuts keyed", PKG)


if __name__ == "__main__":
    main()
