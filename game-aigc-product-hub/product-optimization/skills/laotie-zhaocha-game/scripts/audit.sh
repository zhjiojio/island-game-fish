#!/bin/bash
# 老铁找茬王 编辑器↔游戏 一致性审计
# 用法: bash ~/.codeflicker/skills/laotie-zhaocha-game/scripts/audit.sh
#
# 检查项：
#   ① PROPS 库覆盖度 - levels.js 所有 prop_id 在 editor PROPS 库都有映射
#   ② SCENE_META[1].levels vs levels.js title 逐关穷举对比 (hidden 18 关，按数组位置)
#   ③ 中文零容忍 - 英文 tag 扫描
#   ④ 敏感词扫描 - 供销社/洗浴中心/国营/春运/生产队
#   ⑤ 标题长度 - Scene 1 hidden 关卡 "第N关 · " 之后 ≤ 8 字
#
# 退出码: 0=全通过, 1=有错
# 沉淀日期: 2026-08-11 (evo-skill-review 触发)

GAME=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
EDITOR=/Users/fat/Desktop/laotie-editor
LEVELS_JS="$GAME/package/js/levels.js"
EDITOR_JS="$EDITOR/src/editor-legacy.js"

EXIT_CODE=0

echo "═══════════════════════════════════════════════════════════"
echo "  老铁找茬王 编辑器↔游戏 一致性审计"
echo "═══════════════════════════════════════════════════════════"

# ① PROPS 库覆盖度
echo ""
echo "【① PROPS 库覆盖度】"
ALL_PROPS=$(grep -oE "prop:'[a-z_0-9]+'" "$LEVELS_JS" | sort -u | sed "s/prop:'//;s/'//")
MISSING=0
TOTAL=0
for P in $ALL_PROPS; do
  TOTAL=$((TOTAL+1))
  if ! grep -qE "^\s*${P}:\s*\{" "$EDITOR_JS"; then
    echo "  ❌ levels.js prop='$P' 但 editor PROPS 无此 key"
    MISSING=$((MISSING+1))
    EXIT_CODE=1
  fi
done
if [ "$MISSING" = "0" ]; then
  echo "  ✅ 全 $TOTAL 个 prop 都有映射"
else
  echo "  ⚠️ 缺 $MISSING / $TOTAL 个映射 - 需补充到 editor-legacy.js PROPS 对象"
fi

# ② SCENE_META[1].levels vs levels.js title 逐关对比 (按数组位置)
# SCENE_META 结构: const SCENE_META = { 1: { levels: [...] }, 2: {...}, 3: {...} }
# 用 awk 提取 "1: {" 到 "}," 区间内的 title
echo ""
echo "【② SCENE_META[1].levels vs levels.js title 逐关对比 (按数组位置)】"
EDITOR_TITLES=$(awk '
  /^  1: \{$/ { in_s1=1; next }
  in_s1 && /^  \},$/ { in_s1=0 }
  in_s1 && /title:/ {
    match($0, /title:[^,]+/);
    t = substr($0, RSTART, RLENGTH);
    gsub(/title:[[:space:]]*/, "", t);
    gsub(/^'\''/, "", t);
    gsub(/'\''$/, "", t);
    print t;
  }
' "$EDITOR_JS")

GAME_TITLES=$(awk '
  /themeId:1/ {
    in_t1=1
  }
  in_t1 {
    match($0, /title:[^,]+/);
    t = substr($0, RSTART, RLENGTH);
    gsub(/title:[[:space:]]*/, "", t);
    gsub(/^'\''/, "", t);
    gsub(/'\''$/, "", t);
    if (t != "") print t;
  }
  /idx:[0-9]+,.*themeId:2/ { in_t1=0 }
' "$LEVELS_JS" | head -18)

N=0
for GAME_T in $GAME_TITLES; do
  :
done
# 上面 for 用来初始化，下面用 paste 对比
paste <(echo "$GAME_TITLES") <(echo "$EDITOR_TITLES") | awk -F'\t' '{
  lv = NR
  if ($1 == $2 && $1 != "") {
    printf "  idx %d ✅ %s\n", lv-1, $1
  } else {
    printf "  idx %d ❌ game='%s' editor='%s'\n", lv-1, $1, $2
  }
}'

# ③ 中文零容忍 - 英文 tag 扫描
echo ""
echo "【③ 中文零容忍 - 英文 tag 扫描】"
COUNT=$(grep -cE "tag:'[a-z_][a-z0-9_]*'" "$LEVELS_JS" || true)
if [ "$COUNT" = "0" ]; then
  echo "  ✅ levels.js 无英文 tag"
else
  echo "  ❌ levels.js 有 $COUNT 个英文 tag"
  grep -nE "tag:'[a-z_][a-z0-9_]*'" "$LEVELS_JS" | head -5
  EXIT_CODE=1
fi

# ④ 敏感词扫描
echo ""
echo "【④ 敏感词扫描】"
for WORD in 供销社 洗浴中心 国营 春运 生产队; do
  GAME_COUNT=$(grep -c "$WORD" "$LEVELS_JS" 2>/dev/null || true)
  EDITOR_COUNT=$(grep -c "$WORD" "$EDITOR_JS" 2>/dev/null || true)
  GAME_COUNT=${GAME_COUNT:-0}
  EDITOR_COUNT=${EDITOR_COUNT:-0}
  TOTAL_C=$((GAME_COUNT + EDITOR_COUNT))
  if [ "$TOTAL_C" = "0" ]; then
    echo "  ✅ '$WORD' 未出现"
  else
    echo "  ❌ '$WORD' 出现 $TOTAL_C 次 (game=$GAME_COUNT editor=$EDITOR_COUNT)"
    EXIT_CODE=1
  fi
done

# ⑤ 标题长度检查 (Scene 1 hidden 关卡，"第N关 · " 之后 ≤ 8 字)
echo ""
echo "【⑤ 标题长度 (Scene 1 hidden, ≤8字, 不含 '第N关 · ' 前缀)】"
# 只检查 levels.js themeId:1 块内的 title (idx 0-17)
# 用 python3 做 UTF-8 字符计数（bash wc -m 在中文环境可能不准）
python3 << 'PYEOF'
import re
LEVELS_JS = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/js/levels.js"
with open(LEVELS_JS, "r", encoding="utf-8") as f:
    content = f.read()

# 提取 themeId:1 的关卡 title (hidden 18 关)
# 匹配模式: idx:N, themeId:1, ... title:'第M关 · XXX'
pattern = re.compile(r"idx:(\d+),\s*themeId:1,.*?title:'([^']+)'", re.DOTALL)
found_overlong = False
for m in pattern.finditer(content):
    idx = int(m.group(1))
    if idx > 17:  # 只看 hidden scene 1 的前 18 关
        continue
    full_title = m.group(2)
    # 去掉 "第N关 · " 前缀
    body = re.sub(r"^第\d+关 · ", "", full_title)
    char_len = len(body)
    if char_len > 8:
        print(f"  ❌ 超长({char_len}字): {full_title}")
        found_overlong = True

if not found_overlong:
    print("  ✅ Scene 1 hidden 全部 ≤8字")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$EXIT_CODE" = "0" ]; then
  echo "  ✅ 全部审计通过"
else
  echo "  ❌ 有审计项失败 - 退出码 1"
fi
echo "═══════════════════════════════════════════════════════════"
exit $EXIT_CODE
