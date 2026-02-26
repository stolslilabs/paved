# React Native Three.js Adaptation - TDD PRD

## Document Control
- Owner: Platform + Client Engineering
- Status: In progress
- Last updated: February 26, 2026
- Target stack: `packages/*` monorepo only (`app/` is deprecated)

## 1. Problem Statement
`@paved/renderer` is currently web-canvas coupled and blocks a React Native client rollout.

Current blockers in the renderer package:
- `HTMLCanvasElement` is a hard requirement in renderer config (`packages/renderer/src/core/types.ts`).
- DOM canvas mounting is required in React entrypoint (`packages/renderer/src/react/GameCanvas.tsx`).
- Browser APIs are used in core scene lifecycle (`window.devicePixelRatio`, `ResizeObserver`, pointer events in `GameScene`).
- Camera controls depend on DOM-bound `OrbitControls` (`packages/renderer/src/core/CameraController.ts`).

We need a native-ready renderer path that preserves game behavior and interaction semantics without destabilizing web.

## 2. Product Goal
Deliver a React Native renderer path that:
1. Runs the board in real-time on iOS and Android.
2. Preserves gameplay-critical behavior (tile targeting, placement previews, camera mode semantics).
3. Maintains web parity via shared core logic.
4. Is implemented test-first (strict TDD) with objective performance and stability gates.

## 3. Non-Goals (Phase 1)
- Perfect visual parity for all post-processing effects (SSAO/bloom/vignette).
- Migrating all web UI/flows in a single PR.
- Rewriting core game domain packages (`@paved/game-core`, `@paved/chain`, `@paved/ui`) unless tests show hard native incompatibility.

## 4. Success Criteria
### Functional
- User can open game scene on iOS and Android.
- User can pan/zoom camera and toggle `play/showcase` mode.
- User can tap a tile location and receive the same grid coordinate mapping semantics as web.
- Hover/preview logic is adapted to touch semantics (tap-hold/selection preview) with no false placements.

### Quality
- Crash-free during 30-minute continuous session on both platforms.
- No memory growth trend after repeated load/unload cycles.
- p95 frame time under 25ms on reference mid-tier device (>=40 FPS p95).

### Delivery
- All new behavior lands with failing tests first and documented RED->GREEN evidence in PR.
- Existing web tests remain green.

## 5. Users and Use Cases
### Primary users
- Existing web players moving to mobile.

### Core use cases
- Join/open active game.
- Place and rotate tile with accurate targeting.
- Place character markers with same gameplay rules.
- Switch camera mode for precise placement vs cinematic browse.

## 6. Constraints and Assumptions
- Monorepo remains Bun + Turbo managed.
- Active development remains in `packages/*`.
- Web client (`packages/app-web`) must not regress during migration.
- Native package will be introduced as `packages/app-native`.

## 7. Proposed Architecture (Target State)
## 7.1 High-level plan
Split renderer into:
- Platform-agnostic core (`scene graph, math, tile/char rendering, rules-driven visuals`).
- Platform adapters (`surface lifecycle, input events, resize/dpr, camera gesture plumbing`).

## 7.2 Modules to keep shared
- `TileRenderer`
- `CharRenderer`
- `interaction.ts` pure math helpers (`screenToGrid`, `isClick`, throttling utility)
- Render profile logic

## 7.3 Modules to refactor for platform abstraction
- `RendererConfig` and canvas type in `core/types.ts`.
- `GameScene.init` surface lifecycle and resize handling.
- Input wiring in `GameScene.setupInteraction`.
- `CameraController` (DOM `OrbitControls` coupling).

## 7.4 Native entrypoint
Add native renderer entrypoint in `@paved/renderer`:
- `src/react-native/GameCanvasNative.tsx`.
- Export map path `@paved/renderer/react-native`.

## 7.5 Native app package
Add `packages/app-native` (Expo) that consumes:
- `@paved/game-core`
- `@paved/chain`
- `@paved/ui`
- `@paved/renderer/react-native`

## 8. TDD Strategy
## 8.1 TDD law for this project
No production adaptation code without a failing test first.

For each story:
1. Write minimal failing test.
2. Run targeted test and capture expected failure reason.
3. Write minimum code to pass.
4. Run targeted suite + regression suites.
5. Refactor only with green tests.

## 8.2 Test pyramid
- Unit tests (majority): platform abstractions, math, gesture translation, lifecycle behavior.
- Integration tests: scene init/update/dispose with fake native surface adapter.
- Device smoke/E2E: launch, render, interact, and recover across background/foreground.

## 8.3 New test suites to add
Renderer package:
- [x] `packages/renderer/__tests__/surface-adapter.test.ts`
- [x] `packages/renderer/__tests__/native-input-mapper.test.ts`
- [x] `packages/renderer/__tests__/game-scene-native-lifecycle.test.ts`
- [x] `packages/renderer/__tests__/camera-controller-native.test.ts`
- [x] `packages/renderer/__tests__/effects-profile-fallback.test.ts`

Native app package:
- [x] `packages/app-native/__tests__/game-screen-render.test.tsx`
- [x] `packages/app-native/__tests__/game-screen-interaction.test.tsx`
- [x] `packages/app-native/__tests__/resume-recovery.test.tsx`

## 8.4 Definition of RED evidence in PR
Each task PR must include:
- Command run for failing test.
- Short failure excerpt proving behavior was missing.
- Command run for passing test after implementation.

## 9. Delivery Plan (TDD Epics)
## Epic 0 - Baseline and Safety Nets
Goal: lock current behavior before adaptation.

Stories:
1. Add characterization tests for current web `GameScene` lifecycle and click mapping.
2. Add regression test for camera mode semantics (`play` clamps / `showcase` freer orbit).
3. Add perf harness stub for scene update timing.

Acceptance:
- Web renderer suite remains green.
- Baseline outputs committed for later comparison.

## Epic 1 - Platform Abstraction Layer
Goal: make core scene platform-neutral without changing behavior.

Design:
- Introduce `RenderSurfaceAdapter` interface:
  - getSize()
  - getDevicePixelRatio()
  - onResize(cb)
  - bindInput(handler)
  - unbindInput()
- Introduce `CameraInputAdapter` interface to decouple from `OrbitControls`.

TDD stories:
1. RED: `GameScene` can initialize with adapter interface instead of `HTMLCanvasElement`.
2. RED: Resize callback updates renderer and camera from adapter values.
3. RED: Input events mapped through adapter still call tile click/hover callbacks.
4. RED: Disposal unregisters all adapter listeners.

Acceptance:
- Existing web path works via `WebSurfaceAdapter`.
- No DOM types in public core config contracts.

## Epic 2 - Native Input + Camera Controls
Goal: recreate interaction semantics on touch devices.

Design:
- Implement native gesture mapping:
  - single tap -> tile click candidate
  - drag -> pan camera
  - pinch -> dolly/zoom
  - two-finger rotate optional in showcase mode
- Preserve click-vs-drag threshold logic equivalent to `isClick` behavior.

TDD stories:
1. RED: tap within threshold produces click event.
2. RED: drag beyond threshold suppresses click and pans camera target.
3. RED: pinch updates camera distance within min/max bounds.
4. RED: `play` and `showcase` mode constraints match web semantic tests.

Acceptance:
- Grid targeting parity against existing `screenToGrid` test vectors.
- Gesture conflicts (pan vs tap) are deterministic and tested.

## Epic 3 - Native Scene Rendering MVP
Goal: render full board and character data on RN.

Design:
- Create `GameCanvasNative` wrapper and native scene host.
- Start with effects fallback profile (no SSAO/bloom/vignette if unsupported/unstable).
- Keep tile and character mesh generation shared.

TDD stories:
1. RED: native canvas host mounts and initializes `GameScene` once.
2. RED: tile updates render expected mesh count transitions.
3. RED: character updates render expected marker count transitions.
4. RED: unmount disposes renderer/assets and no retained listeners remain.

Acceptance:
- iOS and Android smoke pass on physical device.
- No crash on mount/unmount loop (50 cycles).

## Epic 4 - App Integration (`packages/app-native`)
Goal: playable mobile game loop integrated with shared packages.

Design:
- Native `GameScreen` analog to web `GamePage`.
- Reuse store/actions from `@paved/ui` and `@paved/chain`.
- Adapt hover-centric UX to touch selection UX.

TDD stories:
1. RED: scene receives tile/character state from store updates.
2. RED: tap selects target tile and updates store coordinates.
3. RED: confirm action produces optimistic tile and clears on failure.
4. RED: camera mode toggle updates renderer mode.

Acceptance:
- End-to-end placement loop works in dev environment.
- No regressions in shared package tests.

## Epic 5 - Performance and Reliability Hardening
Goal: ensure production viability.

TDD stories:
1. RED: frame budget guard fails when update workload exceeds threshold in perf harness.
2. RED: background/foreground transition loses GL context without recovery.
3. RED: memory leak sentinel fails after repeated load/dispose.
4. RED: fallback effects profile engages on low-capability device flag.

Acceptance:
- Meets p95 frame and stability metrics.
- Production readiness checklist signed off.

## 10. Detailed Test Cases
## 10.1 Core math parity
- `screenToGrid` same outputs for shared fixtures across web/native camera matrices.
- Compass rotation compensation unchanged.
- Edge cases: near parallel ray, extreme zoom, negative coordinates.

## 10.2 Interaction correctness
- Tap-down/up within threshold emits one click.
- Drag emits zero click and updates camera target.
- Hover replacement behavior under touch (selected tile preview) is deterministic.

## 10.3 Lifecycle robustness
- Scene init idempotence: no double binding.
- Dispose fully tears down input and resize handlers.
- Context loss/recreation path restores scene without duplicated meshes.

## 10.4 Rendering correctness
- Tile add/remove diff updates mesh map correctly.
- Pending tiles render pending style and clear when confirmed.
- Character billboards orient to camera each frame.

## 10.5 Cross-package integration
- `@paved/chain` hooks update native screen without browser globals.
- `@paved/ui` state transitions work in RN runtime.
- `@paved/game-core` rules still drive placement validity.

## 11. Implementation Backlog (Initial Ticket Breakdown)
- [x] Add adapter interfaces and web adapter implementation.
- [x] Refactor `GameScene` to adapter-based init.
- [x] Add native adapter scaffolding with mocked tests.
- [x] Add native camera controller implementation.
- [x] Add `GameCanvasNative` entrypoint and exports.
- [x] Create `packages/app-native` shell screen with renderer mount.
- [x] Wire shared data flow (tiles/chars/camera mode).
- [x] Add touch-based selection UX parity.
- [ ] Add lifecycle recovery and perf instrumentation. (Lifecycle recovery implemented; perf instrumentation pending.)
- [ ] Device validation and release checklist.

## 12. Metrics and Observability
Required instrumentation in native app:
- Scene init duration (ms)
- Asset preload duration (ms)
- Average and p95 frame time
- Gesture-to-action latency (tap to highlighted target)
- GL context loss/recovery count
- Crash-free session rate

## 13. Risks and Mitigations
1. Risk: Post-processing instability/perf on mobile GPUs.
- Mitigation: default to reduced effects profile; gate heavy effects behind capability flag and tests.

2. Risk: Orbit semantics mismatch on touch.
- Mitigation: encode interaction semantics in tests (not implementation detail), then satisfy via native controller.

3. Risk: Hidden web assumptions in shared code.
- Mitigation: CI check for forbidden globals in shared packages and adapter boundaries.

4. Risk: Asset loading path issues on RN bundle system.
- Mitigation: asset resolver abstraction + integration tests with representative model/texture set.

## 14. Rollout Plan
Phase rollout:
1. Internal feature flag (`nativeRendererV1`) in app-native dev builds.
2. Dogfood with telemetry and perf gating.
3. Beta cohort with crash/perf monitoring.
4. General rollout once SLOs stable for two consecutive releases.

Rollback:
- Keep old fallback render mode (static board placeholder) for native if renderer initialization fails.

## 15. PR Requirements Template
Every implementation PR must include:
- Scope mapped to one epic or smaller.
- RED evidence (failing test command + failure reason).
- GREEN evidence (passing command output summary).
- Risk notes and follow-up tasks.
- Explicit statement that web renderer regression suite passed.

## 16. Open Decisions (Resolve Before Epic 2)
1. Native rendering host choice and constraints (imperative Three host vs RN fiber host) based on spike results.
2. Gesture library selection for deterministic pinch/pan/tap arbitration.
3. Minimum supported device profile and performance budget targets by tier.
4. Effects policy: parity-first vs performance-first defaults.

## 17. Kickoff Checklist
- [ ] Approve this PRD.
- [ ] Create tracking epic with the five epics above.
- [ ] Land Epic 0 characterization tests before any adaptation code.
- [x] Start Epic 1 with adapter interface RED tests.
