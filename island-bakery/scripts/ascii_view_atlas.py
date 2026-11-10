#!/usr/bin/env python3
"""ASCII 可视化：以字符图方式查看图集各区域的形状、颜色分布，用于定位问题区域。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "assets"


def hue_char(rgb: np.ndarray) -> str:
    r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
    lum = max(r, g, b)
    sat = (max(r, g, b) - min(r, g, b)) / (lum + 1e-3)
    if sat < 0.15:
        if lum < 70:
            return "K"
        if lum > 210:
            return "W"
        return "n"
    if r > 1.15 * g and g > b:
        return "y" if g > 0.8 * r else "o"
    if r > 1.2 * g and r > 1.2 * b:
        return "r"
    if g > 1.15 * r and g > 1.05 * b:
        return "g"
    if b > 1.15 * r and b > 1.05 * g:
        return "b"
    if r > b and b > g:
        return "p"
    return "?"


def ascii_view(rel: str, box: tuple[int, int, int, int], cols: int = 56, rows: int = 30,
               title: str = "") -> None:
    x0, x1, y0, y1 = box
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- {title or rel} box={box} ({w}x{h}) ---")
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            a = cell[:, :, 3].astype(np.float32) / 255.0
            m = a > 0.06
            d = float(m.mean())
            if d == 0:
                line.append(" ")
                continue
            px = cell[m][:, :3].astype(np.float32)
            mean_rgb = px.mean(axis=0)
            ch = hue_char(mean_rgb)
            if d < 0.08:
                line.append(".")
            elif d < 0.25:
                line.append(ch.upper() if ch.isalpha() else ch)
            else:
                line.append(ch)
        print("".join(line))


def main() -> None:
    CO = "道具/椰子图集.png"
    ascii_view(CO, (1024, 2048, 0, 768), title="金椰(TR) 全格", cols=64, rows=26)
    ascii_view(CO, (1024, 2048, 768, 1536), title="金椰-榨汁(BR) 全格", cols=64, rows=26)
    ascii_view(CO, (0, 1024, 768, 1536), title="青椰-榨汁(BL) 全格", cols=64, rows=26)
    ascii_view(CO, (0, 1024, 0, 768), title="青椰(TL) 全格", cols=64, rows=26)
    WX = "道具/天气图集.png"
    for i, bx in enumerate([(0, 524, 400, 1100), (517, 1024, 400, 1100),
                            (1018, 1524, 400, 1100), (1518, 2048, 400, 1100)]):
        ascii_view(WX, bx, title=f"天气元素{i}", cols=48, rows=16)
    CZ = "道具/作物图集.png"
    for i, bx in enumerate([(96, 1024, 0, 1024), (1024, 2048, 0, 1024),
                            (0, 1024, 1024, 2048), (1024, 2048, 1024, 2048)]):
        ascii_view(CZ, bx, title=f"作物元素{i}", cols=48, rows=18)
    CY = "道具/菜园图集.png"
    for i, bx in enumerate([(30, 700, 0, 768), (640, 1330, 0, 768), (1310, 2048, 0, 768),
                            (0, 720, 768, 1536), (800, 1220, 768, 1536), (1310, 2048, 768, 1536)]):
        ascii_view(CY, bx, title=f"菜园元素{i}", cols=44, rows=18)


if __name__ == "__main__":
    sys.exit(main())
