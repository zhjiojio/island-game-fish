---
name: structured-story
description: Use when a 剧游 X project needs chapters, scenes, branches, choices, character relationships, story variables, or narrative flow changed.
---

# Structured Story

把故事维护为可视化和可计算的结构，不把长篇 Markdown 当作主模型。

只写当前项目 `drama_project.json` 的 `chapters`、`scenes`、`choices` 和叙事关系，必要时把人物缺口作为建议返回，不直接创建正式人物资产。

- `chapters` 组织章节树并通过 `sceneIds` 排序。
- `scenes` 保存场景摘要、参与人物、选择和后继场景。
- `choices` 保存来源场景、条件、效果和目标场景。
- `relationships` 保存人物之间在叙事中的关系和变化。
- `variables` 保存可被选择与玩法读取的状态。

修改后检查入口存在、所有引用可解析、场景从入口可达。删除或改 ID 前报告受影响的镜头与组装绑定。
