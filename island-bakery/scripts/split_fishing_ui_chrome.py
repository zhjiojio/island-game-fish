#!/usr/bin/env python3
"""C7：从钓鱼区一体皮拆出独立 UI 透明层，并对 seaflat/deepflat 补底。

输出：
- ui-chrome-{land,port}.png：顶部木条 + 底部地图/背包（透明底）
- 覆盖写入 ui-skin-fish-*-seaflat/deepflat.png：去掉 UI 后补天空/沙滩/船甲板
- docs/_sea-verify/chrome/ 下调试图与像素报告

热区坐标不由此脚本推导，点击仍用 input.js 现有 navY 矩形。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "package" / "res" / "Image" / "ui"
OUT = ROOT / "docs" / "_sea-verify" / "chrome"


def ui_like(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0].astype(np.float32), a[..., 1].astype(np.float32), a[..., 2].astype(np.float32)
    wood = (r > g + 12) & (r > b + 22) & (r > 70) & (r < 235) & (g > 35) & (g < 180)
    cream = (r > 165) & (g > 135) & (b > 85) & (r > b + 8) & (r >= g - 20)
    rope = (r > 80) & (r < 180) & (g > 50) & (g < 145) & (b < 105) & (r > b + 12)
    leaf = (g > r + 10) & (g > b + 6) & (g > 65)
    flower = ((r > 190) & (g > 170) & (b > 140)) | ((r > 170) & (g > 145) & (b > 30) & (r > b + 20))
    ink = (r < 110) & (g < 90) & (b < 70) & (r > 10)
    icon = ((r > 140) & (g < 90) & (b < 90)) | ((r > 120) & (g > 70) & (b < 60) & (r > b + 40))
    return wood | cream | rope | leaf | flower | ink | icon


def extract_top_mask(a: np.ndarray, max_y: int) -> np.ndarray:
    h, w, _ = a.shape
    m = ui_like(a)
    m[max_y:] = False
    lab, _ = ndi.label(m)
    keep = np.unique(lab[: max(12, max_y // 8)])
    keep = keep[keep > 0]
    mask = np.isin(lab, keep) if keep.size else m
    # 阴影与细绳
    mask = ndi.binary_dilation(mask, iterations=2)
    mask[max_y:] = False
    return mask


def extract_bottom_mask(a: np.ndarray, roi: tuple[int, int, int, int]) -> np.ndarray:
    """roi = (x0, y0, x1, y1)，只在此矩形内取 UI 像素并形态学收紧。"""
    h, w, _ = a.shape
    x0, y0, x1, y1 = roi
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    band = np.zeros((h, w), dtype=bool)
    band[y0:y1, x0:x1] = True
    m = ui_like(a) & band
    # 只剔除「明显海水」；羊皮纸/奶油色木牌中心不得当沙滩删掉
    r, g, b = a[..., 0].astype(np.float32), a[..., 1].astype(np.float32), a[..., 2].astype(np.float32)
    sea = ((b > r + 30) & (b > 75) & (b > g - 20)) | ((g > r + 30) & (g > 115) & (b > r + 8))
    m &= ~sea
    lab, _ = ndi.label(m)
    keep = []
    for i in range(1, int(lab.max()) + 1):
        ys, xs = np.where(lab == i)
        if ys.size < 400:
            continue
        # 触底或接近底栏
        if ys.max() < y1 - 40 and ys.mean() < (y0 + y1) * 0.5:
            continue
        keep.append(i)
    mask = np.isin(lab, keep) if keep else m
    mask = ndi.binary_closing(mask, iterations=2)
    mask = ndi.binary_dilation(mask, iterations=1)
    mask &= band
    return mask


def fill_top_bar(a: np.ndarray, top: np.ndarray) -> np.ndarray:
    """顶栏：取木条正下方若干行天空/远景，按列克隆上去。"""
    out = a.copy().astype(np.float32)
    if not top.any():
        return out
    h, w, _ = a.shape
    ys = np.where(top.any(axis=1))[0]
    y_end = int(ys.max())
    # 参考带：顶栏下方 6~18 行的非遮罩像素
    refs = []
    for y in range(y_end + 1, min(h, y_end + 28)):
        row_m = ~top[y]
        if row_m.sum() < w * 0.5:
            continue
        refs.append(a[y].astype(np.float32))
        if len(refs) >= 10:
            break
    if not refs:
        return out
    ref = np.median(np.stack(refs, axis=0), axis=0)
    for y in ys:
        cols = top[y]
        out[y, cols] = ref[cols]
    return out


def fill_bottom_plaques(a: np.ndarray, bot: np.ndarray) -> np.ndarray:
    """底栏木牌：只在 ROI 内做最近邻灌色 + 小范围模糊，避免全图卷积。"""
    out = a.copy().astype(np.float32)
    if not bot.any():
        return out
    h, w, _ = a.shape
    ys, xs = np.where(bot)
    y0, y1 = max(0, ys.min() - 8), min(h, ys.max() + 9)
    x0, x1 = max(0, xs.min() - 8), min(w, xs.max() + 9)
    sub_a = a[y0:y1, x0:x1]
    sub_m = bot[y0:y1, x0:x1]
    indices = ndi.distance_transform_edt(sub_m, return_distances=False, return_indices=True)
    filled = sub_a[indices[0], indices[1]].astype(np.float32)
    # 只在子块内模糊，再写回 mask
    blur = np.stack([ndi.gaussian_filter(filled[..., i], 2.0) for i in range(3)], axis=-1)
    mix = filled * 0.35 + blur * 0.65
    sub_out = out[y0:y1, x0:x1]
    sub_out[sub_m] = mix[sub_m]
    out[y0:y1, x0:x1] = sub_out
    out[~bot] = a[~bot]
    return out


def fill_masked(a: np.ndarray, top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    out = fill_top_bar(a, top)
    out = fill_bottom_plaques(out, bot)
    # 契约：非 UI 像素不变
    keep = ~(top | bot)
    out[keep] = a[keep]
    return np.clip(out, 0, 255)


def build_chrome(src_rgb: np.ndarray, top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    h, w, _ = src_rgb.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    mask = top | bot
    rgba[..., :3] = src_rgb
    rgba[..., 3] = np.where(mask, 255, 0)
    # 边缘抗锯齿：距离场羽化 1px
    dist = ndi.distance_transform_edt(~mask)
    soft = mask.astype(np.float32)
    soft[dist <= 1.5] = np.clip(1.0 - dist[dist <= 1.5] / 1.5, 0, 1)
    soft[mask] = 1.0
    rgba[..., 3] = np.clip(soft * 255, 0, 255).astype(np.uint8)
    rgba[~mask & (soft < 0.02), :3] = 0
    return rgba


def process_pair(
    name: str,
    src_path: Path,
    flat_paths: list[Path],
    top_max_y: int,
    bot_roi: tuple[int, int, int, int],
) -> dict:
    src = np.asarray(Image.open(src_path).convert("RGB"))
    top = extract_top_mask(src, top_max_y)
    bot = extract_bottom_mask(src, bot_roi)
    chrome = build_chrome(src, top, bot)
    chrome_path = UI / f"ui-chrome-{name}.png"
    Image.fromarray(chrome, "RGBA").save(chrome_path, optimize=True)

    report = {
        "name": name,
        "src": str(src_path.relative_to(ROOT)),
        "chrome": str(chrome_path.relative_to(ROOT)),
        "top_px": int(top.sum()),
        "bot_px": int(bot.sum()),
        "flats": [],
    }

    # 调试图
    viz = src.copy()
    viz[top] = (255, 40, 40)
    viz[bot] = (40, 220, 40)
    Image.fromarray(viz).save(OUT / f"{name}-chrome-viz.png")
    Image.fromarray(chrome).save(OUT / f"{name}-chrome.png")

    mask = top | bot
    for flat_path in flat_paths:
        if not flat_path.exists():
            report["flats"].append({"path": str(flat_path), "missing": True})
            continue
        before = np.asarray(Image.open(flat_path).convert("RGB"))
        # 用同源 src 的 mask；若尺寸不一致则跳过
        if before.shape != src.shape:
            report["flats"].append(
                {"path": str(flat_path.relative_to(ROOT)), "error": "size_mismatch"}
            )
            continue
        after = fill_masked(before, top, bot)
        # 非 UI 区必须不变
        unchanged = ~mask
        diff = np.abs(after.astype(np.int16) - before.astype(np.int16)).sum(axis=2)
        leak = int(((diff > 0) & unchanged).sum())
        Image.fromarray(after.astype(np.uint8)).save(flat_path, optimize=True)
        # diff 图：非 UI 变化标红，UI 变化标绿
        dimg = np.zeros_like(before)
        dimg[(diff > 0) & mask] = (0, 200, 0)
        dimg[(diff > 0) & unchanged] = (220, 0, 0)
        Image.fromarray(dimg).save(OUT / f"{flat_path.stem}-ui-fill-diff.png")
        report["flats"].append(
            {
                "path": str(flat_path.relative_to(ROOT)),
                "non_ui_changed_px": leak,
                "ui_changed_px": int(((diff > 0) & mask).sum()),
            }
        )
        print(flat_path.name, "non_ui_leak", leak, "ui_fill", int(((diff > 0) & mask).sum()))
    return report


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    land_src = UI / "ui-skin-fish-land.png"
    port_src = UI / "ui-skin-fish-port.png"
    # 横屏顶栏约到 y=120；底栏木牌约在左下
    land = process_pair(
        "land",
        land_src,
        [
            UI / "ui-skin-fish-land-seaflat.png",
            UI / "ui-skin-fish-land-deepflat.png",
        ],
        top_max_y=128,
        bot_roi=(0, 1152 - 170, 720, 1152),
    )
    # 竖屏顶栏约到 y=130；底栏两块木牌
    port = process_pair(
        "port",
        port_src,
        [
            UI / "ui-skin-fish-port-seaflat.png",
            UI / "ui-skin-fish-port-deepflat.png",
        ],
        top_max_y=135,
        bot_roi=(0, 2048 - 155, 660, 2048),
    )
    report = {"land": land, "port": port}
    (OUT / "split-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("chrome written", UI / "ui-chrome-land.png", UI / "ui-chrome-port.png")
    print("report", OUT / "split-report.json")


if __name__ == "__main__":
    main()
