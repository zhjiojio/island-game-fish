# 两款快手小游戏 · 埋点上报体系总结与对比

> 整理日期：2026-09-10
> 覆盖项目：《荒年开局·我的未婚妻》(ks667658648250668260) / 《老铁眼真尖》(ks658651445853447417)
> 数据来源：两个仓库的 `package/js/telemetry.js`、`telemetry-manifest.js`、`docs/telemetry-scenes.csv`、`docs/telemetry-registration.md` 实测统计

---

## 0. 一句话结论

| | 未婚妻 | 老铁眼真尖 |
|---|---|---|
| 埋点范式 | **字典驱动**：每个节点/选项一个独立 SceneID，1052 个活跃事件 | **里程碑 + 本地聚合分片**：31 个 SceneID，靠 metric 字段承载明细 |
| 上报通道 | 仅 `ks.reportScene`（reportAnalytics 未开通，禁用于报表） | 仅 `ks.reportScene`（同样有 `reportAnalytics` 但只做兜底 console） |
| 号段 | 8001–8074（legacy）、9000–11100（业务）、20000–20255（时长槽） | 7001–7053 |
| 明细粒度 | 精确到「哪个选项被谁点了」 | 精确到「哪一关多少人卡住」，但要靠分片 metric 反查 |
| 时长统计 | 256 个 duration_slot、delta 增量制 | SESSION_SUMMARY totalMs + 各屏 `_ms` |
| 后台注册 | 9xxx 段实测免注册可入库，v93 新号段待核验 | 必须先注册，否则 20001 错误；LEVEL_STATS 需 770 个 metric key |
| **EP05 是否有上报** | ✅ **有，且完整**（见第 3 节） | — |

---

## 一、《荒年开局·我的未婚妻》埋点体系

### 1.1 架构

```
content/telemetry-scenes.json      ← 权威字典（唯一真值源，append-only）
        ↓ node scripts/tools/build-telemetry.cjs
package/js/telemetry-manifest.js   ← 运行时 key→sceneId 映射（1100 keys）
docs/telemetry-scenes.csv          ← 分析侧字典（2231 行，含退役项）
        ↓
package/js/telemetry.js            ← 采集与投递核心
package/api/kwai-data-analysis.js  ← ks.reportScene / reportAnalytics 薄封装
```

- 协议版本 `schemaVersion = v93.0.0`，游戏版本 `gameVersion = v92.2`（线上 96.1.0）。
- `make build` 会同步构建 manifest 与 CSV；**未登记的新事件会让构建失败**，须先 `--allocate` 追加编号。
- 退役键永久保留编号，禁止复活。

### 1.2 事件键分布（当前 active = 1052）

| 事件组 | 数量 | 说明 |
|---|---:|---|
| `node_view:<id>` | 245 | 每个剧情节点一个独立 SceneID |
| `option_view / option_click / option_commit` | 各 135 | 选项曝光 → 点击意图 → 广告通过后真正执行 |
| `node_first_choice / node_first_commit` | 各 38 | 每启动每节点的**互斥首选**（求分叉占比只能用这个） |
| `card_view / card_click` | 各 5 | 首页章节卡曝光/点击（EP01–EP05） |
| `chapter_enter / chapter_ready / chapter_complete` | 各 5 | 进入 → 首帧内容可见 → 通关 |
| `chapter_ad_request / ok / fail` | 各 5 | 章节解锁广告漏斗 |
| `preview_view / next / replay / home` | 各 5 | 章节过渡页 |
| `page_view:<type>` | 5 | 隐私/成就/教学等页面类型 |
| `duration_slot:0..255` | 256 | 有效时长增量槽（20000–20255） |
| `achievement_direct_click / ok / fail` | 各 1 | 成就页直连广告 |
| `duration_exhausted / transport_issue` | 各 1 | 自诊断 |
| legacy 里程碑 | 48 | 8001–8074，保留不回收 |

按章节的 active 事件数：**EP01 108 / EP02 325 / EP03 179 / EP04 65 / EP05 94 / EP99(公共失败) 15**。

### 1.3 关键字段

dimension：`v`(协议版本)、`game_version`、`boot_id`(启动唯一)、`event_key`、`chapter_id`、`content_ep`、`node_id`、`node_type`、`option_id`(稳定 ID，重排不变)、`opt_idx`、`entry_source`、`locked`、`configured_ad`、`requires_ad`、`admin_bypass`、`source`/`from_chapter`、`reason`

metric：`delta_ms`、`seq`；顶层 `costTime` = 距启动毫秒数（**不能当章节停留时长用**）

### 1.4 五条投递铁律

1. **同一 SceneID 每次真实进程启动只能占用一次**。重玩、回首页、清存档、切后台都不重置 `boot_id`。
2. 状态 `pending / acknowledged / failed`；**只有明确 fail 才重试一次**，无回调保持 pending，绝不盲目重发。
3. dimension 必须非空字符串，metric 必须能 parse 为数字，各自序列化 ≤1000 UTF-8 字节（代码里超限直接丢弃并记 `oversize`）。
4. 曝光判定有可见性门控：视频要 `videoStarted && !videoLoading`，图片要目标图加载完，选项要命中区至少一半在屏内；教学/隐私/成就/广告遮挡时**不计**底层曝光。
5. 时长只累计前台可玩时间，扣掉后台、广告、首页、过渡、暂停、加载等待、BE/结局停留；每 30s 或状态切换发一片。

### 1.5 分析口径

| 指标 | 分子 / 分母 |
|---|---|
| 首页章节选择率 | `card_click:EPxx` / `card_view:EPxx` |
| 章节进入转化率 | `chapter_ready:EPxx` / `card_click:EPxx` |
| 节点到达率 | `node_view:<id>` / 同期启动数或本章 `chapter_ready` |
| 选项点击率 | `option_click:<id>` / `option_view:<id>`（各选项独立分母，**合计可 >100%**） |
| 首次选择分布 | `node_first_choice` 各选项 / 该节点发生首选的启动数（合计=100%） |
| 选项执行转化 | `option_commit` / `option_click`（差值 = 广告取消 / 未看完） |
| 人均有效停留 | Σ`delta_ms` / `chapter_ready` 用户数，**必须同时给出覆盖率与槽位耗尽率** |

配套 SQL：`docs/telemetry-v93.sql`。

---

## 二、《老铁眼真尖》埋点体系

### 2.1 架构

```
package/js/telemetry.js
  ├─ M3.Tele       ── 里程碑上报（report / has / elapsed / onLevelWin）
  └─ M3.Analytics  ── 本地聚合器（screens / buttons / levels）→ onHide 分片 flush
package/api/kwai-data-analysis.js
docs/telemetry-registration.md  ← 后台注册清单
```

版本 `M3.BUILD_VER = v1.3.3`（注册文档基线 v1.0.74）。
与未婚妻最大的差别：**没有节点字典**，靠 `ks.storage` 持久化本地累加器，在 `onHide` 时把统计打包进 metric 分片上报，杀进程后下次启动补传。

### 2.2 Scene ID 全表

| 组 | ID | 名称 | 触发 |
|---|---|---|---|
| **A 启动漏斗** | 7001 | JS_START | JS 首次执行（带 entry=cold/warm、pkgVer） |
| | 7002 | WELCOME_SHOWN | 欢迎页首帧绘制完 |
| | 7003 | HOME_READY | 首页可点击 |
| | 7004 | FIRST_LEVEL_ENTER | 首次进任一关 |
| | 7005 | SCENE_IMG_LOADED | 场景图加载完（CDN vs 本地对比） |
| **B 留存漏斗** | 7010 | FIRST_LEVEL_END | 首关结束 |
| | 7011/7012/7013 | REACH_3/5/10_LEVELS | 累计通关阶梯 |
| | 7014 | OPEN_SETTINGS | 打开设置 |
| | 7015 | SEE_HIDDEN_ENTRY | 看到隐藏关入口 ⚠️**代码中未接线** |
| | 7016 | MERCY_TRIGGERED | 仁慈机制触发 |
| **C 广告漏斗** | 7020–7024 | AD_ENTRY_EXPOSED / CLICKED / LOAD_OK / SHOW_END / REWARD_GRANTED | 广告五步 |
| **D 会话聚合** | 7030 | SESSION_SUMMARY | onHide 打包总览 |
| | 7031/7032 | SCREEN_STATS_P1/P2 | 屏幕 PV+停留分片 |
| | 7033/7034 | BUTTON_STATS_P1/P2 | 按钮点击分片 |
| | 7040–7049 | LEVEL_STATS_P1–P10 | 110 关分 10 片，每关 7 字段 |
| **E 关卡实时** | 7050 | LEVEL_ENTER | themeId/levelIdx/isRetry |
| | 7051 | LEVEL_EXIT | costTime=精确停留，result=win/lose/back |
| **F 按钮实时** | 7052 | BUTTON_EXPOSE | ⚠️**保留未上** |
| | 7053 | BUTTON_CLICK | btnId/location/levelIdx/themeId/isAd/adSlot |

> **去重规则**：`sceneId >= 7050` 为实时可重复上报，其余每启动只报一次（`_reported` 本地先挡一层）。

### 2.3 LEVEL_STATS metric 口径（核心资产）

每关 7 字段 `L<idx>_*`：`_e` 进入 / `_w` 通关 / `_x` 失败 / `_ms` 累计停留 / `_wr` 错误点击 / `_h` 提示次数 / `_b` 最佳耗时。

关卡难度定位公式：
- 完成率 `L_w / L_e` < 60% → 太难
- 平均耗时 `L_ms / L_w` 远高于同主题均值 → 卡点
- 平均错误 `L_wr / L_e` 高 → 异物太隐蔽
- 提示依赖 `L_h / L_e` > 30% → 找不到

### 2.4 已知风险

1. **注册量爆炸**：110 关 × 7 = 770 个 metric key 需后台批量导入 CSV，未注册直接 `20001`。
2. metric key 被截断：屏幕名截前 10 字符、按钮名截前 14 字符，`level_lose` 恰好 10 字符踩边界。
3. `SEE_HIDDEN_ENTRY(7015)`、`BUTTON_EXPOSE(7052)` 定义了但代码未调用 → 后台会长期零数据。
4. 依赖 `onHide` 才 flush，强杀丢尾段（30s 兜底 `_persist` 缓解但不保证）。

### 2.5 实际调用点密度（实测）

`M3.Analytics.screenEnter` ×10、`buttonClick` ×6、`levelEnd` ×3、`levelStart/levelWrong/levelHint/levelFound` 各 ×1；`M3.Tele.report` 覆盖 A/B/C/E/F 各组共 18 处。

---

## 三、EP05 是否有上报？—— ✅ 有，覆盖完整

逐项核实结果（基于 `package/js/story.js` + `telemetry-manifest.js` + `telemetry-scenes.csv`）：

| 检查项 | 结果 |
|---|---|
| EP05 剧情节点数 | 30 个 |
| `node_view:*` 覆盖 | **30 / 30 = 100%**，全部 `status=active`，0 缺失、0 退役 |
| EP05 选项数 | 14 个（f5_drink ×3、f5_fix ×3、f5_fix2 ×2、f5_biz ×3、f5_rub ×3） |
| `option_view / click / commit` | **14 / 14 全覆盖**，SceneID 11558–11624 段，全部 active |
| `node_first_choice / commit` | 5 个 choice 节点全部登记（`optionIds` 含 f5_drink/f5_fix/f5_fix2/f5_biz/f5_rub） |
| 章节级事件 | `card_view:EP05`=11000、`card_click`=11001、`chapter_enter`=11002、`chapter_ready`=11065、`chapter_complete`=11003、`chapter_ad_request/ok/fail`=11008/11009/11010，全部 active |
| `preview_view/next/replay/home:EP05` | 11004–11007，全部 active |
| legacy 里程碑 | `EP05_ENTER` = 8016 |
| 首页章节列表 | `story.js chapters[]` 含 EP05（`start: e5s0a`，未标 hidden），`chapter-home.js` 只过滤 `hidden`，故 EP05 卡片正常曝光可采 |
| EP05 active 事件总数 | **94 个** |

**结论**：EP05 埋点在代码层已 100% 就绪，与 EP01–EP04 同一套 v93 口径，无漏埋。

### ⚠️ 但有两个前提要注意

1. **后台号段核验尚未完成**。`docs/telemetry-v93.md` 第 7 节明确写着：「v92 用户曾实测 9xxx 无预注册即可成功；**v93 新号段尚需后台核验**，不能仅凭 mock SUCCESS 宣布已入库」。EP05 章节级事件落在 11000–11065 段，属新号段 —— **代码有上报 ≠ 数仓已入库**，需要真机跑一遍后去 `CUSTOMIZE_SCENE` 验证。
2. **数据量取决于线上版本渗透**。EP05 是 v91.1 才全部落地（v91.2 补 BE 结局），当前线上 96.1.0；分析时必须按 `game_version` 筛选，不要把 v90.x 的旧启动混进 EP05 分母。

### 建议的验证动作

真机扫码走一遍：首页 → 点 EP05 卡片 → 解锁广告 → 进 e5s0a → 走到 f5_fix 选广告选项 → 完成/BE，然后在快手后台 CUSTOMIZE_SCENE 用同一个 `boot_id` 核对下面这条事件链是否齐：

```
8001 → 11000(card_view) → 11001(card_click) → [11008/11009] → 11002(chapter_enter)
→ 11065(chapter_ready) → 10621(node_view:e5s1) → 11558段(option_view/click/commit)
→ 20000+(duration_slot) → 11003(chapter_complete)
```

本机可先执行 `Telemetry.diagnostics()` 查看 `bootId / durationSlots / errors / reports` 三态。

---

## 四、可互相借鉴的点

**未婚妻 → 找茬**
- 字典即真值源 + 构建期强校验（未登记事件构建失败），能根治「代码报了后台没注册」的 20001。
- `option_click` vs `option_commit` 双事件区分「广告点击意图」和「真实转化」，找茬的广告漏斗目前缺这一层。
- 曝光可见性门控（半屏命中区判定），比找茬的 `screenEnter` 粗粒度更可信。

**找茬 → 未婚妻**
- `ks.storage` 持久化 + 下次启动补传，能弥补未婚妻「强杀丢最后 30s」的短板。
- LEVEL_STATS 分片聚合思路可用于压缩未婚妻的 1052 个 SceneID —— 长期看号段会被吃穿。
- `LEVEL_ENTER/EXIT`(7050+) 的「实时可重复上报」设计（>=7050 不去重），未婚妻当前全量受「每启动一次」限制，重玩数据全丢。

---

## 五、文件索引

**未婚妻** `/Users/fat/weihunqi/`
- `docs/telemetry-v93.md` — 埋点规范正文（口径权威）
- `docs/telemetry-v93.sql` — 取数 SQL
- `docs/telemetry-v93-validation.md` — 验证清单
- `docs/telemetry-scenes.csv` — 2231 行字典
- `docs/telemetry-v91.md` — 历史版本
- `content/telemetry-scenes.json` — 权威源
- `package/js/telemetry.js` / `telemetry-manifest.js` / `api/kwai-data-analysis.js`

**老铁眼真尖** `/Users/fat/work/minigame/game-aigc-product-hub/games/ks658651445853447417/`
- `docs/telemetry-registration.md` — 后台注册清单 + 分析用法
- `package/js/telemetry.js` (466 行) / `api/kwai-data-analysis.js`
