#!/usr/bin/env bash
# 本地预览「孤岛烤鱼店」WebGL/Canvas 包（快手小游戏 package）
# 用法：./start-dev.sh [端口]
# 默认端口 8000，浏览器打开 http://localhost:8000/

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PKG="$ROOT/package"
PORT="${1:-8000}"

if [[ ! -f "$PKG/index.html" ]]; then
  echo "错误: 找不到 $PKG/index.html，请确认已解压完整 island-bakery（含 package/）。" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "错误: 需要 Python 3（python3）。" >&2
  exit 1
fi

free_port() {
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  echo "端口 ${port} 已被占用，正在结束进程: $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.3
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "仍在占用，强制结束: $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.2
  fi
}

free_port "$PORT"

echo "目录: $PKG"
echo "地址: http://127.0.0.1:${PORT}/"
echo "按 Ctrl+C 停止服务"
echo ""

if [[ "$(uname)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  (sleep 0.7 && open "http://127.0.0.1:${PORT}/") &
fi

exec python3 -m http.server "$PORT" --directory "$PKG"
