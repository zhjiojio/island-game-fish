require("./kwaiadapter.js");
require("./ks-adapter.js");
require("./events.js");
require("./wxhelper.js");

window.canvas = wxhelper.GetMainCanvas("canvas");
window.__DDZ_SERVER_URL__ = "ws://8.130.86.207/ws";
window.__DDZ_HTTP_SERVER_URL__ = "http://8.130.86.207";
// cj 本地调试时使用本机服务地址。
// window.__DDZ_SERVER_URL__ = "ws://172.23.130.38:8080";
// window.__DDZ_HTTP_SERVER_URL__ = "http://172.23.130.38:8080";
// lh 本地调试时使用本机服务地址。
// window.__DDZ_SERVER_URL__ = "ws://172.23.124.143:8080";
// window.__DDZ_HTTP_SERVER_URL__ = "http://172.23.124.143:8080";
console.log("game.js load window.__DDZ_SERVER_URL__", window.__DDZ_SERVER_URL__);

// 调试模式：浏览器联调时开启，上线前改为 false
window.__DDZ_DEBUG__ = true;

require("js/main.js");
