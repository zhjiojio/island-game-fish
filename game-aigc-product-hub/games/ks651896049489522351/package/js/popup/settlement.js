/**
 * scene-settlement.js — 结算弹窗（独立模块，与 scene-game.js 解耦）
 * 渲染层：直接调用 M3.Render WebGL 接口（无 Canvas 2D ctx）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.SceneSettlement = M3.SceneSettlement || {};

  var L = M3.Layout;

  // ── 结算资源（懒加载）────────────────────────────────────────────
  // 整图 812 x 200（@3x 2436x600）：左侧人物/标题带 + 右侧缎面一体烘焙，
  // 不再拆 left 主体/视觉两张
  var _imgs = {};
  var _imgPaths = {
    settleVictory:  'subpackages/ingame/asset/image/game/settle/victory.png',
    settleFail:     'subpackages/ingame/asset/image/game/settle/fail.png',
    settleBroke:    'subpackages/ingame/asset/image/game/settle/broke.png',
    settleLandlord: 'subpackages/ingame/asset/image/game/settle/settle-landlord.png',
  };

  function getImg (key) {
    if (_imgs[key]) return _imgs[key].width > 0 ? _imgs[key] : null;
    var img;
    try {
      if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
      else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
      else img = new Image();
    } catch (e) {
      try { img = new Image(); } catch (e2) { img = null; }
    }
    img.src = _imgPaths[key];
    _imgs[key] = img;
    return null;
  }

  var _loaded = false;
  function loadResources () {
    if (_loaded) return; _loaded = true;
    Object.keys(_imgPaths).forEach(function (k) { getImg(k); });
  }

  // ── 入场动画状态 ─────────────────────────────────────────────────
  var _animStart  = 0;
  var _animResult = null;
  var _bankruptPopupShown = false;   // 本局是否已弹过破产补助（关掉后不再强行弹出）
  var BG_DUR       = 460;
  var CONTENT_DELAY = 260;
  var CONTENT_DUR   = 320;

  function _now ()         { return (typeof M3._now === 'function' && M3._now()) || Date.now(); }
  function clamp01 (v)     { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ── 辅助 ─────────────────────────────────────────────────────────
  function sortedPlayers () {
    var state = M3.Game.getState();
    if (!state) return [];
    return state.seats.map(function (id) { return id ? state.players[id] : null; }).filter(Boolean);
  }

  function ellipsize (r, text, maxW) {
    if (r.glMeasureText(text, '400 15px sans-serif') <= maxW) return text;
    var ell = '...';
    var t = text;
    while (t.length > 0 && r.glMeasureText(t + ell, '400 15px sans-serif') > maxW)
      t = t.slice(0, -1);
    return t + ell;
  }

  // ── 看广告得铁豆 ─────────────────────────────────────────────────
  var _adShowing = false;
  function _watchAdForBeans (iBroke) {
    if (_adShowing) return;
    _adShowing = true;
    function report () {
      if (iBroke && M3.Game.claimBankruptReward) M3.Game.claimBankruptReward();
      else if (M3.Game.claimAdReward) M3.Game.claimAdReward();
    }
    if (typeof KwaiAd !== 'undefined' && KwaiAd.showRewarded) {
      KwaiAd.showRewarded(
        function () { _adShowing = false; report(); },
        function () { _adShowing = false; if (M3.Game.flash) M3.Game.flash('看完视频才能领取铁豆哦~'); }
      );
    } else {
      _adShowing = false; report();
    }
  }

  function isVisible () {
    var state = M3.Game.getState();
    if (!state || !state.result) return false;
    if (state.phase !== 'settlement') return false;
    if (M3.SceneGame && M3.SceneGame.roundSettledPending && M3.SceneGame.roundSettledPending()) return false;
    // 结算页自带 spine（win/fail/broke）：oneshot 特效队列（王炸/炸弹/春天等）
    // 未播完时整体不出场，播完自动显示——避免特效盖在结算页上（签名变化时
    // _animStart 重置，入场动画完整播放）。12s watchdog 兜底不会永久等待。
    if (M3.SpineFX && M3.SpineFX.isPlaying && M3.SpineFX.isPlaying()) return false;
    return true;
  }

  // 破产补助已领（当日）后再次破产：弹「豆子不足」引导购买，
  // 关闭后依旧不足且看广告次数没用完 → 弹「看广告得铁豆」；次数看完不触发。
  // 「豆子不足」弹窗内部按服务端 firstCharge 标记自动切换首充/已首充形态。
  function showBeanShortageAfterBankrupt (res) {
    var roomType = res.roomType || (M3.Game.getRoomType && M3.Game.getRoomType()) || 'junior';
    var fallbackToAd = function () {
      // 豆子已够进场（购买到账等）：不再引导
      if (M3.Game.hasBeansToEnter && M3.Game.hasBeansToEnter(roomType)) return;
      var AR = M3.SceneAdReward;
      if (AR && AR.queryStatus) {
        AR.queryStatus(function (st) {
          // 今日次数看完（remaining<=0）或状态获取失败：都不触发
          if (st && Number(st.remaining) > 0 && AR.show) AR.show();
        });
      }
    };
    var IB = M3.SceneInsufficientBeans;
    var shown = !!(IB && IB.show && IB.show({
      roomType: roomType,
      deficit: M3.Game.beansDeficit ? M3.Game.beansDeficit(roomType) : 0,
      onClosed: fallbackToAd,
    }));
    // 目录未就绪等 show 返回 false：直接走看广告兜底（同样受次数限制）
    if (!shown) fallbackToAd();
  }

  // 卸载结算 spine（win/fail/broke 三种都清；幂等可重复调用）
  function _unloadSettleSpine () {
    if (!M3.SpineFX || !M3.SpineFX.unmount) return;
    M3.SpineFX.unmount('settle-win');
    M3.SpineFX.unmount('settle-fail');
    M3.SpineFX.unmount('settle-broke');
  }

  // ── 绘制结算弹窗 ─────────────────────────────────────────────────
  function draw () {
    var vis = isVisible();
    if (!vis) {
      _animResult = null; _bankruptPopupShown = false;
      // 结算页消失：立即卸载结算 spine（再来一把/返回大厅同款清理）
      _unloadSettleSpine();
      return;
    }

    loadResources();

    var r = M3.Render;
    var W = L.w, H = L.h;
    var state = M3.Game.getState();
    var res   = state.result;
    var myId  = M3.Game.getMyPlayerId();

    var iWon   = res.winnerIds && res.winnerIds.indexOf(myId) >= 0;
    // 破产判定：服务端下发 bankruptRewards 即视为破产（无论当日是否可领补助）
    var iBroke = !!(res.bankruptRewards && res.bankruptRewards[myId]);
    var iBrokeClaimable = iBroke && !!res.bankruptRewards[myId].claimable;
    var bgKey   = iWon ? 'settleVictory' : (iBroke ? 'settleBroke' : 'settleFail');
    var bgImg   = getImg(bgKey);

    if (!bgImg) {
      r.fillRect(0, 0, W, H, 'rgba(10,24,56,0.8)');
      return;
    }

    // 签名：稳定标识同一局
    var _deltas = res.deltas || {};
    var _sortedDeltas = {};
    Object.keys(_deltas).sort().forEach(function (k) { _sortedDeltas[k] = _deltas[k]; });
    var sig = (res.winnerIds || []).slice().sort().join(',') + '#' + (res.baseBet || 0) + '#'
            + (res.multiplier || 0) + '#' + JSON.stringify(_sortedDeltas);
    if (_animResult !== sig) {
      _animResult = sig; _animStart = _now(); _bankruptPopupShown = false;
      // 结算进场即预载主页资源：用户点「返回大厅」时已就绪，不再闪现占位
      if (M3.SceneHome && M3.SceneHome.preloadAssets) M3.SceneHome.preloadAssets();
      // 结算震动（时机表第六节）：胜利「强+中×2」三段递减庆祝 / 失败单次沉重；
      // 春天/反春天暂无数据源（结算 result 未下发 spring 标记），接入后补「强×2+中×3」
      if (M3.Vibrate) {
        if (iWon) M3.Vibrate.pattern([{ tier: 'strong', at: 0 }, { tier: 'medium', at: 120 }, { tier: 'medium', at: 240 }]);
        else M3.Vibrate.heavy();
      }
    }

    // 破产链路（同一局只弹一次，用户关闭后不再强行弹出，下一局签名变化时重置）：
    //   当日未领补助 → 优先弹「破产补助」（领取服务端权威发豆）
    //   当日已领再破产 → 弹「豆子不足」引导购买，关闭后依旧不足且广告有剩 → 看广告
    // 调试模式只看结算底图，不弹补助/豆不足链路（预览补助弹窗直接调 M3.SceneBankrupt.show(amount)）
    if (iBroke && !_bankruptPopupShown && !_debugMode) {
      _bankruptPopupShown = true;
      if (iBrokeClaimable && M3.SceneBankrupt && M3.SceneBankrupt.show) {
        M3.SceneBankrupt.show(res.bankruptRewards[myId].amount);
      } else {
        showBeanShortageAfterBankrupt(res);
      }
    }

    var elapsed = _now() - _animStart;
    var bgP     = easeOutCubic(Math.min(1, elapsed / BG_DUR));
    var contP   = easeOutCubic(Math.min(1, Math.max(0, (elapsed - CONTENT_DELAY) / CONTENT_DUR)));

    // 布局：整图设计 812 x 200，高度按宽正比例缩放（bh = W / 4.06）
    var bannerAR = 812 / 200;
    var bw = W, bh = bw / bannerAR;
    var bx = 0;
    var _btnH = 48;
    var _btnY = H - _btnH - Math.max(24, H * 0.06);
    var _headerBottom = 60;
    var by = _headerBottom + (_btnY - _headerBottom - bh) / 2;
    if (by < _headerBottom + 8) by = _headerBottom + 8;
    // 内容（表格）布局基准保持不变：缎面左缘 ≈ 整图 43.5% 处
    var leftW = bw * (680 / 1624);

    // 遮罩（随背景渐现）
    r.save(); r.setAlpha(clamp01(bgP * 1.5));
    r.fillRect(0, 0, W, H, 'rgba(10,24,56,0.5)');
    r.restore();

    // 1) 背景图（整图 9 宫格拉伸适配宽）：
    //    左角 400（人物 + 竖向标题带，不可拉伸）+ 中段 12（纯缎面横拉）
    //    + 右角 400（缎面 + 右收边）；高度正比例缩放，纵向不拉伸。
    //    入场 wipe（左→右展开）用 scissor 裁剪出左侧可见区域实现，
    //    9 宫格端部位置固定不随动画移动。
    var revealW = bw * bgP;
    if (revealW > 0) {
      if (bgP < 1) r.setScissor(bx, by, revealW, bh);
      r.glDrawImage9(bgImg, bx, by, bw, bh, 400, 0, 812, 200);
      if (bgP < 1) r.clearScissor();
    }

    // 1.5) 胜利/失败/破产结算 spine 特效（人物 + 缎面 ground，fitW 全屏宽 →
    //     与底图左缘对齐；骨骼视觉中心对齐 banner 中心。mount 幂等（每帧刷新
    //     x/y/fitW 适配旋转/分屏），ttl 0.75s：结算页隐藏后自动卸载。
    //     素材自带 1624 宽 ground 缎面，loop:false 播一次停在末帧。
    var spineName = bgKey === 'settleVictory' ? 'win'
                  : bgKey === 'settleFail'    ? 'fail'
                  : bgKey === 'settleBroke'    ? 'broke' : '';
    if (spineName && M3.SpineFX && M3.SpineFX.mount) {
      M3.SpineFX.mount('settle-' + spineName, spineName, {
        x: bx + bw / 2,
        y: by + bh / 2,
        fitW: bw,
        loop: false,
        screen: 'game',   // 界面随屏守卫：返回大厅（screen→home）立即销毁
        files: { json: 'skeleton.json', atlas: 'skeleton.atlas', png: 'skeleton.png' },
      });
    }

    // 2) 战绩表格
    if (contP > 0) {
      r.save(); r.setAlpha(contP);

      var textColor = iWon ? '#5D3303' : '#213372';
      var headColor = iWon ? '#8a6a1f' : '#4a72c4';   // 胜利暖棕 / 失败破产蓝
      var rowRGB    = iWon ? '255,176,9' : '182,203,248';

      var tblX    = bx + leftW * 1.04;
      var tblW    = bw - tblX;
      var colHat  = tblX + tblW * 0.075;
      var colName = tblX + tblW * 0.13;
      var colBase = tblX + tblW * 0.50;
      var colMult = tblX + tblW * 0.68;
      var colBean = tblX + tblW * 0.88;
      var headY   = by + bh * 0.18;
      var rowH    = bh * 0.20;
      var row0Y   = by + bh * 0.30;

      // 表头
      r.glFillText('昵称', colName, headY, '500 14px sans-serif', headColor, 'left',   'middle');
      r.glFillText('底分', colBase, headY, '500 14px sans-serif', headColor, 'center', 'middle');
      r.glFillText('倍数', colMult, headY, '500 14px sans-serif', headColor, 'center', 'middle');
      r.glFillText('铁豆', colBean, headY, '500 14px sans-serif', headColor, 'center', 'middle');

      var landlordId = state.dealer || '';
      var players    = sortedPlayers();
      players.sort(function (a, b) {
        if (a.id === myId) return -1;
        if (b.id === myId) return 1;
        return 0;
      });
      var baseScore = res.baseBet || (state.round && state.round.baseScore) || 0;
      var mult      = res.multiplier || 1;

      for (var i = 0; i < players.length; i++) {
        var p   = players[i];
        var ry  = row0Y + i * rowH;
        var rcy = ry + rowH / 2;
        var isMe = p.id === myId;

        // 自己行高亮（Figma 850-785 横向渐变：两端透明，中间实色）
        // linear-gradient(90deg, #b6cbf800 0%, #b6cbf8 30.77%, #b6cbf8 61.54%, #b6cbf800 100%)
        if (isMe) {
          var c = rowRGB.split(',');
          var solid = 'rgba('+c[0]+','+c[1]+','+c[2]+',0.5)';
          var clear = 'rgba('+c[0]+','+c[1]+','+c[2]+',0)';
          r.fillRectGradH(tblX, ry, tblW, rowH, [
            { t: 0,      css: clear },
            { t: 0.3077, css: solid },
            { t: 0.6154, css: solid },
            { t: 1,      css: clear }
          ]);
        }

        var weight = isMe ? '700' : '400';

        // 地主帽
        if (p.id === landlordId) {
          var hatImg = getImg('settleLandlord');
          var hatSz  = rowH * 0.62;
          if (hatImg) r.glDrawImage(hatImg, colHat, rcy-hatSz/2, hatSz, hatSz);
          else        r.glFillText('👑', colHat, rcy, hatSz+'px sans-serif', textColor, 'left', 'middle');
        }

        // 昵称
        var dispName = ellipsize(r, p.name || '玩家', colBase - colName - 20);
        r.glFillText(dispName, colName, rcy, weight+' 15px sans-serif', textColor, 'left', 'middle');

        // 底分/倍数
        r.glFillText(String(baseScore), colBase, rcy, weight+' 16px sans-serif', textColor, 'center', 'middle');
        r.glFillText(String(mult),      colMult, rcy, weight+' 16px sans-serif', textColor, 'center', 'middle');

        // 铁豆
        var d = (res.deltas && res.deltas[p.id] != null) ? res.deltas[p.id] : 0;
        r.glFillText((d>=0?'+':'\u2212')+M3.Game.formatBeans(Math.abs(d)), colBean, rcy, weight+' 16px sans-serif', textColor, 'center', 'middle');
      }
      r.restore();
    }

    // 3) 按钮（随内容淡入）
    if (contP > 0) {
      var me   = state.players[myId];
      var gapX = 20;   // 43 高大按钮配 20 间距
      // Figma：结算页统一用 43 高大按钮
      var btnH = 43;
      var btnY = H - btnH - Math.max(24, H * 0.06);
      var contW = 110, adW = 132, backW = 110;
      // 按钮组整体左移：右边距从 ~32 加大到 ~100
      var rightX = W - Math.max(100, W * 0.12) - contW;

      r.save(); r.setAlpha(contP);
      // 从右往左排：UIButton 文字过宽时实际宽度会超过 minW 向右扩，
      // 必须用返回的实际左缘排下一个按钮，间距才是精确的 gapX
      // 右①：再来一把（已准备则显示取消准备）
      var r1 = M3.UIButton.draw({
        x: rightX, y: btnY, w: contW, h: btnH,
        label:   (me && me.ready) ? '取消准备' : '再来一把',
        style:   (me && me.ready) ? 'gray' : 'gold',
        hitLabel: 'settle_again',
        onClick: function () { M3.Network.send('setReady', { ready: !(me && me.ready) }); }
      });
      // 右②：看广告得铁豆（输家且未准备时）
      var leftEdge = r1 ? r1.x : rightX;
      if (!iWon && !(me && me.ready)) {
        var r2 = M3.UIButton.draw({
          x: leftEdge - gapX - adW, y: btnY, w: adW, h: btnH,
          label: '看广告得铁豆', style: 'blue',
          hitLabel: 'settle_ad',
          // 当日补助可领时看广告后领补助；已领过（再破产）走正常广告领豆
          onClick: function () { _watchAdForBeans(iBrokeClaimable); }
        });
        leftEdge = r2 ? r2.x : leftEdge - gapX - adW;
      }
      // 右③：返回大厅（直接退出房间，服务端回 leftRoom 后切回大厅）；
      // 点击即卸载结算 spine——不留到切屏（screen 守卫）或 ttl 兜底
      M3.UIButton.draw({
        x: leftEdge - gapX - backW, y: btnY, w: backW, h: btnH,
        label: '返回大厅', style: 'gray',
        hitLabel: 'settle_back',
        onClick: function () {
          // 乐观切换：leaveRoom 内部立即 goHome（同帧切屏，spine 由 screen 守卫销毁）
          M3.Game.leaveRoom();
        }
      });
      r.restore();
    }

    // 破产补助弹窗：绘制在结算页所有内容之上（最顶层）
    if (M3.SceneBankrupt && M3.SceneBankrupt.isVisible && M3.SceneBankrupt.isVisible()) {
      M3.SceneBankrupt.draw();
    }
  }

  M3.SceneSettlement.draw          = draw;
  M3.SceneSettlement.isVisible     = isVisible;
  M3.SceneSettlement.loadResources = loadResources;

  // ── 结算调试模式 ─────────────────────────────────────────────────
  // 不打真实对局，注入 mock 结算状态直接渲染结算页，调底图/表格/按钮布局。
  //   DevTools: M3.SceneSettlement.debugShow('win'|'fail'|'broke') 进入
  //            M3.SceneSettlement.debugHide() 退出
  // mock 借用局内 debugShow 的席位，确保在 game 屏绘制且与局内守卫互认。
  var _debugMode = false;

  function debugShowSettle (result) {
    var kind = result === 'win' ? 'win' : (result === 'broke' ? 'broke' : 'fail');
    var myId = 'dbg-me';
    var players = {};
    players[myId]   = { id: myId,   name: '调试玩家',       avatarUrl: '', beans: 128000, role: 'farmer', connected: true, ready: false, seat: 0 };
    players['dbg-left']  = { id: 'dbg-left',  name: '唯一居士',       avatarUrl: '', beans: 8400,   role: 'landlord', connected: true, ready: false, seat: 2 };
    players['dbg-right'] = { id: 'dbg-right', name: '沉迷纸牌的叨叨', avatarUrl: '', beans: 30000,  role: 'farmer',  connected: true, ready: false, seat: 1 };

    var winnerIds = kind === 'win' ? [myId, 'dbg-right'] : ['dbg-left'];
    var state = {
      phase: 'settlement',
      roomId: 'debug-room',
      roomType: 'junior',
      players: players,
      seats: [myId, 'dbg-right', 'dbg-left'],
      handCounts: {},
      dealer: kind === 'win' ? 'dbg-left' : myId,
      round: { baseBet: 100, baseScore: 100, multiplier: 5 },
      actionDeadlineAt: Date.now() + 25 * 1000,
      result: {
        winnerIds: winnerIds,
        baseBet: 100,
        multiplier: 5,
        // win：自己 +5000 赢豆；fail：自己 -3200；broke：破产且补助可领
        deltas: (function () {
          if (kind === 'win')  return { 'dbg-me': 5000, 'dbg-left': -5000, 'dbg-right': 5000 };
          if (kind === 'broke') return { 'dbg-me': -12800, 'dbg-left': 12800, 'dbg-right': -12800 };
          return { 'dbg-me': -3200, 'dbg-left': 3200, 'dbg-right': -3200 };
        })(),
        // broke 场景走破产链路（真实对局会弹补助弹窗；调试模式只看底图，链路被 _debugMode 关掉）
        bankruptRewards: kind === 'broke' ? { 'dbg-me': { amount: 8000, claimable: true } } : null,
      },
    };
    state.handCounts[myId] = 0;
    state.handCounts['dbg-left'] = 0;
    state.handCounts['dbg-right'] = 0;

    _debugMode = true;
    // 脱离真实房间 / 匹配流程，避免服务端推送覆盖 mock 状态
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching() && M3.Matchmaking.stop) {
      M3.Matchmaking.stop();
    }
    if (M3.Game.leaveRoom && M3.Game.getRoomId && M3.Game.getRoomId()) M3.Game.leaveRoom();

    M3.Game.setMyPlayerId(myId);
    M3.Game.setState(state);
    M3.Game.setHand([]);
    if (M3.Game.clearSelected) M3.Game.clearSelected();
    if (M3.Render && M3.Render.resetHits) M3.Render.resetHits();
    // 结算页绘制在 game 屏（render.js：screen === 'game' 才调 SceneSettlement.draw）
    M3.Game.goGame();
    // 局内调 UI 依赖的图提前拉起（对手区背景等），结算底图在 draw 里懒加载
    if (M3.SceneGame && M3.SceneGame.ensureImages) M3.SceneGame.ensureImages();
  }

  function debugHideSettle () {
    _debugMode = false;
    M3.Game.setHand([]);
    if (M3.Game.clearSelected) M3.Game.clearSelected();
    M3.Game.setState(null);
    if (M3.Render && M3.Render.resetHits) M3.Render.resetHits();
    M3.Game.goHome();
  }

  M3.SceneSettlement.debugShow = debugShowSettle;
  M3.SceneSettlement.debugHide = debugHideSettle;
  M3.SceneSettlement.isDebugMode = function () { return _debugMode; };
})();
