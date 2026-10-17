import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Plan, getPlanKey } from "@paved/game-core";

// The loader's network: `loadAsync` resolves a URL to a one-box model, or rejects for the URLs in `failing`.
const net = vi.hoisted(() => ({ loadAsync: vi.fn(), setMeshoptDecoder: vi.fn(), failing: new Set<string>() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync = net.loadAsync;
    setMeshoptDecoder = net.setMeshoptDecoder;
    setDRACOLoader = vi.fn();
  },
}));

import { AssetLoader, MANIFEST_RETRY_MS, loadManifest, modelPath } from "../src/core/AssetLoader";
import { afterFirstFrame, firstModels } from "../src/core/load-order";
import { GameScene } from "../src/core/GameScene";
import type { RenderSurfaceAdapter, TileRenderData } from "../src/core/types";

const box = () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return { scene };
};
const requested = () => net.loadAsync.mock.calls.map(([url]) => url as string);

/** The frame the scene's first draw happens in, then the idle time after it: run by hand. */
let frames: Array<() => void> = [];
const nextFrame = () => {
  const due = frames;
  frames = [];
  due.forEach((run) => run());
};
const settle = () => new Promise((done) => setTimeout(done, 0));

let manifestBody: unknown = null;
let base = 0;
/** A fresh base path per test: the manifest is fetched once per base path for the page's life. */
const nextBase = () => `http://assets.test/b${++base}`;

// The retries' waits, shortened for the tests (the loader's own are 250 and 1000 ms).
MANIFEST_RETRY_MS.splice(0, MANIFEST_RETRY_MS.length, 1, 1);

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

describe("the manifest: a plan key to its content-hashed model", () => {
  it("resolves a listed key to its hashed file, and a missing key to the plain name", async () => {
    manifestBody = { models: { ccccccccc: "models/ccccccccc.2bb7ca783c.glb" } };
    const at = nextBase();
    const manifest = await loadManifest(at);
    expect(modelPath(manifest, "ccccccccc")).toBe("models/ccccccccc.2bb7ca783c.glb");
    expect(modelPath(manifest, "rfffrfffr")).toBe("models/rfffrfffr.glb");

    const assets = new AssetLoader(at);
    await assets.preloadModels();
    expect(requested()).toContain(`${at}/models/ccccccccc.2bb7ca783c.glb`);
    expect(requested()).toContain(`${at}/models/rfffrfffr.glb`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`${at}/manifest.json`, { cache: "no-cache" });
  });

  it("falls back to the plain names when no manifest is served, or it is not one", async () => {
    for (const body of [null, { models: { ccccccccc: 7 } }, ["models/ccccccccc.glb"]]) {
      manifestBody = body;
      const at = nextBase();
      expect(await loadManifest(at)).toBeNull();
      net.loadAsync.mockClear();
      await new AssetLoader(at).preloadModels();
      expect(requested()).toHaveLength(19);
      expect(requested().every((url) => /\/models\/[a-z]{9}\.glb$/.test(url))).toBe(true);
    }
  });

  it("tries the manifest again after a network or server error, and uses it once it comes", async () => {
    manifestBody = { models: { ccccccccc: "models/ccccccccc.2bb7ca783c.glb" } };
    const answers: Array<() => Promise<Response>> = [
      async () => {
        throw new TypeError("network down");
      },
      async () => new Response("busy", { status: 503 }),
    ];
    vi.mocked(fetch).mockImplementation(async () => (answers.shift() ?? (async () => new Response(JSON.stringify(manifestBody))))());
    const at = nextBase();
    const assets = new AssetLoader(at);
    await assets.preloadModels();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requested()).toContain(`${at}/models/ccccccccc.2bb7ca783c.glb`);
  });

  it("rejects when the manifest still cannot be reached after its retries (the app shows its plan view), and asks again later", async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      throw new TypeError("network down");
    });
    const at = nextBase();
    const assets = new AssetLoader(at);
    assets.want(["ccccccccc"]);
    await expect(assets.preloadAll()).rejects.toThrow("network down");
    expect(fetch).toHaveBeenCalledTimes(1 + MANIFEST_RETRY_MS.length);
    expect(net.loadAsync).not.toHaveBeenCalled();
    // Not kept: the next loader of that base path asks again.
    manifestBody = { models: {} };
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(manifestBody)));
    expect(await loadManifest(at)).toEqual({ models: {} });
  });

  it("has no manifest to ask for on a base path that is not a URL of this page", async () => {
    expect(await loadManifest("/relative-in-node")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails cleanly when a listed file does not load: the loader rejects, naming it", async () => {
    manifestBody = { models: { ccccccccc: "models/ccccccccc.0000000000.glb" } };
    const at = nextBase();
    net.failing.add(`${at}/models/ccccccccc.0000000000.glb`);
    await expect(new AssetLoader(at).preloadModels()).rejects.toThrow("ccccccccc.0000000000.glb");
  });

  it("sets the meshopt decoder on its loader", () => {
    new AssetLoader(nextBase());
    expect(net.setMeshoptDecoder).toHaveBeenCalledTimes(1);
  });
});

describe("the load order: what the first frame shows, then the rest", () => {
  it("waits only for the models asked for before it chose, and loads the rest after the first frame", async () => {
    const at = nextBase();
    const assets = new AssetLoader(at);
    // As TileRenderer asks while drawing tiles whose models are not in yet.
    expect(() => assets.getModel("rfffrfffr")).toThrow("Model not found");
    assets.want(["ccccccccc"]);
    await assets.preloadAll();
    expect(requested().sort()).toEqual([`${at}/models/ccccccccc.glb`, `${at}/models/rfffrfffr.glb`]);
    expect(() => assets.getModel("rfffrfffr")).not.toThrow();
    // The 19 tile images come with the first frame: they are the placeholder of a tile whose model is on its way.
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(19);

    nextFrame(); // the first frame
    nextFrame(); // the idle time after it
    await settle();
    expect(requested()).toHaveLength(19);
    expect(new Set(requested()).size).toBe(19);
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(19);
    expect(() => assets.getModel("wfffffffr")).not.toThrow();
  });

  it("waits for every model when it was asked for none", async () => {
    const assets = new AssetLoader(nextBase());
    await assets.preloadAll();
    expect(requested()).toHaveLength(19);
    nextFrame();
    nextFrame();
    await settle();
    expect(requested()).toHaveLength(19);
  });

  it("waits for the plan view's images too when it asked for them first", async () => {
    const assets = new AssetLoader(nextBase());
    expect(() => assets.getTexture("tile-ccccccccc")).toThrow("Texture not found");
    await assets.preloadAll();
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(19);
    expect(() => assets.getTexture("tile-ccccccccc")).not.toThrow();
  });

  it("loads a model asked for after it chose at once, and keeps one load per model", async () => {
    const assets = new AssetLoader(nextBase());
    assets.want(["ccccccccc"]);
    await assets.preloadAll();
    expect(() => assets.getModel("sfrfrfrfr")).toThrow();
    await settle();
    expect(requested()).toHaveLength(2);
    nextFrame();
    nextFrame();
    await settle();
    expect(requested()).toHaveLength(19);
  });

  it("rejects when a model of the first frame fails (the scene does not start: the app shows its plan view)", async () => {
    const at = nextBase();
    net.failing.add(`${at}/models/ccccccccc.glb`);
    const assets = new AssetLoader(at);
    assets.want(["ccccccccc"]);
    await expect(assets.preloadAll()).rejects.toThrow("404");
  });

  it("only warns when a model loaded after the first frame fails, and that plan stays undrawn", async () => {
    const at = nextBase();
    net.failing.add(`${at}/models/wfffffffr.glb`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const assets = new AssetLoader(at);
    assets.want(["ccccccccc"]);
    await assets.preloadAll();
    nextFrame();
    nextFrame();
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => assets.getModel("wfffffffr")).toThrow();
    expect(() => assets.getModel("rfffrfffr")).not.toThrow();
  });

  it("loads nothing after the first frame once disposed", async () => {
    const assets = new AssetLoader(nextBase());
    assets.want(["ccccccccc"]);
    await assets.preloadAll();
    assets.dispose();
    nextFrame();
    nextFrame();
    await settle();
    expect(requested()).toHaveLength(1);
  });

  it("loads a model once for every loader of the page, and disposes it when the last one lets it go (LOAD-FAST)", async () => {
    const at = nextBase();
    // The board's scene and the hand tile's scene, each with its own loader, at once.
    const board = new AssetLoader(at);
    const hand = new AssetLoader(at);
    await Promise.all([board.preloadModels(), hand.preloadModels()]);
    expect(requested()).toHaveLength(19);
    const geometry = (board.getModel("ccccccccc").children[0] as THREE.Mesh).geometry;
    expect((hand.getModel("ccccccccc").children[0] as THREE.Mesh).geometry).toBe(geometry);
    const disposed = vi.spyOn(geometry, "dispose");
    hand.dispose();
    await settle();
    expect(disposed).not.toHaveBeenCalled();
    expect(() => board.getModel("ccccccccc")).not.toThrow();
    board.dispose();
    await settle();
    expect(disposed).toHaveBeenCalledTimes(1);
    // Let go by every loader: the next one loads it again.
    await new AssetLoader(at).preloadModels();
    expect(requested()).toHaveLength(38);
  });

  it("lets a model go when its loader is disposed while it loads, and forgets a failed one", async () => {
    const at = nextBase();
    const early = new AssetLoader(at);
    const load = early.preloadModels();
    early.dispose();
    await load;
    const failing = `${at}/models/ccccccccc.glb`;
    net.failing.add(failing);
    const failed = new AssetLoader(at);
    await expect(failed.preloadModels()).rejects.toThrow("404");
    await settle();
    failed.dispose();
    net.failing.clear();
    net.loadAsync.mockClear();
    await new AssetLoader(at).preloadModels();
    // Neither the disposed loader's models nor the failure stay shared: all 19 load again.
    expect(requested()).toHaveLength(19);
  });

  it("firstModels keeps the full order, and is everything when nothing is wanted", () => {
    expect(firstModels(["a", "b", "c"], new Set(["c", "a", "x"]))).toEqual(["a", "c"]);
    expect(firstModels(["a", "b"], new Set())).toEqual(["a", "b"]);
  });

  it("afterFirstFrame waits for a frame, then an idle callback", () => {
    const run = vi.fn();
    afterFirstFrame(run);
    expect(run).not.toHaveBeenCalled();
    nextFrame();
    expect(run).not.toHaveBeenCalled();
    nextFrame();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("GameScene with the load order, as GameCanvas drives it", () => {
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
  const tile = (id: number, plan: number): TileRenderData => ({ game_id: 1, id, player_id: "0x1", plan, orientation: 1, x: id, y: 0, worldX: id, worldZ: 0 });
  const keyOf = (plan: number) => getPlanKey(Plan.from(plan).value);

  it("starts once the handed tiles' models are in, draws those tiles, and loads the rest after", async () => {
    const at = nextBase();
    const s = scene();
    const tiles = [tile(1, 9), tile(2, 9), tile(3, 5)];
    // GameCanvas: init in one effect, the tiles in the next effect of the same commit.
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles(tiles);
    await init;
    expect(requested().sort()).toEqual([...new Set([keyOf(9), keyOf(5)])].map((k) => `${at}/models/${k}.glb`).sort());
    expect(s.tiles.getGroup().children[0]!.children).toHaveLength(3);
    nextFrame();
    nextFrame();
    await settle();
    expect(requested()).toHaveLength(19);
    s.dispose();
  });

  it("draws a tile placed after the first frame once its model comes in, with a new frame and shadows", async () => {
    const at = nextBase();
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    await init;
    // The model of the new tile's plan answers only when the test says so.
    let arrive!: () => void;
    const late = `${at}/models/${keyOf(5)}.glb`;
    net.loadAsync.mockImplementation(async (url: string) => {
      if (url === late) await new Promise<void>((done) => (arrive = done));
      return box();
    });
    s.updateTiles([tile(1, 9), tile(2, 5)]);
    const placed = () => s.tiles.getGroup().children[0]!.children;
    // The new tile draws its placeholder quad meanwhile (Q-POLISH-R), then its model in its place.
    expect(placed()).toHaveLength(2);
    expect(placed()[1]!.userData.placeholder).toBe(true);
    await settle();
    expect(requested()).toContain(late);
    (s as any).needsRender = false;
    (s as any).shadowsDirty = false;
    arrive();
    await settle();
    expect(placed()).toHaveLength(2);
    expect(placed().some((m) => m.userData.placeholder)).toBe(false);
    expect((s as any).needsRender).toBe(true);
    expect((s as any).shadowsDirty).toBe(true);
    // The rest, after the first frame, adds no tile: no frame asked for.
    (s as any).needsRender = false;
    nextFrame();
    nextFrame();
    await settle();
    expect(placed()).toHaveLength(2);
    expect((s as any).needsRender).toBe(false);
    s.dispose();
  });

  it("draws the plan view's tiles at once: its images came with the first frame", async () => {
    const at = nextBase();
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    await init;
    s.setStrategyMode(true);
    expect(s.tiles.getGroup().children[0]!.children).toHaveLength(1);
    s.dispose();
  });

  it("draws the plan view's tiles once its images come in, when they came late", async () => {
    const at = nextBase();
    let arrive!: () => void;
    const images = new Promise<void>((done) => (arrive = done));
    vi.mocked(THREE.TextureLoader.prototype.loadAsync).mockImplementation(async () => {
      await images;
      return new THREE.Texture();
    });
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    s.setStrategyMode(true);
    s.updateTiles([tile(1, 9)]);
    expect(s.tiles.getGroup().children[0]!.children).toHaveLength(0);
    arrive();
    await init;
    await settle();
    expect(s.tiles.getGroup().children[0]!.children).toHaveLength(1);
    s.dispose();
  });

  it("does not start when a handed tile's model fails", async () => {
    const at = nextBase();
    net.failing.add(`${at}/models/${keyOf(9)}.glb`);
    const s = scene();
    const init = s.init({ surface: surface(), basePath: at });
    s.updateTiles([tile(1, 9)]);
    await expect(init).rejects.toThrow("404");
    s.dispose();
  });
});
