#!/usr/bin/env bash
# ⭐ 老铁找茬王 · 4 语音包批量生成台词的一键脚本
# 用法:
#   ./gen-voice-line.sh <clip-key> "台词文字"
# 例:
#   ./gen-voice-line.sh timeup "哎呀～时间到啦，看个广告再来一次吧！"
#   ./gen-voice-line.sh combo3 "三连击！你眼神真尖！"
#
# 会生成到:
#   package/assets/audio/voices/{xiaomei,xiaoshuai,kuergou,lala}/<clip-key>.mp3
# 然后你只需要在 voice-packs.js 的每个 pack.clips 里加一行 <clip-key>: BASE + '<pack>/<clip-key>.mp3' 即可

set -e
CLIP="${1:?clip key required}"
TEXT="${2:?text required}"

export MINIMAX_API_KEY="sk-cp-f-rxe3hcdNB4I_kFui-rri0daIlraMmK6gtw2Yzi8LQBUm1X_AVdClkrYHfCMpq0H81RV0nFOclODyID89PKc6ks_62yjS41ZzYI4vV1U6GjovEqHcNKwdE"
export MINIMAX_GROUP_ID="2038909098828767900"
CLI="node /Users/fat/.codeflicker/skills/minimax-voice-clone/scripts/clone-tts.js"
DST="/Users/fat/work/minigame/game-aigc-product-hub/games/ks658651445853447417/package/assets/audio/voices"

declare -a PACKS=(
  "xiaomei|female-yujie|happy"
  "xiaoshuai|male-qn-jingying|happy"
  "kuergou|kuxiaogou_zhaocha_v1|happy"
  "lala|wangzhelala_doudizhu_v1|happy"
)

for line in "${PACKS[@]}"; do
  IFS='|' read -r ID VID EMO <<< "$line"
  echo "🎙️  $ID  ($VID)"
  mkdir -p "$DST/$ID"
  $CLI --skip-clone --voice-id "$VID" --model speech-02-hd --emotion "$EMO" "$TEXT" --out "$DST/$ID/$CLIP.mp3" 2>&1 | tail -2
done

echo ""
echo "✅ 全部生成完毕。请在 voice-packs.js 每个 pack.clips 里加:"
echo "  $CLIP: BASE + '<packId>/$CLIP.mp3'"
