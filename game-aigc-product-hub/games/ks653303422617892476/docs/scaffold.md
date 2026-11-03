# 脚手架规范 → <GAME_NAME>（<APPID>）

## 基础信息

> **配置文件**：`<HUB_GAMES_DIR>/<APPID>/workflow-run.yml`
>
> 以下字段均从该文件的 `config` 节点读取：
> - `config.appid` — 快手小游戏 AppID
> - `config.ad_units.rewarded_video` — 激励视频广告位 ID
> - `config.ad_units.interstitial` — 插屏广告位 ID
> - `config.ad_units.banner` — Banner 广告位 ID
> - `config.share_template_id` — 分享模版 ID

| 项目 | 值 |
|---|---|
| APPID | `<config.appid>` |
| 激励视频广告位 | `<config.ad_units.rewarded_video 或空>` |
| 插屏广告位 | `<config.ad_units.interstitial 或空>` |
| Banner 广告位 | `<config.ad_units.banner 或空>` |
| 分享模版 ID | `<config.share_template_id 或空>` |
| 代码生成目录 | `package/js/`（唯一允许写入） |

## 约束

- 所有业务逻辑只能写在 `package/js/`（含子文件夹），禁止修改根目录适配文件
- 快手环境：开发者工具加载 `package/`
- H5 调试：`package/index.html` 直接打开

## 文件同步规则

- 每新增 `js/xxx.js` → `index.html` 追加 `<script src="js/xxx.js?v=1"></script>`
- 所有 `require` 只写在 `js/main.js` 里，其他业务文件内禁止使用 `require`
- `js/main.js` 除【占位绘制】（`draw()` 函数体）外禁止修改任何内容
- `api/` 和 `standard/` 内文件已预置，禁止修改

### 1. 画布获取

```js
var canvas = window.canvas;
// 优先获取 webgl2，不支持时降级到 webgl；禁止使用 '2d'
var gl;
try { gl = canvas.getContext('webgl2'); } catch (e) {}
if (!gl) {
  try { gl = canvas.getContext('webgl'); } catch (e) {}
}
```

> ⚠️ **[强制] 所有渲染必须使用 WebGL API**（`gl.*`），**严禁**使用 `canvas.getContext('2d')` 或任何 Canvas 2D API。

### 2. js/ 和 standard/ 目录结构

```
js/
  m3-init.js    # M3 命名空间 + Layout 初始化（禁止修改）
  kwai-ad-config.js  # 广告位配置（禁止修改）
  layout.js     # 响应式布局
  board.js      # 游戏数据
  game.js       # 玩法逻辑
  render.js     # WebGL 绘制
  input.js      # 触摸 / 鼠标
  main.js       # 装配 + 主循环（禁止修改，仅【占位绘制】可替换）
standard/       # 标准工具库（脚手架已提供，禁止修改）
  asset-manager.js      # 统一资源管理器（引用计数 + 分组释放）
  kwai-event-bus.js     # 事件总线
  subpackage-loader.js  # 分包加载器（按需 + 并行预加载）
  cdn-loader.js         # CDN 资源下载缓存加载器
api/            # 平台能力（脚手架已提供，禁止修改）
  kwai-login.js      # 用户登录
  kwai-ad.js         # 广告（激励 / 插屏 / Banner）
  kwai-share.js      # 分享
  kwai-media.js      # 视频 / 音频 / 图片（按需引入）
  kwai-base.js       # 系统信息 / 生命周期 / 触摸（按需引入）
  kwai-render.js     # 画布 / 帧率 / 字体 / 图片预加载（按需引入）
  kwai-ui.js         # Toast / Modal / Loading / 胶囊布局（按需引入）
  kwai-network.js    # HTTP / 下载 / 上传 / WebSocket（按需引入）
  kwai-storage.js    # 本地数据缓存（按需引入）
  kwai-file.js       # 文件系统（按需引入）
  kwai-device.js     # 传感器 / 键盘 / 网络状态 / 振动（按需引入）
  kwai-open.js       # 登录 / 用户信息 / 授权 / Feed 流（按需引入）
  kwai-record.js     # 对局回放（按需引入）
  kwai-repost.js     # 主动转发（按需引入）
  kwai-shortcut.js   # 添加到桌面（按需引入）
  kwai-siderbar.js   # 侧边栏（按需引入）
  kwai-commonuse.js  # 设为常用（按需引入）
  kwai-official.js   # 官方号 / CP 服务号（按需引入）
  kwai-game-community.js  # 游戏圈（按需引入）
  kwai-subpackage.js      # 分包加载（按需引入）
  kwai-data-analysis.js   # 数据分析上报（按需引入）
```

> 💡 **按需引入**：`api/` 目录下所有文件已由脚手架预置，默认只加载登录、广告、分享三个核心模块。其他模块根据游戏实际需要在 `js/main.js` 的 require 块中按需追加，不使用的模块无需引入。

### 3. 快手环境加载（js/main.js 顶部）

**`main.js` 禁止修改，唯一例外是【占位绘制】部分**（`draw()` 函数体）可被游戏 WebGL 渲染逻辑替换或清空。require 块、resize 逻辑、主循环、时间源等均不得改动。

**所有 `require` 只能写在 `main.js` 里**，其他游戏文件（`game.js` / `render.js` 等）内禁止使用 `require`。

平台能力模块已预置，游戏文件按依赖顺序填入注释部分：

```js
if (typeof require === 'function') {
  require('./m3-init.js');
  require('../standard/asset-manager.js');    // 资源管理器
  require('../standard/kwai-event-bus.js');   // 事件总线
  require('../standard/subpackage-loader.js'); // 分包加载器
  require('../standard/cdn-loader.js');       // CDN 加载器
  require('./kwai-ad-config.js');
  require('../api/kwai-login.js');
  require('../api/kwai-ad.js');
  require('../api/kwai-share.js');
  // ↓ 其他平台能力模块按需引入（根据游戏功能选择）
  // require('../api/kwai-base.js');       // 系统信息 / 生命周期 / 触摸事件
  // require('../api/kwai-render.js');     // 画布 / 帧率控制 / 字体 / 图片预加载
  // require('../api/kwai-ui.js');         // Toast / Modal / Loading / 胶囊按钮布局
  // require('../api/kwai-network.js');    // HTTP 请求 / 下载 / 上传 / WebSocket
  // require('../api/kwai-storage.js');    // 本地数据缓存
  // require('../api/kwai-file.js');       // 文件系统
  // require('../api/kwai-media.js');      // 视频 / 音频 / 图片管理
  // require('../api/kwai-device.js');     // 传感器 / 键盘 / 网络状态 / 振动
  // require('../api/kwai-open.js');       // 用户信息 / 授权 / Feed 流直出
  // require('../api/kwai-record.js');     // 对局回放录制
  // require('../api/kwai-repost.js');     // 主动转发
  // require('../api/kwai-shortcut.js');   // 添加到桌面
  // require('../api/kwai-siderbar.js');   // 侧边栏
  // require('../api/kwai-commonuse.js');  // 设为常用
  // require('../api/kwai-official.js');   // 官方号 / CP 服务号
  // require('../api/kwai-game-community.js');  // 游戏圈
  // require('../api/kwai-subpackage.js');      // 分包加载
  // require('../api/kwai-data-analysis.js');   // 数据分析上报
  // ↓ 游戏文件（按依赖顺序填入，禁止在 game.js 等文件内再写 require）
  // require('./layout.js');
  // require('./game.js');
  // require('./render.js');
  // require('./input.js');
}
```

### 4. 平台能力调用规范

> **[强制] 能力库优先原则**
>
> 生成游戏代码时，凡涉及平台能力（网络、存储、渲染、设备、媒体、广告、登录、分享等），**必须优先使用 `./api/` 下已封装的能力模块**，禁止直接调用裸 `ks.*` API。
>
> **能力路由规则：**
> 1. **下表已覆盖** → 直接调用对应 `Kwai*` 全局对象的方法，无需手动判断 `typeof ks`，模块内部已处理快手/Web 双端兼容；并按需读取对应子 SKILL 文档了解详细用法。
> 2. **下表未覆盖，但快手平台有对应 API** → 参考子 SKILL 文档封装后调用，并加 `typeof ks === 'undefined'` 保护。
> 3. **快手平台无对应能力** → **不要强行实现或降级**，在代码注释中明确提示：`// ⚠️ 快手小游戏平台暂不支持「XX能力」，建议改用「替代方案」`，并告知用户更换实现思路。

#### 常用能力速查示例

**登录**（游戏主循环启动后调用一次）：

```js
KwaiLogin.init({
  onSuccess: function (openId) { /* 登录完成，启动游戏 */ },
  onFail:    function ()        { /* 失败降级，以游客态继续 */ },
});
```

**广告**：

```js
// 激励广告（复活 / 双倍奖励）
KwaiAd.showRewarded(
  function () { /* 用户看完 → 发放奖励 */ },
  function () { /* 用户中途关闭 → 不发放 */ }
);

// 插屏广告（关卡结束 / 进入下一关前调用；内置频控，未满足时直接执行回调）
KwaiAd.showInterstitial(function () { loadNextLevel(); });

// Banner（进入菜单 / 结算页显示；onResize 可选，用于更新布局底部留白）
KwaiAd.showBanner(function (bannerHeight) {
  M3.Layout.bottomPadding = bannerHeight;
});
KwaiAd.hideBanner();          // 进入关卡时隐藏
KwaiAd.onBannerUserClose();   // 用户手动关闭时调用
```

**WebSocket 长连接**（实时对战 / 聊天 / 推送）：

```js
var task = KwaiNetwork.connectSocket({
  url:       'wss://api.example.com/realtime',
  protocols: ['game-v1'],             // 可选子协议
  header:    { Authorization: '…' },  // 快手有效；Web 端浏览器不支持自定义 WS header
  onOpen:    function () {
    task.send({ data: JSON.stringify({ type: 'login', openId: '…' }) });
  },
  onMessage: function (res) {
    var msg = JSON.parse(res.data);  // res.data: string | ArrayBuffer
    handleServerMessage(msg);
  },
  onClose:   function (res) {
    if (res.code !== 1000) scheduleReconnect();  // 非正常关闭触发重连
  },
  onError:   function (res) { console.warn('[WS]', res.errMsg); },
});

// 发送消息（必须在 onOpen 触发后调用）
task.send({ data: JSON.stringify({ type: 'ping' }) });

// 关闭连接
task.close({ code: 1000, reason: 'game over' });
```

> ⚠️ 快手环境：`url` 域名须加入后台「socket 合法域名」白名单（与 request 独立）。
> ⚠️ 快手环境：最多同时 5 个 WebSocket 连接，用完务必 `close()` 释放。
> ⚠️ Web 环境：浏览器不支持自定义 WebSocket `header`，`header` 参数自动忽略。

**分享**：

```js
KwaiShare.share({
  title:      '我在「<GAME_NAME>」得了 9999 分，来挑战！',
  imageUrl:   '',                        // 可选
  extraQuery: { score: 9999, level: 5 }, // 可选
});
var query = KwaiShare.getLaunchQuery(); // 获取分享链接进入时的参数
```

#### 能力路由总表

> ⚠️ 若所需能力**不在下表中**，说明快手小游戏平台尚未开放该能力，请在代码注释中说明并建议用户改用替代方案，**不要自行模拟或 Polyfill**。

| 需求关键词 | 模块 / API | 全局对象 | 子 SKILL | 兼容性 |
|-----------|-----------|---------|---------|-------|
| 画布 / 渲染 / 帧率 / 图片 / 字体 | `api/kwai-render.js` | `KwaiRender` `canvas` `Image` `HTMLImageElement` `HTMLCanvasElement` | [render/SKILL.md](render/SKILL.md) | ✅ `<canvas>` / `new Image()` / `FontFace` |
| 网络请求 / 下载 / 上传 / WebSocket | `api/kwai-network.js` | `KwaiNetwork` `fetch` `XMLHttpRequest` `WebSocket` `Headers` `Response` | [network/SKILL.md](network/SKILL.md) | ✅ `fetch` / 原生 `WebSocket` |
| 本地存储 / 数据缓存 / 存档 | `api/kwai-storage.js` | `KwaiStorage` `localStorage` | [storage/SKILL.md](storage/SKILL.md) | ✅ `localStorage` |
| 视频 / 音频 / 媒体 | `api/kwai-media.js` | `KwaiMedia` `Audio` `HTMLAudioElement` `HTMLMediaElement` | [media/SKILL.md](media/SKILL.md) | ✅ 双端完整适配 |
| 振动 / 传感器 / 网络状态 / 键盘 | `api/kwai-device.js` | `KwaiDevice` | [device/SKILL.md](device/SKILL.md) | ✅ 振动 / 网络状态 / 传感器；键盘静默 |
| 屏幕尺寸 / DPR / 分辨率 | `window.innerWidth/Height` `devicePixelRatio` `screen` | `innerWidth` `innerHeight` `devicePixelRatio` `screen` | — | ✅ 两端可直接读，与 `M3.Layout.w/h` 来源相同 |
| touch / 鼠标事件 | `canvas.addEventListener` | `EventTarget` `CustomEvent` `TouchEvent` | — | ✅ 两端均可；**必须 `{ passive: false }`** |
| DOM 操作 / canvas 节点 | `window.document` | `document` `HTMLElement` `Element` `Node` | — | ⚠️ 仅支持 `canvas` / `img`；禁用 `innerHTML` |
| UA / 在线状态 / 语言 / 平台 / 地理位置 | `navigator.*` | `navigator` | — | ✅ 两端可读；`geolocation` 在快手为 Stub（noop），勿依赖；UA 格式两端不同 |
| 定时器 / 动画帧 | `setTimeout` / `requestAnimationFrame` | `setTimeout` `setInterval` `clearTimeout` `clearInterval` `requestAnimationFrame` `cancelAnimationFrame` | — | ✅ 两端均可，游戏主循环推荐 `requestAnimationFrame` |
| 生命周期 / 系统信息 / 冷启动参数 | `api/kwai-base.js` | `KwaiBase` | [base/SKILL.md](base/SKILL.md) | ⚠️ 非快手返回空值 |
| Toast / Modal / Loading / 弹窗 | `api/kwai-ui.js` | `KwaiUI` | [interface/SKILL.md](interface/SKILL.md) | ⚠️ 非快手静默 |
| 文件系统 / 读写文件 / 保存文件 | `api/kwai-file.js` | `KwaiFile` | [file/SKILL.md](file/SKILL.md) | ⚠️ `saveFile` → 浏览器下载；读写仅快手 |
| 文件读取 | `new FileReader()` | `FileReader` | — | ⚠️ Stub，改用 `KwaiFile` |
| 页面跳转 / 刷新 | `location.href` / `.reload()` | `location` | — | ⚠️ Stub，快手无页面跳转，勿依赖 |
| 登录 / openId / 用户身份 | `api/kwai-login.js` | `KwaiLogin` | [user/SKILL.md](user/SKILL.md) | ⚠️ 非快手跳过，游客态继续 |
| 广告 / 激励 / 插屏 / Banner | `api/kwai-ad.js` | `KwaiAd` | [ad/SKILL.md](ad/SKILL.md) | ⚠️ 非快手跳过 |
| 分享 / 转发链接 / 邀请 | `api/kwai-share.js` | `KwaiShare` | [share/SKILL.md](share/SKILL.md) | ⚠️ 非快手跳过 |
| 用户信息 / 授权 / Feed 流 | `api/kwai-open.js` | `KwaiOpen` | [open/SKILL.md](open/SKILL.md) | ⚠️ 非快手 `onFail` |
| 录制 / 对局回放 / 录屏 | `api/kwai-record.js` | `KwaiRecord` | [record/SKILL.md](record/SKILL.md) | ⚠️ 非快手静默 |
| 转发好友 | `api/kwai-repost.js` | `KwaiRepost` | [repost/SKILL.md](repost/SKILL.md) | ⚠️ 非快手 `onFail` |
| 桌面快捷方式 | `api/kwai-shortcut.js` | `KwaiShortcut` | [shortcut/SKILL.md](shortcut/SKILL.md) | ⚠️ 非快手 `onFail` |
| 侧边栏 | `api/kwai-siderbar.js` | `KwaiSiderBar` | [sider-bar/SKILL.md](sider-bar/SKILL.md) | ⚠️ 非快手 `onFail` |
| 设为常用 | `api/kwai-commonuse.js` | `KwaiCommonUse` | [commonuse/SKILL.md](commonuse/SKILL.md) | ⚠️ 非快手 `onFail` |
| 官方号 / CP 服务号 | `api/kwai-official.js` | `KwaiOfficial` | [official/SKILL.md](official/SKILL.md) | ⚠️ 非快手 `onFail` |
| 游戏圈 | `api/kwai-game-community.js` | `KwaiGameCommunity` | [game-community/SKILL.md](game-community/SKILL.md) | ⚠️ 非快手 `onFail` |
| 分包加载 / 按需子包 | `standard/subpackage-loader.js` | `M3.SubpackageLoader` | — | ✅ H5 静默跳过 |
| CDN 资源加载 / CDN 图片缓存 | `standard/cdn-loader.js` | `M3.CdnLoader` | — | ✅ H5 直接使用 URL |
| 图片资源管理 / 资源引用计数 | `standard/asset-manager.js` | `M3.AssetManager` | — | ✅ 双端 |
| 分包加载（底层 API）| `api/kwai-subpackage.js` | `KwaiSubpackage` | [subpackage/SKILL.md](subpackage/SKILL.md) | ⚠️ 非快手 `onFail` |
| 数据分析 / 上报 / 埋点 | `api/kwai-data-analysis.js` | `KwaiDataAnalysis` | [data-analysis/SKILL.md](data-analysis/SKILL.md) | ⚠️ 非快手 `onFail` |

---

### 5. 屏幕适配 + 安全区

`resize()` 已在模版 `js/main.js` 内置，**不需要重复实现**。

`M3.Layout` 由 `js/m3-init.js` 初始化，字段如下：

| 字段 | 说明 |
|---|---|
| `safeTop` | 顶部安全区高度（逻辑像素） |
| `usableH` | 可用高度 = 屏幕总高 − safeTop |
| `w` / `h` | 屏幕逻辑宽 / 高 |

**游戏内容 Y 起点必须从 `M3.Layout.safeTop` 开始，禁止从 `0` 开始绘制。**

### 6. 统一时间源

统一使用 `M3._now()`，禁止直接调用 `performance.now()`。

### 7. 触摸输入

```js
canvas.addEventListener('touchstart', onStart, { passive: false });
canvas.addEventListener('touchmove',  onMove,  { passive: false });
canvas.addEventListener('touchend',   onEnd,   { passive: false });
canvas.addEventListener('mousedown',  onStart);
canvas.addEventListener('mouseup',    onEnd);

function scalePos(cx, cy) {
  var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  return { x: (cx - r.left) * (canvas.width / dpr) / r.width,
           y: (cy - r.top)  * (canvas.height / dpr) / r.height };
}
```

### ⁠❌ 禁止使用 HTML/CSS/Canvas 2D 实现 UI

所有视觉内容必须通过 **WebGL API** 绘制，以下用法严禁出现：

| 禁止类型 | 禁止示例 | 正确替代 |
|---|---|---|
| HTML 标签 | `div` / `span` / `button` / `input` / `p` / `canvas`（新建） | WebGL shader / `gl.drawArrays` |
| CSS 样式 | `element.style.xxx` / `className` / `<style>` 标签 | WebGL uniform / attribute |
| DOM 插入 | `innerHTML` / `createElement` / `appendChild` | WebGL 层叠绘制 |
| Canvas 2D API | `getContext('2d')` / `ctx.fillRect` / `ctx.fillText` / `ctx.drawImage` | `getContext('webgl2'/'webgl')` + shader |
| 外部字体/图标库 | `<link rel="stylesheet">` / CDN 字体 | WebGL 纹理贴图 / `KwaiRender.loadImage` |

> ✅ 安全区：`window.canvas`（全局唯一 Canvas 元素）、`window.document`（仅可访问 `canvas`/`img` 节点）可读取，其余 DOM 操作不可用。

---

### 8. JS 编码规范

#### 8.1 模块封装（IIFE）

每个游戏文件用 IIFE 包裹，挂到 `window.M3`：

```js
(function () {
  var M3 = window.M3 = window.M3 || {};

  var _score = 0;  // 私有变量

  M3.Game = {
    getScore: function () { return _score; },
    addScore: function (n) { _score += n; },
    start:    function () { /* ... */ },
  };
})();
```

- ES5，无自动转译
- 禁止在 IIFE 外声明变量；禁止外部依赖（npm / CDN / 字体）

#### 8.2 状态暴露（getter 优先）

可变状态通过 getter 暴露，禁止直接暴露原始变量：

```js
// ✅ getter
M3.Game = { getScore: function () { return _score; } };

// ❌ 直接暴露——其他模块拿到的是调用时的快照，不是实时值
M3.Game.score = _score;
```

#### 8.3 命名空间（M3.xxx）

| 挂载路径 | 用途 |
|---------|------|
| `M3.Layout` | 布局参数（`safeTop` / `w` / `h` / 业务自定义字段） |
| `M3.Game` | 玩法状态与逻辑 |
| `M3.Board` | 棋盘 / 世界数据 |
| `M3.Render` | 绘制方法 |
| `M3.Input` | 输入处理 |
| `M3.Config` | 多文件共享的游戏规则常量 |
| `M3.Levels` | 关卡数据 |

`M3` 由 `m3-init.js` 保证存在，禁止写 `M3 = M3 || {}` 重复防御。

#### 8.4 常量分层

- **仅本文件使用** → `var` 私有声明
- **多文件共享的布局值** → 挂到 `M3.Layout`
- **多文件共享的规则值** → 挂到 `M3.Config`

```js
var COLS = 7;              // 私有
M3.Layout.COLS = COLS;     // 需要跨文件时再挂出去
```

#### 8.5 自检清单（生成后必查）

```
□ 每个 js/ 文件均有 IIFE，无裸全局变量
□ 可变状态全部通过 getter 暴露
□ 命名空间挂到 M3.xxx，无重复防御写法
□ 私有常量用 var，共享常量挂到 M3.Layout / M3.Config
□ main.js require 块已同步新增文件，游戏文件内无 require
□ 无外部依赖（npm / CDN）
□ 未使用 HTML 标签 / CSS / DOM 插入实现 UI
□ 所有绘制通过 gl.* WebGL API 实现，canvas.getContext 使用 'webgl2' 或 'webgl'，严禁 '2d'
□ 分包加载通过 M3.SubpackageLoader，CDN 加载通过 M3.CdnLoader，禁止直接调裸 KwaiSubpackage
```

---

## 常见兼容问题

| 问题 | 解决 |
|---|---|
| 白屏 | `game.js` require 路径与 `js/` 文件名对齐 |
| `document is not defined` | 改用 `window.document` 或 `window.canvas` |
| `performance.now` 报错 | 改用 `M3._now()` |
| 触摸无响应 | 事件加 `{ passive: false }` |
| iOS 模糊 | 检查 `resize()` 是否设置 canvas 物理尺寸 |
