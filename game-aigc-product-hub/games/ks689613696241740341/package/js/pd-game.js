/**
 * 快来帮帮我 · 渲染 + 交互 + 音效（对齐参考图视觉）
 * 参考图学习点：
 *   - 豆子 = 圆角方块 + 底部两条小腿 + 顶面高光（拼豆特征，不是圆球）
 *   - 车 = 俯视 3D，入位后车门向两侧张开（装载态），车顶大数字带黑描边
 *   - 背景 = 斜向对角分割（浅/ 深两色块）
 *   - 队列 = 两排，第一排实心可拖，第二排半透明；拖走后自动补位（带补位动效）
 *   - 拖拽 = 有轨迹残影 + 安全区限制
 *   - 通关 = 彩虹拱门 + 3 星（中间大）+ 蓝缎带 + 白框成品图 + 主页/下一关/分享
 * 遵循 frontend-impl.md：F1/F3/F4/F5/F6/F7 + P1/P6
 * ES5 ONLY
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var PD = M3.PD;
  var G = M3.Game = {};

  var DW = PD.DW, DH = PD.DH, L = PD.L, C = PD.COLORS, SAFE = PD.SAFE;
  var cv, ctx, dpr = 1, scale = 1, offX = 0, offY = 0;
  var bgCache = null;
  // 【豆阵离屏缓存】阵内静止豆整片烘一张图，每帧只 1 次 drawImage。
  // 置 null = 下一帧重建。必须在「豆消失 / 豆起步 / 换关 / atlas 加载完」时置 null。
  var beanCache = null;
  // 【全场景离屏缓存】模糊立绘 + 清晰立绘(alpha) + 压暗 + 顶栏渐变 + bgCache 五层
  // 一次性烘成一张图。每帧 3 次全屏 drawImage（≈366 万 px alpha 混合）→ 1 次。
  // sceneRP 记录烘制时的 revealP()，跨过 0.02 台阶才重建（整关约 15 次）。
  var sceneCache = null, sceneRP = -1;
  var portrait = null, portraitOK = false;
  // ── 3D 渲染 atlas（离线 AI 出白模 → HSV 派生 7 色 → 横排 sprite sheet）──
  // 索引顺序必须与 PD.COLOR_KEYS 一致；未加载完成时自动回落程序化绘制，不阻塞首帧
  var ATL = {
    car:  { img: null, ok: false, cw: 224, ch: 320 },
    // 【用户要求 6 · 豆人重烘焙】64×80 → 64×64 正方形。
    // 这一步是「拼满无缝」的【几何前提】：blit 走 contain fit，
    //   k = min(w/cw, h/ch)。帧是 64×80 时 k 由高度决定，渲染出来
    //   宽 0.8sz × 高 1.0sz —— 宽高比与方格(1:1)不符，横向必然留缝、
    //   纵向必然重叠，无论怎么调 drawBean 的倍率都不可能对齐。
    // 改成 64×64 后 k = sz/64，渲染尺寸恰好 = 一个格子，边到边严丝合缝。
    bean: { img: null, ok: false, cw: 64,  ch: 64 },
    // ── 【走路帧 · 方案一】assets/img/bean_walk.png ────────────────────
    // 【为什么要第二套帧 · 几何根因】上面那套 64×64 是为「豆阵严丝合缝」服务的，
    //   铺满整格 = 一颗豆的底部必然被【正下方那颗豆的头顶】完全遮住。
    //   所以只要豆还在阵列里，无论用透明挖空还是暗部塑形，腿都不可能被看见
    //   （A/B/C 三候选已实测验证：暗部塑腿读成方形污渍，透明挖空只剩小豁口）。
    //   这不是画法问题，是遮挡问题 —— 单套帧无解。
    // 【方案一】按状态分帧：躺在阵列里用 64×64 方块（保无缝），
    //   被吸走/走向汽车时用 64×96 长腿帧（此时四周全是空白，腿完全可见）。
    //   而且「走路时才长腿」本身就是合理的动画语义，还白赚一个摆腿动效。
    // 【布局】宽 = 7 色 × 64，高 = 4 帧 × 96（行 = 动画帧，列 = 颜色）。
    //   身体是上 64px，与 bean 帧【逐像素等价】（同一份绘制代码），
    //   所以吸起瞬间切帧不会看到任何跳变；下 32px 是腿。
    walk: { img: null, ok: false, cw: 64,  ch: 96, n: 4, body: 64 }
  };
  var CKEY = PD.COLOR_KEYS;
  // ── 【新手引导手势雪碧图】assets/ui/guide/hand-sprite.png ──────────────
  // 【为什么要接】素材早就出好了（3654×132，21 帧 174×132，35KB），但代码里
  // drawGuide 一直在用 canvas 手画的白掌 —— 素材是【零引用死文件】，白占包体。
  // 规格取自同目录 hand-sprite.json：
  //   frames=21, frameW=174, frameH=132, durationMs=100
  //   指尖锚点约在单帧的 (0.30w, 0.16h) —— 把它对齐到目标热点即可。
  // 加载失败自动回落 drawHandVec（原 canvas 画法），绝不因缺图而没有引导。
  var HAND = { img: null, ok: false, n: 21, cw: 174, ch: 132, ms: 50,
               ax: 0.30, ay: 0.16 };
  // 【用户要求「播放太慢，改为当前的 2 倍」】durationMs 100 → 50。
  // 注意 ms 是【每帧驻留时长】，所以帧率 ×2 = ms ÷2。21 帧一轮从 2.1s → 1.05s。
  // json 里的 durationMs 保持 100 不动 —— 那是素材的标定值（出图时的基准），
  // 播放速度是【表现层参数】，属于代码侧决策，不该回写进素材元数据。
  function loadHand() {
    try {
      var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
      im.onload = function () { HAND.img = im; HAND.ok = true; };
      im.onerror = function () { console.warn('[hand] sprite 加载失败 → 回落矢量手'); };
      im.src = 'assets/ui/guide/hand-sprite.png';
    } catch (e) { console.warn('[hand]', e && e.message); }
  }
  // ── 【引导文案艺术字贴图】assets/ui/guide/guide_l1.png / guide_l2.png ──────
  // 【用户要求】「引导的文案 要用艺术字 提前生成好用贴图的方案放上去展示」
  // 由 tools/gen-guide-text.py 用 PIL 本地绘制（暖黄渐变字面 + 白内描边 +
  // 深紫外描边 + 硬投影），@2x 出图，代码按 design 尺寸 blit。
  // 【为什么不用 AI 出图】中文字形是 gpt-image-2 的死穴（缺笔画/错字/字距失控），
  // 引导文案是玩家第一眼看到的东西，错一个字就是灾难。PIL 走系统字体，绝不会错字。
  // 【尺寸来自 guide-text.json 的 design 字段，改文案重跑脚本后必须同步这两组数】
  var GTXT = {
    l1: { img: null, ok: false, w: 561, h: 81, src: 'assets/ui/guide/guide_l1.png' },
    l2: { img: null, ok: false, w: 458, h: 69, src: 'assets/ui/guide/guide_l2.png' }
  };
  function loadGuideText() {
    var k;
    for (k in GTXT) {
      if (!GTXT.hasOwnProperty(k)) continue;
      (function (slot) {
        try {
          var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
          im.onload = function () { slot.img = im; slot.ok = true; };
          im.onerror = function () { console.warn('[gtxt] miss ' + slot.src + ' → 回落系统字'); };
          im.src = slot.src;
        } catch (e) { console.warn('[gtxt]', e && e.message); }
      })(GTXT[k]);
    }
  }
  // ── 【车位星芒迸发序列帧】assets/ui/fx/puff_sprite.png ────────────────
  // 【用户校准 2026-08-29】「不是让你跟着车动，是在车装满那一瞬间，
  //   在车位那个地方，快速展示一个序列帧动画，星星散开的感觉」
  // 【上一版错在哪（别再改回去）】把 puffT 挂在离场车身上 → 特效跟着车一路跑，
  //   车都开到屏幕边了星芒还黏在屁股后面，又丑又读不懂。
  //   正确语义：星芒是【「装满」这个事件的原地爆点】，锚在车位中心，
  //   与车的后续离场动画完全解耦 —— 车走它的，星芒在原地散开然后消失。
  // 【素材抠图铁律】源 GIF **没有 alpha 通道**（实测 79524 px 全 alpha=255，
  //   白色是实心白底）。直接用就是一块白方块糊在画面上。
  //   已用 luminance key（a = 255 − min(R,G,B)）+ unpremultiply-over-white
  //   抠成透明，边缘无白边、星芒纯饱和黄。见 tools/gen-puff-sprite.py。
  // 【时长 · 用户 2026-08-30「播的太慢了 应该 1 秒快速播完消失」】
  //   8 帧 × 100ms = 800ms 名义上没超 1 秒，但尾段 38% 的行程都在淡出（k>0.62 才开始降 alpha），
  //   实际观感是「散开后还挂着半透明的一坨慢慢消失」→ 用户读到的就是慢。
  //   改 55ms/帧 = 440ms 播完，并把淡出起点提前到 k>0.45 —— 后半程一边散一边快速透明，
  //   总观感落在 0.45 秒，是「啪」一下的爆点而不是一团慢慢化开的雾。
  //   【绝不乘 mul()】加速道具只给豆子走路提速，特效跟着变就一闪而过看不清。
  var PUFF = { img: null, ok: false, n: 8, cw: 120, ch: 120, ms: 55 };
  // 活跃的爆点列表：{ x, y, t }。播完即从数组移除，天然不循环、不泄漏。
  var puffs = [];
  function loadPuff() {
    try {
      var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
      im.onload = function () { PUFF.img = im; PUFF.ok = true; };
      im.onerror = function () { console.warn('[puff] sprite 加载失败 → 无星芒，不影响玩法'); };
      im.src = 'assets/ui/fx/puff_sprite.png';
    } catch (e) { console.warn('[puff]', e && e.message); }
  }
  // 在车位中心埋一个爆点。si = 车位下标（0..5）
  function spawnPuff(si) {
    if (!PUFF.ok) return;
    var r = slotRect(si);
    puffs.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, t: 0 });
  }
  // 每帧推进 + 绘制所有爆点（原地播放，不跟随任何物体）
  function drawPuffs(g, dt) {
    if (!PUFF.ok) return;
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i];
      p.t += dt;                                  // 【刻意不乘 mul()】见 PUFF 声明处
      var idx = Math.floor(p.t / PUFF.ms);
      if (idx >= PUFF.n) { puffs.splice(i, 1); continue; }   // 播完即弃
      // 散开感：随帧推进整体轻微放大（1.0 → 1.28），尾段淡出
      var k = idx / (PUFF.n - 1);
      var size = L.slotW * (1.55 + k * 0.42);
      g.save();
      // 【淡出提前到 0.45】见 PUFF 声明处：尾段挂太久是「慢」的主观来源。
      g.globalAlpha = k > 0.45 ? (1 - (k - 0.45) / 0.55) : 1;
      g.drawImage(PUFF.img, idx * PUFF.cw, 0, PUFF.cw, PUFF.ch,
                  p.x - size / 2, p.y - size / 2, size, size);
      g.restore();
    }
  }
  function loadAtlas(key, src) {
    try {
      var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
      im.onload = function () {
        ATL[key].img = im; ATL[key].ok = true;
        beanCache = null;                 // 【缓存失效】atlas 到位，豆子从程序绘制切到贴图
        sceneCache = null; sceneRP = -1;   // 车的 atlas 会影响 bgCache 里的道具栏
      };
      im.onerror = function () { console.warn('[atlas] fail ' + src + ' -> fallback'); };
      im.src = src;
    } catch (e) { console.warn('[atlas]', e && e.message); }
  }
  // 从 atlas 取色帧贴到 (cx,cy) 为中心、w×h 的框内（等比 contain，不拉伸变形）
  function blit(g, key, col, cx, cy, w, h) {
    var a = ATL[key];
    if (!a.ok) return false;
    var i = CKEY.indexOf(col);
    if (i < 0) return false;
    var k = Math.min(w / a.cw, h / a.ch);
    var dw = a.cw * k, dh = a.ch * k;
    g.drawImage(a.img, i * a.cw, 0, a.cw, a.ch, cx - dw / 2, cy - dh / 2, dw, dh);
    return true;
  }
  // 中性椭圆阴影：不烘进贴图，可随抬起/移动实时变化（贴图本身已去阴影）
  // 【用户要求】拖拽中的车不带任何底部阴影：画拖拽车前把 noShadow 置 true，
  // 被拿起的反馈完全靠「整图放大」表达。
  var noShadow = false;
  function groundShadow(g, cx, by, w, alpha) {
    if (noShadow) return;
    g.save();
    g.globalAlpha = alpha === undefined ? 0.26 : alpha;
    g.fillStyle = '#121E16';
    g.beginPath();
    if (g.ellipse) g.ellipse(cx, by, w * 0.36, w * 0.10, 0, 0, Math.PI * 2);
    else g.arc(cx, by, w * 0.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // 椭圆（失败页眼泪用）。【兼容】部分容器 ctx 没有 ellipse，降级到 arc + scale。
  function tear(g, cx, cy, rx, ry) {
    g.beginPath();
    if (g.ellipse) { g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
    else {
      g.save(); g.translate(cx, cy); g.scale(rx / ry, 1);
      g.arc(0, 0, ry, 0, Math.PI * 2); g.restore();
    }
    g.fill();
  }
  var S = null;
  var flights = [], fx = [], leaving = [];
  var lastT = 0, comboN = 0, comboT = 0;
  // dtAvg：dt 指数滑动平均值（丝滑关键 1）。容器 rAF 间隔常在 12~28ms 跳，
  // 直用原始 dt 会让匀速走豆的步长跟着抖，看上去就是一顿一顿。
  var dtAvg = 0;
  // 【新手引导状态】必须在这里声明并赋初值 —— newGame() 在游戏启动时就会读
  // guide.done，而它比下面那堆引导函数早执行。ES5 的 var 只提升声明不提升赋值，
  // 若把初值写在下面，newGame 里读到的就是 undefined → 直接报错。
  var guide = { on: 0, t: 0, qi: -1, si: -1, done: 0 };

  // ── 工具 ──────────────────────────────────────────────────
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOutBack(t) { var c = 1.70158, p = t - 1; return 1 + (c + 1) * p * p * p + c * p * p; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeInQuad(t) { return t * t; }
  // ══ 【第二排车「开上来」的位移曲线 · 用户要求 4】═══════════════════════
  // 输入进度 p(0~1) → 输出位移比例（可 >1，用于过冲回弹）。
  // 【为什么不能用 easeOut】easeOut = 1-(1-t)²，一上来就是最高速然后一路减速，
  //   这恰好是【开车的反过程】，观感就是贴图被「拽」过去，毫无机械感。
  // 【真车的运动学】起步蓄力(车头微沉) → 一脚油门加速 → 冲过位一点 → 刹住回弹。
  //   三段正好对应用户那三句话：「像开车过来」「有加速度」「duang 一下」。
  //   ① 0~18%   蓄力：反向压 4%（动画里叫 anticipation 预备动作，
  //             没有它，任何冲刺都会显得很突然）
  //   ② 18~80%  加速：easeInQuad 是【越走越快】，这才是「有加速度的感觉」
  //   ③ 80~100% 过冲到 1.05 再回落 1.0 —— 这 5% 的回弹就是 duang 的来源
  // 三段在断点处连续（p=.80 两边都 = 1.05），不会跳变。
  function driveProg(p) {
    if (p < .18) return -.04 * (p / .18);
    if (p < .80) return -.04 + 1.09 * easeInQuad((p - .18) / .62);
    return 1.05 - .05 * easeOut((p - .80) / .20);
  }
  var REFILL_MS = 340;          // 补位总时长（原 260 一段插值 → 340 三段才够演出）
  function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function txt(g, s, x, y, font, fill, stroke, sw) {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = sw || 6; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); }
    g.fillStyle = fill; g.fillText(s, x, y);
  }

  // ── 音效 ────────────────────────────────────────────────────
  // 【根因·用户反馈「没听到解救成功的音效」】
  // 原来 13 个音效全部走 WebAudio（window.AudioContext）。但快手小游戏容器里
  // **根本没有 window.AudioContext** —— 证据：全文件唯一能正常出声的是语音，
  // 而语音走的是 ks.createInnerAudioContext。所以 ac() 一直返回 null，
  // tone() 里 `if (!a) return;` 直接静默返回 → 所有音效在真机上全是哑的，
  // 不只是成功音效，是一个都没响过。
  // 修法：音效改成 mp3 素材 + ks.createInnerAudioContext（和语音同一条通路，
  // 已验证可用）；WebAudio 只保留给浏览器预览做兜底。
  var AC = null;
  function ac() {
    if (AC) return AC;
    try { var A = window.AudioContext || window.webkitAudioContext; if (A) AC = new A(); } catch (e) { AC = null; }
    return AC;
  }
  // 每个音效的并发池大小：duang 要 6 声/秒且单声 0.26s，必须能重叠，给 4 个实例；
  // 其余是低频单发音，1~2 个够。池化是为了避免每次 create/destroy —— 那样在
  // 6 声/秒的节奏下会疯狂 GC，真机上会听到卡顿甚至丢音。
  var SFX_SPEC = {
    duang:   { src: 'assets/sfx/sfx_duang.mp3',   n: 4, vol: 0.9 },
    duang2:  { src: 'assets/sfx/sfx_duang2.mp3',  n: 4, vol: 0.9 },
    leave:   { src: 'assets/sfx/sfx_leave.mp3',   n: 2, vol: 1.0 },
    success: { src: 'assets/sfx/sfx_success.mp3', n: 1, vol: 1.0 },
    pick:    { src: 'assets/sfx/sfx_pick.mp3',    n: 2, vol: 0.7 },
    drop:    { src: 'assets/sfx/sfx_drop.mp3',    n: 2, vol: 0.8 },
    deny:    { src: 'assets/sfx/sfx_deny.mp3',    n: 2, vol: 0.7 },
    door:    { src: 'assets/sfx/sfx_door.mp3',    n: 2, vol: 0.8 },
    // 【用户要求 1】失败时的沮丧音：双音下行滞音（520→293Hz 与低八度叠加），
    //   0.8s 指数衰减 —— 下行音阶是「泄气/失落」的通用听觉编码，与成功音
    //   sfxSuccess 的上行大三和刚好相反。n:1 —— 失败一局只可能响一次，不需要重叠池。
    fail:    { src: 'assets/sfx/sfx_fail.mp3',     n: 1, vol: 1.0 },
    // 【用户要求 3】按钮点击的清脆提示音：1520Hz + 二次泛音 2960Hz，
    //   90ms 极快衰减 —— 短而高才「脆」；太长就变成「咕当」。
    //   n:4 —— 连点时必须能叠响，否则快速点击会有一半没声（单实例会被 stop 掉）。
    tap:     { src: 'assets/sfx/sfx_tap.mp3',      n: 4, vol: 0.62 }
  };
  var sfxPool = {}, sfxIdx = {}, sfxReady = false;
  function initSfx() {
    if (sfxReady) return;
    if (typeof ks === 'undefined' || !ks.createInnerAudioContext) return;   // 浏览器预览走 WebAudio 兜底
    for (var k in SFX_SPEC) {
      if (!SFX_SPEC.hasOwnProperty(k)) continue;
      var sp = SFX_SPEC[k]; sfxPool[k] = []; sfxIdx[k] = 0;
      for (var i = 0; i < sp.n; i++) {
        try {
          var a = ks.createInnerAudioContext();
          a.src = sp.src;
          if (a.volume !== undefined) a.volume = sp.vol;
          a.onError(function () {});      // 单个音效 404 不能影响其它音效
          sfxPool[k].push(a);
        } catch (e) {}
      }
    }
    sfxReady = true;
  }
  // 播一个音效。池内轮转 → 同一音效可重叠（连击时 duang 叠着响才有密度感）。
  function playSfx(name) {
    initSfx();
    var pool = sfxPool[name];
    if (!pool || !pool.length) return false;
    var a = pool[sfxIdx[name] % pool.length];
    sfxIdx[name]++;
    try { a.stop(); } catch (e) {}      // 复用同一实例前先归零，否则会接着上次进度播
    try { a.seek(0); } catch (e) {}
    try { a.play(); return true; } catch (e) { return false; }
  }
  function tone(type, f0, f1, dur, vol) {
    var a = ac(); if (!a) return;
    try {
      var o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  // 每个音效：先试 mp3（真机唯一能出声的通路），失败再退回 WebAudio（浏览器预览）。
  // 【用户要求 2】豆子上车换成「duang」弹簧感，并且连击时两个音高轮换，
  // 6 声/秒同一个音会听成电流声，交替才有节奏感。
  function sfxBean(n) {
    if (playSfx(n % 2 ? 'duang2' : 'duang')) return;
    var f = 880 * Math.pow(1.06, Math.min(n, 24)); tone('triangle', f, f * 1.5, 0.13, 0.15);
  }
  function sfxPick() { if (playSfx('pick')) return; tone('sine', 520, 720, 0.08, 0.12); }
  function sfxDoor() { if (playSfx('door')) return; tone('sine', 380, 620, 0.14, 0.10); }
  function sfxDrop() { if (playSfx('drop')) return; tone('square', 300, 190, 0.11, 0.11); }
  function sfxDeny() { if (playSfx('deny')) return; tone('sawtooth', 190, 110, 0.16, 0.12); }
  // 【用户要求 3】所有按钮点击的清脆反馈音。兑底用 1500→2400Hz 很短的上滑，
  // 浏览器预览（无 ks.createInnerAudioContext）下也能听到。
  function sfxTap() { if (playSfx('tap')) return; tone('sine', 1500, 2400, 0.05, 0.07); }
  // 【用户要求 1】失败沮丧音。兑底：三角波下行滞音（与成功音 sfxSuccess 上行刚好相反）。
  function sfxFail() { if (playSfx('fail')) return; tone('triangle', 520, 190, 0.7, 0.16); }
  // 【用户要求 3】车满开走：上扬 whoosh + 两声轻鸣笛，比原来单音更有「开走了」的收束
  function sfxLeave() { if (playSfx('leave')) return; tone('triangle', 300, 680, 0.34, 0.16); }
  // ── 「解救成功」提示音（约 2 秒，欢快上扬）───────────────
  // 【历史注释已作废】原注释写「为什么合成而不是 mp3：0KB / 无解码延迟」——
  // 结论是错的：容器没有 WebAudio，合成方案在真机上等于完全没有声音（用户实测反馈）。
  // 现在是 10KB 的 mp3，用 ks.createInnerAudioContext 播，并在 initSfx 时就预创建
  // 实例（相当于预加载），首播不会有可感知延迟。
  function sfxSuccess() {
    if (playSfx('success')) return;
    var arp = [523, 659, 784, 1047, 1319], i;
    for (i = 0; i < arp.length; i++) {
      (function (f, d) { setTimeout(function () { tone('triangle', f, f, 0.30, 0.20); }, d); })(arp[i], i * 110);
    }
    setTimeout(function () { tone('triangle', 784, 784, 0.72, 0.16); }, 620);
    setTimeout(function () { tone('sine', 1047, 1047, 0.80, 0.14); }, 620);
    setTimeout(function () { tone('sine', 2093, 2093, 0.22, 0.09); }, 760);
    setTimeout(function () { tone('sine', 2637, 2637, 0.26, 0.08); }, 980);
  }
  // ── 持续震动（豆子连续上车时的手感）────────────────────────
  // vibUntil = 震动应持续到的时间戳；每颗豆落座就往后推，形成「连着震」。
  // VIB_GAP 是补发间隔：太小（<50ms）安卓马达来不及复位，反而变成一直嗡；
  // 70ms 实测是「连续但有颗粒感」的甜点值。
  var vibUntil = 0, vibLast = 0, VIB_GAP = 70;
  // 【上人震动窗口】每颗豆落座后车身继续抖多久（ms）。
  // 硬约束：必须 > SPD.perCar（110ms），否则连续上人时会出现「抖一下→停→再抖」
  // 的断续感，看起来像卡帧而不是「真的在上人」。260ms 给了 2.4 倍余量。
  var SHAKE_MS = 260;
  // 【用户要求 5】「车装满也有一个抖动的效果 然后发车离开」。
  // 旧逻辑是最后一颗豆落座就立即 departCar —— 装满和开走是同一帧，
  // 玩家根本没看到「满了」这个状态，因果链断了。
  // 插入 300ms 的「满载抖动」：车先原地大幅抖一下（像乘客全部坐定、
  // 车身下沉一下），再启动离场。时长不能再长 —— 车位是稀缺资源，
  // 拖太久会直接拉低整局吞吐。
  var FULL_SHAKE_MS = 300;
  function pumpVib() {
    var now = Date.now();
    if (now >= vibUntil) return;
    if (now - vibLast < VIB_GAP) return;
    vibLast = now;
    vib('light');
  }
  function vib(t) {
    // ks.vibrateShort 才是容器的正式 API；KwaiDevice 只是旧壳，两个都试。
    try {
      if (typeof ks !== 'undefined') {
        if (t === 'heavy' && ks.vibrateLong) { ks.vibrateLong({}); return; }
        if (ks.vibrateShort) { ks.vibrateShort({ type: t || 'medium' }); return; }
      }
    } catch (e) {}
    if (window.KwaiDevice && KwaiDevice.vibrateShort) KwaiDevice.vibrateShort(t || 'medium');
    else if (navigator.vibrate) navigator.vibrate(t === 'heavy' ? 30 : 14);
  }

  // ── 激励视频：真实接入 KwaiAd（广告位 2300058962_01）──────────
  // IAA 路线：全部用户主动触发；禁插屏 / 禁 Banner（kwai-ad-config.js 已置空）
  // 非快手环境（浏览器调试）走降级：直接发奖，便于本地验证逻辑
  // ── 激励视频（带加载 loading）───────────────────────────
  // 【用户要求 2】广告从调用到真正渲染出来有 0.5~3s 空白，原来只弹一个 toast，
  // 用户会以为没点到 → 反复点 → 重复拉广告。现在用全屏遮罩 + 转圈 loading，
  // 既告知「在加载」，也顺便屏蔽了重复点击。
  // 【必须有超时】广告 SDK 存在两个回调都不回的情况（无库存/网络挂掉），
  // 没有超时就会永久卡在 loading 遮罩里 —— 比没 loading 更糟。
  var adLoad = 0, adLoadTimer = null, adLoadTip = '';   // adLoad=1 表示正在加载
  function adLoadOn(tip) {
    adLoad = 1;
    adLoadTip = tip || '广告加载中…';   // 子包下载也复用这套遮罩，所以文案要可传入
    if (adLoadTimer) clearTimeout(adLoadTimer);
    adLoadTimer = setTimeout(function () {
      if (adLoad) { adLoad = 0; toast('加载超时，稍后再试'); }
    }, 15000);   // 子包有几 MB，弱网下 9s 不够，放宽到 15s
  }
  function adLoadOff() {
    adLoad = 0;
    if (adLoadTimer) { clearTimeout(adLoadTimer); adLoadTimer = null; }
  }
  function drawAdLoading(g) {
    if (!adLoad) return;
    g.fillStyle = 'rgba(8,6,12,.72)'; g.fillRect(0, 0, DW, DH);
    var cx = DW / 2, cy = DH * .46, R = 54;
    g.lineWidth = 9;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.stroke();
    // 转圈：用 Date.now() 驱动，不依赖 dt 累加，帧率波动下也匀速
    var a0 = (Date.now() / 260) % 6.2832;
    g.beginPath(); g.arc(cx, cy, R, a0, a0 + 1.9);
    g.strokeStyle = '#FFD64A'; g.stroke();
    txt(g, adLoadTip, cx, cy + 122, 'bold 36px sans-serif', '#FFFFFF', 'rgba(0,0,0,.55)', 6);
    txt(g, '请稍等一下～', cx, cy + 172, '28px sans-serif', 'rgba(255,255,255,.66)');
  }
  function rewardAd(tag, onReward, onCancel) {
    if (adLoad) return;                    // 加载中屏蔽重复点击
    if (window.KwaiAd && KwaiAd.showRewarded && typeof ks !== 'undefined') {
      adLoadOn();
      KwaiAd.showRewarded(
        function () { adLoadOff(); if (onReward) onReward(); },
        function () { adLoadOff(); toast('看完视频才能领取哦'); if (onCancel) onCancel(); }
      );
      return;
    }
    console.warn('[ad] 非快手环境降级发奖:', tag);
    if (onReward) onReward();
  }

  // ── 分享：真实接入 KwaiShare（含 onShareAppMessage 兜底）───────
  function doShare() {
    var lvId = S && S.lv ? S.lv.id : 1;
    var title = '我把第 ' + lvId + ' 关的拼豆全清了，来帮帮我！';
    if (window.KwaiShare && KwaiShare.share) {
      KwaiShare.share({
        title: title,
        extraQuery: { level: lvId, moves: S ? S.moves : 0 },
        success: function () { toast('分享成功，谢谢老铁~'); },
        fail: function () { toast('分享取消了'); }
      });
    } else {
      toast('分享：' + title);
    }
  }
  G.share = doShare;

  // ── 适配 ──────────────────────────────────────────────────
  // 【动态画质 · 2026-09-04】低端机（benchmarkLevel 0~14）全屏填充/离屏缩放的
  // 像素量随 dpr 平方增长，封 1.5 可砍 ~44% 填充率开销，在 6 寸屏上对 750 宽
  // 设计稿几乎不可辨。benchmarkLevel < 0 = 未知（iOS 常见）→ 按高端处理。
  var LOW_END;
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    if (LOW_END === undefined) {
      LOW_END = false;
      try {
        if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
          var si = ks.getSystemInfoSync();
          var bl = si && si.benchmarkLevel;
          LOW_END = (typeof bl === 'number' && bl >= 0 && bl < 15);
        }
      } catch (e) {}
    }
    dpr = Math.min(window.devicePixelRatio || 1, LOW_END ? 1.5 : 2);
    cv.width = w * dpr; cv.height = h * dpr;
    if (cv.style) { cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    scale = Math.min(w / DW, h / DH);
    offX = (w - DW * scale) / 2;
    offY = (h - DH * scale) / 2;
    bgCache = null;
    beanCache = null;                             // 【缓存失效】屏幕尺寸/缩放变了，豆阵像素位置也变
    sceneCache = null; sceneRP = -1;              // 同理，烘好的场景像素也失效    // 【原生视频层跟随】视频吃的是屏幕 px，屏幕一变必须重算几何，否则又跑偏
    if (boudoirVideo) syncBoudoirGeom();
  }
  function toDesign(px, py) { return { x: (px - offX) / scale, y: (py - offY) / scale }; }
  // ── 状态 ──────────────────────────────────────────────────
  // ── 每关美女：名字 / 立绘 / 语音包 ────────────────────────────
  // ═══ 语音设计契约（新增主播必须遵守）═══
  //  help[] 求救语音：不止一句，每关轮换一句 → 讲「我为啥被困住」的小故事，
  //         诙谐/骚话/带人设，避免单一。同一主播的所有语音必须【同一音色】。
  //  win[]  解救语音：过关时播，「哥哥你太棒了…我要怎么感谢你呢」这类。
  //  轮换：help[(lvNo-1) % help.length] → 同一位主播连续几关台词都不重复。
  //  兜底：数组缺失/文件 404 → 静默跳过，绝不卡住游戏。
  var GIRLS = [
    // 天台礼服蕾丝白裙 · 甜妹 → 甜美音
    { name: '糯糯', img: 'assets/girl_nuonuo.jpg',   key: 'nuonuo' },
    // 深夜办公室黑衬衫 · 御姐 OL → 御姐音
    { name: '辰辰', img: 'assets/girl_chenchen.jpg', key: 'chenchen' },
    // 橄榄绿修身棚拍 · 清冷 → 成熟音
    { name: '薇薇', img: 'assets/girl_weiwei.jpg',   key: 'weiwei' },
    // 粉色卧室波点双马尾 · 元气妹妹 → 少女音
    { name: '桃桃', img: 'assets/girl_taotao.jpg',   key: 'taotao' },
    // 粉色卧室波点蝴蝶结 · 温柔甜 → 甜美音
    { name: '甜甜', img: 'assets/girl_tiantian.jpg', key: 'tiantian' },
    // 米白衬衫阔腿裤 · 优雅知性 → 成熟音
    { name: '婧婧', img: 'assets/girl_jingjing.jpg', key: 'jingjing' },
    // 黑色高领无袖裙 · 冷艳 → 御姐音
    { name: '琳琳', img: 'assets/girl_linlin.jpg',   key: 'linlin' },
    // JK 格裙领带 · 元气学妹 → 少女音
    { name: '妮妮', img: 'assets/girl_nini.jpg',     key: 'nini' }
  ];
  // 每位主播的语音条数（由 tools/gen-voices.js 生成时写死，与实际文件数一致）
  var HELP_N = 3, WIN_N = 2;
  // 语音路径规则：assets/voice/<key>_help1.mp3 / <key>_win1.mp3
  // 【为什么用编号而不是列数组】新增主播只需改 key + 跑生成脚本，不用手写 5 个路径。
  function helpVoice(g, n) { return 'assets/voice/' + g.key + '_help' + (((n - 1) % HELP_N) + 1) + '.mp3'; }
  function winVoice(g, n)  { return 'assets/voice/' + g.key + '_win'  + (((n - 1) % WIN_N)  + 1) + '.mp3'; }
  // 【坑】不能用 lvIdx —— 它是 % PD.LEVEL_ORDER.length（3）的，第 4 位美女永远轮不到。
  // 单独用一个只增不减的 girlIdx，% GIRLS.length 才能把所有人都轮一遍。
  var girlIdx = 0;
  function girlOf() { return GIRLS[girlIdx % GIRLS.length]; }
  function girlName() { return girlOf().name; }
  // ── 语音播放 ────────────────────────────────────────────────
  // 用 ks.createInnerAudioContext 播 mp3；容器不支持就静默跳过，绝不抛错卡住游戏。
  var voiceAudio = null;
  // ── 【语音纪元 voiceEpoch】用户反馈「播视频的时候 下面的感谢语音 mp3 还没播完」──
  // 只写一个 stopVoice() 去 stop 当前实例是【不够的】，因为通关那条是
  //   playVoice(winVoice(...), 900)  ← 延迟 900ms 的 setTimeout
  // 用户完全可能在这 900ms 内（甚至广告回来后）才打开私房，此时 stopVoice 早就
  // 跑完了，而那个 setTimeout 仍然会在之后把语音放出来 —— 语音就压在视频上。
  // 所以必须有一个「纪元号」：stopVoice() 递增 epoch，任何延迟播放在真正开播前
  // 校验自己出生时的 epoch 是否仍是当前值，不是就直接作废。
  var voiceEpoch = 0;
  function stopVoice() {
    voiceEpoch++;                       // 作废所有在排队中的延迟语音
    if (!voiceAudio) return;
    // pause → stop → destroy 三连：部分容器只 destroy 会留音轨继续出声
    try { if (voiceAudio.pause) voiceAudio.pause(); } catch (e) {}
    try { if (voiceAudio.stop) voiceAudio.stop(); } catch (e) {}
    try { if (voiceAudio.destroy) voiceAudio.destroy(); } catch (e) {}
    voiceAudio = null;
  }
  function playVoice(src, delay) {
    if (delay) {
      var ep = voiceEpoch;              // 记下出生纪元
      setTimeout(function () {
        if (ep !== voiceEpoch) return;  // 期间被 stopVoice 掐过 → 这条已作废
        playVoice(src, 0);
      }, delay);
      return;
    }
    try {
      if (typeof ks === 'undefined' || !ks.createInnerAudioContext) return;
      if (voiceAudio) { try { voiceAudio.stop(); voiceAudio.destroy(); } catch (e) {} }
      voiceAudio = ks.createInnerAudioContext();
      voiceAudio.src = src;
      voiceAudio.onError(function () { console.warn('[voice] miss ' + src); });
      voiceAudio.play();
    } catch (e) { console.warn('[voice]', e && e.message); }
  }
  // ── 全场静音（进私房视频前）──────────────────────────────
  // 视频自带原声，任何游戏侧声音叠上来都是噪音。要掐三类：
  //   ① 主播语音（含延迟排队的）② BGM ③ 音效池里正在响的尾音
  function muteAllForVideo() {
    stopVoice();
    try { if (bgmAudio) bgmAudio.pause(); } catch (e) {}
    var k, i, pool;
    for (k in sfxPool) {
      if (!sfxPool.hasOwnProperty(k)) continue;
      pool = sfxPool[k];
      for (i = 0; i < pool.length; i++) { try { pool[i].stop(); } catch (e) {} }
    }
  }
  // ── BGM（用户要求 1：参考视频风格复刻，做了差异化）────────────
  // 曲风：轻快休闲益智，马林巴+尤克里里+木琴+轻鼓点，BPM 124，大调明亮。
  // 与参考的差异：换了配器（参考偏电子，这版走木质打击乐）+ 提了速度，不是照抄。
  // 【铁律】必须是纯器乐 —— 带唱词的 BGM 会盖住主播语音，实测人声区(2-4kHz)
  //         比整体低 16.4dB，确认无人声。
  // 【音量】压到 0.10：BGM 只是垫底，不能盖过求救语音和 duang 音效。
  var bgmAudio = null;
  function startBgm() {
    try {
      if (typeof ks === 'undefined' || !ks.createInnerAudioContext) return;
      if (bgmAudio) return;                       // 已在放就别叠第二条
      bgmAudio = ks.createInnerAudioContext();
      bgmAudio.src = 'assets/bgm/bgm_main.mp3';
      bgmAudio.loop = true;                       // mp3 首尾不一定严格对齐，靠容器硬循
      if (bgmAudio.volume !== undefined) bgmAudio.volume = 0.035;   // 【用户反馈「bgm 声音太大」】0.10 → 0.035
      bgmAudio.onError(function () { console.warn('[bgm] miss'); });
      bgmAudio.play();
    } catch (e) { console.warn('[bgm]', e && e.message); }
  }
  // 切关时换立绘（每关美女不同）
  function loadPortrait(src) {
    try {
      var im = (typeof ks !== 'undefined' && ks.createImage) ? ks.createImage() : new Image();
      im.onload = function () {
        portrait = im; portraitOK = true;
        bgCache = null;
        sceneCache = null; sceneRP = -1;           // 立绘换了，烘好的场景必须重烘
        buildPortraitCache();
      };
      im.onerror = function () { portraitOK = false; };
      im.src = src;
    } catch (e) { portraitOK = false; }
  }
  // ═══════════════════════════════════════════════════════════════
  // 关卡系统 v2【程序化生成 · 难度恒定 · 图案随机】
  // ═══════════════════════════════════════════════════════════════
  // 旧版：lvIdx = (lvIdx+1) % 3 → 打完第 3 关又回第 1 关，且三关 targetS 全硬编码 0.125
  //       （难度完全没有梯度，图案永远那 3 张）。
  // 新版：关卡号只增不减 → 无限关；难度由 PD.LG.difficulty(n) 契约锁定（S/色数/豆数
  //       按段位梯度递增）；图案由 seed 随机生成（裙型 6 种 × 配色 5 种 × 随机参数）。
  //
  // 于是达成用户诉求：「难度是固定的（同一关号难度恒定），但每次的图案不一样」。
  // seed 每次进关都换 → 同一关卡号每次看到的裙子都不同，但 S/色数/豆数完全一致。
  var lvNo = 1;                          // 关卡号，只增不减（无限关）
  var totalStars = 0;                    // 累计星数（跨关累加，用于以后的星级门槛/成就）

  // ═══════════════════════════════════════════════════════════════
  // 【存档 · KwaiStorage】lvNo / totalStars / girlIdx 三个值持久化
  // ═══════════════════════════════════════════════════════════════
  // 【为什么必须做】此前这三个变量是纯内存的，玩家杀掉小游戏再进来永远从第 1 关
  //   开始 —— 无限关的梯度设计、主播轮换、累计星数全部作废，等于每次都是新用户。
  //   快手小游戏是「随手进随手退」的场景，没有存档 = 没有留存。
  // 【为什么用 setSync 而不是异步 set】三个数字加起来不到 60 字节，同步写的耗时
  //   在 1ms 量级；而异步写有「写入未完成时进程被容器杀掉」的窗口，正是杀后台
  //   最常见的丢档场景。小数据一律同步写，这是 kwai-storage.js 头部注释的建议。
  // 【为什么存一个对象而不是三个 key】三个值语义上是【同一个存档】，必须原子更新。
  //   分三个 key 写，若中途被杀会出现 lvNo=9 但 girlIdx=3 的错位状态。
  // 【为什么带 v 字段】以后存档结构一定会加字段（道具数/成就/皮肤）。有版本号才能
  //   在读取时判断要不要迁移；没有版本号就只能靠 typeof 猜，早晚出脏数据。
  // 【容错铁律】读档全程 try + 逐字段校验。存档是【外部输入】（可能被旧版本写坏、
  //   可能被容器截断），任何一个字段不合法就整体回落到新档，绝不允许把 NaN
  //   灌进 lvNo —— genLevel(NaN) 会直接白屏。
  var SAVE_KEY = 'pd_save_v1';
  function saveProgress() {
    try {
      if (!window.KwaiStorage || !KwaiStorage.setSync) return;
      KwaiStorage.setSync(SAVE_KEY, {
        v: 1,
        lvNo: lvNo,
        totalStars: totalStars,
        girlIdx: girlIdx,
        guideDone: guide.done ? 1 : 0,   // 引导看过就别再骚扰，这也属于进度
        ts: Date.now()
      });
    } catch (e) { console.warn('[save] 写档失败', e && e.message); }
  }
  // 读档。成功且数据合法 → 写回三个全局变量并返回 true；否则不动任何变量、返回 false。
  function loadProgress() {
    try {
      if (!window.KwaiStorage || !KwaiStorage.getSync) return false;
      var d = KwaiStorage.getSync(SAVE_KEY);
      // 部分容器把对象存成 JSON 字符串取回，这里两种都吃
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e2) { return false; } }
      if (!d || typeof d !== 'object') return false;
      var n  = parseInt(d.lvNo, 10);
      var st = parseInt(d.totalStars, 10);
      var gi = parseInt(d.girlIdx, 10);
      // 逐字段校验：关卡号必须 >=1 且有个理论上限（防脏数据把 N_HARD_MAX 撑爆）
      if (!isFinite(n) || n < 1 || n > 99999) return false;
      lvNo = n;
      totalStars = (isFinite(st) && st >= 0) ? st : 0;
      girlIdx    = (isFinite(gi) && gi >= 0) ? gi : (n - 1);
      if (d.guideDone) guide.done = 1;
      dlog('[save] 读档成功 lv=' + lvNo + ' stars=' + totalStars + ' girl=' + girlIdx);
      return true;
    } catch (e) { console.warn('[save] 读档失败', e && e.message); return false; }
  }
  G.saveProgress = saveProgress;
  G.loadProgress = loadProgress;
  // ── 【重新开始 · 回到第 1 关】────────────────────────────────────────
  // 【用户反馈】「那个重新开始，预期是从第一关开始重新玩」。
  // 【旧行为是 bug】pd-home 的重新开始按钮调的是 newGame(false) ——
  //   那是「不递增关卡号、重开本关」（换一张图、状态归零），
  //   玩家在第 9 关点它还是第 9 关，和「重新开始」这个词的语义完全不符。
  // 【为什么要连 girlIdx / totalStars 一起归零】三者是【同一份存档】的三个字段，
  //   只重置 lvNo 会留下「第 1 关却是第 9 位主播、还带着 27 颗星」的错位状态。
  //   重新开始 = 从头玩一遍，进度就该整体归零。
  // 【为什么必须显式落盘】newGame 内部虽然也会 saveProgress，但那是在
  //   lvNo 已改之后；这里先把三个字段一次性置好再进关，才能保证存档原子一致。
  G.restartFromLv1 = function () {
    lvNo = 1; girlIdx = 0; totalStars = 0;
    saveProgress();
    newGame(false);          // 传 false：不再额外 ++，直接按上面设好的 lvNo=1 开局
  };
  // 调试用：清档（浏览器控制台 M3.Game.resetProgress() 可回到第 1 关）
  G.resetProgress = function () {
    try { if (window.KwaiStorage && KwaiStorage.removeSync) KwaiStorage.removeSync(SAVE_KEY); } catch (e) {}
    lvNo = 1; totalStars = 0; girlIdx = 0; guide.done = 0;
  };

  function newGame(next) {
    if (next) { lvNo++; girlIdx++; }
    // 【存档时机 1 · 进关就存】不能只在通关时存 —— 玩家在第 9 关中途退出，
    // 下次回来应该还在第 9 关（而不是退回第 8 关重打一遍）。进关即落盘，
    // 保证「看到的关号」和「存的关号」永远一致。
    saveProgress();
    // seed 用真随机 → 每次进关图案都不同（要复现某张图就传固定 seed）
    var seed = ((Math.random() * 0x7fffffff) | 0) >>> 0;
    var lv = PD.LG ? PD.LG.genLevel(lvNo, seed) : null;
    if (!lv) {
      // 兜底：生成器异常时回落到旧的固定遮罩关卡，绝不白屏
      console.error('[level] genLevel 失败，回落固定关卡');
      var key = PD.LEVEL_ORDER[(lvNo - 1) % PD.LEVEL_ORDER.length];
      lv = PD.buildFromMask(key, lvNo, 0.125, PD.STACK[key] || { L: 1 });
      var sol0 = PD.solveLevel(lv, { slots: 5, walk: true });
      lv.stars.three = Math.ceil(sol0.carMoves * 1.15);
      lv.stars.two = Math.ceil(sol0.carMoves * 1.5);
    }
    // ── 豆阵居中：程序化关卡的 rows/cols 每关都不同，必须动态算 ──
    // 舞台可用高 = laneY − stageY（豆阵不能压到行车通道，否则豆子走不出去）
    var maxW = 618, maxH = L.laneY - L.stageY - 30;
    // 【用户要求】豆子缩到原来 60%：cell 上限 34 → 20，下限 14 → 9。
    // 附带收益：同样的舞台能放下更多格 → 造型（爱心/西瓜/火炬）能画得更精细。
    // ⚠️ 上限必须和 pd-levelgen 的 COL_MAX(30)/ROW_MAX(36) 对齐：
    //    30×20=600 <= 618 ✓   36×20=720 <= 720 ✓   否则会撞 V6 布局越界红线。
    //    【2026-08 修正】旧注释写的 26/30 是按 cell=32 时代算的，已随豆子缩到 60% 放开。
    L.cell = Math.max(9, Math.min(20, Math.floor(Math.min(maxW / lv.cols, maxH / lv.rows))));
    L.beanCX = 375;
    L.beanTop = L.stageY + Math.max(10, (maxH - lv.rows * L.cell) / 2) + L.cell / 2;
    // 【固定 8 格稀疏队列】用户铁律：队列不是「会自动压缩的数组」，而是 8 个固定槽位，
    // 允许有洞。abcd/efgh 拿走 c → 第一排 abgd，第二排 ef_h（洞就留在那）。
    var q8 = [null, null, null, null, null, null, null, null], pend = [], qi0;
    for (qi0 = 0; qi0 < lv.cars.length; qi0++) {
      if (qi0 < 8) q8[qi0] = lv.cars[qi0]; else pend.push(lv.cars[qi0]);
    }
    beanCache = null;                     // 【缓存失效】换关：豆阵、布局、立绘全变
    if (suckTimer) { clearTimeout(suckTimer); suckTimer = null; }   // 旧关挂起的 suck 不许串进新关
    sceneCache = null; sceneRP = -1;
    bgCache = null;
    S = {
      lv: lv, beans: lv.beans, queue: q8, pend: pend,
      slots: [null, null, null, null, null, null],
      slot6Locked: true,                 // 参考图：第 6 车位需看广告解锁
      moves: 0, total: lv.beans.length, cleared: 0,
      drag: null, phase: 'play', winT: 0, tip: '', tipT: 0,
      speed2: false, refillT: 9999, refillFrom: 99,
      bounds: PD.buildBounds(lv.beans),   // 走路算法用：豆阵边界
      stuckT: 0, deadT: 0, hintedFree: 0, reviveAsked: 0,
      // 【用户要求 2】本关计时：t0 = 进关时刻，通关时算出 useSec 冻结下来
      t0: Date.now(), useSec: 0
    };
    // 【真人日志】进关快照：豆数/色数/车队长/目标胜率。
    // 有了这行，后面每一步「拖车」才有上下文 —— 否则不知道这关本来长什么样。
    plog('进关', '豆' + lv.beans.length + ' 车' + lv.cars.length +
         ' 色' + (lv._realCols || '?') +
         ' 目标胜率' + Math.round((lv._meta && lv._meta.targetWR ? lv._meta.targetWR : 0) * 100) + '%');
    // 【桶索引 + 存活计数 · 2026-09-04】suck/anyMovable/isZombie/fieldBeanCount/
    // releaseAdBoostedCars 原来每次都全量扫 S.beans（极限段 620 颗 × 每秒 30+ 次
    // 调用）。现在：S.bucket[color] = 只装静止豆（未走未消失），按 S.beans 原序；
    // S.colorAlive[color] = 未消失豆数（含在途）。维护点恰好两个：豆起步
    // （removeFromBucket）/ 豆消失（freed 处 --）。排序/门槛逻辑不变。
    var bi;
    S.bucket = {}; S.colorAlive = {};
    for (bi = 0; bi < lv.beans.length; bi++) {
      var bB = lv.beans[bi];
      (S.bucket[bB.color] = S.bucket[bB.color] || []).push(bB);
      S.colorAlive[bB.color] = (S.colorAlive[bB.color] || 0) + 1;
    }
    S.topC = null; S.occC = null;               // top/occ 只在豆 gone 时变，缓存到那时
    flights = []; fx = []; leaving = []; comboN = 0;
    puffs = [];                           // 【必须】换关要清爆点，否则上一关的星芒会漏到新关面上
    // 【用户要求 3+5】换本关美女立绘 + 播放她的求救语音（每关轮换不同故事）
    var gl = girlOf();
    loadPortrait(gl.img);
    playVoice(helpVoice(gl, lvNo));
    // 【新手引导】只在第 1 关、且整局还没引导过时触发。第 2 关起用户已经会玩了，
    // 再弹手势就是骚扰。guide.done 一旦置 1 就永不再出（拖过车 = 学会了）。
    if (lvNo === 1 && !guide.done) guideStart();
  }
  G.newGame = newGame;

  // ── 几何 ──────────────────────────────────────────────────
  function beanXY(b) { return { x: L.beanCX + b.gx * L.cell, y: L.beanTop + b.gy * L.cell }; }
  function slotRect(i) {
    var tw = L.slotW * 6 + L.slotGap * 5, x0 = (DW - tw) / 2;
    return { x: x0 + i * (L.slotW + L.slotGap), y: L.slotY, w: L.slotW, h: L.slotH };
  }
  function qRect(i) {
    // 两排：0-3 第一排（可拖），4-7 第二排（半透明待补位）
    var row = i < 4 ? 0 : 1, k = i % 4;
    var n = 4, tw = n * L.qCarW + (n - 1) * 18, x0 = (DW - tw) / 2;
    return { x: x0 + k * (L.qCarW + 18), y: row === 0 ? L.qRow1 : L.qRow2, w: L.qCarW, h: L.qCarH, row: row };
  }
  // 【用户要求】底部栏扩展到 4 个 icon：升级 / 消除 / 刷新 / 加速。
  // 加速原来是托盘左侧一张白卡片，样式与三道具不统一，现在统一成第 4 个圆钮。
  function btnRect(i) { var xs = [94, 281, 468, 655]; return { cx: xs[i], cy: L.btnY, r: L.btnR }; }
  // 保留 spdRect 仅为兼容（已无渲染/命中），加速命中改走 btnRect(3)
  function spdRect() { return { x: -999, y: -999, w: 0, h: 0 }; }

  // ── 交互 ──────────────────────────────────────────────────
  function onDown(px, py) {
    var p = toDesign(px, py), i;
    // 【用户要求 1】每个按钮都要点击震动反馈。这里统一收口：
    // btnTap() = 「确认点到了」的触觉回应，所有 UI 按钮命中后第一件事就调它。
    // 不能只靠各个 useXxx 里自己震 —— 那些分支里失败路径（条件不足、广告取消）
    // 往往只有 sfxDeny 没有震动，手感上就像「根本没点到」。
    // 【用户要求 3 · 本轮】除了震动，每个按钮还要一个【清脆提示音】。
    // 同样收口在 btnTap 里 —— 这样所有已有调用点自动同时获得「震 + 响」，
    // 不会出现「有些按钮有声、有些没声」的不一致（收口的价值就在这）。
    // 注：若后继分支还会放 sfxDeny（操作非法），听觉上是「叮——错」，
    // 这个先后顺序是对的：先确认点到了，再告知不行。
    function btnTap() { vib('light'); sfxTap(); }

    // 私房浮层：只有关闭键（视频是原生组件，盖在 canvas 上，点它不会走到这里）
    if (S.phase === 'boudoir') {
      var bc = boudoirCloseRect();
      if ((p.x - bc.cx) * (p.x - bc.cx) + (p.y - bc.cy) * (p.y - bc.cy) < bc.r * bc.r * 2.2) { btnTap(); closeBoudoir(); }
      return;
    }
    // 奖励弹窗浮层：关闭键 / 主按钮（其余区域点击一律吞掉，防误触到背后的车）
    if (S.phase === 'popup') {
      var PR = popupRects();
      var dx = p.x - PR.close.cx, dy = p.y - PR.close.cy;
      // 关闭键热区放大到 1.5 倍半径 —— 圆按钮本身只有 70px，指尖精度不够
      var cr = PR.close.d * 0.75;
      if (dx * dx + dy * dy < cr * cr) { btnTap(); sfxDeny(); closePopup(); return; }
      if (p.x >= PR.btn.x && p.x <= PR.btn.x + PR.btn.w &&
          p.y >= PR.btn.y && p.y <= PR.btn.y + PR.btn.h) {
        btnTap();
        if (S.popup) S.popup.press = 1;   // 按下态由 onUp 负责触发，手感更实
        return;
      }
      return;                            // 弹窗外区域：吞掉，不穿透
    }
    if (S.phase === 'win') {
      // 【用户要求】分享 / 下一关 / 看 TA 私房（主页键已去掉 —— 主页本来也没上线）
      // 命中框跟着 drawWin 里的 pill 坐标走：52-202 / 226-476 / 500-698
      if (p.y > DH * .78 && p.y < DH * .86) {
        if (p.x >= 226 && p.x <= 476) { btnTap(); newGame(true); }  // 下一关
        else if (p.x >= 500) {                                     // 看 TA 私房 → 广告解锁
          btnTap();
          rewardAd('boudoir', function () { openBoudoir(); });
        }
        else if (p.x <= 202) { btnTap(); doShare(); }               // 分享
      }
      return;
    }
    // 【用户要求 4】左上角齿轮也是回主页入口 → 同样的 toast
    if (p.x <= 104 && p.y <= 104) { btnTap(); goHome(); return; }
    // 死局：精简为「主页 / 再试一次 / 分享」三键（用户要求 2，对齐参考图）
    if (S.phase === 'dead') {
      var R = deadBtnRects();
      // 主页 → 还没上线
      if (Math.abs(p.x - R.home.cx) <= R.home.r && Math.abs(p.y - R.home.cy) <= R.home.r) {
        btnTap(); goHome(); return;
      }
      if (Math.abs(p.x - R.share.cx) <= R.share.r && Math.abs(p.y - R.share.cy) <= R.share.r) {
        btnTap(); doShare(); return;
      }
      // ── 再试一次 = 激励视频 → 【整关重置】────────────────────────
      // 【旧实现的 bug（用户实测：看完广告回来还是失败浮层）】
      //  旧代码只做「清空 6 个车位 + phase='play'」。但死局发生时队列通常已经空了
      //  （车都被拖出去了），于是回到 play 后：
      //    watchdog → freeSlots()>0 但 queueCount()===0 → 那条豁免不成立
      //             → anyMovable() 也是 false（车位刚被清空，没有任何车在装豆）
      //             → S.stuckT 累加，900ms 后【原地又判死一次】→ 浮层复现。
      //  所以「腾空车位」这个奖励在队列耗尽的死局里是无效奖励，形同没看广告。
      // 【现在的语义】用户明确要求：看完广告回来要刷新本关、重置。
      //  newGame(false) 不递增 lvNo → 关卡号不变（难度契约不变），
      //  但重新 roll seed → 换一张图、车队与豆阵全部重建、车位/队列/计时全部归零。
      //  既兑现了广告权益，也彻底不可能再回到死局态。
      if (p.x >= R.retry.x && p.x <= R.retry.x + R.retry.w &&
          p.y >= R.retry.y && p.y <= R.retry.y + R.retry.h) {
        btnTap();
        rewardAd('revive', function () {
          newGame(false);                 // 关卡号不变，重开本关（换图 + 全状态归零）
          sfxDoor(); vib('medium');
          toast('本关已重置，再来一次！');
          queueSuck(220);
        });
      }
      return;
    }

    // 注：加速已并入底部栏第 4 个圆钮（见下方 btnRect(3)），不再是托盘白卡片。
    // 第 6 车位解锁 —— 激励视频点 2
    if (S.slot6Locked) {
      var r6 = slotRect(5);
      if (p.x >= r6.x && p.x <= r6.x + r6.w && p.y >= r6.y && p.y <= r6.y + r6.h) {
        btnTap();
        rewardAd('slot6', function () {
          S.slot6Locked = false; sfxDoor(); vib('medium');
          toast('第 6 车位已解锁！');
        });
        return;
      }
    }
    // 僵尸车车身徽章（铁律 8 入口 A）—— 激励视频点 3
    for (i = 0; i < 6; i++) {
      if (!isZombie(i)) continue;
      var zr = slotRect(i);
      if (p.x >= zr.x + zr.w - 44 && p.x <= zr.x + zr.w + 12 && p.y >= zr.y - 14 && p.y <= zr.y + 44) {
        btnTap();
        rewardAd('tow', function () {
          if (!S.slots[i]) return;
          departCar(i);
          toast('僵尸车已拖走！');
        });
        return;
      }
    }
    // 底部四按钮：升级 / 消除 / 刷新 / 加速 —— 全部激励视频
    for (i = 0; i < 4; i++) {
      var b = btnRect(i);
      if ((p.x - b.cx) * (p.x - b.cx) + (p.y - b.cy) * (p.y - b.cy) < b.r * b.r) {
        btnTap();
        if (i === 0) { useUpgrade(); }
        else if (i === 1) { useClear(); }
        else if (i === 2) { useRefresh(); }
        else { useBoost(); }
        return;
      }
    }
    // 只有第一排（前 4 辆）可拖；稀疏槽位可能有洞，要跳过 null
    for (i = 0; i < 4; i++) {
      if (!S.queue[i]) continue;
      var q = qRect(i);
      if (p.x >= q.x - 8 && p.x <= q.x + q.w + 8 && p.y >= q.y - 12 && p.y <= q.y + q.h + 12) {
        S.drag = { qi: i, car: S.queue[i], x: p.x, y: p.y, ox: q.x + q.w / 2, oy: q.y + q.h / 2, vx: 0, lx: p.x, lt: Date.now(), pop: 0, moved: 0, dx0: p.x, dy0: p.y };
        guideStop();                    // 【引导】用户真的上手拖车了 → 立刻收掉，整局不再出
        sfxPick(); vib('light'); return;
      }
    }
  }
  function onMove(px, py) {
    if (!S.drag) return;
    var p = toDesign(px, py), now = Date.now();
    var dt = Math.max(16, now - S.drag.lt);
    S.drag.vx = (p.x - S.drag.lx) / dt * 16;
    S.drag.lx = p.x; S.drag.lt = now;
    // 【点击自动入位】记录是否真的拖动过（位移 > 24px），
    // 用于区分「轻点」和「拖拽」——不能拿 d.y 直接比，因为 onMove 会把 y 上提 64px。
    if (Math.abs(p.x - S.drag.dx0) > 24 || Math.abs(p.y - S.drag.dy0) > 24) S.drag.moved = 1;
    // 安全区限制（参考图硬约束：车不出界）
    S.drag.x = clamp(p.x, SAFE.x0, SAFE.x1);
    S.drag.y = clamp(p.y - 64, SAFE.y0, SAFE.y1);
    // 【用户要求】删除拖拽轨迹残影（那一串半透明色块就是“阴影”观感的主因）。
  }
  function onUp() {
    // 奖励弹窗：按钮在抬起时才真正触发（按下态有视觉反馈，抬起才发奖 —— 手感更实，
    // 也给玩家一个「按下后滑开取消」的后路，避免误触直接拉广告）。
    // 必须放在 `if (!S.drag) return` 之前 —— 弹窗态下根本没有 S.drag。
    if (S && S.phase === 'popup') {
      var PP = S.popup;
      if (PP && PP.press) {
        PP.press = 0;
        var cfg0 = POPUP_CFG[PP.kind];
        closePopup();                      // 先关弹窗再拉广告，否则广告回来后弹窗还盖着
        if (cfg0 && cfg0.onGet) cfg0.onGet();
      }
      return;
    }
    if (!S.drag) return;
    var d = S.drag, hit = -1, i;
    for (i = 0; i < 6; i++) {
      if (i === 5 && S.slot6Locked) continue;
      var r = slotRect(i);
      if (d.x >= r.x - 26 && d.x <= r.x + r.w + 26 && d.y >= r.y - 84 && d.y <= r.y + r.h + 84) { hit = i; break; }
    }
    S.drag = null;
    // ── 【用户要求】不一定非要拖拽：轻点一下就自动进最近的空车位 ──
    if (!d.moved && (hit < 0 || S.slots[hit])) {
      var near = -1, bestD = 1e9;
      for (i = 0; i < 6; i++) {
        if (i === 5 && S.slot6Locked) continue;
        if (S.slots[i]) continue;
        var sr = slotRect(i);
        var dx0 = (sr.x + sr.w / 2) - d.ox;
        var dy0 = (sr.y + sr.h / 2) - d.oy;
        var dd = dx0 * dx0 + dy0 * dy0;
        if (dd < bestD) { bestD = dd; near = i; }
      }
      if (near >= 0) hit = near;          // 自动落到最近空位
    }
    if (hit < 0 || S.slots[hit]) {
      sfxDeny();
      if (hit >= 0) {
        // 【用户要求】车位已有车 → 震动 + 车位整体标红 + 无法放入
        S.reject = { si: hit, t: 0 };
        vib('heavy');
        toast('这个车位已有车，进不了新车');
      } else {
        // 【方位铁律 · 用户纠错 2026-08-28】原文案是「拖到【下面】的空车位」，方位反了。
        // 布局铁证（pd-core.js LAYOUT）：slotY=944（车位）< qPanelY=1216（候选队列），
        // y 向下为正 ⇒ 队列在下、车位在上 ⇒ 手势永远是【从下往上滑】。
        // 动词统一为「滑动」，与引导艺术字 guide_l1 同一口径。
        toast('滑动到上面的空车位');
      }
      return;
    }
    // 【补位铁律】用户校准：不是整排前移，而是「正后方那辆（同列下一排，i+4）竖直升上来」，
    // 第二排原地留空。例：abcd/efgh 拿走 c → abgd / ef_h。
    // 旧 bug：用 splice 导致整个数组前移（abde/fgh），与用户预期完全不同。
    S.queue[d.qi] = null;
    S.refillFrom = 99;
    if (d.qi < 4 && S.queue[d.qi + 4]) {
      S.queue[d.qi] = S.queue[d.qi + 4];
      S.queue[d.qi + 4] = null;
      S.refillFrom = d.qi;                 // 只有这一格做「竖直升上来」动画
      // 关卡车数 >8 时，第二排的洞才从待发池补；=8 时 pend 为空，洞就留着
      if (S.pend.length) S.queue[d.qi + 4] = S.pend.shift();
    }
    // onWay = 已在路上的豆数；left 只在豆子真正进车时才减（用户要求）
    // 【必须原样带上 decoy 的数值】1=ghost / 2=greedy，语义不同：
    // isZombie 只把 ghost(1) 判成僵尸车（可看广告拖走），greedy(2) 还能继续装豆。
    // 若写成 !!d.car.decoy 会把 2 压成 true，`decoy === 1` 判定失效 → greedy 被
    // 当成僵尸车，玩家会花广告去清一辆还能干活的车。
    // 【离场铁律】此处不再有「该色清空就放行」的通道 —— 车只能靠装满或广告权益离场。
    S.slots[hit] = { color: d.car.color, cap: d.car.cap, left: d.car.cap, decoy: d.car.decoy || 0, onWay: 0, bump: 0, anim: 0, door: 0, leave: -1, fx: d.ox, fy: d.oy };
    S.refillT = 0;                       // 触发队列补位动效
    S.moves++;
    // 【真人日志】玩家唯一的主动操作就是「拖一辆车进某个位」。
    // 记下车色/容量/落在几号位/当前占了几个位 —— 复盘死局时这四个量就够还原现场。
    plog('拖车', d.car.color + '(' + d.car.cap + '人) → ' + hit + '号位' +
         ' 已占' + (6 - freeSlots()) + '/6' + (d.car.decoy === 1 ? ' [ghost]' : ''));
    S.hintedFree = 0;
    S.amCache = undefined;               // 【必须】新车入位 = 可动性变了，作废 watchdog 缓存
    sfxDrop(); vib('medium');
    setTimeout(sfxDoor, 150);            // 开门音
    queueSuck(260);                   // 等门开完再吸
  }

  // ── 节奏参数（IAA 核心：靠等待时长驱动看广告）────────────────
  // 设计约束（用户要求）：一次广告 ≈30s，看广告的收益必须 > 这次等待的时间。
  // 加速倍率 2.8x → 省下的时间 = 剩余时长 ×(1-1/2.8) = 剩余时长 ×0.64。
  // 要让「省下的 > 30s」，剩余时长需 >47s。单关 199 豆 × 出发间隔 420ms ≈ 84s，
  // 只要还剩一半豆没走，看广告就一定划算。
  // 【v4 吞吐契约】（用户校准）速度不再凭手感调，改成按「人/秒」倒推：
  //   单车契约 = perSec 颗/秒 → 30 颗豆上同一辆车必须 30/perSec 秒内走完。
  //   perSec = 6 → 30 颗 = 5 秒。多辆车是并行的，所以整体 = perSec × 车数。
  // 由此反推两个参数，不再手调：
  //   release = 1000/perSec = 167ms（放行间隔）
  //   walk 必须快到「排队间距不成为瓶颈」：lead 格的步行耗时 < release，
  //   即 lead*cell/walk < release → walk > 2*32/0.167 = 383 px/s，取 420 有余量。
  //   否则闸门设了 167ms 也没用，实际速度会被慢步行拖回去。
  var PER_SEC = 6;
  var SPD = {
    walk: 1000,       // 阵内走路 px/s。【用户反馈「每关还是太慢」】760→1000。
                      // 硬约束：lead*cell/walk < release → 2*20/1000 = 40ms < 110ms ✓
    ride: 2000,       // 出阵后沿车道平移，比走路更快（已经不占阵内格子，不必排队）
    lead: 2,          // 排队间距：前面那颗走过 2 格，后面那颗才解锁起步（同向成队）
    perSec: PER_SEC,  // 单车吞吐契约：每辆车每秒放行几颗
    release: Math.round(1000 / PER_SEC),  // = 167ms，仅作为历史基准保留
    laneGap: 10,      // 每辆车占一条独立横向车道，6 条平行道互不穿插
    boost: 3,
    adSec: 30,
    // 【已废弃 minGain】原来是「省不到 22 秒就不卖加速」的秒数门槛。
    // 提速后全关最长 24s，boostGain 最多 15.8s，这个门槛永远过不去 → 广告位点不动。
    // 现已改为按剩余豆占比判定（见 useBoost 上方注释），这里不再需要任何秒数阈值。
    minGain: 0,
    // ══════════════════════════════════════════════════════════════════
    // 【节拍模型 v5 · 用户校准 2026-08-28】「单车节拍恒定」取代「全场吞吐恒定」
    // ══════════════════════════════════════════════════════════════════
    // 用户原话：「现在每关还是太慢 尤其是场上车多的时候 能不能保持一个跟之前
    //   一辆车一样的速度 才有爽感」
    //
    // 【v4 错在哪（这是关键，别再改回去）】v4 的目标是「全场吞吐恒定」，公式
    //   release = 基准 × lanes / targetLanes
    // 于是 lanes 越多，【每辆车】的放行间隔就越长：
    //   lanes=1 → 105ms/颗（每车 9.5 颗/秒）
    //   lanes=5 → 167ms/颗（每车 6.0 颗/秒）  ← 慢了 1.6 倍
    // 玩家的注意力是盯着【某一辆车】看的，不会去感知「全场总吞吐」。
    // 所以车越多反而每辆越慢 = 用户体感「车多的时候特别慢」，一字不差。
    // 「全场吞吐恒定」这个目标本身就是错的 —— 多开车位本该更快，那才是奖励。
    //
    // 【v5 口径】perCar 是常量，与 lanes 完全无关：
    //   任意车数下，每辆车都是 perCar ms 放一颗 → 单车观感永远等于「只有一辆车」时。
    //   全场吞吐 = lanes / perCar，随车数线性上升（车位解锁 = 真加速，正反馈）。
    //
    // 【性能怎么保】不再靠拖慢节拍，改用「并发飞行豆上限」硬闸门（maxFlights）：
    //   帧成本正比于【同屏在飞的豆数】，不是放行频率。直接钳住飞行豆数量，
    //   既守住 fps，又完全不牺牲单车的爽感。这是比 v4 更对的性能杠杆。
    perCar: 110,          // 【核心】每辆车的放行间隔（ms），常量，不随 lanes 变
    maxFlights: 30,       // 同屏在飞豆上限。超过则本轮全车暂停放行（渲染保护）
                          // 【真机校准】曾无上限时 5 车 × 快节拍 → 同屏 50+ 豆，
                          // 长帧 150ms。30 是「密到有爽感」与「稳 60fps」的平衡点。
    walkMax: 1400         // 走路速度上限（加速道具/追赶时用）
  };
  function mul() { return S && S.speed2 ? SPD.boost : 1; }

  // ══ 【排队上车 · 用户第二次反馈「排队上车的效果还是没做啊」】═══════════════
  // 三个参数配合 spawnWalk 的登车闸门 + 渲染侧的队列错开，共同实现「看得见的队伍」。
  var flightSeq = 0;      // 排队序号发号器：保证「先到车门的先上车」，绝不插队
  // 【登车节奏】同一辆车相邻两颗豆进门的最小间隔。
  // 硬约束：必须 < SPD.perCar（110ms），否则闸门比放行还慢 → 队伍只会越排越长、
  // 最后排到屏幕外面去。
  // 【用户第三次反馈「排队上车的效果我还是没看到」· 根因是调参调没了】
  //   62ms 在数学上确实实现了先后顺序，但 62ms ≈ 3.7 帧 —— 肉眼根本分辨不出
  //   「一个一个进」，看起来就是一起涌进去。功能是对的，剂量不足等于没做。
  // 【为什么敢提到 100】perCar=110 是【每辆车】的放行间隔，也就是同一辆车
  //   最快 110ms 才会再来一颗豆。把闸门设到 100ms（仍 < 110）后：
  //     · 正常单流：豆到门口时上一颗早已进去 → 闸门不拦，节奏完全不变
  //     · 拥堵时（多颗豆同时抵达同一辆车）：才会真正排队，且每个间隔 100ms
  //       ≈ 6 帧，肉眼能清楚看到「一个、一个、一个」地进门
  //   即只在该排队的时候才排队，不牺牲畅通时的流畅度。
  var BOARD_MS = 100;
  // 【排队间距】等待的豆沿来路往后错开的像素数。
  // 30px 约等于一颗豆宽，相邻两颗几乎贴在一起 → 看起来是「挤成一团」而不是
  // 「排成一队」。提到 46px（约 1.5 颗豆宽）后豆与豆之间有明显空隙，
  // 纵队的「列」才读得出来。再大就会排到屏幕外，46 是实测的平衡点。
  var QGAP = 46;
  // ── 【行车通道子车道 · 进出共用】────────────────────────────────
  // 6 个车位各占一条独立的 corridor y 偏移，任意两辆车 y 恒不相等 →
  // 无论同向还是对向、入位还是离场，都不可能重叠穿模。
  // 【为什么提到模块作用域】离场循环里原有一份同样的 EXIT_LANE 局部数组；
  // 入位动画（用户 2026-08-30 要求「按路径开过去」）必须走【同一条道】才闭环，
  // 两处各写一份迟早会改歪，所以统一到这里由两边共同引用。
  var IN_LANE = [-34, -20, -6, 6, 20, 34];

  // ══ 【真人操作日志 · 用户 2026-08-30】═══════════════════════════════
  // 原话：「你加点日志 移除掉那些 ms 的数据 只保留关卡和我的操作 我给你真实模拟数据」
  // 【用途】我之前所有难度数字都是模拟玩家跑的（完美信息、不看漏、不手滑），
  //   真人难度必然更高。这份日志就是把真人的每一步捞回来重新标定难度曲线。
  // 【刻意不打什么】一切 ms/耗时/帧率/坐标/动画进度 —— 那些是我调性能用的噪声，
  //   淹没了真正有用的信号。用户只要「第几关 + 我干了什么 + 结果」。
  // 【格式】固定前缀 [PD] 方便一键过滤：真机 vConsole 里搜 PD 就只剩这些行。
  // ── 【非操作日志开关】用户 2026-08-30「日志还有很多无效信息」──────────
  // [save]/[item]/[popup]/[boudoir] 都是「我调代码要看的」，不是「玩家干了什么」。
  // 它们频次不高但会掺在 [PD] 操作流里干扰阅读。同样只收 log，warn/error 永远保留。
  var DIAG = false;
  function dlog() { if (DIAG) console.log.apply(console, arguments); }
  var plogN = 0;
  function plog(act, detail) {
    plogN++;
    console.log('[PD] #' + plogN + ' 关' + ((S && S.lv) ? S.lv.id : '?') +
                ' ' + act + (detail ? ' ' + detail : ''));
  }

  // ── 节拍 v5：单车恒定，不随车数变慢 ────────────────────────────
  // 返回 { release, walk, ride, lanes }。release 现在是常量 SPD.perCar，
  // 保留返回字段是为了不改 suck()/spawnWalk() 的调用签名。
  function pace() {
    var lanes = 0, i;
    if (S && S.slots) {
      for (i = 0; i < 6; i++) {
        var c = S.slots[i];
        if (c && c.leave < 0 && (c.left - c.onWay) > 0) lanes++;
      }
    }
    return { release: SPD.perCar, walk: SPD.walk, ride: SPD.ride, lanes: lanes };
  }

  // ── 剩余等待时长预估（IAA 卡点的数学依据）─────────────────
  // 多车并行 → 实际墙钟时间 ≈ 总出发时长 / 并行车数，再加一颗豆的走完时长。
  function etaRemain() {
    if (!S) return 0;
    var left = S.total - S.cleared;
    if (left <= 0) return 0;
    var lanes = 0, i;
    for (i = 0; i < 6; i++) if (S.slots[i] && S.slots[i].leave < 0) lanes++;
    if (lanes < 1) lanes = 1;
    var span = (S.bounds.maxY - S.bounds.minY) * L.cell / SPD.walk + 460 / SPD.ride;
    // 【v3 修正】吞吐不再由 lead 间距决定，而由排队闸门决定：
    // 每辆车每 release ms 放行 1 颗 → 单车吞吐 = 1/release，lanes 辆车并行。
    // 旧公式还在用 lead*cell/walk，cell 从 24 改到 32 后估算已经偏了，
    // 直接导致「看广告能省多少秒」算错 → 变现卡点开在错误的时机。
    var perLane = left / lanes * (SPD.perCar / 1000);
    return perLane + span;
  }
  // 看这次广告能省下多少秒（需 > 30s 才向用户开放，不坑用户）
  // 【零引用说明】唯一调用点已随「加速改走弹窗」删除（弹窗文案主打连击而非省秒数）。
  // 保留函数本体是刻意的：调试面板和以后可能的「预计省 Xs」文案都要用它，
  // 而它只有一行、不占包体。若做代码瘦身可以安全删除。
  function boostGain() { return etaRemain() * (1 - 1 / SPD.boost); }
  // 注：旧的 boostWorth()（靠 boostGain > minGain 判定）已删除 —— 见 useBoost 上方长注释。
  // 秒数门槛在「快游戏」里必然失效，现在统一由 boostWorth2() 用剩余豆占比判定。

  // 离边界深度（0=最外圈）—— 驱动「必须从外开始走」的出发顺序
  function depthOf(b) {
    var d = S.bounds;
    return Math.min(b.gx - d.minX, d.maxX - b.gx, b.gy - d.minY, d.maxY - b.gy);
  }

  // ── 派豆：【重构】两条铁律 ──────────────────────────────
  //  A. 绝不穿豆：豆子出发后仍然占位（moving=true 但 gone=false），
  //     走过 lead 格才释放。旧 bug：一出发就 gone=true，但画面上它还在原地
  //     （或才走一半），于是后面那颗的路线被误判为空 → 直接从它身上踏过去。
  //  B. 排队前进：释放占位 = 后面那颗解锁起步 → 同向多颗以固定车距成队同行，
  //     不靠 setTimeout 硬等（旧版 gap=760ms 串行排队，所以慢得像龟）。
  // ── 派豆 v3【用户校准：排队上车】────────────────────────────
  //  A. 绝不穿豆：豆出发后仍占位（moving=true, gone=false），走过 lead 格才释放；
  //     另外把「在途豆当前所在格」也登记为墙 → 后面的豆不会撞上/穿过正在走的人。
  //  B. 排排队：每辆车每 SPD.release ms 只放行 1 颗豆。
  //     所以同一辆车的豆是「一个接一个」沿同一条走廊跟进 = 一条纵队，
  //     而不是一个 tick 里 room 颗豆同时炸出去（那就是用户说的「同时动、没秩序」）。
  //  C. 最短路：canWalk 内部走 BFS —— 前面空就直着下来，旁边有人才绕。
  function reservedCells() {
    // 在途豆「当前踩着的格子」= 墙。只锁一格，不锁整条剩余路径 ——
    // 锁整条会把后面的豆逼去绕远路（又变成发散）；只锁一格 = 跟在后面排队。
    var rs = {}, i;
    for (i = 0; i < flights.length; i++) {
      var f = flights[i];
      if (f.gx === undefined) continue;
      rs[f.gx + '_' + f.gy] = 1;
    }
    return rs;
  }
  // 【suck 单飞去抖 · 2026-09-04】旧写法 8 处 setTimeout(suck)：每颗豆过 lead 格、
  // 每次落座/腾位都单独排一个 → 极限段每秒 30+ 次全量重算（top/occ 索引 +
  // 每车扫全部豆 + gateValue），且调用之间几乎无差别。改单飞合并：同一时刻
  // 只允许一个挂起的 suck，先到先得（watchdog 每 90ms 的泵本来就会补敲，
  // 最坏延迟 ≤90ms，远小于 perCar 110ms 的放行闸门，吞吐不受影响）。
  var suckTimer = null;
  function queueSuck(delay) {
    if (suckTimer) return;                    // 已有挂起 → 本次合并进那一次
    suckTimer = setTimeout(function () { suckTimer = null; suck(); }, delay || 0);
  }
  // 【索引访问器 · 2026-09-04】top/occ 只在豆 gone 时变化（moving 不影响这两个
  // 结构），缓存到 freed 处统一作废。注意：绝不能手改返回值。
  function curTop() { if (!S.topC) S.topC = PD.buildTopIndex(S.beans); return S.topC; }
  function curOcc() { if (!S.occC) S.occC = PD.buildOccupancy(S.beans); return S.occC; }
  // 【桶维护 · 2026-09-04】豆起步 → 移出静态桶（splice 保持序，不用 swap-pop）
  function removeFromBucket(b) {
    var arr = S && S.bucket && S.bucket[b.color];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === b) { arr.splice(i, 1); return; }
    }
  }
  function suck() {
    if (!S || S.phase !== 'play') return;
    var top = curTop();
    var occ = curOcc();
    var rs = reservedCells();
    var bd = S.bounds;
    // 【性能】先灌一次可达水，后面筛候选豆全走 O(1) 查表；
    // 只对【确认可走】的那一颗再跑一次 pathOut 取具体路径。
    // 旧写法是对每个候选都跑 BFS，最坏情况（该色全被围住）会把整色扫完
    // → 单次 suck 就是几百次 BFS。而 suck 每 90ms 被 watchdog 重敏一次。
    var reach = PD.buildReach(occ, bd, rs);
    var any = false, si, i;
    var now = Date.now();
    // 【节拍 v5】单车恒定节拍，不再随车数变慢（见 SPD.perCar 上方长注释）
    var PC = pace();
    // 【并发飞行豆闸门 v5】提速后必须有这道保护：帧成本正比于【同屏在飞豆数】，
    // 不是放行频率。之前靠「车多就把每辆车拖慢」间接控总量（结果毁了爽感），
    // 现在改成直接钳住总量 —— 单车永远快，但同屏最多 maxFlights 颗。
    // 逼近上限时全车暂停放行一轮，watchdog 每 90ms 会重敏，不会卡死。
    if (flights.length >= SPD.maxFlights) return;
    // 【性能】格子索引整轮只建一次，6 个车位共用。
    // 上一版把它放在车位循环里 → 每 90ms 重建 6 次全场索引（500 豆 × 6 = 3000 次
    // 字符串拼接 + 数千临时数组）→ 实测掉到 fps 6~13。这是懒建：只有真需要排序时才建。
    var cellIdx = null;

    for (si = 0; si < 6; si++) {
      var car = S.slots[si];
      if (!car || car.leave >= 0) continue;
      var room = car.left - car.onWay;
      if (room <= 0) continue;
      // 【排队闸门】这辆车上一颗豆放行还不到 perCar ms → 本轮不放，让它排着。
      // v5：perCar 是常量，和场上车数无关 —— 5 辆车时每辆仍是 110ms 一颗，
      // 单车观感完全等于「只有一辆车」时，这就是用户要的爽感。
      if (car.relT !== undefined && now - car.relT < PC.release) continue;

      // ── 候选筛选：先用 O(1) 查表只留「此刻真能走」的豆 ──────────────
      // 【性能铁律】必须先过滤再排序，绝不能反过来。
      // 同色豆可能有 200+ 颗，但其中真能走的通常只有 3~10 颗（外圈那一层）。
      // 上一版对全部 200 颗算卡口值 → 白算 190 次。现在只对能走的算。
      var cands = [];
      var pool = S.bucket[car.color] || [];   // 【桶索引】只扫该色静止豆，与全量扫同序
      for (i = 0; i < pool.length; i++) {
        var b0 = pool[i];
        if (!PD.canWalkFast(b0, top, reach)) continue;      // O(1)，无 BFS
        cands.push(b0);
        if (cands.length >= 24) break;                      // 够挑了，再多也只取第 1 颗
      }
      if (!cands.length) continue;
      // ── 【卡口感知排序】用户校准 ────────────────────────────────
      // 用户原话：「无关紧要、不是核心卡口的豆子应该先上车，那些一旦放了就漏出
      //   其他颜色的卡扣豆子应该最后放出来（这样也能增加难度）」
      // 旧排序只看 depthOf（到包围盒的边距），完全不知道哪颗是卡口 —— 于是经常
      // 一上车就把内层一大片连锁漏出来，玩家什么都没决策，难度自己塌了。
      //
      // 新排序键（依次比较）：
      //   ① gate.colors —— 会漏出几个【新颜色】。最关键：漏出新色 = 队列里那一色的
      //      车瞬间从「空转」变「能干活」，全局决策格局直接改变。必须压到最后。
      //   ② gate.beans  —— 会解锁几颗新豆。次要，但同样是「拆墙」行为。
      //   ③ depthOf     —— 同卡口值时仍保持「从外往内」的视觉秩序（原有手感不变）。
      // 排序稳定性：末位用 gy 兜底，保证同 seed 同结果、不抖动。
      if (cands.length > 1) {
        if (!cellIdx) cellIdx = PD.buildCellIndex(S.beans);   // 懒建，整轮复用
        for (i = 0; i < cands.length; i++) {
          var gv = PD.gateValue(cands[i], S.beans, top, reach, cellIdx);
          cands[i]._gc = gv.colors;
          cands[i]._gb = gv.beans;
        }
        cands.sort(function (p, q) {
          return (p._gc - q._gc) || (p._gb - q._gb) ||
                 (depthOf(p) - depthOf(q)) || (p.gy - q.gy);
        });
      }

      // 每辆车本轮只放 1 颗 —— 这就是「排排队上车」
      for (i = 0; i < cands.length; i++) {
        var b = cands[i];
        // cands 里全部已通过 canWalkFast，这里只需取具体路径（每轮每车最多 1 次 BFS）
        var route = PD.canWalk(b, top, occ, bd, rs);
        if (!route) continue;                     // 理论不会走到这（双保险）
        b.moving = true;                          // 仍占位！不能让别人穿过
        removeFromBucket(b);                       // 【桶维护】起步的豆退出静态桶
        // 【缓存增量】走起来的豆不再属于静止阵。原来这里置 null 触发全量重绘（620 次
        // drawBean），是真机长帧的主因。改为只擦它那一小块并补画邻居（约 9 次）。
        // 增量失败（缓存还没建 / 取不到 ctx）才退回全量重建，行为不变。
        if (!beanCacheDrop(b)) beanCache = null;
        // 【性能】此处原有一次 buildTopIndex(S.beans) 已删除：
        // buildTopIndex 只跳过 b.gone 的豆，而这里只把 b.moving 置 1（gone 仍为 false）
        // → 重建结果与重建前【逐字节相同】，是一次纯浪费的 O(N)。每放行一颗豆就白跑
        // 一遍全场，是长帧的次要来源。豆真正离场时（onFlightDone 里 gone=true）
        // 下一轮 suck 开头会自然重建，口径不受影响。
        car.onWay++;
        car.relT = now;
        spawnWalk(b, route, si);
        any = true;
        break;
      }
    }
    if (!any && !flights.length) checkStuck();
  }

  // ── 生成走路路径 v3【用户校准】───────────────────────────────
  // route.cells 已经是 BFS 算出的最短路（前面空 → 一路直下；旁边有人 → 已自动绕开）。
  // 这里只负责把「出阵之后」的那一小段接上：出口 → 本车专属车道 → 车门。
  // 关键：出口已经在豆阵下沿之外，所以不再需要「绕侧边」那套逻辑 —— 那是旧模型
  // 强行让每颗豆都绕外围的根源（用户明确否掉了）。
  function spawnWalk(b, route, si) {
    var a = beanXY(b), r = slotRect(si), i;

    var pts = [{ x: a.x, y: a.y }];
    // ① 阵内按 BFS 最短路逐格行走（这段保证不碰任何豆、不穿模）
    for (i = 0; i < route.cells.length; i++) {
      pts.push({ x: L.beanCX + route.cells[i].gx * L.cell, y: L.beanTop + route.cells[i].gy * L.cell });
    }
    var inArr = route.cells.length;
    var ex = pts[pts.length - 1].x;

    var door = { x: r.x + r.w / 2, y: r.y + r.h * .30 };
    // 每辆车一条专属横向车道，6 辆车 6 条平行道，互不穿插
    var lane = L.laneY + si * SPD.laneGap;
    // ② 出口 → 自己那条车道（竖直下来，出口已在豆阵外，不会穿阵）
    pts.push({ x: ex, y: lane });
    // ③ 沿专属车道平移到车门正上方 → ④ 进门
    pts.push({ x: door.x, y: lane });
    pts.push(door);

    var segs = [], total = 0;
    // 【自适应节拍】闸门放宽时步行必须同步加速，否则闸门形同虚设（详见 pace() 注释）。
    // 每颗豆在【出发那一刻】锁定自己的速度，途中不再变 —— 避免同屏豆子忽快忽慢。
    var PC = pace();
    for (i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var v = (i <= inArr) ? PC.walk : PC.ride;
      var d = len / v * 1000;
      segs.push({ d: d, len: len });
      total += d;
    }
    // ══ 【排队上车 · 用户第二次反馈「排队上车的效果还是没做啊」】═══════════
    // 【我上次错在哪】上次只在落座那一下加了 squash&stretch（duang），
    // 但那是【单颗豆的落地反馈】，不是「队列」。豆子依然是一颗接一颗直接钻进车门、
    // 中间没有任何「停下来等前面那个」的画面 —— 所以根本看不出在排队。
    // 真正的排队必须有三个要素，缺一个都不像：
    //   ① 有一条【看得见的队伍】：多颗豆同时停在车门前，沿车道排成一列
    //   ② 有【逐个进门】的节奏：前面那个上车了，后面整队才向前挪一格
    //   ③ 挪动时是【走过去】的，不是整队瞬移
    // 【实现】给最后一段（车门前 → 车门）加一道「登车闸门」：
    //   豆子走到车门正前方时先申请登车，同一辆车 BOARD_MS 内只放一个进门；
    //   没轮到的就【停在原地等】，并按排队序号沿车道往后错开 QGAP 像素 —— 
    //   这就自然形成一列纵队。前面那颗进门后，后面每颗的序号 -1，整队往前走一格。
    // qdir = 队伍延伸方向（豆是从 ex 侧过来的，所以队尾朝 ex 那一侧排）
    var qdir = (ex - door.x) >= 0 ? 1 : -1;
    flights.push({
      color: b.color, si: si, car: S.slots[si],   // 绑定车对象本身，不只是槽位下标
      pts: pts, segs: segs, total: total,
      cells: route.cells,                         // 供 reservedCells() 算「当前踩哪格」
      gx: b.gx, gy: b.gy,                         // 当前所在格（每帧更新）
      t: 0, bean: b, inArr: inArr, freed: false,
      // ── 排队上车用 ──
      preTotal: total - segs[segs.length - 1].d,  // 走到「车门正前方」所需时间
      qdir: qdir,                                 // 队伍往哪一侧排
      boarded: 0,                                 // 是否已获准进门
      waiting: 0,                                 // 本帧是否在排队等待（渲染用）
      qrank: -1,                                  // 排队位次：-1=不在排队，0=队首，n=车尾后方第 n 个坑位
      seq: flightSeq++                            // 全局递增序号 = 排队先后（先到先上）
    });
  }
  // 排队序号发号器已提到 SPD 附近声明（ES5 var 只提升声明不提升赋值，
  // 放在使用点之后虽然本例安全，但本文件已有过这个坑，统一前置更稳）

  function onFlightDone(f) {
    // 【修正颜色识别】用 f.car（出发时绑定的那辆车），不是 S.slots[f.si]。
    // 旧 bug：看广告强拖车后槽位换了新车，在途豆会装进「颜色不对的车」。
    var car = S.slots[f.si];
    if (car !== f.car) car = null;                   // 车已换/已走 → 这颗豆不算进任何车
    if (car && car.color !== f.color) car = null;     // 双保险：颜色不符绝不装
    if (car) {
      car.onWay = Math.max(0, car.onWay - 1);
      car.left = Math.max(0, car.left - 1);
      car.bump = 1;                                  // 数字弹一下，强化因果
      // 【用户要求】「车在上人的时候对应的汽车要在原地震动的感觉，
      //   像真的在上人」—— 用「震动截止时间戳」而不是「一次性衰减动画」：
      //   每颗豆落座都把截止时间往后推 SHAKE_MS，而放行间隔是 perCar=110ms
      //   < SHAKE_MS(260ms) → 只要还在连续上人，车就一直抖；上完自然停。
      //   这和 pumpVib 的 vibUntil 是同一套思路（视觉震 + 触觉震同步）。
      car.shakeUntil = Date.now() + SHAKE_MS;
    } else if (f.car) {
      f.car.onWay = Math.max(0, f.car.onWay - 1);
    }
    S.cleared++;
    var now = Date.now();
    comboN = (now - comboT < 1500) ? comboN + 1 : 0;
    comboT = now; sfxBean(comboN);
    // 【用户要求 2】上车要有「持续震动反馈」的手感。
    // 单次 vibrateShort 是一个点，6 颗/秒时点与点之间有空档，手感是断续的「哒…哒…」。
    // 做法：每颗豆落座时把「震动截止时间」往后推 220ms，由 pumpVib() 在这段时间内
    // 持续补发短震 —— 只要豆子在连续上车，手上就是一条连着的震感；一停就自动收。
    vibUntil = now + 220;
    var r = slotRect(f.si);
    for (var i = 0; i < 5; i++) fx.push({ x: r.x + r.w / 2, y: r.y + 42, vx: (Math.random() - .5) * 3.4, vy: -Math.random() * 3.2 - .6, t: 0, life: 420, c: C[f.color].lite });

    // ── 离场规则 A：该色装满 → 立刻离场 ──
    // 【用户要求 5】装满 → 先抖一下 → 再发车，不再同一帧直接开走。
    if (car && car.left <= 0 && car.onWay <= 0) {
      var nowF = Date.now();
      car.fullShake = nowF + FULL_SHAKE_MS;      // 渲染侧靠它把抖幅放大
      car.shakeUntil = nowF + FULL_SHAKE_MS;     // 复用现成抖动通道
      vib('heavy');                              // 触觉上也要比单颗上人重
      // 闭包捕获 si 与 car：300ms 内局面可能变（广告强拖车/道具清车），
      // 必须确认「这个槽位上还是同一辆车」才发车，否则会把新车误发走。
      (function (siF, carF) {
        setTimeout(function () {
          if (S && S.slots[siF] === carF && carF.leave < 0) departCar(siF);
        }, FULL_SHAKE_MS);
      })(f.si, car);
    }
    if (S.cleared >= S.total) {
      S.phase = 'win'; S.winT = 0;
      // 【真人日志】通关：步数 vs 三星阈值 —— 这是判断「这关对真人到底难不难」的核心
      plog('★通关', '用了' + S.moves + '步(三星≤' + S.lv.stars.three +
           ' 二星≤' + S.lv.stars.two + ')');
      // 【用户要求 2】通关瞬间冻结耗时，之后弹窗停留多久都不再变
      S.useSec = Math.max(1, Math.round((Date.now() - S.t0) / 1000));
      // ── 【存档时机 2 · 通关结算】────────────────────────────────
      // 星级必须在【这一刻】算并冻结进 S.star，原因有两个：
      //  ① drawWin 每帧都在算 `S.moves <= stars.three ? 3 : ...`，而 S.moves 在
      //     win 之后仍可能被改（广告道具、僵尸车拖走都会 ++），于是弹窗上的星数
      //     会自己变 —— 玩家眼里就是「我三星怎么变两星了」。
      //  ② 累计星数只能加一次。若放在 drawWin 里累加，每帧加一次 → 星数爆炸。
      // 冻结后 drawWin 直接读 S.star，既修了跳变也让累加天然幂等。
      S.star = S.moves <= S.lv.stars.three ? 3 : (S.moves <= S.lv.stars.two ? 2 : 1);
      totalStars += S.star;
      saveProgress();
      // ── 通关音频序列（用户要求）：先 2s 欢快成功音效，再接美女感谢语音 ──
      // 顺序不能反：音效是"结果反馈"（即时），语音是"情绪奖励"（叙事），
      // 语音压在音效上会互相糊掉，所以延迟 900ms 等音效主体过去再进人声。
      sfxSuccess();
      playVoice(winVoice(girlOf(), lvNo), 900);
      vib('heavy');
      return;
    }
    // ── 离场规则 B【已收窄 · 只服务「看广告扩容」的车】──────────────
    // 【用户铁律】「车跑的逻辑 only 装满或者看广告获得的权益」。
    // 原来这条规则会把任何「该色清空但没装满」的车放走，正是用户看到的
    // 「车没装满你咋就让他们跑了」。根因不在这里，而在 pd-levelgen 的冗余率 S：
    // S>0 时每色总容量严格大于豆数 → 最后一辆车数学上永远装不满 → 只能靠这条
    // 规则兜底。现在 S 已归零（每色总容量 === 豆数），规则 A 覆盖 100% 的正常离场。
    // 唯一还需要兜底的是【看广告把容量翻倍】的车：cap 被人为撑大，必然装不满，
    // 若不放它走就变成玩家「花了一次广告反而把车位锁死」—— 那是惩罚付费行为。
    releaseAdBoostedCars();
    queueSuck(40);                              // 有豆进车 → 重新评估通路
  }

  // ── 放行「看广告扩容过」的车（唯一允许未装满离场的通道）────────────
  // 【为什么只放这一种】用户铁律：车只能靠①装满 ②广告权益 离场。
  // 扩容车的 cap 是被广告人为翻倍的，该色豆全清空后它必然装不满，
  // 此时它已经把该色全部豆吸干、任务完成 → 放它走是在兑现广告权益，
  // 而不是「没装满就跑」。普通车绝不走这条路：S=0 保证它们一定能装满。
  function releaseAdBoostedCars() {
    if (!S || S.phase !== 'play') return;
    var i;
    for (i = 0; i < 6; i++) {
      var c = S.slots[i];
      if (!c || c.leave >= 0) continue;
      if (c.onWay > 0) continue;          // 还有豆在路上飞向它 → 不能走，否则那颗豆没车装
      if (c.adUp !== 1) continue;         // 【核心】只有广告扩容车有这个豁免权
      // 【存活计数 · 2026-09-04】colorAlive = 未消失豆数（含在途），与旧 rest
      // 全量扫描同口径，O(1)
      if (!S.colorAlive[c.color]) departCar(i);   // 该色已清空 → 兑现广告权益，放行腾位
    }
  }

  // ── 死局判定（IAA 关键机会点）────────────────────────────────
  // 用户诉求：车位占满且推不动 = 闯关失败，必须给「看广告」的出路，不能卡死。
  // 三档：
  //   soft  车位没满但当前无路可走（还能拖车）→ 只提示
  //   stuck 车位占满 + 无豆可走 + 队列还有车 → 死局弹窗（3 个广告选项）
  //   fail  车位占满 + 无豆可走 + 队列空了   → 死局弹窗（同上）
  // 【误报死局修复】用户反馈：「我明明有红车、外面也有没被包围的红豆，却报车位占满且没豆能走」
  // 三个根因，逐个修掉：
  //  ① 少传 reserved：suck() 传了第 5 参、这里没传 → 两处墙判定不一致，
  //     出现「suck 能放行 / anyMovable 说走不了」的矛盾，于是被误判死局。
  //  ② c.left - c.onWay <= 0 把「豆已在路上但还没进车」的车当成没救了，
  //     可它其实马上就会腾出容量 → 不该据此判死。
  //  ③ 只看已入位的车。队列里还有车 + 有空位时，用户完全能自己拖车破局。
  function anyMovable() {
    var top = curTop();
    var occ = curOcc();
    var rs = reservedCells();
    // 【性能】旧写法对每颗豆调一次 canWalk（= 一次 BFS）→ O(N × 网格)，
    // 532 豆时实测 17.8ms/次（桌面 Node，手机 ×5~10），而 watchdog 每帧都调它
    // → 单这一个函数就吃掉整个帧预算。现在只灌一次水，每颗豆 O(1) 查表。
    var reach = PD.buildReach(occ, S.bounds, rs);
    for (var s = 0; s < 6; s++) {
      var c = S.slots[s];
      if (!c || c.leave >= 0 || c.left <= 0) continue;   // 用 left 而非 left-onWay
      var arr = S.bucket[c.color] || [];                 // 【桶索引】只扫该色静止豆
      for (var j = 0; j < arr.length; j++) {
        if (PD.canWalkFast(arr[j], top, reach)) return true;
      }
    }
    return false;
  }
  // ── 【用户要求】车一离开车位，下一辆就能进 ────────────────────
  // 旧做法：车留在 S.slots[i] 里跑完整段离场动画才置 null → 这段时间车位被
  //   占着，新车进不来，手感很卡。
  // 新做法：触发离场就立刻把车搬到独立的 leaving[] 里自己跑动画，
  //   S.slots[si] 马上置 null → 车位真正腾空，新车可立即入位。
  function departCar(si) {
    var c = S.slots[si];
    if (!c) return;
    c.si = si; c.leave = 0;
    leaving.push(c);
    S.slots[si] = null;
    // 【用户反馈 3·「解救成功前好像有两个音效，有点割裂」—— 就是这里。
    // 最后一颗豆上车时依次发生：sfxBean(duang) → departCar 的 sfxLeave(whoosh+鸣笛)
    // → sfxSuccess(2s 琦音)。三段声音在 ~100ms 内叠在一起，而 whoosh 和 success
    // 频域还重叠，听感就是「两个音效抢拍」。
    // 修法：最后一辆车（豆已清完）不再发自己的离场音，把收束时刻完整交给
    // sfxSuccess 一个音—— 结局只应该有一个“结束感”的声音。
    var isFinal = S && S.total && S.cleared >= S.total;
    if (!isFinal) { sfxLeave(); vib('medium'); }
    // 【用户校准】星芒锚在【车位原地】，不跟车走。必须在 S.slots[si] 置空【之前】
    // 就把坐标取好 —— slotRect(si) 只依赖下标不依赖车，所以这里顺序其实无关，
    // 但语义上「装满的那一瞬间、那个车位」就是爆点，写在这里最直白。
    spawnPuff(si);
    S.amCache = undefined;               // 【必须】车位腾空 = 可动性变了，作废缓存
    queueSuck(0);
  }
  function freeSlots() {
    var cap = S.slot6Locked ? 5 : 6, used = 0;
    for (var i = 0; i < 6; i++) if (S.slots[i]) used++;
    return cap - used;
  }
  // 【稀疏队列】queue 是固定 8 格且允许有洞，所以 S.queue.length 永远是 8，
  // 不再等于「还剩几辆车」。所有“还有待发车吗”的判定必须走这里，
  // 否则洞会被当成车 → 死局判定、刷新按钮全部算错。
  function queueCount() {
    var n = 0, i;
    for (i = 0; i < 8; i++) if (S.queue[i]) n++;
    return n + (S.pend ? S.pend.length : 0);
  }
  function checkStuck() {
    if (!S || S.phase !== 'play') return;
    if (flights.length) return;
    if (anyMovable()) { S.stuckT = 0; return; }
    // 还有空位 + 队列有车 → 用户还能自己拖车破局，不算死
    if (freeSlots() > 0 && queueCount()) {
      S.stuckT = 0;
      if (!S.hintedFree) { S.hintedFree = 1; toast('滑动一辆小车到上面的空位继续~'); }
      return;
    }
    enterDead();
  }
  // 【用户要求 1 + 2 · 本轮】死局入口统一收口。
  // 原来两处各写一行 `S.phase='dead'; S.deadT=0; vib; sfxDeny()`，
  // 本轮要加【失败沮丧音】+【3 秒后弹复活窗】，再拷一份就是两处必然走歧。
  function enterDead() {
    if (!S || S.phase === 'dead') return;
    // ══ 【判负前最后一道闸 · 用户 2026-08-30】═══════════════════════════
    // 90ms 巡检已经能兜住满车漏发，但判负是【不可逆】的用户体验事故 ——
    // 万一巡检和判负在同一帧的先后顺序不对（watchdog 里 stuckT 累加到 900ms
    // 与巡检同处一个 tick），玩家就会在「其实还能玩」时被判负。
    // 所以这里再兜一次：只要有任何满车能腾位，就不判负，直接返回让局面继续。
    var ed, ec, freed = 0;
    for (ed = 0; ed < 6; ed++) {
      ec = S.slots[ed];
      if (ec && ec.leave < 0 && ec.left <= 0 && ec.onWay <= 0) { departCar(ed); freed++; }
    }
    if (freed) {
      plog('!判负拦截', '有' + freed + '辆满车没开走，已放行，不判负');
      S.stuckT = 0; S.amCache = undefined;
      return;
    }
    S.phase = 'dead'; S.deadT = 0;
    // 【真人日志】死局现场：走到第几步死的、还剩多少豆没运走、6 个位分别是什么色。
    // 这是最值钱的一行 —— 我之前判「ghost 无效」全靠模拟器，真人死局长什么样得看这个。
    var dz = [], dzi;
    for (dzi = 0; dzi < 6; dzi++) {
      var dsc = S.slots[dzi];
      // 【必须区分「空」和「锁」· 用户 2026-08-30】原来两者都打成「空」，
      // 于是日志显示「有空位却判负」，把用户和我一起误导去查判负逻辑 ——
      // 而第 6 位其实是没解锁的，freeSlots() 压根不把它算进可用位。
      if (!dsc) { dz.push((dzi === 5 && S.slot6Locked) ? '锁' : '空'); continue; }
      dz.push(dsc.color + ':' + dsc.left + (dsc.decoy === 1 ? 'G' : ''));
    }
    plog('✗死局', '第' + S.moves + '步 剩' + (S.total - S.cleared) + '豆 位[' + dz.join(' ') + ']');
    vib('heavy');
    // 用 sfxFail 而不是 sfxDeny：deny 是「这一下不合法」的短促拒绝音，
    // 输了一局需要的是「泄气/失落」的下行长音，两者情绪量级完全不同。
    sfxFail();
    // 【必须在此预加载】fail_ribbon 归属 popup 资源组，而该组原本只在 openPopup
    // 里才 loadPopupUI()。但失败页是【弹窗前 3 秒就要显示缎带】的，
    // 不在这里预加载的话：前 3 秒会回落成旧的程序化蓝缎带，等弹窗开了才突然
    // 变成新图 —— 用户会看到顶部图【当场跳变】，那比不换图还难看。
    loadPopupUI();
  }

  // 看门狗：车位满了但用户干等（豆子走完了也没进展）→ 主动判死，绝不静默卡住
  function watchdog(dt) {
    if (!S || S.phase !== 'play') return;
    // 【排队泵】suck() 现在有 release 闸门：可能本轮什么都没放行就返回。
    // 若不定时重敲，队伍就会永久停摆。这里每 90ms 敲一次，闸门到点自然放下一颗。
    S.pumpT = (S.pumpT || 0) + dt;
    if (S.pumpT > 90) {
      S.pumpT = 0;
      // 【安全网】同时重扫一次广告扩容车。onFlightDone 里已经扫了，但有一种边界
      // 情况它盖不到：看广告扩容后该色刚好已清空 → 没有任何豆会再落地 →
      // onFlightDone 不会触发 → 那辆扩容车会静静占着位。这里每 90ms 兑一次。
      releaseAdBoostedCars();
      // ══ 【安全网 · 满车必开走】用户 2026-08-30 真机实测 ═══════════════
      // 【现场】关3 死局日志：位[yellow:12 cyan:0 white:12G green:8G yellow:4 锁]
      //   —— cyan 已装满 12 人（left=0）却还占着车位，6 位占死 → 误判负。
      //   用户读到的现象是「绿车开走了，候选还有绿色，凭什么判我负」：
      //   实际是那辆满车堵着，新车根本进不来。
      // 【根因】「装满 → 离场」的判断只挂在 onFlightDone（豆子落座那一刻）里，
      //   是【一次性事件】。一旦那一次没触发，就永远没有第二次机会 ——
      //   因为车已经满了，不会再有豆进来，onFlightDone 也就不会再为它执行。
      //   已知能错过的路径：① 落座瞬间该槽位的车被换掉（看广告强拖车/道具清车）
      //   → car !== f.car → 走 else 分支只减 onWay，压根不检查离场；
      //   ② 300ms 延迟发车的 setTimeout 期间车被换走 → 守卫判定失败后无人补发。
      // 【修法】不再依赖单次事件，改为每 90ms 巡检一遍：任何「满了、没豆在路上、
      //   还没在离场中」的车一律放行。这是幂等的 —— departCar 内部会置 leave=0
      //   并从 S.slots 摘走，重复巡检不会重复发车。
      var fi, fc;
      for (fi = 0; fi < 6; fi++) {
        fc = S.slots[fi];
        if (fc && fc.leave < 0 && fc.left <= 0 && fc.onWay <= 0) {
          plog('!满车补发', fc.color + ' ' + fi + '号位（漏发已兜住）');
          departCar(fi);
        }
      }
      if (!S.drag) suck();
    }
    if (flights.length || S.drag) { S.stuckT = 0; return; }
    if (freeSlots() > 0 && queueCount()) { S.stuckT = 0; return; }
    // 【性能 · 节流】anyMovable 即便优化到 O(网格) 仍要建索引 + 灌水（~0.15ms 桌面、
    // 手机 ~1ms），每帧都跑就是白烧 6% 的帧预算。而它只在「无飞行豆 + 无拖拽 +
    // 车位已满」这个静止态才会被走到 —— 这种状态下场面根本没变化，
    // 每帧重算的结论必然与上一帧相同。所以 150ms 复用一次结果完全等价，
    // 且远小于判死阈值 900ms（最多把判死延后 1 个采样周期，用户无感）。
    S.amT = (S.amT || 0) + dt;
    if (S.amT >= 150 || S.amCache === undefined) { S.amT = 0; S.amCache = anyMovable(); }
    if (S.amCache) { S.stuckT = 0; return; }
    S.stuckT += dt;
    if (S.stuckT > 900) enterDead();
  }
  function toast(m) { S.tip = m; S.tipT = 1600; }
  // 【用户要求 4】主页还没上线：所有「回主页」入口（胜利页主页键 / 失败页主页键 /
  // 左上角齿轮）统一给同一个 toast，不做任何跳转，避免用户点了没反应以为卡了。
  function goHome() { sfxDeny(); vib('light'); toast('主页还没上线呢，别急~'); }

  // ── 僵尸车判定（铁律 8）：该车剩余容量 > 该色场上剩余可取豆数 ──
  function isZombie(si) {
    if (!S || S.phase !== 'play') return false;
    var car = S.slots[si];
    if (!car || car.left <= 0 || car.leave >= 0) return false;
    // 【bug 修复 2026-09-04】补 onWay 判定：该色豆全在途时车马上要装满，
    // 旧写法会把这种车误标僵尸车 → 徽章闪现，玩家可能浪费一次广告去清
    // 一辆马上自己开走的车。
    if (car.onWay > 0) return false;
    // 【性能 · 桶索引】桶里只剩「静止未消失」的豆，与旧口径（!gone && !moving）
    // 完全一致，O(1)。
    // ghost 干扰车天生就是僵尸车（场上无同色豆），让「清空」道具优先清它。
    // greedy(2) 不算：它还能继续装豆，清掉反而浪费一次广告收益。
    if (car.decoy === 1) return true;
    var arr = S.bucket[car.color];
    return !arr || arr.length === 0;   // 该色静止豆已清空但车还没走
  }

  // ══════════════════════════════════════════════════════════════════
  // 道具设计铁律【用户校准 2026-08-28】：道具只能帮忙，绝不能添乱
  // ══════════════════════════════════════════════════════════════════
  // 用户原话：「我现在换了一个车的样式 结果导致我后面压根车不够了 我看了广告用了
  //   道具 反而完不成任务了？？道具的作用应该是帮助我们 而不是阻碍我们」
  //
  // 【根因 · 两处，都是真 bug，不是手感问题】
  //  ① 清空（doClear）：clearTarget 的兜底分支是「随便找一辆 left>0 的车拖走」。
  //     这辆车的剩余容量【凭空消失】了。而关卡的冗余率 S 只有 2%~25%，
  //     一旦被清掉的车是该色最后一辆，该色总容量 < 该色豆数 → 单色负冗余
  //     → 数学上不可能通关（skill 铁律 5）。玩家花 30 秒广告把自己的关卡打成了死局。
  //  ② 换车（doRefreshShuffle）：只是把队列随机洗一遍。总容量不变，但顺序变成
  //     随机 —— 完全可能把「我正要拖的那辆红车」洗到第二排（不可拖），
  //     把用不上的 ghost 车洗到第一排。期望是「换一批更好用的」，实际是「掷骰子」。
  //
  // 【统一约束（下面三个 helper 就是为它们服务的）】
  //   C1 容量守恒：任何道具执行后，每个颜色的「总可用容量 >= 场上该色剩余豆数」
  //                都不得被破坏。破坏了就现场补一辆同色车，绝不让玩家变成负冗余。
  //   C2 单调有益：道具要么改善局势，要么明确拒绝执行（并退回不消耗广告）；
  //                绝不存在「执行了但更糟」的分支。
  // ── 场上该色剩余豆数（含在途，在途豆还没进车，仍需要容量兜着）──
  // 【2026-09-04 O(1)】未消失豆数就是 S.colorAlive（newGame 初始化、豆 gone 时 --），
  // 与旧全量扫描同口径（!gone，含 moving）。
  function fieldBeanCount(color) {
    return (S && S.colorAlive && S.colorAlive[color]) || 0;
  }
  // ── 该色当前可用总容量 = 车位上的 left + 队列/待发池里的 cap ──
  // skipSlot 传车位下标时排除那一辆（用于「假设把它清掉会怎样」的推演）。
  function colorCapacity(color, skipSlot) {
    var cap = 0, i, c;
    for (i = 0; i < 6; i++) {
      if (i === skipSlot) continue;
      c = S.slots[i];
      if (c && c.leave < 0 && c.color === color) cap += c.left;
    }
    for (i = 0; i < 8; i++) if (S.queue[i] && S.queue[i].color === color) cap += S.queue[i].cap;
    for (i = 0; i < S.pend.length; i++) if (S.pend[i].color === color) cap += S.pend[i].cap;
    return cap;
  }
  // ── 【C1 容量守恒兜底】保证该色容量够用，不够就现场造一辆同色车补上 ──────
  // 造出来的车优先塞进队列的洞（玩家马上就能拖），没有洞才进待发池。
  // 返回补了多少容量（0 = 本来就够，什么都没做）。
  function ensureColorCapacity(color, skipSlot) {
    var need = fieldBeanCount(color);
    if (need <= 0) return 0;
    var have = colorCapacity(color, skipSlot);
    var short = need - have;
    if (short <= 0) return 0;
    var car = { color: color, cap: short, decoy: 0 };
    var i, put = -1;
    for (i = 0; i < 8; i++) if (!S.queue[i]) { put = i; break; }   // 优先第一排的洞
    if (put >= 0) S.queue[put] = car; else S.pend.push(car);
    dlog('[item] 容量守恒补车 ' + color + ' +' + short);
    return short;
  }
  // ── 道具：升级（扩容一辆车 ×2）—— 弹窗 → 激励视频 ─────────────
  // 【为什么拆成 use/do 两半】use 只做「能不能用」的校验并开弹窗，do 才是真正执行。
  // 校验必须留在弹窗【之前】：否则玩家看完 30 秒广告回来才被告知「先拖一辆车进车位」，
  // 等于白看，是最伤的一种体验。
  function upgradeTarget() {
    // 【每次现算，不缓存】广告播放期间游戏没冻结，车队会变；沿用旧下标可能
    // 指向空位或已离场的车 —— 那样广告看了却什么都没发生。
    //
    // 【用户校准 · 选目标要选「扩容真的有用」的那辆，不是 left 最大的那辆】
    // 旧实现选 left 最大 → 常常扩容到一辆本来就装得下的车上，多出来的容量
    // 是纯浪费（该色豆早就被吸干了），玩家看完广告感觉「啥也没变」。
    // 新排序键：
    //   ① 缺口 gap = 场上该色豆数 − 该色总容量（>0 = 这一色确实装不下，
    //      扩容它是【唯一】能救的操作，收益最高，必须优先）
    //   ② 该色场上剩余豆数（豆多 → 扩容能吃掉更多，收益更大）
    //   ③ left（同等条件下仍选大车，与旧行为一致，避免手感突变）
    var target = -1, bestKey = null, i, c;
    for (i = 0; i < 6; i++) {
      c = S.slots[i];
      if (!c || c.left <= 0 || c.leave >= 0) continue;
      var rest = fieldBeanCount(c.color);
      if (rest <= 0) continue;                       // 该色已清空 → 扩容毫无意义，跳过
      var gap = rest - colorCapacity(c.color, -1);
      var key = [gap > 0 ? 1 : 0, gap > 0 ? gap : 0, rest, c.left];
      if (!bestKey || key[0] > bestKey[0] ||
          (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] === bestKey[2] && key[3] > bestKey[3])) {
        bestKey = key; target = i;
      }
    }
    // 全部车的颜色都已清空（都是僵尸车）→ 退回「left 最大」保证道具仍可用，
    // 此时它的价值是「拿到一辆大车」而不是「吃豆」，聊胜于无。
    if (target < 0) {
      var best = -1;
      for (i = 0; i < 6; i++) {
        c = S.slots[i];
        if (!c || c.left <= 0 || c.leave >= 0) continue;
        if (c.left > best) { best = c.left; target = i; }
      }
    }
    return target;
  }
  function useUpgrade() {
    if (upgradeTarget() < 0) { sfxDeny(); toast('先滑动一辆小车到上面的车位'); return; }
    openPopup('upgrade');
  }
  function doUpgrade() {
    var target = upgradeTarget();
    if (target < 0) { toast('车位空了，升级没生效'); return; }
    var c2 = S.slots[target];
    if (!c2) return;
    var best = c2.left;
    c2.cap *= 2; c2.left += best;
    // 【标记广告权益】容量被人为翻倍 → 它必然装不满，只有它有「未装满也能走」
    // 的豁免权（releaseAdBoostedCars）。不打这个标记的话，扩容反而会把车位锁死。
    c2.adUp = 1;
    sfxDoor(); vib('medium');
    toast('容量翻倍！' + C[c2.color].name + '车 → ' + c2.left);
    queueSuck(160);
  }
  // ── 道具：加速（全程 3 倍速）—— 激励视频 ────────────────────
  // 【用户追问「minGain 22→5 这个咋办呢 就咋优化？」】
  // 说清楚：改阈值只是止血，不是解法。根因是这个广告位卖的是「省时间」，
  // 而提速本身已经把时间省光了 —— 一个只卖时间的广告位，在快游戏里必然贬值，
  // 再怎么调阈值都是在一条死路上挪小数点。
  //
  // 真正的优化：把加速从「省时间」改成「拿收益」——
  //   3 倍速本来就让豆子走得更密 → 连击（combo）更容易连上，
  //   所以加速的卖点改成「更容易打出高连击 → 更容易拿三星」。
  // 这样它的价值不再随关卡变短而衰减：只要这一关还没打完、还没拿三星，
  // 加速就永远有意义。阈值也就不再需要一个「秒数」门槛。
  //
  // 保留的唯一门槛：豆子快清完了就别卖了（收尾时连击也连不起来），
  // 用「剩余豆占比」判断，跟速度完全解耦 —— 以后再怎么调 perSec 都不用回来改这里。
  function boostLeftRatio() {
    if (!S || !S.total) return 0;
    return (S.total - S.cleared) / S.total;
  }
  function boostWorth2() { return S && !S.speed2 && boostLeftRatio() > 0.25; }
  function useBoost() {
    if (S.speed2) { sfxPick(); toast('已是加速状态，本关全程有效'); return; }
    if (!boostWorth2()) {
      sfxDeny();
      toast('快收尾了，加速已经帮不上忙');
      return;
    }
    openPopup('speed2');
  }
  function doBoost() {
    // 【为什么还要再判一次 speed2】广告播放期间玩家可能已通过别的路径拿到加速；
    // 重复置 true 本身无害，但会多弹一次 toast 让人以为生效了两次。
    if (S.speed2) return;
    S.speed2 = true; sfxPick(); vib('light');
    // 【真人日志】看广告换加速也是一次玩家决策，且它直接影响这一关的难度感受
    plog('看广告-加速', '第' + S.moves + '步 剩' + (S.total - S.cleared) + '豆');
    // 文案口径：主打「连击/三星」，秒数只作为次要信息（见上方长注释）
    toast('全程 ' + SPD.boost + ' 倍速！连击更容易，冲三星～');
  }
  // ── 道具：清空（强制拖走一辆车，解死局）—— 弹窗 → 激励视频 ───────
  // 目标同样现算不缓存：广告期间僵尸车可能已被正常装满离场。
  //
  // 【根因修复 · 用户实测「用了道具反而完不成任务」的第一凶手】
  // 旧 clearTarget 的兜底分支是「找第一辆 left>0 的车拖走」—— 那辆车的容量
  // 凭空消失。冗余率 S 只有 2%~25%，被清掉的若是某色最后一辆车，该色
  // 总容量立刻 < 该色豆数 = 单色负冗余 = 数学上不可能通关（skill 铁律 5）。
  // 玩家看了 30 秒广告，把自己的关卡打成了必死局。
  //
  // 【新口径】清空只清「占着位但干不了活」的车，并按代价从小到大排：
  //   ① ghost 干扰车（decoy===1）—— 场上根本没这个颜色，纯占位，清它零代价（最优）
  //   ② 该色场上已清空的车        —— 任务已完成，清它同样零代价
  //   ③ 清掉后该色容量仍然够用的车 —— 有代价但不致命（用 colorCapacity 推演验证）
  // 三类都没有 → 明确拒绝（在 useClear 阶段就拒，不消耗广告），
  // 而不是硬清一辆把玩家推进死局。这就是「道具只帮忙、不添乱」的实现。
  function clearTarget() {
    var i, c;
    // ① ghost 干扰车：最该清的，零代价
    for (i = 0; i < 6; i++) {
      c = S.slots[i];
      if (c && c.leave < 0 && c.decoy === 1) return i;
    }
    // ② 该色场上已经没豆了（含 isZombie 覆盖的情形）：任务完成，零代价
    for (i = 0; i < 6; i++) {
      c = S.slots[i];
      if (!c || c.leave >= 0 || c.left <= 0) continue;
      if (fieldBeanCount(c.color) === 0) return i;
    }
    // ③ 清掉后该色容量仍 >= 该色豆数：有代价但不制造负冗余。
    //    优先清「剩余容量最小」的那辆 —— 损失的容量最少，且它最可能是那辆
    //    卡着位不上不下的车。
    var target = -1, minLeft = 1e9;
    for (i = 0; i < 6; i++) {
      c = S.slots[i];
      if (!c || c.leave >= 0 || c.left <= 0) continue;
      if (c.onWay > 0) continue;                       // 还有豆在飞向它，清了那颗豆没车装
      if (colorCapacity(c.color, i) < fieldBeanCount(c.color)) continue;   // 会造成负冗余 → 不能清
      if (c.left < minLeft) { minLeft = c.left; target = i; }
    }
    return target;
  }
  function useClear() {
    if (clearTarget() < 0) {
      sfxDeny();
      // 【必须在广告之前拒绝】文案要说清为什么不能用，否则玩家以为按钮坏了
      toast('现在没有可以清掉的车，清了会装不下哦');
      return;
    }
    openPopup('clear');
  }
  function doClear() {
    var target = clearTarget();
    if (target < 0 || !S.slots[target]) { toast('车位已经空了'); return; }
    var col = S.slots[target].color;
    departCar(target);
    // 【C1 容量守恒兜底】理论上 clearTarget 已经排除了负冗余的车，但广告播放期间
    // 场面会变（比如期间又有豆落地/车离场），二次校验一次，缺了就现场补一辆。
    // 宁可多送玩家一辆车，也绝不让「用了道具反而通不了关」再发生一次。
    var added = ensureColorCapacity(col, -1);
    toast(added > 0 ? '车位已腾出，并补了一辆' + C[col].name + '车！' : '车位已腾出！');
  }
  // ── 道具：换车（重排待发车队列）—— 弹窗 → 激励视频 ───────────────
  // 【2026-08-28 改为奖励弹窗】旧实现点一下直接拉广告，玩家不知道自己换到了什么。
  //
  // ══ 【根因修复 · 用户实测「换了个车的样式 结果后面压根车不够了」】═════════
  // 用户原话直指这个道具。旧 doRefreshShuffle 就是把队列 Fisher-Yates 随机洗一遍：
  //   · 总容量没变，所以不会真的「车不够」—— 但【顺序】变成了掷骰子。
  //   · 玩家点它的动机永远是「第一排这几辆我现在用不上，给我能用的」。
  //     随机洗牌有很大概率把「现在正需要的那一色」洗到第二排（不可拖），
  //     把 ghost / 用不上的色洗到第一排 → 体感就是「花广告把局面搞更糟了」。
  //   · 更糟的是它可能把玩家原本盯着的那辆车洗走，导致他的规划全废 —— 这就是
  //     用户说的「后面压根车不够了」的主观来源（不是数学不够，是他要的车不见了）。
  //
  // 【新口径 · 定向优选，不再随机】把「最该现在用的车」排到第一排：
  //   ① 该色场上有可取豆 且 该色目前【没有】车在车位上干活 → 最该给（打开新战线）
  //   ② 该色场上有可取豆                                  → 次之（能立刻干活）
  //   ③ 其它（ghost / 该色已清空）                        → 一律沉到第二排
  //   同档内按「该色剩余豆数」降序（豆多的先给，收益更大）。
  // 效果：换车之后第一排一定是「拖下去马上有豆上车」的车。
  //   这是单调有益的（C2），不存在「换完更糟」的分支。
  // 【顺带做容量守恒（C1）】洗牌只动顺序不动容量，但仍在末尾扫一遍：
  //   若某色已经处于负冗余（可能被此前别的道具或 decoy 机制搞出来），顺手补齐。
  function useRefresh() {
    if (queueCount() < 2) { sfxDeny(); toast('没有待发车了'); return; }
    openPopup('refresh');
  }
  // 真正的换车逻辑（从 useRefresh 抽出，供弹窗的「获得」回调调用）
  function doRefreshShuffle() {
    // ── 步骤 1：算每一色的「此刻有多想要」──────────────────────────
    // 【2026-09-04】top/occ 走缓存、rest 走存活计数、pickable 只扫各色静止桶
    var top = curTop();
    var occ = curOcc();
    var reach = PD.buildReach(occ, S.bounds, reservedCells());
    var pickable = {}, rest = {}, i, cK;
    for (cK in S.bucket) {
      if (!S.bucket.hasOwnProperty(cK)) continue;
      rest[cK] = S.colorAlive[cK] || 0;         // 未消失豆数（含在途），O(1)
      var bArr = S.bucket[cK];
      for (i = 0; i < bArr.length; i++) {
        if (PD.canWalkFast(bArr[i], top, reach)) { pickable[cK] = 1; break; }
      }
    }
    var onDuty = {};                    // 该色是否已有车在车位上干活
    for (i = 0; i < 6; i++) {
      var sc = S.slots[i];
      if (sc && sc.leave < 0 && sc.left > 0) onDuty[sc.color] = 1;
    }
    function rank(car) {
      if (!car) return -1;
      if (car.decoy === 1) return 0;                            // ghost：永远沉底
      if (!pickable[car.color]) return 0;                       // 该色此刻没豆能走
      return onDuty[car.color] ? 1 : 2;                         // 2 = 能打开新战线，最优
    }
    // ── 步骤 2：把所有实车按优先级排序，回填到原有的非空槽位 ────────────
    // 【稀疏队列铁律】只重排「真有车的格」，洞的位置保持不变（否则洞会跑到第一排）。
    var idx = [], cars = [];
    for (i = 0; i < 8; i++) if (S.queue[i]) { idx.push(i); cars.push(S.queue[i]); }
    for (i = 0; i < cars.length; i++) {
      cars[i]._rk = rank(cars[i]);
      cars[i]._rs = rest[cars[i].color] || 0;
    }
    cars.sort(function (p, q) {
      return (q._rk - p._rk) || (q._rs - p._rs) || (q.cap - p.cap);
    });
    // idx 已经是升序（0..7），所以「排序后的第 k 辆」落到「第 k 个非空槽」= 优先第一排
    for (i = 0; i < idx.length; i++) { delete cars[i]._rk; delete cars[i]._rs; S.queue[idx[i]] = cars[i]; }
    // ── 步骤 3：容量守恒兜底（C1）────────────────────────────────
    var col, fixed = 0;
    for (col in rest) { if (rest.hasOwnProperty(col)) fixed += ensureColorCapacity(col, -1); }
    S.refillT = 9999; S.refillFrom = 99;   // 整体换牌，不做滑动补位
    sfxPick(); vib('light');
    toast(fixed > 0 ? '已换成能用的车，并补齐了容量！' : '已把马上能用的车排到前排！');
    queueSuck(120);
  }

  // ══════════════════════════════════════════════════════════════
  // 奖励弹窗浮层（切图渲染）
  // ══════════════════════════════════════════════════════════════
  // 【素材来源】assets/ui/popup/*.png，@2x 导出，矢量源在设计仓库。
  //
  // 【铁律 A · 22px 透明安全区】每张切图四周留了 22px 透明边（装阴影和描边），
  //   所以 PNG 的整图尺寸 ≠ 视觉尺寸：
  //     popup_panel  整图 544x580，视觉只有 500x530（四周各 22，底部多 6 装阴影）
  //   直接把整图按视觉尺寸铺 → 视觉部分会被压小 44px。
  //   必须按「整图尺寸」绘制，再把左上角往外偏 pad —— 见 drawPopupImg()。
  //
  // 【铁律 B · phase 复用】开弹窗时把 S.phase 设成 'popup'，
  //   这样 suck / watchdog / checkStuck / releaseAdBoostedCars / 拖拽 里
  //   现成的 `phase !== 'play'` 守卫会全部生效，游戏自动冻结在弹窗背后。
  //   若另开一个 S.popup 布尔量，就得逐个函数补守卫，漏一个就会出现
  //   「弹窗开着，背后偷偷判死局」的鬼畜 bug。
  //
  // 【铁律 C · 资源生命周期】走 M3.AssetManager 分组，关闭即 releaseGroup。
  //   弹窗是低频界面，常驻内存不值得（content_bg 单张 81KB）。
  var POPUP_GROUP = 'popup:reward';
  // vw/vh = 视觉尺寸(1x)，iw/ih = 整图尺寸(1x)，pad = 透明安全区
  var POPUP_META = {
    panel:    { src: 'assets/ui/popup/popup_panel.png',       vw: 500, vh: 530, iw: 544, ih: 580, pad: 22 },
    title:    { src: 'assets/ui/popup/title_bar.png',         vw: 344, vh: 84,  iw: 388, ih: 128, pad: 22 },
    close:    { src: 'assets/ui/popup/btn_close.png',         vw: 60,  vh: 60,  iw: 104, ih: 104, pad: 22 },
    content:  { src: 'assets/ui/popup/content_bg.png',        vw: 428, vh: 282, iw: 428, ih: 282, pad: 0  },
    btn:      { src: 'assets/ui/popup/btn_green.png',         vw: 244, vh: 80,  iw: 288, ih: 124, pad: 22 },
    btnDown:  { src: 'assets/ui/popup/btn_green_pressed.png', vw: 244, vh: 80,  iw: 288, ih: 124, pad: 22 },
    icRefresh:{ src: 'assets/ui/popup/icon_refresh.png',      vw: 220, vh: 220, iw: 220, ih: 220, pad: 0  },
    icUpgrade:{ src: 'assets/ui/popup/icon_upgrade.png',      vw: 220, vh: 220, iw: 220, ih: 220, pad: 0  },
    icClear:  { src: 'assets/ui/popup/icon_clear.png',        vw: 220, vh: 220, iw: 220, ih: 220, pad: 0  },
    icSpeed:  { src: 'assets/ui/popup/icon_speed.png',        vw: 220, vh: 220, iw: 220, ih: 220, pad: 0  },
    // 【本轮新增】失败缎带 + 复活图标（tools/gen-fail-ribbon.py 预生成，@2x）
    // vw/vh 取 fail-revive.json 里的 design 尺寸；iw/ih = 实际像素尺寸；
    // pad:0 —— 这两张图是 crop(getbbox()) 后的紧致包围盒，没有透明安全区。
    failRibbon:{ src: 'assets/ui/popup/fail_ribbon.png',      vw: 370.5, vh: 91.5,  iw: 370.5, ih: 91.5,  pad: 0 },
    icRevive:  { src: 'assets/ui/popup/icon_revive.png',      vw: 226.5, vh: 142.5, iw: 226.5, ih: 142.5, pad: 0 }
  };
  // 【为什么四张图标全列进 KEYS】loadPopupUI 遍历 KEYS 全量 acquire，
  // 于是打开任意一个弹窗都会把 4 张图标一起加载（各约 20~33KB，合计 ~110KB）。
  // 这是刻意取舍：图标体积小、弹窗又是低频界面，换来的是 openPopup 传任何
  // kind 都不会出现「图标还没加载完 → 中间一块白」的空窗期。
  var POPUP_KEYS = ['panel', 'title', 'close', 'content', 'btn', 'btnDown',
                    'icRefresh', 'icUpgrade', 'icClear', 'icSpeed',
                    'failRibbon', 'icRevive'];
  var popupLoaded = false;

  // 【零引用防复发】历史上 assets/ui/ 下 15 个 PNG 全都没被任何代码引用过
  // （grep 'assets/ui' 空结果），白占包体。这里把每张图都真的 acquire 一遍，
  // 并在 onload 后断言 7/7 命中，缺一张就 console.error 报出来。
  function loadPopupUI() {
    if (popupLoaded || !window.M3 || !M3.AssetManager) return;
    var AM = M3.AssetManager, i, k, m;
    for (i = 0; i < POPUP_KEYS.length; i++) {
      k = POPUP_KEYS[i]; m = POPUP_META[k];
      AM.acquire('image', 'popup_' + k, m.src, POPUP_GROUP);
    }
    popupLoaded = true;
    // 断言：延迟到下一拍再查，给 onload 一点时间
    setTimeout(function () {
      var ok = 0, miss = [], j, kk;
      for (j = 0; j < POPUP_KEYS.length; j++) {
        kk = POPUP_KEYS[j];
        if (AM.loaded('popup_' + kk)) ok++; else miss.push(POPUP_META[kk].src);
      }
      if (ok === POPUP_KEYS.length) {
        dlog('[popup] 切图 ' + ok + '/' + POPUP_KEYS.length + ' 全部就绪');
      } else {
        console.error('[popup] 切图缺失 ' + miss.length + ' 张（将降级为矢量绘制）:', miss.join(', '));
      }
    }, 1200);
  }
  function freePopupUI() {
    if (!popupLoaded || !window.M3 || !M3.AssetManager) return;
    M3.AssetManager.releaseGroup(POPUP_GROUP);
    popupLoaded = false;
  }

  // 按「视觉矩形」绘制切图，自动补偿透明安全区（铁律 A）
  function drawPopupImg(g, key, vx, vy, vw, vh) {
    if (!window.M3 || !M3.AssetManager) return false;
    var m = POPUP_META[key];
    if (!m || !M3.AssetManager.loaded('popup_' + key)) return false;
    var img = M3.AssetManager.get('popup_' + key);
    if (!img) return false;
    var sx = vw / m.vw, sy = vh / m.vh;
    g.drawImage(img, vx - m.pad * sx, vy - m.pad * sy, m.iw * sx, m.ih * sy);
    return true;
  }

  // 布局：draw 和命中判定共用这一份，绝不各写一套（否则改尺寸必然点不准）
  function popupRects() {
    var K = 1.18;                                   // 切图设计基准 500 宽 → 放大到 590 更贴合 750 舞台
    var pw = 500 * K, ph = 530 * K;
    var px = (DW - pw) / 2, py = 520;
    var tw = 344 * K, th = 84 * K;
    var cw = 428 * K, ch = 282 * K;
    var gw = 244 * K, gh = 80 * K;
    var cy0 = py + 46 * K;
    return {
      K: K,
      panel:   { x: px, y: py, w: pw, h: ph },
      title:   { x: px + (pw - tw) / 2, y: py - th / 2 - 4, w: tw, h: th },
      close:   { cx: px + pw - 10, cy: py + 8, d: 60 * K },
      content: { x: px + (pw - cw) / 2, y: cy0, w: cw, h: ch },
      icon:    { w: 220 * K, h: 220 * K },
      labelY:  cy0 + ch + 52,
      btn:     { x: px + (pw - gw) / 2, y: cy0 + ch + 103, w: gw, h: gh }
    };
  }

  // 弹窗配置表：以后加「升级」「消除」弹窗只在这里加一条，不用碰绘制代码
  // 【四个道具全部走弹窗 · 2026-08-28】原先只有「刷新」弹窗，另外三个点一下直接
  // 拉广告 —— 同一排四个按钮却是两种交互，玩家点前不知道会发生什么，误触率高、
  // 广告转化也低。现在统一成「先看清奖励说明 → 主动点获得 → 才拉广告」。
  //
  // 【desc 写法口径】必须写「玩家能拿到什么」，不写内部机制。
  //   反例：「c.cap *= 2」→ 玩家看不懂；正例：「一辆车的容量翻倍」。
  //
  // 【onGet 里必须重新取目标车】不能沿用点按钮那一刻算好的下标：
  //   看广告要几十秒，回来后车队早变了，旧下标可能指向空位甚至已离场的车。
  //   弹窗期间游戏是冻结的（phase='popup'），但广告播放期间不是。
  var POPUP_CFG = {
    // 【用户要求 2 · 本轮】车位满 + 颜色推不动 → 3 秒后弹复活窗，
    // 看广告后【复活并消除前 3 辆汽车】（完全对齐用户给的 UI 图）。
    // 为何能直接复用这套弹窗：参考图的结构（蓝标题条 + 白卡片 + 图标 +
    // 一行蓝字说明 + 绿色获得按钮 + 右上红叉）与现有道具弹窗完全一致，
    // 只需新增一个 kind + 一张图标，不必另写一套绘制/命中代码。
    revive: {
      title: '复活',
      desc:  '复活并消除前3辆汽车',
      icon:  'icRevive',
      cta:   '获得',
      onGet: function () { rewardAd('revive3', function () { doRevive3(); }); }
    },
    refresh: {
      title: '换车',
      desc:  '随机换一批待发车',
      icon:  'icRefresh',
      cta:   '获得',
      onGet: function () { rewardAd('refresh', function () { doRefreshShuffle(); }); }
    },
    upgrade: {
      title: '升级',
      desc:  '一辆车的容量翻倍',
      icon:  'icUpgrade',
      cta:   '获得',
      onGet: function () { rewardAd('upgrade', function () { doUpgrade(); }); }
    },
    clear: {
      title: '清空',
      desc:  '清走一辆占位的车',
      icon:  'icClear',
      cta:   '获得',
      onGet: function () { rewardAd('clear', function () { doClear(); }); }
    },
    speed2: {
      title: '加速',
      desc:  '本关全程加速，更易连击',
      icon:  'icSpeed',
      cta:   '获得',
      onGet: function () { rewardAd('speed2', function () { doBoost(); }); }
    }
  };

  function openPopup(kind) {
    if (!POPUP_CFG[kind]) { console.warn('[popup] 未知类型', kind); return; }
    // 【本轮扩展】复活弹窗是从 dead 态弹出来的，所以不能再只允许 play。
    // 记住【从哪个 phase 进来】，closePopup 才能原路返回 —— 否则玩家关掉
    // 复活窗会直接回到 play，但局面其实还是死局 → watchdog 立刻又判一次死，
    // 玩家会看到弹窗闪一下又回来，像 bug。
    if (!S) return;
    if (S.phase !== 'play' && S.phase !== 'dead') return;
    loadPopupUI();
    S.popup = { kind: kind, t: 0, press: 0, from: S.phase };
    S.phase = 'popup';                              // 铁律 B：复用现成守卫冻结游戏
    vib('light');
  }
  function closePopup() {
    if (!S || S.phase !== 'popup') return;
    var back = (S.popup && S.popup.from === 'dead') ? 'dead' : 'play';
    S.popup = null;
    S.phase = back;                                 // 从死局来的就回死局，不详装活着
    // 【不能无条件释放】回到 dead 后失败页还要继续用 fail_ribbon，
    // 这时释放资源组会让缎带【凭空消失】退回矩形图。
    // 只有回到 play（道具弹窗）才释放 —— 那时确实再没人用它了。
    if (back !== 'dead') freePopupUI();              // 铁律 C：关闭即释放
  }
  // 【用户要求 2】复活并消除前 3 辆汽车。
  // 「前 3 辆」= 车位 0/1/2（从左数）里实际有车的，遇到空位就跳过往后找，
  // 保证【真的消掉 3 辆】而不是「看了广告只清了 1 辆」—— 广告权益必须足额。
  function doRevive3() {
    if (!S) return;
    var n = 0, i;
    for (i = 0; i < 6 && n < 3; i++) {
      if (S.slots[i] && S.slots[i].leave < 0) { departCar(i); n++; }
    }
    // 回到可玩态：必须同时清 stuckT / amCache，否则 watchdog 拿着旧缓存
    // 会在 900ms 内把刚复活的局面再判一次死（这个坑历史上已经踩过一次）。
    S.phase = 'play';
    S.stuckT = 0; S.deadT = 0; S.hintedFree = 0;
    S.amCache = undefined;
    freePopupUI();                                  // 回到 play 了，此时才真正不需要 popup 资源
    S.reviveAsked = 1;                              // 本局已给过复活机会，不重复弹
    sfxDoor(); vib('medium');
    toast(n > 0 ? ('已消除 ' + n + ' 辆车，继续！') : '车位已腾空，继续！');
    queueSuck(220);
  }

  function drawPopup(g, dt) {
    var P = S.popup; if (!P) return;
    var cfg = POPUP_CFG[P.kind]; if (!cfg) return;
    P.t += dt;
    var R = popupRects();
    // 入场：120ms 缩放弹出（0.86 → 1.0），比硬切有质感
    var prog = clamp(P.t / 120, 0, 1);
    var k = 0.86 + 0.14 * prog;

    g.fillStyle = 'rgba(8,6,12,.62)'; g.fillRect(0, 0, DW, DH);   // 背景压暗

    g.save();
    var ccx = R.panel.x + R.panel.w / 2, ccy = R.panel.y + R.panel.h / 2;
    g.translate(ccx, ccy); g.scale(k, k); g.translate(-ccx, -ccy);
    g.globalAlpha = prog;

    // ① 面板
    if (!drawPopupImg(g, 'panel', R.panel.x, R.panel.y, R.panel.w, R.panel.h)) {
      rr(g, R.panel.x, R.panel.y, R.panel.w, R.panel.h, 44);
      g.fillStyle = '#FFFFFF'; g.fill();
      g.lineWidth = 8; g.strokeStyle = '#CBE6FF'; g.stroke();
    }
    // ② 奖励展示底 + 图标
    if (!drawPopupImg(g, 'content', R.content.x, R.content.y, R.content.w, R.content.h)) {
      rr(g, R.content.x, R.content.y, R.content.w, R.content.h, 30);
      g.fillStyle = '#E9DCF6'; g.fill();
    }
    var iw = R.icon.w, ih = R.icon.h;
    var ix = R.content.x + (R.content.w - iw) / 2, iy = R.content.y + (R.content.h - ih) / 2;
    if (!drawPopupImg(g, cfg.icon, ix, iy, iw, ih)) {
      icon(g, 'refresh', ix + iw / 2, iy + ih / 2, iw * 0.72, '#F5B912');
    }
    // ③ 说明文案
    txt(g, cfg.desc, DW / 2, R.labelY, 'bold 40px sans-serif', '#2A6FD6', '#FFFFFF', 6);
    // ④ 主按钮（按下态换图）
    var bk = P.press ? 'btnDown' : 'btn';
    var by = R.btn.y + (P.press ? 3 : 0);
    if (!drawPopupImg(g, bk, R.btn.x, by, R.btn.w, R.btn.h)) {
      rr(g, R.btn.x, by, R.btn.w, R.btn.h, R.btn.h / 2);
      g.fillStyle = P.press ? '#5CBB27' : '#6FD22F'; g.fill();
      g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.stroke();
    }
    // 按钮内容：摄像机图标 +「获得」（四个道具都是激励视频，统一带视频标）
    var bcy = by + R.btn.h / 2, tx0 = R.btn.x + R.btn.w / 2;
    rr(g, tx0 - 96, bcy - 20, 54, 40, 10); g.fillStyle = '#FFFFFF'; g.fill();
    g.beginPath();
    g.moveTo(tx0 - 38, bcy - 16); g.lineTo(tx0 - 20, bcy - 24);
    g.lineTo(tx0 - 20, bcy + 24); g.lineTo(tx0 - 38, bcy + 16);
    g.closePath(); g.fillStyle = '#FFFFFF'; g.fill();
    txt(g, cfg.cta, tx0 + 40, bcy + 2, 'bold 44px sans-serif', '#FFFFFF', 'rgba(47,138,22,.55)', 5);
    // ⑤ 标题条（压在面板上沿，最后画保证在最上层）
    if (!drawPopupImg(g, 'title', R.title.x, R.title.y, R.title.w, R.title.h)) {
      rr(g, R.title.x, R.title.y, R.title.w, R.title.h, R.title.h / 2);
      g.fillStyle = '#3FB0F7'; g.fill();
      g.lineWidth = 5; g.strokeStyle = '#EAF7FF'; g.stroke();
    }
    txt(g, cfg.title, DW / 2, R.title.y + R.title.h / 2 + 3, 'bold 52px sans-serif', '#FFFFFF', '#0F63C0', 7);
    // ⑥ 关闭键（咬住面板右上角）
    var cd = R.close.d;
    if (!drawPopupImg(g, 'close', R.close.cx - cd / 2, R.close.cy - cd / 2, cd, cd)) {
      g.beginPath(); g.arc(R.close.cx, R.close.cy, cd / 2, 0, 6.2832);
      g.fillStyle = '#F4483A'; g.fill();
      g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.stroke();
      var q = cd * 0.21;
      g.lineWidth = 9; g.strokeStyle = '#FFFFFF'; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(R.close.cx - q, R.close.cy - q); g.lineTo(R.close.cx + q, R.close.cy + q);
      g.moveTo(R.close.cx + q, R.close.cy - q); g.lineTo(R.close.cx - q, R.close.cy + q);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // ── 矢量图标库（ES5）── 严格 1:1 移植 docs/design/tools/gen_icons.py ──────
  // 【为什么不用 emoji】⬆🖌🔄⏩ 在快手容器 / 低端安卓上字形缺失，会渲染成豆腐块「▯」。
  //
  // 【坐标系铁律】直接沿用 SVG 的 96×96 原始坐标（中心 48,48），不做任何换算：
  //   translate(cx,cy) → scale(k) → translate(-48,-48)
  // 这样下面每个 path 的数字都能和 gen_icons.py 里的一模一样，肉眼可比对，
  // 绝不会出现「凭记忆重画 → 和浏览器预览长得不一样」（已犯过，用户明确否掉）。
  function icon(g, name, cx, cy, size, col) {
    var k = size / 96;
    g.save();
    g.translate(cx, cy); g.scale(k, k); g.translate(-48, -48);
    g.fillStyle = col; g.strokeStyle = col;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (name === 'upgrade') {
      // ic_upgrade：粗上箭头实心多边形 hw=30 sw2=11 top=16 mid=46 bot=80
      g.beginPath();
      g.moveTo(48, 16); g.lineTo(78, 46); g.lineTo(59, 46); g.lineTo(59, 80);
      g.lineTo(37, 80); g.lineTo(37, 46); g.lineTo(18, 46);
      g.closePath(); g.fill();
    } else if (name === 'clear') {
      // ic_clear：扫帚，整组绕 (48,48) 旋转 34°
      g.save();
      g.translate(48, 48); g.rotate(34 * Math.PI / 180); g.translate(-48, -48);
      rr(g, 41, 12, 14, 42, 7); g.fill();                       // 柄
      g.beginPath();                                             // 刷头梯形
      g.moveTo(30, 50); g.lineTo(66, 50); g.lineTo(74, 82); g.lineTo(22, 82);
      g.closePath(); g.fill();
      g.restore();
    } else if (name === 'refresh') {
      // ic_refresh：r=28 圆弧 300°→240°（顺时针跨 300°）+ 弧端切线箭头
      var r = 28, t1 = 300 * Math.PI / 180, t2 = 240 * Math.PI / 180;
      g.lineWidth = 10;
      g.beginPath(); g.arc(48, 48, r, t1, t2 + Math.PI * 2); g.stroke();
      // arc_head(48,48,28,240,23,17)：方向 = 该点切线，保证箭头与弧不断开
      var a = 240 * Math.PI / 180;
      var px = 48 + r * Math.cos(a), py = 48 + r * Math.sin(a);
      var tx = -Math.sin(a), ty = Math.cos(a);
      var nx = Math.cos(a), ny = Math.sin(a);
      g.beginPath();
      g.moveTo(px + tx * 23, py + ty * 23);
      g.lineTo(px + nx * 17, py + ny * 17);
      g.lineTo(px - nx * 17, py - ny * 17);
      g.closePath(); g.fill();
    } else if (name === 'speed') {
      // ic_speed：双实心右三角，tri_r(x,48,24,38)，x = 48-26 / 48+2
      var xs = [48 - 26, 48 + 2], q;
      for (q = 0; q < 2; q++) {
        g.beginPath();
        g.moveTo(xs[q], 48 - 19); g.lineTo(xs[q], 48 + 19); g.lineTo(xs[q] + 24, 48);
        g.closePath(); g.fill();
      }
    } else if (name === 'play') {
      // ic_play：实心三角，形心光学居中（tip=+2w/3, base=-w/3）
      g.beginPath();
      g.moveTo(48 - 14, 48 - 23); g.lineTo(48 - 14, 48 + 23); g.lineTo(48 + 28, 48);
      g.closePath(); g.fill();
    } else if (name === 'video') {
      // ── ic_video：摄像机（圆角矩形机身 + 右侧梯形镜头）─────────────────
      // 【为什么新增这个图标 · 用户要求 2026-08-31】底部四个道具角标原来是纯「▶」，
      //   而弹窗「获得」按钮和第 6 车位「解锁」按钮用的是【摄像机】图标。
      //   同一个 App 里「看激励视频」这一件事出现了两种符号 —— 玩家要学两遍。
      //   纯 ▶ 在通用语义里是「播放（我自己的内容）」，摄像机才是行业通行的
      //   「激励视频广告」符号（穿山甲/优量汇/快手联盟的 rewarded 标都是摄像机）。
      //   统一成摄像机后，全场「带摄像机 = 要看广告」成为唯一且一致的视觉契约。
      // 【几何来源】严格等比移植 drawPopup 里「获得」按钮那段内联画法，
      //   保证两处像素级同形（只是尺寸不同），绝不是凭感觉重画：
      //     原始：机身 rr(x-96, cy-20, 54, 40, r10)
      //           镜头 (x-38,cy-16) →(x-20,cy-24) →(x-20,cy+24) →(x-38,cy+16)
      //   换算到 96×96 坐标系（总宽 76 → 10..86，总高 48 → 24..72，中心仍在 48,48）：
      //           机身 10..64 / 28..68，镜头 68..86，内高 32，外高 48，机身与镜头留 4px 气口
      // 【为什么留那 4px 气口】原图就有；贴死会在小尺寸下糊成一个梯形色块，
      //   读不出「机身 + 镜头」两段结构 —— 角标只有 20px 宽，结构感全靠这道缝。
      rr(g, 10, 28, 54, 40, 10); g.fill();
      g.beginPath();
      g.moveTo(68, 32); g.lineTo(86, 24); g.lineTo(86, 72); g.lineTo(68, 64);
      g.closePath(); g.fill();
    } else if (name === 'plus') {
      // ic_plus：十字实心多边形 t=20，从 20 到 76
      g.beginPath();
      g.moveTo(38, 20); g.lineTo(58, 20); g.lineTo(58, 38); g.lineTo(76, 38);
      g.lineTo(76, 58); g.lineTo(58, 58); g.lineTo(58, 76); g.lineTo(38, 76);
      g.lineTo(38, 58); g.lineTo(20, 58); g.lineTo(20, 38); g.lineTo(38, 38);
      g.closePath(); g.fill();
    } else if (name === 'lock') {
      rr(g, 24, 46, 48, 36, 8); g.fill();
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(34, 46); g.lineTo(34, 34);
      g.arc(48, 34, 14, Math.PI, 0);
      g.lineTo(62, 46);
      g.stroke();
    } else if (name === 'home') {
      g.beginPath();
      g.moveTo(48, 14); g.lineTo(86, 50); g.lineTo(76, 50); g.lineTo(76, 82);
      g.lineTo(20, 82); g.lineTo(20, 50); g.lineTo(10, 50);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  // ── 离屏画布工厂（三端兼容）────────────────────────────────
  function mkCanvas(w, h) {
    var cvs;
    if (window.KwaiRender && KwaiRender.createOffscreenCanvas) cvs = KwaiRender.createOffscreenCanvas(w, h);
    else if (typeof ks !== 'undefined' && ks.createCanvas) { cvs = ks.createCanvas(); cvs.width = w; cvs.height = h; }
    else { cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h; }
    return cvs;
  }

  // ── 立绘双层缓存：清晰版 + 模糊版（v2 核心）────────────────────
  // 【为什么不用 filter:blur】小游戏容器对 ctx.filter 支持不全，且每帧实时高斯模糊
  // 在中低端机上直接掉帧。这里用「降采样 → 放大」做一次性模糊，只在换关时算，
  // 每帧只是两次 drawImage + 一个 globalAlpha，几乎零成本。
  //
  // 显影逻辑（用户确认默认 70%）：p = 0.70 + 0.30 × 清豆进度
  //   p=0.70 → 模糊层 30% 可见，立绘基本看清但豆子仍有对比度
  //   p=1.00 → 全清晰，通关瞬间立绘完整显影
  var PC = { sharp: null, blur: null, w: 0, h: 0 };
  var PBLUR_DIV = 10;                   // 降采样倍数，越大越模糊（10 ≈ blur 8px 观感）
  // 【画布复用 · 2026-09-04】原来每次换关 mkCanvas 新建 3 张全屏量级画布，旧的丢给
  // GC —— 原生 canvas 内存回收异步，连打多关内存持续爬升，低端机易触发
  // onMemoryWarning 甚至被杀。现在常驻复用，每次只 clearRect + 重画。
  var _pcSharpCv = null, _pcTinyCv = null, _pcBlurCv = null, _bgCv = null;
  // 【用户反馈】立绘看着「完全没透明度」。常驻压暗系数：0 = 原图全亮，1 = 全黑。
  // 0.28 ≈ 立绘亮度降到七成，人物依然看得清，但豆子/车明显浮起来。
  var BG_DIM = 0.28;
  function buildPortraitCache() {
    PC.sharp = null; PC.blur = null;
    if (!portraitOK || !portrait) return;
    var H = 1466;                        // 立绘铺底范围 0–1466（道具栏顶）
    PC.w = DW; PC.h = H;
    try {
      if (!_pcSharpCv) _pcSharpCv = mkCanvas(DW, H);
      if (!_pcBlurCv)  _pcBlurCv  = mkCanvas(DW, H);
      if (!_pcTinyCv)  _pcTinyCv  = mkCanvas(Math.max(1, Math.round(DW / PBLUR_DIV)),
                                            Math.max(1, Math.round(H / PBLUR_DIV)));
      if (!_pcSharpCv || !_pcBlurCv || !_pcTinyCv) return;
      // ① 清晰层：cover fit（按宽铺满，顶部对齐）【复用画布 → 必须先清干净】
      // 【尺寸铁律】立绘素材就是 750×1624 = 设计画布同尺寸，必须 1:1 铺，绝不能缩放裁切。
      var sc = _pcSharpCv, sg = sc.getContext('2d');
      sg.clearRect(0, 0, DW, H);
      var iw = portrait.width || DW, ih = portrait.height || DH;
      var sw = DW, sh = DW * (ih / iw);
      if (sh < H) { sh = H; sw = H * (iw / ih); }   // 图比画布更扁时改按高铺满
      sg.drawImage(portrait, (DW - sw) / 2, 0, sw, sh);
      PC.sharp = sc;
      // ② 模糊层：降采样到 1/10 再放大回来（浏览器双线性插值即模糊）
      var tw = _pcTinyCv.width, th = _pcTinyCv.height;
      var tg = _pcTinyCv.getContext('2d');
      tg.clearRect(0, 0, tw, th);
      tg.drawImage(sc, 0, 0, tw, th);
      var bc = _pcBlurCv, bg2 = bc.getContext('2d');
      bg2.clearRect(0, 0, DW, H);
      if (bg2.imageSmoothingEnabled !== undefined) bg2.imageSmoothingEnabled = true;
      bg2.drawImage(_pcTinyCv, 0, 0, tw, th, 0, 0, DW, H);
      // 压暗：模糊态同时要暗（brightness .55 → 叠 45% 黑）
      bg2.fillStyle = 'rgba(14,10,20,.45)'; bg2.fillRect(0, 0, DW, H);
      PC.blur = bc;
    } catch (e) { PC.sharp = null; PC.blur = null; }
  }
  // 显影进度：默认 70% 起步，随清豆进度补到 100%
  function revealP() {
    if (!S || !S.total) return 0.70;
    return 0.70 + 0.30 * clamp(S.cleared / S.total, 0, 1);
  }
  // 每帧画立绘：模糊层打底 → 清晰层按 alpha 叠上去（交叉淡入）
  function drawPortraitLayers(g) {
    if (!PC.sharp) return false;
    var p = revealP();
    if (PC.blur) g.drawImage(PC.blur, 0, 0);
    g.save();
    g.globalAlpha = p;
    g.drawImage(PC.sharp, 0, 0);
    g.restore();
    // 【用户反馈】「背景感觉完全没透明度，100% 展示」—— 确实如此，这里说明原因：
    // 立绘不是靠 alpha 透出底色的，而是「模糊层打底 + 清晰层叠加」的交叉淡入，
    // 两层都是同一张图，叠起来永远不透明，所以 revealP 的 0.70 只影响「清不清晰」，
    // 完全不影响「亮不亮」→ 观感就是 100% 实体。原来唯一的压暗是 0.30×(1-p)，
    // p=0.70 时只有 9% 黑，几乎等于没压。
    // 现在改成「常驻基础压暗 BG_DIM」，让豆子/车的白描边稳定跳出来。
    g.fillStyle = 'rgba(14,10,20,' + (BG_DIM + 0.16 * (1 - p)).toFixed(3) + ')';
    g.fillRect(0, 0, DW, PC.h);
    // 顶栏压暗：HUD 白字可读
    var gt = g.createLinearGradient(0, 0, 0, 150);
    gt.addColorStop(0, 'rgba(30,22,30,.38)'); gt.addColorStop(1, 'rgba(30,22,30,0)');
    g.fillStyle = gt; g.fillRect(0, 0, DW, 150);
    return true;
  }

  // ── 背景静态层（不含立绘）── F1/P1 只画一次 ──────────────────
  // v2：立绘改由 drawPortraitLayers 每帧画（要动态显影），这里只留
  //     「立绘缺失时的降级底色」+「道具栏」。
  //     【候选区底板已删除】—— 用户要求候选首排/次排直接透出立绘。
  // 【性能】静止豆阵整片烘进离屏画布：每帧 3240 次 canvas 操作 → 1 次 drawImage。
  // 只在豆状态变化时重建（beanCache=null），而豆每 167ms 才少一颗。
  // 【关键】画布必须复用！豆阵每 167ms 重建一次，若每次 mkCanvas 就是每秒申请
  // 6 张 750×1624=122 万像素的画布，GC 会周期性停顿，卡顿比不缓存还严重。
  var _beanCv = null, _sceneCv = null;
  function scratch(which) {
    var c = (which === 'bean') ? _beanCv : _sceneCv;
    if (!c) {
      try { c = mkCanvas(DW, DH); } catch (e) { return null; }
      if (!c) return null;
      if (which === 'bean') _beanCv = c; else _sceneCv = c;
    }
    return c;
  }
  function buildBeanCache() {
    var cvs = scratch('bean'), g2, i;
    if (!cvs) return null;
    try { g2 = cvs.getContext('2d'); } catch (e) { return null; }
    if (!g2) return null;
    g2.clearRect(0, 0, DW, DH);                  // 复用画布 → 必须先清干净
    for (i = 0; i < S.beans.length; i++) {
      var b = S.beans[i];
      if (b.gone || b.moving) continue;          // moving 的由 flights 每帧单独画
      var bp = beanXY(b);
      drawBean(g2, bp.x, bp.y, b.color, L.cell, false);
    }
    return cvs;
  }

  // ── 【性能根治 · 增量擦除】beanCacheDrop ────────────────────────────
  // 【问题】原来只要有一颗豆起步或落地，就 beanCache = null → 下一帧全量重绘
  //   整片豆阵（第 2 关 620 颗 → 620 次 drawBean）。豆子事件是【每颗豆两次】
  //   （moving=true 起步、gone=true 离场），第 2 关一局就是 1240 次全量重绘。
  //   把吞吐从 6 颗/秒提到 30 颗/秒后，重绘频率同比翻 5 倍 → 真机 fps 6~13、
  //   长帧 150~200ms。这才是卡顿的真正来源（suck 本身实测仅 0.3ms，不是瓶颈）。
  //
  // 【修法】一颗豆离开静止阵，画面上受影响的只有它自己那一小块。
  //   于是：清掉它的绘制矩形 → 只把与该矩形相交的少数邻居重画一遍。
  //   相交邻居通常 ≤ 9 颗 → 每次事件从 620 次 drawBean 降到约 9 次（省 98%）。
  //   遍历 S.beans 找相交者是纯比较（无 canvas 操作），代价可忽略。
  //
  // 【为什么必须重画邻居】drawBean 带小腿和阴影，绘制框比单个 cell 大，
  //   相邻豆的像素会互相压盖。只 clearRect 不补画，会在被擦格子周围留下缺角。
  //
  // 返回 true = 增量成功；false = 缓存不存在/取不到 ctx，交由调用方走全量重建。
  function beanCacheDrop(bean) {
    if (!beanCache || !bean) return false;
    var g2;
    try { g2 = beanCache.getContext('2d'); } catch (e) { return false; }
    if (!g2) return false;
    var cell = L.cell;
    var bp = beanXY(bean);
    // ══ 【擦除框收紧 · 性能实测 2026-08-30】═══════════════════════════
    // 【实测发现】上面注释写「相交邻居通常 ≤ 9 颗」—— 实测是 **77 颗**，错了 8 倍。
    //   （tools/prof-drop.js：关3 404 豆，单次 drop 平均命中 77.3 个邻居）
    // 【为什么错这么多】旧代码 pad = cell，擦除框 = cell*3 + pad*2 = 5×5 格；
    //   邻居判定又用 ±cell*2 再外扩一圈 → 实际相交判定覆盖 7×7 = 49 格，
    //   在 34px 格距下就是 77 颗豆全部命中并被重画。
    // 【真实需要多大】bean atlas 是 64×64 正方形帧，blit 传的是 (sz, sz) 且以
    //   (x,y) 为中心 → 一颗豆的像素占地【恰好一个 cell】，不溢出。
    //   （drawBean 里已明确去掉外投影 groundShadow，注释见该处；
    //    小腿只在走路态 drawBeanWalk 里有，而走路豆不在这张静止缓存里。）
    //   所以擦掉自己 1 格 + 半格安全余量就够，邻居只需查紧邻 8 格。
    // 【收益】每次 drop 的 drawBean 从 77 次降到约 8 次（省 90%），
    //   而每次 drawBean 都是一次写离屏画布 → 写少了，
    //   「离屏画布作为 GPU 纹理」被作废重传的数据量同比下降。
    var pad = cell * 0.5;
    var rx = bp.x - cell / 2 - pad, ry = bp.y - cell / 2 - pad;
    var rw = cell + pad * 2, rh = cell + pad * 2;
    g2.clearRect(rx, ry, rw, rh);
    // 把仍属于静止阵、且绘制框与擦除框相交的豆补画回去
    for (var i = 0; i < S.beans.length; i++) {
      var b = S.beans[i];
      if (b === bean || b.gone || b.moving) continue;
      var p = beanXY(b);
      // 该豆占地一个 cell（以 p 为中心），与擦除框做标准 AABB 相交判定。
      // 【不再多留余量】旧代码用 ±cell*2 是按「绘制框比 cell 大」的错误前提写的，
      // 而 64×64 方形帧恰好等于 cell —— 多留的两格纯粹是白重画。
      if (p.x + cell / 2 < rx || p.x - cell / 2 > rx + rw) continue;
      if (p.y + cell / 2 < ry || p.y - cell / 2 > ry + rh) continue;
      drawBean(g2, p.x, p.y, b.color, cell, false);
    }
    return true;
  }
  // 【性能根治】把「模糊立绘 → 清晰立绘(globalAlpha=rp) → 压暗 → 顶栏渐变 → bgCache」
  // 五层在一张离屏画布上合成完。这些层的唯一变量是 rp(=revealP())，而 rp 只随
  // S.cleared 变化（每 167ms 才动一次），所以两次豆子消失之间它是完全静止的。
  // 返回 null 时 render 自动降级回逐帧老路径，绝不空屏。
  function buildScene(rp) {
    var cvs = scratch('scene'), g2;
    if (!cvs) return null;
    try { g2 = cvs.getContext('2d'); } catch (e) { return null; }
    if (!g2) return null;
    g2.clearRect(0, 0, DW, DH);                  // 复用画布 → 必须先清干净
    if (PC.sharp) {
      if (PC.blur) g2.drawImage(PC.blur, 0, 0);
      g2.save();
      g2.globalAlpha = rp;
      g2.drawImage(PC.sharp, 0, 0);
      g2.restore();
      g2.fillStyle = 'rgba(14,10,20,' + (BG_DIM + 0.16 * (1 - rp)).toFixed(3) + ')';
      g2.fillRect(0, 0, DW, PC.h);
      // 顶栏压暗：HUD 白字可读
      var gt = g2.createLinearGradient(0, 0, 0, 150);
      gt.addColorStop(0, 'rgba(30,22,30,.38)'); gt.addColorStop(1, 'rgba(30,22,30,0)');
      g2.fillStyle = gt; g2.fillRect(0, 0, DW, 150);
    }
    if (!bgCache) bgCache = buildBg();
    if (bgCache) g2.drawImage(bgCache, 0, 0, DW, DH);
    return cvs;
  }
  function buildBg() {
    if (!_bgCv) _bgCv = mkCanvas(DW, DH);          // 【画布复用】同上，不再每关新建
    if (!_bgCv) return null;
    var cvs = _bgCv;
    var g = cvs.getContext('2d');
    g.clearRect(0, 0, DW, DH);
    // 降级：立绘没加载出来、或离屏缓存构建失败，都不能空白
    // 【断层修复】判据必须同时看 PC.sharp：存在「图片加载成功(portraitOK=true) 但
    // 离屏 canvas 创建/绘制失败(PC.sharp=null)」的中间态 —— 此时 drawPortraitLayers
    // 直接 return false 什么都不画，若这里只判 portraitOK 就会跳过降级底色，
    // 画面只剩 render 首行的 #14111A → 用户看到「豆子和车悬空在纯黑底上」。
    if (!portraitOK || !PC.sharp) {
      g.fillStyle = '#8B8790'; g.fillRect(0, 0, DW, DH);
      g.fillStyle = '#B0ACBC';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(DW, 0); g.lineTo(DW, DH * .16); g.lineTo(0, DH * .74); g.closePath(); g.fill();
    }
    // ── 道具栏已移出：它必须在【候选车之后】画才能半遮（见 drawTrayPanel）。
    // 写在 bgCache 里会先于候选车输出 → 遮不住，这是 v2 的层级关键。
    return cvs;
  }
  // 道具栏面板：唯一不透明，z 最高，压住候选次排底部 22px（1488-1466）
  // 【用户要求 4】原来 rr(...) 的高度是 DH-trayY+20，圆角 40 —— 底部圆角会把
  // 左右下角切掉一小块，露出 render 首行的 #14111A 黑底；且真机安全区比 1624 更高时
  // 底部整条都会漏黑。现在：① 先用同色矩形把 trayY 以下无限铺满（+400 冗余），
  // ② 再叠圆角面板做顶部的圆角造型。两者同色，肉眼只看到一个带圆角顶的面板。
  var TRAY_C = '#C9B8E8';
  function drawTrayPanel(g) {
    g.fillStyle = TRAY_C;
    g.fillRect(-40, L.trayY, DW + 80, DH - L.trayY + 400);   // 兜底：往下多铺 400px
    rr(g, -20, L.trayY, DW + 40, DH - L.trayY + 20, 40);
    g.fill();
  }

  // ── 豆子：圆角方块 + 两条小腿（参考图核心特征）─────────────
  // ── 【走路帧绘制 · 方案一】────────────────────────────────────────────
  // 【与 blit 的区别 · 为什么不能复用】blit 只会取 atlas 的【第 0 行】
  //   （写死 sy=0），而走路图是 7 列 × 4 行的二维表，必须能按行取帧。
  // 【对位铁律】帧是 64×96：上 64 是身体、下 32 是腿。豆子被吸起的瞬间会从
  //   64×64 方块帧切到这张帧，若按整帧居中，身体中心会【上跳 16px】，
  //   看起来就是「豆子被吸起时猛地一顿」。所以这里必须让【身体部分】
  //   而不是整帧对齐到 (x,y)：把帧顶钉在 y - sz/2，腿自然垂在下方。
  // 【phase】外部传入的连续相位（弧度），这里只做取模换帧，不参与运动学 ——
  //   摆腿已经烘进帧里，绝不再叠加位移，否则会和 bob/sway/duang 打架成乱抖。
  function drawBeanWalk(g, x, y, col, sz, phase) {
    var a = ATL.walk;
    if (!a.ok) return false;
    var ci = CKEY.indexOf(col);
    if (ci < 0) return false;
    var fi = Math.floor(phase / Math.PI * 2) % a.n;   // 半个 π 换一帧
    if (fi < 0) fi += a.n;
    var k = sz / a.body;                              // 按【身体】定标，不是按整帧
    var dw = a.cw * k, dh = a.ch * k;
    g.drawImage(a.img, ci * a.cw, fi * a.ch, a.cw, a.ch,
                x - dw / 2, y - sz / 2, dw, dh);
    return true;
  }
  // walkPhase：传数字 = 用走路帧（长腿+摆动）；传 undefined = 用阵内方块帧。
  function drawBean(g, x, y, col, sz, dim, walkPhase) {
    // 走路态优先：只有「离开豆阵、四周是空白」时才走这条，此时腿完全可见。
    // 缺图会返回 false 自动落回下面的方块帧 —— 缺素材只是没腿，不会白屏。
    if (walkPhase !== undefined && drawBeanWalk(g, x, y, col, sz, walkPhase)) return;
    // 优先用 3D 渲染帧；dim（被压住）用 globalAlpha 压暗，不需要单独出一套贴图
    if (ATL.bean.ok) {
      // 【用户要求 6】不再画 groundShadow。
      // 原因：外投影是一个椭圆暗斑，画在豆的【下方】，相邻两行豆之间就会出现
      // 一条暗带 —— 那正是用户说的「拼不严、有缝」的观感来源之一。
      // 新 atlas 已把接地暗部【渐变画进帧内部底边】，铺满时是连续的明暗起伏，
      // 不会形成任何暗线。所以这里必须去掉外投影，否则等于白改。
      if (dim) { g.save(); g.globalAlpha = 0.55; }
      // 【严丝合缝的关键】传 (sz, sz) 而不是 sz*1.42。
      // 帧已是 64×64 正方形，k = sz/64 → 渲染尺寸恰好等于一个格子(sz)，
      // 相邻豆边到边贴合，零缝隙、零重叠。
      // 旧代码乘 1.42 是为了把 64×80 的非方形帧「撑大到能看清」，
      // 副作用就是每颗豆都比格子大 → 互相重叠且参差不齐。
      blit(g, 'bean', col, x, y, sz, sz);
      if (dim) g.restore();
      return;
    }
    var c = C[col], w = sz, h = sz * .82, legW = sz * .22, legH = sz * .3;
    var x0 = x - w / 2, y0 = y - h / 2 - legH * .3;
    // 两条腿
    g.fillStyle = dim ? c.dark : c.side;
    rr(g, x0 + w * .16, y0 + h - 2, legW, legH, legW * .4); g.fill();
    rr(g, x0 + w - w * .16 - legW, y0 + h - 2, legW, legH, legW * .4); g.fill();
    // 身体
    rr(g, x0, y0, w, h, sz * .22);
    g.fillStyle = dim ? c.dark : c.main; g.fill();
    // 顶面高光
    if (!dim) {
      rr(g, x0 + w * .16, y0 + h * .12, w * .34, h * .2, h * .1);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
    }
  }

  // ── 车：俯视 3D，车门可张开（参考图核心特征）───────────────
  // 注：door 参数保留仅为兼容调用方，已不再绘制。
  // 【删除车门】旧版用两块程序化白色内衬板叠在贴图上假装开门，
  // 拼接痕明显、很丑（用户要求删除）。开门反馈改用音效 sfxDoor 单独表达。
  function drawCar(g, cx, cy, w, h, col, num, door, showNum) {
    var c = C[col], x0 = cx - w / 2, y0 = cy - h / 2;
    // ── 优先走 3D 渲染帧 ──
    if (ATL.car.ok) {
      groundShadow(g, cx, y0 + h * 0.97, w);
      blit(g, 'car', col, cx, cy, w, h);
      if (showNum !== false) {
        txt(g, String(num), cx, cy - h * .04,
            'bold ' + Math.round(h * .34) + 'px sans-serif',
            '#FFFFFF', 'rgba(0,0,0,.72)', Math.max(5, h * .05));
      }
      return;
    }
    // 四个轮子（露在车身两侧，先画在底层）
    var wr = w * .085, wy1 = y0 + h * .24, wy2 = y0 + h * .74;
    g.fillStyle = '#2A2730';
    rr(g, x0 - wr * .7, wy1, wr * 1.5, h * .16, wr * .6); g.fill();
    rr(g, x0 - wr * .7, wy2, wr * 1.5, h * .16, wr * .6); g.fill();
    rr(g, x0 + w - wr * .8, wy1, wr * 1.5, h * .16, wr * .6); g.fill();
    rr(g, x0 + w - wr * .8, wy2, wr * 1.5, h * .16, wr * .6); g.fill();

    // 车身投影 + 主体
    g.save();
    g.shadowColor = 'rgba(0,0,0,.38)'; g.shadowBlur = 12; g.shadowOffsetY = 6;
    rr(g, x0, y0, w, h, w * .26); g.fillStyle = c.main; g.fill();
    g.restore();
    // 车身内高光（顶面渐亮）
    var lg = g.createLinearGradient(x0, y0, x0, y0 + h);
    lg.addColorStop(0, 'rgba(255,255,255,.22)');
    lg.addColorStop(.45, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,.16)');
    rr(g, x0, y0, w, h, w * .26); g.fillStyle = lg; g.fill();
    // 车身描边（让车从背景里跳出来）
    rr(g, x0, y0, w, h, w * .26);
    g.lineWidth = Math.max(2, w * .028); g.strokeStyle = 'rgba(0,0,0,.30)'; g.stroke();

    // 前挡风玻璃（车头，梯形感白块）
    rr(g, x0 + w * .15, y0 + h * .055, w * .70, h * .155, w * .09);
    g.fillStyle = 'rgba(236,240,246,.95)'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.16)'; g.stroke();
    // 后挡风玻璃（车尾白条）
    rr(g, x0 + w * .19, y0 + h * .80, w * .62, h * .115, w * .07);
    g.fillStyle = 'rgba(236,240,246,.92)'; g.fill();
    // 车顶中线（两侧车门缝）
    g.fillStyle = 'rgba(0,0,0,.13)';
    g.fillRect(x0 + w * .5 - w * .012, y0 + h * .26, w * .024, h * .48);
    // 大数字带黑描边（参考图）
    if (showNum !== false) {
      txt(g, String(num), cx, cy + h * .06, 'bold ' + Math.round(h * .34) + 'px sans-serif', '#FFFFFF', 'rgba(0,0,0,.62)', 6);
    }
  }

  // ── 干扰车【不做任何视觉标记】（用户铁律）────────────────────────
  // 曾加过黄黑警示带 + 问号徽章，被用户否决：「车就正常出来」。
  // 道理是对的 —— 标出来的陷阱不是陷阱，玩家只会条件反射避开那辆车，
  // 观察成本归零，等于白做。现在干扰车和普通车长得一模一样，
  // 唯一的辨别方式就是【自己看阵里到底有没有这个颜色的豆】——
  // 这正是用户要的「不认真看就找不到对应的车」。

  // ── 彩虹拱门 + 星 + 缎带（通关页，参考图）──────────────────
  function drawWin(g) {
    // 【用户要求】一次性渲染：整页所有元素同时出现，不再分 0ms/380ms/620ms 三段淡入。
    // 旧做法弹窗要等 1020ms 才铺完，手感很拖。现在只保留一个极短的整体入场缩放。
    // 【用户要求】彩虹/星星/缎带再往上移（.19 → .15），给下方立绘腾更多空间。
    var t = clamp(S.winT / 180, 0, 1), cx = DW / 2, cy = DH * .15;
    g.fillStyle = 'rgba(16,14,20,.9)'; g.fillRect(0, 0, DW, DH);
    g.save();
    g.translate(cx, cy); g.scale(easeOutBack(t), easeOutBack(t)); g.translate(-cx, -cy);
    // 彩虹拱门
    var cols = ['#FF5E5E', '#FFA53D', '#FFE04D', '#63D66E', '#4DC5FF', '#9B6BFF'];
    for (var i = 0; i < cols.length; i++) {
      g.beginPath(); g.arc(cx, cy + 60, 172 - i * 15, Math.PI, 0);
      g.lineWidth = 16; g.strokeStyle = cols[i]; g.stroke();
    }
    // 3 星（中间大）
    // 【必须读冻结值】S.star 在 onFlightDone 判胜的那一刻算好并冻结。
    // 不能在这里现算 —— S.moves 在 win 之后仍会被广告道具/拖走僵尸车改动，
    // 现算会导致弹窗上的星数自己往下掉（用户视角：「我三星怎么变两星了」）。
    // 兜底 `|| ...` 只服务「老存档/异常路径进 win 但 S.star 没赋值」的极端情况。
    var st = S.star || (S.moves <= S.lv.stars.three ? 3 : (S.moves <= S.lv.stars.two ? 2 : 1));
    for (i = 0; i < 3; i++) {
      var sx = cx + (i - 1) * 96, sy = cy + (i === 1 ? -34 : 6), sr = i === 1 ? 50 : 38;
      g.save(); g.translate(sx, sy);
      g.beginPath();
      for (var k = 0; k < 10; k++) {
        var a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? sr * .46 : sr;
        if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      g.closePath();
      g.fillStyle = i < st ? '#FFD64A' : 'rgba(255,255,255,.2)'; g.fill();
      g.lineWidth = 5; g.strokeStyle = i < st ? '#E09B18' : 'rgba(255,255,255,.28)'; g.stroke();
      g.restore();
    }
    // 蓝缎带
    // 【用户反馈「解救成功被图片遒住」的根因就在这两个数：
    //   旧值 ry = cy+96 → 缎带燕尾底缘 = cy+192（=435.6）
    //   旧值 fy0 = cy+150（=393.6）= 白框顶
    //   白框顶比燕尾底高了 42px → 白框直接盖在缎带下半截上，把「解救成功」遮了。
    // 【修法】缎带往上贴近彩虹（96→62，燕尾底缘上提到 401.6，恰好接在彩虹底缘
    //   311.6 下方），同时白框下推（150→172 = 415.6）—— 两边向反方向让，
    //   拉出 14px 真空隔，既完彻不遮挡，也兑现了用户要的「整体往上、靠彩虹近一点」。
    // ⚠️ 改这两个数必须同时验：cy+RY+96 < cy+FY，否则遮挡会复现。
    var RIBBON_DY = 62, FRAME_DY = 172;
    var ry = cy + RIBBON_DY;
    rr(g, cx - 210, ry, 420, 74, 12); g.fillStyle = '#3E8FE0'; g.fill();
    rr(g, cx - 210, ry, 420, 22, 10); g.fillStyle = 'rgba(255,255,255,.24)'; g.fill();
    g.fillStyle = '#2A6BB5';
    g.beginPath(); g.moveTo(cx - 210, ry + 74); g.lineTo(cx - 250, ry + 96); g.lineTo(cx - 210, ry + 40); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 210, ry + 74); g.lineTo(cx + 250, ry + 96); g.lineTo(cx + 210, ry + 40); g.closePath(); g.fill();
    txt(g, '解救成功', cx, ry + 38, 'bold 52px sans-serif', '#FF4A4A', '#FFFFFF', 8);
    g.restore();

    // 【用户要求】白框里不再画拼豆成品图，改画本关美女，文案「已成功解救 xx」。
    // 一次性渲染：去掉原来 (winT-380)/460 的淡入，与上方同步出现。
    // 【用户要求 1·第二版】上一版 340×620 封顶算出 286×620，又细又高像个纸条，所以「尺寸怪」。
    // 原因：立绘本身是 750×1624（宽高比 0.46，极端细长），contain 下框必然跟着细长。
    // 保持 contain（用户要求等比、完整），但把两个封顶都放大，让图尽量占满可用区：
    // 可用竖向空间 = 按钮顶(DH*.82-58) − 两行文字(110) − 框顶 ≈ 700，所以 FH_MAX 开到 660。
    var FW_MAX = 430, FH_MAX = 660;
    var pw = (portrait && portrait.width) || 750, ph = (portrait && portrait.height) || 1624;
    var kFit = Math.min(FW_MAX / pw, FH_MAX / ph);
    var fw = Math.round(pw * kFit), fh = Math.round(ph * kFit);
    var pad = 12;
    var bw2 = fw + pad * 2, bh2 = fh + pad * 2;           // 白框外框 = 图 + 内边距
    var fx0 = cx - bw2 / 2, fy0 = cy + FRAME_DY;
    g.save();
    g.shadowColor = 'rgba(255,214,74,.55)'; g.shadowBlur = 26;
    rr(g, fx0, fy0, bw2, bh2, 26); g.fillStyle = '#FFFFFF'; g.fill();
    g.shadowBlur = 0;
    rr(g, fx0 + pad, fy0 + pad, fw, fh, 18); g.fillStyle = '#FFF0F5'; g.fill();
    // 美女立绘：contain fit —— 完整展示，不裁切
    g.save();
    rr(g, fx0 + pad, fy0 + pad, fw, fh, 18); g.clip();
    var okImg = portraitOK && portrait;
    if (okImg) {
      try {
        g.drawImage(portrait, fx0 + pad, fy0 + pad, fw, fh);
      } catch (e) { okImg = false; }
    }
    if (!okImg) {
      // 降级：图没加载出来也不能空白（注意用 fh 而非已删除的 fs，否则这里会 ReferenceError）
      g.beginPath(); g.arc(cx, fy0 + pad + fh * .40, 92, 0, 6.2832);
      g.fillStyle = '#FFC2E0'; g.fill();
      txt(g, girlName(), cx, fy0 + pad + fh * .40 + 16, 'bold 46px sans-serif', '#C24E86');
    }
    g.restore();
    txt(g, '已成功解救 ' + girlName(), cx, fy0 + bh2 + 50, 'bold 40px sans-serif', '#FFE9A8', 'rgba(0,0,0,.5)', 6);
    // 【用户要求 2】耗时：从进入本关（newGame 里记 S.t0）到通关那一刻，只算一次，
    // 存在 S.useSec 里 —— 不能在这里实时算 Date.now()，否则弹窗停留期间数字还在涨。
    txt(g, '耗时：' + (S.useSec !== undefined ? S.useSec : 0) + ' 秒', cx, fy0 + bh2 + 100,
        'bold 34px sans-serif', '#FFFFFF', 'rgba(0,0,0,.5)', 5);
    g.restore();

    // 【用户要求】主页键换成「分享」（主页本来也没上线，位置给更有用的入口）；
    // 右侧新增「看 TA 私房」—— 激励视频解锁，看完弹浮层放该主播的跳舞视频。
    var by = DH * .82;
    g.save();
    function pill(x, w2, h2, fill, edge, label, fs2) {
      rr(g, x, by - h2 / 2, w2, h2, h2 / 2); g.fillStyle = edge; g.fill();
      rr(g, x + 4, by - h2 / 2 + 4, w2 - 8, h2 - 12, (h2 - 12) / 2); g.fillStyle = fill; g.fill();
      txt(g, label, x + w2 / 2, by, 'bold ' + fs2 + 'px sans-serif', '#FFFFFF', 'rgba(0,0,0,.4)', 5);
    }
    pill(52, 150, 108, '#FFB13D', '#D98A1E', '分享', 30);
    pill(226, 250, 116, '#6FD16F', '#3FA44A', '下一关', 40);
    // 私房：粉紫色区分于其它两个，右上角挂广告【摄像机】角标（和底部栏同一套语义）
    var pbX = 500, pbW = 198;
    pill(pbX, pbW, 108, '#FF6FA8', '#C93B74', '看 TA 私房', 28);
    var abx = pbX + pbW - 12, aby = by - 50;
    g.beginPath(); g.arc(abx, aby, 19, 0, 6.2832);
    g.fillStyle = '#E8352B'; g.fill();
    g.lineWidth = 3.5; g.strokeStyle = '#FFFFFF'; g.stroke();
    icon(g, 'video', abx, aby, 30, '#FFFFFF');   // 与底部栏同图标同尺寸，全场统一
    g.restore();
  }

  // ── 「看 TA 私房」视频浮层（用户要求）────────────────────────
  // 【为何用 ks.createVideo 而不是画到 canvas】快手小游戏的视频是**原生组件**，
  // 层级在 canvas 之上（除非 underGameView），所以不能用 drawImage 把帧画进游戏。
  // 做法：canvas 只画半透遮罩 + 关闭按钮，视频由容器叠在上面。
  var boudoirVideo = null;
  // boudoirPlaying：onPlay 是否已触发。canvas 上的「加载中…」只在它为 0 时画 ——
  // 这是唯一能区分「视频真的在放」和「容器建了但没起播」的信号。
  // boudoirTimer：起播超时定时器，必须在 close 时清掉，否则退出后还会弹超时 toast。
  var boudoirPlaying = 0, boudoirTimer = null;
  // 视频放在「boudoir」子包里（4.1MB），不计入 4MB 主包上限。
  // 子包必须先 loadSubpackage 成功才能访问里面的文件，否则 createVideo 拿到的是 404。
  var subLoaded = 0, subLoading = 0;
  function ensureBoudoirPkg(cb) {
    if (subLoaded) { cb(1); return; }
    if (typeof ks === 'undefined' || !ks.loadSubpackage) { cb(0); return; }
    if (subLoading) return;                     // 正在下就别重复触发（LoadSubpackageTask 无 abort）
    subLoading = 1;
    // 复用广告 loading 那套遮罩：下载几 MB 在弱网下要十几秒，没有反馈用户会以为卡死
    adLoadOn('私房加载中…');
    try {
      ks.loadSubpackage({
        name: 'boudoir',
        success: function () { subLoading = 0; subLoaded = 1; adLoadOff(); cb(1); },
        fail: function (e) {
          subLoading = 0; adLoadOff();
          console.warn('[boudoir] subpkg fail', e && e.errorMsg);
          cb(0);
        }
      });
    } catch (e) { subLoading = 0; adLoadOff(); cb(0); }
  }

  // 【坐标系换算 · 两个黑框的真凶】canvas 是设计坐标系（DW=750×DH=1624，每帧
  // translate(offX,offY)+scale），原生视频层吃的是真实逻辑屏幕 px、不受 canvas 变换影响。
  // 旧代码把设计坐标 (x=65,y=210,w=620,h=1102) 直传 createVideo → 在逻辑宽 ~393 的
  // 手机上 width 620 溢出右侧、height 1102 溢出底部，就是截图里那个偏到右下的大黑块。
  function boudoirScreenGeom() {
    var R = boudoirRect();
    return { x: offX + R.x * scale, y: offY + R.y * scale, w: R.w * scale, h: R.h * scale };
  }
  function syncBoudoirGeom() {
    if (!boudoirVideo) return;
    var s = boudoirScreenGeom();
    try {
      boudoirVideo.x = s.x; boudoirVideo.y = s.y;
      boudoirVideo.width = s.w; boudoirVideo.height = s.h;
    } catch (e) {}
  }
  // ══════════════════════════════════════════════════════════════════
  // 【根因·私房视频始终不播 2026-08-28】ks.createVideo 不认「包内相对路径」
  // ══════════════════════════════════════════════════════════════════
  // 现象：浮层是黑的，几秒后自己消失、什么都没播。
  // 归因链：createVideo 拿到 'boudoir/videos/xxx.mp4' 这种包内相对路径 →
  //   容器解析不到真实文件 → 既不触发 onPlay 也不一定触发 onError →
  //   canvas 上一直是「加载中」的黑窗 → 8s 后起播超时保护 closeBoudoir()
  //   → 浮层自己消失。这正是用户描述的现象，一字不差。
  //
  // 【依据】同仓库已上线验证的 ks667658648250668260/js/main-v43.js:268 原话：
  //   「把包内相对路径 copyFile 到 USER_DATA_PATH，得到 createVideo 认识的
  //     wxfile:// 绝对路径」
  //   该项目所有包内/分包视频都必须先 copyFile 才能播，这是快手容器的既有约束。
  //
  // 【修法】播放前先把子包里的 mp4 拷到 USER_DATA_PATH，拿绝对路径喂 createVideo。
  //   拷过一次就缓存路径，后续秒开（accessSync 命中即复用）。
  var bundledCopied = {}, bundledCopying = {};
  function ensureBundledCopied(relPath, cb) {
    if (bundledCopied[relPath]) { cb(bundledCopied[relPath]); return; }
    if (typeof ks === 'undefined' || !ks.getFileSystemManager ||
        !ks.env || !ks.env.USER_DATA_PATH) {
      console.warn('[boudoir] 无 FileSystemManager，退回相对路径（大概率播不了）');
      cb(relPath); return;                       // 缺 API：退回原路径，由 onError 兜底
    }
    if (bundledCopying[relPath]) {               // 正在拷 → 轮询等它，别拷两遍
      var t = setInterval(function () {
        if (bundledCopied[relPath]) { clearInterval(t); cb(bundledCopied[relPath]); }
        else if (!bundledCopying[relPath]) { clearInterval(t); cb(relPath); }
      }, 80);
      return;
    }
    bundledCopying[relPath] = 1;
    var fs = ks.getFileSystemManager();
    // 目标名把分隔符替换掉，避免 USER_DATA_PATH 下需要建子目录
    var dest = ks.env.USER_DATA_PATH + '/' + relPath.replace(/[/\\]/g, '_');
    try {                                        // 已拷过（跨会话也有效）→ 直接复用
      fs.accessSync(dest);
      bundledCopied[relPath] = dest; bundledCopying[relPath] = 0;
      dlog('[boudoir] 缓存命中 ' + dest);
      cb(dest); return;
    } catch (e) {}
    try {
      fs.copyFile({
        srcPath: relPath, destPath: dest,
        success: function () {
          bundledCopied[relPath] = dest; bundledCopying[relPath] = 0;
          dlog('[boudoir] copyFile OK → ' + dest);
          cb(dest);
        },
        fail: function (e2) {
          bundledCopying[relPath] = 0;
          console.warn('[boudoir] copyFile FAIL ' + relPath + ' : ' + (e2 && e2.errMsg));
          cb(relPath);                           // 交给 onError 报错，不静默黑屏
        }
      });
    } catch (e3) {
      bundledCopying[relPath] = 0;
      console.warn('[boudoir] copyFile 异常 ' + (e3 && e3.message));
      cb(relPath);
    }
  }

  // ── 【素材已补齐】8 位主播 = 8 支视频，一一对应 ─────────────────────
  // 曾经只有前 4 人的 mp4，第 5 关起会 404 黑屏，那时用「key 散列映射到已有视频」
  // 兜底。副作用是甜甜/婧婧/琳琳/妮妮会播【别人】的视频 —— 只是不黑屏而已，
  // 观感上是错的。现在 8 支全部就位（每支都由本人立绘作首帧生成，人物一致），
  // 散列回退已彻底拆除：谁的关卡就播谁，缺图宁可暴露成 404 也不再偷换人。
  var BOUDOIR_HAVE = ['nuonuo', 'chenchen', 'weiwei', 'taotao',
                      'tiantian', 'jingjing', 'linlin', 'nini'];
  function boudoirKeyOf(gl) {
    var k = gl && gl.key ? gl.key : 'nuonuo', i;
    for (i = 0; i < BOUDOIR_HAVE.length; i++) if (BOUDOIR_HAVE[i] === k) return k;
    // 理论上走不到这里（GIRLS 与 BOUDOIR_HAVE 现已完全对齐）。
    // 万一将来新增主播却忘了配视频，这条 warn 就是唯一线索 —— 别静默偷换人。
    console.warn('[boudoir] 缺 ' + k + '_dance.mp4，请补素材（不再散列回退）');
    return k;
  }

  function openBoudoir() {
    // 【先静音再加载】子包下载 + copyFile 可能要几秒，这段时间里通关的感谢语音
    // 还在播（它是 900ms 延迟触发的），不在入口就掐掉的话，用户会听到「语音混着
    // 加载中」，视频起播后甚至还会残留一小段 —— 正是用户反馈的现象。
    muteAllForVideo();
    // 先确保子包到位 → 再 copyFile 拿绝对路径 → 最后才建视频实例
    ensureBoudoirPkg(function (ok) {
      if (!ok) { toast('私房加载失败，请稍后再试'); S.phase = 'win'; return; }
      var rel = 'boudoir/videos/' + boudoirKeyOf(girlOf()) + '_dance.mp4';
      adLoadOn('私房加载中…');                  // copyFile 首次要几百 ms，别让用户以为卡死
      ensureBundledCopied(rel, function (src) {
        adLoadOff();
        openBoudoirInner(src);
      });
    });
  }
  // srcPath = 已 copyFile 到 USER_DATA_PATH 的【绝对路径】（由 openBoudoir 传入）。
  // 绝不在这里再拼包内相对路径 —— 那正是视频永远不播的根因。
  function openBoudoirInner(srcPath) {
    var gl = girlOf();
    S.phase = 'boudoir';
    boudoirPlaying = 0;                          // 每次开都要归零，否则第二次进来不画 loading
    try {
      if (typeof ks === 'undefined' || !ks.createVideo) { toast('当前环境不支持视频'); S.phase = 'win'; return; }
      // 【用户要求】「当播视频的时候 无论之前 mp3 在播啥 都直接终止 mp3 的播放了」
      // 必须一次掐三类声音（语音 / BGM / 音效尾音），并作废延迟排队中的语音。
      muteAllForVideo();
      if (boudoirVideo) { try { boudoirVideo.destroy(); } catch (e) {} boudoirVideo = null; }
      // 【根因·用户反馈「没有展示视频的容器，也没看到视频播放，只闪了下私房加载中」】
      // 旧代码写 `ks.createVideo()` 空参 + 事后逐个挂属性，并在注释里断言
      // 「createVideo 本身不接受参数」—— 这个断言是错的。
      // 证据：同仓库已上线验证的 ks667658648250668260/js/main-v43.js 用的是
      //   wx.createVideo({ src, x, y, width, height, objectFit, autoplay, ... })
      // 一次性传完整 config。快手容器创建原生视频时**在 create 那一刻就要读全几何
      // 属性去布局图层**；事后再写 .x/.width 对已建好的图层无效 → 视频被建成
      // 0×0 / 默认位置 → 屏幕上根本没有视频容器，正是用户看到的现象。
      // 修法：把所有属性收进 config 一次性传入；事件在 create 后立刻绑。
      // 【根因·两个黑框 2026-08-28】截图铁证：canvas 画的粉框位置正确，但原生视频层
      // 是另一个偏到右下、溢出屏幕右侧和底部的黑矩形 —— 两者坐标系不同。
      //   canvas：设计坐标系 DW=750×DH=1624，每帧 translate(offX,offY) + scale(scale)
      //   原生层：真实逻辑屏幕 px（window.innerWidth/innerHeight），不吃 canvas 变换
      // 旧代码把设计坐标 (x=65,y=210,w=620,h=1102) 直传 createVideo，在逻辑宽 ~393 的
      // 手机上 width 620 溢出右侧、height 1102 溢出底部，正是截图那个大黑块。
      // 修法：用 fit() 里同一套 offX/offY/scale 把设计坐标换算成屏幕 px。
      // 视频文件本身没问题（h264 Main / 540×1170 / yuv420p），不是编码或 CDN 故障。
      var R = boudoirRect();
      var sx = offX + R.x * scale, sy = offY + R.y * scale;
      var sw = R.w * scale, sh = R.h * scale;
      // 【关键】src 必须是 openBoudoir 里 copyFile 拿到的绝对路径。
      // 这里若回退到包内相对路径，就是「黑浮层几秒自动消失」的原病灶。
      var vsrc = srcPath || ('boudoir/videos/' + boudoirKeyOf(gl) + '_dance.mp4');
      dlog('[boudoir] design=', R.x, R.y, R.w, R.h,
                  '→ screen=', Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
                  'scale=', scale.toFixed(3), 'src=', vsrc,
                  'abs=', (srcPath && srcPath.indexOf('/') === 0) ? 'YES' : 'NO(相对路径→大概率播不了)');
      boudoirVideo = ks.createVideo({
        src: vsrc,                      // USER_DATA_PATH 下的绝对路径
        x: sx, y: sy, width: sw, height: sh,
        objectFit: 'contain',
        autoplay: true,
        controls: false,
        loop: true,                     // loop=true 时 onEnded 不触发，靠关闭键退出
        showCenterPlayBtn: false,       // 不要容器自带的大播放按钮（会误导用户去点）
        enableProgressGesture: false,   // 关掉横滑进度，避免和关闭键抢手势
        poster: gl.img,                 // 首帧用该主播的立绘，加载期不空白
        backgroundColor: '#08060C'
      });
      // 【必须有 onPlay】否则 canvas 上那行「加载中…」永远不消失，
      // 真机上就是「闪一下加载中然后一直挂着」——用户看到的第二个现象。
      boudoirVideo.onPlay && boudoirVideo.onPlay(function () { boudoirPlaying = 1; });
      // 【黑边自愈】容器若能报出真实分辨率，就用它校正窗口比例并重算几何。
      // 这样以后换任何尺寸的素材都不会再出现两侧黑边，不需要回来改常量。
      boudoirVideo.onLoadedMetaData && boudoirVideo.onLoadedMetaData(function (res) {
        var w = res && (res.width || (res.detail && res.detail.width));
        var h = res && (res.height || (res.detail && res.detail.height));
        if (!w || !h) return;
        var ar = w / h;
        if (Math.abs(ar - BOUDOIR_AR) < 0.005) return;   // 已经一致，别白重排
        dlog('[boudoir] 实测分辨率 ' + w + 'x' + h + ' → 校正 AR ' +
                    BOUDOIR_AR.toFixed(4) + ' → ' + ar.toFixed(4));
        BOUDOIR_AR = ar;
        syncBoudoirGeom();
      });
      boudoirVideo.onError && boudoirVideo.onError(function (e) {
        console.warn('[boudoir] video error', e && (e.errMsg || e.errorMsg));
        toast('视频加载失败'); closeBoudoir();
      });
      // 【兜底】部分容器无视 autoplay，create 后补一次 play()；
      // 已在播的容器重复 play() 是幂等的，不会重头开始。
      try { if (boudoirVideo.play) boudoirVideo.play(); } catch (e2) {}
      // 起播超时保护：8s 还没 onPlay → 明确告知并退出，不让用户对着黑屏干等
      if (boudoirTimer) clearTimeout(boudoirTimer);
      boudoirTimer = setTimeout(function () {
        if (S.phase === 'boudoir' && !boudoirPlaying) { toast('视频起播超时，稍后再试'); closeBoudoir(); }
      }, 8000);
    } catch (e) { console.warn('[boudoir]', e && e.message); S.phase = 'win'; }
  }
  function closeBoudoir() {
    S.phase = 'win';
    if (boudoirTimer) { clearTimeout(boudoirTimer); boudoirTimer = null; }
    boudoirPlaying = 0;
    // 【必须 pause 再 stop 再 destroy】只 destroy 在部分容器上会留声音（原生图层已销毁
    // 但音轨还在跑），表现为「关掉浮层还能听见视频里的声音」。
    try { if (boudoirVideo) { if (boudoirVideo.pause) boudoirVideo.pause(); } } catch (e) {}
    try { if (boudoirVideo) { if (boudoirVideo.stop) boudoirVideo.stop(); } } catch (e) {}
    try { if (boudoirVideo) { if (boudoirVideo.destroy) boudoirVideo.destroy(); } } catch (e) {}
    boudoirVideo = null;
    try { if (bgmAudio) bgmAudio.play(); } catch (e) {}
  }
  // 视频窗口几何：过关浮层【保留】，视频容器叠在浮层上方的一个窗口里。
  // 【用户预期原文】「点击看私房 看完广告回来 预期是在当前的容器上方 展示一个 MP4
  //  播放的容器 在哪个 mp4 容器上 播放 视频 支持关闭 点击关闭后 就还是原来的过关浮层」
  //
  // ══ 【根因·视频两边有黑边 2026-08-28】═══════════════════════════════
  // 旧代码：`vh = vw * 16 / 9` —— 写死 9:16。但素材实测是 **540×1170**，
  //   宽高比 = 0.4615（约 9:19.5），比 9:16(0.5625) 细长得多。
  //   于是窗口被算成「比视频更宽」，objectFit:contain 按高度贴满后左右各留
  //   (620 − 1102×0.4615)/2 ≈ 56px 的空白 → 就是用户看到的两条黑边。
  // 【修法】窗口宽高比必须 === 视频宽高比，则 contain 不产生任何留白。
  //   AR 由素材实测写死；同时挂 onLoadedMetaData，容器若能报真实分辨率就动态校正，
  //   以后换素材（比如 720×1280）也不会再出现黑边。
  var BOUDOIR_AR = 540 / 1170;          // 素材实测（4 支视频全为 540×1170）
  function boudoirRect() {
    // 上方留标题、下方留呼吸区；两侧各留 28 边距
    var maxW = DW - 56, maxH = DH - 360;
    var vh = maxH, vw = Math.round(vh * BOUDOIR_AR);
    if (vw > maxW) { vw = maxW; vh = Math.round(vw / BOUDOIR_AR); }
    return { x: Math.round((DW - vw) / 2), y: Math.round((DH - vh) / 2) + 30, w: vw, h: vh };
  }
  // 关闭键：【必须完全落在视频窗口之外】。
  // 【用户反馈「关闭按钮太丑了被压在下方」】旧位置 (R.x+R.w−6, R.y−6) 有一半压在
  // 视频窗口内 —— 而原生视频层在部分容器里是压在 canvas 之上的，于是关闭键被视频
  // 盖掉一半，看上去就是「被压在下方」。现在整颗按钮挪到窗口右上角【外侧】，
  // 与窗口保持 14px 间隙，任何 z-order 都不会被遮。
  function boudoirCloseRect() {
    var R = boudoirRect();
    var r = 33;
    return { cx: DW - 30 - r, cy: R.y - 14 - r, r: r };
  }
  function drawBoudoir(g) {
    // 【根因修复 2026-08-28】旧代码第一行是
    //     g.fillStyle='rgba(8,6,12,.94)'; g.fillRect(0,0,DW,DH);
    // 全屏铺满几乎不透明的黑 → 把过关浮层整个替换掉了。原生视频层只要没起播，
    // 用户看到的就是一整块纯黑 —— 这正是「视频不播放 黑的」的真因
    // （视频文件是存在的：nuonuo_dance.mp4 1.2MB，第一关就是糯糯）。
    // 现在改为：① 先把过关浮层原样画出来 ② 只在视频窗口区域压暗 ③ 关闭键贴窗口角。
    var R = boudoirRect();
    // 【挖洞 2026-08-28】canvas 在 native 视频层【上方】，所以视频窗口那块
    // 必须是完全透明的「洞」，任何一笔填充盖上去，视频就看不见了。
    // 用 evenodd 裁剪：外层全屏矩形 + 内层视频矩形 → 裁剪域 = 全屏减去视频窗口。
    // 这样底下的过关浮层和遮罩照常画，但一笔都落不到视频区域里。
    g.save();
    g.beginPath();
    g.rect(0, 0, DW, DH);
    g.rect(R.x, R.y, R.w, R.h);
    try { g.clip('evenodd'); } catch (e) { g.clip(); }
    // 【不再画 drawWin】过关浮层里有大面积不透明卡片，在 native 视频上方
    // 会把视频糊死（即使裁剪掘了洞，浮层本身也会遮住视频周围并干扰观感）。
    // 关闭后 S.phase 回 'win'，过关浮层自然回来，符合用户预期。
    g.fillStyle = 'rgba(8,6,12,.82)'; g.fillRect(0, 0, DW, DH);   // 纯色背景，聚焦视频
    g.restore();
    // ② 视频窗口只画描边和阴影，【绝不填充窗口内部】—— 填了就把视频糊死
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
    rr(g, R.x, R.y, R.w, R.h, 26);
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,217,234,.75)'; g.stroke();
    g.restore();
    txt(g, girlName() + ' 的私房', DW / 2, R.y - 26, 'bold 38px sans-serif', '#FFD9EA', 'rgba(0,0,0,.6)', 6);
    // ③ 未起播时才在窗口内给反馈；起播后这里必须一片空白，让视频透上来
    if (!boudoirPlaying) {
      g.fillStyle = 'rgba(11,9,16,.92)';
      rr(g, R.x, R.y, R.w, R.h, 26); g.fill();
      txt(g, '加载中…', DW / 2, R.y + R.h / 2, '32px sans-serif', 'rgba(255,255,255,.62)');
    }
    // ④ 关闭键：粉白双层圆 + 粗圆头叉，挂在视频窗口右上角【外侧】。
    // 【用户反馈「关闭按钮太丑了被压在下方」】两处修：
    //   ① 位置：整颗按钮移出窗口（见 boudoirCloseRect），不再被原生视频层压住
    //   ② 样式：旧版是深灰实心 + 白描边，在纯黑背景上像个补丁；改成
    //      粉色渐层实心 + 白外环 + 白叉，和「私房」标题同一套配色，成体系不突兽
    var r = boudoirCloseRect();
    g.save();
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14; g.shadowOffsetY = 4;
    g.beginPath(); g.arc(r.cx, r.cy, r.r, 0, 6.2832);
    g.fillStyle = '#FF6FA8'; g.fill();
    g.restore();
    // 顶部高光：让圆看起来有体积，不是一块平贴纸
    var cg = g.createLinearGradient(r.cx, r.cy - r.r, r.cx, r.cy + r.r);
    cg.addColorStop(0, 'rgba(255,255,255,.34)');
    cg.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.beginPath(); g.arc(r.cx, r.cy, r.r, 0, 6.2832);
    g.fillStyle = cg; g.fill();
    // 白外环
    g.beginPath(); g.arc(r.cx, r.cy, r.r, 0, 6.2832);
    g.lineWidth = 4; g.strokeStyle = '#FFFFFF'; g.stroke();
    // 粗圆头叉
    g.lineWidth = 5.5; g.lineCap = 'round'; g.strokeStyle = '#FFFFFF';
    var d = r.r * 0.40;
    g.beginPath();
    g.moveTo(r.cx - d, r.cy - d); g.lineTo(r.cx + d, r.cy + d);
    g.moveTo(r.cx + d, r.cy - d); g.lineTo(r.cx - d, r.cy + d);
    g.stroke();
    g.lineCap = 'butt';
  }

  // ── 主绘制 ────────────────────────────────────────────────
  // ── 新手引导：手势 + 文案浮层 ────────────────────────────────
  // 【用户要求原文】「增加一个新手引导 手势+文案浮层 告诉用户拨一下小车到车位上
  //  同款颜色的豆子进对应的车；要求手势必须严格对应到车上指引到车位上」
  //
  // 设计要点（为什么这么做）：
  // ① 手不能画个泛泛的手势动画，必须【真的从那辆车飞到那个车位】——
  //    起点用 qRect(qi) 算，终点用 slotRect(si) 算，两个都是渲染时的同一套坐标，
  //    所以永远严格对齐，不会出现「手指在空中比划、车在别处」的割裂感。
  // ② 高亮源车 + 目标车位：光靠一只手用户还是不知道「哪辆」「放哪」，
  //    所以两端各加一圈同色呼吸描边，把「A → B」这条关系说死。
  // ③ 文案分两行：主行讲操作，副行讲规则（同色豆子进对应颜色的车）——
  //    这是这个游戏唯一需要教的核心认知。
  // ④ 只要用户真的拖动了车，引导立刻消失（不打断、不强制），且整局只出一次。
  // guide 状态对象已在文件头部声明（newGame 要提前读它），这里只放函数。
  function guideTarget() {
    // 源：第一排最靠左的那辆车（用户第一眼看到的、也最容易够到的）
    var qi = -1, si = -1, i;
    for (i = 0; i < 4; i++) { if (S.queue[i]) { qi = i; break; } }
    if (qi < 0) return null;
    // 目标：第一个空且未锁的车位。第 6 位要看广告，绝不能拿它当新手第一步。
    for (i = 0; i < 6; i++) {
      if (i === 5 && S.slot6Locked) continue;
      if (!S.slots[i]) { si = i; break; }
    }
    if (si < 0) return null;
    return { qi: qi, si: si };
  }
  function guideStart() {
    if (guide.done) return;
    var t = guideTarget();
    if (!t) return;
    guide.on = 1; guide.t = 0; guide.qi = t.qi; guide.si = t.si;
  }
  function guideStop() {
    if (!guide.on) return;
    guide.on = 0; guide.done = 1;
  }
  function drawGuide(g, dt) {
    if (!guide.on) return;
    // 目标可能因为用户操作而失效（车没了 / 车位被占）→ 重新选一次，选不到就收
    if (!S.queue[guide.qi] || S.slots[guide.si]) {
      var t2 = guideTarget();
      if (!t2) { guide.on = 0; return; }
      guide.qi = t2.qi; guide.si = t2.si;
    }
    guide.t += dt;
    var q = qRect(guide.qi), r = slotRect(guide.si);
    var ax = q.x + q.w / 2, ay = q.y + q.h / 2;      // 起点：那辆车的中心
    var bx = r.x + r.w / 2, by = r.y + r.h / 2;      // 终点：那个车位的中心
    // 一个循环 1800ms：0~0.18 停在车上（让眼睛先找到车）→ 0.18~0.72 拖过去
    // → 0.72~1 停在车位上（强调终点），然后回到起点重来。
    var T = 1800, u = (guide.t % T) / T;
    var k;
    if (u < 0.18) k = 0;
    else if (u < 0.72) { var w2 = (u - 0.18) / 0.54; k = w2 * w2 * (3 - 2 * w2); }  // smoothstep，起落都缓
    else k = 1;
    var hx = ax + (bx - ax) * k, hy = ay + (by - ay) * k;
    var press = (u < 0.18 || u > 0.72) ? 1 : 0;      // 两端「按下」，中间「拖行」
    var puls = 0.5 + 0.5 * Math.sin(guide.t / 260);  // 呼吸
    g.save();
    // ① 源车高亮：金色呼吸描边
    g.lineWidth = 4 + puls * 2;
    g.strokeStyle = 'rgba(255,214,102,' + (0.55 + puls * 0.4).toFixed(2) + ')';
    rr(g, q.x - 4, q.y - 4, q.w + 8, q.h + 8, 16); g.stroke();
    // ② 目标车位高亮：同色描边 + 内部微微发亮，形成「从这里 → 到这里」
    g.lineWidth = 4 + (1 - puls) * 2;
    g.strokeStyle = 'rgba(255,214,102,' + (0.55 + (1 - puls) * 0.4).toFixed(2) + ')';
    rr(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 18); g.stroke();
    g.fillStyle = 'rgba(255,214,102,' + (0.10 + (1 - puls) * 0.10).toFixed(2) + ')';
    rr(g, r.x, r.y, r.w, r.h, 16); g.fill();
    // ③ 拖拽轨迹：从车到车位的虚线，把路径说死（不是随便一条弧线）
    g.setLineDash && g.setLineDash([12, 10]);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,214,102,.42)';
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.setLineDash && g.setLineDash([]);
    // ④ 手势：白色圆角手掌 + 食指，指尖精确落在 (hx,hy) 上
    var ripple = press ? (1 - Math.abs(Math.sin(guide.t / 300))) : 0;
    if (press) {                                   // 按下涟漪
      g.beginPath(); g.arc(hx, hy, 22 + ripple * 22, 0, 6.2832);
      g.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - ripple)).toFixed(2) + ')';
      g.lineWidth = 4; g.stroke();
    }
    drawHand(g, hx, hy, press);
    // ⑤ 文案浮层：放在豆阵和车队之间的空当，不挡任何可交互元素
    // 【用户要求】文案改用【艺术字贴图】（tools/gen-guide-text.py 预生成），
    // 不再用 txt() 现画系统字。贴图有渐变字面+双描边+硬投影，观感是「贴纸」级的，
    // 系统字无论怎么描边都做不到。缺图时自动回落 txt()，绝不因缺图而没有文案。
    //
    // 【浮层宽度必须按贴图实测宽度算】旧代码写死 tw=560，而新 l1 贴图设计宽 561 —— 
    // 写死就会左右各溢出 0.5px、且以后改文案（字数变化→宽度变化）必然再溢出一次。
    // 现在取两行的最大宽度 + 左右各 34 内边距，任何文案长度都自动包住。
    var ty = q.y - 96;
    var w1 = GTXT.l1.ok ? GTXT.l1.w : 520;
    var w2 = GTXT.l2.ok ? GTXT.l2.w : 470;
    var tw = Math.max(w1, w2) + 68;
    var tx = (DW - tw) / 2;
    g.fillStyle = 'rgba(18,14,26,.86)';
    rr(g, tx, ty - 54, tw, 104, 22); g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,102,.45)';
    rr(g, tx, ty - 54, tw, 104, 22); g.stroke();
    // 主行（艺术字）：中心对齐到 ty-12，与原 txt() 的基线位置一致，版式不跳
    if (GTXT.l1.ok) {
      try {
        g.drawImage(GTXT.l1.img, DW / 2 - GTXT.l1.w / 2, ty - 12 - GTXT.l1.h / 2,
                    GTXT.l1.w, GTXT.l1.h);
      } catch (e) { GTXT.l1.ok = false; }        // 贴图异常 → 永久回落，不每帧抛错
    }
    if (!GTXT.l1.ok) {
      txt(g, '滑动一辆小车到上面的空车位', DW / 2, ty - 12, 'bold 34px sans-serif', '#FFD666');
    }
    if (GTXT.l2.ok) {
      try {
        g.drawImage(GTXT.l2.img, DW / 2 - GTXT.l2.w / 2, ty + 30 - GTXT.l2.h / 2,
                    GTXT.l2.w, GTXT.l2.h);
      } catch (e) { GTXT.l2.ok = false; }
    }
    if (!GTXT.l2.ok) {
      txt(g, '同颜色的豆子会自己上对应的车', DW / 2, ty + 30, '27px sans-serif', 'rgba(255,255,255,.82)');
    }
    g.restore();
  }
  // ── 手势绘制：优先用雪碧图，缺图才回落矢量画法 ──────────────────────
  // 【锚点对齐】雪碧图单帧里指尖在 (0.30w, 0.16h)，把该点对到热点 (x,y)：
  //   dx = x - dw*0.30,  dy = y - dh*0.16
  // 按下时整只手微缩 0.92，保留原来的「压下去」力度感。
  var HAND_H = 132;                              // 屏上显示高度（设计坐标）
  function drawHand(g, x, y, press) {
    if (HAND.ok) {
      var s = press ? 0.92 : 1;
      var k = HAND_H / HAND.ch * s;
      var dw = HAND.cw * k, dh = HAND.ch * k;
      // 帧序号由引导计时驱动，21 帧 × 100ms 循环播放
      var fi = Math.floor(guide.t / HAND.ms) % HAND.n;
      if (fi < 0) fi = 0;
      g.save();
      g.shadowColor = 'rgba(0,0,0,.40)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      try {
        g.drawImage(HAND.img, fi * HAND.cw, 0, HAND.cw, HAND.ch,
                    x - dw * HAND.ax, y - dh * HAND.ay, dw, dh);
      } catch (e) { HAND.ok = false; }          // 贴图异常 → 永久回落，不每帧抛错
      g.restore();
      if (HAND.ok) return;
    }
    drawHandVec(g, x, y, press);
  }
  // 矢量降级画法：一个圆角掌心 + 一根伸出的食指，指尖就是 (x,y) 这个热点。
  // 雪碧图加载失败时用它兜底 —— 引导绝不能因为缺图而消失。
  function drawHandVec(g, x, y, press) {
    var s = press ? 0.92 : 1;                      // 按下时整只手微缩，有「压」的力度感
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    // 食指（从指尖热点向右下伸向掌心）
    g.lineCap = 'round';
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 15;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(13, 36); g.stroke();
    // 掌心
    g.beginPath();
    g.ellipse ? g.ellipse(22, 55, 21, 24, -0.32, 0, 6.2832)
              : g.arc(22, 55, 22, 0, 6.2832);
    g.fillStyle = '#FFFFFF'; g.fill();
    g.shadowBlur = 0;
    // 指尖小圆，明确热点位置
    g.beginPath(); g.arc(0, 2, 8, 0, 6.2832);
    g.fillStyle = '#FFFFFF'; g.fill();
    g.strokeStyle = 'rgba(120,96,60,.35)'; g.lineWidth = 2; g.stroke();
    g.restore();
  }
  function render(dt) {
    var g = ctx, i;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 【视频黑屏真因 · 第三层 2026-08-28】日志证明坐标已完全正确
    //   [boudoir] design= 65 210 620 1102 → screen= 36 127 340 604  scale= 0.548
    //   411×914 的屏，视频落在 (36,127) 340×604 —— 完全在屏幕内，onError 也没报。
    // 也就是说视频一直在正常播放，只是【看不见】。
    // 根因：快手小游戏的 ks.createVideo 是 native 层，渲染在 canvas **下方**；
    // 而这一行每帧 fillRect 铺满不透明 #14111A，把整个 native 视频层盖死了。
    // 修法：私房态下 clearRect 让 canvas 透明，视频才能从下面透上来。
    // （drawBoudoir 里那层 rgba(8,6,12,.55) 全屏遮罩同理，也必须挖掉视频窗口区）
    if (S && S.phase === 'boudoir') {
      g.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    } else {
      g.fillStyle = '#14111A'; g.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
    }
    g.save();
    g.translate(offX, offY); g.scale(scale, scale);
    g.beginPath(); g.rect(0, 0, DW, DH); g.clip();
    // 【私房态短路 2026-08-28】canvas 在 native 视频层上方，所以私房态下
    // 整个游戏场景（sceneCache 全屏图 + 豆阵 + 车队 + HUD）一笔都不能画 ——
    // 任意一笔铺到视频窗口上，视频就再次被糊死。这里直接短路，只画浮层。
    // 顺带白赚一份性能：私房播放期间 canvas 几乎零绘制。
    if (S && S.phase === 'boudoir') {
      drawBoudoir(g);
      drawAdLoading(g);
      g.restore();
      return;
    }

    // 【性能根治 · 真凶不是豆子 2026-08-28】
    // 上一版我只烘了豆阵（3240 次操作/帧 → 1 次），但用户仍说「完全没法玩」。
    // 重新全量算账，发现真正的大头是【每帧 3 次全屏 drawImage】：
    //   ① PC.blur   模糊立绘  750×1624 = 122 万 px
    //   ② PC.sharp  清晰立绘  122 万 px，还带 globalAlpha → 逐像素 alpha 混合
    //   ③ bgCache   静态层    122 万 px
    //   + createLinearGradient 每帧新建渐变对象（GPU 要重新上传 ramp）
    //   + fillRect 全屏压暗    122 万 px
    //   ≈ 366 万像素/帧的 alpha 混合，比豆子的 3240 次绘制调用重一个数量级。
    //
    // 关键事实：这三层的唯一变量是 revealP()，而它只随 S.cleared 变化 ——
    // 也就是【两次豆子消失之间，整个背景栈是完全静止的】，每帧重合成纯属浪费。
    // 改法：三层 + 渐变 + 压暗一次性烘进 sceneCache，每帧只 1 次 drawImage。
    // 失效：revealP 跨过 0.02 台阶时重建（整关约 15 次，不是每帧）。
    var rp0 = revealP();
    if (!sceneCache || Math.abs(rp0 - sceneRP) >= 0.02) {
      sceneCache = buildScene(rp0);
      sceneRP = rp0;
    }
    if (sceneCache) g.drawImage(sceneCache, 0, 0, DW, DH);
    else {                                      // 离屏失败 → 降级为老路径，绝不空屏
      if (!bgCache) bgCache = buildBg();
      drawPortraitLayers(g);
      g.drawImage(bgCache, 0, 0, DW, DH);
    }

    // ── HUD：齿轮 + 关卡胶囊 + 右侧三键（参考图）──
    g.save();
    g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.beginPath(); g.arc(62, 62, 38, 0, 6.2832); g.fillStyle = '#3E8FE0'; g.fill();
    g.restore();
    g.beginPath(); g.arc(62, 62, 38, 0, 6.2832); g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke();
    for (i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      g.beginPath(); g.arc(62 + Math.cos(a) * 17, 62 + Math.sin(a) * 17, 5.5, 0, 6.2832);
      g.fillStyle = '#FFFFFF'; g.fill();
    }
    g.beginPath(); g.arc(62, 62, 9, 0, 6.2832); g.fillStyle = '#3E8FE0'; g.fill();

    // 【用户要求 · 2026-08-28】关卡胶囊原来居中在 y=34，和刘海屏/灵动岛完全重合
    // （截图里被系统录屏胶囊压住），改为左上角、齿轮下方，彻底避开顶部安全区。
    var hudTxt = '关卡 ' + S.lv.id + '：解救 ' + girlName();
    var hudFont = 'bold 30px sans-serif';
    var tw2 = 0;
    try { g.font = hudFont; tw2 = g.measureText(hudTxt).width; } catch (e) { tw2 = 0; }
    if (!tw2) tw2 = hudTxt.length * 28;          // 兜底：容器没有 measureText 时按字数估
    var hw = Math.max(184, Math.min(DW - 48, tw2 + 52));
    var hx = 24, hy = 112;                       // 左对齐；齿轮圆心 62 半径 38 → 底边 100
    rr(g, hx, hy, hw, 54, 27); g.fillStyle = 'rgba(70,68,80,.82)'; g.fill();
    txt(g, hudTxt, hx + hw / 2, hy + 38, hudFont, '#FFFFFF');

    // 注：参考图右上角的「… | ⊗ 胶囊」是快手小游戏容器本身的系统 UI（菜单/关闭），
    // 不属于游戏内容，真机上容器会自己画。在游戏里重绘 = 双重胶囊，已移除。
    // 同理，右边缘那个可收起小面板也是平台活动入口，不是游戏元素，已移除。

    // ── 豆阵（【铁律】单层铺满，无堆叠）──
    // 【性能根治 2026-08-28 · 用户反馈「每一帧跟 ppt 似的很不丝滑」】
    // 实测每颗豆每帧的真实开销不是 2 次绘制，而是 9 次 canvas 操作：
    //   groundShadow: save + globalAlpha + fillStyle + beginPath + ellipse + fill + restore = 7
    //   blit:         indexOf + drawImage                                                  = 2
    // 360 豆 × 9 = 3240 次/帧，60fps 要跑 19.4 万次/秒 → 中低端机必然掉到十几帧。
    //
    // 关键事实：【阵内的豆是完全静止的】—— 它们不动，走起来的豆 b.moving=true
    // 会被下面的 flights 分支单独画。既然静止，每帧重画 3240 次纯属浪费。
    // 改法：整片豆阵烘进离屏画布，每帧只 1 次 drawImage；
    //       只在「有豆消失 / 有豆起步 / 换关」时重建（beanCache = null）。
    // 开销：3240 次/帧 → 1 次/帧，重建只在豆状态变化那一帧发生（每 167ms 才一次）。
    if (!beanCache) beanCache = buildBeanCache();
    if (beanCache) g.drawImage(beanCache, 0, 0, DW, DH);
    else {                                        // 离屏创建失败 → 降级为逐颗直画，绝不空屏
      for (i = 0; i < S.beans.length; i++) {
        var b = S.beans[i];
        if (b.gone || b.moving) continue;
        var bp = beanXY(b);
        drawBean(g, bp.x, bp.y, b.color, L.cell, false);
      }
    }

    // ── 走路豆：走过 lead 格才释放占位 → 后面那颗跟上 → 同向自然成队 ──
    for (i = flights.length - 1; i >= 0; i--) {
      var f = flights[i]; f.t += dt * mul();
      // ══ 【登车闸门 · 用户要求 5「小豆人慢慢走过来 聚合」】════════════
      // 上一轮我把 preTotal/seq/boarded 字段埋好了却没人消费 —— 纯死代码，
      // 所以用户看到的依然是「一颗接一颗直接钻进车门」。这里真正接上：
      //   豆子走到车门正前方（t >= preTotal）时必须先申请登车：
      //   · 同一辆车 BOARD_MS 内只放一个进门 → 「逐个上车」的节奏
      //   · 没轮到的把 t 钉在 preTotal 原地等，并按前面还有几个人
      //     沿来路往后错开 QGAP → 屏幕上真的出现一列纵队（这就是「聚合」）
      // 【为何按 seq 排而不是按 t】t 会因加速卡 mul() 而变，拿 t 排序会出现
      // 「后来的豆抢到前面」的插队观感。seq 是到达先后，永远稳定。
      // ══ 【排队铁律 · 用户 2026-08-30 第三次反馈】═════════════════════
      // 原话：「就让他们都排在车屁股后面 等待不要重叠和抖动 就一个个的排队逐个上车」
      // 【上一版三个错，逐条修】
      // ① 重叠：rank 只统计【已经走到车门】的豆（f2.t >= f2.preTotal）。
      //    两颗豆同一帧先后抵达时，后到的那颗算出 rank=0 → 和前一颗抢同一个坑位 →
      //    肉眼看到的就是「叠在一起」。
      //    改法：rank = 同车位所有【还没上车】且 seq 更小的豆的个数，
      //    不管它们走到哪儿了。seq 全局唯一且稳定 ⇒ rank 唯一 ⇒ 位次天然不撞。
      // ② 抖动：见下方 phase —— 等待时用墙钟驱动踏步，那是「抖」的来源，已改为静止。
      // ③ 队伍方向：改为固定排在【车尾正下方】而不是「沿来路倒退」。
      //    来路方向会因每颗豆的 BFS 路线不同而不同 → 同一辆车的队伍会朝几个方向散开，
      //    根本不成队。车位在上、通道在下（slotY 944 < corridorY 1104），
      //    所以「车屁股后面」= 车位中心往下（+y），一列竖直纵队。
      if (!f.boarded) {
        var rank = 0, j2, f2;
        for (j2 = 0; j2 < flights.length; j2++) {
          f2 = flights[j2];
          if (f2 === f || f2.si !== f.si || f2.boarded) continue;
          if (f2.seq < f.seq) rank++;          // 同车位、比我先到的、还没上车的
        }
        if (f.t >= f.preTotal) {
          var carG = S.slots[f.si];
          var okBoard = (rank === 0) &&
            (!carG || !carG.lastBoard || Date.now() - carG.lastBoard >= BOARD_MS);
          if (okBoard) {
            f.boarded = 1; f.waiting = 0; f.qrank = -1;
            if (carG) carG.lastBoard = Date.now();
          } else {
            f.t = f.preTotal;          // 钉在车门前，原地等（不推进最后一段）
            f.waiting = 1;
            f.qrank = rank;            // 交给绘制段换算成「车尾后方第 rank 个坑位」
          }
        } else { f.waiting = 0; f.qrank = -1; }
      }
      var rest = f.t, k = 0;
      while (k < f.segs.length && rest > f.segs[k].d) { rest -= f.segs[k].d; k++; }
      if (k >= f.segs.length) { flights.splice(i, 1); onFlightDone(f); continue; }
      // 【防撞】记录「当前踩着哪一格」→ reservedCells() 把它当墙，
      // 后面的豆 BFS 时会自动绕开 / 或干脆等它走过去（排队），绝不叠在一起。
      if (f.cells && k < f.cells.length) { f.gx = f.cells[k].gx; f.gy = f.cells[k].gy; }
      else { f.gx = undefined; }          // 已出阵，不再占阵内格子
      // 【排队关键】走出 lead 格后才真正腾出原地，后面那颗立刻可以起步
      if (!f.freed && k >= SPD.lead) {
        // 【性能】此处原有 beanCache = null（全量重绘 620 颗豆），是纯浪费：
        // 这颗豆在起步那一刻已 moving=true 并被 beanCacheDrop 擦出静止阵，
        // 现在只是把 moving 换成 gone，而 buildBeanCache 对两者【都跳过】
        // → 重建结果与重建前逐像素相同。删掉后画面完全一致，省掉一次全量重绘。
        f.freed = true; f.bean.gone = true;
        S.colorAlive[f.color] = (S.colorAlive[f.color] || 1) - 1;  // 【存活计数】--
        S.topC = null; S.occC = null;           // 【索引失效】豆 gone → top/occ 变了
        queueSuck(0);
      }
      var p0 = f.pts[k], p1 = f.pts[k + 1];
      var lt2 = f.segs[k].d ? rest / f.segs[k].d : 1;
      var wx = p0.x + (p1.x - p0.x) * lt2;
      var wy = p0.y + (p1.y - p0.y) * lt2;
      // 【丝滑关键 2 · 转角圆化 2026-08-28】原来是纯折线插值：走到格点瞬间
      // 方向 90° 硬切，视觉上就是「一顿一折」。真正顺滑的走法是让豆子在拐角处
      // 走一小段圆弧。做法：距离拐点 CR 像素内，用二次贝塞尔把「进段末尾」和
      // 「出段开头」拉成一条曲线（拐点当控制点），只在有下一段时生效。
      var nx = f.pts[k + 2];
      if (nx) {
        var segd = f.segs[k].d || 1;
        var CR = Math.min(L.cell * 0.5, segd * 0.5);      // 圆角半径，不超过半格
        var remain = segd - rest;                          // 距本段终点（=拐点）还有多远
        if (remain < CR) {
          var nd = f.segs[k + 1] ? (f.segs[k + 1].d || 1) : 1;
          var cr2 = Math.min(CR, nd * 0.5);
          // t: 0（进入圆角区）→ 1（离开圆角区）
          var tt = (CR - remain) / (CR + cr2) + 0.5 * cr2 / (CR + cr2);
          tt = clamp(tt, 0, 1);
          // A = 拐角前 CR 处，B = 拐点（控制点），Cc = 拐角后 cr2 处
          var ux = (p1.x - p0.x) / segd, uy = (p1.y - p0.y) / segd;
          var vx2 = (nx.x - p1.x) / nd, vy2 = (nx.y - p1.y) / nd;
          var ax = p1.x - ux * CR, ay = p1.y - uy * CR;
          var cx2 = p1.x + vx2 * cr2, cy2 = p1.y + vy2 * cr2;
          var it = 1 - tt;
          wx = it * it * ax + 2 * it * tt * p1.x + tt * tt * cx2;
          wy = it * it * ay + 2 * it * tt * p1.y + tt * tt * cy2;
        }
      }
      var horiz = Math.abs(p1.x - p0.x) > Math.abs(p1.y - p0.y);
      // ── 【排队定位 v3 · 修我 v0.5.5 造的两个错】────────────────────
      // 【错1：位置压到候选车面板上】v0.5.5 写的是「车位底边 + 16 + rank×QGAP」，
      //   而车位底边 = slotY+slotH = 1104，候选车面板顶边 = qPanelY = 1216。
      //   排到第 3 个人就是 1104+16+2×46 = 1212 → 已经骑到候选车上了（用户截图实证）。
      // 【错2：思路本身就错】用「绝对坐标」等于把还在阵里走的豆【瞬移】到车位下方，
      //   观感就是满屏乱跑。豆子的等待点必须在它【自己的路径上】。
      // 【正解】看路径构造（buildFlight）：pts 末三点依次是
      //   {ex, lane} → {door.x, lane} → door，其中 lane = laneY + si*laneGap = 862+，
      //   在车位（944）【上方】。t 被钉在 preTotal 时豆子正好站在 {door.x, lane}，
      //   也就是「车门正前方的那条专属车道上」—— 这就是天然的队首位置。
      //   所以排队 = 沿这条车道往自己来的方向退，y 恒为 lane，永不越界到面板。
      // 【为什么不复用 v0.5.4 的向量法】它算 pts[lp-3]→pts[lp-2] 的反向单位向量，
      //   当豆子出阵 x 恰好等于车门 x 时 dl=0 → 偏移量归零 → 全体重叠。
      //   现在直接用 lane/door.x 显式算，没有退化情况。
      // 【不重叠的保证】rank 是【全局唯一】的（同车位所有未上车的豆按 seq 排），
      //   两颗豆不可能拿到同一个 rank ⇒ 不可能落在同一点。
      if (f.waiting && f.qrank >= 0) {
        var qLane = L.laneY + f.si * SPD.laneGap;      // 该车专属横向车道（在车位上方）
        var qsr = slotRect(f.si);
        var qDoorX = qsr.x + qsr.w / 2;
        // 各自沿「自己来的那一侧」往后退：从左边来的往左排，从右边来的往右排。
        // 强行统一到一侧会让对面来的豆穿过车身，那才是真的乱跑。
        var qSide = (f.pts[f.pts.length - 3] &&
                     f.pts[f.pts.length - 3].x < qDoorX) ? -1 : 1;
        // 【必须折行】同一辆车可能同时有十几颗豆在等（cap 最大 30）。
        // 一字横排 ×QGAP(46px) 排到第 8 个就冲出 720 宽的屏幕了。
        // 每 5 个一排，满了往上叠一层 —— 队伍始终留在车道附近，永不越界。
        var qRow = Math.floor(f.qrank / 5), qCol = f.qrank % 5;
        wx = qDoorX + qSide * (qCol + 1) * QGAP;
        wy = qLane - qRow * QGAP;                      // 往上叠（车位在下方，不会压到车）
        // 【钳位】0 号位在最左、5 号位在最右，往外侧排会冲出屏幕。
        // 撞到边就把队伍折到另一侧，宁可换向也不能出画。
        if (wx < 24 || wx > DW - 24) wx = qDoorX - qSide * (qCol + 1) * QGAP;
      }
      // 【丝滑关键 3】原先用 Math.abs(Math.sin(phase))，这个函数在零点处导数突变
      // （尖角），跏跚到最低点时会有一下微小的「磕」。改用 (1-cos)/2：同样是
      // 0→1→0 的跳动节律，但全程 C¹ 连续，跏跚手感柔和得多。
      // 【原地踏步】等待时 f.t 被钉住，若 phase 仍用 f.t 则豆子会【冻成雕像】，
      // 那看起来是卡住了而不是在排队。改用墽钟驱动 → 原地小幅踏步，
      // 一看就是「在队里等着」。各豆用 seq 错开相位，避免整队齐踏像变换队形。
      // 【等待时彻底静止 · 用户 2026-08-30「等待不要重叠和抖动」】
      // 旧做法：等待中用墙钟驱动 phase → 原地小幅踏步。本意是「别冻成雕像」，
      // 但用户明确读到的是【抖动】—— 一排豆子各自按 seq 错相位上下颠，
      // 观感是队伍在蠕动，而不是「一个个安静排队」。
      // 现在等待时 bob/sway 全部归零，站得笔直不动；只有在走路时才有跏跚。
      var phase = f.waiting ? 0 : (Math.max(0, f.t) / 130) * Math.PI;
      var bob  = f.waiting ? 0 : (1 - Math.cos(phase * 2)) * 0.5 * 3;
      var sway = (f.waiting || !horiz) ? 0 : Math.sin(phase) * .09;
      var shrink = k >= f.pts.length - 2 ? clamp(lt2, 0, 1) * .34 : 0;
      // ══ 【duangduang 上车 · 用户要求】═══════════════════════════════
      // 用户原话：「上车的时候 让小豆子们排队上车 有那种感觉 duangduang 的很可爱」
      // 排队已经由 suck() 的单车闸门保证（一辆车一次只放一颗，天然成纵队）。
      // 这里补的是【视觉上的 duang】：进最后一段（登车段）时，
      //   ① 纵向压扁 + 横向鼓出（squash & stretch，果冻感的本质）
      //   ② 一次超前的小跳（easeOutBack 的过冲），像「蹦」上车而不是「滑」进去
      // 只在最后一段做，不影响阵内走路的秩序感。
      var duangY = 0, sqx = 1, sqy = 1;
      if (k >= f.pts.length - 2) {
        var u = clamp(lt2, 0, 1);
        // 起跳弧线：0 → 峰值 → 0，峰高 11px（够看见，不夸张）
        duangY = -Math.sin(u * Math.PI) * 11;
        // 落地前 30% 开始压扁：横向 1→1.22，纵向 1→0.80，是经典 duang 的配比
        var sq = u > 0.70 ? (u - 0.70) / 0.30 : 0;
        sqx = 1 + sq * 0.22;
        sqy = 1 - sq * 0.20;
      }
      g.save();
      g.translate(wx, wy - bob + duangY);
      g.rotate(sway);
      if (sqx !== 1 || sqy !== 1) g.scale(sqx, sqy);
      // 【豆人放大】走路中的豆和阵内同尺寸（L.cell），保持一致的辨识度
      // 【方案一 · 走路态】传 phase → 切到 64×96 长腿帧并按相位摆腿。
      // 复用上面已算好的 phase：它在行走时由 f.t 驱动、等待时由墙钟驱动，
      // 所以「走着摆腿、排队原地踏步」两种节律天然都对，不需要额外的计时器。
      drawBean(g, 0, 0, f.color, L.cell * (1 - shrink), false, phase);
      g.restore();
    }

  // ── 6 个车位 ──
    for (i = 0; i < 6; i++) {
      var r = slotRect(i), car = S.slots[i];
      if (i === 5 && S.slot6Locked) {
        rr(g, r.x, r.y, r.w, r.h, 16); g.fillStyle = 'rgba(120,116,140,.72)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.5)'; g.stroke();
        rr(g, r.x + r.w / 2 - 22, r.y + 34, 44, 30, 6); g.fillStyle = '#FFFFFF'; g.fill();
        g.beginPath(); g.moveTo(r.x + r.w / 2 + 22, r.y + 44); g.lineTo(r.x + r.w / 2 + 36, r.y + 36);
        g.lineTo(r.x + r.w / 2 + 36, r.y + 62); g.closePath(); g.fillStyle = '#FFFFFF'; g.fill();
        txt(g, '解锁', r.x + r.w / 2, r.y + 100, 'bold 30px sans-serif', '#FFFFFF');
        continue;
      }
      if (!car) {
        rr(g, r.x, r.y, r.w, r.h, 16);
        g.lineWidth = 4; g.setLineDash([11, 9]); g.strokeStyle = 'rgba(255,255,255,.62)';
        g.stroke(); g.setLineDash([]);
        continue;
      }
      // 注：离场动画已移到独立的 leaving[] 循环（见下方），因为车一触发离场就
      // 立刻从 S.slots 里摘出去了 —— 这样车位马上腾空，下一辆能立即进。
      // ══ 【入位 = 开车进去，不是飞进去 · 用户 2026-08-30】═══════════════
      // 原话：「车从车库拖到停车位的时候 现在是飞过去的，我要求必须是从车库开出去
      //        按照路径开过去 跟车满了开出去的路径一样」
      // 【旧实现为什么是「飞」】ix/iy 只是从松手点到车位中心做一次线性插值 ——
      //   没有车道、没有转向，车斜着穿过 corridor 直接贴到位，像被吸过去。
      // 【新实现 = 离场动画的时间倒放】离场是「倒出车位 → 转 90° → 沿 corridor 驶出」，
      //   入位就必须是「沿 corridor 驶来 → 转回车头朝下 → 正对着开进车位」。
      //   三段与 leaving[] 循环同一套坐标口径（corridorY/corridorH/EXIT_LANE），
      //   所以进出走的是同一条车道，观感上闭环。
      // 【v0.5.7 改为「倒车入库」· 用户 2026-08-30「你直接倒着入库就是了 现在左扭右扭的」】
      // 【上一版为什么在扭】turnIn = sin(eB×π) × (−dir×π/2) —— 车头先转 90° 朝向行进
      //   方向，段末再转回朝下。一进一出就是「左扭一下右扭一下」，而且中段车身横躺，
      //   在 108px 宽的车位区里看起来就是原地拧麻花。
      // 【倒车入库根本不需要转向】现实里倒库全程车头朝同一方向，只有平移。
      //   car atlas 本来就是「车头朝下」的俯视图 —— 保持 rotate(0) 就已经是
      //   「车尾朝上、正对着车位」的姿态，直着往上退进去就是倒库。
      // 两段：A 横向挪到车位正下方（对准库位）→ B 竖直退入车位。全程 turnIn 恒为 0。
      car.anim = Math.min(1, car.anim + dt / 460);   // 两段路，460ms 够看清且不拖沓
      if (car.anim >= 1) car.door = Math.min(1, car.door + dt / 220);
      if (car.bump > 0) car.bump = Math.max(0, car.bump - dt / 260);   // 数字 −1 时的弹动
      var at = car.anim;
      var slotCX = r.x + r.w / 2, slotCY = r.y + r.h / 2;
      // 该车位对应的 corridor 子车道 y（与离场共用 IN_LANE，进出同道）
      var inLaneY = L.corridorY + L.corridorH / 2 + IN_LANE[i];
      // A 段 0~45%：从松手点开到 corridor 车道并横向对准库位（斜着走一次，符合倒库前的调整）
      // B 段 45~100%：车尾朝上，竖直退入车位
      var eA = clamp(at / .45, 0, 1);
      var eB2 = clamp((at - .45) / .55, 0, 1);
      var ix, iy;
      var turnIn = 0;                                // 【恒为 0】倒库全程不转向，见上方注释
      if (at < .45) {
        ix = car.fx + (slotCX - car.fx) * easeInOut(eA);
        iy = car.fy + (inLaneY - car.fy) * easeInOut(eA);
      } else {
        ix = slotCX;
        iy = inLaneY + (slotCY - inLaneY) * easeOut(eB2);   // 竖直倒进去
      }
      // 【缩放】只在最后停稳那一下做一次轻微过冲（像刹住时车身一沉），
      // 行驶途中必须恒为 1 —— 一路缩放会让「开车」变回「飞过来」的观感。
      var e = (at < .45) ? 1 : easeOutBack(eB2) * 0.06 + 0.94;
      rr(g, r.x, r.y, r.w, r.h, 16);
      g.lineWidth = 4; g.setLineDash([11, 9]); g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke(); g.setLineDash([]);
      g.save(); g.translate(ix, iy); g.rotate(turnIn); g.scale(e, e);
      // ── 【上人震动】用户要求：豆子往车上钻的时候，车要在原地抖 ──────────
      // 【为什么放在 translate 之后、scale(e) 之后】抖动是「车身自己的位移」，
      //   不能污染入位过冲动画（那是 ix/iy + e 表达的），所以叠在最内层。
      // 波形：sin 高频（≈4.8Hz 视觉频率）+ 竖向幅度是横向的 0.55 ——
      //   真车上人是「上下颠 + 微微左右晃」，纯横向抖看起来像被撞而不是被踩。
      // 幅度随 shakeUntil 剩余时间线性衰减 → 最后一颗豆上完是平滑收住，不会硬停。
      if (car.shakeUntil) {
        var sRest = car.shakeUntil - Date.now();
        if (sRest > 0) {
          // 【用户要求 5】装满瞬间的抖动要【明显大于】平时上人的微抖，
          // 否则玩家分不出「又上了一个」和「满了要走」。这里幅度×2.2，
          // 并叠一个纵向下沉（像避震器被压下去）—— 载重感就是这么来的。
          var full = car.fullShake && car.fullShake > Date.now();
          var amp = full ? 2.2 : 1;
          var sk = sRest / (full ? FULL_SHAKE_MS : SHAKE_MS);   // 1 → 0
          var sPh = Date.now() / 33;                       // 与 dt 无关，帧率波动下频率恒定
          var sag = full ? (1 - sk) * 2.6 : 0;             // 车身下沉
          g.translate(Math.sin(sPh) * 3.4 * sk * amp,
                      Math.cos(sPh * 1.37) * 1.9 * sk * amp + sag);
        } else {
          car.shakeUntil = 0; car.fullShake = 0;
        }
      }
      // 数字弹动：让「豆子进车 → 数字才减少」的因果一眼可见
      var bs = 1 + car.bump * .30;
      drawCar(g, 0, 0, r.w - 10, r.h - 20, car.color, car.left, car.door, false);
      g.save(); g.scale(bs, bs);
      // 【用户要求】数字原来在 y=+.06h 偏下，上移到车顶篷中心（-.10h）
      txt(g, String(car.left), 0, -(r.h - 20) * .10,
          'bold ' + Math.round((r.h - 20) * .30) + 'px sans-serif',
          car.bump > .5 ? '#FFF3A8' : '#FFFFFF', 'rgba(0,0,0,.62)', 6);
      g.restore();
      g.restore();
      // 注：已删除左下角「↑N」在途豆角标（用户要求）。车上那个大数字
      // 已经表达了剩余载客量，再叠一个小箭头数字反而看不懂在说什么。
      // 注：已删除车身上的「▶拖走」红色徽章（用户要求）。解死局入口保留在
      // 底部「消除」道具按钮，不再往具体车位上贴 icon。
    }

    // ── 离场中的车（独立列表，已不占车位）────────────────────────
    // 倒进专用通道 → 转向 → 横向驶出，全程不撞任何东西。
    // 【用户要求】速度加快：1500 → 620ms。
    //
    // ══ 【不撞车穿模 · 用户要求 2026-08-28】═══════════════════════════
    // 用户原话：「不同车开走的时候 不要撞车穿模 请你优化路径」
    // 【根因】旧路径【6 辆车共用同一条 corridor 中线】（yTo = corridorY + corridorH/2），
    //   而且 si<=2 全部往左开、si>=3 全部往右开。于是：
    //   · 同侧两辆车相近时间离场 → 同一条 y 上同向前后重叠 = 追尾穿模
    //   · 异侧两辆车同时离场   → 同一条 y 上【对向】相遇 = 迎面对穿，最难看
    // 【修法：6 条独占车道】corridor 高 112px，够排 6 条互不相交的 y。
    //   左行三辆走上半（-34/-20/-6），右行三辆走下半（+6/+20/+34）。
    //   任意两辆车的 y 恒不相等 → 无论何时离场、同向还是对向，都不可能重叠。
    // 【为什么不用「错峰延迟」那招】试过让后车在车位上等一会儿再走 —— 但
    //   departCar 会立刻把 S.slots[si] 置空，新车马上就能进来，等待中的旧车
    //   会和新进来的车叠在同一个车位上，反而制造了一处更明显的穿模。
    //   纯分道没有这个副作用，且零额外状态。
    // 【统一到模块级 IN_LANE】入位动画也要走同一条道（用户要求「按路径开过去」，
    // 进出必须闭环）。原来这里另写一份局部数组，两处迟早改歪。
    var EXIT_LANE = IN_LANE;
    for (i = leaving.length - 1; i >= 0; i--) {
      var lc = leaving[i];
      lc.leave += dt * mul();
      var LDUR = 620;
      var lt = clamp(lc.leave / LDUR, 0, 1);
      var lr = slotRect(lc.si);
      var dir = (lc.si <= 2) ? -1 : 1;      // 靠哪侧近就往哪侧开
      // 三阶段：A 倒出车位进 corridor / B 在 corridor 转向 90° / C 沿 corridor 驶出
      var pA = clamp(lt / .22, 0, 1);
      var pB = clamp((lt - .22) / .22, 0, 1);
      var pC = clamp((lt - .44) / .56, 0, 1);
      var yFrom = lr.y + lr.h / 2;
      // 每辆车一条独占子车道 → 6 条 y 互不相同，彻底消除同向/对向重叠
      var yTo = L.corridorY + L.corridorH / 2 + EXIT_LANE[lc.si];
      var cy2 = yFrom + easeOut(pA) * (yTo - yFrom);
      // 【车头朝向】car_atlas 俯视、车头朝下(+y)。canvas rotate(θ) 后 (0,1)→(-sinθ,cosθ)：
      //   θ=-dir*π/2, dir=-1 → (-1,0) 车头向左，往左开 = 正开 ✅
      var turn = easeInOut(pB) * (-dir * Math.PI / 2);
      var runX = dir * easeInQuad(pC) * (DW * .70 + lr.w);
      g.save();
      g.translate(lr.x + lr.w / 2 + runX, cy2);
      g.rotate(turn);
      // 注：已删除尾部那 4 颗白色发光圆点（用户要求：「车上你是不是做了一个小发光的
      // 东西 开车的时候也有 这玩意不好看 请你删除掉」）。它本意是「排气/速度线」，
      // 但在俯视 3D 车贴图后面拖 4 个白球，看起来像漏了几颗豆子，纯负分。
      // 速度感现在完全交给 easeInQuad 的加速曲线表达，不需要额外装饰。
      drawCar(g, 0, 0, lr.w - 10, lr.h - 20, lc.color, 0, 0, false);
      g.restore();
      if (lt >= 1) leaving.splice(i, 1);
    }
    // ── 【车位星芒爆点】画在车位与离场车【之上】────────────────────────
    // 【层级理由】星芒是「装满」的庆祝反馈，必须压在车和车位虚线框上面，
    //   否则会被后画的车位框/新入位的车盖掉一半 —— 那就是白做了。
    //   同时它在【原地】播放，与 leaving[] 的车已完全解耦（用户校准）。
    drawPuffs(g, dt);

    // ── 【用户要求】车位已有车 → 整体标红 + 抖动，明确「进不了新车」──
    if (S.reject) {
      S.reject.t += dt;
      var RJ = 420;
      if (S.reject.t >= RJ) { S.reject = null; }
      else {
        var rp = S.reject.t / RJ;
        var rr2 = slotRect(S.reject.si);
        // 抖动：左右快速衰减摆动
        var sx = Math.sin(rp * Math.PI * 6) * 9 * (1 - rp);
        g.save();
        g.translate(sx, 0);
        g.globalAlpha = (1 - rp) * .55;
        rr(g, rr2.x, rr2.y, rr2.w, rr2.h, 16);
        g.fillStyle = '#FF3B30'; g.fill();
        g.globalAlpha = 1 - rp;
        g.lineWidth = 6; g.strokeStyle = '#FF3B30'; g.stroke();
        g.restore();
      }
    }

    // 注：加速卡片已删除，加速改为底部栏第 4 个圆钮（用户要求）。
    // ETA 仍在内部算，只用于判定加速入口是否值得开（boostWorth）。

    // ── 队列两排 + 补位（【用户要求】只有拖走位置之后的车才动）──
    // 补位语义【用户校准】：固定 8 格稀疏槽位，只有「正后方那辆（i+4）」竖直升上来，
    // 第二排原地留洞，绝不整排前移。abcd/efgh 拿走 c → abgd / ef_h。
    // ══ 【补位「开上来」· 用户要求 4】═══════════════════════════════════
    // 用户原话：「候选第二排的车 是开上来的感觉 不是现在直接位移」
    //          「要真的像开车过来一样 且有加速度的感觉」
    //          「整个后面的汽车都往前 duang 一下 有那种抖动的小小的感觉」
    //
    // 【旧实现为什么像「位移」而不像「开车」】只有一句 easeOut 线性插值：
    //   easeOut(t) = 1-(1-t)² → 一上来就是最高速，然后一路减速到 0。
    //   这正好是【开车的反过程】：真车是「起步慢→加速→冲到位→刹一下回弹」。
    //   所以观感上就是一块贴图被瞬间「拽」到位，没有任何机械感。
    //
    // 【三段式改造】把 260ms 一段插值换成 REFILL_MS(340ms) 的三段：
    //   ① 0~18%   起步蓄力：几乎不动，还【向后压 4px】（车头抬一下的预备动作）
    //   ② 18~78%  加速冲刺：easeInQuad 的加速段 —— 这才是「有加速度」的关键，
    //              越接近目标越快，符合「一脚油门冲上来」
    //   ③ 78~100% 到位

    // 【整队 duang】用户还要求「整个后面的汽车都往前 duang 一下 有那种抖动的小小的感觉」。
    // 做法：补位车冲到位的瞬间（p>.80 那一刻）给【所有其它候选车】一个极小的
    // 阻尼余震（±2.6px 竖向，衰减正弦）。物理直觉是「前车撞到位，整排被顶了一下」。
    // 幅度必须很小 —— 大了就是画面在抖，不是车队被顶，反而廉价。
    S.refillT += dt;
    var rf = clamp(S.refillT / REFILL_MS, 0, 1);
    var rfD = driveProg(rf);                        // 三段式「开上来」位移比例
    // 整队余震：只在冲到位之后的 200ms 内生效
    var shake = 0;
    if (rf > .80 && rf < 1) {
      var sp = (rf - .80) / .20;
      shake = Math.sin(sp * Math.PI * 3) * 2.6 * (1 - sp);
    }
    for (i = 7; i >= 0; i--) {
      if (!S.queue[i]) continue;                  // 稀疏槽位：洞不画
      if (S.drag && S.drag.qi === i) continue;
      var q = qRect(i);
      var qx = q.x, qy = q.y;
      if (rf < 1 && i === S.refillFrom) {
        // 【补位车】从正后方（同列下一排 i+4）沿三段曲线「开」上来
        var qPrev = qRect(i + 4);
        qx = qPrev.x + (q.x - qPrev.x) * rfD;
        qy = qPrev.y + (q.y - qPrev.y) * rfD;
      } else if (shake) {
        // 【其余车】被顶了一下的余震（补位车自己不抖，它是撞击源）
        qy += shake;
      }
      // 【用户反馈】第二排太透看不清 → .42 提到 .78。
      // 第二排本来就是「待补位」的预告信息（下一辆什么颜色/几个座），
      // 看不清等于这条信息废了；靠 scale .86 缩小已经足够表达层级，不必再靠压透明度。
      g.globalAlpha = q.row === 0 ? 1 : .78;
      var qs = q.row === 0 ? 1 : .86;
      // 【车身挤压】冲到位那一下额外做一次纵向压缩（squash），
      // 这是「duang」在视觉上的另一半 —— 只有位置回弹没有形变，弹性感会弱一半。
      var sqy = 1;
      if (rf > .80 && rf < 1 && i === S.refillFrom) {
        var sq = (rf - .80) / .20;
        sqy = 1 - 0.085 * Math.sin(sq * Math.PI) * (1 - sq * .5);
      }
      g.save(); g.translate(qx + q.w / 2, qy + q.h / 2); g.scale(qs, qs * sqy);
      drawCar(g, 0, 0, q.w, q.h, S.queue[i].color, S.queue[i].cap, 0, true);
      g.restore();
      g.globalAlpha = 1;
    }
    // ── 拖拽车（【用户要求】无残影、无底部阴影，只做整图放大）──
    if (S.drag) {
      // 空车位高亮呼吸（保留：这是「能放哪里」的引导，不是阴影）
      for (i = 0; i < 6; i++) {
        if (S.slots[i] || (i === 5 && S.slot6Locked)) continue;
        var sr2 = slotRect(i);
        g.globalAlpha = .26 + Math.sin(Date.now() / 240) * .14;
        rr(g, sr2.x, sr2.y, sr2.w, sr2.h, 16);
        g.fillStyle = C[S.drag.car.color].lite; g.fill();
        g.globalAlpha = 1;
      }
      var d = S.drag, rot = clamp(d.vx * .0026, -.14, .14);
      // 抬起感：按下瞬间 1.0 → 1.30 弹一下（easeOutBack），之后持绩保持放大
      var pop = 1 + 0.30 * easeOutBack(clamp(d.pop, 0, 1));
      g.save();
      g.translate(d.x, d.y); g.rotate(rot); g.scale(pop, pop);
      noShadow = true;                 // 关掉 groundShadow（atlas 路径）
      drawCar(g, 0, 0, L.qCarW, L.qCarH, d.car.color, d.car.cap, 0, true);
      noShadow = false;
      g.restore();
    }

    // ── 粒子 ──
    for (i = fx.length - 1; i >= 0; i--) {
      var pt = fx[i]; pt.t += dt;
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += .16;
      var pa = 1 - pt.t / pt.life;
      if (pa <= 0) { fx.splice(i, 1); continue; }
      g.globalAlpha = pa; g.fillStyle = pt.c;
      rr(g, pt.x - 5, pt.y - 5, 10, 10, 3); g.fill();
      g.globalAlpha = 1;
    }

    // ── 道具栏（v2 层级关键）──────────────────────────────────
    // 必须画在【候选车之后】，才能压住候选次排底部 22px（1488−1466）= 用户要的「半遮」。
    drawTrayPanel(g);
    // 四圆钮：升级 / 消除 / 刷新 / 速度x2
    // 【角标语义铁律】道具类（升级/消除/刷新）→ 红底白「+」；
    //   「▶」只留给纯广告位（速度/解锁/复活）。旧版四个全绿▶，与绿色 CTA 抢注意力。
    // 【外观铁律】以下数值 = docs/design/tools/gen_preview_v2.py 的 CSS 反算（S=0.44）。
    // 这是用户确认过的浏览器预览效果，改任何一条都会「和浏览器不一样」（已犯过一次）：
    //   ① 配色只两种：道具橙 #FFB13D / 刷新蓝 #2E9BE8（不是四色同心环）
    //   ② 立体感 = box-shadow 0 5px 0 edge → 下方偏移 11px 同色暗圆，不是同心环
    //   ③ 白描边 2px CSS → 4.5px 设计稿
    //   ④ icon 42px 装在 45.76px 圆里 = 占直径 0.92 → r*1.83（旧值 r*0.92 只有一半大！）
    //   ⑤ 角标是【圆形】红底 #E8352B，不是圆角矩形；直径 17px CSS ≈ 38px 设计稿
    //   ⑥ 文案 800 15px CSS ≈ 34px 设计稿，margin-top -7px → 主动压在圆下缘
    // 【用户要求】① 词义更好懂：消除→清空、刷新→换车（「消除/刷新」在装车语境下
    //   完全看不出是干啥的：消除其实是「把占死车位的僵尸车整辆清走」，刷新是「换一批候选车」）。
    //   升级保留 —— 它是「车容量翻倍」，升级是最贴的词。
    // ② 四个按钮全部是激励视频入口，角标统一成「▶」（原来只有速度x2 是▶，
    //   另三个是「+」，会让人以为是免费道具，点了才发现要看广告 → 预期不符）。
    var labels = ['升级', '清空', '换车', '速度x2'];
    var names = ['upgrade', 'clear', 'refresh', 'speed'];
    var faces = ['#FFB13D', '#FFB13D', '#2E9BE8', '#FFB13D'];
    var edges = ['#D98A1E', '#D98A1E', '#1B6FB0', '#D98A1E'];
    for (i = 0; i < 4; i++) {
      var bb = btnRect(i);
      // ② 底部暗圆（先画，才能被主圆盖住上半）
      g.beginPath(); g.arc(bb.cx, bb.cy + 11, bb.r, 0, 6.2832);
      g.fillStyle = edges[i]; g.fill();
      // 主圆 + ③ 白描边
      g.beginPath(); g.arc(bb.cx, bb.cy, bb.r, 0, 6.2832);
      g.fillStyle = faces[i]; g.fill();
      g.lineWidth = 4.5; g.strokeStyle = '#FFFFFF'; g.stroke();
      // ④ 矩量图标居中满圆（不用 emoji：快手容器/低端安卓会渲染成豆腐块）
      icon(g, names[i], bb.cx, bb.cy, bb.r * 1.83, '#FFFFFF');
      // ⑤ 角标：圆形红底，右上角外挂
      var bx = bb.cx + 40, by = bb.cy - 40;
      g.beginPath(); g.arc(bx, by, 19, 0, 6.2832);
      g.fillStyle = '#E8352B'; g.fill();
      g.lineWidth = 3.5; g.strokeStyle = '#FFFFFF'; g.stroke();
      // ── 四个都是激励视频 → 统一【摄像机】图标 ──────────────────────
      // 【用户要求 2026-08-31】「▶ 改成那个带看视频的 logo」——
      //   指的就是弹窗「获得」按钮和第 6 车位「解锁」按钮上那个摄像机。
      // 【为什么必须统一】同一个 App 里「看激励视频」出现两种符号（▶ 与摄像机）
      //   等于让玩家学两遍。而且 ▶ 的通用语义是「播放我自己的内容」，
      //   摄像机才是各大联盟 rewarded 广告的通行标识 —— 用 ▶ 会让人
      //   误以为是「播放动画/加速」，点下去才发现要看广告，预期不符。
      // 【尺寸 30 而不是 22】摄像机是横向图形（76×48 @96 格），
      //   按 22 画出来只有 17px 宽、11px 高，在直径 38 的红圈里显得空。
      //   30 → 23.8×15，四周留约 7px 气口，视觉上填满且不顶边。
      icon(g, 'video', bx, by, 30, '#FFFFFF');
      // ⑥ 文案：压在圆下缘 + 同色系深紫描边（纯黑显脏，纯白在浅紫栏上看不清）
      txt(g, labels[i], bb.cx, bb.cy + bb.r + 2, 'bold 34px sans-serif', '#FFFFFF', '#3A2C5E', 7);
    }

    // ── Toast ──
    if (S.tipT > 0) {
      S.tipT -= dt;
      g.globalAlpha = clamp(S.tipT / 420, 0, 1);
      rr(g, DW / 2 - 300, L.qPanelY - 92, 600, 66, 33); g.fillStyle = 'rgba(0,0,0,.72)'; g.fill();
      txt(g, S.tip, DW / 2, L.qPanelY - 59, '26px sans-serif', '#FFFFFF');
      g.globalAlpha = 1;
    }

    // ── 结算 / 死局 ──
    if (S.phase === 'win') { S.winT += dt; drawWin(g); }
    else if (S.phase === 'dead') {
      S.deadT += dt;
      drawDead(g);
      // 【用户要求 2】死局 3 秒后自动弹「复活」窗（看广告 → 消除前 3 辆车）。
      // 为何等 3 秒而不是立即弹：玩家刚输需要一拍看清「我死在了什么局面」，
      // 立即盖弹窗会让人摸不清发生了什么，也显得强推广告。
      // reviveAsked 门禁：一局只自动弹一次，玩家关掉就不再骚扰。
      if (!S.reviveAsked && S.deadT > 3000) {
        S.reviveAsked = 1;
        openPopup('revive');
      }
    }
    // ── 奖励弹窗（play 之上、广告 loading 之下）──
    // 画在 win/dead 之后：三者互斥（phase 单值），顺序不影响，但放这里语义清晰。
    else if (S.phase === 'popup') { drawPopup(g, dt); }
    // 【新手引导】画在游戏层之上、结算弹窗之下 —— 只在 play 态出现，
    // 不能盖住胜利/死局浮层（那些时候引导无意义且会遮挡按钮）。
    if (S.phase === 'play') { try { drawGuide(g, dt); } catch (e) {} }
    // （boudoir 态已在前面短路返回，不会跑到这里）
    // 【用户要求 2】广告 loading 遮罩必须画在最顶层（结算/死局弹窗之上），
    // 否则在胜利页点「看 TA 私房」时 loading 会被弹窗盖掉，等于没加。
    drawAdLoading(g);

    g.restore();

    // ── 黑边（letterbox）填色 ────────────────────────────────
    // 【根因·用户第二次反馈「底部还是有黑底漏出来」】
    // 上一次我改 drawTrayPanel 往下多铺 400px —— 那个修法从根上就是无效的，
    // 因为上面有 `g.rect(0,0,DW,DH); g.clip();`：**超出设计稿 1624 的部分会被裁掉**，
    // 在 clip 内部往下画多少都没用。
    // 真正的黑底来自 render 开头那行 `fillStyle='#14111A'` 铺满真实画布：
    // 手机比 750×1624 更长时 offY>0，上下各留一条 letterbox，漏出的就是这个深色。
    // 所以必须在 restore() 之后、clip 之外补：底部那条用道具栏同色，视觉上就是
    // 「bar 一直延伸到屏幕底」，正是用户要的效果。
    var cw = cv.width / dpr, ch = cv.height / dpr;
    var yBot = offY + DH * scale;
    if (yBot < ch) { g.fillStyle = TRAY_C; g.fillRect(0, yBot - 1, cw, ch - yBot + 2); }
    if (offY > 0) { g.fillStyle = '#14111A'; g.fillRect(0, 0, cw, offY + 1); }
  }

  // ── 死局弹窗：三个激励视频出路（IAA 机会点，绝不让用户卡死）──────
  // 【用户要求 2】失败弹窗信息精简，对齐参考图：
  //   蓝缎带「你失败了」+ 哭脸豆人 + 一句「别放弃，胜利就在前方！」+ 三个按钮。
  // 旧版把三个激励视频选项连同副标题全铺出来（6 行字 + 3 个大长条），信息量过载。
  // IAA 没丢：「再试一次」= 原 revive（看视频腾空车位、保留进度），
  // 这也正是参考图里主按钮的位置，转化路径反而更短。
  function deadBtnRects() {
    var by = DH * .70;
    return {
      home:  { cx: 118, cy: by, r: 62 },
      retry: { x: DW / 2 - 158, y: by - 52, w: 316, h: 104 },
      share: { cx: 632, cy: by, r: 62 }
    };
  }
  function drawDead(g) {
    var t = clamp(S.deadT / 200, 0, 1), cx = DW / 2;
    g.fillStyle = 'rgba(28,10,18,.82)'; g.fillRect(0, 0, DW, DH);
    g.save();
    g.translate(cx, DH * .42); g.scale(easeOutBack(t), easeOutBack(t)); g.translate(-cx, -DH * .42);
    // ══ 【顶部缎带 · 用户要求 1】═══════════════════════════════════════
    // 用户原话：「那个顶部的图替换为这个（参考 …67eba812….png 重新做一个图）」
    // 参考图是【紫灰拱形缎带 + 燕尾 + 3D 蓝灰立体字「挑战失败」】，
    // 已由 tools/gen-fail-ribbon.py 预生成为 fail_ribbon.png（@2x，设计 370.5×91.5）。
    //
    // 【为什么用 PIL 预生成而不是 AI 生图】中文字形是 gpt-image-2 的死穴
    // （缺笔画、错字、糊边），而失败浮层是玩家每局都可能看到的高频 UI，
    // 出现错字就是灾难。缎带是规则几何 + 文字，PIL 能 100% 精确可控。
    //
    // 【为什么放大到 1.5 倍】切图设计基准 370.5 宽，在 750 舞台上偏小、
    // 压不住 464 宽的按钮区；×1.5 → 556 宽，与下方内容视觉配重才平衡。
    var ry = DH * .30;
    var rbW = 370.5 * 1.5, rbH = 91.5 * 1.5;
    if (!drawPopupImg(g, 'failRibbon', cx - rbW / 2, ry - 6, rbW, rbH)) {
      // 【回落】切图未就绪 → 保留原程序化蓝缎带，绝不留白（首帧、加载失败都靠它）
      rr(g, cx - 232, ry, 464, 96, 14); g.fillStyle = '#5B93C9'; g.fill();
      rr(g, cx - 232, ry, 464, 26, 12); g.fillStyle = 'rgba(255,255,255,.26)'; g.fill();
      g.fillStyle = '#3E6F9E';
      g.beginPath(); g.moveTo(cx - 232, ry + 96); g.lineTo(cx - 274, ry + 122); g.lineTo(cx - 232, ry + 56); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(cx + 232, ry + 96); g.lineTo(cx + 274, ry + 122); g.lineTo(cx + 232, ry + 56); g.closePath(); g.fill();
      txt(g, '挑战失败', cx, ry + 52, 'bold 58px sans-serif', '#FFFFFF', 'rgba(0,0,0,.42)', 7);
    }
    // 哭脸豆人（参考图中央那只黄豆）
    // 【方案一 · 传 phase=0】这只豆是【独立展示】的，四周全是弹窗空白，
    // 腿完全可见 —— 正是走路帧该用的场合（不给腿就还是一块砖，没有角色感）。
    // 传 0 而不是动态相位：fi=floor(0/π*2)=0，对应「双腿并拢站立」那一帧。
    // 失败弹窗里的豆应该是【站着哭】，不是原地踏步走，所以要钉死不动。
    var fy = DH * .48;
    drawBean(g, cx, fy, 'yellow', 190, false, 0);
    // 眼泪（【兼容】g.ellipse 部分容器没有，必须像 groundShadow 那样降级到 arc+scale）
    g.fillStyle = 'rgba(120,200,255,.92)';
    for (var k = 0; k < 2; k++) {
      var ex = cx + (k ? 44 : -44);
      tear(g, ex, fy + 34, 15, 26);
      tear(g, ex + (k ? 10 : -10), fy + 72, 10, 17);
    }
    txt(g, '别放弃，胜利就在前方！', cx, DH * .60, 'bold 38px sans-serif', '#FFFFFF', 'rgba(0,0,0,.5)', 6);
    // 三个按钮：主页（圆）/ 再试一次（主按钮）/ 分享（圆）
    var R = deadBtnRects();
    function circleBtn(c, fill, edge, label) {
      g.beginPath(); g.arc(c.cx, c.cy, c.r, 0, 6.2832); g.fillStyle = edge; g.fill();
      g.beginPath(); g.arc(c.cx, c.cy - 3, c.r - 6, 0, 6.2832); g.fillStyle = fill; g.fill();
      // 【对齐修复】txt 已是 textBaseline='middle'（垂直居中），再 +10 就会把字
      // 压到圆心下方。圆按钮的视觉中心因为上面画了 cy-3 的高光片，字应该跟着
      // 一起微微上移，所以这里传 c.cy - 3 与高光同心，而不是 +10。
      txt(g, label, c.cx, c.cy - 3, 'bold 27px sans-serif', '#FFFFFF', 'rgba(0,0,0,.4)', 5);
    }
    circleBtn(R.home, '#FFB13D', '#D98A1E', '主页');
    var q = R.retry;
    rr(g, q.x, q.y, q.w, q.h, q.h / 2); g.fillStyle = '#3FA44A'; g.fill();
    rr(g, q.x + 5, q.y + 5, q.w - 10, q.h - 14, (q.h - 14) / 2); g.fillStyle = '#6FD16F'; g.fill();
    // 【对齐修复 · 用户反馈「文字不在按钮的居中对齐位置」】
    // txt 用的是 textBaseline='middle'，本来就居中；旧代码又 +14，等于把字
    // 硬生生压到按钮下沿。删掉补偿，直接传按钮中心 y。
    // 【为何再减 4】按钮是「深色底 + 亮色内衬（y+5, h-14）」的双层结构，
    // 内衬的视觉中心比几何中心高约 4px，字跟内衬对齐才像居中。
    txt(g, '再试一次', q.x + q.w / 2, q.y + q.h / 2 - 4, 'bold 44px sans-serif', '#FFFFFF', 'rgba(0,0,0,.4)', 6);
    circleBtn(R.share, '#FFB13D', '#D98A1E', '分享');
    g.restore();
  }

  function loop(ts) {
    var raw = lastT ? (ts - lastT) : 16;
    lastT = ts;
    // 【丝滑关键 1 · dt 平滑 2026-08-28】用户反馈「好一点，但还想更丝滑」。
    // 剩下的不丝滑不是算力问题，而是【dt 抖动】：小游戏容器的 rAF 间隔常在
    // 12~28ms 之间跳（GC、音频回调、native 层合成都会插一脚）。走豆位移是
    // dt 的线性函数，dt 抖 ±40% → 每帧步长就抖 ±40%，眼睛看到的就是「顿一下」，
    // 哪怕帧率数字很高也依然不顺。
    // 修法：指数滑动平均把 dt 削平（α=0.2），位移用平滑后的 dt。
    // 代价为零，观感提升最明显 —— 这是匀速运动最划算的一处优化。
    if (raw > 48) raw = 48;                       // 卡顿尖峰截断，防止豆子瞬移
    if (raw < 6) raw = 6;
    dtAvg = dtAvg ? (dtAvg + (raw - dtAvg) * 0.2) : raw;
    var dt = dtAvg;
    // 拖拽「抬起放大」进度（0→1，约 140ms 弹到位）
    if (S && S.drag) S.drag.pop = Math.min(1, (S.drag.pop || 0) + dt / 140);
    // 【用户要求 2】持续震动必须挂在帧循环里补发 —— vibUntil 只是个截止时间戳，
    // 没人定时敲它就等于没实现（和 suck 的 release 闸门同一类坑）。
    try { pumpVib(); } catch (e) {}
    try { watchdog(dt); render(dt); } catch (e) { console.error('[render]', e && e.message); }
    (window.requestAnimationFrame || function (f) { setTimeout(function () { f(Date.now()); }, 16); })(loop);
  }

  G.start = function () {
    cv = window.canvas || (typeof document !== 'undefined' && document.getElementById('game'));
    if (!cv && typeof ks !== 'undefined' && ks.createCanvas) cv = ks.createCanvas();
    if (!cv) { console.error('[快来帮帮我] 无 canvas'); return; }
    ctx = cv.getContext('2d');
    fit();

    // 注：人物全屏底图（铁律6 Layer 0）不在这里写死了 —— 每关美女不同，
    // 统一由 newGame() 里的 loadPortrait(girlOf().img) 负责。原来这里硬编码
    // bg_nuonuo 会和切关加载竞态：谁后 onload 谁覆盖，可能显示上一关的人。
    // ── 加载 3D 渲染 atlas（车 / 豆人）；失败自动回落到程序化绘制 ──
    loadAtlas('car', 'assets/img/car_atlas.png');
    loadAtlas('bean', 'assets/img/bean_atlas.png');
    // 走路帧（方案一）。加载失败自动回落到 bean 方块帧 —— 见 drawBean 的 walk 分支，
    // 那里显式判了 ATL.walk.ok，所以缺图只是「没腿」，绝不会白屏或报错。
    loadAtlas('walk', 'assets/img/bean_walk.png');
    loadHand();                       // 新手引导手势雪碧图（失败自动回落矢量手）
    loadGuideText();                  // 新手引导文案艺术字贴图（失败自动回落系统字）
    loadPuff();                       // 车尾星芒迸发序列帧（失败则无尾焰，不影响玩法）

    // ── 音频预热 ──────────────────────────────────────────────
    // initSfx 预创建所有音效实例（相当于预解码），否则第一次 duang 会有可感知延迟。
    initSfx();
    startBgm();

    if (window.addEventListener) window.addEventListener('resize', fit);

    // ── 生命周期（P1 · 2026-09-04）───────────────────────────────
    // 【之前完全没接】切后台 BGM/语音/视频继续响（审核合规风险 + 耗电），
    // 内存告警也无处理（低端机 canvas+视频+音频极易被系统杀）。
    // 注：音量开关由 pd-home 的 applyAudio 壳管理（volume 置 0/回写），
    // 这里只做 play/pause，不碰 volume，两边不打架。
    var bgmWasOn = false;
    function pauseAllAudio() {
      try { if (bgmAudio) { bgmWasOn = true; bgmAudio.pause(); } } catch (e) {}
      stopVoice();                                   // 连延迟排队的语音一起作废（epoch++）
      try { if (boudoirVideo && boudoirVideo.pause) boudoirVideo.pause(); } catch (e) {}
      if (suckTimer) { clearTimeout(suckTimer); suckTimer = null; }   // 挂起的 suck 停掉
    }
    function resumeAllAudio() {
      // 语音不恢复（时序已过，突然续播很突兀）；BGM 继续垫底
      if (bgmWasOn) {
        try { if (bgmAudio) bgmAudio.play(); } catch (e) {}
        bgmWasOn = false;
      }
    }
    if (window.KwaiBase && KwaiBase.onHide) {
      KwaiBase.onHide(pauseAllAudio);
      if (KwaiBase.onShow) KwaiBase.onShow(resumeAllAudio);
    } else if (typeof ks !== 'undefined' && ks.onHide) {
      ks.onHide(pauseAllAudio);
      if (ks.onShow) ks.onShow(resumeAllAudio);
    }
    // 内存告警：只丢「可重建」的缓存，下一帧自动重建，绝不崩
    if (typeof ks !== 'undefined' && ks.onMemoryWarning) {
      ks.onMemoryWarning(function () {
        sceneCache = null; sceneRP = -1;
        console.warn('[life] onMemoryWarning → 已丢弃 sceneCache');
      });
    }

    function pos(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { x: t.clientX !== undefined ? t.clientX : t.x, y: t.clientY !== undefined ? t.clientY : t.y };
    }
    if (typeof ks !== 'undefined' && ks.onTouchStart) {
      ks.onTouchStart(function (e) { var p = pos(e); onDown(p.x, p.y); });
      ks.onTouchMove(function (e) { var p = pos(e); onMove(p.x, p.y); });
      ks.onTouchEnd(function () { onUp(); });
    } else if (window.addEventListener) {
      window.addEventListener('touchstart', function (e) { e.preventDefault(); var p = pos(e); onDown(p.x, p.y); }, { passive: false });
      window.addEventListener('touchmove', function (e) { e.preventDefault(); var p = pos(e); onMove(p.x, p.y); }, { passive: false });
      window.addEventListener('touchend', function (e) { e.preventDefault(); onUp(); }, { passive: false });
      window.addEventListener('mousedown', function (e) { var p = pos(e); onDown(p.x, p.y); });
      window.addEventListener('mousemove', function (e) { var p = pos(e); onMove(p.x, p.y); });
      window.addEventListener('mouseup', function () { onUp(); });
    }

    // ── 【读档】必须在 newGame() 之前 ────────────────────────────
    // 顺序铁律：newGame() 会立刻读 lvNo 去 genLevel，并按 girlIdx 选立绘/语音。
    // 读档若放在它后面，第一关一定是用默认值（lv=1、糯糯）生成的，
    // 然后变量才被改成存档值 —— 画面和数据错位，且要多打一关才纠正过来。
    loadProgress();
    newGame();
    G._dbg = {
      down: onDown, move: onMove, up: onUp,
      snap: function () {
        var left = 0, i;
        for (i = 0; i < S.beans.length; i++) if (!S.beans[i].gone) left++;
        var sl = [];
        for (i = 0; i < 6; i++) sl.push(S.slots[i] ? (S.slots[i].color + ':' + S.slots[i].left + ':door' + S.slots[i].door.toFixed(1)) : null);
        return { beansLeft: left, cleared: S.cleared, moves: S.moves, queue: queueCount(), slots: sl, phase: S.phase, flights: flights.length, locked6: S.slot6Locked, tip: S.tip };
      },
      toScreen: function (dx, dy) { return { x: dx * scale + offX, y: dy * scale + offY }; },
      qRect: qRect, slotRect: slotRect
    };
    (window.requestAnimationFrame || function (f) { setTimeout(function () { f(Date.now()); }, 16); })(loop);
  };
})();
