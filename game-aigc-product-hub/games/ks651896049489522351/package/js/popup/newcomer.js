/**
 * scene-newcomer.js — 新手礼包弹窗（首次进入欢迎礼）
 *
 * 交互流程：
 *   1. 上线（authOk）后客户端查询一次 getNewcomerGiftStatus
 *   2. 服务端下发 { claimed, amount, claimCount }（终身一次，lifetime 标识）
 *   3. 未领取 → 自动弹出欢迎礼包弹窗；已领取 → 不弹出
 *   4. 点「开心收下」→ claimNewcomerGift 上报 → 服务端权威发豆
 *   5. wallet 回包（rewardType=newcomer_gift）→ 关闭弹窗 + flash 提示
 *
 * 关闭行为：点弹窗本体不关闭；点右上角 X 或面板外遮罩才关闭
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var AM = M3.AssetManager;

  // ─── 资源（设计稿切图 3x）────────────────────────────────────
  var GROUP = 'popup:newcomer';
  // ─── 资源（整图 1539x726 = 旧 513x242 的 3x 高清版：标题「欢迎礼包」/人物烘焙在 panel 内）───
  var GROUP = 'popup:newcomer';
  var RES = {
    panel:  ['newcomer-panel',  'subpackages/popup/asset/image/popup/newcomer/newcomer-panel.png'],
    btn:    ['btnGold', 'asset/image/common/btn/btn-6.png'],
    close:  ['btn-close',  'asset/image/common/btn/btn-close.png'],
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

  // ─── 状态 ────────────────────────────────────────────────────
  var _visible = false;
  var _dismissed = false;    // 用户已关闭/已领取，本次会话不再自动弹（防重连重复骚扰）
  var _pendingShow = false;  // 状态回包时不在 home 屏，待进入后补弹
  var _status = null;        // { claimed, amount, claimCount }
  var _claiming = false;     // 领取请求防抖

  function r () { return M3.Render; }

  M3.SceneNewcomer = M3.SceneNewcomer || {};

  // ─── 上线查询：未领取才弹出 ──────────────────────────────────
  // bootstrap 已返回 newcomerGift 状态时（_status 已设），直接用，不再发任何查询。
  // authOk（WS 认证回包）总是先于 HTTP bootstrap 到达，此处 _status 为 null 是正常时序：
  // 不抢跑 WS 查询（否则每次上线都多发一条 getNewcomerGiftStatus socket 消息），
  // 等 bootstrap 回包后 updateStatus() 会自动补弹。
  function checkOnLaunch () {
    if (_dismissed || _visible) return;
    // bootstrap 已填充状态：直接用
    if (_status) {
      if (!_status.claimed && !_dismissed) {
        if (M3.Game.getScreen && M3.Game.getScreen() === 'home') show();
        else _pendingShow = true;
      }
      return;
    }
    // bootstrap 尚未回包：静默等待（bootstrap 必带 newcomerGift 字段；
    // 极端情况下 bootstrap 回包缺失该字段时由 game.js 兜底调 sendGetStatus）
  }

  function sendGetStatus () {
    if (!M3.Network || !M3.Network.send) return;
    var payload = {};
    if (M3.Game && M3.Game.getUser) {
      var u = M3.Game.getUser() || {};
      payload.nickname = u.nickname || '玩家';
    }
    if (M3.Network.ensureSocket) M3.Network.ensureSocket(payload.nickname || '玩家');
    M3.Network.send('getNewcomerGiftStatus', payload);
  }

  // 服务端回包 { claimed, amount, claimCount }
  function updateStatus (data) {
    if (!data) return;
    // claimed 判定加上 claimCount ≥ 1：bootstrap 自动发放链路下（服务端 9003a48），
    // 部署前已领过的老账号每次 bootstrap 会收到 { claimed:false, amount:0, claimCount:1 }
    // （claimDailyRewardIfAllowed 幂等重复的返回原样透传），只看 claimed 会被当成
    // 「未领取」→ 每次上线自动弹一个没有任何奖励数量的礼包弹窗。
    _status = {
      claimed: !!data.claimed || Number(data.claimCount || 0) > 0,
      amount: Number(data.amount || 0),
      claimCount: Number(data.claimCount || 0),
    };
    // 未领取 → 自动弹出；authOk 可能发生在 login 屏，
    // 此时先记 pending，等进入 home 屏后由 checkPending() 补弹
    if (!_status.claimed && !_visible && !_dismissed) {
      if (M3.Game.getScreen && M3.Game.getScreen() === 'home') show();
      else _pendingShow = true;
    }
  }

  // 每帧由 home 屏调用：补弹待显示的新手礼包
  function checkPending () {
    if (!_pendingShow) return;
    if (_status && _status.claimed) { _pendingShow = false; return; }
    if (_dismissed || _visible) { _pendingShow = false; return; }
    _pendingShow = false;
    show();
  }

  // ─── 领取 ────────────────────────────────────────────────────
  function claim () {
    if (_claiming) return;
    if (_status && _status.claimed) { hide(); return; }
    _claiming = true;
    // HTTP 路径
    if (M3.GameHttp) {
      M3.GameHttp.claim('newcomer_gift').then(function (data) {
        _claiming = false;
        if (M3.Game && M3.Game.setWallet && data && data.wallet) {
          M3.Game.setWallet(data.wallet, data.economy, {
            walletSource: 'server', economyVersion: data.economyVersion || '',
            initialBeans: data.initialBeans || 0, serverNow: data.serverNow || 0,
            rewardType: data.rewardType || '',
          });
        }
        onWalletReward(data);
        if (data && data.message) M3.Game.flash(data.message);
        if (data && data.claimed && data.amount > 0 && M3.SceneBeanReward && M3.SceneBeanReward.show) {
          M3.SceneBeanReward.show(data.amount);
        }
      }).catch(function (err) {
        _claiming = false;
        M3.Game.flash((err && err.message) || '新手礼包领取失败');
      });
      return;
    }
    // WebSocket 降级
    if (!M3.Network || !M3.Network.send) { _claiming = false; M3.Game.flash('网络未连接，请稍后再试'); return; }
    var payload = {};
    if (M3.Game && M3.Game.getUser) {
      var u = M3.Game.getUser() || {};
      payload.nickname = u.nickname || '玩家';
    }
    if (M3.Network.ensureSocket) M3.Network.ensureSocket(payload.nickname || '玩家');
    M3.Network.send('claimNewcomerGift', payload);
    // 兜底：8s 解除防抖（网络异常时不卡死按钮）
    setTimeout(function () { _claiming = false; }, 8000);
  }

  // wallet 回包（rewardType=newcomer_gift）：领取成功后关闭
  function onWalletReward (data) {
    _claiming = false;
    if (data && data.claimed) {
      if (_status) _status.claimed = true;
      _dismissed = true;   // 已领取，本次会话不再自动弹
      hide();
    } else if (data && data.amount === 0) {
      // 已领取过（重复点击兜底）
      if (_status) _status.claimed = true;
      _dismissed = true;
      hide();
    }
  }

  // ─── 开关 ────────────────────────────────────────────────────
  function show () {
    ensureAssets();
    _visible = true;
  }
  function hide () {
    _visible = false;
    // 用户主动关闭（X/遮罩）：本次会话不再自动弹出，防重连后重复骚扰
    _dismissed = true;
    // 关闭弹窗即释放本组切图资源（下次 show 重新加载）
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
  }
  function isVisible () { return !!_visible; }

  // ─── 绘制 ────────────────────────────────────────────────────
  function drawImg (key, x, y, w, h) {
    var rd = r();
    if (!AM || !AM.loaded(key)) return false;
    var img = AM.get(key);
    rd.glDrawImage(img, x, y, w, h);
    return true;
  }

  M3.SceneNewcomer.draw = function () {
    var rd = r();
    if (!rd || !_visible) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    // ── 黑色透明遮罩（Figma Rectangle 22: rgba(0,0,0,0.6)）──
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // ── 弹窗面板（新切图 513x242 逻辑，≈2.12:1，等比缩放居中）──
    var pw = Math.min(Math.round(W * 0.9), 520);
    var ph = Math.round(pw * 242 / 513);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);

    // 遮罩热区只覆盖面板外四块区域；点弹窗本体不关闭
    pushBtn(hb, 0, 0, W, py, 'newcomer_mask', hide);
    pushBtn(hb, 0, py + ph, W, H - py - ph, 'newcomer_mask', hide);
    pushBtn(hb, 0, py, px, ph, 'newcomer_mask', hide);
    pushBtn(hb, px + pw, py, W - px - pw, ph, 'newcomer_mask', hide);
    // 面板本体兜底热区：吃掉所有点击，防止穿透到下层主页按钮
    pushBtn(hb, px, py, pw, ph, 'newcomer_panel', null);

    drawImg(RES.panel[0], px, py, pw, ph);

    // ── 奖励豆数「+N豆」Sprite Font，与按钮垂直居中在按钮上方 ──
    var sc = pw / 513;
    if (_status && Number(_status.amount) > 0 && M3.FontBean) {
      var bitmapH = Math.round(ph * 0.19);
      M3.FontBean.draw(rd, RES.fontBean[0], '+' + Number(_status.amount) + '豆',
        px + 373.5 * sc, py + ph * (108 / 242), bitmapH,
        { smallChars: { '+': true, '豆': true }, smallRatio: { '+': 0.65, '豆': 0.5 }, alignBottom: true });
    }

    // ── 领取按钮：黄按钮底图(123x40) + 代码叠字（白字+#C75602 描边，局内同款）──
    // 位置按 Figma 1932-3786：内容组合 Group 108 中心线 x=373.5(72.8%)，按钮层 y=156~195
    var bW = 123 * sc, bH = 40 * sc;
    var bX = px + 312 * sc, bY = py + ph * (156 / 242);
    var bpressed = beginPress('newcomer_btn', bX + bW / 2, bY + bH / 2);
    drawImg(RES.btn[0], bX, bY, bW, bH);
    r().glFillTextStroke('开心领取', bX + bW / 2, bY + bH / 2,
      '800 ' + Math.max(12, Math.round(17 * sc)) + 'px sans-serif',
      '#FFFFFF', '#C75602', Math.max(2.5, 17 * sc * 0.16), 'center', 'middle');
    endPress(bpressed);
    pushBtn(hb, bX, bY, bW, bH, 'newcomer_btn', claim);

    // 关闭 X (34x34)：骑缝贴右缘、被 bg 覆盖一点（Figma: left 507，可见缘 510，嵌入 3px）
    var cSz = pw * (34 / 513);
    var cX = px + pw * 0.9883, cY = py + ph * 0.1364;
    var cpressed = beginPress('newcomer_close', cX + cSz / 2, cY + cSz / 2);
    drawImg(RES.close[0], cX, cY, cSz, cSz);
    endPress(cpressed);
    pushBtn(hb, cX, cY, cSz, cSz, 'newcomer_close', hide);
  };

  // ─── 工具 ────────────────────────────────────────────────────
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
  M3.SceneNewcomer.show = show;
  M3.SceneNewcomer.hide = hide;
  M3.SceneNewcomer.isVisible = isVisible;
  M3.SceneNewcomer.checkOnLaunch = checkOnLaunch;
  M3.SceneNewcomer.checkPending = checkPending;
  M3.SceneNewcomer.updateStatus = updateStatus;
  M3.SceneNewcomer.onWalletReward = onWalletReward;
  M3.SceneNewcomer.sendGetStatus = sendGetStatus;   // 供 game.js 在 bootstrap 回包缺字段时兜底
})();
