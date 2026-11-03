/**
 * render.js — 换装匹配渲染层
 *
 * 画面层次（各阶段）：
 *   HOME    : 暖色背景 + Logo + "开始游戏"按钮
 *   SELECT  : 关卡网格（2 列）+ 分页 + 底部栏 + 解锁弹窗
 *   PLAYING : 全屏场景 + 人物立绘 + 衣服浮层 + HUD + 4 选项卡 + 3 工具按钮
 *   RESULT  : 通关/超时结算弹窗
 *
 * 热区登记：
 *   M3.Render.zones = [] 每帧重置，由 input.js 读取做点击判定。
 *   每个 zone: { id, x, y, w, h }
 *
 * 不做：
 *   - 不处理点击输入
 *   - 不修改 M3.Board 状态
 *   - 不调用广告 API
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Render = M3.Render || {};

  // ── 热区注册表（每帧重置） ────────────────────────────────────────────────
  M3.Render.zones = [];
  M3.Render.showUnlockDialog = false;
  M3.Render.selectPage = 0;

  function addZone(id, x, y, w, h) {
    M3.Render.zones.push({ id: id, x: x, y: y, w: w, h: h });
  }

  // ── canvas / ctx ──────────────────────────────────────────────────────────
  var _canvas, _ctx;

  M3.Render.init = function () {
    _canvas = window.canvas;
    _ctx    = _canvas.getContext('2d');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 通用绘图工具
  // ─────────────────────────────────────────────────────────────────────────

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /** 绘制带高光的圆角胶囊按钮 */
  function drawBtn(ctx, x, y, w, h, r, fillColor, strokeColor, label, fontSize, textColor) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.shadowColor   = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur    = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
    // 顶部高光条
    ctx.beginPath();
    ctx.rect(x + r, y + 2, w - r * 2, h * 0.28);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    // 文字
    ctx.fillStyle    = textColor || '#fff';
    ctx.font         = 'bold ' + (fontSize || 16) + 'px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
  }

  /** 渐变色背景 */
  function drawBg(ctx, x, y, w, h, c1, c2) {
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c1 || '#f5ecd0');
    grad.addColorStop(1, c2 || '#ead8a0');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  // ── PNG UI 组件缓存（兼容 H5 / 快手小游戏 Image 实现）──────────────────────
  var UI_BASE = 'assets/ui/';
  var _imgCache = {};

  var START_CROP = {
    'add_to_desktop.png': [0, 16, 1226, 1088],
    'background-base.png': [0, 0, 862, 1825],
    'daily_checkin.png': [16, 16, 1088, 1108],
    'game_logo.png': [0, 25, 2078, 629],
    'pattern-question.png': [16, 16, 1130, 1140],
    'redeem_code.png': [0, 16, 1114, 1193],
    'settings.png': [0, 16, 1066, 1243],
    'start_button.png': [25, 25, 1993, 735],
    'tagline.png': [21, 26, 2133, 342],
  };

  var HALL_CROP = {
    'back_button.png': [0, 15, 1206, 1210],
    'background-base.png': [0, 0, 862, 1825],
    'badge_hot.png': [15, 7, 1083, 1152],
    'badge_new.png': [0, 15, 1196, 1187],
    'bottom_add_to_desktop.png': [0, 16, 1294, 1173],
    'bottom_daily_checkin.png': [18, 18, 1337, 936],
    'bottom_unlock_all.png': [15, 15, 1129, 1256],
    'card_template_blank.png': [0, 0, 1134, 1387],
    'cover_slot_beige.png': [0, 17, 1378, 1045],
    'cover_slot_blue.png': [0, 3, 1208, 1267],
    'cover_slot_lavender.png': [15, 15, 1137, 1167],
    'cover_slot_mint.png': [15, 15, 1048, 1047],
    'cover_slot_peach.png': [17, 17, 1180, 890],
    'cover_slot_purple.png': [0, 0, 1152, 1254],
    'customer_service.png': [18, 18, 841, 1370],
    'label_danger_check.png': [24, 24, 1542, 411],
    'label_date_battle.png': [26, 17, 2045, 691],
    'label_profession.png': [0, 0, 1628, 606],
    'label_scene_error.png': [0, 10, 1988, 736],
    'label_time_error.png': [0, 0, 1773, 817],
    'label_wrong_outfit.png': [24, 23, 1954, 692],
    'lock.png': [16, 16, 1119, 1218],
    'pager_counter.png': [20, 20, 1579, 766],
    'pager_first.png': [18, 18, 1121, 927],
    'pager_last.png': [18, 18, 1343, 853],
    'pager_next.png': [0, 15, 1234, 1214],
    'pager_previous.png': [0, 15, 1208, 1182],
    'pattern-magnifier.png': [15, 15, 1078, 1007],
    'pattern-picture-card.png': [16, 16, 1005, 996],
    'pin.png': [15, 15, 1165, 1137],
    'progress_bar.png': [25, 25, 1901, 689],
    'section_logo.png': [19, 19, 1570, 878],
    'section_tagline.png': [26, 26, 2109, 489],
  };

  var LEVEL_CROP = {
    'background_base.png': [0, 0, 829, 1898],
    'bottom_add5.png': [13, 13, 1060, 983],
    'bottom_add_time.png': [0, 0, 1133, 1254],
    'bottom_hint.png': [13, 13, 1068, 903],
    'error_status.png': [13, 13, 1065, 297],
    'home.png': [0, 0, 1254, 1254],
    'level_title.png': [24, 13, 1988, 586],
    'main_content_frame.png': [0, 0, 1161, 1355],
    'mini_program_capsule.png': [0, 0, 1693, 929],
    'nav_left.png': [12, 12, 688, 890],
    'nav_right.png': [12, 12, 637, 838],
    'pattern_tile.png': [13, 13, 1079, 970],
    'progress_4of8.png': [17, 17, 1404, 888],
    'settings.png': [12, 12, 918, 983],
    'thumbnail_frame.png': [0, 15, 1200, 1215],
    'timer_103.png': [0, 0, 1288, 1024],
  };

  function loadUIImage(path) {
    if (_imgCache[path]) return _imgCache[path];
    var img = new Image();
    var rec = { img: img, loaded: false, error: false };
    img.onload = function () { rec.loaded = true; };
    img.onerror = function () { rec.error = true; };
    img.src = path;
    _imgCache[path] = rec;
    return rec;
  }

  function drawUIAsset(ctx, folder, name, x, y, w, h, cropMap) {
    var rec = loadUIImage(UI_BASE + folder + '/' + name);
    if (!rec.loaded || rec.error) return false;
    var img = rec.img;
    var crop = cropMap && cropMap[name];
    if (crop) {
      ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], x, y, w, h);
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
    return true;
  }

  function drawUIAssetCover(ctx, folder, name, x, y, w, h, cropMap) {
    var rec = loadUIImage(UI_BASE + folder + '/' + name);
    if (!rec.loaded || rec.error) return false;
    var img = rec.img;
    var crop = cropMap && cropMap[name];
    var sx = crop ? crop[0] : 0;
    var sy = crop ? crop[1] : 0;
    var sw = crop ? crop[2] : img.width;
    var sh = crop ? crop[3] : img.height;
    var srcRatio = sw / sh;
    var dstRatio = w / h;
    if (srcRatio > dstRatio) {
      var newW = sh * dstRatio;
      sx += (sw - newW) / 2;
      sw = newW;
    } else {
      var newH = sw / dstRatio;
      sy += (sh - newH) / 2;
      sh = newH;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HOME 阶段
  // ─────────────────────────────────────────────────────────────────────────

  function drawHome(ctx, L) {
    // 图1：紫色纹样背景 + 左侧功能入口 + 中央 Logo/标语 + 绿色开始按钮
    if (!drawUIAssetCover(ctx, 'start', 'background-base.png', 0, 0, L.w, L.h, START_CROP)) {
      drawBg(ctx, 0, 0, L.w, L.h, '#8b5cf6', '#5b2aa8');
    }

    // 问号纹样：作为半透明装饰层，避免背景图未完全加载时显得空。
    ctx.save();
    ctx.globalAlpha = 0.35;
    var patSize = Math.min(L.w * 0.48, 210);
    drawUIAsset(ctx, 'start', 'pattern-question.png', L.w - patSize * 0.92, L.safeTop + 24, patSize, patSize, START_CROP);
    drawUIAsset(ctx, 'start', 'pattern-question.png', -patSize * 0.38, L.safeTop + L.usableH * 0.50, patSize * 0.92, patSize * 0.92, START_CROP);
    ctx.restore();

    var usableTop = L.safeTop;
    var usableH = L.usableH;

    // 左侧竖排入口：设置 / 每日签到 / 兑换码
    var sideW = Math.max(58, Math.min(74, L.w * 0.18));
    var sideH = sideW * 1.12;
    var sideX = Math.max(8, L.w * 0.035);
    var sideY = usableTop + usableH * 0.18;
    var sideGap = Math.max(8, sideH * 0.10);
    drawUIAsset(ctx, 'start', 'settings.png', sideX, sideY, sideW, sideH, START_CROP);
    drawUIAsset(ctx, 'start', 'daily_checkin.png', sideX, sideY + sideH + sideGap, sideW, sideH, START_CROP);
    drawUIAsset(ctx, 'start', 'redeem_code.png', sideX, sideY + (sideH + sideGap) * 2, sideW, sideH, START_CROP);
    addZone('home_settings', sideX, sideY, sideW, sideH);
    addZone('home_daily', sideX, sideY + sideH + sideGap, sideW, sideH);
    addZone('home_redeem', sideX, sideY + (sideH + sideGap) * 2, sideW, sideH);

    // 主 Logo 和标语
    var logoW = Math.min(L.w * 0.78, 360);
    var logoH = logoW * 629 / 2078;
    var logoX = (L.w - logoW) / 2;
    var logoY = usableTop + usableH * 0.34;
    if (!drawUIAsset(ctx, 'start', 'game_logo.png', logoX, logoY, logoW, logoH, START_CROP)) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#4f1b7a';
      ctx.lineWidth = 6;
      ctx.font = 'bold 42px sans-serif';
      ctx.strokeText('美女来找茬', L.w / 2, logoY + logoH / 2);
      ctx.fillStyle = '#fff066';
      ctx.fillText('美女来找茬', L.w / 2, logoY + logoH / 2);
      ctx.restore();
    }

    var tagW = Math.min(L.w * 0.58, 280);
    var tagH = tagW * 342 / 2133;
    drawUIAsset(ctx, 'start', 'tagline.png', (L.w - tagW) / 2, logoY + logoH + 12, tagW, tagH, START_CROP);

    // 开始游戏按钮
    var btnW = Math.min(L.w * 0.64, 300);
    var btnH = btnW * 735 / 1993;
    var btnX = (L.w - btnW) / 2;
    var btnY = usableTop + usableH * 0.62;
    if (!drawUIAsset(ctx, 'start', 'start_button.png', btnX, btnY, btnW, btnH, START_CROP)) {
      drawBtn(ctx, btnX, btnY, btnW, btnH, btnH / 2, '#66c834', '#238a28', '开始游戏', 20, '#fff');
    }
    addZone('home_start', btnX + btnW * 0.08, btnY + btnH * 0.12, btnW * 0.84, btnH * 0.76);

    // 右下角添加桌面
    var addW = Math.max(76, Math.min(104, L.w * 0.25));
    var addH = addW * 1088 / 1226;
    var addX = L.w - addW - Math.max(10, L.w * 0.035);
    var addY = L.h - (L.bottomPadding || 0) - addH - 14;
    drawUIAsset(ctx, 'start', 'add_to_desktop.png', addX, addY, addW, addH, START_CROP);
    addZone('home_add', addX, addY, addW, addH);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELECT 阶段
  // ─────────────────────────────────────────────────────────────────────────

  var COLS          = 2;
  var ROWS_PER_PAGE = 3;
  var CARDS_PER_PAGE = COLS * ROWS_PER_PAGE;

  function drawSelect(ctx, L) {
    // 参考图重排：大标题、紧凑 2x3 纸卡、底部分页与功能按钮。
    if (!drawUIAssetCover(ctx, 'hall', 'background-base.png', 0, 0, L.w, L.h, HALL_CROP)) {
      drawBg(ctx, 0, 0, L.w, L.h, '#8782ef', '#6f61d8');
    }

    var page  = M3.Render.selectPage || 0;
    var total = M3.Scene ? M3.Scene.levelCount : 1;
    // UI 按设计稿展示 18 个主题位，实际可玩数量仍由 M3.Scene.levelCount 控制。
    var displayTotal = 18;
    var totalPages = Math.max(1, Math.ceil(displayTotal / CARDS_PER_PAGE));
    if (page >= totalPages) {
      page = totalPages - 1;
      M3.Render.selectPage = page;
    }

    var bottomPad = L.bottomPadding || 0;
    var scale = L.w / 720;

    // 左上返回 + 客服，紧贴参考图。
    var backS = Math.max(46, Math.min(64, L.w * 0.14));
    var backX = Math.max(16, L.w * 0.035);
    var backY = L.safeTop + Math.max(18, L.h * 0.028);
    drawUIAsset(ctx, 'hall', 'back_button.png', backX, backY, backS, backS, HALL_CROP);
    addZone('select_back', backX, backY, backS, backS);

    var serviceW = backS * 0.82;
    var serviceH = serviceW * 1.15;
    var serviceX = backX + backS + Math.max(10, L.w * 0.018);
    var serviceY = backY + backS * 0.02;
    drawUIAsset(ctx, 'hall', 'customer_service.png', serviceX, serviceY, serviceW, serviceH, HALL_CROP);
    addZone('select_customer', serviceX, serviceY, serviceW, serviceH);

    // 大标题与胶囊副标题：整体比上一版放大并上移。
    var logoW = Math.min(L.w * 0.55, 330 * scale);
    if (logoW < L.w * 0.48) logoW = L.w * 0.48;
    var logoH = logoW * 878 / 1570;
    var logoX = (L.w - logoW) / 2;
    var logoY = L.safeTop + Math.max(36, L.h * 0.075);
    if (!drawUIAsset(ctx, 'hall', 'section_logo.png', logoX, logoY, logoW, logoH, HALL_CROP)) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff066';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.font = 'bold ' + Math.floor(L.w * 0.09) + 'px sans-serif';
      ctx.strokeText('主题关卡', L.w / 2, logoY + logoH / 2);
      ctx.fillText('主题关卡', L.w / 2, logoY + logoH / 2);
      ctx.restore();
    }

    var tagW = Math.min(L.w * 0.58, 360 * scale);
    var tagH = tagW * 489 / 2109;
    var tagX = (L.w - tagW) / 2;
    var tagY = logoY + logoH - tagH * 0.16;
    drawUIAsset(ctx, 'hall', 'section_tagline.png', tagX, tagY, tagW, tagH, HALL_CROP);

    // 轻装饰，不抢卡片视觉。
    ctx.save();
    ctx.globalAlpha = 0.20;
    var deco = Math.min(84, L.w * 0.19);
    drawUIAsset(ctx, 'hall', 'pattern-magnifier.png', L.w - deco * 0.70, L.safeTop + 90, deco, deco * 0.94, HALL_CROP);
    drawUIAsset(ctx, 'hall', 'pattern-picture-card.png', -deco * 0.32, L.h * 0.63, deco, deco, HALL_CROP);
    ctx.restore();

    // 参考图卡片区域：占满中段，2列3行，每张更高、更像纸张。
    var sidePad = L.w * 0.085;
    var colGap = L.w * 0.075;
    var cardW = (L.w - sidePad * 2 - colGap) / 2;
    var gridTop = tagY + tagH + Math.max(20, L.h * 0.020);
    var bottomButtonsH = Math.max(76, L.h * 0.095);
    var pageH = Math.max(40, L.h * 0.052);
    var gridBottom = L.h - bottomPad - bottomButtonsH - pageH - Math.max(12, L.h * 0.018);
    var rowGap = Math.max(12, L.h * 0.016);
    var cardH = (gridBottom - gridTop - rowGap * 2) / 3;
    var idealH = cardW * 1.35;
    if (cardH > idealH) {
      gridTop += (cardH - idealH) * 0.20;
      cardH = idealH;
    }
    if (cardH < cardW * 1.20) cardH = cardW * 1.20;

    for (var i = 0; i < CARDS_PER_PAGE; i++) {
      var levelIdx = page * CARDS_PER_PAGE + i;
      var col = i % COLS;
      var row = Math.floor(i / COLS);
      var cx  = sidePad + col * (cardW + colGap);
      var cy  = gridTop + row * (cardH + rowGap);
      drawLevelCard(ctx, cx, cy, cardW, cardH, levelIdx, total);
      if (levelIdx < total) {
        addZone('select_level_' + levelIdx, cx, cy, cardW, cardH);
      }
    }

    // 分页固定在卡片与底部按钮之间，显示 1/18（参考图）。
    var pageBarY = gridTop + 3 * cardH + 2 * rowGap + Math.max(4, L.h * 0.006);
    drawPageBar(ctx, L, page, totalPages, pageBarY, displayTotal);

    drawSelectBottomBar(ctx, L);
    if (M3.Render.showUnlockDialog) drawUnlockDialog(ctx, L);
  }

  var HALL_CARD_STYLE = [
    { cover: 'cover_slot_blue.png',     label: 'label_profession.png',   badge: 'badge_hot.png', fallback: '职业换装' },
    { cover: 'cover_slot_lavender.png', label: 'label_wrong_outfit.png', badge: 'badge_hot.png', fallback: '谁穿错了' },
    { cover: 'cover_slot_mint.png',     label: 'label_scene_error.png',  badge: 'badge_new.png', fallback: '场景穿帮' },
    { cover: 'cover_slot_purple.png',   label: 'label_date_battle.png',  badge: 'badge_hot.png', fallback: '约会大作战' },
    { cover: 'cover_slot_peach.png',    label: 'label_danger_check.png', badge: 'badge_hot.png', fallback: '危险排查' },
    { cover: 'cover_slot_beige.png',    label: 'label_time_error.png',   badge: 'badge_new.png', fallback: '时空错乱' },
  ];

  function drawLevelCard(ctx, x, y, w, h, levelIdx, totalLevels) {
    var maxUnlocked = M3.Board ? M3.Board.maxUnlocked : 0;
    var locked = levelIdx > maxUnlocked || levelIdx >= totalLevels;
    var hasLevel = levelIdx < totalLevels;
    var style = HALL_CARD_STYLE[levelIdx % HALL_CARD_STYLE.length];

    // 参考图有轻微旋转的纸张底页，这里用白色背纸模拟层次。
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((levelIdx % 2 === 0 ? -1 : 1) * Math.PI / 180 * 2.2);
    ctx.translate(-w / 2, -h / 2);
    roundRect(ctx, 0, 0, w, h, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(34,20,90,0.20)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.restore();

    // 主纸卡。
    if (!drawUIAsset(ctx, 'hall', 'card_template_blank.png', x, y, w, h, HALL_CROP)) {
      ctx.save();
      ctx.shadowColor = 'rgba(34,20,90,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 5;
      roundRect(ctx, x, y, w, h, 5);
      ctx.fillStyle = '#fffdf8';
      ctx.fill();
      ctx.restore();
    }

    // 红色图钉。
    var pinS = w * 0.18;
    drawUIAsset(ctx, 'hall', 'pin.png', x + w * 0.42, y - pinS * 0.22, pinS, pinS, HALL_CROP);

    // 封面图片区：接近参考图的上半部分大方框。
    var coverX = x + w * 0.10;
    var coverY = y + h * 0.13;
    var coverW = w * 0.80;
    var coverH = h * 0.50;
    if (!drawUIAsset(ctx, 'hall', style.cover, coverX, coverY, coverW, coverH, HALL_CROP)) {
      ctx.save();
      roundRect(ctx, coverX, coverY, coverW, coverH, 8);
      ctx.fillStyle = ['#e8f5ff', '#efeaff', '#e9fbf3', '#f3edff', '#fff0e8', '#fff8ea'][levelIdx % 6];
      ctx.fill();
      ctx.strokeStyle = 'rgba(95,92,165,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 图片占位图标，模拟参考图的“图片框”而不是具体关卡图。
    ctx.save();
    ctx.strokeStyle = ['#78a8d0', '#8d85cc', '#75a8a2', '#9280c8', '#db9285', '#b99978'][levelIdx % 6];
    ctx.lineWidth = Math.max(2, w * 0.018);
    ctx.globalAlpha = locked ? 0.55 : 0.75;
    var phW = coverW * 0.46;
    var phH = coverH * 0.48;
    var phX = coverX + (coverW - phW) / 2;
    var phY = coverY + coverH * 0.23;
    roundRect(ctx, phX, phY, phW, phH, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(phX + phW * 0.28, phY + phH * 0.30, phW * 0.10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(phX + phW * 0.08, phY + phH * 0.82);
    ctx.lineTo(phX + phW * 0.36, phY + phH * 0.55);
    ctx.lineTo(phX + phW * 0.58, phY + phH * 0.78);
    ctx.lineTo(phX + phW * 0.84, phY + phH * 0.42);
    ctx.lineTo(phX + phW * 0.96, phY + phH * 0.56);
    ctx.stroke();
    ctx.restore();

    // 锁在图片区右下角。
    if (locked) {
      var lockS = w * 0.25;
      drawUIAsset(ctx, 'hall', 'lock.png', coverX + coverW - lockS * 0.84, coverY + coverH - lockS * 0.82, lockS, lockS * 1218 / 1119, HALL_CROP);
    }

    // 卡片标题：优先用参考图对应文字，素材不可用时使用文字兜底。
    var title = style.fallback;
    ctx.save();
    ctx.fillStyle = '#272069';
    ctx.font = 'bold ' + Math.max(15, Math.floor(w * 0.145)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + w / 2, y + h * 0.755);
    ctx.restore();

    // 第一张参考图显示星星进度 12/18；其他锁定卡不显示进度条。
    if (levelIdx === 0 && hasLevel && !locked) {
      drawCardProgress(ctx, x + w * 0.26, y + h * 0.835, w * 0.48, h * 0.075, '12/18');
    }

    // 热/新角标压在右上角。
    if (style.badge) {
      var badgeS = w * 0.26;
      drawUIAsset(ctx, 'hall', style.badge, x + w - badgeS * 0.66, y - badgeS * 0.05, badgeS, badgeS, HALL_CROP);
    }
  }

  function drawCardProgress(ctx, x, y, w, h, text) {
    ctx.save();
    var starR = h * 0.46;
    ctx.fillStyle = '#ffd84a';
    ctx.strokeStyle = '#a86a16';
    ctx.lineWidth = 1.5;
    drawStar(ctx, x, y + h / 2, starR, starR * 0.48, 5);
    ctx.fill();
    ctx.stroke();

    var bx = x + starR * 0.55;
    var bw = w - starR * 0.55;
    roundRect(ctx, bx, y + h * 0.18, bw, h * 0.64, h * 0.32);
    ctx.fillStyle = '#7f68df';
    ctx.fill();
    ctx.fillStyle = '#ffd950';
    roundRect(ctx, bx + 2, y + h * 0.22, bw * 0.66, h * 0.56, h * 0.28);
    ctx.fill();
    ctx.fillStyle = '#fff8b7';
    ctx.font = 'bold ' + Math.max(10, Math.floor(h * 0.55)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw * 0.52, y + h / 2);
    ctx.restore();
  }

  function drawStar(ctx, cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outerR : innerR;
      var a = -Math.PI / 2 + i * Math.PI / points;
      var px = cx + Math.cos(a) * r;
      var py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawPageBar(ctx, L, page, totalPages, y, displayTotal) {
    var btnS = Math.max(34, Math.min(48, L.w * 0.112));
    var gap = Math.max(12, L.w * 0.035);
    var textW = Math.max(54, L.w * 0.14);
    var totalW = btnS * 4 + gap * 4 + textW;
    var x = (L.w - totalW) / 2;

    drawUIAsset(ctx, 'hall', 'pager_first.png', x, y, btnS, btnS, HALL_CROP);
    addZone('page_first', x, y, btnS, btnS);
    x += btnS + gap;

    drawUIAsset(ctx, 'hall', 'pager_previous.png', x, y, btnS, btnS, HALL_CROP);
    addZone('page_prev', x, y, btnS, btnS);
    x += btnS + gap;

    ctx.save();
    ctx.fillStyle = '#241c58';
    ctx.font = 'bold ' + Math.max(20, Math.floor(btnS * 0.56)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((page + 1) + '/' + (displayTotal || totalPages), x + textW / 2, y + btnS / 2 + 1);
    ctx.restore();
    x += textW + gap;

    drawUIAsset(ctx, 'hall', 'pager_next.png', x, y, btnS, btnS, HALL_CROP);
    addZone('page_next', x, y, btnS, btnS);
    x += btnS + gap;

    drawUIAsset(ctx, 'hall', 'pager_last.png', x, y, btnS, btnS, HALL_CROP);
    addZone('page_last', x, y, btnS, btnS);
  }

  function drawSelectBottomBar(ctx, L) {
    var bottomPad = L.bottomPadding || 0;
    var btnH = Math.max(58, Math.min(76, L.h * 0.085));
    var y = L.h - bottomPad - btnH - Math.max(16, L.h * 0.020);
    var gap = L.w * 0.055;
    var btnW = (L.w - gap * 4) / 3;
    var x = gap;

    drawUIAsset(ctx, 'hall', 'bottom_daily_checkin.png', x, y, btnW, btnH, HALL_CROP);
    addZone('select_daily', x, y, btnW, btnH);
    x += btnW + gap;

    drawUIAsset(ctx, 'hall', 'bottom_unlock_all.png', x, y, btnW, btnH, HALL_CROP);
    addZone('select_unlock', x, y, btnW, btnH);
    x += btnW + gap;

    drawUIAsset(ctx, 'hall', 'bottom_add_to_desktop.png', x, y, btnW, btnH, HALL_CROP);
    addZone('select_add', x, y, btnW, btnH);
  }

  function drawUnlockDialog(ctx, L) {
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(0, 0, L.w, L.h);
    var dw = L.w * 0.78, dh = L.h * 0.30;
    var dx = (L.w - dw) / 2, dy = (L.h - dh) / 2;
    ctx.save();
    roundRect(ctx, dx, dy, dw, dh, 16);
    ctx.fillStyle = '#fff5f0';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur  = 16;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle    = '#cc3366';
    ctx.font         = 'bold 18px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('解锁全部关卡', L.w / 2, dy + 30);
    ctx.font     = '14px sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText('观看 3 次视频，24小时内全部解锁', L.w / 2, dy + dh * 0.48);
    var abW = dw * 0.60, abH = 42;
    var abX = (L.w - abW) / 2, abY = dy + dh - 58;
    var watched = M3.Render._unlockWatchCount || 0;
    drawBtn(ctx, abX, abY, abW, abH, 21, '#e83060', null, '▶ 立即观看 ' + watched + '/3', 15, '#fff');
    addZone('unlock_watch', abX, abY, abW, abH);
    // 关闭
    ctx.save();
    ctx.fillStyle = '#e83020';
    ctx.beginPath(); ctx.arc(dx + dw - 4, dy + 4, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold 16px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', dx + dw - 4, dy + 4);
    ctx.restore();
    addZone('unlock_close', dx + dw - 18, dy - 10, 28, 28);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLAYING 阶段
  // ─────────────────────────────────────────────────────────────────────────

  function drawPlaying(ctx, L) {
    var board = M3.Board;
    var level = M3.Scene ? M3.Scene.getLevel(board.levelIdx) : null;
    if (!level) return;

    var qIdx          = board.qIdx;
    var resultPhase   = board.resultPhase;

    if (!drawUIAssetCover(ctx, 'level', 'background_base.png', 0, 0, L.w, L.h, LEVEL_CROP)) {
      drawBg(ctx, 0, 0, L.w, L.h, '#8c83ef', '#7163db');
    }

    ctx.save();
    ctx.globalAlpha = 0.22;
    var deco = Math.min(L.w * 0.24, 120);
    drawUIAsset(ctx, 'level', 'pattern_tile.png', L.w * 0.20, L.safeTop + 18, deco, deco * 0.90, LEVEL_CROP);
    drawUIAsset(ctx, 'level', 'pattern_tile.png', L.w * 0.78, L.h * 0.17, deco, deco * 0.90, LEVEL_CROP);
    drawUIAsset(ctx, 'level', 'pattern_tile.png', -deco * 0.30, L.h * 0.52, deco, deco * 0.90, LEVEL_CROP);
    ctx.restore();

    var ui = getLevelUIRects(L);
    L.levelMainArea = ui.mainInner;
    L.sceneArea = ui.mainInner;
    L.optionCards = ui.thumbs;
    L.toolBtns = ui.tools;

    drawPlayingHUD(ctx, L, level, board, ui);

    // 场景素材（厨师关卡）：先画内容，再用 frame 边框压在最上面，保证边框不被遮挡。
    // 层叠：背景 → 人物立绘 → 桌子，裁剪至内区边界防止溢出。
    // 人物立绘按 board.dressed 切换：拖入围裙后换成「穿好衣服」。
    var charAsset = board.dressed ? '穿好衣服.png' : '没穿衣服.png';
    ctx.save();
    ctx.beginPath();
    ctx.rect(ui.mainInner.x, ui.mainInner.y, ui.mainInner.w, ui.mainInner.h);
    ctx.clip();
    drawUIAsset(ctx, 'scene/chef', '背景.png',  ui.mainInner.x, ui.mainInner.y, ui.mainInner.w, ui.mainInner.h);
    drawUIAsset(ctx, 'scene/chef', charAsset,   ui.mainInner.x, ui.mainInner.y, ui.mainInner.w, ui.mainInner.h);
    drawUIAsset(ctx, 'scene/chef', '桌子.png',  ui.mainInner.x, ui.mainInner.y, ui.mainInner.w, ui.mainInner.h);
    ctx.restore();
    // 边框 PNG 最后画，压在场景素材之上。
    drawUIAsset(ctx, 'level', 'main_content_frame.png', ui.frame.x, ui.frame.y, ui.frame.w, ui.frame.h, LEVEL_CROP);

    // 左右切换箭头在主框底部两侧。
    drawUIAsset(ctx, 'level', 'nav_left.png', ui.navLeft.x, ui.navLeft.y, ui.navLeft.w, ui.navLeft.h, LEVEL_CROP);
    drawUIAsset(ctx, 'level', 'nav_right.png', ui.navRight.x, ui.navRight.y, ui.navRight.w, ui.navRight.h, LEVEL_CROP);
    addZone('play_nav_left', ui.navLeft.x, ui.navLeft.y, ui.navLeft.w, ui.navLeft.h);
    addZone('play_nav_right', ui.navRight.x, ui.navRight.y, ui.navRight.w, ui.navRight.h);

    if (resultPhase === 'wrong' && board.resultTimer > 0) {
      var alpha = Math.min(1, board.resultTimer / 200) * 0.30;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#ff2020';
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.restore();
    }

    drawOptionBar(ctx, L, level, board, ui);
    drawToolBar(ctx, L, board, ui);

    if (resultPhase === 'correct' && board.resultTimer > 0) {
      var t = board.resultTimer / 1500;
      var checkAlpha = Math.min(1, (1 - t) * 3.0);
      _drawCorrectTick(ctx, L, checkAlpha);
    }

    if (board.dragging && board.dragOptIdx >= 0) {
      // 拖到主内容区上方时高亮提示，告诉玩家可以在此松手换装。
      if (_pointInRect(board.dragX, board.dragY, ui.mainInner)) {
        ctx.save();
        ctx.setLineDash([10, 6]);
        ctx.strokeStyle = '#ffd84a';
        ctx.lineWidth = 4;
        roundRect(ctx, ui.mainInner.x + 3, ui.mainInner.y + 3, ui.mainInner.w - 6, ui.mainInner.h - 6, 12);
        ctx.stroke();
        ctx.restore();
      }
      _drawDragGhost(ctx, L, level, qIdx, board.dragOptIdx, board.dragX, board.dragY);
    }
  }

  function _pointInRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function getLevelUIRects(L) {
    var bottomPad = L.bottomPadding || 0;
    var top = L.safeTop || 0;
    var topIcon = Math.max(52, Math.min(74, L.w * 0.135));
    var topY = top + Math.max(20, L.h * 0.035);

    // HUD 第二行（计时 / 进度）紧接在第一行图标下方
    var hudRow2Y = topY + topIcon + Math.max(16, L.h * 0.018);
    var timerH   = Math.max(34, L.w * 0.095);

    // 标题 + 错误状态位于计时行下方，留足间距
    var titleW = Math.min(L.w * 0.78, 560);
    var titleH = titleW * 586 / 1988;
    var titleY = hudRow2Y + timerH + Math.max(10, L.h * 0.012);
    var errorW = Math.min(L.w * 0.34, 220);
    var errorH = errorW * 297 / 1065;

    var toolH = Math.max(86, Math.min(122, L.h * 0.125));
    var toolY = L.h - bottomPad - toolH - Math.max(22, L.h * 0.025);
    var thumbH = Math.max(58, Math.min(86, L.h * 0.085));
    var thumbY = toolY - thumbH - Math.max(26, L.h * 0.026);

    var frameX = L.w * 0.030;
    var frameW = L.w * 0.940;
    var frameY = titleY + titleH + errorH * 0.70 + Math.max(10, L.h * 0.012);
    var frameH = thumbY - frameY - Math.max(18, L.h * 0.020);
    frameH = Math.max(frameH, L.h * 0.28); // 避免极端设备上过小，但不允许溢出

    var inner = {
      x: frameX + frameW * 0.025,
      y: frameY + frameH * 0.020,
      w: frameW * 0.950,
      h: frameH * 0.955,
    };

    var navW = Math.max(30, L.w * 0.080);
    var navH = navW * 890 / 688;
    var navY = frameY + frameH - navH - frameH * 0.045;

    var thumbGap = L.w * 0.018;
    var thumbW = (L.w - L.w * 0.060 - thumbGap * 4) / 5;
    var thumbX0 = L.w * 0.030;
    var thumbs = [];
    for (var i = 0; i < 5; i++) {
      thumbs.push({ x: thumbX0 + i * (thumbW + thumbGap), y: thumbY, w: thumbW, h: thumbH });
    }

    var toolGap = L.w * 0.075;
    var toolW = (L.w - toolGap * 4) / 3;
    var tools = [];
    for (var j = 0; j < 3; j++) {
      tools.push({ x: toolGap + j * (toolW + toolGap), y: toolY, w: toolW, h: toolH });
    }

    return {
      settings: { x: L.w * 0.030, y: topY, w: topIcon, h: topIcon },
      home: { x: L.w * 0.635, y: topY + topIcon * 0.08, w: topIcon * 0.88, h: topIcon * 0.88 },
      capsule: { x: L.w * 0.755, y: topY + topIcon * 0.13, w: L.w * 0.205, h: topIcon * 0.70 },
      timer: { x: L.w * 0.120, y: hudRow2Y, w: L.w * 0.215, h: timerH },
      progress: { x: L.w * 0.685, y: hudRow2Y, w: L.w * 0.185, h: timerH * 0.93 },
      title: { x: (L.w - titleW) / 2, y: titleY, w: titleW, h: titleH },
      error: { x: (L.w - errorW) / 2, y: titleY + titleH * 0.78, w: errorW, h: errorH },
      frame: { x: frameX, y: frameY, w: frameW, h: frameH },
      mainInner: inner,
      navLeft: { x: frameX + frameW * 0.045, y: navY, w: navW, h: navH },
      navRight: { x: frameX + frameW - navW - frameW * 0.045, y: navY, w: navW, h: navH },
      thumbs: thumbs,
      tools: tools,
    };
  }

  function drawGreenPlaceholder(ctx, r, radius) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, radius || 12);
    ctx.fillStyle = '#00e52b';
    ctx.fill();
    ctx.restore();
  }

  /** 拖拽中跟手的衣服缩略图 */
  function _drawDragGhost(ctx, L, level, qIdx, optIdx, x, y) {
    var size = Math.min(L.w, L.h) * 0.22;
    var gx = x - size / 2;
    var gy = y - size / 2;

    ctx.save();
    ctx.globalAlpha = 0.9;
    // 阴影
    ctx.shadowColor   = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur    = 14;
    ctx.shadowOffsetY = 6;
    // 白底圆角
    roundRect(ctx, gx, gy, size, size, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // 边框
    ctx.strokeStyle = '#e83060';
    ctx.lineWidth   = 3;
    roundRect(ctx, gx, gy, size, size, 12);
    ctx.stroke();
    // 衣服图：0 号槽位用真实围裙素材，其余复用 scene 的程序化选项卡绘制。
    ctx.save();
    roundRect(ctx, gx + 3, gy + 3, size - 6, size - 6, 10);
    ctx.clip();
    var drawn = false;
    if (optIdx === 0) {
      drawn = drawUIAssetCover(ctx, 'scene/chef', '衣服.png', gx + 3, gy + 3, size - 6, size - 6);
    }
    if (!drawn && M3.Scene && M3.Scene.drawOutfitCard) {
      M3.Scene.drawOutfitCard(ctx,
        { x: gx + 3, y: gy + 3, w: size - 6, h: size - 6 },
        level, qIdx, optIdx, true, false);
    }
    ctx.restore();
    ctx.restore();
  }

  /** 顶部 HUD：参考图按钮、计时、进度、标题、错误剩余 */
  function drawPlayingHUD(ctx, L, level, board, ui) {
    ui = ui || getLevelUIRects(L);

    drawUIAsset(ctx, 'level', 'settings.png', ui.settings.x, ui.settings.y, ui.settings.w, ui.settings.h, LEVEL_CROP);
    addZone('play_settings', ui.settings.x, ui.settings.y, ui.settings.w, ui.settings.h);

    drawUIAsset(ctx, 'level', 'home.png', ui.home.x, ui.home.y, ui.home.w, ui.home.h, LEVEL_CROP);
    addZone('play_back', ui.home.x, ui.home.y, ui.home.w, ui.home.h);

    drawUIAsset(ctx, 'level', 'mini_program_capsule.png', ui.capsule.x, ui.capsule.y, ui.capsule.w, ui.capsule.h, LEVEL_CROP);
    addZone('play_more', ui.capsule.x, ui.capsule.y, ui.capsule.w * 0.52, ui.capsule.h);
    addZone('play_close', ui.capsule.x + ui.capsule.w * 0.52, ui.capsule.y, ui.capsule.w * 0.48, ui.capsule.h);

    if (!drawUIAsset(ctx, 'level', 'timer_103.png', ui.timer.x, ui.timer.y, ui.timer.w, ui.timer.h, LEVEL_CROP)) {
      drawBtn(ctx, ui.timer.x, ui.timer.y, ui.timer.w, ui.timer.h, ui.timer.h / 2, '#6f49c8', '#fff', String(Math.ceil(board.timeLeft || 0)), 18, '#fff');
    }
    if (!drawUIAsset(ctx, 'level', 'progress_4of8.png', ui.progress.x, ui.progress.y, ui.progress.w, ui.progress.h, LEVEL_CROP)) {
      drawBtn(ctx, ui.progress.x, ui.progress.y, ui.progress.w, ui.progress.h, ui.progress.h / 2, '#6f49c8', '#fff', (board.qIdx + 1) + '/' + (board.qTotal || 8), 18, '#fff');
    }

    drawUIAsset(ctx, 'level', 'level_title.png', ui.title.x, ui.title.y, ui.title.w, ui.title.h, LEVEL_CROP);
    drawUIAsset(ctx, 'level', 'error_status.png', ui.error.x, ui.error.y, ui.error.w, ui.error.h, LEVEL_CROP);
  }

  /** 5 个缩略图槽位：绿色区域后续替换素材；前 4 个保持选项热区 */
  function drawOptionBar(ctx, L, level, board, ui) {
    ui = ui || getLevelUIRects(L);
    var qIdx = board.qIdx;
    var previewOptIdx = board.previewOptIdx;
    var lockedOptIdx = board.lockedOptIdx;
    var resultPhase = board.resultPhase;
    var hintActive = board.hintActive;
    var hintAnswerIdx = -1;
    if (hintActive && M3.Scene && M3.Scene.getLevel) {
      var lv = M3.Scene.getLevel(board.levelIdx);
      if (lv && lv.questions) hintAnswerIdx = lv.questions[qIdx].answer;
    }

    for (var i = 0; i < 5; i++) {
      var card = ui.thumbs[i];
      drawUIAsset(ctx, 'level', 'thumbnail_frame.png', card.x, card.y, card.w, card.h, LEVEL_CROP);

      // 第 0 个选项卡：使用真实衣服图片（粉色围裙），cover-fit 填充内区。
      if (i === 0) {
        var pad = card.w * 0.08;
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, card.x + pad, card.y + pad, card.w - pad * 2, card.h - pad * 2, 8);
        ctx.clip();
        drawUIAssetCover(ctx, 'scene/chef', '衣服.png', card.x + pad, card.y + pad, card.w - pad * 2, card.h - pad * 2);
        ctx.restore();
      }

      if (i < 4) {
        var selected = (previewOptIdx === i) || (lockedOptIdx === i);
        if (selected || hintAnswerIdx === i || (resultPhase === 'wrong' && previewOptIdx === i)) {
          ctx.save();
          ctx.setLineDash(hintAnswerIdx === i ? [6, 4] : []);
          ctx.strokeStyle = hintAnswerIdx === i ? '#ffeb3b' : (resultPhase === 'wrong' ? '#ff3040' : '#20c060');
          ctx.lineWidth = 4;
          roundRect(ctx, card.x + 2, card.y + 2, card.w - 4, card.h - 4, 12);
          ctx.stroke();
          ctx.restore();
        }
        var canTap = M3.Board.canInteract ? M3.Board.canInteract() : true;
        if (canTap) addZone('play_option_' + i, card.x, card.y, card.w, card.h);
      }
    }
  }

  /** 底部工具栏：参考图加5次 / 提示 / 加时 */
  function drawToolBar(ctx, L, board, ui) {
    ui = ui || getLevelUIRects(L);
    var defs = [
      { id: 'tool_add_chances', asset: 'bottom_add5.png', disabled: false },
      { id: 'tool_hint', asset: 'bottom_hint.png', disabled: board.hintUsed },
      { id: 'tool_add_time', asset: 'bottom_add_time.png', disabled: false },
    ];
    for (var i = 0; i < 3; i++) {
      var r = ui.tools[i];
      var d = defs[i];
      drawUIAsset(ctx, 'level', d.asset, r.x, r.y, r.w, r.h, LEVEL_CROP);
      if (d.disabled) {
        ctx.save();
        ctx.globalAlpha = 0.40;
        roundRect(ctx, r.x, r.y, r.w, r.h, 14);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.restore();
      } else {
        addZone(d.id, r.x, r.y, r.w, r.h);
      }
    }
  }

  /** 大绿色 ✓ 覆盖（答对动画） */
  function _drawCorrectTick(ctx, L, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // 半透明绿色圆圈
    var cx = L.w * 0.78;
    var cy = L.sceneArea ? (L.sceneArea.y + L.sceneArea.h * 0.55) : L.h * 0.45;
    var r  = Math.min(L.w, L.h) * 0.14;

    ctx.fillStyle = 'rgba(20,200,80,0.90)';
    ctx.shadowColor = 'rgba(20,200,80,0.5)';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 白色勾
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = r * 0.26;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.42, cy + 0);
    ctx.lineTo(cx - r * 0.08, cy + r * 0.38);
    ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
    ctx.stroke();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULT 阶段
  // ─────────────────────────────────────────────────────────────────────────

  function drawResult(ctx, L) {
    // 先绘制游戏画面作为底层
    drawPlaying(ctx, L);

    var board = M3.Board;
    var win   = board.finishReason === 'win';

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, L.w, L.h);

    // 弹窗
    var pw = L.w * 0.82, ph = Math.min(L.h * 0.42, 280);
    var px = (L.w - pw) / 2, py = (L.h - ph) / 2;

    ctx.save();
    roundRect(ctx, px, py, pw, ph, 18);
    ctx.fillStyle   = win ? '#f0fff4' : '#fff5f5';
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur  = 20;
    ctx.fill();
    ctx.restore();

    // 标题
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 24px sans-serif';
    ctx.fillStyle    = win ? '#20a050' : '#e83020';
    ctx.fillText(win ? '🎉 全部完成！' : '⏰ 时间到！', L.w / 2, py + 42);

    // 统计
    ctx.font      = '15px sans-serif';
    ctx.fillStyle = '#555';
    var level = M3.Scene ? M3.Scene.getLevel(board.levelIdx) : null;
    var qDone = win ? (board.qTotal || 0) : board.qIdx;
    ctx.fillText('完成题目 ' + qDone + ' / ' + (board.qTotal || 0), L.w / 2, py + ph * 0.44);

    var wrongUsed = 3 - board.wrongLeft;
    ctx.fillText('出错次数：' + wrongUsed + ' 次', L.w / 2, py + ph * 0.60);

    // 按钮行
    var bw = pw * 0.42, bh = 44;
    var byRow = py + ph - 62;

    drawBtn(ctx, px + pw * 0.05, byRow, bw, bh, 22,
            '#e87020', null, '再来一局', 16, '#fff');
    addZone('result_retry', px + pw * 0.05, byRow, bw, bh);

    drawBtn(ctx, px + pw * 0.53, byRow, bw, bh, 22,
            '#e83060', null, '下一关 ▶', 16, '#fff');
    addZone('result_next', px + pw * 0.53, byRow, bw, bh);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 主入口：每帧调用
  // ─────────────────────────────────────────────────────────────────────────

  M3.Render.draw = function () {
    if (!_ctx) M3.Render.init();
    var ctx = _ctx;
    var L   = M3.Layout;

    // 每帧重置热区
    M3.Render.zones = [];

    if (!M3.Board) {
      drawHome(ctx, L);
      return;
    }

    var phase = M3.Board.phase;
    switch (phase) {
      case M3.Board.PHASE.HOME:
        drawHome(ctx, L);
        break;
      case M3.Board.PHASE.SELECT:
        drawSelect(ctx, L);
        break;
      case M3.Board.PHASE.PLAYING:
        drawPlaying(ctx, L);
        break;
      case M3.Board.PHASE.RESULT:
        drawResult(ctx, L);
        break;
      default:
        drawHome(ctx, L);
    }
  };

})();
