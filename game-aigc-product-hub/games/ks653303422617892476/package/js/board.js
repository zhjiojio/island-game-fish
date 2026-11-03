/**
 * board.js — 换装匹配局面状态层
 *
 * 阶段流转：
 *   home ──[开始]──▶ select ──[选关卡]──▶ playing
 *   playing ──[全题完成]──▶ result
 *   playing ──[超时]──▶ result
 *   result ──[再来/下一关]──▶ playing / select
 *
 * 题目流程（每题）：
 *   idle → preview（点衣服 → 浮层叠加 1.5s 自动判）
 *   → correct / wrong → idle（下一题）/ 减错误机会
 *
 * 不做：
 *   - 不直接调用 canvas / ctx
 *   - 不触发广告
 *   - 不读取输入
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Board = M3.Board || {};

  // ── 常量 ─────────────────────────────────────────────────────────────────
  var TIME_LIMIT       = 120;   // 每关总秒数
  var WRONG_LIMIT      = 3;     // 初始错误机会
  var PREVIEW_DURATION = 1500;  // 选中衣服到自动判定的延迟 ms
  var DRAG_THRESHOLD   = 8;     // 小于该位移视为「点击」而非「拖拽」
  var DRESS_OPT_IDX    = 0;     // 触发换装立绘的槽位索引
  var CORRECT_SHOW     = 1500;  // 正确结果动画持续 ms（换装 + 绿勾展示）
  var WRONG_SHOW       = 600;   // 错误闪烁持续 ms
  var RESULT_DELAY     = 1200;  // 最终结算进场延迟 ms

  // ── 阶段枚举 ─────────────────────────────────────────────────────────────
  M3.Board.PHASE = {
    HOME    : 'home',
    SELECT  : 'select',
    PLAYING : 'playing',
    RESULT  : 'result',
  };

  // ── 内部状态 ──────────────────────────────────────────────────────────────
  var _phase         = M3.Board.PHASE.HOME;
  var _levelIdx      = 0;
  var _qIdx          = 0;          // 当前题目索引（0-based）
  var _qTotal        = 0;          // 本关题目总数
  var _wrongLeft     = WRONG_LIMIT; // 剩余错误机会（界面显示 "错误剩余:N"）
  var _timeLeft      = TIME_LIMIT;
  var _lastTick      = 0;
  var _running       = false;

  // 选项/预览/结果状态
  var _previewOptIdx = -1;    // 正在预览的选项索引 (-1=未选)
  var _previewTimer  = 0;     // 距离自动判定的剩余 ms
  var _resultPhase   = 'none'; // 'none' | 'correct' | 'wrong'
  var _resultTimer   = 0;     // 结果动画剩余 ms
  var _lockedOptIdx  = -1;    // 判定正确后持续显示的选项（换装叠加用）
  var _pendingAdvance = false; // 答对后等 CORRECT_SHOW 结束再推题

  // 提示
  var _hintActive  = false;   // 提示激活：高亮正确选项边框
  var _hintUsed    = false;   // 本题是否已用过提示（防连刷）

  // 拖拽（把衣服拖到人物身上）
  var _dragging   = false;
  var _dragOptIdx = -1;
  var _dragX      = 0;
  var _dragY      = 0;
  var _dragMoved  = 0;   // 累计移动距离，用于区分「点一下」和「拖」

  // 换装表现：把 0 号槽位的衣服拖到人物身上后置 true，
  // render.js 据此把「没穿衣服」立绘换成「穿好衣服」。
  var _dressed    = false;

  // 工具奖励
  var _bonusChances = 0;      // 本关额外增加的机会次数（统计用）

  // 结算
  var _finalDelay   = 0;      // 进入 RESULT 阶段的延迟 ms
  var _finishReason = 'win';  // 'win' | 'timeout'

  // 解锁进度
  var _maxUnlocked  = 0;

  // ── 只读属性 ──────────────────────────────────────────────────────────────
  Object.defineProperties(M3.Board, {
    phase          : { get: function () { return _phase;          }, enumerable: true },
    levelIdx       : { get: function () { return _levelIdx;       }, enumerable: true },
    qIdx           : { get: function () { return _qIdx;           }, enumerable: true },
    qTotal         : { get: function () { return _qTotal;         }, enumerable: true },
    wrongLeft      : { get: function () { return _wrongLeft;      }, enumerable: true },
    timeLeft       : { get: function () { return _timeLeft;       }, enumerable: true },
    previewOptIdx  : { get: function () { return _previewOptIdx;  }, enumerable: true },
    previewTimer   : { get: function () { return _previewTimer;   }, enumerable: true },
    dragging       : { get: function () { return _dragging;       }, enumerable: true },
    dragOptIdx     : { get: function () { return _dragOptIdx;     }, enumerable: true },
    dragX          : { get: function () { return _dragX;          }, enumerable: true },
    dragY          : { get: function () { return _dragY;          }, enumerable: true },
    dressed        : { get: function () { return _dressed;        }, enumerable: true },
    resultPhase    : { get: function () { return _resultPhase;    }, enumerable: true },
    resultTimer    : { get: function () { return _resultTimer;    }, enumerable: true },
    lockedOptIdx   : { get: function () { return _lockedOptIdx;   }, enumerable: true },
    hintActive     : { get: function () { return _hintActive;     }, enumerable: true },
    hintUsed       : { get: function () { return _hintUsed;       }, enumerable: true },
    finishReason   : { get: function () { return _finishReason;   }, enumerable: true },
    maxUnlocked    : { get: function () { return _maxUnlocked;    }, enumerable: true },
  });

  // ── 便捷查询 ──────────────────────────────────────────────────────────────

  M3.Board.isPlaying = function () {
    return _phase === M3.Board.PHASE.PLAYING;
  };

  /** 正在等待预览自动判定 */
  M3.Board.isPreviewing = function () {
    return _previewOptIdx >= 0 && _previewTimer > 0;
  };

  /** 正在展示结果动画 */
  M3.Board.isShowingResult = function () {
    return _resultPhase !== 'none' && _resultTimer > 0;
  };

  // ── 阶段切换 ──────────────────────────────────────────────────────────────

  M3.Board.goHome = function () {
    _phase   = M3.Board.PHASE.HOME;
    _running = false;
  };

  M3.Board.goSelect = function () {
    _phase   = M3.Board.PHASE.SELECT;
    _running = false;
  };

  M3.Board.startLevel = function (idx) {
    var level  = M3.Scene ? M3.Scene.getLevel(idx) : null;
    _levelIdx      = idx;
    _qIdx          = 0;
    _qTotal        = level ? level.questions.length : 0;
    _wrongLeft     = WRONG_LIMIT;
    _timeLeft      = TIME_LIMIT;
    _lastTick      = M3._now ? M3._now() : Date.now();
    _running       = true;
    _previewOptIdx = -1;
    _previewTimer  = 0;
    _resultPhase   = 'none';
    _resultTimer   = 0;
    _lockedOptIdx  = -1;
    _pendingAdvance = false;
    _hintActive    = false;
    _hintUsed      = false;
    _dragging      = false;
    _dragOptIdx    = -1;
    _dragMoved     = 0;
    _dressed       = false;
    _bonusChances  = 0;
    _finalDelay    = 0;
    _finishReason  = 'win';
    _phase         = M3.Board.PHASE.PLAYING;
  };

  M3.Board.restartLevel = function () {
    M3.Board.startLevel(_levelIdx);
  };

  // ── 玩家操作 ──────────────────────────────────────────────────────────────

  /**
   * 玩家点击某个衣服选项
   * @param {number} optIdx  0-3
   */
  M3.Board.selectOption = function (optIdx) {
    if (_phase !== M3.Board.PHASE.PLAYING)  return;
    if (_resultPhase !== 'none')             return; // 结果动画中不响应
    if (_previewTimer > 0)                   return; // 预览等待中不响应

    _previewOptIdx = optIdx;
    _previewTimer  = PREVIEW_DURATION;
    _hintActive    = false; // 选了以后隐藏提示高亮
  };

  /**
   * 是否可以进行操作（无结果动画、无预览等待）
   */
  M3.Board.canInteract = function () {
    return _phase === M3.Board.PHASE.PLAYING
        && _resultPhase === 'none'
        && _previewTimer <= 0;
  };

  // ── 拖拽（把衣服拖到人物身上）────────────────────────────────────────────

  /** 开始拖某个选项 */
  M3.Board.startDrag = function (optIdx, x, y) {
    if (!M3.Board.canInteract()) return false;
    _dragging   = true;
    _dragOptIdx = optIdx;
    _dragX      = x;
    _dragY      = y;
    _dragMoved  = 0;
    return true;
  };

  /** 拖动中 */
  M3.Board.moveDrag = function (x, y) {
    if (!_dragging) return;
    _dragMoved += Math.abs(x - _dragX) + Math.abs(y - _dragY);
    _dragX = x;
    _dragY = y;
  };

  /**
   * 松手：命中人物区域则确认选择，否则取消
   * @param {boolean} hitCharacter  是否落在人物/场景区
   * @returns {number} 确认的选项索引，-1 表示取消
   */
  M3.Board.endDrag = function (hitCharacter) {
    if (!_dragging) return -1;
    var idx = _dragOptIdx;
    _dragging   = false;
    _dragOptIdx = -1;

    // 0 号槽位是厨师围裙：真正拖到人物身上才触发换装立绘，
    // 原地点一下不算「穿上」，避免误触。
    if (hitCharacter && idx === DRESS_OPT_IDX && _dragMoved >= DRAG_THRESHOLD) {
      _dressed = true;
    }

    // 拖到人物身上 → 确认；或者几乎没动（等价点击）→ 也确认
    if (hitCharacter || _dragMoved < DRAG_THRESHOLD) {
      M3.Board.selectOption(idx);
      return idx;
    }
    return -1;
  };

  /** 脱下衣服（调试/重来时用） */
  M3.Board.undress = function () {
    _dressed = false;
  };

  /** 强制取消拖拽 */
  M3.Board.cancelDrag = function () {
    _dragging   = false;
    _dragOptIdx = -1;
    _dragMoved  = 0;
  };

  /**
   * 使用提示（激励视频成功后调用）
   * 将 _hintActive 置 true → render.js 读取后高亮正确选项边框
   */
  M3.Board.useHint = function () {
    _hintActive = true;
    _hintUsed   = true;
  };

  /**
   * +5次（激励视频成功后调用）
   */
  M3.Board.addChances = function (n) {
    var add = (n !== undefined) ? n : 5;
    _wrongLeft    += add;
    _bonusChances += add;
  };

  /**
   * 加时（激励视频成功后调用）
   */
  M3.Board.addTime = function (sec) {
    _timeLeft += (sec !== undefined) ? sec : 30;
  };

  // ── 每帧 tick ─────────────────────────────────────────────────────────────

  M3.Board.update = function () {
    var now = M3._now ? M3._now() : Date.now();
    var dt  = Math.min(now - _lastTick, 100);
    _lastTick = now;

    if (_phase !== M3.Board.PHASE.PLAYING) return;

    // ① 倒计时
    if (_running) {
      _timeLeft -= dt / 1000;
      if (_timeLeft <= 0) {
        _timeLeft     = 0;
        _running      = false;
        _finishReason = 'timeout';
        _finalDelay   = RESULT_DELAY;
      }
    }

    // ② 结算延迟 → 进入 RESULT
    if (!_running && _finalDelay > 0) {
      _finalDelay -= dt;
      if (_finalDelay <= 0) {
        _finalDelay = 0;
        _phase = M3.Board.PHASE.RESULT;
        M3.Board.saveProgress();
      }
      return;
    }

    // ③ 结果动画计时（correct 1500ms / wrong 600ms）
    if (_resultTimer > 0) {
      _resultTimer -= dt;
      if (_resultTimer <= 0) {
        _resultTimer = 0;
        if (_pendingAdvance) {
          // ── 答对：推进到下一题 ──
          _pendingAdvance = false;
          _resultPhase    = 'none';
          _lockedOptIdx   = -1;
          _previewOptIdx  = -1;
          _hintActive     = false;
          _hintUsed       = false;
          _qIdx++;
          if (_qIdx >= _qTotal) {
            // 全关通关
            _running      = false;
            _finishReason = 'win';
            _finalDelay   = RESULT_DELAY;
          }
        } else {
          // ── 答错：恢复可选状态 ──
          _resultPhase   = 'none';
          _previewOptIdx = -1;
        }
      }
      return; // 结果动画期间不处理预览 tick
    }

    // ④ 预览倒计时 → 自动判定
    if (_previewTimer > 0) {
      _previewTimer -= dt;
      if (_previewTimer <= 0) {
        _previewTimer = 0;
        _judgeAnswer();
      }
    }
  };

  // ── 私有：判断答案 ────────────────────────────────────────────────────────

  function _judgeAnswer() {
    var level = M3.Scene ? M3.Scene.getLevel(_levelIdx) : null;
    if (!level || !level.questions) return;

    var q       = level.questions[_qIdx];
    var correct = (_previewOptIdx === q.answer);

    if (correct) {
      _lockedOptIdx   = _previewOptIdx; // 保持衣服叠加显示
      _resultPhase    = 'correct';
      _resultTimer    = CORRECT_SHOW;
      _pendingAdvance = true;
    } else {
      _resultPhase    = 'wrong';
      _resultTimer    = WRONG_SHOW;
      _pendingAdvance = false;
      _wrongLeft      = Math.max(0, _wrongLeft - 1);
    }
  }

  // ── 持久化（占位） ────────────────────────────────────────────────────────

  M3.Board.saveProgress = function () {
    try {
      if (typeof ks !== 'undefined' && ks.setStorageSync) {
        ks.setStorageSync({ key: 'maxUnlocked', data: _maxUnlocked });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zc_maxUnlocked', String(_maxUnlocked));
      }
    } catch (e) {}
  };

  M3.Board.loadProgress = function () {
    try {
      if (typeof ks !== 'undefined' && ks.getStorageSync) {
        var r = ks.getStorageSync({ key: 'maxUnlocked' });
        if (r && r.data != null) _maxUnlocked = parseInt(r.data, 10) || 0;
      } else if (typeof localStorage !== 'undefined') {
        var v = localStorage.getItem('zc_maxUnlocked');
        if (v != null) _maxUnlocked = parseInt(v, 10) || 0;
      }
    } catch (e) {}
  };

  M3.Board.loadProgress();

})();
