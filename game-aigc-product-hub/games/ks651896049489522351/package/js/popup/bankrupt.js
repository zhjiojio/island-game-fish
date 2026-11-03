/**
 * scene-bankrupt.js — 破产补助弹窗（结算页最顶层）
 *
 * 触发流程：
 *   1. 游戏结束，结算 state.bankruptRewards[myId].claimable === true
 *      （本局输钱且余额低于 5000，由服务端判定）
 *   2. 结算页显示「破产」样式时，弹窗在最顶层自动弹出
 *   3. 点「领取」→ claimBankruptReward 上报 → 服务端权威发 3000 豆
 *      （每日限 1 次，余额 ≥ 5000 不可领）
 *   4. wallet 回包（rewardType=bankrupt_relief）→ 关闭弹窗
 *
 * 关闭行为：点弹窗本体不关闭；点右上角 X 或面板外遮罩才关闭
 *
 * UI 模式（与欢迎礼包/看广告/加桌弹窗统一）：整图 panel bg（烘焙标题/
 * 金额+30000/人物）+ 黄按钮底图叠字「立即领取」+ 34x34 关闭按钮骑缝贴
 * 可见右缘、绘制在 bg 下层（嵌入部分被 bg 盖住）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var AM = M3.AssetManager;

  // ─── 资源（整图 1590 x 780 = 旧 530x260 的 3x 高清版：标题/财神人物烘焙在 panel 内）───
  var GROUP = 'popup:bankrupt';
  var RES = {
    panel: ['bankrupt-panel', 'subpackages/popup/asset/image/popup/bankrupt/bankrupt-panel.png'],
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

  // ─── 状态 ────────────────────────────────────────────────────
  var _visible = false;
  var _claiming = false;   // 领取请求防抖
  var _amount = 0;         // 服务端下发的补助金额（结算 bankruptRewards.amount）

  function r () { return M3.Render; }

  M3.SceneBankrupt = M3.SceneBankrupt || {};

  // ─── 领取（服务端权威：余额<5000，每日 1 次）─────────────────
  function claim () {
    if (_claiming) return;
    if (!M3.Network || !M3.Network.send) { M3.Game.flash('网络未连接，请稍后再试'); return; }
    _claiming = true;
    var payload = {};
    if (M3.Game && M3.Game.getUser) {
      var u = M3.Game.getUser() || {};
      payload.nickname = u.nickname || '玩家';
    }
    if (M3.Network.ensureSocket) M3.Network.ensureSocket(payload.nickname || '玩家');
    M3.Network.send('claimBankruptReward', payload);
    // 兜底：8s 解除防抖（网络异常时不卡死按钮）
    setTimeout(function () { _claiming = false; }, 8000);
  }

  // wallet 回包（rewardType=bankrupt_relief）
  function onWalletReward (data) {
    _claiming = false;
    if (data && (data.claimed || data.amount > 0)) {
      hide();
    } else if (data && data.amount === 0) {
      // 不可领（余额足/已领过）：服务端 notice 已提示原因，直接关弹窗
      hide();
    }
  }

  // ─── 开关 ────────────────────────────────────────────────────
  function show (amount) {
    _amount = Number(amount || 0);   // 结算数据里的服务端权威金额
    ensureAssets();
    _visible = true;
    if (M3.Vibrate) M3.Vibrate.medium();   // 豆子不足（破产补助）弹窗出现：中×1
  }
  function hide () {
    _visible = false;
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

  M3.SceneBankrupt.draw = function () {
    var rd = r();
    if (!rd || !_visible) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    // ── 黑色透明遮罩 ──
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // ── 弹窗面板（整图 530 x 260，等比缩放居中）──
    var pw = Math.min(Math.round(W * 0.9), 520);
    var ph = Math.round(pw * 260 / 530);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var s = pw / 530;

    // 遮罩热区只覆盖面板外四块区域；点弹窗本体不关闭
    pushBtn(hb, 0, 0, W, py, 'bankrupt_mask', hide);
    pushBtn(hb, 0, py + ph, W, H - py - ph, 'bankrupt_mask', hide);
    pushBtn(hb, 0, py, px, ph, 'bankrupt_mask', hide);
    pushBtn(hb, px + pw, py, W - px - pw, ph, 'bankrupt_mask', hide);
    // 面板本体兜底热区：吃掉所有点击，防止穿透到下层主页按钮
    pushBtn(hb, px, py, pw, ph, 'bankrupt_panel', null);

    // ── 关闭 X (34x34)：骑缝贴可见右缘 x=530（图满宽无透明留白，嵌入 4px），
    //     绘制在 bg 下层，嵌入部分被 bg 盖住（与欢迎礼包/看广告/加桌弹窗同款；
    //     右上圆角过渡区 y 18~48 处按钮悬于圆角外，y>48 直边段嵌入）──
    var cSz = 34 * s;
    var cX = px + 524 * s, cY = py + 45 * s;
    var cpressed = beginPress('bankrupt_close', cX + cSz / 2, cY + cSz / 2);
    drawImg(RES.close[0], cX, cY, cSz, cSz);
    endPress(cpressed);
    pushBtn(hb, cX, cY, cSz, cSz, 'bankrupt_close', hide);

    drawImg(RES.panel[0], px, py, pw, ph);

    // ── 奖励豆数「+N豆」Sprite Font ──
    if (_amount > 0 && M3.FontBean) {
      var bitmapH = Math.round(ph * 0.19);
      M3.FontBean.draw(rd, RES.fontBean[0], '+' + _amount + '豆',
        px + 405 * s, py + 120 * s, bitmapH,
        { smallChars: { '+': true, '豆': true }, smallRatio: { '+': 0.65, '豆': 0.5 }, alignBottom: true });
    }

    // ── 「当前余额N · 今日剩1次」：金额与按钮之间，与中心线 x=405 水平居中
    //     （余额为服务端 wallet 权威值；每日限领 1 次，claimable 即今日未领）──
    var wallet = (M3.Game.getWallet && M3.Game.getWallet()) || {};
    var bal = Number(wallet.availableBeans != null ? wallet.availableBeans : wallet.beans) || 0;
    var balTxt = (M3.Game.formatBeans ? M3.Game.formatBeans(bal) : String(bal));
    rd.glFillText('当前余额' + balTxt + ' · 今日剩1次', px + 405 * s, py + 175 * s,
      '700 ' + Math.max(10, Math.round(12.5 * s)) + 'px sans-serif',
      '#ffffff', 'center', 'middle');

    // ── 领取按钮：黄按钮底图(123x40) + 代码叠字（白字+#C75602 描边，局内同款）。
    //     深紫底座实测 y 140~250，按钮居底座中部偏下，与标题/金额中心线对齐 ──
    var bW = 123 * s, bH = 40 * s;
    var bX = px + 343.5 * s, bY = py + 195 * s;
    var bpressed = beginPress('bankrupt_btn', bX + bW / 2, bY + bH / 2);
    drawImg(RES.btn[0], bX, bY, bW, bH);
    rd.glFillTextStroke('领取补助', bX + bW / 2, bY + bH / 2,
      '800 ' + Math.max(12, Math.round(17 * s)) + 'px sans-serif',
      '#FFFFFF', '#C75602', Math.max(2.5, 17 * s * 0.16), 'center', 'middle');
    endPress(bpressed);
    pushBtn(hb, bX, bY, bW, bH, 'bankrupt_btn', claim);
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
  M3.SceneBankrupt.show = show;
  M3.SceneBankrupt.hide = hide;
  M3.SceneBankrupt.isVisible = isVisible;
  M3.SceneBankrupt.claim = claim;
  M3.SceneBankrupt.onWalletReward = onWalletReward;
})();
