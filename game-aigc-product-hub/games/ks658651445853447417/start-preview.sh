#!/bin/bash
# 老铁找茬王 · H5 本地预览一键启动
# 用法：bash start-preview.sh
# 或双击运行（需先在 Finder 中"允许运行"）

PORT=8899
PKG_DIR="$(cd "$(dirname "$0")/package" && pwd)"

# 杀掉占用端口的旧进程
OLD_PID=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "▶ 关闭旧服务 (PID $OLD_PID)..."
  kill -9 $OLD_PID 2>/dev/null
  sleep 1
fi

echo "▶ 启动 H5 预览服务..."
echo "▶ 地址：http://localhost:$PORT"
echo "▶ 按 Ctrl+C 停止"
echo ""

cd "$PKG_DIR"
python3 -m http.server $PORT
