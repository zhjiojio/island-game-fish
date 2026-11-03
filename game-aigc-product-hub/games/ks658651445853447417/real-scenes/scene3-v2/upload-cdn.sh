#!/usr/bin/env bash
# 从 hunt-v2/lvN.jpg 拷贝为 s3_lvN.jpg 后上传 CDN（--no-replace 保护同名）
set -e
cd "$(dirname "$0")"
PKG=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package
CDN=/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/skills/agw-cdn/cdn-upload.js
STAGE=$PKG/assets/scenes/hunt-v2-cdn

mkdir -p "$STAGE"

# 拷贝重命名
FILES_ARG=""
for f in $PKG/assets/scenes/hunt-v2/lv*.jpg; do
  [ -e "$f" ] || continue
  N=$(basename "$f" .jpg)  # lv10
  DEST=$STAGE/s3_${N}.jpg
  cp "$f" "$DEST"
  REL=assets/scenes/hunt-v2-cdn/s3_${N}.jpg
  FILES_ARG="${FILES_ARG}${REL},"
done
FILES_ARG=${FILES_ARG%,}
echo "上传文件列表: $FILES_ARG"

node $CDN "$PKG" ks658651445853447417 \
  --files=$FILES_ARG \
  --token=14_da7d82d193d14fc536c0a1ce0cc0c2e9 \
  --no-replace
