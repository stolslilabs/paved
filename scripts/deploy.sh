#!/usr/bin/env bash
# Builds, declares and deploys the native Paved contracts, writes contracts/deployments/<network>.json for the
# client, then runs a smoke check.
#
# Usage: scripts/deploy.sh devnet [--unmerged]
#        scripts/deploy.sh sepolia [--rehearse] [--estimate-only [--bounds <6 integers>] [--validate] [--block-id <tag>]]
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
# --estimate-only (sepolia, and its rehearsal; S-1c): every check above, the signer's install and the build, then a fee
# estimate of each declare in deploy order (`signer estimate declare`, which runs on a fetch that refuses every
# starknet_add* method), and nothing is sent. One line per class: the node's starknet_specVersion, the Sierra file's
# bytes, the CASM bytecode's felts, the request's bytes, whether the class is declared already, then the estimate or
# the node's whole error (JSON-RPC code, message and data, or HTTP status and body), redacted. Exit 1 when one fails.
# The next three options are diagnostic only, for the -32603 of S-1b (docs/briefs/s1c-estimate.md), passed to the
# signer: --bounds l1_amount,l1_price,l1_data_amount,l1_data_price,l2_amount,l2_price (explicit resource bounds instead
# of zero), --validate (no SKIP_VALIDATE), --block-id pre_confirmed (instead of latest; `pending` left the spec in 0.9).
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

USAGE="Usage: scripts/deploy.sh devnet [--unmerged] | scripts/deploy.sh sepolia [--rehearse] [--estimate-only [--bounds <6 integers>] [--validate] [--block-id <tag>]] | scripts/deploy.sh sepolia --repoint [--check-only] | scripts/deploy.sh sepolia --rehearse --repoint --deployment <file> [--check-only]"
NETWORK="${1:-}"
UNMERGED=0
REHEARSE=0
CHECK_SEND=0
ESTIMATE_ONLY=0
ESTIMATE_ARGS=()
REPOINT=0
REPOINT_CHECK_ONLY=0
REPOINT_FILE=""
if [[ "$NETWORK" == "sepolia" && ( "${2:-}" == "--estimate-only" || ( "${2:-}" == "--rehearse" && "${3:-}" == "--estimate-only" ) ) ]]; then
  # sepolia [--rehearse] --estimate-only [diagnostics]: the diagnostics reach the signer as its own options, which it
  # checks again (six integers in range, a block tag of the spec).
  [[ "$2" == "--rehearse" ]] && { REHEARSE=1; shift; }
  ESTIMATE_ONLY=1
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --validate) ESTIMATE_ARGS+=(--validate); shift ;;
      --bounds)
        [[ "${2:-}" =~ ^[0-9xa-fA-F,]{11,400}$ ]] || { echo "deploy.sh: --bounds expects six comma-separated integers" >&2; exit 2; }
        ESTIMATE_ARGS+=(--bounds "$2"); shift 2 ;;
      --block-id)
        [[ "${2:-}" == latest || "${2:-}" == pre_confirmed ]] || { echo "deploy.sh: --block-id expects latest or pre_confirmed" >&2; exit 2; }
        ESTIMATE_ARGS+=(--block-id "$2"); shift 2 ;;
      *) echo "deploy.sh: unknown option '$1' for 'sepolia --estimate-only'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  set -- sepolia
elif [[ "$NETWORK" == "sepolia" && ( "${2:-}" == "--repoint" || ( "${2:-}" == "--rehearse" && "${3:-}" == "--repoint" ) ) ]]; then
  # sepolia [--rehearse] --repoint (R-1): repoints the deployed Economy at a new MockRouter (see "--repoint" above).
  [[ "$2" == "--rehearse" ]] && { REHEARSE=1; shift; }
  REPOINT=1
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check-only) REPOINT_CHECK_ONLY=1; shift ;;
      --deployment)
        ((REHEARSE)) || { echo "deploy.sh: --deployment is for the rehearsal only: sepolia --repoint reads contracts/deployments/sepolia.json" >&2; exit 2; }
        [[ -n "${2:-}" && -f "$2" ]] || { echo "deploy.sh: --deployment expects an existing deployment file" >&2; exit 2; }
        REPOINT_FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
        shift 2 ;;
      *) echo "deploy.sh: unknown option '$1' for 'sepolia --repoint'" >&2; echo "$USAGE" >&2; exit 2 ;;
    esac
  done
  if [[ "$REHEARSE" == 1 && -z "$REPOINT_FILE" ]]; then
    echo "deploy.sh: sepolia --rehearse --repoint needs --deployment <file>, the rehearsal's own deployment file" >&2
    exit 2
  fi
  set -- sepolia
elif [[ "${2:-}" == "--check-class-answer" ]]; then
  # Test hook (scripts/test-deploy-url.sh): the verdict of class_declared on stdin, nothing else runs.
  class_declared
  exit $?
elif [[ "$NETWORK" == "sepolia" && "${2:-}" == "--check-send-failure" ]]; then
  # Test hook (scripts/test-deploy-url.sh): after the sepolia variable checks, and before the node, chain id and
  # deployer checks, one `send call --contract 0x1 --function f`, then exit. The test puts a fake signer first on
  # PATH, which fails. With real variables and the real signer it is one read-only call to 0x1 on that node:
  # nothing is built, signed or sent.
  CHECK_SEND=1
elif [[ "$NETWORK" == "devnet" && "${2:-}" == "--unmerged" && -z "${3:-}" ]]; then
  UNMERGED=1
elif [[ "$NETWORK" == "sepolia" && "${2:-}" == "--rehearse" && -z "${3:-}" ]]; then
  REHEARSE=1
elif [[ -n "${2:-}" || -n "${3:-}" ]]; then
  echo "deploy.sh: unknown option '${3:-$2}' for '${NETWORK}${3:+ $2}'" >&2
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
  # It goes into a quoted string of curl's config (rpc): no character that could end the string or the line there.
  [[ "$FUNDED_URL" != *[\"\\$'\n'$'\r']* ]] ||
    { echo "deploy.sh: STARKNET_RPC_URL holds a double quote, a backslash or a line break (its value is not printed)" >&2; exit 2; }
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
# The signer's node: resolved on the caller's PATH, before the toolchain directories go first on it; `send` runs
# this absolute path.
NODE_BIN="$(command -v node || true)"
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
# --repoint: the deployment it reads and updates; sepolia's committed file unless the rehearsal names its own.
[[ "$REPOINT" == 1 && -z "$REPOINT_FILE" ]] && REPOINT_FILE="$ROOT/contracts/deployments/sepolia.json"

die() { echo "deploy.sh: $*" >&2; exit 1; }

# The URL and the request go to curl through its config on stdin, not its arguments: a public URL may carry an API
# key, and the params may hold the deployer's address. `-q` (first) keeps curl from reading a ~/.curlrc. In the
# config's quoted strings, backslashes, double quotes and line breaks are escaped (the URL holds none: checked above).
#
# A read method of RPC_RETRIED (the signer's list, S-1c) is retried while the node answers HTTP 5xx or the JSON-RPC error
# -32601 (a Sepolia endpoint did, at random, with HTTP 200 or 400): at most 5 attempts, waits 1, 2, 4, 8 s. Any other
# method goes once (deploy.sh sends no transaction through curl; a starknet_add* method would never be retried). A
# node that does not answer at all is not retried. Fails unless the last answer is HTTP 2xx.
RPC_RETRIED=" starknet_specVersion starknet_chainId starknet_getClassHashAt starknet_getClass starknet_getTransactionReceipt "
RPC_DELAYS=(1 2 4 8)
rpc() {
  local body="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" answer code attempt=1
  body="${body//\\/\\\\}"
  body="${body//$'\n'/\\n}"
  body="${body//$'\r'/\\r}"
  while true; do
    answer="$(printf 'url = "%s"\ndata = "%s"\n' "$RPC_URL" "${body//\"/\\\"}" |
      curl -q -s -K - -X POST -H 'content-type: application/json' -w '\n%{http_code}')" || answer=$'\n000'
    code="${answer##*$'\n'}"
    answer="${answer%$'\n'*}"
    if [[ "$RPC_RETRIED" == *" $1 "* && "$attempt" -le "${#RPC_DELAYS[@]}" ]] &&
        [[ "$code" == 5?? || "$answer" =~ \"code\"[[:space:]]*:[[:space:]]*-32601 ]]; then
      echo "deploy.sh: $1 failed (HTTP $code), attempt $attempt of $(( ${#RPC_DELAYS[@]} + 1 )); retrying" >&2
      sleep "${RPC_DELAYS[$((attempt - 1))]}"
      attempt=$((attempt + 1))
      continue
    fi
    [[ "$code" == 2?? ]] || return 1
    printf '%s\n' "$answer"
    return 0
  done
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
# tail, redacted (`redact`) and cut by whole lines (`failure_tail`). The line naming each transaction before it is sent
# is shown as it comes (`stream_sending`, S-1d), and only then: the tail leaves it out (S-1e). In calldata, `@account` stands for the deployer: the signer reads its address from its
# environment, so the address is in no argv either.
send() {
  local res status=0
  res="$(run_signer "$@" | stream_sending; exit "${PIPESTATUS[0]}")" || status=$?
  if [[ "$status" != 0 ]]; then
    # The lines already shown left out, then redacted whole, then cut: a value across the cut is still replaced.
    res="$(while IFS= read -r line || [[ -n "$line" ]]; do sending_line "$line" || printf '%s\n' "$line"; done <<<"$res")"
    die "signer $1 failed:
$(failure_tail "$(redact_text "$res")")"
  fi
  # The JSON line: the last line that starts with `{` (stderr shares the stream).
  local line result=""
  while IFS= read -r line; do
    [[ "$line" == "{"* ]] && result="$line"
  done <<<"$res"
  [[ -n "$result" ]] || die "signer $1 printed no JSON line"
  printf '%s\n' "$result"
}

# stream_sending: copies the signer's output (stdout and stderr, one stream) to stdout for `send`, and shows on the
# terminal (stderr), as it comes, each line by which the signer names a transaction before it sends it (S-1d): a run
# killed or stopped afterwards still leaves the hash on screen. Only a line made of the method and a hex hash is shown,
# redacted (`redact_text`).
stream_sending() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line"
    if sending_line "$line"; then
      printf '   %s\n' "$(redact_text "$line")" >&2
      # --repoint: the hash is recorded in the deployment file before the signer sends it, so a run killed meanwhile
      # leaves it there for the rerun (RECORD_SENDING names its key under `repoint`).
      if [[ -n "${RECORD_SENDING:-}" ]]; then rp_set "$RECORD_SENDING=${line##* }"; fi
    fi
  done
}

# sending_line <line>: whether it is the signer's line naming a transaction before it is sent (`stream_sending`).
sending_line() { [[ "$1" =~ ^signer:\ sending\ starknet_add[A-Za-z]+,\ transaction\ 0x[0-9a-f]+$ ]]; }

# failure_tail <text>: at most 800 characters, all counted (the 3-space indents, the line breaks, the count line): the
# whole text, indented, when it fits; else a line counting the lines left out (40 characters kept for it), then the
# last whole lines that fit, indented (S-1e: a cut inside a line printed `failed: .json`). A last line too long alone
# keeps its end, after `...`.
failure_tail() {
  local line i size=0 first budget=800
  local -a lines=()
  while IFS= read -r line || [[ -n "$line" ]]; do lines+=("$line"); size=$((size + ${#line} + 4)); done <<<"$1"
  (( size <= budget )) || budget=760
  i=${#lines[@]} size=0
  while (( i > 0 )) && (( size + ${#lines[i - 1]} + 4 <= budget || i == ${#lines[@]} )); do
    size=$((size + ${#lines[i - 1]} + 4)); i=$((i - 1))
  done
  (( i == 0 )) || printf '   (%s earlier line(s) not shown)\n' "$i"
  first="${lines[i]:-}"
  (( ${#first} + 4 <= budget )) || first="...${first: -$((budget - 7))}"
  printf '   %s\n' "$first"
  for (( i = i + 1; i < ${#lines[@]}; i++ )); do printf '   %s\n' "${lines[i]}"; done
}

# redact_text <text>: the text with the three values replaced by their names (`redact`, all on stdin).
redact_text() { printf '%s\n%s\n%s\n%s' "$SEND_ADDRESS" "$SEND_KEY" "$RPC_URL" "$1" | redact; }

# run_signer <signer command> [options...]: the signer in send's allowlisted environment; prints its stdout and stderr
# (one stream), unredacted, and returns its exit status. Its output is redacted by the caller before it is printed.
run_signer() {
  (
    while read -r name; do
      [[ "$name" == PATH || "$name" == HOME ]] || unset "$name" 2>/dev/null || true
    done < <(compgen -e)
    export STARKNET_ACCOUNT_ADDRESS="$SEND_ADDRESS" STARKNET_PRIVATE_KEY="$SEND_KEY" STARKNET_RPC_URL="$RPC_URL" \
      SIGNER_NETWORK="$SEND_NETWORK" NODE_OPTIONS="$SIGNER_HEAP"
    exec "$NODE_BIN" --disable-sigusr1 "$SIGNER_JS" "$@" 2>&1
  )
}

if [[ "$CHECK_SEND" == 1 ]]; then
  send call --contract 0x1 --function f
  exit 0
fi

# On stdin, not argv: the values compared include the deployer's address.
hex_int() { printf '%s' "$1" | python3 -I -c 'import sys;print(int(sys.stdin.read(),16))'; }
# u256 calldata: low and high halves, decimal.
u256() { python3 -I -c 'import sys;v=int(sys.argv[1]);print(v%2**128, v>>128)' "$1"; }
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
# multicall transaction (its hash then in LAST_TX), on devnet one invoke each. Prints nothing on stdout.
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
    LAST_TX="$tx"
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

# --repoint (R-1, E-9): the deployment file's `repoint` record. rp_set <key=value>...: sets each dotted key under
# `repoint` (an empty value removes it) and rewrites the file through a temporary file in its directory, renamed over it,
# so a kill leaves the old file or the new one, never half of it. Every other field is kept. rp_get <key>: the value, or
# nothing.
rp_set() {
  python3 -I - "$REPOINT_FILE" "$@" <<'PY'
import json, os, sys, tempfile
path, *pairs = sys.argv[1:]
d = json.load(open(path))
record = d.setdefault("repoint", {})
for pair in pairs:
    key, _, value = pair.partition("=")
    *parents, leaf = key.split(".")
    node = record
    for p in parents:
        node = node.setdefault(p, {})
    if value:
        node[leaf] = value
    else:
        node.pop(leaf, None)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
}
rp_get() {
  python3 -I - "$REPOINT_FILE" "$1" <<'PY'
import json, sys
node = json.load(open(sys.argv[1])).get("repoint", {})
for p in sys.argv[2].split("."):
    node = node.get(p, {}) if isinstance(node, dict) else {}
print(node if isinstance(node, str) else "")
PY
}

# felt_eq <a> <b>: the same felt, whatever the padding.
felt_eq() { [[ -n "$1" && -n "$2" && "$(hex_int "$1")" == "$(hex_int "$2")" ]]; }
# u256_of <low> <high>: the integer, decimal.
u256_of() { python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$1" "$2"; }
# class_at <address>: the class hash deployed there, or nothing.
class_at() { rpc starknet_getClassHashAt "[\"latest\",\"$1\"]" | pyj 'd.get("result","")' 2>/dev/null || true; }

# repoint_state: reads the deployment file and the chain, checks what must hold before anything is sent, and sets
# what has landed already (RP_* variables). Read-only: nothing is estimated, signed or sent here.
repoint_state() {
  echo "== repoint: state (read-only)"
  [[ -f "$REPOINT_FILE" ]] || die "no deployment file $REPOINT_FILE"
  local fields
  fields="$(python3 -I - "$REPOINT_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
c, r = d.get("contracts", {}), d.get("repoint", {})
prev = r.get("previous", {})
def addr(name):
    return c.get(name, {}).get("address", "")
print(d.get("network", ""), d.get("chain_id", ""), addr("Economy"), addr("PavedToken"), addr("MockUSDC"), addr("Vault"),
      addr("Account"), addr("Daily"), addr("Tutorial"), addr("Collection"),
      # Before the repoint completes, the old router and Economy class are the file's; after, the record keeps them.
      prev.get("MockRouter", {}).get("address", addr("MockRouter")),
      prev.get("MockRouter", {}).get("class_hash", c.get("MockRouter", {}).get("class_hash", "")),
      prev.get("Economy", {}).get("class_hash", c.get("Economy", {}).get("class_hash", "")))
PY
)" || die "$REPOINT_FILE is not a deployment file"
  read -r RP_NETWORK RP_CHAIN ECONOMY PAVED USDC VAULT ACCOUNT DAILY TUTORIAL COLLECTION OLD_ROUTER OLD_ROUTER_CLASS \
    OLD_ECONOMY_CLASS <<<"$fields"
  [[ "$RP_NETWORK" == sepolia ]] || die "$REPOINT_FILE is a '$RP_NETWORK' deployment, not sepolia"
  [[ -n "$OLD_ECONOMY_CLASS" ]] || die "$REPOINT_FILE lacks an address or class hash the repoint needs"
  felt_eq "$RP_CHAIN" "$CHAIN_ID" || die "$REPOINT_FILE is for chain $RP_CHAIN, the node is $CHAIN_ID"
  # The E-9 classes, from the release build (the hashes sncast computes, as declare_class checks the signer's).
  NEW_ECONOMY_CLASS="$(sc sncast utils class-hash --contract-name Economy | pyj 'd["class_hash"]')" || die "class-hash Economy failed"
  NEW_ROUTER_CLASS="$(sc sncast utils class-hash --contract-name MockRouter | pyj 'd["class_hash"]')" || die "class-hash MockRouter failed"
  ! felt_eq "$NEW_ECONOMY_CLASS" "$OLD_ECONOMY_CLASS" || [[ -n "$(rp_get previous.Economy.class_hash)" ]] ||
    die "the built Economy class is the deployed one ($OLD_ECONOMY_CLASS): nothing to upgrade to"
  echo "   file ${REPOINT_FILE#"$ROOT/"}: Economy $ECONOMY, old MockRouter $OLD_ROUTER"
  echo "   E-9 classes: Economy $NEW_ECONOMY_CLASS, MockRouter $NEW_ROUTER_CLASS"

  # The deployer owns Economy (its upgrade, set_router and set_pool are the owner's).
  [[ "$(hex_int "$(call "$ECONOMY" owner)")" == "$DEPLOYER_INT" ]] || die "the deployer $DEPLOYER_LABEL is not Economy.owner()"
  echo "   Economy.owner() is the deployer"
  # Economy's class: the deployed one or the E-9 one, nothing else.
  RP_ECONOMY_CLASS="$(class_at "$ECONOMY")"
  if felt_eq "$RP_ECONOMY_CLASS" "$NEW_ECONOMY_CLASS"; then RP_UPGRADED=1
  elif felt_eq "$RP_ECONOMY_CLASS" "$OLD_ECONOMY_CLASS"; then RP_UPGRADED=0
  else die "Economy's class on the node is $RP_ECONOMY_CLASS: neither the file's $OLD_ECONOMY_CLASS nor the E-9 class"; fi
  # Its stored router, through addresses() (both classes have it; router() is E-9's): the old MockRouter, or the new
  # one this record names. Its tokens and Vault must be the file's.
  local a
  read -r -a a <<<"$(call "$ECONOMY" addresses)"
  felt_eq "${a[0]}" "$PAVED" && felt_eq "${a[1]}" "$USDC" && felt_eq "${a[2]}" "$VAULT" ||
    die "Economy.addresses() does not name the file's PavedToken, MockUSDC and Vault"
  NEW_ROUTER="$(rp_get MockRouter.address)"
  if felt_eq "${a[3]}" "$OLD_ROUTER"; then RP_REPOINTED=0
  elif felt_eq "${a[3]}" "$NEW_ROUTER"; then RP_REPOINTED=1
  else die "Economy's router is ${a[3]}: neither the old MockRouter of the file nor a new one it records"; fi
  felt_eq "$(class_at "$OLD_ROUTER")" "$OLD_ROUTER_CLASS" || die "the old MockRouter $OLD_ROUTER is not of class $OLD_ROUTER_CLASS"
  echo "   Economy: class $( ((RP_UPGRADED)) && echo "E-9 (upgraded)" || echo "$OLD_ECONOMY_CLASS (not upgraded)"), router $( ((RP_REPOINTED)) && echo "the new MockRouter $NEW_ROUTER" || echo "the old MockRouter")"
  # A new MockRouter this record names: of the E-9 class, over PAVED and USDC.
  if [[ -n "$NEW_ROUTER" ]]; then
    felt_eq "$(class_at "$NEW_ROUTER")" "$NEW_ROUTER_CLASS" || die "the recorded MockRouter $NEW_ROUTER is not of class $NEW_ROUTER_CLASS on the node"
    repoint_check_router_tokens "$NEW_ROUTER"
    echo "   new MockRouter $NEW_ROUTER (recorded): deployed, E-9 class"
  elif [[ -n "$(rp_get MockRouter.deploy_tx)" ]]; then
    echo "   new MockRouter: a deploy was sent ($(rp_get MockRouter.deploy_tx)), its address not recorded: read from its receipt below"
  fi
}

# repoint_check_router_tokens <router>: its pool is PAVED and USDC, in the address order.
repoint_check_router_tokens() {
  local k
  read -r -a k <<<"$(call "$1" pool_key)"
  [[ "${#k[@]}" == 5 ]] || die "MockRouter($1).pool_key returned ${#k[@]} felts, expected 5"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    felt_eq "${k[0]}" "$PAVED" && felt_eq "${k[1]}" "$USDC" || die "MockRouter($1) is not over PAVED and USDC"
  else
    felt_eq "${k[0]}" "$USDC" && felt_eq "${k[1]}" "$PAVED" || die "MockRouter($1) is not over PAVED and USDC"
  fi
}

# repoint_reserves <router>: its reserves as `paved usdc`, decimal.
repoint_reserves() {
  local r
  read -r -a r <<<"$(call "$1" reserves)"
  [[ "${#r[@]}" == 4 ]] || die "MockRouter($1).reserves returned ${#r[@]} felts, expected 4"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    echo "$(u256_of "${r[0]}" "${r[1]}") $(u256_of "${r[2]}" "${r[3]}")"
  else
    echo "$(u256_of "${r[2]}" "${r[3]}") $(u256_of "${r[0]}" "${r[1]}")"
  fi
}

# repoint_quote <router> <usdc in>: the router's own quote_swap at its pool key and Economy's limit (0), one hop; prints
# the PAVED out, and dies unless the whole input fills and the PAVED leg is paid out (Economy.quote_swap's checks).
repoint_quote() {
  local k d
  read -r -a k <<<"$(call "$1" pool_key)"
  read -r -a d <<<"$(call "$1" quote_swap "${k[@]}" 0 0 0 "$USDC" "$2" 0)"
  [[ "${#d[@]}" == 4 ]] || die "MockRouter($1).quote_swap returned ${#d[@]} felts, expected 4"
  python3 -I - "$PAVED" "$USDC" "$2" "${d[@]}" <<'PY' || die "MockRouter($1).quote_swap($2) does not fill the whole input with PAVED out"
import sys
paved, usdc, amount, m0, s0, m1, s1 = sys.argv[1:]
legs = [(int(m0, 16), int(s0, 16)), (int(m1, 16), int(s1, 16))]
usdc_leg, paved_leg = (legs[1], legs[0]) if int(paved, 16) < int(usdc, 16) else (legs[0], legs[1])
ok = usdc_leg == (int(amount), 0) and paved_leg[1] == 1 and paved_leg[0] > 0
print(paved_leg[0])
sys.exit(0 if ok else 1)
PY
}

# repoint_seed_plan: the seed of the new pool (R-1), unless one is recorded: the old pool's ratio, read from its
# reserves; its depth as far as the deployer's PAVED allows, which is its balance plus an unstake that leaves 10 % of
# its Vault stake staked (E-7: USDC that reaches a Vault nobody stakes in goes to the first staker); the USDC at that
# ratio, from the deployer's balance and then the MockUSDC faucet (10,000 USDC per call, 20,000 per address), less
# PAVED when the faucet cannot cover it. Recorded before anything is sent, so a rerun seeds the same amounts (not with
# --check-only, which writes nothing).
repoint_seed_plan() {
  if [[ -n "$(rp_get seed.paved)" ]]; then
    SEED_PAVED="$(rp_get seed.paved)"
    SEED_USDC="$(rp_get seed.usdc)"
    echo "   seed (recorded): $SEED_PAVED PAVED and $SEED_USDC USDC base units"
    return
  fi
  local old stake bal_paved bal_usdc minted plan
  read -r -a old <<<"$(repoint_reserves "$OLD_ROUTER")"
  stake="$(u256_of $(call "$VAULT" staked "$DEPLOYER_ARG"))"
  bal_paved="$(u256_of $(call "$PAVED" balance_of "$DEPLOYER_ARG"))"
  bal_usdc="$(u256_of $(call "$USDC" balance_of "$DEPLOYER_ARG"))"
  minted="$(u256_of $(call "$USDC" minted "$DEPLOYER_ARG"))"
  plan="$(python3 -I - "${old[0]}" "${old[1]}" "$stake" "$bal_paved" "$bal_usdc" "$minted" <<'PY'
import sys
r_paved, r_usdc, stake, bal_paved, bal_usdc, minted = map(int, sys.argv[1:])
if r_paved == 0 or r_usdc == 0:
    sys.exit("the old pool is empty")
keep = -(-stake // 10)
paved = min(r_paved, bal_paved + stake - keep)
usdc = paved * r_usdc // r_paved
room = bal_usdc + max(0, 20_000 * 10**6 - minted)
if usdc > room:
    usdc = room
paved = usdc * r_paved // r_usdc
if usdc < 10**6 or paved == 0:
    sys.exit(f"the seed would be {paved} PAVED for {usdc} USDC base units: below 1 USDC")
print(paved, usdc, keep)
PY
)" || die "no seed for the new pool: $plan"
  read -r SEED_PAVED SEED_USDC _ <<<"$plan"
  python3 -I - "${old[@]}" "$stake" "$bal_paved" "$bal_usdc" "$minted" $plan <<'PY'
import sys
r_paved, r_usdc, stake, bal_paved, bal_usdc, minted, paved, usdc, keep = map(int, sys.argv[1:])
P, U = 10**18, 10**6
print(f"   old pool: {r_paved / P:,.6f} PAVED and {r_usdc / U:,.6f} USDC, {r_paved / P / (r_usdc / U):,.6f} PAVED per USDC")
print(f"   deployer: {bal_paved / P:,.6f} PAVED held, {stake / P:,.6f} staked (10 % kept: {keep / P:,.6f}), "
      f"{bal_usdc / U:,.6f} USDC held, {minted / U:,.6f} from the faucet so far")
print(f"   seed: {paved / P:,.6f} PAVED and {usdc / U:,.6f} USDC, {paved / P / (usdc / U):,.6f} PAVED per USDC, "
      f"{100 * usdc / r_usdc:.1f} % of the old pool's depth")
PY
  ((REPOINT_CHECK_ONLY)) ||
    rp_set "seed.paved=$SEED_PAVED" "seed.usdc=$SEED_USDC" "seed.old_reserve_paved=${old[0]}" "seed.old_reserve_usdc=${old[1]}"
}

# repoint_seed_calls: the seed multicall's calls (one spec per line), from the deployer's balances now: the unstake of
# the PAVED it lacks, the faucet mints of the USDC it lacks (10,000 USDC at most per call), both approvals and
# add_liquidity, in the router's token order. One transaction: it lands whole or not at all.
repoint_seed_calls() {
  local stake bal_paved bal_usdc unstake mint chunk
  stake="$(u256_of $(call "$VAULT" staked "$DEPLOYER_ARG"))"
  bal_paved="$(u256_of $(call "$PAVED" balance_of "$DEPLOYER_ARG"))"
  bal_usdc="$(u256_of $(call "$USDC" balance_of "$DEPLOYER_ARG"))"
  read -r unstake mint <<<"$(python3 -I -c 'import sys;p,u,s,bp,bu=map(int,sys.argv[1:]);print(max(0,p-bp),max(0,u-bu))' \
    "$SEED_PAVED" "$SEED_USDC" "$stake" "$bal_paved" "$bal_usdc")"
  python3 -I -c 'import sys;n,s=map(int,sys.argv[1:]);sys.exit(0 if n<=s-(-(-s//10)) else 1)' "$unstake" "$stake" ||
    die "the seed needs an unstake of $unstake PAVED base units, more than 90 % of the deployer's stake ($stake)"
  [[ "$unstake" == 0 ]] || echo "$VAULT unstake $(u256 "$unstake")"
  while [[ "$mint" != 0 ]]; do
    chunk="$(python3 -I -c 'import sys;print(min(int(sys.argv[1]),10_000*10**6))' "$mint")"
    echo "$USDC mint $DEPLOYER_ARG $(u256 "$chunk")"
    mint="$(python3 -I -c 'import sys;print(int(sys.argv[1])-int(sys.argv[2]))' "$mint" "$chunk")"
  done
  echo "$PAVED approve $NEW_ROUTER $(u256 "$SEED_PAVED")"
  echo "$USDC approve $NEW_ROUTER $(u256 "$SEED_USDC")"
  if python3 -I -c 'import sys;sys.exit(0 if int(sys.argv[1],16)<int(sys.argv[2],16) else 1)' "$PAVED" "$USDC"; then
    echo "$NEW_ROUTER add_liquidity $(u256 "$SEED_PAVED") $(u256 "$SEED_USDC")"
  else
    echo "$NEW_ROUTER add_liquidity $(u256 "$SEED_USDC") $(u256 "$SEED_PAVED")"
  fi
}

# repoint_deployed_address <tx>: the new MockRouter a deploy transaction created, from its receipt (the first event
# datum that is a contract of the E-9 MockRouter class); nothing when it did not succeed or names none.
repoint_deployed_address() {
  local receipt candidate
  receipt="$(rpc starknet_getTransactionReceipt "[\"$1\"]")" || return 0
  [[ "$(pyj 'd.get("result",{}).get("execution_status","")' <<<"$receipt" 2>/dev/null)" == SUCCEEDED ]] || return 0
  while read -r candidate; do
    if [[ -n "$candidate" ]] && felt_eq "$(class_at "$candidate")" "$NEW_ROUTER_CLASS"; then
      echo "$candidate"
      return 0
    fi
  done < <(pyj '"\n".join(e["data"][0] for e in d["result"]["events"] if e.get("data"))' <<<"$receipt")
}

# repoint_run: declares, deploys and seeds the new MockRouter, repoints Economy (upgrade, set_router, set_pool in one
# multicall), records each step in the deployment file as it lands, then smokes. Each step reads what already landed
# first and is skipped when done, so a rerun sends only what is left; a complete one sends nothing.
repoint_run() {
  local tx k p pool calls=() spec need=()
  if ((REPOINT_CHECK_ONLY)); then
    echo "== repoint: check only (nothing is sent, the file is not written)"
    if [[ -z "$NEW_ROUTER" ]]; then
      repoint_seed_plan
      echo "== repoint: check only: every check passed; a run would declare, deploy and seed a MockRouter, then repoint Economy"
    else
      echo "   new MockRouter quotes 1.4 USDC: $(repoint_quote "$NEW_ROUTER" 1400000) PAVED base units"
      echo "== repoint: check only: every check passed; nothing was sent"
    fi
    exit 0
  fi
  # The previous router and Economy class and the commit of the run, once, before anything is sent.
  if [[ -z "$(rp_get previous.MockRouter.address)" ]]; then
    rp_set "previous.MockRouter.address=0x$(printf '%064x' "$(hex_int "$OLD_ROUTER")")" \
      "previous.MockRouter.class_hash=0x$(printf '%064x' "$(hex_int "$OLD_ROUTER_CLASS")")" \
      "previous.Economy.class_hash=0x$(printf '%064x' "$(hex_int "$OLD_ECONOMY_CLASS")")" "at=$DEPLOYED_AT"
  fi

  echo "== repoint: declare"
  declare_class MockRouter >/dev/null
  declare_class Economy >/dev/null
  rp_set "MockRouter.class_hash=0x$(printf '%064x' "$(hex_int "$NEW_ROUTER_CLASS")")" \
    "Economy.class_hash=0x$(printf '%064x' "$(hex_int "$NEW_ECONOMY_CLASS")")"

  echo "== repoint: new MockRouter"
  if [[ -z "$NEW_ROUTER" && -n "$(rp_get MockRouter.deploy_tx)" ]]; then
    # A deploy sent by a run stopped before it recorded the address: the receipt tells, and no second deploy goes out
    # while it might have landed.
    tx="$(rp_get MockRouter.deploy_tx)"
    NEW_ROUTER="$(repoint_deployed_address "$tx")"
    if [[ -n "$NEW_ROUTER" ]]; then
      echo "   deploy $tx (recorded) created $NEW_ROUTER"
    else
      [[ "$(rpc starknet_getTransactionReceipt "[\"$tx\"]" | pyj 'd.get("result",{}).get("execution_status","")' 2>/dev/null)" == REVERTED ]] ||
        die "the recorded MockRouter deploy $tx has no receipt on the node: check it before any rerun"
      echo "   deploy $tx (recorded) reverted: deploying again"
      rp_set "MockRouter.deploy_tx="
    fi
  fi
  if [[ -z "$NEW_ROUTER" ]]; then
    # The salt is recorded before the deploy: a rerun deploys with the same one, so a second MockRouter could only land
    # at the same address, where the deployer's first one would make it revert.
    [[ -n "$(rp_get MockRouter.salt)" ]] || rp_set "MockRouter.salt=$SALT"
    RECORD_SENDING=MockRouter.deploy_tx
    tx="$(send deploy --class-hash "$NEW_ROUTER_CLASS" --salt "$(rp_get MockRouter.salt)" --calldata "$PAVED" "$USDC")" ||
      die "deploy MockRouter failed"
    RECORD_SENDING=""
    NEW_ROUTER="0x$(printf '%064x' "$(hex_int "$(pyj 'd["contract_address"]' <<<"$tx")")")"
    rp_set "MockRouter.deploy_tx=$(pyj 'd["transaction_hash"]' <<<"$tx")"
    echo "   deploy MockRouter $NEW_ROUTER tx $(pyj 'd["transaction_hash"]' <<<"$tx")"
  else
    echo "   MockRouter $NEW_ROUTER deployed already"
  fi
  rp_set "MockRouter.address=0x$(printf '%064x' "$(hex_int "$NEW_ROUTER")")"
  felt_eq "$(class_at "$NEW_ROUTER")" "$NEW_ROUTER_CLASS" || die "the new MockRouter $NEW_ROUTER is not of class $NEW_ROUTER_CLASS"
  repoint_check_router_tokens "$NEW_ROUTER"

  echo "== repoint: seed"
  read -r -a p <<<"$(repoint_reserves "$NEW_ROUTER")"
  if [[ "${p[0]}" != 0 && "${p[1]}" != 0 ]]; then
    echo "   seeded already: ${p[0]} PAVED and ${p[1]} USDC base units$( [[ -n "$(rp_get seed.tx)" ]] && echo ", tx $(rp_get seed.tx)")"
  elif [[ "${p[0]}" != 0 || "${p[1]}" != 0 ]]; then
    die "the new MockRouter holds one token only (${p[0]} PAVED, ${p[1]} USDC base units): not seeded by this tool; check it"
  else
    repoint_seed_plan
    calls=()
    while IFS= read -r spec; do calls+=("$spec"); done < <(repoint_seed_calls)
    RECORD_SENDING=seed.tx
    invoke_all "${calls[@]}"
    RECORD_SENDING=""
    rp_set "seed.tx=$LAST_TX"
    read -r -a p <<<"$(repoint_reserves "$NEW_ROUTER")"
    [[ "${p[0]}" == "$SEED_PAVED" && "${p[1]}" == "$SEED_USDC" ]] || die "the new pool holds ${p[0]} PAVED and ${p[1]} USDC base units, not the seed"
    echo "   seeded: ${p[0]} PAVED and ${p[1]} USDC base units"
  fi

  echo "== repoint: Economy"
  # Before Economy points at it: the new router answers the quote Economy.quote_swap will ask (1.4 USDC, its pool key,
  # the limit 0 that set_pool stores), whole fill, PAVED out.
  echo "   new MockRouter quotes 1.4 USDC: $(repoint_quote "$NEW_ROUTER" 1400000) PAVED base units"
  read -r -a k <<<"$(call "$NEW_ROUTER" pool_key)"
  read -r -a pool <<<"$(call "$ECONOMY" pool)"
  need=()
  felt_eq "$(class_at "$ECONOMY")" "$NEW_ECONOMY_CLASS" || need+=("$ECONOMY upgrade $NEW_ECONOMY_CLASS")
  read -r -a p <<<"$(call "$ECONOMY" addresses)"
  felt_eq "${p[3]}" "$NEW_ROUTER" || need+=("$ECONOMY set_router $NEW_ROUTER")
  # The stored pool: the new router's key and the limit 0, as the deploy set them for the old one.
  python3 -I - "${pool[@]}" "${k[@]}" <<'PY' || need+=("$ECONOMY set_pool ${k[*]} 0 0")
import sys
v = [int(x, 16) for x in sys.argv[1:]]
sys.exit(0 if len(v) == 12 and v[:5] == v[7:] and v[5:7] == [0, 0] else 1)
PY
  if [[ "${#need[@]}" == 0 ]]; then
    echo "   upgraded, repointed and on the new pool already$( [[ -n "$(rp_get multicall_tx)" ]] && echo ", tx $(rp_get multicall_tx)")"
  else
    RECORD_SENDING=multicall_tx
    invoke_all "${need[@]}"
    RECORD_SENDING=""
    rp_set "multicall_tx=$LAST_TX"
  fi
  felt_eq "$(class_at "$ECONOMY")" "$NEW_ECONOMY_CLASS" || die "Economy's class is not the E-9 class after the multicall"
  felt_eq "$(call "$ECONOMY" router)" "$NEW_ROUTER" || die "Economy.router() is not the new MockRouter after the multicall"

  # The deployment file: the new MockRouter and Economy's class where the client and the indexer read them (they read
  # addresses only, which do not change but the MockRouter's), every other field kept.
  python3 -I - "$REPOINT_FILE" "$NEW_ROUTER" "$NEW_ROUTER_CLASS" "$NEW_ECONOMY_CLASS" <<'PY'
import json, os, sys, tempfile
path, router, router_class, economy_class = sys.argv[1:]
d = json.load(open(path))
h = lambda x: "0x%064x" % int(x, 16)
d["contracts"]["MockRouter"] = {"address": h(router), "class_hash": h(router_class)}
d["contracts"]["Economy"]["class_hash"] = h(economy_class)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
os.chmod(tmp, os.stat(path).st_mode & 0o777)
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
  echo "== repoint: wrote ${REPOINT_FILE#"$ROOT/"}"
  repoint_smoke
}

# repoint_spawned_game: the game id of the GameSpawned event of Daily in a receipt read on stdin; fails when the
# transaction did not succeed or spawned nothing.
repoint_spawned_game() {
  python3 -I -c '
import sys, json
d = json.load(sys.stdin)["result"]
assert d["execution_status"] == "SUCCEEDED"
daily = int(sys.argv[1], 16)
ids = [int(e["keys"][1], 16) for e in d["events"] if int(e["from_address"], 16) == daily and len(e["keys"]) == 3]
print(ids[0])' "$DAILY" 2>/dev/null
}

# repoint_smoke: Economy.router() is the new MockRouter, Economy.quote_swap(1.4 USDC) answers above 0, owner() reads
# back on the five upgradable contracts, and a paid Daily spawn at stake 1 succeeds. The spawn is sent once: its
# transaction is recorded, and a rerun cites it instead of buying another game.
repoint_smoke() {
  local swap entry quote held min_out usdc_before usdc_after spawn_tx game_id="" player
  echo "== repoint: smoke"
  felt_eq "$(call "$ECONOMY" router)" "$NEW_ROUTER" || die "Economy.router() is not the new MockRouter"
  echo "   Economy.router() is the new MockRouter $NEW_ROUTER"
  read -r swap _ <<<"$(call "$ECONOMY" quote_swap 1400000 0)"
  [[ "$(hex_int "$swap")" -gt 0 ]] || die "Economy.quote_swap(1400000) is 0"
  echo "   Economy.quote_swap(1400000) = $(hex_int "$swap") PAVED base units"
  for entry in "Economy=$ECONOMY" "Account=$ACCOUNT" "Daily=$DAILY" "Tutorial=$TUTORIAL" "Collection=$COLLECTION"; do
    [[ "$(hex_int "$(call "${entry#*=}" owner)")" == "$DEPLOYER_INT" ]] || die "${entry%%=*}.owner() is not the deployer"
  done
  echo "   owner() of Economy, Account, Daily, Tutorial and Collection: the deployer"
  spawn_tx="$(rp_get smoke.spawn_tx)"
  if [[ -n "$spawn_tx" && -z "$(rp_get smoke.game_id)" ]]; then
    # Sent by a run stopped before it recorded the game: the receipt tells whether it landed.
    game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" || game_id=""
    if [[ -n "$game_id" ]]; then
      rp_set "smoke.game_id=$game_id"
    else
      [[ "$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | pyj 'd.get("result",{}).get("execution_status","")' 2>/dev/null)" == REVERTED ]] ||
        die "the recorded smoke spawn $spawn_tx has no receipt on the node: check it before any rerun"
      echo "   smoke spawn $spawn_tx (recorded) reverted: spawning again"
      rp_set "smoke.spawn_tx="
    fi
  fi
  if [[ -n "$(rp_get smoke.game_id)" ]]; then
    echo "   paid Daily spawn done already: game $(rp_get smoke.game_id), tx $(rp_get smoke.spawn_tx); not sent again"
    echo "== repoint: smoke ok"
    return
  fi
  # The player: the deployer's account, created by the deploy's smoke; created here if not.
  read -r player _ <<<"$(call "$ACCOUNT" player "$DEPLOYER_ARG")"
  [[ "$(hex_int "$player")" != 0 ]] || invoke "$ACCOUNT" create "$(python3 -I -c 'print(hex(int.from_bytes(b"smoke","big")))')" "$DEPLOYER_ARG" >/dev/null
  read -r held _ <<<"$(call "$USDC" balance_of "$DEPLOYER_ARG")"
  [[ "$(hex_int "$held")" -ge 2000000 ]] || invoke "$USDC" mint "$DEPLOYER_ARG" 2000000 0 >/dev/null
  invoke "$USDC" approve "$DAILY" 2000000 0 >/dev/null
  read -r -a quote <<<"$(call "$ECONOMY" quote 1)"
  read -r swap _ <<<"$(call "$ECONOMY" quote_swap "${quote[2]}" "${quote[3]}")"
  min_out="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)*99//100)' "$swap")"
  usdc_before="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  RECORD_SENDING=smoke.spawn_tx
  spawn_tx="$(invoke "$DAILY" spawn 1 0 $(u256 "$min_out"))"
  RECORD_SENDING=""
  game_id="$(rpc starknet_getTransactionReceipt "[\"$spawn_tx\"]" | repoint_spawned_game)" ||
    die "no GameSpawned event in the Daily spawn receipt"
  rp_set "smoke.spawn_tx=$spawn_tx" "smoke.game_id=$game_id"
  usdc_after="$(hex_int "$(call "$USDC" balance_of "$DEPLOYER_ARG" | cut -d' ' -f1)")"
  [[ $((usdc_before - usdc_after)) == 2000000 ]] || die "the spawn moved $((usdc_before - usdc_after)) USDC base units, expected 2000000"
  [[ "$(hex_int "$(call "$USDC" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds USDC after the purchase"
  [[ "$(hex_int "$(call "$PAVED" balance_of "$ECONOMY" | cut -d' ' -f1)")" == 0 ]] || die "Economy holds PAVED after the purchase"
  read -r player _ <<<"$(call "$ECONOMY" terms "$game_id")"
  [[ "$(hex_int "$player")" == "$DEPLOYER_INT" ]] || die "Economy.terms($game_id) is not the player's"
  echo "   paid Daily game $game_id at stake 1 (min_out $min_out) through the new MockRouter, tx $spawn_tx; Economy holds nothing"
  echo "== repoint: smoke ok"
}

SPEC_VERSION="$(rpc starknet_specVersion '[]')" || die "no node answers at $RPC_LABEL; start: starknet-devnet --host 127.0.0.1 --port 5050 --seed 42"
# The spec version, not the URL, tells runs on different endpoints apart (printed on every estimate line too).
SPEC_VERSION="$(pyj 'd["result"] if isinstance(d.get("result"), str) and len(d["result"]) < 40 else "unknown"' <<<"$SPEC_VERSION" 2>/dev/null || echo unknown)"
echo "== node $RPC_LABEL, spec $SPEC_VERSION"
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
  if ((ESTIMATE_ONLY)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's classes are estimated, nothing is deployed"
  elif ((REPOINT)); then
    echo "== unmerged, sepolia rehearsal on a local node: the working tree's classes repoint the deployment of $REPOINT_FILE"
  else
    echo "== unmerged$( ((REHEARSE)) && echo ', sepolia rehearsal on a local node'): the working tree is deployed, the file goes to $OUT"
  fi
else
  DEPLOYED_AT="$(git -C "$ROOT" merge-base HEAD origin/main)" || die "no merge base of HEAD with origin/main (git fetch origin main)"
  git -C "$ROOT" diff --quiet "$DEPLOYED_AT" -- contracts/src contracts/Scarb.toml contracts/Scarb.lock ||
    die "contract sources differ from origin/main (merge base ${DEPLOYED_AT:0:12}): deploy from main-equivalent sources (or --unmerged)"
  [[ -z "$(git -C "$ROOT" ls-files --others --exclude-standard -- contracts/src)" ]] ||
    die "untracked files in contracts/src: deploy from main-equivalent sources (or --unmerged)"
fi

if ((USE_SIGNER)); then
  echo "== signer"
  [[ -n "$NODE_BIN" && "$("$NODE_BIN" --version 2>/dev/null)" == v24.* ]] || die "the signer needs Node 24 on the PATH"
  # Inside scripts/signer/ only, from its lockfile, without install scripts: never a global install.
  (cd "$ROOT/scripts/signer" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null) ||
    die "npm ci in scripts/signer failed"
  echo "   scripts/signer installed (npm ci), SIGNER_NETWORK=$SEND_NETWORK"
fi

echo "== build"
cd "$ROOT/contracts"
RAYON_NUM_THREADS=1 scarb --release build >/dev/null
# --repoint: what is deployed and what already landed, read before anything is estimated or sent.
((REPOINT)) && repoint_state

# Funding (S-1c, S-1d), sepolia and its rehearsal: the deployer's STRK balance, a public read (balance_of of `@account`,
# so the address stays out of argv and output), printed as an amount only. Before its first declare, a real run
# estimates the declare of each class the node does not have yet (`signer estimate declare`, read-only, as in
# --estimate-only) and needs a balance of at least 1.25 x the sum of those estimates + FUNDING_MARGIN_STRK, the
# deploys, invokes and smoke that follow (see below). A rerun after a partial deploy then needs only what is left. When
# an estimate cannot be had (the signer's retries spent, or the node's error), the need falls back to
# FUNDING_FLOOR_STRK: 200 STRK, about 1.4 x the 142.6 STRK that Sepolia's estimates of the nine undeclared classes
# added up to on 2026-10-11 (Daily alone 38.8). Below the need, the run stops before it sends anything. --estimate-only
# prints the same need and balance and sends nothing either way.
# Each declare is also sent with resource bounds above its estimate: starknet.js 10.8 adds 50% to the amount and 50% to
# the price of each resource (2.25 x the estimate), and the tip is paid on the bounded L2 gas (about 1% more on Sepolia
# in S-1c), so the node wants up to MAX_FEE_FACTOR = 2.3 x the estimate in the balance when it is sent. The need is
# raised to the largest of those moments when one is above the rule (a rerun left with Tutorial and Lobby only: 1.25 x
# their 69.4 STRK + 20 is 106.8 STRK, but Lobby's bounds want 76.1 STRK after Tutorial's 36.3).
# FUNDING_MARGIN_STRK, the deploys, invokes and smoke after the declares: the --rehearse run of S-1d on starknet-devnet
# 0.10.0 sent 24 of them for 137,224,560 L2 gas and 12,384 L1 data gas in all, about 1.1 STRK at the 8.2 x 10^9 FRI per
# L2 gas of Sepolia's declare estimates on 2026-10-11 (Tutorial: 36.32 STRK for 4,430,587,392 L2 gas). 20 STRK leaves
# room for a gas price about 18 times higher.
STRK_TOKEN=0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
FUNDING_FLOOR_STRK=200
FUNDING_MARGIN_STRK=20
# Test hook (scripts/test-deploy-url.sh), --estimate-only alone: the class files come from ESTIMATE_RELEASE_DIR. It
# changes what is estimated, never what is sent: nothing is sent in that mode. A real run estimates and declares the
# files of RELEASE_DIR, whatever the environment says.
ESTIMATE_DIR="$RELEASE_DIR"
if [[ "$ESTIMATE_ONLY" == 1 && -n "${ESTIMATE_RELEASE_DIR:-}" ]]; then ESTIMATE_DIR="$ESTIMATE_RELEASE_DIR"; fi
# The classes a run declares, in deploy order; --repoint declares the E-9 MockRouter and Economy only.
FUNDING_CLASSES=(Account Daily Tutorial MockUSDC PavedToken MockRouter Vault Economy Lobby Collection)
((REPOINT)) && FUNDING_CLASSES=(MockRouter Economy)
if ((USE_SIGNER)); then
  read -r BAL_LOW BAL_HIGH <<<"$(call "$STRK_TOKEN" balance_of "$DEPLOYER_ARG")"
  STRK_BALANCE="$(python3 -I -c 'import sys;print(int(sys.argv[1],16)+(int(sys.argv[2],16)<<128))' "$BAL_LOW" "$BAL_HIGH")"
  echo "== funding: deployer STRK balance $(python3 -I -c 'import sys;print(f"{int(sys.argv[1])/1e18:.2f}")' "$STRK_BALANCE") STRK"
  : >"$WORK_DIR/fees"
  if ((ESTIMATE_ONLY)); then
    echo "== estimate only (nothing is sent): each declare in deploy order, spec $SPEC_VERSION${ESTIMATE_ARGS[*]:+, diagnostic: ${ESTIMATE_ARGS[*]}}"
  else
    echo "== funding: estimating each declare still to send, in deploy order (read-only, nothing is sent)"
  fi
  failed=0
  for name in "${FUNDING_CLASSES[@]}"; do
    sierra="$ESTIMATE_DIR/paved_$name.contract_class.json"
    casm="$ESTIMATE_DIR/paved_$name.compiled_contract_class.json"
    [[ -f "$sierra" && -f "$casm" ]] || die "no release class files for $name in ${ESTIMATE_DIR#"$ROOT/"}"
    sizes="sierra $(wc -c <"$sierra" | tr -d ' ') B, casm $(pyj 'len(d["bytecode"])' <"$casm") felts"
    # The class hash sncast computes, to ask the node whether it has the class (unknown when sncast gives none).
    class_hash="$( { sc sncast utils class-hash --contract-name "$name" | pyj 'd["class_hash"]'; } 2>/dev/null || true)"
    declared=unknown
    if [[ "$class_hash" =~ ^0x[0-9a-fA-F]+$ ]]; then
      if rpc starknet_getClass "[\"latest\",\"$class_hash\"]" | class_declared; then declared=yes; else declared=no; fi
    fi
    # A real run skips a class the node has: declareIfNot will not send it.
    if [[ "$ESTIMATE_ONLY" == 0 && "$declared" == yes ]]; then
      echo "   estimate $name: declared already, nothing to send"
      continue
    fi
    status=0
    out="$(run_signer estimate declare --sierra "$sierra" --casm "$casm" ${ESTIMATE_ARGS[@]+"${ESTIMATE_ARGS[@]}"})" || status=$?
    out="$(redact_text "$out")"
    line=""
    while IFS= read -r l; do [[ "$l" == "{"* ]] && line="$l"; done <<<"$out"
    if [[ -z "$line" ]]; then
      (( ${#out} <= 800 )) || out="${out: -800}"
      echo "   estimate $name: spec $SPEC_VERSION, $sizes, declared $declared: signer failed (exit $status): ${out//$'\n'/ | }"
      failed=$((failed + 1))
      continue
    fi
    python3 -I - "$name" "$SPEC_VERSION" "$sizes" "$declared" "$line" "$WORK_DIR/fees" <<'PY' || failed=$((failed + 1))
import json, sys
name, spec, sizes, declared, raw, fees = sys.argv[1:]
d = json.loads(raw)
r = d.get("request", {})
head = f"   estimate {name}: spec {spec}, {sizes}, request {r.get('request_bytes', '?')} B, declared {declared}"
if d.get("ok"):
    e = d["estimate"]
    n = lambda k: int(e.get(k, "0x0"), 16)
    print(f"{head}: ok, overall_fee {n('overall_fee')} {e.get('unit', '?')} (l1_gas {n('l1_gas_consumed')}, "
          f"l1_data_gas {n('l1_data_gas_consumed')}, l2_gas {n('l2_gas_consumed')})")
    # Only a class still to declare counts toward the need.
    if declared != "yes":
        with open(fees, "a") as f:
            f.write(f"{n('overall_fee')}\n")
    sys.exit(0)
answer = {k: d[k] for k in ("http_status", "error", "body", "body_bytes", "transport") if k in d}
# A class the node has already: nothing to declare, and a real run skips it (declareIfNot). Not a failure.
if "is already declared" in json.dumps(answer.get("error", {})):
    print(f"{head}: already declared on the node (a real run skips it): {json.dumps(answer)[:300]}")
    sys.exit(0)
print(f"{head}: error {json.dumps(answer)[:1500]}")
sys.exit(1)
PY
  done
  # The need: 1.25 x the estimates of the classes still to declare + the margin, or the floor when an estimate failed.
  # Integers in FRI (1 STRK = 10^18); exit 1 when the balance is below the need.
  funded=0
  python3 -I - "$WORK_DIR/fees" "$STRK_BALANCE" "$FUNDING_FLOOR_STRK" "$FUNDING_MARGIN_STRK" "$failed" <<'PY' || funded=$?
import sys
fees = [int(x) for x in open(sys.argv[1]).read().split()]
balance, floor, margin, failed = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
strk = lambda fri: f"{fri / 10**18:.2f} STRK"
total = sum(fees)
if failed:
    need = floor * 10**18
    print(f"== funding: {failed} estimate(s) could not be had: the need falls back to the {floor} STRK floor")
else:
    need = -(-total * 5 // 4) + margin * 10**18
    print(f"== funding: {len(fees)} class(es) to declare, estimated at {strk(total)}; "
          f"need 1.25 x {strk(total)} + {margin} STRK margin = {strk(need)}")
    # The peak: when each declare is sent, what is left (the balance less 1.25 x the declares before it) must cover
    # its bounds, 2.3 x its estimate (MAX_FEE_FACTOR above), with the margin still kept for what follows.
    peak, before = 0, 0
    for fee in fees:
        peak = max(peak, -(-before * 5 // 4) + -(-fee * 23 // 10))
        before += fee
    peak += margin * 10**18
    if peak > need:
        print(f"   the bounds of one declare need more: 2.3 x its estimate, after 1.25 x the declares before it, + the margin = {strk(peak)}")
        need = peak
print(f"   deployer STRK balance {strk(balance)}: {'covers' if balance >= need else 'BELOW'} the need of {strk(need)}")
sys.exit(0 if balance >= need else 1)
PY
  if ((ESTIMATE_ONLY)); then
    if [[ "$failed" != 0 ]]; then
      echo "== estimate only: $failed of 10 classes failed (neither an estimate nor already declared); nothing was sent"
      exit 1
    fi
    echo "== estimate only: each of the 10 classes estimated or already declared; nothing was sent"
    exit 0
  fi
  [[ "$funded" == 0 ]] || die "the deployer's STRK balance is below the need above: fund it before deploying; nothing was sent"
fi
if ((REPOINT)); then
  repoint_run
  exit 0
fi

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
