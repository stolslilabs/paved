# @paved/app

Client v2: the app of `docs/client/v2-architecture.md`.
Vite 8, React 19, TypeScript strict, Tailwind v4, React Router 7, TanStack Query, zustand, Motion.

F1 is the scaffold: the token file (`src/styles/theme.css`, section 2.2), the self-hosted fonts, the route
map of section 6.1 as empty placeholder pages, a placeholder shell with the five bottom tabs, and the state
owners of section 3.3 (no chain access yet). Everything else comes with its phase (section 12).

```sh
bun install --frozen-lockfile        # from the repository root
bun run --filter @paved/app dev      # Vite on http://localhost:5174
bun run build --filter @paved/app    # tsc, then vite build into dist/
bun run test --filter @paved/app     # Vitest + Testing Library (jsdom)
bun run --filter @paved/app storybook        # Storybook on http://localhost:6006
bun run --filter @paved/app build-storybook  # a static site in storybook-static/ (git-ignored)
bun run --filter @paved/app wrap-sweep       # every story at 360 and 320 px, headless: text that overflows, is cut or is split
bun run --filter @paved/app e2e              # the Training battle test: a bot plays full games in headless Chromium
```

The Training battle test (`e2e/`, P-79) starts a Vite dev server with no chain (or uses `PAVED_E2E_URL`), opens
`/training` in headless Chromium with WebGL off, so the board is the plan view whose slots are buttons, and plays: full
games with Play again between them, a resume after reloads, a surrender. Every move, the tile in hand, the slots and
rotations offered and the preview are checked against the engine's replay of the save (`replayTraining`). It needs the
workspace packages built (`bun run build --filter='@paved/app^...'`) and the browser of the wrap sweep. Options:
`PAVED_E2E_GAMES` (full games, default 2), `PAVED_E2E_SEED` with `PAVED_E2E_FROM` (replay a game from its seed and
index, both printed in the log), `PAVED_E2E_ARTIFACTS` (the seeds and a failed test's screenshot, default
`e2e/artifacts/`, git-ignored). Run it under `nice -n 10`, one browser at a time; the CI `e2e` job runs it with 2 games.

The wrap sweep (`scripts/wrap-sweep.ts`, WRAP360) reads `storybook-static/`, so build Storybook first; it needs the
browser once (`bunx playwright-core install chromium-headless-shell`, from `packages/app`). Options: `--filter <story id
part>`, `--widths 360,320`, `--workers 4`, `--shard i/n` (the i-th of n parts of the story list, each story in exactly
one part), `--json <file>`. It prints a table (story, width, kind, element) and exits 1
on a finding that is not in its commented allowlist. The CI `client` job runs it after `build-storybook`.

Cap the Node heap as `AGENTS.md` says: `NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app`.

## Storybook (F2)

Storybook 10 with `@storybook/react-vite`, the docs and a11y addons (section 4 of the architecture). `.storybook/`
holds `main.ts` (stories `src/**/*.stories.tsx`), `preview.tsx` (the token file and fonts, `<html data-theme="dark">`,
`MotionConfig`, a `QueryClient` seeded from `parameters.queryFixtures`, a `MemoryRouter` at `parameters.route`, the font
preloads), `theme.ts` and `manager.ts` (the Storybook UI, dark on the board's colour). The board colour `#0C0D0F` (direction D) is the only
background; the viewport toolbar in the header is the only width control (mobile 360, tablet 640, desktop 1024, wide 1440; none picked is the full width).

The Foundations stories (`src/styles/*.stories.tsx`) read the token file itself (`src/styles/tokens.ts`), so they cannot
drift from it: Colors (scales with hex and OKLCH; semantic tokens with their computed contrast), Typography, Motion
(reduced motion off and on), Spacing and radius, Breakpoints. Icons (F4) are in `src/components/ui/icon.stories.tsx`. Tiles, board and scenes
come with F6 and the pages. The a11y panel shows the checks in the browser; running them in CI is Q2's. Hosting is F5.

The CI `client` job runs `build-storybook`, so a broken story fails the pull request. Cap the heap as above:
`NODE_OPTIONS=--max-old-space-size=1536 bun run --filter @paved/app build-storybook`.

## Icons (F4)

Font Awesome Pro 6.6.0, from the owner's three files in `public/fontawesome/js` (source, licence and hashes in the
README beside them; section 8 of the architecture). `src/lib/font-awesome.ts` injects them after the first frame with
DOM rewriting off; `<Icon name="house" variant="solid" size="md" label="Home" />` (`src/components/ui/icon.tsx`) draws
the icon as an SVG that React owns. Without `label` it is `aria-hidden`. `thin.min.js` holds one icon, `spider-web`.

## Layout

| Path | What |
|---|---|
| `src/styles/theme.css` | The only file with raw colours: scales, semantic tokens, breakpoints (Tailwind's defaults plus `mobile` / `tablet` / `desktop` / `wide`). Dark only; `index.html` sets `data-theme="dark"`, which the `dark:` variant needs |
| `src/styles/fonts.css` | Almendra (700), Rubik Variable and Space Mono (400, 700), Latin subset, from `@fontsource*` |
| `src/routes/pages.ts` | The route map, one entry per page: path, title, bottom-nav tab |
| `src/routes/Shell.tsx` | The layouts: with the bottom tabs, and full screen |
| `src/lib/query-client.ts` | The TanStack Query client |
| `src/state/ui-store.ts` | The zustand UI store |
| `src/components/MotionProvider.tsx` | `LazyMotion` + `m`: the feature set loads as its own chunk |
| `.storybook/`, `src/styles/*.stories.tsx` | Storybook and the Foundations stories (dev only; nothing in `dist`) |
| `public/THIRD_PARTY_NOTICES.txt` | The font licences, copied to `dist` |
