#!/usr/bin/env bash
# 同步透明 UI/拆图预备素材 → assets/sprites/ 与 package/res/Image
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$ROOT/island-bakery/package/res/Image"
SPR="$ROOT/assets/sprites"
UI="$ROOT/assets/ui"
KEY="$ROOT/island-bakery/scripts/alpha_key_ui_png.py"

mkdir -p "$SPR/ui" "$SPR/dialogs" "$SPR/icons" "$SPR/equipment" "$SPR/characters" "$SPR/props"

CTRL="$ROOT/assets/界面/控件"
# 结算弹窗分层素材：中文源图 → assets/ui 英文名 → package
if [[ -d "$CTRL" ]]; then
  [[ -f "$CTRL/结算_无按钮底图.png" ]] && cp -f "$CTRL/结算_无按钮底图.png" "$UI/dialog-settlement-base.png"
  [[ -f "$CTRL/椰子结算_顶部木牌.png" ]] && cp -f "$CTRL/椰子结算_顶部木牌.png" "$UI/dialog-settlement-title.png"
  [[ -f "$CTRL/椰子结算_长按钮框.png" ]] && cp -f "$CTRL/椰子结算_长按钮框.png" "$UI/dialog-settlement-btn-long.png"
  [[ -f "$CTRL/椰子结算_短按钮框.png" ]] && cp -f "$CTRL/椰子结算_短按钮框.png" "$UI/dialog-settlement-btn-short.png"
  [[ -f "$CTRL/椰子结算_椰子.png" ]] && cp -f "$CTRL/椰子结算_椰子.png" "$UI/dialog-settlement-mid-coconut.png"
  [[ -f "$CTRL/鱼获结算_中央圆盘.png" ]] && cp -f "$CTRL/鱼获结算_中央圆盘.png" "$UI/dialog-settlement-mid-plate.png"
  # 兼容旧椰子结算 key（指向同一套共用壳素材）
  [[ -f "$UI/dialog-settlement-base.png" ]] && cp -f "$UI/dialog-settlement-base.png" "$UI/dialog-coconut-summary.png"
  [[ -f "$UI/dialog-settlement-title.png" ]] && cp -f "$UI/dialog-settlement-title.png" "$UI/dialog-coconut-title.png"
  [[ -f "$UI/dialog-settlement-btn-long.png" ]] && cp -f "$UI/dialog-settlement-btn-long.png" "$UI/dialog-coconut-btn-long.png"
  [[ -f "$UI/dialog-settlement-btn-short.png" ]] && cp -f "$UI/dialog-settlement-btn-short.png" "$UI/dialog-coconut-btn-short.png"
fi
for settle in \
  dialog-settlement-base \
  dialog-settlement-title \
  dialog-settlement-btn-long \
  dialog-settlement-btn-short \
  dialog-settlement-mid-coconut \
  dialog-settlement-mid-plate \
  dialog-coconut-summary \
  dialog-coconut-title \
  dialog-coconut-btn-long \
  dialog-coconut-btn-short; do
  if [[ -f "$UI/$settle.png" ]]; then
    mkdir -p "$PKG/ui"
    cp -f "$UI/$settle.png" "$PKG/ui/$settle.png"
  fi
done

cp -f "$UI/btn-wood.png" "$SPR/ui/"
cp -f "$UI"/dialog-*.png "$SPR/dialogs/"
cp -f "$PKG/e1_fish_icons.png" "$SPR/icons/"

for pair in \
  "e2_rods_baits equipment" \
  "e6_equipment_ui equipment" \
  "c1_rabbit_tpose characters" \
  "c2_customers characters" \
  "c3_special_npcs characters" \
  "e3_coconuts props" \
  "e4_grilled_fish props" \
  "g2_6b_grills props" \
  "g2_5b_crops props"; do
  set -- $pair
  src="$ROOT/assets/$1.png"
  [[ -f "$src" ]] && cp -f "$src" "$SPR/$2/$1.png"
done

if [[ ! -f "$SPR/dialogs/dialog-inventory.png" ]]; then
  cp -f "$SPR/dialogs/dialog-settlement-base.png" "$SPR/dialogs/dialog-inventory.png"
  cp -f "$SPR/dialogs/dialog-inventory.png" "$PKG/ui/dialog-inventory.png"
fi

python3 "$KEY" "$SPR/ui/btn-wood.png" "$SPR/dialogs"/*.png 2>/dev/null || true
python3 "$KEY" --mode white --min-rgb 255 "$SPR/icons/e1_fish_icons.png" 2>/dev/null || true

echo "Synced sprites → $SPR (see manifest.json)"
