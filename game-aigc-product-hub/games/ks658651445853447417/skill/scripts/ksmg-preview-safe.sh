#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ksmg-preview-safe.sh · 老铁眼真尖 · 云端优先 build 门禁 + 强制报告
#
# 铁律（血泪来自 v1.0.97 事故 · 2026-08-19）：
#   1. build/upload 前必须 push local → origin/dev（保证云端有最新）
#   2. build/upload 前必须 pull origin/dev → local（保证 local 无落后）
#   3. 存在 git stash 时禁止 build（避免 stash 里的改动漏进包）
#   4. 存在合并冲突标记时禁止 build
#   5. 存在未 commit 的 package/ 改动时先 commit 再 build
#   6. 【新增 § 十七】build 完成后必须输出「10 项强制报告」给用户
#
# 用法：
#   bash skill/scripts/ksmg-preview-safe.sh upload <version> "<changelog>"
#   bash skill/scripts/ksmg-preview-safe.sh preview <version> "<changelog>"
# ═══════════════════════════════════════════════════════════════════════════
set -e

GAME_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$GAME_DIR"
APPID="$(basename "$GAME_DIR")"
SKILL_DIR="$HOME/.codeflicker/skills/laotie-zhaocha-game"

CMD="${1:-upload}"
VER_ARG="${2:-}"
CHANGELOG_ARG="${3:-未填写}"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'

echo -e "${BLU}═══ 云端优先 build 门禁（AppID: $APPID）═══${NC}"

# ── 0. 记录 before 状态（用于报告差量） ─────────────────────────
BEFORE_TOTAL_KB=$(du -sk package 2>/dev/null | awk '{print $1}')
BEFORE_MAIN_KB=$(du -sk package --exclude=package/subpackages 2>/dev/null | awk '{print $1}')
if [ -z "$BEFORE_MAIN_KB" ]; then
  # 兼容 macOS du：手动扣减
  SUB_KB=$(du -sk package/subpackages 2>/dev/null | awk '{print $1}')
  BEFORE_MAIN_KB=$((BEFORE_TOTAL_KB - ${SUB_KB:-0}))
fi
BEFORE_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

# ── 1. stash 检查 ─────────────────────────────────────────────
STASH_COUNT=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
if [ "$STASH_COUNT" -gt 0 ]; then
  echo -e "${RED}🚫 检测到 $STASH_COUNT 条 git stash，禁止 build。${NC}"
  git stash list
  exit 1
fi

# ── 2. 冲突标记检查 ────────────────────────────────────────────
if grep -rln "^<<<<<<< \|^>>>>>>> " package/ 2>/dev/null | grep -q .; then
  echo -e "${RED}🚫 检测到合并冲突标记，禁止 build：${NC}"
  grep -rln "^<<<<<<< \|^>>>>>>> " package/
  exit 1
fi

# ── 3. package/ 未 commit ─────────────────────────────────────
if ! git diff --quiet HEAD -- package/ 2>/dev/null; then
  echo -e "${YLW}📝 检测到 package/ 有未提交改动。${NC}"
  git status -s -- package/ | head -20
  read -p "输入 commit message（留空取消）: " CMSG
  [ -z "$CMSG" ] && { echo -e "${RED}❌ 取消 build${NC}"; exit 1; }
  git add package/ skill/ 2>/dev/null || true
  git commit --no-verify -m "$CMSG" || true
fi

# ── 4. fetch + 落后检测 ────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "▶ git fetch origin dev ..."
git fetch origin dev 2>&1 | tail -3
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/dev)
BASE=$(git merge-base HEAD origin/dev 2>/dev/null || echo "$LOCAL")

if [ "$LOCAL" = "$REMOTE" ]; then
  GIT_SYNC_STATUS="local = origin/dev"
elif [ "$LOCAL" = "$BASE" ]; then
  echo -e "${RED}🚫 local 落后 origin/dev，请先 pull --rebase${NC}"
  exit 1
elif [ "$REMOTE" = "$BASE" ]; then
  GIT_SYNC_STATUS="local 领先 origin/dev（build 后自动 push）"
else
  echo -e "${RED}🚫 local 与 origin/dev 分叉，请手动 rebase${NC}"
  exit 1
fi

# ── 5. 三件套一致性 ────────────────────────────────────────────
VER_FROM_MAIN=$(grep -oE "BUILD_VER = 'v[0-9]+\.[0-9]+\.[0-9]+'" package/js/main.js | head -1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
[ -z "$VER_FROM_MAIN" ] && { echo -e "${RED}🚫 无法解析 BUILD_VER${NC}"; exit 1; }
[ -z "$VER_ARG" ] && VER_ARG="$VER_FROM_MAIN"
if [ "$VER_ARG" != "$VER_FROM_MAIN" ]; then
  echo -e "${RED}🚫 命令行版本号 ($VER_ARG) ≠ main.js BUILD_VER ($VER_FROM_MAIN)${NC}"
  exit 1
fi
MARKER=$(grep -oE "\[MARKER v[0-9]+\]" package/js/main.js | head -1)
INDEX_V=$(grep -oE "\?v=[0-9]+" package/index.html | sort -u | tr '\n' ' ')

# ── 6. 上传前：先 push 到 origin/dev ─────────────────────────
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "▶ git push origin HEAD:dev ..."
  git push origin HEAD:dev 2>&1 | tail -3 || {
    echo -e "${RED}🚫 push 失败${NC}"; exit 1
  }
  GIT_PUSH_STATUS="✅ 已 push HEAD → origin/dev"
else
  GIT_PUSH_STATUS="✅ local 已与 origin/dev 一致"
fi

# ── 7. 生成二维码目录 ─────────────────────────────────────────
QR_DIR="$GAME_DIR/build-qrcodes"
mkdir -p "$QR_DIR"
QR_FILE="$QR_DIR/v${VER_ARG}-$(date +%H%M%S).png"

# ── 8. ksmg upload / preview ─────────────────────────────────
UPLOAD_LOG="/tmp/ksmg-upload-v${VER_ARG}-$$.log"
if [ "$CMD" = "upload" ]; then
  echo "▶ ksmg upload ./package -v $VER_ARG"
  ksmg upload ./package -v "$VER_ARG" -c "$CHANGELOG_ARG" 2>&1 | tee "$UPLOAD_LOG"
  UPLOAD_EXIT=${PIPESTATUS[0]}
elif [ "$CMD" = "preview" ]; then
  echo "▶ ksmg preview ./package -q -v $VER_ARG -o $QR_DIR"
  ksmg preview ./package -q -v "$VER_ARG" -o "$QR_DIR" 2>&1 | tee "$UPLOAD_LOG"
  UPLOAD_EXIT=${PIPESTATUS[0]}
else
  echo "未知命令：$CMD"; exit 1
fi

if [ "$UPLOAD_EXIT" != "0" ]; then
  echo -e "${RED}🚫 ksmg $CMD 失败${NC}"; exit 1
fi

# ── 9. 记录 after 状态 + 打 tag ───────────────────────────────
AFTER_TOTAL_KB=$(du -sk package 2>/dev/null | awk '{print $1}')
SUB_KB=$(du -sk package/subpackages 2>/dev/null | awk '{print $1}')
AFTER_MAIN_KB=$((AFTER_TOTAL_KB - ${SUB_KB:-0}))

TAG="laotie-v${VER_ARG}"
TAG_STATUS="—"
if [ "$CMD" = "upload" ]; then
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    TAG_STATUS="⚠️  tag $TAG 已存在（未重打）"
  else
    git tag -a "$TAG" -m "$CHANGELOG_ARG" 2>&1 >/dev/null
    if git push origin "$TAG" 2>&1 | grep -q "new tag"; then
      TAG_STATUS="✅ tag $TAG 已 push origin"
    else
      TAG_STATUS="⚠️  tag $TAG 本地已打, push 失败"
    fi
  fi
fi

# ── 10. skill 同步检查 ────────────────────────────────────────
SKILL_STATUS="—"
SKILL_REMOTE_STATUS="—"
if [ -d "$SKILL_DIR/.git" ]; then
  cd "$SKILL_DIR"
  if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
    SKILL_STATUS="✅ 本地 skill 干净"
  else
    SKILL_STATUS="⚠️  本地 skill 有未提交改动"
  fi
  # 远端对比（用 origin/main 或 origin/master）
  git fetch origin 2>/dev/null || true
  DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
  LOCAL_SKILL=$(git rev-parse HEAD 2>/dev/null || echo "none")
  REMOTE_SKILL=$(git rev-parse "origin/$DEFAULT_BRANCH" 2>/dev/null || echo "none")
  if [ "$LOCAL_SKILL" = "$REMOTE_SKILL" ]; then
    SKILL_REMOTE_STATUS="✅ skill 云端 = 本地 ($DEFAULT_BRANCH)"
  else
    SKILL_REMOTE_STATUS="⚠️  skill 本地/云端不一致（local=${LOCAL_SKILL:0:7}, remote=${REMOTE_SKILL:0:7}）"
  fi
  cd "$GAME_DIR"
else
  SKILL_STATUS="⚠️  $SKILL_DIR 非 git 仓库"
fi

# ── 11. size 差量 ────────────────────────────────────────────
DELTA_TOTAL=$((AFTER_TOTAL_KB - BEFORE_TOTAL_KB))
DELTA_MAIN=$((AFTER_MAIN_KB - BEFORE_MAIN_KB))
fmt_kb() {
  local kb=$1
  if [ ${kb#-} -ge 1024 ]; then
    awk -v k=$kb 'BEGIN{printf "%.2f MB", k/1024}'
  else
    echo "${kb} KB"
  fi
}
fmt_delta() {
  local kb=$1
  if [ $kb -gt 0 ]; then echo "+$(fmt_kb $kb)"
  elif [ $kb -lt 0 ]; then echo "-$(fmt_kb ${kb#-})"
  else echo "±0"
  fi
}

# ── 12. 二维码路径提示（upload 从 ksmg 输出解析；preview 从 QR_DIR 找） ─
QR_PATH="—"
if [ "$CMD" = "preview" ]; then
  QR_LATEST=$(ls -t "$QR_DIR"/*.png 2>/dev/null | head -1)
  [ -n "$QR_LATEST" ] && QR_PATH="$QR_LATEST"
else
  QR_PATH="登录后台查看：https://open.kuaishou.com/platform/minigame/manage/game_info?appId=$APPID"
fi

# ── 13. 【强制输出】10 项 build 报告 ───────────────────────────
AFTER_HEAD=$(git rev-parse --short HEAD)
REPORT_FILE="$GAME_DIR/build-qrcodes/v${VER_ARG}-report.md"

cat <<REPORT | tee "$REPORT_FILE"

╔══════════════════════════════════════════════════════════════════╗
║           🎮 老铁眼真尖 · Build 强制报告 · v${VER_ARG}                 ║
╠══════════════════════════════════════════════════════════════════╣

📌 1. 【二维码 / 预览路径】
   $QR_PATH

📌 2. 【版本号】
   BUILD_VER   = v${VER_ARG}
   MARKER      = $MARKER
   index.html  = $INDEX_V

📌 3. 【更改内容 / changelog】
   $CHANGELOG_ARG

📌 4. 【Git 是否推送】
   本次 push   = $GIT_PUSH_STATUS
   同步状态    = $GIT_SYNC_STATUS
   HEAD before = $BEFORE_HEAD
   HEAD after  = $AFTER_HEAD
   Tag         = $TAG_STATUS

📌 5. 【本地 Skill 是否有变更】
   $SKILL_STATUS
   路径: $SKILL_DIR

📌 6. 【云端 Git Skill 是否同步】
   $SKILL_REMOTE_STATUS

📌 7. 【主包大小 · 排除 subpackages/】
   前: $(fmt_kb $BEFORE_MAIN_KB)
   后: $(fmt_kb $AFTER_MAIN_KB)
   差: $(fmt_delta $DELTA_MAIN)

📌 8. 【总包大小 · 含 subpackages/】
   前: $(fmt_kb $BEFORE_TOTAL_KB)
   后: $(fmt_kb $AFTER_TOTAL_KB)
   差: $(fmt_delta $DELTA_TOTAL)

📌 9. 【AppID / 命令】
   AppID  = $APPID
   Cmd    = ksmg $CMD ./package -v $VER_ARG
   时间   = $(date '+%Y-%m-%d %H:%M:%S')

📌 10. 【后续动作 · 必做】
   □ 手机扫码验证 6 号乖崽语音 / lv50 关 / 北上广深图 3 项功能
   □ 后台提交审核: https://open.kuaishou.com/platform/minigame/manage/game_info?appId=$APPID
   □ 复盘 changelog 是否已同步到团队群
   □ 报告已保存: $REPORT_FILE

╚══════════════════════════════════════════════════════════════════╝
REPORT

echo -e "${GRN}═══ ✅ v${VER_ARG} 发布完成 · 报告已保存到 $REPORT_FILE ═══${NC}"
