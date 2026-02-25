# Research Report: Cross-Platform 3D Game Architecture (Web + Mobile)
Generated: 2026-02-24

## Executive Summary

Three.js WebGPU is production-ready as of r171 (September 2025) with ~95% browser coverage and automatic WebGL 2 fallback. React Three Fiber v9 supports WebGPU via an async `gl` prop. On mobile, `react-native-wgpu` enables Three.js + R3F to run natively on iOS and Android using Dawn/WebGPU -- this is the modern path, replacing the deprecated expo-gl/expo-three stack. For cross-platform UI sharing, Tamagui + Solito 5 + Expo Router is the current best practice, with platform-specific file extensions (`.web.tsx` / `.native.tsx`) for rendering divergence. For a Carcassonne-style tile game, the recommended architecture is: pure TypeScript game logic in a shared package, React Three Fiber for 3D rendering on both web and native (via react-native-wgpu), and Tamagui/Solito for shared UI chrome.

## Research Question

What is the current (February 2026) state of WebGPU, Three.js, React Three Fiber, and React Native for building a cross-platform 3D tile game that runs on web and mobile?

---

## 1. Three.js WebGPU Renderer

### Status: Production-Ready

Since Three.js **r171 (September 2025)**, the WebGPU renderer is considered production-ready with zero-config imports.

**Import path:**
```javascript
// NEW: WebGPU with automatic WebGL 2 fallback
import * as THREE from 'three/webgpu';

const renderer = new THREE.WebGPURenderer();
await renderer.init(); // REQUIRED - async initialization
renderer.setSize(window.innerWidth, window.innerHeight);
```

**Critical detail:** `await renderer.init()` is **mandatory**. Omitting it causes silent rendering failures with no error messages. This is the single most common migration blocker.

### Performance

- **2-10x gains** for draw-call-heavy scenes
- Compute shaders enable particle counts jumping from ~50,000 (WebGL) to 1,000,000+ (WebGPU)
- WebGPU is NOT universally faster -- it excels specifically in: high draw call counts, compute-heavy workloads, and complex post-processing

### Shader Migration: TSL

TSL (Three Shader Language) compiles to both WGSL (WebGPU) and GLSL (WebGL), so you write shaders once:

```javascript
import { Fn, uv, vec4 } from 'three/tsl';

const colorNode = Fn(() => vec4(uv(), 0.5, 1.0));
const material = new THREE.MeshBasicNodeMaterial();
material.colorNode = colorNode();
```

### Browser Support (~95% global coverage, January 2026)

| Browser | Version | Status |
|---------|---------|--------|
| Chrome Desktop | 113+ | Stable since April 2023 |
| Chrome Android | 121+ | Requires Android 12+, Qualcomm/ARM GPUs |
| Firefox Desktop | Windows/macOS | Stable |
| Firefox Android | -- | Still behind a flag (expected 2026) |
| Safari macOS | 26+ | Stable since September 2025 |
| Safari iOS | 26+ (iOS 26) | Stable since September 2025 |
| Edge | 113+ | Stable (Chromium-based) |

### Key Caveats

1. **Do NOT mix imports:** Never combine `import from 'three'` and `import from 'three/webgpu'` in the same project
2. **Safari quirks:** Timestamp queries unsupported; test on iOS separately; some complex render passes report device-lost errors in Safari 26.1
3. **Stricter memory management:** Explicit disposal required: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`
4. **Post-processing changed:** Replace `EffectComposer` with TSL-native `PostProcessing` class

- Sources: [Three.js WebGPU Migration Guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide), [Three.js 2026 Changes](https://www.utsubo.com/blog/threejs-2026-what-changed), [WebGPURenderer Docs](https://threejs.org/docs/pages/WebGPURenderer.html)

---

## 2. React Three Fiber + WebGPU

### Status: Supported in R3F v9

React Three Fiber v9 (pairs with React 19) introduced async `gl` prop support specifically for WebGPU.

**Configuration:**

```tsx
import * as THREE from 'three/webgpu';
import { Canvas } from '@react-three/fiber';

function App() {
  return (
    <Canvas
      gl={async (canvas) => {
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
        await renderer.init();
        return renderer;
      }}
    >
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  );
}
```

### Key Details

- **R3F v9 pairs with React 19.** R3F v8 pairs with React 18.
- The `gl` callback receives constructor parameters (not just canvas) -- this is a breaking change from v8.
- You may need to set `frameloop="never"` initially and switch to `"always"` after `renderer.init()` resolves, depending on your scene complexity.
- You need to `extend()` the three/webgpu module for R3F to recognize WebGPU node materials and other new types.

### Fallback Strategy

Three.js handles fallback automatically when importing from `three/webgpu`. If the browser lacks WebGPU, the WebGPURenderer falls back to a WebGL 2 backend internally. For explicit control:

```javascript
async function createRenderer(canvas) {
  if (navigator.gpu) {
    try {
      const renderer = new THREE.WebGPURenderer({ canvas });
      await renderer.init();
      return renderer;
    } catch (e) {
      console.warn('WebGPU failed:', e);
    }
  }
  return new THREE.WebGLRenderer({ canvas });
}
```

- Sources: [R3F v9 Migration Guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide), [R3F + WebGPU + TSL Tutorial](https://blog.loopspeed.co.uk/react-three-fiber-webgpu-typescript), [Maxime Heckel TSL Guide](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)

---

## 3. WebGPU on Mobile

### iOS Safari

- **Supported since iOS 26 / Safari 26** (shipped September 2025)
- **Minimum requirement:** iOS 26. Users on iOS 18 or earlier get NO WebGPU.
- iOS adoption moves fast (~80% within 6 months typically), but for Feb 2026 there will still be a meaningful portion on iOS 18.
- Known issue: Some complex WebGPU render passes can fail with device-lost errors on Safari 26.1.

### Android Chrome

- **Supported since Chrome 121** (January 2024)
- **Requirements:** Android 12+, Qualcomm or ARM GPUs
- Older devices, MediaTek GPUs, and Android <12 get NO WebGPU
- Coverage is more fragmented than iOS -- depends heavily on device hardware

### Android Firefox

- Still behind a flag as of February 2026
- Mozilla expects to address Android "sometime in 2026"

### Can a PWA Use WebGPU?

**Yes.** WebGPU is a standard Web API available in any browsing context, including PWAs (whether standalone, fullscreen, or in-browser). There are no special restrictions. A PWA using WebGPU will:
- Work when online (WebGPU requires initial GPU adapter negotiation)
- Service workers can cache the app shell, JS bundles, and assets as normal
- The WebGPU rendering itself requires an active GPU -- no offline GPU rendering, but that is true of WebGL too

### Practical Mobile Strategy

For a game targeting mobile TODAY:
- **Use WebGPU with automatic WebGL 2 fallback** via `three/webgpu` imports
- ~95% of users get WebGPU, ~5% get WebGL 2 fallback automatically
- Test both paths; ensure your shaders work in TSL (not raw WGSL) for dual-backend support

- Sources: [Can I Use WebGPU](https://caniuse.com/webgpu), [WebGPU All Browsers](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers-now-ship-it/), [Safari 26 WebKit Blog](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)

---

## 4. React Native + Three.js

### Option A: react-native-wgpu (RECOMMENDED)

This is the modern, actively maintained path.

| Detail | Value |
|--------|-------|
| Package name | `react-native-wgpu` |
| GitHub | [wcandillon/react-native-webgpu](https://github.com/wcandillon/react-native-webgpu) |
| RN Requirement | React Native 0.81+ (New Architecture only) |
| Three.js Support | Out of the box since Three.js r168 |
| R3F Support | Yes, with metro config and package.json patch |
| Platforms | iOS, Android, Web, visionOS, macOS |
| Backend | Google Dawn (Metal on iOS, Vulkan on Android) |

**Setup:**
```bash
npm install react-native-wgpu three @react-three/fiber
```

**Metro config modification required** to resolve Three.js to the WebGPU build. R3F requires patching `@react-three/fiber/package.json` to resolve WebGPU entry points.

**Key caveats:**
- Presentation is manual: you must call `context.present()` after submitting commands (unlike web's automatic handling)
- Android: `alphaMode` is ignored during canvas configuration; use `transparent` prop instead
- Model loading requires additional polyfills
- Does NOT support legacy React Native architecture

**Advanced: Reanimated Worklets integration** -- You can run Three.js rendering on the UI thread via React Native Reanimated for 60fps animations with gesture handler integration. See [react-native-webgpu-worklets](https://github.com/software-mansion-labs/react-native-webgpu-worklets).

### Option B: expo-three / expo-gl (LEGACY -- NOT RECOMMENDED)

| Detail | Value |
|--------|-------|
| Status | Effectively deprecated / maintenance mode |
| Problem | expo-gl@15 (Expo SDK 53) breaks with R3F which depends on expo-gl@11 |
| Backend | OpenGL ES (Apple deprecated OpenGL on all platforms) |
| Future | No clear path forward; maintainers suggest WebGPU migration |

expo-three still exists but has version incompatibilities, relies on a deprecated graphics API, and the web build path works but native builds break on real devices with current Expo SDK versions.

### Option C: react-native-filament

[Margelo's react-native-filament](https://github.com/margelo/react-native-filament) provides Google Filament (physically-based 3D renderer) for React Native. Good for high-fidelity rendering but:
- Different API than Three.js (not R3F compatible)
- Separate codebase from web
- More suited for product visualization than games

### Recommendation

**Use react-native-wgpu.** It is the only path that gives you:
1. The same Three.js + R3F code on web and native
2. Modern GPU backends (Metal/Vulkan, not deprecated OpenGL)
3. Active maintenance and Expo template support
4. TSL shader compatibility (write once, run everywhere)

- Sources: [react-native-webgpu GitHub](https://github.com/wcandillon/react-native-webgpu), [Shopify WebGPU Engineering Blog](https://shopify.engineering/webgpu-skia-web-graphics), [react-native-filament](https://github.com/margelo/react-native-filament)

---

## 5. Shared Component Architecture (Web + React Native)

### Platform-Specific File Extensions

React Native and Metro bundler natively support platform extensions:

```
Button/
  index.tsx        -- shared logic / types
  index.web.tsx    -- HTML <button> with CSS hover
  index.native.tsx -- RN <Pressable> with ripple
```

Metro and Webpack automatically resolve the correct file per platform. This is the **lowest-level primitive** for platform divergence and works with any framework.

### Tamagui

**Status:** Production-ready, actively maintained. Popular choice for cross-platform design systems.

- Renders semantic `<div>` on web (good for SEO/accessibility), `<View>` on native
- Optimizing compiler extracts styles at build time (30-40% faster load than traditional RN UI libs)
- Full parity between React and React Native styling
- Works with Expo Router for single-directory apps

**Two architecture patterns:**

1. **Tamagui + Solito + Next.js + Expo (monorepo):** Separate app directories for web (Next.js) and native (Expo), shared packages for components and logic
2. **Tamagui + Expo Web (single directory):** Expo Router filesystem routes for both web and native, simpler but no SSR

### Solito 5 (October 2025)

**Major shift:** Solito 5 is "web-first" and removed react-native-web from the core web rendering path.

Key architectural insight: **Navigation is native to each platform** (React Navigation / Expo Router on mobile, Next.js Router on web). Screens and business logic live in shared packages. The "app shells" on each platform decide how navigation and routing work.

```
packages/
  app/           -- shared screens, hooks, game logic
  ui/            -- shared Tamagui components
apps/
  expo/          -- React Native app shell (Expo Router)
  next/          -- Next.js app shell
```

### react-native-web

Still exists and works, but Solito 5 moved away from it for the web path. It remains useful if you want to render React Native primitives (`<View>`, `<Text>`) on web, but:
- Adds bundle size
- Limits you to RN's styling model on web
- Not needed if using Tamagui (which handles the abstraction itself)

### Recommendation for a 3D Game

For a game with 3D rendering + UI chrome:
- **3D rendering:** Use React Three Fiber directly on both platforms (via `react-native-wgpu` on native). The R3F `<Canvas>` and scene graph are already cross-platform.
- **UI chrome (menus, HUD, scores):** Use Tamagui components with platform-specific extensions where needed
- **Navigation:** Solito 5 or Expo Router (if single-app-shell)
- **Game logic:** Pure TypeScript in a shared package (no React dependency)

- Sources: [React Native Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code), [Expo Platform-Specific Modules](https://docs.expo.dev/router/advanced/platform-specific-modules/), [Tamagui GitHub](https://github.com/tamagui/tamagui), [Solito 5 Announcement](https://dev.to/redbar0n/solito-5-is-now-web-first-but-still-unifies-nextjs-and-react-native-2lek)

---

## 6. Cross-Platform 3D Game Architecture (Carcassonne-Style Tile Game)

### Recommended Architecture

```
monorepo/
  packages/
    game-engine/        -- Pure TypeScript, zero React dependency
      src/
        types.ts        -- Tile, Board, Player, GameState types
        board.ts        -- Board state, tile placement, adjacency
        rules.ts        -- Scoring, validation, turn logic
        ai.ts           -- AI opponent logic
        pathfinding.ts  -- Feature completion (roads, cities)
        serialization.ts -- Save/load game state

    renderer/           -- React Three Fiber scenes
      src/
        Board3D.tsx     -- 3D board with tile meshes
        Tile3D.tsx      -- Individual tile with 3D model
        Meeple3D.tsx    -- Meeple placement
        Camera.tsx      -- Camera controls (orbit, zoom)
        materials/      -- TSL materials (work on WebGPU + WebGL)

    ui/                 -- Tamagui shared UI components
      src/
        ScoreBoard.tsx
        TilePreview.tsx
        GameMenu.tsx
        PlayerHUD.tsx

  apps/
    web/                -- Next.js app
      app/
        page.tsx        -- Imports from renderer/ and ui/

    mobile/             -- Expo app
      app/
        index.tsx       -- Same imports, react-native-wgpu backend
```

### Key Architecture Decisions

**1. Game Logic is Pure TypeScript (no React, no Three.js)**

```typescript
// packages/game-engine/src/board.ts
export interface Tile {
  id: string;
  edges: [EdgeType, EdgeType, EdgeType, EdgeType]; // N, E, S, W
  rotation: 0 | 90 | 180 | 270;
  features: Feature[];
}

export interface GameState {
  board: Map<string, PlacedTile>; // "x,y" -> tile
  currentTile: Tile | null;
  players: Player[];
  turnIndex: number;
  phase: 'draw' | 'place' | 'meeple' | 'score';
}

export function placeTile(state: GameState, x: number, y: number, rotation: number): GameState {
  // Pure function: validate placement, update board, return new state
}

export function getValidPlacements(state: GameState): Position[] {
  // Returns all positions where currentTile can legally go
}
```

This approach means:
- Game logic is fully testable with Jest/Vitest (no DOM, no GPU)
- Same logic runs on web, mobile, and server (for multiplayer validation)
- State is serializable for save/load and network sync

**2. React Three Fiber Rendering Layer**

```tsx
// packages/renderer/src/Board3D.tsx
import { GameState } from '@game/engine';

export function Board3D({ state, onTilePlaced }: { state: GameState; onTilePlaced: (x: number, y: number) => void }) {
  return (
    <group>
      {Array.from(state.board.entries()).map(([key, tile]) => {
        const [x, y] = key.split(',').map(Number);
        return <Tile3D key={key} tile={tile} position={[x, 0, y]} />;
      })}
      {getValidPlacements(state).map(pos => (
        <PlacementGhost key={`${pos.x},${pos.y}`} position={[pos.x, 0.01, pos.y]} onClick={() => onTilePlaced(pos.x, pos.y)} />
      ))}
    </group>
  );
}
```

R3F components are the same on web and native. The `<Canvas>` wrapper differs:

```tsx
// apps/web/components/GameCanvas.tsx
<Canvas gl={async (canvas) => {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  return renderer;
}}>
  <Board3D state={gameState} onTilePlaced={handlePlace} />
</Canvas>

// apps/mobile/components/GameCanvas.tsx
// react-native-wgpu handles the WebGPU context automatically
<Canvas>
  <Board3D state={gameState} onTilePlaced={handlePlace} />
</Canvas>
```

**3. Use ECS for Complex Game Objects (Optional)**

For a tile game, full ECS may be overkill. But if you need per-frame updates (animations, particles, hover effects), consider:
- [miniplex](https://github.com/hmans/miniplex) -- lightweight ECS that integrates with R3F
- Keep game state in the engine package, use ECS only for visual/animation state in the renderer

**4. Multiplayer Architecture**

If the game needs multiplayer:
- Game engine runs on server (same TypeScript package)
- Client sends actions (placeTile, placeMeeple)
- Server validates and broadcasts new state
- Client renders received state
- This works because game logic has zero platform dependencies

### What Actually Works Today (February 2026)

| Capability | Web | React Native | Shared? |
|-----------|-----|-------------|---------|
| Three.js WebGPU rendering | Yes (r171+) | Yes (react-native-wgpu) | Same R3F components |
| TSL shaders | Yes | Yes | Same shader code |
| WebGL 2 fallback | Automatic | N/A (native uses Metal/Vulkan) | -- |
| Game logic | Yes | Yes | Pure TypeScript package |
| UI components | Tamagui/HTML | Tamagui/RN | Tamagui shared |
| Navigation | Next.js Router | Expo Router | Solito 5 bridges |
| Gestures (tap, drag) | @use-gesture | react-native-gesture-handler | Platform-specific |
| Audio | Web Audio API | expo-av | Platform-specific |
| Persistence | localStorage / IndexedDB | AsyncStorage / SQLite | Platform-specific adapter |

### Risks and Gotchas

1. **react-native-wgpu requires RN 0.81+ New Architecture.** If your existing app is on Old Architecture, this is a significant migration.
2. **Model loading polyfills.** Loading .glTF/.glb on React Native requires polyfills for fetch, TextDecoder, etc. Test early.
3. **Gesture handling diverges.** Web uses pointer events; native uses gesture-handler. Abstract behind a shared interface or use `@use-gesture` which supports both (with react-native-gesture-handler backend).
4. **Expo SDK version.** Make sure you are on Expo SDK 52+ for react-native-wgpu compatibility.
5. **iOS 26 requirement for WebGPU in Safari.** For PWA targeting, you still need WebGL fallback for older iOS versions. The `three/webgpu` import handles this automatically on web.
6. **Performance profiling tools differ.** Web has Chrome DevTools GPU profiler; native requires Xcode Instruments / Android GPU Inspector.

- Sources: [coldi/r3f-game-demo](https://github.com/coldi/r3f-game-demo), [ECS with R3F](https://douges.dev/blog/simplifying-r3f-with-ecs), [R3F Game Examples](https://r3f.docs.pmnd.rs/getting-started/examples)

---

## Sources (Complete)

1. [Three.js WebGPU Migration Guide (2026)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
2. [What Changed in Three.js 2026](https://www.utsubo.com/blog/threejs-2026-what-changed)
3. [WebGPURenderer Docs](https://threejs.org/docs/pages/WebGPURenderer.html)
4. [React Three Fiber v9 Migration Guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide)
5. [R3F + WebGPU + TSL (Loopspeed)](https://blog.loopspeed.co.uk/react-three-fiber-webgpu-typescript)
6. [Field Guide to TSL and WebGPU (Maxime Heckel)](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
7. [WebGPU All Major Browsers](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers-now-ship-it/)
8. [Can I Use: WebGPU](https://caniuse.com/webgpu)
9. [Safari 26 WebKit Blog](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
10. [react-native-webgpu (react-native-wgpu)](https://github.com/wcandillon/react-native-webgpu)
11. [Shopify: Future of React Native Graphics](https://shopify.engineering/webgpu-skia-web-graphics)
12. [react-native-webgpu-worklets](https://github.com/software-mansion-labs/react-native-webgpu-worklets)
13. [react-native-filament](https://github.com/margelo/react-native-filament)
14. [Tamagui](https://github.com/tamagui/tamagui)
15. [Solito 5 Announcement](https://dev.to/redbar0n/solito-5-is-now-web-first-but-still-unifies-nextjs-and-react-native-2lek)
16. [Expo Platform-Specific Modules](https://docs.expo.dev/router/advanced/platform-specific-modules/)
17. [React Native Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code)
18. [ECS with R3F (douges.dev)](https://douges.dev/blog/simplifying-r3f-with-ecs)
19. [R3F Tile Game Demo](https://github.com/coldi/r3f-game-demo)
20. [WebGPU / TSL Course (Wawa Sensei)](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl)

---

## Recommendations

1. **Start with react-native-wgpu + React Three Fiber v9 + Three.js r171+.** This is the only stack that gives you shared 3D rendering code across web and native with modern GPU backends.

2. **Use `three/webgpu` imports everywhere.** Automatic WebGL 2 fallback on web means you do not need to maintain two renderer codepaths.

3. **Write all game logic as pure TypeScript** in a shared package with zero DOM/RN/Three.js dependencies. This is your most valuable shared code.

4. **Use Tamagui for UI chrome, Solito 5 for navigation bridging.** Platform-specific file extensions (`.web.tsx` / `.native.tsx`) for anything that must diverge.

5. **Use TSL for shaders, not raw WGSL.** TSL compiles to both WGSL and GLSL, ensuring your materials work on WebGPU, WebGL fallback, and native.

6. **Test on real devices early.** iOS Simulator and Android Emulator have poor WebGPU/GL support. Physical devices are mandatory for meaningful testing.

## Open Questions

1. **react-native-wgpu + Expo SDK 53 compatibility:** Exact version pinning needs verification at project start time.
2. **Post-processing in R3F + WebGPU:** The drei post-processing helpers may not all work with WebGPURenderer yet. TSL-native PostProcessing is the safe path.
3. **Multiplayer state sync:** The game engine architecture supports it, but the specific networking layer (WebSocket, Colyseus, Liveblocks, etc.) needs separate evaluation.
4. **Asset pipeline:** glTF model loading on React Native with react-native-wgpu requires polyfills -- the exact set needed should be validated with your specific models.
5. **Firefox Android WebGPU timeline:** Still behind a flag; no firm date for stable release.
