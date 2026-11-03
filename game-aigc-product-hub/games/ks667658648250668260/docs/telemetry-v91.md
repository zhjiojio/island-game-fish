> 历史版本存档。当前规范请阅读 [v93 埋点规范](telemetry-v93.md) 和 [SQL](telemetry-v93.sql)。旧 8060/8061 说明有误，请勿继续按通用页面/按钮口径查询。

# 荒年记·我的未婚妻 · 埋点规范文档

> **版本**：v91.0.0  
> **AppID**：ks667658648250668260  
> **生成日期**：2025-07-12  
> **对应文件**：`package/js/telemetry.js` + `package/js/main.js`

---

## 一、双通道架构

| 通道 | API | 特性 |
|------|-----|------|
| 分析通道 | `KwaiDataAnalysis.reportAnalytics(evtName, { dimension, metric })` | 多次上报、自由 KV、维度+指标分离 |
| 场景通道 | `ks.reportScene({ sceneId, costTime, dimension, metric })` | 同一 sceneId **每次启动仅上报一次**，用于漏斗里程碑 |

> **重要**：DAU 口径不要用 sceneId 8002，使用平台原生后台数据概览或 `session_start` 事件 UV。

---

## 二、SceneID 总表（全部需在快手小程序后台注册）

### A组 · 启动漏斗（8001-8006）

| SceneID | 名称 | 触发时机 | costTime |
|---------|------|---------|----------|
| 8001 | JS_START | JS 包开始执行，文件顶层自动触发 | 0 |
| 8002 | ENGINE_READY | 引擎初始化完成（**⚠️ 非 DAU 口径**） | sinceStart |
| 8003 | FIRST_NODE_ENTER | 第一个剧情节点渲染完成 | sinceStart |
| 8004 | FIRST_EP_ENTER | 第一个 EP 进入 | sinceStart |
| 8005 | FIRST_CHOICE_SHOW | 第一次看到选项 | sinceStart |
| 8006 | FIRST_CHOICE_CLICK | 第一次点选项（真正开始玩） | sinceStart |

### B组 · 剧情推进漏斗（8010-8019）

| SceneID | 名称 | 触发时机 |
|---------|------|---------|
| 8010 | REACH_10_NODES | 看到 10 个节点 |
| 8011 | REACH_30_NODES | 看到 30 个节点 |
| 8012 | REACH_60_NODES | 看到 60 个节点 |
| 8013 | REACH_100_NODES | 看到 100 个节点 |
| 8014 | EP02_ENTER | EP02 首次进入 |
| 8015 | EP03_ENTER | EP03 首次进入 |
| 8016 | EP05_ENTER | EP05 首次进入 |
| 8017 | EP07_ENTER | EP07 首次进入 |
| 8018 | EP09_ENTER | EP09 首次进入 |
| 8019 | FIRST_BE_REACHED | 第一次撞 BE 结局 |

### C组 · 广告漏斗（8020-8025）

| SceneID | 名称 | 触发时机 |
|---------|------|---------|
| 8020 | AD_ENTRY_EXPOSED | 首次看到带广告的选项 |
| 8021 | AD_ENTRY_CLICKED | 首次点击广告解锁 |
| 8022 | AD_SHOW_OK | 首次广告播完拿奖励 |
| 8023 | AD_SHOW_FAIL | 首次广告失败 |
| 8024 | AD_REWARD_GRANTED | 首次解锁成功 |
| 8025 | AD_REPEAT_3 | 本次启动看满 3 条广告 |

### D组 · 时长里程碑（8030-8035）

| SceneID | 名称 | 触发时机 |
|---------|------|---------|
| 8030 | PLAY_1MIN | 玩满 1 分钟 |
| 8031 | PLAY_3MIN | 玩满 3 分钟 |
| 8032 | PLAY_5MIN | 玩满 5 分钟 |
| 8033 | PLAY_10MIN | 玩满 10 分钟 |
| 8034 | PLAY_20MIN | 玩满 20 分钟 |
| 8035 | PLAY_30MIN | 玩满 30 分钟 |

### E组 · 会话汇总（8040-8047）

> 在 `onHide` / 大结局页 / BE 结局页时 `sceneFlush()` 触发。

| SceneID | 名称 | metric 字段 |
|---------|------|------------|
| 8040 | SESSION_SUMMARY | playSec / nodeEnter / choiceClk / epCount / beCount / adExposed / adClicked / adOk / adFail / wei / qing / liang |
| 8041 | EP_STATS_P1 | EP名 → 停留毫秒（分片1，按停留时长降序） |
| 8042 | EP_STATS_P2 | EP名 → 停留毫秒（分片2，超出 900 字节时继续） |
| 8043 | BTN_STATS_P1 | btnKey → 点击次数（分片1） |
| 8044 | BTN_STATS_P2 | btnKey → 点击次数（分片2） |
| 8045 | AD_STATS | exposed / clicked / ok / fail / escape / reward |
| 8046 | BE_STATS | BE类型 → 触达次数 |
| 8047 | ASSET_FAIL_STATS | kind:key → 失败次数 |

### F组 · 页面曝光 ★ v91.0 新增（8060）

| SceneID | 名称 | 说明 |
|---------|------|------|
| 8060 | PAGE_EXPOSE | 每次页面/状态切换时触发（走 `reportAnalytics` 通道，可多次上报） |

**事件名**：`page_expose`

| 字段 | 类型 | 说明 |
|------|------|------|
| `pageName` | dimension | 当前页面（见枚举） |
| `fromPage` | dimension | 来源页面 |
| `ep` | dimension | 当前章节 |
| `nodeId` | dimension | 当前节点 ID |
| `nodeType` | dimension | 节点类型 |
| `nodeTitle` | dimension | 节点文案前 16 字 |

**pageName 枚举**：

| 值 | 含义 |
|----|------|
| `splash` | 启动页（协议/开始页） |
| `game_story` | 剧情播放页（视频/图片节点） |
| `game_choice` | 选项页 |
| `be_overlay` | BE 旁白遮罩页 |
| `end_page` | 大结局页 |
| `chapter_panel` | 章节选择面板（打开时曝光） |

### G组 · 按钮点击 ★ v91.0 新增（8061）

| SceneID | 名称 | 说明 |
|---------|------|------|
| 8061 | BUTTON_CLICK | 所有按钮统一点击事件（走 `reportAnalytics` 通道，每次都报） |

**事件名**：`btn_click_v2`

| 字段 | 类型 | 说明 |
|------|------|------|
| `btnId` | dimension | 按钮唯一 ID（见枚举） |
| `location` | dimension | 按钮所在页面（同 pageName 枚举） |
| `ep` | dimension | 当前章节 |
| `nodeId` | dimension | 当前节点 ID |
| `nodeTitle` | dimension | 当前节点文案前 16 字 |
| `isAd` | dimension | `'1'` = 点击后会触发广告，`'0'` = 不触发 |
| `adSlot` | dimension | 广告位标识（见枚举），无广告则 `''` |
| `adScene` | dimension | ★ v91.0 广告来源页面（同 pageName） |
| `adEp` | dimension | ★ v91.0 广告来源章节 |
| `adNodeId` | dimension | ★ v91.0 广告来源节点 ID |
| `adNodeTitle` | dimension | ★ v91.0 广告来源节点名称/文案前 16 字 |

---

## 三、枚举值汇总

### btnId 枚举

| btnId | 含义 | isAd | adSlot |
|-------|------|------|--------|
| `btn_option_N` | 选项按钮（N=0,1,2...序号） | 0 | — |
| `btn_option_ad_N` | 需看广告的选项（N=序号） | 1 | `choice_unlock` |
| `btn_next` | 继续/下一幕 | 0 | — |
| `btn_chapter_open` | 打开章节选择器 | 0 | — |
| `btn_chapter_close` | 关闭章节选择器（★ v90.1 误触修复后） | **0** | — |
| `btn_chapter_jump` | 选择章节跳转（含广告门） | 0/1 | `chapter_jump` |
| `btn_be_retry_ad` | BE 结局页点看广告复活 | 1 | `be_revive` |
| `btn_be_restart` | BE 结局页点重来 | 0 | — |
| `btn_share` | 分享 | 0 | — |
| `btn_add_desktop` | 加桌面 | 0 | — |
| `btn_mute` | 静音/取消静音 | 0 | — |
| `btn_log_open` | 打开章节抽屉（同 chapter_open） | 0 | — |
| `btn_log_close` | 关闭章节抽屉 | 0 | — |

### adSlot 枚举

| adSlot | 触发场景 | 对应 btnId |
|--------|---------|-----------|
| `choice_unlock` | 选项解锁广告 | `btn_option_ad_N` |
| `chapter_jump` | 章节跳转广告 | `btn_chapter_jump` |
| `be_revive` | BE 结局复活广告 | `btn_be_retry_ad` |

---

## 四、全量事件列表（分析通道）

| event_name | 触发时机 | 关键 dimension | 关键 metric |
|------------|---------|---------------|-------------|
| `session_start` | 冷启动/重置会话 | entry | — |
| `session_heartbeat` | 每 60s | — | totalStayMs / playedNodes |
| `node_enter` | 进入新节点 | nodeId / ep / nodeType / nodeTitle | sceneIdx / hasMedia / fromRestart |
| `node_leave` | 离开节点 | nodeId / ep / nodeType / nodeTitle / leaveReason | stayMs |
| `ep_progress` | 首次进入某 EP | ep | — |
| `choice_click` | 点击选项 | nodeId / ep / optText / optNext / hasAd / isBEChoice | optIdx / optCount / delta_wei / delta_qing / delta_liang |
| `btn_click` | 旧版按钮点击（兼容保留） | btnKey / nodeId / ep | — |
| **`btn_click_v2`** | ★ v91.0 统一按钮点击 | btnId / location / isAd / adSlot / adScene / adEp / adNodeId / adNodeTitle | — |
| `ad_click` | 点击广告 | scene / nodeId / ep / adSlot / adScene / adEp / adNodeId / adNodeTitle | optIdx |
| `ad_result` | 广告结果回调 | scene / result / failReason / adSlot / adScene / adEp / adNodeId / adNodeTitle | watched / need |
| `be_reached` | 触达 BE 结局 | beType / nodeId / ep | — |
| `narr_play` / `narr_end` / `narr_fail` | 旁白音频生命周期 | nodeId / ep / nodeType / src / reason | — |
| `end_page_view` | 大结局页曝光 | nodeId / ep / kind / endingKey | hasBg / hasNarr |
| `asset_load` | 素材加载结果 | assetKind / assetKey / result / nodeId / src | — |
| **`page_expose`** | ★ v91.0 页面曝光 | pageName / fromPage / ep / nodeId / nodeType / nodeTitle | — |

**公共 dimension**（每条事件均携带）：

| 字段 | 说明 |
|------|------|
| `session` | 本次启动的 session ID（`s_xxxxxx_xxxxxx`） |
| `version` | telemetry 版本（`v91.0.0`） |
| `entry` | 启动入口（unknown / share / desktop 等） |
| `ep` | 当前章节（EP01 / EP02...） |

**公共 metric**（每条事件均携带）：

| 字段 | 说明 |
|------|------|
| `wei` | 当前威严值（0-100） |
| `qing` | 当前情感值 |
| `liang` | 当前粮食值 |
| `beCount` | 本次已触达 BE 次数 |
| `playSec` | 本次会话已玩秒数 |

---

## 五、取数 SQL 口径

> 以下为 Hive/SparkSQL 伪 SQL，实际字段名以快手数仓表结构为准。

### 5.1 DAU 口径

```
⚠️ 不要用 scene_id = 8002，用平台原生后台「数据概览 → 日活」。
或：SELECT COUNT(DISTINCT device_id) FROM events WHERE event_name = 'session_start' AND dt = '${date}'
```

### 5.2 启动漏斗（Scene 通道）

```sql
SELECT scene_id, COUNT(DISTINCT device_id) AS uv
FROM scene_events
WHERE scene_id IN (8001, 8002, 8003, 8004, 8005, 8006)
  AND dt = '${date}'
GROUP BY scene_id
ORDER BY scene_id
```

### 5.3 每集/每节点观看人数

```sql
-- 哪个 EP / 节点被看了多少人
SELECT dimension['ep'] AS ep,
       dimension['nodeId'] AS node_id,
       COUNT(DISTINCT device_id) AS uv
FROM events
WHERE event_name = 'page_expose'
  AND dimension['pageName'] = 'game_story'
  AND dt = '${date}'
GROUP BY ep, node_id
ORDER BY uv DESC
LIMIT 100
```

### 5.4 每节点停留时长（P50）

```sql
SELECT dimension['ep'] AS ep,
       dimension['nodeId'] AS node_id,
       PERCENTILE(CAST(metric['stayMs'] AS BIGINT), 0.5) AS stay_p50_ms,
       AVG(CAST(metric['stayMs'] AS BIGINT)) AS stay_avg_ms
FROM events
WHERE event_name = 'node_leave'
  AND dt = '${date}'
GROUP BY ep, node_id
ORDER BY stay_avg_ms DESC
LIMIT 50
```

### 5.5 选项点击分布（按 btnId）

```sql
-- 每个节点各选项被多少人点了
SELECT dimension['ep'] AS ep,
       dimension['nodeId'] AS node_id,
       dimension['btnId'] AS btn_id,
       COUNT(DISTINCT device_id) AS click_uv,
       COUNT(*) AS click_cnt
FROM events
WHERE event_name = 'btn_click_v2'
  AND dimension['btnId'] LIKE 'btn_option%'
  AND dt = '${date}'
GROUP BY ep, node_id, btn_id
ORDER BY ep, node_id, click_uv DESC
```

### 5.6 广告来源精确溯源（★ v91.0 新增）

```sql
-- 哪个章节/节点/广告位触发了最多广告
SELECT dimension['adEp']         AS ep,
       dimension['adNodeId']     AS node_id,
       dimension['adNodeTitle']  AS node_title,
       dimension['adSlot']       AS slot,
       COUNT(DISTINCT device_id) AS ad_trigger_uv,
       COUNT(*)                  AS ad_trigger_cnt
FROM events
WHERE event_name = 'btn_click_v2'
  AND dimension['isAd'] = '1'
  AND dt = '${date}'
GROUP BY ep, node_id, node_title, slot
ORDER BY ad_trigger_uv DESC
LIMIT 50
```

### 5.7 广告漏斗（C 组 Scene）

```sql
SELECT scene_id, COUNT(DISTINCT device_id) AS uv
FROM scene_events
WHERE scene_id IN (8020, 8021, 8022, 8023, 8024, 8025)
  AND dt = '${date}'
GROUP BY scene_id
ORDER BY scene_id
-- 期望漏斗：8020 > 8021 > 8022 ≈ 8024；8025 表示重度用户
```

### 5.8 EP 停留时长排行

```sql
-- 通过会话汇总 sceneId 8041/8042 的 metric KV
-- metric key = EP名（如 EP01），value = 停留毫秒
SELECT metric_key AS ep,
       AVG(CAST(metric_val AS BIGINT)) / 1000 AS avg_stay_sec,
       PERCENTILE(CAST(metric_val AS BIGINT), 0.5) / 1000 AS p50_stay_sec
FROM (
  SELECT EXPLODE(metric) AS (metric_key, metric_val)
  FROM scene_events
  WHERE scene_id IN (8041, 8042)
    AND dt = '${date}'
) t
GROUP BY ep
ORDER BY avg_stay_sec DESC
```

### 5.9 BE 结局分布

```sql
-- 哪个 BE 结局被撞最多次
SELECT dimension['beType'] AS be_type,
       COUNT(DISTINCT device_id) AS uv,
       COUNT(*) AS total_cnt
FROM events
WHERE event_name = 'be_reached'
  AND dt = '${date}'
GROUP BY be_type
ORDER BY total_cnt DESC
```

### 5.10 v90.1 关闭X按钮误触广告验证（修复后应为 0）

```sql
-- ⚠️ 此数应 = 0，若 > 0 说明 v90.1 hitZone 修复未生效
SELECT COUNT(*) AS close_x_ad_count
FROM events
WHERE event_name = 'btn_click_v2'
  AND dimension['btnId'] = 'btn_chapter_close'
  AND dimension['isAd'] = '1'
  AND dt >= '${start_date}'
```

---

## 六、广告来源追踪字段说明（v91.0）

v91.0 在所有涉及广告的事件（`btn_click_v2` / `ad_click` / `ad_result`）中新增 5 个维度字段：

| 字段 | 含义 | 示例值 |
|------|------|--------|
| `adSlot` | 广告位标识 | `choice_unlock` |
| `adScene` | 广告发生时所在页面 | `game_choice` |
| `adEp` | 广告发生时所在章节 | `EP03` |
| `adNodeId` | 触发广告的节点 ID | `s3_node_42` |
| `adNodeTitle` | 触发广告的节点文案前 16 字 | `"婉儿，你不能…"` |

**用途**：
- 可精确定位某 EP 哪个节点的广告点击率最高
- 可验证广告是否集中在剧情关键节点
- 可发现异常广告触发（如 `btn_chapter_close` 的 `isAd='1'` 应为 0）

---

## 七、调试开关

| 开关 | 默认值 | 说明 |
|------|--------|------|
| `TELEMETRY_ENABLED` | `true` | `false` = 全部静默 |
| `DEBUG_OVERLAY` | `false` | `true` = 屏幕左上角浮层实时显示（**上线态必须 false**） |
| `DEBUG_CONSOLE` | `false` | `true` = console.log 每条事件（**上线态必须 false**） |

**本地调试方式**：在控制台执行
```js
Telemetry.setDebugOverlay(true);   // 开启屏幕浮层
Telemetry.setEnabled(false);       // 临时关闭全部上报
```

---

## 八、v91.0 变更日志

| 变更点 | 说明 |
|--------|------|
| ★ 新增 `onPageExpose(pageName, opts)` API | 页面/状态切换时调用，上报 sceneId 8060 |
| ★ 新增 `onButtonClick(btnId, location, adInfo)` API | 所有按钮统一调用，上报 `btn_click_v2` |
| ★ 广告来源 5 维精确标记 | `adScene / adEp / adNodeId / adNodeTitle / adSlot` 随广告事件上报 |
| ★ `node_enter` 增加 `nodeTitle` + `sceneIdx` | 后台可直接看节点文案和第几幕 |
| `DEBOUNCE_MS` 从 1000ms 降至 300ms | 按钮事件需要更灵敏的响应 |
| 修复 v90.1 关闭X误触广告根因 | `main.js` hitZone 注册时增加视口边界校验（`ry >= contentTop && ry + rh <= contentBottom`） |

---

## 九、接入 Checklist

上线前确认：

- [ ] `DEBUG_OVERLAY = false`
- [ ] `DEBUG_CONSOLE = false`  
- [ ] `TELEMETRY_ENABLED = true`
- [ ] 快手小程序后台已注册全部 SceneID（8001-8047 + 8060 + 8061）
- [ ] 验证 SQL 5.10（`btn_chapter_close` + `isAd='1'` = 0）
- [ ] 验证 SQL 5.3 漏斗连续（8001 ≥ 8003 ≥ 8005 ≥ 8006）
