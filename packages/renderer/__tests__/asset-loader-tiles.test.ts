import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { PlanType, getPlanKey } from "@paved/game-core";
import { AssetLoader, TILE_IMAGE_SIZE, tilePath, type AssetManifest } from "../src/core/AssetLoader";

const KEYS = Object.values(PlanType)
  .filter((p) => p !== PlanType.None)
  .map(getPlanKey);
const manifest = (): AssetManifest => ({
  models: {},
  tiles: { "256": Object.fromEntries(KEYS.map((k) => [k, `tiles/${k}.256.aaaaaaaaaa.png`])) },
});

const images = () => vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());

afterEach(() => vi.restoreAllMocks());

describe("tilePath", () => {
  it("is the manifest's 256 px copy", () => {
    expect(TILE_IMAGE_SIZE).toBe(256);
    expect(tilePath(manifest(), "ccccccccc")).toBe("tiles/ccccccccc.256.aaaaaaaaaa.png");
  });

  it("falls back to the original image with no manifest, or one listing no such copy", () => {
    expect(tilePath(null, "ccccccccc")).toBe("assets/tiles/ccccccccc.png");
    expect(tilePath({ models: {} }, "ccccccccc")).toBe("assets/tiles/ccccccccc.png");
    expect(tilePath({ models: {}, tiles: { "512": { ccccccccc: "tiles/x.png" } } }, "ccccccccc")).toBe("assets/tiles/ccccccccc.png");
    expect(tilePath({ models: {}, tiles: { "256": {} } }, "ccccccccc")).toBe("assets/tiles/ccccccccc.png");
  });
});

describe("AssetLoader's tile images", () => {
  it("loads each plan's image once, from the manifest's copy: one texture per plan for the quad and the plan view", async () => {
    const load = images();
    const loader = new AssetLoader("/base", manifest());
    await loader.preloadTextures();
    await loader.preloadTextures();
    const urls = load.mock.calls.map(([url]) => url as string);
    expect(urls.sort()).toEqual(KEYS.map((k) => `/base/tiles/${k}.256.aaaaaaaaaa.png`).sort());
    for (const key of KEYS) expect(loader.getTexture(`tile-${key}`)).toBe(loader.peekTexture(`tile-${key}`));
    loader.dispose();
  });

  it("asks for the original names when the manifest lists no copies", async () => {
    const load = images();
    const loader = new AssetLoader("/base", { models: {} });
    await loader.preloadTextures();
    expect(load.mock.calls.map(([url]) => url).sort()).toEqual(KEYS.map((k) => `/base/assets/tiles/${k}.png`).sort());
    loader.dispose();
  });

  it("asks again, for the images not in yet, after a failure", async () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockRejectedValueOnce(new Error("404")).mockImplementation(async () => new THREE.Texture());
    const loader = new AssetLoader("/base", manifest());
    await expect(loader.preloadTextures()).rejects.toThrow("404");
    const asked = load.mock.calls.length;
    await loader.preloadTextures();
    for (const key of KEYS) expect(loader.peekTexture(`tile-${key}`)).not.toBeNull();
    // The images that came the first time are not asked for again.
    expect(load.mock.calls.length - asked).toBeLessThan(KEYS.length);
    loader.dispose();
  });
});
