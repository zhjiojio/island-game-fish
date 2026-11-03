/**
 * scenes/home.js — 主题选择（首页）
 * 功能：
 *   - 头部：头像（点击战绩）+ title 图
 *   - 主题卡片列表（自适应卡高）
 *   - 底部 4 入口栏（设置/解锁全部/添加桌面/分享）
 *   - 各主题解锁策略分发
 * 依赖：Renderer, UIKit, TextureManager, CONFIG, RemoteConfig, Storage, Audio, Ads, Telemetry
 */
(function () {
  'use strict';

  var _scrollY = 0;
  var _prevMoveY = 0;
  var _scrollVelocity = 0;
  var _currentPage = 0;
  var _preloadedThemeIds = {};
  var _preloadedThemeBgmIds = {};

  // home 页按可用高度（扣除 safeTop）计算缩放系数，而非纯宽度比例，
  // 避免高屏机型元素被拉得过大、矮屏机型元素挤在一起。各 draw 方法通过 _px() 统一使用。
  function _px(n) {
    var usableH = M3.Layout.h - (M3.Layout.safeTop || 0);
    var scale = Math.max(CONFIG.LAYOUT_SCALE_MIN,
      Math.min(CONFIG.LAYOUT_SCALE_MAX, usableH / CONFIG.VH));
    return Math.round(n * scale);
  }

  // ── 首页关键 UI 素材清单（单一数据源） ─────────────────────────────────────
  // 之前这份列表只在 enter() 里内联，导致 welcome.js 的加载条根本不知道首页
  // 还需要这些图：玩家在欢迎页等完加载条、点了"立即找茬"，一进首页这些图才刚
  // 发起网络请求，首帧必然是空白/占位的丑图。现在抽成独立函数，
  // 同时供 enter() 自己使用，以及 welcome.js 在按钮出现前提前拉取。
  // 返回值已经是 CONFIG.uiAsset() 解析过的实际 src（CDN 优先），并按
  // T.bottomBarStyle/showTopRightActions/showNavArrows 等模板开关过滤，
  // 与 enter() 里实际会用到的素材完全一致，避免预加载和真实渲染用到的两份
  // 清单出现"改一处忘了改另一处"的漂移。
  function _criticalAssetSrcs() {
    var T = CONFIG.TEMPLATE.home;
    var keys = ['avatarFrame', 'star', 'cardBg', 'tagHot', 'tagNew', 'tagHard',
      'btnSettings', 'btnUnlock', 'btnDesktop', 'btnShare',
      'mnvPageBg']; // mnvBgPuzzle 已停用（暗纹已烘焙进新版 mnvPageBg，见 ui-kit.js drawFlowingBackground）

    if (T.bottomBarStyle === 'round') {
      keys = keys.concat(['btnDailyCheckin', 'btnAddDesktop', 'btnUnlockAll',
        'mnvCardNoteWhite', 'mnvCardNoteGreen', 'mnvIconLock',
        'mnvBadgeHot', 'mnvBadgeNew', 'cardNailIcon']);
    }
    if (T.showTopRightActions) {
      keys = keys.concat(['btnSettings', 'mnvBtnBgPill']);
    }
    if (T.showNavArrows) {
      keys = keys.concat(['mnvBtnSetting', T.titleLogoAsset, T.subtitleBannerAsset,
        T.pagePrevDoubleAsset, T.pagePrevAsset, T.pageNextAsset, T.pageNextDoubleAsset]);
    }

    var srcs = [];
    var seen = {};
    keys.forEach(function (key) {
      if (!key) return;
      var src = CONFIG.uiAsset(key);
      if (src && !seen[src]) { seen[src] = true; srcs.push(src); }
    });
    return srcs;
  }

  // 供 welcome.js 的欢迎页加载条提前预热首页素材（见 welcome.js criticalAssets）
  window.HomeAssets = {
    criticalAssetSrcs: _criticalAssetSrcs
  };

  SceneManager.register('home', {
    enter: function () {
      _scrollY = 0;
      _preloadedThemeIds = {};
      _preloadedThemeBgmIds = {};
      Audio.startBgmTrack('select_level');
      Telemetry.homeReady();
      Analytics.trackScreen('home');

      if (typeof KwaiShortcut !== 'undefined') {
        KwaiShortcut.check({
          onSuccess: function () { Storage.set(CONFIG.STORAGE_KEYS.shortcutInstalled, '1'); },
          onFail: function () {}
        });
      }

      (RemoteConfig.themes || []).forEach(function (t) {
        var coverSrc = RemoteConfig.getThemeCoverSrc(t);
        if (coverSrc) TextureManager.load(coverSrc);
      });

      // 游戏公共 UI 不阻塞首页，但在用户浏览主题期间提前放入缓存，避免点击关卡
      // 后才开始请求顶部 HUD、错误提示和结算弹窗素材。
      if (window.PlayController && PlayController.preloadGameUiAssets) {
        PlayController.preloadGameUiAssets();
      }

      // 首页关键 UI 素材：正常情况下 welcome.js 的加载条早已把这批图预加载完，
      // 这里只是兜底再发一轮（TextureManager 内部按 src 去重，已缓存的直接命中）。
      _criticalAssetSrcs().forEach(function (src) {
        TextureManager.load(src);
      });

      KwaiAd.showBanner();
    },

    exit: function () {
      Analytics.leaveScreen('home');
      KwaiAd.hideBanner();
    },

    draw: function () {
      var W = M3.Layout.w, H = M3.Layout.h;
      var safeTop = M3.Layout.safeTop;
      var safeBottom = M3.Layout.safeBottom || 0;
      var px = _px;
      var areas = [];
      var visibleThemes = [];
      var T = CONFIG.TEMPLATE.home;

      UIKit.drawFlowingBackground(W, H);

      var headerY = safeTop + px(58);
      var headerH = px(46);

      if (T.showNavArrows) {
        // 与关卡内部（hud.js）返回按钮共用同一坐标来源，保证两处位置/大小完全一致
        var backRect = CONFIG.getBackButtonRect();
        // 关卡列表页的设置入口比游戏页返回按钮略大，并向下错开一点，
        // 让齿轮图标在首页头部区域里更醒目，同时不改变游戏页 HUD 的按钮尺寸。
        var backSize = px(52);
        var backX = backRect.x + (backRect.size - backSize) / 2;
        var backY = backRect.y + px(20);
        // 关卡列表页不再返回欢迎页；复用原返回键位置承载设置入口。
        var backSrc = CONFIG.uiAsset('mnvBtnSetting');
        var backEntry = backSrc ? TextureManager.get(backSrc) : null;
        if (backEntry) {
          Renderer.drawImage(backSrc, backX, backY, backSize, backSize);
        } else {
          Renderer.drawText('◀', backX + backSize / 2, backY + backSize / 2 - px(14), {
            fontSize: px(20), color: '#ffffff', align: 'center', bold: true,
            strokeColor: 'rgba(0,0,0,0.5)', strokeWidth: px(2)
          });
        }
        areas.push({
          x: backX, y: backY, w: backSize, h: backSize,
          priority: 200, label: 'nav-settings',
          onTap: function () {
            Audio.playUiClick();
            SceneManager.open('settings-overlay', { from: 'home' });
          }
        });

        if (T.subtitleBannerAsset) {
          var subSrc = CONFIG.uiAsset(T.subtitleBannerAsset);
          var subEntry = subSrc ? TextureManager.get(subSrc) : null;
          if (subEntry) {
            var subW = px(206), subH = px(34);
            Renderer.drawImage(subSrc, (W - subW) / 2, headerY + px(42), subW, subH);
          }
        }
        if (T.titleLogoAsset) {
          var logoSrc = CONFIG.uiAsset(T.titleLogoAsset);
          var logoEntry = logoSrc ? TextureManager.get(logoSrc) : null;
          if (logoEntry) {
            var logoW = px(156), logoH = px(72);
            Renderer.drawImage(logoSrc, (W - logoW) / 2, headerY - px(26), logoW, logoH);
          }
        }
      } else {
        var avX = px(10), frameSize = px(52), avSize = px(34);
        var avY = headerY + (headerH - frameSize) / 2 + px(4);
        var avCx = avX + frameSize / 2, avCy = avY + frameSize / 2 - px(3);

        var frameEntry = TextureManager.get(CONFIG.uiAsset('avatarFrame'));
        if (frameEntry) {
          Renderer.drawImage(CONFIG.uiAsset('avatarFrame'), avX, avY, frameSize, frameSize);
        }
        Renderer.drawCircle(avCx, avCy, avSize / 2, { fill: '#e85f2c' });
        Renderer.drawText('铁', avCx, avCy - (px(16) * 1.4) / 2, {
          fontSize: px(16), color: '#fff', align: 'center', bold: true
        });
        Renderer.drawCircle(avCx, avCy, avSize / 2, { stroke: '#79AFFF', strokeW: px(3) });
        areas.push({
          x: avX - px(4), y: avY - px(4), w: frameSize + px(8), h: frameSize + px(8),
          priority: 50, label: 'avatar',
          onTap: function () { Audio.playUiClick(); SceneManager.open('profile-panel'); }
        });

        var TITLE_RATIO = 428 / 124;
        var titleH = px(62), titleW = titleH * TITLE_RATIO;
        Renderer.drawImage(CONFIG.uiAsset('title'), (W - titleW) / 2, headerY + (headerH - titleH) / 2, titleW, titleH);
      }

      // ── 主题卡片 ──
      var themes2 = RemoteConfig.themes || [];
      var themeCount = themes2.length;
      var bottomBarH = px(T.bottomBarStyle === 'round' ? 130 : 110);
      var listTop = headerY + headerH + px(5);

      if (T.cardLayout === 'grid') {
        var cardSizeRaw = T.cardSize || { w: 100, h: 108 };
        var cardSize = { w: px(cardSizeRaw.w), h: px(cardSizeRaw.h) };
        var gridGap = px(6);
        var gridCols = 2;
        var gridTotalW = gridCols * cardSize.w + gridCols * gridGap;
        var gridStartX = (W - gridTotalW) / 2;
        var availableH2 = H - listTop - bottomBarH - px(10);

        if (T.showProgress) {
          // 分页模式：每页固定展示 itemsPerPage 个，不做连续滚动，翻页即刷新当前页内容
          var itemsPerPage2 = 6;
          var totalPages2 = Math.max(1, Math.ceil(themeCount / itemsPerPage2));
          _currentPage = Math.max(0, Math.min(_currentPage, totalPages2 - 1));
          var pageStart = _currentPage * itemsPerPage2;
          var pageEnd = Math.min(themeCount, pageStart + itemsPerPage2);

          // 大屏/高屏下卡片总高度会小于可用高度，整体在可用区域内垂直居中，
          // 避免空白全部堆积在卡片底部、离翻页箭头一大截（矮屏 availableH2 不够时
          // extraH2<=0，居中偏移为 0，效果等同于原来贴顶排列，不影响小屏）。
          var pageRows2 = Math.ceil(itemsPerPage2 / gridCols);
          var pageGridH2 = pageRows2 * cardSize.h + (pageRows2 - 1) * gridGap;
          var extraH2 = Math.max(0, availableH2 - pageGridH2);
          var pageListTop = listTop + extraH2 / 2;

          for (var pi = pageStart; pi < pageEnd; pi++) {
            var localIdx = pi - pageStart;
            var prow = Math.floor(localIdx / gridCols);
            var pcol = localIdx % gridCols;
            var pgx = gridStartX + pcol * (cardSize.w + gridGap);
            var pgy = pageListTop + prow * (cardSize.h + gridGap);
            visibleThemes.push(themes2[pi]);
            this._drawThemeCardGrid(themes2[pi], pgx, pgy, cardSize.w, cardSize.h, areas);
          }
        } else {
          var gridRows = Math.ceil(themeCount / gridCols);
          var gridTotalH = gridRows * cardSize.h + (gridRows - 1) * gridGap;
          _scrollVelocity *= 0.92;
          _scrollY += _scrollVelocity;
          var maxScroll2 = Math.max(0, gridTotalH - availableH2);
          _scrollY = Math.max(0, Math.min(_scrollY, maxScroll2));

          for (var i = 0; i < themeCount; i++) {
            var row = Math.floor(i / gridCols);
            var col = i % gridCols;
            var gx = gridStartX + col * (cardSize.w + gridGap);
            var gy = listTop + row * (cardSize.h + gridGap) - _scrollY;
            if (gy + cardSize.h < listTop || gy > listTop + availableH2) continue;
            visibleThemes.push(themes2[i]);
            this._drawThemeCardGrid(themes2[i], gx, gy, cardSize.w, cardSize.h, areas);
          }
        }
      } else {
        var gap = px(10), cardW = W - px(24);
        var availableH = H - listTop - bottomBarH - px(10);
        var cardH = themeCount > 0
          ? Math.max(px(88), Math.min(px(118), Math.floor((availableH - gap * (themeCount - 1)) / themeCount)))
          : px(100);
        var cardX = px(12);
        var listH = availableH;
        _scrollVelocity *= 0.92;
        _scrollY += _scrollVelocity;
        var maxScroll = Math.max(0, themeCount * (cardH + gap) - listH);
        _scrollY = Math.max(0, Math.min(_scrollY, maxScroll));

        for (var j = 0; j < themeCount; j++) {
          var t = themes2[j];
          var cy = listTop + j * (cardH + gap) - _scrollY;
          if (cy + cardH < listTop || cy > listTop + listH) continue;
          visibleThemes.push(t);
          this._drawThemeCard(t, cardX, cy, cardW, cardH, areas);
        }
      }

      // 只预热当前帧真正可见的主题。分页切换或滚动后，下一帧会自然补充新出现
      // 的主题；_preloadedThemeIds 负责避免每帧重复提交同一主题的预热请求。
      if (window.PlayController && PlayController.preloadThemeLevelAssets) {
        visibleThemes.forEach(function (theme) {
          if (!theme || _preloadedThemeIds[theme.id]) return;
          _preloadedThemeIds[theme.id] = true;
          PlayController.preloadThemeLevelAssets(theme);
        });
      }
      if (window.Audio && Audio.preloadThemeBgm) {
        visibleThemes.forEach(function (theme) {
          if (!theme || _preloadedThemeBgmIds[theme.id]) return;
          _preloadedThemeBgmIds[theme.id] = true;
          Audio.preloadThemeBgm(theme);
        });
      }

      // ── 底部栏 ──
      if (T.bottomBarStyle === 'round') {
        var roundSize = px(93);
        var roundGap = px(16);
        var checkinCfg = CONFIG.TEMPLATE.checkinModal || {};
        var roundItems = [
          { key: 'btnUnlockAll',     label: '全部解锁', id: 'unlock-all'    },
          { key: 'btnAddDesktop',    label: '添加桌面', id: 'add-desktop'   }
        ];
        if (checkinCfg.enabled !== false) {
          roundItems.unshift({ key: 'btnDailyCheckin', label: '每日签到', id: 'daily-checkin' });
        }
        var roundTotalW = roundItems.length * roundSize + (roundItems.length - 1) * roundGap;
        var roundStartX = (W - roundTotalW) / 2;
        var roundY = H - safeBottom - roundSize - px(15);

        if (T.showProgress) {
          this._drawPageNav(T, roundY - px(44), W, areas);
        }

        for (var ri = 0; ri < roundItems.length; ri++) {
          var rItem = roundItems[ri];
          var rX = roundStartX + ri * (roundSize + roundGap);
          areas.push(UIKit.drawRoundButton(
            rX, roundY, roundSize, rItem.key, rItem.label,
            (function (id) {
              return function () { handleBottomBar(id); };
            })(rItem.id),
            { priority: 60, fontSize: px(16) }
          ));
        }
      } else {
        var iconSize = px(60);
        var barY = H - safeBottom - iconSize / 2 - px(70);
        var btnItems = [
          { icon: CONFIG.uiAsset('btnSettings'), id: 'settings'   },
          { icon: CONFIG.uiAsset('btnUnlock'),   id: 'unlock-all' },
          { icon: CONFIG.uiAsset('btnDesktop'),  id: 'desktop'    },
          { icon: CONFIG.uiAsset('btnShare'),    id: 'share'      }
        ];
        var itemW = W / btnItems.length;
        for (var bi = 0; bi < btnItems.length; bi++) {
          var bItem = btnItems[bi];
          var bcx  = bi * itemW + itemW / 2;
          Renderer.drawImage(bItem.icon, bcx - iconSize / 2, barY - iconSize / 2, iconSize, iconSize);
          areas.push((function (b, c) {
            return {
              x: c - iconSize / 2, y: barY - iconSize / 2, w: iconSize, h: iconSize,
              priority: 60, label: b.id,
              onTap: function () { Audio.playUiClick(); handleBottomBar(b.id); }
            };
          })(bItem, bcx));
        }
      }

      Renderer.drawText(CONFIG.BUILD_VER, px(6), H - px(4), {
        fontSize: px(8), color: 'rgba(255,255,255,0.35)', align: 'left'
      });

      areas.push({ x: 0, y: 0, w: W, h: H, priority: 0, label: 'blank-tap', onTap: function () { Audio.playUiClick(); } });

      InputManager.addAll(areas);

      InputManager.onMove = function (cx, cy) {};
    },

    /**
     * 底部翻页导航条：双箭头(跳3行)+单箭头(跳1行) + "当前页/总页数" 文字
     * 对齐 Figma 92:214（287x44，位于3圆按钮上方）
     */
    _drawPageNav: function (T, y, W, areas) {
      var px = _px;
      var themes = RemoteConfig.themes || [];
      var themeCount = themes.length;

      var itemsPerPage = 6;
      var totalPages = Math.max(1, Math.ceil(themeCount / itemsPerPage));
      _currentPage = Math.max(0, Math.min(_currentPage, totalPages - 1));
      var currentPage = _currentPage + 1;

      // 对齐 Figma 92:214 精确尺寸：单箭头 32x32，双箭头 50x34（比单箭头宽，非等比缩放），
      // 命中框统一 44x44，图片在命中框内居中绘制（不铺满命中框）。
      var boxSize = px(44);
      var cx = W / 2;
      var rowCenterY = y + boxSize / 2;

      Renderer.drawText(currentPage + '/' + totalPages, cx, rowCenterY - (px(24) * 1.4) / 2, {
        fontSize: px(24), color: '#070857', align: 'center', bold: true
      });

      var items = [
        { asset: T.pagePrevDoubleAsset, toFirst: true, side: 'left',  centerOffset: px(-121.5), w: px(40), h: px(40) },
        { asset: T.pagePrevAsset,       dPage: -1,     side: 'left',  centerOffset: px(-73.5),  w: px(38), h: px(38) },
        { asset: T.pageNextAsset,       dPage: 1,      side: 'right', centerOffset: px(73.5),   w: px(38), h: px(38) },
        { asset: T.pageNextDoubleAsset, toLast: true,  side: 'right', centerOffset: px(121.5),  w: px(40), h: px(40) }
      ];

      items.forEach(function (item) {
        var src = item.asset ? CONFIG.uiAsset(item.asset) : null;
        var entry = src ? TextureManager.get(src) : null;
        var itemCx = cx + item.centerOffset;
        var ix = itemCx - item.w / 2;
        var iy = rowCenterY - item.h / 2;
        if (entry) {
          Renderer.drawImage(src, ix, iy, item.w, item.h);
        } else {
          Renderer.drawText(item.side === 'left' ? '◀' : '▶', itemCx, rowCenterY - (px(16) * 1.4) / 2, {
            fontSize: px(16), color: 'rgba(255,255,255,0.7)', align: 'center'
          });
        }
        areas.push({
          x: itemCx - boxSize / 2, y: rowCenterY - boxSize / 2, w: boxSize, h: boxSize,
          priority: 60, label: 'page-' + (item.toFirst ? 'first' : item.toLast ? 'last' : item.dPage),
          onTap: function () {
            if (totalPages <= 1) return;
            Audio.playUiClick();
            if (item.toFirst) {
              _currentPage = 0;
              return;
            }
            if (item.toLast) {
              _currentPage = totalPages - 1;
              return;
            }
            _currentPage = Math.max(0, Math.min(totalPages - 1, _currentPage + item.dPage));
          }
        });
      });
    },

    /**
     * 对齐原版 package/js/game.js drawThemeCardV3()：
     * pad=10（图片距卡片边缘留白），卡片底板用 card-bg.png 拉伸铺满，
     * 图片区域裁剪显示、锁定时叠加暗化遮罩，标签固定 90×44，标题/星级压在
     * 图片左下角，右下角按钮 78/96×34（矩形圆角 9，不是胶囊）。
     */
    _drawThemeCard: function (theme, x, y, w, h, areas) {
      var px = _px;
      var isLocked = !isThemeUnlocked(theme);
      var pad = px(10);
      var imgX = x + pad, imgY = y + pad - px(2), imgW = w - pad * 2, imgH = h - pad * 2 - px(2);

      if (TextureManager.get(CONFIG.uiAsset('cardBg'))) {
        Renderer.drawImage(CONFIG.uiAsset('cardBg'), x, y, w, h);
      } else {
        Renderer.drawRoundRect(x, y, w, h, px(10), { fill: '#eaf4ff', stroke: '#1a1015', strokeW: px(2) });
      }

      var coverSrc = RemoteConfig.getThemeCoverSrc(theme);
      if (coverSrc && TextureManager.get(coverSrc)) {
        Renderer.drawImageCover(coverSrc, imgX, imgY, imgW, imgH);
      } else {
        Renderer.drawRoundRect(imgX, imgY, imgW, imgH, px(10), { fill: '#6bb3e0' });
      }
      Renderer.drawRect(imgX, imgY + imgH * 0.6, imgW, imgH * 0.4, 'rgba(0,0,0,0.42)');
      if (isLocked) {
        Renderer.drawRect(imgX, imgY, imgW, imgH, 'rgba(20,25,40,0.5)');
      }
      Renderer.drawRoundRect(imgX, imgY, imgW, imgH, px(10), { stroke: '#1a1015', strokeW: px(1.6) });

      var tagMap = { '热门': 'tagHot', '上新': 'tagNew', '难度升级': 'tagHard' };
      var tagKey = tagMap[theme.tapeLabel] || 'tagHot';
      Renderer.drawImage(CONFIG.uiAsset(tagKey), x - px(4), y + px(8), px(90), px(44));

      Renderer.drawText(theme.short || theme.subject || '', imgX + px(12), imgY + imgH - px(36) - (px(22) * 1.4) / 2, {
        fontSize: px(22), color: '#ffffff', align: 'left', maxWidth: imgW - px(24),
        strokeColor: '#1a1015', strokeWidth: px(4.5), bold: true
      });

      var starImg = CONFIG.uiAsset('star');
      for (var si = 0; si < (theme.stars || 0); si++) {
        Renderer.drawImage(starImg, imgX + px(14) + si * px(16), imgY + imgH - px(20), px(13), px(13));
      }

      var isDailyUnlockedToday = theme.unlockBy === 'rewardedAd' && theme.dailyUnlock && !isLocked;
      if (!isLocked) {
        var btnW1 = px(78), btnH1 = px(34);
        var bx1 = x + w - btnW1 - px(16), by1 = y + h - btnH1 - px(20);
        areas.push(this._candyButton(bx1, by1, btnW1, btnH1, '进 入', 'green', function () { handleThemeEnter(theme); }));
      } else if (theme.unlockBy === 'rewardedAd' && theme.dailyUnlock) {
        var btnW2 = px(96), btnH2 = px(34);
        var bx2 = x + w - btnW2 - px(16), by2 = y + h - btnH2 - px(20);
        areas.push(this._candyButton(bx2, by2, btnW2, btnH2, '看广告解锁', 'gold', function () { handleThemeUnlockTap(theme); }));
      } else if (theme.unlockBy === 'share') {
        var btnW3 = px(96), btnH3 = px(34);
        var bx3 = x + w - btnW3 - px(16), by3 = y + h - btnH3 - px(20);
        areas.push(this._candyButton(bx3, by3, btnW3, btnH3, '分享解锁', 'gold', function () { handleThemeUnlockTap(theme); }));
      }

      areas.push((function (t) {
        return {
          x: x, y: y, w: w, h: h,
          priority: 40, label: 'theme-' + t.id,
          onTap: function () { Audio.playUiClick(); handleThemeTap(t); }
        };
      })(theme));
    },

    _drawThemeCardGrid: function (theme, x, y, w, h, areas) {
      var px = _px;
      var isLocked = !isThemeUnlocked(theme);
      var innerPad = px(5);
      var cardBorderColor = '#141056';
      var cornerR = px(3.6);

      var cardBgSrc = CONFIG.uiAsset('mnvCardNoteWhite');
      var cardBgEntry = cardBgSrc ? TextureManager.get(cardBgSrc) : null;
      if (cardBgEntry) {
        // card_note_white/green.png 已自带：图钉+虚线选框+侧边纸张堆叠阴影+右下折角，
        // 这里只需整图铺满，不再额外画虚线框，否则会被覆盖看不出堆叠效果。
        Renderer.drawImage(cardBgSrc, x, y, w, h);
      } else {
        var cardBgColor = '#ffffff';
        Renderer.drawRoundRect(x + innerPad, y + innerPad, w - innerPad * 2, h - innerPad - px(2), cornerR, {
          fill: cardBgColor, stroke: cardBorderColor, strokeW: px(2)
        });
      }

      // 对齐 Figma：108x108 封面图嵌在卡片内的虚线框范围内（约占卡片 67%/64%），
      // 必须比卡片本体小一圈，把图钉/纸张堆叠/折角露出来，不能整卡铺满。
      var coverW = w * (108 / 162);
      var coverH = h * (108 / 170);
      var coverX = x + w * (29 / 162);
      var coverY = y + h * (20 / 170);
      var coverR = px(3.6);
      // 封面照片本身相对锁图标/钉子/遮罩单独左移 2px（视觉校正，其余元素仍以 coverX 为基准）
      var photoX = coverX - px(1);

      var gridCoverSrc = RemoteConfig.getThemeCoverSrc(theme);
      if (gridCoverSrc && TextureManager.get(gridCoverSrc)) {
        Renderer.drawImageCover(gridCoverSrc, photoX, coverY, coverW, coverH);
      } else {
        Renderer.drawRoundRect(photoX, coverY, coverW, coverH, coverR, {
          fill: '#d4d4ff'
        });
      }

      if (isLocked) {
        var lockSrc = CONFIG.uiAsset('mnvIconLock');
        var lockEntry = lockSrc ? TextureManager.get(lockSrc) : null;
        var lockSize = px(36);
        var lockX = x + w - lockSize - px(20);
        var lockY = y + h - lockSize - px(36);
        if (lockEntry) {
          Renderer.drawImage(lockSrc, lockX, lockY, lockSize, lockSize);
        } else {
          Renderer.drawText('🔒', lockX + lockSize / 2, lockY + lockSize / 2 - px(2), {
            fontSize: px(28), color: '#ffffff', align: 'center', bold: true
          });
        }
      }

      // 钉子图标叠加在封面图正上方，与图片顶边重叠（钉住照片的视觉效果）
      var nailSrc = CONFIG.uiAsset('cardNailIcon');
      if (nailSrc && TextureManager.get(nailSrc)) {
        var nailW = px(36), nailH = px(34);
        var nailX = coverX + coverW / 2 - nailW / 2;
        var nailY = coverY - nailH / 2;
        Renderer.drawImage(nailSrc, nailX, nailY, nailW, nailH);
      }

      // 对齐 Figma：标题文字中心线固定在卡片顶部往下 144px 处（170h 卡片），
      // 不要跟着卡片底边走（之前 h-innerPad-14 会随卡片高度联动，导致文字偏低）。
      var titleFontSize = px(16);
      var titleCenterY = y + h * (144 / 170);
      var labelY = titleCenterY - (titleFontSize * 1.4) / 2;
      Renderer.drawText(theme.short || theme.subject || '', x + w / 2, labelY, {
        fontSize: titleFontSize, color: '#070857', align: 'center', bold: true,
        maxWidth: w - px(10)
      });

      var badgeKey = isLocked ? 'mnvBadgeNew' : 'mnvBadgeHot';
      var badgeSrc = CONFIG.uiAsset(badgeKey);
      var badgeEntry = badgeSrc ? TextureManager.get(badgeSrc) : null;
      if (badgeEntry) {
        var badgeW = px(45), badgeH = px(44);
        Renderer.drawImage(badgeSrc, x + w - badgeW, y, badgeW, badgeH);
      }

      areas.push((function (t) {
        return {
          x: x, y: y, w: w, h: h,
          priority: 40, label: 'theme-' + t.id,
          onTap: function () { Audio.playUiClick(); handleThemeTap(t); }
        };
      })(theme));
    },

    _candyButton: function (x, y, w, h, label, color, onTap) {
      var px = _px;
      var palette = {
        green: { hi: '#96e968', shadow: 'rgba(0,70,0,0.38)',   stroke: '#1a5c00', txtStroke: '#003008' },
        gold:  { hi: '#ffb93c', shadow: 'rgba(100,50,0,0.40)', stroke: '#7a4000', txtStroke: '#3a1800' }
      };
      var p = palette[color] || palette.green;
      var r = Math.min(h / 2, px(9));
      Renderer.drawRoundRect(x + px(1), y + px(5), w, h, r, { fill: p.shadow });
      Renderer.drawRoundRect(x, y, w, h, r, { fill: p.hi, stroke: p.stroke, strokeW: px(2.5) });
      Renderer.drawText(label, x + w / 2, y + h / 2 - (px(15) * 1.4) / 2, {
        fontSize: px(15), color: '#ffffff', align: 'center',
        strokeColor: p.txtStroke, strokeWidth: px(3), bold: true
      });
      return { x: x, y: y, w: w, h: h, priority: 45, label: 'candy-' + label, onTap: UIKit._wrapTapSound(onTap) };
    }
  });

  /**
   * 判断主题是否已解锁（模块级函数，供场景 draw 和点击处理共用）
   * 注意：不要通过 SceneManager 内部注册表反查场景实例——SceneManager 未对外暴露
   * `_registry`，此前 handleThemeTap 曾误访问 `SceneManager._registry`，导致其
   * 判断结果永远是 undefined（所有主题都被当作"未解锁"，包括免费主题）。
   */
  function isThemeUnlocked(theme) {
    if (!theme) return false;
    if (window.PlayController && window.PlayController.isThemeUnlocked) {
      return window.PlayController.isThemeUnlocked(theme);
    }
    if (theme.unlocked) return true;
    if (theme.unlockBy === 'free') return true;
    if (Storage.isThemePermUnlocked(theme.id)) return true;
    if (Storage.isTempUnlockAllActive()) return true; // 签到等活动奖励的限时全部解锁
    if (theme.dailyUnlock && Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id)) return true;
    return false;
  }

  function handleThemeTap(theme) {
    if (theme.comingsoon) {
      UIKit.toast('🔜 敬请期待！');
      return;
    }
    if (isThemeUnlocked(theme)) {
      handleThemeEnter(theme);
    } else {
      handleThemeUnlockTap(theme);
    }
  }

  /**
   * 卡片右下角解锁按钮：直接触发解锁流程，不经过二次确认弹层（还原旧版
   * 「点按钮直接看广告」的直给交互）。分享解锁仍走 overlay，因为分享需要
   * 展示分享入口 UI，不能像广告一样一键触发。
   */
  function handleThemeUnlockTap(theme) {
    Telemetry.buttonClick('theme_card_unlock', { themeId: String(theme.id) });
    if (theme.unlockBy === 'share') {
      SceneManager.open('share-unlock-overlay', { themeId: theme.id });
    } else if (theme.unlockBy === 'rewardedAd' && theme.dailyUnlock) {
      var _levels = RemoteConfig.getLevelsByTheme(theme.id);
      var _lastIdx = Storage.getLastLevel(theme.id);
      var _preloadLevel = null;
      if (_lastIdx) { _preloadLevel = RemoteConfig.getLevelByIdx(_lastIdx); }
      if (!_preloadLevel && _levels && _levels.length) _preloadLevel = _levels[0];
      if (_preloadLevel) PlayController.preloadLevelAssets(_preloadLevel);
      Ads.showRewarded(function (ok) {
        if (!ok) return;
        Storage.markDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id);
        UIKit.toast('🎉 今日已解锁，明日记得再来！', 1600, 0.45, { w: 220, h: 38, radius: 8, fontSize: 15 });
        handleThemeEnter(theme);
      }, 'theme_daily');
    } else {
      UIKit.toast('敬请期待');
    }
  }

  /** 卡片右下角「进入」按钮 / 已解锁整卡点击：直接进入该主题（恢复上次所在关） */
  function handleThemeEnter(theme) {
    Telemetry.buttonClick('theme_card_enter', { themeId: String(theme.id) });

    var levels = RemoteConfig.getLevelsByTheme(theme.id);
    if (!levels || levels.length === 0) { UIKit.toast('暂无关卡'); return; }

    var lastIdx = Storage.getLastLevel(theme.id);
    var level   = null;
    if (lastIdx) {
      level = RemoteConfig.getLevelByIdx(lastIdx);
      if (!level || level.themeId !== theme.id) level = null;
    }
    if (!level) level = levels[0];

    Telemetry.firstLevelEnter();
    PlayController.pickLevel(level.idx, { fromThemeList: true });
  }

  function handleBottomBar(id) {
    switch (id) {
      case 'settings':
        SceneManager.open('settings-overlay', { from: 'home' });
        break;
      case 'unlock-all':
        var allUnlocked = (RemoteConfig.themes || []).every(function (t) {
          return Storage.isThemePermUnlocked(t.id) || t.unlocked;
        });
        if (allUnlocked) { UIKit.toast('全部场景已解锁 ✔'); return; }
        SceneManager.open('unlock-all-overlay');
        break;
      case 'desktop':
      case 'add-desktop':
        var installed = Storage.get(CONFIG.STORAGE_KEYS.shortcutInstalled);
        if (installed) { UIKit.toast('已添加到桌面'); return; }
        if (typeof ks !== 'undefined' && ks.showShortcutMenu) {
          ks.showShortcutMenu();
        } else if (typeof KwaiShortcut !== 'undefined') {
          KwaiShortcut.add({
            onSuccess: function () {
              Storage.set(CONFIG.STORAGE_KEYS.shortcutInstalled, '1');
              UIKit.toast('🏠 已添加到桌面！');
            },
            onFail: function () {}
          });
        }
        break;
      case 'share':
        KwaiShare.share({ title: CONFIG.SHARE_TITLE });
        Telemetry.buttonClick('share_friend', { from: 'home' });
        break;
      case 'daily-checkin':
        if ((CONFIG.TEMPLATE.checkinModal || {}).enabled === false) break;
        SceneManager.open('checkin-modal');
        break;
    }
  }
})();
