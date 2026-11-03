/**
 * play/play.js — 玩法主流程控制器
 * 职责：
 *   - pickLevel(idx)：关卡级广告拦截 + 加载场景图 + 倒计时启动
 *   - update(dt)：倒计时 / 宽容 / mercy toast / 每帧逻辑
 *   - onCanvasTap(cx,cy)：命中判定 + 点对/点错处理
 *   - 通关/失败判定 → 弹窗
 *   - 各玩法模式通过 ModeRegistry 解耦（不直接 import mode 文件）
 * 依赖：CONFIG, RemoteConfig, Storage, Audio, Ads, Difficulty, Telemetry,
 *        Renderer, InputManager, UIKit, ModeRegistry, 各 modals
 * 导出：PlayController
 */
(function () {
  'use strict';

  // ── 游戏状态 ──────────────────────────────────────────────────────────────────
  var state = {
    level:       null,   // 当前关卡对象
    theme:       null,   // 当前主题对象
    time:        0,      // 剩余秒
    totalTime:   0,      // 关卡总秒（用于星级计算）
    running:     false,
    paused:      false,

    hits:        [],     // 已命中 odds 的索引列表
    totalOdds:   0,      // 该关总茬数

    // 分段计时
    _lastTick:   0,
    _tickAccum:  0,

    // 提示状态
    hintUsed:    0,      // 当前关已用提示次数
    hintArrow:   null,   // {x,y} 小手提示坐标（第 2 次提示）

    // 跳关
    skipAdCount: 0,

    // 场景图加载状态
    sceneReady:  false,
    sceneStarted:false,  // 倒计时已启动

    // 当前 mode 实例（由 ModeRegistry 创建）
    mode:        null,

    // 浮字动画列表
    floats:      [],     // [{x,y,text,t,life}]

    // 错误涟漪
    errRipples:  [],

    // 资源加载结果：关键资源失败会提示，非关键资源失败只记录并跳过
    assetLoad: null,
  };

  var PlayController = window.PlayController = {

    state: state,

    /**
     * 进入关卡
     * @param {number} idx  关卡全局 idx
     */
    pickLevel: function (idx, opts) {
      var level = RemoteConfig.getLevelByIdx(idx);
      if (!level) {
        console.error('[Play] level not found:', idx);
        return;
      }
      var theme = RemoteConfig.getTheme(level.themeId);

      // 关卡级广告拦截（freeCount 后）
      if (this._needLevelAd(theme, idx)) {
        // 不在广告页提前排图片请求；广告结束后由 _doPickLevel 先启动主题 BGM，
        // 再进入 ensureLevelAssets，保证主题音频的请求优先级最高。
        Ads.showRewarded(function (ok) {
          if (ok) {
            if (PlayController._markLevelAdUnlocked) {
              PlayController._markLevelAdUnlocked(theme.id);
            }
            PlayController._enterLevelWithAssets(level, theme, opts);
          }
        }, 'level_unlock');
        return;
      }
      return this._enterLevelWithAssets(level, theme, opts);
    },

    _doPickLevel: function (level, theme, opts) {
      // 进关前清空残留 toast，避免快速切主题时旧 toast 叠在新 toast 之上
      if (UIKit.clearToasts) UIKit.clearToasts();
      // mercy 检查
      var mercySecs = Difficulty.checkMercy(level.idx);
      var diff      = Difficulty.getDiff(level);

      // 重置状态
      state.level     = level;
      state.theme     = theme;
      // 所有需要倒计时的玩法统一使用 level.duration；换装未配置时沿用 80 秒默认值。
      var levelDuration = typeof level.duration === 'number'
        ? level.duration
        : (level.mode === 'dressup' ? CONFIG.DRESSUP_TIME_LIMIT : 0);
      state.totalTime = levelDuration + mercySecs + (diff.bonus || 0);
      state.time      = state.totalTime;
      state.running   = false;
      state.paused    = false;
      state.hits      = [];
      if (level.mode === 'puzzle' && level.scenes) {
        state.totalOdds = level.scenes.reduce(function (sum, scene) {
          return sum + (scene.odds || []).length;
        }, 0);
      } else {
        state.totalOdds = (level.odds || []).length;
      }
      state.hintUsed  = 0;
      state.hintArrow = null;
      state.sceneReady  = false;
      state.sceneStarted = false;
      state._nextThemeTransitioning = false;
      if (this._releaseThemeTransitionLock) this._releaseThemeTransitionLock();
      state.assetLoad = null;
      state.floats    = [];
      state._lastTick = M3._now();
      state._tickAccum = 0;
      // dressup 专属 state 字段清空，避免跨玩法残留匹配状态。
      state.dressup   = null;
      state.puzzle    = null;
      // 生命值 state（odds 类玩法点错扣命）同理清空，避免跨关卡/跨玩法残留上一关的
      // state.lives，交给下面的 mode.initState 重新按当前关卡 maxErrors 初始化。
      state.lives     = null;

      // 记录上次所在关
      Storage.setLastLevel(theme.id, level.idx);

      // 初始化 mode
      var modeCfg = CONFIG.GAMEPLAY_MODES[level.mode];
      if (!modeCfg) { console.error('[Play] unknown mode:', level.mode); return; }
      state.mode = ModeRegistry.create(level.mode, level, theme);

      // mode 专属 state 初始化（由 mode.initState 负责，PlayController 不关心具体玩法）
      if (state.mode && state.mode.initState) state.mode.initState(state);

      // 无计时模式跳过倒计时启动
      if (state.mode && !state.mode.needsCountdown()) {
        state.sceneStarted = true;
        state.running = false;
      }

      // 主题 BGM 必须在任何关卡/下一关图片预热前启动，优先发起主题 CDN 请求。
      // 用户听到主题音乐即可确认已进入正确主题。
      if (Audio.startThemeBgm) {
        Audio.startThemeBgm(theme);
      } else if (Audio.startBgmTrack) {
        Audio.startBgmTrack('in_level');
      }

      // 切换到游戏场景
      if (Audio.playLevelTransition) Audio.playLevelTransition();
      SceneManager.go('game');

      // 玩法指引 toast：仅从关卡列表进入主题时展示，3 秒
      var _willShowGuide = false;
      
      if (opts && opts.fromThemeList && level.mode !== 'dressup' && level.mode !== 'puzzle') {
        var modeName = (CONFIG.GAMEPLAY_MODES[level.mode] || {}).name || '';
        if (modeName) {
          _willShowGuide = true;
          UIKit.toast(modeName, 3000, 0.5, { w: 220, h: 38, radius: 8, fontSize: 15 });
        }
      }

      // mercy toast（有玩法指引 toast 时跳过，避免两个 toast 叠在一起）
      if (mercySecs > 0 && !_willShowGuide) {
        UIKit.toast('🎁 送你 ' + mercySecs + ' 秒');
        Telemetry.mercyTriggered(level.idx);
      }

      // 后台预热下一关（或下一主题第一关），趁玩家玩当前关时提前拉图
      this._preloadNextLevel(level);

      // 埋点
      Telemetry.levelEnter(level, false);
      Analytics.trackLevelEvent(level.idx, 'enter');

      // 进关播 intro 语音（story 有专属开场白，其余由 mode.getIntroAudio() 决定）。
      // 该语音本质是"新手教学"提示，只需要玩家第一次进入该玩法场景时播一次，
      // 不需要每次进关都重复播（旧 bug：每关都会播），用 Storage 持久化标记，
      // key 按具体语音 clip 区分，不同玩法/场景各自只播一次。
      var introKey = level.mode === 'story' ? 'scene1_intro' : (state.mode && state.mode.getIntroAudio());
      if (introKey && !Storage.get('introPlayed_' + introKey)) {
        Audio.play(introKey);
        Storage.set('introPlayed_' + introKey, true);
      }

    },

    _tryStartAfterSceneReady: function () {
      if (!state.sceneReady || state.sceneStarted) return;
      // 无计时模式不启动倒计时
      if (state.mode && !state.mode.needsCountdown()) return;
      // story 模式等待简报点击才开始计时
      if (state.level && state.level.mode === 'story') return;
      this._startCountdown();
    },

    _startCountdown: function () {
      state.sceneStarted = true;
      state.running      = true;
      state._lastTick    = M3._now();
    },

    startStoryCountdown: function () {
      if (!state.sceneStarted) this._startCountdown();
    },

    // ── 每帧 update ────────────────────────────────────────────────────────────
    update: function (dt) {
      // 无计时模式：只驱动浮字动画和 mode 逐帧逻辑
      if (state.mode && !state.mode.needsCountdown()) {
        if (!state.paused) {
          this._updateFloats(dt);
          state.mode.onTick(dt, state);
          if (state.mode.update) state.mode.update(dt);
        }
        return;
      }

      if (!state.running || state.paused) return;

      // 直接用 GameLoop 传入的逐帧 dt 累减（GameLoop 已把 dt clamp 到 100ms，
      // 天然防后台/长时间未渲染跳变），不再依赖"当前时间 - 上次 tick 时间戳"的
      // 墙钟差值计算——这套 _lastTick 方案在"倒计时暂停/恢复"（看广告加时、
      // lose-modal 打开期间 update 被跳过等）场景下极易因为忘记同步刷新
      // _lastTick 而把一整段被冻结的真实时间当成 elapsed 一次性/连续扣掉，
      // 表现为"加的时间瞬间飞走"或"暂停期间的等待时间也被扣掉"。dt 驱动完全
      // 不存在这个问题：只要 update() 没被调用，就不会有任何 dt 传进来参与扣减。
      state.time = Math.max(0, state.time - dt);
      state._lastTick = M3._now();

      // 有倒计时的玩法也可以收到逐帧 tick；通用倒计时统一由 state.time 维护。
      if (state.mode && state.mode.onTick) state.mode.onTick(dt, state);
      if (!state.running) return;

      // 最后 10s：tick 音 + 每整秒一次
      if (state.time <= CONFIG.HINT_LAST_SECS && state.time > 0) {
        var prevFloor = Math.floor(state.time + dt);
        var nowFloor  = Math.floor(state.time);
        if (prevFloor !== nowFloor) {
          Audio.playTick();
          if (nowFloor === CONFIG.HINT_LAST_SECS) Audio.play('almost_out');
        }
      }

      // 时间到
      if (state.time <= 0) {
        this._onTimeout();
        return;
      }

      // 浮字动画
      this._updateFloats(dt);

      // mode 每帧 update
      if (state.mode && state.mode.update) state.mode.update(dt);
    },

    _updateFloats: function (dt) {
      var now = M3._now();
      state.floats = state.floats.filter(function (f) {
        return now - f.t < f.life;
      });
    },

    // ── 点击处理 ──────────────────────────────────────────────────────────────
    onCanvasTap: function (cx, cy) {
      if (!state.running || !state.sceneReady) return;
      if (!state.mode) return;

      var result = state.mode.hitTest(cx, cy, state.hits);
      if (result.hit) {
        this._onCorrect(result.oddIdx, cx, cy);
      } else {
        this._onWrong(cx, cy);
      }
    },

    _onCorrect: function (oddIdx, cx, cy) {
      state.hits.push(oddIdx);
      if (state.hintArrow && state.hintArrow.oddIdx === oddIdx) state.hintArrow = null;
      var level  = state.level;
      var remain = state.totalOdds - state.hits.length;
      var isLast = remain === 0;

      // 最后一击不播 correct（爆音），播 final_hit
      if (!isLast) {
        Audio.playCorrect();
        if (remain <= 3) Audio.play('remaining_' + remain);
      }

      // 绿圈标记
      if (state.mode.onCorrect) state.mode.onCorrect(oddIdx, cx, cy);

      if (window.HUDView && HUDView.triggerDotFly) {
        // 飞行特效起点取绿圈位置（odd 中心投影），而非用户点击点，保证光尾从圈出来的地方起飞
        var flyFrom = state.mode.getCorrectScreenPos
          ? state.mode.getCorrectScreenPos(oddIdx, cx, cy)
          : { x: cx, y: cy };
        HUDView.triggerDotFly(state.hits.length - 1, flyFrom.x, flyFrom.y);
      }

      // narrative 旁白气泡（story 模式）
      var odd = level.odds && level.odds[oddIdx];
      if (odd && odd.narrative && state.mode.showNarrative) {
        state.mode.showNarrative(odd.narrative);
      }

      Storage.addStat('correct');
      Analytics.trackLevelEvent(level.idx, 'found');
      Telemetry.buttonClick('tap_correct', { levelIdx: String(level.idx) });

      if (isLast) {
        // 全部选对：先让所有命中标记闪一闪，播放结算前过渡音效，再进入结算画面
        if (state.mode.triggerAllFoundFlash) state.mode.triggerAllFoundFlash();
        Audio.playAllFoundFlash();
        setTimeout(function () { PlayController._onWin(); }, BaseMode.ALL_FOUND_FLASH_DURATION);
      }
    },

    _onWrong: function (cx, cy) {
      // 点错反馈：红色错误图标浮层贴在命中点上左右扭动淡出（原「-Ns」扣秒文字已废弃，
      // 点错不再扣倒计时秒数，改为扣生命值，见下方 state.lives 分支）
      state.floats.push({
        x: cx, y: cy,
        icon: 'mnvIconWrong',
        t: M3._now(), life: 700
      });

      Audio.playWrong();
      InputManager.addErrRipple(cx, cy);

      // 随机吐槽文案
      var lines = RemoteConfig.tauntLines;
      if (lines && lines.length) {
        UIKit.toast(lines[Math.floor(Math.random() * lines.length)]);
      }

      Storage.addStat('wrong');
      Analytics.trackLevelEvent(state.level.idx, 'wrong');
      Telemetry.buttonClick('tap_wrong', { levelIdx: String(state.level.idx) });

      // 生命值扣减（odds 类玩法：hidden/spot/hunt/story，见 base-mode.js initState；
      // dressup 走自己的 onWrongCallback + state.dressup，不会命中这里）
      if (state.lives) {
        state.lives.used++;
        if (state.lives.used >= state.lives.max) {
          this._onLivesExhausted();
        }
      }
    },

    _onLivesExhausted: function () {
      if (!state.running) return;
      state.running = false;
      Difficulty.addFailStreak(state.level.idx);
      Audio.playLose();
      Analytics.trackLevelEvent(state.level.idx, 'lose');
      Telemetry.levelExit(state.level, 'lose', (state.totalTime - state.time) * 1000);
      SceneManager.open('lose-modal', {
        level: state.level,
        remaining: state.totalOdds - state.hits.length,
        title: state.mode.getLoseTitle(),
        subtitle: state.mode.getLoseSubtitle(state),
        reviveLabel: state.mode.getReviveLabel(),
        limitType: 'count',
        reviveAmount: state.mode.getReviveAmount('count') // 显式传给卡片文案，与 onRevive 生效数值保持同一来源
      });
    },

    // ── 通用 mode 回调 ──────────────────────────────────────────────────────
    onModeCorrect: function (outfit, fromX, fromY, dotIdx) {
      if (state.mode && state.mode.onCorrectCallback) {
        state.mode.onCorrectCallback(state, { outfit: outfit });
      }
      // 换装玩法：飞行特效从衣服拖拽释放的位置飘出，飞向对应进度点
      if (window.HUDView && HUDView.triggerDotFly && typeof fromX === 'number' && typeof dotIdx === 'number') {
        HUDView.triggerDotFly(dotIdx, fromX, fromY);
      }
    },

    onModeWrong: function (outfit, x, y) {
      if (state.mode && state.mode.onWrongCallback) {
        state.mode.onWrongCallback(state, { outfit: outfit, x: x, y: y });
      }
    },

    onModeComplete: function () {
      this._onWin();
    },

    // ── 通关/失败 ──────────────────────────────────────────────────────────────
    _onWin: function () {
      state.running = false;
      var level     = state.level;

      var stars     = state.mode.calcStars(state);
      var beatPct   = state.mode.calcBeatPct(state);

      if (Audio.playWin) Audio.playWin();
      Audio.play('pass');

      Storage.markLevelPassed(level.idx);
      Storage.addStat('levelPass');
      Difficulty.resetStreak(level.idx);
      Analytics.trackLevelEvent(level.idx, 'win');
      Telemetry.levelExit(level, 'win', (state.totalTime - state.time) * 1000);

      // 检查是否主题最后一关
      var themeLevels = RemoteConfig.getLevelsByTheme(level.themeId);
      var curLevelPos = themeLevels.findIndex(function (lv) { return lv.idx === level.idx; });
      var lastLevel   = themeLevels[themeLevels.length - 1];
      var isChapterEnd = lastLevel && lastLevel.idx === level.idx;

      // 「上次所在关」推进为「通关后的下一关」：pickLevel() 进关时已把 lastLevel 记成
      // 当前正在玩的这一关，若这里不推进，玩家通关后点「返回首页」→ 再次进入该主题时，
      // home.js handleThemeEnter 仍会用 getLastLevel 读到刚通关的这一关，导致重玩本关而不是
      // 进入下一关（旧 bug）。章节最后一关通关后没有下一关可推进，保持不变即可。
      if (!isChapterEnd && curLevelPos >= 0 && curLevelPos < themeLevels.length - 1) {
        Storage.setLastLevel(level.themeId, themeLevels[curLevelPos + 1].idx);
      }

      // 章节最后一关且有下一主题 → 走 win-modal（显示「下一主题」按钮），
      // 无下一主题或 dressup 玩法 → 保持原有逻辑（chapter-done / story-reveal / win-modal）
      var _hasNextTheme = false;
      if (isChapterEnd) {
        var _themes = RemoteConfig.themes || [];
        var _curThemeIdx = -1;
        for (var _ti = 0; _ti < _themes.length; _ti++) {
          if (String(_themes[_ti].id) === String(level.themeId)) { _curThemeIdx = _ti; break; }
        }
        _hasNextTheme = _curThemeIdx >= 0 && _curThemeIdx < _themes.length - 1;
      }

      // 前两个主题已通过广告解锁后，不立即打断玩家进入新主题；
      // 等玩家把刚解锁的下一个主题完整玩通，再弹出「解锁全部主题」弹窗。
      if (isChapterEnd && Storage.get(CONFIG.STORAGE_KEYS.unlockAllPromptShown)) {
        Storage.remove(CONFIG.STORAGE_KEYS.unlockAllPromptShown);
        var unlockNextLevel = null;
        if (_hasNextTheme) {
          var unlockNextTheme = _themes[_curThemeIdx + 1];
          var unlockNextLevels = RemoteConfig.getLevelsByTheme(unlockNextTheme.id);
          unlockNextLevel = unlockNextLevels && unlockNextLevels[0];
        }
        SceneManager.open('unlock-all-overlay', { nextLevel: unlockNextLevel });
        return;
      }

      if (level.mode === 'dressup' || level.mode === 'puzzle') {
        SceneManager.open('win-modal', {
          level: level,
          stars: stars,
          beatPct: beatPct,
          isChapterEnd: isChapterEnd,
          theme: state.theme
        });
      } else if (isChapterEnd && !_hasNextTheme) {
        SceneManager.open('chapter-done', { theme: state.theme, isChapterEnd: true });
      } else if (level.mode === 'story' && level.nextHook) {
        SceneManager.open('story-reveal', { level: level, stars: stars });
      } else {
        SceneManager.open('win-modal', { level: level, stars: stars, beatPct: beatPct, isChapterEnd: isChapterEnd, theme: state.theme });
      }

      // 每 3 关插屏
      var passed = Object.keys(Storage.get(CONFIG.STORAGE_KEYS.passedLevels) || {}).length;
      if (passed % CONFIG.INTERSTITIAL_INTERVAL === 0) {
        setTimeout(function () { Ads.trySpawnInterstitial(); }, 500);
      }

      // 通关阶梯埋点
      var thresholds = [3, 5, 10];
      thresholds.forEach(function (n) {
        if (passed === n) Telemetry.report(7010 + thresholds.indexOf(n) + 1, { count: String(n) });
      });
    },

    _onTimeout: function () {
      state.running = false;
      if (state.mode && state.mode.onTimeout) state.mode.onTimeout(state);
      var remaining = state.totalOdds - state.hits.length;
      if (state.mode && state.mode.getDressupState) {
        var dressupState = state.mode.getDressupState();
        remaining = dressupState.totalPairs - dressupState.matchedCount;
      }
      Difficulty.addFailStreak(state.level.idx);
      Audio.playLose();
      Analytics.trackLevelEvent(state.level.idx, 'lose');
      Telemetry.levelExit(state.level, 'lose', state.totalTime * 1000);
      SceneManager.open('lose-modal', {
        level: state.level,
        remaining: remaining,
        title: state.mode.getLoseTitle(),
        subtitle: state.mode.getLoseSubtitle(state),
        reviveLabel: state.mode.getReviveLabel(),
        limitType: 'time',
        reviveAmount: state.mode.getReviveAmount('time') // 显式传给卡片文案，与 onRevive 生效数值保持同一来源
      });
    },

    // ── 放大（新模版底部道具栏「放大」按钮，按玩法可配置开关，见 CONFIG.getShowZoom）──
    // 交互模型：未放大时点击 → 一键放大到预设倍数、自动对焦画面中间（zoomInPreset），
    // 图标切换为「缩小」；已放大时点击 → 还原为 1 倍（resetZoom），图标切回「放大」。
    // 两种状态下都可以继续用双指捏合/单指拖拽自由调整缩放与位置，
    // 见下方 InputManager.onPinch/onPan 全局注册 + base-mode.js applyPinch。
    useZoom: function () {
      if (!state.mode || !state.mode.isZoomed) return;
      Telemetry.adEntryExposed('zoom');
      if (state.mode.isZoomed()) {
        state.mode.resetZoom();
        // UIKit.toast('已还原');
      } else {
        state.mode.zoomInPreset();
        // UIKit.toast('🔍 已放大，可继续双指/拖动调整');
      }
    },

    /** 缩放/平移手势是否应该在当前帧生效（供 InputManager.setGestureMode / _onPinch / _onPan 共用） */
    _zoomGestureOk: function () {
      return !!(state.mode && state.level &&
        SceneManager.current() === 'game' && !SceneManager.topOverlay() &&
        CONFIG.getShowZoom(state.level.mode));
    },

    /**
     * 双指缩放回调（由 InputManager.onPinch 全局注册，见本文件底部）。
     * 委托给当前 mode 实例的 applyPinch（见 base-mode.js），单图/双图玩法通用。
     */
    _onPinch: function (scaleDelta, dxScreen, dyScreen) {
      if (!this._zoomGestureOk()) return;
      var refFit = state.mode._fit || state.mode._fitA || state.mode._fitB;
      if (state.mode.applyPinch) state.mode.applyPinch(scaleDelta, dxScreen, dyScreen, refFit);
    },

    /**
     * 单指拖拽平移回调（由 InputManager.onPan 全局注册；见 core/input.js 「手势模式」，
     * 单指按下后移动超过阈值会转为持续平移，而不是误判为点击）。放大到 1 倍时平移会被
     * applyPinch 内部的 clamp 自动钳制为无效果，不需要在此额外判断 isZoomed。
     */
    _onPan: function (dxScreen, dyScreen) {
      if (!this._zoomGestureOk()) return;
      var refFit = state.mode._fit || state.mode._fitA || state.mode._fitB;
      if (state.mode.applyPinch) state.mode.applyPinch(1, dxScreen, dyScreen, refFit);
    },

    // ── 绘制 ──────────────────────────────────────────────────────────────────
    draw: function () {
      if (!state.mode) return;

      // 背景
      var W = M3.Layout.w, H = M3.Layout.h;
      UIKit.drawFlowingBackground(W, H);

      // 紫色分割条：层级只能高于背景图，不能盖住舞台场景图，须在场景绘制之前画
      var HUDPre = window.HUDView;
      if (HUDPre && HUDPre.drawDividers) HUDPre.drawDividers(state);

      // 场景绘制（委托给 mode）
      state.mode.draw(state);

      // 浮字
      this._drawFloats();

      // 舞台点击热区（priority 0，最低，让 HUD 按钮优先命中）
      var _stage = CONFIG.getLayoutRegions(state.level && state.level.mode).stage;
      // 拼图玩法只接受“从缩略图拖到目标区域”的操作，舞台空白点击不能
      // 复用找茬类的通用 onCanvasTap，否则会被当成一次点错并触发错误反馈。
      if (!state.level || state.level.mode !== 'puzzle') {
        InputManager.add({
          x: _stage.x,
          y: _stage.y,
          w: _stage.w,
          h: _stage.h,
          priority: 0,
          label: 'stage-tap',
          onTap: function (cx, cy) { PlayController.onCanvasTap(cx, cy); }
        });
      }

      // HUD
      var HUD = window.HUDView;
      if (HUD) {
        var areas = HUD.draw(state);
        InputManager.addAll(areas);
      }

      // mode 覆盖层（HUD 之后绘制，用于需要盖住 HUD 的全屏元素，如 story 简报）
      if (state.mode.drawOverlay) state.mode.drawOverlay(state);
    },

    _drawFloats: function () {
      var now = M3._now();
      state.floats.forEach(function (f) {
        var age   = now - f.t;
        var alpha = Math.max(0, 1 - age / f.life);

        if (f.icon) {
          // 错误图标浮层：原地左右扭一扭 + 淡出（幅度随淡出衰减，不上飘）
          var src   = CONFIG.uiAsset(f.icon);
          var entry = src ? TextureManager.get(src) : null;
          var size  = f.size || 40;
          var shakeAmp = 7 * alpha;
          var dx = Math.sin(age / 45) * shakeAmp;
          if (entry) {
            Renderer.drawImage(src, f.x - size / 2 + dx, f.y - size / 2, size, size, alpha);
          } else {
            Renderer.drawCircle(f.x + dx, f.y, size / 2, {
              fill: 'rgba(255,68,68,' + alpha.toFixed(2) + ')'
            });
          }
          return;
        }

        var y = f.y - (age / f.life) * 30;
        Renderer.drawText(f.text, f.x, y, {
          fontSize: 16,
          color: f.color || '#ff4444',
          strokeColor: '#000',
          strokeWidth: 2,
          align: f.align || 'center'
        });
      });
    },

    /** 返回关卡列表（失败弹窗关闭时调用） */
    goHome: function () {
      state.running = false;
      state.level   = null;
      Audio.startBgmTrack('select_level');
      SceneManager.go('home');
    },

  };

  // 全局注册一次双指缩放 + 单指平移监听 + 手势模式判定（模块加载时注册，贯穿整个游戏
  // 生命周期，具体是否生效由 _zoomGestureOk 内部按当前场景/玩法配置判断，不需要每次
  // 进关卡单独注册/注销）。setGestureMode 决定 core/input.js 是否启用「延迟 tap + 移动
  // 转平移 + 双指立即取消」这套手势判定——只在放大功能开启的关卡里启用，避免影响
  // 首页/换装拖拽等场景的即时点击手感。
  if (window.InputManager) {
    if (InputManager.onPinch) {
      InputManager.onPinch(function (scaleDelta, dxScreen, dyScreen) {
        PlayController._onPinch(scaleDelta, dxScreen, dyScreen);
      });
    }
    if (InputManager.onPan) {
      InputManager.onPan(function (dxScreen, dyScreen) {
        PlayController._onPan(dxScreen, dyScreen);
      });
    }
    if (InputManager.setGestureMode) {
      InputManager.setGestureMode(function () {
        return PlayController._zoomGestureOk();
      });
    }
  }

  // Jest/独立调试直接加载 play.js 时，自动补加载扩展模块；生产入口仍显式声明依赖。
  if (typeof require === 'function') {
    require('./asset-loader.js');
    require('./reward-flow.js');
  }
})();
