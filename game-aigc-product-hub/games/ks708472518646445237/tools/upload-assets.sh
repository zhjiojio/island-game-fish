#!/bin/bash
# tools/upload-assets.sh — 将 assets/ 下的视频与首帧上传到 CDN
# 使用参考：games/ks654429322415476022 的同名脚本模式
# ⚠ 上传方式取决于平台实际提供的 CDN 上传通道，本脚本先输出「本地清单 + 目标 URL」，
#   实际上传按 KS-GAME AIGC-SoGame 桶的 kwai-cdn / kos / oss 工具替换。
#
# CDN 桶：https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks708472518646445237/
# 目录规则：CDN 上传时剥离 assets/ 前缀，assets/video/x.mp4 → <CDN>/video/x.mp4

set -e
BASE="https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks708472518646445237"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/assets"

[ -d "$ASSETS" ] || { echo "❌ 找不到 assets/ 目录：$ASSETS"; exit 1; }

echo "═══ 素材清单 ═══"
find "$ASSETS" -type f \( -name "*.mp4" -o -name "*.png" -o -name "*.mp3" -o -name "*.jpg" -o -name "*.webp" \) \
  | sed "s|$ASSETS/||" | sort > /tmp/ks708-assets.txt

total=$(wc -l < /tmp/ks708-assets.txt | tr -d ' ')
size=$(du -sh "$ASSETS" | awk '{print $1}')
echo "本地素材 $total 个，占用 $size"
echo "首 20 条："
head -20 /tmp/ks708-assets.txt | sed 's/^/  /'

echo ""
echo "═══ 上传方案 ═══"
echo "本项目 CDN 桶已在 tb-config.js 配置为："
echo "  $BASE/"
echo ""
echo "请使用 KS-GAME AIGC-SoGame 桶的官方上传通道（kwai-cdn-cli / kos / 内部平台上传页）"
echo "把以下映射逐一上传："
echo ""
while IFS= read -r f; do
  echo "  LOCAL: $ASSETS/$f"
  echo "  =>    $BASE/$f"
  echo ""
done < <(head -5 /tmp/ks708-assets.txt)
echo "..."
echo ""
echo "═══ 上传后请执行 bash tools/verify-cdn.sh 校验 ═══"
