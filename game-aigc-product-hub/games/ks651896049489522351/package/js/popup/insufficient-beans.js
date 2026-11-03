/**
 * insufficient-beans.js — 豆子不足弹窗（进场前置引导）
 *
 * 交互流程：
 *   点击初级/中级/大师场 → 豆子不足 → 先弹本弹窗引导购买
 *   → 关闭本弹窗才退回「看广告得铁豆」（由 game.js enterRoom 串联）
 *
 * 两种形态（背景整图烘焙，代码只补 icon / 文案 / 按钮）：
 *   1. 未首充：panel-firstcharge，主推 6 元首充档（带加赠），右侧两枚 icon
 *      = 6 元档 + 最顶级档
 *   2. 已首充：panel-normal，取「能覆盖当前场次门票缺口」的最低铁豆档，
 *      右侧一枚该档 icon
 *
 * 主按钮行为：
 *   钻石够 → 直接兑换 → 到账弹窗关闭后自动匹配对应场次
 *   钻石不够 → 转钻石不足弹窗（充值 → 自动兑换 → 自动匹配）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var GROUP = 'popup:insufficient-beans';
  var RES = {
    panelFirst:  ['insuffb-panel-firstcharge', 'subpackages/popup/asset/image/popup/insufficient-beans/insuffb-panel-firstcharge.png'],
    panelNormal: ['insuffb-panel-normal',      'subpackages/popup/asset/image/popup/insufficient-beans/insuffb-panel-normal.png'],
    close:       ['btn-close',                 'asset/image/common/btn/btn-close.png'],
    beanIcon1:   ['shop-bean-icon-1',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-1.png'],
    beanIcon2:   ['shop-bean-icon-2',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-2.png'],
    beanIcon3:   ['shop-bean-icon-3',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-3.png'],
    beanIcon4:   ['shop-bean-icon-4',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-4.png'],
    beanIcon5:   ['shop-bean-icon-5',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-5.png'],
    beanIcon6:   ['shop-bean-icon-6',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-6.png'],
    beanIcon7:   ['shop-bean-icon-7',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-7.png'],
    beanIcon8:   ['shop-bean-icon-8',          'subpackages/popup/asset/image/popup/shop/shop-bean-icon-8.png'],
  };

  // 铁豆档位 icon：按 costBalance（钻石数）取，与商城铁豆 Tab 同一套映射
  var BEAN_ICON_BY_COST = {
    30: 'shop-bean-icon-1', 60: 'shop-bean-icon-2', 120: 'shop-bean-icon-3',
    300: 'shop-bean-icon-4', 680: 'shop-bean-icon-5', 980: 'shop-bean-icon-6',
    3280: 'shop-bean-icon-7', 6480: 'shop-bean-icon-8',
  };

  // 首充主推档：6 元 = 60 钻
  var FIRST_CHARGE_COST = 60;

  var _visible  = false;
  var _roomType = 'junior';
  var _target   = null;   // 目标兑换档位（exchangeCatalog item）
  var _topItem  = null;   // 未首充时右侧第二枚 icon = 最顶级档
  var _onClosed = null;   // 关闭回调（退回看广告弹窗）

  function AM () { return M3.AssetManager; }
  function rd () { return M3.Render; }

  function ensureAssets () {
    var am = AM(); if (!am) return;
    for (var k in RES) {
      if (RES.hasOwnProperty(k) && !am.loaded(RES[k][0])) {
        am.acquire('image', RES[k][0], RES[k][1], GROUP);
      }
    }
  }

  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn || null });
  }

  function drawKey (key, x, y, w, h) {
    var am = AM(); if (!am || !am.loaded(key)) return false;
    rd().glDrawImage(am.get(key), x, y, w, h);
    return true;
  }

  function beginPress (label, cx, cy, scale) {
    if (!(M3.Input && M3.Input.getPressedLabel && M3.Input.getPressedLabel() === label)) return false;
    var r = rd();
    r.save();
    r.translate(cx, cy);
    r.scale(scale || 0.92, scale || 0.92);
    r.translate(-cx, -cy);
    return true;
  }

  function endPress (pressed) {
    if (pressed) rd().restore();
  }

  function formatBeans (n) {
    n = Number(n) || 0;
    if (n >= 100000000) return Math.round(n / 100000000 * 10) / 10 + '亿';
    var w = Math.round(n / 10000);
    if (w >= 10000) return '1亿';   // 万位顶格（9999.5 万+）按 1 亿展示
    return n >= 10000 ? w + '万' : String(n);
  }

  function exchangeCatalog () {
    var st = M3.Iap && M3.Iap.getState ? M3.Iap.getState() : null;
    return (st && st.exchangeCatalog) || [];
  }

  function diamondBalance () {
    var dw = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : null;
    return (dw && dw.ready) ? Number(dw.balance) : null;   // null = 未就绪，不做客户端拦截
  }

  // 未首充档：目录里带 firstCharge 标记的那一档（服务端按账号下发，已首充自动翻 false）
  function findFirstChargeItem () {
    var list = exchangeCatalog();
    for (var i = 0; i < list.length; i++) {
      if (list[i].firstCharge && Number(list[i].bonusBeans || 0) > 0) return list[i];
    }
    return null;
  }

  // 已首充档：能补齐「当前场次门票 - 现有豆子」缺口的最低档；都不够则取最高档
  function findLowestCoveringItem (deficit) {
    var list = exchangeCatalog();
    var best = null, top = null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var beans = Number(it.grantBeans || 0);
      if (!top || beans > Number(top.grantBeans || 0)) top = it;
      if (beans >= deficit && (!best || beans < Number(best.grantBeans || 0))) best = it;
    }
    return best || top;
  }

  function findTopItem () {
    var list = exchangeCatalog();
    var top = null;
    for (var i = 0; i < list.length; i++) {
      if (!top || Number(list[i].grantBeans || 0) > Number(top.grantBeans || 0)) top = list[i];
    }
    return top;
  }

  function iconKeyOf (item) {
    if (!item) return null;
    return BEAN_ICON_BY_COST[Number(item.costBalance || 0)] || 'shop-bean-icon-1';
  }

  // ── 公开接口 ──────────────────────────────────────────────────
  // opts: { roomType, deficit, onClosed }
  // 返回 true 表示本弹窗接管（可能异步弹出），调用方不应再走看广告链路
  function show (opts) {
    opts = opts || {};
    _roomType = opts.roomType || 'junior';
    _onClosed = typeof opts.onClosed === 'function' ? opts.onClosed : null;

    if (pickTarget(opts.deficit)) { open(); return true; }

    // 兑换目录只在打开商城时才加载，从主页直接点场次时通常为空：
    // 先异步拉一次目录，回来再弹；拉取失败或仍为空才退回看广告链路。
    if (!exchangeCatalog().length && M3.Iap && M3.Iap.loadExchangeCatalog) {
      var fallback = _onClosed;
      var tries = 0;
      var poll = function () {
        if (pickTarget(opts.deficit)) { open(); return; }
        if (++tries >= 20) {   // ~3s 未就绪：放弃，退回看广告
          _onClosed = null;
          if (fallback) fallback();
          return;
        }
        setTimeout(poll, 150);
      };
      M3.Iap.loadExchangeCatalog();
      setTimeout(poll, 150);
      return true;
    }

    return false;
  }

  function pickTarget (deficit) {
    var fc = findFirstChargeItem();
    if (fc) {
      _target  = fc;
      _topItem = findTopItem();
    } else {
      _target  = findLowestCoveringItem(Number(deficit) || 0);
      _topItem = null;
    }
    return !!_target;
  }

  function open () {
    ensureAssets();
    _visible = true;
  }

  function hide () {
    if (!_visible) return;
    _visible = false;
    _target = null; _topItem = null;
    var am = AM();
    if (am && am.releaseGroup) am.releaseGroup(GROUP);
    var cb = _onClosed; _onClosed = null;
    if (cb) cb();
  }

  function isVisible () { return !!_visible; }

  // 兑换到账后自动进场：铁豆到账弹窗关闭时触发
  function matchAfterExchange (roomType) {
    if (M3.Matchmaking && M3.Matchmaking.start) M3.Matchmaking.start({ roomType: roomType });
    else if (M3.Game && M3.Game.enterRoom) M3.Game.enterRoom({ type: roomType });
  }

  // 满足缺口的最低档；都不够则取钻石最多的一档
  function pickChargeSku (deficit) {
    var catalog = (M3.Iap && M3.Iap.getState ? M3.Iap.getState().catalog : []) || [];
    var cover = null, top = null;
    for (var i = 0; i < catalog.length; i++) {
      var d = Number(catalog[i].diamonds || 0);
      if (d >= deficit && (!cover || d < Number(cover.diamonds || 0))) cover = catalog[i];
      if (!top || d > Number(top.diamonds || 0)) top = catalog[i];
    }
    return cover || top;
  }

  // 充值档位目录只在商城打开时加载过，这里可能为空：
  // 先异步拉一次再下单，避免因目录未就绪退化成「钻石余额不足」提示。
  function chargeThenExchange (deficit, exchangeSkuId) {
    var fire = function (sku) {
      if (M3.Iap._setPendingExchangeAfterBuy) M3.Iap._setPendingExchangeAfterBuy(exchangeSkuId, 1);
      M3.Iap.buy(sku.skuId);
    };
    if (!M3.Iap || !M3.Iap.buy) return;

    var sku = pickChargeSku(deficit);
    if (sku) { fire(sku); return; }

    if (!M3.Iap.loadCatalog) return;
    var tries = 0;
    var poll = function () {
      var s = pickChargeSku(deficit);
      if (s) { fire(s); return; }
      if (++tries >= 20) {   // ~3s 未就绪：放弃下单
        if (M3.Game && M3.Game.flash) M3.Game.flash('充值服务暂不可用，请稍后再试');
        return;
      }
      setTimeout(poll, 150);
    };
    M3.Iap.loadCatalog();
    setTimeout(poll, 150);
  }

  function onConfirm () {
    var item = _target;
    var roomType = _roomType;
    if (!item) { hide(); return; }

    // 关闭本弹窗但不触发 onClosed（已选择购买，不该再退回看广告）
    _onClosed = null;
    hide();

    var cost = Number(item.costBalance || 0);
    var bal  = diamondBalance();

    // 到账弹窗关闭后自动匹配：挂在 Iap 上供 finishExchange 走完 BeanReward 后回调
    if (M3.Iap && M3.Iap._setExchangeDoneHook) {
      M3.Iap._setExchangeDoneHook(function () { matchAfterExchange(roomType); });
    }

    if (bal != null && bal < cost) {
      // 钻石不够：不提示、不二次确认，直接充值能补上缺口的最低档，
      // 支付成功后自动兑换本档，到账再自动匹配
      chargeThenExchange(cost - bal, item.exchangeSkuId);
      return;
    }

    // 钻石够：直接兑换（到账 → BeanReward 关闭 → 自动匹配）
    if (M3.Iap && M3.Iap.exchange) {
      if (!M3.Iap.exchange(item.exchangeSkuId, 1) && M3.Game && M3.Game.flash) {
        M3.Game.flash('兑换处理中，请稍后再试');
      }
    }
  }

  // ── 绘制 ─────────────────────────────────────────────────────
  function draw () {
    var r = rd(); if (!r || !_visible || !_target) return;
    var hb = r.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;
    var item = _target;
    var isFirstCharge = !!(item.firstCharge && Number(item.bonusBeans || 0) > 0);

    r.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // 面板整图 1566×795，等比缩放居中
    var pw = Math.min(Math.round(W * 0.86), 560);
    var ph = Math.round(pw * 795 / 1566);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var s  = pw / 1566;

    // 遮罩热区只覆盖面板外，面板本体吃掉点击不穿透
    pushBtn(hb, 0, 0, W, py, 'insuffb_mask', hide);
    pushBtn(hb, 0, py + ph, W, H - py - ph, 'insuffb_mask', hide);
    pushBtn(hb, 0, py, px, ph, 'insuffb_mask', hide);
    pushBtn(hb, px + pw, py, W - px - pw, ph, 'insuffb_mask', hide);
    pushBtn(hb, px, py, pw, ph, 'insuffb_panel', null);

    // 关闭按钮：骑缝贴右上角，绘制在面板下层由面板压住内侧
    var cSz = Math.round(96 * s);
    var cX  = px + Math.round(1547 * s);
    var cY  = py + Math.round(123 * s);
    var cPressed = beginPress('insuffb_close', cX + cSz / 2, cY + cSz / 2);
    drawKey(RES.close[0], cX, cY, cSz, cSz);
    endPress(cPressed);
    pushBtn(hb, cX, cY, cSz, cSz, 'insuffb_close', hide);

    drawKey(isFirstCharge ? RES.panelFirst[0] : RES.panelNormal[0], px, py, pw, ph);

    // ── 右侧铁豆档位 icon + 档位说明（坐标按 1566×795 设计稿标定）──
    // 未首充：两枚并列（左=6元首充档，右=最顶级档）；已首充：一枚居中（目标档）
    var iconSz = Math.round(136 * s);
    var fzTag  = Math.max(9, Math.round(46 * s));

    // icon 下方标注豆数：首充档标到账豆数，加赠档标赠送豆数
    var fzBeans = Math.max(8, Math.round(36 * s));
    function drawIconLabel (beans, ix, iy) {
      r.glFillText(formatBeans(beans) + '铁豆', ix + iconSz / 2, iy + iconSz + Math.round(fzBeans * 0.7),
        '800 ' + fzBeans + 'px PingFang SC,sans-serif', '#213372', 'center', 'middle');
    }

    if (isFirstCharge && _topItem) {
      var ax = px + Math.round(932 * s),  ay = py + Math.round(299 * s);
      var bx2 = px + Math.round(1278 * s), by2 = py + Math.round(299 * s);
      drawKey(iconKeyOf(item),     ax,  ay,  iconSz, iconSz);
      drawKey(iconKeyOf(_topItem), bx2, by2, iconSz, iconSz);
      drawIconLabel(Number(item.grantBeans || 0), ax,  ay);
      drawIconLabel(Number(item.bonusBeans || 0), bx2, by2);
    } else {
      // 已首充：icon 与豆数横向并排，文字从 icon 右侧左对齐展开
      var sx = px + Math.round(955 * s), sy = py + Math.round(299 * s);
      drawKey(iconKeyOf(item), sx, sy, iconSz, iconSz);
      r.glFillText(formatBeans(Number(item.grantBeans || 0)) + '铁豆',
        px + Math.round(1171 * s), py + Math.round(411 * s),
        '800 ' + fzTag + 'px PingFang SC,sans-serif', '#213372', 'left', 'middle');
    }

    // ── 主按钮：面板底部居中 ──
    var btW = Math.round(430 * s);
    var btH = Math.round(120 * s);
    var btX = px + Math.round(959 * s);
    var btY = py + Math.round(587 * s);

    // 按钮上方一行说明：点击购买直接支付并自动兑换
    var tipFz = Math.max(8, Math.round(30 * s));
    r.glFillText('点击购买将直接支付并自动兑换为铁豆',
      btX + btW / 2, py + Math.round(534 * s),
      '500 ' + tipFz + 'px PingFang SC,sans-serif', 'rgba(255,255,255,0.6)', 'center', 'middle');

    // 按钮文字按钻石余额动态切换：够付本档 → 立即兑换；不够 → 立即购买
    // （与 onConfirm 的分支一致：余额未就绪时不做客户端拦截，按够处理）
    var cost  = Number(item.costBalance || 0);
    var bal   = diamondBalance();
    var label = (bal == null || bal >= cost) ? '立即兑换' : '立即购买';
    if (M3.UIButton && M3.UIButton.draw) {
      M3.UIButton.draw({ x: btX, y: btY, w: btW, h: btH,
        label: label, style: 'gold', hitLabel: 'insuffb_confirm', onClick: onConfirm });
    } else {
      pushBtn(hb, btX, btY, btW, btH, 'insuffb_confirm', onConfirm);
    }
  }

  M3.SceneInsufficientBeans = {
    show:      show,
    hide:      hide,
    isVisible: isVisible,
    draw:      draw,
  };
})();
