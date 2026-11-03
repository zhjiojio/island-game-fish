# 「火眼来找茬」技术方案文档

> AppID：ks713539070148088972
> Team 任务：T12317015（联运游戏回测）
> 版本：v2.0.0 · 2026-09-30
> 关联：[PRD](./T12317015-prd.md) · [UI 主题包设计](../plans/2026-09-10-ui-theme-package-design.md) · [fillplace/dragmatch 重构](../plans/2026-09-22-fillplace-mode-and-dragmatch-refactor.md)

---

## 1. 技术架构总览

### 1.1 架构形态

快手小游戏（KRN 游戏 AppID 容器）+ WebGL 自研渲染引擎，Canvas 主循环驱动。

```
┌─────────────────────────────────────────────────────┐
│ game.js（入口）                                      │
│   └─ main.js：依赖顺序编排（11 段）                   │
├─────────────────────────────────────────────────────┤
│ ① m3-init 基础初始化                                 │
│ ② 标准库：kwai-event-bus / subpackage-loader        │
│ ③ 产品定制层：core/product.config.js（PRODUCT_CONFIG）│
│ ④ 平台 API 层：api/kwai-*.js（login/ad/share/file/…）│
│ ⑤ 渲染层：render/gl.js + shaders + texture + batch  │
│ ⑥ 核心层：core/config.js + scene + input + loop + ui│
│ ⑦ 数据层：data/remote-config.js（远程 JSON 单一来源）│
│ ⑧ 系统层：systems/{storage,audio,ads,telemetry,...} │
│ ⑨ 玩法层：play/{mode-registry, modes/*, play.js}    │
│ ⑩ 弹窗层：play/modals/*（win/lose/unlock/checkin）  │
│ ⑪ 场景层：scenes/{welcome,home,game-scene}          │
└─────────────────────────────────────────────────────┘
```

### 1.2 模块职责

| 层 | 模块 | 职责 |
|---|---|---|
| 入口 | `game.js` → `main.js` | 按依赖顺序加载所有模块；H5 与快手环境双兼容（require vs 全局） |
| 产品定制 | `core/product.config.js` | AppID/CDN 基址/广告位/语音包人设/弹窗配色/存储前缀，全部产品属性集中 |
| 平台封装 | `api/kwai-*.js` | 登录、广告（激励/插屏/Banner）、分享、分包、快捷方式、文件落盘缓存、网络 |
| 渲染 | `render/*` | 自研 WebGL 引擎：GL 上下文 + shader 批处理 + 纹理管理（含图片磁盘缓存）+ 文本渲染 |
| 框架配置 | `core/config.js` | 框架层配置组装（玩法注册表、存储键、难度常量、复活参数），可被远程配置深合并覆盖 |
| 数据 | `data/remote-config.js` | 远程 JSON 唯一来源，重试 3 次，`hiddenIdxRanges` 运行时过滤，`tauntLines` 字段兼容新旧 |
| 玩法 | `play/modes/*` | 六种玩法各自实现 render/hitTest/onHint/onRevive，共用 BaseMode 骨架 |
| 场景 | `scenes/*` | welcome（冷启动直飞判定）→ home（主题选择）→ game-scene（关卡容器） |

### 1.3 目录结构

```
ks713539070148088972/
├── game.js                       游戏入口
├── api/                          平台能力封装（kwai-*）
├── assets/                       本地素材（含 Image/home-asset/meinv 主题包目录）
├── js/
│   ├── core/                     框架配置与场景管理（config/product.config/scene/input/loop）
│   ├── data/                     远程关卡配置加载 + mock 配置 + 难度公式
│   ├── render/                   自研 WebGL 渲染引擎
│   ├── play/                     玩法控制 + 模式注册 + 6 玩法实现 + 道具栏 + HUD
│   │   ├── modes/                hidden/spot/hunt/story/dressup/puzzle
│   │   ├── hud/                  关卡内 HUD（进度/倒计时/错误剩余）
│   │   ├── modals/               结算/解锁/签到/设置弹窗
│   │   ├── asset-loader.js       进关资源预加载（critical/optional 分级）
│   │   ├── play.js               PlayController 主逻辑
│   │   └── reward-flow.js        广告奖励统一链路（提示/加时/加次/跳关）
│   ├── scenes/                   welcome/home/game-scene
│   ├── systems/                  storage/audio/ads/telemetry/checkin
│   ├── main.js                   模块加载编排
│   └── m3-init.js                基础初始化
├── standard/                     公共标准库（event-bus/subpackage-loader）
├── test/                         jest 单测（unit/）
├── package.json                  jest + @kcdn/multi-upload
├── project.config.json           小游戏工程配置
└── docs/                         设计文档 + plans/ 方案文档
```

---

## 2. 关键技术设计

### 2.1 远程配置驱动（数据层）

**原则**：客户端**无本地 baseline**，`remoteConfigUrl` 是唯一关卡数据来源。

```js
// config 流程
RemoteConfig.load()
  → fetch(remoteConfigUrl)                  // product.config.js 提供
  → 超时/失败 → retry（MAX_RETRY=3，退避）
  → 最终失败 → 状态置 error → 场景展示「空态 + 重试」UI，不卡死
  → 成功 → _parse（theme.cover 必须 http 开头才保留）→ themes/levels/props/tauntLines
  → hiddenIdxRanges 过滤 → remoteLevelsReady 回调广播
```

- `USE_MOCK_CONFIG`（生产 false）：跳过远程请求，读 `data/mock-levels-config.js` 供离线开发。
- 字段兼容：`laotieLines`（旧字段名，历史远程 JSON）→ `tauntLines`（新中性名），解析时优先读新字段。
- 远程配置可深合并覆盖 `CONFIG`（multi-curve 难度、HUD 按钮开关等均支持下发）。

### 2.2 玩法模式注册（玩法层）

```js
// core/config.js
GAMEPLAY_MODES: {
  hidden:  { id:'hidden',  name:'找出图中的穿越物', setupSec:6,  module:'HiddenMode'  },
  spot:    { id:'spot',    name:'找出上下两幅图不同之处', setupSec:10, module:'SpotMode' },
  hunt:    { id:'hunt',    name:'寻物',      setupSec:8,  module:'HuntMode' },
  story:   { id:'story',   name:'剧情找线索', setupSec:0,  module:'StoryMode' },
  dressup: { id:'dressup', name:'换装',      setupSec:0,  module:'DressupMode' },
  puzzle:  { id:'puzzle',  name:'拼图',      setupSec:8,  module:'PuzzleMode' }
}
```

- **统一骨架**：`BaseMode` 提供 render 状态机、hitTest 兜底、onCorrect/onWrong 回调、onRevive 复活、星级 / HUD 对接等全部通用能力。
- **扩展点**：每个 Mode 通过 `ModeRegistry.register(id, ModeClass)` 注册，仅需覆盖 `collectAssetGroups`（资源清单）、`draw`（渲染）、`hitTest`（可选）、`onHint`（可选）、`onRevive`（可选）。
- **故事模式**：`StoryMode` 覆盖 BaseMode 的气泡呈现为打字机动画，并做 Boss 亮度切换、简报条件启动计时、`取中心距点击最近的相交框` 特殊 hitTest，全部通过 BaseMode.extend 子类化实现。

### 2.3 广告奖励链路（reward-flow）

统一封装，一步一反馈：

```js
PlayController.useXxx = function () {
  Telemetry.adEntryExposed('hint');      // ① 入口曝光埋点
  _pauseForAd();                          // ② 暂停游戏（计时冻结/点击屏蔽）
  Ads.showRewarded(function (ok) {        // ③ 拉起激励视频
    _resumeAfterAd();                     // ④ 无论成败都恢复游戏
    if (!ok) return;                      // ⑤ 未完整观看→不发奖
    // ...真正写入奖励 + Audio/Toast + Analytics.trackLevelEvent
  }, 'hint');
};
```

- `Ads.showRewarded` 包装：8s 加载超时 + 10 分钟安全网超时（直播激励广告可能很长），失败不静默。
- 广告位配置：`kwai-ad-config.js`（激励/插屏/Banner 三类 ID）、`AD_SKIP_COUNT: 2`（跳关）、`AD_UNLOCK_ALL_COUNT: 3`（解锁全部）。
- 局内道具栏按钮（加时/放大/+5次/提示/跳关）通过 `TEMPLATE.hud.hintMaxUsesByMode[mode]` 每玩法配置各自最大使用次数。

### 2.4 复活与难度（base-mode + difficulty）

- **复活链路**：`BaseMode.getReviveInfo` → limitType（time/count）区分恢复量 → useRevive 时 `onRevive` 读取同一数值，保证「卡片文案 ↔ 实际效果」一致。
- **复活加时不被原始时长钳制**：追加秒数本身可大于 totalTime。
- **难度公式**：
  ```
  suggestDuration = setupSec(mode) + oddsCount × DIFF[diffKey].perOdd + (boss ? BOSS_BONUS : 0)
  ```
  支持关卡内联 diff 覆盖全局键；难度曲线可由远程配置下发。
- **宽容机制（mercy）**：`failStreak[levelIdx]` 连续失败中，达到阈值后触发 `applyMercy` 放宽判定，通关后 `resetStreak` 清零。

### 2.5 资源加载分级（asset-loader）

```js
// 进关前按玩法 collectAssetGroups 收集清单，扁平化后分级
PlayController._prepareLevel(level)
  → critical   // 首组（场景底图），阻塞进关
  → optional   // 其余组，允许空闲/后台渐进加载
```

- UI 图标（700+ key）在 main.js 预加载（快手 ks.createImage 不支持懒加载）。
- 纹理管理器（render/texture.js）内置磁盘缓存：下载落盘 + 复用本地文件，避免同一 URL 重复走网络。
- 欢迎页可对首关 `collectLevelSrcs` 进行预热，改善冷启动素材就绪时间。

### 2.6 渲染引擎（render 层）

- 自研 WebGL：`gl.js` 初始化 GL ↔ `shaders.js` 编译双层 shader ↔ `batch.js` 批处理（合批减少 drawcall）↔ `texture.js` 纹理与磁盘缓存 ↔ `text.js` 位图文字 ↔ `renderer.js` 主循环封装。
- 与 v1.0.0 Canvas 2D 相比：DPR 高清渲染、合批性能提升、接入图片磁盘缓存能力。
- UI Kit（ui-kit.js）提供按钮/弹窗/Toast 等通用控件，按 `CONFIG.TEMPLATE` 与 `MODAL` 视觉常量统一外观。

### 2.7 存档体系（systems/storage.js）

统一 Storage 封装，所有 key 集中在 `CONFIG.STORAGE_KEYS`（前缀来自 product.config 的 storageKeyPrefix），跨端能力：

| 环境 | 实现机制 |
|---|---|
| 快手 App | `ks.setStorageSync` / `ks.getStorageSync` |
| H5 浏览器 | `localStorage` |

核心 key（全部带前缀，跨版本兼容）：
- 进度类：`passedLevels`（通关关卡）、`themeUnlocks`（解锁主题）、`themeUnlockAdCount` / `unlockAllAdCount`（广告计数）、`tempUnlockAllUntil`（限时解锁到期时间戳）、`shortcutInstalled`、`newUserFirstLevelDone`、`checkinState`（签到周期）、`failStreak`（宽容依据）、`voicePack / voiceUnlocks`（语音包）。
- 统计类：`stats`、`playtimeMs`。
- 偏好类：`sfxEnabled` / `bgmEnabled`。

### 2.8 冷启动新手引导（welcome）

- 判定依据：`Storage.get(CONFIG.STORAGE_KEYS.newUserFirstLevelDone)` 是否存在。
- 新用户：直接进入 `_getColdStartLevel()`（首个未通关关卡），并写入该 key；`Telemetry.firstLevelEnter()` 埋点。
- 老用户：正常欢迎页 → 首页选主题。
- 欢迎页支持对首关资源做 `_collectLevelSrcs` 预热，减少进关白屏。

### 2.9 主题包与换肤

- 一套主题 = 一个完整目录 `assets/<themeId>/`，云端是同构 CDN 目录。
- 主题 manifest 下发 `{ themeId, version, cdnBase, files[md5] }`；本地 `uiAssets[key].local` 是兜底，`cdn` 由 `主题cdnBase + 相对路径` 运行时推导，**新增主题不改代码**。
- 音频（BGM/SFX/VO）与内容图（effect/pages）随主题包统一替换。

---

## 3. 关键技术决策

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 渲染引擎 | 自研 WebGL | Canvas 2D / cocos | 性能与 DPR 高清渲染需求；已在 v2.0.0 完成迁移；无外部引擎依赖、包体积可控 |
| 数据驱动 | 远程 JSON 唯一来源 | 本地 baseline + 远程 | 支持运营热更上主题，避免版本碎片 |
| 玩法扩展 | BaseMode + ModeRegistry | if/else 玩法分派 | 新增玩法零侵入业务代码（fillplace/dragmatch 重构方向） |
| 广告封装 | reward-flow 统一入口 | 分散调用 | 保证「曝光埋点 → 暂停 → 拉起 → 恢复 → 发奖」链路一致，杜绝静默失败 |
| 存档 | 统一 Storage + 前缀 | 直用 storage API | 跨端（快手/H5）一致；key 收口防散落 |
| 素材 | 主题包协议 + CDN | 本地打包 | 多主题复用；包体积可控 |

---

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| 远程配置 CDN 不可达 | 3 次重试 + 空态 UI + 重试按钮，永不卡死 |
| 图片体积导致冷启动慢 | 关键资源（首关 critical）预热 + 磁盘缓存；包体可走分包 |
| 广告无填充/超时 | 8s 加载超时 + 10 分钟安全网 + 明确提示 |
| 新手引导跳关逻辑与存档数据不一致 | key `newUserFirstLevelDone` 单向幂等写入 |
| 多主题资源重复下载 | texture.js 磁盘缓存 + 主题包相对路径不变设计 |
| 隐私政策缺失（V1 已确认 Q5）**提审阻塞** | 本期必须补齐 URL + 入口 UI，combined 实名防沉迷兜底静默降级 |

---

## 5. 测试与验证

### 5.1 单元测试

- jest + jsdom（`package.json` 已配置），脚本 `npm test`。
- `test/unit/` 覆盖数据解析、存档、难度公式、模式注册等纯逻辑模块。
- `test/cdn-resources.md` / `all-urls.txt`：素材 URL 全量清单与可达性验证。

### 5.2 端到端验证

```bash
# 快手真机预览（二维码）
ksmg preview package/ -q -o ~/Desktop/qr

# H5 浏览器（快速验证玩法逻辑，无法验证广告/登录/震动）
open package/index.html
```

### 5.3 测试矩阵（回测重点）

| 模块 | 双端真机 | H5 |
|---|---|---|
| 冷启动（≤5s/白屏/二次启动）| ✅ 必测 | — |
| 广告（全部入口 + 中途关闭 + 失败）| ✅ 必测 | ⚠️ H5 走降级直接发奖，仅参考 |
| 登录/授权/分享/加桌面 | ✅ 必测 | ⚠️ 静默跳过 |
| 隐私政策入口 | ✅ 必测 | — |
| 六大玩法全流程 | ✅ 必测 | ✅ |
| 远程配置（正常/失败重试）| ✅ 必测 | ✅ |
| 存档（清缓存/跨重进）| ✅ 必测 | ✅ |
| UI 适配（小屏/大屏/刘海）| ✅ 分辨率覆盖 | ✅ |

---

## 6. 遗留项与后续演进

| 项 | 状态 | 说明 |
|---|---|---|
| 隐私政策 URL 与入口 UI | 🔴 提审阻塞 | 本期必修 |
| 分享模板 id | 🟡 待补 | workflow-run.yml 中 share_template_id 为空 |
| 插屏/Interstitial/BN 广告位 | 🟡 待决策 | ID 已配置，未调用 |
| fillplace 玩法 + DragMatchMode 泛化 | 📋 方案已备 | 见 docs/plans/2026-09-22 |
| 多主题素材瘦身 | 📋 持续 | obeys 30MB 建议线，走 CDN/分包 |
| Q1-Q4 功能缺口 | ⏸ 本期不修 | 失败结算/timeLimit/noPenalty/答错文案 |
