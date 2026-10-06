#!/usr/bin/env bash
# Builds, declares and deploys the native Paved contracts on a local node, writes
# contracts/deployments/<network>.json for the client, then runs a smoke check.
#
# Usage: scripts/deploy.sh devnet
#
# Only `devnet` is allowed. Every other value is refused: a public network is the owner's decision
# and would need a real token address (the mock Token is test and devnet only).
#
# The node is not started here. Start a seeded one first (addresses are then stable across runs):
#   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42
# It must be fresh: a second run on the same node fails at the first deploy (same addresses).
#
# Deploy order: Token, Account, Daily(owner, account, token), Tutorial(owner, account).
# Deployer, owner and smoke player: the first predeployed devnet account, read from the node at run
# time (public dev keys of the node). The key is only held in a temporary accounts file, removed on
# exit; nothing secret is written in the repository.
#
# Env overrides: RPC_URL (localhost only), SCARB_BIN_DIR, SNCAST_BIN_DIR.
# Needs: scarb 2.20.1, sncast 0.64.0, curl, python3, git.
set -euo pipefail

NETWORK="${1:-}"
if [[ "$NETWORK" != "devnet" ]]; then
  echo "deploy.sh: unsupported network '${NETWORK}'. Only 'devnet' (a local node) is allowed." >&2
  echo "deploy.sh: a public network needs the owner's go and a real token address; the mock Token is devnet only." >&2
  echo "Usage: scripts/deploy.sh devnet" >&2
  exit 2
fi

RPC_URL="${RPC_URL:-http://127.0.0.1:5050}"
case "$RPC_URL" in
  http://127.0.0.1:* | http://localhost:* | http://\[::1\]:*) ;;
  *) echo "deploy.sh: devnet must be a local node, got RPC_URL=$RPC_URL" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASDF="${ASDF_DATA_DIR:-$HOME/.asdf}/installs"
SCARB_BIN_DIR="${SCARB_BIN_DIR:-$ASDF/scarb/2.20.1/bin}"
SNCAST_BIN_DIR="${SNCAST_BIN_DIR:-$ASDF/starknet-foundry/0.64.0/bin}"
PATH="$SNCAST_BIN_DIR:$SCARB_BIN_DIR:$PATH"
OUT="$ROOT/contracts/deployments/$NETWORK.json"
SALT=1
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ACCOUNTS=(--accounts-file "$WORK_DIR/accounts.json")

die() { echo "deploy.sh: $*" >&2; exit 1; }

rpc() {
  curl -sf -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$RPC_URL"
}

# jq-less JSON helpers. `pyj <expr>` reads JSON on stdin and prints the python expression on `d`.
pyj() { python3 -I -c 'import sys,json;d=json.load(sys.stdin);print('"$1"')'; }

# sc <sncast args...>: runs sncast with --json, prints the result object (last JSON line) on
# stdout, dies with the error message if sncast reports one. Build noise on stderr is dropped.
sc() {
  local raw
  raw="$("$@" --json 2>/dev/null)" || true
  python3 -I - "$raw" <<'PY'
import json, sys
last = None
for line in sys.argv[1].splitlines():
    try:
        obj = json.loads(line)
    except ValueError:
        continue
    if "command" in obj or obj.get("type") == "error":
        last = obj
if last is None:
    sys.exit("sncast printed no result")
if last.get("error") or last.get("type") == "error":
    sys.exit("sncast error: " + str(last.get("error", last))[:600])
print(json.dumps(last))
PY
}

hex_int() { python3 -I -c 'import sys;print(int(sys.argv[1],16))' "$1"; }
felt_str() { python3 -I -c 'import sys;print(int(sys.argv[1],16).to_bytes(31,"big").lstrip(b"\0").decode())' "$1"; }

# Calls a view and prints the response felts, space separated.
call() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  sc sncast call --url "$RPC_URL" --contract-address "$addr" --function "$fn" "${args[@]}" |
    pyj '" ".join(d["response_raw"])'
}

# Invokes an entry point as the deployer, waits for acceptance, prints the tx hash.
invoke() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  local tx
  tx="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev invoke --url "$RPC_URL" \
    --contract-address "$addr" --function "$fn" "${args[@]}" | pyj 'd["transaction_hash"]')"
  echo "   $fn tx $tx" >&2
  echo "$tx"
}

declare_class() { # <Contract> -> class hash
  local name="$1" expected out
  expected="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')"
  if out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev declare --url "$RPC_URL" \
      --contract-name "$name" 2>&1)"; then
    echo "   declare $name $(pyj 'd["class_hash"]' <<<"$out") tx $(pyj 'd["transaction_hash"]' <<<"$out")" >&2
  elif grep -q "already declared" <<<"$out"; then
    echo "   declare $name $expected (already declared)" >&2
  else
    die "declare $name failed (is the node fresh? restart devnet with --seed 42): $out"
  fi
  echo "$expected"
}

deploy() { # <Contract> <class hash> [constructor calldata...] -> address
  local name="$1" class="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--constructor-calldata "$@")
  local out
  out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev deploy --url "$RPC_URL" \
    --class-hash "$class" --salt "$SALT" "${args[@]}")" || die "deploy $name failed (is the node fresh?)"
  local tx
  tx="$(pyj 'd["transaction_hash"]' <<<"$out")"
  echo "$tx" >>"$WORK_DIR/deploy-txs"  # deploy runs in a subshell: a file, not an array
  echo "   deploy $name $(pyj 'd["contract_address"]' <<<"$out") tx $tx" >&2
  pyj 'd["contract_address"]' <<<"$out"
}

echo "== node $RPC_URL"
rpc starknet_specVersion '[]' >/dev/null || die "no node answers at $RPC_URL; start: starknet-devnet --host 127.0.0.1 --port 5050 --seed 42"
CHAIN_ID="$(rpc starknet_chainId '[]' | pyj 'd["result"]')"
read -r DEPLOYER KEY < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' |
  pyj 'd["result"][0]["address"]+" "+d["result"][0]["private_key"]') ||
  die "node has no predeployed accounts (not a starknet-devnet?)"
sncast "${ACCOUNTS[@]}" account import --url "$RPC_URL" --name dev --address "$DEPLOYER" \
  --private-key "$KEY" --type oz --silent >/dev/null
KEY=""
echo "   chain id $CHAIN_ID, deployer $DEPLOYER"

echo "== build"
cd "$ROOT/contracts"
RAYON_NUM_THREADS=1 scarb --release build >/dev/null

echo "== declare"
TOKEN_CLASS="$(declare_class Token)"
ACCOUNT_CLASS="$(declare_class Account)"
DAILY_CLASS="$(declare_class Daily)"
TUTORIAL_CLASS="$(declare_class Tutorial)"

echo "== deploy"
TOKEN="$(deploy Token "$TOKEN_CLASS")"
ACCOUNT="$(deploy Account "$ACCOUNT_CLASS" "$DEPLOYER")"
DAILY="$(deploy Daily "$DAILY_CLASS" "$DEPLOYER" "$ACCOUNT" "$TOKEN")"
TUTORIAL="$(deploy Tutorial "$TUTORIAL_CLASS" "$DEPLOYER" "$ACCOUNT")"

DEPLOYED_BLOCK="$(rpc starknet_getTransactionReceipt "[\"$(head -1 "$WORK_DIR/deploy-txs")\"]" | pyj 'd["result"]["block_number"]')"
DECIMALS="$(hex_int "$(call "$TOKEN" decimals)")"
SYMBOL="$(felt_str "$(call "$TOKEN" symbol)")"
[[ -n "$SYMBOL" ]] || die "token symbol is empty"
echo "   token $SYMBOL, $DECIMALS decimals, first deploy in block $DEPLOYED_BLOCK"

mkdir -p "$(dirname "$OUT")"
python3 -I - "$OUT" "$NETWORK" "$CHAIN_ID" "$RPC_URL" "$(git -C "$ROOT" rev-parse HEAD)" "$DEPLOYED_BLOCK" \
  "$DECIMALS" "$SYMBOL" "Token=$TOKEN=$TOKEN_CLASS" "Account=$ACCOUNT=$ACCOUNT_CLASS" \
  "Daily=$DAILY=$DAILY_CLASS" "Tutorial=$TUTORIAL=$TUTORIAL_CLASS" <<'PY'
import json, sys
out, network, chain_id, rpc_url, commit, block, decimals, symbol, *items = sys.argv[1:]
c = {}
for item in items:
    name, address, class_hash = item.split("=")
    c[name] = {"address": address, "class_hash": class_hash}
doc = {
    "network": network,
    "chain_id": chain_id,
    "rpc_url": rpc_url,
    "deployed_at": commit,
    "deployed_block": int(block),
    "token": {**c["Token"], "decimals": int(decimals), "symbol": symbol},
    "contracts": {k: c[k] for k in ("Account", "Daily", "Tutorial", "Token")},
}
with open(out, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
PY
echo "== wrote ${OUT#"$ROOT/"}"

echo "== smoke"
invoke "$TOKEN" mint >/dev/null
invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER" >/dev/null
read -r PRICE_TOKEN PRICE_LOW PRICE_HIGH <<<"$(call "$DAILY" entry_price)"
[[ "$(hex_int "$PRICE_TOKEN")" == "$(hex_int "$TOKEN")" ]] || die "entry_price token $PRICE_TOKEN is not the deployed Token"
invoke "$PRICE_TOKEN" approve "$DAILY" "$PRICE_LOW" "$PRICE_HIGH" >/dev/null
SPAWN_TX="$(invoke "$DAILY" spawn)"
GAME_ID="$(rpc starknet_getTransactionReceipt "[\"$SPAWN_TX\"]" | python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
daily = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == daily and len(e["keys"]) == 3]
print(ids[0])' "$DAILY")" || die "no GameSpawned event in the spawn receipt"
echo "   game $GAME_ID spawned"
invoke "$DAILY" discard "$GAME_ID" >/dev/null
GAME="$(call "$DAILY" game "$GAME_ID")"
read -r G_ID _ _ _ _ G_OVER _ _ G_DISCARDED _ <<<"$GAME"
[[ "$(hex_int "$G_ID")" == "$GAME_ID" ]] || die "game($GAME_ID) read back id $G_ID"
[[ "$(hex_int "$G_DISCARDED")" == 1 ]] || die "game($GAME_ID) discarded_count is $(hex_int "$G_DISCARDED"), expected 1"
echo "   game($GAME_ID) read back: id $GAME_ID, discarded_count 1, over $(hex_int "$G_OVER")"
echo "== smoke ok"
