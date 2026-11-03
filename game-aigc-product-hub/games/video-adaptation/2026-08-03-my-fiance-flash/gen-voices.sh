#!/bin/bash
# 苏小雨 F1-F10 + 结局 语音批量生成
set -e
export MINIMAX_API_KEY="sk-cp-f-rxe3hcdNB4I_kFui-rri0daIlraMmK6gtw2Yzi8LQBUm1X_AVdClkrYHfCMpq0H81RV0nFOclODyID89PKc6ks_62yjS41ZzYI4vV1U6GjovEqHcNKwdE"
export MINIMAX_GROUP_ID="2038909098828767900"

RUN_DIR="$HOME/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash"
AUDIO="$RUN_DIR/assets/audio"
CLONE="/Users/fat/.codeflicker/skills/minimax-voice-clone/scripts/clone-tts.js"
VID="female-tianmei"

gen() {
  local name=$1 emotion=$2 text=$3
  if [ -f "$AUDIO/$name.mp3" ] && [ "$name" != "voice-f1" ]; then
    echo "skip $name"; return
  fi
  node "$CLONE" --skip-clone --voice-id "$VID" "$text" --out "$AUDIO/$name.mp3" --emotion "$emotion" 2>&1 | tail -2
}

gen voice-f1 happy "你，你终于回来啦，饭快凉了呀。"
gen voice-f2 neutral "我等了一个多小时，你手是不是很冷？"
gen voice-f3 neutral "味道有变吗？我记得你说过要甜一点，姜少一点。"
gen voice-f4 happy "你先去楼上休息吧，二楼东边那间我打扫过了，和你走之前一样。"
gen voice-f5 sad "这个，这个别听了，扔了扔了。"
gen voice-f6 happy "你不要偷看哦，我要换成家里的睡衣了。"
gen voice-f7 happy "我今天学的新菜。"
gen voice-f8 sad "你先吃吧，我不饿。"
gen voice-f9 happy "是，我未婚夫。"
gen voice-f10 sad "你走的那十三年，我每天都想，你会不会突然回来敲我家门。后来我就每天做两份饭。"
gen voice-he happy "谢谢你，愿意花一辈子来还我。"
gen voice-ge neutral "这样，也挺好的。"
gen voice-ne sad "原来，我等错了人。"
echo "---DONE---"
ls -la "$AUDIO/"
