#!/bin/bash
# 老铁找茬王中文零容忍自检 · 每次改代码后必跑
# 规则：levels.js + editor-legacy.js 的 EXIST_S* 里禁止出现 tag:'英文_下划线'
set -e
LV=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/js/levels.js
ED=/Users/fat/Desktop/laotie-editor/src/editor-legacy.js
A=$(grep -c "tag:'[a-z_][a-z0-9_]*'" "$LV" 2>/dev/null | head -1)
B=$(grep -c "tag:'[a-z_][a-z0-9_]*'" "$ED" 2>/dev/null | head -1)
A=${A:-0}; B=${B:-0}
if [ "$A" -ne 0 ] || [ "$B" -ne 0 ]; then
  echo "❌❌❌ 中文零容忍违规！levels.js=$A editor=$B"
  echo "违规位置："
  grep -n "tag:'[a-z_][a-z0-9_]*'" "$LV" 2>/dev/null | head -10
  grep -n "tag:'[a-z_][a-z0-9_]*'" "$ED" 2>/dev/null | head -10
  exit 1
fi
echo "✅ 中文零容忍通过（levels.js=0, editor=0）"
