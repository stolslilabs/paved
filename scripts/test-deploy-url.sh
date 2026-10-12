#!/usr/bin/env bash
# The RPC_URL guard of deploy.sh names what it could not parse (it runs before anything else, so no
# node and no toolchain are needed), its network and sepolia variable checks refuse before anything is built or sent
# (S-1), a sepolia run failing at the node leaks no value to an output, an argv or a child's environment (P-40), and
# its getClass predicate rejects a malformed answer. The same holds on the --repoint path (R-1). Usage:
# scripts/test-deploy-url.sh
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
# --repoint (R-1): sepolia and its rehearsal only; the rehearsal names its own deployment file, Sepolia never does.
repoint_file="$(mktemp)"
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --repoint
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --repoint --check-only
refuse 2 "unknown option '--repoint' for 'devnet'" devnet --repoint
refuse 2 "--deployment is for the rehearsal only" sepolia --repoint --deployment "$repoint_file"
refuse 2 "sepolia --rehearse --repoint needs --deployment <file>" sepolia --rehearse --repoint
refuse 2 "--deployment expects an existing deployment file" sepolia --rehearse --repoint --deployment "$repoint_file.missing"
refuse 2 "unknown option '--frobnicate' for 'sepolia --repoint'" sepolia --repoint --frobnicate
refuse 2 "unknown option '--estimate-only' for 'sepolia --repoint'" sepolia --repoint --estimate-only
out="$(RPC_URL=https://rpc.example.com/v1/KEY "$here/deploy.sh" sepolia --rehearse --repoint --deployment "$repoint_file" 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"host 'rpc.example.com'"* && "$out" != *KEY* ]]; then
  echo "ok: deploy.sh sepolia --rehearse --repoint refuses a remote node, its key unprinted"
else echo "FAIL: deploy.sh sepolia --rehearse --repoint with a remote RPC_URL: $out"; fail=1; fi
rm -f "$repoint_file"
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
# The address is a valid hex felt, so its marker is a hex string too.
ADDR_MARK=abcdef0123456789
ADDR=STARKNET_ACCOUNT_ADDRESS=0x$ADDR_MARK
KEY=STARKNET_PRIVATE_KEY=0xMARKER
URL=STARKNET_RPC_URL=https://MARKER.example.com/v1/MARKER
sepolia 2 "needs STARKNET_PRIVATE_KEY STARKNET_RPC_URL in" "$ADDR"
sepolia 2 "needs STARKNET_ACCOUNT_ADDRESS in" "$KEY" "$URL"
sepolia 2 "needs STARKNET_RPC_URL in" "$ADDR" "$KEY"
sepolia 2 "needs STARKNET_PRIVATE_KEY in" "$ADDR" STARKNET_PRIVATE_KEY= "$URL"
sepolia 2 "STARKNET_ACCOUNT_ADDRESS is not a 0x hex address" STARKNET_ACCOUNT_ADDRESS=MARKER "$KEY" "$URL"
sepolia 2 "STARKNET_RPC_URL must be an https:// URL" "$ADDR" "$KEY" STARKNET_RPC_URL=http://MARKER:5050
# The URL goes into a quoted string of curl's config: a quote, a backslash or a line break is refused.
for bad in 'https://MARKER.example.com/"x' 'https://MARKER.example.com/\x' $'https://MARKER.example.com/\nx' \
    $'https://MARKER.example.com/\rx'; do
  sepolia 2 "STARKNET_RPC_URL holds a double quote, a backslash or a line break" "$ADDR" "$KEY" "STARKNET_RPC_URL=$bad"
done

# Past the variable checks, a sepolia run that fails at the node (P-40, #293 audit note 3): shims of curl, node and npm
# first on PATH log each call's argv and environment, and curl answers as a fake node (down, on mainnet, or on Sepolia
# without the deployer account). No marker of the three values (the address included) may reach any output, argv or
# child environment; the URL and the request (with the address) reach curl on stdin only, and nothing is signed (no
# node or npm call).
shims="$(mktemp -d)"
trap 'rm -rf "$shims"' EXIT
mkdir "$shims/signer"
# The shims read the address marker from a file: in their environment it would count as a leak.
printf '%s' "$ADDR_MARK" >"$shims/addr_mark"
for tool in node npm; do
  printf '#!/usr/bin/env bash\n{ printf "%s argv:"; printf " %%s" "$@"; echo; echo "%s env:"; env; } >>"$SHIM_LOG"\nexit 1\n' \
    "$tool" "$tool" >"$shims/$tool"
done
cat >"$shims/curl" <<'SH'
#!/usr/bin/env bash
{ printf 'curl argv:'; printf ' %s' "$@"; echo; echo 'curl env:'; env; } >>"$SHIM_LOG"
config="$(cat)"
[[ "$config" == *MARKER* ]] && echo 'curl: the URL came on stdin' >>"$SHIM_LOG"
[[ "$config" == *"$(cat "${0%/*}/addr_mark")"* ]] && echo 'curl: the address came on stdin' >>"$SHIM_LOG"
# deploy.sh asks for the HTTP status after the body (`-w`): 200 unless a case says otherwise.
status=200
# flaky: the first two starknet_specVersion calls answer -32601 with HTTP 400 (S-1c), counted in a file beside the shim.
if [[ "$FAKE_NODE" == flaky && "$config" == *starknet_specVersion* ]]; then
  count="$(cat "${0%/*}/flaky.count" 2>/dev/null || echo 0)"
  echo $((count + 1)) >"${0%/*}/flaky.count"
  if (( count < 2 )); then
    printf '%s\n400' '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"the method starknet_specVersion does not exist/is not available"}}'
    exit 0
  fi
fi
case "$FAKE_NODE:$config" in
  down:*) exit 7 ;;
  *starknet_specVersion*) body='{"jsonrpc":"2.0","id":1,"result":"0.10.2"}' ;;
  mainnet:*starknet_chainId* | flaky:*starknet_chainId*) body='{"jsonrpc":"2.0","id":1,"result":"0x534e5f4d41494e"}' ;;
  estimate:*starknet_getClassHashAt*) body='{"jsonrpc":"2.0","id":1,"result":"0x1"}' ;;
  # The classes the node has (S-1d): their hashes are listed in a file beside the shim.
  estimate:*'starknet_getClass\"'*)
    body='{"jsonrpc":"2.0","id":1,"error":{"code":28,"message":"Class hash not found"}}'
    while read -r h; do
      [[ -n "$h" && "$config" == *"$h"* ]] && body='{"jsonrpc":"2.0","id":1,"result":{"sierra_program":[]}}'
    done < <(cat "${0%/*}/declared" 2>/dev/null)
    ;;
  *starknet_chainId*) body='{"jsonrpc":"2.0","id":1,"result":"0x534e5f5345504f4c4941"}' ;;
  *) body='{"jsonrpc":"2.0","id":1,"error":{"code":20,"message":"Contract not found"}}' ;;
esac
printf '%s\n%s' "$body" "$status"
SH
# A fake signer for `--check-send-failure`: it logs its argv and environment, then prints the three values (the address
# padded to 64 digits, the key in upper case) on both streams and fails, as a signer whose sanitiser missed them would.
cat >"$shims/signer/node" <<'SH'
#!/usr/bin/env bash
# Its log is beside it, not in SHIM_LOG: send's environment allowlist drops that variable.
{ printf 'node argv:'; printf ' %s' "$@"; echo; echo 'node env:'; env; } >>"${0%/*}/../send.log"
pad="$(printf '%064x' "0x${STARKNET_ACCOUNT_ADDRESS#0x}" 2>/dev/null || echo "$STARKNET_ACCOUNT_ADDRESS")"
if [[ -e "${0%/*}/long" ]]; then
  # Long mode: more than 800 characters, the address across the 800th from the end (790 after it).
  printf '%s%s%s\n' "$(printf 'x%.0s' {1..300})" "$STARKNET_ACCOUNT_ADDRESS" "$(printf 'y%.0s' {1..790})" >&2
  exit 1
fi
echo "out ${STARKNET_ACCOUNT_ADDRESS} at ${STARKNET_RPC_URL}"
echo "err 0x$pad key ${STARKNET_PRIVATE_KEY^^} ${STARKNET_PRIVATE_KEY}" >&2
exit 1
SH
chmod +x "$shims/curl" "$shims/node" "$shims/npm" "$shims/signer/node"
leaks() { grep -i -e MARKER -e "$ADDR_MARK" "$@"; }
at_node() { # <FAKE_NODE mode> <expected fragment> [deploy.sh options after sepolia...]
  local out rc log="$shims/$1.log" mode="$1" frag="$2"
  shift 2
  : >"$log"
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$shims:$PATH" SHIM_LOG="$log" \
    FAKE_NODE="$mode" "$ADDR" "$KEY" "$URL" "$here/deploy.sh" sepolia "$@" 2>&1)"
  rc=$?
  set -- "$mode" "$frag" "$@"
  if [[ $rc -ne 1 || "$out" != *"$2"* ]] || leaks -q <<<"$out"; then
    echo "FAIL: sepolia ${*:3} at a $1 node expected exit 1 and '$2', no value, got $rc: $out"; fail=1
  elif leaks -q "$log" || ! grep -q '^curl: the URL came on stdin$' "$log" || grep -q '^\(node\|npm\) argv' "$log" ||
      { [[ "$1" == sepolia ]] && ! grep -q '^curl: the address came on stdin$' "$log"; }; then
    echo "FAIL: sepolia ${*:3} at a $1 node: a value reached a child's argv or environment, or something was signed:"
    leaks -n "$log" | sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI"; grep -n '^[a-z]* argv\|^curl: ' "$log"; fail=1
  else
    echo "ok: sepolia ${*:3} at a $1 node -> $2; no value in any output, argv or child environment"
  fi
}
at_node down "no node answers at \$STARKNET_RPC_URL"
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA"
# flaky (S-1c): deploy.sh retries a read answered -32601 (HTTP 400) and goes on; this node then reports mainnet.
rm -f "$shims/flaky.count"
at_node flaky "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA"
if [[ "$(cat "$shims/flaky.count")" != 3 ]]; then
  echo "FAIL: deploy.sh asked starknet_specVersion $(cat "$shims/flaky.count") times, expected 3 (two retries)"; fail=1
else
  echo "ok: deploy.sh retried starknet_specVersion twice after -32601 (HTTP 400), then went on"
fi
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL"
# The --repoint path (R-1) shares those checks: the marker URL and address stay out of every output, argv and child
# environment there too, and nothing is signed (no node or npm call).
at_node down "no node answers at \$STARKNET_RPC_URL" --repoint
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA" --repoint
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --repoint
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --repoint --check-only

# `send` (review of #299): a signer that fails while printing the three values leaks none of them through deploy.sh,
# gets no value in its argv, and starts with the allowlisted environment only (no NODE_TLS_REJECT_UNAUTHORIZED, no
# NODE_EXTRA_CA_CERTS, no other variable of the caller).
log="$shims/send.log"
: >"$log"
out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$shims/signer:$PATH" \
  NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_EXTRA_CA_CERTS=/tmp/x.pem CALLER_CANARY=1 \
  "$ADDR" "$KEY" "$URL" "$here/deploy.sh" sepolia --check-send-failure 2>&1)"
rc=$?
names="$(sed -n '/^node env:$/,$p' "$log" | sed '1d' | cut -d= -f1 | grep -v '^_$\|^PWD$\|^SHLVL$\|^OLDPWD$' | sort | tr '\n' ' ')"
want="HOME NODE_OPTIONS PATH SIGNER_NETWORK STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL "
if [[ $rc -ne 1 || "$out" != *"signer call failed"* || "$out" != *'$STARKNET_ACCOUNT_ADDRESS'* ]] || leaks -q <<<"$out"; then
  echo "FAIL: a failing signer through send: expected exit 1, 'signer call failed', labels and no value, got $rc:"
  sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$out"; fail=1
elif grep '^node argv' "$log" | leaks -q; then
  echo "FAIL: a value reached the signer's argv"; fail=1
elif [[ "$names" != "$want" ]]; then
  echo "FAIL: the signer's environment is not the allowlist: $names"; fail=1
else
  echo "ok: a failing signer through send leaks no value; its argv holds none; its environment is: $names"
fi
# Redacted before the 800-character cut: an address across the cut leaves no fragment (its last 7 digits).
touch "$shims/signer/long"
out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$shims/signer:$PATH" \
  "$ADDR" "$KEY" "$URL" "$here/deploy.sh" sepolia --check-send-failure 2>&1)"
rc=$?
rm -f "$shims/signer/long"
if [[ $rc -ne 1 || "$out" != *"signer call failed"* || "$out" == *"${ADDR_MARK: -7}"* ]] || leaks -q <<<"$out"; then
  echo "FAIL: a long failing signer output: expected exit 1 and no fragment of the address at the cut, got $rc:"
  sed "s/MARKER/<marker>/gI; s/${ADDR_MARK: -7}/<address fragment>/gI" <<<"$out"; fail=1
else
  echo "ok: a long failing signer output is redacted before its cut (no fragment of the address)"
fi

# --repoint past the node checks (R-1, review of #313): a fake node over curl (the repoint's contracts, classes and
# receipts, in files beside it) and a fake signer as `node`, which answers views by entry point, logs its argv and
# environment, and logs each multicall it accepts or refuses. Each case is set by files beside the signer:
#   leak:          the first send (Economy.owner) fails while printing the three values: none reaches an output, the
#                  signer's argv holds none, its environment is the allowlist (loop 1, finding 3);
#   quote_fails:   the new MockRouter's quote_swap fails: --check-only and a full run exit non-zero, print no pass and
#                  send nothing (loop 1, finding 1);
#   send_refused:  the seed multicall is refused and the signer's verdict is `not landed`: the recorded hash is
#                  cleared, and the rerun sends the seed again (loop 2, finding 1);
#   a recorded seed hash with no receipt stops the run (REPOINT_WAIT_S=0), the hash kept; a REVERTED one is cleared and
#   the seed sent again; a complete repoint with no STRK passes the funding check and sends nothing (loop 2).
rp="$shims/repoint"
mkdir -p "$rp/bin" "$rp/root/scripts" "$rp/root/contracts/target/release" "$rp/root/contracts/deployments"
hexname() { printf '0x%s\n' "$(printf '%s' "$1" | od -An -tx1 | tr -d ' \n')"; }
rp_classes() { # [Economy's class on the node]; each address short and padded to 64 digits (the record pads them, O-19)
  local a c
  while read -r a c; do printf '%s %s\n0x%064x %s\n' "$a" "$c" "$a" "$c"; done >"$rp/bin/classes" \
    <<<"0xe0 ${1:-0xec0}
0x80 0xc80
0x90 $(hexname MockRouter)"
}
for name in MockRouter Economy; do hexname "$name"; done >"$rp/bin/declared"
cat >"$rp/bin/curl" <<'SH'
#!/usr/bin/env bash
{ printf 'curl argv:'; printf ' %s' "$@"; echo; echo 'curl env:'; env; } >>"$SHIM_LOG"
config="$(cat)"
[[ "$config" == *MARKER* ]] && echo 'curl: the URL came on stdin' >>"$SHIM_LOG"
dir="${0%/*}"
body='{"jsonrpc":"2.0","id":1,"error":{"code":29,"message":"Transaction hash not found"}}'
case "$config" in
  *starknet_specVersion*) body='{"jsonrpc":"2.0","id":1,"result":"0.10.2"}' ;;
  *starknet_chainId*) body='{"jsonrpc":"2.0","id":1,"result":"0x534e5f5345504f4c4941"}' ;;
  *starknet_getClassHashAt*)
    class=0x1
    while read -r a c; do [[ "$config" == *"\\\"$a\\\""* ]] && class="$c"; done <"$dir/classes"
    body="{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":\"$class\"}" ;;
  *'starknet_getClass\"'*)
    body='{"jsonrpc":"2.0","id":1,"error":{"code":28,"message":"Class hash not found"}}'
    while read -r h; do [[ "$config" == *"$h"* ]] && body='{"jsonrpc":"2.0","id":1,"result":{"sierra_program":[]}}'; done <"$dir/declared" ;;
  *starknet_getTransactionReceipt*|*starknet_getTransactionStatus*)
    # The receipts the node has: `<hash> <execution status>` per line.
    while read -r h st; do
      [[ -n "$h" && "$config" == *"\\\"$h\\\""* ]] || continue
      if [[ "$config" == *starknet_getTransactionReceipt* ]]; then
        body="{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"transaction_hash\":\"$h\",\"execution_status\":\"$st\",\"finality_status\":\"ACCEPTED_ON_L2\",\"events\":[]}}"
      else
        body="{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"finality_status\":\"ACCEPTED_ON_L2\",\"execution_status\":\"$st\"}}"
      fi
    done < <(cat "$dir/receipts" 2>/dev/null) ;;
esac
printf '%s\n200' "$body"
SH
cat >"$rp/bin/node" <<'SH'
#!/usr/bin/env bash
[[ "$1" == --version ]] && { echo v24.0.0; exit 0; }
dir="${0%/*}"
{ printf 'node argv:'; printf ' %s' "$@"; echo; echo 'node env:'; env; } >>"$dir/signer.log"
shift 2
cmd="$1"; shift
if [[ -e "$dir/leak" ]]; then
  echo "out ${STARKNET_ACCOUNT_ADDRESS} at ${STARKNET_RPC_URL}"
  echo "err key ${STARKNET_PRIVATE_KEY^^} ${STARKNET_PRIVATE_KEY}" >&2
  exit 1
fi
fn="" sierra="" contract="" calls="" cd=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --function) fn="$2"; shift ;; --sierra) sierra="$2"; shift ;; --contract) contract="$2"; shift ;;
    --calls) calls="$2"; shift ;; --calldata) shift; cd=("$@"); break ;;
  esac
  shift
done
big='["0xffffffffffffffffffffffff","0x0"]'
# Addresses compared without their padding (the record pads them, O-19).
contract="0x$(sed 's/^0x0*//' <<<"$contract")"
case "$cmd:$fn" in
  call:owner) r="[\"$STARKNET_ACCOUNT_ADDRESS\"]" ;;
  call:addresses) r="[\"0x10\",\"0x20\",\"0x30\",\"$([[ -e "$dir/repointed" ]] && echo 0x90 || echo 0x80)\",\"0x50\"]" ;;
  call:router) [[ -e "$dir/repointed" ]] || { echo "signer: call failed: ENTRYPOINT_NOT_FOUND" >&2; exit 1; }; r='["0x90"]' ;;
  call:pool_key) r='["0x10","0x20","0x1","0x1","0x0"]' ;;
  call:pool) r='["0x10","0x20","0x1","0x1","0x0","0x0","0x0"]' ;;
  call:reserves)
    # PAVED (0x10) is token0: 800,000 PAVED and 10,000 USDC, the old pool's size.
    r='["0xa968163f0a57b400000","0x0","0x2540be400","0x0"]'
    if [[ "$contract" == 0x90 && -e "$dir/seeded" ]]; then r="$(cat "$dir/seeded")"
    elif [[ "$contract" == 0x90 && -e "$dir/unseeded" ]]; then r='["0x0","0x0","0x0","0x0"]'; fi ;;
  call:balance_of) r="$big"; [[ "$contract" == 0x4718f5a* && -e "$dir/poor" ]] && r='["0x0","0x0"]' ;;
  call:staked) r='["0x2a5a058fc295ed000000","0x0"]' ;;
  call:minted) r='["0x0","0x0"]' ;;
  call:terms) r="[\"$STARKNET_ACCOUNT_ADDRESS\",\"0x0\",\"0x0\",\"0x1\",\"0x0\",\"0x0\",\"0x0\",\"0x0\",\"0x0\",\"0x1\",\"0x0\",\"0x0\",\"0x0\"]" ;;
  call:quote_swap)
    if [[ -e "$dir/quote_fails" ]]; then echo "signer: call failed: Contract error: ENTRYPOINT_NOT_FOUND" >&2; exit 1; fi
    # PAVED out, the whole USDC input (the next-to-last calldata word) in.
    r="[\"0x5\",\"0x1\",\"$(printf '0x%x' "${cd[${#cd[@]}-2]}")\",\"0x0\"]" ;;
  declare:)
    name="${sierra##*/paved_}"; name="${name%%.*}"
    echo "{\"class_hash\":\"0x$(printf '%s' "$name" | od -An -tx1 | tr -d ' \n')\",\"transaction_hash\":null,\"already_declared\":true}"
    exit 0 ;;
  multicall:)
    n="$(($(cat "$dir/count" 2>/dev/null || echo 0) + 1))"; echo "$n" >"$dir/count"
    hash="$(printf '0x5eed%04x' "$n")"
    # lock_dir: the deployment's directory turns read-only as the transaction goes out, so its hash cannot be recorded.
    [[ -e "$dir/lock_dir" ]] && chmod a-w "$(cat "$dir/lock_dir")"
    echo "signer: sending starknet_addInvokeTransaction, transaction $hash" >&2
    fns="$(python3 -I -c 'import json,sys;print(" ".join(c["function"] for c in json.load(open(sys.argv[1]))))' "$calls")"
    if [[ -e "$dir/send_refused" ]]; then
      echo "multicall $fns $hash" >>"$dir/refused.log"
      echo "signer: refused (-32601); no receipt for $hash after 30 s; not landed (nonce unchanged at 0x5); check it before any rerun" >&2
      exit 1
    fi
    echo "multicall $fns $hash" >>"$dir/sent.log"
    echo "$hash SUCCEEDED" >>"$dir/receipts"
    # The new pool's reserves after an add_liquidity: its calldata.
    python3 -I -c '
import json, sys
for c in json.load(open(sys.argv[1])):
    if c["function"] == "add_liquidity":
        open(sys.argv[2], "w").write(json.dumps(["0x%x" % int(x) for x in c["calldata"]]))' "$calls" "$dir/seeded"
    echo "{\"transaction_hash\":\"$hash\"}"
    exit 0 ;;
  *) echo "$cmd $fn" >>"$dir/sent.log"; echo "signer: the test sends nothing" >&2; exit 1 ;;
esac
echo "{\"result\":$r}"
SH
printf '#!/usr/bin/env bash\nexit 0\n' >"$rp/bin/npm"
printf '#!/usr/bin/env bash\nexit 0\n' >"$rp/bin/scarb"
cat >"$rp/bin/sncast" <<'SH'
#!/usr/bin/env bash
[[ "$*" == *"utils class-hash --contract-name "* ]] || exit 1
args="$*"; name="${args##*--contract-name }"; name="${name%% *}"
printf '{"command":"utils class-hash","class_hash":"0x%s"}\n' "$(printf '%s' "$name" | od -An -tx1 | tr -d ' \n')"
SH
chmod +x "$rp/bin/"*
cp "$here/deploy.sh" "$rp/root/scripts/"
mkdir -p "$rp/root/scripts/signer"
for name in MockRouter Economy; do
  cp "$here/signer/test/fixtures/tiny.contract_class.json" "$rp/root/contracts/target/release/paved_$name.contract_class.json"
  cp "$here/signer/test/fixtures/tiny.compiled_contract_class.json" "$rp/root/contracts/target/release/paved_$name.compiled_contract_class.json"
done
printf 'target/\n' >"$rp/root/contracts/.gitignore"
git -C "$rp/root" init -q
git -C "$rp/root" add -A
git -C "$rp/root" -c user.name=test -c user.email=test@example.com -c core.hooksPath=/dev/null commit -qm root
git -C "$rp/root" update-ref refs/remotes/origin/main HEAD
rp_json="$rp/root/contracts/deployments/sepolia.json"
# The deployment (written after the commit: the source check reads contracts/src, Scarb.toml and Scarb.lock only), with
# an optional `repoint` record, as JSON. Each case starts from clean signer and node files.
rp_case() { # [repoint record]
  rm -f "$rp/bin/"{leak,quote_fails,send_refused,unseeded,seeded,repointed,poor,receipts,count,refused.log,lock_dir}
  rp_classes
  python3 -I - "$rp_json" "${1:-}" <<'PY'
import json, sys
c = lambda a, h: {"address": a, "class_hash": h}
d = {"network": "sepolia", "chain_id": "0x534e5f5345504f4c4941", "rpc_url": "$STARKNET_RPC_URL", "deployed_block": 1,
     "contracts": {"Account": c("0x40", "0xa"), "Daily": c("0x50", "0xd"), "Tutorial": c("0x60", "0xb"),
                   "Collection": c("0x70", "0xc"), "Economy": c("0xe0", "0xec0"), "PavedToken": c("0x10", "0xf"),
                   "Vault": c("0x30", "0xe"), "MockUSDC": c("0x20", "0x2"), "MockRouter": c("0x80", "0xc80")}}
if sys.argv[2]:
    d["repoint"] = json.loads(sys.argv[2])
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
}
rp_get_test() { python3 -I -c 'import json,sys;n=json.load(open(sys.argv[1])).get("repoint",{})
for k in sys.argv[2].split("."): n=n.get(k,{}) if isinstance(n,dict) else {}
print(n if isinstance(n,str) else "")' "$rp_json" "$1"; }
rp_run() { # <deploy.sh options after sepolia...>
  : >"$rp/bin/signer.log"; : >"$rp/bin/sent.log"
  env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$rp/bin:$PATH" SHIM_LOG="$rp/curl.log" \
    SCARB_BIN_DIR="$rp/bin" SNCAST_BIN_DIR="$rp/bin" "$ADDR" "$KEY" "$URL" "$rp/root/scripts/deploy.sh" sepolia "$@" 2>&1
}
rp_fail() { # <label> <output>
  echo "FAIL: sepolia --repoint, $1:"; sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$2"
  echo "sent: $(cat "$rp/bin/sent.log")"; fail=1
}
: >"$rp/curl.log"
recorded_router='{"MockRouter": {"address": "0x90"}}'

# leak: the first send of repoint_state fails, printing the three values.
rp_case
touch "$rp/bin/leak"
out="$(rp_run --repoint)"; rc=$?
names="$(sed -n '/^node env:$/,/^node argv/p' "$rp/bin/signer.log" | sed '1d;/^node argv/d' | cut -d= -f1 | grep -v '^_$\|^PWD$\|^SHLVL$\|^OLDPWD$' | sort -u | tr '\n' ' ')"
if [[ $rc -ne 1 || "$out" != *"== repoint: state (read-only)"* || "$out" != *"signer call failed"* ]] || leaks -q <<<"$out"; then
  rp_fail "a failing send in repoint_state: expected exit 1, 'signer call failed', no value, got $rc" "$out"
elif grep '^node argv' "$rp/bin/signer.log" | leaks -q || leaks -q "$rp/curl.log" || ! grep -q '^curl: the URL came on stdin$' "$rp/curl.log"; then
  echo "FAIL: sepolia --repoint: a value reached the signer's argv or curl's argv or environment"; fail=1
elif [[ "$names" != "$want" ]]; then
  echo "FAIL: sepolia --repoint: the signer's environment is not the allowlist: $names"; fail=1
else
  echo "ok: sepolia --repoint reaches repoint_state; a failing send there leaks no value; the signer's argv holds none; its environment is: $names"
fi

# quote_fails: a recorded, seeded new MockRouter that does not answer quote_swap.
for mode in --check-only ""; do
  rp_case "$recorded_router"
  touch "$rp/bin/quote_fails"
  # shellcheck disable=SC2086
  out="$(rp_run --repoint $mode)"; rc=$?
  if [[ $rc -eq 0 || "$out" == *"every check passed"* || "$out" == *"== repoint: smoke"* ||
      "$out" != *"repoint_quote failed: stopping before anything else is sent"* || -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
    rp_fail "${mode:-full run} with a router whose quote_swap fails: expected a non-zero exit, no pass and nothing sent, got $rc" "$out"
  else
    echo "ok: sepolia --repoint ${mode:-(full run)} stops when the new MockRouter's quote_swap fails (exit $rc), no pass printed, nothing sent"
  fi
done

# send_refused: the seed is refused and the signer's verdict is `not landed`: its hash is cleared; the rerun seeds again
# (each run then stops at the quote, so only the seed is at stake).
rp_case "$recorded_router"
touch "$rp/bin/unseeded" "$rp/bin/send_refused" "$rp/bin/quote_fails"
out="$(rp_run --repoint)"; rc=$?
refused="$(cut -d' ' -f2- "$rp/bin/refused.log" 2>/dev/null)"
if [[ $rc -ne 1 || "$out" != *"not landed: repoint.seed.tx cleared, so a rerun sends it again"* || -n "$(rp_get_test seed.tx)" ||
    "$refused" != "approve approve add_liquidity 0x5eed0001" || -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  rp_fail "a seed refused 'not landed': expected exit 1, its hash cleared, nothing sent, got $rc (refused: $refused)" "$out"
else
  echo "ok: sepolia --repoint: a seed the signer finds 'not landed' has its hash cleared (exit $rc)"
fi
rm -f "$rp/bin/send_refused"
out="$(rp_run --repoint)"; rc=$?
if [[ $rc -ne 1 || "$out" != *"   seeded: "* || "$(cat "$rp/bin/sent.log")" != "multicall approve approve add_liquidity 0x5eed0002" ||
    "$(rp_get_test seed.tx)" != 0x5eed0002 || "$out" != *"repoint_quote failed"* ]] || leaks -q <<<"$out"; then
  rp_fail "the rerun after a 'not landed' seed: expected the seed sent once (0x5eed0002) and recorded, got $rc" "$out"
else
  echo "ok: sepolia --repoint: the rerun after a 'not landed' seed sends it once and records 0x5eed0002"
fi

# A recorded seed with no receipt: the wait (REPOINT_WAIT_S=0 here) ends the run, the hash kept, nothing sent.
rp_case "{\"MockRouter\": {\"address\": \"0x90\"}, \"seed\": {\"tx\": \"0xdead1\"}}"
touch "$rp/bin/unseeded"
out="$(REPOINT_WAIT_S=0 rp_run --repoint)"; rc=$?
if [[ $rc -ne 1 || "$out" != *"seed.tx 0xdead1 (recorded) has no receipt after 0 s (node: UNKNOWN): check it before any rerun"* ||
    "$(rp_get_test seed.tx)" != 0xdead1 || -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  rp_fail "a recorded seed with no receipt: expected exit 1, the hash kept, nothing sent, got $rc" "$out"
else
  echo "ok: sepolia --repoint: a recorded seed with no receipt stops the run (exit $rc), its hash kept, nothing sent"
fi

# A recorded seed whose receipt is REVERTED: cleared, and the seed sent again.
rp_case "{\"MockRouter\": {\"address\": \"0x90\"}, \"seed\": {\"tx\": \"0xbad1\"}}"
touch "$rp/bin/unseeded" "$rp/bin/quote_fails"
echo "0xbad1 REVERTED" >"$rp/bin/receipts"
out="$(rp_run --repoint)"; rc=$?
if [[ "$out" != *"seed.tx 0xbad1 (recorded): reverted, so it may be sent again"* ||
    "$(cat "$rp/bin/sent.log")" != "multicall approve approve add_liquidity 0x5eed0001" || "$(rp_get_test seed.tx)" != 0x5eed0001 ]] ||
    leaks -q <<<"$out"; then
  rp_fail "a recorded seed that reverted: expected it cleared and the seed sent once, got $rc" "$out"
else
  echo "ok: sepolia --repoint: a recorded seed that reverted is cleared and the seed sent once (0x5eed0001)"
fi

# A hash that cannot be recorded (the deployment's directory read-only as the seed goes out): the signer is not cut
# short, but the run stops after it, naming the hash; nothing else is sent.
rp_case "$recorded_router"
touch "$rp/bin/unseeded"
dirname "$rp_json" >"$rp/bin/lock_dir"
out="$(rp_run --repoint)"; rc=$?
chmod u+w "$(dirname "$rp_json")"
if [[ $rc -ne 1 || "$out" != *"deploy.sh: could not record 0x5eed0001 under repoint.seed.tx"* ||
    "$out" != *"a transaction was sent but its hash (shown above) could not be recorded under repoint.seed.tx"* ||
    "$(cat "$rp/bin/sent.log")" != "multicall approve approve add_liquidity 0x5eed0001" || "$out" == *"== repoint: Economy"* ]] ||
    leaks -q <<<"$out"; then
  rp_fail "a seed hash that cannot be recorded: expected exit 1 after the seed, the hash named, nothing more sent, got $rc" "$out"
else
  echo "ok: sepolia --repoint: a hash that cannot be recorded stops the run after its send, the hash named, nothing more sent"
fi

# A complete repoint and no STRK: the funding check does not refuse, the smoke reads back, nothing is sent (exit 0).
rp_case "{\"MockRouter\": {\"address\": \"0x90\"}, \"smoke\": {\"game_id\": \"7\"}}"
rp_classes "$(hexname Economy)"
touch "$rp/bin/repointed" "$rp/bin/poor"
out="$(rp_run --repoint)"; rc=$?
if [[ $rc -ne 0 || "$out" != *"complete: upgraded, repointed, seeded, smoke recorded; nothing is left to send"* ||
    "$out" != *"deployer STRK balance 0.00 STRK: BELOW the need of 20.00 STRK"* ||
    "$out" != *"--repoint: nothing is left to send, so the need does not apply"* || "$out" != *"== repoint: smoke ok"* ||
    -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  rp_fail "a complete repoint with no STRK: expected exit 0, the funding need waived, nothing sent, got $rc" "$out"
else
  echo "ok: sepolia --repoint: a complete repoint with 0 STRK passes the funding check (nothing left to send), smoke ok, nothing sent"
fi

# sepolia --estimate-only (S-1c): past every check (a fake node over curl that has the deployer, the source check, a
# no-op npm and scarb), the real signer estimates each class, under a node shim that preloads the signer's fake node
# (test/fixtures/fake-estimate-node.mjs: it answers an estimate and would accept any transaction, and logs each
# method). Nothing may reach a starknet_add* method, no block is read (the fixed tip, S-1c), each class gets a line
# with the spec version, and no value leaks. Needs Node 24 and scripts/signer's node_modules (npm ci there): skipped
# without them, as in CI's build job, which has neither.
real_node="$(command -v node || true)"
if [[ -n "$real_node" && "$("$real_node" --version 2>/dev/null)" == v24.* && -d "$here/signer/node_modules/starknet" ]]; then
  est="$shims/estimate"
  # The real signer refuses a key that is not a felt: a hex marker, checked for leaks below as well.
  KEY_MARK=fedcba9876543210fedcba98
  mkdir -p "$est/bin" "$est/classes"
  for name in Account Daily Tutorial MockUSDC PavedToken MockRouter Vault Economy Lobby Collection; do
    cp "$here/signer/test/fixtures/tiny.contract_class.json" "$est/classes/paved_$name.contract_class.json"
    cp "$here/signer/test/fixtures/tiny.compiled_contract_class.json" "$est/classes/paved_$name.compiled_contract_class.json"
  done
  printf '#!/usr/bin/env bash\nexit 0\n' >"$est/bin/npm"
  printf '#!/usr/bin/env bash\nexit 0\n' >"$est/bin/scarb"
  # sncast: when a `hashes` file is beside it, `utils class-hash` answers a class hash per contract name (its name in
  # hex); otherwise it fails (the class hash is then unknown).
  cat >"$est/bin/sncast" <<'SH'
#!/usr/bin/env bash
[[ -f "${0%/*}/hashes" && "$*" == *"utils class-hash --contract-name "* ]] || exit 1
args="$*"; name="${args##*--contract-name }"; name="${name%% *}"
printf '{"command":"utils class-hash","class_hash":"0x%s"}\n' "$(printf '%s' "$name" | od -An -tx1 | tr -d ' \n')"
SH
  # The node shim: its own version for deploy.sh's check, else the real node with the fake node preloaded; the
  # signer's stderr (the methods asked) goes to a log beside it (send's allowlist drops every other variable). The STRK
  # balance the fake node reports comes from a file beside it too, when there is one.
  # A file `estimate_error` beside it makes every estimate fail (FAKE_ESTIMATE_ERROR); a file `fee` sets every
  # estimate's overall fee (FAKE_ESTIMATE_FEE); a file `add_lost` makes every add* time out with no receipt ever, on a
  # fast clock (S-1d); a file `add_refused` replays t-0182's declare on dRPC (S-1e): the nonce read, the receipt read
  # and the status read each answered -32601 once, the add* refused -32601, no receipt ever. The signer's stderr goes
  # to the log and on to deploy.sh as well (tee).
  printf '#!/usr/bin/env bash\n[[ "$1" == --version ]] && exec %q --version\n[[ -f %q ]] && export FAKE_STRK_BALANCE="$(cat %q)"\n[[ -f %q ]] && export FAKE_ESTIMATE_ERROR=1\n[[ -f %q ]] && export FAKE_ESTIMATE_FEE="$(cat %q)"\n[[ -f %q ]] && export FAKE_ADD_LOST=timeout FAKE_RECEIPT=none FAKE_FAST_CLOCK=1\n[[ -f %q ]] && export FAKE_ADD_LOST=refused:-32601 FAKE_RECEIPT=none FAKE_FAST_CLOCK=1 FAKE_FLAKY=starknet_getNonce:1,starknet_getTransactionReceipt:1,starknet_getTransactionStatus:1\nexec %q --import %q "$@" 2> >(tee -a %q >&2)\n' \
    "$real_node" "$est/strk" "$est/strk" "$est/estimate_error" "$est/fee" "$est/fee" "$est/add_lost" "$est/add_refused" "$real_node" "$here/signer/test/fixtures/fake-estimate-node.mjs" "$est/node.log" >"$est/bin/node"
  cp "$shims/curl" "$shims/addr_mark" "$est/bin/"
  chmod +x "$est/bin/"*
  # deploy.sh runs from a copy in a scratch root: a real run reads its classes from its own release build only
  # (ESTIMATE_RELEASE_DIR is for --estimate-only), and the source check needs an origin/main, which CI's checkout has
  # not. The root is a git repository whose origin/main is its HEAD (the source check
  # passes), the tiny classes as contracts/target/release, and scripts/signer linked to the real signer. A real run is
  # given an ESTIMATE_RELEASE_DIR with no class: honoured, it would stop the run.
  root="$est/root"
  mkdir -p "$root/scripts" "$root/contracts/target" "$est/empty"
  cp "$here/deploy.sh" "$root/scripts/"
  ln -s "$here/signer" "$root/scripts/signer"
  cp -r "$est/classes" "$root/contracts/target/release"
  printf 'target/\n' >"$root/contracts/.gitignore"
  git -C "$root" init -q
  git -C "$root" add -A
  git -C "$root" -c user.name=test -c user.email=test@example.com -c core.hooksPath=/dev/null commit -qm root
  git -C "$root" update-ref refs/remotes/origin/main HEAD
  : >"$est/node.log"
  log="$shims/estimate.log"
  : >"$log"
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$est/bin:$PATH" SHIM_LOG="$log" \
    FAKE_NODE=estimate SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/classes" \
    "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$root/scripts/deploy.sh" sepolia --estimate-only 2>&1)"
  rc=$?
  lines="$(grep -c '^   estimate [A-Za-z]*: spec 0.10.2, sierra .* declared unknown: ok, overall_fee 10000000128 FRI' <<<"$out")"
  if [[ $rc -ne 0 || "$lines" != 10 || "$out" != *"== estimate only: each of the 10 classes estimated or already declared; nothing was sent"* ||
      "$out" != *"== funding: deployer STRK balance 1000.00 STRK"* ||
      "$out" != *"== funding: 10 class(es) to declare, estimated at 0.00 STRK; need 1.25 x 0.00 STRK + 20 STRK margin = 20.00 STRK"* ||
      "$out" != *"   deployer STRK balance 1000.00 STRK: covers the need of 20.00 STRK"* ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia --estimate-only: expected exit 0 and 10 estimate lines, no value, got $rc and $lines:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$out"; fail=1
  elif [[ "$(grep -c '^fake-node: asked starknet_estimateFee$' "$est/node.log")" != 10 ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || grep -q '^fake-node: asked starknet_getBlockWith' "$est/node.log"; then
    echo "FAIL: sepolia --estimate-only: not 10 estimates, or an add* method or a block read was asked:"
    grep '^fake-node: asked' "$est/node.log" | sort | uniq -c; fail=1
  elif leaks -q "$log" "$est/node.log" || grep -qi "$KEY_MARK" "$log" "$est/node.log"; then
    echo "FAIL: sepolia --estimate-only: a value reached a child's argv or environment"; fail=1
  else
    echo "ok: sepolia --estimate-only estimates 10 classes (spec on each line), asks no starknet_add* method, reads no block"
  fi
  # Funding (S-1c, S-1d): a real sepolia run estimates the classes the node does not have and needs 1.25 x their
  # estimates + the 20 STRK margin, or the 200 STRK floor when an estimate fails. Each case gives the deployer a balance
  # (FAKE_STRK_BALANCE), the classes the node has (`declared`) and maybe a failing estimate (`estimate_error`).
  real_run() { # <STRK balance, base units> -> output; the signer's log in $est/node.log
    printf '%s' "$1" >"$est/strk"
    : >"$est/node.log"
    env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$est/bin:$PATH" SHIM_LOG="$log" \
      FAKE_NODE=estimate SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/empty" \
      "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$root/scripts/deploy.sh" sepolia 2>&1
  }
  hexname() { printf '0x%s\n' "$(printf '%s' "$1" | od -An -tx1 | tr -d ' \n')"; }
  touch "$est/bin/hashes"
  # 1. Seven of ten classes declared, 150 STRK (below the old 200 STRK floor): three estimates, need 20.00 STRK, passes
  #    and goes on to declare.
  for name in Account Daily Tutorial MockUSDC PavedToken MockRouter Vault; do hexname "$name"; done >"$est/bin/declared"
  out="$(real_run 150000000000000000000)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"== funding: 3 class(es) to declare, estimated at 0.00 STRK; need 1.25 x 0.00 STRK + 20 STRK margin = 20.00 STRK"* ||
      "$out" != *"   deployer STRK balance 150.00 STRK: covers the need of 20.00 STRK"* || "$out" != *"== declare"* ||
      "$(grep -c '^   estimate [A-Za-z]*: declared already, nothing to send$' <<<"$out")" != 7 ||
      "$(grep -c '^fake-node: asked starknet_estimateFee$' "$est/node.log")" -lt 3 ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with 7 of 10 classes declared and 150 STRK: expected the funding check to pass and the declares to start, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia with 7 of 10 classes declared passes with 150 STRK (need 20.00 STRK: 3 estimates + margin)"
  fi
  # 2. Nothing declared, 10 STRK: short of the 20.00 STRK need, the run stops before its first declare; nothing sent.
  : >"$est/bin/declared"
  out="$(real_run 10000000000000000000)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"   deployer STRK balance 10.00 STRK: BELOW the need of 20.00 STRK"* ||
      "$out" != *"below the need above: fund it before deploying; nothing was sent"* || "$out" == *"== declare"* ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia short of the need: expected exit 1 before any declare and no add*, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia with 10 STRK, short of the 20.00 STRK need, stops before its first declare; nothing sent"
  fi
  # 2b. Two classes left at 30 STRK each, 110 STRK: the rule asks 1.25 x 60 + 20 = 95 STRK, but the second declare's
  #     bounds (2.3 x 30 after 1.25 x 30) + the margin ask 126.50 STRK: the run stops before sending.
  for name in Account Daily Tutorial MockUSDC PavedToken MockRouter Vault Economy; do hexname "$name"; done >"$est/bin/declared"
  printf '%s' 30000000000000000000 >"$est/fee"
  out="$(real_run 110000000000000000000)"; rc=$?
  rm -f "$est/fee"
  if [[ $rc -ne 1 || "$out" != *"need 1.25 x 60.00 STRK + 20 STRK margin = 95.00 STRK"* ||
      "$out" != *"after 1.25 x the declares before it, + the margin = 126.50 STRK"* ||
      "$out" != *"   deployer STRK balance 110.00 STRK: BELOW the need of 126.50 STRK"* || "$out" == *"== declare"* ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with two 30 STRK declares left and 110 STRK: expected the bounds' 126.50 STRK need and a stop, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia with two 30 STRK declares left needs 126.50 STRK for their bounds (not 95); 110 STRK stops before sending"
  fi
  : >"$est/bin/declared"
  # 2c. A declare whose answer is lost and whose receipt never comes (S-1d): deploy.sh shows the signer's `sending` line
  #     with the hash as it comes, the signer fails with "status unknown" after one add*, and deploy.sh stops there.
  touch "$est/add_lost"
  out="$(real_run 150000000000000000000)"; rc=$?
  rm -f "$est/add_lost"
  if [[ $rc -ne 1 || "$out" != *"deploy.sh: declare Account failed"* || "$out" == *"declare Daily"* ||
      "$out" != *"signer: sent, status unknown: 0x"*"; check it before any rerun"* ]] ||
      ! grep -q '^   signer: sending starknet_addDeclareTransaction, transaction 0x[0-9a-f]*$' <<<"$out" ||
      [[ "$(grep -c '^fake-node: asked starknet_addDeclareTransaction$' "$est/node.log")" != 1 ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with a lost declare answer: expected the streamed hash, 'status unknown', one add* and a stop, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out" | grep -v '^fake-node'; fail=1
  else
    echo "ok: sepolia with a lost declare answer shows the hash as it is sent, then stops after one add* ('status unknown')"
  fi
  # 2d. t-0182's refused declare (S-1e): the node gets one add*; the `sending` line shows once (streamed, not again in
  #     the failure), the failure tail is whole lines (no `failed: .json`) and ends with what the signer read.
  touch "$est/add_refused"
  out="$(real_run 150000000000000000000)"; rc=$?
  rm -f "$est/add_refused"
  if [[ $rc -ne 1 || "$out" != *"deploy.sh: declare Account failed"* || "$out" == *"declare Daily"* ]] ||
      [[ "$(grep -c 'signer: sending starknet_add' <<<"$out")" != 1 ]] ||
      ! grep -q '^   signer: sending starknet_addDeclareTransaction, transaction 0x[0-9a-f]*$' <<<"$out" ||
      ! grep -q '^deploy.sh: signer declare failed:$' <<<"$out" ||
      ! grep -q '^   signer: refused (-32601); no receipt for 0x[0-9a-f]* after 30 s; not landed (nonce unchanged at 0x0, class 0x[0-9a-f]* absent); check it before any rerun$' <<<"$out" ||
      [[ "$(grep -c '^fake-node: asked starknet_addDeclareTransaction$' "$est/node.log")" != 1 ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with a refused declare: expected one add*, one sending line, whole failure lines and 'not landed', got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia with a refused declare: one add*, its sending line shown once, the failure in whole lines ending 'not landed'"
  fi
  # 3. The estimates fail: the need falls back to the 200 STRK floor, and 150 STRK stops the run before sending.
  touch "$est/estimate_error"
  out="$(real_run 150000000000000000000)"; rc=$?
  rm -f "$est/estimate_error" "$est/strk" "$est/bin/hashes" "$est/bin/declared"
  if [[ $rc -ne 1 || "$out" != *"== funding: 10 estimate(s) could not be had: the need falls back to the 200 STRK floor"* ||
      "$out" != *"   deployer STRK balance 150.00 STRK: BELOW the need of 200.00 STRK"* || "$out" == *"== declare"* ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with failing estimates and 150 STRK: expected the 200 STRK floor and a stop before sending, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia whose estimates fail falls back to the 200 STRK floor; 150 STRK stops before its first declare"
  fi
  # A diagnostic option is checked by deploy.sh before anything runs, and only with --estimate-only.
  for bad in "--block-id pending" "--bounds x" "--frobnicate"; do
    # shellcheck disable=SC2086
    out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL "$here/deploy.sh" sepolia --estimate-only $bad 2>&1)"
    if [[ $? -ne 2 ]]; then echo "FAIL: sepolia --estimate-only $bad was not refused: $out"; fail=1
    else echo "ok: sepolia --estimate-only $bad refused"; fi
  done
  refuse 2 "unknown option '--validate' for 'sepolia'" sepolia --validate
  refuse 2 "unknown option '--unmerged' for 'sepolia --rehearse'" sepolia --rehearse --unmerged --estimate-only
else
  echo "skip: sepolia --estimate-only (needs Node 24 and npm ci in scripts/signer)"
fi

# failure_tail (S-1e, review of #302): at most 800 characters, indents, line breaks and the count line included; whole
# lines only, but for a last line too long alone.
eval "$(sed -n '/^failure_tail() {$/,/^}$/p' "$here/deploy.sh")"
tail_case() { # <label> <text> <expected first line, a pattern>
  local got
  got="$(failure_tail "$2")"
  if (( ${#got} + 1 > 800 )) || [[ "$(head -n1 <<<"$got")" != $3 ]]; then
    echo "FAIL: failure_tail $1: $(( ${#got} + 1 )) characters, first line '$(head -n1 <<<"$got")'"; fail=1
  else
    echo "ok: failure_tail $1 -> $(( ${#got} + 1 )) characters, whole lines"
  fi
}
tail_case "short text, all shown" "$(printf 'line %s\n' 1 2 3)" "   line 1"
tail_case "200 lines of 9" "$(for i in $(seq 1 200); do printf 'line %04d\n' "$i"; done)" "   (*earlier line(s) not shown)"
tail_case "two lines of 399, cut to one" "$(printf 'a%.0s' {1..399}; echo; printf 'b%.0s' {1..399})" "   (1 earlier line(s) not shown)"
tail_case "one line of 2000" "$(printf 'c%.0s' {1..2000})" "   ...c*"

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
