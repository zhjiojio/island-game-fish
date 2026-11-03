/**
 * 老铁眼真尖 · v3（对齐参考图 · 图铺满整卡 · 引导不遮场景）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var Game = M3.Game = {};
  var ctx, canvas;
  var W, H;

  var C = {
    // 旧深紫金（保留兼容，逐步弃用）
    BG:'#1a1015', BG2:'#241820', PANEL:'#2b1e26',
    GOLD:'#f9d67a', GOLD2:'#c68a2a', GOLD_LINE:'#a67023',
    INK:'#1a1015', WHITE:'#ffffff', SUB:'#c8b5aa',
    RED:'#ff3f5a', PINK:'#ff5aa8', GRN:'#6ee27a', BLUE:'#5ac8ff', YEL:'#ffd466',
    // ✨ 新「蓝天云朵糖果」主题
    SKY_TOP:'#7ec8ff', SKY_BOT:'#c8ecff', CLOUD:'#ffffff',
    PAPER:'#fffdf5', PAPER_LINE:'#e8e0cf', TAPE:'#ffcf4d', TAPE2:'#ffe08a',
    WOOD_TOP:'#ffd76a', WOOD_MID:'#f6a422', WOOD_BOT:'#c8701a',
    CANDY_BLUE:'#3fb5ff', CANDY_GRN:'#5fd35a', CANDY_RED:'#ff5a5a'
  };

  var state = {
    scene:'welcome', themeId:null, levelIdx:0, level:null, themePage:0,
    time:0, found:{}, foundCount:0, running:false, guide:true,
    waitingForScene:false, storyIntroOpen:false,
    lastSecondUpdate:0, marks:[], floats:[], hintUsed:false, skipUsed:false,
    hintArrows:[], hintBubble:null, shake:0,
    win:false, lose:false, chapterDone:false, laotieLine:'', laotieUntil:0,
    imgs:{}, imgLoading:{}, imgFailed:{}, tapAreas:[], err:null,
    // ⭐ v1.0.59: 桌面快捷方式状态 —— 仅在真的添加成功后 =true，隐藏「添加桌面」按钮
    _shortcutInstalled: (function(){
      try {
        var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
        if (ks && ks.getStorageSync){ return ks.getStorageSync('laotie_shortcut_installed') === 1 || ks.getStorageSync('laotie_shortcut_installed') === '1'; }
        if (typeof localStorage !== 'undefined') return localStorage.getItem('laotie_shortcut_installed') === '1';
      } catch(_e){}
      return false;
    })()
  };
  // ⭐ v1.0.6 暴露 state 给 main.js 的 KwaiAd.showRewarded 使用（全局广告 loading）
  window.M3 = window.M3 || {}; window.M3._state = state;

  // ⭐ v0.0.98 语音包解锁体系：小美/小帅默认可用，其他人看 1 个激励视频解锁，仅当天有效
  var VOICE_FREE_IDS = { xiaomei: 1, xiaoshuai: 1 };
  var VOICE_UNLOCK_KEY = 'laotie_voice_unlocks_v1';
  function _todayStamp(){
    var d = new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  }
  function _loadUnlocks(){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      var raw = ks && ks.getStorageSync ? ks.getStorageSync(VOICE_UNLOCK_KEY) : (typeof localStorage!=='undefined' ? localStorage.getItem(VOICE_UNLOCK_KEY) : '');
      if (!raw) return { date:'', ids:{} };
      var obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (!obj || obj.date !== _todayStamp()) return { date:'', ids:{} };
      return obj;
    } catch(e){ return { date:'', ids:{} }; }
  }
  function _saveUnlocks(obj){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      var s = JSON.stringify(obj);
      if (ks && ks.setStorageSync) ks.setStorageSync(VOICE_UNLOCK_KEY, s);
      else if (typeof localStorage!=='undefined') localStorage.setItem(VOICE_UNLOCK_KEY, s);
    } catch(e){}
  }
  function isVoicePackUnlocked(id){
    if (VOICE_FREE_IDS[id]) return true;
    var u = _loadUnlocks();
    return !!(u && u.ids && u.ids[id]);
  }
  function markVoicePackUnlocked(id){
    var u = _loadUnlocks();
    if (!u.date) u = { date:_todayStamp(), ids:{} };
    u.ids[id] = 1;
    _saveUnlocks(u);
  }

  // ⭐ v0.2.3 主题「每日激励视频解锁」体系（复用 _todayStamp）
  //   主题3「寻找隐藏物」每天需看 1 个激励视频解锁，跨零点自动重置
  var THEME_UNLOCK_KEY = 'laotie_theme_unlocks_v1';
  function _loadThemeUnlocks(){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      var raw = ks && ks.getStorageSync ? ks.getStorageSync(THEME_UNLOCK_KEY) : (typeof localStorage!=='undefined' ? localStorage.getItem(THEME_UNLOCK_KEY) : '');
      if (!raw) return { date:'', ids:{} };
      var obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (!obj || obj.date !== _todayStamp()) return { date:'', ids:{} };
      return obj;
    } catch(e){ return { date:'', ids:{} }; }
  }
  function _saveThemeUnlocks(obj){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      var s = JSON.stringify(obj);
      if (ks && ks.setStorageSync) ks.setStorageSync(THEME_UNLOCK_KEY, s);
      else if (typeof localStorage!=='undefined') localStorage.setItem(THEME_UNLOCK_KEY, s);
    } catch(e){}
  }
  function isThemeUnlockedToday(themeId){
    var u = _loadThemeUnlocks();
    return !!(u && u.ids && u.ids[themeId]);
  }
  function markThemeUnlockedToday(themeId){
    var u = _loadThemeUnlocks();
    if (!u.date) u = { date:_todayStamp(), ids:{} };
    u.ids[themeId] = 1;
    _saveThemeUnlocks(u);
  }
  // 暴露到 M3 命名空间供其他模块使用
  M3.isThemeUnlockedToday = isThemeUnlockedToday;
  M3.markThemeUnlockedToday = markThemeUnlockedToday;

  // ⭐ v1.0.51 CDN 分包 URL 重写：主包排除的场景图/封面自动改走 CDN
  //   v1.2.4 本地 scenes/covers/* 和 scenes/hidden/* 已全部删除，远程 JSON 的 cover/scene
  //   统一为 http 开头的 CDN 地址，不再需要本地相对路径 → CDN 的重写规则。
  //   保留 M3._rewriteToCDN 作为 no-op 兼容入口（welcome.js 等历史调用点不报错）。
  function _rewriteToCDN(src){
    return src;
  }
  M3._rewriteToCDN = _rewriteToCDN;

  // 场景图未就绪时禁止倒计时。弱网/冷缓存下图片可能经历多次 CDN 重试，
  // 以前 running 会在发起加载前置 true，导致玩家看到图片时已经“时间到”。
  function _isSceneImgReady(src){
    var img = src && state.imgs[src];
    return !!(img && img.width > 0 && img.height > 0);
  }
  function _tryStartAfterSceneReady(){
    if (!state.waitingForScene || state.scene !== 'game' || !state.level) return false;
    var lv = state.level;
    var ready = lv.mode === 'spot'
      ? _isSceneImgReady(lv.sceneA) && _isSceneImgReady(lv.sceneB)
      : _isSceneImgReady(lv.scene);
    if (!ready) return false;
    state.waitingForScene = false;
    if (lv.mode === 'story' && state.storyIntroOpen) {
      state.running = false;
      state.guide = false;
      try { console.log('[LEVEL] scene ready, waiting story brief · idx=' + lv.idx); } catch(_e){}
      return true;
    }
    state.running = true;
    state.lastSecondUpdate = M3._now();
    state.guide = true;
    state.guideStart = state.lastSecondUpdate;
    state.guideAge = 0;
    try { console.log('[LEVEL] scene ready, countdown start · idx=' + lv.idx + ' · time=' + state.time); } catch(_e){}
    return true;
  }
  function _startStoryCountdown(){
    if (!state.level || state.level.mode !== 'story' || state.waitingForScene) return false;
    state.storyIntroOpen = false;
    // 主题5开场阅读期间不消耗时间；点击开始时从完整时长重新计时。
    var storyStartTime = Number(state.storyStartTime);
    if (!isFinite(storyStartTime) || storyStartTime <= 0) {
      storyStartTime = Math.max(15, Math.round(Number(state.level.duration) || 60));
    }
    state.time = storyStartTime;
    state.running = true;
    state.lastSecondUpdate = M3._now();
    state.guide = true;
    state.guideStart = state.lastSecondUpdate;
    state.guideAge = 0;
    try { console.log('[STORY] brief dismissed, countdown start · idx=' + state.level.idx + ' · time=' + state.time); } catch(_e){}
    return true;
  }
  Game.startStoryCountdown = _startStoryCountdown;

  function loadImg(src){
    // ⭐ v1.0.76 分包改造：先通过 SubpkgLoader 重写路径（子包内资源自动映射）
    if (M3.SubpkgLoader && M3.SubpkgLoader.rewritePath) {
      var _rewritten = M3.SubpkgLoader.rewritePath(src);
      if (_rewritten !== src) {
        // 路径已重写：用新路径加载，但缓存 key 保持原路径（渲染层查找不需要改）
        if (state.imgLoading[src] || state.imgs[src]) return null;
        state.imgLoading[src] = true;
        var _subImg = null;
        try {
          if (typeof ks !== 'undefined' && ks.createImage) _subImg = ks.createImage();
          else if (typeof Image !== 'undefined') _subImg = new Image();
        } catch(_e){}
        if (_subImg) {
          _subImg.onload = function(){ state.imgs[src] = _subImg; state.imgLoading[src] = false; _tryStartAfterSceneReady(); };
          _subImg.onerror = function(){
            // 失败可能是子包未加载：不进 imgFailed，而是重置为未加载状态，子包加载完还能重试
            console.warn('[loadImg] 子包路径加载失败, 重置以待子包就绪:', _rewritten);
            state.imgLoading[src] = false;
            // 不设置 imgFailed，这样子包加载完后再次调用 loadImg 时可以重试
          };
          try { _subImg.src = _rewritten; } catch(_e){ state.imgLoading[src]=false; }
        }
        return null;
      }
    }
    // ⭐ v1.0.53: cache key = 原路径, 网络 URL = CDN 重写。禁止改 src 变量！
    var _netSrc = _rewriteToCDN(src);
    if (state.imgLoading[src]) return null;
    // ⭐ v1.0.16 首帧 0 延迟：优先复用 main.js 顶层预热的 img（可能已解码完）
    try {
      var _pre = window.__PRELOAD_IMGS && window.__PRELOAD_IMGS[src];
      if (_pre) {
        if (_pre.width > 0) {
          state.imgs[src] = _pre;
          state.imgLoading[src] = false;
          try { delete window.__PRELOAD_IMGS[src]; } catch(_){}
          _tryStartAfterSceneReady();
          return null;
        }
        // 未解码完 → 挂 onload 直接把预热对象接管过来
        state.imgLoading[src] = true;
        _pre.onload = function(){ state.imgs[src] = _pre; state.imgLoading[src] = false; _tryStartAfterSceneReady(); };
        _pre.onerror = function(){ state.imgFailed[src] = true; state.imgLoading[src] = false; };
        try { delete window.__PRELOAD_IMGS[src]; } catch(_){}
        return null;
      }
    } catch(_){}
    state.imgLoading[src] = true;
    var img = null;
    var _tStart = Date.now();
    try {
      // 快手/微信小游戏兼容
      if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
      else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
      else if (typeof Image !== 'undefined') img = new Image();
      else { state.imgFailed[src] = true; state.imgLoading[src] = false; return null; }
    } catch(e){ state.imgFailed[src] = true; state.imgLoading[src] = false; return null; }
    img.onload = function(){
      state.imgs[src] = img; state.imgLoading[src] = false;
      _tryStartAfterSceneReady();
      // ⭐ v1.0.69 埋点：首次场景图加载完成（A 组启动漏斗 · CDN vs 本地对比）
      if (M3.Tele && !M3.Tele.has(M3.Tele.SC.SCENE_IMG_LOADED) && /assets\/scenes\//.test(src)){
        M3.Tele.report(M3.Tele.SC.SCENE_IMG_LOADED, {
          costTime: Date.now() - _tStart,
          dimension: { imgSrc: (_netSrc !== src ? 'cdn' : 'local') }
        });
      }
    };
    img.onerror = function(){
      // CDN 失败 → 回退本地路径
      if (_netSrc !== src) { try { img.src = src; } catch(_e){} return; }
      state.imgFailed[src] = true; state.imgLoading[src] = false;
    };
    // ⭐ v1.0.10 单图 6 秒超时兜底：某张卡死也不阻塞整个加载
    setTimeout(function(){
      if (state.imgLoading[src] && !state.imgs[src]) {
        try { console.log('[LOAD] timeout ' + src); } catch(_){}
        state.imgFailed[src] = true;
        state.imgLoading[src] = false;
      }
    }, 6000);
    // 相对 & 绝对路径双兜底
    try { img.src = _netSrc; } catch(e){ state.imgFailed[src] = true; state.imgLoading[src] = false; }
    return null;
  }
  // ⭐ v1.0.53 暴露给 welcome.js 用（LAZY_COVERS 背景加载依赖 window.loadImg）
  try { window.loadImg = loadImg; M3.loadImg = loadImg; } catch(_){}
  function preload(){
    // ⭐ v1.0.76 分包改造：preload 只加载主包资源；子包资源由各自的预加载时机触发
    // themes cover 和 levels scene 现通过 SubpkgLoader.rewritePath 重写路径（各关卡进入时）
    // ── 不在此处批量预加载关卡图（已迁至子包），避免子包未加载时 404 ──
    // (M3.LEVELS||[]).forEach(function(l){ ... }) 暂停批量预加载

    // ⭐ 全局背景图预加载（welcome / theme_select / game 页共用）
    loadImg('assets/global_bg.png');
    // ⭐ AIGC 生成的首页大标题图
    loadImg('assets/ui/title.png');
    // ⭐ 通关弹窗星星切图
    loadImg('assets/ui/star-on.png');
    loadImg('assets/ui/star-off.png');
    loadImg('assets/ui/timer-bg.png');
    loadImg('assets/ui/btn-back.png');
    loadImg('assets/ui/btn-settings-game.png');
    loadImg('assets/ui/tag-hot.png');
    loadImg('assets/ui/tag-hard.png');
    loadImg('assets/ui/tag-new.png');
    loadImg('assets/ui/tag-coming.png');
    // ⭐ 底部四个入口切图
    loadImg('assets/ui/btn-settings.png');
    loadImg('assets/ui/btn-unlock.png');
    loadImg('assets/ui/btn-desktop.png');
    loadImg('assets/ui/btn-share.png');
    // ⭐ v0.0.77 引导手势小图
    loadImg('assets/ui/tap-hand.png');
    loadImg('assets/ui/hint-tap-hand.png');
    loadImg('assets/ui/avatar-frame.png');
    loadImg('assets/ui/card-bg.png');
    loadImg('assets/ui/star.png');
    // ⭐ 主题翻页箭头
    loadImg('assets/ui/a.png');
    loadImg('assets/ui/aa.png');
    // ⭐ v1.0.77 welcome-char 回归主包，在 preload 时直接加载
    loadImg('assets/ui/welcome-char.png');
    // ⭐ v1.0.78 提前预加载用户头像（从缓存读取 avatar URL）
    try {
      var _su = null;
      if (typeof ks !== 'undefined' && ks.getStorageSync) _su = ks.getStorageSync('laotie_user');
      if ((!_su || !_su.avatar) && typeof localStorage !== 'undefined') {
        var _ss = localStorage.getItem('laotie_user');
        if (_ss) { try { _su = JSON.parse(_ss); } catch(_e){} }
      }
      if (_su && _su.avatar) loadImg(_su.avatar);
    } catch(_e) {}
    // ⭐ v1.0.76 启动后静默预加载 ui-gameplay（通关弹窗UI）
    try {
      if (M3.SubpkgLoader) {
        M3.SubpkgLoader.prefetchUiGameplay();
      }
    } catch(_e) {}
  }

  // 在按钮右上角贴一个粉色圆角胶囊角标（右上出框，无旋转）
  // opts: { total: 需看次数, done: 已看次数, displayTotal: 初始角标展示的次数（仅改文案，不影响 total/done 逻辑） }
  //   - total=1: 显示「看视频」
  //   - total>1 & done<total: 显示「还需看 X 个」
  //   - total>1 & done=0：初次显示「看视频 xN」（N 可被 displayTotal 覆盖），看过 1 次后变「还需看 X 个」
  function drawAdBadge(bx, by, bw, opts){
    opts = opts || {};
    var total = opts.total || 1;
    var done  = opts.done  || 0;
    var remain = Math.max(total - done, 0);
    if (remain<=0) return;
    var label;
    var showTotal = (opts.displayTotal > 0) ? opts.displayTotal : total;
    if (total<=1) label = '看视频';
    else if (done<=0) label = '看视频 x'+showTotal;
    else label = '还需看 '+remain+' 个';
    // 胶囊尺寸：宽自适应，高固定
    setFont(10*S, 'bold');
    var textW = ctx.measureText(label).width;
    var badH = ps(20);
    var badW = Math.max(ps(44), textW + ps(16));
    var badR = badH / 2; // 完全圆角 → 胶囊
    // 右上角出框居中对齐按钮右侧
    var ax = bx + bw - badW + ps(8);
    var ay = by - badH * 0.55;
    // 阴影
    fillRR(ax + ps(1), ay + ps(2), badW, badH, badR, 'rgba(0,0,0,0.28)');
    // 主体：粉色填充
    fillRR(ax, ay, badW, badH, badR, '#F4798A');
    // 内部上半高光
    ctx.save();
    ctx.beginPath(); rr(ax + ps(2), ay + ps(1.5), badW - ps(4), badH * 0.5, badR); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(ax, ay, badW, badH * 0.55);
    ctx.restore(); _lastBaseline = '';
    // 深棕描边
    strokeRR(ax, ay, badW, badH, badR, '#7A2A30', ps(1.8));
    // 白色文字
    textStroke(label, ax + badW/2, ay + badH/2 + ps(0.5), 10*S, '#ffffff', 'rgba(80,0,10,0.45)', 'center', ps(1.4));
  }

  // 视口：375×667 逻辑，按短边缩放居中
  var AD_ICON = 'assets/ui/ad-icon.png';

  var VW = 375, VH = 667, S = 1, OX = 0, OY = 0;
  function refreshLayout(){
    W = M3.Layout.w; H = M3.Layout.h;
    S = Math.min(W / VW, H / VH);
    OX = Math.round((W - VW * S) / 2);
    OY = Math.round((H - VH * S) / 2);
  }
  function px(x){ return OX + x * S; }
  function py(y){ return OY + y * S; }
  function ps(v){ return v * S; }

  // 绘制工具
  function rr(x,y,w,h,r){
    r = Math.max(0, Math.min(r, w/2, h/2));
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function fillRR(x,y,w,h,r,color){ ctx.fillStyle = color; ctx.beginPath(); rr(x,y,w,h,r); ctx.fill(); }
  function strokeRR(x,y,w,h,r,color,lw){ ctx.strokeStyle = color; ctx.lineWidth = lw||2; ctx.beginPath(); rr(x,y,w,h,r); ctx.stroke(); }
  // ⭐ v0.0.47 上圆角 / 下直角（弹窗底部去圆角）
  function rrTop(x,y,w,h,r){
    r = Math.max(0, Math.min(r, w/2, h/2));
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.lineTo(x+w, y+h);
    ctx.lineTo(x, y+h);
    ctx.lineTo(x, y+r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  function fillRRTop(x,y,w,h,r,color){ ctx.fillStyle = color; ctx.beginPath(); rrTop(x,y,w,h,r); ctx.fill(); }
  function strokeRRTop(x,y,w,h,r,color,lw){ ctx.strokeStyle = color; ctx.lineWidth = lw||2; ctx.beginPath(); rrTop(x,y,w,h,r); ctx.stroke(); }

  // 统一字体：小游戏环境字体名建议保守；加粗+高清渲染
  // v0.1.0 优化：缓存最近一次 font 字符串，相同时跳过赋值，减少每帧 30+ 次 ctx.font 开销
  var _lastFontStr = '';
  var _lastBaseline = '';
  function setFont(size, weight){
    var f = (weight||'bold') + ' ' + Math.round(size) + 'px sans-serif';
    if (f !== _lastFontStr){ ctx.font = f; _lastFontStr = f; }
    if (_lastBaseline !== 'middle'){ ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
  }
  function text(t, x, y, size, color, align, weight){
    setFont(size, weight); ctx.textAlign = align||'left';
    ctx.fillStyle = color||'#fff'; ctx.fillText(t, x, y);
  }
  function textStroke(t, x, y, size, fill, stroke, align, lw){
    setFont(size, 'bold'); ctx.textAlign = align||'left';
    ctx.lineWidth = lw || Math.max(3, size*0.18);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke; ctx.strokeText(t, x, y);
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  function goldButton(x,y,w,h,label,size){
    var g = ctx.createLinearGradient(0,y,0,y+h);
    g.addColorStop(0,'#fce9a9'); g.addColorStop(0.5,C.GOLD); g.addColorStop(1,C.GOLD2);
    fillRR(x,y,w,h,h/2,g);
    strokeRR(x,y,w,h,h/2,C.GOLD_LINE,2);
    textStroke(label, x+w/2, y+h/2, size||16*S, '#5a3810', '#fff8e1', 'center', 2);
  }
  // 糖果风按钮（新双色分割样式）
  // color: 'blue'|'green'|'gold'|'red' | withPlay 是否带 ▶
  function candyButton(x,y,w,h,label,size,color,withPlay){
    var palette = {
      blue:  { hi:'#7FD8FF', lo:'#1A8AE8', shadow:'rgba(0,50,120,0.40)', stroke:'#0a3a6a', txtStroke:'#0a2a50' },
      green: { hi:'#ABF489', lo:'#87EF57', shadow:'rgba(0,70,0,0.38)',   stroke:'#1a5c00', txtStroke:'#003008' },
      gold:  { hi:'#FFD362', lo:'#FFA61A', shadow:'rgba(100,50,0,0.40)', stroke:'#7a4000', txtStroke:'#3a1800' },
      red:   { hi:'#ff9a9a', lo:'#c22a2a', shadow:'rgba(100,0,0,0.40)',  stroke:'#7a0000', txtStroke:'#380000' }
    };
    var p = palette[color] || palette.blue;
    var r = Math.min(h/2, ps(9));
    var splitY = y + h * 0.46;
    // 底部立体阴影
    fillRR(x + ps(1), y + ps(5), w, h, r, p.shadow);
    // 下半深色
    ctx.save(); ctx.beginPath(); rr(x, y, w, h, r); ctx.clip();
    var _btnGrad = ctx.createLinearGradient(x, y, x, y+h);
    _btnGrad.addColorStop(0, p.hi); _btnGrad.addColorStop(1, p.lo);
    ctx.fillStyle = _btnGrad; ctx.fillRect(x, y, w, h);
    // 分割高光线已移除
    ctx.restore(); _lastBaseline = '';
    // 描边
    strokeRR(x, y, w, h, r, p.stroke, ps(2.5));
    // ▶ 播放图标
    var textX = x + w/2;
    if (withPlay){
      var iconR = h*0.24, ix = x + h*0.55, iy = y + h/2;
      fillRR(ix - iconR*1.1, iy - iconR*0.8, iconR*2.2, iconR*1.6, iconR*0.4, 'rgba(0,0,0,0.30)');
      ctx.beginPath();
      ctx.moveTo(ix - iconR*0.35, iy - iconR*0.5);
      ctx.lineTo(ix + iconR*0.55, iy);
      ctx.lineTo(ix - iconR*0.35, iy + iconR*0.5);
      ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      textX = x + w/2 + iconR*0.9;
    }
    // 文字居中
    _lastBaseline = '';
    textStroke(label, textX, y+h/2, size||16*S, '#ffffff', p.txtStroke, 'center', Math.max(3, ps(3)));
  }

  // ⭐ 橙色按钮（游戏内「提示」按钮）—— 参考切图重绘：大圆角+外框+内高光
  function drawOrangeBtn(x, y, w, h, label, size){
    var r = Math.min(ps(9), h/2);
    // 阴影
    fillRR(x, y + ps(5), w, h, r, 'rgba(90,30,0,0.45)');
    // 外圈描边
    fillRR(x, y, w, h, r, '#8B2800');
    // 主体渐变 FFD362→FFA61A
    ctx.save();
    ctx.beginPath(); rr(x + ps(3), y + ps(3), w - ps(6), h - ps(6), r - ps(2)); ctx.clip();
    var grad = ctx.createLinearGradient(0, y + ps(3), 0, y + h);
    grad.addColorStop(0, '#FFD362'); grad.addColorStop(1, '#FFA61A');
    ctx.fillStyle = grad; ctx.fillRect(x + ps(3), y + ps(3), w - ps(6), h - ps(6));
    ctx.restore(); _lastBaseline = '';
    // 文字
    _lastBaseline = '';
    textStroke(label, x + w/2, y + h/2, size||16*S, '#ffffff', '#5a2000', 'center', Math.max(3, ps(3)));
  }

  // ⭐ 绿色按钮（游戏内「跳过本关」按钮）—— 参考切图重绘：大圆角+外框+内高光
  function drawGreenBtn(x, y, w, h, label, size){
    var r = Math.min(ps(9), h/2);
    // 阴影
    fillRR(x, y + ps(5), w, h, r, 'rgba(0,60,0,0.40)');
    // 外圈描边
    fillRR(x, y, w, h, r, '#1a5000');
    // 主体渐变 ABF489→87EF57
    ctx.save();
    ctx.beginPath(); rr(x + ps(3), y + ps(3), w - ps(6), h - ps(6), r - ps(2)); ctx.clip();
    var grad = ctx.createLinearGradient(0, y + ps(3), 0, y + h);
    grad.addColorStop(0, '#ABF489'); grad.addColorStop(1, '#87EF57');
    ctx.fillStyle = grad; ctx.fillRect(x + ps(3), y + ps(3), w - ps(6), h - ps(6));
    ctx.restore(); _lastBaseline = '';
    // 文字
    _lastBaseline = '';
    textStroke(label, x + w/2, y + h/2, size||16*S, '#ffffff', '#003008', 'center', Math.max(3, ps(3)));
  }

  // 木牌标题（参考图 3/4 黄橙木牌）－ w 传 0 = 根据 label 自适应宽度
  function woodTitle(cx, cy, w, h, label, size){
    // ⭐ 宽度自适应：text.width + 内边距*2，并使用实际字体测量
    if (!w || w < 10){
      setFont(size || 16*S, 'bold');
      var m = ctx.measureText(label).width;
      w = m + ps(36);   // 左右各预留 18px 内边距
    } else {
      // 即使传了固定宽，也保证不溢出：字宽 + 内边距超过就扩宽
      setFont(size || 16*S, 'bold');
      var m2 = ctx.measureText(label).width;
      var need = m2 + ps(36);
      if (need > w) w = need;
    }
    var r = h/2;
    // 底部黑影
    fillRR(cx-w/2, cy-h/2+ps(4), w, h, r, 'rgba(0,0,0,0.4)');
    // 主体
    var g = ctx.createLinearGradient(0, cy-h/2, 0, cy+h/2);
    g.addColorStop(0,'#ffcf5b'); g.addColorStop(0.5,'#f6a422'); g.addColorStop(1,'#c8701a');
    fillRR(cx-w/2, cy-h/2, w, h, r, g);
    // 上半高光
    ctx.save(); ctx.beginPath(); rr(cx-w/2+ps(6), cy-h/2+ps(4), w-ps(12), h*0.38, h*0.19); ctx.clip();
    var hi = ctx.createLinearGradient(0, cy-h/2, 0, cy-h/2+h*0.42);
    hi.addColorStop(0,'rgba(255,255,255,0.75)'); hi.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=hi; ctx.fillRect(cx-w/2, cy-h/2, w, h*0.42); ctx.restore();
    // 厚黑描边
    strokeRR(cx-w/2, cy-h/2, w, h, r, '#1a1015', Math.max(2.5, ps(3)));
    // 左右挂钉小圆
    ctx.fillStyle='#8a5410'; ctx.beginPath(); ctx.arc(cx-w/2+ps(10), cy, ps(3), 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+w/2-ps(10), cy, ps(3), 0, Math.PI*2); ctx.fill();
    // 文字白字厚黑描边
    textStroke(label, cx, cy, size||18*S, '#ffffff', '#1a1015', 'center', Math.max(3, ps(3)));
  }
  // ⭐ 切图版星星（通关弹窗专用）：加载成功用图片，否则 fallback 到原生绘制
  function drawStarImg(cx, cy, size, filled){
    var key = filled ? 'assets/ui/star-on.png' : 'assets/ui/star-off.png';
    var img = state.imgs && state.imgs[key];
    if (img && img.width > 0){
      var d = size * 2;
      try { ctx.drawImage(img, cx - size, cy - size, d, d); } catch(e){}
    } else {
      drawStar(cx, cy, size, filled);
    }
  }
  function drawStar(cx,cy,size,filled){
    ctx.save(); ctx.translate(cx,cy); ctx.beginPath();
    for (var i=0;i<10;i++){
      var r = i%2===0 ? size : size*0.45;
      var a = i*Math.PI/5 - Math.PI/2;
      var x = Math.cos(a)*r, y = Math.sin(a)*r;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    if (filled){
      var g = ctx.createLinearGradient(0,-size,0,size);
      g.addColorStop(0,'#fff2b8'); g.addColorStop(1,C.GOLD2);
      ctx.fillStyle = g; ctx.fill();
    } else { ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fill(); }
    ctx.strokeStyle = C.GOLD_LINE; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  function drawBadge(cx,cy,size,txt,color){
    ctx.save(); ctx.translate(cx,cy);
    ctx.beginPath();
    var spikes = 10, r1 = size, r2 = size*0.72;
    for (var i=0;i<spikes*2;i++){
      var r = i%2===0 ? r1 : r2;
      var a = i*Math.PI/spikes;
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    textStroke(txt, 0, 0, size*1.0, '#fff', color, 'center', 2);
    ctx.restore();
  }

  // ─── v1.3.1 埋点辅助函数 ─────────────────────────────────────
  // 统一按钮点击上报（SC 7053）
  function _reportBtnClick(btnId, location, options){
    if (!M3.Tele) return;
    var opts = options || {};
    M3.Tele.report(M3.Tele.SC.BUTTON_CLICK, {
      costTime: state._levelStartTs ? (Date.now() - state._levelStartTs) : 0,
      dimension: {
        btnId:    btnId,
        location: location,
        levelIdx: String(state.levelIdx >= 0 ? state.levelIdx : -1),
        themeId:  String((state.level && state.level.themeId) || ''),
        isAd:     opts.isAd ? '1' : '0',
        adSlot:   opts.adSlot || ''
      }
    });
  }
  // 进入关卡上报（SC 7050）
  function _reportLevelEnter(idx, isRetry){
    if (!M3.Tele) return;
    var lv = M3.LEVELS[idx] || {};
    // lv.title 格式："第9关 · 露天电影"，直接上报方便数仓按场景名聚合
    M3.Tele.report(M3.Tele.SC.LEVEL_ENTER, {
      sinceStart: true,
      dimension: {
        levelIdx:  String(idx),
        themeId:   String(lv.themeId || ''),
        levelTitle: lv.title || '',    // e.g. "第9关 · 露天电影"（含主题内序号+场景名）
        mode:      lv.mode || 'hidden',
        isRetry:   isRetry ? '1' : '0'
      }
    });
  }
  // 离开关卡上报（SC 7051）
  function _reportLevelExit(result){
    if (!M3.Tele) return;
    var cost = state._levelStartTs ? (Date.now() - state._levelStartTs) : 0;
    M3.Tele.report(M3.Tele.SC.LEVEL_EXIT, {
      costTime: cost,
      dimension: {
        levelIdx:   String(state.levelIdx >= 0 ? state.levelIdx : -1),
        themeId:    String((state.level && state.level.themeId) || ''),
        levelTitle: (state.level && state.level.title) || '',  // e.g. "第9关 · 露天电影"
        mode:       (state.level && state.level.mode) || 'hidden',
        result:     result  // 'win' | 'lose' | 'back'
      },
      metric: { costMs: cost }
    });
  }

  // ─── 场景切换 ───
  // ☁️ 蓝天点云背景（全站统一底，替代旧深紫金 C.BG）
  function drawSkyBg(){
    var bg = state.imgs && state.imgs['assets/global_bg.png'];
    if (bg && bg.width && bg.height){
      // 按比例 cover 居中铺满全屏
      var s = Math.max(W / bg.width, H / bg.height);
      var dw = bg.width * s, dh = bg.height * s;
      var dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);
      return;
    }
    // 兄底：图片未加载时用升色渐变
    var g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, C.SKY_TOP); g.addColorStop(1, C.SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  }
  Game.gotoThemes = function(){
    // ⭐ v1.3.1 E组埋点：玩中途按返回时上报 LEVEL_EXIT back（仅在关卡进行中触发）
    try { if (state.scene === 'game' && !state.win && !state.lose) _reportLevelExit('back'); } catch(_e){}
    state.scene='theme_select'; state.running=false;
    state.chapterDone=false;   // ⭐ 章节完结面板随离场复位
    // ⭐ v1.0.74 Analytics: 屏幕进入 home（主题选择大厅）
    try { if (M3.Analytics) M3.Analytics.screenEnter('home'); } catch(_){}
    // ⭐ v0.0.67 离开关卡立即打断当前语音台词（避免 scene_intro 继续播）
    try { if (M3.Feedback && M3.Feedback.stopVoice) M3.Feedback.stopVoice(); } catch(e){}
    // ⭐ 重置 intro 主题缓存，下次重进任何关卡能重新启动 intro
    state._lastIntroTheme = null;
    // ⭐ v0.0.64 回到大厅（主题选择页）自动恢复 BGM
    try { if (M3.Feedback && M3.Feedback.startBgm) M3.Feedback.startBgm(); } catch(e){}
  };
  Game.pickTheme = function(id){
    var t = M3.THEMES.find(function(x){ return x.id===id; });
    if (!t) return;
    // ⭐ v0.0.78 敬请期待主题（场景3）
    if (t.comingsoon){
      toast('即将上线，敬请期待 ✨');
      return;
    }
    if (!t.unlocked){
      // ⭐ v0.2.3 每日激励视频解锁（主题「寻找隐藏物」）—— 若今天已解锁则直接放行
      if (t.unlockBy === 'rewardedAd' && t.dailyUnlock){
        if (isThemeUnlockedToday(id)){
          // 今天已解锁 → fall through 到下面加载关卡的逻辑
        } else {
          state.dailyAdUnlockThemeId = id;
          return;
        }
      } else if (t.unlockBy === 'share'){
        // 分享解锁流程：弹分享提醒
        state.shareUnlockThemeId = id;
        return;
      } else {
        return;
      }
    }
    var levels = M3.getThemeLevels(id);
    if (!levels.length) return;
    // ⭐ v0.0.75 优先回到上次存的关（内部已验证又属于当前主题）
    try {
      var _lkey = 'laotie_last_level_' + id;
      var _saved = null;
      if (typeof ks !== 'undefined' && ks.getStorageSync) _saved = ks.getStorageSync(_lkey);
      else if (typeof localStorage !== 'undefined') _saved = localStorage.getItem(_lkey);
      if (_saved != null && _saved !== ''){
        var _si = parseInt(_saved, 10);
        if (!isNaN(_si) && _si >= 0 && _si < M3.LEVELS.length){
          var _lv = M3.LEVELS[_si];
          if (_lv && _lv.themeId === id){
            console.log('[Progress v0.0.75] 恢复主题'+id+' 上次关 idx='+_si);
            Game.pickLevel(_si); return;
          }
        }
      }
    } catch(_e){}
    Game.pickLevel(M3.LEVELS.indexOf(levels[0]));
  };
  // ⭐ v1.2.8 关卡级广告拦截：前 N 关（theme.freeCount）免费，第 N+1 关起需看一次激励视频
  //   看完广告后整个主题本 session 全放行（按 themeId 解锁，不按 idx）
  //   清缓存 = 新用户，session 重置，重新需要看一次
  //   freeCount 写在 levels-config JSON themes[] 里，运营改 JSON 不发版

  // session 级解锁表（内存，刷新/清缓存后重置）— 按 themeId 存
  var _sessionAdUnlocked = {};
  function _markLvAdUnlocked(idx){
    var lv = M3.LEVELS[idx]; if (!lv) return;
    _sessionAdUnlocked[lv.themeId] = true;
    console.log('[LVAD] ✅ 主题 ' + lv.themeId + ' 已广告解锁（本 session 全放行）');
  }
  function _isLvAdUnlocked(idx){
    var lv = M3.LEVELS[idx]; if (!lv) return false;
    return !!_sessionAdUnlocked[lv.themeId];
  }
  // 判断该关是否需要广告解锁（返回 true 则拦截 pickLevel）
  function _needLvAd(idx){
    var lv = M3.LEVELS[idx]; if (!lv) return false;
    // 该主题未配置关卡广告（freeCount=0 或未设置）→ 放行
    var _theme = (M3.THEMES || []).filter(function(t){ return t && t.id === lv.themeId; })[0] || {};
    var _freeCnt = _theme.freeCount || 0;
    if (!(_freeCnt > 0)) return false;
    // 本 session 内已看过广告 → 整个主题全放行
    if (_sessionAdUnlocked[lv.themeId]) return false;
    // 前 _freeCnt 关免费（按主题内序号）
    var _sameTheme = M3.getThemeLevels(lv.themeId) || [];
    var _pos = _sameTheme.indexOf(lv);
    if (_pos < 0) return false;
    if (_pos < _freeCnt) return false;
    // pos >= freeCnt 且本 session 未解锁 → 拦截
    console.log('[LVAD] 拦截 idx=' + idx + ' themeId=' + lv.themeId + ' pos=' + _pos + '/' + _sameTheme.length + ' freeCount=' + _freeCnt);
    return true;
  }
  Game._needLvAd = _needLvAd;
  Game._markLvAdUnlocked = _markLvAdUnlocked;
  Game._isLvAdUnlocked = _isLvAdUnlocked;

  Game.pickLevel = function(idx){
    // ⭐ v1.0.84 关卡级广告拦截（场景2 老铁眼最尖）
    if (_needLvAd(idx)){
      if (M3.KwaiAd && M3.KwaiAd.showRewarded){
        state.adLoading = true;
        var _to = setTimeout(function(){
          state.adLoading = false;
          toast('广告加载超时，稍后再试');
        }, 8000);
        M3.KwaiAd.showRewarded(function(ok){
          clearTimeout(_to); state.adLoading = false;
          if (!ok){ toast('看完视频才能解锁本关哦～'); return; }
          _markLvAdUnlocked(idx);
          toast('本关已解锁 ✔');
          setTimeout(function(){ Game.pickLevel(idx); }, 300);
        });
      } else {
        // 本地调试：无广告 SDK 时直接解锁
        _markLvAdUnlocked(idx);
        toast('本关已解锁 ✔（本地调试模式）');
        setTimeout(function(){ Game.pickLevel(idx); }, 300);
      }
      return;
    }
    // ⭐ v1.2.4 场景图已全量 CDN 化，进入第1关时只需预加载 ui-gameplay 子包（通关弹窗用）。
    //   原 scenes-hidden-core / scenes-hidden-extra 预加载已删除。
    try {
      if (idx === 0 && M3.SubpkgLoader) {
        M3.SubpkgLoader.prefetchUiGameplay();
      }
    } catch(_e) {}
    // ⭐ v1.0.69 埋点：首次进入任一关卡（A 组启动漏斗第 4 站）
    if (M3.Tele && !M3.Tele.has(M3.Tele.SC.FIRST_LEVEL_ENTER)){
      var _lv0 = M3.LEVELS[idx] || {};
      M3.Tele.report(M3.Tele.SC.FIRST_LEVEL_ENTER, {
        sinceStart: true,
        dimension: { themeId: _lv0.themeId||1, mode: _lv0.mode||'spot' },
        metric:    { levelIdx: idx }
      });
      // 首次进关意味着 hint 广告入口首次可见（C 组广告漏斗第 1 站）
      M3.Tele.report(M3.Tele.SC.AD_ENTRY_EXPOSED, { dimension:{ slot:'hint' } });
    }
    // 记录进关时间，供 FIRST_LEVEL_END 计算耗时
    state._levelStartTs = Date.now();
    // ⭐ v1.3.1 E组埋点：每关进入时上报 LEVEL_ENTER（SC 7050）
    try { _reportLevelEnter(idx, state._lastLevelIdx !== undefined && state._lastLevelIdx === idx); } catch(_e){}
    state._lastLevelIdx = idx;
    // ⭐ v1.0.74 Analytics: 每关 levelStart
    try { if (M3.Analytics) M3.Analytics.levelStart(idx); } catch(_){}
    // ⭐ v0.0.67 切关前先打断上一个台词（不同主题才会让 intro 重新播，同主题不启动新 intro）
    try { if (M3.Feedback && M3.Feedback.stopVoice) M3.Feedback.stopVoice(); } catch(e){}
    state.levelIdx = idx; state.level = M3.LEVELS[idx];
    // ⭐ v0.0.75 记录上次所在关（以主题为维度）
    try {
      var _tId = state.level.themeId || 1;
      var _lkey = 'laotie_last_level_' + _tId;
      if (typeof ks !== 'undefined' && ks.setStorageSync) ks.setStorageSync(_lkey, idx);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(_lkey, String(idx));
    } catch(_e){}
    var lv = state.level;
    // ⭐ v0.0.43 切关时清掉上关遗留涼漪/标记，避免下关开头看到上关的波纹
    state.clickRipples = [];
    state.marks = []; state.floats = []; state.hintArrows = [];
    // 难度曲线：spot 关卡用内联 diff（其全局 idx 不连续，getDifficulty 会越界）
    if (lv.mode === 'story') {
      // 所有剧情主题都使用配置驱动的剧情难度，禁止把全局数组位置交给五关难度曲线。
      // 新增 story 主题只需在 theme.storyRules 或 level.diff 中覆盖参数。
      var _storyTheme = _storyThemeConfig(lv);
      var _storyRules = (_storyTheme.storyRules && typeof _storyTheme.storyRules === 'object') ? _storyTheme.storyRules : {};
      var _storyDiff = (lv.diff && typeof lv.diff === 'object') ? lv.diff : {};
      state.diff = Object.assign({ timeScale:1, hitScale:1.0, penalty:2, bonus:0, label:'剧情' }, _storyRules, _storyDiff);
    } else if (lv.diff) state.diff = lv.diff;
    else state.diff = (M3.getDifficulty ? M3.getDifficulty(idx) : { timeScale:1, hitScale:1, penalty:5, bonus:2, label:'' });
    // ⭐ v1.0.27 宽容机制：连续失败 ≥2 次的关卡，本次自动 +10 秒（送温暖，减劝退）
    var _baseTime = Math.max(0, Math.round(lv.duration * (state.diff.timeScale||1)));
    var _mercy = (M3.applyMercy) ? M3.applyMercy(idx, _baseTime) : { duration:_baseTime, granted:false };
    state.time = _mercy.duration;
    state.storyStartTime = lv.mode === 'story' ? state.time : 0;
    state._mercyGranted = _mercy.granted;
    // ⭐ v1.0.69 埋点：仁慈机制触发（B 组留存漏斗 · 卡关信号）
    if (_mercy.granted && M3.Tele){
      M3.Tele.report(M3.Tele.SC.MERCY_TRIGGERED, {
        dimension: { themeId: lv.themeId||1, levelIdx: String(idx) }
      });
    }
    // ⭐ hunt 模式也走倒计时（v0.2.4 与其他关卡一致）：保留 huntElapsed 给 UI 可选显示
    if (lv.mode==='hunt') { state.huntElapsed = 0; }
    state.storyIntroOpen = lv.mode === 'story';
    // ⭐ v1.0.123 story 模式：初始化旁白、线索链和通关动画状态
    if (lv.mode==='story') {
      state.storyNarratives = [];   // { text, anchorX, anchorY, startAt, until }
      state.storyBossTriggered = false;  // Boss关场景切换是否已触发
      state.storyFoundAnim = {};    // 每个线索的命中时间，用于进度链弹跳
      state._storyPrevFound = 0;
      state.storyWinAnimStart = 0;
      state.storyHintStage = 0;     // 0=未提示，1=已揭晓名称，2=已定位/已找到
      state.storyHintTarget = -1;
      state.storyHintAds = 0;
    }
    if (lv.mode==='spot') {
      state.spotHintStage = 0;      // 0=未提示，1=已揭晓线索名称，2=已定位（小手）
      state.spotHintTarget = -1;
      state.spotHintAds = 0;
    }
    state.found = {}; state.foundCount = 0;
    state.marks=[]; state.floats=[]; state.hintArrows=[];
    state.hintUsed=state.skipUsed=false;
    state.skipAdCount = 0;   // ⭐ 每关重置跳关看广告计数
    state.hintBubble=null; state.guide=true;
    // 场景图加载成功前不启动倒计时；缓存命中会在下方主动检查后立即开始。
    state.running=false;
    state.waitingForScene=true;
    state.lastSecondUpdate = 0;
    state.guideAge = 0;
    state.guideStart = M3._now();   // ⭐ 用真实时钟计时，确保 1 秒必消（不受帧率影响）
    state.win=state.lose=false; state.winModalAt=0; state.chapterDone=false; state.shake=0; state.laotieUntil=0;
    state.scene='game';
    // ⭐ v1.0.99 Analytics: 屏幕进入 level
    try { if (M3.Analytics) M3.Analytics.screenEnter('level'); } catch(_){}
    // ⭐ v1.0.98 分包改造：进入关卡前先确保对应子包已加载，再加载图片
    if (M3.SubpkgLoader && M3.SubpkgLoader.loadForLevel) {
      M3.SubpkgLoader.loadForLevel(idx, lv.themeId || 1, lv.mode || 'hidden', function() {
        // 子包加载完毕（或非 ks 环境直接回调），第1关先预载确认稿再加载场景图。
        if (lv.mode === 'story') {
          var _introAsset = _storyIntroConfig(lv).templateAsset;
          if (_introAsset) loadImg(M3.SubpkgLoader.rewritePath(_introAsset));
        }
        if (lv.mode==='spot'){
          loadImg(M3.SubpkgLoader.rewritePath(lv.sceneA));
          loadImg(M3.SubpkgLoader.rewritePath(lv.sceneB));
        } else {
          loadImg(M3.SubpkgLoader.rewritePath(lv.scene));
        }
      }, lv.idx);
    } else {
      // 兜底（SubpkgLoader 未就绪）
      if (lv.mode==='spot'){ loadImg(lv.sceneA); loadImg(lv.sceneB); }
      else loadImg(lv.scene);
    }
    // 缓存中已有当前关场景图时无需等待 onload 回调。
    _tryStartAfterSceneReady();
    // ⭐ v0.0.64 进入关卡必须停掉 BGM（背景音乐只在大厅/登录页播）
    try { if (M3.Feedback && M3.Feedback.stopBgm) M3.Feedback.stopBgm(); } catch(e){}
    // ⭐ v0.0.44 (保留) intro 台词逻辑：不再启动 BGM。
    try { /* startBgm removed — BGM 已图固定为大厅/登录专属 */ } catch(e){}
    // ⭐ v0.0.48b 进入"场景"时播 intro 台词（只在跨主题第一次进入时播，不是每关）
    //   逻辑：state._lastIntroTheme 记录上次播过 intro 的主题 id；若变化则重播
    try {
      var curTheme = lv.themeId;
      if (state._lastIntroTheme !== curTheme){
        state._lastIntroTheme = curTheme;
        if (M3.Feedback && M3.Feedback.play){
          // ⭐ v1.0.59: 三种模式各自 intro —— spot(找不同)→scene2_intro; hunt(寻找隐藏物)→scene_hunt_intro; hidden(找穿越物)→scene1_intro
          var introKey;
          if (lv.mode === 'spot') introKey = 'scene2_intro';
          else if (lv.mode === 'hunt') introKey = 'scene_hunt_intro';
          else if (lv.mode === 'story') introKey = 'scene_story_intro';
          else introKey = 'scene1_intro';
          setTimeout(function(){ try { M3.Feedback.play(introKey); } catch(e){} }, 300);
        }
      }
    } catch(e){}
    // ⭐ v1.0.27 宽容 toast：若本次触发了 mercy，进关后延迟 400ms 提示（让引导先亮）
    if (state._mercyGranted){
      setTimeout(function(){
        try { toast('🎁 老铁别急！送你 10 秒，稳住～', { duration: 2400 }); } catch(_e){}
      }, 400);
    }
  };
  Game.dismissGuide = function(){
    state.guide=false;
    if (state.waitingForScene || state.storyIntroOpen) { state.running=false; return; }
    state.running=true;
    state.lastSecondUpdate = M3._now();
  };

  // 命中
  function onCanvasTap(cx,cy){
    if (!state.running||!state.level) return;
    // 命中区域用真实图片渲染矩形（contain 后），不是舞台矩形
    var f = state._fit;
    if (!f) { var st0 = getStageRect(); f = { x:st0.x, y:st0.y, w:st0.w, h:st0.h }; }
    // ⭐ 详细点击日志 · 屏幕坐标 & fit 边界
    try {
      console.log('[TAP]────────────────────────');
      console.log('[TAP] screen(cx,cy)=', cx.toFixed(1), cy.toFixed(1),
                  '| fit=', 'x='+f.x.toFixed(1), 'y='+f.y.toFixed(1),
                             'w='+f.w.toFixed(1), 'h='+f.h.toFixed(1),
                  '| lvl=', (state.levelIdx+1), state.level.title||'');
    } catch(_e){}
    // ⭐ spot 双图：点A图区域等比映射到B图坐标，上下/左右两图均可点击
    if (state.level && state.level.mode==='spot' && state._fitA && state._fit){
      var _fa = state._fitA, _fb = state._fit;
      if (cx>=_fa.x && cx<=_fa.x+_fa.w && cy>=_fa.y && cy<=_fa.y+_fa.h){
        cx = _fb.x + (cx-_fa.x)/_fa.w * _fb.w;
        cy = _fb.y + (cy-_fa.y)/_fa.h * _fb.h;
      }
    }
    if (cx<f.x||cx>f.x+f.w||cy<f.y||cy>f.y+f.h) {
      try { console.log('[TAP] ❌ OUTSIDE image rect, ignored'); } catch(_e){}
      return;
    }
    var pxp = (cx-f.x)/f.w*100, pyp = (cy-f.y)/f.h*100;
    var hs = (state.diff && state.diff.hitScale) || 1;
    var isStoryTap = state.level.mode === 'story';
    function tapBounds(o){
      var mx = o.w*(1-hs)/2, my = o.h*(1-hs)/2;
      var x0=o.x+mx, y0=o.y+my, x1=o.x+o.w-mx, y1=o.y+o.h-my;
      // 主题5宽容框可能被 hitScale 放大到图片外，命中边界必须收回图片内部。
      if (isStoryTap){
        x0=Math.max(0,x0); y0=Math.max(0,y0);
        x1=Math.min(100,x1); y1=Math.min(100,y1);
      }
      return {x0:x0,y0:y0,x1:x1,y1:y1};
    }
    // 主题5的框可能相交甚至完全重叠。先收集所有未完成候选，选择中心离点击点最近者，
    // 防止数组靠前的大框一直抢走点击；已完成框会被跳过，重复点击可继续选中下一框。
    var storyHitIndex = -1, storyHitScore = Infinity;
    if (isStoryTap){
      for (var si=0; si<state.level.odds.length; si++){
        if (state.found[si]) continue;
        var so = state.level.odds[si], sb = tapBounds(so);
        if (pxp<sb.x0 || pxp>sb.x1 || pyp<sb.y0 || pyp>sb.y1) continue;
        var scx=(sb.x0+sb.x1)/2, scy=(sb.y0+sb.y1)/2;
        var sdx=(pxp-scx)/Math.max(1,sb.x1-sb.x0);
        var sdy=(pyp-scy)/Math.max(1,sb.y1-sb.y0);
        var sarea=Math.max(0,(sb.x1-sb.x0)*(sb.y1-sb.y0));
        var score=sdx*sdx+sdy*sdy+sarea*0.000001;
        if (score < storyHitScore){ storyHitScore=score; storyHitIndex=si; }
      }
    }
    try { console.log('[TAP] pct in image: x%=', pxp.toFixed(1), 'y%=', pyp.toFixed(1), '| hitScale=', hs); } catch(_e){}
    for (var i=0;i<state.level.odds.length;i++){
      var o = state.level.odds[i];
      if (state.found[i]) { try { console.log('  #'+i, o.prop||o.tag||'', '(already found)'); } catch(_e){} continue; }
      // 按难度缩小命中框（以中心收缩），越后越要点准
      var ob = tapBounds(o);
      var ox0=ob.x0, oy0=ob.y0, ox1=ob.x1, oy1=ob.y1;
      var hit = isStoryTap ? (i===storyHitIndex) : (pxp>=ox0&&pxp<=ox1&&pyp>=oy0&&pyp<=oy1);
      try {
        console.log('  #'+i, (o.prop||o.tag||''),
                    'box=['+ox0.toFixed(1)+'~'+ox1.toFixed(1)+', '+oy0.toFixed(1)+'~'+oy1.toFixed(1)+']',
                    hit ? '✅ HIT' : '✗ miss');
      } catch(_e){}
      if (hit){
        state.found[i]=true; state.foundCount++;
        // 第一段提示后玩家自己找到目标，不再要求第二次广告。
        if (isStoryTap && state.storyHintStage === 1 && state.storyHintTarget === i) {
          state.storyHintStage = 2;
          state.storyHintTarget = -1;
        }
        // spot 两段式提示：玩家找到第一段提示的目标后，自动升至 stage 2（不再需要第二次广告）。
        if (state.level && state.level.mode === 'spot' && (state.spotHintStage||0) === 1 && state.spotHintTarget === i) {
          state.spotHintStage = 2;
          state.spotHintTarget = -1;
        }
        try { _bumpStat('correct'); } catch(_e){}
        // ⭐ v1.0.74 Analytics: 记录 foundCnt
        try { if (M3.Analytics) M3.Analytics.levelFound(state.foundCount); } catch(_){}
        try { if (M3.Analytics) M3.Analytics.buttonClick('tap_correct'); } catch(_){}
        // ⭐ v0.0.48 机制升级：答对不再加时间（用户要求）
        //   保留 +Ns 浮字仅作视觉，不动 state.time
        // 已删除加时间逻辑
        // 主题5命中框通常比物品大，正确圈必须落在答案框中心，不能跟随存在缩放误差的手点坐标。
        var foundMarkX = isStoryTap ? f.x + ((ob.x0 + ob.x1) / 2) / 100 * f.w : cx;
        var foundMarkY = isStoryTap ? f.y + ((ob.y0 + ob.y1) / 2) / 100 * f.h : cy;
        state.marks.push({x:foundMarkX,y:foundMarkY,type:'ok',life:1.1,persist:true});
        // ⭐ v1.0.80 story 模式：触发旁白气泡 + Boss关场景切换
        if (state.level && state.level.mode === 'story') {
          var _od = state.level.odds[i];
          if (_od && _od.narrative) {
            // 新旁白替换旧旁白，避免玩家连点时气泡堆叠。
            var _storyNow = M3._now();
            state.storyNarratives = [{
              text: _od.narrative,
              anchorX: foundMarkX,
              anchorY: foundMarkY,
              startAt: _storyNow,
              until: _storyNow + 2400
            }];
          }
          // Boss关：找到第 bossStage 条（0-based）后切换场景亮度
          var _bs = state.level.bossStage;
          if (_bs >= 0 && !state.storyBossTriggered && (state.foundCount - 1) === _bs) {
            state.storyBossTriggered = true;
            state._storyBossLightUntil = M3._now() + 800; // 0.8s 过渡动画
          }
        }
        // ⭐ v0.0.49 修复"通关前奇怪的爆音（audio pop）"：
        //   最后一个物品被找到时，correct.mp3 会立即被下面的 pass.mp3 stop() 硬切，
        //   波形陡然截断 → 扬声器爆出 "咔啦" 声。方案：final hit 不播 correct，
        //   只保留震动；correct 让位给 pass 独占。
        var _isFinalHit = (state.foundCount === state.level.odds.length);
        if (M3.Feedback){
          if (_isFinalHit) M3.Feedback.vibrate('medium');
          else M3.Feedback.correct();
        }
        try { console.log('[TAP] ✅ FOUND #'+i, 'progress='+state.foundCount+'/'+state.level.odds.length); } catch(_e){}
        // ⭐ v1.0.105 找到一个茬后播「剩余N个」语音（非最终茬时触发）
        //   key: remaining_1 / remaining_2 / remaining_3（随机 a/b/c 由 Feedback._resolveKey 处理）
        //   触发条件：本次不是最终茬，且剩余数 <= 3
        if (!_isFinalHit && M3.Feedback && M3.Feedback.play){
          var _remain = (state.level.odds.length - state.foundCount);
          if (_remain >= 1 && _remain <= 3){
            try { setTimeout(function(){ M3.Feedback.play('remaining_' + _remain); }, 400); } catch(_re){}
          }
        }
        if (_isFinalHit){
          state.running=false; state.win=true;
          // ⭐ 最后一击后延迟 1s 再出通关弹窗：先看清最后一个命中标记/旁白，再进结算
          state.winModalAt = M3._now() + 1000;
          if (state.level && state.level.mode === 'story') {
            // story 通关揭示动画同步延后 1s 起（_winElapsed 从弹窗实际出现才开始计）
            state.storyWinAnimStart = M3._now() + 1000;
          }
          try { _bumpStat('levelPass'); } catch(_e){}
          try { _markLevelPassed(state.levelIdx); } catch(_e){}
          // ⭐ v1.0.27 通关 → 重置该关的连续失败计数
          try { if (M3.resetFailStreak) M3.resetFailStreak(state.levelIdx); } catch(_e){}
          // ⭐ v1.0.74 Analytics: levelEnd win + 屏幕切到 level_win
          try { if (M3.Analytics){ M3.Analytics.levelEnd('win'); M3.Analytics.screenEnter('level_win'); } } catch(_){}
          // ⭐ v1.3.1 E组埋点：LEVEL_EXIT win（SC 7051）
          try { _reportLevelExit('win'); } catch(_e){}
          // ⭐ v1.0.69 埋点：首关结束 win + 累计通关阶梯（B 组留存漏斗）
          try {
            if (M3.Tele){
              var _cost = state._levelStartTs ? (Date.now() - state._levelStartTs) : 0;
              if (!M3.Tele.has(M3.Tele.SC.FIRST_LEVEL_END)){
                M3.Tele.report(M3.Tele.SC.FIRST_LEVEL_END, {
                  costTime: _cost,
                  dimension: { result:'win', mode: state.level.mode||'spot', themeId: state.level.themeId||1 },
                  metric:    { foundCnt: state.foundCount, hintCnt: (state.hintUsed?1:0) }
                });
              }
              M3.Tele.onLevelWin();
            }
          } catch(_e){}
          // ⭐ v0.0.55 通关欢呼优先走新 final_hit_a/b/c（随机 3 条），fallback 旧 pass*
          try {
            if (M3.Feedback && M3.Feedback.play){
              // ⭐ v1.0.102 修复：只有1个茬的关卡，final_hit 音频可能说"就差一个了"（内容录错），
              //   改为直接走 pass 系列，语义更准确（"通关了"而非进度提示）
              var _totalOdds = state.level && state.level.odds ? state.level.odds.length : 0;
              var _skipFinalHit = (_totalOdds === 1);
              // 检查是否有新 final_hit_*，用 _resolveKey 自然处理
              if (!_skipFinalHit && M3.Feedback._resolveKey && M3.Feedback._resolveKey('final_hit') !== 'final_hit'){
                M3.Feedback.play('final_hit');
              } else {
                var _passClips = ['pass','pass2','pass3','pass4','pass5','pass6'];
                var _passKey = _passClips[Math.floor(Math.random() * _passClips.length)];
                M3.Feedback.play(_passKey);
              }
            }
          } catch(e){}
          M3.KwaiAd && M3.KwaiAd.trySpawnInterstitial && M3.KwaiAd.trySpawnInterstitial(state.levelIdx+1);
          // ⭐ v1.2.4 场景图已全量 CDN 化，scenes-hidden-core/scenes-hidden-extra 子包不再需要，
          //   原「通过第3关/第11关后预加载子包」的硬编码 idx/themeId 判断已删除。
        }
        return;
      }
    }
    var penalty = (state.diff && state.diff.penalty) || 5;
    state.time = Math.max(state.time-penalty,0);
    // ⭐ v0.0.48c 找错反馈：只在点击位置画红叉+扩散波纹，不再整图震动
    state.marks.push({x:cx,y:cy,type:'err',life:0.55});
    state.floats.push({x:cx,y:cy-24,txt:'-'+penalty+'s',cls:'minus',life:0.55});
    // ⭐ v0.0.48c 局部错误反馈波纹（在点击点画一个红色扩散圈，0.4s 消散）
    state.errRipples = state.errRipples || [];
    state.errRipples.push({x:cx, y:cy, life:0.4});
    try { _bumpStat('wrong'); } catch(_e){}
    // ⭐ v1.0.74 Analytics: 错误点击计数
    try { if (M3.Analytics){ M3.Analytics.levelWrong(); M3.Analytics.buttonClick('tap_wrong'); } } catch(_){}
    // ⭐ 不再整图震动
    // state.shake=0.2;
    // ⭐ 找错反馈：轻闷提示音 + 短促轻震动
    if (M3.Feedback) M3.Feedback.wrong();
    try { console.log('[TAP] ❌ WRONG · -'+penalty+'s · time now='+state.time+'s'); } catch(_e){}
    if (isStoryTap) {
      var storyWrongLines = ['这条线索对不上，再看看', '别急，故事还藏在别处', '这里没有答案，换个位置找找'];
      state.laotieLine = storyWrongLines[Math.floor(Math.random()*storyWrongLines.length)];
    } else {
      state.laotieLine = M3.LAOTIE_LINES[Math.floor(Math.random()*M3.LAOTIE_LINES.length)];
    }
    state.laotieUntil = M3._now()+900;
    // ⭐ 骨人提示也走全局居中 toast（不再顶部黄卡）
    toast(state.laotieLine);
    if (state.time<=0){
      state.running=false; state.lose=true;
      if (M3.Feedback) M3.Feedback.lose();
      // ⭐ v1.0.27 失败 → 累加连续失败次数（下次进关触发 mercy）
      try { if (M3.bumpFailStreak) M3.bumpFailStreak(state.levelIdx); } catch(_e){}
      // ⭐ v1.0.74 Analytics: levelEnd lose (wrong-triggered)
      try { if (M3.Analytics){ M3.Analytics.levelEnd('lose'); M3.Analytics.screenEnter('level_lose'); } } catch(_){}
      // ⭐ v1.3.1 E组埋点：LEVEL_EXIT lose（SC 7051）
      try { _reportLevelExit('lose'); } catch(_e){}
    }
  }

  Game.update = function(){
    try {
      refreshLayout();
      var now = M3._now();
      // ⭐ v0.0.48 倒计时逻辑加固（用户反馈"时间乱七八糟容易跳变"）：
      //   1. 首次进关 lastSecondUpdate 兜底
      //   2. while 循环最多补 3 秒，防止后台挂起时一次跳一大截（也不放任跳过）
      //   3. running=false 时不推进时间
      if (state.running){
        if (!state.lastSecondUpdate) state.lastSecondUpdate = now;
        var _guard = 0;
        while (state.running && now - state.lastSecondUpdate >= 1000 && _guard < 3){
          if (state.level && state.level.mode === 'hunt') { state.huntElapsed = (state.huntElapsed||0) + 1; state.time--; }
          else state.time--;
          state.lastSecondUpdate += 1000;
          _guard++;
          // ⭐ 最后 10 秒每秒滴答，营造紧迫感（0 秒是失败音，不重复）
          if (state.time > 0 && state.time <= 10 && M3.Feedback && M3.Feedback.tick){
            M3.Feedback.tick();
          }
          // ⭐ v0.0.55 恰好进入 10 秒时播一句人物催促（almost_out_a/b/c 随机）
          if (state.time === 10 && M3.Feedback && M3.Feedback.play){
            try { M3.Feedback.play('almost_out'); } catch(e){}
          }
          if (state.time<=0){
            state.time=0; state.running=false; state.lose=true;
            if (M3.Feedback) M3.Feedback.lose();
            // ⭐ v1.0.27 失败 → 累加连续失败次数（下次进关触发 mercy）
            try { if (M3.bumpFailStreak) M3.bumpFailStreak(state.levelIdx); } catch(_e){}
            // ⭐ v1.0.74 Analytics: levelEnd lose (timeout)
            try { if (M3.Analytics){ M3.Analytics.levelEnd('lose'); M3.Analytics.screenEnter('level_lose'); } } catch(_){}
            // ⭐ v1.3.1 E组埋点：LEVEL_EXIT lose timeout（SC 7051）
            try { _reportLevelExit('lose'); } catch(_e){}
            // ⭐ v1.0.69 埋点：首关结束 lose（B 组留存漏斗）
            try {
              if (M3.Tele && !M3.Tele.has(M3.Tele.SC.FIRST_LEVEL_END)){
                var _lcost = state._levelStartTs ? (Date.now() - state._levelStartTs) : 0;
                M3.Tele.report(M3.Tele.SC.FIRST_LEVEL_END, {
                  costTime: _lcost,
                  dimension: { result:'lose', mode: state.level.mode||'spot', themeId: state.level.themeId||1 },
                  metric:    { foundCnt: state.foundCount||0, hintCnt: (state.hintUsed?1:0) }
                });
              }
            } catch(_e){}
            break;
          }
        }
        // 若 guard 触顶（长时间挂起后回来），把 lastSecondUpdate 强制拉齐到 now
        //   避免下一帧继续大量补扣
        if (_guard >= 3) state.lastSecondUpdate = now;
      }
      var dt = 1/60;
      // 引导浮条计时（1.8s 自动消失）
      if (state.guide){
        state.guideAge = (state.guideAge || 0) + dt;
      } else {
        state.guideAge = 0;
      }
      state.marks = state.marks.filter(function(m){
        // ⭐ v0.0.43：找到的 mark (type=ok, persist) 保留，不衰减
        if (m.type==='ok' && m.persist){
          // 仅让前 0.25s 回弹动画推进（life 1.1 → 0.85 就停）
          if (m.life > 0.85) m.life -= dt;
          if (m.life < 0.85) m.life = 0.85;
          return true;  // 永不删
        }
        m.life-=dt; return m.life>0;
      });
      // float 上飘更快 + 生命更短，避免"-xx秒"赖着不走
      state.floats = state.floats.filter(function(f){ f.y-=90*dt; f.life-=dt; return f.life>0; });
      state.hintArrows = state.hintArrows.filter(function(a){ a.life-=dt; return a.life>0; });
      // ⭐ 点击涟漪衰减
      if (state.clickRipples && state.clickRipples.length){
        state.clickRipples = state.clickRipples.filter(function(r){ r.life-=dt; return r.life>0; });
      }
      // ⭐ v0.0.48c 错误反馈涟漪衰减
      if (state.errRipples && state.errRipples.length){
        state.errRipples = state.errRipples.filter(function(r){ r.life-=dt; return r.life>0; });
      }
      if (state.shake>0) state.shake = Math.max(0,state.shake-dt);
      // ⭐ 放大镜已移除
      if (state.hintBubble && M3._now() > state.hintBubble.until) state.hintBubble = null;
    } catch(e){ state.err = e&&(e.message||String(e)); }
  };

  Game.draw = function(){
    try {
      refreshLayout();
      // v0.1.0 优化：数组 length=0 复用，避免每帧新建数组产生 GC 压力
      if (state.tapAreas) state.tapAreas.length = 0; else state.tapAreas = [];
      // ⭐ v0.0.85 累计游玩时长：只在真正进入游戏后（非 welcome）累计
      try {
        var _now = M3._now ? M3._now() : Date.now();
        if (state.scene !== 'welcome'){
          if (_playtimeLastTick && (_now - _playtimeLastTick) < 5000){
            var dt = _now - _playtimeLastTick;
            _writePlaytime(_readPlaytime() + dt);
          }
        }
        _playtimeLastTick = _now;
      } catch(_pt){}
      // ⭐ v0.0.64 场景切换 BGM 兜底：只在 welcome/theme_select 播 BGM，其他场景强停
      try {
        var _s = state.scene;
        if (state._lastScene !== _s){
          var bgmAllowed = (_s==='welcome' || _s==='theme_select');
          if (M3.Feedback){
            if (bgmAllowed){
              if (M3.Feedback.startBgm) M3.Feedback.startBgm();
            } else {
              if (M3.Feedback.stopBgm) M3.Feedback.stopBgm();
            }
          }
          state._lastScene = _s;
        }
      } catch(e){}
      // ☁️ 蓝天点云底（替代旧深紫金）
      drawSkyBg();

      if (state.err){ drawErr(); return; }
      if (state.scene==='welcome' && M3.Welcome){
        // ⭐ v0.0.54 全局宣传欢迎页（视频背景+立即去玩+授权+toast）
        // ⚠️ 必须用 M3.Layout.w/h（CSS 逻辑像素），不是 canvas.width/height（物理像素）
        //    因为 ctx 已 setTransform(dpr,0,0,dpr,0,0)，绘制坐标已经是逻辑坐标系
        var VW = (M3.Layout && M3.Layout.w) || canvas.width;
        var VH = (M3.Layout && M3.Layout.h) || canvas.height;
        M3.Welcome.draw(ctx, VW, VH, state);
      }
      else if (state.scene==='theme_select') drawThemeSelect();
      else if (state.scene==='game') drawGame();
      // ⭐ v0.0.75 欢迎 toast 跨场景延续（首页也能看到它渐隐消失）
      if (state.welcomeToast && M3.Welcome && M3.Welcome.drawWelcomeToast && state.scene!=='welcome'){
        var now = M3._now ? M3._now() : Date.now();
        if (now < state.welcomeToast.untilTs){
          var VW2 = (M3.Layout && M3.Layout.w) || canvas.width;
          var VH2 = (M3.Layout && M3.Layout.h) || canvas.height;
          M3.Welcome.drawWelcomeToast(ctx, VW2, VH2, state);
        } else {
          state.welcomeToast = null;
        }
      }
      // 全局浮层（首页/游戏页都生效）：toast + 解锁全部浮层 + 分享解锁浮层
      drawToast();
      drawUnlockOverlay();
      drawShareUnlockOverlay();
      drawDailyAdUnlockOverlay();  // ⭐ v0.2.3 每日激励视频解锁浮层
      // ⭐ 全局点击涟漪反馈（最上层轻描一笔）
      drawClickRipples();
      // ⭐ v0.0.48c 错误点击的红色扩散反馈（局部）
      drawErrRipples();
      // ⭐ 左下角版本水印（每次 build 递增 BUILD_VER）
      drawBuildWatermark();
      // ⭐ v1.0.4+ 激励广告加载 loading（全局最上层）
      drawAdLoadingOverlay();
    } catch(e){
      state.err = e&&(e.message||String(e)); drawErr();
    }
  };
  function drawBuildWatermark(){
    // ⭐ v1.0.4 缩短显示为 vX.Y.Z + 下移 30px
    var full = (window.M3 && M3.BUILD_VER) || 'v?.?.?';
    var BUILD_VER = (full.match(/v\d+\.\d+\.\d+/) || [full])[0];
    ctx.save();
    setFont(9*S);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(BUILD_VER, px(8), py(VH - 2 + 30));
    ctx.restore();
  }
  // ⭐ v1.0.4 激励广告加载 loading 遮罩（所有广告调用点自动触发）
  //   - 触发时机：M3.KwaiAd.showRewarded 和 unlockAllByAd 在广告显示前置 state.adLoading=true
  //   - SDK 成功/失败/超时任何回调都清 loading
  //   - 阻断点击（吃掉所有 tap）
  function drawAdLoadingOverlay(){
    if (!state.adLoading) return;
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:99999, onTap:function(){} });
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0,0,W,H);
    var pw = 200, ph = 160;
    var px0 = (VW - pw)/2, py0 = (VH - ph)/2;
    fillRR(px(px0), py(py0), ps(pw), ps(ph), ps(14), '#fff8ec');
    strokeRR(px(px0), py(py0), ps(pw), ps(ph), ps(14), '#c98b3c', ps(3));
    var cx = VW/2, cy = py0 + 58;
    var t = (Date.now() / 16) % 360;
    ctx.save();
    ctx.translate(px(cx), py(cy));
    ctx.rotate(t * Math.PI / 180);
    ctx.strokeStyle = '#e8a24c';
    ctx.lineWidth = ps(4);
    ctx.beginPath();
    ctx.arc(0, 0, ps(22), 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = '#c9522b';
    ctx.beginPath();
    ctx.arc(ps(22), 0, ps(4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    setFont(14*S);
    ctx.fillStyle = '#4a3b33';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.adLoadingText || '广告加载中...', px(cx), py(py0 + 110));
    setFont(11*S);
    ctx.fillStyle = 'rgba(74,59,51,0.7)';
    ctx.fillText('请稍候，马上就好', px(cx), py(py0 + 132));
    ctx.restore();
  }
  function drawErr(){
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    text('游戏出错', W/2, H/2-30, 22, '#ff5a5a','center');
    text(String(state.err).slice(0,80), W/2, H/2, 14,'#fff','center');
    text('点击返回', W/2, H/2+40, 15, C.GOLD, 'center');
    state.tapAreas.push({x:0,y:0,w:W,h:H,onTap:function(){ state.err=null; state.scene='theme_select'; }});
  }

  // ═════════ 场景 1：主题选择（图片铺满整卡） ═════════
  function drawThemeSelect(){
    // ⭐ v0.0.91 顶部头：用户卡 (左) + title 图 (右) 并排一行
    drawHomeHeader();

    // 卡片列表 - 自适应卡高，确保 M3.THEMES 全部展示（v0.2.0：主题4「寻找隐藏物」）
    // v0.2.1：header 上移（headerY 12→4, headerH 56→48），listTop 112 → 88
    var listTop = 98, gap = 10, cardW = VW - 24;
    var pagerH = 48;   // 翻页控件高度
    var bottomBarH = 58; // 底部预留给 4 个 icon
    var _themes = (M3.THEMES || []).filter(function(t){ return !t.comingsoon; });
    var PAGE_SIZE = 4;
    var pageCount = Math.max(1, Math.ceil(_themes.length / PAGE_SIZE));
    // 钳位当前页（主题增减后不越界）
    if (state.themePage >= pageCount) state.themePage = pageCount - 1;
    if (state.themePage < 0) state.themePage = 0;
    var pageStart = state.themePage * PAGE_SIZE;
    var pageThemes = _themes.slice(pageStart, pageStart + PAGE_SIZE);
    var themeCount = pageThemes.length;
    var pagerAreaH = pageCount > 1 ? pagerH + 4 : 0; // 只有多页才留翻页空间
    var availableH = VH - listTop - pagerAreaH - bottomBarH - 10;
    // 每页最多 4 张：cardH 在 [88, 118] 之间自适应
    var cardH = Math.max(88, Math.min(118, Math.floor((availableH - gap*(PAGE_SIZE-1)) / PAGE_SIZE)));
    for (var i = 0; i < themeCount; i++){
      var y = listTop + i * (cardH + gap);
      drawThemeCardV3(12, y, cardW, cardH, pageThemes[i]);
    }

    // ⭐ 翻页控件（多页时显示，位于卡片和底栏之间）
    if (pageCount > 1){
      var pagerY = VH - bottomBarH - pagerH - 6;
      drawThemePager(pagerY, pagerH, state.themePage, pageCount);
    }

    // 底部 4 icon 栏（参考图 4 首页布局）
    drawThemeBottomBar();

    // ⭐ 设置浮层（在最上层，且拦截其他点击）
    drawSettingsOverlay();
    drawVoicePackOverlay();
    drawVoiceUnlockModal();   // ⭐ v0.0.98 语音包解锁弹窗（最上层）
    // ⭐ v0.0.90 profile 半屏面板（放在设置浮层上层，因为设置可能同时开着）
    drawProfilePanel();
  }

  // ⭐ v0.0.91 首页头部：左侧仅头像（无文字）+ 右侧 title 大图
  function drawHomeHeader(){
    _tickPlaytime();
    var u = _loadStoredUser() || { avatar:'', nickName:'铁子' };
    var headerY = 32;
    var headerH = 46;

    // ── 头像区：先画圆角框切图，再在内部画圆形头像 ──
    var avSize = 34;   // 头像圆形大小，填满框内圈
    var frameSize = 52; // 框切图固定大小
    var avX = 10, avY = headerY + (headerH - frameSize) / 2 + 4;

    // 先画头像框切图（垫底，固定尺寸）
    var frameImg = state.imgs && state.imgs['assets/ui/avatar-frame.png'];
    if (frameImg && frameImg.width > 0){
      var fRatio = frameImg.width / frameImg.height;
      var fH = frameSize;
      var fW = fH * fRatio;
      var fx = avX + frameSize/2 - fW/2;
      var fy = avY;
      try { ctx.drawImage(frameImg, px(fx), py(fy), ps(fW), ps(fH)); } catch(_e){}
    }

    // 再画圆形头像（居中在框内，上移2px）
    var avCx = avX + frameSize/2;
    var avCy = avY + frameSize/2 - 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px(avCx), py(avCy), ps(avSize/2), 0, Math.PI*2);
    ctx.clip();
    var avImg = null;
    if (u.avatar){
      avImg = state.imgs[u.avatar];
      if (!avImg && !state.imgLoading[u.avatar]){ try { loadImg(u.avatar); } catch(_e){} }
    }
    if (avImg && avImg.width > 1){
      // cover 模式：等比缩放填满圆圈，不留白边
      var _aw = avImg.width, _ah = avImg.height;
      var _scale = Math.max(ps(avSize) / _aw, ps(avSize) / _ah);
      var _dw = _aw * _scale, _dh = _ah * _scale;
      try { ctx.drawImage(avImg, px(avCx) - _dw/2, py(avCy) - _dh/2, _dw, _dh); } catch(_e){}
    } else {
      var g = ctx.createLinearGradient(0, py(avCy - avSize/2), 0, py(avCy + avSize/2));
      g.addColorStop(0, '#ff7a3a'); g.addColorStop(1, '#c93a1f');
      ctx.fillStyle = g; ctx.fillRect(px(avCx - avSize/2), py(avCy - avSize/2), ps(avSize), ps(avSize));
      ctx.fillStyle = '#fff';
      setFont(16*S, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(((u.nickName||'铁')[0]), px(avCx), py(avCy));
    }
    ctx.restore();

    // 头像圆形描边 #79AFFF — 半径与 clip 对齐，lineWidth 向外扩，无间隙
    ctx.save();
    ctx.beginPath();
    ctx.arc(px(avCx), py(avCy), ps(avSize/2), 0, Math.PI*2);
    ctx.strokeStyle = '#79AFFF'; ctx.lineWidth = ps(3); ctx.stroke();
    ctx.restore();

    // 点击头像区 → profile 面板
    state.tapAreas.push({
      x: px(avX - 4), y: py(avY - 4), w: ps(frameSize + 8), h: ps(frameSize + 8),
      priority: 90,
      onTap: function(){ state.profilePanel = { open:true, startTs: (M3._now?M3._now():Date.now()) }; }
    });

    // ── Logo：居中，固定高度62保持原始宽高比 ──
    var img = state.imgs['assets/ui/title.png'];
    if (img && img.width && img.height){
      var dh = 62;
      var dw = dh * (img.width / img.height);
      var dx = (VW - dw) / 2, dy = headerY + (headerH - dh) / 2;
      try { ctx.drawImage(img, 0, 0, img.width, img.height, px(dx), py(dy), ps(dw), ps(dh)); } catch(e){}
    }
  }

  // 省略号截断
  function _fillTextEllipsis(txt, x, y, maxW){
    var w = ctx.measureText(txt).width;
    if (w <= maxW*S){ ctx.fillText(txt, x, y); return; }
    var ell = '…';
    while (txt.length > 1 && ctx.measureText(txt+ell).width > maxW*S){
      txt = txt.slice(0, -1);
    }
    ctx.fillText(txt+ell, x, y);
  }

  // 首页大标题：优先渲染 title.png，未加载完成回退到旧木牌
  // ⭐ v0.0.85 已在左上让位给"用户信息卡"，标题上移+缩小，避免遮挡
  function drawHomeTitle(){
    var img = state.imgs['assets/ui/title.png'];
    var cy = 74, targetW = Math.min(VW*0.6, 220), targetH = targetW/3;
    if (img && img.width && img.height){
      var iw = img.width, ih = img.height;
      var ratio = iw/ih;
      var dw = targetW, dh = dw/ratio;
      if (dh > 60){ dh = 60; dw = dh*ratio; }
      // 右侧对齐（避免和左上 user card 重叠）
      var dx = VW - dw - 2, dy = cy - dh/2;
      try { ctx.drawImage(img, 0, 0, iw, ih, px(dx), py(dy), ps(dw), ps(dh)); } catch(e){}
    } else {
      woodTitle(px(VW*0.7), py(74), 0, ps(40), '老铁眼真尖', 16*S);
    }
  }

  // ⭐ 首页左上齿轮按钮（v0.0.85 下移到 cy=88，给上方 user card 让位）
  function drawSettingsGear(){
    if (state.settingsOverlay) return;
    var cx = 26, cy = 88, r = 15;
    ctx.save();
    ctx.beginPath(); ctx.arc(px(cx), py(cy), ps(r), 0, Math.PI*2);
    ctx.fillStyle='#ffcf5b'; ctx.fill();
    ctx.strokeStyle='#1a1015'; ctx.lineWidth=ps(2.5); ctx.stroke();
    ctx.translate(px(cx), py(cy));
    ctx.fillStyle='#1a1015';
    var teeth=8, rIn=ps(6), rOut=ps(10);
    for (var i=0;i<teeth;i++){
      ctx.save();
      ctx.rotate(i * Math.PI*2/teeth);
      ctx.fillRect(-ps(2), -rOut, ps(4), rOut-rIn+ps(2));
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0,0,rIn,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffcf5b'; ctx.beginPath(); ctx.arc(0,0,ps(3),0,Math.PI*2); ctx.fill();
    ctx.restore();
    state.tapAreas.push({
      x:px(cx-r-4), y:py(cy-r-4), w:ps(r*2+8), h:ps(r*2+8),
      priority: 100,
      onTap: function(){ state.settingsOverlay = true; if (M3.Analytics) M3.Analytics.buttonClick('btn_settings_home'); if (M3.Analytics) M3.Analytics.screenEnter('settings'); if (M3.Tele) M3.Tele.report(M3.Tele.SC.OPEN_SETTINGS, { dimension:{ from:'themes' } }); try { _reportBtnClick('btn_settings', 'themes'); } catch(_e){} }
    });
  }

  // ⭐ v0.0.85 累计游玩时长追踪 & 用户信息卡
  var _playtimeKey = 'laotie_playtime_ms';
  var _playtimeLastTick = 0;
  function _readPlaytime(){
    try {
      if (typeof ks!=='undefined' && ks.getStorageSync){
        var v = ks.getStorageSync(_playtimeKey);
        if (v != null && v !== '') return Number(v) || 0;
      }
      if (typeof localStorage!=='undefined'){
        var v2 = localStorage.getItem(_playtimeKey);
        if (v2 != null) return Number(v2) || 0;
      }
    } catch(_e){}
    return 0;
  }
  function _writePlaytime(ms){
    try {
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(_playtimeKey, ms);
      else if (typeof localStorage!=='undefined') localStorage.setItem(_playtimeKey, String(ms));
    } catch(_e){}
  }
  function _tickPlaytime(){
    var now = M3._now ? M3._now() : Date.now();
    if (_playtimeLastTick && (now - _playtimeLastTick) < 5000){
      var dt = now - _playtimeLastTick;
      var cur = _readPlaytime();
      _writePlaytime(cur + dt);
    }
    _playtimeLastTick = now;
  }
  function _formatPlaytime(ms){
    // 不足 1 分钟 → 1 分钟；<60min → 向上取整分钟；<24h → 小时+分钟；>=24h → 天+小时
    if (ms < 60*1000) return '1 分钟';
    var totalMin = Math.ceil(ms / 60000);
    if (totalMin < 60) return totalMin + ' 分钟';
    var totalHour = Math.floor(totalMin / 60);
    var remMin = totalMin - totalHour*60;
    if (totalHour < 24){
      return remMin>0 ? (totalHour + ' 小时 ' + remMin + ' 分钟') : (totalHour + ' 小时');
    }
    var days = Math.floor(totalHour / 24);
    var remHour = totalHour - days*24;
    return remHour>0 ? (days + ' 天 ' + remHour + ' 小时') : (days + ' 天');
  }
  function _loadStoredUser(){
    if (state.user) return state.user;
    try {
      var v = null;
      if (typeof ks!=='undefined' && ks.getStorageSync) v = ks.getStorageSync('laotie_user');
      if ((!v || !v.nickName) && typeof localStorage!=='undefined'){
        var s = localStorage.getItem('laotie_user');
        if (s) { try { v = JSON.parse(s); } catch(_e){} }
      }
      if (v && v.nickName){
        state.user = v;
        // ⭐ v1.0.78 首次读到用户信息时立即预加载头像，不等 drawHomeHeader 渲染时才触发
        if (v.avatar && !state.imgs[v.avatar] && !state.imgLoading[v.avatar]) {
          try { loadImg(v.avatar); } catch(_e) {}
        }
        return v;
      }
    } catch(_e){}
    return null;
  }
  function drawUserInfoCard(){
    _tickPlaytime();
    var u = _loadStoredUser() || { avatar:'', nickName:'铁子' };
    // ⭐ v0.0.85 位置：设置按钮正上方 → 左侧，y 从 12 到 ~56，横向撑到 VW 的 60%
    var cardH = 44;
    var cardY = 12;
    var cardX = 8;
    var avSize = 36;
    // ⭐ v1.0.26 修复 bug#B3124250：昵称超长不再溢出卡片，>8 字符省略号
    var rawNick = u.nickName || '铁子';
    var nick = rawNick.length > 8 ? rawNick.slice(0, 8) + '…' : rawNick;
    var playStr = '已经玩了：' + _formatPlaytime(_readPlaytime());
    // 卡宽度：跟内容走，最长 VW*0.6，最短 158
    setFont(13*S, 'bold');
    var wNick = ctx.measureText(nick).width / S;
    setFont(11*S);
    var wPlay = ctx.measureText(playStr).width / S;
    var contentW = Math.max(wNick, wPlay);
    var cardW = avSize + 8 + contentW + 14;
    if (cardW < 158) cardW = 158;
    if (cardW > VW*0.6) cardW = VW*0.6;
    // 卡片底
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.28)'; ctx.shadowBlur=ps(6); ctx.shadowOffsetY=ps(2);
    fillRR(px(cardX), py(cardY), ps(cardW), ps(cardH), ps(cardH/2), '#fff8e1');
    ctx.restore();
    strokeRR(px(cardX), py(cardY), ps(cardW), ps(cardH), ps(cardH/2), '#1a1015', ps(2));
    // 头像
    var avX = cardX + 4, avY = cardY + (cardH-avSize)/2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px(avX+avSize/2), py(avY+avSize/2), ps(avSize/2), 0, Math.PI*2);
    ctx.clip();
    var avImg = null;
    if (u.avatar){
      avImg = state.imgs[u.avatar];
      if (!avImg && !state.imgLoading[u.avatar]){
        try { loadImg(u.avatar); } catch(_e){}
      }
    }
    if (avImg && avImg.width>1){
      try { ctx.drawImage(avImg, px(avX), py(avY), ps(avSize), ps(avSize)); } catch(_e){}
    } else {
      var g = ctx.createLinearGradient(0, py(avY), 0, py(avY+avSize));
      g.addColorStop(0, '#ff7a3a'); g.addColorStop(1, '#c93a1f');
      ctx.fillStyle = g;
      ctx.fillRect(px(avX), py(avY), ps(avSize), ps(avSize));
      ctx.fillStyle = '#fff';
      setFont(16*S, 'bold');
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText((nick||'铁')[0], px(avX+avSize/2), py(avY+avSize/2));
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px(avX+avSize/2), py(avY+avSize/2), ps(avSize/2), 0, Math.PI*2);
    ctx.strokeStyle='#c93a1f'; ctx.lineWidth=ps(1.6); ctx.stroke();
    // 文字
    var textX = avX + avSize + 8;
    ctx.textAlign='left'; ctx.textBaseline='middle';
    setFont(13*S, 'bold');
    ctx.fillStyle='#1a1015';
    ctx.fillText(nick, px(textX), py(cardY + cardH/2 - 9));
    setFont(11*S);
    ctx.fillStyle='#8b2410';
    ctx.fillText(playStr, px(textX), py(cardY + cardH/2 + 9));
    // ⭐ v0.0.90 点击整卡 → 打开 profile 半屏面板
    state.tapAreas.push({
      x: px(cardX), y: py(cardY), w: ps(cardW), h: ps(cardH),
      priority: 90,
      onTap: function(){ state.profilePanel = { open:true, startTs: (M3._now?M3._now():Date.now()) }; }
    });
  }

  // ⭐ v0.0.90 全局统计（闯关数/找对/找错/正确率）—— 存本地
  var _STATS_KEY = 'laotie_stats_v1';
  function _readStats(){
    try {
      if (typeof ks!=='undefined' && ks.getStorageSync){
        var v = ks.getStorageSync(_STATS_KEY);
        if (v && typeof v==='object') return v;
        if (typeof v==='string' && v){ try { return JSON.parse(v); } catch(_e){} }
      }
      if (typeof localStorage!=='undefined'){
        var s = localStorage.getItem(_STATS_KEY);
        if (s){ try { return JSON.parse(s); } catch(_e){} }
      }
    } catch(_e){}
    return { correct:0, wrong:0, levelPass:0 };
  }
  function _writeStats(s){
    try {
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(_STATS_KEY, s);
      else if (typeof localStorage!=='undefined') localStorage.setItem(_STATS_KEY, JSON.stringify(s));
    } catch(_e){}
  }
  function _bumpStat(key, delta){
    var s = _readStats();
    s[key] = (s[key]||0) + (delta||1);
    _writeStats(s);
  }
  // ⭐ v0.2.4 已通关关卡集合（按 idx，去重），用于个人主页展示"某主题 N/M 关"
  var _PASSED_KEY = 'laotie_passed_levels_v1';
  function _readPassedSet(){
    try {
      var raw = (typeof ks!=='undefined' && ks.getStorageSync) ? ks.getStorageSync(_PASSED_KEY)
              : (typeof localStorage!=='undefined' ? localStorage.getItem(_PASSED_KEY) : '');
      if (!raw) return {};
      if (typeof raw === 'string') raw = JSON.parse(raw);
      return raw || {};
    } catch(_e){ return {}; }
  }
  function _markLevelPassed(idx){
    try {
      var m = _readPassedSet();
      if (m[idx]) return;
      m[idx] = 1;
      var v = JSON.stringify(m);
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(_PASSED_KEY, v);
      else if (typeof localStorage!=='undefined') localStorage.setItem(_PASSED_KEY, v);
    } catch(_e){}
  }
  Game._markLevelPassed = _markLevelPassed;
  Game._readPassedSet = _readPassedSet;
  Game._bumpStat = _bumpStat; // 供外部/调试用

  // ⭐ v0.0.90 profile 半屏面板（从下方滑入，40% 高）
  // ⭐ v0.0.90 profile 半屏面板（从下方滑入，40% 高）
  // 「我的战绩」弹窗 — Figma 509-1034 蓝色系
  // frame 354×463，card 354×426（#EBF3FF, border 7px #6AA0F2, r=24），banner 284×74（left=35）
  // 用户行 298×72（paddingTop=55），统计4行 298×53 gap=12（paddingBottom=32）
  function drawProfilePanel(){
    if (!state.profilePanel || !state.profilePanel.open) return;

    var SC    = 290 / 354;
    var cw    = 290;
    var ch    = Math.round(426 * SC);
    var banH  = Math.round(74  * SC);
    var banOH = Math.round(37  * SC);   // 463 - 426 = 37
    var cx    = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩（不点空白关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    // ⭐ v1.0.55: 全屏 absorber（priority 150）—— 吸收面板外所有点击
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:150, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:200, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner：left=35（⭐ banner-blue.png 已从 git 历史恢复：v1.0.98 清理素材时被误删，标题背景因此缺失）
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg,px(banX),py(frameTop),ps(banW),ps(banH));}catch(_e){}
    }
    textStroke('我的战绩', px(VW/2), py(frameTop + Math.round(28*SC)), Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：top=1, right=-15（-4 偏移）
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = frameTop + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg,px(closeImgX),py(closeImgY),ps(cs),ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8), priority:210,
      onTap:function(){ state.profilePanel.open = false; } });

    // ══ 用户行：298×72，paddingTop=55 ══
    var rowW   = Math.round(298 * SC);
    var rowH   = Math.round(72  * SC);
    var rowX   = cx + Math.round((cw - rowW) / 2);
    var rowY   = cardY + Math.round(55 * SC);
    fillRR(px(rowX), py(rowY), ps(rowW), ps(rowH), ps(Math.round(16*SC)), '#E6F6FF');
    strokeRR(px(rowX), py(rowY), ps(rowW), ps(rowH), ps(Math.round(16*SC)), '#07315E', ps(Math.round(2*SC)));

    // 头像：垂直居中于用户行，48×48，加描边 2px #07315E
    var avSize = Math.round(48 * SC);
    var avPadL = Math.round(12 * SC);
    var avX = rowX + avPadL;
    var avY = rowY + Math.round((rowH - avSize) / 2);   // 垂直居中
    var avCx = avX + avSize/2, avCy = avY + avSize/2;
    var avStrokeW = ps(Math.round(2*SC));
    var u = _loadStoredUser() || { avatar:'', nickName:'铁子' };
    // ⭐ v1.0.26 修复 bug#B3124250：profile 面板昵称超长省略号（12 字符阈值，面板更宽）
    var rawNick = u.nickName || '铁子';
    var nick = rawNick.length > 12 ? rawNick.slice(0, 12) + '…' : rawNick;
    ctx.save();
    ctx.beginPath(); ctx.arc(px(avCx), py(avCy), ps(avSize/2) - avStrokeW/2, 0, Math.PI*2); ctx.clip();
    var avImg = null;
    if(u.avatar){ avImg = state.imgs[u.avatar]; if(!avImg&&!state.imgLoading[u.avatar])try{loadImg(u.avatar);}catch(_e){} }
    if(avImg && avImg.width>1){
      try{ ctx.drawImage(avImg, px(avX), py(avY), ps(avSize), ps(avSize)); }catch(_e){}
    } else {
      var g = ctx.createLinearGradient(0,py(avY),0,py(avY+avSize));
      g.addColorStop(0,'#4080d8'); g.addColorStop(1,'#1a4fa0');
      ctx.fillStyle=g; ctx.fillRect(px(avX), py(avY), ps(avSize), ps(avSize));
      ctx.fillStyle='#fff'; setFont(Math.round(18*S),'bold'); ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText((nick||'铁')[0], px(avCx), py(avCy));
    }
    ctx.restore();
    // 描边（圆心不变，半径同裁切路径，stroke 向两侧扩，外侧超出无妨）
    ctx.beginPath(); ctx.arc(px(avCx), py(avCy), ps(avSize/2) - avStrokeW/2, 0, Math.PI*2);
    ctx.strokeStyle='#07315E'; ctx.lineWidth=avStrokeW; ctx.stroke();

    // 昵称 + 时长：与头像垂直居中
    var txtX = avX + avSize + Math.round(10 * SC);
    var nickH  = Math.round(16 * SC);  // 约一行文字高
    var subH   = Math.round(12 * SC);
    var lineGap = Math.round(6  * SC);
    var totalTxtH = nickH + lineGap + subH;
    var txtGroupY = avCy - totalTxtH / 2;
    setFont(Math.round(13*S), 'bold'); ctx.fillStyle='#222222'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(nick, px(txtX), py(txtGroupY));
    setFont(Math.round(10*S), 'bold'); ctx.fillStyle='#3078E3';
    ctx.fillText('玩了 ' + _formatPlaytime(_readPlaytime()), px(txtX), py(txtGroupY + nickH + lineGap));

    // ══ 统计区：4行 298×53 gap=12，space-between → statsY = rowY+rowH + spacing ══
    // content高 = 426-55-32=339, userRow=72, stats=248, spacing=339-72-248=19
    var statsAreaY = rowY + rowH + Math.round(19 * SC);
    var sRowW  = Math.round(298 * SC);
    var sRowH  = Math.round(53  * SC);
    var sGap   = Math.round(12  * SC);
    var sRowX  = cx + Math.round((cw - sRowW) / 2);
    var sPadX  = Math.round(13  * SC);
    var sStats = _readStats();
    var total  = (sStats.correct||0) + (sStats.wrong||0);
    var acc    = total>0 ? Math.round(sStats.correct/total*100) : 0;
    var sRows  = [
      { label:'闯关（通关次数）', val: (sStats.levelPass||0)+'关', color:'#3078E3' },
      { label:'正确率',          val: acc+'%',                    color:'#56A334' },
      { label:'找对',            val: (sStats.correct||0)+'次',   color:'#56A334' },
      { label:'找错',            val: (sStats.wrong||0)+'次',     color:'#FE575F' }
    ];
    for(var i=0; i<sRows.length; i++){
      var sY = statsAreaY + i*(sRowH + sGap);
      fillRR(px(sRowX), py(sY), ps(sRowW), ps(sRowH), ps(Math.round(12*SC)), '#E3EEFF');
      strokeRR(px(sRowX), py(sY), ps(sRowW), ps(sRowH), ps(Math.round(12*SC)), '#9FC4E4', ps(Math.round(2*SC)));
      // 左侧标签
      setFont(Math.round(13*S), 'bold'); ctx.fillStyle='#001B43'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(sRows[i].label, px(sRowX + sPadX), py(sY + sRowH/2));
      // 右侧数值
      setFont(Math.round(13*S), 'bold'); ctx.fillStyle=sRows[i].color; ctx.textAlign='right';
      ctx.fillText(sRows[i].val, px(sRowX + sRowW - sPadX), py(sY + sRowH/2));
    }
  }
  // ⭐ 设置浮层：音效开关 + 语音包（v0.0.47 一级内联展开）
  // 「设置」弹窗 — Figma 444-15691 蓝色系
  // frame 354×579，card 354×542（bottom=0），banner 284×74（left=35）
  // 内容：paddingLeft=22, 3行设置各46px/gap=11，语音包标题，语音包2列
  function drawSettingsOverlay(){
    if (!state.settingsOverlay) return;

    var SC    = 290/354;
    var cw    = 290;
    var ch    = Math.round(542 * SC);
    var banH  = Math.round(74  * SC);
    var banOH = Math.round(37  * SC);   // 579-542=37
    var cx    = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    // ⭐ v1.0.55: 全屏 absorber（priority 850）—— 吸收面板外所有点击，防止穿透到底部 icon 栏
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:850, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:900, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg,px(banX),py(frameTop),ps(banW),ps(banH));}catch(_e){}
    }
    textStroke('设置', px(VW/2), py(frameTop + Math.round(28*SC)), Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = frameTop + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg,px(closeImgX),py(closeImgY),ps(cs),ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8), priority:1100,
      onTap:function(){ state.settingsOverlay = false; } });

    // ══ 3 行设置 ══
    var rowStartY = cardY + Math.round(55 * SC);
    var rowH    = Math.round(46 * SC);
    var rowGap  = Math.round(11 * SC);
    var iconSz  = Math.round(38 * SC);
    var iconPad = Math.round(22 * SC);   // paddingLeft
    var swW     = Math.round(71 * SC), swH = Math.round(39 * SC);
    var swRightPad = Math.round(27 * SC); // paddingRight

    var muted    = (M3.Feedback && M3.Feedback.isMuted && M3.Feedback.isMuted());
    var bgmMuted = (M3.Feedback && M3.Feedback.isBgmMuted && M3.Feedback.isBgmMuted());

    var settingRows = [
      { key:'assets/ui/icon-music.png',   label:'音乐', isToggle:true,  on: !muted,
        onTap: function(){
          if (M3.Feedback && M3.Feedback.toggleMuted){
            M3.Feedback.toggleMuted();
            if (!M3.Feedback.isMuted()) M3.Feedback.click();
          }
        }
      },
      { key:'assets/ui/icon-speaker.png', label:'音效', isToggle:true,  on: !muted && !bgmMuted,
        onTap: function(){
          if (!muted && M3.Feedback && M3.Feedback.toggleBgmMuted){
            M3.Feedback.toggleBgmMuted();
            if (!M3.Feedback.isBgmMuted()) M3.Feedback.click();
          }
        }
      },
      { key:'assets/ui/icon-trash.png',   label:'进度', isToggle:false, on: false,
        onTap: null
      }
    ];

    for(var ri=0; ri<settingRows.length; ri++){
      var sr = settingRows[ri];
      var ry = rowStartY + ri*(rowH + rowGap) + rowH/2;
      // 图标
      var icImg = state.imgs[sr.key];
      if(!icImg&&!state.imgLoading[sr.key])try{loadImg(sr.key);}catch(_e){}
      if(icImg&&icImg.width>0){
        try{ctx.drawImage(icImg,px(cx+iconPad),py(ry-iconSz/2),ps(iconSz),ps(iconSz));}catch(_e){}
      }
      // 标签
      setFont(Math.round(15*S),'bold'); ctx.fillStyle='#000000'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(sr.label, px(cx+iconPad+iconSz+Math.round(4*SC)), py(ry));
      // 右侧：toggle 或 清空按钮
      var rightX = cx + cw - swRightPad - swW;
      if(sr.isToggle){
        var togKey = sr.on ? 'assets/ui/toggle-on.png' : 'assets/ui/toggle-off.png';
        var togImg = state.imgs[togKey];
        if(!togImg&&!state.imgLoading[togKey])try{loadImg(togKey);}catch(_e){}
        if(togImg&&togImg.width>0){
          try{ctx.drawImage(togImg,px(rightX),py(ry-swH/2),ps(swW),ps(swH));}catch(_e){}
        } else {
          fillRR(px(rightX),py(ry-swH/2),ps(swW),ps(swH),ps(swH/2),sr.on?'#5fd35a':'#bbb');
          strokeRR(px(rightX),py(ry-swH/2),ps(swW),ps(swH),ps(swH/2),'#1a1015',ps(2));
        }
        state.tapAreas.push({ x:px(rightX-4),y:py(ry-swH/2-4),w:ps(swW+8),h:ps(swH+8), priority:1000, onTap:sr.onTap });
      } else {
        // 清空按钮 — Figma 444:15649: 69×39, r=13, border=2.58px #4D0000, bg=#FF6D6D
        // inset高光: top=4, w=59, h=11, opacity=0.3白色; shadow: 0 2.17px #00000040
        var clrSW = Math.round(69*SC), clrSH = Math.round(39*SC);
        var clrR  = Math.round(13*SC);
        var clrSX = cx + cw - swRightPad - clrSW;
        var clrSY = ry - clrSH/2;
        // 外阴影
        ctx.save();
        ctx.shadowColor='rgba(0,0,0,0.25)'; ctx.shadowOffsetY=ps(2.17*SC); ctx.shadowBlur=0;
        fillRR(px(clrSX),py(clrSY),ps(clrSW),ps(clrSH),ps(clrR),'#FF6D6D');
        ctx.restore();
        // border
        strokeRR(px(clrSX),py(clrSY),ps(clrSW),ps(clrSH),ps(clrR),'#4D0000',ps(Math.round(2.58*SC)));
        // 文字 14px 800weight
        textStroke('清空',px(clrSX+clrSW/2),py(clrSY+clrSH/2),Math.round(14*S),'#FFFFFF','#4D0000','center',ps(1));
        state.tapAreas.push({ x:px(clrSX-4),y:py(clrSY-4),w:ps(clrSW+8),h:ps(clrSH+8), priority:1000,
          onTap:function(){
            try {
              // ⭐ v1.0.93 清空必须连音色解锁/当前选中包/失败计数也清（lihui26 反馈）
              var keys = [
                'laotie_hint_free_date',
                'theme_1_unlocked','theme_2_unlocked','theme_3_unlocked',
                'laotie_skip_welcome','laotie_stats_v1','laotie_playtime_ms','laotie_user',
                'laotie_voice_unlocks_v1',   // ⭐ 激励视频解锁的音色（当天有效那批）
                'laotie_voice_pack',          // ⭐ 当前选中语音包
                'laotie_theme_unlocks_v1',    // ⭐ 场景3每日激励视频解锁
                'laotie_fail_streak_v1',      // ⭐ 关卡连续失败计数
                'laotie_lv_ad_unlocks_v1'     // ⭐ 关卡看广告解锁
              ];
              // 主题列表由远程 JSON 下发，动态清除全部主题的上次关卡位置。
              try { (M3.THEMES || []).forEach(function(t){ if(t && t.id != null) keys.push('laotie_last_level_' + t.id); }); } catch(_e){}
              keys.forEach(function(k){
                try { if (typeof ks!=='undefined'&&ks.removeStorageSync) ks.removeStorageSync(k); } catch(_e){}
                try { if (typeof localStorage!=='undefined') localStorage.removeItem(k); } catch(_e){}
              });
              // 清除所有 story 主题的通关记录，不再写死 themeId 5。
              try {
                var storyPassed = _readPassedSet();
                (M3.LEVELS || []).forEach(function(lv, levelPos){
                  if (lv && lv.mode === 'story') delete storyPassed[levelPos];
                });
                var storyPassedValue = JSON.stringify(storyPassed);
                if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(_PASSED_KEY, storyPassedValue);
                else if (typeof localStorage!=='undefined') localStorage.setItem(_PASSED_KEY, storyPassedValue);
              } catch(_e){}
              try { if (M3&&M3.THEMES) M3.THEMES.forEach(function(t){ if(t.unlockBy==='share') t.unlocked=false; }); }catch(_e){}
              // 语音包切回默认小美 + 停当前音效
              try { if (M3.Feedback){
                if (M3.Feedback.stopVoice) M3.Feedback.stopVoice();
                var dft = (M3.VOICE_PACKS||[]).filter(function(p){return p.id===(M3.DEFAULT_VOICE_PACK||'xiaomei');})[0];
                if (dft && M3.Feedback.setVoicePack) M3.Feedback.setVoicePack(dft);
              }}catch(_e){}
              // 正在任意 story 主题里点清空时，立即回到当前主题第1关。
              try {
                if (state.level && state.level.mode === 'story'){
                  var storyThemeId = state.level.themeId;
                  var storyLevels = M3.getThemeLevels(storyThemeId);
                  var storyFirstPos = storyLevels.length ? M3.LEVELS.indexOf(storyLevels[0]) : -1;
                  if (storyFirstPos >= 0){
                    state.settingsOverlay = false;
                    Game.pickLevel(storyFirstPos);
                  }
                }
              } catch(_e){}
            } catch(e){}
            toast('已清除所有进度、任务和解锁音色 ✔');
          }
        });
      }
    }

    // ══ 语音包分隔线标题：marginTop=27 ══
    var vpTitleLineY = rowStartY + 3*(rowH+rowGap) - rowGap + Math.round(27*SC);
    var lineLen = Math.round(100*SC);
    var titleCenterX = cx + cw/2;
    var titleMidY    = vpTitleLineY + Math.round(11*SC);
    // 先量文字宽，再对称布局
    setFont(Math.round(16*S),'bold');
    var vpTextW = ctx.measureText('语音包').width / S;
    var lineGap = Math.round(8*SC);
    var leftLineEnd   = titleCenterX - vpTextW/2 - lineGap;
    var leftLineStart = leftLineEnd - lineLen;
    var rightLineStart= titleCenterX + vpTextW/2 + lineGap;
    var rightLineEnd  = rightLineStart + lineLen;
    ctx.beginPath(); ctx.moveTo(px(leftLineStart),py(titleMidY)); ctx.lineTo(px(leftLineEnd),py(titleMidY));
    ctx.strokeStyle='#ABCCFF'; ctx.lineWidth=ps(2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(rightLineStart),py(titleMidY)); ctx.lineTo(px(rightLineEnd),py(titleMidY));
    ctx.strokeStyle='#ABCCFF'; ctx.stroke();
    textStroke('语音包', px(titleCenterX), py(titleMidY), Math.round(16*S), '#ffffff', '#07315E', 'center', ps(2));

    // ══ 语音包 2 列布局 ══
    // Figma: 两行容器宽297px，gap=9px，两列各144px，在卡片290px内水平居中
    var vpStartY = vpTitleLineY + Math.round(16*SC) + Math.round(23*SC);
    var cardW  = Math.round(144*SC);
    var cardHv = Math.round(65 *SC);
    var cardRowGap = Math.round(14*SC);
    var colGap = Math.round(9*SC);
    var colLeftX  = cx + Math.round((cw - cardW*2 - colGap)/2);
    var colRightX = colLeftX + cardW + colGap;
    var curId  = (M3.Feedback&&M3.Feedback.getVoicePackId) ? M3.Feedback.getVoicePackId() : (M3.DEFAULT_VOICE_PACK||'xiaomei');

    if (M3.VOICE_PACKS){
      // ⭐ v1.0.82 隐藏 hidden:true 的语音包（酷二狗/辣辣，规避主播肖像风险）
      var _visiblePacks = M3.VOICE_PACKS.filter(function(p){ return !p.hidden; });
      for(var vi=0; vi<_visiblePacks.length; vi++){
        var pack = _visiblePacks[vi];
        var vcol = vi % 2;
        var vrow = Math.floor(vi / 2);
        var vcx  = vcol===0 ? colLeftX : colRightX;
        var vcy  = vpStartY + vrow*(cardHv + cardRowGap);
        var selected = pack.id === curId;
        var locked   = !isVoicePackUnlocked(pack.id);

        // 卡片背景切图
        var cardImgKey;
        if(selected)      cardImgKey = 'assets/ui/vp-selected.png';
        else if(locked)   cardImgKey = 'assets/ui/vp-locked.png';
        else              cardImgKey = 'assets/ui/vp-unlocked.png';
        var cardBgImg = state.imgs[cardImgKey];
        if(!cardBgImg&&!state.imgLoading[cardImgKey])try{loadImg(cardImgKey);}catch(_e){}
        if(cardBgImg&&cardBgImg.width>0){
          try{ctx.drawImage(cardBgImg,px(vcx),py(vcy),ps(cardW),ps(cardHv));}catch(_e){}
        } else {
          fillRR(px(vcx),py(vcy),ps(cardW),ps(cardHv),ps(Math.round(12*SC)), selected?'#c8f59a':( locked?'#E3EEFF':'#ffffff'));
          strokeRR(px(vcx),py(vcy),ps(cardW),ps(cardHv),ps(Math.round(12*SC)), selected?'#56A334':(locked?'#9FC4E4':'#07315E'),ps(2));
        }

        // 头像
        // Figma: 头像33×33, marginLeft=12, vertically centered
        // 选中/解锁态头像和文字整体上移2px
        var avDiam = Math.round(33*SC);
        var avR = avDiam/2;
        var avStW = ps(Math.round(1*SC));
        var avCx = vcx + Math.round(12*SC) + avR;
        var contentOffY = locked ? -2 : -Math.round(2*SC) - 2;   // 非锁定上移2px，整体再上移2
        var avCy = vcy + cardHv/2 + contentOffY;
        ctx.save();
        ctx.beginPath(); ctx.arc(px(avCx),py(avCy),ps(avR)-avStW/2,0,Math.PI*2); ctx.clip();
        var avImg = state.imgs[pack.avatar];
        if(avImg&&avImg.width>1){
          try{ctx.drawImage(avImg,px(avCx-avR),py(avCy-avR),ps(avDiam),ps(avDiam));}catch(_e){}
        } else {
          ctx.fillStyle='#c4dbff'; ctx.fillRect(px(avCx-avR),py(avCy-avR),ps(avDiam),ps(avDiam));
          if(!state.imgLoading[pack.avatar]) loadImg(pack.avatar);
        }
        if(locked){ ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(px(avCx-avR),py(avCy-avR),ps(avDiam),ps(avDiam)); }
        ctx.restore();
        ctx.beginPath(); ctx.arc(px(avCx),py(avCy),ps(avR)-avStW/2,0,Math.PI*2);
        ctx.strokeStyle='#000000'; ctx.lineWidth=avStW; ctx.stroke();

        // 名字（bold）+ 描述
        var txtX = avCx + avR + Math.round(6*SC);
        var nameSize = Math.round(14*S);
        var descSize = Math.round(10*S);
        var gap = Math.round(5*SC);
        var blockH = nameSize + gap + descSize;
        var nameY = avCy - blockH/2;
        var descY = nameY + nameSize + gap;
        setFont(nameSize,'bold'); ctx.fillStyle='#000000'; ctx.textAlign='left'; ctx.textBaseline='top';
        ctx.fillText(pack.name, px(txtX), py(nameY));
        setFont(descSize, 'normal'); ctx.fillStyle='#000000';
        var dtext = locked ? '看广告解锁' : (pack.desc||'');
        var maxW = ps(vcx + cardW - Math.round(8*SC) - txtX);
        while(dtext.length>1 && ctx.measureText(dtext).width > maxW) dtext = dtext.slice(0,-1)+'…';
        ctx.fillText(dtext, px(txtX), py(descY));

        // 点击处理
        (function(p,vcx2,vcy2,isLocked){
          state.tapAreas.push({ x:px(vcx2),y:py(vcy2),w:ps(cardW),h:ps(cardHv), priority:1000,
            onTap:function(){
              if(M3.Feedback&&M3.Feedback.isMuted&&M3.Feedback.isMuted()){ toast('请打开上方全局音乐后切换'); return; }
              if(isLocked){ state.voiceUnlockPending = p; return; }
              if(M3.Feedback&&M3.Feedback.setVoicePack){ M3.Feedback.setVoicePack(p); try{M3.Feedback.play('greet');}catch(e){} }
            }
          });
        })(pack,vcx,vcy,locked);
      }
    }
  }

  // ⭐ v0.0.47 语音包二级浮层已合并到一级设置面板，此函数保留空壳兼容旧调用
  function drawVoicePackOverlay(){ /* 空实现，二级已下线 */ }

  // 底部 icon 栏：入口奖励 / 解锁全部 / + 添加桌面 / 设为常用
  // ⭐ v0.2.3 改用切图渲染（图片含底托+标签）
  // ⭐ v1.3.0 主题分页控件
  // 布局（参考 Figma 92:214）：[双箭头] [单箭头]  1/N  [单箭头] [双箭头]
  // a.png = 单箭头（上一页/下一页），aa.png = 双箭头（第一页/最后一页）
  function drawThemePager(barY, barH, curPage, pageCount){
    var btnSize = 40;  // 箭头图标逻辑像素
    var centerX = VW / 2;
    var midY    = barY + barH / 2;

    // 翻页状态
    var isFirst = curPage === 0;
    var isLast  = curPage === pageCount - 1;

    var imgA  = state.imgs['assets/ui/a.png'];
    var imgAA = state.imgs['assets/ui/aa.png'];

    // ── 绘制一个箭头按钮 ──────────────────────────────────────────────
    function _drawArrow(img, cx, cy, size, flip, disabled){
      ctx.save();
      if (disabled){ ctx.globalAlpha = 0.3; }
      if (img && img.width > 0){
        // flip=true 时水平镜像（右箭头 = 镜像左箭头）
        if (flip){
          ctx.translate(px(cx + size/2), py(cy - size/2));
          ctx.scale(-1, 1);
          try { ctx.drawImage(img, 0, 0, ps(size), ps(size)); } catch(e){}
        } else {
          try { ctx.drawImage(img, px(cx - size/2), py(cy - size/2), ps(size), ps(size)); } catch(e){}
        }
      } else {
        // 兜底：圆形色块 + 三角
        ctx.beginPath();
        ctx.arc(px(cx), py(cy), ps(size/2), 0, Math.PI*2);
        ctx.fillStyle = disabled ? '#ccc' : '#5b9df8';
        ctx.fill();
        // 三角指向
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        if (!flip){
          ctx.moveTo(px(cx - size*0.15), py(cy - size*0.22));
          ctx.lineTo(px(cx + size*0.18), py(cy));
          ctx.lineTo(px(cx - size*0.15), py(cy + size*0.22));
        } else {
          ctx.moveTo(px(cx + size*0.15), py(cy - size*0.22));
          ctx.lineTo(px(cx - size*0.18), py(cy));
          ctx.lineTo(px(cx + size*0.15), py(cy + size*0.22));
        }
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 左侧：[双箭头 aa] [单箭头 a]  ────────────────────────────────
    var gapX   = 6;   // 两个按钮之间间距
    var lblW   = 55;  // 页码文字宽
    // 左侧两按钮右边界 = centerX - lblW/2 - 8（留 padding）
    var leftGroupR = centerX - lblW/2 - 8;
    var aL_cx  = leftGroupR - btnSize/2;             // 单箭头（靠近中间）
    var aaL_cx = aL_cx - btnSize - gapX;             // 双箭头（更靠左）

    _drawArrow(imgAA, aaL_cx, midY, btnSize, false, isFirst);
    _drawArrow(imgA,  aL_cx,  midY, btnSize, false, isFirst);

    // 热区：上一页
    if (!isFirst){
      (function(){
        state.tapAreas.push({
          x: px(aaL_cx - btnSize/2 - 4), y: py(midY - btnSize/2 - 4),
          w: ps(btnSize*2 + gapX + 8), h: ps(btnSize + 8),
          priority: 60,
          onTap: function(){ state.themePage = Math.max(0, state.themePage - 1); }
        });
        // 双箭头专属热区：回第 0 页
        state.tapAreas.push({
          x: px(aaL_cx - btnSize/2 - 4), y: py(midY - btnSize/2 - 4),
          w: ps(btnSize + 8), h: ps(btnSize + 8),
          priority: 65,
          onTap: function(){ state.themePage = 0; }
        });
      })();
    }

    // ── 中间页码文字 ──────────────────────────────────────────────────
    ctx.save();
    setFont(Math.round(20*S), '900');
    ctx.fillStyle = '#070857';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((curPage+1) + '/' + pageCount, px(centerX), py(midY));
    ctx.restore();

    // ── 右侧：[单箭头 a（翻转）] [双箭头 aa（翻转）] ─────────────────
    var rightGroupL = centerX + lblW/2 + 8;
    var aR_cx  = rightGroupL + btnSize/2;
    var aaR_cx = aR_cx + btnSize + gapX;

    _drawArrow(imgA,  aR_cx,  midY, btnSize, true, isLast);
    _drawArrow(imgAA, aaR_cx, midY, btnSize, true, isLast);

    // 热区：下一页
    if (!isLast){
      (function(){
        state.tapAreas.push({
          x: px(aR_cx - btnSize/2 - 4), y: py(midY - btnSize/2 - 4),
          w: ps(btnSize*2 + gapX + 8), h: ps(btnSize + 8),
          priority: 60,
          onTap: function(){ state.themePage = Math.min(pageCount - 1, state.themePage + 1); }
        });
        // 双箭头专属热区：去最后一页
        state.tapAreas.push({
          x: px(aaR_cx - btnSize/2 - 4), y: py(midY - btnSize/2 - 4),
          w: ps(btnSize + 8), h: ps(btnSize + 8),
          priority: 65,
          onTap: function(){ state.themePage = pageCount - 1; }
        });
      })();
    }
  }

  function drawThemeBottomBar(){
    var barY = VH - 21;
    var items = [
      { imgKey:'assets/ui/btn-settings.png', label:'设置',    tap:function(){ state.settingsOverlay = true; if (M3.Analytics) M3.Analytics.buttonClick('btn_settings_game'); if (M3.Analytics) M3.Analytics.screenEnter('settings'); if (M3.Tele) M3.Tele.report(M3.Tele.SC.OPEN_SETTINGS, { dimension:{ from:'game' } }); try { _reportBtnClick('btn_settings', 'game'); } catch(_e){} } },
      { imgKey:'assets/ui/btn-unlock.png',   label:'解锁全部', tap:openUnlockOverlay },
      { imgKey:'assets/ui/btn-desktop.png',  label:'添加桌面', tap:addShortcut },
      { imgKey:'assets/ui/btn-share.png',    label:'分享好友', tap:shareToFriend }
    ];
    // ⭐ v1.0.59: 只有已成功添加到桌面才隐藏「添加桌面」按钮
    if (state._shortcutInstalled){
      items = items.filter(function(it){ return it.imgKey !== 'assets/ui/btn-desktop.png'; });
    }
    var n = items.length, cellW = VW / n;
    var iconSize = 60; // 切图逻辑尺寸（含底托+标签文字的完整正方形）
    items.forEach(function(it, i){
      var cx = i * cellW + cellW / 2;
      var img = state.imgs && state.imgs[it.imgKey];
      if (img && img.width > 0){
        var iw = ps(iconSize), ih = ps(iconSize);
        var ix = px(cx) - iw / 2;
        var iy = py(barY) - ih / 2;
        try { ctx.drawImage(img, ix, iy, iw, ih); } catch(e){}
      } else {
        // 兜底：切图未加载时显示色块+文字
        var iconR = 17;
        ctx.beginPath(); ctx.arc(px(cx), py(barY), ps(iconR), 0, Math.PI*2);
        ctx.fillStyle = '#ffcf5b'; ctx.fill();
        ctx.strokeStyle = '#1a1015'; ctx.lineWidth = ps(2); ctx.stroke();
        textStroke(it.label, px(cx), py(barY + iconR + 12), 11*S, '#fff8e1', '#1a1015', 'center', ps(2.4));
      }
      // 热区只覆盖切图实际尺寸，不扩展到整列，避免误触
      state.tapAreas.push({ x:px(cx) - ps(iconSize)/2, y:py(barY) - ps(iconSize)/2, w:ps(iconSize), h:ps(iconSize), onTap:it.tap });
    });
  }

  // 添加到桌面（快手小游戏 API：ks.showShortcutMenu / ks.addShortcut）
  // ⭐ v1.0.59: 添加成功后持久化状态 → drawThemeBottomBar 会自动隐藏此按钮
  function _markShortcutInstalled(){
    state._shortcutInstalled = true;
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      if (ks && ks.setStorageSync) ks.setStorageSync('laotie_shortcut_installed', 1);
      else if (typeof localStorage !== 'undefined') localStorage.setItem('laotie_shortcut_installed', '1');
    } catch(_e){}
  }
  function addShortcut(){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : (typeof global!=='undefined' ? global.ks : null);
      if (ks && typeof ks.showShortcutMenu === 'function'){
        ks.showShortcutMenu({
          success: function(){ _markShortcutInstalled(); toast('已添加到桌面 ✔'); },
          fail: function(){ toast('添加失败，请稍后再试'); }
        });
        return;
      }
      if (ks && typeof ks.addShortcut === 'function'){
        ks.addShortcut({
          success: function(){ _markShortcutInstalled(); toast('已添加到桌面 ✔'); },
          fail: function(){ toast('添加失败，请稍后再试'); }
        });
        return;
      }
      toast('长按图标即可添加到桌面 📱');
    } catch(e){ toast('添加失败：'+String(e).slice(0,30)); }
  }
  // ⭐ v1.0.59: 启动时主动查一次桌面状态（例如用户已手动加过，或换设备 storage 丢了）
  function _checkShortcutOnBoot(){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : null;
      if (ks && typeof ks.checkShortcut === 'function'){
        ks.checkShortcut({
          success: function(res){ if (res && res.installed) _markShortcutInstalled(); },
          fail: function(){}
        });
      }
    } catch(_e){}
  }
  try { _checkShortcutOnBoot(); } catch(_e){}

  // ⭐ v0.0.48 分享好友 · 调起快手分享面板
  function shareToFriend(){
    try {
      var ks = (typeof window!=='undefined' && window.ks) ? window.ks : (typeof global!=='undefined' ? global.ks : null);
      var payload = {
        channel: 'system',
        title: '老铁眼真尖 · 眼力大挑战',
        desc: '来试试你的眼力！一起找找图里穿越了的物件～',
        success: function(){ toast('分享成功 ✔'); },
        fail: function(){ toast('分享已取消'); }
      };
      if (ks && typeof ks.shareAppMessage === 'function'){ ks.shareAppMessage(payload); return; }
      if (ks && typeof ks.share === 'function'){ ks.share(payload); return; }
      toast('分享面板未开放，请更新快手 App');
    } catch(e){ toast('分享失败：'+String(e).slice(0,30)); }
  }

  /* ════════════════════════════════════════════════════════════
   * 🚨 全局 toast · 红头铁律（本工程内所有临时提示统一入口）
   * ────────────────────────────────────────────────────────────
   * ① 位置：屏幕【垂直居中 · 水平居中】（VH*0.5 · VW/2），不允许再自建 bubble/tip 面板
   * ② 尺寸：宽自适应 160-300（按文字自动伸缩），高 48，圆角 14
   * ③ 样式：深底 rgba(26,16,21,0.94) + 金描边 + 米白字 + 1.6s 淡出
   * ④ 触发：所有「一次性提示」（成功、失败、hint、权限、分享结果等）
   *          → 一律 toast(msg)，不允许再自建箭头/浮层
   * ⑤ hint 提示：不再画箭头，直接 toast 文案
   * ⑥ AD 角标文案：一律「看视频」（drawAdBadge 已收敛）
   * ════════════════════════════════════════════════════════════ */
  // ⭐ v0.0.75 toast 支持两种形态：默认居中 1.6s；top=true 时改系顶部胶囊 tips 栏展示 3.6s
  function toast(msg, opts){
    opts = opts || {};
    state.toastMsg = msg;
    state.toastTop = !!opts.top;
    state.toastUntil = M3._now() + (opts.duration || 1600);
  }
  // ⭐ v0.0.48c 「击败 xx% 老铁」动态计算（全局统一）
  //   规则：
  //   - ratio = 剩余时间 / 总时长（clamp 0~1）
  //   - 基础分 base = 40 + ratio*55   → 极限 40~95
  //   - 难度加成 +0/+2/+4/+6（easy/normal/hard/hell）
  //   - 关卡稳定小抖动 ±3（用 levelIdx 做种子，同一关反复看到的百分比稳定）
  //   - 结尾称谓根据挡位切换：60↓ 玩家 / 60-79 老铁 / 80-89 高手 / 90+ 大神
  function calcBeatPercent(remain, duration, diff, levelIdx){
    var ratio = duration>0 ? Math.max(0, Math.min(1, remain/duration)) : 0;
    var base = 40 + ratio * 55;
    // 难度加成
    var diffKey = (diff && diff.key) || (diff && diff.name) || '';
    var diffBonus = 0;
    if (/hell|地狱/i.test(diffKey)) diffBonus = 6;
    else if (/hard|难/i.test(diffKey)) diffBonus = 4;
    else if (/easy|简单/i.test(diffKey)) diffBonus = 0;
    else diffBonus = 2;
    // 稳定抖动 ±3（levelIdx 种子）
    var seed = ((levelIdx||0) * 9301 + 49297) % 233280;
    var jitter = ((seed / 233280) * 6) - 3;
    var pct = Math.round(base + diffBonus + jitter);
    if (pct < 20) pct = 20;
    if (pct > 99) pct = 99;
    var suffix;
    if (pct >= 90) suffix = '大神';
    else if (pct >= 80) suffix = '高手';
    else if (pct >= 60) suffix = '老铁';
    else suffix = '玩家';
    return { pct: pct, suffix: suffix };
  }
  // ⭐ 全局点击涟漪（在任意 tapArea 命中的位置轻画一圈金色涟漪）
  function drawClickRipples(){
    if (!state.clickRipples || !state.clickRipples.length) return;
    ctx.save();
    state.clickRipples.forEach(function(r){
      var p = r.life / r.max; // 1 → 0
      var age = 1 - p;
      var radius = ps(4) + age * ps(22);   // ⭐ v0.0.55 更小更轻：6→4 起始 · 28→22 最终
      var a = p * 0.32;                    // ⭐ v0.0.55 峰值 0.55→0.32，更淡
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI*2);
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = ps(1.6 * p + 0.6);   // ⭐ 更细
      ctx.stroke();
      // 内环（更淡）
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius*0.5, 0, Math.PI*2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = ps(1);
      ctx.stroke();
    });
    ctx.restore();
  }
  // ⭐ v0.0.48c 错误点击反馈（点位红色扩散圈 + 中央 X，life 0.4s → 0）
  function drawErrRipples(){
    if (!state.errRipples || !state.errRipples.length) return;
    ctx.save();
    state.errRipples.forEach(function(r){
      var p = r.life / 0.4;               // 1 → 0
      var age = 1 - p;                     // 0 → 1
      var radius = ps(10) + age * ps(28);
      ctx.globalAlpha = p * 0.85;
      // 双层红圈（外粗内细）
      ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI*2);
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = ps(3);
      ctx.stroke();
      ctx.globalAlpha = p * 0.55;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius*0.6, 0, Math.PI*2);
      ctx.strokeStyle = '#ffb3b3';
      ctx.lineWidth = ps(1.6);
      ctx.stroke();
    });
    ctx.restore();
  }
  function drawToast(){
    if (!state.toastMsg || M3._now() >= state.toastUntil) return;
    var left = (state.toastUntil - M3._now())/1000;
    var a = left < 0.35 ? Math.max(0, left/0.35) : 1;
    setFont(16*S, 'bold');
    var msg = String(state.toastMsg||'');
    // ⭐ v1.0.5 动态宽度 toast：宽度跟文案走（不再通栏）+ 支持 \n 换行 + 超长按屏宽自动折行 + 胶囊圆角
    var padX = 20, padY = 10;
    var minBoxW = 120;
    var maxBoxW = VW - 24;
    var maxTextW = maxBoxW - padX * 2;
    function measure(str){ return ctx.measureText(str).width / S; }
    var rawLines = msg.split('\n');
    var lines = [];
    for (var li=0; li<rawLines.length; li++){
      var line = rawLines[li];
      if (measure(line) <= maxTextW){ lines.push(line); continue; }
      var cur = '';
      for (var ci=0; ci<line.length; ci++){
        var ch = line.charAt(ci);
        if (measure(cur + ch) > maxTextW){ lines.push(cur); cur = ch; }
        else cur += ch;
      }
      if (cur) lines.push(cur);
    }
    var contentW = 0;
    for (var k=0; k<lines.length; k++){
      var lw = measure(lines[k]);
      if (lw > contentW) contentW = lw;
    }
    var lineH = 22;
    var boxWv = Math.max(minBoxW, Math.min(maxBoxW, contentW + padX * 2));
    var boxHv = Math.max(40, lines.length * lineH + padY * 2);
    var boxW = ps(boxWv);
    var boxH = ps(boxHv);
    var cxScreen = OX + VW * S / 2;
    var cyScreen;
    if (state.toastTop){
      cyScreen = OY + ps(64) + boxH/2 - ps(20);
    } else {
      cyScreen = OY + VH * S / 2 - ps(40);
    }
    ctx.save();
    ctx.globalAlpha = a;
    var bx = cxScreen - boxW/2, by = cyScreen - boxH/2;
    var br = ps(Math.min(20, boxHv/2));  // 胶囊圆角
    // 阴影
    fillRR(bx, by + ps(4), boxW, boxH, br, 'rgba(80,10,10,0.22)');
    // 奶白背景
    fillRR(bx, by, boxW, boxH, br, '#FFF8F5');
    // 暗红描边
    strokeRR(bx, by, boxW, boxH, br, '#5C1515', ps(2));
    _lastBaseline = '';
    // 多行文字：以 box 竖直中心均分
    var totalH = lines.length * lineH;
    var startY = cyScreen - ps(totalH/2) + ps(lineH/2);
    for (var i=0; i<lines.length; i++){
      textStroke(lines[i], cxScreen, startY + ps(i*lineH) + ps(1), 16*S, '#2a0808', '#FFF8F5', 'center', ps(2.5));
    }
    ctx.restore(); _lastBaseline = '';
  }

  // 「解锁全部关卡」浮层：看 5 个广告解锁 → 点击调广告位
  // ⭐ v1.0.59: 若全部主题已解锁，直接 toast 提示，不再开浮层
  function _allThemesUnlocked(){
    if (!M3.THEMES) return false;
    var visible = M3.THEMES.filter(function(t){ return !t.hidden && !t.comingsoon; });
    if (!visible.length) return false;
    for (var i=0;i<visible.length;i++){ if (!visible[i].unlocked) return false; }
    return true;
  }
  function openUnlockOverlay(){
    if (_allThemesUnlocked()){ toast('已全部解锁哈 ✔'); return; }
    state.unlockOverlay = true;
  }

  // 「解锁全部场景」浮层 — Figma 436-3235
  // frame 354×398，card 354×363（bg #EBF3FF, border 7px #6AA0F2, r=24），banner 284×74（left=35,top=0,paddingTop=17）
  // 锁图标 132×61（marginTop=77），文字 fontSize=20 lineHeight=34（marginTop=20），按钮 260×60（marginTop=45）
  function drawUnlockOverlay(){
    if (!state.unlockOverlay) return;

    var cw  = 290;
    var SC  = cw / 354;
    var ch  = Math.round(363 * SC);   // 卡片高度
    var banH = Math.round(74 * SC);   // Figma banner 高度
    var banOH = Math.round(35 * SC);  // banner 超出卡顶（398-363=35）
    var cx  = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    // ⭐ v1.0.55: 全屏 absorber（priority 17）—— 吸收面板外所有点击
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:17, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:18, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner：宽=284*SC，left=35*SC，top=frameTop
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg, px(banX), py(frameTop), ps(banW), ps(banH));}catch(_e){}
    }
    // 标题：paddingTop=17，fontSize=22，中心 ≈ frameTop+17+11=frameTop+28
    textStroke('解锁全部场景', px(VW/2), py(frameTop + Math.round(28*SC)),
               Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：Figma top=20, right=-15（相对 frame 右边超出15px）
    // 图片左上角 x = cx + cw - 15*SC，y = frameTop + 20*SC
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = frameTop + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg, px(closeImgX), py(closeImgY), ps(cs), ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8),
      priority:20, onTap:function(){ state.unlockOverlay=false; } });

    // 锁图标：132×61（Figma 原始），marginTop=77，居中
    var lkW = Math.round(132 * SC);
    var lkH = Math.round(61 * SC);
    var iconTopY = cardY + Math.round(77 * SC);
    var lockImg = state.imgs['assets/ui/icon-lock.png'];
    if(!lockImg&&!state.imgLoading['assets/ui/icon-lock.png'])try{loadImg('assets/ui/icon-lock.png');}catch(_e){}
    if(lockImg&&lockImg.width>0){
      try{ctx.drawImage(lockImg, px(cx + Math.round((cw-lkW)/2)), py(iconTopY), ps(lkW), ps(lkH));}catch(_e){}
    } else {
      text('🔒',px(VW/2),py(iconTopY+lkH/2),Math.round(32*S),'#4a3b33','center');
    }

    // 文字：marginTop=20，fontSize=20，lineHeight=34，两行
    var textY = iconTopY + lkH + Math.round(20 * SC);
    setFont(Math.round(18*S)); ctx.fillStyle='#00255E'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('观看5个广告即可', px(VW/2), py(textY));
    ctx.fillText('永久解锁全部场景', px(VW/2), py(textY + Math.round(34*SC)));

    // 按钮：260×60，marginTop=45（Figma）
    var bw = Math.round(260 * SC), bh = Math.round(60 * SC);
    var bx = cx + Math.round((cw - bw) / 2);
    var by = textY + Math.round(34*SC) + Math.round(34*SC) + Math.round(45*SC);
    candyButton(px(bx), py(by), ps(bw), ps(bh), '看视频解锁', Math.round(18*S), 'green', false);

    state.tapAreas.push({ x:px(bx), y:py(by), w:ps(bw), h:ps(bh), priority:20, onTap:unlockAllByAd });
  }
  // 调用快手激励视频广告位（无 API 时退化为直接解锁提示）
  // ⭐ v1.0.6 广告加载前显示全局 loading（state.adLoading）
  // ⭐ v1.0.26 修复 bug#B3130735：原本 hardcode 假 adUnitId 'ks_rewarded_unlock_all' 导致广告加载失败
  //           改走统一的 M3.KwaiAd.showRewarded（读 kwai-ad-config.js 的真实 adUnitId '2300058115_01'）
  function unlockAllByAd(){
    state.unlockOverlay = false;
    // ⭐ v1.0.26 走统一激励广告入口，含 loading/超时/失败 完整逻辑
    if (M3.KwaiAd && M3.KwaiAd.showRewarded){
      state.adLoading = true;
      state.adLoadingText = '广告加载中...';
      var _adCleared = false;
      function _clr(){ if (_adCleared) return; _adCleared = true; state.adLoading = false; state.adLoadingText = ''; }
      var _to = setTimeout(function(){ _clr(); toast('广告加载超时，稍后再试'); }, 8000);
      M3.KwaiAd.showRewarded(function(ok){
        clearTimeout(_to); _clr();
        if (!ok){ toast('需看完广告才能解锁哦'); return; }
        // 解锁全部主题（永久）
        try {
          var ksApi = (typeof ks !== 'undefined') ? ks : (window && window.ks);
          if (M3.THEMES){
            M3.THEMES.forEach(function(t){
              t.unlocked = true;
              try {
                if (ksApi && ksApi.setStorageSync) ksApi.setStorageSync('theme_'+t.id+'_unlocked', 1);
                else if (typeof localStorage !== 'undefined') localStorage.setItem('theme_'+t.id+'_unlocked', '1');
              } catch(_e){}
            });
          }
        } catch(e){}
        toast('已解锁全部场景 ✔');
        if (M3.Feedback && M3.Feedback.unlockAnthem) M3.Feedback.unlockAnthem();
      });
      return;
    }
    toast('广告位准备中，敬请期待～');
  }

  // ⭐ v0.0.98 语音包解锁弹窗（视觉与 drawUnlockOverlay 一致：PAPER 底 + INK 描边 + 红色 title + candyButton）
  // 「解锁特色语音」弹窗 — Figma 514-2318 蓝色系
  // frame 354×398，card 354×363（#EBF3FF, border 7px #6AA0F2, r=24）
  // 头像 66×66 outline 2px #00255E（marginTop=73），文字 fontSize=20 lineHeight=32（marginTop=19），按钮 260×60（marginTop=47）
  // banner 284×74（left=35, paddingTop=17），关闭 46×46（top=20, right=-15）
  function drawVoiceUnlockModal(){
    var p = state.voiceUnlockPending;
    if (!p) return;

    var cw   = 290;
    var SC   = cw / 354;
    var ch   = Math.round(363 * SC);
    var banH = Math.round(74  * SC);
    var banOH = Math.round(35 * SC);  // 398-363=35
    var cx   = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩（不点空白关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:2898, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner-blue：284×74（left=35），标题「解锁特色语音」
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg, px(banX), py(frameTop), ps(banW), ps(banH));}catch(_e){}
    }
    textStroke('解锁特色语音', px(VW/2), py(frameTop + Math.round(37*SC) - 18),
               Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：top=20, right=-15（-4 额外偏移）
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = frameTop + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg, px(closeImgX), py(closeImgY), ps(cs), ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8),
      priority:2901, onTap:function(){ state.voiceUnlockPending = null; } });

    // 头像：66×66，outline 2px #00255E，marginTop=73，居中
    var avR  = Math.round(33 * SC);  // 半径
    var avCx = VW / 2;
    var avCy = cardY + Math.round(73 * SC) + avR;
    ctx.save();
    ctx.beginPath(); ctx.arc(px(avCx), py(avCy), ps(avR), 0, Math.PI*2); ctx.clip();
    var avImg = state.imgs[p.avatar];
    if(avImg && avImg.width > 1){
      try{ ctx.drawImage(avImg, px(avCx-avR), py(avCy-avR), ps(avR*2), ps(avR*2)); }catch(e){}
    } else {
      ctx.fillStyle='#c0d8f8'; ctx.fillRect(px(avCx-avR), py(avCy-avR), ps(avR*2), ps(avR*2));
      if(!state.imgLoading[p.avatar]) loadImg(p.avatar);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(px(avCx), py(avCy), ps(avR), 0, Math.PI*2);
    ctx.strokeStyle='#00255E'; ctx.lineWidth=ps(2); ctx.stroke();

    // 文字：marginTop=19，fontSize=20 lineHeight=32，#00255E
    var txtY = avCy + avR + Math.round(19 * SC);
    setFont(Math.round(17*S)); ctx.fillStyle='#00255E'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('解锁「'+p.name+'」语音包', px(VW/2), py(txtY));
    setFont(Math.round(13*S)); ctx.fillStyle='#7B9BC8';
    ctx.fillText('当天有效，次日需重新解锁', px(VW/2), py(txtY + Math.round(32*SC)));

    // 按钮：260×60，marginTop=47
    var bw = Math.round(260 * SC), bh = Math.round(60 * SC);
    var bx = cx + Math.round((cw - bw) / 2);
    var by = txtY + Math.round(32*SC) + Math.round(20*SC) + Math.round(47*SC);
    candyButton(px(bx), py(by), ps(bw), ps(bh), '看视频解锁', Math.round(17*S), 'green', false);
    state.tapAreas.push({
      x:px(bx), y:py(by), w:ps(bw), h:ps(bh), priority:2900,
      onTap: function(){
        var pack = state.voiceUnlockPending;
        if (!pack) return;
        state.voiceUnlockPending = null;
        try { if (M3.Feedback && M3.Feedback.click) M3.Feedback.click(); } catch(e){}
        if (M3.KwaiAd && M3.KwaiAd.showRewarded){
          M3.KwaiAd.showRewarded(function(ok){
            if (!ok){ toast('要看完视频才能解锁哦～'); return; }
            markVoicePackUnlocked(pack.id);
            toast('「'+pack.name+'」已解锁 ✔');
            // ⭐ v1.0.102 修复：解锁后先加载 voice-extra 子包，再 setVoicePack + play('greet')
            //   之前直接 play('greet') 但 voice-extra 子包可能尚未加载，导致音频路径找不到
            function _doSetAndPlay() {
              if (M3.Feedback && M3.Feedback.setVoicePack) {
                M3.Feedback.setVoicePack(pack);
                setTimeout(function() {
                  try { M3.Feedback.play('greet'); } catch(e){}
                }, 200); // 稍等 setVoicePack 异步写 clips 完成
              }
            }
            if (M3.SubpkgLoader && pack.id !== 'xiaomei') {
              M3.SubpkgLoader.loadVoicePack(pack.id, function() { _doSetAndPlay(); });
            } else {
              _doSetAndPlay();
            }
          });
        } else {
          toast('广告位准备中，稍后再试');
        }
      }
    });
  }

  // 📺 v0.2.3「每日激励视频解锁」浮层（主题「寻找隐藏物」专用，跨零点重置）
  // 📺 v0.2.3「每日激励视频解锁」浮层 — 参考 Figma 509-1453 蓝色系
  // 「解锁 寻找隐藏物」每日广告解锁弹窗 — Figma 509-1453
  // frame 354×341，card 354×306（#EBF3FF, border 7px #6AA0F2, r=24）
  // 主标题 marginTop=75 fontSize=22，副文2行 marginTop=8 fontSize=16，按钮 302×60 marginTop=47
  function drawDailyAdUnlockOverlay(){
    if (!state.dailyAdUnlockThemeId) return;
    var themeId = state.dailyAdUnlockThemeId;
    var theme = M3.THEMES.find(function(x){ return x.id===themeId; });
    if (!theme) { state.dailyAdUnlockThemeId = null; return; }

    var SC    = 290/354;
    var cw    = 290;
    var ch    = Math.round(306 * SC);
    var banH  = Math.round(74  * SC);
    var banOH = Math.round(35  * SC);
    var cx    = Math.round((VW - cw) / 2);
    var cy    = Math.round((VH - ch - banOH) / 2) + banOH;
    var banY  = cy - banOH;

    // 遮罩（不点空白关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    // ⭐ v1.0.55: 全屏 absorber（priority 2850）—— 吸收面板外所有点击
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:2850, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(banY-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:2900, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cy), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cy), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner：left=35
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg,px(banX),py(banY),ps(banW),ps(banH));}catch(_e){}
    }
    textStroke('解锁 ' + (theme.short||theme.name||'隐藏玩法'), px(VW/2), py(banY + Math.round(28*SC)),
               Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：top=20, right=-15（-4 偏移）
    var cs = Math.round(46 * SC);
    var closeX = cx + cw - Math.round(15 * SC) - 4;
    var closeY = banY + Math.round(20*SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg,px(closeX),py(closeY),ps(cs),ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeX+cs/2),py(closeY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeX+cs/2),py(closeY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeX-4), y:py(closeY-4), w:ps(cs+8), h:ps(cs+8), priority:3001,
      onTap:function(){ state.dailyAdUnlockThemeId = null; } });

    // 主标题：marginTop=75，fontSize=22，lineHeight=36，#00255E
    var title1TopY = cy + Math.round(75 * SC);
    var title1MidY = title1TopY + Math.round(18 * SC);
    setFont(Math.round(19*S), 'bold');
    ctx.fillStyle = '#00255E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('观看1个视频即可解锁', px(VW/2), py(title1MidY));

    // 副文字：marginTop=8，fontSize=16，lineHeight=26，#00255E，2行
    var sub1TopY = title1TopY + Math.round(36 * SC) + Math.round(8 * SC);
    var sub1MidY = sub1TopY + Math.round(13 * SC);
    var sub2MidY = sub1MidY + Math.round(26 * SC);
    setFont(Math.round(13*S));
    ctx.fillStyle = '#00255E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var desc = (theme.desc || (theme.short ? theme.short + '·立即体验' : ''));
    ctx.fillText(desc, px(VW/2), py(sub1MidY));
    ctx.fillStyle = '#6688AA';
    ctx.fillText('次日0点需重新解锁', px(VW/2), py(sub2MidY));

    // 绿色按钮：302×60，marginTop=47（从副文字底部）
    var bw = Math.round(302 * SC);
    var bh = Math.round(60  * SC);
    var bx = cx + Math.round((cw - bw) / 2);
    var by = sub1TopY + Math.round(26 * SC) + Math.round(26 * SC) + Math.round(47 * SC);
    candyButton(px(bx), py(by), ps(bw), ps(bh), '看视频解锁', Math.round(17*S), 'green', false);
    state.tapAreas.push({
      x:px(bx), y:py(by), w:ps(bw), h:ps(bh), priority:3000,
      onTap: function(){
        var tid = state.dailyAdUnlockThemeId;
        if (!tid) return;
        state.dailyAdUnlockThemeId = null;
        try { if (M3.Feedback && M3.Feedback.click) M3.Feedback.click(); } catch(e){}
        if (M3.KwaiAd && M3.KwaiAd.showRewarded){
          M3.KwaiAd.showRewarded(function(ok){
            if (!ok){ toast('要看完视频才能解锁哦～'); return; }
            markThemeUnlockedToday(tid);
            toast('「'+theme.short+'」已解锁 ✔ 尽情探索吧');
            setTimeout(function(){ try { Game.pickTheme(tid); } catch(e){} }, 400);
          });
        } else {
          markThemeUnlockedToday(tid);
          toast('「'+theme.short+'」已解锁 ✔（本地调试模式）');
          setTimeout(function(){ try { Game.pickTheme(tid); } catch(e){} }, 400);
        }
      }
    });
  }

  // 🎁 「场景2 分享解锁」浮层：调 KwaiShare.share，分享成功回来才解锁
  // 「分享即可解锁」浮层 — Figma 509-1248
  // frame 354×341，card 354×306（#EBF3FF, border 7px #6AA0F2, r=24, paddingTop=81, paddingBottom=21）
  // banner 284×74（left=35, top=0, paddingTop=17），关闭按钮 46×46（top=20, right=-15）
  // 文字 fontSize=20 lineHeight=36 #00255E；双按钮 144×60，左蓝/右绿
  function drawShareUnlockOverlay(){
    if (!state.shareUnlockThemeId) return;
    var themeId = state.shareUnlockThemeId;

    var cw   = 290;
    var SC   = cw / 354;
    var ch   = Math.round(306 * SC);
    var banH = Math.round(74  * SC);
    var banOH = Math.round(35 * SC);   // frame(341) - card(306) = 35
    var cx   = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    // ⭐ v1.0.55: 全屏 absorber（priority 17）—— 吸收面板外所有点击
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:17, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:18, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner-blue：284×74（left=35），paddingTop=17
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg, px(banX), py(frameTop), ps(banW), ps(banH));}catch(_e){}
    }
    textStroke('分享即可解锁', px(VW/2), py(frameTop + Math.round(28*SC)),
               Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：top=20, right=-15
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = frameTop + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg, px(closeImgX), py(closeImgY), ps(cs), ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8),
      priority:20, onTap:function(){ state.shareUnlockThemeId = null; } });

    // 文字：paddingTop=81（从card顶），主标题 fontSize=20 #00255E，副标题 fontSize=14 #7B9BC8
    var txtY = cardY + Math.round(95 * SC);
    setFont(Math.round(17*S)); ctx.fillStyle='#00255E'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('把「老铁眼真尖」分享给好友', px(VW/2), py(txtY));
    setFont(Math.round(13*S)); ctx.fillStyle='#7B9BC8';
    ctx.fillText('分享成功即永久解锁', px(VW/2), py(txtY + Math.round(36*SC)));

    // 双按钮：各144×60，gap=10，paddingBottom=21 → 按钮上移10
    var btnW = Math.round(144 * SC), btnH = Math.round(60 * SC);
    var totalBtnW = btnW * 2 + Math.round(10 * SC);
    var b1x = cx + Math.round((cw - totalBtnW) / 2);
    var b2x = b1x + btnW + Math.round(10 * SC);
    var bby = cardY + ch - Math.round(28 * SC) - btnH;

    // 左「我再想想」蓝色（#1AA7FF, shadow #1F6CAF）
    candyButton(px(b1x), py(bby), ps(btnW), ps(btnH), '我再想想', Math.round(16*S), 'blue', false);
    state.tapAreas.push({ x:px(b1x), y:py(bby), w:ps(btnW), h:ps(btnH),
      priority:20, onTap:function(){ state.shareUnlockThemeId = null; } });

    // 右「立即分享」绿色
    candyButton(px(b2x), py(bby), ps(btnW), ps(btnH), '立即分享', Math.round(16*S), 'green', false);
    state.tapAreas.push({ x:px(b2x), y:py(bby), w:ps(btnW), h:ps(btnH),
      priority:20, onTap:function(){ triggerShareUnlock(themeId); } });
  }

  // 触发分享 → 分享成功回调 → 解锁主题
  function triggerShareUnlock(themeId){
    var t = M3.THEMES.find(function(x){ return x.id===themeId; });
    if (!t) return;
    var doUnlock = function(){
      t.unlocked = true;
      state.shareUnlockThemeId = null;
      // ⭐ 简单欢快的解锁成功音（C-E-G-C 上行琶音）
      if (M3.Feedback && M3.Feedback.unlockAnthem) M3.Feedback.unlockAnthem();
      // 持久化解锁状态
      try {
        var ksApi = (typeof ks !== 'undefined') ? ks : (window && window.ks);
        if (ksApi && ksApi.setStorageSync) ksApi.setStorageSync('theme_'+themeId+'_unlocked', 1);
        else if (typeof localStorage !== 'undefined') localStorage.setItem('theme_'+themeId+'_unlocked','1');
      } catch(e){}
      toast('🎉 解锁成功！去挑战「'+t.short+'」吧');
    };
    if (window.KwaiShare && typeof window.KwaiShare.share === 'function'){
      window.KwaiShare.share({
        title: '我在玩「老铁眼真尖」找穿越物，来挑战眼力！',
        extraQuery: { from:'unlock_share', theme: themeId },
        onSuccess: doUnlock,
        onCancel:  function(){ toast('分享后自动解锁哦～'); },
        onFail:    function(){ toast('分享失败，稍后再试'); }
      });
    } else {
      // 兜底：无 KwaiShare 环境直接解锁（本地调试）
      doUnlock();
    }
  }

  // ⭐ 通关揭示「下一关」点到主题最后一关时的章节完结弹窗（样式复用「分享即可解锁」面板）
  //   标题「恭喜通关」· 内容「敬请期待新章节」· 唯一按钮「回到首页」→ 首页（无关闭按钮）
  function drawChapterDoneOverlay(){
    if (!state.chapterDone) return;

    var cw   = 290;
    var SC   = cw / 354;
    var ch   = Math.round(306 * SC);
    var banH = Math.round(74  * SC);
    var banOH = Math.round(35 * SC);   // frame(341) - card(306) = 35
    var cx   = Math.round((VW - cw) / 2);
    var cardY = Math.round((VH - ch - banOH) / 2) + banOH;
    var frameTop = cardY - banOH;

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:17, onTap:function(){} });
    state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:18, onTap:function(){} });

    // 主卡：#EBF3FF + border 7px #6AA0F2 r=24
    fillRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cardY), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner：left=35
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg, px(banX), py(frameTop), ps(banW), ps(banH));}catch(_e){}
    }
    textStroke('恭喜通关', px(VW/2), py(frameTop + Math.round(28*SC)),
               Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 内容：敬请期待新章节（单行居中，卡片上部）
    var txtY = cardY + Math.round(95 * SC);
    setFont(Math.round(17*S)); ctx.fillStyle='#00255E'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('敬请期待新章节', px(VW/2), py(txtY));

    // 单按钮「回到首页」（绿色）→ 首页
    var btnW = Math.round(200 * SC), btnH = Math.round(60 * SC);
    var b1x = cx + Math.round((cw - btnW) / 2);
    var bby = cardY + ch - Math.round(28 * SC) - btnH;
    candyButton(px(b1x), py(bby), ps(btnW), ps(btnH), '回到首页', Math.round(16*S), 'green', false);
    state.tapAreas.push({ x:px(b1x), y:py(bby), w:ps(btnW), h:ps(btnH),
      priority:20, onTap:function(){ state.chapterDone = false; Game.gotoThemes(); } });
  }

  // 启动时读回持久化解锁状态（从 storage 恢复）
  function restoreUnlockedThemes(){
    try {
      var ksApi = (typeof ks !== 'undefined') ? ks : (window && window.ks);
      M3.THEMES.forEach(function(t){
        if (t.unlocked) return;
        var v = null;
        if (ksApi && ksApi.getStorageSync) v = ksApi.getStorageSync('theme_'+t.id+'_unlocked');
        else if (typeof localStorage !== 'undefined') v = localStorage.getItem('theme_'+t.id+'_unlocked');
        if (v === 1 || v === '1' || v === true) t.unlocked = true;
      });
    } catch(e){}
  }

  function drawThemeCardV3(x, y, w, h, theme){
    var pX = px(x), pY = py(y), pW = ps(w), pH = ps(h);
    var radius = ps(10);
    var pad = ps(10);         // 图片距卡片边缘留白
    var imgY = pY + pad - ps(2), imgH = pH - pad*2 - ps(2);
    var imgX = pX + pad, imgW = pW - pad*2;

    // 1) 卡片底板：使用 card-bg.png 切图（拉伸填满）
    var cardBgImg = state.imgs && state.imgs['assets/ui/card-bg.png'];
    ctx.save();
    ctx.shadowColor = 'rgba(30,60,90,0.28)'; ctx.shadowBlur = ps(10); ctx.shadowOffsetY = ps(5);
    if (cardBgImg && cardBgImg.width > 0){
      try { ctx.drawImage(cardBgImg, pX, pY, pW, pH); } catch(e){}
    } else {
      fillRR(pX, pY, pW, pH, radius, C.PAPER);
    }
    ctx.restore();
    if (!cardBgImg || cardBgImg.width === 0){
      strokeRR(pX, pY, pW, pH, radius, '#1a1015', ps(2.6));
    }

    // 2) 图片（相纸内框，黑细描）
    ctx.save();
    ctx.beginPath(); rr(imgX, imgY, imgW, imgH, ps(10)); ctx.clip();
    var _coverKey = theme.cover_full || theme.cover;
    var img = state.imgs[theme.cover_full] || state.imgs[theme.cover];
    if (!img && _coverKey && !state.imgLoading[_coverKey] && !state.imgFailed[_coverKey]) {
      try { loadImg(_coverKey); } catch(_e) {}
    }
    if (img && img.width > 1 && img.height > 1){
      var ir = img.width / img.height, cr = imgW / imgH;
      var sw, sh, sx, sy;
      if (ir > cr){ sh = img.height; sw = sh * cr; sx = (img.width - sw) / 2; sy = 0; }
      else       { sw = img.width;  sh = sw / cr; sx = 0; sy = (img.height - sh) / 2; }
      try { ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgW, imgH); } catch(e){}
    } else {
      var bgg = ctx.createLinearGradient(imgX, imgY, imgX+imgW, imgY+imgH);
      bgg.addColorStop(0, C.SKY_TOP); bgg.addColorStop(1, C.SKY_BOT);
      ctx.fillStyle = bgg; ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    // 左下渐变遮罩（保证白字标题可读）
    var mask = ctx.createLinearGradient(imgX, imgY+imgH, imgX, imgY+imgH*0.4);
    mask.addColorStop(0, 'rgba(0,0,0,0.55)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask; ctx.fillRect(imgX, imgY, imgW, imgH);
    if (!theme.unlocked){
      ctx.fillStyle = 'rgba(20,25,40,0.5)'; ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    ctx.restore();
    // 图片内框黑细描
    strokeRR(imgX, imgY, imgW, imgH, ps(10), '#1a1015', ps(1.6));

    // 3) 左上角标签切图（⭐ 替换原胶带，按 tapeLabel 选对应切图）
    var _tagKey = (function(){
      var lbl = theme.tapeLabel || '热门';
      if (lbl === '热门')     return 'assets/ui/tag-hot.png';
      if (lbl === '难度升级') return 'assets/ui/tag-hard.png';
      if (lbl === '上新')     return 'assets/ui/tag-new.png';
      // NEW / 即将上线 / 其他
      return 'assets/ui/tag-coming.png';
    })();
    var _tagImg = state.imgs && state.imgs[_tagKey];
    if (_tagImg && _tagImg.width > 0){
      // 切图原始宽高
      var _origW = _tagImg.width, _origH = _tagImg.height;
      // 所有标签固定宽90高44，统一显示大小（避免切图尺寸差异）
      var _tw = ps(90);
      var _th = ps(44);
      // 位置：卡片左上，切图稍向内偏移（下移到卡片内，不再超出顶边）
      var _tx = pX - ps(4) - (_tagKey === 'assets/ui/tag-new.png' ? ps(2) : 0);
      var _ty = pY + ps(8);
      ctx.save();
      try { ctx.drawImage(_tagImg, _tx, _ty, _tw, _th); } catch(e){}
      ctx.restore();
    } else {
      // fallback: 原胶带
      ctx.save();
      ctx.translate(pX + ps(8), pY + ps(4));
      ctx.rotate(-0.32);
      var tapeC1 = theme.tapeColor  || C.TAPE;
      var tapeC2 = theme.tapeColor2 || C.TAPE2;
      var tg = ctx.createLinearGradient(0,0,ps(74),0);
      tg.addColorStop(0, tapeC1); tg.addColorStop(1, tapeC2);
      ctx.fillStyle = tg; ctx.globalAlpha = 0.94;
      var tapeW = ps(74);
      ctx.fillRect(-ps(6), 0, tapeW, ps(17));
      ctx.fillStyle = C.PAPER; ctx.globalAlpha = 1;
      ctx.beginPath();
      for (var t=0;t<9;t++){ ctx.moveTo(-ps(6)+t*ps(8), 0); ctx.lineTo(-ps(6)+t*ps(8)+ps(4), -ps(3)); ctx.lineTo(-ps(6)+t*ps(8)+ps(8), 0); }
      ctx.fill();
      var tapeLabel = theme.tapeLabel || '热门';
      textStroke(tapeLabel, tapeW/2 - ps(6), ps(9), 11*S, '#ffffff', '#1a1015', 'center', 2);
      ctx.restore();
    }

    // 4) 大标题（白字 + 黑描边，浮图上左下）
    // ⭐ 必须清空 _lastFontStr：上面 ctx.save()/ctx.restore() 会恢复 ctx.font，
    //    但缓存变量不感知，导致 setFont 认为无需更新，实际字号被还原为更小值。
    _lastFontStr = ''; _lastBaseline = '';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = ps(5);
    ctx.shadowOffsetX = ps(1.5); ctx.shadowOffsetY = ps(1.5);
    textStroke(theme.short, imgX + ps(12), imgY + imgH - ps(36) + (theme.id === 1 ? ps(4) : -ps(4)), 22*S, '#ffffff', '#1a1015', 'left', 4.5);
    ctx.restore();
    // 星星（切图）
    var _starImg = state.imgs && state.imgs['assets/ui/star.png'];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = ps(3);
    for (var si=0; si<theme.stars; si++){
      var _sx = imgX + ps(14 + si*16);
      var _sy = imgY + imgH - ps(20);
      var _ssz = ps(13);
      if (_starImg && _starImg.width > 0){
        try { ctx.drawImage(_starImg, _sx, _sy, _ssz, _ssz); } catch(e){}
      } else {
        drawStar(_sx + _ssz/2, _sy + _ssz/2, _ssz/2, true);
      }
    }
    ctx.restore();

    // 5) "进入"糖果按钮（右下）
    // ⭐ v0.2.3 rewardedAd 每日解锁：今日已解锁走 unlocked 分支，否则显示"看广告解锁"糖果
    var _dailyUnlockedToday = (theme.unlockBy === 'rewardedAd' && theme.dailyUnlock && isThemeUnlockedToday(theme.id));
    if (theme.unlocked || _dailyUnlockedToday){
      var btnW = theme.adReq>0 ? 96 : 78, btnH = 34;
      var bx = x + w - btnW - 16, by = y + h - btnH - 20;
      var label = theme.adReq>0 ? ('▶ x'+theme.adReq+' 进入') : '进  入';
      candyButton(px(bx), py(by), ps(btnW), ps(btnH), label, 15*S, 'green', false);
      state.tapAreas.push({ x:pX, y:pY, w:pW, h:pH, onTap:function(){ Game.pickTheme(theme.id); } });
    } else if (theme.unlockBy === 'rewardedAd' && theme.dailyUnlock){
      // 📺 每日广告解锁牌（金黄糖果按钮，强调可交互）
      var aw=96, ah=34, ax=x+w-aw-16, ay2=y+h-ah-20;
      candyButton(px(ax), py(ay2), ps(aw), ps(ah), '看广告解锁', 13*S, 'gold', false);
      state.tapAreas.push({ x:pX, y:pY, w:pW, h:pH, onTap:function(){ Game.pickTheme(theme.id); } });
    } else if (theme.unlockBy === 'share'){
      // 🎁 分享解锁牌（橙黄糖果按钮，强调可交互）
      var sw=96, sh=34, sx=x+w-sw-16, sy2=y+h-sh-20;
      candyButton(px(sx), py(sy2), ps(sw), ps(sh), '分享解锁', 14*S, 'gold', false);
      state.tapAreas.push({ x:pX, y:pY, w:pW, h:pH, onTap:function(){ Game.pickTheme(theme.id); } });
    } else if (theme.comingsoon){
      // 「即将上线」— 不显示按钮
      state.tapAreas.push({ x:pX, y:pY, w:pW, h:pH, onTap:function(){ Game.pickTheme(theme.id); } });
    } else {
      // 🔒 锁牌
      var lw=78, lh=30, lx=x+w-lw-16, ly=y+h-lh-16;
      fillRR(px(lx), py(ly), ps(lw), ps(lh), ps(15), 'rgba(26,16,21,0.72)');
      strokeRR(px(lx), py(ly), ps(lw), ps(lh), ps(15), '#1a1015', ps(2));
      textStroke('未解锁', px(lx+lw/2), py(ly+lh/2), 13*S, '#ffffff', '#1a1015', 'center', 2);
    }
  }

  // ═════════ 场景 2：游戏 ═════════
  // ⭐ 顶部预留 44 (HUD) + 32 (状态条含间隔) = 76，下方工具栏 72
  //     stage = VH - 76 - 72 = VH - 148，不会裁底部
  // ⭐ v0.0.48 STATUS_H 从 32 加到 42（用户要求：整个"进度条+倒计时"行往下 10px，
  //   同时舞台高度对应压缩 10px，图片位置不变、总高度保持）
  var HUD_H = 44, TOOLBAR_H = 72, STATUS_H = 42;
  function getStageRect(){
    // ⭐ v0.0.48c 用户要求：点错时图片不再动。移除 shake 平移
    return { x: px(8), y: py(HUD_H+STATUS_H), w: ps(VW-16), h: ps(VH-HUD_H-STATUS_H-TOOLBAR_H) };
  }

  // ═════════ spot 找不同：双图渲染 ═════════
  // layout 'v'(竖图) → 左原图 | 右答案图；layout 'h'(横图) → 上原图 / 下答案图
  // 关键：state._fit 指向【答案图】矩形，onCanvasTap 用 odds(相对答案图%) 判定，
  //       点原图区域会落在 _fit 外被自动忽略 → 命中/圈选/箭头逻辑全部无缝复用。
  // ⭐ v0.0.60 采样图片主色缓存（避免每帧重算）
  var _dominantColorCache = {};
  function _getDominantColor(img, cacheKey){
    if (_dominantColorCache[cacheKey]) return _dominantColorCache[cacheKey];
    var col = '#3a2830';
    try {
      var cv = document.createElement('canvas');
      cv.width = 8; cv.height = 8;
      var cvx = cv.getContext('2d');
      cvx.drawImage(img, 0, 0, 8, 8);
      var d = cvx.getImageData(0, 0, 8, 8).data;
      var r=0,g=0,b=0,n=0;
      for (var i=0; i<d.length; i+=4){ r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
      r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
      // 稍微加深一档避免和图片本身混在一起
      r = Math.max(0, Math.round(r*0.55));
      g = Math.max(0, Math.round(g*0.55));
      b = Math.max(0, Math.round(b*0.55));
      col = 'rgb('+r+','+g+','+b+')';
    } catch(e){}
    _dominantColorCache[cacheKey] = col;
    return col;
  }

  function drawSpotImg(src, rx, ry, rw, rh){
    var img = state.imgs[src];
    // ⭐ v0.0.60 用图片主色填充背景（不再用高斯模糊，避免视觉干扰导致找不同错觉）
    if (img && img.width>0 && img.height>0){
      var col = _getDominantColor(img, src);
      ctx.save();
      ctx.beginPath(); rr(rx, ry, rw, rh, ps(4)); ctx.clip();
      var bgg2 = ctx.createLinearGradient(rx, ry, rx, ry+rh);
      bgg2.addColorStop(0, col);
      bgg2.addColorStop(1, col.replace(/rgb\((\d+),(\d+),(\d+)\)/, function(_,r,g,b){
        return 'rgb('+Math.round(r*0.7)+','+Math.round(g*0.7)+','+Math.round(b*0.7)+')';
      }));
      ctx.fillStyle = bgg2; ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    } else {
      var bgg = ctx.createLinearGradient(rx, ry, rx, ry+rh);
      bgg.addColorStop(0,'#3a2830'); bgg.addColorStop(1,'#1a1015');
      ctx.fillStyle = bgg; ctx.fillRect(rx, ry, rw, rh);
    }
    if (img && img.width>0 && img.height>0){
      // cover：裁剪填满容器，消除 letterbox 暗边
      // ⭐ v1.2.3 修复安卓 spot 图片不显示：9 参数 drawImage 的源矩形必须取整，
      //   安卓 ks.minigame Canvas 对非整数 source 矩形会静默失败（不绘制也不报错），
      //   表现为色块出得来、图片出不来（_getDominantColor 的 5 参数 drawImage 用整数
      //   采样 OK，但此处 cover 裁剪产生 sw/sh/sx/sy 浮点 → drawImage 静默失败）。
      //   iOS WebKit 容忍非整数 source，故 iOS 表现正常。
      var ir = img.width/img.height, sr = rw/rh;
      var sw, sh, sx, sy;
      if (ir > sr){ sh = img.height; sw = Math.round(img.height * sr); sx = Math.round((img.width - sw)/2); sy = 0; }
      else        { sw = img.width;  sh = Math.round(img.width / sr);  sx = 0; sy = Math.round((img.height - sh)/2); }
      ctx.save();
      ctx.beginPath(); rr(rx, ry, rw, rh, ps(4)); ctx.clip();
      try { ctx.drawImage(img, sx, sy, sw, sh, rx, ry, rw, rh); } catch(e){}
      ctx.restore();
      return { x:rx, y:ry, w:rw, h:rh, ok:true };
    } else {
      textStroke('加载中', rx+rw/2, ry+rh/2, 14*S, C.GOLD, C.INK, 'center', 3);
      if (state.imgFailed[src]){ state.imgFailed[src]=false; state.imgLoading[src]=false; loadImg(src); }
      else if (!state.imgLoading[src]) loadImg(src);
      return { x:rx, y:ry, w:rw, h:rh, ok:false };
    }
  }
  // 小标签牌（"原图" / "找不同"）
  function drawSpotTag(cx, cy, txt, color, wOverride){
    var w = wOverride || ps(58), h = ps(22), x = cx - w/2, y = cy - h/2;
    fillRR(x, y, w, h, h/2, color);
    strokeRR(x, y, w, h, h/2, C.INK, ps(2));
    textStroke(txt, cx, cy, 12*S, '#fff', C.INK, 'center', ps(2));
  }
  function drawSpotScene(lv, st){
    ctx.save();
    ctx.beginPath(); rr(st.x, st.y, st.w, st.h, ps(10)); ctx.clip();
    // 整体底
    ctx.fillStyle = '#241820'; ctx.fillRect(st.x, st.y, st.w, st.h);

    var gap = ps(2);
    var fitA, fitB;
    if (lv.layout==='h'){
      // 横图：上图 / 下图，各占一半高（无标签条，上下均可点击）
      var halfH = (st.h - gap) / 2;
      var topY = st.y, botY = st.y + halfH + gap;
      fitA = drawSpotImg(lv.sceneA, st.x, topY, st.w, halfH);
      fitB = drawSpotImg(lv.sceneB, st.x, botY, st.w, halfH);
    } else {
      // 竖图：左图 | 右图，各占一半宽（无标签条，左右均可点击）
      var halfW = (st.w - gap) / 2;
      fitA = drawSpotImg(lv.sceneA, st.x, st.y, halfW, st.h);
      fitB = drawSpotImg(lv.sceneB, st.x + halfW + gap, st.y, halfW, st.h);
    }
    // 方案A：极简无分割线，两图紧贴
    // 两图黑细边框
    strokeRR(fitA.x, fitA.y, fitA.w, fitA.h, ps(4), C.INK, ps(1.4));
    strokeRR(fitB.x, fitB.y, fitB.w, fitB.h, ps(4), C.INK, ps(1.4));
    ctx.restore();

    // ⭐ 命中判定基准 = 答案图矩形（点原图会落在此外被忽略）
    state._fit = { x:fitB.x, y:fitB.y, w:fitB.w, h:fitB.h };
    // ⭐ v0.0.55 存原图 A 区，onCanvasTap 点在 A 区时 toast 引导到 B 区
    state._fitA = { x:fitA.x, y:fitA.y, w:fitA.w, h:fitA.h };
  }

  function drawGame(){
    var lv = state.level; if (!lv) return;
    var st = getStageRect();

    // ⭐ spot 找不同模式：双图渲染（原图 + AI 合成答案图）
    if (lv.mode==='spot'){
      drawSpotScene(lv, st);
    } else {

    // 舞台圆角裁剪 + 底图
    ctx.save();
    ctx.beginPath(); rr(st.x, st.y, st.w, st.h, ps(10)); ctx.clip();
    var img = state.imgs[lv.scene];
    // 兜底：即便 img 还没就绪，先画深色底以避免灰屏
    var bgg = ctx.createLinearGradient(st.x, st.y, st.x, st.y+st.h);
    bgg.addColorStop(0,'#3a2830'); bgg.addColorStop(1,'#1a1015');
    ctx.fillStyle = bgg; ctx.fillRect(st.x, st.y, st.w, st.h);
    if (img && img.width>0 && img.height>0){
      // ⭐ v0.0.47 场景 1：不再用图片本身做底（会漏内容造成干扰）
      //     改为：采样图片 4 边的平均色 → 用该色纯色铺满 stage → 加轻度渐变暗角
      //     然后再在中间 contain 画清晰主图
      var ir = img.width/img.height, sr = st.w/st.h;
      // Step 1: 取边缘平均色（缓存到 img._edgeColor）
      try {
        if (!img._edgeColor){
          var oc = document.createElement('canvas');
          oc.width = 32; oc.height = 32;
          var oct = oc.getContext('2d');
          oct.drawImage(img, 0, 0, img.width, img.height, 0, 0, 32, 32);
          var data = oct.getImageData(0,0,32,32).data;
          var rs=0, gs=0, bs=0, cnt=0;
          function acc(idx){ rs+=data[idx]; gs+=data[idx+1]; bs+=data[idx+2]; cnt++; }
          for (var xi=0; xi<32; xi++){ acc((0*32+xi)*4); acc((31*32+xi)*4); }
          for (var yi=1; yi<31; yi++){ acc((yi*32+0)*4); acc((yi*32+31)*4); }
          var rr2 = Math.round(rs/cnt), gg2 = Math.round(gs/cnt), bb2 = Math.round(bs/cnt);
          // 略降亮度让主图更突出
          rr2 = Math.round(rr2*0.72); gg2 = Math.round(gg2*0.72); bb2 = Math.round(bb2*0.72);
          img._edgeColor = 'rgb('+rr2+','+gg2+','+bb2+')';
          img._edgeColorLight = 'rgb('+Math.min(255,rr2+30)+','+Math.min(255,gg2+30)+','+Math.min(255,bb2+30)+')';
        }
      } catch(e){ img._edgeColor = '#2a2028'; img._edgeColorLight = '#3a3038'; }
      // Step 1b: 纯色/微渐变填充整个 stage 作为底（完全遮住任何图像内容）
      var eg = ctx.createLinearGradient(st.x, st.y, st.x, st.y+st.h);
      eg.addColorStop(0, img._edgeColorLight || '#333');
      eg.addColorStop(1, img._edgeColor || '#222');
      ctx.fillStyle = eg; ctx.fillRect(st.x, st.y, st.w, st.h);
      // Step 2: 清晰主图 contain 居中
      var dw, dh, dx, dy;
      if (ir > sr){ dw = st.w; dh = st.w / ir; dx = st.x; dy = st.y + (st.h - dh)/2; }
      else       { dh = st.h; dw = st.h * ir; dx = st.x + (st.w - dw)/2; dy = st.y; }
      try { ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh); } catch(e){}
      // 存储 fit 矩形供异物坐标使用（% 相对于完整图片）
      state._fit = { x:dx, y:dy, w:dw, h:dh };
    } else {
      // 装饰性加载提示
      textStroke('场景加载中', st.x+st.w/2, st.y+st.h/2 - ps(10), 16*S, C.GOLD, C.INK, 'center', 3);
      textStroke('· · ·',       st.x+st.w/2, st.y+st.h/2 + ps(14), 20*S, C.GOLD, C.INK, 'center', 3);
      // 如果失败重试
      if (state.imgFailed[lv.scene]){
        state.imgFailed[lv.scene] = false;
        state.imgLoading[lv.scene] = false;
        loadImg(lv.scene);
      } else if (!state.imgLoading[lv.scene]){
        loadImg(lv.scene);
      }
    }
    ctx.restore();
    } // ── close hidden-mode else ──

    // ── 通用命中层：clip 到舞台，绘制箭头/圈选/浮字（hidden 与 spot 两模式共用）──
    ctx.save();
    ctx.beginPath(); rr(st.x, st.y, st.w, st.h, ps(10)); ctx.clip();
    // 异物命中前：不画！经典找茅玩法就是“图中隐形 → 自己看”，不再叠假道具
    // （命中后的对勾面经由 marks 数组在下面统一画）
    // 提示箭头
    state.hintArrows.forEach(function(a){
      var _f = state._fit || {x:st.x,y:st.y,w:st.w,h:st.h};
      var ax = _f.x + a.ox*_f.w, ay = _f.y + a.oy*_f.h;
      // story/spot 定位提示使用点击小手，热点对齐食指尖；其他模式保留旧三角箭头。
      if (state.level && (state.level.mode === 'story' || (state.level.mode === 'spot' && a.isSpot))) {
        var handImg = state.imgs && (state.imgs['assets/ui/hint-tap-hand.png'] || state.imgs['assets/ui/tap-hand.png']);
        if (handImg && handImg.width > 0) {
          var pulse = 1 + 0.06*Math.sin(M3._now()/110);
          var handW = ps(42)*pulse;
          var handH = handW*(handImg.height/handImg.width);
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0.45, a.life));
          // 参考图食指尖约位于图片左上 12%/7%，让指尖精准落在答案中心。
          ctx.drawImage(handImg, ax-handW*0.12, ay-handH*0.07, handW, handH);
          ctx.restore();
        }
        return;
      }
      ctx.fillStyle = C.YEL; ctx.strokeStyle = C.INK; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax-ps(12), ay-ps(14));
      ctx.lineTo(ax+ps(12), ay-ps(14));
      ctx.lineTo(ax, ay);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    // marks
    state.marks.forEach(function(m){
      if (m.type==='ok'){
        // ⭐ 找对：红色圆圈标注（经典找茬"圈出答案"），带回弹放大 + 淡出
        var t = 1 - m.life/1.1;               // 0→1
        var grow = m.life>0.85 ? (1.1-m.life)/0.25 : 1; // 前 0.25s 放大回弹
        var rr0 = 26*S * (0.5 + 0.5*Math.min(1,grow));
        var alpha = m.life<0.4 ? m.life/0.4 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        // 外圈白描（提升在复杂底图上的可读性）
        ctx.beginPath(); ctx.arc(m.x, m.y, rr0, 0, Math.PI*2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7*S; ctx.stroke();
        // 绿色主圈
        ctx.beginPath(); ctx.arc(m.x, m.y, rr0, 0, Math.PI*2);
        ctx.strokeStyle = '#60D205'; ctx.lineWidth = 4*S; ctx.stroke();
        ctx.restore();
      } else {
        // 找错：红叉（保留），快速淡出
        var alpha2 = m.life<0.3 ? m.life/0.3 : 1;
        var r = 22*S;
        ctx.save();
        ctx.globalAlpha = alpha2;
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,63,90,0.35)'; ctx.fill();
        ctx.strokeStyle = C.RED; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(m.x-r*0.35, m.y-r*0.35); ctx.lineTo(m.x+r*0.35, m.y+r*0.35);
        ctx.moveTo(m.x+r*0.35, m.y-r*0.35); ctx.lineTo(m.x-r*0.35, m.y+r*0.35);
        ctx.stroke();
        ctx.restore();
      }
    });
    // floats
    state.floats.forEach(function(f){
      textStroke(f.txt, f.x, f.y, 20*S, f.cls==='plus'?C.GRN:C.RED, C.INK, 'center', 3);
    });
    ctx.restore();

    // 舞台边框
    strokeRR(st.x, st.y, st.w, st.h, ps(10), C.GOLD_LINE, 2);

    state.tapAreas.push({ x:st.x, y:st.y, w:st.w, h:st.h,
      onTap:function(cx,cy){ onCanvasTap(cx,cy); } });

    drawHud();
    drawStatusStrip();
    // ⭐ hunt 模式：在状态条下方叠一层"寻物清单"图标条（学参考图的 UI）
    if (state.level.mode === 'hunt') drawHuntStrip();
    // ⭐ v1.0.80 story 模式：旁白气泡层 + Boss亮度切换层
    if (state.level.mode === 'story') drawStoryLayer();
    drawToolbar();
    // ‼️ 已废弃：laotieBubble / hintBubble 均收敛到全局 toast（屏幕真正居中）
    // if (state.laotieUntil > M3._now()) drawLaotieBubble();
    // if (state.hintBubble) drawHintBubble();
    // 旧顶部提示已废弃
    // if (state.hintBubble) drawHintBubble();
    // 关键：引导浮层"只做浮卡"、不再全屏遮罩
    if (state.guide) drawGuideCard();
    if (state.win && M3._now() >= (state.winModalAt||0)) drawWinModal();
    if (state.lose) drawLoseModal();
    // ⭐ v0.0.48e 游戏页也复用首页设置浮层（音效开关 + 语音包，与首页一致）
    drawSettingsOverlay();
    drawVoiceUnlockModal();   // ⭐ v0.0.98 语音包解锁弹窗
    drawChapterDoneOverlay(); // ⭐ 通关揭示「下一关」到主题末尾：恭喜通关 · 敬请期待新章节
    // story 开场说明必须压在游戏 UI 最上层；玩家确认后才正式开始倒计时。
    if (state.level.mode === 'story' && state.storyIntroOpen && !state.waitingForScene) drawStoryIntro();
  }

  // 异物命中前：完全隐形（不画任何东西！真图自己就是异物）
  // 命中后：在真异物周围画柔光描边 + 对勾（已在 mark 里），不需要坠 draw
  function drawProp(cx, cy, w, h, propId){
    // 什么都不画，保留接口充预留位
  }

  function drawHud(){
    var topY = -22;
    state.tapAreas.push({ x:px(12), y:py(topY), w:ps(40), h:ps(40), onTap:Game.gotoThemes });
    // 返回按钮切图（96×104，按高 44px 等比缩放）
    var backImg = state.imgs && state.imgs['assets/ui/btn-back.png'];
    if (backImg && backImg.width > 0){
      var _bh = ps(44);
      var _bw = Math.round(_bh * 96 / 104);
      try { ctx.drawImage(backImg, px(12), py(topY), _bw, _bh); } catch(e){}
    } else {
      var g0 = ctx.createLinearGradient(0,py(topY),0,py(topY+38));
      g0.addColorStop(0,'#7ed4ff'); g0.addColorStop(1,'#1e7fd6');
      fillRR(px(12), py(topY), ps(36), ps(36), ps(18), g0);
      strokeRR(px(12), py(topY), ps(36), ps(36), ps(18), '#1a1015', ps(2.6));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = ps(3.2); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px(35), py(topY+9)); ctx.lineTo(px(26), py(topY+18)); ctx.lineTo(px(35), py(topY+27));
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    var _titleSize = Math.round(ps(18));
    ctx.font = 'bold ' + _titleSize + 'px FZZhengHeiS-EB-GB, sans-serif';
    _lastFontStr = ctx.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; _lastBaseline = 'middle';
    ctx.lineWidth = ps(5); ctx.lineJoin = 'round';
    ctx.strokeStyle = '#123C64'; ctx.strokeText(state.level.title, px(VW/2), py(topY+18));
    ctx.fillStyle = '#ffffff';  ctx.fillText(state.level.title, px(VW/2), py(topY+18));
  }

  // 顶部状态条：倒计时 + 进度（位于标题下方）
  function drawStatusStrip(){
    // ⭐ v0.0.48 整条状态条再下移 10px（用户要求：找茬进度整行顺延下移）
    //   原 sy=18 → sy=28。舞台顶端由 HUD_H+STATUS_H 固定，为了不动图片位置，把 STATUS_H 保持不变
    var stripH = 26, sy = 28;
    var m = String(Math.floor(state.time/60)).padStart(2,'0');
    var s = String(state.time%60).padStart(2,'0');
    var isHunt = state.level && state.level.mode==='hunt';
    // ⭐ v1.0.26 用户要求：hunt 模式（寻物 & 城市寻物）也用倒计时，跟其它关卡一致
    //     底层 state.time 一直在扣（line 703-704），此处只做 UI 显示
    var warn = state.time<=10;
    var tw = 90; // 加宽承载时钟图标抖动
    var need = state.level.odds.length;
    var pw = VW - tw - 12*2 - 8;
    var label;
    if (state.level.mode==='spot') label = '找不同进度：'+state.foundCount+'/'+need+' 处';
    else if (state.level.mode==='hunt') label = '🔍 寻物进度：'+state.foundCount+'/'+need+' 个';
    else if (state.level.mode==='story') label = '🔍 线索进度：'+state.foundCount+'/'+need+' 条';
    else label = '本关需要找茬：'+state.foundCount+'/'+need+' 个';
    // 左：进度按钮（内嵌分段进度条）
    var pxLeft = 12;
    candyButton(px(pxLeft), py(sy), ps(pw), ps(stripH), label, 13*S, 'green', false);
    // story 已由文字显示“已找到/总数”，不再重复绘制圆点/对勾链。
    // 其他模式继续保留原分段进度条。
    if (!state.level || state.level.mode !== 'story') {
      drawSegmentedProgress(pxLeft + 6, sy + stripH - 6, pw - 12, 4, state.foundCount, need);
    }
    // 右：倒计时（带时钟图标 + 最后10s 抖动动画）
    var tx = VW - 12 - tw;
    var shakeX = 0, shakeY = 0;
    if (warn && state.time > 0){
      var t = M3._now() * 0.02;
      shakeX = Math.sin(t) * 1.5;
      shakeY = Math.cos(t*1.3) * 1.2;
    }
    var tpx = px(tx)+ps(shakeX), tpy = py(sy)+ps(shakeY);
    var tpw = ps(tw);
    // 切图原始尺寸 236×84，按宽度等比例计算高度避免压缩
    var tph = Math.round(tpw * 84 / 236);
    // 垂直居中对齐到状态条
    var timerOffY = (ps(stripH) - tph) / 2;
    var timerImg = state.imgs && state.imgs['assets/ui/timer-bg.png'];
    if (timerImg && timerImg.width > 0){
      ctx.drawImage(timerImg, tpx, tpy + timerOffY, tpw, tph);
    } else {
      candyButton(tpx, tpy, tpw, ps(stripH), '', 14*S, warn?'red':(isHunt?'green':'blue'), false);
    }
    // 时间文字：切图右侧约 65% 处居中（左侧是时钟图标）
    // ⭐ v1.0.26 hunt 也用倒计时（去掉 huntElapsed 分支）
    var _timeDisp = m+':'+s;
    ctx.font = 'bold ' + Math.round(13*S) + 'px sans-serif'; _lastFontStr = ctx.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; _lastBaseline = 'middle';
    ctx.lineWidth = ps(1.8); ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a2040'; ctx.strokeText(_timeDisp, tpx + tpw * 0.68, tpy + timerOffY + tph/2);
    ctx.fillStyle = '#ffffff';  ctx.fillText(_timeDisp, tpx + tpw * 0.68, tpy + timerOffY + tph/2);
  }

  function _storyWrapLines(text, maxW, fontSize, maxLines, fontFamily){
    text = String(text || '');
    ctx.font = 'bold ' + Math.round(fontSize) + 'px ' + (fontFamily || 'FZZhengHeiS-EB-GB, sans-serif');
    var lines = [], cur = '', i = 0;
    for (i=0; i<text.length; i++) {
      var ch = text[i];
      if (ch === '\n') { if (cur) lines.push(cur); cur=''; continue; }
      var next = cur + ch;
      if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = ch; }
      else cur = next;
      if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && i < text.length) {
      var last = lines[maxLines-1];
      while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0,-1);
      lines[maxLines-1] = last + '…';
    }
    // 中文长句末行只剩1个孤字时，才从上一行挪1个字过来（不大量移字）。
    if (lines.length > 1) {
      var tail = lines[lines.length-1], prev = lines[lines.length-2];
      if (tail.length === 1 && prev.length > 1) {
        tail = prev.slice(-1) + tail;
        prev = prev.slice(0,-1);
        lines[lines.length-2] = prev;
        lines[lines.length-1] = tail;
      }
    }
    return lines;
  }

  function _drawAffairDivider(x, y, w){
    var mid = x + w/2;
    ctx.save();
    ctx.strokeStyle = 'rgba(164,126,66,0.62)';
    ctx.lineWidth = ps(0.8);
    ctx.beginPath();
    ctx.moveTo(px(x), py(y)); ctx.lineTo(px(mid-10), py(y));
    ctx.moveTo(px(mid+10), py(y)); ctx.lineTo(px(x+w), py(y));
    ctx.stroke();
    ctx.fillStyle = '#B58A45';
    ctx.translate(px(mid), py(y)); ctx.rotate(Math.PI/4);
    ctx.fillRect(-ps(3.2), -ps(3.2), ps(6.4), ps(6.4));
    ctx.restore();
  }

  function _drawAffairCorner(x, y, flipX, flipY){
    ctx.save();
    ctx.translate(px(x), py(y)); ctx.scale(flipX, flipY);
    ctx.strokeStyle = 'rgba(181,138,69,0.58)';
    ctx.lineWidth = ps(1.15); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, ps(14)); ctx.lineTo(0, ps(5));
    ctx.quadraticCurveTo(0, 0, ps(5), 0); ctx.lineTo(ps(14), 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ps(4), ps(16)); ctx.lineTo(ps(4), ps(8));
    ctx.quadraticCurveTo(ps(4), ps(4), ps(8), ps(4)); ctx.lineTo(ps(16), ps(4));
    ctx.stroke();
    ctx.restore();
  }

  // 从确认稿的空白羊皮纸区域取样，用纸张纹理覆盖固定文字。
  // 这样每关文案可以动态替换，又不会出现纯白色矩形底。
  function _paintAffairPaperPatch(img, x, y, w, h){
    if (!img || !img.width || w <= 0 || h <= 0) return;
    ctx.drawImage(img, 1050, 570, 118, 82, px(x), py(y), ps(w), ps(h));
  }

  function _storyThemeConfig(lv){
    lv = lv || {};
    var themes = M3.THEMES || [];
    for (var i=0; i<themes.length; i++) if (themes[i] && themes[i].id === lv.themeId) return themes[i];
    return {};
  }

  function _storyIntroConfig(lv){
    lv = lv || {};
    var theme = _storyThemeConfig(lv);
    var themeIntro = theme.storyIntro && typeof theme.storyIntro === 'object' ? theme.storyIntro : {};
    var remote = lv.intro && typeof lv.intro === 'object' ? lv.intro : {};
    var fallbackGoals = Array.isArray(lv.briefGoals) ? lv.briefGoals : [];
    return {
      style: remote.style || themeIntro.style || 'default',
      templateAsset: remote.templateAsset || themeIntro.templateAsset || '',
      chapterTitle: remote.chapterTitle || themeIntro.chapterTitle || lv.chapterTitle || '先看剧情，再找线索',
      title: remote.title || lv.title || '剧情调查',
      body: remote.body || lv.hint || '仔细观察现场，找出所有关键线索。',
      sectionTitle: remote.sectionTitle || themeIntro.sectionTitle || '本关调查方向',
      goals: Array.isArray(remote.goals) && remote.goals.length ? remote.goals : fallbackGoals,
      buttonText: remote.buttonText || themeIntro.buttonText || '开始找线索'
    };
  }

  // 主题5专用案件简报：参考侦探档案卡重新布局，内容仍由实时关卡数据驱动。
  function _drawAffairStoryIntro(lv){
    var intro = _storyIntroConfig(lv);
    // 主题5前5关共用用户确认的完整视觉底板，避免 Canvas 近似造成放大镜、
    // 分隔线、编号圆章、边框和按钮细节偏差。仅覆盖每关不同的标题与剧情文字。
    if (intro.templateAsset) {
      var briefKey = M3.SubpkgLoader && M3.SubpkgLoader.rewritePath
        ? M3.SubpkgLoader.rewritePath(intro.templateAsset)
        : intro.templateAsset;
      var briefImg = state.imgs && state.imgs[briefKey];
      if (!briefImg && !state.imgLoading[briefKey]) {
        try { loadImg(briefKey); } catch(_e) {}
      }
      // 真机要求：弹窗左右与屏幕固定留 11px。
      var cardSize = Math.min(VW-22, VH-24);
      var cardX = (VW-cardSize)/2, cardY = (VH-cardSize)/2;
      // 按钮上移，缩小与第 3 条调查方向的空白；点击热区共用同一组坐标。
      var briefBtnH = 45;
      var briefBtnBottomInset = Math.max(32, cardSize * 0.105);
      var briefBtnX = cardX + 40;
      var briefBtnW = cardSize - 80;
      var briefBtnY = cardY + cardSize - briefBtnH - briefBtnBottomInset;
      ctx.save();
      ctx.fillStyle='rgba(1,10,24,0.78)';ctx.fillRect(0,0,W,H);
      if (briefImg && briefImg.width>0) {
        // 按确认稿外框的圆角裁剪，不让原图四角的蓝色方形底露出来。
        ctx.save();
        ctx.beginPath(); rr(px(cardX),py(cardY),ps(cardSize),ps(cardSize),ps(20)); ctx.clip();
        ctx.drawImage(briefImg,px(cardX),py(cardY),ps(cardSize),ps(cardSize));

        var refScale = cardSize / 1254;
        var goals = Array.isArray(intro.goals) && intro.goals.length ? intro.goals.slice(0,3) : [
          '观察现场不自然的细节', '判断人物是否隐瞒行踪', '寻找能串联剧情的暗号'
        ];

        // 用原图的纸张纹理清掉第1关固定文字，再绘制当前关数据。
        _paintAffairPaperPatch(briefImg,cardX+cardSize*(188/1254),cardY+cardSize*(92/1254),cardSize*(878/1254),cardSize*(126/1254));
        _paintAffairPaperPatch(briefImg,cardX+cardSize*(242/1254),cardY+cardSize*(240/1254),cardSize*(770/1254),cardSize*(82/1254));
        _paintAffairPaperPatch(briefImg,cardX+cardSize*(58/1254),cardY+cardSize*(342/1254),cardSize*(1138/1254),cardSize*(164/1254));
        _paintAffairPaperPatch(briefImg,cardX+cardSize*(170/1254),cardY+cardSize*(560/1254),cardSize*(480/1254),cardSize*(92/1254));
        for (var pi=0; pi<3; pi++) {
          _paintAffairPaperPatch(briefImg,cardX+cardSize*(168/1254),cardY+cardSize*((650+pi*97)/1254),cardSize*(960/1254),cardSize*(70/1254));
        }

        // 清除确认稿里的图片按钮，下方恢复游戏原 candyButton。
        _paintAffairPaperPatch(briefImg,cardX+cardSize*(120/1254),cardY+cardSize*(946/1254),cardSize*(1014/1254),cardSize*(218/1254));

        textStroke(intro.chapterTitle,px(cardX+cardSize/2),py(cardY+cardSize*(160/1254)),68*refScale*S,'#092F60','rgba(255,255,255,0.24)','center',ps(0.55));
        var titleY = cardY + cardSize*(282/1254);
        textStroke(intro.title,px(cardX+cardSize/2),py(titleY),56*refScale*S,'#8B1B15','rgba(255,255,255,0.24)','center',ps(0.55));
        var briefLines = _storyWrapLines(intro.body,ps(cardSize*(0.86)),43*refScale*S,3,'FZZhengHeiS-EB-GB, sans-serif');
        ctx.font = 'bold ' + Math.round(43*refScale*S) + 'px FZZhengHeiS-EB-GB, sans-serif';
        ctx.fillStyle = '#092F60'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (var bi=0; bi<briefLines.length; bi++) {
          ctx.fillText(briefLines[bi],px(cardX+cardSize*(0.075)),py(cardY+cardSize*(365/1254)+bi*(58/1254)*cardSize));
        }

        ctx.font='bold '+Math.round(52*refScale*S)+'px FZZhengHeiS-EB-GB, sans-serif';
        ctx.fillStyle='#102F59';ctx.textAlign='left';ctx.textBaseline='middle';
        ctx.fillText(intro.sectionTitle,px(cardX+cardSize*(184/1254)),py(cardY+cardSize*(612/1254)));

        ctx.font='bold '+Math.round(40*refScale*S)+'px FZZhengHeiS-EB-GB, sans-serif';
        ctx.fillStyle='#102F59';ctx.textAlign='left';ctx.textBaseline='middle';
        for (var gi=0; gi<goals.length; gi++) {
          ctx.fillText(String(goals[gi]),px(cardX+cardSize*(184/1254)),py(cardY+cardSize*((696+gi*97)/1254)));
        }
        ctx.restore();

        candyButton(px(briefBtnX),py(briefBtnY),ps(briefBtnW),ps(briefBtnH),intro.buttonText,18*S,'green',false);
      } else {
        textStroke('案件简报加载中…',px(VW/2),py(VH/2),14*S,'#FFF5D8','#082E60','center',ps(2));
      }
      ctx.restore();
      state.tapAreas.push({x:0,y:0,w:W,h:H,priority:2850,onTap:function(){}});
      if (briefImg && briefImg.width>0) {
        state.tapAreas.push({
          x:px(briefBtnX),y:py(briefBtnY),w:ps(briefBtnW),h:ps(briefBtnH),priority:3000,
          onTap:function(){_startStoryCountdown();}
        });
      }
      return;
    }
    var goals = Array.isArray(intro.goals) && intro.goals.length ? intro.goals : [
      '观察现场不自然的细节', '判断人物是否隐瞒行踪', '寻找能串联剧情的暗号'
    ];
    var cardW = VW - 18, cardX = 9;
    var innerX = cardX + 24, innerW = cardW - 48;
    var hintLines = _storyWrapLines(intro.body, ps(innerW), 13*S, 4);
    var goalH = 31;
    var cardH = 209 + hintLines.length*19 + goals.length*goalH + 58;
    var maxCardH = VH - 26;
    if (cardH > maxCardH) cardH = maxCardH;
    var cardY = Math.max(13, (VH-cardH)/2);

    ctx.save();
    ctx.fillStyle = 'rgba(1,10,24,0.76)'; ctx.fillRect(0,0,W,H);

    var paper = ctx.createLinearGradient(px(cardX),py(cardY),px(cardX+cardW),py(cardY+cardH));
    paper.addColorStop(0,'#FFF9E9'); paper.addColorStop(0.5,'#FFFDF4'); paper.addColorStop(1,'#F3E7CD');
    fillRR(px(cardX),py(cardY),ps(cardW),ps(cardH),ps(22),paper);
    strokeRR(px(cardX),py(cardY),ps(cardW),ps(cardH),ps(22),'#0B3767',ps(5));
    strokeRR(px(cardX+6),py(cardY+6),ps(cardW-12),ps(cardH-12),ps(17),'rgba(189,151,88,0.72)',ps(1.2));

    // 固定纸张颗粒，避免逐帧随机导致闪烁。
    ctx.fillStyle = 'rgba(137,101,48,0.08)';
    var flecks = [[43,28],[91,67],[151,34],[229,72],[286,41],[63,178],[271,207],[116,286],[302,311]];
    for (var fi=0; fi<flecks.length; fi++) {
      ctx.beginPath(); ctx.arc(px(cardX+flecks[fi][0]%cardW),py(cardY+flecks[fi][1]%cardH),ps(0.8),0,Math.PI*2);ctx.fill();
    }
    _drawAffairCorner(cardX+13,cardY+13,1,1);
    _drawAffairCorner(cardX+cardW-13,cardY+13,-1,1);
    _drawAffairCorner(cardX+13,cardY+cardH-13,1,-1);
    _drawAffairCorner(cardX+cardW-13,cardY+cardH-13,-1,-1);

    var y = cardY + 34;
    textStroke(intro.chapterTitle,px(VW/2),py(y),22*S,'#082E60','rgba(255,255,255,0.55)','center',ps(1.1));
    _drawAffairDivider(innerX+46,y+22,innerW-92);
    textStroke(intro.title,px(VW/2),py(y+48),16*S,'#7D1712','rgba(255,255,255,0.48)','center',ps(0.8));

    y += 78;
    ctx.font = 'bold ' + Math.round(13*S) + 'px FZZhengHeiS-EB-GB, sans-serif';
    ctx.fillStyle = '#102F59'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (var hi=0; hi<hintLines.length; hi++) ctx.fillText(hintLines[hi],px(innerX),py(y+hi*19));
    y += hintLines.length*19 + 14;
    _drawAffairDivider(innerX,y,innerW); y += 26;

    // 纯 Canvas 放大镜，避免不同系统 emoji 风格不一致。
    ctx.save();
    ctx.strokeStyle='#082E60';ctx.fillStyle='#F8F5E9';ctx.lineWidth=ps(2);
    ctx.beginPath();ctx.arc(px(innerX+9),py(y),ps(6.5),0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(px(innerX+4),py(y+5));ctx.lineTo(px(innerX-1),py(y+11));ctx.stroke();ctx.restore();
    textStroke(intro.sectionTitle,px(innerX+23),py(y+1),15.5*S,'#082E60','rgba(255,255,255,0.45)','left',ps(0.8));
    y += 25;

    for (var gi=0; gi<goals.length; gi++) {
      var cy = y + gi*goalH + 11;
      ctx.fillStyle='#0B3B70';ctx.strokeStyle='#D0A75E';ctx.lineWidth=ps(1.1);
      ctx.beginPath();ctx.arc(px(innerX+9),py(cy),ps(9),0,Math.PI*2);ctx.fill();ctx.stroke();
      textStroke(String(gi+1),px(innerX+9),py(cy+0.5),11*S,'#FFFFFF','rgba(0,0,0,0.22)','center',ps(0.6));
      ctx.font='bold '+Math.round(12.2*S)+'px FZZhengHeiS-EB-GB, sans-serif';
      ctx.fillStyle='#102F59';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(String(goals[gi]),px(innerX+27),py(cy));
      if (gi<goals.length-1) {
        ctx.save();ctx.setLineDash([ps(2),ps(3)]);ctx.strokeStyle='rgba(181,138,69,0.42)';ctx.lineWidth=ps(0.8);
        ctx.beginPath();ctx.moveTo(px(innerX+27),py(cy+15));ctx.lineTo(px(innerX+innerW),py(cy+15));ctx.stroke();ctx.restore();
      }
    }

    var btnX=cardX+40,btnW=cardW-80,btnH=45,btnY=cardY+cardH-btnH-18;
    candyButton(px(btnX),py(btnY),ps(btnW),ps(btnH),intro.buttonText,18*S,'green',false);
    ctx.restore();

    state.tapAreas.push({x:0,y:0,w:W,h:H,priority:2850,onTap:function(){}});
    state.tapAreas.push({x:px(btnX),y:py(btnY),w:ps(btnW),h:ps(btnH),priority:3000,onTap:function(){_startStoryCountdown();}});
  }

  // story 开场剧情卡：讲清背景、列出本关目标，确认后才启动计时。
  function drawStoryIntro(){
    var lv = state.level;
    if (!lv || lv.mode !== 'story') return;
    var intro = _storyIntroConfig(lv);
    if (intro.style === 'affair-dossier') { _drawAffairStoryIntro(lv); return; }
    var cardW = VW - 32;
    var innerW = cardW - 36;
    var hintLines = _storyWrapLines(intro.body, ps(innerW), 13*S, 4);
    // 所有 story 主题只显示 intro.goals，不再从 odds/tag 生成答案清单。
    var introTargets = Array.isArray(intro.goals) && intro.goals.length ? intro.goals : [
      '观察现场不自然的细节',
      '判断人物是否隐瞒行踪',
      '寻找能串联剧情的暗号'
    ];
    var cols = 1, rows = Math.ceil(introTargets.length / cols);
    var chipH = 28, chipGap = 6;
    var cardH = 88 + hintLines.length*18 + 28 + rows*(chipH+chipGap) + 66;
    var cardX = 16, cardY = Math.max(24, (VH-cardH)/2);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0,0,W,H);
    fillRR(px(cardX), py(cardY), ps(cardW), ps(cardH), ps(18), '#FFF8F0');
    strokeRR(px(cardX), py(cardY), ps(cardW), ps(cardH), ps(18), '#2E6DB4', ps(4));

    textStroke(intro.chapterTitle, px(VW/2), py(cardY+28), 19*S, '#123C64', '#ffffff', 'center', ps(2));
    textStroke(intro.title, px(VW/2), py(cardY+52), 14*S, '#7A2010', '#ffffff', 'center', ps(1.5));

    var textY = cardY + 76;
    ctx.font = 'bold ' + Math.round(13*S) + 'px sans-serif';
    ctx.fillStyle = '#263A55'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (var hi=0; hi<hintLines.length; hi++) {
      ctx.fillText(hintLines[hi], px(cardX+18), py(textY + hi*18));
    }

    var targetY = textY + hintLines.length*18 + 12;
    textStroke('🔎 ' + intro.sectionTitle, px(cardX+18), py(targetY+9), 13*S, '#123C64', '#ffffff', 'left', ps(1.2));
    var gridY = targetY + 24;
    var chipW = (innerW-chipGap)/2;
    for (var oi=0; oi<introTargets.length; oi++) {
      var name = String(introTargets[oi] || ('调查方向'+(oi+1)));
      var col = oi % cols, row = Math.floor(oi / cols);
      var chipX = cardX + 18 + col*(chipW+chipGap);
      var chipY = gridY + row*(chipH+chipGap);
      // story 开场只展示调查方向文字，不绘制答案卡片。
      ctx.font = 'bold ' + Math.round(10.5*S) + 'px sans-serif';
      while (name.length>1 && ctx.measureText((oi+1)+'. '+name).width > ps(chipW-4)) name = name.slice(0,-1);
      ctx.fillStyle = '#123C64'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText((oi+1)+'. '+name, px(chipX), py(chipY+chipH/2));
    }

    var btnW = cardW - 72, btnH = 46;
    // 主题5剧情卡按钮底部保留 18px 留白，避免按钮阴影紧贴卡片边框。
    var btnX = cardX + (cardW-btnW)/2, btnY = cardY + cardH - btnH - 18;
    candyButton(px(btnX), py(btnY), ps(btnW), ps(btnH), intro.buttonText, 17*S, 'green', false);
    ctx.restore();

    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:2850, onTap:function(){} });
    state.tapAreas.push({ x:px(btnX), y:py(btnY), w:ps(btnW), h:ps(btnH), priority:3000,
      onTap:function(){ _startStoryCountdown(); } });
  }

  // story 线索链：未找到为暗色节点，找到后变为勾并弹跳。
  function drawStoryProgressChain(x, y, w, found, total){
    if (!total) return;
    var now = M3._now();
    state.storyFoundAnim = state.storyFoundAnim || {};
    var prevFound = state._storyPrevFound || 0;
    if (found > prevFound) {
      for (var fi=prevFound; fi<found; fi++) state.storyFoundAnim[fi] = now;
      state._storyPrevFound = found;
    }

    var gap = total > 7 ? 2 : 4;
    var nodeD = Math.min(10, (w-gap*(total-1))/total);
    var chainW = nodeD*total + gap*(total-1);
    var startX = x + (w-chainW)/2;
    var cy = y + 2;
    ctx.save();
    ctx.lineCap = 'round';
    for (var i=0; i<total; i++) {
      var cx = startX + nodeD/2 + i*(nodeD+gap);
      if (i < total-1) {
        ctx.strokeStyle = i < found-1 ? '#FFE066' : 'rgba(0,0,0,0.32)';
        ctx.lineWidth = ps(2);
        ctx.beginPath();
        ctx.moveTo(px(cx+nodeD/2), py(cy));
        ctx.lineTo(px(cx+nodeD/2+gap), py(cy));
        ctx.stroke();
      }
      var scale = 1;
      if (i < found) {
        var elapsed = now - (state.storyFoundAnim[i] || (now-400));
        if (elapsed >= 0 && elapsed < 350) scale = 1 + 0.35*Math.sin(elapsed/350*Math.PI);
      }
      ctx.save();
      ctx.translate(px(cx), py(cy));
      ctx.scale(scale, scale);
      ctx.fillStyle = i < found ? '#FFE066' : 'rgba(8,30,48,0.48)';
      ctx.strokeStyle = i < found ? '#7A5A10' : 'rgba(255,255,255,0.42)';
      ctx.lineWidth = ps(1.2);
      ctx.beginPath(); ctx.arc(0, 0, ps(nodeD/2), 0, Math.PI*2); ctx.fill(); ctx.stroke();
      if (i < found) {
        ctx.strokeStyle = '#23421D'; ctx.lineWidth = ps(1.5);
        ctx.beginPath();
        ctx.moveTo(-ps(nodeD*0.20), 0);
        ctx.lineTo(-ps(nodeD*0.04), ps(nodeD*0.18));
        ctx.lineTo(ps(nodeD*0.25), -ps(nodeD*0.20));
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ⭐ v1.0.123 story 模式：旁白气泡层 + Boss场景亮度过渡
  function drawStoryLayer(){
    var now = M3._now();
    var st = getStageRect();

    // ── Boss关：亮度切换叠层（0.8s 白色渐入再渐出模拟曝光）──
    if (state.storyBossTriggered && state._storyBossLightUntil) {
      var elapsed = state._storyBossLightUntil - now;  // 800ms → 0
      if (elapsed > 0) {
        var alpha = elapsed < 400 ? elapsed / 400 : (800 - elapsed) / 400;
        alpha = Math.max(0, Math.min(0.7, alpha * 0.7));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(st.x, st.y, st.w, st.h);
        ctx.restore();
      }
    }

    // ── 旁白气泡：单条、滑入、指向命中线索 ──
    if (!state.storyNarratives || !state.storyNarratives.length) return;
    var alive = [];
    for (var ni = 0; ni < state.storyNarratives.length; ni++) {
      if (state.storyNarratives[ni].until > now) alive.push(state.storyNarratives[ni]);
    }
    state.storyNarratives = alive;
    if (!alive.length) return;
    var nb = alive[alive.length-1];
    var elapsed = now - nb.startAt;
    var remain = nb.until - now;
    var alpha = elapsed < 250 ? elapsed/250 : (remain < 600 ? Math.max(0,remain/600) : 1);
    var slideOff = elapsed < 250 ? (1-elapsed/250)*ps(8) : 0;
    var padX = ps(12), padY = ps(8), maxW = ps(170);
    var fSize = 12.5*S;
    ctx.font = 'italic bold ' + Math.round(fSize) + 'px FZZhengHeiS-EB-GB, sans-serif';
    var lines = _storyWrapLines('🔍 ' + nb.text, maxW-padX*2, fSize, 3);
    var lineH = fSize*1.55, triH = ps(7);
    var bw = maxW, bh = padY*2 + lines.length*lineH;
    var anchorX = nb.anchorX, anchorY = nb.anchorY;
    var bx = Math.min(Math.max(anchorX-bw/2, st.x+ps(6)), st.x+st.w-bw-ps(6));
    var by = Math.max(anchorY-bh-triH-ps(10), st.y+ps(6)) + slideOff;
    var r = ps(9);
    var triX = Math.min(Math.max(anchorX, bx+r+ps(6)), bx+bw-r-ps(6));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255,160,60,0.35)'; ctx.shadowBlur = ps(10);
    fillRR(bx, by, bw, bh, r, 'rgba(10,16,36,0.92)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10,16,36,0.92)';
    ctx.beginPath();
    ctx.moveTo(triX-ps(6), by+bh); ctx.lineTo(triX+ps(6), by+bh);
    ctx.lineTo(triX, by+bh+triH); ctx.closePath(); ctx.fill();
    strokeRR(bx, by, bw, bh, r, 'rgba(255,190,80,0.72)', ps(1.6));
    ctx.strokeStyle = 'rgba(255,190,80,0.72)'; ctx.lineWidth = ps(1.6);
    ctx.beginPath();
    ctx.moveTo(triX-ps(6), by+bh); ctx.lineTo(triX, by+bh+triH);
    ctx.lineTo(triX+ps(6), by+bh); ctx.stroke();

    ctx.font = 'italic bold ' + Math.round(fSize) + 'px FZZhengHeiS-EB-GB, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (var li=0; li<lines.length; li++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = ps(2.5); ctx.lineJoin = 'round';
      ctx.strokeText(lines[li], bx+padX, by+padY+li*lineH);
      ctx.fillStyle = '#FFE9B0'; ctx.fillText(lines[li], bx+padX, by+padY+li*lineH);
    }
    ctx.restore();
  }

  // ⭐ v0.0.90 hunt 模式：顶部"寻物清单"图标条（学参考图 UI）
  //   参考「江南水乡寻物图」抖音款：状态条下方一整条绿色 banner，右边 emoji 缩略图 grid，
  //   找到的物品变灰打勾。3 个物品的场景够简洁。
  function drawHuntStrip(){
    if (!state.level || !state.level.odds) return;
    var y0 = 62;                 // 状态条 (sy=28) + stripH=26 + 8 gap
    var stripH = 40;
    // 底板：绿色渐变（呼应参考图"找出所有隐藏物品"绿banner）
    var g = ctx.createLinearGradient(0, py(y0), 0, py(y0+stripH));
    g.addColorStop(0, '#7dd39a'); g.addColorStop(1, '#3aa06b');
    fillRR(px(12), py(y0), ps(VW-24), ps(stripH), ps(10), g);
    strokeRR(px(12), py(y0), ps(VW-24), ps(stripH), ps(10), '#1a1015', ps(2));
    // 左：文案
    var textX = 20;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold '+(11*S)+'px system-ui,-apple-system,Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('🔍 找出隐藏的：', px(textX), py(y0+stripH/2));
    // 右：物品 chip 网格（图标铺满 + 底部 30% 半黑蒙层字幕）
    var odds = state.level.odds;
    var n = odds.length;
    var chipW = 52, chipH = 36, chipGap = 6;
    var rightPad = 20;
    var totalW = n*chipW + (n-1)*chipGap;
    var startX = VW - rightPad - totalW;
    for (var i=0; i<n; i++){
      var o = odds[i];
      var meta = (M3.PROPS && M3.PROPS[o.prop]) || { emoji:'🔎', name:'物品' };
      var chipX = startX + i*(chipW+chipGap);
      var chipY = y0 + (stripH-chipH)/2;
      var found = !!state.found[i];
      // 底：找到=灰绿；未找到=白
      var bg = found ? 'rgba(20,60,40,0.5)' : '#ffffff';
      fillRR(px(chipX), py(chipY), ps(chipW), ps(chipH), ps(6), bg);
      // clip 到圆角矩形内，防止图标/蒙层越界
      ctx.save();
      ctx.beginPath();
      // 手动圆角矩形路径
      var _r = ps(6), _x=px(chipX), _y=py(chipY), _w=ps(chipW), _h=ps(chipH);
      ctx.moveTo(_x+_r,_y);
      ctx.lineTo(_x+_w-_r,_y); ctx.quadraticCurveTo(_x+_w,_y,_x+_w,_y+_r);
      ctx.lineTo(_x+_w,_y+_h-_r); ctx.quadraticCurveTo(_x+_w,_y+_h,_x+_w-_r,_y+_h);
      ctx.lineTo(_x+_r,_y+_h); ctx.quadraticCurveTo(_x,_y+_h,_x,_y+_h-_r);
      ctx.lineTo(_x,_y+_r); ctx.quadraticCurveTo(_x,_y,_x+_r,_y);
      ctx.closePath();
      ctx.clip();
      // ⭐ 图标居中铺满整个 chip（等比缩放，取 min(chipW, chipH)）
      var iconSrc = meta.iconImg;
      var iconImg = iconSrc && state.imgs[iconSrc];
      if (iconImg){
        if (found) ctx.globalAlpha = 0.35;
        var iconSize = Math.min(chipW, chipH) - 2; // 略缩防溢
        var iconX = chipX + (chipW - iconSize)/2;
        var iconY = chipY + (chipH - iconSize)/2;
        try { ctx.drawImage(iconImg, px(iconX), py(iconY), ps(iconSize), ps(iconSize)); } catch(e){}
        ctx.globalAlpha = 1;
      } else {
        if (found) ctx.globalAlpha = 0.35;
        ctx.font = 'bold '+(24*S)+'px system-ui,Apple Color Emoji,Segoe UI Emoji';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a1015';
        ctx.fillText(meta.emoji || '🔎', px(chipX+chipW/2), py(chipY+chipH/2+1));
        ctx.globalAlpha = 1;
      }
      // ⭐ 底部 30% 半黑蒙层 + 白色文案
      var maskH = Math.round(chipH * 0.32);
      var maskY = chipY + chipH - maskH;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(px(chipX), py(maskY), ps(chipW), ps(maskH));
      ctx.font = 'bold '+(9*S)+'px system-ui,-apple-system,Arial';
      ctx.fillStyle = found ? '#c8f5d8' : '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 名字自动截取，超宽时缩到 2-3 字
      var _name = meta.name || '';
      while (_name.length>0 && ctx.measureText(_name).width > ps(chipW-4)) _name = _name.slice(0,-1);
      ctx.fillText(_name, px(chipX+chipW/2), py(maskY+maskH/2+0.5));
      ctx.restore();
      // 边框（不受 clip 影响）
      strokeRR(px(chipX), py(chipY), ps(chipW), ps(chipH), ps(6), '#1a1015', ps(1.6));
      // 找到打勾角标（右上角）
      if (found){
        ctx.save();
        ctx.fillStyle = '#3aa06b';
        ctx.beginPath();
        ctx.arc(px(chipX+chipW-7), py(chipY+7), ps(7), 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = ps(1.8); ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(px(chipX+chipW-10), py(chipY+7));
        ctx.lineTo(px(chipX+chipW-8), py(chipY+9.5));
        ctx.lineTo(px(chipX+chipW-4), py(chipY+4.5));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ⭐ v0.0.48 分段进度条：按 need 切分，已完成的段填亮色
  function drawSegmentedProgress(x, y, w, h, done, total){
    if (!total || total<=0) return;
    var segGap = 2;
    var segW = (w - segGap * (total-1)) / total;
    for (var i=0; i<total; i++){
      var sx = x + i*(segW+segGap);
      var filled = i < done;
      fillRR(px(sx), py(y), ps(segW), ps(h), ps(1.5),
             filled ? '#ffe066' : 'rgba(0,0,0,0.28)');
      strokeRR(px(sx), py(y), ps(segW), ps(h), ps(1.5),
             filled ? '#7a5a10' : 'rgba(0,0,0,0.35)', ps(0.8));
    }
  }

  function drawToolbar(){
    var y0 = VH-TOOLBAR_H;
    var bh=56, gap=12;
    // ⭐ v0.0.48b 游戏页新增"设置"齿轮按钮，放在提示左侧
    var bwSet = 54, gap = 12;
    var _avail = VW - 24 - bwSet - gap * 2;  // 两侧各留 12px 边距
    var bwHint = Math.round(_avail * 0.40);
    var bwSkip = _avail - bwHint;
    var _total2 = bwSet + gap + bwHint + gap + bwSkip;
    var startX = (VW-_total2)/2;
    var by = y0 + 20;
    // 设置按钮切图（160×160 正方形，以 bh 为边长等比绘制）
    var setImg = state.imgs && state.imgs['assets/ui/btn-settings-game.png'];
    if (setImg && setImg.width > 0){
      var _side = ps(bh); // 正方形，不压缩
      var _sx = px(startX) + (ps(bwSet) - _side) / 2; // 水平居中对齐
      try { ctx.drawImage(setImg, _sx, py(by), _side, _side); } catch(e){}
    } else {
      // fallback: 原始齿轮
      ctx.beginPath(); ctx.arc(px(setCx), py(setCy), ps(setR), 0, Math.PI*2);
      ctx.fillStyle='#ffcf5b'; ctx.fill();
      ctx.strokeStyle='#1a1015'; ctx.lineWidth=ps(2.5); ctx.stroke();
    }
    state.tapAreas.push({
      x:px(startX), y:py(by), w:ps(bwSet), h:ps(bh),
      priority: 100,
      onTap: function(){ state.settingsOverlay = true; }
    });
    var _storyHintMode = state.level && state.level.mode === 'story';
    var _spotHintMode  = state.level && state.level.mode === 'spot';
    var _storyHintDone = _storyHintMode && (state.storyHintStage||0) >= 2;
    var _spotHintDone  = _spotHintMode  && (state.spotHintStage||0)  >= 2;
    var _twoStageMode  = _storyHintMode || _spotHintMode;
    var _hintAds       = _storyHintMode ? (state.storyHintAds||0) : (_spotHintMode ? (state.spotHintAds||0) : 0);
    var btns = [
      { id:'hint', label:_hintButtonLabel(), used:(_hintAllFound()||(_storyHintMode?_storyHintDone:(_spotHintMode?_spotHintDone:state.hintUsed))), style:'orange', tap:useHint, w:bwHint,
        adTotal:_twoStageMode?2:1, adDone:_twoStageMode?Math.min(2,_hintAds):(state.hintUsed?1:0),
        // 两段式模式（story/spot）角标初始只显示「看视频 x1」
        badgeShowTotal:_twoStageMode?1:0 },
      { id:'skip', label:'跳过本关', used:state.skipUsed, style:'green', tap:useSkip, w:bwSkip, adTotal:2, adDone:(state.skipAdCount||0) }
    ];
    var cx2 = startX + bwSet + gap;
    btns.forEach(function(b){
      var bx = px(cx2), btop = py(by);
      ctx.save();
      if (b.used) ctx.globalAlpha = 0.45;
      var lbl = b.used ? '已 用' : b.label;
      if (b.style === 'orange') drawOrangeBtn(bx, btop, ps(b.w), ps(bh), lbl, 15*S);
      else                      drawGreenBtn (bx, btop, ps(b.w), ps(bh), lbl, 15*S);
      ctx.restore();
      if (!b.used) drawAdBadge(bx, btop, ps(b.w), { total:b.adTotal, done:b.adDone, displayTotal:b.badgeShowTotal });
      if (!b.used) state.tapAreas.push({ x:bx, y:btop, w:ps(b.w), h:ps(bh), onTap:b.tap });
      cx2 += b.w + gap;
    });
  }

  // ⭐ v0.0.48e 移除单独游戏内设置浮层，改用统一的 drawSettingsOverlay（首页那套）
  function drawGameSettingsOverlay(){ /* deprecated, 已合并到 drawSettingsOverlay */ }

  function drawIconHint(cx, cy, r){
    ctx.fillStyle = '#fff'; ctx.strokeStyle = C.INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy - r*0.15, r*0.75, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.INK;
    ctx.fillRect(cx - r*0.35, cy + r*0.55, r*0.7, r*0.22);
    ctx.fillRect(cx - r*0.25, cy + r*0.85, r*0.5, r*0.15);
  }
  function drawIconMag(cx, cy, r){
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx-r*0.15, cy-r*0.15, r*0.65, 0, Math.PI*2); ctx.stroke();
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx+r*0.35, cy+r*0.35);
    ctx.lineTo(cx+r, cy+r);
    ctx.stroke(); ctx.lineCap = 'butt';
  }
  function drawIconSkip(cx, cy, r){
    ctx.fillStyle = '#fff'; ctx.strokeStyle = C.INK; ctx.lineWidth = 1.5;
    [-r*0.5, 0].forEach(function(off){
      ctx.beginPath();
      ctx.moveTo(cx+off-r*0.35, cy-r*0.5);
      ctx.lineTo(cx+off+r*0.2, cy);
      ctx.lineTo(cx+off-r*0.35, cy+r*0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    ctx.fillRect(cx+r*0.35, cy-r*0.5, r*0.2, r);
    ctx.strokeRect(cx+r*0.35, cy-r*0.5, r*0.2, r);
  }

  // 引导浮层 = 屏幕中央「一闪即消」的任务提示（1 秒自动消失）
  // ⭐ UX 修复：running 已在 pickLevel 里置 true，引导期间玩家即可点击找物，
  //    引导只是快速淡入淡出的视觉提示，绝不阻断操作、绝不拦截点击。
  //    ⭐ 联动组件：文案严格取当前关卡标题 state.level.title，关卡切换自动跟随。
  function drawGuideCard(){
    var life = 1.5;
    var age = (M3._now() - (state.guideStart || M3._now())) / 1000;
    if (age >= life){ state.guide = false; return; }
    var alpha;
    if (age < 0.12) alpha = age/0.12;
    else if (age > life-0.3) alpha = Math.max(0,(life-age)/0.3);
    else alpha = 1;
    var scale = 0.85 + 0.15 * Math.min(1, age/0.12);

    var title = (state.level && state.level.title) || '';
    var taskName = title.replace(/^\u7b2c\s*\d+\s*\u5173\s*\xb7\s*/,'');

    setFont(15*S, 'bold');
    var line1W = ctx.measureText('\u672c\u5173\u4efb\u52a1').width;
    setFont(17*S, 'bold');
    var line2W = ctx.measureText(taskName).width;
    var bw = Math.min(Math.max(line2W, line1W) + ps(48), ps(VW - 32));
    var bh = ps(72);

    var st = getStageRect();
    var cx = st.x + st.w/2;
    var cy = st.y + st.h*0.42;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    var bx = cx - bw/2, by = cy - bh/2, br = ps(12);
    // 阴影
    fillRR(bx + ps(2), by + ps(4), bw, bh, br, 'rgba(80,10,10,0.18)');
    // 奶白背景
    fillRR(bx, by, bw, bh, br, '#FFF8F5');
    // 暗红描边
    strokeRR(bx, by, bw, bh, br, '#5C1515', ps(3));
    // 小标题
    _lastBaseline = '';
    textStroke('\u672c\u5173\u4efb\u52a1', cx, by + bh*0.3, 12*S, '#7a2010', '#FFF8F5', 'center', ps(1.8));
    // 关卡名
    _lastBaseline = '';
    textStroke(taskName, cx, by + bh*0.68, 16*S, '#2a0808', '#FFF8F5', 'center', ps(2.5));
    ctx.restore(); _lastBaseline = '';
  }

  // 提示浮层：黄底黑描、居中靠上、带 emoji + 描述（5 秒淡出）
  function drawHintBubble(){
    var hb = state.hintBubble; if (!hb) return;
    var w = 300, h = 62, x = (VW-w)/2, y = HUD_H + 10;
    var left = (hb.until - M3._now())/1000;
    var a = left < 0.4 ? Math.max(0, left/0.4) : 1;
    ctx.save();
    ctx.globalAlpha = 0.95 * a;
    fillRR(px(x), py(y)+ps(4), ps(w), ps(h), ps(12), 'rgba(0,0,0,0.28)');
    fillRR(px(x), py(y), ps(w), ps(h), ps(12), C.YEL);
    strokeRR(px(x), py(y), ps(w), ps(h), ps(12), C.INK, ps(2.6));
    textStroke('💡 提 示', px(x+w/2), py(y+16), 12*S, C.INK, '#fff', 'center', ps(1.6));
    var line = hb.emoji + '  ' + hb.text;
    textStroke(line, px(x+w/2), py(y+42), 14*S, C.INK, '#fff', 'center', ps(2));
    ctx.restore();
  }

  function drawLaotieBubble(){
    var w=230, h=36, x=(VW-w)/2, y=HUD_H+8;
    // 剩余展示时长→淡出（最后 0.4s 渐隐），整体降低不透明度，不遮挡场景
    var left = (state.laotieUntil - M3._now())/1000;
    var a = left < 0.4 ? Math.max(0,left/0.4) : 1;
    ctx.save();
    ctx.globalAlpha = 0.82 * a;          // 半透，不再写实
    fillRR(px(x), py(y), ps(w), ps(h), ps(11), C.YEL);
    ctx.globalAlpha = a;
    strokeRR(px(x), py(y), ps(w), ps(h), ps(11), C.INK, 2);
    textStroke(state.laotieLine, px(x+w/2), py(y+h/2), 14*S, C.INK, '#fff', 'center', 2);
    ctx.restore();
  }

  // 剧情关卡通关页：严格按“通关揭示 / 下一关钩子”配置展示。
  // 只有配置了 nextHook 的 story 关卡进入此布局，其他玩法继续使用原通关页。
  function drawStoryRevealModal(){
    var lv = state.level || {};
    var cx = VW/2;
    ctx.fillStyle='rgba(5,20,42,0.84)';ctx.fillRect(0,0,W,H);

    var cardX=11,cardW=VW-22,pad=22;
    var revealText=lv.epilogue || '';
    var hookText=lv.nextHook || '';
    var bodyLines=[];
    revealText.split('\n').forEach(function(p){
      _storyWrapLines(p,ps(cardW-pad*2),14*S,3).forEach(function(line){bodyLines.push(line);});
    });
    var hookLines=_storyWrapLines(hookText,ps(cardW-pad*2-24),13*S,3);
    var cardH=Math.min(VH-34,308+bodyLines.length*21+hookLines.length*20);
    var cardY=Math.max(17,(VH-cardH)/2);

    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.42)';ctx.shadowBlur=ps(18);ctx.shadowOffsetY=ps(7);
    ctx.fillStyle='#FFF8E8';ctx.beginPath();rr(px(cardX),py(cardY),ps(cardW),ps(cardH),ps(20));ctx.fill();
    ctx.restore();
    strokeRR(px(cardX),py(cardY),ps(cardW),ps(cardH),ps(20),'#123E73',ps(5));
    strokeRR(px(cardX+7),py(cardY+7),ps(cardW-14),ps(cardH-14),ps(15),'#D4B36A',ps(1.5));

    var y=cardY+37;
    textStroke('通关揭示',px(cx),py(y),24*S,'#0A3768','rgba(255,255,255,0.45)','center',ps(0.8));
    y+=26;
    ctx.strokeStyle='#C5A45E';ctx.lineWidth=ps(1);
    ctx.beginPath();ctx.moveTo(px(cardX+pad),py(y));ctx.lineTo(px(cx-9),py(y));ctx.stroke();
    ctx.beginPath();ctx.moveTo(px(cx+9),py(y));ctx.lineTo(px(cardX+cardW-pad),py(y));ctx.stroke();
    ctx.fillStyle='#C5A45E';ctx.save();ctx.translate(px(cx),py(y));ctx.rotate(Math.PI/4);ctx.fillRect(-ps(4),-ps(4),ps(8),ps(8));ctx.restore();
    y+=27;

    ctx.font='bold '+Math.round(14*S)+'px FZZhengHeiS-EB-GB, sans-serif';
    ctx.fillStyle='#17365B';ctx.textAlign='left';ctx.textBaseline='top';
    for(var i=0;i<bodyLines.length;i++){ctx.fillText(bodyLines[i],px(cardX+pad),py(y+i*21));}
    y+=bodyLines.length*21+20;

    ctx.fillStyle='#F4E6C7';ctx.beginPath();rr(px(cardX+pad-5),py(y-8),ps(cardW-pad*2+10),ps(1),ps(1));ctx.fill();
    textStroke('下一关钩子',px(cardX+pad),py(y+13),16*S,'#8B241D','rgba(255,255,255,0.35)','left',ps(0.6));
    y+=60;
    var hookBoxH=hookLines.length*20+24;
    ctx.fillStyle='#FFF0CD';ctx.beginPath();rr(px(cardX+pad),py(y-7),ps(cardW-pad*2),ps(hookBoxH),ps(10));ctx.fill();
    ctx.font='bold '+Math.round(13*S)+'px FZZhengHeiS-EB-GB, sans-serif';
    ctx.fillStyle='#4B3828';ctx.textAlign='center';ctx.textBaseline='middle';
    var hookTextBlockH=hookLines.length*20;
    var hookTextStartY=y-7+(hookBoxH-hookTextBlockH)/2+10;
    for(var j=0;j<hookLines.length;j++){ctx.fillText(hookLines[j],px(cx),py(hookTextStartY+j*20));}

    var bh=48,gap=12,bw=(cardW-pad*2-gap)/2;
    var btnY=cardY+cardH-bh-40,b1x=cardX+pad,b2x=b1x+bw+gap;
    candyButton(px(b1x),py(btnY),ps(bw),ps(bh),'返 回',15*S,'blue',false);
    candyButton(px(b2x),py(btnY),ps(bw),ps(bh),'下一关',15*S,'green',false);
    state.tapAreas.push({x:px(b1x),y:py(btnY),w:ps(bw),h:ps(bh),onTap:Game.gotoThemes,priority:10});
    var sameTheme=M3.getThemeLevels(lv.themeId);
    var curPos=sameTheme.indexOf(lv);
    var nextLv=(curPos>=0&&curPos+1<sameTheme.length)?sameTheme[curPos+1]:null;
    state.tapAreas.push({x:px(b2x),y:py(btnY),w:ps(bw),h:ps(bh),priority:10,onTap:function(){
      // ⭐ 主题最后一关：不再直接回首页，先弹「恭喜通关 · 敬请期待新章节」面板（按钮回首页）
      if(nextLv) Game.pickLevel(M3.LEVELS.indexOf(nextLv)); else state.chapterDone=true;
    }});
  }

  function drawWinModal(){
    if(state.level&&state.level.mode==='story'&&state.level.nextHook){drawStoryRevealModal();return;}
    var cx = VW/2;
    var ratio = state.time / (state.level.duration || 60);
    var stars = ratio>=0.5 ? 3 : (ratio>=0.25 ? 2 : 1);
    var beatInfo = calcBeatPercent(state.time, state.level.duration, state.diff, state.levelIdx);

    // ── 1. 黑色80%遮罩 ──（win-bg / win-confetti / win-glow 图片资源已移除，使用纯色背景）
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,W,H);

    // ── 2. banner-blue.png 预加载（lose弹窗/chapter弹窗共用，需保障）──
    if (M3.SubpkgLoader && !M3.SubpkgLoader.isLoaded('ui-gameplay')) {
      try { M3.SubpkgLoader._load('ui-gameplay', function(err) {
        if (!err) loadImg('assets/ui/banner-blue.png');
      }); } catch(_e) {}
    } else if (!state.imgs['assets/ui/banner-blue.png'] && !state.imgLoading['assets/ui/banner-blue.png']) {
      try { loadImg('assets/ui/banner-blue.png'); } catch(_e) {}
    }

    // ── 3. 恭喜通关 标题（纯文字渲染）──
    var _wtVH = 52;  // 文字标题高度（与原切图高度一致，保持布局稳定）

    // 计算整块总高度，垂直居中于画布
    var _gap1 = 24, _gap2 = 16, _gap3 = 28, _gap4 = 36;
    var _starH = 20, _infoH = 16, _cardH = 180, _btnH = 52;
    var _totalH = _wtVH + _gap1 + _starH + _gap2 + _infoH + _gap3 + _cardH + _gap4 + _btnH;
    var _startY = (VH - _totalH) / 2 - 30;  // 整块垂直居中，上移30dp

    // 文字标题：渐变色"恭喜通关"
    textStroke('恭喜通关', px(cx), py(_startY + _wtVH/2), 32*S, '#FFE066', 'rgba(10,40,80,0.75)', 'center', ps(4));
    var _titleBottom = _startY + _wtVH;

    // ── 4. Logo 已移除 ──

    // ── 5. 星星（切图底部 + 24）──
    var starSize = 20, starGap = 20;
    var starTotal = starSize * 3 + starGap * 2;
    var starStartX = cx - starTotal/2;
    var starY = _titleBottom + 24;  // 切图底部 → 星星顶部：24
    for (var i=0; i<3; i++){
      drawStarImg(px(starStartX + i*(starSize+starGap) + starSize/2), py(starY), ps(starSize), i<stars);
    }
    var _starBottom = starY + starSize; // 星星底部

    // ── 6. 副信息（星星底部 + 16）──
    var infoY = _starBottom + 16;  // 星星底部 → 副信息：16
    _lastBaseline = '';
    // story 模式：情绪标签弹入 + 反转文案逐行打字。
    if (state.level && state.level.mode === 'story' && state.level.epilogue) {
      var _tag = state.level.epilogueTag || '';
      var _epi = state.level.epilogue;
      var _winElapsed = state.storyWinAnimStart ? M3._now()-state.storyWinAnimStart : 9999;
      var _tagAlpha = Math.min(1, _winElapsed/400);
      var _tagScale = _winElapsed < 400 ? 1.3-0.3*(_winElapsed/400) : 1;
      ctx.save();
      ctx.globalAlpha = _tagAlpha;
      ctx.translate(px(cx), py(infoY+8)); ctx.scale(_tagScale,_tagScale); ctx.translate(-px(cx),-py(infoY+8));
      textStroke(_tag, px(cx), py(infoY+8), 17*S, '#ffe080', 'rgba(0,0,0,0.7)', 'center', ps(2.5));
      ctx.restore();
      infoY += 22;
      var _lines = _epi.split('\n');
      for (var _li = 0; _li < _lines.length; _li++) {
        var _lineElapsed = _winElapsed-400-_li*220;
        if (_lineElapsed <= 0) continue;
        var _lineAlpha = Math.min(1,_lineElapsed/180);
        var _fullLine = _lines[_li];
        var _visibleLen = Math.min(_fullLine.length, Math.ceil(_lineElapsed/250*_fullLine.length));
        var _visibleText = _fullLine.slice(0,_visibleLen);
        if (!_visibleText) continue;
        ctx.save(); ctx.globalAlpha = _lineAlpha;
        textStroke(_visibleText, px(cx), py(infoY + _li * 17), 11.5*S, '#fff5d0', 'rgba(0,0,0,0.65)', 'center', ps(2));
        ctx.restore();
      }
      var _infoBottom = infoY + _lines.length * 17 + 8;
    } else {
      textStroke('剩余 '+state.time+'s，击败'+beatInfo.pct+'%的'+beatInfo.suffix,
        px(cx), py(infoY), 13*S, '#ffffff', 'rgba(0,0,0,0.55)', 'center', ps(2.5));
      var _infoBottom = infoY + 16; // 副信息底部
    }

    // ── 7. 关卡缩略图（副信息底部 + 35）──
    var cardMaxW = 170, cardMaxH = 180;
    var cardY = _infoBottom + 28;  // 副信息底部 → 图片顶部：28
    var _actualCardH = cardMaxH;
    var sceneImg = state.imgs && state.level && state.imgs[state.level.sceneA || state.level.scene];
    if (sceneImg && sceneImg.width > 0){
      var sRatio = sceneImg.width / sceneImg.height;
      var cdw = cardMaxW, cdh = cdw / sRatio;
      if (cdh > cardMaxH){ cdh = cardMaxH; cdw = cdh * sRatio; }
      _actualCardH = cdh;
      var cardX = cx - cdw/2;
      ctx.save();
      ctx.beginPath(); rr(px(cardX), py(cardY), ps(cdw), ps(cdh), ps(12)); ctx.clip();
      ctx.drawImage(sceneImg, px(cardX), py(cardY), ps(cdw), ps(cdh));
      ctx.restore();
      strokeRR(px(cardX), py(cardY), ps(cdw), ps(cdh), ps(12), '#ffffff', ps(3));
    } else {
      var cardX = cx - cardMaxW/2;
    }
    var _cardBottom = cardY + _actualCardH; // 图片底部

    // ── 8. 双按钮（图片底部 + 25）──
    var bh = 52, bw = 130, gap = 16;
    var btnY = _cardBottom + 36;  // 图片底部 → 按钮顶部：36
    var b1x = cx - bw - gap/2, b2x = cx + gap/2;
    candyButton(px(b1x), py(btnY), ps(bw), ps(bh), '返 回', 15*S, 'blue', false);
    state.tapAreas.push({ x:px(b1x), y:py(btnY), w:ps(bw), h:ps(bh), onTap:Game.gotoThemes, priority:10 });
    candyButton(px(b2x), py(btnY), ps(bw), ps(bh), '下一关', 15*S, 'green', false);
    // ⭐ v1.0.19 修复：按主题序列取下一关（不再用 idx+1，因 idx 是全局的，同主题 idx 可能不连续）
    var _sameTheme = M3.getThemeLevels(state.level.themeId);
    var _curPos = _sameTheme.indexOf(state.level);
    var _winNextLv = (_curPos>=0 && _curPos+1 < _sameTheme.length) ? _sameTheme[_curPos+1] : null;
    // ⭐ v1.2.3 下一关需看广告解锁时，按钮右上角贴「看视频」角标（让玩家点之前就知道）
    try {
      if (_winNextLv){
        var _nextIdx = M3.LEVELS.indexOf(_winNextLv);
        if (_nextIdx >= 0 && _needLvAd(_nextIdx)){
          drawAdBadge(px(b2x), py(btnY), ps(bw), { total:1, done:0 });
        }
      }
    } catch(_e){}
    state.tapAreas.push({ x:px(b2x), y:py(btnY), w:ps(bw), h:ps(bh),
      onTap:function(){
        try { _reportBtnClick('btn_next_level', 'win_modal'); } catch(_e){}
        if (_winNextLv) Game.pickLevel(M3.LEVELS.indexOf(_winNextLv));
        else Game.gotoThemes();
      }, priority:10 });
    state.tapAreas.push({ x:0, y:0, w:W, h:H, onTap:function(){}, priority:9 });
  }
  // 时间到弹窗 — 参考 Figma 512-2103
  // 「时间到」失败弹窗 — Figma 512-2103
  // frame 354×341，card 354×306（#EBF3FF, border 7px #6AA0F2, r=24）
  // banner 284×74（left=35），主标题 fontSize=22 lineHeight=36（marginTop=89），副标题 fontSize=16 lineHeight=26（marginTop=8），按钮 144×60（marginTop=59）
  function drawLoseModal(){
    if (!state.lose) return;
    var SC    = 290/354;
    var cw    = 290;
    var ch    = Math.round(306 * SC);
    var banH  = Math.round(74  * SC);
    var banOH = Math.round(35  * SC);   // 341 - 306 = 35
    var cx    = Math.round((VW - cw) / 2);
    var cy    = Math.round((VH - ch - banOH) / 2) + banOH;
    var banY  = cy - banOH;

    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:9, onTap:function(){} });

    // 主卡
    fillRR(px(cx), py(cy), ps(cw), ps(ch), ps(Math.round(24*SC)), '#EBF3FF');
    strokeRR(px(cx), py(cy), ps(cw), ps(ch), ps(Math.round(24*SC)), '#6AA0F2', ps(Math.round(7*SC)));

    // banner：left=35，不居中
    var banW = Math.round(284 * SC);
    var banX = cx + Math.round(35 * SC);
    var bannerImg = state.imgs['assets/ui/banner-blue.png'];
    if(!bannerImg&&!state.imgLoading['assets/ui/banner-blue.png'])try{loadImg('assets/ui/banner-blue.png');}catch(_e){}
    if(bannerImg&&bannerImg.width>0){
      try{ctx.drawImage(bannerImg,px(banX),py(banY),ps(banW),ps(banH));}catch(_e){}
    }
    textStroke('时间到', px(VW/2), py(banY + Math.round(28*SC)), Math.round(20*S), '#ffffff', '#123C64', 'center', ps(2.5));

    // 关闭按钮：top=20, right=-15（-4 额外偏移）
    var cs = Math.round(46 * SC);
    var closeImgX = cx + cw - Math.round(15 * SC) - 4;
    var closeImgY = banY + Math.round(20 * SC);
    var closeImg = state.imgs['assets/ui/btn-close.png'];
    if(!closeImg&&!state.imgLoading['assets/ui/btn-close.png'])try{loadImg('assets/ui/btn-close.png');}catch(_e){}
    if(closeImg&&closeImg.width>0){
      try{ctx.drawImage(closeImg,px(closeImgX),py(closeImgY),ps(cs),ps(cs));}catch(_e){}
    } else {
      ctx.beginPath(); ctx.arc(px(closeImgX+cs/2),py(closeImgY+cs/2),ps(cs/2),0,Math.PI*2);
      ctx.fillStyle='#f05050'; ctx.fill();
      text('✕',px(closeImgX+cs/2),py(closeImgY+cs/2),16*S,'#fff','center');
    }
    // ⭐ v1.0.85 修复：时间到弹窗关闭按钮 = 返回主题选择页（此时 state.running=false，只关弹窗会导致页面死锁）
    state.tapAreas.push({ x:px(closeImgX-4), y:py(closeImgY-4), w:ps(cs+8), h:ps(cs+8), priority:12,
      onTap:function(){ state.lose=false; Game.gotoThemes(); } });

    // 主标题：marginTop=89，fontSize=22，lineHeight=36，mixed color
    var remaining = (state.level && state.level.odds) ? (state.level.odds.length - (state.foundCount||0)) : 0;
    var line1TopY = cy + Math.round(89 * SC);
    var line1MidY = line1TopY + Math.round(18 * SC);  // 36/2 = 18
    setFont(Math.round(19*S), 'bold');
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    // ⭐ v1.0.59: 按当前关卡 mode 决定文案（穿越物/不同/隐藏物）
    var _remainName = '穿越物';
    if (state.level){
      if (state.level.mode === 'spot') _remainName = '不同';
      else if (state.level.mode === 'hunt') _remainName = '隐藏物';
      else if (state.level.mode === 'story') _remainName = '条线索';
    }
    var seg1 = '还剩', seg2 = String(remaining), seg3 = '个' + _remainName + '没找到';
    var seg1W = ctx.measureText(seg1).width;
    var seg2W = ctx.measureText(seg2).width;
    var seg3W = ctx.measureText(seg3).width;
    var totalW = seg1W + seg2W + seg3W;
    var startX = px(VW/2) - totalW/2;
    ctx.fillStyle = '#00255E'; ctx.fillText(seg1, startX + seg1W/2, py(line1MidY));
    ctx.fillStyle = '#FD585F'; ctx.fillText(seg2, startX + seg1W + seg2W/2, py(line1MidY));
    ctx.fillStyle = '#00255E'; ctx.fillText(seg3, startX + seg1W + seg2W + seg3W/2, py(line1MidY));

    // 副标题：marginTop=8，fontSize=16，lineHeight=26，#00255E
    var line2TopY = line1TopY + Math.round(36 * SC) + Math.round(8 * SC);
    var line2MidY = line2TopY + Math.round(13 * SC);  // 26/2 = 13
    setFont(Math.round(13*S));
    ctx.fillStyle = '#00255E'; ctx.textAlign = 'center';
    ctx.fillText('看视频+60秒，继续挑战吧', px(VW/2), py(line2MidY));

    // 双按钮：各144×60，gap=10，marginTop=59（从副标题底部）
    var bw = Math.round(144 * SC);
    var bh = Math.round(60  * SC);
    var btnGap = Math.round(10 * SC);
    var b1x = cx + Math.round((cw - bw*2 - btnGap) / 2);
    var b2x = b1x + bw + btnGap;
    var by  = line2TopY + Math.round(26 * SC) + Math.round(59 * SC);

    candyButton(px(b1x), py(by), ps(bw), ps(bh), '重玩', Math.round(17*S), 'blue', false);
    state.tapAreas.push({ x:px(b1x), y:py(by), w:ps(bw), h:ps(bh), priority:10,
      onTap:function(){ try { _reportBtnClick('btn_retry', 'lose_modal'); } catch(_e){} Game.pickLevel(state.levelIdx); } });

    candyButton(px(b2x), py(by), ps(bw), ps(bh), '+60秒', Math.round(17*S), 'green', false);
    state.tapAreas.push({ x:px(b2x), y:py(by), w:ps(bw), h:ps(bh), priority:10, onTap:reviveAd });
  }

  // 2 道具（提示 + 跳关）
  // ⭐ v1.0.105 提示新规则：
  //   - 干掉每日免费，每次必须看广告
  //   - 每关最多用 1 次（state.hintUsed 已在 pickLevel 时重置）
  //   - 用完后再点提示 → toast "每个关卡最多用 1 次"
  function _hintAllFound(){
    // 是否所有 odds 都已找到（提示按钮此时应变灰）
    if (!state.level || !state.level.odds) return false;
    for (var i=0;i<state.level.odds.length;i++){ if (!state.found[i]) return false; }
    return true;
  }
  function _hintButtonLabel(){
    if (_hintAllFound()) return '全找到';
    if (state.level && state.level.mode === 'story') {
      if ((state.storyHintStage||0) === 1) return '定位线索';
      if ((state.storyHintStage||0) >= 2) return '已定位';
      return '揭晓线索';
    }
    if (state.level && state.level.mode === 'spot') {
      if ((state.spotHintStage||0) === 1) return '定位不同';
      if ((state.spotHintStage||0) >= 2) return '已定位';
      return '揭晓线索';
    }
    return state.hintUsed ? '已用过' : '提 示';
  }
  function _pickStoryHintTarget(){
    var current = state.storyHintTarget;
    if (current >= 0 && state.level.odds[current] && !state.found[current]) return current;
    var candidates = [];
    state.level.odds.forEach(function(_o, idx){ if (!state.found[idx]) candidates.push(idx); });
    if (!candidates.length) return -1;
    current = candidates[Math.floor(Math.random()*candidates.length)];
    state.storyHintTarget = current;
    return current;
  }
  // ⭐ spot 两段式提示：第1次揭晓 clue 文案，第2次小手定位
  function _grantSpotHintStage(){
    // 找一个未命中的不同点
    var candidates = [];
    state.level.odds.forEach(function(_o, idx){ if (!state.found[idx]) candidates.push(idx); });
    if (!candidates.length) return;
    // 优先延续上一次的目标（玩家还没找到时继续引导同一个）
    var targetIdx = state.spotHintTarget;
    if (targetIdx < 0 || state.found[targetIdx]) {
      targetIdx = candidates[Math.floor(Math.random()*candidates.length)];
      state.spotHintTarget = targetIdx;
    }
    var target = state.level.odds[targetIdx];
    var lay = state.level.layout || 'v';
    var imgLabel = (lay === 'h') ? '下图' : '右图';
    // clue 是最准确的线索文案，其次用位置描述
    var name = target.clue || target.tag || '';
    state.hintUsed = true;
    if ((state.spotHintStage||0) === 0) {
      state.spotHintStage = 1;
      state.spotHintAds = 1;
      var msg;
      if (name) {
        msg = '🔎 线索：' + imgLabel + ' ' + name + '\n再看一次视频可定位';
      } else {
        // 无 clue 时回退到方位提示
        var hRegion = (target.x < 40 ? '左' : (target.x > 60 ? '右' : '中'));
        var vRegion = (target.y < 40 ? '上' : (target.y > 60 ? '下' : '中'));
        var region = (vRegion==='中'&&hRegion==='中') ? '正中' : (hRegion==='中'?'中'+vRegion:(vRegion==='中'?hRegion+'中':vRegion+hRegion));
        msg = '🔎 提示：' + imgLabel + '的' + region + '区域有小改动\n再看一次视频可定位';
      }
      toast(msg, { duration:4600 });
    } else {
      state.spotHintStage = 2;
      state.spotHintAds = 2;
      // 小手指向 B 图（state._fit）中对应位置
      state.hintArrows.push({
        ox:(target.x + target.w/2)/100,
        oy:(target.y + target.h/2)/100,
        life:6,
        isSpot: true   // 标记：spot 模式也用小手图标
      });
      var locMsg = name ? '📍 ' + name + '（已在' + imgLabel + '标出位置）' : '📍 不同点已在' + imgLabel + '标出';
      toast(locMsg, { duration:3600 });
    }
    try { if (M3.Feedback) M3.Feedback.play('global_hint'); } catch(_e){}
  }
  function _grantStoryHintStage(){
    var targetIdx = _pickStoryHintTarget();
    if (targetIdx < 0) return;
    var target = state.level.odds[targetIdx];
    var name = target.clue || target.tag || ('线索' + (targetIdx+1));
    state.hintUsed = true;
    if ((state.storyHintStage||0) === 0) {
      state.storyHintStage = 1;
      state.storyHintAds = 1;
      toast('🔎 ' + (target.clue ? name : '本关要找《' + name + '》') + '\n再看一次视频可定位', { duration:4600 });
    } else {
      state.storyHintStage = 2;
      state.storyHintAds = 2;
      state.hintArrows.push({
        ox:(target.x+target.w/2)/100,
        oy:(target.y+target.h/2)/100,
        life:6
      });
      toast('📍 ' + (target.clue ? name + '（已标出）' : '《' + name + '》的位置已标出'), { duration:3600 });
    }
    try { if (M3.Feedback) M3.Feedback.play('global_hint'); } catch(_e){}
  }
  function useHint(){
    // ⭐ v1.0.74 Analytics: 提示按钮
    try { if (M3.Analytics){ M3.Analytics.buttonClick('btn_hint'); M3.Analytics.levelHint(); } } catch(_){}
    // ⭐ v1.3.1 F组埋点：BUTTON_CLICK hint（SC 7053）
    try { _reportBtnClick('btn_hint', 'game', { isAd: true, adSlot: 'hint' }); } catch(_e){}
    if (!state.running) return;
    if (_hintAllFound()){ toast('已经全部找到啦！'); return; }
    // story 专用两段式广告提示：先揭晓名称，再定位位置。
    if (state.level && state.level.mode === 'story') {
      if ((state.storyHintStage||0) >= 2) {
        toast('本关的提示已经用完啦～');
        return;
      }
      if (M3.KwaiAd && M3.KwaiAd.showRewarded) {
        M3.KwaiAd.showRewarded(function(ok){
          if (!ok){ toast('要看完视频才能获得提示哦～'); return; }
          setTimeout(_grantStoryHintStage, 60);
        });
      } else {
        _grantStoryHintStage();
      }
      return;
    }
    // spot 两段式广告提示：第1次看广告揭晓clue文案，第2次看广告小手定位。
    if (state.level && state.level.mode === 'spot') {
      if ((state.spotHintStage||0) >= 2) {
        toast('本关的提示已经用完啦～');
        return;
      }
      if (M3.KwaiAd && M3.KwaiAd.showRewarded) {
        M3.KwaiAd.showRewarded(function(ok){
          if (!ok){ toast('要看完视频才能获得提示哦～'); return; }
          setTimeout(_grantSpotHintStage, 60);
        });
      } else {
        _grantSpotHintStage();
      }
      return;
    }
    // ⭐ v1.0.105 每关最多用 1 次
    if (state.hintUsed){
      toast('每个关卡最多用 1 次提示哦～');
      return;
    }
    // 必须看广告才能获得提示
    if (M3.KwaiAd && M3.KwaiAd.showRewarded){
      M3.KwaiAd.showRewarded(function(ok){
        if (!ok){ toast('要看完视频才能拿提示哦～'); return; }
        state.hintUsed = true;
        setTimeout(function(){
          var hintMsg = _buildHintText();
          if (hintMsg){
            toast(hintMsg, { duration:4200 });
          }
          try { if (M3.Feedback) M3.Feedback.play('global_hint'); } catch(_e){}
        }, 60);
      });
    } else {
      // 本地调试无广告 SDK 时直接给提示
      state.hintUsed = true;
      var hintMsg = _buildHintText();
      if (hintMsg) toast(hintMsg, { duration:4200 });
      try { if (M3.Feedback) M3.Feedback.play('global_hint'); } catch(_e){}
    }
  }
  // ⭐ v0.0.88 拆出：只返回文案，不直接调 toast，方便合并展示
  function _buildHintText(){
    if (!state.level || !state.level.odds) return '';
    var unfound = [];
    state.level.odds.forEach(function(o,i){ if (!state.found[i]) unfound.push({o:o,i:i}); });
    if (unfound.length===0) return '';
    var pick = unfound[Math.floor(Math.random()*unfound.length)];
    var o = pick.o;
    // ⭐ v1.0.82：优先用关卡数据里的 odd.tag / prop 元数据；spot 模式给方位；实在没有再用关卡 hint
    var propMeta = (M3.PROPS && M3.PROPS[o.prop]) || null;
    var name = '', emoji = '🔎';
    if (state.level.mode==='story') {
      // 主题5剧情线索必须优先显示 odds.tag（中文）。
      // 全局 PROPS.name 中仍有英文 prop_id 占位，不能拿来作为玩家提示文案。
      name = o.clue || o.tag || (propMeta && propMeta.name) || ('线索' + (pick.i + 1));
      console.log("[hint] story mode, o=", JSON.stringify(o), "name=", name);
      return '🔎 提示：' + (o.clue ? name : '找找《' + name + '》');
    } else if (state.level.mode==='spot'){
      // ⭐ spot 找不同：优先用 odds.clue 文案；无 clue 时退回位置描述
      var lay = state.level.layout || 'v';
      var target = (lay === 'h') ? '下图' : '右图';
      // 1. 优先使用 clue 字段（最准确的线索描述）
      if (o.clue) {
        return '🔎 提示：' + target + '有处不同——' + o.clue;
      }
      // 2. fallback: 位置描述
      var hRegion = (o.x < 40 ? '左' : (o.x > 60 ? '右' : '中'));
      var vRegion = (o.y < 40 ? '上' : (o.y > 60 ? '下' : '中'));
      var region;
      if (vRegion === '中' && hRegion === '中') region = '正中';
      else if (vRegion === '中') region = hRegion + '中';
      else if (hRegion === '中') region = '中' + vRegion;
      else region = vRegion + hRegion;
      return '🔎 提示：' + target + '的' + region + '区域有小改动';
    } else {
      // hidden / hunt：优先 odds.clue（最精准描述），其次 propMeta，再 tag，最后 level.hint
      if (o.clue) return '🔎 提示：' + o.clue;
      if (propMeta){
        name = propMeta.name; emoji = propMeta.emoji || '🔎';
        if (state.level.mode==='hunt' && name === '穿越物') name = '隐藏物';
        return emoji + ' 提示：图里藏了个《' + name + '》';
      }
      // odds 没有 prop 元数据 → 用关卡 hint 或 odd.tag
      if (o.tag) return '🔎 提示：找找《' + o.tag + '》';
      if (state.level.hint) return '💡 ' + state.level.hint;
      return '🔎 提示：仔细找找剩下的目标';
    }
  }
  function useSkip(){
    // ⭐ v1.0.74 Analytics: 跳过按钮
    try { if (M3.Analytics) M3.Analytics.buttonClick('btn_skip'); } catch(_){}
    // ⭐ v1.3.1 F组埋点：BUTTON_CLICK skip（SC 7053）
    try { _reportBtnClick('btn_skip', 'game', { isAd: true, adSlot: 'skip' }); } catch(_e){}
    if (state.skipUsed) return;
    // ⭐ v1.0.70 修复：时间到弹窗关闭后 state.running=false，但用户仍应能点「跳过本关」
    //    只在结算/胜利页禁用；lose 状态下允许跳过（跳过=直接进下一关）
    if (state.win) return;
    // ⭐ 防重入：广告回调平台侧可能被真机重复派发（success+close 各回调一次），
    //    上锁保证「一次点击 = 一次计数」，避免点一下直接跳关。
    if (state._skipPending) { toast('广告加载中，稍候…'); return; }
    state._skipPending = true;
    // ⭐ 需 2 次完整看完视频，才能触发"跳过本关"——免广卡也必须点 2 次
    state.skipAdCount = state.skipAdCount || 0;
    var _callbackFired = false;
    M3.KwaiAd.showRewarded(function(ok){
      if (_callbackFired) return;      // ⭐ 二次保险：闭包锁，回调只处理一次
      _callbackFired = true;
      state._skipPending = false;
      // ⭐ v0.0.58 关键修复：只有真正看完广告 (ok=true) 才计数进度
      //   之前 skipAdCount++ 无条件累加 → 用户点开又关掉也算数（用户投诉）
      if (!ok){
        toast('要看完视频才算数哦～');
        return;
      }
      state.skipAdCount++;
      if (state.skipAdCount < 2){
        toast('已看 '+state.skipAdCount+'/2，再看 1 个就可以跳关');
        return;
      }
      // ✅ 满 2 次 → 真正跳关
      state.skipUsed=true; state.running=false;
      state.skipAdCount = 0;
      // ⭐ v0.0.58 全局奖励语音："太牛了 直接跳过本关"
      try { if (M3.Feedback) M3.Feedback.play('global_skip'); } catch(_e){}
      // ⭐ v1.0.19 修复：跳关也按主题序列走
      var _sameThemeSkip = M3.getThemeLevels(state.level.themeId);
      var _skipPos = _sameThemeSkip.indexOf(state.level);
      var _skipNextLv = (_skipPos>=0 && _skipPos+1 < _sameThemeSkip.length) ? _sameThemeSkip[_skipPos+1] : null;
      if (_skipNextLv){
        Game.pickLevel(M3.LEVELS.indexOf(_skipNextLv));
      } else {
        // ⭐ FIX: 本主题已到最后一关，不静默返回首页；给出明确 toast + 停留在结算页
        //    （避免"点跳过直接跳回首页"的困惑）
        state.win = true; state.winModalAt = 0; // 显示结算浮层（"通关"）而不是强制回首页（此路径为按钮点击，不延迟）
        toast('已是本主题最后一关，恭喜通关～');
      }
    });
  }
  function reviveAd(){
    M3.KwaiAd.showRewarded(function(ok){
      if (!ok) return;
      // ⭐ v0.0.48 广告复活：明确 +60s（不管关卡原时长），并封上限避免和 UI 错觉冲突
      var ADD = 60;
      state.time = Math.min(state.time + ADD, ADD + 30);
      state.lose = false; state.running = true;
      state.lastSecondUpdate = M3._now();
      // ⭐ v0.0.58 全局奖励语音："哎呦 满血复活 再给你加 60 秒"
      try { if (M3.Feedback) M3.Feedback.play('global_revive'); } catch(_e){}
      try { console.log('[REVIVE_AD] +'+ADD+'s → time now='+state.time+'s'); } catch(_e){}
    });
  }

  Game.handleTap = function(cx, cy){
    try {
      // ⭐ v0.1.1 debounce 250→100ms：更快响应，只挡真机双派发
      var _now = M3._now();
      if (state._lastTapAt && _now - state._lastTapAt < 100) return;
      state._lastTapAt = _now;
      var areas = state.tapAreas.slice().sort(function(a,b){ return (b.priority||0)-(a.priority||0); });
      var topPri = 0;
      for (var i=0;i<areas.length;i++){
        var a = areas[i];
        if (topPri && (a.priority||0) < topPri) break;
        if (cx>=a.x && cx<=a.x+a.w && cy>=a.y && cy<=a.y+a.h){
          topPri = a.priority||0;
          // ⭐ v0.1.1 关键提速：先执行 onTap（业务逻辑立刻响应），feedback 延后
          //    原顺序 click→ripple→onTap：首次点击因 AudioContext 初始化会有 100-300ms 卡顿
          //    新顺序 onTap→ripple→click：即时响应，音效异步跟上
          state.clickRipples = state.clickRipples || [];
          state.clickRipples.push({ x:cx, y:cy, life:0.12, max:0.12 });  // ⭐ v0.1.1 涟漪 0.18→0.12s
          try { a.onTap && a.onTap(cx, cy); } catch(_e){ state.err = _e&&(_e.message||String(_e)); }
          if (M3.Feedback && M3.Feedback.click) { try { M3.Feedback.click(); } catch(_e){} }
          return;
        }
      }
    } catch(e){ state.err = e&&(e.message||String(e)); }
  };
  Game.handleMove = function(cx, cy){
    // ⭐ v1.0.102 修复隐私政策/用户协议浮层滚动失效：路由 touchmove → Welcome.handleAgreementMove
    if (M3.Welcome && M3.Welcome._agreement && M3.Welcome.handleAgreementMove) {
      M3.Welcome.handleAgreementMove(cx, cy);
      return;
    }
  };

  Game.start = function(_ctx, _canvas){
    ctx = _ctx; canvas = _canvas;
    restoreUnlockedThemes();
    preload();
    // ⭐ v0.0.54 首启进入欢迎页（视频背景+立即去玩+快手授权登录）
    // 若开发调试想直接跳过，可 localStorage.laotie_skip_welcome=1
    var skip = false;
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem('laotie_skip_welcome')==='1') skip = true; } catch(e){}
    state.scene = skip ? 'theme_select' : 'welcome';
  };
})();
