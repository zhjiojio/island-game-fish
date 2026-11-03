/**
 * pd-home.js —— 「快来帮帮我」暂停浮层（点左上角齿轮唤起）
 * ============================================================
 * 挂载点：M3.Home
 *
 * ═══ 为什么这个文件一行都没改 pd-game.js ═══
 * pd-game.js 正在被另一条分支大改（性能 + 引导），任何改动都会撞车。
 * 所以本文件走【纯适配器】路线：只在 pd-game.js 之后 require，靠包住三个
 * 平台入口就拿到了全部需要的能力，对 pd-game.js 零侵入：
 *
 *   ① 输入劫持   包住 ks.onTouchStart/Move/End（浏览器则加 capture 监听）
 *                → 浮层开着时先给自己判命中，命中就吃掉，不再往下传
 *                → 顺便接管左上角齿轮的点击（原本会走 goHome() 弹 toast）
 *   ② 真暂停     包住 window.requestAnimationFrame
 *                → 浮层开着时【不调用】游戏的 loop(ts)，游戏逻辑与渲染彻底冻结
 *                → 但要自己接着 rAF 链，否则关掉浮层后动画就再也不动了
 *                → 冻结那一刻把 canvas 整屏拷进离屏画布当底图，每帧重贴
 *                  （不贴的话，半透明遮罩会一帧一帧叠加，越来越黑）
 *   ③ 开关生效   包住 ks.createInnerAudioContext / ks.vibrateShort / vibrateLong
 *                → 按 src 把音频实例分成 music(bgm) / sound(sfx+voice) 两类
 *                → 关掉某类就把已建实例音量压 0，新建实例也自动继承
 *
 * ⚠️ 加载顺序是硬约束：必须在 pd-game.js【之后】、G.start()【之前】。
 *    因为 ① ③ 是「先包好壳，等 pd-game 自己来调」，晚于 G.start 就包不住了。
 *
 * ═══ ES5 ONLY ═══
 * project.config.json 的 setting.es6=false → 禁 let/const/箭头/模板串/class/解构。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var PD = M3.PD || {};
  var DW = PD.DW || 750, DH = PD.DH || 1624;
  var H = M3.Home = {};
  // ══ 【诊断日志总开关 · 用户 2026-08-30】═══════════════════════════════
  // 原话：「日志还有很多无效信息」。真机 vConsole 里 [diag/env|net|subpkg|video|perf]
  // 每秒刷十几行，把真正要看的 [PD] 操作流冲得完全看不见。
  // 【为什么不是删掉】这些日志排查分包加载失败、视频黑屏时是唯一线索，
  // 删了下次出问题又得重写。改成一个开关：要查性能/视频时置 true。
  // 【只收 log，不收 warn/error】真出错必须永远可见，那才是「有效信息」。
  var DIAG = false;
  function dlog() { if (DIAG) console.log.apply(console, arguments); }

  // ── 布局（设计坐标系 750×1624，与 pd-game 同一套）───────────
  // 参考图的纵向节奏：标题压在卡片上沿、关闭键咬在卡片右上角外侧、
  // 卡片内三行等距、卡片下方一排三键、再下方一个通栏主按钮。
  var LY = {
    titleX: 180, titleY: 470, titleW: 390, titleH: 108,
    cardX: 62, cardY: 556, cardW: 626, cardH: 536,
    closeCX: 644, closeCY: 566, closeR: 44,
    rowX: 100, rowY: 596, rowW: 550, rowH: 140, rowGap: 152,
    icoX: 130, icoS: 72,
    labX: 226,
    tglX: 492, tglW: 130, tglH: 70,
    // ══ 【按钮排居中对齐 · 用户 2026-08-31「主页、跳过的字和按钮偏移了」】══
    // 【实测偏移量】旧值 homeX=60 / skX=564+136=700 → 左边距 60、右边距 50，差 10px。
    //   而同屏其它元素全是严格对称的（标题 180/180、卡片 62/62、继续游戏 175/175），
    //   唯独这一排偏左 —— 对比之下 10px 就很明显了，用户一眼就看出来。
    // 【新值怎么来的】三按钮总宽 136+340+136 = 612，取间隙 16：
    //   边距 = (750 − 612 − 16×2) / 2 = 53 → 左右各 53，完全对称。
    // 【三个 Y 必须一致】旧值 homeY=1120 / reY=1125 / skY=1120 —— 重新开始比两侧低 5px。
    //   三个按钮高度不同（136 / 126 / 136），要视觉齐平应该【按中心线对齐】而不是按顶边：
    //   中心线 = 1120 + 136/2 = 1188 → reY = 1188 − 126/2 = 1125。
    //   所以 1125 其实是对的，保留；这里写明原因，免得以后被当成 bug 改掉。
    homeX: 53, homeY: 1120, homeS: 136,
    reX: 205, reY: 1125, reW: 340, reH: 126,
    skX: 561, skY: 1120, skS: 136,
    goX: 175, goY: 1290, goW: 400, goH: 126,
    tipY: 1452
  };

  var ROWS = [
    { key: 'sound', ico: 'ico_sound', label: '声音' },
    { key: 'vibrate', ico: 'ico_vibrate', label: '震动' },
    { key: 'music', ico: 'ico_music', label: '音乐' }
  ];

  // ── 设置项持久化 ───────────────────────────────────────────
  // 只存三个布尔，走 KwaiStorage 的同步接口（小数据，官方推荐 setSync）。
  // 【为什么不 try 一把梭】读不到要能明确区分「没存过」和「存了 false」：
  // 没存过必须默认开，存了 false 必须保持关。所以用 === undefined/null 判定。
  var SET_KEY = 'pd_settings_v1';
  var st = { sound: true, vibrate: true, music: true };

  function loadSet() {
    try {
      if (!window.KwaiStorage || !KwaiStorage.getSync) return;
      var raw = KwaiStorage.getSync(SET_KEY);
      if (!raw) return;
      var o = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (!o || typeof o !== 'object') return;
      var i, k;
      for (i = 0; i < ROWS.length; i++) {
        k = ROWS[i].key;
        if (o[k] === false) st[k] = false;
        else if (o[k] === true) st[k] = true;
      }
    } catch (e) { console.warn('[home] loadSet', e && e.message); }
  }

  function saveSet() {
    try {
      if (window.KwaiStorage && KwaiStorage.setSync) KwaiStorage.setSync(SET_KEY, st);
    } catch (e) { console.warn('[home] saveSet', e && e.message); }
  }

  // ── ③ 开关生效：音频 / 震动适配层 ──────────────────────────
  // 分类靠 src 字符串：bgm 归 music，其余（sfx_* / voice/*）归 sound。
  // 【为什么按 src 而不是按创建顺序】pd-game 的音效是池化预创建 + 语音是
  // 用完就 destroy 再新建，创建顺序完全不可靠，只有 src 是稳定特征。
  var audios = [];        // { a: 实例, vol: 静音前的原始音量, muted: 0|1 }

  function clsOf(src) {
    src = String(src || '');
    return src.indexOf('bgm') >= 0 ? 'music' : 'sound';
  }

  // 【为什么不用 defineProperty 劫持 src/volume】第一版这么写过，结果自己把
  // volume 接管成了一个纯 JS 字段 → 写进去的值再也到不了容器，音量永久不生效。
  // 现在改成【需要时才读】：要静音就先把当前 volume 存下来再置 0，要取消静音
  // 就把存的值写回去——不改容器对象的任何属性定义，也就不可能弄坏它。
  // src 同理：静音那一刻现场读 a.src 分类，此时 pd-game 早就赋完了。
  function applyAudio() {
    var i, it, want, cur;
    for (i = audios.length - 1; i >= 0; i--) {
      it = audios[i];
      try {
        want = st[clsOf(it.a.src)];        // true = 该响
        if (!want && !it.muted) {
          cur = it.a.volume;
          it.vol = (typeof cur === 'number' && cur > 0) ? cur : it.vol;
          it.a.volume = 0; it.muted = 1;
        } else if (want && it.muted) {
          it.a.volume = it.vol; it.muted = 0;
        }
      } catch (e) { audios.splice(i, 1); }   // 实例已 destroy，清出列表
    }
  }

  function hookAudio() {
    if (typeof ks === 'undefined' || !ks.createInnerAudioContext) return;
    if (ks.__pdHomeAudio) return;            // 防重复包（热重载 / 二次 require）
    var orig = ks.createInnerAudioContext;
    ks.createInnerAudioContext = function () {
      var a = orig.apply(ks, arguments);
      // 只登记，不改它任何属性。分类与静音全部延到 applyAudio 里做，
      // 因为此刻 src 还是空的（pd-game 是先 create 再赋 src）。
      try { audios.push({ a: a, vol: 1, muted: 0 }); } catch (e) {}
      // 新建实例可能诞生在「已经关了声音」之后，要给它补上静音。
      // 延迟到微任务，等 pd-game 把 src / volume 都赋完再判。
      try { setTimeout(applyAudio, 0); } catch (e2) {}
      return a;
    };
    ks.__pdHomeAudio = 1;
  }

  function hookVib() {
    if (typeof ks === 'undefined') return;
    if (ks.__pdHomeVib) return;
    var s = ks.vibrateShort, l = ks.vibrateLong;
    if (s) ks.vibrateShort = function () { if (st.vibrate) return s.apply(ks, arguments); };
    if (l) ks.vibrateLong = function () { if (st.vibrate) return l.apply(ks, arguments); };
    ks.__pdHomeVib = 1;
  }

  // ── 切图加载 ───────────────────────────────────────────────
  // 全部由 tools/gen-home-assets.py（image2）产出，中文字不烘进图，
  // 运行时用 canvas 画 —— 文案要能随时改，且 rsvg/模型都不保证中文字形。
  var IMGS = {};
  var NEED = ['pause_title', 'pause_card', 'row_bg', 'btn_close', 'toggle_on',
    'toggle_off', 'ico_sound', 'ico_vibrate', 'ico_music', 'btn_home',
    'btn_restart', 'btn_resume', 'btn_skip', 'ad_tag'];

  function loadImgs() {
    var i;
    for (i = 0; i < NEED.length; i++) {
      (function (n) {
        try {
          var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
          im.onload = function () { IMGS[n] = im; };
          im.onerror = function () { console.warn('[home] miss assets/ui/home/' + n + '.png'); };
          im.src = 'assets/ui/home/' + n + '.png';
        } catch (e) {}
      })(NEED[i]);
    }
  }

  // ── 绘制小工具（与 pd-game 里的同名函数各自独立，互不影响）──
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // 【对齐修复 · 用户反馈「文字不在按钮的居中对齐位置」】
  // 【根因】这里原本用 textBaseline='alphabetic'（基线对齐）——
  //   基线不是文字的垂直中心，它在字母"底部"附近，所以想让文字视觉居中，
  //   每个调用点都得手动 +17 之类的魔法数去补偿。补偿值是按某个字号试出来的，
  //   字号一变就全错位，而且 pd-game.js 的 txt 用的是 'middle' —— 两个文件
  //   同名函数语义不一致，改起来极易顾此失彼。
  // 【修法】统一成 'middle'（垂直居中），调用点直接传按钮中心 y，
  //   不再需要任何补偿数。下面所有 `+ 17` 已随之删除。
  function txt(g, s, x, y, font, fill, stroke, sw) {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) {
      g.lineWidth = sw || 5; g.strokeStyle = stroke;
      g.lineJoin = 'round'; g.miterLimit = 2;
      g.strokeText(s, x, y);
    }
    g.fillStyle = fill; g.fillText(s, x, y);
  }

  // 有切图就贴切图，没有就画一个同尺寸的兜底形状 —— 绝不留空洞。
  // 【为什么必须有兜底】切图是 14 个独立文件，任何一个 404 都不能让浮层
  // 变成「点了没反应/看不见按钮」，那会被当成死机。
  function pic(g, n, x, y, w, h, fbFill) {
    if (IMGS[n]) { g.drawImage(IMGS[n], x, y, w, h); return true; }
    if (fbFill) {
      rr(g, x, y, w, h, Math.min(w, h) / 2);
      g.fillStyle = fbFill; g.fill();
      g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke();
    }
    return false;
  }

  // ── 命中区（全部按设计坐标）────────────────────────────────
  function rowRect(i) {
    return { x: LY.rowX, y: LY.rowY + i * LY.rowGap, w: LY.rowW, h: LY.rowH };
  }

  function inRect(p, r, pad) {
    pad = pad || 0;
    return p.x >= r.x - pad && p.x <= r.x + r.w + pad &&
           p.y >= r.y - pad && p.y <= r.y + r.h + pad;
  }

  function inCircle(p, cx, cy, r) {
    var dx = p.x - cx, dy = p.y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // ── ② 真暂停：rAF 劫持 + 冻结底图 ──────────────────────────
  var open = false, animT = 0;
  var frozen = null;          // 冻结那一刻的整屏快照
  var cv = null, ctx = null;
  var scale = 1, offX = 0, offY = 0, dpr = 1;

  // 自己算一遍 fit()，不去读 pd-game 的私有变量（那些没导出，也不该依赖）。
  // 公式必须与 pd-game.fit() 完全一致，否则命中区和画面会错位。
  function geom() {
    if (!cv) return;
    var w = window.innerWidth, h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(w / DW, h / DH);
    offX = (w - DW * scale) / 2;
    offY = (h - DH * scale) / 2;
  }

  function toDesign(px, py) {
    return { x: (px - offX) / scale, y: (py - offY) / scale };
  }

  function newCv(w, h) {
    try {
      if (typeof ks !== 'undefined' && ks.createCanvas) {
        var c = ks.createCanvas(); c.width = w; c.height = h; return c;
      }
      if (typeof document !== 'undefined') {
        var c2 = document.createElement('canvas'); c2.width = w; c2.height = h; return c2;
      }
    } catch (e) {}
    return null;
  }

  // 【性能修复 · 用户反馈「点击展开很慢」】
  // 【根因 1 · 每次都新建全屏 canvas】旧写法每点开一次就 newCv(cv.width, cv.height)
  //   造一张新画布。真机上分配一张 750×1624×dpr 的 GPU 纹理是重操作（几十 ms），
  //   而且旧的那张要等 GC —— 反复开关会持续抖。
  //   改法：把画布缓存在 snapCv 里【复用】，尺寸没变就只重画内容不重新分配。
  // 【根因 2 · 全分辨率拷贝】这张快照的唯一用途是当【模糊压暗的背景板】
  //   （见 paint 里那句 drawImage + 半透明黑遮罩）。背景板根本不需要清晰，
  //   却按 100% 分辨率逐像素拷了一整屏。改成 50% 采样后再放大回去 ——
  //   像素量降到 1/4，观感上因为本来就压暗+被面板盖住，肉眼看不出差别。
  var snapCv = null, snapW = 0, snapH = 0;
  var SNAP_SCALE = 0.5;   // 快照采样比例。只做背景板，不需要全清晰。
  function grabFrozen() {
    frozen = null;
    if (!cv || !cv.width) return;
    try {
      var w = Math.max(1, Math.round(cv.width * SNAP_SCALE));
      var h = Math.max(1, Math.round(cv.height * SNAP_SCALE));
      // 尺寸没变就复用同一张画布（横竖屏切换 / dpr 变化时才重新分配）
      if (!snapCv || snapW !== w || snapH !== h) {
        snapCv = newCv(w, h);
        if (!snapCv) return;
        snapW = w; snapH = h;
      }
      var sg = snapCv.getContext('2d');
      // 复用画布必须先清，否则上一次的残影会从半透明区域透出来
      sg.clearRect(0, 0, w, h);
      sg.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, w, h);
      frozen = snapCv;
    } catch (e) { console.warn('[home] grab', e && e.message); }
  }

  function hookRAF() {
    if (window.__pdHomeRAF) return;
    var orig = window.requestAnimationFrame;
    if (!orig) return;
    orig = orig.bind ? orig.bind(window) : orig;
    window.requestAnimationFrame = function (f) {
      return orig(function (ts) {
        // 浮层开着 → 不调游戏 loop（= 逻辑与渲染全冻结），
        // 并且必须由我们自己接上 rAF 链，否则关掉浮层就永久黑屏不动。
        if (open) {
          try { paint(ts); } catch (e) { console.error('[home paint]', e && e.message); }
          window.requestAnimationFrame(f);
          return;
        }
        f(ts);      // 正常态：游戏自己会再 rAF 一次（同样被我们包住），链只有一条
      });
    };
    window.__pdHomeRAF = 1;
  }

  var lastTs = 0;

  function paint(ts) {
    if (!cv) cv = window.canvas || (typeof document !== 'undefined' && document.getElementById('game'));
    if (!cv) return;
    if (!ctx) ctx = cv.getContext('2d');
    var g = ctx;
    var dt = lastTs ? Math.min(48, ts - lastTs) : 16;
    lastTs = ts;
    animT = Math.min(1, animT + dt / 190);            // 入场动画 190ms
    geom();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 冻结底图：每帧重贴，遮罩才不会一帧一帧叠加变全黑
    if (frozen) g.drawImage(frozen, 0, 0, cv.width / dpr, cv.height / dpr);
    else { g.fillStyle = '#14111A'; g.fillRect(0, 0, cv.width / dpr, cv.height / dpr); }
    g.save();
    g.translate(offX, offY); g.scale(scale, scale);
    g.beginPath(); g.rect(0, 0, DW, DH); g.clip();
    drawPanel(g);
    g.restore();
  }

  function ease(t) { var c = 1.6, p = t - 1; return 1 + (c + 1) * p * p * p + c * p * p; }

  function drawPanel(g) {
    var a = ease(animT), i;
    // 遮罩跟着入场淡入；不能用不透明色 —— 全屏不透明 fillRect 会盖死
    // ks.createVideo 的 native 层（私房态的已知坑），这里保持半透明更安全。
    g.fillStyle = 'rgba(10,8,16,' + (0.6 * animT).toFixed(3) + ')';
    g.fillRect(0, 0, DW, DH);
    // 整体从 0.86 弹到 1.0，绕卡片中心缩放
    var pcx = LY.cardX + LY.cardW / 2, pcy = LY.cardY + LY.cardH / 2;
    var s = 0.86 + 0.14 * a;
    g.save();
    g.translate(pcx, pcy); g.scale(s, s); g.translate(-pcx, -pcy);
    g.globalAlpha = animT;

    pic(g, 'pause_card', LY.cardX, LY.cardY, LY.cardW, LY.cardH, '#FFFFFF');
    pic(g, 'pause_title', LY.titleX, LY.titleY, LY.titleW, LY.titleH, '#5C6AD8');
    txt(g, '暂停', LY.titleX + LY.titleW / 2, LY.titleY + LY.titleH / 2,
        'bold 52px sans-serif', '#FFFFFF', 'rgba(40,32,90,.45)', 7);

    for (i = 0; i < ROWS.length; i++) {
      var r = rowRect(i), row = ROWS[i];
      pic(g, 'row_bg', r.x, r.y, r.w, r.h, '#F6F5FC');
      pic(g, row.ico, LY.icoX, r.y + (r.h - LY.icoS) / 2, LY.icoS, LY.icoS, null);
      g.textAlign = 'left';
      g.font = 'bold 42px sans-serif';
      g.fillStyle = '#4A4763';
      g.fillText(row.label, LY.labX, r.y + r.h / 2 + 15);
      g.textAlign = 'center';
      pic(g, st[row.key] ? 'toggle_on' : 'toggle_off',
          LY.tglX, r.y + (r.h - LY.tglH) / 2, LY.tglW, LY.tglH,
          st[row.key] ? '#22B96D' : '#C7C4D6');
    }

    pic(g, 'btn_close', LY.closeCX - LY.closeR, LY.closeCY - LY.closeR,
        LY.closeR * 2, LY.closeR * 2, '#E03B33');

    // ── 卡片下方按钮排 ──
    pic(g, 'btn_home', LY.homeX, LY.homeY, LY.homeS, LY.homeS, '#E08A1B');
    // 【文字基线 · 用户 2026-08-31「主页、跳过的字偏移了」】
    // 旧写法 y = 顶边 + S − 6，即按钮最底边往上仅 6px。textBaseline 是 middle，
    // 所以 26px 字的下半截（13px）会越过圆形按钮下沿跑到外面 —— 字看起来是「掉出来」的。
    // 改为 S − 20：字心上移 14px，整个字稳稳落在圆形实体内。
    txt(g, '主页', LY.homeX + LY.homeS / 2, LY.homeY + LY.homeS - 20,
        'bold 26px sans-serif', '#FFFFFF', 'rgba(0,0,0,.42)', 5);

    pic(g, 'btn_restart', LY.reX, LY.reY, LY.reW, LY.reH, '#3AA84A');
    txt(g, '重新开始', LY.reX + LY.reW / 2, LY.reY + LY.reH / 2,
        'bold 46px sans-serif', '#FFFFFF', 'rgba(0,0,0,.42)', 6);

    pic(g, 'btn_skip', LY.skX, LY.skY, LY.skS, LY.skS, '#D24BA6');
    txt(g, '跳过', LY.skX + LY.skS / 2, LY.skY + LY.skS - 20,
        'bold 26px sans-serif', '#FFFFFF', 'rgba(0,0,0,.42)', 5);
    // ── 看广告角标 ──
    // 【用户 2026-08-31「那个看广告的角标 变形了 请你优化尺寸」】
    // 【查证素材】ad_tag.png 原生 56×40，比例 1.400；旧代码也传 56×40 —— 比例本身没错，
    //   所以不是拉伸变形，而是【太大 + 挂在按钮外面】导致的观感：
    //   旧位置 x = skX+skS−44、y = skY−12 → 角标右边缘超出按钮右沿 12px，
    //   且大半悬在圆形按钮之外的空白处，孤零零一块，看着就像被拉歪了。
    // 【修法】等比缩到 42×30（42/30 = 1.400，与原图完全同比，绝不可能变形），
    //   并内收贴到圆形按钮右上角，让主体压在按钮上 —— 这才是角标该有的附着感。
    var TAG_W = 42, TAG_H = 30;
    pic(g, 'ad_tag', LY.skX + LY.skS - TAG_W - 4, LY.skY - 4, TAG_W, TAG_H, '#25A244');

    pic(g, 'btn_resume', LY.goX, LY.goY, LY.goW, LY.goH, '#28B5B0');
    txt(g, '继续游戏', LY.goX + LY.goW / 2, LY.goY + LY.goH / 2,
        'bold 46px sans-serif', '#FFFFFF', 'rgba(0,0,0,.42)', 6);

    g.restore();

    // ── 底部存档提示（对齐参考图那行小字）──
    // 不进缩放组，避免动画期间字被拉变形。
    g.globalAlpha = animT;
    txt(g, '提示：设置会自动保存，关掉小游戏也不会丢',
        DW / 2, LY.tipY, '26px sans-serif', 'rgba(255,255,255,.9)', 'rgba(0,0,0,.5)', 5);
    g.globalAlpha = 1;
  }

  // ── 开 / 关 ────────────────────────────────────────────────
  H.isOpen = function () { return open; };

  H.open = function () {
    if (open) return;
    cv = window.canvas || (typeof document !== 'undefined' && document.getElementById('game'));
    if (cv && !ctx) { try { ctx = cv.getContext('2d'); } catch (e) {} }
    geom();
    grabFrozen();          // 必须在冻结前抓：此刻 canvas 上还是完整的游戏画面
    open = true; animT = 0; lastTs = 0;
    if (st.vibrate) vibRaw('light');
  };

  H.close = function () {
    if (!open) return;
    open = false; frozen = null;
    if (st.vibrate) vibRaw('light');
  };

  // 震动直发（不经 hookVib 的开关闸门）—— 浮层自身的点击反馈必须有，
  // 否则用户在「震动=关」时点开关会觉得按钮失灵。这里由调用方自己判 st.vibrate。
  function vibRaw(t) {
    try {
      if (typeof ks !== 'undefined') {
        var f = ks.__pdHomeVibRaw;
        if (f) { f({ type: t }); return; }
        if (ks.vibrateShort) { ks.vibrateShort({ type: t }); return; }
      }
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) {}
  }

  // ── ① 输入劫持 ─────────────────────────────────────────────
  // 返回 true = 本次触摸被浮层吃掉，不要再传给 pd-game。
  H.onDown = function (px, py) {
    geom();
    var p = toDesign(px, py), i;

    if (!open) {
      // 左上角齿轮：pd-game 的判定是 (x<=104 && y<=104)，这里必须【完全一致】，
      // 否则会出现「我这边没吃掉、它那边也没接住」的死角，或者两边都响应。
      if (p.x <= 104 && p.y <= 104) { H.open(); return true; }
      return false;
    }

    if (animT < 0.35) return true;   // 入场动画期间只吃事件不响应，防误触

    function tap() { if (st.vibrate) vibRaw('light'); }

    // 关闭键：命中框比视觉半径放大一圈（参考图里它咬在卡片角上，手指容易差几 px）
    if (inCircle(p, LY.closeCX, LY.closeCY, LY.closeR * 1.45)) {
      tap(); H.close(); return true;
    }

    // 三个开关行：整行可点（不是只有开关本体），手感更好
    for (i = 0; i < ROWS.length; i++) {
      if (inRect(p, rowRect(i), 6)) {
        var k = ROWS[i].key;
        st[k] = !st[k];
        saveSet();
        applyAudio();
        // 【顺序重要】先 applyAudio 再震，且震动要看【新】状态：
        // 把震动从开关掉时不应该再震（否则像没关掉），
        // 从关开到开时应该震一下当作「已生效」的即时反馈。
        if (st.vibrate) vibRaw('light');
        return true;
      }
    }

    // 主页
    if (inCircle(p, LY.homeX + LY.homeS / 2, LY.homeY + LY.homeS / 2, LY.homeS / 2)) {
      tap();
      H.close();
      // 主页还没上线 → 交回 pd-game 的 toast 通道（它才有 S.tip 的渲染）。
      // 【为什么不自己画 toast】浮层已关，我们不再持有帧；自己画会立刻被
      // 游戏的下一帧覆盖掉，用户什么都看不到。
      if (M3.Game && M3.Game.toast) M3.Game.toast('主页还没上线呢，别急~');
      return true;
    }

    // 重新开始：【回到第 1 关】从头玩一遍。
    // 【为什么改】旧实现调 newGame(false) = 只重开本关，玩家在第 9 关点它
    //   还是第 9 关 —— 与「重新开始」的字面语义完全不符（用户明确反馈）。
    // 【为什么不在这里直接改 lvNo】关卡号/主播序号/累计星数都是 pd-game 闭包内的
    //   私有变量，浮层拿不到也不该拿。统一走它导出的 restartFromLv1()，
    //   由它负责三个字段一起归零 + 原子落盘，避免出现「第1关却是第9位主播」。
    // 【兜底】老版本 pd-game 没有这个方法时回落到 newGame(false)，
    //   宁可退化成「重开本关」，也不能点了没反应。
    if (inRect(p, { x: LY.reX, y: LY.reY, w: LY.reW, h: LY.reH })) {
      tap(); H.close();
      if (M3.Game && M3.Game.restartFromLv1) M3.Game.restartFromLv1();
      else if (M3.Game && M3.Game.newGame) M3.Game.newGame(false);
      return true;
    }

    // 跳过：激励视频 → 直接进下一关
    if (inCircle(p, LY.skX + LY.skS / 2, LY.skY + LY.skS / 2, LY.skS / 2)) {
      tap();
      // 【必须先关浮层再拉广告】浮层是暂停态、rAF 被我们接管，
      // 广告的 loading 遮罩是 pd-game 在自己帧里画的，不交还帧就永远看不见。
      H.close();
      var go = function () {
        if (M3.Game && M3.Game.newGame) M3.Game.newGame(true);
      };
      if (M3.Game && M3.Game.rewardAd) M3.Game.rewardAd('skipLevel', go);
      else if (window.KwaiAd && KwaiAd.showRewarded && typeof ks !== 'undefined') {
        KwaiAd.showRewarded(go, function () {});
      } else go();
      return true;
    }

    // 继续游戏
    if (inRect(p, { x: LY.goX, y: LY.goY, w: LY.goW, h: LY.goH })) {
      tap(); H.close(); return true;
    }

    // 卡片/按钮之外的空白：点了也当关闭（休闲游戏的通用预期）
    return true;
  };

  function hookTouch() {
    if (typeof ks !== 'undefined' && ks.onTouchStart) {
      if (ks.__pdHomeTouch) return;
      var oS = ks.onTouchStart, oM = ks.onTouchMove, oE = ks.onTouchEnd;
      function pos(e) {
        var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        return { x: t.clientX !== undefined ? t.clientX : t.x,
                 y: t.clientY !== undefined ? t.clientY : t.y };
      }
      ks.onTouchStart = function (cb) {
        return oS.call(ks, function (e) {
          var p = pos(e);
          if (H.onDown(p.x, p.y)) return;      // 被浮层吃掉
          cb(e);
        });
      };
      ks.onTouchMove = function (cb) {
        return oM.call(ks, function (e) { if (open) return; cb(e); });
      };
      ks.onTouchEnd = function (cb) {
        return oE.call(ks, function (e) { if (open) return; cb(e); });
      };
      // 留一条不受震动开关影响的直发通道给浮层自己用
      if (ks.vibrateShort) ks.__pdHomeVibRaw = ks.vibrateShort;
      ks.__pdHomeTouch = 1;
      return;
    }
    // 浏览器预览：pd-game 用的是 window 冒泡监听，我们挂 capture 抢在它之前。
    if (!window.addEventListener || window.__pdHomeDom) return;
    function dom(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      var x = t.clientX !== undefined ? t.clientX : t.x;
      var y = t.clientY !== undefined ? t.clientY : t.y;
      if (e.type === 'touchstart' || e.type === 'mousedown') {
        if (H.onDown(x, y)) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
        return;
      }
      if (open) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
    }
    var names = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup'];
    for (var i = 0; i < names.length; i++) {
      window.addEventListener(names[i], dom, true);
    }
    window.__pdHomeDom = 1;
  }

  // ══════════════════════════════════════════════════════════════
  //  诊断日志区（私房视频播放失败 / 卡顿定位）
  //  【为什么写在这里而不是 pd-game.js】pd-game.js 是禁区（用户在大改）。
  //  视频、子包、网络全是 ks.* 平台 API，同样可以在外面包壳拿到全部时序，
  //  一行不碰 pd-game.js 也能把「卡在哪一步、错在哪一帧」全打出来。
  // ══════════════════════════════════════════════════════════════

  function ts() {                     // 统一时间戳，方便把多条日志按时序串起来
    return '+' + (Date.now() - T0) + 'ms';
  }
  var T0 = Date.now();

  // ── 环境快照：出问题第一件事是确认"在什么机器/什么网上跑" ──────
  function logEnv() {
    var o = { ver: (M3 && M3.BUILD_VER) || '?' };
    try {
      o.screen = window.innerWidth + 'x' + window.innerHeight +
                 ' dpr=' + (window.devicePixelRatio || 1);
    } catch (e) {}
    try {
      if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
        var s = ks.getSystemInfoSync();
        o.dev = s.brand + '/' + s.model;
        o.sys = s.system;
        o.host = s.version;                       // 快手 App 版本
        o.mem = s.memorySize || '?';              // 低端机内存小 → 视频解码更容易被杀
        o.benchmark = s.benchmarkLevel;           // 快手给的性能分，负数=未知
      }
    } catch (e2) {}
    dlog('[diag/env]', JSON.stringify(o));
    // 网络类型异步，单独打。弱网是"起播超时"的第一嫌疑人。
    try {
      if (typeof ks !== 'undefined' && ks.getNetworkType) {
        ks.getNetworkType({
          success: function (r) {
            dlog('[diag/net] type=' + r.networkType +
                        ' signal=' + (r.signalStrength === undefined ? '?' : r.signalStrength));
          }
        });
      }
    } catch (e3) {}
  }

  // ── 子包下载：私房视频在 boudoir 子包里，下载失败 = 视频必 404 ──
  function hookSubpkg() {
    if (typeof ks === 'undefined' || !ks.loadSubpackage) return;
    if (ks.__pdDiagSub) return;
    var orig = ks.loadSubpackage;
    ks.__pdDiagSub = 1;
    ks.loadSubpackage = function (opt) {
      opt = opt || {};
      var name = opt.name, t = Date.now(), uS = opt.success, uF = opt.fail;
      dlog('[diag/subpkg] start name=' + name + ' ' + ts());
      opt.success = function (r) {
        dlog('[diag/subpkg] SUCCESS name=' + name +
                    ' 耗时=' + (Date.now() - t) + 'ms ' + ts());
        uS && uS(r);
      };
      opt.fail = function (e) {
        // 【最常见根因】errMsg 里会明确写是「子包不存在」还是「网络失败」，
        // 前者是打包漏了（subPackages 配置 / 目录名不符），后者是弱网。
        console.error('[diag/subpkg] FAIL name=' + name +
                      ' 耗时=' + (Date.now() - t) + 'ms msg=' +
                      ((e && (e.errMsg || e.errorMsg)) || JSON.stringify(e)) + ' ' + ts());
        uF && uF(e);
      };
      var task = orig.call(ks, opt);
      // 下载进度：卡在 30% 不动 = 网络问题；一直 0% = 根本没连上
      try {
        if (task && task.onProgressUpdate) {
          task.onProgressUpdate(function (p) {
            dlog('[diag/subpkg] ' + name + ' ' + p.progress + '% ' +
                        p.totalBytesWritten + '/' + p.totalBytesExpectedToWrite);
          });
        }
      } catch (e4) {}
      return task;
    };
  }

  // ── 视频：把整条生命周期全量打点 ────────────────────────────
  // 【卡顿量化】onWaiting=开始缓冲、onPlay/onTimeUpdate=恢复播放，
  // 两者配对就能算出"每次卡了多少 ms、一共卡了几次"，这是判断
  // 「是网慢还是解码慢」的关键数据：
  //   卡顿次数多但每次短 → 码率高/网络抖动
  //   一次卡死不恢复     → 解码失败或文件损坏
  function hookVideo() {
    if (typeof ks === 'undefined' || !ks.createVideo) {
      console.warn('[diag/video] 当前环境无 ks.createVideo（浏览器预览？）');
      return;
    }
    if (ks.__pdDiagVideo) return;
    var orig = ks.createVideo;
    ks.__pdDiagVideo = 1;
    ks.createVideo = function (cfg) {
      cfg = cfg || {};
      var tCreate = Date.now();
      var stall = { n: 0, total: 0, at: 0 };   // 卡顿累计
      var firstPlay = 0, lastTU = 0, lastPos = -1;

      // ① create 参数全量 dump —— 几何算错(黑框/0×0)在这一行就能看出来
      dlog('[diag/video] createVideo ' + ts() + ' cfg=' + JSON.stringify({
        src: cfg.src, x: cfg.x, y: cfg.y, w: cfg.width, h: cfg.height,
        objectFit: cfg.objectFit, autoplay: cfg.autoplay, loop: cfg.loop,
        poster: cfg.poster ? '有' : '无'
      }));
      // 几何自检：0/NaN/负数/超出屏幕 都会表现为"看不到视频"
      try {
        var W = window.innerWidth, Hh = window.innerHeight;
        var bad = [];
        if (!cfg.width || !cfg.height) bad.push('宽高为0');
        if (isNaN(cfg.x) || isNaN(cfg.y)) bad.push('xy是NaN');
        if (cfg.x < 0 || cfg.y < 0) bad.push('xy负数');
        if (cfg.x + cfg.width > W + 1 || cfg.y + cfg.height > Hh + 1) {
          bad.push('溢出屏幕(屏=' + W + 'x' + Hh + ')');
        }
        if (bad.length) {
          console.error('[diag/video] ✗ 几何异常: ' + bad.join(' / ') +
                        ' → 现象通常是"看不到视频"或"黑框跑偏"');
        } else {
          dlog('[diag/video] ✓ 几何合法 屏=' + W + 'x' + Hh);
        }
      } catch (e) {}

      var v = orig.call(ks, cfg);

      function bind(name, fn) {
        try { if (v && v[name]) v[name](fn); } catch (e2) {}
      }
      bind('onPlay', function () {
        if (!firstPlay) {
          firstPlay = Date.now();
          dlog('[diag/video] ▶ 首次起播 耗时=' +
                      (firstPlay - tCreate) + 'ms ' + ts());
        } else {
          if (stall.at) {                       // 从缓冲中恢复
            var d = Date.now() - stall.at;
            stall.total += d; stall.at = 0;
            console.warn('[diag/video] ⏵ 缓冲结束 本次卡顿=' + d +
                         'ms 累计=' + stall.total + 'ms 次数=' + stall.n);
          } else {
            dlog('[diag/video] ▶ play ' + ts());
          }
        }
      });
      bind('onWaiting', function () {
        stall.n++; stall.at = Date.now();
        console.warn('[diag/video] ⏸ 开始缓冲(第' + stall.n + '次) pos=' +
                     lastPos.toFixed(2) + 's ' + ts());
      });
      bind('onPause', function () {
        dlog('[diag/video] ⏸ pause pos=' + lastPos.toFixed(2) + 's ' + ts());
      });
      bind('onEnded', function () {
        dlog('[diag/video] ⏹ ended 累计卡顿=' + stall.total +
                    'ms/' + stall.n + '次 ' + ts());
      });
      bind('onError', function (e3) {
        // 【关键】errMsg 决定性质：
        //   含 404/not found → 子包没下好或路径写错
        //   含 decode/format → 编码不被支持（必须 h264 baseline/main + yuv420p）
        //   含 network       → 弱网中断
        var msg = (e3 && (e3.errMsg || e3.errorMsg)) || JSON.stringify(e3);
        console.error('[diag/video] ✗ ERROR ' + ts() +
                      ' src=' + cfg.src +
                      ' 起播=' + (firstPlay ? '已起播' : '从未起播') +
                      ' pos=' + lastPos.toFixed(2) + 's msg=' + msg);
      });
      bind('onTimeUpdate', function (e4) {
        var p = (e4 && e4.position) || 0;
        lastPos = p;
        var now = Date.now();
        // 每 2s 打一次心跳，别刷屏；同时检测"时间不前进"= 假播放
        if (now - lastTU > 2000) {
          dlog('[diag/video] ♪ pos=' + p.toFixed(2) + 's/' +
                      ((e4 && e4.duration) || 0).toFixed(2) + 's ' +
                      '卡顿累计=' + stall.total + 'ms/' + stall.n + '次');
          lastTU = now;
        }
      });
      bind('onProgress', function (e5) {
        try {
          dlog('[diag/video] ⇩ 缓冲进度 ' + (e5 && e5.buffered) + '%');
        } catch (e6) {}
      });

      // ② 起播看门狗：分档报，让"到底卡在哪"一目了然
      var wd = [1000, 3000, 6000, 10000], i;
      for (i = 0; i < wd.length; i++) {
        (function (ms) {
          setTimeout(function () {
            if (!firstPlay) {
              console.warn('[diag/video] ⏳ 创建后 ' + ms +
                           'ms 仍未起播（onPlay 未触发）src=' + cfg.src);
            }
          }, ms);
        })(wd[i]);
      }
      return v;
    };
  }

  // ── 帧率监控：量化"卡顿"到底是掉帧还是视频缓冲 ────────────────
  // 【为什么独立跑一条 rAF】它只读时间不画东西，开销可忽略；
  // 而且和游戏 loop 解耦 —— 游戏 loop 卡住时这条也能照常报出来。
  // 【默认关闭 · 用户 2026-08-30「日志还有很多无效信息」】
  // 真机 vConsole 里 [diag/perf] 每秒能刷十几行长帧告警，把 [PD] 操作日志
  // 冲得完全看不见 —— 而用户要的恰恰是操作流。
  // 性能问题要查时改成 true 即可，代码原样保留不删。
  var DIAG_PERF = false;
  function hookPerf() {
    if (!DIAG_PERF) return;
    var last = 0, frames = 0, longFrames = 0, worst = 0, tWin = 0;
    var raf = window.requestAnimationFrame;
    if (!raf) return;
    function tick(now) {
      if (last) {
        var dt = now - last;
        frames++;
        // >33ms 视为掉帧（低于 30fps），>100ms 是肉眼可见的顿卡
        if (dt > 33) longFrames++;
        if (dt > worst) worst = dt;
        if (dt > 100) {
          console.warn('[diag/perf] ⚠ 长帧 ' + Math.round(dt) + 'ms' +
                       (H.isOpen && H.isOpen() ? '（暂停浮层开着，属正常）' : ''));
        }
      }
      last = now;
      if (now - tWin >= 5000) {                 // 每 5s 汇报一次
        if (frames) {
          dlog('[diag/perf] fps≈' + Math.round(frames / ((now - tWin) / 1000)) +
                      ' 掉帧=' + longFrames + '/' + frames +
                      ' 最差帧=' + Math.round(worst) + 'ms');
        }
        frames = 0; longFrames = 0; worst = 0; tWin = now;
      }
      raf(tick);
    }
    raf(tick);
  }

  // ── 初始化：必须在 G.start() 之前把三个壳包好 ───────────────
  H.init = function () {
    if (H.__ready) return;
    H.__ready = 1;
    loadSet();
    hookAudio();
    hookVib();
    hookTouch();
    hookRAF();
    // 诊断壳也必须在 G.start 之前包好，否则 pd-game 先调 createVideo
    // 就拿到原始函数，一条日志都收不到。
    logEnv();
    hookSubpkg();
    hookVideo();
    hookPerf();
    loadImgs();
    // 已存在的音频实例（理论上此刻还没有，但热重载时可能有）也同步一次
    applyAudio();
    console.log('[home] pause overlay ready, set=' +
                JSON.stringify(st));
  };

  H.init();
})();
