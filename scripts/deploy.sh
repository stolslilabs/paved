#!/usr/bin/env bash
# Builds, declares and deploys the native Paved contracts, writes contracts/deployments/<network>.json for the
# client, then runs a smoke check.
#
# Usage: scripts/deploy.sh devnet [--unmerged]
#        scripts/deploy.sh sepolia [--rehearse]
#
# Networks: `devnet` (a local node, D-8) and `sepolia` (Starknet Sepolia, public playtests, D-16). Every other value
# is refused: mainnet is the owner's act. Sepolia runs the devnet economy path (P-39): MockUSDC (a bounded faucet,
# S-1) and MockRouter, with the same pool. `deploy` refuses MockUSDC and MockRouter by name on mainnet, and the old
# mock Token off devnet.
#
# --unmerged (devnet): deploys the working tree of a pull request (the source check below is skipped) and writes
# the deployment file to a temporary path, printed at the end, never to contracts/deployments/. The committed file
# is only written from main-equivalent sources.
#
# devnet: the node is not started here. Start a seeded one first (addresses are then stable across runs):
#   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42
# It must be fresh: a second run on the same node fails at the first deploy (same addresses).
#
# sepolia (S-1, D-16, P-39): the devnet path on Starknet Sepolia, less the mock Token and P-38's test PAVED. Deploys
# use `--unique` and a fresh random salt (a public network: addresses then depend on the deployer). The smoke cannot
# move Sepolia's time, so it leaves its paid game for the keeper to settle at (D + 2) x 86400. It reads three
# variables, by name only:
#   STARKNET_ACCOUNT_ADDRESS  the funded deployer (owner) account
#   STARKNET_PRIVATE_KEY      its key: never printed, logged or written to a file
#   STARKNET_RPC_URL          a Sepolia RPC endpoint (it may carry an API key: never printed)
# It refuses to start when one is missing, naming it. Every transaction (declare, deploy, invoke, multicall) and
# every view call goes through the starknet.js signer in scripts/signer/ (P-40), installed there with `npm ci`:
# sncast 0.64.0 signs only from an accounts file, a keystore or a Ledger, and its `--url` would put the RPC URL in
# argv. The three values are copied into unexported shell variables and the variables unset, so only the signer
# receives them, through its own environment (`send`), never argv; no other child (curl, python3, scarb, sncast, npm)
# inherits them. The URL and the request reach curl through its config on stdin. No value of the three is printed:
# the URL and the deployer show as `$STARKNET_RPC_URL` and `$STARKNET_ACCOUNT_ADDRESS`, the signer's calldata names
# the deployer `@account`, and comparisons read it on stdin. Before anything is sent: the chain id is
# SN_SEPOLIA, the deployer account is deployed on the node, then the signer checks the chain id again itself.
# Phase 2 runs it from merged main (docs/programme/OPERATIONS.md).
#
# --rehearse (sepolia): the same Sepolia path, signer included, on a fresh local starknet-devnet (started as above),
# with the node's first predeployed account instead of the funded one (its public dev key, in the signer's
# environment only, with SIGNER_NETWORK=devnet), the working tree's sources, and the file written to a temporary
# path. The funded account's variables are unset first, so a shell that holds them never hands them to the rehearsal.
# Its smoke also settles the paid game, as devnet's does.
#
# devnet keeps sncast (salt 1 and no `--unique`: the signer always deploys unique, which would tie the addresses of
# contracts/deployments/devnet.json to the deployer and the salt of each run).
#
# Declared only: Lobby (run by Daily and Tutorial through library calls; its constructor reverts).
# The Lobby class hash is checked as declared on the node (starknet_getClass) before Daily and Tutorial are
# deployed; the script refuses otherwise.
# Deploy order (P8 E3, docs/architecture/economy.md sections 1, 4, 5; E1's audit):
#   MockUSDC, Token (devnet only: the old mock, kept for the client until it reads USDC), PavedToken(deployer, deployer),
#   MockRouter(paved, usdc) seeded with 800,000 PAVED and the 10,000 MockUSDC its constructor preminted to the deployer
#   (outside the faucet, so nobody can push the deployer to the faucet's caps first), Vault(paved, usdc) with the
#   owner's 200,000 PAVED (devnet: 200,000 - 1,000 x N) staked (never fully unstaked), Economy(owner, paved, usdc, vault, router, the
#   router's pool key, sqrt_ratio_limit 0 (the mock ignores it), the decided configuration, initial mean
#   3,353 points, launch rate 7.6e31 after the pool's fee), PavedToken.set_minter(Economy) (then
#   minter() == Economy and admin() == 0 are checked), Account(owner), Daily(owner, account, USDC, lobby
#   class), Tutorial(owner, account, lobby class), Economy.set_game(Daily) (after the stake),
#   Account.set_economy(Economy), Collection(owner) (P8 E5b, the soulbound ERC721 of the games), then as
#   the owner Account.set_collection(Collection) and Collection.set_minters(Daily, Tutorial) (both checked
#   by read back). On devnet only, 1,000 PAVED goes to each predeployed account other than the deployer, from the
#   owner's stake (P-38: the stake is 200,000 - 1,000 x N, the pool stays 800,000). Every spawn mints its game to the player; the smoke reads token_uri and owner_of.
# Upgrades (P-42, docs/architecture/upgrades.md): the `owner` of Economy, Account, Daily, Tutorial and Collection is
#   the deployer, who alone may `upgrade` them (and set the Lobby class of Daily and Tutorial); the smoke reads
#   owner() back on each. PavedToken and Vault have no owner and no upgrade.
# Deployer, owner and smoke player: devnet and --rehearse, the first predeployed account, read from the node at run
# time (public dev keys of the node), its key held in a temporary accounts file removed on exit (devnet) or in the
# signer's environment (--rehearse); sepolia, the funded account. Files: a temporary directory, removed on exit, holds
# sncast's accounts file (devnet only: the node's public dev key), the multicall files (contract addresses, entry
# points, amounts) and the deploy transaction hashes; the signer's output stays in a variable. No value of the three
# sepolia variables is written to a file.
#
# Env overrides: RPC_URL (devnet and --rehearse: localhost only), SCARB_BIN_DIR, SNCAST_BIN_DIR.
# `deployed_at` is the merge base of HEAD with origin/main, and the script refuses when the contract
# sources of the working tree (contracts/src, Scarb.toml, Scarb.lock; untracked files in src too) differ from it.
# Needs: scarb 2.20.1, sncast 0.64.0, curl, python3, git; sepolia and --rehearse also Node 24 and npm.
set -euo pipefail
# No variable assigned below is exported unless the script says so.
set +a

# The funded account (sepolia, D-16), by name only: its three variables are copied into unexported shell variables
# (unset first, so a caller's export of the same names cannot stick) and unset before anything else runs, so no child
# (python3 for the test hook below, curl, scarb, sncast, npm) ever inherits them. Only `send` passes them on, to the
# signer, in its environment; devnet and --rehearse clear the copies below.
unset FUNDED_ADDRESS FUNDED_KEY FUNDED_URL
FUNDED_ADDRESS="${STARKNET_ACCOUNT_ADDRESS:-}"
FUNDED_KEY="${STARKNET_PRIVATE_KEY:-}"
FUNDED_URL="${STARKNET_RPC_URL:-}"
unset STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL SIGNER_NETWORK

# class_declared: reads a starknet_getClass answer on stdin; succeeds only for a JSON object with no `error`
# field whose `result` is itself an object. Anything else (malformed JSON, a list, a string result, an error)
# is "not declared or unknown", and fails.
class_declared() {
  python3 -I -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if isinstance(d, dict) and "error" not in d and isinstance(d.get("result"), dict) else 1)
' 2>/dev/null
}

# class_hash_answer: reads a starknet_getClassHashAt answer on stdin; succeeds only for a hex `result` and no `error`.
class_hash_answer() {
  python3 -I -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
ok = isinstance(d, dict) and "error" not in d and isinstance(d.get("result"), str) and re.fullmatch("0x[0-9a-fA-F]+", d["result"])
sys.exit(0 if ok else 1)
' 2>/dev/null
}

USAGE="Usage: scripts/deploy.sh devnet [--unmerged] | scripts/deploy.sh sepolia [--rehearse]"
NETWORK="${1:-}"
UNMERGED=0
REHEARSE=0
CHECK_SEND=0
if [[ "${2:-}" == "--check-class-answer" ]]; then
  # Test hook (scripts/test-deploy-url.sh): the verdict of class_declared on stdin, nothing else runs.
  class_declared
  exit $?
elif [[ "$NETWORK" == "sepolia" && "${2:-}" == "--check-send-failure" ]]; then
  # Test hook (scripts/test-deploy-url.sh): after the sepolia checks, one `send` that the test's fake node fails;
  # nothing is built, read or sent.
  CHECK_SEND=1
elif [[ "$NETWORK" == "devnet" && "${2:-}" == "--unmerged" ]]; then
  UNMERGED=1
elif [[ "$NETWORK" == "sepolia" && "${2:-}" == "--rehearse" ]]; then
  REHEARSE=1
elif [[ -n "${2:-}" ]]; then
  echo "deploy.sh: unknown option '${2}' for '${NETWORK}'" >&2
  echo "$USAGE" >&2
  exit 2
fi
case "$NETWORK" in
  devnet | sepolia) ;;
  mainnet)
    echo "deploy.sh: refusing mainnet: a mainnet deployment is the owner's act (D-16), and MockUSDC is refused there by name." >&2
    echo "$USAGE" >&2
    exit 2 ;;
  *)
    echo "deploy.sh: unsupported network '${NETWORK}'. Only 'devnet' (a local node) and 'sepolia' (D-16) are allowed." >&2
    echo "$USAGE" >&2
    exit 2 ;;
esac

# sepolia: the funded account's variables, by name only (never a value). A missing one stops the run here.
unset SEND_ADDRESS SEND_KEY SEND_NETWORK
SEND_ADDRESS=""
SEND_KEY=""
SEND_NETWORK=""
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then
  missing=()
  [[ -n "$FUNDED_ADDRESS" ]] || missing+=(STARKNET_ACCOUNT_ADDRESS)
  [[ -n "$FUNDED_KEY" ]] || missing+=(STARKNET_PRIVATE_KEY)
  [[ -n "$FUNDED_URL" ]] || missing+=(STARKNET_RPC_URL)
  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "deploy.sh: sepolia needs ${missing[*]} in the environment (set, not empty); nothing was sent" >&2
    exit 2
  fi
  [[ "$FUNDED_ADDRESS" =~ ^0x[0-9a-fA-F]{1,64}$ ]] ||
    { echo "deploy.sh: STARKNET_ACCOUNT_ADDRESS is not a 0x hex address (its value is not printed)" >&2; exit 2; }
  [[ "$FUNDED_URL" == https://* ]] ||
    { echo "deploy.sh: STARKNET_RPC_URL must be an https:// URL (its value is not printed)" >&2; exit 2; }
  SEND_ADDRESS="$FUNDED_ADDRESS"
  SEND_KEY="$FUNDED_KEY"
  SEND_NETWORK=sepolia
  unset RPC_URL
  RPC_URL="$FUNDED_URL"
else
  RPC_URL="${RPC_URL:-http://127.0.0.1:5050}"
fi
FUNDED_ADDRESS=""
FUNDED_KEY=""
FUNDED_URL=""
export -n RPC_URL
# sepolia and its rehearsal send through the signer (P-40); devnet through sncast.
USE_SIGNER=0
[[ "$NETWORK" == "sepolia" ]] && USE_SIGNER=1
# Full-authority match: a prefix glob would let `http://127.0.0.1:5050@other-host:5050` through.
LOCAL_URL_RE='^http://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+/?$'
if [[ ( "$NETWORK" == "devnet" || "$REHEARSE" == 1 ) && ! "$RPC_URL" =~ $LOCAL_URL_RE ]]; then
  # Only scheme and host are printed: the URL could carry an API key (userinfo, path, query or fragment).
  # The authority is cut first, so an `@` after the host never counts as userinfo.
  # Each part says what could not be read, never a bare placeholder.
  RPC_SCHEME="(not a URL: no '://')"; RPC_HOST="(not a URL: no '://')"
  if [[ "$RPC_URL" == *://* ]]; then
    RPC_SCHEME="(unparsable scheme)"
    [[ "${RPC_URL%%://*}" =~ ^[A-Za-z][A-Za-z0-9+.-]*$ ]] && RPC_SCHEME="${RPC_URL%%://*}"
    auth="${RPC_URL#*://}"; auth="${auth%%[/?#]*}"; auth="${auth##*@}"
    if [[ "$auth" == \[* ]]; then RPC_HOST="${auth%%]*}]"; else RPC_HOST="${auth%%:*}"; fi
    [[ -n "$RPC_HOST" ]] || RPC_HOST="(unparsable host: empty)"
  fi
  echo "deploy.sh: devnet must be a local node (http://127.0.0.1|localhost|[::1]:<port>), got scheme '${RPC_SCHEME}' host '${RPC_HOST}'" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASDF="${ASDF_DATA_DIR:-$HOME/.asdf}/installs"
SCARB_BIN_DIR="${SCARB_BIN_DIR:-$ASDF/scarb/2.20.1/bin}"
SNCAST_BIN_DIR="${SNCAST_BIN_DIR:-$ASDF/starknet-foundry/0.64.0/bin}"
PATH="$SNCAST_BIN_DIR:$SCARB_BIN_DIR:$PATH"
# devnet: salt 1 and no `--unique`, so the addresses are stable across runs. sepolia (and its rehearsal): a fresh
# random salt and `--unique`, so the addresses depend on the deployer and no rerun collides with an earlier one.
if [[ "$NETWORK" == "devnet" ]]; then
  SALT=1
  UNIQUE=()
else
  SALT="$(python3 -I -c 'import secrets;print(hex(secrets.randbits(120)))')"
  UNIQUE=(--unique)
fi
# The RPC URL is printed for a local node only: a public one may carry an API key (it then shows by variable name).
# On sepolia the deployer's address is printed by name too (D-16: no value of the three variables is printed).
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then RPC_LABEL="\$STARKNET_RPC_URL"; else RPC_LABEL="$RPC_URL"; fi
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  OUT_DIR="$(mktemp -d)"
  OUT="$OUT_DIR/$NETWORK.json"
else
  OUT="$ROOT/contracts/deployments/$NETWORK.json"
fi
ACCOUNTS=(--accounts-file "$WORK_DIR/accounts.json")
SIGNER_JS="$ROOT/scripts/signer/signer.mjs"
# The signer's heap cap: 1.5x its measured peak (405,544 kB RSS, declare Daily, VPS 2026-10-10), rounded up to 64 MB.
SIGNER_HEAP="--max-old-space-size=640"
RELEASE_DIR="$ROOT/contracts/target/release"

die() { echo "deploy.sh: $*" >&2; exit 1; }

# The URL and the request go to curl through its config on stdin, not its arguments: a public URL may carry an API
# key, and the params may hold the deployer's address. `-q` (first) keeps curl from reading a ~/.curlrc. In the
# config's quoted strings, backslashes and double quotes are escaped.
rpc() {
  local body="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
  body="${body//\\/\\\\}"
  printf 'url = "%s"\ndata = "%s"\n' "$RPC_URL" "${body//\"/\\\"}" |
    curl -q -sf -K - -X POST -H 'content-type: application/json'
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

# redact: reads the deployer's address, the key and the RPC URL, one per line, then a text, all on stdin (never argv),
# and prints the text with each of the three replaced by its variable's name: the URL and the key as written, in any
# case, and any hex number equal to the address or the key, padded or not. The signer sanitises its own output
# already (the key and the URL, not the address); this is the second layer, and the one for the address.
redact() {
  python3 -I -c '
import re, sys
address, key, url = (sys.stdin.readline().rstrip("\n") for _ in range(3))
text = sys.stdin.read()
for value, name in ((url, "$STARKNET_RPC_URL"), (key, "$STARKNET_PRIVATE_KEY")):
    if value:
        text = re.sub(re.escape(value), name, text, flags=re.I)
def number(value):
    try:
        return int(value, 16)
    except ValueError:
        return None
names = {n: name for value, name in ((address, "$STARKNET_ACCOUNT_ADDRESS"), (key, "$STARKNET_PRIVATE_KEY"))
         if (n := number(value))}
text = re.sub(r"0x[0-9a-fA-F]+|\b[0-9a-fA-F]{32,}\b", lambda m: names.get(int(m.group(0), 16), m.group(0)), text)
sys.stdout.write(text)'
}

# send <signer command> [options...]: runs scripts/signer as the deployer and prints its JSON line. The signer starts
# in a subshell whose environment is an allowlist: PATH and HOME, the account, the key and the node (never argv:
# exported in the subshell, not passed as `VAR=value` to `env`), SIGNER_NETWORK, and NODE_OPTIONS as the heap cap
# alone. Nothing else of deploy.sh's environment reaches it (no NODE_TLS_REJECT_UNAUTHORIZED, NODE_EXTRA_CA_CERTS,
# NODE_DEBUG or proxy variable). The signer refuses other node options, but only once node runs, after an inspector
# from NODE_OPTIONS would already listen. SIGUSR1 cannot open the inspector (--disable-sigusr1). Its stdout and stderr
# are held in a variable, never a file: on success the last line is the JSON line, on failure the run dies with its
# tail, redacted (`redact`). In calldata, `@account` stands for the deployer: the signer reads its address from its
# environment, so the address is in no argv either.
send() {
  local res status=0
  res="$(
    while read -r name; do
      [[ "$name" == PATH || "$name" == HOME ]] || unset "$name" 2>/dev/null || true
    done < <(compgen -e)
    export STARKNET_ACCOUNT_ADDRESS="$SEND_ADDRESS" STARKNET_PRIVATE_KEY="$SEND_KEY" STARKNET_RPC_URL="$RPC_URL" \
      SIGNER_NETWORK="$SEND_NETWORK" NODE_OPTIONS="$SIGNER_HEAP"
    exec node --disable-sigusr1 "$SIGNER_JS" "$@" 2>&1
  )" || status=$?
  if [[ "$status" != 0 ]]; then
    (( ${#res} <= 800 )) || res="${res: -800}"
    die "signer $1 failed: $(printf '%s\n%s\n%s\n%s' "$SEND_ADDRESS" "$SEND_KEY" "$RPC_URL" "$res" | redact)"
  fi
  printf '%s\n' "${res##*$'\n'}"
}

if [[ "$CHECK_SEND" == 1 ]]; then
  send call --contract 0x1 --function f
  exit 0
fi

# On stdin, not argv: the values compared include the deployer's address.
hex_int() { printf '%s' "$1" | python3 -I -c 'import sys;print(int(sys.stdin.read(),16))'; }
felt_str() { python3 -I -c 'import sys;print(int(sys.argv[1],16).to_bytes(31,"big").lstrip(b"\0").decode())' "$1"; }

# Calls a view and prints the response felts, space separated.
call() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  if ((USE_SIGNER)); then
    send call --contract "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj '" ".join(d["result"])'
  else
    sc sncast call --url "$RPC_URL" --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} |
      pyj '" ".join(d["response_raw"])'
  fi
}

# Invokes an entry point as the deployer, waits for acceptance, prints the tx hash.
invoke() { # <address> <function> [calldata...]
  local addr="$1" fn="$2"; shift 2
  local args=()
  [[ $# -gt 0 ]] && args=(--calldata "$@")
  local tx
  if ((USE_SIGNER)); then
    tx="$(send invoke --contract "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj 'd["transaction_hash"]')" ||
      die "invoke $fn failed"
  else
    tx="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev invoke --url "$RPC_URL" \
      --contract-address "$addr" --function "$fn" ${args[@]+"${args[@]}"} | pyj 'd["transaction_hash"]')"
  fi
  echo "   $fn tx $tx" >&2
  echo "$tx"
}

# Invokes several calls as the deployer, each argument "<address> <function> [calldata...]": through the signer in one
# multicall transaction, on devnet one invoke each. Prints nothing on stdout.
invoke_all() {
  local spec tx
  if ((USE_SIGNER)); then
    python3 -I -c '
import json, sys
calls = []
for spec in sys.argv[2:]:
    contract, function, *calldata = spec.split()
    calls.append({"contract": contract, "function": function, "calldata": calldata})
with open(sys.argv[1], "w") as f:
    json.dump(calls, f)
' "$WORK_DIR/calls.json" "$@" || die "invalid multicall"
    tx="$(send multicall --calls "$WORK_DIR/calls.json" | pyj 'd["transaction_hash"]')" || die "multicall failed"
    echo "   multicall$(for spec in "$@"; do printf ' %s' "$(cut -d' ' -f2 <<<"$spec")"; done) tx $tx" >&2
  else
    for spec in "$@"; do
      # Each spec splits into the address, the function and the calldata.
      # shellcheck disable=SC2086
      invoke $spec >/dev/null
    done
  fi
}

declare_class() { # <Contract> -> class hash
  local name="$1" expected out
  expected="$(sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]')" ||
    die "class-hash $name failed"
  if ((USE_SIGNER)); then
    # The release build's files; the class the node takes must be the one sncast computes from the same sources.
    out="$(send declare --sierra "$RELEASE_DIR/paved_$name.contract_class.json" \
      --casm "$RELEASE_DIR/paved_$name.compiled_contract_class.json")" || die "declare $name failed"
    [[ "$(hex_int "$(pyj 'd["class_hash"]' <<<"$out")")" == "$(hex_int "$expected")" ]] ||
      die "declare $name: the signer declared $(pyj 'd["class_hash"]' <<<"$out"), sncast computes $expected"
    if [[ "$(pyj 'd["already_declared"]' <<<"$out")" == True ]]; then
      echo "   declare $name $expected (already declared)" >&2
    else
      echo "   declare $name $expected tx $(pyj 'd["transaction_hash"]' <<<"$out")" >&2
    fi
  elif out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev declare --url "$RPC_URL" \
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
  # The mocks are for tests, devnet and Sepolia (E1's audit, P-39): MockUSDC and MockRouter are refused by name on
  # mainnet (the network check at the top refuses it already), the old mock Token off devnet.
  case "$name" in
    MockUSDC|MockRouter) [[ "$NETWORK" == "devnet" || "$NETWORK" == "sepolia" ]] || die "refusing to deploy the mock $name on $NETWORK" ;;
    Token) [[ "$NETWORK" == "devnet" ]] || die "refusing to deploy the mock $name on $NETWORK" ;;
  esac
  local args=() out
  if ((USE_SIGNER)); then
    # The signer always deploys unique (the address depends on the deployer), as UNIQUE does on this path.
    [[ $# -gt 0 ]] && args=(--calldata "$@")
    out="$(send deploy --class-hash "$class" --salt "$SALT" ${args[@]+"${args[@]}"})" || die "deploy $name failed"
  else
    [[ $# -gt 0 ]] && args=(--constructor-calldata "$@")
    out="$(sc sncast --wait "${ACCOUNTS[@]}" --account dev deploy --url "$RPC_URL" \
      --class-hash "$class" --salt "$SALT" ${UNIQUE[@]+"${UNIQUE[@]}"} ${args[@]+"${args[@]}"})" || die "deploy $name failed (is the node fresh?)"
  fi
  local tx
  tx="$(pyj 'd["transaction_hash"]' <<<"$out")"
  echo "$tx" >>"$WORK_DIR/deploy-txs"  # deploy runs in a subshell: a file, not an array
  echo "   deploy $name $(pyj 'd["contract_address"]' <<<"$out") tx $tx" >&2
  pyj 'd["contract_address"]' <<<"$out"
}

echo "== node $RPC_LABEL"
rpc starknet_specVersion '[]' >/dev/null || die "no node answers at $RPC_LABEL; start: starknet-devnet --host 127.0.0.1 --port 5050 --seed 42"
CHAIN_ID="$(rpc starknet_chainId '[]' | pyj 'd["result"]')"
# Sepolia's chain id is SN_SEPOLIA (starknet-devnet answers the same, so the rehearsal passes this check too).
[[ "$NETWORK" != "sepolia" || "$CHAIN_ID" == "0x534e5f5345504f4c4941" ]] || die "the node's chain id $CHAIN_ID is not SN_SEPOLIA"
# The deployer: on sepolia the funded account, which must already be deployed on the node; on devnet and the
# rehearsal the node's first predeployed account (public dev keys): its key goes to sncast's temporary accounts file
# (devnet) or to the signer's environment (--rehearse).
TEST_ACCOUNTS=()
if [[ "$NETWORK" == "sepolia" && "$REHEARSE" == 0 ]]; then
  DEPLOYER="$SEND_ADDRESS"
  DEPLOYER_LABEL="\$STARKNET_ACCOUNT_ADDRESS"
  rpc starknet_getClassHashAt "[\"latest\",\"$DEPLOYER\"]" | class_hash_answer ||
    die "the deployer account $DEPLOYER_LABEL is not deployed on $RPC_LABEL"
else
  read -r DEPLOYER KEY < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' |
    pyj 'd["result"][0]["address"]+" "+d["result"][0]["private_key"]') ||
    die "node has no predeployed accounts (not a starknet-devnet?)"
  # The other predeployed accounts get the devnet test PAVED (P-38, devnet only); only addresses are read, never keys.
  if [[ "$NETWORK" == "devnet" ]]; then
    while read -r addr; do
      [[ -n "$addr" ]] && TEST_ACCOUNTS+=("$addr")
    done < <(rpc devnet_getPredeployedAccounts '{"with_balance":false}' | pyj '"\n".join("0x%064x" % int(a["address"], 16) for a in d["result"][1:])')
  fi
  if ((USE_SIGNER)); then
    SEND_ADDRESS="$DEPLOYER"
    SEND_KEY="$KEY"
    SEND_NETWORK=devnet
  else
    sncast "${ACCOUNTS[@]}" account import --url "$RPC_URL" --name dev --address "$DEPLOYER" \
      --private-key "$KEY" --type oz --silent >/dev/null
  fi
  KEY=""
  DEPLOYER_LABEL="$DEPLOYER"
fi
# The deployer as the signer's calldata (`@account`: its address from the signer's environment) or sncast's, and as an
# integer for the comparisons below (read on stdin: no python3 argv).
if ((USE_SIGNER)); then DEPLOYER_ARG="@account"; else DEPLOYER_ARG="$DEPLOYER"; fi
DEPLOYER_INT="$(printf '%s' "$DEPLOYER" | python3 -I -c 'import sys;print(int(sys.stdin.read(),16))')"
echo "   chain id $CHAIN_ID, deployer $DEPLOYER_LABEL"

# deployed_at: the main commit whose contract sources are deployed. The build compiles the working
# tree, so the working tree (not HEAD) must equal the merge base with origin/main on the contract
# sources, with no untracked source file either.
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  DEPLOYED_AT="unmerged-$(git -C "$ROOT" rev-parse HEAD)"
  echo "== unmerged$( ((REHEARSE)) && echo ', sepolia rehearsal on a local node'): the working tree is deployed, the file goes to $OUT"
else
  DEPLOYED_AT="$(git -C "$ROOT" merge-base HEAD origin/main)" || die "no merge base of HEAD with origin/main (git fetch origin main)"
  git -C "$ROOT" diff --quiet "$DEPLOYED_AT" -- contracts/src contracts/Scarb.toml contracts/Scarb.lock ||
    die "contract sources differ from origin/main (merge base ${DEPLOYED_AT:0:12}): deploy from main-equivalent sources (or --unmerged)"
  [[ -z "$(git -C "$ROOT" ls-files --others --exclude-standard -- contracts/src)" ]] ||
    die "untracked files in contracts/src: deploy from main-equivalent sources (or --unmerged)"
fi

if ((USE_SIGNER)); then
  echo "== signer"
  [[ "$(node --version 2>/dev/null)" == v24.* ]] || die "the signer needs Node 24 on the PATH"
  # Inside scripts/signer/ only, from its lockfile, without install scripts: never a global install.
  (cd "$ROOT/scripts/signer" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null) ||
    die "npm ci in scripts/signer failed"
  echo "   scripts/signer installed (npm ci), SIGNER_NETWORK=$SEND_NETWORK"
fi

echo "== build"
cd "$ROOT/contracts"
RAYON_NUM_THREADS=1 scarb --release build >/dev/null

echo "== declare"
TOKEN_CLASS=""
TOKEN=""
if [[ "$NETWORK" == "devnet" ]]; then TOKEN_CLASS="$(declare_class Token)"; fi
ACCOUNT_CLASS="$(declare_class Account)"
DAILY_CLASS="$(declare_class Daily)"
TUTORIAL_CLASS="$(declare_class Tutorial)"
USDC_CLASS="$(declare_class MockUSDC)"
PAVED_CLASS="$(declare_class PavedToken)"
ROUTER_CLASS="$(declare_class MockRouter)"
VAULT_CLASS="$(declare_class Vault)"
ECONOMY_CLASS="$(declare_class Economy)"
LOBBY_CLASS="$(declare_class Lobby)"
COLLECTION_CLASS="$(declare_class Collection)"

# Daily and Tutorial only store the Lobby class hash: an undeclared one would deploy fine and revert every
# spawn, claim, sponsor, discard and surrender. Refuse before deploying anything.
rpc starknet_getClass "[\"latest\",\"$LOBBY_CLASS\"]" | class_declared ||
  die "Lobby class $LOBBY_CLASS is not declared on $RPC_LABEL: refusing to deploy Daily and Tutorial"

# u256 calldata: low and high halves, decimal.
u256() { python3 -I -c 'import sys;v=int(sys.argv[1]);print(v%2**128, v>>128)' "$1"; }
USDC_UNIT=1000000
PAVED_UNIT=1000000000000000000
POOL_USDC=$((10000 * USDC_UNIT))
POOL_PAVED="$(python3 -I -c "print(800000 * $PAVED_UNIT)")"
# The devnet test PAVED (P-38, O-54): 1,000 PAVED per predeployed account other than the deployer, from the owner's
# stake (never the pool: it sets the launch rate). The stake is 200,000 - 1,000 x N. Devnet only; no faucet exists.
TEST_PAVED="$(python3 -I -c "print(1000 * $PAVED_UNIT)")"
(( 1000 * ${#TEST_ACCOUNTS[@]} < 200000 )) ||
  die "${#TEST_ACCOUNTS[@]} predeployed accounts would take 1,000 PAVED each, the owner's whole 200,000 stake: use fewer than 200"
STAKE_PAVED="$(python3 -I -c "print((200000 - 1000 * ${#TEST_ACCOUNTS[@]}) * $PAVED_UNIT)")"
# Economy: the decided configuration (burn 7,000 bps, sigma 0, slope 18,130 bps, cap 5, target 1,000,000
# PAVED), the initial mean (3,353 points x 1,000) and the launch rate after the pool's fee (economy.md section 5).
CONFIG=(7000 0 18130 5 "$(python3 -I -c "print(1000000 * $PAVED_UNIT)")")
MEAN0=3353000
LAUNCH_RATE=76000000000000000000000000000000

echo "== deploy"
USDC="$(deploy MockUSDC "$USDC_CLASS")"
if [[ "$NETWORK" == "devnet" ]]; then TOKEN="$(deploy Token "$TOKEN_CLASS")"; fi
PAVED="$(deploy PavedToken "$PAVED_CLASS" "$DEPLOYER_ARG" "$DEPLOYER_ARG")"
ROUTER="$(deploy MockRouter "$ROUTER_CLASS" "$PAVED" "$USDC")"
VAULT="$(deploy Vault "$VAULT_CLASS" "$PAVED" "$USDC")"

echo "== pool and stake"
# The launch pool, in the router's token order, from the initial supply and MockUSDC's premint to the deployer (its
# constructor, outside the faucet's caps: S-1's audit).
read -r PREMINT_LOW PREMINT_HIGH <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)+(int(sys.argv[2],16)<<128)>=int(sys.argv[3]) else 1)' \
  "$PREMINT_LOW" "$PREMINT_HIGH" "$POOL_USDC" ||
  die "the deployer does not hold MockUSDC's 10,000 USDC premint"
# The approvals and the pool: one multicall through the signer, one invoke each on devnet.
if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
  LIQUIDITY="$(u256 "$POOL_PAVED") $(u256 "$POOL_USDC")"
else
  LIQUIDITY="$(u256 "$POOL_USDC") $(u256 "$POOL_PAVED")"
fi
invoke_all "$PAVED approve $ROUTER $(u256 "$POOL_PAVED")" "$USDC approve $ROUTER $(u256 "$POOL_USDC")" \
  "$ROUTER add_liquidity $LIQUIDITY"
# The owner's stake, before Economy can buy anything (E1's audit): the Vault never has zero stakers.
invoke_all "$PAVED approve $VAULT $(u256 "$STAKE_PAVED")" "$VAULT stake $(u256 "$STAKE_PAVED")"
# P-38: the test PAVED, from what the owner keeps outside the stake. Devnet only: off devnet the list is empty, and a
# non-empty one is refused here as well.
[[ "$NETWORK" == "devnet" || "${#TEST_ACCOUNTS[@]}" == 0 ]] || die "refusing to transfer test PAVED on $NETWORK (devnet only)"
if [[ "$NETWORK" == "devnet" ]]; then
  for acct in ${TEST_ACCOUNTS[@]+"${TEST_ACCOUNTS[@]}"}; do
    invoke "$PAVED" transfer "$acct" $(u256 "$TEST_PAVED") >/dev/null
  done
  echo "   test PAVED: 1,000 to each of ${#TEST_ACCOUNTS[@]} predeployed accounts, stake $((200000 - 1000 * ${#TEST_ACCOUNTS[@]})) PAVED"
fi
read -r -a POOL_KEY <<<"$(call "$ROUTER" pool_key)"
[[ "${#POOL_KEY[@]}" == 5 ]] || die "MockRouter.pool_key returned ${#POOL_KEY[@]} felts, expected 5"

ECONOMY="$(deploy Economy "$ECONOMY_CLASS" "$DEPLOYER_ARG" "$PAVED" "$USDC" "$VAULT" "$ROUTER" \
  "${POOL_KEY[@]}" 0 0 "${CONFIG[@]}" "$MEAN0" $(u256 "$LAUNCH_RATE"))"
invoke "$PAVED" set_minter "$ECONOMY" >/dev/null
[[ "$(hex_int "$(call "$PAVED" minter)")" == "$(hex_int "$ECONOMY")" ]] || die "PavedToken.minter() is not Economy"
[[ "$(hex_int "$(call "$PAVED" admin)")" == 0 ]] || die "PavedToken.admin() is not zero after set_minter"
echo "   PavedToken: minter Economy, admin 0"
# The whole initial supply is in the pool and the Vault: 1,000,000 PAVED, none left with the deployer.
read -r SUPPLY_LOW SUPPLY_HIGH <<<"$(call "$PAVED" total_supply)"
[[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$SUPPLY_LOW" "$SUPPLY_HIGH")" == "$(python3 -I -c "print(1000000 * $PAVED_UNIT)")" ]] ||
  die "PavedToken.total_supply() is not 1,000,000 PAVED"
read -r HELD_LOW HELD_HIGH <<<"$(call "$PAVED" balance_of "$DEPLOYER_ARG")"
[[ "$(hex_int "$HELD_LOW")" == 0 && "$(hex_int "$HELD_HIGH")" == 0 ]] || die "the deployer still holds PAVED after the pool and the stake"
for acct in ${TEST_ACCOUNTS[@]+"${TEST_ACCOUNTS[@]}"}; do
  read -r B_LOW B_HIGH <<<"$(call "$PAVED" balance_of "$acct")"
  [[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$B_LOW" "$B_HIGH")" == "$TEST_PAVED" ]] ||
    die "test account $acct does not hold 1,000 PAVED"
  echo "   test account $acct holds 1,000 PAVED"
done
read -r STAKED_LOW STAKED_HIGH <<<"$(call "$VAULT" staked "$DEPLOYER_ARG")"
[[ "$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$STAKED_LOW" "$STAKED_HIGH")" == "$STAKE_PAVED" ]] ||
  die "the owner's stake in the Vault is not 200,000 - 1,000 x ${#TEST_ACCOUNTS[@]} PAVED"
echo "   Vault: owner's stake $((200000 - 1000 * ${#TEST_ACCOUNTS[@]})) PAVED"
echo "   PavedToken: total supply 1,000,000 PAVED, deployer holds 0"

ACCOUNT="$(deploy Account "$ACCOUNT_CLASS" "$DEPLOYER_ARG")"
DAILY="$(deploy Daily "$DAILY_CLASS" "$DEPLOYER_ARG" "$ACCOUNT" "$USDC" "$LOBBY_CLASS")"
TUTORIAL="$(deploy Tutorial "$TUTORIAL_CLASS" "$DEPLOYER_ARG" "$ACCOUNT" "$LOBBY_CLASS")"
invoke "$ECONOMY" set_game "$DAILY" >/dev/null
invoke "$ACCOUNT" set_economy "$ECONOMY" >/dev/null
[[ "$(hex_int "$(call "$ACCOUNT" economy)")" == "$(hex_int "$ECONOMY")" ]] || die "Account.economy() is not Economy"
# The game NFT: without it every spawn reverts ('Lobby: collection not set'), so it is wired before the smoke.
COLLECTION="$(deploy Collection "$COLLECTION_CLASS" "$DEPLOYER_ARG")"
invoke "$ACCOUNT" set_collection "$COLLECTION" >/dev/null
invoke "$COLLECTION" set_minters "$DAILY" "$TUTORIAL" >/dev/null
[[ "$(hex_int "$(call "$ACCOUNT" collection)")" == "$(hex_int "$COLLECTION")" ]] || die "Account.collection() is not Collection"
[[ "$(hex_int "$(call "$COLLECTION" daily)")" == "$(hex_int "$DAILY")" ]] || die "Collection.daily() is not Daily"
[[ "$(hex_int "$(call "$COLLECTION" tutorial)")" == "$(hex_int "$TUTORIAL")" ]] || die "Collection.tutorial() is not Tutorial"
echo "   Collection: minters Daily and Tutorial, registered in Account"

DEPLOYED_BLOCK="$(rpc starknet_getTransactionReceipt "[\"$(head -1 "$WORK_DIR/deploy-txs")\"]" | pyj 'd["result"]["block_number"]')"
DECIMALS="$(hex_int "$(call "$USDC" decimals)")"
[[ "$DECIMALS" == 6 ]] || die "MockUSDC has $DECIMALS decimals, expected 6"
SYMBOL="USDC"
echo "   token MockUSDC, $DECIMALS decimals, first deploy in block $DEPLOYED_BLOCK"

mkdir -p "$(dirname "$OUT")"
python3 -I - "$OUT" "$NETWORK" "$CHAIN_ID" "$RPC_LABEL" "$DEPLOYED_AT" "$DEPLOYED_BLOCK" \
  "$DECIMALS" "$SYMBOL" "$LOBBY_CLASS" "MockUSDC=$USDC=$USDC_CLASS" "Token=$TOKEN=$TOKEN_CLASS" \
  "PavedToken=$PAVED=$PAVED_CLASS" "MockRouter=$ROUTER=$ROUTER_CLASS" "Vault=$VAULT=$VAULT_CLASS" \
  "Economy=$ECONOMY=$ECONOMY_CLASS" "Account=$ACCOUNT=$ACCOUNT_CLASS" \
  "Daily=$DAILY=$DAILY_CLASS" "Tutorial=$TUTORIAL=$TUTORIAL_CLASS" \
  "Collection=$COLLECTION=$COLLECTION_CLASS" "test_paved=$TEST_PAVED" "${TEST_ACCOUNTS[@]}" <<'PY'
import json, sys
out, network, chain_id, rpc_url, commit, block, decimals, symbol, lobby, *rest = sys.argv[1:]
items = [r for r in rest if r.count("=") == 2]
test_paved = next(r for r in rest if r.startswith("test_paved=")).split("=")[1]
test_accounts = [r for r in rest if "=" not in r]
c = {}
for item in items:
    name, address, class_hash = item.split("=")
    if address:
        # O-19: `0x` and 64 hex digits.
        c[name] = {"address": "0x%064x" % int(address, 16), "class_hash": "0x%064x" % int(class_hash, 16)}
names = ["Account", "Daily", "Tutorial", "Collection", "Token", "Economy", "PavedToken", "Vault"]
# The old mock Token is devnet only; devnet and Sepolia both run MockUSDC and MockRouter (P-39).
if network != "devnet":
    names.remove("Token")
names += ["MockUSDC", "MockRouter"]
doc = {
    "network": network,
    "chain_id": chain_id,
    "rpc_url": rpc_url,
    "deployed_at": commit,
    "deployed_block": int(block),
    # The ERC20 Daily charges: USDC (MockUSDC on devnet and Sepolia).
    "token": {**c["MockUSDC"], "decimals": int(decimals), "symbol": symbol},
    "contracts": {k: c[k] for k in names},
    # Declared, not deployed: a class hash and no address, so not under `contracts`.
    "classes": {"Lobby": "0x%064x" % int(lobby, 16)},
}
if network == "devnet":
    # P-38: the PAVED each predeployed account (other than the deployer) received, in base units (18 decimals).
    doc["test_paved"] = {a: test_paved for a in test_accounts}
with open(out, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
PY
echo "== wrote ${OUT#"$ROOT/"}"

# Reads `Economy.terms(game_id)` and prints `player recorded settled reward` (TermsView, E2's felt order:
# player, time, day, stake, reference, sigma, slope, cap, score, recorded, expired, settled, reward).
terms() {
  read -r -a T <<<"$(call "$ECONOMY" terms "$1")"
  echo "$(hex_int "${T[0]}") $(hex_int "${T[9]}") $(hex_int "${T[11]}") $(hex_int "${T[12]}")"
}

# Reads the owner and the token_uri of a game token and checks both: the owner is the deployer and the URI
# decodes to section 9's JSON for this id (name, Score, Over, Day attributes). Args: <token id> <expected over>.
check_token() {
  local id="$1" over="$2" owner uri
  owner="$(call "$COLLECTION" owner_of $(u256 "$id"))"
  [[ "$(hex_int "$owner")" == "$DEPLOYER_INT" ]] || die "Collection.owner_of($id) is not the player"
  uri="$(call "$COLLECTION" token_uri $(u256 "$id"))"
  python3 -I -c '
import sys, json, base64
felts = [int(x, 16) for x in sys.argv[1].split()]
n = felts[0]
data = b"".join(f.to_bytes(31, "big") for f in felts[1:1 + n])
pending, plen = felts[1 + n], felts[2 + n]
data += pending.to_bytes(plen, "big") if plen else b""
prefix = b"data:application/json;base64,"
assert data.startswith(prefix), "token_uri prefix"
doc = json.loads(base64.b64decode(data[len(prefix):]))
attrs = {a["trait_type"]: a["value"] for a in doc["attributes"]}
assert doc["name"] == "Paved Games #" + sys.argv[2], doc["name"]
assert attrs["Over"] == (sys.argv[3] == "true"), attrs
assert isinstance(attrs["Score"], int) and isinstance(attrs["Day"], int), attrs
print("   token", sys.argv[2], "owner the player, token_uri", json.dumps(attrs, sort_keys=True))
' "$uri" "$id" "$over" || die "Collection.token_uri($id) is not section 9's JSON"
}

echo "== smoke"
# P-42: the upgrade owner of every upgradable contract is the deployer.
for entry in "Economy=$ECONOMY" "Account=$ACCOUNT" "Daily=$DAILY" "Tutorial=$TUTORIAL" "Collection=$COLLECTION"; do
  [[ "$(hex_int "$(call "${entry#*=}" owner)")" == "$DEPLOYER_INT" ]] || die "${entry%%=*}.owner() is not the deployer"
done
echo "   owner() of Economy, Account, Daily, Tutorial and Collection: the deployer"
invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER_ARG" >/dev/null
read -r PRICE_TOKEN PRICE_LOW PRICE_HIGH <<<"$(call "$DAILY" entry_price)"
[[ "$(hex_int "$PRICE_TOKEN")" == "$(hex_int "$USDC")" ]] || die "entry_price token $PRICE_TOKEN is not MockUSDC"
[[ "$(hex_int "$PRICE_LOW")" == 2000000 && "$(hex_int "$PRICE_HIGH")" == 0 ]] || die "entry_price amount is not 2 USDC"
echo "   entry_price: 2 USDC per stake unit"

# A paid Daily game at stake 1, with the client's min_out: the pool's quote of the burn, less 1 %. The 2 USDC come
# from the faucet, unless the deployer already holds them: on Sepolia anyone may have filled its faucet cap, and
# that USDC is then on the deployer.
read -r HELD_LOW HELD_HIGH <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)+(int(sys.argv[2],16)<<128)<2000000 else 1)' "$HELD_LOW" "$HELD_HIGH"; then
  invoke "$USDC" mint "$DEPLOYER_ARG" 2000000 0 >/dev/null
fi
invoke "$USDC" approve "$DAILY" 2000000 0 >/dev/null
read -r -a QUOTE <<<"$(call "$ECONOMY" quote 1)"
read -r SWAP_LOW _ <<<"$(call "$ECONOMY" quote_swap "${QUOTE[2]}" "${QUOTE[3]}")"
MIN_OUT="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$SWAP_LOW")"
EMA_BEFORE="$(call "$ECONOMY" ema)"
USDC_BEFORE="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
DAILY_TX="$(invoke "$DAILY" spawn 1 0 $(u256 "$MIN_OUT"))"
PAID_ID="$(rpc starknet_getTransactionReceipt "[\"$DAILY_TX\"]" | python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
daily = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == daily and len(e["keys"]) == 3]
print(ids[0])' "$DAILY")" || die "no GameSpawned event in the Daily spawn receipt"
DAY="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)//86400)' "$(call "$DAILY" game "$PAID_ID" | cut -d' ' -f14)")"
USDC_AFTER="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
[[ $((USDC_BEFORE - USDC_AFTER)) == 2000000 ]] || die "the spawn moved $((USDC_BEFORE - USDC_AFTER)) USDC base units, expected 2000000"
[[ "$(hex_int "$(call "$USDC" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds USDC after the purchase"
[[ "$(hex_int "$(call "$PAVED" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds PAVED after the purchase"
read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
[[ "$T_PLAYER" == "$DEPLOYER_INT" ]] || die "Economy.terms($PAID_ID) is not the player's"
echo "   daily game $PAID_ID bought at stake 1 on day $DAY (min_out $MIN_OUT), Economy holds nothing"
invoke "$DAILY" surrender "$PAID_ID" >/dev/null
read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
[[ "$T_RECORDED" == 1 ]] || die "the surrender of game $PAID_ID was not recorded by Economy"
echo "   daily game $PAID_ID surrendered (score 0), recorded"
check_token "$PAID_ID" true

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
# A Tutorial game's token id is 2^32 + its game id.
check_token $((4294967296 + GAME_ID)) false

# Settlement on a later day: from (D + 2) x 86400 (P-34). A keeper settles each day then (README). Only a local
# node can move its time: on Sepolia the smoke leaves its paid game to the keeper, settleable from (D + 2) x 86400.
SETTLE_AT=$(((DAY + 2) * 86400))
if [[ "$NETWORK" == "devnet" || "$REHEARSE" == 1 ]]; then
  rpc devnet_setTime "{\"time\":$SETTLE_AT,\"generate_block\":true}" >/dev/null || die "devnet_setTime failed"
  invoke "$ECONOMY" settle 1 "$PAID_ID" >/dev/null
  read -r T_PLAYER T_RECORDED T_SETTLED T_REWARD <<<"$(terms "$PAID_ID")"
  [[ "$T_SETTLED" == 1 ]] || die "game $PAID_ID was not settled at $SETTLE_AT"
  echo "   daily game $PAID_ID settled at (D + 2) x 86400 = $SETTLE_AT: reward $T_REWARD"
else
  echo "   daily game $PAID_ID left for the keeper: settleable from (D + 2) x 86400 = $SETTLE_AT"
fi

# No trace in the day's figures (P-24): the prize is sponsor-only and the game ranks nowhere (score 0); a
# score under 100 enters no mean, so the day closes on its prior and the EMA does not move. On Sepolia the day is
# still open (its time cannot move): the day's weight is 0 while open, and its close is the keeper's.
read -r -a TOURNAMENT <<<"$(call "$DAILY" tournament "$DAY")"
[[ "$(hex_int "${TOURNAMENT[4]}")" == 0 && "$(hex_int "${TOURNAMENT[5]}")" == 0 ]] || die "day $DAY has a prize"
[[ "$(hex_int "${TOURNAMENT[6]}")" == 0 ]] || die "day $DAY has a leader"
read -r -a DAYVIEW <<<"$(call "$ECONOMY" day "$DAY")"
[[ "$(call "$ECONOMY" ema)" == "$EMA_BEFORE" ]] || die "the EMA moved"
if [[ "$NETWORK" == "devnet" || "$REHEARSE" == 1 ]]; then
  [[ "$(hex_int "${DAYVIEW[2]}")" == 0 && "$(hex_int "${DAYVIEW[4]}")" == 1 ]] || die "day $DAY has a weight or is not closed"
  echo "   day $DAY: no prize, no leader, closed with weight 0, EMA unchanged"
else
  [[ "$(hex_int "${DAYVIEW[2]}")" == 0 ]] || die "day $DAY has a weight"
  echo "   day $DAY: no prize, no leader, weight 0 while open, EMA unchanged"
fi
echo "== smoke ok"
if [[ "$UNMERGED" == 1 || "$REHEARSE" == 1 ]]; then
  echo "== unmerged deployment file ($OUT):"
  cat "$OUT"
fi
