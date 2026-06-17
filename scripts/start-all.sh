#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
MONGO_READY_TIMEOUT="${MONGO_READY_TIMEOUT:-30}"
VALIDATOR_READY_TIMEOUT="${VALIDATOR_READY_TIMEOUT:-60}"

log() {
  printf '[dev:full] %s\n' "$*"
}

fail() {
  printf '[dev:full] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    fail "Missing $ENV_FILE. Create it from .env.example."
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi

    line="${line#export }"
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      local key="${line%%=*}"
      local value="${line#*=}"

      if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
        value="${value:1:${#value}-2}"
      fi

      export "$key=$value"
    fi
  done <"$ENV_FILE"

  : "${MONGODB_URI:?MONGODB_URI is required in $ENV_FILE}"
  : "${MONGODB_DB_NAME:?MONGODB_DB_NAME is required in $ENV_FILE}"
  : "${SOLANA_RPC_URL:?SOLANA_RPC_URL is required in $ENV_FILE}"
}

tcp_open() {
  local host="$1"
  local port="$2"
  timeout 1 bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1
}

wait_for_tcp() {
  local name="$1"
  local host="$2"
  local port="$3"
  local timeout_seconds="$4"

  for ((i = 1; i <= timeout_seconds; i++)); do
    if tcp_open "$host" "$port"; then
      log "$name reachable at $host:$port"
      return 0
    fi
    sleep 1
  done

  fail "$name did not become reachable at $host:$port within ${timeout_seconds}s"
}

tail_validator_log() {
  local log_path="$1"
  if [ -f "$log_path" ]; then
    tail -40 "$log_path" >&2 || true
  fi
}

wait_for_validator_rpc() {
  local rpc_url="$1"
  local pid_path="$2"
  local log_path="$3"
  local timeout_seconds="$4"

  for ((i = 1; i <= timeout_seconds; i++)); do
    if [ -f "$pid_path" ] && ! kill -0 "$(cat "$pid_path")" 2>/dev/null; then
      tail_validator_log "$log_path"
      fail "Solana validator process exited before RPC became ready"
    fi

    if solana cluster-version --url "$rpc_url" >/dev/null 2>&1; then
      sleep 2
      if [ -f "$pid_path" ] && ! kill -0 "$(cat "$pid_path")" 2>/dev/null; then
        tail_validator_log "$log_path"
        fail "Solana validator process exited after initial RPC response"
      fi
      log "Solana RPC reachable at $rpc_url"
      return 0
    fi

    sleep 1
  done

  tail_validator_log "$log_path"
  fail "Solana RPC did not become reachable at $rpc_url within ${timeout_seconds}s"
}

start_local_mongo() {
  local host="${MONGODB_HOST:-127.0.0.1}"
  local port="${MONGODB_PORT:-27017}"
  local db_path="${MONGODB_DBPATH:-$HOME/.local/mongodb-data}"
  local log_path="${MONGODB_LOGPATH:-$HOME/.local/mongodb-log/mongod.log}"

  case "$MONGODB_URI" in
    mongodb://127.0.0.1:*|mongodb://localhost:*)
      ;;
    *)
      log "Using external MongoDB from MONGODB_URI; skipping local mongod"
      return 0
      ;;
  esac

  if tcp_open "$host" "$port"; then
    log "MongoDB already running at $host:$port"
    return 0
  fi

  log "Starting MongoDB at $host:$port"
  mkdir -p "$db_path" "$(dirname "$log_path")"
  mongod \
    --dbpath "$db_path" \
    --logpath "$log_path" \
    --bind_ip "$host" \
    --port "$port" \
    --fork >/dev/null

  wait_for_tcp "MongoDB" "$host" "$port" "$MONGO_READY_TIMEOUT"
}

start_validator() {
  local rpc_host="${SOLANA_VALIDATOR_HOST:-127.0.0.1}"
  local rpc_port="${SOLANA_VALIDATOR_PORT:-8899}"
  local ledger="${SOLANA_VALIDATOR_LEDGER:-.anchor/local-ledger}"
  local log_path="${SOLANA_VALIDATOR_LOG:-.anchor/local-validator.log}"
  local pid_path="${SOLANA_VALIDATOR_PID:-.anchor/local-validator.pid}"
  local metaplex_core_program_id="${METAPLEX_CORE_PROGRAM_ID:-CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d}"
  local metaplex_core_clone_url="${METAPLEX_CORE_CLONE_URL:-https://api.devnet.solana.com}"
  local local_rpc_url="http://$rpc_host:$rpc_port"

  if tcp_open "$rpc_host" "$rpc_port"; then
    log "Solana validator already running at $rpc_host:$rpc_port"
    if ! solana program show "$metaplex_core_program_id" --url "$local_rpc_url" >/dev/null; then
      fail "Metaplex Core program is not executable on $local_rpc_url. Stop the running validator and rerun dev:full so it can clone $metaplex_core_program_id from $metaplex_core_clone_url."
    fi
    return 0
  fi

  log "Starting Solana validator at $rpc_host:$rpc_port"
  mkdir -p "$(dirname "$ledger")" "$(dirname "$log_path")"
  nohup solana-test-validator \
    --reset \
    --ledger "$ledger" \
    --clone-upgradeable-program "$metaplex_core_program_id" \
    --url "$metaplex_core_clone_url" \
    >"$log_path" 2>&1 &
  printf '%s\n' "$!" >"$pid_path"
  disown "$(<"$pid_path")" 2>/dev/null || true

  wait_for_validator_rpc "http://$rpc_host:$rpc_port" "$pid_path" "$log_path" "$VALIDATOR_READY_TIMEOUT"
}

verify_mongo_connection() {
  log "Verifying MongoDB connection from MONGODB_URI"
  node <<'NODE'
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

(async () => {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  await client.close();
  console.log(`[dev:full] MongoDB ping OK for database "${dbName}"`);
})().catch((error) => {
  console.error(`[dev:full] ERROR: MongoDB ping failed: ${error.message}`);
  process.exit(1);
});
NODE
}

verify_validator_rpc() {
  log "Verifying Solana RPC from SOLANA_RPC_URL=$SOLANA_RPC_URL"
  solana cluster-version --url "$SOLANA_RPC_URL" >/dev/null
  log "Solana RPC ping OK"
}

verify_metaplex_core_program() {
  local metaplex_core_program_id="${METAPLEX_CORE_PROGRAM_ID:-CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d}"

  log "Verifying Metaplex Core program is executable: $metaplex_core_program_id"
  solana program show "$metaplex_core_program_id" --url "$SOLANA_RPC_URL"
  log "Metaplex Core program OK"
}

main() {
  require_command node
  require_command mongod
  require_command solana
  require_command solana-test-validator

  load_env
  log "Loaded environment from $ENV_FILE"

  start_local_mongo
  start_validator
  verify_mongo_connection
  verify_validator_rpc
  verify_metaplex_core_program

  log "All services are ready"
}

main "$@"
