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
# Declared only: Lobby (run by Daily and Tutorial through library calls; its constructor reverts).
# The Lobby class hash is checked as declared on the node (starknet_getClass) before Daily and Tutorial are
# deployed; the script refuses otherwise.
# Deploy order: Token, Account, Daily(owner, account, token, lobby class), Tutorial(owner, account,
# lobby class).
# Deployer, owner and smoke player: the first predeployed devnet account, read from the node at run
# time (public dev keys of the node). The key is only held in a temporary accounts file, removed on
# exit; nothing secret is written in the repository.
#
# Env overrides: RPC_URL (localhost only), SCARB_BIN_DIR, SNCAST_BIN_DIR.
# `deployed_at` is the merge base of HEAD with origin/main, and the script refuses when the contract
# sources of the working tree (contracts/src, Scarb.toml, Scarb.lock; untracked files in src too) differ from it.
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
# Full-authority match: a prefix glob would let `http://127.0.0.1:5050@other-host:5050` through.
LOCAL_URL_RE='^http://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+/?$'
if [[ ! "$RPC_URL" =~ $LOCAL_URL_RE ]]; then
  # Only scheme and host are printed: the URL could carry an API key (userinfo, path, query or fragment).
  # The authority is cut first, so an `@` after the host never counts as userinfo.
  RPC_SCHEME="(none)"; RPC_HOST="(none)"
  if [[ "$RPC_URL" == *://* ]]; then
    [[ "${RPC_URL%%://*}" =~ ^[A-Za-z][A-Za-z0-9+.-]*$ ]] && RPC_SCHEME="${RPC_URL%%://*}"
    auth="${RPC_URL#*://}"; auth="${auth%%[/?#]*}"; auth="${auth##*@}"
    if [[ "$auth" == \[* ]]; then RPC_HOST="${auth%%]*}]"; else RPC_HOST="${auth%%:*}"; fi
  fi
  echo "deploy.sh: devnet must be a local node (http://127.0.0.1|localhost|[::1]:<port>), got scheme '${RPC_SCHEME}' host '${RPC_HOST}'" >&2
  exit 2
fi

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
  sc sncast call --url "$RPC_URL" --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} |
    pyj '" ".join(d["response_raw"])'
}

# Invokes an entry point as the deployer, waits for acceptance, prints the tx hash.
invoke() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  local tx
  tx="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev invoke --url "$RPC_URL" \
    --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj 'd["transaction_hash"]')"
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
    --class-hash "$class" --salt "$SALT" ${args[@]+"${args[@]}"})" || die "deploy $name failed (is the node fresh?)"
  local tx
  tx="$(pyj 'd["transaction_hash"]' <<<"$out")"
  echo "$tx" >>"$WORK_DIR/deploy-txs"  # deploy runs in a subshell: a file, not an array
  echo "   deploy $name $(pyj 'd["contract_address"]' <<<"$out") tx $tx" >&2
  pyj 'd["contract_address"]' <<<"$out"
}

# deployed_at: the main commit whose contract sources are deployed. The build compiles the working
# tree, so the working tree (not HEAD) must equal the merge base with origin/main on the contract
# sources, with no untracked source file either.
DEPLOYED_AT="$(git -C "$ROOT" merge-base HEAD origin/main)" || die "no merge base of HEAD with origin/main (git fetch origin main)"
git -C "$ROOT" diff --quiet "$DEPLOYED_AT" -- contracts/src contracts/Scarb.toml contracts/Scarb.lock ||
  die "contract sources differ from origin/main (merge base ${DEPLOYED_AT:0:12}): deploy from main-equivalent sources"
[[ -z "$(git -C "$ROOT" ls-files --others --exclude-standard -- contracts/src)" ]] ||
  die "untracked files in contracts/src: deploy from main-equivalent sources"

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
LOBBY_CLASS="$(declare_class Lobby)"

# Daily and Tutorial only store the Lobby class hash: an undeclared one would deploy fine and revert every
# spawn, claim, sponsor, discard and surrender. Refuse before deploying anything.
rpc starknet_getClass "[\"latest\",\"$LOBBY_CLASS\"]" | pyj '"ok" if "result" in d else 1/0' >/dev/null 2>&1 ||
  die "Lobby class $LOBBY_CLASS is not declared on $RPC_URL: refusing to deploy Daily and Tutorial"

echo "== deploy"
TOKEN="$(deploy Token "$TOKEN_CLASS")"
ACCOUNT="$(deploy Account "$ACCOUNT_CLASS" "$DEPLOYER")"
DAILY="$(deploy Daily "$DAILY_CLASS" "$DEPLOYER" "$ACCOUNT" "$TOKEN" "$LOBBY_CLASS")"
TUTORIAL="$(deploy Tutorial "$TUTORIAL_CLASS" "$DEPLOYER" "$ACCOUNT" "$LOBBY_CLASS")"

DEPLOYED_BLOCK="$(rpc starknet_getTransactionReceipt "[\"$(head -1 "$WORK_DIR/deploy-txs")\"]" | pyj 'd["result"]["block_number"]')"
DECIMALS="$(hex_int "$(call "$TOKEN" decimals)")"
SYMBOL="$(felt_str "$(call "$TOKEN" symbol)")"
[[ -n "$SYMBOL" ]] || die "token symbol is empty"
echo "   token $SYMBOL, $DECIMALS decimals, first deploy in block $DEPLOYED_BLOCK"

mkdir -p "$(dirname "$OUT")"
python3 -I - "$OUT" "$NETWORK" "$CHAIN_ID" "$RPC_URL" "$DEPLOYED_AT" "$DEPLOYED_BLOCK" \
  "$DECIMALS" "$SYMBOL" "$LOBBY_CLASS" "Token=$TOKEN=$TOKEN_CLASS" "Account=$ACCOUNT=$ACCOUNT_CLASS" \
  "Daily=$DAILY=$DAILY_CLASS" "Tutorial=$TUTORIAL=$TUTORIAL_CLASS" <<'PY'
import json, sys
out, network, chain_id, rpc_url, commit, block, decimals, symbol, lobby, *items = sys.argv[1:]
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
    # Declared, not deployed: a class hash and no address, so not under `contracts`.
    "classes": {"Lobby": lobby},
}
with open(out, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
PY
echo "== wrote ${OUT#"$ROOT/"}"

echo "== smoke"
invoke "$TOKEN" mint >/dev/null
invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER" >/dev/null
# The Daily view stays exercised, read only. No Daily game is played: even an ended one leaves its entry
# price in the day's prize, and the smoke must leave no trace in the day's figures (P-24).
read -r PRICE_TOKEN PRICE_LOW PRICE_HIGH <<<"$(call "$DAILY" entry_price)"
[[ "$(hex_int "$PRICE_TOKEN")" == "$(hex_int "$TOKEN")" ]] || die "entry_price token $PRICE_TOKEN is not the deployed Token"
echo "   entry_price: token $SYMBOL, amount low $(hex_int "$PRICE_LOW") high $(hex_int "$PRICE_HIGH")"
# The Tutorial belongs to no tournament: spawn, one scripted build (the Tutorial refuses a discard while the
# tile in hand has a legal placement, and `build` takes no placement), read back.
SPAWN_TX="$(invoke "$TUTORIAL" spawn)"
GAME_ID="$(rpc starknet_getTransactionReceipt "[\"$SPAWN_TX\"]" | python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
tutorial = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == tutorial and len(e["keys"]) == 3]
print(ids[0])' "$TUTORIAL")" || die "no GameSpawned event in the spawn receipt"
echo "   tutorial game $GAME_ID spawned"
invoke "$TUTORIAL" build "$GAME_ID" >/dev/null
GAME="$(call "$TUTORIAL" game "$GAME_ID")"
read -r G_ID _ G_MODE _ _ G_OVER _ G_PLACED _ <<<"$GAME"
[[ "$(hex_int "$G_ID")" == "$GAME_ID" ]] || die "game($GAME_ID) read back id $G_ID"
[[ "$(hex_int "$G_MODE")" == 3 ]] || die "game($GAME_ID) mode is $(hex_int "$G_MODE"), expected 3 (Tutorial)"
[[ "$(hex_int "$G_PLACED")" == 2 ]] || die "game($GAME_ID) placed_count is $(hex_int "$G_PLACED"), expected 2"
echo "   game($GAME_ID) read back: id $GAME_ID, mode Tutorial, placed_count 2, over $(hex_int "$G_OVER")"
echo "== smoke ok"
