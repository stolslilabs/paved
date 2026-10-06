# Packages

The active client stack: `game-core`, `chain`, `renderer`, `ui`, `app-web`, `app-native` (dormant: it
builds and its tests run, but it is not developed). `app/` is deprecated.

## Build and test

Node 24 (`engines` in every `package.json`; CI sets it up, since `tsc`, `vite` and `vitest` run on
Node). Bun is pinned to **1.4.2** (`packageManager` in the root `package.json`, and in
`.github/workflows/client.yaml`). `bun.lock` carries `configVersion` 1, which keeps the isolated linker:
without it bun 1.4 installs hoisted. Turbo orchestrates the packages; `agentGuidance` is off in
`turbo.json`, else turbo 2.11 writes a block into `AGENTS.md` on each run.

```sh
bun install --frozen-lockfile   # CI form; plain `bun install` to update bun.lock
bun run build                   # all packages (tsc -b; app-web also runs vite build)
bun run test                    # all packages (vitest run); the build runs first
bun run test --filter @paved/renderer   # one package, as AGENTS.md scopes local runs
```

Measured on 2026-10-06, Apple Silicon Mac (macOS, arm64), Node 24.21.0, bun 1.4.2, turbo 2.11.7,
TypeScript 7.0.2, Vite 8.3.3, in a fresh copy of the tree with an empty bun cache, with
`/usr/bin/time -l` (maximum resident set size, the largest process of the run):

| Step | Peak memory | Wall time |
|---|---|---|
| `bun install --frozen-lockfile` (cold, empty cache, 720 packages) | 0.21 GB | 13.5 s |
| `bun run build --force` (all 6 packages) | 0.84 GB | 2.7 s |
| `bun run test` (no cache: builds, then tests the 6 packages) | 0.84 GB | 2.7 s |

On bun 1.3.1 the same cold install took 12.9 GB and 220-250 s (measured twice on 2026-10-06), and the
build 2.0 GB and 10.1 s on TypeScript 5.9 and Vite 6. Warm builds hit the turbo cache.

CI: the `client` check of `.github/workflows/client.yaml` runs install, build and tests when
`packages/**`, the root package files, `turbo.json`, `tsconfig*.json` or the workflow change.
