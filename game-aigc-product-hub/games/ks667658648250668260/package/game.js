// 快小游戏入口 · 完整 UI canvas 版
require("./kwaiadapter.js");   // wx = ks, GameGlobal.window = GameGlobal
require("./events.js");        // EventsManager
require("./wxhelper.js");      // wxhelper.GetMainCanvas
// ── api 工具层（脚手架标准模块，须在 ks-adapter 之前加载）──
require("./js/kwai-ad-config.js");    // 广告位 ID 配置
require("./api/kwai-base.js");        // 生命周期（onShow/onHide/exit）
require("./api/kwai-storage.js");     // 存档读写
require("./api/kwai-device.js");      // 振动
require("./api/kwai-share.js");       // 分享
require("./api/kwai-data-analysis.js"); // 场景上报
require("./api/kwai-file.js");        // 文件系统
require("./api/kwai-subpackage.js");  // 分包加载
require("./api/kwai-media.js");       // 视频/音频/图片
require("./js/admin-ad-config.js");
require("./js/admin-ad-control.js");
require("./api/kwai-ad.js");          // 激励视频/插屏/Banner
// ks-adapter.js 已删除，功能全部由上方 api/ 工具类承接
require("./js/asset-manager.js"); // 统一资源管理（引用计数 + 释放）
require("./js/telemetry-manifest.js");
require("./js/telemetry.js");  // v78.6 · 埋点（含调试浮层 + 一键卸载）
// V31.7 · 已移除游戏圈（未开通）
// STORY 是 window.STORY = {...} 用赋值方式，走 GameGlobal
require("./js/registry.js");   // v73.0 · 白名单/CDN 前缀等派生数据，须在 story.js 前加载
require("./js/story.js");
require("./js/drag-unlock.js"); // v1.0 · 视频内嵌拖拽解锁互动组件
require("./js/chapter-home.js");
require("./js/chapter-transition.js");
require("./js/icons.js");
require("./js/subtitles.js");
// 主画布
GameGlobal.canvas = wxhelper.GetMainCanvas("canvas");
require("./js/user-profile.js");
require("./js/achievements.js");
require("./js/main.js");
