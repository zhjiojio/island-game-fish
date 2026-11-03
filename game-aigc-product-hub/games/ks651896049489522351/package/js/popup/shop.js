/**
 * scene-shop.js — 商城面板
 *
 * 点击首页铁豆 / 钻石 icon 后弹出，包含三个 Tab：
 *   0 - 钻石商城（title: 钻石商城）
 *   1 - 铁豆商城（钻石换铁豆，title: 铁豆商城）
 *   2 - 语音包（从 scene-profile 语音包 Tab 迁移）
 *
 * 复用 scene-profile 全套切图（profile-tab-bar 等）
 * 渲染层：直接调用 M3.Render WebGL 接口
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ── 资源（复用 profile 切图）────────────────────────────────
  var AM = M3.AssetManager;
  var GROUP = 'popup:shop';
  var RES = {
    tabBar: ['profile-tab-bar', 'subpackages/popup/asset/image/popup/profile/profile-tab-bar.png'],
    tabActive: ['profile-tab-active', 'subpackages/popup/asset/image/popup/profile/profile-tab-active.png'],
    tabLine: ['profile-tab-line', 'subpackages/popup/asset/image/popup/profile/profile-tab-line.png'],
    contentBg: ['profile-content-bg', 'subpackages/popup/asset/image/popup/profile/profile-content-bg.png'],
    topbar: ['profile-topbar', 'subpackages/popup/asset/image/popup/profile/profile-topbar.png'],
    closeBtn: ['close-btn', 'subpackages/popup/asset/image/popup/profile/close-btn.png'],
    voiceDeco: ['voice-deco', 'subpackages/popup/asset/image/popup/profile/voice-deco.png'],
    voiceBtn: ['voice-default-btn', 'subpackages/popup/asset/image/popup/profile/voice-default-btn.png'],
    voiceCardFrame: ['voice-card-frame', 'subpackages/popup/asset/image/popup/profile/voice-card-frame.png'],
    voiceCardFrameSel: ['voice-card-frame-sel', 'subpackages/popup/asset/image/popup/profile/voice-card-frame-sel.png'],
    voiceBtnPlay: ['voice-btn-play', 'subpackages/popup/asset/image/popup/profile/voice-btn-play.png'],
    voiceBtnPause: ['voice-btn-pause', 'subpackages/popup/asset/image/popup/profile/voice-btn-pause.png'],
    beanPrice: ['bean-price', 'subpackages/popup/asset/image/popup/profile/bean-price.png'],
    shopItemBg: ['shop-item-bg', 'subpackages/popup/asset/image/popup/shop/shop-item-bg.png'],
    shopDiamondIcon1: ['shop-diamond-icon-1', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-1.png'],
    shopDiamondIcon2: ['shop-diamond-icon-2', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-2.png'],
    shopDiamondIcon3: ['shop-diamond-icon-3', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-3.png'],
    shopDiamondIcon4: ['shop-diamond-icon-4', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-4.png'],
    shopDiamondIcon5: ['shop-diamond-icon-5', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-5.png'],
    shopDiamondIcon6: ['shop-diamond-icon-6', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-6.png'],
    shopDiamondIcon7: ['shop-diamond-icon-7', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-7.png'],
    shopDiamondIcon8: ['shop-diamond-icon-8', 'subpackages/popup/asset/image/popup/shop/shop-diamond-icon-8.png'],
    shopBeanIcon1: ['shop-bean-icon-1', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-1.png'],
    shopBeanIcon2: ['shop-bean-icon-2', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-2.png'],
    shopBeanIcon3: ['shop-bean-icon-3', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-3.png'],
    shopBeanIcon4: ['shop-bean-icon-4', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-4.png'],
    shopBeanIcon5: ['shop-bean-icon-5', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-5.png'],
    shopBeanIcon6: ['shop-bean-icon-6', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-6.png'],
    shopBeanIcon7: ['shop-bean-icon-7', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-7.png'],
    shopBeanIcon8: ['shop-bean-icon-8', 'subpackages/popup/asset/image/popup/shop/shop-bean-icon-8.png'],
    shopDiamondSmall: ['shop-diamond-small', 'subpackages/popup/asset/image/popup/shop/shop-diamond-small.png'],
    shopTagRibbon: ['shop-tag-ribbon', 'subpackages/popup/asset/image/popup/shop/shop-tag-ribbon.png'],
    shopTagFirstCharge: ['shop-tag-first-charge', 'subpackages/popup/asset/image/popup/shop/shop-tag-first-charge.png'],
    shopPillBg: ['shop-pill-bg', 'subpackages/popup/asset/image/popup/shop/shop-pill-bg.png'],
    bean: ['bean', 'asset/image/common/icon/bean.png'],
    diamond: ['diamond', 'asset/image/common/icon/diamond.png'],
    exPopupBg: ['exchange-popup-bg', 'subpackages/popup/asset/image/popup/exchange/exchange-popup-bg.png'],
    exBtnActive: ['exchange-btn-active', 'subpackages/popup/asset/image/popup/exchange/exchange-btn-active.png'],
    exBtnDisabled: ['exchange-btn-disabled', 'subpackages/popup/asset/image/popup/exchange/exchange-btn-disabled.png'],
    exClose: ['exchange-close', 'subpackages/popup/asset/image/popup/exchange/exchange-close.png'],
    exIconBg: ['exchange-icon-bg', 'subpackages/popup/asset/image/popup/exchange/exchange-icon-bg.png'],
  };
  function ensureAssets () {
    if (!AM) return;
    for (var k in RES) {
      if (RES.hasOwnProperty(k) && !AM.loaded(RES[k][0])) {
        AM.acquire('image', RES[k][0], RES[k][1], GROUP);
      }
    }
  }
  function releaseAssets () {
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
  }
  function drawRes (key, x, y, w, h) {
    var rd = r();
    if (!AM || !AM.loaded(RES[key][0])) return false;
    rd.glDrawImage(AM.get(RES[key][0]), x, y, w, h);
    return true;
  }

  // ── 常量（与 scene-profile 面板一致）────────────────────────
  var PANEL_W_BASE = 552;
  var PANEL_H_BASE = 289;
  var TAB_W = 90;

  var COL_TITLE_TEXT = '#213372';
  var COL_TAB_ACTIVE_TEXT = '#5D3303';
  var COL_TAB_NORMAL_TEXT = '#F8F8FB';
  var COL_STAT_TEXT = 'rgba(33,51,114,0.698)';

  // ── 状态 ─────────────────────────────────────────────────────
  var _visible = false;
  var _tab = 0;   // 0:钻石商城  1:铁豆商城  2:语音包
  var _panel = null;
  var _drag = null;
  var _scroll = 0;
  var _diamondScroll = 0;
  var _diamondMaxScroll = 0;
  var _maxScroll = 0;
  var _listenPackId = '';
  var _previewPackId = '';

  function stopPreview () {
    if (_listenPackId && typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.stopVoice) {
      KwaiMedia.Audio.stopVoice();
    }
    _listenPackId = '';
    _previewPackId = '';
  }

  function r () { return M3.Render; }
  function clamp (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  // 图片缓存（复用 profile 逻辑）
  var _imgCache = {};
  function getNetImg (url) {
    if (!url) return null;
    var img = _imgCache[url];
    if (!img) {
      try {
        if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
        else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
        else {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.onerror = function () { img.onerror = null; img.crossOrigin = null; img.src = url; };
        }
      } catch (e) {
        try { img = new Image(); } catch (e2) { return null; }
      }
      img.src = url; _imgCache[url] = img;
    }
    return img;
  }
  function imgLoaded (img) {
    if (!img) return false;
    return (img.complete === undefined || img.complete) && (img.naturalWidth || img.width || 0) > 0;
  }
  var _avatarClip = {};
  function _clipAvatarCanvas (url, img, D) {
    if (!img || !(img.width > 0) || D < 4) return null;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
    var srcW = img.naturalWidth || img.width || 0;
    var D2 = Math.round(D * dpr);
    if (srcW > 0 && D2 > srcW) D2 = srcW;
    if (D2 < D) D2 = D;
    var ckey = url + '|' + D2;
    var clip = _avatarClip[ckey];
    if (!clip) {
      var cvs;
      if (typeof ks !== 'undefined' && ks.createCanvas) cvs = ks.createCanvas();
      else if (typeof wx !== 'undefined' && wx.createCanvas) cvs = wx.createCanvas();
      else cvs = document.createElement('canvas');
      cvs.width = D2; cvs.height = D2;
      clip = { cvs: cvs, ctx: cvs.getContext('2d'), drawnW: 0 };
      _avatarClip[ckey] = clip;
    }
    if (clip.drawnW !== img.width) {
      var c = clip.ctx;
      c.clearRect(0, 0, D2, D2);
      c.save();
      c.beginPath();
      c.arc(D2 / 2, D2 / 2, D2 / 2, 0, Math.PI * 2);
      c.closePath();
      c.clip();
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var scale = Math.max(D2 / iw, D2 / ih);
      var dw = iw * scale, dh = ih * scale;
      c.drawImage(img, (D2 - dw) / 2, (D2 - dh) / 2, dw, dh);
      c.restore();
      clip.drawnW = img.width;
    }
    return clip.cvs;
  }

  // ── 面板参数 ──────────────────────────────────────────────────
  var _cachedPanel = null, _cachedPanelW = 0, _cachedPanelH = 0;
  function calcPanel (W, H) {
    if (_cachedPanel && _cachedPanelW === W && _cachedPanelH === H) return _cachedPanel;
    _cachedPanelW = W; _cachedPanelH = H;
    var scale = Math.min(1, (W * 0.9) / PANEL_W_BASE, (H * 0.85) / PANEL_H_BASE);
    var pw = Math.round(PANEL_W_BASE * scale);
    var ph = Math.round(PANEL_H_BASE * scale);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var tabW = Math.round(TAB_W * scale);
    _cachedPanel = { px: px, py: py, pw: pw, ph: ph, scale: scale, tabW: tabW };
    return _cachedPanel;
  }

  // ── 绘制 Tab 按钮 ─────────────────────────────────────────────
  function drawTabs (rd, hb, p) {
    var tabW = p.tabW, ph = p.ph, px = p.px, py = p.py, scale = p.scale;
    var tabH = Math.round(43 * scale);
    var tabGap = Math.round(4 * scale);
    var tabsStartY = py + Math.round(24 * scale);

    var TABS = ['钻石', '铁豆', '语音包'];

    drawRes('tabBar', px + Math.round(2 * scale), py, Math.round(88 * scale), ph);

    for (var i = 0; i < TABS.length; i++) {
      var ty = tabsStartY + i * (tabH + tabGap);
      var isActive = (_tab === i);
      var _tp = M3.Render.beginPressScale('shop_tab_' + i, px + tabW / 2, ty + tabH / 2, 0.95);
      if (isActive) {
        drawRes('tabActive', px - Math.round(2 * scale), ty, Math.round(94 * scale), Math.round(44 * scale));
        rd.glFillText(TABS[i], px + tabW / 2, ty + tabH / 2,
          '800 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TAB_ACTIVE_TEXT, 'center', 'middle');
      } else {
        // 未选中：透明背景 + 底部分隔线切图（Group 76，90×43 画布与 Tab 区域重合）。
        // 紧邻选中 Tab 上方的那条分隔线会被选中按钮"盖住"（行间 4px 间隙让它
        // 悬浮在选中按钮上方很难看），这里直接不画，等效被覆盖。
        if (_tab !== i + 1) drawRes('tabLine', px, ty, tabW, tabH);
        rd.glFillText(TABS[i], px + tabW / 2, ty + tabH / 2,
          '800 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TAB_NORMAL_TEXT, 'center', 'middle');
      }
      M3.Render.endPressScale(_tp);
      ; (function (idx) {
        pushBtn(hb, px, ty, tabW, tabH, 'shop_tab_' + idx, function () {
          _tab = idx;
          _scroll = 0;
        });
      })(i);
    }
  }

  // ── 右侧内容区头部 ─────────────────────────────────────────────
  function drawContentHeader (rd, hb, p) {
    var px = p.px, py = p.py, pw = p.pw, ph = p.ph, scale = p.scale;
    var tabW = p.tabW;
    var contentX = px + tabW;
    var contentW = pw - tabW;

    drawRes('contentBg', contentX, py, contentW, ph);

    var titleBarW = Math.round(343 * scale);
    var titleBarH = Math.round(49 * scale);
    drawRes('topbar', contentX, py, titleBarW, titleBarH);

    var TITLE_TEXTS = ['钻石商城', '铁豆商城', '选择你喜欢的主播的语音包'];
    var titleText = TITLE_TEXTS[_tab];
    rd.glFillText(titleText,
      contentX + Math.round(12 * scale),
      py + Math.round(13 * scale) + Math.round(16 * scale * 0.6),
      '800 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif',
      COL_TITLE_TEXT, 'left', 'middle');

    // 关闭按钮坐标（必须先算，标题栏右侧布局依赖 closeX）
    var closeSz = Math.round(36 * scale);
    var closeX = px + pw - closeSz - Math.round(10 * scale);
    var closeY = py + Math.round(10 * scale);

    // ── 标题栏：title 右侧紧跟铁豆 + 钻石胶囊（与主页完全一致，去掉 + 号）──
    var barCY = py + titleBarH / 2;
    var _W = M3.Layout ? M3.Layout.w : 375, _H = M3.Layout ? M3.Layout.h : 667;
    var short = Math.min(_W, _H);
    var bFont = 16;   // 与主页胶囊字号一致（写死）
    var beanSz2 = 21;   // 与主页铁豆 icon 一致（写死）
    var pillH2 = 29;   // 与主页胶囊高度一致（写死）
    var leftPad2 = 7, iconTextGap2 = 6, rightPad3 = 10, pillGap2 = 8;
    // title 文字右侧作为胶囊起点
    var titleMeasW = rd.glMeasureText ? rd.glMeasureText(titleText, '800 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif') : Math.round(16 * scale) * titleText.length;
    var capsStartX = contentX + Math.round(12 * scale) + titleMeasW + Math.round(10 * scale);

    // 铁豆胶囊
    var beanText2 = M3.SceneHome && M3.SceneHome.getWalletText ? M3.SceneHome.getWalletText() : '--';
    if (AM && AM.loaded('bean') && AM.loaded('shop-pill-bg')) {
      var bFontStr = '500 ' + bFont + 'px sans-serif';
      var bTxtW2 = rd.glMeasureText ? rd.glMeasureText(beanText2, bFontStr) : bFont * beanText2.length * 0.6;
      var bPillW2 = Math.max(67, leftPad2 + beanSz2 + iconTextGap2 + bTxtW2 + rightPad3);
      rd.glDrawImage9(AM.get('shop-pill-bg'), capsStartX, barCY - pillH2 / 2, bPillW2, pillH2, 12, 12, 67, 25);
      rd.glDrawImage(AM.get('bean'), capsStartX + leftPad2, barCY - beanSz2 / 2, beanSz2, beanSz2);
      var bTextAreaLeft = capsStartX + leftPad2 + beanSz2 + iconTextGap2;
      var bTextAreaW = bPillW2 - leftPad2 - beanSz2 - iconTextGap2 - rightPad3;
      rd.glFillText(beanText2, bTextAreaLeft + bTextAreaW / 2, barCY, bFontStr, '#213372', 'center', 'middle');
      capsStartX += bPillW2 + pillGap2;
    }

    // 钻石胶囊
    var dw2 = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : { ready: false };
    var diamondText2 = dw2.ready ? M3.DiamondWallet.format(dw2.balance) : (dw2.syncing ? '同步中...' : '--');
    if (AM && AM.loaded('diamond') && AM.loaded('shop-pill-bg')) {
      var dIconSz2 = 26;  // 与主页顶栏胶囊钻石 icon 一致（主页用户定标 26）
      // 按图片原始宽高比等比缩放（正比例，不拉伸）
      var dImg2 = AM.get('diamond');
      var dRatio2 = (dImg2 && (dImg2.naturalWidth || dImg2.width) && (dImg2.naturalHeight || dImg2.height))
        ? (dImg2.naturalWidth || dImg2.width) / (dImg2.naturalHeight || dImg2.height) : 1;
      var dIconW2 = Math.round(dIconSz2 * dRatio2);
      var dFontStr2 = '500 ' + bFont + 'px sans-serif';
      var dTxtW2 = rd.glMeasureText ? rd.glMeasureText(diamondText2, dFontStr2) : bFont * diamondText2.length * 0.6;
      var dPillW2 = Math.max(67, leftPad2 + dIconW2 + iconTextGap2 + dTxtW2 + rightPad3);
      rd.glDrawImage9(AM.get('shop-pill-bg'), capsStartX, barCY - pillH2 / 2, dPillW2, pillH2, 12, 12, 67, 25);
      rd.glDrawImage(AM.get('diamond'), capsStartX + leftPad2, barCY - dIconSz2 / 2, dIconW2, dIconSz2);
      var dTextAreaLeft = capsStartX + leftPad2 + dIconW2 + iconTextGap2;
      var dTextAreaW = dPillW2 - leftPad2 - dIconW2 - iconTextGap2 - rightPad3;
      rd.glFillText(diamondText2, dTextAreaLeft + dTextAreaW / 2, barCY, dFontStr2, '#213372', 'center', 'middle');
    }
    var _cp = M3.Render.beginPressScale('shop_close', closeX + closeSz / 2, closeY + closeSz / 2);
    drawRes('closeBtn', closeX, closeY, closeSz, closeSz);
    M3.Render.endPressScale(_cp);
    pushBtn(hb, closeX, closeY, closeSz, closeSz, 'shop_close', function () {
      _visible = false;
      stopPreview();
    });

    return { contentX: contentX, contentW: contentW, titleBarH: titleBarH };
  }

  // ── Tab 0：钻石商城 ───────────────────────────────────────────
  // icon 按 skuId 固定映射（diamond_1 与 diamond_30 共用 icon1，超出范围循环）
  var DIAMOND_ICON_MAP = {
    diamond_1: 'shopDiamondIcon1',
    diamond_30: 'shopDiamondIcon1',
    diamond_60: 'shopDiamondIcon2',
    diamond_120: 'shopDiamondIcon3',
    diamond_300: 'shopDiamondIcon4',
    diamond_680: 'shopDiamondIcon5',
    diamond_980: 'shopDiamondIcon6',
    diamond_1980: 'shopDiamondIcon7',
    diamond_3280: 'shopDiamondIcon8',
    diamond_6480: 'shopDiamondIcon8',
  };
  var DIAMOND_ICONS = [
    'shopDiamondIcon1', 'shopDiamondIcon2', 'shopDiamondIcon3', 'shopDiamondIcon4',
    'shopDiamondIcon5', 'shopDiamondIcon6', 'shopDiamondIcon7', 'shopDiamondIcon8',
  ];

  // 从服务端 catalog 动态生成商品列表；catalog 不变时复用缓存，避免每帧重建
  var _cachedCatalogRef = null;
  var _cachedDiamondItems = [];
  function getDiamondItems () {
    var catalog = M3.Iap && M3.Iap.getState ? M3.Iap.getState().catalog : [];
    if (catalog === _cachedCatalogRef) return _cachedDiamondItems;
    _cachedCatalogRef = catalog;
    _cachedDiamondItems = catalog.map(function (item, i) {
      // 价格显示「xx 元」：整数元不带小数点，非整数保留一位
      var fen = Number(item.priceFen || 0);
      var yuan = fen % 100 === 0 ? String(fen / 100) : (fen / 100).toFixed(1);
      return {
        icon: DIAMOND_ICON_MAP[item.skuId] || DIAMOND_ICONS[i % DIAMOND_ICONS.length],
        label: item.goodsName || (item.diamonds + '钻石'),
        price: yuan + '元',
        sku: item.skuId,
        buy_quantity: Number(item.diamonds || 0),
      };
    });
    return _cachedDiamondItems;
  }

  function drawTabDiamond (rd, hb, p, header) {
    var px = p.px, py = p.py, ph = p.ph, scale = p.scale;
    var contentX = header.contentX, contentW = header.contentW;
    var titleBarH = header.titleBarH;

    // 内容区
    var areaX = contentX + Math.round(8 * scale);
    var areaY = py + titleBarH + Math.round(8 * scale);
    var areaW = contentW - Math.round(16 * scale);
    var areaH = ph - titleBarH - Math.round(16 * scale);

    // 4列布局，卡片宽度自适应内容区
    var COLS = 4;
    var cardGapX = Math.round(6 * scale);
    var cardGapY = Math.round(6 * scale);
    var cardW = Math.round((areaW - cardGapX * (COLS - 1)) / COLS);
    // 原图比例 297:402，等比得到高度
    var cardH = Math.round(cardW * 402 / 297);

    var DIAMOND_ITEMS = getDiamondItems();
    var iapState = M3.Iap && M3.Iap.getState ? M3.Iap.getState() : { flow: 'IDLE' };

    // catalog 加载中且还没数据时显示提示
    if (!DIAMOND_ITEMS.length) {
      if (rd.clearScissor) rd.clearScissor();
      var tipText = (iapState.flow === 'CATALOG_LOADING') ? '正在加载商品…' : '暂无可购买商品';
      rd.glFillText(tipText, areaX + areaW / 2, areaY + areaH / 2,
        '500 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif', '#b0a090', 'center', 'middle');
      return;
    }

    var rows = Math.ceil(DIAMOND_ITEMS.length / COLS);
    var totalH = rows * cardH + (rows - 1) * cardGapY;
    var _dMaxScroll = Math.max(0, totalH - areaH);
    _diamondMaxScroll = _dMaxScroll;
    if (_diamondScroll === undefined) _diamondScroll = 0;
    _diamondScroll = clamp(_diamondScroll, 0, _diamondMaxScroll);

    if (rd.setScissor) rd.setScissor(areaX, areaY, areaW, areaH);

    for (var i = 0; i < DIAMOND_ITEMS.length; i++) {
      var item = DIAMOND_ITEMS[i];
      var col = i % COLS;
      var row = Math.floor(i / COLS);
      var cx = areaX + col * (cardW + cardGapX);
      var cy = areaY + row * (cardH + cardGapY) - _diamondScroll;

      if (cy + cardH < areaY || cy > areaY + areaH) continue;

      // 背景
      drawRes('shopItemBg', cx, cy, cardW, cardH);

      // 图标：保持原图比例，宽度系数与单卡版本一致
      var iconW = Math.round(cardW * 0.72);
      var iconH = Math.round(iconW * 228 / 234);
      var iconX = cx + (cardW - iconW) / 2;
      var iconY = cy + Math.round(8 * scale);
      drawRes(item.icon, iconX, iconY, iconW, iconH);

      // 钻石数量文字
      var labelY = iconY + iconH + Math.round(4 * scale) - 5;
      rd.glFillText(item.label,
        cx + cardW / 2, labelY,
        '800 ' + Math.round(11 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'top');

      // 按钮：高度与单卡版本一致
      var btnW = Math.round(cardW * 0.82);
      var btnH = Math.round(28 * scale);
      var btnX = cx + (cardW - btnW) / 2;
      var btnY = cy + cardH - btnH - Math.round(8 * scale);
      var _vs = M3.AssetManager && M3.AssetManager.get('btnGold'); if (_vs) r().glDrawImage(_vs, btnX, btnY, btnW, btnH);
      rd.glFillText(item.price,
        btnX + btnW / 2, btnY + btnH / 2,
        '700 ' + Math.round(13 * scale) + 'px PingFang SC,sans-serif',
        '#5D3303', 'center', 'middle');

      ; (function (it, bx, by, bw, bh, idx) {
        var visY = Math.max(by, areaY);
        var visH = Math.min(by + bh, areaY + areaH) - visY;
        if (visH <= 2) return;
        pushBtn(hb, bx, visY, bw, visH, 'shop_diamond_buy_' + idx, function () {
          if (!M3.Iap || !M3.Iap.buy) {
            if (M3.Game && M3.Game.flash) M3.Game.flash('支付模块未加载，请稍后重试');
            return;
          }
          var bought = M3.Iap.buy(it.sku);
          if (!bought) {
            var s = M3.Iap.getState && M3.Iap.getState();
            if (s && s.active) {
              if (M3.Game && M3.Game.flash) M3.Game.flash('有订单正在处理中，请稍后');
            } else if (s && s.flow === 'CATALOG_LOADING') {
              if (M3.Game && M3.Game.flash) M3.Game.flash('商品目录加载中，请稍后重试');
            } else if (s && s.flow === 'TOO_MANY_PENDING') {
              if (M3.Game && M3.Game.flash) M3.Game.flash('支付取消次数过多，请约15分钟后再试');
            } else if (s && s.flow === 'SERVICE_ERROR') {
              if (M3.Game && M3.Game.flash) M3.Game.flash('支付服务暂不可用，请稍后重试');
            } else {
              if (M3.Game && M3.Game.flash) M3.Game.flash('充值功能即将上线，敬请期待');
            }
          }
        });
      })(item, btnX, btnY, btnW, btnH, i);
    }

    if (rd.clearScissor) rd.clearScissor();
  }

  // ── Tab 1：铁豆商城（动态读取 exchangeCatalog，icon 按 costBalance 映射）──
  var BEAN_ICON_MAP = {
    30: 'shopBeanIcon1',
    60: 'shopBeanIcon2',
    120: 'shopBeanIcon3',
    300: 'shopBeanIcon4',
    680: 'shopBeanIcon5',
    980: 'shopBeanIcon6',
    3280: 'shopBeanIcon7',
    6480: 'shopBeanIcon8',
  };
  var BEAN_ICONS = ['shopBeanIcon1', 'shopBeanIcon2', 'shopBeanIcon3', 'shopBeanIcon4',
    'shopBeanIcon5', 'shopBeanIcon6', 'shopBeanIcon7', 'shopBeanIcon8'];

  var _cachedExCatalogLen = -1;
  var _cachedExCatalogKey = '';
  var _cachedBeanItems = [];
  function getBeanItems () {
    var catalog = M3.Iap && M3.Iap.getState ? M3.Iap.getState().exchangeCatalog : [];
    var len = catalog ? catalog.length : 0;
    var key = len > 0 ? (catalog[0].exchangeSkuId + len + catalog.map(function (it) {
      return (it.productTag || '') + (it.firstCharge ? '1' : '0');
    }).join('')) : '';
    if (len === _cachedExCatalogLen && key === _cachedExCatalogKey) return _cachedBeanItems;
    _cachedExCatalogLen = len;
    _cachedExCatalogKey = key;
    _cachedBeanItems = (catalog || []).map(function (item, i) {
      var cost = Number(item.costBalance || 0);
      var iconAlias = BEAN_ICON_MAP[cost] || BEAN_ICONS[i % BEAN_ICONS.length];
      return {
        icon: iconAlias,
        iconAmKey: RES[iconAlias] ? RES[iconAlias][0] : iconAlias,
        label: item.grantBeans >= 100000000
          ? Math.round(item.grantBeans / 100000000 * 10) / 10 + '亿铁豆'
          : item.grantBeans >= 10000
          ? Math.round(item.grantBeans / 10000) + '万铁豆'
          : item.grantBeans + '铁豆',
        cost: String(cost),
        costNum: cost,
        skuId: item.exchangeSkuId,
        grantBeans: Number(item.grantBeans || 0),
        productTag: item.productTag || 'normal',
        firstCharge: !!item.firstCharge,
        bonusBeans: Number(item.bonusBeans || 0),
      };
    });
    return _cachedBeanItems;
  }

  function openExchangePopup (item) {
    if (M3.SceneExchangePopup) M3.SceneExchangePopup.show(item);
  }

  // 商品类型角标：productTag 走左上角斜带，首充资格叠加顶部横幅，两者可同时出现
  var TAG_RIBBON_TEXT = { recommend: '推荐', hot: '热门' };

  function formatBonusBeans (n) {
    if (n >= 100000000) return Math.round(n / 100000000 * 10) / 10 + '亿';
    var w = Math.round(n / 10000);
    if (w >= 10000) return '1亿';   // 万位顶格（9999.5 万+）按 1 亿展示
    return n >= 10000 ? w + '万' : String(n);
  }

  function drawTagRibbon (rd, item, cx, cy, cardW, scale) {
    var tagText = TAG_RIBBON_TEXT[item.productTag];
    if (!tagText) return;

    // 斜带按原图 105×114 比例贴在卡片左上角：缩小到 0.34（原 0.42），
    // 锚点仍在卡片左上角 (cx,cy)，缩小后整体往角内收 = 向左上移动对应距离
    var rw = Math.round(cardW * 0.34);
    var rh = Math.round(rw * 114 / 105);
    if (!drawRes('shopTagRibbon', cx, cy, rw, rh)) return;
    // 文字沿斜带走向（左下—右上对角线）排布
    rd.save();
    rd.translate(cx + rw * 0.37, cy + rh * 0.37);
    rd.rotate(-Math.atan2(rh, rw));
    rd.glFillText(tagText, 0, 0,
      '700 ' + Math.round(10 * scale) + 'px PingFang SC,sans-serif',
      '#FFFFFF', 'center', 'middle');
    rd.restore();
  }

  function drawFirstChargeBanner (rd, item, cx, cy, cardW, scale) {
    if (!item.firstCharge || item.bonusBeans <= 0) return;
    // 横幅按原图 156×60 比例贴在卡片右上角，文字沿横幅微微上扬
    var bw = Math.round(cardW * 0.552);
    var bh = Math.round(bw * 60 / 156);
    var bx = cx + Math.round(cardW * 0.393);
    var by = cy + Math.round(bh * 0.26);
    if (!drawRes('shopTagFirstCharge', bx, by, bw, bh)) return;
    rd.save();
    // 文字水平排布，不倾斜，横幅内居中；Inspect 定标 dy:-2.5（上移 2.5）
    rd.translate(bx + bw / 2, by + bh / 2 - 2.5);
    rd.glFillText('首充送' + formatBonusBeans(item.bonusBeans), 0, 0,
      '700 ' + Math.round(bh * 0.35) + 'px PingFang SC,sans-serif',
      '#FFFFFF', 'center', 'middle');
    rd.restore();
  }

  function drawItemTag (rd, item, cx, cy, cardW, scale) {
    // 两者共存时横幅横跨卡片顶部、会压住斜带上半，所以斜带后画保持在上层
    drawFirstChargeBanner(rd, item, cx, cy, cardW, scale);
    drawTagRibbon(rd, item, cx, cy, cardW, scale);
  }

  // 铁豆 tab 滚动状态
  var _beanScroll = 0;
  var _beanMaxScroll = 0;
  var _cachedVoicePacksRef = null;
  var _cachedVoicePacks = [];

  function drawTabBean (rd, hb, p, header) {
    var py = p.py, ph = p.ph, scale = p.scale;
    var contentX = header.contentX, contentW = header.contentW;
    var titleBarH = header.titleBarH;

    var areaX = contentX + Math.round(8 * scale);
    var areaY = py + titleBarH + Math.round(8 * scale);
    var areaW = contentW - Math.round(16 * scale);
    var areaH = ph - titleBarH - Math.round(16 * scale);

    var beanItems = getBeanItems();

    var COLS = 4;
    var cardGapX = Math.round(6 * scale);
    var cardGapY = Math.round(6 * scale);
    var cardW = Math.round((areaW - cardGapX * (COLS - 1)) / COLS);
    var cardH = Math.round(cardW * 402 / 297);

    var rows = Math.ceil((beanItems.length || 8) / COLS);
    var totalH = rows * cardH + (rows - 1) * cardGapY;
    _beanMaxScroll = Math.max(0, totalH - areaH);
    _beanScroll = clamp(_beanScroll, 0, _beanMaxScroll);

    if (rd.setScissor) rd.setScissor(areaX, areaY, areaW, areaH);

    if (!beanItems.length) {
      rd.glFillText('正在加载兑换商品...', contentX + contentW / 2, areaY + areaH / 2,
        '500 ' + Math.round(13 * scale) + 'px sans-serif', '#213372', 'center', 'middle');
    }

    // 钻石余额（用于判断能否兑换）
    var dw = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : { ready: false, balance: '0' };
    var diamondBalance = dw.ready ? Number(dw.balance) : 0;

    for (var i = 0; i < beanItems.length; i++) {
      var item = beanItems[i];
      var col = i % COLS;
      var row = Math.floor(i / COLS);
      var cx = areaX + col * (cardW + cardGapX);
      var cy = areaY + row * (cardH + cardGapY) - _beanScroll;

      if (cy + cardH < areaY || cy > areaY + areaH) continue;

      drawRes('shopItemBg', cx, cy, cardW, cardH);

      // 图标
      var iconW = Math.round(cardW * 0.72);
      var iconH = iconW;
      var iconX = cx + (cardW - iconW) / 2;
      var iconY = cy + Math.round(8 * scale);
      drawRes(item.icon, iconX, iconY, iconW, iconH);

      // 角标压在图标之上
      drawItemTag(rd, item, cx, cy, cardW, scale);

      // 铁豆数量文字
      var labelY = iconY + Math.round(iconW * 228 / 234) + Math.round(4 * scale) - 5;
      rd.glFillText(item.label,
        cx + cardW / 2, labelY,
        '800 ' + Math.round(11 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'top');

      // 兑换按钮（余额未就绪时不变灰，明确不足才灰）
      var canAfford = !dw.ready || diamondBalance >= item.costNum;
      var btnW = Math.round(cardW * 0.82);
      var btnH = Math.round(28 * scale);
      var btnX = cx + (cardW - btnW) / 2;
      var btnY = cy + cardH - btnH - Math.round(8 * scale);
      var _vs = M3.AssetManager && M3.AssetManager.get('btnGold'); if (_vs) r().glDrawImage(_vs, btnX, btnY, btnW, btnH);  // 铁豆 Tab：直接整图绘制，不走 9 宫格

      // 按钮内：钻石图标（按图片原始宽高比等比缩放）+ 数量文字
      var dSz = Math.round(16 * scale);  // 与主页钻石 icon 放大比对齐（13→16，≈26/21）
      var dImg3 = AM.loaded('diamond') ? AM.get('diamond') : null;
      var dRatio3 = (dImg3 && (dImg3.naturalWidth || dImg3.width) && (dImg3.naturalHeight || dImg3.height))
        ? (dImg3.naturalWidth || dImg3.width) / (dImg3.naturalHeight || dImg3.height) : 1;
      var dIconW3 = Math.round(dSz * dRatio3);
      var costFont = '700 ' + Math.round(11 * scale) + 'px PingFang SC,sans-serif';
      var costW = rd.glMeasureText ? rd.glMeasureText(item.cost, costFont) : Math.round(item.cost.length * 7 * scale);
      var totalBtnW = dIconW3 + Math.round(2 * scale) + costW;
      var btnCX = btnX + btnW / 2;
      var btnCY = btnY + btnH / 2;
      var dStartX = btnCX - totalBtnW / 2;
      if (AM && AM.loaded('diamond')) {
        rd.glDrawImage(AM.get('diamond'), dStartX, btnCY - dSz / 2, dIconW3, dSz);
      }
      rd.glFillText(item.cost, dStartX + dIconW3 + Math.round(2 * scale), btnCY,
        costFont, '#5D3303', 'left', 'middle');

      ; (function (it, bx, by, bw, bh, idx, afford) {
        var visY = Math.max(by, areaY);
        var visH = Math.min(by + bh, areaY + areaH) - visY;
        if (visH <= 2) return;
        pushBtn(hb, bx, visY, bw, visH, 'shop_bean_buy_' + idx, function () {
          // 再次检查最新余额（点击时重判）
          var dw2 = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : { ready: false };
          var bal = dw2.ready ? Number(dw2.balance) : Infinity;
          if (dw2.ready && bal < it.costNum) {
            // 计算差额，找最接近的 IAP 充值档
            var deficit = it.costNum - bal;
            var catalog = M3.Iap && M3.Iap.getState ? M3.Iap.getState().catalog : [];
            var bestSku = null;
            var bestDiff = Infinity;
            for (var si = 0; si < catalog.length; si++) {
              var skuItem = catalog[si];
              var d = Math.abs(Number(skuItem.diamonds || 0) - deficit);
              if (d < bestDiff) { bestDiff = d; bestSku = skuItem; }
            }
            if (M3.SceneInsufficientDiamondPopup) {
              M3.SceneInsufficientDiamondPopup.show({
                deficit: deficit,
                iapSku: bestSku,
                exchangeItem: it,
              });
            } else if (M3.Game && M3.Game.flash) {
              M3.Game.flash('钻石余额不足');
            }
            return;
          }
          openExchangePopup(it);
        });
      })(item, btnX, btnY, btnW, btnH, i, canAfford);
    }

    if (rd.clearScissor) rd.clearScissor();
  }

  // ── Tab 2：语音包（从 scene-profile 迁移）─────────────────────
  function drawTabVoice (rd, hb, p, header) {
    var px = p.px, py = p.py, ph = p.ph, pw = p.pw, scale = p.scale;
    var contentX = header.contentX, contentW = header.contentW;

    var voiceAvail = M3.SceneVoice && M3.SceneVoice.isAvailable && M3.SceneVoice.isAvailable();

    var selectedPackId = '';
    if (M3.SceneVoice && M3.SceneVoice._getSelectedPackId) {
      selectedPackId = M3.SceneVoice._getSelectedPackId();
    }

    var _rawPacks = (voiceAvail && M3.SceneVoice._getPacks) ? (M3.SceneVoice._getPacks() || []) : [];
    if (_rawPacks !== _cachedVoicePacksRef) { _cachedVoicePacksRef = _rawPacks; _cachedVoicePacks = _rawPacks; }
    var packs = _cachedVoicePacks;

    var curPack = null;
    var previewPack = null;
    for (var fi = 0; fi < packs.length; fi++) {
      if (packs[fi].packId === (selectedPackId || 'default')) curPack = packs[fi];
      if (packs[fi].packId === _previewPackId) previewPack = packs[fi];
    }
    if (!previewPack) previewPack = curPack;
    var previewId = previewPack ? previewPack.packId : '';

    // ── 右侧详情区 ──
    if (previewPack) {
      var ownedP = M3.SceneVoice._isOwned ? M3.SceneVoice._isOwned(previewPack.sku) : false;
      var activeP = (previewPack.packId === selectedPackId) ||
        (selectedPackId === '' && previewPack.packId === 'default');

      var defX = px + Math.round(368 * scale);
      var defY = py + Math.round(54 * scale);
      var bigD = Math.round(109 * scale);
      var bigImg = previewPack.icon ? getNetImg(previewPack.icon) : null;
      var bigDrawn = false;
      if (imgLoaded(bigImg)) {
        var bigClip = _clipAvatarCanvas(previewPack.icon, bigImg, bigD);
        if (bigClip) { rd.glDrawImage(bigClip, defX, defY, bigD, bigD); bigDrawn = true; }
      }
      if (!bigDrawn) drawRes('voiceDeco', defX, defY, bigD, bigD);

      var listenSz = Math.round(32 * scale);
      var lsX = defX + bigD - listenSz / 2 - 16.5;
      var lsY = defY + bigD - listenSz / 2 - 14.5;
      var isListening = (_listenPackId === previewPack.packId);
      ; (function (pk, lx, ly, ls) {
        var _lp = M3.Render.beginPressScale('shop_voice_listen', lx + ls / 2, ly + ls / 2);
        var drawn = drawRes(isListening ? 'voiceBtnPause' : 'voiceBtnPlay', lx, ly, ls, ls);
        M3.Render.endPressScale(_lp);
        if (drawn) {
          pushBtn(hb, lx, ly, ls, ls, 'shop_voice_listen', function () {
            if (_listenPackId === pk.packId) {
              if (typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.stopVoice) {
                KwaiMedia.Audio.stopVoice();
              }
              _listenPackId = '';
              return;
            }
            var previewUrl = '';
            var pv = pk.voices || [];
            for (var vi = 0; vi < pv.length; vi++) {
              if (pv[vi].voiceId === pk.voiceId) { previewUrl = pv[vi].voiceUrl || ''; break; }
            }
            if (!previewUrl && pv.length) previewUrl = pv[0].voiceUrl || '';
            _listenPackId = pk.packId;
            if (previewUrl && typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.playVoice) {
              var _pvRet = KwaiMedia.Audio.playVoice(previewUrl, {
                onEnded: function () { if (_listenPackId === pk.packId) _listenPackId = ''; },
                onError: function (err) {
                  if (_listenPackId === pk.packId) _listenPackId = '';
                  var msg = (err && (err.errMsg || err.message)) || '未知错误';
                  console.warn('[SceneShop] 试听失败:', msg, previewUrl);
                  M3.Game.flash('试听失败：' + msg);
                },
              });
              if (_pvRet === false) {
                _listenPackId = '';
                M3.Game.flash('游戏音效已关闭，请在「设置」中开启');
              }
            }
          });
        }
      })(previewPack, lsX, lsY, listenSz);

      var defTextX = px + Math.round(423 * scale);
      rd.glFillText(previewPack.text || '语音包', defTextX, py + Math.round(183 * scale),
        '600 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');
      var statusText = activeP ? '使用中'
        : (ownedP ? '已解锁'
          : (Number(previewPack.priceBeans || 0) > 0 ? (previewPack.priceBeans + ' 铁豆解锁') : '免费'));
      rd.glFillText(statusText, defTextX, py + Math.round(205 * scale),
        '300 ' + Math.round(12 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');

      var btnW = Math.round(104 * scale), btnH = Math.round(36 * scale);
      var btnX = px + Math.round(371 * scale);
      var btnY = py + Math.round(223 * scale);
      var _ap = M3.Render.beginPressScale('shop_voice_action', btnX + btnW / 2, btnY + btnH / 2);
      if (activeP) {
        drawRes('voiceBtn', btnX, btnY, btnW, btnH);
      } else {
        var _vs = M3.AssetManager && M3.AssetManager.get('btnGold'); if (_vs) r().glDrawImage(_vs, btnX, btnY, btnW, Math.round(38 * scale));
      }
      var btnLabel = activeP ? '使用中' : (ownedP ? '使用' : '立即兑换');
      var btnFS = '800 ' + Math.round(14 * scale) + 'px sans-serif';
      var btnTC = activeP ? '#929292' : '#5D3303';
      rd.glFillText(btnLabel, btnX + btnW / 2, btnY + btnH / 2,
        btnFS, btnTC, 'center', 'middle');
      M3.Render.endPressScale(_ap);
      if (!activeP) {
        ; (function (pk, owned2) {
          pushBtn(hb, btnX, btnY, btnW, btnH, 'shop_voice_action', function () {
            if (owned2) {
              if (M3.SceneVoice && M3.SceneVoice.selectPack) M3.SceneVoice.selectPack(pk);
            } else {
              if (M3.SceneVoice && M3.SceneVoice._buyPack) M3.SceneVoice._buyPack(pk);
              else if (M3.Game.flash) M3.Game.flash('购买功能加载中，请稍后再试');
            }
          });
        })(previewPack, ownedP);
      }
    }

    // ── 左侧语音包卡片列表 ──
    var listX = px + Math.round(102 * scale);
    var listY = py + Math.round(60 * scale);
    var listW = Math.round(206 * scale);
    var listH = ph - Math.round(60 * scale) - Math.round(10 * scale);

    var cardW2 = Math.round(99 * scale);
    var cardH2 = Math.round(136 * scale);
    var cardGap2 = Math.round(6 * scale);

    var rows = Math.ceil(packs.length / 2) || 1;
    var totalH = rows * (cardH2 + cardGap2) - cardGap2;
    _maxScroll = Math.max(0, totalH - listH);
    _scroll = clamp(_scroll, 0, _maxScroll);

    var offsetY = -_scroll;

    if (rd.setScissor) rd.setScissor(
      listX - Math.round(6 * scale), listY - Math.round(6 * scale),
      listW + Math.round(12 * scale), listH + Math.round(12 * scale));

    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i];
      var col = i % 2;
      var row = Math.floor(i / 2);
      var cx2 = listX + col * (cardW2 + cardGap2);
      var cy2 = listY + offsetY + row * (cardH2 + cardGap2);

      if (cy2 + cardH2 < listY || cy2 > listY + listH) continue;

      var isSelected = (pack.packId === previewId);
      if (isSelected) {
        drawRes('voiceCardFrameSel', cx2 - Math.round(6 * scale), cy2 - Math.round(6 * scale),
          Math.round(111 * scale), Math.round(148 * scale));
      } else {
        drawRes('voiceCardFrame', cx2, cy2, cardW2, cardH2);
      }

      var iconUrl = pack.icon || '';
      var iconSz = Math.round(54 * scale);
      var iconCx = cx2 + cardW2 / 2;
      var iconCy = cy2 + Math.round(17 * scale) + iconSz / 2;
      if (iconUrl) {
        var packImg = getNetImg(iconUrl);
        if (imgLoaded(packImg)) {
          var clipC = _clipAvatarCanvas(iconUrl, packImg, iconSz);
          if (clipC) rd.glDrawImage(clipC, iconCx - iconSz / 2, iconCy - iconSz / 2, iconSz, iconSz);
        }
      } else {
        rd.beginPath(); rd.arc(iconCx, iconCy, iconSz / 2, 0, Math.PI * 2);
        rd.fill('#7CB1FA');
        rd.glFillText('🎤', iconCx, iconCy,
          '700 ' + Math.round(20 * scale) + 'px sans-serif', '#fff', 'center', 'middle');
      }

      var nameBgY2 = cy2 + Math.round(82 * scale);
      rd.glFillText(pack.text || '语音包', cx2 + cardW2 / 2, nameBgY2 + Math.round(11 * scale),
        '600 ' + Math.round(12 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');

      var priceY = cy2 + Math.round(107 * scale) + Math.round(8 * scale) + Math.round(5 * scale);
      var priceText = String(pack.priceLabel != null ? pack.priceLabel : '0');
      var priceFont = '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif';
      var priceTxtW = rd.glMeasureText ? rd.glMeasureText(priceText, priceFont) : Math.round(30 * scale);
      var beanSz = Math.round(13 * scale);
      var priceTotalW = beanSz + Math.round(3 * scale) + priceTxtW;
      var priceStartX = cx2 + Math.round(15 * scale) + (Math.round(68 * scale) - priceTotalW) / 2;
      drawRes('beanPrice', priceStartX, priceY - beanSz / 2, beanSz, beanSz);
      rd.glFillText(priceText, priceStartX + beanSz + Math.round(3 * scale), priceY,
        priceFont, '#213372', 'left', 'middle');

      ; (function (pk, by, bh) {
        if (bh <= 2) return;
        pushBtn(hb, cx2, by, cardW2, bh, 'shop_voice_card_' + pk.packId, function () {
          if (_previewPackId !== pk.packId) {
            stopPreview();
            _previewPackId = pk.packId;
          }
        });
      })(pack, Math.max(cy2, listY),
        Math.min(cy2 + cardH2, listY + listH) - Math.max(cy2, listY));
    }
    if (rd.clearScissor) rd.clearScissor();

    if (!voiceAvail || packs.length === 0) {
      rd.glFillText('语音包加载中...', listX + listW / 2, listY + listH / 2,
        '400 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
        '#8A9AB5', 'center', 'middle');
    }
  }

  // ── 主绘制入口 ────────────────────────────────────────────────
  function draw () {
    if (!_visible) return;
    var rd = r();
    if (!rd) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    rd.save(); rd.setAlpha(0.5);
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,1)');
    rd.restore();

    var p = calcPanel(W, H);
    _panel = { x: p.px, y: p.py, w: p.pw, h: p.ph };

    drawTabs(rd, hb, p);
    var header = drawContentHeader(rd, hb, p);

    if (_tab === 0) drawTabDiamond(rd, hb, p, header);
    else if (_tab === 1) drawTabBean(rd, hb, p, header);
    else if (_tab === 2) drawTabVoice(rd, hb, p, header);

  }

  // ── 触摸事件 ──────────────────────────────────────────────────
  function onTouchStart (x, y) {
    if (!_visible) return false;
    if (_panel) {
      if (x < _panel.x || x > _panel.x + _panel.w ||
        y < _panel.y || y > _panel.y + _panel.h) {
        _visible = false;
        stopPreview();
        return true;
      }
    }
    if ((_tab === 0 || _tab === 1) && _panel) {
      var p0 = calcPanel(M3.Layout.w, M3.Layout.h);
      var areaX0 = _panel.x + p0.tabW + Math.round(8 * p0.scale);
      var areaY0 = _panel.y + Math.round(49 * p0.scale) + Math.round(8 * p0.scale);
      var areaW0 = _panel.w - p0.tabW - Math.round(16 * p0.scale);
      var areaH0 = _panel.h - Math.round(49 * p0.scale) - Math.round(16 * p0.scale);
      if (x >= areaX0 && x <= areaX0 + areaW0 && y >= areaY0 && y <= areaY0 + areaH0) {
        var curScroll = _tab === 0 ? _diamondScroll : _beanScroll;
        _drag = { y: y, scroll: curScroll, tab: _tab, moved: 0 };
        return true;
      }
    }
    if (_tab === 2) {
      var p = calcPanel(M3.Layout.w, M3.Layout.h);
      // 注意：语音包列表以面板左缘 px 起算（drawTabVoice 的 listX = px + 102*scale），
      // 不像钻石/铁豆 Tab 那样加 tabW —— 之前多加了 tabW 导致滑动区右偏 90px
      var listX = _panel.x + Math.round(102 * p.scale);
      var listY = _panel.y + Math.round(60 * p.scale);
      var listW = Math.round(206 * p.scale);
      var listH = _panel.h - Math.round(60 * p.scale) - Math.round(10 * p.scale);
      if (x >= listX && x <= listX + listW && y >= listY && y <= listY + listH) {
        _drag = { y: y, scroll: _scroll, tab: _tab, moved: 0 };
        return true;
      }
    }
    _drag = null;
    return false;
  }

  function onTouchMove (x, y) {
    if (!_visible || !_drag) return 0;
    var dy = _drag.y - y;
    _drag.moved = Math.max(_drag.moved, Math.abs(dy));
    if (_drag.tab === 0) {
      _diamondScroll = clamp(_drag.scroll + dy, 0, _diamondMaxScroll);
    } else if (_drag.tab === 1) {
      _beanScroll = clamp(_drag.scroll + dy, 0, _beanMaxScroll);
    } else {
      _scroll = clamp(_drag.scroll + dy, 0, _maxScroll);
    }
    return Math.abs(dy) > 4 ? 1 : 0;
  }

  function onTouchEnd () {
    _drag = null;
  }

  // ── 公开接口 ──────────────────────────────────────────────────
  M3.SceneShop = {
    show: function (tab) {
      ensureAssets();
      _visible = true;
      if (tab === 0 || tab === 1 || tab === 2) _tab = tab;
      _scroll = 0;
      _diamondScroll = 0;
      _beanScroll = 0;
      // 打开商城时同步钻石余额并加载商品目录（仅快手平台，canUsePayment 内部自动判断）
      if (M3.Iap && M3.Iap.syncWallet) M3.Iap.syncWallet();
      if (M3.Iap && M3.Iap.loadCatalog) M3.Iap.loadCatalog();
      if (M3.Iap && M3.Iap.loadExchangeCatalog) M3.Iap.loadExchangeCatalog();
    },
    hide: function () { _visible = false; _drag = null; stopPreview(); releaseAssets(); },
    isVisible: function () { return _visible; },
    draw: draw,
    onTouchStart: onTouchStart,
    onTouchMove: onTouchMove,
    onTouchEnd: onTouchEnd,
  };
})();
