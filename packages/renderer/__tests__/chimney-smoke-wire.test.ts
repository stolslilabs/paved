// CHIMNEY-SMOKE-2 (#770 PR 2): the smoke wired into the board scenes. The tile renderer swaps the placed tiles (never the pending
// one) to their types' smoke-free twins while the smoke is drawn; the scene loads the smoke's chunk where it is turned on, and
// follows the season, the tiers and the settings.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Plan, getPlanKey } from "@paved/game-core";
import { GameScene } from "../src/core/GameScene";
import { TileRenderer } from "../src/core/TileRenderer";
import { ChimneySmoke } from "../src/core/chimney-smoke";
import { DEFAULT_SMOKE_SETTINGS, puffsPerChimney, resolveSmokeSettings, smokeLookOf } from "../src/core/chimney-smoke-settings";
import { chimneyOptionsOf, findChimneys } from "../src/core/chimneys";
import { isOutline } from "../src/core/outlines";
import { resolveRendererSettings, type RendererSettingsInput } from "../src/core/settings";
import { voxelize } from "../src/core/voxelizer";
import type { RenderSurfaceAdapter, TileRenderData } from "../src/core/types";
import { createCloudUniforms } from "../src/core/cloud-shader";
import { createSnowUniforms } from "../src/core/snow-shader";
import { placementStubs } from "./helpers/placement-stubs";
import { loadMesh, shipped, sourceOf } from "./helpers/model-meshes";

/** A lazy chunk's load: its import can take well over `vi.waitFor`'s default 1 s on a loaded machine. */
const CHUNK_WAIT = { timeout: 20_000 };
vi.setConfig({ testTimeout: 30_000 });

/** A model with a smoking and a bare chimney (`chimneys.test.ts`). */
const KEY = "rfffrfffr";
const PLAN = Array.from({ length: 19 }, (_, i) => i + 1).find((p) => getPlanKey(Plan.from(p).value) === KEY)!;
const C = 2_147_483_647;
const tile = (id: number, pending = false): TileRenderData => ({ game_id: 1, id, player_id: "0x1", plan: PLAN, orientation: 1, x: C + id, y: C, worldX: id, worldZ: 0, pending });

/** The loader's model of `KEY` (its root, as `AssetLoader.getModel` gives it), and an asset loader with only it. */
async function assetsWithModel() {
  const mesh = await loadMesh(shipped(KEY));
  const model = mesh.parent as THREE.Group;
  const image = new THREE.Texture();
  return {
    mesh,
    assets: { has: () => true, want: () => {}, setSkins: () => {}, getModel: () => model, getTexture: () => image, peekTexture: () => image },
  };
}

/** The face and outline meshes of a drawn tile (`${game_id}-${id}`). */
function meshesOf(renderer: TileRenderer, id: string): { faces: THREE.Mesh; outline: THREE.Mesh } {
  const container = (renderer as any).tileMeshes.get(id).mesh as THREE.Object3D;
  let faces: THREE.Mesh | null = null;
  let outline: THREE.Mesh | null = null;
  container.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (isOutline(child)) outline = child;
    else faces = child;
  });
  return { faces: faces!, outline: outline! };
}

describe("TileRenderer: the white voxels on the placed tiles only (#770 item 2)", () => {
  it("swaps the placed tiles to the twins while the smoke is drawn, keeps the pending tile's, and swaps back when it cannot be", async () => {
    const { mesh, assets } = await assetsWithModel();
    const renderer = new TileRenderer(assets as any);
    renderer.updateTiles([tile(1), tile(2, true)]);
    // Only the placed tile is the smoke's.
    const sources = renderer.smokeSources();
    expect(sources.map((s) => s.id)).toEqual(["1-1"]);
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare(KEY, sources[0]!.type);
    const free = smoke.freeOf(KEY)!;
    const outline = mesh.children.find(isOutline) as THREE.Mesh;
    const [faceTwin, outlineTwin] = [free.geometries.get(mesh.geometry)!, free.geometries.get(outline.geometry)!];

    // Not hidden yet (the smoke cannot be drawn until it says so): the loader's geometry everywhere.
    expect(renderer.setSmokeFree(KEY, free)).toBe(false);
    expect(meshesOf(renderer, "1-1").faces.geometry).toBe(mesh.geometry);

    expect(renderer.setSmokeHidden(true)).toBe(true);
    expect(meshesOf(renderer, "1-1").faces.geometry).toBe(faceTwin);
    expect(meshesOf(renderer, "1-1").outline.geometry).toBe(outlineTwin);
    // The pending tile keeps its white voxels, as the type itself (the ghost's and the previews' source).
    expect(meshesOf(renderer, "1-2").faces.geometry).toBe(mesh.geometry);
    expect(meshesOf(renderer, "1-2").outline.geometry).toBe(outline.geometry);
    expect(mesh.geometry.getIndex()!.count).toBeGreaterThan(faceTwin.getIndex()!.count);

    // A tile drawn now, and the pending tile once placed: their twins at once, in the call that draws them (no frame with the voxels).
    renderer.updateTiles([tile(1), tile(2), tile(3)]);
    expect(meshesOf(renderer, "1-2").faces.geometry).toBe(faceTwin);
    expect(meshesOf(renderer, "1-3").faces.geometry).toBe(faceTwin);
    expect(renderer.smokeSources().map((s) => s.id)).toEqual(["1-1", "1-2", "1-3"]);

    // The smoke cannot be drawn (the Low tier, reduced motion, "Ambient effects" off): the white voxels back.
    expect(renderer.setSmokeHidden(false)).toBe(true);
    for (const id of ["1-1", "1-2", "1-3"]) {
      expect(meshesOf(renderer, id).faces.geometry).toBe(mesh.geometry);
      expect(meshesOf(renderer, id).outline.geometry).toBe(outline.geometry);
    }
    expect(renderer.setSmokeHidden(false)).toBe(false);
    renderer.dispose();
    smoke.dispose();
  });

  it("drops the smoke's voxels from the voxel drop only while they are hidden", async () => {
    const { mesh, assets } = await assetsWithModel();
    const renderer = new TileRenderer(assets as any);
    renderer.updateTiles([tile(1)]);
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare(KEY, renderer.smokeSources()[0]!.type);
    renderer.setSmokeFree(KEY, smoke.freeOf(KEY)!);
    const grid = voxelize(sourceOf(mesh))!;
    const smokeVoxels = findChimneys(grid, chimneyOptionsOf(KEY)).chimneys.reduce((n, c) => n + c.smoke.length, 0);
    expect(smokeVoxels).toBeGreaterThan(0);
    const host = (renderer as any).drops.host as { grid(model: string, grid: unknown): typeof grid };
    expect(host.grid(KEY, grid)).toBe(grid);
    renderer.setSmokeHidden(true);
    expect(host.grid(KEY, grid).count).toBe(grid.count - smokeVoxels);

    // A placed tile's drop: its smoke's voxels do not fall, and the tile is not the smoke's until it has landed.
    const drop = await renderer.dropTile("1-1");
    expect(drop.status).toBe("started");
    if (drop.status !== "started") return;
    expect(drop.info.voxels).toBe(grid.count - smokeVoxels);
    expect(renderer.smokeSources()).toEqual([]);
    // The drop's clock starts at its first update; it ends past its play time.
    renderer.update(0);
    renderer.update(drop.info.playMs + 10);
    await drop.finished;
    expect(renderer.smokeSources().map((s) => s.id)).toEqual(["1-1"]);
    renderer.dispose();
    smoke.dispose();
  });
});

describe("the scene's smoke setting", () => {
  it("is off by default (the tile views, the 3D stack and the build-time images keep their white voxels), on in the boards", () => {
    expect(resolveRendererSettings({}).smoke.enabled).toBe(false);
    expect(resolveRendererSettings({ smoke: { enabled: true } }).smoke).toEqual({ enabled: true });
    // Kept as given: the smoke's chunk resolves it over its defaults.
    const given = resolveRendererSettings({ smoke: { enabled: true, fadeSeconds: 3, seasons: { spring: { enabled: false } } } }).smoke;
    expect(resolveSmokeSettings(given)).toMatchObject({ enabled: true, fadeSeconds: 3, look: "varied", seasons: { spring: { enabled: false } } });
  });
});

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 375, height: 812 }),
  getDevicePixelRatio: () => 2,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

/**
 * A scene on a fake renderer (as `game-scene-ambient.test.ts`'s), its tile renderer a stub whose placed tiles are two of `KEY`
 * (the loader's model, its outline as the renderer gives it). `frames(n)` runs n 60 Hz ticks.
 */
async function createScene(settings: RendererSettingsInput) {
  const queue: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const renderer = {
    setPixelRatio: vi.fn(),
    forceContextLoss: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    domElement: { width: 750, height: 1624 },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
  };
  const camera = new THREE.PerspectiveCamera(50, 375 / 812, 1, 2000);
  camera.position.set(0, 30, 30);
  const controller = {
    camera,
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    dispose: vi.fn(),
  };
  const scene = new GameScene({ createRenderer: vi.fn(() => renderer as any), createCameraController: vi.fn(() => controller as any) });
  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  (scene as any).effects = {
    setLook: vi.fn(),
    init: vi.fn(),
    setCapabilities: vi.fn(),
    setProfile: vi.fn(),
    setAntialiasing: vi.fn(),
    setBackdrop: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
  // The type through a real tile renderer (its materials and outline), the two placed tiles as its clones.
  const { assets } = await assetsWithModel();
  const real = new TileRenderer(assets as any);
  real.updateTiles([tile(1), tile(2)]);
  const placed = real.smokeSources();
  const group = new THREE.Group();
  for (const source of placed) group.add(source.tile.parent!);
  const tiles = {
    ...placementStubs(),
    setLook: vi.fn(),
    updateTiles: vi.fn(() => false),
    setStrategyMode: vi.fn(),
    setHover: vi.fn(),
    setAvailableSlots: vi.fn(),
    setOutlineStroke: vi.fn(),
    updateBoardFrame: vi.fn(),
    setNightLights: vi.fn(),
    setNightLevel: vi.fn(),
    cloudUniforms: createCloudUniforms(),
    snowUniforms: createSnowUniforms(),
    smokeSources: vi.fn(() => placed),
    setSmokeFree: vi.fn(() => true),
    setSmokeHidden: vi.fn((_hidden: boolean) => true),
    group,
    getGroup() {
      return this.group;
    },
    dispose: vi.fn(),
  };
  (scene as any).tiles = tiles;
  await scene.init({ surface: adapter, settings });
  scene.start();
  const frames = (count: number) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      queue.shift()?.();
    }
  };
  /** Whether the placed tiles were last told to hide their white voxels. */
  const hidden = () => tiles.setSmokeHidden.mock.calls.at(-1)?.[0];
  return { scene, tiles, frames, hidden };
}

describe("GameScene: the chimney smoke (#770 PR 2) in the boards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A board (the app's `BOARD_SMOKE`): the ambient effects on, the cycle held at a season's noon by the fixed wheel. */
  const held = (season: number, extra: RendererSettingsInput = {}): RendererSettingsInput => ({
    quality: "medium",
    ambient: { enabled: true, reducedMotion: false, clouds: { enabled: false } },
    dayNight: { enabled: true, freezeAt: season + 0.3, reducedMotion: false },
    weather: { enabled: false },
    smoke: { enabled: true },
    ...extra,
  });
  const SUMMER = 0;
  const AUTUMN = 1;
  const WINTER = 2;
  const SPRING = 3;

  it("does not load in a scene that does not turn it on: the tiles keep their white voxels", async () => {
    const { scene, tiles } = await createScene({ ...held(WINTER), smoke: undefined });
    await (scene as any).dayNightLoad;
    expect((scene as any).smokeLoad).toBeNull();
    expect(scene.getSmoke()).toBeNull();
    expect(tiles.setSmokeHidden).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("smokes in autumn, winter and spring, every chimney (bare ones too), and fades out to summer, where the white voxels stay hidden", async () => {
    const { scene, frames, hidden } = await createScene(held(AUTUMN));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getSmoke()?.season).toBe("autumn"), CHUNK_WAIT);
    // Two tiles of a model with a smoking and a bare chimney: four chimneys, one draw of puffs and one of caps.
    expect(scene.getSmoke()).toMatchObject({ mode: "moving", presence: 1, chimneys: 4, drawCalls: 2, voxelsHidden: true });
    expect(scene.getSmoke()!.puffs).toBe(4 * DEFAULT_SMOKE_SETTINGS.seasons.autumn.amount * puffsPerChimney(smokeLookOf(DEFAULT_SMOKE_SETTINGS)));
    expect(hidden()).toBe(true);
    for (const season of [WINTER, SPRING]) {
      scene.setSettings(held(season));
      frames(150);
      expect(scene.getSmoke()).toMatchObject({ presence: 1, drawCalls: 2 });
    }
    // To summer: a fade over about 2 s (the loop at 30 steps a second), never a pop; then neither smoke nor white voxels.
    scene.setSettings(held(SUMMER));
    frames(60);
    const mid = scene.getSmoke()!;
    expect(mid.season).toBe("summer");
    expect(mid.presence).toBeGreaterThan(0.3);
    expect(mid.presence).toBeLessThan(0.7);
    frames(90);
    expect(scene.getSmoke()).toMatchObject({ presence: 0, puffs: 0, drawCalls: 1, voxelsHidden: true });
    expect(hidden()).toBe(true);
    scene.dispose();
    expect(scene.getSmoke()).toBeNull();
  });

  it("draws no smoke and shows the white voxels under the Low tier, reduced motion or 'Ambient effects' off", async () => {
    const { scene, hidden } = await createScene(held(WINTER));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getSmoke()?.mode).toBe("moving"), CHUNK_WAIT);
    expect(hidden()).toBe(true);
    for (const extra of [{ quality: "low" }, { ambient: { enabled: false } }, { ambient: { enabled: true, reducedMotion: true, clouds: { enabled: false } } }] as RendererSettingsInput[]) {
      scene.setSettings(held(WINTER, extra));
      expect(scene.getSmoke()).toMatchObject({ mode: "off", puffs: 0, drawCalls: 0, voxelsHidden: false });
      expect(hidden()).toBe(false);
      scene.setSettings(held(WINTER));
      expect(scene.getSmoke()).toMatchObject({ mode: "moving", presence: 1, voxelsHidden: true });
      expect(hidden()).toBe(true);
    }
    scene.dispose();
  });

  it("moves a tile's smoke and caps with it when the tile moves in place (its lift, size or cell: the same mesh)", async () => {
    const { scene, tiles } = await createScene(held(WINTER));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getSmoke()?.chimneys).toBe(4), CHUNK_WAIT);
    const object = (scene as any).smoke.object as THREE.Group;
    const mouths = (object.getObjectByName("chimney-smoke-puffs") as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.getAttribute("aMouth");
    const caps = object.getObjectByName("chimney-caps") as THREE.InstancedMesh;
    const capAt = () => new THREE.Vector3().setFromMatrixPosition(caps.instanceMatrix.array.length ? new THREE.Matrix4().fromArray(caps.instanceMatrix.array, 0) : new THREE.Matrix4());
    const [x, capX] = [mouths.getX(0), capAt().x];
    // The first tile's container moved 45 units along x, as `TileRenderer.place` does for a new cell: the same mesh, the same id.
    const container = tiles.smokeSources()[0]!.tile.parent!;
    container.position.x += 45;
    scene.updateTiles([]);
    expect(mouths.getX(0)).toBeCloseTo(x + 45, 4);
    expect(capAt().x).toBeCloseTo(capX + 45, 4);
    scene.dispose();
  });

  it("takes summer's day with the cycle off: no smoke (#770, open point 1)", async () => {
    const { scene } = await createScene(held(WINTER, { dayNight: { enabled: false } }));
    await vi.waitFor(() => expect(scene.getSmoke()).not.toBeNull(), CHUNK_WAIT);
    expect(scene.getSmoke()).toMatchObject({ season: "summer", puffs: 0 });
    scene.dispose();
  });

  it("is frozen while the loop is paused: its time stops", async () => {
    const { scene, frames } = await createScene(held(WINTER));
    await (scene as any).dayNightLoad;
    await vi.waitFor(() => expect(scene.getSmoke()?.presence).toBe(1), CHUNK_WAIT);
    frames(10);
    const moving = scene.ambient.time.value;
    frames(10);
    expect(scene.ambient.time.value).toBeGreaterThan(moving);
    scene.setCovered(true);
    const frozen = scene.ambient.time.value;
    frames(30);
    expect(scene.ambient.time.value).toBe(frozen);
    expect(scene.getSmoke()!.puffs).toBeGreaterThan(0);
    scene.dispose();
  });
});
