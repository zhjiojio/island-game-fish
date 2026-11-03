#!/bin/bash
# 苏小雨 F11-F30 语音批量生成（复用 F1-F10 的 female-tianmei 音色）
set -e
export MINIMAX_API_KEY="sk-cp-f-rxe3hcdNB4I_kFui-rri0daIlraMmK6gtw2Yzi8LQBUm1X_AVdClkrYHfCMpq0H81RV0nFOclODyID89PKc6ks_62yjS41ZzYI4vV1U6GjovEqHcNKwdE"
export MINIMAX_GROUP_ID="2038909098828767900"
RUN_DIR="$HOME/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash"
AUDIO="$RUN_DIR/assets/audio"
CLONE="/Users/fat/.codeflicker/skills/minimax-voice-clone/scripts/clone-tts.js"
VID="female-tianmei"

gen() {
  local name=$1 emotion=$2 text=$3
  if [ -f "$AUDIO/$name.mp3" ]; then
    echo "skip $name"; return
  fi
  echo "→ $name ($emotion)"
  node "$CLONE" --skip-clone --voice-id "$VID" "$text" --out "$AUDIO/$name.mp3" --emotion "$emotion" 2>&1 | tail -2
}

# F11 秘密揭露 · 22 岁的选择
gen voice-f11 sad "当时我妈问我为什么，我说，我要在这里等他回来。她还笑我傻。"
# F12 广告B · 湿发睡衣
gen voice-f12 happy "你，你别看我，头发还没吹干。"
# F13 触碰 · 沙发靠肩
gen voice-f13 happy "我心跳好快，你别听。"
# F14 情敌 · 老同学送花（她背后小声）
gen voice-f14 neutral "别理他。"
# F15 老同学挑衅（她泪如雨下）
gen voice-f15 sad "别理他，我们回家。"
# F16 生病照顾
gen voice-f16 sad "我没事，你不用管。"
# F17 相册回忆 · 娃娃亲信
gen voice-f17 neutral "原来叔叔真的知道。"
# F18 广告C · 湿发浴袍
gen voice-f18 sad "帮我拿一下毛巾，好冷。"
# F19 雨夜共伞
gen voice-f19 happy "你走得慢点，伞不够大。"
# F20 樱花树下差点表白
gen voice-f20 happy "你想说什么？"
# F21 出差分别
gen voice-f21 sad "这个是备用的，你在飞机上吃。"
# F22 机场重逢
gen voice-f22 happy "欢迎回家小弟弟。"
# F23 广告D · 车里差点亲吻
gen voice-f23 happy "你，你干嘛。"
# F24 家庭见证（她妈的话）
gen voice-f24 neutral "什么时候把婚事办了？"
# F25 求婚彩排
gen voice-f25 happy "哎哎导演你演过头了。"
# F26 婚前危机 · 谣言
gen voice-f26 sad "我该怎么办。"
# F27 你的抉择
gen voice-f27 sad "你还要我吗？"
# F28 广告E · 白色婚纱试穿
gen voice-f28 happy "好看吗？我妈说这条最像我。"
# F29 婚前夜阳台告白
gen voice-f29 happy "明天我就是你的新娘啦。"
# F30 结局引导
gen voice-f30 neutral "我们的故事，走到这里了。"
# BE 结局
gen voice-be sad "本来我可以等你一辈子的。"
echo "---DONE---"
ls -la "$AUDIO/" | grep voice
