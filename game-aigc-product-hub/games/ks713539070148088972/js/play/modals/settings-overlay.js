/**
 * play/modals/settings-overlay.js — 设置浮层（首页/游戏页共用）
 * 功能：音乐/音效 toggle + 进度清空 + 语音包选择
 */
(function () {
  'use strict';

  SceneManager.register('settings-overlay', {
    _from: 'home',

    enter: function (data) {
      this._from = (data && data.from) || 'home';
      Telemetry.openSettings();
    },

    exit: function () {
      // 返回来源场景
    },

    // 设计稿基准：375 宽逻辑画布，卡片水平居中对齐真实 W（避免 W≠375 时右侧留黑边），
    // 垂直方向沿用设计稿固定 top 偏移（对齐本项目 win-modal/lose-modal 惯例）
    draw: function () {
      var px = M3.Layout.px;
      var W  = M3.Layout.w;
      var H  = M3.Layout.h;
      var areas = [];

      // 注意：必须用 drawRoundRect(radius=0) 而非 drawRect 画全屏蒙层——drawRect 走
      // ShapeBatch，只在整帧 endFrame 时统一 flush，且固定晚于 SpriteBatch flush，
      // 会导致蒙层最终盖在所有图片(卡片/彩带/开关等)之上而非垫在其下方（历史坑，见
      // win-modal.js _drawFullscreen 注释）。drawRoundRect 会强制立即 flush 并用原生
      // GL 绘制，能正确按调用顺序垫底。
      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(0,0,0,0.55)' });
      areas.push({ x: 0, y: 0, w: W, h: H, priority: 500, label: 'settings-absorber', onTap: function () {} });

      var cardW = px(311), cardH = px(283), cardTop = px(221);
      var cardX = Math.round((W - cardW) / 2); // 而非硬编码 32，避免真机宽度≠375 时卡片偏移/右侧露黑底

      // 卡片背景
      Renderer.drawImage(CONFIG.uiAsset('mnvSettingsCard'), cardX, cardTop, cardW, cardH);
      areas.push({ x: cardX, y: cardTop, w: cardW, h: cardH, priority: 800, label: 'settings-card', onTap: function () {} });

      // 「设置」彩带：设计稿绝对坐标 left:52，卡片设计稿绝对坐标 left:32 → 相对卡片偏移 = 52-32 = 20
      var bannerW = px(279), bannerH = px(93);
      Renderer.drawImage(CONFIG.uiAsset('mnvSettingsBanner'), cardX + px(20), px(192) - px(3), bannerW, bannerH);

      // 每行统一：图标顶 y + 图标高，文字纵向居中对齐图标中心（drawText 的 y 是文字框顶部）
      function row(iconKey, iconX, iconY, iconW, iconH, label, toggleOn) {
        Renderer.drawImage(CONFIG.uiAsset(iconKey), cardX + iconX, iconY, iconW, iconH);
        var textFontSize = px(20);
        var textCenterY = iconY + iconH / 2;
        Renderer.drawText(label, cardX + iconX + iconW + px(30), textCenterY - textFontSize / 2, {
          fontSize: textFontSize, color: '#141056', align: 'center', bold: true
        });
      }

      // 关键修复：设计稿里图标/开关的 left 值（64/233/...）是"相对整个屏幕"的绝对坐标，
      // 而设计稿卡片自身 left:32 —— 之前误把 64 当成"相对卡片"的偏移直接用，导致图标
      // 左边距(64) 远大于开关右边距(约20)，整组内容视觉上明显偏右。
      // 正确换算：相对卡片偏移 = 设计稿绝对坐标 - 32（卡片设计稿左边距）
      var iconX = px(64 - 32);      // = 32（音乐/进度行图标）
      var iconXSfx = px(63 - 32);   // = 31（音效行图标，Figma 原稿就差 1px）
      var toggleX = px(233 - 32);   // = 201
      var clearX  = px(235 - 32);   // = 203
      var toggleW = px(83), toggleH = px(83);
      var clearW = px(78), clearH = px(78);

      // ── 音乐（BGM）行：图标 45×45 @32,294 / 开关 83×83 @201,275 ──
      row('mnvIconMusic', iconX, px(294), px(45), px(45), '音乐');
      var bgmOn = !Audio.isBgmMuted();
      Renderer.drawImage(CONFIG.uiAsset(bgmOn ? 'mnvToggleOn' : 'mnvToggleOff'), cardX + toggleX, px(275), toggleW, toggleH);
      areas.push({
        x: cardX + toggleX, y: px(275), w: toggleW, h: toggleH, priority: 900, label: 'settings-bgm-toggle',
        onTap: function () { Audio.toggleBgmMuted(); }
      });

      // ── 音效行：图标 45×45 @31,354 / 开关 83×83 @201,335 ──
      row('mnvIconSfx', iconXSfx, px(354), px(45), px(45), '音效');
      var sfxOn = !Audio.isMuted();
      Renderer.drawImage(CONFIG.uiAsset(sfxOn ? 'mnvToggleOn' : 'mnvToggleOff'), cardX + toggleX, px(335), toggleW, toggleH);
      areas.push({
        x: cardX + toggleX, y: px(335), w: toggleW, h: toggleH, priority: 900, label: 'settings-sfx-toggle',
        onTap: function () { Audio.toggleMuted(); }
      });

      // ── 进度行：图标 45×44 @32,418 / 清空按钮 78×78 @203,401（文案已烘焙进图）──
      row('mnvIconTrash', iconX, px(418), px(45), px(44), '进度');
      Renderer.drawImage(CONFIG.uiAsset('mnvBtnClear'), cardX + clearX, px(401), clearW, clearH);
      areas.push({
        x: cardX + clearX, y: px(401), w: clearW, h: clearH, priority: 900, label: 'settings-clear',
        onTap: function () {
          Storage.clearAll(RemoteConfig.themes);
          UIKit.toast('已清空所有关卡数据');
          Audio.setVoicePack('xiaomei');
          SceneManager.close();
        }
      });

      // 返回按钮：统一用 UIKit.drawBackCloseButton + CONFIG.getBackButtonRect()，
      // 位置与其他弹窗/关卡页/游戏页保持一致（左上角安全区内固定坐标）
      areas.push(UIKit.drawBackCloseButton(function () { SceneManager.close(); }, 900));

      InputManager.addAll(areas);
    }
  });
})();
