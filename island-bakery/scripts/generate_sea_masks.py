#!/usr/bin/env python3
"""为钓鱼区生成海面蒙版（R0009 / C2：清洗海水基色）。

输出 RGBA：
- RGB：只保留大尺度深浅的干净海水底色（无旧浪纹、无船位抹痕）
- A：海面覆盖率，0 = 沙滩/天空/山体，1 = 海

C2 基色规则：
- 按行取可靠海水像素中位数（船/礁石洞不参与）
- 行颜色做纵向低通，只留远近深浅
- 同一行内颜色恒定 → 天然去掉一切横向浪纹周期

生成 seaflat 后必须再跑 split_fishing_ui_chrome.py，否则会冲掉 C7 UI 拆层。
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
DEBUG = ROOT / "docs" / "_sea-verify" / "c2"


def sea_color(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    deep = (b > r + 35) & (b > 65) & (b > g - 30)
    green = (g > r + 30) & (g > 115) & (b > r + 10)
    foam = (r > 190) & (g > 200) & (b > 190)
    return deep | green | foam


def find_horizon(seac, r):
    h = seac.shape[0]
    frac = seac.mean(axis=1)
    rmean = r.mean(axis=1)
    for y in range(int(h * 0.12), int(h * 0.65)):
        if frac[y] > 0.5 and frac[y : y + 30].mean() > 0.45 and rmean[y] < 160:
            return y
    return int(h * 0.25)


def beach_curve(a, horizon, beige_x=None, offset=0):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h, w = r.shape
    # 取「干沙」上缘当水线：湿沙/白沫仍归入动态海，避免旧静海条残留
    sand = (r > b + 70) & (r > 180) & (r > g + 8) & (g > b + 10)
    seeds = np.zeros((h, w), bool)
    seeds[int(h * 0.92) :] = True
    lab, _ = ndi.label(sand)
    ids = np.unique(lab[seeds & sand])
    ids = ids[ids > 0]
    beach = np.isin(lab, ids)
    shore = np.full(w, h, dtype=np.float32)
    for x in range(w):
        ys = np.where(beach[horizon:, x])[0]
        if len(ys):
            shore[x] = horizon + ys[0]
    if beige_x:
        shore[beige_x:] = h
    shore = np.array([np.median(shore[max(0, x - 25) : x + 26]) for x in range(w)])
    shore = ndi.gaussian_filter1d(shore, 15) + offset
    return shore


def clean_sea_base(a: np.ndarray, valid: np.ndarray, horizon: int) -> np.ndarray:
    """C2：按行中位数 + 纵向低通，消除横向旧浪纹。"""
    h, w, _ = a.shape
    if valid.any():
        global_med = np.median(a[valid], axis=0).astype(np.float32)
    else:
        global_med = np.array([48.0, 110.0, 130.0], dtype=np.float32)

    row_cols = np.broadcast_to(global_med, (h, 3)).copy()
    for y in range(horizon, h):
        xs = np.where(valid[y])[0]
        if xs.size >= 8:
            row_cols[y] = np.median(a[y, xs], axis=0)
            continue
        found = False
        for dy in range(1, 48):
            for yy in (y - dy, y + dy):
                if yy < horizon or yy >= h:
                    continue
                xs2 = np.where(valid[yy])[0]
                if xs2.size >= 8:
                    row_cols[y] = np.median(a[yy, xs2], axis=0)
                    found = True
                    break
            if found:
                break

    # 纵向低通：保留远近深浅，压掉行间高频抖动
    # 1152 高图用 σ≈36；深海竖屏更高，按高度比例
    sigma_y = max(24.0, h / 32.0)
    row_cols = ndi.gaussian_filter1d(row_cols, sigma=sigma_y, axis=0)
    # 广播成整幅：同一行颜色恒定 → 横向周期全部消失
    return np.broadcast_to(row_cols[:, None, :], (h, w, 3)).copy()


def row_peak_count(luma_row: np.ndarray, min_prominence: float = 1.5) -> int:
    if luma_row.size < 8:
        return 0
    d = np.diff(luma_row.astype(np.float32))
    s = np.sign(d)
    s[s == 0] = 1
    turns = np.where(s[1:] * s[:-1] < 0)[0] + 1
    n = 0
    for i in turns:
        left = luma_row[max(0, i - 5) : i].mean() if i > 0 else luma_row[i]
        right = luma_row[i + 1 : min(len(luma_row), i + 6)].mean() if i + 1 < len(luma_row) else luma_row[i]
        if abs(luma_row[i] - left) >= min_prominence or abs(luma_row[i] - right) >= min_prominence:
            n += 1
    return n


def quality_report(col: np.ndarray, alpha: np.ndarray, tag: str) -> dict:
    """抽样海区行：因同行恒色，峰谷应接近 0。"""
    sea = alpha > 0.6
    luma = 0.299 * col[..., 0] + 0.587 * col[..., 1] + 0.114 * col[..., 2]
    ys = np.where(sea.mean(axis=1) > 0.25)[0]
    peaks = []
    if ys.size:
        step = max(1, len(ys) // 24)
        for y in ys[::step]:
            xs = np.where(sea[y])[0]
            if xs.size < 16:
                continue
            # 同行本应恒色；若有残留则统计
            peaks.append(row_peak_count(luma[y, xs], 1.5))
    return {
        "tag": tag,
        "max_row_peaks": int(max(peaks) if peaks else 0),
        "mean_row_peaks": float(np.mean(peaks)) if peaks else 0.0,
        "sample_rows": len(peaks),
        "pass": (max(peaks) if peaks else 0) <= 3,
    }


def build(src, dst, flat_dst, mode, beige_x=None, offset=0, sign_rect=None, erase_rects=None, tag="mask"):
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    seac = sea_color(a)
    horizon = find_horizon(seac, r)

    if mode == "shallow":
        shore = beach_curve(a, horizon, beige_x=beige_x, offset=offset)
    else:
        shore = np.full(w, h, dtype=np.float32)

    yy = np.arange(h)[:, None]
    cover = (yy >= horizon) & (yy <= shore[None, :])
    if beige_x:
        cover[int(h * 0.863) :, beige_x:] = True
    if sign_rect:
        x0, y0, x1, y1 = sign_rect
        # 木牌坐落在浅水/湿沙上：把牌区纳入海面，再只把木牌本体挖掉，
        # 避免牌后面留一块方形静海。
        cover[y0:y1, x0:x1] = True
        # 只挖掉木牌本体（木色/奶油色），水仍从牌缝和四周流过
        wood = (
            ((r > b + 25) & (r > 80) & (r >= g - 5))
            | ((r > 190) & (g > 185) & (b > 170) & (r > b + 2) & (r >= g - 5))
        ) & (~seac)
        patch = np.zeros_like(cover)
        patch[y0:y1, x0:x1] = True
        wood = ndi.binary_dilation(wood & patch, iterations=2)
        cover &= ~wood

    # 海岸线羽化：向内 40px 渐实；向沙滩外溢 16px 形成上滩水痕
    alpha = np.clip(ndi.distance_transform_edt(cover) / 40.0, 0, 1)
    dout = ndi.distance_transform_edt(~cover)
    fringe = (~cover) & (dout <= 16)
    alpha[fringe] = 0.42 * (1 - dout[fringe] / 16.0)

    # 只取「蓝/绿海水」做基色样本。白沫和船体高光不算。
    valid = (
        ((b > r + 35) & (b > 65) & (b > g - 30))
        | ((g > r + 30) & (g > 115) & (b > r + 10))
    ) & (yy >= horizon)
    if beige_x:
        valid[:, beige_x:] = False
    if sign_rect:
        x0, y0, x1, y1 = sign_rect
        valid[y0:y1, x0:x1] = False
    if erase_rects:
        for x0, y0, x1, y1 in erase_rects:
            valid[y0:y1, x0:x1] = False
    valid = ndi.binary_opening(valid, structure=np.ones((3, 3)))

    # C2：中位数行色 + 纵向低通（不再 interp 保留浪纹）
    col = clean_sea_base(a, valid, horizon)

    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)])
    out_img = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    out_img = out_img.resize((w // 2, h // 2), Image.LANCZOS)
    out_img.save(dst, optimize=True)

    # 去海底板：海区替换成干净基色；天空/山/沙滩保持原像素
    # 注：源图里的顶栏/底栏 UI 仍在，必须随后跑 split_fishing_ui_chrome.py
    flat = a.copy()
    flat[cover] = col[cover]
    Image.fromarray(np.clip(flat, 0, 255).astype(np.uint8), "RGB").save(flat_dst, optimize=True)

    # 调试图
    DEBUG.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(DEBUG / f"{tag}-mask-rgb.png")
    Image.fromarray(np.clip(alpha * 255, 0, 255).astype(np.uint8)).save(DEBUG / f"{tag}-mask-alpha.png")
    # seaflat-diff：相对源图，非海域应变黑；海域允许变
    diff = np.abs(flat.astype(np.int16) - a.astype(np.int16)).sum(axis=2)
    diff_img = np.zeros_like(a, dtype=np.uint8)
    leak = (diff > 0) & (~cover)
    sea_chg = (diff > 0) & cover
    diff_img[sea_chg] = (0, 180, 0)
    diff_img[leak] = (220, 0, 0)
    Image.fromarray(diff_img).save(DEBUG / f"{tag}-seaflat-diff.png")

    q = quality_report(col, alpha, tag)
    q["non_sea_changed_px"] = int(leak.sum())
    q["dst"] = str(Path(dst).relative_to(ROOT))
    q["flat"] = str(Path(flat_dst).relative_to(ROOT))
    print(
        dst,
        out_img.size,
        "coverage",
        round(float(alpha.mean()), 3),
        "peaks",
        q["max_row_peaks"],
        "non_sea_leak",
        q["non_sea_changed_px"],
        "->",
        flat_dst,
    )
    return q


def build_meta(src, dst, mode, beige_x=None, offset=0, sign_rect=None, tag="meta"):
    """C4：只写 sea-meta，不改 mask/seaflat（避免冲掉 C7 chrome）。

    R = 到沙滩水线距离（近岸高，向外衰减）
    G = 水深（岸=0，远海=1）
    B = 碎沫噪声种子
    A = 1
    """
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    seac = sea_color(a)
    horizon = find_horizon(seac, r)
    if mode == "shallow":
        shore = beach_curve(a, horizon, beige_x=beige_x, offset=offset)
    else:
        shore = np.full(w, h, dtype=np.float32)

    yy = np.arange(h)[:, None]
    cover = (yy >= horizon) & (yy <= shore[None, :])
    if beige_x:
        cover[int(h * 0.863) :, beige_x:] = True
    if sign_rect:
        x0, y0, x1, y1 = sign_rect
        cover[y0:y1, x0:x1] = True

    # 到沙滩水线的向上距离（仅海内）；近岸高（加宽带，C4 白沫更易看见）
    dist_to_shore = np.clip(shore[None, :] - yy, 0, None).astype(np.float32)
    band = 150.0
    prox = np.clip(1.0 - dist_to_shore / band, 0, 1)
    prox = np.where(cover, prox, 0.0)
    if mode != "shallow":
        prox[:] = 0.0  # 深海关闭 swash

    sea_h = np.maximum(1.0, shore - horizon)
    depth = np.clip((yy - horizon) / sea_h[None, :], 0, 1)
    depth = np.where(cover, depth, 0.0)

    # 低阶噪声种子：按位置固定，供片元碎点用
    seed = (np.sin(xx_like(w) * 12.9898 + yy * 78.233) * 43758.5453) % 1.0
    seed = np.where(cover, seed, 0.0)

    rgba = np.dstack(
        [
            np.clip(prox * 255, 0, 255),
            np.clip(depth * 255, 0, 255),
            np.clip(seed * 255, 0, 255),
            np.full((h, w), 255, dtype=np.float32),
        ]
    )
    out = Image.fromarray(rgba.astype(np.uint8), "RGBA").resize((w // 2, h // 2), Image.LANCZOS)
    out.save(dst, optimize=True)
    print(dst, out.size, "prox_mean", round(float(prox.mean()), 3), "mode", mode, "tag", tag)
    return {"tag": tag, "dst": str(Path(dst).relative_to(ROOT)), "prox_mean": float(prox.mean())}


def xx_like(w: int) -> np.ndarray:
    return np.arange(w, dtype=np.float32)[None, :]


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--meta-only", action="store_true", help="C4: only write sea-meta-*.png")
    args = parser.parse_args()

    # 横屏浅滩用一体皮做源图：岸线自然、无右下米色占位块；
    # 烤进图里的船/礁石会被实时海面整片盖掉，再单独画船精灵。
    land = UI / "ui-skin-fish-land.png"
    port = UI / "ui-skin-fish-port-seabase.png"
    land_deep = UI / "ui-skin-fish-land-deepbase.png"
    port_deep = UI / "ui-skin-fish-port-deepbase.png"

    if args.meta_only:
        metas = []
        metas.append(build_meta(land, UI / "sea-meta-land.png", "shallow", offset=10, tag="land-shallow"))
        metas.append(build_meta(port, UI / "sea-meta-port.png", "shallow", offset=0, tag="port-shallow"))
        metas.append(
            build_meta(
                land_deep,
                UI / "sea-meta-deep-land.png",
                "deep",
                sign_rect=(0, 960, 760, 1152),
                tag="land-deep",
            )
        )
        metas.append(
            build_meta(
                port_deep,
                UI / "sea-meta-deep-port.png",
                "deep",
                sign_rect=(0, 1860, 700, 2048),
                tag="port-deep",
            )
        )
        DEBUG.mkdir(parents=True, exist_ok=True)
        (DEBUG / "meta-report.json").write_text(json.dumps({"metas": metas}, ensure_ascii=False, indent=2), encoding="utf-8")
        print("[C4] meta-only done", DEBUG / "meta-report.json")
        return

    reports = []
    reports.append(
        build(
            land,
            UI / "sea-mask-land.png",
            UI / "ui-skin-fish-land-seaflat.png",
            "shallow",
            offset=10,
            erase_rects=[(20, 320, 880, 590), (900, 480, 2020, 1010)],
            tag="land-shallow",
        )
    )
    reports.append(
        build(
            port,
            UI / "sea-mask-port.png",
            UI / "ui-skin-fish-port-seaflat.png",
            "shallow",
            offset=0,
            tag="port-shallow",
        )
    )
    reports.append(
        build(
            land_deep,
            UI / "sea-mask-deep-land.png",
            UI / "ui-skin-fish-land-deepflat.png",
            "deep",
            sign_rect=(0, 960, 760, 1152),
            tag="land-deep",
        )
    )
    reports.append(
        build(
            port_deep,
            UI / "sea-mask-deep-port.png",
            UI / "ui-skin-fish-port-deepflat.png",
            "deep",
            sign_rect=(0, 1860, 700, 2048),
            tag="port-deep",
        )
    )

    summary = {
        "pass": all(r["pass"] and r["non_sea_changed_px"] == 0 for r in reports),
        "reports": reports,
        "note": "After this script, MUST run scripts/split_fishing_ui_chrome.py",
    }
    DEBUG.mkdir(parents=True, exist_ok=True)
    (DEBUG / "generate-report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[C2] generate pass=", summary["pass"], "report=", DEBUG / "generate-report.json")
    print("[C2] NEXT: python3 scripts/split_fishing_ui_chrome.py")


if __name__ == "__main__":
    main()
