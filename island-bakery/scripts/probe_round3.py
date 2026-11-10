#!/usr/bin/env python3
"""探针：米熊白身体（alpha=0 隐形内容）、烤架 lv3|lv4 白色间隙切线、烤架白圈分布。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"
CONN8 = np.ones((3, 3), dtype=bool)


def bear_body() -> None:
    """米熊：源图集区域 alpha=0 但被轮廓包围的隐形白身体。"""
    arr = np.array(open_img(ROOT / "角色/顾客图集.png").convert("RGBA"))
    sub = arr[300:950, 440:850]  # 米熊区域
    a = sub[:, :, 3]
    comp = a > 8
    print(f"米熊区域: 可见内容 {int(comp.sum())} px")
    filled = ndimage.binary_fill_holes(comp)
    holes = filled & ~comp
    print(f"fill_holes 后新增(封闭洞) {int(holes.sum())} px")
    # 洞的 RGB
    if holes.any():
        hh = sub[holes][:, :3]
        print(f"洞 RGB mean={hh.mean(axis=0).round(0)} min={hh.min(axis=0)} max={hh.max(axis=0)}")
        # 洞中偏白/奶油的占比
        lum = hh.max(axis=1)
        sat = (hh.max(axis=1) - hh.min(axis=1)) / (lum + 1e-3)
        print(f"洞中 whiteish(lum>200,sat<0.32): {float(((lum > 200) & (sat < 0.32)).mean()):.1%}")
        ys, xs = np.where(holes)
        print(f"洞 bbox local x[{xs.min()}:{xs.max()}] y[{ys.min()}:{ys.max()}]")
    # 分离小洞（腿间隙等下开口不算）
    lab, n = ndimage.label(holes, structure=CONN8)
    sizes = ndimage.sum(holes, lab, range(1, n + 1))
    print("封闭洞连通域（>500px）:")
    for i, s in enumerate(sizes):
        if s > 500:
            sl = ndimage.find_objects(lab)[i]
            print(f"  hole px={int(s)} x_local[{sl[1].start}:{sl[1].stop}] y_local[{sl[0].start}:{sl[0].stop}]")


def grill_structure() -> None:
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    x0, x1, y0, y1 = 1280, 1720, 60, 980
    sub = arr[y0:y1, x0:x1]
    cols, rows = 88, 40
    h, w = sub.shape[:2]
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    print(f"--- 烤架 x[{x0}:{x1}]y[{y0}:{y1}] 颜色图 (W=白 T=烤架色 K=暗 .=透明):")
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = sub[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            m = cell[:, :, 3] > 8
            if not m.any():
                line.append(".")
                continue
            px = cell[m][:, :3].astype(np.float32)
            lum = px.max(axis=1)
            sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
            white = (lum > 200) & (sat < 0.32)
            dark = lum < 100
            if white.mean() > 0.5:
                line.append("W")
            elif dark.mean() > 0.4:
                line.append("K")
            else:
                line.append("T")
        print("".join(line))


def grill_cut_profiles() -> None:
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    op = arr[:, :, 3] > 8
    white = op & (lum > 200) & (sat < 0.32)
    print("--- 列剖面 x[1330:1600] 每 10 列: 密度 / 白色占比 / 烤架色占比")
    for x in range(1330, 1600, 10):
        d = op[:, x].mean()
        w = white[:, x].sum()
        t = op[:, x].sum() - w
        print(f"  x={x}: dens={d:.2f} white={int(w)} tan={int(t)}")


def grill_white_ring() -> None:
    """各烤架分段的外连白 vs 封闭白。"""
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    op = arr[:, :, 3] > 8
    white = op & (lum > 200) & (sat < 0.32)
    lab, n = ndimage.label(op, structure=CONN8)
    # 烤架分段（切线 1400 假设）
    segs = [(0, 448, "lv1"), (448, 915, "lv2"), (915, 1400, "lv3cut"), (1400, 2048, "lv4cut")]
    free = arr[:, :, 3] < 8
    for x0, x1, name in segs:
        m = op.copy()
        m[:, :x0] = False
        m[:, x1:] = False
        # 只保留该段的连通域（近似）
        m = m & (np.arange(arr.shape[1])[None, :] >= x0) & (np.arange(arr.shape[1])[None, :] < x1)
        w = white & m
        if not w.any():
            print(f"  {name}: no white")
            continue
        labw, nw = ndimage.label(w | free, structure=CONN8)
        has_free = np.zeros(nw + 1, dtype=bool)
        has_free[1:] = ndimage.maximum(free.astype(np.uint8), labw, np.arange(1, nw + 1)) > 0
        outer = w & has_free[labw]
        print(f"  {name}: white_total={int(w.sum())} outer={int(outer.sum())} enclosed={int((w & ~outer).sum())}")
        # 底部 40px 的白色（底座）
        sub = m & white
        rows_idx = np.where(m.any(axis=1))[0]
        if len(rows_idx):
            rb = rows_idx.max()
            band = sub[max(0, rb - 40):rb + 1]
            print(f"    bottom40px white={int(band.sum())} / opaque={int(m[max(0, rb-40):rb+1].sum())}")


def main() -> None:
    bear_body()
    print()
    grill_structure()
    print()
    grill_cut_profiles()
    print()
    grill_white_ring()


if __name__ == "__main__":
    sys.exit(main())
