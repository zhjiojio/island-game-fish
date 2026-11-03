(function () {
  var M3 = window.M3 = window.M3 || {};
  var L = M3.Layout;
  var R = M3.Render;

  // ---- 输入处理 ----
  var gesture = null;
  var _lastSelVib = 0;   // 选牌震动节流（同一手势内 30ms）
  var _keysDown = {};
  var _pressedBtn = null;
  var _pressedLabel = null;
  var _commerceGesture = false;
  var _bgmDone = false;
  var _cachedRect = null; // 缓存 canvas 位置，避免 touchmove 频繁 reflow

  M3.Input = {
    focusRoomInput: false,
    getPressedLabel: function () { return _pressedLabel; },
    cancelCurrentGesture: function () { gesture = null; _commerceGesture = false; clearPressed(); },
    // 是否处于「连续按选牌」拖拽手势中（touchstart 起、touchend 止）
    isSelecting: function () { return !!gesture; },
    // 指定牌 index 是否落在【当前这次手势】划过的区间内。
    // 用于让「本次手势正在划过的牌」显示落下+蒙层，而之前已选起的牌保持提起不动。
    isInCurrentGesture: function (index) {
      if (!gesture) return false;
      var lo = Math.min(gesture.start, gesture.last);
      var hi = Math.max(gesture.start, gesture.last);
      return index >= lo && index <= hi;
    },
  };

  function hit (r, x, y) {
    // 条目可带 hitTest（如 spine 按钮按当前姿态 bounds 命中），优先于矩形
    if (r && typeof r.hitTest === 'function') return r.hitTest(x, y);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function setPressed (btn) {
    _pressedBtn = btn;
    _pressedLabel = btn ? btn.label : null;
  }

  function clearPressed () {
    _pressedBtn = null;
    _pressedLabel = null;
  }

  function getEventPos (e) {
    var canvas = window.canvas;
    if (!canvas) return { x: 0, y: 0 };
    var W = L.w, H = L.h;
    // touchstart/touchmove 用 touches，touchend 用 changedTouches
    var tl = (e.touches && e.touches.length > 0) ? e.touches
      : (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches : null;
    if (tl) {
      // 缓存 getBoundingClientRect：touchmove 高频调用会触发 reflow 导致滑动卡顿
      var rect = _cachedRect || (_cachedRect = canvas.getBoundingClientRect());
      return {
        x: (tl[0].clientX - rect.left) * (W / rect.width),
        y: (tl[0].clientY - rect.top) * (H / rect.height),
      };
    }
    if (e.offsetX !== undefined) return { x: e.offsetX, y: e.offsetY };
    return { x: 0, y: 0 };
  }

  function onDown (e) {
    // 首次用户交互时重试 BGM（此前 main.js 中已被 autoplay 拦截）
    if (!_bgmDone) { _bgmDone = true; if (typeof KwaiMedia !== 'undefined') KwaiMedia.Audio.playBgmList(['asset/audio/bgm/bgm_0.mp3']); }
    e.preventDefault();
    // 每次按下刷新一次缓存的画布位置（触点期间 touchmove 复用，避免卡顿）
    _cachedRect = window.canvas ? window.canvas.getBoundingClientRect() : null;
    var pos = getEventPos(e);
    var x = pos.x, y = pos.y;
    var screen = M3.Game.getScreen();

    // ── 获得豆子弹窗：绘制在资金页之上，必须最先处理并吞掉全部输入 ──
    if (M3.SceneBeanReward && M3.SceneBeanReward.isVisible && M3.SceneBeanReward.isVisible()) {
      gesture = null; clearPressed(); _commerceGesture = false;
      var brHitBtns = R.getHitBtns();
      for (var bri = brHitBtns.length - 1; bri >= 0; bri--) {
        var brlb = brHitBtns[bri].label || '';
        if (brlb.indexOf('beanreward_') !== 0) continue;
        if (hit(brHitBtns[bri], x, y)) { setPressed(brHitBtns[bri]); return; }
      }
      return;
    }

    // ── 钻石兑换 / 商城：高于游戏层，严格按前缀命中并吞掉遮罩点击 ──
    var commerce = M3.SceneDiamondExchange && M3.SceneDiamondExchange.isVisible && M3.SceneDiamondExchange.isVisible()
      ? M3.SceneDiamondExchange
      : (M3.SceneDiamondStore && M3.SceneDiamondStore.isVisible && M3.SceneDiamondStore.isVisible() ? M3.SceneDiamondStore : null);
    if (commerce) {
      gesture = null; clearPressed(); _commerceGesture = true;
      var prefix = commerce === M3.SceneDiamondExchange ? 'diamond_exchange_' : 'diamond_store_';
      var commerceBtns = R.getHitBtns();
      for (var ci = commerceBtns.length - 1; ci >= 0; ci--) {
        if ((commerceBtns[ci].label || '').indexOf(prefix) !== 0) continue;
        if (hit(commerceBtns[ci], x, y)) { setPressed(commerceBtns[ci]); if (commerce.onTouchStart) commerce.onTouchStart(x, y); return; }
      }
      if (commerce.onTouchStart) commerce.onTouchStart(x, y);
      return;
    }

    // ── 局内退出确认弹窗打开时优先处理，防止点击穿透到手牌 / 操作按钮 ──
    if (screen === 'game' && M3.SceneGame && M3.SceneGame.isLeaveConfirmVisible && M3.SceneGame.isLeaveConfirmVisible()) {
      var leaveHitBtns = R.getHitBtns();
      for (var li = leaveHitBtns.length - 1; li >= 0; li--) {
        var llb = leaveHitBtns[li].label || '';
        if (llb.indexOf('game_leave_') !== 0) continue;
        if (hit(leaveHitBtns[li], x, y)) {
          setPressed(leaveHitBtns[li]);
          return;
        }
      }
      return;
    }

    // ── 战绩弹层打开时优先处理 ──────────────────────────────
    if (M3.SceneRecord && M3.SceneRecord.isVisible && M3.SceneRecord.isVisible()) {
      var hitBtns = R.getHitBtns();
      for (var ri = hitBtns.length - 1; ri >= 0; ri--) {
        if (hit(hitBtns[ri], x, y)) {
          setPressed(hitBtns[ri]);
          return;
        }
      }
      // 记录滚动起点
      M3.SceneRecord.onTouchStart(y);
      return;
    }

    // ── 个人面板打开时优先处理 ──────────────────────────────
    if (M3.SceneProfile && M3.SceneProfile.isVisible && M3.SceneProfile.isVisible()) {
      var pHitBtns = R.getHitBtns();
      for (var pi = pHitBtns.length - 1; pi >= 0; pi--) {
        var plb = pHitBtns[pi].label || '';
        if (plb.indexOf('profile_') !== 0) continue;
        if (hit(pHitBtns[pi], x, y)) {
          setPressed(pHitBtns[pi]);
          if (M3.SceneProfile.onTouchStart) M3.SceneProfile.onTouchStart(x, y);
          return;
        }
      }
      // 面板内空白处 / 遮罩外点击
      if (M3.SceneProfile.onTouchStart) M3.SceneProfile.onTouchStart(x, y);
      return;
    }

    // ── 钻石不足弹窗打开时优先处理（最顶层，先于兑换弹窗）──────────
    if (M3.SceneInsufficientDiamondPopup && M3.SceneInsufficientDiamondPopup.isVisible && M3.SceneInsufficientDiamondPopup.isVisible()) {
      var idHitBtns = R.getHitBtns();
      for (var idi = idHitBtns.length - 1; idi >= 0; idi--) {
        var idlb = idHitBtns[idi].label || '';
        if (idlb.indexOf('insuffd_') !== 0) continue;
        if (hit(idHitBtns[idi], x, y)) {
          setPressed(idHitBtns[idi]);
          return;
        }
      }
      return; // 弹窗外点击一律吞掉（onUp 会触发 mask 的 hide）
    }

    // ── 钻石兑换弹窗打开时优先处理（商城分支之前，独立弹层）──────
    if (M3.SceneExchangePopup && M3.SceneExchangePopup.isVisible && M3.SceneExchangePopup.isVisible()) {
      var epHitBtns = R.getHitBtns();
      for (var epi = epHitBtns.length - 1; epi >= 0; epi--) {
        var eplb = epHitBtns[epi].label || '';
        if (eplb.indexOf('expopup_') !== 0) continue;
        if (hit(epHitBtns[epi], x, y)) {
          setPressed(epHitBtns[epi]);
          return;
        }
      }
      return; // 弹窗外点击一律吞掉
    }

    // ── 商城面板打开时优先处理 ──────────────────────────────
    if (M3.SceneShop && M3.SceneShop.isVisible && M3.SceneShop.isVisible()) {
      var shHitBtns = R.getHitBtns();
      for (var shi = shHitBtns.length - 1; shi >= 0; shi--) {
        var shlb = shHitBtns[shi].label || '';
        if (shlb.indexOf('shop_') !== 0) continue;
        if (hit(shHitBtns[shi], x, y)) {
          setPressed(shHitBtns[shi]);
          if (M3.SceneShop.onTouchStart) M3.SceneShop.onTouchStart(x, y);
          return;
        }
      }
      if (M3.SceneShop.onTouchStart) M3.SceneShop.onTouchStart(x, y);
      return;
    }

    // ── 豆子不足弹窗打开时优先处理（绘制在结算页之上，须先于结算分支拦截）──
    if (M3.SceneInsufficientBeans && M3.SceneInsufficientBeans.isVisible && M3.SceneInsufficientBeans.isVisible()) {
      var ibHitBtns = R.getHitBtns();
      for (var ibi = ibHitBtns.length - 1; ibi >= 0; ibi--) {
        var iblb = ibHitBtns[ibi].label || '';
        if (iblb.indexOf('insuffb_') !== 0) continue;
        if (hit(ibHitBtns[ibi], x, y)) {
          setPressed(ibHitBtns[ibi]);
          return;
        }
      }
      return; // 弹窗外点击一律吞掉（onUp 触发 mask 的 hide）
    }

    // ── 看广告得铁豆弹窗打开时优先处理（结算页也会弹此弹窗，须在结算分支之前）──
    if (M3.SceneAdReward && M3.SceneAdReward.isVisible && M3.SceneAdReward.isVisible()) {
      var arHitBtns = R.getHitBtns();
      for (var ar = arHitBtns.length - 1; ar >= 0; ar--) {
        var alb = arHitBtns[ar].label || '';
        // 只响应弹窗自己的按钮，过滤主页按钮防止穿透
        if (alb.indexOf('adreward_') !== 0) continue;
        if (hit(arHitBtns[ar], x, y)) {
          setPressed(arHitBtns[ar]);
          return;
        }
      }
      return; // 遮罩区域点击由 adreward_mask 按钮兜住，其余无效
    }

    // ── 破产补助弹窗打开时优先处理（结算页顶层）────────────
    if (M3.SceneBankrupt && M3.SceneBankrupt.isVisible && M3.SceneBankrupt.isVisible()) {
      var bkHitBtns = R.getHitBtns();
      for (var bk = bkHitBtns.length - 1; bk >= 0; bk--) {
        var bklb = bkHitBtns[bk].label || '';
        // 只响应弹窗自己的按钮，过滤结算页按钮防止穿透
        if (bklb.indexOf('bankrupt_') !== 0) continue;
        if (hit(bkHitBtns[bk], x, y)) {
          setPressed(bkHitBtns[bk]);
          return;
        }
      }
      return; // 弹窗本体点击不响应，遮罩由 bankrupt_mask 兜住
    }

    // ── 结算页显示时优先处理：只响应结算按钮，防止穿透到局内按钮/手牌 ──
    // （破产补助弹窗绘制在结算页之上，其分支已在前面拦截）
    if (screen === 'game' && M3.SceneSettlement && M3.SceneSettlement.isVisible && M3.SceneSettlement.isVisible()) {
      var stHitBtns = R.getHitBtns();
      for (var si = stHitBtns.length - 1; si >= 0; si--) {
        var stlb = stHitBtns[si].label || '';
        if (stlb.indexOf('settle_') !== 0) continue;
        if (hit(stHitBtns[si], x, y)) {
          setPressed(stHitBtns[si]);
          return;
        }
      }
      return; // 结算页其余区域点击一律吞掉
    }

    // ── 新手礼包弹窗打开时优先处理 ──────────────────────────
    if (M3.SceneNewcomer && M3.SceneNewcomer.isVisible && M3.SceneNewcomer.isVisible()) {
      var ncHitBtns = R.getHitBtns();
      for (var nc = ncHitBtns.length - 1; nc >= 0; nc--) {
        var nclb = ncHitBtns[nc].label || '';
        // 只响应弹窗自己的按钮，过滤主页按钮防止穿透
        if (nclb.indexOf('newcomer_') !== 0) continue;
        if (hit(ncHitBtns[nc], x, y)) {
          setPressed(ncHitBtns[nc]);
          return;
        }
      }
      return; // 弹窗本体点击不响应，遮罩由 newcomer_mask 兜住
    }

    // ── 语音/聊天弹窗打开时优先处理（游戏屏幕内）──────────────
    if (M3.SceneVoice && M3.SceneVoice.isVisible && M3.SceneVoice.isVisible()) {
      var vHitBtns = R.getHitBtns();
      for (var vi = vHitBtns.length - 1; vi >= 0; vi--) {
        var vlb = vHitBtns[vi].label || '';
        // 只响应语音弹窗自己的按钮和遮罩，过滤主页/游戏按钮防止穿透
        if (vlb.indexOf('voice_') !== 0) continue;
        if (hit(vHitBtns[vi], x, y)) {
          setPressed(vHitBtns[vi]);
          if (M3.SceneVoice.onTouchStart) M3.SceneVoice.onTouchStart(x, y);
          return;
        }
      }
      // 面板内空白处：作为滚动起点；遮罩外点击由遮罩命中关闭
      if (M3.SceneVoice.onTouchStart) M3.SceneVoice.onTouchStart(x, y);
      return;
    }

    // ── 匹配弹层打开时优先处理 ──────────────────────────────
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) {
      var hitBtns = R.getHitBtns();
      for (var mi = hitBtns.length - 1; mi >= 0; mi--) {
        if (hit(hitBtns[mi], x, y)) {
          setPressed(hitBtns[mi]);
          return;
        }
      }
      return; // 弹层外点击无效
    }

    // 加入房间弹窗打开时，只响应弹窗按钮，点击空白处关闭
    if (M3.Game.getShowJoinModal && M3.Game.getShowJoinModal()) {
      var hitBtns = R.getHitBtns();
      for (var j = hitBtns.length - 1; j >= 0; j--) {
        if (hit(hitBtns[j], x, y)) {
          M3.log('CLICK', 'keypad', hitBtns[j].label || 'key');
          setPressed(hitBtns[j]);
          return;
        }
      }
      // 点击弹窗外空白处关闭（无动画，直接关闭）
      M3.log('CLICK', 'close keypad');
      M3.Game.setShowJoinModal(false);
      return;
    }

    var hitBtns = R.getHitBtns();
    var handHits = R.getHandHits();

    if (screen === 'game') {
      // 卡牌选择（保持 touchstart 即时响应）
      var card = null;
      for (var i = handHits.length - 1; i >= 0; i--) {
        if (hit(handHits[i], x, y)) { card = handHits[i]; break; }
      }
      if (card) {
        M3.log('CLICK', 'card select', card.id);
        gesture = { select: !M3.Game.getSelectedIds()[card.id], start: card.index, last: card.index };
        applyGesture(card.index);
        return;
      }
      // 按钮（延迟到 touchend）
      var btn = null;
      for (var j = hitBtns.length - 1; j >= 0; j--) {
        if (hit(hitBtns[j], x, y)) { btn = hitBtns[j]; break; }
      }
      if (btn && btn.onClick) {
        setPressed(btn);
        M3.log('PRESS', 'game btn', btn.label || 'action');
      }
    } else {
      // 所有其他页面的按钮点击（延迟到 touchend）
      for (var k = hitBtns.length - 1; k >= 0; k--) {
        if (hit(hitBtns[k], x, y)) {
          setPressed(hitBtns[k]);
          M3.log('PRESS', screen, hitBtns[k].label || 'btn');
          break;
        }
      }
    }
  }

  function onMove (e) {
    e.preventDefault();
    if (M3.SceneBeanReward && M3.SceneBeanReward.isVisible && M3.SceneBeanReward.isVisible()) {
      if (_pressedBtn) {
        var brPos = getEventPos(e);
        if (!hit(_pressedBtn, brPos.x, brPos.y)) clearPressed();
      }
      return;
    }
    // 钻石不足弹窗：不滚动，只需维护按压状态（先于兑换弹窗）
    if (M3.SceneInsufficientDiamondPopup && M3.SceneInsufficientDiamondPopup.isVisible && M3.SceneInsufficientDiamondPopup.isVisible()) {
      if (_pressedBtn) {
        var idPos = getEventPos(e);
        if (!hit(_pressedBtn, idPos.x, idPos.y)) clearPressed();
      }
      return;
    }
    // 钻石兑换弹窗：不滚动，只需维护按压状态
    if (M3.SceneExchangePopup && M3.SceneExchangePopup.isVisible && M3.SceneExchangePopup.isVisible()) {
      if (_pressedBtn) {
        var epPos = getEventPos(e);
        if (!hit(_pressedBtn, epPos.x, epPos.y)) clearPressed();
      }
      return;
    }
    var commerce = M3.SceneDiamondExchange && M3.SceneDiamondExchange.isVisible && M3.SceneDiamondExchange.isVisible()
      ? M3.SceneDiamondExchange
      : (M3.SceneDiamondStore && M3.SceneDiamondStore.isVisible && M3.SceneDiamondStore.isVisible() ? M3.SceneDiamondStore : null);
    if (commerce) {
      var cPos = getEventPos(e), cMoved = commerce.onTouchMove ? commerce.onTouchMove(cPos.x, cPos.y) : 0;
      if (_pressedBtn && (cMoved || !hit(_pressedBtn, cPos.x, cPos.y))) clearPressed();
      return;
    }
    // 战绩面板滚动
    if (M3.SceneRecord && M3.SceneRecord.isVisible && M3.SceneRecord.isVisible()) {
      var pos2 = getEventPos(e);
      M3.SceneRecord.onTouchMove(pos2.y);
      return;
    }

    // 个人面板滚动
    if (M3.SceneProfile && M3.SceneProfile.isVisible && M3.SceneProfile.isVisible()) {
      var pPos = getEventPos(e);
      var pMoved = M3.SceneProfile.onTouchMove ? M3.SceneProfile.onTouchMove(pPos.x, pPos.y) : 0;
      if (_pressedBtn && pMoved) clearPressed();
      return;
    }

    // 商城面板滚动
    if (M3.SceneShop && M3.SceneShop.isVisible && M3.SceneShop.isVisible()) {
      var shPos = getEventPos(e);
      var shMoved = M3.SceneShop.onTouchMove ? M3.SceneShop.onTouchMove(shPos.x, shPos.y) : 0;
      if (_pressedBtn && shMoved) clearPressed();
      return;
    }

    // 语音弹窗滚动
    if (M3.SceneVoice && M3.SceneVoice.isVisible && M3.SceneVoice.isVisible()) {
      var vPos = getEventPos(e);
      var moved = M3.SceneVoice.onTouchMove ? M3.SceneVoice.onTouchMove(vPos.x, vPos.y) : 0;
      if (_pressedBtn && moved) clearPressed();
      return;
    }

    // 拖出按钮范围 → 取消按下状态
    if (_pressedBtn) {
      var mPos = getEventPos(e);
      if (!hit(_pressedBtn, mPos.x, mPos.y)) {
        clearPressed();
      }
      return;
    }

    if (!gesture) return;
    var pos = getEventPos(e);
    var x = pos.x, y = pos.y;
    var handHits = R.getHandHits();

    var card = null;
    for (var i = handHits.length - 1; i >= 0; i--) {
      if (hit(handHits[i], x, y)) { card = handHits[i]; break; }
    }
    if (card && card.index !== gesture.last) {
      gesture.last = card.index;
      applyGesture(card.index);
    }
  }

  function onUp (e) {
    // BeanReward 视觉上是全局最顶层；即使 commerce 同时可见也只释放 beanreward_。
    if (M3.SceneBeanReward && M3.SceneBeanReward.isVisible && M3.SceneBeanReward.isVisible()) {
      if (_pressedBtn) {
        var brPos = getEventPos(e), brBtn = _pressedBtn;
        clearPressed();
        if ((brBtn.label || '').indexOf('beanreward_') === 0 && hit(brBtn, brPos.x, brPos.y) && brBtn.onClick) brBtn.onClick();
      }
      _commerceGesture = false; gesture = null;
      return;
    }
    // 钻石不足弹窗：最顶层，先于兑换弹窗处理
    if (M3.SceneInsufficientDiamondPopup && M3.SceneInsufficientDiamondPopup.isVisible && M3.SceneInsufficientDiamondPopup.isVisible()) {
      if (_pressedBtn) {
        var idUpPos = getEventPos(e), idUpBtn = _pressedBtn;
        clearPressed();
        if ((idUpBtn.label || '').indexOf('insuffd_') === 0 && hit(idUpBtn, idUpPos.x, idUpPos.y) && idUpBtn.onClick) idUpBtn.onClick();
      }
      _commerceGesture = false; gesture = null;
      return;
    }
    // 钻石兑换弹窗：只触发 expopup_ 前缀的按钮
    if (M3.SceneExchangePopup && M3.SceneExchangePopup.isVisible && M3.SceneExchangePopup.isVisible()) {
      if (_pressedBtn) {
        var epUpPos = getEventPos(e), epUpBtn = _pressedBtn;
        clearPressed();
        if ((epUpBtn.label || '').indexOf('expopup_') === 0 && hit(epUpBtn, epUpPos.x, epUpPos.y) && epUpBtn.onClick) epUpBtn.onClick();
      }
      _commerceGesture = false; gesture = null;
      return;
    }
    // 松手时触发按钮点击
    if (_commerceGesture) {
      var activeCommerce = M3.SceneDiamondExchange && M3.SceneDiamondExchange.isVisible && M3.SceneDiamondExchange.isVisible()
        ? M3.SceneDiamondExchange
        : (M3.SceneDiamondStore && M3.SceneDiamondStore.isVisible && M3.SceneDiamondStore.isVisible() ? M3.SceneDiamondStore : null);
      if (_pressedBtn) {
        var commercePos = getEventPos(e), commerceBtn = _pressedBtn;
        clearPressed();
        if (hit(commerceBtn, commercePos.x, commercePos.y) && commerceBtn.onClick) commerceBtn.onClick();
      }
      if (activeCommerce && activeCommerce.onTouchEnd) activeCommerce.onTouchEnd();
      _commerceGesture = false; gesture = null;
      return;
    }
    if (_pressedBtn) {
      var pos = getEventPos(e);
      if (hit(_pressedBtn, pos.x, pos.y)) {
        M3.log('CLICK', 'release', _pressedBtn.label || 'btn');
        if (_pressedBtn.onClick) _pressedBtn.onClick();
      }
      clearPressed();
    }

    if (M3.SceneRecord && M3.SceneRecord.isVisible && M3.SceneRecord.isVisible()) {
      M3.SceneRecord.onTouchEnd();
    }
    if (M3.SceneVoice && M3.SceneVoice.isVisible && M3.SceneVoice.isVisible() && M3.SceneVoice.onTouchEnd) {
      M3.SceneVoice.onTouchEnd();
    }
    if (M3.SceneProfile && M3.SceneProfile.isVisible && M3.SceneProfile.isVisible() && M3.SceneProfile.onTouchEnd) {
      M3.SceneProfile.onTouchEnd();
    }
    if (M3.SceneShop && M3.SceneShop.isVisible && M3.SceneShop.isVisible() && M3.SceneShop.onTouchEnd) {
      M3.SceneShop.onTouchEnd();
    }
    gesture = null;
  }

  function applyGesture (endIdx) {
    if (!gesture) return;
    var start = Math.min(gesture.start, endIdx);
    var end = Math.max(gesture.start, endIdx);
    var handHits = R.getHandHits();

    for (var i = 0; i < handHits.length; i++) {
      if (handHits[i].index >= start && handHits[i].index <= end) {
        M3.Game.setSelect(handHits[i].id, gesture.select);
      }
    }
    // 选牌震动（弱）：同一手势内 30ms 节流，别每张都震（时机表第三节）
    var now = Date.now();
    if (now - _lastSelVib >= 30) {
      _lastSelVib = now;
      if (M3.Vibrate) M3.Vibrate.light();
    }
  }

  // 键盘输入（仅游戏页面处理，加入房间用弹窗九宫格）
  function onKeyDown (e) {
    _keysDown[e.key] = true;
    // 不在任何页面使用键盘输入了，九宫格弹窗替代
  }

  function onKeyUp (e) {
    _keysDown[e.key] = false;
  }

  // 注册事件
  function init () {
    var canvas = window.canvas;
    if (!canvas) return;

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);

    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp, { passive: false });

    // 窗口尺寸变化时使缓存的画布位置失效
    window.addEventListener('resize', function () { _cachedRect = null; });
    window.addEventListener('orientationchange', function () { _cachedRect = null; });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  // 自动初始化
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();