// 快手小游戏入口（Canvas 运行时）
require("./kwaiadapter.js");   // wx = ks, GameGlobal.window = GameGlobal
require("./events.js");        // EventsManager 事件总线
require("./wxhelper.js");      // wxhelper.GetMainCanvas
require("./ks-adapter.js");    // 将 ks.* 适配为标准 Web API
// 主画布：必须在业务代码之前挂到 window.canvas
GameGlobal.canvas = wxhelper.GetMainCanvas("canvas");
window.canvas = GameGlobal.canvas;
require("./js/main.js");
