---
name: kuaishou-minigame-aigc
description: 快手 AIGC 小游戏全流程开发 skill。当用户说「快手小游戏」「开始做小游戏」「aigc 小游戏」「小游戏工作流」「做一个 xx 小游戏」「新建小游戏」「西瓜斗地主」「消消乐小游戏」「ksmg upload 假成功」「ksmg 上传没生效」「ksmg 登录过期」「开发者后台版本没更新」「上传后页面没变化」「ksmg preview 图片保存失败」「预览二维码没生成」「-o 输出目录」「预览成功但没图」「扫码没路径」「清缓存黑屏」「首屏黑屏」「视频不播」「主包视频没画面」「h265」「hevc」「SUBPKG-FAIL」「分包加载失败」「图片加载慢」「图加载慢旁白播完」「CDN 覆盖了没生效」「改完 CDN 没变化」「一年缓存」「pngquant」等需要从 0 到 1 孵化并落地一款快手小游戏，或 ksmg 上传/预览后需要排障时触发。覆盖：创意收集 → 结构化 → 玩法拆解 → UI 设计 → 素材清单 → 脚手架 → 代码生成 → 素材生成 → OpenAPI 接入 → 自测 → 云服务（CDN/埋点/联网/云存档）→ 构建 → 发布 → 数据回收 的 15+ 阶段闭环。参考仓库：game-aigc-workflow（工作流） + game-aigc-product-hub（游戏库）。
version: 2026.08.20
---

# 快手 AIGC 小游戏工作流 Skill

<!-- AIGC-MINIGAME-SKILL-DEPENDENCY -->
> ⚠️ **SKILL DEPENDENCY · 强制前置**
>
> 本 skill 属于 AIGC 小游戏（快手小游戏）生产流程的一部分，**必须先加载 `agw-work-mode`**。
>
> - 若本对话尚未加载 `agw-work-mode` 的 `<skill_content>`，先调用 `use_skill("agw-work-mode")`
> - 若本次任务涉及 build / upload / commit 等敏感动作，**必须先走 `aigc-minigame-orchestrator` subagent**
> - 详见云端权威版本：`git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` `product-optimization/` 目录
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->


面向 AIGC 小游戏团队的全流程开发方法论。基于快手内部两个仓库沉淀：

- 工作流仓库：`https://git.corp.kuaishou.com/kwai-game/game-aigc/game-aigc-workflow`
- 游戏库仓库：`https://git.corp.kuaishou.com/kwai-game/game-aigc/game-aigc-product-hub`

---

## 一、核心理念

**一款游戏 = 一个目录 + 一份 workflow-run.yml 状态机 + 一系列阶段产出物**。

每个游戏在 `game-aigc-product-hub/games/<game-name>/` 下独立目录，通过 `workflow-run.yml` 记录当前所处阶段和产出状态。AI 每次接手先读 `workflow-run.yml`，从断点继续。

---

## 二、目录约定

```
game-aigc-product-hub/
└── games/
    └── <game-name>/               # kebab-case，例如 watermelon-doudizhu
        ├── workflow-run.yml       # 流程状态机
        ├── docs/                  # 各阶段产出文档
        │   ├── idea-raw.md
        │   ├── idea-search.md
        │   ├── idea.md
        │   ├── gameplay.md
        │   ├── ui-design.md
        │   ├── asset-list.md
        │   ├── open-api-report.md
        │   ├── self-test-report.md
        │   ├── cdn-report.md
        │   ├── analytics-report.md
        │   ├── multiplayer-report.md
        │   ├── cloud-save-report.md
        │   ├── build-report.md
        │   ├── publish-report.md
        │   └── data-collect-report.md
        └── package/               # 游戏代码 + 素材
```

**命名铁律**：
- 目录名只允许 **小写字母 / 数字 / 连字符**，禁止空格、中文、下划线
- 中文名 → AI 自动转 kebab-case 英文（如「西瓜斗地主」→ `watermelon-doudizhu`）
- 一个游戏一条独立 Git 分支：`game/<game-name>`，完成后合并回 master

---

## 三、15 阶段工作流

| # | Stage | 产出物 | 说明 |
|---|-------|--------|------|
| 1 | `idea-collect` | docs/idea-raw.md | 收集用户原始创意（可含参考图/关键词）|
| 2 | `idea-search` | docs/idea-search.md | 双轨检索：GitHub 开源仓库 + 内部游戏库 |
| 3 | `idea-structure` | docs/idea.md | 结构化：核心玩法一句话/差异化/目标用户 |
| 4 | `gameplay-breakdown` | docs/gameplay.md | 玩法拆解：规则/循环/关卡/数值 |
| 5 | `ui-design` | docs/ui-design.md | 界面设计：主场景/HUD/结算/弹窗 |
| 6 | `asset-list` | docs/asset-list.md | 素材清单：图/音/字体，含 prompt |
| 7 | `scaffold` | 工程目录 | 初始化 package/，通常基于模板 |
| 8 | `codegen` | package/ | AI 生成/改造代码 |
| 9 | `assetgen` | package/ | 调用可灵/DesignAI 生图，落到 assets/ |
| 10 | `open-api` | docs/open-api-report.md | 接入快手 OpenAPI（登录/支付/分享）|
| 11 | `self-test` | docs/self-test-report.md | 自测：构建/首屏/兼容/性能 |
| 12 | `cloud-services` | — | 可选：CDN / analytics / multiplayer / cloud-save |
| 13 | `build` | docs/build-report.md | 打包产出可上传的产物 |
| 14 | `publish` | docs/publish-report.md | 上传体验版/正式版（quickapp 开放平台）|
| 15 | `data-collect` | docs/data-collect-report.md | 回收 DAU/时长/留存/付费 |

每个阶段完成 → 提交产出物到 `game/<game-name>` 分支 → 等用户「确认」后推进 `stage` 字段。

---

## 四、workflow-run.yml 模板

```yaml
game_name: ""
created_at: ""
updated_at: ""
stage: idea-collect       # 当前阶段
nodes:
  idea-collect:      { state: pending, confirm_pending: false, output: docs/idea-raw.md }
  idea-search:       { state: pending, confirm_pending: false, output: docs/idea-search.md }
  idea-structure:    { state: pending, confirm_pending: false, output: docs/idea.md }
  gameplay-breakdown:{ state: pending, confirm_pending: false, output: docs/gameplay.md }
  ui-design:         { state: pending, confirm_pending: false, output: docs/ui-design.md }
  asset-list:        { state: pending, confirm_pending: false, output: docs/asset-list.md }
  scaffold:          { state: pending, confirm_pending: false, output: "" }
  codegen:           { state: pending, confirm_pending: false, output: package/ }
  assetgen:          { state: pending, confirm_pending: false, output: package/ }
  open-api:          { state: pending, confirm_pending: false, output: docs/open-api-report.md }
  self-test:         { state: pending, confirm_pending: false, output: docs/self-test-report.md }
  cloud-services:    { state: pending, confirm_pending: false, output: "" }
  cdn:               { state: skipped, confirm_pending: false, output: docs/cdn-report.md }
  analytics:         { state: skipped, confirm_pending: false, output: docs/analytics-report.md }
  multiplayer:       { state: skipped, confirm_pending: false, output: docs/multiplayer-report.md }
  cloud_save:        { state: skipped, confirm_pending: false, output: docs/cloud-save-report.md }
  build:             { state: pending, confirm_pending: false, output: docs/build-report.md }
  publish:           { state: pending, confirm_pending: false, output: docs/publish-report.md }
  data-collect:      { state: pending, confirm_pending: false, output: docs/data-collect-report.md }
optional_modules:
  cdn: false
  analytics: false
  multiplayer: false
  cloud_save: false
```

---

## 五、AI 执行编排（每次接手都走这套）

```
Step 0 — 选游戏
  扫描 game-aigc-product-hub/games/ 下含 workflow-run.yml 的目录，
  分组展示「进行中 / 已完成 / + 新建」。
  用户选 → 定位游戏目录；用户新建 → 询问英文名 kebab-case，git checkout -b game/<name>，
  copy 模板 workflow-run.yml。

Step 1 — 读状态
  读取 workflow-run.yml，取 stage 字段。
  若当前节点 confirm_pending=true，展示上一阶段摘要，等待「确认 / 修改」。

Step 2 — 执行阶段
  按下表路由到对应子任务，产出物落到 docs/ 或 package/。

Step 3 — 更新状态
  标记 nodes.<stage>.state=completed、output=<产出路径>、confirm_pending=true。
  提交到分支：git add . && git commit -m "chore(<stage>): ..." && git push。
  展示产出摘要，提示用户「回复『确认』进入下一阶段」。

Step 4 — 推进阶段
  收到「确认」→ 将 stage 推进到下一节点 → 回到 Step 1。

完成态（stage=done）
  询问用户是否合并到 master；确认 → merge & push & 删除分支。
```

---

## 六、可选云服务（stage=cloud-services 时询问）

| 模块 | key | 何时选 |
|------|-----|--------|
| CDN & 按需下载 | `cdn` | 首包 > 4MB 时用于分包/按需 |
| 数据上报 | `analytics` | 需要看 DAU/漏斗/事件转化 |
| 联网对战 | `multiplayer` | 多人实时对战/房间玩法 |
| 云存档 & 排行榜 | `cloud_save` | 需要跨端数据 + 竞争社交 |

未选中保持 `skipped`，可后续再补。

---

## 七、快手小游戏运行时约定

- 宿主：快手 App / 极速版 App / 快应用容器
- 命名空间：`ks.*`（例如 `ks.login({ success })`、`ks.requestGamePayment(...)`）
- 入口配置：`game.json`（含分包 / 场景值 / 屏幕方向 / OpenAPI 权限）
- 引擎选择：Cocos Creator（3.x）/ Phaser / LayaAir / 纯 Canvas 都可，只要打包为纯 HTML5
- 上传：快应用开放平台 https://open.kuaishou.com/miniGameDocs

**开发工具**：快手小游戏开发者工具（含真机预览、构建、上传体验版）。

### 7.1 OpenAPI 能力速查（从 6 款 AIGC 小游戏实战沉淀）

> 来源：我的温柔未婚妻 / 老铁找茬王 / 老铁斗地主 / 贪吃蛇大作战 / 唐僧与悟空 / 美人字画

| 分类 | 能力名称 | 使用频率 |
|------|----------|----------|
| **画布与渲染** | `ks.createCanvas` / `ks.createImage` / `ks.setPreferredFramesPerSecond` | ★★★ 高频（纯 Canvas 项目必用） |
| **系统信息** | `ks.getSystemInfoSync` / `ks.getLaunchOptionsSync` / `ks.getMenuButtonBoundingClientRect` / `ks.updateAppMenu` / `ks.exitMiniProgram` / `ks.isLaunchFromShortcut` / `ks.env.USER_DATA_PATH` | ★★★ 高频 |
| **本地存储** | `ks.getStorageSync` / `ks.setStorageSync` / `ks.removeStorageSync` / `ks.clearStorageSync` / `ks.getStorageInfoSync` | ★★★ 高频 |
| **登录与用户** | `ks.login` / `ks.checkSession` / `ks.getUserInfo` / `ks.authorize` / `ks.getSetting` / `ks.openUserProfile` / `ks.checkFollowState` | ★★☆ 中频（剧改游/斗地主必用） |
| **分享与社交** | `ks.shareAppMessage` / `ks.onShareAppMessage` / `ks.shareImageToGameClub` / `ks.jumpToGameClub` / `ks.addShortcut` / `ks.checkShortcut` / `ks.addCommonUse` / `ks.checkCommonUse` / `ks.showShortcutMenu` | ★★☆ 中频（IAA 变现链路必用） |
| **广告与变现** | `ks.createRewardedVideoAd` / `ks.createBannerAd` / `ks.createInterstitialAd` / `ks.requestGamePayment` | ★★★ 高频（IAA 核心收入） |
| **音视频与媒体** | `ks.createInnerAudioContext` / `ks.createVideo` / `ks.getGameRecorder` / `ks.chooseVideoAndPublish` / `ks.loadFont` | ★★☆ 中频 |
| **网络与文件** | `ks.request` / `ks.connectSocket` / `ks.uploadFile` / `ks.downloadFile` / `ks.getFileSystemManager` / `ks.loadSubpackage` | ★☆☆ 低频（联网对战/云存档场景） |
| **UI 交互** | `ks.showToast` / `ks.showModal` / `ks.showActionSheet` / `ks.showLoading` / `ks.showKeyboard` / `ks.hideKeyboard` / `ks.navigateToScene` | ★★☆ 中频 |
| **触摸与生命周期** | `ks.onTouchStart` / `ks.onTouchMove` / `ks.onTouchEnd` / `ks.onTouchCancel` / `ks.onShow` / `ks.onHide` / `ks.onError` / `ks.onUnhandledRejection` / `ks.onMemoryWarning` / `ks.onNetworkStatusChange` / `ks.onFeedStatusChange` | ★★★ 高频（纯 Canvas 项目必用触摸） |
| **传感器与震动** | `ks.vibrateShort` / `ks.vibrateLong` / `ks.startAccelerometer` / `ks.onAccelerometerChange` / `ks.startCompass` / `ks.onCompassChange` / `ks.startGyroscope` / `ks.onDeviceMotionChange` | ★☆☆ 低频（特定玩法） |
| **数据上报** | `ks.reportAnalytics` / `ks.reportScene` | ★★☆ 中频（埋点必需） |

**扫描方法提醒**：扫描项目 `ks.*` API 时，务必排除 `node_modules/`、TypeScript 编译器代码（会产生 `ks.deferralParent`/`ks.resolvedType` 等假阳性）和 `.git/objects`。只扫描业务代码目录（如 `js/`、`assets/Script/`、`game.js`、`ks-adapter.js`）。

---

## 九、Splash 素材与合规信息迭代铁律（2026.08.11 沉淀）

### 9.1 封面改字：优先 Image2 重生成，禁止默认本地叠字

当用户要求基于现有登录页/封面换标题时：

1. **不要直接在原图上用 Pillow、Canvas 或系统字体覆盖旧标题**。这种方案容易出现字体廉价、笔画风格不统一、旧字残影、人物与标题互相穿插等问题；本次用户明确反馈“图丑死了”。
2. 使用 Image2 `task=edit`，以原始无文字/原始参考图作为 `references`，要求模型：
   - 保持人物身份、姿态、场景构图、光影和道具不变；
   - 只替换标题文字；
   - 明确指定标题层级、位置、金属渐变、描边、阴影和戏剧海报字体风格；
   - 禁止添加英文、改变人物或重构背景。
3. 生成后必须读图验收，重点检查中文标题是否正确、是否有错字/乱码、人物和构图是否被改动；不合格就调整 prompt 重生成，不要退回硬贴方案。
4. 将原图备份为 `*.bak.png`，生成结果覆盖活跃素材文件，避免把临时生成图接错运行时路径。

推荐请求形式：

```json
{
  "task": "edit",
  "prompt": "Keep the characters, composition, lighting and props exactly unchanged. Replace only the Chinese title with ...",
  "references": ["/absolute/path/to/original.png"],
  "aspectRatio": "9:16",
  "resolution": "1K",
  "quality": "high"
}
```

### 9.2 Splash 底部信息：隐私链接不是唯一合规文案

首页按钮下方的合规信息应同时保留：

- `点击按钮代表您已同意《隐私政策》`；
- `著作权人：北京慕远科技有限公司`；
- `《隐私政策》` 文字可点击打开详情浮层；
- 浮层可通过“我知道了”或卡片外区域关闭。

不要把“仅保留隐私政策”理解成删除同意提示和著作权人；用户后来明确要求这两项必须展示。底部文字需要按屏幕高度预留安全区，避免被系统手势区或按钮遮挡。

### 9.3 授权前置验收

若需求是“点击首页登录/解锁按钮时授权”：

- `wx/ks.authorize` 必须从按钮点击链路触发，而不是进入第一帧视频后异步触发；
- 只有 `getUserInfo` 成功拿到用户信息后才切换到第一帧/对局；
- 用户取消或拒绝时保持 Splash，不写入伪造用户信息，toast 使用用户指定文案（如 `需要完成登录喔～`）；
- 下一次点击必须重新发起授权；
- 授权中屏蔽重复点击。

### 12.1 入口依赖闭包与白名单审计（2026.08.12 沉淀）

纯 Canvas 小游戏出现“无法访问 / 点击重试”时，不能只检查主业务文件是否存在，必须从入口文件递归核对依赖闭包：

1. 读取 `game.js`，提取所有相对路径 `require("./...")`；
2. 对每个依赖逐一确认源工程存在、且 `dist/` 中存在；
3. 对未进入 `dist/` 的入口依赖，补进 `packing.whitelist.json` 后重新执行 `preview.sh`；
4. 特别注意根目录依赖（如 `events.js`、`wxhelper.js`）与 `js/**/*.js` 规则不是一回事，不能假设 glob 会覆盖它们；
5. 重新打包后再次执行“入口 require 闭包检查”，不能只看打包命令退出码。

推荐检查命令：

```bash
# 从 game.js 的 require 清单反查 dist
for f in kwaiadapter.js events.js wxhelper.js \\
  js/ks-adapter.js js/registry.js js/story.js js/icons.js \\
  js/subtitles.js js/achievements.js js/main-v43.js; do
  test -f "dist/$f" && echo "OK $f" || echo "MISSING $f"
done
```

### 12.2 `preview.sh` 清空 dist 后的配置保留（2026.08.12 沉淀）

`preview.sh` 会先删除并重建 `dist/`。若上传 CLI 依赖 `dist/project.config.json` 读取 AppID，必须在打包后确认配置文件仍存在；否则可能出现 `Invalid appId`，或 CLI 退回错误项目配置。

```bash
bash scripts/preview.sh
cp project.config.json dist/project.config.json
 grep -n '"appid"' dist/project.config.json
```

不要只手动把文件复制到一次 `dist/` 后就认为永久生效；下一次运行 `preview.sh` 会再次清空它。更稳妥的做法是把上传前的配置复制和入口依赖审计写入固定打包脚本，或让打包白名单明确包含该配置文件（同时确认平台是否允许该文件进入包体）。

### 12.3 上传成功必须分层验证（2026.08.12 补充）

“新版本已上传”只能证明 CLI 完成了本地打包和请求流程，不能证明用户扫码拿到的是正确包。上传前后至少验证三层：

- **包内容层**：`dist/game.js` 指向当前活代码，所有 `require` 依赖齐全，BGM/新增功能关键字符串命中；
- **平台版本层**：开放平台版本管理页出现目标版本号；
- **运行时层**：用真机/开发者工具扫码验证首屏能进入，不能用 CLI 输出替代运行验证。

特别是连续修复“打不开”时，必须优先收集开发者工具 Console 的第一条异常；不要在没有错误堆栈时反复 bump 版本或重复上传。

---

## 十三、参考资料

- 完整 skill 集合（19 个子 skill）：`game-aigc-workflow/skills/agw-*`
- 每个子 skill 的 SKILL.md 有该阶段的详细 prompt / 校验规则 / 产出模板
- Hub 参考：`game-aigc-product-hub/games/demo`
- 官方文档：https://open.kuaishou.com/miniGameDocs

### 版本号与工程目录校验（本次实测）

- 执行上传前必须 `cd` 到包含 `game.json` 的工程根目录；在 `~` 目录直接执行 `ksmg upload .` 会导致 `_readGameConfig()` 读到 `null` 并报 `Cannot set properties of null (setting 'engine')`。
- 线上版本号以 CLI 返回值为准；若提示“版本号必须大于线上最新版本号 X”，必须递增到高于 X 的版本再传，不能固守用户最初指定的版本号。
- 本次实测可用命令格式：`cd <project-root> && ksmg upload . -i <appid> -v <version> -c "<changelog>"`。

---

## 十一、快速触发词

- 「封面换标题」/「首页背景图重生成」/「image2 重生成」/「不要叠字」
- 「底部信息栏」/「著作权人」/「点击按钮代表您已同意」/「隐私政策浮层」
- 「授权前置」/「登录按钮授权」/「拒绝授权 toast」
- 「上传新版本」/「版本号必须大于线上最新版本」/「ksmg upload 报错」

看到这些词，AI 应主动调本 skill，进入 Step 0 选游戏流程。

---

## 🚨 十、铁律：预览二维码的交付形态（血泪教训 v0.1.0 沉淀）

### 已犯错误
每次改完代码或跑完 `ksmg upload` 后，AI 只在对话里回复"已上传"，或只用 `read_file` 内嵌一张 QR 小图，
**用户根本没法扫** —— 手机对着显示器里 IDE 对话框中的小图，对焦困难、位置随滚动飘走。
用户已明确要求"每次改完代码就默认给二维码扫，不要等催"。

### 正确的 QR 交付三连（代码有可扫码变更后 100% 必做）

```bash
# 1. 生成二维码 PNG
cd <project> && ksmg preview ./package -q -o ./tmp

# 2. ⭐ 关键一步：用系统默认应用打开图片（Preview.app 全屏，手机稳稳扫）
open ./tmp/preview-*.png       # macOS
# xdg-open ./tmp/preview-*.png # Linux
# start ./tmp/preview-*.png    # Windows

# 3. 在对话里 read_file 内嵌一份 QR PNG 作副本（不能替代 #2）
```

### 何时必须出 QR（100%）
- 任何 `js/*.js` 或 `assets/**` 文件被修改
- `BUILD_VER` 被 bump
- 跑过 `ksmg upload`（既然上传了，用户 100% 想扫码验收）

### 何时不需要
- 只改 README/docs/.gitignore 等非运行时文件
- 仅做代码分析/调研，没改代码

### 反思根因
- 错误认知："在 IDE 对话里贴图 = 用户能用"
- 正确认知："**QR 必须在物理屏幕上足够大且稳定，才能被手机扫**"
- 教训：**交付物的"使用形态"决定交付方式**，不能"给了就完事"

### `ksmg preview` 参数速查
```
ksmg preview <project-path> [options]
Options:
  -q, --qr-code             生成二维码（打印到终端 + 保存 PNG）
  -o, --output <path>       输出目录（配合 -q）—— ⚠ 是目录！不是文件名！
```
生成路径：`<output-dir>/preview-<timestamp>.png`（时间戳由 CLI 自己决定，无法自定义文件名）

### 🩸 血泪子铁律 v2026.08.20：`-o` 必须传"目录"，不是"文件名"

**已犯错误（提艾默 v1.0.24 现场）**：
用了 `ksmg preview . -q -o /tmp/tb-v1024-qr.png`，CLI 打印 `预览图片保存失败`，
但 exit code = 0，我没盯这行日志，还告诉用户"图片已生成"，用户找不到路径来打脸。

**根因**：`-o` 参数被 ksmg 当成"要写入的目录"来 `mkdir` + 写文件，
传成 `xxx.png` 时 CLI 试图把 `xxx.png` 当目录写入，失败，只保留终端 ASCII QR，
但 **CLI 不 exit 非 0**，AI 若不严格解析 stdout 就会"假成功"。

**症状信号（必须立即识别）**：
- 日志末尾出现 `预览图片保存失败`
- `ls -la <传入路径>` 找不到文件
- 只有终端 ASCII QR 输出，无 PNG 落地

**正确姿势**：
```bash
mkdir -p ~/Desktop/qr
cd <project> && ksmg preview . -q -o ~/Desktop/qr     # ← 目录，非文件
# 成功日志：预览成功，图片保存到 ~/Desktop/qr/preview-<ts>.png
open ~/Desktop/qr/preview-*.png                        # 打开预览让用户扫
```

**AI 交付前必做 3 项自检**（缺一条即视为交付失败）：
1. stdout 最后一行必须匹配 `预览成功，图片保存到 (.+\.png)`，从中提取绝对路径
2. `ls -la <该绝对路径>` 必须返回文件存在（size > 0）
3. 必须在回复里给出该**绝对路径**，并调 `open <path>` 打开 —— 不能只贴终端 ASCII

---

## 🚨 十一、铁律：`ksmg upload` 的"假成功"陷阱（血泪教训 v2026.08.10 沉淀）

### 已犯错误
AI 执行 `ksmg upload` 后，CLI 输出"新版本已上传，请前往开放平台提交审核"，AI 据此回复用户"发布成功"。
用户去 [开放平台版本管理页](https://open.kuaishou.com/platform/minigame/develop/version) 一看，**版本列表还是旧的**，根本没更新。
连续上传 v1.0.1 → v1.0.2 → v1.0.3 → v1.0.4 全部"成功"，页面全部没变化，用户四次质疑"还是没有啊"。

### 根因
**`ksmg upload` 在登录态过期时会"假成功"**：
- CLI 打包正常（`/Users/Shared/ksmg/tmp/kwai-game_<ts>.zip` 生成且内容正确）
- CLI 发起 HTTPS 请求到 `open.kuaishou.com`
- 服务端因 cookie 过期返回失败，但 CLI **不检查响应体**，只看 HTTP 200 就打印"新版本已上传"
- 实际上传并未落地，但 AI 和用户都被"新版本已上传"误导

### 正确的 `ksmg upload` 闭环（100% 必做）

```bash
# 1. 上传前先确认登录态有效（isLogin 不够，要确认最近一次 login 成功）
ksmg isLogin
# 若提示已登录但本次会话从未成功 login 过，强制重新登录

# 2. 执行上传
cd <project-root> && ksmg upload . -i <appid> -v <ver> -c "<log>"

# 3. ⭐ 关键一步：浏览器打开版本管理页确认真的上传成功
#    URL: https://open.kuaishou.com/platform/minigame/develop/version?appId=<appid>
#    必须看到新版本号出现在"开发版本"列表里，才算成功
#    ⚠️ 多游戏账号陷阱（2026-08-14 沉淀）：直接拼 ?appId=xxx URL 可能不直接进该 app 的版本管理，
#       而是显示账号下全部游戏列表，需手动点进目标游戏 → 版本管理。
#       版本管理页是「卡片式」展示当前开发版本（不是历史版本表格），只看一张卡：

# 4. 如果页面没更新 → 登录态已过期，执行重新登录
ksmg logout
ksmg login    # 用快手 APP 扫码，扫码后等待 60s 内返回成功
# ⚠️ login 可能 ETIMEDOUT 60s 超时，此时检查网络（curl -I https://open.kuaishou.com/）
#    确认网络通但 login 超时 → 重复 login 一次

# 5. 重新登录成功后，bump 版本号再 upload
ksmg upload . -i <appid> -v <ver+1> -c "<log>"

# 6. 再次浏览器确认版本列表更新
```

### 何时必须做浏览器验证（100%）
- **任何一次 `ksmg upload` 之后**，都不能只凭 CLI 输出"新版本已上传"就回复用户"发布成功"
- 必须用 `browser_agent` 打开 `https://open.kuaishou.com/platform/minigame/develop/version?appId=<appid>` 确认版本号真的出现在列表里
- 这是对抗"假成功"的唯一可靠手段

### 症状速查表

| 症状 | 可能原因 | 处理 |
|------|---------|------|
| CLI 说"新版本已上传"但页面没更新 | 登录态过期 | `ksmg logout` + `ksmg login` 后重传 |
| `ksmg login` 卡 60s 后 ETIMEDOUT | 网络问题或扫码超时 | `curl -I https://open.kuaishou.com/` 检查网络；重新 login |
| `版本号必须大于线上最新版本号` | 版本号没 bump | 版本号 +1 重传 |
| `当前线上最新版本号为：1.0.0 1.0.x` | 正常进度提示 | 不是错误，继续等待"新版本已上传" |

### 反思根因
- 错误认知："CLI 输出 success = 上传成功"
- 正确认知："**CLI 的 success 只代表 HTTP 请求发出去了，不代表服务端落库了**"
- 教训：**任何涉及外部系统的"上传/发布/部署"操作，都必须用独立信源验证结果**（浏览器看页面 / API 查状态），不能只信 CLI 的 stdout
- 这条教训对 `ksmg upload`、`frontend-cloud deploy`、`npm publish` 等所有"发布类"命令都成立

### `ksmg upload` 参数速查
```
ksmg upload <project-path> [options]
Options:
  -a, --app-id <id>          设置 app_id（必填，否则用 project.config.json 里的）
  -v, --version <ver>        版本号（格式 [major].[minor].[patch]，必填）
  -c, --changelog <log>      更新日志
  -i, --app-id <id>          设置 AppID（实测可用；也可使用 project.config.json 里的）
```

---

## 🚨 十二、铁律：主包 / CDN 资源三大命门（v2026.08.20 沉淀，来自未婚妻项目 v77.3-77.4 血泪）

这三条**跨项目通用**，任何 AIGC 小游戏（未婚妻/提艾默/找茬王/斗地主）打包/上传都适用。

### 12.1 主包内 mp4 必须 h264 严禁 h265/hevc

**症状**：清缓存后首屏黑屏、视频不播、部分安卓机（尤其低端）无画面。

**根因**：Kling / gpt-video / gpt-sora 等 AIGC 生视频**默认输出 h265/hevc**（省流量但兼容差）。主包内 mp4 走 `wx.createVideo` 读包内相对路径时，部分快手容器安卓硬解走的是 MediaCodec 老通路，**h265 无声无画**。CDN 走 downloadFile 落到 wxfile:// 反而没这问题（走的新解码器）。

**强制检查**：
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 <file>
# 输出 hevc / h265 → 必须转码；h264 → 通过
```

**转码模板**（主包内 mp4 唯一合规配方）：
```bash
ffmpeg -y -i input.mp4 \
  -c:v libx264 -crf 26 -preset slow \
  -profile:v main -level 3.1 -pix_fmt yuv420p \
  -vf "scale='min(720,iw)':'-2'" \
  -c:a aac -b:a 96k -movflags +faststart \
  output.mp4
```

**分离策略**：
- **CDN 视频** = x265 CRF 18（省流量，用户端 downloadFile 兼容）
- **主包内视频** = x264 CRF 26（保兼容，宁多 500KB 也不黑屏）

### 12.2 分包 root 目录必须有 .js 入口文件

**症状**：真机日志 `SUBPKG-FAIL ❌ 分包加载失败`，分包资源全走 CDN 兜底 → 图片加载爆慢。

**根因**：快手小游戏（同微信）分包机制要求 `wx.loadSubpackage` 命中 root 目录时至少有一个 .js 文件作为分包入口。纯图片/音频分包也不例外。

**修复**：
```
assets/frames/
  ├── index.js       ← 占位入口（必需，可以只是一行注释）
  ├── e2s1.jpg
  └── ...
```

`packing.whitelist.json` include：
```json
"assets/frames/**/*.jpg",
"assets/frames/index.js"
```

### 12.3 CDN 一年缓存陷阱 + AIGC 出图必压

**症状 A**：改完 CDN 图重传，真机加载还是旧的。
**症状 B**：AIGC 图 CDN 上一张 2 MB，旁白播完了图还没出来。

**根因 A**：快手 KCDN `Cache-Control: max-age=31536000`（**1 年缓存**）。同名覆盖对边缘节点无效，`?v=timestamp` cache-buster 也被缓存。
**根因 B**：Kling / gpt-image-2 出图默认 1024×1792 PNG-32 无损原图 2-3 MB，直接 kcdn-upload 塞 CDN 从没经过压缩流水线。

**强制压缩流水线**（所有 CDN 图上传前必跑）：
```bash
# PNG（保 alpha）
ffmpeg -y -i input.png -vf "scale='min(900,iw)':'-2'" /tmp/resized.png
pngquant --quality=60-82 --speed 3 --force --output output.png /tmp/resized.png

# JPG
ffmpeg -y -i input.jpg -vf "scale='min(900,iw)':'-2'" -q:v 3 output.jpg
```
2.1 MB → 500 KB 平均省 -78%。

**CDN 缓存唯一破解 · 文件名版本后缀**：
```
xxx.png → xxx.v2.png（下次改再 xxx.v3.png）
```
上传后全项目 grep-replace URL。

**交付前必跑审计**：
```bash
grep -rhoE 'https://[a-z0-9\-]+\.adkwai\.com/[^"]+\.(png|jpg)' content/ | sort -u > /tmp/urls.txt
while read u; do
  sz=$(curl -sI "$u" | awk 'tolower($1)=="content-length:"{print $2}' | tr -d '\r')
  echo "$sz $u"
done < /tmp/urls.txt | sort -rn | head -30
# 任何 >500 KB 必须走压缩流水线 + .v2 后缀重传
```

### 12.4 触发词（下次一定读这条）

- 「清缓存黑屏」「首屏黑屏」「视频不播」「主包视频没画面」→ 查 12.1（h265）
- 「SUBPKG-FAIL」「分包加载失败」「图片加载慢」→ 查 12.2（.js 入口）
- 「图加载慢 旁白都播完了」「CDN 覆盖了没生效」「改完 CDN 没变化」→ 查 12.3（压缩+.v2）
