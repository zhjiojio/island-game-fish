# 互动视频分镜创作交接

- 剧集：11
- 互动节点：124
- scene：55
- videos：55
- shots：131
- choice：11
- 独立 ad_gate：44
- 选项广告：11
- 结局：14
- 格式：`storyFormatVersion: 3` / `interactive-video-shot-story`
- 每个 scene 含可独立生产的 videos；每个视频不超过 10 秒、含 1–3 个连续 shots，并在视频层承载 renderMode、口型需求、连续性与 assetRefs。

inputs_used: 01–05 阶段产物、原始 TXT、json-format-spec.md
outputs_created: 06-interactive-shot-script.md、逃婚后我花千万雇了工地糙汉.v4.json
assumptions: 未生成媒体时视频 assetRefs 保持空数组
open_issues: 资产生成后需回填视频 assetRefs
status: PASS
