#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/package"
RUN_DIR="${DDZ_RUNTIME_DIR:-$ROOT_DIR/.runtime}"
LOG_DIR="$RUN_DIR/logs"
SERVER_PID_FILE="$RUN_DIR/server.pid"
H5_PID_FILE="$RUN_DIR/h5.pid"
WS_PORT="${WS_PORT:-8080}"
H5_PORT="${H5_PORT:-8766}"
H5_HOST="${H5_HOST:-127.0.0.1}"
STOP_SCRIPT="$SCRIPTS_DIR/stop-dev.sh"
DOUZERO_START_SCRIPT="$ROOT_DIR/douzero-service/scripts/start.sh"

if [ -f "$SERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SERVER_DIR/.env"
  set +a
fi

usage() {
  cat <<'EOF'
Usage:
  ./scripts/start-dev.sh

Examples:
  ./scripts/start-dev.sh          # MySQL + all local features

Environment overrides:
  WS_PORT=8081 H5_PORT=8767 ./scripts/start-dev.sh
  DDZ_BOT_MATCH_ENABLED=false ./scripts/start-dev.sh
  DDZ_VOICE_CHAT_ENABLED=false ./scripts/start-dev.sh
  DDZ_VOICE_TRADE_ENABLED=false ./scripts/start-dev.sh
  DDZ_MYSQL_HOST=127.0.0.1 DDZ_MYSQL_USER=root DDZ_MYSQL_DATABASE=ddz ./scripts/start-dev.sh

Notes:
  - MySQL is the only supported DB (SQLite support removed).
  - all local feature flags are enabled by default: bot matchmaking, voice chat, and voice-pack trade.
  - each feature can still be disabled explicitly through its DDZ_*_ENABLED environment variable.
  - mysql mode requires running once first:
      MYSQL_DATABASE="${DDZ_MYSQL_DATABASE:-ddz}" \
      npm run db:init:mysql
EOF
}

if [ "${DDZ_DB_DIALECT:-mysql}" != "mysql" ]; then
  echo "[start] unsupported DDZ_DB_DIALECT=${DDZ_DB_DIALECT}; this project is MySQL-only." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

if [ -x "$STOP_SCRIPT" ]; then
  "$STOP_SCRIPT"
else
  bash "$STOP_SCRIPT"
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "[start] server directory not found: $SERVER_DIR" >&2
  exit 1
fi

if [ ! -f "$SERVER_DIR/index.js" ]; then
  echo "[start] server entry not found: $SERVER_DIR/index.js" >&2
  exit 1
fi

if [ ! -f "$PACKAGE_DIR/index.html" ]; then
  echo "[start] h5 entry not found: $PACKAGE_DIR/index.html" >&2
  exit 1
fi

MYSQL_HOST="${DDZ_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${DDZ_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${DDZ_MYSQL_DATABASE:-ddz}"
MYSQL_USER="${DDZ_MYSQL_USER:-root}"
REQUIRED_TABLES=(
  accounts
  wallets
  wallet_ledger
  reward_claims
  user_entitlements
  game_matches
  game_match_events
  game_match_participants
  bot_match_stats
  bot_human_pair_stats
  bot_quota_reservations
  bot_treasury_reservations
)
REQUIRED_TABLE_LIST=""
for table_name in "${REQUIRED_TABLES[@]}"; do
  if [ -n "$REQUIRED_TABLE_LIST" ]; then
    REQUIRED_TABLE_LIST+=","
  fi
  REQUIRED_TABLE_LIST+="'$table_name'"
done
REQUIRED_TABLE_COUNT="${#REQUIRED_TABLES[@]}"
MYSQL_ARGS=(-h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER")
if [ -n "${DDZ_MYSQL_PASSWORD:-}" ]; then
  MYSQL_ARGS+=("-p${DDZ_MYSQL_PASSWORD}")
fi
# mysql CLI：优先 PATH，找不到时兜底常见安装位置（官方安装包默认不进 PATH）
MYSQL_CLI="$(command -v mysql || true)"
if [ -z "$MYSQL_CLI" ]; then
  for cand in /usr/local/mysql/bin/mysql /opt/homebrew/opt/mysql/bin/mysql /opt/homebrew/bin/mysql; do
    if [ -x "$cand" ]; then MYSQL_CLI="$cand"; break; fi
  done
fi
if [ -z "$MYSQL_CLI" ]; then
  echo "[start] mysql client is required because the server is MySQL-only." >&2
  exit 1
fi
EXISTING_TABLE_COUNT="$("$MYSQL_CLI" "${MYSQL_ARGS[@]}" -N -B -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME IN (${REQUIRED_TABLE_LIST});" 2>/dev/null || true)"
if [ "$EXISTING_TABLE_COUNT" != "$REQUIRED_TABLE_COUNT" ]; then
  echo "[start] MySQL schema is incomplete for ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE} (found ${EXISTING_TABLE_COUNT:-0}/${REQUIRED_TABLE_COUNT} required tables)." >&2
  echo "[start] Run first:" >&2
  echo "[start]   cd $SERVER_DIR && DDZ_MYSQL_HOST=$MYSQL_HOST DDZ_MYSQL_PORT=$MYSQL_PORT DDZ_MYSQL_USER=$MYSQL_USER DDZ_MYSQL_DATABASE=$MYSQL_DATABASE npm run db:init:mysql" >&2
  exit 1
fi

echo "[start] DB mode: mysql (${DDZ_MYSQL_HOST:-127.0.0.1}:${DDZ_MYSQL_PORT:-3306}/${DDZ_MYSQL_DATABASE:-ddz})"
# Local development is full-featured by default. Keep every server-side
# DDZ_*_ENABLED feature flag explicit here so a safe production default does
# not accidentally disable an implemented feature during local verification.
FEATURE_BOT_MATCH_ENABLED="${DDZ_BOT_MATCH_ENABLED:-true}"
FEATURE_VOICE_CHAT_ENABLED="${DDZ_VOICE_CHAT_ENABLED:-true}"
FEATURE_VOICE_TRADE_ENABLED="${DDZ_VOICE_TRADE_ENABLED:-true}"
DOUZERO_MAX_CONCURRENT="${DOUZERO_MAX_CONCURRENT:-4}"
export DOUZERO_MAX_CONCURRENT
echo "[start] feature bot-match: $FEATURE_BOT_MATCH_ENABLED"
echo "[start] feature voice-chat: $FEATURE_VOICE_CHAT_ENABLED"
echo "[start] feature voice-trade: $FEATURE_VOICE_TRADE_ENABLED"
echo "[start] DouZero concurrency: $DOUZERO_MAX_CONCURRENT"

if [ "${DDZ_DOUZERO_MODE:-active}" != "off" ]; then
  echo "[start] starting DouZero Sidecar"
  # Use Bash explicitly so a fresh checkout works even before executable bits
  # are normalized by the hosting filesystem.
  if ! bash "$DOUZERO_START_SCRIPT"; then
    echo "[start] DouZero Sidecar failed to launch; Node.js will use rule AI fallback until it becomes available." >&2
  fi
fi

# node 可执行文件：默认取 PATH 里的 node，可用 NODE_BIN 显式覆盖。
NODE_BIN="${NODE_BIN:-node}"

echo "[start] starting WebSocket server on port $WS_PORT"
(
  cd "$SERVER_DIR"
  # 本地开发默认走 dev 认证模式：允许游客登录、不校验 Origin。
  # 服务端的 DDZ_AUTH_MODE 缺省值是 strict（正式环境优先，见 server/auth.js），
  # 不显式指定的话本地会因「拒绝游客 + 缺少密钥」直接启动失败。
  # 已在环境里配置过的值优先，方便临时切到 strict/mixed 做验证。
  PORT="$WS_PORT" \
  ADMIN_TOKEN="${ADMIN_TOKEN:-local_dev_admin}" \
  DDZ_AUTH_MODE="${DDZ_AUTH_MODE:-dev}" \
  DDZ_AUTH_SECRET="${DDZ_AUTH_SECRET:-local_dev_secret}" \
  DDZ_BOT_MATCH_ENABLED="$FEATURE_BOT_MATCH_ENABLED" \
  DDZ_VOICE_CHAT_ENABLED="$FEATURE_VOICE_CHAT_ENABLED" \
  DDZ_VOICE_TRADE_ENABLED="$FEATURE_VOICE_TRADE_ENABLED" \
  DDZ_HAND_STRENGTH_MODE="${DDZ_HAND_STRENGTH_MODE:-lite}" \
  DDZ_DOUZERO_MODE="${DDZ_DOUZERO_MODE:-active}" \
  DDZ_DOUZERO_TRAFFIC_PERCENT="${DDZ_DOUZERO_TRAFFIC_PERCENT:-100}" \
  DDZ_DOUZERO_URL="${DDZ_DOUZERO_URL:-http://127.0.0.1:2021}" \
  DDZ_DOUZERO_MAX_CONCURRENT="${DDZ_DOUZERO_MAX_CONCURRENT:-$DOUZERO_MAX_CONCURRENT}" \
  nohup "$NODE_BIN" index.js
) > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$SERVER_PID_FILE"

echo "[start] starting H5 preview at http://$H5_HOST:$H5_PORT/index.html"
(
  cd "$PACKAGE_DIR"
  nohup python3 -m http.server "$H5_PORT" --bind "$H5_HOST"
) > "$LOG_DIR/h5.log" 2>&1 &
echo $! > "$H5_PID_FILE"

sleep 1

if ! kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
  echo "[start] WebSocket server failed. Log:" >&2
  cat "$LOG_DIR/server.log" >&2 || true
  exit 1
fi

if ! kill -0 "$(cat "$H5_PID_FILE")" 2>/dev/null; then
  echo "[start] H5 preview failed. Log:" >&2
  cat "$LOG_DIR/h5.log" >&2 || true
  exit 1
fi

echo "[start] WebSocket server pid=$(cat "$SERVER_PID_FILE") log=$LOG_DIR/server.log"
echo "[start] H5 preview pid=$(cat "$H5_PID_FILE") log=$LOG_DIR/h5.log"
echo "[start] ready: http://$H5_HOST:$H5_PORT/index.html"
echo "[start] admin: http://127.0.0.1:$WS_PORT/admin (token: ${ADMIN_TOKEN:-local_dev_admin})"
