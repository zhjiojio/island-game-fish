#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SERVICE_DIR/.." && pwd)"
RUNTIME_DIR="${DDZ_RUNTIME_DIR:-$ROOT_DIR/.runtime}"
LOG_DIR="$RUNTIME_DIR/logs"
MODEL_DIR="${DOUZERO_MODEL_DIR:-$RUNTIME_DIR/douzero/models}"
PID_FILE="$RUNTIME_DIR/douzero.pid"
MODE_FILE="$RUNTIME_DIR/douzero.mode"
CONTAINER_NAME="${DOUZERO_CONTAINER_NAME:-ddz-douzero-local}"
PORT="${DOUZERO_PORT:-2021}"
HOST="${DOUZERO_HOST:-127.0.0.1}"
IMAGE="${DOUZERO_IMAGE:-ddz-douzero:latest}"

mkdir -p "$LOG_DIR" "$MODEL_DIR"

is_running_pid() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null || true)" 2>/dev/null
}

port_in_use() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

if is_running_pid || port_in_use; then
  echo "[douzero] already listening at http://$HOST:$PORT"
  exit 0
fi

runtime=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  runtime="docker"
elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
  runtime="podman"
fi

if [ -n "$runtime" ]; then
  if ! "$runtime" image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "[douzero] building container image: $IMAGE"
    "$runtime" build -t "$IMAGE" "$SERVICE_DIR"
  fi
  "$runtime" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  echo "[douzero] starting with $runtime at http://$HOST:$PORT"
  "$runtime" run -d --rm --name "$CONTAINER_NAME" \
    -p "$HOST:$PORT:2021" \
    -e DOUZERO_MAX_CONCURRENT="${DOUZERO_MAX_CONCURRENT:-4}" \
    -e DOUZERO_INTRA_OP_THREADS="${DOUZERO_INTRA_OP_THREADS:-1}" \
    -e DOUZERO_INTER_OP_THREADS="${DOUZERO_INTER_OP_THREADS:-1}" \
    -e DOUZERO_AUTO_DOWNLOAD="${DOUZERO_AUTO_DOWNLOAD:-true}" \
    -e DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD="${DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD:-true}" \
    -e DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE="${DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE:-}" \
    -e DOUZERO_DOWNLOAD_TIMEOUT_SECONDS="${DOUZERO_DOWNLOAD_TIMEOUT_SECONDS:-300}" \
    -e DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256="${DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256:-false}" \
    -e DOUZERO_APPROVED_MANIFEST_SHA256="${DOUZERO_APPROVED_MANIFEST_SHA256:-}" \
    -v "$MODEL_DIR:/app/models" \
    "$IMAGE" >/dev/null
  printf '%s\n' "container:$runtime:$CONTAINER_NAME" > "$MODE_FILE"
  echo "[douzero] started in container; readiness may remain 503 while first download is in progress."
  exit 0
fi

VENV_DIR="${DOUZERO_VENV_DIR:-$RUNTIME_DIR/douzero/venv}"
supports_sidecar_python() {
  "$1" -c 'import sys; raise SystemExit(0 if (3, 11) <= sys.version_info[:2] < (3, 13) else 1)' >/dev/null 2>&1
}

find_python() {
  if [ -n "${PYTHON_BIN:-}" ]; then
    if supports_sidecar_python "$PYTHON_BIN"; then
      printf '%s\n' "$PYTHON_BIN"
      return 0
    fi
    echo "[douzero] PYTHON_BIN must be Python 3.11 or 3.12: $PYTHON_BIN" >&2
    return 1
  fi
  local candidate
  for candidate in python3.12 python3.11 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && supports_sidecar_python "$candidate"; then
      command -v "$candidate"
      return 0
    fi
  done
  echo "[douzero] no Python 3.11 or 3.12 found for fallback startup; install one or use Docker/Podman." >&2
  return 1
}

if [ -x "$VENV_DIR/bin/python" ] && ! supports_sidecar_python "$VENV_DIR/bin/python"; then
  echo "[douzero] existing virtual environment is not Python 3.11 or 3.12: $VENV_DIR" >&2
  echo "[douzero] remove it and rerun, or set DOUZERO_VENV_DIR to a new directory." >&2
  exit 1
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  PYTHON_BIN="$(find_python)"
  echo "[douzero] no container runtime; creating Python virtual environment"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install --disable-pip-version-check --upgrade pip
  "$VENV_DIR/bin/python" -m pip install --disable-pip-version-check "$SERVICE_DIR"
fi

echo "[douzero] no container runtime; starting Python Sidecar at http://$HOST:$PORT"
(
  cd "$SERVICE_DIR"
  # exec keeps the recorded PID attached to the actual long-running Sidecar,
  # so stop-dev.sh can reliably terminate the Python fallback process.
  exec env \
    DOUZERO_MODEL_DIR="$MODEL_DIR" \
    DOUZERO_MAX_CONCURRENT="${DOUZERO_MAX_CONCURRENT:-4}" \
    DOUZERO_INTRA_OP_THREADS="${DOUZERO_INTRA_OP_THREADS:-1}" \
    DOUZERO_INTER_OP_THREADS="${DOUZERO_INTER_OP_THREADS:-1}" \
    DOUZERO_AUTO_DOWNLOAD="${DOUZERO_AUTO_DOWNLOAD:-true}" \
    DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD="${DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD:-true}" \
    DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE="${DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE:-}" \
    DOUZERO_DOWNLOAD_TIMEOUT_SECONDS="${DOUZERO_DOWNLOAD_TIMEOUT_SECONDS:-300}" \
    DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256="${DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256:-false}" \
    DOUZERO_APPROVED_MANIFEST_SHA256="${DOUZERO_APPROVED_MANIFEST_SHA256:-}" \
    nohup "$VENV_DIR/bin/python" -m uvicorn app:app --host "$HOST" --port "$PORT" --workers 1 --no-access-log
) > "$LOG_DIR/douzero.log" 2>&1 &
echo $! > "$PID_FILE"
printf '%s\n' "python" > "$MODE_FILE"
echo "[douzero] started with Python; log=$LOG_DIR/douzero.log"
