---
name: gameplay-decomposition
description: Use when a 剧游 X project needs narrative choices converted into gameplay mechanics, rules, resources, states, events, feedback, or a gameplay relationship graph before assembly.
---

# Gameplay Decomposition

把剧本中的可交互意图拆成可视化、可计算的玩法关系，不在这里实现 UI 或构建游戏。

维护当前 `drama_project.json` 的 `gameplay_nodes` 与 `gameplay_relations`：

- 节点类型限定为 `mechanic`、`rule`、`resource`、`state`、`event`、`feedback`。
- 每个节点使用稳定 `id`，说明玩家动词、输入、状态变化与可观察反馈。
- 关系通过稳定 ID 连接场景、选择、人物或其他玩法节点，不复制上游实体。
- 从剧本推导不等于擅自扩写；缺少胜负、资源来源或反馈时登记缺口。
- 剧本变化时只标记受影响的玩法节点；已绑定的游戏组件由组装能力检查。

完成后检查：所有关系端点存在、每个玩法有玩家动作、状态变化有反馈、失败与退出路径可达。把实现需求交给 `game-assembly`，不直接写 `<RUN_DIR>/game/`。
