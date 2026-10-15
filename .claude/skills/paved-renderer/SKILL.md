---
name: paved-renderer
description: How to change the Paved board renderer (packages/renderer, three.js, no react-three-fiber) and use it in packages/app. Use for any work under packages/renderer, or for the board in packages/app (BoardViewport, GameCanvas, the Renderer stories): render loop, tiles, outlines, post-processing, disposal, bench, assets.
---

# paved-renderer

`packages/renderer` draws the board (`@paved/renderer`, entry points `.`, `./react`, `./react-native`). `core/GameScene.ts`
owns the scene; `react/GameCanvas.tsx` mounts it. `packages/app` uses it in `components/containers/board-viewport.tsx` and
the `src/stories/renderer/` stories. The design is section 5 of `docs/client/v2-architecture.md` (5.3 ends with what R-OUT
decided; read that, not the proposal above it). Paths below are relative to `packages/renderer/src/` unless they start
with `docs/`, `scripts/` or `packages/`.

## Render on demand

- There is no continuous draw. `GameScene.start()` runs a `requestAnimationFrame` tick that renders only when `needsRender`
  is set (`core/GameScene.ts`). The tick still runs, cheaply: it calls `controls.update()`, which is true while the camera
  damps.
- A frame is requested by `requestRender()`, which every setter calls (`updateTiles`, `setHoveredTile`,
  `setAvailableSlots`, `setStrategyMode`, `setCompassRotation`, `setCameraMode`, `setSettings`), by a resize, and by camera
  damping. A new change to scene state ends with `requestRender()`; never add a loop or a timer that draws.
- Moving or adding a shadow caster also calls `requestShadowUpdate()`: the shadow map is redrawn only with the next frame
  after that. Tiles are the only casters.
- `renderFrame()` recomputes the outline stroke only when the tile's on-screen size changed, so a still camera does no
  outline work. Keep per-frame work out of it.
- `packages/renderer/__tests__/game-scene-redraw.test.ts` checks that `init` redraws the tiles given while the models loaded;
  `packages/renderer/__tests__/game-scene-frame-observer.test.ts` covers the read-only `setFrameObserver` hook the bench uses.

## Tiles: no per-tile geometry

- `core/TileRenderer.ts` keeps one model per plan type. Its geometry (the loader's), its tuned materials and its outline are
  shared by every tile of that type; a tile is `model.clone()`, which shares them. Pending tiles use one cloned material per
  source material; tops one material per type and orientation.
- Do not create a geometry, material or texture per tile, and do not dispose a shared one when a tile goes: dispose what
  `TileRenderer.dispose()` owns. `packages/renderer/__tests__/tile-renderer-resource-ownership.test.ts` checks that tiles of a type share
  geometry and materials, and that removing a tile keeps the shared geometry and outlines.
- Instancing was tried (P-7b) and dropped: it did not pay with the current models (`docs/measures/client-renderer.md`).
  Measure before proposing it again.

## Outlines

`core/outlines.ts`, set by `RendererSettings` (`core/settings.ts`), given as `settings` to `GameCanvas` or in
`GameScene.init` / `setSettings`; a partial object overrides only the fields it names; the rest take the defaults (`setSettings` replaces, it does not merge).

- Outlines are `LineSegments2` + one shared `LineMaterial`, built from `buildEdgesGeometry` (`core/edges.ts`), drawn after the
  faces (`renderOrder` 1) with `polygonOffset` factor -1, units -4 (`OUTLINE_DEPTH_BIAS`) so they stop flickering against the
  faces they lie on. They write no depth. `packages/renderer/__tests__/outlines.test.ts` ("outline material") checks the bias, order and depth.
- Width and opacity follow the tile's on-screen size in CSS px (`tilePixels`, `outlineStroke`): off at or under
  `fadeThresholdTilePx` (default **48**), fading in over `fadeRangeTilePx` (48), then `minWidthPx` 1 to `maxWidthPx` 2 at
  `maxWidthTilePx` 800. The tests of the same file pin the defaults and the continuity of the fade.
- Camera limits (`camera.minDistance` 5, `maxDistance` 300, optional `capZoomOut` at 150) apply to the web controller only;
  `NativeCameraController` ignores them.
- Change a default only with a capture and a figure (R-OUT, PR #411; stories "Renderer/Outlines" and "Renderer/Outlines
  comparison" in `packages/app/src/stories/renderer/`).

## Post-processing, as it stands

`core/Effects.ts` builds an `EffectComposer` from the profile in `core/render-profiles.ts` (`play`, `showcase`,
`showcaseCinematic`): `RenderPass`, then `SSAOPass` (only where the profile enables it: `showcaseCinematic`, checked by `packages/renderer/__tests__/render-profiles.test.ts`), then
`UnrealBloomPass`, then a vignette `ShaderPass`. The scene is drawn into a half-float target, not the canvas, so the
canvas's `antialias` does not reach it. `multisampling` (off by default, 4 samples when on) is the only anti-aliasing; there
is no FXAA, SMAA or edge pass. `resolveEffectsProfile` lowers bloom, vignette and SSAO for capabilities and low-power
devices (`packages/renderer/__tests__/effects-profile-fallback.test.ts`). `GameScene` caps the pixel ratio to
`[0.5, 1]`. A new pass is a measured cost: see the bench.

## Disposal

- `GameScene.dispose()` is idempotent. It unbinds input and resize, stops the loop, disposes tiles, effects, controls and
  assets, clears the scene, then `renderer.dispose()` and, by default, `forceContextLoss()`: Chrome keeps about 16 WebGL
  contexts per page. Pass `{ releaseContext: false }` only when the surface's owner frees the context.
  `packages/renderer/__tests__/game-scene-dispose.test.ts` covers the release, the second call, `releaseContext: false`, a dispose while models
  load, and `init` after `dispose`.
- A scene owns its surface. `GameCanvas` creates a canvas per scene, so a StrictMode remount or a `basePath` change gets a
  fresh context, never the lost one of the previous scene. Its init is cancellable: the cleanup sets `cancelled`, disposes
  the scene, and the pending `init(...).then` starts nothing and calls neither `onReady` nor `onError` (R-dispose, #397).
  `packages/renderer/__tests__/game-canvas-lifecycle.test.ts` covers unmount before and after init, a failed init, StrictMode and `basePath`.
  Keep that shape; do not move the canvas out of the effect.
- Nothing listens for `webglcontextlost` or `webglcontextrestored`: a context lost behind the scene's back is not handled.
  Adding that is a task of its own, with a test.

## Assets: self-hosted, no CDN

Models (`models/<key>.glb`), tile images (`assets/tiles/<key>.png`) and the Draco decoder (`draco/`) load from
`<basePath>` (`core/AssetLoader.ts`); they live in `packages/app-web/public/`, which Storybook serves at `/renderer-assets`
(`packages/app/.storybook/main.ts`, `src/mocks/assets.ts`). The decoder is created only when a model needs it, from
`<basePath>/draco/`: `packages/renderer/__tests__/asset-loader-draco.test.ts` checks that path and that plain models never create it. Add no
remote URL for a model, texture, decoder or font, in code or stories.

## The bench

Frame time is measured with the bench, not by eye or by rAF intervals (a rAF figure cannot pass the display's refresh).
Method: `docs/measures/client-baseline.md`; driver `scripts/bench/run.ts`; run `cd packages/app-web && bun run bench` (it
drives `app-web`'s bench page through `setFrameObserver`; `packages/app` has no bench page).

- A figure states: the machine, the **window mode** (on screen, off screen, headless), the GPU or software rendering, the
  profile (`unthrottled`, or `throttled`: CPU 4x and a 60 Hz cap), the tile count (38, 72), the run count, the window size,
  and the commit. Frame time is **CPU + GPU per frame, p95**, from the raw runs, beside draw calls and triangles.
- `--headless` is software rendering: a smoke run on Linux or any machine with no GPU. Its figures are not measures, and the
  driver refuses `--out` under `docs/measures/`. A figure needs a GPU run on the Mac.
- On the Mac a run opens no visible window while the owner uses the machine, and the driver has no hidden GPU mode
  (`--offscreen` still opens windows; `--headless` is software rendering): do not start a Mac run yourself; report the need.
  `docs/measures/client-baseline.md` and the bench driver's header still name `--offscreen` for the Mac, which is out of
  date; fixing those files is a separate task.
- No figure that was not measured: write "estimate" for the rest. A committed measure goes under `docs/measures/` with its
  method.

## Commands

From the repository root, with the heap capped as `AGENTS.md` says (its table: `@paved/renderer` 384 MB; never
`prlimit --as` for Node):

```sh
NODE_OPTIONS=--max-old-space-size=384 bun run test --filter @paved/renderer
NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app
NODE_OPTIONS=--max-old-space-size=1536 bun run --filter @paved/app build-storybook
```

Run the package you touched; `packages/app`'s figure is that of its README (832). The whole suite is the CI's. The Training
e2e (`packages/app-web/e2e/`) runs in CI when `packages/renderer` changes.

## Done when

A state change ends in `requestRender()`; no per-tile geometry or material; `dispose` frees what the change allocates;
the settings carry any new knob with a default and a test; no remote asset; a frame-time claim has a bench figure with its
machine and window mode; the renderer tests pass.
