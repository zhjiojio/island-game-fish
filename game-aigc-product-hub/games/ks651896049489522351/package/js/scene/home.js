/**
 * scene-home.js — 大厅场景（纯图片版）
 * 渲染层：直接调用 M3.Render WebGL 接口（无 Canvas 2D ctx）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ─── 图片缓存（委托 M3.AssetManager 统一管理）─────────────────
  var AM = M3.AssetManager;
  var SCENE_GROUP = 'scene:home';

  function r () { return M3.Render; }

  /**
   * contain 模式：保比例缩放至 w×h 内，居中绘制，不裁剪
   */
  function drawContain (key, x, y, w, h) {
    if (!AM.loaded(key)) return false;
    var img = AM.get(key);
    var sw = img.naturalWidth || img.width || w;
    var sh = img.naturalHeight || img.height || h;
    var s = Math.min(w / sw, h / sh);
    var dw = sw * s, dh = sh * s;
    r().glDrawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }

  function getContainRect (key, x, y, w, h) {
    if (!AM.loaded(key)) return { x: x, y: y, w: w, h: h };
    var img = AM.get(key);
    var sw = img.naturalWidth || img.width || w;
    var sh = img.naturalHeight || img.height || h;
    var s = Math.min(w / sw, h / sh);
    var dw = sw * s, dh = sh * s;
    return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
  }

  /**
   * cover 模式（背景用）：保比例铺满，超出部分画出界外（WebGL 无 clip，近似处理）
   */
  function drawCover (key, x, y, w, h) {
    if (!AM.loaded(key)) return false;
    var img = AM.get(key);
    var sw = img.naturalWidth || img.width || w;
    var sh = img.naturalHeight || img.height || h;
    var s = Math.max(w / sw, h / sh);
    var dw = sw * s, dh = sh * s;
    r().glDrawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }

  // ─── 铁豆 ────────────────────────────────────────────────────
  M3.SceneHome = M3.SceneHome || {};
  M3.SceneHome.getBeans = function () {
    var w = M3.Game.getWallet ? M3.Game.getWallet() : null;
    return (w && typeof w.beans === 'number') ? w.beans : null;
  };
  M3.SceneHome.getFrozenBeans = function () {
    var w = M3.Game.getWallet ? M3.Game.getWallet() : null;
    return (w && typeof w.frozenBeans === 'number') ? w.frozenBeans : 0;
  };
  M3.SceneHome.getWalletText = function () {
    var status = M3.Game.getWalletStatus ? M3.Game.getWalletStatus() : { ready: false };
    if (!status.ready) {
      if (status.error) return '同步失败';
      return status.syncing ? '同步中...' : '未同步';
    }
    var beans = M3.SceneHome.getBeans();
    var frozenBeans = M3.SceneHome.getFrozenBeans();
    return M3.Game.formatBeans(beans) + (frozenBeans > 0 ? ' 冻结' + M3.Game.formatBeans(frozenBeans) : '');
  };

  // ─── 每日任务 ────────────────────────────────────────────────
  var _today = new Date().toDateString();
  var _taskDone = { share: false, join: false };
  function loadTasks () {
    try {
      var raw;
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) raw = KwaiStorage.getSync('ddz_t_' + _today);
      else if (typeof localStorage !== 'undefined') raw = localStorage.getItem('ddz_t_' + _today);
      if (raw) { var d = JSON.parse(raw); _taskDone = { share: !!d.share, join: !!d.join }; }
    } catch (e) { }
  }
  function saveTasks () {
    try {
      var s = JSON.stringify(_taskDone);
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) KwaiStorage.setSync('ddz_t_' + _today, s);
      else if (typeof localStorage !== 'undefined') localStorage.setItem('ddz_t_' + _today, s);
    } catch (e) { }
  }
  function markTaskDone (key) { _taskDone[key] = true; saveTasks(); }
  M3.SceneHome.markTaskDone = markTaskDone;
  M3.SceneHome.completeTask = completeTask;
  function completeTask (key) {
    if (_taskDone[key]) { M3.Game.flash('今日任务已完成~'); return; }
    if (key === 'share' && M3.Game.claimShareReward) { M3.Game.claimShareReward(); return; }
    // 加桌奖励不随按钮发放：从桌面快捷方式启动时自动领取（game.js maybeClaimShortcut）
    if (key === 'join') { M3.Game.flash('从桌面打开游戏即可领取加桌奖励'); return; }
    M3.Game.flash('任务奖励暂不可用，请稍后再试');
  }
  loadTasks();

  // ─── 选中房间 ────────────────────────────────────────────────
  var _selRoom = 1;

  // ─── 工具 ────────────────────────────────────────────────────
  function pushBtn (hb, x, y, w, h, label, fn) {
    hb.push({ x: x, y: y, w: w, h: h, label: label, onClick: fn });
  }

  function isBtnPressed (label) {
    return M3.Input && M3.Input.getPressedLabel && M3.Input.getPressedLabel() === label;
  }

  function beginPress (label, cx, cy, scale) {
    if (!isBtnPressed(label)) return false;
    r().save();
    r().translate(cx, cy);
    r().scale(scale || 0.92, scale || 0.92);
    r().translate(-cx, -cy);
    return true;
  }

  function endPress (pressed) {
    if (pressed) r().restore();
  }

  // ─── 预加载所有图片 ───────────────────────────────────────────
  // btnChat 提前用 scene:game group 预热：进匹配界面时图片已就绪，避免首帧 fallback → 切图的闪动感
  AM.acquire('image', 'btnChat', 'subpackages/ingame/asset/image/game/btn-chat.png', 'scene:game');
  AM.acquire('image', 'bg-courtyard', 'asset/image/common/bg/bg-courtyard.png', SCENE_GROUP);
  AM.acquire('image', 'room-junior-bg', 'asset/image/index/room-cards/room-junior-bg.png', SCENE_GROUP);
  AM.acquire('image', 'room-junior-info', 'asset/image/index/room-cards/room-junior-info.png', SCENE_GROUP);
  AM.acquire('image', 'room-junior-char', 'asset/image/index/room-cards/room-junior-char.png', SCENE_GROUP);
  AM.acquire('image', 'room-mid-bg', 'asset/image/index/room-cards/room-mid-bg.png', SCENE_GROUP);
  AM.acquire('image', 'room-mid-info', 'asset/image/index/room-cards/room-mid-info.png', SCENE_GROUP);
  AM.acquire('image', 'room-mid-char', 'asset/image/index/room-cards/room-mid-char.png', SCENE_GROUP);
  AM.acquire('image', 'room-senior-bg', 'asset/image/index/room-cards/room-senior-bg.png', SCENE_GROUP);
  AM.acquire('image', 'room-senior-info', 'asset/image/index/room-cards/room-senior-info.png', SCENE_GROUP);
  AM.acquire('image', 'room-senior-char', 'asset/image/index/room-cards/room-senior-char.png', SCENE_GROUP);
  AM.acquire('image', 'icon-ad-bean', 'asset/image/index/icon-ad-bean.png', SCENE_GROUP);
  AM.acquire('image', 'icon-voice-pack', 'asset/image/index/icon-voice-pack.png', SCENE_GROUP);
  AM.acquire('image', 'icon-add-desk', 'asset/image/index/icon-add-desk.png', SCENE_GROUP);
  AM.acquire('image', 'icon-share', 'asset/image/index/icon-share.png', SCENE_GROUP);
  AM.acquire('image', 'icon-settings', 'asset/image/index/icon-settings.png', SCENE_GROUP);
  AM.acquire('image', 'bean-multi-bg', 'asset/image/index/bean-multi-bg.png', SCENE_GROUP);
  AM.acquire('image', 'bean', 'asset/image/common/icon/bean.png', SCENE_GROUP);
  AM.acquire('image', 'diamond', 'asset/image/common/icon/diamond.png', SCENE_GROUP);
  AM.acquire('image', 'icon-plus', 'asset/image/common/icon/icon-plus.png', SCENE_GROUP);
  AM.acquire('image', 'img-border', 'asset/image/common/icon/img-border.png', SCENE_GROUP);

  // 主页资源预载（幂等：已就绪则跳过）。供结算进场/逃跑弹窗提前预热，
  // 用户点「返回大厅/确认逃跑」时资源已加载完成，不再出现占位色块闪现。
  function preloadHomeAssets () {
    if (AM.loaded('bg-courtyard')) return;
    AM.acquire('image', 'bg-courtyard', 'asset/image/common/bg/bg-courtyard.png', SCENE_GROUP);
    AM.acquire('image', 'room-junior-bg', 'asset/image/index/room-cards/room-junior-bg.png', SCENE_GROUP);
    AM.acquire('image', 'room-junior-info', 'asset/image/index/room-cards/room-junior-info.png', SCENE_GROUP);
    AM.acquire('image', 'room-junior-char', 'asset/image/index/room-cards/room-junior-char.png', SCENE_GROUP);
    AM.acquire('image', 'room-mid-bg', 'asset/image/index/room-cards/room-mid-bg.png', SCENE_GROUP);
    AM.acquire('image', 'room-mid-info', 'asset/image/index/room-cards/room-mid-info.png', SCENE_GROUP);
    AM.acquire('image', 'room-mid-char', 'asset/image/index/room-cards/room-mid-char.png', SCENE_GROUP);
    AM.acquire('image', 'room-senior-bg', 'asset/image/index/room-cards/room-senior-bg.png', SCENE_GROUP);
    AM.acquire('image', 'room-senior-info', 'asset/image/index/room-cards/room-senior-info.png', SCENE_GROUP);
    AM.acquire('image', 'room-senior-char', 'asset/image/index/room-cards/room-senior-char.png', SCENE_GROUP);
    AM.acquire('image', 'icon-ad-bean', 'asset/image/index/icon-ad-bean.png', SCENE_GROUP);
    AM.acquire('image', 'icon-voice-pack', 'asset/image/index/icon-voice-pack.png', SCENE_GROUP);
    AM.acquire('image', 'icon-add-desk', 'asset/image/index/icon-add-desk.png', SCENE_GROUP);
    AM.acquire('image', 'icon-share', 'asset/image/index/icon-share.png', SCENE_GROUP);
    AM.acquire('image', 'icon-settings', 'asset/image/index/icon-settings.png', SCENE_GROUP);
    AM.acquire('image', 'bean-multi-bg', 'asset/image/index/bean-multi-bg.png', SCENE_GROUP);
    AM.acquire('image', 'bean', 'asset/image/common/icon/bean.png', SCENE_GROUP);
    AM.acquire('image', 'diamond', 'asset/image/common/icon/diamond.png', SCENE_GROUP);
    AM.acquire('image', 'icon-plus', 'asset/image/common/icon/icon-plus.png', SCENE_GROUP);
    AM.acquire('image', 'img-border', 'asset/image/common/icon/img-border.png', SCENE_GROUP);
    // 进匹配界面需要的聊天按钮，提前以 scene:game group 预热，避免进场首帧 fallback 闪动
    AM.acquire('image', 'btnChat', 'subpackages/ingame/asset/image/game/btn-chat.png', 'scene:game');
  }

  M3.SceneHome.preloadAssets = preloadHomeAssets;

  M3.SceneHome.ensureImages = function () {
    AM.releaseGroup('scene:game');
    preloadHomeAssets();
  };

  // ─────────────────────────────────────────────────────────────
  // draw() 主入口
  // ─────────────────────────────────────────────────────────────
  M3.SceneHome.draw = function () {
    var rd = r();
    if (!rd) return;
    var hb = rd.getHitBtns();
    var W = M3.Layout.w, H = M3.Layout.h;
    var st = M3.Layout.safeTop || 0;
    var sl = Math.max(24, Math.round(W * 0.08));
    var capsuleLeft = Math.round(W * 0.87);
    try {
      if (typeof ks !== 'undefined' && ks.getMenuButtonBoundingClientRect) {
        var mb = ks.getMenuButtonBoundingClientRect();
        // 部分机型横屏下返回竖屏坐标系的 rect（left 仅 ~280，远小于半屏宽），
        // 直接采用会把卡片区右边界压到屏幕左侧、右侧出现大片空白。
        // 胶囊只会出现在屏幕右半区：left 必须落在 (0.5W, W) 才可信，否则按比例推算。
        if (mb && mb.left > W * 0.5 && mb.left < W) capsuleLeft = Math.round(mb.left) - 8;
      }
    } catch (e) { }

    drawBg(W, H);
    if (!M3.Game.getShowJoinModal()) {
      drawLeftBtns(W, H, st, sl, hb);
      drawCards(W, H, st, capsuleLeft, hb);
      drawBottomBtns(W, H, sl, hb);
      drawQuickStart(W, H, capsuleLeft, hb, st);
    }
    // 用户信息（头像/昵称/豆子/钻石）后绘，层级高于场次卡片
    drawUserInfo(W, H, st, sl, hb);
    // 新手礼包：authOk 回包早于进 home 屏时挂起，这里每帧补弹
    if (M3.SceneNewcomer && M3.SceneNewcomer.checkPending) M3.SceneNewcomer.checkPending();
    // 看广告得铁豆弹窗（最上层，遮罩 + 面板）
    if (M3.SceneAdReward && M3.SceneAdReward.isVisible && M3.SceneAdReward.isVisible()) {
      M3.SceneAdReward.draw();
    }
    // 新手礼包弹窗（最上层，上线未领取时自动弹出）
    if (M3.SceneNewcomer && M3.SceneNewcomer.isVisible && M3.SceneNewcomer.isVisible()) {
      M3.SceneNewcomer.draw();
    }
    // 加桌有奖弹窗（最上层，点加桌 icon 弹出）
    if (M3.SceneAddDesk && M3.SceneAddDesk.isVisible && M3.SceneAddDesk.isVisible()) {
      M3.SceneAddDesk.draw();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 背景（cover）
  // ─────────────────────────────────────────────────────────────
  function drawBg (W, H) {
    var rd = r();
    // 切图未就绪时不再绘制 8 段降级渐变色块（启动瞬间色带闪现），留空等真图
    drawCover('bg-courtyard', 0, 0, W, H);
    // 不再叠加顶/底遮罩，背景图直接全屏覆盖即可
  }

  // ─────────────────────────────────────────────────────────────
  // 左上：头像圆 + 昵称 + bean 图标 + 铁豆数
  // ─────────────────────────────────────────────────────────────
  function drawUserInfo (W, H, st, sl, hb) {
    var rd = r();
    var user = M3.Game.getUser ? M3.Game.getUser() : null;
    var nick = (user && user.nickname) ? user.nickname : '玩家';
    var url = (user && user.avatarUrl) ? user.avatarUrl : '';
    var walletText = M3.SceneHome.getWalletText ? M3.SceneHome.getWalletText() : '未同步';

    // 设计稿 1932-4369（短边 375 基准）：头像 64×64、用户名 15px（原稿 18 偏大调小）、
    // 豆子区胶囊底（bean-multi-bg 切图 67×25 → 胶囊高取 25 匹配切片 12 不变形）
    var short = Math.min(W, H);
    var AV = Math.round(short * 0.171), avR = AV / 2;
    var nickFont = Math.round(short * 0.04);
    var beanFont = 16;   // 胶囊字号写死，跨机型一致
    var beanSz = 21;   // 豆 icon 固定尺寸（写死，与钻石 26 一致策略，跨机型尺寸一致）
    var pillH = 29;   // 胶囊高度写死，跨机型一致
    var avCx = sl + avR, avCy = st + 9 + avR;

    // 头像（WebGL 圆形裁剪 shader，smoothstep 羽化边缘，无锯齿）
    // 真图未就绪/无头像 URL 时不绘制紫色占位圆 + 昵称首字（兜底色块），留空等真图
    if (url) {
      if (AM._avKey !== url) {
        if (AM._avKey) AM.release(AM._avKey);
        AM._avKey = url;
        AM.acquire('image', url, url);
      }
      if (AM.loaded(url)) {
        var avImg = AM.get(url);
        rd.glDrawImageCircle(avImg, avCx, avCy, avR, 1.2);
      }
    }

    // 头像框（未加载时不画降级描边，避免切图加载完后尺寸跳变）
    if (AM.loaded('img-border')) {
      var bd = AM.get('img-border');
      var bdRatio = (bd.naturalWidth && bd.naturalHeight) ? (bd.naturalWidth / bd.naturalHeight) : 1;
      var bdH = AV * 1.06, bdW = bdH * bdRatio;
      rd.glDrawImage(bd, avCx - bdW / 2, avCy - bdH / 2, bdW, bdH);
    }

    // 点击头像区域 → 弹出个人面板（成就/语音包/设置）
    pushBtn(hb, avCx - avR, avCy - avR, avR * 2, avR * 2, 'avatar_profile', function () {
      M3.SceneProfile.show(0);   // 默认打开"成就" Tab
    });

    // 昵称（文字阴影近似：黑色偏移）
    var tx = avCx + avR + 14;
    var nickY = avCy - Math.round(avR * 0.42);
    rd.save(); rd.setAlpha(0.9);
    rd.glFillText(nick, tx + 1, nickY + 1,
      '600 ' + nickFont + 'px sans-serif', '#000000', 'left', 'middle');
    rd.restore();
    rd.glFillText(nick, tx, nickY,
      '600 ' + nickFont + 'px sans-serif', '#ffffff', 'left', 'middle');

    // 铁豆 + 钻石 水平排列在同一行（豆子在左，钻石紧跟右侧，Y 坐标相同）
    var beanRowCY = avCy + Math.round(avR * 0.45);  // 整行视觉中心 Y
    var beanCx = tx;
    var isFailed = walletText === '同步失败';
    var beanTextColor = isFailed ? '#ff6b6b' : '#FAE9AF';
    var displayText = isFailed ? '同步失败 点击重试' : walletText;
    var leftPad = 7, iconTextGap = 6, rightPad = 10, pillGap = 8;
    // + 角标固定尺寸（写死，跨机型一致），右下角叠加
    var plusSz = 18;

    // ── 豆子胶囊 ──
    var beanPillW = 0;   // 记录豆子胶囊实际宽，供锤石胶囊起点使用
    if (AM.loaded('bean')) {
      var beanFontStr = '800 ' + beanFont + 'px sans-serif';
      var textW = rd.glMeasureText ? rd.glMeasureText(displayText, beanFontStr) : beanFont * displayText.length * 0.6;
      var pillW = Math.max(67, leftPad + beanSz + iconTextGap + textW + rightPad);
      beanPillW = pillW;
      var pillImg = AM.loaded('bean-multi-bg') ? AM.get('bean-multi-bg') : null;
      if (pillImg && rd.glDrawImage9) {
        rd.glDrawImage9(pillImg, beanCx, beanRowCY - pillH / 2, pillW, pillH, 12, 12, 67, 25);
      }
      var iconX = beanCx + leftPad;
      rd.glDrawImage(AM.get('bean'), iconX, beanRowCY - beanSz / 2, beanSz, beanSz);
      // 豆子 icon 右下角 + 角标（失败状态不显示；Inspect 定标累计 dx:-3.5+2.5 → 横移常量 2→3）
      if (!isFailed && AM.loaded('icon-plus')) {
        rd.glDrawImage(AM.get('icon-plus'),
          iconX + beanSz - plusSz * 0.55 - 3, beanRowCY + beanSz / 2 - plusSz * 0.55 - 3,
          plusSz, plusSz);
      }
      var textAreaLeft = iconX + beanSz + iconTextGap;
      var textAreaW = pillW - leftPad - beanSz - iconTextGap - rightPad;
      rd.glFillText(displayText, textAreaLeft + textAreaW / 2, beanRowCY,
        beanFontStr, beanTextColor, 'center', 'middle');
    } else {
      // 豆子切图未就绪：不再用 emoji 兜底替代 icon（真机上渲染成色块），
      // 整条胶囊留空等切图；仅保留估算宽度供钻石胶囊/锤石定位
      beanPillW = 80;
    }
    if (isFailed) {
      pushBtn(hb, beanCx, beanRowCY - beanSz / 2, 140, beanSz + 4, 'wallet_retry', function () {
        if (M3.Game.syncWallet) M3.Game.syncWallet();
      });
    } else {
      // 点击豆子胶囊 → 打开铁豆商城（Tab 1）
      pushBtn(hb, beanCx, beanRowCY - pillH / 2, beanPillW || 80, pillH, 'home_bean_pill', function () {
        if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(1);
      });
    }

    // ── 钻石胶囊（快手平台余额，与豆子同行）──
    var dStartX = beanCx + beanPillW + pillGap;
    var diamondWallet = M3.DiamondWallet && M3.DiamondWallet.getState
      ? M3.DiamondWallet.getState()
      : { ready: false, balance: '0' };
    var diamondText = diamondWallet.ready ? M3.DiamondWallet.format(diamondWallet.balance) : (diamondWallet.syncing ? '同步中...' : '--');
    var dIconSz = 26;  // 新 icon 无透明区域，高度与铁豆 icon 同
    // 按图片原始宽高比等比缩放（正比例，不拉伸；图片未就绪时按 1:1 兜底）
    var dImg0 = AM.loaded('diamond') ? AM.get('diamond') : null;
    var dRatio = (dImg0 && (dImg0.naturalWidth || dImg0.width) && (dImg0.naturalHeight || dImg0.height))
      ? (dImg0.naturalWidth || dImg0.width) / (dImg0.naturalHeight || dImg0.height) : 1;
    var dIconW = Math.round(dIconSz * dRatio);
    if (AM.loaded('diamond')) {
      var dFontStr = '800 ' + beanFont + 'px sans-serif';
      var dTextW = rd.glMeasureText ? rd.glMeasureText(diamondText, dFontStr) : beanFont * diamondText.length * 0.6;
      var dPillW = Math.max(67, leftPad + dIconW + iconTextGap + dTextW + rightPad);
      var dPillImg = AM.loaded('bean-multi-bg') ? AM.get('bean-multi-bg') : null;
      if (dPillImg && rd.glDrawImage9) {
        rd.glDrawImage9(dPillImg, dStartX, beanRowCY - pillH / 2, dPillW, pillH, 12, 12, 67, 25);
      }
      var dIconX = dStartX + leftPad;
      // 宽度按图片原始宽高比等比计算（dRatio 上方已算好）
      var dIconW = Math.round(dIconSz * dRatio);
      var dIconH = dIconSz;
      // 新 icon 无透明区域，直接对齐铁豆 icon 位置
      rd.glDrawImage(AM.get('diamond'), dIconX, beanRowCY - dIconH / 2, dIconW, dIconH);
      // 钻石 icon 右下角 + 角标（对齐铁豆逻辑，含 Inspect dx:-3.5）
      if (AM.loaded('icon-plus')) {
        var dPlusSz = plusSz;
        rd.glDrawImage(AM.get('icon-plus'),
          dIconX + dIconW - dPlusSz * 0.55 - 5.5,
          beanRowCY + beanSz / 2 - plusSz * 0.55 - 3,
          dPlusSz, dPlusSz);
      }
      var dTextAreaLeft2 = dIconX + dIconW + iconTextGap;
      var dTextAreaW2 = dPillW - leftPad - dIconW - iconTextGap - rightPad;
      rd.glFillText(diamondText, dTextAreaLeft2 + dTextAreaW2 / 2, beanRowCY,
        dFontStr, '#FAE9AF', 'center', 'middle');
      // 点击钻石胶囊 → 打开商城钻石 Tab
      pushBtn(hb, dStartX, beanRowCY - pillH / 2, dPillW, pillH, 'home_diamond_pill', function () {
        if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(0);
      });
    } else {
      // 钻石切图未就绪：不再用 emoji 兜底替代 icon，整条胶囊留空（热区保留可点）
      pushBtn(hb, dStartX, beanRowCY - pillH / 2, 80, pillH, 'home_diamond_pill', function () {
        if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(0);
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 左列：看广告得铁豆 + 专属语音包
  // ─────────────────────────────────────────────────────────────
  function drawLeftBtns (W, H, st, sl, hb) {
    var rd = r();
    // 设计稿 1932-4369 为横屏手机（812×375），UI 尺寸一律按短边 375 逻辑基准换算：
    // icon 72×72（短边 19.2%），竖排两枚间隔 12（短边 3.2%）
    var short = Math.min(W, H);
    var isz = Math.round(short * 0.192);
    var gap = Math.round(short * 0.032);
    var ct = st + Math.round(H * 0.15);
    var cb = Math.round(H * 0.77);
    var totalH = isz * 2 + gap;
    var sy = ct + Math.round((cb - ct - totalH) / 2);

    var items = [
      {
        key: 'icon-ad-bean',
        onClick: function () {
          // 打开「看广告得铁豆」弹窗（次数/奖励由服务端权威控制）
          if (M3.SceneAdReward && M3.SceneAdReward.show) M3.SceneAdReward.show();
        }
      },
      {
        key: 'icon-voice-pack',
        onClick: function () {
          if (M3.SceneShop && M3.SceneShop.show) M3.SceneShop.show(2);  // 语音包 Tab
        }
      }
    ];

    for (var i = 0; i < items.length; i++) {
      var b = items[i];
      var bx = sl, by = sy + i * (isz + gap);
      var cr = getContainRect(b.key, bx, by, isz, isz);
      var cCx = cr.x + cr.w / 2, cCy = cr.y + cr.h / 2;
      var pressed = beginPress(b.key, cCx, cCy);
      if (AM.loaded(b.key)) {
        drawContain(b.key, bx, by, isz, isz);
      }
      // 图标未加载完成时不绘制占位方块，避免取消匹配返回大厅时闪现灰色方块
      endPress(pressed);
      ; (function (fn) { pushBtn(hb, cr.x, cr.y, cr.w, cr.h, b.key, fn); })(b.onClick);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 中间：3 个房间卡片
  // ─────────────────────────────────────────────────────────────
  var ROOMS = [
    { bg: 'room-junior-bg', info: 'room-junior-info', char: 'room-junior-char', name: '初级场', sel: '#4ade80', type: 'junior' },
    { bg: 'room-mid-bg', info: 'room-mid-info', char: 'room-mid-char', name: '中级场', sel: '#38bdf8', type: 'mid' },
    { bg: 'room-senior-bg', info: 'room-senior-info', char: 'room-senior-char', name: '大师场', sel: '#fbbf24', type: 'master' }
  ];

  // 三卡布局（写死贴死，不随屏幕动态变化）：
  //   间隙固定 0；卡宽按卡区高度以设计比例 153:233 反推，整组水平居中。
  //   窄屏放不下时按卡区宽度反推。图与卡框同比例，直接整图绘制无变形。
  function cardsLayout (W, H, st, capsuleLeft) {
    var ax = Math.round(W * 0.32);   // 卡片区左起点，向右移留出左侧 UI 空间
    var aw = capsuleLeft - ax;
    var gap = 0;                                  // 三卡贴死：间隙写死 0
    var ct = st + Math.round(H * 0.15);
    var cb = Math.round(H * 0.77);
    var ch = cb - ct;
    var cardAR = 153 / 233;                       // 场次卡设计宽高比
    var cardW = Math.round(ch * cardAR);          // 默认按卡区高度正比例
    var cardH = ch;
    if (cardW * 3 + gap * 2 > aw) {               // 窄屏保护：按宽反推
      cardW = Math.floor((aw - gap * 2) / 3);
      cardH = Math.round(cardW / cardAR);
    }
    var startX = ax + Math.round((aw - (cardW * 3 + gap * 2)) / 2);
    var cardY = ct + Math.round((ch - cardH) / 2);
    return {
      startX: startX, cardY: cardY, cardW: cardW, cardH: cardH, gap: gap,
      right: startX + cardW * 3 + gap * 2
    };
  }

  function drawCards (W, H, st, capsuleLeft, hb) {
    var rd = r();
    var ly = cardsLayout(W, H, st, capsuleLeft);

    // 浮动动画：正弦曲线，周期 3s，振幅 ~3px
    var now = M3._now();
    var floatAmp = ly.cardH * 0.013;
    var floatPeriod = 3000;

    // 底分/门票字号：三张卡统一取最小值，避免各卡字号不一致
    var _ROOMS_H = 1344;
    var _sc = ly.cardH / _ROOMS_H;
    var _economy = (M3.Game.getEconomy && M3.Game.getEconomy()) || {};
    var _serverTiers = (_economy.roomTiers) || {};
    var _RD = {
      junior: { bgW: 896, infoW: 773, detailBoxW: 565 },
      mid: { bgW: 821, infoW: 689, detailBoxW: 565 },
      master: { bgW: 852, infoW: 741, detailBoxW: 565 }
    };
    var _sharedDetailFontSz = Math.round(80 * _sc);
    for (var _pi = 0; _pi < ROOMS.length; _pi++) {
      var _rt = ROOMS[_pi].type;
      var _rd = _RD[_rt] || _RD.junior;
      var _tier = _serverTiers[_rt] || {};
      if (_tier.baseBet != null && _tier.entryFeeBeans != null) {
        var _dStr = '底分 ' + _tier.baseBet + ' 门票 ' + _tier.entryFeeBeans;
        var _dMaxW = _rd.detailBoxW * _sc;
        var _dEstW = _dStr.length * _sharedDetailFontSz * 0.58;
        if (_dEstW > _dMaxW) {
          var _cand = Math.max(7, Math.floor(_sharedDetailFontSz * _dMaxW / _dEstW));
          if (_cand < _sharedDetailFontSz) _sharedDetailFontSz = _cand;
        }
      }
    }

    for (var i = 0; i < ROOMS.length; i++) {
      var room = ROOMS[i];
      var cx = ly.startX + i * (ly.cardW + ly.gap);
      var cy = ly.cardY;
      var cCx = cx + ly.cardW / 2, cCy = cy + ly.cardH / 2;
      var pressed = beginPress(room.name, cCx, cCy, 0.96);

      // ─────────────────────────────────────────────────────────
      // 三层渲染：完全还原 Cocos 场景节点数据（Main.fire）
      //
      // Cocos 坐标系：anchor=(0.5,0.5)，Y 轴朝上
      // bg 直接 fit 到 cardW×cardH，其余图层按相同 scaleX/scaleY 换算：
      //   canvasX = bgCenterX + ccos_posX * scaleX - drawW/2
      //   canvasY = bgCenterY - ccos_posY * scaleY - drawH/2  (Y 取反)
      //
      // 各节点数据来自 Main.fire rooms 子节点：
      //   junior-bg  896×1344   char pos(0,+167.6) size 917×1167   info pos(0,−417.8) size 773×393
      //   mid-bg     821×1222   char pos(0,+113.1) size 908×1235   info pos(0,−369.3) size 689×365
      //   senior-bg  852×1300   char pos(0,+151.6) size 911×1143   info pos(0,−397.4) size 741×389
      // ─────────────────────────────────────────────────────────

      // 各场次 Cocos 原始数据（来自 Main.fire，坐标均相对父节点中心，Y轴朝上）
      // namePY/detailPY: label 节点相对 info 中心的 Cocos Y 坐标
      // nameBoxW/detailBoxW: label 节点设计宽度（用于限制字号不超出边界框）
      // detailRotZ: info label 的 euler.z 旋转角（度）
      var ROOM_DATA = {
        junior: {
          bgW: 896, bgH: 1344,
          charW: 917, charH: 1167, charPY: 167.585,
          infoW: 773, infoH: 393, infoPY: -417.781,
          namePY: 77.732, nameBoxW: 300,
          detailPY: -92.213, detailBoxW: 565, detailRotZ: 2,
          nameColor: '#5a840f', detailColor: '#5a840f'
        },
        mid: {
          bgW: 821, bgH: 1222,
          charW: 908, charH: 1235, charPY: 113.053,
          infoW: 689, infoH: 365, infoPY: -369.305,
          namePY: 78.608, nameBoxW: 300,
          detailPY: -91.337, detailBoxW: 565, detailRotZ: 0,
          nameColor: '#116dff', detailColor: '#116dff'
        },
        master: {
          bgW: 852, bgH: 1300,
          charW: 911, charH: 1143, charPY: 151.645,
          infoW: 741, infoH: 389, infoPY: -397.374,
          namePY: 72.826, nameBoxW: 300,
          detailPY: -97.119, detailBoxW: 565, detailRotZ: 0,
          nameColor: '#ff8a1a', detailColor: '#ff8a1a'
        }
      };
      var rd_data = ROOM_DATA[room.type] || ROOM_DATA.junior;
      // rooms 容器设计高度 1344，所有 bg 节点 Y=0（相对rooms中心），以 rooms 高度为基准统一缩放
      // 每张 bg 保持自身宽高比：sc = cardH / roomsH，bg 实际绘制尺寸 = bgW*sc × bgH*sc
      var ROOMS_H = 1344;
      var sc = ly.cardH / ROOMS_H;         // 统一缩放比（由 rooms 容器高决定）
      var scX = sc;
      var scY = sc;
      var bgDW = Math.round(rd_data.bgW * sc);
      var bgDH = Math.round(rd_data.bgH * sc);
      // bg 在卡槽内水平居中、垂直居中（rooms 内各 bg Y 均为 0）
      var bgDX = Math.round(cx + (ly.cardW - bgDW) / 2);
      var bgDY = Math.round(cy + (ly.cardH - bgDH) / 2);
      var bgCX = bgDX + bgDW / 2;         // bg 中心 canvas X
      var bgCY = bgDY + bgDH / 2;         // bg 中心 canvas Y

      // ── 层1：背景图（等比缩放，居中于卡槽） ──
      if (AM.loaded(room.bg)) {
        rd.glDrawImage(AM.get(room.bg), bgDX, bgDY, bgDW, bgDH);
      }

      // ── 预算 info 尺寸（char 定位依赖） ──
      var infoDW = Math.round(rd_data.infoW * scX);
      var infoDH = Math.round(rd_data.infoH * scY);
      // Cocos posY 朝上取反：canvasY = bgCY - posY*scY - h/2
      var infoDY = Math.round(bgCY - rd_data.infoPY * scY - infoDH / 2);
      var infoDX = Math.round(bgCX - infoDW / 2);

      // ── 层2：人物图（浮动动画） ──
      if (AM.loaded(room.char)) {
        var charImg = AM.get(room.char);
        var charDW = Math.round(rd_data.charW * scX);
        var charDH = Math.round(rd_data.charH * scY);
        var charDX = Math.round(bgCX - charDW / 2);
        var charBaseY = Math.round(bgCY - rd_data.charPY * scY - charDH / 2);
        var phase = i * (floatPeriod / 3);
        var t = ((now + phase) % floatPeriod) / floatPeriod;
        var floatOff = floatAmp * Math.sin(2 * Math.PI * t);
        rd.glDrawImage(charImg, charDX, charBaseY + floatOff, charDW, charDH);
      }

      // ── 层3：信息框图 + 文字 ──
      if (AM.loaded(room.info)) {
        rd.glDrawImage(AM.get(room.info), infoDX, infoDY, infoDW, infoDH);

        // info 中心（canvas 坐标）
        var infoCX = infoDX + infoDW / 2;
        var infoCY = infoDY + infoDH / 2;

        // ── 文字节点精确坐标（来自 Main.fire label 节点，相对 info 中心，Y取反） ──
        // type 节点: 设计尺寸300×126, pos(0, +nameNodePY)  fontSize=100
        // info 节点: 设计尺寸565×101, pos(0, +detailNodePY) fontSize=80
        //   junior info 节点有 euler.z=3（旋转3度），mid/senior 无旋转
        var nameNodePY = rd_data.namePY;    // Cocos Y朝上
        var detailNodePY = rd_data.detailPY;
        var nameBoxW = rd_data.nameBoxW;  // label 边界框宽（设计空间）
        var detailBoxW = rd_data.detailBoxW;
        var detailRotZ = rd_data.detailRotZ || 0; // 旋转角（度，顺时针为正，canvas旋转）

        // 转换到 canvas 坐标
        var nameCanvasY = infoCY - nameNodePY * scY;
        var detailCanvasY = infoCY - detailNodePY * scY;

        // 场名：fontSize=100/设计bg高→按scY换算，限制在 nameBoxW*scX 内
        var nameFontSz = Math.round(100 * scY);
        // 边界框换算到 canvas 空间的宽度限制
        var nameMaxW = nameBoxW * scX;
        // 用 canvas measureText 估算文字宽（近似：每字约 0.6*fontSize）
        var nameEstW = room.name.length * nameFontSz * 0.65;
        if (nameEstW > nameMaxW) nameFontSz = Math.max(8, Math.floor(nameFontSz * nameMaxW / nameEstW));

        rd.glFillText(room.name, infoCX, nameCanvasY,
          '800 ' + nameFontSz + 'px sans-serif', rd_data.nameColor, 'center', 'middle');

        // 底分/门票
        var economy = (M3.Game.getEconomy && M3.Game.getEconomy()) || {};
        var serverTiers = economy.roomTiers || {};
        var tier = serverTiers[room.type] || {};
        var baseBet = tier.baseBet != null ? tier.baseBet : null;
        var entryFee = tier.entryFeeBeans != null ? tier.entryFeeBeans : null;
        if (baseBet != null && entryFee != null) {
          var detailStr = '底分 ' + baseBet + ' 门票 ' + entryFee;
          var detailFontSz = _sharedDetailFontSz;

          if (detailRotZ !== 0) {
            // 旋转文字：以文字中心为旋转原点（save → translate → rotate → drawText → restore）
            var rad = detailRotZ * Math.PI / 180;
            rd.save();
            rd.translate(infoCX, detailCanvasY);
            rd.rotate(-rad); // canvas Y轴朝下，Cocos z旋转正方向=逆时针，canvas需取反
            rd.glFillText(detailStr, 0, 0,
              '600 ' + detailFontSz + 'px sans-serif', rd_data.detailColor, 'center', 'middle');
            rd.restore();
          } else {
            rd.glFillText(detailStr, infoCX, detailCanvasY,
              '600 ' + detailFontSz + 'px sans-serif', rd_data.detailColor, 'center', 'middle');
          }
        }
      }

      endPress(pressed);
      ; (function (ri) {
        pushBtn(hb, cx, cy, ly.cardW, ly.cardH, ROOMS[ri].name, function () {
          _selRoom = ri;
          if (M3.Game.enterRoom) M3.Game.enterRoom({ type: ROOMS[ri].type });
          else if (M3.Matchmaking && M3.Matchmaking.start)
            M3.Matchmaking.start({ roomType: ROOMS[ri].type, roomName: ROOMS[ri].name });
          else M3.Game.flash('进入 ' + ROOMS[ri].name);
        });
      })(i);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 左下：加桌 / 分享 / 设置
  // ─────────────────────────────────────────────────────────────
  function drawBottomBtns (W, H, sl, hb) {
    var rd = r();
    // 设计稿 1932-4369 为横屏手机（812×375），按短边 375 逻辑基准：
    // 组合切图 46×65（icon 46 + 12px 金黄文字），横向步进 62（46 + 间隔 16）
    var short = Math.min(W, H);
    var isz = Math.round(short * 0.123);       // 组合条宽 46
    var iszH = Math.round(isz * 65 / 46);      // 组合条高 65
    var cgap = Math.round(short * 0.165);      // 步进：46 + 16
    var padB = Math.round(H * 0.04);
    var by = H - padB - iszH;

    var items = [
      {
        key: 'icon-add-desk',
        onClick: function () {
          // 先弹「加桌有奖」弹窗，由弹窗内「立即加桌」再调用开放 API
          if (M3.SceneAddDesk && M3.SceneAddDesk.show) M3.SceneAddDesk.show();
          else M3.Game.flash('当前环境暂不支持添加桌面');
        }
      },
      {
        key: 'icon-share',
        onClick: function () {
          var claim = function () { completeTask('share', 300); };
          if (typeof KwaiShare !== 'undefined' && KwaiShare.share)
            KwaiShare.share({ title: '来和我一起玩老铁斗地主！', success: claim });
          else M3.Game.flash('分享失败');
        }
      },
      {
        key: 'icon-settings',
        onClick: function () {
          M3.SceneProfile.show(1);  // 设置 Tab
        }
      }
    ];

    for (var i = 0; i < items.length; i++) {
      var b = items[i];
      var bx = sl + i * cgap;
      var cr = getContainRect(b.key, bx, by, isz, iszH);
      var cCx = cr.x + cr.w / 2, cCy = cr.y + cr.h / 2;
      var pressed = beginPress(b.key, cCx, cCy);
      if (AM.loaded(b.key)) {
        drawContain(b.key, bx, by, isz, iszH);
      }
      // 切图未就绪时不再绘制淡描边轮廓（加载边框闪现），留空
      endPress(pressed);
      ; (function (fn) { pushBtn(hb, cr.x, cr.y, cr.w, cr.h, b.key, fn); })(b.onClick);
    }
  }


  // ─────────────────────────────────────────────────────────────
  // 右下：快速开始
  // ─────────────────────────────────────────────────────────────
  function drawQuickStart (W, H, capsuleLeft, hb, st) {
    var qsLabel = '快速开始';
    var pressed = isBtnPressed(qsLabel);
    var FX = M3.SpineFX;

    // 弹窗打开不隐藏（跟随主页本身）；切到 game 屏由 SceneGame.draw 顶部 unmount，
    // join modal 期间本函数不被调用 → 0.75s 无刷新自动卸载。
    // scale 与场次卡同基准（cardsLayout 双约束，窄屏按宽反推保护）：
    // 基准为 926×428 设计稿下 cardH≈259 时的定稿 scale 0.6。
    if (FX && FX.mount) {
      var ly = cardsLayout(W, H, st, capsuleLeft);
      var qsScale = ly.cardH * (0.6 / 259);
      // 位置（与旧静态图布局一致）：主体右缘对齐第三张场次卡右缘、
      // 底部留 4% padding——贴右下角；并夹紧在屏内（小屏保护）。
      // 主体的显示尺寸 = txt region（417×115）× scale。
      var visW = 417 * qsScale, visH = 115 * qsScale;
      var qsX = ly.right - visW / 2;
      var qsY = H - Math.round(H * 0.04) - visH / 2;
      qsX = Math.min(Math.max(qsX, visW / 2 + 6), Math.max(visW / 2 + 6, W - visW / 2 - 6));
      qsY = Math.min(Math.max(qsY, (M3.Layout.safeTop || 0) + visH / 2),
        Math.max((M3.Layout.safeTop || 0) + visH / 2, H - visH / 2 - 6));
      FX.mount('home-quickstart', 'quickstart', {
        x: Math.round(qsX), y: Math.round(qsY),
        scale: qsScale,
        press: pressed ? 0.94 : 1,   // 按压缩放（以 txt 主体中心为锚，只缩不平移）
        anchorSlot: 'txt',           // 缩放锚点 = 按钮主体中心，scale 变化主体位置不动
        screen: 'home',   // 界面随屏守卫：切进局内（screen→game）立即销毁
        layer: 'scene',   // 场景层：在下方 drawInstance 绘制（本函数内，旧静态图的位置），
        // 弹窗等之后画的内容可自然遮挡；帧尾 SpineFX.draw 跳过本实例
      });
      // 与旧静态图 drawContain 完全相同的时机/层级绘制（含 overlay 文字）
      if (FX.isReady('home-quickstart')) FX.drawInstance('home-quickstart');
      // 按钮上的文字（一行「初级房 门票 N」）：钉在 spine 的 txt 按钮主体上——
      // (x,y) 对齐的是整个骨骼 bounds 中心（含光效飞舞范围），按钮主体会偏离，
      // 所以实时取 txt region 的世界顶点中心换算到屏幕坐标，动画怎么动字都不脱扣。
      // 按钮上的文字（一行「初级房 门票 N」）：位置以主体中心（mount 的 x/y
      // 经 anchor 补偿后恒对齐 txt 主体中心）为基准加固定偏移；按压与场次卡
      // 同款——beginPress 2D 矩阵缩放（锚=主体中心），字随按钮矢量缩放、
      // 无字号跳变，与 spine 按压缩放（同锚同系数）完全一体。
      FX.overlay('home-quickstart', function (fx) {
        var rd = r();
        var economy = (M3.Game.getEconomy && M3.Game.getEconomy()) || {};
        var tier = (economy.roomTiers || {}).junior || {};
        var fee = tier.entryFeeBeans != null ? tier.entryFeeBeans : '--';
        // 字号定稿 15（926×428 基准，随按钮 scale 等比换算）；字色 #6A3F0A
        var oneSz = Math.max(9, Math.round(15 * qsScale / 0.6));
        // 偏移定稿（Inspect 标定，926×428 基准）：dx:-48 dy:-16（相对主体中心）
        var tx = fx.x - 48 * qsScale / 0.6;
        var ty = fx.y - 16 * qsScale / 0.6;
        var pr = beginPress(qsLabel, fx.x, fx.y, 0.94);
        rd.glFillText('初级房 门票 ' + fee, tx, ty,
          '700 ' + oneSz + 'px sans-serif', '#6A3F0A', 'center', 'middle');
        endPress(pr);
      });
    }

    // 点击：跟随 spine 当前姿态的可见内容命中（替代固定矩形 hitbox）
    hb.push({
      label: qsLabel,
      hitTest: function (x, y) { return FX && FX.hitTest && FX.hitTest('home-quickstart', x, y); },
      onClick: function () {
        if (M3.Matchmaking && M3.Matchmaking.start) M3.Matchmaking.start({ roomType: 'junior', roomName: '初级场' });
        else if (M3.Game.enterRoom) M3.Game.enterRoom({ type: 'junior' });
        else M3.Game.flash('开始匹配：初级场');
      },
    });
  }

})();
