#!/bin/bash
# 《我的未婚妻》自测预检一键脚本
# 用法：bash scripts/self-test/run-all.sh
set -e
cd "$(dirname "$0")/../.."

echo "==== [1/5] 语法检查 ===="
node -c js/main-v42.js && echo "  ✓ main-v42.js"
node -c js/story.js    && echo "  ✓ story.js"
node -c js/subtitles.js && echo "  ✓ subtitles.js"

echo "==== [2/5] 根白名单文件 ===="
for f in game.json game.js index.html project.config.json kwaiadapter.js wxhelper.js events.js; do
  test -f "$f" || { echo "  ✗ MISS: $f"; exit 1; }
  echo "  ✓ $f"
done

echo "==== [3/5] 活代码 ===="
for f in js/main-v42.js js/story.js js/subtitles.js js/achievements.js js/icons.js js/ks-adapter.js; do
  test -f "$f" || { echo "  ✗ MISS: $f"; exit 1; }
  echo "  ✓ $f"
done

echo "==== [4/5] 关键资源 ===="
for f in assets/poster/cover-text.png images/fx/dont-touch.png; do
  test -f "$f" || { echo "  ✗ MISS: $f"; exit 1; }
  echo "  ✓ $f"
done
frames_count=$(ls assets/frames/ 2>/dev/null | grep -E '\.(jpg|png)$' | wc -l | tr -d ' ')
echo "  ✓ assets/frames/ = ${frames_count} 张（jpg/png）"
[ "$frames_count" -ge 10 ] || { echo "  ✗ 帧数不足 10"; exit 1; }
echo "  ℹ  视频走 CDN 动态下载（v29 分级加载策略），不本地校验"

echo "==== [5/5] ksmg 补丁状态 ===="
if grep -q "cp -R" /Users/Shared/ksmg/ksmg-cli.js 2>/dev/null; then
  echo "  ✓ ksmg-cli.js 已打补丁 (cp -R 模式)"
else
  echo "  ✗ ksmg 未打补丁！参考 CLAUDE.md 修复"
  exit 2
fi

echo ""
echo "🎉 全部预检通过，可以进入 ksmg preview 扫码阶段"
echo "   下一步：bash <SKILL_DIR>/scripts/ksmg-preview.sh preview \$(pwd) ks712131693858878897"
