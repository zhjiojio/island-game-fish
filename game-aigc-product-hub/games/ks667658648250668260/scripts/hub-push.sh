#!/usr/bin/env bash
# scripts/hub-push.sh
# 【每次 build 完必跑】把本地 weihunqi 最新代码推到 hub 云端 dev
#
# 流程:
#   1. 本地版本号读取 (content/meta.json .version)
#   2. 冲突/未 build 检测
#   3. rsync 本地 → hub/games/ks667658648250668260/
#   4. hub 侧 git add + commit + push origin HEAD:dev
#   5. 输出 10 项强制报告落盘

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/hub-sync-common.sh"

# ─────── 1. 参数 & 版本号 ───────
VER=$(read_meta_version)
[ -z "${VER}" ] && die "读不到 content/meta.json .version"

CHANGELOG_MSG="${1:-}"
if [ -z "${CHANGELOG_MSG}" ]; then
  warn "未传 changelog, 使用默认 (强烈建议传第 1 个参数!)"
  CHANGELOG_MSG="build ${VER}"
fi

say "推送 weihunqi ${VER} → hub"

# ─────── 2. 本地干净度自检 ───────
cd "${WEIHUNQI_LOCAL}"
say "本地自检"

# JS 语法
for f in package/js/main.js package/js/story.js package/js/subtitles.js package/js/registry.js; do
  [ -f "$f" ] || continue
  out=$(node -c "$f" 2>&1)
  [ -z "$out" ] || die "JS 语法错: $f\n$out"
done
ok "JS 语法过"

# 冲突标记
CONFLICTS=$(grep -rln '^<<<<<<< ' js/ 2>/dev/null || true)
[ -z "${CONFLICTS}" ] || die "有 merge 冲突标记未清: ${CONFLICTS}"
ok "无冲突标记"

# stash 数
STASH_N=$(git stash list | wc -l | tr -d ' ')
[ "${STASH_N}" -lt 5 ] || warn "stash 已 ${STASH_N} 条, 建议清理"

# ─────── 3. hub 拉最新 (避免推送冲突) ───────
cd "${HUB_ROOT}"
say "hub 拉最新 origin/${HUB_BRANCH}"
CUR_BR=$(git branch --show-current)
if [ "${CUR_BR}" != "${HUB_BRANCH}" ]; then
  git checkout "${HUB_BRANCH}"
fi
git pull --ff-only origin "${HUB_BRANCH}" 2>&1 | tail -3

# ─────── 4. rsync 本地 → hub ───────
say "rsync weihunqi → hub/${APPID}/"
mkdir -p "${HUB_TARGET}"
rsync -a --delete-after \
  "${RSYNC_EXCLUDES[@]}" \
  "${WEIHUNQI_LOCAL}/" "${HUB_TARGET}/" \
  | tail -5

CHANGES=$(cd "${HUB_ROOT}" && git status --porcelain "games/${APPID}/" | wc -l | tr -d ' ')
if [ "${CHANGES}" = "0" ]; then
  ok "无变化, 无需推送"
  exit 0
fi
say "变化文件数: ${CHANGES}"

# ─────── 5. commit + push ───────
cd "${HUB_ROOT}"
git add "games/${APPID}/"

COMMIT_MSG="feat(weihunqi ${VER}): ${CHANGELOG_MSG}

AppID: ${APPID}
本地路径: /Users/fat/weihunqi
时间: $(date '+%F %T')"

git commit -m "${COMMIT_MSG}" 2>&1 | tail -3
say "推送 origin/${HUB_BRANCH}"
git push origin "HEAD:${HUB_BRANCH}" 2>&1 | tail -5
ok "hub 已更新"

# ─────── 6. 落盘报告 ───────
REPORT="${WEIHUNQI_LOCAL}/build-qrcodes/${VER}-report.md"
mkdir -p "$(dirname "${REPORT}")"
DIST_SIZE=$(du -sh "${WEIHUNQI_LOCAL}/dist" 2>/dev/null | awk '{print $1}')
HUB_HASH=$(cd "${HUB_ROOT}" && git rev-parse --short HEAD)

cat > "${REPORT}" <<EOF
# 🎮 未婚妻 · Build 强制报告 · ${VER}

📌 1. AppID: ${APPID}
📌 2. 版本号: ${VER}  (content/meta.json .version)
📌 3. Changelog: ${CHANGELOG_MSG}
📌 4. 本地 git: $(cd "${WEIHUNQI_LOCAL}" && git log --oneline -1)
📌 5. Hub 分支: ${HUB_BRANCH}
📌 6. Hub 提交: ${HUB_HASH} · $(cd "${HUB_ROOT}" && git log --oneline -1)
📌 7. 推送状态: ✅ 已到 origin/${HUB_BRANCH}
📌 8. 主/总包大小: ${DIST_SIZE} (dist/)
📌 9. 时间: $(date '+%F %T')
📌 10. Hub 目录: https://git.corp.kuaishou.com/kwai-game/game-aigc/game-aigc-product-hub/-/tree/${HUB_BRANCH}/games/${APPID}

## 变化文件 (${CHANGES} 项)
\`\`\`
$(cd "${HUB_ROOT}" && git show --stat HEAD | head -30)
\`\`\`
EOF

ok "报告已落盘: ${REPORT}"

# 报告本身也 sync 一次到 hub (纯静态, 不再触发 commit)
rsync -a "${REPORT}" "${HUB_TARGET}/build-qrcodes/" 2>/dev/null || true

echo ""
echo "═════════════════════════════════════════"
echo "  ✅ build ${VER} 已推送云端"
echo "  📄 报告: build-qrcodes/${VER}-report.md"
echo "  🌐 hub:  games/${APPID}/  @ ${HUB_HASH}"
echo "═════════════════════════════════════════"
