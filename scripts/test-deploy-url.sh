#!/usr/bin/env bash
# The RPC_URL guard of deploy.sh names what it could not parse (it runs before anything else, so no
# node and no toolchain are needed), its network and sepolia variable checks refuse before anything is built or sent
# (S-1), a sepolia run failing at the node leaks no value to an output, an argv or a child's environment (P-40), and
# its getClass predicate rejects a malformed answer. The same holds on the --repoint path (R-1), the --d18 path
# (D-18c) and the --upgrade-challenge path (G6), and on the fresh path's --check-only and --out (F). Usage:
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
# D-25 B: the Faucet is refused on mainnet by name, in the message and in `deploy` (the contract's constructor refuses SN_MAIN too).
refuse 2 "the Faucet is refused there by name" mainnet
if grep -q '^    Faucet|MockRouter) \[\[ "\$NETWORK" == "devnet" || "\$NETWORK" == "sepolia" \]\]' "$here/deploy.sh"; then
  echo "ok: deploy.sh deploy() refuses the Faucet off devnet and sepolia, by name"
else
  echo "FAIL: deploy.sh deploy() does not refuse the Faucet by name off devnet and sepolia"; fail=1
fi
refuse 2 "unsupported network 'katana'" katana
refuse 2 "unsupported network ''"
refuse 2 "unknown option '--rehearse' for 'devnet'" devnet --rehearse
refuse 2 "unknown option '--unmerged' for 'sepolia'" sepolia --unmerged
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia
# The toolchain (the owner's Cairo rule): scarb and snforge come from the PATH, with no prepend, and a guard refuses
# before anything is built or sent when the shim exists and the tool resolves elsewhere. PAVED_SCARB_SHIM and
# PAVED_SNFORGE_SHIM point the guard at the stubs here (test hooks, not a way round the rule).
tc="$(mktemp -d)"
# Fake toolchains, each answering with its name. shim/: the shims (PATH); other/: a scarb and snforge elsewhere on the
# PATH; home/.asdf/installs/...: the asdf directories the scripts used to prepend (HOME and ASDF_DATA_DIR point there,
# so a script that prepends them is caught on a runner that has no asdf); scarb-only/: a scarb that is the shim, with no
# snforge beside it; cov/ and cov-bad/: a cairo-coverage directory, the second holding a scarb as well.
tc_stub() { # <label> <dir> <name>...: each executable answers "<label>-<name>"
  local label="$1" dir="$2" n; shift 2; mkdir -p "$dir"
  for n in "$@"; do printf '#!/bin/sh\necho "%s-%s"\n' "$label" "$n" >"$dir/$n"; chmod +x "$dir/$n"; done
}
tc_stub shim "$tc/shim" scarb snforge
tc_stub other "$tc/other" scarb snforge
tc_stub shim "$tc/scarb-only" scarb
tc_stub asdf "$tc/home/.asdf/installs/scarb/2.20.1/bin" scarb
tc_stub asdf "$tc/home/.asdf/installs/starknet-foundry/0.64.0/bin" snforge sncast
tc_stub cov "$tc/cov" cairo-coverage
tc_stub cov "$tc/cov-bad" cairo-coverage scarb
printf '#!/bin/sh\nexit 1\n' >"$tc/node"; chmod +x "$tc/node"
tc_out() { # <command...>: stdout and stderr of the run, then its exit code on the last line
  local out rc
  out="$(env -u SCARB_BIN_DIR -u SNFORGE_BIN_DIR -u SNCAST_BIN_DIR -u CAIRO_COVERAGE_BIN_DIR -u STARKNET_ACCOUNT_ADDRESS \
    -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL HOME="$tc/home" ASDF_DATA_DIR="$tc/home/.asdf" \
    RPC_URL=http://127.0.0.1:1 DEVNET_BIN="$tc/node" "$@" 2>&1)"; rc=$?
  printf '%s\nrc=%s' "$out" "$rc"
}
tc_expect() { # <label> <output> <exit> <must contain> [must not contain]
  local rc="${2##*rc=}"
  if [[ "$rc" != "$3" || "$2" != *"$4"* || ( -n "${5:-}" && "$2" == *"$5"* ) ]]; then
    echo "FAIL: $1: expected exit $3, '$4'${5:+ and no '$5'}, got: $2"; fail=1
  else
    echo "ok: $1"
  fi
}
# deploy.sh devnet against a port nobody listens on: past the guard it stops at "no node answers", before any build.
d() { tc_out env "$@" "$here/deploy.sh" devnet; }
m() { tc_out env "$@" "$here/measure.sh" check-setup; }  # versions, then a diff of two files: builds nothing
r() { tc_out env "$@" "$here/node/run-sample.sh" devnet; }  # versions, then DEVNET_BIN (a stub that exits) ends the run
G="the owner's rule is one Cairo run at a time through the shims (set"
# default, with the asdf directories present: scarb and snforge are the shims of the PATH, nothing is prepended
SH=(PATH="$tc/shim:$PATH" PAVED_SCARB_SHIM="$tc/shim/scarb" PAVED_SNFORGE_SHIM="$tc/shim/snforge")
tc_expect "deploy.sh, default: no resolution to a prepended asdf directory, sncast from the asdf default" \
  "$(d "${SH[@]}")" 1 "no node answers" "resolves to"
if tc_out env "${SH[@]}" HOME="$tc/home" ASDF_DATA_DIR="$tc/home/.asdf" RPC_URL=http://127.0.0.1:1 bash -x "$here/deploy.sh" devnet |
   grep -qE '(^|[^A-Z_])PATH=.*installs/(scarb|starknet-foundry)'; then
  echo "FAIL: deploy.sh puts an asdf toolchain directory on the PATH by default"; fail=1
else
  echo "ok: deploy.sh puts no asdf toolchain directory on the PATH by default"
fi
tc_expect "measure.sh, default: scarb and snforge are the shims of the PATH, not the asdf ones" \
  "$(m "${SH[@]}")" 0 "shim-snforge" "asdf"
tc_expect "run-sample.sh, default: scarb is the shim of the PATH, not the asdf one" \
  "$(r "${SH[@]}")" 1 "shim-scarb" "asdf-scarb"
# the shim exists, the tool resolves elsewhere: refused before the node is asked, before anything is built
tc_expect "deploy.sh refuses when the shim exists and scarb resolves elsewhere" \
  "$(d PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/shim/scarb")" 2 "scarb resolves to $tc/other/scarb, not the shim $tc/shim/scarb: $G SCARB_BIN_DIR=\$HOME/.local/bin, or fix PATH)" "no node answers"
tc_expect "deploy.sh refuses an override that is not the shim" \
  "$(d "${SH[@]}" SCARB_BIN_DIR="$tc/other")" 2 "scarb resolves to $tc/other/scarb"
tc_expect "deploy.sh refuses the asdf directory as an override" \
  "$(d "${SH[@]}" SCARB_BIN_DIR="$tc/home/.asdf/installs/scarb/2.20.1/bin")" 2 "scarb resolves to $tc/home/.asdf/installs/scarb/2.20.1/bin/scarb"
tc_expect "measure.sh refuses when scarb resolves away from the shim" \
  "$(m PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/shim/scarb" PAVED_SNFORGE_SHIM="$tc/shim/snforge")" 2 "scarb resolves to $tc/other/scarb, not the shim $tc/shim/scarb: $G SCARB_BIN_DIR=" "shim-snforge"
tc_expect "measure.sh refuses when snforge resolves away from the shim" \
  "$(m PATH="$tc/other:$PATH" SCARB_BIN_DIR="$tc/scarb-only" PAVED_SCARB_SHIM="$tc/scarb-only/scarb" PAVED_SNFORGE_SHIM="$tc/shim/snforge")" 2 "snforge resolves to $tc/other/snforge, not the shim $tc/shim/snforge: $G SNFORGE_BIN_DIR=" "setup.cairo"
tc_expect "run-sample.sh refuses when the shim exists and scarb resolves elsewhere" \
  "$(r PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/shim/scarb")" 2 "scarb resolves to $tc/other/scarb, not the shim" "== versions"
# no shim (the Mac, CI): a warning naming the tool found, then it goes on
tc_expect "deploy.sh warns and goes on when there is no shim" \
  "$(d PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/none/scarb")" 1 "warning: no shim at $tc/none/scarb, using scarb $tc/other/scarb" "resolves to"
tc_expect "measure.sh warns and goes on when there is no shim" \
  "$(m PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/none/scarb" PAVED_SNFORGE_SHIM="$tc/none/snforge")" 0 "warning: no shim at $tc/none/snforge, using snforge $tc/other/snforge" "resolves to"
tc_expect "run-sample.sh warns and goes on when there is no shim" \
  "$(r PATH="$tc/other:$PATH" PAVED_SCARB_SHIM="$tc/none/scarb")" 1 "warning: no shim at $tc/none/scarb, using scarb $tc/other/scarb" "resolves to"
# an explicit override that is the shim passes
tc_expect "deploy.sh accepts SCARB_BIN_DIR when it is the shim" \
  "$(d PATH="$tc/other:$PATH" SCARB_BIN_DIR="$tc/shim" PAVED_SCARB_SHIM="$tc/shim/scarb")" 1 "no node answers" "resolves to"
tc_expect "measure.sh accepts SCARB_BIN_DIR and SNFORGE_BIN_DIR when they are the shims" \
  "$(m PATH="$tc/other:$PATH" SCARB_BIN_DIR="$tc/shim" SNFORGE_BIN_DIR="$tc/shim" PAVED_SCARB_SHIM="$tc/shim/scarb" PAVED_SNFORGE_SHIM="$tc/shim/snforge")" 0 "shim-snforge" "resolves to"
tc_expect "run-sample.sh accepts SCARB_BIN_DIR when it is the shim" \
  "$(r PATH="$tc/other:$PATH" SCARB_BIN_DIR="$tc/shim" PAVED_SCARB_SHIM="$tc/shim/scarb")" 1 "shim-scarb" "resolves to"
# sncast found nowhere: a clear error, not a function that calls itself
NOSN=(PATH="$tc/shim:/usr/bin:/bin" PAVED_SCARB_SHIM="$tc/shim/scarb" SNCAST_BIN_DIR="$tc/none")
tc_expect "deploy.sh stops when sncast is found nowhere" \
  "$(d "${NOSN[@]}")" 2 "sncast not found: neither $tc/none/sncast nor on the PATH" "no node answers"
tc_expect "run-sample.sh stops when sncast is found nowhere" \
  "$(r "${NOSN[@]}")" 2 "sncast not found: neither $tc/none/sncast nor on the PATH" "== versions"
# measure.sh: the cairo-coverage directory goes first (the asdf shim of it wants a version set) and cannot shadow the
# shims; if it ever holds a scarb, the guard refuses
if tc_out env "${SH[@]}" CAIRO_COVERAGE_BIN_DIR="$tc/cov" bash -x "$here/measure.sh" check-setup | grep -qF "PATH=$tc/cov:"; then
  echo "ok: measure.sh puts the cairo-coverage directory first on the PATH"
else
  echo "FAIL: measure.sh does not put the cairo-coverage directory first on the PATH"; fail=1
fi
tc_expect "measure.sh passes with a cairo-coverage directory first" \
  "$(m "${SH[@]}" CAIRO_COVERAGE_BIN_DIR="$tc/cov")" 0 "shim-snforge" "resolves to"
tc_expect "measure.sh refuses a cairo-coverage directory that holds a scarb" \
  "$(m "${SH[@]}" CAIRO_COVERAGE_BIN_DIR="$tc/cov-bad")" 2 "scarb resolves to $tc/cov-bad/scarb" "setup.cairo"
rm -rf "$tc"

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
# The fresh path (F): --check-only and --out <file>, for sepolia and its rehearsal; nothing else.
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --check-only
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --check-only --out "$repoint_file.new"
refuse 2 "--out expects a file path in an existing directory" sepolia --out
refuse 2 "--out expects a file path in an existing directory" sepolia --out "$repoint_file.missing/x.json"
refuse 2 "--out expects a file path in an existing directory" sepolia --rehearse --out --check-only
refuse 2 "unknown option '--frobnicate' for 'sepolia --rehearse'" sepolia --rehearse --check-only --frobnicate
refuse 2 "unknown option '--check-only' for 'devnet'" devnet --check-only
out="$(RPC_URL=https://rpc.example.com/v1/KEY "$here/deploy.sh" sepolia --rehearse --repoint --deployment "$repoint_file" 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"host 'rpc.example.com'"* && "$out" != *KEY* ]]; then
  echo "ok: deploy.sh sepolia --rehearse --repoint refuses a remote node, its key unprinted"
else echo "FAIL: deploy.sh sepolia --rehearse --repoint with a remote RPC_URL: $out"; fail=1; fi
# --d18 (D-18c): the same options as --repoint.
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --d18
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --d18 --check-only
refuse 2 "unknown option '--d18' for 'devnet'" devnet --d18
refuse 2 "--deployment is for the rehearsal only: sepolia --d18 reads" sepolia --d18 --deployment "$repoint_file"
refuse 2 "sepolia --rehearse --d18 needs --deployment <file>" sepolia --rehearse --d18
refuse 2 "--deployment expects an existing deployment file" sepolia --rehearse --d18 --deployment "$repoint_file.missing"
refuse 2 "unknown option '--frobnicate' for 'sepolia --d18'" sepolia --d18 --frobnicate
refuse 2 "unknown option '--repoint' for 'sepolia --d18'" sepolia --d18 --repoint
out="$(RPC_URL=https://rpc.example.com/v1/KEY "$here/deploy.sh" sepolia --rehearse --d18 --deployment "$repoint_file" 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"host 'rpc.example.com'"* && "$out" != *KEY* ]]; then
  echo "ok: deploy.sh sepolia --rehearse --d18 refuses a remote node, its key unprinted"
else echo "FAIL: deploy.sh sepolia --rehearse --d18 with a remote RPC_URL: $out"; fail=1; fi
# --upgrade-challenge (G6): the same options as --d18, and --guardian with the keyword deployer only; an address given
# there is refused without being printed.
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --upgrade-challenge
refuse 2 "STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY STARKNET_RPC_URL" sepolia --upgrade-challenge --check-only --guardian deployer
refuse 2 "unknown option '--upgrade-challenge' for 'devnet'" devnet --upgrade-challenge
refuse 2 "--deployment is for the rehearsal only: sepolia --upgrade-challenge reads" sepolia --upgrade-challenge --deployment "$repoint_file"
refuse 2 "sepolia --rehearse --upgrade-challenge needs --deployment <file>" sepolia --rehearse --upgrade-challenge --guardian deployer
refuse 2 "unknown option '--frobnicate' for 'sepolia --upgrade-challenge'" sepolia --upgrade-challenge --frobnicate
refuse 2 "--guardian expects the keyword deployer" sepolia --upgrade-challenge --guardian
refuse 2 "--guardian is for sepolia --upgrade-challenge only" sepolia --d18 --guardian deployer
out="$(env -u STARKNET_ACCOUNT_ADDRESS "$here/deploy.sh" sepolia --upgrade-challenge --guardian 0xabcdef0123456789MARKER 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"--guardian expects the keyword deployer"* && "$out" != *MARKER* && "$out" != *abcdef0123456789* ]]; then
  echo "ok: deploy.sh sepolia --upgrade-challenge --guardian <address> is refused, the address unprinted"
else echo "FAIL: deploy.sh sepolia --upgrade-challenge --guardian <address>: $out"; fail=1; fi
out="$(RPC_URL=https://rpc.example.com/v1/KEY "$here/deploy.sh" sepolia --rehearse --upgrade-challenge --deployment "$repoint_file" 2>&1 >/dev/null)"
if [[ $? -eq 2 && "$out" == *"host 'rpc.example.com'"* && "$out" != *KEY* ]]; then
  echo "ok: deploy.sh sepolia --rehearse --upgrade-challenge refuses a remote node, its key unprinted"
else echo "FAIL: deploy.sh sepolia --rehearse --upgrade-challenge with a remote RPC_URL: $out"; fail=1; fi
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
# The fresh path's options (F): the same checks, the marker URL and address kept out of every output, argv and child.
at_node down "no node answers at \$STARKNET_RPC_URL" --check-only
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA" --check-only --out "$shims/fresh.json"
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --check-only
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --out "$shims/fresh.json"
if [[ -e "$shims/fresh.json" ]]; then echo "FAIL: a fresh run stopped at the node wrote its deployment file"; fail=1
else echo "ok: a fresh run stopped at the node writes no deployment file"; fi
# The --repoint path (R-1) shares those checks: the marker URL and address stay out of every output, argv and child
# environment there too, and nothing is signed (no node or npm call).
at_node down "no node answers at \$STARKNET_RPC_URL" --repoint
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA" --repoint
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --repoint
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --repoint --check-only
# The --d18 path (D-18c) too.
at_node down "no node answers at \$STARKNET_RPC_URL" --d18
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA" --d18
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --d18
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --d18 --check-only
# The --upgrade-challenge path (G6) too, --guardian deployer included.
at_node down "no node answers at \$STARKNET_RPC_URL" --upgrade-challenge --guardian deployer
at_node mainnet "the node's chain id 0x534e5f4d41494e is not SN_SEPOLIA" --upgrade-challenge --guardian deployer
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --upgrade-challenge
at_node sepolia "the deployer account \$STARKNET_ACCOUNT_ADDRESS is not deployed on \$STARKNET_RPC_URL" --upgrade-challenge --check-only --guardian deployer

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
  # --d18: the Lobby class Daily and Tutorial store (named params only, as deploy.sh sends them).
  *starknet_getStorageAt*'\"contract_address\"'*)
    body="{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":\"$(cat "$dir/lobby" 2>/dev/null || echo 0x1b)\"}" ;;
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
        body="{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"transaction_hash\":\"$h\",\"execution_status\":\"$st\",\"finality_status\":\"ACCEPTED_ON_L2\",\"events\":$(cat "$dir/events/$h" 2>/dev/null || echo '[]')}}"
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
  # not_owner (--d18): every owner() is another account.
  call:owner) r="[\"$STARKNET_ACCOUNT_ADDRESS\"]"; [[ -e "$dir/not_owner" ]] && r='["0x999"]' ;;
  call:addresses) r="[\"0x10\",\"0x20\",\"0x30\",\"$([[ -e "$dir/repointed" ]] && echo 0x90 || echo 0x80)\",\"0x50\"]" ;;
  # router (--d18): the address Economy.router() answers, when not the new MockRouter 0x90.
  call:router) [[ -e "$dir/repointed" ]] || { echo "signer: call failed: ENTRYPOINT_NOT_FOUND" >&2; exit 1; }
    r="[\"$(cat "$dir/router" 2>/dev/null || echo 0x90)\"]" ;;
  call:pool_key) r='["0x10","0x20","0x1","0x1","0x0"]' ;;
  # config (--d18): Economy.config() as a JSON list, when not the one before P-46 (slope 18,130).
  call:config) r="$(cat "$dir/config" 2>/dev/null || echo '["0x1b58","0x0","0x46d2","0x5","0xd3c21bcecceda1000000"]')" ;;
  # --d18's smoke on a complete upgrade: game 7 over with 2 tiles placed, and its builder (game, player, tile, plan).
  # (--upgrade-challenge: the id asked, the deployer its player.)
  # With `fresh_game`, the game is open with the starter alone until a build is sent (`built`: two tiles, still open).
  call:game) over=0x1 placed=0x2
    if [[ -e "$dir/fresh_game" ]]; then over=0x0; placed=0x1; [[ -e "$dir/built" ]] && placed=0x2; fi
    r="[\"$(printf '0x%x' "${cd[0]:-7}")\",\"$STARKNET_ACCOUNT_ADDRESS\",\"0x1\",\"0x0\",\"0x0\",\"$over\",\"0x3\",\"$placed\",\"0x0\",\"0x0\",\"0x0\",\"0x0\",\"0x26\",\"0x0\",\"0x0\",\"0x0\"]" ;;
  # --upgrade-challenge's smoke: Economy.quote(1) (its USDC to swap, low and high, at 2 and 3), and the build estimate.
  call:quote) r='["0x1","0x0","0x1312d0","0x0","0x0"]' ;;
  estimate:build) echo '{"ok":true}'; exit 0 ;;
  # --upgrade-challenge: guardian() is the deployer once set_guardian was sent (guardian_set), another address
  # (guardian_other), or none; spawn_paused() is true with `paused`.
  call:guardian) r='["0x0"]'; [[ -e "$dir/guardian_set" ]] && r="[\"$STARKNET_ACCOUNT_ADDRESS\"]"; [[ -e "$dir/guardian_other" ]] && r='["0x999"]' ;;
  call:spawn_paused) r='["0x0"]'; [[ -e "$dir/paused" ]] && r='["0x1"]' ;;
  # --upgrade-challenge (invoke_ok only): an invoke is accepted and logged with its calldata; upgrade moves the
  # contract's class on the node, set_guardian sets the guardian.
  invoke:*)
    [[ -e "$dir/invoke_ok" ]] || { echo "$cmd $fn" >>"$dir/sent.log"; echo "signer: the test sends nothing" >&2; exit 1; }
    n="$(($(cat "$dir/count" 2>/dev/null || echo 0) + 1))"; echo "$n" >"$dir/count"
    hash="$(printf '0x1a0%04x' "$n")"
    echo "signer: sending starknet_addInvokeTransaction, transaction $hash" >&2
    echo "invoke $fn ${cd[*]} $hash" >>"$dir/sent.log"
    echo "$hash SUCCEEDED" >>"$dir/receipts"
    case "$fn" in
      upgrade) printf '%s %s\n0x%064x %s\n' "$contract" "${cd[0]}" "$contract" "${cd[0]}" >>"$dir/classes" ;;
      set_guardian) touch "$dir/guardian_set" ;;
      # GameSpawned (keys: selector, game id, player) from Challenge: game 9.
      spawn) mkdir -p "$dir/events"; printf '[{"from_address":"%s","keys":["0x5a","0x9","0x1"],"data":[]}]' "$contract" >"$dir/events/$hash" ;;
      build) touch "$dir/built" ;;
    esac
    echo "{\"transaction_hash\":\"$hash\"}"
    exit 0 ;;
  call:builder) r="[\"$(printf '0x%x' "${cd[0]:-7}")\",\"$STARKNET_ACCOUNT_ADDRESS\",\"0x3\",\"0xe\"]" ;;
  call:pool) r='["0x10","0x20","0x1","0x1","0x0","0x0","0x0"]' ;;
  call:reserves)
    # PAVED (0x10) is token0: 800,000 PAVED and 10,000 USDC, the old pool's size.
    r='["0xa968163f0a57b400000","0x0","0x2540be400","0x0"]'
    if [[ "$contract" == 0x90 && -e "$dir/seeded" ]]; then r="$(cat "$dir/seeded")"
    elif [[ "$contract" == 0x90 && -e "$dir/unseeded" ]]; then r='["0x0","0x0","0x0","0x0"]'; fi ;;
  call:balance_of) r="$big"; [[ "$contract" == 0x4718f5a* && -e "$dir/poor" ]] && r='["0x0","0x0"]'
    [[ "$contract" == 0x20 && -e "$dir/usdc_low" ]] && r='["0x0","0x0"]' ;;
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
      # The verdict the signer ends with: `not landed` (empty file) or, to keep the hash, another one.
      echo "multicall $fns $hash" >>"$dir/refused.log"
      case "$(cat "$dir/send_refused")" in
        seen) echo "signer: refused (-32601); no receipt for $hash after 30 s; seen by the node with status RECEIVED; check it before any rerun" >&2 ;;
        unknown) echo "signer: sent, status unknown: $hash; check it before any rerun" >&2 ;;
        other) echo "signer: refused (-32601); no receipt for 0x0be5 after 30 s; not landed (nonce unchanged at 0x5); check it before any rerun" >&2 ;;
        quoted) echo "signer: refused (55): node message: no receipt for $hash after 30 s; not landed (x); check it before any rerun" >&2 ;;
        *) echo "signer: refused (-32601); no receipt for $hash after 30 s; not landed (nonce unchanged at 0x5); check it before any rerun" >&2 ;;
      esac
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
# MockRouter and Economy for --repoint; Account, Daily, Tutorial and Lobby for --d18; Challenge for --upgrade-challenge.
for name in MockRouter Economy Account Daily Tutorial Lobby Challenge; do
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
  rm -f "$rp/bin/"{leak,quote_fails,send_refused,unseeded,seeded,repointed,poor,receipts,count,refused.log,lock_dir,lobby,router,not_owner,config,invoke_ok,guardian_set,guardian_other,paused,fresh_game,built,usdc_low}
  rm -rf "$rp/bin/events"
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
    PAVED_SCARB_SHIM="$rp/bin/scarb" SCARB_BIN_DIR="$rp/bin" SNCAST_BIN_DIR="$rp/bin" "$ADDR" "$KEY" "$URL" "$rp/root/scripts/deploy.sh" sepolia "$@" 2>&1
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

# The keeping side (loop 3): a failed seed whose verdict is not the signer's own `not landed` for that hash keeps its
# hash recorded: the node saw it, its status is unknown, the verdict names another hash, or the words come quoted
# inside another message.
for verdict in seen unknown other quoted; do
  rp_case "$recorded_router"
  touch "$rp/bin/unseeded" "$rp/bin/quote_fails"
  printf '%s' "$verdict" >"$rp/bin/send_refused"
  out="$(rp_run --repoint)"; rc=$?
  if [[ $rc -ne 1 || "$(rp_get_test seed.tx)" != 0x5eed0001 || "$out" == *"cleared, so a rerun sends it again"* ||
      -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
    rp_fail "a seed that failed with the verdict '$verdict': expected exit 1 and its hash kept, got $rc (seed.tx '$(rp_get_test seed.tx)')" "$out"
  else
    echo "ok: sepolia --repoint: a seed that failed with the verdict '$verdict' keeps its hash recorded (0x5eed0001)"
  fi
done

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

# --d18 past the node checks (D-18c), on the same fake node and signer. The deployment is repointed (its MockRouter 0x90
# is the one its `repoint` key records) unless a case says otherwise; Daily (0x50), Tutorial (0x60) and Account (0x40)
# are of the file's classes, they run the file's Lobby (0x1b), and the D-18 classes (their names in hex, as the sncast
# shim computes them) are declared on the node.
d18_repointed='{"MockRouter": {"address": "0x90"}, "multicall_tx": "0x7e90"}'
d18_case() { # [repoint record, default $d18_repointed; empty for none]
  if [[ $# -gt 0 ]]; then rp_case "$1"; else rp_case "$d18_repointed"; fi
  python3 -I - "$rp_json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["contracts"]["MockRouter"]["address"] = "0x90"
d["classes"] = {"Lobby": "0x1b"}
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
  printf '0x40 0xa\n0x50 0xd\n0x60 0xb\n' >>"$rp/bin/classes"
  for name in Daily Tutorial Account Lobby; do hexname "$name"; done >>"$rp/bin/declared"
  touch "$rp/bin/repointed"
}
d18_fail() { # <label> <output>
  echo "FAIL: sepolia --d18, $1:"; sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$2"
  echo "sent: $(cat "$rp/bin/sent.log")"; fail=1
}
d18_get_test() { python3 -I -c 'import json,sys;n=json.load(open(sys.argv[1])).get("d18",{})
for k in sys.argv[2].split("."): n=n.get(k,{}) if isinstance(n,dict) else {}
print(n if isinstance(n,str) else "")' "$rp_json" "$1"; }

# leak: the first send of d18_state fails, printing the three values.
d18_case
touch "$rp/bin/leak"
out="$(rp_run --d18)"; rc=$?
names="$(sed -n '/^node env:$/,/^node argv/p' "$rp/bin/signer.log" | sed '1d;/^node argv/d' | cut -d= -f1 | grep -v '^_$\|^PWD$\|^SHLVL$\|^OLDPWD$' | sort -u | tr '\n' ' ')"
if [[ $rc -ne 1 || "$out" != *"== d18: state (read-only)"* ]] || leaks -q <<<"$out"; then
  d18_fail "a failing send in d18_state: expected exit 1 in d18_state, no value, got $rc" "$out"
elif grep '^node argv' "$rp/bin/signer.log" | leaks -q || leaks -q "$rp/curl.log" || ! grep -q '^curl: the URL came on stdin$' "$rp/curl.log"; then
  echo "FAIL: sepolia --d18: a value reached the signer's argv or curl's argv or environment"; fail=1
elif [[ "$names" != "$want" ]]; then
  echo "FAIL: sepolia --d18: the signer's environment is not the allowlist: $names"; fail=1
else
  echo "ok: sepolia --d18 reaches d18_state; a failing send there leaks no value; the signer's argv holds none; its environment is: $names"
fi

# The order: before R-1's repoint (no `repoint` record), or with a record whose Economy has no router() yet, the tool
# refuses before anything is estimated or sent, --check-only included, and writes nothing.
for mode in --check-only ""; do
  for record in '' "$d18_repointed"; do
    d18_case "$record"
    [[ -n "$record" ]] && rm -f "$rp/bin/repointed"
    before="$(cat "$rp_json")"
    # shellcheck disable=SC2086
    out="$(rp_run --d18 $mode)"; rc=$?
    if [[ -z "$record" ]]; then want_msg="R-1's repoint is not complete"; else want_msg="Economy.router() does not answer"; fi
    if [[ $rc -ne 1 || "$out" != *"$want_msg"*"D-18c runs after R-1 part B; nothing was sent"* || "$out" == *"every check passed"* ||
        "$out" == *"== funding"* || -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] || leaks -q <<<"$out"; then
      d18_fail "${mode:-full run} ${record:+with a repoint record but no router() }before the repoint: expected a refusal, nothing sent, got $rc" "$out"
    else
      echo "ok: sepolia --d18 ${mode:-(full run)} refuses before the repoint (${want_msg}), nothing sent, the file unchanged"
    fi
  done
done

# --check-only past every check: the classes, the Lobby class (named-params storage read), the config; it lists the six
# calls of the multicall and ends "every check passed; nothing was sent", nothing sent, the file unchanged.
d18_case
before="$(cat "$rp_json")"
out="$(rp_run --d18 --check-only)"; rc=$?
if [[ $rc -ne 0 || "$out" != *"== d18: check only: every check passed; nothing was sent" ||
    "$out" != *"   daily: runs the Lobby 0x1b (not set)"* ||
    "$out" != *"Economy.config(): burn_bps 7000, sigma_bps 0, slope_bps 18130, cap 5, target 1000000000000000000000000"* ||
    "$(grep -c '^     \(Daily\|Tutorial\|Account\)\.upgrade \|^     \(Daily\|Tutorial\)\.set_lobby_class \|^     Economy\.configure 0x1b58 0x0 12220 0x5 ' <<<"$out")" != 6 ||
    -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] || leaks -q <<<"$out"; then
  d18_fail "--check-only: expected exit 0, the six calls listed, nothing sent, the file unchanged, got $rc" "$out"
else
  echo "ok: sepolia --d18 --check-only passes every check, lists the six calls of the multicall, sends nothing, writes nothing"
fi

# A full run whose multicall the signer finds `not landed`: the previous classes and config are recorded first, the hash
# under d18.multicall_tx (not repoint.*) as it is sent, then cleared; the repoint record is untouched.
d18_case
touch "$rp/bin/send_refused"
out="$(rp_run --d18)"; rc=$?
refused="$(cut -d' ' -f2- "$rp/bin/refused.log" 2>/dev/null)"
repoint_after="$(python3 -I -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))["repoint"],sort_keys=True))' "$rp_json")"
if [[ $rc -ne 1 || "$out" != *"not landed: d18.multicall_tx cleared, so a rerun sends it again"* || -n "$(d18_get_test multicall_tx)" ||
    "$refused" != "upgrade upgrade upgrade set_lobby_class set_lobby_class configure 0x5eed0001" ||
    "$(d18_get_test previous.Daily.class_hash)" != "0x$(printf '%064x' 0xd)" || "$(d18_get_test previous.Lobby.class_hash)" != "0x$(printf '%064x' 0x1b)" ||
    "$(d18_get_test previous.config)" != "0x1b58 0x0 0x46d2 0x5 0xd3c21bcecceda1000000" ||
    "$repoint_after" != '{"MockRouter": {"address": "0x90"}, "multicall_tx": "0x7e90"}' || -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  d18_fail "a multicall refused 'not landed': expected exit 1, d18.multicall_tx cleared, the previous state recorded, got $rc (refused: $refused)" "$out"
else
  echo "ok: sepolia --d18: one multicall of the six calls; refused 'not landed', its d18.multicall_tx is cleared; the previous classes and config are recorded; repoint untouched"
fi

# The order guard (review of #329): Economy.router() answers an address other than the file's MockRouter: refused before
# anything is estimated or sent, --check-only included, the file unchanged.
for mode in --check-only ""; do
  d18_case
  printf '0x91' >"$rp/bin/router"
  before="$(cat "$rp_json")"
  # shellcheck disable=SC2086
  out="$(rp_run --d18 $mode)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"Economy.router() is 0x91, not the file's MockRouter 0x90: R-1's repoint has not landed; D-18c runs after R-1 part B; nothing was sent"* ||
      "$out" == *"== funding"* || -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] || leaks -q <<<"$out"; then
    d18_fail "${mode:-full run} with Economy.router() another router: expected a refusal, nothing sent, the file unchanged, got $rc" "$out"
  else
    echo "ok: sepolia --d18 ${mode:-(full run)} refuses when Economy.router() is not the file's MockRouter, nothing sent, the file unchanged"
  fi
done

# Checks that refuse before anything is sent (review of #329), each a full run, the file unchanged: the deployer is not
# owner(); a class that is neither the file's nor the D-18 one; a config that differs from the recorded previous one by
# more than the slope.
d18_refuses() { # <label> <expected fragment>
  local before out rc
  before="$(cat "$rp_json")"
  out="$(rp_run --d18)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"$2"* || "$out" == *"== funding"* || -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] ||
      leaks -q <<<"$out"; then
    d18_fail "$1: expected '$2', nothing sent, the file unchanged, got $rc" "$out"
  else
    echo "ok: sepolia --d18 refuses $1 (exit $rc), nothing sent, the file unchanged"
  fi
}
d18_case
touch "$rp/bin/not_owner"
d18_refuses "a deployer that is not owner()" "the deployer \$STARKNET_ACCOUNT_ADDRESS is not Daily.owner()"
d18_case
printf '0x50 0x777\n' >>"$rp/bin/classes"
d18_refuses "a Daily class that is neither the file's nor the D-18 one" "daily's class on the node is 0x777: neither the file's 0xd nor the D-18 class"
d18_case "$d18_repointed"
python3 -I - "$rp_json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["d18"] = {"previous": {"Daily": {"class_hash": "0xd"}, "Tutorial": {"class_hash": "0xb"}, "Account": {"class_hash": "0xa"},
                         "Lobby": {"class_hash": "0x1b"}, "config": "0x1388 0x0 0x46d2 0x5 0xd3c21bcecceda1000000"}}
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
d18_refuses "a config that differs from the recorded one by more than the slope" "differs from the config recorded before the upgrade (burn_bps 5000"

# A recorded declare, or a recorded multicall, with no receipt is awaited, not sent again: the wait (REPOINT_WAIT_S=0
# here) ends the run, the hash kept, nothing sent.
for key in declare.Account multicall_tx; do
  d18_case
  python3 -I - "$rp_json" "$key" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
node = d.setdefault("d18", {})
*parents, leaf = sys.argv[2].split(".")
for p in parents:
    node = node.setdefault(p, {})
node[leaf] = "0xdead2"
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
  out="$(REPOINT_WAIT_S=0 rp_run --d18)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"$key 0xdead2 (recorded) has no receipt after 0 s (node: UNKNOWN): check it before any rerun"* ||
      "$(d18_get_test "$key")" != 0xdead2 || -s "$rp/bin/sent.log" || -s "$rp/bin/refused.log" ]] || leaks -q <<<"$out"; then
    d18_fail "a recorded $key with no receipt: expected exit 1, the hash kept, nothing sent, got $rc" "$out"
  else
    echo "ok: sepolia --d18: a recorded $key with no receipt stops the run (exit $rc), its hash kept, nothing sent"
  fi
done

# A complete upgrade and no STRK (review of #329): every class D-18, both Lobby classes D-18, slope 12,220, the smoke's
# game recorded over, every recorded transaction landed. The funding check does not refuse, the smoke reads back, nothing
# is sent (exit 0).
d18_case
for a in "0x50 Daily" "0x60 Tutorial" "0x40 Account"; do
  set -- $a; printf '%s %s\n0x%064x %s\n' "$1" "$(hexname "$2")" "$1" "$(hexname "$2")"
done >>"$rp/bin/classes"
hexname Lobby >"$rp/bin/lobby"
printf '%s' '["0x1b58","0x0","0x2fbc","0x5","0xd3c21bcecceda1000000"]' >"$rp/bin/config"
touch "$rp/bin/poor"
python3 -I - "$rp_json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["d18"] = {"previous": {"Daily": {"class_hash": "0xd"}, "Tutorial": {"class_hash": "0xb"}, "Account": {"class_hash": "0xa"},
                         "Lobby": {"class_hash": "0x1b"}, "config": "0x1b58 0x0 0x46d2 0x5 0xd3c21bcecceda1000000"},
            "multicall_tx": "0x5eed00aa", "smoke": {"game_id": "7", "spawn_tx": "0x5eed00ab", "build_tx": "0x5eed00ac",
                                                    "surrender_tx": "0x5eed00ad"}}
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
printf '0x5eed00aa SUCCEEDED\n0x5eed00ab SUCCEEDED\n0x5eed00ac SUCCEEDED\n0x5eed00ad SUCCEEDED\n' >"$rp/bin/receipts"
out="$(rp_run --d18)"; rc=$?
if [[ $rc -ne 0 || "$out" != *"complete: upgraded, Lobby and slope set, smoke recorded; nothing is left to send"* ||
    "$out" != *"deployer STRK balance 0.00 STRK: BELOW the need of 20.00 STRK"* ||
    "$out" != *"--d18: nothing is left to send, so the need does not apply"* ||
    "$out" != *"upgraded, Lobby and slope set already, tx 0x5eed00aa"* || "$out" != *"build done already, tx 0x5eed00ac; not sent again"* ||
    "$out" != *"builder(): game_id 7, player_id the deployer, tile_id 3, plan 14"* || "$out" != *"== d18: smoke ok"* ||
    -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  d18_fail "a complete upgrade with no STRK: expected exit 0, the funding need waived, smoke ok, nothing sent, got $rc" "$out"
else
  echo "ok: sepolia --d18: a complete upgrade with 0 STRK passes the funding check (nothing left to send), smoke ok, nothing sent"
fi

# --upgrade-challenge past the node checks (G6), on the same fake node and signer. The deployment is F's shape: Challenge
# (0xc0) of its old class 0xc1a, and Setup, Collection, Economy, PavedToken, Vault, Faucet and MockRouter of the classes
# the build computes (their names in hex, as the sncast shim does), so only Challenge's differs; the new Challenge class
# is declared on the node; F's smoke game is game 1. An optional `upgrade_g1g4` record, as JSON.
uc_case() { # [upgrade_g1g4 record]
  rp_case
  python3 -I - "$rp_json" "${1:-}" <<'PY'
import json, sys
hexname = lambda n: "0x" + n.encode().hex()
c = lambda a, h: {"address": a, "class_hash": h}
d = {"network": "sepolia", "chain_id": "0x534e5f5345504f4c4941", "rpc_url": "$STARKNET_RPC_URL", "deployed_block": 1,
     "token": c("0x20", hexname("Faucet")),
     "contracts": {"Challenge": c("0xc0", "0xc1a"), "Setup": c("0x51", hexname("Setup")),
                   "Collection": c("0x70", hexname("Collection")), "Economy": c("0xe0", hexname("Economy")),
                   "PavedToken": c("0x10", hexname("PavedToken")), "Vault": c("0x30", hexname("Vault")),
                   "Faucet": c("0x20", hexname("Faucet")), "MockRouter": c("0x80", hexname("MockRouter"))},
     "fresh": {"smoke": {"game_id": "1"}, "complete": "yes"}}
if sys.argv[2]:
    d["upgrade_g1g4"] = json.loads(sys.argv[2])
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
  local a n
  : >"$rp/bin/classes"
  for a in "0xc0 0xc1a" "0x51 $(hexname Setup)" "0x70 $(hexname Collection)" "0xe0 $(hexname Economy)" \
      "0x10 $(hexname PavedToken)" "0x30 $(hexname Vault)" "0x20 $(hexname Faucet)" "0x80 $(hexname MockRouter)"; do
    set -- $a; printf '%s %s\n0x%064x %s\n' "$1" "$2" "$1" "$2"
  done >>"$rp/bin/classes"
  for n in Challenge Setup Collection Economy PavedToken Vault Faucet MockRouter; do hexname "$n"; done >"$rp/bin/declared"
  touch "$rp/bin/invoke_ok"
}
uc_upgraded() { printf '0xc0 %s\n0x%064x %s\n' "$(hexname Challenge)" 0xc0 "$(hexname Challenge)" >>"$rp/bin/classes"; }
uc_fail() { # <label> <output>
  echo "FAIL: sepolia --upgrade-challenge, $1:"; sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$2"
  echo "sent: $(cat "$rp/bin/sent.log")"; fail=1
}
uc_get_test() { python3 -I -c 'import json,sys;n=json.load(open(sys.argv[1])).get("upgrade_g1g4",{})
for k in sys.argv[2].split("."): n=n.get(k,{}) if isinstance(n,dict) else {}
print(n if isinstance(n,str) else "")' "$rp_json" "$1"; }
UC_NEW="$(hexname Challenge)"

# leak: the first send of uc_state fails, printing the three values.
uc_case
touch "$rp/bin/leak"
out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
names="$(sed -n '/^node env:$/,/^node argv/p' "$rp/bin/signer.log" | sed '1d;/^node argv/d' | cut -d= -f1 | grep -v '^_$\|^PWD$\|^SHLVL$\|^OLDPWD$' | sort -u | tr '\n' ' ')"
if [[ $rc -ne 1 || "$out" != *"== upgrade-challenge: state (read-only)"* ]] || leaks -q <<<"$out"; then
  uc_fail "a failing send in uc_state: expected exit 1 in uc_state, no value, got $rc" "$out"
elif grep '^node argv' "$rp/bin/signer.log" | leaks -q || leaks -q "$rp/curl.log" || ! grep -q '^curl: the URL came on stdin$' "$rp/curl.log"; then
  echo "FAIL: sepolia --upgrade-challenge: a value reached the signer's argv or curl's argv or environment"; fail=1
elif [[ "$names" != "$want" ]]; then
  echo "FAIL: sepolia --upgrade-challenge: the signer's environment is not the allowlist: $names"; fail=1
else
  echo "ok: sepolia --upgrade-challenge reaches uc_state; a failing send there leaks no value; the signer's argv holds none; its environment is: $names"
fi

# --check-only past every check: every other class unchanged, the owner, F's game read back; it lists the upgrade and
# set_guardian with the address as its variable's name, and ends "every check passed; nothing was sent".
uc_case
before="$(cat "$rp_json")"
out="$(rp_run --upgrade-challenge --check-only --guardian deployer)"; rc=$?
if [[ $rc -ne 0 || "$out" != *"== upgrade-challenge: check only: every check passed; nothing was sent" ||
    "$out" != *"Setup Collection Economy PavedToken Vault Faucet MockRouter: unchanged (the build's class is the file's and the node's)"* ||
    "$out" != *"Challenge.owner() is the deployer"* || "$out" != *"Challenge: class 0xc1a (not upgraded)"* ||
    "$out" != *"game 1 (F's smoke game, spawned before the upgrade): readable, the deployer's"* ||
    "$out" != *"Challenge.upgrade($UC_NEW): a run would send it"* ||
    "$out" != *'Challenge.set_guardian($STARKNET_ACCOUNT_ADDRESS): a run would send it'* ||
    -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] || leaks -q <<<"$out"; then
  uc_fail "--check-only: expected exit 0, the upgrade and set_guardian listed, nothing sent, the file unchanged, got $rc" "$out"
else
  echo "ok: sepolia --upgrade-challenge --check-only passes every check, lists the upgrade and set_guardian, sends nothing, writes nothing"
fi

# A full run with --guardian deployer from nothing recorded: the upgrade, then set_guardian with the deployer as
# `@account` (in no argv), never printed; then the smoke's own sends: the faucet mint (the deployer holds no USDC), the
# approve, the spawn with the client's min_out (Economy's quote_swap of quote(1), less 1 %: 5 -> 4), game 9 read from
# the spawn's receipt, and the first build the node estimates. The record says `guardian: deployer` and holds no
# address; the file gets the new class and keeps every other field.
uc_sent() { sed 's/ 0x1a0[0-9a-f]*$//' "$rp/bin/sent.log" | tr '\n' ';'; }
uc_case
touch "$rp/bin/usdc_low" "$rp/bin/fresh_game"
before="$(python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));d["contracts"]["Challenge"].pop("class_hash");print(json.dumps(d,sort_keys=True))' "$rp_json")"
out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
after="$(python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));d["contracts"]["Challenge"].pop("class_hash");d.pop("upgrade_g1g4");print(json.dumps(d,sort_keys=True))' "$rp_json")"
sent="$(uc_sent)"
want="invoke upgrade $UC_NEW;invoke set_guardian @account;invoke mint @account 2000000 0;invoke approve 0xc0 2000000 0;invoke spawn 1 0 4 0;invoke build 9 1 2147483647 2147483648;"
if [[ $rc -ne 0 || "$sent" != "$want" ||
    "$out" != *'Challenge.set_guardian($STARKNET_ACCOUNT_ADDRESS): the deployer is the guardian'* ||
    "$out" != *"Challenge.guardian(): the deployer"* || "$out" != *"Challenge.spawn_paused(): false"* ||
    "$out" != *"paid game 9 at stake 1 (min_out 4)"* || "$out" != *"build(game 9, orientation 1, x 2147483647, y 2147483648)"* ||
    "$out" != *"== upgrade-challenge: smoke ok"* || "$(uc_get_test guardian)" != deployer ||
    "$(uc_get_test upgrade_tx)" != 0x1a00001 || "$(uc_get_test guardian_tx)" != 0x1a00002 ||
    "$(uc_get_test smoke.spawn_tx)" != 0x1a00005 || "$(uc_get_test smoke.game_id)" != 9 ||
    "$(uc_get_test smoke.build_tx)" != 0x1a00006 || "$(uc_get_test complete)" != yes ||
    "$(uc_get_test previous.Challenge.class_hash)" != "0x$(printf '%064x' 0xc1a)" ||
    "$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["contracts"]["Challenge"]["class_hash"])' "$rp_json")" != "$(python3 -I -c 'import sys;print("0x%064x" % int(sys.argv[1], 16))' "$UC_NEW")" ||
    "$after" != "$before" ]] || leaks -q <<<"$out" || leaks -q "$rp_json" || grep '^node argv' "$rp/bin/signer.log" | leaks -q; then
  uc_fail "a full run with --guardian deployer: expected exit 0, upgrade, set_guardian(@account), mint, approve, spawn, build, the record and the file, no address anywhere, got $rc (sent: $sent)" "$out"
else
  echo "ok: sepolia --upgrade-challenge --guardian deployer: upgrade, set_guardian(@account), then the smoke's mint, approve, spawn (min_out 4, game 9 from its receipt) and build; the guardian compared, never printed; the record and the file written, every other field kept"
fi
# Its rerun: the record is complete, so nothing is sent and the smoke does not run.
out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
if [[ $rc -ne 0 || "$out" != *"complete: nothing is sent; the owner, the guardian, the pause and the other classes are live state since, not read"* ||
    "$out" != *"== upgrade-challenge: the record is complete; nothing was sent"* || "$out" == *"== upgrade-challenge: smoke"* ||
    -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  uc_fail "a rerun after completion: expected exit 0, complete, nothing sent, no smoke, got $rc" "$out"
else
  echo "ok: sepolia --upgrade-challenge: a rerun after completion sends nothing and runs no smoke"
fi

# A complete record whose live state moved since (review of #367, finding 1): the guardian cleared, spawn paused, the
# owner transferred, no STRK. The rerun reads none of them, sends nothing (no set_guardian) and exits 0; --check-only
# too, ending "every check passed; nothing was sent".
uc_complete_json="{\"previous\": {\"Challenge\": {\"class_hash\": \"0xc1a\"}}, \"Challenge\": {\"class_hash\": \"$UC_NEW\"}, \"declare_tx\": \"0x5eed00a0\", \"upgrade_tx\": \"0x5eed00a1\", \"guardian_tx\": \"0x5eed00a2\", \"guardian\": \"deployer\", \"smoke\": {\"game_id\": \"7\", \"spawn_tx\": \"0x5eed00ab\", \"build_tx\": \"0x5eed00ac\"}, \"complete\": \"yes\"}"
uc_receipts() { printf '0x5eed00a0 SUCCEEDED\n0x5eed00a1 SUCCEEDED\n0x5eed00a2 SUCCEEDED\n0x5eed00ab SUCCEEDED\n0x5eed00ac SUCCEEDED\n' >"$rp/bin/receipts"; }
for mode in "" --check-only; do
  uc_case "$uc_complete_json"; uc_upgraded; uc_receipts
  touch "$rp/bin/paused" "$rp/bin/not_owner" "$rp/bin/poor"
  before="$(cat "$rp_json")"
  # shellcheck disable=SC2086
  out="$(rp_run --upgrade-challenge --guardian deployer $mode)"; rc=$?
  if [[ $rc -ne 0 || "$out" != *"every recorded transaction SUCCEEDED"* || "$out" != *"complete: nothing is sent"* ||
      "$out" == *"owner()"* || "$out" == *"guardian():"* || "$out" == *"spawn_paused"* ||
      "$out" != *"--upgrade-challenge: nothing is left to send, so the need does not apply"* ||
      ( -n "$mode" && "$out" != *"== upgrade-challenge: check only: every check passed; nothing was sent" ) ||
      -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] || leaks -q <<<"$out"; then
    uc_fail "${mode:-a run} on a complete record with the guardian cleared, spawn paused, the owner moved and no STRK: expected exit 0, nothing read of them, nothing sent, got $rc" "$out"
  else
    echo "ok: sepolia --upgrade-challenge ${mode:-(run)} on a complete record with the guardian cleared, spawn paused and the owner moved: exit 0, none of them read, nothing sent, the file unchanged"
  fi
done
# A complete record whose Challenge is not on the recorded class: refused, nothing sent.
uc_case "$uc_complete_json"; uc_receipts
out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
if [[ $rc -ne 1 || "$out" != *"the record is complete, but Challenge's class on the node is 0xc1a, not the recorded $UC_NEW: check it; nothing was sent"* ||
    -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  uc_fail "a complete record with Challenge on another class: expected exit 1, nothing sent, got $rc" "$out"
else
  echo "ok: sepolia --upgrade-challenge refuses a complete record whose Challenge is not on the recorded class, nothing sent"
fi

# A resume after the upgrade, with a smoke spawn recorded (its receipt holds game 9): set_guardian is sent, the spawn is
# not sent again (its game read from the receipt), and the build follows.
uc_case '{"previous": {"Challenge": {"class_hash": "0xc1a"}}, "upgrade_tx": "0x5eed00a1", "smoke": {"spawn_tx": "0x5eed00ab"}}'
uc_upgraded; touch "$rp/bin/fresh_game"
printf '0x5eed00a1 SUCCEEDED\n0x5eed00ab SUCCEEDED\n' >"$rp/bin/receipts"
mkdir -p "$rp/bin/events"; printf '[{"from_address":"0xc0","keys":["0x5a","0x9","0x1"],"data":[]}]' >"$rp/bin/events/0x5eed00ab"
out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
sent="$(uc_sent)"
if [[ $rc -ne 0 || "$sent" != "invoke set_guardian @account;invoke build 9 1 2147483647 2147483648;" ||
    "$out" != *"upgrade_tx 0x5eed00a1 (recorded): landed"* || "$out" != *"smoke.spawn_tx 0x5eed00ab (recorded): landed"* ||
    "$out" != *"paid spawn done already: game 9, tx 0x5eed00ab; not sent again"* || "$out" != *"== upgrade-challenge: smoke ok"* ||
    "$(uc_get_test smoke.game_id)" != 9 || "$(uc_get_test complete)" != yes ]] || leaks -q <<<"$out"; then
  uc_fail "a resume after the upgrade with a recorded spawn: expected set_guardian then the build only, game 9 from the receipt, got $rc (sent: $sent)" "$out"
else
  echo "ok: sepolia --upgrade-challenge resumes after the upgrade: set_guardian, the recorded spawn read from its receipt (game 9, not sent again), then the build"
fi

# Checks that refuse before anything is sent, each a full run with --guardian deployer, the file unchanged.
uc_refuses() { # <label> <expected fragment>
  local before out rc
  before="$(cat "$rp_json")"
  out="$(rp_run --upgrade-challenge --guardian deployer)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"$2"* || "$out" == *"== funding"* || -s "$rp/bin/sent.log" || "$(cat "$rp_json")" != "$before" ]] ||
      leaks -q <<<"$out"; then
    uc_fail "$1: expected '$2', nothing sent, the file unchanged, got $rc" "$out"
  else
    echo "ok: sepolia --upgrade-challenge refuses $1 (exit $rc), nothing sent, the file unchanged"
  fi
}
uc_case; touch "$rp/bin/not_owner"
uc_refuses "a deployer that is not owner()" "the deployer \$STARKNET_ACCOUNT_ADDRESS is not Challenge.owner()"
uc_case; printf '0xc0 0x777\n' >>"$rp/bin/classes"
uc_refuses "a Challenge class that is neither the file's nor the new one" "Challenge's class on the node is 0x777: neither the file's 0xc1a nor the new one"
uc_case; printf '0x51 0x5e7\n' >>"$rp/bin/classes"
uc_refuses "another contract whose class on the node is not the file's" "Setup's class on the node is 0x5e7, not the file's $(hexname Setup); nothing was sent"
uc_case
python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));d["contracts"]["Vault"]["class_hash"]="0x7a17";json.dump(d,open(sys.argv[1],"w"))' "$rp_json"
uc_refuses "another contract whose built class is not the file's" "the build's Vault class $(hexname Vault) is not the file's 0x7a17: this tool upgrades Challenge alone; nothing was sent"
uc_case
python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));d["contracts"]["Challenge"]["class_hash"]=sys.argv[2];json.dump(d,open(sys.argv[1],"w"))' "$rp_json" "$UC_NEW"
uc_refuses "a build whose Challenge class is the file's" "the built Challenge class is the file's ($UC_NEW): nothing to upgrade to"
uc_case '{"previous": {"Challenge": {"class_hash": "0xc1a"}}}'; uc_upgraded; touch "$rp/bin/guardian_other"
uc_refuses "a guardian that is another address" "Challenge.guardian() is another address: --guardian deployer would replace it; nothing was sent"
uc_case '{"previous": {"Challenge": {"class_hash": "0xc1a"}}}'; uc_upgraded; touch "$rp/bin/paused"
uc_refuses "a paused spawn" "Challenge's spawn is paused: the smoke's paid spawn would fail; the owner unpauses it (unpause_spawn) first; nothing was sent"

# A recorded upgrade with no receipt is awaited, not sent again: the wait (REPOINT_WAIT_S=0) ends the run, the hash kept.
uc_case '{"previous": {"Challenge": {"class_hash": "0xc1a"}}, "upgrade_tx": "0xdead3"}'
out="$(REPOINT_WAIT_S=0 rp_run --upgrade-challenge --guardian deployer)"; rc=$?
if [[ $rc -ne 1 || "$out" != *"upgrade_tx 0xdead3 (recorded) has no receipt after 0 s (node: UNKNOWN): check it before any rerun"* ||
    "$(uc_get_test upgrade_tx)" != 0xdead3 || -s "$rp/bin/sent.log" ]] || leaks -q <<<"$out"; then
  uc_fail "a recorded upgrade_tx with no receipt: expected exit 1, the hash kept, nothing sent, got $rc" "$out"
else
  echo "ok: sepolia --upgrade-challenge: a recorded upgrade_tx with no receipt stops the run (exit $rc), its hash kept, nothing sent"
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
  for name in Challenge Setup Faucet PavedToken MockRouter Vault Economy Collection; do
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
    FAKE_NODE=estimate PAVED_SCARB_SHIM="$est/bin/scarb" SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/classes" \
    "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$root/scripts/deploy.sh" sepolia --estimate-only 2>&1)"
  rc=$?
  lines="$(grep -c '^   estimate [A-Za-z]*: spec 0.10.2, sierra .* declared unknown: ok, overall_fee 10000000128 FRI' <<<"$out")"
  # D-21, D-24, D-25 E: a fresh run declares Setup, and neither Tutorial, Lobby nor Account, in deploy order.
  order="$(sed -n 's/^   estimate \([A-Za-z]*\): .*/\1/p' <<<"$out" | tr '\n' ' ')"
  if [[ "$order" != "Challenge Setup Faucet PavedToken MockRouter Vault Economy Collection " ]]; then
    echo "FAIL: sepolia --estimate-only: the fresh run's classes are not Setup's list without Tutorial, Lobby and Account: $order"; fail=1
  else
    echo "ok: a fresh run declares Challenge Setup Faucet PavedToken MockRouter Vault Economy Collection (no Tutorial, no Lobby, no Account)"
  fi
  if [[ $rc -ne 0 || "$lines" != 8 || "$out" != *"== estimate only: each of the 8 classes estimated or already declared; nothing was sent"* ||
      "$out" != *"== funding: deployer STRK balance 1000.00 STRK"* ||
      "$out" != *"== funding: 8 class(es) to declare, estimated at 0.00 STRK; need 1.25 x 0.00 STRK + 20 STRK margin = 20.00 STRK"* ||
      "$out" != *"   deployer STRK balance 1000.00 STRK: covers the need of 20.00 STRK"* ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia --estimate-only: expected exit 0 and 8 estimate lines, no value, got $rc and $lines:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$out"; fail=1
  elif [[ "$(grep -c '^fake-node: asked starknet_estimateFee$' "$est/node.log")" != 8 ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || grep -q '^fake-node: asked starknet_getBlockWith' "$est/node.log"; then
    echo "FAIL: sepolia --estimate-only: not 8 estimates, or an add* method or a block read was asked:"
    grep '^fake-node: asked' "$est/node.log" | sort | uniq -c; fail=1
  elif leaks -q "$log" "$est/node.log" || grep -qi "$KEY_MARK" "$log" "$est/node.log"; then
    echo "FAIL: sepolia --estimate-only: a value reached a child's argv or environment"; fail=1
  else
    echo "ok: sepolia --estimate-only estimates 8 classes (spec on each line), asks no starknet_add* method, reads no block"
  fi
  # Funding (S-1c, S-1d): a real sepolia run estimates the classes the node does not have and needs 1.25 x their
  # estimates + the 20 STRK margin, or the 200 STRK floor when an estimate fails. Each case gives the deployer a balance
  # (FAKE_STRK_BALANCE), the classes the node has (`declared`) and maybe a failing estimate (`estimate_error`).
  real_run() { # <STRK balance, base units> -> output; the signer's log in $est/node.log
    printf '%s' "$1" >"$est/strk"
    # Each case starts with no deployment file: a run records what it sends there (F), and the next case would resume it.
    rm -f "$root/contracts/deployments/sepolia.json"
    : >"$est/node.log"
    env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$est/bin:$PATH" SHIM_LOG="$log" \
      FAKE_NODE=estimate PAVED_SCARB_SHIM="$est/bin/scarb" SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/empty" \
      "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$root/scripts/deploy.sh" sepolia 2>&1
  }
  hexname() { printf '0x%s\n' "$(printf '%s' "$1" | od -An -tx1 | tr -d ' \n')"; }
  touch "$est/bin/hashes"
  # 1. Five of eight classes declared, 150 STRK (below the old 200 STRK floor): three estimates, need 20.00 STRK, passes
  #    and goes on to declare.
  for name in Challenge Setup Faucet PavedToken MockRouter; do hexname "$name"; done >"$est/bin/declared"
  out="$(real_run 150000000000000000000)"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"== funding: 3 class(es) to declare, estimated at 0.00 STRK; need 1.25 x 0.00 STRK + 20 STRK margin = 20.00 STRK"* ||
      "$out" != *"   deployer STRK balance 150.00 STRK: covers the need of 20.00 STRK"* || "$out" != *"== declare"* ||
      "$(grep -c '^   estimate [A-Za-z]*: declared already, nothing to send$' <<<"$out")" != 5 ||
      "$(grep -c '^fake-node: asked starknet_estimateFee$' "$est/node.log")" -lt 3 ]] ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with 5 of 8 classes declared and 150 STRK: expected the funding check to pass and the declares to start, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia with 5 of 8 classes declared passes with 150 STRK (need 20.00 STRK: 3 estimates + margin)"
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
  for name in Challenge Setup Faucet PavedToken MockRouter Vault; do hexname "$name"; done >"$est/bin/declared"
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
  if [[ $rc -ne 1 || "$out" != *"deploy.sh: declare Challenge failed"* || "$out" == *"declare Setup"* ||
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
  if [[ $rc -ne 1 || "$out" != *"deploy.sh: declare Challenge failed"* || "$out" == *"declare Setup"* ]] ||
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
  if [[ $rc -ne 1 || "$out" != *"== funding: 8 estimate(s) could not be had: the need falls back to the 200 STRK floor"* ||
      "$out" != *"   deployer STRK balance 150.00 STRK: BELOW the need of 200.00 STRK"* || "$out" == *"== declare"* ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia with failing estimates and 150 STRK: expected the 200 STRK floor and a stop before sending, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia whose estimates fail falls back to the 200 STRK floor; 150 STRK stops before its first declare"
  fi
  # The fresh path's deployment file (F), past every check of a real run: a live deployment (no `fresh` record) is
  # refused before anything is built or sent; --check-only to a new path passes every check, sends nothing and writes no
  # file; a complete record with no STRK passes the funding check (nothing is left to send).
  fresh_run() { # <STRK balance, base units> <deploy.sh options after sepolia...> -> output
    printf '%s' "$1" >"$est/strk"; shift
    : >"$est/node.log"
    env -u STARKNET_ACCOUNT_ADDRESS -u STARKNET_PRIVATE_KEY -u STARKNET_RPC_URL PATH="$est/bin:$PATH" SHIM_LOG="$log" \
      FAKE_NODE=estimate PAVED_SCARB_SHIM="$est/bin/scarb" SCARB_BIN_DIR="$est/bin" SNCAST_BIN_DIR="$est/bin" ESTIMATE_RELEASE_DIR="$est/empty" \
      "$ADDR" "STARKNET_PRIVATE_KEY=0x$KEY_MARK" "$URL" "$root/scripts/deploy.sh" sepolia "$@" 2>&1
  }
  live="$root/contracts/deployments/sepolia.json"
  mkdir -p "$root/contracts/deployments"
  printf '{"network":"sepolia","chain_id":"0x534e5f5345504f4c4941","contracts":{"Daily":{"address":"0x1"}}}\n' >"$live"
  cp "$live" "$est/live.before"
  for mode in "" --check-only; do
    out="$(fresh_run 1000000000000000000000 $mode)"; rc=$?
    if [[ $rc -ne 1 || "$out" != *"contracts/deployments/sepolia.json holds a live deployment (no fresh record): it is not overwritten; name a new output path with --out <file>; nothing was sent"* ||
        "$out" == *"== build"* ]] || ! cmp -s "$live" "$est/live.before" ||
        grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
      echo "FAIL: sepolia ${mode:-(run)} over a live deployment file: expected a refusal before the build, the file unchanged, got $rc:"
      sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
    else
      echo "ok: sepolia ${mode:-(run)} refuses to overwrite a live deployment file before the build; nothing sent"
    fi
  done
  rm -f "$live" "$est/live.before"
  new="$est/fresh-new.json"
  out="$(fresh_run 1000000000000000000000 --check-only --out "$new")"; rc=$?
  if [[ $rc -ne 0 || "$out" != *"== fresh: check only: every check passed; nothing was sent"* || "$out" == *"== declare"* ||
      "$out" != *"no record: a run would declare 8 classes"* ]] || [[ -e "$new" ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia --check-only --out <new file>: expected exit 0, 'every check passed; nothing was sent', no file, no add*, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia --check-only --out <new file> passes every check, sends nothing and writes no file"
  fi
  # A complete record and no STRK: --check-only passes (the need waived); its keys listed.
  printf '{"network":"sepolia","chain_id":"0x534e5f5345504f4c4941","fresh":{"salt":"0x1","complete":"yes"}}\n' >"$new"
  out="$(fresh_run 0 --check-only --out "$new")"; rc=$?
  if [[ $rc -ne 0 || "$out" != *"fresh: the record is complete, nothing is left to send, so the need does not apply"* ||
      "$out" != *"complete: a run would send nothing"* || "$out" != *"every check passed; nothing was sent"* ]] ||
      grep -q '^fake-node: asked starknet_add' "$est/node.log" || leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out"; then
    echo "FAIL: sepolia --check-only on a complete record with no STRK: expected the need waived and a pass, got $rc:"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia --check-only on a complete record with no STRK: the need waived, every check passed, nothing sent"
  fi
  # A record holding a transaction hash under every key a run records (review of #358, note 2): --check-only lists each
  # key with its status read from the node (UNKNOWN here: the fake node knows no transaction), sends nothing, leaves
  # the file as it was, and no value of the three variables reaches an output, the file or a child's argv.
  python3 -I - "$new" <<'PY2'
import json, sys
keys = ["declare_tx", "Faucet.deploy_tx", "PavedToken.deploy_tx", "MockRouter.deploy_tx", "Vault.deploy_tx", "pool_tx",
        "stake_tx", "Economy.deploy_tx", "minter_tx", "Setup.deploy_tx", "Challenge.deploy_tx", "Collection.deploy_tx",
        "wiring_tx", "definitions_tx", "smoke.spawn_tx", "smoke.build_tx", "smoke.surrender_tx", "smoke.claim_tx",
        "smoke.settle_tx"]
fresh = {"salt": "0x1", "at": "unmerged-test"}
for i, key in enumerate(keys):
    node = fresh
    *parents, leaf = key.split(".")
    for part in parents:
        node = node.setdefault(part, {})
    node[leaf] = "0x%x" % (0xabc000 + i)
json.dump({"network": "sepolia", "chain_id": "0x534e5f5345504f4c4941", "fresh": fresh}, open(sys.argv[1], "w"), indent=2)
PY2
  cp "$new" "$est/record.before"
  : >"$log"
  out="$(fresh_run 1000000000000000000000 --check-only --out "$new")"; rc=$?
  listed="$(grep -c '^   [A-Za-z.]*_tx 0xabc0[0-9a-f]*: UNKNOWN$' <<<"$out")"
  if [[ $rc -ne 0 || "$listed" != 19 || "$out" != *"every check passed; nothing was sent"* || "$out" == *"== declare"* ]] ||
      ! cmp -s "$new" "$est/record.before" || grep -q '^fake-node: asked starknet_add' "$est/node.log" ||
      leaks -q <<<"$out" || grep -qi "$KEY_MARK" <<<"$out" || leaks -q "$new" || grep -qi "$KEY_MARK" "$new" ||
      grep '^[a-z]* argv' "$log" | leaks -q || grep '^[a-z]* argv' "$log" | grep -qi "$KEY_MARK"; then
    echo "FAIL: sepolia --check-only over a record of 19 transaction hashes: expected each listed, nothing sent, the file unchanged, no value, got $rc ($listed listed):"
    sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI; s/$KEY_MARK/<key>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia --check-only over a record of 19 transaction hashes lists each with its status, sends nothing, keeps the file, leaks no value"
  fi
  rm -f "$est/record.before"
  # A record of another network is refused.
  printf '{"network":"devnet","chain_id":"0x534e5f5345504f4c4941","fresh":{}}\n' >"$new"
  out="$(fresh_run 1000000000000000000000 --out "$new")"; rc=$?
  if [[ $rc -ne 1 || "$out" != *"records a 'devnet' deployment, not sepolia; nothing was sent"* ]]; then
    echo "FAIL: sepolia --out <a devnet record>: expected a refusal, got $rc:"; sed "s/MARKER/<marker>/gI; s/$ADDR_MARK/<address>/gI" <<<"$out"; fail=1
  else
    echo "ok: sepolia --out <a devnet record> is refused; nothing sent"
  fi
  rm -f "$new" "$est/strk"
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

# S1 audit: no external entry point of Challenge or Setup takes a Mode (Challenge fixes it: Mode::Challenge; the Lobby class
# that took one is gone since D-24). Read from the committed ABIs, which CI checks against the build.
for contract in Challenge Setup; do
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
