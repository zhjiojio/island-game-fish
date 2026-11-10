#!/usr/bin/env python3
"""验证 v2 输出：椰子花朵/椰肉是否保留、白垫是否移除、烤架边缘碎片。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL.Image import open as open_img

ROOT = Path(__file__).resolve().parents[2] / "assets"


def fine(rel: str, cols: int, rows: int, label: str, box: tuple | None = None) -> None:
    p = ROOT / rel
    if not p.is_file():
        print(f"--- {label}: MISSING {rel}")
        return
    arr = np.array(open_img(p).convert("RGBA"))
    if box:
        x0, x1, y0, y1 = box
        arr = arr[y0:y1, x0:x1]
    h, w = arr.shape[:2]
    print(f"--- {label} {rel} {w}x{h}" + (f" box={box}" if box else ""))
    cys = np.linspace(0, h, rows + 1).astype(int)
    cxs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        line = []
        for c in range(cols):
            cell = arr[cys[r]:cys[r + 1], cxs[c]:cxs[c + 1]]
            m = cell[:, :, 3] > 8
            if not m.any():
                line.append(" ")
                continue
            px = cell[m][:, :3].astype(np.float32)
            lum = px.max(axis=1)
            sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
            white = (lum > 205) & (sat < 0.32)
            dark = lum < 100
            if white.mean() > 0.5:
                line.append("W")
            elif dark.mean() > 0.5:
                line.append("K")
            elif (lum > 195).mean() > 0.5 and (sat < 0.34).mean() > 0.6:
                line.append("f")  # 残留奶油底色
            else:
                line.append("#")
        print("".join(line))


def stats(rel: str, label: str) -> None:
    p = ROOT / rel
    if not p.is_file():
        print(f"[{label}] MISSING")
        return
    arr = np.array(open_img(p).convert("RGBA"))
    m = arr[:, :, 3] > 8
    if not m.any():
        print(f"[{label}] EMPTY!")
        return
    px = arr[m][:, :3].astype(np.float32)
    lum = px.max(axis=1)
    sat = (px.max(axis=1) - px.min(axis=1)) / (lum + 1e-3)
    film = (lum >= 195) & (sat <= 0.34) & (np.abs(px[:, 0] - px[:, 1]) <= 30) & (px[:, 2] >= 110)
    white = (lum > 205) & (sat < 0.32)
    dark = lum < 100
    ys, xs = np.where(m)
    print(f"[{label}] {arr.shape[1]}x{arr.shape[0]} opaque={int(m.sum())} "
          f"white={int((m & white).sum()) if False else int(white.sum())} dark={int(dark.sum())} film_like={int(film.sum())} "
          f"bbox_x[{xs.min()}:{xs.max()}]y[{ys.min()}:{ys.max()}]")


def main() -> None:
    # 椰子四张：全幅 + 关键区
    fine("道具/椰子/椰子-青椰-榨汁.png", 72, 26, "新·青椰-榨汁 全幅")
    fine("道具/椰子/椰子-金椰-榨汁.png", 72, 26, "新·金椰-榨汁 全幅")
    fine("道具/椰子/椰子-金椰.png", 72, 26, "新·金椰 全幅(看中间椰肉)")
    fine("道具/椰子/椰子-青椰.png", 72, 26, "新·青椰 全幅")
    print()
    # 顾客：底部与整体
    fine("角色/顾客/顾客-蓝熊.png", 60, 26, "新·蓝熊 全幅")
    fine("角色/顾客/顾客-企鹅.png", 60, 24, "新·企鹅 全幅(看白肚子)")
    fine("角色/顾客/顾客-狐狸.png", 60, 26, "新·狐狸 全幅")
    fine("角色/顾客/顾客-米熊.png", 60, 24, "新·米熊 全幅")
    fine("角色/顾客/顾客-粉猪.png", 60, 24, "新·粉猪 全幅")
    print()
    # 主角与烤架
    fine("角色/主角/主角-兔子烤鱼师.png", 70, 26, "新·主角-正面 全幅")
    fine("角色/主角/主角-兔子-背面.png", 70, 26, "新·主角-背面 全幅")
    fine("道具/烤架/烤架-三级.png", 66, 24, "新·烤架-三级(看右缘碎片)")
    fine("道具/烤架/烤架-四级.png", 66, 26, "新·烤架-四级(看左缘)")
    print()
    for rel, lb in [
        ("道具/椰子/椰子-青椰-榨汁.png", "青椰榨"), ("道具/椰子/椰子-金椰-榨汁.png", "金椰榨"),
        ("道具/椰子/椰子-金椰.png", "金椰"), ("道具/椰子/椰子-青椰.png", "青椰"),
        ("角色/顾客/顾客-蓝熊.png", "蓝熊"), ("角色/顾客/顾客-企鹅.png", "企鹅"),
        ("角色/顾客/顾客-狐狸.png", "狐狸"), ("角色/顾客/顾客-米熊.png", "米熊"),
        ("角色/顾客/顾客-粉猪.png", "粉猪"), ("角色/主角/主角-兔子烤鱼师.png", "主角正"),
        ("道具/烤架/烤架-三级.png", "烤架三"), ("道具/烤架/烤架-四级.png", "烤架四"),
    ]:
        stats(rel, lb)


if __name__ == "__main__":
    sys.exit(main())
