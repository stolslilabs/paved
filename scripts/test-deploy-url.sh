#!/usr/bin/env bash
# The RPC_URL guard of deploy.sh names what it could not parse (it runs before anything else, so no
# node and no toolchain are needed), and its getClass predicate rejects a malformed answer. Usage: scripts/test-deploy-url.sh
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
