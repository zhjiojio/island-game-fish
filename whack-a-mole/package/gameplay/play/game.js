/**
 * game.js — 打地鼠核心玩法状态机
 *
 * 状态字段全部挂在 AIGCUtils.Game 下，渲染层（render.js）和输入层（input.js）
 * 只读取/调用这里的方法，不直接修改内部私有变量。
 */
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});
  var Config = AIGCUtils.Config;

  // 12 个洞的布局数据，每次 resize 由 _layoutHoles() 重新计算
  var _holes = []; // { col, row, x, y, w, h, cx, cy, state: 'empty'|'up', upUntil }
  var _health = Config.MAX_HEALTH;
  var _score = 0;
  var _zeroReached = false; // 血条已经打到 0，下一次漏打就要弹复活广告
  var _phase = 'playing'; // 'playing' | 'reviving' | 'gameover'
  var _lastSpawnAt = 0;
  var _hitFx = null; // { x, y, t } 命中特效（锤子砸下的小动画，纯视觉）
  var _onStateChange = null; // 外部（input.js / render.js）可订阅状态变化用于触发广告弹窗等

  function _layoutHoles() {
    var L = AIGCUtils.Layout;
    var cols = Config.GRID_COLS;
    var rows = Config.GRID_ROWS;
    var topPad = L.safeTop + L.h * 0.16; // 顶部留给计分板
    var bottomPad = L.h * 0.04;
    var areaH = L.h - topPad - bottomPad;
    var areaW = L.w * 0.92;
    var cellW = areaW / cols;
    var cellH = areaH / rows;
    var offsetX = (L.w - areaW) / 2;
    var offsetY = topPad;

    var holeW = cellW * 0.72;
    var holeH = cellH * 0.5;

    var next = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var cx = offsetX + cellW * col + cellW / 2;
        var cy = offsetY + cellH * row + cellH * 0.62;
        var prev = _holes[row * cols + col];
        next.push({
          col: col,
          row: row,
          x: cx - holeW / 2,
          y: cy - holeH / 2,
          w: holeW,
          h: holeH,
          cx: cx,
          cy: cy,
          state: prev ? prev.state : 'empty',
          upUntil: prev ? prev.upUntil : 0,
        });
      }
    }
    _holes = next;
  }

  function init() {
    _health = Config.MAX_HEALTH;
    _score = 0;
    _zeroReached = false;
    _phase = 'playing';
    _lastSpawnAt = AIGCUtils._now();
    _layoutHoles();
  }

  function _emptyHoleIndexes() {
    var arr = [];
    for (var i = 0; i < _holes.length; i++) {
      if (_holes[i].state === 'empty') arr.push(i);
    }
    return arr;
  }

  function _trySpawn(now) {
    if (now - _lastSpawnAt < Config.SPAWN_INTERVAL_MS) return;
    _lastSpawnAt = now;

    var emptyIdx = _emptyHoleIndexes();
    if (emptyIdx.length === 0) return;

    var maxCount = Math.min(Config.MAX_SPAWN_COUNT, emptyIdx.length);
    var count = Config.MIN_SPAWN_COUNT + Math.floor(Math.random() * (maxCount - Config.MIN_SPAWN_COUNT + 1));

    for (var n = 0; n < count; n++) {
      if (emptyIdx.length === 0) break;
      var pick = Math.floor(Math.random() * emptyIdx.length);
      var holeIndex = emptyIdx.splice(pick, 1)[0];
      var hole = _holes[holeIndex];
      hole.state = 'up';
      hole.upUntil = now + Config.MOLE_UP_MS;
    }
  }

  function _onMiss() {
    if (_zeroReached) {
      // 血条已经清零，这次又漏打 → 触发复活广告流程
      _phase = 'reviving';
      if (_onStateChange) _onStateChange('reviving');
      return;
    }
    _health -= 1;
    if (_health <= 0) {
      _health = 0;
      _zeroReached = true;
    }
  }

  function update(now) {
    if (_phase !== 'playing') return;

    _trySpawn(now);

    for (var i = 0; i < _holes.length; i++) {
      var hole = _holes[i];
      if (hole.state === 'up' && now >= hole.upUntil) {
        hole.state = 'empty';
        _onMiss();
        if (_phase !== 'playing') break; // 触发了复活流程，停止本帧后续判定
      }
    }
  }

  /** 命中测试：逻辑像素坐标 (x,y) 是否砸中了某个「冒出来的」地鼠 */
  function hitTest(x, y) {
    if (_phase !== 'playing') return null;
    for (var i = 0; i < _holes.length; i++) {
      var hole = _holes[i];
      if (hole.state !== 'up') continue;
      if (x >= hole.x && x <= hole.x + hole.w && y >= hole.y && y <= hole.y + hole.h) {
        return hole;
      }
    }
    return null;
  }

  function onHit(hole) {
    hole.state = 'empty';
    hole.upUntil = 0;
    _score += Config.SCORE_PER_HIT;
    _hitFx = { x: hole.cx, y: hole.cy, t: AIGCUtils._now() };
  }

  /** 看完复活广告 → 满血复活，继续游戏 */
  function revive() {
    _health = Config.MAX_HEALTH;
    _zeroReached = false;
    _phase = 'playing';
    _lastSpawnAt = AIGCUtils._now();
    for (var i = 0; i < _holes.length; i++) {
      _holes[i].state = 'empty';
      _holes[i].upUntil = 0;
    }
    if (_onStateChange) _onStateChange('playing');
  }

  /** 放弃复活 → 游戏结束 */
  function endGame() {
    _phase = 'gameover';
    if (_onStateChange) _onStateChange('gameover');
  }

  function restart() {
    init();
    if (_onStateChange) _onStateChange('playing');
  }

  AIGCUtils.Game = {
    init: init,
    update: update,
    layoutHoles: _layoutHoles,
    hitTest: hitTest,
    onHit: onHit,
    revive: revive,
    endGame: endGame,
    restart: restart,
    getHoles: function () { return _holes; },
    getHealth: function () { return _health; },
    getMaxHealth: function () { return Config.MAX_HEALTH; },
    getScore: function () { return _score; },
    getPhase: function () { return _phase; },
    getHitFx: function () { return _hitFx; },
    onStateChange: function (cb) { _onStateChange = cb; },
  };
})();
