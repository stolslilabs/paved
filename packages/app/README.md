# @paved/app

Client v2: the app of `docs/client/v2-architecture.md`, beside `app-web` (which stays until the cut-over).
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
```

Cap the Node heap as `AGENTS.md` says: `NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app`.

## Storybook (F2)

Storybook 10 with `@storybook/react-vite`, the docs and a11y addons (section 4 of the architecture). `.storybook/`
holds `main.ts` (stories `src/**/*.stories.tsx`), `preview.tsx` (the token file and fonts, `<html data-theme="dark">`,
`MotionConfig`, a `QueryClient` seeded from `parameters.queryFixtures`, a `MemoryRouter` at `parameters.route`, the font
preloads), `theme.ts` and `manager.ts` (the Storybook UI, dark on the board's colour). The board colour `#07111A` is the only
background; the viewports are the four named breakpoints.

The Foundations stories (`src/styles/*.stories.tsx`) read the token file itself (`src/styles/tokens.ts`), so they cannot
drift from it: Colors (scales with hex and OKLCH; semantic tokens with their computed contrast), Typography, Motion
(reduced motion off and on), Spacing and radius, Breakpoints. Icons wait for F4 (no story yet). Tiles, board and scenes
come with F6 and the pages. The a11y panel shows the checks in the browser; running them in CI is Q2's. Hosting is F5.

The CI `client` job runs `build-storybook`, so a broken story fails the pull request. Cap the heap as above:
`NODE_OPTIONS=--max-old-space-size=1536 bun run --filter @paved/app build-storybook`.

## Layout

| Path | What |
|---|---|
| `src/styles/theme.css` | The only file with raw colours: scales, semantic tokens, breakpoints (Tailwind's defaults plus `mobile` / `tablet` / `desktop` / `wide`). Dark only; `index.html` sets `data-theme="dark"`, which the `dark:` variant needs |
| `src/styles/fonts.css` | Cinzel, Nunito Sans Variable and IBM Plex Mono, Latin subset, from `@fontsource*` |
| `src/routes/pages.ts` | The route map, one entry per page: path, title, bottom-nav tab |
| `src/routes/Shell.tsx` | The layouts: with the bottom tabs, and full screen |
| `src/lib/query-client.ts` | The TanStack Query client |
| `src/state/ui-store.ts` | The zustand UI store |
| `src/components/MotionProvider.tsx` | `LazyMotion` + `m`: the feature set loads as its own chunk |
| `.storybook/`, `src/styles/*.stories.tsx` | Storybook and the Foundations stories (dev only; nothing in `dist`) |
| `public/THIRD_PARTY_NOTICES.txt` | The font licences, copied to `dist` |
