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
  `setAvailableSlots`, `setStrategyMode`, `setCompassRotation`, `setCameraMode`, `setSettings`), by a resize (`resize()`), and by camera
  damping. A new change to scene state ends with `requestRender()`; never add a loop or a timer that draws.
- Moving or adding a shadow caster also calls `requestShadowUpdate()`: the shadow map is redrawn only with the next frame
  after that. Tiles are the only casters.
- `renderFrame()` recomputes the outline stroke only when the tile's on-screen size, the opening tile size S, the pixel
  ratio or the settings changed, so a still camera does no outline work. Keep per-frame work out of it.
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

- Outlines are drawn by the renderer's own antialiased shader (`createOutlineMaterial`, a shared `ShaderMaterial`), on
  three's instanced `LineSegmentsGeometry`, built from `buildEdgesGeometry` (`core/edges.ts`). The fragment shader covers
  each pixel by the part of it the stroke covers: no multisampling and no post pass. They are drawn after the faces
  (`renderOrder` 1) with `polygonOffset` factor -1, units -4 (`OUTLINE_DEPTH_BIAS`) so they stop flickering against the
  faces they lie on. They write no depth. `packages/renderer/__tests__/outlines.test.ts` ("outline material") checks the
  bias, order, depth, the dark grey and the viewport each draw is told.
- The width is `widthVoxels` of a voxel (default **0.015**), converted to device px at the zoom (`outlineStroke`), at least
  `minWidthDevicePx` (1) and at most `maxWidthPx` (2) CSS px; the colour is `#1f1f1f`. The opacity follows the tile's
  on-screen size in CSS px (`tilePixels`) against S, the tile size the board opens at on this viewport
  (`openingTilePixels`, about 60 px in a 900 px high window): fully on at S (`fadeFullFactor` 1), off at 0.85 S
  (`fadeOffFactor`), linear between. S follows the viewport's height, so a resize moves the fade
  (`packages/renderer/__tests__/game-scene-settings.test.ts`, "follows a resize"). The defaults and the fade are pinned in
  `packages/renderer/__tests__/outlines.test.ts` ("defaults: fully on at the opening tile size S").
- Software WebGL (`detectSoftwareWebGL`, found at `init`): `force` "auto" (the default) turns the outlines off there,
  "on" and "off" override the detection. The path taken is logged once with `console.info`, again only if it changes.
  `packages/renderer/__tests__/game-scene-settings.test.ts` ("draws no outlines on software WebGL unless forced on, and logs the path once") and
  `packages/renderer/__tests__/outlines.test.ts` ("software WebGL") cover it.
- **The segment cut (OUT-LOD)**: a crease segment is drawn by its length on screen, in device px, not only by the tile's
  size. `segmentOffDevicePx` 0.5 and `segmentFullDevicePx` 1 (`OutlineSettings`, `core/settings.ts`): the vertex shader
  fades a segment in linearly between the two, and collapses it below 0.5 so it costs no fragment. `segmentFade` is the same
  function in TypeScript; `packages/renderer/__tests__/outline-segment-cut.test.ts` ("the screen-size cut") pins it, its
  continuity, and that the stroke carries both settings to the material. Three more cuts, same file:
  - CPU range cut: `orderOutlineSegments` puts the segments along a tile's height (its vertical edges) last, longest
    first, and the outline mesh (`Outline`) sets `instanceCount` from `outlineSegmentCount` before each draw, so the vertical edges that
    are surely under 0.5 px are not sent ("the segments the draw skips": it skips only what the shader would drop, with
    the camera tilted, at the screen's border and near the plane). The geometry is shared by every tile of the type.
  - Collinear merge at load: `mergeCollinearSegments` (`core/edges.ts`) joins the pieces of one straight edge, so a short
    piece is not cut out of a long line (`packages/renderer/__tests__/outline-segment-cut.test.ts`, "mergeCollinearSegments").
  - Four-vertex quads: `createOutline` draws the four outer corners of `LineSegmentsGeometry`'s eight, two triangles a
    segment (same file, "the outline's quad").
  Do not change the two device-px defaults without a capture and a figure, as for the others below.
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
devices (`packages/renderer/__tests__/effects-profile-fallback.test.ts`). A new pass is a measured cost: see the bench.

## Size, pixel ratio and shadows

- The canvas follows its container. `WebSurfaceAdapter` sets the canvas to 100 % width and height by CSS
  (`packages/renderer/__tests__/web-surface-adapter-resize.test.ts`), and `GameScene` sizes only the drawing buffer
  (`setSize(w, h, false)`). `WebSurfaceAdapter.onResize` fires on a `ResizeObserver` of the container, a window resize,
  and a change of the device pixel ratio (`matchMedia`, re-armed on each ratio; same test file and
  `packages/renderer/__tests__/surface-device.test.ts`). `GameScene.resize()` then refits the drawing buffer, the camera and the post-processing
  targets (`packages/renderer/__tests__/surface-adapter.test.ts`, "uses surface resize callback"). A hidden 0 x 0 container keeps the last size (`GameScene.resize()`; `packages/renderer/__tests__/surface-adapter.test.ts`, "keeps the last size while the container is hidden").
- The pixel ratio is `min(devicePixelRatio, maxPixelRatio)` (`capPixelRatio`, `core/settings.ts`). `maxPixelRatio`
  defaults to `"auto"`, which gives 2 on a coarse pointer or when the window's shorter side is at most 600 CSS px
  (`SMALL_SCREEN_PX`, `PIXEL_RATIO_CAPS.coarse`), and 1.5 elsewhere (`PIXEL_RATIO_CAPS.fine`; `resolveMaxPixelRatio`); a number is used as is.
  `packages/renderer/__tests__/outlines.test.ts` ("resolves the \"auto\" cap by device") pins the caps, `packages/renderer/__tests__/surface-adapter.test.ts` the ratio `GameScene` passes to
  `setPixelRatio`, and `packages/app/__tests__/board-pixel-ratio.test.tsx` that the app's board leaves the cap to "auto". A new cap through `setSettings` refits at once. The figures behind the caps are DPR's, in
  `docs/client/v2-architecture.md` 5.3.
- Shadows (`core/GameScene.ts`): `PCFShadowMap`, normal bias 0.1 (about 1.3 voxels), depth bias -0.001. They remove the
  shadow acne; half these values leave bands (R-VIS). `packages/renderer/__tests__/game-scene-shadow-map.test.ts` checks the type, the signs and the
  normal bias at most 0.1.

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

Models, tile images (`assets/tiles/<key>.png`) and the Draco decoder (`draco/`) load from `<basePath>`
(`core/AssetLoader.ts`). Storybook serves `packages/app-web/public/` at `/renderer-assets` (`packages/app/.storybook/main.ts`,
`src/mocks/assets.ts`): plain `models/<key>.glb`, no manifest. The decoder is created only when a model needs it, from
`<basePath>/draco/`: `packages/renderer/__tests__/asset-loader-draco.test.ts` checks that path and that plain models never create it.

The app (`packages/app`) serves its own models: meshopt-compressed (`packages/app/scripts/compress-models.ts`) under
content-hashed names `models/<key>.<hash>.glb` in `packages/app/public/renderer-assets/models/`, with a `manifest.json`
(`{ "models": { "<key>": "models/<key>.<hash>.glb" } }`) that `packages/app/vite/renderer-assets.ts` serves in dev and writes
into `dist/` at build. `AssetLoader` reads it at `<basePath>/manifest.json` (`loadManifest`, `modelPath`); with none (a 404, or
Storybook) it asks for the plain names, and when the manifest cannot be reached after its retries it rejects, so the app
shows its plan view. Tests: `packages/renderer/__tests__/asset-loader-order.test.ts` ("the manifest"),
`packages/app/__tests__/renderer-manifest.test.ts` (files, hashes, the manifest and the dev middleware) and
`packages/app/__tests__/renderer-models-edges.test.ts` (the compressed models give the same outline segments as the
originals).

Load order (`core/load-order.ts`): the first frame waits only for the models of the tiles `GameScene` was handed (`want`;
every model when it was handed none); the rest load after that frame (`afterFirstFrame`). A tile whose model arrives later
is drawn then, with a new frame and shadows (`AssetLoader.onLoaded`, `GameScene`). `packages/renderer/__tests__/asset-loader-order.test.ts`
("the load order", "GameScene with the load order") covers it. The meshopt decoder is set on the loader, and the first loader starts it in two
workers where the browser has workers (`startDecoderWorkers`, `MeshoptDecoder.useWorkers(2)`); no test covers the workers.

Add no remote URL for a model, texture, decoder or font, in code or stories.

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
