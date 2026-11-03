#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/compose.yml"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  COMPOSE=(podman compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "[compose] Docker Compose or Podman Compose is required." >&2
  exit 1
fi

if [ -z "${DDZ_AUTH_SECRET:-}" ] || [ -z "${DDZ_MYSQL_HOST:-}" ] || [ -z "${DDZ_MYSQL_USER:-}" ] || [ -z "${DDZ_MYSQL_PASSWORD:-}" ] || [ -z "${DDZ_MYSQL_DATABASE:-}" ]; then
  echo "[compose] set DDZ_AUTH_SECRET and DDZ_MYSQL_HOST/USER/PASSWORD/DATABASE for the external MySQL instance first." >&2
  exit 1
fi

case "${DDZ_BOT_MATCH_ENABLED:-true}" in
  [Tt][Rr][Uu][Ee])
    if [ "${#DDZ_AUTH_SECRET}" -lt 16 ]; then
      echo "[compose] DDZ_AUTH_SECRET must be at least 16 characters when bot matchmaking is enabled." >&2
      exit 1
    fi
    ;;
esac

echo "[compose] starting Node.js game server with external MySQL"
if ! "${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d --build game-server; then
  echo "[compose] core services failed to start." >&2
  exit 1
fi

echo "[compose] core services started; starting optional DouZero sidecar"
if "${COMPOSE[@]}" --profile douzero -f "$COMPOSE_FILE" up -d --build douzero; then
  echo "[compose] DouZero sidecar launch submitted; verify /readyz before enabling shadow or active traffic."
else
  echo "[compose] DouZero sidecar failed; Node.js remains available and uses rule AI." >&2
fi

"${COMPOSE[@]}" -f "$COMPOSE_FILE" ps
