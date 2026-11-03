#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成可导入 Figma 的分层 SVG 画板（拼豆装车 · 快来帮帮我）
- 每个 <g id="..."> 在 Figma 里会变成同名 Group 图层
- 全部矢量，导入后可直接改色/挪位/量尺寸
产出：docs/design/figma/*.svg
"""
import os, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'figma')
OUT = os.path.normpath(OUT)
os.makedirs(OUT, exist_ok=True)

W, H = 750, 1624

# ── Design Token ───────────────────────────────────────────
T = {
    'bg':        '#6E6E75', 'wedge': '#8A8A92',
    'panel':     '#55506A', 'panelHi': '#6B6484', 'tray': '#C9B8E8',
    'green':     '#6CC24A', 'greenEdge': '#3E8E1E',
    'yellow':    '#FFB13D', 'yellowEdge': '#D98A1E',
    'blue':      '#2E9BE8', 'blueLite': '#5BB8F5', 'blueEdge': '#1B6FB0',
    'red':       '#E8352B', 'redEdge': '#B01F17',
    'white':     '#FFFFFF', 'cardEdge': '#7EC8F0',
    'onWhite':   '#1B4C8C', 'accent': '#E23B2E',
    'slotLine':  'rgba(255,255,255,.62)',
}
BEAN = {
    'black':  ('#2B2B33', '#15151A'),
    'white':  ('#FDFCFA', '#D2CEC8'),
    'pink':   ('#FF6FB5', '#D64992'),
    'cyan':   ('#6FD8F0', '#3FA8C8'),
    'yellow': ('#FFD24A', '#D9A81E'),
    'green':  ('#6ED16E', '#3FA44A'),
    'red':    ('#F04A4A', '#C22E2E'),
}
# 布局网格
G = {
    'hud':      (0, 130),
    'art':      (151, 800),
    'lane':     (800, 928),
    'slot':     (928, 1073),
    'speed':    (1073, 1206),
    'queue':    (1206, 1490),
    'tray':     (1490, 1624),
}
SLOT = dict(x0=36, w=104, h=130, gap=12, y=934)
# row1 top=1220 bottom=1346 / row2 top=1358 bottom=1471  → 全部落在 panel 内
QCAR = dict(w=96, h=126, gap=40, row1=1283, row2=1414)
BTN  = dict(r=52, cx=[188, 375, 562], cy=1526)   # label \u5e95 = 1526+52+22+14 = 1614 < 1624


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


# ── 矢量图标（禁用 emoji：多数环境/Figma 字体无法渲染，会变成空框）──
def icon(kind, cx, cy, s, fill='#FFFFFF', stroke='rgba(0,0,0,.35)', sw=0):
    """s = 图标外接尺寸"""
    h = s / 2
    st = ' stroke="%s" stroke-width="%g"' % (stroke, sw) if sw else ''
    if kind == 'play':
        return '<path d="M %g %g L %g %g L %g %g Z" fill="%s"%s/>' % (
            cx - h * 0.7, cy - h, cx - h * 0.7, cy + h, cx + h * 0.85, cy, fill, st)
    if kind == 'ff':   # 快进双三角
        o = ''
        for dx in (-h * 0.85, h * 0.05):
            o += '<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>' % (
                cx + dx, cy - h * 0.8, cx + dx, cy + h * 0.8, cx + dx + h * 0.8, cy, fill)
        return o
    if kind == 'up':
        return ('<path d="M %g %g L %g %g L %g %g L %g %g L %g %g L %g %g L %g %g Z" '
                'fill="%s"%s/>' % (cx, cy - h, cx + h, cy, cx + h * 0.42, cy,
                                   cx + h * 0.42, cy + h, cx - h * 0.42, cy + h,
                                   cx - h * 0.42, cy, cx - h, cy, fill, st))
    if kind == 'home':
        return ('<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>'
                '<rect x="%g" y="%g" width="%g" height="%g" rx="3" fill="%s"/>'
                % (cx, cy - h, cx + h, cy + h * 0.05, cx - h, cy + h * 0.05, fill,
                   cx - h * 0.62, cy + h * 0.05, h * 1.24, h * 0.95, fill))
    if kind == 'brush':
        return ('<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" '
                'transform="rotate(38 %g %g)"/>'
                '<path d="M %g %g L %g %g L %g %g Z" fill="%s" transform="rotate(38 %g %g)"/>'
                % (cx - h * 0.20, cy - h * 0.95, h * 0.40, h * 1.30, h * 0.14, fill, cx, cy,
                   cx - h * 0.24, cy + h * 0.35, cx + h * 0.24, cy + h * 0.35, cx, cy + h, fill, cx, cy))
    if kind == 'refresh':
        r = h * 0.72
        return ('<path d="M %g %g A %g %g 0 1 1 %g %g" fill="none" stroke="%s" '
                'stroke-width="%g" stroke-linecap="round"/>'
                '<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>'
                % (cx + r * 0.1, cy - r, r, r, cx - r * 0.55, cy + r * 0.83, fill, h * 0.34,
                   cx + r * 0.1, cy - r * 1.5, cx + r * 0.95, cy - r * 0.72,
                   cx - r * 0.28, cy - r * 0.5, fill))
    if kind == 'share':
        return ('<path d="M %g %g L %g %g L %g %g" fill="none" stroke="%s" stroke-width="%g" '
                'stroke-linecap="round" stroke-linejoin="round"/>'
                '<path d="M %g %g L %g %g L %g %g Z" fill="%s"/>'
                % (cx - h * 0.75, cy + h * 0.75, cx + h * 0.35, cy - h * 0.4,
                   cx + h * 0.35, cy - h * 0.4, fill, h * 0.30,
                   cx + h * 0.15, cy - h * 0.9, cx + h * 0.9, cy - h * 0.75,
                   cx + h * 0.62, cy - h * 0.05, fill))
    if kind == 'close':
        return ('<path d="M %g %g L %g %g M %g %g L %g %g" stroke="%s" stroke-width="%g" '
                'stroke-linecap="round"/>'
                % (cx - h * 0.6, cy - h * 0.6, cx + h * 0.6, cy + h * 0.6,
                   cx + h * 0.6, cy - h * 0.6, cx - h * 0.6, cy + h * 0.6, fill, h * 0.42))
    return ''


def txt(s, x, y, size, fill, stroke=None, sw=6, weight='700', anchor='middle'):
    """双层文字：先描边后填充（Figma 里是两个 text 图层，可分别改）"""
    common = ('font-family="PingFang SC, Helvetica Neue, sans-serif" '
              'font-size="%d" font-weight="%s" text-anchor="%s" '
              'dominant-baseline="central"' % (size, weight, anchor))
    out = ''
    if stroke:
        out += ('<text x="%g" y="%g" %s fill="none" stroke="%s" stroke-width="%g" '
                'stroke-linejoin="round">%s</text>' % (x, y, common, stroke, sw, esc(s)))
    out += '<text x="%g" y="%g" %s fill="%s">%s</text>' % (x, y, common, fill, esc(s))
    return out


def bean(x, y, sz, color, alpha=1.0):
    """拼豆小人：暗底边 + 主体 + 黑描边 + 顶部高光（R7）"""
    main, side = BEAN[color]
    w = sz
    h = sz
    r = sz * 0.26
    x0, y0 = x - w / 2, y - h / 2
    o = '<g opacity="%g">' % alpha
    # 底部挤出暗边
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (
        x0, y0 + h * 0.16, w, h * 0.84, r, side)
    # 主体
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" stroke="#000000" stroke-opacity="0.55" stroke-width="2.5"/>' % (
        x0, y0, w, h * 0.84, r, main)
    # 顶面高光
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#FFFFFF" fill-opacity="0.42"/>' % (
        x0 + w * 0.17, y0 + h * 0.11, w * 0.34, h * 0.19, h * 0.09)
    o += '</g>'
    return o


def car(cx, cy, w, h, color, num, door=0.0, dim=False, num_size=None):
    """俯视车：纵向 h>w，圆角 16%（R1 / 修正 ④）"""
    main, side = BEAN[color]
    x0, y0 = cx - w / 2, cy - h / 2
    r = w * 0.16
    o = ''
    # 车门（向两侧张开的白内衬）
    if door > 0.02:
        dw, dh = w * 0.30, h * 0.30
        ang = door * 48
        for s in (-1, 1):
            px = cx + s * w * 0.44
            o += ('<g transform="translate(%g,%g) rotate(%g)">'
                  '<rect x="%g" y="0" width="%g" height="%g" rx="5" fill="#F2F2F4" '
                  'stroke="#000000" stroke-opacity="0.18" stroke-width="2"/></g>'
                  % (px, y0 + h * 0.18, s * ang, (-dw if s < 0 else 0), dw, dh))
    # 轮子
    wr = w * 0.10
    for wy in (y0 + h * 0.20, y0 + h * 0.70):
        o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#2A2730"/>' % (
            x0 - wr * 0.6, wy, wr * 1.4, h * 0.14, wr * 0.6)
        o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#2A2730"/>' % (
            x0 + w - wr * 0.8, wy, wr * 1.4, h * 0.14, wr * 0.6)
    # 挤出暗底边 + 车身
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (
        x0, y0 + 8, w, h, r, side)
    o += ('<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" '
          'stroke="#000000" stroke-opacity="0.30" stroke-width="2.5"/>' % (x0, y0, w, h, r, main))
    # 前后挡风
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#ECF0F6" fill-opacity="0.95"/>' % (
        x0 + w * 0.15, y0 + h * 0.06, w * 0.70, h * 0.14, w * 0.08)
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#ECF0F6" fill-opacity="0.90"/>' % (
        x0 + w * 0.19, y0 + h * 0.80, w * 0.62, h * 0.10, w * 0.07)
    # 车顶中缝
    o += '<rect x="%g" y="%g" width="%g" height="%g" fill="#000000" fill-opacity="0.13"/>' % (
        cx - w * 0.012, y0 + h * 0.24, w * 0.024, h * 0.50)
    if num is not None:
        ns = num_size or round(h * 0.34)
        o += txt(str(num), cx, cy, ns, '#FFFFFF', 'rgba(0,0,0,.62)', 6)
    if dim:
        o = '<g opacity="0.42">' + o + '</g>'
    return o


def pill(cx, cy, w, h, face, edge, label, fs, ext=9, ico=None):
    """3D 挤出胶囊按钮（R1）。ico = 矢量图标名，画在文字左侧"""
    r = h / 2
    o = '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (
        cx - w / 2, cy - h / 2 + ext, w, h, r, edge)
    o += ('<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" '
          'stroke="#FFFFFF" stroke-width="3"/>' % (cx - w / 2, cy - h / 2, w, h, r, face))
    o += '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#FFFFFF" fill-opacity="0.28"/>' % (
        cx - w / 2 + 8, cy - h / 2 + 7, w - 16, h * 0.26, h * 0.13)
    if ico:
        tw = len(label) * fs * 0.92
        ix = cx - tw / 2 - fs * 0.36
        o += icon(ico, ix, cy, fs * 0.94)
        o += txt(label, cx + fs * 0.42, cy, fs, '#FFFFFF', 'rgba(0,0,0,.45)', 6)
    else:
        o += txt(label, cx, cy, fs, '#FFFFFF', 'rgba(0,0,0,.45)', 6)
    return o


def circle_btn(cx, cy, r, face, edge, glyph, label, badge='+'):
    """底部圆形道具按钮 + 红底白 + 角标（修正 ⑦）。glyph = 矢量图标名"""
    o = '<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (cx, cy + 8, r, edge)
    o += '<circle cx="%g" cy="%g" r="%g" fill="%s" stroke="#FFFFFF" stroke-width="4"/>' % (cx, cy, r, face)
    o += '<circle cx="%g" cy="%g" r="%g" fill="#FFFFFF" fill-opacity="0.26"/>' % (cx, cy - r * 0.34, r * 0.52)
    o += icon(glyph, cx, cy - 2, r * 0.92)
    o += txt(label, cx, cy + r + 22, 28, '#FFFFFF', 'rgba(0,0,0,.5)', 6)
    if badge:
        bx, by = cx + r * 0.78, cy - r * 0.78
        o += '<circle cx="%g" cy="%g" r="19" fill="%s" stroke="#FFFFFF" stroke-width="3"/>' % (bx, by, T['red'])
        o += txt(badge, bx, by, 24, '#FFFFFF')
    return o


# ── 图案：冰淇淋像素画（黑描边，对齐竞品 R7）─────────────
SUNDAE = [
    '..........kkkkkk......',
    '.......k..krrrrrk.....',
    '......kyk.krrrrwrk....',
    '.....kyyk.krrrrrrk....',
    '....kyykkkkkkkkkkkk...',
    '...kyykwwwwwwwwwwwwk..',
    '..kyykwwwwwwwwwwwwwwk.',
    '.kyykwwwwwrrrrwwwwwwk.',
    'kkkkwwwwwwrrrrrwwwwwwk',
    'kppppwwwwwwwwwwwwwwppk',
    'kpppppppppppppppppppgk',
    'kppppppppppppppppppggk',
    'kppppppppppppppppppggk',
    'kcccccccccccccccccccck',
    'kccccccccyyyycccccccck',
    'kccccccccccccccccccck.',
    '.kcccccccccccccccccck.',
    '..kkccccccccccccccckk.',
    '....kkkcccccccckkk....',
    '.......kkccccckk......',
    '.........kcccck.......',
    '.........kcccck.......',
    '......kkkkcccckkkk....',
    '.....kcccccccccccck...',
    '.....kcccccccccccck...',
    '......kkkkkkkkkkkk....',
]
CMAP = {'k': 'black', 'w': 'white', 'p': 'pink', 'c': 'cyan',
        'r': 'red', 'y': 'yellow', 'g': 'green'}


def art_layer(hide_cells=None):
    """图案区：26 行 × 22 列，铺进 art 区（151–800）"""
    rows, cols = len(SUNDAE), max(len(r) for r in SUNDAE)
    y0, y1 = G['art']
    cell = min((y1 - y0) / rows, 640 / cols)
    ox = W / 2 - cols * cell / 2 + cell / 2
    oy = y0 + cell / 2
    o = []
    for r, line in enumerate(SUNDAE):
        for c, ch in enumerate(line):
            col = CMAP.get(ch)
            if not col:
                continue
            if hide_cells and (r, c) in hide_cells:
                continue
            o.append(bean(ox + c * cell, oy + r * cell, cell - 1.5, col))
    return ''.join(o), cell, ox, oy


def bg_layer(portrait_reveal=None):
    """背景：R5 沉默灰 + 右上楔形。portrait_reveal 给出立绘显影层示意"""
    o = '<g id="BG / base"><rect width="%d" height="%d" fill="%s"/>' % (W, H, T['bg'])
    o += '<path d="M %d 0 L %d 0 L %d %d Z" fill="%s"/>' % (W, 380, W, 470, T['wedge'])
    o += '</g>'
    if portrait_reveal is not None:
        o += ('<g id="BG / portrait-reveal (bright %.2f, blur %dpx)" opacity="0.30">'
              '<rect x="0" y="%d" width="%d" height="%d" fill="#B98A9A"/>'
              '<text x="%d" y="%d" font-family="PingFang SC" font-size="24" fill="#FFFFFF" '
              'fill-opacity="0.75" text-anchor="middle">立绘显影层占位 · brightness %.2f / blur %dpx</text></g>'
              % (portrait_reveal[0], portrait_reveal[1], G['hud'][1], W, G['slot'][0] - G['hud'][1],
                 W // 2, G['hud'][1] + 40, portrait_reveal[0], portrait_reveal[1]))
    return o


def hud_layer(level=2):
    o = '<g id="HUD">'
    # 齿轮
    o += '<circle cx="62" cy="66" r="40" fill="%s" stroke="#FFFFFF" stroke-width="5"/>' % T['blue']
    for i in range(8):
        a = i * math.pi / 4
        o += '<circle cx="%g" cy="%g" r="5.5" fill="#FFFFFF"/>' % (62 + math.cos(a) * 18, 66 + math.sin(a) * 18)
    o += '<circle cx="62" cy="66" r="9" fill="%s"/>' % T['blue']
    # 关卡胶囊
    o += '<rect x="%g" y="36" width="184" height="58" rx="29" fill="#464650" fill-opacity="0.82"/>' % (W / 2 - 92)
    o += txt('关卡 %d' % level, W / 2, 65, 34, '#FFFFFF')
    # 系统胶囊（平台绘制，仅占位标注）
    o += '<g id="HUD / system-capsule (平台绘制 · 勿实现)" opacity="0.5">'
    o += '<rect x="556" y="40" width="58" height="52" rx="26" fill="#FFFFFF" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="2"/>'
    o += '<rect x="624" y="40" width="100" height="52" rx="26" fill="#FFFFFF" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="2"/>'
    o += '</g></g>'
    return o


def slots_layer(cars=None):
    """车位行：5 空位 + 解锁位（修正 ⑤：落在自己的沉默底上）"""
    cars = cars or {}
    o = '<g id="Slots / row">'
    for i in range(5):
        x = SLOT['x0'] + i * (SLOT['w'] + SLOT['gap'])
        cx, cy = x + SLOT['w'] / 2, SLOT['y'] + SLOT['h'] / 2
        if i in cars:
            col, num, door = cars[i]
            o += '<g id="Slots / slot-%d (%s %s)">' % (i + 1, col, num)
            o += car(cx, cy, SLOT['w'] - 8, SLOT['h'] - 16, col, num, door)
            o += '</g>'
        else:
            o += ('<g id="Slots / slot-%d empty"><rect x="%g" y="%g" width="%g" height="%g" rx="16" '
                  'fill="none" stroke="#FFFFFF" stroke-opacity="0.62" stroke-width="4" '
                  'stroke-dasharray="11 9"/></g>' % (i + 1, x, SLOT['y'], SLOT['w'], SLOT['h']))
    # 解锁位
    ux = SLOT['x0'] + 5 * (SLOT['w'] + SLOT['gap'])
    o += '<g id="Slots / slot-6 locked (AD)">'
    o += '<rect x="%g" y="%g" width="98" height="%g" rx="16" fill="#3A3742" fill-opacity="0.78" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="3"/>' % (
        ux, SLOT['y'], SLOT['h'])
    o += '<rect x="%g" y="%g" width="44" height="30" rx="7" fill="#FFFFFF"/>' % (ux + 49 - 26, SLOT['y'] + 34)
    o += '<path d="M %g %g L %g %g L %g %g Z" fill="#FFFFFF"/>' % (
        ux + 49 + 20, SLOT['y'] + 44, ux + 49 + 34, SLOT['y'] + 37, ux + 49 + 34, SLOT['y'] + 61)
    o += txt('解锁', ux + 49, SLOT['y'] + 96, 30, '#FFFFFF', 'rgba(0,0,0,.5)', 5)
    o += '</g></g>'
    return o


def speed_layer():
    """速度行：独占一行（修正 ③）"""
    y0, y1 = G['speed']
    cy = (y0 + y1) / 2
    o = '<g id="Speed / row (独占, 修正 spdRect x btnRect 38px 重叠)">'
    o += '<rect x="36" y="%g" width="176" height="72" rx="16" fill="#FFFFFF"/>' % (cy - 36)
    o += '<rect x="36" y="%g" width="176" height="72" rx="16" fill="none" stroke="#000000" stroke-opacity="0.18" stroke-width="3"/>' % (cy - 36)
    o += txt('速度x2', 132, cy, 30, T['onWhite'])
    o += icon('ff', 68, cy, 34, T['onWhite'])
    o += '<rect x="176" y="%g" width="38" height="26" rx="7" fill="%s" stroke="#FFFFFF" stroke-width="2"/>' % (cy - 46, T['red'])
    o += icon('play', 195, cy - 33, 16)
    o += '</g>'
    return o


def queue_layer(row1, row2):
    o = '<g id="Queue / panel">'
    y0, y1 = G['queue']
    o += '<rect x="0" y="%d" width="%d" height="%d" fill="%s"/>' % (y0, W, H - y0, T['panel'])
    o += '<rect x="0" y="%d" width="%d" height="3" fill="#FFFFFF" fill-opacity="0.16"/>' % (y0, W)
    o += '</g>'
    tw = 4 * QCAR['w'] + 3 * QCAR['gap']
    x0 = (W - tw) / 2
    o += '<g id="Queue / row-1 (draggable)">'
    for i, (col, num) in enumerate(row1):
        cx = x0 + i * (QCAR['w'] + QCAR['gap']) + QCAR['w'] / 2
        o += '<g id="Queue / r1-%d %s %s">%s</g>' % (i + 1, col, num, car(cx, QCAR['row1'], QCAR['w'], QCAR['h'], col, num))
    o += '</g><g id="Queue / row-2 (preview, dim)">'
    for i, (col, num) in enumerate(row2):
        cx = x0 + i * (QCAR['w'] + QCAR['gap']) + QCAR['w'] / 2
        o += '<g id="Queue / r2-%d %s %s">%s</g>' % (i + 1, col, num, car(cx, QCAR['row2'], QCAR['w'] * 0.9, QCAR['h'] * 0.9, col, num, 0, True))
    o += '</g>'
    return o


def tray_layer():
    """按钮托盘：坐到最下沿（修正 ④ 消除 158px 死区）"""
    y0 = G['tray'][0]
    o = '<g id="Tray / bg"><rect x="-20" y="%d" width="%d" height="%d" rx="40" fill="%s"/></g>' % (
        y0, W + 40, H - y0 + 40, T['tray'])
    o += '<g id="Tray / buttons">'
    specs = [(T['yellow'], T['yellowEdge'], 'up', '升级'),
             (T['yellow'], T['yellowEdge'], 'brush', '消除'),
             (T['blue'],   T['blueEdge'],   'refresh', '刷新')]
    for cx, (f, e, gl, lb) in zip(BTN['cx'], specs):
        o += '<g id="Tray / btn-%s">%s</g>' % (lb, circle_btn(cx, BTN['cy'], BTN['r'], f, e, gl, lb))
    o += '</g>'
    return o


def guide_layer():
    """标注层：网格线 + 区域名（Figma 里可整组隐藏）"""
    o = '<g id="__GUIDES__ (可隐藏)" opacity="0.85">'
    for name, (a, b) in G.items():
        o += '<rect x="0" y="%g" width="%d" height="%g" fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-dasharray="8 6"/>' % (
            a, W, b - a)
        o += ('<text x="8" y="%g" font-family="Menlo, monospace" font-size="19" fill="#00E5FF">'
              '%s  %d–%d  (%.1f%%)</text>' % (a + 22, name, a, b, (b - a) / H * 100))
    o += '</g>'
    return o


def svg(name, body, w=W, h=H):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
         'viewBox="0 0 %d %d">' % (w, h, w, h))
    s += '<g id="%s">%s</g></svg>' % (name, body)
    p = os.path.join(OUT, name + '.svg')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)
    print('  ✓ %-34s %d×%d  %6.1f KB' % (name + '.svg', w, h, len(s) / 1024))


# ═══ 画板 1：玩法主页 ═══════════════════════════════════
def board_play():
    a, cell, ox, oy = art_layer()
    b = bg_layer(portrait_reveal=(0.55, 8))
    b += hud_layer()
    b += '<g id="Art / pixel-pattern (sundae 26x22, cell %.1f)">%s</g>' % (cell, a)
    # 行走通道：一列青豆排队走向车位
    b += '<g id="Lane / walking-beans (排队行走)">'
    lane_x = SLOT['x0'] + 2 * (SLOT['w'] + SLOT['gap']) + SLOT['w'] / 2
    for i in range(5):
        b += bean(lane_x, G['lane'][0] + 12 + i * (cell + 6), cell - 2, 'cyan', 1 - i * 0.05)
    b += '</g>'
    b += slots_layer(cars={2: ('cyan', 21, 1.0), 4: ('cyan', 5, 1.0)})
    b += speed_layer()
    b += queue_layer([('pink', 14), ('black', 12), ('cyan', 19), ('black', 16)],
                     [('red', 27), ('cyan', 16), ('pink', 19), ('cyan', 18)])
    b += tray_layer()
    b += guide_layer()
    svg('01-play', b)


# ═══ 画板 2：复活弹窗 ═══════════════════════════════════
def board_revive():
    a, cell, ox, oy = art_layer()
    b = bg_layer()
    b += hud_layer()
    b += '<g id="Art / pixel-pattern" opacity="0.75">%s</g>' % a
    b += slots_layer(cars={0: ('black', 25, 0), 4: ('pink', 30, 0)})
    b += speed_layer()
    b += queue_layer([('pink', 14), ('pink', 22), ('cyan', 18), ('cyan', 21)],
                     [('red', 27), ('white', 16), ('cyan', 30), ('black', 16)])
    b += tray_layer()
    # 遮罩
    b += '<g id="Modal / scrim"><rect width="%d" height="%d" fill="#0E0C14" fill-opacity="0.55"/></g>' % (W, H)
    # 白卡
    cw, ch = 500, 700
    cx, cy = W / 2, 760
    x0, y0 = cx - cw / 2, cy - ch / 2
    b += '<g id="Modal / card">'
    b += '<rect x="%g" y="%g" width="%g" height="%g" rx="28" fill="%s" stroke="%s" stroke-width="4"/>' % (
        x0, y0, cw, ch, T['white'], T['cardEdge'])
    b += '</g>'
    # 骑跨标题条（R3）
    tw2, th2 = 420, 96
    b += '<g id="Modal / title-bar (骑跨白卡上沿)">'
    b += '<rect x="%g" y="%g" width="%g" height="%g" rx="24" fill="%s"/>' % (
        cx - tw2 / 2, y0 - th2 / 2 + 8, tw2, th2, T['blueEdge'])
    b += '<rect x="%g" y="%g" width="%g" height="%g" rx="24" fill="%s" stroke="#FFFFFF" stroke-width="4"/>' % (
        cx - tw2 / 2, y0 - th2 / 2, tw2, th2, T['blueLite'])
    b += '<rect x="%g" y="%g" width="%g" height="%g" rx="14" fill="#FFFFFF" fill-opacity="0.30"/>' % (
        cx - tw2 / 2 + 10, y0 - th2 / 2 + 9, tw2 - 20, 26)
    b += txt('复活', cx, y0, 52, '#FFFFFF', 'rgba(0,0,0,.35)', 6)
    b += '</g>'
    # 框外红 X（R3）
    b += '<g id="Modal / close-X (白卡外侧)">'
    b += '<circle cx="%g" cy="%g" r="34" fill="%s"/>' % (x0 + cw - 4, y0 + 44, T['redEdge'])
    b += '<circle cx="%g" cy="%g" r="32" fill="%s" stroke="#FFFFFF" stroke-width="4"/>' % (x0 + cw - 4, y0 + 40, T['red'])
    b += icon('close', x0 + cw - 4, y0 + 40, 34)
    b += '</g>'
    # 天使爱心
    hx, hy = cx, cy - 90
    b += '<g id="Modal / icon-angel-heart">'
    b += '<ellipse cx="%g" cy="%g" rx="66" ry="17" fill="none" stroke="#FFC93D" stroke-width="13"/>' % (hx, hy - 118)
    # 翅膀：三片羽叠出弧形（左右镜像）。描边加重 —— 白翅压白卡必须靠描边才看得见
    for s in (-1, 1):
        for k, (rx, ry, dx, dy) in enumerate(((46, 22, 62, -34), (40, 19, 74, -8), (32, 16, 78, 16))):
            b += ('<ellipse cx="%g" cy="%g" rx="%g" ry="%g" fill="#FFFFFF" stroke="#8E93A8" '
                  'stroke-width="4" transform="rotate(%g %g %g)"/>'
                  % (hx + s * dx, hy + dy, rx, ry, s * -22, hx + s * dx, hy + dy))
    b += ('<path d="M %g %g c 0 -46 -66 -60 -66 -14 c 0 40 46 66 66 92 '
          'c 20 -26 66 -52 66 -92 c 0 -46 -66 -32 -66 14 z" fill="#F2372B" '
          'stroke="#B01F17" stroke-width="4"/>' % (hx, hy - 4))
    b += '<ellipse cx="%g" cy="%g" rx="17" ry="13" fill="#FFFFFF" fill-opacity="0.55" transform="rotate(-22 %g %g)"/>' % (
        hx - 24, hy - 4, hx - 24, hy - 4)
    b += '</g>'
    # 说明文案（数字用红强调，R2）—— 三段手动排字，避免重叠
    b += '<g id="Modal / desc">'
    b += txt('复活并消除前', cx - 118, cy + 130, 34, T['onWhite'])
    b += txt('3', cx + 22, cy + 130, 42, T['accent'])
    b += txt('辆汽车', cx + 100, cy + 130, 34, T['onWhite'])
    b += '</g>'
    # 绿 CTA
    b += '<g id="Modal / CTA-reward">%s</g>' % pill(cx, cy + 250, 320, 108, T['green'], T['greenEdge'], '获得', 46, ico='play')
    svg('02-modal-revive', b)


# ═══ 画板 3：失败页 ═════════════════════════════════════
def board_fail():
    a, cell, ox, oy = art_layer()
    b = bg_layer()
    b += hud_layer()
    b += '<g id="Art / pixel-pattern" opacity="0.62">%s</g>' % a
    b += slots_layer(cars={0: ('black', 21, 0), 1: ('pink', 33, 0), 3: ('cyan', 14, 0)})
    b += speed_layer()
    b += queue_layer([('pink', 14), ('pink', 22), ('cyan', 18), ('cyan', 21)],
                     [('red', 27), ('white', 16), ('cyan', 30), ('black', 16)])
    b += tray_layer()
    b += '<g id="Fail / scrim"><rect width="%d" height="%d" fill="#0E0C14" fill-opacity="0.42"/></g>' % (W, H)
    # 云朵 ribbon（R6：不用白卡，用舞台）
    ry = 470
    b += '<g id="Fail / ribbon-cloud">'
    for dx, dr in ((-150, 46), (-60, 62), (40, 58), (140, 44)):
        b += '<circle cx="%g" cy="%g" r="%g" fill="#E8E8F0"/>' % (W / 2 + dx, ry - 52, dr)
    b += '<rect x="%g" y="%g" width="440" height="86" rx="14" fill="#8FA3B8"/>' % (W / 2 - 220, ry - 34)
    b += '<rect x="%g" y="%g" width="440" height="24" rx="10" fill="#FFFFFF" fill-opacity="0.24"/>' % (W / 2 - 220, ry - 34)
    for s in (-1, 1):
        b += '<path d="M %g %g L %g %g L %g %g Z" fill="#6E8296"/>' % (
            W / 2 + s * 220, ry + 52, W / 2 + s * 262, ry + 74, W / 2 + s * 220, ry + 18)
    b += txt('你失败了', W / 2, ry + 9, 52, '#FFFFFF', '#4A5C6E', 8)
    # 雨滴
    for i in range(7):
        b += '<ellipse cx="%g" cy="%g" rx="5" ry="12" fill="#BFD4E8" fill-opacity="0.8"/>' % (
            W / 2 - 180 + i * 60, ry + 92 + (i % 3) * 16)
    b += '</g>'
    # 哭脸角色
    fx, fy = W / 2, 810
    b += '<g id="Fail / character-crying">'
    b += '<rect x="%g" y="%g" width="200" height="200" rx="52" fill="#E8B520"/>' % (fx - 100, fy - 92)
    b += '<rect x="%g" y="%g" width="200" height="188" rx="52" fill="#FFD84A" stroke="#D9A81E" stroke-width="4"/>' % (fx - 100, fy - 100)
    for s in (-1, 1):
        ex = fx + s * 48
        # 紧闭的眼（倒 V）
        b += ('<path d="M %g %g q %g %g %g 0" fill="none" stroke="#7A5A10" stroke-width="7" '
              'stroke-linecap="round"/>' % (ex - 26, fy - 34, 26, -24, 52))
        # 喷泪：斜向外侧的水滴串
        for k, (dx, dy, r1, r2) in enumerate(((14, 22, 15, 20), (26, 54, 12, 17), (34, 86, 9, 13))):
            b += ('<ellipse cx="%g" cy="%g" rx="%g" ry="%g" fill="#8FD8F5" stroke="#5FB8E0" '
                  'stroke-width="3"/>' % (ex + s * dx, fy - 20 + dy, r1, r2))
    # 张嘴哭（椭圆嘴 + 上排齿高光）
    b += '<ellipse cx="%g" cy="%g" rx="36" ry="28" fill="#E8544A" stroke="#B0322A" stroke-width="4"/>' % (fx, fy + 48)
    b += '<path d="M %g %g q 36 14 72 0" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>' % (fx - 36, fy + 34)
    b += '</g>'
    # 鼓励文案：加深色托底，避免车位的车从字里透出来
    b += '<g id="Fail / encourage">'
    b += '<rect x="%g" y="972" width="470" height="64" rx="32" fill="#12101A" fill-opacity="0.62"/>' % (W / 2 - 235)
    b += txt('别放弃，胜利就在前方！', W / 2, 1004, 36, '#FFFFFF', 'rgba(0,0,0,.55)', 7)
    b += '</g>'
    # 三按钮：绿主 + 黄次（R4）
    b += '<g id="Fail / actions">'
    by = 1120
    b += '<g id="Fail / btn-home">%s</g>' % pill(120, by, 164, 118, T['yellow'], T['yellowEdge'], '主页', 30, ico='home')
    b += '<g id="Fail / btn-retry">%s</g>' % pill(W / 2, by, 306, 128, T['green'], T['greenEdge'], '再试一次', 46)
    b += '<g id="Fail / btn-share">%s</g>' % pill(630, by, 164, 118, T['yellow'], T['yellowEdge'], '分享', 30, ico='share')
    b += '</g>'
    svg('03-fail', b)


# ═══ 画板 4：Design Token 表 ════════════════════════════
def board_tokens():
    w, h = 1500, 1420
    b = '<rect width="%d" height="%d" fill="#1C1B22"/>' % (w, h)
    b += txt('拼豆装车 · Design System', 40, 56, 42, '#FFFFFF', anchor='start')
    b += txt('750×1624 设计稿 / Casual Candy 3D', 40, 104, 24, '#8A8A96', anchor='start')

    def swatch(gid, x, y, face, edge, label, sub):
        o = '<g id="Token / %s">' % gid
        o += '<rect x="%g" y="%g" width="200" height="86" rx="18" fill="%s"/>' % (x, y + 10, edge)
        o += '<rect x="%g" y="%g" width="200" height="86" rx="18" fill="%s" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="2"/>' % (x, y, face)
        o += txt(label, x + 100, y + 43, 26, '#FFFFFF', 'rgba(0,0,0,.4)', 5)
        o += txt(sub, x + 100, y + 122, 20, '#9A9AA6')
        o += '</g>'
        return o

    b += txt('COLOR / brand', 40, 176, 26, '#00E5FF', anchor='start')
    row = [('green', T['green'], T['greenEdge'], '确认 领取', '#6CC24A / #3E8E1E'),
           ('yellow', T['yellow'], T['yellowEdge'], '次级操作', '#FFB13D / #D98A1E'),
           ('blue', T['blue'], T['blueEdge'], '标题 信息', '#2E9BE8 / #1B6FB0'),
           ('red', T['red'], T['redEdge'], '关闭 +角标', '#E8352B / #B01F17'),
           ('bg', T['bg'], T['wedge'], '背景 沉默', '#6E6E75 / #8A8A92')]
    for i, (gid, f, e, lb, sb) in enumerate(row):
        b += swatch(gid, 40 + i * 240, 210, f, e, lb, sb)

    b += txt('COLOR / bean (7色, 主面+侧暗边)', 40, 400, 26, '#00E5FF', anchor='start')
    for i, (k, (m, s)) in enumerate(BEAN.items()):
        x = 60 + i * 200
        b += '<g id="Token / bean-%s">%s%s%s</g>' % (
            k, bean(x + 50, 480, 84, k),
            txt(k, x + 50, 552, 22, '#FFFFFF'),
            txt(m, x + 50, 582, 18, '#9A9AA6'))

    b += txt('COMPONENT / car (纵向 96×126, r=16%宽)', 40, 650, 26, '#00E5FF', anchor='start')
    for i, (k, lb) in enumerate([('cyan', '关门 door=0'), ('cyan', '开门 door=1'), ('pink', 'dim 预览排')]):
        x = 110 + i * 200
        b += '<g id="Token / car-%s">%s%s</g>' % (
            lb, car(x, 760, 96, 126, k, 21, 1.0 if i == 1 else 0, i == 2), txt(lb, x, 856, 21, '#9A9AA6'))

    b += txt('COMPONENT / button', 700, 650, 26, '#00E5FF', anchor='start')
    b += '<g id="Token / pill-green">%s</g>' % pill(880, 740, 280, 100, T['green'], T['greenEdge'], '获得', 42, ico='play')
    b += '<g id="Token / pill-yellow">%s</g>' % pill(1220, 740, 200, 100, T['yellow'], T['yellowEdge'], '主页', 32, ico='home')
    b += '<g id="Token / circle-btn">%s</g>' % circle_btn(880, 900, 54, T['yellow'], T['yellowEdge'], 'up', '升级')
    b += '<g id="Token / circle-btn-blue">%s</g>' % circle_btn(1060, 900, 54, T['blue'], T['blueEdge'], 'refresh', '刷新')

    b += txt('LAYOUT / 竖向节奏 750×1624', 700, 1040, 26, '#00E5FF', anchor='start')
    yy = 1074
    for name, (a2, b2) in G.items():
        pct = (b2 - a2) / H * 100
        bw = pct * 7
        b += '<rect x="710" y="%g" width="%g" height="30" rx="6" fill="#00E5FF" fill-opacity="0.30" stroke="#00E5FF" stroke-width="1.5"/>' % (yy, max(bw, 30))
        b += txt('%-8s %4d–%-4d %5.1f%%' % (name, a2, b2, pct), 716, yy + 15, 20, '#DDDDE6', anchor='start')
        yy += 38

    b += txt('TEXT / 双层文字规范', 40, 940, 26, '#00E5FF', anchor='start')
    b += '<rect x="40" y="965" width="600" height="90" rx="14" fill="%s"/>' % T['blue']
    b += txt('压彩色：白填充 + rgba(0,0,0,.45) 6px 描边', 340, 1010, 28, '#FFFFFF', 'rgba(0,0,0,.45)', 6)
    b += '<rect x="40" y="1070" width="600" height="90" rx="14" fill="#FFFFFF"/>'
    b += txt('压白卡：#1B4C8C 深蓝，强调数字 #E23B2E', 340, 1115, 28, T['onWhite'])
    svg('04-design-tokens', b, w, h)


if __name__ == '__main__':
    print('生成 Figma 画板 →', OUT)
    board_play()
    board_revive()
    board_fail()
    board_tokens()
    print('完成。拖入 Figma 即可，每个 <g id> 会变成同名图层。')
