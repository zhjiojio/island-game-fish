#!/usr/bin/env python3
"""收尾探针：dil0 连通域、烤架 lv3|lv4 粘连、BL 底色 bins、金椰开口环 RGB、当前抠图底部白块。"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"


def comps0(rel: str, min_px: int = 800) -> None:
    arr = np.array(open_img(ROOT / rel).convert("RGBA"))
    mask = arr[:, :, 3] > 8
    lab, n = ndimage.label(mask)  # 无膨胀
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    keep = []
    for i, sl in enumerate(objs):
        if sizes[i] < min_px:
            continue
        keep.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop, int(sizes[i])))
    keep.sort(key=lambda c: c[0])
    print(f"=== {rel} dil0 comps: {len(keep)}")
    for c in keep:
        print(f"    x[{c[0]}:{c[1]}] y[{c[2]}:{c[3]}] px={c[4]}")


def grill_bridge() -> None:
    arr = np.array(open_img(ROOT / "道具/烤架图集.png").convert("RGBA"))
    m = arr[:, :, 3] > 8
    dens = m.mean(axis=0)
    print("=== 烤架 x[1360:1600] 密度 profile（每 10 列）:")
    print("  ", " ".join(f"x{x}:{dens[x]:.3f}" for x in range(1360, 1600, 10)))
    # merged 大块内部找最小
    seg = dens[1300:1650]
    i = int(np.argmin(seg)) + 1300
    print(f"  min in [1300:1650] at x={i} dens={dens[i]:.3f}")
    # ASCII 粗看 1300-1700
    sub = arr[0:1152, 1300:1700]
    a = sub[:, :, 3]
    rows, cols = 30, 66
    h, w = a.shape
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    print("  ascii x[1300:1700]:")
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = a[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            d = (cell > 8).mean()
            line.append(" " if d == 0 else ("." if d < 0.15 else ("+" if d < 0.45 else "#")))
        print("   " + "".join(line))


def bl_bins() -> None:
    arr = np.array(open_img(ROOT / "道具/椰子图集.png").convert("RGBA"))
    sub = arr[720:1500, 250:1000]
    m = sub[:, :, 3] == 255
    px = (sub[m][:, :3].astype(np.float32) // 24).astype(int)
    cnt = Counter(map(tuple, px.tolist()))
    print("=== BL 不透明 RGB bins top14:")
    for rgb, n in cnt.most_common(14):
        print(f"    ~RGB{tuple(v*24 for v in rgb)} x{n}")


def tr_ring() -> None:
    arr = np.array(open_img(ROOT / "道具/椰子图集.png").convert("RGBA"))
    sub = arr[235:315, 1290:1480]
    m = sub[:, :, 3] == 255
    px = (sub[m][:, :3].astype(np.float32) // 24).astype(int)
    cnt = Counter(map(tuple, px.tolist()))
    print("=== 金椰开口环 x[1290:1480]y[235:315] bins top12:")
    for rgb, n in cnt.most_common(12):
        print(f"    ~RGB{tuple(v*24 for v in rgb)} x{n}")


def current_bottom_white() -> None:
    for rel in ["角色/顾客/顾客-粉猪.png", "角色/顾客/顾客-狐狸.png", "角色/顾客/顾客-蓝熊.png",
                "角色/顾客/顾客-米熊.png", "角色/顾客/顾客-企鹅.png"]:
        arr = np.array(open_img(ROOT / rel).convert("RGBA"))
        a = arr[:, :, 3]
        rows = np.where((a > 8).any(axis=1))[0]
        rb = rows.max()
        band = arr[max(0, rb - 60):rb + 1]
        m = band[:, :, 3] > 30
        rgb = band[:, :, :3].astype(np.float32)
        lum = rgb.max(axis=2)
        sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
        # 宽松白色
        whiteish = m & (lum > 205) & (sat < 0.30)
        print(f"  {rel}: bottom_row={rb} loose_white={int(whiteish.sum())} / opaque={int(m.sum())}")
        if whiteish.sum() > 200:
            lab, n = ndimage.label(whiteish)
            sizes = ndimage.sum(whiteish, lab, range(1, n + 1))
            for i, s in enumerate(sizes):
                if s >= 200:
                    sl = ndimage.find_objects(lab)[i]
                    print(f"      loose white blob px={int(s)} x[{sl[1].start}:{sl[1].stop}] y[{sl[0].start}:{sl[0].stop}]")


def main() -> None:
    comps0("道具/烤架图集.png")
    comps0("角色/特殊NPC图集.png")
    comps0("角色/兔子主角.png")
    grill_bridge()
    bl_bins()
    tr_ring()
    print("=== 当前抠图底部宽松白块:")
    current_bottom_white()


if __name__ == "__main__":
    sys.exit(main())
