import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { PlanType, getPlanKey } from "@paved/game-core";
import { AssetLoader, PLAN_TILE_SIZE, QUAD_TILE_SIZE, tilePath, type AssetManifest } from "../src/core/AssetLoader";

const KEYS = Object.values(PlanType)
  .filter((p) => p !== PlanType.None)
  .map(getPlanKey);
const manifest = (): AssetManifest => ({
  models: {},
  tiles: {
    "256": Object.fromEntries(KEYS.map((k) => [k, `tiles/${k}.256.aaaaaaaaaa.png`])),
    "512": Object.fromEntries(KEYS.map((k) => [k, `tiles/${k}.512.bbbbbbbbbb.png`])),
  },
});

const images = () => vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());

afterEach(() => vi.restoreAllMocks());

describe("tilePath", () => {
  it("picks the 256 px copy for the quad and the 512 px copy for the plan view", () => {
    expect([QUAD_TILE_SIZE, PLAN_TILE_SIZE]).toEqual([256, 512]);
    expect(tilePath(manifest(), "ccccccccc", "quad")).toBe("tiles/ccccccccc.256.aaaaaaaaaa.png");
    expect(tilePath(manifest(), "ccccccccc", "plan")).toBe("tiles/ccccccccc.512.bbbbbbbbbb.png");
  });

  it("falls back to the original image with no manifest, or one listing no tiles", () => {
    for (const use of ["quad", "plan"] as const) {
      expect(tilePath(null, "ccccccccc", use)).toBe("assets/tiles/ccccccccc.png");
      expect(tilePath({ models: {} }, "ccccccccc", use)).toBe("assets/tiles/ccccccccc.png");
    }
    // A manifest missing one size or one plan falls back for that only.
    expect(tilePath({ models: {}, tiles: { "256": {} } }, "ccccccccc", "quad")).toBe("assets/tiles/ccccccccc.png");
    expect(tilePath({ models: {}, tiles: { "256": { ccccccccc: "tiles/x.png" } } }, "ccccccccc", "plan")).toBe("assets/tiles/ccccccccc.png");
  });
});

describe("AssetLoader's tile images", () => {
  it("loads each plan's quad image at 256 px and plan-view image at 512 px, one texture per plan and size", async () => {
    const load = images();
    const loader = new AssetLoader("/base", manifest());
    await Promise.all([loader.preloadTextures("quad"), loader.preloadTextures("plan")]);
    const urls = load.mock.calls.map(([url]) => url as string);
    expect(urls).toHaveLength(KEYS.length * 2);
    expect(new Set(urls).size).toBe(urls.length);
    for (const key of KEYS) {
      expect(urls).toContain(`/base/tiles/${key}.256.aaaaaaaaaa.png`);
      expect(urls).toContain(`/base/tiles/${key}.512.bbbbbbbbbb.png`);
      expect(loader.peekTexture(`quad-${key}`)).not.toBeNull();
      expect(loader.getTexture(`tile-${key}`)).not.toBe(loader.peekTexture(`quad-${key}`));
    }
    // Asked again: nothing more is loaded.
    await Promise.all([loader.preloadTextures("quad"), loader.preloadTextures("plan")]);
    expect(load).toHaveBeenCalledTimes(KEYS.length * 2);
    loader.dispose();
  });

  it("asks for the original names with no manifest, one request and one texture per plan for both uses", async () => {
    const load = images();
    const loader = new AssetLoader("/base", { models: {} });
    await Promise.all([loader.preloadTextures("quad"), loader.preloadTextures("plan")]);
    expect(load).toHaveBeenCalledTimes(KEYS.length);
    for (const key of KEYS) {
      expect(load).toHaveBeenCalledWith(`/base/assets/tiles/${key}.png`);
      expect(loader.getTexture(`tile-${key}`)).toBe(loader.peekTexture(`quad-${key}`));
    }
    loader.dispose();
  });

  it("asks again for an image that failed", async () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockRejectedValueOnce(new Error("404")).mockImplementation(async () => new THREE.Texture());
    const loader = new AssetLoader("/base", manifest());
    await expect(loader.preloadTextures("quad")).rejects.toThrow("404");
    await loader.preloadTextures("quad");
    for (const key of KEYS) expect(loader.peekTexture(`quad-${key}`)).not.toBeNull();
    expect(load.mock.calls.length).toBeLessThanOrEqual(KEYS.length * 2);
    loader.dispose();
  });
});
