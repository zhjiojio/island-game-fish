> 后续配置已按 game-config(4).json 更新，当前适配说明见 ../template4/README.md；本目录保留 v5 媒体和旧版导出证据。

# v5 下游交付记录

正式交付文件在 ../../game-config.json，符合 refer/game-config(3).json 的 2.4.0 扁平节点与组件格式。78 个播放节点引用 69 条新版原生音画视频，14 个结局全部保留。9 个额外节点是条件路径变体，共用对应视频 URL。

所有视频、封面、首尾帧均为真实 CDN 地址；207 个资源已完整 GET 并与本地 SHA-256 比对。69 条视频使用 v5 重制音轨，未复用 v4 CDN 视频。实际时长从成片读取。

## 对工程的语义说明

- 配置只使用最新样例字段，没有 condition、changes、initialState 或自定义 ending 运行时扩展。条件已编译为路径，存档需保存实际 nodeId（包括 __v2 后缀），不能自行折叠变体 ID。
- 条件不满足的选项展示为 text2 锁定说明，不含点击跳转；条件满足则为 button1。UI 由工程安排。
- 选择/续播提示在媒体结束后显示，showTime/endTime=null。原选项正文不删改，广告使用图标和标题；续播不再显示旧旁白、镜头说明。
- 激励广告成功进入 nextNodeId；失败回同一状态节点，可能重播当前视频。没有采用样例未定义的 failureBehavior。工程如支持原地停留可进一步明确契约。
- 结局使用 sceneType=end，重新开始使用 unlockType=restart。样例未定义的成就、跨周目收藏与变量展示不假定已实现；完整权威数据保存在 story.v5.json，工程需要这些能力时再扩展协议。
- 广告位 ID 留空，由工程填真实值；未运行工程引擎或快小游真机，不表示已上线。

## 内部文件

media-cdn-manifest.json 为新媒体与 URL 对应；source-node-map.json 对照播放变体与权威剧情；reports/ 保存结构、状态图、CDN 和交付证据。旧版文件归档到 ../legacy-v4/，更早备份在 ../history/。生产源文件未修改。

重新导出使用 workflow skill 的 scripts/export_downstream.py；不得使用旧版 legacy-v4/tools/convert.py 覆盖当前配置。
