#!/usr/bin/env python3
"""从角落连通的近白底抠透明，用于 btn-wood / dialog / 精灵图等小图。全屏 ui-skin 勿用。"""
from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def _corner_flood_similar(rgba: np.ndarray, bg: np.ndarray, tolerance: float) -> np.ndarray:
    h, w = rgba.shape[:2]
    out = rgba.copy()

    def similar(px: np.ndarray) -> bool:
        return float(np.linalg.norm(px[:3].astype(np.float32) - bg)) <= tolerance

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if similar(out[y, x]):
            q.append((x, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y, x]:
            continue
        if not similar(out[y, x]):
            continue
        visited[y, x] = True
        out[y, x, 3] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                q.append((nx, ny))
    return out


def peel_bright_adjacent_to_transparent(rgba: np.ndarray, lum_cut: float, sat_max: float, passes: int = 6) -> np.ndarray:
    """腿缝、铲柄旁等：仅去掉与透明相邻的亮色缝隙，不攻击角色本体内部。"""
    out = rgba.copy()
    for _ in range(passes):
        alpha = out[:, :, 3] > 8
        if not alpha.any():
            break
        a = alpha.astype(np.uint8)
        dil = (
            a[:-2, :-2]
            | a[:-2, 1:-1]
            | a[:-2, 2:]
            | a[1:-1, :-2]
            | a[1:-1, 1:-1]
            | a[1:-1, 2:]
            | a[2:, :-2]
            | a[2:, 1:-1]
            | a[2:, 2:]
        )
        rgb = out[:, :, :3].astype(np.float32)
        lum = rgb.max(axis=2)
        sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
        paper = (lum >= lum_cut) & (sat < sat_max)
        kill = np.zeros_like(alpha, dtype=bool)
        kill[1:-1, 1:-1] = (~alpha[1:-1, 1:-1]) & paper[1:-1, 1:-1] & dil
        if not kill.any():
            break
        out[kill, 3] = 0
    return out


def corner_flood_alpha(rgba: np.ndarray, tolerance: float) -> np.ndarray:
    h, w = rgba.shape[:2]
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    samples = [rgba[y, x, :3].astype(np.float32) for x, y in corners]
    bg = np.mean(samples, axis=0)
    out = _corner_flood_similar(rgba, bg, tolerance)
    rgb = out[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    fringe = (lum >= 248) & (sat < 0.08)
    out[fringe, 3] = np.minimum(out[fringe, 3], 0)
    return defringe_cream_halo(out)


def defringe_cream_halo(rgba: np.ndarray, lum_cut: float = 236, sat_max: float = 0.14) -> np.ndarray:
    """去除纸边/白边光晕：近白低饱和像素 + 与透明相邻的奶油边（向量化）。"""
    rgb = rgba[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    paper = (lum >= lum_cut) & (sat < sat_max)
    rgba = rgba.copy()
    rgba[paper, 3] = 0
    alpha = rgba[:, :, 3] > 8
    h, w = alpha.shape
    if h < 3 or w < 3:
        return rgba
    # 3×3 膨胀：透明格是否与不透明邻接
    a = alpha.astype(np.uint8)
    dil = (
        a[:-2, :-2]
        | a[:-2, 1:-1]
        | a[:-2, 2:]
        | a[1:-1, :-2]
        | a[1:-1, 1:-1]
        | a[1:-1, 2:]
        | a[2:, :-2]
        | a[2:, 1:-1]
        | a[2:, 2:]
    )
    for _ in range(3):
        kill = np.zeros_like(alpha, dtype=bool)
        kill[1:-1, 1:-1] = (~alpha[1:-1, 1:-1]) & paper[1:-1, 1:-1] & dil
        if not kill.any():
            break
        rgba[kill, 3] = 0
        paper &= ~kill
        alpha = rgba[:, :, 3] > 8
        a = alpha.astype(np.uint8)
        dil = (
            a[:-2, :-2]
            | a[:-2, 1:-1]
            | a[:-2, 2:]
            | a[1:-1, :-2]
            | a[1:-1, 1:-1]
            | a[1:-1, 2:]
            | a[2:, :-2]
            | a[2:, 1:-1]
            | a[2:, 2:]
        )
    # 边缘一圈再清一次近白
    fringe = paper & (rgba[:, :, 3] < 32)
    rgba[fringe, 3] = 0
    return rgba


def key_alpha_atlas_cell(cell: np.ndarray, halo_lum: float = 236, halo_sat: float = 0.14) -> np.ndarray:
    """附录已带 Alpha 的黑底图：尊重原透明，仅清纸边/腿缝。"""
    out = cell.copy()
    out[out[:, :, 3] < 6, 3] = 0
    out[out[:, :, 3] < 6, :3] = 0
    rgb = out[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    fringe = (out[:, :, 3] > 0) & (lum >= halo_lum) & (sat < halo_sat)
    out[fringe, 3] = 0
    out = peel_bright_adjacent_to_transparent(out, lum_cut=220, sat_max=0.22, passes=14)
    return out


def key_character_cell(cell: np.ndarray, tolerance: float = 30.0) -> np.ndarray:
    """角色：修补源 Alpha 破洞（黑毛/帽顶），只抠外缘缝隙。"""
    del tolerance
    out = cell.copy()
    rgb = out[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    src_a = out[:, :, 3].astype(np.float32)
    bg = (lum < 14) & (sat < 0.06)
    painted = (~bg) & ((src_a > 6) | (lum > 20))
    out[:, :, 3] = np.where(painted, 255, 0).astype(np.uint8)
    fringe = painted & (lum >= 245) & (sat < 0.09)
    out[fringe, 3] = 0
    out = peel_bright_adjacent_to_transparent(out, lum_cut=235, sat_max=0.16, passes=12)
    return peel_bright_adjacent_to_transparent(out, lum_cut=248, sat_max=0.08, passes=2)


def key_grill_cell(cell: np.ndarray, tolerance: float = 36.0) -> np.ndarray:
    del tolerance
    out = key_alpha_atlas_cell(cell, halo_lum=232, halo_sat=0.13)
    return defringe_cream_halo(out, lum_cut=242, sat_max=0.11)


def key_grilled_cell(cell: np.ndarray, tolerance: float = 36.0) -> np.ndarray:
    del tolerance
    out = key_alpha_atlas_cell(cell, halo_lum=230, halo_sat=0.15)
    return defringe_cream_halo(out, lum_cut=236, sat_max=0.16)


def key_coconut_cell(cell: np.ndarray, tolerance: float = 34.0) -> np.ndarray:
    del tolerance
    out = key_alpha_atlas_cell(cell, halo_lum=234, halo_sat=0.14)
    return defringe_cream_halo(out, lum_cut=240, sat_max=0.13)


def key_sprite_cell(cell: np.ndarray, tolerance: float = 48.0) -> np.ndarray:
    """米白纸底小图（旧流程）。"""
    out = corner_flood_alpha(cell.copy(), tolerance)
    return defringe_cream_halo(out, lum_cut=234, sat_max=0.16)


def key_pure_white(rgba: np.ndarray, min_rgb: int, fringe_sat: float = 0.08) -> np.ndarray:
    """仅去除接近 #FFF 的像素，不泛洪（适合鱼种图集等含大面积米白纸面）。"""
    rgb = rgba[:, :, :3].astype(np.float32)
    lum = rgb.max(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / (lum + 1e-3)
    white = (rgb.min(axis=2) >= min_rgb) | ((lum >= min_rgb - 6) & (sat < fringe_sat))
    rgba = rgba.copy()
    rgba[white, 3] = 0
    return rgba


def process_file(path: Path, tolerance: float, dry_run: bool, mode: str, min_rgb: int) -> None:
    im = Image.open(path)
    arr = np.array(im.convert("RGBA"))
    if mode == "white":
        out = key_pure_white(arr, min_rgb)
    else:
        out = corner_flood_alpha(arr.copy(), tolerance)
    transparent = int((out[:, :, 3] == 0).sum())
    total = out.shape[0] * out.shape[1]
    if dry_run:
        print(f"[dry] {path} transparent {transparent}/{total} ({100*transparent/total:.1f}%)")
        return
    Image.fromarray(out).save(path, optimize=True)
    print(f"ok {path} transparent {transparent}/{total} ({100*transparent/total:.1f}%)")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("paths", nargs="+", help="PNG files")
    p.add_argument("--tolerance", type=float, default=38.0)
    p.add_argument("--mode", choices=("flood", "white"), default="flood")
    p.add_argument("--min-rgb", type=int, default=248, help="mode=white 时 R/G/B 下限")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    for raw in args.paths:
        process_file(Path(raw), args.tolerance, args.dry_run, args.mode, args.min_rgb)
    return 0


if __name__ == "__main__":
    sys.exit(main())
