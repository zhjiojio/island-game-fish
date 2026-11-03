# 剧游 X 结构化项目契约

## 权威目录

项目数据位于 `<RUN_DIR>/.agw-x/projects/<PROJECT_ID>/drama_project.json`。工作台和 Worker 必须读写这一份结构化 JSON，不得依赖 Markdown 标题解析来恢复项目状态。

| 字段 | 权威内容 | 主写入能力 |
|---|---|---|
| `name/status/current_workspace` | 项目标题、当前工作区和总体状态 | orchestrator |
| `chapters/scenes/choices` | 章节、场景流和玩家选择 | structured-story |
| `gameplay_nodes/gameplay_relations` | 玩法、规则、资源、状态、事件、反馈与关系 | gameplay-decomposition |
| `characters/relationships` | 人物、人物关系、版本、Anchor | character-assets |
| `shots/media` | 镜头、连续性、媒体与生成记录 | video-production |
| `components` | 玩法/UI 组件与剧情资产绑定 | game-assembly |
| `tasks` | 检查、阻断和生产任务 | orchestrator / game-release |

每个对象使用稳定的 `id`。跨域关系只保存 ID 和相对 `<RUN_DIR>` 的路径，不复制其他领域的完整对象。

## 关键关系

- `chapters[].scene_ids[] -> scenes[].id`
- `scenes[].character_ids[] -> characters[].id`
- `scenes[].next_scene_ids[] -> scenes[].id`
- `shots[].scene_id -> scenes[].id`
- `shots[].character_ids[] -> characters[].id`
- `shots[].media_ids[] -> media[].id`
- `gameplay_relations[].source_id/target_id -> chapters/scenes/choices/characters/gameplay_nodes 中的稳定 ID`
- `components[].bindings[] -> chapters/scenes/characters/shots/media 中的稳定 ID`

## 资产规则

人物 Master、approved Anchor 与正式媒体不可被候选覆盖。候选先进入 `.agw-x/staging/<task-id>/`，采用后移动到 `assets/characters/`、`assets/scenes/` 或 `assets/shots/`，再以相对路径登记。

## 下游失效

- 场景删除或跳转变化：相关镜头和组装绑定待检查。
- 人物身份或 approved Anchor 变化：引用该人物的镜头和媒体待同步。
- 镜头构图或时长变化：对应媒体与场景时间线待同步。
- 正式媒体路径变化：组装绑定和构建检查失效。
- 组件结构变化：重新检查剧情连通性与构建，不回写故事内容。

修改数据时保持 JSON 合法，更新领域根节点 `updatedAt`，并尽量局部修改相关实体。
