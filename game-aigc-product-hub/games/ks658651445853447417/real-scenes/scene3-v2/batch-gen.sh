#!/usr/bin/env bash
# 批量生成 20 张城市 hunt 场景图（AIGC 工笔画/水墨风）
# 用法：bash batch-gen.sh [start_lv] [end_lv]  例：bash batch-gen.sh 10 14  只跑 lv10-14
set -e
cd "$(dirname "$0")"
JSON=cities-20.json
SKILL=/Users/fat/.codeflicker/remote-personal-skills/designai-generate-image
OUT_DIR=./generated
mkdir -p "$OUT_DIR"

START=${1:-10}
END=${2:-29}

# 全局风格锚点：现代摄影/写实风（对齐老关 lv5-9 · 成都茶馆/重庆洪崖洞的现代照片风）
STYLE="真实摄影质感的现代中国城市街景，白天自然光或夜市温暖灯光，35mm 镜头俯视 3/4 视角，30+ 真实行人/游客/摊贩，繁华拥挤但构图清晰，市井生活氛围，物件之间视觉分层丰富，色彩饱和自然，画面细节丰富，宽画幅电影感构图，无文字水印无 Logo 无签名，不要工笔画不要水墨风不要卡通不要动漫"

for i in $(seq $START $END); do
  # 读取该关配置
  LINE=$(python3 -c "
import json
d = json.load(open('$JSON'))
c = next(x for x in d['cities'] if x['lv']==$i)
props = '、'.join([p['zh'] for p in c['props']])
print(f\"{c['lv']}|{c['city']}|{c['scene']}|{c['items']}|{props}\")
")
  IFS='|' read -r LV CITY SCENE_NAME NITEMS PROPS <<< "$LINE"
  echo "▶ Lv$LV · $CITY · $SCENE_NAME · $NITEMS 物：$PROPS"

  # 构造 prompt
  PROMPT="${CITY}${SCENE_NAME}，${STYLE}，画面里自然融入 ${NITEMS} 个隐藏小物件：${PROPS}，这些物件必须【很小很藏很自然】地混入密集的场景元素中（比如挂在角落、被人群半遮挡、和背景颜色相似），大小占画面 3%~5%，让人一眼看不到需要细看才能发现，作为真实照片场景里的道具烘焙进图内，不要单独描边突出，整体保持真实摄影质感"

  # 生成（如已存在则跳过）
  OUT=$OUT_DIR/lv${LV}.jpg
  if [ -s "$OUT" ]; then
    echo "   ✓ 已存在，跳过"
    continue
  fi

  URL=$(uv run $SKILL/scripts/generate_image_gpt2.py \
    --prompt "$PROMPT" \
    --size 2048x1152 --quality medium --no-stream --timeout 300 --max-retries 0 2>&1 | tail -1)

  if [[ "$URL" != https://* ]]; then
    echo "   ⚠ GPT 失败，切 Gemini：$URL"
    URL=$(uv run $SKILL/scripts/generate_image.py \
      --prompt "$PROMPT" --size 2K --ratio 16:9 2>&1 | tail -1)
  fi

  if [[ "$URL" == https://* ]]; then
    curl -sSL "$URL" -o "$OUT"
    SIZE=$(wc -c < "$OUT" | tr -d ' ')
    echo "   ✅ Lv$LV → $OUT ($SIZE B)"
  else
    echo "   ❌ Lv$LV 生成失败：$URL"
  fi
done

echo ""
echo "=== 汇总 ==="
ls -la $OUT_DIR/
