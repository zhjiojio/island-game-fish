// js/tb-ui.js — Canvas 绘制基元与直播间 HUD
// ⚠️ 快手小游戏为 Canvas 运行时：所有视觉内容必须通过 ctx.* 绘制，
//    严禁使用 div/span/button/CSS/innerHTML（这是上一版无法上线的根因）。
(function () {
  var M3 = window.M3;
  var CO = M3.Config.COLOR;

  var ctx = null, W = 0, H = 0, TOP = 0;
  var hits = [];   // 命中区：{x,y,w,h,action}

  // ═══ Figma 442:9387「直播间」设计规范（设计画布 414×896）═══
  // schema 的 boundingRect 含画布偏移 x=928 / y=43，以下坐标均已归零为设计局部坐标。
  var DW = 414;
  var CARD_BG    = 'rgba(25,3,65,.50)';    // #19034180 主播卡 / 小时榜 / 弹幕
  var CARD_LINE  = 'rgba(194,147,255,.56)'; // #C293FF8F 0.5px 描边
  var RANK_BG    = 'rgba(25,0,71,.80)';    // #190047CC 排名卡
  var GIFT_BG    = 'rgba(48,0,126,.80)';   // #30007ECC 礼物格
  var GLOW       = 'rgba(223,13,255,.30)'; // #DF0DFF4D inset 0 0 18.6px
  var GOLD       = '#FFDC90';
  var PICK       = '#FF19E8';              // 选中候选人名色
  var RANK_NO_COLOR = ['#FDEA9C', '#DDECFF', '#F6AD8B', '#FFCEFB'];

  // 直播间切图
  var IM_FOLLOW = 'media/live/btn-follow.png';
  var IM_HOST   = 'media/live/host-avatar.png';
  var IM_STAR   = 'media/live/star-icon.png';
  var IM_CHECK  = 'media/live/check.png';
  var IM_ARROW  = 'media/live/arrow.png';       // 442:9689 点击继续箭头
  // 442:9693 等送礼特效大图 260×260，键为 Story.gifts 的 id
  var IM_FX     = {
    flower:         'media/live/fx-flower.png',    // 452:12449 玫瑰
    cheers:         'media/live/fx-cheers.png',    // 442:9693  啤酒杯
    firework:       'media/live/fx-firework.png',  // 452:12451 烟花
    galaxy:         'media/live/fx-galaxy.png',    // 452:12452 星河
    'tiaimo-night': 'media/live/fx-night.png'      // 452:12453 星空城堡
  };
  var IM_PANEL  = 'media/live/gift-panel-bg.png';
  var GIFT_IM   = ['media/live/gift-1.png', 'media/live/gift-2.png', 'media/live/gift-3.png',
                   'media/live/gift-4.png', 'media/live/gift-5.png'];

  function ds() { return W / DW; }          // 设计 → 屏幕 缩放

  // 取图并按需异步加载（Canvas 运行时无 DOM，统一走 Loader 缓存）
  function img(file) {
    var im = M3.Loader.getImage(file);
    if (!im) M3.Loader.loadImage(file, function () {});
    return im && im.width ? im : null;
  }
  function drawIm(file, x, y, w, h) {
    var im = img(file);
    if (!im) return false;
    try { ctx.drawImage(im, x, y, w, h); } catch (e) {}
    return true;
  }

  function bind(context) { ctx = context; }
  function frame() {
    W   = M3.Layout.w;
    H   = M3.Layout.h;
    TOP = M3.Layout.safeTop;
    hits = [];
  }
  function hitZones() { return hits; }
  function push(x, y, w, h, action) { hits.push({ x: x, y: y, w: w, h: h, action: action }); }

  // ─── 基元 ───────────────────────────────────────────────────
  function roundRect(x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  function fillRound(x, y, w, h, r, color) {
    ctx.fillStyle = color; roundRect(x, y, w, h, r); ctx.fill();
  }
  function strokeRound(x, y, w, h, r, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1; roundRect(x, y, w, h, r); ctx.stroke();
  }

  function text(str, x, y, font, color, align) {
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str == null ? '' : String(str), x, y);
    ctx.textAlign = 'left';
  }

  // 按最大宽度折行（中文逐字测量）
  function wrap(str, maxW, font) {
    ctx.font = font;
    var lines = [], line = '';
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      var t = line + str[i];
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = str[i]; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  // 超宽文本截断加省略号
  function ellipsis(str, maxW, font) {
    ctx.font = font;
    str = String(str == null ? '' : str);
    if (ctx.measureText(str).width <= maxW) return str;
    var s = str;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function vGradient(x, y0, y1, stops) {
    var g = ctx.createLinearGradient(x, y0, x, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  // 底部渐变遮罩，保证文字在视频上可读
  function scrim(y0, y1, maxAlpha) {
    var a = maxAlpha == null ? 0.85 : maxAlpha;
    ctx.fillStyle = vGradient(0, y0, y1, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,' + (a * 0.6) + ')'], [1, 'rgba(0,0,0,' + a + ')']]);
    ctx.fillRect(0, y0, W, y1 - y0);
  }

  // 圆形头像（无图时用首字兜底）
  // 候选人头像切图（Figma 497:25319  26×26）：本地包内优先，缺失回落 CDN 图
  var IM_AV = {
    pijiu:    'media/live/av-pijiu.png',
    tiaojiu:  'media/live/av-tiaojiu.png',
    zhuchang: 'media/live/av-zhuchang.png',
    lingwu:   'media/live/av-lingwu.png'
  };
  function avatar(id, cx, cy, r) {
    var cand = M3.Story.candidates[id];
    // v1.0.9: 直接用 CDN 高清头像；本地 26×26 av-*.png 已淘汰（放大会糊）。
    // Loader 会在初始化阶段预热这些图；未命中时按需 loadImage 兜底。
    var im = M3.Loader.getImage(cand.avatar);
    if (!im && cand.avatar) {
      M3.Loader.loadImage(cand.avatar, function () {});
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (im && im.width) {
      var s = Math.max(r * 2 / im.width, r * 2 / im.height);
      try { ctx.drawImage(im, cx - im.width * s / 2, cy - im.height * s / 2, im.width * s, im.height * s); } catch (e) {}
    } else {
      ctx.fillStyle = cand.color;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      text(cand.short[0], cx, cy + r * 0.35, '700 ' + Math.round(r) + 'px sans-serif', '#fff', 'center');
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  // 设计 y → 屏幕 y（设计 paddingTop 54 视作状态栏，之后按安全区锚定）
  function dTop(d, s) { return TOP + (d - 54) * s; }

  // ─── 顶部主播卡（Figma 442:9391 顶部蒙版及其子节点）─────────────
  function topBar(muted) {
    var s = ds();

    // v1.0.11 顶部蒙版：原设计 168×.80 太重（用户反馈约 30% 高度的灰色阴影盖住视频画面）
    //   → 收窄到 96 高度，最深 alpha 从 .80 降到 .32，保证「主播卡文字可读」但不吃画面
    var mh = dTop(96, s);
    ctx.fillStyle = vGradient(0, 0, mh, [
      [0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,.24)'], [1, 'rgba(0,0,0,.32)']
    ]);
    ctx.fillRect(0, 0, W, mh);

    // 442:9392 清爽版-主播信息区 11,59 121×36 r20 #19034180 + 0.5px #C293FF8F
    var cy = dTop(59, s), ch = 36 * s;
    fillRound(11 * s, cy, 121 * s, ch, 20 * s, CARD_BG);
    strokeRound(11 * s, cy, 121 * s, ch, 20 * s, CARD_LINE, Math.max(0.5, 0.5 * s));

    // I442:9392;2751:450195 频道双头像 13,59 32×36
    if (!drawIm(IM_HOST, 13 * s, cy, 32 * s, 36 * s)) avatar('pijiu', 29 * s, cy + 18 * s, 15 * s);

    // 昵称 51,62 12px/17 500 #FFFFFF
    text('提艾默酒吧', 51 * s, dTop(62, s) + 13 * s,
         '500 ' + Math.round(12 * s) + 'px sans-serif', '#FFFFFF');
    // 点赞 51,79 9px/13 400 #FFFFFF @ .8
    ctx.globalAlpha = 0.8;
    text('9999万本场点赞', 51 * s, dTop(79, s) + 10 * s,
         '400 ' + Math.round(9 * s) + 'px sans-serif', '#FFFFFF');
    ctx.globalAlpha = 1;

    // 442:9431 Group 2090053608 144,59 36×36
    // v1.0.15：静音图标改用文字符号替代 canvas 画的喇叭，避免斜杠出现异常锯齿
    //   开声：金底 · 白色 🔊；静音：红底 · 白色 🔇
    var fx = 144 * s, fw = 36 * s;
    var mutedBg  = muted ? 'rgba(255,71,110,.35)' : 'rgba(255,221,102,.30)';
    var mutedLn  = muted ? '#ff477e' : '#ffdd66';
    fillRound(fx, cy, fw, fw, fw / 2, mutedBg);
    strokeRound(fx, cy, fw, fw, fw / 2, mutedLn, Math.max(1, s));
    var glyph = muted ? '🔇' : '🔊';
    ctx.save();
    text(glyph, fx + fw / 2, cy + fw / 2 + 7 * s,
         '600 ' + Math.round(18 * s) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif',
         '#ffffff', 'center');
    ctx.restore();
    push(fx, cy, fw, fw, 'mute');

    // 442:9439 小游戏功能：真机由快手原生胶囊占位，仅 H5 预览兜底绘制
    if (!M3.Loader.isKS) {
      drawIm('media/login/pill-home.png', 261 * s, cy - 0, 48 * s, 34 * s);
      drawIm('media/login/pill-more.png', 317 * s, cy - 0, 78 * s, 34 * s);
    }

    // 排名卡设计位于 y=103
    return dTop(103, s);
  }

  // ─── 实时排名榜（Figma 481:17817「排名」11,103 140×200）────────
  function rankPanel(y0, ranking, pulses, focusId) {
    var s = ds();
    var px = 11 * s, py = dTop(103, s), pw = 140 * s, ph = 200 * s;

    fillRound(px, py, pw, ph, 12 * s, RANK_BG);
    innerGlow(px, py, pw, ph, 12 * s, GLOW);

    // 标题行：团员排名 12px/500 #FFDC90 ｜ 实时应援 10px/400 #FFFFFF @ .6
    var baseTitle = dTop(111, s) + 10 * s;
    text('团员排名', 19 * s, baseTitle, '500 ' + Math.round(12 * s) + 'px sans-serif', GOLD);
    ctx.globalAlpha = 0.6;
    // v1.0.10 "实时应援"往左挪 20px 避免与折叠按钮重叠
    text('实时应援', 118 * s, baseTitle, '400 ' + Math.round(10 * s) + 'px sans-serif', '#FFFFFF', 'right');
    ctx.globalAlpha = 1;

    // 4 行：19,131 起，124×38 r8，间距 42
    // 背景 linear-gradient(90deg,#dd00ff00 0%,#dd00ff3d 100%)
    var now = Date.now(), n = Math.min(ranking.length, 4);
    for (var i = 0; i < n; i++) {
      var it = ranking[i];
      var cand = M3.Story.candidates[it.id];
      var ry = dTop(131 + i * 42, s), rx = 19 * s, rw = 124 * s, rh = 38 * s;

      // 命中脉冲：票数变化时轻微放大
      var pt = pulses[it.id], sc = 1;
      if (pt) {
        var age = now - pt;
        if (age < 480) sc = 1 + (1 - age / 480) * 0.12 * Math.sin(age / 480 * Math.PI);
        else delete pulses[it.id];
      }

      // 行底渐变（Figma I497:24536;481:16457 等 124×38 r8）：
      //   All in 行 = linear-gradient(90deg,#d0f0,#d0f) 实心紫高亮
      //   其余行   = linear-gradient(90deg,#d0f0,#dd00ff3d) 淡底
      var isAllIn = focusId === it.id;
      var g = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      g.addColorStop(0, 'rgba(221,0,255,0)');
      g.addColorStop(1, isAllIn ? 'rgba(221,0,255,1)' : 'rgba(221,0,255,.24)');
      ctx.fillStyle = g; roundRect(rx, ry, rw, rh, 8 * s); ctx.fill();

      // 名次 11px/700，按位配色
      text(i + 1, 29 * s, ry + 23 * s,
           '700 ' + Math.round(11 * s) + 'px sans-serif',
           RANK_NO_COLOR[i] || '#FFFFFF', 'center');
      // 头像 39,+6 26×26
      avatar(it.id, 52 * s, ry + 19 * s, 13 * s * sc);
      // 名称 11px/500 #fff
      text(cand.short, 71 * s, ry + 16 * s,
           '500 ' + Math.round(11 * s) + 'px sans-serif', '#FFFFFF');
      // All in 标记（Figma 481:16490  107,142 32×17）：渐变文字
      //   linear-gradient(90deg,#ff90f466,#ff90f4cc)，Canvas 用横向渐变填充近似
      if (isAllIn) {
        var af = '800 ' + Math.round(12 * s) + 'px sans-serif';
        var ax2 = 139 * s, aw2 = 32 * s;
        var ag = ctx.createLinearGradient(ax2 - aw2, 0, ax2, 0);
        ag.addColorStop(0, 'rgba(255,144,244,.40)');
        ag.addColorStop(1, 'rgba(255,144,244,.80)');
        ctx.save();
        ctx.font = af; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = ag;
        ctx.fillText('All in', ax2, ry + 17 * s);
        ctx.restore();
      }
      // 票数 10px/400 #fff @ .6
      ctx.globalAlpha = sc > 1.01 ? 1 : 0.6;
      text(it.votes + '票', 71 * s, ry + 29 * s,
           '400 ' + Math.round(10 * s) + 'px sans-serif', sc > 1.01 ? GOLD : '#FFFFFF');
      ctx.globalAlpha = 1;
    }
    return py + ph;
  }

  // ─── v1.0.8 一键折叠：团员排名+弹幕区收起后的"互动区"胶囊 ─────
  // 展示在排名榜位置，点击展开
  function hudCollapsedPill(y0) {
    var s = ds();
    var px = 11 * s, py = dTop(103, s), pw = 92 * s, ph = 28 * s;
    fillRound(px, py, pw, ph, 14 * s, CARD_BG);
    strokeRound(px, py, pw, ph, 14 * s, CARD_LINE, Math.max(0.5, 0.5 * s));
    // 左侧小箭头（展开）
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(1.2, 1.4 * s);
    ctx.lineCap = 'round';
    var ax = px + 12 * s, ay = py + ph / 2;
    ctx.beginPath();
    ctx.moveTo(ax + 3 * s, ay - 4 * s);
    ctx.lineTo(ax - 2 * s, ay);
    ctx.lineTo(ax + 3 * s, ay + 4 * s);
    ctx.stroke();
    ctx.restore();
    text('互动区', px + pw / 2 + 6 * s, py + 19 * s,
         '500 ' + Math.round(12 * s) + 'px sans-serif', GOLD, 'center');
    push(px - 4 * s, py - 4 * s, pw + 8 * s, ph + 8 * s, 'toggle_hud');
    return py + ph;
  }

  // ─── v1.0.8 排名榜右下角"收起"按钮（右上角小三角） ───────────
  function hudCollapseBtn(y) {
    var s = ds();
    // 排名榜右上角浮一个 26×26 圆按钮：向上箭头 = 收起
    var bx = 11 * s + 140 * s - 30 * s, by = dTop(107, s), bw = 22 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.arc(bx + bw / 2, by + bw / 2, bw / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(1.2, 1.4 * s);
    ctx.lineCap = 'round';
    var cx = bx + bw / 2, cy = by + bw / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 4 * s, cy + 1 * s);
    ctx.lineTo(cx,         cy - 3 * s);
    ctx.lineTo(cx + 4 * s, cy + 1 * s);
    ctx.stroke();
    ctx.restore();
    push(bx - 4 * s, by - 4 * s, bw + 8 * s, bw + 8 * s, 'toggle_hud');
  }

  // ─── 小时榜标签（Figma 442:9498  285,103 118×26 r20）──────────
  function hourTag(label) {
    var s = ds();
    ctx.font = '400 ' + Math.round(12 * s) + 'px sans-serif';
    var tw = ctx.measureText(label).width;
    var w = Math.max(118 * s, tw + 16 * s);
    var x = W - 11 * s - w, y = dTop(103, s), h = 26 * s;
    fillRound(x, y, w, h, 20 * s, CARD_BG);
    strokeRound(x, y, w, h, 20 * s, CARD_LINE, Math.max(0.5, 0.5 * s));
    text(label, x + w / 2, y + 17 * s, '400 ' + Math.round(12 * s) + 'px sans-serif', GOLD, 'center');
    return y + h;
  }

  // ─── 弹幕（Figma 442:9486/9489/9492/9495「常规消息」）──────────
  //   胶囊 x=11 h=22 r20 #19034180 + 0.5px #C293FF8F，padding 2px 6px，行距 26
  //   用户名 10px/500 #FFDC90，正文 10px/500 #FFFFFF
  function danmu(list, y0, maxH) {
    if (!list.length) return;
    var s = ds();
    var lh = 26 * s, capH = 22 * s;
    var n = Math.min(list.length, Math.max(0, Math.floor(maxH / lh)));
    if (!n) return;
    var start = list.length - n;
    var fName = '500 ' + Math.round(10 * s) + 'px sans-serif';
    var fBody = '500 ' + Math.round(10 * s) + 'px sans-serif';
    var maxW = W - 22 * s;

    for (var i = 0; i < n; i++) {
      var d = list[start + i];
      var y = y0 + i * lh;
      var age = Date.now() - d.t0;
      var alpha = age < 240 ? age / 240 : 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      var name = d.user + '：';
      ctx.font = fName;
      var nw = ctx.measureText(name).width;
      var body = ellipsis(d.text, maxW - nw - 12 * s, fBody);
      ctx.font = fBody;
      var bw = ctx.measureText(body).width;
      var cw = nw + bw + 12 * s;

      fillRound(11 * s, y, cw, capH, 20 * s, CARD_BG);
      strokeRound(11 * s, y, cw, capH, 20 * s, CARD_LINE, Math.max(0.5, 0.5 * s));
      var by = y + 15 * s;
      text(name, 17 * s, by, fName, GOLD);
      text(body, 17 * s + nw, by, fBody, '#FFFFFF');
      ctx.restore();
    }
  }

  // ─── PK 进度条：头像 ─ 渐变条 ─ 头像 ──────────────────────────
  //   左 = 你 all in 的候选人，右 = 龙哥支持的对手；条内渐变按票数比例分割
  function pkBar(y, ranking, supportId, rivalId) {
    var s = ds();
    var a = null, b = null;
    // 有明确的 all in / 对手时按人锁定，否则回落前两名
    for (var i = 0; i < ranking.length; i++) {
      if (supportId && ranking[i].id === supportId) a = ranking[i];
      if (rivalId   && ranking[i].id === rivalId)   b = ranking[i];
    }
    if (!a) a = ranking[0] || { votes: 1, id: '' };
    if (!b) b = (ranking[1] && ranking[1].id !== a.id) ? ranking[1]
                                                      : (ranking[0] || { votes: 1, id: '' });

    var sum = Math.max(1, a.votes + b.votes);
    var l = a.votes / sum;
    var r = 13 * s;                        // 头像半径（26 直径，与排名行一致）
    var barH = 14 * s;
    var x0 = 11 * s, x1 = W - 11 * s;
    var bx = x0 + r * 2 + 6 * s;           // 条左端：让开左头像
    var bw = (x1 - r * 2 - 6 * s) - bx;    // 条宽：让开右头像
    var by = y + (r * 2 - barH) / 2;

    // ① 底槽
    fillRound(bx, by, bw, barH, barH / 2, 'rgba(0,0,0,.45)');
    // ② 渐变条：左粉 → 分割点 → 右紫
    ctx.save();
    roundRect(bx, by, bw, barH, barH / 2); ctx.clip();
    var lg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    lg.addColorStop(0, '#ff0fac');
    lg.addColorStop(Math.max(0.001, l - 0.06), '#ff90f4');
    lg.addColorStop(Math.min(0.999, l + 0.06), '#7118ff');
    lg.addColorStop(1, '#3a0d8f');
    ctx.fillStyle = lg; ctx.fillRect(bx, by, bw, barH);
    // 分割亮缝
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(bx + bw * l - 1 * s, by, 2 * s, barH);
    ctx.restore();

    // ③ 百分比：贴条内两端
    var pf = '700 ' + Math.round(9 * s) + 'px sans-serif';
    text(Math.round(l * 100) + '%', bx + 8 * s, by + barH / 2 + 3 * s, pf, '#FFFFFF');
    text(Math.round((1 - l) * 100) + '%', bx + bw - 8 * s, by + barH / 2 + 3 * s,
         pf, '#FFFFFF', 'right');

    // ④ 两侧头像：压在条端之上
    if (a.id) avatar(a.id, x0 + r, y + r, r);
    if (b.id) avatar(b.id, x1 - r, y + r, r);

    return y + r * 2;
  }

  // ─── 礼物格一行（Figma 473:14803 与 452:13015 共用同一套规范）──────
  //   5 × 75×90 r12 #30007ECC + inset glow，起点 x=11，间距 79
  function giftRow(gy, stars, s) {
    var gifts = M3.Story.gifts;
    for (var i = 0; i < gifts.length && i < 5; i++) {
      var gi = gifts[i];
      var gx = (11 + i * 79) * s, gw = 75 * s, gh = 90 * s;
      var afford = stars >= gi.cost;

      fillRound(gx, gy, gw, gh, 12 * s, GIFT_BG);
      innerGlow(gx, gy, gw, gh, 12 * s, GLOW);

      ctx.globalAlpha = afford ? 1 : 0.45;
      // 图标 46×46 @ +14,+8
      if (!drawIm(GIFT_IM[i], gx + 14 * s, gy + 8 * s, 46 * s, 46 * s)) {
        text(gi.icon, gx + gw / 2, gy + 40 * s,
             '600 ' + Math.round(26 * s) + 'px sans-serif', '#fff', 'center');
      }
      // 名称 11px/500 #fff @ +54，价格 8px/600 #FFDC90 @ +71
      text(ellipsis(gi.name, gw - 6 * s, '500 ' + Math.round(11 * s) + 'px sans-serif'),
           gx + gw / 2, gy + 66 * s,
           '500 ' + Math.round(11 * s) + 'px sans-serif', '#FFFFFF', 'center');
      text(gi.cost + '星光', gx + gw / 2, gy + 80 * s,
           '600 ' + Math.round(8 * s) + 'px sans-serif', GOLD, 'center');
      ctx.globalAlpha = 1;

      if (afford) push(gx, gy, gw, gh, 'gift:' + gi.id);
      else        push(gx, gy, gw, gh, 'need_stars:' + gi.cost);  // v1.0.9 点击置灰礼物弹窗
    }
  }

  // ─── 胶囊按钮（Figma 452:13067/13088/13091  r34 h44）────────────
  //   kind='grad' → linear-gradient(93.58deg,#ff0fac,#7118ff 51.44%,#001eff) + inset glow
  //   kind='white'→ #FFFFFF 底 / #35066A 字
  function pill(x, y, w, h, label, kind, action, s) {
    var r = 34 * s;
    if (kind === 'white') {
      fillRound(x, y, w, h, r, '#FFFFFF');
    } else if (kind === 'off') {
      fillRound(x, y, w, h, r, 'rgba(120,110,140,.45)');
    } else {
      var g = ctx.createLinearGradient(x, y + h, x + w, y);
      g.addColorStop(0, '#ff0fac');
      g.addColorStop(0.5144, '#7118ff');
      g.addColorStop(1, '#001eff');
      ctx.fillStyle = g;
      roundRect(x, y, w, h, r); ctx.fill();
      innerGlow(x, y, w, h, r, 'rgba(255,255,255,.62)');
    }
    text(label, x + w / 2, y + h / 2 + 5 * s,
         '600 ' + Math.round(14 * s) + 'px sans-serif',
         kind === 'white' ? '#35066A' : (kind === 'off' ? 'rgba(255,255,255,.5)' : '#FFFFFF'),
         'center');
    if (action) push(x, y, w, h, action);
  }

  // ─── 变装定装弹窗（Figma 452:13015  0,707 414×189  r16/16/0/0 #190047CC）──
  //   与常态 dock 的差异：无「送给」选择器；星光/看广告位换成 保存到手机/继续游戏
  //   452:13091 保存到手机 (57,721) 142×44 白底   452:13088 继续游戏 (215,721) 142×44 渐变
  //   452:13016… 礼物行 (11,774) 与 dock 同规范
  // ─── 变装定装弹窗底部双按钮（Figma 452:13091 / 452:13088）──────────
  //   定装态下按钮以下区域保持全黑（由弹层遮罩铺满），
  //   不画 452:13015 的紫色底板与礼物行——那两者属于常态图层，仅位置重叠。
  //   452:13091 保存到手机 (57,721) 142×44 白底 / 452:13088 继续游戏 (215,721) 142×44 渐变
  function outfitSheet() {
    var s = ds();
    var py = H - 189 * s;
    var bw = 142 * s, bh = 44 * s, byy = py + (721 - 707) * s;
    pill(57 * s, byy, bw, bh, '保存到手机', 'white', 'save_outfit', s);
    pill(215 * s, byy, bw, bh, '继续游戏', 'grad', 'outfit_continue', s);
    return py;
  }

  // ─── 底部礼物面板（Figma 473:14803  0,650 414×246）───────────────
  //   异形底板为切图；内部四段：送给选择器 / 5 礼物 / 星光 / 看广告
  //   设计 y 均为局部坐标（原 schema 值 − 43），面板整体锚定屏幕底部
  var GIFT_TO = ['pijiu', 'lingwu', 'zhuchang', 'tiaojiu'];   // 设计稿顺序

  function dock(stars, canAd, mult, giftTo) {
    var s = ds();
    var open = !!(M3.Engine && M3.Engine.state && M3.Engine.state.giftOpen);

    // v1.0.17 【收起态 · 极简】布局重构：
    //   - 星光徽章 → 左上角（topBar 主播卡下方，独立摆放，与礼物区解耦）
    //   - 🎁 icon    → 右上角浮层（原本贴底部，与互动剧情重叠"礼物在下互动在上"很丑）
    //   - 互动剧情 → 完整占用底部区域（返回 bottom = H - 10*s，不再让位）
    if (!open) {
      var iconSz = 48 * s;
      var iconMargin = 12 * s;
      // v1.0.17 顶部胶囊 y=dTop(59) 高 36*s，icon 与 mute 处于同一水平线之上（略高）
      var iconX = W - iconSz - iconMargin;
      var iconY = dTop(103, s) + 6 * s;   // 排名榜 y0 起始点之上一点点，右侧空白区
      var icx  = iconX + iconSz / 2;
      var icy  = iconY + iconSz / 2;

      // 极轻阴影底
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur  = 12 * s;
      ctx.shadowOffsetY = 3 * s;
      ctx.beginPath(); ctx.arc(icx, icy, iconSz / 2, 0, Math.PI * 2);
      ctx.fillStyle = vGradient(iconX, iconY, iconY + iconSz, [[0, '#ff5cbe'], [1, '#a446ff']]);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = Math.max(1.4, 1.6 * s);
      ctx.beginPath(); ctx.arc(icx, icy, iconSz / 2, 0, Math.PI * 2); ctx.stroke();

      text('🎁', icx, icy + 7 * s, '700 ' + Math.round(24 * s) + 'px sans-serif', '#ffffff', 'center');
      push(iconX - 6 * s, iconY - 6 * s, iconSz + 12 * s, iconSz + 12 * s, 'toggle_gift');

      // 星光徽章：左侧独立浮层（用户明确要求"星光展示数量的放到左侧"）
      //   位置：x=11*s，y=rankPanel 下方 12px 处（rankPanel 高 200*s，y0=dTop(103, s)）
      //   金渐变胶囊突出显示，与右上角 🎁 icon 视觉呼应
      var badgeH = 30 * s;
      var badgeText = String(stars);
      ctx.font = '700 ' + Math.round(14 * s) + 'px sans-serif';
      var badgeW = ctx.measureText('★ ' + badgeText).width + 22 * s;
      var badgeX = 11 * s;
      var badgeY = dTop(103, s) + 200 * s + 12 * s;   // rankPanel 底 + 12*s 留空
      // 金渐变底 + 白描边，更醒目
      ctx.save();
      var bg = vGradient(badgeX, badgeY, badgeY + badgeH, [[0, '#ffdd66'], [1, '#ff9442']]);
      ctx.fillStyle = bg;
      roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2); ctx.fill();
      ctx.restore();
      strokeRound(badgeX, badgeY, badgeW, badgeH, badgeH / 2, 'rgba(255,255,255,.85)', Math.max(1, 1.2 * s));
      text('★ ' + badgeText, badgeX + badgeW / 2, badgeY + badgeH * 0.72,
           '700 ' + Math.round(14 * s) + 'px sans-serif', '#3a1a00', 'center');

      // 互动剧情不再避让 icon（icon 已移到右上角），返回屏幕底部一点点内边距
      return H - 10 * s;
    }

    // ═══ 【展开态】：原完整 dock ═══
    var ph = 246 * s, py = H - ph;

    // 442:9390 底部蒙版 0,566 414×330  linear-gradient(180deg,#0000 0%,#000c 50%)
    var my = H - 330 * s;
    ctx.fillStyle = vGradient(0, my, H, [
      [0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,.80)'], [1, 'rgba(0,0,0,.80)']
    ]);
    ctx.fillRect(0, my, W, 330 * s);

    // 面板异形底板
    if (!drawIm(IM_PANEL, 0, py, W, ph)) fillRound(0, py, W, ph, 12 * s, 'rgba(48,0,126,.86)');

    function ly(d) { return py + (d - 650) * s; }   // 设计局部 y → 屏幕 y

    // ① 送给：文案 12px/400 #fff @ (11,676)
    text('送给', 11 * s, ly(676) + 12 * s, '400 ' + Math.round(12 * s) + 'px sans-serif', '#FFFFFF');

    // ①b 收起按钮（收起 giftOpen 面板）
    (function drawCloseBtn() {
      var ew = 28 * s, eh = 28 * s;
      var ex = W - ew - 12 * s, ey = ly(662);
      var cx = ex + ew / 2, cy = ey + eh / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.arc(cx, cy, ew / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.lineWidth = Math.max(1, s); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.4, 1.6 * s);
      ctx.lineCap = 'round';
      var d = 6 * s;
      ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
      ctx.restore();
      push(ex - 4 * s, ey - 4 * s, ew + 8 * s, eh + 8 * s, 'toggle_gift');
      text('收起', cx, ey - 3 * s,
           '600 ' + Math.round(9 * s) + 'px sans-serif',
           'rgba(255,255,255,.85)', 'center');
    })();

    // ② 候选人选择器：4 × 30×44，起点 x=43，间距 42
    var cur = giftTo || M3.Model.getSupport() || (M3.Model.ranking()[0] || {}).id;
    for (var k = 0; k < GIFT_TO.length; k++) {
      var cid = GIFT_TO[k];
      var cand = M3.Story.candidates[cid];
      if (!cand) continue;
      var cx = (43 + k * 42) * s, cyy = ly(662);
      var on = cur === cid;

      avatar(cid, cx + 15 * s, cyy + 15 * s, 15 * s);
      if (on) {
        var bx2 = cx + 20 * s, by2 = cyy + 20 * s, br = 5 * s;
        ctx.fillStyle = PICK;
        ctx.beginPath(); ctx.arc(bx2 + br, by2 + br, br, 0, Math.PI * 2); ctx.fill();
        if (!drawIm(IM_CHECK, bx2 + 2 * s, by2 + 2 * s, 6 * s, 6 * s)) {
          ctx.save();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 1.2 * s);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(bx2 + 2.4 * s, by2 + 5 * s);
          ctx.lineTo(bx2 + 4.2 * s, by2 + 6.8 * s);
          ctx.lineTo(bx2 + 7.6 * s, by2 + 3.2 * s);
          ctx.stroke();
          ctx.restore();
        }
      }
      text(cand.short, cx + 15 * s, ly(694) + 10 * s,
           '400 ' + Math.round(10 * s) + 'px sans-serif', on ? PICK : '#FFFFFF', 'center');
      push(cx - 4 * s, cyy, 38 * s, 44 * s, 'giftto:' + cid);
    }

    // ③ 礼物格（与 452:13015 共用同一套规范）
    giftRow(ly(718), stars, s);

    // ④ 星光：图标 32×32 @ (11,820)，数值 20px/700
    var sy = ly(820);
    if (!drawIm(IM_STAR, 11 * s, sy, 32 * s, 32 * s)) {
      text('★', 27 * s, sy + 24 * s, '700 ' + Math.round(22 * s) + 'px sans-serif', GOLD, 'center');
    }
    text(stars, 43 * s, sy + 24 * s, '700 ' + Math.round(20 * s) + 'px sans-serif', '#FFFFFF');
    ctx.globalAlpha = 0.6;
    text('看广告 +' + M3.Config.AD_REWARD + ' 星光补给' + (mult > 1 ? ' ×' + mult : ''),
         17 * s, ly(852) + 10 * s, '400 ' + Math.round(10 * s) + 'px sans-serif', '#FFFFFF');
    ctx.globalAlpha = 1;

    // ⑤ 看广告 154×44 r34 @ (248,820)
    pill(248 * s, sy, 154 * s, 44 * s, '看广告 +' + M3.Config.AD_REWARD + '星光',
         canAd ? 'grad' : 'off', canAd ? 'supply' : null, s);

    // 面板顶端（供字幕/弹幕避让）；设计稿字幕卡底边 638，面板顶 650，留 12 间距
    return py - 12 * s;
  }

  // ─── 选项面板（分支 / 支持 / 小游戏选择）──────────────────────
  // options: [{label, sub, disabled, locked}]  返回面板顶端 Y
  function optionPanel(title, sub, options, prefix, bottomY) {
    var pad = 14, rowH = 46, gap = 8;
    var titleH = title ? 26 : 0;
    var subH   = sub ? 18 : 0;
    var h = titleH + subH + options.length * (rowH + gap) + 10;
    var y0 = (bottomY == null ? H - 12 : bottomY) - h;

    scrim(y0 - 24, y0 + h + 10, 0.8);
    if (title) text(title, W / 2, y0 + 18, '800 15px sans-serif', CO.gold, 'center');
    if (sub)   text(sub,   W / 2, y0 + titleH + 12, '500 11px sans-serif', CO.sub, 'center');

    var bx = pad, bw = W - pad * 2;
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var y = y0 + titleH + subH + i * (rowH + gap);
      var on = !o.disabled;
      fillRound(bx, y, bw, rowH, 12, on ? 'rgba(22,14,32,.72)' : 'rgba(22,14,32,.38)');
      strokeRound(bx, y, bw, rowH, 12, on ? CO.line : 'rgba(255,255,255,.10)', 1.5);
      ctx.globalAlpha = on ? 1 : 0.45;
      var lf = '700 14px sans-serif';
      var tx = o.sub ? y + rowH / 2 - 2 : y + rowH / 2 + 5;
      text(ellipsis(o.label, bw - 40, lf), W / 2, tx, lf, '#ffeec2', 'center');
      if (o.sub) text(ellipsis(o.sub, bw - 40, '500 10px sans-serif'), W / 2, y + rowH / 2 + 14, '500 10px sans-serif', CO.sub, 'center');
      if (o.locked) text('🔒', bx + 12, y + rowH / 2 + 5, '700 13px sans-serif', CO.gold);
      ctx.globalAlpha = 1;
      if (on) push(bx, y, bw, rowH, prefix + ':' + i);
    }
    return y0;
  }

  // ─── 单个"继续"按钮 ─────────────────────────────────────────
  // v1.0.15：高度 +50%（46 → 69），字号从 16 提升到 20，避免视觉上太弱
  function continueBtn(label, bottomY) {
    var bw = Math.min(W - 60, 280), bh = 69;
    var bx = (W - bw) / 2, by = (bottomY == null ? H - 20 : bottomY) - bh;
    ctx.fillStyle = vGradient(bx, by, by + bh, [[0, CO.gold], [1, CO.goldDim]]);
    roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    // 高亮
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1.5;
    roundRect(bx + 3, by + 3, bw - 6, bh - 6, (bh - 6) / 2); ctx.stroke();
    ctx.restore();
    text(label || '继续 ▸', bx + bw / 2, by + bh / 2 + 8, '800 20px sans-serif', '#3a1d05', 'center');
    push(bx, by, bw, bh, 'next');
    return by;
  }

  // ─── 字幕条（说话人 + 打字机台词）────────────────────────────
  // 视觉规范对齐 Figma 442:9434：
  //   卡片 radius 12 / 背景 #47003F CC / inset 发光 #DF0DFF 30%
  //   卡片宽 392（设计稿 424 内容宽），左右内边距 16，上下内边距 12
  //   正文 14px 行高 20px，说话人 #FBCBFF 与首行同排
  // 字号随 ds() 缩放，在 caption() 内动态拼装
  var CAP_NAME_COLOR = '#FBCBFF';
  var CAP_BG         = 'rgba(71,0,63,.80)';   // #47003F @ CC
  var CAP_GLOW       = 'rgba(223,13,255,.30)'; // #DF0DFF @ 4D
  var CAP_PAD_X = 16, CAP_PAD_Y = 12, CAP_LINE = 20, CAP_RADIUS = 12;

  // 首行需为说话人让出宽度，后续行占满
  function wrapIndent(str, firstW, restW, font) {
    ctx.font = font;
    var lines = [], line = '', maxW = firstW;
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      var t = line + str[i];
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line); line = str[i]; maxW = restW;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  // 描边模拟 inset 发光（Canvas 无 inset shadow）
  function innerGlow(x, y, w, h, r, color) {
    ctx.save();
    roundRect(x, y, w, h, r); ctx.clip();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18.6;
    ctx.lineWidth = 3;
    roundRect(x + 1.5, y + 1.5, w - 3, h - 3, r); ctx.stroke();
    ctx.stroke();
    ctx.restore();
  }

  // extra: { gap: 正文后间距, h: 附加区高度, draw: function(x, y, w, s) }
  //   Figma 各字幕卡同源，仅正文行数与附加区不同：
  //     452:13094 44  = 12 + 1×20 + 12                    （单行台词）
  //     442:9434  64  = 12 + 2×20 + 12                    （两行台词）
  //     442:9685  96  = 12 + 2×20 + [8+24] + 12           （+点击继续）
  //     442:9955  100 = 12 + [20+8+48] + 12               （无台词，提问+四选一）
  //     442:10036 152 = 12 + 2×20 + [12+20+8+48] + 12     （台词+提问+四选一）
  function caption(who, str, chars, bottomY, extra) {
    // 无台词且无附加区才跳过；442:9955 是纯选项卡，没有旁白正文
    if (!str && !extra) return bottomY == null ? H : bottomY;
    var s = ds();

    var cardW = Math.min(392 * s, W - 16 * s);
    var cardX = (W - cardW) / 2;
    var padX = CAP_PAD_X * s, padY = CAP_PAD_Y * s, lineH = CAP_LINE * s;
    var innerW = cardW - padX * 2;

    var nameFont = '500 ' + Math.round(14 * s) + 'px sans-serif';
    var bodyFont = '400 ' + Math.round(14 * s) + 'px sans-serif';

    ctx.font = nameFont;
    var nameStr = who && str ? String(who) + '：' : '';
    var nameW = nameStr ? ctx.measureText(nameStr).width : 0;

    var lines = [], fullLines = [];
    if (str) {
      // 高度按完整文案测算，避免打字机逐字时卡片高度跳动
      fullLines = wrapIndent(str, innerW - nameW, innerW, bodyFont);
      if (fullLines.length > 3) fullLines = fullLines.slice(0, 3);
      var shown = chars == null ? str : str.substring(0, chars);
      lines = wrapIndent(shown, innerW - nameW, innerW, bodyFont);
      if (lines.length > 3) lines = lines.slice(0, 3);
    }

    var exH = extra ? extra.h * s : 0;
    // 行高按实际行数（442:13094 单行=44，442:9434 两行=64）
    var textH = str ? fullLines.length * lineH : 0;
    // 正文与附加区的间距由附加区声明；无正文时不留间距
    //   442:9685 gap 8 / 442:10036 gap 12 / 442:9955 无正文 gap 0
    var gapH = (str && extra && extra.gap) ? extra.gap * s : 0;
    var h = padY * 2 + textH + gapH + exH;
    var y0 = (bottomY == null ? H - 10 * s : bottomY) - h;

    fillRound(cardX, y0, cardW, h, CAP_RADIUS * s, CAP_BG);
    innerGlow(cardX, y0, cardW, h, CAP_RADIUS * s, CAP_GLOW);

    var tx0 = cardX + padX;
    var baseY0 = y0 + padY + 15 * s;
    if (who) text(nameStr, tx0, baseY0, nameFont, CAP_NAME_COLOR);
    for (var li = 0; li < lines.length; li++) {
      text(lines[li], li === 0 ? tx0 + nameW : tx0, baseY0 + li * lineH, bodyFont, '#FFFFFF');
    }

    // 附加区紧随正文（含间距），坐标交给调用方按设计稿绘制
    if (extra && extra.draw) extra.draw(cardX, y0 + padY + textH + gapH, cardW, s);
    return y0;
  }

  // 卡内「点击继续」（Figma 442:9687  78×24 r28 #000 @20%，距卡右 16 / 底 12）
  function capContinue() {
    return {
      gap: 8, h: 24,
      draw: function (cx, cy, cw, s) {
        var bw = 78 * s, bh = 24 * s;
        var bx = cx + cw - 16 * s - bw, by = cy;
        ctx.save();
        ctx.globalAlpha = 0.2;
        fillRound(bx, by, bw, bh, 28 * s, '#000000');
        ctx.restore();
        text('点击继续', bx + 8 * s, by + 17 * s,
             '500 ' + Math.round(12 * s) + 'px sans-serif', '#FFFFFF');
        if (!drawIm(IM_ARROW, bx + 58 * s, by + 6 * s, 12 * s, 12 * s)) {
          ctx.save();
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, 1.4 * s);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(bx + 61 * s, by + 8 * s);
          ctx.lineTo(bx + 65 * s, by + 12 * s);
          ctx.lineTo(bx + 61 * s, by + 16 * s);
          ctx.stroke();
          ctx.restore();
        }
        push(bx - 6 * s, by - 6 * s, bw + 12 * s, bh + 12 * s, 'next');
      }
    };
  }

  // 卡内四选一（Figma 442:9957/9961/9965/9969 与 442:10040 同规范）
  //   按钮 90×48 r12 #790574CC + inset 0 0 18.6px #DF0DFF4D，间距 4
  //   有价：标签 11px/500 #fff @+10，价格 8px/600 #FFDC90 @+27（442:9959/9960）
  //   无价：标签垂直居中（442:9971 paddingTop 17）
  //   opts: [{label, cost, disabled}]   prompt 行 14px/500 #FBCBFF
  // 按钮总跨度恒为 372（卡内容宽 392 左右各留 10），间距恒 4
  //   3 个 → 121.3 宽（设计 121）｜4 个 → 90 宽（设计 90）｜5 个 → 69 宽（设计 69）
  var CAP_BTN_H = 48;
  var CAP_BTN_SPAN = 372, CAP_BTN_GAP = 4;

  // 按钮内标签最多折 2 行（设计稿标签都是单行，但剧本里有「星河闪耀 · 这榜我守了」这类长文案）
  function btnLines(label, maxW, font) {
    ctx.font = font;
    label = String(label == null ? '' : label);
    if (ctx.measureText(label).width <= maxW) return [label];
    var lines = [], line = '';
    for (var i = 0; i < label.length; i++) {
      var t = line + label[i];
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line); line = label[i];
      } else line = t;
    }
    if (line) lines.push(line);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = ellipsis(lines[1] + '…', maxW, font);
    }
    return lines;
  }

  function capOptions(prompt, opts, prefix) {
    return {
      // 442:10036 正文后间距 12；442:9955 无正文时 caption 会忽略 gap
      gap: 12, h: 20 + 8 + CAP_BTN_H,
      draw: function (cx, cy, cw, s) {
        // cy 已是附加区顶端（caption 已加过 gap）
        if (prompt) {
          var pf = '500 ' + Math.round(14 * s) + 'px sans-serif';
          text(ellipsis(prompt, cw - 32 * s, pf), cx + 16 * s, cy + 15 * s, pf, CAP_NAME_COLOR);
        }
        var by = cy + (20 + 8) * s;
        var lf = '500 ' + Math.round(11 * s) + 'px sans-serif';
        var cf = '600 ' + Math.round(8 * s) + 'px sans-serif';
        var n = Math.min(opts.length, 4);
        // 按钮宽度随个数动态：总跨度恒 372、间距恒 4
        //   3 个 → 121.3（设计 497:25421 为 121）｜4 个 → 90（设计 497:25285 为 90）
        var bwD = (CAP_BTN_SPAN - (n - 1) * CAP_BTN_GAP) / n;
        var bw = bwD * s, bh = CAP_BTN_H * s;
        var stepD = bwD + CAP_BTN_GAP;
        var x0 = cx + (cw - CAP_BTN_SPAN * s) / 2;
        for (var i = 0; i < n; i++) {
          var o = opts[i];
          var bx = x0 + i * stepD * s;
          var on = !o.disabled;
          fillRound(bx, by, bw, bh, 12 * s, on ? 'rgba(121,5,116,.80)' : 'rgba(121,5,116,.38)');
          if (on) innerGlow(bx, by, bw, bh, 12 * s, GLOW);
          ctx.globalAlpha = on ? 1 : 0.45;

          var lines = btnLines(o.label, bw - 10 * s, lf);
          // 副标题：o.sub 为原文（如「暂不下场」「看广告再战」），o.cost 为价格档位
          var subTxt = o.sub || (o.cost ? o.cost + '星光' : '');
          var ty = subTxt ? (lines.length > 1 ? 16 : 21) : (lines.length > 1 ? 23 : 29);
          for (var k = 0; k < lines.length; k++) {
            text(lines[k], bx + bw / 2, by + (ty + k * 12) * s, lf, '#FFFFFF', 'center');
          }
          if (subTxt) {
            text(ellipsis(subTxt, bw - 6 * s, cf), bx + bw / 2, by + 38 * s, cf,
                 o.locked ? '#FFB0B0' : GOLD, 'center');
          }
          ctx.globalAlpha = 1;
          if (on) push(bx, by, bw, bh, prefix + ':' + i);
          else if (o.locked && o.cost) push(bx, by, bw, bh, 'need_stars:' + o.cost);   // v1.0.13 星光不足礼物选项 → 弹窗
        }
      }
    };
  }

  // ─── 字母格附加区（Figma 497:24561）────────────────────────────
  //   卡片 11,443 392×220：旁白 455 → 提示 487 → 两行字母 515/567 → 确认选择 627
  //   字母键 69×48 r12 #FFFFFF1A，5 列 step 73，起点 27（卡内偏移 16）
  var IM_ARROW = 'media/live/arrow.png';
  function capLetters(prompt, options, picked, need, prefix) {
    return {
      gap: 12, h: 164,
      draw: function (cx, cy, cw, s) {
        // ① 提示行 497:24640 14px/500 #FBCBFF
        if (prompt) {
          var pf = '500 ' + Math.round(14 * s) + 'px sans-serif';
          text(ellipsis(prompt, cw - 32 * s, pf), cx + 16 * s, cy + 15 * s, pf, CAP_NAME_COLOR);
        }
        // ② 两行字母：5 列，行距 52
        var bw = 69 * s, bh = 48 * s, step = 73 * s;
        var lf = '500 ' + Math.round(14 * s) + 'px sans-serif';
        var x0 = cx + 16 * s;
        for (var i = 0; i < options.length && i < 10; i++) {
          var r = Math.floor(i / 5), c = i % 5;
          var bx = x0 + c * step, by = cy + (28 + r * 52) * s;
          var on = picked.indexOf(options[i]) >= 0;
          // 选中态用品牌紫强调（设计稿仅给出未选态 #FFFFFF1A）
          fillRound(bx, by, bw, bh, 12 * s, on ? 'rgba(121,5,116,.92)' : 'rgba(255,255,255,.10)');
          if (on) innerGlow(bx, by, bw, bh, 12 * s, GLOW);
          text(options[i], bx + bw / 2, by + bh / 2 + 7 * s, lf, '#FFFFFF', 'center');
          push(bx, by, bw, bh, prefix + ':' + i);
        }
        // ③ 确认选择 497:24604  305,627 82×24 r28 #000 @.2（卡内偏移 294）
        var ready = picked.length === need;
        var qx = cx + 294 * s, qy = cy + 140 * s, qw = 82 * s, qh = 24 * s;
        ctx.save();
        ctx.globalAlpha = ready ? 0.2 : 0.1;
        fillRound(qx, qy, qw, qh, 28 * s, '#000000');
        ctx.restore();
        var qf = '500 ' + Math.round(12 * s) + 'px sans-serif';
        ctx.globalAlpha = ready ? 1 : 0.45;
        text(ready ? '确认选择' : '还需 ' + (need - picked.length) + ' 个',
             cx + 365 * s, qy + 16 * s, qf, '#FFFFFF', 'right');
        // 箭头 497:24606  367,633 12×12
        if (!drawIm(IM_ARROW, cx + 356 * s, qy + 6 * s, 12 * s, 12 * s)) {
          text('▸', cx + 374 * s, qy + 17 * s, qf, '#FFFFFF', 'center');
        }
        ctx.globalAlpha = 1;
        if (ready) push(qx, qy, qw, qh, 'pick_done');
      }
    };
  }

  // 按礼物 id 取其图标切图（GIFT_IM 与 Story.gifts 同序）
  function giftIcon(giftId) {
    var gs = M3.Story.gifts;
    for (var i = 0; i < gs.length; i++) if (gs[i].id === giftId) return GIFT_IM[i] || '';
    return '';
  }

  // 送礼特效大图（Figma 442:9693  260×260 @ 设计 77,409；相对字幕卡上方 133）
  //   返回 true = 仍在播放；false = 已结束（调用方清理状态）
  function giftFx(fx, cardTop) {
    if (!fx) return false;
    var s = ds();
    var age = Date.now() - fx.t0, life = 1600;
    if (age > life) return false;
    var u = age / life;
    var sz = 260 * s;
    var pop = u < 0.18 ? 0.72 + 0.28 * (u / 0.18) : 1;      // 弹出
    var w = sz * pop;
    // cardTop 为交互区顶端；无字幕卡时回落到屏幕中部偏上
    var top = (cardTop == null || cardTop >= H) ? H * 0.62 : cardTop;
    var x = (W - w) / 2, y = top - 133 * s - (w - sz) / 2;
    if (y < 40 * s) y = 40 * s;
    ctx.save();
    ctx.globalAlpha = u > 0.72 ? (1 - u) / 0.28 : 1;
    if (!drawIm(fx.im, x, y, w, w)) {
      text(fx.icon || '🎁', W / 2, y + w / 2, '700 ' + Math.round(96 * s) + 'px sans-serif', '#fff', 'center');
    }
    ctx.restore();
    return true;
  }

  // ─── 缓冲 loading ───────────────────────────────────────────
  function loading(msg) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 - 10, t = Date.now() / 1000;
    for (var i = 0; i < 8; i++) {
      var a = t * 2 + i * Math.PI / 4;
      ctx.fillStyle = 'rgba(255,216,118,' + (0.2 + i / 8 * 0.8) + ')';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    text(msg || '缓冲中…', cx, cy + 48, '600 13px sans-serif', CO.gold, 'center');
  }

  // ─── Toast ──────────────────────────────────────────────────
  function toast(list) {
    var now = Date.now();
    for (var i = list.length - 1; i >= 0; i--) {
      var t = list[i], age = now - t.t0;
      if (age < 0) continue;
      if (age > t.life) { list.splice(i, 1); continue; }
      var p = age / t.life;
      var alpha = p < 0.15 ? p / 0.15 : (p > 0.72 ? (1 - p) / 0.28 : 1);
      var cy = H * 0.36 - p * 36 - i * 40;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      var f = '800 15px sans-serif';
      ctx.font = f;
      var tw = ctx.measureText(t.text).width;
      fillRound(W / 2 - tw / 2 - 16, cy - 20, tw + 32, 34, 17, 'rgba(0,0,0,.78)');
      strokeRound(W / 2 - tw / 2 - 16, cy - 20, tw + 32, 34, 17, t.color || CO.gold, 1.5);
      text(t.text, W / 2, cy + 2, f, t.color || CO.gold, 'center');
      ctx.restore();
    }
  }

  // ─── 礼物飞行粒子 ────────────────────────────────────────────
  function particles(list, pulses) {
    var now = Date.now();
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i], age = now - p.t0;
      if (age < 0) continue;
      if (age > p.life) { pulses[p.to] = now; list.splice(i, 1); continue; }
      var u = age / p.life, eu = 1 - Math.pow(1 - u, 3);
      var mx = (1 - eu) * (1 - eu) * p.fx + 2 * (1 - eu) * eu * ((p.fx + p.tx) / 2) + eu * eu * p.tx;
      var cy = Math.min(p.fy, p.ty) - 90;
      var my = (1 - eu) * (1 - eu) * p.fy + 2 * (1 - eu) * eu * cy + eu * eu * p.ty;
      var sc = 1 - u * 0.42;
      ctx.save();
      ctx.globalAlpha = u < 0.85 ? 1 : (1 - u) / 0.15;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(mx, my, 15 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= 0.3;
      ctx.beginPath(); ctx.arc(mx, my, 24 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = u < 0.85 ? 1 : (1 - u) / 0.15;
      text(p.icon, mx, my + 5 * sc, '700 ' + Math.round(15 * sc) + 'px sans-serif', '#fff', 'center');
      ctx.restore();
    }
  }

  // ─── 全屏广播条（提艾默之夜等）────────────────────────────────
  function broadcast(msg, t0) {
    var age = Date.now() - t0;
    if (age > 3600) return false;
    var p = age / 3600;
    var alpha = p < 0.1 ? p / 0.1 : (p > 0.85 ? (1 - p) / 0.15 : 1);
    var y = TOP + 96;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = vGradient(0, y, y + 34, [[0, 'rgba(255,92,138,.92)'], [1, 'rgba(139,92,246,.92)']]);
    roundRect(10, y, W - 20, 34, 17); ctx.fill();
    text(ellipsis(msg, W - 50, '700 12px sans-serif'), W / 2, y + 22, '700 12px sans-serif', '#fff', 'center');
    ctx.restore();
    return true;
  }

  M3.UI = {
    bind: bind, frame: frame, hitZones: hitZones, push: push,
    roundRect: roundRect, fillRound: fillRound, strokeRound: strokeRound,
    text: text, wrap: wrap, ellipsis: ellipsis, vGradient: vGradient, scrim: scrim,
    dTop: dTop, ds: ds, innerGlow: innerGlow,
    avatar: avatar, topBar: topBar, rankPanel: rankPanel, danmu: danmu, pkBar: pkBar,
    hudCollapsedPill: hudCollapsedPill, hudCollapseBtn: hudCollapseBtn,
    hourTag: hourTag,
    dock: dock, outfitSheet: outfitSheet, optionPanel: optionPanel, continueBtn: continueBtn, caption: caption,
    capContinue: capContinue, capOptions: capOptions, capLetters: capLetters, giftFx: giftFx, IM_FX: IM_FX, giftIcon: giftIcon,
    IM_AV: IM_AV,
    loading: loading, toast: toast, particles: particles, broadcast: broadcast,
    get W() { return W; }, get H() { return H; }, get TOP() { return TOP; }
  };
})();
