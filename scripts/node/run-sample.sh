#!/usr/bin/env bash
# Declare, deploy, invoke and call the native sample contract on a local node.
# Usage: scripts/node/run-sample.sh [devnet|katana]   (default: devnet)
# Localhost only. The node is started here and stopped by PID on exit.
# Env overrides: DEVNET_BIN, KATANA_BIN, SCARB_BIN_DIR, SNCAST_BIN_DIR, PORT, WORK_DIR.
set -euo pipefail

NODE="${1:-devnet}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASDF="${ASDF_DATA_DIR:-$HOME/.asdf}/installs"
SCARB_BIN_DIR="${SCARB_BIN_DIR:-$ASDF/scarb/2.20.1/bin}"
SNCAST_BIN_DIR="${SNCAST_BIN_DIR:-$ASDF/starknet-foundry/0.64.0/bin}"
DEVNET_BIN="${DEVNET_BIN:-$ASDF/starknet-devnet/0.10.0/bin/starknet-devnet}"
KATANA_BIN="${KATANA_BIN:-$ASDF/katana/1.7.1/bin/katana}"
PORT="${PORT:-5051}"
WORK_DIR="$(mktemp -d)"
URL="http://127.0.0.1:$PORT"
PATH="$SNCAST_BIN_DIR:$SCARB_BIN_DIR:$PATH"
PID=""

cleanup() {
  if [[ -n "$PID" ]]; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

rpc() {
  curl -s -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$URL"
}

echo "== versions"
scarb --version | head -1
sncast --version

echo "== start $NODE on $URL"
t0=$(date +%s%N)
case "$NODE" in
  devnet) "$DEVNET_BIN" --host 127.0.0.1 --port "$PORT" --seed 42 >"$WORK_DIR/node.log" 2>&1 & ;;
  katana) "$KATANA_BIN" --dev --http.addr 127.0.0.1 --http.port "$PORT" >"$WORK_DIR/node.log" 2>&1 & ;;
  *) echo "unknown node: $NODE" >&2; exit 2 ;;
esac
PID=$!
until rpc starknet_specVersion '[]' | grep -q result; do
  kill -0 "$PID" 2>/dev/null || { cat "$WORK_DIR/node.log"; exit 1; }
  sleep 0.02
done
t1=$(date +%s%N)
echo "node pid $PID, rpc spec $(rpc starknet_specVersion '[]'), start-up $(((t1 - t0) / 1000000)) ms"

# Predeployed dev account (public, deterministic dev keys; never written to a file).
if [[ "$NODE" == devnet ]]; then
  read -r ADDR KEY < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' |
    python3 -c 'import sys,json;a=json.load(sys.stdin)["result"][0];print(a["address"],a["private_key"])')
else
  read -r ADDR KEY < <(sed 's/\x1b\[[0-9;]*m//g' "$WORK_DIR/node.log" |
    awk '/Account address/{a=$5} /Private key/{print a,$5; exit}')
fi

ACC=(--accounts-file "$WORK_DIR/accounts.json")
sncast "${ACC[@]}" account import --url "$URL" --name dev --address "$ADDR" \
  --private-key "$KEY" --type oz --silent >/dev/null

cd "$HERE/sample"
echo "== declare"
out=$(sncast "${ACC[@]}" --account dev declare --url "$URL" --contract-name Sample 2>&1) || true
echo "$out"
CLASS=$(awk '/Class Hash/{print $3}' <<<"$out")
if [[ -z "$CLASS" ]]; then
  echo "-- declare refused; node log (tail)"
  sed 's/\x1b\[[0-9;]*m//g' "$WORK_DIR/node.log" | tail -5
  exit 1
fi

echo "== deploy"
out=$(sncast "${ACC[@]}" --account dev deploy --url "$URL" --class-hash "$CLASS" --salt 1 2>&1)
echo "$out"
ADDRESS=$(awk '/Contract Address/{print $3}' <<<"$out")

echo "== invoke set_value(42)"
out=$(sncast "${ACC[@]}" --account dev invoke --url "$URL" --contract-address "$ADDRESS" \
  --function set_value --calldata 42 2>&1)
echo "$out"
TX=$(awk '/Transaction Hash/{print $3}' <<<"$out")

echo "== call get_value"
sncast call --url "$URL" --contract-address "$ADDRESS" --function get_value 2>&1

echo "== receipt of $TX"
rpc starknet_getTransactionReceipt "[\"$TX\"]" | python3 -m json.tool
