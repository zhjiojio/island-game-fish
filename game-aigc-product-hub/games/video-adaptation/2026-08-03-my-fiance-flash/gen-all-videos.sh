#!/usr/bin/env bash
# 批量生成 F2-F30 kling-3-pro 视频 + mux 音频
# 用法：bash gen-all-videos.sh <锚点only|all> [frames...]
set -e

RUN_DIR="$HOME/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash"
WF="$HOME/work/minigame/game-aigc-workflow"
REF="$RUN_DIR/assets/reference/su-xiaoyu-master.png"
CACHE="$RUN_DIR/.cache"
OUT="$RUN_DIR/assets/video"
AUDIO="$RUN_DIR/assets/audio"
MG_VIDEO="$RUN_DIR/minigame/assets/video"

mkdir -p "$CACHE" "$OUT" "$MG_VIDEO"

export KWALI_CREDENTIALS_FILE="$HOME/.config/kwali-video-gen/credentials.json"

# 每帧: name|台词|情绪场景描述
declare -a FRAMES=(
  "f2|手好凉，你手是不是很冷？|白毛衣温柔女孩关切地看着镜头，指尖冰凉递饭盒，室内暖光"
  "f3|味道有变吗？我记得你说过要甜一点、姜少一点。|木餐桌前她期待地看镜头，暖黄灯光"
  "f4|你先去楼上休息吧，我打扫过了。|袖口卷起洗碗的温柔女孩，抬头笑着说话，厨房场景"
  "f5|这个别听了，扔了扔了……|阁楼昏黄灯光，她握着一盘旧磁带脸红慌乱地说话"
  "f6|你不要偷看哦，我要换成家里的睡衣了。|门缝里女孩害羞地探头，脸颊微红"
  "f7|我今天学的新菜——|厨房她端着盘子期待地看镜头笑说话"
  "f8|你先吃吧，我不饿。|眼眶微红的她低头说话，餐桌旁"
  "f9|是，我未婚夫。|菜市场她害羞地对镜头小声说，眼神躲闪"
  "f10|你走的那 13 年，我每天都想你回来敲我家门。|夜晚阳台竹椅，她双手捧着温牛奶轻声诉说，眼角有泪"
  "f11|当时我妈问我为什么，我说，我要在这里等他回来。|她坐在桌前望着志愿表，苦笑说话"
  "f12|你别看我，头发还没吹干。|沙发上湿发抱枕的她脸红说话，粉色睡衣"
  "f13|我心跳好快，你别听。|沙发上她低声耳语，眼神羞涩"
  "f14|别理他，我们回家。|幼儿园门口她拉着镜头说话，背景有人送花"
  "f15|别理他，我们回家。|她眼含泪水坚定地对镜头说话，晚风吹起头发"
  "f16|我没事，你不用管。|发烧微弱的她躺床上虚弱地说话，被子拉到下巴"
  "f17|原来叔叔真的知道。|她翻着旧信惊讶看镜头说话，阁楼阳光下"
  "f18|帮我拿一下毛巾，好冷。|浴袍湿发的她发抖地伸手说话，浴室门口"
  "f19|你走得慢点，伞不够大。|雨夜她撑伞小声说，头发被雨打湿"
  "f20|你想说什么？|樱花树下她笑着看镜头，粉色花瓣落肩"
  "f21|这个是备用的，你在飞机上吃。|机场大厅她递保温饭盒说话，眼中不舍"
  "f22|欢迎回家小弟弟。|机场出口她举 A4 纸红着脸说话，笑意盈盈"
  "f23|你干嘛。|车内红灯她转头看镜头脸颊发红说话"
  "f24|什么时候把婚事办了？|饭桌旁她妈笑着敬酒说话，中年温柔女子"
  "f25|哎哎导演你演过头了。|她笑着假装配合演戏说话，客厅"
  "f26|我该怎么办。|沙发上她哭着抬头说话，眼泪含在眼眶"
  "f27|你还要我吗？|她哽咽看镜头询问，眼神脆弱"
  "f28|好看吗？我妈说这条最像我。|婚纱店她穿白色婚纱转圈说话"
  "f29|明天我就是你的新娘啦。|阳台夜色下她穿白睡衣回眸微笑说话"
  "f30|我们的故事，走到这里了。|夕阳下她望镜头温柔告别说话"
)

# 参数：锚点 = f5 f10 f15 f20 f25; all = 全部
MODE="${1:-anchors}"
declare -a PICK
case "$MODE" in
  anchors)  PICK=(f5 f10 f15 f20 f25) ;;
  all)      PICK=(f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12 f13 f14 f15 f16 f17 f18 f19 f20 f21 f22 f23 f24 f25 f26 f27 f28 f29 f30) ;;
  rest)     PICK=(f2 f3 f4 f6 f7 f8 f9 f11 f12 f13 f14 f16 f17 f18 f19 f21 f22 f23 f24 f26 f27 f28 f29 f30) ;;
  *)        shift; PICK=("$@") ;;
esac

echo "======================================="
echo "▶ MODE=$MODE, 待生成: ${PICK[*]}"
echo "▶ 参考图: $REF"
echo "======================================="

gen_one() {
  local name="$1"
  local line="$2"
  local desc="$3"
  local req="$CACHE/${name}-req.json"
  local job="$CACHE/${name}-job.json"
  local raw="$OUT/${name}-raw.mp4"
  local final="$OUT/${name}-final.mp4"

  if [ -f "$final" ]; then
    echo "  ✓ $name 已存在，跳过"
    return 0
  fi

  # 组 prompt
  local prompt="$desc。她正对镜头轻声说话：\"$line\"，嘴唇自然张合与台词同步，眼神与镜头交流。9:16 竖屏电影特写。镜头保持稳定，不要旋转，不要变换背景或服装，保持人物同一性。"

  cat > "$req" <<EOF
{
  "prompt": $(printf '%s' "$prompt" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"),
  "aspectRatio": "9:16",
  "resolution": "720p",
  "durationSec": 5,
  "image": "$REF"
}
EOF

  echo ""
  echo "── $name ──"
  echo "  prompt: ${line}"

  cd "$WF"
  python3 tools/make_videos/kling.py "$req" \
    --profile kling-3-pro \
    --job-file "$job" \
    --output "$raw" 2>&1 | tail -3

  if [ ! -f "$raw" ]; then
    echo "  ❌ $name 生成失败"
    return 1
  fi

  # mux 音频
  if [ -f "$AUDIO/voice-${name}.mp3" ]; then
    ffmpeg -y -i "$raw" -i "$AUDIO/voice-${name}.mp3" \
      -c:v copy -c:a aac -b:a 128k -map 0:v:0 -map 1:a:0 -shortest \
      "$final" 2>&1 | tail -1
    echo "  ✅ $final 已 mux"
  else
    cp "$raw" "$final"
    echo "  ⚠️  无音频 fallback"
  fi

  # 复制到 minigame
  cp "$final" "$MG_VIDEO/"
  echo "  ✅ 已复制到 minigame"
}

for name in "${PICK[@]}"; do
  # 从数组找到匹配行
  for row in "${FRAMES[@]}"; do
    key="${row%%|*}"
    if [ "$key" = "$name" ]; then
      rest="${row#*|}"
      line="${rest%%|*}"
      desc="${rest#*|}"
      gen_one "$name" "$line" "$desc" || echo "  ⚠️  $name 失败，继续下一个"
      break
    fi
  done
done

echo ""
echo "======================================="
echo "▶ 全部完成，产出:"
ls -la "$MG_VIDEO"/
