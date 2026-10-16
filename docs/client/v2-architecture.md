# Client v2: the benchmark and the architecture proposal

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

**Read (measured from the mockups,** `app/docs/mockup-01.png`, a 5×5-pixel mean per point): the gold of
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
`app/public/assets/fonts/RubikMonoOne-Regular.ttf` is the only font file in the repository.

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
- **Persistence.** Settings and the Training save stay in `localStorage`; the query cache is not persisted
  (chain data must be fresh).

**As built (P2).** The sessions are in `@paved/game-core` (`src/sessions/`): `PageSession` and `PageState` (structural
copies of the chain's shapes, since `@paved/chain` depends on game-core; `GameSession` satisfies them unchanged, and app-web's
`tsc` catches a drift of the chain's shapes through the state and the senders),
`LocalSession` with its save (`paved:training:v1`) and `randomSeed`, and the tutorial run with its save
(`paved.tutorial.v1`), both formats unchanged. `LocalSession` and `TutorialRun` keep their `EngineGame` between moves and
replay only to resume (and the tutorial on Back, the engine having no undo). App-web imports them from there.
The v2 app's data layer is `packages/app/src/data/`:

| Module | What it holds |
|---|---|
| `keys.ts` | `queryKeys`, every key of the app: `['chain', read, ...args]` for a view or event read, `['indexer', read, ...args]` for the indexer, `['local', 'trainingSave']`; addresses normalised by `addressKey`, no bigint in a key |
| `sources.tsx` | `DataProvider` and `DataSources`: the game views, the event reader (`playerGames`), the economy views and the pool quoter (null without an economy), the indexer client, the Training store |
| `chain.ts` | `useSpawnPaused`, `useEntryPrice`, `useGame`, `usePlayerGames`, `useActiveGame`, `useQuote`, `useSplit`, `usePoolQuote`, `useTerms`, `useEconomyDay`, `useVaultPosition`, `useUsdcBalance`, `usePavedBalance` |
| `indexer.ts` | `useLeaderboard`, `useTopThree`, `useLeaderboardEntry`, `usePlayerProfile`, `useIndexedPlayerGames`, `useIndexedGame`, `useDefinitions`, `usePlayerQuests` (progress joined with each definition's schedule), `usePlayerAchievements`, `usePlayerStatus` |
| `training.ts` | `useTrainingSession` (the board's session: `LocalSession` read with `useSyncExternalStore`, and `boardOf` for the scene), `useTrainingSave` (the home card) |
| `scene-types.ts` | compile-time checks that each hook's data is its scene prop's type |

Each hook returns the type its scene's prop takes; where the indexer's type differs, the hook maps it (the quests'
schedule from the definitions; a new player's null profile as an empty one). A past day's leaderboard and a closed
economy day have `staleTime: Infinity`. No hook polls; the writes (P5, P7, P10) update these keys from their receipts.

**Decided for the owner:** React Router 7 (data mode, lazy routes) rather than TanStack Router: already in
the repository and in both references. Reversed if typed search params become a pain point.

### 3.4 Breakpoints

Mobile first: the base styles are the small mobile; each breakpoint adds.

| Name | From | Devices | What changes |
|---|---|---|---|
| (base) small mobile | 320 px | iPhone SE, small Android | one column; the bottom navigation shows icons only; the tile hand is a compact bar (tile, rotate, place); 14 px body text; page titles 20 px |
| `mobile` | 360 px (22.5 rem) | most phones | bottom navigation with labels (the mockups); hand panel as in the mockups (tile preview + Place / Discard); 16 px body |
| `tablet` | 640 px (40 rem) | large phones landscape, tablets | lists and cards in two columns (quests, achievements, leaderboard + player); the board's hand panel becomes a floating card at the bottom right; dialogs centred instead of bottom sheets |
| `desktop` | 1024 px (64 rem) | laptops | the bottom navigation becomes a left rail; the board takes the centre with a right panel (score, tile in hand, placement preview, actions); hover states and keyboard shortcuts shown (R rotate, D discard, V camera) |
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
exception. The CI `client` job runs it.

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
sweep, so the CI `client` job covers both. A date shows weekday, month
then day, on a 24 h clock (the former en-GB order is gone).

One error component (ERR-UI, P-67). Every error the app shows, a failed read, a refused write, a refused input, an error
toast, goes through `InlineError` (`src/components/elements/inline-error.tsx`): the `triangle-exclamation` icon, `text-sm`
in the body font, the `destructive-text` token, two lines at most then an ellipsis (the whole text in its `title` and for
screen readers), and a Copy button that puts the message and its detail on the clipboard as plain text for support: the
typed error's name, the transaction hash, the game id, the app version and the UTC time. The component reads nothing: the
route builds the detail (`src/routes/error-detail.ts`, from a `@paved/chain` error's `name` and `transactionHash`) and the
scene passes it down as a prop. A host renders it always, with `message` null when there is no error, so its height
animates as the error appears, changes or goes (Motion, 0.18 s, none under reduced motion); an error that replaces a page's
content mounts with the same animation. An error with no place on its page (a failed claim, a free game that did not
start, the wallet's connect) is a toast that holds `InlineError` (`containers/error-toast.tsx`), never Sonner's own error
style. A `Notice` is a state (a guest, purchases paused, the economy not deployed, storage off, an outcome to check) and has
no danger tone. `__tests__/error-guard.test.ts` fails on an error role, a `toast.error`, a danger `Notice` or the error
token outside `InlineError` and a listed set of non-error uses, under `src/components` and `src/routes`, and is tested on a
fixture that must fail.

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
from `/renderer-assets`) and app-web's `public/` at `/app-web-assets` (plain models, the original tile images, the Draco decoder:
the stories with no manifest). Storybook copies the entries at once, and two copies creating one folder raced on `mkdir`
(`EEXIST`, three CI failures, SB-COPY), so no two entries write a folder in common: `build-storybook` runs the check first and
`__tests__/storybook-static-dirs.test.ts` covers it.

The sidebar follows the tiers:

| Section | Stories |
|---|---|
| **Foundations** | Colors (every scale 50–950 with its hex and OKLCH, then the semantic tokens on their real backgrounds, with the contrast ratio), Typography (each family, weight and size step, the tabular numbers), Icons (the Font Awesome set in use), Motion (button press, tab indicator, sheet, toast, with reduced motion on and off), Spacing and radius, Breakpoints |
| **UI** | every shadcn primitive in every variant and state (default, hover, focus, disabled, loading) |
| **Elements** / **Containers** | every game component, one story per state (for example the hand panel: empty, a tile, pending, refused) |
| **Tiles / Base** | the 19 base tiles of `packages/app-web/public/models/` (the models the game plays), each rendered by the real renderer in a small canvas, rotatable through the four orientations, with its plan code and its 2D PNG beside it |
| **Tiles / Extended** | the 144 variant models of `origin/dev` (`<plan>_LF_<n>` and `<plan>_HF_<n>`: low and high forest density, 1 to 9 variants per plan, PR #162, 2024; to be brought over from that branch, never merged) and the 18 2D tiles of `app/public/assets/tiles/` that the 19-model set lacks; grouped by plan. Folder: `packages/app-web/public/models/extended/` (the 2D tiles in its `tiles/`). The variants are Draco-compressed: the renderer's `AssetLoader` decodes them lazily, with the decoder self-hosted at `<basePath>/draco/` (`packages/app-web/public/draco/`). `origin/dev` has 38 2D tiles, 20 of them in the 19-model set (`00.png` included), so 18 lack a model. |
| **Board** | the board on recorded boards (the bench fixtures at 38 and 72 tiles), with the outline width control (section 5) |
| **Scenes** | each page of section 6 on fixtures, one story per state, shown at the full width of the preview by default, and at the width Storybook's own viewport toolbar picks (mobile 360, tablet 640, desktop 1024, wide 1440); no frame, no `viewport` arg |

**The background (spec A):** the board's colour, `--board` = `#07111A`, set as Storybook's only
background (`parameters.backgrounds`), and the Storybook UI itself themed dark (`storybook/theming`
`create({ base: "dark", appBg: "#07111A" })`).

### 4.2 Hosting at `storybook.paved.bal7hazar.com`

- **Build:** `bun run --filter @paved/app build-storybook`, which runs `storybook build -o
  storybook-static`. **Output:** `packages/app/storybook-static/` (a static site: `index.html`,
  `iframe.html`, assets).
- **Publish:** the client's existing `deploy/indexer/publish.sh` already takes its root from `WWW_ROOT`,
  so the Storybook needs no new script:
  `WWW_ROOT=/var/www/paved-storybook publish.sh packages/app/storybook-static <release-name>`, run as
  the `claude` user; the release name (`YYYYMMDD-HHMM-<short sha>`) and the whole sequence are in
  `docs/client/storybook-hosting.md`. It copies to `/var/www/paved-storybook/releases/<release-name>`, swaps `current`
  atomically and keeps five releases; `switch.sh` rolls back the same way.
- **Root step, prepared by the PM (P-57 B7):** done once by the owner's root block (web root, Caddy site, first
  release). The Caddy site is in the repository, `deploy/storybook/paved-storybook.caddy`; the release command
  sequence, its check and its rollback are in `docs/client/storybook-hosting.md` (F5). The site the block installs
  has `Cache-Control "no-cache"` on everything, not the `/assets/*` immutable rule this section first proposed.

- Storybook is public, like the client. It holds no secret: fixtures only, no RPC URL beyond the public
  ones, no controller.

- **The app's own build serves the board's 3D assets too (ASSETS, 2026-10-15; compressed, hashed and ordered by
  ASSET-WEIGHT, 2026-10-15).** Under `<base>renderer-assets/` (Vite's `base`), no request leaving the app's origin:
  - **Models, the app's own copy, compressed and content-hashed:** `packages/app/scripts/compress-models.ts`
    (`node scripts/compress-models.ts`; `--check` fails when the committed copy is stale, and a test runs it) reads
    app-web's 19 base models (`packages/app-web/public/models/<plan>.glb`, unchanged) and writes
    `packages/app/public/renderer-assets/models/<plan>.<hash>.glb`, the hash being the first 10 hex digits of the file's
    SHA-256. Per model: vertices renumbered by first use (triangles and their order kept); `KHR_mesh_quantization`, every
    attribute normalized (positions 8-bit, one voxel step per integer, exact on the 0.1 grid; `sfrfrfffr` has one vertex
    off the grid and takes 16-bit positions, within 6.0e-5; normals 16-bit; UVs unsigned 16-bit); then
    `EXT_meshopt_compression` (vertex and index codecs, no lossy filter). The script decodes each copy and checks it
    against its source (largest moves on the grid: position 6.1e-6, normal 0.001 degree, UV 7.6e-6), and a test checks
    that the renderer's outline builder finds the same segments in every copy as in its original. Positions are
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
    app-web's folder whole), loads `models/<plan>.glb`. A network or server error is tried twice more (after 250 and
    1000 ms), then the scene does not start and the page shows its plan view. Dev still answers those plain names from app-web; the build ships no original model and no Draco
    decoder.
  - **The Forest models (P11b, 2026-10-16),** theme 1 on chain (`Setup`'s skins, cobbles v1, part 3): the 72 high-forest
    variants of `packages/app-web/public/models/extended/<plan>_HF_<n>.glb` (every plan has one to nine), written by the same
    script into `packages/app/public/renderer-assets/models/forest/<plan>_HF_<n>.<hash>.glb`. The low-forest set (`_LF_`) is
    kept for a later theme and not written. Those sources are Draco-compressed: the script decodes them with app-web's
    self-hosted Draco decoder (`public/draco/draco_decoder.js`, the renderer's own copy, run in Node: no package added). They
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
 (19, the plan view's and the tile chips'), from app-web's `public/` under their
    plain names, served in dev and copied at build.
  - **Tile images, the app's own 256 px copy, content-hashed (TEX, 2026-10-16; PM ruling of that day: 1680 px was too
    much):** `packages/app/scripts/compress-tiles.ts` (`node scripts/compress-tiles.ts`; `--check` fails when a committed
    copy is stale, comparing decoded pixels and not bytes, so a zlib update cannot fail it, and a test runs it) reads app-web's 19 original 1680 x 1680 PNGs (left untouched) and writes
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
    maps app-web's `public/` itself and still has the originals, which its stories name explicitly (`originalTileArt`). Measured (headless Chromium, software WebGL (SwiftShader), the "Renderer/Tiles" story, 19 plans on one
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
    Drawn, the skinned board costs no frame time (LIGHT-GPU, 5.5; Mac GPU, headless Chrome on ANGLE Metal, outlines on):
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
  - **Measured** (Mac, Chrome headless `--headless=new`, ANGLE Metal; `vite preview` serving `dist`, which sends
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
  outline share. Both keep them now (`packages/renderer/__tests__/face-antialiasing.test.ts`).
- **Memory of MSAA** (estimate from the targets' formats, not measured). Each of the two targets holds a 4-sample
  RGBA half-float colour renderbuffer (32 B/px), a 4-sample 24-bit depth renderbuffer (16 B/px) and its single-sample
  resolve texture (8 B/px): about 56 B/px, so 112 B/px for the two, against 24 B/px for the two without MSAA (colour
  8 and depth 4 each). At a 720 x 1560 buffer (360 x 780 at DPR 2, or the phone-like DPR 3 capped at 2): about 126 MB,
  99 MB more than without. At 2160 x 1350 (1440 x 900 at cap 1.5, MSAA forced on, since `"auto"` leaves it off there):
  about 327 MB, 257 MB more.
- **Near 5.** The camera's near plane goes from 1 to 5 (`CAMERA_NEAR`, `core/CameraController.ts`): about five times the
  depth precision at every distance. "The camera never comes closer than 5" was the distance to its target, on the
  ground; the tallest tile (`wfffffffr`) stands 2.625 units, so at 5 the near plane would cut its top. The closest zoom
  (`minDistance`, `CLOSEST_DISTANCE`) goes from 5 to **8**: 5 + 2.625 / cos 27 degrees (the play camera's steepest tilt)
  = 7.95, rounded up. A test reads every tile model's height and checks it. The shadow camera is the light's own
  orthographic camera (1 to 100), unchanged. The outlines' depth bias (`polygonOffset` -1, -4) is in depth-buffer
  units, so it shrinks in world units as the precision grows; the pan and sweep checks below show no new flicker.

**Frame time** (DPR's and OUT-LOD's method: M2 Max, Chrome in new headless mode on ANGLE Metal, never on screen; the
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
  re-measured on a quiet Mac in Q3. The faster option is no face antialiasing: SMAA costs little at cap 1.5 (11.78 and
  12.71 against 11.72 and 12.64 for off in the same run) but more at cap 2, and changes more of the image than MSAA
  does (below). So desktops keep the faces unantialiased: `"auto"` is off on a fine pointer and a large screen, and
  the cap stays 1.5 (no change from main: off measures as main does).
- **Phone-like profile: MSAA passes.** At cap 2, 7.90 and 8.48, under 16.6 ms with room. So `"auto"` turns MSAA on on
  coarse pointers and small screens. The profile runs on the Mac's GPU, not a phone's (tile-based phone GPUs resolve
  MSAA on chip, often cheaper; estimate).

**Zero flicker** (OUT-LOD's checks; headless Chrome on ANGLE Metal; the outline share is 1 minus the luma with the
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
`multisampling` setting, off by default: it costs 3 to 4 ms of GPU a frame at 1440x900 on an M2 Max for
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
the camera's opening distance, 0.8 of its farthest, 240), recomputed when the viewport is resized: off at
`fadeOffFactor` (0.85) x S, fully on from `fadeFullFactor` (1.15) x S, and between a smoothstep of
`ln(tile px / off) / ln(full / off)` (OUT-FADE, PM ruling 2026-10-16: the toggle at a zoom-out level read as odd, so the
opacity falls as the camera zooms out, ending where the old cut was). On the log of the tile size a wheel step changes
the opacity by about the same amount, and the smoothstep has no kink at either end. The material is hidden below 1/255.
A 360 x 780 phone opens at S = 52 (off at about 44), a 900 px high window at about 60 (off at about 51). The tile and S
scale together with the height, so on every screen the outlines are off past distance 240 / 0.85 (about 282): they
vanish at the farthest zoom (300). **Consequence: at the opening view (S) the opacity is no longer 1**: it is
smoothstep(ln(1 / 0.85) / ln(1.15 / 0.85) = 0.538) = **0.556** (readout of the story: 56 %). The PM's ruling (2026-10-16)
made 1.15 S the default, since the owner called the outline at the opening view perfect and losing two thirds of it would be
the larger change; the other candidate, 1.3 S (`fadeFullFactor` 1.3), gives 0.327 at S (33 %) and stays a preset; it is on at 80 % at 1.15 S. Both are presets of the
story ("fade 1.3", "fade 1.15") next to the two factor controls. Captures
(`captures/out-fade-1_3-*` and `out-fade-1_15-*`, for 1.3 S, 1.15 S, 1.0 S (the opening view), 0.9 S and 0.85 S: the
Outlines story, 1280 x 800, DPR 1, headless Chrome on **software WebGL (SwiftShader), outlines forced on**, `force: "on"`);
opacity read from the story: 1.3 S: 100 % / 100 %; 1.15 S: 80 % / 100 %; S: 33 % / 56 %; 0.9 S: 5 % / 9 %; 0.85 S: off /
off (preset 1.3 / preset 1.15). The default is 1.15.
**The segment cut does not pop there** (OUT-LOD's `segmentOffDevicePx` 0.5 / `segmentFullDevicePx` 1, kept as is): a
voxel's horizontal edge is `tilePx / 40` device px long at least, 1.1 px at the phone's 0.85 S, so it is whole across the
fade; seen from above a vertical edge is under 0.5 px at every zoom, so it is always dropped; from the 27 degree tilt
it fades over a factor of two in length, a small step per zoom step (`outline-segment-cut.test.ts`). No change, no capture.

**Zero flicker and cost (OUT-FADE).** The fade adds no step of its own: the opacity is one uniform, set per frame as before
(`applyOutlineStroke`), so the frame cost is nil (no new pass, no new shader work). Checked on software WebGL here
(headless Chrome on SwiftShader, outlines forced on, 1280 x 800 at DPR 1, preset 1.3 (the first default), the story held; mean luma of the
centre 800 x 500 crop after each step, the outline share being 1 minus the luma with the outlines on over the luma with
them off at the same pose): **zoom**, 12 wheel notches of 20 from distance 282 (the off point) into the ramp: the share goes
0, 0, 0.11, 0.24, 0.41, 0.62, 0.85, 1.17, 1.48, 1.82, 2.19, 2.56, 3.03 points, rising every step with the largest step
0.47 point, no jump that is not the opacity ramp (the luma's own largest step is 0.53 on, 0.57 off). **Pan**: the 12-drag
run did not finish on the loaded VPS (the screenshots timed out under SwiftShader, twice); it is left to the GPU check on
the Mac, which the coordinator schedules. Unit tests cover the ramp's per-step change (no kink at either end).

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
`#53524f` before (written `#1f1f1f`) and `#2b2c29` after (written about `#0f0f0f`). The story's control takes the visible
colour; black stays reachable.
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

- Machine: M2 Max, Chrome in new headless mode on ANGLE Metal, never on screen. The "Renderer/Outlines" story, Held,
  with `redraw` on, on the recorded 72-tile board.
- Per frame: the CPU time of every rAF callback of the frame, plus the GPU time from `EXT_disjoint_timer_query_webgl2`
  around them. Each configuration runs in a fresh browser context: 120 warm-up frames, then 600 measured frames.
- Three rounds, with the caps alternated within each round and the cap order changed between rounds (the phone
  profile in rounds 1 and 2 only). Percentiles are nearest-rank over the pooled frames.
- **Mac profile**: 1440 x 900 at DPR 2. **Phone-like profile**: 360 x 780 at DPR 3, with Chrome's CPU throttled 4x.
  The phone-like profile is an approximation: it runs on the Mac's GPU, not on a phone's.
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

**Zero flicker, no popping.** Headless Chrome on ANGLE Metal, the recorded board, both builds at the same poses.
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

**Frame time** (DPR's method: M2 Max, headless Chrome on ANGLE Metal, the "Renderer/Outlines" story Held with
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
post-processing are what is missing to reach `app/docs/mockup-01.png` and `-02.png`. LIGHT takes over item 3 of 5.2 (the
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

`quality: "auto"` (the default) picks **Medium** on every device (a coarse pointer, a small screen or a desktop), and
**Low** on `EffectsCapabilities.lowPowerDevice`; **High only when chosen by hand**. Medium is the richest tier under 12 ms
on the desktop profile (High is 12.40). On the phone-like profile High fits the time (9.55, under 16.6) but its bloom
shimmers on the gold slots under a zoom or a pan (below), so zero flicker keeps Medium there too: phones gain the AO and
the soft shadows over the former provisional Low. `supportsSSAO`, `supportsBloom` and `supportsVignette` false turn those
effects off whatever the tier. P11a adds the settings row (Low / Medium / High); the render profiles (`play`,
`showcase`, `showcaseCinematic`) now only scale the look's exposure and fog density against `play`'s, and the
cinematic profile's SSAO gave way to the look's AO.

**As measured (LIGHT-GPU, 2026-10-16).** DPR's and OUT-LOD's method: the Mac's GPU, Chrome in new headless mode on ANGLE Metal,
never on screen; the "Renderer/Lighting" story (Mockup, held, `redraw` on, outlines forced on, the gold slots and the
ghost shown) on the recorded 72-tile board; per frame the CPU time of every rAF callback plus the GPU time of
`EXT_disjoint_timer_query_webgl2` around them; a fresh context per configuration, 120 warm-up and 600 measured frames;
nearest-rank percentiles over the pooled frames. Desktop profile: 1440 x 900 at DPR 2, cap 1.5 (2160 x 1350), faces
unantialiased (`"auto"`). Phone-like: 360 x 780 at DPR 3, CPU throttled 4x, cap 2 (720 x 1560), MSAA (`"auto"`): an
approximation on the Mac's GPU, not a phone's. Views: the opening (240, straight down) and a zoomed one (60, straight
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

CPU + GPU per frame, ms, pooled p50 / p95, and the cost against the Off preset (p95):

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
two rounds each, `forest` on against off in the same round), p95 ms:

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

**Zero flicker, outlines on** (LIGHT's check, on the GPU: headless Chrome on ANGLE Metal). Main before LIGHT
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

**Captures (GPU)** in `packages/app/src/stories/renderer/captures/`, headless Chrome on ANGLE Metal, outlines on, 1280 x
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
board at the opening view beside `mockup-01.png` or `-02.png` (read from `app/docs`, which Vite serves: not copied).
LIGHT-GPU added the controls the bench drives: `forest` (Forest on every plan), `force` (the outlines) and
`maxPixelRatio`; `quality` is typed as an enum so a URL can set it (Storybook dropped it from a URL before: its docgen
type was an unresolved union).

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
    no outline, as the ghost's model has none; the ghost's tint and the invalid red apply to it. A plan whose image is not
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
    Chrome on the Mac's GPU (ANGLE Metal), outlines on (retaken by LIGHT-GPU, 5.5). The story's camera looks straight
    down, so the quad's height does not show there.
- **The device's theme** (`paved.theme.v1`, `useDeviceTheme`, "the board's look" at the top of the theme page) is not read
  by the board. The skins are the chain's and belong to a player: a Challenge board shows its player's choice to every
  viewer. What the device choice should do there is a product choice this task does not settle: a viewer's opt-out
  ("Default": draw every board in base models on this device), or the theme a guest's Training board shows. Left as is.
- **Stories:** "Renderer/Skins" (`packages/app/src/stories/renderer/skins.stories.tsx`): the recorded 72-tile board with
  Forest on none, every other plan, or all 19 (a control), and a readout of the variant files fetched. Captures in
  `captures/skins-*.webp`, 1280 x 800 and 360 x 740, headless Chrome on the Mac's GPU (ANGLE Metal), outlines on
  (retaken by LIGHT-GPU). A skinned board has as many shared models as variants shown (up to 52 on the 72-tile board,
  against 19); measured on the GPU in LIGHT-GPU (5.5), it costs no frame time over the base board (within 1 ms, inside the noise).

---

## 6. The page map

### 6.1 Routes

| Page (spec A) | Route | Bottom nav | Notes |
|---|---|---|---|
| welcome | `/welcome` | hidden | first visit only (a `localStorage` flag); the connect button; skip to Training |
| loading | (no route) | hidden | the app's boot screen and every route's `Suspense` fallback; the scene's asset loading inside the board |
| home | `/` | Home | Play button, the Challenge card with today's top 3, Training and Tutorial, the active game to resume |
| play | `/play` | hidden (back) | Challenge, Training, Tutorial (P-57 B4), Multiplayer disabled ("coming soon") |
| purchase | `/play/challenge` | hidden (back) | stake picker 1–10, price, boost, the 24 h validity, the minimum score to beat, confirm; then spawn |
| board | `/game/:gameId` (Challenge), `/training`, `/tutorial` | hidden | the board, the tile in hand, rotate / place / discard, give up |
| over | `/game/:gameId/over`, `/training/over` | hidden | final score, the game's metrics, the reward or "below the threshold", settle when the day allows, Play again |
| leaderboard | `/leaderboard/:day?`, `/player/:id` | Ranks | as today, with the day picker |
| quests | `/quests/:day?` | Quests | the day's quests |
| achievements | `/achievements` | (from Quests, a tab) | split out of today's quests screen |
| vault | `/vault` | Vault | stake, unstake, dividends |
| referral | `/referral` | (from Settings and Home) | the referral link and what it earned |
| theme | `/settings/theme` | (from Settings) | Default (meadows), Forest, then Snow, Desert, Volcano "coming soon" |
| settings | `/settings` | Settings | graphics quality, sound, music, tile preview, placement highlight (the mockups), account, links to theme and referral |

Old links keep working: `/game?mode=challenge&id=N` → `/game/N`, `/game?mode=training` → `/training`,
`/economy` → `/vault`.

**Decided for the owner:** five bottom tabs, Home · Ranks · Quests · Vault · Settings. The mockups' tabs
were Home, Collection, Themes, Settings; Collection is out of v1 (P-57 B5) and Theme moves under Settings
as one of its rows. Reversed if the owner wants Theme as a tab (it would replace Vault, which would move
to Home).

### 6.2 Navigation

- **Mobile and tablet:** a fixed bottom bar of five tabs (icon + label from `mobile`, icon only below),
  safe-area padded; the tab indicator slides (Motion `layoutId`). Hidden on full-screen flows (welcome,
  play, purchase, board, over), which get a top bar with Back.
- **Desktop:** the same five destinations in a left rail with labels; the board keeps the rail collapsed
  to icons so the scene gets the width; dialogs instead of sheets.
- Every page is a route: deep links, the browser's back button, and the referral `?ref=` kept across
  links (nums' `lib/router.tsx` idea).

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
| `components/ConnectionBanner.tsx`, `WalletNotice.tsx` (the D-15 notice) | welcome, settings (account), the app shell's footer |
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
Challenge). `toControllerSessionPolicies` refuses any method whose name holds `approve`, `allowance` or `transfer`
(`increase_allowance`, `transfer_from`...). A paid entry sends `approve(Challenge, price)` and `spawn(stake, referrer,
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
| home | `Challenge.spawn_paused`; the player's open games (`GameSpawned` events) | `/v1/tournaments/:day/leaderboard` (top 3), `/v1/head` | — | the Training save (resume) |
| play | `spawn_paused` | — | — | — |
| purchase | `entry_price`, `Economy.quote`, `quote_swap`, `router`, `rate`, USDC `balance_of`, `Setup.pack`; `Economy.seller` (read at send); writes `approve` + `spawn(stake, referrer, min_out)`, `approve` + `buy_pack(pack_id, referrer, min_out)`, each one multicall and one wallet prompt (neither the approve nor the call that pulls the USDC is a session policy, P-65) | — | — | the referrer from `?ref=`; the hold of a purchase whose outcome is unknown (`paved:purchase-unknown:v1:<kind>:<player>`: its hash, or none for a send the wallet has not answered, written when the send starts, and when it was sent) |
| board | `game(id)`, `tiles(id, from, count)`, the initial seed (section 9); writes `build`, `discard`, `surrender` | — | `EngineGame` (prediction, legality, preview points) | the Training and Tutorial moves |
| over | `game(id)`, `Economy.terms(id)` (reward, `expired`), `day(day)`; write `settle` | `/v1/games/:contract/:id` | the final counters (Training) | — |
| leaderboard | — | tournaments, leaderboard, player, player games | — | — |
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

**As wired (P6).** Home reads the day from the chain's `currentDay()` (the clock's until it answers) and its top 3 from
the indexer client on `VITE_INDEXER_URL`; `/v1/head` is not read. Each home read that has not answered, or failed,
leaves its part empty instead of holding the page: an empty podium, no game to resume, not paused (purchase reads the
pause again); a connected player the indexer has not answered for is shown by address with zero figures. The welcome's
controller connect is the devnet burner on devnet. The shell's footer keeps its Disconnect beside the D-15 notice (section 6.3); Settings (P11a) has its own, see "As built (P11a)"; the footer is left out of the board routes, which carry the notice under their header. The tutorial's board (`/tutorial`) reads `Setup.tutorial_claimed` and writes
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
(`spawn_free`); the **leaderboard**, and Home's top 3, mark a row "Free" when its best game was free (`GameSpawned.price == 0`, PM
ruling). The views and entry points the pages read are `gems-v1.md` 6.1's; their types are in
`components/containers/cobble-types.ts`. Since P9 the ledger's (`CobbleAccount`, the claims of a period, a quest's and an
achievement's Cobbles) are `@paved/chain`'s, named `cobbles` as CORE renamed them; the packs and the skins stay provisional
until P7b and P11b. The element is `Cobbles` (`elements/cobbles.tsx`, Font Awesome's
`cubes-stacked`), the mocks `src/mocks/cobbles.ts`. Two props sit beside the hooks' types rather than inside them, so
`src/data/scene-types.ts` holds: the scenes' Cobbles props are optional, and the leaderboard's free mark is a list of
player ids (`free`), not a field of `LeaderboardEntry`.

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
| `@paved/ui` (Tamagui) | dropped with app-web from the web; **`app-native` still depends on it** (dormant, P-2): it stays for app-native until the PM rules on app-native |
| app-web's `bench/` and `scripts/bench` | the bench moves to the new app's board route (same method) |

**How both live:** both build in CI; `publish.sh` publishes app-web's `dist` until the cut-over, then the
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
them. They are unmodified, and `sha256sum` equals that of `21788fb`:

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
| XP and meta-progression | a `profile` query (indexer, then chain) and a header chip; unlocks gate themes and modes through one `useUnlocks()` hook, so the Theme page's "locked" states are data |
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
| P3 | The board scene on Training (`LocalSession`): the hand panel and the placement preview wired. Added by the PM (2026-10-14): a tiles-left counter that counts discards as spent (EL, owner 2026-10-14: the number of discarded tiles is not shown anywhere, the Over scene's row included); a notice when storage is off or a save was dropped; two-tab handling; Esc closes the Surrender dialog; the move sent is the slot the player sees (D1, #379). **Done** (2026-10-15): `/training` and `/training/over` on a `TrainingGame` (`src/data/training.ts`: the session and a rules engine of the same moves for the slots and the preview, both kept between moves); the plan view is playable where the renderer cannot start; a tab follows the save another tab writes (the `storage` event); `DataProvider` mounted in `App.tsx` (Training's store; the chain and indexer sources refuse until their pages) | 2 d |
| P4 | Renderer: the post-processing chain and the zoom-following outline (section 5), measured with the bench | 3 d |
| P5 | `PredictedSession` and the Challenge board (section 9) on CORE's `initial_seed` view (S1, #377). Added by the PM: prompt a surrender when `expires_at` is reached; the discard reseeds at (CENTER, CENTER); if the replay check at game open fails, fall back to no prediction. **Done** (2026-10-15; section 9.5, "As built (P5)"): `/game/:gameId` on the predicted session, read only until P6 fills the sources' `signer` | 3 d |
| P6 | The home and play scenes on their data; the Tutorial on the board scene. **Done** (2026-10-15): the wallet (`src/wallet/`): `WalletProvider` fills the sources' `signer` (`PavedClient.writer` of the account: the moves, the tutorial's claim and P9's Cobbles claims) while connected and clears it on Disconnect; the Cartridge controller with the game's session policies outside devnet, the env's burner (`VITE_PLAYER_ADDRESS`, `VITE_PLAYER_PRIVATE_KEY`) on devnet, loaded in its own chunk on the first connect or on a page that reads the account (home, play, the tutorial's end), never by the welcome or Training; the welcome's Connect connects; the D-15 notice and the connected account with Disconnect in the shell's footer; the board routes (`h-dvh`) have no footer and show the notice compact under the board's header. A devnet key is read only in a devnet build (static accesses behind a build-time test), and a production build without `VITE_NETWORK` names no network: the chain client refuses rather than falling back to devnet. Home and play on their data (section 6.4, "As wired (P6)"); `/tutorial` on the board scene with its own `TutorialRun` (`data/tutorial.ts`) and, at its end, the First Stone claim through the signer (D-21). "Play free" on home and play, and the wallet restored on quests and achievements: done (PLAYFREE; see the P9 row) | 1 d |
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

**As built (P7b).** `/play/challenge` reads its Game tab from the chain: `Economy.quote(stake)` (the price from
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
and Pay waits. The Cobbles tab (`?tab=cobbles`) reads the packs from `Setup.pack` (ids 1 to `MAX_PACK_ID`, 8), not from the
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
confirms as above. A check that keeps failing (a
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
`"high"`), `sound` (on), `music` (off), `tilePreview` (on) and `placementHighlight` (on); a text that does not parse, or a
field of the wrong kind, is that field's default. *Graphics quality* is a row of Auto, Low, Medium and High: Auto shows what
it resolves to on this device: Auto (Medium) on every device (Low on a low-power one); High only by hand, and
High carries a line that it is heavier. The three board pages pass `{ quality }` to `BoardViewport`'s `settings`, kept as one
object while the quality does not change; `GameCanvas` calls `GameScene.setSettings` when it changes, which re-applies the
look, the antialiasing and the pixel-ratio cap, so an open board changes without a reload. *Tile preview* and *placement highlight* are wired in the board, not the renderer (which has
no switch, and none was added): off, `BoardViewport` hands the canvas no ghost, or no lit slot. The plan view (the fallback
without WebGL) still lights its slots. *Sound* and *music* are stored only: the app plays no audio yet. *The account* is the
wallet's: the controller username, or the short address, with Disconnect (the wallet's own, then Home with `?ref=` kept), and
a guest sees Connect; the links to Theme and Referral keep `?ref=`; the version line is the package's, bundled by the build.
The shell's footer keeps its Disconnect: it is on every page that has a footer, Settings is one tab away, and removing it is a
product call, not this page's; the D-15 notice stays where it is.

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
| `firstLoadJs` | the entry, the chunks `index.html` preloads, the `home` chunk and what those import statically | 649,978 / 208,981 | 663,552 / 214,016 |
| `css` | the stylesheets of `dist/assets` | 65,462 / 11,961 | 67,584 / 12,288 |
| `fontAwesome` | the three scripts of `dist/fontawesome/js` | 92,910 / 33,332 | 95,232 / 34,816 |

A limit moves in the pull request that needs it, with the reason; a smaller build does not move it by itself (lower it by hand
when a cut lands). `board` is the renderer, three and the engine, and is fetched only for a game.

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
| Q3 | Performance: (a) the bench on the new app against P-7b (the Mac's headless rule); (b) added by the PM: re-measure placement latency on the Mac's GPU, against a 100 ms click-to-shown target; (c) the first paint with the icons (F4's Font Awesome): a subset of the owner's files; (d) a bundle budget and route prefetch. **(c) and (d) done by Q3-BUNDLE** (2026-10-16, section 8 and below); (a) and (b) wait for the Mac with LIGHT-GPU | 2 d |
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
8. Five bottom tabs: Home, Ranks, Quests, Vault, Settings; Theme under Settings (6.1).
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
