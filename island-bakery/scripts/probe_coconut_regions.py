#!/usr/bin/env python3
"""椰子问题区域数值探针：Alpha 分层 + RGB + 精细 ASCII（按 alpha 段渲染）。"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "assets"


def alpha_bands(rel: str, box: tuple[int, int, int, int], label: str) -> None:
    x0, x1, y0, y1 = box
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    a = arr[:, :, 3]
    bands = [
        ("a=0", (a == 0)),
        ("1-31", (a >= 1) & (a <= 31)),
        ("32-127", (a >= 32) & (a <= 127)),
        ("128-254", (a >= 128) & (a <= 254)),
        ("255", (a == 255)),
    ]
    total = a.size
    print(f"--- {label} {rel}[{box}]")
    for name, m in bands:
        pct = m.mean()
        if pct < 0.001:
            continue
        px = arr[m][:, :3].astype(np.float32)
        print(f"  {name:8s} {pct:6.1%}  RGB mean={px.mean(axis=0).round(0)} "
              f"min={px.min(axis=0)} max={px.max(axis=0)}")


def fine_ascii(rel: str, box: tuple[int, int, int, int], cols: int, rows: int, label: str) -> None:
    x0, x1, y0, y1 = box
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- fine {label} {rel}[{box}] ({w}x{h})")
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            a = cell[:, :, 3]
            solid = (a >= 250).mean()
            semi = ((a >= 1) & (a < 250)).mean()
            if solid > 0.5:
                line.append("#")
            elif solid > 0.05:
                line.append("+")
            elif semi > 0.3:
                line.append("~")
            elif semi > 0.02:
                line.append(".")
            else:
                line.append(" ")
        print("".join(line))


def rgb_counts(rel: str, box: tuple[int, int, int, int], label: str, min_alpha: int = 1) -> None:
    x0, x1, y0, y1 = box
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    m = arr[:, :, 3] >= min_alpha
    px = (arr[m][:, :3].astype(np.float32) // 24).astype(int)
    cnt = Counter(map(tuple, px.tolist()))
    print(f"--- rgb24 bins {label} {rel}[{box}] top10:")
    for rgb, n in cnt.most_common(10):
        print(f"    ~RGB{tuple(v * 24 for v in rgb)} x{n}")


def main() -> None:
    CO = "道具/椰子图集.png"
    # 金椰(TR) 中部区域
    alpha_bands(CO, (1150, 1560, 220, 420), "金椰中部")
    fine_ascii(CO, (1100, 1600, 200, 430), 70, 28, "金椰中部精细")
    # 金椰-榨汁(BR) 吸管与雨伞之间
    alpha_bands(CO, (1300, 1750, 800, 1300), "金椰榨中部")
    fine_ascii(CO, (1150, 1800, 720, 1480), 74, 32, "金椰榨汁全幅")
    # 青椰-榨汁(BL) 全幅精细
    fine_ascii(CO, (280, 960, 700, 1500), 74, 32, "青椰榨汁全幅")
    alpha_bands(CO, (300, 950, 700, 1500), "青椰榨全幅")
    # 青椰(TL) 底部
    fine_ascii(CO, (250, 950, 660, 768), 70, 10, "青椰TL底部(网格线附近)")

    # 当前抠图对应区域
    alpha_bands("道具/椰子/椰子-金椰.png", (139, 490, 245, 386), "当前金椰中部")
    fine_ascii("道具/椰子/椰子-金椰.png", (100, 550, 200, 430), 70, 28, "当前金椰中部")
    fine_ascii("道具/椰子/椰子-金椰-榨汁.png", (0, 1024, 0, 768), 74, 26, "当前金椰榨汁")
    fine_ascii("道具/椰子/椰子-青椰-榨汁.png", (0, 1024, 0, 768), 74, 26, "当前青椰榨汁")
    fine_ascii("道具/椰子/椰子-青椰.png", (250, 950, 650, 768), 70, 10, "当前青椰底部")
    rgb_counts(CO, (1300, 1750, 800, 1300), "金椰榨中部")


if __name__ == "__main__":
    sys.exit(main())
