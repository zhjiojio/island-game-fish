/**
 * scene-profile.js — 个人信息面板
 *
 * 点击大厅头像后弹出，包含三个 Tab：
 *   0 - 成就：头像/昵称/总局/胜率/连胜 + 成就卡片网格
 *   1 - 语音包：语音包卡片（复用 SceneVoice 数据）
 *   2 - 设置：游戏音效/音乐/震动开关（配置应用走 SceneSettings.applyConfig）
 *
 * 渲染层：直接调用 M3.Render WebGL 接口
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ── 资源（设计稿切图 3x，subpackages/popup/asset/image/popup/profile/）────────────────
  var AM = M3.AssetManager;
  var GROUP = 'popup:profile';
  var RES = {
    tabBar: ['profile-tab-bar', 'subpackages/popup/asset/image/popup/profile/profile-tab-bar.png'],
    tabActive: ['profile-tab-active', 'subpackages/popup/asset/image/popup/profile/profile-tab-active.png'],
    tabLine: ['profile-tab-line', 'subpackages/popup/asset/image/popup/profile/profile-tab-line.png'],
    contentBg: ['profile-content-bg', 'subpackages/popup/asset/image/popup/profile/profile-content-bg.png'],
    topbar: ['profile-topbar', 'subpackages/popup/asset/image/popup/profile/profile-topbar.png'],
    sep: ['profile-sep', 'subpackages/popup/asset/image/popup/profile/profile-sep.png'],
    cardBg: ['ach-card-bg', 'subpackages/popup/asset/image/popup/profile/ach-card-bg.png'],
    closeBtn: ['close-btn', 'subpackages/popup/asset/image/popup/profile/close-btn.png'],
    toggleBgOn: ['toggle-bg-on', 'subpackages/popup/asset/image/popup/profile/toggle-bg-on.png'],
    toggleBgOff: ['toggle-bg-off', 'subpackages/popup/asset/image/popup/profile/toggle-bg-off.png'],
    toggleKnobOn: ['toggle-knob-on', 'subpackages/popup/asset/image/popup/profile/toggle-knob-on.png'],
    toggleKnobOff: ['toggle-knob-off', 'subpackages/popup/asset/image/popup/profile/toggle-knob-off.png'],
    voiceDeco: ['voice-deco', 'subpackages/popup/asset/image/popup/profile/voice-deco.png'],
    voiceBtn: ['voice-default-btn', 'subpackages/popup/asset/image/popup/profile/voice-default-btn.png'],
    voiceCardFrame: ['voice-card-frame', 'subpackages/popup/asset/image/popup/profile/voice-card-frame.png'],
    voiceCardFrameSel: ['voice-card-frame-sel', 'subpackages/popup/asset/image/popup/profile/voice-card-frame-sel.png'],
    voiceBtnPlay: ['voice-btn-play', 'subpackages/popup/asset/image/popup/profile/voice-btn-play.png'],
    voiceBtnPause: ['voice-btn-pause', 'subpackages/popup/asset/image/popup/profile/voice-btn-pause.png'],
    beanPrice: ['bean-price', 'subpackages/popup/asset/image/popup/profile/bean-price.png'],
    achSpring: ['ach-spring', 'subpackages/popup/asset/image/popup/profile/ach-spring.png'],
    achBomb: ['ach-bomb', 'subpackages/popup/asset/image/popup/profile/ach-bomb.png'],
    achStreak: ['ach-streak', 'subpackages/popup/asset/image/popup/profile/ach-streak.png'],
    achMulti: ['ach-multi', 'subpackages/popup/asset/image/popup/profile/ach-multi.png'],
    avatarBorder: ['img-border', 'asset/image/common/icon/img-border.png'],
  };
  function ensureAssets () {
    if (!AM) return;
    for (var k in RES) {
      if (RES.hasOwnProperty(k) && !AM.loaded(RES[k][0])) {
        AM.acquire('image', RES[k][0], RES[k][1], GROUP);
      }
    }
  }
  function releaseAssets () {
    if (AM && AM.releaseGroup) AM.releaseGroup(GROUP);
  }
  function drawRes (key, x, y, w, h) {
    var rd = r();
    if (!AM || !AM.loaded(RES[key][0])) return false;
    rd.glDrawImage(AM.get(RES[key][0]), x, y, w, h);
    return true;
  }

  // ── 常量 ─────────────────────────────────────────────────────
  // 面板尺寸（基于 Figma 设计稿 552×289，按屏幕宽度缩放）
  var PANEL_W_BASE = 552;
  var PANEL_H_BASE = 289;
  var TAB_W = 90;   // 左侧 Tab 栏宽度

  // 颜色
  var COL_BG_LEFT = '#2E4A8A';    // 深蓝，参考设计稿左侧背景
  var COL_TITLE_BG = '#7CB1FA';   // 渐变标题区用纯色近似
  var COL_TITLE_TEXT = '#213372';
  var COL_TAB_ACTIVE_TEXT = '#5D3303';
  var COL_TAB_NORMAL_TEXT = '#F8F8FB';
  var COL_STAT_TEXT = 'rgba(33,51,114,0.698)';
  var COL_NICK_TEXT = '#213372';
  var COL_CARD_BORDER = '#C8DFF9';
  var COL_TOGGLE_OFF = '#8A92A6';
  var COL_TOGGLE_TEXT_ON = '#5D3303';
  var COL_TOGGLE_TEXT_OFF = '#FFFFFF';
  var COL_SEPARATOR = '#C8DFF9';

  // ── 状态 ─────────────────────────────────────────────────────
  var _visible = false;
  var _tab = 0;   // 0:成就  1:设置
  var _panel = null;  // 面板矩形（用于点外关闭判断）
  var _drag = null;
  var _scroll = 0;
  var _listenPackId = '';    // 当前试听中的语音包（空=未播放）
  var _previewPackId = '';   // 右侧详情区展示的包（空=跟随当前使用的包）
  // 停止语音包试听并复位预览（面板关闭/切 Tab 时调用）
  function stopPreview () {
    if (_listenPackId && typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.stopVoice) {
      KwaiMedia.Audio.stopVoice();
    }
    _listenPackId = '';
    _previewPackId = '';
  }
  var _maxScroll = 0;

  // 头像圆形裁剪（复用 scene-home 逻辑）
  var _avatarClip = {};
  function _clipAvatarCanvas (url, img, D) {
    if (!img || !(img.width > 0) || D < 4) return null;
    // 抗糊：离屏 canvas 按「物理像素」建（D×dpr，上限源图分辨率），
    // glDrawImage 按逻辑尺寸 D 绘制，纹理像素密度跟上屏幕 → 高分屏不糊
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
    var srcW = img.naturalWidth || img.width || 0;
    var D2 = Math.round(D * dpr);
    if (srcW > 0 && D2 > srcW) D2 = srcW;   // 超过源图分辨率无意义
    if (D2 < D) D2 = D;
    var ckey = url + '|' + D2;
    var clip = _avatarClip[ckey];
    if (!clip) {
      var cvs;
      if (typeof ks !== 'undefined' && ks.createCanvas) cvs = ks.createCanvas();
      else if (typeof wx !== 'undefined' && wx.createCanvas) cvs = wx.createCanvas();
      else cvs = document.createElement('canvas');
      cvs.width = D2; cvs.height = D2;
      clip = { cvs: cvs, ctx: cvs.getContext('2d'), drawnW: 0 };
      _avatarClip[ckey] = clip;
    }
    if (clip.drawnW !== img.width) {
      var c = clip.ctx;
      c.clearRect(0, 0, D2, D2);
      c.save();
      c.beginPath();
      c.arc(D2 / 2, D2 / 2, D2 / 2, 0, Math.PI * 2);
      c.closePath();
      c.clip();
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var scale = Math.max(D2 / iw, D2 / ih);
      var dw = iw * scale, dh = ih * scale;
      c.drawImage(img, (D2 - dw) / 2, (D2 - dh) / 2, dw, dh);
      c.restore();
      clip.drawnW = img.width;
    }
    return clip.cvs;
  }

  // 图片缓存（网络图片）
  var _imgCache = {};
  function getNetImg (url) {
    if (!url) return null;
    var img = _imgCache[url];
    if (!img) {
      try {
        // 快手端必须用 ks.createImage（沙盒内无全局 Image）；微信端 wx.createImage
        if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
        else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
        else {
          img = new Image();
          // Web 端必须带 crossOrigin，否则画到 canvas 后被污染，WebGL 纹理上传失败
          img.crossOrigin = 'anonymous';
          img.onerror = function () {
            // 个别 CDN 无 CORS 头时：去掉 crossOrigin 重新加载
            img.onerror = null;
            img.crossOrigin = null;
            img.src = url;
          };
        }
      } catch (e) {
        try { img = new Image(); } catch (e2) { return null; }
      }
      img.src = url; _imgCache[url] = img;
    }
    return img;
  }

  // 图片是否加载完成（Web Image: complete+naturalWidth；小游戏 Image: 无这两个属性，用 width>0）
  function imgLoaded (img) {
    if (!img) return false;
    return (img.complete === undefined || img.complete) && (img.naturalWidth || img.width || 0) > 0;
  }

  function r () { return M3.Render; }

  // ── 成就数据（服务端权威：getProfileStats 拉取，结算时服务端记录）──
  var _stats = { springCount: 0, bombCount: 0, maxMultiplier: 0, totalBeansEarned: 0 };
  var _statsRequested = false;   // 防抖：面板打开期间只拉一次，回包后重置

  function requestStats () {
    if (_statsRequested) return;
    _statsRequested = true;
    // HTTP 路径（无需 WebSocket auth）
    if (M3.GameHttp) {
      M3.GameHttp.profile().then(function (data) {
        updateStats(data);
      }).catch(function (err) {
        _statsRequested = false;
        console.warn('[SceneProfile] profile request failed:', err && err.message);
      });
      return;
    }
    // WebSocket 降级
    if (!M3.Network || !M3.Network.send) { _statsRequested = false; return; }
    var payload = {};
    if (M3.Game && M3.Game.getUser) {
      var u = M3.Game.getUser() || {};
      payload.nickname = u.nickname || '玩家';
    }
    if (M3.Network.ensureSocket) M3.Network.ensureSocket(payload.nickname || '玩家');
    M3.Network.send('getProfileStats', payload);
    // 兜底：8s 解除防抖（网络异常时下次打开还能再拉）
    setTimeout(function () { _statsRequested = false; }, 8000);
  }

  // 服务端回包 { springCount, bombCount, maxMultiplier, totalBeansEarned,
  //             totalGames, totalWins, winRate, maxStreak }
  function updateStats (data) {
    if (!data) return;
    _statsRequested = false;
    _stats = {
      springCount: Number(data.springCount || 0),
      bombCount: Number(data.bombCount || 0),
      maxMultiplier: Number(data.maxMultiplier || 0),
      totalBeansEarned: Number(data.totalBeansEarned || 0),
      totalGames: Number(data.totalGames || 0),
      totalWins: Number(data.totalWins || 0),
      winRate: Number(data.winRate || 0),
      maxStreak: Number(data.maxStreak || 0),
    };
  }

  // ── 成就卡片定义 ─────────────────────────────────────────────
  // 服务端 player_stats 记录：春天/炸弹/最高倍 + wallets.total_earned（总豆数）
  var ACHIEVEMENTS = [
    { id: 'spring', label: '春天', resKey: 'achSpring', getCount: function () { return _stats.springCount || 0; } },
    { id: 'bomb', label: '炸弹', resKey: 'achBomb', getCount: function () { return _stats.bombCount || 0; } },
    { id: 'multi', label: '最高倍', resKey: 'achMulti', getCount: function () { return _stats.maxMultiplier || 0; } },
    { id: 'beans', label: '总豆数', resKey: 'achStreak', getCount: function () { return M3.Game.formatBeans(_stats.totalBeansEarned || 0); } },
  ];

  // ── 设置数据（存储读写与 scene-settings.js 同路径：KwaiStorage 优先，H5 回退 localStorage）──
  var SET_KEYS = {
    bgmEnabled: 'ddz_bgm_enabled',
    sfxEnabled: 'ddz_sfx_enabled',
    vibEnabled: 'ddz_vib_enabled',
  };

  function readStorage (key) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) return KwaiStorage.getSync(key);
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch (e) { }
    return null;
  }
  function writeStorage (key, value) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) KwaiStorage.setSync(key, value);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (e) { }
  }

  function getToggleState (key) {
    var v = readStorage(SET_KEYS[key]);
    if (v == null || v === '') return true;  // 默认开
    return !!(+v);
  }
  function setToggleState (key, val) {
    writeStorage(SET_KEYS[key], val ? '1' : '0');
    // 音频开关（bgm/sfx）走 setToggle 同步内存配置并立即应用到音频引擎；
    // 震动开关写入存储后刷新 VibrateManager 缓存（不再每次震动读存储）
    if (M3.SceneSettings && M3.SceneSettings.setToggle) M3.SceneSettings.setToggle(key, val);
    if (M3.Vibrate && M3.Vibrate.refresh) M3.Vibrate.refresh();
  }

  // ── 工具函数 ─────────────────────────────────────────────────
  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  function clamp (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 模拟渐变填充（用两段矩形近似线性渐变）

  // ── 面板参数计算 ──────────────────────────────────────────────
  function calcPanel (W, H) {
    var scale = Math.min(1, (W * 0.9) / PANEL_W_BASE, (H * 0.85) / PANEL_H_BASE);
    var pw = Math.round(PANEL_W_BASE * scale);
    var ph = Math.round(PANEL_H_BASE * scale);
    var px = Math.round((W - pw) / 2);
    var py = Math.round((H - ph) / 2);
    var tabW = Math.round(TAB_W * scale);
    return { px: px, py: py, pw: pw, ph: ph, scale: scale, tabW: tabW };
  }

  // ── 绘制 Tab 按钮 ─────────────────────────────────────────────
  // 设计稿：Tab 栏 (2,0) 88×289（合并切图 profile-tab-bar 含渐变+纹理+边框）；
  // Tab 组 (0,24) 三个 90×43 间隔 4；选中态切图 profile-tab-active（94×44 含出血）
  function drawTabs (rd, hb, p) {
    var tabW = p.tabW, ph = p.ph, px = p.px, py = p.py;
    var scale = p.scale;
    var tabH = Math.round(43 * scale);
    var tabGap = Math.round(4 * scale);
    var tabsStartY = py + Math.round(24 * scale);

    var TABS = ['成就', '设置'];

    // Tab 栏完整背景（渐变+菱形纹理+圆角边框，一张切图）
    drawRes('tabBar', px + Math.round(2 * scale), py, Math.round(88 * scale), ph);

    for (var i = 0; i < TABS.length; i++) {
      var ty = tabsStartY + i * (tabH + tabGap);
      var isActive = (_tab === i);

      var _tp = M3.Render.beginPressScale('profile_tab_' + i, px + tabW / 2, ty + tabH / 2, 0.95);
      if (isActive) {
        // 选中：金色渐变按钮切图（94×44 含 2px 出血，画在 90×43 区域；切图自带底部白线）
        drawRes('tabActive', px - Math.round(2 * scale), ty, Math.round(94 * scale), Math.round(44 * scale));
        rd.glFillText(TABS[i], px + tabW / 2, ty + tabH / 2,
          '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TAB_ACTIVE_TEXT, 'center', 'middle');
      } else {
        // 未选中：透明背景 + 底部分隔线切图（Group 76，90×43 画布与 Tab 区域重合）
        drawRes('tabLine', px, ty, tabW, tabH);
        rd.glFillText(TABS[i], px + tabW / 2, ty + tabH / 2,
          '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TAB_NORMAL_TEXT, 'center', 'middle');
      }
      M3.Render.endPressScale(_tp);

      ; (function (idx) {
        pushBtn(hb, px, ty, tabW, tabH, 'profile_tab_' + idx, function () {
          _tab = idx;
          _scroll = 0;
        });
      })(i);
    }
  }

  // ── 绘制右侧内容区头部 ────────────────────────────────────────
  // 设计稿：内容区 (90,0) 462×289 白底圆角(0,12,12,0) 切图；
  // 顶部渐变条 (0,0) 343×49 切图；标题 (12,13) 16px；关闭 (506,10) 36×36 切图
  function drawContentHeader (rd, hb, p) {
    var px = p.px, py = p.py, pw = p.pw, ph = p.ph, scale = p.scale;
    var tabW = p.tabW;
    var contentX = px + tabW;
    var contentW = pw - tabW;

    // 右侧内容区背景（白底+右侧圆角，切图）
    drawRes('contentBg', contentX, py, contentW, ph);

    // 顶部标题渐变条（343×49，切图）
    var titleBarW = Math.round(343 * scale);
    var titleBarH = Math.round(49 * scale);
    drawRes('topbar', contentX, py, titleBarW, titleBarH);

    // 标题文字
    var TITLE_TEXTS = ['个人成就', '设置'];
    var titleText = TITLE_TEXTS[_tab];
    rd.glFillText(titleText,
      contentX + Math.round(12 * scale),
      py + Math.round(13 * scale) + Math.round(16 * scale * 0.6),
      '600 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif',
      COL_TITLE_TEXT, 'left', 'middle');

    // 关闭按钮（右上角，切图）
    var closeSz = Math.round(36 * scale);
    var closeX = px + pw - closeSz - Math.round(10 * scale);
    var closeY = py + Math.round(10 * scale);
    var _cp = M3.Render.beginPressScale('profile_close', closeX + closeSz / 2, closeY + closeSz / 2);
    drawRes('closeBtn', closeX, closeY, closeSz, closeSz);
    M3.Render.endPressScale(_cp);
    pushBtn(hb, closeX, closeY, closeSz, closeSz, 'profile_close', function () {
      _visible = false;
      stopPreview();
    });

    return { contentX: contentX, contentW: contentW, titleBarH: titleBarH };
  }

  // ── Tab 0：成就 ───────────────────────────────────────────────
  // 设计稿绝对坐标（面板 552×289 基准）：
  //   用户信息 (114,68) 308×50；分隔线 (104,134) 438×5；
  //   成就卡片 ×4 (114/219/324/429,151) 97×113，图标 50×50 @ 卡片(24,13)，
  //   文字组 (9,63)：名称 12px + 次数 16px，居中
  function drawTabAchievement (rd, hb, p, header) {
    var px = p.px, py = p.py, scale = p.scale;

    var user = M3.Game.getUser ? M3.Game.getUser() : null;
    var nick = (user && user.nickname) ? user.nickname : '玩家';
    var url = (user && user.avatarUrl) ? user.avatarUrl : '';

    // ── 用户信息 (114,68)：头像 50×50 + 右侧文字列 ──
    var infoX = px + Math.round(114 * scale);
    var infoY = py + Math.round(68 * scale);
    var avD = Math.round(50 * scale);
    var avR = avD / 2;
    var avCx = infoX + avR;
    var avCy = infoY + avR;

    var drawnAv = false;
    if (url) {
      var avImg = getNetImg(url);
      if (imgLoaded(avImg)) {
        var clipCvs = _clipAvatarCanvas(url, avImg, avD);
        if (clipCvs) {
          rd.glDrawImage(clipCvs, avCx - avR, avCy - avR, avD, avD);
          drawnAv = true;
        }
      }
    }
    if (!drawnAv) {
      rd.beginPath(); rd.arc(avCx, avCy, avR, 0, Math.PI * 2);
      rd.fill('#5b21b6');
      rd.glFillText(nick.charAt(0), avCx, avCy,
        '700 ' + Math.round(avR * 0.72) + 'px sans-serif', '#fff', 'center', 'middle');
    }
    // 头像框（与主页一致）
    if (AM && AM.loaded('img-border')) {
      var bd = AM.get('img-border');
      var bdRatio = (bd.naturalWidth && bd.naturalHeight) ? (bd.naturalWidth / bd.naturalHeight) : 1;
      var bdH = avD * 1.06, bdW = bdH * bdRatio;
      rd.glDrawImage(bd, avCx - bdW / 2, avCy - bdH / 2, bdW, bdH);
    } else {
      rd.beginPath(); rd.arc(avCx, avCy, avR + Math.round(2 * scale), 0, Math.PI * 2);
      rd.stroke('rgba(255,255,255,0.5)', Math.round(2 * scale));
    }

    // 昵称（头像右侧，gap 8）
    var nameX = infoX + avD + Math.round(8 * scale);
    var nameY = infoY + Math.round(10 * scale);
    rd.glFillText(nick, nameX, nameY,
      '500 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
      COL_NICK_TEXT, 'left', 'middle');

    // 统计行（服务端数据，昵称下方，gap 16）：总对局 / 总胜率 / 最高连胜
    var statItems = [
      '总对局：' + (_stats.totalGames || 0),
      '总胜率：' + (_stats.winRate || 0) + '%',
      '最高连胜：' + (_stats.maxStreak || 0),
    ];
    var statX = nameX;
    var statY = infoY + Math.round(34 * scale);
    for (var s = 0; s < statItems.length; s++) {
      var sw = rd.glMeasureText ? rd.glMeasureText(statItems[s],
        '400 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif') : Math.round(65 * scale);
      rd.glFillText(statItems[s], statX, statY,
        '400 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
        COL_STAT_TEXT, 'left', 'middle');
      statX += sw + Math.round(16 * scale);
    }

    // ── 分隔线 420 宽（中心保持 x=323 不变），高按新切图 1266x3 等比（≈1px）──
    var sepX = px + Math.round(113 * scale);
    var sepY = py + Math.round(134 * scale);
    var sepW = Math.round(420 * scale);
    drawRes('sep', sepX, sepY, sepW, Math.max(1, Math.round(sepW * 3 / 1266)));

    // ── 成就卡片 ×4：x=114/219/324/429（间隔 105），y=151 ──
    var cardW = Math.round(97 * scale);
    var cardH = Math.round(113 * scale);
    var cardXs = [114, 219, 324, 429];
    var cardsY = py + Math.round(151 * scale);

    for (var ci = 0; ci < ACHIEVEMENTS.length && ci < 4; ci++) {
      var ach = ACHIEVEMENTS[ci];
      var cx = px + Math.round(cardXs[ci] * scale);
      var cy = cardsY;

      // 卡片背景（渐变+边框圆角，切图）
      drawRes('cardBg', cx, cy, cardW, cardH);

      var cnt = ach.getCount();

      // 图标切图 50×50 @ 卡片(24,13)
      var iconSz = Math.round(50 * scale);
      var iconX = cx + Math.round(24 * scale);
      var iconY = cy + Math.round(13 * scale);
      drawRes(ach.resKey, iconX, iconY, iconSz, iconSz);

      // 文字组 @ 卡片(9,63)：名称 12px + 数值 16px（居中，紧凑排列）
      var textX = cx + Math.round(9 * scale);
      var textW = Math.round(79 * scale);
      var labelY = cy + Math.round(63 * scale) + Math.round(6 * scale);
      rd.glFillText(ach.label, textX + textW / 2, labelY,
        '400 ' + Math.round(12 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');

      var cntY = cy + Math.round(63 * scale) + Math.round(26 * scale);
      var cntText = (ach.id === 'multi') ? ('×' + cnt) : ('×' + cnt);
      rd.glFillText(cntText, textX + textW / 2, cntY,
        '600 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');
    }
  }

  // ── Tab 1：语音包 ─────────────────────────────────────────────
  // 交互模型：左侧卡片点击 = 仅选中预览（金边高亮 + 右侧详情切换）；
  // 右侧详情区展示预览包的头像/昵称/状态 + 试听按钮 + 主按钮（使用/兑换）。
  // 卡片 99×136 两列（Frame 100 @102,60，间距 6）；详情区：头像 (368,54) 109×109、
  // 试听 (486,58) 32×32、昵称/状态居中 x=423（y≈183/205）、主按钮 (371,223) 104×36
  function drawTabVoice (rd, hb, p, header) {
    var px = p.px, py = p.py, ph = p.ph, pw = p.pw, scale = p.scale;
    var contentX = header.contentX, contentW = header.contentW;

    // 判断语音包模块是否可用
    var voiceAvail = M3.SceneVoice && M3.SceneVoice.isAvailable && M3.SceneVoice.isAvailable();

    // 检查当前选中语音包
    var selectedPackId = '';
    if (M3.SceneVoice && M3.SceneVoice._getSelectedPackId) {
      selectedPackId = M3.SceneVoice._getSelectedPackId();
    }

    // 获取语音包列表
    var packs = [];
    if (voiceAvail && M3.SceneVoice._getPacks) {
      packs = M3.SceneVoice._getPacks() || [];
    }

    // 预览包：点左侧卡片切换；未预览时跟随当前使用的包（未选任何包 = default）
    var curPack = null;
    var previewPack = null;
    for (var fi = 0; fi < packs.length; fi++) {
      if (packs[fi].packId === (selectedPackId || 'default')) curPack = packs[fi];
      if (packs[fi].packId === _previewPackId) previewPack = packs[fi];
    }
    if (!previewPack) previewPack = curPack;
    var previewId = previewPack ? previewPack.packId : '';

    // ── 右侧详情区：头像 + 试听 + 昵称/状态 + 主按钮 ──
    if (previewPack) {
      var ownedP = M3.SceneVoice._isOwned ? M3.SceneVoice._isOwned(previewPack.sku) : false;
      // 是否当前使用中（未选任何包时 = default 包在使用）
      var activeP = (previewPack.packId === selectedPackId) ||
        (selectedPackId === '' && previewPack.packId === 'default');

      // 头像 109×109 @(368,54) 圆形裁剪；未加载/无图时回退装饰图
      var defX = px + Math.round(368 * scale);
      var defY = py + Math.round(54 * scale);
      var bigD = Math.round(109 * scale);
      var bigImg = previewPack.icon ? getNetImg(previewPack.icon) : null;
      var bigDrawn = false;
      if (imgLoaded(bigImg)) {
        var bigClip = _clipAvatarCanvas(previewPack.icon, bigImg, bigD);
        if (bigClip) { rd.glDrawImage(bigClip, defX, defY, bigD, bigD); bigDrawn = true; }
      }
      if (!bigDrawn) drawRes('voiceDeco', defX, defY, bigD, bigD);

      // 试听按钮 32×32 @(486,58)（头像右上角，播放中显示暂停切图）
      var listenSz = Math.round(32 * scale);
      var lsX = px + Math.round(486 * scale);
      var lsY = py + Math.round(58 * scale);
      var isListening = (_listenPackId === previewPack.packId);
      ; (function (pk, lx, ly, ls) {
        var _lp = M3.Render.beginPressScale('profile_voice_listen', lx + ls / 2, ly + ls / 2);
        var drawn = drawRes(isListening ? 'voiceBtnPause' : 'voiceBtnPlay', lx, ly, ls, ls);
        M3.Render.endPressScale(_lp);
        if (drawn) {
          pushBtn(hb, lx, ly, ls, ls, 'profile_voice_listen', function () {
            if (_listenPackId === pk.packId) {
              if (typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.stopVoice) {
                KwaiMedia.Audio.stopVoice();
              }
              _listenPackId = '';
              return;
            }
            // 取 defaultVoiceId 对应语音（无则取第一条）作为试听内容
            var previewUrl = '';
            var pv = pk.voices || [];
            for (var vi = 0; vi < pv.length; vi++) {
              if (pv[vi].voiceId === pk.voiceId) { previewUrl = pv[vi].voiceUrl || ''; break; }
            }
            if (!previewUrl && pv.length) previewUrl = pv[0].voiceUrl || '';
            _listenPackId = pk.packId;
            if (previewUrl && typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.playVoice) {
              var _pvRet = KwaiMedia.Audio.playVoice(previewUrl, {
                onEnded: function () { if (_listenPackId === pk.packId) _listenPackId = ''; },
                onError: function (err) {
                  if (_listenPackId === pk.packId) _listenPackId = '';
                  // 暴露失败原因：快小常见为域名白名单（url not in domain list）
                  var msg = (err && (err.errMsg || err.message)) || '未知错误';
                  console.warn('[SceneVoice] 试听失败:', msg, previewUrl);
                  M3.Game.flash('试听失败：' + msg);
                },
              });
              // playVoice 在音效关闭时静默返回 false —— 给用户明确反馈
              if (_pvRet === false) {
                _listenPackId = '';
                M3.Game.flash('游戏音效已关闭，请在「设置」中开启');
              }
            }
          });
        }
      })(previewPack, lsX, lsY, listenSz);

      // 昵称（16px 600）+ 状态（12px 300）居中 x=423
      var defTextX = px + Math.round(423 * scale);
      rd.glFillText(previewPack.text || '语音包', defTextX, py + Math.round(183 * scale),
        '600 ' + Math.round(16 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');
      var statusText = activeP ? '使用中'
        : (ownedP ? '已解锁'
          : (Number(previewPack.priceBeans || 0) > 0 ? (previewPack.priceBeans + ' 铁豆解锁') : '免费'));
      rd.glFillText(statusText, defTextX, py + Math.round(205 * scale),
        '300 ' + Math.round(12 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');

      // 主按钮 104×36 @(371,223)：使用中=灰钮；兑换/使用=黄钮（黄色切图 104×38，
      // 底部 2px 为透明出血，按 38 高绘制后视觉与灰钮对齐）
      var btnW = Math.round(104 * scale), btnH = Math.round(36 * scale);
      var btnX = px + Math.round(371 * scale);
      var btnY = py + Math.round(223 * scale);
      var _ap = M3.Render.beginPressScale('profile_voice_action', btnX + btnW / 2, btnY + btnH / 2);
      if (activeP) {
        drawRes('voiceBtn', btnX, btnY, btnW, btnH);
      } else {
        var _vs=M3.AssetManager&&M3.AssetManager.get('btnGold'); if(_vs) rd.glDrawImage(_vs,btnX,btnY,btnW,Math.round(38*scale));
      }
      var btnLabel = activeP ? '使用中' : (ownedP ? '使用' : '立即兑换');
      var btnFS = '800 ' + Math.round(14 * scale) + 'px sans-serif';
      var btnTC = activeP ? '#929292' : '#5D3303';
      rd.glFillText(btnLabel, btnX + btnW / 2, btnY + btnH / 2,
        btnFS, btnTC, 'center', 'middle');
      M3.Render.endPressScale(_ap);
      if (!activeP) {
        ; (function (pk, owned2) {
          pushBtn(hb, btnX, btnY, btnW, btnH, 'profile_voice_action', function () {
            if (owned2) {
              if (M3.SceneVoice && M3.SceneVoice.selectPack) M3.SceneVoice.selectPack(pk);
            } else {
              if (M3.SceneVoice && M3.SceneVoice._buyPack) M3.SceneVoice._buyPack(pk);
              else if (M3.Game.flash) M3.Game.flash('购买功能加载中，请稍后再试');
            }
          });
        })(previewPack, ownedP);
      }
    }

    // 左侧语音包卡片列表（设计稿 Frame 100：(102,60) 206 宽两列）
    var listX = px + Math.round(102 * scale);
    var listY = py + Math.round(60 * scale);
    var listW = Math.round(206 * scale);
    var listH = ph - Math.round(60 * scale) - Math.round(10 * scale);

    var cardW2 = Math.round(99 * scale);
    var cardH2 = Math.round(136 * scale);
    var cardGap2 = Math.round(6 * scale);

    // 滚动区域定义
    var contentY = listY;
    var visibleH = listH;

    // 计算滚动范围
    var rows = Math.ceil(packs.length / 2) || 1;
    var totalH = rows * (cardH2 + cardGap2) - cardGap2;
    _maxScroll = Math.max(0, totalH - visibleH);
    _scroll = clamp(_scroll, 0, _maxScroll);

    var offsetY = -_scroll;

    // 列表区裁剪（滚动时卡片不得溢出列表边界/面板）。
    // 裁剪区四周外扩 6px：选中框切图含 2px 金边+外发光（111×148，比卡片大 6px），
    // 不外扩会把选中态的边框整个裁掉。
    if (rd.setScissor) rd.setScissor(listX - Math.round(6 * scale), listY - Math.round(6 * scale),
      listW + Math.round(12 * scale), visibleH + Math.round(12 * scale));
    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i];
      var col = i % 2;
      var row = Math.floor(i / 2);
      var cx2 = listX + col * (cardW2 + cardGap2);
      var cy2 = contentY + offsetY + row * (cardH2 + cardGap2);

      // 跳过不可见卡片
      if (cy2 + cardH2 < contentY || cy2 > contentY + visibleH) continue;

      // 选中态：跟随右侧预览的包（点击卡片即预览），金边框表达当前查看项
      var isSelected = (pack.packId === previewId);

      // 卡片外框（voice-card-frame 切图 99×136：渐变底+白边+四角白钻）
      // 选中态切图含 2px 金边+外发光，导出尺寸 111×148（卡片四周各外扩 6px），
      // 按整图绘制后金边正好贴在 99×136 卡片外沿
      if (isSelected) {
        drawRes('voiceCardFrameSel', cx2 - Math.round(6 * scale), cy2 - Math.round(6 * scale),
          Math.round(111 * scale), Math.round(148 * scale));
      } else {
        drawRes('voiceCardFrame', cx2, cy2, cardW2, cardH2);
      }



      // 语音包封面图（圆形头像 54×54 @ 卡片(22,17)）
      var iconUrl = pack.icon || '';
      var iconSz = Math.round(54 * scale);
      var iconCx = cx2 + cardW2 / 2;
      var iconCy = cy2 + Math.round(17 * scale) + iconSz / 2;
      if (iconUrl) {
        var packImg = getNetImg(iconUrl);
        if (imgLoaded(packImg)) {
          var clipC = _clipAvatarCanvas(iconUrl, packImg, iconSz);
          if (clipC) {
            rd.glDrawImage(clipC, iconCx - iconSz / 2, iconCy - iconSz / 2, iconSz, iconSz);
          }
        }
      } else {
        rd.beginPath(); rd.arc(iconCx, iconCy, iconSz / 2, 0, Math.PI * 2);
        rd.fill('#7CB1FA');
        rd.glFillText('🎤', iconCx, iconCy,
          '700 ' + Math.round(20 * scale) + 'px sans-serif', '#fff', 'center', 'middle');
      }

      // 名称 12px
      var nameBgY2 = cy2 + Math.round(82 * scale);
      rd.glFillText(pack.text || '语音包', cx2 + cardW2 / 2, nameBgY2 + Math.round(11 * scale),
        '600 ' + Math.round(12 * scale) + 'px PingFang SC,sans-serif',
        '#213372', 'center', 'middle');

      // 铁豆价格行（Frame 67：68 宽容器 @ 卡片(15,107)，内部 icon 13×13 + gap 3 + 数字 14px 居中）
      var priceY = cy2 + Math.round(107 * scale) + Math.round(8 * scale) + Math.round(5 * scale);
      var priceText = String(pack.priceLabel != null ? pack.priceLabel : '0');
      var priceFont = '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif';
      var priceTxtW = rd.glMeasureText ? rd.glMeasureText(priceText, priceFont) : Math.round(30 * scale);
      var beanSz = Math.round(13 * scale);
      var priceTotalW = beanSz + Math.round(3 * scale) + priceTxtW;
      var priceStartX = cx2 + Math.round(15 * scale) + (Math.round(68 * scale) - priceTotalW) / 2;
      drawRes('beanPrice', priceStartX, priceY - beanSz / 2, beanSz, beanSz);
      rd.glFillText(priceText, priceStartX + beanSz + Math.round(3 * scale), priceY,
        priceFont, '#213372', 'left', 'middle');

      // 整卡片点击 = 仅切换右侧详情预览（不直接兑换/使用），命中区随滚动裁剪到列表可视区
      ; (function (pk, by, bh) {
        if (bh <= 2) return;
        pushBtn(hb, cx2, by, cardW2, bh, 'profile_voice_card_' + pk.packId, function () {
          if (_previewPackId !== pk.packId) {
            stopPreview();            // 切换预览时停止上一包的试听并复位
            _previewPackId = pk.packId;
          }
        });
      })(pack, Math.max(cy2, contentY),
        Math.min(cy2 + cardH2, contentY + visibleH) - Math.max(cy2, contentY));

      // 卡片上不再放试听/兑换按钮（试听与使用/兑换都在右侧详情区）
    }
    if (rd.clearScissor) rd.clearScissor();

    // 无语音包时显示提示
    if (!voiceAvail || packs.length === 0) {
      rd.glFillText('语音包加载中...', listX + listW / 2, listY + listH / 2,
        '400 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
        '#8A9AB5', 'center', 'middle');
    }
  }

  // ── Tab 2：设置 ───────────────────────────────────────────────
  // 设计稿：游戏音效 (106,99) + 游戏音乐 (370,100) 同一行；震动效果 (106,143) 第二行；
  // 开关 62×28 圆角胶囊：开 #FFC400/「开」#5D3303@x8/滑块 26×26@x35；
  // 关 #8A92A6/「关」白字@x40/滑块 25×26@x1
  function drawTabSettings (rd, hb, p, header) {
    var px = p.px, py = p.py, scale = p.scale;

    // Figma 原始 y=99/100/143，按需求整体上移 20px
    var items = [
      { key: 'sfxEnabled', label: '游戏音效', x: 106, y: 79 },
      { key: 'bgmEnabled', label: '游戏音乐', x: 370, y: 80 },
      { key: 'vibEnabled', label: '震动效果', x: 106, y: 123 },
    ];

    var toggleW = Math.round(62 * scale);
    var toggleH = Math.round(28 * scale);
    var knobSz = Math.round(26 * scale);
    var labelFont = '400 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var on = getToggleState(item.key);
      var rowX = px + Math.round(item.x * scale);
      var rowY = py + Math.round(item.y * scale);

      // 文字（左）→ 开关（右，gap 8）
      var lw = rd.glMeasureText ? rd.glMeasureText(item.label, labelFont) : Math.round(56 * scale);
      rd.glFillText(item.label, rowX, rowY + toggleH / 2,
        labelFont, COL_STAT_TEXT, 'left', 'middle');

      // 开关底（切图：开=金色 / 关=灰色）
      var tX = rowX + lw + Math.round(8 * scale);
      var tY = rowY;
      drawRes(on ? 'toggleBgOn' : 'toggleBgOff', tX, tY, toggleW, toggleH);

      // 文字：开在左 @x8，关在右 @x40（右对齐到 toggleW-8）
      var toggleLabel = on ? '开' : '关';
      if (on) {
        rd.glFillText(toggleLabel, tX + Math.round(8 * scale), tY + toggleH / 2,
          '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TOGGLE_TEXT_ON, 'left', 'middle');
      } else {
        rd.glFillText(toggleLabel, tX + toggleW - Math.round(8 * scale), tY + toggleH / 2,
          '600 ' + Math.round(14 * scale) + 'px PingFang SC,sans-serif',
          COL_TOGGLE_TEXT_OFF, 'right', 'middle');
      }

      // 滑块（切图：开@x35 / 关@x1）
      var kX = on ? tX + Math.round(35 * scale) : tX + Math.round(1 * scale);
      var kY = tY + Math.round(1 * scale);
      drawRes(on ? 'toggleKnobOn' : 'toggleKnobOff', kX, kY, knobSz, knobSz);

      ; (function (k, tx, ty, tw, th) {
        pushBtn(hb, tx, ty, tw, th, 'profile_toggle_' + k, function () {
          var cur = getToggleState(k);
          setToggleState(k, !cur);
        });
      })(item.key, tX, tY, toggleW, toggleH);
    }
  }

  // ── 主绘制入口 ────────────────────────────────────────────────
  function draw () {
    if (!_visible) return;
    var rd = r();
    if (!rd) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;

    // 半透明蒙层
    rd.save(); rd.setAlpha(0.5);
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
    rd.restore();

    // 面板参数
    var p = calcPanel(W, H);
    _panel = { x: p.px, y: p.py, w: p.pw, h: p.ph };

    // 左 Tab 区
    drawTabs(rd, hb, p);

    // 右内容区（背景 + 标题 + 关闭按钮）
    var header = drawContentHeader(rd, hb, p);

    // 内容
    if (_tab === 0) drawTabAchievement(rd, hb, p, header);
    else if (_tab === 1) drawTabSettings(rd, hb, p, header);

    // 点击面板外关闭（mast 区）→ 在 onTouchStart 中处理
  }

  // ── 触摸事件 ──────────────────────────────────────────────────
  function onTouchStart (x, y) {
    if (!_visible) return false;
    if (_panel) {
      if (x < _panel.x || x > _panel.x + _panel.w ||
        y < _panel.y || y > _panel.y + _panel.h) {
        _visible = false;
        stopPreview();
        return true;
      }
    }
    _drag = null;
    return false;
  }

  function onTouchMove (x, y) {
    if (!_visible || !_drag) return 0;
    var dy = _drag.y - y;
    _drag.moved = Math.max(_drag.moved, Math.abs(dy));
    _scroll = clamp(_drag.scroll + dy, 0, _maxScroll);
    return Math.abs(dy) > 4 ? 1 : 0;
  }

  function onTouchEnd () {
    _drag = null;
  }

  // ── 公开接口 ──────────────────────────────────────────────────
  M3.SceneProfile = {
    show: function (tab) {
      ensureAssets();
      requestStats();   // 每次打开面板从服务端拉最新成就数据
      _visible = true;
      if (tab === 0 || tab === 1) _tab = tab;
      _scroll = 0;
    },
    hide: function () { _visible = false; _drag = null; stopPreview(); releaseAssets(); },
    isVisible: function () { return _visible; },
    toggle: function (tab) {
      if (_visible) { _visible = false; stopPreview(); }
      else { _visible = true; if (tab === 0 || tab === 1) _tab = tab; _scroll = 0; }
    },
    draw: draw,
    onTouchStart: onTouchStart,
    onTouchMove: onTouchMove,
    onTouchEnd: onTouchEnd,
    getStats: function () { return Object.assign({}, _stats); },
    updateStats: updateStats,
  };
})();
