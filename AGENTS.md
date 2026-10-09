# Agent Notes

- `app/` is deprecated and kept purely for reference.
- Active development should target the packages-based stack (`packages/app-web`, `packages/renderer`, `packages/ui`, `packages/chain`, `packages/game-core`).

## How tests are scoped

A thread runs locally only the tests of the parts it touched, never the whole suite at each step. The
whole suite is the CI's job on the pull request, gated by paths. Pre-push hooks stay minimal.

| Part | Local test command | Peak memory |
|---|---|---|
| Contracts (`contracts/`, package `paved`, toolchain pinned by `.tool-versions`) | `snforge test <filter>` with the module path of what changed, e.g. `snforge test paved::types::` | Measure first: `prlimit --as=12884901888 -- /usr/bin/time -v snforge test <filter>` (12 GiB cap) |
| Client package `@paved/game-core`, `@paved/chain`, `@paved/renderer`, `@paved/ui`, `@paved/app-web`, `@paved/app-native` | `bun run test --filter <package>` | Measure first |

Exceptions, all in the contracts:

- **Golden-game generation**: one game per run. An unbounded run took 13.7 GB RSS on 2026-10-06
  (observed, not a capped measure).
- **Gas-trace runs** (`--trace-components`): observed at 3.3 GB RSS, also not a capped measure. Measure
  first.

Memory figures and the VPS/Mac rule:

- The `snforge test` build of `contracts/` peaked at about 8.0 GB RSS (7.99 GB measured on main 144521b,
  with OpenZeppelin) before the code-location debug info left the dev profile; it now peaks at about
  5.6 GB (5.56 GB, 5.57 GB on `snforge test paved::types::`). A plain `scarb build` peaks at about 5.0 GB
  (4.96 GB). The cap for a snforge run is `prlimit --as=12884901888` (12 GiB).
- Coverage runs use `snforge test -P coverage` (`scripts/measure.sh coverage*`), which keeps the
  code-location flag and its cost.
- A Cairo run whose measured peak RSS is under about 8 GB may run on the VPS under `--as` = 1.5x its
  measured peak, rounded up, at most 16 GiB. A peak above about 8 GB goes to the Mac. Every peak is
  measured first.
