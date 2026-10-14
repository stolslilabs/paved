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
```

Cap the Node heap as `AGENTS.md` says: `NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app`.

## Layout

| Path | What |
|---|---|
| `src/styles/theme.css` | The only file with raw colours: scales, semantic tokens, breakpoints (Tailwind's defaults plus `mobile` / `tablet` / `desktop` / `wide`). Dark only; `index.html` sets `data-theme="dark"`, which the `dark:` variant needs |
| `src/styles/fonts.css` | Rubik Mono One and Inter Variable, Latin subset, from `@fontsource*` |
| `src/routes/pages.ts` | The route map, one entry per page: path, title, bottom-nav tab |
| `src/routes/Shell.tsx` | The layouts: with the bottom tabs, and full screen |
| `src/lib/query-client.ts` | The TanStack Query client |
| `src/state/ui-store.ts` | The zustand UI store |
| `src/components/MotionProvider.tsx` | `LazyMotion` + `m`: the feature set loads as its own chunk |
| `public/THIRD_PARTY_NOTICES.txt` | The font licences, copied to `dist` |
