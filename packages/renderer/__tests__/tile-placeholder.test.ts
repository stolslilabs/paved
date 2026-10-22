import { DEFAULT_PLACEMENT_SETTINGS } from "../src/core/placement";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Plan, getPlanKey } from "@paved/game-core";

// The loader's network, as `skins.test.ts`'s: `loadAsync` resolves a URL to a one-box model; a URL in `held` waits until
// the test lets it through.
const net = vi.hoisted(() => ({ loadAsync: vi.fn(), setMeshoptDecoder: vi.fn() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync = net.loadAsync;
    setMeshoptDecoder = net.setMeshoptDecoder;
    setDRACOLoader = vi.fn();
  },
}));

import type { AssetManifest } from "../src/core/AssetLoader";
import { GameScene } from "../src/core/GameScene";
import { PLACEHOLDER_HEIGHT, TileRenderer } from "../src/core/TileRenderer";
import { isOutline } from "../src/core/outlines";
import { NO_SKINS, variantHash, variantIndex } from "../src/core/skins";
import type { HoverState, RenderSurfaceAdapter, TileRenderData } from "../src/core/types";

const box = () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return { scene };
};
const requested = () => net.loadAsync.mock.calls.map(([url]) => url as string);

let frames: Array<() => void> = [];
const nextFrame = () => {
  const due = frames;
  frames = [];
  due.forEach((run) => run());
};
const settle = () => new Promise((done) => setTimeout(done, 0));

/** URLs whose load waits for `release(url)` (once the load has started: a test settles first). */
let held: Map<string, () => void>;
const hold = (url: string) => held.set(url, () => {});
const release = (url: string) => held.get(url)!();

let manifestBody: unknown = null;
let base = 0;
const nextBase = () => `http://placeholder.test/b${++base}`;

beforeEach(() => {
  held = new Map();
  net.loadAsync.mockReset().mockImplementation(async (url: string) => {
    if (held.has(url)) await new Promise<void>((done) => held.set(url, done));
    return box();
  });
  manifestBody = null;
  frames = [];
  vi.stubGlobal("fetch", vi.fn(async () => (manifestBody === null ? new Response("not found", { status: 404 }) : new Response(JSON.stringify(manifestBody)))));
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => frames.push(cb));
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => frames.push(cb));
  vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const C = 2_147_483_647;
const GAME = 11;
const keyOf = (plan: number) => getPlanKey(Plan.from(plan).value);
const tile = (id: number, plan: number, x = C + id, y = C, orientation = 1): TileRenderData => ({ game_id: GAME, id, player_id: "0x1", plan, orientation, x, y, worldX: x - C, worldZ: C - y });

const surface = (): RenderSurfaceAdapter => ({
  getSize: () => ({ width: 320, height: 200 }),
  getDevicePixelRatio: () => 1,
  onResize: vi.fn(() => vi.fn()),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
});
function scene() {
  const renderer = {
    setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
    shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    domElement: { width: 320, height: 200 }, outputColorSpace: "", toneMapping: 0, toneMappingExposure: 1,
  };
  const controller = {
    camera: new THREE.PerspectiveCamera(50, 1, 1, 2000),
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false), resize: vi.fn(), setMode: vi.fn(), setBoardBounds: vi.fn(), focusBounds: vi.fn(), dispose: vi.fn(),
  };
  const s = new GameScene({ createRenderer: () => renderer as any, createCameraController: () => controller as any });
  (s as any).effects = { setLook: vi.fn(), init: vi.fn(), setCapabilities: vi.fn(), setProfile: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  return s;
}

/** The placed tiles' objects, and the model each was drawn from by tile id (null: the placeholder quad). */
const placed = (s: GameScene) => s.tiles.getGroup().children[0]!.children;
const drawn = (s: GameScene) => Object.fromEntries([...((s.tiles as any).tileMeshes as Map<string, { model: string | null }>)].map(([k, v]) => [k.split("-")[1], v.model]));
const ghost = (s: GameScene) => (s.tiles as any).previewContainer as THREE.Group | null;
/** The quad mesh of a placeholder or a quad ghost: its one child. */
const quadOf = (object: THREE.Object3D) => object.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
/** The first mesh of a model ghost. */
const meshOf = (object: THREE.Object3D) => {
  let found: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  object.traverse((o) => (found ??= o instanceof THREE.Mesh ? (o as any) : null));
  return found!;
};
const hover = (planIndex: number, extra: Partial<HoverState> = {}): HoverState => ({ x: 0, y: 1, valid: true, idle: true, planIndex, orientation: 1, ...extra });

/**
 * A scene up with tile 1 of plan 9 drawn; every other base model then held, and the rest after the first frame run.
 * What the test places next waits for its model.
 */
async function boardWithOneTile() {
  const at = nextBase();
  const s = scene();
  const init = s.init({ surface: surface(), basePath: at });
  s.updateTiles([tile(1, 9)]);
  await init;
  for (let plan = 1; plan <= 19; plan++) if (plan !== 9) hold(`${at}/models/${keyOf(plan)}.glb`);
  nextFrame();
  nextFrame();
  await settle();
  return { s, at };
}

describe("a tile whose model is on its way draws its plan's image on a flat quad", () => {
  it("draws the quad at once, then the model in its place in the same call, and is never empty or doubled", async () => {
    const { s, at } = await boardWithOneTile();
    const t = tile(2, 5, C + 2, C, 2);
    s.updateTiles([tile(1, 9), t]);
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": null });
    const quad = placed(s)[1]!;
    expect(quad.userData.placeholder).toBe(true);
    // At the ground's top, turned as its model would be, with the square's outline.
    const mesh = quadOf(quad);
    expect(mesh.position.y).toBeCloseTo(PLACEHOLDER_HEIGHT);
    expect(mesh.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(mesh.children.filter(isOutline)).toHaveLength(1);
    expect(quad.position.x).toBe(t.worldX * 3);

    // The swap happens inside the loader's callback (one synchronous call): before it the quad, after it the model,
    // always one object for the tile.
    const group = s.tiles.getGroup().children[0]!;
    const counts: number[] = [];
    const add = group.add.bind(group);
    const remove = group.remove.bind(group);
    vi.spyOn(group, "add").mockImplementation((...o) => (add(...o), counts.push(group.children.length), group));
    vi.spyOn(group, "remove").mockImplementation((...o) => (remove(...o), counts.push(group.children.length), group));
    (s as any).needsRender = false;
    (s as any).shadowsDirty = false;
    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    expect(placed(s)).toHaveLength(2);
    expect(placed(s).some((o) => o.userData.placeholder)).toBe(false);
    // The model is added before the quad goes: the tile never has zero objects, and the frame is drawn only after the
    // call, when the quad is gone (tile 1 and tile 2: two, three for the instant both are in the group).
    expect(counts).toEqual([3, 2]);
    expect((s as any).needsRender).toBe(true);
    expect((s as any).shadowsDirty).toBe(true);
    s.dispose();
  });

  it("uses the image the loader already holds: no request for it, none for anything else", async () => {
    const { s, at } = await boardWithOneTile();
    const images = vi.mocked(THREE.TextureLoader.prototype.loadAsync);
    // Loaded once, with the first frame.
    expect(images).toHaveBeenCalledTimes(19);
    const fetches = vi.mocked(fetch).mock.calls.length;
    const models = requested().length;
    s.updateTiles([tile(1, 9), tile(2, 5), tile(3, 12), tile(4, 5, C + 4, C, 3)]);
    s.setHoveredTile(hover(7));
    await settle();
    expect(images).toHaveBeenCalledTimes(19);
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetches);
    // Only the models the new tiles draw, once each, already asked for by the rest after the first frame.
    expect(requested()).toHaveLength(models);
    // The quad's picture is the loaded image itself (its copy shares the source: no second decode or fetch).
    const texture = (s.assets as any).textures.get(`tile-${keyOf(5)}`) as THREE.Texture;
    expect(quadOf(placed(s)[1]!).material.map!.source).toBe(texture.source);
    expect(at).toBeTruthy();
    s.dispose();
  });

  it("draws a pending (just placed, not confirmed) tile's quad in the pending style, then its model", async () => {
    const { s, at } = await boardWithOneTile();
    s.updateTiles([tile(1, 9), { ...tile(2, 5), pending: true }]);
    const material = quadOf(placed(s)[1]!).material;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(0.55);
    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    // Confirmed while the model loads: the quad stays, in the normal style.
    s.updateTiles([tile(1, 9), tile(2, 5), { ...tile(3, 12), pending: true }]);
    s.updateTiles([tile(1, 9), tile(2, 5), tile(3, 12)]);
    expect(drawn(s)["3"]).toBeNull();
    expect(quadOf(placed(s)[2]!).material.transparent).toBe(false);
    s.dispose();
  });

  it("covers a fresh board on a slow link: a tile placed before the base models of the rest came", async () => {
    const at = nextBase();
    // Everything but plan 9 is slow: the first frame waits for plan 9 only.
    for (let plan = 1; plan <= 19; plan++) if (plan !== 9) hold(`${at}/models/${keyOf(plan)}.glb`);
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    await init;
    s.updateTiles([tile(1, 9), tile(2, 15)]);
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": null });
    nextFrame();
    nextFrame();
    await settle();
    release(`${at}/models/${keyOf(15)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(15) });
    s.dispose();
  });
});

describe("a tile image that fails or comes late", () => {
  /** The tries of each image URL, in order: "fail" rejects, "hold" waits for `releaseImage(url)`; past the list, it loads. */
  let tries: Map<string, Array<"fail" | "hold">>;
  let heldImages: Map<string, () => void>;
  const releaseImage = (url: string) => heldImages.get(url)!();
  const imageCalls = (url?: string) => vi.mocked(THREE.TextureLoader.prototype.loadAsync).mock.calls.filter(([u]) => !url || u === url).length;
  beforeEach(() => {
    tries = new Map();
    heldImages = new Map();
    vi.mocked(THREE.TextureLoader.prototype.loadAsync).mockImplementation(async (url: string) => {
      const next = tries.get(url)?.shift();
      if (next === "fail") throw new Error(`404 ${url}`);
      if (next === "hold") await new Promise<void>((done) => heldImages.set(url, done));
      return new THREE.Texture();
    });
  });
  const image = (at: string, plan: number) => `${at}/assets/tiles/${keyOf(plan)}.png`;

  it("does not stop the scene on the normal mount (tiles handed before init): the tile draws no quad, then its model", async () => {
    const at = nextBase();
    tries.set(image(at, 5), ["fail", "fail"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    // Handed before the models are in: the renderer looks for the quad's image then, which must not count as the plan view.
    s.updateTiles([tile(1, 9)]);
    await expect(init).resolves.toBeUndefined();
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("tile images"), expect.any(Error));

    hold(`${at}/models/${keyOf(5)}.glb`);
    s.updateTiles([tile(1, 9), tile(2, 5)]);
    // No image for plan 5: no quad (the cell waits for its model, as before Q-POLISH-R), and no frame lost.
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    await settle();
    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    s.dispose();
  });

  it("still stops the scene when the plan view asked for the images and one fails", async () => {
    const at = nextBase();
    tries.set(image(at, 5), ["fail"]);
    const s = scene();
    // As GameCanvas: init, then the view and the tiles in the same commit.
    const init = s.init({ surface: surface(), basePath: at });
    s.setStrategyMode(true);
    s.updateTiles([tile(1, 9)]);
    await expect(init).rejects.toThrow("404");
    s.dispose();
  });

  it("gives a tile and the ghost their quad when a missing image comes late, asking only for that image again", async () => {
    const at = nextBase();
    // The first try fails (before the first frame), the retry after the first frame is held.
    tries.set(image(at, 5), ["fail", "hold"]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    await init;
    hold(`${at}/models/${keyOf(5)}.glb`);
    s.updateTiles([tile(1, 9), tile(2, 5)]);
    s.setHoveredTile(hover(5));
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    expect((s.tiles as any).previewKey).toMatch(/-none$/);

    nextFrame();
    nextFrame();
    await settle();
    // The retry asks for plan 5's image only: the 18 in already are kept, not fetched and overwritten.
    expect(imageCalls()).toBe(20);
    expect(imageCalls(image(at, 5))).toBe(2);
    expect(drawn(s)).toEqual({ "1": keyOf(9) });

    (s as any).needsRender = false;
    releaseImage(image(at, 5));
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": null });
    expect(placed(s)[1]!.userData.placeholder).toBe(true);
    expect((s.tiles as any).previewKey).toMatch(/-quad$/);
    expect((s as any).needsRender).toBe(true);

    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    expect((s.tiles as any).previewKey).toContain(`-${keyOf(5)}`);
    s.dispose();
  });
});

describe("the ghost while its model loads", () => {
  it("draws the quad, then the model: the shared materials", async () => {
    const { s, at } = await boardWithOneTile();
    s.setHoveredTile(hover(5, { orientation: 4 }));
    const quad = quadOf(ghost(s)!.children[0]!);
    expect((s.tiles as any).previewKey).toMatch(/-quad$/);
    expect(quad.position.y).toBeCloseTo(PLACEHOLDER_HEIGHT);
    expect(quad.rotation.y).toBeCloseTo(Math.PI / 2);
    // The plan's own material, copied once and tinted translucent (pending feedback does not wait for the model); the
    // copy is the tiles renderer's, one per plan material, and the shared one is untouched.
    const shared = (s.tiles as any).placeholderTypes.get(keyOf(5)).material as THREE.MeshStandardMaterial;
    const tinted = quad.material as THREE.MeshStandardMaterial;
    expect(tinted).not.toBe(shared);
    expect(tinted.transparent).toBe(true);
    expect(shared.transparent).toBe(false);
    expect(tinted.customProgramCacheKey()).toBe("paved-quad-ghost");
    expect((s.tiles as any).ghostMaterials.hand.get(shared)).toBe(tinted);

    // Placed: its look turns pending (the pulse, from its minimum), on the quad too.
    s.setHoveredTile(hover(5, { orientation: 4, placed: true }));
    expect((s.tiles as any).placement.getGhost()).toMatchObject({ kind: "pending" });
    expect((s.tiles as any).placement.ghostTint(Number.NaN)[4]).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.tints.pendingPulseMin, 6);

    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect((s.tiles as any).previewKey).toContain(keyOf(5));
    expect(meshOf(ghost(s)!.children[0]!).geometry).not.toBe(quad.geometry);
    s.dispose();
  });
});

describe("the confirm while its model loads", () => {
  it("overlays the quad, then the model once it is in", async () => {
    const { s, at } = await boardWithOneTile();
    s.setConfirmedTile(hover(5, { orientation: 4, placed: true, key: 7 }));
    const tiles = s.tiles as any;
    expect(tiles.confirmPlaceholder).toBe(true);
    const before = tiles.confirmContainer;
    expect(before).not.toBeNull();
    expect(before.children[0].userData.placeholder ?? quadOf(before.children[0]!)).toBeTruthy();

    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    // The model arrived: the overlay is rebuilt on it, tinted, with no restart of the fade.
    expect(tiles.confirmPlaceholder).toBe(false);
    expect(tiles.confirmContainer).not.toBeNull();
    expect(tiles.confirmContainer).not.toBe(before);
    expect(s.tiles.placement ?? tiles.placement).toBeDefined();
    expect(tiles.placement.isConfirming()).toBe(true);
    s.dispose();
  });
});

describe("the hover and the confirm of one plan, both on the quad", () => {
  it("one refresh upgrades both to the model", async () => {
    const { s, at } = await boardWithOneTile();
    s.setHoveredTile(hover(5, { orientation: 4 }));
    s.setConfirmedTile(hover(5, { orientation: 4, placed: true, key: 8 }));
    const tiles = s.tiles as any;
    expect(tiles.previewKey).toMatch(/-quad$/);
    expect(tiles.confirmPlaceholder).toBe(true);
    const overlay = tiles.confirmContainer;

    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    // The one asset callback that delivered the model leaves neither on the placeholder.
    expect(tiles.previewKey).toContain(keyOf(5));
    expect(tiles.confirmPlaceholder).toBe(false);
    expect(tiles.confirmContainer).not.toBe(overlay);
    s.dispose();
  });
});

describe("a live switch of skins", () => {
  const variants = (plan: number) => [1, 2, 3].map((n) => `models/forest/${keyOf(plan)}_HF_${n}.0123456789.glb`);
  const manifest: AssetManifest = { models: {}, themes: { "1": { [keyOf(9)]: variants(9), [keyOf(5)]: variants(5) } } };
  const variantOf = (t: TileRenderData) => variants(t.plan)[variantIndex(variantHash(t.plan, t.x, t.y, t.game_id), 3)]!;

  it("skins off: the tiles keep their variants until the base model comes, the ghost draws the quad meanwhile", async () => {
    manifestBody = manifest;
    const at = nextBase();
    const s = scene();
    const tiles = [tile(1, 9), tile(2, 5)];
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins({ [keyOf(9)]: 1, [keyOf(5)]: 1 });
    s.updateTiles(tiles);
    await init;
    nextFrame();
    nextFrame();
    await settle();
    // The ghost over tile 1's cell: the variant tile 1 already loaded.
    const cell = { x: tiles[0]!.x, y: tiles[0]!.y, gameId: GAME };
    s.setHoveredTile(hover(9, { cell }));
    expect((s.tiles as any).previewKey).toContain(variantOf(tiles[0]!));

    hold(`${at}/models/${keyOf(9)}.glb`);
    hold(`${at}/models/${keyOf(5)}.glb`);
    s.setSkins(NO_SKINS);
    s.updateTiles(tiles);
    // SKIN-BASE's rule: a drawn variant stays; the ghost, rebuilt for its new model, shows the quad.
    expect(drawn(s)).toEqual({ "1": variantOf(tiles[0]!), "2": variantOf(tiles[1]!) });
    expect((s.tiles as any).previewKey).toMatch(/-quad$/);
    expect(ghost(s)).not.toBeNull();

    await settle();
    release(`${at}/models/${keyOf(9)}.glb`);
    await settle();
    expect((s.tiles as any).previewKey).toContain(`-${keyOf(9)}`);
    expect(drawn(s)["1"]).toBe(keyOf(9));
    release(`${at}/models/${keyOf(5)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    s.dispose();
  });

  it("a variant that fails: the quad stays until the base model it falls back to comes, then the base", async () => {
    manifestBody = manifest;
    const at = nextBase();
    const t = tile(1, 9);
    net.loadAsync.mockImplementation(async (url: string) => {
      if (url === `${at}/${variantOf(t)}`) throw new Error(`404 ${url}`);
      if (held.has(url)) await new Promise<void>((done) => held.set(url, done));
      return box();
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    s.setSkins({ [keyOf(9)]: 1 });
    await s.init({ surface: surface(), basePath: at });
    hold(`${at}/models/${keyOf(9)}.glb`);
    s.updateTiles([t]);
    expect(drawn(s)).toEqual({ "1": null });
    await settle();
    await settle();
    // The variant failed and the base model is on its way: still the quad, never an empty cell.
    expect(requested()).toContain(`${at}/models/${keyOf(9)}.glb`);
    expect(drawn(s)).toEqual({ "1": null });
    release(`${at}/models/${keyOf(9)}.glb`);
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    s.dispose();
  });

  it("skins on, base model never loaded: a new tile and the ghost draw the quad, then the variant", async () => {
    manifestBody = manifest;
    const at = nextBase();
    const s = scene();
    s.setSkins({ [keyOf(9)]: 1 });
    await s.init({ surface: surface(), basePath: at });
    const t = tile(1, 9);
    hold(`${at}/${variantOf(t)}`);
    s.updateTiles([t]);
    s.setHoveredTile(hover(9, { cell: { x: t.x, y: t.y, gameId: GAME } }));
    expect(drawn(s)).toEqual({ "1": null });
    expect((s.tiles as any).previewKey).toMatch(/-quad$/);
    await settle();
    release(`${at}/${variantOf(t)}`);
    await settle();
    expect(drawn(s)).toEqual({ "1": variantOf(t) });
    expect((s.tiles as any).previewKey).toContain(variantOf(t));
    expect(requested()).not.toContain(`${at}/models/${keyOf(9)}.glb`);
    s.dispose();
  });
});

describe("no leak after many swaps", () => {
  /** A loader whose models are in or not as `inModels` says; one image for every plan. */
  function fakeAssets() {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const image = new THREE.Texture();
    const inModels = new Set<string>();
    return {
      inModels,
      image,
      has: (id: string) => inModels.has(id),
      want: () => {},
      setSkins: () => {},
      getModel(id: string) {
        if (!inModels.has(id)) throw new Error(`Model not found: ${id}`);
        const copy = source.clone();
        copy.traverse((c) => {
          if (c instanceof THREE.Mesh) c.material = (c.material as THREE.Material).clone();
        });
        return copy;
      },
      getTexture: () => image,
      peekTexture: () => image,
    };
  }

  it("shares one quad, one outline and one material per plan across tiles and swaps, and disposes them once", () => {
    const assets = fakeAssets();
    const renderer = new TileRenderer(assets as any);
    const tiles = [tile(1, 5), tile(2, 5, C + 2, C, 3), tile(3, 12)];
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (let round = 0; round < 50; round++) {
      if (round % 2) assets.inModels.add(keyOf(5)).add(keyOf(12));
      else assets.inModels.clear();
      // A model that goes away again (a live skin switch back) keeps the model drawn: start each quad round fresh.
      if (!(round % 2)) renderer.updateTiles([]);
      renderer.updateTiles(tiles);
      expect(renderer.getGroup().children[0]!.children).toHaveLength(3);
      renderer.getGroup().children[0]!.traverse((o) => {
        if (o instanceof THREE.Mesh && o.parent?.userData.placeholder) {
          geometries.add(o.geometry);
          materials.add(o.material as THREE.Material);
          o.children.forEach((outline) => geometries.add((outline as THREE.Mesh).geometry));
        }
      });
    }
    // The quad and its outline, and one material for each of the two plans: nothing per tile or per swap.
    expect(geometries.size).toBe(2);
    expect(materials.size).toBe(2);
    const spies = [...geometries, ...materials].map((r) => vi.spyOn(r, "dispose"));
    const maps = [...materials].map((m) => vi.spyOn((m as THREE.MeshStandardMaterial).map!, "dispose"));
    renderer.dispose();
    for (const spy of [...spies, ...maps]) expect(spy).toHaveBeenCalledTimes(1);
    // The loader's image is the loader's: the renderer disposes only its own copies.
    expect(maps.every((spy) => spy.mock.contexts[0] !== assets.image)).toBe(true);
  });

  it("makes no ghost material, quad or model, as the ghost swaps: the shared ones, each disposed once", () => {
    const assets = fakeAssets();
    const renderer = new TileRenderer(assets as any);
    const seen = new Set<THREE.Material>();
    for (let round = 0; round < 40; round++) {
      if (round % 2) assets.inModels.add(keyOf(5));
      else assets.inModels.clear();
      renderer.setHover(hover(5, { valid: round % 3 !== 0, placed: round % 4 === 0 }));
      const container = (renderer as any).previewContainer as THREE.Group;
      container.traverse((o) => {
        if (o instanceof THREE.Mesh) seen.add(o.material as THREE.Material);
      });
    }
    renderer.setHover(null);
    // The plan's quad material, the model's (one source), the outline's, the model's one tinted copy (kept across swaps),
    // and the tile in hand's outlines' (#657).
    expect(seen.size).toBeLessThanOrEqual(5);
    const spies = [...seen].map((m) => vi.spyOn(m, "dispose"));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    renderer.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
