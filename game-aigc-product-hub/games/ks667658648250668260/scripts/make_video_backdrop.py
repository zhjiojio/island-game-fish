#!/usr/bin/env python3
"""把 AI 生成的横版底图加工成「中间留 9:16 竖屏视频位」的可复用模板。

产出三件套：
  <name>.png            成品底板（槽位画成深色面板 + 金边，可直接当背景图）
  <name>_透明槽.png      槽位区域为全透明，方便把视频层垫在下面
  <name>_参考线.png      标注槽位坐标，供剪辑软件对位
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

W, H = 1920, 1080
SLOT_H = 936                      # 槽位高度，上下各留 72px
SLOT_W = round(SLOT_H * 9 / 16)   # 527
SLOT_X = (W - SLOT_W) // 2
SLOT_Y = (H - SLOT_H) // 2
GOLD = (198, 158, 96)


def tone_down(im: Image.Image) -> Image.Image:
    """压弱背景：降亮、降饱和、轻微柔化，避免喧宾夺主。"""
    im = ImageEnhance.Brightness(im).enhance(0.62)
    im = ImageEnhance.Color(im).enhance(0.58)
    im = ImageEnhance.Contrast(im).enhance(0.92)
    return im.filter(ImageFilter.GaussianBlur(0.6))


def vignette(im: Image.Image) -> Image.Image:
    """四边压暗，把视线收拢到中间槽位。"""
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    steps = 90
    for i in range(steps):
        t = i / steps
        d.rectangle(
            [int(W * 0.5 * t * 0.62), int(H * 0.5 * t * 0.62),
             W - int(W * 0.5 * t * 0.62), H - int(H * 0.5 * t * 0.62)],
            outline=int(255 * (1 - t)),
        )
    dark = Image.new("RGB", (W, H), (4, 9, 24))
    return Image.composite(im, dark, mask.filter(ImageFilter.GaussianBlur(120)))


def draw_slot(im: Image.Image, filled: bool) -> Image.Image:
    """在正中绘制 9:16 槽位。filled=True 画深色面板，False 只画边框。"""
    box = (SLOT_X, SLOT_Y, SLOT_X + SLOT_W, SLOT_Y + SLOT_H)
    if filled:
        panel = Image.new("RGB", (SLOT_W, SLOT_H), (8, 14, 32))
        im.paste(panel, (SLOT_X, SLOT_Y))
    # 槽位外侧一圈柔光，让视频与背景有过渡而不是硬切
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i, a in enumerate((26, 18, 11, 6)):
        pad = 6 + i * 9
        gd.rectangle(
            [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad],
            outline=GOLD + (a,), width=3,
        )
    im = Image.alpha_composite(im.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(im)
    d.rectangle(box, outline=GOLD + (215,), width=3)
    # 四角加长描边，做出「取景框」的仪式感
    arm = 54
    for cx, cy, dx, dy in (
        (box[0], box[1], 1, 1), (box[2], box[1], -1, 1),
        (box[0], box[3], 1, -1), (box[2], box[3], -1, -1),
    ):
        d.line([(cx, cy), (cx + dx * arm, cy)], fill=GOLD + (255,), width=7)
        d.line([(cx, cy), (cx, cy + dy * arm)], fill=GOLD + (255,), width=7)
    return im


def build(src: Path, out_dir: Path, name: str) -> None:
    base = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    base = vignette(tone_down(base))

    filled = draw_slot(base.copy(), filled=True)
    filled.convert("RGB").save(out_dir / f"{name}.png")

    hollow = draw_slot(base.copy(), filled=False)
    hollow.putalpha(Image.new("L", (W, H), 255))
    px = hollow.load()
    for y in range(SLOT_Y + 2, SLOT_Y + SLOT_H - 2):
        for x in range(SLOT_X + 2, SLOT_X + SLOT_W - 2):
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
    hollow.save(out_dir / f"{name}_透明槽.png")

    guide = filled.convert("RGB").copy()
    gd = ImageDraw.Draw(guide)
    gd.text((SLOT_X, SLOT_Y - 30), f"VIDEO 9:16  x={SLOT_X} y={SLOT_Y} w={SLOT_W} h={SLOT_H}", fill=GOLD)
    guide.save(out_dir / f"{name}_参考线.png")


if __name__ == "__main__":
    src, out_dir, name = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    out_dir.mkdir(parents=True, exist_ok=True)
    build(src, out_dir, name)
    print(f"{name}: slot x={SLOT_X} y={SLOT_Y} w={SLOT_W} h={SLOT_H}")
