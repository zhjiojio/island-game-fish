/**
 * game.js — 主包入口
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【主包 vs 分包职责 - 代码生成（codegen）阶段强制规则】
 * ────────────────────────────────────────────────────────────────────────────
 * 主包只放首屏必需的代码与素材；**非必要的文件在代码生成（codegen）阶段自动放入分包**。
 *
 * 判定规则（codegen 阶段执行）：
 *   1) 仅在特定关卡 / 场景 / 结局下使用的代码文件  → 放入对应分包根目录
 *      例：第 2 关逻辑 → subpackages/subpackage1/，第 3 关逻辑 → subpackages/subpackage2/
 *   2) 仅在特定关卡使用的素材（非首屏）           → 放入对应分包 assets/
 *      例：level2-bg.png → subpackages/subpackage1/assets/Image/level2-bg.png
 *   3) 首屏必需代码 / 首屏必需素材 / home-asset/    → 必须留在主包，禁止入分包
 *   4) 单文件 > 512 KB 的图片 / > 200 KB 的 bgm / 任意视频 → 必须上传 CDN
 *      分包内不例外，分包内大文件同样必须走 CDN URL，禁止打包
 *
 * 分包加载（主包侧调用，按需触发）：
 *   M3.SubpackageLoader.load({
 *     name: 'subpackage1', // 与 game.json subpackages[].name 一致
 *     onSuccess: function () { /* 分包已就绪，进入分包场景 *\/ },
 *     onFail:    function (e) { console.error('[SubPkg] 加载失败', e); },
 *   });
 *
 * 分包内 game.js 由 ks.loadSubpackage 加载成功后自动执行一次（场景注册用），
 * 详见 subpackages/subpackage1/game.js、subpackages/subpackage2/game.js 顶部说明。
 * ────────────────────────────────────────────────────────────────────────────
 */

require("./kwaiadapter.js");
require("./ks-adapter.js");
require("./events.js");
require("./wxhelper.js");

window.canvas = wxhelper.GetMainCanvas("canvas");

require("js/main.js");
