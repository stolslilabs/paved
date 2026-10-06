#!/usr/bin/env bash
# Reproduces the baseline measures of docs/measures/baseline.md:
#   1. L2 gas of one `Daily.build` call on four scenarios (contracts/tests/gas.cairo);
#   2. line coverage of contracts/src (snforge --coverage + cairo-coverage + lcov).
#
# Usage: scripts/measure.sh [gas|coverage|all]   (default: all)
#
# Runs are single-threaded (RAYON_NUM_THREADS=1) and each is capped to 8 GiB of address space and reports its peak resident memory.
# Toolchain: scarb 2.13.1 and snforge 0.51.2 (override with SCARB_BIN_DIR / SNFORGE_BIN_DIR);
# cairo-coverage must be on the PATH (https://github.com/software-mansion/cairo-coverage).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/contracts"

SCARB_BIN_DIR="${SCARB_BIN_DIR:-$HOME/.asdf/installs/scarb/2.13.1/bin}"
SNFORGE_BIN_DIR="${SNFORGE_BIN_DIR:-$HOME/.asdf/installs/starknet-foundry/0.51.2/bin}"
export PATH="$SCARB_BIN_DIR:$SNFORGE_BIN_DIR:$HOME/.local/bin:$PATH"
MEM_CAP_BYTES="${MEM_CAP_BYTES:-8589934592}"
# docs/programme/OPERATIONS.md: builds and measures run single-threaded.
export RAYON_NUM_THREADS=1

mode="${1:-all}"

run_capped() {
  # Peak memory is printed by /usr/bin/time (Maximum resident set size, in kbytes).
  prlimit --as="$MEM_CAP_BYTES" -- /usr/bin/time -f 'Maximum resident set size (kbytes): %M' "$@"
}

gas() {
  echo "== L2 gas of one build call, four scenarios"
  # Tests print `GAS <scenario>: <l2 gas>` and fail above their ceiling (5 % over the baseline).
  run_capped snforge test test_gas_ 2>&1 | grep -E '^GAS |^\[(PASS|FAIL)\]|^Tests:|Maximum resident|panicked|Failure'
}

coverage() {
  echo "== Line coverage of contracts/src"
  rm -rf coverage
  run_capped snforge test --coverage 2>&1 | grep -E '^Tests:|Maximum resident|coverage'
  lcov="$(pwd)/coverage/coverage.lcov"
  test -s "$lcov" || { echo "no coverage.lcov produced"; exit 1; }
  # Per directory of contracts/src (tests/ and mocks/ excluded) and overall, from the lcov file.
  awk '
    /^SF:/ { file = substr($0, 4); keep = (file ~ /(^|\/)src\// && file !~ /\/src\/(tests|mocks)\//) ;
             if (keep) { sub(/^.*\/src\//, "", file); n = split(file, p, "/"); dir = (n > 1) ? p[1] : "(root)" } }
    /^DA:/ && keep { split(substr($0, 4), a, ","); tot[dir]++; all++;
                     if (a[2] + 0 > 0) { hit[dir]++; allhit++ } }
    END {
      for (d in tot) printf "%-12s %6d / %6d  %6.2f %%\n", d, hit[d], tot[d], 100 * hit[d] / tot[d];
      printf "%-12s %6d / %6d  %6.2f %%\n", "TOTAL", allhit, all, 100 * allhit / all
    }' "$lcov" | sort
}

case "$mode" in
  gas) gas ;;
  coverage) coverage ;;
  all) gas; coverage ;;
  *) echo "usage: $0 [gas|coverage|all]"; exit 2 ;;
esac
