#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVER_DIR/.." && pwd)"
RUN_DIR="${DDZ_RUNTIME_DIR:-$ROOT_DIR/.runtime}"
SERVER_PID_FILE="$RUN_DIR/server.pid"
H5_PID_FILE="$RUN_DIR/h5.pid"
DOUZERO_PID_FILE="$RUN_DIR/douzero.pid"
DOUZERO_MODE_FILE="$RUN_DIR/douzero.mode"
WS_PORT="${WS_PORT:-8080}"
H5_PORT="${H5_PORT:-8766}"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "[stop] stopping $label pid=$pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_port() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "[stop] stopping $label port=$port pids=$(echo "$pids" | tr '\n' ' ')"
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
}

stop_pid_file "$SERVER_PID_FILE" "WebSocket server"
stop_pid_file "$H5_PID_FILE" "H5 preview"
stop_pid_file "$DOUZERO_PID_FILE" "DouZero Sidecar"
if [ -f "$DOUZERO_MODE_FILE" ]; then
  IFS=':' read -r kind runtime container < "$DOUZERO_MODE_FILE" || true
  if [ "$kind" = "container" ] && [ -n "${runtime:-}" ] && [ -n "${container:-}" ] && command -v "$runtime" >/dev/null 2>&1; then
    echo "[stop] stopping DouZero container=$container"
    "$runtime" stop "$container" >/dev/null 2>&1 || true
  fi
  rm -f "$DOUZERO_MODE_FILE"
fi
stop_port "$WS_PORT" "WebSocket server"
stop_port "$H5_PORT" "H5 preview"

sleep 0.5

echo "[stop] done"
