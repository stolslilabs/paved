#!/usr/bin/env bash
# Fails if a contract class is above the Starknet class limits, and prints the table with the margin.
#
# Usage: scripts/class-sizes.sh
#
# Starknet caps a declared class at 81,920 Sierra felts and 81,920 CASM felts (and 4,089,446 bytes of
# class). The programme keeps a margin: a class above 90 % of a cap is flagged "tight" (not a failure).
# Builds the release profile (the one scripts/deploy.sh declares) with `scarb --release build`
# (RAYON_NUM_THREADS=1); contracts/Scarb.toml sets `casm = true` so the compiled class is written.
# scarb must be on the PATH (the toolchain of .tool-versions); python3 reads the class files.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contracts=(Account Daily Tutorial Token)

cd "$root/contracts"
RAYON_NUM_THREADS=1 scarb --release build >/dev/null

python3 -I - target/release "${contracts[@]}" <<'PY'
import json
import os
import sys

SIERRA_CAP = 81920
CASM_CAP = 81920
BYTES_CAP = 4089446
TARGET = 0.90

directory, names = sys.argv[1], sys.argv[2:]
print(f"{'class':<10}{'sierra':>9}{'casm':>9}{'bytes':>10}{'worst %':>9}{'margin':>9}  status")
failed = False
for name in names:
    base = os.path.join(directory, f"paved_{name}")
    for suffix in (".contract_class.json", ".compiled_contract_class.json"):
        if not os.path.isfile(base + suffix):
            print(f"class-sizes.sh: missing {base}{suffix}", file=sys.stderr)
            sys.exit(1)
    with open(base + ".contract_class.json") as f:
        sierra = len(json.load(f)["sierra_program"])
    with open(base + ".compiled_contract_class.json") as f:
        casm = len(json.load(f)["bytecode"])
    size = os.path.getsize(base + ".contract_class.json")
    worst = max(sierra / SIERRA_CAP, casm / CASM_CAP, size / BYTES_CAP)
    margin = min(SIERRA_CAP - sierra, CASM_CAP - casm)
    if sierra > SIERRA_CAP or casm > CASM_CAP or size > BYTES_CAP:
        status = "OVER"
        failed = True
    elif worst > TARGET:
        status = "tight (above 90 %)"
    else:
        status = "ok"
    print(f"{name:<10}{sierra:>9}{casm:>9}{size:>10}{worst * 100:>8.1f}%{margin:>9}  {status}")
if failed:
    print("class-sizes.sh: a class is above the Starknet limits (81,920 Sierra or CASM felts)", file=sys.stderr)
    sys.exit(1)
PY
