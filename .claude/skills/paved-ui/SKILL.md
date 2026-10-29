---
name: paved-ui
description: How to build UI in packages/app, the Paved client v2 (Vite, React 19, Tailwind v4, shadcn/ui, Motion, Storybook). Use for any work under packages/app: components, scenes, stories, tokens, fonts, icons, animation, layout.
---

# paved-ui

`packages/app` is the v2 client (`docs/client/v2-architecture.md` is the design; `packages/app/README.md` the layout).
Paths below are relative to
`packages/app/`.

## Tiers

`src/components/` has four tiers. A file goes in the lowest tier that fits, and imports only from its own tier or below.

| Tier | What | Example |
|---|---|---|
| `ui/` | shadcn/ui primitives, owned as source, no game knowledge | `ui/button.tsx`, `ui/dialog.tsx`, `ui/icon.tsx` |
| `elements/` | game atoms | `elements/score.tsx`, `elements/countdown.tsx` |
| `containers/` | composites of elements | `containers/hand-panel.tsx`, `containers/app-nav.tsx` |
| `scenes/` | one per page (section 6 of the architecture) | `scenes/home-scene.tsx` |

- A scene takes all its data as props, plus `onX` callbacks. It fetches nothing, reads no store, calls no session.
  `__tests__/scenes.test.tsx` ("no wiring") fails on a value import from `@paved/chain` or `@paved/indexer`, or on a
  `fetch(` call, in `elements/`, `containers/`, `scenes/` and `mocks/`. Types may be imported; values may not.
- The routes in `src/routes/` do not import the scenes yet (same test); wiring is a later phase, not part of UI work.
- Mock data lives in `src/mocks/` (`scenes.ts` assembles one object per scene, one key per state), checked with `satisfies Record<string, Data<HomeSceneProps>>`
  against the scene's own props type, and built from the real `@paved/chain` types, never an ad hoc shape.
- Use `ui/` primitives before writing markup: Radix through the `radix-ui` package, not per-primitive packages.

## Stories and tests

- Every new component has a `<name>.stories.tsx` beside it. Titles follow the tier: `Scenes/Home`, `Elements/...`.
- **One story per state**, named after the state, on mock data: `export const Guest: Story = { args: HOME.guest };`
  (`scenes/home-scene.stories.tsx`). A scene's mock object and its stories list the same states.
  `__tests__/scenes-2.test.tsx` ("SC2 stories") checks that match for the SC2 scenes only (vault,
  settings, theme, quests, achievements, referral); the SC1 scenes (such as Home) are matched by hand.
- **Width is Storybook's Viewport toolbar**: mobile 360, tablet 640, desktop 1024, wide 1440
  (`scenes/viewports.ts`, `.storybook/preview.tsx`). No `viewport` arg, no frame decorator, no story per width;
  `__tests__/viewport.test.tsx` and the SC2 test enforce it. With none picked a story takes the full width.
- Callbacks are `fn()` from `storybook/test`. `satisfies Meta<typeof Component>`, not `as`.
- The preview supplies the providers (QueryClient seeded by `parameters.queryFixtures`, `MemoryRouter` at
  `parameters.route`, `MotionConfig` with `parameters.reducedMotion`). A story that needs a provider sets a
  parameter; it does not wrap itself.
- **A render test per scene** in `__tests__/scenes.test.tsx` or `scenes-2.test.tsx`: Testing Library, wrapped in
  `<LazyMotion features={domMax}>` (the `wrap` helper), asserting what the player sees per state.
- The CI `client` job runs `build-storybook`: a broken story fails the PR.

## Styling

- Variants with `cva` and `VariantProps`; classes merged with `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`).
  Model: `ui/button.tsx` (`buttonVariants`), `elements/score.tsx` (`scoreVariants`). Components are function components
  taking `ComponentProps<"el">` (React 19: no `forwardRef`); `ui/` parts keep shadcn's `data-slot` attributes, which
  `theme.css` selects on.
- **Tokens only.** Use semantic classes (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`,
  `bg-primary`, `border-border`, `ring-ring`, `text-destructive-text`, `success`, `info`, `warning`). Raw colours live in
  `src/styles/theme.css` alone: no hex, `oklch(`, `rgb(`, `bg-white`, `bg-black`, `bg-[#...]`, and no palette step
  (`gold-300`, `ink-900`) in `ui/` or `elements/`. `__tests__/theme.test.tsx` fails on it ("keeps raw colours..."); it bans palette steps
  only in those two tiers (containers and scenes use some today), but new code uses semantic tokens everywhere.
  A missing colour is a new token in `theme.css`, not a literal in a component.
- Dark only: `index.html` sets `data-theme="dark"` (the `dark:` variant needs it). `--input` re-points to
  `--input-surface` inside cards and dialogs; do not override it.
- Mobile first, written without a prefix; each named breakpoint adds. The names are `mobile` (360), `tablet` (640),
  `desktop` (1024) and `wide` (1440), beside Tailwind's defaults. Pattern: `desktop:flex-row`, `tablet:max-w-2xl`.
  What changes at each (section 3.4): mobile shows the current tab's label (TAB-SWIPE), tablet two columns, desktop turns the bottom
  navigation into a left rail (`containers/app-nav.tsx`), wide caps content at 1200 px except the board.
- Full-height screens: `min-h-dvh`. Notches: `env(safe-area-inset-*)`, as `app-nav.tsx` does. Touch targets 44 px or more.
- Feels like an app (P-69): text is not selectable by default (`select-none` on `body`, `styles/theme.css`). Only a copy
  target opts back in with `select-text` (an address, the referral link, an error detail; inputs always do), and
  `__tests__/app-feel.test.tsx` lists the files that may. No page zoom: the viewport meta forbids it, `touch-manipulation`
  stops the double-tap zoom, `usePageGestures` cancels iOS's pinch. The board owns its gestures (`touch-none` on the
  canvas, no context menu). An `<img>` is `draggable={false}`. Never set a text under 12 px.

## Errors

Every error goes through `InlineError` (`elements/inline-error.tsx`, P-67); there is no other error rendering. Render it
always, with `message` null when there is none (it then takes no space), and pass its `detail` from the route (`routes/error-detail.ts`); an error
with no place on its page is `toastError` (`containers/error-toast.tsx`). A `Notice` is a state, never an error.
`__tests__/error-guard.test.ts` enforces it.

## Fonts and numbers

Three families, self-hosted from npm (`@fontsource*`, `src/styles/fonts.css`), Latin subset, `font-display: swap`:

| Class | Family | For |
|---|---|---|
| `font-display` | Almendra Bold (700 only) | the wordmark and page titles |
| `font-sans` (the body default) | Rubik Variable | all other text |
| `font-mono` / the `numeric` utility | Space Mono 400, 700 | scores, counters, prices, addresses, ids |

Any number that changes in place takes `numeric` (`font-family: var(--font-numeric)` plus tabular figures, defined in
`theme.css`), so digits keep one width: `scoreVariants` in `elements/score.tsx` starts with it. Do not add a font
without the owner's say; it is a package, a `@font-face` and a `THIRD_PARTY_NOTICES.txt` line.

Every number, amount, percentage and date goes through the formatter module (`formatNumber`, `formatUnits`, `formatBps`,
`formatDate`, ... in `@paved/game-core`, `src/format.ts`), never `toLocaleString` or `Intl` directly: the locale is en-US
whatever the browser's (P-66), and the module is the single point a future i18n replaces. `game-core/__tests__/locale-guard.test.ts` fails on a bare call.

## Icons

Font Awesome Pro is the owner's three script files in `public/fontawesome/js` (never `fortawesome` npm packages, never a
kit URL). `lib/font-awesome.ts` injects them once after the first frame, with DOM rewriting and the mutation observer
turned off, so React keeps the DOM; `main.tsx` calls `loadFontAwesomeWhenIdle()`. Draw icons with
`<Icon name="house" variant="solid" size="md" label="Home" />` from `ui/icon.tsx`: `name` is the Font Awesome name
without `fa-`; `variant` is `solid` or `thin` (one icon: `spider-web`); `size` is `xs` to `xl`. No `label` means decorative
(`aria-hidden`); give one when the icon is the only content. Never write `<i class="fa-...">` or import another icon set.
Add `fixedWidth` in a column so icons line up and the text does not shift when the SVG replaces its empty box.

Game icons (#844, for the HUD: the home's overlay buttons, the phone's bar, the plates, Play, Edit, once the owner has
picked a look in `Elements/GameIcon`): `<GameIcon name="swords" size="lg" />` from `elements/game-icon.tsx`, Font Awesome's
shape in relief (outline, lit fill, highlight, shadow), each part in its own tone, bundled so it shows at the first paint
(its shapes count in the first load's budget). Its shapes are generated:
add a name to `GAME_ICON_NAMES` in `scripts/game-icons.ts`, give it its tones in `PARTS`, run `bun run game-icons`, and
record it in `public/THIRD_PARTY_NOTICES.txt`. Text-sized icons elsewhere stay `Icon`.

League crests (#854): `<CrestArt league="knight" division={2} />` from `elements/crest-art.tsx`, one drawing per group in
the game icons' relief, the division as studs at its foot (III one, I three). Its Font Awesome shapes are generated like the
game icons': `CREST_SHAPE_NAMES` in `scripts/league-crests.ts`, `bun run league-crests`, and a line in the notices.
The second study's directions (Shield, Helm, Medal) are `<CrestDirectionArt direction="shield" league="knight" />` from
`elements/crest-directions.tsx`: one base shape per direction, its material (`MATERIAL_BASES`, mixed from the game icons' tones, no CSS of its own) and ornaments climbing
by `RANKS`; both draw through `CrestSvg`.

Coins (#853): PAVED's gold coin and vPAVED's silver one, `src/assets/tokens/paved.svg` and `vpaved.svg`, drawn through
`TokenIcon`, are generated by `scripts/coins.ts` (Font Awesome's `coin-front`, the Almendra "P", the game icons' relief in the
gold and steel tones): change the script, run `bun run coins`, never edit the files by hand (the build checks them).
The Cobbles (#878): `src/assets/tokens/cobbles.svg`, a hewn stone cube with worn edges, is drawn by hand (no script); the
sharp-edged cube and the earlier cobblestone stay in `cobbles-cube-study/` for the story `Elements/CobblesCube`.

## Motion

- Import `m` components (`import * as m from "motion/react-m"`), never `motion.div`: `MotionProvider.tsx` is
  `LazyMotion strict`, which throws on the full component. The feature set (`domMax`, in `motion-features.ts`) loads as its
  own chunk after paint. `domMax` is needed for the tab highlight's `layoutId` and the list's `layout`.
- Reduced motion is one switch, `<MotionConfig reducedMotion="user">`, already in `MotionProvider`. Code that animates by
  itself reads it with `useReducedMotionConfig()` (see `elements/number-ticker.tsx`); a story can force it with
  `parameters.reducedMotion`. Sonner's CSS toasts follow it through the `toaster-reduced-motion` class.
- Hover and colour changes are CSS transitions. Press feedback is `whileTap`. Exits use `AnimatePresence`.
- The animated parts were chosen in section 3.5 of the architecture. Use them, do not add another registry or library:
  Tabs highlight (`ui/tabs.tsx`), Dialog and Sheet enter and exit, Toast (`ui/sonner.tsx`, Sonner), Number Ticker
  (`elements/number-ticker.tsx`), Animated List (`ui/animated-list.tsx`), Carousel (`ui/carousel.tsx`, Embla).
  A new copied component names its source and commit in its file header and its licence in `public/THIRD_PARTY_NOTICES.txt`;
  animate-ui's licence (MIT + Commons Clause) has conditions in section 3.5: read them before copying anything from it.

## Accessibility floor

- Every control has an accessible name (visible text, `aria-label`, or an `Icon` `label`). `app-nav.tsx` is the model:
  `nav aria-label="Main"`, `aria-current="page"`.
- Focus is visible: `outline-none focus-visible:ring-2 focus-visible:ring-ring`, as the `ui/` primitives do. Keep the
  keyboard behaviour Radix gives (focus trap, arrow keys); do not rebuild it from `div`s.
- Contrast comes from the tokens, which `theme.test.tsx` measures (inputs at 3:1 on their surface). Never carry meaning by
  colour alone. Use the Storybook a11y panel on each new story.
- A busy button sets `loading` (it adds `aria-busy` and disables).

## Assets

Every asset is self-hosted: fonts from `@fontsource*`, icons from `public/fontawesome`, images from `public/`. No CDN, no
Google Fonts link, no remote image, script or stylesheet, in code, `index.html` or stories. `elements/background.tsx`
serves AVIF, WebP and a JPEG fallback from this host, and its test asserts the markup has no `http(s):`.

## Commands

From the repository root, with the heap capped as `AGENTS.md` says (never `prlimit --as` for Node):

```sh
NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app
NODE_OPTIONS=--max-old-space-size=1536 bun run --filter @paved/app build-storybook
bun run --filter @paved/app storybook      # dev server on port 6006
```

Run the tests of what you touched; the whole suite is the CI's. `build-storybook` writes `storybook-static/` (ignored by git).
The 832 and 1536 figures are those of `packages/app/README.md`.

## Done when

The component is in its tier; it has a story per state on typed mocks; scenes have a render test; no raw colour or CDN;
`numeric` on changing numbers; `Icon` for icons; `m` components only; the tests and `build-storybook` pass.
