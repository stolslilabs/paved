---
name: paved-renderer
description: How to change the Paved board renderer (packages/renderer, three.js, no react-three-fiber) and use it in packages/app. Use for any work under packages/renderer, or for the board in packages/app (BoardViewport, GameCanvas, the Renderer stories): render loop, tiles, outlines, post-processing, disposal, bench, assets.
---

# paved-renderer

`packages/renderer` draws the board (`@paved/renderer`, entry points `.`, `./react`, `./react-native`). `core/GameScene.ts`
owns the scene; `react/GameCanvas.tsx` mounts it. `packages/app` uses it in `components/containers/board-viewport.tsx` and
the `src/stories/renderer/` stories. The design is section 5 of `docs/client/v2-architecture.md`, with the assets in 4.2. Each
section ends with what was decided (5.2 P4, 5.3 R-OUT to OUT-LOD, 5.5 LIGHT, 5.6 skins): read those, not the proposals above
them. Paths below are relative to `packages/renderer/src/` unless they start
with `docs/`, `scripts/` or `packages/`.

## Render on demand

- There is no continuous draw. `GameScene.start()` runs a `requestAnimationFrame` tick that renders only when `needsRender`
  is set (`core/GameScene.ts`). The tick still runs, cheaply: it calls `controls.update()`, which is true while the camera
  damps.
- A frame is requested by `requestRender()`, which every setter calls (`updateTiles`, `setHoveredTile`,
  `setAvailableSlots`, `setStrategyMode`, `setCompassRotation`, `setCameraMode`, `setSettings`), by a resize (`resize()`), and by camera
  damping. A new change to scene state ends with `requestRender()`; never add a loop or a timer that draws.
- The one exception is the **ambient loop** (`core/ambient-loop.ts`, #572): `GameScene.ambient`, ticked from the same rAF, steps
  at most `settings.ambient.fps` (30) times a second, and not while the tab is hidden, the board covered (`setCovered`) or the
  effects off (setting, Low tier, reduced motion: `ambientAllowed`). An ambient effect (#573, #574) is a lazy chunk that
  implements `AmbientEffect` (`step` returns whether it moved), `register`s on that loop, and reads `ambient.time` as its
  shader's time uniform. Never a second loop. The particles of #572 were removed (owner, 2026-10-19).
- The **cloud shadows** (#573) are that loop's one effect: `core/cloud-shadows.ts` (a lazy chunk: the noise map, the knobs of
  `RendererSettings.ambient.clouds`, the drift) writes `TileRenderer.cloudUniforms`, and the tile shader's term
  (`core/cloud-shader.ts`, in the board's chunk) dims only the shadow-casting directional lights' direct light (the sun and its
  twin). A light term, not a caster: a cloud's move draws a frame, never the shadow map (`game-scene-ambient.test.ts` counts it).
  A step draws only once the clouds moved `CLOUD_MIN_MOVE` (a quarter of a voxel).
- The **birds** (#574, `core/birds.ts`, loaded by `loadBirds`) are stories only (`Renderer/Birds`, and the spring switch of
  `Renderer/Weather`): the story registers them on `scene.ambient` itself; the board does not call them until the owner validates them.
- The **weather** (#607 PR 2, wired by #658: `core/weather.ts`, settings in `core/weather-settings.ts`, `RendererSettings.weather`)
  is on every board: `GameScene.syncWeather` loads its chunk the first time it shows, adds `Weather.object` to the scene, registers
  it on `scene.ambient`, and feeds it the cycle's point (`setCycle`, from `applyDayNight`: the wheel's season, auto or fixed, by day
  and at night), the clouds' wind (`setWind`) and its mode (`weatherModeNow`: off with the weather or the "Ambient effects" off, or on
  Low; with the cycle off, summer's noon, the wheel's summer day; "still" under reduced motion: nothing falls, the grades, the brightness and the snow veil stay). Autumn
  raises the clouds' coverage (`cloudSettings`). One instanced draw per falling layer, one full-screen tint for the grade and the
  brightness (no glare, shimmer or shafts: the owner removed every glow, 2026-10-20). The snow on the tops is a term of the tile
  shader (`core/snow-shader.ts`, `TileRenderer.snowUniforms`): a veil (`winter.veil`) in rounded patches from a noise read at the
  fragment's place, never per voxel or cell. `GameScene.getWeather()` gives its stats (`Renderer/Weather` stories, the bench).
- The **chimney smoke** (#770: CHIMNEY-SMOKE-1 the detection `core/chimneys.ts` and the study, CHIMNEY-SMOKE-2 the wiring;
  `core/chimney-smoke.ts`, settings in `core/chimney-smoke-settings.ts`, `RendererSettings.smoke`) is off in the renderer by default
  and on in the app's boards (`BOARD_SMOKE`), so the tile views, the 3D stack and the build-time images keep the models' white smoke
  voxels. `GameScene.syncSmoke` loads its chunk (the detection inside it: never re-export `chimneys.ts` from the barrel, or the board's
  eager chunk shares its group) the first time it can be drawn (`ambientAllowed`); `syncSmokeTiles` finds each drawn type's chimneys
  once and places the mouths of `TileRenderer.smokeSources()` (placed tiles, not pending, not mid-drop). While it can be drawn, every
  season (summer: neither smoke nor white voxels), the placed tiles draw their types' smoke-free twins (`setSmokeFree`,
  `setSmokeHidden`: a geometry swap per tile, no shader term; the outlines and the shadows follow; the drop leaves the smoke's voxels
  out). One instanced draw of puffs, one of the mouths' caps; a season's change fades over `fadeSeconds`, a tile just placed over
  `placeSeconds`. `GameScene.getSmoke()` gives its stats. Each chimney's plume (#801) is `plumeOf` of the look's `variation`,
  seeded by its mouth's place (`plumeSeed`) and written as per-instance attributes (still one draw). The default look is
  `varied` (the owner's, #801: slower, fainter, `SMOKE_VARIATION`); #770's `puffs` and `wisps` (every range 0 but `pace`) stay as
  values of the stories' `look` control.
- The **fog of war** (FOG-STUDY #633, wired by FOG-EVERYWHERE #648: `core/fog-of-war.ts`, reveal logic and settings in
  `core/fog-of-war-settings.ts`, `RendererSettings.fog`) is on every board the app draws: `GameScene.setFogReveal` (from
  `GameCanvas`'s `fogReveal`, set by `BoardViewport`: the tiles and their free slots, or `fogOwned`'s owned cells and their
  neighbours in a village or an attack) loads its chunk the first time it shows, adds `FogOfWar.object` to the board's group and
  registers it on `scene.ambient`; its mode is `fogMode` ("still" on Low, with the effects off and under reduced motion: no drift,
  a cell lifts at once; it stays on at every tier). The owner's look is `LANDSCAPE_FOG` (falloff 2.5, billow 0.7, the landscape).
  One field texture (the signed distance to the clear cells, blurred so every corner is round: `cornerRadius`) drives the floor,
  the mist, the landscape's ground and its instanced props: one draw each, no per-cell draw. A lift rebuilds only the part of the
  field its cells reach.
- The placement effects draw through the same tick: `TileRenderer.update` reports `animating` while a plate eases, the
  confirm fades, or a tile is pending (its opacity pulse, #681: every frame while it pulses, none under reduced motion);
  with none of these the board is back to render on demand.
- The **closed structures** (CLOSE-SHINE, #722, `core/closed-structures.ts`, `GameScene.setClosedStructures`) draw through the
  same tick: `TileRenderer.update` reports `animating` while a structure pulses or a sweep crosses one, and for one frame after;
  between sweeps, nothing. Their term reads FEATURE-HL's labels (`LABEL_GLSL`) and never dims the board (doc 5.11).
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
- The tile in hand (hover preview and pending tile, #657) is drawn with the same outline pass on its own material
  (`TileRenderer.ghostEdgeMaterial`): the placed tiles' stroke, its opacity times the ghost's (half on a hover), drawn
  after the ghost's faces and depth pre-pass. The confirm's overlay draws none (`placement.test.ts`, "the tile in hand's outlines").
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
  size. `segmentOffDevicePx` 0.5 and `segmentFullDevicePx` 1 (`OutlineSettings`, `core/outlines.ts`): the vertex shader
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
- Camera limits (`camera.minDistance` 10 = `CLOSEST_DISTANCE`, `maxDistance` 300, optional `capZoomOut` at 150) apply to the web
  controller only; `NativeCameraController` ignores them. The near plane is 5 (`CAMERA_NEAR`) and the closest zoom 10 keeps the
  tallest tile (2.625 units) beyond it at the steepest tilt: raise one only with the other (P4; a test reads every model's height).
- The play camera opens at 27 degrees (`PLAY_DEFAULT_POLAR_ANGLE`) and tilts from straight down to 54 (`PLAY_MAX_POLAR_ANGLE`):
  the right button on desktop, two fingers dragged up or down on touch (`DOLLY_ROTATE`; one finger pans). A second finger
  down cancels the tap (TILT-54, `docs/client/v2-architecture.md` 5.10).
- The home's Camera mode (#875) is `CameraMode` `"free"` (`GameCanvas`'s `cameraMode`, `BoardViewport`'s, the home's village only;
  the game boards stay `"play"`): the tilt from 15 to 85 degrees (`FREE_MIN_POLAR_ANGLE`, `FREE_MAX_POLAR_ANGLE`), the turn free, the
  right button or one finger turning, two fingers twisting (`bindTwist`), the pan on the ground (`screenSpacePanning` off, the
  target kept at y 0). Back to `"play"`, the tilt and the turn ease to the play view over `FREE_RETURN_MS` (600) in
  `CameraController.update`, the target and the distance kept; a cut under reduced motion. At low angles the closest zoom grows
  (`closestDistanceAt`: the tallest tops stay beyond the near plane on the frustum's lower edge, about 40 at 85 degrees).
- Change a default only with a capture and a figure (R-OUT, PR #411; stories "Renderer/Outlines" and "Renderer/Outlines
  comparison" in `packages/app/src/stories/renderer/`).

## Post-processing and the look

`core/Effects.ts` builds an `EffectComposer` from the look (`core/look.ts`, `LookSettings`), with `core/post-shaders.ts`. The
design is 5.5 (LIGHT) and the MSAA part of 5.2 (P4) of `docs/client/v2-architecture.md`; read those, not the 5.2 proposal.

- **The pass chain**, each pass only when its effect is on: `RenderPass` into a half-float target (not the canvas, so the
  canvas's `antialias` does not reach it), `AoPass` (High only), `UnrealBloomPass` (Medium and High), `FinishPass` (always),
  `SMAAPass` (only where it stands in for MSAA). `Effects.getPassNames()` lists them; `look.test.ts` ("the chain of passes")
  pins them. Turning an effect on or off rebuilds the chain; a changed value only sets uniforms (`chainKey`).
- **The sRGB transfer happens once, in `FinishPass`.** Through the composer three runs neither the tone map nor the sRGB
  transfer (there is no `OutputPass`): `FinishPass` does AO, tone map and exposure, grade, vignette, then
  `sRGBTransferOETF`. A new pass goes before it and stays in linear colour. A new final pass (or one after it, as SMAA is)
  must not encode again: a second transfer washes the board out. The outline colour `#1f1f1f` is written for that path (its
  CSS channels reach the screen unchanged).
- **The look**: `RendererSettings.lookPreset` ("mockup" by default, "soft", "off") and `look` (partial, over the preset; every
  light and effect a group with `enabled`). `setSettings` replaces, it does not merge. Lights, fog, the gold slot band and the
  water mask are `GameScene.applyLook` and `TileRenderer`. The render profiles (`play`, `showcase`, `showcaseCinematic`) only
  scale the exposure and the fog now (`render-profiles.test.ts`).
- **Quality tiers** (`TIER_EFFECTS`): a tier only turns effects off, never changes a value. Low: no AO, no bloom, shadow
  radius 1. Medium: bloom. High: AO too. `quality: "auto"` (the default, `resolveQuality`, `AUTO_QUALITY`) is Low on a coarse
  pointer, a small screen or a low-power device, Medium on a desktop, and High only by hand. **Provisional until LIGHT-GPU**
  measures each effect on the Mac's GPU: do not move a tier default without that run (`look.test.ts`, "quality tiers").
- **Face antialiasing**: `multisampling` is `"auto"`: MSAA on phones, none on desktops, where it costs about 4 ms of p95
  (`resolveFaceAntialiasing`, `face-antialiasing.test.ts`). SMAA stands in on software WebGL or without the samples. No
  FXAA, no edge pass. MSAA is **one** 4-sample composer target with its resolve: the finish pass swaps the composer's
  targets only when SMAA follows it, so the scene lands in the same target every frame and the second target is never
  bound, never allocated. Do not make the finish pass swap again (the scene would land in each target in turn, and both
  would have to multisample: twice the memory). `msaaSamples` is 4 by default; 2 saves 24 B/px but shimmers under a zoom
  as much as no MSAA (fails zero flicker). The canvas is created with `antialias: false`: every frame is drawn into the
  composer's target, so a multisampled canvas smooths nothing and holds 32 B/px (Q3-GPU, `docs/client/v2-architecture.md`
  5.2).
- A new pass or effect is a measured cost: see the bench. `resolveLook` also turns effects off for
  `EffectsCapabilities` (`effects-profile-fallback.test.ts`).

## Size, pixel ratio and shadows

- The canvas follows its container. `WebSurfaceAdapter` sets the canvas to 100 % width and height by CSS
  (`packages/renderer/__tests__/web-surface-adapter-resize.test.ts`), and `GameScene` sizes only the drawing buffer
  (`setSize(w, h, false)`). `WebSurfaceAdapter.onResize` fires on a `ResizeObserver` of the container, a window resize,
  and a change of the device pixel ratio (`matchMedia`, re-armed on each ratio; same test file and
  `packages/renderer/__tests__/surface-device.test.ts`). `GameScene.resize()` then refits the drawing buffer, the camera and the post-processing
  targets (`packages/renderer/__tests__/surface-adapter.test.ts`, "uses surface resize callback"). A hidden 0 x 0 container keeps the last size (`GameScene.resize()`; `packages/renderer/__tests__/surface-adapter.test.ts`, "keeps the last size while the container is hidden").
- The pixel ratio is `min(devicePixelRatio, maxPixelRatio)` (`capPixelRatio`, `core/settings.ts`). `maxPixelRatio`
  defaults to `"auto"`, which gives 2 on a coarse pointer or when the window's shorter side is at most 600 CSS px
  (`SMALL_SCREEN_PX`, `PIXEL_RATIO_CAPS.coarse`), and 1.75 elsewhere (`PIXEL_RATIO_CAPS.fine`; `resolveMaxPixelRatio`); a number is used as is.
  `packages/renderer/__tests__/outlines.test.ts` ("resolves the \"auto\" cap by device") pins the caps, `packages/renderer/__tests__/surface-adapter.test.ts` the ratio `GameScene` passes to
  `setPixelRatio`, and `packages/app/__tests__/board-pixel-ratio.test.tsx` that the app's board leaves the cap to "auto". A new cap through `setSettings` refits at once. The figures behind the caps are DPR's, in
  `docs/client/v2-architecture.md` 5.3, and Q3-GPU's re-measure of the desktop cap, in 5.5.
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

Models, tile images and the Draco decoder (`draco/`) load from `<basePath>` (`core/AssetLoader.ts`). Storybook serves
`packages/app/asset-sources/` at `/asset-sources` (`packages/app/.storybook/main.ts`, `src/mocks/assets.ts`): plain
`models/<key>.glb` and `assets/tiles/<key>.png`, no manifest unless a story hands one (`manifest` of `GameCanvas`).
`asset-loader-draco.test.ts` checks that the decoder loads only for a model that needs it. Add no remote URL for a model,
texture, decoder or font, in code or stories. Section 4.2 has the sizes and the measures; this is what to get right.

**The pipeline** (`packages/app`, committed outputs, each script has `--check` and a test that runs it):

- `packages/app/scripts/compress-models.ts`: the base models of `asset-sources/models/` and the Forest variants, meshopt-compressed, to
  `public/renderer-assets/models/<key>.<hash>.glb` and `models/forest/<plan>_HF_<n>.<hash>.glb`. The hash is the first 10 hex
  digits of the file's SHA-256.
- `packages/app/scripts/compress-tiles.ts`: the 19 plan images, 256 px, to `tiles/<plan>.256.<hash>.png`. `--check` compares decoded
  pixels, not bytes. The 1680 px originals stay in `asset-sources/` for Storybook; the v2 build ships none.
- `packages/app/vite/renderer-assets.ts` builds `manifest.json` from the file names, in dev and at build, and fails on a wrong hash:
  `{ models: { plan: path }, themes: { "<theme id>": { plan: [variant paths in order] } }, tiles: { "256": { plan: path } } }`.
  `AssetLoader` reads it once per base path (`loadManifest`); no manifest, or a plan it does not list, means the plain names.
  A changed source file means running the script (no `--check` failure in CI): never edit a hashed file or the manifest by
  hand. Tests: `renderer-manifest.test.ts`, `renderer-models-edges.test.ts` (the compressed models give the originals' outline
  segments), `asset-loader-order.test.ts`, `asset-loader-tiles.test.ts`.

**The loader's rules** (`AssetLoader`, `core/load-order.ts`; `asset-loader-order.test.ts`, `skins.test.ts`):

- The first frame waits only for the models of the tiles `GameScene` was handed (`want`; every model when none), and for the
  19 tile images. The rest load after that frame (`afterFirstFrame`). A model that comes later is drawn then
  (`AssetLoader.onLoaded`, with a new frame and shadows).
- A failure among the first models rejects `init`, so the app shows its plan view. A failed tile image does not stop the
  scene: it is logged and tried again after the first frame.
- **Only the plan view's `getTexture` makes an image failure fatal**, and only when the plan view asks before the loader has
  chosen, right after the manifest is read (`want([], true)` before `preloadAll` chooses; asked later, a failure is logged). The placeholder quad reads `peekTexture`, which asks for nothing and
  never counts as the plan view asking. Do not call `getTexture` from the board's path.
- **A skinned plan's base model loads only as a fallback** (SKIN-BASE): when the plan has no skin, the skin read failed or
  was late, the manifest lists no variant, or a variant failed. For a plan whose skin is known (`setSkins`) and listed, nothing
  asks for its base model: not the first frame, not `preloadAll`'s rest, not a scene handed no tiles. `preloadModels`
  (`BoxRainScene`) is unchanged.

## Skins and the placeholder quad

Design: section 5.6 of `docs/client/v2-architecture.md`.

- `GameScene.setSkins` (and `GameCanvas`'s `skins`) hands `TileSkins` (plan key to theme id) to `TileRenderer`, which keys its
  shared models by model id: a plan key, or a variant's path. A variant loads once and is shared by its tiles.
- **The variant** is `variantHash` of `core/skins.ts`, origin/dev's `getVarietyModelPath` hash over `${PLAN}${x}${y}${gameId}`
  in 32-bit integers, then `abs(hash) % count` of the plan's own variants. It must stay bit for bit what dev computed (every
  viewer and reload sees the same board): `skins.test.ts` pins values. **Theme 0, a theme the manifest does not list, a plan
  with no variants, and a host with no manifest draw the base model** (`skinModelPath`).
- **The placeholder quad.** A tile with no model drawn yet (variant or base on its way, at its first draw or after a
  placement) draws its plan's image on a flat quad at `PLACEHOLDER_HEIGHT` (the ground's top), with its square's outline. It
  downloads nothing. A model already drawn stays until the next is in: the quad is only for a tile with none.
- **The swap order**: when a model comes in, `AssetLoader.onLoaded` redraws the tiles; the model is added to the tile group,
  then the quad removed, in that one call, before the next frame. Never remove first (an empty frame) or leave both.
- The quad reads its own `Texture` copy as sRGB (the plan view's stays as is: one colour space cannot serve both). One quad
  geometry and outline for every plan, one material per plan, all disposed by `TileRenderer.dispose()` (not the loader's
  images). The quad casts no shadow and has no water mask. `tile-placeholder.test.ts` covers the swap, the ghost, a live
  switch of skins, failed variants and images, and the dispose counts.

## Tests

- A fake `AssetLoader` handed to `TileRenderer` needs: `setSkins` (every `TileRenderer.setSkins`), `has` and `want` (every
  model lookup, `modelOf`), `getModel` (a tile's model), `getTexture` (the plan view), `skinModel(key, skin)` (`modelOf`, as
  soon as a plan has a skin: a fake without it throws after `setSkins`) and `peekTexture(key)` (the placeholder quad,
  whenever a tile or the ghost has no model yet). No existing fake has all of them: `tile-placeholder.test.ts`'s
  `fakeAssets()` has all but `skinModel` (its skinned tests use a real `AssetLoader`), and `tile-renderer.test.ts`'s has
  `has`, `want`, `setSkins`, `getModel` and `getTexture` but no `peekTexture` or `skinModel`, and works only because its
  `has` is always true and no tile has a skin. A fake `GameScene` class for a React test needs `setSkins`
  (`packages/renderer/__tests__/helpers/hooks.ts`).
- `@paved/renderer` is consumed through its `dist` (`main` and `exports`). `bun run test --filter` builds it first (turbo);
  **Storybook does not**: `bun run --filter @paved/app build-storybook` and `storybook dev` read a stale or missing `dist`, so
  `bun run build --filter @paved/renderer` first, and again after each renderer change.

## The bench

Frame time is measured with the bench, not by eye or by rAF intervals (a rAF figure cannot pass the display's refresh).
Method: `docs/measures/client-baseline.md`. Its driver and bench page left with app-web (removed in P-70; see git history):
`packages/app` has no bench page yet, so a frame-time run needs one first (report the need).

- A figure states: the machine, the **window mode** (on screen, off screen, headless), the GPU or software rendering, the
  profile (`unthrottled`, or `throttled`: CPU 4x and a 60 Hz cap), the tile count (38, 72), the run count, the window size,
  and the commit. Frame time is **CPU + GPU per frame, p95**, from the raw runs, beside draw calls and triangles.
- The phone profile is 360 x 780 at DPR 3 with the CPU throttled 4x: an approximation, since it runs on the Mac's GPU. The
  desktop profile is 1440 x 900 at DPR 2. The rules: the highest pixel-ratio cap whose CPU + GPU p95 stays under 12 ms on
  the desktop profile at both views (distances 240 and 170), and under 16.6 ms on the phone profile (240 and 280); the
  outlines forced `"on"`, 120 warm-up and 600 measured frames in a fresh context, rounds alternated, the load average stated.
- `--headless` is software rendering: a smoke run on Linux or any machine with no GPU. Its figures are not measures, and the
  driver refuses `--out` under `docs/measures/`. A figure needs a GPU run on the Mac. A capture taken on software WebGL
  (SwiftShader) is marked as such, with the outlines off there: it shows layout and colour, never a frame time or the
  outlines.
- On the Mac a run opens no visible window while the owner uses the machine, and the driver has no hidden GPU mode
  (`--offscreen` still opens windows; `--headless` is software rendering): do not start a Mac run yourself; report the need.
  `docs/measures/client-baseline.md` and the bench driver's header still name `--offscreen` for the Mac, which is out of
  date; fixing those files is a separate task.
- No figure that was not measured: write "estimate" for the rest. A committed measure goes under `docs/measures/` with its
  method.

## Commands

From the repository root, with the heap capped as `AGENTS.md` says: take each package's figure from its table, never
`prlimit --as` for Node.

```sh
NODE_OPTIONS=--max-old-space-size=<MB> bun run test --filter @paved/renderer   # <MB>: AGENTS.md's row for the package
NODE_OPTIONS=--max-old-space-size=<MB> bun run test --filter @paved/app
bun run build --filter @paved/renderer
NODE_OPTIONS=--max-old-space-size=2048 bun run --filter @paved/app build-storybook
```

Storybook takes 2048 MB (what the briefs use; `packages/app/README.md` still says 1536). Run the package you touched; the
whole suite is the CI's.

`bun run build --filter @paved/app` ends with the bundle budget (`packages/app/scripts/bundle-budget.ts`, limits in
`packages/app/scripts/bundle-budget.json`): it fails when a metric passes its limit. The `board` chunk, which holds the renderer and
three, is the largest route, so it sets `largestRoute` (854,735 B raw against 872,448 on 2026-10-16). A renderer change that
grows it raises that limit in `packages/app/scripts/bundle-budget.json` in the same PR, with the measured size.

## Done when

A state change ends in `requestRender()`; no per-tile geometry or material; `dispose` frees what the change allocates;
the settings carry any new knob with a default and a test; a new final pass keeps the single sRGB transfer; no remote asset;
a changed model or tile image went through its script (`--check` clean); a frame-time claim has a bench figure with its
machine and window mode; the renderer and app tests pass, Storybook builds, and the app's build stays inside the bundle budget.
