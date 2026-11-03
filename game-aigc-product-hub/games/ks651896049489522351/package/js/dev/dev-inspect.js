(function () {
  // ================================================================
  // dev-inspect.js — Canvas Inspect 调试工具（常驻）
  // 仅在浏览器调试模式激活：window.__DDZ_DEBUG__ === true 或 URL ?inspect=1
  // 快手小游戏端（game.js 入口）不加载本文件，线上不受影响。
  //
  // 功能：
  // - 面板「点选元素」→ 点画面任意元素：命中多层（按钮热区/bg图/文字）时
  //   弹候选列表选定要调整的层；单命中直接选中
  // - 方向按钮 / dx dy 输入框移动选中元素；「打印」输出最终数值供写死代码
  // - window.__setVP(w,h) 伪造视口尺寸（localStorage 记忆，刷新自动恢复；
  //   window.__setVP(0,0) 清除记忆恢复真实视口）
  // ================================================================
  var on = (window.__DDZ_DEBUG__ === true) || /[?&]inspect=1/.test(location.search);
  if (!on) return;

  var VP_KEY = '__inspect_vp';

  // ── 视口伪造（localStorage 记忆）──────────────────────────────
  window.__setVP = function (w, h) {
    try {
      if (!w || !h) {
        localStorage.removeItem(VP_KEY);
        return 'viewport memory cleared (reload to restore real size)';
      }
      Object.defineProperty(window, 'innerWidth',  { get: function () { return w; }, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: function () { return h; }, configurable: true });
      localStorage.setItem(VP_KEY, w + 'x' + h);
      window.dispatchEvent(new Event('resize'));
      return 'viewport set -> ' + w + 'x' + h + ' (已记忆，刷新自动恢复)';
    } catch (e) { return 'failed: ' + e.message; }
  };
  function applySavedVP () {
    try {
      var v = localStorage.getItem(VP_KEY);
      if (!v) return;
      var p = v.split('x');
      var w = Number(p[0]), h = Number(p[1]);
      if (w > 0 && h > 0) {
        Object.defineProperty(window, 'innerWidth',  { get: function () { return w; }, configurable: true });
        Object.defineProperty(window, 'innerHeight', { get: function () { return h; }, configurable: true });
        window.dispatchEvent(new Event('resize'));
        console.log('[Inspect] 恢复记忆视口', w + 'x' + h);
      }
    } catch (e) {}
  }

  var REC = [];            // 最新一帧绘制记录
  var sel = null;          // 选中项 { t, x, y, w, h, label, dx, dy }
  var step = 0.5;
  var pickMode = false;
  window.__inspectREC = REC;

  function nameOf (src) {
    if (!src) return '';
    var s = src._src || src.src || src.id || '';
    if (!s && src.width) s = 'sprite' + src.width + 'x' + src.height;
    s = String(s);
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function matchRect (x, y, w, h) {
    if (!sel || !w || !h) return false;
    var ix = Math.max(0, Math.min(x + w, sel.x + sel.w) - Math.max(x, sel.x));
    var iy = Math.max(0, Math.min(y + h, sel.y + sel.h) - Math.max(y, sel.y));
    return (ix * iy) / (w * h) > 0.6;
  }
  function matchText (x, y) {
    if (!sel) return false;
    // 明确选中图形层（img/img9/rrect）时不带动文字，与「按钮整体」区分
    if (sel.t === 'img' || sel.t === 'img9' || sel.t === 'rrect') return false;
    return x >= sel.x - 6 && x <= sel.x + sel.w + 6 &&
           y >= sel.y - 6 && y <= sel.y + sel.h + 6;
  }

  // ── 渲染拦截：转发一律用 arguments 全量传递，避免截断可选参 ──
  var origDraw = M3.Render.draw.bind(M3.Render);
  M3.Render.draw = function () {
    var oDI  = M3.Render.glDrawImage,  oDI9 = M3.Render.glDrawImage9,
        oFT  = M3.Render.glFillText,   oFR  = M3.Render.fillRounded,
        oSR  = M3.Render.strokeRounded, oFTS = M3.Render.glFillTextStroke;
    REC.length = 0;
    function rec (r) { if (REC.length < 500) REC.push(r); }

    if (oDI) M3.Render.glDrawImage = function () {
      // 三种签名：3(src,dw,dh) / 5(src,dx,dy,dw,dh) / 9(src,sx,sy,sw,sh,dx,dy,dw,dh)
      var a = arguments, n = a.length, x, y, w, h;
      if (n === 3)      { x = 0; y = 0; w = a[1]; h = a[2]; }
      else if (n === 5) { x = a[1]; y = a[2]; w = a[3]; h = a[4]; }
      else              { x = a[5]; y = a[6]; w = a[7]; h = a[8]; }
      if (matchRect(x, y, w, h)) {
        if (n === 5)      { a[1] += sel.dx; a[2] += sel.dy; a[3] += sel.dw; a[4] += sel.dh; }
        else if (n >= 9)  { a[5] += sel.dx; a[6] += sel.dy; a[7] += sel.dw; a[8] += sel.dh; }
        x += sel.dx; y += sel.dy; w += sel.dw; h += sel.dh;
      }
      rec({ t: 'img', x: x, y: y, w: w, h: h, name: nameOf(a[0]) });
      return oDI.apply(M3.Render, a);
    };
    if (oDI9) M3.Render.glDrawImage9 = function () {
      var a = arguments;
      if (matchRect(a[1], a[2], a[3], a[4])) { a[1] += sel.dx; a[2] += sel.dy; }
      rec({ t: 'img9', x: a[1], y: a[2], w: a[3], h: a[4], name: nameOf(a[0]) });
      return oDI9.apply(M3.Render, a);
    };
    // ── 工具：根据 glFillText 参数算出实际矩形 ─────────────────────
    // glFillText(text, x, y, font, fillColor, textAlign, textBaseline)
    // glFillTextStroke(text, x, y, font, fillColor, strokeColor, strokeW, textAlign, textBaseline)
    function _textRect (text, x, y, font, align, baseline) {
      var tw = (M3.Render.glMeasureText ? M3.Render.glMeasureText(text, font) : 60) + 4;
      var fsize = 16;
      var m = String(font || '').match(/(\d+(?:\.\d+)?)px/);
      if (m) fsize = parseFloat(m[1]);
      var th = Math.ceil(fsize * 1.5) + 4;
      var rx = x;
      if (align === 'center')      rx = x - tw / 2;
      else if (align === 'right')  rx = x - tw;
      var ry = y;
      if (baseline === 'middle')   ry = y - th / 2;
      else if (baseline === 'bottom') ry = y - th;
      return { x: rx, y: ry, w: tw, h: th };
    }

    if (oFT) M3.Render.glFillText = function () {
      // glFillText(text, x, y, font, fillColor, textAlign, textBaseline)
      var a = arguments;
      if (matchText(a[1], a[2])) { a[1] += sel.dx; a[2] += sel.dy; }
      var r0 = _textRect(String(a[0]), a[1], a[2], a[3], a[5], a[6]);
      rec({ t: 'text', x: r0.x, y: r0.y, w: r0.w, h: r0.h, name: String(a[0]).slice(0, 16) });
      return oFT.apply(M3.Render, a);
    };
    if (oFTS) M3.Render.glFillTextStroke = function () {
      // glFillTextStroke(text, x, y, font, fillColor, strokeColor, strokeW, align, baseline)
      var a = arguments;
      if (matchText(a[1], a[2])) { a[1] += sel.dx; a[2] += sel.dy; }
      var r0 = _textRect(String(a[0]), a[1], a[2], a[3], a[7], a[8]);
      rec({ t: 'text', x: r0.x, y: r0.y, w: r0.w, h: r0.h, name: String(a[0]).slice(0, 16) });
      return oFTS.apply(M3.Render, a);
    };
    if (oFR) M3.Render.fillRounded = function () {
      var a = arguments;
      if (matchRect(a[0], a[1], a[2], a[3])) { a[0] += sel.dx; a[1] += sel.dy; }
      rec({ t: 'rrect', x: a[0], y: a[1], w: a[2], h: a[3], name: String(a[5]).slice(0, 10) });
      return oFR.apply(M3.Render, a);
    };
    if (oSR) M3.Render.strokeRounded = function () {
      var a = arguments;
      if (matchRect(a[0], a[1], a[2], a[3])) { a[0] += sel.dx; a[1] += sel.dy; }
      return oSR.apply(M3.Render, a);
    };

    origDraw();

    M3.Render.glDrawImage = oDI;  M3.Render.glDrawImage9 = oDI9;
    M3.Render.glFillText = oFT;   M3.Render.fillRounded = oFR;
    M3.Render.strokeRounded = oSR; M3.Render.glFillTextStroke = oFTS;
  };

  // ── 拾取：mousedown 捕获阶段拦截（拾取时游戏不响应点击）──
  // 命中多层（热区/bg/文字）时弹候选列表，由用户选定要调整的层
  var candidates = [];

  function boot () {
    var cv = window.canvas || document.querySelector('canvas');
    if (!cv) return;

    function doPick (px, py) {
      candidates = [];
      // 1) 按钮热区（整体：bg+文字一起动）
      var btns = (M3.Render.getHitBtns && M3.Render.getHitBtns()) || [];
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
          candidates.push({ t: 'btn', x: b.x, y: b.y, w: b.w, h: b.h, label: b.label, desc: '按钮整体:' + b.label });
        }
      }
      // 2) 绘制记录：按 name 分组，同组矩形做「相邻集群」合并（九宫格切片 → 一个整体）
      var groups = {};
      for (var j = REC.length - 1; j >= 0; j--) {
        var r0 = REC[j];
        if (r0.w * r0.h > M3.Layout.w * M3.Layout.h * 0.8) continue;   // 跳过全屏背景
        if (px < r0.x || px > r0.x + r0.w || py < r0.y || py > r0.y + r0.h) continue;
        var key = r0.t + '|' + (r0.name || '');
        (groups[key] = groups[key] || []).push(r0);
      }
      Object.keys(groups).forEach(function (key) {
        var hits = groups[key];
        var t = hits[0].t, nm = hits[0].name || '';
        var box;
        if (t === 'img' || t === 'img9' || t === 'rrect') {
          // 从被点击的块出发，吸收所有相邻(间距≤8px)的同名块 → 整体包围盒
          var pool = REC.filter(function (r) { return r.t === t && (r.name || '') === nm; });
          var cluster = [hits[0]];
          var grew = true;
          while (grew) {
            grew = false;
            for (var k = 0; k < pool.length; k++) {
              if (cluster.indexOf(pool[k]) >= 0) continue;
              for (var m = 0; m < cluster.length; m++) {
                if (near(pool[k], cluster[m], 8)) { cluster.push(pool[k]); grew = true; break; }
              }
            }
          }
          box = bbox(cluster);
          var descName = (t === 'rrect' ? '矩形' : '图') + ':' + (nm || '(无名)');
          candidates.push({ t: t, x: box.x, y: box.y, w: box.w, h: box.h, label: nm, desc: descName });
        } else if (t === 'text') {
          box = bbox(hits);
          candidates.push({ t: 'text', x: box.x, y: box.y, w: box.w, h: box.h, label: nm, desc: '文字:' + nm });
        }
      });
      if (candidates.length === 0) { console.log('[Inspect] 未命中任何元素'); return; }
      if (candidates.length === 1) { select(candidates[0]); return; }
      showCandidates();
    }

    function near (a, b, gap) {
      return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x ||
               a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
    }
    function bbox (list) {
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      list.forEach(function (r) {
        x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
        x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
      });
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    function select (c) {
      sel = { t: c.t, x: c.x, y: c.y, w: c.w, h: c.h, label: c.label || '', dx: 0, dy: 0, dw: 0, dh: 0 };
      candidates = [];
      refreshUI();
      console.log('[Inspect] 选中:', sel.label, '原始矩形', c.x, c.y, c.w, c.h);
    }

    function pickHandler (e) {
      if (!pickMode) return;
      e.preventDefault();
      e.stopPropagation();
      var rect = cv.getBoundingClientRect();
      var cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      doPick(cx - rect.left, cy - rect.top);
    }
    // capture：先于 input.js 的按钮处理触发，拾取时阻止游戏响应
    cv.addEventListener('mousedown', pickHandler, true);
    cv.addEventListener('touchstart', pickHandler, { capture: true, passive: false });

    // ── 收起态：右上角小图标 ──────────────────────────────────
    var fabBtn = document.createElement('div');
    fabBtn.id = '__inspect_fab';
    fabBtn.style.cssText = 'position:fixed;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:rgba(15,18,28,.90);border:1px solid #3b76d8;display:flex;align-items:center;justify-content:center;z-index:10001;cursor:pointer;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.5);user-select:none;';
    fabBtn.textContent = '🔍';
    fabBtn.title = '展开 Canvas Inspect';
    document.body.appendChild(fabBtn);

    // ── UI 面板（默认隐藏）──────────────────────────────────
    var panel = document.createElement('div');
    panel.id = '__inspect_panel';
    panel.style.cssText = 'display:none;position:fixed;top:8px;right:8px;width:230px;background:rgba(15,18,28,.94);border:1px solid #2c3448;border-radius:12px;padding:12px;z-index:10000;color:#e6e9f2;font:12px/1.5 monospace;user-select:none;box-shadow:0 6px 24px rgba(0,0,0,.5);';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<b style="font-size:13px;">🔍 Canvas Inspect</b>' +
      '<span id="__ins_min" style="cursor:pointer;color:#8b93a8;font-size:16px;" title="收起">✕</span></div>' +
      '<div id="__ins_body">' +
      // ── 屏幕尺寸 ──
      '<div style="margin-bottom:8px;">' +
      '<div style="color:#8b93a8;font-size:10px;margin-bottom:4px;">📱 屏幕尺寸</div>' +
      '<div id="__ins_vp_presets" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">' +
      '<div style="width:100%;color:#4a5568;font-size:9px;margin-bottom:2px;">竖屏</div>' +
      '<button data-vp="375x667"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">375×667</button>' +
      '<button data-vp="390x844"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">390×844</button>' +
      '<button data-vp="393x852"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">393×852</button>' +
      '<button data-vp="414x896"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">414×896</button>' +
      '<button data-vp="428x926"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">428×926</button>' +
      '<button data-vp="360x780"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#cdd5ea;font:10px monospace;cursor:pointer;">360×780</button>' +
      '<div style="width:100%;color:#4a5568;font-size:9px;margin-top:4px;margin-bottom:2px;">横屏</div>' +
      '<button data-vp="667x375"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">667×375</button>' +
      '<button data-vp="844x390"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">844×390</button>' +
      '<button data-vp="852x393"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">852×393</button>' +
      '<button data-vp="896x414"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">896×414</button>' +
      '<button data-vp="926x428"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">926×428</button>' +
      '<button data-vp="780x360"  style="padding:2px 5px;border:1px solid #2c3448;border-radius:4px;background:#1b2137;color:#a8d8ea;font:10px monospace;cursor:pointer;">780×360</button>' +
      '<button data-vp="0x0"      style="padding:2px 5px;border:1px solid #a03f3f;border-radius:4px;background:#2a1515;color:#e88;font:10px monospace;cursor:pointer;">还原</button>' +
      '</div>' +
      '<div style="display:flex;gap:4px;align-items:center;">' +
      '<input id="__ins_vp_w" type="number" placeholder="宽" style="width:54px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;">' +
      '<span style="color:#4a5568;">×</span>' +
      '<input id="__ins_vp_h" type="number" placeholder="高" style="width:54px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;">' +
      '<button id="__ins_vp_set" style="flex:1;padding:3px 6px;border:none;border-radius:4px;background:#2456b3;color:#fff;font:11px monospace;cursor:pointer;">设置</button>' +
      '</div>' +
      '<div id="__ins_vp_cur" style="margin-top:3px;color:#4a90d9;font-size:10px;"></div>' +
      '</div>' +
      '<button id="__ins_pick" style="width:100%;padding:6px;border-radius:6px;border:1px solid #3b76d8;background:#2456b3;color:#fff;font:12px monospace;cursor:pointer;">点选元素</button>' +
      '<div id="__ins_cand" style="margin-top:8px;display:none;"></div>' +
      '<div id="__ins_info" style="margin-top:8px;color:#8b93a8;">未选中</div>' +
      '<div id="__ins_ctrl" style="display:none;margin-top:8px;">' +
      '<div style="display:flex;gap:6px;justify-content:center;">' +
      '<button data-mv="0,-1" style="flex:1;padding:5px;border:none;border-radius:6px;background:#3355aa;color:#fff;cursor:pointer;">↑</button></div>' +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:4px;">' +
      '<button data-mv="-1,0" style="flex:1;padding:5px;border:none;border-radius:6px;background:#3355aa;color:#fff;cursor:pointer;">←</button>' +
      '<button data-mv="0,1" style="flex:1;padding:5px;border:none;border-radius:6px;background:#3355aa;color:#fff;cursor:pointer;">↓</button>' +
      '<button data-mv="1,0" style="flex:1;padding:5px;border:none;border-radius:6px;background:#3355aa;color:#fff;cursor:pointer;">→</button></div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;align-items:center;">' +
      '<span>步进</span><select id="__ins_step" style="flex:1;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px;font:11px monospace;">' +
      '<option value="0.1">0.1</option><option value="0.5" selected>0.5</option><option value="1">1</option><option value="5">5</option></select></div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;align-items:center;">' +
      '<span>dx</span><input id="__ins_dx" type="number" step="0.1" style="width:58px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;">' +
      '<span>dy</span><input id="__ins_dy" type="number" step="0.1" style="width:58px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;"></div>' +
      '<div style="display:flex;gap:6px;margin-top:4px;align-items:center;">' +
      '<span>dw</span><input id="__ins_dw" type="number" step="0.5" style="width:58px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;">' +
      '<span>dh</span><input id="__ins_dh" type="number" step="0.5" style="width:58px;background:#1b2137;color:#fff;border:1px solid #2c3448;border-radius:4px;padding:2px 4px;font:11px monospace;"></div>' +
      '<div style="display:flex;gap:6px;margin-top:8px;">' +
      '<button id="__ins_out" style="flex:1;padding:5px;border:none;border-radius:6px;background:#2e7d4f;color:#fff;cursor:pointer;">打印</button>' +
      '<button id="__ins_reset" style="flex:1;padding:5px;border:none;border-radius:6px;background:#6b3fa0;color:#fff;cursor:pointer;">归零</button>' +
      '<button id="__ins_clear" style="flex:1;padding:5px;border:none;border-radius:6px;background:#a03f3f;color:#fff;cursor:pointer;">取消</button></div>' +
      '</div></div>';
    document.body.appendChild(panel);

    var $ = function (id) { return document.getElementById(id); };
    var hl = document.createElement('div');
    hl.style.cssText = 'position:fixed;border:1.5px solid #ff6b35;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none;z-index:9999;display:none;';
    var tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;top:-18px;left:-1px;background:#ff6b35;color:#fff;padding:0 5px;border-radius:3px;font:10px monospace;white-space:nowrap;';
    hl.appendChild(tag);
    document.body.appendChild(hl);

    function showCandidates () {
      var box = $('__ins_cand');
      box.style.display = 'block';
      box.innerHTML = '<div style="color:#ffb35c;margin-bottom:4px;">命中 ' + candidates.length + ' 层，选择：</div>';
      candidates.slice(0, 10).forEach(function (c, idx) {
        var el = document.createElement('button');
        el.textContent = c.desc + ' (' + Math.round(c.x) + ',' + Math.round(c.y) + ' ' + Math.round(c.w) + '×' + Math.round(c.h) + ')';
        el.style.cssText = 'display:block;width:100%;margin-top:3px;padding:4px 6px;text-align:left;border:1px solid #2c3448;border-radius:5px;background:#1b2137;color:#cdd5ea;font:11px monospace;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        el.onclick = function () { select(c); };
        box.appendChild(el);
      });
    }

    function refreshUI () {
      var info = $('__ins_info'), ctrl = $('__ins_ctrl'), cand = $('__ins_cand');
      if (candidates.length) { showCandidates(); }
      else { cand.style.display = 'none'; cand.innerHTML = ''; }
      if (!sel) {
        info.textContent = '未选中'; ctrl.style.display = 'none'; hl.style.display = 'none';
        return;
      }
      ctrl.style.display = 'block';
      info.innerHTML = '<span style="color:#ffb35c;">' + (sel.label || sel.t) + '</span><br>' +
        '原始 x=' + sel.x + ' y=' + sel.y + '<br>尺寸 ' + Math.round(sel.w) + '×' + Math.round(sel.h);
      $('__ins_dx').value = sel.dx; $('__ins_dy').value = sel.dy;
      $('__ins_dw').value = sel.dw; $('__ins_dh').value = sel.dh;
    }
    window.__inspectRefreshUI = refreshUI;

    (function loopHL () {
      if (sel) {
        var rect = cv.getBoundingClientRect();
        hl.style.display = 'block';
        hl.style.left = (rect.left + sel.x + sel.dx) + 'px';
        hl.style.top = (rect.top + sel.y + sel.dy) + 'px';
        hl.style.width = sel.w + 'px'; hl.style.height = sel.h + 'px';
        tag.textContent = (sel.label || sel.t) + ' +' + sel.dx + ',' + sel.dy;
      }
      requestAnimationFrame(loopHL);
    })();

    // ── 视口尺寸控件 ────────────────────────────────────────────────
    function updateVpCur () {
      var el = $('__ins_vp_cur');
      if (el) el.textContent = '当前：' + (window.innerWidth || '?') + ' × ' + (window.innerHeight || '?');
    }
    updateVpCur();
    // 预设按钮
    document.getElementById('__ins_vp_presets').addEventListener('click', function (e) {
      var vp = e.target.getAttribute && e.target.getAttribute('data-vp');
      if (!vp) return;
      var parts = vp.split('x');
      var w = parseInt(parts[0]), h = parseInt(parts[1]);
      if (window.__setVP) window.__setVP(w, h);
      setTimeout(updateVpCur, 100);
    });
    // 自定义输入
    $('__ins_vp_set').onclick = function () {
      var w = parseInt($('__ins_vp_w').value), h = parseInt($('__ins_vp_h').value);
      if (w > 0 && h > 0 && window.__setVP) { window.__setVP(w, h); setTimeout(updateVpCur, 100); }
    };

    $('__ins_pick').onclick = function () {
      pickMode = !pickMode;
      this.textContent = pickMode ? '拾取中…(点画面)' : '点选元素';
      this.style.background = pickMode ? '#b35624' : '#2456b3';
      if (!pickMode) { candidates = []; refreshUI(); }
    };

    // ── 节点树面板 ──────────────────────────────────────────────────
    var treePanel = document.createElement('div');
    treePanel.id = '__inspect_tree';
    treePanel.style.cssText = 'display:none;position:fixed;top:8px;right:252px;width:320px;max-height:70vh;overflow-y:auto;background:rgba(10,14,26,.96);border:1px solid #2c3448;border-radius:12px;padding:10px;z-index:10000;color:#e6e9f2;font:11px/1.5 monospace;box-shadow:0 6px 24px rgba(0,0,0,.6);';
    document.body.appendChild(treePanel);

    var treeOpen = false;
    var treeTimer = null;

    var TYPE_ICON = { img: '🖼', img9: '🔲', text: '📝', rrect: '▣', btn: '🔘' };
    var TYPE_COLOR = { img: '#7ec8e3', img9: '#a8d8a8', text: '#f9c74f', rrect: '#c77dff', btn: '#ff9f43' };

    function buildTree () {
      if (!treeOpen) return;
      var btns = (M3.Render.getHitBtns && M3.Render.getHitBtns()) || [];
      // 合并 REC + buttons，按绘制顺序排列（buttons 在最后，因为绘制完成后才收集）
      var nodes = REC.slice();
      btns.forEach(function (b) {
        nodes.push({ t: 'btn', x: b.x, y: b.y, w: b.w, h: b.h, name: b.label });
      });

      // 按 Y 坐标分组，相近行（±8px）归入同一层（视觉行）
      var rows = [];
      nodes.forEach(function (n) {
        var rowY = Math.round(n.y / 8) * 8;
        var row = null;
        for (var i = 0; i < rows.length; i++) {
          if (Math.abs(rows[i].y - rowY) <= 8) { row = rows[i]; break; }
        }
        if (!row) { row = { y: rowY, items: [] }; rows.push(row); }
        row.items.push(n);
      });
      rows.sort(function (a, b) { return a.y - b.y; });

      var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<b style="font-size:12px;">🌲 节点树 <span style="color:#8b93a8;font-weight:400;">(' + nodes.length + ' 项)</span></b>' +
        '<span id="__tree_close" style="cursor:pointer;color:#8b93a8;padding:0 4px;">✕</span></div>';

      var W = (M3.Layout && M3.Layout.w) || 375;
      var H = (M3.Layout && M3.Layout.h) || 667;

      rows.forEach(function (row) {
        var rowLabel = 'y≈' + row.y;
        html += '<div style="margin-top:4px;border-top:1px solid #1e2538;padding-top:3px;">' +
          '<span style="color:#4a5568;font-size:10px;">' + rowLabel + '</span>';
        row.items.forEach(function (n) {
          var icon = TYPE_ICON[n.t] || '○';
          var color = TYPE_COLOR[n.t] || '#cdd5ea';
          var nm = String(n.name || n.t).slice(0, 24);
          var xp = Math.round(n.x / W * 100), yp = Math.round(n.y / H * 100);
          html += '<div style="display:flex;align-items:center;gap:5px;padding:1px 0 1px 8px;cursor:pointer;" ' +
            'data-nx="' + n.x + '" data-ny="' + n.y + '" data-nw="' + n.w + '" data-nh="' + n.h + '" data-nt="' + n.t + '" data-nn="' + nm + '">' +
            '<span>' + icon + '</span>' +
            '<span style="color:' + color + ';flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nm + '</span>' +
            '<span style="color:#4a5568;font-size:10px;">' + Math.round(n.x) + ',' + Math.round(n.y) + ' ' + Math.round(n.w) + '×' + Math.round(n.h) + '</span>' +
            '</div>';
        });
        html += '</div>';
      });

      treePanel.innerHTML = html;
      // 关闭按钮
      var closeBtn = document.getElementById('__tree_close');
      if (closeBtn) closeBtn.onclick = function () { treeOpen = false; treePanel.style.display = 'none'; };
      // 点节点 → 选中并高亮
      treePanel.querySelectorAll('[data-nx]').forEach(function (el) {
        el.onmouseenter = function () { el.style.background = 'rgba(255,107,53,0.12)'; };
        el.onmouseleave = function () { el.style.background = ''; };
        el.onclick = function () {
          sel = { t: el.dataset.nt, x: parseFloat(el.dataset.nx), y: parseFloat(el.dataset.ny),
                  w: parseFloat(el.dataset.nw), h: parseFloat(el.dataset.nh),
                  label: el.dataset.nn, dx: 0, dy: 0, dw: 0, dh: 0 };
          refreshUI();
          console.log('[Inspect] 树选中:', el.dataset.nn, el.dataset.nx, el.dataset.ny);
        };
      });
    }

    // 树面板实时刷新（开启时每 300ms 重建一次）
    function treeLoop () {
      if (!treeOpen) { clearInterval(treeTimer); treeTimer = null; return; }
      buildTree();
    }

    // 在面板按钮行插入「节点树」按钮
    var treeBtn = document.createElement('button');
    treeBtn.textContent = '节点树';
    treeBtn.style.cssText = 'width:100%;margin-top:6px;padding:6px;border-radius:6px;border:1px solid #4a3d78;background:#2d1f5e;color:#c4a8ff;font:12px monospace;cursor:pointer;';
    treeBtn.onclick = function () {
      treeOpen = !treeOpen;
      treePanel.style.display = treeOpen ? 'block' : 'none';
      treeBtn.style.background = treeOpen ? '#4a3d78' : '#2d1f5e';
      if (treeOpen) {
        buildTree();
        if (!treeTimer) treeTimer = setInterval(treeLoop, 300);
      } else {
        clearInterval(treeTimer); treeTimer = null;
      }
    };
    $('__ins_body').insertBefore(treeBtn, $('__ins_cand'));
    panel.addEventListener('click', function (e) {
      var mv = e.target.getAttribute && e.target.getAttribute('data-mv');
      if (!mv || !sel) return;
      var p = mv.split(',');
      sel.dx = Math.round((sel.dx + Number(p[0]) * step) * 10) / 10;
      sel.dy = Math.round((sel.dy + Number(p[1]) * step) * 10) / 10;
      refreshUI();
    });
    $('__ins_step').onchange = function () { step = Number(this.value); };
    $('__ins_dx').oninput = function () { if (sel) sel.dx = Number(this.value) || 0; };
    $('__ins_dy').oninput = function () { if (sel) sel.dy = Number(this.value) || 0; };
    $('__ins_dw').oninput = function () { if (sel) sel.dw = Number(this.value) || 0; };
    $('__ins_dh').oninput = function () { if (sel) sel.dh = Number(this.value) || 0; };
    $('__ins_out').onclick = function () {
      if (!sel) return;
      var out = { label: sel.label || sel.t, type: sel.t,
                  rect: { x: sel.x, y: sel.y, w: sel.w, h: sel.h },
                  dx: sel.dx, dy: sel.dy, dw: sel.dw, dh: sel.dh,
                  final: { x: Math.round((sel.x + sel.dx) * 10) / 10,
                           y: Math.round((sel.y + sel.dy) * 10) / 10,
                           w: Math.round((sel.w + sel.dw) * 10) / 10,
                           h: Math.round((sel.h + sel.dh) * 10) / 10 } };
      console.log('[Inspect] 最终数值 →', JSON.stringify(out));
    };
    $('__ins_reset').onclick = function () { if (sel) { sel.dx = 0; sel.dy = 0; sel.dw = 0; sel.dh = 0; refreshUI(); } };
    $('__ins_clear').onclick = function () { sel = null; candidates = []; refreshUI(); };
    // FAB 点击 → 展开面板，隐藏 fab
    fabBtn.onclick = function () {
      fabBtn.style.display = 'none';
      panel.style.display = 'block';
    };

    $('__ins_min').onclick = function () {
      panel.style.display = 'none';
      // 收起节点树
      if (treeOpen) {
        treeOpen = false;
        treePanel.style.display = 'none';
        clearInterval(treeTimer); treeTimer = null;
      }
      fabBtn.style.display = 'flex';
    };

    // 恢复记忆视口（等 main.js 首轮 resize 完成后再覆盖）
    setTimeout(applySavedVP, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
