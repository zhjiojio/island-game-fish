# caohan

《逃婚后我花千万雇了工地糙汉》的 `story2game` 中档生产样例。

## 目录

- `input/逃婚糙汉 (1).txt`：原始剧本输入。
- `output/逃婚后我花千万雇了工地糙汉.v4.json`：可被互动影游工作台或游戏前端消费的 v3 视频—分镜 JSON。
- `output/artifacts/`：7 个顺序 Agent 生成的过程产物，包括原作索引、风格锚点、留存与变现蓝图、分支拓扑、状态与结局设计、互动分镜剧本和校验报告。

## 样例规模

- 5 章 / 11 集
- 124 个剧情节点
- 55 条视频 / 131 个分镜 / 357 秒
- 11 个四选一决策 / 44 个独立广告门 / 11 个激励广告选项
- 14 个结局：4 正式、4 反转、4 荒诞、2 隐藏

## 在线查看

- [公开剧本台](https://end2x-story-workbench.pages.dev/zh-CN/script-desk/)：导入 output 下的 v4 JSON 后，可按视频节点查看节点内全部分镜。
- [Kim 故事文档](https://docs.corp.kuaishou.com/k/home/VPfQI_Nn9X-g/fcABt8DjsJFNkGT56bTwRsPSd)：按集、选择和结局阅读的故事全览。

## 工程交付与素材存储

- `downstream/game-config.json` 与 `downstream/README.md` 是工程接入入口；其他清单、映射、工具及报告集中在 `downstream/internal/`。
- 成片已完成 55 条剧情视频和 14 条结局视频，全部使用 CDN URL 交付；原样例规模中的秒数为剧本计划值，实际成片时长见 CDN 清单。
- Git 保留剧本、配置、人物参考图和文本审核记录。视频、分段、首帧、审核截图/音频、生成请求及上传缓存保留本地，不重复进入 Git；成片地址与 SHA-256 见 `downstream/internal/media-cdn-manifest.json`。
