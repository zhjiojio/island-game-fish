# 《老铁眼真尖》（找茬类小游戏）全功能架构文档 · 重写蓝图

> 目的：本文档是 `games/ks658651445853447417/package` 现有代码的**功能全集梳理**，作为重新实现该游戏的权威蓝本。
> 适用读者：需要基于本文档从零重写代码的工程师 / AI。
> 现状代码：纯 Canvas 2D（无引擎）+ ES5，`js/game.js` 4771 行单文件巨石架构。重写时建议按 §7 的模块拆分方案落地。
>
> ⚠️ **重写铁律（本文档所有"重写"均遵循以下两条）**：
> 1. **渲染层一律使用 WebGL API 重写，禁止使用 Canvas 2D API**。本文中出现的 `ctx.drawImage / fillRect / strokeText` 等仅作为"绘制什么、层级如何"的功能语义参考，不作为实现方式参考（见 §4、§7.2 render 层）。
> 2. **不迁移任何兼容旧代码 / 旧配置的兜底逻辑**（CDN↔本地双路径回退、本地 baseline、legacy 空壳函数、历史 cache-buster 分支等，全部见 §7.4 清单），全部使用新实现；代码必须**高度解耦**（模块划分见 §7.2）。游戏配置唯一来源：
>    `https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config-v3.json`

---

## 目录

1. [总览：技术栈、入口、运行环境](#1-总览)
2. [玩法、页面、场景、弹窗全集（含新增关卡/主题方式）](#2-玩法与界面全集)
3. [音频体系（本地 / 分包 / CDN 全量资源清单）](#3-音频体系)
4. [图片 / 文字 / 弹窗 / Toast 的加载与渲染](#4-渲染体系)
5. [游戏进度管理、清除逻辑、设置页功能](#5-进度与设置)
6. [快手开放能力接入点 + 埋点分析体系](#6-平台能力与埋点)
7. [重写建议：模块拆分与关键实现约束](#7-重写建议)

---

## 1. 总览

### 1.1 基本信息

| 项 | 值 |
|---|---|
| 游戏名 | 老铁眼真尖（老铁找茬王） |
| AppID | `ks658651445853447417` |
| 引擎（现状） | **纯 Canvas 2D + ks 原生 API**（非 Cocos，`engine_type: "frog"`） |
| 渲染层（重写） | **WebGL API，禁止 Canvas 2D**（现状 2D 绘制仅作功能语义参考） |
| 配置策略（重写） | 远程 JSON 唯一来源，无本地 baseline、无双路径兼容、无旧配置兜底 |
| 语言风格 | ES5 IIFE，全部挂 `window.M3` 全局命名空间（现状；重写建议模块化导出，见 §7.2） |
| 入口 | 快手：`package/game.js` → `js/main.js`；H5：`package/index.html`（script 顺序加载，双端同一套代码） |
| 屏幕适配 | 虚拟视口 375×667，短边等比缩放居中；DPR 高清渲染；顶部安全区 `M3.Layout.safeTop` |
| 当前版本 | `M3.BUILD_VER = 'v1.3.3'`（每次 build 递增，左下角水印显示） |
| 关卡/主题数据 | **远程 CDN JSON 是唯一权威来源**，本地 `levels.js` baseline 已清空 |

### 1.2 文件加载链（双端一致）

```
快手小游戏环境:
package/game.js
  ├─ require ./kwaiadapter.js     # GameGlobal.wx = ks 的别名垫片
  ├─ require ./ks-adapter.js      # 官方 DOM/BOM polyfill（window/document/Image/fetch...）
  ├─ require ./events.js          # 事件总线 EventsManager（on/once/off/emit）
  ├─ require ./wxhelper.js        # GetMainCanvas("canvas") 取主画布
  └─ require js/main.js
       ├─ 顶层 IIFE 预热 welcome 关键图（welcome-char.png / title.png → window.__PRELOAD_IMGS）
       ├─ require m3-init.js       # M3 命名空间 + M3.Layout + M3._now()
       ├─ require telemetry.js    # 埋点（必须第二行，立即打 JS_START 7001）
       ├─ require kwai-event-bus.js / kwai-ad-config.js
       ├─ require api/kwai-login.js / kwai-ad.js / kwai-share.js / kwai-open.js / kwai-subpackage.js
       ├─ require subpackage-loader.js / feedback.js / voice-packs.js
       ├─ require levels.js / level-loader.js / welcome.js / game.js
       ├─ resize + 输入绑定 + M3.KwaiAd 广告封装 + 语音包恢复
       ├─ M3.Game.start(ctx, canvas)
       └─ requestAnimationFrame 主循环（每帧 resize→update→draw；首帧后静默预载 voice-extra 分包）

H5 预览环境:
package/index.html（<script> 按上述相同顺序加载，?v=209 cache-buster）
```

### 1.3 全局命名空间 `M3` 一览

| 挂载点 | 职责 | 来源文件 |
|---|---|---|
| `M3.Layout` | 屏幕尺寸/安全区 | m3-init.js |
| `M3._now()` | 统一时间源（禁止直接 performance.now） | m3-init.js |
| `M3.BUILD_VER` | 版本号 | main.js |
| `M3.Tele` | 里程碑埋点（ks.reportScene 封装） | telemetry.js |
| `M3.Analytics` | 会话行为统计（分片上报） | telemetry.js |
| `M3.KwaiAd` | 游戏侧广告统一入口（带全局 loading/埋点） | main.js → window.KwaiAd |
| `M3.SubpkgLoader` | 分包按需加载管理器 | subpackage-loader.js |
| `M3.Feedback` | 音效/BGM/震动/语音包 | feedback.js |
| `M3.VOICE_PACKS` / `M3.DEFAULT_VOICE_PACK` / `M3.VOICE_MULTI_KEYS` | 语音包配置 | voice-packs.js |
| `M3.THEMES` / `M3.LEVELS` / `M3.PROPS` / `M3.LAOTIE_LINES` | 主题/关卡/物品元数据/吐槽文案 | levels.js（被远程覆盖） |
| `M3.getThemeLevels(themeId)` / `M3.getDifficulty(idx)` | 工具 | levels.js |
| `M3.DIFF` / `M3.SETUP_SEC` / `M3.BOSS_BUF` / `M3.suggestDuration` / `M3.MERCY` / `M3.applyMercy` | 难度公式与宽容机制 | difficulty.js |
| `M3.Welcome` | 欢迎页绘制/登录/隐私浮层 | welcome.js |
| `M3.Game` | 核心场景机（start/update/draw/handleTap/handleMove/pickTheme/pickLevel/gotoThemes…） | game.js |
| `M3.loadImg(src)` / `window.loadImg` | 图片加载器 | game.js |
| `M3._state` | 游戏全局 state（供 main.js 广告 loading 用） | game.js |

---

## 2. 玩法与界面全集

### 2.1 场景机（state.scene）

| 场景 | 值 | 说明 | 绘制入口 |
|---|---|---|---|
| 欢迎页 | `'welcome'` | 首帧启动页：welcome-char 全屏背景 + title 大图 + loading 进度条 + 「立即找茬」按钮 + 全局音乐开关 + 隐私政策入口 + 著作权人小字 | `M3.Welcome.draw()` |
| 主题选择（首页） | `'theme_select'` | 头像（点击开战绩面板）+ title + 主题卡片列表（自适应卡高 88~118px）+ 底部 4 个 icon 入口栏 | `drawThemeSelect()` |
| 游戏页 | `'game'` | HUD + 状态条 + 舞台（场景图）+ 工具栏 + 各类浮层 | `drawGame()` |
| 错误页 | state.err 非空 | 黑屏 + 错误信息 + 「点击返回」 | `drawErr()` |

> 开发调试：`localStorage.laotie_skip_welcome = '1'` 可跳过欢迎页直达首页。

### 2.2 四种玩法模式（level.mode）

游戏核心是"在一/两张图里点击目标"，4 种模式共用同一套倒计时/命中判定/提示/跳关框架：

| mode | 名称 | 场景图字段 | 交互 |
|---|---|---|---|
| `hidden` | 单图找茬（找穿越物） | `scene` | 单图 contain 居中，点隐形命中框（穿越物已 AIGC 烘焙进图内，代码只定义坐标） |
| `spot` | 双图找不同 | `sceneA` + `sceneB` + `layout`（`'h'` 上/下图，`'v'` 左/右图） | 命中判定基准=答案图(B)矩形；点原图 A 区域自动等比映射到 B 图坐标，两图均可点击 |
| `hunt` | 静态寻物 | `scene` | 状态条下方多一条绿色"寻物清单" icon 条（`PROPS[prop].iconImg` 或 emoji chip，找到变灰打勾） |
| `story` | 剧情找线索 | `scene` | 开场案件简报（intro）→ 找线索（odds 带 `clue`/`narrative` 旁白气泡）→ Boss 关 `bossStage` 亮度切换 → 通关揭示（`epilogue`/`nextHook`）。旁白气泡、线索链弹跳、打字机动画 |

### 2.3 关卡内机制

- **倒计时**：`state.time` 每秒 -1（`Game.update` while 循环补扣，最多 3s/帧防后台挂起跳变）；场景图就绪前不启动（`_tryStartAfterSceneReady`）；story 简报阅读期不计时（`_startStoryCountdown` 点击开始才计时）。
- **最后 10 秒**：每秒 tick 音 + 时钟抖动动画 + `almost_out` 语音（恰入 10s 时）。
- **点对**：绿色圆圈标记（persist 保留至离关）+ correct 音/中震动 + 剩余≤3 时播 `remaining_N` 语音；最后一击不播 correct（避免爆音），改播 `final_hit`/`pass*`。
- **点错**：红色扩散圈 + 红叉 + `-Ns` 浮字 + wrong 音/轻震动 + 吐槽文案 toast（`M3.LAOTIE_LINES` 或 story 专属文案）+ 扣时 `diff.penalty`。
- **宽容机制（MERCY）**：同一关连续失败 ≥2 次，下次进关 +10 秒（storage `laotie_fail_streak_v1`），toast「🎁 送你 10 秒」+ 埋点 7016。
- **提示（hint）**：
  - hidden/hunt：看 1 次广告 → toast 揭晓一个未找到物品名称/方位；每关 1 次。
  - spot / story：**两段式**（第 1 次广告揭晓 `odds.clue` 线索文案 → 第 2 次广告小手 `hint-tap-hand.png` 定位）。
- **跳关（skip）**：连续看完 **2 个**激励视频 → 直接进下一关（`skipAdCount` 防重入 + 回调锁）。
- **复活（revive）**：时间到弹窗「+60秒」看广告 → `time = min(time+60, 90)` 继续游戏。
- **星级**：通关按剩余时间比例：≥50% 3星 / ≥25% 2星 / 1星；副文案「剩余 Ns，击败 X% 的老铁/高手/大神」（`calcBeatPercent`：40+ratio*55+难度加成±3 稳定抖动）。
- **插屏**：每通过 3 关 `trySpawnInterstitial`（api 层自带频控：冷启动 32s 内禁、间隔 62s）。
- **引导卡**：进关 1.5s 中央淡入淡出任务卡（文案=关卡标题），不拦截点击。

### 2.4 全部弹窗 / 浮层清单（均为 Canvas 绘制，无 DOM）

| 弹窗 | 触发 | 关键内容 | 绘制函数 |
|---|---|---|---|
| 欢迎登录 toast | 授权成功（当前已改为直接进首页，代码保留） | 头像+昵称卡片，2s 渐隐 | `Welcome.drawWelcomeToast` |
| 隐私政策浮层 | 欢迎页点《隐私政策》 | 全文内嵌可滚动卡片（`Welcome._agreementText`），touchmove 滚动 | `Welcome.drawAgreement` |
| 全局 Toast | 全工程统一提示入口（红头铁律：所有一次性提示必须走 `toast(msg)`） | 屏幕正中，宽自适应 120~351，1.6s 淡出，支持 `\n` 与自动折行 | `drawToast` |
| 我的战绩面板 | 首页点头像 | banner + 用户行（头像/昵称/玩乐时长）+ 4 行统计（闯关数/正确率/找对/找错） | `drawProfilePanel` |
| 设置浮层 | 首页齿轮 / 底部栏「设置」/ 游戏页工具栏齿轮 | banner「设置」+ 音乐/音效 toggle + 进度清空按钮 + 语音包 2 列网格 | `drawSettingsOverlay` |
| 语音包解锁弹窗 | 点击锁定语音包 | 「看视频解锁」→ 广告成功后切包+播 greet | `drawVoiceUnlockModal` |
| 解锁全部场景浮层 | 底部栏「解锁全部」 | 看完 5 个广告永久解锁全部主题 | `drawUnlockOverlay` + `unlockAllByAd` |
| 每日广告解锁主题浮层 | 点击 `unlockBy:'rewardedAd' && dailyUnlock` 且今日未解锁的主题 | 看视频解锁，当日有效，次日 0 点重置 | `drawDailyAdUnlockOverlay` |
| 分享解锁浮层 | 点击 `unlockBy:'share'` 主题 | 立即分享（成功即永久解锁）/ 我再想想 | `drawShareUnlockOverlay` + `triggerShareUnlock` |
| 引导卡 | 进关 | 本关任务名，1.5s | `drawGuideCard` |
| story 案件简报 | story 关进关 | 章节/标题/剧情/调查方向 3 条/开始按钮；`intro.style==='affair-dossier'` 且有 `templateAsset` 时用整图皮肤（羊皮纸 patch 覆盖固定文字） | `drawStoryIntro` / `_drawAffairStoryIntro` |
| 通关弹窗 | 全找齐（延迟 1s） | 恭喜通关 + 星级 + 击败 X% + 场景缩略图 + 返回/下一关（下一关需广告时带角标） | `drawWinModal` |
| story 通关揭示 | story 且配置 `nextHook` | 通关揭示（epilogue）+ 下一关钩子 + 返回/下一关 | `drawStoryRevealModal` |
| 失败弹窗 | 时间到 | 「还剩 N 个没找到」+ 重玩 / +60秒（复活广告）；关闭=返回首页 | `drawLoseModal` |
| 章节完结弹窗 | 主题最后一关点「下一关」 | 恭喜通关 · 敬请期待新章节 · 回到首页 | `drawChapterDoneOverlay` |
| 广告 loading 遮罩 | 任何 `M3.KwaiAd.showRewarded` 期间 | 转圈 + 「广告加载中」，吃掉所有点击 | `drawAdLoadingOverlay` |
| 错误页 | state.err | 黑屏 + 错误信息 + 点击返回 | `drawErr` |
| 版本水印 | 常显 | 左下角 `vX.Y.Z` | `drawBuildWatermark` |

### 2.5 关卡 / 主题数据模型（远程 JSON 唯一权威）

**来源**：`https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config-v3.json`（约 665KB，由 laotie-editor 后台导出上传）。

**加载器 `level-loader.js` 行为**：
- 页面加载即拉取（cache-buster `?_t=Date.now()` + no-cache 头，**不落盘**）；
- 3s 超时；失败静默回退 `levels.js` baseline（现为空数组 → 首页空列表，比错数据安全）；（⚠️ 现状行为；重写时按 §7.4：**不做本地 baseline 兜底**，失败走重试/空态 UI）
- 逐项校验覆盖 `M3.THEMES / M3.LEVELS / M3.PROPS / M3.LAOTIE_LINES`，支持 `hiddenIdxRanges: [[lo,hi],...]` 运行时隐藏关卡；
- `M3.remoteLevelsReady(cb)` / `M3.remoteLevelsStatus`（pending/success/timeout/error）；
- **`THEME_UNLOCK_OVERRIDE`（代码 > 远程 JSON）**：代码内写死各主题解锁策略，改策略需发版：
  ```js
  { 2917: { unlocked:true,  unlockBy:'free',       dailyUnlock:false },   // 重回80年代：免费进，freeCount 后关卡级广告
    2797: { unlocked:false, unlockBy:'rewardedAd', dailyUnlock:true  },   // 后宫眼真尖：每日看1广告解锁
    2744: { unlocked:false, unlockBy:'rewardedAd', dailyUnlock:true  } }  // 谁是第三者：每日看1广告解锁
  ```

**themes[] 字段**：

```jsonc
{
  "id": 2917,               // 主题 ID（int，进度/unlock key 均引用它）
  "subject": "重回 80 年代",  // 全名
  "short": "重回 80 年代",    // 卡片大标题
  "full": "AIGC 找茬 · 五关递增",
  "mode": "hidden",          // 主题默认玩法（hidden|spot|hunt|story）
  "cover": "https://...png", // 卡片封面（必须 http 开头，否则兜底删除）
  "cover_full": "https://...",
  "unlockBy": "rewardedAd",  // free | rewardedAd | share
  "unlocked": false,
  "dailyUnlock": true,       // 每日解锁（跨零点重置）
  "comingsoon": false,       // 敬请期待（点击只 toast）
  "tapeLabel": "热门",       // 左上角标签（热门/难度升级/上新/其他→tag-coming）
  "tapeColor": "#f26a3b", "tapeColor2": "#ff9350",  // fallback 胶带渐变色
  "stars": 2,                // 卡片左下星星数（推荐指数）
  "adReq": 0,               // >0 时进入按钮显示「▶ xN 进入」
  "freeCount": 3,            // ⭐ 关卡级广告：主题内前 N 关免费，之后每次 session 需看1个激励视频
  "desc": "...",             // 每日解锁浮层副文案
  "storyIntro": { "style":"affair-dossier", "templateAsset":"subpackages/ui-gameplay/assets/ui/theme5-brief-lv1.png", "chapterTitle":"...", "sectionTitle":"...", "buttonText":"开始找线索" },
  "storyRules": { "timeScale":1, "hitScale":1, "penalty":2, "bonus":0 }  // story 主题难度覆盖
}
```

**levels[] 字段**：

```jsonc
{
  "themeId": 2797,
  "idx": 1,                  // 全局唯一递增索引（进度、埋点、通关集合均用它）
  "title": "选秀入宫",
  "mode": "spot",             // hidden | spot | hunt | story
  "duration": 85,             // 秒（建议值 = SETUP_SEC[mode] + odds数 × DIFF[key].perOdd + (boss?8:0)）
  "hint": "在85秒内找出上下两图的3处不同……",   // 关卡 hint 兜底文案
  "boss": false,
  "diff": { "key":"normal", "bonus":10, "label":"普通", "penalty":3, "hitScale":1 },  // 内联难度（优先于 getDifficulty 曲线）
  "bossStage": 0,            // story：找到第 N 条(0-based)触发 Boss 亮度切换；非 Boss 关一般 0
  "briefGoals": [],           // story 简报调查方向（intro.goals 优先）
  "intro": {                  // story 开场简报（覆盖 theme.storyIntro）
    "style": "affair-dossier",   // 有 templateAsset 时走整图皮肤
    "templateAsset": "assets/ui/theme5-brief-lv1.png",  // 会经 SubpkgLoader 重写到子包
    "chapterTitle": "第X章 · ...", "title": "...", "body": "剧情正文（\\n 换行，自动折行≤3行）",
    "sectionTitle": "本关调查方向", "goals": ["观察...","判断...","寻找..."], "buttonText": "开始找线索"
  },
  "scene":  "https://.../xx.png",          // hidden/hunt/story 单图（CDN URL）
  "sceneA": "https://.../a.png",           // spot 原图
  "sceneB": "https://.../b.png",           // spot 答案图
  "layout": "h",                           // spot：'h' 上下 / 'v' 左右
  "odds": [                                // 茬/线索命中框（坐标系：相对图片区域的百分比）
    { "prop": "item", "x": 18.7, "y": 68.9, "w": 14.4, "h": 22.2,
      "clue": "绣帕花样改变",              // 提示线索文案（spot/story 提示优先用它）
      "tag": "中文名",                     // 兜底名称（hunt 清单 chip）
      "narrative": "旁白文案" }            // story 命中后的旁白气泡
  ],
  "epilogue": "通关揭示正文（\\n 分行）",   // story 通关页
  "epilogueTag": "情绪标签",
  "nextHook": "下一关钩子文案",            // story 有此字段 → 走 drawStoryRevealModal
  "storySchema": { }                       // 剧本 schema（编辑器下发）
}
```

**props 元数据**（`M3.PROPS`，可被远程 `data.props` 覆盖）：
`{ <propId>: { emoji:'🤖', name:'扫地机器人', iconImg:'assets/scenes/hunt/icons/xx.png'(可选，hunt chip 用) } }`

**新增关卡 / 新增主题操作步骤（不发版）**：
1. AIGC 生成场景图（spot 模式需 A/B 两张，hidden/story/hunt 一张），上传 CDN（`p1/p2-ad.adkwai.com` 下本项目路径）。
2. 在关卡编辑器（laotie-editor）中按上述 schema 追加 levels[] 条目：坐标用编辑器拉框（百分比）；`duration` 用 `M3.suggestDuration({mode, odds, diffKey, boss})` 计算后写死。
3. 新增主题则追加 themes[] 条目（新 `id`），并确认 `THEME_UNLOCK_OVERRIDE` 是否需要在代码里覆盖解锁策略。
4. 导出 `levels-config-v3.json` 重新上传 CDN 同一 URL。客户端下次启动强制拉取即生效。
5. 若关卡/主题无需上线，用 `hiddenIdxRanges` 运行时隐藏（或 `comingsoon`）即可，不用删数据。

**难度公式（difficulty.js，新增关卡定时长用）**：
```
duration = SETUP_SEC[mode] + oddsCount × DIFF[diffKey].perOdd + (boss ? 8 : 0)
DIFF: tutorial25/easy20/easy+17/normal15/normal+13/hard11/hell9/nightmare7/ultra6 秒每茬
SETUP_SEC: hidden 6 / spot 10 / hunt 8
```

### 2.6 资源管理总策略（图片/分包）

- **主包**：全局 UI 切图（`assets/ui/*` 30 张）+ 全局背景 `assets/global_bg.png` + 本地音效 + 语音包头像（`assets/voices/*.jpg`，liuhaoguaizai 为 png）。
- **分包**（game.json 声明 2 个）：
  - `subpackages/voice-extra/`：所有语音包的 `remaining_{1,2,3}_{a,b,c}.mp3`（6 包 × 9 = 54 个）。首帧后静默预载（`prefetchVoiceExtra`）。
  - `subpackages/ui-gameplay/`：通关弹窗 UI（banner-blue.png、theme5-brief-lv1.png）。进第 1 关时静默预载（`prefetchUiGameplay`）。
- **CDN**：所有场景图（cover / scene / sceneA / sceneB）、3 首 BGM、全部非 remaining 语音。前缀：
  - 配置与场景图：`https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/`
  - BGM 与语音：`https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/`
  - AIGC 新素材：`https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/...`
- **路径重写（加载顺序铁律）**：`loadImg(src)` 先过 `SubpkgLoader.rewritePath`（`assets/ui/` 白名单 → ui-gameplay 子包；`assets/audio/voices/**/remaining_*` → voice-extra 子包；其余原样，远程 JSON 的 http URL 直接走 CDN）→ 再走 `M3._rewriteToCDN`（现为 no-op，历史遗留）。
- project.config.json `setting.ignore` 排除了大量已 CDN 化的本地资源（scenes/bgm/voices 等），打包不进首包。

---

## 3. 音频体系

### 3.1 加载与播放机制（feedback.js）

- **音频上下文**：`ks.createInnerAudioContext()` 优先 → `wx.createInnerAudioContext` → H5 `new Audio()`。**预创建复用 pool**（小游戏频繁 new 会卡顿）；连点先 `stop()+seek(0)` 再 `play()` 支持重叠。
- **init 只预载 3 个短音效**（correct/wrong/tick），BGM/timeup/语音懒加载（首帧提速）。
- **语音路径重写 `_rewriteAudioCDN(src)`**：
  - `assets/audio/voices/<pack>/<file>.mp3` 且 `file` 以 `remaining_` 开头 → voice-extra 子包路径（子包已加载时），否则原路径；
  - 其余 → CDN：`CDN_BASE + 'voice_<pack>_' + <file>`；`liuhaoguaizai` 特例 → `voice_liuhaoguaizai_v3_<file>`（v3 音色，`?v=v4` cache-buster 强破 CDN edge 缓存）。
- **play(key) 硬绑定当前语音包**：非人声仅 `correct`/`tick`；`global_hint` 无专属音时静默；`global_skip→pass3`、`global_revive→final_hit_a` 同族映射；随机候选 `_resolveKey`（key ∈ `M3.VOICE_MULTI_KEYS` 时从 `_a/_b/_c` 随机挑一条）；人声缺失兜底顺序 greet→pass→pass2→final_hit_a。
- **打断与混音**：`_lastPlaying` 记录当前人声，播新先打断旧的；BGM duck——人声一响 BGM 音量降 0，`onEnded`+3.8s 估算时长双保险恢复到 0.042。
- **BGM**：3 首轮播（`bgm_list`），`loop=true` 单曲循环 + onEnded 兜底重播；幂等防双播；**只在 welcome / theme_select 场景播**（Game.draw 场景切换钩子强停）；关卡内静音。
- **震动**：`ks.vibrateShort({type:'medium'|'light'|'heavy'})` → `navigator.vibrate` 兜底。语义化组合：`correct()`=音+中震、`wrong()`=音+轻震、`lose()`=timeup 语音+双 heavy、`click()`=WebAudio 合成 1.4kHz→700Hz 方波短音+轻震（异步播放不阻塞点击）、`unlockAnthem()`=C-E-G-C 上行琶音（解锁成功）。
- **开关持久化**：全局 `_muted`（key `laotie_sfx_enabled`）+ BGM 子开关 `_bgmMuted`（key `laotie_bgm_enabled`）；静音立即停全部音频并关 AudioContext。
- **Web Audio 仅用于合成音**（click/unlockAnthem），快手容器无 `window.AudioContext` 时自动降级。

### 3.2 音频资源全量清单

**A. 主包本地（`assets/audio/`）— 7 个文件**

| 文件 | 用途 | 加载时机 |
|---|---|---|
| `correct.mp3` | 点对音效 | init 预载 |
| `wrong.mp3` | 点错音效（兜底，主声走当前语音包） | init 预载 |
| `tick.mp3` | 最后 10s 每秒滴答 | init 预载 |
| `timeup.mp3` | 时间到（无包兜底） | 懒加载 |
| `global/hint.mp3` | 提示全局奖励音 | 懒加载 |
| `global/revive.mp3` | 复活奖励音 | 懒加载 |
| `global/skip.mp3` | 跳关奖励音 | 懒加载 |

**B. CDN（`https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/`）**

| 资源 | 说明 |
|---|---|
| `bgm_1_chiptune.mp3` / `bgm_2_northeast.mp3` / `bgm_3_disco.mp3` | BGM 轮播 3 首（大厅/欢迎页） |
| `voice_<pack>_<file>.mp3` | 6 语音包 × 以下 clip 文件 |
| `voice_liuhaoguaizai_v3_<file>.mp3` | liuhaoguaizai 专属 v3 前缀 |

每个语音包在 CDN 上的 clip 文件（`buildClips(id)` 生成）：
`timeup / greet / wrong / final_hit / almost_out / remaining_1 / remaining_2 / remaining_3`（各含 `_a/_b/_c` 随机候选，remaining_* 实际在子包）+ `scene1_intro / scene2_intro / scene_hunt_intro` + `pass / pass2 ~ pass6`（龙傲天包的 pass* 在 CDN 404，代码映射到 `final_hit_a/b/c`）。

**C. 分包 `subpackages/voice-extra/`**

`assets/audio/voices/<packId>/remaining_{1,2,3}_{a,b,c}.mp3` × 6 包（xiaomei / xiaoshuai / kuergou / lala / longaotian / liuhaoguaizai）= **54 个文件**。触发时机：首帧后静默预载 + 切包时 `loadVoicePack` 兜底。

### 3.3 语音包体系（voice-packs.js）

| id | 名称 | 描述 | 状态 |
|---|---|---|---|
| `xiaomei` | 小美 | 御姐音 | **默认免费** |
| `xiaoshuai` | 小帅 | 精英男声 | 免费 |
| `kuergou` | 酷二狗 | 快手主播 | `hidden:true`（列表隐藏，规避肖像风险） |
| `lala` | 辣辣 | 快手主播 | `hidden:true` |
| `longaotian` | 龙傲天 | 神秘嘉宾 | 可见，pass* 映射 final_hit |
| `liuhaoguaizai` | 6号乖崽 | 专属语音 | 可见，CDN v3 前缀 |

- 非免费包解锁：看 1 个激励视频，**当日有效**（storage `laotie_voice_unlocks_v1` = `{date:'Y-M-D', ids:{id:1}}`，跨零点自动失效）。
- 启动恢复：读 `laotie_voice_pack`；若上次选中的是锁定包且今日未解锁 → 强制回落 `xiaomei`。
- 切包流程：`setVoicePack(pack)` → 非 xiaomei 先 `SubpkgLoader.loadVoicePack` 加载子包 → `_doSetVoicePack`（清旧 pool → 打断当前音 → 写 override → 双端持久化）→ 播 `greet`。
- 头像 `assets/voices/<id>.jpg` 在主包。

---

## 4. 渲染体系

> ⚠️ **重写说明**：本章描述的是**现状 Canvas 2D 实现**，仅作为功能语义与渲染管线参考。
> 重写时渲染层必须改为 **WebGL API**（禁止任何 Canvas 2D 调用）：自建 GL 上下文 / 着色器 / 纹理管理 / 批渲染 / 文字栅格化，本章的 `ctx.*` 语义按"绘制什么、层级如何"映射到 WebGL 的 sprite / shape / text 批次即可。WebGL 层的结构设计见 §7.2 `render/`。

### 4.1 图片加载（现状 `loadImg(src)`，game.js:172）

```
loadImg(src)
 ├─ SubpkgLoader.rewritePath(src) 命中子包？
 │    └─ 是：加载重写路径，缓存 key 保持原路径；
 │         onerror 不设 imgFailed（重置待子包就绪后重试，防死等）
 ├─ 复用 window.__PRELOAD_IMGS[src]（main.js 顶层预热对象，首帧 0 延迟）
 ├─ ks.createImage() / wx.createImage / new Image()
 ├─ onload → state.imgs[src] = img（key=原路径）→ _tryStartAfterSceneReady()
 ├─ onerror → CDN 失败回退本地路径重试一次；再失败 imgFailed
 └─ 6s 单图超时兜底 → imgFailed
```
- 渲染层统一从 `state.imgs[原路径]` 取图；`state.imgLoading/imgFailed` 防重入。
- 主题封面走"背景加载"（进图 fadeIn，不阻塞按钮）；welcome 有 CRITICAL_ASSETS 门槛 + 3s 硬兜底。
- 主菜单 `preload()` 预载全局 UI 切图 + 用户头像（从 `laotie_user` 读 URL）。

### 4.2 渲染管线（每帧 `Game.draw()`）

```
resize/refreshLayout（幂等）
清空 state.tapAreas（length=0 复用数组防 GC）
累计游玩时长（非 welcome 场景，5s 心跳写 storage）
场景切换 BGM 钩子（welcome/theme_select 才允许 BGM）
drawSkyBg（global_bg.png cover 铺满，未载入用蓝天渐变兜底）
 ├─ welcome → M3.Welcome.draw（内部也注册自己的 tapAreas）
 ├─ theme_select → drawThemeSelect
 │    drawHomeHeader（头像+title）→ 主题卡片循环 → drawThemeBottomBar
 │    → drawSettingsOverlay → drawVoicePackOverlay(空壳) → drawVoiceUnlockModal → drawProfilePanel
 └─ game → drawGame
      ├─ spot: drawSpotScene（双图 + 主色底 + _fit/_fitA 矩形）
      ├─ else: 单图（边缘采样色铺底 + contain 主图 + state._fit）
      ├─ 通用命中层（clip 到舞台）：hintArrows（story/spot 用小手图，其他用三角箭头）
      │    marks（绿圈 persist / 红叉）floats（-Ns 上飘字）
      ├─ drawHud（返回按钮+关卡标题）→ drawStatusStrip（进度按钮+分段进度条+倒计时切图）
      ├─ hunt: drawHuntStrip（寻物清单 icon 条）
      ├─ story: drawStoryLayer（Boss 亮度 + 旁白气泡）
      ├─ drawToolbar（设置齿轮 + 提示/跳过按钮 + 广告角标）
      ├─ drawGuideCard → drawWinModal/drawStoryRevealModal → drawLoseModal
      ├─ drawSettingsOverlay → drawVoiceUnlockModal → drawChapterDoneOverlay
      └─ story: drawStoryIntro（最上层）
welcomeToast 跨场景渐隐
全局浮层：drawToast → drawUnlockOverlay → drawShareUnlockOverlay → drawDailyAdUnlockOverlay
       → drawClickRipples（金色涟漪）→ drawErrRipples（红色错误圈）
       → drawBuildWatermark（版本水印）→ drawAdLoadingOverlay（广告 loading，最顶层）
```

### 4.3 文字渲染约定

- `setFont(size, weight)` 缓存最近 font 字符串省 ctx.font 开销；统一 `sans-serif`（story 用 `FZZhengHeiS-EB-GB, sans-serif`）。
- `text()` / `textStroke()`（白字+深描边，游戏风格主力）；`_fillTextEllipsis` 省略号截断；`_storyWrapLines` 中文逐字折行（maxLines + 末行孤字回挪 + 省略号）。
- 昵称超长截断：首页 8 字、profile 面板 12 字。

### 4.4 点击系统（无 DOM 事件，纯热区表）

- `state.tapAreas` **每帧由各 draw 函数重建**（这是本游戏 UI 框架的核心模式：绘制即注册）。
- `Game.handleTap(cx, cy)`：100ms debounce → 按 `priority` 降序遍历 → 命中即执行 `onTap(cx,cy)` → 金色涟漪 + `Feedback.click()`。
- 遮罩类弹窗靠高 priority 全屏 absorber（如设置面板 priority 850/900，语音解锁 2850/2900，广告 loading 99999）吃掉穿透点击。
- `Game.handleMove` → 隐私浮层滚动（`Welcome.handleAgreementMove`）。
- 输入源：canvas touchstart/mouse + `ks.onTouchStart/onTouchMove` 双绑定。
- 舞台点击 `onCanvasTap`：坐标 → 图片百分比 → `hitScale` 中心收缩命中框判定 → spot 原图区域等比映射 → story 模式取"中心距点击最近"的相交框（防大框抢点，边界收回图内）。

### 4.5 布局常量

- 虚拟视口 `VW=375, VH=667`；`S = min(W/VW, H/VH)`，`OX/OY` 居中偏移；`px()/py()/ps()` 换算。
- 游戏页：`HUD_H=44`（顶部）+ `STATUS_H=42`（状态条）+ 底部 `TOOLBAR_H=72`；舞台 = 中间剩余区域。
- 弹窗统一 Figma 蓝色系视觉：卡片 `#EBF3FF` + 7px `#6AA0F2` 描边 + r24 + banner-blue.png 标题条（284×74，left=35，上出框 35px）+ 右上角 btn-close.png（46×46，top=20，right=-15）。

---

## 5. 进度与设置

### 5.1 存储 Keys 全表（ks.setStorageSync / localStorage 双写防单端丢）

| Key | 内容 | 写入点 |
|---|---|---|
| `laotie_user` | `{avatar, nickName}` | 登录成功后 |
| `laotie_voice_pack` | 当前语音包 id | 切包 |
| `laotie_voice_unlocks_v1` | `{date, ids}` 当日解锁的语音包 | 广告解锁语音包 |
| `laotie_theme_unlocks_v1` | `{date, ids}` 当日解锁的主题 | 每日广告解锁主题 |
| `theme_<id>_unlocked` | `'1'` 永久解锁标记 | 分享解锁 / 解锁全部场景 |
| `laotie_last_level_<themeId>` | 该主题上次所在关的全局 idx | pickLevel |
| `laotie_passed_levels_v1` | `{idx:1}` 已通关集合（去重） | 通关时 `_markLevelPassed` |
| `laotie_stats_v1` | `{correct, wrong, levelPass}` | 每次点对/点错/通关 |
| `laotie_playtime_ms` | 累计游玩毫秒 | draw 循环 5s 心跳 |
| `laotie_fail_streak_v1` | `{idx:连败次数}` | 失败 +1 / 通关清零 |
| `laotie_sfx_enabled` / `laotie_bgm_enabled` | `'0'/'1'` | 音效/BGM 开关 |
| `laotie_shortcut_installed` | `'1'` | 桌面快捷方式成功后（隐藏「添加桌面」按钮） |
| `laotie_hint_free_date` / `laotie_skip_welcome` | 历史遗留（清空列表包含） | — |
| `__analytics_buffer__` / `__tele_last_boot__` | 埋点缓冲 / 冷热启判断 | telemetry.js |

内存级：`_sessionAdUnlocked = { themeId: true }`（关卡级广告解锁，session 有效，清缓存即重置）。

### 5.2 进度流转

- 进主题 `Game.pickTheme(id)`：comingsoon → toast；未解锁 → 每日广告解锁/分享解锁弹窗；已解锁 → 恢复 `laotie_last_level_<id>`（校验仍属该主题）否则进第 1 关。
- 进关 `Game.pickLevel(idx)`：关卡级广告拦截（`theme.freeCount` 后、session 未解锁）→ 写 last_level → 清理上关状态 → diff/mercy → `SubpkgLoader.loadForLevel` → 加载场景图（就绪才计时）→ 停 BGM → 跨主题播 intro 语音 → mercy toast。
- 通关：`_markLevelPassed`（写 passed 集合）+ stats.levelPass + 清连败 + 埋点（FIRST_LEVEL_END / LEVEL_EXIT win / 通关阶梯 3/5/10 关）+ 下一关按**主题序列**（非全局 idx+1）；主题最后一关 → chapterDone 弹窗。
- 失败：连败 +1 → 下次进关 mercy +10s。

### 5.3 设置页功能全集（drawSettingsOverlay，首页/游戏页共用）

1. **音乐**（全局音效总开关）toggle → `Feedback.toggleMuted()`（立即停/启所有音频）
2. **音效**（BGM 独立子开关，全局开时才生效）toggle → `Feedback.toggleBgmMuted()`
3. **进度** → 「清空」按钮，删除：
   - 上述全部进度类 key（stats/playtime/user/通关集合/连败/各主题 last_level/主题解锁/语音解锁/选中语音包）
   - 动态遍历 `M3.THEMES` 清 `laotie_last_level_<id>`
   - story 主题通关记录从 passed 集合中移除
   - `unlockBy==='share'` 的主题回锁
   - 语音包切回小美 + 停当前音
   - 若正在 story 关内 → 直接跳回该主题第 1 关
   - toast「已清除所有进度、任务和解锁音色 ✔」
4. **语音包**：2 列网格（vp-selected/unlocked/locked 切图三态），点击锁定包 → 解锁弹窗；点击可用包 → 切包 + 播 greet；全局静音时提示先开音乐。

### 5.4 首页底部 4 入口栏（drawThemeBottomBar）

| 按钮 | 行为 |
|---|---|
| 设置 | 打开设置浮层（埋点 OPEN_SETTINGS + BUTTON_CLICK） |
| 解锁全部 | 已全解锁 → toast；否则解锁浮层（5 广告） |
| 添加桌面 | `ks.showShortcutMenu` → `ks.addShortcut` 兜底；成功后持久化并隐藏该按钮；启动时 `ks.checkShortcut` 查询回填 |
| 分享好友 | `ks.shareAppMessage`（channel:'system'），toast 结果 |

---

## 6. 平台能力与埋点

### 6.1 快手开放能力接入清单

| 能力 | ks API | 接入位置 | 用途 |
|---|---|---|---|
| 平台适配 | GameGlobal / ks-adapter.js + kwaiadapter.js | 根目录 game.js | DOM/BOM polyfill，wx 别名 |
| 登录 | `ks.login` | api/kwai-open.js → welcome.js `_asyncLogin` | 拿 code（后端可换 session） |
| 授权 | `ks.authorize('scope.userInfo')` / `ks.getSetting` | 同上 | 拿真实头像昵称（必须先 authorize，否则返回匿名"铁子"） |
| 用户信息 | `ks.getUserInfo({withCredentials:true})` | 同上 | state.user + `laotie_user` 持久化 |
| 激励视频 | `ks.createRewardedVideoAd({adUnitId})` | api/kwai-ad.js（window.KwaiAd）→ main.js（M3.KwaiAd 封装） | 见 §6.2 广告矩阵 |
| 插屏 | `ks.createInterstitialAd` | api/kwai-ad.js `showInterstitial` | 每 3 关 trySpawnInterstitial（频控 32s/62s） |
| Banner | `ks.createBannerAd` | api/kwai-ad.js（有封装，游戏流程未使用） | 预留 |
| 分享 | `ks.shareAppMessage` / `ks.onShareAppMessage` / `ks.getLaunchOptionsSync` | api/kwai-share.js；game.js `shareToFriend`/`triggerShareUnlock` | 好友分享 + 分享解锁主题 + 启动参数 |
| 桌面快捷方式 | `ks.showShortcutMenu` / `ks.addShortcut` / `ks.checkShortcut` | game.js `addShortcut`/`_checkShortcutOnBoot` | 添加到桌面 |
| 震动 | `ks.vibrateShort` | feedback.js `vibrate` | 点对中震/点错轻震/失败重震 |
| 存储 | `ks.getStorageSync / setStorageSync / removeStorageSync` | 全局（localStorage 双写） | §5.1 全部 key |
| 网络 | `ks.request`（fetch 兜底） | level-loader.js `_fetch` | 拉远程关卡 JSON（3s 超时） |
| 音频 | `ks.createInnerAudioContext` | feedback.js | 全部音频 |
| 图片 | `ks.createImage` | game.js `loadImg`、main.js 预热 | 全部图片 |
| 系统信息 | `ks.getSystemInfoSync` | main.js（safeArea）、api/kwai-ad.js（Banner 布局） | 安全区/窗口尺寸 |
| 触摸 | `ks.onTouchStart / onTouchMove` | main.js `bindInput` | 输入 |
| 分包 | `ks.loadSubpackage` | api/kwai-subpackage.js + subpackage-loader.js | voice-extra / ui-gameplay 按需加载 |
| 生命周期 | `ks.onShow / ks.onHide` | telemetry.js | onHide 时 flushAll 埋点 |
| 埋点上报 | `ks.reportScene` | telemetry.js | 见 §6.3 |
| 网络请求头 | Cache-Control no-cache | level-loader.js | 强制刷新远程配置 |

**当前启用的 require**（main.js）：kwai-login / kwai-ad / kwai-share / kwai-open / kwai-subpackage。其余 api/*.js（base/render/ui/network/storage/file/media/device/record/repost/shortcut/siderbar/commonuse/official/game-community/data-analysis）为脚手架预置未启用，重写时按需保留。

### 6.2 广告位与广告矩阵

- 广告位 ID（`js/kwai-ad-config.js`）：激励 `2300058115_01`、插屏 `2300058115_01`、Banner `2300058115_01`（当前三合一）。
- `window.KwaiAd.showRewarded(onRewarded, onCancel)`：`onClose` 回调 `res.isEnded` 判定是否看完；先 `offClose` 卸上次 handler 防重复绑定；一次回调即卸载。
- `M3.KwaiAd.showRewarded(cb)`（main.js 统一入口）：进入即 `state.adLoading=true`（全局遮罩阻断点击）→ 8s 硬超时 → 任何回调清 loading → 埋点 AD_ENTRY_CLICKED / AD_LOAD_OK / AD_SHOW_END(ended|failed) / AD_REWARD_GRANTED → `cb(ok)`。

| 场景 | 广告次数 | 奖励 |
|---|---|---|
| 提示（hidden/hunt） | 每关 1 次 | toast 揭晓一个目标名称/方位 |
| 提示（spot/story 两段式） | 2 次 | ① 线索文案 ② 小手定位 |
| 跳过本关 | 2 次 | 直接进下一关 |
| 时间到复活 | 1 次 | +60 秒继续 |
| 解锁全部场景 | 5 次 | 全主题永久解锁（写 `theme_<id>_unlocked`） |
| 语音包解锁 | 1 次/天 | 该包当日可用 |
| 主题每日解锁 | 1 次/天 | 该主题当日可进 |
| 关卡级解锁（freeCount 后） | 1 次/session/主题 | 该主题本 session 全放行 |
| 插屏 | 自动 | 每 3 关（api 层频控） |

### 6.3 埋点体系（telemetry.js，M3.Tele + M3.Analytics）

**ks.reportScene 约束**：每 sceneId 一次启动仅一次（重复报错）→ 里程碑式设计；dimension 必须非空 string；metric 必须可 parse 数字；序列化 ≤1024 字符；<13.5.40 客户端自动降级 no-op；**所有 sceneId/dimension key/metric key 需在小程序管理后台「埋点管理」预注册**（详见 `docs/telemetry-registration.md`）。

**场景 ID 分配（A~F 组）**：

| 组 | sceneId | 事件 |
|---|---|---|
| A 启动加载漏斗 | 7001 | JS_START（冷启/热启 entry 判断：30 分钟内再次启动 = warm） |
| | 7002 | WELCOME_SHOWN 欢迎页首帧 |
| | 7003 | HOME_READY 首页可点击就绪 |
| | 7004 | FIRST_LEVEL_ENTER 首次进关 |
| | 7005 | SCENE_IMG_LOADED 首张场景图加载完成（dimension.imgSrc=cdn|local 对比） |
| B 时长留存漏斗 | 7010 | FIRST_LEVEL_END 首关结束（result/foundCnt/hintCnt） |
| | 7011/7012/7013 | REACH_3/5/10_LEVELS 累计通关阶梯 |
| | 7014 | OPEN_SETTINGS 打开设置 |
| | 7015 | SEE_HIDDEN_ENTRY |
| | 7016 | MERCY_TRIGGERED 宽容触发（卡关信号） |
| C 广告漏斗 | 7020 | AD_ENTRY_EXPOSED 广告入口首次曝光（slot=hint） |
| | 7021 | AD_ENTRY_CLICKED |
| | 7022 | AD_LOAD_OK（costTime） |
| | 7023 | AD_SHOW_END（result=ended/failed） |
| | 7024 | AD_REWARD_GRANTED |
| D 会话统计（分片） | 7030 | SESSION_SUMMARY（totalMs/totalClicks/totalPv/screenMs/lvEnter/lvWin/lvLose/wrongCnt） |
| | 7031/7032 | SCREEN_STATS_P1/P2 屏幕 PV+停留时长 |
| | 7033/7034 | BUTTON_STATS_P1/P2 按钮点击计数 |
| | 7040~7049 | LEVEL_STATS_P1~P10 关卡数据（每 10 关一片：L<n>_e/w/x/ms/wr/h/b） |
| E 关卡实时事件 | 7050 | LEVEL_ENTER（levelIdx/themeId/levelTitle/mode/isRetry） |
| | 7051 | LEVEL_EXIT（costTime=精确停留ms，result=win/lose/back） |
| F 按钮实时事件 | 7052 | BUTTON_EXPOSE（预留） |
| | 7053 | BUTTON_CLICK（btnId/location/levelIdx/themeId/isAd/adSlot） |

- 7050+ 为可重复上报事件（本地不做防重）；7001~7049 本地 `_reported` 防重。
- **M3.Analytics**（D 组）：本地累加器全程记录 `_screens`（pv/ms）/`_buttons`（计数）/`_levels`（enter/win/lose/ms/wrong/hint/foundCnt/best），30s 持久化到 `__analytics_buffer__` 防杀进程丢失；`ks.onHide` → `flushAll('onHide')` 分片上报。
- 主要打点位置：welcome 首帧/按钮（btn_enter）、pickLevel/pickTheme、onCanvasTap（tap_correct/tap_wrong）、win/lose、useHint/useSkip/reviveAd、M3.KwaiAd 封装内、设置开关等。

---

## 7. 重写建议

### 7.1 现状痛点

1. `js/game.js` 4771 行：场景机 + 14 个弹窗 + 渲染工具 + 存储层 + 广告编排全部混在一个 IIFE 里。
2. 绘制即注册 tapAreas 的模式导致弹窗层级靠 priority 魔数（17/18/20/950/2850/2900/99999）人工约定，易穿透。
3. 版本注释堆叠（v0.0.x ~ v1.3.x），大量历史兜底代码（legacy 函数、双路径、隐藏语音包）。
4. 存储读写代码在 6 个文件里重复出现（ks + localStorage 双写样板）。

### 7.2 建议模块拆分（重写目标结构：高度解耦，渲染 WebGL）

设计原则：**模块间只经显式接口通信，禁止 M3 式全局命名空间互相挂载**；渲染层（WebGL）与业务层（场景/弹窗/玩法）彻底分离，业务层只面对 renderer 暴露的高层语义 API。

```
package/
├── game.js / index.html / game.json / project.config.json   # 入口与配置（同现状）
├── render/            # ★ WebGL 渲染层（全新实现，禁止 Canvas 2D API）
│   ├── gl.js          # WebGL 上下文创建 / contextlost 恢复 / 视口与 DPR
│   ├── shaders.js     # 顶点/片元着色器（quad 批渲染，纯色与贴图两套）
│   ├── texture.js     # 纹理创建/上传/图集/引用计数与释放
│   ├── batch.js       # sprite/shape 批渲染（圆角矩形/渐变/裁剪）
│   ├── text.js        # 文字栅格化到纹理 + 排版能力（替代 measureText/fillText）
│   └── renderer.js    # 对业务层暴露高层语义：drawImage/roundRect/text/strokeText…
├── core/
│   ├── ns.js          # 模块化导出 + Layout + 统一时钟（替代 M3 全局命名空间）
│   ├── loop.js        # 主循环 + resize + 输入绑定（= main.js 骨架）
│   ├── scene.js       # 场景机：welcome/home/game 状态 + 切换钩子
│   ├── input.js       # tapAreas 注册表 + handleTap/handleMove + debounce + 涟漪
│   └── ui-kit.js      # 按钮木牌/星星/角标/toast 等控件（基于 renderer 语义 API，非 ctx）
├── data/
│   ├── remote-config.js     # 远程 JSON 加载器（唯一配置来源，无本地 baseline；失败→重试/空态 UI）
│   └── difficulty.js        # 难度公式与宽容机制
├── systems/
│   ├── audio.js       # 音效/BGM/震动/语音包（池化复用 + 资源路径路由表统一维护）
│   ├── storage.js     # ★ 统一 kv 封装（平台探测单点、日期失效结构、清空清单单点维护）
│   ├── ads.js         # 广告统一入口（loading/超时/埋点/广告矩阵）
│   ├── subpackage.js  # 分包按需加载
│   └── telemetry.js   # 埋点（Tele + Analytics）
├── scenes/
│   ├── welcome.js    # 欢迎页（含隐私浮层，隐私全文建议外置 JSON）
│   ├── home.js       # 主题选择 + 头部 + 底部栏 + 战绩面板
│   ├── play/         # 玩法拆分：
│   │   ├── play.js       # 玩法主流程（pickLevel/update/onCanvasTap）
│   │   ├── modes/{hidden,spot,hunt,story}.js   # 四模式渲染与特有交互
│   │   ├── hud.js        # HUD/状态条/工具栏/hunt strip
│   │   └── modals/       # 每个弹窗一个文件（win/lose/settings/profile/unlock*/chapter/story-intro…）
└── assets/ + subpackages/   # 资源同现状
```

### 7.3 必须保留的游戏行为规则（玩法语义，与渲染技术无关，重写勿丢）

1. **统一时间源**（模块级时钟封装），禁用裸 performance.now（快手时间基不一致会卡动画）。
2. **场景图就绪前不启动倒计时**（弱网加载期间玩家不应被扣时）；story 简报阅读期也不计时。
3. **倒计时补扣最多 3s/帧**，guard 触顶把时间基准拉齐 now（防后台挂起跳变）。
4. **音频上下文必须预创建复用**；快速连点先 stop/seek 再 play；最后 1 击不播 correct（爆音）；tick 独立通道。
5. **广告回调防重**：闭包锁 + offClose 卸载 + 8s 超时 + 全局 loading 遮罩吃点击。
6. **onClose isEnded 才发奖励**；看完才算数（跳关 2 次计数只认 ok=true）。
7. **hitScale 中心收缩** + story 相交框取最近中心 + 边界收回图内。
8. **分包资源路由必须与实际分包内容一致**（空分包仍路由 = 无限 loading 且不报错，极难排查）。
9. **下一关按主题序列取**（全局 idx 不连续），不用 idx+1。
10. **lose 弹窗关闭 = 返回首页**（此时 running=false，只关弹窗会死锁）。
11. **昵称超长省略号**（首页 8 字/面板 12 字）。
12. **BGM 只在 welcome/home 播**；进关必停；离关恢复；人声 duck。
13. **语音包 hidden 包不下发到 UI**（肖像风险）；locked 音包今日未解锁时启动回落默认包。
14. 每次发版：版本号 + 水印 + `[MARKER]` console 死证据同步。

### 7.4 明确【不迁移】的旧兼容 / 兑底逻辑（全部换新实现，禁止照搬）

以下均为现状代码中的历史包袱，重写时**直接用新方案替代**，不要带过来：

| 旧逻辑（现状） | 重写新方案 |
|---|---|
| CDN 失败回退本地路径双路重试（loadImg onerror 分支） | 统一资源管理器：单一 URL + 加载失败重试策略 + 显式失败态 UI，无"本地/远程"双路径概念 |
| 本地 levels.js baseline 兑底（现已清空）+ `_rollbackBaseline` | 远程 JSON 唯一来源；拉取失败 → 重试按钮 / 空态页，不存在本地 baseline 机制 |
| `M3._rewriteToCDN` no-op 兼容入口 | 删除；资源路径路由收敛到 texture/audio 管理器的路由表 |
| `window.__PRELOAD_IMGS` 预热对象接管 | renderer 层标准预加载队列（priority + await） |
| `THEME_UNLOCK_OVERRIDE` 代码覆盖远程 JSON（双权威） | 解锁策略直接写进远程 JSON / 新配置层，不再代码 > 配置 |
| liuhaoguaizai `pass* → final_hit_*` CDN 404 运行时映射 | 资源清单一次性治理正确，不做运行时映射补丁 |
| `?v=v4` / `?v=209` 等散落的 cache-buster 分支 | 统一资源版本号 / hash 机制，一处维护 |
| legacy 空壳/废弃函数（`drawVoicePackOverlay`、`_legacyOnPlayClick`、`drawGameSettingsOverlay`、`drawProp` 等） | 直接删除，不保留兼容壳 |
| Android Canvas 2D 9 参数 drawImage 源矩形取整 hack | WebGL 纹理坐标无此问题；保留"警惕真机静默失败"意识即可 |
| 双写存储中的历史遗留 key（`laotie_hint_free_date`、`laotie_skip_welcome` 等） | storage.js 只维护 §5.1 有效 key 清单，历史 key 不迁移 |
| `ks + localStorage` 双写样板代码在 6 个文件重复出现 | 统一 storage.js 单点封装（平台能力探测一处完成） |
| M3 全局命名空间互相挂载 | 模块化导出 + 显式依赖注入 |

### 7.5 数据契约（重写实现需等价支持）

- 远程 JSON schema（§2.5），含 `hiddenIdxRanges` / `version` / `props` / `laotieLines`。
- 存储 keys（§5.1）与"清空"全量列表（含动态 `laotie_last_level_<themeId>`）。
- 埋点 sceneId 7001~7053 及 dimension/metric key（管理后台已注册，改名需重新注册）。
- 语音包 clip 命名规则（`voice_<pack>_<file>.mp3`、liuhaoguaizai v3 前缀、remaining_* 子包）。
- CDN 前缀与配置 URL（levels-config-v3.json）。

---

*文档基于 2026-09-03 代码快照（BUILD_VER v1.3.3 / index.html ?v=209）逐文件梳理产出。*

---

## 8. v2.0.0 重写完成情况（2026-09-03）

> **重写版本**：`BUILD_VER = 'v2.0.0'`，入口目录 `games/ks658651445853447417/ww_rewrite_package/`
> **代码规模**：34 个模块文件，约 5600 行，全部 WebGL 渲染，无 Canvas 2D 游戏绘制。

### 8.1 最终目录结构

```
ww_rewrite_package/js/
├── render/                  ★ WebGL 渲染层（全新实现，禁 Canvas 2D）
│   ├── gl.js                WebGL 上下文管理 + contextlost 恢复 + viewport/DPR
│   ├── shaders.js           顶点/片元着色器：贴图(SPRITE) / 纯色(COLOR) / SDF圆角(ROUND) 三套
│   ├── texture.js           纹理加载（Promise）+ 引用计数 + contextRestored 重建
│   ├── batch.js             SpriteBatch（贴图批渲染）+ ShapeBatch（纯色批渲染），减少 draw call
│   ├── text.js              文字栅格化（离屏 Canvas 2D → 纹理）+ 折行/省略/描边排版
│   └── renderer.js          对业务层暴露高层 API：drawImage / drawImageFit / drawImageCover /
│                            drawRoundRect / drawCircle / drawRect / drawText
│
├── core/
│   ├── config.js            ★ 全局配置唯一来源（详见 §8.3）
│   ├── scene.js             场景状态机 register / go / update / draw
│   ├── input.js             tapAreas 热区注册表 + handleTap（100ms debounce）+ 涟漪动画
│   ├── loop.js              requestAnimationFrame 主循环 + resize（幂等）
│   └── ui-kit.js            通用控件：toast / 弹窗卡片框架 / 星级 / toggle / 按钮 / 广告遮罩
│
├── data/
│   ├── remote-config.js     远程 JSON 加载（唯一权威，无本地 baseline）+ 指数退避重试（最多3次）
│   └── difficulty.js        难度公式（suggestDuration）/ 宽容机制（checkMercy）/ 星级（calcStars）
│
├── systems/
│   ├── storage.js           ★ 统一 KV 封装（ks > wx > localStorage 单点探测，日期失效，清空清单）
│   ├── audio.js             音效/BGM/震动/语音包（池化复用 + 路径路由表）
│   ├── ads.js               激励视频（loading遮罩/8s超时/isEnded校验/埋点）+ 插屏频控
│   └── telemetry.js         埋点 7001~7053（Tele 里程碑 + Analytics 会话累计分片上报）
│
├── play/
│   ├── mode-registry.js     ★ 玩法注册表（新增玩法只需注册，play.js 零修改）
│   ├── play.js              主流程：pickLevel / update / onCanvasTap / hint / skip / revive
│   ├── modes/
│   │   ├── hidden.js        单图找茬（contain + hitScale 中心收缩）
│   │   ├── spot.js          双图找不同（A/B UV 映射，layout h/v）
│   │   ├── hunt.js          寻物（寻物 strip icon 条，prop iconImg 优先）
│   │   └── story.js         剧情（案件简报/打字机旁白/Boss亮度/bossStage）
│   ├── hud/hud.js           HUD(返回+标题) + 状态条(分段进度+倒计时) + 工具栏 + 引导卡
│   └── modals/
│       ├── win-modal.js     通关弹窗（缩略图/星级/击败%/下一关广告角标）
│       ├── lose-modal.js    失败弹窗（重玩/+60s复活，关闭=返回首页）
│       ├── settings-overlay.js  设置浮层（音效/BGM toggle/语音包网格/清空进度）
│       └── unlock-overlays.js   解锁浮层集合（语音包/全部场景/分享/每日广告/章节完结/story揭示/战绩）
│
├── scenes/
│   ├── welcome.js           欢迎页（welcome-char/title/立即找茬/音乐开关/隐私浮层）
│   ├── home.js              首页（主题卡片列表/惯性滚动/底部4栏/解锁策略分发）
│   └── game-scene.js        游戏场景外壳（委托 PlayController，注入全局 toast/广告遮罩）
│
├── m3-init.js               M3 命名空间 + Layout + 统一时钟（保留兼容）
├── kwai-ad-config.js        广告位 ID 配置
└── main.js                  入口串联（require 顺序 / Renderer.init / GameLoop.start）
```

### 8.2 四项设计原则落地情况

| 原则 | 实现方式 |
|---|---|
| **解耦架构** | 10 层分层；模块间仅通过显式接口通信；无 M3 全局命名空间互挂；渲染层与业务层彻底分离 |
| **配置化** | `CONFIG.UI_ASSETS`（CDN 优先→本地兜底）、`CONFIG.AUDIO`、`CONFIG.GAMEPLAY_MODES` 注册表、`CONFIG.VOICE_PACKS`、`CONFIG.STORAGE_KEYS` 等，全部收敛到 `js/core/config.js` 单点维护 |
| **玩法可扩展** | `ModeRegistry.register('新id', 构造函数)` 即可接入新玩法；新模式只需实现 `hitTest / onCorrect / draw` 接口，play.js / hud.js 零修改 |
| **WebGL 渲染** | `render/` 全新实现；SDF 着色器圆角矩形无 stencil 开销；批渲染减少 draw call；文字仅栅格化阶段用离屏 Canvas 2D（不用于游戏场景绘制） |

### 8.3 配置文件字段说明及新增方式

配置文件唯一入口：`js/core/config.js`，导出全局 `CONFIG` 对象。

#### 8.3.1 新增 UI 图片资源

在 `CONFIG.UI_ASSETS` 中添加一项，字段格式：

```js
// js/core/config.js → CONFIG.UI_ASSETS
myNewIcon: {
  cdn:   'https://p1-ad.adkwai.com/.../my-icon.png',  // CDN 地址（可选）
  local: 'assets/Icon/my-icon.png'                    // 本地兜底路径（必填）
}
```

调用方式：
```js
// 任意业务模块中
Renderer.drawImage(CONFIG.uiAsset('myNewIcon'), x, y, w, h);
```

- **有 `cdn` 字段时**：优先使用 CDN 地址。
- **无 `cdn` 字段时**：直接使用 `local` 本地路径（`assets/Icon/` 下）。
- 图片需提前加载：`TextureManager.load(CONFIG.uiAsset('myNewIcon'))`。

#### 8.3.2 新增音频资源

在 `CONFIG.AUDIO` 中添加：

```js
// 本地音效（主包）
mySound: {
  local:   'assets/Audio/my-sound.mp3',
  preload: false   // true = init 时预载；false = 懒加载
},

// CDN 音频
myCdnAudio: {
  cdn:   'https://p5-ad.adkwai.com/.../my-audio.mp3',
  local: 'assets/Audio/fallback.mp3'
}
```

播放方式（在 `systems/audio.js` 中扩展语义方法）：
```js
Audio.playMySound = function () { this._playSfx('mySound'); };
```

#### 8.3.3 新增玩法模式

**第一步**：在 `CONFIG.GAMEPLAY_MODES` 注册：

```js
// js/core/config.js → CONFIG.GAMEPLAY_MODES
myMode: {
  id:       'myMode',
  name:     '我的新玩法',
  setupSec: 8,        // 基础建立时间（用于 suggestDuration 计算）
  module:   'MyMode'  // 对应 modes/ 下的构造函数名
}
```

**第二步**：创建 `js/play/modes/my-mode.js`，实现接口：

```js
function MyMode(level, theme) {
  this.level = level;
  this.theme = theme;
}

// 必须实现
MyMode.prototype.hitTest  = function (cx, cy, hits) { return { hit: false }; };
MyMode.prototype.onCorrect = function (oddIdx, cx, cy) {};
MyMode.prototype.draw      = function (state) {};

// 可选实现
MyMode.prototype.update        = function (dt) {};
MyMode.prototype.showNarrative = function (text) {};

// 自注册到 ModeRegistry
ModeRegistry.register('myMode', MyMode);
```

**第三步**：在 `js/main.js` 和 `index.html` 按顺序引入该文件（在 `mode-registry.js` 之后）：

```js
// main.js require 块
require('./play/modes/my-mode.js');
```

```html
<!-- index.html -->
<script src="js/play/modes/my-mode.js?v=2"></script>
```

这样新玩法无需修改任何已有业务代码，`play.js` 会通过 `ModeRegistry.create(level.mode, ...)` 自动路由到新模式。

#### 8.3.4 新增主题/关卡（不发版）

远程配置 JSON（`levels-config-v3.json`）是唯一权威来源，操作步骤：

1. AIGC 生成场景图，上传至 CDN（`p1/p2-ad.adkwai.com` 路径）。
2. 在关卡编辑器（laotie-editor）中按 §2.5 schema 追加 `levels[]` 或 `themes[]` 条目。
3. 新主题的解锁策略直接写入 `themes[].unlockBy` / `themes[].dailyUnlock`（无需代码覆盖，参见 §7.4）。
4. 导出 `levels-config-v3.json` 上传到 CDN 同一 URL，客户端下次启动强制拉取即生效（`?_t=Date.now()` + no-cache）。
5. 需要隐藏某些关卡时使用 `hiddenIdxRanges: [[lo, hi]]`，不需要删数据。

#### 8.3.5 新增存储 Key

在 `CONFIG.STORAGE_KEYS` 中添加键名，在 `systems/storage.js` 中添加对应读写工具方法：

```js
// js/core/config.js → CONFIG.STORAGE_KEYS
myFeatureData: 'laotie_my_feature_v1',

// js/systems/storage.js
getMyFeatureData: function () {
  return Storage.get(CONFIG.STORAGE_KEYS.myFeatureData);
},
setMyFeatureData: function (val) {
  Storage.set(CONFIG.STORAGE_KEYS.myFeatureData, val);
}
```

需要在「清空进度」时一并清除，则在 `storage.js` 的 `clearAll()` 中添加该 key。

#### 8.3.6 新增埋点事件

1. 在 `systems/telemetry.js` 中添加语义方法：

```js
// 7001~7049 范围：每次启动只上报一次（本地 _reported 防重）
// 7050+ 范围：可重复上报
myEvent: function (param) {
  this.report(7060, { myParam: String(param) });  // 选一个未使用的 sceneId
}
```

2. 在快手小程序管理后台「埋点管理」预注册 `sceneId`、`dimension key`、`metric key`（必须，否则上报失败）。

3. 在对应业务位置调用：`Telemetry.myEvent(someValue);`

---

*v2.0.0 重写完成记录（2026-09-03，ww_rewrite_package 目录，34个模块，~5600行）*
