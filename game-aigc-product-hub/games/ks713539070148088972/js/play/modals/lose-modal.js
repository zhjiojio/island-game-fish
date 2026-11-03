/**
 * play/modals/lose-modal.js — 失败弹窗
 * 对照旧版 game.js drawLoseModal() L4352-4441 逐像素还原
 * Figma 512-2103: frame 354×341, card 354×306 (#EBF3FF, border 7px #6AA0F2, r=24)
 * banner 284×74 (left=35), 主标题 fontSize=22, 副标题 fontSize=16, 按钮 144×60
 */
(function () {
  'use strict';

  SceneManager.register('lose-modal', {
    _data: null,

    enter: function (data) { this._data = data; },

    draw: function () {
      var d = this._data || {};
      var mode = d.level && d.level.mode;
      // 计时器耗尽（limitType='time'）不区分玩法，统一走「时间已用尽」卡片图片式弹窗，
      // 优先级高于 styleByMode（见 product.config.js loseModal.timeXxxAsset 系列配置）
      if (d.limitType === 'time') {
        this._drawCardImage();
        return;
      }
      var style = CONFIG.getLoseModalStyle ? CONFIG.getLoseModalStyle(mode) : CONFIG.TEMPLATE.loseModal.style;
      if (style === 'card-image') {
        this._drawCardImage();
        return;
      }
      if (style === 'fullscreen') {
        this._drawFullscreen();
        return;
      }
      this._drawCard();
    },

    _drawCard: function () {
      var px = M3.Layout.px;
      var d  = this._data || {};
      var W  = M3.Layout.w;
      var H  = M3.Layout.h;

      var title = d.title || '时间到';
      var reviveLabel = d.reviveLabel || ('+' + CONFIG.REVIVE_ADD_TIME + '秒');

      var card = UIKit.drawLoseCard(W, H, title, function () {
        if (d.level) PlayController.pickLevel(d.level.idx);
        else SceneManager.close();
      }, 900);

      var SC = card.SC;
      var cx = card.cx;
      var cy = card.cy;
      var cw = card.cw;

      var areas = [card.closeArea];

      var line1TopY = cy + Math.round(px(89) * SC);
      var line1MidY = line1TopY + Math.round(px(18) * SC);
      var remaining = d.remaining || 0;

      var remainName = '穿越物';
      if (d.level) {
        if (d.level.mode === 'spot') remainName = '不同';
        else if (d.level.mode === 'hunt') remainName = '隐藏物';
        else if (d.level.mode === 'story') remainName = '条线索';
      }

      var seg1 = '还剩', seg2 = String(remaining), seg3 = '个' + remainName + '没找到';
      var fs19 = px(19);
      var seg1W = TextRenderer.measure(seg1, fs19, 'sans-serif');
      var seg2W = TextRenderer.measure(seg2, fs19, 'sans-serif');
      var seg3W = TextRenderer.measure(seg3, fs19, 'sans-serif');
      var totalTxtW = seg1W + seg2W + seg3W;
      var startX = W / 2 - totalTxtW / 2;

      Renderer.drawText(seg1, startX + seg1W / 2, line1MidY - (fs19 * 1.4) / 2, {
        fontSize: fs19, color: '#00255E', align: 'center', bold: true
      });
      Renderer.drawText(seg2, startX + seg1W + seg2W / 2, line1MidY - (fs19 * 1.4) / 2, {
        fontSize: fs19, color: '#FD585F', align: 'center', bold: true
      });
      Renderer.drawText(seg3, startX + seg1W + seg2W + seg3W / 2, line1MidY - (fs19 * 1.4) / 2, {
        fontSize: fs19, color: '#00255E', align: 'center', bold: true
      });

      var line2TopY = line1TopY + Math.round(px(36) * SC) + Math.round(px(8) * SC);
      var line2MidY = line2TopY + Math.round(px(13) * SC);
      var fs13 = px(13);
      Renderer.drawText('看视频+' + CONFIG.REVIVE_ADD_TIME + '秒，继续挑战吧', W / 2, line2MidY - (fs13 * 1.4) / 2, {
        fontSize: fs13, color: '#00255E', align: 'center'
      });

      var bw = Math.round(px(144) * SC);
      var bh = Math.round(px(60) * SC);
      var btnGap = Math.round(px(10) * SC);
      var b1x = cx + Math.round((cw - bw * 2 - btnGap) / 2);
      var b2x = b1x + bw + btnGap;
      var by = line2TopY + Math.round(px(26) * SC) + Math.round(px(59) * SC);

      var T2 = CONFIG.TEMPLATE.loseModal;
      if (T2.showReplayButton !== false) {
        areas.push(UIKit.candyButton(b1x, by, bw, bh, '重玩', 'blue', function () {
          if (d.level) PlayController.pickLevel(d.level.idx);
          else PlayController.goHome();
        }, { fontSize: px(17), priority: 10 }));
      }

      if (T2.showReviveButton !== false) {
        areas.push(UIKit.candyButton(b2x, by, bw, bh, reviveLabel, 'green', function () {
          PlayController.useRevive();
        }, {
          fontSize: px(17), priority: 10,
          adBadge: true,
          adBadgeOpts: { total: 1, done: 0 }
        }));
      }

      areas.push(UIKit.addDesktopButton(1000));

      InputManager.addAll(areas);
    },

    /**
     * 全屏式失败弹窗（新模版「美女来找茬」）
     * 全屏页面背景 + 深色蒙版 + 居中卡片(winCard) + 标题/文案 + 重玩/复活按钮
     * 对齐 win-modal.js _drawFullscreen 的卡片式布局，而非把 winCard 拉伸铺满全屏
     * （winCard 是 311x424 的卡片面板图，不能当全屏背景用，否则会被拉伸变形、
     * 按钮位置也会因此错乱——旧 bug）。
     */
    _drawFullscreen: function () {
      var px = M3.Layout.px;
      var d = this._data || {};
      var T = CONFIG.TEMPLATE.loseModal;
      var W = M3.Layout.w;
      var H = M3.Layout.h;
      var cx = W / 2;

      var pageBgSrc = CONFIG.uiAsset('mnvPageBg');
      var pageBgEntry = pageBgSrc ? TextureManager.get(pageBgSrc) : null;
      if (pageBgEntry) {
        Renderer.drawImageCover(pageBgSrc, 0, 0, W, H);
      }
      // 蒙层必须用 drawRoundRect(radius=0) 而非 drawRect，理由同 win-modal.js：
      // drawRect 走 ShapeBatch，统一晚于 SpriteBatch flush，会盖在卡片图之上。
      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.6)' });

      var areas = [];

      areas.push(UIKit.drawBackCloseButton(function () {
        if (d.level) PlayController.pickLevel(d.level.idx);
        else SceneManager.close();
      }, 1000));

      var showReplay = T.showReplayButton !== false;
      var showRevive = T.showReviveButton !== false;
      var bh2 = px(56), btnGap2 = px(16), btnW2 = px(244);
      var cardW = px(311);
      var cardH = px(340);
      var cardX = cx - cardW / 2;
      var cardY = M3.Layout.safeTop + px(190);

      var cardSrc = T.bgImageAsset ? CONFIG.uiAsset(T.bgImageAsset) : null;
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      var titleText = T.titleFromLevel ? (d.level && d.level.title || '') : (T.titleText || '时间到');
      var titleY = cardY + px(46);
      Renderer.drawText(titleText, cx, titleY, {
        fontSize: px(20), color: '#33266B', align: 'center', bold: true,
        maxWidth: cardW - px(40)
      });

      var remaining = d.remaining || 0;
      var remainName = '穿越物';
      if (d.level) {
        if (d.level.mode === 'spot') remainName = '不同';
        else if (d.level.mode === 'hunt') remainName = '隐藏物';
        else if (d.level.mode === 'story') remainName = '条线索';
      }
      var line1Y = titleY + px(34);
      Renderer.drawText('还剩' + remaining + '个' + remainName + '没找到', cx, line1Y, {
        fontSize: px(15), color: '#5B4B99', align: 'center',
        maxWidth: cardW - px(40)
      });

      var line2Y = line1Y + px(28);
      Renderer.drawText('看视频+' + CONFIG.REVIVE_ADD_TIME + '秒，继续挑战吧', cx, line2Y, {
        fontSize: px(13), color: '#8A7FBE', align: 'center',
        maxWidth: cardW - px(40)
      });

      var reviveY = cardY + cardH - px(28) - bh2;
      var btnY = showRevive ? reviveY - btnGap2 - bh2 : reviveY;

      if (showReplay) {
        areas.push(UIKit.candyButton(cx - btnW2 / 2, btnY, btnW2, bh2, '重玩', 'blue', function () {
          if (d.level) PlayController.pickLevel(d.level.idx);
          else PlayController.goHome();
        }, { fontSize: px(17), priority: 1000 }));
      }

      if (showRevive) {
        areas.push(UIKit.candyButton(cx - btnW2 / 2, reviveY, btnW2, bh2, d.reviveLabel || ('+' + CONFIG.REVIVE_ADD_TIME + '秒'), 'green', function () {
          PlayController.useRevive();
        }, {
          fontSize: px(17), priority: 1000,
          adBadge: true,
          adBadgeOpts: { total: 1, done: 0 }
        }));
      }

      // priority 需高于下层 game 场景 HUD 的最高优先级(settings=200)，防止点击卡片外
      // 空白区域时穿透命中被蒙版遮住的 HUD/道具栏按钮
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'lose-absorber',
        onTap: function () {}
      });

      areas.push(UIKit.addDesktopButton(1000));

      InputManager.addAll(areas);
    },

    /**
     * 卡片图片式失败弹窗（'card-image' style，主要供 dressup「次数已用尽」结算使用）
     * 逐像素还原设计稿 Frame 81（375 基准画布，375×812 视口，本引擎虚拟视口即等于
     * 375 宽逻辑像素，无需额外缩放）：
     *   - Frame 81：312×279，作为下方全部子元素的坐标原点（FX,FY）
     *   - 卡片背景图(winCard) 307×279，相对 Frame 原点 (5, 0)
     *   - 标题横幅(times_over) 279×93，相对 Frame 原点 (21, -31)，叠在卡片顶部边缘之上
     *   - 标题文字「次数已用尽」134×34 fontSize24，相对 Frame 原点 (92, -7)（已烘焙进
     *     images 时可不重复绘制，这里保留文字兜底渲染）
     *   - 沙漏装饰图标(sandy_clock) ≈122×122，相对 Frame 原点 (84, 41)，底部衬 90×90
     *     圆角矩形 #D5D5FF（未处理原稿 15.65° 旋转，引擎当前不支持图片旋转绘制）
     *   - 副文案「看视频可增加5次游戏次数」247×56 fontSize20，相对 Frame 原点 (35, 189)
     *   - 双按钮行：整体相对 Frame 原点 (5, 294)，148×55 一组，按钮图片本身比按钮框大
     *     (176×88，超出部分 -14/-16，为按钮自带发光/阴影留白，文字已烘焙进图)
     */
    _drawCardImage: function () {
      var px = M3.Layout.px;
      var d = this._data || {};
      var T = CONFIG.TEMPLATE.loseModal;
      var W = M3.Layout.w;
      var H = M3.Layout.h;
      var cx = W / 2;
      // 'time' limitType（计时器耗尽）使用独立主题素材：时钟卡片背景/横幅/图标 +
      // 「不了，谢谢」纯文字按钮 + 「补充」图片按钮（看视频加时），与 'count'（错误次数
      // 用尽）场景完全独立，见 product.config.js loseModal.timeXxxAsset 系列配置。
      var isTimeLimit = d.limitType === 'time';

      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.6)' });

      var areas = [];

      // 左上角返回按钮
      areas.push(UIKit.drawBackCloseButton(function () {
        if (d.level) PlayController.pickLevel(d.level.idx);
        else SceneManager.close();
      }, 1000));

      // ── Frame 81 原点（FX, FY）：312×279，整组视觉（横幅顶部 -31 ~ 按钮底部 349）
      // 垂直居中于屏幕，水平居中于屏幕 ────────────────────────────────────────
      var FW = px(312), FH = px(279);
      var groupTop = px(-31), groupBottom = px(294) + px(55); // 349
      var groupH = groupBottom - groupTop; // 380
      var FX = cx - FW / 2;
      var FY = (H - groupH) / 2 - groupTop;

      // 卡片背景（相对 Frame 原点 5,0，307×279）：'time' 用 lose_card.png，'count' 用 winCard.png
      var cardX = FX + px(5), cardY = FY + 0, cardW = px(307), cardH = px(279);
      var cardAssetKey = isTimeLimit ? T.timeBgImageAsset : T.bgImageAsset;
      var cardSrc = cardAssetKey ? CONFIG.uiAsset(cardAssetKey) : null;
      var cardEntry = cardSrc ? TextureManager.get(cardSrc) : null;
      if (cardEntry) {
        Renderer.drawImage(cardSrc, cardX, cardY, cardW, cardH);
      } else {
        Renderer.drawRoundRect(cardX, cardY, cardW, cardH, px(24), {
          fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4)
        });
      }

      // 标题横幅（相对 Frame 原点 21,-31，279×93）：'time' 用 clock_over.png，'count' 用 times_over.png
      var bannerX = FX + px(21), bannerY = FY - px(31), bannerW = px(279), bannerH = px(93);
      var bannerAssetKey = isTimeLimit ? T.timeTitleImageAsset : T.titleImageAsset;
      var bannerSrc = bannerAssetKey ? CONFIG.uiAsset(bannerAssetKey) : null;
      var bannerEntry = bannerSrc ? TextureManager.get(bannerSrc) : null;
      if (bannerEntry) {
        Renderer.drawImage(bannerSrc, bannerX, bannerY, bannerW, bannerH);
      } else {
        Renderer.drawRoundRect(bannerX, bannerY, bannerW, bannerH, px(12), { fill: 'rgba(90,60,180,0.9)' });
      }
      // 标题文字「次数已用尽」/「时间已用尽」（相对 Frame 原点 92,-7，134×34，fontSize24）
      // 横幅素材若已烘焙文字则可省略；此处仅在标题图缺失时兜底绘制文字
      if (!bannerEntry) {
        Renderer.drawText(d.title || (isTimeLimit ? '时间已用尽' : '次数已用尽'), FX + px(92) + px(134) / 2, FY - px(7), {
          fontSize: px(24), color: '#FED41A', align: 'center', bold: true,
          strokeColor: '#470501', strokeWidth: px(2.5)
        });
      }

      // 中间装饰图标（自带底板/阴影，水平居中于卡片，相对 Frame 原点纵向 41）：
      // 'time' 用 time_clock.png，'count' 用 sandy_clock.png
      var hgSize = px(122);
      var hgX = FX + FW / 2 - hgSize / 2, hgY = FY + px(41);
      var hgAssetKey = isTimeLimit ? T.timeHourglassAsset : T.hourglassAsset;
      var hgSrc = hgAssetKey ? CONFIG.uiAsset(hgAssetKey) : null;
      var hgEntry = hgSrc ? TextureManager.get(hgSrc) : null;
      if (hgEntry) {
        Renderer.drawImage(hgSrc, hgX, hgY, hgSize, hgSize);
      }

      // 副文案（相对 Frame 原点 35,189，247×56，fontSize20）
      // 本 style 固定展示"看视频加次数/加时间"引导文案，不use业务层传入的 d.subtitle（如
      // dressup 的"已匹配 X/Y"），避免被覆盖成非预期文案。
      // limitType 区分两种失败触发场景（见 play.js _onTimeout / dressup.js onWrongCallback）：
      //   'time'  → 计时器耗尽，看视频奖励的是「时间」，用独立的时钟主题素材+文案；
      //   'count'（默认）→ 错误次数用尽，沿用原「看视频可增加5次游戏次数」素材+文案。
      // 文案里的可配置数值(时间秒数/生命次数)单独高亮为 #f76664，其余文字为 #16115a。
      var subtitleX = FX + px(35), subtitleY = FY + px(189), subtitleW = px(247);
      var subtitleTemplate = isTimeLimit
        ? (T.watchVideoHintTime || '看广告视频\n可增加{value}秒游戏时间')
        : (T.watchVideoHint || '看视频可增加{value}次\n游戏次数');
      // 数值统一来自触发方(play.js/dressup.js)显式传入的 d.reviveAmount（= mode.getReviveAmount(limitType)），
      // 不再直接读 CONFIG.REVIVE_ADD_TIME/REVIVE_ADD_LIVES 全局常量——保证卡片文案数值与
      // 点击后 useRevive→onRevive 实际生效的数值始终来自同一个来源，不会出现两边不一致。
      var subtitleValue = typeof d.reviveAmount === 'number'
        ? d.reviveAmount
        : (isTimeLimit ? CONFIG.REVIVE_ADD_TIME : CONFIG.REVIVE_ADD_LIVES);
      UIKit.drawHighlightText(subtitleTemplate, subtitleValue, subtitleX + subtitleW / 2, subtitleY);

      // ── 双按钮行（水平居中对齐卡片，与 win-modal.js 双按钮行同一套居中公式，纵向相对
      // Frame 原点 294；每个按钮框 148×55，按钮图片 176×88，相对自身按钮框再偏移
      // -14,-16）────────────────────────────────────────────────────────────
      var btnBoxW = px(148), btnBoxH = px(55);
      var btnImgW = px(176), btnImgH = px(88), btnImgDX = px(-14), btnImgDY = px(-16);
      var btnRowW = px(301);
      var btnRowX = cardX + (cardW - btnRowW) / 2, btnRowY = FY + px(294);
      var showReplay = T.showReplayButton !== false;
      var showRevive = T.showReviveButton !== false;

      function drawImgButton(boxX, boxY, assetKey, onTap, opts) {
        var src = assetKey ? CONFIG.uiAsset(assetKey) : null;
        var entry = src ? TextureManager.get(src) : null;
        if (entry) {
          Renderer.drawImage(src, boxX + btnImgDX, boxY + btnImgDY, btnImgW, btnImgH);
          return {
            x: boxX + btnImgDX, y: boxY + btnImgDY, w: btnImgW, h: btnImgH,
            priority: 1000, label: 'img-btn-' + assetKey, onTap: UIKit._wrapTapSound(onTap)
          };
        }
        return UIKit.candyButton(boxX, boxY, btnBoxW, btnBoxH, opts.fallbackLabel, opts.fallbackColor, onTap, {
          fontSize: px(17), priority: 1000, adBadge: opts.adBadge, adBadgeOpts: opts.adBadgeOpts
        });
      }

      var singleBtnX = btnRowX + (btnRowW - btnBoxW) / 2;

      if (isTimeLimit) {
        // 'time' limitType：左「不了，谢谢」图片按钮(关闭并返回首页) + 右「补充」图片按钮(看视频加时)
        var timeBtn1X = btnRowX, timeBtn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
        areas.push(drawImgButton(timeBtn1X, btnRowY, T.timePrimaryButtonAsset, function () {
          if (d.level) PlayController.pickLevel(d.level.idx);
          else SceneManager.close();
        }, { fallbackLabel: T.timePrimaryLabel || '不了，谢谢', fallbackColor: 'blue' }));

        areas.push(drawImgButton(timeBtn2X, btnRowY, T.timeSecondaryButtonAsset, function () {
          PlayController.useRevive('time');
        }, { fallbackLabel: '补充', fallbackColor: 'green', adBadge: true, adBadgeOpts: { total: 1, done: 0 } }));
      } else if (showReplay && showRevive) {
        var btn1X = btnRowX, btn2X = btnRowX + btnBoxW + (btnRowW - btnBoxW * 2);
        areas.push(drawImgButton(btn1X, btnRowY, T.primaryButtonAsset, function () {
          if (d.level) PlayController.pickLevel(d.level.idx);
          else PlayController.goHome();
        }, { fallbackLabel: '再玩一次', fallbackColor: 'blue' }));

        areas.push(drawImgButton(btn2X, btnRowY, T.secondaryButtonAsset, function () {
          PlayController.useRevive('count');
        }, { fallbackLabel: '看视频', fallbackColor: 'green', adBadge: true, adBadgeOpts: { total: 1, done: 0 } }));
      } else if (showReplay) {
        areas.push(drawImgButton(singleBtnX, btnRowY, T.primaryButtonAsset, function () {
          if (d.level) PlayController.pickLevel(d.level.idx);
          else PlayController.goHome();
        }, { fallbackLabel: '再玩一次', fallbackColor: 'blue' }));
      } else if (showRevive) {
        areas.push(drawImgButton(singleBtnX, btnRowY, T.secondaryButtonAsset, function () {
          PlayController.useRevive('count');
        }, { fallbackLabel: '看视频', fallbackColor: 'green', adBadge: true, adBadgeOpts: { total: 1, done: 0 } }));
      }

      // 高优先级全屏吸收（防止穿透命中下层 game 场景的 HUD/道具栏按钮）
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'lose-card-absorber',
        onTap: function () {}
      });

      areas.push(UIKit.addDesktopButton(1000));

      InputManager.addAll(areas);

      // 拖拽热区吸收（防止穿透命中下层 dressup 换装拖拽/横向滚动条——tap 和 drag 是
      // InputManager 两套独立命中表，仅注册 tapArea 挡不住 dragArea，见 dressup.js
      // DressupMode.prototype.draw 里每帧无条件 addDrag 的换装衣服/滚动条热区）。
      // 注意：handleStart 会优先判定 dragArea（见 core/input.js handleStart 注释），
      // 全屏 absorber 会让按下事件永远先命中它、handleTap 再也不会被调用，导致弹窗
      // 按钮全部失灵——因此必须把按钮区域(priority>=1000)也镜像注册进 dragArea，
      // 用更高的 priority 排在 absorber 之前，命中时直接触发原 onTap 回调。
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
        priority: 500, label: 'lose-card-drag-absorber',
        onDragStart: function () { return true; },
        onDragMove: function () {},
        onDragEnd: function () {}
      });
    }
  });
})();
