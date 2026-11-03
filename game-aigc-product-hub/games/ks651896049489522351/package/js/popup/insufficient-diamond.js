/**
 * scene-insufficient-diamond-popup.js — 钻石不足弹窗
 *
 * 调用：M3.SceneInsufficientDiamondPopup.show(opts)
 * opts 结构：
 *   {
 *     deficit:      Number,   // 还差多少钻石
 *     iapSku:       Object,   // 最接近的 IAP 商品 { skuId, priceFen, diamonds, goodsName }
 *     exchangeItem: Object,   // 目标兑换档位 { grantBeans, ... }
 *   }
 *
 * 按钮：「取消」gray 底图 + 代码文字  /  「立即充值」gold 底图 + 代码文字（UIButton.draw）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var GROUP = 'popup:insufficient-diamond';
  var RES = {
    popupBg:  ['insuffd-popup-bg',  'subpackages/popup/asset/image/popup/exchange/exchange-popup-bg.png'],
    closeBtn:  ['insuffd-close',    'subpackages/popup/asset/image/popup/exchange/exchange-close.png'],
  };

  var _visible = false;
  var _opts    = null;  // { deficit, iapSku, exchangeItem }

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

  function drawRes (key, x, y, w, h) {
    var am = AM(); if (!am || !am.loaded(key)) return;
    var r = rd(); if (!r) return;
    r.glDrawImage(am.get(key), x, y, w, h);
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

  // ── 公开接口 ──────────────────────────────────────────────────
  function show (opts) {
    _opts    = opts;
    _visible = true;
    ensureAssets();
  }

  function hide () {
    if (!_visible) return;
    _visible = false;
    _opts    = null;
    var am = AM();
    if (am && am.releaseGroup) am.releaseGroup(GROUP);
  }

  function isVisible () { return !!_visible; }

  // ── 绘制 ─────────────────────────────────────────────────────
  function draw () {
    var r = rd(); if (!r || !_visible || !_opts) return;
    var am   = AM();
    var hb   = r.getHitBtns();
    var W    = M3.Layout.w, H = M3.Layout.h;
    var scale = Math.min(W, H) / 375;
    var opts = _opts;

    // ── 遮罩：点弹窗外关闭 ──
    r.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
    pushBtn(hb, 0, 0, W, H, 'insuffd_mask', hide);

    // ── 弹窗尺寸（复用 exchange-popup-bg 332:215 比例）──
    var short = Math.min(W, H);
    var popW  = Math.round(short * 0.85);
    var popH  = Math.round(popW * 215 / 332);
    var popX  = Math.round((W - popW) / 2);
    var popY  = Math.round((H - popH) / 2);

    // ── 弹窗背景 ──
    if (am && am.loaded('insuffd-popup-bg')) {
      r.glDrawImage(am.get('insuffd-popup-bg'), popX, popY, popW, popH);
    } else {
      r.fillRoundedGrad(popX, popY, popW, popH, 16, '#EBF3FF', '#d6e8ff');
    }

    // ── 标题行 ──
    var titleH  = Math.round(popH * 0.2);
    var titleCY = popY + titleH / 2;
    var titleFz = Math.round(14 * scale);
    r.glFillText('钻石不足',
      popX + Math.round(14 * scale) - 2, titleCY + 3,
      '700 ' + titleFz + 'px PingFang SC,sans-serif', '#213372', 'left', 'middle');

    // ── 关闭按钮 ──
    var closeSz = Math.round(22 * scale);
    var closeX  = popX + popW - closeSz - Math.round(12 * scale);
    var closeY  = titleCY - closeSz / 2;
    var closePressed = beginPress('insuffd_close', closeX + closeSz / 2, closeY + closeSz / 2);
    drawRes('insuffd-close', closeX, closeY, closeSz, closeSz);
    endPress(closePressed);
    pushBtn(hb, popX, popY, popW, popH, 'insuffd_body', function () {});
    pushBtn(hb, closeX - 6, closeY - 6, closeSz + 12, closeSz + 12, 'insuffd_close', hide);

    // ── 内容区 ──
    var bottomBtnH = Math.round(popH * 0.30);  // 留给两个并排按钮
    var contentY   = popY + titleH;
    var contentH   = popH - titleH - bottomBtnH;

    // 文字：第一行 「还缺xx钻石，是否花x元充值？」
    var deficit  = opts.deficit || 0;
    var iapSku   = opts.iapSku;
    var exItem   = opts.exchangeItem;

    var yuan = iapSku ? (opts.iapSku.priceFen / 100).toFixed(0) : '?';
    // 整数价格不含小数点；若有分则保留
    if (iapSku && iapSku.priceFen % 100 !== 0) {
      yuan = (iapSku.priceFen / 100).toFixed(2);
    }

    var line1 = '还缺' + deficit + '钻石，是否花' + yuan + '元充值？';
    // 第二行 「充值成功后会自动为您购买xxx铁豆」
    var beanLabel = '';
    if (exItem) {
      beanLabel = exItem.grantBeans >= 100000000
        ? Math.round(exItem.grantBeans / 100000000 * 10) / 10 + '亿铁豆'
        : exItem.grantBeans >= 10000
        ? Math.round(exItem.grantBeans / 10000) + '万铁豆'
        : exItem.grantBeans + '铁豆';
    }
    var line2 = '充值成功后会自动为您购买' + beanLabel;

    var textFz  = Math.round(11 * scale);
    var textFont = '400 ' + textFz + 'px PingFang SC,sans-serif';
    var textColor = '#213372';
    var cx = popX + popW / 2;
    var line1Y = contentY + Math.round(contentH * 0.35);
    var line2Y = contentY + Math.round(contentH * 0.68);

    r.glFillText(line1, cx, line1Y, textFont, textColor, 'center', 'middle');
    r.glFillText(line2, cx, line2Y, textFont, '#5a6a99', 'center', 'middle');

    // ── 底部按钮区 ──
    // Figma 原始尺寸 104×36，按 scale 等比缩放
    var btnW  = Math.round(104 * scale);
    var btnH  = Math.round(36 * scale);
    var gap   = Math.round(12 * scale);
    var totalBtnW = btnW * 2 + gap;
    var btnBaseX  = popX + Math.round((popW - totalBtnW) / 2);
    var btnY      = popY + popH - btnH - Math.round(12 * scale);

    var cancelX = btnBaseX;
    var buyX    = btnBaseX + btnW + gap;

    // 「取消」gray 底图 + 文字（UIButton）
    if (M3.UIButton && M3.UIButton.draw) {
      M3.UIButton.draw({ x: cancelX, y: btnY, w: btnW, h: btnH,
        label: '取消', style: 'gray', hitLabel: 'insuffd_cancel', onClick: hide });
    } else {
      pushBtn(hb, cancelX, btnY, btnW, btnH, 'insuffd_cancel', hide);
    }

    // 「立即充值」gold 底图 + 文字（UIButton）
    var buyOnClick = function () {
      if (!_opts) return;
      var sku = _opts.iapSku;
      if (sku && M3.Iap && M3.Iap.buy) {
        if (M3.Iap._setPendingExchangeAfterBuy) {
          // 调用方可能传 shop 构造的 { skuId } 或目录原始项 { exchangeSkuId }
          var ex = _opts.exchangeItem;
          M3.Iap._setPendingExchangeAfterBuy(ex ? (ex.skuId || ex.exchangeSkuId) : null);
        }
        M3.Iap.buy(sku.skuId);
      }
      hide();
    };
    if (M3.UIButton && M3.UIButton.draw) {
      M3.UIButton.draw({ x: buyX, y: btnY, w: btnW, h: btnH,
        label: '立即充值', style: 'gold', hitLabel: 'insuffd_buy', onClick: buyOnClick });
    } else {
      pushBtn(hb, buyX, btnY, btnW, btnH, 'insuffd_buy', buyOnClick);
    }
  }

  M3.SceneInsufficientDiamondPopup = {
    show:      show,
    hide:      hide,
    isVisible: isVisible,
    draw:      draw,
  };
})();
