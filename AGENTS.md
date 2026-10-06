# Agent Notes

- `app/` is deprecated and kept purely for reference.
- Active development should target the packages-based stack (`packages/app-web`, `packages/renderer`, `packages/ui`, `packages/chain`, `packages/game-core`).

## How tests are scoped

A thread runs locally only the tests of the parts it touched, never the whole suite at each step. The
whole suite is the CI's job on the pull request, gated by paths. Pre-push hooks stay minimal.

| Part | Local test command | Peak memory |
|---|---|---|
| Contracts (`contracts/`, package `paved`, toolchain pinned by `.tool-versions`) | `snforge test <filter>` with the module path of what changed, e.g. `snforge test paved::types::` | Measure first: `prlimit --as=8589934592 -- /usr/bin/time -v snforge test <filter>` |
| Client package `@paved/game-core`, `@paved/chain`, `@paved/renderer`, `@paved/ui`, `@paved/app-web`, `@paved/app-native` | `bun run test --filter <package>` | Measure first |

Exceptions, all in the contracts:

- **Golden-game generation**: one game per run. An unbounded run took 13.7 GB RSS on 2026-10-06
  (observed, not a capped measure).
- **Gas-trace runs** (`--trace-components`): observed at 3.3 GB RSS, also not a capped measure. Measure
  first.
