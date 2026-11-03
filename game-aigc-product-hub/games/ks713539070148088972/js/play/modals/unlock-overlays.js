/**
 * play/modals/unlock-overlays.js — 各类解锁浮层
 * 包含：
 *   - voice-unlock-modal  语音包每日解锁
 *   - unlock-all-overlay  解锁全部场景（3 广告）
 *   - share-unlock-overlay 分享解锁
 *   - daily-ad-unlock-overlay 每日广告解锁主题
 *   - chapter-done-overlay 章节完结
 */
(function () {
  'use strict';

  // ── 中文折行辅助（逐字测量宽度）──────────────────────────────────────────────
  function _wrapLines(text, maxW, fontSize, maxLines) {
    if (!text) return [];
    var lines = [];
    var current = '';
    for (var i = 0; i < text.length; i++) {
      var test = current + text[i];
      if (TextRenderer.measure(test, fontSize, 'sans-serif') > maxW && current) {
        lines.push(current);
        current = text[i];
        if (maxLines && lines.length >= maxLines - 1) {
          // 最后一行放剩余所有字符
          var rest = text.slice(i);
          lines.push(rest);
          return lines;
        }
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // ── 语音包解锁 ───────────────────────────────────────────────────────────────
  SceneManager.register('voice-unlock-modal', {
    _pack: null,
    enter: function (data) { this._pack = data && data.pack; },
    draw: function () {
      var px = M3.Layout.px;
      var W = M3.Layout.w, H = M3.Layout.h;
      var cw = W - px(60), ch = px(240);
      var cx = (W - cw) / 2, cy = (H - ch) / 2;
      var pack = this._pack;

      var areas = UIKit.drawModalCard(cx, cy, cw, ch, '🔓 解锁语音包', function () {
        SceneManager.close();
      }, 2900);

      Renderer.drawText(pack ? ('「' + pack.name + '」今日可用') : '', W/2, cy + px(100), {
        fontSize: px(15), color: '#334', align: 'center'
      });
      areas.push(UIKit.drawButton((W - px(200)) / 2, cy + ch - px(60), px(200), px(40), '📺 看视频解锁', {
        bgColor: '#ff8800', textColor: '#fff', fontSize: px(14), radius: px(20), adBadge: true
      }, function () {
        if (!pack) return;
        Ads.showRewarded(function (ok) {
          if (!ok) return;
          Storage.markDailyUnlocked(CONFIG.STORAGE_KEYS.voiceUnlocks, pack.id);
          Audio.setVoicePack(pack.id);
          UIKit.toast('🎉 ' + pack.name + ' 今日已解锁！');
          SceneManager.close();
        }, 'voice_unlock');
      }, 2850));

      InputManager.addAll(areas);
    }
  });

  // ── 解锁全部场景（卡片式风格，对齐 loseModal 的 card-image 布局：白底卡片 + 顶部
  //   绶带横幅 + 中间播放图标 + 高亮数值副文案 + 双图片按钮，素材/文案/看视频次数均可
  //   在 product.config.js TEMPLATE.unlockAllModal 与 CONFIG.AD_UNLOCK_ALL_COUNT 配置）──
  var _unlockAllProgress = 0;

  function _findNextThemeLevel() {
    var state = PlayController && PlayController.state;
    var currentLevel = state && state.level;
    var themes = RemoteConfig.themes || [];
    if (!currentLevel) return null;

    var currentThemeIndex = -1;
    for (var i = 0; i < themes.length; i++) {
      if (String(themes[i].id) === String(currentLevel.themeId)) {
        currentThemeIndex = i;
        break;
      }
    }
    if (currentThemeIndex < 0 || currentThemeIndex >= themes.length - 1) return null;

    var nextTheme = themes[currentThemeIndex + 1];
    var levels = RemoteConfig.getLevelsByTheme(nextTheme.id);
    return levels && levels[0] ? levels[0] : null;
  }

  SceneManager.register('unlock-all-overlay', {
    _nextLevel: null,
    enter: function () {
      _unlockAllProgress = Storage.getCount(CONFIG.STORAGE_KEYS.unlockAllAdCount);
      this._nextLevel = arguments[0] && arguments[0].nextLevel;
    },
    draw: function () {
      var px = M3.Layout.px;
      var T = CONFIG.TEMPLATE.unlockAllModal || {};
      var W = M3.Layout.w, H = M3.Layout.h;
      var cx = W / 2;

      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.7)' });

      var areas = [];

      // 左上角返回按钮
      areas.push(UIKit.drawBackCloseButton(function () { SceneManager.close(); }, 1000));

      // ── Frame 原点（FX, FY）：312 宽，整组视觉（横幅顶部 -31 ~ 按钮底部 349），
      // 布局参数与 lose-modal.js card-image 样式保持一致，水平/垂直均居中于屏幕 ──────
      var FW = px(312);
      var groupTop = px(-31), groupBottom = px(294) + px(55); // 349
      var groupH = groupBottom - groupTop; // 380
      var FX = cx - FW / 2;
      var FY = (H - groupH) / 2 - groupTop;

      // 卡片背景（相对 Frame 原点 5,0，307×279）
      var cardX = FX + px(5), cardY = FY + 0, cardW = px(307), cardH = px(279);
      var cardSrc = T.bgImageAsset ? CONFIG.uiAsset(T.bgImageAsset) : null;
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      // 标题绶带（相对 Frame 原点 21,-31，279×93，文字「解锁关卡」已烘焙进图）
      var bannerX = FX + px(21), bannerY = FY - px(31), bannerW = px(279), bannerH = px(93);
      var bannerSrc = T.ribbonAsset ? CONFIG.uiAsset(T.ribbonAsset) : null;
      var bannerEntry = bannerSrc ? TextureManager.get(bannerSrc) : null;
      if (bannerEntry) {
        Renderer.drawImage(bannerSrc, bannerX, bannerY, bannerW, bannerH);
      } else {
        Renderer.drawRoundRect(bannerX, bannerY, bannerW, bannerH, px(12), { fill: 'rgba(90,60,180,0.9)' });
        Renderer.drawText('解锁关卡', bannerX + bannerW / 2, bannerY + bannerH / 2 - (px(24) * 1.4) / 2, {
          fontSize: px(24), color: '#FED41A', align: 'center', bold: true,
          strokeColor: '#470501', strokeWidth: px(2.5)
        });
      }

      // 中间播放视频图标（水平居中于卡片，相对 Frame 原点纵向 41）
      var iconSize = px(122);
      var iconX = FX + FW / 2 - iconSize / 2, iconY = FY + px(41);
      var iconSrc = T.iconAsset ? CONFIG.uiAsset(T.iconAsset) : null;
      var iconEntry = iconSrc ? TextureManager.get(iconSrc) : null;
      if (iconEntry) {
        Renderer.drawImage(iconSrc, iconX, iconY, iconSize, iconSize);
      }

      // 副文案（相对 Frame 原点 35,189，247×56，fontSize20）：「还剩/总」整体作为一个
      // 占位符 {progress}（如 "3/5"）高亮为 #f76664（与原单数值高亮同一套配色，见
      // UIKit.drawHighlightText 默认 valueColor），连斜杠一起变红，视觉上更完整。
      // remain = 总次数 - 已看次数，total 直接取 CONFIG.AD_UNLOCK_ALL_COUNT——与「看视频 (X/N)」
      // 按钮进度徽标、解锁判定逻辑共用同一个配置来源，保证文案与实际生效次数始终一致
      // （同复活链路 getReviveAmount 模式）。
      var subtitleX = FX + px(35), subtitleY = FY + px(189), subtitleW = px(247);
      var subtitleTemplate = T.watchVideoHint || '观看{progress}次视频\n解锁该系列所有关卡';
      var subtitleRemain = Math.max(0, CONFIG.AD_UNLOCK_ALL_COUNT - _unlockAllProgress);
      UIKit.drawHighlightText(subtitleTemplate, { progress: subtitleRemain + '/' + CONFIG.AD_UNLOCK_ALL_COUNT }, subtitleX + subtitleW / 2, subtitleY);

      // ── 双按钮行（水平居中对齐卡片，与 win-modal.js 双按钮行同一套居中公式，纵向相对
      // Frame 原点 294；每个按钮框 148×55，按钮图片 176×88，相对自身按钮框再偏移
      // -14,-16），按钮素材直接复用 loseModal 的 btnGameTimeBack/btnGameWatchVideo ──
      var btnBoxW = px(148), btnBoxH = px(55);
      var btnImgW = px(176), btnImgH = px(88), btnImgDX = px(-14), btnImgDY = px(-16);
      var btnRowW = px(301);
      var btnRowX = cardX + (cardW - btnRowW) / 2, btnRowY = FY + px(294);

      function drawImgButton(boxX, boxY, assetKey, onTap, opts) {
        return UIKit.imageButton(boxX + btnImgDX, boxY + btnImgDY, btnImgW, btnImgH, assetKey, onTap, {
          priority: 1000,
          fallbackLabel: opts.fallbackLabel, fallbackColor: opts.fallbackColor,
          fallbackFontSize: px(17), adBadge: opts.adBadge, adBadgeOpts: opts.adBadgeOpts
        });
      }

      var btn1X = btnRowX, btn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
      areas.push(drawImgButton(btn1X, btnRowY, T.primaryButtonAsset, function () {
        // 不论弹窗从主页还是通关页打开，都返回关卡列表，避免通关页继续停留在当前关卡。
        PlayController.goHome();
      }, { fallbackLabel: T.primaryLabel || '不了，谢谢', fallbackColor: 'blue' }));

      areas.push(drawImgButton(btn2X, btnRowY, T.secondaryButtonAsset, function () {
        Ads.showRewarded(function (ok) {
          if (!ok) return;
          _unlockAllProgress = Storage.addCount(CONFIG.STORAGE_KEYS.unlockAllAdCount);
          if (_unlockAllProgress >= CONFIG.AD_UNLOCK_ALL_COUNT) {
            RemoteConfig.themes.forEach(function (t) {
              Storage.markThemePermUnlocked(t.id);
            });
            UIKit.toast('🎊 全部主题已永久解锁！');
            SceneManager.close();
            var nextLevel = this._nextLevel || _findNextThemeLevel();
            if (nextLevel) {
              PlayController.pickLevel(nextLevel.idx);
            } else {
              PlayController.goHome();
            }
          } 
        }.bind(this), 'unlock_all');
      }, {
        fallbackLabel: '看视频', fallbackColor: 'green'
      }));

      // 高优先级全屏吸收（防止穿透命中下层首页按钮）
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'unlock-all-absorber',
        onTap: function () {}
      });

      InputManager.addAll(areas);
    }
  });

  // ── 分享解锁（卡片式风格，对齐 unlock-all-overlay 的白底卡片 + 顶部绶带横幅 +
  //   中间图标 + 文案 + 双图片按钮布局，素材/文案均可在 product.config.js
  //   TEMPLATE.shareUnlockModal 配置）────────────────────────────────────────────
  SceneManager.register('share-unlock-overlay', {
    _themeId: null,
    enter: function (data) { this._themeId = data && data.themeId; },
    draw: function () {
      var px = M3.Layout.px;
      var T = CONFIG.TEMPLATE.shareUnlockModal || {};
      var W = M3.Layout.w, H = M3.Layout.h;
      var cx = W / 2;
      var themeId = this._themeId;

      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.7)' });

      var areas = [];

      // ── Frame 原点（FX, FY）：312 宽，整组视觉（横幅顶部 -31 ~ 按钮底部 349），
      // 布局参数与 unlock-all-overlay / lose-modal.js card-image 样式保持一致，
      // 水平/垂直均居中于屏幕 ──────────────────────────────────────────────────
      var FW = px(312);
      var groupTop = px(-31), groupBottom = px(294) + px(55); // 349
      var groupH = groupBottom - groupTop; // 380
      var FX = cx - FW / 2;
      var FY = (H - groupH) / 2 - groupTop;

      // 卡片背景（相对 Frame 原点 5,0，307×279）
      var cardX = FX + px(5), cardY = FY + 0, cardW = px(307), cardH = px(279);
      var cardSrc = T.bgImageAsset ? CONFIG.uiAsset(T.bgImageAsset) : null;
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      // 标题绶带（相对 Frame 原点 21,-31，279×93，文字「分享解锁」已烘焙进图）
      var bannerX = FX + px(21), bannerY = FY - px(31), bannerW = px(279), bannerH = px(93);
      var bannerSrc = T.ribbonAsset ? CONFIG.uiAsset(T.ribbonAsset) : null;
      var bannerEntry = bannerSrc ? TextureManager.get(bannerSrc) : null;
      if (bannerEntry) {
        Renderer.drawImage(bannerSrc, bannerX, bannerY, bannerW, bannerH);
      } else {
        Renderer.drawRoundRect(bannerX, bannerY, bannerW, bannerH, px(12), { fill: 'rgba(90,60,180,0.9)' });
        Renderer.drawText('分享解锁', bannerX + bannerW / 2, bannerY + bannerH / 2 - (px(24) * 1.4) / 2, {
          fontSize: px(24), color: '#FED41A', align: 'center', bold: true,
          strokeColor: '#470501', strokeWidth: px(2.5)
        });
      }

      // 中间锁图标（水平居中于卡片，相对 Frame 原点纵向 41）
      var iconSize = px(122);
      var iconX = FX + FW / 2 - iconSize / 2, iconY = FY + px(41);
      var iconSrc = T.iconAsset ? CONFIG.uiAsset(T.iconAsset) : null;
      var iconEntry = iconSrc ? TextureManager.get(iconSrc) : null;
      if (iconEntry) {
        Renderer.drawImage(iconSrc, iconX, iconY, iconSize, iconSize);
      }

      // 副文案（相对 Frame 原点 35,189，247×56，fontSize20），无需高亮数值，纯文字
      var subtitleX = FX + px(35), subtitleY = FY + px(189), subtitleW = px(247);
      var subtitleTemplate = T.subtitle || '分享给好友\n即可永久解锁该主题';
      UIKit.drawHighlightText(subtitleTemplate, '', subtitleX + subtitleW / 2, subtitleY);

      // ── 双按钮行（水平居中对齐卡片，与 win-modal.js 双按钮行同一套居中公式，纵向相对
      // Frame 原点 294；每个按钮框 148×55，按钮图片 176×88，相对自身按钮框再偏移
      // -14,-16），左「我在想想」关闭，右「立即分享」分享后解锁 ──────────────────
      var btnBoxW = px(148), btnBoxH = px(55);
      var btnImgW = px(176), btnImgH = px(88), btnImgDX = px(-14), btnImgDY = px(-16);
      var btnRowW = px(301);
      var btnRowX = cardX + (cardW - btnRowW) / 2, btnRowY = FY + px(294);

      function drawImgButton(boxX, boxY, assetKey, onTap, opts) {
        return UIKit.imageButton(boxX + btnImgDX, boxY + btnImgDY, btnImgW, btnImgH, assetKey, onTap, {
          priority: 1000,
          fallbackLabel: opts.fallbackLabel, fallbackColor: opts.fallbackColor,
          fallbackFontSize: px(17)
        });
      }

      var btn1X = btnRowX, btn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
      areas.push(drawImgButton(btn1X, btnRowY, T.primaryButtonAsset, function () {
        if (PlayController._releaseThemeTransitionLock) PlayController._releaseThemeTransitionLock();
        SceneManager.close();
      }, { fallbackLabel: '我在想想', fallbackColor: 'blue' }));

      areas.push(drawImgButton(btn2X, btnRowY, T.secondaryButtonAsset, function () {
        // 之前这里是「调用即解锁」：不管 ks.shareAppMessage 是否真的弹出分享面板、
        // 用户是否完成分享，代码都同步立刻解锁+关闭弹窗——在非快手环境（如浏览器
        // 预览）下 KwaiShare.share 会直接走 fail 兜底分支，表现就是完全没看到分享
        // 面板就已经解锁，等于分享这一步形同虚设。改为真正依赖 success 回调：
        // 只有 ks.shareAppMessage 判定分享成功才解锁，取消/失败给出对应提示且不解锁。
        KwaiShare.share({
          title: CONFIG.SHARE_TITLE,
          extraQuery: { themeId: themeId },
          success: function () {
            Storage.markThemePermUnlocked(themeId);
            UIKit.toast('🎉 主题已永久解锁！');
            SceneManager.close();
            var levels = RemoteConfig.getLevelsByTheme(themeId);
            if (levels && levels[0]) {
              PlayController.pickLevel(levels[0].idx);
            } else {
              if (PlayController._releaseThemeTransitionLock) PlayController._releaseThemeTransitionLock();
              PlayController.goHome();
            }
          },
          fail: function () {
            if (PlayController._releaseThemeTransitionLock) PlayController._releaseThemeTransitionLock();
            UIKit.toast('取消分享，主题未解锁');
          }
        });
      }, { fallbackLabel: '立即分享', fallbackColor: 'orange' }));

      // 高优先级全屏吸收（防止穿透命中下层首页按钮）
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'share-unlock-absorber',
        onTap: function () {}
      });

      InputManager.addAll(areas);
    }
  });

  // ── 每日广告解锁主题 ─────────────────────────────────────────────────────────
  SceneManager.register('daily-ad-unlock-overlay', {
    _themeId: null, _themeDesc: '',
    enter: function (data) {
      this._themeId   = data && data.themeId;
      this._themeDesc = (data && data.desc) || '每日观看视频解锁';
    },
    draw: function () {
      var px = M3.Layout.px;
      var W = M3.Layout.w, H = M3.Layout.h;
      var cw = W - px(60), ch = px(260);
      var cx = (W - cw) / 2, cy = (H - ch) / 2;
      var themeId = this._themeId;

      var areas = UIKit.drawModalCard(cx, cy, cw, ch, '🎬 每日解锁', function () {
        SceneManager.close();
      }, 900);

      Renderer.drawText(this._themeDesc, W/2, cy + px(100), {
        fontSize: px(14), color: '#334', align: 'center', maxWidth: cw - px(40), maxLines: 3
      });
      Renderer.drawText('次日 0 点自动重置', W/2, cy + px(154), {
        fontSize: px(12), color: '#888', align: 'center'
      });

      areas.push(UIKit.drawButton((W - px(200)) / 2, cy + ch - px(60), px(200), px(40), '📺 看视频进入', {
        bgColor: '#ff8800', textColor: '#fff', fontSize: px(14), radius: px(20), adBadge: true
      }, function () {
        var _levels = RemoteConfig.getLevelsByTheme(themeId);
        if (_levels && _levels[0]) PlayController.preloadLevelAssets(_levels[0]);
        Ads.showRewarded(function (ok) {
          if (!ok) return;
          Storage.markDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, themeId);
          UIKit.toast('🎉 今日已解锁，明日记得再来！');
          SceneManager.close();
          // 延迟进关
          setTimeout(function () {
            var levels = RemoteConfig.getLevelsByTheme(themeId);
            if (levels && levels.length) PlayController.pickLevel(levels[0].idx);
          }, 200);
        }, 'theme_daily');
      }, 850));

      InputManager.addAll(areas);
    }
  });

  // ── 章节完结（对齐新模版「美女来找茬」winCard/winDecoration 卡片风格）──────────
  //   绶带「胜利通关」(winDecoration) 叠在卡片(winCard)顶部边缘 · 文案「敬请期待新章节」
  //   唯一按钮「回到首页」
  SceneManager.register('chapter-done', {
    enter: function () {},
    draw: function () {
      var px = M3.Layout.px;
      var W = M3.Layout.w, H = M3.Layout.h;
      var cx = W / 2;

      // 注意：必须用 drawRoundRect(radius=0) 而非 drawRect 画全屏蒙层，原因见
      // win-modal.js _drawFullscreen 同位置注释（ShapeBatch 固定晚于 SpriteBatch
      // flush，drawRect 会盖在卡片/绶带图之上而非垫底）。
      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.7)' });

      var areas = [];

      // 左上角返回按钮
      areas.push(UIKit.drawBackCloseButton(function () { PlayController.goHome(); }, 200));

      // 卡片面板（winCard.png，拉伸铺满目标矩形；无角色图，卡片更矮）
      var cardW = px(300), cardH = px(250);
      var cardX = cx - cardW / 2;
      var cardY = (H - cardH) / 2;
      var cardSrc = CONFIG.uiAsset('winCard');
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      // 绶带横幅（「胜利通关」文字已烘焙进图），叠在卡片上边缘之上
      var decoW = px(236), decoH = decoW * (273 / 732);
      var decoX = cx - decoW / 2;
      var decoY = cardY - decoH * 0.52 - px(3);
      var decoSrc = CONFIG.uiAsset('winDecoration');
      var decoEntry = decoSrc ? TextureManager.get(decoSrc) : null;
      if (decoEntry) {
        Renderer.drawImage(decoSrc, decoX, decoY, decoW, decoH);
      } else {
        Renderer.drawRoundRect(decoX, decoY, decoW, decoH, px(12), { stroke: '#f7f7ff', strokeW: px(2) });
      }

      // 内容：敬请期待新章节
      var txtY = cardY + decoH * 0.52 + px(56);
      Renderer.drawText('敬请期待新章节', cx, txtY, {
        fontSize: px(17), color: '#33266B', align: 'center', bold: true,
        maxWidth: cardW - px(40)
      });

      // 单按钮「回到首页」（btn_game_back_home.png 图片按钮，文字已烘焙进图）
      var btnImgW = px(176), btnImgH = px(88);
      var b1x = cx - btnImgW / 2;
      var bby = cardY + cardH - px(28) - px(56) - (btnImgH - px(56)) / 2;
      var backHomeSrc = CONFIG.uiAsset('btnGameBackHome');
      var backHomeEntry = backHomeSrc ? TextureManager.get(backHomeSrc) : null;
      if (backHomeEntry) {
        Renderer.drawImage(backHomeSrc, b1x, bby, btnImgW, btnImgH);
        areas.push({
          x: b1x, y: bby, w: btnImgW, h: btnImgH,
          priority: 20, label: 'img-btn-btnGameBackHome',
          onTap: UIKit._wrapTapSound(function () { PlayController.goHome(); })
        });
      } else {
        areas.push(UIKit.candyButton(cx - px(110), cardY + cardH - px(28) - px(56), px(220), px(56), '回到首页', 'green', function () {
          PlayController.goHome();
        }, { fontSize: px(17), priority: 20 }));
      }

      // 全屏吸收
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 17, label: 'chapter-absorber',
        onTap: function () {}
      });

      InputManager.addAll(areas);
    }
  });

  // ── Story 通关揭示（对齐旧版 game.js drawStoryRevealModal L4157-4217）──────────
  //   奶白卡片 #FFF8E8 + 深蓝描边 #123E73 + 内描边 #D4B36A
  //   标题「通关揭示」24px #0A3768，金色分割线 #C5A45E
  //   正文 bold 14px #17365B，左对齐
  //   「下一关钩子」section header 16px #8B241D
  //   hook 文字框 #FFF0CD，bold 13px #4B3828，居中
  //   双 candyButton 48×auto
  SceneManager.register('story-reveal', {
    _data: null,
    enter: function (data) { this._data = data; },
    draw: function () {
      var px = M3.Layout.px;
      var d  = this._data || {};
      var W  = M3.Layout.w, H = M3.Layout.h;
      var cx = W / 2;
      var level = d.level || {};

      // 深蓝遮罩（drawRoundRect radius=0 避免 drawRect 的 ShapeBatch z-order 坑）
      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(5,20,42,0.84)' });

      var cardX = px(11), cardW = W - px(22), pad = px(22);
      var revealText = level.epilogue || '';
      var hookText = level.nextHook || '';

      // 折行计算
      var fs14 = px(14), fs13 = px(13);
      var bodyLines = [];
      revealText.split('\n').forEach(function (p) {
        _wrapLines(p, cardW - pad * 2, fs14, 3).forEach(function (line) { bodyLines.push(line); });
      });
      var hookLines = _wrapLines(hookText, cardW - pad * 2 - px(24), fs13, 3);

      var cardH = Math.min(H - px(34), px(308) + bodyLines.length * px(21) + hookLines.length * px(20));
      var cardY = Math.max(px(17), (H - cardH) / 2);

      // 卡片：奶白底 + 深蓝描边
      Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(20), { fill: '#FFF8E8' });
      Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(20), { stroke: '#123E73', strokeW: px(5) });
      Renderer.drawRoundRect(cardX + px(7), cardY + px(7), cardW - px(14), cardH - px(14), px(15), { stroke: '#D4B36A', strokeW: px(1.5) });

      // 标题「通关揭示」
      var y = cardY + px(37);
      Renderer.drawText('通关揭示', cx, y - (px(24) * 1.4) / 2, {
        fontSize: px(24), color: '#0A3768', align: 'center',
        strokeColor: 'rgba(255,255,255,0.45)', strokeWidth: px(0.8)
      });
      y += px(26);

      // 金色分割线 + 菱形
      Renderer.drawRect(cardX + pad, y, cx - cardX - pad - px(9), px(1), '#C5A45E');
      Renderer.drawRect(cx + px(9), y, cardX + cardW - pad - cx - px(9), px(1), '#C5A45E');
      // 菱形（用旋转矩形近似 → 用 drawCircle 不可，用 drawRect 小方块）
      Renderer.drawRoundRect(cx - px(4), y - px(4), px(8), px(8), px(1), { fill: '#C5A45E' });
      y += px(27);

      // 正文（左对齐，bold 14px #17365B）
      for (var i = 0; i < bodyLines.length; i++) {
        Renderer.drawText(bodyLines[i], cardX + pad, y + i * px(21), {
          fontSize: fs14, color: '#17365B', align: 'left', bold: true
        });
      }
      y += bodyLines.length * px(21) + px(20);

      // 分隔线
      Renderer.drawRoundRect(cardX + pad - px(5), y - px(8), cardW - pad * 2 + px(10), px(1), px(1), { fill: '#F4E6C7' });

      // 「下一关钩子」section header
      Renderer.drawText('下一关钩子', cardX + pad, y + px(13) - (px(16) * 1.4) / 2, {
        fontSize: px(16), color: '#8B241D', align: 'left',
        strokeColor: 'rgba(255,255,255,0.35)', strokeWidth: px(0.6)
      });
      y += px(60);

      // hook 文字框
      var hookBoxH = hookLines.length * px(20) + px(24);
      Renderer.drawRoundRect(cardX + pad, y - px(7), cardW - pad * 2, hookBoxH, px(10), { fill: '#FFF0CD' });
      var hookTextStartY = y - px(7) + (hookBoxH - hookLines.length * px(20)) / 2 + px(10);
      for (var j = 0; j < hookLines.length; j++) {
        Renderer.drawText(hookLines[j], cx, hookTextStartY + j * px(20) - (fs13 * 1.4) / 2, {
          fontSize: fs13, color: '#4B3828', align: 'center', bold: true
        });
      }

      // 星星
      if (d.stars) {
        UIKit.drawStars(cx, cardY + cardH - px(48) - px(20), 3, d.stars, px(20), px(6));
      }

      // 双按钮
      var bh = px(48), gap = px(12), bw = (cardW - pad * 2 - gap) / 2;
      var btnY = cardY + cardH - bh - px(40);
      var b1x = cardX + pad, b2x = b1x + bw + gap;

      var areas = [];
      areas.push(UIKit.candyButton(b1x, btnY, bw, bh, '返 回', 'blue', function () {
        PlayController.goHome();
      }, { fontSize: px(15), priority: 10 }));

      var levels = RemoteConfig.getLevelsByTheme(level.themeId || 0);
      var curPos = levels.findIndex(function (lv) { return lv.idx === level.idx; });
      var hasNext = curPos >= 0 && curPos < levels.length - 1;

      areas.push(UIKit.candyButton(b2x, btnY, bw, bh, '下一关', 'green', function () {
        if (hasNext) PlayController.pickLevel(levels[curPos + 1].idx);
        else PlayController.goHome();
      }, { fontSize: px(15), priority: 10 }));

      // 全屏吸收
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 9, label: 'story-reveal-absorber',
        onTap: function () {}
      });

      InputManager.addAll(areas);
    }
  });

  // ── 我的战绩面板 ─────────────────────────────────────────────────────────────
  SceneManager.register('profile-panel', {
    enter: function () {},
    draw: function () {
      var px = M3.Layout.px;
      var W    = M3.Layout.w, H = M3.Layout.h;
      var cw   = W - px(40), ch = px(300);
      var cx   = (W - cw) / 2, cy = (H - ch) / 2;

      var areas = UIKit.drawModalCard(cx, cy, cw, ch, '🏆 我的战绩', function () {
        SceneManager.close();
      }, 900);

      var user  = Storage.get(CONFIG.STORAGE_KEYS.user) || {};
      var stats = Storage.getStats();
      var ptMs  = Storage.get(CONFIG.STORAGE_KEYS.playtimeMs) || 0;
      var ptMin = Math.floor(ptMs / 60000);

      // 用户行
      Renderer.drawText(user.nickName || '铁子', W/2, cy + px(88), {
        fontSize: px(16), color: '#334', align: 'center'
      });
      Renderer.drawText('游玩时长 ' + ptMin + ' 分钟', W/2, cy + px(114), {
        fontSize: px(12), color: '#778', align: 'center'
      });

      // 统计行
      var rows = [
        ['闯关数', stats.levelPass || 0],
        ['找对', stats.correct || 0],
        ['找错', stats.wrong || 0],
        ['正确率', stats.correct > 0 ? Math.round(stats.correct / (stats.correct + stats.wrong) * 100) + '%' : '0%']
      ];
      for (var i = 0; i < rows.length; i++) {
        var ry = cy + px(148) + i * px(32);
        Renderer.drawText(rows[i][0], cx + px(60), ry, { fontSize: px(13), color: '#556', align: 'left' });
        Renderer.drawText(String(rows[i][1]), cx + cw - px(60), ry, { fontSize: px(13), color: '#224', align: 'right' });
      }

      InputManager.addAll(areas);
    }
  });
})();
