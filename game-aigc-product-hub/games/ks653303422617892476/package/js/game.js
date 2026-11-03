/**
 * game.js — 换装匹配流程控制层
 *
 * 职责：
 *   1. 响应热区点击（由 input.js 分发的 M3.Game.onZoneTap）
 *   2. 协调 M3.Board 状态转换
 *   3. 管理激励视频广告（+5次 / 提示 / 加时）
 *   4. 选关 / 解锁弹窗流程
 *
 * 不做：
 *   - 不直接绘制 canvas
 *   - 不处理原始触摸坐标（由 input.js 负责）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Game = M3.Game || {};

  // ── 广告位 ID ─────────────────────────────────────────────────────────────
  var AD_ADD_CHANCES = 'adunit-add-chances-rewarded'; // +5次
  var AD_HINT_ID     = 'adunit-hint-rewarded';        // 提示
  var AD_ADD_TIME    = 'adunit-add-time-rewarded';    // 加时

  var AD_UNLOCK_ID   = 'adunit-unlock-rewarded';      // 解锁系列
  var UNLOCK_NEED    = 3;
  var _unlockWatchCount = 0;

  // ── 初始化 ────────────────────────────────────────────────────────────────
  M3.Game.init = function () {
    if (M3.Board && M3.Board.goHome) M3.Board.goHome();
  };

  // ── 每帧 update ───────────────────────────────────────────────────────────
  M3.Game.update = function () {
    if (M3.Board && M3.Board.update) M3.Board.update();
  };

  // ── 热区点击分发 ──────────────────────────────────────────────────────────

  M3.Game.onZoneTap = function (zoneId) {

    // ── HOME ────────────────────────────────────────────────────────────────
    if (zoneId === 'home_start') {
      M3.Board.goSelect();
      return;
    }

    if (zoneId === 'home_add') {
      _addToDesktop();
      return;
    }

    if (zoneId === 'home_daily') {
      _showToast('每日签到功能即将上线~');
      return;
    }

    if (zoneId === 'home_settings') {
      _showToast('设置功能即将上线~');
      return;
    }

    if (zoneId === 'home_redeem') {
      _showToast('兑换码功能即将上线~');
      return;
    }

    // ── SELECT ──────────────────────────────────────────────────────────────
    if (zoneId === 'select_back') {
      M3.Board.goHome();
      return;
    }

    if (zoneId === 'select_customer') {
      _showToast('客服功能即将上线~');
      return;
    }

    if (zoneId === 'select_unlock') {
      _unlockWatchCount = 0;
      M3.Render.showUnlockDialog = true;
      return;
    }

    if (zoneId === 'select_daily') {
      _showToast('每日签到功能即将上线~');
      return;
    }

    if (zoneId === 'select_add') {
      _addToDesktop();
      return;
    }

    // 关卡卡片
    if (zoneId.indexOf('select_level_') === 0) {
      var idx = parseInt(zoneId.replace('select_level_', ''), 10);
      _tryStartLevel(idx);
      return;
    }

    // 分页
    if (zoneId === 'page_prev')  { _changePage(-1);   return; }
    if (zoneId === 'page_next')  { _changePage(+1);   return; }
    if (zoneId === 'page_first') { _changePage(-999); return; }
    if (zoneId === 'page_last')  { _changePage(+999); return; }

    // ── 解锁弹窗 ─────────────────────────────────────────────────────────────
    if (zoneId === 'unlock_close') {
      M3.Render.showUnlockDialog = false;
      return;
    }

    if (zoneId === 'unlock_watch') {
      _watchUnlockAd();
      return;
    }

    // ── PLAYING 阶段 ──────────────────────────────────────────────────────────

    if (zoneId === 'play_back') {
      M3.Board.goSelect();
      return;
    }

    if (zoneId === 'play_settings') {
      _showToast('设置功能即将上线~');
      return;
    }

    if (zoneId === 'play_more') {
      _showToast('更多功能即将上线~');
      return;
    }

    if (zoneId === 'play_close') {
      M3.Board.goSelect();
      return;
    }

    if (zoneId === 'play_nav_left' || zoneId === 'play_nav_right') {
      _showToast('素材切换位预留中~');
      return;
    }

    // 衣服选项（play_option_0 ~ play_option_3）
    if (zoneId.indexOf('play_option_') === 0) {
      var optIdx = parseInt(zoneId.replace('play_option_', ''), 10);
      if (M3.Board && M3.Board.selectOption) {
        M3.Board.selectOption(optIdx);
        _vibrate('light');
      }
      return;
    }

    // 工具栏
    if (zoneId === 'tool_add_chances') {
      _watchAddChancesAd();
      return;
    }

    if (zoneId === 'tool_hint') {
      _watchHintAd();
      return;
    }

    if (zoneId === 'tool_add_time') {
      _watchAddTimeAd();
      return;
    }

    // ── RESULT 阶段 ───────────────────────────────────────────────────────────

    if (zoneId === 'result_retry') {
      M3.Board.restartLevel();
      return;
    }

    if (zoneId === 'result_next') {
      var nextIdx = M3.Board.levelIdx + 1;
      if (M3.Scene && nextIdx < M3.Scene.levelCount) {
        M3.Board.startLevel(nextIdx);
      } else {
        M3.Board.goSelect();
      }
      return;
    }
  };

  // ── 内部：关卡启动 ────────────────────────────────────────────────────────

  function _tryStartLevel(idx) {
    var maxUnlocked = M3.Board ? M3.Board.maxUnlocked : 0;
    if (idx > maxUnlocked) {
      _unlockWatchCount = 0;
      M3.Render.showUnlockDialog = true;
      return;
    }
    M3.Board.startLevel(idx);
  }

  // ── 内部：激励视频（+5次）────────────────────────────────────────────────

  function _watchAddChancesAd() {
    if (!M3.Board) return;
    _showRewardedAd(AD_ADD_CHANCES, function () {
      M3.Board.addChances(5);
      _showToast('+5 次机会已到账！');
      _vibrate('medium');
    });
  }

  // ── 内部：激励视频（提示）────────────────────────────────────────────────

  function _watchHintAd() {
    if (!M3.Board || M3.Board.hintUsed) return;
    _showRewardedAd(AD_HINT_ID, function () {
      M3.Board.useHint();
      _vibrate('light');
    });
  }

  // ── 内部：激励视频（加时）────────────────────────────────────────────────

  function _watchAddTimeAd() {
    if (!M3.Board) return;
    _showRewardedAd(AD_ADD_TIME, function () {
      M3.Board.addTime(30);
      _showToast('+30 秒！');
      _vibrate('medium');
    });
  }

  // ── 内部：激励视频（解锁全系列）──────────────────────────────────────────

  function _watchUnlockAd() {
    _showRewardedAd(AD_UNLOCK_ID, function () {
      _unlockWatchCount++;
      M3.Render._unlockWatchCount = _unlockWatchCount;
      if (_unlockWatchCount >= UNLOCK_NEED) {
        _grantFullUnlock();
        M3.Render.showUnlockDialog = false;
        _showToast('已解锁全部关卡 24 小时！');
      }
    });
  }

  function _grantFullUnlock() {
    if (!M3.Board) return;
    var total = M3.Scene ? M3.Scene.levelCount - 1 : 99;
    try {
      if (typeof ks !== 'undefined' && ks.setStorageSync) {
        ks.setStorageSync({ key: 'maxUnlocked', data: total });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zc_maxUnlocked', String(total));
      }
    } catch (e) {}
    if (M3.Board.loadProgress) M3.Board.loadProgress();
  }

  // ── 内部：通用激励视频 ────────────────────────────────────────────────────

  function _showRewardedAd(adUnitId, onRewarded) {
    if (typeof KwaiAd !== 'undefined' && KwaiAd.showRewardedVideoAd) {
      KwaiAd.showRewardedVideoAd({
        adUnitId : adUnitId,
        onRewarded: onRewarded,
        onError  : function (err) {
          console.warn('[ad error]', err);
          // H5 预览降级：直接给奖励
          onRewarded();
        },
        onClose  : function () {},
      });
    } else {
      // 非快手环境（H5 预览）：直接给奖励
      onRewarded();
    }
  }

  // ── 内部：翻页 ────────────────────────────────────────────────────────────

  function _changePage(delta) {
    var total      = M3.Scene ? M3.Scene.levelCount : 1;
    var totalPages = Math.ceil(total / 6);
    var page       = M3.Render.selectPage || 0;
    if (delta === -999)      page = 0;
    else if (delta === +999) page = totalPages - 1;
    else                     page = Math.max(0, Math.min(totalPages - 1, page + delta));
    M3.Render.selectPage = page;
  }

  // ── 内部：工具函数 ────────────────────────────────────────────────────────

  function _vibrate(type) {
    try {
      if (typeof ks !== 'undefined' && ks.vibrateShort) {
        ks.vibrateShort({ type: type || 'light' });
      }
    } catch (e) {}
  }

  function _addToDesktop() {
    try {
      if (typeof ks !== 'undefined' && ks.addToDesktop) {
        ks.addToDesktop({});
      }
    } catch (e) {}
  }

  function _showToast(msg) {
    try {
      if (typeof ks !== 'undefined' && ks.showToast) {
        ks.showToast({ title: msg, icon: 'none', duration: 2000 });
      } else {
        console.log('[toast]', msg);
      }
    } catch (e) {}
  }

})();
