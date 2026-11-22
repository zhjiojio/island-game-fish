#!/usr/bin/env python3
"""从竖屏小船底图 JPEG 去棋盘格，输出 boat_fish_port.png（真透明 RGBA）。

源：package/res/Image/ui/竖屏钓鱼区-小船-底图基地.jpeg
出：package/res/Image/sprites/boat_fish_port.png
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "package/res/Image/ui/竖屏钓鱼区-小船-底图基地.jpeg"
OUT = ROOT / "package/res/Image/sprites/boat_fish_port.png"
VERIFY = ROOT / "docs/_sea-verify/boat-fix"
BACKUP = VERIFY / "pre-newboat"


def cut_boat() -> dict:
    arr = np.array(Image.open(SRC).convert("RGB")).astype(np.int16)
    h, w, _ = arr.shape
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    mean = (r + g + b) / 3.0

    checker = (chroma <= 18) & (mean >= 200)
    warm = ((r > g + 6) & (r > b + 12) & (r > 50) & (mean < 220)) | (
        (r > 180) & (g > 90) & (g < 220) & (b < 150) & (r > b + 40)
    )
    cream = (r > 195) & (g > 175) & (b > 140) & (chroma < 55) & (mean < 235) & (r > b + 20)
    bg_cand = (checker | ((chroma <= 22) & (mean >= 190))) & ~(warm | cream)
    bg_cand = ndimage.binary_dilation(bg_cand, iterations=1) | bg_cand

    seed = np.zeros((h, w), dtype=bool)
    seed[0:3, :] = True
    seed[-3:, :] = True
    seed[:, 0:3] = True
    seed[:, -3:] = True
    seed &= bg_cand
    bg = ndimage.binary_propagation(seed, mask=bg_cand)

    mask = ~bg
    mask = ndimage.binary_fill_holes(mask)
    lab, _ = ndimage.label(mask)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    mask = lab == counts.argmax()
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[mask, :3] = arr[mask].astype(np.uint8)
    out[mask, 3] = 255
    edge = mask & ndimage.binary_dilation(~mask, iterations=2)
    fringe = edge & (chroma <= 25) & (mean >= 205)
    out[fringe, 3] = 0

    ys, xs = np.where(out[:, :, 3] > 8)
    bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    crop = Image.fromarray(out).crop(bb)

    BACKUP.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        shutil.copy2(OUT, BACKUP / "boat_fish_port.png")
    crop.save(OUT)

    ca = np.array(crop)
    opaque = ca[:, :, 3] > 8
    cr = ca[:, :, 0].astype(int)
    cg = ca[:, :, 1].astype(int)
    cb = ca[:, :, 2].astype(int)
    cchroma = np.maximum(np.maximum(cr, cg), cb) - np.minimum(np.minimum(cr, cg), cb)
    cmean = (cr + cg + cb) / 3.0
    checker_res = opaque & (cchroma <= 18) & (cmean >= 210)

    meta = {
        "source": str(SRC.relative_to(ROOT)),
        "out": str(OUT.relative_to(ROOT)),
        "crop_size": list(crop.size),
        "bb_in_source": list(bb),
        "opaque_pct": float(opaque.mean()),
        "checker_residual_pct": float(checker_res.mean()),
        "bottom_opaque_pct": float(opaque[-1].mean()),
    }
    VERIFY.mkdir(parents=True, exist_ok=True)
    (VERIFY / "newboat_report.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    crop.save(VERIFY / "newboat_cut_final.png")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return meta


if __name__ == "__main__":
    cut_boat()
