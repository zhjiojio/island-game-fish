/**
 * core/ui-kit.js — 通用 UI 控件库（基于 Renderer 语义 API）
 * 职责：
 *   - 标准弹窗卡片框架（带 banner-blue.png + btn-close）
 *   - Toast（屏幕中央，自动折行，淡出动画）
 *   - 星级评分渲染
 *   - Toggle 开关按钮
 *   - 通用文字按钮（圆角矩形 + 文字）
 * 注意：所有控件返回 tapArea 列表，由调用方 InputManager.addAll 注册
 * 依赖：Renderer, TextureManager, CONFIG, M3
 * 导出：UIKit
 */
(function () {
  'use strict';

  // ── Toast 状态 ───────────────────────────────────────────────────────────────
  var _toasts = [];  // [{msg, startT, duration}]

  var UIKit = window.UIKit = {

    // ── 全局按钮点击音效包装（drawButton/candyButton 统一走这里）──────────────
    /** 在原有 onTap 外包一层"选择游戏+UI点击"音效，onTap 为空时仍只播音效不报错 */
    _wrapTapSound: function (onTap) {
      return function () {
        if (window.Audio && Audio.playUiClick) Audio.playUiClick();
        if (onTap) onTap.apply(this, arguments);
      };
    },

    // ── 带高亮数值的多行文案（各卡片式弹窗共用）────────────────────────────────
    /**
     * 绘制带高亮数值的多行文案（'\n' 分行，'{xxx}' 占位符替换为对应数值并单独着色）。
     * 用于失败/解锁等卡片式弹窗的副文案：可配置的数值(加时秒数/加生命次数/看视频次数等)
     * 高亮为 valueColor，其余文字为 normalColor，与普通 Renderer.drawText 单色渲染不同，
     * 需按分段依次绘制并通过 TextRenderer.measure 累加宽度做整体居中。
     * 原实现于 lose-modal.js，因 unlock-overlays.js 等其它卡片式弹窗同样需要而提升到 UIKit 共用。
     * @param {string} template  形如 '看广告视频\n可增加{value}秒游戏时间'，或含多个占位符如
     *   '观看{remain}/{total}次视频\n解锁该系列所有关卡'
     * @param {number|string|object} value  单占位符场景直接传替换 {value} 的数值；
     *   多占位符场景传 { remain: 4, total: 5 } 形式的映射表，key 对应模板里的 {remain}/{total}
     * @param {number} cx  文本块水平居中的 x 坐标
     * @param {number} cy  文本块垂直居中的 y 坐标
     * @param {object} [opts]  { fontSize, normalColor, valueColor }
     */
    drawHighlightText: function (template, value, cx, cy, opts) {
      opts = opts || {};
      var NORMAL_COLOR = opts.normalColor || '#16115a';
      var VALUE_COLOR = opts.valueColor || '#f76664';
      var fontSize = opts.fontSize || 20;
      var lineH = fontSize * 1.4;
      var lines = template.split('\n');
      var startY = cy - (lines.length - 1) * lineH / 2;
      // value 支持两种形态：标量（兼容单占位符 {value} 场景）或映射表
      // { remain: 4, total: 5 }（支持模板里出现多个不同名占位符，各自独立高亮着色）
      var valueMap = (value !== null && typeof value === 'object') ? value : { value: value };

      lines.forEach(function (line, idx) {
        // 按 '{xxx}' 占位符切分成多段，每个占位符对应的数值单独高亮着色，其余原样输出
        var segs = [];
        var re = /\{(\w+)\}/g;
        var lastIndex = 0;
        var match;
        while ((match = re.exec(line))) {
          if (match.index > lastIndex) segs.push({ text: line.slice(lastIndex, match.index), color: NORMAL_COLOR });
          segs.push({ text: String(valueMap[match[1]]), color: VALUE_COLOR });
          lastIndex = re.lastIndex;
        }
        if (lastIndex < line.length) segs.push({ text: line.slice(lastIndex), color: NORMAL_COLOR });
        if (segs.length === 0) segs.push({ text: line, color: NORMAL_COLOR });

        var totalW = 0;
        for (var i = 0; i < segs.length; i++) {
          totalW += TextRenderer.measure(segs[i].text, fontSize, 'sans-serif');
        }
        var curX = cx - totalW / 2;
        var lineY = startY + idx * lineH;
        for (var j = 0; j < segs.length; j++) {
          var segW = TextRenderer.measure(segs[j].text, fontSize, 'sans-serif');
          Renderer.drawText(segs[j].text, curX + segW / 2, lineY, {
            fontSize: fontSize, color: segs[j].color, align: 'center', bold: true
          });
          curX += segW;
        }
      });
    },

    // ── Toast ─────────────────────────────────────────────────────────────────
    /**
     * 弹出 toast（队列机制：同时只显示一个，播完再播下一个，避免叠在一起）
     * @param {string} msg
     * @param {number} [duration]  ms，默认 CONFIG.TOAST.duration
     * @param {number} [yRatio]    垂直位置比例（0=顶部，0.45=默认中央偏上），如 0.25 表示屏幕偏上
     * @param {object} [style]     自定义样式 { w, h, radius, fontSize }
     */
    toast: function (msg, duration, yRatio, style) {
      _toasts.push({
        msg:      msg,
        duration: duration || CONFIG.TOAST.duration,
        yRatio:   yRatio != null ? yRatio : 0.45,
        style:    style || null
      });
      // 队列中只有一条时立即激活，否则等当前播完后自动激活
      if (_toasts.length === 1) {
        _toasts[0].startT = M3._now();
      }
    },

    /** 清空 toast 队列（切场景/进关时调用，避免旧 toast 残留） */
    clearToasts: function () {
      _toasts.length = 0;
    },

    /** 绘制活跃 toast（每帧调用，自动清理过期项，同时只显示一个） */
    drawToasts: function () {
      var now  = M3._now();
      var cfg  = CONFIG.TOAST;
      var W    = M3.Layout.w;
      var H    = M3.Layout.h;
      var px   = M3.Layout.px;

      if (_toasts.length === 0) return;

      var t   = _toasts[0];
      var age = now - t.startT;
      if (age >= t.duration) {
        _toasts.shift();
        if (_toasts.length > 0) _toasts[0].startT = now;
        return;
      }

      var alpha  = age < t.duration * 0.7 ? 1 : 1 - (age - t.duration * 0.7) / (t.duration * 0.3);
      var s = t.style;
      var bw, bh, radius, fontSize;

      if (s) {
        bw = px(s.w);
        bh = px(s.h);
        radius = px(s.radius);
        fontSize = px(s.fontSize);
      } else {
        bw = cfg.maxWidth;
        bh = cfg.paddingY * 2 + cfg.fontSize * 1.5;
        radius = cfg.radius;
        fontSize = cfg.fontSize;
      }

      var lineH  = fontSize * 1.5;

      var lines;
      if (!s) {
        lines = TextRenderer.wrapLines(t.msg, cfg.fontSize, cfg.maxWidth - cfg.paddingX * 2, 10);
      } else {
        lines = t.msg.split('\n');
      }

      var textH  = lines.length * lineH;
      var bx = (W - bw) / 2;
      var by = H * (t.yRatio || 0.45) - bh / 2;

      if (!s) {
        var maxLW = 0;
        for (var j = 0; j < lines.length; j++) {
          var lw = TextRenderer.measure(lines[j], cfg.fontSize);
          if (lw > maxLW) maxLW = lw;
        }
        bw = Math.min(Math.max(maxLW + cfg.paddingX * 2, cfg.minWidth), cfg.maxWidth);
        bh = textH + cfg.paddingY * 2;
        bx = (W - bw) / 2;
        by = H * (t.yRatio || 0.45) - bh / 2;
        fontSize = cfg.fontSize;
        radius = cfg.radius;
      }

      var bgAlpha = (s ? 0.6 : 0.72) * alpha;
      var bg = 'rgba(0,0,0,' + bgAlpha + ')';
      Renderer.drawRoundRect(bx, by, bw, bh, radius, { fill: bg });

      for (var k = 0; k < lines.length; k++) {
        Renderer.drawText(lines[k], W / 2, by + (bh - textH) / 2 + k * lineH, {
          fontSize: fontSize,
          color: 'rgba(255,255,255,' + alpha + ')',
          align: 'center'
        });
      }
    },

    // ── 弹窗卡片框架 ──────────────────────────────────────────────────────────
    /**
     * 绘制标准弹窗卡片（返回 tapArea 列表，其中包含关闭按钮热区）
     * @param {number} cx,cy,w,h  卡片矩形（逻辑像素）
     * @param {string} title      标题文字（绘在 banner-blue 上）
     * @param {Function} onClose
     * @param {number} priority
     * @returns {object[]}  tapAreas
     */
    drawModalCard: function (cx, cy, w, h, title, onClose, priority) {
      var cfg = CONFIG.MODAL;
      var p   = priority || 900;
      // 半透明遮罩
      Renderer.drawRect(0, 0, M3.Layout.w, M3.Layout.h, 'rgba(0,0,0,0.55)');
      // 卡片背景
      Renderer.drawRoundRect(cx, cy, w, h, cfg.cardRadius, {
        fill:    cfg.cardBg,
        stroke:  cfg.cardBorder,
        strokeW: cfg.borderWidth
      });
      // banner-blue 标题图
      var bannerW = 284, bannerH = 74;
      var bx = cx + (w - bannerW) / 2;
      var by = cy + cfg.bannerOffsetY;
      Renderer.drawImage(CONFIG.uiAsset('bannerBlue'), bx, by, bannerW, bannerH);
      if (title) {
        Renderer.drawText(title, cx + w / 2, by + bannerH / 2 - 8, {
          fontSize: 18, color: '#ffffff', fontFamily: 'sans-serif',
          strokeColor: '#2255aa', strokeWidth: 2, align: 'center'
        });
      }
      // 关闭按钮
      var closeSize = 46;
      var closeX    = cx + w - closeSize + 15;
      var closeY    = cy + 20;
      Renderer.drawImage(CONFIG.uiAsset('btnClose'), closeX, closeY, closeSize, closeSize);

      return [
        // 全屏吸收点击，防止穿透到底层场景（§4.4 铁律：遮罩类弹窗靠高 priority
        // 全屏 absorber 吃掉穿透点击）。
        // 注意：这里不能用 p-1！各弹窗内部的操作按钮（看视频/立即分享/重玩等）
        // 约定用 p-50（如 900 的卡通常配 850 的按钮），absorber 若紧贴 p 会比
        // 这些按钮优先级更高，反而把按钮点击吃掉（真实踩坑：曾导致"看视频进入"
        // 点击没反应）。固定用 500，只需低于所有弹窗内部元素（≥850）、
        // 高于所有底层场景 UI（≤200）即可。
        {
          x: 0, y: 0, w: M3.Layout.w, h: M3.Layout.h,
          priority: 500,
          label: 'modal-absorber',
          onTap: function () {}
        },
        {
          x: closeX, y: closeY, w: closeSize, h: closeSize,
          priority: p,
          label: 'modal-close',
          onTap: onClose
        }
      ];
    },

    // ── 弹窗返回按钮（统一用左上角返回样式，替代原来各弹窗右上角的 X 关闭按钮）──────
    /**
     * 绘制弹窗左上角返回按钮（与游戏页/首页左上角返回按钮同款式同位置，见 CONFIG.getBackButtonRect），
     * 弹窗关闭统一走这里，不再各自在右上角画 X（mnvXBtn）。
     * @param {Function} onClose
     * @param {number} priority
     * @returns {object}  tapArea
     */
    drawBackCloseButton: function (onClose, priority) {
      var rect = CONFIG.getBackButtonRect();
      var src = CONFIG.uiAsset('mnvBtnBack');
      var entry = src ? TextureManager.get(src) : null;
      if (entry) {
        Renderer.drawImage(src, rect.x, rect.y, rect.size, rect.size);
      } else {
        src = CONFIG.uiAsset('btnBack');
        entry = src ? TextureManager.get(src) : null;
        if (entry) {
          Renderer.drawImage(src, rect.x, rect.y, rect.size, rect.size);
        } else {
          Renderer.drawText('◀', rect.x + rect.size / 2, rect.y + rect.size / 2 - 10, {
            fontSize: 18, color: '#ffffff', align: 'center', bold: true,
            strokeColor: 'rgba(0,0,0,0.5)', strokeWidth: 2
          });
        }
      }
      return {
        x: rect.x, y: rect.y, w: rect.size, h: rect.size,
        priority: priority || 1000, label: 'modal-back-close',
        onTap: UIKit._wrapTapSound(onClose)
      };
    },

    // ── 星级渲染 ──────────────────────────────────────────────────────────────
    /**
     * 绘制星星
     * @param {number} cx,cy  中心点
     * @param {number} count  总星数
     * @param {number} filled 点亮数
     * @param {number} starW  单颗星宽度
     * @param {number} gap    星间距
     */
    drawStars: function (cx, cy, count, filled, starW, gap) {
      var totalW = count * starW + (count - 1) * gap;
      var sx     = cx - totalW / 2;
      for (var i = 0; i < count; i++) {
        var src = i < filled ? CONFIG.uiAsset('starOn') : CONFIG.uiAsset('starOff');
        Renderer.drawImage(src, sx + i * (starW + gap), cy - starW / 2, starW, starW);
      }
    },

    // ── Toggle ────────────────────────────────────────────────────────────────
    /**
     * 绘制开关并返回 tapArea
     * @param {number} x,y     左上角
     * @param {boolean} on     状态
     * @param {Function} onToggle
     * @param {number} priority
     * @returns {object}  tapArea
     */
    drawToggle: function (x, y, on, onToggle, priority) {
      var w = 52, h = 32;
      var src = on ? CONFIG.uiAsset('toggleOn') : CONFIG.uiAsset('toggleOff');
      Renderer.drawImage(src, x, y, w, h);
      return { x: x, y: y, w: w, h: h, priority: priority || 100, onTap: onToggle };
    },

    // ── 通用圆角按钮 ──────────────────────────────────────────────────────────
    /**
     * 绘制文字按钮（圆角矩形 + 居中文字）
     * @param {number} x,y,w,h
     * @param {string} text
     * @param {object} style  { bgColor, textColor, fontSize, radius, adBadge }
     * @param {Function} onTap
     * @param {number} priority
     * @returns {object}  tapArea
     */
    drawButton: function (x, y, w, h, text, style, onTap, priority) {
      var bgColor   = style.bgColor   || '#5b9ef4';
      var textColor = style.textColor || '#ffffff';
      var fontSize  = style.fontSize  || 15;
      var radius    = style.radius    || 22;

      Renderer.drawRoundRect(x, y, w, h, radius, { fill: bgColor });
      Renderer.drawText(text, x + w / 2, y + (h - fontSize) / 2, {
        fontSize: fontSize, color: textColor, align: 'center'
      });

      // 广告角标（「广告」小图标）
      if (style.adBadge) {
        Renderer.drawImage(CONFIG.uiAsset('adIcon'), x + w - 22, y + h - 22, 20, 20);
      }

      return { x: x, y: y, w: w, h: h, priority: priority || 100, label: text, onTap: UIKit._wrapTapSound(onTap) };
    },

    // ── candyButton（对齐旧版 game.js L421 candyButton / L461 drawOrangeBtn / L480 drawGreenBtn）──
    // Renderer 无渐变 API，用 hi 色单色近似原版双色渐变
    /**
     * 绘制糖果风格按钮并返回 tapArea
     * @param {number} x,y,w,h
     * @param {string} label   按钮文字
     * @param {string} color   green|orange|gold|blue|red
     * @param {Function} onTap
     * @param {object} opts    { fontSize, priority, adBadge, adBadgeOpts, dimmed }
     * @returns {object}  tapArea
     */
    candyButton: function (x, y, w, h, label, color, onTap, opts) {
      opts = opts || {};
      var palette = {
        green:  { hi: '#96e968', shadow: 'rgba(0,70,0,0.38)',   stroke: '#1a5c00', txtStroke: '#003008' },
        orange: { hi: '#ffb93c', shadow: 'rgba(90,30,0,0.45)',  stroke: '#8B2800', txtStroke: '#5a2000' },
        gold:   { hi: '#ffb93c', shadow: 'rgba(100,50,0,0.40)',  stroke: '#7a4000', txtStroke: '#3a1800' },
        blue:   { hi: '#7FD8FF', shadow: 'rgba(0,50,120,0.40)',  stroke: '#0a3a6a', txtStroke: '#0a2a50' },
        red:    { hi: '#ff9a9a', shadow: 'rgba(100,0,0,0.40)',   stroke: '#7a0000', txtStroke: '#380000' }
      };
      var p = palette[color] || palette.blue;
      var r = Math.min(h / 2, 9);
      var fontSize = opts.fontSize || 15;
      var alpha = opts.dimmed ? 0.45 : 1;

      Renderer.drawRoundRect(x + 1, y + 5, w, h, r, { fill: p.shadow });
      Renderer.drawRoundRect(x, y, w, h, r, { fill: p.hi, stroke: p.stroke, strokeW: 2.5 });
      Renderer.drawText(label, x + w / 2, y + h / 2 - (fontSize * 1.4) / 2, {
        fontSize: fontSize, color: '#ffffff', align: 'center',
        strokeColor: p.txtStroke, strokeWidth: 3, bold: true
      });

      var area = { x: x, y: y, w: w, h: h, priority: opts.priority || 100, label: 'candy-' + label, onTap: UIKit._wrapTapSound(onTap) };

      if (opts.adBadge) {
        UIKit.drawAdBadge(x, y, w, opts.adBadgeOpts || {});
      }

      return area;
    },

    // ── 图片按钮（整图即按钮，无图时回退为 candyButton 文字按钮）──────────────
    /**
     * 绘制图片按钮并返回 tapArea；assetKey 对应贴图缺失时自动回退为糖果按钮
     * @param {number} x,y,w,h
     * @param {string} assetKey    CONFIG.UI_ASSETS key
     * @param {Function} onTap
     * @param {object} opts  { priority, adBadge, adBadgeOpts, fallbackLabel, fallbackColor, fallbackFontSize }
     * @returns {object} tapArea
     */
    imageButton: function (x, y, w, h, assetKey, onTap, opts) {
      opts = opts || {};
      var src = assetKey ? CONFIG.uiAsset(assetKey) : null;
      var entry = src ? TextureManager.get(src) : null;

      if (!entry) {
        return UIKit.candyButton(x, y, w, h, opts.fallbackLabel || '', opts.fallbackColor || 'blue', onTap, {
          fontSize: opts.fallbackFontSize || 15,
          priority: opts.priority,
          adBadge: opts.adBadge,
          adBadgeOpts: opts.adBadgeOpts
        });
      }

      Renderer.drawImage(src, x, y, w, h);
      if (opts.adBadge) {
        UIKit.drawAdBadge(x, y, w, opts.adBadgeOpts || {});
      }
      return { x: x, y: y, w: w, h: h, priority: opts.priority || 100, label: 'img-btn-' + assetKey, onTap: UIKit._wrapTapSound(onTap) };
    },

    // ── 广告角标（对齐旧版 game.js L316 drawAdBadge）──────────────────────────
    /**
     * 绘制粉色「看视频」角标在按钮右上角
     * @param {number} bx,by,bw  按钮位置
     * @param {object} opts  { total, done, displayTotal }
     */
    drawAdBadge: function (bx, by, bw, opts) {
      opts = opts || {};
      var total = opts.total || 1;
      var done  = opts.done  || 0;
      var remain = Math.max(total - done, 0);
      if (remain <= 0) return;

      var label;
      var showTotal = (opts.displayTotal > 0) ? opts.displayTotal : total;
      if (total <= 1 || total >= 100) {
        // total>=100 视为"不设上限"（如 CONFIG.getHintMaxUses 默认 999），角标不显示具体次数
        label = '看视频';
      } else if (done <= 0) {
        label = '看视频 x' + showTotal;
      } else {
        label = '还需看 ' + remain + ' 个';
      }

      var fontSize = 10;
      var textW = TextRenderer.measure(label, fontSize, 'sans-serif');
      var badH = 20;
      var badW = Math.max(44, textW + 16);
      var badR = badH / 2;

      var ax = bx + bw - badW + 8;
      var ay = by - badH * 0.55;

      Renderer.drawRoundRect(ax + 1, ay + 2, badW, badH, badR, { fill: 'rgba(0,0,0,0.28)' });
      Renderer.drawRoundRect(ax, ay, badW, badH, badR, { fill: '#F4798A' });
      Renderer.drawRoundRect(ax, ay, badW, badH, badR, { stroke: '#7A2A30', strokeW: 1.8 });
      Renderer.drawText(label, ax + badW / 2, ay + badH / 2 - (fontSize * 1.4) / 2, {
        fontSize: fontSize, color: '#ffffff', align: 'center',
        strokeColor: 'rgba(80,0,10,0.45)', strokeWidth: 1.4, bold: true
      });
    },

    // ── 失败弹窗卡片框架（对齐旧版 game.js L4352 drawLoseModal）────────────────
    // 与 drawModalCard 的区别：banner 左偏 35px（不居中），SC 缩放
    /**
     * @param {number} vw  虚拟视口宽度（旧版 VW=375）
     * @param {number} vh  虚拟视口高度（旧版 VH=667）
     * @returns {{cx,cy,cw,ch,SC,banW,banH,banX,banY,closeX,closeY,closeSize}}
     */
    drawLoseCard: function (vw, vh, title, onClose, priority) {
      var px = M3.Layout.px;
      var p = priority || 900;
      var SC = 290 / 354;
      var cw = px(290);
      var ch = Math.round(px(306) * SC);
      var banH = Math.round(px(74) * SC);
      var banOH = Math.round(px(35) * SC);
      var cx = Math.round((vw - cw) / 2);
      var cy = Math.round((vh - ch - banOH) / 2) + banOH;
      var banY = cy - banOH;

      // 55% 黑色遮罩
      Renderer.drawRect(0, 0, vw, vh, 'rgba(0,0,0,0.55)');

      // 主卡
      Renderer.drawRoundRect(cx, cy, cw, ch, Math.round(px(24) * SC), {
        fill: '#EBF3FF',
        stroke: '#6AA0F2',
        strokeW: Math.round(px(7) * SC)
      });

      // banner：left=35，不居中
      var banW = Math.round(px(284) * SC);
      var banX = cx + Math.round(px(35) * SC);
      Renderer.drawImage(CONFIG.uiAsset('bannerBlue'), banX, banY, banW, banH);
      if (title) {
        Renderer.drawText(title, vw / 2, banY + Math.round(px(28) * SC) - (px(20) * 1.4) / 2, {
          fontSize: px(20), color: '#ffffff', align: 'center',
          strokeColor: '#123C64', strokeWidth: px(2.5), bold: true
        });
      }

      // 关闭按钮
      var closeSize = Math.round(px(46) * SC);
      var closeX = cx + cw - Math.round(px(15) * SC) - px(4);
      var closeY = banY + Math.round(px(20) * SC);
      Renderer.drawImage(CONFIG.uiAsset('btnClose'), closeX, closeY, closeSize, closeSize);

      // 全屏吸收
      InputManager.addAll([{
        x: 0, y: 0, w: vw, h: vh,
        priority: 500, label: 'modal-absorber',
        onTap: function () {}
      }]);

      return {
        cx: cx, cy: cy, cw: cw, ch: ch, SC: SC,
        banW: banW, banH: banH, banX: banX, banY: banY,
        closeX: closeX, closeY: closeY, closeSize: closeSize,
        closeArea: {
          x: closeX, y: closeY, w: closeSize, h: closeSize,
          priority: p, label: 'modal-close', onTap: onClose
        }
      };
    },

    // ── 圆形按钮（新模版专用：93×93 完整按钮切图，图标+文字已烘焙进图片）──────────
    /**
     * 绘制圆形按钮并返回 tapArea
     * 新模版首页底部栏的"每日签到/全部解锁/添加桌面"按钮使用此组件。
     * 注意：素材本身就是完整的按钮设计图（背景+图标+文字一体），整图按 size 铺满即可，
     * 不要再额外缩放图标或叠加文字，否则会出现"图标变小+多一行重复文字"的问题。
     *
     * @param {number} x,y      左上角坐标
     * @param {number} size     按钮直径（正方形）
     * @param {string} iconKey  UI_ASSETS key（完整按钮图）
     * @param {string} label     按钮下方文字（仅在素材缺失时用于兜底绘制）
     * @param {Function} onTap
     * @param {object} opts     { priority, fontSize, textColor, strokeColor }
     * @returns {object}  tapArea
     */
    /**
     * 结算页（通关/失败弹窗）右下角「添加桌面」入口按钮
     * 素材(btn_home_add_desktop.png)已烘焙图标+文字+提醒角标，直接整图绘制即可
     * @param {number} priority
     * @returns {object} tapArea
     */
    addDesktopButton: function (priority) {
      var W = M3.Layout.w, H = M3.Layout.h;
      var size = 80, margin = 16;
      var x = W - margin - size;
      var y = H - margin - size;
      var src = CONFIG.uiAsset('btnAddDesktop');
      var entry = src ? TextureManager.get(src) : null;
      if (entry) {
        Renderer.drawImage(src, x, y, size, size);
      } else {
        Renderer.drawRoundRect(x, y, size, size, 16, {
          fill: 'rgba(90,60,180,0.9)', stroke: '#ffffff', strokeW: 2
        });
        Renderer.drawText('添加桌面', x + size / 2, y + size / 2, {
          fontSize: 12, color: '#ffffff', align: 'center', bold: true, maxWidth: size - 8
        });
      }
      return {
        x: x, y: y, w: size, h: size,
        priority: priority || 1000, label: 'settlement-add-desktop',
        onTap: UIKit._wrapTapSound(function () {
          var installed = Storage.get(CONFIG.STORAGE_KEYS.shortcutInstalled);
          if (installed) { UIKit.toast('已添加到桌面'); return; }
          if (typeof ks !== 'undefined' && ks.showShortcutMenu) {
            ks.showShortcutMenu();
          } else if (typeof KwaiShortcut !== 'undefined') {
            KwaiShortcut.add({
              onSuccess: function () {
                Storage.set(CONFIG.STORAGE_KEYS.shortcutInstalled, '1');
                UIKit.toast('🏠 已添加到桌面！');
              },
              onFail: function () {}
            });
          } else {
            // 浏览器/无小游戏 SDK 环境下的兜底反馈，避免点击后毫无提示
            UIKit.toast('🏠 已添加到桌面！');
          }
        })
      };
    },

    drawRoundButton: function (x, y, size, iconKey, label, onTap, opts) {
      opts = opts || {};
      var priority = opts.priority || 100;
      var fontSize = opts.fontSize || 16;
      var textColor = opts.textColor || '#ffffff';
      var strokeColor = opts.strokeColor || '#040265';

      var iconSrc = CONFIG.uiAsset(iconKey);
      var iconEntry = iconSrc ? TextureManager.get(iconSrc) : null;

      if (iconEntry) {
        Renderer.drawImage(iconSrc, x, y, size, size);
      } else {
        Renderer.drawCircle(x + size / 2, y + size * 0.38, size * 0.28, {
          fill: 'rgba(255,255,255,0.15)', stroke: 'rgba(255,255,255,0.4)', strokeW: 1.5
        });
        Renderer.drawText(label, x + size / 2, y + size - fontSize * 1.1, {
          fontSize: fontSize, color: textColor, align: 'center',
          strokeColor: strokeColor, strokeWidth: 2.5, bold: true
        });
      }

      return {
        x: x, y: y, w: size, h: size,
        priority: priority, label: 'round-' + label, onTap: onTap
      };
    },

    // ── 右上角操作区（新模版专用：音乐+设置组合按钮）────────────────────────────
    /**
     * 绘制右上角操作区并返回 tapArea 列表
     * 新模版在欢迎页/首页/游戏页右上角使用此组件：左侧音乐开关 + 分隔线 + 右侧设置按钮
     *
     * @param {number} x,y      左上角坐标
     * @param {number} w         区域宽度（默认68）
     * @param {number} h         区域高度（默认30）
     * @param {Function} onTapMusic   音乐按钮回调
     * @param {Function} onTapSettings 设置按钮回调
     * @param {number} priority
     * @returns {object[]}  tapAreas（2个区域：音乐+设置）
     */
    drawTopRightActions: function (x, y, w, h, onTapMusic, onTapSettings, priority) {
      w = w || 76; h = h || 32;
      priority = priority || 200;
      var areas = [];
      var padH = 5, padV = 5, gap = 8;
      var itemW = h;
      var musicX = x + padH;
      var settingsX = x + w - padH - itemW;
      var muted = Audio.isBgmMuted();

      Renderer.drawRoundRect(x, y, w, h, h / 2, {
        fill: 'rgba(0,0,0,0.85)', stroke: 'rgba(255,255,255,0.9)', strokeW: 1
      });

      var musicCx = musicX + itemW / 2;
      var musicCy = y + h / 2;
      if (muted) {
        Renderer.drawText('×', musicCx, musicCy - 11, {
          fontSize: 18, color: 'rgba(255,255,255,0.4)', align: 'center', bold: true
        });
      } else {
        for (var i = 0; i < 3; i++) {
          Renderer.drawCircle(musicCx - 6 + i * 6, musicCy, 1.5, { fill: '#ffffff' });
        }
      }
      areas.push({
        x: musicX, y: y, w: itemW, h: h,
        priority: priority, label: 'top-right-music', onTap: onTapMusic
      });

      var lineX = musicX + itemW + gap / 2;
      Renderer.drawRect(lineX, y + padV, 1, h - padV * 2, 'rgba(255,255,255,0.5)');

      var setCx = settingsX + itemW / 2;
      var setCy = y + h / 2;
      Renderer.drawText('⚙', setCx, setCy - 11, {
        fontSize: 18, color: '#ffffff', align: 'center', bold: true
      });
      areas.push({
        x: settingsX, y: y, w: itemW, h: h,
        priority: priority, label: 'top-right-settings', onTap: onTapSettings
      });

      return areas;
    },

    // ── 分割条（新模版专用：紫色横条，用于游戏页上下分隔）──────────────────────
    /**
     * 绘制水平分割条
     * 新模版游戏页在场景图与底部工具栏之间使用紫色分割条
     *
     * @param {number} x,y      左上角坐标
     * @param {number} w         宽度
     * @param {number} h         高度（默认10）
     * @param {string} color      颜色（默认 #8F8FE6）
     * @param {string} assetKey   UI_ASSETS key（设为 null 用纯色；设为 key 用图片）
     */
    drawDividerBar: function (x, y, w, h, color, assetKey) {
      h = h || 10;
      color = color || '#8F8FE6';

      var src = assetKey ? CONFIG.uiAsset(assetKey) : null;
      var entry = src ? TextureManager.get(src) : null;
      if (entry) {
        Renderer.drawImage(src, x, y, w, h);
      } else {
        Renderer.drawRect(x, y, w, h, color);
      }
      // 分割条走的是纯色矩形(ShapeBatch)，与人物/舞台贴图(SpriteBatch)是两个独立批次，
      // 只有在这里立即 flush，才能让它稳定卡在"背景图之上、舞台贴图之下"的位置，
      // 否则批次会在整帧结束时统一提交，固定盖住这一帧所有贴图（包括舞台图和手指引导动画）。
      Renderer.flush();
    },

    // ── 流动背景（新模版：紫色渐变底 + 拼块暗纹缓慢流动）────────────────────────
    /**
     * 绘制流动背景（两级加载，CDN 到位前后视觉不同，但不阻塞首帧）：
     *   1. 首帧兜底：mnvPageBg（本地静态图，暗纹已烘焙进底图，秒开无网络依赖）
     *   2. CDN 升级：mnvBgGradientBase（纯渐变） + mnvBgPuzzle（暗纹贴图）都从 CDN
     *      加载成功后，自动切换成"纯渐变铺底 + 暗纹贴图随时间纵向滚动"的动态版本，
     *      视觉效果更好；CDN 未就位/加载失败时一直停留在第 1 步的本地静态图，
     *      不影响可用性，也不会因为等 CDN 而卡住首屏（见 product.config.js
     *      "bg/ — 页面背景" 处的完整说明）。
     *
     * @param {number} W,H   视口宽高
     * @param {number} speed  滚动速度(像素/秒)，默认 15，仅动态版本生效
     */
    drawFlowingBackground: function (W, H, speed) {
      speed = speed || 15;

      var baseSrc = CONFIG.uiAsset('mnvBgGradientBase');
      var baseEntry = baseSrc ? TextureManager.get(baseSrc) : null;
      var patternSrc = CONFIG.uiAsset('mnvBgPuzzle');
      var patternEntry = patternSrc ? TextureManager.get(patternSrc) : null;

      if (baseEntry && patternEntry && patternEntry.img) {
        // CDN 两张图都到位：纯渐变铺底 + 暗纹贴图上下悬浮滚动
        Renderer.drawImageCover(baseSrc, 0, 0, W, H);
        var img = patternEntry.img;
        var scale = W / img.width;
        var drawW = img.width * scale;
        var drawH = img.height * scale;
        var offset = ((M3._now() / 1000) * speed) % drawH;
        Renderer.drawImage(patternSrc, 0, -offset, drawW, drawH);
        if (offset > 0) {
          Renderer.drawImage(patternSrc, 0, drawH - offset, drawW, drawH);
        }
        return;
      }

      // CDN 未就位：本地静态图兜底（暗纹已烘焙进底图，不会因为缺 mnvBgPuzzle 而看起来空）
      var bgSrc = CONFIG.uiAsset('mnvPageBg');
      var bgEntry = bgSrc ? TextureManager.get(bgSrc) : null;
      if (bgEntry) {
        Renderer.drawImageCover(bgSrc, 0, 0, W, H);
      } else {
        Renderer.drawRect(0, 0, W, H, '#4A3B6B');
      }
    },

    // ── 全局广告 Loading 遮罩（优先级最高，吃掉所有点击）──────────────────────
    _adLoading: false,

    showAdLoading: function () { this._adLoading = true; },
    hideAdLoading: function () { this._adLoading = false; },

    drawAdLoading: function () {
      if (!this._adLoading) return null;
      var W = M3.Layout.w, H = M3.Layout.h;
      var px = M3.Layout.px;
      Renderer.drawRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
      Renderer.flush();

      var src = CONFIG.uiAsset('adLoadingText');
      var entry = src ? TextureManager.get(src) : null;
      var bottomGap = H * 0.25;
      if (entry && entry.img) {
        var drawW = px(146);
        var drawH = px(49);
        var x = (W - drawW) / 2;
        var y = H - bottomGap - drawH;
        Renderer.drawImage(src, x, y, drawW, drawH);
      } else {
        var labelY = H - bottomGap - px(13);
        var cx = W / 2, cy = labelY - px(52);
        var now = M3._now();
        var angle = (now / 800) % (Math.PI * 2);
        for (var i = 0; i < 8; i++) {
          var a     = angle + i * Math.PI / 4;
          var dist  = 22;
          var rx    = cx + Math.cos(a) * dist - 5;
          var ry    = cy + Math.sin(a) * dist - 5;
          var al    = (i + 1) / 8;
          Renderer.drawRect(rx, ry, 10, 10, 'rgba(255,255,255,' + al + ')');
        }
        Renderer.drawText('广告加载中', cx, labelY, {
          fontSize: 13, color: '#ffffff', align: 'center'
        });
      }
      return {
        x: 0, y: 0, w: W, h: H, priority: 99999, label: 'ad-loading-absorber',
        onTap: function () {}
      };
    }
  };
})();
