#!/usr/bin/env python3
"""像素级分析：图集网格结构 + 当前抠图问题诊断。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"

ATLASES = [
    ("道具/烤架图集.png", 4),
    ("道具/椰子图集.png", 4),
    ("道具/作物图集.png", 4),
    ("道具/天气图集.png", 4),
    ("道具/菜园图集.png", 4),
    ("角色/顾客图集.png", 5),
    ("角色/特殊NPC图集.png", 4),
    ("角色/兔子主角.png", 4),
]

CUTOUTS = [
    "道具/烤架/烤架-一级.png",
    "道具/烤架/烤架-二级.png",
    "道具/烤架/烤架-三级.png",
    "道具/烤架/烤架-四级.png",
    "道具/椰子/椰子-青椰.png",
    "道具/椰子/椰子-金椰.png",
    "道具/椰子/椰子-青椰-榨汁.png",
    "道具/椰子/椰子-金椰-榨汁.png",
    "角色/顾客/顾客-蓝熊.png",
    "角色/顾客/顾客-米熊.png",
    "角色/顾客/顾客-粉猪.png",
    "角色/顾客/顾客-企鹅.png",
    "角色/顾客/顾客-狐狸.png",
    "角色/主角/主角-兔子烤鱼师.png",
    "角色/主角/主角-兔子-侧面.png",
    "角色/主角/主角-兔子-背面.png",
    "角色/主角/主角-兔子-部件.png",
    "角色/特殊NPC/特殊NPC-鹿.png",
    "角色/特殊NPC/特殊NPC-獾厨师.png",
    "角色/特殊NPC/特殊NPC-松鼠.png",
    "角色/特殊NPC/特殊NPC-乌龟渔夫.png",
]


def rgb_stats(arr: np.ndarray, mask: np.ndarray) -> None:
    if not mask.any():
        print("    opaque: NONE")
        return
    px = arr[mask][:, :3].astype(np.float32)
    lum = px.max(axis=1)
    sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
    near_black = float(((lum < 20) & (sat < 0.10)).mean())
    near_white = float(((lum > 240) & (sat < 0.10)).mean())
    print(
        f"    opaque px={int(mask.sum())} near_black={near_black:.1%} near_white={near_white:.1%}"
    )


def analyze_atlas(rel: str, expected: int) -> None:
    p = ROOT / rel
    im = Image.open(p)
    arr = np.array(im.convert("RGBA"))
    h, w = arr.shape[:2]
    print(f"=== ATLAS {rel} size={w}x{h} mode={im.mode}")
    a = arr[:, :, 3]
    print(f"  alpha: min={a.min()} max={a.max()} zero%={(a == 0).mean():.1%} full%={(a == 255).mean():.1%}")
    # 角落背景色（含 alpha）
    corners = [arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]]
    print(f"  corners={[tuple(int(v) for v in c) for c in corners]}")
    # 连通域（alpha>8），膨胀合并细部件
    mask = a > 8
    dil = ndimage.binary_dilation(mask, iterations=6)
    lab, n = ndimage.label(dil)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs):
        if sizes[i] < 500:
            continue
        comps.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop, int(sizes[i])))
    comps.sort(key=lambda c: c[0])
    print(f"  components(>=500px after dil6): {len(comaps) if False else len(comps)} (expected {expected})")
    for c in comps:
        print(f"    x[{c[0]}:{c[1]}] y[{c[2]}:{c[3]}] w={c[1]-c[0]} h={c[3]-c[2]} px={c[4]}")


def analyze_cutout(rel: str) -> None:
    p = ROOT / rel
    if not p.is_file():
        print(f"=== CUTOUT {rel} MISSING")
        return
    im = Image.open(p)
    arr = np.array(im.convert("RGBA"))
    h, w = arr.shape[:2]
    a = arr[:, :, 3]
    mask = a > 8
    print(f"=== CUTOUT {rel} size={w}x{h} opaque%={mask.mean():.1%}")
    if not mask.any():
        print("    EMPTY!")
        return
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    print(f"    bbox x[{x0}:{x1+1}] y[{y0}:{y1+1}] -> 距边 L={x0} R={w-1-x1} T={y0} B={h-1-y1}")
    # 按行/列的透明密度判断是否有大片残留
    rowden = mask.mean(axis=1)
    colden = mask.mean(axis=0)
    print(f"    row density top5={np.round(rowden[:5], 2)} bottom5={np.round(rowden[-5:], 2)}")
    print(f"    col density left5={np.round(colden[:5], 2)} right5={np.round(colden[-5:], 2)}")
    rgb_stats(arr, mask)
    # 近白连通域中触碰底边的（脚底白板检测）
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    whiteish = mask & (lum > 235) & (sat < 0.12)
    if whiteish.any():
        lab, n = ndimage.label(whiteish)
        sizes = ndimage.sum(whiteish, lab, range(1, n + 1))
        objs = ndimage.find_objects(lab)
        h2 = arr.shape[0]
        for i, sl in enumerate(objs):
            if sizes[i] < 300:
                continue
            touch_bottom = sl[0].stop >= h2 - 4
            print(f"    white blob {i}: x[{sl[1].start}:{sl[1].stop}] y[{sl[0].start}:{sl[0].stop}] px={int(sizes[i])} touch_bottom={touch_bottom}")


def main() -> None:
    for rel, exp in ATLASES:
        analyze_atlas(rel, exp)
    print()
    for rel in CUTOUTS:
        analyze_cutout(rel)


if __name__ == "__main__":
    sys.exit(main())
