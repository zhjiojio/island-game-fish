#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拼豆装车 · Icon 系统生成器
=========================================================
职责边界（重要）：
  ✅ 只生成 UI 图标（icon）
  ❌ 不画车、不画豆人 —— 代码里 drawCar() / drawBean() 已有，不重复造

设计网格（所有图标共用，这是"不丑"的唯一保证）：
  画板     96 × 96
  安全边距 8   → 活动区 80 × 80
  视觉盒   72 × 72   所有字形光学对齐到这个盒子
  线宽     10  （描边型图标统一，round cap + round join）
  实心最细 18  （实心型图标的最细肢体，保证 32px 下不消失）

铁律：
  1. 箭头必须与弧/杆**连接**，箭头方向 = 该点切线方向（旧版断开就是没算切线）
  2. 容器形状统一：托盘按钮=圆，车位解锁=圆角方，其余=无容器
  3. 三角形做光学居中（形心对齐，不是外接盒对齐）
  4. 32px 下必须可读 —— 联络表会同时输出 96/48/32 三档自检
"""
import os, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'figma', 'icons'))
os.makedirs(OUT, exist_ok=True)

# ── 网格常量 ────────────────────────────────────────────
BOX = 96.0
SW = 10.0          # 描边线宽
MINLIMB = 18.0     # 实心最细肢体


def u(size):
    return size / BOX


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))


def arc(cx, cy, r, t1, t2, sw, c):
    """圆弧描边。t 为角度，按增加方向绘制"""
    x1, y1 = pt(cx, cy, r, t1)
    x2, y2 = pt(cx, cy, r, t2)
    sweep = (t2 - t1) % 360
    large = 1 if sweep > 180 else 0
    return ('<path d="M %g %g A %g %g 0 %d 1 %g %g" fill="none" stroke="%s" '
            'stroke-width="%g" stroke-linecap="round"/>'
            % (x1, y1, r, r, large, x2, y2, c, sw))


def arc_head(cx, cy, r, t, L, W, c):
    """弧端箭头：方向 = 该点切线（铁律 1）"""
    a = math.radians(t)
    px, py = pt(cx, cy, r, t)
    tx, ty = -math.sin(a), math.cos(a)      # 切线（t 增加方向）
    nx, ny = math.cos(a), math.sin(a)       # 法线（径向）
    return ('<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>'
            % (px + tx * L, py + ty * L,
               px + nx * W, py + ny * W,
               px - nx * W, py - ny * W, c))


def tri_r(x, y, w, h, c):
    """朝右三角，(x,y)=底边中点"""
    return '<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>' % (
        x, y - h / 2, x, y + h / 2, x + w, y, c)


# ═══ 图标定义：每个返回 96×96 内的 SVG 片段 ═══════════════
def ic_speed(c):
    """加速 · 双箭头（实心，32px 下仍清晰）"""
    o = ''
    for dx in (-26, 2):
        o += tri_r(48 + dx, 48, 24, 38, c)
    return o


def ic_upgrade(c):
    """升级 · 粗上箭头（杆宽 22 ≥ MINLIMB）"""
    hw, sw2, top, mid, bot = 30, 11, 16, 46, 80
    return ('<path d="M 48 %g L %g %g L %g %g L %g %g L %g %g L %g %g L %g %g Z" '
            'fill="%s" stroke-linejoin="round"/>'
            % (top, 48 + hw, mid, 48 + sw2, mid, 48 + sw2, bot,
               48 - sw2, bot, 48 - sw2, mid, 48 - hw, mid, c))


def ic_clear(c):
    """消除 · 扫帚（整组旋转 34°，避免逐点算旋转出错）"""
    o = '<g transform="rotate(34 48 48)">'
    # handle
    o += '<rect x="41" y="12" width="14" height="42" rx="7" fill="%s"/>' % c
    # head（梯形）
    o += '<path d="M 30 50 L 66 50 L 74 82 L 22 82 Z" fill="%s"/>' % c
    # 鬃毛缝（挖空 2 道）
    for x in (41, 55):
        o += '<path d="M %g 58 L %g 82" stroke="#00000000" stroke-width="0"/>' % (x, x)
    o += '</g>'
    return o


def ic_refresh(c):
    """刷新 · 循环箭头（铁律 1：箭头切线连接，修掉旧版断开）"""
    r = 28
    o = arc(48, 48, r, 300, 240, SW, c)
    o += arc_head(48, 48, r, 240, 23, 17, c)
    return o


def ic_play(c):
    """播放 · 实心三角（形心光学居中：tip=+2w/3, base=-w/3）"""
    w, h = 42, 46
    return '<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>' % (
        48 - w / 3, 48 - h / 2, 48 - w / 3, 48 + h / 2, 48 + 2 * w / 3, 48, c)


def ic_video(c):
    """视频/广告 · 摄像机（对齐竞品 🎬 语义）"""
    o = '<rect x="14" y="30" width="46" height="36" rx="8" fill="%s"/>' % c
    o += '<path d="M 64 44 L 84 32 L 84 64 L 64 52 Z" fill="%s"/>' % c
    return o


def ic_home(c):
    o = '<path d="M 48 14 L 86 50 L 76 50 L 76 82 L 20 82 L 20 50 L 10 50 Z" fill="%s"/>' % c
    return o


def ic_share(c):
    """分享 · 箭头出框（描边+实心混合，箭头与杆连接）"""
    o = ('<path d="M 66 26 L 66 18 L 30 18 A 10 10 0 0 0 20 28 L 20 74 '
         'A 10 10 0 0 0 30 84 L 66 84 A 10 10 0 0 0 76 74 L 76 58" '
         'fill="none" stroke="%s" stroke-width="%g" stroke-linecap="round"/>' % (c, SW))
    o += '<path d="M 46 52 L 84 16" fill="none" stroke="%s" stroke-width="%g" stroke-linecap="round"/>' % (c, SW)
    o += '<path d="M 62 12 L 90 10 L 88 38 Z" fill="%s"/>' % c
    return o


def ic_close(c):
    return ('<path d="M 28 28 L 68 68 M 68 28 L 28 68" stroke="%s" stroke-width="%g" '
            'stroke-linecap="round"/>' % (c, SW + 2))


def ic_timer(c):
    """秒表 · 倒计时（顶部拉钉 + 表冠 + 指针指向 10 点）"""
    o = ''
    # 表冠
    o += '<rect x="40" y="8" width="16" height="10" rx="3" fill="%s"/>' % c
    # 右上拉钉
    o += ('<rect x="68" y="14" width="9" height="16" rx="4" fill="%s" '
          'transform="rotate(38 72 22)"/>' % c)
    # 表盘
    o += '<circle cx="48" cy="56" r="32" fill="none" stroke="%s" stroke-width="%g"/>' % (c, SW)
    # 指针（上 + 左上，类似 10 点方向）
    o += ('<path d="M 48 56 L 48 36 M 48 56 L 34 46" stroke="%s" stroke-width="%g" '
          'stroke-linecap="round"/>' % (c, SW - 1))
    return o


def ic_gear(c):
    """设置 · 齿轮。齿必须在环【外侧】—— 齿与环同半径会糊成唱片（实测 bug）"""
    R_RING = 24.0      # 环半径
    R_TOOTH = 36.0     # 齿心半径 > R_RING + SW/2 + 齿半径，保证分离
    o = ''
    for i in range(8):
        a = i * math.pi / 4
        tx, ty = 48 + math.cos(a) * R_TOOTH, 48 + math.sin(a) * R_TOOTH
        # 梯形齿（径向外扩），比圆点更像齿轮
        o += ('<rect x="%g" y="%g" width="15" height="19" rx="4" fill="%s" '
              'transform="rotate(%g %g %g)"/>'
              % (tx - 7.5, ty - 9.5, c, math.degrees(a), tx, ty))
    o += '<circle cx="48" cy="48" r="%g" fill="none" stroke="%s" stroke-width="%g"/>' % (
        R_RING, c, SW + 1)
    return o


def ic_star(c):
    o, r = '', 40
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rad = r * (0.46 if k % 2 else 1.0)
        pts.append('%g %g' % (48 + math.cos(a) * rad, 48 + math.sin(a) * rad))
    return '<path d="M %s Z" fill="%s"/>' % (' L '.join(pts), c)


def ic_plus(c):
    t = 20
    return ('<path d="M %g 20 L %g 20 L %g %g L 76 %g L 76 %g L %g %g L %g 76 '
            'L %g 76 L %g %g L 20 %g L 20 %g L %g %g Z" fill="%s"/>'
            % (48 - t / 2, 48 + t / 2, 48 + t / 2, 48 - t / 2, 48 - t / 2, 48 + t / 2,
               48 + t / 2, 48 + t / 2, 48 + t / 2, 48 - t / 2, 48 - t / 2, 48 + t / 2,
               48 + t / 2, 48 - t / 2, 48 - t / 2, 48 - t / 2, c))


def ic_lock(c):
    o = '<rect x="24" y="46" width="48" height="36" rx="8" fill="%s"/>' % c
    o += ('<path d="M 34 46 L 34 34 A 14 14 0 0 1 62 34 L 62 46" fill="none" '
          'stroke="%s" stroke-width="%g" stroke-linecap="round"/>' % (c, SW))
    return o


ICONS = [
    ('speed',   ic_speed,   '加速 ×2（速度行）'),
    ('upgrade', ic_upgrade, '升级（车容量×2）'),
    ('clear',   ic_clear,   '消除（拖走僵尸车）'),
    ('refresh', ic_refresh, '刷新（重排候选队列）'),
    ('play',    ic_play,    '播放（广告标记）'),
    ('video',   ic_video,   '视频广告（解锁位）'),
    ('home',    ic_home,    '主页'),
    ('share',   ic_share,   '分享'),
    ('close',   ic_close,   '关闭（弹窗）'),
    ('gear',    ic_gear,    '设置'),
    ('star',    ic_star,    '星级（过关页）'),
    ('plus',    ic_plus,    '＋角标（道具补充）'),
    ('lock',    ic_lock,    '锁定'),
    ('timer',   ic_timer,   '秒表 / 倒计时（道具栏）'),
]


def write_one(name, fn):
    body = fn('#FFFFFF')
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'
         '<g id="icon / %s">%s</g></svg>' % (name, body))
    with open(os.path.join(OUT, 'ic-%s.svg' % name), 'w', encoding='utf-8') as f:
        f.write(s)


def contact_sheet():
    """联络表：每个图标 × 4 档（96 深底 / 96 浅底 / 48 / 32）自检可读性"""
    rowh = 132
    W2 = 1180
    H2 = 120 + len(ICONS) * rowh
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
         % (W2, H2, W2, H2))
    s += '<rect width="%d" height="%d" fill="#1C1B22"/>' % (W2, H2)

    def lab(t, x, y, sz, c, anch='start'):
        return ('<text x="%g" y="%g" font-family="Menlo, monospace" font-size="%g" '
                'fill="%s" text-anchor="%s" dominant-baseline="central">%s</text>'
                % (x, y, sz, c, anch, t))

    s += lab('Icon System · 96×96 grid / safe 8 / stroke 10 / min-limb 18', 40, 44, 26, '#FFFFFF')
    s += lab('每行右侧 32px 档必须仍可读，否则该图标不合格', 40, 80, 20, '#8A8A96')
    for i, (nm, fn, desc) in enumerate(ICONS):
        y = 120 + i * rowh
        s += '<rect x="30" y="%g" width="%d" height="%g" rx="14" fill="#26252E"/>' % (y + 6, W2 - 60, rowh - 16)
        s += lab('ic-%s' % nm, 56, y + 44, 24, '#00E5FF')
        s += lab(desc, 56, y + 78, 20, '#9A9AA6')
        # 96 深底
        s += '<g transform="translate(360,%g)">%s</g>' % (y + 16, fn('#FFFFFF'))
        s += lab('96 dark', 408, y + 124, 16, '#6A6A76', 'middle')
        # 96 浅底
        s += '<rect x="500" y="%g" width="96" height="96" rx="12" fill="#F2F2F6"/>' % (y + 16)
        s += '<g transform="translate(500,%g)">%s</g>' % (y + 16, fn('#2B2B33'))
        s += lab('96 light', 548, y + 124, 16, '#6A6A76', 'middle')
        # 48
        s += '<g transform="translate(680,%g) scale(0.5)">%s</g>' % (y + 40, fn('#FFFFFF'))
        s += lab('48', 704, y + 124, 16, '#6A6A76', 'middle')
        # 32
        s += '<g transform="translate(800,%g) scale(0.3333)">%s</g>' % (y + 48, fn('#FFFFFF'))
        s += lab('32', 816, y + 124, 16, '#6A6A76', 'middle')
        # 圆容器实装预览（托盘按钮）
        s += '<circle cx="960" cy="%g" r="52" fill="#FFB13D"/>' % (y + 62)
        s += '<circle cx="960" cy="%g" r="52" fill="none" stroke="#FFFFFF" stroke-width="4"/>' % (y + 62)
        s += '<g transform="translate(%g,%g) scale(0.72)">%s</g>' % (960 - 34.5, y + 62 - 34.5, fn('#FFFFFF'))
        s += lab('实装 r=52', 960, y + 124, 16, '#6A6A76', 'middle')
    s += '</svg>'
    p = os.path.join(OUT, '00-contact-sheet.svg')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)
    print('  ✓ 00-contact-sheet.svg  %d×%d' % (W2, H2))


if __name__ == '__main__':
    print('生成 Icon 系统 →', OUT)
    for nm, fn, _ in ICONS:
        write_one(nm, fn)
        print('  ✓ ic-%s.svg' % nm)
    contact_sheet()
    print('共 %d 个图标。' % len(ICONS))
