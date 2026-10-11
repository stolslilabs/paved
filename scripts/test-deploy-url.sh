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
at_node() { # <FAKE_NODE mode> <expected fragment>
  local out rc log="$shims/$1.log"
  : >"$log"
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$shims:$PATH" SHIM_LOG="$log" \
    FAKE_NODE="$1" "$ADDR" "$KEY" "$URL" "$here/deploy.sh" sepolia 2>&1)"
  rc=$?
  if [[ $rc -ne 1 || "$out" != *"$2"* ]] || leaks -q <<<"$out"; then
    echo "FAIL: sepolia at a $1 node expected exit 1 and '$2', no value, got $rc: $out"; fail=1
  elif leaks -q "$log" || ! grep -q '^curl: the URL came on stdin$' "$log" || grep -q '^\(node\|npm\) argv' "$log" ||
      { [[ "$1" == sepolia ]] && ! grep -q '^curl: the address came on stdin$' "$log"; }; then
    echo "FAIL: sepolia at a $1 node: a value reached a child's argv or environment, or something was signed:"
    leaks -n "$log" | sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI"; grep -n '^[a-z]* argv\|^curl: ' "$log"; fail=1
  else
    echo "ok: sepolia at a $1 node -> $2; no value in any output, argv or child environment"
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
  # estimate's overall fee (FAKE_ESTIMATE_FEE).
  printf '#!/usr/bin/env bash\n[[ "$1" == --version ]] && exec %q --version\n[[ -f %q ]] && export FAKE_STRK_BALANCE="$(cat %q)"\n[[ -f %q ]] && export FAKE_ESTIMATE_ERROR=1\n[[ -f %q ]] && export FAKE_ESTIMATE_FEE="$(cat %q)"\nexec %q --import %q "$@" 2>>%q\n' \
    "$real_node" "$est/strk" "$est/strk" "$est/estimate_error" "$est/fee" "$est/fee" "$real_node" "$here/signer/test/fixtures/fake-estimate-node.mjs" "$est/node.log" >"$est/bin/node"
  cp "$shims/curl" "$shims/addr_mark" "$est/bin/"
  chmod +x "$est/bin/"*
  : >"$est/node.log"
  log="$shims/estimate.log"
  : >"$log"
  out="$(env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$est/bin:$PATH" SHIM_LOG="$log" \
    FAKE_NODE=estimate SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/classes" \
    "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$here/deploy.sh" sepolia --estimate-only 2>&1)"
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
      FAKE_NODE=estimate SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/classes" \
      "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$here/deploy.sh" sepolia 2>&1
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
