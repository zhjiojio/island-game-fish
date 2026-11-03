#!/bin/bash
# 验证找茬游戏全部 CDN 资源（非关卡场景图）的可用性
P5='https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/'
P1='https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/'

# 1) 配置 JSON
echo "CONFIG"
echo "$P1"'levels-config-v3.json'

# 2) BGM ×3
echo "BGM"
echo "${P5}bgm_1_chiptune.mp3"
echo "${P5}bgm_2_northeast.mp3"
echo "${P5}bgm_3_disco.mp3"

# 3) 主题封面（当前远程配置下发，非关卡内图片）
echo "COVER"
echo "https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1787843304753/封面.png"
echo "${P5}cover_scene1.jpg"
echo "https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1787760722303/封面图.png"
echo "https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1788370616160/niulai_grassland_16x9.png"

# 4) 语音包 156 条
echo "VOICE"
cat "$(dirname "$0")/voice-urls.txt"
