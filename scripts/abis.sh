#!/usr/bin/env bash
# Writes contracts/abis/<Contract>.json (ABI only) from the scarb build, for the client.
#
# Usage: scripts/abis.sh
#
# Builds with `scarb build` (RAYON_NUM_THREADS=1), then extracts the `abi` array of
# target/dev/paved_<Contract>.contract_class.json with python3 (on every CI runner).
# Output is pretty-printed (2 spaces) with the key order of the compiler, ends with a
# newline, so two runs give identical files. Exits non-zero if a class file is missing.
# scarb must be on the PATH (the toolchain of .tool-versions).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contracts=(Account Daily Tutorial Token PavedToken Vault)

cd "$root/contracts"
RAYON_NUM_THREADS=1 scarb build

mkdir -p abis
for name in "${contracts[@]}"; do
  class="target/dev/paved_${name}.contract_class.json"
  if [[ ! -f "$class" ]]; then
    echo "abis.sh: missing contract class $class" >&2
    exit 1
  fi
  python3 -I - "$class" "abis/${name}.json" <<'PY'
import json
import sys

src, dst = sys.argv[1:3]
with open(src) as f:
    abi = json.load(f)["abi"]
with open(dst, "w") as f:
    json.dump(abi, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
done
echo "abis.sh: wrote ${#contracts[@]} files in contracts/abis"
