// js/drag-unlock.js
// v1.0 · 视频内嵌「拖拽解锁」互动组件
//
// 用法：节点在 media 里声明 interaction 字段：
//   "interaction": {
//     "type": "drag",
//     "pauseAt": 10.0,                 // 视频播到第几秒暂停（秒）
//     "start": { "x": 0.30, "y": 0.62 },   // 起点（相对画面 0~1 比例坐标，不用绝对像素，屏幕适配）
//     "target": { "x": 0.62, "y": 0.30, "r": 0.09 },  // 终点 + 命中半径（比例）
//     "hint": "拖到肩膀，帮她脱下外套"      // 引导文案
//   }
//
// 状态机：
//   idle → (视频 timeupdate 到达 pauseAt) → armed（已暂停，等手指落在起点）
//   armed → (touchstart 落在起点附近) → dragging
//   dragging → (touchmove) 跟随手指画拖尾
//   dragging → (touchend 落在终点命中半径内) → unlocked → resume 视频
//   dragging → (touchend 未命中) → armed（弹回起点，可重试）
//
// 手势素材：package/images/fx/drag_hint/hand.png（单张 3D 手势图，弧线由 canvas 实时绘制）
//   动效 = 手沿二次贝塞尔弧线平移 + 弧线渐亮拖尾 + 首尾淡入淡出，循环播放。
//   若图片未就位，退化为纯 canvas 矢量画法（不阻塞开发，也不会白屏）。

(function (global) {
  'use strict';

  var HAND_SRC = 'images/fx/drag_hint/hand.png';
  var HAND_W = 66;            // 绘制宽度（px），高按原图比例 144/132
  var HAND_RATIO = 144 / 132;
  var TIP_X = 0.446;          // 指尖在图片内的相对锚点（实测自原图）
  var TIP_Y = 0.05;
  var LOOP_MS = 1700;         // 一次完整滑动循环时长
  var HOLD_MS = 320;          // 循环末尾停顿

  var handImg = null;
  var handLoadTried = false;

  function tryLoadFrames () {
    if (handLoadTried) return;
    handLoadTried = true;
    var mk = (typeof wx !== 'undefined' && wx.createImage) ? wx.createImage
      : (typeof Image !== 'undefined' ? function () { return new Image(); } : null);
    if (!mk) return;
    var im = mk();
    im.onerror = function () { handImg = null; };
    im.src = HAND_SRC;
    handImg = im;
  }

  // 二次贝塞尔：start → target，控制点在连线中点沿法线外抛，形成自然滑动弧
  function arcCtrl (start, target) {
    var mx = (start.x + target.x) / 2, my = (start.y + target.y) / 2;
    var dx = target.x - start.x, dy = target.y - start.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    // 法线方向（向"上"侧弯，视觉更像手划过的抛物轨迹）
    var nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    var bow = len * 0.26;
    return { x: mx + nx * bow, y: my + ny * bow };
  }

  function bez (p0, pc, p1, t) {
    var u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * pc.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * pc.y + t * t * p1.y
    };
  }

  function bezTangent (p0, pc, p1, t) {
    var u = 1 - t;
    return {
      x: 2 * u * (pc.x - p0.x) + 2 * t * (p1.x - pc.x),
      y: 2 * u * (pc.y - p0.y) + 2 * t * (p1.y - pc.y)
    };
  }

  // 画一段贝塞尔弧（t: 0→tEnd），用折线逼近以便做渐变/虚线
  function strokeArcPart (ctx, p0, pc, p1, tEnd, steps) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i <= steps; i++) {
      var p = bez(p0, pc, p1, tEnd * i / steps);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // ── 内部状态 ──
  var S = {
    active: false,        // 是否处于拖拽互动流程中（armed/dragging/unlocked 都算 active）
    phase: 'idle',        // idle | armed | dragging | unlocked
    node: null,           // 当前节点
    interaction: null,    // node.media.interaction
    startPx: null,        // {x,y} 绝对像素（渲染时按画布宽高换算）
    targetPx: null,       // {x,y,r} 绝对像素
    dragPx: null,         // 当前手指位置（拖拽中）
    ctrlPx: null,         // 弧线控制点
    t0: 0,                // 动画起始时间戳
    armT0: 0,             // armed 起始时间戳（超时兜底用）
    onUnlockedCb: null    // 命中后的回调（由 main.js 传入，负责 resume 视频）
  };

  // 注：不做超时自动放行——互动必须由玩家真实拖拽完成，引导会一直停在那里等他。

  function toPx (rel, W, H) {
    return { x: rel.x * W, y: rel.y * H };
  }

  function dist (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 供 main.js 调用：视频到达 pauseAt 时触发
  //   hooks: { onTry, onFail } —— 埋点回调（可选），由宿主注入，组件不直接依赖 Telemetry
  function arm (node, interaction, W, H, onUnlocked, hooks) {
    tryLoadFrames();
    S.active = true;
    S.phase = 'armed';
    S.hooks = hooks || null;
    S.node = node;
    S.interaction = interaction;
    var start = interaction.start || { x: 0.28, y: 0.62 };
    var target = interaction.target || { x: 0.64, y: 0.28, r: 0.09 };
    S.startPx = toPx(start, W, H);
    S.targetPx = { x: target.x * W, y: target.y * H, r: (target.r || 0.09) * Math.min(W, H) };
    S.dragPx = null;
    S.onUnlockedCb = onUnlocked || null;
    S.ctrlPx = arcCtrl(S.startPx, S.targetPx);
    S.t0 = Date.now();
    S.armT0 = S.t0;
    S.moveCount = 0;
    S.pathLen = 0;
    S.maxProg = 0;
    S.curProg = 0;      // v93.0 · 视觉进度（可回缩）
    S.lastMovePx = null;
    S.failFlash = 0;
    S.hapticT = 0;      // v93.0 · 每次 arm 都复位连续震动节流器
  }

  // 沿弧线的"进度"：用手指点到弧线各采样点的最近点，返回该点的 t（0~1）与偏离距离
  function projectOnArc (pt) {
    var p0 = S.startPx, pc = S.ctrlPx, p1 = S.targetPx;
    var bestT = 0, bestD = Infinity;
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var p = bez(p0, pc, p1, t);
      var d = dist(pt, p);
      if (d < bestD) { bestD = d; bestT = t; }
    }
    return { t: bestT, off: bestD };
  }

  // 命中/超时统一出口
  function finish () {
    S.phase = 'unlocked';
    // 不立刻 active=false：先播一段撒花庆祝，庆祝结束再回调 resume 视频
    S.celebT0 = Date.now();
    spawnConfetti();
    // 成功触感反馈（强震一下 + 两声轻震的节奏感）
    hapticOk();
    // v93.0 · 成功解锁音效（由宿主播放，能读到全局静音状态）
    if (S.hooks && S.hooks.onOk) { try { S.hooks.onOk(); } catch (_) { } }
  }

  // 触感反馈：成功时给「重 + 轻轻」的节奏，比单次震动更有「达成」感
  // v93.0 · 用户要求「成功时震感更强」→ 从 heavy+light+light 升级为
  //   heavy ×3 连击（120ms 间隔），明显区别于过程中的 light 连续搓动。
  function hapticOk () {
    try {
      var vs = (typeof KwaiDevice !== 'undefined' && KwaiDevice.vibrateShort) ? KwaiDevice.vibrateShort : null;
      if (vs) {
        vs('heavy');
        if (typeof setTimeout === 'function') {
          setTimeout(function () { try { vs('heavy'); } catch (_) { } }, 120);
          setTimeout(function () { try { vs('heavy'); } catch (_) { } }, 250);
          setTimeout(function () { try { vs('medium'); } catch (_) { } }, 380);
        }
      } else if (typeof wx !== 'undefined' && wx.vibrateShort) {
        wx.vibrateShort({ type: 'heavy' });
        if (typeof setTimeout === 'function') {
          setTimeout(function () { try { wx.vibrateShort({ type: 'heavy' }); } catch (_) { } }, 120);
          setTimeout(function () { try { wx.vibrateShort({ type: 'heavy' }); } catch (_) { } }, 250);
          setTimeout(function () { try { wx.vibrateShort({ type: 'medium' }); } catch (_) { } }, 380);
        }
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([60, 60, 60, 60, 60, 60, 30]);
      }
    } catch (e) { }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // v92.9 · 【拖拽全过程触感】此前只有「成功」那一下有震动，拖的过程完全没反馈，
  //   手感上就像在划一张死图。现在补三处：
  //     ① 手指按在起点圆上（成功起手）→ light，告诉玩家「抓住了」
  //     ② 沿弧线每推进 20% 进度       → light 的细微搓动，形成「一格一格在脱」的爽感
  //     ③ 失败弹回                    → medium 一下，明确「没成功，重来」
  //   统一走这个 haptic(kind) 出口，三级兜底与 hapticOk 一致（KwaiDevice → wx → navigator）。
  function haptic (kind) {
    try {
      var vs = (typeof KwaiDevice !== 'undefined' && KwaiDevice.vibrateShort) ? KwaiDevice.vibrateShort : null;
      if (vs) { vs(kind); return; }
      if (typeof wx !== 'undefined' && wx.vibrateShort) { wx.vibrateShort({ type: kind }); return; }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(kind === 'heavy' ? 40 : (kind === 'medium' ? 24 : 12));
      }
    } catch (e) { }
  }
  // 沿弧线推进的「格子」触感 —— v93.0 已改为「滑动期间连续震动」。
  //   用户反馈：「震动应该是跟着我滑动的过程中一直震动的」。
  //   每 20% 一格太稀（全程只有 5 下），改成时间节流的连续轻震：
  //   只要手指真的在移动（位移 > 1.5px），每 55ms 补一发 light，
  //   停手不震（不然就是一台马达），成功那下用 hapticOk 的 heavy×3 明确区分。
  var HAPTIC_MIN_MS = 55;
  var HAPTIC_MIN_PX = 1.5;
  function hapticMoving (movedPx) {
    if (movedPx < HAPTIC_MIN_PX) return;
    var now = Date.now();
    if (now - (S.hapticT || 0) < HAPTIC_MIN_MS) return;
    S.hapticT = now;
    haptic('light');
  }

  // 撒花：从终点圆位置向上炸开的彩色纸片，带重力下落 + 自旋
  var CONF_COLORS = ['#ff5f8f', '#ffd166', '#6ee7ff', '#a78bfa', '#7ef2a4', '#ff9f68', '#fff1a8'];
  function spawnConfetti () {
    S.confetti = [];
    var ox = S.targetPx ? S.targetPx.x : 0;
    var oy = S.targetPx ? S.targetPx.y : 0;
    for (var i = 0; i < 64; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.5; // 主要朝上扇形炸开
      var sp = 260 + Math.random() * 520;
      S.confetti.push({
        x: ox + (Math.random() - 0.5) * 30,
        y: oy + (Math.random() - 0.5) * 30,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        c: CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0],
        life: 1100 + Math.random() * 900
      });
    }
    S.confLastT = Date.now();
  }

  // 庆祝层渲染：撒花 + 中央「恭喜你」文案，播完自动 resume
  var CELEB_MS = 1700;
  function drawCelebrate (ctx, W, H) {
    var now = Date.now();
    var e = now - S.celebT0;
    var dt = Math.min(0.05, (now - (S.confLastT || now)) / 1000);
    S.confLastT = now;

    // 纸片物理推进
    if (S.confetti) {
      for (var i = S.confetti.length - 1; i >= 0; i--) {
        var p = S.confetti[i];
        p.life -= dt * 1000;
        if (p.life <= 0) { S.confetti.splice(i, 1); continue; }
        p.vy += 1150 * dt;          // 重力
        p.vx *= (1 - 1.1 * dt);      // 空气阻力
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }

    ctx.save();
    // 轻微暗场，让文字与纸片更跳
    var maskA = e < 260 ? (e / 260) * 0.22 : Math.max(0, 0.22 * (1 - (e - 260) / (CELEB_MS - 260)));
    ctx.fillStyle = 'rgba(0,0,0,' + maskA.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);

    // 纸片
    if (S.confetti) {
      for (var k = 0; k < S.confetti.length; k++) {
        var c = S.confetti[k];
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, c.life / 420));
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.c;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    }

    // 文案：弹入 + 停留 + 淡出
    var txt = '恭喜你，成功帮她脱掉啦～';
    var ta = 1, scale = 1;
    if (e < 240) { ta = e / 240; scale = 0.72 + 0.34 * (e / 240); }            // 弹入略过冲
    else if (e < 420) { scale = 1.06 - 0.06 * ((e - 240) / 180); }
    else if (e > CELEB_MS - 340) { ta = Math.max(0, (CELEB_MS - e) / 340); }

    ctx.save();
    ctx.globalAlpha = ta;
    ctx.translate(W / 2, H * 0.44);
    ctx.scale(scale, scale);
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw2 = ctx.measureText(txt).width;
    var bw2 = tw2 + 52, bh2 = 58;
    // 胶囊底
    ctx.fillStyle = 'rgba(28,14,22,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw2 / 2, -bh2 / 2, bw2, bh2, 29);
    else ctx.rect(-bw2 / 2, -bh2 / 2, bw2, bh2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,110,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffe6b0';
    ctx.fillText(txt, 0, 1);
    ctx.restore();

    ctx.restore();

    // 庆祝播完 → 真正结束互动，恢复视频
    if (e >= CELEB_MS) {
      S.active = false;
      S.confetti = null;
      var cb = S.onUnlockedCb;
      S.onUnlockedCb = null;
      if (cb) { try { cb(); } catch (e2) { } }
    }
  }

  function isActive () { return S.active; }
  function getPhase () { return S.phase; }

  // 供 main.js 的 onTouch 调用：手指按下是否落在起点附近（命中半径给宽松一点，方便触发）
  function touchStart (x, y) {
    if (!S.active || S.phase !== 'armed') return false;
    var hitR = Math.max(46, (S.targetPx && S.targetPx.r) || 46); // 起点热区略大，降低门槛
    if (dist({ x: x, y: y }, S.startPx) <= hitR) {
      S.phase = 'dragging';
      S.dragPx = { x: x, y: y };
      // 本次拖拽从零开始统计：移动采样数 / 实际轨迹长度 / 沿弧线到达的最大进度
      S.moveCount = 0;
      S.pathLen = 0;
      S.maxProg = 0;
      S.curProg = 0;   // v93.0 · 视觉进度（可回缩）
      S.lastMovePx = { x: x, y: y };
      S.hapticT = 0;      // v93.0 · 连续震动的时间节流器归零
      haptic('medium');   // v93.0 · 起手反馈加重一档：明确「抓住了」
      // 埋点：真正进入拖拽（用户意图）
      if (S.hooks && S.hooks.onTry) { try { S.hooks.onTry(); } catch (_) { } }
      return true;
    }
    return false;
  }

  function touchMove (x, y) {
    if (!S.active || S.phase !== 'dragging') return false;
    var pt = { x: x, y: y };
    // 累计真实滑动轨迹长度（用于识别"点一下就抬手"的假拖拽）
    var _seg = S.lastMovePx ? dist(S.lastMovePx, pt) : 0;
    if (S.lastMovePx) S.pathLen += _seg;
    S.lastMovePx = pt;
    S.moveCount++;
    // 记录沿弧线到达的最大进度（只认贴着弧线走的部分，偏离太远的不计入）
    var pr = projectOnArc(pt);
    var tol = Math.max(90, S.targetPx.r * 2.2); // 允许的横向偏离容差
    if (pr.off <= tol && pr.t > S.maxProg) S.maxProg = pr.t;
    // v93.0 · 视觉进度独立于校验进度：maxProg 只增不减（防作弊口径），
    //   但拖尾若用它，往回拖时线不缩、手和线脱节 → 观感就是「不跟手」。
    //   这里另记 curProg 供绘制使用，回拖时拖尾会跟着回缩，真正贴住手指。
    S.curProg = (pr.off <= tol) ? pr.t : (S.curProg || 0);
    // v93.0 · 滑动全程连续轻震（每 55ms 一发，停手即停）
    hapticMoving(_seg);
    S.dragPx = pt;
    return true;
  }

  function touchEnd (x, y) {
    if (!S.active || S.phase !== 'dragging') return false;
    // 抬手点也并入轨迹与进度统计
    var pt = { x: x, y: y };
    if (S.lastMovePx) S.pathLen += dist(S.lastMovePx, pt);
    var prEnd = projectOnArc(pt);
    var tolEnd = Math.max(90, S.targetPx.r * 2.2);
    if (prEnd.off <= tolEnd && prEnd.t > S.maxProg) S.maxProg = prEnd.t;

    var straight = dist(S.startPx, S.targetPx) || 1;

    // ── 三重校验，缺一不可（杜绝"点一下就解锁"）──
    // ① 终点命中：抬手必须落在终点圆内
    var inTarget = dist(pt, S.targetPx) <= S.targetPx.r;
    // ② 路径覆盖：必须沿弧线真的走到过 88% 以上进度
    var progressed = S.maxProg >= 0.88;
    // ③ 真实滑动：累计轨迹长度不少于起终点直线距离的 70%，且至少有 4 次移动采样
    var reallyDragged = S.pathLen >= straight * 0.7 && S.moveCount >= 4;

    if (inTarget && progressed && reallyDragged) {
      finish();
    } else {
      // 未通过：弹回起点，允许重试（失败时给一次红闪提示）
      // 埋点：区分三种失败原因，便于定位是「没滑到终点」还是「假拖拽」
      var _reason = !reallyDragged ? 'no_real_drag' : (!progressed ? 'path_incomplete' : 'miss_target');
      if (S.hooks && S.hooks.onFail) {
        try { S.hooks.onFail({ reason: _reason, maxProg: S.maxProg }); } catch (_) { }
      }
      S.phase = 'armed';
      S.dragPx = null;
      S.maxProg = 0;
      S.curProg = 0;            // v93.0
      S.pathLen = 0;
      S.moveCount = 0;
      S.lastMovePx = null;
      S.hapticT = 0;            // v93.0 · 连续震动节流器复位
      haptic('medium');         // v93.0 · 失败弹回：一下明确的中震，「没成功，重来」
      S.failFlash = Date.now();
      S.t0 = Date.now(); // 引导动效从头播，重新示范一遍
    }
    return true;
  }

  function reset () {
    S.active = false;
    S.phase = 'idle';
    S.node = null;
    S.interaction = null;
    S.startPx = null;
    S.targetPx = null;
    S.dragPx = null;
    S.ctrlPx = null;
    S.armT0 = 0;
    S.onUnlockedCb = null;
    S.hooks = null;
    S.moveCount = 0;
    S.pathLen = 0;
    S.maxProg = 0;
    S.curProg = 0;      // v93.0
    S.lastMovePx = null;
    S.failFlash = 0;
    S.hapticT = 0;      // v93.0
  }

  // ── 渲染 ──
  function draw (ctx, W, H) {
    if (!S.active) return;
    var now = Date.now();
    // 解锁后的撒花庆祝层（独立于引导层）
    if (S.phase === 'unlocked') { drawCelebrate(ctx, W, H); return; }
    if (!S.ctrlPx) S.ctrlPx = arcCtrl(S.startPx, S.targetPx);

    ctx.save();

    // 半透明遮罩（暗场引导，不完全遮住视频画面）
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, W, H);

    // 终点圆环（呼吸效果）
    var pulse = 1 + 0.10 * Math.sin(now / 260);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(S.targetPx.x, S.targetPx.y, S.targetPx.r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,110,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(S.targetPx.x, S.targetPx.y, S.targetPx.r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (S.phase === 'armed') {
      // 展示引导弧线 + 手势动效 / 矢量兜底
      drawHintFrame(ctx, S.startPx, S.targetPx, now);
    } else if (S.phase === 'dragging' && S.dragPx) {
      // 拖拽中：沿弧线画拖尾（与引导同一条线），手指处高亮圆
      ctx.save();
      var pcD = S.ctrlPx || arcCtrl(S.startPx, S.targetPx);
      // v93.0 · 拖尾用 curProg（可回缩）而不是 maxProg（只增不减），
      //   否则往回拖时线还停在最远处，手与线分离，观感就是「不跟手、不丝滑」。
      var tD = Math.max(0, Math.min(1, S.curProg != null ? S.curProg : (S.maxProg || 0)));
      ctx.lineCap = 'round';
      if (ctx.setLineDash) ctx.setLineDash([10, 9]);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      strokeArcPart(ctx, S.startPx, pcD, S.targetPx, 1, 36);
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,214,110,0.32)';
      ctx.lineWidth = 14;
      strokeArcPart(ctx, S.startPx, pcD, S.targetPx, tD, 30);
      ctx.strokeStyle = 'rgba(255,226,150,0.95)';
      ctx.lineWidth = 6;
      strokeArcPart(ctx, S.startPx, pcD, S.targetPx, tD, 30);
      // 手指位置：有手势图就画手（指尖贴手指），否则白圆
      if (handImg && handImg.width) {
        var wD = HAND_W, hD = HAND_W * HAND_RATIO;
        try {
          ctx.drawImage(handImg, S.dragPx.x - wD * TIP_X, S.dragPx.y - hD * TIP_Y, wD, hD);
        } catch (_eD) { }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(S.dragPx.x, S.dragPx.y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 起点标记（白色描边圆环，不填充；phase=armed 时可见）
    if (S.phase === 'armed') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(S.startPx.x, S.startPx.y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 引导文案：放在画面下方（避开人物脸/肩，也避开顶部状态区），样式强化
    var hint = (S.interaction && S.interaction.hint) || '拖动手势完成互动';
    var failing = S.failFlash && (now - S.failFlash < 1600);
    if (failing) hint = '要沿着线一直滑到圆圈里哦';
    ctx.save();
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 位置：画面 78% 高度处（底部控制栏之上），比原来的顶部位置更贴近操作区
    var ty = H * 0.78;
    var tw = ctx.measureText(hint).width;
    var padX = 26, bh = 52;
    var bw = tw + padX * 2;
    var bx = W / 2 - bw / 2, by = ty - bh / 2;
    // 呼吸缩放，抓眼球
    var br = 1 + 0.025 * Math.sin(now / 340);
    ctx.translate(W / 2, ty);
    ctx.scale(br, br);
    ctx.translate(-W / 2, -ty);
    // 深色胶囊底 + 金色描边 + 外发光
    ctx.fillStyle = failing ? 'rgba(52,16,20,0.92)' : 'rgba(26,12,20,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(bx, by, bw, bh, bh / 2); } else { ctx.rect(bx, by, bw, bh); }
    ctx.fill();
    ctx.strokeStyle = failing ? 'rgba(255,140,140,0.55)' : 'rgba(255,214,110,0.45)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = failing ? 'rgba(255,170,170,0.95)' : 'rgba(255,214,110,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 文字：描边增强对比，任何画面上都读得清
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(hint, W / 2, ty + 1);
    ctx.fillStyle = failing ? '#ffc9c9' : '#ffe6b0';
    ctx.fillText(hint, W / 2, ty + 1);
    ctx.restore();

    ctx.restore();
  }

  // 引导动效：自绘贝塞尔弧线 + 手势图沿弧线滑动（指尖贴线），素材未就位时矢量兜底
  function drawHintFrame (ctx, start, target, now) {
    var pc = S.ctrlPx || arcCtrl(start, target);

    // 循环进度：0→1 滑动，末尾 HOLD_MS 停顿在终点
    var total = LOOP_MS + HOLD_MS;
    var e = (now - S.t0) % total;
    var raw = e < LOOP_MS ? (e / LOOP_MS) : 1;
    // ease-in-out，起手慢、中间快、落点稳
    var t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;

    // 首尾淡入淡出，循环衔接不突兀
    var alpha = 1;
    if (raw < 0.12) alpha = raw / 0.12;
    else if (e > LOOP_MS) alpha = Math.max(0, 1 - (e - LOOP_MS) / HOLD_MS);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1) 整条弧线的暗底虚线（表示完整路径）
    ctx.save();
    if (ctx.setLineDash) ctx.setLineDash([10, 9]);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 3;
    strokeArcPart(ctx, start, pc, target, 1, 36);
    ctx.restore();

    // 2) 已划过的部分：高亮金色拖尾（外发光 + 实线）
    if (t > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,110,0.30)';
      ctx.lineWidth = 13;
      strokeArcPart(ctx, start, pc, target, t, 30);
      ctx.strokeStyle = 'rgba(255,226,150,0.92)';
      ctx.lineWidth = 5;
      strokeArcPart(ctx, start, pc, target, t, 30);
      ctx.restore();
    }

    // 3) 弧线端点小光点
    var p = bez(start, pc, target, t);
    ctx.save();
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4) 手势图：指尖锚点对齐弧线当前点，并按切线方向轻微旋转（±12° 内，避免图变怪）
    if (handImg && handImg.width) {
      var tg = bezTangent(start, pc, target, t);
      var ang = Math.atan2(tg.y, tg.x);
      // 基准方向取 start→target 的整体朝向，只取相对偏摆做小幅倾斜
      var base = Math.atan2(target.y - start.y, target.x - start.x);
      var rot = Math.max(-0.21, Math.min(0.21, (ang - base) * 0.8));
      var w = HAND_W, h = HAND_W * HAND_RATIO;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(rot);
      // 轻微"按压"缩放：起手时略大，落点回弹
      var sc = 1 + 0.06 * Math.sin(raw * Math.PI);
      ctx.scale(sc, sc);
      try {
        ctx.drawImage(handImg, -w * TIP_X, -h * TIP_Y, w, h);
      } catch (_e) { }
      ctx.restore();
    } else {
      // 矢量兜底：移动圆点（弧线已在上面画过）
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  global.DragUnlock = {
    arm: arm,
    reset: reset,
    isActive: isActive,
    getPhase: getPhase,
    touchStart: touchStart,
    touchMove: touchMove,
    touchEnd: touchEnd,
    draw: draw
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : this));
