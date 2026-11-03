# -*- coding: utf-8 -*-
"""重烘焙小豆人 atlas → 方底圆头、拼满无缝。

【用户诉求】「别人的小豆人是严丝合缝拼满，我们的圆形不太行；
  也搞成正方形，或者底下是正方形、头是圆的，反正看起来的地方要严丝合缝」

【旧图为什么必然留缝 · 算术层面的根因】
  旧 atlas 帧 = 64×80（非方形），blit() 走的是 contain fit：
      k = min(w/cw, h/ch) = min(45.4/64, 45.4/80) = 45.4/80
      → 实际渲染 36.3 宽 × 45.4 高
  而格子 L.cell = 32。于是每颗豆【比格子宽 4.3px、高 13.4px】，
  相邻豆互相重叠又对不齐，边缘参差 → 看起来就是「拼不严」。
  所以这不是画风问题，是【帧宽高比 ≠ 格子宽高比】的几何问题：
  只要帧不是正方形，contain fit 后就永远不可能与方格严丝合缝。

【本次做法】
  ① 帧改成 64×64 正方形 → 与方格同比，blit 传 (sz,sz) 后 k=sz/64，
     渲染尺寸恰好 = 一个格子，边到边零缝隙。
  ② 造型 = 铺满整格的圆角方块：
     · 左右边、底边【完全平直】→ 横向、纵向都能贴死
     · 只把【上面两个角】倒大圆角（r=15）→ 读起来就是「圆头」
     · 一条浅色肩线把头/身分开，再加眼睛+腮红+嘴
     这正是用户说的「底下是正方形、头是圆的」。
  ③ 不画任何投影/描边到帧边缘 —— 投影会在豆与豆之间形成暗带，
     那本身就是一种「缝」。立体感全靠内部明暗（顶高光 + 底暗带）表达。

用法：python3 tools/gen-bean-atlas.py
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'package/assets/img/bean_atlas.png')

CELL = 64                       # 单帧边长（正方形！与 L.cell 同比是无缝的前提）
SS = 4                          # 超采样倍数，最后缩回去抗锯齿

# 与 pd-core.js PD.COLORS 严格一致，顺序 = PD.COLOR_KEYS
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


def frame(key):
    col = C[key]
    S = CELL * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # ── 身体：铺满整帧的圆角方块，只倒上面两个角 ──────────────────
    # 【无缝的关键】left=0, right=S, bottom=S 三边一律画到帧边缘，
    #   不留 1px 空白（留了就是缝）。PIL 的 rounded_rectangle 四角同 r，
    #   所以先画大圆角矩形，再用两个矩形把「下半身」补成完全的直角方块。
    r = int(9 * SS)                 # 圆角半径
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=col['main'])
    d.rectangle([0, r, S - 1, S - 1], fill=col['main'])          # 补平左右下侧
    d.rectangle([r, 0, S - r, S - 1], fill=col['main'])          # 补平上边中段

    # ── 顶部高光：头顶的体积感 ──────────────────────────────────────
    # 【第二版·必须改成渐变】第一版画的是一块 rounded_rectangle 实心亮块，
    #   于是每颗豆在 y≈.30 处都有一条【硬的水平边界】。单帧看是「头顶反光」，
    #   但豆阵是【整片铺开】的：每行同一高度都有一条硬边，行行对齐 →
    #   整片读成一道道横向条纹，观感就是砖墙/网格，而不是一群小人。
    #   这跟用户「要严丝合缝、不要看出缝」的诉求是冲突的 ——
    #   缝不一定来自透明间隙，【对齐的硬边界线】同样会被读成缝。
    # 改法：逐行插值的竖向渐变（顶部最亮 → .46 处归零），全程无硬边，
    #   铺开后只剩柔和的明暗起伏，读不出任何线。
    # 【第三版·渐变必须通高】第二版让高光只覆盖上 46%，下面 54% 是一片平色。
    #   单帧看没问题，但豆阵是【行行对齐】铺开的：每颗豆在同一高度都有
    #   「亮区 → 平色区」的亮度落差，横向连起来就是一条贯通的明暗分界，
    #   平铺 3 行后肉眼直接读成横向条纹（砖墙感）。
    #   这就是我这次的教训：【无透明缝 ≠ 无缝】。只要帧内有任何
    #   与帧边平行、且各帧同高的亮度突变，对齐后都会被读成缝。
    #   根治：渐变跑满整帧高度，不留任何平色区 —— 全帧只有一条连续的
    #   明→暗过渡，读起来是球面体积感，横向拼接不产生任何分界。
    hi = mix(col['main'], col['lite'], .52)
    for y in range(0, S):
        t = y / float(S - 1)                 # 0(顶) → 1(底)
        w = (1 - t) ** 1.25                  # 顶部最亮，单调递减到 0
        d.line([(0, y), (S, y)], fill=mix(col['main'], hi, w))
    # 用透明遮罩把渐变裁回圆角头形（上面 line 是通宽画的，会盖掉上方两个圆角）
    mk = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mk)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    md.rectangle([0, r, S - 1, S - 1], fill=255)
    md.rectangle([r, 0, S - r, S - 1], fill=255)
    im.putalpha(mk)

    # ── 肩线：把「圆头」和「方身」分开，这样即使整体是方块，
    #    读图时也是「一个有头的小人」而不是一块砖 ──────────────
    # ── 肩线：已【删除】──────────────────────────────────────────────
    # 【真图验收发现的缺陷】原本想用一条横线把「圆头」和「方身」分开，
    #   但 3×7 平铺放大后看，它读出来就是【一道黑色横杠】（像胡子、像横缝），
    #   而且各帧同高、横向一字排开 —— 恰恰就是用户最反感的那种「缝」。
    #   五官（眼睛+腮红+嘴）已经足够表达「这是个小人」，不需要再画分界线。
    #   教训：任何与帧边平行、且各帧同高的深色元素，铺开后都会被读成缝。

    # ── 底部暗部：模拟接地。
    #    【不能用外投影】投影落在帧外/帧边会在豆之间形成暗缝，
    #    所以「阴影」必须画在帧【内部】底边。
    #    【但也不能用硬边暗带】第一版画了一条 .86~1.0 的实心暗色矩形，
    #    单帧看没问题，可豆阵是【多行铺开】的：每行底部一条硬暗线，
    #    连起来就是一道道横向暗纹 —— 那正是用户抱怨的「缝」，等于白改。
    #    改成【逐行渐变】：从 .72 处开始由本色平滑过渡到暗色，
    #    没有任何硬边界，行与行之间只会读成柔和的明暗起伏，不成线。
    #    【第二次收敛】第一版 y0=.72 / 强度 .52 出图后仍能看到一条横向边界，
    #    铺成多行就是暗纹。改 y0=.80 + 强度 .30 + t³ 曲线：
    #    起点更靠下、峰值更浅、前段过渡更慢 → 肉眼已读不出边界线。
    y0 = int(S * .80)
    for y in range(y0, S):
        t = (y - y0) / float(S - y0)
        d.line([(0, y), (S, y)], fill=mix(col['main'], col['side'], .30 * t * t * t))

    # ── 五官：眼睛 + 腮红 + 嘴（都在肩线以上的「头」区域）────────
    # 【五官上提】删了肩线后，五官若仍在 .34 会显得偏下、像贴在身体上。
    # 上提到 .30，读起来就是「头在上半部」。
    eye_y = int(S * .30)
    er = int(S * .062)
    for ex in (int(S * .34), int(S * .66)):
        d.ellipse([ex - er, eye_y - er * 1.25, ex + er, eye_y + er * 1.25],
                  fill=(38, 32, 46))
        # 眼球高光：一点白，眼睛立刻有神
        d.ellipse([ex - er * .34, eye_y - er * .80,
                   ex + er * .30, eye_y - er * .20], fill=(255, 255, 255))
    # 腮红（白豆用浅粉，其它用自身 side 调深一点，避免在浅底上看不见）
    blush = (255, 158, 170) if key == 'white' else mix(col['side'], (255, 120, 130), .45)
    for bx in (int(S * .20), int(S * .80)):
        d.ellipse([bx - int(S * .055), eye_y + int(S * .045),
                   bx + int(S * .055), eye_y + int(S * .115)], fill=blush)
    # 嘴：一小段向下的弧
    d.arc([int(S * .42), int(S * .40), int(S * .58), int(S * .50)],
          start=15, end=165, fill=(38, 32, 46), width=max(2, int(S * .014)))

    return im.resize((CELL, CELL), Image.LANCZOS)


def main():
    atlas = Image.new('RGBA', (CELL * len(KEYS), CELL), (0, 0, 0, 0))
    for i, k in enumerate(KEYS):
        atlas.paste(frame(k), (i * CELL, 0))
    atlas.save(OUT)
    print('bean_atlas %dx%d（%d 帧 × %d×%d 正方形）→ %s'
          % (atlas.width, atlas.height, len(KEYS), CELL, CELL, OUT))
    print('提醒：代码侧 ATL.bean 必须同步改成 { cw: 64, ch: 64 }，')
    print('      且 drawBean 的 blit 尺寸要传 (sz, sz) —— 不再乘 1.42。')


if __name__ == '__main__':
    main()
