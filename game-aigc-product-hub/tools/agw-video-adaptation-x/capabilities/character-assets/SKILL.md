---
name: character-assets
description: Use when a 剧游 X project needs character entities, visual identity, relationships, appearance versions, anchors, or character asset candidates.
---

# Character Assets

人物是独立资产实体，不是剧本中的一段描述。维护当前项目 `drama_project.json` 的 `characters`、`relationships` 和人物资产目录。

- 每个人物至少包含稳定 `id`、名称、叙事定位、视觉设定、版本与 Anchor 状态。
- Master 记录长期不变的身份与外形约束。
- Look Version 记录服装、年龄阶段或剧情时期。
- Candidate 在采用前不得成为 approved Anchor。
- approved Anchor 变化时，只标记实际引用旧版本的镜头和媒体。

生成图片可能产生费用时先等待确认；生成结果先写 `.agw-x/staging/<task-id>/`。
