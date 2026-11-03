/**
 * play/modals/win-modal.js — 通关弹窗
 * 对照旧版 game.js drawWinModal() L4219-4347 逐像素还原
 * 依赖：Renderer, UIKit, CONFIG, M3, TextRenderer, TextureManager
 */
(function () {
  'use strict';

  /**
   * 取通关卡片要展示的封面图 src，优先级：
   *   1. level.completeImage（关卡自定义结算图，各玩法通用）
   *   2. level.sceneA / level.scene（hidden/hunt/spot/story 玩法的场景图字段）
   *   3. dressup 玩法没有 scene/sceneA 字段，没配 completeImage 时兜底展示换装
   *      成果图 characters[0].result（换好装后的图），拿不到再退化到 .scene（换装前原图），
   *      与 remote-config.js getThemeCoverSrc() 对主题封面的兜底逻辑保持一致。
   * @param {object} level
   * @returns {string|null}
   */
  function getWinModalSceneSrc(level, theme) {
    if (!level) return null;
    if (level.completeImage) return level.completeImage;
    if (level.mode === 'puzzle' && theme && theme.completeImage) return theme.completeImage;
    if (level.sceneA) return level.sceneA;
    if (level.scene) return level.scene;
    if (level.mode === 'puzzle' && level.scenes && level.scenes.length) {
      var lastScene = level.scenes[level.scenes.length - 1];
      return lastScene.completeImage || lastScene.scene || null;
    }
    if (level.mode === 'dressup' && level.characters && level.characters[0]) {
      return level.characters[0].result || level.characters[0].scene || null;
    }
    return null;
  }

  SceneManager.register('win-modal', {
    _data: null,

    enter: function (data) {
      this._data = data;
      // 通关特效已经随包体提供，只在真正打开通关弹窗时按本地路径懒加载，
      // 不加入关卡首屏资源队列，也不请求线上 CDN。
      ['mnvWinFxGlow', 'mnvWinFxConfetti'].forEach(function (key) {
        var asset = CONFIG.UI_ASSETS && CONFIG.UI_ASSETS[key];
        var src = asset && asset.local;
        if (src) TextureManager.load(src).catch(function () {});
      });
    },

    draw: function () {
      var T = CONFIG.TEMPLATE.winModal;
      if (T.style === 'fullscreen') {
        this._drawFullscreen();
        return;
      }
      this._drawCard();
    },

    _drawCard: function () {
      var px  = M3.Layout.px;
      var d   = this._data || {};
      var W   = M3.Layout.w;
      var H   = M3.Layout.h;
      var cx  = W / 2;

      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(0,0,0,0.6)' });

      var _wtVH = px(52);
      var _gap1 = px(24), _gap2 = px(16), _gap3 = px(28), _gap4 = px(36);
      var _starH = px(20), _infoH = px(16), _cardH = px(180), _btnH = px(52);
      var _totalH = _wtVH + _gap1 + _starH + _gap2 + _infoH + _gap3 + _cardH + _gap4 + _btnH;
      var _startY = (H - _totalH) / 2 - px(30);

      Renderer.drawText('恭喜通关', cx, _startY + _wtVH / 2 - (px(32) * 1.4) / 2, {
        fontSize: px(32), color: '#FFE066', align: 'center',
        strokeColor: 'rgba(10,40,80,0.75)', strokeWidth: px(4), bold: true
      });
      var _titleBottom = _startY + _wtVH;

      var starSize = px(20), starGap = px(20);
      var starTotal = starSize * 3 + starGap * 2;
      var starStartX = cx - starTotal / 2;
      var starY = _titleBottom + px(24);
      var stars = d.stars || 0;
      for (var i = 0; i < 3; i++) {
        var src = i < stars ? CONFIG.uiAsset('starOn') : CONFIG.uiAsset('starOff');
        Renderer.drawImage(src, starStartX + i * (starSize + starGap), starY, starSize, starSize);
      }
      var _starBottom = starY + starSize;

      var infoY = _starBottom + px(16);
      if (d.beatPct) {
        Renderer.drawText('剩余 ' + (d.remainingTime || 0) + 's，击败' + d.beatPct + '%的' + (d.beatSuffix || '玩家'),
          cx, infoY, {
            fontSize: px(13), color: '#ffffff', align: 'center',
            strokeColor: 'rgba(0,0,0,0.55)', strokeWidth: px(2.5)
          });
      }
      var _infoBottom = infoY + px(16);

      var cardMaxW = px(170), cardMaxH = px(180);
      var cardY = _infoBottom + px(28);
      var sceneSrc = getWinModalSceneSrc(d.level, d.theme);
      var sceneEntry = sceneSrc ? TextureManager.get(sceneSrc) : null;
      var _actualCardH = cardMaxH;
      var cardX;
      if (sceneEntry && sceneEntry.img && sceneEntry.img.width > 0) {
        var sRatio = sceneEntry.img.width / sceneEntry.img.height;
        var cdw = cardMaxW, cdh = cdw / sRatio;
        if (cdh > cardMaxH) { cdh = cardMaxH; cdw = cdh * sRatio; }
        _actualCardH = cdh;
        cardX = cx - cdw / 2;
        var fit = Renderer.drawImageFit(sceneSrc, cardX, cardY, cdw, cdh);
        Renderer.drawRoundRect(fit.x, fit.y, fit.w, fit.h, px(12), { stroke: '#ffffff', strokeW: px(3) });
      } else {
        cardX = cx - cardMaxW / 2;
      }
      var _cardBottom = cardY + _actualCardH;

      var completeText = (d.level && d.level.completeText) || null;
      var textH = 0;
      if (completeText) {
        textH = px(40);
        var textY = _cardBottom + px(8);
        Renderer.drawText(completeText, cx, textY, {
          fontSize: px(15), color: '#ffffff', align: 'center',
          strokeColor: 'rgba(0,0,0,0.6)', strokeWidth: px(2.5),
          maxWidth: W - px(64)
        });
      }
      _cardBottom += textH;

      var bh = px(52), bw = px(130), gap = px(16);
      var btnY = _cardBottom + px(36);
      var b1x = cx - bw - gap / 2, b2x = cx + gap / 2;

      var areas = [];
      areas.push(UIKit.candyButton(b1x, btnY, bw, bh, '返 回', 'blue', function () {
        PlayController.goHome();
      }, { fontSize: px(15), priority: 10 }));

      var levels = RemoteConfig.getLevelsByTheme(d.level ? d.level.themeId : 0);
      var curPos = d.level ? levels.findIndex(function (lv) { return lv.idx === d.level.idx; }) : -1;
      var hasNext = curPos >= 0 && curPos < levels.length - 1;

      if (hasNext) {
        var nextLevel = levels[curPos + 1];
        var needAd = PlayController._needLevelAd(RemoteConfig.getTheme(d.level.themeId), nextLevel.idx);
        var nextArea = UIKit.candyButton(b2x, btnY, bw, bh, '下一关', 'green', function () {
          PlayController.pickLevel(nextLevel.idx);
        }, {
          fontSize: px(15), priority: 10,
          adBadge: needAd,
          adBadgeOpts: { total: 1, done: 0 }
        });
        areas.push(nextArea);
      }

      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 9, label: 'win-absorber',
        onTap: function () {}
      });

      areas.push(UIKit.addDesktopButton(10));

      InputManager.addAll(areas);
    },

    /**
     * 全屏式胜利弹窗（新模版「美女来找茬」）
     * 全屏背景图 + 深色蒙版 + 居中大图 + 标题 + 装饰条 + 返回/下一关按钮
     */
    /**
     * 全屏式胜利弹窗（新模版「美女来找茬」）
     * 逐像素还原设计稿 Frame 81（375 基准画布，本引擎虚拟视口等于 375 宽逻辑像素，
     * 无需额外缩放）：
     *   - Frame 81：312×317，作为下方全部子元素的坐标原点（FX,FY）
     *   - 卡片背景图(winCard) 312×317，铺满 Frame（相对原点 0,0）
     *   - 绶带横幅(winDecoration) 275×92，相对原点 (53,172)（"胜利通关"已烘焙进图）
     *   - 角色/场景图 259×193，相对原点 (59,255)，2px 白色描边 radius4
     *   - 通关文案 247 宽，相对原点 (cx,461)，fontSize18
     *   - 双按钮行：整体相对原点 (37,532)，148×55 一组，按钮图片本身比按钮框大
     *     (176×88，超出部分 -14/-16，为按钮自带发光/阴影留白，文字已烘焙进图)
     *     仅「返回首页」时单按钮居中；有下一关时「返回首页」+「下一关」并排
     */
    _drawFullscreen: function () {
      var px = M3.Layout.px;
      var d = this._data || {};
      var T = CONFIG.TEMPLATE.winModal;
      var W = M3.Layout.w;
      var H = M3.Layout.h;
      var cx = W / 2;

      // 通关弹窗背景改为直接透出下层关卡画面 + 半透明黑罩（不再用 mnvPageBg 紫色渐变图
      // 铺底），与 lose-modal 的蒙层处理方式保持一致。
      // 注意：必须用 drawRoundRect(radius=0) 而非 drawRect 画全屏蒙层——drawRect 走
      // ShapeBatch，只在整帧 endFrame 时统一 flush，且固定晚于 SpriteBatch flush，
      // 会导致蒙层最终盖在所有图片(卡片/绶带/角色图)之上而非垫在其下方（历史坑）。
      // drawRoundRect 会强制立即 flush 并用原生 GL 绘制，能正确按调用顺序垫底。
      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.8)' });

      // 通关成功特效层：光晕图铺满全屏，压在黑罩之上、卡片/绶带/按钮等其他元素之下
      var fxSrc = CONFIG.uiAsset('mnvWinFxGlow');
      var fxEntry = fxSrc ? TextureManager.get(fxSrc) : null;
      if (fxEntry) {
        Renderer.drawImageCover(fxSrc, 0, 0, W, H);
      }

      // 彩带特效层：叠在光晕之上、卡片之下
      var confettiSrc = CONFIG.uiAsset('mnvWinFxConfetti');
      var confettiEntry = confettiSrc ? TextureManager.get(confettiSrc) : null;
      if (confettiEntry) {
        Renderer.drawImageCover(confettiSrc, 0, 0, W, H);
      }

      var areas = [];

      // 左上角返回按钮
      var backRect = CONFIG.getBackButtonRect();
      var closeY = backRect.y, closeSize = backRect.size;
      areas.push(UIKit.drawBackCloseButton(function () { PlayController.goHome(); }, 1000));

      // ── Frame 81 原点（FX, FY）：312×317，整组视觉水平/垂直都居中于屏幕 ──────
      // 说明：Figma 标注的纵向坐标（绶带172/照片255/文案461/按钮532）同样是按照
      // "卡片背景仅做视觉衬底、真实内容大幅下沉溢出卡片"的错位构图标注的，会导致
      // 卡片顶部大片空白、照片挑出卡片边界、文案与按钮间距过大。这里改为在卡片内
      // 重新计算一套自洽的紧凑布局：绶带贴卡片顶部一小段留白、照片与绶带轻微重叠、
      // 照片完整收纳在卡片内不再挑出边界，按钮紧跟卡片下方。────────────────────
      var FW = px(312), cardW = px(312), cardH = px(317);
      var CARD_TOP_PAD = px(-20);
      var BANNER_H = px(92), PHOTO_OVERLAP = px(8), PHOTO_H = px(193), CAPTION_GAP = px(6);
      var BANNER_TOP = CARD_TOP_PAD;
      var PHOTO_TOP = BANNER_TOP + BANNER_H - PHOTO_OVERLAP;
      var CAPTION_TOP = PHOTO_TOP + PHOTO_H + CAPTION_GAP;
      var BTN_GAP_BELOW_CARD = px(30);
      var BTN_ROW_TOP = cardH + BTN_GAP_BELOW_CARD;

      var groupTop = 0, groupBottom = BTN_ROW_TOP - px(16) + px(88);
      var groupH = groupBottom - groupTop;
      var FX = cx - FW / 2;
      var FY = (H - groupH) / 2 - groupTop;
      // 兜底：避免在极短屏幕上顶部与关闭按钮重叠、或底部按钮被挤出屏幕外
      var minFY = closeY + closeSize + px(10);
      var maxFY = H - px(16) - groupBottom;
      FY = Math.max(minFY, Math.min(FY, maxFY));

      // 卡片面板（winCard.png，铺满 Frame，相对原点 0,0，312×317）
      var cardX = FX, cardY = FY;
      var cardSrc = T.bgImageAsset ? CONFIG.uiAsset(T.bgImageAsset) : null;
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      // 绶带横幅（winDecoration.png，"胜利通关"已烘焙进图，275×92），水平居中卡片，
      // 紧贴卡片顶部留白处
      var bannerW = px(275), bannerH = BANNER_H;
      var bannerX = FX + (cardW - bannerW) / 2, bannerY = FY + BANNER_TOP - px(10);
      var decoSrc = T.decorationAsset ? CONFIG.uiAsset(T.decorationAsset) : null;
      var decoEntry = decoSrc ? TextureManager.get(decoSrc) : null;
      if (decoEntry) {
        Renderer.drawImage(decoSrc, bannerX, bannerY, bannerW, bannerH);
      } else {
        Renderer.drawRoundRect(bannerX, bannerY, bannerW, bannerH, px(12), { stroke: '#f7f7ff', strokeW: px(2) });
      }
      if (!decoEntry) {
        Renderer.drawText('胜利通关', cx, bannerY + bannerH / 2 - px(12), {
          fontSize: px(24), color: '#FED41A', align: 'center', bold: true,
          strokeColor: '#470501', strokeWidth: px(2.5)
        });
      }

      // 角色/场景图（居中对齐卡片，完整收纳在卡片内，259×193）：结算图常见比例与
      // 259×193 不完全一致，drawImageCover 裁剪填满后图片本身已贴满该区域，边缘
      // 再叠一层白色描边会显得像多出一圈白框、把图片视觉边界往外顶出卡片，故去掉。
      var sceneW = px(259), sceneH = PHOTO_H;
      var sceneX = FX + (cardW - sceneW) / 2, sceneY = FY + PHOTO_TOP;
      var sceneSrc = getWinModalSceneSrc(d.level, d.theme);
      var sceneEntry = sceneSrc ? TextureManager.get(sceneSrc) : null;
      if (sceneEntry && sceneEntry.img && sceneEntry.img.width > 0) {
        Renderer.drawImageCover(sceneSrc, sceneX, sceneY, sceneW, sceneH);
      } else {
        Renderer.drawRoundRect(sceneX, sceneY, sceneW, sceneH, px(4), { fill: 'rgba(0,0,0,0.06)' });
      }

      // 通关文案：优先关卡自定义 completeText，否则回退关卡标题
      var titleText = (d.level && d.level.completeText) ||
        (T.titleFromLevel ? (d.level && d.level.title) : null) ||
        (T.titleText || '');
      if (titleText) {
        Renderer.drawText(titleText, cx, FY + CAPTION_TOP, {
          fontSize: px(18), color: '#141056', align: 'center', bold: true,
          maxWidth: px(247)
        });
      }

      // ── 双按钮行（居中对齐卡片、紧跟卡片下方；每个按钮框 148×55，按钮图片
      // 176×88，相对自身按钮框再偏移 -14,-16）────────────────────────────────
      var levels = RemoteConfig.getLevelsByTheme(d.level ? d.level.themeId : 0);
      var curPos = d.level ? levels.findIndex(function (lv) { return lv.idx === d.level.idx; }) : -1;
      var hasNext = curPos >= 0 && curPos < levels.length - 1;

      // 章节最后一关：检查是否有下一主题
      var isChapterEnd = !!d.isChapterEnd;
      var nextTheme = null;
      if (isChapterEnd) {
        var themes = RemoteConfig.themes || [];
        var curThemeIdx = -1;
        for (var ti = 0; ti < themes.length; ti++) {
          if (String(themes[ti].id) === String(d.level ? d.level.themeId : null)) { curThemeIdx = ti; break; }
        }
        if (curThemeIdx >= 0 && curThemeIdx < themes.length - 1) {
          nextTheme = themes[curThemeIdx + 1];
        }
      }

      function _isThemeUnlockedInline(theme) {
        if (!theme) return false;
        if (PlayController.isThemeUnlocked) return PlayController.isThemeUnlocked(theme);
        if (theme.unlocked) return true;
        if (theme.unlockBy === 'free') return true;
        if (Storage.isThemePermUnlocked(theme.id)) return true;
        if (Storage.isTempUnlockAllActive()) return true;
        if (theme.dailyUnlock && Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id)) return true;
        return false;
      }

      var btnBoxW = px(148), btnRowW = px(301);
      var btnRowX = FX + (cardW - btnRowW) / 2, btnRowY = FY + BTN_ROW_TOP;
      var btnImgW = px(176), btnImgH = px(88), btnImgDX = px(-14), btnImgDY = px(-16);
      var singleBtnX = btnRowX + (btnRowW - btnBoxW) / 2;

      function drawImgButton(boxX, boxY, assetKey, onTap, opts) {
        opts = opts || {};
        var src = assetKey ? CONFIG.uiAsset(assetKey) : null;
        var entry = src ? TextureManager.get(src) : null;
        if (entry) {
          var imageX = boxX + btnImgDX;
          var imageY = boxY + btnImgDY;
          Renderer.drawImage(src, imageX, imageY, btnImgW, btnImgH);
          return {
            x: imageX, y: imageY, w: btnImgW, h: btnImgH,
            priority: 1000, label: 'img-btn-' + assetKey, onTap: UIKit._wrapTapSound(onTap)
          };
        }
        return UIKit.candyButton(boxX, boxY, btnBoxW, px(55), opts.fallbackLabel, opts.fallbackColor, onTap, {
          fontSize: px(17), priority: 1000, adBadge: opts.adBadge, adBadgeOpts: opts.adBadgeOpts
        });
      }

      if (hasNext) {
        areas.push(drawImgButton(btnRowX, btnRowY, T.primaryButtonAsset, function () {
          PlayController.goHome();
        }, { fallbackLabel: '返回首页', fallbackColor: 'blue' }));

        var nextLevel = levels[curPos + 1];
        var needAd = PlayController._needLevelAd(RemoteConfig.getTheme(d.level.themeId), nextLevel.idx);
        var btn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
        areas.push(drawImgButton(btn2X, btnRowY, T.secondaryButtonAsset, function () {
          if (InputManager.cancelDrag) InputManager.cancelDrag();
          SceneManager.close();
          PlayController.pickLevel(nextLevel.idx);
        }, {
          fallbackLabel: '下一关', fallbackColor: 'green',
          adBadge: needAd, adBadgeOpts: { total: 1, done: 0 }
        }));
      } else if (isChapterEnd && nextTheme) {
        // 章节最后一关且有下一主题：左「返回首页」，右「下一主题」
        areas.push(drawImgButton(btnRowX, btnRowY, T.primaryButtonAsset, function () {
          PlayController.goHome();
        }, { fallbackLabel: '返回首页', fallbackColor: 'blue' }));

        var nextThemeUnlocked = _isThemeUnlockedInline(nextTheme);
        var btn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
        var nextThemeShare = !nextThemeUnlocked && nextTheme.unlockBy === 'share';
        // 已解锁直接进入；分享解锁使用分享按钮并打开分享弹窗；广告解锁使用原按钮。
        var nextThemeAsset = nextThemeShare
          ? (T.nextThemeShareButtonAsset || T.nextThemeButtonAsset || T.secondaryButtonAsset)
          : nextThemeUnlocked
          ? (T.nextThemeFreeButtonAsset || T.nextThemeButtonAsset || T.secondaryButtonAsset)
          : (T.nextThemeButtonAsset || T.secondaryButtonAsset);
        areas.push(drawImgButton(btn2X, btnRowY, nextThemeAsset, function () {
          // 点击后立即清理通关弹窗留下的拖拽状态，避免广告/切场景时重复触发。
          if (InputManager.cancelDrag) InputManager.cancelDrag();
          SceneManager.close();
          PlayController.goToNextTheme();
        }, {
          fallbackLabel: nextThemeShare ? '解锁新主题' : '下一主题', fallbackColor: 'green',
          adBadge: !nextThemeUnlocked && !nextThemeShare, adBadgeOpts: { total: 1, done: 0 }
        }));
      } else {
        areas.push(drawImgButton(singleBtnX, btnRowY, T.primaryButtonAsset, function () {
          PlayController.goHome();
        }, { fallbackLabel: '返回首页', fallbackColor: 'blue' }));
      }

      // priority 需高于下层 game 场景 HUD 的最高优先级(settings=200)，防止点击卡片外
      // 空白区域时穿透命中被蒙版遮住的 HUD 按钮
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'win-absorber',
        onTap: function () {}
      });

      areas.push(UIKit.addDesktopButton(1000));

      InputManager.addAll(areas);

      // 拖拽热区吸收（防止穿透命中下层 dressup 换装拖拽/横向滚动条，tap 和 drag 是
      // InputManager 两套独立命中表，仅注册 tapArea 挡不住 dragArea）。
      // 注意：handleStart 优先判定 dragArea，全屏 absorber 会让 handleTap 永远不再
      // 被调用、导致弹窗按钮失灵——必须把按钮区域(priority>=1000)镜像进 dragArea，
      // 用更高 priority 排在 absorber 之前，命中时直接触发原 onTap 回调（见
      // lose-modal.js 同类修复注释）。
      areas.forEach(function (a) {
        if ((a.priority || 0) < 1000 || !a.onTap) return;
        InputManager.addDrag({
          x: a.x, y: a.y, w: a.w, h: a.h,
          priority: (a.priority || 1000) + 1, label: 'drag-mirror-' + (a.label || 'btn'),
          onDragStart: function (cx, cy) { a.onTap(cx, cy); return true; },
          onDragMove: function () {},
          onDragEnd: function () {}
        });
      });

      InputManager.addDrag({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'win-drag-absorber',
        onDragStart: function () { return true; },
        onDragMove: function () {},
        onDragEnd: function () {}
      });
    }
  });
})();
