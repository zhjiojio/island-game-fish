#!/bin/bash
# v0.0.68 铁律自检：确保 levels.js 与 editor EXIST/EXIST_S2/PROP_META 三方对齐
# 用法：bash check-editor-sync.sh
# 退出码：0=全部对齐 / 1=有问题
set -e
EDITOR="/Users/fat/Desktop/laotie-editor/index.html"
LEVELS="/Users/fat/work/minigame/game-aigc-product-hub/games/ks712131693858878897/package/js/levels.js"
[ ! -f "$EDITOR" ] && { echo "❌ editor 文件不存在: $EDITOR"; exit 1; }
[ ! -f "$LEVELS" ] && { echo "❌ levels.js 不存在: $LEVELS"; exit 1; }

echo "=== 老铁找茬王 三方对齐自检 v0.0.68 ==="
FAIL=0

# 1. levels.js 里所有 spot 模式的 tag
TAGS=$(grep -oE "tag:'[a-z_0-9]+'" "$LEVELS" | sed "s/tag:'//;s/'//" | sort -u)
# 2. editor 里 EXIST/EXIST_S2 的 prop
PROPS=$(grep -oE "prop:'[a-z_0-9]+'" "$EDITOR" | sed "s/prop:'//;s/'//" | sort -u)
# 3. PROP_META 的 key（模式：key:{emoji）
META=$(grep -oE "^[[:space:]]*[a-z_0-9]+:\{emoji" "$EDITOR" | sed 's/:{emoji//;s/[[:space:]]//g' | sort -u)

MISSING_IN_EXIST=$(comm -23 <(echo "$TAGS") <(echo "$PROPS") 2>/dev/null || true)
if [ -n "$MISSING_IN_EXIST" ]; then
  echo "❌ levels.js 有 tag 但 editor EXIST/EXIST_S2 缺失（→ editor 打开显示 0 个默认框）："
  echo "$MISSING_IN_EXIST" | sed 's/^/    /'
  FAIL=1
fi

MISSING_IN_META=$(comm -23 <(echo "$PROPS") <(echo "$META") 2>/dev/null || true)
if [ -n "$MISSING_IN_META" ]; then
  echo "⚠️ EXIST 出现的 prop 缺少 PROP_META（→ editor 显示 tag 无 emoji/中文名）："
  echo "$MISSING_IN_META" | sed 's/^/    /'
  FAIL=1
fi

UNUSED_META=$(comm -13 <(echo "$TAGS") <(echo "$META") 2>/dev/null | head -5 || true)
if [ -n "$UNUSED_META" ]; then
  echo "ℹ️ PROP_META 里未使用的 key（前 5 个，仅提示）："
  echo "$UNUSED_META" | sed 's/^/    /'
fi

if [ $FAIL -eq 0 ]; then
  echo "✅ levels.js ⇄ EXIST/EXIST_S2 ⇄ PROP_META 三方完全对齐"
fi
exit $FAIL
