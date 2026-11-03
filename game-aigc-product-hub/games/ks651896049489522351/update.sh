#!/usr/bin/env bash
# ============================================================
# 一键更新：拉代码 + 重启斗地主服务端
#   ./update.sh                # 拉代码 + 重启（WS 8080 / H5 8766 / DouZero）
#   ./update.sh --skip-restart # 只拉代码，不重启
#   ./update.sh --skip-pull    # 只重启（拉码跳过，如只改了本地未提交代码）
# 说明：
#   - 本地未提交改动会自动 stash 并在更新后恢复（autostash），有冲突则中止且不重启；
#   - server 依赖变化时自动 npm install；
#   - 更新里若包含 scripts/migrations/ 下的 SQL 迁移，只提醒不自动执行；
#   - env 配置读取 server/.env（start-dev.sh 自动加载）。
# ============================================================
set -euo pipefail

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$GAME_DIR/server"
REPO_DIR="$(cd "$GAME_DIR/../.." && pwd)"
START_SCRIPT="$SERVER_DIR/scripts/start-dev.sh"
RUN_DIR="${DDZ_RUNTIME_DIR:-$GAME_DIR/.runtime}"
WS_PORT="${WS_PORT:-8080}"
H5_PORT="${H5_PORT:-8766}"

SKIP_PULL=0
SKIP_RESTART=0
for arg in "$@"; do
  case "$arg" in
    --skip-pull)    SKIP_PULL=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
    *) echo "[update] 未知参数: $arg（支持 --skip-pull / --skip-restart）" >&2; exit 1 ;;
  esac
done

if [ ! -f "$START_SCRIPT" ]; then
  echo "[update] 找不到 $START_SCRIPT" >&2
  exit 1
fi

# ---------------- 1. 拉代码 ----------------
if [ "$SKIP_PULL" = 0 ]; then
  cd "$REPO_DIR"
  BRANCH="$(git branch --show-current)"
  BEFORE="$(git rev-parse HEAD)"
  echo "[update] git pull --rebase origin ${BRANCH} ..."
  if ! git pull --rebase --autostash origin "$BRANCH"; then
    echo "[update] ❌ git pull 失败，已中止（旧服务继续运行，未重启）" >&2
    exit 1
  fi
  UNMERGED="$(git diff --name-only --diff-filter=U || true)"
  if [ -n "${UNMERGED:-}" ]; then
    echo "[update] ❌ 有未解决的冲突文件（autostash pop 冲突），请手动解决后再运行：" >&2
    echo "$UNMERGED" | sed 's/^/    /' >&2
    echo "[update] 旧服务继续运行，未重启" >&2
    exit 1
  fi
  AFTER="$(git rev-parse HEAD)"
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "[update] 本次更新带来的提交："
    git log --oneline "$BEFORE".."$AFTER" | sed 's/^/  /' || true
    # server 依赖变更 → 自动 npm install
    if [ -n "$(git -C "$GAME_DIR" diff --name-only "$BEFORE" "$AFTER" -- server/package.json server/package-lock.json || true)" ]; then
      echo "[update] server 依赖有变更，执行 npm install ..."
      (cd "$SERVER_DIR" && npm install)
    fi
    # 数据库迁移 → 提醒（不自动执行，防误伤数据）
    NEW_MIG="$(git -C "$GAME_DIR" diff --name-only "$BEFORE" "$AFTER" -- server/scripts/migrations || true)"
    if [ -n "${NEW_MIG:-}" ]; then
      echo "[update] ⚠️ 本次更新包含数据库迁移 SQL，人工确认后需手动执行："
      echo "$NEW_MIG" | sed 's/^/    /'
    fi
  else
    echo "[update] 远程无新提交，代码已是最新"
  fi

  # ---------------- IAP 档位 seed（以仓库 seed 文件为准拉齐） ----------------
  # 幂等 resync：仓库 scripts/data/iap-products.json 是档位唯一真相源，
  # 拉码后自动同步（改档位流程：admin 改 → db:seed:iap --export → git 提交 → 各机器 update 即齐）。
  # 新机器表未建时自动跑幂等的 db:init:mysql（建表+资金池+档位全套）。
  echo "[update] 同步 IAP 档位 seed ..."
  if ! (cd "$SERVER_DIR" && node scripts/seed-iap-products.js --resync); then
    echo "[update] seed 失败（多为表未建），自动执行幂等 db:init:mysql ..."
    if ! (cd "$SERVER_DIR" && npm run db:init:mysql); then
      echo "[update] ⚠️ db:init:mysql 失败：继续重启流程，若缺表 start 脚本会拒绝启动并给出提示" >&2
    fi
  fi
fi

if [ "$SKIP_RESTART" = 1 ]; then
  echo "[update] --skip-restart：本次仅拉代码，未重启服务"
  exit 0
fi

# ---------------- 2. 重启服务 ----------------
echo "[update] 重启服务（stop-dev.sh 由 start-dev.sh 内部先执行）..."
bash "$START_SCRIPT"

# ---------------- 3. 健康检查 ----------------
SERVER_PID="$(cat "$RUN_DIR/server.pid" 2>/dev/null || true)"
for _ in $(seq 1 20); do
  if [ -n "${SERVER_PID:-}" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[update] ❌ 服务进程（pid=$SERVER_PID）已退出，最近日志：" >&2
    tail -n 30 "$RUN_DIR/logs/server.log" >&2 || true
    exit 1
  fi
  if [ -n "$(lsof -tiTCP:"$WS_PORT" -sTCP:LISTEN 2>/dev/null)" ]; then
    echo "[update] ✅ 服务就绪  WS :$WS_PORT   H5 http://127.0.0.1:$H5_PORT/index.html   admin http://127.0.0.1:$WS_PORT/admin"
    tail -n 3 "$RUN_DIR/logs/server.log" 2>/dev/null || true
    # 真机联调提示：局域网 IP 需与 package/game.js 的 socket 地址一致
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [ -n "$LAN_IP" ]; then
      SOCK_IP="$(grep -oE '^[^/]*ws://[0-9.]+' "$GAME_DIR/package/game.js" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
      if [ -n "$SOCK_IP" ] && [ "$SOCK_IP" != "$LAN_IP" ]; then
        echo "[update] ⚠️ 真机联调提醒：当前局域网 IP=$LAN_IP，但 game.js 配置的是 $SOCK_IP，真机可能连不上（Wi-Fi 变了）"
      fi
    fi
    exit 0
  fi
  sleep 0.5
done

echo "[update] ❌ 等待 10s 后 :$WS_PORT 仍未监听，最近日志：" >&2
tail -n 30 "$RUN_DIR/logs/server.log" >&2 || true
exit 1
