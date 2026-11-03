#!/bin/sh
set -eu

# A named volume is root-owned when first created.  Make only the model cache
# writable, then run the inference process as the unprivileged application user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DOUZERO_MODEL_DIR:-/app/models}"
  chown appuser:appuser "${DOUZERO_MODEL_DIR:-/app/models}"
  exec gosu appuser "$@"
fi

exec "$@"
