#!/usr/bin/env bash
# 压缩 generated/lv{N}.jpg 后复制到 package/assets/scenes/hunt-v2/lv{N}.jpg
set -e
cd "$(dirname "$0")"
PKG=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package
DEST=$PKG/assets/scenes/hunt-v2
mkdir -p "$DEST"

for f in generated/lv*.jpg; do
  [ -e "$f" ] || continue
  N=$(basename "$f" .jpg)
  OUT=$DEST/${N}.jpg
  # 压缩到 <500KB · 质量 78 · 保持 2048 宽度
  # 使用 sips + jpegoptim（macOS）
  if [ -e "$OUT" ] && [ "$(stat -f%m "$OUT")" -gt "$(stat -f%m "$f")" ]; then
    echo "✓ $N 已压缩且较新"
    continue
  fi
  cp "$f" "$OUT.tmp"
  # 用 sips 缩到宽 1600（够 canvas 用）+ 质量优先
  sips -Z 1600 -s formatOptions 75 --setProperty format jpeg "$OUT.tmp" --out "$OUT" >/dev/null 2>&1
  rm -f "$OUT.tmp"
  SZ=$(wc -c < "$OUT" | tr -d ' ')
  echo "✓ $N → $OUT ($SZ B)"
done

echo ""
echo "=== 汇总 ==="
ls -la "$DEST/" 2>/dev/null | head -25
du -sh "$DEST/"
