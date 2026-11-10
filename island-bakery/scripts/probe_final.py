#!/usr/bin/env python3
"""最终探针：密度最小值切分点、脚底白板检测、青椰榨汁暗区分布、奶油底连通性。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"


def minima(rel: str, windows: list[tuple[int, int, str]]) -> None:
    arr = np.array(open_img(ROOT / rel).convert("RGBA"))
    dens = (arr[:, :, 3] > 8).mean(axis=0)
    print(f"=== minima {rel}")
    for x0, x1, label in windows:
        seg = dens[x0:x1]
        i = int(np.argmin(seg)) + x0
        print(f"  {label}: window[{x0}:{x1}] min at x={i} density={dens[i]:.4f}")
        print(f"    profile x[{i-6}:{i+7}] = {np.round(dens[i-6:i+7], 3)}")


def bottom_white(rel: str, x0: int, x1: int, label: str) -> None:
    """检测角色底部（最后不透明行往上 40px 内）的白色块。"""
    arr = np.array(open_img(ROOT / rel).convert("RGBA"))
    sub = arr[:, x0:x1]
    a = sub[:, :, 3]
    rows = np.where((a > 8).any(axis=1))[0]
    if not len(rows):
        print(f"  {label}: empty")
        return
    rb = rows.max()
    band = sub[max(0, rb - 40):rb + 1]
    m = band[:, :, 3] > 60
    rgb = band[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    whiteish = m & (lum > 232) & (sat < 0.14)
    print(f"  {label}: bottom_row={rb} bottom40px opaque={int(m.sum())} whiteish={int(whiteish.sum())} ({whiteish.sum()/max(m.sum(),1):.0%})")
    if whiteish.sum() > 200:
        lab, n = ndimage.label(whiteish)
        sizes = ndimage.sum(whiteish, lab, range(1, n + 1))
        for i, s in enumerate(sizes):
            if s >= 150:
                sl = ndimage.find_objects(lab)[i]
                print(f"    white blob px={int(s)} x[{x0+sl[1].start}:{x0+sl[1].stop}] y_rel[{sl[0].start}:{sl[0].stop}]")


def dark_map_coconut_bl() -> None:
    arr = np.array(open_img(ROOT / "道具/椰子图集.png").convert("RGBA"))
    sub = arr[700:1500, 250:1000]
    m = sub[:, :, 3] > 200
    rgb = sub[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    dark = m & (lum < 110)
    print(f"=== BL 暗区 lum<110: {int(dark.sum())} px / opaque {int(m.sum())}")
    h, w = dark.shape
    rows, cols = 26, 60
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = dark[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            cellm = m[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            d = cell.sum()
            if cellm.sum() == 0:
                line.append(" ")
            elif d == 0:
                line.append(".")
            elif d < cellm.sum() * 0.3:
                line.append("+")
            elif d < cellm.sum() * 0.7:
                line.append("*")
            else:
                line.append("#")
        print("".join(line))
    # 暗区连通域
    lab, n = ndimage.label(dark)
    sizes = ndimage.sum(dark, lab, range(1, n + 1))
    big = [(int(s), ndimage.find_objects(lab)[i]) for i, s in enumerate(sizes) if s > 500]
    big.sort(reverse=True)
    for s, sl in big[:12]:
        print(f"    dark comp px={s} x[{250+sl[1].start}:{250+sl[1].stop}] y[{700+sl[0].start}:{700+sl[0].stop}]")


def cream_connectivity() -> None:
    arr = np.array(open_img(ROOT / "道具/椰子图集.png").convert("RGBA"))
    sub = arr[720:1536, 1100:2048]  # BR 区域
    a = sub[:, :, 3]
    rgb = sub[:, :, :3].astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    cream = (a == 255) & (lum > 205) & (sat < 0.30) & (abs(r - g) < 26) & (b > 150)
    # 与透明区相邻的奶油底：从 a==0 泛洪
    free = a == 0
    reach = free.copy()
    for _ in range(600):
        grown = ndimage.binary_dilation(reach) & (free | cream)
        if grown.sum() == reach.sum():
            break
        reach = grown
    print(f"=== BR cream: {int(cream.sum())} px, flood-reachable {int((reach & cream).sum())} px")
    mm = reach & cream
    if mm.any():
        ys, xs = np.where(mm)
        print(f"    reachable cream bbox x[{1100+xs.min()}:{1100+xs.max()}] y[{720+ys.min()}:{720+ys.max()}]")


def main() -> None:
    minima("道具/烤架图集.png", [(860, 940, "烤架lv2|lv3"), (1410, 1500, "烤架lv3|lv4")])
    minima("角色/顾客图集.png", [(790, 870, "米熊|粉猪"), (1540, 1620, "企鹅|狐狸")])
    minima("角色/特殊NPC图集.png", [(470, 600, "鹿|獾"), (980, 1080, "獾|松鼠"), (1420, 1510, "松鼠|乌龟")])
    minima("角色/兔子主角.png", [(1060, 1140, "侧面|背面"), (1660, 1740, "背面|部件")])
    print()
    print("=== 顾客底部白板检测（源图集）")
    C = "角色/顾客图集.png"
    for x0, x1, n in [(13, 462, "蓝熊"), (463, 837, "米熊"), (818, 1198, "粉猪"), (1200, 1598, "企鹅"), (1571, 2033, "狐狸")]:
        bottom_white(C, x0, x1, f"顾客-{n}")
    print("=== NPC底部白板检测")
    N = "角色/特殊NPC图集.png"
    for x0, x1, n in [(0, 566, "鹿"), (490, 1024, "獾厨师"), (1024, 1478, "松鼠"), (1446, 2036, "乌龟")]:
        bottom_white(N, x0, x1, f"NPC-{n}")
    print("=== 主角底部白板检测")
    H = "角色/兔子主角.png"
    for x0, x1, n in [(22, 713, "正面"), (708, 1115, "侧面"), (1084, 1690, "背面"), (1680, 2043, "部件")]:
        bottom_white(H, x0, x1, f"主角-{n}")
    print()
    dark_map_coconut_bl()
    print()
    cream_connectivity()


if __name__ == "__main__":
    sys.exit(main())
