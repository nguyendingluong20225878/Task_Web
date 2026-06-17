#!/usr/bin/env bash
set -euo pipefail

HOST="${MONGODB_HOST:-127.0.0.1}"
PORT="${MONGODB_PORT:-27017}"
DB_PATH="${MONGODB_DBPATH:-$HOME/.local/mongodb-data}"
LOG_PATH="${MONGODB_LOGPATH:-$HOME/.local/mongodb-log/mongod.log}"

mkdir -p "$DB_PATH" "$(dirname "$LOG_PATH")"

if timeout 1 bash -c "</dev/tcp/$HOST/$PORT" >/dev/null 2>&1; then
  echo "MongoDB already running at $HOST:$PORT"
  exit 0
fi

mongod \
  --dbpath "$DB_PATH" \
  --logpath "$LOG_PATH" \
  --bind_ip "$HOST" \
  --port "$PORT" \
  --fork

echo "MongoDB started at $HOST:$PORT"
