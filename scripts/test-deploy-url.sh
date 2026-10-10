#!/usr/bin/env bash
# The RPC_URL guard of deploy.sh names what it could not parse (it runs before anything else, so no
# node and no toolchain are needed), its network and sepolia variable checks refuse before anything is built or sent
# (S-1), a sepolia run failing at the node leaks no value to an output, an argv or a child's environment (P-40), and
# its getClass predicate rejects a malformed answer. Usage: scripts/test-deploy-url.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0
check() { # <RPC_URL> <expected fragment>
  local out
  out="$(RPC_URL="$1" "$here/deploy.sh" devnet 2>&1 >/dev/null)"
  if [[ $? -ne 2 || "$out" != *"$2"* ]]; then
    echo "FAIL: RPC_URL='$1' expected exit 2 and '$2', got: $out"; fail=1
  else
    echo "ok: RPC_URL='$1' -> $2"
  fi
}
check "not-a-url" "scheme '(not a URL: no '://')' host '(not a URL: no '://')'"
check "1http://example.com" "scheme '(unparsable scheme)' host 'example.com'"
check "http://user:key@" "scheme 'http' host '(unparsable host: empty)'"
check "https://user:key@rpc.example.com:5050/v1/KEY" "scheme 'https' host 'rpc.example.com'"
check "http://127.0.0.1:5050@other-host:5050" "host 'other-host'"

# The networks and options deploy.sh accepts (S-1, D-16): devnet and sepolia only, mainnet refused by name. Each
# refusal happens before anything is built or sent.
refuse() { # <expected exit> <expected fragment> <deploy.sh args...>
  local code="$1" frag="$2" out rc; shift 2
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL "$here/deploy.sh" "$@" 2>&1 >/dev/null)"
  rc=$?
  if [[ $rc -ne $code || "$out" != *"$frag"* ]]; then
    echo "FAIL: deploy.sh $* expected exit $code and '$frag', got $rc: $out"; fail=1
  else
    echo "ok: deploy.sh $* -> $frag"
  fi
}
refuse 2 "refusing mainnet" mainnet
refuse 2 "unsupported network 'katana'" katana
refuse 2 "unsupported network ''"
refuse 2 "unknown option '--rehearse' for 'devnet'" devnet --rehearse
refuse 2 "unknown option '--unmerged' for 'sepolia'" sepolia --unmerged
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia
out="$(RPC_URL=https://rpc.example.com/v1/KEY "$here/deploy.sh" sepolia --rehearse 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"host 'rpc.example.com'"* && "$out" != *KEY* ]]; then
  echo "ok: deploy.sh sepolia --rehearse refuses a remote node, its key unprinted"
else echo "FAIL: deploy.sh sepolia --rehearse with a remote RPC_URL: $out"; fail=1; fi

# sepolia names each missing variable, never a value, and stops before anything is built or sent. The values below
# are dummies; a marker in each proves no value is printed.
sepolia() { # <expected exit> <expected fragment> [VAR=value...]
  local code="$1" frag="$2" out rc; shift 2
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL "$@" "$here/deploy.sh" sepolia 2>&1 >/dev/null)"
  rc=$?
  if [[ $rc -ne $code || "$out" != *"$frag"* || "$out" == *MARKER* || "$out" == *0xabc* ]]; then
    echo "FAIL: sepolia with ${*%%=*} expected exit $code and '$frag', no value, got $rc: $out"; fail=1
  else
    echo "ok: sepolia with $# variable(s) -> $frag"
  fi
}
ADDR=STARKNET_ACCOUNT_ADDRESS=0xabc
KEY=STARKNET_PRIVATE_KEY=0xMARKER
URL=STARKNET_RPC_URL=https://MARKER.example.com/v1/MARKER
sepolia 2 "needs STARKNET_PRIVATE_KEY STARKNET_RPC_URL in" "$ADDR"
sepolia 2 "needs STARKNET_ACCOUNT_ADDRESS in" "$KEY" "$URL"
sepolia 2 "needs STARKNET_RPC_URL in" "$ADDR" "$KEY"
sepolia 2 "needs STARKNET_PRIVATE_KEY in" "$ADDR" STARKNET_PRIVATE_KEY= "$URL"
sepolia 2 "STARKNET_ACCOUNT_ADDRESS is not a 0x hex address" STARKNET_ACCOUNT_ADDRESS=MARKER "$KEY" "$URL"
sepolia 2 "STARKNET_RPC_URL must be an https:// URL" "$ADDR" "$KEY" STARKNET_RPC_URL=http://MARKER:5050

# Past the variable checks, a sepolia run that fails at the node (P-40, #293 audit note 3): shims of curl, node and npm
# first on PATH log each call's argv and environment, and curl answers as a fake node (down, on mainnet, or on Sepolia
# without the deployer account). No marker of the three values may reach any output, argv or child environment; the
# URL reaches curl on stdin only, and nothing is signed (no node or npm call).
shims="$(mktemp -d)"
trap 'rm -rf "$shims"' EXIT
for tool in node npm; do
  printf '#!/usr/bin/env bash\n{ printf "%s argv:"; printf " %%s" "$@"; echo; echo "%s env:"; env; } >>"$SHIM_LOG"\nexit 1\n' \
    "$tool" "$tool" >"$shims/$tool"
done
cat >"$shims/curl" <<'SH'
#!/usr/bin/env bash
{ printf 'curl argv:'; printf ' %s' "$@"; echo; echo 'curl env:'; env; } >>"$SHIM_LOG"
config="$(cat)"
[[ "$config" == *MARKER* ]] && echo 'curl: the URL came on stdin' >>"$SHIM_LOG"
body=""
while [[ $# -gt 0 ]]; do [[ "$1" == -d ]] && body="$2"; shift; done
case "$FAKE_NODE:$body" in
  down:*) exit 7 ;;
  *starknet_specVersion*) echo '{"jsonrpc":"2.0","id":1,"result":"0.10.2"}' ;;
  mainnet:*starknet_chainId*) echo '{"jsonrpc":"2.0","id":1,"result":"0x534e5f4d41494e"}' ;;
  *starknet_chainId*) echo '{"jsonrpc":"2.0","id":1,"result":"0x534e5f5345504f4c4941"}' ;;
  *) echo '{"jsonrpc":"2.0","id":1,"error":{"code":20,"message":"Contract not found"}}' ;;
esac
SH
chmod +x "$shims/curl" "$shims/node" "$shims/npm"
at_node() { # <FAKE_NODE mode> <expected fragment>
  local out rc log="$shims/$1.log"
  : >"$log"
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$shims:$PATH" SHIM_LOG="$log" \
    FAKE_NODE="$1" "$ADDR" "$KEY" "$URL" "$here/deploy.sh" sepolia 2>&1)"
  rc=$?
  if [[ $rc -ne 1 || "$out" != *"$2"* || "$out" == *MARKER* ]]; then
    echo "FAIL: sepolia at a $1 node expected exit 1 and '$2', no value, got $rc: $out"; fail=1
  elif grep -q MARKER "$log" || ! grep -q '^curl: the URL came on stdin$' "$log" || grep -q '^\(node\|npm\) argv' "$log"; then
    echo "FAIL: sepolia at a $1 node: a value reached a child's argv or environment, or something was signed:"
    grep -n 'MARKER\|^[a-z]* argv' "$log" | sed 's/MARKER/<marker>/g'; fail=1
  else
    echo "ok: sepolia at a $1 node -> $2; no value in any output, argv or child environment"
  fi
}
at_node down "no node answers at \$STARKNET_RPC_URL"
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA"
at_node sepolia "the deployer account 0xabc is not deployed on \$STARKNET_RPC_URL"

# The getClass predicate of deploy.sh counts a class as declared only for a JSON object, with no `error`
# field, whose `result` is an object.
verdict() { # <answer> <expected: declared|not>
  local got=not
  printf '%s' "$1" | "$here/deploy.sh" devnet --check-class-answer && got=declared
  if [[ "$got" != "$2" ]]; then echo "FAIL: getClass answer '$1' expected $2, got $got"; fail=1
  else echo "ok: getClass answer '$1' -> $2"; fi
}
verdict '{"jsonrpc":"2.0","id":1,"result":{"sierra_program":[]}}' declared
verdict '{"jsonrpc":"2.0","id":1,"error":{"code":28,"message":"Class hash not found"}}' not
verdict '{"jsonrpc":"2.0","id":1,"result":{"x":1},"error":{"code":1}}' not
verdict '{"jsonrpc":"2.0","id":1,"result":"ok"}' not
verdict '{"jsonrpc":"2.0","id":1,"result":null}' not
verdict '{"jsonrpc":"2.0","id":1,"result":[]}' not
verdict '{"jsonrpc":"2.0","id":1}' not
verdict '["result",{}]' not
verdict '"result"' not
verdict 'not json' not
verdict '' not

# S1 audit: Lobby.spawn takes a Mode, but no external entry point of Daily or Tutorial may (the game contract fixes
# it: Mode::Daily, Mode::Tutorial). Read from the committed ABIs, which CI checks against the build.
for contract in Daily Tutorial; do
  abi="$here/../contracts/abis/$contract.json"
  if python3 -I - "$abi" <<'PY'
import json, sys
abi = json.load(open(sys.argv[1]))
fns = []
def walk(x):
    if isinstance(x, dict):
        if x.get("type") == "function":
            fns.append(x)
        for v in x.values():
            walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)
walk(abi)
assert fns, "no function found in the ABI"
bad = [f["name"] for f in fns for i in f.get("inputs", []) if "Mode" in i["type"]]
sys.exit(1 if bad else 0)
PY
  then echo "ok: $contract has no entry point taking a Mode"
  else echo "FAIL: an entry point of $contract takes a Mode"; fail=1; fi
done
exit $fail
