#!/usr/bin/env python3
"""把「荣誉盛典」横版主视觉改造成中间留 9:16 竖屏视频位的模板。

做法：文案元素从用户原图里像素级抠出（不重绘、不换字体），
背景用 AI 清字后的干净底板，再把文案重排到左右两侧。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

W, H = 1920, 1080
SLOT_H = 900
SLOT_W = round(SLOT_H * 9 / 16)          # 506
SLOT_X = (W - SLOT_W) // 2
SLOT_Y = (H - SLOT_H) // 2
GOLD = (206, 168, 104)

ORIG = Path("/tmp/ymb/orig.jpg")
PLATE = Path("/tmp/ymb/clean1.png")

# 原图(1262x715)上各文案元素的位置
ELEMENTS = {
    "logo": (40, 45, 292, 106),
    "line1": (608, 96, 972, 158),     # 驭浪向新 美在当夏
    "title": (434, 168, 1118, 404),   # 荣誉盛典
    "sub": (516, 410, 1074, 462),     # 2026医美和美容业务部夏季战役
}


def cut(im: Image.Image, box, warm: bool) -> Image.Image:
    """按「亮度 + 暖色偏移」抠出文字，丢掉蓝色背景，保留笔触边缘的柔光。"""
    crop = im.crop(box).convert("RGB")
    r, g, b = crop.split()
    warm_excess = ImageChops.subtract(
        ImageChops.add(r.point(lambda v: v // 2), g.point(lambda v: v // 2)), b
    )
    bright = crop.convert("L")
    if warm:
        alpha = ImageChops.multiply(
            warm_excess.point(lambda v: min(255, int(v * 5.5))),
            bright.point(lambda v: min(255, int(max(0, v - 70) * 2.4))),
        )
    else:
        # 白色字：暖度接近 0，只能靠高亮度切；阈值取自该区域实测分布
        alpha = bright.point(lambda v: 0 if v < 150 else min(255, int((v - 150) * 2.6)))
    alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = crop.convert("RGBA")
    out.putalpha(alpha)
    return out


def fit(im: Image.Image, width: int) -> Image.Image:
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


def glow(layer: Image.Image, spread: int = 14, strength: float = 0.55) -> Image.Image:
    """给文字垫一层自身的模糊光晕，压暗背景后仍然通透。"""
    g = layer.filter(ImageFilter.GaussianBlur(spread))
    a = g.getchannel("A").point(lambda v: int(v * strength))
    g.putalpha(a)
    return Image.alpha_composite(g, layer)


def make_background() -> Image.Image:
    bg = Image.open(PLATE).convert("RGB").resize((W, H), Image.LANCZOS)
    bg = ImageEnhance.Brightness(bg).enhance(0.66)
    bg = ImageEnhance.Color(bg).enhance(0.62)
    bg = bg.filter(ImageFilter.GaussianBlur(0.8))
    # 中间区域再压一层暗，让视频画面跳出来
    shade = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(shade)
    d.rectangle([SLOT_X - 150, 0, SLOT_X + SLOT_W + 150, H], fill=110)
    shade = shade.filter(ImageFilter.GaussianBlur(90))
    bg = Image.composite(Image.new("RGB", (W, H), (5, 10, 26)), bg, shade)
    return bg.convert("RGBA")


def draw_slot(canvas: Image.Image) -> Image.Image:
    box = (SLOT_X, SLOT_Y, SLOT_X + SLOT_W, SLOT_Y + SLOT_H)
    canvas.paste(Image.new("RGBA", (SLOT_W, SLOT_H), (7, 13, 30, 255)), (SLOT_X, SLOT_Y))
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for i, a in enumerate((30, 20, 12, 6)):
        pad = 7 + i * 10
        hd.rectangle([box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad],
                     outline=GOLD + (a,), width=3)
    canvas = Image.alpha_composite(canvas, halo.filter(ImageFilter.GaussianBlur(7)))
    d = ImageDraw.Draw(canvas)
    d.rectangle(box, outline=GOLD + (225,), width=3)
    arm = 56
    for cx, cy, dx, dy in ((box[0], box[1], 1, 1), (box[2], box[1], -1, 1),
                           (box[0], box[3], 1, -1), (box[2], box[3], -1, -1)):
        d.line([(cx, cy), (cx + dx * arm, cy)], fill=GOLD + (255,), width=7)
        d.line([(cx, cy), (cx, cy + dy * arm)], fill=GOLD + (255,), width=7)
    return canvas


def main(out_dir: Path) -> None:
    src = Image.open(ORIG).convert("RGB")
    logo = src.crop(ELEMENTS["logo"])                       # 徽标整块直接搬，不做抠图
    line1 = cut(src, ELEMENTS["line1"], warm=False)
    title = cut(src, ELEMENTS["title"], warm=True)
    sub = cut(src, ELEMENTS["sub"], warm=False)

    canvas = make_background()
    canvas = draw_slot(canvas)

    right_cx = SLOT_X + SLOT_W + (W - SLOT_X - SLOT_W) // 2
    title_r = glow(fit(title, 560), 16, 0.6)
    line1_r = glow(fit(line1, 340), 10, 0.5)
    sub_r = glow(fit(sub, 470), 8, 0.45)

    block_h = line1_r.height + 18 + title_r.height + 14 + sub_r.height
    y = (H - block_h) // 2
    for layer in (line1_r, title_r, sub_r):
        canvas.alpha_composite(layer, (right_cx - layer.width // 2, y))
        y += layer.height + (18 if layer is line1_r else 14)

    logo_w = 300
    logo_img = logo.resize((logo_w, round(logo.height * logo_w / logo.width)), Image.LANCZOS)
    canvas.alpha_composite(logo_img.convert("RGBA"), (72, 64))

    out_dir.mkdir(parents=True, exist_ok=True)
    flat = canvas.convert("RGB")
    flat.save(out_dir / "荣誉盛典_视频模板.png")

    hollow = canvas.copy()
    px = hollow.load()
    for yy in range(SLOT_Y + 2, SLOT_Y + SLOT_H - 2):
        for xx in range(SLOT_X + 2, SLOT_X + SLOT_W - 2):
            r, g, b, _ = px[xx, yy]
            px[xx, yy] = (r, g, b, 0)
    hollow.save(out_dir / "荣誉盛典_视频模板_透明槽.png")
    print(f"slot x={SLOT_X} y={SLOT_Y} w={SLOT_W} h={SLOT_H}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
