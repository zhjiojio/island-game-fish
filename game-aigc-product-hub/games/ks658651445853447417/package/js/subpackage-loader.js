/**
 * subpackage-loader.js — 老铁眼真尖 · 子包按需加载管理器 v1.0.77
 * ─────────────────────────────────────────────────────────────────
 * 管理 7 个子包的按需加载（ui-welcome 已回归主包）：
 *
 *   【进入游戏时】
 *   ui-gameplay         — 通关弹窗 UI（win-confetti/win-bg/win-glow/win-title/banner-blue）
 *                         进入第1关前静默预加载
 *   voice-extra         — 非默认语音包（kuergou/lala/longaotian/xiaoshuai）
 *
 *   【hidden 主题1 分层】
 *   scenes-hidden-core  — 第4-11关图（lv4/3/14/15/7/8/10/9）; 进入第1关时静默预加载
 *   scenes-hidden-extra — 第14-16、26、36-38关图（lv11/16/5/17/12/13/18）; 第11关通关后预加载
 *
 *   【其他主题】
 *   scenes-spot         — 找不同主题场景图（themeId:2）
 *   scenes-hunt         — 寻物主题场景图（themeId:3/4）
 *   bgm-extra           — 额外 BGM（bgm_2/bgm_3，BGM 已走 CDN，子包备用）
 *
 * 路径重写映射：
 *   assets/scenes/spot/         → subpackages/scenes-spot/...
 *   assets/scenes/spot-lv10-12/ → subpackages/scenes-spot/...
 *   assets/scenes/hunt/         → subpackages/scenes-hunt/...
 *   assets/scenes/hunt-city/    → subpackages/scenes-hunt/...
 *   assets/scenes/hidden/<f>    → subpackages/scenes-hidden-core/... (core 文件)
 *   assets/scenes/hidden/<f>    → subpackages/scenes-hidden-extra/... (extra 文件)
 *   assets/audio/voices/<pack>/ → subpackages/voice-extra/... (非 xiaomei)
 *   assets/ui/win-* /banner-blue → subpackages/ui-gameplay/...
 *
 * 加载时机（hidden 主题分层策略）：
 *   主包：lv1/2/6（第1-3关，idx:0-2）
 *   scenes-hidden-core：lv4/3/14/15/7/8/10/9（第4-11关，idx:3-10）; 进入第1关时静默预加载
 *   scenes-hidden-extra：后期关卡（idx≥13）; 第11关通关后静默预加载
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // 是否处于快手小游戏环境
  function isKsEnv() {
    return typeof ks !== 'undefined' && typeof ks.loadSubpackage === 'function';
  }

  // 子包加载状态
  var _loaded = {};    // { name: true/false/'loading' }
  var _callbacks = {}; // { name: [fn, ...] }

  // hidden-core 中的文件（第4-11关）
  var HIDDEN_CORE_FILES = {
    'lv4.jpg':true, 'lv3.jpg':true, 'lv14.jpg':true, 'lv15.jpg':true,
    'lv7.jpg':true, 'lv8.jpg':true, 'lv10.jpg':true, 'lv9.jpg':true
  };
  // hidden-extra 中的文件（第14-16、26、36-38关）
  var HIDDEN_EXTRA_FILES = {
    'lv5.jpg':true, 'lv11.jpg':true, 'lv12.jpg':true,
    'lv13.jpg':true, 'lv16.jpg':true, 'lv17.jpg':true, 'lv18.jpg':true
  };
  // ui-gameplay 中的文件
  // ⭐ banner-blue.png 已从 git 历史恢复（v1.0.98 清理素材时被误删，导致各弹窗标题背景缺失 + 稳定 404）
  var UI_GAMEPLAY_FILES = {
    'win-bg.png':true, 'win-title.png':true, 'banner-blue.png':true,
    'theme5-brief-lv1.png':true
  };

  // 加载单个子包，内部去重（队列等待模式）
  function _load(name, onDone) {
    if (_loaded[name] === true) {
      if (onDone) onDone(null);
      return;
    }
    // 非 ks 环境（H5 预览）：直接当作成功，路径保持原样
    if (!isKsEnv()) {
      _loaded[name] = true;
      if (onDone) onDone(null);
      return;
    }
    // 已在加载中，排队等待
    if (_loaded[name] === 'loading') {
      _callbacks[name] = _callbacks[name] || [];
      if (onDone) _callbacks[name].push(onDone);
      return;
    }
    _loaded[name] = 'loading';
    _callbacks[name] = onDone ? [onDone] : [];

    console.log('[SubpkgLoader] 开始加载子包:', name);
    var task = ks.loadSubpackage({
      name: name,
      success: function (res) {
        console.log('[SubpkgLoader] ✅ 子包加载成功:', name, res && res.path);
        _loaded[name] = true;
        var cbs = _callbacks[name] || [];
        _callbacks[name] = [];
        for (var i = 0; i < cbs.length; i++) { try { cbs[i](null); } catch(e){} }
      },
      fail: function (err) {
        console.warn('[SubpkgLoader] ❌ 子包加载失败:', name, err && err.errorMsg);
        _loaded[name] = false;
        var cbs = _callbacks[name] || [];
        _callbacks[name] = [];
        for (var i = 0; i < cbs.length; i++) { try { cbs[i](err); } catch(e){} }
      }
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(function (res) {
        console.log('[SubpkgLoader] 进度 ' + name + ': ' + res.progress + '%');
      });
    }
  }

  // ─── 对外 API ────────────────────────────────────────────

  /**
   * 根据关卡 idx/themeId/mode 按需加载对应子包
   * @param {number} idx      全局关卡索引
   * @param {number} themeId
   * @param {string} mode     'hidden' | 'spot' | 'hunt'
   * @param {Function} onReady  回调（err）
   */
  function loadForLevel(idx, themeId, mode, onReady, realLevelIdx) {
    // ⭐ v1.2.4 场景图已全量 CDN 化，scenes-spot / scenes-hunt / scenes-hidden-* 子包不再需要。
    //   按 mode 判断：story 仍需 ui-gameplay 子包（简报皮肤）；其余直接 onReady。
    if (mode === 'story') {
      _load('ui-gameplay', onReady);
    } else {
      if (onReady) onReady(null);
    }
  }

  /**
   * 进入 ui-gameplay（通关弹窗等）时加载
   * 建议在进入第1关时调用（不阻塞，静默）
   */
  function prefetchUiGameplay() {
    _load('ui-gameplay', function(err) {
      if (err) console.warn('[SubpkgLoader] ui-gameplay 预加载失败:', err);
      else console.log('[SubpkgLoader] ui-gameplay 预加载完成');
    });
  }

  /**
   * 切换语音包时预加载 voice-extra（非 xiaomei 包需要）
   * ⭐ v1.2.9 xiaomei 也有 remaining_* 在 voice-extra 子包，需一并加载
   */
  function loadVoicePack(packId, onReady) {
    _load('voice-extra', onReady);
  }

  /**
   * 进入游戏首帧后静默预加载 voice-extra 子包（remaining_* 音频不在 CDN，需分包）
   * ⭐ v1.2.9 所有角色的 remaining_1/2/3_a/b/c.mp3 均已移入 voice-extra 子包
   */
  function prefetchVoiceExtra() {
    _load('voice-extra', function(err) {
      if (err) console.warn('[SubpkgLoader] voice-extra 预加载失败:', err);
      else console.log('[SubpkgLoader] voice-extra 预加载完成（含 remaining_* 音频）');
    });
  }

  /**
   * 将旧的本地资源路径重写为子包路径
   */
  function rewritePath(src) {
    if (!src || typeof src !== 'string') return src;
    if (src.indexOf('http') === 0) return src; // CDN URL 不变

    // ⭐⭐ v1.0.112 场景图分包重写【整体退役】⭐⭐
    //  故障：真机报「[loadImg] 子包路径加载失败, 重置以待子包就绪」，
    //        lv2_a/lv2_b 等永远加载不出来（onerror 里刻意不设 imgFailed → 死等子包，永不重试成功）
    //  根因：素材早已全量迁到 CDN，分包目录被清空了，但这里的重写规则没跟着退役。
    //        rewritePath 抢在 _rewriteToCDN 之前把 'assets/scenes/spot/lv2_a.jpg'
    //        改写成 'subpackages/scenes-spot/assets/scenes/spot/lv2_a.jpg' —— 该文件不存在。
    //  实测分包现状：scenes-spot 只剩 lv50_a/lv50_b，scenes-hunt / scenes-hidden-core /
    //        scenes-hidden-extra 里【一张图都没有】（只有个 game.js 占位）。
    //  修法：这三类一律不再重写，直接落到 game.js 的 _rewriteToCDN 走 CDN。
    //        已全量验证 41 个 URL 全部 HTTP 200（s2_*/hidden_*/cover_* 三条规则全覆盖），
    //        含 lv50 → s2_lv50_a/b.jpg 也在 CDN 上（200），所以分包里那 2 张图也不必再走分包。
    //  ⚠️ 铁律：改分包重写规则前，必须先 `find subpackages/<name> -type f` 确认文件真的在。
    //          分包为空却仍重写 = 资源 100% 加载失败，且这条 onerror 分支不会报 imgFailed，
    //          表现为「无限 loading / 图永远出不来」，极难定位。

    // ui-gameplay（通关弹窗）
    if (src.indexOf('assets/ui/') === 0) {
      var uiName = src.replace('assets/ui/', '');
      if (UI_GAMEPLAY_FILES[uiName])
        return 'subpackages/ui-gameplay/' + src;
    }

    // ⭐ v1.3.0 remaining_* 音频（所有语音包）均在 voice-extra 子包
    //   非 remaining 文件全部走 CDN（feedback._rewriteAudioCDN 处理），不经过 rewritePath
    //   rewritePath 只负责：图片走子包 + remaining_* 走 voice-extra
    if (src.indexOf('assets/audio/voices/') === 0 && src.indexOf('/remaining_') >= 0) {
      return 'subpackages/voice-extra/' + src;
    }

    return src;
  }

  /**
   * 检查子包是否已加载
   */
  function isLoaded(name) {
    return _loaded[name] === true;
  }

  M3.SubpkgLoader = {
    loadForLevel: loadForLevel,
    prefetchUiGameplay: prefetchUiGameplay,
    prefetchVoiceExtra: prefetchVoiceExtra,
    loadVoicePack: loadVoicePack,
    rewritePath: rewritePath,
    isLoaded: isLoaded,
    _load: _load  // 供调试
  };

  console.log('[SubpkgLoader] 初始化完成（ks环境=' + isKsEnv() + '）');
})();
