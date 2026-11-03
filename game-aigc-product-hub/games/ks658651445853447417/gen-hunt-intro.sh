#!/usr/bin/env bash
# ⭐ v1.0.59: 生成「寻找隐藏物」专用 intro 语音（scene_hunt_intro.mp3）到全部 5 个语音包
set -e
export MINIMAX_API_KEY="sk-cp-f-rxe3hcdNB4I_kFui-rri0daIlraMmK6gtw2Yzi8LQBUm1X_AVdClkrYHfCMpq0H81RV0nFOclODyID89PKc6ks_62yjS41ZzYI4vV1U6GjovEqHcNKwdE"
export MINIMAX_GROUP_ID="2038909098828767900"
CLI="node /Users/fat/.codeflicker/skills/minimax-voice-clone/scripts/clone-tts.js"
DST="/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/assets/audio/voices"
CLIP="scene_hunt_intro"
TEXT="老铁看好啦！这一关咱得在画里头找出隐藏物，眼神儿放尖着点儿～"

declare -a PACKS=(
  "xiaomei|female-yujie|happy"
  "xiaoshuai|male-qn-jingying|happy"
  "kuergou|kuxiaogou_zhaocha_v1|happy"
  "lala|wangzhelala_doudizhu_v1|happy"
  "longaotian|male-qn-badao|happy"
)

for line in "${PACKS[@]}"; do
  IFS='|' read -r ID VID EMO <<< "$line"
  echo "🎙️  $ID  ($VID)"
  mkdir -p "$DST/$ID"
  $CLI --skip-clone --voice-id "$VID" --model speech-02-hd --emotion "$EMO" "$TEXT" --out "$DST/$ID/$CLIP.mp3" 2>&1 | tail -2
done
echo "✅ 完成"
ls -la $DST/*/scene_hunt_intro.mp3
