---
name: react-best-practices
description: React performance rules for packages/app, the Paved client v2 (Vite, React 19, react-router, TanStack Query, zustand): waterfalls, bundle size, re-renders, rendering, JavaScript hot paths. Use when writing, reviewing or refactoring React components, hooks and effects, or when a page is slow or its bundle grew.
---

<!-- Source: rewritten for Paved from vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278, skills/react-best-practices/SKILL.md. Licence: MIT (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

# React best practices in Paved

Performance rules from Vercel Engineering, kept as 60 rule files in `rules/` and pinned to the commit named in the
header. The 10 `server-*` rules are dropped: the app is a Vite single-page app with no server rendering. Next.js and
SWR parts of the kept rules are marked with a `<!-- Paved: ... -->` note saying what to do here instead.

## How this fits the other skills

- **`paved-ui`** decides the structure: the tiers, tokens, Motion, stories. If a rule here contradicts it, `paved-ui` wins.
- **`paved-data`** decides where data lives: TanStack Query for server state, sessions outside React for the game in
  play, no polling, keys in `src/data/keys.ts`. The `client-*` rules here that name SWR are met by it, not by a new
  library.
- **`paved-renderer`** decides the board (three.js, no react-three-fiber). Per-frame work does not go through React state.
- Add no dependency because a rule names one (`better-all`, `swr`). Use plain React or what the app has.

## Rule categories by priority

| Priority | Category | Impact | Prefix |
|---|---|---|---|
| 1 | Eliminating waterfalls | CRITICAL | `async-` |
| 2 | Bundle size | CRITICAL | `bundle-` |
| 3 | Client-side data fetching | MEDIUM-HIGH | `client-` |
| 4 | Re-render optimisation | MEDIUM | `rerender-` |
| 5 | Rendering performance | MEDIUM | `rendering-` |
| 6 | JavaScript performance | LOW-MEDIUM | `js-` |
| 7 | Advanced patterns | LOW | `advanced-` |

## Rules

Read the rule file before applying a rule; each has an incorrect and a correct example. Paths are in `rules/`.

### 1. Eliminating waterfalls (CRITICAL)

- `async-cheap-condition-before-await`: check cheap synchronous conditions before awaiting a flag or remote value
- `async-defer-await`: move an `await` into the branch that uses it
- `async-parallel`: `Promise.all()` for independent operations
- `async-dependencies`: start each task as soon as its inputs exist (no `better-all` here)
- `async-api-routes`: start promises early, await late (for async handlers; the app has no API routes)
- `async-suspense-boundaries`: Suspense boundaries so the rest of the page shows

### 2. Bundle size (CRITICAL)

- `bundle-barrel-imports`: import directly, avoid barrel files
- `bundle-analyzable-paths`: literal or bounded import paths
- `bundle-dynamic-imports`: `React.lazy` and `import()` for heavy components
- `bundle-defer-third-party`: load third-party code after first render
- `bundle-conditional`: load a module only when its feature is on
- `bundle-preload`: preload on hover or focus

### 3. Client-side data fetching (MEDIUM-HIGH)

- `client-swr-dedup`: one request per key across components (TanStack Query does this; see `paved-data`)
- `client-event-listeners`: share one global listener
- `client-passive-event-listeners`: passive listeners for scroll and touch
- `client-localstorage-schema`: version and minimise `localStorage` data

### 4. Re-render optimisation (MEDIUM)

- `rerender-defer-reads`: do not subscribe to state only a callback reads
- `rerender-memo`: extract expensive work into memoised components
- `rerender-memo-with-default-value`: hoist default non-primitive props
- `rerender-dependencies`: primitive dependencies in effects
- `rerender-derived-state`: subscribe to a derived boolean, not the raw value
- `rerender-derived-state-no-effect`: derive during render, not in an effect
- `rerender-functional-setstate`: functional `setState` for stable callbacks
- `rerender-lazy-state-init`: pass a function to `useState` for an expensive initial value
- `rerender-simple-expression-in-memo`: no `useMemo` around a simple primitive
- `rerender-split-combined-hooks`: split hooks whose dependencies are independent
- `rerender-move-effect-to-event`: interaction logic in the event handler
- `rerender-transitions`: `startTransition` for non-urgent updates
- `rerender-use-deferred-value`: defer an expensive render to keep input responsive
- `rerender-use-ref-transient-values`: refs for transient, frequent values
- `rerender-no-inline-components`: no component defined inside a component

### 5. Rendering performance (MEDIUM)

- `rendering-animate-svg-wrapper`: animate a `div` wrapper, not the SVG element
- `rendering-content-visibility`: `content-visibility` for long lists
- `rendering-hoist-jsx`: static JSX outside the component
- `rendering-svg-precision`: fewer decimals in SVG coordinates
- `rendering-hydration-no-flicker`: read a stored value in the first render (no hydration here)
- `rendering-hydration-suppress-warning`: not applicable without SSR, kept for reference
- `rendering-activity`: the `Activity` component for show and hide
- `rendering-conditional-render`: ternary, not `&&`, when the left side can be `0`
- `rendering-usetransition-loading`: `useTransition` for a pending state
- `rendering-resource-hints`: React DOM resource hints, for self-hosted assets only
- `rendering-script-defer-async`: `defer` or `async` on scripts that are not bundled

### 6. JavaScript performance (LOW-MEDIUM)

- `js-batch-dom-css`, `js-index-maps`, `js-cache-property-access`, `js-cache-function-results`, `js-cache-storage`,
  `js-combine-iterations`, `js-length-check-first`, `js-early-exit`, `js-hoist-regexp`, `js-min-max-loop`,
  `js-set-map-lookups`, `js-tosorted-immutable`, `js-flatmap-filter`, `js-request-idle-callback`

### 7. Advanced patterns (LOW)

- `advanced-effect-event-deps`: do not put a `useEffectEvent` result in an effect's dependencies
- `advanced-event-handler-refs`: event handlers in refs
- `advanced-init-once`: initialise once per app load
- `advanced-use-latest`: a `useLatest` ref for stable callbacks

## Measure before and after

A rule is a hypothesis about this code. For a change made for speed, say which page or interaction it speeds up and
check it: the React profiler for re-renders, the bundle budget (`Q3-BUNDLE`) for size, the bench in
`docs/measures/` for the board's frame time.
