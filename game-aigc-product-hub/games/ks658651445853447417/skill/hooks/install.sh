#!/usr/bin/env bash
# =============================================================================
# install.sh —— 一键安装老铁眼真尖 skill 到本地
# =============================================================================
# 用法：bash games/ks658651445853447417/skill/hooks/install.sh
#
# 做三件事：
#   1. 软链 pre-commit hook 到 .git/hooks/
#   2. 授予所有 skill/scripts/*.sh 可执行权限
#   3. 提示是否挂到 ksmg-preview 前置门禁
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
GAME_DIR="$(dirname "$SKILL_DIR")"
REPO_ROOT=$(git -C "$GAME_DIR" rev-parse --show-toplevel 2>/dev/null)

if [ -z "$REPO_ROOT" ]; then
  echo "❌ 请在 game-aigc-product-hub git 仓库内运行"
  exit 1
fi

echo "════ 老铁眼真尖 Skill 本地安装 ════"
echo "SKILL_DIR: $SKILL_DIR"
echo "REPO_ROOT: $REPO_ROOT"
echo ""

# ─── 1. pre-commit hook ───────────────────────────────────
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-commit"
HOOK_SRC="$SCRIPT_DIR/pre-commit.sh"

if [ -e "$HOOK_TARGET" ] && [ ! -L "$HOOK_TARGET" ]; then
  BACKUP="$HOOK_TARGET.bak.$(date +%Y%m%d_%H%M%S)"
  mv "$HOOK_TARGET" "$BACKUP"
  echo "⚠️  已备份旧 pre-commit → $BACKUP"
fi

ln -sf "$HOOK_SRC" "$HOOK_TARGET"
chmod +x "$HOOK_SRC"
echo "✓ pre-commit hook 已软链到 .git/hooks/pre-commit"

# ─── 2. scripts 可执行权限 ────────────────────────────────
chmod +x "$SKILL_DIR"/scripts/*.sh 2>/dev/null || true
chmod +x "$SKILL_DIR"/hooks/*.sh 2>/dev/null || true
echo "✓ 所有 skill/scripts + skill/hooks 已授可执行权限"

# ─── 3. 快速自检 ──────────────────────────────────────────
echo ""
echo "════ 首次自检（--skip-cdn） ════"
bash "$SKILL_DIR/scripts/laotie-check.sh" --skip-cdn || true

echo ""
echo "════ 安装完成 ════"
echo "以后每次 git commit 会自动运行 Level 1 快速校验（无 CDN 检查）"
echo "手动全量校验：  bash games/ks658651445853447417/skill/scripts/laotie-check.sh"
echo "跳过 CDN 检查：  bash games/ks658651445853447417/skill/scripts/laotie-check.sh --skip-cdn"
echo ""
echo "▶︎ 建议同步给 team：git pull 后每人执行一次本安装脚本"
