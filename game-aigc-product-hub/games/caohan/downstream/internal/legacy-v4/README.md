# 逃婚糙汉 · 工程内容交付

入口：`game-config.json`。沿用工程样例的扁平 `nodes` / `components` 结构，增加下述已确认的剧情状态协议 `caohan-story-state/1.0`。**工程必须实现这些扩展后才能正确运行条件分支；目前未在实际快小游戏运行时联调。**

最外层仅保留工程必需的 `game-config.json` 和本说明。`internal/` 为内容侧维护资料，通常无需交付工程。

## 交付范围

- 69 个视频节点：55 条主剧情分支视频 + 14 条结局视频（4 正式、4 反转、4 荒诞、2 隐藏）。视频均为有声成片，URL 来自实际 CDN 上传回执。
- 原剧本 124 个节点中，11 个 choice 和 44 个 ad_gate 合并为前驱视频播完后的组件；不删除它们的选择、文案、广告门或跳转语义。
- `internal/source-node-map.json`：下游节点、源视频及被合并节点的对应关系。
- `internal/media-cdn-manifest.json`：69 条视频的 URL、实际时长、字节数、SHA-256 和来源位置。`internal/reports/cdn-verification.json` 为远端整文件校验和 Range 请求结果。
- `internal/game-config.template.json` 保留工程原始样例，供对照，不能作为本剧内容配置。
- `../output/逃婚后我花千万雇了工地糙汉.v4.json` 为原始完整剧本；本次未改动。

## 本次声音修订

当前素材版本为 `audio-repair-v1`（配置版本 2.4.1）：69 条视频均已更新声音。角色对白和画外音分开制作，镜头、动作、表情说明不再作为台词朗读。62 条保留原视频画面流，7 条修正局部嘴型或对白镜头；原始成片另行保留。

`internal/sound-production/sound-script-v1.json` / `.md` 是内容侧声音制作表，工程只需播放配置中的成片 URL，无需再合成语音或读取此表。原 v4 剧本保留作剧情来源，其中旧旁白字段不能直接当作配音输入。选项文案、剧情跳转和状态协议没有改动。

## 分工与工程待接项

内容侧负责剧本、分支规则、成片、CDN URL、映射及校验报告。工程负责 UI 排版、条件与状态执行、存档、结局收集界面、广告 SDK、视频加载缓存、快小游戏配置与上线。

`theme` 和首页热点暂沿用样例布局参数，工程可调整。`homepage.image`、`homepage.bgm` 为 null，表示未提供首页图片/背景音乐。工程应容忍空值或补齐资源。所有广告 ID 为 null，**必须配置真实广告位**；不能因广告位缺失而免费放行。组件的 `adId: null` 表示使用顶层 `adConfig.rewardedAdId`，此继承规则属于本交付协议。

## 新增协议与执行顺序

### 1. 初始状态与保存

顶层 `initialState` 包含 `variables`（字符串值字典）、`flags`（集合，初始含 `kept_milk_cup`）、`endingTags`（集合）。不要把字符串选择变量当作原样例 `value` 的数值加减；本剧 `valueDefinitions` 为空，组件 `value` 为 null。

存档应原子保存当前 nodeId、视频进度/已结束状态、上述三项剧情状态，以及已领取的结局集合。继续游戏恢复同一状态，不能重新初始化 flags。`restart`/`new_game` 重置本轮剧情到 initialState 和 entryNodeId，保留已收集结局与独立的广告解锁记录（由工程实现 enableUnlockPersistence，按稳定 componentId 保存）。历史广告解锁不能绕过当前轮的 condition。

### 2. 选项条件

组件 `condition: null` 表示无条件；`condition: {"flag":"ep01_emotion"}` 表示 flags 中必须含该标记。条件不满足时保留选项位置、显示 `lockedCopy`，禁止点击、播放广告、修改状态或跳转；条件必须在点击时再次检查。

### 3. 选择生效

组件新增 `changes`，直接保留源剧本语义：

```json
{
  "set": {"ep01_openingChoice": "counterattack"},
  "importantFlag": {"id": "ep01_counterattack", "label": "公开反击"},
  "addEndingTags": ["rebellion", "chaos"]
}
```

`set` 覆盖对应变量；`importantFlag.id` 加入 flags，label 为展示元数据；`addEndingTags` 并入集合，均应去重。

执行顺序：校验条件 → 普通选项确认或广告成功 → 原子应用 changes 并保存目标节点 → 跳转 nextNodeId。对重复点击及广告重复回调做一次性处理。播放失败时应能在目标节点重试，不要重复提交选择。

### 4. 广告失败与解锁

`unlockType: "ad"` 继续沿用样例含义。`adConfig.failureBehavior: "stay"` 是新增明确约定：取消、播放失败或广告位缺失时，保持当前已结束视频和选项面板，不应用 changes，不跳转，也不写入成功解锁记录。`failNextNodeId: null` 不代表成功放行，也不代表返回首页。

11 个反击选项使用激励广告，44 个互斥分支末尾还有继续广告；选择反击后可能连续经过两个独立广告门，这是原 v4 规则。不要自动合并。若已按持久化策略成功解锁对应 componentId，可走同一成功提交逻辑，但仍检查剧情条件。

### 5. 时序与成片音轨

所有交互组件 `showTime: null`，表示等待实际媒体 ended 事件；`endTime: null` 表示持续到节点切换。`video.duration` 是成片实际秒数，不能用旧剧本秒数触发选项。原 choice 的 4 秒未定义超时默认选项，本交付不添加倒计时自动选择。

成片已内置修订后的对白、画外音和环境音，muted=false；不要另行播放同一段配音，也不要把未对齐的原镜头字幕时序强行覆盖到成片。仅入口视频 preload=true；不要启动时下载全部约 538 MiB 视频。

### 6. 结局收集

结局节点 `sceneType: "end"`；新增 `ending` 保留 id、category、unlock、description、closing、achievement 等信息。`unlock.requiredFlags` 和 `unlock.requiredEndingTags` 都按“全部满足”检查，空数组为真。直接输入结局 nodeId 不能跳过检查；非法进入时拒绝播放并恢复有效存档/入口，不解锁结局。

本交付约定在结局视频完整播放后记录一次 ending.id 和 achievement，展示结果组件。顶层 `endings` / `achievements` 提供收集目录；不会自动生成收集 UI。若从已经结束的结局存档恢复，不必重复播放才能展示已领取状态。

## 复现与验证

在本目录执行：

```sh
python internal/tools/convert.py
python internal/tools/test_config.py
python internal/tools/verify_delivery.py
```

convert 使用本地原剧本、素材清单和真实上传回执重建配置，不会重新上传。verify_delivery 会下载全量 69 条视频进行 SHA-256 比对，并验证 HTTP Range（会产生约 538 MiB 下载流量），同时遍历条件状态检查全部结局可达。

上传辅助脚本 `internal/tools/upload.cjs` 调用 workflow 的 `skills/agw-self-test/cdn/cdn-upload.js`，从本机任务配置读取 Token，不把它写入 OS 命令行参数或交付 JSON。`internal/.cdn-stage` 是上传副本，原始 materials 保留。常规工程交付只需最外层的 game-config.json 和 README.md；内部清单、映射与报告可在排查时按需补充。

CDN 路径使用任务 appId `ks867658648250668260` 和带内容哈希的文件名，回执保存于 `internal/reports/cdn-upload-receipt.json`。这是素材存储路径，不替代工程正式 game.json 的 appId 配置；发布前由工程检查其域名、广告位及平台资源加载配置。
