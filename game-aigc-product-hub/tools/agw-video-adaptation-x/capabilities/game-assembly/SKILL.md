---
name: game-assembly
description: Use when a 剧游 X project needs gameplay components, UI components, story bindings, asset bindings, interaction rules, or a playable game package.
---

# Game Assembly

组装层消费故事、人物、镜头和媒体的稳定 ID，把内容变成可试玩交互，不反向改写创作源数据。

维护当前项目 `drama_project.json#components` 与 `<RUN_DIR>/game/`。区分玩法组件与 UI 组件；组件登记输入、状态、事件和绑定。发现缺失内容时返回上游缺口，不伪造正式资产。

构建属于有影响动作，执行前确认。修改后检查入口场景、选择跳转、资源路径和组件引用。
