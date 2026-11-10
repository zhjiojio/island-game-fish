#!/usr/bin/env bash
# 将 assets 根目录整理为中文分区；删除无附录/无引擎引用的冗余稿
set -euo pipefail
A="/Users/zmj/Downloads/kwaigame/assets"
mkdir -p "$A/文档" "$A/场景参考" "$A/界面/全屏皮肤" "$A/界面/控件" "$A/界面/弹窗与气泡" \
  "$A/图鉴" "$A/角色" "$A/道具" "$A/装备" "$A/风格参考" "$A/文档/素材说明"

mv -f "$A/ART_COMPOSITION_NOTES.md" "$A/文档/" 2>/dev/null || true
mv -f "$A/DESIGN_DOC_REFERENCE_IMAGES.md" "$A/文档/" 2>/dev/null || true

for f in 横屏场景图 横屏垂钓图 横屏烤鱼图 横屏摇晃椰树图 竖屏场景图 竖屏钓鱼图 竖屏摇晃椰树图 竖屏烤鱼图; do
  [[ -f "$A/${f}.png" ]] && mv -f "$A/${f}.png" "$A/场景参考/${f}.png"
done

for f in "$A/ui/"ui-skin-*.png; do
  [[ -f "$f" ]] && cp -f "$f" "$A/界面/全屏皮肤/$(basename "$f")"
done
cp -f "$A/ui/btn-wood.png" "$A/界面/控件/木牌按钮.png" 2>/dev/null || true
for f in dialog-*.png order-bubble.png; do
  [[ -f "$A/ui/$f" ]] && cp -f "$A/ui/$f" "$A/界面/弹窗与气泡/${f%.png}.png"
done
[[ -f "$A/界面/弹窗与气泡/order-bubble.png" ]] && cp -f "$A/界面/弹窗与气泡/order-bubble.png" "$A/界面/弹窗与气泡/顾客订单气泡.png"

[[ -f "$A/e1_fish_icons.png" ]] && cp -f "$A/e1_fish_icons.png" "$A/图鉴/鱼种图集.png"
[[ -f "$A/c1_rabbit_tpose.png" ]] && mv -f "$A/c1_rabbit_tpose.png" "$A/角色/兔子主角.png"
[[ -f "$A/c2_customers.png" ]] && mv -f "$A/c2_customers.png" "$A/角色/顾客图集.png"
[[ -f "$A/c3_special_npcs.png" ]] && mv -f "$A/c3_special_npcs.png" "$A/角色/特殊NPC图集.png"
[[ -f "$A/e2_rods_baits.png" ]] && mv -f "$A/e2_rods_baits.png" "$A/装备/钓竿与鱼饵图集.png"
[[ -f "$A/e6_equipment_ui.png" ]] && mv -f "$A/e6_equipment_ui.png" "$A/装备/装备界面图集.png"
[[ -f "$A/e3_coconuts.png" ]] && mv -f "$A/e3_coconuts.png" "$A/道具/椰子图集.png"
[[ -f "$A/e4_grilled_fish.png" ]] && mv -f "$A/e4_grilled_fish.png" "$A/道具/烤鱼成品图集.png"
[[ -f "$A/e5_farm.png" ]] && mv -f "$A/e5_farm.png" "$A/道具/菜园图集.png"
[[ -f "$A/e7_weather.png" ]] && mv -f "$A/e7_weather.png" "$A/道具/天气图集.png"
[[ -f "$A/g2_5b_crops.png" ]] && mv -f "$A/g2_5b_crops.png" "$A/道具/作物图集.png"
[[ -f "$A/g2_6b_grills.png" ]] && mv -f "$A/g2_6b_grills.png" "$A/道具/烤架图集.png"

for f in "$A"/*.txt; do
  [[ -f "$f" ]] && mv -f "$f" "$A/文档/素材说明/$(basename "$f")"
done

for f in 主角风格稿—兔子烤鱼师 场景风格稿—孤岛全景 夜晚场景稿—孤岛夜景 烤鱼食物稿—烤鱼料理集合 烤鱼场景稿—篝火烤鱼摊; do
  [[ -f "$A/${f}.png" ]] && mv -f "$A/${f}.png" "$A/风格参考/${f}.png"
done

rm -f "$A/食物风格稿—烘焙品集合.png" 2>/dev/null || true
rm -rf "$A/sprites" 2>/dev/null || true

# 根目录去重：已迁入子目录的英文 demo 删除
for f in e1_fish_icons.png; do
  rm -f "$A/$f" 2>/dev/null || true
done

echo "assets reorganized under $A"
