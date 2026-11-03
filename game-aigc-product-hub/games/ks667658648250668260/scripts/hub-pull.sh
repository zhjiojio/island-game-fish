#!/usr/bin/env bash
# scripts/hub-pull.sh
# 【开发前必跑】拉取 hub 云端 dev 最新代码 → 覆盖本地 weihunqi 工作区
#
# 规则:
#   1. hub 是权威源（云端最新）
#   2. 本地未提交改动会阻断（避免误覆盖）
#   3. hub 只同步 games/ks667658648250668260/ 子目录到本地根

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/hub-sync-common.sh"

say "拉取 hub 云端 dev 最新 → 本地 weihunqi"

# ─────── 1. 本地未提交改动检测 ───────
cd "${WEIHUNQI_LOCAL}"
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
if [ "${DIRTY}" != "0" ]; then
  warn "本地有 ${DIRTY} 项未提交改动:"
  git status --short | head -10
  echo ""
  read -p "继续会覆盖冲突文件, 确认继续? (y/N) " ans
  [[ "${ans}" =~ ^[Yy]$ ]] || die "已取消 (请先 commit 或 stash)"
fi

# ─────── 2. hub 拉最新 ───────
cd "${HUB_ROOT}"
say "hub: git fetch + pull origin/${HUB_BRANCH}"

HUB_DIRTY=$(git status --porcelain "${HUB_TARGET}" 2>/dev/null | wc -l | tr -d ' ')
if [ "${HUB_DIRTY}" != "0" ]; then
  warn "hub 里 ${APPID} 目录有未提交改动, 先 stash"
  git stash push -m "hub-pull auto-stash $(date +%F-%H%M)" -- "${HUB_TARGET}"
fi

git fetch origin "${HUB_BRANCH}" 2>&1 | tail -3
CUR_BR=$(git branch --show-current)
if [ "${CUR_BR}" != "${HUB_BRANCH}" ]; then
  git checkout "${HUB_BRANCH}"
fi
git pull --ff-only origin "${HUB_BRANCH}" 2>&1 | tail -3
ok "hub 已到最新: $(git log --oneline -1)"

# ─────── 3. rsync hub → 本地 ───────
say "rsync ${APPID}/ → weihunqi 本地"
rsync -a --delete-after \
  "${RSYNC_EXCLUDES[@]}" \
  "${HUB_TARGET}/" "${WEIHUNQI_LOCAL}/" \
  | tail -5

# ─────── 4. 校验 ───────
LOCAL_VER=$(read_meta_version)
ok "本地版本: ${LOCAL_VER}"
ok "拉取完成. 现在可以开始开发."

echo ""
echo "─────────────────────────────"
echo "  下一步: 修改代码 → build"
echo "  build 完记得跑: scripts/hub-push.sh"
echo "─────────────────────────────"
