#!/usr/bin/env bash
# Reproduces the baseline measures of docs/measures/baseline.md:
#   1. L2 gas of one `Daily.build` call on five scenarios (contracts/tests/gas.cairo);
#   2. line coverage of contracts/src (snforge --coverage + cairo-coverage + lcov), whole or in
#      split runs (one snforge run per test group, lcov files merged) for machines with 8 GB.
#
# Usage: scripts/measure.sh [gas|coverage|coverage-split|check-setup|all]   (default: all;
#        `all` runs the whole coverage, `coverage-split` is the one for an 8 GB machine)
#
# Runs are single-threaded (RAYON_NUM_THREADS=1) and each is capped to 8 GiB of address space and reports its peak resident memory.
# Toolchain: scarb 2.20.1 and snforge 0.64.0 (override with SCARB_BIN_DIR / SNFORGE_BIN_DIR);
# cairo-coverage must be on the PATH (https://github.com/software-mansion/cairo-coverage).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/contracts"

SCARB_BIN_DIR="${SCARB_BIN_DIR:-$HOME/.asdf/installs/scarb/2.20.1/bin}"
SNFORGE_BIN_DIR="${SNFORGE_BIN_DIR:-$HOME/.asdf/installs/starknet-foundry/0.64.0/bin}"
CAIRO_COVERAGE_BIN_DIR="${CAIRO_COVERAGE_BIN_DIR:-$HOME/.asdf/installs/cairo-coverage/0.6.1/bin}"
# snforge calls `cairo-coverage` from the PATH: the asdf shim wants a version set, so the install
# directory comes first when it exists
if [ -d "$CAIRO_COVERAGE_BIN_DIR" ]; then
  export PATH="$CAIRO_COVERAGE_BIN_DIR:$PATH"
fi
export PATH="$SCARB_BIN_DIR:$SNFORGE_BIN_DIR:$HOME/.local/bin:$PATH"
MEM_CAP_BYTES="${MEM_CAP_BYTES:-8589934592}"
# docs/programme/OPERATIONS.md: builds and measures run single-threaded.
export RAYON_NUM_THREADS=1

mode="${1:-all}"

versions() {
  scarb --version | head -n 1
  snforge --version
}

run_capped() {
  # Peak memory is printed by /usr/bin/time: kbytes on Linux (capped with prlimit), bytes on macOS
  # (`time -l`; prlimit does not exist there, so no cap).
  if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/time -l "$@"
  else
    prlimit --as="$MEM_CAP_BYTES" -- /usr/bin/time -f 'Maximum resident set size (kbytes): %M' "$@"
  fi
}

# contracts/tests/setup.cairo is a copy of contracts/src/tests/setup.cairo (first line = header).
check_setup() {
  diff <(tail -n +2 tests/setup.cairo) src/tests/setup.cairo && echo "setup.cairo copy in sync"
}

gas() {
  echo "== L2 gas of one build call, scenarios"
  # Tests print `GAS <scenario>: <l2 gas>` and fail above their ceiling (5 % over the baseline).
  run_capped snforge test test_gas_ 2>&1 | grep -iE '^GAS |^\[(PASS|FAIL)\]|^Tests:|maximum resident|panicked|Failure'
}

# Per directory of contracts/src (tests/ and mocks/ excluded) and overall, from an lcov file.
coverage_table() {
  awk '
    /^SF:/ { file = substr($0, 4); keep = (file ~ /(^|\/)src\// && file !~ /\/src\/(tests|mocks)\//) ;
             if (keep) { sub(/^.*\/src\//, "", file); n = split(file, p, "/"); dir = (n > 1) ? p[1] : "(root)" } }
    /^DA:/ && keep { split(substr($0, 4), a, ","); tot[dir]++; all++;
                     if (a[2] + 0 > 0) { hit[dir]++; allhit++ } }
    END {
      for (d in tot) printf "%-12s %6d / %6d  %6.2f %%\n", d, hit[d], tot[d], 100 * hit[d] / tot[d];
      printf "%-12s %6d / %6d  %6.2f %%\n", "TOTAL", allhit, all, 100 * allhit / all
    }' "$1" | sort
}

coverage() {
  echo "== Line coverage of contracts/src"
  rm -rf coverage
  run_capped snforge test --coverage 2>&1 | grep -iE '^Tests:|maximum resident|coverage'
  lcov="$(pwd)/coverage/coverage.lcov"
  test -s "$lcov" || { echo "no coverage.lcov produced"; exit 1; }
  coverage_table "$lcov"
}

# The test groups of the split run: `name|snforge filter|extra snforge arguments` (a filter is a
# substring of the test path; one run each). Together they cover every test of the crate,
# `tests/gas.cairo` included. The exhaustive table tests (`paved::structure::tables`) peak above
# 8 GiB when run together, so they run by partition (`--partition i/12`: two tests per run).
COVERAGE_GROUPS=(
  "types|paved::types::|"
  "elements|paved::elements::|"
  "helpers-random-deck|paved::helpers::random_deck::|"
  "helpers-multiplier|paved::helpers::multiplier::|"
  "models|paved::models::|"
  "structure-record|paved::structure::record::|"
  "structure-placement|paved::structure::placement::|"
  "structure-state|paved::structure::state::|"
  "structure-oriented|paved::structure::oriented::|"
  "structure-tables-1|paved::structure::tables::|--partition 1/12"
  "structure-tables-2|paved::structure::tables::|--partition 2/12"
  "structure-tables-3|paved::structure::tables::|--partition 3/12"
  "structure-tables-4|paved::structure::tables::|--partition 4/12"
  "structure-tables-5|paved::structure::tables::|--partition 5/12"
  "structure-tables-6|paved::structure::tables::|--partition 6/12"
  "structure-tables-7|paved::structure::tables::|--partition 7/12"
  "structure-tables-8|paved::structure::tables::|--partition 8/12"
  "structure-tables-9|paved::structure::tables::|--partition 9/12"
  "structure-tables-10|paved::structure::tables::|--partition 10/12"
  "structure-tables-11|paved::structure::tables::|--partition 11/12"
  "structure-tables-12|paved::structure::tables::|--partition 12/12"
  "store|paved::store::|"
  "e2e|paved::tests::e2e::|"
  "golden|paved::tests::golden::|"
  "differential|paved::tests::differential|"
  "oracle|paved::tests::oracle|"
  "gas|test_gas_|"
)

# Sums the line hits of lcov files per source file and line: `merge_lcov out in...`.
merge_lcov() {
  out="$1"; shift
  awk '
    /^SF:/ { file = substr($0, 4); if (!(file in seen)) { seen[file] = 1; order[++nfiles] = file } }
    /^DA:/ { split(substr($0, 4), a, ","); key = file SUBSEP a[1]; hits[key] += a[2];
             if (!(key in known)) { known[key] = 1; lines[file] = lines[file] " " a[1] } }
    END {
      for (i = 1; i <= nfiles; i++) {
        f = order[i]; print "SF:" f
        n = split(lines[f], l, " ")
        for (j = 1; j <= n; j++) print "DA:" l[j] "," hits[f SUBSEP l[j]]
        print "end_of_record"
      }
    }' "$@" > "$out"
}

# One `snforge test --coverage <filter>` per group, each with its peak memory, the lcov files
# merged, then the table. `lcov -a` is not used: the awk merge is the same on every machine.
coverage_split() {
  echo "== Line coverage of contracts/src, split runs"
  rm -rf coverage target/coverage-split
  mkdir -p target/coverage-split
  parts=()
  for group in "${COVERAGE_GROUPS[@]}"; do
    name="${group%%|*}"; rest="${group#*|}"; filter="${rest%%|*}"; extra="${rest#*|}"
    echo "-- group $name (filter $filter $extra)"
    rm -rf coverage
    # The group fails when snforge exits non-zero or its `Tests:` line does not say `0 failed`.
    log="target/coverage-split/$name.log"
    set +e
    # shellcheck disable=SC2086
    run_capped snforge test --coverage --max-threads 2 $extra "$filter" > "$log" 2>&1
    status=$?
    set -e
    grep -iE '^Tests:|maximum resident|coverage|error|panicked' "$log" || true
    if [[ "$status" -ne 0 ]]; then
      echo "group $name: snforge exited with status $status"; exit 1
    fi
    grep -qE '^Tests:.* 0 failed' "$log" || { echo "group $name: its Tests: line does not say 0 failed"; exit 1; }
    test -s coverage/coverage.lcov || { echo "no coverage.lcov for group $name"; exit 1; }
    cp coverage/coverage.lcov "target/coverage-split/$name.lcov"
    parts+=("target/coverage-split/$name.lcov")
  done
  merge_lcov target/coverage-split/merged.lcov "${parts[@]}"
  echo "== Merged ($(pwd)/target/coverage-split/merged.lcov)"
  coverage_table target/coverage-split/merged.lcov
}

case "$mode" in
  gas) versions; gas ;;
  coverage) versions; coverage ;;
  coverage-split) versions; coverage_split ;;
  check-setup) versions; check_setup ;;
  all) versions; check_setup; gas; coverage ;;
  *) echo "usage: $0 [gas|coverage|coverage-split|check-setup|all]"; exit 2 ;;
esac
