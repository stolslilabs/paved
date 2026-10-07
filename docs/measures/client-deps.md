# Client dependencies to current majors on Node 24 (P-8)

Measured on 2026-10-06, on the owner's Mac, with the bench of baselines B and C and of the renderer
step (`docs/measures/client-renderer.md`, PR #194), unchanged: same commands, profiles and run counts.
"Before" is #194's figures; "after" is this step. Track CLIENT, decision P-8.

## Result in one paragraph

Every P-7b target that #194 met is still met, and the two it did not meet are still not met, for
the same reasons (the first transaction signature, and 0.1 % of in-play frames over 1.5 intervals).
At 72 tiles throttled, time to interactive is 742 ms (848 before) and CPU + GPU per frame p95 is
5.60 ms (6.31). Draw calls and triangles are unchanged. The cold `bun install` falls from 12.9 GB and
220-250 s (bun 1.3.1) to 0.21 GB and 13.5 s (bun 1.4.2).
One regression above the spread: in the real Game page, the frame interval p95 rises by 0.6-0.7 ms
(9.2 to 9.8 ms unthrottled, 17.5 to 18.2 ms throttled) and CPU per frame p95 by about 0.5 ms, with no
more frames over 1.5 intervals. A bisect traced it to Tamagui 2.7.7 (see "Bisect: state at stop").

## Versions

Locked versions, from `bun.lock` before (`f6a9807`, #194) and after. "Latest" is npm's `latest` tag
on 2026-10-06.

| Dependency | Before | After | Latest | Behind a major after? |
|---|---|---|---|---|
| Node (engines, CI) | unpinned (runner default) | 24.x | 26.10.0 (Current); 24.21.0 is the Active LTS | no: 24 is the line P-8 asks for, the LTS |
| bun | 1.3.1 | 1.4.2 | 1.4.2 | no |
| turbo | 2.8.10 | 2.11.7 | 2.11.7 | no |
| typescript | 5.9.3 | 7.0.2 | 7.0.2 | no |
| vite | 6.4.1 | 8.3.3 | 8.3.3 | no |
| @vitejs/plugin-react | 4.7.0 | 6.1.2 | 6.1.2 | no |
| vite-plugin-wasm | 3.5.0 | 3.6.0 | 3.6.0 | no |
| vite-plugin-top-level-await | 1.6.0 | removed | 1.6.0 | n/a (see Vite below) |
| vitest | 3.2.4 and 4.0.18 | 5.0.3 | 5.0.3 | no |
| react, react-dom, react-test-renderer | 19.2.4 | 19.3.0 | 19.3.0 | no |
| @types/react, @types/react-dom | 19.2.14, 19.2.3 | 19.3.0 | 19.3.0 | no |
| @types/react-test-renderer | 19.1.0 | 19.3.0 | 19.3.0 | no |
| react-router-dom | 7.13.1 | 7.18.4 | 7.18.4 | no |
| react-native-web | 0.19.13 | 0.21.3 | 0.21.3 | no |
| tamagui, @tamagui/* | 2.0.0-rc.17 | 2.7.7 | 2.7.7 | no |
| three | 0.172.0 | 0.186.1 | 0.186.1 | no |
| @types/three | 0.172.0 | 0.186.0 | 0.186.0 | no |
| starknet | 8.9.2 | 8.9.2 | 10.8.0 | **yes**: held by Dojo (below) |
| @dojoengine/core, sdk, create-burner, torii-client | 1.8.8, 1.9.0, 1.8.10, 1.8.2 | unchanged | 2.0.0 | **yes**: P-8 keeps them |
| zustand | 5.0.11 | 5.0.11 | 5.0.15 | no |
| jsdom | 28.1.0 | 30.1.2 | 30.1.2 | no |
| @testing-library/react | 16.3.2 | 16.3.3 | 16.3.3 | no |
| @testing-library/jest-dom | 6.9.1 | 7.0.1 | 7.0.1 | no |

The majors left behind:
- **`@dojoengine/*`** stays on 1.x by P-8: the track that removes Dojo (P2 of CORE) drops it.
- **starknet** stays on 8: every `@dojoengine/*` 1.x package (and `@starknet-react/core` 5, which
  they pull in) declares `starknet ^8.1.2` as a peer or a dependency. 8.9.2 is the newest 8.x.
  Dojo 2.0.0 moves to starknet 10, so starknet follows Dojo's removal.

`app-native` has no React Native or Expo pin, so nothing there had to match React.

## Breaking changes hit, by family

One commit per family; build and all tests green after each.

- **Node 24.** `engines` `24.x` in the root and every package (as `app/` and `book/` since #193).
  `client.yaml` now sets up Node 24 (`actions/setup-node` v7.0.0, pinned by SHA): `tsc`, `vite` and
  `vitest` run on Node through their bin shebang, and CI used the runner's default Node until now.
- **bun 1.4.2.** `packageManager`, `client.yaml`, the cache key (which now also names Node 24) and
  `packages/README.md`. bun 1.4 reads a lockfile without `configVersion` as version 0, which installs
  with the hoisted linker; 1.3.1 used the isolated one. `bun.lock` carries `configVersion: 1` to keep
  the isolated linker, so nothing else changes.
- **turbo 2.11, TypeScript 7.** TypeScript 7 (the native compiler) builds the six packages with no
  source change. turbo 2.11 writes an "agent guidance" block into `AGENTS.md` before each run when it
  detects an agent; `turbo.json` sets `agentGuidance: false` so a build no longer edits that file.
- **Vite 8, @vitejs/plugin-react 6, vitest 5.**
  - Vite 8 matches aliases by prefix in declaration order: in app-native's vitest config,
    `@paved/renderer` (a file) caught `@paved/renderer/react-native`. The subpath is now listed first.
  - `vite-plugin-top-level-await` requires `rollup` and Vite's esbuild transform, which Vite 8
    (rolldown) no longer installs. With both added as devDependencies its transform still failed
    (94 errors). It only emulated top-level await for targets without it; Vite 8's default build
    target (baseline widely available) has it natively, so the plugin is removed. The comment in
    `vite.bench.config.ts` about its sourcemap damage is updated.
  - The main chunk of `app-web` goes from 2.30 MB (Vite 6) to 1.74 MB minified (441 kB gzip,
    477 before), as the plugin's wrapping is gone.
- **React 19.3, react-native-web 0.21, react-router 7.18, jsdom 30, jest-dom 7.** No change needed.
  Peer ranges of the packages stay `^19.0.0`.
- **Tamagui 2.7.7** (from the release candidate 2.0.0-rc.17): no code change needed, but it carries the
  in-play regression (see "Bisect: state at stop").
- **three 0.186**: no change needed; `__tests__/edges.test.ts` still finds `buildEdgesGeometry` equal to
  three's `EdgesGeometry` on all 19 tile models.
- **starknet**: no bump (above).

## Targets (P-7b)

At 72 tiles on the M2 Max, under CDP CPU throttling 4x and a 60 Hz cadence unless said. Medians of
runs, unless the row says pooled. CPU + GPU per frame is computed from each run's raw `cpuMs` and
`gpuMs` as in #194 (p95 per run, median of the 5 runs); the script reproduces #194's 6.31 and 6.70 ms
from its raw files.

| P-7b target | Before (#194) | After | |
|---|---|---|---|
| CPU + GPU time per frame, p95 <= 16.7 ms | 6.31 ms | **5.60 ms**; worst frame 11.8 ms (12.3) | met |
| No frame over 1.5 intervals: board, camera path | 0.0 % | **0.0 %** | met |
| No frame over 1.5 intervals: in play (Game page) | 0.1 % (0.1-0.1) | **0.1 %** (0.1-0.1) | not met, as before |
| Time to interactive <= 2.0 s, throttled | 848 ms (819-891) | **742 ms** (730-751) | met |
| Time to interactive <= 0.5 s, unthrottled | 238 ms (237-245) | **231 ms** (224-241) | met |
| Click to display p95 <= 50 ms, throttled (pooled, 120 clicks) | 33.6 ms | **34.7 ms** | met |
| No long task > 50 ms per placement, throttled (in play) | 1 per session (56-58 ms) | **1 per session** (50-54 ms), the first signature | not met, as before |
| Draw calls per median frame below baseline B (207) | 137 | **137** | met |
| Triangles per median frame below baseline B (1,695,576) | 735,122 | **735,122** | met |

## Figures

Full tables: `client-deps/summary.md` (board, unthrottled), `client-deps/throttled/summary.md`,
`client-deps/click/summary.md`, `client-deps/play/summary.md`, raw JSON of every run next to them.
Before is `client-renderer/` (#194). Every set in this section ran with Chrome on screen, as #194's.

### Board

| Figure | Before unthrottled 38 / 72 | After unthrottled 38 / 72 | Before throttled 38 / 72 | After throttled 38 / 72 |
|---|---|---|---|---|
| Time to interactive (ms) | 227 / 238 | **215 / 231** | 776 / 848 | **704 / 742** |
| CPU per frame p50 / p95 (ms), 72 | 0.9 / 2.1 | 0.8 / 2.3 | 1.1 / 2.3 | 1.0 / 1.8 |
| GPU per frame p50 / p95 (ms), 72 | 3.50 / 4.76 | 3.58 / 4.83 | 2.46 / 4.34 | 2.39 / 4.20 |
| CPU + GPU per frame p95 (ms), 38 / 72 | 5.04 / 6.70 | 5.40 / 6.37 | 4.58 / 6.31 | 4.88 / 5.60 |
| Draw calls, median frame | 109 / 137 | 109 / 137 | 109 / 137 | 109 / 137 |
| Triangles, median frame | 486,230 / 749,206 | 486,230 / 735,122 | 486,230 / 735,122 | 486,230 / 735,122 |
| Frames over 1.5 intervals (%) | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| Frame interval p95 (ms) | 9.3 / 9.3 | 10.3 / 10.3 | 17.5 / 17.5 | 17.5 / 17.5 |
| JS heap at interactive (MB) | 51.1 / 59.6 | 61.6 / 66.8 | 48.8 / 51.1 | 56.7 / 48.8 |

The 72-tile triangle count of the median frame takes one of two values (735,122 or 749,206) from run
to run in both sets; the medians differ only by that.

### Click to display (`click/`)

| Pooled over 120 placements (ms) | unthrottled 38 | unthrottled 72 | throttled 38 | throttled 72 |
|---|---|---|---|---|
| p50, before -> after | 12.7 -> 14.1 | 12.3 -> 13.9 | 25.8 -> 26.8 | 25.7 -> 25.7 |
| p95, before -> after | 18.7 -> 20.3 | 15.3 -> 17.0 | 35.1 -> 35.2 | 33.6 -> 34.7 |
| p95 per run, median (min-max), before | 18.0 (15.8-19.3) | 14.9 (14.3-21.1) | 35.1 (33.6-37.6) | 33.9 (32.7-34.3) |
| p95 per run, median (min-max), after | 19.4 (18.7-21.1) | 15.2 (15.0-17.1) | 35.0 (34.0-40.8) | 34.7 (33.7-35.1) |
| max, before -> after | 35.3 -> 34.0 | 35.3 -> 35.3 | 65.2 -> 57.4 | 35.0 -> 47.0 |

### In play (`play/`)

| Figure, 72 tiles, real Game page | unthrottled before -> after | throttled before -> after |
|---|---|---|
| Time to interactive (ms) | 332 -> **308** | 1152 -> **1054** |
| Frames over 1.5 intervals (%) | 0.0 -> 0.0 | 0.1 -> 0.1 |
| Frame interval p95 (ms) | 9.2 (9.1-9.2) -> 9.8 (9.8-9.9) | 17.5 (17.5-17.5) -> 18.2 (18.2-18.2) |
| CPU per frame p95, median of runs (ms) | 2.4 -> 2.9 | 2.6 -> 2.8 |
| Long tasks > 50 ms per 60 s session | 0 -> 0 | 1 -> 1 |
| Long tasks, total per session (ms) | 0 -> 0 | 57 -> 52 |
| Confirm key to presented frame p50 / p95, pooled (ms) | 13.9 / 30.8 -> 13.9 / 35.9 | 27.0 / 47.1 -> 24.3 / 45.9 |
| Commit render time p95, pooled (ms) | 5.1 -> 5.2 | 7.2 -> 7.2 |
| Render time per quiet poll p50 / p95 (ms) | 6.0 / 9.4 -> 6.2 / 10.6 | 11.0 / 15.9 -> 11.4 / 17.7 |

## Bisect: state at stop

The bisect was stopped on 2026-10-06 at about 20:35, on the owner's order (the Mac was withdrawn).
Raw runs of every set below are in `client-deps/bisect/`. Each tree is HEAD of this branch with one
family reverted, built and run from a fresh copy (`git archive`) with its own install.

| Set | Chrome | Unthrottled: interval p95 / CPU p95 per run (ms) | Throttled: interval p95 / CPU p95 per run (ms) | Draw calls / triangles, median frame |
|---|---|---|---|---|
| #194 (`client-renderer/play`) | on screen | 9.1, 9.2, 9.2 / 2.4, 2.3, 2.4 | 17.5, 17.5, 17.5 / 2.6, 2.7, 2.5 | 178-179 / 847,600-853,498 |
| After, all bumps (`client-deps/play`) | on screen | 9.9, 9.8, 9.8 / 2.9, 3.1, 2.9 | 18.2, 18.2, 18.2 / 2.9, 2.8, 2.8 | 178-179 / 847,600-853,498 |
| Control: main `f6a9807`, same session (`bisect/control-main-play`) | on screen | 9.1, 9.2, 9.1 / 2.4, 2.4, 2.5 | 17.5, 17.5, 17.5 / 3.7, 3.5, 3.8 | 178-179 / 847,600-853,514 |
| T1: HEAD with Tamagui back to 2.0.0-rc.17 (`bisect/t1-tamagui-rc17-play`) | on screen | 9.0, 9.1, 9.1 / 2.4, 2.5, 2.5 | 17.5, 17.5, 17.5 / 3.7, 3.6, 3.5 | 178-179 / 847,600-853,514 |
| Control: main, throttled only (`bisect/control-main-play-offscreen`) | off screen | not run | 17.5, 25.0, 17.5 / 3.7, 11.8, 3.0 | 178 / 847,600-853,386 |

- **Tamagui 2.7.7 is the source of the in-play regression.** Reverting it alone to 2.0.0-rc.17, with
  every other bump kept, gives back #194's interval (9.1 / 17.5 ms) and CPU per frame (2.4-2.5 ms
  unthrottled). The cause inside Tamagui is not found.
- **Draw calls and triangles are flat across every set**, board and play: no family raises them.
  Board, median frame, 38 / 72 tiles: 109 / 137 draw calls and 486,230 / 735,122-749,206 triangles in
  #194, after, and the main control (`bisect/control-main-board`, on screen). The 72-tile triangle
  count takes one of two values from run to run in every set.
- The board's unthrottled interval p95 (9.3 to 10.3 ms) is not a regression: the same-session main
  control reads 10.3 / 9.3 ms (38 / 72), so it moves with the display's cadence between sessions.
- **Families tested:** Tamagui (T1, finished on screen). **Not finished:** T2, HEAD with React 19.2.4
  and react-native-web 0.19.13 (stopped on screen when the off-screen rule came in, then not
  re-run). **Not tested alone:** Vite 8 / vitest 5, TypeScript 7 and turbo, bun 1.4, three 0.186; the
  board bench, which they would also affect, shows no regression.
- **Off-screen confirmation, not finished.** The driver gained `--offscreen` (window at x = -10000,
  headed, GPU kept; `machine.json` records `"window"`). Off screen the window is on no display and
  runs at 60 Hz, so only throttled figures compare with on-screen ones. Done: the main control. Its
  second run was disturbed (interval p95 25 ms, 3.4 % of frames over 1.5 intervals), so the set needs
  a rerun. Not done: T1, T2 and HEAD off screen.

What remains to measure, off screen, throttled in-play (`bun run bench --play --profiles throttled
--offscreen`): main, T1, T2 and HEAD, in one session; then decide whether Tamagui stays on 2.7.7.

Chrome placement of the other sets: the board, throttled board, click and play figures of "after"
above, #194's, and the controls were all on screen.

## Bisect: stopped again on 2026-10-07

Stopped on the owner's order: Chrome windows showed on the Mac although the driver ran with
`--offscreen`. No browser was started after the order. Arms were built from `origin/main` (c40372af) in
fresh `git archive` copies under `/tmp`, bun 1.4.2 (install 0.19 GB).

| Arm | State | Chrome | Raw |
|---|---|---|---|
| HEAD as is (Tamagui 2.7.7, React 19.3.0, react-native-web 0.21.3) | finished: throttled, 3 runs, 8/8 placements each | `--offscreen` (windows seen on screen: figures to be treated as not comparable until the window problem is solved) | `client-deps/bisect/head-play-offscreen/` |
| T1 (Tamagui 2.0.0-rc.17) | built and installed; run killed at the order, no figure | | none |
| T2 (React 19.2.4, react-native-web 0.19.13, by root `overrides`) | built and installed, not run | | none |
| main (dependency state of f6a9807 on today's code) | built and installed, not run | | none |

HEAD, throttled in play, 3 runs: interval p95 17.60 ms (17.50-17.60), long tasks 1 per session (55-60 ms),
commit render time p95 8.5 ms, confirm to presented p50 / p95 24.8 / 42.2 ms, TTI 1262 ms.
Peak memory of the whole bench run (`/usr/bin/time -l`, largest process): 0.71 GB, 252 s.
The unthrottled board, main and HEAD, was not run. The conclusion on Tamagui 2.7.7 is still open.

## Build and install

`packages/README.md`, measured with `/usr/bin/time -l` in a fresh copy of the tree and an empty bun
cache:

| Step | Before (bun 1.3.1, TS 5.9, Vite 6) | After (bun 1.4.2, TS 7, Vite 8) |
|---|---|---|
| Cold `bun install --frozen-lockfile` | 12.9 GB, 220.9 s (this worktree, 2026-10-06) | 0.21 GB, 13.5 s |
| `bun run build --force`, 6 packages | 2.0 GB, 10.1 s (#188's figure) | 0.84 GB, 2.7 s |

## Machine and load

The machine of #194: Mac14,6, Apple M2 Max, 64 GB, macOS 27.0.1 (26A434), on AC power, Chrome
154.0.8037.98, window 1440 x 900 on the built-in 120 Hz display, a desktop session in normal use.
The bench ran from a fresh copy of this branch (`git archive`) with its own `node_modules`, so no
module left over from an older install could be picked up. The 1-minute load average after the runs
is in each summary (1.3-2.5 for click and play).

## Rerun

```sh
cd packages/app-web
bun run bench --out ../../docs/measures/client-deps
bun run bench --profiles throttled --out ../../docs/measures/client-deps/throttled
bun run bench --click --out ../../docs/measures/client-deps/click
bun run bench --play --out ../../docs/measures/client-deps/play
```

## Limits

- One machine, as in B, C and #194. Before and after are from different hours of the same day.
- No new parity screenshots are committed. The renderer code did not change; three moved 14 minor
  versions, and its edge test still matches.
