// scene.js · Canvas 绘制层
(function () {
  var G = GameGlobal;

  var canvas = ks.createCanvas();
  var ctx = canvas.getContext('2d');
  var sys = ks.getSystemInfoSync();
  var SW = sys.windowWidth;
  var SH = sys.windowHeight;
  canvas.width = SW;
  canvas.height = SH;

  // 加载立绘（唯一图片资源）
  var portraitImg = ks.createImage();
  var portraitLoaded = false;
  portraitImg.onload = function () { portraitLoaded = true; };
  portraitImg.src = 'assets/portrait/su-anime-v1.png';

  var referenceImg = ks.createImage();
  var referenceLoaded = false;
  referenceImg.onload = function () { referenceLoaded = true; };
  referenceImg.src = 'assets/reference/su-xiaoyu-master.png';

  // 场景色（按 f1-f30 分层）
  function sceneColors(scene) {
    var s = scene || 'f1';
    // 按主题分色
    var map = {
      f1: ['#f4c78a', '#d67a3a'], f2: ['#f4c78a', '#a45f2a'],
      f3: ['#f2b17a', '#8d4a1d'], f4: ['#e3a374', '#6b3416'],
      f5: ['#c99a6c', '#3d2a1a'], f6: ['#f7b8c8', '#a44b6c'],
      f7: ['#e57373', '#7a1e1e'], f8: ['#f2c090', '#7a4519'],
      f9: ['#f0a074', '#8f4820'], f10: ['#2c3e6b', '#0f1a3a'],
      f11: ['#3d3560', '#171232'], f12: ['#c78ec9', '#5a2a6b'],
      f13: ['#a780c9', '#3d1a5c'], f14: ['#a3c99b', '#3d5a24'],
      f15: ['#8f5a7a', '#2f1a2f'], f16: ['#6f7fb6', '#1a2b5a'],
      f17: ['#b89b6c', '#5c3f1a'], f18: ['#5c7f9c', '#1f3548'],
      f19: ['#3c4a70', '#101a30'], f20: ['#f7b6d0', '#c46689'],
      f21: ['#b6c0e3', '#3a4670'], f22: ['#f4c47a', '#a56a24'],
      f23: ['#e05a4f', '#7a1512'], f24: ['#e3a374', '#6b3416'],
      f25: ['#f7d488', '#a56a1a'], f26: ['#7a7a8f', '#2b2b3d'],
      f27: ['#8f6a7a', '#3d1e2c'], f28: ['#f5f0e3', '#c9b98a'],
      f29: ['#2f3e5a', '#0f1a30'], f30: ['#3a2540', '#0f0518']
    };
    return map[s] || ['#f4c78a', '#8d4a1d'];
  }

  // === 布局区 ===
  // 顶部 HUD 60px，场景/立绘中部，对话气泡在底部 320px 起
  var LAYOUT = {
    hudH: 60,
    bubbleTop: SH - 380,
    bubbleH: 100,
    choiceTop: SH - 260,
    choiceH: 68,
    choiceGap: 8
  };

  function clear() {
    ctx.clearRect(0, 0, SW, SH);
  }

  // 顶部 HUD · 好感度条
  function drawHud(state) {
    ctx.fillStyle = 'rgba(20,10,30,0.85)';
    ctx.fillRect(0, 0, SW, LAYOUT.hudH);
    // 好感度进度条
    var barX = 16, barY = 22, barW = SW - 120, barH = 14;
    ctx.fillStyle = '#3a2540';
    ctx.fillRect(barX, barY, barW, barH);
    var pct = Math.min(1, state.favor / 200);
    var grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, '#ff85a2');
    grad.addColorStop(1, '#ff3d6b');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.strokeStyle = '#fff4';
    ctx.strokeRect(barX, barY, barW, barH);
    // 数字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('好感 ' + state.favor, barX, 12);
    // 锚点计数
    ctx.textAlign = 'right';
    ctx.fillText('★ ' + state.anchors.size + '/5', SW - 16, 12);
    // Frame 计数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd4de';
    ctx.font = '12px sans-serif';
    var idx = state.frameIndex || 0;
    ctx.fillText('F' + (idx + 1) + '/30', SW - 16, 40);
    // Mute 按钮
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd4de';
    ctx.fillText(state.muted ? '🔇' : '🔊', SW - 110, 42);
  }

  // 场景背景（渐变 + 名字标签）
  function drawScene(scene) {
    var cols = sceneColors(scene);
    var g = ctx.createLinearGradient(0, LAYOUT.hudH, 0, LAYOUT.bubbleTop);
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, LAYOUT.hudH, SW, LAYOUT.bubbleTop - LAYOUT.hudH);
  }

  // 立绘
  function drawPortrait(env) {
    if (!portraitLoaded) return;
    // 保留比例居中显示
    var maxH = LAYOUT.bubbleTop - LAYOUT.hudH - 20;
    var iw = portraitImg.width || 512;
    var ih = portraitImg.height || 768;
    var scale = Math.min(SW * 0.88 / iw, maxH / ih);
    var w = iw * scale;
    var h = ih * scale;
    var x = (SW - w) / 2;
    var y = LAYOUT.hudH + (maxH - h) / 2 + 10;
    ctx.drawImage(portraitImg, x, y, w, h);
  }

  // 底部对话气泡（角色名 + 台词）+ env 备注
  function drawBubble(node) {
    var x = 12, y = LAYOUT.bubbleTop, w = SW - 24, h = LAYOUT.bubbleH;
    // 名牌
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    // 名字
    ctx.fillStyle = '#ff3d6b';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('苏小雨', x + 14, y + 10);
    // 台词
    ctx.fillStyle = '#2a1a2a';
    ctx.font = '15px sans-serif';
    wrapText(ctx, node.text || '', x + 14, y + 32, w - 28, 20, 3);
    // env
    if (node.env) {
      ctx.fillStyle = '#8a5f7c';
      ctx.font = 'italic 11px sans-serif';
      wrapText(ctx, node.env, x + 14, y + h - 22, w - 28, 14, 1);
    }
  }

  // 3 选项按钮
  function drawChoices(choices, hoverIndex) {
    var y = LAYOUT.choiceTop;
    for (var i = 0; i < choices.length; i++) {
      var c = choices[i];
      var bx = 12, by = y + i * (LAYOUT.choiceH + LAYOUT.choiceGap);
      var bw = SW - 24, bh = LAYOUT.choiceH;
      // 背景
      var bg = i === hoverIndex ? 'rgba(255,61,107,0.95)' : 'rgba(30,15,35,0.85)';
      ctx.fillStyle = bg;
      roundRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();
      // 边框（锚点选项高亮）
      if (c.anchor) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (c.ad) {
        ctx.strokeStyle = '#7ac9ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // 图标
      var ico = c.kind === 'A' ? '♥' : c.kind === 'B' ? '★' : '○';
      ctx.fillStyle = '#ffb8c8';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ico, bx + 14, by + bh / 2);
      // 文本
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      wrapText(ctx, c.text, bx + 40, by + 14, bw - 52, 16, 2);
    }
  }

  // 反应过场（半透明覆盖 + 一段文本 + "继续")
  function drawReaction(reactionText) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, SW, SH);
    // 中央面板
    var pw = SW - 40, ph = 240;
    var px = 20, py = (SH - ph) / 2;
    ctx.fillStyle = 'rgba(30,15,35,0.98)';
    roundRect(ctx, px, py, pw, ph, 16);
    ctx.fill();
    ctx.strokeStyle = '#ff3d6b';
    ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    // 标题
    ctx.fillStyle = '#ffb8c8';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('· 反应 ·', SW / 2, py + 16);
    // 内容
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    wrapText(ctx, reactionText || '', px + 20, py + 50, pw - 40, 22, 6);
    // 继续按钮
    var bw = 160, bh = 44;
    var bx = (SW - bw) / 2, by = py + ph - bh - 20;
    ctx.fillStyle = '#ff3d6b';
    roundRect(ctx, bx, by, bw, bh, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('继续 ▶', SW / 2, by + bh / 2);
    return { x: bx, y: by, w: bw, h: bh };
  }

  // 广告卡点模态
  function drawAdModal(countdown) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, SW, SH);
    var pw = SW - 60, ph = 280;
    var px = 30, py = (SH - ph) / 2;
    ctx.fillStyle = 'rgba(30,15,35,0.98)';
    roundRect(ctx, px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#7ac9ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#7ac9ff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('📺 广告卡点', SW / 2, py + 20);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    wrapText(ctx, '观看 5 秒广告解锁 CG 立绘 · 好感 +5', px + 20, py + 60, pw - 40, 18, 3);

    // 观看广告按钮
    var bw = pw - 40, bh = 48;
    var bx = px + 20, by = py + ph - bh * 2 - 30;
    var label;
    if (countdown > 0) label = '广告播放中… ' + countdown + 's';
    else label = '观看广告 · 5s';
    ctx.fillStyle = countdown > 0 ? '#4a6a8a' : '#7ac9ff';
    roundRect(ctx, bx, by, bw, bh, 24); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, SW / 2, by + bh / 2);

    // 跳过按钮
    var by2 = by + bh + 12;
    ctx.fillStyle = '#3a2a3a';
    roundRect(ctx, bx, by2, bw, bh, 24); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('跳过（不解锁 CG）', SW / 2, by2 + bh / 2);

    return {
      watch: { x: bx, y: by, w: bw, h: bh, disabled: countdown > 0 },
      skip:  { x: bx, y: by2, w: bw, h: bh }
    };
  }

  // 结局画面
  function drawEnding(state, meta, type) {
    // 背景
    ctx.fillStyle = '#0a0510';
    ctx.fillRect(0, 0, SW, SH);
    // 参考图
    if (referenceLoaded) {
      var iw = referenceImg.width || 512;
      var ih = referenceImg.height || 768;
      var scale = Math.min(SW / iw, (SH - 260) / ih);
      var w = iw * scale, h = ih * scale;
      var x = (SW - w) / 2, y = 40;
      ctx.globalAlpha = type === 'BE' ? 0.4 : type === 'NE' ? 0.7 : 1;
      ctx.drawImage(referenceImg, x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // 底部面板
    var py = SH - 240;
    ctx.fillStyle = 'rgba(20,10,25,0.94)';
    ctx.fillRect(0, py, SW, 240);
    // 标题
    var titleColor = type === 'HE' ? '#ff5c8a' : type === 'GE' ? '#ffb56b' : type === 'NE' ? '#8fa8c9' : '#6b6b6b';
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(meta.title, SW / 2, py + 20);
    // 副
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(meta.sub, SW / 2, py + 54);
    // 台词
    ctx.fillStyle = '#ffd4de';
    ctx.font = 'italic 13px sans-serif';
    wrapText(ctx, '"' + meta.line + '"', 30, py + 82, SW - 60, 18, 2);
    // 数据
    ctx.fillStyle = '#a68fb6';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('好感 ' + state.favor + ' / 200', 30, py + 130);
    ctx.textAlign = 'right';
    ctx.fillText('锚点 ' + state.anchors.size + '/5 ' + (state.anchors.size === 5 ? '全命中 ✅' : ''), SW - 30, py + 130);
    // 重来按钮
    var bw = SW - 60, bh = 48;
    var bx = 30, by = py + 168;
    ctx.fillStyle = '#ff3d6b';
    roundRect(ctx, bx, by, bw, bh, 24); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('重新开始', SW / 2, by + bh / 2);
    return { restart: { x: bx, y: by, w: bw, h: bh } };
  }

  // 工具：圆角矩形
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function wrapText(c, text, x, y, maxW, lineH, maxLines) {
    if (!text) return;
    var str = String(text);
    var lines = [];
    var line = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      var test = line + ch;
      if (c.measureText(test).width > maxW && line.length > 0) {
        lines.push(line);
        line = ch;
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    // 若超出最后一行加省略号
    if (lines.length === maxLines && i < str.length - 1) {
      var last = lines[lines.length - 1];
      while (c.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '…';
    }
    for (var j = 0; j < lines.length; j++) {
      c.fillText(lines[j], x, y + j * lineH);
    }
  }

  // 触摸命中测试帮助
  function hit(pt, rect) {
    return rect && pt.x >= rect.x && pt.x <= rect.x + rect.w &&
           pt.y >= rect.y && pt.y <= rect.y + rect.h;
  }

  // 计算 3 选项按钮的 hit 矩形
  function getChoiceRects(count) {
    var rects = [];
    for (var i = 0; i < count; i++) {
      rects.push({
        x: 12,
        y: LAYOUT.choiceTop + i * (LAYOUT.choiceH + LAYOUT.choiceGap),
        w: SW - 24,
        h: LAYOUT.choiceH
      });
    }
    return rects;
  }
  // 视频区域（F1 播放时）
  function getVideoRect() {
    var maxH = LAYOUT.bubbleTop - LAYOUT.hudH - 20;
    var w = SW * 0.88;
    var h = maxH;
    return {
      x: (SW - w) / 2,
      y: LAYOUT.hudH + 10,
      w: w,
      h: h
    };
  }
  function getMuteRect() {
    return { x: SW - 120, y: 30, w: 40, h: 30 };
  }

  G.Scene = {
    canvas: canvas, ctx: ctx, SW: SW, SH: SH, LAYOUT: LAYOUT,
    clear: clear, drawHud: drawHud, drawScene: drawScene,
    drawPortrait: drawPortrait, drawBubble: drawBubble,
    drawChoices: drawChoices, drawReaction: drawReaction,
    drawAdModal: drawAdModal, drawEnding: drawEnding,
    getChoiceRects: getChoiceRects, getVideoRect: getVideoRect,
    getMuteRect: getMuteRect, hit: hit
  };
})();
