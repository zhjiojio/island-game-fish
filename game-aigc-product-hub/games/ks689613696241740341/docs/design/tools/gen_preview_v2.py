#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
布局 v2 预览：立绘全幅铺底 + 模糊遮罩 + 删除 speed 行 + qRow2 半遮
真实素材 portrait.jpg (750×1624) 做底
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_DIR = os.path.normpath(os.path.join(HERE, '..', 'figma', 'icons'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'preview'))
os.makedirs(OUT, exist_ok=True)

DH, DW = 1624.0, 750.0
S = 0.44                                  # 750→330, 1624→715

# ═══ 区域命名表（中文名 = 团队沟通唯一叫法，已沉淀到 skill）═══
# key            中文名       y0    y1     职责
ZONES = [
    ('hud',      '顶栏',     0,    112,  '设置齿轮 · 关卡胶囊'),
    ('art',      '拼豆区',   112,  848,  '豆阵主体，drawBean 铺格'),
    ('lane',     '行走道',   848,  944,  '豆子出阵排队，禁放 UI'),
    ('slot',     '车位行',   944,  1104, '6 个车位，第6位广告解锁'),
    ('corridor', '离场道',   1104, 1216, '满车倒入后转向驶出'),
    ('qRow1',    '候选首排', 1216, 1344, '可拖拽'),
    ('qRow2',    '候选次排', 1360, 1488, '半透预览，底部被道具栏半遮'),
    ('tray',     '道具栏',   1466, 1624, '4 个 icon + 秒表'),
]
L2 = dict((k, (a, b)) for k, cn, a, b, d in ZONES)
CN = dict((k, cn) for k, cn, a, b, d in ZONES)
PORTRAIT_END = 1466                        # 立绘铺到道具栏顶

CUR = [('hud', 0, 112, 'ok', ''), ('[空白]', 112, 250, 'bad', '浪费 138px'),
       ('art', 250, 802, 'warn', 'cell 被压到 21'), ('lane', 786, 846, 'bad', '侵入 slot 20px'),
       ('slot', 826, 986, 'ok', ''), ('corridor', 990, 1108, 'ok', ''),
       ('qRow1', 1124, 1252, 'ok', ''), ('qRow2', 1258, 1386, 'ok', ''),
       ('speed', 1396, 1454, 'bad', '撞 btn·功能重复'), ('tray', 1400, 1624, 'warn', '叠画 224px'),
       ('[死区]', 1516, 1624, 'bad', '底部空 108px')]


def ic(name, col='#FFFFFF', size=40):
    p = os.path.join(ICON_DIR, 'ic-%s.svg' % name)
    if not os.path.exists(p):
        return ''
    d = open(p, encoding='utf-8').read()
    inner = d.split('>', 1)[1].rsplit('</svg>', 1)[0].replace('#FFFFFF', col)
    return '<svg width="%d" height="%d" viewBox="0 0 96 96">%s</svg>' % (size, size, inner)


def cur_bands():
    o = ''
    for nm, y0, y1, k, note in CUR:
        o += ('<div class="cb %s" style="top:%gpx;height:%gpx">'
              '<span>%s %dpx%s</span></div>'
              % (k, y0 * S, (y1 - y0) * S, nm, y1 - y0, ' · ' + note if note else ''))
    return o


def beans(rows, cols, cell):
    """示意豆阵（代码里 drawBean 负责真实绘制，这里只占位表达尺寸）"""
    C = ['#FF6FB5', '#6FD8F0', '#FFD24A', '#2B2B33', '#FDFCFA', '#6ED16E', '#F04A4A']
    o = ''
    for r in range(rows):
        for c in range(cols):
            if (r * 7 + c * 3) % 11 == 0:
                continue
            col = C[(r * 3 + c) % 7]
            o += ('<i style="left:%gpx;top:%gpx;width:%gpx;height:%gpx;background:%s"></i>'
                  % (c * cell * S, r * cell * S, cell * S - 1.5, cell * S - 1.5, col))
    return o


def car(num, col, edge, w, h, dim=False):
    return ('<div class="car%s" style="width:%gpx;height:%gpx;background:%s;'
            'border-color:%s"><b>%d</b></div>'
            % (' dim' if dim else '', w * S, h * S, col, edge, num))


def build():
    a0, a1 = L2['art']
    art_h = a1 - a0
    cell = max(14, min(34, int(min(636 / 22, art_h / 26))))
    grid_w, grid_h = 22 * cell, 26 * cell

    # 车位行
    slots = ''
    sw, sh, gap = 108, 160, 10
    x0 = (DW - (sw * 6 + gap * 5)) / 2
    for i in range(6):
        left = (x0 + i * (sw + gap)) * S
        if i in (2, 4):
            slots += ('<div class="slot empty" style="left:%gpx;width:%gpx;height:%gpx"></div>'
                      % (left, sw * S, sh * S))
        elif i == 5:
            slots += ('<div class="slot lock" style="left:%gpx;width:%gpx;height:%gpx">%s</div>'
                      % (left, sw * S, sh * S, ic('video', '#FFFFFF', 26)))
        else:
            n, c, e = [(21, '#6FD8F0', '#3FA8C8'), (14, '#FF6FB5', '#D64992'),
                       (0, '', ''), (5, '#6FD8F0', '#3FA8C8')][i if i < 4 else 0]
            slots += ('<div class="slot" style="left:%gpx;width:%gpx;height:%gpx">%s</div>'
                      % (left, sw * S, sh * S, car(n, c, e, 96, 140)))

    # 候选双排
    qw, qh, qg = 104, 128, 18
    qx = (DW - (qw * 4 + qg * 3)) / 2
    r1 = r2 = ''
    d1 = [(14, '#FF6FB5', '#D64992'), (12, '#2B2B33', '#15151A'),
          (19, '#6FD8F0', '#3FA8C8'), (16, '#2B2B33', '#15151A')]
    d2 = [(27, '#8E4A5E', '#6E3446'), (16, '#5A6E7A', '#41525C'),
          (19, '#7A5A8E', '#5C4269'), (18, '#4A6E8E', '#365269')]
    for k in range(4):
        n, c, e = d1[k]
        r1 += '<div class="qc" style="left:%gpx">%s</div>' % ((qx + k * (qw + qg)) * S, car(n, c, e, qw, qh))
        n, c, e = d2[k]
        r2 += '<div class="qc" style="left:%gpx">%s</div>' % ((qx + k * (qw + qg)) * S, car(n, c, e, qw, qh, True))

    # 道具栏 4 icon（文字加大，允许压在 icon 上）
    tray = ''
    for k, (nm, col, edge, lab) in enumerate(
            (('upgrade', '#FFB13D', '#D98A1E', '升级'), ('clear', '#FFB13D', '#D98A1E', '消除'),
             ('refresh', '#2E9BE8', '#1B6FB0', '刷新'), ('speed', '#FFB13D', '#D98A1E', '速度x2'))):
        cx = (94 + k * 187) * S
        badge = '+' if k < 3 else ''
        bcls = 'badge' if k < 3 else 'badge ad'
        bico = '' if k < 3 else ic('play', '#FFFFFF', 12)
        tray += ('<div class="tb" style="left:%gpx">'
                 '<div class="tcir" style="background:%s;box-shadow:0 5px 0 %s">%s'
                 '<div class="%s">%s%s</div></div><span>%s</span></div>'
                 % (cx, col, edge, ic(nm, '#FFFFFF', 42), bcls, badge, bico, lab))

    diff = [('删除 speed 行', '1130–1200 (70px)', '删除', '底栏已有速度x2 icon，功能重复'),
            ('候选区底色', 'rgba 紫色面板', '<b>去掉</b>', '直接用立绘背景'),
            ('默认显影度', '0% (blur 8px)', '<b>70% (blur 2.4px)</b>', '原默认太遮挡'),
            ('道具栏文字', '9px 紫色', '<b>15px 白字 + 描边</b>', '8 向 text-shadow 描边 #3A2C5E'),
            ('art 区', '552px (34.0%)', '<b>736px (45.3%)</b>', 'cell 21→<b>28</b>，豆子 +33%'),
            ('立绘范围', 'stage 局部', '<b>0–1466 全幅</b>', '所有玩法层浮在模糊立绘上'),
            ('qRow2', '与 tray 相切', '<b>底 22px 塞进 tray</b>', '半遮 → 暗示"还有更多"'),
            ('tray', '1400–1624 叠画', '1466–1624', '纯 4 icon 区，独立不叠'),
            ('底部死区', '108px', '0', '')]
    dr = ''
    for k, a, b, n in diff:
        dr += ('<tr><td class="k">%s</td><td class="a">%s</td><td class="ar">→</td>'
               '<td class="b">%s</td><td class="n">%s</td></tr>' % (k, a, b, n))

    html = """<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>布局 v2 · 立绘铺底 + 模糊遮罩</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#14131a;color:#e8e8ef;font:14px/1.5 -apple-system,"PingFang SC",sans-serif;padding:26px 20px 60px}
h1{font-size:21px}.sub{color:#8a8a96;font-size:13px;margin-bottom:20px}
.wrap{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
.ttl{font-size:15px;font-weight:700;margin-bottom:8px}
.ttl.c{color:#ff7b6b}.ttl.n{color:#5ee08a}
.ph{position:relative;width:%(pw)gpx;height:%(phh)gpx;border-radius:16px;overflow:hidden;
    border:2px solid #3a3945;background:#26252e}
/* ── 立绘全幅铺底 + 模糊遮罩 ── */
.pt{position:absolute;left:0;top:0;width:%(pw)gpx;height:%(pe)gpx;overflow:hidden}
.pt img{width:100%%;height:100%%;object-fit:cover;display:block;
  filter:blur(var(--bl)) brightness(var(--br));transform:scale(1.06);transition:filter .25s}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50%% 38%%,
  transparent 30%%,rgba(12,10,18,.55) 100%%)}
/* 区域条（v2 只标线，不挡画面） */
.z{position:absolute;left:0;right:0;border-top:1px dashed rgba(0,229,255,.5)}
.z span{position:absolute;left:4px;top:1px;font:9px Menlo,monospace;color:#00e5ff;
  background:rgba(8,20,26,.72);padding:0 3px;border-radius:2px;white-space:nowrap}
.grid{position:absolute}
.grid i{position:absolute;border-radius:26%%;box-shadow:0 1px 0 rgba(0,0,0,.5)}
.lane{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center}
.lane i{width:%(lc)gpx;height:%(lc)gpx;border-radius:26%%;background:#6FD8F0;margin:0 1px;
  box-shadow:0 1px 0 rgba(0,0,0,.5)}
.slot{position:absolute;border-radius:9px;display:flex;align-items:center;justify-content:center}
.slot.empty{border:2px dashed rgba(255,255,255,.5)}
.slot.lock{background:rgba(52,50,62,.92);border:2px solid rgba(255,255,255,.3)}
.car{border-radius:15%%;border:2px solid;display:flex;align-items:center;justify-content:center;
  box-shadow:0 3px 0 rgba(0,0,0,.34)}
.car b{color:#fff;font-size:15px;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.car.dim{opacity:.62}
.qc{position:absolute}
/* 候选区无底色 —— 直接跟立绘背景（用户要求） */
/* tray：唯一不透明面板，z 最高 → 压住 qRow2 底部 */
.tr{position:absolute;left:-9px;right:-9px;background:#C9B8E8;border-radius:20px;
  z-index:9;box-shadow:0 -5px 16px rgba(0,0,0,.42)}
.tb{position:absolute;top:%(tbt)gpx;transform:translateX(-50%%);text-align:center}
.tcir{position:relative;width:%(tcw)gpx;height:%(tcw)gpx;border-radius:50%%;border:2px solid #fff;
  display:flex;align-items:center;justify-content:center}
.badge{position:absolute;top:-3px;right:-3px;width:17px;height:17px;border-radius:50%%;
  background:#E8352B;border:1.5px solid #fff;color:#fff;font:700 11px/1 sans-serif;
  display:flex;align-items:center;justify-content:center}
/* 文字加大 + 上提压在 icon 下缘（重叠 OK）。
   描边用 8 向 text-shadow 模拟 —— -webkit-text-stroke 会向内吞字形，小字会糊 */
.tb span{display:block;font:800 15px/1 -apple-system,"PingFang SC",sans-serif;color:#fff;
  margin-top:-7px;position:relative;z-index:2;letter-spacing:.3px;
  text-shadow:
    -2px -2px 0 #3A2C5E, 0 -2px 0 #3A2C5E, 2px -2px 0 #3A2C5E,
    -2px  0   0 #3A2C5E,               2px  0   0 #3A2C5E,
    -2px  2px 0 #3A2C5E, 0  2px 0 #3A2C5E, 2px  2px 0 #3A2C5E,
    0 3px 5px rgba(0,0,0,.5)}
/* 秒表已删除 —— 无此需求 */
/* 左：当前 */
.cb{position:absolute;left:0;right:0;border-top:1px solid rgba(255,255,255,.2);overflow:hidden}
.cb span{font:9px Menlo,monospace;color:#fff;padding:1px 4px;display:block;white-space:nowrap}
.cb.ok{background:rgba(110,110,130,.34)}
.cb.warn{background:rgba(255,177,61,.26);border-top-color:#ffb13d}
.cb.bad{background:rgba(255,80,70,.30);border-top-color:#ff5046}
.ctl{margin:12px 0 0;background:#1e1d26;border:1px solid #33323d;border-radius:9px;padding:12px}
.ctl label{font-size:12px;color:#c8c8d4;display:block;margin-bottom:7px}
input[type=range]{width:100%%;accent-color:#5ee08a}
.rv{font:11px Menlo,monospace;color:#5ee08a;margin-top:6px}
.panel{flex:1 1 400px;min-width:380px}
.card{background:#1e1d26;border:1px solid #33323d;border-radius:10px;padding:15px;margin-bottom:14px}
.card h2{font:700 13px Menlo,monospace;color:#00e5ff;margin-bottom:10px}
table{width:100%%;border-collapse:collapse;font-size:12px}
td{padding:5px;border-bottom:1px solid #2a2934;vertical-align:top}
td.k{color:#c8c8d4;white-space:nowrap}
td.a{font-family:Menlo,monospace;color:#ff8a7b;text-align:right;white-space:nowrap}
td.ar{color:#5a5a66}td.b{font-family:Menlo,monospace;color:#5ee08a}
td.n{color:#8a8a96;font-size:11px}b{color:#ffd24a}
.q{background:#3a2410;border:1px solid #8a5a1e;color:#ffc98a;padding:9px 12px;
  border-radius:7px;font-size:12px;margin-bottom:11px;line-height:1.6}
</style></head><body>
<h1>布局 v2 · 立绘全幅铺底 + 模糊遮罩</h1>
<div class="sub">真实素材 <code>portrait.jpg</code> 750×1624 · 拖滑块看「动态显影」</div>

<div class="wrap">
 <div>
  <div class="ttl c">当前（6 处冲突）</div>
  <div class="ph">%(cur)s</div>
 </div>

 <div>
  <div class="ttl n">v2（立绘铺底 0–1466）</div>
  <div class="ph" id="ph">
    <div class="pt"><img id="im" src="portrait.jpg" alt=""><div class="vig"></div></div>
    <div class="grid" style="left:%(gx)gpx;top:%(gy)gpx">%(beans)s</div>
    <div class="lane" style="top:%(lt)gpx;height:%(lh)gpx">%(lanes)s</div>
    <div style="position:absolute;top:%(st)gpx;height:%(sh)gpx;left:0;right:0">%(slots)s</div>
    <div style="position:absolute;top:%(q1)gpx;left:0;right:0;height:%(qch)gpx">%(r1)s</div>
    <div style="position:absolute;top:%(q2)gpx;left:0;right:0;height:%(qch)gpx">%(r2)s</div>
    <div class="tr" style="top:%(tt)gpx;height:%(th)gpx">%(tray)s</div>
    %(zones)s
  </div>
  <div class="ctl">
    <label>清豆进度 · 立绘显影</label>
    <input type="range" id="sl" min="0" max="100" value="70">
    <div class="rv" id="rv"></div>
  </div>
 </div>

 <div class="panel">
  <div class="q"><b>speed 独占行 = 我的设计冗余</b><br>
  底栏已有「速度x2」icon，再给它 70px 单独一行是重复。已删除，70px 全部还给 art 区。</div>
  <div class="card"><h2>v2 三处改动</h2><table>%(diff)s</table></div>
  <div class="card"><h2>层级（z 从低到高）</h2><table>
   <tr><td class="k">1 立绘 + 模糊遮罩</td><td class="n">0–1466 全幅，默认 70%% → <b>blur 2.4px · brightness .87</b></td></tr>
   <tr><td class="k">2 拼豆区/行走道/车位行</td><td class="n">直接浮在立绘上，无底板</td></tr>
   <tr><td class="k">3 候选首排/次排</td><td class="n"><b>已去掉底色</b>，直接跟立绘背景</td></tr>
   <tr><td class="k">4 道具栏</td><td class="n"><b>唯一不透明</b>，压住候选次排底 22px</td></tr>
  </table>
  <div style="font-size:11px;color:#8a8a96;margin-top:9px;line-height:1.7">
  小游戏端<b>禁止实时 filter:blur</b>（性能不允许）→ 预生成一张模糊版底图，
  与清晰版<b>交叉淡入</b>，alpha 跟 <code>cleared/total</code> 插值。</div></div>
 </div>
</div>
<script>
var sl=document.getElementById('sl'),im=document.getElementById('im'),rv=document.getElementById('rv');
function up(){var p=+sl.value/100,bl=(8*(1-p)).toFixed(1),br=(0.55+0.45*p).toFixed(2);
 im.style.setProperty('--bl',bl+'px');im.style.setProperty('--br',br);
 rv.textContent='清豆 '+sl.value+'%%　blur '+bl+'px　brightness '+br;}
sl.oninput=up;up();
</script></body></html>
""" % dict(pw=DW * S, phh=DH * S, pe=PORTRAIT_END * S,
           cur=cur_bands(),
           gx=(DW - grid_w) / 2 * S, gy=(a0 + (art_h - grid_h) / 2) * S,
           beans=beans(26, 22, cell),
           lt=L2['lane'][0] * S, lh=(L2['lane'][1] - L2['lane'][0]) * S,
           lc=cell * S * .8, lanes='<i></i>' * 5,
           st=L2['slot'][0] * S, sh=(L2['slot'][1] - L2['slot'][0]) * S, slots=slots,
           qt=L2['qRow1'][0] * S, qh=(1624 - L2['qRow1'][0]) * S,
           q1=L2['qRow1'][0] * S, q2=L2['qRow2'][0] * S, qch=qh * S,
           r1=r1, r2=r2,
           tt=L2['tray'][0] * S, th=(1624 - L2['tray'][0]) * S,
           # tray 1466-1624=158px：pad12 + 圆104 + gap4 + label22 = 142，底 1608 < 1624 ✅
           tbt=12 * S, tcw=104 * S, tray=tray,
           zones=''.join(
               '<div class="z" style="top:%gpx"><span>%s <em>%s</em> %d–%d</span></div>'
               % (a * S, cn, k, a, b)
               for k, cn, a, b, d in ZONES if k != 'tray'),
           diff=dr)

    p = os.path.join(OUT, 'v2.html')
    open(p, 'w', encoding='utf-8').write(html)
    print('✓', p)
    print('  art %d–%d = %dpx (%.1f%%)  cell=%d  \u8c46\u9635 %d\u00d7%d'
          % (a0, a1, art_h, art_h / DH * 100, cell, grid_w, grid_h))
    print('  qRow2 %d–%d  tray\u9876 %d  \u2192 \u906e\u4f4f %dpx (%.0f%%)'
          % (L2['qRow2'][0], L2['qRow2'][1], L2['tray'][0],
             L2['qRow2'][1] - L2['tray'][0],
             (L2['qRow2'][1] - L2['tray'][0]) / 128 * 100))


if __name__ == '__main__':
    build()
