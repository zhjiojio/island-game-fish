# -*- coding: utf-8 -*-
"""小豆人形象候选对比 —— 找回「长腿感」但不破坏无缝拼接。

【用户诉求】「豆人现在完全是一个方块了，没有长腿的感觉了，请你优化他的形象」

【上一轮为什么会变成方块 · 根因】
  为了解决「拼不严、有缝」，上一轮把帧改成 64×64 铺满整格的圆角方块。
  腿是这个决策的直接牺牲品 —— 因为「腿」在几何上等于【底部要挖两个透明缺口】，
  而任何透明缺口在豆阵里都是一条真实的缝。
  于是当时选择了「保无缝、砍腿」。现在用户明确要腿回来。

【本次破局思路 · 用明暗塑形，不用透明挖空】
  「腿」这个信息不一定要靠轮廓（alpha）表达，也可以靠【暗部】表达。
  帧依旧 100% 不透明、依旧铺满整格 → 拼接零缝隙；
  同时在底部画出「两条亮腿 + 中间一道暗缝 + 两侧暗角」，
  人眼读到的就是一个有腿的小人，而不是一块砖。

【三个候选】
  A 当前版：纯方块（对照组）
  B 影腿版：底部 32% 用明暗画出双腿，全帧不透明 → 有腿 + 零缝
  C 真腿版：底部真的挖透明缺口 → 腿最像，但豆阵会出现真实缝隙

【为什么要平铺 4×4 来看】
  单帧好看不代表豆阵好看。历史上踩过两次坑（硬边高光、硬边暗带），
  都是单帧没问题、铺开后各帧同高的边界连成横向条纹。
  所以候选必须【平铺验收】，这是这个项目的硬性验收方式。
用法：python3 tools/gen-bean-candidates.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'build-qrcodes', 'bean-candidates.png')

CELL = 64
SS = 4

C = {
    'pink':   {'main': (255, 111, 181), 'side': (214, 73, 146), 'lite': (255, 194, 224)},
    'cyan':   {'main': (111, 216, 240), 'side': (63, 168, 200), 'lite': (194, 240, 250)},
    'yellow': {'main': (255, 210, 74),  'side': (217, 168, 30), 'lite': (255, 237, 176)},
    'green':  {'main': (110, 209, 110), 'side': (63, 164, 74),  'lite': (191, 239, 191)},
}


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def base_body(d, S, col, r):
    """铺满整格的圆角方块（只倒上面两角）+ 通高竖向渐变。这部分三个候选共用。"""
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=col['main'])
    d.rectangle([0, r, S - 1, S - 1], fill=col['main'])
    d.rectangle([r, 0, S - r, S - 1], fill=col['main'])
    # 通高渐变：顶亮底暗，全程无硬边（历史教训：任何同高硬边铺开都成条纹）
    hi = mix(col['main'], col['lite'], .52)
    for y in range(0, S):
        t = y / float(S - 1)
        w = (1 - t) ** 1.25
        d.line([(0, y), (S, y)], fill=mix(col['main'], hi, w))


def face(d, S, col, key, eye_ratio):
    """五官。eye_ratio 控制眼睛高度 —— 腿越长，头的可用区越靠上。"""
    eye_y = int(S * eye_ratio)
    er = int(S * .062)
    for ex in (int(S * .34), int(S * .66)):
        d.ellipse([ex - er, eye_y - er * 1.25, ex + er, eye_y + er * 1.25], fill=(38, 32, 46))
        d.ellipse([ex - er * .34, eye_y - er * .80, ex + er * .30, eye_y - er * .20],
                  fill=(255, 255, 255))
    blush = mix(col['side'], (255, 120, 130), .45)
    for bx in (int(S * .20), int(S * .80)):
        d.ellipse([bx - int(S * .055), eye_y + int(S * .045),
                   bx + int(S * .055), eye_y + int(S * .115)], fill=blush)
    d.arc([int(S * .42), eye_y + int(S * .075), int(S * .58), eye_y + int(S * .175)],
          start=15, end=165, fill=(38, 32, 46), width=max(2, int(S * .014)))


def frame_A(key):
    """候选 A：当前线上版本（纯方块，无腿）—— 对照组。"""
    col = C[key]
    S = CELL * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(9 * SS)
    base_body(d, S, col, r)
    mk = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mk)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    md.rectangle([0, r, S - 1, S - 1], fill=255)
    md.rectangle([r, 0, S - r, S - 1], fill=255)
    im.putalpha(mk)
    y0 = int(S * .80)
    for y in range(y0, S):
        t = (y - y0) / float(S - y0)
        d.line([(0, y), (S, y)], fill=mix(col['main'], col['side'], .30 * t * t * t))
    face(d, S, col, key, .30)
    return im.resize((CELL, CELL), Image.LANCZOS)


def frame_B(key):
    """候选 B：影腿版 —— 底部用明暗画出双腿，帧仍 100% 不透明。

    【关键设计】腿的「缝」是画上去的暗色，不是透明。
    两侧也压暗 → 亮的部分自然收成两条竖直长条 = 视觉上的腿。
    因为没有任何 alpha 缺口，豆与豆之间依旧零缝隙。
    """
    col = C[key]
    S = CELL * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(9 * SS)
    base_body(d, S, col, r)
    mk = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mk)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    md.rectangle([0, r, S - 1, S - 1], fill=255)
    md.rectangle([r, 0, S - r, S - 1], fill=255)
    im.putalpha(mk)

    # ── 腿部区域：从 .58 到底 ──
    # 【为什么从 .58 起】给「长腿」留出 42% 的帧高。
    # 低于这个比例（比如 .72）读起来是「蹲着的方块」，不是长腿。
    leg_top = int(S * .58)
    dark = col['side']
    # 中缝：一道从上往下逐渐变宽变深的暗带，模拟两腿之间的空隙
    gap_w0, gap_w1 = S * .045, S * .085
    for y in range(leg_top, S):
        t = (y - leg_top) / float(S - leg_top)
        gw = gap_w0 + (gap_w1 - gap_w0) * t
        # 中缝强度随高度加深，顶端极浅 → 与身体平滑衔接，不产生硬边
        amt = .62 * (t ** 0.7)
        d.rectangle([S / 2 - gw / 2, y, S / 2 + gw / 2, y],
                    fill=mix(col['main'], dark, amt))
    # 两侧收暗：让亮区收束成两条腿的形状
    side_w = S * .17
    for y in range(leg_top, S):
        t = (y - leg_top) / float(S - leg_top)
        amt = .34 * (t ** 0.8)
        d.rectangle([0, y, side_w, y], fill=mix(col['main'], dark, amt))
        d.rectangle([S - side_w, y, S, y], fill=mix(col['main'], dark, amt))
    # 底部接地暗部（保留原有柔和渐变，避免硬边成纹）
    y0 = int(S * .88)
    for y in range(y0, S):
        t = (y - y0) / float(S - y0)
        d.line([(0, y), (S, y)], fill=mix(col['main'], col['side'], .34 * t * t))
    # 五官上提到 .26：腿变长了，头必须相应上移，否则比例失衡
    face(d, S, col, key, .26)
    return im.resize((CELL, CELL), Image.LANCZOS)


def frame_C(key):
    """候选 C：真腿版 —— 底部真的挖透明缺口。腿最像，但会带来真实缝隙。"""
    col = C[key]
    S = CELL * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(9 * SS)
    base_body(d, S, col, r)
    leg_top = int(S * .60)
    mk = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mk)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    md.rectangle([0, r, S - 1, leg_top], fill=255)
    md.rectangle([r, 0, S - r, leg_top], fill=255)
    # 两条腿（真实轮廓）
    lw = int(S * .30)
    md.rectangle([int(S * .12), leg_top, int(S * .12) + lw, S], fill=255)
    md.rectangle([S - int(S * .12) - lw, leg_top, S - int(S * .12), S], fill=255)
    im.putalpha(mk)
    y0 = int(S * .88)
    for y in range(y0, S):
        t = (y - y0) / float(S - y0)
        d.line([(0, y), (S, y)], fill=mix(col['main'], col['side'], .34 * t * t))
    face(d, S, col, key, .26)
    im.putalpha(mk)
    return im.resize((CELL, CELL), Image.LANCZOS)


def tile(fn, key, n=4, scale=3):
    """平铺 n×n —— 这是本项目的硬性验收方式（单帧好看≠豆阵好看）。"""
    f = fn(key)
    sheet = Image.new('RGBA', (CELL * n, CELL * n), (250, 248, 245, 255))
    for r in range(n):
        for c in range(n):
            sheet.paste(f, (c * CELL, r * CELL), f)
    return sheet.resize((CELL * n * scale // 2, CELL * n * scale // 2), Image.NEAREST)


def big(fn, key, scale=5):
    f = fn(key)
    bg = Image.new('RGBA', (CELL, CELL), (250, 248, 245, 255))
    bg.paste(f, (0, 0), f)
    return bg.resize((CELL * scale, CELL * scale), Image.NEAREST)


def main():
    cands = [('A 当前版 · 纯方块', frame_A), ('B 影腿版 · 暗部塑腿', frame_B),
             ('C 真腿版 · 透明挖空', frame_C)]
    single_w, tile_w = CELL * 5, CELL * 4 * 3 // 2
    colw = single_w + tile_w + 30
    W, H = colw * 3 + 20, CELL * 5 + 90
    sheet = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, (name, fn) in enumerate(cands):
        x = 10 + i * colw
        d.text((x, 8), name, fill=(20, 20, 20))
        sheet.paste(big(fn, 'pink'), (x, 30))
        sheet.paste(tile(fn, 'cyan'), (x + single_w + 14, 30))
        d.text((x, 30 + CELL * 5 + 8), 'left=单帧放大  right=4x4平铺(看缝)', fill=(90, 90, 90))
    sheet.save(OUT)
    print('候选对比图 → %s  (%dx%d)' % (OUT, sheet.width, sheet.height))


if __name__ == '__main__':
    main()
