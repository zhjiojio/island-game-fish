#!/usr/bin/env python3
"""深度探针：切分点、连通域细分、椰子暗区诊断、元素主色（用于命名）。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2] / "assets"


def col_runs(rel: str, thresholds=(8, 32, 64, 128)) -> None:
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))
    h, w = arr.shape[:2]
    print(f"=== {rel} ({w}x{h})")
    for t in thresholds:
        mask = arr[:, :, 3] > t
        dens = mask.mean(axis=0)
        zero = dens < 0.002
        # 找全透明列段
        runs = []
        start = None
        for x in range(w):
            if zero[x] and start is None:
                start = x
            elif not zero[x] and start is not None:
                runs.append((start, x - 1))
                start = None
        if start is not None:
            runs.append((start, w - 1))
        runs = [r for r in runs if r[1] - r[0] >= 2]
        print(f"  alpha>{t}: {len(runs)} gap runs: {runs[:20]}")


def components_at(rel: str, thresholds=(8, 64, 128), dil=2) -> None:
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))
    print(f"=== comps {rel}")
    for t in thresholds:
        mask = arr[:, :, 3] > t
        d = ndimage.binary_dilation(mask, iterations=dil)
        lab, n = ndimage.label(d)
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        objs = ndimage.find_objects(lab)
        keep = []
        for i, sl in enumerate(objs):
            if sizes[i] < 800:
                continue
            keep.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop, int(sizes[i])))
        keep.sort(key=lambda c: c[0])
        print(f"  alpha>{t} dil{dil}: {len(keep)} comps")
        for c in keep:
            print(f"    x[{c[0]}:{c[1]}] y[{c[2]}:{c[3]}] px={c[4]}")


def dominant_colors(rel: str, boxes: list[tuple[int, int, int, int]]) -> None:
    arr = np.array(Image.open(ROOT / rel).convert("RGBA"))
    print(f"=== colors {rel}")
    for i, (x0, x1, y0, y1) in enumerate(boxes):
        sub = arr[y0:y1, x0:x1]
        m = sub[:, :, 3] > 128
        if not m.any():
            print(f"    box{i}: empty")
            continue
        px = sub[m][:, :3].astype(np.float32)
        lum = px.max(axis=1)
        sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
        # 饱和像素的主色
        colored = px[sat > 0.25]
        if len(colored) > 50:
            mean_c = colored.mean(axis=0)
            hue_desc = "R" if mean_c[0] > mean_c[1] and mean_c[0] > mean_c[2] else (
                "G" if mean_c[1] > mean_c[2] else "B")
            pct = {k: v for k, v in
                   [("dark<60", float((lum < 60).mean())), ("mid", float(((lum >= 60) & (lum < 180)).mean())),
                    ("bright>200", float((lum > 200).mean())),
                    ("sat_red", float(((px[:, 0] > px[:, 1] + 30) & (px[:, 0] > px[:, 2] + 30)).mean())),
                    ("sat_green", float(((px[:, 1] > px[:, 0] + 30) & (px[:, 1] > px[:, 2] + 30)).mean())),
                    ("sat_blue", float(((px[:, 2] > px[:, 0] + 30) & (px[:, 2] > px[:, 1] + 30)).mean())),
                    ("sat_yellow", float(((px[:, 0] > px[:, 2] + 30) & (px[:, 1] > px[:, 2] + 30)).mean()))]}
            print(f"    box{i} x[{x0}:{x1}]y[{y0}:{y1}] colored_mean={np.round(mean_c,0)} dom={hue_desc} " +
                  " ".join(f"{k}={v:.0%}" for k, v in pct.items()))
        else:
            print(f"    box{i} x[{x0}:{x1}]y[{y0}:{y1}] low-sat, mean={np.round(px.mean(axis=0),0)}")


def probe_coconut() -> None:
    arr = np.array(Image.open(ROOT / "道具/椰子图集.png").convert("RGBA"))
    h, w = arr.shape[:2]
    print(f"=== coconut atlas probe {w}x{h}")
    # 四个主体
    bodies = {
        "青椰(TL)": (304, 866, 65, 674),
        "金椰(TR)": (1153, 1726, 59, 685),
        "青椰榨(BL)": (280, 921, 733, 1467),
        "金椰榨(BR)": (1153, 1773, 723, 1468),
    }
    for name, (x0, x1, y0, y1) in bodies.items():
        sub = arr[y0:y1, x0:x1]
        a = sub[:, :, 3]
        rgb = sub[:, :, :3].astype(np.float32)
        lum = rgb.max(axis=2)
        sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
        opaque = a > 128
        dark_opaque = opaque & (lum < 90) & (sat < 0.35)
        hole = (a < 8) & (lum < 90)
        print(f"  {name}: opaque%={opaque.mean():.0%} dark_opaque_px={int(dark_opaque.sum())} "
              f"transparent_dark_px={int(hole.sum())}")
        # 内部透明洞（被不透明包围）
        if (a < 8).any():
            trans = a < 8
            filled = ndimage.binary_fill_holes(opaque)
            inner_holes = filled & ~opaque & trans
            print(f"    inner transparent holes px={int(inner_holes.sum())}")
            if inner_holes.any():
                ys, xs = np.where(inner_holes)
                print(f"    hole bbox local x[{xs.min()}:{xs.max()}] y[{ys.min()}:{ys.max()}] "
                      f"(atlas x[{x0+xs.min()}:{x0+xs.max()}] y[{y0+ys.min()}:{y0+ys.max()}])")
                # 洞内的 RGB 是什么
                hh = sub[inner_holes][:, :3]
                if len(hh):
                    print(f"    hole RGB mean={hh.mean(axis=0).round(0)} min={hh.min(axis=0)} max={hh.max(axis=0)}")
    # 小装饰件归属：距离主体
    pieces = [(1122, 1185, 979, 1066), (1137, 1207, 238, 332), (1171, 1254, 873, 984),
              (1208, 1308, 95, 219), (1666, 1753, 125, 240), (1710, 1791, 435, 544),
              (1720, 1777, 1193, 1271), (1747, 1804, 994, 1073)]
    for i, (x0, x1, y0, y1) in enumerate(pieces):
        sub = arr[y0:y1, x0:x1]
        m = sub[:, :, 3] > 128
        if m.any():
            px = sub[m][:, :3].astype(np.float32)
            print(f"  piece{i} x[{x0}:{x1}]y[{y0}:{y1}] px={int(m.sum())} meanRGB={px.mean(axis=0).round(0)}")


def main() -> None:
    for rel in ["道具/烤架图集.png", "角色/顾客图集.png", "角色/特殊NPC图集.png",
                "角色/兔子主角.png", "道具/天气图集.png"]:
        col_runs(rel)
    print()
    components_at("道具/天气图集.png", thresholds=(8, 64, 128), dil=2)
    components_at("角色/顾客图集.png", thresholds=(8, 128), dil=2)
    components_at("角色/特殊NPC图集.png", thresholds=(8, 128), dil=2)
    print()
    probe_coconut()
    print()
    dominant_colors("道具/作物图集.png", [
        (102, 1003, 42, 995), (1093, 1954, 230, 945), (96, 1018, 1018, 1973), (1096, 1990, 1113, 1940)])
    dominant_colors("道具/菜园图集.png", [
        (87, 606, 46, 731), (668, 1302, 90, 728), (1337, 2023, 42, 733),
        (30, 684, 842, 1422), (826, 1179, 788, 1424), (1330, 2025, 799, 1447)])


if __name__ == "__main__":
    sys.exit(main())
