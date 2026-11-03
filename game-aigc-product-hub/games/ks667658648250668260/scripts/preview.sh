#!/bin/bash
# preview.sh —— 按白名单拷贝到 dist/，作为快小游戏工具的真正上传源
#
# 用法：
#   bash scripts/preview.sh          # 拷贝 + 打印统计
#   bash scripts/preview.sh --zip    # 拷贝完再打包成 dist.zip 试算真实包体
#
# 之后：把快小游戏开发者工具的项目根切到 dist/，扫码预览

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

DIST="$REPO/dist"

echo "🧹 清空 dist/ ..."
rm -rf "$DIST"
mkdir -p "$DIST"

echo "🔍 跑白名单健康度检查..."
node scripts/tools/preview-check.js || {
  echo "❌ 健康度检查未通过，请修 packing.whitelist.json 或删大文件"
  exit 1
}

echo "📦 按白名单拷贝到 dist/ ..."
node scripts/tools/preview-pack.js "$DIST"

echo ""
echo "📊 dist/ 实际大小："
du -sh "$DIST"
echo ""
du -sh "$DIST"/* 2>/dev/null | sort -h | tail -10

if [ "$1" = "--zip" ]; then
  echo ""
  echo "🗜  试算 zip 体积..."
  cd "$DIST"
  zip -qr "$REPO/dist.zip" .
  cd "$REPO"
  zip_size=$(du -h dist.zip | cut -f1)
  echo "   dist.zip = $zip_size"
  echo "   (快小游戏包体上限 20MB，超过就会打包失败)"
fi

echo ""
echo "✅ 完成。快小游戏工具的项目根请切到 $DIST"
