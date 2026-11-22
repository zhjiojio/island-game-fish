#!/usr/bin/env python3
"""R0010 补丁3：仅竖屏——完整无沙船精灵 + seaflat/deepflat 船位重填静沙。

不修改任何 land / 横屏资源。
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "package/res/Image/ui"
SPR = ROOT / "package/res/Image/sprites"
VERIFY = ROOT / "docs/_sea-verify/boat-fix"
BACKUP = VERIFY / "pre-patch3"


def _boat_mask(full: np.ndarray, chrome: np.ndarray) -> np.ndarray:
    h, w, _ = full.shape
    rgb = full[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    wood = (r > g + 6) & (r > b + 18) & (r > 65) & (r < 245) & (b < 155) & (g < 195)
    wood2 = (r > g + 2) & (r > b + 20) & (r > 100) & (g < 185) & (b < 140) & ((r - g) + (r - b) > 40)
    cream = (r > 205) & (g > 185) & (b > 155) & (np.abs(r.astype(int) - g) < 40)
    lantern = (r > 195) & (g > 100) & (g < 215) & (b < 150) & (r > b + 55)
    dark = (r + g + b < 200) & (r > 25) & (r >= g - 5) & (r >= b - 5)
    sand = (
        (r > 175)
        & (g > 145)
        & (b > 85)
        & (np.abs(r.astype(int) - g) < 42)
        & (g > b + 12)
        & (r - b < 100)
        & ~(r > g + 15)
    )
    sea = (g > r + 15) & (g > 100) & (b > 70)
    foam = (r > 210) & (g > 210) & (b > 190)
    star = (r > 215) & (g > 55) & (g < 145) & (b < 75) & (r > g + 60)
    ui = chrome[:, :, 3] > 30

    # 船邻域：略宽于一体皮船宽，避免右舷被裁
    roi = np.zeros((h, w), dtype=bool)
    roi[1480:1930, 10:820] = True

    allow = (wood | wood2 | cream | lantern | dark) & ~sand & ~sea & ~foam & ~star & roi
    allow = allow | (ui & roi & ndimage.binary_dilation(wood | wood2, iterations=4))

    seeds = [
        (300, 1650),
        (420, 1720),
        (250, 1600),
        (480, 1680),
        (350, 1780),
        (200, 1700),
        (500, 1800),
        (320, 1580),
        (280, 1620),
        (400, 1850),
        (350, 1880),
        (550, 1700),
        (600, 1750),
    ]
    seed_m = np.zeros((h, w), dtype=bool)
    for x, y in seeds:
        seed_m[max(0, y - 5) : y + 6, max(0, x - 5) : x + 6] = True
    seed_m &= allow
    mask = ndimage.binary_propagation(seed_m, mask=allow)
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_closing(mask, iterations=3)
    mask = mask | (ndimage.binary_dilation(mask, iterations=2) & dark & roi & ~sand & ~sea)
    lab, _ = ndimage.label(mask)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    mask = lab == counts.argmax()
    mask = mask & ~sand & ~sea & ~star
    return mask, wood | wood2, cream, lantern, dark, ui


def build_port_boat() -> dict:
    full = np.array(Image.open(UI / "ui-skin-fish-port.png").convert("RGBA"))
    chrome = np.array(Image.open(UI / "ui-chrome-port.png").convert("RGBA"))
    h, w, _ = full.shape
    mask, wood, cream, lantern, dark, ui = _boat_mask(full, chrome)

    boat = np.zeros_like(full)
    boat[mask & ~ui] = full[mask & ~ui]
    wood_src = wood & mask & ~ui
    ui_on = mask & ui
    ys, xs = np.where(ui_on)
    for y in np.unique(ys):
        xs_row = xs[ys == y]
        y0, y1 = max(0, y - 16), min(h, y + 1)
        samples = full[y0:y1][wood_src[y0:y1]]
        if len(samples) < 5:
            samples = full[y0:y1][(mask & ~ui)[y0:y1]]
        if len(samples) == 0:
            continue
        med = np.median(samples[:, :3], axis=0).astype(np.uint8)
        boat[y, xs_row, :3] = med
        boat[y, xs_row, 3] = 255

    # 去掉左侧沙滩泄漏：只保留深色木芯邻域 + 奶油/灯笼
    r = full[:, :, 0]
    core = mask & wood & (r < 210)
    keep = ndimage.binary_dilation(core, iterations=14) | (mask & (cream | lantern | dark))
    keep = keep | ui_on
    alpha = boat[:, :, 3] > 8
    boat[~(alpha & keep), 3] = 0

    ys, xs = np.where(boat[:, :, 3] > 8)
    bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    crop = Image.fromarray(boat).crop(bb)
    ca = np.array(crop)
    ys, xs = np.where(ca[:, :, 3] > 8)
    crop = crop.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

    out = SPR / "boat_fish_port.png"
    crop.save(out)

    sx, sy = 1152 / 540, 2048 / 960
    meta = {
        "size": list(crop.size),
        "skin_bb": list(bb),
        "design": {
            "cx": round((bb[0] + bb[2]) / 2 / sx),
            "fy": round(bb[3] / sy),
            "h": round((bb[3] - bb[1]) / sy),
            "top": round(bb[1] / sy),
            "x0": round(bb[0] / sx),
            "x1": round(bb[2] / sx),
        },
        "opaque": int((np.array(crop)[:, :, 3] > 10).sum()),
        "bot20_center": float(
            (
                np.array(crop)[
                    -20:,
                    np.array(crop).shape[1] // 4 : 3 * np.array(crop).shape[1] // 4,
                    3,
                ]
                > 10
            ).mean()
        ),
    }
    # 门禁：沙像素
    ca = np.array(crop)
    rgb = ca[:, :, :3].astype(np.int16)
    al = ca[:, :, 3] > 10
    sand = (
        al
        & (rgb[:, :, 0] > 175)
        & (rgb[:, :, 1] > 145)
        & (rgb[:, :, 2] > 85)
        & (np.abs(rgb[:, :, 0].astype(int) - rgb[:, :, 1]) < 42)
        & (rgb[:, :, 1] > rgb[:, :, 2] + 12)
        & ~(rgb[:, :, 0] > rgb[:, :, 1] + 15)
    )
    meta["sand_px"] = int(sand.sum())
    meta["path"] = str(out.relative_to(ROOT))
    print("boat", meta)
    assert meta["sand_px"] < 500, meta
    assert meta["bot20_center"] > 0.7, meta
    return mask, meta


def fill_flat_boat_hole(flat_path: Path, mask: np.ndarray, full: np.ndarray) -> dict:
    flat = np.array(Image.open(flat_path).convert("RGBA"))
    if flat.shape[2] == 3:
        a = np.dstack([flat, np.full(flat.shape[:2], 255, np.uint8)])
    else:
        a = flat.copy()
    # 填洞范围：船蒙版再膨胀，盖住船渣与抹痕
    hole = ndimage.binary_dilation(mask, iterations=6)
    # 沙滩采样：船左侧海星沙滩带
    sand_roi = full[1480:1580, 20:140, :3].astype(np.float32)
    # 去掉过蓝/过绿
    sr, sg, sb = sand_roi[:, :, 0], sand_roi[:, :, 1], sand_roi[:, :, 2]
    ok = ~((sg > sr + 15) | (sb > sr + 20))
    samples = sand_roi[ok]
    if len(samples) < 50:
        samples = sand_roi.reshape(-1, 3)
    # 用采样噪声填：每像素随机取样本 + 轻微行间混合
    ys, xs = np.where(hole)
    rng = np.random.default_rng(42)
    idx = rng.integers(0, len(samples), size=len(ys))
    filled = samples[idx]
    # 纵向微扰，避免死板
    filled = np.clip(filled + rng.normal(0, 3.0, filled.shape), 0, 255)
    out = a.copy()
    out[ys, xs, :3] = filled.astype(np.uint8)
    out[ys, xs, 3] = 255
    # 边界轻模糊
    dil = hole & ~ndimage.binary_erosion(hole, iterations=2)
    if dil.any():
        blur = out.astype(np.float32)
        for c in range(3):
            blur[:, :, c] = ndimage.gaussian_filter(blur[:, :, c], 1.2)
        out[dil, :3] = blur[dil, :3]

    Image.fromarray(out).save(flat_path)
    # 残留木色检查
    rgb = out[:, :, :3].astype(np.int16)
    woodish = hole & (rgb[:, :, 0] > rgb[:, :, 1] + 20) & (rgb[:, :, 0] > 90) & (rgb[:, :, 2] < 100)
    report = {
        "path": str(flat_path.relative_to(ROOT)),
        "hole_px": int(hole.sum()),
        "wood_residual": int(woodish.sum()),
    }
    print("fill", report)
    return report


def main() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    for name in [
        "boat_fish_port.png",
        "ui-skin-fish-port-seaflat.png",
        "ui-skin-fish-port-deepflat.png",
    ]:
        src = SPR / name if name.startswith("boat") else UI / name
        if src.exists():
            shutil.copy2(src, BACKUP / name)

    full = np.array(Image.open(UI / "ui-skin-fish-port.png").convert("RGBA"))
    mask, boat_meta = build_port_boat()
    reports = {
        "boat": boat_meta,
        "flats": [
            fill_flat_boat_hole(UI / "ui-skin-fish-port-seaflat.png", mask, full),
            fill_flat_boat_hole(UI / "ui-skin-fish-port-deepflat.png", mask, full),
        ],
    }
    # 预览
    VERIFY.mkdir(parents=True, exist_ok=True)
    seaflat = Image.open(UI / "ui-skin-fish-port-seaflat.png").convert("RGBA").resize((540, 960), Image.Resampling.LANCZOS)
    boat = Image.open(SPR / "boat_fish_port.png").convert("RGBA")
    d = boat_meta["design"]
    h = d["h"]
    aspect = boat.size[0] / boat.size[1]
    bw = int(h * aspect)
    boat_r = boat.resize((bw, h), Image.Resampling.LANCZOS)
    cx, fy = d["cx"], d["fy"]
    prev = seaflat.copy()
    prev.alpha_composite(boat_r, (cx - bw // 2, fy - h))
    prev.save(VERIFY / "port_preview_after.png")
    (VERIFY / "patch3-report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print("preview", VERIFY / "port_preview_after.png")
    print("design foot suggestion", {"x": d["cx"], "y": d["fy"], "h": d["h"]})


if __name__ == "__main__":
    main()
