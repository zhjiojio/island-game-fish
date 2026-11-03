#!/usr/bin/env bash
# scripts/hub-sync-common.sh
# 未婚妻 <-> game-aigc-product-hub 双向同步 · 共享配置
# 参考: 老铁眼真尖 (games/ks658651445853447417) 的 build 流程

set -euo pipefail

# ─────── 路径 ───────
export WEIHUNQI_LOCAL="/Users/fat/weihunqi"
export HUB_ROOT="/Users/fat/work/minigame/game-aigc-product-hub"
export APPID="ks667658648250668260"
export HUB_TARGET="${HUB_ROOT}/games/${APPID}"
export HUB_BRANCH="dev"

# ─────── 排除清单（本地素材 → 走 CDN，不入仓） ───────
# rsync --exclude 语法
export RSYNC_EXCLUDES=(
  --exclude='.git/'
  --exclude='node_modules/'
  --exclude='.DS_Store'
  --exclude='tmp/'
  --exclude='assets/'
  --exclude='assets_gen/'
  --exclude='materials-src/'
  --exclude='dist.zip'
  --exclude='*.log'
  --exclude='.venv/'
  --exclude='scripts/subtitles/.venv/'
  --exclude='scripts/deprecated/'
)

# ─────── 颜色输出 ───────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
say() { echo -e "${BLUE}[hub-sync]${NC} $*"; }
ok()  { echo -e "${GREEN}✅${NC} $*"; }
warn(){ echo -e "${YELLOW}⚠️${NC}  $*"; }
die() { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }

# ─────── 读版本号 ───────
read_meta_version() {
  grep -E '"version"' "${WEIHUNQI_LOCAL}/content/meta.json" | head -1 | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/'
}
