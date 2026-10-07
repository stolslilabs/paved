#!/usr/bin/env bash
# Fails if a contract class is above the Starknet class limits, and prints the table with the margin.
#
# Usage: scripts/class-sizes.sh
#
# Starknet caps a declared class at 81,920 Sierra felts and 81,920 CASM felts (and 4,089,446 bytes of
# class). The programme keeps a margin: a class above 90 % of a cap is flagged "tight" (not a failure).
# Builds the release profile (the one scripts/deploy.sh declares) with `scarb --release build`
# (RAYON_NUM_THREADS=1); contracts/Scarb.toml sets `casm = true` so the compiled class is written.
# Every contract listed in target/release/<package>.starknet_artifacts.json is measured; the check fails if
# that list is empty or a listed class file is missing.
# The CASM count is the one of the scarb version in .tool-versions; the sequencer compiles with its own
# pinned compiler version, so near a cap leave margin.
# scarb must be on the PATH (the toolchain of .tool-versions); python3 reads the class files.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$root/contracts"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
if ! RAYON_NUM_THREADS=1 scarb --release build >"$log" 2>&1; then
    cat "$log" >&2
    echo "class-sizes.sh: scarb --release build failed" >&2
    exit 1
fi

python3 -I - target/release <<'PY'
import json
import os
import sys

SIERRA_CAP = 81920
CASM_CAP = 81920
BYTES_CAP = 4089446
TARGET = 0.90

directory = sys.argv[1]
artifacts = [f for f in os.listdir(directory) if f.endswith(".starknet_artifacts.json")]
if not artifacts:
    print(f"class-sizes.sh: no *.starknet_artifacts.json in {directory}", file=sys.stderr)
    sys.exit(1)
entries = []
for artifact in sorted(artifacts):
    with open(os.path.join(directory, artifact)) as f:
        for contract in json.load(f)["contracts"]:
            entries.append((contract["contract_name"], contract["artifacts"]["sierra"], contract["artifacts"]["casm"]))
if not entries:
    print("class-sizes.sh: the artifacts list has no contract", file=sys.stderr)
    sys.exit(1)
print(f"{'class':<10}{'sierra':>9}{'casm':>9}{'bytes':>10}{'worst %':>9}{'margin':>9}  status")
failed = False
for name, sierra_file, casm_file in entries:
    sierra_path = os.path.join(directory, sierra_file)
    casm_path = os.path.join(directory, casm_file)
    for path in (sierra_path, casm_path):
        if not os.path.isfile(path):
            print(f"class-sizes.sh: missing {path}", file=sys.stderr)
            sys.exit(1)
    with open(sierra_path) as f:
        sierra = len(json.load(f)["sierra_program"])
    with open(casm_path) as f:
        casm = len(json.load(f)["bytecode"])
    size = os.path.getsize(sierra_path)
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
