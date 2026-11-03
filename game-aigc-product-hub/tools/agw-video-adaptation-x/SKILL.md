---
name: agw-video-adaptation-x
description: Use when creating or continuing a character-driven interactive drama in the local 幕间 Studio workbench, including structured story, gameplay decomposition, character assets, video production, game assembly, and release work. 触发词：剧游 X、剧游工作台、本地剧游工作台、网页制作剧游。
---

# AGW 剧游 X

以幕间 Studio 的项目制专业工作区为入口，以结构化项目数据为权威内容。AI 不是独立阶段或聊天助手；剧本、人物、视频、组装等明确动作按需调用对应领域能力。

## 启动

`<SKILL_DIR>` 是本文件所在目录，`<RUN_DIR>` 是用户的剧游项目目录：

```bash
node "<SKILL_DIR>/scripts/start-workbench.mjs" --run-dir "<RUN_DIR>"
```

保持进程运行并把本地 URL 告诉用户。同一项目只允许一个写任务运行；任务进度显示在触发它的工作区与生成记录中。

## 项目主数据

先完整读取 [references/project-contract.md](references/project-contract.md)。每个项目的权威数据位于 `<RUN_DIR>/.agw-x/projects/<PROJECT_ID>/drama_project.json`。章节、场景、选择、人物关系、玩法关系、人物资产、镜头、媒体与组件是同一项目图谱中的不同实体集合，由工作台投影为不同图谱视图。

Markdown 可以作为导入源或导出物，但不是权威项目状态。

## 能力路由

- 跨域协调：[capabilities/game-workbench-orchestrator/SKILL.md](capabilities/game-workbench-orchestrator/SKILL.md)
- 剧本：[capabilities/structured-story/SKILL.md](capabilities/structured-story/SKILL.md)
- 玩法拆解：[capabilities/gameplay-decomposition/SKILL.md](capabilities/gameplay-decomposition/SKILL.md)
- 人物：[capabilities/character-assets/SKILL.md](capabilities/character-assets/SKILL.md)
- 镜头与视频：[capabilities/video-production/SKILL.md](capabilities/video-production/SKILL.md)
- 游戏组装：[capabilities/game-assembly/SKILL.md](capabilities/game-assembly/SKILL.md)
- 构建发布：[capabilities/game-release/SKILL.md](capabilities/game-release/SKILL.md)

每个能力只修改 `drama_project.json` 中自己的实体集合，通过稳定 ID 表达跨域引用。工作台负责图谱呈现、专业动作与任务状态，不提供独立 AI 助手。

## 权限边界

- 结构调整、文案修改和未采用候选可直接执行。
- 付费媒体、批量生成、替换正式 Anchor 或正式媒体，执行前确认。
- 构建、上传、提审、发布和外部消息必须获得当次明确授权。
- 新媒体先进入 `.agw-x/staging/<task-id>/`；正式采用后登记到 `media.json` 并移动至 `assets/`。

任务完成时返回：调用能力、变更实体、候选或正式产物、下游影响、审批状态和下一步。
