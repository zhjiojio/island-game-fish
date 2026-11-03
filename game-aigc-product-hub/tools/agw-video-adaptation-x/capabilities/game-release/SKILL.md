---
name: game-release
description: Use when a 剧游 X project needs build readiness checks, build records, package validation, upload, review submission, or release status changes.
---

# Game Release

维护当前项目 `drama_project.json#tasks` 中的检查与构建记录。只读检查可以直接进行；构建、上传、提审、发布和外部通知必须获得本次明确授权。

检查结构化引用、缺失资产、入口连通性、组件绑定、包体和目标平台约束。每次构建记录输入版本、输出路径、检查结果与时间，不把失败构建标记为可发布。
