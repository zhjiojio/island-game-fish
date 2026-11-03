/**
 * input.js — 触摸 / 鼠标输入，锤子命中判定 + 复活广告 / 结算弹窗交互
 *
 * 坐标换算方式参考 references/render-api.md 的 scalePos 写法：
 * 把屏幕物理坐标换算成游戏使用的「逻辑像素」坐标。
 */
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});

  var _hammer = { x: -1, y: -1, downAt: 0, visible: false };
  var _modalShown = false; // 防止 reviving/gameover 状态下重复弹窗

  function _scalePos(canvas, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var px = ((clientX - rect.left) * (canvas.width / dpr)) / rect.width;
    var py = ((clientY - rect.top) * (canvas.height / dpr)) / rect.height;
    return { x: px, y: py };
  }

  function _handleTap(x, y) {
    _hammer.x = x;
    _hammer.y = y;
    _hammer.downAt = AIGCUtils._now();
    _hammer.visible = true;

    var hole = AIGCUtils.Game.hitTest(x, y);
    if (hole) {
      AIGCUtils.Game.onHit(hole);
    }
  }

  /**
   * KwaiUI.showModal 在非快手环境（浏览器 H5 调试）下只会 console.warn 并直接返回，
   * 不会触发 onConfirm/onCancel —— 真机上没问题，但本地调试会卡死在弹窗状态。
   * 这里只在 `typeof ks === 'undefined'`（即非真机环境）时才用浏览器原生 confirm 兜底，
   * 真机环境始终走平台原生 KwaiUI.showModal，不影响线上行为。
   */
  function _confirm(options) {
    if (typeof ks === 'undefined') {
      var ok = window.confirm(options.title + '\n' + options.content);
      if (ok) options.onConfirm && options.onConfirm();
      else options.onCancel && options.onCancel();
      return;
    }
    KwaiUI.showModal(options);
  }

  function _showReviveModal() {
    if (_modalShown) return;
    _modalShown = true;
    _confirm({
      title: '血条已耗尽',
      content: '看一段广告，满血复活继续游戏？',
      onConfirm: function () {
        KwaiAd.showRewarded(
          function () {
            // 看完广告 → 满血复活
            _modalShown = false;
            AIGCUtils.Game.revive();
          },
          function () {
            // 中途关闭广告，不发奖励 → 直接结束
            _modalShown = false;
            AIGCUtils.Game.endGame();
          }
        );
      },
      onCancel: function () {
        _modalShown = false;
        AIGCUtils.Game.endGame();
      },
    });
  }

  function _showGameOverModal() {
    if (_modalShown) return;
    _modalShown = true;
    _confirm({
      title: '游戏结束',
      content: '本局得分：' + AIGCUtils.Game.getScore() + ' 分，是否重新开始？',
      onConfirm: function () {
        _modalShown = false;
        AIGCUtils.Game.restart();
      },
      onCancel: function () {
        _modalShown = false;
      },
    });
  }

  function init(canvas) {
    AIGCUtils.Game.onStateChange(function (phase) {
      if (phase === 'reviving') _showReviveModal();
      else if (phase === 'gameover') _showGameOverModal();
    });

    canvas.addEventListener(
      'touchstart',
      function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        var p = _scalePos(canvas, t.clientX, t.clientY);
        _handleTap(p.x, p.y);
      },
      { passive: false }
    );

    canvas.addEventListener('mousedown', function (e) {
      var p = _scalePos(canvas, e.clientX, e.clientY);
      _handleTap(p.x, p.y);
    });
  }

  AIGCUtils.Input = {
    init: init,
    getHammer: function () { return _hammer; },
  };
})();
