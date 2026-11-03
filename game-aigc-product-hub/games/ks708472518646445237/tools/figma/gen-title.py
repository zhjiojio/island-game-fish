# -*- coding: utf-8 -*-
"""按 Figma 497:24465 生成标题切图。
设计：今晚谁来当店长？ / 36px / FZCuHuoYi-M25S / box 288x42
     linear-gradient(99.97deg, #fff 1.49%, #f0a7ff 98.13%)
系统无方正粗活意，改用 ZCOOL KuaiLe（圆润粗黑）切图，避免真机字体回落。
输出 3 倍图，按设计 box 尺寸整体绘制，JS 侧无需再做文字度量。
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/tmp/ZCOOLKuaiLe-Regular.ttf'
TEXT = '今晚谁来当店长？'
BOX_W, BOX_H = 288, 42          # 设计 box
SCALE = 3                        # 3x 供高 DPR 屏
OUT = sys.argv[1]

W, H = BOX_W * SCALE, BOX_H * SCALE

# 以设计字号为基准起算，再等比收紧到 box 宽度内
size = 36 * SCALE
font = ImageFont.truetype(FONT, size)
l, t, r, b = font.getbbox(TEXT)
if r - l > W:
    size = int(size * W / (r - l))
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(TEXT)

tw, th = r - l, b - t
ox = (W - tw) / 2 - l            # 水平居中
oy = (H - th) / 2 - t            # 垂直居中

# ① 文字蒙版
#    ZCOOL KuaiLe 比方正粗活意细，用描边把字重补到接近 M25S 的粗度
STROKE = max(1, int(size * 0.055))
mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).text((ox, oy), TEXT, font=font, fill=255,
                          stroke_width=STROKE, stroke_fill=255)

# ② 渐变层：99.97deg ≈ 近水平，左白 → 右粉
grad = Image.new('RGBA', (W, H))
px = grad.load()
c0, c1 = (255, 255, 255), (240, 167, 255)
for x in range(W):
    u = x / max(1, W - 1)
    u = min(1.0, max(0.0, (u - 0.0149) / (0.9813 - 0.0149)))   # 1.49% → 98.13%
    col = tuple(int(c0[i] + (c1[i] - c0[i]) * u) for i in range(3))
    for y in range(H):
        px[x, y] = col + (255,)

# ③ 渐变按文字蒙版裁形
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.paste(grad, (0, 0), mask)
out.save(OUT)
print('saved', OUT, out.size, 'fontsize', size // SCALE, 'px@1x')
