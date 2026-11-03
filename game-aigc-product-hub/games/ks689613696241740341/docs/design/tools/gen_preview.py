#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
布局对照预览页生成器
左：当前布局（真实 PD.L 数值，标出 6 处冲突）
右：修改后布局（冲突归零）
底：Icon 系统实装预览
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_DIR = os.path.normpath(os.path.join(HERE, '..', 'figma', 'icons'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'preview'))
os.makedirs(OUT, exist_ok=True)

DH = 1624.0

# ── 真实测量数据 ────────────────────────────────────────
CUR = [
    ('hud',      0,    112,  'ok',   'HUD'),
    ('[空白]',   112,  250,  'bad',  '纯浪费 138px'),
    ('art',      250,  802,  'warn', 'sundae 被压到 cell=21'),
    ('lane',     786,  846,  'bad',  '侵入 slot 20px'),
    ('slot',     826,  986,  'ok',   '车位 ×6'),
    ('corridor', 990,  1108, 'ok',   '车离场通道'),
    ('qRow1',    1124, 1252, 'ok',   '候选排 1'),
    ('qRow2',    1258, 1386, 'ok',   '候选排 2 预览'),
    ('speed',    1396, 1454, 'bad',  '撞 btn x38/y30'),
    ('tray',     1400, 1624, 'warn', '与 qPanel 叠画 224px'),
    ('[死区]',   1516, 1624, 'bad',  '底部空 108px'),
]
NEW = [
    ('hud',      0,    112,  'ok',   'HUD'),
    ('art',      112,  762,  'good', '+98px → cell 21→25'),
    ('lane',     762,  858,  'good', '独立成带，不撞 slot'),
    ('slot',     858,  1018, 'ok',   '车位 ×6（尺寸不变）'),
    ('corridor', 1018, 1130, 'ok',   '车离场通道'),
    ('speed',    1130, 1200, 'good', '★独占行'),
    ('qRow1',    1200, 1328, 'ok',   '候选排 1'),
    ('qRow2',    1338, 1466, 'ok',   '候选排 2 预览'),
    ('tray',     1466, 1624, 'good', '坐到最下沿，无死区'),
]

CONFLICTS = [
    ('lane ∩ slot', 826, 846),
    ('speed ∩ btn', 1424, 1454),
    ('qPanel ∩ tray', 1400, 1624),
]

ICONS = ['speed', 'upgrade', 'clear', 'refresh', 'play', 'video',
         'home', 'share', 'close', 'gear', 'star', 'plus', 'lock']


def inline_icon(name, col='#FFFFFF', size=40):
    p = os.path.join(ICON_DIR, 'ic-%s.svg' % name)
    if not os.path.exists(p):
        return ''
    d = open(p, encoding='utf-8').read()
    inner = d.split('>', 1)[1].rsplit('</svg>', 1)[0]
    inner = inner.replace('#FFFFFF', col)
    return ('<svg width="%d" height="%d" viewBox="0 0 96 96">%s</svg>' % (size, size, inner))


def bands(rows, scale):
    """区域条：单行 nowrap（窄条只有23px，三行文字会溢出压到下一条 —— 已在浏览器实测）"""
    o = ''
    for nm, y0, y1, kind, note in rows:
        h = (y1 - y0)
        o += ('<div class="band %s" style="top:%gpx;height:%gpx">'
              '<span class="bl"><b>%s</b> %d–%d · %dpx · %.1f%%</span></div>'
              % (kind, y0 * scale, h * scale, nm, y0, y1, h, h / DH * 100))
    return o


def notes(rows, scale):
    """说明文字外移到右侧标注列，不再挤在条内"""
    o = ''
    for nm, y0, y1, kind, note in rows:
        if not note:
            continue
        o += ('<div class="nt %s" style="top:%gpx"><i></i>%s</div>'
              % (kind, y0 * scale, note))
    return o


def conflict_marks(scale):
    o = ''
    for nm, y0, y1 in CONFLICTS:
        o += ('<div class="clash" style="top:%gpx;height:%gpx"><span>%s %dpx</span></div>'
              % (y0 * scale, (y1 - y0) * scale, nm, y1 - y0))
    return o


def build():
    S = 0.40                       # 750→300, 1624→650
    icon_strip = ''
    for n in ICONS:
        icon_strip += ('<div class="ic"><div class="icbox">%s</div>'
                       '<div class="icn">%s</div></div>'
                       % (inline_icon(n, '#FFFFFF', 38), n))

    impl = ''
    for n, col, lab in (('upgrade', '#FFB13D', '升级'),
                        ('clear', '#FFB13D', '消除'),
                        ('refresh', '#2E9BE8', '刷新'),
                        ('speed', '#FFB13D', '速度x2')):
        impl += ('<div class="ib"><div class="circle" style="background:%s">%s'
                 '<div class="badge">+</div></div><div class="ibl">%s</div></div>'
                 % (col, inline_icon(n, '#FFFFFF', 46), lab))

    diff_rows = [
        ('stageY', '250', '112', '消灭 138px 空白'),
        ('stageH', '552', '650', 'art 34.0% → 40.0%'),
        ('beanTop', '262', '124', '随 stageY 同步'),
        ('laneY', '786', '774', '底 858 不碰 slot'),
        ('slotY', '826', '858', ''),
        ('slotH / slotW', '160 / 108', '不变', '车已放大好'),
        ('corridorY', '990', '1018', ''),
        ('corridorH', '118', '112', ''),
        ('spdY / spdH', '— (无)', '1130 / 70', '★新增，解 38px 重叠'),
        ('qPanelY', '1112', '1200', '不再与 tray 叠画'),
        ('qRow1', '1124', '1200', ''),
        ('qRow2', '1258', '1338', ''),
        ('qCarW / qCarH', '104 / 128', '不变', 'h&gt;w 已正确'),
        ('trayY', '1400', '1466', '消灭 108px 死区'),
        ('btnY', '1470', '1526', ''),
        ('btnR', '46', '52', '触控 92→104px'),
    ]
    dr = ''
    for k, a, b, note in diff_rows:
        cls = 'same' if b == '不变' else ('add' if '★' in note else 'chg')
        dr += ('<tr class="%s"><td class="k">%s</td><td class="a">%s</td>'
               '<td class="arw">→</td><td class="b">%s</td><td class="n">%s</td></tr>'
               % (cls, k, a, b, note))

    cell_rows = ''
    for nm, rows in (('sundae', 26), ('melon', 17)):
        c_old = max(14, min(34, int(min(636 / 22, 552 / rows))))
        c_new = max(14, min(34, int(min(636 / 22, 650 / rows))))
        pct = (c_new - c_old) / c_old * 100 if c_old else 0
        cell_rows += ('<tr><td class="k">%s (%d行)</td><td class="a">cell=%d 阵高%d</td>'
                      '<td class="arw">→</td><td class="b">cell=%d 阵高%d</td>'
                      '<td class="n">%s</td></tr>'
                      % (nm, rows, c_old, rows * c_old, c_new, rows * c_new,
                         ('<b>+%.0f%%</b>' % pct) if pct > 0 else '受宽度卡，不变'))

    html = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>拼豆装车 · 布局对照</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#14131a;color:#e8e8ef;font:14px/1.5 -apple-system,"PingFang SC",sans-serif;padding:28px 20px 60px}
h1{font-size:22px;margin-bottom:4px}
.sub{color:#8a8a96;font-size:13px;margin-bottom:24px}
.warnbar{background:#3a2410;border:1px solid #8a5a1e;color:#ffc98a;padding:10px 14px;border-radius:8px;margin-bottom:22px;font-size:13px}
.wrap{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start}
.col{flex:0 0 auto}
.ttl{font-size:15px;font-weight:700;margin-bottom:2px}
.ttl.cur{color:#ff7b6b}.ttl.new{color:#5ee08a}
.meta{color:#7a7a86;font-size:12px;margin-bottom:10px;font-family:Menlo,monospace}
.phone{position:relative;width:%(pw)gpx;height:%(ph)gpx;background:#26252e;border:2px solid #3a3945;border-radius:14px;overflow:hidden}
.band{position:absolute;left:0;right:0;border-top:1px solid rgba(255,255,255,.22);overflow:hidden;display:flex;align-items:flex-start}
.bl{font-family:Menlo,monospace;font-size:9.5px;color:rgba(255,255,255,.92);white-space:nowrap;padding:2px 5px;line-height:1.25}
.bl b{color:#fff;font-size:10px}
.stage{position:relative;display:flex;gap:0}
.ncol{position:relative;width:186px;height:%(ph)gpx;margin-left:8px}
.nt{position:absolute;left:0;font-size:10px;line-height:1.3;padding-left:16px;white-space:normal}
.nt i{position:absolute;left:0;top:6px;width:12px;height:1px;background:currentColor;opacity:.6}
.nt.bad{color:#ff8a7b}.nt.warn{color:#ffc98a}.nt.good{color:#5ee08a}.nt.ok{color:#8a8a96}
.band.ok{background:rgba(110,110,130,.30)}
.band.good{background:rgba(94,224,138,.20);border-top-color:#5ee08a}
.band.warn{background:rgba(255,177,61,.20);border-top-color:#ffb13d}
.band.bad{background:rgba(255,80,70,.24);border-top-color:#ff5046}
.bd{display:none}
.bnote{display:none}
.clash{position:absolute;left:0;right:0;background:repeating-linear-gradient(45deg,rgba(255,0,0,.42) 0 5px,transparent 5px 10px);border:1px dashed #ff5046;pointer-events:none;display:flex;align-items:center;justify-content:flex-end}
.clash span{font-family:Menlo,monospace;font-size:9px;background:#ff5046;color:#fff;padding:1px 4px;border-radius:3px;margin-right:3px}
.legend{margin-top:10px;font-size:11px;color:#8a8a96;line-height:1.9}
.sw{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin-right:4px}
.panel{flex:1 1 420px;min-width:400px}
.card{background:#1e1d26;border:1px solid #33323d;border-radius:10px;padding:16px;margin-bottom:16px}
.card h2{font-size:14px;color:#00e5ff;margin-bottom:12px;font-family:Menlo,monospace}
table{width:100%%;border-collapse:collapse;font-size:12px}
td{padding:5px 6px;border-bottom:1px solid #2a2934}
td.k{font-family:Menlo,monospace;color:#c8c8d4;white-space:nowrap}
td.a{font-family:Menlo,monospace;color:#ff8a7b;text-align:right;white-space:nowrap}
td.arw{color:#5a5a66;text-align:center}
td.b{font-family:Menlo,monospace;color:#5ee08a;white-space:nowrap}
td.n{color:#8a8a96;font-size:11px}
tr.same td.b{color:#7a7a86}
tr.add td.b{color:#ffd24a}
.icons{display:flex;flex-wrap:wrap;gap:10px}
.ic{width:66px;text-align:center}
.icbox{width:66px;height:56px;background:#26252e;border:1px solid #33323d;border-radius:8px;display:flex;align-items:center;justify-content:center}
.icn{font-family:Menlo,monospace;font-size:9px;color:#00e5ff;margin-top:3px}
.impl{display:flex;gap:22px;padding:6px 0}
.ib{text-align:center}
.circle{position:relative;width:74px;height:74px;border-radius:50%%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 0 rgba(0,0,0,.32)}
.badge{position:absolute;top:-4px;right:-4px;width:24px;height:24px;border-radius:50%%;background:#E8352B;border:2px solid #fff;color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}
.ibl{font-size:12px;color:#c8c8d4;margin-top:6px}
.note{font-size:12px;color:#8a8a96;margin-top:10px;line-height:1.7}
.note b{color:#ffd24a}
code{font-family:Menlo,monospace;background:#2a2934;padding:1px 5px;border-radius:3px;font-size:11px;color:#ffd24a}
</style></head><body>

<h1>拼豆装车 · 布局对照</h1>
<div class="sub">750×1624 · 数据来自 <code>pd-core.js PD.L</code> 实测，非估算</div>

<div class="warnbar">
<b>⚠ 修正说明</b>：我早先文档里的「现状」表已作废 —— <code>PD.L</code> 被另一会话大改过（车已放大到 160、新增 <code>laneY</code>/<code>corridorY</code>、<code>qCarH</code> 已修成 128）。本页是重新实测的结果。
</div>

<div class="wrap">
  <div class="col">
    <div class="ttl cur">当前布局</div>
    <div class="meta">玩法区 112–1108 = 61.3%%　6 处冲突</div>
    <div class="stage">
      <div class="phone">%(cur)s%(clash)s</div>
      <div class="ncol">%(curn)s</div>
    </div>
    <div class="legend">
      <span class="sw" style="background:rgba(255,80,70,.6)"></span>硬冲突<br>
      <span class="sw" style="background:rgba(255,177,61,.6)"></span>隐患<br>
      <span class="sw" style="background:repeating-linear-gradient(45deg,rgba(255,0,0,.5) 0 3px,transparent 3px 6px)"></span>重叠区
    </div>
  </div>

  <div class="col">
    <div class="ttl new">修改后</div>
    <div class="meta">玩法区 112–1130 = 62.7%%　冲突归零</div>
    <div class="stage">
      <div class="phone">%(new)s</div>
      <div class="ncol">%(newn)s</div>
    </div>
    <div class="legend">
      <span class="sw" style="background:rgba(94,224,138,.6)"></span>改动项<br>
      <span class="sw" style="background:rgba(110,110,130,.6)"></span>不变项
    </div>
  </div>

  <div class="panel">
    <div class="card">
      <h2>PD.L 逐字段 diff</h2>
      <table>%(diff)s</table>
      <div class="note">另需同步两处，不改会错位：<br>
      ① <code>spdRect()</code> 现在依赖 <code>L.trayY-4</code>，必须改成独立的 <code>L.spdY</code> —— <b>这就是 38px 重叠的根因</b><br>
      ② <code>PD.MASKS.skirt_nuonuo.oy = 262</code> 是硬编码，需同步改 124</div>
    </div>

    <div class="card">
      <h2>关键收益 · 豆子变大</h2>
      <table>%(cell)s</table>
      <div class="note"><code>PATTERNS</code> 没有 <code>cell</code> 键 → 走动态缩放
      <code>min(636/cols, stageH/rows)</code>。所以 <code>stageH</code> 一改，
      豆子<b>自动变大</b>，不用动图案数据。</div>
    </div>

    <div class="card">
      <h2>Icon 系统（13 个）</h2>
      <div class="icons">%(icons)s</div>
      <div class="note">96×96 网格 / 安全边距 8 / 描边 10 / 实心最细 18</div>
    </div>

    <div class="card">
      <h2>托盘实装预览 r=52</h2>
      <div class="impl">%(impl)s</div>
      <div class="note">角标语义：道具类用<b>红底白 +</b>；<code>▶</code> 只留给纯广告位（速度/解锁/复活）。
      现状全用绿 <code>▶</code>，与绿色 CTA 抢注意力。</div>
    </div>
  </div>
</div>
</body></html>
""" % dict(pw=750 * S, ph=DH * S,
           cur=bands(CUR, S), new=bands(NEW, S), clash=conflict_marks(S),
           curn=notes(CUR, S), newn=notes(NEW, S),
           diff=dr, cell=cell_rows, icons=icon_strip, impl=impl)

    p = os.path.join(OUT, 'index.html')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(html)
    print('✓', p)


if __name__ == '__main__':
    build()
