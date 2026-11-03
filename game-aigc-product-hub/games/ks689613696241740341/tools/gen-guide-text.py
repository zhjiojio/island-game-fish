# -*- coding: utf-8 -*-
"""新手引导文案 → 艺术字贴图（透明底 PNG）。

【为什么不用 AI 出图】用户要「艺术字 + 提前生成好 + 贴图方案」。这类需求有两条路：
  ① AI 出图（gpt-image-2）—— 中文字形是它的死穴：缺笔画、错字、字距失控，
     而且没有透明背景参数，得在纯色键上生成再抠，边缘必然带残色。
     引导文案是玩家第一眼看到的东西，出一个错字就是灾难。
  ② PIL 本地矢量绘制 —— 字形来自系统字体（STHeiti Medium，绝不会错字），
     描边/渐变/投影全是可控的数值，改一个参数重跑 2 秒，且完全可复现。
本脚本走 ②。这不是偷懒，是「艺术字」这个具体品类下唯一正确的选择。

【风格基准】对齐游戏内已有的 txt() 描边字观感，但强度拉满做成「贴图级」：
  暖黄渐变字面（#FFF3C4 → #FFB93D，模拟金属质感的上亮下暗）
  + 深紫外描边（#3A2C5E，与道具栏文案同色系，成体系）
  + 白色内描边（把字面从深描边里「提」出来，这是艺术字通透感的关键）
  + 下方硬投影（offsetY，不用模糊阴影 —— 硬投影才有贴纸感）

【为什么要 @2x】设计坐标系 750×1624，但真机是 1080/1170 宽，scale 可达 1.5+。
  按设计尺寸出图会在真机上被放大插值糊掉。出 2 倍图，代码里按设计尺寸 blit。

用法：python3 tools/gen-guide-text.py
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'package/assets/ui/guide')
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'

SCALE = 2                       # @2x
PAD = 16 * SCALE                # 四周留白：容纳描边 + 投影，防裁切

# 每条文案的设计字号（与替换前 txt() 的字号一致，保证版式不跳）
#
# ══ 【方位铁律 · 用户纠错 2026-08-28】════════════════════════════════
# 【我犯的错】第一版写的是「拨一辆小车到【下面】的空车位」—— 方位彻底反了。
# 【布局铁证】pd-core.js 的 LAYOUT：
#     slotY   = 944    ← 6 个空车位（拖拽的【目标】）
#     qPanelY = 1216   ← 候选车两排队列（拖拽的【起点】）
#   qPanelY(1216) > slotY(944)，y 轴向下为正 ⇒ 队列在【下】、车位在【上】。
#   所以玩家的手势永远是【从下往上滑】。
# 【为什么会写错】凭「车位在屏幕中下部」的模糊印象直接下笔，没去核对这两个常量。
#   任何涉及方位的文案，必须先读 LAYOUT 里的 y 值再写 —— 这是硬性前置动作。
# 【动词也统一】用户指定用「滑动」（比「拨」「拖」更贴合手指在屏上的实际动作，
#   且与 toast 文案口径一致，全局同一套说法）。
LINES = [
    {'key': 'guide_l1', 'text': '滑动一辆小车到上面的空车位', 'size': 40, 'main': True},
    {'key': 'guide_l2', 'text': '同颜色的豆子会自己上对应的车', 'size': 30, 'main': False},
]


def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_gradient(w, h, top, bot):
    """竖向线性渐变（字面填充用）。"""
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp_color(top, bot, y / max(1, h - 1)))
    return img


def render(spec):
    text, size, main = spec['text'], spec['size'] * SCALE, spec['main']
    font = ImageFont.truetype(FONT, size)
    # 描边宽度按字号比例给，字大描边也粗，视觉权重才一致
    outer = max(5, int(size * 0.115))       # 深紫外描边
    inner = max(2, int(size * 0.045))       # 白色内描边
    drop = max(3, int(size * 0.085))        # 硬投影下沉量

    tmp = Image.new('RGBA', (10, 10))
    box = ImageDraw.Draw(tmp).textbbox((0, 0), text, font=font,
                                       stroke_width=outer)
    tw, th = box[2] - box[0], box[3] - box[1]
    W, H = tw + PAD * 2, th + PAD * 2 + drop
    ox, oy = PAD - box[0], PAD - box[1]

    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # ① 硬投影：整个字（含外描边）的剪影，往下偏移，深紫半透
    #    先画剪影再往下贴 —— 直接用 stroke 画两遍会让投影边缘和字面边缘打架
    sil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sil).text((ox, oy), text, font=font,
                             fill=(58, 44, 94, 190),
                             stroke_width=outer, stroke_fill=(58, 44, 94, 190))
    img.alpha_composite(sil, (0, drop))

    # ② 外描边（深紫实心）—— 这一层同时充当字面的「底座」
    d = ImageDraw.Draw(img)
    d.text((ox, oy), text, font=font, fill=(58, 44, 94, 255),
           stroke_width=outer, stroke_fill=(58, 44, 94, 255))

    # ③ 白色内描边：在字面外圈画一圈白，把暖黄字面从深紫里提出来
    d.text((ox, oy), text, font=font, fill=(255, 255, 255, 255),
           stroke_width=inner, stroke_fill=(255, 255, 255, 255))

    # ④ 字面渐变：用「纯字形」做蒙版，把渐变图贴进去
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).text((ox, oy), text, font=font, fill=255)
    top = (255, 243, 196) if main else (255, 255, 255)
    bot = (255, 185, 61) if main else (206, 196, 235)
    img.paste(make_gradient(W, H, top, bot), (0, 0), mask)

    # ⑤ 上缘高光：字面上 1/3 压一道白，金属艺术字的「反光」
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    band = int(th * 0.34)
    for y in range(band):
        a = int(120 * (1 - y / band))
        hd.line([(0, oy + y), (W, oy + y)], fill=(255, 255, 255, a))
    hl.putalpha(Image.composite(hl.getchannel('A'),
                                Image.new('L', (W, H), 0), mask))
    img.alpha_composite(hl)

    return img


def main():
    if not os.path.exists(OUT):
        os.makedirs(OUT)
    meta = {}
    for spec in LINES:
        img = render(spec)
        path = os.path.join(OUT, spec['key'] + '.png')
        img.save(path)
        # 设计坐标下的显示尺寸 = 像素 / SCALE
        meta[spec['key']] = {
            'file': 'assets/ui/guide/' + spec['key'] + '.png',
            'px': [img.width, img.height],
            'design': [round(img.width / SCALE, 1), round(img.height / SCALE, 1)],
            'text': spec['text'],
        }
        print('%-10s %dx%d px  → 设计 %.1fx%.1f  %s'
              % (spec['key'], img.width, img.height,
                 img.width / SCALE, img.height / SCALE, spec['text']))
    with open(os.path.join(OUT, 'guide-text.json'), 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('\n[ok] guide-text.json 已写出（代码按 design 尺寸 blit）')


if __name__ == '__main__':
    main()
