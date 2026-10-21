# Hosting the Storybook

Dated 2026-10-14, rewritten 2026-10-17 (P-76). F5 of Client v2 (`docs/client/v2-architecture.md`, section 4.2). The Storybook of
`packages/app` is served at `https://storybook.paved.bal7hazar.com`, a static site: fixtures only, no secret, no RPC URL, no
controller. Until 2026-10-17 the VPS served the client and the Storybook (see git history).

## Vercel

The Storybook is published by Vercel, from the `paved-storybook` project (settings in the root `vercel.json`; the three projects
are in `docs/client/f-release.md`, "Vercel"):

- **Production** is a deployment of `main` on every merge, at `https://paved-storybook.vercel.app` and
  `https://storybook.paved.bal7hazar.com`.
- **Previews:** on demand only, with the label `preview` on a pull request (`f-release.md`, "Vercel", "Previews, on demand").
- **Build:** `bun run build --filter @paved/app^...` (the stories import `@paved/renderer/react`, which a fresh checkout has not
  built), then `build-storybook` with a 3072 MB heap (`NODE_OPTIONS=--max-old-space-size=3072`; no measured peak, the value is
  the one the project has always used); it serves `packages/app/storybook-static`.
- **Ignore step (GUARDS, P-71):** `scripts/vercel/ignore-build.sh storybook` builds a deployment only when one of the Storybook's
  inputs changed (list in `f-release.md`); on any doubt it builds. `bun run check` runs the same build locally
  (`node scripts/check/vercel-build.mts storybook`).
- **Headers:** `no-cache` on `index.html`, `iframe.html`, `index.json` and `project.json`; hashed `assets/*` are
  `public, max-age=31536000, immutable`. There is no Content-Security-Policy: the preview iframe is same origin.
- **Domain and DNS** are the owner's; no agent adds or deletes them.

To build it locally: `bun run build --filter '@paved/app^...'`, then `bun run --filter @paved/app build-storybook`; the output is
`packages/app/storybook-static/` (ignored by git).
