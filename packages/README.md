# Packages

The active client stack: `game-core`, `chain`, `renderer`, `ui`, `app-web`, `app-native` (dormant: it
builds and its tests run, but it is not developed). `app/` is deprecated.

## Build and test

Bun is pinned to **1.3.1** (`packageManager` in the root `package.json`, and in
`.github/workflows/client.yaml`). Turbo orchestrates the packages.

```sh
bun install --frozen-lockfile   # CI form; plain `bun install` to update bun.lock
bun run build                   # all packages (tsc -b; app-web also runs vite build)
bun run test                    # all packages (vitest run); the build runs first
bun run test --filter @paved/renderer   # one package, as AGENTS.md scopes local runs
```

Measured on 2026-10-06, Apple Silicon Mac (macOS, arm64), bun 1.3.1, turbo 2.8.10, with
`/usr/bin/time -l` (maximum resident set size, the largest process of the run):

| Step | Peak memory | Wall time |
|---|---|---|
| `bun install` (cold, 1524 packages) | 12.9 GB | 250 s |
| `bun run build` (cold, without app-native) | 1.9 GB | 9.6 s |
| `bun run test` (after build, 5 packages cached) | 0.2 GB | 3.4 s |

The cold install's peak is large: do not run it on a small machine. Warm builds hit the turbo cache.

CI: the `client` check of `.github/workflows/client.yaml` runs install, build and tests when
`packages/**`, the root package files, `turbo.json`, `tsconfig*.json` or the workflow change.
