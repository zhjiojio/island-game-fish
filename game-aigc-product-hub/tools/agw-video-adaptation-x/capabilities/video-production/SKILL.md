---
name: video-production
description: Use when a 剧游 X project needs shot planning, keyframes, character-consistent video, lip sync, reviewed media candidates, or final multi-shot composition.
---

# Video Production

镜头是场景与媒体之间的结构层。维护当前项目 `drama_project.json` 的 `shots`、`media` 与 `<RUN_DIR>/assets/`，不把视频当作孤立文件。

## 生产路由

先完整读取 [references/artifact-contract.md](references/artifact-contract.md)，再只读取当前任务需要的 Recipe：

- 普通参考图转单镜头：[recipes/reference-to-video.md](recipes/reference-to-video.md)
- approved Anchor 人物节点视频：[recipes/character-node-video.md](recipes/character-node-video.md)
- 商品或实体跨镜一致性：[recipes/product-multishot-video.md](recipes/product-multishot-video.md)
- 数字人对白与口型：[recipes/digital-human-lipsync.md](recipes/digital-human-lipsync.md)
- 已审核片段最终合成：[recipes/multishot-final-compose.md](recipes/multishot-final-compose.md)

Recipe 调用 `<WORKFLOW_ROOT>/tools/` 下的原子能力。X 内的本 Skill、契约和 Recipe 是生产判断的唯一来源，不读取其他媒体 capability。

## 项目登记

- 镜头引用有效 `scene_id`，按场景维护顺序、动作、对白、时长、安全区与连续性。
- 人物镜头引用明确角色、Look Version 与 approved Anchor 版本。
- 候选产物先写 `.agw-x/staging/<task-id>/`；审核采用后移动到 `assets/` 并登记相对路径。
- 首帧通过构图、身份与安全区审核后才允许付费生成；视频完成后必须技术探测、抽帧和语义审片。
- 不静默切换 Provider，不覆盖 Master 或正式媒体，不把缓存与异步 job file 当作交付物。

完成或停止时返回已完成阶段、产物与证据路径、审核门状态和单一未解决问题；镜头变化只使实际依赖的媒体和组装绑定失效。
