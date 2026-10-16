import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Plan, PlanType, getPlanKey } from "@paved/game-core";

// The loader's network, as `asset-loader-order.test.ts`'s: `loadAsync` resolves a URL to a one-box model, or rejects for
// the URLs in `failing`.
const net = vi.hoisted(() => ({ loadAsync: vi.fn(), setMeshoptDecoder: vi.fn(), failing: new Set<string>() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync = net.loadAsync;
    setMeshoptDecoder = net.setMeshoptDecoder;
    setDRACOLoader = vi.fn();
  },
}));

import { AssetLoader, skinModelPath, type AssetManifest } from "../src/core/AssetLoader";
import { GameScene } from "../src/core/GameScene";
import { NO_SKINS, skinRef, skinsOf, variantHash, variantIndex } from "../src/core/skins";
import type { RenderSurfaceAdapter, TileRenderData } from "../src/core/types";

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

let manifestBody: unknown = null;
let base = 0;
const nextBase = () => `http://skins.test/b${++base}`;

beforeEach(() => {
  net.loadAsync.mockReset().mockImplementation(async (url: string) => {
    if (net.failing.has(url)) throw new Error(`404 ${url}`);
    return box();
  });
  net.failing.clear();
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
const planOf = (type: PlanType) => Object.values(PlanType).indexOf(type);
const keyOf = (plan: number) => getPlanKey(Plan.from(plan).value);

describe("the variant hash: origin/dev's getVarietyModelPath", () => {
  // origin/dev's function run once (its text, `app/src/dojo/game/models/tile.ts`, with `getModelVariations` at 4, 7 and 9):
  // the variant it named for each input, 1-based, and the density (`LF` for an even hash, `HF` for an odd one).
  const vectors: Array<{ plan: PlanType; x: number; y: number; gameId: number; density: "LF" | "HF"; variant: Record<4 | 7 | 9, number> }> = [
    { plan: PlanType.CCCCCCCCC, x: C, y: C, gameId: 1, density: "LF", variant: { 4: 1, 7: 6, 9: 6 } },
    { plan: PlanType.RFRFFFFFR, x: C + 1, y: C, gameId: 1, density: "HF", variant: { 4: 2, 7: 5, 9: 1 } },
    { plan: PlanType.SFRFRFRFR, x: C - 3, y: C + 2, gameId: 42, density: "HF", variant: { 4: 4, 7: 4, 9: 9 } },
    { plan: PlanType.WFFFFFFFF, x: C, y: C - 1, gameId: 7, density: "HF", variant: { 4: 2, 7: 3, 9: 3 } },
    { plan: PlanType.FFCFFFCFF, x: C + 5, y: C + 5, gameId: 123456, density: "HF", variant: { 4: 4, 7: 4, 9: 6 } },
  ];

  it.each(vectors)("$plan at ($x, $y) of game $gameId", ({ plan, x, y, gameId, density, variant }) => {
    const hash = variantHash(planOf(plan), x, y, gameId);
    expect(Number.isInteger(hash) && hash === (hash | 0)).toBe(true);
    expect(Math.abs(hash) % 2 === 0 ? "LF" : "HF").toBe(density);
    for (const count of [4, 7, 9] as const) expect(variantIndex(hash, count) + 1).toBe(variant[count]);
  });

  it("is deterministic: the same tile gives the same hash, another cell or game another", () => {
    const plan = planOf(PlanType.CCCCCFFFC);
    expect(variantHash(plan, C, C + 1, 5)).toBe(variantHash(plan, C, C + 1, 5));
    expect(variantHash(plan, C, C + 1, 5)).not.toBe(variantHash(plan, C + 1, C, 5));
    expect(variantHash(plan, C, C + 1, 5)).not.toBe(variantHash(plan, C, C + 1, 6));
  });

  it("maps into the plan's own count: one variant is always the first, a negative hash as its absolute value", () => {
    expect(variantIndex(123456789, 1)).toBe(0);
    expect(variantIndex(-10, 4)).toBe(2);
    expect(variantIndex(-(2 ** 31), 3)).toBe(2 ** 31 % 3);
    expect(variantIndex(5, 0)).toBe(0);
  });
});

describe("the skin map", () => {
  it("reads a chain's active set, plan 1 first, leaving out the plans at 0", () => {
    const active = new Array<number>(19).fill(0);
    active[0] = 1;
    active[18] = 2;
    expect(skinsOf(active)).toEqual({ [keyOf(1)]: 1, [keyOf(19)]: 2 });
    expect(skinsOf(new Array<number>(19).fill(0))).toEqual({});
  });

  it("gives a tile its theme and hash, or null for a plan without one", () => {
    const skins = { [keyOf(9)]: 1 };
    expect(skinRef(skins, 9, C, C, 3)).toEqual({ theme: 1, hash: variantHash(9, C, C, 3) });
    expect(skinRef(skins, 5, C, C, 3)).toBeNull();
    expect(skinRef(NO_SKINS, 9, C, C, 3)).toBeNull();
  });
});

describe("the manifest's themes", () => {
  const manifest: AssetManifest = {
    models: { ccccccccc: "models/ccccccccc.aaaaaaaaaa.glb" },
    themes: { "1": { ccccccccc: ["models/forest/ccccccccc_HF_1.b.glb", "models/forest/ccccccccc_HF_2.c.glb"] } },
  };

  it("picks the variant by the hash among the plan's variants, and the base model where none is listed", () => {
    expect(skinModelPath(manifest, "ccccccccc", { theme: 1, hash: 4 })).toBe("models/forest/ccccccccc_HF_1.b.glb");
    expect(skinModelPath(manifest, "ccccccccc", { theme: 1, hash: -3 })).toBe("models/forest/ccccccccc_HF_2.c.glb");
    // A theme the manifest does not list (Snow, Desert, Volcano: coming soon), a plan it does not list, no manifest.
    expect(skinModelPath(manifest, "ccccccccc", { theme: 2, hash: 4 })).toBe("ccccccccc");
    expect(skinModelPath(manifest, "rfffrfffr", { theme: 1, hash: 4 })).toBe("rfffrfffr");
    expect(skinModelPath(null, "ccccccccc", { theme: 1, hash: 4 })).toBe("ccccccccc");
    expect(skinModelPath(manifest, "ccccccccc", null)).toBe("ccccccccc");
  });

  it("reads `themes` from the served manifest, and refuses a manifest whose themes are not path lists", async () => {
    manifestBody = manifest;
    const at = nextBase();
    const assets = new AssetLoader(at);
    await assets.preloadAll();
    expect(assets.skinModel("ccccccccc", { theme: 1, hash: 4 })).toBe("models/forest/ccccccccc_HF_1.b.glb");

    manifestBody = { models: {}, themes: { "1": { ccccccccc: "models/forest/x.glb" } } };
    const other = new AssetLoader(nextBase());
    await other.preloadAll();
    expect(other.skinModel("ccccccccc", { theme: 1, hash: 4 })).toBe("ccccccccc");
  });

  it("takes a manifest from the host instead of fetching one", async () => {
    const assets = new AssetLoader(nextBase(), manifest);
    await assets.preloadAll();
    expect(fetch).not.toHaveBeenCalled();
    expect(assets.skinModel("ccccccccc", { theme: 1, hash: 4 })).toBe("models/forest/ccccccccc_HF_1.b.glb");
    expect(requested().some((u) => u.endsWith("/models/ccccccccc.aaaaaaaaaa.glb"))).toBe(true);
    assets.dispose();
  });
});

describe("GameScene with skins", () => {
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
  const GAME = 11;
  const tile = (id: number, plan: number, x = C + id, y = C): TileRenderData => ({ game_id: GAME, id, player_id: "0x1", plan, orientation: 1, x, y, worldX: x - C, worldZ: C - y });
  /** Three Forest variants for plans 9 and 5 (the manifest's shape), the base models under their plain names. */
  const variants = (plan: number) => [1, 2, 3].map((n) => `models/forest/${keyOf(plan)}_HF_${n}.0123456789.glb`);
  const forest: AssetManifest = { models: {}, themes: { "1": { [keyOf(9)]: variants(9), [keyOf(5)]: variants(5) } } };
  const variantOf = (t: TileRenderData) => variants(t.plan)[variantIndex(variantHash(t.plan, t.x, t.y, t.game_id), 3)]!;
  /** The model each drawn tile was drawn from, by tile id. */
  const drawn = (s: GameScene) => Object.fromEntries([...((s.tiles as any).tileMeshes as Map<string, { model: string }>)].map(([k, v]) => [k.split("-")[1], v.model]));
  const variantRequests = () => requested().filter((u) => u.includes("/models/forest/"));

  it("loads only the variants of the tiles on the board, for the first frame, and draws each tile from its variant", async () => {
    manifestBody = forest;
    const at = nextBase();
    const s = scene();
    const tiles = [tile(1, 9), tile(2, 9), tile(3, 5)];
    // GameCanvas: init, then the skins and the tiles in the same commit.
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins({ [keyOf(9)]: 1 });
    s.updateTiles(tiles);
    await init;
    const first = [variantOf(tiles[0]!), variantOf(tiles[1]!)];
    expect(variantRequests().sort()).toEqual([...new Set(first)].map((p) => `${at}/${p}`).sort());
    // Plan 5 has Forest variants in the manifest but no skin: its base model, no variant.
    expect(requested()).toContain(`${at}/models/${keyOf(5)}.glb`);
    expect(drawn(s)).toEqual({ "1": first[0], "2": first[1], "3": keyOf(5) });

    // After the first frame the base models of the plans with no skin come in, and still no variant the board does not
    // show; plan 9's base model, skinned and listed, is a fallback nothing asked for (SKIN-BASE).
    nextFrame();
    nextFrame();
    await settle();
    expect(requested().filter((u) => !u.includes("/forest/"))).toHaveLength(18);
    expect(requested()).not.toContain(`${at}/models/${keyOf(9)}.glb`);
    expect(variantRequests()).toHaveLength(new Set(first).size);

    // A tile placed later loads its own variant then, once (the cache is per path).
    const later = [1, 2, 3, 4, 5, 6].map((n) => tile(10 + n, 9, C - n, C + n)).find((t) => !first.includes(variantOf(t)))!;
    s.updateTiles([...tiles, later]);
    await settle();
    await settle();
    expect(variantRequests()).toContain(`${at}/${variantOf(later)}`);
    expect(drawn(s)[String(later.id)]).toBe(variantOf(later));
    const count = variantRequests().length;
    s.updateTiles([...tiles, later, { ...later, id: 30 }]);
    await settle();
    expect(variantRequests()).toHaveLength(count);
    s.dispose();
  });

  it("draws the base model where the variant fails to load, and does not ask for it again", async () => {
    manifestBody = forest;
    const at = nextBase();
    const t = tile(1, 9);
    net.failing.add(`${at}/${variantOf(t)}`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins({ [keyOf(9)]: 1 });
    s.updateTiles([t]);
    await init;
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(variantOf(t)), expect.any(Error));
    s.updateTiles([t, { ...t, id: 2 }]);
    await settle();
    expect(requested().filter((u) => u === `${at}/${variantOf(t)}`)).toHaveLength(1);
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(9) });
    s.dispose();
  });

  it("keeps the base model for theme 0, a theme the manifest does not list, and a host with no manifest", async () => {
    for (const [body, skins] of [
      [forest, { [keyOf(9)]: 0 }],
      [forest, { [keyOf(9)]: 3 }],
      [null, { [keyOf(9)]: 1 }],
    ] as const) {
      manifestBody = body;
      const at = nextBase();
      const s = scene();
      const init = s.init({ surface: surface(), basePath: at });
      s.setSkins(skins);
      s.updateTiles([tile(1, 9)]);
      await init;
      expect(drawn(s)).toEqual({ "1": keyOf(9) });
      expect(variantRequests()).toEqual([]);
      s.dispose();
    }
  });

  it("swaps a drawn tile to its variant when the skins come after the board (a slow skin read never blocks it)", async () => {
    manifestBody = forest;
    const at = nextBase();
    const s = scene();
    const t = tile(1, 9);
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([t]);
    await init;
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    let arrive!: () => void;
    net.loadAsync.mockImplementation(async (url: string) => {
      if (url.includes("/forest/")) await new Promise<void>((done) => (arrive = done));
      return box();
    });
    s.setSkins({ [keyOf(9)]: 1 });
    // The variant is on its way: the base model stays drawn meanwhile.
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    await settle();
    arrive();
    await settle();
    expect(drawn(s)).toEqual({ "1": variantOf(t) });
    // Skins off again: back to the base model.
    s.setSkins(NO_SKINS);
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    s.dispose();
  });

  it("draws the ghost with the variant of the cell it hovers", async () => {
    manifestBody = forest;
    const at = nextBase();
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins({ [keyOf(9)]: 1 });
    s.updateTiles([tile(1, 9)]);
    await init;
    const cell = tile(2, 9, C, C - 1);
    const getModel = vi.spyOn(s.assets, "getModel");
    s.setHoveredTile({ x: 0, y: 1, valid: true, idle: true, planIndex: 9, orientation: 1, cell: { x: cell.x, y: cell.y, gameId: GAME } });
    await settle();
    await settle();
    expect(getModel).toHaveBeenLastCalledWith(variantOf(cell));
    expect((s.tiles as any).previewKey).toContain(variantOf(cell));
    // Without a cell: the variant at the board's centre of game 0, as the hand's tile, not the base model.
    s.setHoveredTile({ x: 0, y: 1, valid: true, idle: true, planIndex: 9, orientation: 2 });
    await settle();
    await settle();
    expect(getModel).toHaveBeenLastCalledWith(variantOf({ ...cell, x: C, y: C, game_id: 0 }));
    expect(requested()).not.toContain(`${at}/models/${keyOf(9)}.glb`);
    s.dispose();
  });
});

// SKIN-BASE: a skinned plan's base model is a fallback, loaded only when a tile needs it.
describe("the base model as a fallback", () => {
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
  const GAME = 11;
  const tile = (id: number, plan: number, x = C + id, y = C): TileRenderData => ({ game_id: GAME, id, player_id: "0x1", plan, orientation: 1, x, y, worldX: x - C, worldZ: C - y });
  /** The plans the manifest lists, as the real one lists all 19 of Forest: plan numbers 1 to 19. */
  const PLANS = Array.from({ length: 19 }, (_, i) => i + 1);
  const variants = (plan: number) => [1, 2, 3].map((n) => `models/forest/${keyOf(plan)}_HF_${n}.0123456789.glb`);
  const manifest: AssetManifest = { models: {}, themes: { "1": Object.fromEntries(PLANS.map((p) => [keyOf(p), variants(p)])) } };
  const variantOf = (t: TileRenderData) => variants(t.plan)[variantIndex(variantHash(t.plan, t.x, t.y, t.game_id), 3)]!;
  const skinned = (themeOf: (plan: number) => number) => Object.fromEntries(PLANS.map((p) => [keyOf(p), themeOf(p)]).filter(([, t]) => t));
  const baseRequests = () => requested().filter((u) => !u.includes("/forest/"));
  const drawn = (s: GameScene) => Object.fromEntries([...((s.tiles as any).tileMeshes as Map<string, { model: string }>)].map(([k, v]) => [k.split("-")[1], v.model]));
  /** The frames and idle callbacks that run after the first frame, so the rest of the models load. */
  const afterFirst = async () => {
    nextFrame();
    nextFrame();
    await settle();
  };

  async function board(skins: Record<string, number> | null, tiles: TileRenderData[], body: unknown = manifest) {
    manifestBody = body;
    const at = nextBase();
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    if (skins) s.setSkins(skins);
    s.updateTiles(tiles);
    await init;
    return { s, at };
  }

  it("requests no base model on a fully skinned board, not even after the first frame", async () => {
    const tiles = PLANS.map((p) => tile(p, p));
    const { s, at } = await board(skinned(() => 1), tiles);
    expect(drawn(s)).toEqual(Object.fromEntries(tiles.map((t) => [String(t.id), variantOf(t)])));
    await afterFirst();
    expect(baseRequests()).toEqual([]);
    expect(requested().sort()).toEqual([...new Set(tiles.map(variantOf))].map((p) => `${at}/${p}`).sort());
    s.dispose();
  });

  it("requests no base model of a scene handed no tiles either, until a tile needs one", async () => {
    const { s } = await board(skinned(() => 1), []);
    await afterFirst();
    expect(requested()).toEqual([]);
    s.updateTiles([tile(1, 9)]);
    await settle();
    await settle();
    expect(baseRequests()).toEqual([]);
    expect(requested()).toHaveLength(1);
    s.dispose();
  });

  it("loads the base model of the plan at theme 0 only, the others staying skinned", async () => {
    const tiles = [tile(1, 9), tile(2, 5), tile(3, 12)];
    const { s, at } = await board(skinned((p) => (p === 9 ? 0 : 1)), tiles);
    expect(drawn(s)).toMatchObject({ "1": keyOf(9), "2": variantOf(tiles[1]!), "3": variantOf(tiles[2]!) });
    await afterFirst();
    expect(baseRequests()).toEqual([`${at}/models/${keyOf(9)}.glb`]);
    s.dispose();
  });

  it("loads the base model of the plan whose variant fails only, the other skinned plans staying without one", async () => {
    const tiles = [tile(1, 9), tile(2, 5)];
    manifestBody = manifest;
    const at = nextBase();
    net.failing.add(`${at}/${variantOf(tiles[0]!)}`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins(skinned(() => 1));
    s.updateTiles(tiles);
    await init;
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": variantOf(tiles[1]!) });
    await afterFirst();
    expect(baseRequests()).toEqual([`${at}/models/${keyOf(9)}.glb`]);
    expect(warn).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it("loads the base models of the tiles it draws when the skin read failed (no skins at all), and no variant", async () => {
    const tiles = [tile(1, 9), tile(2, 5)];
    const { s, at } = await board(null, tiles);
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    expect(requested().filter((u) => u.includes("/forest/"))).toEqual([]);
    // The first frame waited for these two only; the rest follow it.
    expect(baseRequests().slice(0, 2).sort()).toEqual([`${at}/models/${keyOf(5)}.glb`, `${at}/models/${keyOf(9)}.glb`].sort());
    s.dispose();
  });

  it("draws the placeholder quad for a tile whose variant is on its way and whose base model was never asked for", async () => {
    const t = tile(1, 9);
    let arrive!: () => void;
    manifestBody = manifest;
    const at = nextBase();
    net.loadAsync.mockImplementation(async (url: string) => {
      if (url.includes("/forest/")) await new Promise<void>((done) => (arrive = done));
      return box();
    });
    const s = scene();
    s.setSkins(skinned(() => 1));
    // The scene is up (no tile handed, so nothing awaited); the tile comes after.
    await s.init({ surface: surface(), basePath: at });
    s.updateTiles([t]);
    await settle();
    // Q-POLISH-R: the plan's image on a flat quad meanwhile (model null), the ghost likewise.
    expect(drawn(s)).toEqual({ "1": null });
    s.setHoveredTile({ x: 0, y: 1, valid: true, idle: true, planIndex: 9, orientation: 1, cell: { x: t.x + 1, y: t.y, gameId: GAME } });
    expect((s.tiles as any).previewKey).toMatch(/-quad$/);
    arrive();
    await settle();
    await settle();
    expect(drawn(s)).toEqual({ "1": variantOf(t) });
    expect(baseRequests()).toEqual([]);
    s.dispose();
  });

  it("keeps the base model of a drawn tile until the skin read that comes after the first draw is in", async () => {
    const t = tile(1, 9);
    const { s, at } = await board(null, [t]);
    expect(drawn(s)).toEqual({ "1": keyOf(9) });
    // The skins come after the first frame but before the rest of the models: those plans' base models are spared.
    s.setSkins(skinned(() => 1));
    await afterFirst();
    await settle();
    expect(drawn(s)).toEqual({ "1": variantOf(t) });
    // Plan 9's base model was asked for once (the first draw), no other plan's.
    expect(baseRequests()).toEqual([`${at}/models/${keyOf(9)}.glb`]);
    s.dispose();
  });

  it("keeps the variants drawn when the skins go off until the base models arrive, never an empty tile", async () => {
    const tiles = [tile(1, 9), tile(2, 5)];
    const { s, at } = await board(skinned(() => 1), tiles);
    await afterFirst();
    const variantsDrawn = Object.fromEntries(tiles.map((t) => [String(t.id), variantOf(t)]));
    expect(drawn(s)).toEqual(variantsDrawn);
    expect(baseRequests()).toEqual([]);
    const held: Array<() => void> = [];
    net.loadAsync.mockImplementation(async (url: string) => {
      await new Promise<void>((done) => held.push(done));
      return box();
    });
    // The viewer's opt-out, live: the base models are asked for at once, the variants stay until they are in.
    s.setSkins(NO_SKINS);
    s.updateTiles(tiles);
    await settle();
    expect(baseRequests().sort()).toEqual([`${at}/models/${keyOf(5)}.glb`, `${at}/models/${keyOf(9)}.glb`].sort());
    expect(drawn(s)).toEqual(variantsDrawn);
    held[0]!();
    await settle();
    await settle();
    // One base is in: its tile swaps, the other still draws its variant.
    expect(Object.keys(drawn(s)).sort()).toEqual(["1", "2"]);
    held.slice(1).forEach((done) => done());
    await settle();
    await settle();
    expect(drawn(s)).toEqual({ "1": keyOf(9), "2": keyOf(5) });
    s.dispose();
  });

  it("loads each model once: a base model asked for by a tile, by the rest and by a failed variant is one request", async () => {
    const t = tile(1, 9);
    manifestBody = manifest;
    const at = nextBase();
    net.failing.add(`${at}/${variantOf(t)}`);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.setSkins(skinned((p) => (p === 9 ? 1 : 0)));
    s.updateTiles([t]);
    await init;
    await afterFirst();
    s.updateTiles([t, tile(2, 9, C - 1, C), tile(3, 5)]);
    await settle();
    await settle();
    const urls = requested();
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((u) => u === `${at}/models/${keyOf(9)}.glb`)).toHaveLength(1);
    s.dispose();
  });
});
