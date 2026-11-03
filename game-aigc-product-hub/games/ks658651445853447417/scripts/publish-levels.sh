#!/bin/bash
# 一键发布关卡：gen-levels-config.js + 上传 CDN
# 用法：bash scripts/publish-levels.sh
# 无需 ksmg build，新增关卡 3 分钟内生效！

set -e
GAME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGW_DIR="$HOME/.codeflicker/remote-personal-skills/agw-work-mode"

echo "=== Step1: 生成 levels-config.json ==="
cd "$GAME_DIR"
node scripts/gen-levels-config.js

echo ""
echo "=== Step2: 上传到 CDN ==="
node scripts/upload-levels-json.js
