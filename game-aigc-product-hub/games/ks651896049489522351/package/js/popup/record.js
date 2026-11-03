/**
 * scene-record.js — 战绩弹层（最近10局，可滑动翻页）
 * 渲染层：直接调用 M3.Render WebGL 接口
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var _visible = false;
  var _records = [];
  var _scrollY = 0;
  var _dragStart = null;
  var PAGE_SIZE = 5;
  var MAX_RECORDS = 50;
  var STORAGE_KEY = 'ddz_records';

  function loadRecords() {
    try {
      var raw;
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) raw = KwaiStorage.getSync(STORAGE_KEY);
      else if (typeof localStorage !== 'undefined') raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _records = JSON.parse(raw) || [];
    } catch (e) { _records = []; }
  }

  function saveRecords() {
    try {
      var s = JSON.stringify(_records.slice(0, MAX_RECORDS));
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) KwaiStorage.setSync(STORAGE_KEY, s);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, s);
    } catch (e) {}
  }

  loadRecords();

  M3.SceneRecord = {
    show:      function () { _visible = true; _scrollY = 0; },
    hide:      function () { _visible = false; },
    isVisible: function () { return _visible; },

    addRecord: function (rec) {
      _records.unshift(Object.assign({ ts: Date.now() }, rec));
      if (_records.length > MAX_RECORDS) _records.length = MAX_RECORDS;
      saveRecords();
    },

    onTouchStart: function (y) { _dragStart = { y: y, scrollY: _scrollY }; },
    onTouchMove:  function (y) { if (_dragStart) _scrollY = _dragStart.scrollY + (_dragStart.y - y); },
    onTouchEnd:   function ()  { _dragStart = null; },

    draw: function () {
      if (!_visible) return;
      var r = M3.Render;
      var hitBtns = r.getHitBtns();
      var W = M3.Layout.w, H = M3.Layout.h;
      _drawPanel(r, W, H, hitBtns);
    },
  };

  function _drawPanel (r, W, H, hitBtns) {
    var pw = Math.min(W * 0.92, 340);
    var ph = Math.min(H * 0.82, 520);
    var px = (W - pw) / 2, py = (H - ph) / 2;

    // 遮罩
    r.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // 面板（阴影近似）
    r.save(); r.setAlpha(0.6);
    r.fillRounded(px+2, py+4, pw, ph, 14, '#000000');
    r.restore();
    r.fillRounded(px, py, pw, ph, 14, 'rgba(12,28,18,.97)');
    r.strokeRounded(px, py, pw, ph, 14, 'rgba(245,158,11,0.5)', 1.5);

    // 标题
    r.glFillText('📊 近期战绩', W/2, py+24, '700 18px sans-serif', '#fcd34d', 'center', 'middle');

    // 关闭按钮
    var closeSz = 32;
    var closeX = px + pw - closeSz - 8, closeY = py + 8;
    var rcp = M3.Render.beginPressScale('record_close', closeX + closeSz / 2, closeY + closeSz / 2);
    r.fillRounded(closeX, closeY, closeSz, closeSz, closeSz/2, 'rgba(185,28,28,.45)');
    r.glFillText('✕', closeX+closeSz/2, closeY+closeSz/2, '700 14px sans-serif', '#fca5a5', 'center', 'middle');
    M3.Render.endPressScale(rcp);
    hitBtns.push({ x:closeX, y:closeY, w:closeSz, h:closeSz, label:'record_close', onClick:function(){ M3.SceneRecord.hide(); } });

    var display = _records.slice(0, 10);
    if (display.length === 0) {
      r.glFillText('暂无战绩，快去对战吧！', W/2, py+ph/2, '400 14px sans-serif', '#94a3b8', 'center', 'middle');
      return;
    }

    var rowH   = 44;
    var listTop = py + 52;
    var listH  = ph - 100;
    var totalContentH = display.length * rowH;

    // 限制滚动范围
    var maxScroll = Math.max(0, totalContentH - listH);
    _scrollY = Math.max(0, Math.min(_scrollY, maxScroll));

    for (var i = 0; i < display.length; i++) {
      var rec = display[i];
      var ry = listTop + i * rowH - _scrollY;
      // 可见性剔除（无 clip，手动跳过）
      if (ry + rowH < listTop || ry > listTop + listH) continue;

      var isWin = rec.result === 'win';
      var rowBg = i % 2 === 0 ? 'rgba(6,36,24,.6)' : 'rgba(6,36,24,.3)';
      r.fillRounded(px+10, ry+2, pw-20, rowH-4, 6, rowBg);

      // 局号
      r.glFillText('第'+(i+1)+'局', px+20, ry+rowH/2, '400 11px sans-serif', '#64748b', 'left', 'middle');

      // 角色
      var roleLabel = rec.role === 'landlord' ? '👑地主' : '👨‍🌾农民';
      var roleColor = rec.role === 'landlord' ? '#fcd34d' : '#a7f3d0';
      r.glFillText(roleLabel, px+pw*0.38, ry+rowH/2, '600 12px sans-serif', roleColor, 'center', 'middle');

      // 输赢
      r.glFillText(isWin?'胜利':'失败', px+pw*0.58, ry+rowH/2, '700 14px sans-serif', isWin?'#22c55e':'#ef4444', 'center', 'middle');

      // 分数变化
      var deltaStr = (rec.delta >= 0 ? '+' : '') + (rec.delta || 0);
      r.glFillText(deltaStr+'分', px+pw-16, ry+rowH/2, '700 14px sans-serif', rec.delta>=0?'#fbbf24':'#f87171', 'right', 'middle');
    }

    // 滚动条
    if (totalContentH > listH) {
      var scrollBarH = (listH / totalContentH) * listH;
      var scrollBarY = listTop + (_scrollY / totalContentH) * listH;
      var sbX = px + pw - 8;
      r.save(); r.setAlpha(0.4);
      r.fillRounded(sbX, listTop, 4, listH, 2, '#334155');
      r.fillRounded(sbX, scrollBarY, 4, scrollBarH, 2, '#fcd34d');
      r.restore();
    }

    // 底部提示
    r.glFillText('↕ 上下滑动查看更多', W/2, py+ph-22, '400 11px sans-serif', '#64748b', 'center', 'middle');
  }
})();
