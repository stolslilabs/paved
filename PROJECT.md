# Paved

## How tests are scoped

A thread runs locally only the tests of the parts it touched, never the whole suite at each step. The
whole suite is the CI's job on the pull request, gated by paths. Pre-push hooks stay minimal.

- **Contracts** (one Scarb package `paved`, toolchain pinned by `.tool-versions`): run
  `snforge test <filter>` from `contracts/`, with the module path of what changed, for example
  `snforge test paved::types::` or `snforge test golden`.
- **Client** (bun + turbo monorepo): run `bun run test --filter <package>` with the turbo filter of the
  package touched, for example `bun run test --filter @paved/game-core`. The packages are
  `@paved/app-native`, `@paved/app-web`, `@paved/chain`, `@paved/game-core`, `@paved/renderer` and
  `@paved/ui`.
