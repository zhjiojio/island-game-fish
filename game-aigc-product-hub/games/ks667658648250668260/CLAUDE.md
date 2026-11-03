# CLAUDE.md · 《我的未婚妻》weihunqi 项目铁律

> 每次 Agent 进入本仓库前必读。违反下列铁律的操作，Agent 必须先停下问用户，不得擅自执行。

---

## 🔄 铁律 0（最高优先级）：hub 双向同步

**AppID `ks667658648250668260` · 云端 `game-aigc-product-hub/games/ks667658648250668260/` @ `dev`**

- **开发前必跑**：`bash scripts/hub-pull.sh` → 拉云端最新覆盖本地
- **build 完必跑**：`bash scripts/hub-push.sh "本次 changelog"` → 推最新到云端并落盘 10 项报告
- 详情见 `docs/HUB_SYNC_RULES.md`
- ⚠️ Agent 跳过本流程直接改代码 / 直接 ksmg upload = **违反铁律 0**，用户有权要求回滚

---

## 🧭 快速导航（Agent 每次入场 30s 定位法）

> **v73.0 起：content/ 是权威源，js/ 是派生产物。禁止手改 `package/js/story.js` 和 `package/js/registry.js`。**

| 想干啥 | 改哪 | 编译命令 |
|---|---|---|
| 改剧情节点（文案/next/media） | `content/episodes/EPXX.json` | `make build-story` |
| 改白名单（NARR_LOCAL_FORCE / BUNDLED_IMAGES / NODE_UNLOCK_MAP / charInfo） | `content/assets.registry.json` | `make build-registry` |
| 改铁律 | `content/rules.json`（机器可读）+ `docs/RULES.md`（人类可读） | — |
| 新增一个互动 | `make scaffold-choice EP=... ID=... PARENT=... ...` | 见 `docs/README.md` |
| 新增一集 | `make scaffold-episode EP=EP10 TITLE=...` | 见 `docs/README.md` |
| 改引擎行为 | `package/js/main.js`（唯一活代码） | — |
| 找节点定义 | `docs/story-map.md` / `docs/story-index.json` | 每次改完跑 `make index` |
| 历史 changelog | `docs/CHANGELOG.md` | — |
| 找活代码 | `package/game.js`（入口）→ `package/js/registry.js` → `package/js/story.js` → `package/js/main.js` | 老版在 `js/_archive/`（已删） |

### 必备命令

```bash
make build          # 全量编译：content/ → package/js/registry.js + package/js/story.js
make validate       # 全量审计：validate-story.sh + validate-rules.js
make index          # 重建 docs/story-index.json + story-map.md
```

### 铁律：数据流方向

```
content/**  ─────► scripts/tools/build-*.js ─────► js/{registry,story}.js ─────► game.js
   ▲                                                        │
   │                                                        │ (运行时消费)
   └─ 唯一可手改                                             ▼
                                                    package/package/js/main.js（唯一活引擎）
```

**任何时候看到 `package/js/story.js` 或 `package/js/registry.js` 顶部有 `AUTO-GENERATED`，就是禁止手改的信号。**
**只改 content/ 下的 JSON，然后 `make build`。**

### 记 changelog 铁律

- **每次改 content/ 都要在 `docs/CHANGELOG.md` 顶部加一节** `## vXX.YY · 日期`
- meta.json 的 `changelog: [...]` **只保留最近 3 条**（一句话摘要即可），历史全在 CHANGELOG.md
- 新铁律先写进 CHANGELOG 相应版本节，然后跑 `node scripts/tools/extract-rules.js`

---

## 🎬 视频生成铁律（本次 side07 翻车三次，专门写这一节）

### ❌ 严禁复用的错误脚本（历史遗留，只保留看，不允许再跑）

| 脚本 | 为什么禁用 |
|---|---|
| `scripts/kling_i2v.py` | 用 `kling-v1-6 pro`，**不带 sound 参数**，视频哑巴 |
| `scripts/kling_gen_with_ref.py` | 用可灵 kling-v1-5 图生图，人物一致性**远差于 image2 (gpt-image-2)** |
| `scripts/gen_be_stat_videos.py` | 用 `kling-v2-master`，**同样不带 sound**，哑巴 |
| `scripts/gen_bridge_audio.sh` | **老错误 pattern** —— kling 出画面 + minimax 事后拼台词，嘴型必对不上 |
| `scripts/gen_side07_audio.sh` | 同上，minimax 外挂拼接，**已 deprecated** |

### ✅ 唯一正确的视频生成流水线

**参考 agw-work-mode skill `tools/make_videos/README.md` 的 IMPORTANT 段：**
> **只要生成视频，音画同步就是最高优先级，Kling 是强制首选。** 包含对白/口型/动作声/环境声的视频，必须使用 Kling 在**同一次视频任务**中生成并同步音轨，**不得先用 Minimax 生成音频再拼接**。

**唯一入口：`scripts/gen_wanr_video.py`**

内部固定 3 步：
1. **首帧图** = `image2 (gpt-image-2) task=edit` + `references=[assets/refs/wanr.png]`，**严格锁婉儿脸型/发髻/木簪**。参数模板见脚本头。
2. **视频** = Kling 官方 API `model_name=kling-v3` + `mode=pro` + **`sound=on`** + `duration=10` + `aspect_ratio=9:16`。台词直接写进 prompt，Kling 原生生同步音轨。
3. **禁止事后 ffmpeg 拼接音频**（会导致嘴型不同步）。

### 只允许生成"纯音频"的场景才用 Minimax
BGM、纯环境音、无画面的旁白音频 —— 此时才可以用 `minimax-voice-clone` skill 或 `minimax` t2a_v2。

---

## 🖼️ 图片生成铁律

- 唯一入口：`image2 (gpt-image-2)`（agw-work-mode `tools/make_images/`）
- **禁止**再用可灵图生图 (`kling_gen_with_ref.py`)
- 涉及婉儿的图，**必须**在 request.json 里加 `references=["/Users/fat/weihunqi/assets/refs/wanr.png"]` + `task=edit`
- prompt 开头必须写 `Keep the woman's face, hairstyle (black hair bun with wooden hair stick), eye shape, skin tone and identity STRICTLY the same as the reference photo`
- 尺度基准对齐 `wanr.png` 单肩滑落 + side01 红肚兜 + side04 孔雀舞，可以性感（S型舞姿+披帛+团扇半遮脸+眼神），但**不得**直接写 `bare shoulder / chest wrap / slipped strap`（会被 OpenAI safety 拦，改用「古典舞台美+艺术表演」包装）

---

## 🔑 认证信息

- **Kling AK/SK**（本仓库自留，走 kling 官方 api-beijing.klingai.com）：
  - `AK=AJ8dkmAMgGtyCpPfARphtfEdTyGNFPpa`（新版）
  - `SK=edbAfaMyJDEEgtnYmKrNJGtgprFLHrFy`
  - 老 AK/SK（BE 那批用的）：`Af4hrCM4PENhJHrFDMLMEpptk8aYR8gJ` / `Eymh99ameJ3QTDta89QtQDgkkd3ELmDR`（**已弃**）
- **OpenRouter (image2)**：环境变量 `OPENROUTER_API_KEY`（sk-or-v1-...）
- **Minimax**（仅纯音频）：`MINIMAX_API_KEY` + `MINIMAX_GROUP_ID`（见 `scripts/gen_bridge_audio.sh` 顶部）

---

## 📋 生成对白视频的前置 Checklist（Agent 生视频前必须逐条对号）

- [ ] 首帧图是不是 image2 生的？（不是就重生）
- [ ] 首帧 prompt 是不是 `task=edit` + `references=[wanr.png]`？
- [ ] 视频脚本 `model_name` 是不是 `kling-v3`？
- [ ] 视频脚本是不是有 `"sound": "on"`？
- [ ] 台词是不是直接嵌在 prompt 里？（不是就改 prompt，不允许事后拼 minimax）
- [ ] duration=10 aspect_ratio=9:16 是不是对齐 side01-07 基线？

**任一条未通过，Agent 必须先修 checklist 再提交 kling 任务，不得先跑再改。**

---

## 🎨 婉儿人物基线（截图确认过）

- 参考图：`/Users/fat/weihunqi/assets/refs/wanr.png`
- 特征：黑发盘髻+木簪，鹅蛋脸，大眼，肤色暖白
- 已有基线视频对比（性感尺度参照）：
  - `side01` 红肚兜白纱披（换装）
  - `side04_kongque.mp4` 孔雀舞（旋身）
  - `side05_jazz.mp4` 现代爵士椅子舞
  - `side07_cailian.mp4` 江南采莲扇舞（v40 新增，本次产出）

---

## 📁 项目关键路径

```
package/                          ← 快手小游戏打包根目录（ksmg 指向这里）
  game.js                         ← 入口（require 链：kwaiadapter → events → js/main.js）
  index.html                      ← H5 调试入口
  project.config.json             ← 打包配置
  js/
    story.js                      ← ⚠️ AUTO-GENERATED，禁止手改（派生自 content/）
    registry.js                   ← ⚠️ AUTO-GENERATED，禁止手改（派生自 content/）
    main.js                       ← ✅ 唯一活引擎代码，可手改
    achievements.js               ← 成就/技能卡
    subtitles.js                  ← 视频字幕
    ks-adapter.js                 ← 广告/分享/上报
    telemetry.js                  ← 埋点
    icons.js                      ← SVG 图标
content/                          ← ⭐ 权威源（改剧情/白名单只改这里）
  episodes/EP0*.json              ← 剧本
  assets.registry.json            ← CDN/白名单/charInfo 单一来源
scripts/
  tools/                          ← build/validate 工具（被 Makefile 调用）
  scan-assets.mjs                 ← 扫描代码引用生成 manifest
  gen_wanr_video.py               ← ✅ 唯一视频生成入口
docs/                             ← 文档（CHANGELOG/RULES/PACKAGING_STRATEGY）
manifests/assets.json             ← 素材登记表
```

---

## 📦 素材与代码分离铁律（2026-08-08 · lihui26 强诉求）

### 三层机制
1. **登记层** `manifests/assets.json`：所有素材（视频/图片/音频）单一来源
2. **消费层** `package/js/main.js` 内的 CDN 常量：代码只写 `Assets.get('id')`，禁止硬编码 URL/路径
3. **门禁层** `~/.codeflicker/kwaipilot-hooks/ksmg-preflight.js`：
   - 打包前自动扫描 > 200KB 非文本文件
   - 若未在 `project.config.json.setting.ignore` 里 → 立刻报警清单
   - 同时提示 manifest 中 needs_upload 的资产

### 铁律
1. **新增素材** → 先上 CDN → 代码引 URL 或 `Assets.get()` → 跑 `node scripts/scan-assets.mjs`
2. **禁止**直接在代码里写 `assets/xxx.mp4` 相对路径（真机会 404 或膨胀包体）
3. **禁止**把大文件（> 200KB 视频/图片）commit 进仓库（`.gitignore` 已配）
4. `ksmg preview/upload` 若报大文件告警，**先把大文件挪 CDN**，不要图省事加 ignore 后又忘

### 日常一句话工作流
```bash
node scripts/scan-assets.mjs   # 有素材变动时跑
ksmg preview /Users/fat/weihunqi  # PreToolUse hook 自动预飞
```

---

## 🎯 铁律 43 · 加任何资源前必须先确定"加载时机"（2026-08-10 · lihui26 强诉求）

> **背景**：v40 前所有视频打主包 → 54MB 爆表；v42 前所有 mp3 打主包 → 30MB；主包频繁失败。根因是每次加素材没人问"这东西啥时候加载"，全默认打主包。

### 三层加载时机 · 定义

| 时机 | 装载点 | 何时加载 | 首次响应延迟 | 适用体积 |
|---|---|---|---|---|
| **T1 · 主包** | `project.config.json` 未 ignore | 扫码那一刻，一次性 | 0ms | < 500KB · 高频复用 |
| **T2 · 分包 sp2** | `assets/frames/` (game.json subpackages) | 主包 init 后台预拉 | 100~500ms | 500KB ~ 5MB · 剧情帧 |
| **T3 · CDN** | P4/P5 双域 | 运行时按需 downloadFile | 1~3s（边下边播） | > 5MB 或稀有资源 |

### 铁律

1. **禁止**默认加素材直接扔项目根就完事 —— Agent 必须先问用户"这个资源要哪个时机（T1/T2/T3）"，并给出建议。
2. **Agent 决策模板**（每次加素材必用）：
   ```
   📦 新增素材：<文件名 · 大小 · 类型>
   建议：T? · 理由：<出现次数 + 首屏必要性 + 体积>
   影响：主包 +XKB / 分包 +XKB / CDN 新增
   请确认（Y/其他时机）：
   ```
3. **打包前必跑** `node scripts/tools/preview-check.js`，看总体积和目录占比。
4. **绝不允许**在没跟用户确认前把 > 500KB 单文件加进 T1。
5. **完整策略文档**：`docs/PACKAGING_STRATEGY.md`（新素材加载时机的决策树 + 代码位置速查表）。

### 决策速查（3 秒判断）

```
❓ 这资源出现 ≥ 5 次？  是→T1 主包
❓ 必须秒开？          是→T1 主包
❓ 剧情帧图片？        是→T2 分包 sp2
❓ 单文件 > 5MB？      是→T3 CDN
❓ 只在特定结局出现？  是→T3 CDN
（否则 T2）
```

### CDN 上传后必须

1. 更新 `manifests/assets.json` 登记
2. 如果替换 BUNDLED_IMAGES 里的项，改 `content/assets.registry.json` + 重跑 `build-registry.js`
3. 跑 `node scripts/tools/preview-check.js` 确认主包体积没超阈值

---

## 🔧 快小游戏配置外化（v73.1 · 2026-08-10）



对应的 `game.json` 里 `subpackages` 只有一个 `sp2 = assets/frames/`，代码里所有 `ensureSubpkg(...)` 都必须叫 `'sp2'`。历史遗留的 `'sp1'` 全部已改。

