# Client v2: the benchmark and the architecture proposal

> History note: `packages/app-web`, which this document names, was removed in P-70; see git history.

Dated 2026-10-14. Track CLIENT, programme "Client v2" (PM ruling P-57). The specification is
[`spec-v1.md`](spec-v1.md): section A is the owner's text, section B the PM's rulings. This document is
the step (a) of P-57 B2: the benchmark of the reference clients and the architecture proposal, before
any code. The PM rules on it before the foundations start.

How to read it:

- **Read** marks what was read in a file or measured, with its path and commit. **Proposed** marks a
  recommendation. An estimate is called one.
- **Decided for the owner** marks a choice the spec leaves open; each says what would reverse it.
- Reference commits: `cartridge-gg/nums` at `4f8f405c2aca354307355ebf33190c43db2abd06` (2026-07-03),
  `cartridge-gg/glitchbomb` at `5efcbcec9150fac7b3360031f94bdf77a8f52ee5` (2026-07-22), Paved at
  `596808f1` (main, 2026-10-14). Both references are MIT ("Copyright (c) 2023 Dojo" for nums, "Copyright
  (c) 2025 cartridge-gg" for glitchbomb), except their Font Awesome files (section 8). Nothing of either is
  copied into this repository; the short snippets quoted below name their source.

Contents: 1 nums · 2 glitchbomb (palette, fonts) · 3 the stack · 4 Storybook · 5 the board renderer ·
6 the page map · 7 new app or in place · 8 Font Awesome · 9 next-tile prediction · 10 skills · 11 room for
the future · 12 the phased plan · decisions and CORE items.

---

## 1. cartridge-gg/nums (commit `4f8f405`)

### 1.1 Read: the layout

nums is a pnpm 11.0.5 + Turborepo monorepo. The workspaces are `client`, `contracts/tokens` (listed, but
the folder does not exist) and `remotion`; the Cairo/Dojo contracts sit at the root (`Scarb.toml`,
`contracts/src`), beside an Xcode WebView shell (`ios/`) and a Vocs docs site (`docs/`). The client:

```
client/
├── index.html              Google Font "Kode Mono" + three Font Awesome Pro <script> tags
├── vite.config.ts          Vite 5.4; react, wasm, top-level-await, tsconfig-paths, mkcert, vite-plugin-vercel
├── tailwind.config.ts      Tailwind v3, preset from src/themes/preset.ts
├── components.json         shadcn: style new-york, baseColor neutral, cssVariables, iconLibrary lucide
├── vitest.config.ts        jsdom; mocks for @cartridge/ui, torii-wasm, arcade
├── .storybook/             Storybook 10.3 (react-vite): main.ts, preview.ts, preview-head.html (loads the FA scripts)
├── _api/                   Vercel functions: SSR meta and OG images for /game/:id
├── public/                 fontawesome/js, assets/fonts, sounds, musics, videos
└── src/
    ├── main.tsx, App.tsx   providers + routes
    ├── pages/              index.tsx (the Main layout, 802 lines), home.tsx, game.tsx (681), support.tsx
    ├── context/            ~20 React context providers (entities, games, quests, achievements, vault, bundles, audio, theme…)
    ├── hooks/              ~22 hooks (actions.ts 585 lines, staking, tokens, leaderboard…)
    ├── api/                torii/* (SQL queries + gRPC subscriptions per domain), rpc.ts, ekubo.ts, keys.ts (query keys)
    ├── queries/            queryClient.ts (TanStack Query defaults)
    ├── atoms/              jotai: toriiClientAtom only
    ├── models/             domain models parsed from Torii entities
    ├── elements/           game logic (powers, traps) with tests
    ├── themes/             default.css (CSS variables), preset.ts (Tailwind preset), fonts.css, *.stories.tsx
    └── components/
        ├── ui/             13 shadcn/Radix primitives, no stories
        ├── elements/       75 files, 73 stories: game atoms and molecules
        ├── containers/     36 files, 28 stories: header, footer, games, staking, quests…
        ├── scenes/         13 files, 11 stories: full-screen overlays (home, game, quest, leaderboard, purchase, staking…)
        └── icons/, animations/, covers/, og/
```

- **Stack (read, `client/package.json`).** React ^19.2, Vite ^5.4.21, TypeScript ^5.9, Tailwind ^3.4.18
  with `tailwindcss-animate`, `tailwind-merge`, `clsx`, `class-variance-authority` (in 122 files); Radix
  primitives; `framer-motion` ^11.18 (4 files); `react-router-dom` ^6.30 (BrowserRouter); TanStack Query
  ^5.90 (10 files) with a 5 min `staleTime` and every refetch trigger off; jotai (one atom); starknet ^8.9,
  `@starknet-react/core` ^5, `@cartridge/controller` + `connector`; Dojo Torii (`@dojoengine/torii-wasm`,
  `sdk`, `grpc`). Installed but never imported: `@tanstack/react-db`, `urql`, `gql.tada`, `react-icons`,
  `@cartridge/ui`, the TanStack Router plugin.
- **Routing (read, `src/App.tsx`).** Five routes: `/` home, `/game/:id`, `/game` (a loading scene),
  `/practice`, `/tutorial`, plus `/support`. Everything else (quests, achievements, leaderboard, purchase,
  staking, referral, settings) is an **overlay "scene" toggled by about ten `useState` booleans** in the
  802-line `Main` layout (`pages/index.tsx`), not a route: no deep link, no back button.
- **State and data (read).** Five contexts (`entities`, `quests`, `achievements`, `vault`, `bundles`, 222 to
  424 lines each) repeat one hand-rolled pattern: `useEffect` → first `executeSql` → Torii gRPC subscription
  kept in a `useRef` → merged into `useState` arrays. TanStack Query runs beside them for games, prices and
  staking. Fourteen providers nest above `Main`; most build their `value` inline without `useMemo` (only
  `vault.tsx` and `posthog.tsx` memoise), and `audio`, `quests` and `achievements` hold 27 to 47 fields
  each. Any subscription update therefore re-renders `Main` and, through it, most of the app.
- **Components and styling (read).** Tiers `ui` → `elements` → `containers` → `scenes`, each with a barrel
  `index.ts`; CVA + `cn()` everywhere; a story per component (133 stories), titled `"Tier/Component"`. The
  theme is CSS variables per colour with nine alpha steps (`--purple-100` … `--purple-900`) mapped by a
  Tailwind preset to `primary`/`secondary`/`tertiary`, switched at run time by `context/theme.tsx`.
- **Tests and CI (read).** Vitest 3 + jsdom + Testing Library, 11 test files; no Playwright. CI
  (`.github/workflows/ci-ts.yml`) runs format, lint, type check and tests on `client/**`, **but neither the
  build nor Storybook**. A pre-commit hook runs the lot.
- **Agent files (read).** `AGENTS.md` (with `CLAUDE.md` a symlink), 29 skills in `.agents/skills/`
  (`.claude/skills` a symlink), installed with `npx skills add`; `.claude/settings.json` enables eight
  plugins.

### 1.2 Proposed: what to take, and what not

| Take | Why |
|---|---|
| The component tiers `ui` / `elements` / `containers` / `scenes`, CVA + `cn()`, one story per component, story titles by tier | The owner asked to draw heavily on nums' structure; the tiers map cleanly onto a Storybook sidebar and keep primitives free of game logic |
| shadcn/ui primitives owned as source in `components/ui` | The spec's base UI; the files are ours to restyle |
| The theme mechanics: base colour scales in CSS variables, semantic aliases (`primary`, `secondary`, `tertiary`) that point at a scale, a runtime switch by re-pointing the aliases | Lets the Theme page and future seasonal palettes swap accents without touching components (section 2) |
| Query keys in one module (`api/keys.ts`) and a shared `QueryClient` | The only part of nums' data layer that scales |
| `lib/router.tsx`'s idea: links that keep the query string (`?ref=`) | Paved's referral link already rides on `?ref=` |
| Stories for scenes (full screens) with mocked data | Lets the owner review every page in Storybook before the chain is wired |

| Leave | Why |
|---|---|
| Overlays toggled by booleans in one layout | No deep links, no back button, and the 800-line layout re-renders on every update. Paved gives every page a route (section 6) |
| A context per domain holding chain data in `useState` | Every update re-renders every consumer; no cache, no dedupe, no suspense. TanStack Query owns server state instead (section 3.3) |
| Two data systems side by side (contexts and React Query) | One owner per kind of state |
| Torii, Dojo SDK, gRPC subscriptions | Paved's contracts left Dojo (P2); reads are view calls, events and our own indexer (`docs/architecture/client-data-layer.md`) |
| Unused dependencies | Each one costs install time and audit surface |
| Tailwind v3 with a JS preset | Tailwind v4 keeps the theme in CSS (section 3.1) |
| Font Awesome Pro files | Licence (section 8) |
| CI without a build or a Storybook build | Paved's CI builds both (section 4.4) |
| Skills installed with `npx skills add` at run time, plugins in `.claude/settings.json` | The Overseer's ruling: reviewed skills in the repository, nothing at machine level (section 10) |

---

## 2. cartridge-gg/glitchbomb (commit `5efcbce`)

### 2.1 Read: how the palette is built

- Tailwind v3 (`client/tailwind.config.ts`, preset `client/src/themes/preset.ts`), `darkMode: "selector"`,
  `tailwindcss-animate`. shadcn's `components.json` exists (style new-york, neutral, lucide) but **no
  shadcn semantic tokens** (`--background`, `--card`, `--muted`…) are defined.
- Colours live in `client/src/themes/default.css` as one RGB value per hue with **nine alpha steps**, not
  a lightness ramp. For example (verbatim, MIT, cartridge-gg/glitchbomb):

  ```css
  --green-100: rgba(54, 248, 24, 100%);
  --green-200: rgba(54, 248, 24, 80%);
  /* … 64 %, 48 %, 32 %, 24 %, 16 %, 8 % … */
  --green-900: rgba(54, 248, 24, 4%);
  ```

  Hues: white `255,255,255`, gray `56,56,56`, black `4,6,3`, green `54,248,24`, forest `9,38,4`, blue
  `76,145,255`, yellow `255,241,33`, orange `241,114,28`, salmon `255,0,153`, red `255,30,0`, purple
  `151,71,255`. Semantic aliases: `--primary-N: var(--green-N)`, `--secondary-N: var(--yellow-N)`,
  `--tertiary-N: var(--salmon-N)`. Gradients (`--green-gradient-100`, `--multiplier-one-100` … `-five-200`,
  `--hp-gradient-100`…) and game colours (`--orb-multiplier: #4C91FF`…) complete it.
- A runtime theme (`client/src/contexts/theme.tsx`) re-points the aliases: `default` = green / yellow /
  salmon, `glitch` = red / yellow / salmon (used on the game-over screen, reset on every route change).
  `client/src/themes/colors.stories.tsx` and `typography.stories.tsx` show them in Storybook.
- The page background is `var(--black-100)` (`#040603`); `index.html` sets `theme-color` `#591FFF`.

**Read, consequence:** glitchbomb's scale is opacity, not the standard Tailwind declension the owner asks
for (50 lightest → 950 darkest, each step opaque). What we take is the **mechanics** (hue scales, semantic
aliases, a runtime re-point, colour and type stories); the declension below is built for Paved.

### 2.2 Proposed: the Paved palette as a Tailwind theme

*Superseded in part by 2.2b (#537, 2026-10-19): the interface's neutral is direction D's `charcoal`; the navy `ink` scale stays
in theme.css only as the 3D scene's night sky (the renderer's day/night keyframes), and no semantic token or component points
at it. `gold`, the status scales and the method below stay. The block below is the first proposal, kept as the record.*

**Read (measured from the mockups,** `mockup-01.png`, now in `packages/app/src/stories/renderer/mockups/`, a 5×5-pixel mean per point): the gold of
the primary buttons is `#F0BF5B` (its gradient runs `#F3C15D` → `#E8B755`); the page is `#0A141C` and the
board area `#07111A`; the cards `#172129`; the borders `#23303A`. These are the anchors of the `gold` and
`ink` scales. **Chosen, not measured:** the anchors of `meadow` (success), `river` (info), `ember`
(danger) and `amber` (warning), picked to sit with the tile art.

**Method.** Each scale has eleven steps on a fixed OKLCH lightness ladder (50: 0.975, 100: 0.945, 200:
0.895, 300: 0.83, 400: 0.76, 500: 0.68, 600: 0.585, 700: 0.495, 800: 0.405, 900: 0.32, 950: 0.235; `ink`
runs darker at its end, down to 0.186), at the anchor's hue, the chroma tapering at both ends; each
measured or chosen anchor replaces the step whose lightness is nearest. Values out of the sRGB gamut had
their chroma reduced until they fit. The hex beside each value is its sRGB rendering, for designers.

**Measured contrast (WCAG 2, computed from the hex values):**

| Pair | Ratio |
|---|---|
| `foreground` (ink-50) on `background` (ink-950) | 17.27 |
| `foreground` on `card` (ink-900) | 15.17 |
| `muted-foreground` (ink-400) on `card` | 6.11 |
| `primary-foreground` (ink-950) on `primary` (gold-300) | 10.89 |
| `destructive-foreground` (ink-50) on `destructive` (ember-700) | 6.20 |
| ember-400 / meadow-400 text on `background` | 8.17 / 9.15 |

Every text pair passes AA (4.5); the foreground, primary and status pairs also pass AAA (7), `muted` and
`destructive` only AA. Borders
(ink-800 on ink-950) are 1.38: decorative, as in the mockups; focus rings use gold.

**Corrected by F3 (decided 2026-10-14):** `--input`, the edge of a form field and of an outlined control,
must reach 3:1 on `--background` (WCAG 1.4.11, non-text contrast). It moves from ink-700 to ink-600, the first
ink step that reaches 3:1 (computed by the Colors story, `color-math.ts`):

| Token | Before | After |
|---|---|---|
| `--input` on `--background` (ink-950) | ink-700, 2.11 | ink-600, 3.11 |
| `--input` on `--card` / `--popover` (ink-900) | ink-700, 1.86 | `--input-surface` = ink-500, 4.16 (ink-600 would give 2.73) |
| `--border` on `--background` | ink-800, 1.38 | unchanged, decorative |

`--border` stays the decorative divider, and the surface edge of a Card, Dialog, Sheet, Dropdown Menu and
Tooltip: none of them is a control, so 1.4.11 does not ask for more. Where a control's edge or extent is its
only mark, the primitive uses `--input` (outline Button, Toggle Group, outline Badge, the Switch, Slider and
Progress tracks, the Scroll Area thumb).

**Fields on a card or a popover (PM ruling, 2026-10-14):** a new token, `--input-surface` (ink-500, 4.16:1 on
`--card` and `--popover`). It is applied by scope, not by a second class: theme.css re-points `--input` to
`--input-surface` inside `[data-slot="card"]`, the Dialog, Sheet and Dropdown Menu contents, and any element
marked `data-input-surface`. Why: `--color-input` is `@theme inline`, so each `border-input` / `bg-input` resolves
`var(--input)` where it is used and follows the re-pointing. Every control already uses `input`, so an outline
Button, a Toggle Group or a Switch changes inside a surface with no change to the primitive, and a new control
is right by default. The Foundations / Field contrast story shows the same controls on the page, a card and a
popover, each with its computed ratio. `--destructive-text` (ember-300, 9.34:1 on `--popover`) is the text of a
destructive menu item.

**Decided for the owner:** gold is `primary` (the mockups' buttons, stars and highlights), meadow is
`secondary` (the meadows of the default theme), river is `tertiary`. Reversed if the owner names other
accents.

**Decided for the owner:** dark only (spec A). `:root` carries the dark values and `color-scheme: dark`;
a light theme would add one `[data-theme="light"]` block re-pointing the semantic tokens, with no
component change. Reversed when the owner validates a light theme.

**The token file proposed** (`packages/app/src/styles/theme.css`, Tailwind v4, CSS-first):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* 1. Base scales: the standard 50-950 declension. */
@theme {
  /* gold: primary, the mockups' buttons; measured anchor 300 = #F0BF5B */
  --color-gold-50: oklch(0.975 0.021 83.0); /* #FEF6E7 */
  --color-gold-100: oklch(0.945 0.043 83.0); /* #FBEBCD */
  --color-gold-200: oklch(0.895 0.078 83.0); /* #F6D8A1 */
  --color-gold-300: oklch(0.829 0.130 83.0); /* #F0BF5B */
  --color-gold-400: oklch(0.760 0.155 83.0); /* #E0A605 */
  --color-gold-500: oklch(0.680 0.139 83.0); /* #C28F04 */
  --color-gold-600: oklch(0.585 0.119 83.0); /* #9E7403 */
  --color-gold-700: oklch(0.495 0.101 83.0); /* #7D5B02 */
  --color-gold-800: oklch(0.405 0.083 83.0); /* #5F4401 */
  --color-gold-900: oklch(0.320 0.065 83.0); /* #432F00 */
  --color-gold-950: oklch(0.235 0.048 83.0); /* #291C00 */

  /* ink: neutral, page, panels and borders; measured anchors 800 = #23303A, 900 = #172129, 950 = #0A141C */
  --color-ink-50: oklch(0.975 0.006 241.7); /* #F3F7FB */
  --color-ink-100: oklch(0.940 0.006 241.7); /* #E8ECEF */
  --color-ink-200: oklch(0.880 0.012 241.7); /* #D1D9DF */
  --color-ink-300: oklch(0.800 0.022 241.7); /* #B2C0CB */
  --color-ink-400: oklch(0.700 0.022 241.7); /* #93A0AB */
  --color-ink-500: oklch(0.600 0.026 241.7); /* #73838F */
  --color-ink-600: oklch(0.500 0.026 241.7); /* #576571 */
  --color-ink-700: oklch(0.410 0.026 241.7); /* #3E4C57 */
  --color-ink-800: oklch(0.302 0.025 241.7); /* #23303A */
  --color-ink-900: oklch(0.242 0.021 242.8); /* #172129 */
  --color-ink-950: oklch(0.186 0.022 243.5); /* #0A141C */

  /* meadow: success, meadows; chosen anchor 500 = #4CAF50 */
  --color-meadow-50: oklch(0.975 0.019 144.2); /* #EFFBEF */
  --color-meadow-100: oklch(0.945 0.041 144.2); /* #DDF5DC */
  --color-meadow-200: oklch(0.895 0.073 144.2); /* #C0EABE */
  --color-meadow-300: oklch(0.830 0.122 144.2); /* #95DC94 */
  --color-meadow-400: oklch(0.760 0.154 144.2); /* #6ECA6F */
  --color-meadow-500: oklch(0.673 0.162 144.2); /* #4CAF50 */
  --color-meadow-600: oklch(0.585 0.154 144.2); /* #349239 */
  --color-meadow-700: oklch(0.495 0.138 144.2); /* #217527 */
  --color-meadow-800: oklch(0.405 0.117 144.2); /* #135819 */
  --color-meadow-900: oklch(0.320 0.094 144.2); /* #093E0E */
  --color-meadow-950: oklch(0.235 0.073 144.2); /* #012604 */

  /* river: info, water; chosen anchor 500 = #3B8FD9 */
  --color-river-50: oklch(0.975 0.012 248.5); /* #F1F8FE */
  --color-river-100: oklch(0.945 0.027 248.5); /* #DFEFFF */
  --color-river-200: oklch(0.895 0.053 248.5); /* #C2E0FF */
  --color-river-300: oklch(0.830 0.088 248.5); /* #9ACDFF */
  --color-river-400: oklch(0.760 0.129 248.5); /* #6BB7FF */
  --color-river-500: oklch(0.633 0.138 248.5); /* #3B8FD9 */
  --color-river-600: oklch(0.585 0.131 248.5); /* #3180C5 */
  --color-river-700: oklch(0.495 0.117 248.5); /* #1F65A1 */
  --color-river-800: oklch(0.405 0.099 248.5); /* #114C7C */
  --color-river-900: oklch(0.320 0.080 248.5); /* #083559 */
  --color-river-950: oklch(0.235 0.062 248.5); /* #011F3A */

  /* ember: danger, give up; chosen anchor 600 = #D9493B */
  --color-ember-50: oklch(0.975 0.012 29.1); /* #FFF4F2 */
  --color-ember-100: oklch(0.945 0.027 29.1); /* #FFE7E3 */
  --color-ember-200: oklch(0.895 0.054 29.1); /* #FFD0C8 */
  --color-ember-300: oklch(0.830 0.094 29.1); /* #FFB0A4 */
  --color-ember-400: oklch(0.760 0.143 29.1); /* #FF8B7B */
  --color-ember-500: oklch(0.680 0.192 29.1); /* #F85E4D */
  --color-ember-600: oklch(0.604 0.183 29.1); /* #D9493B */
  --color-ember-700: oklch(0.495 0.163 29.1); /* #AB2E24 */
  --color-ember-800: oklch(0.405 0.138 29.1); /* #841E16 */
  --color-ember-900: oklch(0.320 0.111 29.1); /* #5F110C */
  --color-ember-950: oklch(0.235 0.086 29.1); /* #3E0503 */

  /* amber: warning; chosen anchor 500 = #E8892E */
  --color-amber-50: oklch(0.975 0.014 59.2); /* #FFF5EE */
  --color-amber-100: oklch(0.945 0.034 59.2); /* #FFE8D7 */
  --color-amber-200: oklch(0.895 0.067 59.2); /* #FFD2B0 */
  --color-amber-300: oklch(0.830 0.114 59.2); /* #FFB57A */
  --color-amber-400: oklch(0.760 0.145 59.2); /* #F49848 */
  --color-amber-500: oklch(0.717 0.152 59.2); /* #E8892E */
  --color-amber-600: oklch(0.585 0.138 59.2); /* #B66403 */
  --color-amber-700: oklch(0.495 0.116 59.2); /* #914E02 */
  --color-amber-800: oklch(0.405 0.096 59.2); /* #6E3A00 */
  --color-amber-900: oklch(0.320 0.075 59.2); /* #4E2800 */
  --color-amber-950: oklch(0.235 0.055 59.2); /* #311600 */

  /* The board: the 3D scene's clear colour and the Storybook background; measured #07111A. */
  --color-board: oklch(0.173 0.024 246.1); /* #07111A */

  /* Fonts (section 2.3). */
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Rubik Mono One", "Inter Variable", ui-sans-serif, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, monospace;

  /* Breakpoints (section 3.4): mobile first, the base is the small mobile. Tailwind's defaults (sm, md, lg, xl, 2xl)
     stay: shadcn's components use them. The named ones sit beside. */
  --breakpoint-mobile: 22.5rem;   /* 360px */
  --breakpoint-tablet: 40rem;     /* 640px */
  --breakpoint-desktop: 64rem;    /* 1024px */
  --breakpoint-wide: 90rem;       /* 1440px */

  --radius: 0.75rem;
}

/* 2. Theme aliases: what the Theme page and a future event re-point (glitchbomb's mechanics). */
:root {
  --accent-scale-300: var(--color-gold-300);
  --accent-scale-400: var(--color-gold-400);
  --accent-scale-950: var(--color-gold-950);
}

/* 3. Semantic tokens (shadcn names), dark values. Dark only: no light block yet. */
:root,
[data-theme="dark"] {
  color-scheme: dark;
  --background: var(--color-ink-950);
  --foreground: var(--color-ink-50);
  --card: var(--color-ink-900);
  --card-foreground: var(--color-ink-50);
  --popover: var(--color-ink-900);
  --popover-foreground: var(--color-ink-50);
  --primary: var(--accent-scale-300);
  --primary-foreground: var(--color-ink-950);
  --secondary: var(--color-ink-800);
  --secondary-foreground: var(--color-ink-50);
  --muted: var(--color-ink-800);
  --muted-foreground: var(--color-ink-400);
  --accent: var(--accent-scale-950);
  --accent-foreground: var(--accent-scale-300);
  --destructive: var(--color-ember-700);
  --destructive-foreground: var(--color-ink-50);
  --success: var(--color-meadow-400);
  --info: var(--color-river-400);
  --warning: var(--color-amber-400);
  --border: var(--color-ink-800);
  --input: var(--color-ink-700);
  --ring: var(--accent-scale-400);
  --board: var(--color-board);
}

/* 4. Expose the semantic tokens as Tailwind colours (bg-background, text-primary…). */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-info: var(--info);
  --color-warning: var(--warning);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans antialiased; }
}
```

**Corrections after P0's review (#373), applied in F1.** The token file above changed in two places.
(1) It no longer clears Tailwind's default breakpoints (`--breakpoint-*: initial`): shadcn's components use
`sm:`, `md:` and `lg:`, so the defaults stay and the four named breakpoints sit beside them. (2) The
`dark:` variant matches only under `[data-theme="dark"]`, so `index.html` sets `<html data-theme="dark">`
(and Storybook's preview will, F2); without it shadcn's `dark:` classes would not apply in the dark-only
app. `packages/app/src/styles/theme.css` is this file.

Transparent tints (glitchbomb's 80 % … 4 % steps) need no tokens: Tailwind v4 writes them as
`bg-gold-300/20` or `border-ink-50/8` from the opaque scale.

### 2.2b Applied: direction D, the charcoal page with gold as the one action colour (#537)

**Owner decisions.** 2026-10-18: the navy and gold palette, the cards and layout and the navigation (bottom tab bar, left rail
with a sliding indicator) read as Cartridge's Controller and Arcade; the interaction states become white with transparency on
every button and nav item. 2026-10-19: of the six directions in Storybook (`Direction/A` to `F`, kept as a record), the owner
picks **D, "Mockup"**: the owner's mockups (`packages/app/src/stories/renderer/mockups/mockup-01.png`, `mockup-02.png`) built as they are drawn. Almendra stays.

**The palette** (`packages/app/src/styles/theme.css`, the only file with raw colours):

| Token | Points at | Value | Role |
|---|---|---|---|
| `background` | `charcoal-950` | `#121316` | the page |
| `card`, `popover` | `charcoal-900` | `#1C1E22` | cards, sheets, menus |
| `secondary`, `muted`, `accent` | `charcoal-800` | `#2A2D33` | raised parts: keys, chips, segmented choices |
| `border` | `charcoal-700` | `#363941` | the hairline (1.61:1 on the page, decorative) |
| `input` / `input-surface` | `charcoal-600` / `-500` | `#61656E` / `#7D818A` | field edges, 3.17:1 on the page / 4.27:1 on a card |
| `muted-foreground` | `charcoal-300` | `#CDCFD4` | secondary text, 10.68:1 on a card |
| `foreground` | `charcoal-50` | `#F4F1EA` | text, warm, 16.49:1 on the page |
| `primary` | `gold-300` | `#F0BF5B` | the one action colour: the main button, the current nav item, the switches, the icons of rows |
| `board` | | `#0C0D0F` | under dialogs and sheets, the Storybook background |
| `medal-1`, `-2`, `-3` | gold-300, charcoal-200, amber-400 | | the podium |
| `glow` | `primary` at 14% | | the soft light behind a hero figure (loading, the final score) |

`accent` is no longer a hover colour (it was `gold-950`, the brown block of the active rail item): it is a raised surface, and
no part of the app paints it for a state. Every direct `gold-950` and `gold-800/900` use (the featured cards, the summary
cards, the avatars) now goes through a token: `border-primary/40` (or `/30`) on `bg-card`, `bg-secondary text-primary`.

**The interaction states** are tokens too, `--state-hover` (white 10%), `--state-selected` (15%), `--state-pressed` (20%),
painted by one utility, `state-layer`: a white layer over the part's own background (`background-image` over
`background-color`), so a gold button, a charcoal card and a transparent nav item take the same states. Selected covers
`data-state="on"` (toggles), `"open"`, `"active"`, `"checked"`, `aria-current="page"` (nav), `aria-pressed`, `aria-selected`,
`aria-checked` (a pack is a radio); a selected part keeps its 15% under the pointer; a press wins. Every `Button` variant (the
link too, beside its underline), `ToggleGroupItem`, `Switch`, the tabs' triggers (the sliding highlight is their 15%), the
dropdown's items (`data-highlighted` is hover), the dialog's and sheet's close keys, the nav items, the mode cards, the Cobble
packs, the board map's slots and the rows that are buttons use it.

**Cards.** Rounded 12 px (`rounded-xl`) charcoal with the hairline edge, led by an image where the mockups put one: a render on
the left of a row (`ModeCard` `art`, the Play list), a banner across the top (`ModeCard` `banner`, the Challenge on Home).
The end of a game has no banner: its scores are an overlay over the final board itself (#720). Settings groups are one card with dividers, titled in the display font. Buttons are 44 px by default
(`lg` 56 px), 12 px corners.

**Imagery.** Renders of the real board and tiles, drawn once by `packages/app/scripts/direction-renders.ts` (the bench's
recorded 38- and 72-tile games and the voxel wordmark through the board's own `GameScene`, in headless Chromium; software
WebGL on a machine with no GPU) and committed as the masters in `src/directions/renders/`. The app's copies are
`src/assets/renders/` (`scripts/app-renders.ts`: each master resized to twice its largest box and re-encoded as WebP):

| File | Size | Where |
|---|---|---|
| `wordmark.webp` | 840 x 240, 14,352 B | `Wordmark` (Home, the nav header, Welcome, Loading) |
| `hero-tall.webp` / `hero-wide.webp` | 750 x 1000, 122,366 B / 1440 x 720, 112,264 B | `BoardHero` (Home, Welcome); one of the two is fetched |
| `mode-challenge.webp`, `mode-training.webp`, `mode-tutorial.webp` | 320 x 200; 21,056, 7,878 and 5,550 B | the mode cards, the game to resume |

Total 283,466 B (the over screen's banner, `score-wide.webp`, left with #720: the final board is that screen's background). Each is its own file in `dist/assets` (no JavaScript chunk grows), fetched when its `<img>` is drawn
(`loading="lazy"` below the fold), with its width and height set; nothing is fetched from another host.

### 2.3 Fonts

**Read, glitchbomb** (`client/src/themes/fonts.css`, `preset.ts`, `index.html`):

| Family | Role in glitchbomb | How it loads | Licence |
|---|---|---|---|
| Rubik One | `primary`, `body`, and the global `*` rule | self-hosted `client/public/fonts/rubik-one.regular.ttf`, `@font-face`, `font-display: swap` | SIL OFL 1.1 (a Google Font); **no licence file ships beside it** |
| Rubik Glitch | `glitch` (a keyframe swaps it in by bursts) | self-hosted TTF, same way | SIL OFL 1.1; no licence file |
| VT323 | `secondary` | self-hosted TTF, same way | SIL OFL 1.1; no licence file |
| Jost | none found in `src` | Google Fonts `@import` | SIL OFL 1.1 |
| Kode Mono | none found in `src` | Google Fonts `<link>` in `index.html` | SIL OFL 1.1 |
| Inter, IBM Plex Mono | named in the preset | never loaded (fall back to system fonts) | SIL OFL 1.1 |

nums, for comparison, self-hosts PixelGame (otf), PPNeueBit, DMMono and Circular-LL (a commercial
Lineto face) from `public/assets/fonts/`.

**Read, Paved today:** `packages/ui/src/theme.ts` uses Rubik Mono One for headings and body;
`app/public/assets/fonts/RubikMonoOne-Regular.ttf` was the only font file in the repository (`app/` was removed in #591).

**Chosen by the owner (2026-10-14, through the PM), replacing the proposal of Rubik Mono One and Inter** (F1b,
t-0228), **then changed the same day to Almendra Bold, Rubik and Space Mono** (t-0260, which reverses F1b). Packages
and versions are pinned in `packages/app/package.json`; each font is self-hosted from npm, Latin subset only,
`font-display: swap`.

| Token | Family | Use | Package (version) | Files loaded | Licence |
|---|---|---|---|---|---|
| `font-display` | Almendra, Bold (700) | logo, page titles | `@fontsource/almendra` 5.3.0 | `almendra-latin-700-normal.woff2` (11,544 B) | SIL OFL 1.1, Reserved Font Name "Almendra" (copyright Ana Sanfelippo) |
| `font-sans` | Rubik Variable (300 to 900) | all UI and body text | `@fontsource-variable/rubik` 5.3.0 | `rubik-latin-wght-normal.woff2` (35,348 B) | SIL OFL 1.1 (The Rubik Project Authors) |
| `font-numeric` (= `font-mono`), the `numeric` utility | Space Mono, 400 and 700 | scores, counters, prices, addresses, token ids; always with `font-variant-numeric: tabular-nums` | `@fontsource/space-mono` 5.3.0 | `space-mono-latin-400-normal.woff2` (16,520 B), `-700-` (16,724 B) | SIL OFL 1.1 (The Space Mono Project Authors) |

- Almendra is loaded as the static Bold file: the display face is used at one weight.
- Rubik is the variable package, not static files: the UI uses several weights (`font-light` to `font-black`,
  mostly `font-semibold` and `font-medium`), and one variable file of 35,348 B costs less than three or four
  static ones. Its axis starts at 300, so `font-extralight` (200) renders as 300.
- Space Mono has no 600: `font-semibold` on a number renders the 700 file (the nearest heavier weight).
- Fallbacks are system fonts of the same kind: a serif for Almendra, `system-ui` for Rubik, `ui-monospace` for
  Space Mono.
- The `numeric` utility (`theme.css`) sets `font-family: var(--font-numeric)` and `tabular-nums` together; use it
  for every number that changes in place. Space Mono is monospaced, so its digits are tabular already and
  `tabular-nums` adds nothing today; it stays so the class keeps its promise if the face changes.
- Preloads: Almendra and Rubik only (the first screen), by `preloadFonts()` in `src/styles/fonts.ts`, at the
  hashed `?url` imports; `index.html` calls it and so does `.storybook/preview.tsx`. The preload starts when the
  entry chunk runs, not at HTML parse (Vite bundles the inline module into the entry). Space Mono is fetched
  when a number first shows.
- Measured bytes (built `dist`, 2026-10-14): first-screen fonts (the two preloaded files) 46,892 B, against 46,260 B
  with F1b's Cinzel and Nunito Sans (+632 B); all four font files 80,136 B, against 76,588 B (+3,548 B); built CSS
  57,457 B (10.92 kB gzip), entry JS 379,858 B.

Why self-hosted from npm: no request to Google at load (privacy, offline after the first visit, no
third-party outage), versions pinned by the lockfile, and the OFL text ships inside each package (the
references ship none). The licences are listed in `dist/THIRD_PARTY_NOTICES.txt` with the controller's
(D-15); the copyright lines are those of each package's `LICENSE`. Almendra's Reserved Font Name only restricts
modified versions; the files are used as published.

**Decided by the owner:** Almendra Bold, Rubik, Space Mono with tabular figures. Reversed by changing
`--font-display`, `--font-sans` and `--font-numeric` and the three packages.

---

## 3. The stack

### 3.1 React, Vite, Tailwind, shadcn/ui

**Read:** the repository already runs React 19.3, Vite 8, TypeScript 7, react-router 7.18, zustand 5,
three 0.186, on bun 1.4.2 and turbo (`docs/client/STATUS.md`, P-8). The references run React 19.2, Vite
5, Tailwind 3.4, react-router 6.

**Proposed:**

- **React 19 + Vite 8**, as today, with the React Compiler left off at first (measure, then decide).
- **Tailwind v4** (CSS-first `@theme`, the token file above; `@tailwindcss/vite`). Why not v3 as the
  references: shadcn/ui's current components target v4; the theme lives in CSS where Storybook and the
  app read the same file; OKLCH colours and `/opacity` modifiers come built in. **Decided for the owner;**
  reversed if a needed library still requires v3.
- **shadcn/ui** on Radix primitives, copied as source into `components/ui` with the shadcn CLI pinned to
  one version in `package.json` (never `@latest`, see section 10). First set: Button, Card, Tabs, Dialog,
  Sheet (drawer for mobile), Switch, Slider, Toggle Group (the mockups' Low/Medium/High and
  Easy/Medium/Hard), Tooltip, Progress, Badge, Skeleton, Separator, Avatar, Sonner (toasts, the mockups'
  "Tile placed! + 8 points"), Scroll Area, Dropdown Menu.
- **Icons:** Font Awesome only (spec A), through the Pro scripts and the `Icon` component (section 8).

### 3.2 Animation

**Read (bundlephobia, 2026-10-14, minified + gzip of the package's main entry):**

| Library | Version | min | min + gzip |
|---|---|---|---|
| Motion (`motion`, formerly Framer Motion) | 14.2.0 | 150,965 B | 51,180 B |
| React Spring (`@react-spring/web`) | 10.1.2 | 52,360 B | 20,074 B |

Motion's documentation states that `LazyMotion` with the `m` component and the `domAnimation` feature set
brings the initial cost to about 4.6 kB, the features loading after; that figure is Motion's, not
measured here. The CSS-only path (`tw-animate-css`, transitions) costs nothing but has no exit or layout
animation.

**Proposed: Motion**, with `LazyMotion` + `m` + `domAnimation` loaded asynchronously, and CSS
transitions for plain hovers. Why:

- the interactions the spec names are Motion's built-ins: `whileTap` / `whileHover` on buttons, a shared
  `layoutId` for the sliding tab indicator, `AnimatePresence` for exits (toasts, sheets, the over screen),
  `layout` for the hand panel's cards;
- reduced motion is one switch: `<MotionConfig reducedMotion="user">`;
- both references use it (framer-motion 11), so their patterns translate directly;
- React Spring is smaller in full but has no layout or shared-element animation, which the tabs and the
  tile hand need.

F3b moved the feature set to `domMax` for the Tabs highlight's shared `layoutId` and the list's `layout`: see section 3.5.

**Decided for the owner;** reversed if the measured bundle of the foundations PR exceeds its budget
(proposed: 200 kB gzip for the initial route's JS, without three.js, which loads with the board route).

### 3.3 State and data fetching

**Read, today's app-web:** hand-rolled `useAsyncRead` / `useRead` / `useIndexerRead` hooks
(`packages/chain/src/react.tsx`), one read when inputs change and on `visibilitychange`; no cache shared
between components, no dedupe; game state through `GameSession` with a subscribe API; zustand for the
board UI (`useGameStore`). No polling (the data-layer rule).

**Read, the references:** contexts per domain holding chain data in `useState` (section 1.1), TanStack
Query beside them.

**Proposed: three owners, one per kind of state.**

| State | Owner | Examples |
|---|---|---|
| Server state (chain views, indexer) | **TanStack Query v5** (5.104.2 today; min+gzip 13,179 B by bundlephobia) | `game(id)`, `tiles(id)`, `entry_price`, `terms(id)`, vault `staked`/`pending`, leaderboard, quests |
| The game in play | **the engine session**, outside React, exposed as a zustand vanilla store | board, hand, predicted next tile, pending move, score |
| UI state | **zustand v5** (already in the repository; 489 B gzip) with selectors | selected rotation, hover cell, camera mode, open sheet, settings (persisted to `localStorage`) |

Why this beats the references' hooks and contexts:

- **Re-render boundaries.** A context re-renders every consumer on any change of its value; a zustand
  selector or a query's `select` re-renders only the components whose slice changed. The renderer reads
  the board store directly (`store.subscribe`), so a placement redraws the scene without a React commit.
- **Cache.** One cache keyed by `['game', contract, id]`, `['leaderboard', day, page]`…: a page change
  and back shows data at once; `staleTime` per key (a game view: 0 while playing, a past day's leaderboard:
  `Infinity`).
- **Request dedupe.** Ten components asking for `entry_price` make one call; today each `useRead` calls.
- **Suspense.** `useSuspenseQuery` lets each route declare its data and show the Loading page as its
  `Suspense` fallback, with an error boundary per route; route loaders can prefetch on link hover.
- **Writes.** A write's receipt events go into the cache with `setQueryData` (today's "show a placement
  before one reconciling read"), then one `invalidateQueries` for the reconciling read. No polling: the
  refetch triggers are the receipt, window focus (replacing `onVisible`) and the user's action.
- **Persistence.** Settings, Story's progress and the device's best Training score (`paved.training-best.v1`) stay in
  `localStorage`; the query cache is not persisted (chain data must be fresh). A Training game is not saved (#718): it
  lives in memory, and every entry starts a new one.

**As built (P2).** The sessions are in `@paved/game-core` (`src/sessions/`): `PageSession` and `PageState` (structural
copies of the chain's shapes, since `@paved/chain` depends on game-core; `GameSession` satisfies them unchanged, and app-web's
`tsc` catches a drift of the chain's shapes through the state and the senders),
`LocalSession` and `randomSeed`, and the tutorial run with its save (`paved.tutorial.v1`, its format unchanged).
`LocalSession` and `TutorialRun` keep their `EngineGame` between moves (the tutorial replays only to resume and on Back,
the engine having no undo). Since #718 `LocalSession` saves nothing: no `saveGame`, `loadGame`, `LocalSession.resume`,
`openTraining` or `savedTrainingStatus` any more; the key Training saved under (`paved:training:v1`) is only cleared,
once per tab, by `clearGame`, so no stale save stays on the device.
The v2 app's data layer is `packages/app/src/data/`:

| Module | What it holds |
|---|---|
| `keys.ts` | `queryKeys`, every key of the app: `['chain', read, ...args]` for a view or event read, `['indexer', read, ...args]` for the indexer; addresses normalised by `addressKey`, no bigint in a key |
| `sources.tsx` | `DataProvider` and `DataSources`: the game views, the event reader (`playerGames`), the economy views and the pool quoter (null without an economy), the indexer client, the Training store |
| `chain.ts` | `useSpawnPaused`, `useEntryPrice`, `useGame`, `usePlayerGames`, `useActiveGame`, `useQuote`, `useSplit`, `usePoolQuote`, `useTerms`, `useEconomyDay`, `useVaultPosition`, `useUsdcBalance`, `usePavedBalance` |
| `indexer.ts` | `useLeaderboard`, `useTopThree`, `useLeaderboardEntry`, `usePlayerProfile`, `useIndexedPlayerGames`, `useIndexedGame`, `useDefinitions`, `usePlayerQuests` (progress joined with each definition's schedule), `usePlayerAchievements`, `usePlayerStatus` |
| `training.ts` | `useTrainingSession` (the board's session: a new `TrainingGame` with a random seed on every entry, read with `useSyncExternalStore`, and `boardOf` for the scene), `useFinishedTraining` (`/training/over`: the game the board of this tab played, held in memory; none after a reload, so the page goes to `/training`, a new game) |
| `scene-types.ts` | compile-time checks that each hook's data is its scene prop's type |

Each hook returns the type its scene's prop takes; where the indexer's type differs, the hook maps it (the quests'
schedule from the definitions; a new player's null profile as an empty one). A past day's leaderboard and a closed
economy day have `staleTime: Infinity`. No hook polls; the writes (P5, P7, P10) update these keys from their receipts.

**Mock data (MOCK-FIRST, issue 549).** Every read and write is served on the device by a mock ledger since #927, behind the
same interfaces as the chain path, so the client works end to end, on its own, before the fresh deployment: no node, no
indexer, no outside service, and no request outside the app's origin.
One switch, `VITE_DATA_SOURCE` (`data/data-source.ts`): `chain` or `mock`; unset, `mock` on Sepolia (`MOCK_BY_DEFAULT`) and
`chain` everywhere else. Before #927 the mock served only what the classes lack; measured on 2026-10-19 against Sepolia's classes: Setup has none of the Cobbles ledger, packs or
skins; the Vault has none of its ERC4626 views or writes; Challenge has no `spawn_paused`, `guardian`, `spawn_free` or
`initial_seed`; Economy has no `split_bps` or `seller`; the indexer's definitions carry no Cobbles and it has no referrals
route.

| Module | What it holds |
|---|---|
| `data/mock/ledger.ts` | `MockLedger`: `MockedReads` (`CobbleViews`, `PackViews`, `SkinViews`, `VaultViews`, `spawnPaused`, `guardian`, `split`, `seller`, the USDC and PAVED balances) and `MockedWrites` (the claims, `buySkin`, `setSkins`, a pack's purchase, the faucet's `mint`, deposit, withdraw, withdraw all), with the contracts' checks, their typed refusals and their receipts' events; kept in `localStorage` (`paved.mock.v1`) |
| `data/mock/challenge.ts` | the Challenge's games and the Economy's days on the device (#927): a game's purchase (paid from the ledger's USDC), free spawn, moves, end and settlement, played by game-core's rules (`SeededChallenge`: the VRF's queue, each draw from a seed kept with the game, so a game replays the same after a reload; the mean of `mean.cairo`, the curve of `curve.cairo`), read as `game`, `tiles`, `draw`, `initialSeed`, `terms`, `day`, `quote` and the player's games of the events |
| `data/mock/overlay.ts` | the overlays: each answers its entry points (`MOCKED_GAME_READS`, `MOCKED_ECONOMY_READS`, `MOCKED_WRITES`) from the ledger over a part beneath it; in the app that part is `offline` (`data/mock/app.ts`), so nothing falls through to a chain |
| `data/mock/app.ts` | the app's mock (#927): `appLedger()` (one ledger on `localStorage`, its seller the deployment's `Setup`) and `appMockSources()`, every source of `DataSources` on it: the views, the events, the economy's views, the pool, the indexer, a signer's purchases, settlement and Vault writes. No chain, economy or indexer client is built. A read the ledger does not answer is refused by `offline` (`not-configured`, as a deployment without it), a write by `offlineSigner` (`MockAccountError`, nothing sent) |
| `data/mock/starknet-shim.ts` | what `starknet` resolves to in a mock build (`vite.config.ts`, `mockWithoutStarknet`): the pure helpers `@paved/chain` calls on the mock's way (a key's address, the selectors, a revert's short string), on `@scure/starknet` as starknet.js computes them, and node classes that refuse. A mock build carries no starknet.js; `scripts/bundle-budget.ts` fails one that does (`starknetInMock`). The Storybook keeps starknet.js |
| `data/mock/indexer.ts` | the mock's indexer (#927): every route of `IndexerClient` from the ledger, no indexer client built. The leaderboard and the days rank the device's games (every account's) among the seeded players'; a player's profile and games, a game's row with its terms (its threshold once settled), the referrals, the attacks; the quests and achievements of the fresh deployment (`data/mock/definitions.ts`, with the fifth daily of `dailies.ts`), their progress counted from each game over's report as `quests.cairo` builds it (tasks 1 to 4 for the quests, 1 and 4 to 7 for the achievements, on the time the game ended; a free game reports no quest progress), and the podium (task 8) from the mock's own leaderboard of a closed day. The head is the ledger's clock |
| `data/mock/players.ts` | the twenty seeded players (#927, open point 2): names drawn by #926's generator on a Poseidon seed, the face the mock gives a player it did not see, a level, crowns (their league) and a village (a rival's layout of their level); their Challenge days drawn from Poseidon on their index and the day, the same on every device, from the mock's season start |
| `wallet/mock-connector.ts` | the connector of a mock build (#927), which `WalletProvider` loads in place of `wallet/connector.ts`: `mockKeyConnector` on `localStorage` and `appLedger()`, the ledger's writes over it (`mockConnector`), its account's other writes refused by `offlineSigner` |
| `wallet/mock-key.ts` | the mock's wallet (#927): the device's key in `localStorage`, as the chain's connector keeps it (the same address for the same key), and its account the ledger's: no node is read and nothing is deployed. A write the mock does not answer yet is refused before sending (`MOCK_ACCOUNT_UNSENT`). Reset forgets the key and the ledger's account (`MockLedger.forget`) |

Applied in two places only (#927): `routes/sources.ts` gives `MOCK_SOURCES` on `mock` (each part loads `data/mock/app.ts`
with its first call) and `wallet/wallet.tsx` loads `wallet/mock-connector.ts`. The chain path's modules (`chain-client.ts`,
`economy-client.ts`, `settle-client.ts`, `vault-client.ts`, `wallet/connector.ts`) are the `chain` source's alone and a mock
build never loads them; the deployment's file and `VITE_*` values are read by `data/deployment.ts`, which builds no client.
`__tests__/mock-no-fetch.test.ts` is the guard: with `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`
refused, starknet.js's node classes and `@paved/chain`'s clients unbuildable and the chain modules unloadable, it walks #927's
acceptance on the mock's sources (connect, the village, a Challenge game to its settlement, a mission, First Stone, a chest,
the shop, the Vault, a PvP attack, the leaderboard and a player page, Reset) and calls every mocked read, indexer route and
write, and fails on any request. On the mock the query client runs every read and write with the browser offline too
(`lib/query-client.ts`, `networkMode: "always"`), where TanStack Query's default pauses them until the network is back. Its
files come offline from the mock build's service worker (`vite/offline-worker.ts`, `sw.js`, registered by
`lib/offline-worker.ts` after the legacy clearing of #589, on the mock alone): at install the files a page runs on (the HTML,
the scripts, the styles, the fonts, Font Awesome, the sound effects, 5.4 MB on 2026-10-31), once active the renderer's assets
and the large images (13 MB), never the maps or the music; a navigation offline gets the cached `index.html`. A new build's
worker takes the open tabs at once but keeps the old build's cache, and answers from it, until every tab open at the update has
closed: such a tab runs the old build, and its lazy chunks are in that cache alone. So the client
runs with the network cut seconds after the first load: Connect, every page and a reload. A `chain` build has no worker. The games are the ledger's (#927): a Challenge game is bought or spawned free,
played, ended and settled on the device by the contracts' rules and checks (a day settles from the end of the next day, as
on chain), its reward minted in the ledger's PAVED. The tokens are the ledger's (#927): USDC, PAVED and the Vault's vPAVED, read from no node. A new account holds the
faucet's USDC (100) and no PAVED (`MOCK_STARTING_BALANCES`); "Get test USDC" is always there on the mock and mints 100 more,
with no cap. The claims trust the indexer's progress, which the page shows: on the mock it is counted from the ledger's
games. The free spawn spends a credit of the ledger. Every page reads mocked data since #927 and shows the "Mock" mark beside
its title (`MOCKED_PAGES`, the route map), whose text says the client runs on the device's data alone (`MOCK_MARK_TEXT`). When the fresh deployment lands, `VITE_DATA_SOURCE=chain` in the host's environment restores the chain
path with no code change; `__tests__/data-mock.test.tsx` runs the same hook flows on both.

**Decided for the owner:** React Router 7 (data mode, lazy routes) rather than TanStack Router: already in
the repository and in both references. Reversed if typed search params become a pain point.

### 3.4 Breakpoints

Mobile first: the base styles are the small mobile; each breakpoint adds.

| Name | From | Devices | What changes |
|---|---|---|---|
| (base) small mobile | 320 px | iPhone SE, small Android | one column; the bottom navigation shows icons only; the tile hand is a compact bar (tile, rotate, place); 14 px body text; page titles 20 px |
| `mobile` | 360 px (22.5 rem) | most phones | bottom navigation with the current item's label under its icon (TAB-SWIPE, #726); hand panel as in the mockups (tile preview + Place / Discard); 16 px body |
| `tablet` | 640 px (40 rem) | large phones landscape, tablets | lists and cards in two columns (quests, achievements, leaderboard + player); the board's hand panel becomes a floating card at the bottom right; dialogs centred instead of bottom sheets |
| `desktop` | 1024 px (64 rem) | laptops | the bottom navigation becomes a header across the top (direction D, section 6.2; the left rail is gone); the board takes the centre with a right panel (score, tile in hand, placement preview, actions); hover states and keyboard shortcuts shown (R rotate, D discard, V camera) |
| `wide` | 1440 px (90 rem) | large screens | content capped at 1200 px except the board, which fills |

Also: `100dvh` with a `100vh` fallback for full-height screens (as t-0126 did), `env(safe-area-inset-*)`
for notches and the home indicator, touch targets at least 44 px.

Text at 360 and 320 px (WRAP360, 2026-10-15). Descriptions, labels, hints and titles wrap (`wrap-anywhere`, `min-w-0`
on flex and grid children, no fixed heights); a page's grid states its column (`grid-cols-1`, `minmax(0,1fr)`), so one
long word cannot widen it. Addresses are cut in the middle (`elements/short-address.tsx`, `0x05f1…6e7f`, never broken
over two lines) and names with an end ellipsis, the full value in `title`. Figures (amounts, scores, times) keep one
line; an amount's symbol may go under its figure. An icon beside wrapping text sits on its first line (`items-start`,
a 20 px box). Every text-showing component has a `Stress` story (`src/mocks/stress.ts`: a long sentence, a 66-character
address, a German compound, large figures). `bun run --filter @paved/app wrap-sweep`, after `build-storybook`, opens every
story at 360 and 320 px in headless Chromium and fails on text that leaves its box, text cut without its full value,
an address or monospace run broken over two lines, or a page that scrolls sideways; its allowlist names each deliberate
exception. The CI runs it in four `wrap-sweep` shards (`--shard i/4`).

Numbers and dates in en-US (NUM-LOCALE, P-66). Every number, token amount, percentage and date on screen is written in
en-US ("1,234.50", "73.68%", "Thu, Oct 15, 17:00"), not in the browser's locale, as long as the app is not multilingual.
`packages/game-core/src/format.ts` is the one place that formats: a `LOCALE` constant and named functions (`formatNumber`,
`formatInteger`, `formatUnits`, `formatBps`, `formatPercent`, `formatDate`, ...), the single point a future i18n replaces.
It lives in `game-core` because the app, `packages/ui` and the other packages already depend on it, so no import cycle.
No other file calls `toLocaleString` (with or without a locale) or builds an `Intl.NumberFormat`, `Intl.DateTimeFormat` or
`Intl.RelativeTimeFormat`: `game-core/__tests__/locale-guard.test.ts` scans `app`, `ui`, `renderer`, `chain` and `game-core`
sources (not app-web's own files) in `bun run test`, and is itself tested on a fixture that must fail. The tests of
`game-core`, `ui` and `app` run under `fr_FR` and `Europe/Paris` (their `vitest.config.ts`; `process-locale.test.ts` proves
the setting took). `scripts/locale-check.ts` opens six stories (amounts, a score, Cobbles, a deadline, the day picker) in a
Playwright context with `locale: "de-DE"` and fails on a German separator or month; the `wrap-sweep` script runs it after the
sweep; the CI runs it once, in the `client-storybook` job, beside the wrap shards. A date shows weekday, month
then day, on a 24 h clock (the former en-GB order is gone).
Game-boundary times (UTC-BOUND, PM ruling 2026-10-16, replacing "local time plus a UTC tooltip"): a game boundary (the 24 h
expiry, "Settles in") is shown in UTC with the "UTC" label, never local, and leads with the relative time, so the player
never converts: "in 23 h 12 min · Fri, Oct 16, 17:00 UTC", "The 24 h ended 2 h ago (Thu, Oct 15, 17:00 UTC)". `formatRelative`
and `formatBoundary` in `format.ts` write both (relative to the minute, hours up to 48 h, then days; no
`Intl.RelativeTimeFormat`); nothing is only in a tooltip. The element (`Boundary`, `Deadline`) updates once a minute and is a
`<time dateTime>` with an `aria-label`. `formatLocal` and `formatUtc` are gone.

An app, not a page (APP-FEEL, P-69). Text, icons and images never highlight on a tap, a long press or a double click:
`body` is `select-none` (`styles/theme.css`, the base layer), and only a copy target opts back in with `select-text` (the
referral link, a full address, an error detail, and every input and textarea). Page zoom is off: the viewport meta is
`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`; iOS Safari ignores
`user-scalable`, so `touch-action: manipulation` stops the double-tap zoom and `usePageGestures` (`lib/page-gestures.ts`)
cancels its `gesturestart` and `gesturechange`. The board's canvas has `touch-action: none` and owns its pinch, pan and
rotate; its context menu is off. There is no long-press menu (`-webkit-touch-callout: none`), no tap flash, and images
are not draggable. The document has `overscroll-behavior: none` on `html` and `body` (#611): no pull-to-refresh and no
bounce on any page. A tab page is one viewport tall and scrolls in its own region (`TabFrame`, `overscroll-behavior:
contain`), so its navigation stays fixed to the bottom; a full-screen flow scrolls as one document. The cost: a player with low vision cannot pinch the
page. The mitigations are text of 12 px or more, the 360 and 320 px wrap sweep, and a layout in `rem`, so the browser's
text-size setting still applies where the layout allows. `scripts/mobile-feel.ts` (the CI `client-storybook` job) drives a mobile
device context.

One error component (ERR-UI, P-67). Every error the app shows, a failed read, a refused write, a refused input, an error
toast, goes through `InlineError` (`src/components/elements/inline-error.tsx`): the `triangle-exclamation` icon, `text-sm`
in the body font, the `destructive-text` token, two lines at most then an ellipsis (the whole text in its `title` and for
screen readers), and a Copy button that puts the message and its detail on the clipboard as plain text for support: the
typed error's name, the transaction hash, the game id, the app version and the time the error was first shown, in UTC.
"Copied" follows only a copy that succeeded; without the Clipboard API, or when it refuses, the component says "Copy failed:
select the text" and shows the whole text, selected, to copy by hand. The component reads nothing: the
route builds the detail (`src/routes/error-detail.ts`, from a `@paved/chain` error's `name` and `transactionHash`) and the
scene passes it down as a prop. A host renders it always, with `message` null when there is no error, so its height
animates as the error appears, changes or goes (Motion, 0.18 s, none under reduced motion); once the fold ends it renders
nothing, so a flex or grid parent adds no gap for it. An error that replaces a page's content mounts with the same
animation. An error with no place on its page (a failed claim, a free game that did not
start, the wallet's connect) is a toast that holds `InlineError` (`containers/error-toast.tsx`), never Sonner's own error
style; inside a toast it starts at its height (`animateIn={false}`), since Sonner measures a custom toast on mount. A `Notice` is a state (a guest, purchases paused, the economy not deployed, storage off, an outcome to check) and has
no danger tone. `__tests__/error-guard.test.ts` fails on an error role, an assertive live region, a `toast.error` or
`toast.warning`, a danger `Notice` (on one line or several), or an error colour (`text-destructive*`,
`border-destructive*`) outside `InlineError` and a listed, counted set of non-error uses, under `src/components`,
`src/routes` and `src/wallet`, and is tested on a fixture that must fail.

### 3.5 Animated components: chosen sources

F3b (2026-10-14), from the owner's list through the PM: animate-ui.com, motion-primitives.com, magicui.design,
coss.com, cult-ui.com, motion.dev, embla-carousel.com. Each registry was read at a named commit (`git clone --depth
1`, 2026-10-14); the chosen source was copied in by hand, restyled to the semantic tokens, with its source and commit
in the file header, and its licence in `packages/app/public/THIRD_PARTY_NOTICES.txt`. No registry CLI was run and
nothing is fetched at run time.

| Primitive or pattern | Library | Component | Version or commit | Licence | Why | In the repository |
|---|---|---|---|---|---|---|
| Button (press feedback) | motion.dev | the tap gesture, `whileTap` (kept from F3) | `motion` 14.0.0 | MIT | No MIT registry has a press button beyond a `whileTap`: Magic UI's and cult-ui's buttons are decorative effects (shimmer, ripple, glow, CSS keyframes); animate-ui's Button was not a candidate of F3c. F3's button already is Motion's gesture. | `ui/button.tsx` |
| Tabs (animated indicator) | motion-primitives | AnimatedBackground | `ibelick/motion-primitives` 120f64f | MIT | A shared `layoutId` highlight in the active trigger replaces F3's measured indicator (no `ResizeObserver`, no font wait); it stays on Radix Tabs (keyboard, roles). cult-ui's Direction Aware Tabs has its own buttons (no tab roles, no arrow keys). Its `AnimatePresence` fade (for its hover mode) is not taken: a tab list always has an active tab. | `ui/tabs.tsx` (same API) |
| Dialog (enter and exit) | motion-primitives | Dialog: its variants (opacity, scale 0.9 to 1) and transition (ease out, 0.2 s) | 120f64f | MIT | Motion replaces F3's CSS keyframes, the same vocabulary as the Sheet. Its native `<dialog>` is not taken: Radix keeps the focus trap, the focus return and the labelling. | `ui/dialog.tsx` (same API) |
| Sheet (enter and exit) | motion.dev | `AnimatePresence` on a force-mounted Radix dialog (kept from F3) | `motion` 14.0.0 | MIT | No MIT registry has a Radix sheet on Motion (motion-primitives and Magic UI have none; cult-ui's Family Drawer needs `vaul`, a second drawer runtime). The Dialog now has the same structure. | `ui/sheet.tsx` |
| Toast | Sonner | Toaster (shadcn/ui's wrapper, kept from F3) | `sonner` 2.0.8 | MIT | Already in the repository; CSS transitions, no JS animation runtime. coss ui's toast is on Base UI (a second primitive library beside Radix); cult-ui's Halo Toast is a visual, not a queue. Reduced motion now follows `MotionConfig` (`toaster-reduced-motion`) as well as the media query. | `ui/sonner.tsx` |
| Animated counter (score, PAVED amounts) | Magic UI | Number Ticker | `magicuidesign/magicui` 85f97fd | MIT | Motion hooks only (`useSpring`, `useInView`), no `m` component, writes the text without a React render per frame. motion-primitives' Animated Number uses `motion.create` (breaks `LazyMotion strict`); its Sliding Number needs `react-use-measure`. | `elements/number-ticker.tsx` |
| List enter and exit (leaderboard rows, closings list) | Magic UI | Animated List (its `AnimatedListItem`) | 85f97fd | MIT | `AnimatePresence` + `layout`: rows grow in, shrink out, and the others slide. motion-primitives' Animated Group has no exit. The original's one-row-per-second reveal (a notification demo) is dropped. | `ui/animated-list.tsx` |
| Carousel (Play's mode cards, the themes) | embla-carousel.com, through shadcn/ui | Carousel | `embla-carousel-react` 8.6.0; `shadcn-ui/ui` 0023018 | MIT | The owner's choice; shadcn/ui's wrapper gives the region and slide roles and the arrow keys. animate-ui's Motion Carousel is not taken (F3c, below). | `ui/carousel.tsx` |

**Not taken, and why:**

- **animate-ui** (`imskyleen/animate-ui` efeb96f): its licence is "MIT + Commons Clause", not MIT: the components may be
  used in a product "so long as you do not sell or redistribute the components themselves in their original form". The
  repository is public under Apache 2.0, so copying them in redistributes their source. The owner allowed
  animate-ui (2026-10-14), under four conditions:
  1. every file copied from it keeps its own notice, MIT + Commons Clause, in its header, and is never relicensed as
     Apache-2.0;
  2. it is listed in `THIRD_PARTY_NOTICES.txt`, naming the clause;
  3. the repository's licence notes say these files are under their own licence;
  4. it is used only where clearly better, and a plain-MIT equivalent of equal quality is preferred.

  F3b copies nothing from it. F3c compared its Tabs, Dialog, Sheet and Carousel with F3b's and takes none (below), so
  conditions 1 to 3 have no file to apply to: nothing of animate-ui is in the repository, `THIRD_PARTY_NOTICES.txt`
  does not list it, and no licence note is added. They apply as written to the first file a later task copies in
  (`readme.md` has no licence section, so its note would be a `LICENSE-NOTES.md` beside `LICENSE`).
- **coss ui** (`cosscom/ui` 107dc0a; `apps/ui` MIT, the rest of the repository AGPL-3.0): built on Base UI. Taking its
  components would put a second primitive library beside Radix (F3).
- **cult-ui** (`nolly-studio/cult-ui` 7f031dc, MIT): read; its components are marketing effects or need other
  libraries (`react-use-measure`, `vaul`); none beats the choices above for these primitives.

**F3c: animate-ui against F3b (2026-10-14).** `imskyleen/animate-ui` read at
`efeb96ffd7a3b7a4868667e4ac3c346620fb3044` (F3b's commit, still the head of `main` that day), its Radix
`components/radix/{tabs,dialog,sheet}` with their `primitives/radix/*` and `primitives/effects/highlight`, and
`components/community/motion-carousel`. Licence: MIT + Commons Clause. The rule is condition 4: take one only where it
is clearly better, with a reason that can be shown. Size is `bun build --minify` of the component file (React, Radix,
Motion, Embla and `cn`'s packages external), then `gzip -9`, on the Mac; F3b's file measured the same way.

| Candidate | Motion | Accessibility | Reduced motion | Size (min, gzip) | API fit | Outcome |
|---|---|---|---|---|---|---|
| Tabs (`Highlight` + `TabsContents`) | The same shared `layoutId` highlight as F3b's (spring 200/25 against 500/36), plus a fade and blur on a panel and an auto-height container | Radix Tabs underneath, but `HighlightItem` wraps each trigger in a `div` that carries `aria-selected` with no role, and copies it onto the highlight `div` too (`highlight/index.tsx` 484-490, 585, 614); ARIA 1.2 does not allow `aria-selected` on a generic element | The panel's blur is a `filter`, which Motion's reduced motion does not drop (below) | 11,982 B, 4,019 B, against 897 B for F3b's | `TabsContents` must wrap the panels: a new part for every caller. The panel's enter plays only on first mount: Radix's `TabsContent` keeps its element mounted and toggles `hidden` (`@radix-ui/react-tabs` 1.2.1, `dist/index.mjs` 168-185), so its `AnimatePresence` never sees a change of tab | **Keep F3b's.** Same highlight, 4.5 times the size, an ARIA defect, and a panel animation that does not run on a tab change |
| Dialog | A 3D flip: `perspective(500px) rotateX(-20deg) scale(0.8)` and `blur(4px)` to flat, spring 150/25 | Radix Dialog, as F3b's | **Worse**: the flip is one `transform` string, and Motion 14.0.0 reduces only its positional keys (`x`, `y`, `scale`, `rotateX`… and `width`, `top`…; `motion-dom` `visual-element-target.mjs` 83-84, `keys-position.mjs`), so under reduced motion the flip and the blur still play; F3b's `scale` is dropped and only the fade stays | 4,795 B, 1,667 B, against 1,254 B | Same parts; a `from` prop added | **Keep F3b's.** Its reduced motion is correct and the flip's would not be |
| Sheet | The same structure as F3b's (`AnimatePresence` on a force-mounted Radix portal, slide on `x` or `y`), plus an opacity fade on the panel and a `blur` on the overlay; spring 150/22 against 420/40 (slower; both near critical, 0.90 and 0.98 of it) | Radix Dialog, as F3b's | The slide is dropped as in F3b's; the overlay's blur still plays (a `filter`) | 4,528 B, 1,581 B, against 1,247 B | Same parts | **Keep F3b's.** Equal in structure and behaviour: condition 4 prefers the MIT one |
| Carousel (Motion Carousel) | Embla with the active slide scaled 0.9 to 1 and dots that grow into a labelled pill | No `region` or slide roles, no arrow keys, dots without `aria-current` | `scrollTo`, `scrollPrev` and `scrollNext` always animate (no `jump`); F3b's jump under reduced motion | 5,599 B, 2,150 B (its own Button included), against 2,078 B | A demo: it takes `slides: number[]` and renders the numbers; none of `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` or `setApi` | **Keep F3b's.** It would need rewriting into F3b's API, and loses the roles, keys and reduced motion |

The entry chunk and `motion-features` do not move with any of the four: no page imports these components yet (Phase
2), and none needs a Motion feature beyond `domMax`. The look was judged from each source's parameters (springs,
transforms, filters) and the behaviours above, not from a Storybook capture: none was copied in, so none has a story.

**One animation runtime: Motion.** Every component above animates with Motion, except two that are not a second
Motion: Sonner animates its toasts with CSS transitions (no JS runtime), and Embla, the owner's carousel engine,
animates the track's scroll with its own drag and snap physics, which Motion does not provide. Both follow reduced
motion: Sonner through `theme.css`, Embla's buttons and arrow keys jump instead of scrolling. The settle after a drag
is driven by the user's own gesture and keeps its motion: in Embla 8.6 the `duration` option sets only the API
scrolls (which already jump), and the release settle uses a base speed (25, or 43 with `dragFree`) that the release
force lowers by up to 10 (Embla 8.6.0 `DragHandler.ts`), which no option reaches.

**The feature set is now `domMax`** (section 3.2 said `domAnimation`): the tab highlight's shared `layoutId` and the
list's `layout` need Motion's layout features. It still loads after the first paint (`components/motion-features.ts`, its
own chunk); the entry chunk does not load Motion's features.

**Reduced motion:** the app's `MotionConfig reducedMotion="user"` is the one switch. Motion drops transforms and makes
layout animations instant; the Number Ticker and the Carousel read it with `useReducedMotionConfig`; the Toaster too.
Each component has a story with reduced motion off and on (`parameters.reducedMotion`, read by `.storybook/preview.tsx`).

**Measured (VPS, 2026-10-14, `bun run build` in `packages/app`, Vite's gzip figures):**

| Chunk | Before (main, ab19bca) | After (F3b, measured before F1b's merge) |
|---|---|---|
| Entry `index-*.js` | 378.47 kB, 120.11 kB gzip | 378.79 kB, 120.24 kB gzip |
| `motion-features-*.js` (after paint) | 37.93 kB, 14.58 kB gzip (`domAnimation`) | 85.93 kB, 28.50 kB gzip (`domMax`) |
| CSS | 39.18 kB, 7.96 kB gzip | 39.76 kB, 8.08 kB gzip |

**On main after F1b and F3b (Mac, 2026-10-14, `bun run build` in `packages/app` at 56c4e237, bun 1.4.2), F3c's before
and after:** entry 379.86 kB, **120.68 kB gzip**; `motion-features` 85.93 kB, 28.50 kB gzip; CSS 41.37 kB, 8.36 kB
gzip. F3c takes nothing, so its after is the same build.

The entry stays within the 200 kB gzip budget, and so do entry and features together (149.18 kB gzip on main). No page imports
the new components yet (Phase 2), so they are not in these chunks: Embla will add 20,105 B minified, 8,148 B gzip
(`bun build --minify` of `embla-carousel-react` 8.6.0 without React, `gzip -9`) to the route that uses the carousel.
Storybook (`build-storybook`): 9,381,569 B in 82 assets before, 9,435,474 B in 87 after.

---

## 4. Storybook

### 4.1 Structure

Storybook 10 with `@storybook/react-vite` (10.6.2 today), in the new app package (section 7):

```
packages/app/
├── .storybook/
│   ├── main.ts          framework react-vite; stories: src/**/*.stories.tsx; addons: docs, a11y; staticDirs (below)
│   ├── preview.tsx      imports src/styles/theme.css; MotionConfig; QueryClient with fixtures; MemoryRouter
│   └── preview-head.html  font preloads
└── src/
    ├── styles/          theme.css, *.stories.tsx (Foundations)
    └── components/
        ├── ui/          shadcn primitives + their stories
        ├── elements/    game atoms (tile chip, score, stat row…) + stories
        ├── containers/  composites (hand panel, mode card, leaderboard table…) + stories
        └── scenes/      one per page, on fixture data + stories
```

**Static dirs.** `main.ts` takes its `staticDirs` from `scripts/storybook-static-dirs.ts`: the app's `public/` at the root
(Font Awesome scripts; `renderer-assets/`: the hashed models and 256 px tiles, which stories with a manifest of their own load
from `/renderer-assets`) and `asset-sources/` at `/asset-sources` (plain models, the original tile images, the Draco decoder:
the stories with no manifest). Storybook copies the entries at once, and two copies creating one folder raced on `mkdir`
(`EEXIST`, three CI failures, SB-COPY), so no two entries write a folder in common: `build-storybook` runs the check first and
`__tests__/storybook-static-dirs.test.ts` covers it.

The sidebar follows the tiers:

| Section | Stories |
|---|---|
| **Foundations** | Colors (every scale 50–950 with its hex and OKLCH, then the semantic tokens on their real backgrounds, with the contrast ratio), Typography (each family, weight and size step, the tabular numbers), Icons (the Font Awesome set in use), Motion (button press, tab indicator, sheet, toast, with reduced motion on and off), Spacing and radius, Breakpoints |
| **UI** | every shadcn primitive in every variant and state (default, hover, focus, disabled, loading) |
| **Elements** / **Containers** | every game component, one story per state (for example the hand panel: empty, a tile, pending, refused) |
| **Tiles / Base** | the 19 base tiles of `packages/app/asset-sources/models/` (the models the game plays), each rendered by the real renderer in a small canvas, rotatable through the four orientations, with its plan code and its 2D PNG beside it |
| **Tiles / Extended** | the 144 variant models of `origin/dev` (`<plan>_LF_<n>` and `<plan>_HF_<n>`: low and high forest density, 1 to 9 variants per plan, PR #162, 2024; to be brought over from that branch, never merged) and the 18 2D tiles of `app/public/assets/tiles/` that the 19-model set lacks; grouped by plan. Folder: `packages/app/asset-sources/models/extended/` (the 2D tiles in its `tiles/`). The variants are Draco-compressed: the renderer's `AssetLoader` decodes them lazily, with the decoder self-hosted at `<basePath>/draco/` (`packages/app/asset-sources/draco/`). `origin/dev` has 38 2D tiles, 20 of them in the 19-model set (`00.png` included), so 18 lack a model. |
| **Board** | the board on recorded boards (the bench fixtures at 38 and 72 tiles), with the outline width control (section 5) |
| **Scenes** | each page of section 6 on fixtures, one story per state, shown at the full width of the preview by default, and at the width Storybook's own viewport toolbar picks (mobile 360, tablet 640, desktop 1024, wide 1440); no frame, no `viewport` arg |

**The background (spec A):** the board's colour, `--board` = `#0C0D0F` since direction D (section 2.2b; it was `#07111A`),
set as Storybook's only background (`parameters.backgrounds`), and the Storybook UI itself themed dark (`storybook/theming`
`create({ base: "dark", appBg: BOARD })`).

### 4.2 Hosting at `storybook.paved.bal7hazar.com`

- **Build:** `bun run --filter @paved/app build-storybook`, which runs `storybook build -o
  storybook-static`. **Output:** `packages/app/storybook-static/` (a static site: `index.html`,
  `iframe.html`, assets).
- **Publish:** Vercel, from `main` on every merge (project `paved-storybook`); the settings, previews and ignore step are in
  `docs/client/storybook-hosting.md`. Until 2026-10-17 the VPS served it with `publish.sh` and `switch.sh` (see git history).
- **History:** the VPS root step (web root, Caddy site) of P-57 B7 is gone with the VPS hosting (P-76).

- Storybook is public, like the client. It holds no secret: fixtures only, no RPC URL beyond the public
  ones, no controller.

- **The app's own build serves the board's 3D assets too (ASSETS, 2026-10-15; compressed, hashed and ordered by
  ASSET-WEIGHT, 2026-10-15).** Under `<base>renderer-assets/` (Vite's `base`), no request leaving the app's origin:
  - **Models, the app's own copy, compressed and content-hashed:** `packages/app/scripts/compress-models.ts`
    (`node scripts/compress-models.ts`; `--check` fails when the committed copy is stale, and a test runs it) reads
    the 19 base models (`packages/app/asset-sources/models/<plan>.glb`, as modelled but for the P-78 fix below) and writes
    `packages/app/public/renderer-assets/models/<plan>.<hash>.glb`, the hash being the first 10 hex digits of the file's
    SHA-256. Per model: vertices renumbered by first use (triangles and their order kept); `KHR_mesh_quantization`, every
    attribute normalized (positions 8-bit, one voxel step per integer, exact on the 0.1 grid; normals 16-bit; UVs
    unsigned 16-bit); then
    `EXT_meshopt_compression` (vertex and index codecs, no lossy filter). The script decodes each copy and checks it
    against its source (largest moves on the grid: position 6.1e-6, normal 0.001 degree, UV 7.6e-6), and a test checks
    that the renderer's outline builder finds the same segments in every copy as in its original. Every model's
    vertices are on the 0.1 voxel grid (the quantization above is exact on it), and `node packages/app/scripts/voxel-parity.ts`
    (and a test) checks closure by parity only: it casts a ray down each of a tile's 40 by 40 columns and finds every one
    crossed an even number of times, in the sources and in the shipped copies. That is evidence of a closed solid, not a proof
    (it does not check watertight edges or orientation), but it is what a voxelizer needs, so it needs no tolerance code (P-78 moved `sfrfrfffr`'s one stray vertex, a ramp across the tile,
    to the corner it belongs to). Positions are
    normalized so that the outline builder (`edges.ts`) keys them by number: raw integers up to 40 sent it to its string
    keys, and the 35-tile board's first frame was then no faster than with the originals. Tools, pinned devDependencies
    of `@paved/app`: `@gltf-transform/core` and `@gltf-transform/extensions` 4.5.1, `meshoptimizer` 1.1.1 (`bun.lock`
    adds those three and `property-graph` 4.1.0, `ktx-parse` 1.1.0). Vite serves the folder in dev and copies it into
    `dist/`. The decoder is three's `meshopt_decoder.module.js`, in the bundle, decoding in two workers that the first
    `AssetLoader` starts from an inline script (a `blob:` URL): a future Content-Security-Policy needs `worker-src blob:`.
    Positions are lossless; normals and UVs within 0.001 degree / 8e-6.
  - **The manifest,** `renderer-assets/manifest.json`, `{ "models": { "<plan>": "models/<plan>.<hash>.glb" } }`, built by
    `packages/app/vite/renderer-assets.ts` from the file names (the build fails when a name's hash is not its file's, or a
    plan has two files): served in dev, written into `dist/` at build. `AssetLoader` reads `<basePath>/manifest.json` once
    per base path; a plan it does not list, or no manifest (a 404 or a body that is not one: Storybook, which still maps
    `asset-sources/` whole), loads `models/<plan>.glb`. A network or server error is tried twice more (after 250 and
    1000 ms), then the scene does not start and the page shows its plan view. Dev still answers those plain names from `asset-sources/`; the build ships no original model and no Draco
    decoder.
  - **The Forest models (P11b, 2026-10-16),** theme 1 on chain (`Setup`'s skins, cobbles v1, part 3): the 72 high-forest
    variants of `packages/app/asset-sources/models/extended/<plan>_HF_<n>.glb` (every plan has one to nine), written by the same
    script into `packages/app/public/renderer-assets/models/forest/<plan>_HF_<n>.<hash>.glb`. The low-forest set (`_LF_`) is
    kept for a later theme and not written. Those sources are Draco-compressed: the script decodes them with the
    self-hosted Draco decoder (`asset-sources/draco/draco_decoder.js`, the renderer's own copy, run in Node: no package added). They
    sit on Draco's 14-bit grid, off the origin (a tile spans x -54.9 to -50.9); every coordinate is within Draco's half step
    (1.2e-4) of the 0.1 voxel grid, so each is snapped back to it and stored as an 8-bit integer about the model's centre,
    the offset joining the node's translation: the art's positions exactly, each within 1.3e-4 of the decoded source, which
    the script checks. Normals are all along an axis there, so 8-bit and exact; UVs unsigned 16-bit (7.6e-6); meshopt as the
    base set. 72 files, 7,493,028 B (the Draco sources: 1,869,644 B); one tile loads one variant. Vite copies them into
    `dist/` with the rest of `public/`. Kept on Draco's own grid instead (16-bit, exact to the decoded source): 13,131,712 B.
    **The manifest** gains `themes`, keyed by theme id on chain, then plan key, the variants in order:
    `{ "models": {...}, "themes": { "1": { "<plan>": ["models/forest/<plan>_HF_1.<hash>.glb", ...] } } }`, built from the file
    names (`THEME_FOLDERS` in `vite/renderer-assets.ts`; a wrong hash fails the build); `AssetLoader` reads `themes` too since
    SKIN-RENDER (5.6), which draws each tile with its player's active skin. The tests list all 19 plans of Forest and keep `--check` exact
    for both sets. The theme page's tile chips use the base images (the plan view's art, PM ruling): showing the 3D Forest tile
    there would need `TileView` to load a model by path, a renderer change.
 (19, the plan view's and the tile chips'), from `asset-sources/` under their
    plain names, served in dev and copied at build.
  - **Tile images, the app's own 256 px copy, content-hashed (TEX, 2026-10-16; PM ruling of that day: 1680 px was too
    much):** `packages/app/scripts/compress-tiles.ts` (`node scripts/compress-tiles.ts`; `--check` fails when a committed
    copy is stale, comparing decoded pixels and not bytes, so a zlib update cannot fail it, and a test runs it) reads the 19 original 1680 x 1680 PNGs (left untouched) and writes
    `public/renderer-assets/tiles/<plan>.256.<hash>.png`, the hash being the first 10 hex digits of the file's SHA-256.
    No package: the script reads and writes PNG with `node:zlib` (an exact area-average resize on premultiplied alpha;
    sharp and the WASM codecs are not dependencies of the repository, and `pngjs` is only a transitive one). PNG, not
    WebP: no encoder is in the repository, and `TextureLoader` decodes through the browser, which reads PNG everywhere.
    The manifest lists them by size, then plan (`tiles: { "256": { "<plan>": "tiles/<plan>.256.<hash>.png" } }`;
    `checkHash` covers them), and `AssetLoader` asks for that path, or the original `assets/tiles/<plan>.png` when the
    manifest lists none (Storybook's stories). **One size serves both uses**, the placeholder quad and the plan view:
    the PM's suggestion was 256 px for the quad and 512 px for the plan view, but the plan view drawn from the 256 px
    copy differs from the one drawn from the 512 px copy by a mean 0.02 dE at the default zoom and 0.05 to 0.06 dE at the
    closest (maximum 1.6 dE, no pixel above 2 dE), at 360 and 1280 (headless Chromium, software WebGL), so no 512 px copy is
    written. The 1680 px originals are asked for by neither the renderer nor the tile chips any more (TILE-CHIP: the pages read the same
    `manifest.json` once, `useTileArt` in `src/data/tile-art.ts`, and hand the resolved image down; `TileChip`, which only
    draws, shows the 256 px copy, one cache entry with the board. A plan the manifest does not list, no manifest, a failed read
    and the time before the read ends draw the plan's nine areas, never a request for a file the build does not ship; a read
    that ended earlier is answered in the first render), and the v2 build no longer ships them: `vite/renderer-assets.ts` neither
    serves nor copies `assets/tiles/`, so `dist/` holds the 19 copies, 83,283 B, and no original (319,815 B less). Storybook
    maps `asset-sources/` itself and still has the originals, which its stories name explicitly (`originalTileArt`). Measured (headless Chromium, software WebGL (SwiftShader), the "Renderer/Tiles" story, 19 plans on one
    board; the phone profile is 360 x 740, device pixel ratio 2, touch and a coarse pointer, so the renderer's
    small-screen path): the images the tile materials hold on the GPU, computed per texture (width x height x 4, times 4/3
    with mipmaps; `renderer.info.memory.textures` counts textures, not bytes, and read, before and after alike, 27 in the plan view
    and 28 in the quads on the phone profile, 34 and 35 on the desktop one) were, before and after, in the plan view 286.0 MB (19 x 15.05 MB) and 6.64 MB (19 x 0.350 MB), and in the
    placeholder quads (18 quads, the board's first tile drawn from its model) 271.0 MB and 6.29 MB; both views resident
    (a plan shown both ways is uploaded twice, 5.6) about 557 MB and 12.9 MB. The desktop profile (1280 x 800) gives the
    same figures. Downloaded: 319,815 B raw for the 19 originals and 83,283 B for the 19 copies (3.8 times less; the
    request count is the same, 19). On a game page the download of tile images was the copies plus the originals the hand
    shows, up to 403,098 B over a game (TEX alone), and is now the copies alone, 83,283 B at most (4.8 times less), the hand
    included (TILE-CHIP; sizes of the built files, the host serving `image/png` uncompressed); gzipped at level 9, 60,549 B and 79,226 B: the originals are poorly deflated PNGs
    that gzip squeezes further, so a host that gzips `image/png` (the usual one does not) sends fewer bytes for the
    originals than for the copies. Captures `captures/tex-360-*.png` and `tex-1280-*.png`, `-before` and `-after`, of the
    plan view, the placeholder quads and the plan view at its closest zoom; the plan view at the default zoom differs by a
    mean 0.14 dE (360) and 0.24 dE (1280) from the original's (0.9 % and 1.8 % of its tile pixels above 2 dE, at the tile
    edges), the quads by 0.30 and 0.57 dE, the closest zoom by 0.09 and 0.07 dE (maximum 2.3 dE).
  - **Load order** (`packages/renderer/src/core/load-order.ts`, `AssetLoader`): a scene's init waits only for the models of
    the tiles it is handed before its first frame (the board's tiles; the hand's own scene, its one tile), or for every
    model when it is handed none; the other models load after the first frame (the next animation frame, then an idle
    callback). The 19 tile images wait with the first models since Q-POLISH-R (2026-10-16, 5.6): they are the placeholder
    a tile draws while its model is on its way. 319,815 B for the 19 (14,241 to 23,547 B each, 1680 x 1680 PNG; 60,205 B
    gzipped at level 9 by Python's `gzip`, a compression the host may not apply to `image/png`), measured on the files;
    before, they came after the first frame, so the whole first view is unchanged and the first frame's bytes grow by them.
    The time this adds to the first frame is not measured (estimate: one parallel round of 19 small files beside the first
    models). A failure there is logged, not fatal (the scene starts; the images not in are tried again after the first
    frame, the others kept), unless the plan view asked for them: only the plan view's own request (`getTexture`) makes it
    fatal, the placeholder reads an image with `peekTexture`, which asks for nothing. A failure among the first models stops the scene, so the page shows its plan view as
    before; a later failure only leaves that plan undrawn, logged. A model asked for later loads at once; a tile whose
    model (or plan-view image) is not in yet is drawn as soon as it comes in: the loader tells the scene
    (`AssetLoader.onLoaded`), which draws the last tiles given, with a new frame and shadow map when a tile was added.
    A theme's variants (SKIN-RENDER, 5.6) load only for the tiles that draw them: those handed before the first frame join
    the first models (and a board drawn only in variants waits for no base model), the others when a tile first needs one.
    A plan whose skin is known and whose variants the manifest lists loads its base model only as a fallback (SKIN-BASE,
    5.6): not with the rest after the first frame, not with a scene handed no tiles; the other plans' base models load
    as before.
  - **What a player's Forest set downloads** (SKIN-RENDER, measured on the files, 2026-10-16; gzip level 9 by Python's
    `gzip`, no brotli encoder on the machine; the host's own compression of `model/gltf-binary` is not measured, there is
    no deployment to measure): the worst case, all 19 plans active and all 72 variants on the board, is 7,493,028 B
    (3,941,654 B gzipped); SKIN-RENDER loaded the 19 base models (1,089,624 B; 653,324 B gzipped) on top of them, and since
    SKIN-BASE (2026-10-16) a skinned plan's base model is a fallback, so a fully skinned board loads none (see below). A
    typical finished Challenge board (37 to 38 tiles), all 19 plans on Forest, simulated over 200 games of the engine (random
    legal placements, the real hash, the game id varied): 26 to 35 variant files (median 31), 2,675,836 to 3,699,528 B
    (median 3,211,390 B), 1,404,863 to 1,940,413 B gzipped (median 1,691,400 B); the recorded 72-tile board of the stories
    fetches 52 of the 72. The lazy load bounds it by the board: one file per (plan, variant) a tile shows, at most the
    tiles on the board, and only the plans the player has skinned; the files are content-hashed, so a return visit
    fetches none of them again under the immutable rule below.
    Drawn, the skinned board costs no frame time (LIGHT-GPU, 5.5; GPU, headless Chrome, outlines on):
    with Forest on all 19 plans against the base models, CPU + GPU p95 at the default Medium tier is 8.74 against 9.03 ms on
    the desktop profile and 6.26 against 5.89 ms on the phone-like one at the opening view; every tier and view is within
    1 ms of the base board, inside the bench's run-to-run noise (about 1 ms, 5.5).
  - **What SKIN-BASE saves** (measured on the files, 2026-10-16, the same method: 200 simulated finished boards of 37 to 38
    tiles, random legal placements, the real hash, the game id varied, the variants a board shows and the base models loaded
    for the first view and after it; raw bytes and gzip level 9 by Python's `gzip`; the boards are a fresh seeded run, so
    their variant bytes differ from SKIN-RENDER's by under 0.3 %). Bytes of base models plus variants, before → after:

    | Skinned plans | Raw, median (range) | Gzip, median (range) | Saved, median (of the total) |
    |---|---|---|---|
    | all 19 | 4,301,014 (3,765,460 to 4,789,152) → 3,211,390 (2,675,836 to 3,699,528) | 2,344,724 (2,058,187 to 2,593,737) → 1,691,400 (1,404,863 to 1,940,413) | 1,089,624 B raw, 653,324 B gzip: 25.3 % / 27.9 % |
    | 10, drawn per game | 2,836,326 (2,075,088 to 3,453,372) → 2,279,672 (1,481,496 to 2,906,956) | 1,574,230 → 1,236,065 (823,599 to 1,556,422) | 563,516 B raw (range 526,968 to 619,196), 340,881 B gzip: 19.9 % / 21.7 % |
    | 5, drawn per game | 1,903,934 → 1,625,678 | 1,082,769 → 913,691 | 279,484 B raw, 170,052 B gzip: 14.7 % / 15.7 % |
    | 1 | 1,245,538 → 1,190,960 | 736,908 → 703,795 | 56,188 B raw, 34,152 B gzip: 4.5 % / 4.6 % |
    | none, or the skin read failed | 1,089,624 → 1,089,624 | 653,324 → 653,324 | 0 |

    A saving is the base models of the skinned plans: 1,089,624 B for all 19 (every board, since it is the whole set), at
    most 92,460 B for a single plan, and for a player with some plans skinned the base models of those plans only (they
    load for every plan the player has not skinned, as before). **The worst case** is unchanged in kind: all 19 plans
    skinned and all 72 variants on the board, 7,493,028 B (3,941,654 B gzipped), which no longer carries 1,089,624 B of
    base models (8,582,652 B, 4,594,978 B gzipped, before). A board whose skin read arrives after the rest of the models
    were asked for (a slow read; the rest runs one frame and an idle callback after the first one, at most about 0.5 s)
    saves nothing: its base models are loaded, as the fallback of a read that had not come. That case is not measured.
  - **Cache headers for the host step** (the host config is not changed here): hashed models
    `renderer-assets/models/*.glb`, `Cache-Control: public, max-age=31536000, immutable`; the manifest, `no-cache`
    (`AssetLoader` asks with `cache: "no-cache"` too); the hashed tile images `renderer-assets/tiles/*.png`, `Cache-Control: public, max-age=31536000, immutable`; the build ships no original (`assets/tiles/`) any more.
    Compressing `model/gltf-binary` too (gzip or brotli) would take the 19 models from 1,089,624 B to 665,212 B (gzip
    level 6) or 618,540 B (brotli), measured on the files; `vite preview` compresses only text and JavaScript, so the
    figures below are the files as they are.
  - **Measured** (Mac, Chrome headless `--headless=new`; `vite preview` serving `dist`, which sends
    `Cache-Control: no-cache`, gzip on JavaScript only; a fresh context per run, no network throttling; 3 runs, median;
    `/training` on a fresh game, 1 tile and the hand, and on a resumed 35-tile game of 18 plans; first frame: the later of
    the board's and the hand's first draw call, from navigation; phone-like: 360 x 780, DPR 3, 4x CPU throttle; Mac: 1440 x
    900, DPR 2; 1-minute load average 2.9 to 5.6 beside the runs). `dist/renderer-assets`: 39 files, 1,410,448 B (models
    1,089,624, tiles 319,815, manifest 1,009), against 41 files, 16,037,648 B before.

    | Profile | Board | First frame, before → after (ms) | Transferred before the first frame, before → after (its models) |
    |---|---|---|---|
    | Phone-like | fresh | 916 → 710 | 16,455,270 → 1,276,910 B (2 models, 97,748 B) |
    | Phone-like | 35 tiles | 1,367 → 1,267 | 16,455,270 → 2,220,186 B (18 models, 1,041,024 B) |
    | Mac | fresh | 544 → 468 | 16,455,270 → 1,276,910 B |
    | Mac | 35 tiles | 597 → 559 | 16,455,270 → 2,220,186 B |

    All transferred by 5 s after the first frame: 16,457,682 → 2,604,769 B (fresh). The rest of the first view is the app's
    code and fonts, the largest Font Awesome's `solid.min.js` (669,527 B then; since Q3 (c) it is a subset of 41,071 B, 15,794 B gzipped, section 8). Draco (gltf-transform's defaults, edgebreaker),
    measured the same way (a hand-made build; its loader fetched each first model twice, about 20 KB each): 427,204 B for the 19 models and 250,876 B of decoder; first view 1,423,921 B fresh and
    1,795,893 B at 35 tiles; first frame on the phone-like profile 739 ms fresh, 1,177 ms at 35 tiles. meshopt was chosen:
    positions lossless and normals and UVs within 0.001 degree / 8e-6, where Draco quantizes (14-bit positions, 10-bit normals), the smaller and faster fresh first view,
    and a 29 KB decoder in the bundle instead of 251 KB to host; Draco would save about 0.42 MB and 90 ms on the phone at
    35 tiles, which is what would reverse the choice.
  - **No visual change:** captures before and after at 360 (DPR 3) and 1280 (DPR 2) px, three zooms (opening, mid,
    closest), 35-tile board: 0.05 to 0.23 % of the pixels differ, as scattered single pixels (largest channel difference
    44 of 255 at 360 px; 11 at the closest zoom at 1280), where the same build against itself differs by 0 pixels. The
    flicker check (12 drag steps of 2 CSS px, 4 zooms, 1280 px): each build's change from one step to the next is the
    same before and after (ratio 1.000 to 1.001).

### 4.3 What is reused

The stories import the same components and the same `theme.css` as the app; the scene stories use the
same TanStack Query hooks against a `QueryClient` seeded with fixtures (the fakes that
`@paved/chain/testing` already provides), so a page's story is the page.

### 4.4 In CI

The `client` job of `.github/workflows/test.yaml` (which runs `bun run build` and `bun run test`) gets one
step: `bun run --filter @paved/app build-storybook` (a broken story fails the PR). Its path filter
(`packages/**`) already covers the new package. Then, in the polish phase,
`@storybook/addon-vitest` runs every story as a smoke test with the a11y checks, in the same job. The
workflow is a shared file: the foundations PR that adds the step lists it in its task.

---

## 5. The board renderer

### 5.1 Read: what draws the board today

`packages/renderer` (three 0.186, no react-three-fiber):

- `GameScene.ts:54-58` creates `WebGLRenderer({ antialias: true })`; `:150-158` caps the pixel ratio at
  `[0.5, 1]` (so 1 on a retina screen; replaced by `maxPixelRatio`, 5.3 "Pixel ratio"); ACES tone mapping; PCF soft shadows redrawn only when tiles change;
  render on demand (`:438-461`).
- `Effects.ts:100-145`: an `EffectComposer` with `RenderPass`, `UnrealBloomPass`, a vignette pass, and
  SSAO only in the cinematic profile. **The composer's render targets set no `samples`, and there is no
  FXAA or SMAA pass**: the `antialias: true` of the canvas does not reach a scene rendered through the
  composer, so the scene is drawn without anti-aliasing.
- Outlines (`TileRenderer.ts:44`, `:166-173`): a `THREE.LineSegments` per mesh, from `buildEdgesGeometry`
  (`edges.ts`, a faster `EdgesGeometry`), with `LineBasicMaterial({ color: 0x000000 })`, offset by
  `0.001` and drawn with `renderOrder` 1. WebGL draws these lines **one pixel wide whatever the zoom**;
  the hover preview has none.
- No `polygonOffset` and no `logarithmicDepthBuffer`; the camera has `near: 1`, `far: 2000`, distance 5
  to 300.

**Read, consequence, the flicker's likely sources** (not yet measured on screen): unantialiased edges
shimmering while panning and zooming; one-pixel lines aliasing and stepping at every distance; lines
fighting the faces they sit on at a distance (a constant 0.001 offset against a depth precision that
falls with distance); shadow acne on the tile tops.

### 5.2 Proposed: post-processing for a clean render

One pass chain for the play profile, in order:

1. **The scene** into a multisampled target (`WebGLRenderTarget` with `samples: 4`, WebGL 2), so the
   faces are anti-aliased inside the composer. Where MSAA is not available (old devices), the chain ends
   with SMAA instead.
2. **The outline pass** (5.3), reading the depth and normal buffers of that target.
3. **Bloom**, kept subtle as today, then the vignette; tone mapping and sRGB output last.
4. **The pixel ratio** raised to `min(devicePixelRatio, 2)` on High, kept at 1 on Low (the Settings
  page's Graphics quality: Low / Medium / High, as in the mockups).
5. **Shadows:** `shadow.normalBias` tuned per profile against acne; `near` raised from 1 to 5 to gain depth
  precision (the camera never comes closer than 5).

The pmndrs `postprocessing` library (MIT) merges compatible effects into one full-screen pass and ships
SMAA and a normal pass; it is the proposed engine for this chain (one package added, in the renderer
PR). Three's own `EffectComposer` stays the fallback.

**Done (P4, 2026-10-15).** The PM reduced 5.2 to two items: the faces' antialiasing (item 1) and the near plane (item
5). The rest moved: the Graphics quality setting (item 4) to **P11a**; the order of bloom, vignette and tone mapping
(item 3) to **Q-polish**. Item 2 is moot: the outlines are R-OUT's own antialiased shader (5.3), drawn in the scene
pass, not a screen-space pass reading the target's depth and normals. No package was added: three's
`EffectComposer` carries the chain, and three ships `SMAAPass` with its lookup textures inline (nothing fetched).

- **The switch.** `RendererSettings.multisampling` (`core/settings.ts`): `true`, `false`, or `"auto"`, the default.
  When on, `resolveFaceAntialiasing` (`core/Effects.ts`) takes **MSAA**, a 4-sample scene target, where the WebGL 2
  context multisamples at least 4 (`renderer.capabilities.maxSamples`) on a GPU; it takes **SMAA**, a pass at the end of
  the chain, on software WebGL (`detectSoftwareWebGL`, as for the outlines: there MSAA is rasterised on the CPU), where
  the context has fewer samples, or where `EffectsCapabilities.supportsMultisampling` is false. On React Native, which
  has no `Image` to load SMAA's textures, SMAA is left out. The path is logged once, like the outlines'
  (`[renderer] face antialiasing msaa: 4 samples available on GPU renderer "…"`). `"auto"` is on on a coarse pointer or a
  small screen (the test of `maxPixelRatio: "auto"`), off elsewhere, and follows the window on resize: the rule below.
  The story "Renderer/Outlines" has the control (auto, on, off).
- **Both composer targets multisample.** `EffectComposer` swaps its two targets every frame (the vignette swaps even
  when it draws to the screen), so the scene lands in each in turn. A first build gave only the first target the
  samples: every other frame lost the MSAA, and the pan check below caught it as a flicker of about 1 point of the
  outline share. Both keep them now (`packages/renderer/__tests__/face-antialiasing.test.ts`) (superseded by Q3-GPU,
  below: one multisampled target, the second never allocated).
- **Memory of MSAA** (estimate from the targets' formats, not measured; measured and cut in Q3-GPU, below). Each of the two targets holds a 4-sample
  RGBA half-float colour renderbuffer (32 B/px), a 4-sample 24-bit depth renderbuffer (16 B/px) and its single-sample
  resolve texture (8 B/px): about 56 B/px, so 112 B/px for the two, against 24 B/px for the two without MSAA (colour
  8 and depth 4 each). At a 720 x 1560 buffer (360 x 780 at DPR 2, or the phone-like DPR 3 capped at 2): about 126 MB,
  99 MB more than without. At 2160 x 1350 (1440 x 900 at cap 1.5, MSAA forced on, since `"auto"` leaves it off there):
  about 327 MB, 257 MB more.
- **Near 5.** The camera's near plane goes from 1 to 5 (`CAMERA_NEAR`, `core/CameraController.ts`): about five times the
  depth precision at every distance. "The camera never comes closer than 5" was the distance to its target, on the
  ground; the tallest tile (`wfffffffr`) stands 2.625 units, so at 5 the near plane would cut its top. The closest zoom
  (`minDistance`, `CLOSEST_DISTANCE`) goes from 5 to **8**: 5 + 2.625 / cos 27 degrees (the play camera's steepest tilt)
  = 7.95, rounded up; **10** since TILT-54 (5.10): 5 + 2.625 / cos 54 degrees = 9.47. A test reads every tile model's height and checks it. The shadow camera is the light's own
  orthographic camera (1 to 100), unchanged. The outlines' depth bias (`polygonOffset` -1, -4) is in depth-buffer
  units, so it shrinks in world units as the precision grows; the pan and sweep checks below show no new flicker.

**Frame time** (DPR's and OUT-LOD's method: the GPU, Chrome in new headless mode, never on screen; the
"Renderer/Outlines" story Held with `redraw` and the outlines forced on, on the recorded 72-tile board; per frame the
CPU time of every rAF callback plus the GPU time of `EXT_disjoint_timer_query_webgl2` around each; a fresh context per
configuration, 120 warm-up and 600 measured frames; nearest-rank percentiles over the pooled frames). Mac profile:
1440 x 900 at DPR 2, three rounds; phone-like: 360 x 780 at DPR 3, CPU throttled 4x, two rounds. Caps and modes
alternated within each round, the orders rotated between rounds. SMAA is measured by reporting 0 samples to three
(`MAX_SAMPLES`), so it is SMAA's real fallback path on this GPU. An iOS simulator ran beside the runs (the GPU was
shared); the load average (`uptime`, 1 minute) before and after each round:

| Run | Mac rounds | Phone-like rounds |
|---|---|---|
| A: off and MSAA | 2.85 to 4.31, 4.31 to 3.15, 3.15 to 3.69 | 3.69 to 3.64, 3.64 to 5.30 |
| B: main, off, SMAA | 4.44 to 3.49, 3.49 to 4.57, 4.68 to 4.29 | 4.13 to 2.60, 2.60 to 2.95 |

CPU + GPU per frame, ms, p50 / p95. Off is this branch with `multisampling: false`; the same pose, the same chain.

| Profile | View | Cap | Off (A) | MSAA (A) | Main (B) | Off (B) | SMAA (B) |
|---|---|---|---|---|---|---|---|
| Mac | default (240) | 1.5 | 7.35 / **11.11** | 9.89 / **15.24** | 8.42 / 12.35 | 7.29 / 11.72 | 8.04 / 11.78 |
| Mac | busiest (170) | 1.5 | 8.27 / **11.87** | 10.38 / **16.56** | 8.23 / 12.53 | 8.57 / 12.64 | 8.64 / 12.71 |
| Mac | default (240) | 2 | 8.71 / 12.56 | 10.64 / 17.16 | 8.43 / 12.51 | 8.86 / 13.18 | 9.43 / 13.38 |
| Mac | busiest (170) | 2 | 10.71 / 17.85 | 11.99 / 19.47 | 9.71 / 15.18 | 9.18 / 13.82 | 11.55 / 16.55 |
| Phone-like | default (240) | 1.5 | 4.42 / 6.38 | 5.95 / 8.25 | 3.63 / 5.28 | 3.77 / 5.66 | 3.73 / 5.92 |
| Phone-like | busiest (280) | 1.5 | 5.17 / 6.91 | 8.15 / 11.45 | 3.61 / 5.68 | 3.59 / 5.60 | 3.80 / 5.64 |
| Phone-like | default (240) | 2 | 4.60 / 6.00 | 5.61 / **7.90** | 3.69 / 5.64 | 3.92 / 5.75 | 3.86 / 5.91 |
| Phone-like | busiest (280) | 2 | 4.87 / 6.21 | 5.51 / **8.48** | 4.22 / 5.71 | 4.06 / 5.72 | 4.18 / 6.40 |

Notes: run B is the four-way run that found the alternating-target bug (its MSAA column is left out); its main, off
and SMAA used single-sampled targets and stand. The per-round p95s at Mac cap 1.5 are 10.51 to 11.53 (default) and
11.63 to 12.24 (busiest) for off in run A, 15.10 to 15.67 and 16.40 to 16.64 for MSAA. Mac cap 2, busiest, off, has one
round at 19.57 (the others 13.27 and 13.57): a loaded round. Off and main are within the rounds' noise of each other.

**The rule applied** (the PM's: the desktop cap stays 1.5 only if the Mac p95 stays under 12 ms at both views; if MSAA
breaks it, keep the faster option as the default; on phones, the phone-like profile at cap 2 under 16.6 ms):

- **Mac profile: MSAA breaks the rule.** At cap 1.5 it adds about 4 ms of p95 (15.24 and 16.56 against 11.11 and 11.87
  in run A). Run B's MSAA, from the first build that multisampled only every other frame, already cost 2.9 and 3.5 ms
  (14.64 and 16.16 against 11.72 and 12.64). So no MSAA on desktops follows in both runs. The pass of 12 ms without
  face antialiasing does not hold firmly: it holds in run A (11.11 and 11.87) but not in run B, taken in turn, where
  off is 11.72 and 12.64 and main 12.35 and 12.53. The desktop pass at cap 1.5 is within the noise, and the cap is
  re-measured on a quiet Mac in Q3 (done by Q3-GPU, 5.5: the cap is 1.75 now). The faster option is no face antialiasing: SMAA costs little at cap 1.5 (11.78 and
  12.71 against 11.72 and 12.64 for off in the same run) but more at cap 2, and changes more of the image than MSAA
  does (below). So desktops keep the faces unantialiased: `"auto"` is off on a fine pointer and a large screen, and
  the cap stays 1.5 (no change from main: off measures as main does).
- **Phone-like profile: MSAA passes.** At cap 2, 7.90 and 8.48, under 16.6 ms with room. So `"auto"` turns MSAA on on
  coarse pointers and small screens. The profile runs on the GPU, not a phone's (tile-based phone GPUs resolve
  MSAA on chip, often cheaper; estimate).

**Zero flicker** (OUT-LOD's checks; headless Chrome; the outline share is 1 minus the luma with the
outlines on over the luma with them off, at the same pose, over the centre crop: 800 x 500 CSS px on the Mac, 300 x 400
on the phone-like):

- **Pan**, 12 mouse drags of 2 CSS px with a settle after each, Mac profile at cap 1.5, distances 240, 170, 100, 50.
  Largest change of the share between two steps: main 0.171, 0.142, 0.109, 0.098 points; off 0.170, 0.153, 0.108,
  0.103; MSAA 0.055, 0.071, 0.037, 0.045; SMAA 0.175, 0.132, 0.137, 0.099.
- **Zoom sweep**, 300 to 30 in 1 % steps, Mac at cap 1.5 and phone-like at cap 2. Largest frame-to-frame change in the
  stroke's fade (282 to 240): main 1.722 / 1.514 (Mac / phone-like), off 1.717 / 1.513, MSAA 1.719 / 1.524, SMAA
  1.810 / 1.612. Below 238: main 1.117 / 0.711, off 1.114 / 0.708, MSAA 0.886 / 0.419, SMAA 1.073 / 0.701.
- So the default paths (off on desktops, MSAA on phones) flicker no more than main, and MSAA less. SMAA's fade step is
  about 0.1 point higher than main's: it is not a default.

**Captures** at the default view (240), `"auto"` cap (1.5 at 1280 x 800, DPR 2; 2 at 360 x 780, DPR 3), the centre 120 x
80 CSS px upscaled 4x with nearest-neighbour, in `packages/app/src/stories/renderer/captures/`: `p4-1280-before.webp`
and `p4-360-before.webp` (main), `p4-*-msaa.webp`, `p4-*-smaa.webp`. Whole frames against main: off changes 0.13 to
0.17 % of the pixels (the near plane), by 3 levels on average; MSAA 17 to 24 %, by 3 levels (the faces' edges); SMAA 9
to 15 %, by 5 levels (it also smooths edges inside the voxel textures).

**The memory of MSAA, measured (Q3-GPU, 2026-10-16).** P4's figure above was an estimate. Measured on the phone
profile, it held a second cost P4 did not count, and both are cut now:

- **One multisampled target, not two.** The composer swapped its two targets after the finish pass, so the scene landed
  in each in turn and both had to multisample (P4's flicker). Only SMAA reads what the finish pass writes, so the finish
  pass now swaps only when SMAA follows it (`Effects.ts`). No pass swaps on the MSAA and "off" paths: the scene lands in
  the composer's read buffer every frame, its resolve texture is what the AO, the bloom and the finish pass read, and the
  other target is never bound, so three never allocates it. This is the "one multisampled target with a resolve": three
  resolves (blits) the multisampled buffers into the target's own textures after the scene pass, as before.
  (`face-antialiasing.test.ts`: no pass swaps at any tier with MSAA; on the SMAA path the finish pass and SMAA swap, two
  swaps a frame, so the scene still lands in one target.)
- **No multisampled canvas.** `GameScene` created its renderer with `antialias: true`. The canvas only receives the
  finish pass's full-screen triangle, which multisampling cannot smooth, but Chrome still gave the canvas a 4-sample
  colour buffer and a 4-sample depth buffer: 32 B a pixel (33.8 MiB at 720 x 1480). The renderer is created with
  `antialias: false` now. The faces' antialiasing is the composer's (`multisampling`), unchanged.
- **The samples as a setting.** `RendererSettings.msaaSamples`: 2 or 4 (`MSAA_SAMPLE_COUNTS`), 4 by default (the rule
  below). MSAA is taken only where the context multisamples that many. The "Renderer/Lighting" story has the controls
  (`multisampling`, `msaaSamples`) and a readout of the face antialiasing in effect.

**The method.** Headless Chrome (Chrome for Testing 1217, `--headless=new`, hardware GPU, never on screen),
the "Renderer/Lighting" story (Mockup, held, `redraw` on, outlines forced on, the slots and the ghost) on the recorded
72-tile board, this branch's static Storybook on a plain file server. The phone profile: 360 x 740 and 430 x 932 CSS px
at DPR 2, cap 2 (buffers of 720 x 1480 and 860 x 1864). Three measures, per configuration in a fresh browser:

- **The ledger** (exact): a script wraps the WebGL 2 calls that allocate (`texImage2D`, `texStorage2D`,
  `renderbufferStorage`, `renderbufferStorageMultisample`, and the deletes) and records each object's size, format and
  samples, then keeps those attached to a framebuffer (the render targets). Bytes are width x height x bytes per pixel
  x samples, as the API asks for them; it has no error of its own, but it does not see the canvas's buffers nor any
  padding the driver adds.
- **The GPU process's GPU memory** (real): `footprint` (macOS) of Chrome's GPU process, its category "Owned physical
  footprint (unmapped) (graphics)", read after 3 s of frames. It catches the canvas and the driver's own allocations. Its
  error: it moves in steps (the driver allocates in heaps), about 10 % low against the ledger's differences (removing the
  second target: ledger -61.0 MiB, measured -55.1 at 720 x 1480; -91.7 against -82.1 at 860 x 1864), and it does not
  move for small targets (the AO's, 1.0 MiB, and the bloom's mips, 7.4 MiB, leave it within 0.8 MiB). Two rounds; the
  pairs agree within 0.8 MiB.
- Chrome exposes no per-context GPU memory to a page (`performance.measureUserAgentSpecificMemory` counts no GPU
  memory), so the browser figure is the GPU process's.

**The reference bench, from now on: Q3-GPU's.** Frame times, memory and flicker on the GPU are measured with
Q3-GPU's bench, whose scripts are kept in Q3-GPU's thread library (`q3gpu-lib.mjs`, `q3gpu-bench.mjs`,
`q3gpu-summary.mjs`; not in this repository, like LIGHT-GPU's before them, which were not on the Mac). It follows
DPR's, OUT-LOD's and LIGHT-GPU's method (above), and reads lower than LIGHT-GPU's bench. Tied in 5.5 on **one
configuration only** (the desktop profile, the opening view, cap 1.5, Medium): there LIGHT-GPU's own build reads **2.78 ms
lower at p95** on Q3-GPU's bench (6.47 against 9.25: 0.70 times) and 2.45 ms lower at p50 (4.45 against 6.90: 0.64
times). The cause is unknown (the method is described alike; LIGHT-GPU's scripts are not on the Mac to compare). The
offset is not a correction: it was not measured at another configuration (another view, cap, tier or the phone-like
profile), and is not applied to one.
Earlier figures (P4, DPR, OUT-LOD, LIGHT-GPU) compare with each other, not with Q3-GPU's: compare within one bench, or
re-run the older configuration on this one. To re-run: build the static Storybook (`bun run --filter @paved/app
build-storybook`) and copy `storybook-static` out of the tree; then, from `packages/app` (where `playwright-core`
resolves; Chrome for Testing 1217 from Playwright's cache), `node <library>/q3gpu-bench.mjs <mode> <storybook copy>
<out.jsonl> <rounds>` with the mode `mem`, `time` (phone), `flicker`, `sweep`, `desk` (desktop caps), `deskab` (the
canvas pairs) or `tie` (one configuration on several builds, `Q3_BUILDS=name=<dir>,name=<dir>`), and `node
<library>/q3gpu-summary.mjs <mode> <out.jsonl>` for the pooled p50 / p95 per configuration. Every configuration waits for
a 1-minute load under 6; the summary drops a configuration measured at 6 or more.

The variants: "main" is P4's chain (4 samples, both targets swapped, the canvas multisampled), reproduced on this
branch by setting the finish pass's `needsSwap` back on (it draws the same frames: the crop's mean luma is identical at
181 poses, below) and the canvas's `antialias` forced by the bench; "one" is one target; "canvas off" is the canvas
without multisampling (this branch's default).

The composer's targets alone (ledger), at 720 x 1480 / 860 x 1864: 4 samples, two targets 122.0 / 183.4 MiB, one target
61.0 / 91.7 MiB (60 B/px: colour 32, depth 16, the resolve's colour 8 and depth 4); 2 samples, one target 36.6 / 55.0
MiB (36 B/px); off, one target 12.2 / 18.3 MiB. The shadow map (2048 x 2048, colour and depth: 32 MiB), the AO's target
(Medium and High: 1.0 / 1.5 MiB) and the bloom's mips (High: 7.4 / 11.2 MiB) are in every row of the ledger column
below.

At Medium (the phone's tier), MiB, ledger (all render targets) / GPU process graphics (range of two rounds):

| Variant | 360 x 740 | 430 x 932 |
|---|---|---|
| Main: 4x, two targets, canvas multisampled | 155.0 / **172.3 to 172.6** | 217.0 / **243.0** |
| 4x, one target | 94.0 / 116.7 to 117.5 | 125.3 / 160.9 |
| **4x, one target, canvas off (this branch)** | 94.0 / **83.7** | 125.3 / **112.4** |
| 2x, two targets | 106.2 / 122.6 | 143.6 / 169.2 |
| 2x, one target | 69.6 / 92.2 | 88.6 / 124.3 to 124.6 |
| 2x, one target, canvas off | 69.6 / 58.9 | 88.6 / 75.8 |
| Off, two targets (main's off) | 57.4 / 71.0 | 70.2 / 93.3 (one round) |
| Off, one target | 45.2 / 66.4 | 51.9 / 86.4 |
| Off, one target, canvas off | 45.2 / 32.8 to 33.1 | 51.9 / 37.1 to 37.9 |

Low and High: the ledger moves by the AO's target and the bloom's mips (Low 1.0 / 1.5 MiB less, High 7.4 / 11.2 more), the
graphics figure stays within 0.8 MiB of Medium's in every variant. So P4's estimate of "about 90 MB" for MSAA was the
right order: main's MSAA path held 172 MiB of GPU memory at 360 x 740, 101 MiB more than main's off path. This branch's
default holds **83.7 MiB** there (112.4 at 430 x 932): its MSAA now costs 12.7 MiB more than main's off path (71.0).

**Frame time** (LIGHT-GPU's method: per frame the CPU time of every rAF callback plus the GPU time of
`EXT_disjoint_timer_query_webgl2` around them, 120 warm-up and 600 measured frames, nearest-rank percentiles over the
pooled frames; a fresh context per configuration, CPU throttled 4x; the opening view at 240; variants alternated within a
round, the order rotated between rounds; two rounds, every configuration at a 1-minute load under 6, none dropped, loads
3.6 to 5.2). CPU + GPU p95, ms, 360 x 740 / 430 x 932:

| Variant | Low | Medium | High |
|---|---|---|---|
| Main: 4x, two targets | 6.24 / 6.43 | 6.24 / 6.69 | 10.27 / 10.31 |
| 4x, one target | 6.31 / 6.58 | 6.42 / 6.85 | 10.21 / 10.24 |
| **4x, one target, canvas off** | 7.06 / 6.47 | **6.30 / 6.89** | 10.08 / 10.52 |
| 2x, two targets | 5.90 / 6.05 | 5.89 / 6.20 | 9.44 / 10.04 |
| 2x, one target | 6.27 / 6.00 | 6.20 / 6.46 | 9.42 / 10.06 |
| 2x, one target, canvas off | 6.28 / 6.01 | 5.73 / 6.43 | 9.32 / 9.93 |
| Off | 5.73 / 5.17 | 5.16 / 5.64 | 7.43 / 8.30 |

Every variant is far under 16.6 ms. One target against two, and the canvas off against on, are within the rounds' noise
(per-round p95 of one configuration differ by up to 0.9 ms; the Low 7.06 is one round at 7.28 against 6.75). 2 samples
save about 0.4 ms against 4, MSAA itself 1 to 3 ms against off.

**Zero flicker, outlines on** (LIGHT-GPU's check: 12 mouse drags of 2 CSS px then 12 wheel notches of 20, a 1.5 s settle
after each, the mean luma of the centre 300 x 400 CSS px after each step; largest change between two steps, mean change
in brackets; 360 x 740, Medium; loads 3.8 to 6.0):

| Variant | 240, pan | 240, zoom | 60, pan | 60, zoom |
|---|---|---|---|---|
| Main: 4x, two targets | 0.72 (0.38) | 0.94 (0.31) | 0.99 (0.49) | 0.27 (0.17) |
| 4x, one target, canvas on or off | 0.72 (0.38) | 0.94 (0.31) | 0.99 (0.49) | 0.27 (0.17) |
| 2x, two or one target, canvas on or off | 0.70 (0.38) | 1.13 (0.48) | 1.00 (0.48) | 0.30 (0.18) |
| Off | 0.71 (0.35) | 1.12 (0.32) | 0.98 (0.48) | 0.45 (0.17) |

The steps repeat to the hundredth in every run of a sample count (the same content enters the crop), but 2 samples swing
more at the same poses. LIGHT-GPU's finer sweep settles it (the distance from 240 to 150 in steps of 0.5 along the view,
180 steps, Medium; loads 3.8 to 5.0): with 4 samples, main, one target and the canvas off give the same luma at all 181
poses (difference 0), the largest step 0.90 levels, **no step over 1**, 10 over 0.5; with 2 samples the largest 1.65,
**6 over 1**, 28 over 0.5; off 1.58, 8 over 1, 30 over 0.5. So 2 samples shimmer under a zoom about as much as no MSAA. At
Low and High (main against 2x, one target, canvas off, and off; High at 240 with 2x was dropped, measured at a load of 6
or more): the same pattern, and High's bloom as LIGHT-GPU found it (at 240, zoom: main 1.51, off 3.74).

**The rule applied** (the phone profile under 16.6 ms, zero flicker, the least memory when both hold): every variant passes
the time; zero flicker keeps 4 samples (2 shimmer like no MSAA, so they fail it, as off does). Among the 4-sample variants,
one target with the canvas off holds the least memory and draws the same frames. So the phone default is **4x MSAA, one
target, the canvas without multisampling**: 83.7 MiB of GPU memory at 360 x 740 against main's 172.3 (-88.6 MiB,
-51 %), 112.4 at 430 x 932 against 243.0. "Off" stays the floor for a device without MSAA (SMAA there, as before): it is
not a candidate, P4 having ruled that phones antialias the faces. The desktop gains both cuts too (5.5).

### 5.3 Proposed: outlines that follow the zoom

**Replace the per-mesh line geometry by a screen-space edge pass.** One full-screen shader finds edges
where depth or normal changes between neighbouring pixels (a Sobel-style test on the depth and normal
buffers) and darkens them. Its width is a uniform in pixels, set from the camera at each frame that
renders:

```
w = clamp(k * (d_ref / d) * pixelRatio, 0, w_max)       // d: camera distance to the target
alpha = smoothstep(w_min, w_min + 0.5, w)               // fades the line out below w_min
```

- zoomed out, `w` falls with the distance and the line fades to nothing below `w_min` (proposed 0.5 px);
- zoomed in, `w` stops at `w_max` (proposed 2.5 px at pixel ratio 1);
- `k`, `d_ref`, `w_min`, `w_max` are settings of the render profile, tuned in Storybook's Board story with
  a control, then frozen.

Why this over the alternatives:

| Option | Width follows zoom | Cost | Flicker |
|---|---|---|---|
| Today: `LineSegments` + `LineBasicMaterial` | no, always 1 px | one draw call per mesh, edge geometry per tile type | z-fighting with the faces |
| `LineSegments2` + `LineMaterial` (three's "fat lines"), `linewidth` in pixels updated per zoom | yes | the same edges as instanced quads: more vertices per tile, still per-mesh draw calls | still on the faces, so still fights depth |
| **Screen-space edge pass** | yes, one uniform | one full-screen pass, independent of the tile count; the edge geometry and its draw calls go | none from depth fighting; anti-aliased with the scene |

It also outlines the hover preview and any future art for free. The change in `packages/renderer`:
`TileRenderer` stops building `edges` (and `edges.ts` goes once nothing uses it); `Effects.ts` gets the
outline pass and a depth/normal source; `GameScene` sets the width uniform from `CameraController`'s
distance in its render loop; the render profiles get the four settings.

**Cost:** the edge pass reads a normal buffer, which costs one more scene pass if the material cannot
write normals in the same pass (the pmndrs `NormalPass`), or none with a multiple-render-target setup.
Estimate, to measure in the renderer PR with the existing bench (`bun run bench`, method in
`docs/measures/client-baseline.md`): under 1 ms GPU per frame at 72 tiles on the Mac, against the CPU
and draw calls the line geometry costs today. The P-7b figures frozen by D-7 are the bar it must not
fall below.

**Decided by R-OUT (t-0258, 2026-10-14): fat lines with a depth bias, not the edge pass.** The outlines are
`LineSegments2` + `LineMaterial` (`core/outlines.ts`) built from the same `buildEdgesGeometry` segments, one
shared material. The table's "still fights depth" holds for GL lines only: a `LineMaterial` line is a quad of
triangles, so `polygonOffset` (factor -1, units -4, towards the camera) applies to it, and the lines no longer
win or lose the depth test by rounding. The edge pass would have needed a normal buffer (a second scene pass,
or multiple render targets), outlined everything on screen, and its pixel edges still crawl without
anti-aliasing. The width and opacity follow the on-screen size of a tile (CSS px, which folds in distance,
field of view, camera zoom and viewport height), from one settings object, `RendererSettings`
(`core/settings.ts`), given to `GameScene`, `GameCanvas` or `GameCanvasNative`: off at or below
`fadeThresholdTilePx` (48), a smooth fade-in over `fadeRangeTilePx` (48), so the game's opening view (about
60 px a tile) shows them as the mockups do (PM's ruling, 2026-10-14), then from `minWidthPx` (1) to
`maxWidthPx` (2) at `maxWidthTilePx` (800). The camera's distance limits (5, 300) and an optional zoom-out
cap (`capZoomOut`, off, at 150) are settings too. MSAA on the composer's target (5.2, item 1) is the
`multisampling` setting, off by default: it costs 3 to 4 ms of GPU a frame at 1440x900 on a laptop GPU for
little visible gain once the lines are biased. Measures and captures: PR #411 and the stories
"Renderer/Outlines" and "Renderer/Outlines comparison".

**Changed by R-VIS (2026-10-15).** Where this differs
from the paragraph above, R-VIS holds. The outlines keep the same segments, one shared material and the
depth bias, but are drawn by the renderer's own shader on three's instanced `LineSegmentsGeometry`
(`createOutlineMaterial`): each pixel's exact distance to its segment on screen gives the share of the pixel
the stroke covers, so the edge is antialiased by construction, with no MSAA and no post pass, and a stroke
under a device pixel is drawn one pixel wide at that share of its opacity. Segment ends are square and exact,
so a straight edge split into many segments covers each pixel once. The width is set in the world:
`widthVoxels` (0.015, 1.5 % of a voxel; a tile is 40 voxels of 0.075 world units) at the
camera's target, at least `minWidthDevicePx` (1, a hairline) and at most `maxWidthPx` (2 CSS px, the cap
zoomed in). The fade follows the tile size S the board opens at on this viewport (`openingTilePixels`: a tile's size at
the camera's opening distance, 0.8 of its farthest, 240), recomputed when the viewport is resized. It is `1 - t^p`
(OUT-FADE2, owner 2026-10-17: OUT-FADE's range was too short): off at `fadeOffFactor` (0.85) x S, the historic threshold,
and fully on from `fadeFullFactor`, **the fade's start**, a setting and a story control from 1.5 S up to the closest zoom
(`CLOSEST_DISTANCE`, 8; 10 since TILT-54, 5.10). The tile size is inversely proportional to the camera distance, so the tile at the closest zoom
is 240 / 8 = **30 S** (`OUTLINE_CLOSEST_FACTOR`; 1,608 px measured at S = 54 on a 1280 x 800 window); since TILT-54,
240 / 10 = **24 S**, and the "max zoom-in" start leaves 9.5 % at S with square (8.9 % at 30 S below). With
`t = ln(full / tile px) / ln(full / off)`: 0 at the start and above, 1 at 0.85 S, on the log of the tile size so every
wheel step moves t by the same amount; the opacity is clamped to 1 above the start and 0 below 0.85 S, and hidden under
1/255. The exponent `fadeExponent` p is in [1, 4]; the story's presets are **linear** (p = 1), **square** (p = 2, the
default: gentle at the start of the zoom-out, faster near the threshold, as the owner described) and **cube** (p = 3);
`fadeEasedEnd` (off by default, because the owner asked for an acceleration into the threshold) eases the last quarter of
the opacity with a cubic that meets `1 - t^p` with its slope and reaches 0 with a zero slope: no kink at the threshold.
The smoothstep of OUT-FADE is gone. A 360 x 780 phone opens at S = 52 (off at about 44), a 900 px high window at about 60
(off at about 51). The tile and S scale together with the height, so on every screen the outlines are off past distance
240 / 0.85 (about 282): they vanish at the farthest zoom (300).

**Follow-ups (SLOTS2, P-72, from OUT-FADE2's review).** `TileRenderer.setPlacementSettings` takes `OutlineFadeSettings`,
so the exponent and the eased end reach the slot lines by type; a fade exponent that is not a finite number is the
default's (`outlineFade`), never a NaN opacity; the doc of `fadeFullFactor` says what it is, the fade's start, 1.5 S by
default; the "Renderer/Outlines" story's "max zoom-in" start is computed from the story's own `minDistance` and
`maxDistance` controls (`fadeStartOf`, the opening distance over the closest), not the renderer's defaults. The
placement grid no longer follows this curve by default: its hairlines hold at every zoom, the curve only on request and
from the opening view out (`grid.farFade`, 5.7); the slots' borders keep it with their floor.

**The start (PM ruling 2026-10-17).** The literal version, fully on only at the closest zoom ("max zoom-in", start 30 S),
leaves the opening view almost off: S is only 0.18 of the way up the log range from 0.85 S to 30 S, t = ln 30 /
ln(30 / 0.85) = 0.954, and the opacity at S is 4.6 % (linear), **8.9 %** (square), 13.1 % (cube). So the default start is
**1.5 S**: t = ln 1.5 / ln(1.5 / 0.85) = 0.714 and the opacity at the opening view is **0.490** with square. Opacity by
curve at the default start (readouts of the story, software WebGL, match the formula):

| | linear | square | cube |
|---|---|---|---|
| S (opening view) | 28.6 % | **49.0 %** | 63.6 % |
| 1.15 S | 53.2 % | 78.1 % | 89.8 % |
| 0.92 S | 13.9 % | 25.9 % | 36.3 % |
| 0.87 S | 4.1 % | 8.0 % | 11.8 % |

and at the "max zoom-in" start: S 4.6 / 8.9 / 13.1 %, 1.15 S 8.5 / 16.2 / 23.3 %, 0.92 S 2.2 / 4.4 / 6.5 %, 0.87 S 0.7 /
1.3 / 1.9 %. OUT-FADE's "fade 1.15" and "fade 1.3" range presets are **replaced by the start control**: they were two
values of the same parameter (1.15 S and 1.3 S), now below the control's 1.5 S minimum, and the ruling set the default
above them. Captures (Outlines story, 1280 x 800, DPR 1, headless Chrome on **software WebGL (SwiftShader), outlines
forced on**, `force: "on"`, in `captures/`): `out-fade2-square-S.webp` (default start) against `out-fade2-max-square-S.webp`
("max zoom-in" start) at the opening view, and the frame strip of a zoom-out sweep of the default, 10 frames log-spaced
from 1.6 S (just above the start) to 0.85 S, `out-fade2-square-sweep.webp` (opacity 100, 100, 98, 93, 85, 74, 60, 43, 23 %,
off; the default is fully on at every zoom above 1.5 S, so a sweep from the closest zoom would show it unchanged). The `out-fade2-max-<curve>-<view>.webp` set (linear,
square, cube at the closest zoom, S, 0.92 S, 0.87 S) and `out-fade2-max-square-sweep.webp` (closest zoom to 0.85 S) are the "max zoom-in" start's.
**The segment cut does not pop there** (OUT-LOD's `segmentOffDevicePx` 0.5 / `segmentFullDevicePx` 1, kept as is): a
voxel's horizontal edge is `tilePx / 40` device px long at least, 1.1 px at the phone's 0.85 S, so it is whole across the
fade; seen from above a vertical edge is under 0.5 px at every zoom, so it is always dropped; from the 27 degree tilt
it fades over a factor of two in length, a small step per zoom step (`outline-segment-cut.test.ts`). No change, no capture.
**Corrected (SLOTS):** "whole" holds for the edges along x only. From the play camera's 27 degree tilt an edge along z
is foreshortened by cos 27 degrees (0.89): at the phone's 0.85 S at DPR 1 it is about 0.98 device px, just under the 1 px
`segmentFullDevicePx`, so the cut draws it at about 0.96 of its opacity, above the 0.5 px cut. It is faded slightly, never
dropped, and the factor changes continuously with the zoom, so it does not pop. At DPR 2 and above it is about 2 px or more,
whole. A merged straight edge is several voxels long, so most such edges are far above the cut.
**At 54 degrees (TILT-54, 5.10)** an edge along z is foreshortened by cos 54 degrees (0.59): about 0.65 device px at the
phone's 0.85 S at DPR 1, so the cut draws it at about 0.3 of its opacity, still above the 0.5 px cut; at S, about 0.77 px
(0.53). At DPR 2 and above it is 1.3 px or more, whole. A voxel's vertical edge grows to sin 54 degrees (0.81) of a voxel
on screen, so more risers pass the cut than at 27 degrees; the frame time does not grow (measured, 5.10).

**Zero flicker and cost (OUT-FADE).** The fade adds no step of its own: the opacity is one uniform, set per frame as before
(`applyOutlineStroke`), so the frame cost is nil (no new pass, no new shader work). Checked on software WebGL here
(headless Chrome on SwiftShader, outlines forced on, 1280 x 800 at DPR 1, preset 1.3 (the first default), the story held; mean luma of the
centre 800 x 500 crop after each step, the outline share being 1 minus the luma with the outlines on over the luma with
them off at the same pose): **zoom**, 12 wheel notches of 20 from distance 282 (the off point) into the ramp: the share goes
0, 0, 0.11, 0.24, 0.41, 0.62, 0.85, 1.17, 1.48, 1.82, 2.19, 2.56, 3.03 points, rising every step with the largest step
0.47 point, no jump that is not the opacity ramp (the luma's own largest step is 0.53 on, 0.57 off). **Pan**: the 12-drag
run did not finish on the loaded VPS (the screenshots timed out under SwiftShader, twice); it is left to the GPU check on
the Mac, which the coordinator schedules. **Run on the GPU (SLOTS, 2026-10-16)**: headless Chrome (new headless) on
the GPU, the "Renderer/Outlines" story held, outlines forced on, main before OUT-FADE (`2cef09d0`) against
OUT-FADE (`ef354596`), each a static Storybook; 12 mouse drags of 2 CSS px with a 1.5 s settle, the mean luma of the centre
crop (800 x 500 at 1440 x 900, DPR 2, cap 1.5; 300 x 400 at 360 x 780, DPR 3, cap 2) after each; the 1-minute load 2.4 to 5.4.
Largest step (mean step), before / after:

| Distance (share of S) | Desktop | Phone-like |
|---|---|---|
| 209 (1.15 S) | 0.39 (0.08) / 0.39 (0.08) | 0.68 (0.34) / 0.68 (0.34) |
| 240 (S, the opening) | 0.21 (0.10) / 0.24 (0.11) | 0.67 (0.36) / 0.69 (0.37) |
| 260 (0.92 S) | 0.22 (0.16) / 0.23 (0.17) | 0.59 (0.29) / 0.63 (0.29) |
| 275 (0.87 S) | 0.26 (0.13) / 0.26 (0.13) | 0.67 (0.32) / 0.69 (0.32) |

The two builds differ by at most 0.04 levels, and the largest step falls on the same drag in both (content entering the
crop, not flicker, which would not repeat): **no flicker from the fade**, nothing to fix. Unit tests cover the ramp's per-step change (no kink at either end).

On software WebGL (a renderer string of SwiftShader,
llvmpipe, softpipe, "Software" or "Basic Render", or a context refused with `failIfMajorPerformanceCaveat`)
the outlines are off: there they cost about 11 times the frame (one Training game in the e2e: 24.7 s without,
274 s with). `force` (`"auto"`, `"on"`, `"off"`) overrides the detection, and the console logs the path once.
The CI e2e runs on SwiftShader, so it does not draw the outlines; their unit tests and GPU captures cover them. The colour is `color`, `#2a2928`, the colour that SHOWS on screen (OUTLINE-COLOUR, PM ruling 2026-10-16: halfway
between the old `#1f1f1f`, which showed as about `#53524f`, and black). The outlines are drawn into the linear target and the
`FinishPass` then tone maps (ACES), grades, vignettes and sRGB-encodes the whole frame, outlines included, so a written
dark grey is lifted a lot (the old "no sRGB encoding" line was stale since LIGHT). `screenColor` therefore converts the
shown colour to the colour the outline pass writes (`outlineWrittenColor`, OUTLINE-TINT: Newton's method on
`outlineScreenOf`, the forward model, which takes three channels: ACES at the Mockup exposure, the grade, the opening
view's vignette and fog as one measured factor of 0.65 in linear light, sRGB; the pass mixes the channels, so they are
solved together, from the per-channel grey as the start). Each channel is converted, so a hue picked in the story control
shows as that hue (before, only the green was kept and a grey written); a grey gives about `#0f0f0f` for the default.
The test round-trips `#2a2928` and reds, blue and others within one 8-bit step. **It assumes the default look**
(`mockup`), the `play` render profile (the chain whose finish pass is modelled) and the opening view: another look or
profile, or a corner under the vignette, shows a different value; a colour above what the pass can reach (the falloff
keeps 0.65 of the light) comes out as the nearest. Written `#1f1f1f` shows as about `#53524f` by the model too. In the
captures (`outline-colour-before-*` and `-after-*`: the "Renderer/Lighting" Mockup at the default tier, opening view,
1280 x 800 at DPR 2 and 360 x 780 at DPR 3, headless Chrome on software WebGL, `force: "on"`) the outline pixels read about
`#53524f` before (written `#1f1f1f`) and `#2b2c29` after (written about `#0f0f0f`); those were taken with the green-only
conversion. **Re-measured after the per-channel conversion (SLOTS, 2026-10-16)**, on the GPU (headless Chrome
), the Mockup at distance 200 (above 1.15 S, so the outlines are fully on), outlines on against off at the same pose,
the centre crop, the pixels the stroke darkens most: the darkest read `#2a2a2b` at 1280 x 800, DPR 1, `#2b2a2b` at
360 x 780, DPR 2, and `#262627` at DPR 1.5 (within two 8-bit steps of `#2a2928`; the median of those pixels, `#323232` to
`#353435`, is a stroke covering most of a pixel, not all of it). The default writes 15.0, 15.1 and 15.2 of 255 in linear light
(about `#0f0f0f`). The conversion is memoized on the colour and the modelled look (`outlineWrittenColorOf`), so a zoom step
re-applies the stroke without solving again. The story's control takes the visible colour; black stays reachable.
`fadeThresholdTilePx`, `fadeRangeTilePx`, `minWidthPx` and `maxWidthTilePx` are gone.

**Shading (R-VIS).** The diagonal, aliased tint bands on lit faces were shadow acne: the light had no bias,
and a 2048 map over the 100-unit shadow frustum (about 0.05 unit a texel) at the light's 56 to 67 degrees
on the faces misses the depth of the face it covers by up to about 0.1 unit. three 0.186 also removed
`PCFSoftShadowMap` (it falls back to `PCFShadowMap`: five taps turned by a per-pixel noise), whose dither
drew the bands' edges. The light now has `normalBias` 0.1 and `bias` -0.001 (5.2, item 5); the shadow
type is `PCFShadowMap`, named. Half these biases leave faint bands.

**Resize (R-VIS).** `GameScene` sizes the drawing buffer with `setSize(w, h, false)`, so the canvas keeps the
100 % CSS size `GameCanvas` gives it (three's default wrote it in px, and the canvas then never followed its
container); `WebSurfaceAdapter.onResize` observes the canvas's container and the device pixel ratio
(`matchMedia` on the current `resolution`), and `GameScene.resize` refits the pixel ratio, the drawing
buffer, the camera's aspect and the composer's targets. Measures and captures: PR #437 and the story
"Renderer/Outlines comparison", "Shading and outlines".

**Pixel ratio (DPR, 2026-10-15).** The fixed `[0.5, 1]` range of `RendererConfig.pixelRatio` (5.1) is gone. The
renderer draws at `min(devicePixelRatio, maxPixelRatio)`, a `RendererSettings` field. Its default, `"auto"`, is 2 on
a coarse pointer or a small screen (the shorter side of the window, or of the screen on native, at most 600 CSS px:
not the board's own size, so a short board panel or docked devtools on a desktop keep the desktop's cap) and 1
elsewhere; OUT-LOD raised that 1 to 1.5 (below, "Outline segments cut by screen size").
`GameScene` re-reads it on every resize of the board or the window and on `setSettings`. Item 4 of 5.2 proposed `min(devicePixelRatio, 2)` on a High quality
setting; DPR replaces that with this rule, set by the PM in advance:

- take the highest cap whose CPU + GPU p95 stays under 12 ms on the Mac profile at both views;
- if the phone-like profile is measurable, the cap must also stay under 16.6 ms there;
- if the two profiles point to different caps, choose by device.

Method:

- Machine: a desktop, Chrome in new headless mode, never on screen. The "Renderer/Outlines" story, Held,
  with `redraw` on, on the recorded 72-tile board.
- Per frame: the CPU time of every rAF callback of the frame, plus the GPU time from `EXT_disjoint_timer_query_webgl2`
  around them. Each configuration runs in a fresh browser context: 120 warm-up frames, then 600 measured frames.
- Three rounds, with the caps alternated within each round and the cap order changed between rounds (the phone
  profile in rounds 1 and 2 only). Percentiles are nearest-rank over the pooled frames.
- **Mac profile**: 1440 x 900 at DPR 2. **Phone-like profile**: 360 x 780 at DPR 3, with Chrome's CPU throttled 4x.
  The phone-like profile is an approximation: it runs on the GPU, not on a phone's.
- **Default view**: distance 240, the game's opening view. **Busiest view**: distance 170 on the Mac profile, the
  closest view with all 72 tiles on screen. On the phone-like profile no distance where the outlines still draw (up to
  about 282) holds every tile, so its busiest view is 280, the farthest where the outlines still draw.
- Outlines **on** is `force: "on"`; **off** is `force: "off"`.
- Load: other agents ran on the machine. The load average was 4.9 to 6.3 over the three rounds, near the "about 6"
  limit, and the p95 figures carry that load.

CPU + GPU per frame, ms, p50 / p95 (the outlines' share is on minus off, p50 / p95):

| Profile | View | Cap | Buffer (device px) | Outlines on | Outlines off | Outlines' share |
|---|---|---|---|---|---|---|
| Mac | default (240) | 1 | 1440 x 900 | 8.66 / **13.33** | 5.53 / 8.25 | 3.1 / 5.1 |
| Mac | default (240) | 1.5 | 2160 x 1350 | 8.96 / **13.49** | 6.93 / 10.49 | 2.0 / 3.0 |
| Mac | default (240) | 2 | 2880 x 1800 | 9.33 / **14.59** | 7.62 / 12.63 | 1.7 / 2.0 |
| Mac | busiest (170) | 1 | 1440 x 900 | 8.96 / **13.68** | 5.84 / 8.78 | 3.1 / 4.9 |
| Mac | busiest (170) | 1.5 | 2160 x 1350 | 9.21 / **13.42** | 7.37 / 11.75 | 1.8 / 1.7 |
| Mac | busiest (170) | 2 | 2880 x 1800 | 8.78 / **13.70** | 8.69 / 13.87 | 0.1 / -0.2 |
| Phone-like | default (240) | 1 | 360 x 780 | 6.27 / **8.40** | 3.08 / 4.06 | 3.2 / 4.3 |
| Phone-like | default (240) | 1.5 | 540 x 1170 | 6.89 / **9.37** | 3.66 / 4.76 | 3.2 / 4.6 |
| Phone-like | default (240) | 2 | 720 x 1560 | 6.75 / **9.01** | 4.00 / 5.33 | 2.8 / 3.7 |
| Phone-like | busiest (280) | 1 | 360 x 780 | 6.84 / **8.87** | 3.25 / 4.17 | 3.6 / 4.7 |
| Phone-like | busiest (280) | 1.5 | 540 x 1170 | 7.09 / **9.36** | 3.72 / 4.89 | 3.4 / 4.5 |
| Phone-like | busiest (280) | 2 | 720 x 1560 | 6.72 / **9.24** | 4.04 / 5.58 | 2.7 / 3.7 |

**The rule applied:**

- **Phone-like profile:** every cap stays under 16.6 ms (p95 at most 9.37), so the highest measured cap, 2, passes.
- **Mac profile:** with the outlines on, no cap stays under 12 ms at both views. Cap 1, today's, is at 13.33 and
  13.68. This is a result on a loaded machine: the load average was 4.9 to 6.3, and the per-round p95s with the
  outlines on ranged from 11.4 to 15.2 ms. OUT-LOD re-measures it.
- **Choice:** the two profiles point to different caps, and choosing by device costs a few lines, so `"auto"` takes
  2 on coarse pointers and small screens, and 1 elsewhere: the lowest cap measured, since none passes.

The cap in effect on a Mac is therefore unchanged, and a Retina desktop still draws the board at half resolution.
Captures at the default view, Mac profile: `packages/app/src/stories/renderer/captures/dpr-cap-1.webp`, `-1_5`, `-2`.

**Why the Mac misses, and what would fix it** (proposed, not done here):

- With the outlines on, the GPU time is nearly flat across caps (p50 6.8 to 7.6 ms): the outlines are bound by their
  vertices (about 130k crease segments, an 8-vertex instanced quad each), not by their pixels. Their share is
  largest at cap 1 (5.1 ms of p95 at the default view).
- With the outlines off, the Mac passes at cap 1.5 (10.49 and 11.75) and misses at cap 2 (12.63 and 13.87).
- **Collinear merging**, which R-VIS measured at 1.47x fewer segments, would cut the outlines' vertex work by about a
  third (estimate). At cap 1 their 5.1 ms of p95 would become about 3.5, putting cap 1 near 11.7 ms: just under 12,
  within the noise. That is not enough for 1.5.
- **A screen-size cut** goes further. At the opening view a tile is about 60 CSS px, against about 1,800 segments a
  tile, so most segments are under a device pixel. Dropping the segments shorter than a device pixel, or keeping only
  each tile's border and its major creases under a tile size, would bring the outlines toward their pixel cost
  (estimate: most of their share). It would make cap 1.5 pass on the Mac profile on the outlines-off figures.
- Either is a renderer change of its own, with a capture and a figure, not a few lines.

**Outline segments cut by screen size (OUT-LOD, 2026-10-15).** Where this differs from DPR's paragraphs above,
OUT-LOD holds. The outline segments are cut by their size on screen at the current zoom, re-measured on DPR's bench
with the load stated, and the desktop cap is raised by DPR's rule: the highest cap whose Mac p95 stays under 12 ms at
both views.

The load first. DPR's "about 130k crease segments" is the sum over the 19 tile types. Each tile draws its type's
segments, so on the 72-tile board, main draws **497,364 segment instances a frame** in 72 draws: 3.98M vertices and
2.98M triangles (counted with an instrumented `drawElementsInstanced`, Mac profile, either view). Of the segments,
90 % are one voxel long and 36 % are vertical (a voxel's riser), so under the game's top-down camera they project
to a fraction of a pixel.

What `core/outlines.ts` and `core/edges.ts` do now:

- **Collinear pieces merged** at load (`mergeCollinearSegments`). A crease edge is split wherever another edge meets
  it. Pieces end to end on one line are merged: 131,771 to 89,857 segments over the 19 models (1.466x fewer), in about
  50 ms of load for all of them. A merged edge covers the same pixels, since the shader's ends are square and exact.
  It also means the cut below never drops a short piece out of a long straight line.
- **The cut, on the GPU.** The vertex shader projects each segment and fades it by its length on screen in device px:
  - not drawn under `segmentOffDevicePx` (0.5);
  - fully drawn from `segmentFullDevicePx` (1), linear between (`segmentFade`);
  - a cut segment's quad collapses to one point outside the clip volume, so it reaches no pixel.

  The length changes continuously with the zoom, so nothing pops. The thresholds keep the cut below visibility: a
  segment under a device pixel only covers a pixel whose centre falls on its span, so it shows as a stray dot that
  comes and goes as the camera moves. A one-voxel horizontal edge is at least about 1.1 device px wherever the
  outlines are on (a tile at 0.85 x S or more: 1.1 on a 360 x 780 phone, 1.3 in a 900 px high window), so under the
  top-down camera only the risers go. Both thresholds are `OutlineSettings` fields;
  0 and 0 turn the cut off.
- **The cut, before the draw.** The vertex shader still runs for a collapsed segment. So each outline's segments are
  ordered with the ones along the tile's height last, longest first (`orderOutlineSegments`). Before each draw,
  `outlineSegmentCount` bounds the screen length of those vertical segments over the outline's bounding sphere and
  stops the instanced draw before the ones surely under 0.5 px. It skips only segments the shader would drop, so no
  pixel changes (a test checks every skipped segment against its exact projection). It costs a few flops per outline
  per drawn frame, and nothing when the camera is still.
- **A quad of four vertices, tight to the stroke.** The shader covers the stroke by its distance to the segment, so
  it needs only the outer rectangle of `LineSegmentsGeometry`'s eight-vertex, six-triangle quad: two triangles. The
  rectangle is the stroke and its half pixel of antialiasing across, and the segment's span plus half a pixel along.
  The old reach of a pixel and a half on every side drew fragments that were all discarded.

Load after (Mac profile): 230k to 281k instances a frame (more as the cap or the zoom grows), 0.92M to 1.12M vertices,
0.46M to 0.56M triangles.

**Zero flicker, no popping.** Headless Chrome, the recorded board, both builds at the same poses.
The outline share of a frame is 1 minus the luma with the outlines on over the luma with them off, at the same pose,
over the centre crop (800 x 500 CSS px on the Mac, 300 x 400 on the phone):

- **Pan, 2 CSS px mouse drags** (12 steps, a settle after each), Mac profile at cap 1.5, at 4 zooms (distances 240,
  170, 100, 50). The largest change of the share between two steps is 0.084, 0.136, 0.141 and 0.118 points (main:
  0.087, 0.139, 0.139, 0.116). The share stays within 19.11 to 19.54 % at 240 (main 19.35 to 19.79).
- **Zoom sweep**, the distance from 300 to 30 in 1 % steps (230 frames), Mac profile at cap 1.5 and phone-like at
  cap 2. The largest frame-to-frame change is in the stroke's own fade between 282 and 240: 1.72 points (main 1.80) on
  the Mac, 1.51 (main 1.56) on the phone-like. Below 238 it is 1.122 points at distance 217.5 (main 1.132, same place)
  on the Mac, and 0.727 at 139.8 (main 0.731) on the phone-like. No step changes the share by more than main does.
- At the default view, cap 2, 0.96 % of the pixels differ from main's, by 5.2 levels on average (the cut
  risers, the merged pieces, and depth ties at the quads' new corners: 0.067 % of the pixels changed with the tighter
  quad alone).

**Frame time** (DPR's method: a Mac, headless Chrome, the "Renderer/Outlines" story Held with
`redraw`, 120 warm-up and 600 measured frames per configuration in a fresh context, CPU + GPU per frame, nearest-rank
percentiles over the pooled frames). Main and this branch were built side by side and alternated within each round,
with the caps. Mac profile: three rounds, cap orders 1/1.5/2, 2/1.5/1 and 1.5/2/1. Phone-like: two rounds. Load average
(`uptime`) before and after each round:

| Round | Mac | Phone-like |
|---|---|---|
| 1 | 3.30 to 2.90 | 2.90 to 3.50 |
| 2 | 3.50 to 4.32 | 4.32 to 3.67 |
| 3 | 3.67 to 4.38 | (none) |

CPU + GPU per frame, ms, p50 / p95, outlines on (`force: "on"`) unless off:

| Profile | View | Cap | Main | OUT-LOD | Outlines off |
|---|---|---|---|---|---|
| Mac | default (240) | 1 | 7.32 / 12.26 | 5.74 / **8.83** | 4.43 / 6.67 |
| Mac | default (240) | 1.5 | 9.10 / 13.79 | 7.09 / **10.66** | 5.51 / 9.25 |
| Mac | default (240) | 2 | 9.31 / 14.61 | 7.65 / **12.40** | 6.81 / 10.96 |
| Mac | busiest (170) | 1 | 7.88 / 12.43 | 6.35 / **9.70** | 3.57 / 6.21 |
| Mac | busiest (170) | 1.5 | 8.66 / 13.02 | 8.05 / **11.76** | 5.43 / 9.05 |
| Mac | busiest (170) | 2 | 9.21 / 13.99 | 8.56 / **13.35** | 6.51 / 11.42 |
| Phone-like | default (240) | 1 | 5.18 / 7.85 | 3.50 / **5.35** | 2.46 / 3.44 |
| Phone-like | default (240) | 1.5 | 5.52 / 8.67 | 3.93 / **5.92** | 2.79 / 4.05 |
| Phone-like | default (240) | 2 | 5.59 / 8.42 | 4.11 / **6.12** | 3.33 / 4.53 |
| Phone-like | busiest (280) | 1 | 5.09 / 8.38 | 3.60 / **5.51** | 2.52 / 3.66 |
| Phone-like | busiest (280) | 1.5 | 5.42 / 8.31 | 3.65 / **5.59** | 3.00 / 4.05 |
| Phone-like | busiest (280) | 2 | 5.37 / 8.46 | 4.38 / **6.32** | 3.30 / 4.84 |

Notes on the table:

- At cap 1.5 on the Mac, the per-round p95s are 10.53 to 10.85 ms at the default view and 11.55 to 11.87 ms at the
  busiest: every round is under 12, the busiest by about 0.2 ms.
- The same configurations with the cut off (both thresholds 0, Mac only) give 9.46, 10.63 and 13.44 ms p95 at the
  default view, and 10.40, 11.64 and 13.36 at the busiest. They are within the rounds' noise of the cut's own figures.
  At these views, the gain comes from the work removed as a whole: the merge, the vertical segments the draw skips,
  and the tighter quad. The shader's fade alone adds little.
- Main is about 1 ms under DPR's figures here, at a lower load (DPR: 4.9 to 6.3).

**The cap, by DPR's rule:**

- **Mac profile:** 1.5 is the highest cap under 12 ms at both views (10.66 and 11.76). Cap 2 misses (12.40 and
  13.35). So `PIXEL_RATIO_CAPS.fine` is 1.5, and `"auto"` draws a Retina desktop at 1.5.
- **Phone-like profile:** unchanged, 2, now at most 6.32 ms.

Captures at the default view, Mac profile, the centre 120 x 80 CSS px upscaled 4x with nearest-neighbour:
`packages/app/src/stories/renderer/captures/dpr-cap-1.webp` (before: main's `"auto"`, cap 1, byte for byte) and
`out-lod-after.webp` (after: `"auto"`, cap 1.5). The outline is 1.5 device px of the screen's 2, sharper than 2 and
soft; cap 2 stays out of reach on this machine.

### 5.4 The mockups' isometric voxel look: the cost

Out of v1 (P-57 B3) unless the owner asks. **Estimate** of what it would take:

- **Art:** the 19 base tiles rebuilt as voxel models (MagicaVoxel or Blockbench, exported to GLB), then
  every variant (the forest density set) and every theme (forest, snow, desert, volcano): about 19 × 5
  themes = 95 models before variants. At 2 to 4 hours a model for an artist, 190 to 380 hours. This is the
  bulk, and an artist's, not CLIENT's.
- **Renderer:** an orthographic camera at the isometric angles (rotation in 90° steps, zoom by scale),
  baked ambient occlusion in the models' vertex colours, the edge pass kept (it suits voxels), instancing
  revisited (P-7b measured and dropped it for today's models; voxel models share more). About 3 PRs of
  1 to 2 days each.
- **UI:** none beyond the renderer: the pages do not change.

### 5.5 Lighting and post-processing (LIGHT)

The owner's remark (P-63, 2026-10-15): the voxel assets and the outlines are right; the lighting and the scene's
post-processing are what is missing to reach `mockup-01.png` and `-02.png` (`packages/app/src/stories/renderer/mockups/`). LIGHT takes over item 3 of 5.2 (the
order of bloom, vignette and tone mapping, deferred to Q-polish by P4).

**What was there.** `GameScene` drew an ambient, a hemisphere and one white directional light, set
`ACESFilmicToneMapping` on the renderer, and `Effects` ran `RenderPass`, `UnrealBloomPass` (threshold 3: nothing
bloomed) and a vignette `ShaderPass`. Through the composer **neither the tone map nor the sRGB transfer ran**: three
applies both only when a material draws to the canvas, the vignette's shader included neither, and the composer had no
`OutputPass`. The board was shown in linear colour, dark and crushed, with the renderer's exposure unused.

**The chain now** (`core/Effects.ts`, `core/post-shaders.ts`), each pass only when its effect is on:

1. `RenderPass` into the half-float target (multisampled for MSAA, unchanged from P4), with a `DepthTexture` only when
   the AO reads it.
2. `AoPass`: screen-space ambient occlusion from the depth texture alone (normals rebuilt from the depth, no second draw
   of the scene), 12 taps on a fixed spiral (no per-pixel noise, so nothing dithers under a pan), into its own target at
   `ao.resolution` of the buffer (0.5 by default). It writes nothing to the composer's buffers. Under about 1.5 texels of
   radius on screen (the board seen from far) it skips the taps.
3. `UnrealBloomPass` on what is above `bloom.threshold` (0.9 in linear colour, LIGHT-GPU): in practice the gold slot outlines,
   drawn at 1.6 times their colour.
4. `FinishPass`, always: the AO multiplied in, the tone map (three's AgX, ACES or Neutral, with the exposure), the grade
   (saturation, contrast around 0.18, warmth), the vignette, then the sRGB transfer. One full-screen pass; each effect is
   a `#define`, so an effect that is off costs no instruction. It replaces the vignette pass: the "Off" chain is two
   passes, one fewer than main's.
5. `SMAAPass` where SMAA antialiases the faces, now after the sRGB transfer (its edge detection is tuned for display
   colour). The MSAA path and `"auto"` are unchanged.

The lights (`GameScene.applyLook`): the **key**, warm, the only shadow caster, placed by compass angle and height at the
former light's distance (89.4 units) so the shadow camera's 1 to 100 range and R-VIS's biases hold at every direction; a
new direction redraws the shadow map; its PCF radius is `shadowSoftness`. The **fill**, cool, no shadow, from the other
side. The **sky**, a hemisphere light (blue above, earth below) plus a small ambient. **Fog** (`FogExp2`) toward the
background colour. The **highlights** (`TileRenderer`): the empty slots are a gold square band just inside the tile's
edge (1.30 to 1.42 of its half-width), unfogged, at 1.6 times the colour so the bloom picks them; the valid ghost glows
gold, an invalid one red. The **water**: the palette's water texels are its cyan-blue entries (blue over green over red
in linear colour; roofs and banners are violet, stone grey), found by hue in the tile shader (`WATER_MASK_GLSL`,
`onBeforeCompile`, one program for every tile type) and made brighter and glossier through uniforms shared by every
tile material, so a change recompiles nothing.

**Settings** (`core/look.ts`, `core/settings.ts`): `RendererSettings.lookPreset`, `look` (every light and effect a
group with `enabled` and its values) and `quality`. A partial `look` overrides the preset's fields; `setSettings`
replaces, as for the outlines. A value change that keeps the same passes only sets uniforms; turning an effect on or off
rebuilds the chain.

| Group | What it does | Mockup | Soft | Off |
|---|---|---|---|---|
| `key` | warm key light, shadows | `#ffd8a0`, 3.6, azimuth -60, height 34, softness 3 | `#ffe6c4`, 2.8, height 48, softness 4 | white, 2.6, softness 1 |
| `fill` | cool fill, no shadow | `#8fb4ff`, 0.7, azimuth 120, height 40 | `#b4c8ff`, 0.9 | off |
| `sky` | hemisphere + ambient | `#bcd4ff` / `#3a3324`, 1.1, ambient 0.25 | 1.4, ambient 0.4 | white / grey, 1.2, ambient 0.4 |
| `ao` | contact shading | radius 0.35, intensity 0.8, half resolution | intensity 0.5 | off |
| `toneMapping` | curve, exposure | ACES, 1.05 | AgX, 1.1 | Neutral, 1 |
| `grade` | saturation, contrast, warmth | 1.08, 1.08, 0.06 | 1.05, 1.0, 0.03 | off |
| `vignette` | corners darkened | offset 1, darkness 0.45 | darkness 0.3 | off |
| `fog` | distance fog | density 0.0018 | 0.001 | off |
| `background` | what the board fades into | `#30363f` (dark navy on screen after ACES) | `#1a2330` | `#141b26` |
| `bloom` | glow above the threshold | strength 0.15, radius 0.2, threshold 0.9 | strength 0.1 | off |
| `highlights` | slots and ghost | gold `#ffc23d`, slots 1.6, ghost 0.25 | as Mockup | slots 1, ghost 0.2 |
| `water` | brighter, glossier water | brightness 1.25, roughness 0.15 | as Mockup | off |

**AgX or ACES** (compared on software WebGL, the "Renderer/Lighting" story zoomed in): ACES keeps the greens and the
roofs rich, as in the mockups, but crushes the darks (the background had to be raised from `#141b26` to `#30363f` to
land on the mockups' dark navy); AgX is more muted and keeps the darks. Mockup takes ACES, Soft takes AgX.

**Quality tiers** (`TIER_EFFECTS`, `AUTO_QUALITY`): a tier only turns effects off, it never changes a value. Set from
the GPU figures by the PM's rules (LIGHT-GPU, below): each tier holds the effects that fit its profile.

| Tier | AO | Soft shadows | Bloom | Passes with the Mockup look | p95, desktop / phone-like (opening view) |
|---|---|---|---|---|---|
| Low | off | radius 1 | off | render, finish | 8.61 / 5.93 ms |
| Medium | on | look's radius | off | render, AO, finish | 9.25 / 5.89 ms |
| High | on | look's radius | on | render, AO, bloom, finish | 12.40 / 9.55 ms |

The p95 column is LIGHT-GPU's bench, not the reference (Q3-GPU's, 5.2, "The reference bench"); the two were tied at one
configuration only, and no offset is applied to these figures.

`quality: "auto"` (the default) picks **Medium** on every device (a coarse pointer, a small screen or a desktop), and
**Low** on `EffectsCapabilities.lowPowerDevice`; **High only when chosen by hand**. Medium is the richest tier under 12 ms
on the desktop profile (High is 12.40). On the phone-like profile High fits the time (9.55, under 16.6) but its bloom
shimmers on the gold slots under a zoom or a pan (below), so zero flicker keeps Medium there too: phones gain the AO and
the soft shadows over the former provisional Low. `supportsSSAO`, `supportsBloom` and `supportsVignette` false turn those
effects off whatever the tier. P11a adds the settings row (Low / Medium / High); the render profiles (`play`,
`showcase`, `showcaseCinematic`) now only scale the look's exposure and fog density against `play`'s, and the
cinematic profile's SSAO gave way to the look's AO.

**As measured (LIGHT-GPU, 2026-10-16).** DPR's and OUT-LOD's method: the GPU, Chrome in new headless mode,
never on screen; the "Renderer/Lighting" story (Mockup, held, `redraw` on, outlines forced on, the gold slots and the
ghost shown) on the recorded 72-tile board; per frame the CPU time of every rAF callback plus the GPU time of
`EXT_disjoint_timer_query_webgl2` around them; a fresh context per configuration, 120 warm-up and 600 measured frames;
nearest-rank percentiles over the pooled frames. Desktop profile: 1440 x 900 at DPR 2, cap 1.5 (2160 x 1350), faces
unantialiased (`"auto"`). Phone-like: 360 x 780 at DPR 3, CPU throttled 4x, cap 2 (720 x 1560), MSAA (`"auto"`): an
approximation on the GPU, not a phone's. Views: the opening (240, straight down) and a zoomed one (60, straight
down, where the AO, the shadows and the water fill the screen). Each effect alone is the Off preset with that one effect
turned on (quality High, so no tier hides it); the tiers are the Mockup look whole. The variants alternated within a
round, the order rotated between rounds. Every round started only with the 1-minute load average under 6, and every
configuration measured at a load of 6 or more was dropped (21, nearly all of desktop round 2, where another process
raised it to 23.6). Kept: desktop rounds at loads 2.2 to 5.9 (four rounds a variant; "all but the bloom" two),
phone-like 2.5 to 5.5 (two rounds). The builds: this branch's static Storybook, served by a plain file server. To re-run
it, open `iframe.html?id=renderer-lighting--mockup&viewMode=story&args=` with
`view:default;distance:240` (or `60`)`;redraw:!true;readout:!false;force:on;maxPixelRatio:x1_5` (`x2` on the phone-like
profile), then the variant's args: `preset:off;quality:high` for the Off preset, with `aoEnabled:!true`,
`bloomEnabled:!true`, `fogEnabled:!true`, `gradeEnabled:!true`, `vignetteEnabled:!true`, `waterEnabled:!true` or
`keyShadowSoftness:3` for one effect alone; `quality:low`, `quality:medium` or `quality:high` for a tier; `forest:!true`
for the skinned board. Wait for `[data-ready]`, then throttle the CPU (phone-like) and count the frames.

CPU + GPU per frame, ms, pooled p50 / p95, and the cost against the Off preset (p95). LIGHT-GPU's bench, not the
reference (Q3-GPU's, 5.2, "The reference bench"; tied at one configuration only, below, "The desktop cap, re-measured";
no offset applied):

| Variant | Desktop, opening | cost | Desktop, zoomed | cost | Phone-like, opening | cost | Phone-like, zoomed | cost |
|---|---|---|---|---|---|---|---|---|
| Off preset (no effect) | 6.11 / 8.16 | | 4.81 / 6.54 | | 3.81 / 5.58 | | 2.22 / 3.33 | |
| AO alone | 6.33 / 8.69 | +0.52 | 5.22 / 7.17 | +0.63 | 4.13 / 5.61 | +0.03 | 2.38 / 3.68 | +0.35 |
| Bloom alone | 7.70 / 11.18 | **+3.02** | 6.55 / 9.73 | **+3.19** | 5.77 / 8.56 | **+2.99** | 3.80 / 6.09 | **+2.76** |
| Fog alone | 6.40 / 8.58 | +0.42 | 4.80 / 6.71 | +0.16 | 3.92 / 5.69 | +0.12 | 2.25 / 3.45 | +0.12 |
| Grade alone | 6.18 / 8.54 | +0.38 | 4.95 / 6.66 | +0.12 | 4.24 / 5.48 | -0.09 | 2.31 / 3.50 | +0.17 |
| Vignette alone | 6.38 / 8.61 | +0.45 | 4.67 / 6.60 | +0.06 | 3.59 / 5.20 | -0.38 | 2.26 / 3.42 | +0.09 |
| Water alone | 6.33 / 8.51 | +0.35 | 4.79 / 6.57 | +0.03 | 3.74 / 5.54 | -0.03 | 2.41 / 3.48 | +0.15 |
| Soft shadows alone (PCF radius 3) | 6.28 / 8.43 | +0.26 | 4.47 / 6.41 | -0.13 | 3.73 / 5.33 | -0.25 | 2.32 / 3.46 | +0.13 |
| Mockup at Low | 6.41 / **8.61** | +0.45 | 4.75 / **6.78** | +0.24 | 4.03 / **5.93** | +0.35 | 2.35 / **3.61** | +0.28 |
| Mockup, all but the bloom (Medium) | 6.90 / **9.25** | +1.09 | 5.11 / **7.12** | +0.58 | 4.00 / **5.89** | +0.31 | 2.90 / **4.18** | +0.85 |
| Mockup with the bloom, no AO (the former Medium) | 8.28 / 12.05 | +3.89 | 7.02 / 10.62 | +4.08 | 5.82 / 9.28 | +3.70 | 4.11 / 6.27 | +2.94 |
| Mockup at High | 8.59 / **12.40** | +4.24 | 7.42 / **11.15** | +4.61 | 6.19 / **9.55** | +3.97 | 4.72 / **6.79** | +3.46 |

The phone-like Medium row is from the skinned run below (its base board, the same configuration). The bloom is the only
costly effect, about 3 ms of p95 on both profiles: `UnrealBloomPass` runs its high pass, five blurred mips and the
composite whatever is above the threshold. Every other effect costs under 0.7 ms, within or near the rounds' noise (some
read negative). The desktop per-round p95 of the former Medium were 12.22, 12.22, 11.92 and 11.65, of High 12.02 to
12.68: at or over 12 in most rounds. **The bench's run-to-run noise** is about 1 ms of p95: one configuration's per-round
p95 differ by up to 0.9 ms on the desktop (High: 12.02 to 12.68 over four rounds; 12.19 and 13.09 in the skinned runs)
and up to 2 ms on the phone-like profile (the former Medium: 10.86 and 8.87).

**The rule applied** (the PM's: desktop p95 under 12 ms at cap 1.5, the phone-like under 16.6 ms at cap 2, zero
flicker): Low and Medium pass on both profiles at both views; High misses the desktop's 12 ms (12.40, by less than the
noise: on time alone it is a near miss, not a clear one) and passes the phone-like time (9.55), but it fails zero flicker
on both profiles (its bloom shimmers, below). So Medium takes everything but the bloom (it held the bloom and no AO
before), and "auto" is Medium on both, with Low on a low-power device: on the desktop by the time and by zero flicker, on
phones by zero flicker alone. Medium itself passes with room (9.25 on the desktop, 2.75 ms under the rule). A cheaper or steadier bloom (a 13-tap downsample
with a tent upsample, at half resolution) would be its own task, measured the same way.

**A fully skinned board** (Forest on all 19 plans, every tile its cell's variant: the board fetches 52 variant models; same method,
two rounds each, `forest` on against off in the same round; LIGHT-GPU's bench, see the pointer above), p95 ms:

| Tier | Desktop, opening: base / skinned | Desktop, zoomed | Phone-like, opening | Phone-like, zoomed |
|---|---|---|---|---|
| Low | 8.54 / 8.64 | 6.89 / 6.78 | 5.71 / 6.22 | 3.64 / 3.31 |
| Medium | 9.03 / 8.74 | 7.06 / 6.81 | 5.89 / 6.26 | 4.18 / 3.63 |
| High | 12.78 / 11.81 | 10.87 / 10.14 | 10.22 / 9.54 | 6.92 / 6.62 |

The skins cost nothing measurable: every pair is within 1 ms, inside the noise, and the skinned board reads faster in
most of them (High by 0.97, 0.73 and 0.68 ms). A variant is a shared model like a
base one (5.6), so the draw calls and the triangles per tile are those of the base board's.

**The bloom's threshold** (GPU captures, the board with its highlights off, bloom on against off): at 1.0 the bloom
changed **no pixel**, neither a tile nor the gold slots (their colour times 1.6 has a luminance of about 0.96, under
1.0). No tile glowed with the threshold at 0.95, 0.9 or 0.8, zoomed in (30) or at 60; the slots glow from 0.95 down.
The PM's ruling (2026-10-16): **0.9**, the slots glow as in the mockups and no tile does (`look.test.ts`, "the bloom's
threshold"). Captures: `captures/bloom-threshold-1.0-gpu.webp` and `bloom-threshold-0.9-gpu.webp` (1280 x 800, DPR 2,
High). The bench's builds had the threshold at 1.0; the bloom pass does the same work at either (its cost does not
depend on what passes the threshold).

**Zero flicker, outlines on** (LIGHT's check, on the GPU: headless Chrome). Main before LIGHT
(`fe3d7699^`, the "Renderer/Outlines" story held) against the Mockup look at each tier; 12 mouse drags of 2 CSS px, then
12 wheel notches of 20, a 1.5 s settle after each; the mean luma (0 to 255) of the centre crop (800 x 500 CSS px on the
desktop profile at cap 1.5, 300 x 400 on the phone-like at cap 2) after each step. Largest change between two steps
(mean change):

| Pose | Before LIGHT | Low | Medium | High | High, PCF radius 1 |
|---|---|---|---|---|---|
| Desktop 240, pan | 0.32 (0.16) | 0.82 (0.27) | 0.81 (0.27) | 0.74 (0.28) | 0.74 (0.28) |
| Desktop 240, zoom | 0.15 (0.12) | 0.62 (0.36) | 0.61 (0.36) | 3.16 (1.92) | 3.16 (1.92) |
| Desktop 60, pan | 0.21 (0.15) | 1.04 (0.50) | 1.00 (0.48) | 0.70 (0.28) | 0.71 (0.28) |
| Desktop 60, zoom | 0.15 (0.13) | 0.31 (0.17) | 0.30 (0.17) | 0.65 (0.26) | 0.65 (0.26) |
| Phone-like 240, pan | 0.68 (0.30) | 1.02 (0.42) | 1.05 (0.42) | 2.41 (0.65) | 2.40 (0.66) |
| Phone-like 240, zoom | 0.04 (0.02) | 0.17 (0.07) | 0.18 (0.08) | **10.28** (2.44) | 10.31 (2.44) |
| Phone-like 60, pan | 1.23 (0.92) | 1.29 (0.68) | 1.22 (0.66) | 0.86 (0.45) | 0.85 (0.46) |
| Phone-like 60, zoom | 0.11 (0.05) | 0.09 (0.04) | 0.08 (0.03) | 0.56 (0.41) | 0.57 (0.41) |

- Low and Medium: the largest steps fall on the same step in every LIGHT variant (pan step 9 at 240, step 4 at 60):
  content entering the crop, not flicker, which would not repeat. LIGHT's frame is about twice as bright (luma 70 to
  94 against 37 to 56) and more contrasted, so its steps are larger in levels: relative to the frame's luma, the
  largest pan step is 1.1 % against 0.9 % before LIGHT at 240.
- Phone-like at 60 (run in the review's fix loop, at a load of 2.4 to 4.5): Low and Medium drift as before LIGHT (pan
  steps of 1.1 to 1.3 levels once the board moves, the same at each step; zoom steps under 0.1), with no spike; High's
  zoom steps are 0.3 to 0.6 against under 0.1, its bloom again.
- **The key light's PCF radius of 3 adds nothing under a pan**: radius 1 gives the same steps within 0.02 levels.
  `shadowSoftness` stays 3.
- **High's bloom shimmers.** On the phone-like profile one zoom notch jumps 91.2, 101.5, 92.3 (the whole board washed
  by the bloom for one pose), repeated in both High runs. A finer sweep (the distance from 240 to 150 in steps of 0.5,
  no damping): with High the crop's luma jumps by up to 7.7 levels between two steps, 95 of the 180 steps over 1 level;
  with Medium none over 1. With the slots hidden, or the threshold at 1.0, no step over 1 level either: the slots'
  bands are 2 to 3 device px wide, and the bloom's downsampled mips catch them differently at each zoom. A clamp of the
  bloom's input (to 2 a channel) changed nothing: no specular glint is involved. So no default tier runs the bloom.
- **Still** (the camera held, a frame drawn every rAF, 20 captures 250 ms apart): every
  frame identical to the last, pixel for pixel, at 240 and 60 on both profiles, before LIGHT and at each tier, High
  included. Nothing changes without a move: High's shimmer follows the zoom and the pan, it is not noise in time.

**LIGHT's review notes (t-0396), closed in LIGHT-GPU:**

- `SMAAPass` is disposed on a rebuild and on `dispose`, with every pass the chain built (the composer frees only its own
  targets and copy pass); `effects-chain.test.ts`.
- The sRGB transfer happens once on every path: each preset at each tier, with no face antialiasing, MSAA or SMAA, the
  chain's shaders call `sRGBTransferOETF` once, in `FinishPass`, and none includes three's colour-space or tone-map
  chunk; only SMAA follows the final pass, and the scene is drawn into the composer's target. The unused
  `SRGB_TRANSFER` define is gone. The AO's target and the composer's targets (with their depth textures) are disposed
  when a rebuild drops the AO or changes its resolution.
- The start-up builds the chain once: `GameScene.init` hands the effects their capabilities and the look at the tier in
  effect before `Effects.init` (it built it three times).
- The water mask, run over every entry of both palettes (the base models' and Forest's, read from the GLBs;
  `water-mask.test.ts`): its green-over-red ramp, 1.5 to 1.7, caught two dark slate-blues, (64, 82, 115) at 0.82 (the
  darkest of `wfffffffr`'s three stone shades, the other two outside it) and (70, 87, 136) at 0.19. The ramp is 1.75 to
  1.95 now: the five water entries ((0, 130, 167), (56, 113, 149), (90, 157, 194), (73, 125, 158) and (102, 142, 167),
  the palest at 2.04) stay fully in, and nothing else is caught.
- The bloom's threshold: above.

**Captures (GPU)** in `packages/app/src/stories/renderer/captures/`, headless Chrome, outlines on, 1280 x
800 at DPR 2 (cap 1.5) and 360 x 780 at DPR 3 (cap 2; the skins' 360 x 740). They replace the software-WebGL ones of
LIGHT and SKIN-RENDER under the same names: `light-before-*` (main before LIGHT, `fe3d7699^`) and `light-after-*` (this
branch, `"auto"`), the "Renderer/Outlines" story held at the opening view; `light-after-1280-high` and
`light-after-1280-zin` (High, the opening view and zoomed in at 30); `skins-before-*`, `skins-after-all-*`,
`skins-after-some-1280` and `skins-placeholder-*`. New: `light-gpu-<tier>-<width>-main` (main at `9443488d`, before
LIGHT-GPU) and `-after`, the "Renderer/Lighting" Mockup at each tier with the slots and the ghost; `skins-gpu-<width>-main`
and `-after`, the board with Forest on all 19 plans; and the two bloom captures above. Before and after differ by the
threshold (main's slots do not glow) and the water mask; the tier contents changed, not the passes' code.

**Stories:** "Renderer/Lighting" (`packages/app/src/stories/renderer/lighting.stories.tsx`): every field of the look
is a control over the preset (unset fields keep the preset's), with the quality tier and a readout of the tier in
effect and the passes that run; the stories Mockup, Soft, Off and Zoomed in; and "Side by side with the mockup", the
board at the opening view beside `mockup-01.png` or `-02.png` (kept beside the story in `mockups/`, moved from `app/docs` in #591).
LIGHT-GPU added the controls the bench drives: `forest` (Forest on every plan), `force` (the outlines) and
`maxPixelRatio`; `quality` is typed as an enum so a URL can set it (Storybook dropped it from a URL before: its docgen
type was an unresolved union).

**The desktop cap, re-measured (Q3-GPU, 2026-10-16).** P4's pass of 12 ms at cap 1.5 was within the noise; LIGHT-GPU's
tiers changed the passes since. Method as in 5.2's Q3-GPU measures, the desktop profile: 1440 x 900 at DPR 2, faces
`"auto"` (unantialiased), this branch's chain (one target, the canvas without multisampling); the opening view (240) and
the zoomed one (60), each tier, caps 1.25, 1.5 and 1.75 alternated within a round, the order rotated between rounds;
three rounds, every configuration at a 1-minute load under 6; 4 of 54 dropped at 6 or more; kept loads 3.4 to 5.9. CPU +
GPU p95, ms, opening / zoomed:

| Tier | Cap 1.25 (1800 x 1125) | Cap 1.5 (2160 x 1350) | Cap 1.75 (2520 x 1575) |
|---|---|---|---|
| Low | 7.06 / 5.78 | 7.27 / 6.21 | 7.57 / 6.74 |
| Medium (`"auto"`) | 7.12 / 6.46 | 7.49 / 6.71 | **7.59 / 7.04** |
| High | 9.22 / 8.39 | 9.67 / 9.54 | 9.72 / 9.97 |

A second run alternated the canvas's own `antialias` on (main) and off (this branch) at caps 1.5, 1.75 and 2, Medium and
High, two rounds (13 of 48 dropped at a load of 6 or more): the pairs are within the noise either way (the canvas costs
no measurable time, only memory), and cap 2 passes too (Medium 7.30 / 7.52, High 9.22 / 9.93, one round each kept for the
branch's canvas).

**The two benches tied.** These figures read lower than LIGHT-GPU's at the same configurations (at cap 1.5, Medium 7.49 /
6.71 against 9.25 / 7.12, High 9.67 / 9.54 against 12.40 / 11.15). To place the gap, Q3-GPU's bench re-ran
LIGHT-GPU's configuration (desktop, the opening view, cap 1.5, Medium) on two builds, alternated within each round, the
order rotated: LIGHT-GPU's own (its merge, `b064b2e5`) and this branch's head. Four rounds, every configuration at a
1-minute load under 6, none dropped, loads 3.1 to 4.8. CPU + GPU, p50 / p95, ms:

| Build | Q3-GPU's bench (per-round p95) | LIGHT-GPU's bench (5.5's table) |
|---|---|---|
| LIGHT-GPU (`b064b2e5`) | 4.45 / **6.47** (6.50, 5.72, 6.43, 6.99) | 6.90 / **9.25** |
| This branch | 4.30 / **6.75** (5.95, 5.74, 7.42, 6.96) | |

So the gap is the bench's, not the code's: on the same build, at this configuration, Q3-GPU's bench reads **2.45 ms
lower at p50 and 2.78 at p95** (0.64 and 0.70 times LIGHT-GPU's), and the two builds are within its noise of each
other. Its cause is unknown, and it was measured at this configuration only: not a correction for others. This run also reads 0.7 ms lower than the cap runs above
(7.49), taken earlier the same day at loads up to 5.9: the bench's noise between sessions. Q3-GPU's bench is the
reference from now on (5.2, "The reference bench"); its scripts are in Q3-GPU's library, LIGHT-GPU's were not on the Mac
and are not re-run. The rule's comparisons above are all made within Q3-GPU's runs.

**Zero flicker at 1.75** (LIGHT-GPU's check on the desktop profile: the centre 800 x 500 CSS px; 1.5 against 1.75, Medium
and High; loads 4.97 to 5.78, one configuration dropped): largest step (mean), opening pan 0.63 (0.22) at 1.5, 0.68 (0.21)
at 1.75; opening zoom 1.03 (0.52), 0.67 (0.36); zoomed pan 0.72 (0.17) at both; zoomed zoom 0.25 (0.18), 0.42 (0.15).
High at the opening view: pan 0.61 at 1.5, 0.68 at 1.75; zoom 4.95 and 4.68 (its bloom's shimmer at both caps); High
zoomed at 1.75 was the dropped configuration. So 1.75 adds no flicker over 1.5.

**Memory on the desktop** (Medium, opening view, two rounds, loads 4.2 to 6.0, one row dropped): main's chain at cap
1.5 held 101.5 MiB of render targets (ledger) and 155.3 MiB of GPU memory in the GPU process; this branch at 1.5,
68.2 and 50.3 to 51.2; at 1.75, 81.2 and 60.8 to 61.0 (main's chain at 1.75 would hold 126.6 and 200.5).

**The rule applied** (the desktop cap is the highest under 12 ms at both views): 1.25, 1.5 and 1.75 pass at every tier,
High included (9.97 at most), and 2 passes in the canvas run. Q3 kept 1.5 unless the figures said otherwise; they
do, by more than 2 ms at the `"auto"` tier, so `PIXEL_RATIO_CAPS.fine` is **1.75** (`core/settings.ts`). Not 2: it was
measured in one or two rounds only, against three for the others, and the PM ruled (2026-10-16): no cap-2 run, 1.75
stands. The memory this costs is less than
main's chain held at 1.5 (61 MiB against 155).

### 5.6 Tile skins (SKIN-RENDER)

**As built (SKIN-RENDER, 2026-10-16).** The board draws each tile with its player's active skin for its plan (`Setup`'s
`active_skins`, cobbles v1, part 3), one variant per tile.

- **Which skins.** A Challenge board (`/game/:id`) reads the active set of the game's player (`game.playerId`), for anyone
  who views that game; Training and the tutorial read the connected player's (the signer's address), and a guest's board
  draws the base models. `useBoardSkins` (`packages/app/src/data/board-skins.ts`) reads `active_skins` under the theme
  page's key (`skinKeys.active`), so a save on the theme page moves the board too, and gives the renderer's map
  (`TileSkins`: plan key to theme id, the plans at 0 left out). The board never waits for it: no skin while the read is
  on its way, and for good when it fails. The hand's tile (`TileView`) takes the same skins.
- **The variant per tile** is origin/dev's `getVarietyModelPath` hash (`variantHash`, `packages/renderer/src/core/skins.ts`):
  over `${plan}${x}${y}${gameId}`, the plan as its upper-case name and x and y the contracts' (centre 2147483647), each
  character shifted in (`h * 31 + c`, 32-bit) then the word rotated left by 13. The variant is `abs(hash) % count`, the
  count being the plan's own number of variants in that theme, so a plan with fewer variants takes the remainder by its
  own count (one variant: always the first). Forest has only the high-forest set, so there is no LF/HF choice. Every viewer
  and every reload sees the same board. Training's game id is 0 (a local game), so its variants follow the cells only.
  The ghost draws the variant of the cell it hovers (`HoverState.cell`); the hand, which has no cell yet, the variant at
  the board's centre of game 0.
- **The renderer.** `AssetManifest` reads `themes`; `skinModelPath` picks the variant's path, or the plan's base model
  when the manifest lists no variant of that theme and plan: theme 0, a theme not out (Snow, Desert, Volcano), a host with
  no manifest. `GameScene.setSkins` (and `GameCanvas`'s `skins`) hands the map to `TileRenderer`, which keys its shared
  models by model id (a plan key, or a variant's path): one variant loads once and is shared by its tiles, with its own
  outline geometry, built the same way. A tile whose variant is not in yet keeps the base model it
  already draws (when that is in) and swaps when the variant comes in; a variant that fails to load is not asked again,
  and its tiles draw the base model (logged once). Outlines, MSAA, the segment cut and LIGHT's look are unchanged on skinned tiles: the variants sit on
  the same 0.1 voxel grid, and `renderer-models-edges.test.ts` checks that each of the 72 Forest models gives its Draco
  source's outline segments, within the voxel snap (each source coordinate within 1.3e-4 of the grid). A host that serves
  no `manifest.json` may hand one (`RendererConfig.manifest`, `GameCanvas`'s `manifest`): the stories do.
- **The base model as a fallback (SKIN-BASE, 2026-10-16).** A plan's base model loads only when a tile needs it:
  the plan has no active skin (theme 0, an unlisted theme, a host with no manifest), the skin read failed or has not
  come when the tile first draws (the board never waits on it), or a variant of that plan failed (it loads that plan's
  base model alone). For a plan whose skin is known (`AssetLoader.setSkins`, from `TileRenderer.setSkins`) and whose
  theme the manifest lists, nothing asks for its base model: not the first frame's models, not `preloadAll`'s rest after
  the first frame, not a scene handed no tiles (which used to load all 19). `preloadModels`, which `BoxRainScene` uses
  for its own models, is unchanged. Savings: the 4.2 table (all 19 skinned: 1,089,624 B raw, 653,324 B gzip, a quarter of
  a typical board's bytes). **What a tile drew while its variant was on its way: nothing, when its base model was not
  loaded** (superseded by Q-POLISH-R below: the plan's image on a flat quad now). A cheap placeholder would be a third model and a visible swap, and a delay before the base model would
  re-download the thing this task spares on the connections where the variant is slow; a variant is one file (75,204 to 134,788 B, median 105,326 B, raw) fetched on the tile's placement, and the tile appears when it arrives, the shadow
  map and frame with it (as any late model already does). A tile that already draws a base model (its skin came later than
  its first draw) keeps it until the variant arrives, so no tile vanishes. The ghost follows the same rule, and a ghost with
  no hovered cell draws the variant at the board's centre of game 0, as the hand's tile does, instead of the base model.
  Outlines, MSAA, the segment cut and LIGHT's look are untouched: the same variants and the same code draw them. Reversed
  by loading the skinned plans' base models after the first frame again (`skipsBase` always false), or by a delayed
  fallback if the placement latency turns out visible on a slow connection.
- **A placed tile and the ghost are never empty (Q-POLISH-R, 2026-10-16; PM ruling of that day, which reverses SKIN-BASE's
  "nothing while the variant loads").** On mobile data a just-placed tile must not leave its cell empty. While a tile's
  model is not in (a variant or a base model on its way, at its first draw or after a placement), `TileRenderer` draws a
  placeholder: the plan's 2D image (`assets/tiles/<plan>.png`, the plan view's) on a flat quad at the ground's top
  (`PLACEHOLDER_HEIGHT`, 0.3: every base model's ground is 0.4 of its 4 units high), turned to the tile's orientation as
  its model would be, with its square's outline. It downloads nothing: the 19 images now load with the first frame (4.2),
  and the quad reads the loaded image (a copy of the `Texture`, sharing its source, read as sRGB). It covers every case
  where SKIN-BASE drew nothing (a skinned plan's variant on its way, no base model loaded; the ghost in a live switch of
  skins) and a tile whose base model is not loaded at all (a fresh board on a slow link, before the rest of the models
  come after the first frame). SKIN-BASE's rule stays: a drawn model (a variant, or a base model) stays until the next one
  is in; the quad is drawn only when the tile has no model drawn yet.
  - **The swap.** When the model comes in, the loader tells the scene (`AssetLoader.onLoaded`), which draws the tiles again:
    the model is added to the tile group, then the quad removed, in that one call, before the next frame (render on
    demand), so no frame shows an empty cell or both. The shadow map and a frame follow, as for any late model.
  - **Resources.** One quad geometry and one outline for every plan, one material per plan (its image's copy), made the
    first time a plan needs a quad and kept until `TileRenderer.dispose()`, which disposes them and the image copies
    (not the loader's images). A pending tile's quad takes the pending style (`pendingMaterial`, cached per source). The
    ghost's quad has its own copy of the plan's material (disposed with the ghost, as the ghost's model materials are) and
    its square's outline at the ghost's opacity, as the ghost's model has its own (#657); the ghost's tint applies to it. A plan whose image is not
    in (it failed to load) draws no quad: its tile waits for its model, as before, and gets its quad if the image comes
    first (the loader's retry after the first frame; the ghost's key goes from "none" to "quad"). `tile-placeholder.test.ts`
    checks the quad, the swap (never zero objects for a tile), the ghost, a live switch of skins both ways, a failed
    variant (the quad until its base model), a failed image (the scene starts, no quad, then the model) and a late one,
    that no image or other file is requested for the quad, and the dispose counts after 50 swaps.
  - **What differs on the quad.** Outlines: the square's four sides only, by the same shared material (width, fade, the
    segment cut and software WebGL's "off" apply as on the models); a model's inner creases are not there. MSAA applies.
    LIGHT's look: the quad is lit and receives shadows (a `MeshStandardMaterial`, roughness 0.95), but casts none, and
    the water mask is not applied (the image is not the models' palette). It is flat: no relief, at the ground's height,
    so the swap shows the buildings and trees rising out of it. GPU memory (TEX, 2026-10-16): the image is the 256 px copy
    (4.2), 0.350 MB with mipmaps against 15.05 MB for the 1680 px original (11.3 MB without): 18 quads hold 6.29 MB where
    they held 271.0 MB (measured on the "Renderer/Tiles" story, 4.2).
    The quad reads its image as sRGB (its own copy of the loader's `Texture`, the same source); the plan view reads the
    loader's texture with no colour space (a `MeshBasicMaterial`, as before), and **one colour space cannot serve both**:
    the plan view's texture set to sRGB (captured at 360 and 1280, software WebGL) differs from the current one by a mean
    30 dE over the tile pixels (every pixel above 2 dE, the maximum 56 dE). So the clone stays, a plan
    shown both ways is uploaded twice, and at 256 px that costs 0.350 MB a plan (6.6 MB for the 19), against 286 MB
    for the 19 before. Matching the plan view's colours on a shared sRGB texture would take a shader patch of its
    material (re-encoding the sampled value), which this task does not do for 6.6 MB.
  - **Story:** "Renderer/Skins", control `delayModels` (story `SlowModels`, 4 s): the story holds every model response
    (the page's `fetch` waits before answering a `.glb`), opens the board without its last 12 tiles, places them once it
    is drawn, and hovers a ghost on a cell whose Forest variant the opening board does not load. Captures
    `captures/skins-placeholder-1280.webp`, `-360.webp` (during the hold) and `-after-1280.webp` (after it), headless
    Chrome on the GPU, outlines on (retaken by LIGHT-GPU, 5.5). The story's camera looks straight
    down, so the quad's height does not show there.
- **The device's theme** (`paved.theme.v1`, `useDeviceTheme`, "the board's look" at the top of the theme page) is not read
  by the board. The skins are the chain's and belong to a player: a Challenge board shows its player's choice to every
  viewer. What the device choice should do there is a product choice this task does not settle: a viewer's opt-out
  ("Default": draw every board in base models on this device), or the theme a guest's Training board shows. Left as is.
- **Stories:** "Renderer/Skins" (`packages/app/src/stories/renderer/skins.stories.tsx`): the recorded 72-tile board with
  Forest on none, every other plan, or all 19 (a control), and a readout of the variant files fetched. Captures in
  `captures/skins-*.webp`, 1280 x 800 and 360 x 740, headless Chrome on the GPU, outlines on
  (retaken by LIGHT-GPU). A skinned board has as many shared models as variants shown (up to 52 on the 72-tile board,
  against 19); measured on the GPU in LIGHT-GPU (5.5), it costs no frame time over the base board (within 1 ms, inside the noise).

### 5.7 Placement visuals (SLOTS, P-68; PLATES, P-74)

The owner's brief (via the PM, 2026-10-16, P-68), with the PM's rulings on its gaps. No component drew these before: the
gold slot rings (`RingGeometry`) and the ghost's emissive tint, red where invalid, are replaced by this system.

**The states** (`data/placement.ts`, `usePlacement`; the board page wires Training and Challenge through it, the
Tutorial its one scripted slot the same way):

| State | The board draws | Confirm |
|---|---|---|
| idle (no tile in hand) | the grid | off |
| in hand | the grid; every legal slot in any rotation: a flat yellow fill and a neon border, dashed, solid and brighter where the current rotation fits | off |
| placed, the rotation fits | the tile on its slot under a pale yellow veil, an aura (a halo on the ground and a curtain up its sides, waves running out and up) and the cell's solid border | on |
| placed, the rotation does not fit | the same in red (the PM's reading of item 4: red means "this rotation does not fit here") | **off** |
| confirmed (the move accepted) | the veil and aura turn green over the placed tile, then fade to nothing | (sent) |

- Rotating on a placed tile turns through all four rotations (it turned only through the fitting ones before), so the
  red state is reachable; choosing a slot still picks a rotation that fits there, so a placement starts yellow. A hover
  (the pointer, not a choice) previews the rotation a click would choose: never red, no aura.
- **The green flash comes when the move is accepted**, not when Confirm is pressed: Training once the session's `place`
  resolves true; Challenge when the engine's prediction takes the move (`place` applies it before it resolves; the
  receipt can come seconds and moves later, and a refusal then rolls the board back with its error), or, without
  prediction, once the chain confirms it. A refused move flashes nothing: the tile stays placed, its error in the hand.
  The board holds the confirm for the renderer's fade (`motion.confirmMs`) plus 300 ms (`confirmHoldMs`).
- **The rule lives in one place**, `placementTone(fits)` in `core/placement.ts` (and `placementView` in the app, which
  computes `fits` from the engine's `orientationsAt`): red on any rotation would be a change there.
- The plan view (`BoardMap`) draws the same states flat: faint cell outlines around the tiles by ring (two rings there,
  to keep the tiles large), dashed or solid slot borders, the placed tile with a yellow or red ring and a pale veil, and a
  green flash that fades on confirm (`motion-reduce` shortens it).

**The renderer** (`core/placement.ts`, `PlacementRenderer`, owned by `TileRenderer`; `core/neon.ts`):

- **The grid**: one plane over the tiles' bounds and four rings around, its shader drawing the cell lines antialiased by
  their distance in device px (`fwidth`), at least `minWidthDevicePx` (1) wide, `width` 1.2 % of a tile. Its fade by
  ring is **Chebyshev** (the eight cells around a tile are ring 1, so the band around the board is square and even). A
  small texture holds each cell's ring opacity (ring 1: 1, ring 2: 0.4, ring 3: 0.1, from ring 4: 0, times `opacity`
  0.32), read cell by cell (`texelFetch`): **a line takes the nearer ring of its two cells** (the larger opacity), so the
  outer edges of the first ring are fully visible, the second ring's perceptible (0.4), the third's almost gone (0.1),
  then nothing; along a line the opacity is linear from one row of cells to the next. `gridLineOpacityAt` is the reference
  in TypeScript: it picks the nearest vertical and horizontal lines as the shader does (`floor(h + 0.5)`) and returns the
  nearer one's opacity; the shader draws each line at that opacity times its pixel coverage and keeps the larger, the same
  value on a line (fix loop 2, review t-0484: the reference read the left edge of the point's cell; the tests now read
  between the lines too). Fix loop 1 (review t-0479): a bilinear read of the cell centres gave each line the mean
  of its two cells (1, 0.7, 0.25, 0.05). It is rebuilt only when the tiles' cells change. Colour ink-200 `#d1d9df`.
- **The neon** (`neon.ts`, the reusable piece GLOW can take for the gold slots): `NEON_LINE_GLSL` (a line's coverage at
  a distance, with a pixel floor; dashes along a side with whole corners; a gaussian halo) and a cell-frame material
  (`createNeonFrameMaterial`, `setNeonFrame`): the line's core whitened, the halo in the colour, a flat fill, premultiplied
  (`ONE, ONE_MINUS_SRC_ALPHA`) so the neon adds light and the fill covers in one draw. **Not the bloom pass**: LIGHT-GPU
  found it High-only and shimmering on thin bands. One frame geometry and two materials (dashed, solid) serve every
  slot.
- **Dashes**: long dashes, smaller gaps (`gap` 0.28 of a period), the corners whole L shapes; 2 a side on a small cell, 3
  on a large one, blended over 16 CSS px around 80 px a tile (`slotDashBlend`), so a zoom step never pops.
- **Lines on zoom-out** fade on OUT-FADE's curve (`placementFade`: the outlines' `outlineFade` against the opening tile
  size S): the grid to nothing, the slots' borders down to `fadeFloor` (0.6), so the legal slots stay findable zoomed out.
- **The aura**: one shared geometry around a cell, a halo on the ground just above a tile's ground top (it lies over
  the neighbours' ground, not under it) and a curtain up the four sides, `aV` from 0 at the cell's edge to 1 at the far
  end: bright at the edge, falling to 0, so no hard edge to alias; waves `sin(2π(v · waves − phase))` with the phase looping
  over `periodMs` (1800). The curtain fades out edge-on and on its far side; the aura and the placed cell's border are
  drawn without the depth test (a glow over the neighbours' trees, which would cut it into pieces).
- **The veil**: the tile's own model clone with every mesh drawn in a pale colour (the state's mixed 50 % with white, at
  0.16), its outlines dropped; it shares the model's geometry and uses the outlines' depth bias (factor −1, units −4) to lie
  on the faces without fighting them, drawn after the faces and before the outlines. The ghost itself is now the tile as
  the board draws it (the type's shared model and materials, no shadow): the ghost makes no material of its own.
- **Colours** (the Tailwind tokens): yellow `#f0bf5b` (primary, gold-300), red `#f85e4d` (ember-500), green `#6eca6f`
  (meadow-400).
- **Motion**: a change of tone runs 220 ms, the confirm 700 ms (green in its first third, a smoothstep fade); render on
  demand holds: `TileRenderer.update(now)` reports when an effect still moves (a colour change, the aura's waves, the
  confirm), and `GameScene`'s tick draws a frame only then. **Reduced motion** (`motion.reducedMotion`, "auto" follows
  `prefers-reduced-motion` and its changes): a still aura (no continuous frames), colours at once, a 150 ms fade.
- Every value is a setting (`RendererSettings.placement`, a partial per group) and a control of the story.

**Stories**: "Renderer/Placement" (`packages/app/src/stories/renderer/placement.stories.tsx`): Idle grid, Slots, Placed
yellow, Placed red, Confirm green (played again every 1.6 s) and Reduced motion, every setting a control.

**Frame time (measured, 2026-10-16).** The GPU, Chrome in new headless mode, never
on screen; this branch's static Storybook, "Renderer/Placement" on the recorded 72-tile board, `redraw` on, outlines
forced on, quality and pixel-ratio cap "auto" (Medium; 1.75 on the desktop since Q3-GPU, 2 on the phone-like profile);
per frame the CPU time of every rAF callback of the frame plus the GPU time (`EXT_disjoint_timer_query_webgl2`) from its
first callback to the next frame's; a fresh context per configuration, 120 warm-up and 600 measured frames; two rounds,
the variants alternated and their order rotated; each run started at a 1-minute load under 6 (2.3 to 5.2). **Re-run at
the final head** (`b8db97e5`: main merged with FEATURE-HL #496, TILE-TURN #497 and ERR-UI #495 beside the placement layer,
then fix loop 2, whose shader is unchanged). Main's own changes raised the "none" baseline by up to about 0.65 ms at the
desktop's opening view over the fix-loop-1 run (`8249a74e`, loads 5.4 to 6.0: none 5.96, placed 6.43 there); the
placement visuals' cost stays inside the noise.
Desktop: 1440 x 900 at DPR 2 (2520 x 1575). Phone-like: 360 x 780 at DPR 3, CPU throttled 4x (720 x 1560). Variants:
"none" (no grid, no slot), "grid" (idle), "slots" (a tile in hand: every empty cell next to a tile, dashed and solid), "placed" (the slots, the
placed tile's aura and veil, its waves moving). CPU + GPU per frame, ms, pooled p50 / p95:

| Variant | Desktop, 240 | Desktop, 60 | Phone-like, 240 | Phone-like, 60 |
|---|---|---|---|---|
| none | 5.01 / 6.61 | 4.00 / 5.43 | 3.94 / 5.52 | 2.40 / 4.12 |
| grid | 5.07 / 6.70 | 4.00 / 5.32 | 4.02 / 5.70 | 2.34 / 3.94 |
| slots | 5.13 / 6.79 | 4.04 / 5.37 | 4.03 / 5.64 | 2.41 / 3.84 |
| placed | 5.16 / 6.81 | 2.99 / 5.19 | 4.13 / 5.69 | 2.40 / 3.73 |

The "placed" desktop-60 p50 (2.99 against 4.00 for "none") is run noise, not a saving: the claim rests on the p95.

The placement visuals cost at most 0.2 ms of p95 (desktop and phone-like, opening, the aura moving), inside the runs'
noise elsewhere (worst round: 6.82 desktop, 5.75 phone-like); every row is far
under the rules (12 ms desktop, 16.6 ms phone-like). This driver times the frame from the first callback to the next
frame's and the story's board, so its absolute figures are not those of LIGHT-GPU's table (5.5): compare within this table.

**Zero flicker (outlines on).** Redone in fix loop 1 (review t-0479: the first method's shift search was saturated, so
its residual was the floor of a misaligned comparison). Same machine and mode; "Renderer/Placement" in the top view at
240, its scene driven directly (the story exposes it to the script), the page's pixel ratio equal to the renderer's (1.75
desktop, 2 phone-like: no resampling); "none" (no grid, no slot) against "slots" and "placed" (reduced motion, the aura
still), at the auto tier (Medium) and at Low. Four measures:
- **Still**: 10 frames redrawn 250 ms apart: every variant **pixel-identical** (largest difference 0).
- **Whole-pixel pans**: 12 moves of the camera by exactly 3 device px; each frame against the previous one shifted by
  the offset found within ±5 px (always the pan's own, −3 px: registered, not saturated); the mean absolute residual
  (0 to 255), mean (max) over the steps.
- **Sub-pixel pans**: 16 moves of 0.25 device px: the centre crop's mean-luma step.
- **Zoom**: the distance 240 to 230 in steps of 0.5, the target held: the crop's mean-luma step.

| Tier, profile | Variant | Pan residual | Sub-pixel step | Zoom step |
|---|---|---|---|---|
| Medium, desktop | none / slots / placed | 1.58 / 1.59 / 1.61 (1.62 / 1.63 / 1.65) | 0.015 / 0.052 / 0.052 (0.04 / 0.10 / 0.10) | 0.042 / 0.093 / 0.092 (0.11 / 0.30 / 0.29) |
| Medium, phone-like | none / slots / placed | 1.54 / 1.56 / 1.58 (1.61 / 1.62 / 1.65) | 0.010 / 0.041 / 0.042 (0.02 / 0.09 / 0.08) | 0.020 / 0.039 / 0.040 (0.04 / 0.09 / 0.10) |
| Low, desktop | none / slots / placed | 0.39 / 0.40 / 0.40 (0.41 / 0.43 / 0.43) | 0.016 / 0.051 / 0.052 (0.04 / 0.10 / 0.10) | 0.041 / 0.090 / 0.089 (0.11 / 0.30 / 0.28) |
| Low, phone-like | none / slots / placed | 0.44 / 0.46 / 0.46 (0.47 / 0.49 / 0.48) | 0.008 / 0.042 / 0.043 (0.02 / 0.08 / 0.08) | 0.014 / 0.040 / 0.043 (0.04 / 0.09 / 0.10) |

- **What the method sees.** The pans' floor is what moves under a screen-fixed pattern: at Medium the AO's noise, which
  stays on the screen while the board moves (1.6 levels; at Low, without the AO, 0.4; with the look off, 0.31). Over that
  floor the slots and the placed tile add at most 0.04 of a level: the lines move with the board. The sub-pixel and zoom
  steps of "none" are near 0 (0.01 to 0.04); the lines add about 0.04 of a level on average, 0.3 at most.
- **A positive control**: the High tier's bloom, which shimmers on thin bright bands (LIGHT-GPU), on the slots: the
  sub-pixel step 0.39 (desktop) and 0.46 (phone-like) on average, 7 and 11 times the slots' at Medium, up to 0.95; the zoom step up to
  2.5 levels; the pan residual 3.05 and 3.12 against Medium's 1.59. The method catches it; the default tiers show none.
  High is not a default tier (5.5); its bloom shimmers on the neon as it did on the gold rings.
- 1-minute load 4.2 to 5.9 (every run started under 6). **Re-run at the final head** (`b8db97e5`, loads 2.7 to 5.3):
  every figure above came out the same to the third decimal, the High control included: the measure is deterministic, and
  main's merges (FEATURE-HL's highlight is off by default) changed nothing it sees.

**With FEATURE-HL (#496): a placed tile on a lit board.** The six "… lit" stories of "Renderer/Lighting" (Cities, Roads,
Forests, Largest city, Longest road, Largest forest) and the Mockup, on the GPU, 1280 x 800 at DPR 1.75, distance 90,
the story's ghost placed on its slot (yellow, then red), the aura still (reduced motion), loads under 6:
- The ghost cell's inner 60 % reads the same mean colour, to the hundredth of a level, in all six lit stories as in the
  Mockup (yellow 147.58, 132.00, 98.90; red 148.94, 122.13, 97.46), while the whole frame's mean luma moves from 72.4
  (Mockup) to between 45.4 (Largest city) and 83.2 (Forests) as the board is lit and dimmed: the label glow and dimming
  never reach the placed tile (SLOTS-MERGE's `ghostMaterial`, which holds the feature highlight off), so the veil and aura
  sit on the tile's own colour, with no double tint.
- No z-fighting: still frames are pixel-identical, and 8 pans of 0.25 device px move the cell's mean luma by 0.05 (0.14 at
  most) on average, the same in every story as in the Mockup.
- Captures: `captures/slots-largest-city-lit-yellow.webp`, `-red` and `slots-cities-lit-yellow.webp`.

**Captures** (`packages/app/src/stories/renderer/captures/slots-<state>-<width>.webp`): each story (idle grid, slots,
placed yellow, placed red, confirm green caught about 150 ms into its fade, reduced motion) at 1280 x 800, DPR 2, and
360 x 780, DPR 3, headless Chrome on the GPU, outlines on, quality and cap "auto".

**Where this differs from the brief, or decides a gap** (the PM's rulings stand; these are the thread's, reversible):
- The aura and the placed cell's border are drawn without the depth test (the neighbours' trees cut them otherwise); the
  curtain's far side is not drawn, so the aura never shows through the tile.
- The slots' borders keep 0.6 of their opacity when zoomed out past the outlines' fade (the grid fades to nothing): a
  slot must stay findable at the farthest zoom.
- A hover previews the rotation a click would pick (never red); the aura and Confirm are for a placed tile only.
- The player's "tile preview" setting hides only the hover preview (fix loop 1): a placed tile is always drawn, with its
  aura, veil and colour, red included, so the board says why Confirm is disabled.
- The look's gold highlights (`look.highlights`) no longer draw the slots or the ghost; they stay in the look for GLOW.

**SLOTS2 (P-72, the owner's second pass, 2026-10-17).** Points 1 to 6 of the owner's seven (point 7, DORF, is a task of
its own). What changed over the text above, which it supersedes where they differ:

1. **The grid's reach.** A line now takes the **farther** ring of its two cells (the smaller opacity; SLOTS took the
   nearer): the board's edge and the lines inside ring 1 at 1, ring 2's at 0.5 (`rings` [1, 0.5, 0.1]), ring 3's at 0.1
   (almost invisible), and nothing beyond ring 3: one line less than SLOTS, which drew the outer edge of ring 3. Linear
   along a line as before; the ring metric stays Chebyshev. `gridLineOpacityAt` and the shader both take the `min`.
2. **The grid's strokes.** A hairline of `grid.widthDevicePx` (1) device px at every zoom, antialiased by its coverage of
   the pixel (`gridLineCoverage`: at most one px each side, the same total light at any sub-pixel offset), the device px
   measured across each line by the length of its coordinate's screen gradient (not `fwidth`'s sum, which widens a line
   seen at an angle). No world width any more, and **no fade on zoom**: the grid holds its ring opacities at every zoom.
   `grid.farFade` (off) turns on the outlines' curve (`placementFade`, OUT-FADE2's function with its exponent and eased
   end) from `grid.farFadeStart` (1 S, the opening view) out, the far end only.
3. **The neon is inscribed in its cell.** The line runs inside the cell's edge (its half width and half a device px in,
   plus `slots.inset`, 0), and the line and its glow are multiplied by the cell's antialiased coverage: nothing lights a
   neighbour (two lit cells side by side show two borders). The dashes are capsules: the frame shader computes the
   distance to the nearest rounded segment (`neonFrameDistance`), so a dash ends in a round cap and its glow, a
   distance-field gaussian, wraps the end; the gap is lengthened by the caps so the visible gap stays `gap` of a period;
   the corners stay whole L shapes. The frame's quad is the cell plus a margin for the clip's antialiasing,
   `neonFrameMargin`: `NEON_FRAME_MARGIN` (0.02) or one device px, whichever is larger, set per zoom (the vertex shader
   places the corners); the floor `slots.minWidthDevicePx` (1) is the slots' own now.
4. **The veil** is the state's own colour, the neon's (`veil.whiten` 0, `opacity` 0.14), yellow, red and green alike;
   the plan view's veil and confirm flash likewise, on the tokens the renderer's colours are pinned to, at the same
   0.14 and no UI token (`bg-gold-300/14`, `bg-ember-500/14`, `bg-meadow-400/14`; a test reads `theme.css` and checks
   their hex against `DEFAULT_PLACEMENT_SETTINGS.colors`).
5. **The pulse travels around the tile.** `aura.pulse`: `"rotating"` (the default, a wave of `arcs` (1) whole turns
   round the cell, the angle around its centre, the phase over `periodMs`), `"rotating-noise"` (the same times an
   interference of three sines of whole turns and of whole loops over 30 periods, `noise` 0.6: it does not jump and does
   not seem to repeat), and `"radial"` (SLOTS' waves, in step all around). `waveAmount` 0.6. Reduced motion keeps a still,
   even aura (no wave: a still wave would leave one side brighter).
6. **Scenes/Board** passes the slots, the ghost and the confirm to the real renderer (`BoardViewport`), as the board page
   does: the stories Placing (a tile in hand, its slots dashed and solid), Idle (a move on its way: the grid), PlacedLegal
   (yellow, Confirm on) and PlacedIllegal (red, Confirm off), the slots computed on the recorded 38-tile board by the
   rule the bench's boards were built with (`Layout.isCompatible`).

Every new value is a setting and a control of "Renderer/Placement" (a "Placed noise" story added). From OUT-FADE2's review,
in 5.3: `setPlacementSettings` typed `OutlineFadeSettings`, a non-finite exponent the default's, `fadeFullFactor`'s doc,
the outlines story's "max zoom-in" from its own camera controls.

**Frame time (SLOTS2, measured 2026-10-17).** The same method and configurations as SLOTS above (Chrome new headless on
never on screen, "Renderer/Placement" on the 72-tile board, redraw on, outlines forced on, quality and cap
auto; CPU of every rAF callback of a frame plus the GPU timer query from its first callback to the next frame's; a
fresh context per configuration, 120 warm-up and 600 measured frames; two rounds, order rotated; every run started at a
1-minute load under 6), driven by this thread's own script (SLOTS' was not committed), on this branch's static
Storybook and on main's (`6acb93ad`), each at its 1-minute loads (1.16 to 3.49 branch, 2.09 to 3.31 main). CPU + GPU per
frame, ms, pooled p50 / p95:

| Variant | Desktop, 240 | Desktop, 60 | Phone-like, 240 | Phone-like, 60 |
|---|---|---|---|---|
| none, SLOTS2 | 6.08 / 8.79 | 4.92 / 6.78 | 3.91 / 5.73 | 2.48 / 4.18 |
| grid, SLOTS2 | 6.46 / 9.14 | 4.96 / 7.45 | 4.14 / 6.06 | 1.91 / 2.95 |
| slots, SLOTS2 | 6.69 / 9.48 | 5.06 / 7.85 | 4.31 / 6.76 | 1.88 / 2.88 |
| placed, SLOTS2 | 6.67 / 9.43 | 5.23 / 7.62 | 4.19 / 6.25 | 2.64 / 3.47 |
| none, main | 6.33 / 9.09 | 4.66 / 6.67 | 5.92 / 7.23 | 2.68 / 3.75 |
| grid, main | 6.53 / 9.30 | 5.54 / 7.13 | 5.38 / 6.88 | 2.63 / 4.10 |
| slots, main | 6.63 / 9.25 | 5.59 / 7.56 | 4.90 / 6.68 | 3.01 / 4.27 |
| placed, main | 6.97 / 9.53 | 5.36 / 7.63 | 5.82 / 7.35 | 2.47 / 3.56 |

Every row is under the rules (12 ms desktop, 16.6 ms phone-like, p95): the worst is 9.48 (desktop, slots). Branch and
main overlap within the runs' noise (the "none" rows, the same code on both, differ by up to 2 ms of phone-like p50): no
cost of SLOTS2 stands out of it. This driver's absolute figures are not SLOTS' (its "none" desktop p95 is 8.79 to 9.09
against 6.61): compare within this table.

**Zero flicker (SLOTS2).** SLOTS' four measures, same views and profiles (top view at 240, the page's pixel ratio the
renderer's: 1.75 desktop, 2 phone-like; "placed" under reduced motion), this branch against main, each at loads under 6
(2.30 to 3.38, 2.02 to 3.71). The pans are moved by exactly 3 device px of the camera's view (its `zoom` of 5 included)
and registered at the pan's own 3 px every time. Mean (max):

| Tier, profile | Variant | Still | Pan residual | Sub-pixel step, SLOTS2 / main | Zoom step, SLOTS2 / main |
|---|---|---|---|---|---|
| Medium, desktop | none | 0 | 1.442 (1.47) | 0.016 / 0.016 | 0.067 / 0.067 |
| Medium, desktop | slots | 0 | 1.444 (1.47); main 1.447 | 0.023 (0.04) / 0.040 (0.08) | 0.084 (0.19) / 0.094 (0.20) |
| Medium, desktop | placed | 0 | 1.454 (1.48); main 1.458 | 0.023 (0.04) / 0.040 (0.08) | 0.083 (0.18) / 0.095 (0.19) |
| Low, desktop | slots / placed | 0 | 0.372 / 0.371; main 0.375 / 0.374 | 0.024 / 0.040 | 0.081 / 0.092 |
| Medium, phone-like | none | 0 | 1.547 (1.57) | 0.006 / 0.006 | 0.060 / 0.060 |
| Medium, phone-like | slots | 0 | 1.558 (1.58); main 1.558 | 0.030 (0.06) / 0.019 (0.05) | 0.059 (0.12) / 0.060 (0.14) |
| Medium, phone-like | placed | 0 | 1.582 (1.61); main 1.586 | 0.031 (0.07) / 0.019 (0.05) | 0.058 (0.12) / 0.061 (0.15) |
| Low, phone-like | slots / placed | 0 | 0.471 / 0.469; main 0.472 / 0.471 | 0.026 / 0.018 | 0.056 / 0.061 |
| High (control), desktop | slots | 0 | 3.303 (3.34); main 3.024 | 0.328 (0.52) / 0.285 (0.76) | 1.146 (3.27) / 1.024 (2.13) |
| High (control), phone-like | slots | 0 | 2.940 (3.19); main 2.285 | 0.860 (1.50) / 0.377 (0.65) | 0.749 (2.13) / 0.685 (1.16) |

Still frames are pixel-identical everywhere; over the "none" floor the lines add at most 0.04 of a level to the pan
residual, as on main. The sub-pixel and zoom steps are lower than main's on the desktop (the hairline and the clipped
glow); on the phone-like profile the sub-pixel step is 0.01 of a level higher than main's (0.07 at most), the zoom step
lower: hundredths of one 8-bit level, far under a visible step. High's bloom, the positive control, is caught as before
(sub-pixel steps 10 to 30 times the default tiers', zoom steps up to 3.3 levels): the default tiers show no flicker.

**Captures** (`captures/slots2-<point>-<state>-<before|after>-<1280|360>.webp`, before = main `6acb93ad`, after = this
branch; 1280 x 800 at DPR 2 and 360 x 780 at DPR 3, headless Chrome on the GPU, outlines on, quality and cap auto):
`p1-grid` (idle, opening view), `p2-grid-zoomed-in` and `p2-grid-zoomed-out`, `p3-neon` (slots, distance 60),
`p4-veil-yellow`, `-red` (reduced motion) and `-green` (about 150 ms into the confirm), `p5-pulse-a/b/c` (450 ms apart),
`p5-pulse-noise-a/b/c` (after only), `p5-reduced`, and `p6-board-placing`, `-idle`, `-placed-legal`, `-placed-illegal`
(Scenes/Board; main had none of the last three, so its before is PendingMove, SlotChosen and RefusedMove, without slots).

**Fix loop 1 (review t-0510).** Measured on the GPU (headless), the story at the camera's farthest distance (300):
the smallest tile is 48.3 CSS px on a 1440 x 900 desktop, 42.9 at 1280 x 800, 41.8 on a 360 x 780 phone; a landscape
phone (780 x 360) goes down to **19.3** and a 1280 x 500 window to 26.8 (the tile size follows the viewport's height).
Half a device px is then 0.006 to 0.013 of a cell at the renderer's pixel ratios (1.75 desktop, 2 phone), and 0.019 at
DPR 1 in a 500 px high window, at the fixed margin's 0.02: hence the margin now grows with the device px
(`neonFrameMargin`, tested from 48 down to 5 CSS px); `slots2-p3-neon-far-after-780x360.webp` shows the slots clean at
19 CSS px. At the far limit the grid's ring-3 hairlines stay discrete lines 42 CSS px apart, no wash
(`slots2-p2-grid-far-<before|after>-<1280|360>.webp`): `grid.farFade` stays off. On a phone the renderer's pixel ratio
is capped at 2, so the hairline is 0.5 CSS px, not 0.33; it stays visible in every 360 px capture: no change. The
plan view's veil is on the renderer's pinned tokens at 0.14 (point 4 above). The shaders' comments moved out of their
GLSL strings into the code's comments (the strings ship in the board's chunk): the chunk went from 276 bytes over its raw
budget with the margin to 2,723 under.

**Where SLOTS2 decides a gap** (the thread's, reversible): "ring N" is read as a line taking the farther ring of its
cells (reverse: `max` again in `gridLineOpacityAt` and the shader, and the reach comes back one line); the grid does not
fade on zoom by default (`grid.farFade`); a dashed slot's gap keeps its visible length, the caps added to it.

**PLATES (P-74, the owner's third pass, 2026-10-17).** Every slot becomes a small platform, after Dorfromantik's. It
replaces SLOTS' neon slots and takes the place of the DORF prototype; it supersedes the text above where they differ.
The owner (amended ruling, 2026-10-17) "definitively abandons the yellow rings, solid and dashed, with their veil": the
yellow neon (`neon.ts`, deleted), the solid and dashed strokes, the veil and the rotating pulse are gone from the code,
in 3D and in the plan view; git history keeps them. The ring grid stays as a setting and a story control, **off by
default** (`grid.enabled`).

| State | When | The board draws |
|---|---|---|
| valid | the tile in hand fits there in its current rotation | the base plate under a slightly white aura |
| possible | it fits there in another rotation | the base plate: a pale, neutral blue |
| invalid | it fits there in no rotation | the plate greyscale and more transparent |
| placed | the tile chosen there, not sent | its plate's aura becomes a rim around the tile: white while its rotation fits, red while not |
| confirmed | the move accepted | the rim turns green in the first third of 700 ms and fades out |

- **Which cells** (`boardPlates`, `data/placement.ts`): the slots the session gives (legal in some rotation: valid where
  `fits`, possible where not), then every other free cell next to a tile, invalid. No slot (no tile in hand): no plate.
  `BoardViewport` and `BoardMap` both compute it from the tiles and the slots, so the pages pass what they did before;
  the renderer takes each cell with `fits` and `legal` (`PlacementSlot`, `plateStateOf`).
- **The shape** (`createPlateGeometry`, all in voxels, a tile 40 wide, `RendererSettings.placement.plates`): a slab
  `height` 2 high from the board's level, inset in its cell by half the `gap` (4: 2 each side, so two neighbouring plates
  stand 4 voxels apart and never touch), its corners `radius` 5 round seen from above, its top edge rounded by `bevel` 1
  (a quarter circle, smooth normals: no hard lit edge to alias), no bottom face. The gap is bounded to
  `PLATE_GAP_VOXELS` (1 to 12) whatever the setting, the radius to half the plate, the bevel to the radius and the height;
  a test checks that two neighbours never touch at every gap of the control's range and beyond it. A placed tile's plate
  keeps the same inset (it lies inside the tile's 4-voxel ground). Lit like the tiles (`MeshStandardMaterial`, rough,
  receiving the shadows), so the day and night cycle reaches them; opacity per instance (`aOpacity`).
- **The aura** (`auraAt` is the shader in TypeScript): a flat layer `height` 1.5 voxels above the plate's top, 1 over
  the plate, a smoothstep across `falloff` 2 voxels centred on its edge, so it ends at the cell's edge with no hard edge;
  `intensity` 0.35, premultiplied over what is drawn. Placed: a gaussian rim on the cell's edge (`placedFalloff` 4 voxels
  each way, `placedIntensity` 0.6) just over the tiles' ground top (4.5 voxels: over the tile's ground and its
  neighbours', under their features), so the tile's middle keeps its own colour and the rim reads from every view,
  the top view included. **The red and the green live there** (the PM's item 2, "another way"): the placed tile covers
  its plate, so the plate's own tint (red too) is not seen from above; the rim is.
- **Colours** (tokens in `theme.css`, the renderer's `colors` the same hex; `board-map-plates.test.tsx` keeps them in
  step): plate `#B7CCDC` (`--color-plate`), invalid `#929292` (`--color-plate-off`, no hue), aura `#F5F9FC`
  (`--color-plate-aura`); red ember-500 `#F85E4D`, green meadow-400 `#6ECA6F` as before. Invalid opacity 0.45 against 0.9.
- **Motion**: every plate eases each value (colour, opacity, aura, rim) from where it is to its new state over
  `motion.colorMs` (150 ms, a smoothstep), so a rotation, a choice or a red never pops; a new plate eases in from
  nothing, a gone one out. Reduced motion: at once, and the confirm green at once with a 150 ms fade. Render on demand
  holds: `update` asks for frames while a change runs, and one more to draw its end.
- **Draw calls**: one `InstancedMesh` for every plate and one for every aura and rim (the confirm's included): two draw
  calls whatever the number of slots (SLOTS drew one mesh per slot). The instances are rewritten only while a change runs.
- **The plan view** (`BoardMap`): the same states on the same tokens: each plate inset 5 % of its cell, rounded, valid
  under a white glow, invalid in `plate-off` at 0.45 and not a button; the placed tile's rim white or red, the confirm's
  green fading over 700 ms; each change eased over 150 ms, none under reduced motion. Its ring outlines are a prop
  (`grid`), off by default.
- **Stories**: "Renderer/Placement": Plates, Plates alone (no tile: the shape and colours), Idle, Idle grid, Placed, Placed
  red, Confirm green, Reduced motion; every setting a control (sizes in voxels). "Scenes/Board": Plates, the three states
  at once on the 38-tile board with the tile in hand's rotation (and `placed`) as controls.
- **Bundle** (the client build, this branch against main `f809b9a9`): the board's chunk 873,508 to 870,063 bytes raw
  (-3,445), 250,111 to 249,665 gzip (-446); the CSS 68,861 to 68,394 raw (-467), 12,642 to 12,606 gzip (-36): the code
  removed pays for the plates; no limit moves.
- **Measured on the VPS only** (owner, 2026-10-17: the Mac is out of use): captures in SwiftShader, headless Chromium
  (`captures/plates-<state>-<before|after>-<1280|360>-swiftshader.webp`, 1280 x 800 at DPR 1 and 360 x 780 at DPR 2).
  **The GPU gate is deferred** (PM ruling, plan item GPU-BENCH-BACKLOG): the frame-time bench (CPU + GPU p95, under 12 ms
  desktop, 16.6 ms phone-like) and SLOTS2's zero-flicker check (still frames, registered pans, a zoom sweep, High's bloom
  as the positive control) on the GPU, desktop and phone-like, this branch against main, remain to run.

**Where PLATES decides a gap** (the thread's, reversible): the placed tile's red and green are its plate's aura as a rim
around the tile, not the plate's tint alone (reverse: lift the ghost onto its plate); the plates stand at the board's
level, below the tiles' ground (2 voxels against 4); no tile in hand draws no plate; with the player's placement
highlight off no plate is drawn (the slots stay clickable, as before).

**PLACEMENT-TINTS (#543, the owner's decisions of 2026-10-18).** The halo (the plate's aura and the placed tile's rim) is
gone, "not satisfying in any circumstance"; the states are filters on the tile model itself. It supersedes the aura, rim and
plate-state text above where they differ.

- **Tile in hand** (`TileRenderer`, ghost materials; the states and their ease are `PlacementRenderer`'s, `ghostTint`): hover
  no tint at 50 % opacity; pre-validation (placed, waiting for the bubble's hold to validate) yellow at 100 % opacity
  (PLACE-POLISH, #568, the owner's decisions of 2026-10-19: blue and 90 % before; the hover's colour and strength stay as
  knobs, its strength 0 by default). PENDING-PULSE (#681, the owner's decisions of 2026-10-21) replaced the yellow: the
  pending tile is drawn plain (`pendingStrength` 0), its opacity pulsing from 60 to 90 % and back on a sine
  (`tints.pendingPulseMin`, `pendingPulseMax`, one cycle every `pendingPulseMs`, 1.6 s), eased into from where the tile was
  (a hover's 50 %), its outlines with it; a fixed 75 % under reduced motion (`pendingReducedOpacity`). It keeps pulsing
  through the confirm's hold. While it pulses, `PlacementRenderer.update` reports `animating`, so the scene draws every frame;
  with no pending tile, render on demand holds again. The plan view's tile runs the same range and period in CSS
  (`pending-pulse`, `theme.css`). Confirm: a temporary green tint on the
  tile the board then draws, fading to none over `motion.confirmMs`; placed (after the fade) none. There is no red: the board offers only
  the rotations that fit (#544). Each look eases over its own time (`tints.hoverMs`, `tints.pendingMs`; the confirm over `motion.confirmMs`).
  Every colour, strength (how far the model goes to the tint) and opacity is a `placement.tints` setting and a story control.
- **How it is drawn.** The ghost's material is the tile's own program plus two lines before tone mapping (`mix` to the tint,
  alpha times the ghost's opacity), a program of its own (`paved-tile-ghost`), tint uniforms shared per role. A translucent
  voxel model does not sort its own faces, so each ghost mesh has a depth-only copy drawn just before it (`colorWrite` off,
  `depthWrite` on) and the colour pass writes no depth with `depthFunc` LessEqual: only the nearest face shows, no inner face.
  The ghost's edge outlines are hidden (opaque lines would read as a frame on a translucent model). The confirm is the same
  model, translucent and green, laid over the placed tile (polygon offset against z-fighting) and removed when its fade ends.
- **Plates.** Flat (one face looking up at the tiles' ground top, no side, no bevel), `plates.radius` 3 voxels (5 before),
  two states (`plateStateOf`): playable (the old valid and possible, one blue, `plates.opacity` 0.6) and invalid (grey,
  `plates.invalidOpacity` 0.25; 0.9 and 0.45 before). The plate under the tile in hand fades out (`plates.hideUnderTile`, on
  by default: a translucent tile over a visible plate would show it through; turn it off in the story to judge).
- **Plan view** (`BoardMap`, DOM): the same states with the palette's tokens; the tint is an overlay on the chip.

**SLOT-PLATES-GREY (#588, the owner's decisions of 2026-10-19).** It supersedes the plates' colours and height above.

- **One grey, no hue.** Playable and invalid plates take the same grey, `#C8C8C8` (`placement.colors.plate`; the
  `invalid` colour is gone), and differ by opacity alone: playable `plates.opacity` 0.55 (0.6 and blue `#B7CCDC` before),
  invalid `plates.invalidOpacity` 0.2 (0.25 before). Greyscale plus transparency fits every UI style and every backdrop
  (stories `Renderer/Placement`: `Plates`, `PlatesDusk`, `PlatesNight`). Tuned at 375 x 812 on the GPU: the issue's
  proposal (`#929292`, 0.4 and 0.25) left the two states hard to tell apart by day and nearly gone at night (the plates
  are lit, so the night's light darkens them); a lighter grey and a wider gap between the two opacities keep them apart
  by day, at dusk and at night.
- **One token.** `--color-plate` is that grey; `--color-plate-off` is merged into it. The plan view (`BoardMap`) draws
  `bg-plate/55` and `bg-plate/20`; `board-map-plates.test.tsx` keeps the hex and the opacities equal to the renderer's.
- **At the tiles' bottom.** `PLATE_Y` (`placement.ts`) is a model's foot (y 0, `TileRenderer` sets each model's bottom
  there), lifted a twentieth of a voxel, no longer the ground slab's top (4 voxels): from the side a plate lies level with
  the foot of the tiles around it (story `PlatesSide`, the steepest tilt). The grid lines lie there with them. Nothing else
  is drawn at that level (a plate is inset in its own cell, and the tile in hand's own foot is hidden under its ground), the
  neighbours' shadows still reach the plates (they receive shadows, lit like the tiles), and the plate under the tile in
  hand still fades out (`plates.hideUnderTile`).

### 5.8 Loading (LOAD-FAST)

**As built (LOAD-FAST, 2026-10-17).** The owner: "in the board scene's story, it takes several seconds before the assets
show". Targets (to confirm by measure): the first 3D tile under 1 s warm and under 2 s cold on desktop.

- **Method.** `packages/app/scripts/load-trace.ts` opens a page, cold (a fresh browser) or warm (the page loaded once in the
  same browser context, then again), with the renderer's load trace on: `globalThis.__PAVED_LOAD_TRACE__ = true` turns on
  the `performance` marks and measures named `paved:<step>` (`packages/renderer/src/core/load-trace.ts`; off, each costs a
  flag read). It gives, per run, the time from navigation to each step: the manifest, each model's download (resource
  timing) and its decode (from the download's end to the load's end: GLTFLoader's parse and the meshopt workers, plus any
  wait for the main thread), the meshopt decoder's workers, the 19 tile images, the outline edges, the labels, each scene's
  first frame (drawn inside `GameScene.start()`: compiles and uploads included), and every model in. It also reads the
  network log (protocol, bytes, cache), and can take a CPU profile (`--cpuprofile`).
  - **Where:** the VPS, headless Chromium, **software WebGL (SwiftShader)**, outlines off by the software rule (5.3); on a
    loaded, shared machine, so a figure moves by about 300 ms run to run. Three runs per cell, the median.
    The pages were served by a local Caddy (HTTP/2, TLS trusted by its key's hash, gzip and zstd for text, none for
    `.glb`, as the hosts do), either with `Cache-Control: no-cache` everywhere (what the Storybook host sends) or with
    `public, max-age=31536000, immutable` on the content-hashed paths (the list below). Builds: `before` is main plus the
    trace alone (4d0b07b0), `after` is this branch.
  - **Profiles.** Desktop: 1440 x 900 at DPR 2, no throttling, the network local. Phone (approximation): 360 x 780 at DPR
    3, the CPU slowed 4x, the network shaped to 9 Mbit/s down and a 170 ms round trip; the GPU is still the machine's
    software one.
  - **What the software figures cannot give.** The first frame's shader compiles and texture uploads are GPU work: on
    SwiftShader they run on the CPU, and the main thread waits for them (`(program)` in the profile: 470 ms after the
    hand's first frame on the app, desktop). Those two rows are **GPU: to measure on the Mac** (the load trace and the
    driver run there unchanged, headless, with the GPU).
- **What the board's load is** (main, before this task). The app's board page mounts **two scenes**: the board and the
  hand's tile (`TileView`, a second `GameCanvas`, its own WebGL context). Each had its own `AssetLoader`, so each fetched
  and parsed the manifest and every model it drew, and after its first frame each loaded the other models (18 more): the
  page asked for 37 model files where it needed 19. The first frame waits for the manifest, then for the models of the tiles
  handed over and the 19 tile images (4.2, 5.6), then draws. The manifest was asked for by the tile chips (`useTileArt`)
  and by each loader, twice in all, and only once the scene had mounted, after the board's code had loaded and React had
  rendered the page. In Storybook the board stories (`Scenes/Board`, `BoardViewport`, `TileView`) read **app-web's plain
  models** (`/app-web-assets/models/<plan>.glb`, 653 to 934 kB each, 14.96 MB for the 19), not the app's compressed ones
  (1.10 MB): 16.5 MB a cold visit (measured on the published Storybook too, from the VPS: 16.5 MB over HTTP/3, and 86
  revalidations, all `304`, on a warm visit).
- **The FEATURE-HL labels** (`features.ts`) do not run at load by default: the highlight is off (`featureHighlight.enabled`
  false), and they run only once a highlight is on, one model per idle slice, after the first frame. With a highlight on
  ("Renderer/Lighting", "Cities lit"): 39 to 77 ms per model on desktop, 110 to 164 ms on the phone profile (software
  CPU). Off the first frame's path: not precomputed (a build-time asset per model would add 19 to 91 requests or a
  manifest field for idle CPU only).
- **The fixes** (each in the table below, before and after):
  1. **One model load per page** (`AssetLoader`, `sharedModels`): a model URL is downloaded and parsed once, shared by
     every loader of the page (the board's and the hand's); each loader that stores it counts as a user, and the last to
     let go disposes it. 37 model requests become 19 (Storybook), 21 become 19 (app, cold), 38 become 19 (app, warm).
     The geometry is shared, as it already was among a scene's tiles; each scene still builds its own outline edges and
     materials. A model is parsed by the loader that asked first (its owner); disposed while that load is pending, the owner
     abandons it, and the loaders waiting on it load their own (a Draco decode dies with its owner's workers). The last
     user disposes the geometry, the materials and their palette maps. Tests: `asset-loader-order.test.ts` ("loads a model
     once for every loader of the page…", "lets a model go…"), `asset-loader-draco.test.ts` ("never leaves a loader
     hanging on a shared Draco load whose owner was disposed mid-decode").
  2. **One manifest request, started with the board's code** (`packages/app/src/data/renderer-manifest.ts`): the board's
     route loader (`routes/page-loaders.ts`) asks for `renderer-assets/manifest.json` when it imports the board's chunk;
     the board page hands that request to the renderer (`provideManifest`, before any scene mounts), and the tile chips
     read their images from it. A failed read falls back to the loader's own (with its retries). The manifest is now in
     before the scene starts (desktop cold: 639 ms → 280 ms after navigation; phone cold: 2351 → 1565 ms). Tests:
     `packages/app/__tests__/renderer-manifest-early.test.ts`, `asset-loader-order.test.ts` ("reads a manifest the host
     already asked for…").
  3. **Storybook's board stories on the app's compressed models** (the coordinator widened the task's files for it): the
     stories at `APP_ASSETS` (`/renderer-assets`, the app's `public/renderer-assets/`) get the app's manifest before any
     scene asks (`.storybook/preview.tsx`, `provideManifest(APP_ASSETS, APP_MANIFEST)`). `APP_MANIFEST`
     (`src/mocks/assets.ts`) is read from the file names and equals the build's `rendererManifest()`
     (`__tests__/storybook-assets.test.ts`). The board scene, `BoardViewport`, `TileView`, and the renderer boards
     (outlines, lighting, skins, placement) read it. A guard in the same test fails when a story hands the renderer
     app-web's folder, except three named readers: the tile browser (the source models, `models/extended/` among them,
     which only app-web holds), "Renderer/Tiles" with its original images (as before TEX), and `hand-panel.stories.tsx`'s
     `Rendered` (not in this task's files). So app-web's folder stays in the Storybook build (48.4 MB in all, about the
     same), until those three move. Measured on the built Storybook (5 runs; the warm rows run alternately, 6 runs each,
     since the load moved between the first runs):

     | `scenes-board--board-72`, no-cache | Page bytes | First 3D tile | **Board drawn** |
     |---|---|---|---|
     | desktop, cold: before / after | 16.51 MB / 2.40 MB | 1462 / 1528 | **2178 / 2426** |
     | phone, cold: before / after | 16.51 MB / 2.40 MB | 21894 / 7817 | **25378 / 10546** |
     | desktop, warm: before / after | 3.9 kB / 3.9 kB | 1268 / 1171 | **1908 / 1886** |
     | phone, warm: before / after | 4.0 kB / 4.0 kB | 4802 / 4538 | **7172 / 7551** |

     Cold on the phone profile, the board comes 14.8 s sooner (2.4x); on the desktop profile the network is local, so the
     download was never the cost there, and the difference is inside the noise. Warm, nothing is downloaded either way:
     the compressed models' meshopt decode costs no more than the plain models' parse, within the noise.
- **Not done, and why.** Decode in a worker and the decoder at app start: meshopt already decodes in two workers
  (`MeshoptDecoder.useWorkers(2)`, ready in 70 to 380 ms, before the manifest is in), and the decode's tail is the wait for
  the main thread, not the decode. Merging the 19 models into one binary: the models download in parallel over HTTP/2 in
  10 to 40 ms locally; the request count is not the cost. Compiling the shaders ahead (`renderer.compileAsync` on a
  warm-up scene, with `KHR_parallel_shader_compile`): the stall it would remove is the largest left on software WebGL,
  but it is `GameScene`'s (closed to this task until SLOTS merges) and its size is a GPU figure: to measure on the Mac
  first. The 2D placeholders already show at once and stay until the models arrive (5.6).
- **Where the time goes now** (app, desktop, cold): the board's code and React until the scenes start (about 0.4 to 0.5 s
  here), the first models and images (in by 0.75 s), then the two scenes' first frames; the board's waits on the main
  thread behind the hand's compile and link (software). The bundle: entry +136 B raw (+55 gzip), the board's chunk +1,496 B
  (+604), first-load JS +681 B (+429), against main 35871a0d; all within `bundle-budget.json`, unchanged.
- **Targets.** On software WebGL, the first 3D tile (the hand's) comes at 0.93 s cold and 0.58 to 0.86 s warm on desktop:
  inside both targets. The board itself is drawn at 1.58 s cold (under 2 s) and 1.35 to 1.46 s warm (over 1 s): what is
  left is the compile stall, a GPU row. Phone profile: the first 3D tile at 3.2 s cold, 1.8 to 2.1 s warm; the board at 4.3
  s cold, 3.0 to 3.1 s warm. **The Storybook board is not inside the targets yet on software WebGL**: warm, it is drawn at
  1.89 s on desktop (over 1 s), and desktop cold did not improve with fix 3 (2.18 s before, 2.43 s after, inside the
  noise): on the desktop profile the network is local, so the 15 MB were never its cost; the main thread is (Storybook's
  own code, the two scenes' compiles). Fix 3's gain is on a real network: the phone profile, cold, 25.4 s to 10.5 s.
- **The timeline** (ms from navigation, median of 3; "decode" from a model's download end to its load's end; "first frame"
  is that frame's own duration):

  **The app, `/training` (the built app, a guest: the base models)**

  | Profile, cache, headers | Build | Manifest in | Models: requests / bytes | meshopt ready | Decode median / max | Tile images in | Edges (sum) | First frame: hand / board (GPU: Mac) | **First 3D tile** | **Board drawn** | All models in | Page bytes |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | desktop, cold, nocache | before | 639 | 21 / 1.10 MB | 131 | 193 / 1425 | 685 | 70 | 116 / 79 | **870** | **1534** | 1969 | 1.86 MB |
  | desktop, cold, nocache | after | 280 | 19 / 1.10 MB | 86 | 205 / 1380 | 750 | 60 | 111 / 99 | **929** | **1575** | 1973 | 1.86 MB |
  | desktop, warm, nocache | before | 641 | 21 / 6.3 kB | 88 | 195 / 1526 | 686 | 57 | 133 / 118 | **901** | **1669** | 2185 | 3.7 kB |
  | desktop, warm, nocache | after | 234 | 19 / 5.7 kB | 112 | 557 / 1343 | 681 | 45 | 92 / 90 | **859** | **1455** | 1937 | 3.7 kB |
  | desktop, warm, immutable | before | 693 | 38 / 0.0 kB | 213 | 231 / 1430 | 728 | 69 | 100 / 119 | **951** | **1575** | 1965 | 0.2 kB |
  | desktop, warm, immutable | after | 162 | 19 / 0.0 kB | 82 | 446 / 1384 | 406 | 41 | 95 / 100 | **584** | **1351** | 1756 | 0.2 kB |
  | phone, cold, nocache | before | 2351 | 21 / 1.10 MB | 266 | 422 / 2643 | 2723 | 127 | 252 / 206 | **3267** | **4638** | 6666 | 1.86 MB |
  | phone, cold, nocache | after | 1565 | 19 / 1.10 MB | 260 | 338 / 2147 | 2618 | 183 | 392 / 258 | **3177** | **4332** | 6105 | 1.86 MB |
  | phone, warm, nocache | before | 1623 | 21 / 6.3 kB | 202 | 595 / 2501 | 1856 | 103 | 220 / 221 | **2234** | **2945** | 4228 | 3.7 kB |
  | phone, warm, nocache | after | 904 | 19 / 5.7 kB | 219 | 399 / 2001 | 1662 | 117 | 293 / 196 | **2123** | **3039** | 3898 | 3.6 kB |
  | phone, warm, immutable | before | 1433 | 21 / 0.0 kB | 338 | 941 / 4730 | 1480 | 204 | 656 / 356 | **2425** | **4582** | 6330 | 0.2 kB |
  | phone, warm, immutable | after | 1192 | 19 / 0.0 kB | 251 | 1075 / 2528 | 1239 | 172 | 294 / 213 | **1822** | **3089** | 3967 | 0.2 kB |

  **Storybook, `scenes-board--board-72`**

  | Profile, cache, headers | Build | Manifest in | Models: requests / bytes | meshopt ready | Decode median / max | Tile images in | Edges (sum) | First frame: hand / board (GPU: Mac) | **First 3D tile** | **Board drawn** | All models in | Page bytes |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | desktop, cold, nocache | before | 1233 | 37 / 14.97 MB | 185 | 480 / 5400 | 1353 | 185 | 118 / 195 | **2380** | **3173** | 6680 | 16.51 MB |
  | desktop, cold, nocache | after | 1187 | 19 / 14.96 MB | 131 | 1183 / 4410 | 1327 | 236 | 142 / 123 | **2209** | **3286** | 5858 | 16.51 MB |
  | desktop, cold, nocache | after, compressed models (scratch) | 1153 | 19 / 1.10 MB | 200 | 1267 / 4422 | 1257 | 347 | 149 / 161 | **2662** | **3728** | 6214 | 2.63 MB |
  | desktop, warm, nocache | before | 851 | 37 / 11.1 kB | 91 | 942 / 3460 | 959 | 182 | 94 / 120 | **1544** | **2467** | 6222 | 4.2 kB |
  | desktop, warm, nocache | after | 721 | 19 / 5.7 kB | 97 | 963 / 4756 | 821 | 296 | 142 / 133 | **1443** | **2466** | 5559 | 3.9 kB |
  | desktop, warm, nocache | after, compressed models (scratch) | 762 | 19 / 5.7 kB | 69 | 731 / 4122 | 857 | 232 | 121 / 164 | **1341** | **2252** | 4902 | 3.9 kB |
  | desktop, warm, immutable | before | 505 | 37 / 11.1 kB | 75 | 836 / 3799 | 644 | 195 | 92 / 103 | **1109** | **1959** | 4109 | 1.4 kB |
  | desktop, warm, immutable | after | 571 | 19 / 5.7 kB | 91 | 1167 / 3688 | 747 | 260 | 158 / 115 | **1553** | **2526** | 4282 | 1.2 kB |
  | phone, cold, nocache | before | 3860 | 19 / 14.96 MB | 304 | 328 / 1452 | 4941 | 657 | 302 / 331 | **18701** | **21280** | 23267 | 16.51 MB |
  | phone, cold, nocache | after | 3908 | 19 / 14.96 MB | 371 | 1096 / 6769 | 4900 | 612 | 326 / 318 | **19771** | **20841** | 22687 | 16.51 MB |
  | phone, cold, nocache | after, compressed models (scratch) | 4763 | 19 / 1.10 MB | 375 | 4326 / 9738 | 5714 | 1137 | 512 / 456 | **8544** | **12800** | 16172 | 2.63 MB |
  | phone, warm, nocache | before (re-run later, at a lower load) | 2054 | 19 / 5.7 kB | 182 | 2182 / 2201 | 2790 | 687 | 213 / 228 | **4036** | **6063** | 7445 | 4.1 kB |
  | phone, warm, nocache | after | 4260 | 19 / 5.7 kB | 508 | 5656 / 6974 | 4809 | 1229 | 548 / 655 | **12499** | **16515** | 13411 | 4.0 kB |
  | phone, warm, nocache | after, compressed models (scratch) | 3811 | 19 / 5.7 kB | 767 | 2814 / 2994 | 4329 | 1036 | 318 / 491 | **6462** | **8801** | 7023 | 4.0 kB |
  | phone, warm, immutable | before | 1846 | 19 / 5.7 kB | 287 | 2752 / 2847 | 2596 | 631 | 304 / 339 | **4346** | **6510** | 8508 | 1.1 kB |
  | phone, warm, immutable | after | 2255 | 19 / 5.7 kB | 376 | 3019 / 3114 | 2827 | 655 | 272 / 485 | **4409** | **7312** | 5391 | 1.4 kB |

  **Reading the tables.** "Models: requests" counts the model requests the page's resource timing holds when the capture
  ends (a frame after the first loader has every model it asked for): the second scene's requests after its first frame are
  not always in yet, so a cell shows 19, 21, 37 or 38 for the same page (38: both scenes' cache hits, before fix 1). "All
  models in" is that first loader's moment, usually the hand's, so it can come before "Board drawn". A row's cells are
  medians taken one by one, not one run. The Storybook "phone, warm, nocache, after" row (16.5 s) is slower than its
  "before" row, measured at another time under another load: the alternated comparison under fix 3 (6 runs each, both
  builds in turn) puts warm before and after within the noise. The rows marked "scratch" are the copy described in fix 3,
  before it was built.

- **Caching rules** (for the hosts; this task changes no host's configuration). The Storybook host sends
  `Cache-Control: no-cache` for everything, so a warm visit revalidates every file. A content-hashed name changes with its
  content, so it may be cached for a year; a fixed name must be revalidated.
  - **`public, max-age=31536000, immutable`:** `renderer-assets/models/<plan>.<hash>.glb` (19),
    `renderer-assets/models/forest/<plan>_HF_<n>.<hash>.glb` (72), `renderer-assets/tiles/<plan>.256.<hash>.png` (19); Vite's
    `assets/<name>-<hash>.{js,css,wasm,woff2}` (the app: 87 scripts, 1 stylesheet, 2 wasm, 4 fonts) and their `.map`
    files; Storybook's `assets/<name>-<hash>.*` (239 scripts, images, fonts, wasm, the captures' `.webp`).
  - **`no-cache`:** `index.html`, `iframe.html`, `index.json`, `project.json`, `renderer-assets/manifest.json`; every
    unhashed file: `fontawesome/js/{fontawesome,solid,thin}.min.js` (the subset, no hash in its name), `backgrounds/*`,
    `favicon*.svg`, the `nunito-sans-*.woff2` and `sb-common-assets/*`, `sb-manager/*`, `sb-addons/*`,
    `vite-inject-mocker-entry.js`, and `asset-sources/` in Storybook (`asset-sources/models/<plan>.glb`,
    `asset-sources/draco/*`, `asset-sources/assets/tiles/*`), `THIRD_PARTY_NOTICES.txt`.
  - VERCEL-CFG (#500) wrote such rules for the Storybook's Vercel project (`vercel.json` at the root): they match this list
    (`assets/*`, `renderer-assets/models/*` and `renderer-assets/tiles/*` immutable; the HTML, `index.json`, `project.json`
    and the manifest `no-cache`; the rest keeps Vercel's default, which revalidates), and VERCEL-APP (#504) for the
    client's (`packages/app/vercel.json`: the same, with `fontawesome/*`, `backgrounds/*` and `THIRD_PARTY_NOTICES.txt`
    `no-cache`). The host that served `storybook.paved.bal7hazar.com` still sent `no-cache` for everything on 2026-10-17
    (measured with `curl -I`).
  - **Measured** (the warm rows above, `nocache` against `immutable`): on the app, immutable caching saves the
    revalidations (21 requests, about 5.7 kB, but one round trip each): desktop, the first 3D tile 859 → 584 ms; phone,
    2123 → 1822 ms. On Storybook the board's models were unhashed (app-web's), so immutable caching did not reach them;
    the stories now read the hashed copies (fix 3), which the rules above cover (not measured on Storybook with immutable
    headers).
- **Zero flicker and 12 ms.** No per-frame code changed: the render loop, the materials, the outlines and the effects are
  untouched; the changes are in the loading path only. The bench ran as a smoke run here (headless, software WebGL, 72
  tiles: 74 draw calls a frame, as before) and its frame time is not a figure: the frame-time and flicker re-run is a GPU
  run on the Mac, with the two GPU rows above.
- **Reversed** by giving each loader its own models again (`sharedModels`), or by dropping `provideManifest` (each loader
  then asks for its own manifest).

**The home's load (V2-HOME-LOADING, #761, 2026-10-25).** Measured first, as the owner asked: the time from the navigation to
the village's first full frame (its tiles and tile images drawn, `paved:first-frame` of the home's one scene), on the built
app as a guest (the starter village), with `packages/app/scripts/load-trace.ts --storage welcomed=1 --chunks
home,home-stage,starter-village,home-canvas` (same method and server as above: Caddy, HTTP/2, the hosts' cache headers,
software WebGL, three runs a cell, the median; the machine was shared and loaded, load average 13 to 23 on 8 cores, so the
warm rows moved by up to 3 s run to run). The split: the home's chunk (the overlays), the stage's chunk, the village's read
(the starter village's chunk), the canvas's chunk, the manifest, the tile images, the first models, the first frame drawn.

| Profile, cache | Home chunk | Stage chunk | Village read | Canvas chunk | Manifest | Tile images | First models | **Village drawn** (runs) |
|---|---|---|---|---|---|---|---|---|
| phone, cold | 1162 | 1502 | 1776 | 2527 | 2544 | 3204 | 3723 | **4894** (4819, 4894, 4996) |
| phone, warm | 2411 | 2683 | 3102 | 3951 | 4586 | 5092 | 5694 | **7158** (5215, 7158, 7830) |
| desktop, cold | 462 | 876 | 991 | 1389 | 1491 | 2205 | 2392 | **3214** (2769, 3214, 3540) |
| desktop, warm | 2855 | 2986 | 3169 | 3464 | 3509 | 4502 | 4853 | **5532** (2860, 5532, 5965) |

The threshold (1 s, cold, phone) is passed on every row, the fastest run included (desktop warm, 2.86 s): the home arrives
fogged (`elements/village-fog.tsx`). The overlays paint first, as before; the scene's box is under a thick fog (the
placeholder sky under two drifting banks of mist) from the stage's mount until the canvas's ready signal
(`VillageLayoutCanvas`'s `onReady`: after `GameCanvas`'s, which comes once `GameScene.init` has awaited the models of the
tiles handed over and `start` has drawn that frame, it also waits for every tile image, `GameScene.tileImagesReady`, since
`init` lets the scene start without an image that failed; that call asks again for the missing images, four tries in all
with a doubling pause from 500 ms, then a frame is drawn), then thins out in 600 ms (a plain fade under reduced motion).
Images that never come are the renderer's failure: the plan view replaces the canvas, and the fog goes with it, so it never
clears onto a village with an asset missing. The fog takes no pointer and covers the scene's box only (not the overlays,
not the editor's panel). The plan view (low quality, no WebGL, a renderer that failed) has none. A later arrival in the same page (Back from a page) fades in in
200 ms (`routes/village-arrival.ts`). Captures and the GIF: `packages/app/scripts/home-loading-captures.ts`.

### 5.9 Day and night (DAYNIGHT, P-73)

The owner's request (2026-10-17, via the PM, P-73): an animated, coloured background instead of the flat dark one. A gradient in summer colours turns to a summer night, then to an autumn day, and so on round the seasons. The cycle is progressive, two minutes long, and starts on a random season. The light moves east to west over the day, so the shadows turn. At night the cities and the buildings along the roads light up progressively, using FEATURE-HL's labels, to make up for the fading light. The PM's rulings fill the gaps (a cycle is a day then a night of one season; OKLab; stable shadows; staggered lights; a brightness floor; story controls; a Settings row; a still scene for reduced motion and the Low tier; its own lazy chunk).

**As built.**

- **The chunk.** `core/daynight.ts` is a chunk of its own, loaded by `GameScene` the first time the cycle is on (`loadDayNight`). It is 7.8 kB raw, 3.2 kB gzip in the app's build. It holds:
  - the clock and the keyframes;
  - OKLab;
  - the sun and the moon;
  - `drawDayNight`, which sets a frame on the scene's lights.
  The board's chunk keeps only the settings (`core/daynight-settings.ts`), the backdrop's GLSL in the final pass, the night lights' GLSL in the tile shader, and a little glue. No budget limit moved. Before BOARD-CHUNK (#510) the board chunk was 903,056 B raw, 112 bytes under its 903,168 limit. Merged with it, the chunk is 873,508 B raw and 250,111 gzip against 888,320 and 254,464.
- **The clock.** Time is measured in seasons since a summer's dawn: 1.3 is an autumn noon. The cycle is pure and seeded:
  - `cycleAt` gives the season, the phase and the blend;
  - `DayNightClock` steps by `frameMs` (33 ms) of real time, times `speed`;
  - `startSeason` gives the season named, or a seed's, or one drawn once per page.
  A cycle lasts `cycleMs` 120,000: the sun is up for 0.625 of it (75 s, dawn and dusk included), then 45 s of night. The keyframes hold over dawn [0, 0.03], day [0.12, 0.46], dusk [0.55, 0.59] and night [0.68, 0.93] of a cycle, with a smoothstep between two holds. The night eases into the next season's dawn. A page's cycle starts at the day's hold (`START_POSITION`), and every board of the page shares the page's clock. Tests: `daynight.test.ts`.
- **The keyframes** (`KEYFRAMES`, season × dawn/day/dusk/night). For each: the backdrop's two ends, which are Tailwind tokens (a test reads `theme.css`); the sun's colour and strength; the fill, which is the moon at night; the sky and ground colours, the sky light's strength and its ambient; and the night lights' level. Colours blend in OKLab, strengths linearly. Summer's day is the Mockup look's lights. The sun's noon elevation is 62° in summer, 42° in autumn, 28° in winter and 50° in spring.
- **The backdrop.**
  - The scene is cleared to transparent. The final pass (`FinishPass`, `BACKDROP`) lays a vertical gradient between two OKLab colours under what the scene left uncovered (its alpha), after the tone map and the grade. The tokens therefore reach the screen as given, under the vignette.
  - The gradient is computed per pixel in OKLab and dithered (interleaved gradient noise, ±0.5 of an 8-bit level, only where the scene is uncovered): there is no banding.
  - Under the backdrop the bloom keeps three's colour blend (`SRC_ALPHA, ONE`) and adds nothing to the alpha. Without the backdrop the stock blend is untouched: the chain is rebuilt when the backdrop toggles.
  - The fog takes the backdrop's middle colour.
  - Off, the look's flat background and its single sRGB transfer are unchanged.
- **The sun and the moon.**
  - The key light runs the arc east (azimuth 90, +X) → south (0) → west (−90), with an elevation of `max · sin(πu)`. It fades in over its first 8° and out over its last. Its shadows are drawn from at least 8°.
  - Below the horizon it stays at its setting place, dark: the shadow map is not drawn through the night.
  - The fill sits opposite the sun by day and follows the moon's own arc by night (dim and cool, no shadow).
  - The sky light and ambient are at least `brightnessFloor` (0.85) of the season's day, so the board stays readable at night.
- **Stable shadows: a crossfade a step of the arc apart.**
  - The first build drew the shadow map from the sun at every 33 ms step. Measured with the sweep below, it boiled: at a summer noon, at ×1, pixels went up and back by 15.6 levels in total over 24 steps (desktop, Medium). With the shadows off, or the map frozen, it was 0. The fixed frustum was not the cause: every redraw from a light turned by a fraction of a degree re-aliased every small shadow edge (trees, voxels). Neither PCF radius 1 (18.7) nor VSM (9.6) fixed it.
  - The fix (`drawDayNight`, in the cycle's chunk): the sun's shadows are held at steps of `SHADOW_STEP` (1° of the arc) and crossfaded between the key light and a twin, a clone of the key with its shadow, added while the cycle is on.
  - Each light holds one step: the key the even ones, the twin the odd ones. The weight moves linearly, so each pixel moves linearly within a step. A light jumps two steps on only while its weight is 0.
  - The maps are drawn again only at a step: about every 0.42 s at ×1, two maps each time. The boil fell to 0.77 at noon (Low: 0.98).
  - **Only while the cycle moves** (fix loop 1). A still scene (reduced motion, the Low tier), a held moment (`freezeAt`) and the cycle off draw with the key light alone. The twin is not made, or is released and its shadow map disposed, so there is one shadow map and one lookup compiled. `dispose` releases the twin too, with the context kept or not.
  - Cost while it moves: two shadow lookups per fragment. A program recompile happens when the cycle starts or stops moving (the light count changes).
- **The night lights.**
  - Since NIGHT-WINDOWS-DEFAULT (#583) the night lights are the buildings' windows and doors, the only source: the first build's lit columns (`lightColumns`, `NIGHT_LIGHTS_GLSL`) are removed.
  - The openings are found in each model's voxel grid (`windows.ts`, NIGHT-WINDOWS #513 and #571): the recesses and the holes through the hollow houses' and towers' walls, on every wall, but the pockets in leaves. The doors (on the slab, two cells high or more) light as the windows do; the gaps (one cell high) never.
  - Their light is baked per model type into a 3D texture (`NIGHT_WINDOWS_GLSL` reads it at the air cell in front of the face) and past the tile's border into the board's spill map: strength 0.4, reach 6 voxels, falloff 1.5 (the first pass's), margin 6. Each window (its owner × its tile's cell, by an integer hash) switches on over 0.15 of the night's ramp, spread over 0.85 of it, so every window is lit at full night. The colour is amber-300 `#ffb57a`.
  - The level rises with the keyframes: 0 by day, 0.3 to 0.45 at dawn, 0.6 to 0.7 at dusk, 1 at night.
  - Turning the lights on labels the models drawn, once each, in idle slices, as a highlight does.
  - The ghost holds them off, as it holds the highlight.
- **Still.** Under reduced motion (the setting, or the device's for "auto", followed live) and on the Low tier, the scene shows the start season's noon: no clock, no moving shadow, no night lights, and no labelling.
- **Settings.** `RendererSettings.dayNight` (off in the renderer). The app's Settings has a row, "Day/night cycle", on by default (`paved.settings.v1`, `dayNight`). The board's renderer gets `{ dayNight: { enabled } }`; the hand's tile (`TileView`) does not run the cycle.
- **Stories.** "Renderer/DayNight":
  - Cycle, Fast (×10), SummerDay, SummerNight, AutumnDusk, WinterDawn, NightNoLights, ReducedMotion, SlotsAtNight, PlacedAtDusk and ForestAtNight.
  - Controls: the cycle length, a phase to hold, the season, ×1/×10, the lights, the floor, reduced motion and the tier. The scene is exposed as `window.__dayNightScene`.
  - "Scenes/Board" has DayNight (×10) and DayNightAtNight.

**Measured** (the GPU, Chrome in new headless mode, never on screen; this branch's static Storybook; the recorded 72-tile board; outlines forced on; quality and pixel-ratio cap auto (Medium; 1.75 desktop, 2 phone-like); 1-minute loads 1.3 to 3.3).

*Frame time*, CPU + GPU per frame, ms.
- Method: the tick's CPU plus `EXT_disjoint_timer_query_webgl2` around the rendered frame; every frame drawn; 120 warm-up and 600 measured frames; a fresh context per configuration; two rounds, the order rotated. The figure is the mean p50 / mean p95, with the worst round's p95 in brackets.
- Profiles: desktop 1440 × 900 at DPR 2; phone-like 360 × 780 at DPR 3, CPU throttled 4×.
- Variants: "off" is the cycle off; "day" a running summer day at ×1; "night" a held autumn night with its lights; "×10" the fast cycle, with the most map redraws.

| Variant | Desktop, 240 | Desktop, 60 | Phone-like, 240 | Phone-like, 60 |
|---|---|---|---|---|
| off | 6.11 / 8.96 (9.12) | 5.13 / 7.26 (7.29) | 4.75 / 6.93 (7.60) | 2.26 / 3.13 (3.17) |
| day | 7.63 / 10.34 (10.66) | 5.65 / 8.00 (8.03) | 5.23 / 7.79 (8.28) | 2.77 / 4.39 (4.72) |
| night | 7.49 / 9.85 (10.13) | 5.22 / 7.40 (7.80) | 4.97 / 7.08 (7.38) | 2.64 / 3.94 (4.08) |
| ×10 | 7.63 / 10.38 (10.42) | 5.60 / 8.09 (8.09) | 5.13 / 8.13 (8.24) | 3.06 / 5.21 (5.40) |

Every row is under the rules (12 ms desktop, 16.6 ms phone-like); the worst is 10.66. The cycle costs up to 1.4 ms of mean p95 (desktop, 240: the second shadow lookup and the backdrop). The bench ran at `1e52aafa`; the later commits changed only the keyframes' moon strengths and the floor's default (uniform values: the same shaders and passes).

*Zero flicker.*
- Method: SLOTS' method on "Renderer/DayNight" with a tile in hand (its slots; the placed tile's aura still, under reduced motion). Top view at 240; the page's pixel ratio is the renderer's.
- Moments: each phase held, and four points inside the transitions (dawn→day, day→dusk, dusk→night, night→next dawn).
- Measures:
  - still frames;
  - 12 pans of 3 device px, registered within ±5 px;
  - 16 sub-pixel pans of 0.25 px;
  - the zoom 240 → 230 in steps of 0.5;
  - a **sweep** of the cycle with the camera still: 24 steps of ×1's (33 ms) or ×10's step. It gives the crop's mean-luma step and the **back-and-forth**: per pixel, its total variation less its net change, which is 0 under a smoothly moving edge and grows with a swim or a shimmer. It also gives the 99.9th percentile of the per-pixel change between two frames.
- High's bloom is the positive control.

| Tier, profile | Still | Pan residual | Sub-pixel step | Zoom step | Sweep ×1, back-and-forth (worst moment) | Sweep ×1, per-frame change, p99.9 |
|---|---|---|---|---|---|---|
| Medium, desktop | 0 | 0.70 to 1.58 | 0.038 to 0.079 | 0.112 to 0.131 | 0.77 (noon) | ≤ 1.4 levels |
| Medium, phone-like | 0 | 0.69 to 1.54 | 0.020 to 0.025 | 0.072 to 0.089 | 0.76 (noon) | ≤ 1.4 |
| Low, desktop | 0 | 0.26 to 0.57 | 0.031 to 0.066 | 0.107 to 0.134 | 0.98 (noon) | ≤ 2.1 |
| Low, phone-like | 0 | 0.27 to 0.57 | 0.024 to 0.033 | 0.072 to 0.087 | 0.93 (noon) | ≤ 2.1 |
| High (control), desktop, first build's bloom blend | 0 | 2.35 to 3.65 | 0.31 to 0.64 | 0.99 to 1.89 | 0.67 | ≤ 1.1 |
| High (control), phone-like, first build's bloom blend | 0 | 2.32 to 3.60 | 0.53 to 1.21 | 0.73 to 1.65 | 0.69 | ≤ 1.1 |

- **Still and moving camera.** Still frames are pixel-identical at every moment, and every pan registers at its own 3 px.
- **The floor of each measure.**
  - Pan residuals are the AO's floor at Medium, as in 5.7; they move with the moment's brightness.
  - The default tiers' sub-pixel and zoom steps are SLOTS2's (0.02 to 0.08 and 0.07 to 0.13), at every phase and in the transitions. High's bloom was caught there 6 to 60 times higher; that margin was inflated by the first build's bloom blend (fix loop 1 below: 1.2 to 5.7 times with three's blend).
- **The ×1 sweep.** No pixel moves more than 2.1 levels between two frames. The back-and-forth stays under 1 level over 24 frames: the crossfade's piecewise-linear path.
- **Before the crossfade**, the noon sweep was 15.6 (Medium) and 18.9 (Low), with a 512-texel map 10.7.
- **At ×10** (the story's fast forward, 0.8° of arc a frame) the noon back-and-forth is 10.3. These are real shadows crossing a step every 1.3 frames, not a game speed.
- **What does not shimmer.** The night lights (a fixed set of lit windows at a held level) show no step: the night moment's sweep is 0.000 at ×1. The backdrop's dither is fixed to the screen and identical between frames (still 0).

*The night's floor.* The board's mean luma (centre crop, desktop) at day and night:

| Season | Day | Night | Night / day |
|---|---|---|---|
| Summer | 117.8 | 39.7 | 0.34 |
| Autumn | 106.6 | 30.3 | 0.28 |
| Winter | 99.2 | 43.7 | 0.44 |
| Spring | 133.6 | 36.3 | 0.27 |

At a floor of 0.6 the autumn night was 22.2 (0.21), with the forests near black; 0.85 and a stronger moon keep them readable. The slots, the neon, the placed tile's aura and the outlines stay legible at every phase (`daynight-slots-autumn-<phase>-1280.webp`, `daynight-placed-summer-<day|night>-1280.webp`).

**Captures** (`packages/app/src/stories/renderer/captures/`; headless Chrome on the GPU; outlines on; quality and cap auto):
- `daynight-<season>-<phase>-<1280|360>.webp`: the 16 season × phase moments at 1280 × 800, DPR 2, and 360 × 780, DPR 3, saved at their CSS size.
- `daynight-strip-x10.webp`: one cycle at ×10, 16 frames 0.75 s apart: a summer day, dusk, night, then autumn's dawn and day.
- `daynight-forest-skin-night-1280.webp`: the Forest skins at night.

**Fix loop 1 (review t-0517).**

Measured on the GPU as above, at this branch's head, loads 1.7 to 4.3.

1. **No twin in a still scene.**
   - On the GPU, a moving cycle has 2 shadow-casting lights, and the tile program is compiled with 2 shadow maps (`directionalShadowMap[2]`). The still scene and the cycle off have 1 and 1.
   - Tests in `game-scene-daynight.test.ts` and `daynight.test.ts`: a still scene and Low have no twin; going from moving to still, turning the cycle off, and `dispose({ releaseContext: false })` each release the twin and dispose its shadow.
2. **The bloom's stock blend, cycle off.**
   - "Renderer/Placement", Slots, at 1280 × 800, DPR 1.75, outlines on, reduced motion, a fixed view. Main's static Storybook (`7ccaefc5`, built from `git archive`) and this branch's, each at High, Medium and Low: **pixel-identical** (PSNR infinite on every channel).
   - The comparison sees a change: main's High against main's Medium is 17.0 dB.
3. **The twin's map is freed on `dispose`** (above).

*Frame time, the still scene* (method as above, two rounds; mean p50 / mean p95, worst round in brackets):

| Variant | Desktop, 240 | Desktop, 60 | Phone-like, 240 | Phone-like, 60 |
|---|---|---|---|---|
| off | 6.48 / 9.04 (9.63) | 5.16 / 6.69 (6.73) | 5.96 / 7.38 (8.58) | 2.47 / 3.14 (3.18) |
| still | 6.51 / 9.13 (9.23) | 6.08 / 7.66 (8.41) | 5.70 / 6.42 (6.81) | 2.39 / 3.23 (3.73) |
| day (moving) | 7.12 / 10.52 (11.28) | 6.07 / 8.11 (8.13) | 5.96 / 7.69 (8.31) | 3.10 / 4.39 (4.96) |

The still scene costs what the cycle off costs, within the runs' noise (one shadow map, no clock). The moving day stays under 12 ms (worst 11.28).

*Zero flicker, the still scene and High.*
- **The still scene** (Medium, Low and High; desktop and phone-like):
  - still frames pixel-identical;
  - pans registered at their own 3 px;
  - residuals 1.58 / 0.57 / 1.72 desktop and 1.54 / 0.57 / 1.68 phone-like;
  - sub-pixel steps 0.038 / 0.031 / 0.074 and 0.023 / 0.024 / 0.062;
  - zoom steps 0.129 / 0.129 / 0.257 and 0.083 / 0.084 / 0.102.
  It has nothing to sweep: it does not move.
- **The moving cycle at High**, every moment:
  - still 0;
  - ×1 sweep back-and-forth 0.76 at noon and at most 0.34 elsewhere, p99.9 ≤ 1.4 levels;
  - Medium's re-run at noon gives the same figures as before (0.765).
- **High as a control is weaker than first reported.** The first campaign's High figures (sub-pixel 0.31 to 1.21, zoom 0.73 to 1.89) were inflated: the first build composited the bloom without its alpha factor, so its glow was stronger for every High user (the review's point 2). With three's blend, High's steps over the cycle are 0.06 to 0.14 sub-pixel and 0.10 to 0.44 zoom. That is 1.7 to 3.3 times Medium's on the desktop and 1.2 to 5.7 times on the phone-like profile: still caught, by a smaller margin.
- The first campaign's Medium and Low rows stand: the moving path is unchanged.

**Where this differs from the brief, or decides a gap** (the thread's, reversible):
- *Forest skins.* FEATURE-HL already labels the Forest variants with their own palette table (`FOREST_PALETTE_CLASSES`), so a Forest tile gets night lights like a base tile. The brief expected none until a Later item; nothing waits for that item.
- *A twin light* for the crossfade (a second shadow-casting light while the cycle is on). The brief named "a texel-snapped shadow camera, stable cascades or a fixed frustum". The frustum is fixed, but the boil came from re-rasterising a turned light, which none of those removes.
- *The night's look.* About half of the windows are lit at full night, roofs at 0.35, a floor of 0.85: chosen on the captures. Each is a setting or a constant.
- *The ghost* (the tile in hand) holds the night lights off, as it holds the highlight.
- *The renderer's default* is off: only the app's board turns the cycle on from its row, so the hand's tile, the other stories and the bench keep the look.
- *Reverse* by turning the row off (or `dayNight.enabled`). The crossfade goes back to one light by `SHADOW_STEP` → 0 and dropping the twin.



### 5.10 The camera's tilt (TILT-54, owner 2026-10-19; locked by CAMERA-TILT-LOCK, #719)

**Locked (CAMERA-TILT-LOCK, #719).** The tilt is now locked at its default, 27 degrees (`PLAY_DEFAULT_POLAR_ANGLE`): the
player only pans and zooms, no gesture tilts or turns the camera. In play mode `minPolarAngle = maxPolarAngle =
PLAY_DEFAULT_POLAR_ANGLE` and `enableRotate = false`; the azimuth stays locked at 0. Desktop: the left and the right
button pan, the wheel and the middle button zoom. Touch: one finger pans; two fingers pinch to zoom and their midpoint
pans (`touches.TWO = DOLLY_PAN`); a second finger down still makes the gesture a pinch, never a placement (#570's rule).
The native controller has no tilt (`applyTilt` and the mapper's `tilt` event are gone); its pinch and pan are unchanged.
`PLAY_MAX_POLAR_ANGLE` and `PLAY_ROTATE_SPEED` left `@paved/renderer`; the stories keep their captures' tilts (straight
down to 54 degrees, `STORY_MAX_POLAR`) through `placeCamera` (`packages/app/src/stories/renderer/story-camera.ts`), which
opens the controls' polar range for the story, since the lock would pull any other pose back to 27 degrees. Unchanged: the opening frame for the screen size (#678), `reset()` and the
re-centre, the `showcase` mode (free orbit, the right button and one finger rotate). `CLOSEST_DISTANCE` stays at 10 (the
issue's default), with `OUTLINE_CLOSEST_FACTOR` and the settings' `minDistance`: at 27 degrees the near plane needs 8.
The rest of this section is TILT-54's record; where it speaks of tilting, #719 supersedes it.

The board opened straight down and the player could tilt it 27 degrees at most, with the mouse's right button only. The
owner's decisions: the board **opens at 27 degrees** (`PLAY_DEFAULT_POLAR_ANGLE`, 0.15 PI, the former maximum), the
maximum is **doubled to 54 degrees** (`PLAY_MAX_POLAR_ANGLE`, 0.30 PI), and the range stays 0 (straight down) to the
maximum, both ways from the default (`core/CameraController.ts`).

- **The opening.** The camera opens at the opening distance (240) from its target, tilted 27 degrees towards +z (the
  azimuth stays locked at 0), looking at its target (`tiltedOffset`). OrbitControls saves that position, so `reset()`
  comes back to it, and `focusBounds` keeps the tilted offset when it frames the board: the board's centre stays at the
  centre of the screen. The target's clamp to the board (`update()`) is on the target, so it holds at any tilt. The
  opening tile size S is measured at the target's distance, so the outline fade (OUT-FADE2) is unchanged by the tilt.
- **The closest zoom** is re-derived for 54 degrees: 5 + 2.625 / cos 54 degrees = 9.47, so `CLOSEST_DISTANCE` is **10**
  (8 before). It moves `OUTLINE_CLOSEST_FACTOR` from 30 S to 24 S (the "max zoom-in" start of the Outlines story; the
  default start, 1.5 S, does not move), the default `minDistance` of the settings, and the face antialiasing's test of the
  near plane on the tallest tile (`face-antialiasing.test.ts`, every model's height read).
- **The gesture on touch.** In play mode two fingers now pinch to zoom and, dragged up or down together, tilt
  (`touches.TWO = DOLLY_ROTATE`; the azimuth is locked, so the rotation is only a tilt and a sideways drag does nothing).
  One finger still pans; desktop keeps the right button. The two-finger pan is gone: one finger pans. The rotate speed
  doubles with the range (`PLAY_ROTATE_SPEED` 0.2, 0.1 before), so a drag over the surface's full height tilts 72
  degrees, three quarters of it for the whole range, as before (27 of 36 degrees). Checked in headless
  Chromium on the Mac's GPU at 375 x 812 with touch: two fingers dragged up 500 px reach 54 degrees, then down 700 px
  reach 0, the distance unchanged; the right button does the same at 1440 x 900.
- **The tap stays a tap.** A second finger down before the first comes up makes the gesture a pinch or a tilt: it places
  nothing, whatever the fingers' travel (before, two fingers lifted in place could pass the 5 px rule). A `pointercancel`
  forgets the tap. `SurfaceInputEvent` carries the `pointerId` for it (`surface-adapter.test.ts`). The bubble of #544
  follows the camera through `onCameraChange`, which the tilt fires like a pan or a zoom.
- **Beyond the board.** With the camera's `zoom` of 5 the vertical field of view is about 10 degrees, so at 54 degrees
  the steepest ray is about 59 degrees from straight down: the horizon never shows. What the board leaves uncovered is the
  backdrop (the day and night gradient of 5.9, or the background colour), as at 27 degrees; the fog is distance fog,
  and at 240 the board's far edge is only a few units farther than its centre. The shadow map is the light's fixed
  frustum (100 units around the board's origin, 2048 texels), independent of the camera: the same coverage and texel size
  at any tilt; zoomed in at 54 degrees a texel is seen more obliquely on the tops, an estimate, not measured.
- **The native controller** (`NativeCameraController`, `native-input-mapper.ts`) had the same default and range: it
  opened at 27 degrees, `applyTilt(dy, height)` tilted as OrbitControls does, and the mapper emitted a `tilt` event when
  two fingers moved up or down together, beside the pinch (both removed by #719). Its default `minDistance` is the web's closest zoom (10; 5 before).
- **Captures** (the "Renderer/Lighting" story, the 72-tile board, headless Chromium on the Mac's GPU, not SwiftShader;
  the tilt reached by the gesture itself, in `packages/app/src/stories/renderer/captures/`): `tilt54-phone-0.webp`,
  `tilt54-phone-27.webp` (as it opens), `tilt54-phone-54.webp` at 375 x 812 (DPR 3, stored at 1x);
  `tilt54-desk-0.webp`, `tilt54-desk-27.webp`, `tilt54-desk-54.webp` at 1440 x 900 (DPR 2, stored at 1x);
  `tilt54-phone-54-closest.webp`, the closest zoom (10) at 54 degrees, no cut; `tilt54-phone-54-day.webp` and
  `tilt54-phone-54-night.webp`, the "Renderer/DayNight" story's sky at 54 degrees (summer day, autumn night).
- **Frame time (measured, TILT-54, on the Mac's GPU, not SwiftShader).** Headless Chromium (new headless mode, never on
  screen), the "Renderer/Lighting" story on the recorded 72-tile board at distance 240, the slots and ghost off, outlines
  forced on, `redraw` on. Each configuration ran in a fresh context with 120 warm-up frames and 600 measured frames. Per
  frame, the CPU time of the loop tick (`setFrameObserver`) plus the GPU time of an `EXT_disjoint_timer_query_webgl2` query
  around the render (600 of 600 frames timed, no disjoint). Two rounds, the order of the angles alternated; the load
  average was about 4 to 6. Desktop: 1440 x 900 at DPR 2, unthrottled. Phone: 360 x 780 at DPR 3, CPU throttled 4x (the
  bench's phone approximation, still on the Mac's GPU). "auto" resolved to Medium on both profiles. CPU + GPU p95 in ms, round 1 / round 2:

  | Profile | Tier | 27 degrees | 54 degrees |
  |---|---|---|---|
  | Desktop | Medium (auto) | 5.64 / 5.78 | 5.32 / 5.56 |
  | Desktop | Low | 5.67 / 5.75 | 5.59 / 5.47 |
  | Phone | Medium (auto) | 5.31 / 5.18 | 5.11 / 5.40 |
  | Phone | Low | 5.38 / 5.09 | 5.16 / 4.88 |

  54 degrees costs no more than 27: every pair is within the spread between rounds (at most 0.3 ms), and all are far
  under the 12 ms desktop and 16.6 ms phone limits. The GPU p95 alone is 3.2 to 4.2 ms and the CPU p95 1.9 to 2.7 ms.
  The draw calls and triangles were not recorded: `renderer.info` read after the frame counts only the composer's last pass.

### 5.11 Closed structures: the pulse and the shine (CLOSE-SHINE, #722)

The owner's request (2026-10-24): when a move closes a structure, the board highlights it in two steps. A brief bright-yellow
**pulse** as its line appears in the closing feed, then a **shine**: a band of light that sweeps across it at regular, spaced
intervals, like a reflection. The look is animate-ui's Shine (a band slanted at -15 degrees, 1.2 s a sweep,
`cubic-bezier(0.4, 0, 0.2, 1)`, 0.3 opacity, then a pause), reimplemented in the renderer: nothing is imported or fetched.
Decided by the owner: a closed structure keeps its shine for the rest of the game, each structure on its own clock. Open
points, taken as proposed: one sweep per structure (not one band over the whole board); the tuning proposed in the story.

- **The data (`@paved/game-core`).** Each structure a move closes comes with its areas: `MoveResult.closed`, beside
  `scored` (one per `Scored` event, same order; the events stay the contract's), and `ClosedStructure.areas` in
  `closings()`. The areas are the root's nodes in the union-find (`Board.areasOf`): a mask per tile, bit `area - 1`, as
  `StructureBoard` gives them. A wonder covers its tile and the 8 around it, whole (`ALL_AREAS`), as D-19 counts them. A
  board written as it is (the Challenge's `boardOf`, a VRF game or an engine not in step) has no moves to score:
  `EngineGame.closedOnBoard()` reads its closed structures off it (a road, city or wonder with no open half-edge; a forest
  also once no road along it is open; so a forest closed while a road was open, never scored on chain, shows closed once that
  road closes). Given the move's tile (`closedOnBoard(closer)`), the structures that move closed come last, in the order it
  scored them (`assess`: the tile's start spots, then the wonders around it), which is the order of its `Scored` events and
  of the feed's lines, so their pulses match the lines. `PageState.closed` carries them in Training (`LocalSession`),
  Challenge (`PredictedSession`: the prediction's closings, or the written board's, its ids moved back to the chain's, the
  starter, the engine's own tile 1, kept as it is) and Story (`StoryRun`), through `closedOf`.
- **The board (`packages/app`).** `BoardViewport.closed` (the three game pages pass their state's) becomes
  `GameCanvas.closedStructures` (`toClosedStructures`: each one's id is its areas, so its clock survives a new state or a
  resync), then `GameScene.setClosedStructures`. Out of scope, as the issue says: the read-only boards (replays, PvP attack
  replays) and the over page.
- **The layer (`core/closed-structures.ts`, `ClosedStructuresLayer`, owned by `TileRenderer`).** A structure seen for the
  first time pulses, staggered by `pulse.staggerMs` (150, the feed's 0.15 s a line) by its order among the move's new ones;
  its shine starts at its pulse's end. The first call's structures (a board loaded mid-game: a reload, a resumed Challenge)
  shine at once with no pulse, each at its own phase (its id's hash, a point in its first interval). A structure no longer
  listed is dropped (a rollback, a new game). The tile shader reads three float textures: `uClosedMap`, one RG texel per area
  of each cell, where its run of structures starts in `uClosedList` and how many it holds; `uClosedList`, the runs, one
  structure index (from 1) a texel, `CLOSED_LIST_WIDTH` (256) a row. A run has no length limit: a wonder's whole tiles hold a
  road's or a city's area too, and the rings of wonders near each other overlap (up to 10 holders on one area in a game: its
  own structure and the 9 wonders whose rings reach its tile). Every holder keeps its own pulse and sweep there, the brightest
  winning, and none is ever left out. Then `uClosedData`, two texels per structure (its pulse start, shine start, interval in seconds on
  `uClosedTime`'s clock, whether it pulses; its extent across the sweep). The fragment's area is FEATURE-HL's label
  (`LABEL_GLSL`, shared with `FEATURE_HIGHLIGHT_GLSL`), so the models are labelled once a structure is closed, as for a
  highlight. Its own switch (`uClosedOn`): the rest of the board is **not** dimmed. The maps are built again only when the
  structures, their cells or the settings change.
- **The pulse.** The voxels go to `pulse.color` (FEATURE-HL's `#ffc23d`) at `pulse.strength` (0.6, the confirm's), with
  `pulse.glow` (0.35) of emissive light, over `pulse.ms` (700, the confirm's): a quick rise over the first 15 % (`PULSE_RISE`),
  then a smoothstep fade (`pulseLevel`). It adds to the confirm's green: the confirm's overlay (a ghost of the same patched
  material) keeps the layer and tints over it, so both show; the tile in hand's ghost holds the layer off (`uClosedOn` 0).
- **The shine.** A soft band (`1 - smoothstep` across `shine.width`, 3 world units, a tile) of `shine.color` at
  `shine.strength` (0.3), added as emissive light on top of the voxels' colour, never a flat fill. It is slanted on a
  direction of the board seen from the fixed camera (#719, 27 degrees, azimuth 0: `sweepAxis`): a point's place across the
  sweep is `right + tan(angle) * up` of the screen, the voxel's height included, so the band leans `shine.angle` (-15
  degrees, its top to the right) on screen. Its centre crosses the structure's extent (its tiles' boxes, from just before to
  just after) in `shine.durationMs` (1200) on the reference's ease (`sweepEase`, Newton on the Bézier's x, the same in GLSL),
  then waits: one sweep every `shine.intervalMinMs` to `shine.intervalMaxMs` (6 to 8 s), each structure its own interval.
  The board's frame, not the world's: a turned compass turns the band with the board.
- **Frames.** `TileRenderer.update` reports `animating` while a pulse or a sweep runs, and once more on the frame after the
  last one ends (no tint left behind). Between sweeps the board is still, as before: a long Training game does not keep the
  GPU busy. The clock costs a loop over the closed structures per tick, no draw.
- **Reduced motion and power.** Under reduced motion (`placement.motion.reducedMotion`, the confirm's rule) the pulse is a
  short tint (`pulse.reducedMs`, 150) and there is no shine. The Low tier and software WebGL draw no shine (the ambient
  effects' rule, #572); the pulse stays. `RendererSettings.closing` (`closing-settings.ts`) holds every knob, `enabled`
  turning both off.
- **Stories** ("Renderer/Closing", `closing.stories.tsx`): Stagger (engine moves; Play closes a road, a forest, a city and a
  road at once, with the closing feed), Many structures (37 moves, 17 closed, no pulse, each on its phase), Reduced motion;
  every setting a control, and a readout of the closed, pulsing and sweeping structures.
- **Tests.** `closed-areas.test.ts` (game-core: one tile closing two roads, a wonder, a written board),
  `closed-structures.test.ts` (renderer: the settings, the curves, the layer's masks and clocks, a road under a wonder on its
  own clock, every holder of an area kept (12 on one, a list over several rows), the frames asked for, reduced motion and low power), `features.test.ts` (the shader's term through the labels,
  no dimming, the hand's ghost), and `predicted-session.test.ts` (chain: a VRF game's closed structures off the chain's
  board, the starter's areas, each move's own in its `Scored` order).
- **Not measured.** The shader adds a texel read, then three per structure of the area (at most 10 in a game), and a short loop per fragment of a closed structure's voxels, and only
  while one is closed; no bench figure was taken (no GPU run from this task): an estimate, not a measure.

---

## 6. The page map

### 6.1 Routes

| Page (spec A) | Route | Bottom nav | Notes |
|---|---|---|---|
| welcome | `/welcome` | hidden | first visit only (a `localStorage` flag); the connect button; skip to Training |
| loading | (no route) | hidden | the app's boot screen and every route's `Suspense` fallback; the scene's asset loading inside the board |
| home | `/` | Home | Play button, the Challenge card (no podium since D-29), Training and Tutorial, the active game to resume |
| play | `/play` | hidden (back); the nav's Play opens it | Challenge, Training, Tutorial (P-57 B4), Multiplayer disabled ("coming soon") |
| purchase | `/play/challenge` | hidden (back) | stake picker 1–10, price, boost, the 24 h validity, the minimum score to beat, confirm; then spawn |
| cobbles | `/cobbles` | hidden (back) | the Cobble balance, the packs, pick one and pay its USDC (#621; `/play/challenge?tab=cobbles` redirects here) |
| board | `/game/:gameId` (Challenge), `/training`, `/tutorial` | hidden | the board, the tile in hand, rotate / place / discard, give up |
| over | `/game/:gameId/over`, `/training/over` | hidden | final score, the game's metrics, the reward or "below the threshold", settle when the day allows, Play again |
| quests | `/quests/:day?` | Quests | the day's quests |
| achievements | `/achievements` | (from Quests, a tab) | split out of today's quests screen |
| vault | `/vault` | Vault | stake, unstake, dividends |
| referral | `/referral` | (from Settings and Home) | the referral link and what it earned |
| theme | `/settings/theme` | (from Settings) | Default (meadows), Forest, then Snow, Desert, Volcano "coming soon" |
| settings | `/settings` | Settings | graphics quality, sound, music, tile preview, placement highlight (the mockups), account, links to theme and referral |

Old links keep working: `/game?mode=challenge&id=N` → `/game/N`, `/game?mode=training` → `/training`,
`/economy` → `/vault`; since D-29, `/leaderboard`, `/leaderboard/:day` and `/player/:id` → `/`.

**The five destinations (D-29, the owner, 2026-10-20, #623):** Home · Missions · Play · Vault · Settings, on mobile and
on desktop. Play, in the centre, has no label and is the accent: it opens Choose a mode (`/play`), a full-screen flow, so it
is never the current item. The ranks are out of the UI (the Ranks and player pages, Home's podium, the score screen's rank),
to come back later, probably as leagues; the indexer's leaderboard endpoint and the `@paved/chain` reads stay for them.
Before D-29 the tabs were Home · Ranks · Quests · Vault · Settings ("decided for the owner"); the mockups' were Home,
Collection, Themes, Settings; Collection is out of v1 (P-57 B5) and Theme is a row of Settings.

### 6.2 Navigation

- **Direction D (#537, applied 2026-10-19; replaces the bar with a sliding indicator and the left rail, which read as
  Cartridge's):** `containers/app-nav.tsx`.
- **Mobile and tablet:** a bottom bar of five items, fixed to the viewport's bottom (outside the page's scrolling region,
  `TabFrame`, #611; a pull past the top never moves it), each an icon, safe-area padded. Play, the centre item (D-29), is a
  larger gold disc raised above the bar, icon only (`aria-label="Play"`). The current item is gold (`text-primary`) on the
  white 15% layer; hover 10%, pressed 20% (`state-layer`, section 2.2b). TAB-SWIPE (#726, owner decisions of 2026-10-24):
  only the current item shows its label under its icon (from `mobile`; icons only below), and the label folds and unfolds
  (`grid-template-rows` 0fr to 1fr, and opacity) at a fixed item height (44 px, 52 px from `mobile`); the 15% layer is one
  highlight per bar that slides to the current column (none for Play). A pick of another tab's page slides the pages
  sideways, the next tab's page coming in from the right, the previous one's from the left: a view transition of the page's
  region only (`routes/tab-swipe.ts`, the TAB-SWIPE block of `styles/theme.css`), the bar staying still while its highlight
  and labels move in the same duration and easing (each page mounts its own bar, which starts from the last one's state,
  `@starting-style`). No swipe for Play, within one tab, under reduced motion, or without `document.startViewTransition`;
  none from `desktop`. Hidden on full-screen flows (welcome, play, purchase,
  board, over), which get a top bar with Back, the title centred and a hairline under it. The balances (#620) sit in the
  page header (the Cobbles and USDC plates; USDC opens a sheet with every balance) and, on a flow, in a strip under the top
  bar; on every screen but the board.
- **Desktop:** four items, icon beside label, Home, Missions, Vault, Settings (no Play: the owner's review #668; Play is
  reached from the Home page), in a header fixed across the top: the
  voxel wordmark on the left, the items, then the balances (#538, #620: a resource bar, each currency on a plate, vPAVED when
  held) in a row at the header's end; a flow's top bar shows them on its right. No rail: every page is one column (`flex-col`) at every
  width. Dialogs instead of sheets.
- **Header height (#676, owner decision of 2026-10-21):** one header height per breakpoint on every page outside the board,
  the `--header-h` token of `styles/theme.css` (96 px below `desktop`: the title row, 56 px, over the balances' row; 64 px
  from it: one row) and its `page-header` utility: a flow's top bar, a tab page's title row, Home's top row, the
  navigation's header from `desktop` (a tab page's title row is then the first row of its content, on the same token, 16 px
  under the header as a flow's content is), and the space above Welcome's content. Every page has one header at its top; no page sets
  its own height; a title that does not fit is cut with an ellipsis, its whole text in `title`. `scripts/header-sweep.ts`
  measures every page (the `Pages/Headers` stories) at 375 and 1440 px: the height of every page header (the one at the top
  and a tab page's title row below it) and where the content starts.
- Every page is a route: deep links, the browser's back button, and the referral `?ref=` kept across
  links (nums' `lib/router.tsx` idea).
- **No pages in pages; Back never cycles (BACK-RULE #783, owner decisions of 2026-10-26).** No page opens another page of
  the same kind: what a page shows beyond itself it shows in place. Settings' pages (the themes, a theme, My tiles, the
  credits, the referral) are sheets over Settings (`PageDef.sheet`, `routes/page-sheets.tsx`; from the bottom on a phone,
  from the right from `desktop`, over the side panel), their URLs kept so a link opens them over Settings; a move from one
  to another replaces its entry. Story's campaigns are a sheet over Play's modes (`/story`). The Cobble packs open in place,
  in a sheet over the page that asks for them (`routes/cobbles-sheet.tsx`: a theme's or the tile shop's Get Cobbles, the
  avatar's, the header's Cobbles off the village), with no entry pushed. The lifetime missions are a tab of Missions (the switch replaces the entry); the defence
  log is a section of the League (`/pvp/defence` redirects there). The full-screen flows (a game, an attack, a result, a
  replay) are not pages in this sense; a flow opened from a page (Training from Play, a visit from the League) goes back
  to it, the entry just before it, never to a flow's or a game's. One Back rule (`useUpTo` in `routes/ref.ts`): Back goes up to the page's parent
  (`PageDef.parent`, the village without one; only a sheet or a flow names one, so two steps at most), back through the
  history to the nearest earlier entry of that parent when the session knows one (`routes/history.tsx`; a reload starts
  again from its own entry), else in place of the current entry; never a push, so a parent's Back never finds its
  child again. The browser's own back button still walks the history.

### 6.3 What maps to what

| Today (`packages/app-web/src`) | v2 page |
|---|---|
| `pages/Landing.tsx` (mode cards, Daily top 3, Training card, economy panels) | home, play |
| `components/EconomyPurchase.tsx` (stake picker, consent, referrer) | purchase |
| `pages/Game.tsx` `ChainGamePage` (start / spawn flow) | purchase → board |
| `pages/Game.tsx` `GameBoardView`, `TrainingBoard`; `@paved/ui` overlays `IngameStatus`, `ActionBar`, `TilePreview` | board |
| `@paved/ui` `GameCompleteDialog`; `components/EconomySettle.tsx` | over |
| `pages/Tutorial.tsx`, `tutorial/TutorialClaim.tsx` | board (tutorial), over (the claim) |
| `pages/Leaderboard.tsx`, `pages/Player.tsx`, `components/DayPicker.tsx`, `IndexerLag.tsx` | leaderboard |
| `pages/Quests.tsx`, `components/Progress.tsx` | quests, achievements |
| `components/EconomyVault.tsx` | vault |
| `components/EconomyReferral.tsx` | referral |
| `components/ConnectionBanner.tsx`; the D-15 notice is on the Credits page (`/settings/credits`, #536) | welcome, settings (account), credits |
| `@paved/ui` `GameLoadingScreen` | loading |
| (none) | theme, settings |

**The controller's session (P-65, PM ruling 2026-10-16; supersedes P-56).** No token approve is a session policy, on any
token (USDC or PAVED). The reason, as the PM gave it: "an approve policy is executed once at connect, leaving a standing
allowance of the cap; the session key is a wildcard filtered client-side by (target, method). No token approve in a session;
one prompt per paid entry." P-56 had kept one approve in the session, the entry's, to Challenge up to 10 stakes; VALUE-FIX
(#484) found that the controller does not enforce its spender or amount on a later call. So the session is a wildcard key,
limited on chain by no target or selector, that the keychain's client-side store filters by (target, method) alone, never by
calldata. Its policies (`CONTROLLER_ENTRY_POINTS`, `controllerPolicies`) are only what spends no token: Challenge
`spawn_free`, `build`, `discard`, `surrender`; Setup's claims, `buy_skin`, `set_skins` (where the deployment has a Setup);
Faucet `mint` (Sepolia only); Economy `settle` (with an economy). No call that pulls a token is a policy either: not the paid
`spawn`, not `buy_pack`, not the Vault's `deposit` (fix loop 1 of the re-check). Each is sent with its approve, which prompts
anyway, and in the session a bare one could spend a standing allowance that a connect from before P-65 left (the full cap to
Challenge). `toControllerSessionPolicies` refuses any token method (`isTokenMethod`, VALUE-POLISH): a name with a word (cut
at `_` and at a capital) that starts with `approv`, `allowance`, `transfer`, `deposit`, `pay` or `mint` (`increase_allowance`,
`transfer_from`, `set_approval_for_all`, `safe_mint`...), and the paid `spawn` and `buy_pack` by name; the faucet's `mint`
passes only as `controllerPolicies` builds it. Sessions created before P-65 keep their policies until they expire (release
note in `docs/client/f-release.md`). A paid entry sends `approve(Challenge, price)` and `spawn(stake, referrer,
min_out)` in one multicall, which the wallet prompts for once; a pack's approve and `buy_pack`, and the Vault's approve and
`deposit`, are one multicall each the same way. A capped approve in
the session may come back only by a new ruling (P-65 is reversed only by a verified enforcement of spender and amount).

Sources, read at the pinned versions: `@cartridge/controller` 0.13.16, whose keychain runs `@cartridge/controller-wasm`
0.10.1, built from `cartridge-gg/controller-rs` v0.10.1 (`4ec2e4fc`):

- the approve policies are executed once at connect, with their exact spender and amount: `createSession`,
  [`account-wasm/src/account.rs:423-470`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/account.rs#L423-L470) (split at :427, the approve
  call built at :437-449, executed at :464, or through the paymaster at :470);
- the session registered is a wildcard: [`account-wasm/src/account.rs:502-505`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/account.rs#L502-L505)
  (`create_wildcard_session`), [`account_sdk/src/account/session/hash.rs:92`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account_sdk/src/account/session/hash.rs#L92)
  (`allowed_policies_root: "wildcard-policy"`) and [`:124-127`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account_sdk/src/account/session/hash.rs#L124-L127)
  (a wildcard session is authorised for every policy);
- a session call is authorised client-side by (target, method) only: [`account-wasm/src/types/policy.rs:139-143`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/types/policy.rs#L139-L143)
  (`from_call` keeps the target and the selector, no calldata), [`account-wasm/src/storage.rs:197-202`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/storage.rs#L197-L202)
  (target and method must match), checked in `hasAuthorizedPoliciesForCalls`, [`account-wasm/src/account.rs:1150`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/account.rs#L1150);
- a later `approve` is not signed by the session: a call becomes a `Policy::Call`, which never matches a stored
  `Policy::Approval` ([`account-wasm/src/storage.rs:209-216`](https://github.com/cartridge-gg/controller-rs/blob/4ec2e4fc6824807ec053c36bf8ed726db374e153/account-wasm/src/storage.rs#L209-L216), `_ => false`), so it
  prompts. That it prompts is read from this `false`; the keychain's prompt route itself was not read.

### 6.4 What each page needs

| Page | Chain (views, writes) | Indexer | Engine | Local storage |
|---|---|---|---|---|
| welcome | controller connect | — | — | `welcomed` flag |
| loading | — | — | — | — |
| home | `Challenge.spawn_paused`; the player's open games (`GameSpawned` events) | `/v1/players/:id` (the player's status) | — | — (Training is not saved, #718) |
| play | `spawn_paused` | — | — | — |
| purchase | `entry_price`, `Economy.quote`, `quote_swap`, `router`, `rate`, USDC `balance_of`, `Setup.pack`; `Economy.seller` (read at send); writes `approve` + `spawn(stake, referrer, min_out)`, `approve` + `buy_pack(pack_id, referrer, min_out)`, each one multicall and one wallet prompt (neither the approve nor the call that pulls the USDC is a session policy, P-65) | — | — | the referrer from `?ref=`; the hold of a purchase whose outcome is unknown (`paved:purchase-unknown:v1:<kind>:<player>`: its hash, or none for a send the wallet has not answered, written when the send starts, and when it was sent) |
| board | `game(id)`, `tiles(id, from, count)`, the initial seed (section 9); writes `build`, `discard`, `surrender` | — | `EngineGame` (prediction, legality, preview points) | the Training and Tutorial moves |
| over | `game(id)`, `Economy.terms(id)` (reward, `expired`), `day(day)`; write `settle` | `/v1/games/:contract/:id`; "New best" from the player's own games and profile (`/v1/players/:id/games`, `/v1/players/:id`), no leaderboard (D-29) | the final counters (Training) | — |
| quests | `Setup.account`, `day_progress`, `week_progress`; writes `claim_quest`, `claim_daily_credit`, `claim_weekly_credit` (P9) | `definitions` (with `cobbles`, `cobbles_kind`), `playerQuests`, `/v1/head` (the clock) | — | — |
| achievements | `Setup.account`; write `claim_achievement` (P9) | `definitions`, `playerAchievements` | — | — |
| vault | `Vault` (an ERC4626 over PAVED, vPAVED, P-56): `balance_of`, `convert_to_assets`, `max_withdraw`, `max_redeem`, `exit_fee`, `total_assets`, `total_supply` (the rate), `preview_deposit`, `preview_withdraw`, `delegates` (read only); PAVED `balance_of`; writes PAVED `approve` + `deposit(assets, receiver)` (one multicall), `withdraw(assets, receiver, owner)`, `redeem(shares, receiver, owner)` (Withdraw all), none a session policy (P10) | — | — | — |
| referral | `Economy.split_bps()` (the share shown) | `/v1/players/:id/referrals` (IX-COBBLES2): the games' and the packs' referrals, summed by referrer; the id is the player's address | — | the referrer from `?ref=` (kept on every link) |
| theme | `Setup.skin_price` (read again inside `buy_skin`'s send), `skins`, `active_skins`, `account`; writes `buy_skin`, `set_skins` (P11b) | — | — | the chosen theme, which is also the viewer's skins switch (`paved.theme.v1`) |
| settings | controller username, disconnect | — | — | quality, sound, music, preview, highlight (`paved.settings.v1`); the skins switch (`paved.theme.v1`) |

**Accepted (VALUE-FIX, 2026-10-16): a pack's approve can outlive its purchase.** A pack's purchase approves `Setup` on USDC
for exactly the price read at send, then `buy_pack`, in one multicall. If the owner lowers the pack's price between that read
and the execution, `buy_pack` takes the lower price and the rest of the allowance to `Setup` stays standing. Only the player's
own `buy_pack` can spend it (`Setup` moves USDC from the caller alone), so nothing is lost; the client does not reset it. No
change: accepted as is.

**As wired (P6; the podium removed by D-29).** Home reads the player's profile from the indexer client on
`VITE_INDEXER_URL`, and no leaderboard; `/v1/head` is not read. Each home read that has not answered, or failed,
leaves its part empty instead of holding the page: no game to resume, not paused (purchase reads the
pause again); a connected player the indexer has not answered for is shown by address with zero figures. The welcome's
controller connect is the devnet burner on devnet. The shell has no footer since #536 (the D-15 notice moved to the Credits page, `/settings/credits`); Disconnect is Settings' (P11a), see "As built (P11a)". The tutorial's board (`/tutorial`) reads `Setup.tutorial_claimed` and writes
`Setup.claim_tutorial` only at its end, for the claim.

**What Cobbles change (P-61, SC3).** The owner's in-game currency is named **Cobbles** (singular Cobble; the owner,
2026-10-15). The design (`docs/architecture/gems-v1.md`), the contracts and the indexer still say gems until CORE's
rename PR. Cobbles are an account balance in `Setup`, earned by claims and packs and spent on tile skins. SC3 builds
them as scenes on typed mocks, no wiring:
**purchase** gains a Cobbles tab beside the game's stake, with the four packs (50 for $5, 100 for $9, 500 for $40,
1,000 for $70, the $0.20 reference struck through, -50 % to -65 %), confirmed and pending as a game is (approve +
`buy_pack`); **theme** gains a theme's 19 tile skins, each priced by the rarity table (50 to 100 Cobbles) and not owned
(Buy), owned or active, at most one theme per plan, the switches batched and saved in one `set_skins` write;
**quests** show each quest's Cobbles (5, 10, 15; weeklies 15), a Claim per row and Claim all, past days still
claimable, and the free games: every daily of a day, or weekly of a week, done earns one (`claim_daily_credit`,
`claim_weekly_credit`), then a credit counter and Play free; **achievements** show their Cobbles (their points; On the
Podium none in v1) with the same claims; **home** and **play** show the balance and a free game that spends a credit
(`spawn_free`); the **leaderboard**, and Home's top 3, marked a row "Free" when its best game was free (`GameSpawned.price == 0`, PM
ruling), until D-29 removed both. The views and entry points the pages read are `gems-v1.md` 6.1's; their types are in
`components/containers/cobble-types.ts`. Since P9 the ledger's (`CobbleAccount`, the claims of a period, a quest's and an
achievement's Cobbles) are `@paved/chain`'s, named `cobbles` as CORE renamed them; the packs and the skins stay provisional
until P7b and P11b. The element is `Cobbles` (`elements/cobbles.tsx`, the stones of
`TokenIcon`, `elements/token-art.ts`, #620), the mocks `src/mocks/cobbles.ts`. Two props sit beside the hooks' types rather than inside them, so
`src/data/scene-types.ts` holds: the scenes' Cobbles props are optional (the leaderboard's free mark, a list of player ids, left with the
leaderboard, D-29).

### 6.5 What waits for CORE (P-57 B9)

- **The 24 h validity.** Read: today a game is never blocked; only its reward is. `economy.cairo:701`
  `let expired = get_block_timestamp() >= terms.time + DAY;` and `:734` pays 0 when expired; moves stay
  allowed. The spec says "a game is valid 24 h": CORE decides whether moves are refused after 24 h. The
  client shows the deadline from `terms.time + 86400` either way (purchase and over pages, and the board's
  header).
- **Prices and stake bonuses identical to Glitchbomb's.** Read: glitchbomb sells stakes 1 to 10 at
  `stake × 2 USDC` (`contracts/src/components/purchase.cairo`, `BUNDLE_COUNT 10`, `DEFAULT_ENTRY_PRICE
  2_000_000`), burns 70 %, pays 5 % to the referrer, and boosts the burn by `+stake %`; Paved has
  `BASE_PRICE 2_000_000`, `MAX_STAKE 10` (`economy.cairo:36-37`), `burn_bps 7_000`, `REFERRAL_BPS 500`
  and the boost `10_000 + 100 × stake` in basis points (`economy/curve.cairo:89-95`). They agree on these
  five. Not compared: glitchbomb's free social bundle (0 USDC) and its multi-game quantity; its reward
  curve (a step table) against Paved's (`threshold` and `payout`). The parity table is CORE's
  (`docs/architecture/glitchbomb-gap.md` is its start).
- **The vault.** Read: `contracts/src/systems/vault.cairo` is an OpenZeppelin ERC4626 over PAVED whose share is
  vPAVED, with an exit fee kept in the Vault, dead shares against the inflation attack, and votes
  (`docs/architecture/vault-share.md`, P-55, P-56, D-27). The vault page is built on it ("As built (P10)"), behind
  a `VaultViews` interface.
- **The prediction's view** (section 9).

### 6.6 Deploys and open tabs (STALE-CHUNK-RELOAD, #589)

Every page, scene and large module is a lazy chunk with a hashed name under `/assets/` (served `immutable`;
`index.html` is `no-cache`). A deployment replaces them all: the production host serves the latest deployment's files
only, so a tab opened before it asks for names that answer 404 (`over-R2jaf3I2.js` while the host has
`over-Dzic5OIG.js`). The owner's ruling (2026-10-19): no skew protection and no keeping of old chunks; everyone is on the
latest build.

- **Reload once.** `lib/stale-chunk.ts`: a failed dynamic import (Vite's `vite:preloadError`, which every chunk of the
  app and the renderer goes through, and `RouteError` for a route) asks the host for the failed file (`HEAD`,
  `no-store`), or for the build's entry script when the error names none (Safari). A 404 or 410 reloads the tab onto the
  latest build, after a key for that file is set in `sessionStorage`; with the key already set (the file fails again
  after the reload: a real outage), a stale reload of the tab less than 30 s before (the new build's file is missing
  too), or a host that does not answer within 5 s, nothing reloads and `RouteError` shows the error with
  a "Reload" action. A route shows the loading scene while the host is asked (5 s at most).
- **Chunks loaded on demand** (`useDeferred`: the Surrender dialog, the settings and deck sheets, the final board)
  reload the same way. When their file is still gone after that reload, the failure is thrown into the route, whose
  `RouteError` offers the Reload (a new try cannot fetch it); a file the host still serves, or a silent host, keeps
  their own error toast, after which a new try may work.
- **Chunks whose caller keeps the failure** (the renderer's: day and night, the voxel drop, SMAA;
  the idle prefetches) go through Vite's event as well: when the file is still gone after the reload, the listener hands
  it to `StaleChunkGate` (in `RootLayout`), which throws it into the route, so `RouteError` shows it with the Reload.
  `RouteError` then forgets it, so Back home does not throw it again.
- **Nothing to save first.** A Challenge placement is on chain or not, and the reload lands on the same URL. A Training
  game is not saved (#718): the reload starts a new one, as any entry to Training does.
- **`reimport`** (`lib/reimport.ts`, #539) stays for a transient failure (the same file under a new query); a file that
  is gone fails there too and reaches the reload.
- **The web client is not a PWA.** It has no service worker and no precache, and `site.webmanifest` has no `display`
  (the name and the icons stay, for the tab and the bookmarks): a home-screen launch is a browser tab, not a long-lived
  installed app. Mobile will be a native app. A guard test (`__tests__/no-service-worker.test.ts`) keeps out
  `vite-plugin-pwa`, workbox and any worker file. The previous client (`app/`) registered a `vite-plugin-pwa` service
  worker (`registerType: autoUpdate`) on this origin; at startup, once per browser, `lib/legacy-sw.ts` unregisters every
  service worker of the origin and deletes every Cache Storage entry (logged once). It stays for several releases.
  `app/` still carries `vite-plugin-pwa` and its `generate-pwa-assets` script; removing them is the owner's decision.

---

## 7. A new app beside app-web, or in place

**Proposed: a new package, `packages/app`, beside `packages/app-web`.**

Why not in place: app-web runs Tamagui and react-native-web; v2 runs Tailwind and shadcn. Rebuilding in
place would break every page at once, while app-web must keep shipping the Sepolia client (F release,
`docs/client/f-release.md`) until v2 reaches parity. Two apps cost one more package for a few weeks.

| Part | Fate |
|---|---|
| `@paved/chain` (views, writers, economy, indexer client, controller, fakes) | **reused as is**; its React glue (`react.tsx`, `indexer-react.tsx`) is replaced in the new app by TanStack Query hooks over the same clients, then deleted with app-web |
| `@paved/game-core` and its engine | **reused as is** |
| `@paved/renderer` | **reused**, changed by section 5 (both apps use it; the change lands behind a profile flag until app-web goes) |
| `@paved/indexer` | **reused as is** (one route added: purchases by referrer, for the referral page) |
| app-web's `training/` (`LocalSession`, `PageSession`, storage, seed) and `tutorial/tutorial-run.ts` | **moved** into `@paved/game-core` (`session/`) so both apps share them, then the session work of section 9 builds on them there |
| app-web's pure helpers (`utils/*-view.ts`, `player-label`, `mode-routing`) | copied into the new app where used, deleted with app-web |
| `public/models`, `public/assets/tiles` | moved to `@paved/renderer`'s assets (served by both apps through Vite's `publicDir`) |
| `@paved/ui` (Tamagui) | dropped with app-web from the web; `app-native`, its last user, was removed in #591; the package stays |
| app-web's `bench/` and `scripts/bench` | the bench moves to the new app's board route (same method) |

**How both live:** both build in CI; Vercel published app-web's build until the cut-over (app-web was removed in P-70, see git history), then the
new app's; the new app can be published meanwhile to a preview path (`/v2/`, a Vite `base`) for the owner.
**When app-web goes:** one PR, once every page of section 6 exists and the devnet e2e passes on the new
app, after the owner has played it on Sepolia: it removes `packages/app-web`, its CI steps, and redirects
nothing (the routes keep their paths).

---

## 8. Font Awesome from nums

**Read, the files themselves.** nums ships three files, loaded by `<script defer>` tags in
`client/index.html` (lines 30–32) and in `client/.storybook/preview-head.html`; added by commit `6bab104`
("feat: add font awesome support", 2026-01-29). There is no CSS, no webfont, no kit id, no
`@fortawesome/*` or `@awesome.me/kit-*` package, and no `npm.fontawesome.com` registry in either
`.npmrc`.

| File | Bytes | SHA-256 (first 16) |
|---|---|---|
| `client/public/fontawesome/js/fontawesome.min.js` | 47,100 | `19e1110c6569c44a` |
| `client/public/fontawesome/js/solid.min.js` | 2,070,771 | `40b81666f7f3bd1b` |
| `client/public/fontawesome/js/thin.min.js` | 4,505 | `100c32756a08b9c0` |

The header of each, verbatim:

```
/*!
 * Font Awesome Pro 6.6.0 by @fontawesome - https://fontawesome.com
 * License - https://fontawesome.com/license (Commercial License)
 * Copyright 2024 Fonticons, Inc.
 */
```

glitchbomb ships the same three files, byte-identical (`cmp` on `solid.min.js`), with the same header.
nums uses only the solid style; its contracts name Pro-only icons (`fa-cards`, `fa-slot-machine`,
`fa-land-mine-on`…).

**Settled: the owner holds the licence (owner, 2026-10-14, F4).** The owner handled the Font Awesome Pro
licence himself and pushed the files to `main` at `21788fb` ("feat: add fa sources"), as
`app/public/fontawesome/js/{fontawesome,solid,thin}.min.js`, the same bytes as nums'. Client v2 uses Font
Awesome **Pro 6.6.0 from these files**, under the owner's Commercial License. The Free packages that P0 proposed
(`@fortawesome/*` 7.3.1) are not the plan any more: none is added, and no registry token is needed.

**The files in `packages/app`** (F4). Moved with `git mv`, not copied: nothing read `app/public/fontawesome`
(`app/` imports `@fortawesome/*` from npm and never the scripts), so the deprecated folder no longer holds
them (the folder itself was removed in #591). They are unmodified, and `sha256sum` equals that of `21788fb`:

| File | Bytes | SHA-256 |
|---|---|---|
| `packages/app/public/fontawesome/js/fontawesome.min.js` | 47,100 | `19e1110c6569c44a0b910f16cb39022e82c1fd70e4769d32e145d1e2e5baace9` |
| `packages/app/public/fontawesome/js/solid.min.js` | 2,070,771 | `40b81666f7f3bd1bc8d255fb00a2ce5a9470e33a7a492930a0c73ccde0b15a9f` |
| `packages/app/public/fontawesome/js/thin.min.js` | 4,505 | `100c32756a08b9c00be6627ee3dc4f837e068d453a6501ead8f311940a9354dc` |

`public/fontawesome/README.md` names the source; `public/THIRD_PARTY_NOTICES.txt` names the licence. **A finding:
`thin.min.js` registers one icon, `spider-web`** (4.5 KB); the thin style is not a thin version of the set. The
solid file holds the whole solid set (since Q3 (c) the whole files are in `packages/app/vendor/fontawesome/` and the served ones are subsets, below). Another style, or a thin icon, needs another file from the owner.

**How they load (F4).** Not as nums does, with `<script defer>` in `index.html`, and not through `<i>` tags.

- `src/lib/font-awesome.ts` sets `window.FontAwesomeConfig = { autoReplaceSvg: false, observeMutations: false }`,
  then injects the three scripts in order (`async = false`, `fetchPriority = "low"`) once the first frame is
  painted (`requestAnimationFrame`, then `requestIdleCallback`). The scripts then only fill Font Awesome's library:
  they rewrite nothing and watch nothing.
- `Icon` (`src/components/ui/icon.tsx`) asks `FontAwesome.icon({ prefix, iconName })` for the icon's abstract
  tree and renders it as React elements: an `<svg>` that React owns, painted by `currentColor`, with no `innerHTML`.
  Until the scripts are ready it is an empty box 1em high: 1.25em wide with `fixedWidth`, exactly the drawn
  icon, and 1em wide otherwise, where the drawn icon takes its width from its viewBox (0.125em for
  "pipe" to 1.25em for "user-group"; the house is 1.125em), so text beside it can move by up to
  0.875em (narrow icons) or 0.25em (wide ones). `fixedWidth` is the no-shift form. Props: `name`,
  `variant` (`solid` | `thin`), `size` (`xs` 12 px, `sm` 16, `md` 20, `lg` 24, `xl` 32), `label` (the accessible name,
  `role="img"`; without it `aria-hidden`), `fixedWidth`. Font Awesome still injects its small stylesheet
  (`.svg-inline--fa`, 1em high), which is what sizes the SVG.
- Why not `<script defer>` in the head: a deferred classic script runs before a module script that follows it, so
  the 2 MB `solid.min.js` sits in front of the app's first render. Why not a bundled import: the files are
  scripts, not modules, and the Free packages are not the plan any more. Why not per-icon packages: Pro packages
  need the registry token the owner did not give.
- A test (`__tests__/icon.test.tsx`) runs the real three files in jsdom through the loader: solid and thin icons
  render as SVG, a labelled icon has `role="img"`, a decorative one `aria-hidden`, and an `<i class="fa-solid ...">`
  outside React, present before or added after, stays an `<i>` (without the config the same files turn it into an
  `<svg>`, checked).

**What it costs** (F4; Mac, arm64; Chrome for Testing 147 with `--headless=new`; production build served
statically from localhost; 15 runs per cell, median and (p95) in ms; the shell, no icon drawn yet). `none`: the
three requests aborted; `defer`: nums' way, three `<script defer>` before the module; `lazy`: the chosen way.
Method: Playwright, one fresh context per run; the paint and navigation entries of the page, a mutation
observer for the first render, a CDP network and CPU throttle for the second block.

| Network, CPU | Variant | First contentful paint | First React render | Scripts fetched at |
|---|---|---|---|---|
| localhost, 1x | none | 64 (72) | 35.1 (39.8) | n/a |
| | defer | 104 (108) | 72.9 (77.5) | 17.8 |
| | lazy | 60 (64) | 31.2 (33.1) | 47.6 |
| 9 Mbit/s, 40 ms, CPU 4x | none | 648 (692) | 561 (590) | n/a |
| | defer | 2,552 (2,576) | 2,474 (2,493) | 2,207 |
| | lazy | 624 (644) | 547 (559) | 2,540 |

- Download: 47,100 + 2,070,771 + 4,505 = 2,122,376 bytes, uncompressed (the preview server sends no gzip; a
  host that compresses sends far less).
- Parse and run of the three files, alone: 28.1 ms (p95 40.1) at 1x, 123.5 ms (p95 173.7) at CPU 4x. In the page
  the longest task is 0 ms at 1x and 88 ms (p95 120) at 4x for `lazy`; the long tasks together are 167 ms at 4x.
- Reading: loaded in the head (`defer`), the scripts add 40 ms to the first paint on a fast link and **1.9 s** on
  9 Mbit/s with a slow CPU. Loaded after the first frame (`lazy`), the first paint does not move (60 against 64
  ms; 624 against 648 ms, within the noise of a run), and the icons appear when the scripts are ready, about 2.5 s
  in on that slow link. P1's tabs will show their icon boxes empty until then; **if that flash is not wanted**,
  the next step is a smaller file than `solid.min.js` (only the icons the app uses), not the head. **That step is
  Q3 (c), below.**

**The subset (Q3 (c)).** `public/fontawesome/js/solid.min.js` and `thin.min.js` are now derivatives of the owner's files, cut
to the icons the code names; `fontawesome.min.js` (the core, 47,100 B) is unchanged. They stay self-hosted, and the licence
header stays first in each. The owner's whole files moved, unmodified, to `packages/app/vendor/fontawesome/` (same SHA-256 as in
the table above), the input of the script. That folder is outside `public/`, so neither the build nor Storybook copies it
(the Storybook is published); `bundle-budget.ts` fails a `dist/`, and `scripts/storybook-guard.ts` (run last by
`build-storybook`) a `storybook-static/`, that holds anything but the README and `js/` under `fontawesome/`.

- `scripts/fa-subset.ts` (Node 24 runs it as is, no package): it reads the table of each source file
  (`var w={"name":[width,height,[aliases],"unicode","path"],...}`), keeps the entries whose name or alias the code uses,
  in name order, each copied as the source has it, and writes the source's own code around them. A note after the header
  names the source's SHA-256 and the count (`67 of 3312`). `bun run fa-subset` writes the files; `--check` regenerates
  them in memory and compares content with the committed files (never compressed sizes), and exits 1 when they differ.
  `bun run build` runs the check first, so a stale subset fails the client job.
- What "used" means: a string literal of `src/` that is a Font Awesome name (or alias) on a line about an icon: an
  `<Icon>`, an `icon` prop or key, an `ICON` table, the block such a line opens (comments and props such as
  `variant="ghost"` are left out). The Icons story is read whole, since it lists its names in a plain array. The names are
  the 67 solid icons (the names are the keys of the table in `public/fontawesome/js/solid.min.js`) and `spider-web` for thin.
- `__tests__/fa-subset.test.ts` holds the rule to the code: the committed files equal what the script gives; every icon a
  component names is in the subset (the failing file is named); an `<Icon name>`, `icon=` or `icon:` literal that is not in
  the owner's file is a typo and fails; the subset has no icon that no code names; each entry equals the source's; the header
  is first. **A name built at run time** (a template string) is invisible to the scan: write it as literals.
- Bytes (`gzip -9`): `solid.min.js` 2,070,771 B (670,385 gzipped) to 41,071 B (15,794); `thin.min.js` 4,505 B (2,120) to
  4,739 B (2,276), the note being 234 B; the three files together 2,122,376 B to 92,910 B (33,332 gzipped). Parse of the
  three scripts (`new Function`) and parse plus run (indirect `eval`), median of 15 fresh contexts, headless Chromium
  153 on Linux, a quiet machine: 19.4 ms to 2.9 ms parse, 82.1 ms to 13.5 ms parse and run. These are not the
  Mac's figures of the table above (a different machine and browser); the ratio is what carries.

---

## 9. Next-tile prediction with the engine

### 9.1 Read: what the contract does

- **The seed.** `contracts/src/seed.cairo:20-37`: `TokenSeed` gives a game's initial seed as
  `Poseidon(salt, Challenge's address, token id)` (D-23b); the token id is the game id. The salt is the
  game's `seed` field at creation, `0` (`models/game.cairo:95`).
- **The start** (`game.cairo:155-175`): the starter tile `RFFFRFCFR` facing South at the centre, its
  index removed from the deck, then `deck.tiles(tiles, seed)` withdraws the extra cards (the G1 walk:
  selection sampling over the 128-bit lanes of `Poseidon(seed, 'DECK' + batch)`).
- **A draw** (`game.cairo:285-307`, G5's running mask): `draw_from_bitmap(seed, number, tiles)`, the tile
  counter incremented, then `seed = Poseidon(seed, tile_count)`.
- **A build** reseeds before the next draw: `seed = Poseidon(seed, x, y)` (`reseed`, `:183-188`). So the
  tile after a build **depends on where the player placed**: it is known the moment the placement is
  chosen, not before.
  **A discard also reseeds** (`playable.cairo:96`), so the tile after a discard is likewise known only once
  the discard is made.
- **The views.** `game(id)` returns the **current** seed (it changes at every draw and build), the tile in
  hand and the counters; `tiles(id, from, count)` returns every drawn tile in draw order with its status
  (placed with its position and orientation, discarded, or held: `views.cairo:146-170`). No view returns
  the initial seed, the salt or the deck bitmap.
- **The engine** (`packages/game-core/src/engine/`, E1): `EngineGame.start({ deck: "simple", seed })`
  plays the same rules bit-exact, `build`, `discard`, `surrender`, `legalPlacements`; parity with the
  contract is checked in CI (`__tests__/engine-parity.test.ts` replays the golden games, regenerated for
  G1 and G5).
- **The session today** (`packages/chain/src/session.ts`): `GameSession.place` shows the placement at
  once (pending), sends, applies the receipt's events, then reads `game()` once for the next tile: **the
  hand is empty until that read returns**.

### 9.2 Proposed: predict, then confirm

A new `PredictedSession` in `@paved/game-core` (`session/`), implementing the same `PageSession`
interface as `LocalSession` (Training) so the board page does not know which it drives:

1. **Open.** Compute the initial seed `Poseidon(salt, Challenge, gameId)` with the engine's `poseidon`;
   read `tiles(id, 0, n)` (pages of 64); replay them with `EngineGame.start` + `build` / `discard` in draw
   order. Check that the engine's current seed and tile in hand equal `game(id)`'s: if yes, the engine is
   in step with the chain. A replay of 72 moves is a few milliseconds (estimate).
2. **Place.** On "Place", run `engine.build(placement)` **first**: the board shows the tile, the points,
   and **the next tile in hand at once**, from the engine. Then send `build` through `PavedWriter`; the
   move is marked pending until its receipt.
3. **Confirm.** From the receipt's events (`Built`, `Scored`, `GameOver`) and the one reconciling `game()`
   read that follows (the tile in hand and the current seed: no event carries the drawn tile), compare the
   chain's tile, score, seed and next plan with the prediction. Equal: the pending
   mark goes, nothing redraws.
4. **Queue.** The player may place the predicted tile before the previous receipt lands: moves queue in
   order (the writer is already serialised), each confirmed in turn. Proposed bound: two unconfirmed moves
   at most, then the hand waits.
5. **Discard and give up** follow the same path (the engine predicts the tile drawn after a discard).

### 9.3 On a mismatch

A mismatch means the engine and the contract disagree (a contract upgrade the client does not know, an
engine bug) or that another session moved in the same game.

- **A refused transaction** (the write fails): the engine rolls back to its state before the move (it is
  cloned before each move, `EngineGame.clone()`), the board removes the tile, the error shows; queued moves
  after it are dropped.
- **An accepted transaction whose result differs:** the chain wins. The session re-opens (step 1) from
  the chain, the board redraws from the replayed state, and a toast says "Board resynced". Moves queued
  after it are dropped and the player plays on. The event is logged with the game id and the move, for a
  parity bug report: the CI parity tests should make it impossible.
- **The initial check fails** (step 1): the session falls back to today's mode (no prediction: the hand
  waits for the chain), and says so in a dev-only banner.

### 9.4 The view the client needs (CORE, P-57 B9)

Everything but the salt is already there. **Requested of CORE:** a view returning a game's initial seed,
`initial_seed(game_id) -> felt252` (or its salt), so the client never hard-codes `salt = 0`; and the
promise that `tiles()` keeps listing every drawn tile in draw order with its status. Optional: the deck
bitmap in `GameView` (`tiles` field), which would let the client resume from the current state without
replaying; not needed at 72 moves.

### 9.5 How it fits

- `PageSession` lives in `@paved/game-core` (`src/sessions/`) with `LocalSession` since P2; `PredictedSession` joins them; `GameSession` (`@paved/chain`) remains the chain-only
  reader for other players' games (read-only boards, the player page).
- The session is a zustand vanilla store: the board's React components select from it, and the renderer
  subscribes to it directly (section 3.3).
- The Tutorial keeps its scripted engine run; Training keeps `LocalSession`; Challenge uses
  `PredictedSession`. A future Story mode (section 11) is `LocalSession` with a preset seed and board.

**As built (P5).** Where this differs from 9.2 and 9.3, the code holds:

- **Where.** `packages/game-core/src/sessions/predicted-session.ts`. `@paved/chain` depends on `game-core`, so the session
  reads structural copies of the chain's types (`ChainGame`, `ChainTile`, `PredictedViews`, `MoveReceipt`): `RpcGameViews`,
  `FakeGameViews` and `PavedWriter`'s results satisfy them unchanged. Like `LocalSession` and `GameSession` it is a small
  observable class (`state`, `subscribe`), read with `useSyncExternalStore`, not a zustand store.
- **Open.** The initial seed is CORE's `initial_seed` view (S1, #377: `GameViews.initialSeed`), never a hard-coded salt;
  `replayChallenge` replays `tiles()` in draw order with `EngineGame.start` + `build` / `discard` (a surrendered game is
  surrendered on the engine too). A discard is replayed as a discard, which reseeds at (`CENTER`, `CENTER`), whatever
  position `tiles()` reports for it (0, 0). The check compares the engine's score and end, and, for a game in play, its
  seed and tile in hand, with `game()`.
- **Moves.** The engine plays first; the move is then sent with the `send` the page passes (the signer's write), after the
  move before it is confirmed: `PavedWriter` refuses a second write while one is pending. The receipt's events (`Built`
  with its tile, plan, orientation and position; each `Scored`; `Discarded` with its points; `GameOver` with the score)
  and one `game()` read (score, end; for a game in play, seed and tile in hand) are compared with the prediction.
  `MAX_UNCONFIRMED` is 2: a third move waits (refused at once, nothing queued). A move the engine refuses is never sent.
- **Mismatches.** A refused write restores the engine cloned before the move, drops the moves queued after it, and shows
  the writer's message (typed errors: `GameExpiredError`, `InvalidPositionError` for CORE #391's `'Challenge: invalid
  position'`, added to `writer.ts` in P5). A write whose receipt could not be read (a hash, no known revert) may have
  landed: after the rollback the session re-opens from the chain. An accepted move with another result re-opens the
  session, drops the queued moves, logs the game, the move and the reason (`onMismatch`, `console.warn` by default), and
  counts `resynced`: the board toasts "Board resynced". While a re-open reads, moves are refused and send nothing (the
  hand waits), and the re-open drops whatever was queued. A re-open whose read fails keeps the board as it was, marks it
  `stale` with the `readError`, and re-opens on the next move (which sends nothing) or on the board's Retry. A failed
  check at open plays without prediction: the hand waits for the chain, each move re-reads `game()` and `tiles()` (a
  failed read there marks the board stale too), and the board's slots and preview come from an engine holding the
  chain's board; a dev-only notice gives the reason.
- **Expiry.** Past `expiresAt` (the session's clock: the wall clock, block time in the e2e) a build or a discard shows
  `GameExpiredError`'s message and sends nothing; a surrender is accepted. The board's hand turns to `expired` and the
  Surrender dialog opens by itself (`BoardScene`'s `promptSurrender`); the countdown is in the header.
- **The route.** `/game/:gameId` (`routes/pages/board.tsx`) mounts the board scene on `useChallengeSession`
  (`src/data/challenge.ts`), over the `DataProvider`'s sources: `views` (now `PavedClient.views` on the deployment the
  build names, `src/data/chain-client.ts`, loaded with the first read so starknet.js stays out of the first bundle) and a
  new `signer` slot (`GameSigner`: `PavedWriter`'s `address`, `build`, `discard`, `surrender`), null until P6 connects the
  wallet. With no signer, or another player's game, the board is read only (no hand) with a "Connect to play" (or
  "Another player's game") notice. Each confirmed move invalidates the `game(id)` and active-game queries of the other
  pages. A finished game goes to `/game/:gameId/over`.
- **Checked.** `packages/chain/test/predicted-session.test.ts` (the session against an engine-held chain,
  `test/engine-chain.ts`), `packages/app/__tests__/challenge-route.test.tsx`, and the devnet e2e
  `packages/chain/test/e2e-predicted.test.ts` (`PAVED_E2E_PREDICTED=1`, a node and `scripts/deploy.sh devnet`, no indexer):
  a bought game opened in step, 16 moves predicted with closings and discard penalties, each equal to its receipt and
  `game()`, two moves queued, a refusal rolled back, a move made behind the session's back resynced, an expired game
  refusing a discard and closed by a surrender.

---

## 10. The skills to install

The Overseer's ruling (2026-10-14), written into `AGENTS.md` ("Skills"): a skill lives in the repository
at `.claude/skills/<name>/`, comes by a reviewed PR naming its source and exact version, and the review
refuses anything that grants a permission, retries a refused command, speaks to another session, or
fetches and runs code. **No skill is added in this PR; the PM decides which.**

Sizes are measured on the commits named (bytes with `wc -c`, lines with `wc -l`). The rule check is a
read of `SKILL.md` and a search of every file for `allowed-tools`, `npx`, `bunx`, `pnpm dlx`, `curl`,
`WebFetch`, `retry` and `permission`; the review of each skill's PR reads its whole text.

| # | Skill | Source | Size (`SKILL.md`; all files) | What it brings | The rule |
|---|---|---|---|---|---|
| 1 | `paved-ui` | **written by CLIENT**, trimmed from nums' `ui-architecture` (`cartridge-gg/nums@4f8f405`, `.agents/skills/ui-architecture/SKILL.md`, 366 lines, 13,555 B, MIT) | about 150 lines (estimate) | the tiers, a story per component, CVA + `cn()`, the tokens of section 2 (never a raw colour), Font Awesome (the owner's Pro files, section 8), Motion patterns, the breakpoints, the a11y floor | nums' original **fails as is** (`allowed-tools: Read, Write, Edit, Glob, Grep, Bash` grants permissions); the written one carries no such line. **Done (F7a):** `.claude/skills/paved-ui/SKILL.md`, 140 lines |
| 2 | `paved-data` | **written by CLIENT** | about 100 lines (estimate) | the query keys, no polling, receipts into the cache, the three owners of state, the prediction session | written to pass. **Done (F7b):** `.claude/skills/paved-data/SKILL.md`, 86 lines |
| 3 | `paved-renderer` | **written by CLIENT** | about 100 lines (estimate) | render on demand, no per-tile geometry, the outline pass and its settings, the bench method and the Mac's headless rule | written to pass. **Done (F7c):** `.claude/skills/paved-renderer/SKILL.md`, 125 lines |
| 4 | `shadcn` | `shadcn-ui/ui@30a58d4498f270af1c1e981a7d78a15cf5740841` (2026-10-12), `skills/shadcn/` | 295 lines, 21,306 B; 21 files, 148,754 B | the shadcn conventions: composition, styling with tokens, forms, Radix vs Base UI | **fails as is**: `allowed-tools: Bash(npx shadcn@latest *)…` grants permissions; a `` !`npx shadcn@latest info --json` `` line runs the latest CLI at load; it tells the agent to run `shadcn@latest` and fetch the docs URLs. **Trim** to `rules/styling.md`, `composition.md`, `forms.md`, `base-vs-radix.md`, `icons.md` (23,336 B) and a rewritten `SKILL.md` that names the CLI version pinned in `package.json`; drop `mcp.md`, `registry.md`, `cli.md`, `design-system*.md`, `chat.md`, `evals/`, `assets/`, `agents/`, `scripts/`. **Done (F7d):** `.claude/skills/shadcn/`, `SKILL.md` plus the 5 rule files, licence in `THIRD_PARTY_NOTICES` |
| 5 | `react-best-practices` | `vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278` (2026-08-28), `skills/react-best-practices/`, MIT | 149 lines, 7,251 B; 76 files, 230,383 B | 70 rules on waterfalls, bundle size, re-renders, rendering, ranked by impact | **passes** on the search (no permission, no run, no fetch); **trim** for size: drop the 10 `server-*` rules and the Next.js items, and the compiled `AGENTS.md` (a duplicate of the rules); kept: 60 rule files + `SKILL.md`, 95,623 B. **Done (F7f):** `.claude/skills/react-best-practices/`, `SKILL.md` plus the 60 rule files, licence in `THIRD_PARTY_NOTICES` |
| 6 | `composition-patterns` | same commit, `skills/composition-patterns/`, MIT | 89 lines, 2,886 B; 14 files, 50,339 B | compound components, no boolean-prop sprawl, React 19 APIs: fits the tiers | **passes** on the search; trim the compiled `AGENTS.md` duplicate **Done (F7g):** `.claude/skills/composition-patterns/`, `SKILL.md` plus the 8 rule files, licence in `THIRD_PARTY_NOTICES` |
| 7 | `web-design-guidelines` | same commit, `skills/web-design-guidelines/` | 39 lines, 1,231 B; 1 file | an accessibility and UX review against Vercel's Web Interface Guidelines | **fails as is**: it fetches its rules from `vercel-labs/web-interface-guidelines` at `main` before each review (remote text used as instructions). **Trim**: commit the guidelines file at a pinned commit beside `SKILL.md` and drop the fetch (the commit to pin is not read yet: the PR names it) |

**Not proposed:** `frontend-design` (`anthropics/skills@dbd4588f9e1033efb41dad4bef2f7947c8993d44`, 71
lines, 9,390 B; 2 files, 19,564 B; passes the rule) pushes an agent to invent a distinctive palette and
typography, against the owner's fixed direction; `webapp-testing` (same repository, 6 files, 22,394 B)
drives Python Playwright with a server-starting script, while the repository's browser work is the
TypeScript bench; `react-view-transitions` (vercel-labs, 9 files, 121,681 B) covers a path Motion
replaces.

**Proposed order:** 1–3 with the foundations (they encode this document), 4 with the first shadcn
components, 5–6 then, 7 in the polish phase.

---

## 11. Room for the future (P-57 B10)

Where each would plug in; none is designed here.

| Future item | Where it plugs in |
|---|---|
| Daily and weekly challenges paid from entry fees | a mode on the Play page; a `PredictedSession` on a contract that takes a shared seed (the engine takes any seed); the leaderboard's day picker already takes a period id |
| Story mode (predefined seeds, a non-empty starting board) | `LocalSession` with a preset seed and a preset board (the engine's `force` / `write` already place scripted tiles, as the Tutorial does); a `/story/:chapter` route; puzzles as data files |
| XP and meta-progression | a `profile` query (indexer, then chain) behind `usePlayerProgress()` (`packages/app/src/data/player-progress.ts`, #625: today level 1 and 0 XP for everyone, the one place the contracts' XP plugs in), drawn as the ring and level badge around the avatar; unlocks gate themes and modes through one `useUnlocks()` hook, so the Theme page's "locked" states are data |
| Leagues (synchronous or asynchronous) | async: the leaderboard's tables with a league id; sync: the disabled Multiplayer card, the session interface (a remote session is one more `PageSession`) |
| A native Swift client | everything the client computes lives in packages without React (`@paved/game-core` engine and sessions, `@paved/chain` clients); the contract views and the indexer API are the boundary a Swift client reads; the design tokens are one CSS file, exportable to Swift as a generated colour set |

---

## 12. The phased plan

Every PR branches from `main` and targets `main`. Estimates are **estimates**, in working days of one
thread, review rounds included.

### Phase 1: foundations (design system, Storybook, hosting)

| PR | Content | Estimate |
|---|---|---|
| F1 | `packages/app` scaffold: Vite 8, React 19, Tailwind v4, `theme.css` (section 2), fonts, React Router with the route map as empty pages, TanStack Query, zustand, Motion; CI build | 1.5 d |
| F2 | Storybook in `packages/app`: the Foundations stories (colours with contrast, typography, motion, breakpoints), the dark board background; CI `build-storybook` (workflow listed) | 1 d |
| F3 | shadcn primitives (section 3.1) restyled to the tokens, each with its stories | 2 d |
| F4 | Icons: Font Awesome Pro from the owner's files (section 8), an `Icon` component, the Icons story | 0.5 d |
| F5 | Storybook hosting: the publish command (no script change), the Caddy block for the PM's root step | 0.5 d |
| F6 | Tiles in Storybook: the 19 base tiles through the renderer; the extended set brought over from `origin/dev` | 1.5 d |
| F7 | The skills chosen by the PM (section 10) | 1 d |

### Phase 2: pages, story-first

The PM's decision (2026-10-14): **story-first**. Every page is built first as a scene in Storybook, with its
containers and elements, on typed mock data, before any wiring to chain or indexer data; the owner reviews the scenes
on the published Storybook. The tiers are those of section 4.1: `elements/` (game atoms), `containers/`
(composites), `scenes/` (one per page). Scenes take their data as props; the mocks in `packages/app/src/mocks/`
have the shapes `@paved/chain` and `@paved/game-core` return (types imported, nothing called), one fixture per
scene state; each state has one story, told at the four widths by Storybook's viewport toolbar (none picked is the full width), and a render test.

Then the wiring PRs put the scenes on the routes, the sessions and the data: a wiring PR replaces a scene's fixture
with the hook that reads the same shape, and changes the scene only where the real data asks for it.

**Scenes on mock data**

| PR | Content | Estimate |
|---|---|---|
| SC1 | Scenes welcome, loading, home, play, board, over, purchase, with their elements and containers. The board draws the real renderer on the bench's recorded boards, with the hand (rotate, confirm, discard, surrender), the score, the tiles left counting discards (P3), the time before `expires_at`, the closing points as they appear, and the states placing, pending, refused, expired, storage off; over lists every closing of the game (P7); purchase shows the stake, price and boost, the split (`Economy.split_bps`, V1b: burn and Vault, the referral out of the Vault's part), the 24 h validity and the threshold | 3 d |
| SC2 | Scenes leaderboard, vault, settings, theme, quests, achievements, referral, reusing SC1's elements and containers. **Done** (2026-10-14) | 2.5 d |
| SC3 | The Cobbles scenes (P-61, section 6.3's note; the design's gems, renamed by the owner): the Cobbles balance, the packs on purchase, the tile skins on theme, the Cobbles claims and free games on quests and achievements, Play free on home and play, the free mark on the leaderboard, on `src/mocks/cobbles.ts` (provisional until CORE's ABI). **Done** (2026-10-15). P9 (quests, achievements), P7b (purchase's packs) and P11b (theme's skins) wire it once CORE's three gems PRs land: (1) ledger, claims, free credits, `spawn_free`; (2) packs; (3) skins; CORE's rename PR then renames the contracts' and the indexer's gems to Cobbles | 1.5 d |
| SC2b | The quests scene with CORE v2a's rotation (a different daily subset live each day), weekly quests, a countdown to the end of the day and of the week, and a toast when a quest completes (`quests-v2.md` 1.2, 2.1, 1.5). **Done** (2026-10-14) | 1 d |

**Wiring the scenes**

| PR | Content | Estimate |
|---|---|---|
| P1 | App shell on the routes: SC1's navigation (bottom bar, desktop rail), top bars, the loading scene as boot screen and `Suspense` fallback, error boundaries; the welcome scene on `/welcome`. **Done** (2026-10-15) | 1 d |
| P2 | Move `PageSession`, `LocalSession`, the tutorial run into `@paved/game-core`; the TanStack Query hooks over `@paved/chain`, returning the mocks' shapes. **Done** (2026-10-15; section 3.3, "As built (P2)") | 1.5 d |
| P3 | The board scene on Training (`LocalSession`): the hand panel and the placement preview wired. Added by the PM (2026-10-14): a tiles-left counter that counts discards as spent (EL, owner 2026-10-14: the number of discarded tiles is not shown anywhere, the Over scene's row included); a notice when storage is off or a save was dropped; two-tab handling; Esc closes the Surrender dialog; the move sent is the slot the player sees (D1, #379). **Done** (2026-10-15): `/training` and `/training/over` on a `TrainingGame` (`src/data/training.ts`: the session and a rules engine of the same moves for the slots and the preview, both kept between moves); the plan view is playable where the renderer cannot start; a tab follows the save another tab writes (the `storage` event); `DataProvider` mounted in `App.tsx` (Training's store; the chain and indexer sources refuse until their pages). The save, the following of another tab and Training's storage notices left in #718: every entry starts a new game | 2 d |
| P4 | Renderer: the post-processing chain and the zoom-following outline (section 5), measured with the bench | 3 d |
| P5 | `PredictedSession` and the Challenge board (section 9) on CORE's `initial_seed` view (S1, #377). Added by the PM: prompt a surrender when `expires_at` is reached; the discard reseeds at (CENTER, CENTER); if the replay check at game open fails, fall back to no prediction. **Done** (2026-10-15; section 9.5, "As built (P5)"): `/game/:gameId` on the predicted session, read only until P6 fills the sources' `signer` | 3 d |
| P6 | The home and play scenes on their data; the Tutorial on the board scene. **Done** (2026-10-15): the wallet (`src/wallet/`): `WalletProvider` fills the sources' `signer` (`PavedClient.writer` of the account: the moves, the tutorial's claim and P9's Cobbles claims) while connected and clears it on Disconnect; the Cartridge controller with the game's session policies outside devnet, the env's burner (`VITE_PLAYER_ADDRESS`, `VITE_PLAYER_PRIVATE_KEY`) on devnet, loaded in its own chunk on the first connect or on a page that reads the account (home, play, the tutorial's end), never by the welcome or Training; the welcome's Connect connects; (the shell's footer with the D-15 notice and Disconnect, and the board's compact notice, were removed by #536; the notice is on the Credits page). A devnet key is read only in a devnet build (static accesses behind a build-time test), and a production build without `VITE_NETWORK` names no network: the chain client refuses rather than falling back to devnet. Home and play on their data (section 6.4, "As wired (P6)"); `/tutorial` on the board scene with its own `TutorialRun` (`data/tutorial.ts`) and, at its end, the First Stone claim through the signer (D-21). "Play free" on home and play, and the wallet restored on quests and achievements: done (PLAYFREE; see the P9 row) | 1 d |
| P7 | The purchase scene (stake, price, boost, split, 24 h validity, threshold) and the over scene (metrics, reward, settle) on their data. Added by the PM: on the over page, the list of every closing of the game. **P7b done** (2026-10-15; "As built (P7b)" below): the purchase half, with Cobbles part 2's packs. **P7a done** (2026-10-15; "As built (P7a)" below): the over page of a Challenge, with settle | 2 d |
| P8 | The leaderboard and player scenes on the indexer. **Done** (2026-10-15; "As built (P8)" below) | 0.5 d |
| P9 | The quests and achievements scenes on the indexer. With Cobbles part 1 (CORE #440): the claims and the free-game credits. **Done** (2026-10-15; "As built (P9)" below). **Play free done** (PLAYFREE): `PavedWriter.spawnFree` (`Challenge.spawn_free()`, typed `NoCreditError` and `FreeSpawnPausedError`, a session policy), `usePlayFree` (`data/play-free.ts`) on home and play: with a credit and a signer that can spend it, disabled while spawn is paused, absent for a guest; the receipt's `GameSpawned` id opens `/game/:id` and the credits in the cache go down by one. Quests and achievements look for an earlier wallet session as home and play do (`useAccount`). A free game is `GameSpawned.price == 0`; its over page's "Free game" label is left to P7a | 0.5 d |
| P10 | The vault and referral scenes on their data (and the indexer's referral route). **Done** (2026-10-16; "As built (P10)" below): `/vault` on the Vault as it is on main, an ERC4626 over PAVED (vPAVED), with deposit, withdraw and withdraw all; `/referral` on the indexer's `/v1/players/:id/referrals` (IX-COBBLES2, games and packs) | 1.5 d |
| P11 | The settings and theme scenes (themes beyond Default shown "coming soon" until their art). **P11b done** (2026-10-16; "As built (P11b)" below): `/settings/theme` with Cobbles part 3's skins, bought and activated on chain, and the Forest models compressed. **P11a done** (2026-10-16; "As built (P11a)" below): `/settings` on its data, the device settings and the viewer's skins opt-out. **SKIN-RENDER done** (2026-10-16; "As built (SKIN-RENDER)" below and 5.6): the board draws each tile with its player's active skin, a variant per tile by origin/dev's `getVarietyModelPath` hash | 0.5 d |
| P12 | Cut-over: devnet e2e on the new app, publish it, remove `packages/app-web` | 1.5 d |

**P9's note (SC2b).** The quests scene takes each quest with its schedule (`start`, `interval`, `duration`: `ScheduledQuest` in
`lib/quest-window.ts`, provisional until P9: `@paved/chain`'s `PlayerQuest` does not carry them yet). **v2a is on main** (CORE's
#423, bc486b1f: nine rotating dailies, ids 5 to 13, in a 3-day interval; three Monday-start weeklies, 14 to 16; achievements 10 to 16),
and CORE's #426 (448f48bf) fixes the daily count at **four a day**: Daily Run (quest 1) always live plus one rotating quest of each
family (the day number mod 3 picks it); quests 2 to 4 are not defined at the fresh deployment. The mocks follow it
(`mocks/quests.ts`, `containers/quest-text.ts`, which no longer knows 2 to 4).
`questWindow` there is the rule of `quests-v2.md` 1.2 (active when `(now - start) % interval < duration`, interval id
`floor((now - start) / interval)`, window end `start + id * interval + duration`): the scene derives the Daily and Weekly
countdowns from it, a weekly's week from its definition (not from a Monday), and a quest is a daily or a weekly by its
`duration`. P9 passes the scene the indexer's list with the schedule fields, and the indexer's clock as `now`.
`newlyCompleted` in `lib/quest-toasts.ts` is the pure function behind the toast ("Quest completed: <title>", also "Achievement
earned"): the scene's `useCompletionToasts` calls it on each new `quests` prop, so P9 only has to refresh the prop; the toast shows once
per (quest, interval), never on the first read, never for a past day's data, and not on a change of day (the hook takes the day as its `scope` and
drops its last list when it changes). P9 must keep: (1) `announced` (the keys already toasted) lives above the route, per player, in the app's
store, so a cached-then-fresh read after a remount does not toast again; the scene's hook keeps it in a ref today. (2) Whether completions made while the scene
was unmounted are announced on return is P9's to decide; recommended yes, by keeping the last list per player in the store and giving it to the
hook as `previous`. Weekly progress is monotone inside one interval in the mocks, and the indexer's must be.
The `Toaster` is mounted once above the pages (`App.tsx`).

**As built (P7b).** `/play/challenge` reads the game's purchase from the chain: `Economy.quote(stake)` (the price from
`entry_price`, the threshold), `split_bps`, the USDC `balance_of`, `spawn_paused`, and the pool's `quote_swap` of the stake's
swap for `min_out` (1 % slippage); Pay sends the approve and `Challenge.spawn(stake, referrer, min_out)` in one multicall
through `EconomyWriter.purchase`, which reads the price, the quote, the router pin, `Economy.seller()` and the guard's rate
again and sends nothing on a change, then opens `/game/:id` from the receipt's `GameSpawned`. The multicall is one wallet
prompt (P-65, SESSION-NOAPPROVE); the pending state reads "Confirm in your wallet…", as a pack's already did, so nothing
changes on screen but the prompt itself. A prompt the player declines is a `WalletRejectedError` ("You declined in your
wallet: nothing was sent."): a refusal, no hold. Only the controller's documented cancel shapes are typed so (the
`undefined` it rejects with on a cancel, `CANCELED`, `USER_REFUSED_OP`, a "User rejected" message); anything else, a bare
`null` or a node's "Transaction rejected", stays a plain refusal with its message. In both cases nothing was sent, so the
record written at send gives way to the one that was there before (none, or a record the player released). A referrer equal to the seller (`Setup`) is sent as 0x0 even where the
base deployment names no Setup (VALUE-FIX's note). While a new stake's quote is read the last one stays shown
and Pay waits. The Cobble packs, once a tab of this page (`?tab=cobbles`) and a page of their own since #621 (`/cobbles`, the old link redirects there), read the packs from `Setup.pack` (ids 1 to `MAX_PACK_ID`, 8), not from the
indexer's `/v1/packs`: `buy_pack` charges the contract's price, the buyer reads it again at send, and the chain has a new
price before the indexer does. Buy is `PackBuyer.buy` (`@paved/chain`, `packs.ts`): the same fresh checks as a game (the
chain id, the pack on sale at the confirmed price, the router pin, the rate, the split, a fresh quote of the pack's swap,
the price less the referral when one counts), then `PavedWriter.buyPack`: the approve of exactly the price to `Setup` on the
economy's USDC and `Setup.buy_pack(pack_id, referrer, min_out)`. Its arguments are listed once (`buyPackArgs`), so a
`max_price` is a one-line change. The receipt's `PackBought` sets the Cobbles balance in the cache, then the account is read
again. Neither `buy_pack` nor the pack's approve to `Setup` is a session policy (PM ruling P-65), so a pack prompts once,
for its approve and `buy_pack` together. The referrer is the link's `?ref=` (an address, not the player's own),
as each purchase would send it (`Purchases.referrer`): one the contracts would not pay (the Challenge, the Economy; for a
pack also `Setup`, the Vault and the router, which `Economy.pay` ignores) is dropped with a notice, never a refused
purchase, and the split shown is the one the contract pays. The states: guest ("Connect to buy"), paused, not enough USDC
(Buy disabled with the reason), a USDC balance not read (unknown, not 0: Pay waits, a failed read has Retry), the packs
being read, unreadable (Retry) or none on sale, a price that changed (`PurchasePriceChangedError`,
`PackPriceChangedError`), the pool's quote that moved (`PoolPriceMovedError`, the swap's `min_out` revert: "The pool's
quote moved: confirm again"), a quote far below the guard rate ("Buy anyway"), another transaction on its way (a neutral
wait), pending, refused (the writer's message), an unknown outcome, and success (the board; a pack's Cobbles added). An
unknown outcome is recorded per player and kind (its transaction hash, in `localStorage`, the query cache when storage is
off: `data/unknown-purchase.ts`), so it survives a remount ("Check my games" and back), a reload and a second tab. While
it is recorded, each mount checks its receipt and the reads that tell whether it landed (a game: the player's games, active
game and USDC; a pack: the Cobbles and USDC), each with `fetchQuery`. Pay and Buy are held during that check and while it
fails ("could not check", Retry), with "Check my games" or "Check my Cobbles". A receipt that reads unknown
(`TXN_HASH_NOT_FOUND`) keeps the hold (VALUE-FIX): it is read again after 5 s, 10 s and 20 s (`PURCHASE_RECHECK_MS`), then
the page waits for the player, with Check again and "It did not land". "Buy again" is offered only after a definite answer
(the record is cleared) or after the player confirms, from their USDC balance and their games (a pack: their Cobbles), that
nothing landed; then only that deliberate "Buy again" sends, since a second purchase would pay twice. A send is recorded
without a hash when it starts (SESSION-NOAPPROVE, VALUE-FIX's note): sent at, by the sender, with the send's identity
(`id`: milliseconds and a random part, so two sends of the same second differ; records are compared by it), may still
land. Under the 5-minute limit such a record is a prompt that may still be open (a reload, a second tab): the notice reads
"A purchase is waiting in your wallet", Pay stays held and "It did not land" is not offered, so no second purchase races
the open prompt; past the limit, the usual text and the confirm. An answer in
time settles it (it landed or reverted: the record goes; an unknown hash replaces it; a send that sent nothing, refused before
sending, declined in the wallet or refused as busy, puts back the record that was there before, so an earlier send's record
goes only once a new send is accepted). A send the wallet never answered (`PurchaseTimedOutError`, after 5 minutes) keeps that
hash-less record (VALUE-FIX). Its check reads the USDC balance, the player's
Challenge games and the active game (a pack: the Cobbles account and the USDC balance), with no receipt to read, and Pay stays
held across a reconnect (a new writer, whose own pending flag knows nothing of the hung send) and a reload, until the send's
late answer arrives in this page (it landed or was refused: the record goes; an unknown hash replaces it, but only while
the record is still that send's, so a late hash never overwrites a newer send's hold) or the player
confirms as above. A late answer that arrives while a newer send's hold has the slot (VALUE-POLISH: B's prompt open, or
another tab's) is kept aside (`paved:purchase-late:v1:<kind>:<player>`, memory when storage is off): when B's hold goes
(B sent nothing and gives the slot back to A's record, or B settles and the slot empties), A's late hash takes the slot and
its receipt is checked; a late success or refusal of A only means that A's record does not come back. A failure of the wallet
or the node that does not show the send was refused before sending (`SendUnconfirmedError`: a timeout, a lost connection, a
bare `null`; anything but a decline, the node's refusal codes 20, 28, 40, 41, 52 to 58 and 60 to 62, or a revert, estimate or
validation message, `refusedBeforeSending`) keeps the hash-less hold as a wallet that never answered: the transaction may
have reached the node with its hash never returned. While a hash-less record is under the limit a failed check offers Retry
only, not Dismiss (VALUE-POLISH): a dismiss then would forget a send whose wallet may still answer. A check that keeps failing (a
node without receipts, an outage) offers Dismiss beside Retry, with the warning that buying again may pay twice. The
notice says how long ago the purchase was sent (the record's `at`). The receipt decides on its own: one that reads (it
went through, or reverted) clears the record even when a reconciling read failed. The record goes under the player who
sent it (the request carries it), whoever is connected when the outcome comes back; a change of player resets the page's
refusals and resolutions. A write that storage refuses (full) is remembered for the page's life, so the stale stored value
is never read back over the cache's copy. The game's referrer follows the same rule as a pack's (`Setup`, the Vault and the
router read at the time are dropped too), since both go through `Economy.pay`; since VALUE-FIX the writers map it themselves
with one function (`paidReferrer`, `packReferrer` being the same): a link referrer the page could not check (its first read of
`Purchases.referrer` failed) is still sent as "0x0", with the no-referral swap input and `min_out`, never a referral cut the
contract does not take (P-35). The app's
sources give the economy's views, its pool quote and the purchases (`EconomyClient` on the build's deployment,
`data/economy-client.ts`, loaded with the chain's chunk). `Pack` is `@paved/chain`'s `PackView` (`cobbles`, no longer `gems`).

**As built (P7a).** `/game/:gameId/over` reads, once the game is over, from where each value is authoritative. The
final score, the counters and the times are `Challenge.game(id)`: the chain, which the indexer follows. The reward is
`Economy.terms(id)`: `settled` and `reward` (the PAVED minted, 0 below the threshold), `expired` (the game was not recorded within
24 h of its purchase, whose deadline the page writes as `terms.time + 86400`), `stake` and `day`. The threshold is the closed day's
(`Economy.day(day).mean`, 0 until the day closes at the first settle after it) shifted by the game's own frozen `sigmaBps`, as
`curve::threshold`; once settled it is the one the contract used, read from the indexer's record (`economy.threshold`, the
`Settled` event). Before the day closes the threshold is unknown and the page says nothing of it. The indexer's game record
(`/v1/games/challenge/:id`) also gives `free`. Its failure is not an error of the page: a game that just ended is not indexed
yet, and the page needs only the chain. The metrics are the chain's, not the record's (the record has no counters of tiles).
Every closing of the game is not in the record either (the indexer ingests the `Scored` events but its game row does not list
them), so the page replays the game on the engine, as the board opens one (`replayClosings`: `initial_seed` and `tiles()`),
and lists what each build closed with its tile; a replay that does not end on the chain's score is dropped and the list says
it could not be read. A failed read of the game, its terms or its day shows an error with Retry; nothing polls. A game still
in play goes to `/game/:id` (replace); an unknown or non-numeric id is "Game not found" with Back home. The board's end of a
Challenge already leads here (`board.tsx`, P5). Play again opens `/play/challenge` and keeps `?ref=`.

The reward panel shows: the PAVED amount when the game is settled above the threshold; "No reward" and the threshold when it
is settled below; "Expired" with the 24 h deadline when `terms.expired`; "Free game" and no reward or settle when
`GameSpawned.price == 0` (the indexer's `free`, or a game `Economy` never sold, `stake` 0). Read in `economy.cairo`:
`spawn_free` does not pass through the Economy, so a free game has no terms, is never recorded, and `settle` refuses it
(`'Economy: unknown game'`): the contract pays nothing for it. Settle is `EconomyWriter.settle`: "Settles after <date>" until
`settlesAfter(day)` (the end of the day after the game's, P-34), then the player's "Settle and claim" (a guest sees "Connect to
settle", someone else that it can be settled now: the button is the player's, though anyone may settle). Pending, then the
receipt's `Settled` sets the game's terms in the cache and the terms, the day and the PAVED balance are read once more; a
refusal shows the writer's message (`SettleUnknownGameError`, `SettleNotRecordedError`, `SettleTooEarlyError`, now typed in
`@paved/chain`; any other message as it is) with the button again, and the terms are read again, so a game another account
settled meanwhile shows as already settled. An expired game has no settle control: it would mint 0. `settle` is a session
policy of the controller (`controllerPolicies(..., { economy })`, the Economy's address from the economy deployment), with no
approve (P-65: no token approve in the session); no other Economy entry point is, and the Vault's still prompt.
`settlesAfter` and the threshold's formula are repeated in `data/over.ts` so that the route's chunk imports `@paved/chain` as
types only; a test holds the first equal to the chain's.

**As built (P9).** `/quests/:day?` and `/achievements` read the quests and achievements from the indexer (`usePlayerQuests`,
`usePlayerAchievements`) and their Cobbles from two sources: each quest's and achievement's amount from the indexer's
definitions (`cobbles`, `cobbles_kind`), and the player's ledger from `Setup`'s views (`account`, `day_progress`,
`week_progress`: `useQuestRewards`, `useAchievementRewards`, `useCobbleAccount`, `useFreeCredits` in `src/data/cobbles.ts`). The
ledger is read from the chain, not from the indexer's `/cobbles` and `/claims`, because after a claim's receipt the chain has it
and the indexer may not. `@paved/chain` has the views (`CobbleViews`, on `RpcGameViews` and `FakeGameViews`; `GameViews` does not
require them), the claims on `PavedWriter` (`claimQuest`, `claimAchievement`, `claimDailyCredit`, `claimWeeklyCredit`, and `claim`
for several in one multicall), each revert of `Setup` as a `ClaimRefusedError` with its `reason`, and `FakeClaimer`
(`@paved/chain/testing`), which applies the contract's checks on the fake ledger. A claim's receipt goes into the cache
(`applyClaimEvents`: `CobblesClaimed` sets the balance and the claimed bit, `CreditClaimed` the credits), then one invalidation of
the ledger's keys reconciles it; nothing polls. Claim all is one multicall of the page's completed, unclaimed quests (or
achievements); a past day's claim names that day (a weekly's, the week of the day shown, `weekOfDay`: Monday to Sunday from
1970-01-05, the ledger's week). `now` is the indexer's served block time, ticking locally from its read (`useIndexerNow`); today
is its day. A quest is a daily or a weekly by its `duration`; its claim's period is its `cobbles_kind`, and a quest on which the
two disagree shows no reward. The free-game rows count the quests with Cobbles, as `claim_daily_credit` does. The player is the
signer's address: no signer, the guest's notice; a signer without the claims (the board's `GameSigner`), read only with "Connect
to claim". The toasts' memory (`announced`, and the last list per player and kind) lives in a store above the route
(`src/data/completion-memory.ts`) and reaches the scenes as `toasts`; a completion made while the page was closed is announced on
return. Left for others: the indexer in the app's sources (`routes/sources.ts` still refuses its reads), the signer with the claims
(P6, done), Play free on home and play (done, PLAYFREE), the leaderboard's free mark (P8). The new query keys
(`cobbleKeys`, `clockKey`) are in their data files until P6's change to `keys.ts` lands.

**As built (P11b).** `/settings/theme` reads a theme's skins from `Setup` (cobbles v1, part 3, CORE #463): its 19
`skin_price`, the player's `skins(player, theme)` and `active_skins(player)`, with the balance from `account` (`useThemeSkins`,
`data/skins.ts`, keys `["chain", "skins", ...]` beside the ledger's). Forest is theme 1, priced by the fresh deployment for all
19 plans; theme 0 (the default) is free and never priced; Snow, Desert and Volcano stay "coming soon" and are not read. Buy is one
`buy_skin` (`PavedWriter.buySkin`) at the price the card showed: the writer reads `skin_price` again inside its serialised send
and refuses another (`SkinPriceChangedError`, "not for sale any more" at 0), sending nothing, as a pack's changed price is
refused (VALUE-FIX); the theme's prices are then read again. Its receipt's `SkinBought` sets the balance and the owned bit in
the cache, then the owned word and the account are read again. The switches are a batch on the page (`toggleSkin`: a switch back to the saved value leaves
it); Save sends only the plans that changed in one `set_skins` (`PavedWriter.setSkins`, about 0.12M gas per plan), whose
`SkinsActivated` word replaces the active set in the cache before the reconciling read. At most one theme per plan holds by the
active set's shape. A theme withdrawn from sale keeps the skins the player owns, switchable. The states: a guest's Connect, the
loading skeleton, a failed read with Retry, Buy disabled with "Need N more" when the Cobbles are short, a purchase or a save on
its way (the other writes wait), a refusal (`SkinRefusedError`: owned, not for sale, not enough Cobbles, not owned) shown with
its reason and the batch kept, "Skins saved". The two writes are session policies (`CONTROLLER_ENTRY_POINTS`): they spend
Cobbles, never a token, so they need no approve (P-65: none is in the session). `set_skins` takes a `Span<(u8, u8)>`, which the codec does not encode:
the writer writes its calldata (the length, then each plan and theme), a test holding it to the ABI. The board's look chosen at
the top of the page is kept on this device (`paved.theme.v1`); the board reads it since P11a: see "As built (P11a)".

**As built (P11a).** `/settings` keeps the device settings under one versioned key, `paved.settings.v1` (`data/settings.ts`, on
`data/device-store.ts`: `localStorage` read with try/catch, an in-memory twin once storage throws, one store shared by every
component that reads it, so a change applies at once). It holds `quality` (`"auto"` by default, `"low"`, `"medium"`,
`"high"`), `sound` (on), `music` (on, P-81), `musicVolume` (0.4), `tilePreview` (on) and `placementHighlight` (on); a text that does not parse, or a
field of the wrong kind, is that field's default. *Graphics quality* is a row of Auto, Low, Medium and High: Auto shows what
it resolves to on this device: Auto (Medium) on every device (Low on a low-power one); High only by hand, and
High carries a line that it is heavier. The three board pages pass `{ quality }` to `BoardViewport`'s `settings`, kept as one
object while the quality does not change; `GameCanvas` calls `GameScene.setSettings` when it changes, which re-applies the
look, the antialiasing and the pixel-ratio cap, so an open board changes without a reload. *Tile preview* and *placement highlight* are wired in the board, not the renderer (which has
no switch, and none was added): off, `BoardViewport` hands the canvas no ghost, or no lit slot. The plan view (the fallback
without WebGL) still lights its slots. *Sound* is stored only: the app plays no sound effects yet. *Music* is the player below (P-81), not yet mounted in the app. *The account* is the
wallet's: the controller username, or the short address, with Disconnect (the wallet's own, then Home with `?ref=` kept), and
a guest sees Connect; the links to Theme and Referral keep `?ref=`; the version line is the package's, bundled by the build.
The shell's footer (Disconnect beside the D-15 notice) was removed by #536: Disconnect is in Settings, the notice on the Credits page.

**Music (P-81, components first).** The 16 tracks live in `packages/app/public/music/` (URL-safe names, `00-endless-kingdom.m4a`),
served as static files and streamed: never imported, bundled or prefetched. `lib/music/player.ts` (its own lazy chunk, loaded
by `MusicProvider` when it mounts) makes two `<audio>` elements with `preload="none"` and no `src`; the first track is
requested only after the first user gesture (`pointerdown`, `keydown`, `touchend` or `click`, the autoplay rule). The playlist
is a shuffled pass over all tracks, then another whose first track is never the one just played (`createShuffle`). The next
track starts 2 s before the end on the idle element and the two `volume`s cross, driven by the outgoing track's own clock
(no Web Audio graph; iOS Safari keeps `volume` at 1, so there the fade is a cut and the slider has no effect). A hidden tab paused
both elements until #712: the music now plays on whatever tab is shown (below). Reduced motion has no effect on music.
`music` (on) and `musicVolume` (0.4) sit in `paved.settings.v1`; the Settings "Music" row is a switch with a volume slider
(`elements/music-setting.tsx`), and `containers/music-player.tsx` is the player (play or pause, next, volume, the title from
the file name, the time). No route or shell mounts the provider yet: only the stories do.

*The settings player (#569).* `containers/music-player.tsx` is now a card in the Sound group of the shared settings panel (the
Settings page and the board's sheet): the track's thumbnail, its title, a thin progress line with the time, and Previous,
Play or Pause, Next; the Music slider above it is its volume. The titles are the album's (`TRACK_LIST` in `lib/music/tracks.ts`;
`trackTitle` reads a file name only for a track not listed). The images' originals are sources in
`packages/app/music-sources/`, never shipped (neither by the app nor by the Storybook, which serves `asset-sources/` whole); `scripts/compress-music-art.ts` writes square WebP copies named after the
tracks, `public/music-art/128/` (the 64 px thumbnail, loaded lazily when the player shows) and `512/` (the lock screen). The
player keeps a history: `previous()` goes back through it with the crossfade (at its start, to the start of the track) and
`skip()` forward again before drawing a new track. Pause is the setting, as before: it sets the music volume to 0 (remembered
after a reload) and resume brings back the level before; while it is off, Previous and Next still change the track. The Media
Session (`lib/music/media-session.ts`, in the audio engine's chunk) shows the title, the album "Paved" and the artwork, and
takes play, pause, previous and next from the lock screen and the headphones; a play from the lock screen is a plain resume.

*The music in a hidden tab (#712).* The music plays on while the tab is hidden: another tab shown, or on a phone another app
or the lock screen. The player no longer listens to `visibilitychange`. The audio engine keeps its `AudioContext` running in a
hidden tab while the music plays, and suspends it there when nothing plays (the music off, or not started); the sound effects
stay silent in a hidden tab. A browser may tick the fade less often in a hidden tab; the fade follows the outgoing track's
clock, and `ended` still starts the next track.

*The viewer's opt-out (PM, 2026-10-16).* `paved.theme.v1` is the switch of the players' skins: `"default"` shows every board
(Challenge, Training, the tutorial, the hand) on the base models, whoever's game it is, and `useBoardSkins` then returns
`NO_SKINS` and reads nothing, so the renderer asks for no variant and no skin model is downloaded; any other value
(`"forest"`) shows the players' skins as before. Nothing stored is `"forest"`: the skins show until the viewer opts out. The
values stored before P11a are readable as they are (`"default"` was only ever written by choosing Default), so there is no
migration. Two rows read and write that one key, in the same words, "Show players' skins" with a line that it saves data and
graphics work: on the theme page, above the cards (choosing the Default card is the same opt-out), and in Settings.

**As built (P10).** The Vault on main is not the plain staking vault of 6.5's first read: `contracts/src/systems/vault.cairo`
is an OpenZeppelin ERC4626 over PAVED (vPAVED, 18 decimals, offset 0) with an exit fee (`exit_fee` bps, 5 % at launch, at most
10 %, kept for the holders who stay), 1,000 PAVED of dead shares and votes once delegated (`docs/architecture/vault-share.md`
and its addendum). The page follows the contract, not this document's first row (no `stake`, `unstake`, `claim`, `pending`,
no dividend: the rate is the reward). `@paved/chain` reads it behind `VaultViews` (`economy/vault.ts`), which `EconomyViews`
extends and `RpcEconomyViews` and `FakeEconomy` implement, so a later share token swaps in behind it: the position (`vault`:
`balance_of`, `convert_to_assets`, `max_withdraw`, `exit_fee`, `total_assets`, `total_supply`), `maxRedeem`, the three
previews, `delegateOf` (`delegates`, null when not delegated) and PAVED's `balance_of`. The rate is `vaultRate`, OpenZeppelin's
`(total_assets + 1) / (total_supply + 1)`; `withdrawFee` and `redeemFee` are the Vault's two exit fees, rounded up as it
rounds them. `/vault` shows the vPAVED, its PAVED value, the share of the Vault (`shares / total_supply`, the dead shares in
the supply), the rate, total assets, the exit fee, what leaves now (`max_withdraw`), the delegate (read only: no delegate
write) and the wallet's PAVED. The field is PAVED, parsed exactly to a bigint of 18 decimals (digits, one point, at most 18
decimals; anything else is no amount) and never a float; Max writes the exact base units back (`exactUnits`). Deposit shows
`preview_deposit` and sends the approve of exactly the amount to the Vault and `deposit(amount, self)` in one multicall, so
the wallet asks once for both. Withdraw shows the PAVED received, the exit fee on top (`withdrawFee`) and `preview_withdraw`'s
vPAVED before it is sent, then `withdraw(amount, self, self)`: the player thinks in PAVED and gets exactly what they typed.
Withdraw all is `redeem` of every vPAVED, its fee (the value less `max_withdraw`) shown first: it burns exactly the balance, so
nothing is left behind by a rounding. Each exit is sent only at the exit fee the player saw (`VaultExitFeeChangedError`): the
rate only rises between a confirm and a send, the owner's `set_exit_fee` is the one change that can turn against the holder.
The writer reads the wallet or the position again at send and refuses, typed: `VaultZeroSharesError` (`'Vault: zero
shares'`), `VaultOverMaxDepositError` (`'ERC4626: exceeds max deposit'`, out of reach while the Vault sets no limit),
`VaultOverMaxWithdrawError` and `VaultOverMaxRedeemError` (`'ERC4626: exceeds max withdraw'`, `'... max redeem'`),
`VaultAllowanceError` (`'ERC20: insufficient allowance'`), `VaultBalanceError` (`'ERC20: insufficient balance'`, and before
sending), `VaultAmountChangedError`; the constructor's and the owner's reverts and `mint`'s are out of the client's reach. No
Vault entry point and no PAVED approve is a session policy (P-65: no token approve in the session):
the deposit needs the approve, and `withdraw` and `redeem` take a free `receiver`, so a session key could send a holder's
PAVED anywhere; each prompts. The states: a guest's Connect, the loading shape, a failed read with Retry, nothing deposited,
not enough PAVED and over `max_withdraw` (refused before any send), pending (the button waits; the line says what the wallet
asks), refused (the writer's message, the amount kept), done (the receipt's `Deposit` or `Withdraw` moves the position and the
wallet in the cache, then they and the previews are read once). The writes are the sources' `vault` (`data/vault-client.ts`,
loaded at the first write); the route's chunk imports `@paved/chain` as types only.

`/referral` shows the player's link, the app's origin with `?ref=` and their address (`0x`, no padding; `withRef` keeps it on
every link, and the purchases send it as the referrer), with Copy and, where the browser has a share sheet, Share; the share
of a price from `split_bps` (games and packs alike); and what the link earned from the indexer's `/v1/players/:id/referrals`
(IX-COBBLES2), whose id is the player's address, the signer's (D-25 (E): a player is the wallet address). The answer is two
sums, not a list: the games' (`Purchased`) and the packs' (`Sold`) count and referral in USDC, read as exact bigints, the
total checked against them (`IndexerClient.playerReferrals`). The scene's list of each purchase became those two rows. A
failed read shows Retry inside the earnings and never hides the link; a guest connects; nobody yet has its line.

**As built (SKIN-RENDER).** The board draws each tile with its player's active skin (5.6): a Challenge board its game's
player's, Training and the tutorial the connected player's (a guest's, the base models), one variant per tile by origin/dev's
hash of the plan, the cell and the game. The variants load lazily, only those the board and the hand show; theme 0, a theme
the manifest does not list, a failed skin read and a variant that fails to load all draw the base model, and the board never
waits for the skins. Since P11a the device's theme (`paved.theme.v1`) is the viewer's opt-out of all of it ("As built (P11a)"). What a player's
Forest set downloads is in 4.2.

**As built (Q-POLISH-A).** The token is **PAVED** (symbol PAVED, "Paved Token") and the Vault's share **vPAVED**; the `$TILE` of D-2 is
gone from every text, story, mock and test of the app (`TOKENS` in `elements/amount.tsx` repeats `PAVED_LABEL` and `VPAVED_LABEL`,
and `tokens.test.ts` checks that they agree; `app-web`, the v1 client, keeps its own text). The notes the reviews deferred:

- *Purchase.* An unknown purchase's "sent N min ago" counts from the send (the record written when the send starts), not from the outcome. Retry and Dismiss
  are disabled while Retry is fetching (`hold.retrying`). When storage is full or refused, the record holds in this tab only
  (the cache's copy): the notice says so and which tab holds Pay, it does not try to reach other tabs. A send that lands after a change of
  player is kept for its sender (`purchaseReady`, in the cache), and the page says "Your game is ready" with Open game. The wallet has
  `PURCHASE_TIMEOUT_MS` = 5 minutes to answer (a prompt read, signed and included takes a minute or two; a shorter limit would call a slow
  honest send unknown): past it the mutation rejects with `PurchaseTimedOutError`, shown as the unknown outcome with no hash (nothing to
  record or to check by receipt), and the writer's own "Another write is pending" refuses a second send while the hung one holds the account. The send is not cancelled: its late answer is handled as an in-time one (an outcome-unknown hash is recorded under the sender and holds Pay; a success is kept as the sender's ready game; a refusal or success clears the timed-out state, only for its own send: each timeout is tagged with a send id, and a Buy again's busy refusal is cleared by the late answer of the send that held the writer). The ready game is kept without expiry until it is opened or a new purchase starts.
- *Over.* The settle mutation stays pending until the terms are read again, so after a receipt with no `Settled` (someone settled first)
  a second tap sends nothing.
- *Theme.* After a save whose receipt could not be read, the active set read again drops the changes it already holds (`dropSavedChanges`).
- *Settings.* The device store clears its in-memory twin after a later successful write. `data/settings.ts` no longer imports
  `@paved/renderer`'s barrel as a value: measured at the build, it put three.js in the settings data chunk (805,777 bytes, now 1,134);
  `SMALL_SCREEN_PX` and `autoTier` are repeated and `device-settings.test.ts` checks them against `resolveQuality`. Only `version` is read from `package.json`.
- *Board.* The plan view (`BoardMap`) lights its slots only while the placement highlight is on; off, they stay buttons, drawn plain.
- *Tutorial.* `useTutorialRun` builds its `TutorialRun` in a lazy state initialiser. A lazy initialiser does not stop React from rendering a first mount it then discards (two
  inits and one commit, measured with the page preloaded, as with a `useRef`), so the test counts engines from the committed page.

*Removed by D-29 (#623, 2026-10-20): the pages, scenes, hooks and mocks below left the client, the routes redirect to Home; the
indexer's endpoints and `@paved/chain`'s reads stay for the leagues. Kept as the record of P8.*

**As built (P8).** `/leaderboard/:day?` and `/player/:id` (under Ranks) read the indexer. The leaderboard's day is the chain's
`currentDay` (the browser's clock until it answers; nothing is read before the chain has answered or failed), a later day or a
non-number is today, and the picker goes no earlier than the indexer's first tournament (`useFirstDay`, which walks
`/v1/tournaments`). Rows come 20 a page; "Show more" reads the next page under its own key (`useLeaderboardPages`), and the pages
start again at the first on another day. The connected player's row (the wallet's address) is outlined, and read apart
(`/v1/players/:id/tournaments/:day`) and shown after the page when it is not on the pages read. A row opens `/player/:id`, which
shows the profile, its rank today, the stats and the last 20 games, and whose Back is the previous page of the app, the
leaderboard when there is none; an id that is not an address below 2^252 is the not-found page. The lag (`useIndexerLag`, from
`/v1/head`) is a quiet "Up to date" or "Updated N blocks behind" line under the rows, a warning once the indexer is behind by
more than the client's `maxLag` ("scores may be late"), and "Stale" next to a refresh that failed while the rows stay.

*The free mark.* A leaderboard row's and a game row's `free` (cobbles v1: the day's best game, or the game, was bought with a
credit, `GameSpawned.price` 0) puts a "Free" badge on the ranking's rows, the home's top 3 and the player's games. `@paved/chain`'s
indexer client parses it (`LeaderboardEntry.free`, `IndexedGame.free`): absent (an indexer before cobbles v1) reads false, a present
non-boolean is a bad answer; the fixture serves a free best game and a free game. The scenes' `free` list stays (it wins when
given); without it a row's own `free` decides (`data/free.ts`), so the home page needs no change. The tests check the mark against
the fixture indexer, with no wrapper.

*The closed-day rule (P2's review note).* `useLeaderboard`'s cache used to be final once the browser's clock passed `endTime`,
which can cache a day before the indexer has ingested its last blocks. The cached read now carries `closed`: the indexer's served
block (`head.timestamp`) is at or after the day's `endTime`. Only then is the page final (`staleTime: Infinity`); a read made
before that is stale at once, so the next mount, focus or retry reads it again. `leaderboardQuery` (`data/leaderboard.ts`) holds it;
`useLeaderboard` (the home's top 3 too) and the pages share it.

Every session (Training, Tutorial, Challenge) keeps its engine state between moves and replays the moves only on
resume (the PM, 2026-10-14).

Until a scene is routed it adds nothing to the app's JavaScript, but Tailwind v4 scans every source file of the
package, so its classes are in the app's CSS from the scene's PR on (SC1: 39,777 to 56,158 bytes, 8,055 to 10,622
gzipped); Q3's bundle budget counts it.

### Phase 3: polish

**Q3 (d): the bundle budget and the route prefetch** (Q3-BUNDLE). `scripts/bundle-budget.ts` measures `dist/` and holds it to
`scripts/bundle-budget.json`, the one place for the figures; `bun run build` runs it last, so the client job fails on a build over
budget, and the message names the metric, the unit, the figure and the limit. Sizes are raw bytes and `gzip -9` bytes of the
files of `dist/assets` (not the source maps). The limits are the measured sizes plus 2 %, rounded up to the next KiB:

| Metric | What it counts | Measured raw / gzip | Limit raw / gzip |
|---|---|---|---|
| `entry` | the module script of `index.html` | 273,124 / 83,701 | 279,552 / 86,016 |
| `largestRoute` | the biggest page chunk of `src/routes/pages` (`board`) | 854,735 / 244,650 | 872,448 / 249,856 |
| `firstLoadJs` | the entry, the chunks `index.html` preloads, the `home` chunk and what those import statically | 537,586 / 181,633 | 548,352 / 185,344 |
| `css` | the stylesheets of `dist/assets` | 65,462 / 11,961 | 67,584 / 12,288 |
| `fontAwesome` | the three scripts of `dist/fontawesome/js` | 92,910 / 33,332 | 95,232 / 34,816 |

A limit moves in the pull request that needs it, with the reason; a smaller build does not move it by itself (lower it by hand
when a cut lands). `board` is the renderer, three and the engine, and is fetched only for a game.

**What is lazy, and why** (FIRST-LOAD). The first load of `/` fetches no game engine, no hashing under it (`@scure`, `@noble`)
and no chain or wallet library: 181,633 B gzip (537,586 raw), from 213,838 (657,850 raw), and its limit is the new figure plus 2 %. The chain client, the economy, the wallet connector and the controller are
`import()`ed at the first read or connect (`routes/sources.ts`, `wallet/wallet.tsx`). The engine is the one chunk `engine`
(`vite.config.ts`: `@paved/game-core` apart from its formatters, its barrel and the device's storage): the boards, the
Training and the end screen share it. The home card reads nothing of Training since #718 (no save, so no "Resume" line):
`data/training-save.ts` and its `import()`ed `data/training-resume.ts` left with the save. Two settings keep it so: the
bundler treats `game-core/dist` as free of side effects (the package declares none, and one imported name would keep its
whole barrel), and an `import("@paved/game-core")` is never written in the first load (it makes the barrel's namespace and
with it the engine): a lazy module names what it needs. `__tests__/first-load-modules.test.ts` reads the source maps of the
first load of a build and fails when the engine, the hashing or the chain libraries are in it.

**What is lazy on the board** (BOARD-CHUNK). The board's route chunk (`board`, the biggest page) is 870,731 B raw and 249,379 B
gzip, from 900,445 and 259,490: its limit is the new figure plus 2 %, rounded up to 256 B (888,320 / 254,464). By module (gzip,
from the build's source maps), the chunk is three (`three.core`, `three.module`: 112 kB), `SMAAPass` (34 kB: its two lookup
images), `GLTFLoader` (13 kB), the meshopt decoder (7 kB), then the renderer's own code (`TileRenderer`, `placement`,
`GameScene`, `outlines`: 20 kB) and the page (4 kB). Moved out: the Surrender dialog (`containers/surrender-dialog.tsx`, with
`ui/dialog` and Radix's dialog, focus scope, dismissable layer and scroll lock under it: 10.7 kB gzip), which `BoardScene`
`import()`s through `lib/deferred.ts` when the player first taps Surrender, or when an expired game opens it by itself, and
fetches 3 s after it mounts, once the browser is idle and the connection allows it (`prefetchAllowed`), so a tap finds it in
the cache. A load that fails (`useDeferred`) closes the dialog and says so in an error toast, not in the route's error boundary.
Kept: the plan view (`containers/board-map.tsx`, 1.6 kB gzip), because it is the board where the canvas cannot start, and a
second fetch there would fail with the models; nothing else of the app's own code is large (the tutorial's end and the closing
feed are under 1 kB each). The largest block left is the renderer's, which `packages/app` cannot split: `SMAAPass` is imported
statically by `Effects.ts` and used only where multisampling is missing (software WebGL), and loading it on that path is a
change of `packages/renderer` (a follow-up, after DAYNIGHT). `__tests__/board-modules.test.ts` reads the board chunk's source
map in a build and fails when the dialog or Radix's dialog is in it. The load trace (5.8, `/training`, cold, VPS, software
WebGL, medians): desktop, 20 runs a side in ABBA order, the first 3D tile 964 ms before and 982 after, the board's first frame
1,891 and 1,825; phone profile, 9 runs a side, 4,102 and 4,170, 5,057 and 5,382. The same within the run-to-run noise (a
side measured second in a pair read 100 to 400 ms slower in every pair measured, which the ABBA order removed). The build
re-chunks the shared motion code (first load +709 B gzip, 182,344 against 181,635, within its limit).

Route prefetch (`src/routes/prefetch.tsx`, `page-loaders.ts`): the pages' `import()`s are one table, shared by the router's
`lazy` and the prefetch, so a prefetch is the page's own fetch. (1) Once the shell has rendered and the browser is idle
(`requestIdleCallback`, or 200 ms later where it cannot tell), the five tab pages' chunks are fetched, one per idle slot. (2)
`PrefetchOnIntent` wraps a page whose buttons lead elsewhere and fetches their chunks when the pointer first goes over it or
focus first lands in it: Home prefetches `/play` and `/play/challenge`, and `/game/:id` when a game is in progress (Resume); Play
prefetches `/play/challenge`. The scenes navigate from buttons, not links, so the part hovered is the page, not the
button; a button-level hint needs a `data-prefetch`-style attribute in the scenes, which this change did not touch.
Nothing is prefetched when `navigator.connection.saveData` is set or `effectiveType` is `2g` or `slow-2g`.

| PR | Content | Estimate |
|---|---|---|
| Q1 | Motion pass on every interaction; reduced motion checked | 1.5 d |
| Q2 | Accessibility: Storybook a11y tests in CI, keyboard paths, focus | 1.5 d |
| Q3 | Performance: (a) the bench on the new app against P-7b (the Mac's headless rule); (b) added by the PM: re-measure placement latency on the GPU, against a 100 ms click-to-shown target; (c) the first paint with the icons (F4's Font Awesome): a subset of the owner's files; (d) a bundle budget and route prefetch. **(c) and (d) done by Q3-BUNDLE** (2026-10-16, section 8 and below); (a) and (b) wait for the Mac with LIGHT-GPU. **Q3-GPU** (2026-10-16), the GPU part of (a) as the PM scoped it, **done**: the phone's MSAA memory measured and cut by half (4x kept, one multisampled target, the canvas without multisampling: 172 to 84 MiB of GPU memory at 360 x 740, 5.2), and the desktop cap re-measured with the tiers (1.5 to **1.75**, 5.5). The board's p95 on the new app is in 5.2 and 5.5; placement latency (b) is not measured yet | 2 d |
| Q4 | The Forest theme from the extended tiles (the renderer picks the variant per tile, as `origin/dev`'s `getVarietyModelPath` did). **Done by SKIN-RENDER** (2026-10-16, 5.6) | 2 d |

Total, an **estimate**: about 12 days for the foundations, 23.5 for the pages (5.5 of scenes, 18 of wiring), 7
for the polish, one thread at a time; phases 1's F3–F6 and phase 2's SC2 and P2 can run in parallel threads.

---

## Decided for the owner (summary)

Each is reversed by the owner's word; the section says what else would reverse it.

1. Gold `primary`, meadow `secondary`, river `tertiary`; the ink neutral from the mockups (2.2).
2. Dark only, with a slot for a light theme (2.2).
3. Rubik Mono One for display, Inter for the UI, both self-hosted from npm (2.3).
4. Tailwind v4 rather than the references' v3 (3.1).
5. Motion, lazy-loaded (3.2).
6. TanStack Query + zustand + the engine session as the three owners of state; React Router 7 (3.3).
7. Breakpoints 360 / 640 / 1024 / 1440 px on a 320 px base (3.4).
8. Five bottom tabs: Home, Ranks, Quests, Vault, Settings; Theme under Settings (6.1). Since D-29: Home, Missions, Play (the
   centre, icon only), Vault, Settings; no ranks.
9. A new `packages/app` beside app-web, app-web removed at the cut-over (7).
10. Font Awesome Pro 6.6.0 from the owner's files, loaded after the first frame and drawn by React (8).
11. Prediction with at most two unconfirmed moves; the chain wins on a mismatch (9).

## For the owner (reserved: a licence)

- **Font Awesome Pro: answered (owner, 2026-10-14).** The owner holds the licence and pushed the files at
  `21788fb`; v2 uses Pro 6.6.0 from them (8). No registry token is needed. Still the owner's: one more file if a
  thin icon beyond `spider-web` is wanted, since `thin.min.js` holds only that one (8).

## For CORE (through the PM, P-57 B9)

1. A view of a game's initial seed (or its salt): `initial_seed(game_id)`; `tiles()` kept in draw order
   with statuses (9.4).
2. The 24 h validity: today only the reward expires; whether moves are refused after 24 h (6.5).
3. The parity table with Glitchbomb's prices and stake bonuses; five figures already match (6.5).
4. The vault's share token (vPAVED), as designed in `vault-share.md` (6.5).
