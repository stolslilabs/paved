# Agent Notes

- `app/` is deprecated and kept purely for reference.
- Active development should target the packages-based stack (`packages/app-web`, `packages/renderer`, `packages/ui`, `packages/chain`, `packages/game-core`).

## How tests are scoped

A thread runs locally only the tests of the parts it touched, never the whole suite at each step. The
whole suite is the CI's job on the pull request, gated by paths. Pre-push hooks stay minimal.

| Part | Local test command | Peak memory |
|---|---|---|
| Contracts (`contracts/`, package `paved`, toolchain pinned by `.tool-versions`) | `snforge test <filter>` with the module path of what changed, e.g. `snforge test paved::types::` | Measure first. Linux: `prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter>` (15 GiB cap, from VmPeak). macOS: `/usr/bin/time -l snforge test <filter>`, no cap (see "On the Mac (P-33)") |
| Client package `@paved/game-core`, `@paved/chain`, `@paved/renderer`, `@paved/ui`, `@paved/app-web`, `@paved/app-native`, `@paved/indexer` | `bun run test --filter <package>` | Node: see "Node test peaks" below. Cap: `NODE_OPTIONS=--max-old-space-size=<MB>`, never `prlimit --as` |

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
| `@paved/app-web` | 1,024,844 kB (1,000.8 MiB) | 1536 |
| `@paved/app-native` | 152,740 kB (149.2 MiB) | 256 |
| `@paved/indexer` | 240,220 kB (234.6 MiB) | 384 |

Example: `NODE_OPTIONS=--max-old-space-size=1536 bun run test --filter @paved/app-web`. Re-measure when a
package's tests change a lot.

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

  The test build is compiled by a scarb child of snforge and is the largest address space of any snforge run
  that has to rebuild; the whole run measured above found a warm build (its scarb child peaked at 4.6 GB). So
  every `snforge test` run, whatever its filter, takes the 15 GiB cap of the `types` row. The earlier RSS
  figures (7.99 GB before the debug info left the dev profile; about 5.6 GB, then 4.96 GB for `scarb build`)
  are superseded for sizing by the table.
- Coverage runs use `snforge test -P coverage` (`scripts/measure.sh coverage*`), which keeps the
  code-location flag and its cost. The `types` group of `coverage-split` peaked at 9,123,164 kB RSS from
  `time -v` (KiB: 9.34 GB, 8.70 GiB; VPS, 2026-10-10). That RSS alone is above the Mac threshold, so its VmPeak
  is unmeasured on Linux and not to be measured on the VPS. Rule: `coverage-split` runs only on the Mac (P-33,
  `/usr/bin/time -l`, no cap) or in CI; `scripts/measure.sh` refuses it on Linux unless
  `ALLOW_COVERAGE_SPLIT_ON_LINUX=1` is set (then its cap is 16 GiB, the maximum). `coverage` (the whole run) and
  `all` have no measured peak, expected above 8 GB RSS: measure them first on the Mac or in CI.
- A Cairo run whose measured peak RSS is under about 8 GB may run on the VPS under the cap above, with every
  VmPeak measured first. A capped run with no progress for 15 minutes is stopped and moved (Mac or CI), never
  left waiting: it must not hold the heavy lock.
- Node runs are unchanged: heap caps, never `prlimit --as`.

On the Mac (P-33)") |
| Client package `@paved/game-core`, `@paved/chain`, `@paved/renderer`, `@paved/ui`, `@paved/app-web`, `@paved/app-native`, `@paved/indexer` | `bun run test --filter <package>` | Node: see "Node test peaks" below. Cap: `NODE_OPTIONS=--max-old-space-size=<MB>`, never `prlimit --as` |

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
| `@paved/app-web` | 1,024,844 kB (1,000.8 MiB) | 1536 |
| `@paved/app-native` | 152,740 kB (149.2 MiB) | 256 |
| `@paved/indexer` | 240,220 kB (234.6 MiB) | 384 |

Example: `NODE_OPTIONS=--max-old-space-size=1536 bun run test --filter @paved/app-web`. Re-measure when a
package's tests change a lot.

Memory figures and the VPS/Mac rule:

- The `snforge test` build of `contracts/` peaked at about 8.0 GB RSS (7.99 GB measured on main 144521b,
  with OpenZeppelin) before the code-location debug info left the dev profile; it now peaks at about
  5.6 GB (5.56 GB, 5.57 GB on `snforge test paved::types::`). A plain `scarb build` peaks at about 5.0 GB
  (4.96 GB); 1.5x is 7.44 GB, under the 8 GiB floor, so its cap is `prlimit --as=8589934592` (8 GiB). The cap for a
  snforge run is `prlimit --as=12884901888` (12 GiB).
- Coverage runs use `snforge test -P coverage` (`scripts/measure.sh coverage*`), which keeps the
  code-location flag and its cost. The `types` group of `coverage-split` peaked at 9,123,164 kB from
  `time -v` (KiB: 9.34 GB, 8.70 GiB; VPS, 2026-10-10), so above about 8 GB it runs on the Mac or in CI,
  not on the VPS while agents work there (memory rule). On macOS it is measured with `/usr/bin/time -l`
  and no cap (P-33). The default cap of `scripts/measure.sh coverage-split` is 14 GiB (1.5x that peak,
  14.0 GB or 13.05 GiB, rounded up); `MEM_CAP_BYTES` overrides it. `coverage` (the whole run) and `all`
  have no measured peak, expected above 8 GB, and keep the 8 GiB default: measure them first on the Mac
  (P-33, `/usr/bin/time -l`, no cap) or in CI before giving them a cap.
- A Cairo run whose measured peak RSS is under about 8 GB may run on the VPS under `--as` = 1.5x its
  measured peak, rounded up, at most 16 GiB and never below 8 GiB. A peak above about 8 GB goes to the Mac. Every peak is
  measured first.

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
