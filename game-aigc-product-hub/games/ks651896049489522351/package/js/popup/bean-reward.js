/**
 * bean-reward.js — 获得豆子 / 购买钻石成功弹窗
 *
 * 调用：
 *   M3.SceneBeanReward.show(amount)                      // 获得铁豆（默认）
 *   M3.SceneBeanReward.show(amount, onClose)
 *   M3.SceneBeanReward.show(amount, onClose, 'diamond')  // 购买钻石成功
 *
 * type='bean'    → title「恭喜获得」，豆子 icon，按钮「确定」（btn-6）
 * type='diamond' → title「购买成功」，钻石 icon，按钮「确定」（btn-5）+「去使用」（btn-6）
 *                   「去使用」= 关闭弹窗 → 打开商城钻石换铁豆 Tab
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var AM = M3.AssetManager;

  var GROUP = 'popup:bean-reward';
  // 弹窗主体已换 spine（gongxi/goumai），icon 全部走商城档位图（按到账数量匹配，
  // 兜底第一档），无其他切图。

  // 商城铁豆档位 icon（与 shop.js / insufficient-beans.js 的映射一致，按 costBalance 取）
  var BEAN_ICON_BY_COST = {
    30: 'shop-bean-icon-1', 60: 'shop-bean-icon-2', 120: 'shop-bean-icon-3',
    300: 'shop-bean-icon-4', 680: 'shop-bean-icon-5', 980: 'shop-bean-icon-6',
    3280: 'shop-bean-icon-7', 6480: 'shop-bean-icon-8',
  };

  // 到账数量匹配最接近的档位 icon（非档位数量取数值最接近的档）：
  //   bean    → 兑换目录按 grantBeans 最接近 → 对应 shop-bean-icon-N
  //   diamond → 充值目录按 diamonds 升序取最接近 → shop-diamond-icon-N（与商城列表档位顺序一致）
  // 目录不可用 / 匹配不到时返回 null（回退通用 icon）
  var _tierIcon = null;
  function pickTierIcon () {
    try {
      var st = M3.Iap && M3.Iap.getState ? M3.Iap.getState() : null;
      if (!st) return null;
      var i, best, diff;
      if (_type === 'bean') {
        var ex = st.exchangeCatalog || [];
        best = null; diff = Infinity;
        for (i = 0; i < ex.length; i++) {
          var d = Math.abs(Number(ex[i].grantBeans || 0) - _amount);
          if (d < diff) { diff = d; best = ex[i]; }
        }
        if (!best) return null;
        var bKey = BEAN_ICON_BY_COST[Number(best.costBalance || 0)];
        return bKey ? { key: bKey, path: 'subpackages/popup/asset/image/popup/shop/' + bKey + '.png' } : null;
      }
      var cat = (st.catalog || []).slice()
        .sort(function (a, b) { return Number(a.diamonds || 0) - Number(b.diamonds || 0); });
      if (!cat.length) return null;
      var bi = 0; diff = Infinity;
      for (i = 0; i < cat.length; i++) {
        var d2 = Math.abs(Number(cat[i].diamonds || 0) - _amount);
        if (d2 < diff) { diff = d2; bi = i; }
      }
      var idx = Math.min(bi, 7);   // 档位 icon 共 8 张
      var key = 'shop-diamond-icon-' + (idx + 1);
      return { key: key, path: 'subpackages/popup/asset/image/popup/shop/' + key + '.png' };
    } catch (e) { return null; }
  }

  // ── 动画参数（同结算页）──────────────────────────────────────────
  var BG_DUR        = 460;
  var CONTENT_DELAY = 260;
  var CONTENT_DUR   = 320;
  var _animStart    = 0;

  function _now () { return (typeof M3._now === 'function' && M3._now()) || Date.now(); }
  function clamp01 (v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOutCubic (t) { return 1 - Math.pow(1 - t, 3); }

  var _visible = false;
  var _heldByFx = false;   // oneshot 特效队列忙时扣住不出场，空闲后重置入场动画
  var _amount  = 0;
  var _onClose = null;
  var _type    = 'bean';   // 'bean' | 'diamond'

  function r () { return M3.Render; }
  M3.SceneBeanReward = M3.SceneBeanReward || {};

  function show (amount, onClose, type) {
    _amount  = Number(amount) || 0;
    _onClose = typeof onClose === 'function' ? onClose : null;
    _type    = (type === 'diamond') ? 'diamond' : 'bean';
    // 按到账数量匹配最接近的档位 icon（162×162 高清），只按需加载这一张；
    // 匹配不到时用该类型的第一档位 icon 作为通用兜底
    var firstKey = (_type === 'diamond')
      ? 'shop-diamond-icon-1' : 'shop-bean-icon-1';
    _tierIcon = pickTierIcon() || { key: firstKey, path: 'subpackages/popup/asset/image/popup/shop/' + firstKey + '.png' };
    if (_tierIcon && AM && !AM.loaded(_tierIcon.key)) {
      AM.acquire('image', _tierIcon.key, _tierIcon.path, GROUP);
    }
    _visible   = true;
    _animStart = _now();
    if (M3.Vibrate) M3.Vibrate.medium();
  }

  function hide () {
    if (!_visible) return;
    _visible = false;
    // 卸载 title spine（立即销毁，避免快速再弹另一类型时残留旧素材实例）
    if (M3.SpineFX && M3.SpineFX.unmount) M3.SpineFX.unmount('beanreward-board');
    var cb = _onClose; _onClose = null;
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
    if (cb) cb();
  }

  // 「去使用」：关闭弹窗，打开商城铁豆换钻石 Tab（Tab 索引 1）
  function goUse () {
    hide();
    if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(1);
  }

  function isVisible () { return !!_visible; }

  function drawImg (key, x, y, w, h) {
    if (!AM || !AM.loaded(key)) return false;
    r().glDrawImage(AM.get(key), x, y, w, h);
    return true;
  }

  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  M3.SceneBeanReward.draw = function () {
    var rd = r();
    if (!rd || !_visible) return;
    // 本弹窗自带 spine（gongxi/goumai）：oneshot 特效队列未播完时整体不出场
    // （与结算页同款闸门），队列空闲后从头播放入场动画
    if (M3.SpineFX && M3.SpineFX.isPlaying && M3.SpineFX.isPlaying()) { _heldByFx = true; return; }
    if (_heldByFx) { _heldByFx = false; _animStart = _now(); }
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;
    var isDiamond = (_type === 'diamond');
    var FX = M3.SpineFX;

    // ── 动画进度（icon/数量/按钮随 contP 淡入，弹窗主体动画在 spine 内）──
    var elapsed = _now() - _animStart;
    var bgP    = easeOutCubic(clamp01(elapsed / BG_DUR));
    var contP  = easeOutCubic(clamp01((elapsed - CONTENT_DELAY) / CONTENT_DUR));

    // ── 遮罩（随 bg 渐现）──
    rd.save(); rd.setAlpha(clamp01(bgP * 1.5));
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
    rd.restore();

    // ── 弹窗主体 = spine 动画（板/光效/标题全包含，恭喜获得 gongxi / 购买成功 goumai）──
    // 骨骼 bounds 1628×750；水平居中，显示宽按短边 0.86（先给一版，可用 inspect 调）
    var short = Math.min(W, H);
    var bdW = W;                 // 板宽拉满屏幕宽，高度按骨骼比例（1628×750）
    var bdScl = bdW / 1628;
    var bdH = Math.round(750 * bdScl);
    var btH = 34;
    var btnGap = Math.round(12 * short / 428);
    var totalH = bdH + btnGap + btH;
    var topY = Math.round((H - totalH) / 2);
    var bdCx = Math.round(W / 2);
    var bdCy = topY + Math.round(bdH / 2);

    // 遮罩热区：动画结束后注册（点弹窗外无操作）
    if (bgP >= 1) {
      pushBtn(hb, 0, 0, W, topY, 'beanreward_mask_top', null);
      pushBtn(hb, 0, topY + totalH, W, H - topY - totalH, 'beanreward_mask_bot', null);
    }

    // spine 播放一次（loop:false 播完停末帧不销毁）；hide() 卸载，下次弹出从头重播
    if (FX && FX.mount) {
      FX.mount('beanreward-board', isDiamond ? 'goumai' : 'gongxi', {
        x: bdCx, y: bdCy,
        scale: bdScl,
        loop: false,
        layer: 'scene',
      });
      if (FX.isReady('beanreward-board')) FX.drawInstance('beanreward-board');
    }

    // ── 原静态图弹窗布局（icon/数量/按钮共用；不随 spine 板高度走）──
    // s=W/812、bgH=140s；icon-center-bg（207×216）占 bgH·0.60；
    // 按钮位置 y = 原 bg 底 + gap（btW=100s、btH=34）
    var sOld = W / 812;
    var bgHOld = Math.round(140 * sOld);
    // bean/diamond 布局统一：原静态图两种 title 高度不同（309/646 vs 185/576）导致
    // icon/数量/按钮错位；spine 板同结构（同 bounds），不再区分，统一按 bean 布局
    var titleHOld = Math.round(215 * sOld * 309 / 646);
    var topYOld = Math.round((H - (Math.round(titleHOld * 0.5) + bgHOld + btnGap + btH)) / 2);
    var byOld   = topYOld + Math.round(titleHOld * 0.5);
    var btY = byOld + bgHOld + btnGap;
    var btW = Math.round(100 * sOld);

    // ── icon / 数量（板内，随 contP 淡入）──
    if (contP <= 0) return;
    rd.save(); rd.setAlpha(contP);

    // 原公式：icon-center-bg（207×216）占 bgH·0.60，icon 在其内居上、数量居中偏下
    var iconBgH = Math.round(bgHOld * 0.60);
    var iconBgW = Math.round(iconBgH * 207 / 216);
    var iconBgX = Math.round((W - iconBgW) / 2);
    var iconBgY = byOld + Math.round((bgHOld - iconBgH) / 2);
    var iconH = Math.round(iconBgH * 0.55);
    var iconW = iconH;   // 1:1
    var iconX = iconBgX + Math.round((iconBgW - iconW) / 2);
    // Inspect 标定（926×428 基准）：icon 上移 17.5
    var iconY = iconBgY + Math.round(iconBgH * 0.06) - Math.round(17.5 * H / 428);
    // 档位 icon（按到账数量匹配，兜底第一档）；首帧未就绪时 drawImg 安全跳过
    if (_tierIcon) drawImg(_tierIcon.key, iconX, iconY, iconW, iconH);

    var amtFS = Math.max(10, Math.round(iconBgH * 0.18));
    var amtCX = iconBgX + Math.round(iconBgW / 2);
    // Inspect 标定（926×428 基准）：数量上移 23
    var amtCY = iconBgY + Math.round(iconBgH * 0.76) + 7 - Math.round(23 * H / 428);
    rd.glFillText(
      String(_amount),
      amtCX, amtCY,
      '700 ' + amtFS + 'px sans-serif',
      isDiamond ? '#213372' : '#5D3303',
      'center', 'middle'
    );
    rd.restore();

    // ── 底部按钮：位置/尺寸同上原公式 ──
    if (isDiamond) {
      // 「确定」(gray) + 「去使用」(gold)，两按钮并排
      var gap2    = Math.round(12 * sOld);
      var totalBW = btW * 2 + gap2;
      var bt1X    = bdCx - Math.round(totalBW / 2);
      var bt2X    = bt1X + btW + gap2;
      M3.UIButton.draw({ x: bt1X, y: btY, w: btW, h: btH,
        label: '确定', style: 'gray', hitLabel: 'beanreward_confirm', onClick: hide });
      M3.UIButton.draw({ x: bt2X, y: btY, w: btW, h: btH,
        label: '去使用', style: 'gold', hitLabel: 'beanreward_use', onClick: goUse });
    } else {
      // 「确定」(gold)，居中单按钮
      var bt1X2 = bdCx - Math.round(btW / 2);
      M3.UIButton.draw({ x: bt1X2, y: btY, w: btW, h: btH,
        label: '确定', style: 'gold', hitLabel: 'beanreward_confirm', onClick: hide });
    }
  };

  M3.SceneBeanReward.show      = show;
  M3.SceneBeanReward.hide      = hide;
  M3.SceneBeanReward.isVisible = isVisible;
})();
