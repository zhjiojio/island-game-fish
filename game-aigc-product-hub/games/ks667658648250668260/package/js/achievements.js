/**
 * 微婚期 · 成就 / 技能卡包系统
 * ============================================
 * API（挂在 window.Achievements）
 *   Achievements.init({ canvas, ctx, W, H, isKS, wx })
 *   Achievements.unlock(id)       // 解锁一张卡（触发飞入浮层）
 *   Achievements.draw()           // 在每帧渲染末尾调用（顶层覆盖）
 *   Achievements.onTouch(x, y)    // 返回 true 表示事件已被吞掉，主逻辑不用再处理
 * ============================================
 * 交互流程：
 *   unlock(id) → 中央大卡片浮层（3s） → 缩小飞向右上角卡包入口
 *   点击右上角金色卡包入口 → 打开抽屉（网格展示已解锁+未解锁灰卡）
 *   点击单张卡 → 全屏大图 + 标题 + 副标题 + 星级
 */
(function (global) {
  'use strict';

  // ============ 卡片数据表 ============
  var CARDS = [
    // 技能（傲天）
    { id: 'skill_land',    kind: 'skill',  name: '一亩好地',   sub: '这块地，真能救下嫂子吗？',       star: 3, img: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/skill_land.png' },
    { id: 'skill_stone',   kind: 'skill',  name: '石头变钱',   sub: '一咬牙一跺脚·顽石落地成铜板',   star: 4, img: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/skill_stone.png' },
    { id: 'skill_muscle',  kind: 'skill',  name: '变身猛男',   sub: '一身蛮力从天上掉下来·五个人也拦不住', star: 4, img: 'images/cards/skill_muscle.jpg' },
    { id: 'skill_house',   kind: 'skill',  name: '点石成屋',   sub: '一场雨逼出来的本事·土坯屋变大平层', star: 5, img: 'images/cards/skill_house.jpg' },

    // 勋章（婉儿）
    { id: 'medal_first',   kind: 'medal',  name: '初见婉儿',   sub: '义嫂穿越，缘起荒年',            star: 3, img: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_first.png' },
    { id: 'medal_peacock', kind: 'medal',  name: '孔雀开屏',   sub: '嫂子起舞 · 孔雀舞',              star: 4, img: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_peacock.png' },
    { id: 'medal_bunny',   kind: 'medal',  name: '爵士椅舞',   sub: '嫂子起舞 · 爵士椅子舞',          star: 3, img: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_bunny.png' },
    { id: 'medal_mongol',  kind: 'medal',  name: '敦煌飞天',   sub: '嫂子起舞 · 反弹琵琶敦煌飞天',    star: 4, img: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_mongol.png' },
    { id: 'medal_cloth1',  kind: 'medal',  name: '红肚兜',     sub: '为嫂换装 · 大红肚兜白纱披',      star: 3, img: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_cloth1.png' },
    { id: 'medal_cloth2',  kind: 'medal',  name: '黑蕾丝',     sub: '为嫂换装 · 黑色蕾丝旗袍',        star: 4, img: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_cloth2.png' },
    { id: 'medal_cloth3',  kind: 'medal',  name: '白纱裙',     sub: '为嫂换装 · 沐浴后的白纱裙',      star: 5, img: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_cloth3.png' },
    { id: 'medal_slap',    kind: 'medal',  name: '三巴掌',     sub: '支线结局 · 义嫂决绝',            star: 5, img: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/medal_slap.png' }
  ];
  // 从 registry 注入直通目标：{ ep, node, jumpable }。未在表中的卡保持无 jump（按钮显示“敬请期待”）。
  // ⚠️ v90.21 铁律：禁止在 CARDS 里手写 chapter / jump —— 历史手录数据与真正的解锁位置
  //   (content/assets.registry.json 的 nodeUnlockMap) 对不上，11 张卡有 6 张目标章节写错，
  //   导致「看广告直通」把人送到错误章节。现统一由构建期从剧本数据推导。
  (function injectJumpTargets () {
    var host = (typeof window !== 'undefined' && window.WEIHUNQI_REGISTRY) || (global && global.WEIHUNQI_REGISTRY) || null;
    var map = (host && host.CARD_JUMP_MAP) || null;
    CARDS.forEach(function (c) {
      var t = map && map[c.id];
      if (!t) return;
      c.chapter = t.ep;
      c.unlockNode = t.node;
      if (t.jumpable) c.jump = { ep: t.ep, node: t.node };
    });
    if (!map) { try { console.log('[achv] ⚠️ CARD_JUMP_MAP 缺失，直通按钮全部降级为“敬请期待”'); } catch (_) {} }
  })();
  var CARD_MAP = {};
  CARDS.forEach(function(c){ CARD_MAP[c.id] = c; });

  // ============ 内部状态 ============
  var S = {
    ready: false,
    canvas: null, ctx: null, W: 393, H: 852, isKS: false, wx: null,
    unlocked: {},         // { id: true }
    imgCache: {},         // { url: Image }
    imgFailed: {},
    imgLoading: {},       // { url: true }
    // 浮层动画：'in'(飞入 300ms) → 'stay'(3000ms) → 'shrink'(600ms 飞向卡包) → null
    popup: null,          // { id, phase, t0, duration }
    // 卡包按钮闪光
    entryPulseT: 0,
    // 抽屉
    drawerOpen: false,
    drawerT0: 0,          // 打开动画
    drawerScrollY: 0,
    // 详情
    detailId: null,
    // 触摸命中区
    hits: [],
    // 提示消息（"新技能解锁"等）
    toast: null           // { text, t0 }
    ,avatarRect: null
    ,avatarHoldTimer: null
    ,avatarHoldTriggered: false
  };

  // ============ 图片加载 ============
  function loadImg(url, cb) {
    if (S.imgCache[url]) { cb && cb(S.imgCache[url]); return; }
    if (S.imgLoading[url] || S.imgFailed[url]) return;
    S.imgLoading[url] = true;
    var im;
    if (S.isKS && S.wx && S.wx.createImage) im = S.wx.createImage();
    else im = new Image();
    im.onload = function(){ S.imgCache[url] = im; S.imgLoading[url] = false; cb && cb(im); };
    im.onerror = function(){ S.imgLoading[url] = false; S.imgFailed[url] = true; };
    im.src = url;
  }
  function preloadAll() {
    CARDS.forEach(function(c){ loadImg(c.img); });
  }

  // ============ 公共 API ============
  function init(opts) {
    S.canvas = opts.canvas; S.ctx = opts.ctx;
    S.W = opts.W || 393; S.H = opts.H || 852;
    S.isKS = !!opts.isKS; S.wx = opts.wx || null;
    S.getUser = opts.getUser || function(){ return null; };
    S.getPlayT0 = opts.getPlayT0 || function(){ return 0; };
    S.getBeCount = opts.getBeCount || function(){ return 0; };
    S.onClearCache = opts.onClearCache || null;
    S.onRequestUser = opts.onRequestUser || null;
    S.onSessionAdBypass = opts.onSessionAdBypass || null;
    S.onDirectChapter = opts.onDirectChapter || null;
    // V31·6 · 滑动状态
    S.drawerScrollY = 0;
    S._touchStartY = 0;
    S._touchLastY = 0;
    S._touching = false;
    S._contentH = 0;
    S._viewH = 0;
    S.activeTab = 'medal';  // V31·7 · 默认勋章 tab
    // 恢复存档
    try {
      var saved = null;
      if (S.isKS && S.wx && S.wx.getStorageSync) saved = S.wx.getStorageSync('achv_unlocked');
      else if (typeof localStorage !== 'undefined') { var raw = localStorage.getItem('achv_unlocked'); saved = raw ? JSON.parse(raw) : null; }
      if (saved && typeof saved === 'object') S.unlocked = saved;
    } catch(e){}
    S.ready = true;
    loadImg("images/icons/icon_achv.png");
    preloadAll();
    console.log('[achv] init ok, unlocked=', Object.keys(S.unlocked).length, '/', CARDS.length);
  }

  function saveUnlocked() {
    try {
      if (S.isKS && S.wx && S.wx.setStorageSync) S.wx.setStorageSync('achv_unlocked', S.unlocked);
      else if (typeof localStorage !== 'undefined') localStorage.setItem('achv_unlocked', JSON.stringify(S.unlocked));
    } catch(e){}
  }

  // 解锁卡片并显示浮层。forcePopup 用于剧情中的“技能卡”节点：
  // 即使该卡片已在历史存档中解锁，重新到达节点时仍需给用户一次明确反馈。
  function unlock(id, opts) {
    if (!S.ready) return;
    if (!CARD_MAP[id]) { console.log('[achv] unknown id', id); return; }
    if (S.unlocked[id]) {
      console.log('[achv] already unlocked', id);
      if (opts && opts.forcePopup) {
        S.popup = { id: id, phase: 'in', t0: Date.now(), replay: true };
        try {
          if (S.isKS && S.wx && S.wx.vibrateShort) S.wx.vibrateShort({ type: 'heavy' });
          else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
        } catch(e){}
      }
      return false;
    }
    S.unlocked[id] = true;
    saveUnlocked();
    S.popup = { id: id, phase: 'in', t0: Date.now() };
    console.log('[achv] 🎉 unlocked', id);
    try {
      if (S.isKS && S.wx && S.wx.vibrateShort) S.wx.vibrateShort({ type: 'heavy' });
      else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
    } catch(e){}
    return true;
  }

  // 允许剧情节点在“已解锁”状态下重播一次解锁提示，不改动卡片状态。
  function showUnlockPopup(id) { return unlock(id, { forcePopup: true }); }

  // ============ 触摸处理 ============
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  // V31·6 · 触摸开始（记录起点，用于识别滑动）
  function onTouchStart(x, y) {
    if (!S.ready) return false;
    // 头像长按监听必须优先于抽屉滚动命中。
    if (S.drawerOpen && S.avatarRect && inRect(x, y, S.avatarRect)) {
      S.avatarHoldTriggered = false;
      if (S.avatarHoldTimer) clearTimeout(S.avatarHoldTimer);
      var avatarUser = S.getUser && S.getUser();
      if (avatarUser && avatarUser.nickName) {
        S.avatarHoldTimer = setTimeout(function () {
          S.avatarHoldTimer = null; S.avatarHoldTriggered = true;
          if (S.onSessionAdBypass) S.onSessionAdBypass();
          S.toast = { text: '本次启动已开启免广告', t0: Date.now() };
        }, 4000);
      }
      return true;
    }
    if (S.drawerOpen) {
      var drawerBox = S._drawerBox || null;
      if (drawerBox && inRect(x, y, drawerBox)) {
        S._touchStartY = y;
        S._touchLastY = y;
        S._touching = true;
        S._touchMoved = false;
        return true;
      }
    }
    return false;
  }
  function onTouchMove(x, y) {
    if (!S.ready || !S._touching || !S.drawerOpen) return false;
    var dy = y - S._touchLastY;
    S._touchLastY = y;
    if (Math.abs(y - S._touchStartY) > 6) S._touchMoved = true;
    // 反向滚动内容
    var maxScroll = Math.max(0, (S._contentH || 0) - (S._viewH || 0));
    S.drawerScrollY = Math.max(0, Math.min(maxScroll, S.drawerScrollY - dy));
    return true;
  }
  function onTouchEnd(x, y) {
    if (S.avatarHoldTimer) { clearTimeout(S.avatarHoldTimer); S.avatarHoldTimer = null; }
    if (S.avatarHoldTriggered) { S.avatarHoldTriggered = false; return true; }
    if (S._touching) {
      var moved = S._touchMoved;
      S._touching = false;
      S._touchMoved = false;
      // 如果是滑动手势，不触发点击
      if (moved) { S._pendingTap = null; return true; }
    }
    // V31·7-FIX · 抽屉内的点击都改在 touchend 时处理，避免滑动误触
    if (S._pendingTap && S.drawerOpen) {
      var pt = S._pendingTap;
      S._pendingTap = null;
      return applyTap(pt.x, pt.y);
    }
    S._pendingTap = null;
    return false;
  }
  function onTouch(x, y) {
    if (!S.ready) return false;
    // v92.1 · 【P0 · 铁律 108】入口胶囊「绘制」与「命中」必须同源。
    //   旧逻辑：绘制受 main.js 的 _achvVisible 门控（沉浸模式/婉儿未登场/解锁音频未播完不画），
    //   但这里的命中判定完全不知道胶囊有没有画出来 → 胶囊不可见时热区仍然存活；
    //   且 drawEntryOnly() 未被调用那一帧 S.hits 不会清空，残留上一帧的 entry 热区。
    //   结果：玩家点左侧胶囊位置 → 成就系统没吃掉 → 事件穿透到底层【整行满宽】的选项按钮
    //   → 直接命中广告选项 → 零确认拉起激励视频。这就是用户报的「点成就直接弹广告」。
    S._entryVisible = !!S._entryVisible;
    // 详情页最上层：先处理“直通该章”按钮，再允许关闭
    if (S.detailId) {
      for (var di = S.hits.length - 1; di >= 0; di--) {
        if (inRect(x, y, S.hits[di])) {
          if (S.hits[di].action === 'detail_jump') {
            var dc = CARD_MAP[S.detailId];
            // v90.20 · 直通按钮点击埋点（scene 天然按启动去重 → UV 口径）
            try {
              if (global.Telemetry) global.Telemetry.event('achievement_direct_click', {
                card_id: S.detailId || '', target_chapter: (dc && dc.chapter) || '',
                mapped: (dc && dc.jump && dc.chapter) ? '1' : '0'
              });
            } catch (_) {}
            if (dc && dc.jump && dc.jump.ep && S.onDirectChapter) { S.detailId = null; S.drawerOpen = false; S.onDirectChapter(dc); }
            else S.toast = { text: '不可直达，请探索解锁', t0: Date.now() };
            return true;
          }
        }
      }
      S.detailId = null; return true;
    }
    // 抽屉打开：延迟到 touchend 才处理点击（避免滑动时误触 toast/card）
    if (S.drawerOpen) {
      S._pendingTap = { x: x, y: y };
      return true;   // 吞掉，不冒泡到主流程
    }
    // 浮层显示中：点浮层跳过收起
    if (S.popup && (S.popup.phase === 'in' || S.popup.phase === 'stay')) {
      S.popup.phase = 'shrink'; S.popup.t0 = Date.now();
      return true;
    }
    // 右上角卡包入口
    //   v92.1 · 必须先确认这一帧真的画了胶囊（_entryVisible 由 main.js 在 drawEntryOnly 前设置）。
    //   不可见时直接放行给主 hitZones —— 主通道那边已加「胶囊矩形保护」，不会误命中选项。
    if (!S._entryVisible) return false;
    var ent = getEntryRect();
    if (inRect(x, y, ent)) {
      S.drawerOpen = true; S.drawerT0 = Date.now();
      S.drawerScrollY = 0;
      if (!S.activeTab) S.activeTab = 'medal';   // V31·7 · 默认勋章
      return true;
    }
    return false;
  }

  // V31·7-FIX · 抽屉内点击真正处理逻辑（touchend 触发）
  function applyTap(x, y) {
    var drawerBox = S._drawerBox || null;
    var insideDrawer = drawerBox && inRect(x, y, drawerBox);
    for (var i = 0; i < S.hits.length; i++) {
      var h = S.hits[i];
      if (inRect(x, y, h)) {
        if (h.action === 'close') { S.drawerOpen = false; return true; }
        if (h.action === 'clear_cache') {
          // V31·9 · 清除缓存：清除所有游玩数据 + 成就 + 存档，回到启动页
          try {
            if (S.onClearCache) S.onClearCache();
          } catch(e){}
          S.unlocked = {};
          S.drawerOpen = false;
          S.detailId = null;
          S.popup = null;
          S.toast = { text: '✅ 已清除所有缓存，即将重新开始', t0: Date.now() };
          return true;
        }
        if (h.action === 'user_profile') {
          if (S.onRequestUser) S.onRequestUser();
          return true;
        }
        if (h.action.indexOf('tab:') === 0) {
          var tk = h.action.slice(4);
          if (S.activeTab !== tk) { S.activeTab = tk; S.drawerScrollY = 0; }
          return true;
        }
        if (h.action.indexOf('card:') === 0) {
          var cid = h.action.slice(5);
          S.detailId = cid;
          // v90.20 · 成就详情浮层曝光埋点（scene 天然按启动去重 → UV 口径）
          try {
            if (global.Telemetry) {
              var _dcard = CARD_MAP[cid];
              global.Telemetry.event('page_view:achievement_detail', {
                card_id: cid || '', target_chapter: (_dcard && _dcard.chapter) || '',
                mapped: (_dcard && _dcard.jump && _dcard.chapter) ? '1' : '0'
              });
            }
          } catch (_) {}
          return true;
        }
      }
    }
    if (!insideDrawer) { S.drawerOpen = false; }
    return true;
  }

  // ============ 位置计算 ============
  function getEntryRect() {
    // V31·8 · 胶囊内左 icon 右「我」文字，宽度对齐数值胶囊 62（保持一致）
    // v92.8 · 数值胶囊已改为固定 3 枚常驻（取消「嫂子好感」按 sisterUnlocked 显隐），
    //   故这里不再根据 sisterUnlocked 动态算 2/3 —— 否则成就胶囊会在婉儿登场那一刻下移一格。
    var _statCount = 3;
    // V41 · 与数值胶囊保持严格等间距（gap=10）：y = 80 + N*(40+10)，不再加额外 8px
    // v72.3 · 宽度对齐三数值胶囊折叠态（main-v42.js pwFolded=72），修复 v71.5 遗留的 82/72 不一致
    var CAPSULE_W = 72;
    try {
      var G = (typeof GameGlobal !== 'undefined' ? GameGlobal : this);
      if (G && typeof G.CAPSULE_W_FOLDED === 'number') CAPSULE_W = G.CAPSULE_W_FOLDED;
    } catch(e){}
    var w = CAPSULE_W, h = 40, x = 10, y = 80 + _statCount * (40+10);
    return { x: x, y: y, w: w, h: h };
  }

  // ============ 主绘制入口 ============
  function draw() {
    if (!S.ready) return;
    S.hits = [];  // 每帧清空
    var ctx = S.ctx;

    // 1. 右上角卡包入口（永远显示，除非抽屉/详情打开）
    if (!S.drawerOpen && !S.detailId) drawEntry();

    // 2. 中央解锁浮层
    if (S.popup) drawPopup();

    // 3. 抽屉
    if (S.drawerOpen) drawDrawer();

    // 4. 详情
    if (S.detailId) drawDetail();

    // 5. Toast
    if (S.toast) drawToast();
  }

  // V36 · 只画入口胶囊（提供给渲染层放在 stats 层级里，避免遮住 like 按钮）
  function drawEntryOnly() {
    if (!S.ready) return;
    S.hits = [];  // 每帧清空（主渲染层首先调用此函数，统一在此清空）
    if (!S.drawerOpen && !S.detailId) drawEntry();
  }
  // V36 · 只画顶层 overlay（drawer + detail + popup + toast），入口胶囊已被 drawEntryOnly 画过
  function drawOverlaysOnly() {
    if (!S.ready) return;
    S.hits = [];  // 每帧清空（抽屉打开时 drawEntryOnly 不被调用，在此统一清空）
    if (S.popup) drawPopup();
    if (S.drawerOpen) drawDrawer();
    if (S.detailId) drawDetail();
    if (S.toast) drawToast();
  }

  function drawEntry() {
    var r = getEntryRect();
    var ctx = S.ctx;
    ctx.save();
    var dx = r.x, dy = r.y, dw = r.w, dh = r.h;
    // 底
    ctx.fillStyle = 'rgba(0,0,0,.80)';
    var _r = Math.min(dw, dh) / 2;
    roundRect(ctx, dx, dy, dw, dh, _r); ctx.fill();
    ctx.strokeStyle = 'rgba(245,198,90,.75)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, dx, dy, dw, dh, _r); ctx.stroke();
    // V84 · icon 靠左（本地 icon_achv.png 图片 or fallback emoji）
    var iconR = 12;
    var iconCX = dx + 20;
    var iconCY = dy + dh/2;
    // 加载状态由共用缓存维护，异步未完成期间不会每帧重新创建图片。
    loadImg('images/icons/icon_achv.png');
    S._achvIconImg = S.imgCache['images/icons/icon_achv.png'] || null;
    if (S._achvIconImg && S._achvIconImg !== false) {
      ctx.save();
      ctx.beginPath(); ctx.arc(iconCX, iconCY, iconR, 0, Math.PI*2); ctx.clip();
      ctx.drawImage(S._achvIconImg, iconCX - iconR, iconCY - iconR, iconR*2, iconR*2);
      ctx.restore();
    } else {
      // fallback：金色圆 + 🏆
      var g = ctx.createRadialGradient(iconCX, iconCY, 2, iconCX, iconCY, iconR);
      g.addColorStop(0, '#fff5cf');
      g.addColorStop(.5, '#f5c65a');
      g.addColorStop(1, '#a06818');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(iconCX, iconCY, iconR, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#3a2408';
      ctx.font = '900 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🏆', iconCX, iconCY + 1);
    }
    // 「成就」文字
    ctx.fillStyle = '#ffd97a';
    ctx.font = '800 15px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var _txtCX = iconCX + iconR + (dx + dw - (iconCX + iconR)) / 2;
    ctx.fillText('私房', _txtCX, iconCY);
    ctx.restore();
    // 点击热区
    S.hits.push({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8, action: 'entry' });
  }

  function drawPopup() {
    var ctx = S.ctx;
    var now = Date.now();
    var p = S.popup;
    var card = CARD_MAP[p.id];
    if (!card) { S.popup = null; return; }

    // 阶段推进
    if (p.phase === 'in' && now - p.t0 > 320) { p.phase = 'stay'; p.t0 = now; }
    if (p.phase === 'stay' && now - p.t0 > 2000) { p.phase = 'shrink'; p.t0 = now; }
    if (p.phase === 'shrink' && now - p.t0 > 600) { S.popup = null; return; }

    // 目标：中央大卡 → 右上角小圆（尺寸缩小到 70%）
    var targetW = Math.min(280, S.W - 60) * 0.7;
    var targetH = targetW * 4 / 3;
    var cxMid = S.W / 2, cyMid = S.H / 2;
    var ent = getEntryRect();
    var cxEnd = ent.x + ent.w/2, cyEnd = ent.y + ent.h/2;

    var scale = 1, alpha = 1, cx = cxMid, cy = cyMid;
    if (p.phase === 'in') {
      var t = Math.min(1, (now - p.t0) / 320);
      var e = 1 - Math.pow(1 - t, 3);
      scale = 0.4 + 0.6 * e;
      alpha = t;
    } else if (p.phase === 'stay') {
      // 原地静止展示，不再本地晃动
      scale = 1;
    } else if (p.phase === 'shrink') {
      var t2 = Math.min(1, (now - p.t0) / 600);
      var e2 = t2 * t2;
      scale = 1 - 0.9 * e2;   // 缩到 0.1
      alpha = 1 - e2 * 0.7;
      cx = cxMid + (cxEnd - cxMid) * e2;
      cy = cyMid + (cyEnd - cyMid) * e2;
    }

    // 背景暗层（仅 in/stay）
    if (p.phase !== 'shrink') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * alpha) + ')';
      ctx.fillRect(0, 0, S.W, S.H);
      ctx.restore();
    }

    // 顶部提示"新技能/勋章解锁"
    if (p.phase === 'in' || p.phase === 'stay') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd76a';
      ctx.font = '800 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.kind === 'skill' ? '★ 新技能解锁 ★' : '★ 新勋章解锁 ★', S.W/2, cyMid - targetH/2 - 24);
      ctx.restore();
    }

    // 卡片本体
    var cw = targetW * scale, ch = targetH * scale;
    drawCard(cx - cw/2, cy - ch/2, cw, ch, card, alpha);
  }

  // ============ 卡片绘制 ============
  function drawCard(x, y, w, h, card, alpha) {
    var ctx = S.ctx;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    // ★ 图片本身已含金框/标题/星级/副标题，不再叠加外框与文字
    var r = Math.max(6, w * 0.04);
    var im = S.imgCache[card.img];
    if (im) {
      var iw = im.width, ih = im.height;
      var s = Math.min(w / iw, h / ih);
      var dw = iw * s, dh = ih * s;
      var dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      ctx.save();
      roundRect(ctx, x, y, w, h, r); ctx.clip();
      try { ctx.drawImage(im, dx, dy, dw, dh); } catch(e){}
      ctx.restore();
    } else {
      loadImg(card.img);
      ctx.fillStyle = '#1a1208';
      roundRect(ctx, x, y, w, h, r); ctx.fill();
      ctx.fillStyle = '#5a4a2a'; ctx.font = '400 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('加载中…', x + w/2, y + h/2);
    }

    ctx.restore();
  }

  function drawStars(ctx, cx, cy, filled, size) {
    var total = 5, gap = size * 0.35;
    var totalW = size * total + gap * (total - 1);
    var x0 = cx - totalW / 2 + size / 2;
    for (var i = 0; i < total; i++) {
      var x = x0 + i * (size + gap);
      drawStar(ctx, x, cy, size / 2, i < filled ? '#ffd76a' : 'rgba(255,255,255,.25)', i < filled);
    }
  }
  function drawStar(ctx, cx, cy, r, color, filled) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI/2 + i * Math.PI * 2 / 5;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      var a2 = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
    if (filled) { ctx.fillStyle = color; ctx.fill(); }
    else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // ============ v99.3 · Tab 按钮离屏缓存（修 iOS 抖动）============
  // 现象：iOS 真机选中态 Tab（渐变填充·无描边）边缘持续抖动；埋点证实 JS 参数每帧恒定。
  // 根因：iOS CoreGraphics 每帧重新光栅化渐变时 dither 相位变化；Android Skia / Chromium 无此行为。
  // 修法：按钮只在首次出现该几何/状态时离屏渲染一次，之后每帧 drawImage 确定性贴图。
  var _tabCache = {};
  function _getTabCache (w, h, active, label) {
    var dpr = 2;
    try {
      if (S.wx && S.wx.getSystemInfoSync) dpr = S.wx.getSystemInfoSync().pixelRatio || 2;
      else if (typeof window !== 'undefined' && window.devicePixelRatio) dpr = window.devicePixelRatio || 2;
    } catch (e) { }
    var key = dpr + '|' + (active ? 1 : 0) + '|' + w + 'x' + h + '|' + label;
    if (_tabCache[key]) return _tabCache[key];
    if (_tabCache[key] === false) return false;
    var c = null;
    try {
      if (S.wx && S.wx.createCanvas) c = S.wx.createCanvas();      // 小游戏：非首个 createCanvas → 离屏
      else if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
    } catch (e) { }
    if (!c || !c.getContext) { _tabCache[key] = false; return false; }
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var cc = c.getContext('2d');
    cc.scale(dpr, dpr);
    // 外观与原每帧绘制完全一致
    if (active) {
      var tg = cc.createLinearGradient(0, 0, 0, h);
      tg.addColorStop(0, '#f5c65a');
      tg.addColorStop(1, '#c89230');
      cc.fillStyle = tg;
      roundRect(cc, 0, 0, w, h, 8); cc.fill();
      cc.fillStyle = '#2a1a08';
    } else {
      cc.fillStyle = 'rgba(245,198,90,.10)';
      roundRect(cc, 0, 0, w, h, 8); cc.fill();
      cc.strokeStyle = 'rgba(245,198,90,.35)'; cc.lineWidth = 1;
      roundRect(cc, 0, 0, w, h, 8); cc.stroke();
      cc.fillStyle = '#c8b58a';
    }
    cc.font = '700 13px sans-serif';
    cc.textAlign = 'center'; cc.textBaseline = 'middle';
    cc.fillText(label, w / 2, h / 2 + 1);
    _tabCache[key] = c;
    return c;
  }

  // ============ 抽屉 ============
  function drawDrawer() {
    var ctx = S.ctx;
    var now = Date.now();
    var t = Math.min(1, (now - S.drawerT0) / 260);
    var e = 1 - Math.pow(1 - t, 3);

    // V31·4 · 全屏半透黑蒙层（点透关闭）
    ctx.save();
    // 强制清零 shadow（防止主渲染层的呼吸动画 shadowBlur 泄漏进来）
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * e) + ')';
    ctx.fillRect(0, 0, S.W, S.H);
    ctx.restore();

    // V31·4 · 抽屉主体：居中卡片式浮层（不再全屏，避免遮胶囊/爱心/原生关闭按钮）
    var pad = 20;
    var boxX = pad, boxY = 100;
    var boxW = S.W - pad * 2;
    var boxH = S.H - boxY - 90;
    // V31·6 · 暴露 box 供 onTouch 判断是否点击外部
    S._drawerBox = { x: boxX, y: boxY, w: boxW, h: boxH };

    ctx.save();
    ctx.globalAlpha = e;
    // 强制清零 shadow，防止主渲染层的呼吸动画 shadowBlur 泄漏导致 tab 视觉抖动
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // 浮层暖色暗底 + 金边（与游戏底色形成区分度）
    var bg = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    bg.addColorStop(0, '#2a1608');
    bg.addColorStop(1, '#180a04');
    ctx.fillStyle = bg;
    roundRect(ctx, boxX, boxY, boxW, boxH, 18); ctx.fill();
    // 金色外描边
    ctx.strokeStyle = 'rgba(245,198,90,.85)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 18); ctx.stroke();
    // 内层高光边
    ctx.strokeStyle = 'rgba(255,240,190,.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, boxX + 3, boxY + 3, boxW - 6, boxH - 6, 15); ctx.stroke();

    // 头部
    ctx.fillStyle = '#ffd76a';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('私 房 专 属', boxX + boxW / 2, boxY + 30);
    // V31·7 · 移除顶部 "已收集 X/Y"（与下面用户面板重复）

    // 关闭按钮 (× 在浮层右上角内侧，不冲突原生)
    var closeR = { x: boxX + boxW - 38, y: boxY + 10, w: 28, h: 28 };
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(closeR.x + 8, closeR.y + 8); ctx.lineTo(closeR.x + closeR.w - 8, closeR.y + closeR.h - 8);
    ctx.moveTo(closeR.x + closeR.w - 8, closeR.y + 8); ctx.lineTo(closeR.x + 8, closeR.y + closeR.h - 8);
    ctx.stroke();
    S.hits.push({ x: closeR.x - 4, y: closeR.y - 4, w: closeR.w + 8, h: closeR.h + 8, action: 'close' });

    // V31·9 · 清除缓存按钮（浮层左上角）
    var clrW = 72, clrH = 26;
    var clrX = boxX + 10, clrY = boxY + 12;
    ctx.fillStyle = 'rgba(255,80,80,.15)';
    roundRect(ctx, clrX, clrY, clrW, clrH, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,120,.75)';
    ctx.lineWidth = 1;
    roundRect(ctx, clrX, clrY, clrW, clrH, 13); ctx.stroke();
    // UI 包未提供垃圾桶切图，使用清晰的文字入口。
    ctx.fillStyle = '#ff9c9c'; ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('清除缓存', clrX + clrW/2, clrY + clrH/2 + 1);
    S.hits.push({ x: clrX - 4, y: clrY - 4, w: clrW + 8, h: clrH + 8, action: 'clear_cache' });

    // 统计
    var got = 0;
    for (var i = 0; i < CARDS.length; i++) if (S.unlocked[CARDS[i].id]) got++;
    ctx.fillStyle = '#c8b58a'; ctx.font = '500 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('已解锁 ' + got + ' / ' + CARDS.length + ' · 总进展', boxX + boxW / 2, boxY + 53);

    // ==== 固定顶部：用户面板 ====
    var tabY = boxY + 76;
    var userPanelH = 66;
    var upX = boxX + 14, upY = tabY - 6, upW = boxW - 28, upH = userPanelH;
    ctx.fillStyle = 'rgba(245,198,90,.08)';
    roundRect(ctx, upX, upY, upW, upH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(245,198,90,.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, upX, upY, upW, upH, 10); ctx.stroke();
    var avR = 22;
    var avCX = upX + 14 + avR;
    var avCY = upY + upH/2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    var userObj = S.getUser && S.getUser();
    if (userObj && userObj.avatarImg) {
      try { ctx.drawImage(userObj.avatarImg, avCX - avR, avCY - avR, avR*2, avR*2); } catch(e){}
    } else {
      var ag = ctx.createRadialGradient(avCX, avCY, 2, avCX, avCY, avR);
      ag.addColorStop(0, '#4a3820'); ag.addColorStop(1, '#1a0f04');
      ctx.fillStyle = ag;
      ctx.fillRect(avCX - avR, avCY - avR, avR*2, avR*2);
      ctx.fillStyle = '#ffd76a';
      ctx.font = '700 18px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👤', avCX, avCY + 1);
    }
    ctx.restore();
    ctx.strokeStyle = '#f5c65a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI*2); ctx.stroke();

    // V31·7 · 昵称容错：logging=true 且已超 6s 兜底为默认名（实际主流程用 setTimeout 兜底了；这里再守一次）
    var nick;
    if (userObj && userObj.nickName) nick = userObj.nickName;
    else if (userObj && userObj.logging) nick = '登录中…';
    else nick = '点击同步昵称与头像';
    ctx.fillStyle = '#ffe9a5';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // V84 · 昵称超宽则截断打点
    var _nickMaxW = upX + upW - (avCX + avR + 12) - 10;
    var _nick = nick;
    if (ctx.measureText(_nick).width > _nickMaxW) {
      while (_nick.length > 1 && ctx.measureText(_nick + '…').width > _nickMaxW) {
        _nick = _nick.slice(0, -1);
      }
      _nick = _nick + '…';
    }
    ctx.fillText(_nick, avCX + avR + 12, upY + 26);
    S.avatarRect = { x: avCX - avR - 6, y: avCY - avR - 6, w: avR * 2 + 12, h: avR * 2 + 12 };
    // 未登录时点击用户面板触发登录；已登录时头像仍保留长按后门命中区。
    if (!userObj || !userObj.nickName) S.hits.push({ x: upX, y: upY, w: upW, h: upH, action: 'user_profile' });
    var playMin = 0;
    try {
      var t0 = (S.getPlayT0 && S.getPlayT0()) || 0;
      if (t0) playMin = Math.max(1, Math.floor((Date.now() - t0) / 60000));
    } catch(e){}
    // V31·10 · 统计信息：「累计游玩 X 分钟 · 失败 N 次」（BE = 失败，真实计数，本地持久化）
    var beCount = 0;
    try { beCount = (S.getBeCount && S.getBeCount()) || 0; } catch(e){}
    ctx.fillStyle = '#c8b58a';
    ctx.font = '500 12px sans-serif';
    ctx.fillText('累计游玩 ' + playMin + ' 分钟 · 失败 ' + beCount + ' 次', avCX + avR + 12, upY + 46);

    // ==== V31·7 · Tab 切换：勋章 / 技能 ====
    // v99.1 · 修复 iOS 真机 tab 尺寸抖动：tabW=(boxW-28)/2 在 windowWidth=393 等机型为
    //   162.5 → 右边缘落在半物理像素(580.5)上；iOS Canvas 对渐变半像素边缘做有序抖动(dither)，
    //   逐帧重绘时网格相位变化 → 选中态渐变按钮边缘持续抖动。Android Skia / 桌面 Chromium 无此行为。
    //   修法：每个 tab 的 x/宽度量化到整数像素（逐段取整，不整除时相邻 tab 各让半像素）。
    if (S.activeTab == null) S.activeTab = 'medal';
    var tabBarY = upY + userPanelH + 8;
    var tabBarH = 34;
    var tabs = [
      { key: 'medal', label: '图鉴', iconKey: 'medal' },
      { key: 'skill', label: '技能', iconKey: 'skill' }
    ];
    var _tabAreaX = boxX + 14;
    var _tabAreaW = boxW - 28;
    for (var ti = 0; ti < tabs.length; ti++) {
      var tabX = Math.round(_tabAreaX + _tabAreaW * ti / tabs.length);
      var tabW = Math.round(_tabAreaX + _tabAreaW * (ti + 1) / tabs.length) - tabX;
      var isActive = S.activeTab === tabs[ti].key;
      // v99.3 · 优先用离屏缓存贴图（iOS 每帧重光栅化渐变会抖），失败才走原逐帧绘制
      var _tc = _getTabCache(tabW - 6, tabBarH, isActive, tabs[ti].label);
      if (_tc) {
        ctx.drawImage(_tc, tabX + 3, tabBarY, tabW - 6, tabBarH);
      } else if (isActive) {
        var tg = ctx.createLinearGradient(tabX, tabBarY, tabX, tabBarY + tabBarH);
        tg.addColorStop(0, '#f5c65a');
        tg.addColorStop(1, '#c89230');
        ctx.fillStyle = tg;
        roundRect(ctx, tabX + 3, tabBarY, tabW - 6, tabBarH, 8); ctx.fill();
        ctx.fillStyle = '#2a1a08';
      } else {
        ctx.fillStyle = 'rgba(245,198,90,.10)';
        roundRect(ctx, tabX + 3, tabBarY, tabW - 6, tabBarH, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(245,198,90,.35)'; ctx.lineWidth = 1;
        roundRect(ctx, tabX + 3, tabBarY, tabW - 6, tabBarH, 8); ctx.stroke();
        ctx.fillStyle = '#c8b58a';
      }
      if (!_tc) {
        // 缓存图里已含文字，只在走逐帧绘制 fallback 时才画
        ctx.font = '700 13px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // V84 · tab 纯文字，不用图标（异步加载图标会导致布局抖动）
        ctx.fillText(tabs[ti].label, tabX + tabW / 2, tabBarY + tabBarH / 2 + 1);
      }
      S.hits.push({ x: tabX, y: tabBarY, w: tabW, h: tabBarH, action: 'tab:' + tabs[ti].key });
    }
    ctx.textBaseline = 'alphabetic';

    // ==== 可滚动内容区（clip） ====
    var contentTopY = tabBarY + tabBarH + 10;
    var contentBottomY = boxY + boxH - 12;
    var viewH = contentBottomY - contentTopY;

    // 3 列网格
    var cols = 3;
    var gridPad = boxX + 14;
    var gap = 8;
    var cw = (boxW - 28 - gap * (cols - 1)) / cols;
    var ch = cw * 4 / 3;

    // V31·7 · 只显示当前 tab
    var activeList = CARDS.filter(function (c) { return c.kind === S.activeTab; });
    var rows = Math.ceil(activeList.length / cols);
    var contentH = rows * (ch + gap) - gap + 12;

    S._contentH = contentH;
    S._viewH = viewH;
    var maxScroll = Math.max(0, contentH - viewH);
    if (S.drawerScrollY > maxScroll) S.drawerScrollY = maxScroll;
    if (S.drawerScrollY < 0) S.drawerScrollY = 0;

    // clip 到可见区
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX + 6, contentTopY - 2, boxW - 12, viewH + 4);
    ctx.clip();

    var scrollOff = S.drawerScrollY;
    var yCursor = contentTopY - scrollOff;
    drawGrid(activeList, gridPad, yCursor, cw, ch, gap, cols, 1, contentTopY, contentBottomY);

    ctx.restore();

    // 滚动条（如果内容超出）
    if (maxScroll > 0) {
      var trackX = boxX + boxW - 6;
      var trackY = contentTopY;
      var trackH = viewH;
      var thumbH = Math.max(28, trackH * viewH / contentH);
      var thumbY = trackY + (trackH - thumbH) * (S.drawerScrollY / maxScroll);
      ctx.fillStyle = 'rgba(245,198,90,.45)';
      roundRect(ctx, trackX, thumbY, 3, thumbH, 1.5); ctx.fill();
    }
    ctx.restore();
  }

  function drawGrid(list, padX, startY, cw, ch, gap, cols, alpha, clipTop, clipBot) {
    for (var i = 0; i < list.length; i++) {
      var card = list[i];
      var col = i % cols, row = Math.floor(i / cols);
      var x = padX + col * (cw + gap);
      var y = startY + row * (ch + gap);
      // V31·6 · 完全在 clip 区外的跳过（省性能 + 避免命中区飘到用户面板上）
      if (clipBot != null && y > clipBot) continue;
      if (clipTop != null && y + ch < clipTop) continue;
      var unlocked = !!S.unlocked[card.id];
      drawCard(x, y, cw, ch, card, alpha);
      if (!unlocked) {
        // 灰色蒙层 + ?
        S.ctx.save();
        S.ctx.globalAlpha = alpha;
        S.ctx.fillStyle = 'rgba(0,0,0,.72)';
        roundRect(S.ctx, x, y, cw, ch, Math.max(6, cw*0.04)); S.ctx.fill();
        S.ctx.fillStyle = '#8b7c60';
        S.ctx.font = '900 ' + Math.floor(cw * 0.5) + 'px sans-serif';
        S.ctx.textAlign = 'center'; S.ctx.textBaseline = 'middle';
        S.ctx.fillText('?', x + cw/2, y + ch/2);
        S.ctx.restore();
      }
      // V31·6 · 只在完全可见时注册命中区，避免滚动时点到"看不见"的卡
      var visYTop = clipTop == null ? -Infinity : clipTop;
      var visYBot = clipBot == null ? Infinity : clipBot;
      if (y >= visYTop - 2 && y + ch <= visYBot + 2) {
        S.hits.push({ x: x, y: y, w: cw, h: ch, action: 'card:' + card.id });
      }
    }
  }

  // ============ 详情 ============
  function drawDetail() {
    var ctx = S.ctx;
    var card = CARD_MAP[S.detailId];
    if (!card) { S.detailId = null; return; }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.92)';
    ctx.fillRect(0, 0, S.W, S.H);

    var w = Math.min(320, S.W - 40);
    var h = w * 4 / 3;
    var x = (S.W - w) / 2, y = (S.H - h) / 2 - 30;
    drawCard(x, y, w, h, card, 1);

    // 底部详细描述
    ctx.fillStyle = '#e8d8b0';
    ctx.font = '400 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((card.kind === 'skill' ? '技能 · ' : '图鉴 · ') + card.name, S.W/2, y + h + 28);
    ctx.fillStyle = S.unlocked[card.id] ? '#9fdb87' : '#a89c86';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(S.unlocked[card.id] ? '已解锁' : '尚未解锁', S.W/2, y + h + 43);
    ctx.fillStyle = '#c8b58a';
    ctx.font = '400 12px sans-serif';
    ctx.fillText(card.sub || '剧情收集卡', S.W/2, y + h + 60);
    var jumpY = S.H - 92, jumpW = Math.min(280, S.W - 56), jumpH = 42, jumpX = (S.W - jumpW) / 2;
    var mapped = !!(card.jump && card.jump.ep);
    ctx.fillStyle = mapped ? '#d5aa55' : 'rgba(160,145,115,.35)';
    roundRect(ctx, jumpX, jumpY, jumpW, jumpH, 21); ctx.fill();
    ctx.strokeStyle = mapped ? '#ffe7a4' : 'rgba(200,190,165,.35)'; ctx.lineWidth = 1.2; roundRect(ctx, jumpX, jumpY, jumpW, jumpH, 21); ctx.stroke();
    ctx.fillStyle = mapped ? '#3d260f' : '#958a76'; ctx.font = '700 15px sans-serif';
    ctx.fillText(mapped ? '看广告 · 直通该章' : '不可直达，请探索解锁', S.W/2, jumpY + 27);
    S.hits.push({ x: jumpX - 4, y: jumpY - 4, w: jumpW + 8, h: jumpH + 8, action: 'detail_jump' });

    // "点击任意处关闭"
    ctx.fillStyle = '#8b7c60';
    ctx.font = '400 11px sans-serif';
    ctx.fillText('轻触空白处关闭', S.W/2, S.H - 38);
    ctx.restore();
  }

  // ============ Toast ============
  function drawToast() {
    if (!S.toast) return;
    var now = Date.now();
    var life = now - S.toast.t0;
    if (life > 2000) { S.toast = null; return; }
    var alpha = life < 300 ? life / 300 : (life > 1700 ? (2000 - life) / 300 : 1);
    var ctx = S.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    var w = ctx.measureText(S.toast.text).width + 32;
    var x = (S.W - w) / 2, y = 120;
    roundRect(ctx, x, y, w, 34, 17); ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(S.toast.text, S.W/2, y + 17);
    ctx.restore();
  }

  // ============ 导出 ============
  global.Achievements = {
    CARDS: CARDS,
    getProgress: function () {
      var got = 0;
      CARDS.forEach(function (c) { if (S.unlocked[c.id]) got++; });
      return { unlocked: got, total: CARDS.length };
    },
    init: init,
    unlock: unlock,
    showUnlockPopup: showUnlockPopup,
    draw: draw,
    drawEntryOnly: drawEntryOnly,
    drawOverlaysOnly: drawOverlaysOnly,
    drawPopupOnly: function(){
      if (!S.ready) return;
      S.hits = [];  // 每帧清空
      if (S.popup) drawPopup();
      if (S.toast) drawToast();
    },
    onTouch: onTouch,
    // v92.1 · 由 main.js 每帧同步「入口胶囊是否真的被画出来」。
    //   visible=false 时顺手清空 S.hits，防止残留上一帧的 entry 热区。
    setEntryVisible: function (v) {
      S._entryVisible = !!v;
      if (!v && !S.drawerOpen && !S.detailId) S.hits = [];
    },
    getEntryRect: getEntryRect,
    onTouchStart: onTouchStart,
    onTouchMove: onTouchMove,
    onTouchEnd: onTouchEnd,
    // 调试
    _debugState: function(){ return S; },
    reset: function(){ S.unlocked = {}; saveUnlocked(); console.log('[achv] reset'); }
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : this);
