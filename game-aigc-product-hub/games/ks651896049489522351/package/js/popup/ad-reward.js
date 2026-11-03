/**
 * scene-ad-reward.js — 看广告得铁豆弹窗（主页）
 *
 * 交互流程：
 *   1. 主页点击「看广告得铁豆」图标 → show() 打开弹窗并向服务端拉取今日次数
 *   2. 服务端下发 adRewardStatus { claimCount, remaining, nextRewardAmount, ... }
 *      （次数/上限/阶梯奖励全部由服务端权威控制）
 *   3. 点击弹窗内「领取」按钮 → 播放激励视频
 *   4. 看完广告 → claimAdReward 上报服务端 → 服务端发豆并回传 wallet
 *   5. main.js 收到 wallet(rewardType=ad_reward) 后调 updateFromWallet() 刷新弹窗
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var AM = M3.AssetManager;

  // ─── 资源（设计稿整图 1428 x 741：标题/金横幅/人物等全部烘焙在 bg 内）───
  var GROUP = 'popup:adreward';
  var RES = {
    panel: ['adreward-panel', 'subpackages/popup/asset/image/popup/adreward/adreward-panel.png'],
    btn: ['btnGold', 'asset/image/common/btn/btn-6.png'],
    close: ['btn-close', 'asset/image/common/btn/btn-close.png'],
    fontBean: ['font-bean-atlas', 'asset/image/common/font/atlas.png'],
  };
  function ensureAssets () {
    if (!AM) return;
    for (var k in RES) {
      if (RES.hasOwnProperty(k) && !AM.loaded(RES[k][0])) {
        AM.acquire('image', RES[k][0], RES[k][1], GROUP);
      }
    }
  }

  // ─── Sprite Font：atlas.png 字符映射 ─────────────────────────
  // [sx, sy, sw, sh, logicW, logicH]  (logicW/H = spriteSourceSize，用于字间距)
  var FONT_BEAN_MAP = {
    '0': [0, 0, 61, 88, 69, 116],
    '1': [543, 0, 39, 85, 69, 116],
    '2': [314, 0, 58, 86, 69, 116],
    '3': [374, 0, 54, 88, 69, 116],
    '4': [250, 0, 62, 85, 69, 116],
    '5': [430, 0, 54, 87, 69, 116],
    '6': [126, 0, 60, 88, 69, 116],
    '7': [486, 0, 55, 85, 69, 116],
    '8': [63, 0, 61, 88, 69, 116],
    '9': [188, 0, 60, 88, 69, 116],
    '豆': [584, 0, 49, 52, 55, 58],
    '+': [635, 0, 45, 50, 51, 83],
  };

  // 用 sprite font 绘制文本，cx/cy 为数字行中心点，targetH 为数字目标高度(px)
  // opts.smallChars: { '+': true, '豆': true }  — 需要缩放的字符
  // opts.smallRatio: number | { '+': 0.8, '豆': 0.5 }  — 缩放比，可按字符单独设
  // opts.alignBottom: true  — 所有字符底部对齐
  function drawBitmapText (rd, atlasImg, str, cx, cy, targetH, opts) {
    opts = opts || {};
    var smallChars = opts.smallChars || {};
    var ratioSpec = opts.smallRatio != null ? opts.smallRatio : 0.5;
    var alignBottom = !!opts.alignBottom;
    var bottomY = cy + targetH / 2;

    function getH (ch) {
      if (!smallChars[ch]) return targetH;
      if (typeof ratioSpec === 'object') return targetH * (ratioSpec[ch] != null ? ratioSpec[ch] : 0.5);
      return targetH * ratioSpec;
    }

    var chars = str.split('');
    var totalW = 0;
    for (var i = 0; i < chars.length; i++) {
      var g = FONT_BEAN_MAP[chars[i]];
      if (!g) continue;
      totalW += g[4] * (getH(chars[i]) / g[5]);
    }
    var x = cx - totalW / 2;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var g = FONT_BEAN_MAP[ch];
      if (!g) continue;
      var h = getH(ch);
      var sc = h / g[5];
      var dw = g[2] * sc;
      var dh = g[3] * sc;
      var dy = alignBottom ? bottomY - dh : cy - dh / 2;
      rd.glDrawImage(atlasImg, g[0], g[1], g[2], g[3], x, dy, dw, dh);
      x += g[4] * sc;
    }
  }

  // ─── 状态 ────────────────────────────────────────────────────
  var _visible = false;
  var _requesting = false;   // getAdRewardStatus 防抖
  var _status = null;        // { claimCount, maxClaimsPerDay, remaining, nextRewardAmount }
  var _layout = null;        // draw 时缓存的布局（供关闭判定用）

  function r () { return M3.Render; }

  M3.SceneAdReward = M3.SceneAdReward || {};

  function statusText () {
    if (!_status) return '';
    var n = Number(_status.claimCount || 0);
    var max = Number(_status.maxClaimsPerDay || 0);
    var m = Number(_status.remaining);
    if (!isFinite(m)) m = Math.max(0, max - n);
    if (m <= 0) return '今日已达上限 · 明日再来';
    return '今日还剩 ' + m + '/' + max;
  }

  // ─── 网络请求 ────────────────────────────────────────────────
  // 初始状态由 bootstrap 回包驱动（_applyBootstrapResponse → updateStatus）；
  // 弹窗打开时若尚无缓存，走 WebSocket 兜底。
  function requestStatus () {
    if (_requesting) return;
    // bootstrap 已有缓存无需重复请求
    if (_status) return;
    if (!M3.Network || !M3.Network.send) return;
    var payload = {};
    if (M3.Game && M3.Game.getUser) {
      var u = M3.Game.getUser() || {};
      payload.nickname = u.nickname || '玩家';
    }
    if (M3.Network.ensureSocket) M3.Network.ensureSocket(payload.nickname || '玩家');
    _requesting = true;
    M3.Network.send('getAdRewardStatus', payload);
    // 兜底：8s 内没回包则解除 requesting（网络断开时不卡死按钮）
    setTimeout(function () { _requesting = false; }, 8000);
  }

  function updateStatus (status) {
    if (!status) return;
    _requesting = false;
    _status = {
      claimCount: Number(status.claimCount || 0),
      maxClaimsPerDay: Number(status.maxClaimsPerDay || 0),
      remaining: Number(status.remaining),
      nextRewardAmount: Number(status.nextRewardAmount || 0),
    };
    // 响应外部 queryStatus 查询（场次入口的豆不足分流）
    if (_pendingQueryCb) {
      if (_pendingQueryTimer) { clearTimeout(_pendingQueryTimer); _pendingQueryTimer = null; }
      var cb = _pendingQueryCb; _pendingQueryCb = null;
      cb(_status);
    }
  }

  // 查询今日广告次数状态（带缓存）：
  //   有缓存直接回调；无缓存发 getAdRewardStatus 等回包。
  //   callback(st)：st.remaining>0 → 未达上限；st 为 null → 获取失败/超时（调用方自行兜底）。
  var _pendingQueryCb = null;
  var _pendingQueryTimer = null;
  function queryStatus (callback) {
    if (typeof callback !== 'function') return;
    if (_status) { callback(_status); return; }
    _pendingQueryCb = callback;
    if (_pendingQueryTimer) clearTimeout(_pendingQueryTimer);
    _pendingQueryTimer = setTimeout(function () {
      _pendingQueryTimer = null;
      if (_pendingQueryCb) { var cb = _pendingQueryCb; _pendingQueryCb = null; cb(null); }
    }, 8000);
    if (!_requesting) requestStatus();
  }

  // 领取成功后由 wallet 消息驱动（服务端权威数据）
  function updateFromWallet (data) {
    updateStatus({
      claimCount: data.claimCount,
      maxClaimsPerDay: data.maxClaimsPerDay,
      remaining: Math.max(0, Number(data.maxClaimsPerDay || 0) - Number(data.claimCount || 0)),
      nextRewardAmount: data.nextRewardAmount,
    });
  }

  // ─── 开关 ────────────────────────────────────────────────────
  function show () {
    ensureAssets();
    _visible = true;
    // 后台静默刷新最新次数（保留旧缓存先显示，回包后自动更新）
    if (!_requesting) {
      _requesting = true;
      if (M3.GameHttp) {
        M3.GameHttp.bootstrap().then(function (data) {
          _requesting = false;
          if (data && data.adReward) updateStatus(data.adReward);
        }).catch(function () {
          _requesting = false;
          if (!_status) requestStatus(); // 无缓存时 WebSocket 兜底
        });
      } else {
        requestStatus();
      }
    }
  }
  function hide () {
    _visible = false;
    // 关闭弹窗即释放本组切图资源（下次 show 重新加载）
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
  }
  function isVisible () { return !!_visible; }

  // ─── 领取（看广告 → 上报服务端）──────────────────────────────
  function claimReward () {
    if (_status && Number(_status.remaining) === 0) {
      M3.Game.flash('今日广告奖励已达上限，明日再来');
      return;
    }
    if (_requesting && !_status) { M3.Game.flash('正在获取次数，请稍后再试'); return; }
    if (typeof KwaiAd !== 'undefined' && KwaiAd.showRewarded) {
      KwaiAd.showRewarded(
        function () {
          // 看完广告：上报服务端，由服务端权威发豆并回传最新次数
          if (M3.Game.claimAdReward) M3.Game.claimAdReward();
          else M3.Game.flash('奖励服务暂不可用，请稍后再试');
        },
        function () { M3.Game.flash('看完广告才能获得铁豆哦~'); }
      );
    } else {
      // 无广告环境（本地调试）：直接走服务端发放链路
      if (M3.Game.claimAdReward) M3.Game.claimAdReward();
      else M3.Game.flash('暂无广告，稍后再试~');
    }
  }

  // ─── 绘制 ────────────────────────────────────────────────────
  function drawImg (key, x, y, w, h) {
    var rd = r();
    if (!AM || !AM.loaded(key)) return false;
    var img = AM.get(key);
    rd.glDrawImage(img, x, y, w, h);
    return true;
  }

  M3.SceneAdReward.draw = function () {
    var rd = r();
    if (!rd || !_visible) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    // ── 黑色透明遮罩（点击面板外区域关闭；点弹窗本身不关闭）──
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // ── 面板（整图 1428 x 741，等比缩放居中；显示高度沿用旧版视觉大小）──
    var ph = Math.round(Math.min(Math.round(W * 0.92), 540) * 254 / 538);
    var pw = Math.round(ph * 1428 / 741);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var s = pw / 1428;
    _layout = { px: px, py: py, pw: pw, ph: ph, s: s };

    // 遮罩热区只覆盖面板外的四块区域，面板本体点击不触发关闭
    pushBtn(hb, 0, 0, W, py, 'adreward_mask', hide);
    pushBtn(hb, 0, py + ph, W, H - py - ph, 'adreward_mask', hide);
    pushBtn(hb, 0, py, px, ph, 'adreward_mask', hide);
    pushBtn(hb, px + pw, py, W - px - pw, ph, 'adreward_mask', hide);
    // 面板本体兜底热区：吃掉所有点击，防止穿透到下层主页按钮
    pushBtn(hb, px, py, pw, ph, 'adreward_panel', null);

    // ── 关闭 X (102x102)：骑缝贴可见右缘、被 bg 覆盖一点（旧稿 (501,23)/34
    //     等比换算到新 1428x741 坐标系；绘制在 bg 下层，嵌入部分被 bg 盖住）──
    var cSz = 102 * s;
    var cX = px + 1417 * s, cY = py + 67 * s;
    var cpressed = beginPress('adreward_close', cX + cSz / 2, cY + cSz / 2);
    drawImg(RES.close[0], cX, cY, cSz, cSz);
    endPress(cpressed);
    pushBtn(hb, cX, cY, cSz, cSz, 'adreward_close', hide);

    drawImg(RES.panel[0], px, py, pw, ph);

    // ── 奖励豆数「+1000豆」Sprite Font，在次数文字上方 ──
    var txt = statusText();
    var hasLeft = _status && Number(_status.remaining) > 0;
    if (hasLeft && AM && AM.loaded(RES.fontBean[0])) {
      var atlasImg = AM.get(RES.fontBean[0]);
      var bitmapH = Math.round(ph * 0.19);   // 数字高度≈面板19%
      drawBitmapText(rd, atlasImg, '+' + Number(_status.nextRewardAmount || 0) + '豆',
        px + 1090 * s, py + 306 * s, bitmapH,
        { smallChars: { '+': true, '豆': true }, smallRatio: { '+': 0.65, '豆': 0.5 }, alignBottom: true });
    }
    if (txt) {
      var fS = Math.max(10, Math.round(36 * s));
      rd.glFillText(txt, px + 1090 * s, py + 435 * s,
        '700 ' + fS + 'px sans-serif', '#ffffff', 'center', 'middle');
    }

    // ── 领取按钮：黄按钮底图(369x120=旧123x40的3x切图) + 代码叠字 ──
    var btW = 327 * s, btH = 117 * s;
    var btX = px + 927 * s, btY = py + 499 * s;
    var bpressed = beginPress('adreward_btn', btX + btW / 2, btY + btH / 2);
    drawImg(RES.btn[0], btX, btY, btW, btH);
    rd.glFillTextStroke('立即领取', btX + btW / 2, btY + btH / 2,
      '800 ' + Math.max(12, Math.round(50 * s)) + 'px sans-serif',
      '#FFFFFF', '#C75602', Math.max(2.5, 50 * s * 0.16), 'center', 'middle');
    endPress(bpressed);
    pushBtn(hb, btX, btY, btW, btH, 'adreward_btn', claimReward);
  };

  // ─── 工具（与 scene-home.js 相同的按压反馈）─────────────────
  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  function beginPress (label, cx, cy, scale) {
    if (!(M3.Input && M3.Input.getPressedLabel && M3.Input.getPressedLabel() === label)) return false;
    var rd = r();
    rd.save();
    rd.translate(cx, cy);
    rd.scale(scale || 0.92, scale || 0.92);
    rd.translate(-cx, -cy);
    return true;
  }

  function endPress (pressed) {
    if (pressed) r().restore();
  }

  // ─── 导出 ────────────────────────────────────────────────────
  // 共享 sprite font 供其他弹窗复用（传入 atlasImg 避免跨 GROUP 依赖）
  M3.FontBean = M3.FontBean || {};
  M3.FontBean.map = FONT_BEAN_MAP;
  M3.FontBean.drawImg = drawBitmapText;   // (rd, atlasImg, str, cx, cy, targetH, opts)
  M3.FontBean.draw = function (rd, atlasKey, str, cx, cy, targetH, opts) {
    var AM2 = M3.AssetManager;
    if (!AM2 || !AM2.loaded(atlasKey)) return;
    drawBitmapText(rd, AM2.get(atlasKey), str, cx, cy, targetH, opts);
  };

  M3.SceneAdReward.show = show;
  M3.SceneAdReward.hide = hide;
  M3.SceneAdReward.isVisible = isVisible;
  M3.SceneAdReward.updateStatus = updateStatus;
  M3.SceneAdReward.updateFromWallet = updateFromWallet;
  M3.SceneAdReward.queryStatus = queryStatus;
})();
