# 老铁眼真尖 · 项目 Skill

> **这是一个跟随代码仓库分发的 skill**。位置：`games/ks658651445853447417/skill/`
>
> **⚠️ 铁律：`git pull` / `git clone` 后每人必须先跑一次 `bash skill/hooks/install.sh` 才能提交代码。**

---

## 这是什么？

「老铁眼真尖」（AppID `ks658651445853447417`）项目的**上线守门 + 新增关卡工作流** skill。
把过去踩过的 12 类翻车整合成 3 层强校验，用脚本卡死红线，不再靠人肉记忆。

## 为什么必须同步安装？

skill 存在于 `games/ks658651445853447417/skill/`，跟着 git 分发到每个人本机。
但 **git 不会自动帮你把 `pre-commit.sh` 软链到 `.git/hooks/pre-commit`** —— 必须手动跑一次 `install.sh` 才能生效。

**不安装 = pre-commit hook 不生效 = 有人会用英文 tag / 敏感词 / 漏改 4 结构 → 咆哮**。

---

## 一次性安装（每人 clone 后必做一次）

```bash
cd $(git rev-parse --show-toplevel)/games/ks658651445853447417
bash skill/hooks/install.sh
```

安装脚本会做 3 件事：

1. 把 `skill/hooks/pre-commit.sh` 软链到仓库根 `.git/hooks/pre-commit`（如果已有 pre-commit 会自动备份）
2. 授予所有 `skill/scripts/*.sh` 和 `skill/hooks/*.sh` 可执行权限
3. 跑一遍 `laotie-check.sh --skip-cdn` 自检，展示当前项目健康度

**输出示例**：
```
════ 老铁眼真尖 Skill 本地安装 ════
✓ pre-commit hook 已软链到 .git/hooks/pre-commit
✓ 所有 skill/scripts + skill/hooks 已授可执行权限
...（12 项自检 + 汇总）...
════ 安装完成 ════
```

---

## 日常使用

### 1. `git commit` 时自动触发（Level 1 · 秒级）
每次 `git commit`（凡是改了 `games/ks658651445853447417/` 下的文件）都会自动跑 `laotie-check.sh --quiet --skip-cdn`。
挂了直接拒绝提交。绕过：`git commit --no-verify`（**强烈不推荐**）。

### 2. 手动全量校验（Level 2 · 12 项含 CDN）
```bash
bash games/ks658651445853447417/skill/scripts/laotie-check.sh
```
或跳过 CDN 检查（离线环境）：
```bash
bash games/ks658651445853447417/skill/scripts/laotie-check.sh --skip-cdn
```

### 3. 上线时前置门禁（Level 2.5 · 强绑校验 + git 提醒）
```bash
# 替代直接调 ksmg-preview.sh
bash games/ks658651445853447417/skill/scripts/ksmg-preview-guarded.sh \
     upload ./package "1.0.97" "changelog message"
```
- 校验不通过 → 拒绝调 upload
- upload 成功 → 主动打印 `git add / commit / push` 命令，防忘

---

## 12 项校验清单

| # | 项 | 用途 |
|---|---|---|
| 1 | 中文 tag 零容忍 | 禁 `tag:'led_off'` 之类英文 |
| 2 | 敏感词库 | 供销社/洗浴中心/国营/春运 |
| 3 | 标题长度 ≤ 8 字 | 编辑器 UI 溢出防线 |
| 4 | hint 数字 ⇔ odds 数组长度 | 防"缺茬"（hint 说 7 处但只有 6 项）|
| 5 | idx 唯一性 + 主题跳号警告 | 防"下一关"断链踢回菜单 |
| 6 | 版本号三件套 | `M3.BUILD_VER` / `[MARKER vNN]` / `index.html ?v=` 统一 |
| 7 | AppID 一致性 | 目录名 = `project.config.json.appid` |
| 8 | editor dist/ 无 real-scenes | 防 frontend-cloud 50MB 拒收 |
| 9 | editor PROP_META 覆盖 | levels 每个 prop_id 都在 editor-legacy.js 有中文映射 |
| 10 | CDN 场景图 HTTP 200 | 每张 hidden/s2/s3 图 curl HEAD |
| 11 | git 状态 | 提示 ksmg upload 后必须 commit+push |
| 12 | levels.js PROPS 表覆盖 | 防 UI 显示 undefined |

---

## 目录结构

```
games/ks658651445853447417/skill/
├── SKILL.md               ← 详细工作流与铁律（读这个）
├── README.md              ← 本文件（安装说明）
├── scripts/
│   ├── laotie-check.sh          ← 12 项主校验器（Level 2）
│   └── ksmg-preview-guarded.sh  ← 上线前置门禁（Level 2.5）
└── hooks/
    ├── pre-commit.sh      ← Git pre-commit hook（Level 1）
    └── install.sh         ← 一键安装脚本
```

---

## FAQ

**Q1：我改的是别的 AppID 目录，也会触发校验吗？**
不会。pre-commit hook 只在你 stage 的文件里包含 `games/ks658651445853447417/` 才触发。

**Q2：跳过校验会怎样？**
`git commit --no-verify` 能绕过 pre-commit。但上线时 `ksmg-preview-guarded.sh` 依然会拦，除非设 `SKIP_LAOTIE_CHECK=1`（强烈不推荐，会被追责）。

**Q3：editor 不在我本机怎么办？**
`laotie-check.sh` 会自动 warn 跳过 editor 相关的检查（8、9 项）。想覆盖路径：
```bash
LAOTIE_EDITOR_ROOT=/path/to/laotie-editor bash skill/scripts/laotie-check.sh
```

**Q4：上游 ksmg-preview.sh 路径变了？**
```bash
KSMG_UPSTREAM_SCRIPT=/your/path/ksmg-preview.sh \
  bash skill/scripts/ksmg-preview-guarded.sh upload ./package 1.0.97 "msg"
```

**Q5：我要新增一项校验怎么办？**
直接改 `scripts/laotie-check.sh`，加一个新的 `section "13/13 xxx"` 块，然后 commit push。所有拉代码的人下次自检就自动生效。

---

## 版本

- **v1.0.0**（2026-08-19）· lihui26 · 首版沉淀 12 项校验 + pre-commit hook + 上线门禁

---

## 相关

- 上级 skill：`~/.codeflicker/skills/laotie-zhaocha-game/`（个人级完整血泪历史）
- 上游 workflow：`~/.codeflicker/remote-personal-skills/agw-work-mode/`（AIGC 小游戏全流程）
- 编辑器：https://laotie-editor.frontend-cloud.corp.kuaishou.com/
