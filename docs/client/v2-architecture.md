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
│   ├── main.ts          framework react-vite; stories: src/**/*.stories.tsx; addons: docs, a11y
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

The sidebar follows the tiers:

| Section | Stories |
|---|---|
| **Foundations** | Colors (every scale 50–950 with its hex and OKLCH, then the semantic tokens on their real backgrounds, with the contrast ratio), Typography (each family, weight and size step, the tabular numbers), Icons (the Font Awesome set in use), Motion (button press, tab indicator, sheet, toast, with reduced motion on and off), Spacing and radius, Breakpoints |
| **UI** | every shadcn primitive in every variant and state (default, hover, focus, disabled, loading) |
| **Elements** / **Containers** | every game component, one story per state (for example the hand panel: empty, a tile, pending, refused) |
| **Tiles / Base** | the 19 base tiles of `packages/app-web/public/models/` (the models the game plays), each rendered by the real renderer in a small canvas, rotatable through the four orientations, with its plan code and its 2D PNG beside it |
| **Tiles / Extended** | the 144 variant models of `origin/dev` (`<plan>_LF_<n>` and `<plan>_HF_<n>`: low and high forest density, 1 to 9 variants per plan, PR #162, 2024; to be brought over from that branch, never merged) and the 18 2D tiles of `app/public/assets/tiles/` that the 19-model set lacks; grouped by plan. Folder: `packages/app-web/public/models/extended/` (the 2D tiles in its `tiles/`). The variants are Draco-compressed: the renderer's `AssetLoader` decodes them lazily, with the decoder self-hosted at `<basePath>/draco/` (`packages/app-web/public/draco/`). `origin/dev` has 38 2D tiles, 20 of them in the 19-model set (`00.png` included), so 18 lack a model. |
| **Board** | the board on recorded boards (the bench fixtures at 38 and 72 tiles), with the outline width control (section 5) |
| **Scenes** | each page of section 6 on fixtures, one story per state, framed at the width of a `viewport` radio in Controls (small mobile 360, mobile 640, tablet 1024, desktop 1440; default mobile) |

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
  `[0.5, 1]` (so 1 on a retina screen); ACES tone mapping; PCF soft shadows redrawn only when tiles change;
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

### 6.4 What each page needs

| Page | Chain (views, writes) | Indexer | Engine | Local storage |
|---|---|---|---|---|
| welcome | controller connect | — | — | `welcomed` flag |
| loading | — | — | — | — |
| home | `Challenge.spawn_paused`; the player's open games (`GameSpawned` events) | `/v1/tournaments/:day/leaderboard` (top 3), `/v1/head` | — | the Training save (resume) |
| play | `spawn_paused` | — | — | — |
| purchase | `entry_price`, `Economy.quote`, `quote_swap`, `router`, `rate`, USDC `balance_of`; write `approve` + `spawn(stake, referrer, min_out)` | — | — | the referrer from `?ref=` |
| board | `game(id)`, `tiles(id, from, count)`, the initial seed (section 9); writes `build`, `discard`, `surrender` | — | `EngineGame` (prediction, legality, preview points) | the Training and Tutorial moves |
| over | `game(id)`, `Economy.terms(id)` (reward, `expired`), `day(day)`; write `settle` | `/v1/games/:contract/:id` | the final counters (Training) | — |
| leaderboard | — | tournaments, leaderboard, player, player games | — | — |
| quests | — | `definitions`, `playerQuests` | — | — |
| achievements | — | `definitions`, `playerAchievements` | — | — |
| vault | `Vault.staked`, `pending`, `total_staked`, PAVED `balance_of`; writes `stake`, `unstake`, `claim` | — | — | — |
| referral | — | the referral earnings: the indexer already stores each purchase's `referrer` and `referral` amount (`packages/indexer/src/api.ts:233-236`); a route listing them by referrer is to add (CLIENT) | — | — |
| theme | — | — | — | the chosen theme |
| settings | controller username, disconnect | — | — | quality, sound, music, preview, highlight |

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
- **The vault.** Read: `contracts/src/systems/vault.cairo` is a plain staking vault (no ERC4626, no share
  token); vPAVED with votes is designed only (`docs/architecture/vault-share.md`, P-55, D-27). The vault
  page is built on today's views behind a `VaultViews` interface, so the share token swaps in.
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
solid file holds the whole solid set. Another style, or a thin icon, needs another file from the owner.

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
  the next step is a smaller file than `solid.min.js` (only the icons the app uses), not the head.

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

- `PageSession` (today in app-web's `training/page-session.ts`) moves into `@paved/game-core` with
  `LocalSession`; `PredictedSession` joins them; `GameSession` (`@paved/chain`) remains the chain-only
  reader for other players' games (read-only boards, the player page).
- The session is a zustand vanilla store: the board's React components select from it, and the renderer
  subscribes to it directly (section 3.3).
- The Tutorial keeps its scripted engine run; Training keeps `LocalSession`; Challenge uses
  `PredictedSession`. A future Story mode (section 11) is `LocalSession` with a preset seed and board.

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
| 1 | `paved-ui` | **written by CLIENT**, trimmed from nums' `ui-architecture` (`cartridge-gg/nums@4f8f405`, `.agents/skills/ui-architecture/SKILL.md`, 366 lines, 13,555 B, MIT) | about 150 lines (estimate) | the tiers, a story per component, CVA + `cn()`, the tokens of section 2 (never a raw colour), Font Awesome Free imports, Motion patterns, the breakpoints, the a11y floor | nums' original **fails as is** (`allowed-tools: Read, Write, Edit, Glob, Grep, Bash` grants permissions); the written one carries no such line |
| 2 | `paved-data` | **written by CLIENT** | about 100 lines (estimate) | the query keys, no polling, receipts into the cache, the three owners of state, the prediction session | written to pass |
| 3 | `paved-renderer` | **written by CLIENT** | about 100 lines (estimate) | render on demand, no per-tile geometry, the outline pass and its settings, the bench method and the Mac's headless rule | written to pass |
| 4 | `shadcn` | `shadcn-ui/ui@30a58d4498f270af1c1e981a7d78a15cf5740841` (2026-10-12), `skills/shadcn/` | 295 lines, 21,306 B; 21 files, 148,754 B | the shadcn conventions: composition, styling with tokens, forms, Radix vs Base UI | **fails as is**: `allowed-tools: Bash(npx shadcn@latest *)…` grants permissions; a `` !`npx shadcn@latest info --json` `` line runs the latest CLI at load; it tells the agent to run `shadcn@latest` and fetch the docs URLs. **Trim** to `rules/styling.md`, `composition.md`, `forms.md`, `base-vs-radix.md`, `icons.md` (23,336 B) and a rewritten `SKILL.md` that names the CLI version pinned in `package.json`; drop `mcp.md`, `registry.md`, `cli.md`, `design-system*.md`, `chat.md`, `evals/`, `assets/`, `agents/`, `scripts/` |
| 5 | `react-best-practices` | `vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278` (2026-08-28), `skills/react-best-practices/`, MIT | 149 lines, 7,251 B; 76 files, 230,383 B | 70 rules on waterfalls, bundle size, re-renders, rendering, ranked by impact | **passes** on the search (no permission, no run, no fetch); **trim** for size: drop the 10 `server-*` rules and the Next.js items, and the compiled `AGENTS.md` (a duplicate of the rules); kept: 60 rule files + `SKILL.md`, 95,623 B |
| 6 | `composition-patterns` | same commit, `skills/composition-patterns/`, MIT | 89 lines, 2,886 B; 14 files, 50,339 B | compound components, no boolean-prop sprawl, React 19 APIs: fits the tiers | **passes** on the search; trim the compiled `AGENTS.md` duplicate |
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
scene state; each state has one story, told at the four widths by the `viewport` radio in Controls, and a render test.

Then the wiring PRs put the scenes on the routes, the sessions and the data: a wiring PR replaces a scene's fixture
with the hook that reads the same shape, and changes the scene only where the real data asks for it.

**Scenes on mock data**

| PR | Content | Estimate |
|---|---|---|
| SC1 | Scenes welcome, loading, home, play, board, over, purchase, with their elements and containers. The board draws the real renderer on the bench's recorded boards, with the hand (rotate, confirm, discard, surrender), the score, the tiles left counting discards (P3), the time before `expires_at`, the closing points as they appear, and the states placing, pending, refused, expired, storage off; over lists every closing of the game (P7); purchase shows the stake, price and boost, the split (`Economy.split_bps`, V1b: burn and Vault, the referral out of the Vault's part), the 24 h validity and the threshold | 3 d |
| SC2 | Scenes leaderboard, vault, settings, theme, quests, achievements, referral, reusing SC1's elements and containers | 2.5 d |

**Wiring the scenes**

| PR | Content | Estimate |
|---|---|---|
| P1 | App shell on the routes: SC1's navigation (bottom bar, desktop rail), top bars, the loading scene as boot screen and `Suspense` fallback, error boundaries; the welcome scene on `/welcome` | 1 d |
| P2 | Move `PageSession`, `LocalSession`, the tutorial run into `@paved/game-core`; the TanStack Query hooks over `@paved/chain`, returning the mocks' shapes | 1.5 d |
| P3 | The board scene on Training (`LocalSession`): the hand panel and the placement preview wired. Added by the PM (2026-10-14): a tiles-left counter that counts discards; a notice when storage is off or a save was dropped; two-tab handling; Esc closes the Surrender dialog; the move sent is the slot the player sees (D1, #379) | 2 d |
| P4 | Renderer: the post-processing chain and the zoom-following outline (section 5), measured with the bench | 3 d |
| P5 | `PredictedSession` and the Challenge board (section 9) on CORE's `initial_seed` view (S1, #377). Added by the PM: prompt a surrender when `expires_at` is reached; the discard reseeds at (CENTER, CENTER); if the replay check at game open fails, fall back to no prediction | 3 d |
| P6 | The home and play scenes on their data; the Tutorial on the board scene | 1 d |
| P7 | The purchase scene (stake, price, boost, split, 24 h validity, threshold) and the over scene (metrics, reward, settle) on their data. Added by the PM: on the over page, the list of every closing of the game | 2 d |
| P8 | The leaderboard and player scenes on the indexer | 0.5 d |
| P9 | The quests and achievements scenes on the indexer | 0.5 d |
| P10 | The vault and referral scenes on their data (and the indexer's referral route) | 1.5 d |
| P11 | The settings and theme scenes (themes beyond Default shown "coming soon" until their art) | 0.5 d |
| P12 | Cut-over: devnet e2e on the new app, publish it, remove `packages/app-web` | 1.5 d |

Every session (Training, Tutorial, Challenge) keeps its engine state between moves and replays the moves only on
resume (the PM, 2026-10-14).

Until a scene is routed it adds nothing to the app's JavaScript, but Tailwind v4 scans every source file of the
package, so its classes are in the app's CSS from the scene's PR on (SC1: 39,777 to 56,158 bytes, 8,055 to 10,622
gzipped); Q3's bundle budget counts it.

### Phase 3: polish

| PR | Content | Estimate |
|---|---|---|
| Q1 | Motion pass on every interaction; reduced motion checked | 1.5 d |
| Q2 | Accessibility: Storybook a11y tests in CI, keyboard paths, focus | 1.5 d |
| Q3 | Performance: bundle budget, route prefetch, the bench on the new app against P-7b (the Mac's headless rule). Added by the PM: re-measure placement latency on the Mac's GPU, against a 100 ms click-to-shown target; the first paint with the icons (F4's Font Awesome) | 2 d |
| Q4 | The Forest theme from the extended tiles (the renderer picks the variant per tile, as `origin/dev`'s `getVarietyModelPath` did) | 2 d |

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
