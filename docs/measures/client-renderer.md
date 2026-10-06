# Client renderer step: shared geometry and materials, no per-tile edges (P-7b)

Measured on 2026-10-06, on the owner's Mac, with the bench of baselines B and C
(`docs/measures/client-baseline.md`), unchanged. Track CLIENT, objective 2. What the player sees is
unchanged (see Visual parity).

## Result in one paragraph

At 72 tiles, throttled (CDP CPU 4x, 60 Hz), **time to interactive falls from 6.2 s to 0.85 s**, and
from 1.42 s to 0.24 s unthrottled. A click shows its tile in 34 ms (p95) instead of 115 ms. Draw calls
per median frame fall from 207 to 137 and triangles from 1.7 M to 0.74 M. In the real Game page, long
tasks fall from 17 to 1 per minute of play. That one is the first transaction signature of the session
(starknet.js), not the renderer. Every P-7b target is met but one: "no long task > 50 ms per
placement" fails once per session, on that first signature. Three changes made this:
- tiles share their type's geometry, materials and edge outlines;
- the outlines are built by a faster function that gives three's exact segments;
- the shadow map is drawn only when the tiles change.

Instancing was tried and dropped: it did not pay.

## Targets (P-7b)

At 72 tiles on the M2 Max, under CDP CPU throttling 4x and a 60 Hz cadence unless said. "Before" is
baseline C (throttled) or B (unthrottled), "after" is this step, with the same commands, profiles and
run counts. Medians of runs, unless the row says pooled.

| P-7b target | Before | After | |
|---|---|---|---|
| CPU + GPU time per frame, p95 <= 16.7 ms | 8.93 ms (C) | **6.31 ms** | met |
| No frame over 1.5 intervals: board, camera path | 0.0 % (C) | **0.0 %**; worst CPU + GPU frame 12.3 ms (36.7 ms before) | met |
| No frame over 1.5 intervals: in play (Game page) | 0.7 % | **0.1 %** (3 runs, 0.1-0.1) | not met: see below |
| Time to interactive <= 2.0 s, throttled | 6178 ms (C) | **848 ms** (819-891) | met |
| Time to interactive <= 0.5 s, unthrottled | 1424 ms (B) | **238 ms** (237-245) | met |
| Click to display p95 <= 50 ms, throttled (pooled, 120 clicks) | 115.4 ms (C) | **33.6 ms** | met |
| No long task > 50 ms per placement, throttled (in play, 8 placements per session) | 17 per session, 51 of 52 after a placement | **1 per session** (56-58 ms), on the first placement only | not met: see below |
| Draw calls per median frame below baseline B (207) | 207 (C) | **137** | met |
| Triangles per median frame below baseline B (1,695,576) | 1,681,492 (C) | **735,122** | met |

*CPU + GPU per frame* is the sum, frame by frame, of the render-loop tick and the GPU timer query
(from each run's raw `cpuMs` and `gpuMs`). Its p95 is taken per run, then the median over the 5 runs.
The bench's summary tables give the two parts apart. Baseline C has no such row, so its figure here
is computed from its committed raw runs the same way.

**What would close the two that are not met.**
- *The long task* is the first `signTransaction` of the session in the chain layer: 64 ms inclusive,
  49 ms of it in the first-use precomputation of the elliptic-curve tables (`getPrecomputes`, `wNAF`),
  from a CPU profile of the first placement (`client-renderer/first-placement-profile/`). The pending
  tile is already on screen when it starts, about 60 ms after the confirm key. The other 7 placements
  of each session have no long task. To close it, warm the signer up when the game page loads, or sign
  off the main thread. That is chain work (objective 3 or a small task of its own), not the renderer.
- *Frames over 1.5 intervals in play*: about one frame per minute of play. The board bench, which
  renders the same scene along the camera path, has none. These frames fall during placements and
  polls: React commits and the chain call. They are not long frames of the renderer.
  - React commits: render time per quiet poll p95 is 15.9 ms throttled.
  - The chain call: see the long task above.

  Objective 3 removes the polling, and with it most of these commits.

## Steps and their effect

Each step was measured on the throttled 72-tile board, with 1 warm-up and 3 runs (the final figures
above use 5). Raw runs are under `client-renderer/steps/`. Load average: 1.8-5.6.

| Step | TTI (ms) | CPU p50 / p95 (ms) | GPU p50 / p95 (ms) | Draw calls | Triangles (median frame) | Kept |
|---|---|---|---|---|---|---|
| Baseline C (5 runs) | 6178 | 2.0 / 4.0 | 4.56 / 5.52 | 207 | 1,681,492 | |
| 1. Shared geometry and materials (no per-tile clone) | 5077 | 1.4 / 2.4 | 3.96 / 5.57 | 207 | 1,681,492 | yes |
| 2a. Edge outlines built once per tile type and shared | 1881 | 1.3 / 2.5 | 4.00 / 5.14 | 207 | 1,681,492 | yes |
| 2b. Faster edge builder (same segments) | 819 | 1.2 / 2.2 | 3.69 / 5.32 | 208 | 1,695,576 | yes |
| 3. Shadow map drawn only when the tiles change | 800 | 1.0 / 1.9 | 3.23 / 4.54 | 137 | 735,122 | yes |
| 4. Instancing per tile type (prototype) | 837 | 1.0 / 1.8 | 3.56 / 4.59 | 102 | 975,430 | **no** |

1. **Shared geometry and materials.** Before, `AssetLoader.getModel` deep-cloned each tile's GLB
   geometry and material, and `TileRenderer` cloned both again. Now a tile is a clone of its type's
   model, built once per plan type, and shares the geometry and the tuned material.
   - The pending, strategy and slot materials are shared too.
   - A tile owns no GPU resource: removing it disposes nothing, and `TileRenderer.dispose()` frees the
     shared ones.
   - `getModel` still gives each caller its own materials, so the hover preview can tint them. It no
     longer copies the geometry, which it shares read-only.

   Effect: TTI -18 %, CPU per frame -30 % (fewer material and program switches), JS heap at
   interactive halved (133 MB to 63 MB).
2. **Edges once per type (2a)**, then **faster (2b).** Each tile type's outlines (`LineSegments` over
   its geometry) are built once and shared.
   - 2a: 72 builds become at most 19, one per type present. TTI 5.1 s to 1.9 s.
   - 2b: `buildEdgesGeometry` (`packages/renderer/src/core/edges.ts`) replaces three's
     `EdgesGeometry`.
     - Same algorithm, same output. It welds each vertex once by its rounded position, with a number
       key, and keys edges by number, where three builds six strings per triangle.
     - `__tests__/edges.test.ts` checks that its segments equal `EdgesGeometry`'s, in order, on
       procedural geometries and on all 19 tile models.
     - About 6x faster in Node on the 19 models (88 ms against 551 ms).
     - TTI 1.9 s to 0.82 s.

   The outlines get `renderOrder` 1 so that they draw after the tile faces (see Visual parity).
3. **Shadow map on change.** The directional light and its shadow camera are fixed, so the shadow
   map depends only on the shadow casters, which are the tiles. It was redrawn on every frame
   (`shadowMap.autoUpdate`). Now `GameScene` sets `autoUpdate = false` and asks for one redraw when the
   tiles change:
   - updates of the tiles;
   - strategy mode;
   - compass rotation.

   The hover preview, the slots and the characters cast no shadow.
   - Effect: on frames where only the camera moves, the shadow pass goes away. Draw calls per median
     frame fall 207 to 137, triangles 1.7 M to 0.74 M, GPU p50 -12 %, CPU p50 -17 %.
   - The screenshots are identical, to the pixel, with and without this step.
   - Covered by `__tests__/game-scene-shadow-map.test.ts`.
4. **Instancing (dropped).** The prototype put each tile type's faces into one `InstancedMesh` (the
   outlines stayed per tile; three has no instanced lines). Its diff is in
   `client-renderer/steps/4-instancing-dropped/prototype.diff`. Against step 3:
   - draw calls fell from 137 to 102, but triangles rose from 735 k to 975 k: an instanced mesh is
     culled as a whole, so a zoomed view draws every instance;
   - GPU p50 rose (3.23 to 3.56 ms), and CPU per frame did not move (1.0 ms p50);
   - 0.1-1.4 % of the pixels changed: the instance matrices give slightly different depths where
     lines meet faces.

   The draw-call target was met already without it. Dropped.
5. **A placement adds one tile.** `TileRenderer.updateTiles` already skipped tiles it had drawn. A
   placement now costs one clone of a type built once, plus that type's edges the first time it
   appears. No other tile is rebuilt: `__tests__/tile-renderer-placement.test.ts`. No code change was
   needed beyond steps 1-2.

## Final figures

Same commands as baselines B and C, 1 warm-up each:
- board: 5 runs per size and profile;
- click: 5 runs of 24 placements;
- in play: 3 sessions of 60 s.

Full tables: `client-renderer/summary.md` (board, unthrottled), `client-renderer/throttled/summary.md`,
`client-renderer/click/summary.md`, `client-renderer/play/summary.md`. Raw JSON of every run is next to
them.

### Board

| Figure | B unthrottled 38 / 72 | After unthrottled 38 / 72 | C throttled 38 / 72 | After throttled 38 / 72 |
|---|---|---|---|---|
| Time to interactive (ms) | 872 / 1424 | **227 / 238** | 3257 / 6178 | **776 / 848** |
| CPU per frame p50 / p95 (ms), 72 | 0.9 / 2.6 | 0.9 / 2.1 | 2.0 / 4.0 | 1.1 / 2.3 |
| GPU per frame p50 / p95 (ms), 72 | 3.31 / 5.02 | 3.50 / 4.76 | 4.56 / 5.52 | 2.46 / 4.34 |
| CPU + GPU per frame p95 (ms), 72 | 6.74 | 6.70 | 8.93 | 6.31 |
| Draw calls, median frame | 147 / 207 | **109 / 137** | 147 / 207 | **109 / 137** |
| Triangles, median frame | 997,700 / 1,695,576 | **486,230 / 749,206** | 997,700 / 1,681,492 | **486,230 / 735,122** |
| Frames over 1.5 intervals (%) | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| JS heap at interactive (MB) | 83.4 / 127.8 | 51.1 / 59.6 | 85.8 / 132.7 | 48.8 / 51.1 |

The frame interval is still capped by the cadence: p95 9.3 ms unthrottled at 120 Hz, 17.5 ms
throttled at 60 Hz, with no missed frame (see baseline C for why a p95 of the interval cannot read
<= 16.7 ms at 60 Hz). Unthrottled, the GPU p50 at 72 tiles is no lower than B's (3.50 against 3.31 ms;
its range 3.37-4.02 overlaps). The scene pass draws the same triangles as before, and on this GPU the
shadow pass was cheap next to it. The shadow pass's share shows throttled (4.56 to 2.46 ms p50).

### Click to display (`click/`)

| Pooled over 120 placements (ms) | unthrottled 38 | unthrottled 72 | throttled 38 | throttled 72 |
|---|---|---|---|---|
| p50, before (B/C) -> after | 34.7 -> **12.7** | 36.6 -> **12.3** | 81.7 -> **25.8** | 85.5 -> **25.7** |
| p95, before -> after | 45.5 -> **18.7** | 48.0 -> **15.3** | 107.5 -> **35.1** | 115.4 -> **33.6** |
| max, before -> after | 59.8 -> 35.3 | 66.2 -> 35.3 | 134.4 -> 65.2 | 132.5 -> 35.0 |

### In play (`play/`)

| Figure, 72 tiles, real Game page | unthrottled before -> after | throttled before -> after |
|---|---|---|
| Time to interactive (ms) | 1461 -> **332** | 6173 -> **1152** |
| Frames over 1.5 intervals (%) | 0.4 -> **0.0** | 0.7 -> **0.1** |
| Long tasks > 50 ms per 60 s session | 0 -> 0 | 17 -> **1** |
| Long tasks, total per session (ms) | 0 -> 0 | 1454 -> **57** |
| Confirm key to presented frame p50 / p95, pooled (ms) | 50.2 / 66.1 -> **13.9 / 30.8** | 128.5 / 153.4 -> **27.0 / 47.1** |
| Commit render time p95, pooled (ms) | 4.6 -> 5.1 | 8.2 -> 7.2 |
| Render time per quiet poll p50 / p95 (ms) | 5.1 / 8.2 -> 6.0 / 9.4 | 13.2 / 29.5 -> 11.0 / 15.9 |

Polling is untouched (objective 3): still 3 React commits per poll. Its render time is React's, and it
moves within the spread of the runs. The in-play TTI includes the Game page's own start (providers,
first Torii queries), hence its 1.15 s throttled against 0.85 s for the board alone.

### Where the load goes now

CPU profile of one throttled 72-tile load (`client-renderer/profile-after-throttled/`, against
`client-renderer/profile-before-throttled/` taken before any change, same command):

| | Before | After |
|---|---|---|
| Load phase sampled (ms) | 7248 | 1785 |
| Idle in it (ms) | 989 | 990 |
| Building the tiles (`TileRenderer.updateTiles`, inclusive) | 5417 | 283 |
| of which edges (`EdgesGeometry`, then `buildEdgesGeometry`) | 4425 | 242 |
| Rendering (`GameScene` render loop, inclusive) | 226 | 143 |

What is left of the build is the edges of the up to 19 tile types present. Building them at load
time is now the largest single cost, at 242 ms throttled (about 60 ms unthrottled, an estimate: a quarter of the throttled figure). Two ways to cut it further, if a
target asks:
- precompute the outlines with the models;
- build them in a worker.

## Visual parity

`client-renderer/screenshots.ts` takes the screenshots: it uses the bench page's click mode and fixed
cameras. Four views per board (38 and 72 tiles), saved as PNG:
- the whole board top-down;
- a tilted mid view;
- a close tilted view;
- a close view of a pending tile placed with a real click.

The script then diffs two sets pixel by pixel. Before is the base commit `7d8e57e`; after is this
branch. Both were taken in the same Chrome on the same Mac, and two before-runs differ by 0 pixels, so
the capture is deterministic. Files: `client-renderer/screenshots/before/`,
`client-renderer/screenshots/after/`, table `client-renderer/screenshots/diff.md`.

| Screenshot | Pixels that differ (of 1,170,720) | Max channel difference |
|---|---|---|
| 38 overview / mid / close / pending | 22 / 42 / 3 / 7 | 198 / 144 / 43 / 46 |
| 72 overview / mid / close / pending | 37 / 116 / 1 / 3 | 244 / 199 / 20 / 55 |

At most 0.01 % of a frame differs, and only on the borders between tiles. In the top-down overview,
the differing pixels sit on a few columns 47 px apart, which is one cell. They are pixels of a black
edge line where two tiles meet: a line and a neighbour's face are at equal depth there, and the one
drawn last wins.
- Before, each tile had its own line material, so a tile's lines were drawn right after its own faces
  and before the faces of the tiles created later. Which tile won a shared border depended on the order
  the tiles were created in.
- Now all lines are drawn after all faces (`renderOrder` 1), so the line always wins.

With step 1 alone and no render order, 0.1-2.1 % of the pixels differed: all the lines were drawn
first and the faces covered them. The render order fixed that. This difference is kept: it is not
visible at the size of a cell, and it removes an artefact of creation order.

Gameplay, picking and hover are covered by the renderer tests (85, including new tests for edges,
sharing, placement and the shadow map) and app-web's (127). Picking does not depend on meshes: it is
`screenToGrid` on the ground plane. The hover preview keeps its own tinted materials, and its tests
are unchanged.

## Machine and load

The machine of baselines B and C:
- Mac14,6, Apple M2 Max, 64 GB, macOS 27.0.1 (26A434), on AC power;
- Chrome 154.0.8037.98, window 1440 x 900 on the built-in 120 Hz display;
- a desktop session in normal use.

The 1-minute load average after each run (`driver.loadAvg` in the raw files):

| Runs | Load average |
|---|---|
| Board, unthrottled | 2.1-4.0 |
| Board, throttled | 2.6-4.8 |
| Click | 1.2-3.3 |
| In play | 1.3-3.3 |
| Steps | 1.8-5.6 |

## Rerun

```sh
cd packages/app-web
bun run bench --out ../../docs/measures/client-renderer
bun run bench --profiles throttled --out ../../docs/measures/client-renderer/throttled
bun run bench --click --out ../../docs/measures/client-renderer/click
bun run bench --play --out ../../docs/measures/client-renderer/play
bun run bench --profiles throttled --profile-only --out ../../docs/measures/client-renderer/profile-after-throttled
# parity screenshots (after `bun x vite build -c vite.bench.config.ts --outDir <dir>`)
bun ../../docs/measures/client-renderer/screenshots.ts shoot <dir> <out>
bun ../../docs/measures/client-renderer/screenshots.ts diff <before> <after>
```

The first-placement profile came from a scratch copy of the driver: profiler on, from the first
placement to 1.5 s after it. `scripts/bench` itself is unchanged. That profile is a diagnostic only:
none of the figures above comes from it.

## Limits

- One machine and one strong GPU, as in B and C. The throttled profile slows the page's CPU, not the
  GPU.
- The step rows use 3 runs; only the final figures use the run counts of B and C.
- Screenshots cover the voxel view at four cameras, with no hover preview on screen and no strategy
  mode. Strategy tiles now share one box geometry, one side material, and one top material per type
  and orientation. They are covered by tests only.
