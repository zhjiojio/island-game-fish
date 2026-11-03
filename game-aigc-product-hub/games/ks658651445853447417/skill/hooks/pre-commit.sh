#!/usr/bin/env bash
# =============================================================================
# pre-commit hook —— 老铁眼真尖 Level 1 快速守门
# =============================================================================
# 安装方式（在 game-aigc-product-hub 根目录）：
#   ln -sf "$(pwd)/games/ks658651445853447417/skill/hooks/pre-commit.sh" .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# 或运行安装脚本：
#   bash games/ks658651445853447417/skill/hooks/install.sh
#
# 只在改动到 ks658651445853447417/ 下的文件时触发；--skip-cdn 避免离线卡住。
# =============================================================================

set -uo pipefail

GAME_DIR_REL="games/ks658651445853447417"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

# 只在本 AppID 有改动时校验
CHANGED=$(git diff --cached --name-only | grep -c "^$GAME_DIR_REL/" || true)
[ "$CHANGED" = "0" ] && exit 0

CHECKER="$REPO_ROOT/$GAME_DIR_REL/skill/scripts/laotie-check.sh"
if [ ! -x "$CHECKER" ]; then
  chmod +x "$CHECKER" 2>/dev/null || true
fi
if [ ! -f "$CHECKER" ]; then
  echo "⚠️ pre-commit: laotie-check.sh 不存在，跳过校验"
  exit 0
fi

echo "🔍 老铁眼真尖 pre-commit 校验（$CHANGED 个文件改动）..."
bash "$CHECKER" --quiet --skip-cdn
RC=$?

if [ $RC -ne 0 ]; then
  echo ""
  echo "❌ pre-commit 拒绝提交。运行完整校验查看详情："
  echo "   bash $GAME_DIR_REL/skill/scripts/laotie-check.sh"
  echo ""
  echo "⚠️  紧急绕过（不推荐）：git commit --no-verify"
  exit 1
fi

echo "✓ pre-commit 校验通过"
exit 0
