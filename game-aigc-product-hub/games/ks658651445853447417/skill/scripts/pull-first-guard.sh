#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# pull-first-guard.sh · 老铁眼真尖 · 「改代码前先拉取云端」门禁
#
# 用法：写代码前主动跑一次，或挂到 shell alias「lz-edit」上。
#   bash skill/scripts/pull-first-guard.sh
#
# 效果：确保 local 是 origin/dev 的最新，避免在陈旧基线上继续 build。
# ═══════════════════════════════════════════════════════════════════════════
set -e
GAME_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$GAME_DIR"

echo "═══ 改代码前置：从 origin 拉取最新 ═══"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "分支：$BRANCH"

# stash 非空警告
STASH_COUNT=$(git stash list | wc -l | tr -d ' ')
if [ "$STASH_COUNT" -gt 0 ]; then
  echo "⚠️  存在 $STASH_COUNT 条 stash，可能藏着未合入的工作："
  git stash list
  echo "   建议先 git stash pop / drop 处理干净再动新代码。"
fi

# fetch + 落后检测
git fetch origin "$BRANCH"
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "@{u}" 2>/dev/null || echo "$LOCAL")
BASE=$(git merge-base @ "@{u}" 2>/dev/null || echo "$LOCAL")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✓ local 与 origin/$BRANCH 已同步，可放心改代码"
elif [ "$LOCAL" = "$BASE" ]; then
  echo "⏬ local 落后 origin/$BRANCH，自动 pull --rebase ..."
  git pull --rebase origin "$BRANCH"
  echo "✓ 已同步"
elif [ "$REMOTE" = "$BASE" ]; then
  echo "⏫ local 领先 origin/$BRANCH（有未 push 的 commit）"
  echo "   建议：先 git push origin $BRANCH 再改新代码"
else
  echo "❗ local 与 origin/$BRANCH 分叉，请手动处理："
  echo "   git pull --rebase origin $BRANCH"
  exit 1
fi

# 版本号提示
CUR_VER=$(grep -oE "BUILD_VER = 'v[0-9]+\.[0-9]+\.[0-9]+'" package/js/main.js | head -1)
echo "当前工作区版本：$CUR_VER"
echo "═══ ✅ 可开始改代码 ═══"
