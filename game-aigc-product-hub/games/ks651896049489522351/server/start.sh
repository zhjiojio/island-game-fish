#!/bin/sh
set -eu

cd "$(dirname "$0")"
exec node --experimental-fetch index.js
