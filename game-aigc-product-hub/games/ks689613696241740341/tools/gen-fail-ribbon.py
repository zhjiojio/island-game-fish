# -*- coding: utf-8 -*-
"""失败缎带 + 复活弹窗图标 → 透明底 PNG。

【为什么不用 AI 出图】用户给的参考图核心是【中文立体字「挑战失败」】。
  中文字形是 gpt-image-2 的死穴：缺笔画、错字、字距失控（已在引导文案上验证过一次）。
  失败浮层是玩家高频看到的界面，出一个错字就是灾难。
  PIL 走系统字体（STHeiti Medium）→ 字形绝不会错，描边/立体层全是可控数值。
【与参考图的对应关系】/Users/fat/Desktop/67eba812eb0dab0a57521686c4b7ceda.png
  ① 紫灰色拱形缎带主带 + 顶部一道浅色高光
  ② 左右两条向下外折的燕尾，折角处用更深的紫压出「布料翻折」
  ③ 「挑战失败」= 蓝灰立体字：白亮顶面 + 中间蓝灰字面 + 下方深蓝厚度 + 深色外描边
  ④ 主带上散落 2~3 处白色高光弧（塑料光泽感）

用法：python3 tools/gen-fail-ribbon.py
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'package/assets/ui/popup')
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
SCALE = 2                       # @2x，真机 scale 可达 1.5+，按设计尺寸出图会被插值糊掉

# ── 缎带配色（吸自参考图）────────────────────────────────────────
BAND = (108, 100, 143)          # 主带紫灰
BAND_HI = (146, 139, 178)       # 主带顶部高光带
FOLD = (74, 68, 104)            # 燕尾/翻折暗部
TAIL = (92, 85, 126)            # 燕尾正面
# 立体字四层（从下往上叠）
T_OUTLINE = (46, 42, 70)        # 外描边（最底，兜住整个字）
T_DEPTH = (58, 96, 142)         # 字的「厚度」（往下偏移形成立体）
T_FACE_TOP = (238, 248, 255)    # 字面上缘（近白）
T_FACE_BOT = (128, 172, 214)    # 字面下缘（蓝灰）


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(w, h, top, bot):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / max(1, h - 1)))
    return img


def arch_band(d, x0, x1, ytop, hgt, rise, fill):
    """拱形带：上下缘都是同一条抛物线，中间高两端低（参考图的弧度）。"""
    pts_top, pts_bot = [], []
    n = 64
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        # 抛物线：t=0.5 时抬最高
        y = ytop + rise * (1 - 4 * (t - 0.5) ** 2) * -1 + rise
        pts_top.append((x, y))
        pts_bot.append((x, y + hgt))
    d.polygon(pts_top + pts_bot[::-1], fill=fill)
    return pts_top, pts_bot


def make_ribbon():
    W, H = 1040, 380                      # @2x 画布（设计 520×190）
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bx0, bx1 = 150, W - 150               # 主带左右端
    bytop, bh, rise = 96, 116, 46

    # ── ① 左右燕尾（先画，让主带压在上面形成「带子从后面穿过去」的层次）──
    # 【第一版的问题】燕尾太肿（高 136），比主带还厚，看着像两块碎布。
    # 参考图里燕尾是【比主带稍窄、向下斜垂、尾端 V 口】的。
    for side in (-1, 1):
        ax = bx0 if side < 0 else bx1
        ox = ax - side * 118
        top = bytop + rise + 14
        th = 92                                    # 燕尾高，比主带 bh(116) 窄
        drop = 30                                  # 尾端下垂，做出自然下垮
        d.polygon([
            (ax, top), (ox, top + drop), (ox + side * 30, top + drop + th * .5),
            (ox, top + drop + th), (ax, top + th),
        ], fill=TAIL)
        d.polygon([
            (ax, top), (ax - side * 26, top + 10),
            (ax - side * 26, top + th - 10), (ax, top + th),
        ], fill=FOLD)

    # ── ② 主带（拱形）──────────────────────────────────────────
    pts_top, pts_bot = arch_band(d, bx0, bx1, bytop, bh, rise, BAND)
    # 顶部高光带：沿上缘再画一条薄的浅色拱，宽度 = 主带的 26%
    hi_top, hi_bot = [], []
    for i, (x, y) in enumerate(pts_top):
        hi_top.append((x, y))
        hi_bot.append((x, y + bh * 0.26))
    d.polygon(hi_top + hi_bot[::-1], fill=BAND_HI)

    # ── ③ 主带内斜向柔光：参考图的光泽是【贴在带子上】的一道斜亮面，
    #    不是浮在空中的弧线。第一版画 arc 结果是两道游离的白划痕（像脏斑），
    #    根因是弧线没被主带形状裁切。现在改成【先画亮面 → 再用主带 mask 裁】。
    band_mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(band_mask).polygon(pts_top + pts_bot[::-1], fill=255)
    gl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    gd.polygon([(bx1 - 210, bytop - 10), (bx1 - 130, bytop - 10),
                (bx1 - 250, bytop + bh + 70), (bx1 - 330, bytop + bh + 70)],
               fill=(255, 255, 255, 46))
    gl.putalpha(Image.composite(gl.getchannel('A'), Image.new('L', (W, H), 0), band_mask))
    img.alpha_composite(gl)

    # ── ④ 立体字「挑战失败」──────────────────────────────────────
    text = '挑战失败'
    size = 118
    font = ImageFont.truetype(FONT, size)
    # 字距手动排（PIL 不支持 letter-spacing，逐字画才能控制间距）
    gap = 10
    widths = [d.textlength(ch, font=font) for ch in text]
    tw = sum(widths) + gap * (len(text) - 1)
    # 字沿主带的拱线走：中心抬高一点，贴合弧度
    cx = (bx0 + bx1) / 2
    baseline = bytop + rise * 0.30 + bh * 0.16
    outline = 13
    depth = 13

    def draw_text_layer(target, dy, fill, stroke_w=0, stroke_fill=None):
        td = ImageDraw.Draw(target)
        x = cx - tw / 2
        for i, ch in enumerate(text):
            # 每个字按离中心的距离微微下沉，形成拱形排字
            t = (x + widths[i] / 2 - cx) / (tw / 2)
            # 【7 不是 22】第一版用 22 → 「挑」「败」两个边字明显掎下去，像排版残。
            # 拱形排字只需要【微】弯，弯过了反而像没对齐。
            arc_dy = (t ** 2) * 7
            td.text((x, baseline + dy + arc_dy), ch, font=font, fill=fill,
                    stroke_width=stroke_w, stroke_fill=stroke_fill)
            x += widths[i] + gap

    # (a) 外描边：把整个字（含厚度层的最低点）兜住
    for k in range(depth + 1):
        draw_text_layer(img, k, T_OUTLINE, outline, T_OUTLINE)
    # (b) 厚度层：深蓝，逐层往下偏移
    for k in range(depth, 0, -1):
        draw_text_layer(img, k, T_DEPTH)
    # (c) 字面：先画纯白底（占位），再用蒙版贴渐变
    face = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_text_layer(face, 0, (255, 255, 255, 255))
    mask = face.getchannel('A')
    img.paste(vgrad(W, H, T_FACE_TOP, T_FACE_BOT), (0, 0), mask)

    return img.crop(img.getbbox())


# ── 复活弹窗图标：金色光环 + 白翅膀 + 红爱心（对齐参考 UI 图）─────────
def make_revive_icon():
    W = H = 560                           # @2x（设计 280）
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = W / 2

    # ① 金色光环（椭圆环，透视压扁）
    hy, hrw, hrh = 118, 118, 34
    d.ellipse([cx - hrw, hy - hrh, cx + hrw, hy + hrh],
              outline=(247, 196, 62), width=22)
    d.ellipse([cx - hrw + 8, hy - hrh + 7, cx + hrw - 8, hy + hrh - 7],
              outline=(255, 228, 138), width=7)

    # ② 白翅膀（参数曲线，单一闭合轮廓）
    # ══ 三次失败的复盘（这段注释是为了后人不要再走一遍）══════════════════
    #   v1: d.ellipse(outline=...) 画空心椭圆环 → 三圈游离铁丝圈。
    #   v2: 每片羽各自 outline → 白填充在白卡片上看不见，只剩交叉椭圆线。
    #   v3: 羽片并集后只描并集轮廓 → 【依然是分开的椭圆环】。
    # 【v3 为什么也失败·真正的根因】我一直在改「怎么描边」，但错的是
    #   【拿椭圆当羽片】这个思路本身：specs 里各片的 oy 偏移差到 40~86px，
    #   彼此根本没重叠，所谓「并集」其实是 4 个互不相交的椭圆 →
    #   于是每个椭圆各自得到一圈外轮廓，看着就是同心铁丝圈。
    #   而且椭圆曲率处处相同，天生没有羽毛「根部宽厚 → 梢部收尖」的方向感，
    #   在 240px 的小尺寸下永远读不出羽翼。
    # 【最终做法·换模型而不是调参数】直接用参数曲线描【一条闭合翅形】：
    #   上缘 = 从根部向外上扬的平滑弧（翅脊）；
    #   下缘 = 沿路返回的【扇贝波】(|sin|) → 天然就是一排羽尖，
    #          且波幅随靠近根部而增大 → 自带「根厚梢薄」的透视。
    #   全程只有一条 polygon，不可能再出现任何内部闭合椭圆。
    def wing_poly(side):
        rx, ry = cx + side * 56, 264.0        # 根部（会被爱心遮住，做无缝衔接）
        span = 166.0
        pts = []
        n = 44
        for i in range(n + 1):                # 上缘：根 → 梢，上扬 + 弯弓
            u = i / n
            pts.append((rx + side * span * u,
                        ry - 98 * (u ** 0.72) - 15 * math.sin(math.pi * u)))
        tx, ty = pts[-1]
        m = 72
        for i in range(1, m + 1):             # 下缘：梢 → 根，叠扇贝波作羽尖
            v = i / m
            bx = tx + ((rx + side * 8) - tx) * v
            by = ty + ((ry + 32) - ty) * v
            by += (9 + 25 * v) * abs(math.sin(4 * math.pi * v))
            pts.append((bx, by))
        return pts

    wm = Image.new('L', (W, H), 0)
    wmd = ImageDraw.Draw(wm)
    for s in (-1, 1):
        wmd.polygon(wing_poly(s), fill=255)
    # 翅面：白 → 浅蓝竖向渐变（纯白在白卡片上会融掉，渐变才有体积感）
    img.paste(vgrad(W, H, (255, 255, 255), (219, 228, 244)), (0, 0), wm)
    # 外轮廓：膨胀 − 原形 → 只得一圈边，内部干净
    w_edge = wm.filter(ImageFilter.MaxFilter(9)).point(lambda v: 255 if v > 128 else 0)
    w_ring = Image.new('L', (W, H))
    w_ring.paste(w_edge)
    w_ring.paste(0, (0, 0), wm)
    img.paste(Image.new('RGB', (W, H), (168, 183, 211)), (0, 0), w_ring)
    # 内部羽分隔：沿翅脊方向的几条浅灰【直线】。
    # 【不用弧！】弧线正是 v2/v3 那个「同心圆」观感的来源。
    fl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fd2 = ImageDraw.Draw(fl)
    for s in (-1, 1):
        for k in range(1, 4):
            u = k / 4.0
            fd2.line([(cx + s * (56 + 26 * u), 258 - 26 * u),
                      (cx + s * (56 + 150 * u), 250 - 82 * (u ** 0.72))],
                     fill=(174, 189, 216, 190), width=3)
    fl.putalpha(Image.composite(fl.getchannel('A'), Image.new('L', (W, H), 0), wm))
    img.alpha_composite(fl)

    # ③ 红爱心（参数心形曲线，一笔成形）
    # 【中心黑点的真正根治】之前用「两圆 + 下三角」拼心形，三个图形的交界处
    #   总会因浮点/取整差异漏出 1px 缝（就是心口正中那个黑点）。我先前的三次修法
    #   （模糊+阈值、加大重叠、填内部矩形）全都是在【补缝】—— 只要形状是「拼」的，
    #   缝就永远可能在别的缩放下再冒出来。
    #   根治：改用参数心形方程生成【一条闭合曲线】，单次 polygon 填充，
    #   拓扑上就不存在接缝，也不需要任何模糊/补丁。
    #   x = 16sin³t，y = 13cos t − 5cos2t − 2cos3t − cos4t（经典心形线）
    hr = 92
    hcx, hcy = cx, 268
    heart = Image.new('L', (W, H), 0)
    hd = ImageDraw.Draw(heart)
    sc = hr / 16.4                                  # 使心形半宽 ≈ hr
    hpts = []
    for i in range(240):
        t = i / 240.0 * 2 * math.pi
        hx = 16 * (math.sin(t) ** 3)
        hy = -(13 * math.cos(t) - 5 * math.cos(2 * t)
               - 2 * math.cos(3 * t) - math.cos(4 * t))
        hpts.append((hcx + hx * sc, hcy + hy * sc * 1.02))
    hd.polygon(hpts, fill=255)
    # 红色渐变（上亮下暗）+ 描边
    img.paste(vgrad(W, H, (255, 92, 92), (196, 26, 40)), (0, 0), heart)
    edge = heart.filter(ImageFilter.MaxFilter(7)).point(lambda v: 255 if v > 128 else 0)
    ring = Image.new('L', (W, H))
    ring.paste(edge)
    ring.paste(0, (0, 0), heart)
    img.paste(Image.new('RGB', (W, H), (168, 22, 34)), (0, 0), ring)
    # 高光：左上角一小片白斑，塑料质感的关键
    gl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([hcx - hr * .62, hcy - hr * .66,
                                hcx - hr * .16, hcy - hr * .22],
                               fill=(255, 255, 255, 168))
    gl.putalpha(Image.composite(gl.getchannel('A'), Image.new('L', (W, H), 0), heart))
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4)))

    return img.crop(img.getbbox())


def main():
    if not os.path.exists(OUT):
        os.makedirs(OUT)
    meta = {}
    for key, fn in (('fail_ribbon', make_ribbon), ('icon_revive', make_revive_icon)):
        img = fn()
        img.save(os.path.join(OUT, key + '.png'))
        meta[key] = {
            'file': 'assets/ui/popup/' + key + '.png',
            'px': [img.width, img.height],
            'design': [round(img.width / SCALE, 1), round(img.height / SCALE, 1)],
        }
        print('%-13s %dx%d px → 设计 %.1fx%.1f'
              % (key, img.width, img.height, img.width / SCALE, img.height / SCALE))
    p = os.path.join(OUT, 'fail-revive.json')
    with open(p, 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('\n[ok] fail-revive.json 已写出（代码按 design 尺寸 blit）')


if __name__ == '__main__':
    main()
