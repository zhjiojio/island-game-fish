# 媒体产物契约

## 路径

调用方为每次执行提供输入与输出绝对路径。Recipe 不猜测运行目录，也不把产物写回 capability 源目录。推荐布局：

```text
<RUN_DIR>/
├── .cache/media-jobs/
└── package/assets/
    ├── anchors/
    ├── keyframes/
    ├── video/
    ├── audio/
    ├── subtitles/
    └── review/
```

`.cache/media-jobs/` 只保存异步任务恢复信息，不可交付，也不得作为项目状态权威来源。

## 状态与审核

调用方维护项目状态、审核状态和失效传播。Recipe 只报告当前阶段、产物路径、审核证据路径，以及单一未解决问题；不得创建统一 manifest、production profile 或新的项目状态机。

技术检查不能自动批准角色身份、商品一致性、剧情语义或构图。Recipe 定义审核门，Media Director 或其指定审查者做出结论。

## 交接

完成或停止时只向调用方交接：

- 已完成阶段；
- 最终或中间产物绝对路径；
- 审核帧、探测结果等证据路径；
- 当前审核门结果；
- 单一未解决问题（如有）。

不得记录 API 响应、轮询日志、凭据、密钥、完整 cache 内容或无关调试过程。原始 Master 和输入素材保持只读；派生文件只写入显式输出路径。
