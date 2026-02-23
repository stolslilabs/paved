# Paved Client Reboot — Cross-Platform Monorepo with WebGPU

## Context

Paved is a Carcassonne-style on-chain tile game (Dojo/Starknet). The existing client (`/app/`) is a React 18 + R3F v8 + Three.js 0.162 WebGL-only SPA. It works but is web-only, uses outdated Dojo SDK (alpha.14), and has no WebGPU support.

We're rebooting the client as a monorepo that shares code between web (React 19 + Vite) and React Native (Expo + react-native-wgpu), with Three.js WebGPU rendering and automatic WebGL fallback.

**Key architectural decisions:**
- **Refactor, not rewrite** — 34 files of battle-tested game logic get extracted with minimal changes (3 contaminants to remove). No reimplementing tile compatibility, conflict detection, or scoring from scratch.
- **Pure Three.js scene manager** — No R3F dependency in core rendering. R3F on mobile requires a fragile `patch-package` hack; imperative Three.js works natively with react-native-wgpu. The scene manager is platform-agnostic; thin React/RN wrappers mount it to their respective canvas surfaces.
- **bun + Turborepo** for monorepo tooling.
- **Tamagui** for cross-platform UI components.

The existing `/app/` stays untouched. New code goes in `/packages/`.

---

## On-Chain Game Mechanics (Reference)

### What the game is

Players draw random tiles from a deck and place them on an infinite 2D grid, matching terrain edges (City, Road, Forest, Stop, Wonder). After placing a tile, they can optionally place a character meeple to claim a structure. When structures complete (fully enclosed), they score points. Tournaments run daily/weekly with ETH prize pools.

### Contracts (Cairo/Dojo, deployed, not changing)

| Contract | Methods |
|----------|---------|
| `Account` | `create(name, master)` |
| `Daily` | `spawn`, `build(game_id, orientation, x, y, role, spot)`, `discard(game_id)`, `surrender(game_id)`, `claim(tournament_id, rank)`, `sponsor(amount)` |
| `Weekly` | Same as Daily |
| `Tutorial` | Same but fixed deck, no entry fee |

### Models (on-chain state)

| Model | Key Fields |
|-------|-----------|
| `Game` | `id, over, discarded, built, tiles (u128 bitmask), tile_count, score, seed, mode, tournament_id` |
| `Player` | `id (address), name (felt252), master` |
| `Builder` | `game_id + player_id → tile_id, characters (bitmap)` |
| `Tile` | `game_id + id → player_id, plan, orientation, x, y, occupied_spot` |
| `Char` | `game_id + player_id + index → tile_id, spot, weight, power` |
| `Tournament` | `id → prize, top1/2/3_player_id, top1/2/3_score, top1/2/3_claimed` |

### Tile System

- 19 distinct tile types, each a 9-position terrain layout (Center, NW, N, NE, E, SE, S, SW, W)
- Encoded as strings like `RFFFRFCFR` (R=Road, F=Forest, C=City, S=Stop, W=Wonder)
- 72-tile deck for Weekly, subset for Daily, fixed 9-tile sequence for Tutorial

### Scoring

| Category | Base Points | Specialist Role (2x weight+power) |
|----------|------------|-----------------------------------|
| Road | 100 | Adventurer |
| City | 200 | Paladin |
| Forest | 300 | (none) |
| Wonder | 900 | Pilgrim |

Formula: `points = count × base_points × power × (1.0235^count)`

Exponential multiplier rewards larger structures (~2x at 30 tiles, ~10x at 100).

### Character Roles

| Role | Road w/p | City w/p | Wonder w/p |
|------|---------|---------|-----------|
| Lord | 1/1 | 1/1 | 1/1 |
| Lady | 1/1 | 1/1 | 1/1 |
| Adventurer | 2/2 | blocked | 1/1 |
| Paladin | blocked | 2/2 | 1/1 |
| Pilgrim | 1/1 | 1/1 | 2/2 |

### Tournament Prizes

- 1st: ~56% of pool
- 2nd: ~28% of pool
- 3rd: ~16% of pool

---

## Current Client Architecture

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React, Vite, TypeScript | 18.2, 5, 5.4 |
| 3D Rendering | React Three Fiber + Three.js (WebGL) | 8.16, 0.162 |
| Post-processing | Bloom, Vignette, N8AO | postprocessing 6.35 |
| Blockchain | Dojo SDK, @starknet-react, @cartridge/connector | alpha.14, 3.0, 0.3.44 |
| State | Zustand + RECS (Dojo ECS) + React Context | 4.5, 2.0.13 |
| UI | Tailwind + Radix UI + shadcn/ui | 3.4 |
| Audio | Howler.js | 2.2 |
| PWA | vite-plugin-pwa | configured |

### File Structure

```
app/src/
├── main.tsx                    # Entry: StarknetConfig + DojoProvider bootstrap
├── App.tsx                     # Router: Landing → GameLobby → GameScreen
├── dojo/
│   ├── setup.ts                # Torii client init, burner manager, world setup
│   ├── context.tsx             # DojoContext provider
│   ├── useDojo.tsx             # Main hook: setup + account
│   ├── systems.ts              # 7 contract call wrappers (with optimistic updates)
│   ├── models.ts               # RECS component wrappers (overridable)
│   ├── world.ts                # RECS world instance
│   └── game/                   # Pure game logic (mirrors Cairo contracts)
│       ├── constants.ts        # ROAD_BASE_POINTS, CITY_BASE_POINTS, etc.
│       ├── store.ts            # Tile lookup store
│       ├── index.ts            # Barrel (mixed: pure utils + Vite asset imports)
│       ├── types/              # 10 files: orientation, area, direction, spot, move, category, role, mode, plan, layout, tutorial-stage
│       ├── models/             # 6 files: game, player, builder, character, tile, tournament
│       ├── layouts/            # 19 files: one per tile type (ccccccccc.ts → wfffffffr.ts)
│       ├── helpers/            # conflict.ts (feature idle check, graph traversal)
│       └── elements/decks/     # base.ts (72 tiles), tutorial.ts (9 tiles)
├── hooks/                      # 19 custom hooks
│   ├── useActions.tsx          # Build/discard/surrender orchestration
│   ├── useTiles.tsx            # All tiles + spatial grid computation
│   ├── useGame.tsx             # Current game state
│   ├── useBuilder.tsx          # Builder state
│   ├── usePlayer.tsx           # Player profile
│   ├── useCharacters.tsx       # Placed characters
│   ├── useTournament.tsx       # Tournament state
│   ├── useBalance.tsx          # Token balance (RPC polling)
│   ├── useHand.tsx             # Orientation + strategy mode
│   ├── useTutorial.tsx         # Tutorial step derivation
│   ├── useMusicPlayer.tsx      # Howler.js audio
│   └── useQueryParams.tsx      # URL ?id= for gameId
├── store/
│   └── index.ts                # 6 Zustand stores
└── ui/
    ├── screens/                # Landing, GameLobby, GameScreen, GameLoading, GameMaintenance
    ├── components/
    │   ├── canvas/             # GameCanvas, Rig, Lighting, Postprocessing, ScreenshotCube
    │   ├── dom/                # Overlay, NavigationMenu, HandPanel, IngameStatus, CharacterMenu, GameCompleteDialog
    │   ├── TileTexture.tsx     # 3D placed tile renderer (loads .glb, dual mode)
    │   ├── TileEmpty.tsx       # 3D empty slot (456 lines — hover, compat check, preview)
    │   ├── CharTexture.tsx     # 3D character billboard (procedural geometry)
    │   └── ...                 # Leaderboard, Tournament, Account, etc.
    ├── elements/               # shadcn/ui primitives (22 components)
    ├── modules/                # BoxRain (lobby animation), Games list, PlayerCard
    └── actions/                # Discard, Spawn, Surrender dialogs
```

### Data Flow

```
Boot:
  setup(dojoConfig()) → torii.createClient() → defineContractComponents(world)
  → getSyncEntities(limit: 1000) → setupWorld(DojoProvider) → BurnerManager.init()

Runtime sync:
  Torii WebSocket/gRPC → streams entity updates into RECS world

Read path:
  RECS world → useComponentValue(Model, key) → Model class instance → Component

Write path:
  useActions.handleConfirm()
    → systems.build({ account, mode, game_id, tile_id, orientation, x, y, role, spot })
      → addOverride (optimistic) → contract.build() (Starknet tx)
      → wait + 5s delay → removeOverride (RECS gets real data from Torii)
```

### 3D Rendering Details

**GameCanvas:** `<Canvas dpr={[0.5, 1]} shadows frameloop="demand">` — renders only on state changes (demand mode), DPR capped for performance.

**Camera (Rig.tsx):** PerspectiveCamera + OrbitControls. Azimuth locked (no horizontal orbit — top-down view). Left-click pans. Two-finger dolly+pan on touch. Zoom range 5-30.

**Lighting:** Ambient (intensity 4) + Directional (intensity 10, position [35,50,65], 4096×4096 shadow map, frustum covers 100×100 area).

**Post-processing:** Bloom (luminanceThreshold 3), Vignette (darkness 0.8), N8AO ambient occlusion (quality "ultra").

**TileTexture (placed tiles):** Loads all 19 .glb GLTF models via `useGLTF`. Each mesh gets MeshStandardMaterial (roughness 1, anisotropy 160), castShadow/receiveShadow, toon-outline edges via EdgesGeometry + LineSegments. Dual render modes:
- **Voxel mode** (default): 3D .glb model, rotated by tile orientation
- **Strategy mode**: flat BoxGeometry with PNG texture on top face

**TileEmpty (empty slots, 456 lines):** Most complex component. States: hovered, selected, valid (compatibility check), idle (feature idle check). Renders: 3D preview model (transparent, orange if invalid), 2D strategy preview, validity overlay (green/red/orange), invisible hit-detection mesh (opacity 0.004). Tutorial sub-components: TileHighlight + TileHighlightTooltip.

**CharTexture (characters):** Procedural geometry — black pedestal cylinder, colored disc, inner disc, vertical rod, billboard circle with character PNG. Billboard via useFrame lookAt. Player name label on hover via Drei `<Text>`.

**BoxRain (lobby):** Separate Canvas. 100 random tile models falling from y=30 to y=-20, resetting position. Decorative, pointer-events-none.

### Assets

**3D models (19 .glb files):** `app/public/models/` — one per tile type.

**Tile PNGs (19):** `app/public/assets/tiles/` — used in strategy mode flat rendering.

**Character PNGs (7):** `app/public/assets/characters/` — adventurer, herdsman, lady, lord, paladin, pilgrim, woodsman.

**Font:** `RubikMonoOne-Regular.ttf` — used for character name labels.

**Audio:** Sound effects in `app/public/sounds/`.

### Zustand Stores

| Store | Key State |
|-------|----------|
| `useActionsStore` | `enabled, disabled` — action button state |
| `useLobbyStore` | `playerEntity, mode` (default: Daily) |
| `useCameraStore` | `position, rotation, zoom, aspect, near, far, reset, compassRotation` |
| `useGameStore` | `gameId, builderId, orientation (1-4 cyclic), character, spot, x, y, selectedTile, hoveredTile, activeEntity, valid, strategyMode` |
| `useUIStore` | `loading, takeScreenshot` |
| `useMusicStore` | `track (Howl), muted` |

---

## Game Logic Extraction Analysis

### Files that copy verbatim (28 files, zero changes)

| File | Contents | External imports |
|------|----------|-----------------|
| `constants.ts` | 6 numeric constants (ROAD_BASE_POINTS, etc.) | None |
| `store.ts` | `Store` class, `Tiles` type | Local `Tile` only |
| `types/orientation.ts` | `OrientationType` enum, `Orientation` class | None |
| `types/area.ts` | `AreaType` enum (A-I), `Area` class with rotate/antirotate | `OrientationType` |
| `types/direction.ts` | `DirectionType` enum (8 compass), `Direction` class | `OrientationType` |
| `types/spot.ts` | `SpotType` enum (9 positions), `Spot` class | `OrientationType` |
| `types/move.ts` | `Move` class (direction + spot pair) | Local types |
| `types/category.ts` | `CategoryType` enum, `Category` class with `fromChar()`, `basePoints()` | `constants` |
| `types/role.ts` | `RoleType` enum, `Role` class with weight/power/isAllowed matrix | `CategoryType` |
| `types/mode.ts` | `ModeType` enum, `Mode` class with duration/offset/price/count | Pure (stale import to remove) |
| `types/layout.ts` | `Layout` class, `checkCompatibility()` | Local types + `Tile` |
| `helpers/conflict.ts` | `Conflict` class, `checkFeatureIdle()` — graph traversal | Local types |
| `elements/decks/base.ts` | `Base` class — 72-tile deck, `plan(index)` mapping | `PlanType` |
| `elements/decks/tutorial.ts` | `Tutorial` class — 9-tile fixed deck | Local types |
| All 19 `layouts/*.ts` | `Configuration` class per tile type: `starts()`, `moves()`, `area()`, `adjacentRoads()`, `adjacentCities()` | Local types only |

### Files that need refactoring (6 files)

| File | Problem | Fix |
|------|---------|-----|
| `types/plan.ts` | 19 Vite PNG imports + `getImage()` returns bundler URLs | Remove PNG imports and `getImage()`. Keep pure logic: `PlanType` enum, `into()`, `from()`, `unpack()`, `starts()`, `wonder()`, `moves()`, `area()`, `adjacentRoads()`, `adjacentCities()`. Create `asset-keys.ts` with `getPlanKey(plan): string`. |
| `types/tutorial-stage.ts` | `import * as THREE from "three"` — uses `THREE.Vector2` | Replace with `type Vec2 = { x: number; y: number }`. Replace `new THREE.Vector2(x, y)` → `{ x, y }`. |
| `models/builder.ts` | `ComponentValue` from `@dojoengine/recs` | Replace with `BuilderData { game_id: number; player_id: string; tile_id: number; characters: number }` |
| `models/character.ts` | `ComponentValue` from `@dojoengine/recs` | Replace with `CharacterData { game_id: number; player_id: string; index: number; tile_id: number; spot: number; weight: number; power: number }` |
| `models/game.ts` | `ComponentValue` from `@dojoengine/recs` | Replace with `GameData { id: number; over: boolean; discarded: number; built: number; tiles: bigint; tile_count: number; start_time: number; end_time: number; score: number; seed: bigint; mode: number; tournament_id: number }` |
| `models/player.ts` | `ComponentValue` + `shortString` from `starknet` | Replace with `PlayerData { id: string; name: string; master: string }`. Inline shortString decode: `BigInt(felt).toString(16)` → hex → utf8. |
| `models/tile.ts` | `ComponentValue` + `getImage` from barrel | Replace with `TileData { game_id: number; id: number; player_id: string; plan: number; orientation: number; x: number; y: number; occupied_spot: number }`. Remove `getImage()`. |
| `models/tournament.ts` | `ComponentValue` from `@dojoengine/recs` | Replace with `TournamentData { id: number; prize: bigint; top1_player_id: string; top1_score: number; top1_claimed: boolean; ... }` |
| `index.ts` (barrel) | Mixes Vite PNG imports with pure utilities | Split: `utils.ts` (pure functions), `asset-keys.ts` (string key mapping), `index.ts` (clean barrel) |

### Three root contaminants

1. **`@dojoengine/recs` `ComponentValue`** — in all 6 model constructors. Replace with plain interfaces.
2. **Vite PNG imports** — in `types/plan.ts` and `index.ts`. Extract to asset-key functions.
3. **`THREE.Vector2`** — only in `types/tutorial-stage.ts`. Replace with `{x, y}`.

---

## Target Architecture

### Monorepo Structure

```
/
├── package.json              # root workspace (bun workspaces)
├── turbo.json                # Turborepo pipeline
├── tsconfig.base.json        # shared TS config
├── contracts/                # existing Cairo contracts (unchanged)
├── app/                      # existing client (unchanged, reference)
└── packages/
    ├── game-core/            # Pure TS game logic, zero deps
    │   ├── src/
    │   │   ├── types/        # 10 files (orientation, area, direction, spot, move, category, role, mode, plan, layout, tutorial-stage)
    │   │   ├── models/       # 6 files (game, player, builder, character, tile, tournament)
    │   │   ├── layouts/      # 19 files (one per tile type)
    │   │   ├── elements/decks/ # base.ts, tutorial.ts
    │   │   ├── helpers/      # conflict.ts
    │   │   ├── constants.ts
    │   │   ├── store.ts
    │   │   ├── utils.ts      # pure utilities from index.ts
    │   │   ├── asset-keys.ts # plan/character key mapping
    │   │   └── index.ts      # clean barrel
    │   └── __tests__/        # comprehensive test suite
    │
    ├── chain/                # Dojo/Starknet integration
    │   └── src/
    │       ├── config.ts     # DojoConfig, env-based, manifest switching
    │       ├── client.ts     # Torii client setup, entity sync
    │       ├── contracts.ts  # 7 system call wrappers + optimistic updates
    │       ├── models/       # Adapters: raw chain data → game-core interfaces
    │       ├── hooks/        # React hooks (useGame, useBuilder, useTile, useTiles, usePlayer, useCharacter(s), useTournament(s), useActions, useBalance)
    │       └── auth/         # Cartridge controller integration
    │
    ├── renderer/             # Pure Three.js + WebGPU
    │   └── src/
    │       ├── core/         # Platform-agnostic (no React, no R3F)
    │       │   ├── GameScene.ts       # Scene graph, camera, lights
    │       │   ├── TileRenderer.ts    # Tile mesh creation, placement, dual mode
    │       │   ├── CharRenderer.ts    # Character mesh (procedural + billboard)
    │       │   ├── CameraController.ts # Orbit controls, pan, zoom
    │       │   ├── AssetLoader.ts     # GLTF/texture preloader + cache
    │       │   ├── Effects.ts         # Post-processing (TSL-based)
    │       │   └── types.ts
    │       ├── react/        # Thin React wrapper (web only)
    │       │   ├── GameCanvas.tsx
    │       │   └── useScene.ts
    │       └── index.ts
    │
    ├── ui/                   # Cross-platform UI (Tamagui)
    │   └── src/
    │       ├── components/   # Buttons, dialogs, menus (Tamagui styled)
    │       ├── screens/      # Landing, Lobby, Game, GameOver
    │       ├── overlays/     # HUD, hand panel, score, character menu
    │       └── stores/       # 6 Zustand stores (migrated from app/src/store/)
    │
    ├── app-web/              # Vite + React 19 entry
    │   ├── src/
    │   │   ├── main.tsx
    │   │   ├── App.tsx
    │   │   └── providers/
    │   ├── public/           # models/, assets/, sounds/
    │   └── vite.config.ts
    │
    └── app-mobile/           # Expo + React Native (future)
        ├── App.tsx
        └── app.json
```

### Package Dependencies

```
game-core: (zero deps)
chain:     game-core, @dojoengine/sdk, starknet, @cartridge/connector, zustand
renderer:  game-core, three
ui:        game-core, tamagui, @tamagui/core, zustand
app-web:   game-core, chain, renderer, ui, react, vite
app-mobile: game-core, chain, renderer, ui, react-native, expo, react-native-wgpu
```

---

## Phase 3: Renderer — Pure Three.js Scene Manager

### Why not R3F

| Factor | R3F | Pure Three.js |
|--------|-----|---------------|
| WebGPU web | Supported via async `gl` factory (R3F v9) | Direct WebGPURenderer control |
| react-native-wgpu | Requires fragile `patch-package` hack, no official examples | Works natively, official examples |
| Post-processing | `@react-three/postprocessing` — unclear WebGPU compat | TSL node-based effects (Three.js native WebGPU path) |
| Performance | React reconciler overhead every frame | Direct scene graph, no reconciler |
| Cross-platform code sharing | Canvas wrapper differs, rest "should" share | Identical code on both platforms |
| Mobile production path | react-native-webgpu-worklets (imperative) is the stable path | Natural fit |

### Scene Manager Pattern

```typescript
// packages/renderer/src/core/GameScene.ts
export class GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGPURenderer | THREE.WebGLRenderer;
  tiles: TileRenderer;
  characters: CharRenderer;
  controls: CameraController;
  assets: AssetLoader;
  effects: Effects;

  async init(canvas: HTMLCanvasElement | OffscreenCanvas) {
    // Try WebGPU, fall back to WebGL
    if (navigator.gpu) {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
      await this.renderer.init();
    } else {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    }
    // Setup scene, camera, lights, controls, effects
  }

  // Called by React state changes or Torii sync
  updateTiles(tiles: TileData[]) { /* add/remove/update tile meshes */ }
  updateCharacters(chars: CharacterData[]) { /* add/remove character meshes */ }
  setHoveredTile(x: number, y: number) { /* preview placement */ }
  setOrientation(o: number) { /* rotate preview */ }
  setStrategyMode(on: boolean) { /* swap 3D ↔ 2D flat rendering */ }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() { /* cleanup */ }
}
```

### Platform Integration

**Web (React wrapper):**
```tsx
export function GameCanvas({ tiles, characters, ...props }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene>();

  useEffect(() => {
    const scene = new GameScene();
    scene.init(canvasRef.current!);
    sceneRef.current = scene;
    return () => scene.dispose();
  }, []);

  useEffect(() => { sceneRef.current?.updateTiles(tiles); }, [tiles]);
  useEffect(() => { sceneRef.current?.updateCharacters(characters); }, [characters]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
```

**Mobile (react-native-wgpu):**
```tsx
import { Canvas } from 'react-native-wgpu';
const context = canvasRef.current.getContext("webgpu");
const scene = new GameScene();
await scene.init(context.canvas);
scene.renderer.setAnimationLoop(() => {
  scene.render();
  context.present(); // required on RN
});
```

### Component Migration Map

| Existing (app/src/ui/) | New (packages/renderer/src/) | Approach |
|------------------------|------------------------------|----------|
| `TileTexture.tsx` (182 lines) | `core/TileRenderer.ts` | **Refactor**: extract mesh creation, material setup (roughness 1, anisotropy 160), edge outlines (EdgesGeometry + LineSegments), dual render mode (voxel 3D / strategy 2D flat) |
| `TileEmpty.tsx` (456 lines) | `core/TileRenderer.ts` (preview methods) | **Refactor**: extract hover state mesh, preview rendering, validity overlay. Game logic (compatibility, conflict) stays in game-core |
| `CharTexture.tsx` | `core/CharRenderer.ts` | **Refactor**: extract procedural cylinders + billboard disc + name label |
| `Rig.tsx` | `core/CameraController.ts` | **Refactor**: OrbitControls config — locked azimuth, polar angle 90.9°–180°, touch mapping (ONE=PAN, TWO=DOLLY_PAN), zoom 5-30 |
| `Lighting.tsx` | `core/GameScene.ts` (init) | **Refactor**: ambient (4) + directional (10, [35,50,65], 4096 shadow map) |
| `Postprocessing.tsx` | `core/Effects.ts` | **Rewrite**: Three.js native EffectComposer + TSL nodes for WebGPU |
| `BoxRain.tsx` | `core/BoxRainScene.ts` | **Refactor**: separate scene, 100 falling tile models |

### Asset Loader

```typescript
export class AssetLoader {
  private models: Map<PlanType, THREE.Group> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();

  async preloadAll(basePath: string) {
    const loader = new GLTFLoader();
    await Promise.all(
      Object.values(PlanType).map(async (plan) => {
        const gltf = await loader.loadAsync(`${basePath}/models/${getPlanKey(plan)}.glb`);
        this.models.set(plan, gltf.scene);
      })
    );
  }

  getModel(plan: PlanType): THREE.Group {
    return this.models.get(plan)!.clone();
  }
}
```

---

## Implementation Phases

### Phase 1: Monorepo Scaffold + game-core Extraction

**Goal:** Pure TypeScript game logic package with zero external dependencies.

1. Create monorepo scaffolding (bun workspaces + Turborepo)
2. Copy 28 pure files verbatim from `app/src/dojo/game/`
3. Refactor 6 files (remove 3 contaminants)
4. Write comprehensive test suite (15+ test files mirroring Cairo logic)

**Tests:**
- Rotation algebra (orientation, spot, direction, area)
- Category parsing + base points
- Role weight/power matrix + isAllowed blocks
- Plan round-trip for all 19 types
- Layout edge compatibility across orientations
- Layout starts/moves/area for all 19 layouts
- Conflict detection (idle check, graph traversal)
- Game model (bitmask decode, isOver, tilesLeft)
- Tile model (canPlace, areConnected)
- Tournament (reward distribution, isOver, isCurrent)
- Deck (72 tiles, valid PlanType for all indices)
- Store lookup

**Verification:** `bun run --filter @paved/game-core build && bun run --filter @paved/game-core test`

### Phase 2: Chain Integration Package

**Goal:** `@paved/chain` wrapping latest Dojo SDK + Starknet.

1. Upgrade to latest stable Dojo SDK (regenerate bindings)
2. Model adapters: raw chain data → game-core plain interfaces
3. React hooks for reactive state
4. 7 contract call wrappers with optimistic updates
5. Cartridge controller auth

**Verification:** `bun run --filter @paved/chain build` + manual Katana/Torii test

### Phase 3: Renderer Package (Pure Three.js + WebGPU)

**Goal:** Platform-agnostic scene manager, WebGPU with WebGL fallback.

1. GameScene class with init/update/render/dispose lifecycle
2. TileRenderer (refactored from TileTexture + TileEmpty)
3. CharRenderer (refactored from CharTexture)
4. CameraController (refactored from Rig)
5. AssetLoader (centralized GLTF + texture cache)
6. Effects (TSL-based post-processing)
7. React wrapper (thin canvas mount)

**Verification:**
- HTML test harness with hardcoded tiles
- Storybook with multiple scene states
- WebGPU on Chrome/Edge, WebGL fallback on Safari/Firefox
- Both strategy and voxel mode render correctly

### Phase 4: UI Package (Tamagui)

**Goal:** Cross-platform UI components.

1. Tamagui theme config matching Paved dark aesthetic
2. Migrate screens (Landing, Lobby, Game, Loading)
3. Migrate HUD overlays (Overlay, NavigationMenu, IngameStatus, CharacterMenu, HandPanel, GameCompleteDialog)
4. Migrate lobby components (Account, Leaderboard, Tournament, etc.)
5. Migrate 6 Zustand stores (replace `Entity` type with `string`)

### Phase 5: Web App Entry Point

**Goal:** Working web app combining all packages.

1. Vite 6+ config (React 19, WASM, PWA)
2. Provider stack: StrictMode > TamaguiProvider > StarknetConfig > DojoProvider > Router > App
3. Copy static assets (models, textures, sounds)
4. Full gameplay verification

### Phase 6: Mobile App (Future)

**Goal:** Expo + React Native sharing all packages.

1. react-native-wgpu for 3D (Dawn: Metal/Vulkan)
2. Expo SDK 52+ with New Architecture
3. Platform file extensions for Canvas (`.native.tsx`)
4. Cartridge controller via WebView
5. Expo Router for navigation

---

## Phase Dependency Graph

```
Phase 1 (game-core)
   ├──→ Phase 2 (chain)    ──┐
   ├──→ Phase 3 (renderer)  ──┼──→ Phase 5 (app-web) ──→ Phase 6 (app-mobile)
   └──→ Phase 4 (ui)       ──┘
```

Phases 2, 3, 4 are parallelizable after Phase 1.

**Implementation order:**
1. Phase 1 (game-core) — foundation, no external deps, testable immediately
2. Phase 3 (renderer) — highest-risk technical item, de-risks WebGPU early
3. Phase 2 (chain) — second-highest risk (Dojo SDK upgrade)
4. Phase 4 (ui) — anytime after Phase 1, parallel with 2-3
5. Phase 5 (app-web) — integration
6. Phase 6 (app-mobile) — after web is stable

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Three.js TSL post-processing less documented than R3F postprocessing | Effects take longer to implement | Start with basic bloom/vignette; add AO later. TSL examples in Three.js repo. |
| Dojo SDK v2 API differs from alpha.14 | Chain hooks need rewriting | Reference latest Dojo starter; regenerate bindings with `sozo build --typescript` |
| Imperative Three.js is more boilerplate than R3F | More scene management code | Scene manager pattern is well-established; cleaner for cross-platform |
| 19 GLTF models too heavy for mobile | Performance issues | LOD system; reduce shadow map 4096→1024; skip AO on mobile |
| `shortString.decodeShortString` edge cases | Player names wrong | Port faithfully: `BigInt(felt).toString(16)` → hex → utf8; test known names |
| OrbitControls in imperative mode on RN | Touch gestures need manual wiring | Map gesture handler events to OrbitControls; Three.js OrbitControls works with DOM events natively |
| WebGPU coverage on older mobile devices | Some users can't use WebGPU | Three.js auto-fallback to WebGL 2 covers ~95% of devices |
