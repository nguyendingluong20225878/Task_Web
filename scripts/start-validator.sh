#!/usr/bin/env bash
set -euo pipefail

HOST="${SOLANA_VALIDATOR_HOST:-127.0.0.1}"
PORT="${SOLANA_VALIDATOR_PORT:-8899}"
LEDGER="${SOLANA_VALIDATOR_LEDGER:-.anchor/local-ledger}"
METAPLEX_CORE_PROGRAM_ID="${METAPLEX_CORE_PROGRAM_ID:-CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d}"
METAPLEX_CORE_CLONE_URL="${METAPLEX_CORE_CLONE_URL:-https://api.devnet.solana.com}"
LOCAL_RPC_URL="http://$HOST:$PORT"

verify_metaplex_core() {
  solana program show "$METAPLEX_CORE_PROGRAM_ID" --url "$LOCAL_RPC_URL" >/dev/null
}

if timeout 1 bash -c "</dev/tcp/$HOST/$PORT" >/dev/null 2>&1; then
  echo "Solana validator already running at $HOST:$PORT"
  solana cluster-version --url "$LOCAL_RPC_URL"
  if ! verify_metaplex_core; then
    echo "ERROR: Metaplex Core program is not executable on $LOCAL_RPC_URL: $METAPLEX_CORE_PROGRAM_ID" >&2
    echo "Stop the running validator and restart with this script so it can clone the upgradeable program from $METAPLEX_CORE_CLONE_URL." >&2
    exit 1
  fi
  solana program show "$METAPLEX_CORE_PROGRAM_ID" --url "$LOCAL_RPC_URL"
  exit 0
fi

mkdir -p "$(dirname "$LEDGER")"
exec solana-test-validator \
  --reset \
  --ledger "$LEDGER" \
  --clone-upgradeable-program "$METAPLEX_CORE_PROGRAM_ID" \
  --url "$METAPLEX_CORE_CLONE_URL" \
  --quiet
