# Agent Notes

- The deprecated `app/` client and `packages/app-native` were removed in #591 (see git history).
- Active development should target the packages-based stack (`packages/app`, `packages/renderer`, `packages/ui`, `packages/chain`, `packages/game-core`).

## How tests are scoped

A thread runs locally only the tests of the parts it touched, never the whole suite at each step. The
whole suite is the CI's job on the pull request, gated by paths. Pre-push hooks stay minimal.

| Part | Local test command | Peak memory |
|---|---|---|
| Contracts (`contracts/`, package `paved`, toolchain pinned by `.tool-versions`) | `snforge test <filter>` with the module path of what changed, e.g. `snforge test paved::types::` | Measure first. Linux: `prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter>` (15 GiB cap, from VmPeak). macOS: `/usr/bin/time -l snforge test <filter>`, no cap (see "On the Mac (P-33)") |
| Client package `@paved/game-core`, `@paved/chain`, `@paved/renderer`, `@paved/ui`, `@paved/app`, `@paved/indexer` | `bun run test --filter <package>` | Node: see "Node test peaks" below. Cap: `NODE_OPTIONS=--max-old-space-size=<MB>`, never `prlimit --as` |

**Slow profile for a loaded machine.** `PAVED_TEST_SLOW` multiplies every wait ceiling of `@paved/app`'s tests (the vitest
`testTimeout`, Testing Library's `asyncUtilTimeout`, each explicit `{ timeout }` and per-test timeout of the load-bound route
files, through `slow()` of `packages/app/test-slow.ts`): unset is 1 (CI, a quiet machine), `1` is 3, any other number is the factor.
`bun run check` sets it to `1` by itself when the 1-minute load average passes the core count (never in CI), keeps a value you
set (`PAVED_TEST_SLOW=0` forces it off), and prints which. By hand: `PAVED_TEST_SLOW=1 NODE_OPTIONS=--max-old-space-size=1536 bun run test --filter @paved/app`.
A ceiling costs a passing test nothing (it returns as soon as its state is there), so a test given one states a measure, not a guess.
Under the profile (and only there) a failed test runs once more (vitest `retry: 1`): a stall that outlasts a scaled ceiling passes the
second time, a real failure fails both.

The Training Playwright e2e and its CI job `e2e` left with app-web (removed in P-70; see git history).

Exceptions, all in the contracts:

- **Golden-game generation**: one game per run. An unbounded run took 13.7 GB RSS on 2026-10-06
  (observed, not a capped measure).
- **Gas-trace runs** (`--trace-components`): observed at 3.3 GB RSS, also not a capped measure. Measure
  first.

Node test peaks (VPS, 2026-10-10, bun 1.4.2, Node v24.21.0, vitest; after `bun install --frozen-lockfile` and one
`bun run build`, so no cold build in the figures):

- **Rule**: V8 reserves a large address space, and Node aborts at about 265 MB resident under
  `prlimit --as=8 GiB`. So a Node/V8 run is capped by its heap, `NODE_OPTIONS=--max-old-space-size=<MB>`, set
  to 1.5x the measured peak (`/usr/bin/time -v`), rounded up to 64 MB. Never `prlimit --as` for Node. Cairo
  runs keep their address-space cap (`prlimit --as`, figures below). The Mac keeps `/usr/bin/time -l`, no cap.
- **Method**: `NODE_OPTIONS=--max-old-space-size=4096 /usr/bin/time -v bun run test --filter <package> --force`,
  one package at a time, run twice, larger "Maximum resident set size" kept. `--force` is needed: without it
  turbo replays the cached test run on the second pass and the figure is that of turbo alone (about 95 MB).
  `/usr/bin/time` reports the largest process of the tree (not the sum of the processes).

| Package | Peak RSS (largest process) | Heap cap `--max-old-space-size` |
|---|---|---|
| `@paved/game-core` | 224,944 kB (219.7 MiB) | 384 |
| `@paved/chain` | 283,472 kB (276.8 MiB) | 448 |
| `@paved/renderer` | 233,404 kB (227.9 MiB) | 384 |
| `@paved/ui` | 237,084 kB (231.5 MiB) | 384 |
| `@paved/app` | 952,816 kB (930.5 MiB) | 1536 |
| `@paved/indexer` | 240,220 kB (234.6 MiB) | 384 |

`@paved/app` row (2026-10-16, bun 1.4.2, commit 31314d94): measured with
`NODE_OPTIONS=--max-old-space-size=4096 /usr/bin/time -v bun run test --filter @paved/app --force`, run twice (943,948 and
952,816 kB, the larger kept). 1.5x the peak, rounded up to 64 MB, is 1472; the PM's 1536 is kept (PM, 2026-10-16). Both runs
were under heavy load, and one to two timeout-bound tests failed in each (not the same ones); the peak is that of those runs.

Example: `NODE_OPTIONS=--max-old-space-size=1536 bun run test --filter @paved/app`. Re-measure when a
package's tests change a lot.

Client production build (Sepolia, VPS, 2026-10-11, commit 1235607): peak RSS 1.06 GB, 8 s; measured by the owner.

Memory figures and the VPS/Mac rule:

- **Cairo caps come from VmPeak (D-251).** `prlimit --as` caps address space, so the figure that sizes a
  cap is VmPeak, not RSS. In Grim World snforge showed VmPeak 6.97 GB against 3.6 GB RSS. Cap = 1.5x the
  VmPeak of the largest process of the run, rounded up to a whole GiB, never below 8 GiB, at most 16 GiB.
  RSS (VmHWM) stays the figure that sends a run to the Mac: above about 8 GB RSS it does not run on the VPS
  while agents work there. If 1.5x VmPeak exceeds 16 GiB, the run goes to the Mac or CI.
- Measured on the VPS (2026-10-10, scarb 2.20.1, snforge 0.64.0, `RAYON_NUM_THREADS=1`, one run at a time under
  `prlimit --as=17179869184`, `/proc/<pid>/status` of every process of the tree sampled each second, the largest
  process kept; main e99377e):

  | Run | Largest process | VmPeak | VmHWM (RSS peak) | Cap (1.5x VmPeak, whole GiB) |
  |---|---|---|---|---|
  | `scarb build` | scarb | 7,713,076 kB (7.36 GiB) | 3,585,088 kB (3.42 GiB) | 12 GiB (`--as=12884901888`) |
  | `snforge test paved::types::` | scarb (test build, child of snforge) | 10,374,784 kB (9.89 GiB) | 6,269,668 kB (5.98 GiB) | 15 GiB (`--as=16106127360`) |
  | `snforge test --max-threads 2` (whole) | snforge | 8,019,820 kB (7.65 GiB) | 4,604,864 kB (4.39 GiB) | 12 GiB; use 15 GiB (see below) |
  | `snforge test paved::types::`, cold (`scarb clean` first) | scarb (test build) | 9,326,232 kB (8.89 GiB) | 6,180,908 kB (5.90 GiB) | 14 GiB |

  The test build is compiled by a scarb child of snforge and is the largest address space of any snforge run
  that has to rebuild; the whole run measured above found a warm build (its scarb child peaked at 4.6 GB), and the
  cold rebuild after `scarb clean` peaked at 9.33 GB (14 GiB). So every `snforge test` run, whatever its filter,
  takes the 15 GiB cap of the highest `types` row (10.37 GB). The earlier RSS
  figures (7.99 GB before the debug info left the dev profile; about 5.6 GB, then 4.96 GB for `scarb build`)
  are superseded for sizing by the table.
- Coverage runs use `snforge test -P coverage` (`scripts/measure.sh coverage*`), which keeps the
  code-location flag and its cost. Measured on the Mac (`/usr/bin/time -l`, 2026-10-14, `docs/measures/coverage.md`,
  "Peaks"): the groups of `coverage-split` peak at 8.4 to 14.6 GB RSS (largest: `e2e` 14.64 GB, `tests-draw-mask`
  13.99 GB); the unsplit `coverage` with default threads reached 18.5 GB and was stopped, so it now passes
  `--max-threads 2` like the groups. Re-measured on the Mac on 2026-10-14: the unsplit `coverage` with `--max-threads 2`
  does NOT fit 16 GB (stopped at 16.31 GB, about 105 s in); `coverage-split` fits, but its largest group, `tests-draw-mask`,
  peaked at 15.89 GB, 0.11 GB under the stop, so that group now runs in three partitions (measured on 2026-10-15: 5, 6 and 5 tests, the parts peak at
  15.35 to 15.36 GB, within this run's range of other groups (14.00 to 15.47 GB), near its top; the whole group was not re-run, so the partition's effect is not measured). `coverage-split` fit on 2026-10-14
  and crossed the 16 GB stop on 2026-10-15 (`e2e`, 16.22 GB), so it may not fit on the Mac, see coverage.md; it is still the mode to use. Rule: coverage runs (`coverage-split`, `coverage`, `all`)
  go on the Mac (P-33, no cap) under a 16 GB stop: stop the run above it and report. Or in CI. `scripts/measure.sh`
  refuses them on Linux unless `ALLOW_COVERAGE_SPLIT_ON_LINUX=1` is set (then its cap is 16 GiB, the maximum).
  `measure.sh check-groups` builds nothing and fails when a test module is in no group. `gas` keeps its measured cap.
  `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only (for `scripts/test-deploy-url.sh`): a thread
  never points them at real binaries to get past the shim guard.
- A Cairo run whose measured peak RSS is under about 8 GB may run on the VPS under the cap above, with every
  VmPeak measured first. A capped run with no progress for 15 minutes is stopped and moved (Mac or CI), never
  left waiting: it must not hold the heavy lock.
- Node runs are unchanged: heap caps, never `prlimit --as`.

On the Mac (P-33, organisation rule set by the Overseer on 2026-10-09 from the PM's ruling for Paved):

- macOS has no `prlimit`, and `ulimit -v` does not limit memory. A Cairo build or test run on the Mac
  has no address-space cap.
- Measure every Cairo build or test run with `/usr/bin/time -l`. The peak is the line "maximum resident
  set size", in bytes.
- If a run's peak passes 16 GB, stop it and report.
- Paved runs at most 2 heavy Cairo runs at once on the Mac. The organisation runs at most 4 across
  programmes. Read `machine-capacity mac` before starting one.
- Record the peak in each PR.
- Committed figures stay measured on Linux (CI or VPS): gas, pins, baselines.

## Before you push

- `check-run -- bun run check` (alias `check:pr`) mirrors the CI's fast jobs on what the branch touches since its merge base with
  `origin/main`: the contracts' format (`scarb fmt --check`, skipped when scarb is absent), lint, typecheck, the guard tests, the
  unit tests of the touched packages and their dependents (heap caps of the table above), the Vercel builds of the projects whose
  inputs changed (Sepolia env), and `bun run budget` (limit, measured size, margin). Its last line is the summary. A CORE change of
  `contracts/abis` or `contracts/deployments` runs the indexer's, chain's and game-core's tests: most failed CI jobs came from there.
- `check-run -- bun run check:quick` (`check.mts --quick`, about 3 minutes on a quiet machine) runs the format, lint, typecheck and
  guard tests as above, the whole unit tests of the touched packages other than the app, and of the app only the tests that import
  a changed file directly (a barrel such as `src/data/index.ts` is seen through) plus the changed tests; the app's whole suite when
  its test setup (`vitest.config.ts`, `vitest.setup.ts`, `test-slow.ts`, `package.json`, `tsconfig.json`) or a root file every
  package reads changed. It skips the dependents' tests, the Vercel builds, the budget and the Storybook build; the full check and
  the CI keep all of them. The quick check is enough between steps and before finishing a change that stays within source files
  with their own tests (a component, a hook, a rule and its tests). The full check is due before the pull request and whenever
  the change reaches what the quick check skips: a shared module many files import (the app's `App.tsx`, the router, the data
  layer's sources), a workspace package the app depends on (game-core, chain, renderer, ui), the client's or the Storybook's
  build (stories, `vite.config.ts`, `.storybook/`, `public/`, a new dependency), or the bundle's size.
- One `check` at a time per worktree (the pre-push run included): its builds write shared folders (`packages/app/storybook-static`, `dist`), so a second run clobbers the
  first. A lock in the worktree's git dir makes the second run exit 1 at once, naming the pid of the first. To wait, poll that pid
  (`while kill -0 <pid> 2>/dev/null; do sleep 5; done`); never `pgrep -f check-run`, whose pattern matches its own shell.
- The pre-push hook `.githooks/pre-push` runs the cheap part (format, typecheck, guard tests of the touched packages); a clone turns it
  on with `git config core.hooksPath .githooks`. Skip once with `PAVED_SKIP_PREPUSH=1 git push`. A missing tool lets the push through.

## Skills

Agent skills follow the Overseer's ruling (2026-10-14):

- **Where.** A skill lives in this repository, at project level: `.claude/skills/<name>/SKILL.md` and its
  files. It loads for every session in a clone of the repository, on the VPS and on the Mac. Nothing goes at
  user or machine level: no `~/.claude`, no plugin, no marketplace, no settings file.
- **How one is added.** By a reviewed pull request of the track that needs it. The pull request names the
  skill's source: the URL and the exact version or commit it was taken from, or "written by <track>". A
  script a skill carries is committed as a repository script and reviewed as one.
- **Prefer small.** A skill written or trimmed by the thread is preferred to a large import: keep what the
  repository uses, drop the rest, and say in the pull request what was dropped.
- **The review rule.** A downloaded skill is third-party text that instructs agents. The review reads its
  whole text (`SKILL.md` and every file it carries) as a rule, and refuses anything that grants a
  permission (an `allowed-tools` line included), retries a refused command, speaks to another session, or
  fetches and runs code (a `!` command, a `npx <pkg>@latest`, a remote file read as instructions). Such a
  part is trimmed before the skill is added, never accepted as is.
