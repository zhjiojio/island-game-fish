/**
 * core/product.config.js — 产品定制层（唯一允许写死"老铁眼真尖"这个产品的具体内容）
 * 职责：
 *   - 集中存放所有与"本产品"绑定的内容：AppID/CDN 地址/广告位 ID/美术资源/
 *     音频资源/语音包人设/弹窗视觉配色/存储 key 前缀/分享文案等
 *   - core/config.js（框架层）从本文件读取这些值组装成 CONFIG，框架代码本身
 *     不出现任何产品定制内容
 *   - 换一款游戏复用这套框架时，理论上只需要重写本文件（+ 替换 assets/ 素材 +
 *     project.config.json/game.json 里的 AppID），无需改动 core/ 及以上的框架代码
 * 依赖：无（必须在 config.js 之前加载）
 * 导出：window.PRODUCT_CONFIG
 *
 * 已知限制：project.config.json / game.json 是平台读取的静态 JSON 清单文件，
 * 无法引用本文件里的 JS 变量，AppID 仍需在这两个文件里单独维护一份，换产品时
 * 记得同步改。
 */
(function () {
  'use strict';

  window.PRODUCT_CONFIG = {

    // ── 产品身份 ──────────────────────────────────────────────────────────────
    appId:     'ks658651445853447417',
    gameTitle: '老铁眼真尖',
    shareTitle: '快来「老铁眼真尖」挑战找茬，看你眼力有多尖！',
    // 通关弹窗"击败了 X% 的xxx"文案模板，{pct} 会被替换为实际百分比数字
    beatPctTemplate: '击败了 {pct}% 的老铁！',
    copyrightOwner: '北京慕远科技有限公司',
    certNo: '2026SA0124640',

    // ── 远程配置地址（含 AppID 路径）──────────────────────────────────────────
    remoteConfigUrl: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/levels-config.json',

    // ── CDN 前缀（含 AppID 路径）──────────────────────────────────────────────
    cdnBase: {
      config: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/',
      media:  'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/',
      aigc:   'https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/'
    },

    // ── 广告位 ID（与 kwai-ad-config.js 保持同步，需去开放平台后台申请真实值）──────
    adUnit: {
      rewarded:     '2300061549_01',
      interstitial: '2300061549_01',
      banner:       '2300061549_01'
    },

    // ── UI 美术资源（优先 CDN，无 CDN 时用本地 assets/Icon/）────────────────────
    // 格式：{ cdn: 'https://...', local: 'assets/Icon/xxx.png' }；无 cdn 字段时直接用 local
    //
    // 新模版「美女来找茬」新增的 uiAssets key 一并声明于此。
    // 现有素材路径不变，新增 key 的 local 路径暂用占位值——待美术素材就位后替换即可。
    // 框架代码通过 CONFIG.uiAsset(key) 统一获取路径，未注册的 key 仅打 warn 不崩溃。
    uiAssets: {
      // ── 现有素材 ──
      title:          { local: 'assets/Icon/title.png' },
      globalBg:       { local: 'assets/Image/global_bg.png' },
      welcomeChar:    { local: 'assets/home-asset/welcome-char.png' },
      bannerBlue:     { local: 'assets/Icon/banner-blue.png' },
      btnClose:       { local: 'assets/Icon/btn-close.png' },
      btnBack:        { local: 'assets/Icon/btn-back.png' },
      btnShare:       { local: 'assets/Icon/btn-share.png' },
      btnDesktop:     { local: 'assets/Icon/btn-desktop.png' },
      btnSettings:    { local: 'assets/Icon/btn-settings.png' },
      btnSettingsGame:{ local: 'assets/Icon/btn-settings-game.png' },
      btnUnlock:      { local: 'assets/Icon/btn-unlock.png' },
      adIcon:         { local: 'assets/Icon/ad-icon.png' },
      avatarFrame:    { local: 'assets/Icon/avatar-frame.png' },
      cardBg:         { local: 'assets/Icon/card-bg.png' },
      hintTapHand:    { local: 'assets/Icon/hint-tap-hand.png' },
      iconLock:       { local: 'assets/Icon/icon-lock.png' },
      iconMusic:      { local: 'assets/Icon/icon-music.png' },
      iconSpeaker:    { local: 'assets/Icon/icon-speaker.png' },
      iconTrash:      { local: 'assets/Icon/icon-trash.png' },
      starOn:         { local: 'assets/Icon/star-on.png' },
      starOff:        { local: 'assets/Icon/star-off.png' },
      star:           { local: 'assets/Icon/star.png' },
      tagHot:         { local: 'assets/Icon/tag-hot.png' },
      tagNew:         { local: 'assets/Icon/tag-new.png' },
      tagHard:        { local: 'assets/Icon/tag-hard.png' },
      tagComing:      { local: 'assets/Icon/tag-coming.png' },
      timerBg:        { local: 'assets/Icon/timer-bg.png' },
      toggleOn:       { local: 'assets/Icon/toggle-on.png' },
      toggleOff:      { local: 'assets/Icon/toggle-off.png' },
      vpLocked:       { local: 'assets/Icon/vp-locked.png' },
      vpSelected:     { local: 'assets/Icon/vp-selected.png' },
      vpUnlocked:     { local: 'assets/Icon/vp-unlocked.png' },

      // ── 新模版「美女来找茬」素材 ──
      // 主题包目录：assets/meinv/ui/（通用UI组件） + biz/（业务专属素材，按模块分子目录）
      //           + bg/（页面背景） + fx/（特效） + audio/（音频）
      // 命名规则 snake_case，通用组件用 ui_ 前缀，业务专属素材用 biz_ 前缀
      // 详见 docs/plans/2026-09-10-ui-theme-package-design.md

      // bg/ — 页面背景
      // 2026-09-11 两级加载方案：
      //   1. 首帧立即出：mnvPageBg（本地静态图，700KB，已把问号暗纹烘焙进底图，
      //      不依赖网络，TextureManager.load 读本地文件基本零延迟）——欢迎页/首页
      //      一进来就是这张图，不会有紫色纯色兜底的空档。
      //   2. CDN 到位后升级：mnvBgGradientBase（纯渐变，无暗纹）+ mnvBgPuzzle（暗纹
      //      贴图）都从 CDN 拉取成功后，ui-kit.js drawFlowingBackground 会自动切换成
      //      "纯渐变铺底 + 暗纹贴图上下悬浮滚动"的动态版本，视觉效果比静态图更好，
      //      但不阻塞首帧，加载失败/未就位时会一直停留在第 1 步的本地静态图，不影响
      //      可用性。两张图仅保留 cdn 字段，不打进本地包体（各 1.8MB/316KB，本地化
      //      成本较高，且属于"锦上添花"的增强效果，不是首屏必需）。
      mnvPageBg:           { local: 'assets/meinv/bg/bg_page_gradient_purple_v2.png' },  // 首帧本地静态兜底：紫色渐变+问号暗纹已合并烘焙
      mnvBgGradientBase:   { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/bg_page_gradient_purple.png' },  // CDN 到位后升级用：纯渐变(无暗纹)，配合 mnvBgPuzzle 做动态叠加
      mnvBgPuzzle:         { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/bg_page_puzzle_pattern.png' },   // 1596x2961 拼块暗纹背景(流动)，CDN 到位后与 mnvBgGradientBase 叠加播放滚动动画

      // ui/ — 通用小图标（箭头/HUD底板/返回关闭/背景底板）
      tapHand:             { cdn: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/tap-hand.png' },  // 新手教程拖拽引导手势图(无本地兜底，assets/Icon/ 为空)
      btnDailyCheckin:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_btn_dailysign.png', local: 'assets/meinv/biz/home/biz_home_btn_dailysign.png' },   // 每日签到(93x93 圆按钮)
      btnUnlockAll:        { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_btn_unlockall.png', local: 'assets/meinv/biz/home/biz_home_btn_unlockall.png' },   // 全部解锁(93x93 圆按钮)
      btnAddDesktop:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_btn_adddesktop.png', local: 'assets/meinv/biz/home/biz_home_btn_adddesktop.png' },  // 添加桌面(93x93 圆按钮)
      mnvBtnAddTime:       { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_hud_btn_addtime.png', local: 'assets/meinv/biz/hud/biz_hud_btn_addtime.png' },   // 加时按钮(带视频角标)
      mnvBtnHint:          { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_hud_btn_hint.png', local: 'assets/meinv/biz/hud/biz_hud_btn_hint.png' },       // 提示放大镜按钮(带视频角标)
      mnvBtnAddChance:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_hud_btn_addchance.png', local: 'assets/meinv/biz/hud/biz_hud_btn_addchance.png' },// +5次机会按钮(带视频角标)
      mnvBtnZoom:          { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_zoom.png', local: 'assets/meinv/ui/btn/ui_btn_zoom.png' },             // 放大按钮(双指捏合缩放，见 showZoomByMode)
      mnvBtnZoomOut:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_zoomout.png', local: 'assets/meinv/ui/btn/ui_btn_zoomout.png' },              // 缩小按钮(双指捏合缩放还原，见 showZoomByMode)
      mnvLivesBarEmpty:    { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_hud_lives_bar_empty.png', local: 'assets/meinv/biz/hud/biz_hud_lives_bar_empty.png' },  // 生命条空底(红心+紫色胶囊，配数字文字)
      mnvTimesBarEmpty:    { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_hud_times_bar_empty.png', local: 'assets/meinv/biz/hud/biz_hud_times_bar_empty.png' },  // 倒计时空底(秒表+紫色胶囊，配数字文字)
      mnvIconHourglass:    { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_hourglass.png', local: 'assets/meinv/ui/icon/ui_icon_hourglass.png' },        // 沙漏图标
      mnvIconStopwatch:    { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_stopwatch.png', local: 'assets/meinv/ui/icon/ui_icon_stopwatch.png' },        // 秒表图标
      mnvBtnBgPill:        { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_bg_pill.png', local: 'assets/meinv/ui/btn/ui_btn_bg_pill.png' },          // 紫色胶囊按钮底板(顶部返回/更多)
      mnvBtnSetting:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_setting.png', local: 'assets/meinv/ui/btn/ui_btn_setting.png' },     // 首页右上角设置按钮(圆形齿轮图标)
      mnvFrameDashed:      { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_frame_dashed.png', local: 'assets/meinv/ui/frame/ui_frame_dashed.png' },         // 虚线选框(关卡卡片/衣服缩略框通用)
      mnvArrowLeft:        { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_left.png', local: 'assets/meinv/ui/arrow/ui_arrow_left.png' },      // 单箭头向左
      mnvArrowRight:       { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_right.png', local: 'assets/meinv/ui/arrow/ui_arrow_right.png' },     // 单箭头向右
      mnvArrowDoubleLeft:  { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_double_left.png', local: 'assets/meinv/ui/arrow/ui_arrow_double_left.png' },  // 双箭头向左
      mnvArrowDoubleRight: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_double_right.png', local: 'assets/meinv/ui/arrow/ui_arrow_double_right.png' }, // 双箭头向右
      mnvLoadingBarTrack:  { local: 'assets/meinv/biz/home/biz_home_loading_bar_track.png' }, // 欢迎页加载条底图(胶囊轨道，930x66)（2026-09-11 改本地：仅2.4KB，欢迎页首屏关键素材，不依赖CDN）
      adLoadingText:      { cdn: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_ad_loading_text.png', local: 'assets/meinv/ui/biz_ad_loading_text.png' },  // 广告加载过程页文字图(替换原旋转圈圈)
      mnvBtnBack:          { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_back.png', local: 'assets/meinv/ui/btn/ui_btn_back.png' },         // 126x126 通用返回按钮
      mnvXBtn:             { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_close.png', local: 'assets/meinv/ui/btn/ui_btn_close.png' },                 // 138x138 关闭按钮
      gameLogo:            { local: 'assets/meinv/biz/welcome/biz_welcome_logo.png' },         // 欢迎页 Logo(含标语合并)（2026-09-11 改本地：480KB，欢迎页首屏关键素材，不依赖CDN）
      gameNavLeft:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_nav_left.png', local: 'assets/meinv/ui/arrow/ui_arrow_nav_left.png' },        // 126x126 游戏内左导航箭头
      gameNavRight:        { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_arrow_nav_right.png', local: 'assets/meinv/ui/arrow/ui_arrow_nav_right.png' },       // 126x126 游戏内右导航箭头

      // ui|biz/ — 组件级素材（按钮/卡片/气泡/胜利弹窗/关卡展示，按通用/业务拆分）
      mnvBtnStart:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_welcome_btn_start.png', local: 'assets/meinv/biz/welcome/biz_welcome_btn_start.png' },       // 开始游戏按钮(常态)
      mnvBtnStartPressed:  { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_welcome_btn_start_pressed.png', local: 'assets/meinv/biz/welcome/biz_welcome_btn_start_pressed.png' },// 开始游戏按钮(按下态)
      mnvBtnSetting:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_btn_setting.png', local: 'assets/meinv/ui/btn/ui_btn_setting.png' },          // 设置按钮
      mnvCardNoteWhite:    { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_card_note_white.png', local: 'assets/meinv/ui/card/ui_card_note_white.png' },      // 便签卡片(白底，图钉+虚线框)
      mnvCardNoteGreen:    { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_card_note_green.png', local: 'assets/meinv/ui/card/ui_card_note_green.png' },      // 便签卡片(绿色内芯，锁定态)
      mnvBubbleTailLeft:   { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_bubble_tail_left.png', local: 'assets/meinv/ui/card/ui_bubble_tail_left.png' },     // 白色气泡(左下尖角)
      mnvBubbleTailRight:  { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_bubble_tail_right.png', local: 'assets/meinv/ui/card/ui_bubble_tail_right.png' },    // 白色气泡(右下尖角)
      levelTitle:          { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_level_title.png', local: 'assets/meinv/biz/level/biz_level_title.png' },           // 258x37 游戏页关卡标题横幅
      winCard:             { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_card_win.png', local: 'assets/meinv/biz/result/biz_result_card_win.png' },              // 胜利弹窗白底面板(紫边圆角)
      winDecoration:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_ribbon_win.png', local: 'assets/meinv/biz/result/biz_result_ribbon_win.png' },        // 291x203 胜利通关绶带横幅
      timesOver:           { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_title_timesover.png', local: 'assets/meinv/biz/result/biz_result_title_timesover.png' },           // 837x279 「次数已用尽」标题横幅(叠在失败卡片顶部)
      btnGameAgain:        { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_again.png', local: 'assets/meinv/biz/result/biz_result_btn_again.png' },            // 528x264 「再玩一次」图片按钮(文字已烘焙)
      btnGameWatchVideo:   { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_watchvideo.png', local: 'assets/meinv/biz/result/biz_result_btn_watchvideo.png' },      // 528x264 「看视频」图片按钮(文字已烘焙)
      sandyClock:          { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_icon_sandyclock.png', local: 'assets/meinv/biz/result/biz_result_icon_sandyclock.png' },               // 452x464 沙漏图标(卡片图片式失败弹窗中间装饰)
      btnGameBackHome:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_backhome.png', local: 'assets/meinv/biz/result/biz_result_btn_backhome.png' },       // 528x264 「返回首页」图片按钮(文字已烘焙)
      btnGameNext:         { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_next.png', local: 'assets/meinv/biz/result/biz_result_btn_next.png' },            // 528x264 「下一关」图片按钮(文字已烘焙)
      btnGameNextTheme:    { cdn: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_next_theme.png', local: 'assets/meinv/biz/result/biz_result_btn_next_theme.png' },  // 「下一主题」图片按钮(下一主题未解锁时展示，带广告角标)
      btnGameNextThemeFree:{ cdn: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_next_theme_free.png' },  // 「下一主题」图片按钮(下一主题已解锁时展示，直接跳转无需看广告)
      btnGameNextThemeShare:{ cdn: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_game_btn_next_theme_share.png', local: 'assets/meinv/biz/result/biz_game_btn_next_theme_share.png' }, // 「解锁新主题」图片按钮(下一主题需分享解锁)
      loseCardTime:        { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_card_lose.png', local: 'assets/meinv/biz/result/biz_result_card_lose.png' },          // 「时间已用尽」失败弹窗背景面板(专用于 limitType='time')
      clockOver:           { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_title_clockover.png', local: 'assets/meinv/biz/result/biz_result_title_clockover.png' },         // 「时间已用尽」标题横幅(专用于 limitType='time')
      timeClock:           { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_icon_timeclock.png', local: 'assets/meinv/biz/result/biz_result_icon_timeclock.png' },              // 时钟图标(卡片图片式失败弹窗中间装饰，专用于 limitType='time')
      btnGameTimeBack:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_timeback.png', local: 'assets/meinv/biz/result/biz_result_btn_timeback.png' },      // 「不了，谢谢」图片按钮(文字已烘焙，专用于 limitType='time')
      btnGameTimeAdd:      { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_btn_timeadd.png', local: 'assets/meinv/biz/result/biz_result_btn_timeadd.png' },       // 「补充」图片按钮(看视频加时，专用于 limitType='time')
      unlockLevelRibbon:   { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_unlock_ribbon.png', local: 'assets/meinv/biz/unlock/biz_unlock_ribbon.png' },      // 837x279「解锁关卡」标题绶带横幅(叠在解锁全部场景卡片顶部)
      unlockLevelIcon:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_unlock_icon_video.png', local: 'assets/meinv/biz/unlock/biz_unlock_icon_video.png' },        // 336x336 播放视频图标(解锁全部场景卡片中间装饰)

      // 分享解锁卡片（js/play/modals/unlock-overlays.js share-unlock-overlay，见下方 TEMPLATE.shareUnlockModal）
      shareUnlockRibbon:   { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_share_ribbon.png', local: 'assets/meinv/biz/share/biz_share_ribbon.png' },      // 837x279「分享解锁」标题绶带横幅(叠在分享解锁卡片顶部)
      shareUnlockLockIcon: { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_share_icon_lock.png', local: 'assets/meinv/biz/share/biz_share_icon_lock.png' },   // 306x306 锁图标(分享解锁卡片中间装饰)
      btnShareNow:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_share_btn_now.png', local: 'assets/meinv/biz/share/biz_share_btn_now.png' },     // 528x264「立即分享」图片按钮(文字已烘焙)
      btnThinkAgain:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_share_btn_thinkagain.png', local: 'assets/meinv/biz/share/biz_share_btn_thinkagain.png' }, // 528x264「我在想想」图片按钮(文字已烘焙)

      // 设置弹窗（meinv 主题）
      mnvSettingsCard:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_result_card_lose.png', local: 'assets/meinv/biz/result/biz_result_card_lose.png' },              // 设置弹窗背景面板(复用失败弹窗卡片)
      mnvSettingsBanner:   { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_settings_banner.png', local: 'assets/meinv/biz/settings/biz_settings_banner.png' }, // 「设置」标题彩带
      mnvToggleOn:         { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_toggle_on.png', local: 'assets/meinv/ui/toggle/ui_toggle_on.png' },        // 开关-开
      mnvToggleOff:        { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_toggle_off.png', local: 'assets/meinv/ui/toggle/ui_toggle_off.png' },       // 开关-关
      mnvIconMusic:        { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_music.png', local: 'assets/meinv/ui/icon/ui_icon_music.png' },       // 音乐图标(喇叭)
      mnvIconSfx:          { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_sfx.png', local: 'assets/meinv/ui/icon/ui_icon_sfx.png' },       // 音效图标(音符)
      mnvIconTrash:        { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_trash.png', local: 'assets/meinv/ui/icon/ui_icon_trash.png' },       // 清空进度图标(垃圾桶)
      mnvBtnClear:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_settings_btn_clear.png', local: 'assets/meinv/biz/settings/biz_settings_btn_clear.png' },        // 「清空」图片按钮(文字已烘焙)

      // ui/badge、ui/icon — 状态角标（新/热/锁/感叹号/进度点）
      mnvBadgeHot:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_badge_hot.png', local: 'assets/meinv/ui/badge/ui_badge_hot.png' },           // 红色「热」角标
      mnvBadgeNew:         { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_badge_new.png', local: 'assets/meinv/ui/badge/ui_badge_new.png' },           // 绿色「新」角标
      mnvIconLock:         { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_lock.png', local: 'assets/meinv/ui/icon/ui_icon_lock.png' },           // 黄色锁图标(未解锁)
      mnvIconExclamation:  { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_badge_exclamation.png', local: 'assets/meinv/ui/badge/ui_badge_exclamation.png' },    // 红色感叹号角标
      dotPending:          { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_dot_pending.png', local: 'assets/meinv/ui/icon/ui_icon_dot_pending.png' }, // 蓝色问号球（未找到）
      dotDone:             { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_dot_done.png', local: 'assets/meinv/ui/icon/ui_icon_dot_done.png' },    // 绿色对勾球（已找到）
      mnvIconCorrect:      { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_correct.png', local: 'assets/meinv/ui/icon/ui_icon_correct.png' },         // 选中正确目标的标记图(替代原矢量绿圈，spot/hunt/story/hidden 通用)
      mnvIconWrong:        { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_icon_wrong.png', local: 'assets/meinv/ui/icon/ui_icon_wrong.png' },           // 点错反馈图标(替代原「-Ns」扣秒浮字，spot/hunt/story/hidden 通用)

      // fx/ — 选中反馈飞行特效·光尾序列帧（新版绿色粒子拖尾，24 帧 00~23，第 13 帧抵达进度点）
      // 2026-09-16 改本地：真机弱网下 24 帧 CDN 图未就绪时整帧跳过，表现为拖尾断断续续。
      // 序列帧总大小仅 ~270KB 且是 HUD 进度反馈的核心特效，改走包内本地路径，零网络依赖。
      // （同 mnvLoadingBarTrack/gameLogo 的本地化先例）
      mnvFlyTrail00:       { local: 'assets/meinv/fx/fx_trail_00.png' },
      mnvFlyTrail01:       { local: 'assets/meinv/fx/fx_trail_01.png' },
      mnvFlyTrail02:       { local: 'assets/meinv/fx/fx_trail_02.png' },
      mnvFlyTrail03:       { local: 'assets/meinv/fx/fx_trail_03.png' },
      mnvFlyTrail04:       { local: 'assets/meinv/fx/fx_trail_04.png' },
      mnvFlyTrail05:       { local: 'assets/meinv/fx/fx_trail_05.png' },
      mnvFlyTrail06:       { local: 'assets/meinv/fx/fx_trail_06.png' },
      mnvFlyTrail07:       { local: 'assets/meinv/fx/fx_trail_07.png' },
      mnvFlyTrail08:       { local: 'assets/meinv/fx/fx_trail_08.png' },
      mnvFlyTrail09:       { local: 'assets/meinv/fx/fx_trail_09.png' },
      mnvFlyTrail10:       { local: 'assets/meinv/fx/fx_trail_10.png' },
      mnvFlyTrail11:       { local: 'assets/meinv/fx/fx_trail_11.png' },
      mnvFlyTrail12:       { local: 'assets/meinv/fx/fx_trail_12.png' },
      mnvFlyTrail13:       { local: 'assets/meinv/fx/fx_trail_13.png' },
      mnvFlyTrail14:       { local: 'assets/meinv/fx/fx_trail_14.png' },
      mnvFlyTrail15:       { local: 'assets/meinv/fx/fx_trail_15.png' },
      mnvFlyTrail16:       { local: 'assets/meinv/fx/fx_trail_16.png' },
      mnvFlyTrail17:       { local: 'assets/meinv/fx/fx_trail_17.png' },
      mnvFlyTrail18:       { local: 'assets/meinv/fx/fx_trail_18.png' },
      mnvFlyTrail19:       { local: 'assets/meinv/fx/fx_trail_19.png' },
      mnvFlyTrail20:       { local: 'assets/meinv/fx/fx_trail_20.png' },
      mnvFlyTrail21:       { local: 'assets/meinv/fx/fx_trail_21.png' },
      mnvFlyTrail22:       { local: 'assets/meinv/fx/fx_trail_22.png' },
      mnvFlyTrail23:       { local: 'assets/meinv/fx/fx_trail_23.png' },

      // bg/mnvPageBg、mnvBgPuzzle 定义已上移到本文件靠前的"bg/ — 页面背景"处，
      // 这里原来是重复定义（JS 对象字面量后写的同名 key 会覆盖前面的，之前两处
      // 值刚好相同所以没暴露问题；这次换背景图时发现有重复，直接删掉这份，
      // 避免以后改一处忘了改另一处、又被这里的旧值悄悄覆盖回去）。
      mnvWinFxGlow:        { local: 'assets/meinv/fx/fx_win_glow.png' },         // 通关成功页光晕特效(叠在黑罩之上、卡片之下)
      mnvWinFxConfetti:    { local: 'assets/meinv/fx/fx_win_confetti.png' },     // 通关成功页彩带特效(叠在光晕之上、卡片之下)

      // ── 待补切图：代码 fallback 到几何/文字渲染，Home 顶部装饰暂缓（等美术出图）──
      winActionButton:  null,  // 244x91 胜利主按钮 — TODO
      mnvCardCoverLock: null,  // 108x108 卡片锁定封面占位图 — TODO
      homeTitleLogo:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_title_logo.png', local: 'assets/meinv/biz/home/biz_home_title_logo.png' },       // 156x72 "主题关卡"文字logo — 待放入
      homeSubtitleBanner:  { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_subtitle_banner.png', local: 'assets/meinv/biz/home/biz_home_subtitle_banner.png' },  // 206x34 "挑一张，开始找茬吧！"胶囊 — 待放入
      cardNailIcon:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_home_card_nail.png', local: 'assets/meinv/biz/home/biz_home_card_nail.png' },  // 36x34 卡片顶部钉子图标，叠加在关卡封面图上方居中，与底图重叠

      // biz/checkin/ — 每日签到功能（独立可复用模块，见 systems/checkin.js + play/modals/checkin-modal.js）
      checkinRibbonTitle:  { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_ribbon_title.png', local: 'assets/meinv/biz/checkin/biz_checkin_ribbon_title.png' }, // 837x279 顶部「每日签到」红色绶带标题
      checkinPanelBg:      { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_panel_bg.png', local: 'assets/meinv/biz/checkin/biz_checkin_panel_bg.png' },     // 933x1119 弹窗白底紫边面板背景
      checkinClaimBtn:     { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_btn_claim.png', local: 'assets/meinv/biz/checkin/biz_checkin_btn_claim.png' },        // 528x264 「签到领取」图片按钮(文字已烘焙)
      checkinClaimTripleBtn: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_btn_claim_triple.png', local: 'assets/meinv/biz/checkin/biz_checkin_btn_claim_triple.png' }, // 528x264 「三倍领取」看视频图片按钮(文字已烘焙)
      checkinDay1: { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day1.png', local: 'assets/meinv/biz/checkin/biz_checkin_day1.png' }, // 249x288 第一天卡片(标题+图标+文案已烘焙)
      checkinDay2: { cdn: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day2.png', local: 'assets/meinv/biz/checkin/biz_checkin_day2.png' }, // 249x288 第二天卡片
      checkinDay3: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day3.png', local: 'assets/meinv/biz/checkin/biz_checkin_day3.png' }, // 249x288 第三天卡片
      checkinDay4: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day4.png', local: 'assets/meinv/biz/checkin/biz_checkin_day4.png' }, // 249x288 第四天卡片
      checkinDay5: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day5.png', local: 'assets/meinv/biz/checkin/biz_checkin_day5.png' }, // 249x288 第五天卡片
      checkinDay6: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day6.png', local: 'assets/meinv/biz/checkin/biz_checkin_day6.png' }, // 249x288 第六天卡片
      checkinDay7: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/biz_checkin_day7.png', local: 'assets/meinv/biz/checkin/biz_checkin_day7.png' }  // 825x285 第七天整行横幅卡片
    },

    // ── 音频资源（本地音效 + BGM CDN 列表，{CDN_MEDIA} 由 config.js 替换）────────
    audio: {
      correct:    { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/correct.mp3', local: 'assets/meinv/audio/SFX/correct.mp3', preload: true },
      wrong:      { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/wrong.mp3', local: 'assets/meinv/audio/SFX/wrong.mp3', preload: true },
      tick:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/tick.mp3', local: 'assets/Audio/tick.mp3',           preload: true },
      timeup:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/timeup.mp3', local: 'assets/Audio/timeup.mp3',         preload: false },
      hint:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/hint.mp3', local: 'assets/Audio/global/hint.mp3',    preload: false },
      revive:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/revive.mp3', local: 'assets/Audio/global/revive.mp3',  preload: false },
      skip:       { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/skip.mp3', local: 'assets/Audio/global/skip.mp3',    preload: false },
      bgm: {
  // 通用轮播 BGM 列表（startBgm() 用，仅作为「静音前从未播过场景单曲」时的兜底，
  // 见 audio.js toggleBgmMuted）：之前是脚手架遗留占位曲目
  // （bgm_1_chiptune/bgm_2_northeast/bgm_3_disco，来自旧「老铁」模版 CDN），
  // 与本产品（美女来找茬）风格完全不符，现已清除。in_level.mp3 是「关卡中」专属
  // 单曲，语义上不适合出现在通用轮播兜底里，故轮播列表只保留 select_level 一首。
  cdn: [
      'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/select_level.mp3'
        ],
        // 按场景切换的单曲循环 BGM（key → 本地路径），与上面的轮播列表互不影响
        // 文件已统一整理到 assets/meinv/audio/BGM/（原 assets/Audio/bgm/ 重复目录已删除）
        tracks: {
          select_level: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/select_level.mp3', local: 'assets/meinv/audio/BGM/select_level.mp3' },
       in_level:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/in_level.mp3', local: 'assets/meinv/audio/BGM/in_level.mp3' }
   }
    },

      // 全局一次性音效（关卡转场 / 通关 / 失败弹窗 / 通用UI点击 / 全部找齐闪烁）
      levelTransition:   { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/level_transition.mp3', local: 'assets/Audio/global/level_transition.mp3', preload: false },
      win:               { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/win.mp3', local: 'assets/Audio/global/win.mp3',      preload: false },
      allFoundFlash:     { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/all_found_flash.mp3', local: 'assets/meinv/audio/SFX/all_found_flash.mp3', preload: false },
      loseModal:         { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/lose_modal.mp3', local: 'assets/Audio/global/lose_modal.mp3',      preload: false },
      uiClick:           { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/ui_click.mp3', local: 'assets/Audio/global/ui_click.mp3',        preload: true },

      // 换装模式专属音效（与找茬模式现有 correct/wrong 区分）
      dressupCorrect:    { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/dressup_correct.mp3', local: 'assets/Audio/dressup/correct.mp3',        preload: false },
      dressupWrong:      { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/dressup_wrong.mp3', local: 'assets/Audio/dressup/wrong.mp3',          preload: false },
      dressupCharSwitch: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/dressup_char_switch.mp3', local: 'assets/Audio/dressup/char_switch.mp3',    preload: false },
      dressupOutfitPick: { cdn: 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks713539070148088972/dressup_outfit_pick.mp3', local: 'assets/Audio/dressup/outfit_pick.mp3',    preload: false }
    },

    // ── 语音包人设（本产品定制的"角色"体系，换产品可整体替换或去掉）──────────────
    voicePacks: [
      { id: 'xiaomei',      name: '小美',   free: true,  hidden: false },
      { id: 'xiaoshuai',    name: '小帅',   free: true,  hidden: false },
      { id: 'kuergou',      name: '酷二狗', free: false, hidden: true  },
      { id: 'lala',         name: '辣辣',   free: false, hidden: true  },
      { id: 'longaotian',   name: '龙傲天', free: false, hidden: false },
      { id: 'liuhaoguaizai',name: '6号乖崽',free: false, hidden: false, cdnPrefix: 'voice_liuhaoguaizai_v3_' }
    ],
    defaultVoicePack: 'xiaomei',

    // 每个语音包的 clip 名（不含包前缀和 .mp3）；remaining_* 在子包，其余在 CDN
    voiceClips: [
      'timeup', 'greet', 'wrong', 'final_hit_a', 'final_hit_b', 'final_hit_c',
      'almost_out_a', 'almost_out_b', 'almost_out_c',
      'remaining_1_a', 'remaining_1_b', 'remaining_1_c',
      'remaining_2_a', 'remaining_2_b', 'remaining_2_c',
      'remaining_3_a', 'remaining_3_b', 'remaining_3_c',
      'pass_a', 'pass_b', 'pass_c', 'pass2', 'pass3', 'pass4', 'pass5', 'pass6',
      'scene1_intro', 'scene2_intro', 'scene_hunt_intro'
    ],
    // 多候选随机的 key（不含 _a/b/c 后缀）
    voiceMultiKeys: ['final_hit', 'almost_out', 'remaining_1', 'remaining_2', 'remaining_3', 'pass'],

    // ── 弹窗视觉配色（本产品的"蓝色系"皮肤，换产品可整体替换）───────────────────
    modalTheme: {
      cardBg:        '#EBF3FF',
      cardBorder:    '#6AA0F2',
      cardRadius:    24,
      borderWidth:   7,
      bannerOffsetY: -35
    },

    // ── 本地存储 key 前缀（避免多产品共用同一域名/存储时互相污染）───────────────
    storageKeyPrefix: 'laotie',

    // ── 模版配置（控制 UI 布局风格，框架层读取 CONFIG.TEMPLATE 切换渲染逻辑）──────
    // 不设此字段或设为 null 时，所有行为回退到现有模版（向后兼容）
    template: {
      id: 'meinv',  // 模版标识，'laotie'=现有模版, 'meinv'=美女来找茬

      // 欢迎页 (Figma Frame 2, 375x812)
      welcome: {
        logoAsset: 'gameLogo',        // Logo(含标语合并) — icons/welcome-logo.png
        showStartButton: false,       // 美女模板由 loading 完成后自动路由，不展示/注册开始按钮
        startButtonAsset: 'mnvBtnStart', // 开始游戏按钮图片 — biz/welcome/biz_welcome_btn_start.png
        showSigninButton: false,      // 左下角「签到」按钮 — 素材已废弃(btn_sign_in.png)，暂关闭等待补图
        signinButtonAsset: null,
        showDesktopButton: true,      // 右下角「添加桌面」按钮
        desktopButtonAsset: 'btnAddDesktop', // 添加桌面图标
        showTopRightActions: true,     // 右上角操作区(音乐+设置)
        coldStartToFirstLevel: true   // 冷启动新用户点「立即找茬」直接进第一关，跳过首页
      },

      // 首页/关卡选择 (Figma Frame 3/55, 375x812)
      home: {
        cardLayout: 'grid',          // 'grid'=多列网格
        cardSize: { w: 150, h: 158 },
        bottomBarStyle: 'round',      // 'round'=3圆按钮
        // 主题卡片封面图来源：true=直接取该主题第一关的场景图（scene/sceneA/
        // characters[0].result，按玩法区分，见 RemoteConfig.getThemeCoverSrc），
        // 不再依赖远程下发的 theme.cover 单独配图；false=沿用原有逻辑，用
        // theme.cover 下发的链接。美女模板所有玩法统一开启，减少配置维护成本。
        useFirstLevelSceneAsCover: true,
        showTopRightActions: true,
        showNavArrows: true,          // 顶部返回按钮 + 底部翻页箭头组
        titleLogoAsset: 'homeTitleLogo',       // 顶部"主题关卡"文字logo(156x72) — 待美术出图
        subtitleBannerAsset: 'homeSubtitleBanner', // 顶部"挑一张，开始找茬吧！"胶囊(206x34) — 待美术出图
        showProgress: true,           // "1/23" 进度文字(位于底部翻页箭头中间)
        pagePrevDoubleAsset: 'mnvArrowDoubleLeft',
        pagePrevAsset: 'mnvArrowLeft',
        pageNextAsset: 'mnvArrowRight',
        pageNextDoubleAsset: 'mnvArrowDoubleRight'
      },

      // 游戏页 HUD (Figma Frame 4, 375x812)
      hud: {
        showTopRightActions: true,
        levelTitleType: 'text',      // 默认标题类型：'text'=文字（关卡标题会变化的玩法用这个）| 'image'=图片横幅
        levelTitleTypeByMode: {      // 按玩法覆盖默认值；新增玩法如需图片标题，在此加一条即可，无需改代码
        },
        levelTitleFormatByMode: {    // 1=显示「第x关 标题」，2=只显示标题
          dressup: 2,
          puzzle: 2
        },
        levelTitleAsset: 'levelTitle',
        showStatusPills: true,        // 顶部倒计时/剩余机会数字胶囊(87x40/87x42)
        showDividerBars: true,       // 上下紫色分割条
        dividerColor: '#908FE6',     // Figma 精确色值
        dividerAsset: null,          // 纯色绘制
        showBottomItemStrip: true,   // 底部功能按钮栏(加时/提示；「加5次」「放大」按玩法可选，见 showAddChanceByMode/showZoomByMode)
        showAddTimeByMode: {         // 「加时」按钮按玩法配置是否显示；未列出的玩法默认展示(见 CONFIG.getShowAddTime)
          dressup: true,
          puzzle: true
        },
        showAddChanceByMode: {       // 「加5次机会」按钮按玩法配置是否显示；只有换装玩法有容错次数概念，其余玩法不显示
          dressup: true,
          puzzle: true
        },
        showHintByMode: {            // 「提示」按钮按玩法配置是否显示；未列出的玩法默认展示(见 CONFIG.getShowHint)
          dressup: true,
          puzzle: true
        },
        showZoomByMode: {            // 「放大」按钮 + 双指捏合缩放按玩法配置是否开启；hidden/spot/hunt 已适配
          // 单图/双图找茬类玩法均可开启，多图(spot)会两张图同步缩放；dressup/story 暂未适配，不建议开启
          hidden: true,
          spot:   true,
          hunt:   true
        },
        // hintMaxUsesByMode: {         // 「提示」按钮最大可用次数按玩法配置；未列出的玩法默认不设上限(999，见 CONFIG.getHintMaxUses)
        //   hidden: 1                 // hidden 玩法保留旧版行为：提示会直接揭晓物品名称，限 1 次/关
        // },
        showBottomAvatarStrip: false, // dressup 模式的衣服缩略框栏由 DressupMode.draw() 自绘，HUD 不再重复绘制
        showNavArrows: true,
        navLeftAsset: 'gameNavLeft',
        navRightAsset: 'gameNavRight',
        progressStyle: 'dots',               // 'dots'=点球进度条 | 'bar'=文字进度条
        errorDisplayFormat: '错误剩余: {used}/{max}', // Figma 错误计数(showStatusPills=true 时不重复显示)
        errorDisplayColor: '#FF0000'
      },

      // 胜利弹窗 (Figma Frame 57, 375x812)
      winModal: {
        style: 'fullscreen',         // 'fullscreen'=全屏式
        bgImageAsset: 'winCard',       // 胜利弹窗背景 → winCard.png
        sceneImageSize: 368,          // Figma 368x368
        showStars: false,             // Figma 无星级
        showBeatPct: false,           // Figma 无击败百分比
        titleFromLevel: true,         // 标题来自关卡数据(如"靠自己就是女王")
        titleText: '恭喜通关',
        decorationAsset: 'winDecoration',
        primaryButtonAsset: 'btnGameBackHome', // 「返回首页」图片按钮
        secondaryButtonAsset: 'btnGameNext',    // 「下一关」图片按钮(仅有下一关时展示)
        nextThemeButtonAsset: 'btnGameNextTheme',       // 「下一主题」图片按钮(下一主题未解锁，需看广告)
        nextThemeFreeButtonAsset: 'btnGameNextThemeFree', // 「下一主题」图片按钮(下一主题已解锁，直接跳转)
        nextThemeShareButtonAsset: 'btnGameNextThemeShare' // 「解锁新主题」图片按钮(下一主题需分享解锁)
      },

      // 失败弹窗 (Figma Frame 59, 375x812)
      loseModal: {
        // 所有玩法（hidden/spot/hunt/story/dressup）失败结算统一使用卡片图片式
        // 「次数已用尽」/「时间已用尽」弹窗，不再走旧版纯文字+candyButton 的
        // fullscreen 样式（styleByMode 已无需再单独指定 dressup，保留字段以备后续
        // 个别玩法差异化需要）
        style: 'card-image',
        bgImageAsset: 'winCard',       // 同胜利弹窗背景
        titleFromLevel: true,
        titleText: '时间到',
        showReviveButton: true,
        showReplayButton: true,
        styleByMode: {},
        // 按玩法单独配置复活追加的秒数/次数；未列出的玩法回退到 CONFIG.REVIVE_ADD_TIME/REVIVE_ADD_LIVES
        // （见 config.js CONFIG.getReviveAmount）。示例：dressup 玩法想加时更多可写 { dressup: 120 }
        reviveAddTimeByMode: {},
        reviveAddLivesByMode: {},
        // 'card-image' style 专用素材
        titleImageAsset: 'timesOver',        // 「次数已用尽」标题横幅（'time'/'count' 两种 limitType 暂共用同一张，见 lose-modal.js _drawCardImage）
        primaryButtonAsset: 'btnGameAgain',  // 「再玩一次」按钮
        secondaryButtonAsset: 'btnGameWatchVideo', // 「看视频」按钮
        hourglassAsset: 'sandyClock',        // 沙漏装饰图标(卡片中间)
        watchVideoHint: '看广告视频\n可增加{value}次游戏次数',  // limitType='count'（错误次数用尽）时的底部提示文案，{value} 由 CONFIG.REVIVE_ADD_LIVES 替换，且单独高亮着色（见 lose-modal.js _drawCardImage）
        watchVideoHintTime: '看广告视频\n可增加{value}秒游戏时间',  // li
        // mitType='time'（计时器耗尽）时的底部提示文案，{value} 由 CONFIG.REVIVE_ADD_TIME 替换，且单独高亮着色
        // 'time' limitType 专用素材：所有玩法计时器耗尽统一改用「时间已用尽」卡片图片式弹窗
        // （不再区分玩法，与 styleByMode 的 'count' 场景素材完全独立），见 lose-modal.js _drawCardImage
        timeTitleImageAsset: 'clockOver',        // 「时间已用尽」标题横幅
        timeBgImageAsset: 'loseCardTime',        // 「时间已用尽」卡片背景面板
        timeHourglassAsset: 'timeClock',         // 时钟装饰图标(卡片中间)
        timePrimaryButtonAsset: 'btnGameTimeBack', // 「不了，谢谢」图片按钮(文字已烘焙)
        timePrimaryLabel: '不了，谢谢',           // 主按钮文案(无图片素材，纯文字按钮，点击关闭并返回首页)
        timeSecondaryButtonAsset: 'btnGameTimeAdd' // 「补充」图片按钮(看视频加时)
      },

      // 「解锁全部场景」卡片（js/play/modals/unlock-overlays.js unlock-all-overlay），
      // 卡片式风格对齐 loseModal 的 card-image 样式：白底卡片 + 顶部绶带横幅 + 中间图标 +
      // 高亮数值副文案 + 双图片按钮，按钮直接复用 loseModal 的 btnGameTimeBack/btnGameWatchVideo。
      unlockAllModal: {
        bgImageAsset: 'winCard',              // 同胜利/失败弹窗白底面板背景
        ribbonAsset: 'unlockLevelRibbon',     // 「解锁关卡」标题绶带横幅(叠在卡片顶部)
        iconAsset: 'unlockLevelIcon',         // 中间播放视频图标装饰
        // 看视频次数由 CONFIG.AD_UNLOCK_ALL_COUNT 配置（复用复活链路同款模式：文案与
        // 实际生效数值来自同一个来源，见 unlock-overlays.js），{progress} 整体替换为
        // "剩余次数/总次数"（如 "2/3"），连斜杠一起高亮着色（红色，同原单数值高亮配色）
        watchVideoHint: '观看{progress}次视频\n解锁全部主题',
        primaryButtonAsset: 'btnGameTimeBack',   // 「不了，谢谢」图片按钮(关闭弹窗)
        primaryLabel: '不了，谢谢',
        secondaryButtonAsset: 'btnGameWatchVideo' // 「看视频」图片按钮(累计看满次数后永久解锁)
      },

      // 「分享解锁」卡片（js/play/modals/unlock-overlays.js share-unlock-overlay），
      // 卡片式风格对齐 unlockAllModal：白底卡片 + 顶部绶带横幅 + 中间锁图标 + 纯文字副文案 + 双图片按钮。
      shareUnlockModal: {
        bgImageAsset: 'winCard',                 // 同胜利/失败/解锁弹窗白底面板背景
        ribbonAsset: 'shareUnlockRibbon',        // 「分享解锁」标题绶带横幅
        iconAsset: 'shareUnlockLockIcon',        // 中间锁图标装饰
        subtitle: '分享给好友\n即可永久解锁该主题',
        primaryButtonAsset: 'btnThinkAgain',     // 「我在想想」图片按钮(关闭弹窗)
        secondaryButtonAsset: 'btnShareNow'      // 「立即分享」图片按钮(分享后永久解锁)
      },

      // 每日签到弹窗（独立可复用模块，逻辑见 systems/checkin.js，UI 见 play/modals/checkin-modal.js）
      // 7 天奖励配置：type='prop'(解锁道具，计数存储) | 'hint'(免费提示，计数存储) |
      // 'tempUnlock'(限时解锁全部主题，小时数存储，与 unlockAllHours 走同一套 Storage 机制)
      checkinModal: {
        enabled: false, // 每日签到功能总开关：false 时首页不显示入口按钮，改回 true 即可恢复
        ribbonAsset: 'checkinRibbonTitle',   // 顶部「每日签到」绶带标题
        panelBgAsset: 'checkinPanelBg',      // 弹窗白底紫边面板背景
        claimButtonAsset: 'checkinClaimBtn',            // 「签到领取」按钮
        claimTripleButtonAsset: 'checkinClaimTripleBtn',// 「三倍领取」看视频按钮(奖励数值*3，仅 prop/hint 生效)
        days: [
          { day: 1, cardAsset: 'checkinDay1', type: 'prop', amount: 1 },
          { day: 2, cardAsset: 'checkinDay2', type: 'hint', amount: 1 },
          { day: 3, cardAsset: 'checkinDay3', type: 'prop', amount: 2 },
          { day: 4, cardAsset: 'checkinDay4', type: 'tempUnlock', hours: 6 },
          { day: 5, cardAsset: 'checkinDay5', type: 'hint', amount: 3 },
          { day: 6, cardAsset: 'checkinDay6', type: 'hint', amount: 4 },
          { day: 7, cardAsset: 'checkinDay7', type: 'tempUnlock', hours: 24 }
        ]
      }
    }
  };
})();
