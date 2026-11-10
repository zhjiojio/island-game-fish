#!/usr/bin/env python3
"""烤架图集全幅视图 + 三四级边界分析 + 源图角色底部宽松白垫检测。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"


def view(rel: str, box: tuple[int, int, int, int], cols: int, rows: int, label: str) -> None:
    x0, x1, y0, y1 = box
    arr = np.array(open_img(ROOT / rel).convert("RGBA"))[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- {label} [{box}] ({w}x{h})")
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            a = cell[:, :, 3]
            d = (a > 8).mean()
            line.append(" " if d == 0 else ("." if d < 0.15 else ("+" if d < 0.45 else "#")))
        print("".join(line))


def grill_colors() -> None:
    """按 512 列分段看烤架各段的主色，确认归属。"""
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    zones = [(0, 445, "lv1"), (442, 921, "lv2"), (906, 1470, "lv3?"), (1440, 2048, "lv4?")]
    for x0, x1, name in zones:
        sub = arr[:, x0:x1]
        m = sub[:, :, 3] > 128
        px = sub[m][:, :3].astype(np.float32)
        print(f"  {name} x[{x0}:{x1}]: px={int(m.sum())} meanRGB={px.mean(axis=0).round(0) if len(px) else None}")
    # lv3|lv4 重叠带分析：x1380-1550 之间不透明像素在 y 向的分布
    band = arr[:, 1380:1550]
    m = band[:, :, 3] > 128
    colprof = m.mean(axis=1)
    print("  y 密度（每 64 行）x[1380:1550]:")
    print("   ", " ".join(f"y{y}:{colprof[y]:.2f}" for y in range(0, 1152, 64)))


def source_bottom_pads() -> None:
    C = "角色/顾客图集.png"
    N = "角色/特殊NPC图集.png"
    H = "角色/兔子主角.png"
    for rel, zones in [(C, [(13, 462, "蓝熊"), (463, 837, "米熊"), (818, 1198, "粉猪"),
                            (1200, 1598, "企鹅"), (1571, 2033, "狐狸")]),
                       (N, [(0, 566, "鹿"), (490, 1024, "獾厨师"), (1024, 1478, "松鼠"), (1446, 2036, "乌龟")]),
                       (H, [(22, 713, "正面"), (708, 1115, "侧面"), (1084, 1762, "背面"), (1687, 2043, "部件")])]:
        arr = np.array(open_img(ROOT / rel).convert("RGBA"))
        print(f"=== {rel} 源图底部宽松白垫:")
        for x0, x1, name in zones:
            sub = arr[:, x0:x1]
            a = sub[:, :, 3]
            rows_idx = np.where((a > 8).any(axis=1))[0]
            rb = rows_idx.max()
            band = sub[max(0, rb - 55):rb + 1]
            m = band[:, :, 3] > 30
            rgb = band[:, :, :3].astype(np.float32)
            lum = rgb.max(axis=2)
            sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
            whiteish = m & (lum > 205) & (sat < 0.30)
            blobs = []
            if whiteish.sum() > 120:
                lab, n = ndimage.label(whiteish)
                sizes = ndimage.sum(whiteish, lab, range(1, n + 1))
                for i, s in enumerate(sizes):
                    if s >= 120:
                        sl = ndimage.find_objects(lab)[i]
                        blobs.append((int(s), x0 + sl[1].start, x0 + sl[1].stop, sl[0].start, sl[0].stop))
            print(f"  {name} x[{x0}:{x1}] bottom_row={rb} band_opaque={int(m.sum())} whiteish={int(whiteish.sum())} "
                  f"blobs={blobs if len(blobs) < 4 else str(blobs[:4]) + '...'}")


def main() -> None:
    view("道具/烤架图集.png", (0, 2048, 0, 1152), 128, 30, "烤架全幅")
    grill_colors()
    print()
    source_bottom_pads()


if __name__ == "__main__":
    sys.exit(main())
