/**
 * core/config.js — 游戏全局配置（单一可信来源）
 * 职责：
 *   - 定义所有默认配置常量（UI、音频、关卡策略）
 *   - 远程 JSON 下发后 RemoteConfig 会合并覆盖 CONFIG.themes / levels 等
 *   - 所有 CDN icon/图片路径在此维护，没有 CDN 时回退到本地 assets/ 路径
 *   - 新增玩法只需在 GAMEPLAY_MODES 注册，无需改业务代码
 *   - 产品定制内容（AppID/CDN地址/广告位/美术资源/语音包人设/弹窗配色/存储前缀）
 *     全部来自 core/product.config.js（PRODUCT_CONFIG），本文件只做框架层组装，
 *     不直接写死任何产品专属内容——这样换一款游戏时只需重写 product.config.js
 *
 * 规则：禁止在 config.js 外部硬编码任何 CDN URL / 本地资源路径。
 *       所有字段均可被远程配置覆盖（RemoteConfig.merge 合并时深合并此对象）。
 * 导出：CONFIG（只读，业务层通过 CONFIG.xxx 访问）
 */
(function () {
  'use strict';

  var P = window.PRODUCT_CONFIG || {};
  var STORAGE_PREFIX = P.storageKeyPrefix || 'app';

  var CONFIG = window.CONFIG = {

    // ── 版本 ─────────────────────────────────────────────────────────────────
    BUILD_VER: 'v2.0.0',

    // ── 产品身份（来自 PRODUCT_CONFIG）───────────────────────────────────────
    GAME_TITLE:  P.gameTitle   || '',
    SHARE_TITLE: P.shareTitle  || '',
    BEAT_PCT_TEMPLATE: P.beatPctTemplate || '击败了 {pct}% 的玩家！',
    COPYRIGHT_OWNER: P.copyrightOwner || '',
    CERT_NO:         P.certNo         || '',

    // ── 远程配置地址（来自 PRODUCT_CONFIG）────────────────────────────────────
    REMOTE_CONFIG_URL: P.remoteConfigUrl || '',
    REMOTE_CONFIG_TIMEOUT: 5000,  // ms

    // ── 本地 Mock 配置（仅供离线开发调试用，生产环境务必保持 false）───────────────
    // 置为 true 时 RemoteConfig.load() 会直接使用 data/mock-levels-config.js 里的
    // window.MOCK_LEVELS_CONFIG，跳过远程请求；用于新增玩法/新增关卡时的本地联调，
    // 不依赖生产 CDN。
    USE_MOCK_CONFIG: false,

    // ── CDN 前缀（来自 PRODUCT_CONFIG）────────────────────────────────────────
    CDN_BASE_CONFIG: (P.cdnBase && P.cdnBase.config) || '',
    CDN_BASE_MEDIA:  (P.cdnBase && P.cdnBase.media)  || '',
    CDN_BASE_AIGC:   (P.cdnBase && P.cdnBase.aigc)   || '',

    // ── 虚拟视口 ──────────────────────────────────────────────────────────────
    VW: 375,
    VH: 812,  // 美女来找茬新模版 Figma 设计尺寸 375x812（老铁眼真尖模版为 667，见 PRODUCT_CONFIG.template.id 区分）

    // ── 布局缩放 clamp 区间（core/loop.js resize() 用它算 M3.Layout.scale）─────
    // scale = 实际屏幕宽度 / VW，超出区间时截断，避免极窄/超宽机型上 HUD 元素过小或过大。
    LAYOUT_SCALE_MIN: 0.85,
    LAYOUT_SCALE_MAX: 1.3,

    // ── 布局（高度和间距分开，改间距不影响元素大小）────────────────────────────
    // 链路: safeTop → TOP_MARGIN → [状态栏行高] → TITLE_GAP → [标题行高] → PROGRESS_GAP → [进度点高] → STAGE_GAP → 舞台
    HUD_TOP_MARGIN: 15,
    STATUS_BAR_H: 40,
    TITLE_GAP: 10,
    TITLE_BAR_H: 34,
    PROGRESS_GAP: 6,
    DOT_SIZE: 32,
    STAGE_GAP: 8,
    STAGE_GAP_IMAGE: 20,
    NO_TITLE_PROGRESS_GAP: 15,
    BOTTOM_BAR_H: 88,
    BOTTOM_BAR_MARGIN: 50,
    PILL_W: 78,
    PILL_H: 36,
    PILL_FONT: 18,
    ITEM_SIZE: 88,
    ITEM_GAP: 30,

    DESIGN_BASE_H: 812,
    DESIGN_BASE_W: 375,
    DESIGN_MAX_IMG_H: 500,
    HUD_TOP_MARGIN_MIN: 0,    HUD_TOP_MARGIN_MAX: 120,
    PROGRESS_TO_STAGE_MIN: 0,  PROGRESS_TO_STAGE_MAX: 120,
    BOTTOM_RESERVE_MIN: 0,    BOTTOM_RESERVE_MAX: 200,

    // ── 倒计时配置 ────────────────────────────────────────────────────────────
    COUNTDOWN_GUARD_MAX: 3,   // 每帧最多补扣秒数（后台挂起保护）
    REVIVE_ADD_TIME:    100,  // 复活额外秒数
    REVIVE_ADD_LIVES:   5,    // 生命值/次数用尽后，看视频复活额外增加的次数（非重置，是在已用尽基础上追加）
    DRESSUP_TIME_LIMIT: 80,   // 换装玩法 duration 未配置时的默认倒计时秒数
    DRESSUP_AUTO_ADVANCE_MS: 1500, // 换装玩法：匹配成功后自动切到下一张原图 / 通关后自动弹出结算卡片的等待时长
    DRESSUP_CHAR_SLIDE_MS: 320,    // 换装玩法：原图左右切换的滑动过渡动画时长
    HINT_LAST_SECS:     10,   // 最后 N 秒开始 tick + 计时器抖动

    // ── 难度参数 ──────────────────────────────────────────────────────────────
    // DIFF[key].perOdd: 每个茬/目标增加的建议时长(秒)
    DIFF: {
      tutorial:  { perOdd: 25, penalty: 2,  hitScale: 1.2 },
      easy:      { perOdd: 20, penalty: 2,  hitScale: 1.1 },
      'easy+':   { perOdd: 17, penalty: 2,  hitScale: 1.0 },
      normal:    { perOdd: 15, penalty: 3,  hitScale: 1.0 },
      'normal+': { perOdd: 13, penalty: 3,  hitScale: 0.95 },
      hard:      { perOdd: 11, penalty: 4,  hitScale: 0.9 },
      hell:      { perOdd:  9, penalty: 5,  hitScale: 0.85 },
      nightmare: { perOdd:  7, penalty: 5,  hitScale: 0.8 },
      ultra:     { perOdd:  6, penalty: 6,  hitScale: 0.75 }
    },
    // 模式基础建立时间（秒）
    SETUP_SEC: {
      hidden: 6,
      spot:   10,
      hunt:   8,
      story:  0
    },
    BOSS_BONUS: 8,   // Boss 关额外时长

    // ── 宽容机制 ──────────────────────────────────────────────────────────────
    MERCY_FAIL_THRESHOLD: 2,   // 连败 N 次触发
    MERCY_ADD_TIME:      10,   // 奖励时长（秒）

    // ── 广告 ──────────────────────────────────────────────────────────────────
    AD_LOADING_TIMEOUT:    8000,   // 广告加载超时 ms
    AD_WATCH_TIMEOUT:      120000, // 广告展示后等待 onClose 的安全网超时 ms（10分钟，直播激励广告可能很长）
    AD_SKIP_COUNT:         2,      // 跳关需要连续观看的广告次数
    AD_UNLOCK_ALL_COUNT:   3,      // 解锁全部场景需要的广告次数
    INTERSTITIAL_INTERVAL: 3,      // 每 N 关插一次插屏

    // ── 开发期调试开关（生产环境务必保持 false）───────────────────────────────
    // 置为 true 时 Ads.showRewarded/showSkipAd 直接判定"已看完"回调，不请求真实
    // 广告位；用于广告位 ID 未配置/未过审时的真机联调，跳过广告卡死的问题。
    DEV_SKIP_ADS: false,

    // ── voice-extra 分包开关（生产环境务必确认后再打开，见下方说明）───────────────
    // "剩余提示"语音（remaining_1/2/3 各 _a/_b/_c）设计上应放在 subpackages/voice-extra/
    // 子包按需加载，但当前项目 game.json.subpackages 为空、且该子包目录下并没有真实
    // 素材文件（本地和 CDN 均未找到对应 mp3）。在素材补齐 + game.json 正式声明该子包
    // 之前，必须保持 false：Audio._resolveCdnVoice 会因此跳过 remaining_* 语音（静默
    // 不播放，不影响主流程），避免走一条实际不存在的分包路径导致"空分包路由=无限
    // loading 且不报错"的隐患（该坑已在架构文档 §8 记录）。
    VOICE_EXTRA_SUBPACKAGE_ENABLED: false,

    // ── 广告位 ID（来自 PRODUCT_CONFIG，需与 kwai-ad-config.js 保持同步）──────────
    AD_UNIT: P.adUnit || { rewarded: '', interstitial: '', banner: '' },

    // ── UI 图片资源（来自 PRODUCT_CONFIG，优先 CDN，无 CDN 时用本地 assets/Icon/）──
    // 格式：{ cdn: 'https://...', local: 'assets/Icon/xxx.png' }
    // 无 cdn 字段时直接用 local
    UI_ASSETS: P.uiAssets || {},

    /**
     * 获取 UI 资源实际路径（CDN 优先，回退本地）
     * @param {string} key  UI_ASSETS 的键名
     * @returns {string}
     */
    uiAsset: function (key) {
      var entry = this.UI_ASSETS[key];
      if (!entry) { console.warn('[Config] unknown ui asset:', key); return ''; }
      return (entry.cdn || entry.local) || '';
    },

    /**
     * 获取指定玩法实际生效的关卡标题类型（'image' | 'text'）
     * 优先取 TEMPLATE.hud.levelTitleTypeByMode[mode]，未配置时回退默认 levelTitleType。
     * 新增玩法只需在 product.config.js 的 levelTitleTypeByMode 里加一条即可生效，无需改框架代码。
     * @param {string} mode 玩法 id（如 'hidden'/'spot'/'hunt'/'story'/'dressup'）
     */
    getHudTitleType: function (mode) {
      var T = this.TEMPLATE.hud;
      return (T.levelTitleTypeByMode && T.levelTitleTypeByMode[mode]) || T.levelTitleType;
    },

    /**
     * 获取指定玩法的关卡标题展示格式。
     * 1=「第x关 标题名」，2=仅展示标题名；未配置时默认使用 1。
     * @param {string} mode 玩法 id
     */
    getHudTitleFormat: function (mode) {
      var T = this.TEMPLATE.hud;
      var formats = T.levelTitleFormatByMode || {};
      return formats[mode] === 2 ? 2 : 1;
    },

    /**
     * 获取指定玩法实际生效的失败弹窗 style（'fullscreen' | 'card' | 'card-image'）
     * 优先取 TEMPLATE.loseModal.styleByMode[mode]，未配置时回退默认 style。
     * @param {string} mode 玩法 id（如 'hidden'/'spot'/'hunt'/'story'/'dressup'）
     */
    getLoseModalStyle: function (mode) {
      var T = this.TEMPLATE.loseModal;
      return (T.styleByMode && T.styleByMode[mode]) || T.style;
    },

    /**
     * 是否显示底部道具栏「加时」按钮（按玩法可配置开关）。
     * 通过 TEMPLATE.hud.showAddTimeByMode[mode] 配置；未显式配置的玩法默认展示。
     * @param {string} mode 玩法 id
     */
    getShowAddTime: function (mode) {
      var T = this.TEMPLATE.hud;
      if (T.showAddTimeByMode && Object.prototype.hasOwnProperty.call(T.showAddTimeByMode, mode)) {
        return !!T.showAddTimeByMode[mode];
      }
      return true;
    },

    /**
     * 是否显示底部道具栏「放大」按钮 + 启用双指捏合缩放手势。
     * 通过 TEMPLATE.hud.showZoomByMode[mode] 配置；未显式配置的玩法默认不展示。
     * 实际缩放交互见 base-mode.js applyPinch + core/input.js handlePinch。
     * @param {string} mode 玩法 id
     */
    getShowZoom: function (mode) {
      var T = this.TEMPLATE.hud;
      return !!(T.showZoomByMode && T.showZoomByMode[mode]);
    },

    /**
     * 是否显示底部道具栏「加5次机会」按钮。
     * 「加5次」本质是给 state.dressup.maxErrors 加容错次数，只有换装玩法有「容错次数」
     * 这个概念，其余玩法（找茬/寻物/剧情）没有对应机制，按钮点了也不该生效。
     * 通过 TEMPLATE.hud.showAddChanceByMode[mode] 按玩法配置是否显示，未配置的玩法
     * 默认不显示；新增玩法如果也有容错次数概念，在 product.config.js 里加一条即可。
     * @param {string} mode 玩法 id
     */
    getShowAddChance: function (mode) {
      var T = this.TEMPLATE.hud;
      return !!(T.showAddChanceByMode && T.showAddChanceByMode[mode]);
    },

    /**
     * 是否展示「提示」功能（按玩法可配置开关）。
     * 通过 TEMPLATE.hud.showHintByMode[mode] 配置；未显式配置的玩法默认展示
     * （找茬/寻物/剧情玩法本身就依赖提示揭晓线索）。换产品/新增玩法如需关闭
     * 提示功能，在 product.config.js 里显式配置 false 即可，无需改框架代码。
     * @param {string} mode 玩法 id
     */
    getShowHint: function (mode) {
      var T = this.TEMPLATE.hud;
      if (T.showHintByMode && Object.prototype.hasOwnProperty.call(T.showHintByMode, mode)) {
        return !!T.showHintByMode[mode];
      }
      return true;
    },

    /**
     * 是否在 top 区展示关卡标题（按玩法可配置开关）。
     * 通过 TEMPLATE.hud.showTitleByMode[mode] 配置；未显式配置的玩法默认展示（所有玩法都展示标题）。
     * 换装玩法（dressup）同样展示标题，但标题类型为图片横幅（见 CONFIG.getHudTitleType /
     * product.config.js 的 levelTitleTypeByMode.dressup = 'image'）。
     * @param {string} mode 玩法 id
     */
    getShowTitle: function (mode) {
      var T = this.TEMPLATE.hud;
      if (T.showTitleByMode && Object.prototype.hasOwnProperty.call(T.showTitleByMode, mode)) {
        return !!T.showTitleByMode[mode];
      }
      return true;
    },

    /**
     * 获取指定玩法「提示」功能的最大可用次数（按玩法可配置）。
     * 通过 TEMPLATE.hud.hintMaxUsesByMode[mode] 配置；未显式配置的玩法默认不设
     * 上限（999，近似无限）。换产品/新增玩法如需限制次数，在 product.config.js
     * 里配置即可，无需改框架代码。
     * @param {string} mode 玩法 id
     */
    getHintMaxUses: function (mode) {
      var T = this.TEMPLATE.hud;
      if (T.hintMaxUsesByMode && Object.prototype.hasOwnProperty.call(T.hintMaxUsesByMode, mode)) {
        return T.hintMaxUsesByMode[mode];
      }
      return 999; // 默认不设上限（用大数近似“无限”），按玩法可在 product.config.js 里配置具体上限
    },

    /**
     * 获取指定玩法「看视频复活」实际追加的数值（按 limitType 区分秒数/次数，按玩法可单独配置）。
     * 通过 TEMPLATE.loseModal.reviveAddTimeByMode[mode] / reviveAddLivesByMode[mode] 配置；
     * 未显式配置的玩法回退到全局默认 REVIVE_ADD_TIME / REVIVE_ADD_LIVES。
     * 这是复活链路的唯一数值来源：玩法(mode) 在触发失败弹窗时调用本方法产出数值，
     * 显式塞进 SceneManager.open 的 data.reviveAmount 传给 lose-modal 卡片文案，
     * 卡片按钮点击后同一个数值又原样传回 mode.onRevive 生效，避免两端各自读取
     * 全局常量导致的"文案与实际效果不一致"问题。
     * @param {string} mode 玩法 id
     * @param {'time'|'count'} limitType 复活场景：'time'=计时器耗尽只加秒数，'count'=次数/生命用尽只加次数
     */
    getReviveAmount: function (mode, limitType) {
      var T = this.TEMPLATE.loseModal || {};
      if (limitType === 'time') {
        var byModeTime = T.reviveAddTimeByMode || {};
        if (Object.prototype.hasOwnProperty.call(byModeTime, mode)) return byModeTime[mode];
        return this.REVIVE_ADD_TIME;
      }
      var byModeLives = T.reviveAddLivesByMode || {};
      if (Object.prototype.hasOwnProperty.call(byModeLives, mode)) return byModeLives[mode];
      return this.REVIVE_ADD_LIVES;
    },

    _imgRatio: function () {
      var imgH = M3.Layout.w * this.DESIGN_MAX_IMG_H / this.DESIGN_BASE_W;
      var remain = M3.Layout.h - M3.Layout.safeTop - M3.Layout.safeBottom - imgH;
      var designRemain = this.DESIGN_BASE_H - this.DESIGN_MAX_IMG_H;
      return remain / designRemain;
    },

    _scale: function (base) {
      return M3.Layout.px(base * this._imgRatio());
    },

    _scaleClamp: function (base, min, max) {
      var raw = base * this._imgRatio();
      return M3.Layout.px(Math.max(min, Math.min(max, raw)));
    },

    getProgressToStage: function (mode) {
      var base = this.getHudTitleType(mode) === 'image' ? this.STAGE_GAP_IMAGE : this.STAGE_GAP;
      return this._scaleClamp(base, this.PROGRESS_TO_STAGE_MIN, this.PROGRESS_TO_STAGE_MAX);
    },

    getAdaptiveTopMargin: function () {
      if (M3.Layout.safeTop >= 40) return M3.Layout.px(5);
      return this._scaleClamp(this.HUD_TOP_MARGIN, this.HUD_TOP_MARGIN_MIN, this.HUD_TOP_MARGIN_MAX);
    },

    getPillSize: function () {
      var px = M3.Layout.px;
      return { w: this._scale(this.PILL_W), h: this._scale(this.PILL_H), font: this._scale(this.PILL_FONT) };
    },

    getItemSize: function () {
      return { size: this._scale(this.ITEM_SIZE), gap: this._scale(this.ITEM_GAP) };
    },

    getStageBottomReserve: function () {
      var item = this.getItemSize();
      return M3.Layout.safeBottom + item.size + this._scaleClamp(this.BOTTOM_BAR_MARGIN, this.BOTTOM_RESERVE_MIN, this.BOTTOM_RESERVE_MAX);
    },

    /**
     * 进度点顶部 Y = safeTop + TOP_MARGIN + STATUS_BAR_H + TITLE_GAP [+ TITLE_BAR_H + PROGRESS_GAP]
     * 无标题玩法省去标题行，用 NO_TITLE_PROGRESS_GAP 替代 TITLE_GAP + TITLE_BAR_H + PROGRESS_GAP。
     */
    getHudHeaderRowsHeight: function (mode) {
      var showTitle = this.getShowTitle(mode);
      var h = this.STATUS_BAR_H + (showTitle
        ? this.TITLE_GAP + this.TITLE_BAR_H + this.PROGRESS_GAP
        : this.NO_TITLE_PROGRESS_GAP);
      return M3.Layout.safeTop + this.getAdaptiveTopMargin() + this._scale(h);
    },

    /**
     * 舞台 Y = safeTop + 头部高度 + 进度点高度 + 进度点到舞台间距
     */
    getHudContentHeight: function (mode) {
      return this.getHudHeaderRowsHeight(mode) + this._scale(this.DOT_SIZE) + this.getProgressToStage(mode);
    },

    /**
     * 【机型适配核心入口】把游戏页整屏统一划分为三大区域，供 play.js / hud.js / 各 mode.js
     * 统一读取，不再各自重复计算 stageY/stageH：
     *   - top    区：返回按钮/生命值胶囊/倒计时/标题/进度点（hud.js 顶部内容，高度=getHudContentHeight）
     *   - stage  区：玩法主舞台（图片/图片+底下栏目），各 mode 在此矩形内自行二次细分
     *     （如 hunt 顶部道具条、dressup 底部衣服栏、spot 双图左右/上下分栏）
     *   - bottom 区：底部广告道具按钮栏（高度=getStageBottomReserve）
     * 三区域上下相邻、不重叠，纵向铺满 safeTop~屏幕底，横向铺满整屏宽度。
     * @param {string} mode 玩法 id（如 'hidden'/'spot'/'hunt'/'story'/'dressup'）
     * @returns {{top:{x,y,w,h}, stage:{x,y,w,h}, bottom:{x,y,w,h}}}
     */
    getLayoutRegions: function (mode) {
      var W = M3.Layout.w, H = M3.Layout.h, safeTop = M3.Layout.safeTop;
      var topH = this.getHudContentHeight(mode);
      var botH = this.getStageBottomReserve();
      var stageY = topH;
      var stageH = H - stageY - botH;
      return {
        top:    { x: 0, y: safeTop,    w: W, h: topH - safeTop },
        stage:  { x: 0, y: stageY,     w: W, h: stageH },
        bottom: { x: 0, y: H - botH,  w: W, h: botH }
      };
    },

    /**
     * 【返回按钮唯一坐标来源】游戏内所有页面（关卡选择页/home.js、关卡内部/hud.js 等）的
     * 返回按钮统一从这里取坐标+尺寸，保证跨页面视觉位置/大小完全一致，不再各自各写一套
     * backX/backY/backSize 的算式（旧 bug：关卡选择页与关卡内部返回键位置/大小不一致）。
     * @returns {{x,y,size}}
     */
    getBackButtonRect: function () {
      var px = M3.Layout.px;
      var safeTop = M3.Layout.safeTop;
      var size = px(44);
      var x = px(11);
      var y = safeTop + this.getAdaptiveTopMargin() + (this._scale(this.STATUS_BAR_H) - size) / 2;
      return { x: x, y: y, size: size };
    },

    // ── 音频资源（来自 PRODUCT_CONFIG）───────────────────────────────────────────
    AUDIO: P.audio || { bgm: { cdn: [] } },

    // ── 语音包配置（来自 PRODUCT_CONFIG）─────────────────────────────────────────
    VOICE_PACKS: P.voicePacks || [],
    DEFAULT_VOICE_PACK: P.defaultVoicePack || '',

    // 每个语音包的 clip 名（不含包前缀和 .mp3）
    // remaining_* 在子包，其余在 CDN
    VOICE_CLIPS: P.voiceClips || [],
    // 多候选随机的 key（不含 _a/b/c 后缀）
    VOICE_MULTI_KEYS: P.voiceMultiKeys || [],

    // ── 可配置的玩法模式注册表（★ 核心：新增玩法只在此注册）────────────────────
    // 每项：{ id, name, setupSec, ModeClass: 'js/play/modes/{id}.js' 导出的类名 }
    GAMEPLAY_MODES: {
      hidden: { id: 'hidden', name: '找出图中的穿越物', setupSec: 6,  module: 'HiddenMode'  },
      spot:   { id: 'spot',   name: '找出上下两幅图的不同之处',   setupSec: 10, module: 'SpotMode'    },
      hunt:   { id: 'hunt',   name: '寻物',     setupSec: 8,  module: 'HuntMode'    },
      story:  { id: 'story',  name: '剧情找线索',setupSec: 0, module: 'StoryMode'   },
      dressup: { id: 'dressup', name: '换装', setupSec: 0, module: 'DressupMode' },
      puzzle:  { id: 'puzzle', name: '拼图', setupSec: 8, module: 'PuzzleMode' }
    },

    // ── 星级评分阈值（通关剩余时间比例）─────────────────────────────────────────
    STAR_THRESHOLDS: [
      { stars: 3, ratio: 0.5 },
      { stars: 2, ratio: 0.25 },
      { stars: 1, ratio: 0 }
    ],

    // ── 弹窗视觉常量（来自 PRODUCT_CONFIG）───────────────────────────────────────
    MODAL: P.modalTheme || { cardBg: '#fff', cardBorder: '#999', cardRadius: 24, borderWidth: 4, bannerOffsetY: 0 },

    // ── 模版配置（来自 PRODUCT_CONFIG，控制 UI 布局风格）─────────────────────────
    // 不设 template 字段时全部回退到现有模版行为（向后兼容）
    // 框架代码通过 CONFIG.TEMPLATE.xxx 读取各区域的布局选项
    TEMPLATE: (function () {
      var T = P.template || {};
      var D = {
        id: 'meinv',
        welcome: {
          logoAsset: 'gameLogo', startButtonAsset: 'mnvBtnStart',
          showSigninButton: false, signinButtonAsset: null,
          showDesktopButton: true, desktopButtonAsset: 'btnAddDesktop',
          showTopRightActions: true,
          coldStartToFirstLevel: false
        },
        home: {
          cardLayout: 'grid', cardSize: { w: 100, h: 108 },
          bottomBarStyle: 'round',
          showTopRightActions: true, showProgress: true, showNavArrows: true,
          navLeftAsset: 'gameNavLeft', navRightAsset: 'gameNavRight'
        },
        hud: {
          showTopRightActions: true,
          levelTitleType: 'image', levelTitleAsset: 'levelTitle',
          showStatusPills: false,
          showDividerBars: true, dividerColor: '#908FE6', dividerAsset: null,
          showBottomItemStrip: true, showBottomAvatarStrip: false,
          showNavArrows: true, navLeftAsset: 'gameNavLeft', navRightAsset: 'gameNavRight',
          progressStyle: 'dots',
          errorDisplayFormat: null, errorDisplayColor: '#FF0000'
        },
        winModal: {
          style: 'fullscreen', bgImageAsset: 'winCard',
          sceneImageSize: 368,
          showStars: false, showBeatPct: false,
          titleFromLevel: true, titleText: '恭喜通关',
          decorationAsset: 'winDecoration',
          primaryButtonAsset: 'btnGameBackHome', secondaryButtonAsset: 'btnGameNext'
        },
        loseModal: {
          style: 'fullscreen', bgImageAsset: 'winCard',
          titleFromLevel: true, titleText: '时间到',
          showReviveButton: true, showReplayButton: true,
          // 按玩法覆盖默认 style；新增玩法如需卡片图片式结算，在此加一条即可，无需改代码
          styleByMode: {},
          // 'card-image' style 专用素材（背景仍用 bgImageAsset）
          titleImageAsset: 'timesOver',
          primaryButtonAsset: 'btnGameAgain',
          secondaryButtonAsset: 'btnGameWatchVideo',
          hourglassAsset: 'sandyClock'
        },
        // 每日签到弹窗配置：必须在此预声明空对象，下方合并循环只会遍历 D 已有的 key，
        // 否则 product.config.js 里 template.checkinModal 的内容永远不会被合并进 CONFIG.TEMPLATE
        checkinModal: {},
        // 「解锁全部场景」卡片配置：同上必须预声明空对象，否则 product.config.js 里
        // template.unlockAllModal（素材/文案）不会被合并进 CONFIG.TEMPLATE，
        // 导致 unlock-overlays.js 里 T.xxx 全部读到 undefined、全部走 fallback 绘制
        unlockAllModal: {},
        // 「分享解锁」卡片配置：同上必须预声明空对象，否则 product.config.js 里
        // template.shareUnlockModal 不会被合并进 CONFIG.TEMPLATE，
        // 导致 unlock-overlays.js share-unlock-overlay 里 T.xxx 全部读到 undefined、全部走 fallback 绘制
        shareUnlockModal: {}
      };
      // 深合并：T 覆盖 D 的第一层
      for (var k in D) {
        if (!D.hasOwnProperty(k)) continue;
        if (typeof D[k] === 'object' && D[k] !== null && !Array.isArray(D[k])) {
          if (T[k]) {
            for (var kk in T[k]) {
              if (T[k].hasOwnProperty(kk)) D[k][kk] = T[k][kk];
            }
          }
        } else if (T[k] !== undefined) {
          D[k] = T[k];
        }
      }
      return D;
    })(),

    // ── toast 配置 ────────────────────────────────────────────────────────────
    TOAST: {
      duration:  1600,   // ms
      minWidth:  120,
      maxWidth:  351,
      paddingX:  16,
      paddingY:  10,
      fontSize:  15,
      color:     '#ffffff',
      bgColor:   'rgba(0,0,0,0.72)',
      radius:    22
    },

    // ── 存储 keys（§5.1 全量，集中维护；前缀来自 PRODUCT_CONFIG.storageKeyPrefix）───
    STORAGE_KEY_PREFIX: STORAGE_PREFIX,
    STORAGE_KEYS: {
      user:           STORAGE_PREFIX + '_user',
      voicePack:      STORAGE_PREFIX + '_voice_pack',
      voiceUnlocks:   STORAGE_PREFIX + '_voice_unlocks_v1',
      themeUnlocks:   STORAGE_PREFIX + '_theme_unlocks_v1',
      themeUnlockAdCount: STORAGE_PREFIX + '_theme_unlock_ad_count_v1',
      unlockAllPromptShown: STORAGE_PREFIX + '_unlock_all_prompt_shown_v1',
      unlockAllAdCount: STORAGE_PREFIX + '_unlock_all_ad_count_v1',
      passedLevels:   STORAGE_PREFIX + '_passed_levels_v1',
      stats:          STORAGE_PREFIX + '_stats_v1',
      playtimeMs:     STORAGE_PREFIX + '_playtime_ms',
      failStreak:     STORAGE_PREFIX + '_fail_streak_v1',
      sfxEnabled:     STORAGE_PREFIX + '_sfx_enabled',
      bgmEnabled:     STORAGE_PREFIX + '_bgm_enabled',
      shortcutInstalled: STORAGE_PREFIX + '_shortcut_installed',
      // 冷启动新手引导：标记是否已经走过「新用户直接进第一关」的一次性流程，
      // 存在即视为老用户（不再享受直接跳关，走正常「进首页选主题」路径）。
      newUserFirstLevelDone: STORAGE_PREFIX + '_new_user_first_level_done',
      // 签到功能（js/systems/checkin.js，独立可复用模块）
      checkinState:       STORAGE_PREFIX + '_checkin_state_v1',        // 签到周期状态(连续天数/上次签到日期)
      checkinPropCount:   STORAGE_PREFIX + '_checkin_prop_count',      // 道具计数(仅计数，暂无消耗系统对接)
      checkinHintCount:   STORAGE_PREFIX + '_checkin_hint_count',      // 提示计数(仅计数，暂无消耗系统对接)
      tempUnlockAllUntil: STORAGE_PREFIX + '_temp_unlock_all_until',   // 限时解锁全部主题的到期时间戳(通用，签到/其他活动均可复用)
      analyticsBuffer:   '__analytics_buffer__',
      teleLastBoot:      '__tele_last_boot__'
      // 动态 key: <prefix>_theme_<id>_unlocked / <prefix>_last_level_<themeId>（由 storage.js 动态生成）
    }
  };

  // 解析 BGM CDN URL（替换 {CDN_MEDIA} 占位符）
  CONFIG.AUDIO.bgm.cdn = (CONFIG.AUDIO.bgm.cdn || []).map(function (url) {
    return url.replace('{CDN_MEDIA}', CONFIG.CDN_BASE_MEDIA);
  });
})();
