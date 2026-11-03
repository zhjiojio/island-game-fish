# product-optimization · AIGC 小游戏生产流程固化

云端权威版本。本目录承载 AIGC 小游戏（快手小游戏）本地生产流程的**四层强制约束**基础设施，供团队成员一键同步到本地 `~/.codeflicker/`。

## 架构分层

```
┌─────────────────────────────────────────────────────┐
│ L0  触发探测层 (UserPromptSubmit Hook)              │  detect-context.js
├─────────────────────────────────────────────────────┤
│ L1  强制入口层 (aigc-minigame-orchestrator Subagent)│  agents/aigc-minigame-orchestrator.md
├─────────────────────────────────────────────────────┤
│ L2  知识加载层 (agw-work-mode + 项目 skill)          │  依赖 skill 生态，见 skills-manifest/
├─────────────────────────────────────────────────────┤
│ L3  执行守门层 (PreToolUse / PostToolUse Hooks)     │  enforce-orchestrator.js / skill-sync.js / mark-orchestrator-ran.js
├─────────────────────────────────────────────────────┤
│ L4  云端一致性层 (SessionStart Hook + skill-sync)   │  hub-repo-init.js / session-start-check.js
└─────────────────────────────────────────────────────┘
```

## 目录结构

```
product-optimization/
├── config/
│   └── aigc-minigame-registry.json    # AppID ↔ Skill 映射（权威）
├── agents/
│   └── aigc-minigame-orchestrator.md  # 薄编排 Subagent（模式 B）
├── hooks/
│   ├── detect-context.js              # L0 · UserPromptSubmit 探测
│   ├── enforce-orchestrator.js        # L3 · PreToolUse 守门
│   ├── mark-orchestrator-ran.js       # L3 · PostToolUse 标记
│   ├── skill-sync.js                  # L4 · Skill 变更自动 push
│   ├── hub-repo-init.js               # L4 · 会话启动时检查/自动 clone Hub 仓库
│   └── session-start-check.js         # L4 · 会话启动 fetch/pull
├── skills-manifest/
│   └── (预留：项目 skill 清单和版本快照)
├── docs/
│   └── (预留：设计文档、复盘)
├── install.sh                          # 一键安装到本地
├── settings-snippet.json              # settings.json hook 片段模板
└── README.md
```

## 五项决策记录（决策已定，改动需 PR）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | Skill 仓库位置 | 复用本仓库 `product-optimization/` 目录，无需新建 GitLab repo |
| 2 | AppID registry 归属 | 跟着 agw-work-mode skill 走，权威副本在 `config/aigc-minigame-registry.json` |
| 3 | 未注册 AppID 行为 | 游客模式（只加载 agw-work-mode 继续） |
| 4 | Skill dirty 时 build | **严格阻断**，Skill 未同步禁止 ksmg upload / git push |
| 5 | orchestrator 厚薄 | **模式 B（薄编排）** · 只做守门+调度，不做执行 |

## Hub 仓库初始化

插件在每次会话启动时（典型场景：用户进入 `/agw-work-mode`）通过 `hooks/hub-repo-init.js` 自动检查本 Hub 仓库是否已拉取到本地：

1. 检查 `~/work/minigame/game-aigc-product-hub` 是否存在（以 `.git` 目录为依据）
2. 不存在 → 自动执行
   ```bash
   git clone git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git \
     ~/work/minigame/game-aigc-product-hub
   ```
3. clone 成功 → 会话正常开始；已存在 → 静默跳过，不打扰会话
4. 自动 clone 失败（如未配置 SSH key）→ 输出警告，提示手动执行上面的 `git clone` 命令，**不阻断会话**

该 hook 与 `session-start-check.js`（检查 `~/.codeflicker/skills` 是否 up-to-date）同属 L4 云端一致性层，均注册在 `settings-snippet.json` 的 `SessionStart` 下，由 `install.sh` 一并同步到本地。

## 团队成员一键安装

```bash
cd ~/work/minigame/game-aigc-product-hub && git pull
bash product-optimization/install.sh
```

`install.sh` 会：
1. 把 `config/`、`agents/`、`hooks/` 分别复制/软链到本地 `~/.codeflicker/` 对应位置
2. 合并 `settings-snippet.json` 到本地 `~/.codeflicker/settings.json`
3. 首次运行 orchestrator 自检

## 修改约定

- 任何人本地改了 registry/agent/hook，必须 PR 回本目录，由维护者合入 dev 分支。
- CodeFlicker/MyFlicker 的 `skill-sync.js` hook 会自动 push 本地 skill 变更到关联的远端；本目录变更走 **人工 PR**，不自动 push。

## 触发词一览（同步自 registry.trigger_keywords）

`AIGC 小游戏` / `aigc 小游戏` / `快手小游戏` / `小游戏` / `剧游` / `老铁眼真尖` / `老铁找茬王` / `找茬王` / `提艾默` / `tiaimo` / `店长争夺战` / `未婚妻` / `荒年开局` / `婉儿` / `ksmg upload` / `ksmg preview` / `agw-start` / `agw-work-mode` / `agw-video-adaptation`
