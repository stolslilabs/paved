#!/usr/bin/env bash
# Reproduces the baseline measures of docs/measures/baseline.md:
#   1. L2 gas of one `Daily.build` call on five scenarios (contracts/tests/gas.cairo);
#   2. line coverage of contracts/src (snforge --coverage + cairo-coverage + lcov), whole or in
#      split runs (one snforge run per test group, lcov files merged) to lower the peak of each run.
#
# Usage: scripts/measure.sh [gas|coverage|coverage-split|check-setup|check-groups|all]   (default: all;
#        `all` runs the whole coverage, `coverage-split` is the split one. Coverage runs peak at 8.4 to 14.6 GB RSS
#        (docs/measures/coverage.md, "Peaks"), so they run on the Mac under a 16 GB stop (stop the run above it and
#        report) or in CI, and are refused on Linux without an override. `check-groups` builds nothing and needs no
#        toolchain: it fails when a test module of the crate is in no COVERAGE_GROUPS group.)
#        Coverage runs use the `coverage` Scarb profile (contracts/Scarb.toml): only it keeps the code
#        locations that cairo-coverage needs, the dev profile drops them to lower the test build peak.
#
# Runs are single-threaded (RAYON_NUM_THREADS=1) and each is capped to 15 GiB of address space (from VmPeak, see below) and reports its peak resident memory.
# Toolchain: scarb 2.20.1 and snforge 0.64.0, plain `scarb` and `snforge` from the PATH, with no prepend (the owner's
# Cairo rule, 2026-10-14: at most one Cairo run at a time on the VPS, always through the shims ~/.local/bin/scarb and
# ~/.local/bin/snforge, which hold the machine-wide lock). SCARB_BIN_DIR / SNFORGE_BIN_DIR go first on the PATH only when
# the caller sets them (=$HOME/.local/bin passes). Before any build a guard refuses (exit 2) when a shim exists and the
# tool resolves elsewhere (an asdf directory included, overrides too); with no shim (the Mac, CI) it only warns.
# PAVED_SCARB_SHIM / PAVED_SNFORGE_SHIM are the shim paths the guard expects (defaults ~/.local/bin/scarb and
# ~/.local/bin/snforge): TEST HOOKS ONLY (PM, 2026-10-14), for scripts/test-deploy-url.sh. A thread never points them at
# a real binary to get past the guard. A shim is a script (`#!` first line): a native binary at that path (the Mac holds
# a stray scarb there) is no shim, and only warns.
# cairo-coverage (https://github.com/software-mansion/cairo-coverage) is not a Cairo build: snforge finds it on the PATH,
# where its directory (CAIRO_COVERAGE_BIN_DIR, default the asdf install, when it exists) goes first: it holds no scarb or
# snforge, and the guard, run after the PATH is set, refuses if it ever does.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/contracts"

# The test groups of the split run: `name|snforge filter|extra snforge arguments` (a filter is a
# substring of the test path; one run each). They are meant to cover every test of the crate, `tests/gas.cairo`
# included, and `check-groups` fails when a test module is in none. The exhaustive table tests (`paved::structure::tables`) peak above
# 8 GiB when run together, so they run by partition (`--partition i/12`: two tests per run).
# `tests-draw-mask` peaked at 15.89 GB as one group (0.11 GB under the 16 GB stop), so it runs by partition too (`--partition i/3`,
# about five or six of its 16 tests per run; snforge assigns the tests, not this file). Measured on the Mac on 2026-10-15: the parts
# run 5, 6 and 5 tests (the 16 once each) and peak at 15.35 to 15.36 GB, within this run's range of other groups (14.00 to 15.47 GB), near its top; the whole group was not re-run, so the partition's effect is not measured (docs/measures/coverage.md).
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
  "quests|paved::quests::|"
  "e2e|paved::tests::e2e::|"
  "golden|paved::tests::golden::|"
  "differential|paved::tests::differential|"
  "oracle|paved::tests::oracle|"
  "tests-collection|paved::tests::collection|"
  "tests-deck-walk|paved::tests::deck_walk|"
  "tests-draw-mask-1|paved::tests::draw_mask|--partition 1/3"
  "tests-draw-mask-2|paved::tests::draw_mask|--partition 2/3"
  "tests-draw-mask-3|paved::tests::draw_mask|--partition 3/3"
  "tests-economy|paved::tests::economy::|"
  "tests-owners|paved::tests::owners|"
  "tests-seed|paved::tests::seed|"
  "tests-story|paved::tests::story|"
  "tests-vrf|paved::tests::vrf|"
  "tests-walk-cost|paved::tests::walk_cost|"
  "tests-xp-level|paved::tests::xp_level|"
  "gas|test_gas_|"
  "profile-g7|test_profile_g7_|"
)

# `check-groups`: every file of the crate with a #[test] (src/**, and tests/*.cairo by test name) must match the filter
# of at least one group. A module `paved::a::b` is matched when a filter is a substring of `paved::a::b::`, as a test
# path `paved::a::b::<test>` would be. Reads the source tree only: no build, no toolchain.
check_groups() {
  local f mod name g rest filter missing=0 hit n want
  while IFS= read -r f; do
    mod="paved::$(echo "${f#src/}" | sed -e 's/\.cairo$//' -e 's#/#::#g')::"
    hit=0
    for g in "${COVERAGE_GROUPS[@]}"; do
      rest="${g#*|}"; filter="${rest%%|*}"
      [[ "$mod" == *"$filter"* ]] && { hit=1; break; }
    done
    [[ "$hit" == 1 ]] || { echo "check-groups: module ${mod%::} ($f) is in no COVERAGE_GROUPS group"; missing=1; }
  done < <(grep -rl '#\[test\]' src | LC_ALL=C sort)
  while IFS= read -r name; do
    hit=0
    for g in "${COVERAGE_GROUPS[@]}"; do
      rest="${g#*|}"; filter="${rest%%|*}"
      [[ "$name" == *"$filter"* ]] && { hit=1; break; }
    done
    [[ "$hit" == 1 ]] || { echo "check-groups: integration test $name (tests/) is in no COVERAGE_GROUPS group"; missing=1; }
  done < <(find tests -name '*.cairo' -print0 | xargs -0 awk '/#\[test\]/ { t = 1; next } t && /^[[:space:]]*(pub )?fn / { sub(/^[[:space:]]*(pub )?fn /, ""); sub(/\(.*/, ""); print; t = 0 }' | LC_ALL=C sort)
  # A filter split by `--partition i/N` runs all its tests only when the parts 1..N are all present: a dropped part loses
  # tests the module check above does not see.
  local parts
  while IFS= read -r filter; do
    parts="$(for g in "${COVERAGE_GROUPS[@]}"; do
      rest="${g#*|}"
      if [[ "${rest%%|*}" == "$filter" && "$rest" == *"--partition "* ]]; then echo "${rest##*--partition }"; fi
    done | LC_ALL=C sort)"
    n="${parts%%$'\n'*}"; n="${n#*/}"
    want="$(for ((i = 1; i <= n; i++)); do echo "$i/$n"; done | LC_ALL=C sort)"
    [[ "$parts" == "$want" ]] || { echo "check-groups: the partitions of $filter are not 1/$n to $n/$n, each once"; missing=1; }
  done < <(for g in "${COVERAGE_GROUPS[@]}"; do rest="${g#*|}"; if [[ "$rest" == *"--partition "* ]]; then echo "${rest%%|*}"; fi; done | LC_ALL=C sort -u)
  # `test_gas_` is a name filter: a src test named like it would run in two groups (warned, not failed)
  grep -rnE 'fn test_gas_' src | sed 's/^/check-groups: warning: a src test is also matched by the test_gas_ group: /' || true
  [[ "$missing" == 0 ]] || return 1
  echo "check-groups: every test module is in a COVERAGE_GROUPS group (${#COVERAGE_GROUPS[@]} groups)"
}

# Limits of check-groups: it matches by module path and test name only. A module whose tests are all #[ignore] is still
# required to be in a group (coverage_split skips a group that runs nothing); a test matched by two groups is not detected,
# except the test_gas_ name filter (warned).
# check-groups reads the source tree only: it runs before the shim guard, which needs a toolchain.
if [ "${1:-}" = check-groups ]; then check_groups; exit $?; fi

[ -z "${SCARB_BIN_DIR:-}" ] || export PATH="$SCARB_BIN_DIR:$PATH"
[ -z "${SNFORGE_BIN_DIR:-}" ] || export PATH="$SNFORGE_BIN_DIR:$PATH"
# snforge calls `cairo-coverage` from the PATH, and the asdf shim of it wants a version set, so its install directory
# goes first when it exists. It holds only cairo-coverage, so it cannot shadow the shims: the guard below runs after the
# PATH is set, and refuses if that directory ever holds a scarb or snforge.
CAIRO_COVERAGE_BIN_DIR="${CAIRO_COVERAGE_BIN_DIR:-$HOME/.asdf/installs/cairo-coverage/0.6.1/bin}"
if [ -d "$CAIRO_COVERAGE_BIN_DIR" ]; then
  export PATH="$CAIRO_COVERAGE_BIN_DIR:$PATH"
fi
# one tool, one shim: refuse when the shim exists and the tool resolves elsewhere, warn when there is no shim. A shim is
# an executable script (`#!` first line); a native binary at the path counts as no shim.
shim_guard() { # <tool> <shim path> <override variable name>
  local found note
  found="$(command -v "$1" || true)"
  note="no shim at $2"
  if [ -x "$2" ] && [ ! -r "$2" ]; then
    echo "measure.sh: the shim $2 is executable but unreadable, so it cannot be told from a stray binary: refusing (fix its permissions)" >&2
    exit 2
  elif [ -x "$2" ] && [ "$(head -c 2 "$2" 2>/dev/null | LC_ALL=C tr -d '\0')" != '#!' ]; then
    note="no shim at $2 (a native binary, not a script)"
  elif [ -x "$2" ]; then
    if [ "$found" != "$2" ]; then
      echo "measure.sh: $1 resolves to ${found:-(not found)}, not the shim $2: the owner's rule is one Cairo run at a time through the shims (set $3=\$HOME/.local/bin, or fix PATH)" >&2
      exit 2
    fi
    return 0
  fi
  echo "measure.sh: warning: $note, using $1 ${found:-(not found)}" >&2
}
shim_guard scarb "${PAVED_SCARB_SHIM:-$HOME/.local/bin/scarb}" SCARB_BIN_DIR
shim_guard snforge "${PAVED_SNFORGE_SHIM:-$HOME/.local/bin/snforge}" SNFORGE_BIN_DIR
# `prlimit --as` caps address space, so caps come from VmPeak, not RSS (D-251): cap = 1.5 x the VmPeak of the
# largest process of the run, rounded up to a whole GiB, within [8, 16] GiB. Measured on the VPS on 2026-10-10
# (RAYON_NUM_THREADS=1, under a 16 GiB cap; see AGENTS.md): `snforge test paved::types::` VmPeak 10,374,784 kB
# (9.89 GiB; VmHWM 6,269,668 kB), the largest of any snforge run (its scarb test-build child), so the cap is
# 15 GiB for every snforge run here (a cold test build after `scarb clean` peaked at 9,326,232 kB, 14 GiB).
# Coverage runs (`coverage-split` groups, `coverage`, `all`) peak at 8.4 to 14.6 GB RSS on the Mac (docs/measures/coverage.md,
# "Peaks": largest group `e2e` 14.64 GB, `tests-draw-mask` 13.99 GB; the unsplit run with default threads reached 18.5 GB and was
# stopped, hence its --max-threads 2 now). Re-measured on the Mac on 2026-10-14: the unsplit `coverage` with --max-threads 2 does NOT
# fit 16 GB (stopped at 16.31 GB, about 105 s in), and `coverage-split` fit on 2026-10-14 (its largest group `tests-draw-mask` peaking at 15.89 GB,
# 0.11 GB under the stop, hence the partition above) and crossed the stop on 2026-10-15 (`e2e`, 16.22 GB), so it may not fit: it is still the mode to use, and their VmPeak is unmeasured on Linux. They run on the Mac (P-33, no cap, `time -l`,
# stopped above 16 GB) or in CI, and are refused on Linux unless ALLOW_COVERAGE_SPLIT_ON_LINUX=1 (then 16 GiB, the maximum).
# MEM_CAP_BYTES overrides.
# A capped run with no progress for 15 minutes is stopped and moved, never left waiting.
MEM_CAP_DEFAULT_BYTES=16106127360
MEM_CAP_COVERAGE_SPLIT_BYTES=17179869184
# docs/programme/OPERATIONS.md: builds and measures run single-threaded.
export RAYON_NUM_THREADS=1

mode="${1:-all}"
if [ "$(uname -s)" != Darwin ] && [ "${ALLOW_COVERAGE_SPLIT_ON_LINUX:-}" != 1 ]; then
  case "$mode" in
    coverage-split) echo "coverage-split peaks at 8.4 to 14.6 GB RSS: run it on the Mac (stop above 16 GB) or in CI (set ALLOW_COVERAGE_SPLIT_ON_LINUX=1 to override)"; exit 2 ;;
    coverage|all) echo "$mode peaks above 8 GB RSS: run it on the Mac (stop above 16 GB) or in CI (set ALLOW_COVERAGE_SPLIT_ON_LINUX=1 to override)"; exit 2 ;;
  esac
fi

case "$mode" in
  coverage-split) MEM_CAP_BYTES="${MEM_CAP_BYTES:-$MEM_CAP_COVERAGE_SPLIT_BYTES}" ;;
  *) MEM_CAP_BYTES="${MEM_CAP_BYTES:-$MEM_CAP_DEFAULT_BYTES}" ;;
esac

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
  run_capped snforge test -P coverage --coverage --max-threads 2 2>&1 | grep -iE '^Tests:|maximum resident|coverage'
  lcov="$(pwd)/coverage/coverage.lcov"
  test -s "$lcov" || { echo "no coverage.lcov produced"; exit 1; }
  coverage_table "$lcov"
}

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
    log="$(pwd)/target/coverage-split/$name.log"
    set +e
    # shellcheck disable=SC2086
    run_capped snforge test -P coverage --coverage --max-threads 2 $extra "$filter" > "$log" 2>&1
    status=$?
    set -e
    grep -iE '^Tests:|maximum resident|coverage|error|panicked' "$log" || true
    if [[ "$status" -ne 0 ]]; then
      echo "group $name: snforge exited with status $status (log: $log)"; exit 1
    fi
    grep -qE '^Tests:.* 0 failed' "$log" || { echo "group $name: its Tests: line does not say 0 failed (log: $log)"; exit 1; }
    # A group whose tests are all #[ignore] (tests-walk-cost) runs nothing and writes no lcov: skipped, not failed.
    # `rm -rf coverage` above leaves no lcov of a previous group to be copied by mistake.
    if grep -qE '^Tests:.* 0 passed' "$log" && grep -qE '^Tests:.* [1-9][0-9]* ignored' "$log"; then
      echo "group $name: no runnable test (all ignored), skipped"; continue
    fi
    test -s coverage/coverage.lcov || { echo "no coverage.lcov for group $name"; exit 1; }
    cp coverage/coverage.lcov "target/coverage-split/$name.lcov"
    parts+=("target/coverage-split/$name.lcov")
    echo "group $name: log $log"
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
  check-groups) check_groups ;;
  all) versions; check_setup; gas; coverage ;;
  *) echo "usage: $0 [gas|coverage|coverage-split|check-setup|check-groups|all]"; exit 2 ;;
esac
