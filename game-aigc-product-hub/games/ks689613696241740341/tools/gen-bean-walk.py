# -*- coding: utf-8 -*-
"""小豆人【走路帧】atlas —— 方案一：阵列里是方块，走起来长腿摆动。

【为什么要分两套帧 · 几何根因】
  上一轮把豆做成 64×64 铺满整格，才实现了豆阵「严丝合缝」。
  但铺满整格 = 一颗豆的底部会被【正下方那颗豆的头顶】完全遮住，
  所以只要豆还在阵列里，无论用透明挖空还是暗部塑形，腿都不可能被看见。
  （已用 A/B/C 三候选实测验证：B 的暗部塑腿读成方形污渍，C 的透明挖空
   在平铺图里只剩几个小豁口 —— 都失败，这不是画法问题，是遮挡问题。）

【方案一的成立条件】
  豆子在游戏里有两种状态，可见性完全不同：
    · 躺在阵列里 → 四周被邻居贴死，腿本就看不见 → 用 64×64 方块，保住无缝
    · 被吸走 / 走向汽车 → 是独立个体、周围全是空白 → 用 64×80 带腿帧，腿全可见
  于是两个诉求不再互斥，且「走路时才长腿」本身就是一个合理的动画语义。

【本文件产出】
  assets/img/bean_walk.png
  布局：宽 = 7 色 × 64，高 = 4 帧 × 80（行 = 动画帧，列 = 颜色）
  第 r 行第 i 列 = 第 i 种颜色的第 r 个走路姿态。

【头部必须与 bean_atlas 完全一致 · 铁律】
  豆子被吸起的瞬间会从 64×64 帧切到 64×80 帧。若两套帧的头/五官有任何差异，
  玩家会看到一次「跳变」。所以本文件的身体与五官绘制代码是从
  gen-bean-atlas.py 原样搬来的，上半 64px 逐像素等价，只在下方追加 16px 的腿。

【腿为什么画在帧内而不是靠位移】
  走路动画若用「整体上下跳」实现，在斜向飞行路径上会与既有的 bob/sway/duang
  叠加成乱抖。把摆腿【烘进帧】，运动学只负责换帧，两者互不干扰。

用法：python3 tools/gen-bean-walk.py
"""
import os
import math
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'package/assets/img/bean_walk.png')

# 【腿长占比为何是 1/3】第一版用 64+16，腿只占帧高 20% —— 出图后读起来是
# 「蹲着的方块」而不是「长腿小人」，没满足用户的「长腿感」。
# 改成 64+32（腿占 1/3）：这是 Q 版角色里「两头身体一头腿」的典型比例，
# 腿足够长到能看清摆动，又不会把身体挤得太小而丢失辨识度。
CW, CH = 64, 96          # 单帧：上 64 是身体（与阵内豆等价），下 32 是腿
BODY = 64                # 身体高度，必须 == bean_atlas 的 CELL
NFRAME = 4               # 走路循环帧数
SS = 4                   # 超采样

# 与 pd-core.js PD.COLORS 严格一致，顺序 = PD.COLOR_KEYS（列顺序不能错）
KEYS = ['black', 'white', 'pink', 'cyan', 'red', 'yellow', 'green']
C = {
    'black':  {'main': (43, 43, 51),   'side': (21, 21, 26),   'lite': (90, 90, 102)},
    'white':  {'main': (253, 252, 250), 'side': (210, 206, 200), 'lite': (255, 255, 255)},
    'pink':   {'main': (255, 111, 181), 'side': (214, 73, 146), 'lite': (255, 194, 224)},
    'cyan':   {'main': (111, 216, 240), 'side': (63, 168, 200), 'lite': (194, 240, 250)},
    'red':    {'main': (240, 74, 74),  'side': (194, 46, 46),  'lite': (255, 176, 176)},
    'yellow': {'main': (255, 210, 74), 'side': (217, 168, 30), 'lite': (255, 237, 176)},
    'green':  {'main': (110, 209, 110), 'side': (63, 164, 74), 'lite': (191, 239, 191)},
}


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def frame(key, fi):
    """生成第 key 色、第 fi 帧的 64×80 走路帧。"""
    col = C[key]
    W, H = CW * SS, CH * SS
    BH = BODY * SS                      # 身体区高度（超采样后）
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(9 * SS)

    # ══ 腿：先画，让身体压在腿的上端，接缝被身体盖住 ══════════════
    # 【相位】4 帧构成一个完整步态循环：左腿前→并拢→右腿前→并拢。
    #   用 sin 取相位，两腿相差 π（一前一后），这是最基本也最可读的走路。
    ph = fi / float(NFRAME) * math.pi * 2
    # 腿变长后必须同步收窄：细长腿才是「长腿」，粗短腿只是「柱子」。
    leg_w = int(W * .155)
    leg_top = BH - int(H * .025)        # 稍微插进身体，避免出现横向接缝
    leg_bot = H - int(H * .012)
    swing = W * .105                    # 腿长了，摆幅也要相应加大才看得出走
    lift = int(H * .055)                # 抬脚高度：摆到最前时脚略微抬起
    for side, base_x in ((0, W * .30), (1, W * .70)):
        s = math.sin(ph + (0 if side == 0 else math.pi))
        cx = base_x + s * swing
        # 抬脚：|s| 越大表示摆得越开 —— 前摆(s>0)时抬脚，后蹬(s<0)时踩实
        up = lift * max(0.0, s)
        x0, x1 = cx - leg_w / 2, cx + leg_w / 2
        y1 = leg_bot - up
        # 腿本体（比身体略深，才能从身体上分离出来）
        d.rounded_rectangle([x0, leg_top, x1, y1],
                            radius=leg_w * .45, fill=mix(col['main'], col['side'], .30))
        # 鞋：腿底一小段更深色，读起来是「脚」，也让腿不至于虚在空中
        sh = (y1 - leg_top) * .22
        d.rounded_rectangle([x0 - leg_w * .10, y1 - sh, x1 + leg_w * .10, y1],
                            radius=leg_w * .40, fill=mix(col['side'], (30, 26, 36), .45))

    # ══ 身体：与 gen-bean-atlas.py 逐像素等价（不可改，改了会跳变）══
    body = Image.new('RGBA', (W, BH), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle([0, 0, W - 1, BH - 1], radius=r, fill=col['main'])
    bd.rectangle([0, r, W - 1, BH - 1], fill=col['main'])
    bd.rectangle([r, 0, W - r, BH - 1], fill=col['main'])
    # 通高竖向渐变（历史教训：任何同高硬边铺开后都会读成横向条纹）
    hi = mix(col['main'], col['lite'], .52)
    for y in range(0, BH):
        t = y / float(BH - 1)
        w = (1 - t) ** 1.25
        bd.line([(0, y), (W, y)], fill=mix(col['main'], hi, w))
    mk = Image.new('L', (W, BH), 0)
    md = ImageDraw.Draw(mk)
    md.rounded_rectangle([0, 0, W - 1, BH - 1], radius=r, fill=255)
    md.rectangle([0, r, W - 1, BH - 1], fill=255)
    md.rectangle([r, 0, W - r, BH - 1], fill=255)
    body.putalpha(mk)
    # 底部接地暗部（走路帧里它变成「身体与腿的衔接暗部」，语义同样成立）
    y0 = int(BH * .80)
    for y in range(y0, BH):
        t = (y - y0) / float(BH - y0)
        bd.line([(0, y), (W, y)], fill=mix(col['main'], col['side'], .30 * t * t * t))
    body.putalpha(mk)

    # 五官：与阵内豆同比例同位置（eye_y = .30 × 身体高）
    eye_y = int(BH * .30)
    er = int(BH * .062)
    for ex in (int(W * .34), int(W * .66)):
        bd.ellipse([ex - er, eye_y - er * 1.25, ex + er, eye_y + er * 1.25], fill=(38, 32, 46))
        bd.ellipse([ex - er * .34, eye_y - er * .80, ex + er * .30, eye_y - er * .20],
                   fill=(255, 255, 255))
    blush = (255, 158, 170) if key == 'white' else mix(col['side'], (255, 120, 130), .45)
    for bx in (int(W * .20), int(W * .80)):
        bd.ellipse([bx - int(W * .055), eye_y + int(BH * .045),
                    bx + int(W * .055), eye_y + int(BH * .115)], fill=blush)
    bd.arc([int(W * .42), int(BH * .40), int(W * .58), int(BH * .50)],
           start=15, end=165, fill=(38, 32, 46), width=max(2, int(BH * .014)))

    im.paste(body, (0, 0), body)
    return im.resize((CW, CH), Image.LANCZOS)


def main():
    atlas = Image.new('RGBA', (CW * len(KEYS), CH * NFRAME), (0, 0, 0, 0))
    for fi in range(NFRAME):
        for i, k in enumerate(KEYS):
            atlas.paste(frame(k, fi), (i * CW, fi * CH))
    atlas.save(OUT)
    print('bean_walk %dx%d（%d 色 × %d 帧，单帧 %dx%d）→ %s'
          % (atlas.width, atlas.height, len(KEYS), NFRAME, CW, CH, OUT))
    print('代码侧：ATL.walk = { cw:64, ch:80, n:4 }；drawBean 传 walk 相位时改用本图。')

    # 验收图：单帧放大 4 连拍（看摆腿）+ 与阵内豆的对位
    prev = Image.new('RGBA', (CW * NFRAME * 4, CH * 4), (250, 248, 245, 255))
    for fi in range(NFRAME):
        f = frame('pink', fi).resize((CW * 4, CH * 4), Image.NEAREST)
        prev.paste(f, (fi * CW * 4, 0), f)
    prev.save(os.path.join(ROOT, 'build-qrcodes', 'bean-walk-preview.png'))
    print('验收图 → build-qrcodes/bean-walk-preview.png')


if __name__ == '__main__':
    main()
