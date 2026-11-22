#!/usr/bin/env python3
"""C0：钓鱼区海面验收基线骨架。

本脚本两档能力：
1) assets：静态资源门禁（chrome/seaflat/mask 存在性、UI 补底泄漏、尺寸契约）
2) capture：浏览器截图（可选；缺依赖或起不来服务时标未实测，不伪造图）

固定契约：
- 横屏 1280×720 / 竖屏 720×1280
- 4 组：land-shallow / port-shallow / land-deep / port-deep
- 时间点 t0 / t0+800ms / t0+1600ms → 共 12 帧
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "package" / "res" / "Image" / "ui"
VERIFY = ROOT / "docs" / "_sea-verify"

GROUPS = [
    {"id": "land-shallow", "orient": "land", "spot": "shallow", "w": 1280, "h": 720},
    {"id": "port-shallow", "orient": "port", "spot": "shallow", "w": 720, "h": 1280},
    {"id": "land-deep", "orient": "land", "spot": "deep", "w": 1280, "h": 720},
    {"id": "port-deep", "orient": "port", "spot": "deep", "w": 720, "h": 1280},
]
TIMES = [("t0", 0), ("t0p800", 800), ("t0p1600", 1600)]


def _rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))


def _rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"))


def _row_peak_count(row: np.ndarray, min_prominence: float = 1.5) -> int:
    if row.size < 8:
        return 0
    d = np.diff(row.astype(np.float32))
    s = np.sign(d)
    s[s == 0] = 1
    turns = np.where(s[1:] * s[:-1] < 0)[0] + 1
    n = 0
    for i in turns:
        left = row[max(0, i - 5) : i].mean() if i > 0 else row[i]
        right = row[i + 1 : min(len(row), i + 6)].mean() if i + 1 < len(row) else row[i]
        if abs(row[i] - left) >= min_prominence or abs(row[i] - right) >= min_prominence:
            n += 1
    return n


def check_c2_mask_quality() -> dict:
    """C2：蒙版 RGB 抽样行峰谷 ≤3；优先读 generate-report.json。"""
    gen = VERIFY / "c2" / "generate-report.json"
    if gen.exists():
        data = json.loads(gen.read_text(encoding="utf-8"))
        return {
            "source": "generate-report.json",
            "pass": bool(data.get("pass")),
            "reports": data.get("reports"),
        }
    masks = [
        "sea-mask-land.png",
        "sea-mask-port.png",
        "sea-mask-deep-land.png",
        "sea-mask-deep-port.png",
    ]
    reports = []
    for name in masks:
        p = UI / name
        if not p.exists():
            reports.append({"tag": name, "pass": False, "error": "missing"})
            continue
        a = _rgba(p).astype(np.float32)
        rgb, alpha = a[..., :3], a[..., 3]
        sea = alpha > 200
        luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        ys = np.where(sea.mean(axis=1) > 0.25)[0]
        peaks = []
        if ys.size:
            step = max(1, len(ys) // 24)
            for y in ys[::step]:
                xs = np.where(sea[y])[0]
                if xs.size < 16:
                    continue
                peaks.append(_row_peak_count(luma[y, xs]))
        mx = int(max(peaks) if peaks else 0)
        reports.append({"tag": name, "max_row_peaks": mx, "pass": mx <= 3})
    return {"source": "live-scan", "pass": all(r.get("pass") for r in reports), "reports": reports}


def check_assets() -> dict:
    required = [
        "ui-chrome-land.png",
        "ui-chrome-port.png",
        "ui-skin-fish-land-seaflat.png",
        "ui-skin-fish-port-seaflat.png",
        "ui-skin-fish-land-deepflat.png",
        "ui-skin-fish-port-deepflat.png",
        "sea-mask-land.png",
        "sea-mask-port.png",
        "sea-mask-deep-land.png",
        "sea-mask-deep-port.png",
    ]
    missing = [n for n in required if not (UI / n).exists()]
    sizes = {}
    for n in required:
        p = UI / n
        if p.exists():
            im = Image.open(p)
            sizes[n] = {"w": im.size[0], "h": im.size[1], "mode": im.mode}

    chrome_checks = {}
    for orient, expect in (("land", (2048, 1152)), ("port", (1152, 2048))):
        chrome = UI / f"ui-chrome-{orient}.png"
        flat = UI / f"ui-skin-fish-{orient}-seaflat.png"
        if not chrome.exists() or not flat.exists():
            continue
        c = _rgba(chrome)
        f = _rgb(flat)
        alpha = c[..., 3] > 10
        chrome_checks[orient] = {
            "size_ok": c.shape[:2][::-1] == expect and f.shape[:2][::-1] == expect,
            "chrome_opaque_px": int(alpha.sum()),
            "chrome_alpha_mean": float(c[..., 3].mean() / 255.0),
            # 顶 64 / 底 72 设计带：chrome 应有覆盖
            "top64_cover": float(alpha[:64].mean()) if orient == "land" else float(alpha[: int(c.shape[0] * 64 / 2048)].mean()),
            "bot72_cover": float(alpha[-72:].mean()) if orient == "land" else float(alpha[-int(c.shape[0] * 72 / 2048):].mean()),
        }

    split_report = VERIFY / "chrome" / "split-report.json"
    split = json.loads(split_report.read_text(encoding="utf-8")) if split_report.exists() else None
    non_ui_leaks = []
    if split:
        for side in ("land", "port"):
            for flat in split.get(side, {}).get("flats", []):
                leak = flat.get("non_ui_changed_px")
                if leak is None:
                    continue
                non_ui_leaks.append({"path": flat.get("path"), "non_ui_changed_px": leak})

    c2 = check_c2_mask_quality()
    return {
        "missing": missing,
        "sizes": sizes,
        "chrome_checks": chrome_checks,
        "non_ui_leaks": non_ui_leaks,
        "c2_mask_quality": c2,
        "pass": (
            len(missing) == 0
            and all(x.get("non_ui_changed_px", 0) == 0 for x in non_ui_leaks)
            and bool(c2.get("pass"))
        ),
    }


def horizontal_gradient_peak(rgb: np.ndarray) -> float:
    """粗略横线指标：逐行水平梯度均值的峰值。"""
    g = np.abs(np.diff(rgb.astype(np.float32), axis=1)).mean(axis=2)
    row = g.mean(axis=1)
    return float(row.max()) if row.size else 0.0


def ui_band_diff(a: np.ndarray, b: np.ndarray, top_px: int = 64, bot_px: int = 72) -> dict:
    top = np.abs(a[:top_px].astype(np.int16) - b[:top_px].astype(np.int16)).sum(axis=2)
    bot = np.abs(a[-bot_px:].astype(np.int16) - b[-bot_px:].astype(np.int16)).sum(axis=2)
    return {
        "top_changed_px": int((top > 0).sum()),
        "bot_changed_px": int((bot > 0).sum()),
        "top_mean": float(top.mean()) if top.size else 0.0,
        "bot_mean": float(bot.mean()) if bot.size else 0.0,
    }


def try_capture(out_dir: Path, base_url: str) -> dict:
    """可选浏览器截图。失败时返回 unmeasured，不写假图。"""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as e:
        return {
            "status": "unmeasured",
            "reason": f"playwright unavailable: {e}",
            "frames": [],
        }

    frames = []
    errors = []
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            for g in GROUPS:
                for tname, tms in TIMES:
                    page = browser.new_page(viewport={"width": g["w"], "height": g["h"]})
                    q = (
                        f"{base_url}?seaDebug=1&seaT={tms/1000.0}"
                        f"&spot={g['spot']}&orient={g['orient']}"
                    )
                    try:
                        page.goto(q, wait_until="networkidle", timeout=20000)
                        page.wait_for_timeout(400)
                        path = out_dir / f"{g['id']}__{tname}.png"
                        page.screenshot(path=str(path), full_page=False)
                        frames.append({"group": g["id"], "time": tname, "path": str(path.relative_to(ROOT))})
                    except Exception as ex:
                        errors.append({"group": g["id"], "time": tname, "error": str(ex)})
                    finally:
                        page.close()
            browser.close()
    except Exception as e:
        return {"status": "unmeasured", "reason": str(e), "frames": frames, "errors": errors}

    if not frames:
        return {"status": "unmeasured", "reason": "no frames captured", "errors": errors, "frames": []}
    return {
        "status": "ok" if not errors else "partial",
        "frames": frames,
        "errors": errors,
        "expected_frames": len(GROUPS) * len(TIMES),
    }


def analyze_frames(frames: list) -> dict:
    if not frames:
        return {
            "ui_cross_frame_diff": None,
            "sea_cross_frame_diff": None,
            "horizontal_gradient_peak": None,
            "fish_out_of_sea": None,
            "note": "no frames",
        }
    by_group = {}
    for f in frames:
        by_group.setdefault(f["group"], []).append(f)
    ui_diffs = []
    peaks = []
    for gid, items in by_group.items():
        items = sorted(items, key=lambda x: x["time"])
        imgs = [_rgb(ROOT / it["path"]) for it in items]
        if len(imgs) >= 2:
            ui_diffs.append(ui_band_diff(imgs[0], imgs[1]))
            ui_diffs.append(ui_band_diff(imgs[0], imgs[-1]))
        for im in imgs:
            peaks.append(horizontal_gradient_peak(im))
    return {
        "ui_cross_frame_diff": ui_diffs,
        "sea_cross_frame_diff": "placeholder_until_mask_sampling_c1",
        "horizontal_gradient_peak": {
            "max": max(peaks) if peaks else None,
            "mean": float(np.mean(peaks)) if peaks else None,
            "samples": len(peaks),
        },
        "fish_out_of_sea": "placeholder_until_runtime_probe",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["assets", "capture", "all"], default="assets")
    ap.add_argument("--tag", default="batch1", help="输出子目录名，如 baseline / batch1")
    ap.add_argument("--base-url", default="http://127.0.0.1:8765/package/index.html")
    args = ap.parse_args()

    stamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    out = VERIFY / args.tag
    out.mkdir(parents=True, exist_ok=True)

    report = {
        "tag": args.tag,
        "stamp": stamp,
        "groups": GROUPS,
        "times_ms": [t[1] for t in TIMES],
        "assets": None,
        "capture": None,
        "assertions": None,
    }

    if args.mode in ("assets", "all"):
        report["assets"] = check_assets()
        print("[verify] assets pass=", report["assets"]["pass"], "missing=", report["assets"]["missing"])

    if args.mode in ("capture", "all"):
        cap_dir = out / "frames"
        report["capture"] = try_capture(cap_dir, args.base_url)
        report["assertions"] = analyze_frames(report["capture"].get("frames") or [])
        print("[verify] capture status=", report["capture"]["status"])
    else:
        report["capture"] = {
            "status": "unmeasured",
            "reason": "mode=assets only; browser frames not requested",
            "frames": [],
        }
        report["assertions"] = {
            "ui_cross_frame_diff": None,
            "sea_cross_frame_diff": None,
            "horizontal_gradient_peak": None,
            "fish_out_of_sea": None,
            "note": "browser unmeasured this run",
        }

    path = out / "report.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[verify] wrote", path)


if __name__ == "__main__":
    main()
