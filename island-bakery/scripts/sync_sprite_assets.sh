#!/usr/bin/env bash
# 同步透明 UI/拆图预备素材 → assets/sprites/ 与 package/res/Image
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$ROOT/island-bakery/package/res/Image"
SPR="$ROOT/assets/sprites"
UI="$ROOT/assets/ui"
KEY="$ROOT/island-bakery/scripts/alpha_key_ui_png.py"

mkdir -p "$SPR/ui" "$SPR/dialogs" "$SPR/icons" "$SPR/equipment" "$SPR/characters" "$SPR/props"

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
  cp -f "$SPR/dialogs/dialog-coconut-summary.png" "$SPR/dialogs/dialog-inventory.png"
  cp -f "$SPR/dialogs/dialog-inventory.png" "$PKG/ui/dialog-inventory.png"
fi

python3 "$KEY" "$SPR/ui/btn-wood.png" "$SPR/dialogs"/*.png 2>/dev/null || true
python3 "$KEY" --mode white --min-rgb 255 "$SPR/icons/e1_fish_icons.png" 2>/dev/null || true

echo "Synced sprites → $SPR (see manifest.json)"
