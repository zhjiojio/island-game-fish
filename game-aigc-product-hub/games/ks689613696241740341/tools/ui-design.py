#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拼豆小游戏 · UI 设计系统（单一真源）
=====================================
这个文件扮演的角色 = Figma 文件。
  · 所有 UI 元素在这里以「矢量 + 设计 token」定义
  · 导出 @2x PNG 切图 → package/assets/ui/
  · 同时导出 ui-slices.json（坐标/尺寸清单）→ 代码直接读，坐标不再靠猜
  · 同时导出 figma-plugin/ → 可在 Figma 里一键重建同一套 UI 供人工微调

为什么不是直接调 Figma API：Figma REST API 是**只读**的，
没有任何 create/write 端点（POST /v1/files → 404）。
写入 Figma 只能靠在 Figma 客户端内运行 Plugin。
所以真源放本地矢量，Figma 侧用 Plugin 同步。
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'package', 'assets', 'ui')
PLUG = os.path.join(ROOT, 'tools', 'figma-plugin')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PLUG, exist_ok=True)

SCALE = 2  # @2x

# ── 设计 token ───────────────────────────────────────────────
T = {
    'panel_top':    '#4A3F5C',
    'panel_bot':    '#3A3049',
    'tray':         '#C9B8E8',
    'tray_edge':    '#A892D4',
    'slot_stroke':  '#FFFFFF',
    'lock_fill':    '#7A748C',
    'hud_bg':       '#46444F',
    'ink':          '#2B2B33',
    'btn_gold':     '#FFC94A',
    'btn_gold_e':   '#D99A1E',
    'btn_blue':     '#4DB6E8',
    'btn_blue_e':   '#2E86B8',
    'btn_pink':     '#FF8FC4',
    'btn_pink_e':   '#D45E96',
    'ad_green':     '#2ECC71',
    'btn_green':    '#3FC46A',
    'btn_green_e':  '#2A9B4E',
    'white':        '#FFFFFF',
}

# ── 元素定义：name -> (w, h, svg_body) ────────────────────────
def svg(w, h, body, defs=''):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
            'viewBox="0 0 %d %d">%s%s</svg>') % (w, h, w, h, defs, body)


def shadow(id_='sh', dy=4, blur=6, op=.3):
    return ('<filter id="%s" x="-40%%" y="-40%%" width="180%%" height="180%%">'
            '<feDropShadow dx="0" dy="%d" stdDeviation="%d" flood-color="#000" '
            'flood-opacity="%s"/></filter>') % (id_, dy, blur, op)


ELEMENTS = {}

# 1) 空车位框（虚线）
W, H = 108, 110
ELEMENTS['slot_empty'] = (W, H, svg(W, H,
    '<rect x="3" y="3" width="%d" height="%d" rx="16" fill="rgba(255,255,255,0.10)" '
    'stroke="%s" stroke-width="4" stroke-dasharray="11 9" stroke-opacity="0.66"/>'
    % (W - 6, H - 6, T['slot_stroke'])))

# 2) 车位高亮（拖拽时呼吸底）
ELEMENTS['slot_hi'] = (W, H, svg(W, H,
    '<rect x="3" y="3" width="%d" height="%d" rx="16" fill="#FFFFFF" fill-opacity="0.34"/>'
    % (W - 6, H - 6)))

# 3) 锁定车位（第6位）
ELEMENTS['slot_lock'] = (W, H, svg(W, H,
    '<rect x="3" y="3" width="%d" height="%d" rx="16" fill="%s" fill-opacity="0.82" '
    'stroke="#FFFFFF" stroke-width="3" stroke-opacity="0.55"/>'
    # 干净的「看视频解锁」= 白圆 + 居中播放三角（不是之前那个像摄像机的怪东西）
    '<circle cx="54" cy="46" r="25" fill="#FFFFFF"/>'
    '<path d="M46 33 L69 46 L46 59 Z" fill="%s"/>'
    % (W - 6, H - 6, T['lock_fill'], T['lock_fill'])))

# 4) 底部面板（渐变，整幅宽）
PW, PH = 750, 240
ELEMENTS['panel'] = (PW, PH, svg(PW, PH,
    '<rect width="%d" height="%d" fill="url(#pg)"/>'
    '<rect width="%d" height="3" fill="#FFFFFF" fill-opacity="0.16"/>' % (PW, PH, PW),
    '<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/>'
    '</linearGradient></defs>' % (T['panel_top'], T['panel_bot'])))

# 5) 按钮托盘（顶部大圆角）
TW, TH = 790, 300
ELEMENTS['tray'] = (TW, TH, svg(TW, TH,
    '<rect x="0" y="0" width="%d" height="%d" rx="44" fill="%s"/>'
    '<rect x="0" y="0" width="%d" height="10" rx="5" fill="%s" fill-opacity="0.55"/>'
    % (TW, TH, T['tray'], TW, T['white'])))

# 6) HUD 关卡胶囊
CW, CH = 184, 58
ELEMENTS['hud_capsule'] = (CW, CH, svg(CW, CH,
    '<rect width="%d" height="%d" rx="29" fill="%s" fill-opacity="0.86"/>'
    '<rect x="6" y="5" width="%d" height="18" rx="9" fill="#FFFFFF" fill-opacity="0.14"/>'
    % (CW, CH, T['hud_bg'], CW - 12)))

# 7) 齿轮（设置）
GW = 84
ELEMENTS['hud_gear'] = (GW, GW, svg(GW, GW,
    '<circle cx="42" cy="42" r="38" fill="#3E8FE0" filter="url(#sh)"/>'
    '<circle cx="42" cy="42" r="38" fill="none" stroke="#FFFFFF" stroke-width="5"/>'
    + ''.join('<circle cx="%.2f" cy="%.2f" r="5.5" fill="#FFFFFF"/>' % (
        42 + 17 * __import__('math').cos(i * 3.14159265 / 4),
        42 + 17 * __import__('math').sin(i * 3.14159265 / 4)) for i in range(8))
    + '<circle cx="42" cy="42" r="9" fill="#3E8FE0"/>',
    '<defs>%s</defs>' % shadow()))


# 8) 三个道具圆按钮
def prop_btn(fill, edge, glyph):
    R = 100
    # 【删除顶部椭形高光】旧版 <ellipse cy=30 opacity=.28> 在每个图标上半
    # 留下一块说不清是什么的白椭圆（用户：「不动是啥意思」）。
    # 改用整体垂直渐变做质感，不再出现可识别的多余形状。
    gid = 'gl' + fill.replace('#', '')
    return (R, R, svg(R, R,
        # 底：深色边（下沉 4px 形成厚度）
        '<circle cx="50" cy="52" r="44" fill="%s"/>'
        # 面：本色实底（必须是纯色，别被渐变吃掉颜色）
        '<circle cx="50" cy="48" r="44" fill="%s"/>'
        # 质感：整体自上而下的白色渐隐（不是可识别的椭圆形状）
        '<circle cx="50" cy="48" r="44" fill="url(#%s)"/>'
        '<circle cx="50" cy="48" r="44" fill="none" stroke="#FFFFFF" '
        'stroke-width="4" stroke-opacity="0.85"/>'
        '%s' % (edge, fill, gid, glyph),
        '<linearGradient id="%s" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.26"/>'
        '<stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>'
        '</linearGradient>' % gid))


# 升级 = 容量翻倍（代码：c2.cap *= 2）。旧版画上箭头——用户问「哪个箭头代表啥」，
# 因为光一个箭头无法表达「×2」。改成 「×2」 字样 + 小上箭头，语义唯一。
ELEMENTS['btn_upgrade'] = prop_btn(T['btn_gold'], T['btn_gold_e'],
    '<path d="M50 15 L63 32 L54.5 32 L54.5 40 L45.5 40 L45.5 32 L37 32 Z" fill="#FFFFFF"/>'
    '<text x="50" y="78" font-family="Helvetica,Arial,sans-serif" font-size="38" '
    'font-weight="bold" fill="#FFFFFF" text-anchor="middle">\u00d72</text>')
# 消除 = 强制拖走一辆车。对齐竞品：用【毛刷】这个「清除」的通用隐喻。
# 试错记录：画 ✕ → 读成「关闭」；画「车+箭头」→ 读成「购物车」。都不行。
ELEMENTS['btn_clear'] = prop_btn(T['btn_pink'], T['btn_pink_e'],
    # 刷柄：右上 → 左下 的粗斜线
    '<line x1="66" y1="26" x2="42" y2="58" stroke="#FFFFFF" stroke-width="9" '
    'stroke-linecap="round"/>'
    # 刷头：左下端的宽块，长边垂直于刷柄
    '<rect x="22" y="58" width="30" height="17" rx="5" fill="#FFFFFF" '
    'transform="rotate(-37 37 66)"/>'
    # 刷毛（三根短线，表现“在刷”）
    '<g stroke="#FFFFFF" stroke-width="4" stroke-linecap="round">'
    '<line x1="26" y1="78" x2="22" y2="84"/>'
    '<line x1="34" y1="81" x2="31" y2="88"/>'
    '<line x1="43" y1="82" x2="42" y2="89"/>'
    '</g>')
# 刷新 = 重排待发车队列。【修正】交汇处按通行习惯放在下半部。
# 对齐竞品：上/下两条半弧 + 两个端头箭头，形成循环；弧与箭头严格共线。
ELEMENTS['btn_refresh'] = prop_btn(T['btn_blue'], T['btn_blue_e'],
    # 上半弧：左(26,48) → 右(74,48)，凸向上
    '<path d="M26 48 A24 24 0 0 1 74 48" fill="none" stroke="#FFFFFF" stroke-width="9"/>'
    # 右端箭头：沿顺时针切线向下
    '<path d="M62 48 L86 48 L74 68 Z" fill="#FFFFFF"/>'
    # 下半弧：右(74,56) → 左(26,56)，凸向下（交汇口在下半部）
    '<path d="M74 56 A24 24 0 0 1 26 56" fill="none" stroke="#FFFFFF" stroke-width="9"/>'
    # 左端箭头：向上
    '<path d="M38 56 L14 56 L26 36 Z" fill="#FFFFFF"/>')

# 加速 = 双 V 形快进箭头（通行的 fast-forward 符号）。
# 【用户要求】从托盘左侧那张白卡片改成底部栏第 4 个圆按钮，与三道具一致。
ELEMENTS['btn_boost'] = prop_btn(T['btn_green'], T['btn_green_e'],
    '<path d="M26 28 L48 48 L26 68 Z" fill="#FFFFFF"/>'
    '<path d="M50 28 L72 48 L50 68 Z" fill="#FFFFFF"/>')

# 9) 广告角标（三角居中）
ELEMENTS['ad_badge'] = (40, 30, svg(40, 30,
    '<rect width="40" height="30" rx="8" fill="%s"/>'
    '<path d="M14.5 8 L29 15 L14.5 22 Z" fill="#FFFFFF"/>' % T['ad_green']))

# 10) 加速卡
SW, SH = 150, 58
ELEMENTS['card_speed'] = (SW, SH, svg(SW, SH,
    '<rect x="2" y="2" width="%d" height="%d" rx="14" fill="#FFFFFF"/>'
    '<rect x="2" y="2" width="%d" height="%d" rx="14" fill="none" '
    'stroke="#000000" stroke-width="3" stroke-opacity="0.18"/>'
    % (SW - 4, SH - 4, SW - 4, SH - 4)))

# 11) 队列卡底座（车停在上面）
QW, QH = 104, 94
ELEMENTS['queue_pad'] = (QW, QH, svg(QW, QH,
    '<rect x="2" y="%d" width="%d" height="16" rx="8" fill="#000000" fill-opacity="0.22"/>'
    % (QH - 18, QW - 4)))

# 12) 通关缎带
RW, RH = 500, 100
ELEMENTS['win_ribbon'] = (RW, RH, svg(RW, RH,
    '<path d="M40 14 L0 40 L40 66 Z" fill="#2A6BB5"/>'
    '<path d="M%d 14 L%d 40 L%d 66 Z" fill="#2A6BB5"/>'
    '<rect x="40" y="13" width="420" height="74" rx="12" fill="#3E8FE0"/>'
    '<rect x="40" y="13" width="420" height="22" rx="10" fill="#FFFFFF" fill-opacity="0.24"/>'
    % (RW - 40, RW, RW - 40)))


# ── 导出 ────────────────────────────────────────────────────
def export():
    manifest = {'scale': SCALE, 'slices': {}}
    for name, (w, h, body) in ELEMENTS.items():
        svg_path = os.path.join(OUT, name + '.svg')
        png_path = os.path.join(OUT, name + '.png')
        with open(svg_path, 'w') as f:
            f.write(body)
        subprocess.check_call([
            'rsvg-convert', '-w', str(w * SCALE), '-h', str(h * SCALE),
            '-o', png_path, svg_path])
        os.remove(svg_path)
        subprocess.call(['pngquant', '--force', '--skip-if-larger', '--quality', '65-92',
                         '-o', png_path, png_path],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        manifest['slices'][name] = {'w': w, 'h': h,
                                    'file': 'assets/ui/' + name + '.png'}
        print('  %-16s %4dx%-4d -> %6d B' % (name, w, h, os.path.getsize(png_path)))
    mpath = os.path.join(OUT, 'ui-slices.json')
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print('\n清单: %s (%d 个切图)' % (mpath, len(manifest['slices'])))
    return manifest


if __name__ == '__main__':
    print('导出 UI 切图 @%dx -> %s\n' % (SCALE, OUT))
    export()
