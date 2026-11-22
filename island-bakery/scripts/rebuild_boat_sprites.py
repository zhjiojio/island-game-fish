#!/usr/bin/env python3
"""从一体皮 vs noboat 重抽完整真船切图（去掉 UI chrome，保留木船）。

输出：
  package/res/Image/sprites/boat_fish_port.png
  package/res/Image/sprites/boat_fish_land.png
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "package/res/Image/ui"
OUT = ROOT / "package/res/Image/sprites"


def rebuild_port() -> None:
    full = np.array(Image.open(UI / "ui-skin-fish-port.png").convert("RGBA"))
    nob = np.array(Image.open(UI / "ui-skin-fish-port-noboat.png").convert("RGBA"))
    chrome = np.array(Image.open(UI / "ui-chrome-port.png").convert("RGBA"))
    h, w, _ = full.shape
    diff = np.abs(full.astype(np.int16) - nob.astype(np.int16)).sum(axis=2)
    lab, _ = ndimage.label(diff > 40)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    hole = lab == counts.argmax()
    hole = ndimage.binary_fill_holes(hole)
    hole = ndimage.binary_dilation(hole, iterations=2)

    rgb = full[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    wood = (r > g + 8) & (r > b + 15) & (r > 70) & (r < 250) & (b < 160) & (g < r + 5)
    wood2 = (r > g) & (r > b + 10) & (r > 90) & (g < 200) & (b < 150) & (r - b > 25)
    cream = (r > 200) & (g > 180) & (b > 145) & (g < 245)
    lantern = (r > 190) & (g > 95) & (g < 210) & (b < 145) & (r > b + 50)
    dark = (r + g + b < 210) & (r > 30) & (r >= g) & (r >= b - 10)
    allow = wood | wood2 | cream | lantern | dark
    seed = hole & (wood | wood2)
    mask = ndimage.binary_propagation(seed, mask=hole & allow)
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = mask | (ndimage.binary_dilation(mask, iterations=1) & dark & hole)

    ui = chrome[:, :, 3] > 30
    boat = np.zeros_like(full)
    boat[mask & ~ui] = full[mask & ~ui]
    wood_src = mask & (wood | wood2) & ~ui
    ui_on = mask & ui
    if ui_on.any():
        ys, xs = np.where(ui_on)
        for y in np.unique(ys):
            xs_row = xs[ys == y]
            y0, y1 = max(0, y - 12), min(h, y + 13)
            samples = boat[y0:y1][wood_src[y0:y1]]
            if len(samples) == 0:
                samples = full[y0:y1][mask[y0:y1] & ~ui[y0:y1]]
            if len(samples) == 0:
                continue
            med = np.median(samples[:, :3], axis=0).astype(np.uint8)
            boat[y, xs_row, :3] = med
            boat[y, xs_row, 3] = 255

    ys, xs = np.where(boat[:, :, 3] > 8)
    bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    crop = Image.fromarray(boat).crop(bb)
    ca = np.array(crop)
    ys, xs = np.where(ca[:, :, 3] > 8)
    crop = crop.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    out = OUT / "boat_fish_port.png"
    crop.save(out)
    print("port", crop.size, "bb", bb, "->", out)


def rebuild_land() -> None:
    full = np.array(Image.open(UI / "ui-skin-fish-land.png").convert("RGBA"))
    nob = np.array(Image.open(UI / "ui-skin-fish-land-noboat.png").convert("RGBA"))
    chrome = np.array(Image.open(UI / "ui-chrome-land.png").convert("RGBA"))
    diff = np.abs(full.astype(np.int16) - nob.astype(np.int16)).sum(axis=2)
    lab, _ = ndimage.label(diff > 40)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    mask = lab == counts.argmax()
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_closing(mask, iterations=2)
    weak = diff > 15
    for _ in range(4):
        mask = mask | (ndimage.binary_dilation(mask, iterations=1) & weak)
    rgb = full[:, :, :3].astype(np.int16)
    sea = (rgb[:, :, 1] > rgb[:, :, 0] + 20) & (rgb[:, :, 1] > 115)
    mask = mask & ~sea
    ui = chrome[:, :, 3] > 30
    boat = np.zeros_like(full)
    boat[mask & ~ui] = full[mask & ~ui]
    ys, xs = np.where(boat[:, :, 3] > 8)
    bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    crop = Image.fromarray(boat).crop(bb)
    out = OUT / "boat_fish_land.png"
    crop.save(out)
    print("land", crop.size, "bb", bb, "->", out)


def main() -> None:
    os.chdir(ROOT)
    rebuild_port()
    rebuild_land()


if __name__ == "__main__":
    main()
