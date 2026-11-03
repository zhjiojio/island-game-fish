/**
 * scene-exchange-popup.js — 钻石兑换铁豆确认弹窗
 *
 * 调用：M3.SceneExchangePopup.show(item)
 * item 结构：{ icon, label, grantBeans, costNum, cost, skuId }
 *
 * 遮罩不响应点击，只能由右上角 ✕ 关闭。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var GROUP = 'popup:exchange';
  var RES = {
    popupBg:        ['exchange-popup-bg',          'subpackages/popup/asset/image/popup/exchange/exchange-popup-bg.png'],
    btnActive:      ['exchange-btn-active',         'subpackages/popup/asset/image/popup/exchange/exchange-btn-active.png'],
    btnDisabled:    ['exchange-btn-disabled',       'subpackages/popup/asset/image/popup/exchange/exchange-btn-disabled.png'],
    closeBtn:       ['exchange-close',              'subpackages/popup/asset/image/popup/exchange/exchange-close.png'],
    iconBg:         ['exchange-icon-bg',            'subpackages/popup/asset/image/popup/exchange/exchange-icon-bg.png'],
    qtyBg:          ['exchange-qty-bg',             'subpackages/popup/asset/image/popup/exchange/exchange-qty-bg.png'],
    symPlusActive:  ['exchange-sym-plus-active',    'subpackages/popup/asset/image/popup/exchange/exchange-sym-plus-active.png'],
    symPlusDis:     ['exchange-sym-plus-disabled',  'subpackages/popup/asset/image/popup/exchange/exchange-sym-plus-disabled.png'],
    symMinusActive: ['exchange-sym-minus-active',   'subpackages/popup/asset/image/popup/exchange/exchange-sym-minus-active.png'],
    symMinusDis:    ['exchange-sym-minus-disabled', 'subpackages/popup/asset/image/popup/exchange/exchange-sym-minus-disabled.png'],
    maxBtnActive:   ['exchange-max-btn-active',      'subpackages/popup/asset/image/popup/exchange/exchange-max-btn-active.png'],
    maxBtnDisabled: ['exchange-max-btn-disabled',    'subpackages/popup/asset/image/popup/exchange/exchange-max-btn-disabled.png'],
  };

  var _visible = false;
  var _state   = null;  // { item, qty }

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

  // ── 公开接口 ─────────────────────────────────────────────────
  function show (item) {
    _state   = { item: item, qty: 1 };
    _visible = true;
    ensureAssets();
  }

  function hide () {
    if (!_visible) return;
    _visible = false;
    _state   = null;
    var am = AM();
    if (am && am.releaseGroup) am.releaseGroup(GROUP);
  }

  function isVisible () { return !!_visible; }

  // ── 绘制 ────────────────────────────────────────────────────
  function draw () {
    var r = rd(); if (!r || !_visible || !_state) return;
    var am = AM();
    var hb = r.getHitBtns();
    var W  = M3.Layout.w, H = M3.Layout.h;
    var item = _state.item, qty = _state.qty;
    var scale = Math.min(W, H) / 375;

    // ── 遮罩：点弹窗外关闭 ──
    r.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
    pushBtn(hb, 0, 0, W, H, 'expopup_mask', hide);

    // ── 弹窗尺寸（设计稿 332:215）──
    var short = Math.min(W, H);
    var popW  = Math.round(short * 0.85);
    var popH  = Math.round(popW * 215 / 332);
    var popX  = Math.round((W - popW) / 2);
    var popY  = Math.round((H - popH) / 2);

    // ── 弹窗背景 ──
    if (am && am.loaded('exchange-popup-bg')) {
      r.glDrawImage(am.get('exchange-popup-bg'), popX, popY, popW, popH);
    } else {
      r.fillRoundedGrad(popX, popY, popW, popH, 16, '#EBF3FF', '#d6e8ff');
    }

    // ── 标题行 ──
    var titleH  = Math.round(popH * 0.2);
    var titleCY = popY + titleH / 2;
    r.glFillText('购买', popX + Math.round(14 * scale) - 2, titleCY + 3,
      '700 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif', '#213372', 'left', 'middle');

    // ── 关闭按钮 ──
    var closeSz = Math.round(22 * scale);
    var closeX  = popX + popW - closeSz - Math.round(12 * scale);
    var closeY  = titleCY - closeSz / 2;
    if (am && am.loaded('exchange-close')) {
      r.glDrawImage(am.get('exchange-close'), closeX, closeY, closeSz, closeSz);
    }
    // 先注册遮罩/body，再注册关闭按钮（input.js 遍历 expopup_ 前缀时倒序，后注册优先命中）
    pushBtn(hb, popX, popY, popW, popH, 'expopup_body', function () {});
    pushBtn(hb, closeX - 6, closeY - 6, closeSz + 12, closeSz + 12, 'expopup_close', hide);

    // ── 内容区 ──
    var bottomBtnH = Math.round(popH * 0.22);
    var contentY   = popY + titleH;
    var contentH   = popH - titleH - bottomBtnH;

    // 左：icon 卡片
    var cardPad = Math.round(10 * scale);
    var cardSz  = Math.round(contentH * 0.62);
    var cardX   = popX + cardPad;
    var cardY   = contentY + Math.round((contentH - cardSz) / 2);
    if (am && am.loaded('exchange-icon-bg')) {
      r.glDrawImage(am.get('exchange-icon-bg'), cardX, cardY, cardSz, cardSz);
    } else {
      r.fillRoundedGrad(cardX, cardY, cardSz, cardSz, Math.round(8 * scale), '#f0f4fa', '#e4ecf8');
    }
    var iconSz = Math.round(cardSz * 0.78);
    // 用 iconAmKey（真实 AM key），icon 字段是 shop RES 别名，popup 无法直接用
    var iconAmKey = item.iconAmKey || item.icon;
    drawRes(iconAmKey, cardX + Math.round((cardSz - iconSz) / 2), cardY + Math.round((cardSz - iconSz) / 2), iconSz, iconSz);

    // 右：名称 + 数量控制
    var rightX = cardX + cardSz + Math.round(12 * scale);
    var nameCY = contentY + Math.round(contentH * 0.28);
    var beanTotal = item.grantBeans * qty;
    var beanLabel = beanTotal >= 100000000
      ? Math.round(beanTotal / 100000000 * 10) / 10 + '亿铁豆'
      : beanTotal >= 10000
      ? Math.round(beanTotal / 10000) + '万铁豆'
      : beanTotal + '铁豆';
    r.glFillText(beanLabel, rightX, nameCY,
      '600 ' + Math.round(13 * scale) + 'px PingFang SC,sans-serif', '#213372', 'left', 'middle');

    // 数量控制行 [−] qty [+] [最多]
    var ctrlY  = contentY + Math.round(contentH * 0.45) + 4.5;  // Inspect dy:+4.5
    var btnSz  = Math.round(20 * scale);                   // 缩小一半（原26）
    var dw     = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : { ready: false, balance: '0' };
    var maxQty = dw.ready ? Math.max(1, Math.floor(Number(dw.balance) / item.costNum)) : 1;
    var canMinus = qty > 1;
    var canPlus  = qty < maxQty;

    // [ − ]
    var minusKey = canMinus ? 'exchange-btn-active' : 'exchange-btn-disabled';
    // 先只注册 pushBtn，不画图（底图后统一画）
    if (canMinus) pushBtn(hb, rightX, ctrlY - btnSz / 2, btnSz, btnSz, 'expopup_minus', function () {
      if (_state && _state.qty > 1) _state.qty -= 1;
    });

    // 数量
    var qtyX = rightX + btnSz + Math.round(6 * scale);
    var qtyW = Math.round(28 * scale);

    // 「最多」— 高度与加减按钮一致
    var maxBtnH = btnSz;
    var maxBtnW = Math.round(maxBtnH * 138 / 72);  // 原图 138×72 保持比例
    var plusX   = qtyX + qtyW + Math.round(6 * scale);
    var maxBtnX = plusX + btnSz + Math.round(8 * scale);
    var maxBtnY = ctrlY - maxBtnH / 2;

    // 底图：覆盖 [−] qty [+] 整个区域
    var qtyBgW = plusX + btnSz - rightX;
    var qtyBgH = btnSz;
    var qtyBgX = rightX;
    var qtyBgY = ctrlY - qtyBgH / 2;
    if (am && am.loaded('exchange-qty-bg')) {
      r.glDrawImage(am.get('exchange-qty-bg'), qtyBgX, qtyBgY, qtyBgW, qtyBgH);
    }

    // 底图之上统一绘制 [−] qty [+]
    var plusKey  = canPlus  ? 'exchange-btn-active' : 'exchange-btn-disabled';
    var symCY    = Math.round(ctrlY);

    // [ − ] 圆形背景 + 符号贴图
    if (am && am.loaded(minusKey)) r.glDrawImage(am.get(minusKey), rightX, ctrlY - btnSz / 2, btnSz, btnSz);
    var msKey = canMinus ? 'exchange-sym-minus-active' : 'exchange-sym-minus-disabled';
    if (am && am.loaded(msKey)) {
      var msW = Math.round(btnSz * 0.50);
      var msH = Math.round(msW * 6 / 31);
      r.glDrawImage(am.get(msKey), Math.round(rightX + (btnSz - msW) / 2), Math.round(symCY - msH / 2), msW, msH);
    }

    // 数量
    r.glFillText(String(qty), Math.round(qtyX + qtyW / 2), symCY,
      '700 ' + Math.round(15 * scale) + 'px PingFang SC,sans-serif', '#213372', 'center', 'middle');

    // [ + ] 圆形背景 + 符号贴图
    if (am && am.loaded(plusKey)) r.glDrawImage(am.get(plusKey), plusX, ctrlY - btnSz / 2, btnSz, btnSz);
    var psKey = canPlus ? 'exchange-sym-plus-active' : 'exchange-sym-plus-disabled';
    if (am && am.loaded(psKey)) {
      var psW = Math.round(btnSz * 0.45);
      r.glDrawImage(am.get(psKey), Math.round(plusX + (btnSz - psW) / 2), Math.round(symCY - psW / 2), psW, psW);
    }
    if (canPlus) pushBtn(hb, plusX, ctrlY - btnSz / 2, btnSz, btnSz, 'expopup_plus', function () {
      if (_state && _state.qty < maxQty) _state.qty += 1;
    });

    // 「最多」按钮：带字切图两形态（active=可点 / disabled=已满），尺寸沿用现有 maxBtnW×maxBtnH
    var isMaxed = (qty >= maxQty);
    var maxKey = isMaxed ? 'exchange-max-btn-disabled' : 'exchange-max-btn-active';
    if (am && am.loaded(maxKey)) {
      r.glDrawImage(am.get(maxKey), maxBtnX, maxBtnY, maxBtnW, maxBtnH);
      if (!isMaxed) {
        pushBtn(hb, maxBtnX, maxBtnY, maxBtnW, maxBtnH, 'expopup_max', function () {
          if (_state) _state.qty = maxQty;
        });
      }
    } else {
      // 切图未加载时回退代码按钮
      M3.UIButton.draw({ x: maxBtnX, y: maxBtnY, w: maxBtnW, h: maxBtnH,
        label: '最多', style: isMaxed ? 'gray' : 'blue', disabled: isMaxed,
        hitLabel: 'expopup_max', onClick: function () {
          if (_state) _state.qty = maxQty;
        } });
    }

    // ── 底部确认按钮（gold 底图 + 钻石图标 + 数量文字）──
    var confirmW = Math.round(popW * 0.28);
    var confirmH = Math.round(34 * scale);
    var confirmX = popX + Math.round((popW - confirmW) / 2);
    var confirmY = popY + popH - confirmH - Math.round(14 * scale);

    var totalCost = item.costNum * qty;
    var dIconH   = Math.round(confirmH * 0.52);
    var dIconW   = Math.round(dIconH * 60 / 54);
    var costStr  = String(totalCost);
    var costFnt  = '700 ' + Math.round(confirmH * 0.38) + 'px PingFang SC,sans-serif';
    var costTxtW = r.glMeasureText ? r.glMeasureText(costStr, costFnt) : costStr.length * Math.round(confirmH * 0.25);
    var innerW   = dIconW + Math.round(4 * scale) + costTxtW;
    var innerX   = confirmX + Math.round((confirmW - innerW) / 2);
    var btnMidY  = confirmY + confirmH / 2;

    // 先画 gold 底图（UIButton，textStroke=false 且 label 空，只要底图）
    if (M3.UIButton && M3.UIButton.draw) {
      M3.UIButton.draw({ x: confirmX, y: confirmY, w: confirmW, h: confirmH,
        label: '', style: 'gold', textStroke: false, hitLabel: 'expopup_confirm',
        onClick: function () {
          if (!_state) return;
          if (M3.Iap && M3.Iap.exchange) M3.Iap.exchange(_state.item.skuId, _state.qty);
          hide();
        } });
    } else {
      pushBtn(hb, confirmX, confirmY, confirmW, confirmH, 'expopup_confirm', function () {
        if (!_state) return;
        if (M3.Iap && M3.Iap.exchange) M3.Iap.exchange(_state.item.skuId, _state.qty);
        hide();
      });
    }
    // 叠加：钻石图标 + 数量文字（与按钮同款按压动效：按住时随底图一起缩放 93%）
    var _pressed = !!(M3.Input && M3.Input.getPressedLabel
      && M3.Input.getPressedLabel() === 'expopup_confirm');
    if (_pressed) {
      r.save();
      r.translate(confirmX + confirmW / 2, confirmY + confirmH / 2);
      r.scale(0.93, 0.93);
      r.translate(-(confirmX + confirmW / 2), -(confirmY + confirmH / 2));
    }
    if (am && am.loaded('diamond')) {
      // 按图片原始宽高比等比缩放（正比例，不拉伸；图片未就绪按 1:1 兜底）
      var _dImg = am.get('diamond');
      var _dRatio = (_dImg && (_dImg.naturalWidth || _dImg.width) && (_dImg.naturalHeight || _dImg.height))
        ? (_dImg.naturalWidth || _dImg.width) / (_dImg.naturalHeight || _dImg.height) : 1;
      var _dW = Math.round(dIconH * _dRatio);
      r.glDrawImage(_dImg, innerX, btnMidY - dIconH / 2, _dW, dIconH);
    }
    r.glFillText(costStr, innerX + dIconW + Math.round(4 * scale), btnMidY,
      costFnt, '#5D3303', 'left', 'middle');
    if (_pressed) r.restore();
  }

  M3.SceneExchangePopup = {
    show:      show,
    hide:      hide,
    isVisible: isVisible,
    draw:      draw,
  };
})();
