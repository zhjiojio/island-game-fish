// ═════ v1.0.16 首帧 0 延迟：main.js 顶层立即 kick welcome 关键图 ═════
// 目的：welcome-char + title 在 M3.Game.start 前就已在解码，Welcome.draw 首帧秒画
(function _preloadWelcome(){
  try {
    var _pre = window.__PRELOAD_IMGS = window.__PRELOAD_IMGS || {};
    var _keys = ['assets/ui/welcome-char.png','assets/ui/title.png'];
    var _createImage = null;
    if (typeof ks !== 'undefined' && ks.createImage) _createImage = function(){ return ks.createImage(); };
    else if (typeof wx !== 'undefined' && wx.createImage) _createImage = function(){ return wx.createImage(); };
    else if (typeof Image !== 'undefined') _createImage = function(){ return new Image(); };
    if (_createImage){
      for (var i=0;i<_keys.length;i++){
        (function(k){
          try {
            var im = _createImage();
            _pre[k] = im;
            im.src = k;
          } catch(e){}
        })(_keys[i]);
      }
      try { console.log('[PRELOAD v1.0.16] kicked ' + _keys.length + ' welcome imgs at boot'); } catch(_){}
    }
  } catch(e){}
})();

(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.BUILD_VER = 'v1.3.3';
  // ⭐⭐⭐ v1.2.4 · 解锁策略调整：2797免费进入/2917+2744每日看广告/2797第3关起激励视频；CDN配置源对齐v3 ⭐⭐⭐
  console.log('[VERSION] 老铁眼真尖 ' + M3.BUILD_VER + ' · build 2026-09-03 · [MARKER v209] v1.3.3 新增7050/7051 levelTitle维度');

  // ─────────────────────────────────────────────────────────────────────────
  // 【快手小游戏环境文件加载】
  // 快手不走 index.html，由根目录 game.js require 本文件，再由此处按序加载依赖。
  // H5 浏览器走 index.html 的 <script> 标签，不进入本分支。
  // AI 生成游戏时按实际文件和依赖顺序填写，子文件夹用相对路径（如 './utils/helper.js'）。
  // ─────────────────────────────────────────────────────────────────────────
  if (typeof require === 'function') {
    require('./m3-init.js'); // 必须第一行：初始化 M3.Layout 等全局基础参数
    require('./telemetry.js'); // ⭐ v1.0.68 埋点上报（ks.reportScene 封装）必须第二行：立即打 JS_START 锚点
    require('./kwai-event-bus.js'); // 事件总线（平台能力基础，勿删）
    require('./kwai-ad-config.js'); // 广告位配置（平台能力基础，勿删）
    require('../api/kwai-login.js'); // 用户登录
    require('../api/kwai-ad.js');    // 广告（激励 / 插屏 / Banner）
    require('../api/kwai-share.js'); // 分享
    require('../api/kwai-open.js');  // ⭐ v0.0.54 用户信息 / 授权（欢迎页用）
    // ↓ 其他平台能力模块按需引入（根据游戏功能选择）
    // require('../api/kwai-base.js');       // 系统信息 / 生命周期 / 触摸事件
    // require('../api/kwai-render.js');     // 画布 / 帧率控制 / 字体 / 图片预加载
    // require('../api/kwai-ui.js');         // Toast / Modal / Loading / 胶囊按钮布局
    // require('../api/kwai-network.js');    // HTTP 请求 / 下载 / 上传 / WebSocket
    // require('../api/kwai-storage.js');    // 本地数据缓存
    // require('../api/kwai-file.js');       // 文件系统
    // require('../api/kwai-media.js');      // 视频 / 音频 / 图片管理
    // require('../api/kwai-device.js');     // 传感器 / 键盘 / 网络状态 / 振动
    // require('../api/kwai-open.js');       // 用户信息 / 授权 / Feed 流直出
    // require('../api/kwai-record.js');     // 对局回放录制
    // require('../api/kwai-repost.js');     // 主动转发
    // require('../api/kwai-shortcut.js');   // 添加到桌面
    // require('../api/kwai-siderbar.js');   // 侧边栏
    // require('../api/kwai-commonuse.js');  // 设为常用
    // require('../api/kwai-official.js');   // 官方号 / CP 服务号
    // require('../api/kwai-game-community.js');  // 游戏圈
    require('../api/kwai-subpackage.js');      // ⭐ v1.0.74 分包加载（启用）
    // require('../api/kwai-data-analysis.js');   // 数据分析上报
    //↓ 游戏文件（按依赖顺序填入，禁止在 game.js 等文件内再写 require）
    require('./subpackage-loader.js'); // ⭐ v1.0.74 子包按需加载管理器（必须在 feedback/levels 前）
    require('./feedback.js'); // 统一反馈：音效 + 震动
    require('./voice-packs.js'); // ⭐ v0.0.46 语音包配置
    require('./levels.js');   // 20 关卡数据 + 主题元信息
    require('./level-loader.js'); // ⭐ v1.0.99 远程 JSON 关卡下发（拉 CDN 覆盖 baseline）
    require('./welcome.js');  // ⭐ v0.0.54 全局欢迎/宣传/授权页
    require('./game.js');     // 老铁眼真尖核心玩法 + 渲染
  }

  var canvas = window.canvas;
  var ctx = canvas.getContext('2d');

  // ─────────────────────────────────────────────────────────────────────────
  // 【屏幕适配 + DPR + 安全区】
  // canvas 物理尺寸 = CSS 尺寸 × DPR，配合 setTransform 保证高清渲染。
  // M3.Layout 基础字段已由 m3-init.js 初始化，此处只负责 resize 更新。
  // 所有游戏内容的 Y 起点必须从 M3.Layout.safeTop 开始，禁止从 0 开始绘制。
  // ─────────────────────────────────────────────────────────────────────────
  function getSafeTop() {
    // 快手小游戏环境：从系统信息读取安全区
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        return (info.safeArea && info.safeArea.top) ? info.safeArea.top : 0;
      } catch (e) { return 0; }
    }
    return 0;
  }

  function resize() {
    var cssW = window.innerWidth || 375;   // CSS 逻辑像素宽（浏览器视口宽 / 快手屏幕宽），375 为 iPhone 6 兜底值
    var cssH = window.innerHeight || 667;  // CSS 逻辑像素高，667 为 iPhone 6 兜底值
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 更新布局参数
    M3.Layout.w = cssW;
    M3.Layout.h = cssH;
    M3.Layout.safeTop = getSafeTop();
    M3.Layout.usableH = cssH - M3.Layout.safeTop;
  }
  resize();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【统一时间源】
  // M3._now 已由 m3-init.js 定义，此处无需重复。
  // 所有主循环和动画逻辑统一使用 M3._now()，禁止直接调用 performance.now()。
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // 【占位绘制】
  // 仅用于模版验证，AI 生成游戏后此函数应被 render.js 中的绘制逻辑替代。
  // ─────────────────────────────────────────────────────────────────────────
  // 触摸/点击派发
  function bindInput(){
    function getXY(e){
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left:0, top:0 };
      return { x: (t.clientX || 0) - rect.left, y: (t.clientY || 0) - rect.top };
    }
    if (typeof canvas.addEventListener === 'function'){
      canvas.addEventListener('touchstart', function(e){
        var p = getXY(e); M3.Game.handleTap(p.x, p.y); e.preventDefault && e.preventDefault();
      }, { passive:false });
      canvas.addEventListener('touchmove', function(e){
        var p = getXY(e); M3.Game.handleMove(p.x, p.y); e.preventDefault && e.preventDefault();
      }, { passive:false });
      canvas.addEventListener('mousedown', function(e){
        var p = getXY(e); M3.Game.handleTap(p.x, p.y);
      });
      canvas.addEventListener('mousemove', function(e){
        if (e.buttons) { var p = getXY(e); M3.Game.handleMove(p.x, p.y); }
      });
    }
    // 快手小游戏原生触摸事件
    if (typeof ks !== 'undefined' && ks.onTouchStart){
      ks.onTouchStart(function(e){
        var t = e.touches && e.touches[0]; if (!t) return;
        M3.Game.handleTap(t.clientX || t.x, t.clientY || t.y);
      });
      ks.onTouchMove && ks.onTouchMove(function(e){
        var t = e.touches && e.touches[0]; if (!t) return;
        M3.Game.handleMove(t.clientX || t.x, t.clientY || t.y);
      });
    }
  }

  // 广告封装：优先走 window.KwaiAd（快手真广告），H5 环境用 fallback
  M3.KwaiAd = M3.KwaiAd || {};
  // ⭐ v1.0.6 全局激励广告 loading：所有调用点自动生效
  //   - 进入 showRewarded 立即置 state.adLoading=true（drawAdLoadingOverlay 拦截点击 + 显示 loading）
  //   - SDK 成功/失败/超时任何回调，都清掉 loading
  //   - 8s 硬超时兜底，防止广告 SDK 不回调把 UI 卡死
  M3.KwaiAd.showRewarded = function(cb){
    // ⭐ v1.0.69 埋点：广告入口被点击（C 组广告漏斗第 2 站）
    if (M3.Tele) M3.Tele.report(M3.Tele.SC.AD_ENTRY_CLICKED);
    var _adCallStart = Date.now();
    // 尝试拿到 state（game.js 里定义），置 loading
    var _state = (window.M3 && window.M3._state) || null;
    var _cleared = false;
    function clearLoading(){
      if (_cleared) return;
      _cleared = true;
      if (_state) { _state.adLoading = false; _state.adLoadingText = ''; }
    }
    if (_state) {
      _state.adLoading = true;
      _state.adLoadingText = '广告加载中...';
    }
    // 8s 硬超时兜底
    var toId = setTimeout(function(){
      clearLoading();
    }, 8000);
    function done(ok){
      clearTimeout(toId);
      clearLoading();
      // ⭐ v1.0.69 埋点：广告调用结束（区分成功曝光 / 失败）
      if (M3.Tele){
        if (ok){
          // 首次成功：认为下发+曝光成功都到位（SDK 层已完成完整曝光才 cb(true)）
          M3.Tele.report(M3.Tele.SC.AD_LOAD_OK, { costTime: Date.now() - _adCallStart });
          M3.Tele.report(M3.Tele.SC.AD_SHOW_END, { costTime: Date.now() - _adCallStart, dimension:{ result:'ended' } });
          M3.Tele.report(M3.Tele.SC.AD_REWARD_GRANTED);
        } else {
          M3.Tele.report(M3.Tele.SC.AD_SHOW_END, { costTime: Date.now() - _adCallStart, dimension:{ result:'failed' } });
        }
      }
      cb && cb(ok);
    }
    if (typeof window.KwaiAd !== 'undefined' && window.KwaiAd.showRewarded){
      window.KwaiAd.showRewarded(function(){ done(true); }, function(){ done(false); });
    } else {
      console.log('[Ad] fallback 激励视频（H5 预览模式）');
      setTimeout(function(){ done(true); }, 600);
    }
  };
  M3.KwaiAd.trySpawnInterstitial = function(levelNo){
    if (levelNo % 3 !== 0) return;
    if (typeof window.KwaiAd !== 'undefined' && window.KwaiAd.showInterstitial){
      window.KwaiAd.showInterstitial(function(){});
    } else {
      console.log('[Ad] fallback 插屏（第 ' + levelNo + ' 关）');
    }
  };

  // 初始化反馈模块（音效预加载 + 震动能力探测）
  if (M3.Feedback && M3.Feedback.init) { try { M3.Feedback.init(); } catch (e) {} }
  // ⭐ v0.0.46 应用上次选中的语音包（默认小美）
  // ⭐ v0.0.99 新增：如果上次存的是锁定音包且今日未解锁 → 强制回落到小美
  if (M3.Feedback && M3.Feedback.setVoicePack) {
    try {
      var lastPackId = M3.Feedback.getVoicePackId();
      var FREE_IDS = { xiaomei:1, xiaoshuai:1 };
      if (!FREE_IDS[lastPackId]){
        // 检查今日解锁记录
        var todayOK = false;
        try {
          var ksApi = (typeof ks !== 'undefined') ? ks : (typeof window!=='undefined' ? window.ks : null);
          var raw = ksApi && ksApi.getStorageSync ? ksApi.getStorageSync('laotie_voice_unlocks_v1') : (typeof localStorage!=='undefined' ? localStorage.getItem('laotie_voice_unlocks_v1') : '');
          if (raw){
            var obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            var d = new Date(); var today = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
            if (obj && obj.date === today && obj.ids && obj.ids[lastPackId]) todayOK = true;
          }
        } catch(_){}
        if (!todayOK){
          console.log('[VOICE v0.0.99] last pack ' + lastPackId + ' locked today, fallback to xiaomei');
          lastPackId = 'xiaomei';
        }
      }
      // 从 M3.VOICE_PACKS 里查完整对象再传（setVoicePack 需要 pack.clips）
      var lastPack = null;
      if (M3.VOICE_PACKS){
        for (var i=0;i<M3.VOICE_PACKS.length;i++){ if (M3.VOICE_PACKS[i].id === lastPackId){ lastPack = M3.VOICE_PACKS[i]; break; } }
      }
      if (!lastPack && M3.VOICE_PACKS && M3.VOICE_PACKS.length) lastPack = M3.VOICE_PACKS[0];
      if (lastPack) M3.Feedback.setVoicePack(lastPack);
      console.log('[VOICE v0.0.99] applied voice pack: ' + (lastPack && lastPack.id));
    } catch (e) { console.warn('[VOICE v0.0.99] apply fail', e); }
  }

  M3.Game.start(ctx, canvas);
  bindInput();

  // ⭐ v1.0.74 分包改造：voice-extra / scenes-spot / scenes-hunt / bgm-extra
  //    SubpkgLoader 在关卡进入时按需触发，详见 subpackage-loader.js

  // ─────────────────────────────────────────────────────────────────────────
  // 【主循环】
  // 每帧先 resize（幂等，尺寸未变时开销极低），再执行绘制。
  // AI 生成游戏后将 draw() 替换为 M3.Game.update() + M3.Render.draw() 等调用。
  // ─────────────────────────────────────────────────────────────────────────
  // ⭐ v1.2.9 首帧后静默预加载 voice-extra 子包（含所有角色 remaining_* 音频）
  var _voiceExtraPrefetched = false;
  function loop() {
    resize();
    if (M3.Game && M3.Game.update){
      M3.Game.update();
      M3.Game.draw();
    }
    if (!_voiceExtraPrefetched && M3.SubpkgLoader && M3.SubpkgLoader.prefetchVoiceExtra) {
      _voiceExtraPrefetched = true;
      try { M3.SubpkgLoader.prefetchVoiceExtra(); } catch(e){}
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
