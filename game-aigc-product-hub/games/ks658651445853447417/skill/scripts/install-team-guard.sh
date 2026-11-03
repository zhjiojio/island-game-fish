#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# install-team-guard.sh · 老铁眼真尖 · 团队成员一键接入 build 守门体系
#
# 使用（团队新成员 clone game 仓后，进本目录执行一次）：
#   bash skill/scripts/install-team-guard.sh
#
# 作用：
#   1. 复制 laotie-build-guard subagent 到 ~/.codeflicker/agents/
#   2. 复制 laotie-zhaocha-game SKILL.md 到 ~/.codeflicker/skills/
#   3. 校验 3 个门禁脚本可执行
#   4. 打印一条 hello world 验证消息
# ═══════════════════════════════════════════════════════════════════════════
set -e

GAME_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$GAME_DIR"

echo "═══ 老铁眼真尖 · 团队守门体系一键接入 ═══"

# 1. Subagent
mkdir -p ~/.codeflicker/agents
if [ -f skill/agents/laotie-build-guard.md ]; then
  cp skill/agents/laotie-build-guard.md ~/.codeflicker/agents/
  echo "✅ subagent 已安装: ~/.codeflicker/agents/laotie-build-guard.md"
else
  echo "❌ skill/agents/laotie-build-guard.md 缺失"; exit 1
fi

# 2. Skill
mkdir -p ~/.codeflicker/skills/laotie-zhaocha-game/scripts
if [ -f skill/skill-docs/SKILL.md ]; then
  cp skill/skill-docs/SKILL.md ~/.codeflicker/skills/laotie-zhaocha-game/SKILL.md
  echo "✅ skill 文档已安装: ~/.codeflicker/skills/laotie-zhaocha-game/SKILL.md"
fi

# 3. Scripts 可执行
chmod +x skill/scripts/*.sh 2>/dev/null || true
echo "✅ skill/scripts/*.sh 已 chmod +x"

# 4. Shell 层拦截（~/.zshrc） — 让裸 ksmg upload 也被物理拦下
ZSHRC="$HOME/.zshrc"
GUARD_BLOCK="/tmp/laotie-guard-block.$"
cat > "$GUARD_BLOCK" <<GUARDEOF
# ═══ 老铁眼真尖 build 守门（自动安装 · v1.0.97 事故后固化）═══
if [ -f $GAME_DIR/skill/scripts/ksmg-wrapper.sh ]; then
  source $GAME_DIR/skill/scripts/ksmg-wrapper.sh
fi
chpwd_laotie_guard() {
  if [[ "\$PWD" == *ks658651445853447417* ]]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║ 🎮 老铁眼真尖 · build 守门已启用                              ║"
    echo "║ ⚠️  裸 ksmg upload/preview 会被 wrapper 拦截                   ║"
    echo "║ ✅ 用: bash skill/scripts/ksmg-preview-safe.sh <cmd> <ver> <cl>║"
    echo "╚══════════════════════════════════════════════════════════════╝"
  fi
}
autoload -U add-zsh-hook 2>/dev/null && add-zsh-hook chpwd chpwd_laotie_guard
# ═══ END 老铁眼真尖 build 守门 ═══
GUARDEOF

if [ -f "$ZSHRC" ]; then
  # 幂等：先删旧块再追加
  python3 -c "
import re, sys
p = open('$ZSHRC').read()
p = re.sub(r'# ═══ 老铁眼真尖 build 守门.*?# ═══ END 老铁眼真尖 build 守门 ═══\n', '', p, flags=re.DOTALL)
open('$ZSHRC','w').write(p)
" 2>/dev/null || true
  cat "$GUARD_BLOCK" >> "$ZSHRC"
  echo "✅ ~/.zshrc 已注入 ksmg wrapper（下次 source ~/.zshrc 生效）"
else
  cat "$GUARD_BLOCK" > "$ZSHRC"
  echo "✅ 已创建 ~/.zshrc 并注入 wrapper"
fi
rm -f "$GUARD_BLOCK"

# 5. Git pre-push hook — 阻止不合规代码 push 到 dev
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -n "$REPO_ROOT" ] && [ -d "$REPO_ROOT/.git/hooks" ]; then
  if [ -f "$REPO_ROOT/.git/hooks/pre-push" ] && ! grep -q "老铁眼真尖" "$REPO_ROOT/.git/hooks/pre-push" 2>/dev/null; then
    cp "$REPO_ROOT/.git/hooks/pre-push" "$REPO_ROOT/.git/hooks/pre-push.backup.$(date +%s)"
    echo "⚠️  已有 pre-push hook, 备份为 pre-push.backup.*"
  fi
  # 从仓库里的模板 copy（如果 skill/scripts/pre-push-template.sh 存在）
  if [ -f skill/scripts/pre-push-template.sh ]; then
    cp skill/scripts/pre-push-template.sh "$REPO_ROOT/.git/hooks/pre-push"
    chmod +x "$REPO_ROOT/.git/hooks/pre-push"
    echo "✅ Git pre-push hook 已装（阻止不合规 push 到 dev）"
  fi
fi

# 6. 自检
echo ""
echo "═══ 自检 ═══"
[ -x skill/scripts/ksmg-preview-safe.sh ] && echo "✓ ksmg-preview-safe.sh 可执行"
[ -x skill/scripts/pull-first-guard.sh ]  && echo "✓ pull-first-guard.sh 可执行"
[ -x skill/scripts/laotie-check.sh ]      && echo "✓ laotie-check.sh 可执行"

echo ""
echo "═══ ✅ 接入完成 ═══"
echo ""
echo "从此以后，你的工作流："
echo "  1. 改代码前：  bash skill/scripts/pull-first-guard.sh"
echo "  2. build 时： 让 AI 调 laotie-build-guard subagent（说 「build v1.0.XX」即可）"
echo "  3. 或手动：   bash skill/scripts/ksmg-preview-safe.sh upload \"X.Y.Z\" \"changelog\""
echo ""
echo "每次 build 后会自动生成报告到: build-qrcodes/v<VER>-report.md"
