# AIGC Product Minigame Hub

`aigc-product-minigame-hub` 是用于集中存放和维护 AIGC 产品相关小游戏的仓库。仓库面向多游戏并行孵化与交付场景，每个游戏以独立目录承载完整的流程状态、阶段产出物、游戏代码与素材，方便按游戏维度进行创意沉淀、玩法设计、开发实现和后续维护。

## 仓库定位

本仓库主要用于：

- 存放多款小游戏的流程文档、代码与素材；
- 以游戏为单位管理从创意到实现的完整产出；
- 统一约束小游戏目录结构、命名方式和协作规范；
- 支持后续按单个游戏独立开发、调试、构建和发布。

## 推荐目录结构

仓库按照“一个游戏一个目录”的方式组织，推荐结构如下：

```text
game-aigc-product-hub/
└── games/
    └── <appID>/            # 每个游戏一个目录，目录名为游戏 AppID
        ├── workflow-run.yml    # 该游戏的流程状态（建议加入 .gitignore）
        ├── docs/               # 各阶段产出物
        │   ├── idea-raw.md     # 原始创意记录
        │   ├── idea.md         # 结构化创意说明
        │   ├── gameplay.md     # 玩法设计
        │   ├── ui-design.md    # UI / 视觉设计
        │   └── ...             # 其他阶段文档
        └── package/            # 游戏代码与素材
```

> 当前仓库处于初始化阶段，实际目录可随着游戏接入逐步补齐。

## 游戏目录说明

每个游戏都应放在 `games/<AppID>/` 下，其中 `<AppID>` 为该游戏在快手小游戏平台的 AppID，例如 `ks651896049489522351`。

- 目录名与 AppID 保持一致，便于与平台数据对应；
- AppID 由平台分配，具有全局唯一性；
- 不与已有游戏目录重名。

单个游戏目录建议包含以下内容：

### `workflow-run.yml`

用于记录该游戏的流程状态，例如当前所处阶段、已完成节点、待处理任务等。

建议：

- 该文件通常属于本地流程运行状态；
- 如不需要多人共享，建议加入 `.gitignore`；
- 如需要团队协作同步流程状态，可根据项目实际情况决定是否提交。

### `docs/`

用于存放游戏从创意到实现过程中的阶段产出物。推荐包括：

```text
docs/
├── idea-raw.md     # 原始想法、灵感、用户输入、非结构化记录
├── idea.md         # 整理后的游戏创意说明
├── gameplay.md     # 核心玩法、规则、胜负条件、成长机制
├── ui-design.md    # 页面结构、视觉风格、交互说明
└── ...             # 技术方案、测试记录、发布说明等其他文档
```

文档内容可按游戏复杂度增减，不强制所有游戏保持完全一致，但核心阶段产出建议尽量沉淀，便于后续回溯和复用。

### `package/`

用于存放游戏代码与素材，是单个游戏的实际工程目录。

根据游戏技术栈不同，`package/` 内部结构可灵活组织，例如：

```text
package/
├── src/            # 游戏源码
├── assets/         # 图片、音频、字体等静态资源
├── config/         # 游戏配置、平台配置、环境配置
├── scripts/        # 构建、发布、资源处理等脚本
└── package.json    # 如该游戏为前端工程，可独立维护依赖
```

如某个游戏不需要完整前端工程，也可以根据实际情况只保留必要代码和资源。

## 新游戏接入流程

新增游戏时，建议按以下步骤创建目录：

```text
games/<AppID>/
├── workflow-run.yml
├── docs/
│   ├── idea-raw.md
│   ├── idea.md
│   ├── gameplay.md
│   └── ui-design.md
└── package/
```

推荐流程：

1. 在 `games/` 下以 AppID 为名创建新目录；
2. 将原始创意记录到 `docs/idea-raw.md`；
3. 将整理后的创意说明写入 `docs/idea.md`；
4. 将玩法规则、关卡机制、操作方式等写入 `docs/gameplay.md`；
5. 将页面结构、视觉风格和交互说明写入 `docs/ui-design.md`；
6. 在 `package/` 中放置游戏代码、素材和构建配置；
7. 根据需要维护 `workflow-run.yml`，记录当前游戏流程状态。

## 开发流程

推荐开发流程如下：

1. 从 `dev` 拉取最新代码；
2. 基于游戏名称或需求创建功能分支；
3. 在对应 `games/<AppID>/docs/` 中补充或更新阶段文档；
4. 在对应 `games/<AppID>/package/` 中开发游戏代码；
5. 自测游戏运行、构建和关键玩法链路；
6. 提交 Merge Request 前确认文档与代码同步更新。

示例：

```bash
git checkout dev
git pull origin dev
git checkout -b feature/<AppID>-<feature-desc>
```

## 提交规范

建议提交信息使用清晰的前缀，便于识别变更类型：

```text
feat: 新增游戏或玩法功能
fix: 修复问题
refactor: 重构代码
docs: 更新文档
style: 样式或格式调整
chore: 构建、依赖、工具等杂项变更
```

示例：

```text
feat: add bubble-pop game prototype
docs: add bubble-pop gameplay design
fix: repair magic-runner collision logic
```

## 文档管理建议

游戏文档统一放在 `games/<AppID>/docs/` 下，建议遵循以下规则：

- `idea-raw.md` 保留原始想法和非结构化输入，不必过度整理；
- `idea.md` 记录整理后的游戏主题、目标用户、核心卖点；
- `gameplay.md` 记录核心玩法、操作方式、规则、反馈和结算；
- `ui-design.md` 记录页面、视觉、动效和交互设计；
- 其他阶段文档可按需新增，例如 `tech-design.md`、`test-report.md`、`release.md`。

当游戏创意、玩法、UI 或技术实现发生明显变化时，请同步更新对应文档。

## 代码与素材管理建议

游戏代码与素材统一放在 `games/<AppID>/package/` 下，建议遵循以下规则：

- 单个游戏私有资源放在该游戏的 `package/assets/` 中；
- 游戏源码、配置、脚本应尽量保持目录清晰；
- 资源文件命名保持语义化，例如 `player-idle.png`、`bg-home.jpg`；
- 避免提交无用的大体积临时文件；
- 如资源较大，建议在对应游戏文档中说明来源、用途和压缩策略。

## 流程状态文件说明

`workflow-run.yml` 用于记录单个游戏的流程运行状态，通常包含当前阶段、任务进度或自动化流程上下文。

建议将该类运行态文件加入 `.gitignore`，例如：

```gitignore
games/*/workflow-run.yml
```

如果某些游戏需要共享流程状态，可由团队约定是否提交该文件。

## 当前状态

仓库处于初始化阶段，后续会逐步接入具体小游戏、阶段文档、游戏代码与素材。