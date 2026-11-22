#!/usr/bin/env python3
"""R0020b：横屏动态海域 GIF 合成静坐兔 + 全分辨率 4×atlas 导出。

- 源备份：docs/_sea-verify/gif-rabbit/横屏钓鱼区动态海域底图_pre-rabbit.gif
- 兔：hero_rabbit_fish；舱内坐垫 + 近舷条带遮脚
- 出：覆盖 assets/.../横屏钓鱼区动态海域底图.gif
      + fish_sea_gif_land_atlas{0..3}.png（每张 2×2×960×540）
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
BAK = ROOT / "docs/_sea-verify/gif-rabbit/横屏钓鱼区动态海域底图_pre-rabbit.gif"
SRC_GIF = ROOT.parent / "assets/界面/全屏皮肤/横屏钓鱼区动态海域底图.gif"
RABBIT = ROOT / "package/res/Image/sprites/hero_rabbit_fish.png"
VERIFY = ROOT / "docs/_sea-verify/gif-rabbit"
ANIM = ROOT / "package/res/Image/sprites/anim"
META = VERIFY / "land_sea_gif_meta.json"

FOOT_X, FOOT_Y, TARGET_H = 218, 248, 80
FOOT_U = 0.3813
N_EXPORT = 16
ATLAS_COLS, ATLAS_ROWS = 2, 2
CELL_W, CELL_H = 960, 540
N_ATLAS = 4
BOAT_RIGHT_X = 420


def gunwale_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    wood = (r > 65) & (r > g - 8) & (r > b + 8) & (b < 155) & (g < 185) & (sat > 12) & (r < 235)
    m = wood.copy()
    m[:190, :] = False
    m[370:, :] = False
    m[:, 400:] = False
    m[:, :25] = False
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, index=np.arange(1, n + 1))
        m = lab == (int(np.argmax(sizes)) + 1)
    rim = np.zeros_like(m)
    for x in range(m.shape[1]):
        col = np.where(m[:, x])[0]
        if col.size < 3:
            continue
        yb = int(col.max())
        y0 = max(0, yb - 16)
        rim[y0 : yb + 1, x] = m[y0 : yb + 1, x]
    return ndi.binary_closing(rim, iterations=1)


def main() -> None:
    VERIFY.mkdir(parents=True, exist_ok=True)
    rab = Image.open(RABBIT).convert("RGBA")
    a = np.asarray(rab)
    ys, xs = np.where(a[..., 3] > 20)
    crop = rab.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    sc = TARGET_H / crop.size[1]
    rw = max(1, int(round(crop.size[0] * sc)))
    rh = max(1, int(round(crop.size[1] * sc)))
    rabbit_scaled = crop.resize((rw, rh), Image.Resampling.LANCZOS)
    left = int(round(FOOT_X - FOOT_U * rw))
    top = int(round(FOOT_Y - rh))

    gif = Image.open(BAK)
    n_frames = gif.n_frames
    duration = gif.info.get("duration", 70)
    composed = []
    rim0 = None
    for i in range(n_frames):
        gif.seek(i)
        fr = np.asarray(gif.convert("RGB"))
        if rim0 is None:
            rim0 = gunwale_mask(fr)
        canvas = Image.fromarray(fr).convert("RGBA")
        canvas.alpha_composite(rabbit_scaled, (left, top))
        out = np.asarray(canvas.convert("RGB")).copy()
        out[rim0] = fr[rim0]
        composed.append(Image.fromarray(out))

    composed[0].save(VERIFY / "composed_frame0.png")
    composed[0].crop((40, 150, 430, 370)).save(VERIFY / "composed_zoom.png")
    composed[0].save(VERIFY / "composed_sharp_preview.png")

    pal0 = composed[0].quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    frames_p = [pal0] + [im.quantize(palette=pal0, dither=Image.Dither.FLOYDSTEINBERG) for im in composed[1:]]
    frames_p[0].save(
        SRC_GIF,
        save_all=True,
        append_images=frames_p[1:],
        duration=duration,
        loop=0,
        optimize=False,
    )

    idxs = [int(round(i * (n_frames - 1) / (N_EXPORT - 1))) for i in range(N_EXPORT)]
    atlas_paths = []
    for ai in range(N_ATLAS):
        sheet = Image.new("RGB", (ATLAS_COLS * CELL_W, ATLAS_ROWS * CELL_H))
        for local in range(4):
            fi = ai * 4 + local
            c, r = local % 2, local // 2
            sheet.paste(composed[idxs[fi]], (c * CELL_W, r * CELL_H))
        path = ANIM / f"fish_sea_gif_land_atlas{ai}.png"
        sheet.save(path, optimize=True)
        atlas_paths.append(str(path.relative_to(ROOT)))

    meta = {
        "foot": {"x": FOOT_X, "y": FOOT_Y, "h": TARGET_H, "footU": FOOT_U},
        "paste": {"left": left, "top": top, "w": rw, "h": rh},
        "export_frames": N_EXPORT,
        "export_idxs": idxs,
        "atlas_count": N_ATLAS,
        "cell": [CELL_W, CELL_H],
        "duration_ms": duration,
        "period_ms": duration * N_EXPORT,
        "atlases": atlas_paths,
        "boat_right_x": BOAT_RIGHT_X,
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("ok seat", FOOT_X, FOOT_Y, TARGET_H, "atlases", N_ATLAS)


if __name__ == "__main__":
    main()
