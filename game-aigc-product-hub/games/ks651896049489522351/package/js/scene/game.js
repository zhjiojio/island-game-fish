/**
 * scene-game.js — 游戏局内场景渲染
 *
 * 职责：
 *   所有游戏对战中（screen === 'game'）的 canvas 绘制逻辑
 *   包含：背景、顶部 header、玩家头像/信息、手牌、操作按钮、回合提示、动画
 *
 * 依赖（需在本文件之前加载）：
 *   render.js  — 提供 M3.Render WebGL 接口 / getHitBtns() / getHandHits()
 *   layout.js  — M3.Layout
 *   game.js    — M3.Game
 *   config.js  — M3.Config.C
 *   deck.js    — M3.Deck（drawCard 由 render.js 暴露）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var L  = M3.Layout;

  // ── hitBtns / handHits / Render 快捷访问 ────────────────────────
  function r ()       { return M3.Render; }
  function hitBtns () { return M3.Render.getHitBtns(); }
  function handHits() { return M3.Render.getHandHits(); }
  function C ()       { return M3.Config.C || {}; }

  // ── 辅助绘制工具（直接调用 M3.Render WebGL 接口）────────────────
  function rrect (x, y, w, h, rv) {
    var rd = r();
    rd.beginPath();
    rd.moveTo(x+rv, y); rd.lineTo(x+w-rv, y);
    rd.arcTo(x+w, y, x+w, y+rv, rv); rd.lineTo(x+w, y+h-rv);
    rd.arcTo(x+w, y+h, x+w-rv, y+h, rv); rd.lineTo(x+rv, y+h);
    rd.arcTo(x, y+h, x, y+h-rv, rv); rd.lineTo(x, y+rv);
    rd.arcTo(x, y, x+rv, y, rv); rd.closePath();
  }

  function fillRounded (x, y, w, h, rv, color) {
    r().fillRounded(x, y, w, h, rv, color);
  }

  function strokeRounded (x, y, w, h, rv, color, lw) {
    r().strokeRounded(x, y, w, h, rv, color, lw || 2);
  }

  function ctext (x, y, text, size, color, weight) {
    r().glFillText(String(text), x, y,
      (weight || 400) + ' ' + size + 'px sans-serif', color, 'center', 'top');
  }

  function txt (x, y, text, size, color, weight, align) {
    r().glFillText(String(text), x, y,
      (weight || 400) + ' ' + size + 'px sans-serif', color, align || 'left', 'top');
  }

  // 按压缩放动画（与主页/UIButton 同款）：按住期间以按钮中心缩至 92%。
  // 需在调用方的 save/restore 变换栈内使用；热区矩形保持原始大小，不影响命中。
  function applyPressScale (key, cx, cy, scale) {
    if (!M3.Input || !M3.Input.getPressedLabel) return false;
    if (M3.Input.getPressedLabel() !== key) return false;
    var rd = r();
    var s = scale || 0.92;
    rd.translate(cx, cy);
    rd.scale(s, s);
    rd.translate(-cx, -cy);
    return true;
  }

  function btn (x, y, w, h, label, onClick, disabled, primary) {
    var rd = r();
    var sz = Math.min(17, Math.floor(h * 0.36));
    rd.save();
    if (disabled) {
      rd.gradientFill(x, y, w, h, '#334155', '#1e293b');
      rd.glFillText(String(label), x+w/2, y+h/2, sz+'px sans-serif', '#64748b', 'center', 'middle');
    } else {
      applyPressScale(label, x + w / 2, y + h / 2);
      if (primary) {
        rd.gradientFill(x, y, w, h, C().gold || '#f59e0b', '#b45309');
      } else {
        rd.gradientFill(x, y, w, h, '#1e3a5f', '#0f2340');
      }
      rd.strokeRounded(x, y, w, h, 6,
        primary ? (C().goldL || '#fcd34d') : (C().panelBorder || '#2d5a8e'), 1.5);
      rd.glFillText(String(label), x+w/2, y+h/2, '700 '+sz+'px sans-serif',
        primary ? '#1f2937' : (C().textWhite || '#e2e8f0'), 'center', 'middle');
      hitBtns().push({ x:x, y:y, w:w, h:h, onClick:onClick, label:label });
    }
    rd.restore();
  }

  // ── 图片加载（委托 M3.AssetManager，与 render.js 共享同一缓存）──
  var AM = M3.AssetManager;
  var GAME_GROUP = 'scene:game';
  var _gameImgPaths = {
    bgGame:      'asset/image/common/bg/bg-game.png',
    btnBack:     'subpackages/ingame/asset/image/game/btn-back.png',
    cardBack:    'subpackages/ingame/asset/image/game/poke/card-back.png',
    cardAtlas:   'subpackages/ingame/asset/image/game/poke/card-atlas.png',   // 扑克图集（54张，TexturePacker @3x）
    hatLandlordLeft:  'asset/image/common/icon/hat-landlord-left.png',   // 左侧/自己用
    hatLandlordRight: 'asset/image/common/icon/hat-landlord-right.png',  // 右侧用
    btnChat:     'subpackages/ingame/asset/image/game/btn-chat.png',
    iconTimer:   'subpackages/ingame/asset/image/game/icon-timer.png',
    beanIcon:    'asset/image/common/icon/bean.png',
    // ---- 局内新切图：顶部信息条 / 底部豆数倍数底 / 操作按钮 ----
    gameInfoBar:     'subpackages/ingame/asset/image/game/game-info-bar.png',
    gameInfoDivider: 'subpackages/ingame/asset/image/game/game-info-divider.png',
    beanMultiBg:     'subpackages/ingame/asset/image/game/bean-multi-bg.png',
    multiplierIcon:  'subpackages/ingame/asset/image/game/multiplier-icon.png',
    diamondIcon:     'asset/image/common/icon/diamond.png',
    iconPlus:        'asset/image/common/icon/icon-plus.png',
    btnGold:     'asset/image/common/btn/btn-6.png',
    btnBlue:     'asset/image/common/btn/btn-5.png',
    btnTeal:     'asset/image/common/btn/btn-3.png',
    btnGray:     'asset/image/common/btn/btn-1.png',
    btnRed:      'asset/image/common/btn/btn-2.png',
    // ---- 其他玩家组件（Figma 130-2061 Player Areas，61×97）----
    otherPanelBg:   'subpackages/ingame/asset/image/game/other-panel-bg.png',
    otherBeanBg:    'subpackages/ingame/asset/image/game/other-bean-bg.png',
    otherBeanIcon:  'subpackages/ingame/asset/image/game/other-bean-icon.png',
    cardCountBg:    'subpackages/ingame/asset/image/game/card-count-bg.png',
    landlordBadge: 'subpackages/ingame/asset/image/game/landlord-badge.png',
    // ---- 操作标签图片（蓝色立体字切图）----
    labelMatching: 'subpackages/ingame/asset/image/game/labels/matching.png',  // 匹配中... 361x123
    labelPass:     'subpackages/ingame/asset/image/game/labels/pass.png',      // 不出 202x123
    labelNoBid:    'subpackages/ingame/asset/image/game/labels/no-bid.png',    // 不叫 202x123
    labelCantBeat: 'subpackages/ingame/asset/image/game/labels/cant-beat.png', // 要不起 292x123
  };

  function preloadGameImgs () {
    var keys = Object.keys(_gameImgPaths);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      AM.acquire('image', k, _gameImgPaths[k], GAME_GROUP);
    }
  }

  function getGameImg (key) {
    // 保持兼容旧调用，委托给 AssetManager
    return AM.loaded(key) ? AM.get(key) : null;
  }

  // ── 头像缓存（URL-based，仍用简单缓存，无需引用计数）──
  var _avatarCache = {};

  // ── 辅助：游戏状态 ──────────────────────────────────────────────
  function nameOf (pid) {
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    if (!pid || !state || !state.players[pid]) return '...';
    return pid === myId ? '你' : state.players[pid].name;
  }

  function actionRemainingMs () {
    var state = M3.Game.getState();
    if (!state || !state.actionDeadlineAt) return 0;
    var now = M3.Game.getServerNow ? M3.Game.getServerNow() : Date.now();
    return Math.max(0, state.actionDeadlineAt - now);
  }

  function actionRemainingSec () { return Math.ceil(actionRemainingMs() / 1000); }

  function turnActorId () {
    var state = M3.Game.getState();
    if (!state) return '';
    if (state.phase === 'bidding' && state.bidState) return state.bidState.currentPlayerId;
    if (state.phase === 'doubling') return state.doublingPlayerId || '';
    if (state.phase === 'playing') return state.currentPlayerId;
    return '';
  }

  function timerColor (sec) {
    if (sec <= 5)  return '#ef4444';
    if (sec <= 10) return '#f97316';
    return C().goldL || '#fcd34d';
  }

  function playersBySeat () {
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    if (!state) return [];
    var mySeat = state.players[myId] ? state.players[myId].seat : 0;
    return [0, 2, 1].map(function (o) {
      var id = state.seats[(mySeat + o) % 3];
      return id ? state.players[id] : null;
    });
  }

  function sortedPlayers () {
    var state = M3.Game.getState();
    if (!state) return [];
    return state.seats.map(function (id) { return id ? state.players[id] : null; }).filter(Boolean);
  }

  function clientRoomTierName () {
    var state = M3.Game.getState();
    if (state && state.roomType) {
      var t = state.roomType;
      if (t === 'junior') return '初级场';
      if (t === 'mid')    return '中级场';
      if (t === 'master') return '大师场';
      return t;
    }
    return '初级场';
  }

  // ── 背景 ────────────────────────────────────────────────────────
  var _bgFallback = null;  // 离屏渐变 canvas 缓存

  function drawGameBackground () {
    var rd = r();
    var W = L.w, H = L.h;
    var bgImg = getGameImg('bgGame');
    if (bgImg) {
      rd.glDrawImage(bgImg, 0, 0, W, H);
    } else {
      // 使用离屏 canvas 绘制真正的径向渐变（中心亮蓝，四周深海军蓝）
      if (!_bgFallback || _bgFallback._w !== W || _bgFallback._h !== H) {
        var cvs = document.createElement('canvas');
        cvs.width = Math.ceil(W); cvs.height = Math.ceil(H);
        var ctx = cvs.getContext('2d');
        var g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
        g.addColorStop(0,    '#1a4a8a'); // 中心：亮蓝
        g.addColorStop(0.45, '#0a2a52'); // 中部：深蓝
        g.addColorStop(1,    '#030d1e'); // 边缘：深海军蓝
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        cvs._texStatic = true;   // 渐变烘焙后不变：纹理只上传一次
        _bgFallback = cvs;
        _bgFallback._w = W; _bgFallback._h = H;
      }
      rd.glDrawImage(_bgFallback, 0, 0, W, H);
    }
  }

  var _leaveConfirm = null;

  function hideLeaveConfirm () {
    _leaveConfirm = null;
  }

  function isLeaveConfirmVisible () {
    return !!_leaveConfirm;
  }

  function showLeaveConfirm () {
    var state = M3.Game.getState && M3.Game.getState();
    // 逃跑确认即预载主页资源（进局时 scene:home 已被释放）：确认后回大厅不再闪现占位
    if (M3.SceneHome && M3.SceneHome.preloadAssets) M3.SceneHome.preloadAssets();
    var inActiveRound = state && (state.phase === 'bidding' || state.phase === 'doubling' || state.phase === 'playing');
    // 逃跑扣豆数：与服务端 applyExitPenalty 一致（场次冻结豆，结算时退还、中途逃跑没收）
    var penaltyText = '';
    if (inActiveRound && M3.Game.getRoomTier) {
      var tier = M3.Game.getRoomTier() || {};
      var fb = Number(tier.freezeBeans || 0);
      if (fb > 0) penaltyText = '退出将扣' + M3.Game.formatBeans(fb) + '豆子';
    }
    _leaveConfirm = {
      title: '确认逃跑么？',
      content: penaltyText || '确认退出当前房间？'
    };
  }

  function confirmLeaveRoom () {
    hideLeaveConfirm();
    if (M3.Vibrate) M3.Vibrate.heavy();   // 逃跑扣豆确认：惩罚类操作要有重量感
    M3.Game.leaveRoom();
  }

  function drawLeaveConfirmModal () {
    if (!_leaveConfirm) return;
    var rd = r();
    var W = L.w, H = L.h;
    var mw = Math.min(360, W * 0.82);
    var mh = 190;
    var mx = (W - mw) / 2;
    var my = (H - mh) / 2;
    var btnW = Math.min(128, (mw - 54) / 2);
    var btnH = 42;
    var gap = 16;
    var cancelX = mx + (mw - btnW * 2 - gap) / 2;
    var confirmX = cancelX + btnW + gap;
    var btnY = my + mh - 62;

    rd.save();
    rd.fillRect(0, 0, W, H, 'rgba(2, 6, 23, .62)');
    rd.shadowColor = 'rgba(0,0,0,.45)';
    rd.shadowBlur = 18;
    rd.fillRounded(mx, my, mw, mh, 18, 'rgba(15, 38, 72, .96)');
    rd.shadowBlur = 0;
    rd.strokeRounded(mx, my, mw, mh, 18, 'rgba(250, 204, 21, .55)', 2);
    rd.glFillText(_leaveConfirm.title, W / 2, my + 26, '800 21px sans-serif', '#fde68a', 'center', 'top');
    rd.glFillText(_leaveConfirm.content, W / 2, my + 72, '500 15px sans-serif', '#e5e7eb', 'center', 'top', mw - 46);

    // 左：确认逃跑（普通）；右：继续打（强调金色，主操作在右）
    rd.save();
    applyPressScale('game_leave_confirm', cancelX + btnW / 2, btnY + btnH / 2);
    rd.fillRounded(cancelX, btnY, btnW, btnH, 10, 'rgba(30, 58, 95, .95)');
    rd.strokeRounded(cancelX, btnY, btnW, btnH, 10, 'rgba(148, 163, 184, .55)', 1.5);
    rd.glFillTextStroke('确认逃跑', cancelX + btnW / 2, btnY + btnH / 2, '800 16px sans-serif', '#e2e8f0', '#0f172a', Math.max(2.5, 16 * 0.16), 'center', 'middle');
    rd.restore();

    rd.save();
    applyPressScale('game_leave_cancel', confirmX + btnW / 2, btnY + btnH / 2);
    rd.gradientFill(confirmX, btnY, btnW, btnH, '#f59e0b', '#b45309');
    rd.strokeRounded(confirmX, btnY, btnW, btnH, 10, '#fcd34d', 1.5);
    rd.glFillTextStroke('继续打', confirmX + btnW / 2, btnY + btnH / 2, '800 16px sans-serif', '#1f2937', '#f59e0b', Math.max(2.5, 16 * 0.16), 'center', 'middle');
    rd.restore();
    rd.restore();

    hitBtns().push({ x: 0, y: 0, w: W, h: H, label: 'game_leave_mask', onClick: hideLeaveConfirm });
    hitBtns().push({ x: cancelX, y: btnY, w: btnW, h: btnH, label: 'game_leave_confirm', onClick: confirmLeaveRoom });
    hitBtns().push({ x: confirmX, y: btnY, w: btnW, h: btnH, label: 'game_leave_cancel', onClick: hideLeaveConfirm });
  }

  function drawBackButton () {
    var rd = r();
    var headerH = 60;
    var backSize = 33;   // btn-back.png 逻辑尺寸 33×33（物理 99×99 @3x）
    var backX = (L.leftEdgeX || 18), backY = (headerH - backSize) / 2;
    var backImg = getGameImg('btnBack');
    rd.save();
    applyPressScale('game_exit', backX + backSize / 2, backY + backSize / 2);
    if (backImg) {
      rd.glDrawImage(backImg, backX, backY, backSize, backSize);
    } else {
      rd.beginPath(); rd.arc(backX + backSize/2, backY + backSize/2, backSize/2, 0, Math.PI*2);
      rd.fill('rgba(30,80,160,0.9)');
      rd.glFillText('◀', backX+backSize/2, backY+backSize/2,
        '700 18px sans-serif', '#fff', 'center', 'middle');
    }
    rd.restore();
    hitBtns().unshift({ x: backX, y: backY, w: backSize, h: backSize, label: 'game_exit',
      onClick: function () {
        if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) {
          M3.Matchmaking.cancel();
        } else {
          showLeaveConfirm();
        }
      } });
  }

  // ── 顶部 header ─────────────────────────────────────────────────
  function drawGameHeader () {
    var rd = r();
    var W = L.w;
    var state = M3.Game.getState();
    var headerH = 60;

    var backSize = 33;
    var backX = (L.leftEdgeX || 18), backY = (headerH - backSize) / 2;
    drawBackButton();

    // 三张底牌（36×52）
    var lcW = 36, lcH = 52, cardGap = 5;
    var threeCardsW = lcW * 3 + cardGap * 2;

    // ── 统一量测（供底牌定位 + 胶囊绘制共用）──────────────────────
    if (!state) return;
    var tierName    = clientRoomTierName();
    var baseScore   = state.round ? (state.round.baseScore || 100) : 100;
    // 冻结豆数（服务端 player.frozenBeans；局外为 0）
    var me0 = state.players[M3.Game.getMyPlayerId()];
    var frozenBeans = me0 && typeof me0.frozenBeans === 'number' ? me0.frozenBeans : 0;
    var gap = 8, lgap = 3;    // Figma GameInfo Gap=8
    var font600 = '600 12px sans-serif';
    var font400 = '400 12px sans-serif';
    var w1  = rd.glMeasureText(tierName,                          font600);
    var wbv = rd.glMeasureText(String(baseScore),                 font600);
    var wfv = rd.glMeasureText(M3.Game.formatBeans(frozenBeans),  font600);
    var wbl = rd.glMeasureText('底分', font400);
    var wfl = rd.glMeasureText('冻结', font400);
    // 本局最大可能输 = 底分 × 倍数上限 × 角色份数（地主 2 份 / 农民 1 份），取自 economy.roomTiers
    var maxLossStr = '';
    var ecoTiers = (M3.Game.getEconomy && M3.Game.getEconomy().roomTiers) || null;
    var tierCfg = ecoTiers && (ecoTiers[(state && state.roomType) || 'junior'] || ecoTiers.junior);
    if (tierCfg && tierCfg.maxMultiplier) {
      var share = (me0 && me0.role === 'landlord') ? 2 : 1;
      maxLossStr = M3.Game.formatBeans(baseScore * tierCfg.maxMultiplier * share);
    }
    var wml = maxLossStr ? rd.glMeasureText('最大输', font400) : 0;
    var wmv = maxLossStr ? rd.glMeasureText(maxLossStr, font600) : 0;
    // contentW = 内容区（不含左右 padding 16）
    var maxLossSeg = maxLossStr ? (gap + (wml+lgap+wmv)) : 0;
    var contentW = w1 + gap + 1 + gap + (wbl+lgap+wbv) + gap + (wfl+lgap+wfv) + maxLossSeg;
    var MIN_DESIGN_W = 178;   // Figma GameInfo fixed 178×33
    var pillW = Math.max(MIN_DESIGN_W, contentW + 32);
    var pillH = 33;
    var pillX = W / 2 - pillW / 2;
    var pillY = (headerH - pillH) / 2;

    // ── 三张底牌（定位依赖 pillX）────────────────────────────────
    // 三张牌右边缘距 pillX 左侧固定 6px（由 Inspect 工具确认：dx=75 对应间距 6px，2026-09-01）
    var CARD_PILL_GAP = 6;
    var cardsStartX = Math.max(backX + backSize + 12, pillX - CARD_PILL_GAP - threeCardsW);
    var cardsY = (headerH - lcH) / 2 + 10;
    var hasCards = state && state.landlordCardsVisible && state.landlordCardsVisible.length > 0;
    if (hasCards) {
      state.landlordCardsVisible.forEach(function (card, i) {
        M3.Render.drawCardFast(cardsStartX + i*(lcW+cardGap), cardsY, card, lcW, lcH);
      });
    } else {
      for (var ci = 0; ci < 3; ci++) {
        drawCardBack(cardsStartX + ci*(lcW+cardGap), cardsY, lcW, lcH);
      }
    }

    // ── 胶囊底：GameInfo 切图 9 宫格（187×42 含阴影 @3x，逻辑高 42=胶囊 33+阴影 9）──
    // 图片物理 561×126 @3x → 逻辑 187×42；胶囊本体 y=0~99@3x=33px，阴影 y=100~125=9px
    // 绘制高度传 pillH+9 让阴影完整显示在胶囊下方，不挤压胶囊本体
    var infoBarImg = getGameImg('gameInfoBar');
    var pillDrawH = pillH + 9;   // 胶囊本体 33 + 阴影 9
    if (infoBarImg) {
      if (rd.glDrawImage9) rd.glDrawImage9(infoBarImg, pillX, pillY, pillW, pillDrawH, 16, 16, 187, 42);
      else rd.glDrawImage(infoBarImg, pillX, pillY, pillW, pillDrawH);
    }
    else fillRounded(pillX, pillY, pillW, pillH, pillH/2, 'rgba(46,54,98,0.60)');

    // ── 文字内容：相对胶囊水平居中（Figma padding L/R=16 对称）──
    // py = 胶囊本体（pillH=33）的垂直中心；render.js glFillText baseline=middle 内部用
    // actualBoundingBox metrics 精确对齐，不再在此做手工 -1/-2 修正（快小字体 metrics 不同）
    var py  = pillY + pillH / 2;
    var px = pillX + (pillW - contentW) / 2;   // 内容整体居中
    // 场次名（金色 600）
    rd.glFillText(tierName, px, py, font600, '#FAE9AF', 'left', 'middle');
    px += w1 + gap;
    // 分割线（Line 2 切图：物理 2×51 = 3x 的 ~0.7×17 逻辑，按 1px 宽绘制避免显粗）
    var divImg = getGameImg('gameInfoDivider');
    if (divImg) rd.glDrawImage(divImg, px, pillY + (pillH - 17) / 2, 1, 17);
    else { rd.beginPath(); rd.moveTo(px+0.5, pillY+9); rd.lineTo(px+0.5, pillY+pillH-9); rd.stroke('rgba(255,255,255,0.25)', 1); }
    px += 1 + gap;
    // 底分（label 白 400 / 数值金 600）
    rd.glFillText('底分',               px,   py, font400, '#FFFFFF', 'left', 'middle');
    px += wbl + lgap;
    rd.glFillText(String(baseScore),    px,   py, font600, '#FAE9AF', 'left', 'middle');
    px += wbv + gap;
    // 冻结（label 白 400 / 数值金 600，与底分保持一致）
    var frozenStr = M3.Game.formatBeans(frozenBeans);
    rd.glFillText('冻结',               px,   py, font400, '#FFFFFF', 'left', 'middle');
    px += wfl + lgap;
    rd.glFillText(frozenStr,            px,   py, font600, '#FAE9AF', 'left', 'middle');
    px += wfv + gap;
    // 本局最大可能输（同款配色；economy 未就绪时不展示）
    if (maxLossStr) {
      rd.glFillText('最大输',           px,   py, font400, '#FFFFFF', 'left', 'middle');
      px += wml + lgap;
      rd.glFillText(maxLossStr,         px,   py, font600, '#FAE9AF', 'left', 'middle');
    }
  }

  // ── 卡背 ────────────────────────────────────────────────────────
  function drawCardBack (x, y, w, h) {
    var rd = r();
    var cbImg = getGameImg('cardBack');
    if (cbImg) {
      rd.glDrawImage(cbImg, x, y, w, h);
    } else {
      fillRounded(x, y, w, h, 5, '#1a4a8a');
      strokeRounded(x, y, w, h, 5, 'rgba(100,160,255,0.5)', 1);
    }
  }

  // ── 头像 ────────────────────────────────────────────────────────
  // 头像圆形裁剪缓存：key = url|diameter，value = { cvs, img, ready }
  // 头像图片缓存加载（懒加载 + 预载共用）：按 URL 缓存 img，外链补 crossOrigin 防 taint
  function _avatarImg (url) {
    var img = _avatarCache[url];
    if (img) return img;
    try {
      if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
      else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
      else img = new Image();
    } catch (e) {
      try { img = new Image(); } catch (e2) { img = null; }
    }
    if (!img) return null;
    if (/^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous';   // CDN 图走 canvas 裁剪→WebGL，防 taint
    img.src = url; _avatarCache[url] = img;
    return img;
  }

  // bot 头像池预载（与服务端 server/bots/bot-factory.js 的 BOT_AVATARS 保持同步）：
  // 模块加载即并发拉取，等用户走完「大厅→匹配→进局」流程时图片早已就绪，
  // 第一帧直接绘制头像。池子若与服务端不同步仅损失预载效果（退化为进局后加载），无害。
  var BOT_AVATAR_CDN_BASE = 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks651896049489522351/avatar';
  for (var _pai = 1; _pai <= 10; _pai++) {
    _avatarImg(BOT_AVATAR_CDN_BASE + '/avatar-default-' + _pai + '.png');
  }

  function drawAvatar (x, y, av, url, name, isMe) {
    var rd = r();
    // 圆形背景（加载完成前仅显示此底色，不再画名字首字占位）
    rd.beginPath(); rd.arc(x, y, av, 0, Math.PI * 2);
    rd.fill(isMe ? 'rgba(255,255,255,.12)' : 'rgba(0,80,180,.25)');

    if (url) {
      var img = _avatarImg(url);
      if (img && img.width > 0) {
        // 直接用 WebGL 圆形裁剪 shader（smoothstep 羽化，无锯齿，无离屏 canvas 开销）
        // cover 缩放：头像按短边 cover，直接绘制成圆形区域让 shader 裁
        // 注意：glDrawImageCircle 绘制正方形 [cx-r, cy-r, 2r×2r]，UV(0~1) → shader 裁圆
        rd.glDrawImageCircle(img, x, y, av, 1.2);
      }
    }

    // 圆形边框（shader smoothstep 抗锯齿，替代 arc+stroke）
    rd.glDrawCircleStroke(x, y, av, 2, isMe ? '#FFFFFF' : 'rgba(255,255,255,0.6)');
  }

  // ── 地主帽 ──────────────────────────────────────────────────────
  function drawLandlordHat (cx, cy, avR, rightSide) {
    var rd = r();
    var hatImg = getGameImg(rightSide ? 'hatLandlordRight' : 'hatLandlordLeft');
    var hatSize = avR * 1.5;
    var hatX = rightSide
      ? (cx + avR + hatSize * 0.28 - hatSize)
      : (cx - avR - hatSize * 0.28);
    var hatY = cy - avR - hatSize * 0.42;
    rd.save();
    if (hatImg) {
      rd.glDrawImage(hatImg, hatX, hatY, hatSize, hatSize);
    } else {
      rd.glFillText('👑', hatX + hatSize/2, hatY + hatSize/2,
        Math.floor(hatSize*0.7) + 'px sans-serif', '#FAE9AF', 'center', 'middle');
    }
    rd.restore();
  }

  // ── 铁豆数量（他人，Figma 130-2061 Group 16）居中于 cx ──────────
  // 胶囊底 49×16 切图（黑 20% 全圆角，九宫格拉伸适配数字宽度，切片 8）+
  // 豆 icon 13×13（胶囊内左 2）+ 数字 10px/500/#FAE9AF。
  // 切图未加载时回退代码绘制（旧样式）。
  function drawBeanCount (cx, topY, count) {
    var rd = r();
    var beanImg = getGameImg('otherBeanIcon');
    var bgImg = getGameImg('otherBeanBg');
    var iconSize = 13;
    var countStr = M3.Game.formatBeans(count);
    var font = '500 10px sans-serif';
    var textW = rd.glMeasureText(countStr, font);
    var pillH = 16;
    // 结构：[leftPad][icon][文字区居中][rightPad]
    // 文字区宽 = 图标右边 → pill 右边减 rightPad
    var leftPad = 3, rightPad = 4;
    var minPillW = leftPad + iconSize + textW + rightPad + 4;
    var pillW = Math.max(49, minPillW);
    var pillX = cx - pillW / 2;
    var pillY = topY;
    if (bgImg) {
      if (rd.glDrawImage9) rd.glDrawImage9(bgImg, pillX, pillY, pillW, pillH, 8, 8, 49, 16);
      else rd.glDrawImage(bgImg, pillX, pillY, pillW, pillH);
    } else {
      fillRounded(pillX, pillY, pillW, pillH, pillH/2, 'rgba(0,0,0,0.20)');
    }
    // 图标固定左边距
    var iconX = pillX + leftPad;
    var iconY = pillY + (pillH - iconSize) / 2;
    if (beanImg) {
      rd.glDrawImage(beanImg, iconX, iconY, iconSize, iconSize);
    } else {
      rd.glFillText('🪙', iconX, pillY + pillH/2, iconSize + 'px sans-serif', '#FAE9AF', 'left', 'middle');
    }
    // 文字在图标右侧剩余区域内居中
    var textAreaLeft = iconX + iconSize;
    var textAreaW = pillW - leftPad - iconSize - rightPad;
    var textCX = textAreaLeft + textAreaW / 2;
    rd.glFillText(countStr, textCX, pillY + pillH / 2, font, '#FAE9AF', 'center', 'middle');
  }

  // ── 剩余牌数 badge ──────────────────────────────────────────────
  function drawCardCountBadge (x, y, count) {
    var rd = r();
    var bw = 30, bh = 40;   // 布局占位尺寸（不变）
    var dw = 22, dh = 30;   // 实际绘制尺寸（缩小，居中在占位框内）
    var dx = x + (bw - dw) / 2, dy = y + (bh - dh) / 2;
    var cbImg = getGameImg('cardBack');
    if (cbImg) {
      rd.glDrawImage(cbImg, dx, dy, dw, dh);
    } else {
      fillRounded(dx, dy, dw, dh, 4, 'rgba(20,60,120,0.9)');
      strokeRounded(dx, dy, dw, dh, 4, 'rgba(100,160,255,0.6)', 1);
    }
    // 数字 badge
    var bgImg = getGameImg('cardCountBg');
    var bgSz = 18;
    var numStr = String(count);
    var numFont = '700 15px sans-serif';
    var nx = dx + dw / 2;
    var ny = dy + dh / 2;
    if (bgImg) {
      rd.glDrawImage(bgImg, nx - bgSz / 2, ny - bgSz / 2, bgSz, bgSz);
    } else {
      fillRounded(nx - bgSz/2, ny - bgSz/2, bgSz, bgSz, 3, 'rgba(0,0,0,0.55)');
    }
    // 数字：用 glFillTextStroke 一次调用搞定描边+填充（比4次偏移 glFillText 快4倍）
    rd.glFillTextStroke(numStr, nx, ny, numFont, '#ffffff', '#000000', 2.5, 'center', 'middle');
  }

  // 出牌展示的固定步进间距（相邻两张牌左边缘的距离），保证牌之间重叠不全展开
  var PLAY_CARD_GAP = 18;

  // 手牌步进间距（相邻两张牌左边缘的距离）：按牌宽的固定比例，
  // 与 cardW 等比缩放，保证任何分辨率下牌的露出宽度视觉一致。
  // 基准：cardW=72（短边 ≥410 的设计稿基准）时 gap=31.5 → 比例 0.4375。
  var HAND_GAP_RATIO = 31.5 / 72;

  // ── 出牌展示：以 (centerX, centerY) 为中心绘制一组「落地牌」(40x59) ──
  // 牌之间横向重叠，整体水平居中于 centerX、垂直居中于 centerY。
  function sortAscCards (cards) {
    return (cards || []).slice().sort(function (a, b) { return a.rank - b.rank || String(a.id).localeCompare(String(b.id)); });
  }
  // 出牌展示排序：按牌型结构排列
  //   主牌（出现次数多的 rank）靠前，带牌靠后；同组内 rank 升序。
  //   例：QQ222 → 222QQ；飞机带对 4445558899 → 444555 8899；顺子 34567 → 34567
  //   单张/对子/顺子/王炸等无"带牌"结构的，直接按 rank 升序。
  function sortPlayDisplay (cards) {
    if (!cards || cards.length === 0) return [];
    // 统计每个 rank 的出现次数
    var countMap = {};
    for (var i = 0; i < cards.length; i++) {
      var r2 = cards[i].rank;
      countMap[r2] = (countMap[r2] || 0) + 1;
    }
    // 找出现次数最多的（主牌档）
    var maxCount = 0;
    for (var r3 in countMap) { if (countMap[r3] > maxCount) maxCount = countMap[r3]; }
    // 只有一种出现次数 → 纯顺子/单张/对子/炸弹：直接升序
    var counts = [];
    for (var r4 in countMap) { if (counts.indexOf(countMap[r4]) < 0) counts.push(countMap[r4]); }
    if (counts.length === 1) return sortAscCards(cards);
    // 多种出现次数：按「出现次数降序，同次数内 rank 升序」分组排列
    return sortAscCards(cards).sort(function (a, b) {
      var ca = countMap[a.rank], cb = countMap[b.rank];
      if (ca !== cb) return cb - ca;  // 出现次数多的在前
      return a.rank - b.rank;
    });
  }
  function drawPlayedCards (centerX, centerY, cards) {
    if (!cards || cards.length === 0) return;
    var sorted = sortPlayDisplay(cards);
    var cw = L.playCardW || 40, ch = L.playCardH || 59;
    var n = sorted.length;
    // 固定步进间距 19px（重叠展示，避免全部展开）
    var gap = PLAY_CARD_GAP;
    var tot = cw + gap * (n - 1);
    var sx = centerX - tot / 2;
    var top = centerY - ch / 2;
    for (var i = 0; i < n; i++) {
      M3.Render.drawCardFast(sx + i * gap, top, sorted[i], cw, ch);
    }
  }

  // ── 「不出」/「不叫」/「不抢」文字（优先用切图，无图则降级文字）─────────
  var _LABEL_IMG_MAP = {
    '不出':  'labelPass',
    '不叫':  'labelNoBid',
    '不抢':  'labelNoBid',    // 复用「不叫」图，视觉相近
    '要不起': 'labelCantBeat',
  };
  var _LABEL_SRC_SIZE = {
    labelPass:     [202, 123],
    labelNoBid:    [202, 123],
    labelCantBeat: [292, 123],
  };
  function drawPassText (centerX, centerY, label) {
    var rd = r();
    var imgKey = _LABEL_IMG_MAP[label];
    if (imgKey) {
      var img = getGameImg(imgKey);
      if (img) {
        var src = _LABEL_SRC_SIZE[imgKey] || [202, 123];
        var dh = 40;   // 目标高度（与原字体大小 22px 视觉相近）
        var dw = Math.round(dh * src[0] / src[1]);
        rd.glDrawImage(img, centerX - dw / 2, centerY - dh / 2, dw, dh);
        return;
      }
    }
    // ── 降级：canvas 文字渲染 ──
    label = label || '不出';
    var fontSz = 22;
    var font = '900 ' + fontSz + 'px sans-serif';
    rd.save(); rd.setAlpha(0.55);
    rd.glFillText(label, centerX, centerY+2, font, '#0B2141', 'center', 'middle');
    rd.restore();
    var offsets = [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[0,1],[-1,0],[1,0]];
    for (var i = 0; i < offsets.length; i++) {
      rd.glFillText(label, centerX+offsets[i][0], centerY+offsets[i][1], font, '#3273CF', 'center', 'middle');
    }
    rd.glFillText(label, centerX, centerY, font, '#a9dafd', 'center', 'middle');
    rd.save(); rd.setAlpha(0.50);
    rd.glFillText(label, centerX, centerY, font, '#fffdf6', 'center', 'middle');
    rd.restore();
  }

  // 读取某玩家本轮出牌/不出展示状态（供渲染判断）
  function getTrickPlay (pid) { return _trickPlays[pid] || null; }

  // ── 出牌规则提示条（参照 figma 923:4528 / 973:3766）──────────────────
  // 横向渐变底 368x24（transparent→#1b2137c2→transparent），金色文字 #FAE9AF 12px 居中。
  // 用于「你没有大过对家的牌」「你选择的牌不符合规则」等即时提示，展示在牌堆上方。
  var _ruleTip = { msg: '', until: 0, sticky: false };
  // 聊天按钮矩形（供 scene-voice.js 定位弹窗；每帧 drawChatButton 时更新）
  var _chatBtnRect = null;
  function getChatBtnRect () { return _chatBtnRect; }
  // sticky=true 时常驻展示（用于回合开始即无牌可压的提示），直到 clearRuleTip 主动清除
  function showRuleTip (msg, sticky) {
    _ruleTip.msg = msg;
    _ruleTip.sticky = !!sticky;
    _ruleTip.until = sticky ? Infinity : (Date.now() + 1600);
  }
  function clearRuleTip (onlySticky) {
    if (onlySticky && !_ruleTip.sticky) return;
    _ruleTip.msg = '';
    _ruleTip.until = 0;
    _ruleTip.sticky = false;
  }
  function drawRuleTip () {
    if (!_ruleTip.msg || Date.now() > _ruleTip.until) return;
    var rd = r();
    rd.save();
    var W = L.w;
    var bw = Math.min(368, W * 0.86), bh = 24;
    var bx = W / 2 - bw / 2;
    var handBottom = (typeof L.handY === 'number' ? L.handY : (L.h - 60)) + (L.cardH || 90);
    var by = handBottom - 6 - bh;
    // 横向渐变底（Figma 923-4532）: #1b213700 0% → #1b2137c2 36% → #1b2137c2 62% → #1b213700 100%
    // 使用顶点着色横向渐变，真正平滑无色块。
    if (rd.fillRectGradH) {
      rd.fillRectGradH(bx, by, bw, bh, [
        { t: 0,    css: 'rgba(27,33,55,0)' },
        { t: 0.36, css: 'rgba(27,33,55,0.76)' },
        { t: 0.62, css: 'rgba(27,33,55,0.76)' },
        { t: 1,    css: 'rgba(27,33,55,0)' }
      ]);
    } else {
      var MAX_A = 0.76, steps = 48, sw = bw / steps;
      for (var i = 0; i < steps; i++) {
        var t = (i + 0.5) / steps;   // 该条中心位置 0~1
        var a;
        if (t <= 0.36)      a = (t / 0.36) * MAX_A;            // 0 → 0.76
        else if (t >= 0.62) a = ((1 - t) / (1 - 0.62)) * MAX_A; // 0.76 → 0
        else                a = MAX_A;                          // 中段恒定
        if (a < 0) a = 0;
        rd.fillRect(bx + sw * i, by, sw + 0.5, bh,
          'rgba(27,33,55,' + a.toFixed(3) + ')');
      }
    }
    rd.glFillText(_ruleTip.msg, W/2, by + bh/2,
      '600 12px sans-serif', '#FAE9AF', 'center', 'middle');
    rd.restore();
  }

  // ── 语音气泡（参照 figma 923:5313）──────────────────────────────────
  // 对方点击语音后，我方在其头像「上方一角」展示语音文案气泡，带指向头像的箭头，
  // 不遮挡头像旁的剩余牌堆。
  //   左边的人（i===1）气泡在头像右上方（dir='tr'）；
  //   右边的人（i===2）气泡在头像左上方（dir='tl'）。
  // { pid: { text, until } }
  var _voiceBubbles = {};
  var VOICE_BUBBLE_MS = 3000;
  function playVoiceUrl (url) {
    if (!url || typeof KwaiMedia === 'undefined' || !KwaiMedia.Audio || !KwaiMedia.Audio.playVoice) return;
    KwaiMedia.Audio.playVoice(url);
  }
  function showVoiceBubble (pid, text, voiceUrl, audioKey) {
    if (!pid || (!text && !voiceUrl)) return;
    if (text) _voiceBubbles[pid] = { text: text, until: Date.now() + VOICE_BUBBLE_MS };
    // 优先按接收方当前选中的语音包音色播放（audioKey → 本地包映射），
    // 当前包无此 key 时回退服务端下发的 voiceUrl（默认包 CDN 地址）
    var url = voiceUrl || '';
    if (audioKey && M3.VoicePack && M3.VoicePack.getUrl) {
      var localUrl = M3.VoicePack.getUrl(audioKey);
      if (localUrl) url = localUrl;
    }
    if (url) playVoiceUrl(url);
  }
  // 绘制单个玩家的语音气泡（figma 923:5313）：气泡置于头像东北 / 西北方向，带指向头像的箭头。
  //   dir='tr' 气泡在头像右上（东北）方，箭头锚定头像右上鳍缘，向下指向头像；
  //   dir='tl' 气泡在头像左上（西北）方，箭头锚定头像左上鳍缘，向下指向头像。
  //   气泡与箭头为一条连续路径，箭头开口处无边框重叠。
  function drawVoiceBubbleFor (pid, cx, cy, av, dir) {
    var vb = _voiceBubbles[pid];
    if (!vb) return;
    if (Date.now() > vb.until) { delete _voiceBubbles[pid]; return; }
    var rd = r();
    var font = '500 11px sans-serif';
    var maxTextW = 99;
    var lines = _wrapText(rd, vb.text, maxTextW, font);
    var lineH = 15, padX = 10, padY = 8;
    var textW = 0;
    for (var i = 0; i < lines.length; i++)
      textW = Math.max(textW, rd.glMeasureText(lines[i], font));
    var bw = textW + padX * 2;
    var bh = lines.length * lineH + padY * 2;
    var arrow = 6, arrowInset = 14, rad = 8;

    var arrowCX    = (dir === 'tl') ? (cx - av * 0.62) : (cx + av * 0.62);
    var apexY      = cy - av * 0.5;
    var bubbleBottom = apexY - arrow;
    var by = bubbleBottom - bh;
    var bx = (dir === 'tl') ? (arrowCX - bw + arrowInset) : (arrowCX - arrowInset);
    var tilt = (dir === 'tl') ? 2 : -2;

    // 气泡 + 箭头路径（填充 + 描边）
    rd.beginPath();
    rd.moveTo(bx+rad, by);
    rd.lineTo(bx+bw-rad, by);
    rd.arcTo(bx+bw, by, bx+bw, by+rad, rad);
    rd.lineTo(bx+bw, bubbleBottom-rad);
    rd.arcTo(bx+bw, bubbleBottom, bx+bw-rad, bubbleBottom, rad);
    rd.lineTo(arrowCX+arrow, bubbleBottom);
    rd.lineTo(arrowCX+tilt, apexY);
    rd.lineTo(arrowCX-arrow, bubbleBottom);
    rd.lineTo(bx+rad, bubbleBottom);
    rd.arcTo(bx, bubbleBottom, bx, bubbleBottom-rad, rad);
    rd.lineTo(bx, by+rad);
    rd.arcTo(bx, by, bx+rad, by, rad);
    rd.closePath();
    rd.fill('rgba(46,54,98,0.92)');
    rd.stroke('rgba(255,255,255,0.25)', 1);

    for (var j = 0; j < lines.length; j++) {
      rd.glFillText(lines[j], bx + padX, by + padY + lineH/2 + j*lineH,
        font, '#CCEEFF', 'left', 'middle');
    }
  }

  // 简易按宽度换行（中文逐字）
  function _wrapText (rd, text, maxW, font) {
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var t = cur + text[i];
      if (rd.glMeasureText(t, font) > maxW && cur) { lines.push(cur); cur = text[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // 圆角矩形填充（内部工具）
  function fillRR (rd, x, y, w, h, rv, color) {
    rd.fillRounded(x, y, w, h, rv, color);
  }

  // 该玩家的出牌飞行动画是否正在进行中（进行中则由动画绘制，静态展示先让位，避免叠影）
  function isFlyingFor (pid) {
    return !!(_curAnim && _curAnim.action === 'cardsPlayed' && _curAnim.actorId === pid);
  }

  // ── 出牌展示位中心坐标（vi: 0=自己 1=左对手 2=右对手）────────────
  // 与 drawOpponents / drawCenter 中的几何保持一致，供出牌飞行动画对齐落点。
  function trickSlotCenter (vi, cardCount) {
    var W = L.w, H = L.h;
    var pcW = L.playCardW || 40, pcH = L.playCardH || 59;
    var n = Math.max(1, cardCount || 1);
    var gap = PLAY_CARD_GAP;
    var pcTot = pcW + gap * (n - 1);
    if (vi === 0) {
      var slotBottom = L.actionBottomY || (L.actionY + 41);
      return { x: W / 2, y: slotBottom - pcH / 2 };
    }
    var pos = L.playerPos;
    var avR = L.otherAvR || 23;   // 与 drawOpponents 保持一致（原为 28，会导致 slotCY 偏移）
    var cx = pos[vi].x, cy = pos[vi].y;
    var nameY = cy + avR + 6;   // 与 drawOpponents 保持一致
    var badgeW = 30, badgeH = 40, badgeGap = 20, slotGap = 10;
    var badgeX = (vi === 2) ? (cx - avR - badgeGap - badgeW) : (cx + avR + badgeGap);
    var badgeY = nameY - badgeH;
    var slotCY = badgeY + badgeH / 2;
    var slotCX = (vi === 2) ? (badgeX - slotGap - pcTot / 2) : (badgeX + badgeW + slotGap + pcTot / 2);
    return { x: slotCX, y: slotCY };
  }

  // ── 倍数胶囊（Figma 913-2676）──────────────────────────────────
  // 结构：圆角胶囊(底=bean-multi-bg 切图 9 宫格) + 金色圆形"倍"字 + 倍数数字
  // 内容（倍圆+数字）在胶囊内水平居中、垂直居中（对称内边距）
  function drawMultiplierBadge (x, y, multiplier) {
    var rd = r();
    var circleImg = getGameImg('multiplierIcon');
    var pillH = 24, circleD = 20;
    var numFont = '500 14px sans-serif';
    var numStr = String(multiplier);
    var numW = rd.glMeasureText(numStr, numFont);
    var pad = 5;
    // 结构：[leftPad][icon][iconTextGap][text][rightPad]
    var leftPad = 7, iconTextGap = 6, rightPad = 10;
    var minPillW = leftPad + circleD + iconTextGap + numW + rightPad;
    var pillW = Math.max(minPillW, leftPad + circleD + iconTextGap + numW + rightPad);
    var pillX = x, pillY = y - pillH / 2;
    // 胶囊底：bean-multi-bg 切图 9 宫格（67×25，圆角 12 不变形；回退黑 10%）
    var pillBgImg = getGameImg('beanMultiBg');
    if (pillBgImg) {
      if (rd.glDrawImage9) rd.glDrawImage9(pillBgImg, pillX, pillY, pillW, pillH, 12, 12, 67, 25);
      else rd.glDrawImage(pillBgImg, pillX, pillY, pillW, pillH);
    } else {
      fillRounded(pillX, pillY, pillW, pillH, pillH / 2, 'rgba(0,0,0,0.10)');
    }
    var ccy = pillY + pillH / 2;
    // 图标固定左边距，文字在右侧剩余区域内居中
    var contentX = pillX + leftPad;
    var ccx = contentX + circleD / 2;
    if (circleImg) {
      rd.glDrawImage(circleImg, contentX, pillY + (pillH - circleD) / 2, circleD, circleD);
    } else {
      rd.beginPath(); rd.arc(ccx, ccy, circleD / 2, 0, Math.PI * 2);
      rd.fill('#FAE9AF');
      rd.glFillText('倍', ccx, ccy, '800 13px sans-serif', '#B56B0D', 'center', 'middle');
    }
    var textAreaLeft = contentX + circleD + iconTextGap;
    var textAreaW = pillW - leftPad - circleD - iconTextGap - rightPad;
    var textCX = textAreaLeft + textAreaW / 2;
    rd.glFillText(numStr, textCX, ccy, numFont, '#FAE9AF', 'center', 'middle');
    return pillW;
  }

  // ── 出牌轮次外圈高亮 ────────────────────────────────────────────
  function drawTurnRing (cx, cy, avR) {
    var rd = r();
    var sec2 = actionRemainingSec();
    var ringColor = sec2 <= 5 ? '#ef4444' : '#FFFFFF';
    var pulse2 = sec2 <= 5 ? 0.65 + 0.35 * Math.sin(Date.now() / 160) : 1;
    rd.save();
    rd.setAlpha(pulse2);
    rd.beginPath(); rd.arc(cx, cy, avR + 4, 0, Math.PI * 2);
    rd.stroke(ringColor, 2.5);
    rd.restore();
  }

  // ── 对手面板背景（Figma 130-2061 Rectangle 13：61×97 渐变烘焙切图）──
  // linear-gradient(180deg, rgba(27,33,55,0) 0%, rgba(27,33,55,0.30) 100%) × opacity 0.8，
  // 底部圆角 8、顶部平角；切图已烘焙全部效果，@3x 与 61×97 逻辑 1:1 直画。
  // 切图未加载时回退代码渐变。
  function drawOpponentPanelBg (cx, w, top, bottom) {
    var rd = r();
    var img = getGameImg('otherPanelBg');
    if (img) {
      rd.glDrawImage(img, cx - w / 2, top, w, bottom - top);
      return;
    }
    var x = cx - w/2, h = bottom - top, rv = 8;
    // 使用 fillRoundedGrad 实现真正的顶部透明→底部半透明渐变（底部仅 0.30，避免过重）
    if (rd.fillRoundedGrad) {
      rd.fillRoundedGrad(x, top, w, h, rv, 'rgba(27,33,55,0)', 'rgba(27,33,55,0.30)');
    } else {
      rd.fillRounded(x, top, w, h, rv, 'rgba(27,33,55,0.18)');
    }
  }

  // 绘制对手玩家（左 / 右）
  function drawOpponents () {
    var rd = r();
    var state = M3.Game.getState();
    if (!state) return;

    var pos = L.playerPos;
    var players = playersBySeat();
    var landlordId = state.dealer || '';

    players.forEach(function (p, i) {
      if (!p || i === 0) return;
      var isTurn    = state.currentPlayerId === p.id
                   || (state.bidState && state.bidState.currentPlayerId === p.id)
                   || (state.phase === 'doubling' && state.doublingPlayerId === p.id);
      var isLandlord = (landlordId === '*' ? p.role === 'landlord' : (p.id === landlordId && p.role === 'landlord'));
      var avR = L.otherAvR || 23;
      var cx  = pos[i].x, cy = pos[i].y;

      // Figma 130-2061 Player Areas（61×97）：头像 46 居中（顶距面板 4.09）、
      // 昵称 10px/500/白（头像底 +6）、豆子胶囊 49×16（底距面板底 5.91）
      var panelW = 61;
      var panelTop = cy - avR - 4.09;
      var panelBottom = panelTop + 97;
      var nameY = cy + avR + 6;
      var beanY = panelBottom - 21.91;   // 胶囊顶：底距 5.91 + 高 16

      drawOpponentPanelBg(cx, panelW, panelTop, panelBottom);
      drawAvatar(cx, cy, avR, p.avatarUrl, p.name, false);
      if (isLandlord) drawLandlordHat(cx, cy, avR, i === 2);

      var statusSuffix = p.autoManaged ? ' 🤖' : (!p.connected ? ' ⚡' : '');
      rd.glFillText((p.name || '玩家') + statusSuffix, cx, nameY,
        '500 10px sans-serif', '#ffffff', 'center', 'top');
      drawBeanCount(cx, beanY, typeof p.beans === 'number' ? p.beans : 0);

      if (typeof state.handCounts !== 'undefined' && typeof state.handCounts[p.id] === 'number') {
        var badgeW = 30, badgeH = 40, badgeGap = 20;
        var badgeX = (i === 2) ? (cx - avR - badgeGap - badgeW) : (cx + avR + badgeGap);
        var badgeY = nameY - badgeH;
        drawCardCountBadge(badgeX, badgeY, state.handCounts[p.id]);

        var slotGap = 10;
        var slotCX = (i === 2) ? (badgeX - slotGap - 24) : (badgeX + badgeW + slotGap + 24);
        var slotCY = badgeY + badgeH / 2;
        var tp = getTrickPlay(p.id);
        if (isTurn && (state.phase === 'bidding' || state.phase === 'playing' || state.phase === 'doubling')) {
          var tSize = 41;
          var tX = (i === 2) ? (badgeX - slotGap - tSize) : (badgeX + badgeW + slotGap);
          var tY = badgeY + (badgeH - tSize) / 2;
          drawTimerButton(tX, tY, tSize, actionRemainingSec());
        } else if (tp && tp.kind === 'play' && tp.cards && tp.cards.length && !isFlyingFor(p.id)) {
          var pcW = L.playCardW || 40;
          var pcTot = pcW + PLAY_CARD_GAP * (tp.cards.length - 1);
          var pcCX = (i === 2) ? (badgeX - slotGap - pcTot/2) : (badgeX + badgeW + slotGap + pcTot/2);
          drawPlayedCards(pcCX, slotCY, tp.cards);
        } else if (tp && tp.kind === 'pass') {
          // 加倍/出牌阶段不再展示叫地主阶段遗留的「不叫」「不抢」标签
          var isBidLabel = (tp.label === '不叫' || tp.label === '不抢');
          if (!isBidLabel || state.phase === 'bidding') {
            drawPassText(slotCX, slotCY, tp.label);
          }
        }
      }

      drawVoiceBubbleFor(p.id, cx, cy, avR, i === 2 ? 'tl' : 'tr');
    });
  }

  // 绘制自己（在手牌之上，压过手牌）
  function drawSelfPlayer () {
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    if (!state) return;

    var players = playersBySeat();
    var p = players[0];
    if (!p) return;

    var landlordId = state.dealer || '';
    var isLandlord = landlordId === '*' ? p.role === 'landlord' : (p.id === landlordId && p.role === 'landlord');
    var selfAvR = L.selfAvR || 34;
    var cx  = L.playerPos[0].x;
    var cy  = L.playerPos[0].y;

    drawAvatar(cx, cy, selfAvR, p.avatarUrl, p.name, true);
    if (isLandlord) drawLandlordHat(cx, cy, selfAvR);
    var infoX = cx + selfAvR + 12;
    var beanRowY = cy + selfAvR - 12;
    // 豆子显示优先取钱包（到账推送即时刷新：买豆/兑换/充值自动兑换），
    // state.players[].beans 是快照，只在开局/结算等时机同步
    var _wl = M3.Game.getWallet && M3.Game.getWallet();
    var myBeans = (_wl && typeof _wl.beans === 'number')
      ? _wl.beans
      : (typeof p.beans === 'number' ? p.beans : 0);
    // 底部胶囊行：豆子(+号) → gap → 钻石(+号) → gap → 倍数（与主页胶囊交互一致，点击弹商城）
    var beanW = drawBeanCountLeft(infoX, beanRowY, myBeans);
    var dW = drawDiamondCountLeft(infoX + beanW + 6, beanRowY);
    if (state.round && state.round.multiplier >= 1) {
      drawMultiplierBadge(infoX + beanW + 6 + dW + 6, beanRowY, state.round.multiplier);
    }
    drawVoiceBubbleFor(p.id, cx, cy, selfAvR, 'tr');
  }

  // 钻石余额胶囊（与主页同款：胶囊底 + 钻石 icon + + 角标 + 余额，点击弹商城钻石 Tab）
  function drawDiamondCountLeft (leftX, cy) {
    var rd = r();
    var hb = rd.getHitBtns();
    var dImg = getGameImg('diamondIcon');
    var bgImg = getGameImg('beanMultiBg');
    var plusImg = getGameImg('iconPlus');
    var wallet = M3.DiamondWallet && M3.DiamondWallet.getState
      ? M3.DiamondWallet.getState()
      : { ready: false, balance: '0' };
    var countStr = wallet.ready ? M3.DiamondWallet.format(wallet.balance) : '--';
    var font = '800 16px sans-serif';   // 与主页胶囊字号一致（写死）
    var textW = rd.glMeasureText(countStr, font);
    var pillH = 29;    // 与主页胶囊高度一致（写死）
    var leftPad = 7, iconTextGap = 6, rightPad = 10;
    var iconH = 26;   // 与主页钻石 icon 一致（写死），宽度按图片原始宽高比等比缩放（正比例，不拉伸）
    var iconW = iconH;
    if (dImg && (dImg.naturalWidth || dImg.width) && (dImg.naturalHeight || dImg.height)) {
      iconW = Math.round(iconH * (dImg.naturalWidth || dImg.width) / (dImg.naturalHeight || dImg.height));
    }
    var minPillW = leftPad + iconW + iconTextGap + textW + rightPad;
    var pillW = Math.max(67, minPillW);
    var pillX = leftX, pillY = cy - pillH / 2;
    if (bgImg) {
      if (rd.glDrawImage9) rd.glDrawImage9(bgImg, pillX, pillY, pillW, pillH, 12, 12, 67, 25);
      else rd.glDrawImage(bgImg, pillX, pillY, pillW, pillH);
    } else {
      fillRounded(pillX, pillY, pillW, pillH, pillH / 2, 'rgba(255,255,255,0.10)');
      strokeRounded(pillX, pillY, pillW, pillH, pillH / 2, 'rgba(255,255,255,0.50)', 1);
    }
    var iconX = pillX + leftPad;
    var iconY = pillY + (pillH - iconH) / 2;
    if (dImg) rd.glDrawImage(dImg, iconX, iconY, iconW, iconH);
    // 钻石 icon 右下角 + 角标（与主页同款锚点：y 锚在图标底边而非胶囊底边）
    if (plusImg) {
      var plusSz = 18;   // 与主页 ➕ 一致（写死）
      rd.glDrawImage(plusImg,
        iconX + iconW - plusSz * 0.55 - 5.5, pillY + (pillH + iconH) / 2 - plusSz * 0.55 - 3,
        plusSz, plusSz);
    }
    var textAreaLeft = iconX + iconW + iconTextGap;
    var textAreaW = pillW - leftPad - iconW - iconTextGap - rightPad;
    rd.glFillText(countStr, textAreaLeft + textAreaW / 2, pillY + pillH / 2,
      font, '#FAE9AF', 'center', 'middle');
    // 点击钻石胶囊 → 打开商城钻石 Tab（Tab 0）
    hb.push({ x: pillX, y: pillY, w: pillW, h: pillH, label: 'game_diamond_pill',
      onClick: function () { if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(0); } });
    return pillW;
  }

  // 铁豆数量（左对齐版本，用于自己；胶囊 bean-multi-bg 9宫格 + icon 18 + 数字 14px/800/白）
  function drawBeanCountLeft (leftX, cy, count) {
    var rd = r();
    var beanImg = getGameImg('beanIcon');
    var bgImg = getGameImg('beanMultiBg');
    var iconSize = 21;   // 与主页铁豆 icon 一致（写死）
    var countStr = M3.Game.formatBeans(count);
    var font = '800 16px sans-serif';   // 与主页胶囊字号一致（写死）
    var textW = rd.glMeasureText(countStr, font);
    var pillH = 29;    // 与主页胶囊高度一致（写死）
    // 结构：[leftPad][icon][iconTextGap][text][rightPad]
    var leftPad = 7, iconTextGap = 6, rightPad = 10;
    var minPillW = leftPad + iconSize + iconTextGap + textW + rightPad;
    var pillW = Math.max(67, minPillW);
    var pillX = leftX, pillY = cy - pillH/2;
    if (bgImg) {
      if (rd.glDrawImage9) rd.glDrawImage9(bgImg, pillX, pillY, pillW, pillH, 12, 12, 67, 25);
      else rd.glDrawImage(bgImg, pillX, pillY, pillW, pillH);
    } else {
      fillRounded(pillX, pillY, pillW, pillH, pillH/2, 'rgba(255,255,255,0.10)');
      strokeRounded(pillX, pillY, pillW, pillH, pillH/2, 'rgba(255,255,255,0.50)', 1);
    }
    // 图标固定左边距
    var iconX = pillX + leftPad;
    var iconY = pillY + (pillH - iconSize) / 2;
    if (beanImg) {
      rd.glDrawImage(beanImg, iconX, iconY, iconSize, iconSize);
    } else {
      rd.glFillText('🪙', iconX, pillY + pillH/2,
        iconSize + 'px sans-serif', '#FAE9AF', 'left', 'middle');
    }
    // 豆子 icon 右下角 + 角标（与主页同款锚点：y 锚在图标底边而非胶囊底边）
    var plusImg = getGameImg('iconPlus');
    if (plusImg) {
      var pSz = 18;   // 与主页 ➕ 一致（写死）
      rd.glDrawImage(plusImg,
        iconX + iconSize - pSz * 0.55 - 3, pillY + (pillH + iconSize) / 2 - pSz * 0.55 - 3,
        pSz, pSz);
    }
    // 数字：图标右边固定 gap 后居中于剩余区域
    var textAreaLeft = iconX + iconSize + iconTextGap;
    var textAreaW = pillW - leftPad - iconSize - iconTextGap - rightPad;
    var textCX = textAreaLeft + textAreaW / 2;
    rd.glFillText(countStr, textCX, pillY + pillH/2,
      font, '#FAE9AF', 'center', 'middle');
    // 点击豆子胶囊 → 打开商城铁豆 Tab（与主页一致）
    rd.getHitBtns().push({ x: pillX, y: pillY, w: pillW, h: pillH, label: 'game_bean_pill',
      onClick: function () { if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(1); } });
    return pillW;
  }

  // ── 全局弱样式回合提示 ──────────────────────────────────────────
  function drawTurnBanner () {
    var rd = r();
    var W = L.w;
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    if (!state || !(state.phase === 'bidding' || state.phase === 'doubling' || state.phase === 'playing')) return;

    var actorId = turnActorId();
    if (!actorId) return;
    var isMe = actorId === myId;
    var sec  = actionRemainingSec();

    var bannerText;
    if (state.phase === 'bidding') {
      if (isMe) {
        bannerText = '';
      } else {
        var actor = state.players[actorId];
        var aName = actor ? actor.name : '...';
        bannerText = (actor && actor.autoManaged ? aName + ' 托管叫地主' : '等待 ' + aName + ' 叫地主') + ' · ' + sec + 's';
      }
    } else if (state.phase === 'doubling') {
      if (isMe) {
        bannerText = '';
      } else {
        bannerText = '';
      }
    } else {
      if (isMe) {
        var canPass = state.lastPlay && state.lastPlay.playerId !== myId;
        bannerText = '轮到你出牌 · ' + sec + 's 后自动' + (canPass ? '处理' : '出牌');
      } else {
        var actor2 = state.players[actorId];
        var aName2 = actor2 ? actor2.name : '...';
        bannerText = (actor2 && actor2.autoManaged ? aName2 + ' 超时托管出牌' : '等待 ' + aName2 + ' 出牌') + ' · ' + sec + 's';
      }
    }
    rd.glFillText(bannerText, W/2, (L.playInfoY || L.h * 0.55) - 62,
      '500 13px sans-serif', 'rgba(255,255,255,0.55)', 'center', 'middle');
  }

  // ── 手牌区域（区域更新由 render.js 记录 hitBtns） ──────────────
  function drawHand () {
    var W = L.w, H = L.h;
    var myId = M3.Game.getMyPlayerId();
    var hand = M3.Game.getHand();
    var selectedIds = M3.Game.getSelectedIds();
    if (!myId || hand.length === 0) return;

    var cw = L.cardW, ch = L.cardH;
    var n = hand.length;

    // 步进间距：与牌宽等比，保证不同分辨率下露出宽度的视觉比例完全一致
    var overlap = cw * HAND_GAP_RATIO;

    var tw = cw + overlap * (n - 1);
    var sx = (W - tw) / 2;
    var y  = L.handY;

    // 拖拽选牌进行中：仅【本次手势正在划过】的牌覆盖半透明蒙层（#1B2137 @50%、圆角 5）
    // 且不提起；之前已选中的牌保持提起 8px 不动，避免新手势开始时其他已选牌集体跳动。
    var selecting = M3.Input && M3.Input.isSelecting && M3.Input.isSelecting();

    hand.forEach(function (card, i) {
      var sel = !!selectedIds[card.id];
      // 是否属于本次手势正在划过的牌：只有它在拖拽中显示「落下+蒙层」。
      var inGesture = selecting && M3.Input.isInCurrentGesture && M3.Input.isInCurrentGesture(i);
      var lifted = sel && !inGesture;
      var x = sx + i * overlap;
      var cy = y - (lifted ? 8 : 0);
      // Fast 路径：sprite 缓存烘焙整张牌面（选中态由外部上移/蒙层实现，与牌面无关）
      M3.Render.drawCardFast(x, cy, card, cw, ch);
      if (sel && inGesture) {
        // 蒙层：#1B2137 @50%，直接撑满整张牌（新 card-face.png 378×547@3x 无透明边）。
        // 圆角按牌身圆角同心：Figma Radius 30@3x → 10 逻辑 / 126 逻辑宽。
        var rd2 = r();
        rd2.fillRounded(x, cy, cw, ch, Math.max(2, cw * 10 / 126), 'rgba(27,33,55,0.5)');
      }
      handHits().push({ x: x, y: cy, w: i === hand.length - 1 ? cw : overlap, h: ch, id: card.id, index: i });
    });

    // 地主角标：自己是地主时，在最右边那张牌右上角画斜切角标
    var state2 = M3.Game.getState();
    var myId2 = myId;
    if (state2 && state2.dealer && state2.players && state2.players[myId2] &&
        state2.players[myId2].role === 'landlord' && hand.length > 0) {
      var badgeImg = getGameImg('landlordBadge');
      if (badgeImg) {
        var lastIdx = hand.length - 1;
        var lastSel = !!selectedIds[hand[lastIdx].id];
        var lastInGesture = selecting && M3.Input.isInCurrentGesture && M3.Input.isInCurrentGesture(lastIdx);
        var lastLifted = lastSel && !lastInGesture;
        var lastX = sx + lastIdx * overlap;
        var lastY = y - (lastLifted ? 8 : 0);
        // 角标尺寸：以牌宽的 50% 为绘制宽，高度按切图固定比例 126/117 计算。
        // 不使用 badgeImg.width/height（不同平台报值不一致：浏览器/iOS 可能返回
        // 物理像素或 0，安卓可能返回逻辑像素），hard-code 已知的切图尺寸 117×126。
        var badgeDrawW = Math.round(cw * 0.5);
        var badgeDrawH = Math.round(badgeDrawW * 126 / 117);
        // 贴在牌右上角
        r().glDrawImage(badgeImg, lastX + cw - badgeDrawW, lastY, badgeDrawW, badgeDrawH);
      }
    }
  }

  // ── 中央区域（自己本轮出牌 / 不出 展示 + 结算 overlay） ─────────
  // Req3：出完牌后，把出的牌展示在自己牌堆上方（原出牌按钮区域内），
  //       出牌牌面 40x59，底部与「原出牌按钮区域底部」(L.actionBottomY) 对齐。
  //       不出时在同一位置展示「不出」文字。轮到自己时该位由 drawActions 的
  //       按钮/闹钟占据，因此这里仅在「非自己回合」时展示。
  function drawCenter () {
    var W = L.w, H = L.h;
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    var pcy = L.playInfoY || L.centerY;

    // ── 自己：本轮出牌/不出，展示在手牌上方（底部与出牌按钮区底部对齐）──
    var isMyTurn = (state.phase === 'playing' && state.currentPlayerId === myId) ||
                   (state.phase === 'bidding' && state.bidState && state.bidState.currentPlayerId === myId);
    if (myId && !state.result && !isMyTurn) {
      var myTp = _trickPlays[myId];
      var slotBottom = L.actionBottomY || (L.actionY + 41);
      if (myTp && myTp.kind === 'play' && myTp.cards && myTp.cards.length && !isFlyingFor(myId)) {
        var ch = L.playCardH || 59;
        drawPlayedCards(W / 2, slotBottom - ch / 2, myTp.cards);
      } else if (myTp && myTp.kind === 'pass') {
        var isBidPassLabel = (myTp.label === '不叫' || myTp.label === '不抢');
        if (!isBidPassLabel || state.phase === 'bidding') {
          drawPassText(W / 2, slotBottom - 14, myTp.label);
        }
      }
    }

  }

  // ── 操作按钮区 ──────────────────────────────────────────────────
  function drawTimerButton (x, y, size, sec) {
    var rd = r();
    var timerImg = getGameImg('iconTimer');
    if (timerImg) {
      var iw = timerImg.width || size, ih = timerImg.height || size;
      var sc = Math.min(size/iw, size/ih);
      var dw = iw*sc, dh = ih*sc;
      rd.glDrawImage(timerImg, x + (size-dw)/2, y + (size-dh)/2, dw, dh);
    } else {
      rd.beginPath(); rd.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
      rd.fill('#f97316');
    }
    // 倒计时数字：#CB3212、15px/800；钟面中心较几何中心略偏下（icon 下圆上铃铛）
    rd.glFillText(String(sec), x + size/2, y + size/2 + size*0.05,
      '800 ' + Math.floor(size*0.33) + 'px sans-serif', '#CB3212', 'center', 'middle');
  }

  function drawChatButton (x, y) {
    // 按钮始终显示：语音配置（voiceConfig）由服务端在登录/进房后才下发，
    // 以 isAvailable() 为显示门槛会导致进界面后按钮延迟数秒才出现。
    // 配置未就绪时点击由 SceneVoice.show() 兜底（主动拉取 + 提示加载中）。
    var rd = r();
    var chatImg = getGameImg('btnChat');
    var btnW = 76, btnH = 34;
    rd.save();
    applyPressScale('chat', x + btnW / 2, y + btnH / 2);
    if (chatImg) {
      rd.glDrawImage(chatImg, x, y, btnW, btnH);
    }
    // 图片未就绪时不画 fallback，直接跳过渲染（避免绿色色块 → 切图切换产生缩放感）
    rd.restore();
    _chatBtnRect = { x:x, y:y, w:btnW, h:btnH };
    hitBtns().push({ x:x, y:y, w:btnW, h:btnH, label:'chat', onClick: function () {
      if (M3.SceneVoice && M3.SceneVoice.show) M3.SceneVoice.show();
    }});
  }

  function drawGameBtn (x, y, w, h, label, onClick, disabled, style) {
    var rd = r();
    var sz = Math.min(16, Math.floor(h * 0.38));
    rd.save();
    if (disabled) {
      rd.setAlpha(0.45);
      fillRounded(x, y, w, h, h/2, '#334155');
      rd.setAlpha(1);
      rd.glFillText(String(label), x+w/2, y+h/2,
        '800 '+sz+'px sans-serif', '#64748b', 'center', 'middle');
    } else {
      applyPressScale(label, x + w / 2, y + h / 2);
      var c1, c2, textColor, strokeColor;
      if (style === 'blue') {
        c1 = '#38bdf8'; c2 = '#0ea5e9'; textColor = '#ffffff'; strokeColor = '#075985';
      } else if (style === 'gold') {
        c1 = '#fbbf24'; c2 = '#f59e0b'; textColor = '#1f2937'; strokeColor = '#b45309';
      } else {
        c1 = '#64748b'; c2 = '#475569'; textColor = '#f1f5f9'; strokeColor = '#1e293b';
      }
      rd.fillRounded(x, y, w, h, h/2, c2);
      if (rd.glFillTextStroke) {
        rd.glFillTextStroke(String(label), x+w/2, y+h/2,
          '800 '+sz+'px sans-serif', textColor, strokeColor, Math.max(2.5, sz * 0.16), 'center', 'middle');
      } else {
        rd.glFillText(String(label), x+w/2, y+h/2,
          '800 '+sz+'px sans-serif', textColor, 'center', 'middle');
      }
      hitBtns().push({ x:x, y:y, w:w, h:h, onClick:onClick, label:label });
    }
    rd.restore();
  }

  // 震动时机状态：叫分回合切换 / 倒计时秒变化检测（防同秒多帧重复震）
  var _lastBidTurnMe = false;
  var _lastTickSec = -1;

  function drawActions () {
    var W = L.w, H = L.h;
    var state = M3.Game.getState();
    var myId  = M3.Game.getMyPlayerId();
    var selectedIds = M3.Game.getSelectedIds();
    if (!myId || !state || !state.players[myId]) return;
    var me = state.players[myId];
    var y  = L.actionY;

    // ── 震动时机（时机表：轮到我叫分 弱；倒计时最后 3 秒 弱×1/秒 仅轮到我）──
    var bidTurnMe = state.phase === 'bidding' && state.bidState && state.bidState.currentPlayerId === myId;
    if (bidTurnMe && !_lastBidTurnMe && M3.Vibrate) M3.Vibrate.light();   // 轮到我叫分：配合倒计时启动
    _lastBidTurnMe = bidTurnMe;

    var myTurnNow = bidTurnMe
      || (state.phase === 'doubling' && state.doublingPlayerId === myId)
      || (state.phase === 'playing' && state.currentPlayerId === myId);
    if (myTurnNow) {
      var tickSec = actionRemainingSec();
      if (tickSec >= 1 && tickSec <= 3 && tickSec !== _lastTickSec) {
        _lastTickSec = tickSec;
        if (M3.Vibrate) M3.Vibrate.light();
      }
    } else {
      _lastTickSec = -1;   // 非我回合重置，下个回合重新按秒变化触发
    }

    if (state.phase === 'waiting') {
      ctext(W / 2, y, '等待剩余玩家加入房间…', 16, C().textMuted || '#94a3b8');
    } else if (state.phase === 'settlement') {
      // 结算阶段的按钮由 drawSettlement() 渲染（右下角「继续游戏」），此处不重复绘制
    } else if (state.phase === 'ready') {
      // 准备（teal 色，形状同「不出/提示/出牌」）
      M3.UIButton.draw({
        x: W / 2 - 50, y: y + 2, w: 100, h: 34,
        label: me.ready ? '取消准备' : '再来一局',
        style: me.ready ? 'gray' : 'teal',
        onClick: function () { M3.Network.send('setReady', { ready: !me.ready }); }
      });
    } else if (state.phase === 'bidding' && state.bidState && state.bidState.currentPlayerId === myId) {
      var bidSec = actionRemainingSec();
      var bidPhase = state.bidState.phase || 'calling';
      var bidPrompt = bidPhase === 'calling' ? '叫地主' : (bidPhase === 'robbing' ? '抢地主' : '首叫确认');
      // 不显示文案，直接画按钮+闹钟（与出牌阶段尺寸一致）
      var bidBtnW = 90, bidBtnH = 36, bidBtnGap = 16;
      var timerSz = 45;   // 与出牌阶段闹钟同尺寸
      var bidTotal = bidBtnW + bidBtnGap + timerSz + bidBtnGap + bidBtnW;
      var bidStartX = W / 2 - bidTotal / 2;
      var callLabel = bidPhase === 'calling' ? '叫地主' : (bidPhase === 'final_confirm' ? '继续抢地主' : '抢地主');
      var passLabel = bidPhase === 'calling' ? '不叫' : '不抢';
      M3.UIButton.draw({
        x: bidStartX, y: y, w: bidBtnW, h: bidBtnH,
        label: passLabel, style: 'blue',
        onClick: function () { M3.Network.send('bid', { score: 0 }); }
      });
      // 闹钟居中于两按钮之间
      drawTimerButton(bidStartX + bidBtnW + bidBtnGap, y + (bidBtnH - timerSz) / 2, timerSz, bidSec);
      M3.UIButton.draw({
        x: bidStartX + bidBtnW + bidBtnGap + timerSz + bidBtnGap, y: y, w: bidBtnW, h: bidBtnH,
        label: callLabel, style: 'gold',
        onClick: function () {
          if (M3.Vibrate) M3.Vibrate.medium();
          M3.Network.send('bid', { score: 1 });
        }
      });
    } else if (state.phase === 'bidding' && state.bidState) {
      // 等待他人叫/抢地主：对手头像旁已有闹钟，这里不重复显示
    } else if (state.phase === 'doubling' && state.doublingPlayerId === myId) {
      // 加倍阶段：地主看底牌后选择加倍选项
      var dblSec = actionRemainingSec();
      var dblBtnW = 90, dblBtnH = 36, dblBtnGap = 12;
      var timerSzD = 45;   // 与出牌阶段闹钟同尺寸，不显示文案
      // 布局：不加倍 | 闹钟 | 加倍×2 | 超级×4
      var dblTotal = dblBtnW + dblBtnGap + timerSzD + dblBtnGap + dblBtnW + dblBtnGap + dblBtnW;
      var dblStartX = W / 2 - dblTotal / 2;
      var dblDefs = [
        { multiplier: 1, label: '不加倍', style: 'blue' },
        { multiplier: 2, label: '加倍×2', style: 'gray' },
        { multiplier: 4, label: '超级×4', style: 'gold' },
      ];
      // 第一个按钮（不加倍）
      (function(def) {
        M3.UIButton.draw({
          x: dblStartX, y: y, w: dblBtnW, h: dblBtnH,
          label: def.label, style: def.style,
          onClick: function () {
            if (M3.Vibrate) M3.Vibrate.light();
            M3.Network.send('double', { multiplier: def.multiplier });
          }
        });
      })(dblDefs[0]);
      // 闹钟在第一个按钮后
      drawTimerButton(dblStartX + dblBtnW + dblBtnGap, y + (dblBtnH - timerSzD) / 2, timerSzD, dblSec);
      // 后两个按钮
      [dblDefs[1], dblDefs[2]].forEach(function (def, i) {
        var bx = dblStartX + dblBtnW + dblBtnGap + timerSzD + dblBtnGap + i * (dblBtnW + dblBtnGap);
        M3.UIButton.draw({
          x: bx, y: y, w: dblBtnW, h: dblBtnH,
          label: def.label, style: def.style,
          onClick: function () {
            if (M3.Vibrate) {
              if (def.multiplier === 4) M3.Vibrate.heavy();
              else M3.Vibrate.medium();
            }
            M3.Network.send('double', { multiplier: def.multiplier });
          }
        });
      });
    } else if (state.phase === 'doubling' && state.doublingPlayerId) {
      // 等待地主加倍：对手头像旁已有闹钟，这里不重复显示
    } else if (state.phase === 'playing' && state.currentPlayerId === myId) {
      var selectedCount = Object.keys(selectedIds).length;
      var actY = L.actionY;
      var playSec = actionRemainingSec();
      var canPass = state.lastPlay && state.lastPlay.playerId !== myId;
      var timerBtnSize = 45;   // 闹钟倒计时大小 45x45
      var btnW = 87, btnH = 34, btnGap = 8;
      // 整体水平居中：不出 + gap + timer + gap + 提示 + gap + 出牌
      var totalW = btnW * 3 + btnGap * 3 + timerBtnSize;
      var startX = W / 2 - totalW / 2;
      drawTimerButton(startX + btnW + btnGap, actY + 1 - (timerBtnSize - btnH) / 2, timerBtnSize, playSec);
      var passDisabled = !state.lastPlay || state.lastPlay.playerId === myId;
      M3.UIButton.draw({
        x: startX, y: actY, w: btnW, h: btnH,
        label: '不出', style: 'blue',
        onClick: function () {
          if (!passDisabled) M3.Network.send('pass');
        }
      });
      M3.UIButton.draw({
        x: startX + btnW + btnGap + timerBtnSize + btnGap, y: actY, w: btnW, h: btnH,
        label: '提示', style: 'teal',
        onClick: function () { M3.Game.hintCards(); }
      });
      M3.UIButton.draw({
        x: startX + btnW + btnGap + timerBtnSize + btnGap + btnW + btnGap, y: actY, w: btnW, h: btnH,
        label: '出牌', style: 'gold', disabled: selectedCount === 0,
        onClick: function () {
          if (selectedCount === 0) return;
          var cardIds = Object.keys(selectedIds);
          // 客户端出牌校验：牌型非法或压不过上家 → 回收选中牌并提示「不符合规则」。
          // （「你没有大过对家的牌」仅在回合开始即无任何可压牌时提示，见 main.js state 回调）
          var picked = (M3.Game.getHand() || []).filter(function (cd) { return selectedIds[cd.id]; });
          var analysis = M3.Rule.analyzePlay(picked);
          var prev = (state.lastPlay && state.lastPlay.playerId !== myId) ? (state.lastPlay.analysis || null) : null;
          if (!analysis || (prev && !M3.Rule.canBeat(analysis, prev))) {
            M3.Game.clearSelected();
            if (M3.Vibrate) M3.Vibrate.err();   // 出牌失败：中×2 双震（通用错误语义）
            showRuleTip('你选择的牌不符合规则');
            return;
          }
          M3.Network.send('playCards', { cardIds: cardIds });
          // 出牌成功（普通牌型）弱×1；特殊牌型（炸弹/王炸/飞机）由 handleAction 按牌型补强档
          if (M3.Vibrate) M3.Vibrate.light();
        }
      });
    }

    // 聊天/语音按钮：叫地主(bidding)/加倍(doubling) 与 出牌(playing) 阶段均展示
    if (state.phase === 'bidding' || state.phase === 'doubling' || state.phase === 'playing') {
      drawChatButton(W * 0.855 - 38, H - 34 - 14);
    }
  }

  // ── 动画（从 render.js 迁移过来） ──────────────────────────────
  var _animQueue = [], _curAnim = null, _animStart = 0;
  var _seenIds = {}, _recentIds = [];

  // ── 本轮出牌/不出的「逐玩家」展示状态 ─────────────────────────────
  // key = playerId，value = { kind: 'play', cards: [...] } 或 { kind: 'pass' }
  // 出牌 → 记录该玩家出的牌；不出 → 记录 pass；一墩结束(trickCleared)/新局/结算
  // 时清空。渲染时：轮到该玩家展示闹钟；否则展示其出的牌 / 「不出」文字。
  var _trickPlays = {};
  function resetTrickPlays () { _trickPlays = {}; }

  function easeOutCubic (t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut (t)    { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function enqueueAnimation (act) {
    var state = M3.Game.getState();
    var myId = M3.Game.getMyPlayerId();   // 震动时机判定（我出/对手出、成地主、抢地主）用
    // ── 逐玩家出牌/不出展示状态维护（在任何 early-return 之前，保证自己的不出也被记录）──
    if (act.action === 'cardsPlayed') {
      _trickPlays[act.actorId] = { kind: 'play', cards: act.cards || [] };
    } else if (act.action === 'playerPassed') {
      _trickPlays[act.actorId] = { kind: 'pass', label: '不出' };
    } else if (act.action === 'bidPlaced') {
      // 竞叫阶段：不叫（score 0）→ 在该玩家牌堆旁展示「不叫」；叫分（score>0）→ 清除其展示
      if ((act.value || 0) === 0) {
        _trickPlays[act.actorId] = { kind: 'pass', label: '不叫' };
      } else {
        delete _trickPlays[act.actorId];
      }
      // 有人抢地主（非我 + 有效叫分 + robbing/final_confirm 阶段）→ 压力提示 中×1
      if (act.actorId !== myId && (act.value || 0) > 0 && act.bidPhase !== 'calling') {
        if (M3.Vibrate) M3.Vibrate.medium();
      }
    } else if (act.action === 'trickCleared' || act.action === 'dealStarted' ||
               act.action === 'roundSettled' || act.action === 'landlordAssigned') {
      resetTrickPlays();
      // 我成为地主（底牌翻开）：局内第一个「强」
      if (act.action === 'landlordAssigned' && act.actorId === myId && M3.Vibrate) {
        M3.Vibrate.heavy();
      }
    }
    // 定地主不做飞行/脉冲动画：底牌直接显示在顶部 header（避免开局闪烁）
    if (act.action === 'landlordAssigned') return;
    // 「不出」不再弹居中动画（改为在各玩家牌堆旁展示「不出」文字），但语音所有人都能听到
    if (act.action === 'playerPassed') {
      var vk = Math.random() < 0.5 ? 'buyao' : 'guo';
      M3.VoicePack.play(vk);
      return; // 不出不再入队居中动画（自己 & 他人都改为逐玩家文字展示）
    }
    // 一墩打完不再弹居中「新一轮」提示（trickPlays 已在上面重置）
    if (act.action === 'trickCleared') return;
    // 去重 id：加入「牌面内容签名」，避免 notice 早于 state 到达、actionSeq 尚未
    // 递增时，同一玩家连续两手牌算出相同 id 而被误去重（导致「某些出牌没有动效」）。
    var sig = '';
    if (act.cards && act.cards.length) {
      for (var si = 0; si < act.cards.length; si++) {
        sig += (act.cards[si].id != null ? act.cards[si].id : (act.cards[si].rank + '' + act.cards[si].suit)) + ',';
      }
    }
    var id = act.action + '_' + act.actorId + '_' +
             (state ? state.round.number + '_' + state.actionSeq : Date.now()) + '_' + sig;
    if (_seenIds[id]) return;
    _seenIds[id] = true; _recentIds.push(id);
    if (_recentIds.length > 128) delete _seenIds[_recentIds.shift()];
    var major = ['dealStarted', 'landlordAssigned', 'roundSettled'].indexOf(act.action) >= 0;
    var dur = major ? 1050 : act.action === 'playerPassed' ? 900 : act.action === 'cardsPlayed' ? 520 : 420;
    _animQueue.push({ action: act.action, actorId: act.actorId, cards: act.cards, label: act.label, id: id, duration: dur, blocking: major || act.action === 'cardsPlayed' || act.action === 'playerPassed' });
    M3.log && M3.log('ANIM', 'enqueue', { action: act.action });

    // ── 语音播放（全部由 socket 消息驱动，不依赖本地点击）──
    if (act.action === 'roundSettled') {
      // yujie 语音包无地主/农民胜利音效，跳过
      return;
    }
    if (act.action === 'bidPlaced') {
      // value: 0=不叫/不抢, 1=叫/抢；bidPhase: 'calling'=叫地主阶段, 'robbing'/'final_confirm'=抢地主阶段
      var bVal = act.value || 0;
      var bPhase = act.bidPhase || 'calling';
      var bk;
      if (bVal === 0) {
        bk = bPhase === 'calling' ? 'bujiao' : 'buqiang';
      } else {
        // 叫/抢：calling 阶段用 jiaodizhu，robbing/final_confirm 随机用 qiangdizhu/woqiang
        bk = bPhase === 'calling' ? 'jiaodizhu' : (Math.random() < 0.5 ? 'qiangdizhu' : 'woqiang');
      }
      M3.VoicePack.play(bk);
      return;
    }
    if (act.action === 'doubleApplied') {
      // value: 1=不加倍, 2=加倍, 4=超级加倍
      var dVal = act.value || 1;
      var dk = dVal >= 4 ? 'superjiabei' : (dVal >= 2 ? 'jiabei' : 'bujiabei');
      M3.VoicePack.play(dk);
      return;
    }
    if (act.action === 'cardsPlayed') {
      var rank = act.cards && act.cards.length > 0 ? act.cards[0].rank : undefined;
      M3.VoicePack.playForHandType(act.playType || act.label, rank);

      // ── 特殊牌型 + 报单 震动（时机表第四节/第五节）──
      var pt = act.playType || '';
      if (act.actorId === myId) {
        // 我出：王炸「轰—嗡」两段式 / 炸弹 强 / 飞机 中×3 起飞节奏
        if (M3.Vibrate) {
          if (pt === 'rocket') M3.Vibrate.pattern([{ tier: 'strong', at: 0 }, { tier: 'light', at: 250 }]);
          else if (pt === 'bomb') M3.Vibrate.heavy();
          else if (pt.indexOf('airplane') === 0) M3.Vibrate.pattern([{ tier: 'medium', at: 0 }, { tier: 'medium', at: 100 }, { tier: 'medium', at: 200 }]);
        }
        // 我剩最后 1 张牌 → 中×1
        if ((M3.Game.getHand() || []).length === 1 && M3.Vibrate) M3.Vibrate.medium();
      } else {
        // 对手出炸弹/王炸砸我 → 只给「中」（别人爽的时候不该震得我手疼）；普通牌绝对不震
        if (M3.Vibrate && (pt === 'bomb' || pt === 'rocket')) M3.Vibrate.medium();
        // 报单预警：队友报单（农民视角）弱 / 对手报单 中
        if (state && state.handCounts && state.handCounts[act.actorId] === 1 && M3.Vibrate) {
          var reporter = state.players && state.players[act.actorId];
          var myRole = (state.players && state.players[myId] && state.players[myId].role) || '';
          if (myRole === 'farmer' && reporter && reporter.role === 'farmer') M3.Vibrate.light();
          else M3.Vibrate.medium();
        }
      }
    }
  }

  function updateAnim (now) {
    if (_curAnim && _curAnim._done) { _curAnim = null; }   // 上帧已完成，现在才清掉
    if (!_curAnim) { _curAnim = _animQueue.shift() || null; _animStart = now; }
    if (!_curAnim) return;
    var progress = Math.min(1, (now - _animStart) / Math.max(1, _curAnim.duration));
    _curAnim.progress = progress;
    if (progress >= 1 && !_curAnim._done) {
      _curAnim._done = true;
      // 手牌落定（发牌动画播完）：弱×1「就位」信号 + 重置本局强档预算；
      // 摸到王（大小王在手）延迟 200ms 中×1，不与就位信号叠加
      if (_curAnim.action === 'dealStarted' && M3.Vibrate) {
        M3.Vibrate.resetBudget();
        M3.Vibrate.light();
        var hand0 = M3.Game.getHand() || [];
        for (var di = 0; di < hand0.length; di++) {
          if (hand0[di] && hand0[di].rank >= 16) {
            M3.Vibrate.pattern([{ tier: 'medium', at: 200 }]);
            break;
          }
        }
      }
    }
  }

  // 结算入场动画是否仍未播完：只要「当前正在播放」或「队列中仍排队」有 roundSettled，
  // 就视为未完成。结算弹窗据此保持隐藏，直到该动画彻底播完再一次性展示，避免
  // 「弹窗先随 cardsPlayed 显示 → roundSettled 时又隐藏 → 播完再显示」的多次闪烁。
  function roundSettledPending () {
    if (_curAnim && _curAnim.action === 'roundSettled' && !_curAnim._done) return true;
    for (var i = 0; i < _animQueue.length; i++) {
      if (_animQueue[i].action === 'roundSettled') return true;
    }
    return false;
  }

  // 发牌动画是否仍未播完（当前正在播放或队列中排队）：期间隐藏手牌与操作按钮，
  // 让「再来一把 → 发牌 → 亮牌叫地主」的节奏成立，而不是状态一更新就直接亮全手牌
  function dealAnimActive () {
    if (_curAnim && _curAnim.action === 'dealStarted' && !_curAnim._done) return true;
    for (var i = 0; i < _animQueue.length; i++) {
      if (_animQueue[i].action === 'dealStarted') return true;
    }
    return false;
  }

  // ── 粒子系统 ────────────────────────────────────────────────────
  var _particles = [];

  function spawnParticles (x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1.5 + Math.random() * 3;
      _particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s * (1 + Math.random() * 3),
        vy: Math.sin(a) * s * (1 + Math.random() * 3) - 2,
        life: 1, decay: 0.008 + Math.random() * 0.025,
        color: color, size: 2 + Math.random() * 5,
      });
    }
  }

  function updateParticles () {
    for (var i = _particles.length - 1; i >= 0; i--) {
      var p = _particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.04;
      p.life -= p.decay;
      if (p.life <= 0) _particles.splice(i, 1);
    }
  }

  function drawParticles () {
    if (_particles.length === 0) return;
    var rd = r();
    for (var i = 0; i < _particles.length; i++) {
      var p = _particles[i];
      rd.save(); rd.setAlpha(p.life);
      rd.beginPath(); rd.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      rd.fill(p.color);
      rd.restore();
    }
  }

  function drawAnimation () {
    var anim = _curAnim;
    if (!anim) return;
    var rd = r();
    var W = L.w, H = L.h;
    var p = anim.progress, e = easeOutCubic(p);

    var players = playersBySeat();
    var vi = Math.max(0, players.findIndex(function (x) { return x && x.id === anim.actorId; }));
    var origins = L.playerPos.map(function (pp) { return { x: pp.x, y: pp.y }; });
    var o = origins[vi] || origins[0];

    rd.save();
    if (anim.action === 'dealStarted') {
      rd.setAlpha(Math.sin(Math.PI * p));
      for (var idx = 0; idx < 12; idx++) {
        var seat = idx % 3, dest = origins[seat];
        var stg = Math.max(0, Math.min(1, p * 1.7 - idx * 0.035));
        var dx = W/2 + (dest.x - W/2) * easeOutCubic(stg);
        var dy = H*0.4 + (dest.y - H*0.4) * easeOutCubic(stg) - Math.sin(Math.PI*stg)*45;
        drawCardBack(dx - 16, dy - 22, 32, 44);
      }
    } else if (anim.action === 'cardsPlayed') {
      var cards = sortPlayDisplay(anim.cards || []);
      var flyCW = L.playCardW || 40, flyCH = L.playCardH || 59;
      var dest = trickSlotCenter(vi, cards.length);
      var gap = PLAY_CARD_GAP;
      var flyTot = flyCW + gap * (cards.length - 1);
      var ctrX = dest.x, ctrY = dest.y;
      if (vi === 0) {
        o = { x: W/2, y: (L.handY || (H-60)) + flyCH/2 };
      } else {
        o = origins[vi] || origins[0];
      }
      var oy;
      for (var ci = 0; ci < cards.length; ci++) {
        var card = cards[ci];
        var destX = ctrX - flyTot/2 + ci*gap + flyCW/2;
        var dx2 = o.x + (destX - o.x) * e;
        oy = o.y + (ctrY - o.y) * e;
        // 出牌飞行与落位统一走 drawCardFast（同尺寸烘焙 sprite）：
        // 混用「手牌尺寸缩放」与「飞牌尺寸直烘」两套渲染时，内容布局有
        // 1~2px 差异，动画结束切落位瞬间会「颤抖一下」。首帧按需烘焙一次
        // 出牌尺寸 sprite（3~5 张，一次性几 ms），后续帧复用。
        M3.Render.drawCardFast(dx2 - flyCW/2, oy - flyCH/2, card, flyCW, flyCH);
      }
    } else if (anim.action === 'playerPassed') {
      // 不出不再弹居中动画
    } else if (anim.action === 'landlordAssigned') {
      (anim.cards || []).forEach(function (card, i) {
        var sp2 = (i - 1) * 42;
        var dx3 = W/2 + (o.x + sp2 - W/2) * e;
        var dy3 = 115 + (o.y - 115) * e - Math.sin(Math.PI*p) * 55;
        rd.save();
        rd.translate(dx3, dy3);
        rd.rotate((1 - p) * (i - 1) * 0.16);
        M3.Render.drawCardFast(-18, -26, card, 36, 50);
        rd.restore();
      });
      rd.setAlpha(Math.sin(Math.PI * p));
      ctext(W/2, H*0.22, '👑 地主', 30, C().goldL || '#fcd34d', 800);
    } else if (anim.label === '炸弹' || anim.label === '火箭' || anim.action === 'multiplierChanged') {
      // 炸弹/火箭的震动在 handleAction 数据层按「我出/对手出」分档触发（对手只给中档），动画层不重复震
      var rad = 30 + e * Math.max(W, H) * 0.36;
      rd.save(); rd.setAlpha(1 - p);
      rd.beginPath(); rd.arc(W/2, H*0.45, rad, 0, Math.PI*2);
      rd.stroke(anim.label === '火箭' ? '#fef3c7' : '#fb923c', 10*(1-p)+2);
      rd.restore();
      ctext(W/2, H*0.28 - p*20, anim.label, 34, C().textBright || '#f1f5f9', 800);
    } else {
      rd.setAlpha(Math.sin(Math.PI * Math.min(1, p)));
      var ly = o.y + (H*0.26 - o.y) * e;
      var lb;
      if (anim.action === 'lowCards')           lb = anim.label;
      else if (anim.action === 'actionTimeout') lb = anim.label || '超时托管';
      else if (anim.action === 'playerManaged') lb = anim.label || '托管';
      else if (anim.action === 'playerUnmanaged') lb = anim.label || '退出托管';
      else if (anim.action === 'playerReconnected') lb = anim.label || '重连';
      else if (anim.action === 'playerPassed')  lb = '';
      else if (anim.action === 'roundSettled')  lb = anim.label;
      else lb = anim.label;
      if (anim.action === 'roundSettled') {
        rd.fillRect(0, 0, W, H, 'rgba(2,12,8,.62)');
      }
      if (lb) {
        ctext(W/2, ly, lb, anim.action === 'roundSettled' ? 38 : 24, C().textBright || '#f1f5f9', 800);
      }
    }
    rd.restore();
  }

  // ── 主绘制入口 ──────────────────────────────────────────────────
  function draw () {
    var state = M3.Game.getState();
    // 主页 spine 快速开始按钮随切屏立即消失（mount 已停，不卸载会残留到 ttl 超时）
    if (M3.SpineFX && M3.SpineFX.unmount) M3.SpineFX.unmount('home-quickstart');
    drawGameBackground();
    drawGameHeader();

    if (!state) {
      drawMatchingScreen();
      return;
    }

    drawOpponents();
    drawCenter();
    var dealing = dealAnimActive();
    var hand = M3.Game.getHand();
    if (hand.length > 0 && !dealing) drawHand();   // 发牌动画播完前不亮手牌
    drawSelfPlayer();   // 自己头像在手牌之上，压过牌
    if (!dealing) drawActions();                    // 发牌动画播完前不显示叫地主/出牌按钮
    drawRuleTip();      // 出牌规则提示条（牌堆上方）
    drawAnimation();
    drawParticles();
  }

  // ── 匹配中画面（复用游戏场景结构） ────────────────────────────
  function drawMatchingScreen () {
    var rd = r();
    var W = L.w, H = L.h;
    var user = M3.Game.getUser();

    // 自己头像（左下角，同 drawSelfPlayer 位置）
    var selfAvR = L.selfAvR || 34;
    var px = L.playerPos[0].x, py = L.playerPos[0].y;
    drawAvatar(px, py, selfAvR,
      user ? user.avatarUrl : '',
      user ? (user.nickname || '玩家') : '玩家',
      true);
    // 昵称
    var infoX = px + selfAvR + 12;
    rd.glFillText(user ? (user.nickname || '玩家') : '玩家', infoX, py - 4,
      '700 14px sans-serif', '#ffffff', 'left', 'middle');
    // 铁豆
    var wallet = M3.Game.getWallet ? M3.Game.getWallet() : null;
    var beans = (wallet && typeof wallet.beans === 'number') ? wallet.beans : 0;
    drawBeanCountLeft(infoX, py + selfAvR - 12, beans);

    // 聊天语音按钮：与局内（drawActions）完全同位，匹配/游戏界面 UI 保持一致。
    // 复用 drawChatButton 同时会更新 _chatBtnRect，聊天弹窗定位也和局内统一。
    drawChatButton(W * 0.855 - 38, H - 34 - 14);

    // ── 中央"匹配中..."图片，居中显示 ───────────────────
    var centerY = H * 0.5;
    var matchImg = getGameImg('labelMatching');
    if (matchImg) {
      var mh = 60, mw = Math.round(mh * 361 / 123);
      rd.glDrawImage(matchImg, W / 2 - mw / 2, centerY - mh / 2, mw, mh);
    } else {
      drawPassText(W / 2, centerY, '匹配中');
    }

    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) {
      var elapsed = M3.Matchmaking.getCountdown ? M3.Matchmaking.getCountdown() : 0;
      rd.glFillText('已等待 ' + elapsed + ' 秒', W / 2, centerY + 38,
        '400 13px sans-serif', '#94a3b8', 'center', 'top');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 【局内调试模式】不进真实对局，注入 mock 状态直接渲染局内界面。
  // 调 UI（对手组件 / 手牌 / 操作按钮 / 豆子行等）无需匹配开局。
  //   DevTools: M3.SceneGame.debugShow(opts) 进入 / debugHide() 退出
  //   URL:      index.html?scene=game 自动进入
  // opts: { phase: 'playing'|'bidding'（默认 playing）,
  //         myTurn: 是否轮到我（默认 true）,
  //         landlord: 左家当地主展示地主帽（默认 true）,
  //         turnSec: 倒计时秒数（默认 25）,
  //         leftCards / rightCards: 对手剩余牌数（默认 17 / 8） }
  // main.js 在调试模式下忽略真实对局 state/hand/leftRoom/joined 推送。
  // ─────────────────────────────────────────────────────────────────
  var _debugMode = false;

  function debugShowGame (opts) {
    opts = opts || {};
    var C = M3.Config || { RANK_LABELS: {} };
    var myId = 'dbg-me', lId = 'dbg-left', rId = 'dbg-right';
    var phase = opts.phase === 'bidding' ? 'bidding' : 'playing';
    var myTurn = opts.myTurn !== false;

    // 17 张手牌：对 3 + 4~J 顺子 + Q + KK + A + 2 + 双王（覆盖对子/顺子/王炸牌面）
    var ranks = [3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 15, 16, 17];
    var suits = ['spades', 'hearts', 'clubs', 'diamonds'];
    var hand = [];
    for (var i = 0; i < ranks.length; i++) {
      var rk = ranks[i];
      if (rk >= 16) hand.push({ id: 'joker-' + rk, suit: 'joker', rank: rk, label: C.RANK_LABELS[rk] || '' });
      else hand.push({ id: suits[i % 4] + '-' + rk, suit: suits[i % 4], rank: rk, label: C.RANK_LABELS[rk] || '' });
    }

    var players = {};
    players[myId] = { id: myId, name: '调试玩家',       avatarUrl: '', beans: 128000, frozenBeans: 10000, role: 'landlord', connected: true, ready: true, seat: 0 };
    players[lId]  = { id: lId,  name: '唯一居士',       avatarUrl: '', beans: 8400,   role: 'landlord', connected: true, ready: true, seat: 2 };
    players[rId]  = { id: rId,  name: '沉迷纸牌的叨叨', avatarUrl: '', beans: 30000,  role: 'landlord', connected: true, ready: true, seat: 1 };

    var state = {
      phase: phase,
      roomId: 'debug-room',
      players: players,
      seats: [myId, rId, lId],
      handCounts: {},
      dealer: opts.landlord === false ? '' : '*',    // '*' = 全员显示地主帽（调试用）
      round: { baseBet: 100, baseScore: 100, multiplier: 5 },
      lastPlay: null,
      actionDeadlineAt: Date.now() + (opts.turnSec || 25) * 1000,
    };
    state.handCounts[myId] = hand.length;
    state.handCounts[lId] = opts.leftCards != null ? opts.leftCards : 17;
    state.handCounts[rId] = opts.rightCards != null ? opts.rightCards : 8;
    if (phase === 'bidding') {
      state.bidState = { phase: 'calling', currentPlayerId: myTurn ? myId : lId, bids: {} };
    } else {
      state.currentPlayerId = myTurn ? myId : rId;
      // mock 出牌：自己出 333QQQ（飞机），左家出 44455（三带二）
      var mkCards = function (arr) {
        return arr.map(function (item) {
          return { id: item[0] + '-' + item[1], suit: item[0], rank: item[1], label: C.RANK_LABELS[item[1]] || '' };
        });
      };
      state.lastPlay = {
        playerId: myId,
        cards: mkCards([['spades',3],['hearts',3],['clubs',3],['spades',12],['hearts',12],['clubs',12]]),
      };
      // 对手（左家）展示出牌
      state.opponentPlay = {
        playerId: lId,
        cards: mkCards([['spades',4],['hearts',4],['clubs',4],['spades',5],['hearts',5]]),
      };
    }

    _debugMode = true;
    // 脱离真实房间 / 匹配流程（若在），避免服务端推送覆盖 mock 状态
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching() && M3.Matchmaking.stop) {
      M3.Matchmaking.stop();
    }
    if (M3.Game.leaveRoom && M3.Game.getRoomId && M3.Game.getRoomId()) M3.Game.leaveRoom();

    M3.Game.setMyPlayerId(myId);
    M3.Game.setState(state);
    M3.Game.setHand(hand);
    if (M3.Game.clearSelected) M3.Game.clearSelected();
    if (M3.Render && M3.Render.resetHits) M3.Render.resetHits();
    // 局内切图预加载（bgGame 未就绪时才拉，与真实进房同款幂等逻辑）
    if (M3.SceneGame.ensureImages) M3.SceneGame.ensureImages();
    M3.Game.goGame();
    // mock 出牌展示（playing 阶段才有意义）
    if (phase !== 'bidding') {
      resetTrickPlays();
      _trickPlays[myId] = { kind: 'play', cards: state.lastPlay.cards };
      _trickPlays[lId]  = { kind: 'play', cards: state.opponentPlay.cards };
      // mock 右家「不出」
      _trickPlays[rId]  = { kind: 'pass', label: '不出' };
    } else {
      // bidding 阶段：左家「不叫」，右家「不抢」
      resetTrickPlays();
      _trickPlays[lId] = { kind: 'pass', label: '不叫' };
      _trickPlays[rId] = { kind: 'pass', label: '不抢' };
    }
    // 调试模式默认展示规则提示条，方便调整文字居中
    showRuleTip('你没有大过对家的牌', true);
  }

  function debugHideGame () {
    _debugMode = false;
    M3.Game.setHand([]);
    if (M3.Game.clearSelected) M3.Game.clearSelected();
    M3.Game.setState(null);
    if (M3.Render && M3.Render.resetHits) M3.Render.resetHits();
    M3.Game.goHome();
  }

  // ── 暴露公共接口 ────────────────────────────────────────────────
  M3.SceneGame = {
    // 供 render.js 调用
    draw: draw,
    // 供 render.js update 调用
    update: function (now) {
      updateAnim(now);
      updateParticles();
    },
    // 供 render.js / drawGameHeader 读取当前动画
    _curAnim: null,
    // 入队动画（原 M3.Render.enqueueAnimation）
    enqueueAnimation: enqueueAnimation,
    // 结算入场动画是否仍未播完（供 scene-settlement 判断弹窗是否可展示，避免多次闪烁）
    roundSettledPending: roundSettledPending,
    // 局内返回按钮（供 render.js 在结算层之上重绘，保证层级最高）
    drawBackButton: drawBackButton,
    // 退出确认弹窗（供 render.js 在结算层之上绘制，避免被结算弹窗盖住）
    drawLeaveConfirmModal: drawLeaveConfirmModal,
    isLeaveConfirmVisible: isLeaveConfirmVisible,
    hideLeaveConfirm: hideLeaveConfirm,
    // 预加载图片
    preload: preloadGameImgs,
    // 出牌规则提示条（供 main.js 路由服务端出牌拒绝消息到牌堆提示）
    showRuleTip: showRuleTip,
    clearRuleTip: clearRuleTip,
    // 语音气泡（供 scene-voice.js / main.js 展示对方或自己发送的语音文案）
    showVoiceBubble: showVoiceBubble,
    // 聊天按钮矩形 + 局内图片获取（供 scene-voice.js 定位弹窗、复用铁豆图标）
    getChatBtnRect: getChatBtnRect,
    getGameImg: getGameImg,
    // 局内调试模式（免开局调 UI）：debugShow/debugHide/查询状态
    debugShow: debugShowGame,
    debugHide: debugHideGame,
    isDebugMode: function () { return _debugMode; },
    /**
     * 进入游戏时调用：释放大厅资源 + 重新加载局内图片
     */
    ensureImages: function () {
      AM.releaseGroup('scene:home');
      // 幂等：只在游戏图片未加载时才预加载（防止 enterMatchRoom + goRoom 重复 acquire）
      if (!AM.loaded('bgGame')) preloadGameImgs();
    },
  };

  // 保持 _curAnim 同步（每帧 update 时刷新引用）
  Object.defineProperty(M3.SceneGame, '_curAnim', {
    get: function () { return _curAnim; },
    set: function (v) { _curAnim = v; },
  });
})();
