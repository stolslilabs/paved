import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  setDRACOLoader: vi.fn(),
  dracoCtor: vi.fn(),
  setDecoderPath: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync = mocks.loadAsync;
    setDRACOLoader = mocks.setDRACOLoader;
  },
}));
vi.mock("three/examples/jsm/loaders/DRACOLoader.js", () => ({
  DRACOLoader: class {
    constructor() {
      mocks.dracoCtor();
    }
    setDecoderPath(path: string) {
      mocks.setDecoderPath(path);
      return this;
    }
    dispose = mocks.dispose;
  },
}));

import { AssetLoader } from "../src/core/AssetLoader";

const model = () => ({ scene: new THREE.Group() });

describe("AssetLoader Draco decoder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never creates a DRACOLoader for plain models", async () => {
    mocks.loadAsync.mockResolvedValue(model());
    const assets = new AssetLoader("/base");
    await assets.preloadModels();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(19);
    expect(mocks.dracoCtor).not.toHaveBeenCalled();
    expect(mocks.setDRACOLoader).not.toHaveBeenCalled();
  });

  it("decodes a Draco model with the decoder at <basePath>/draco/, created once, and disposes it", async () => {
    mocks.loadAsync.mockImplementation(async () => {
      if (!mocks.setDRACOLoader.mock.calls.length) throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");
      return model();
    });
    const assets = new AssetLoader("/base");
    await assets.preloadModels();
    expect(mocks.dracoCtor).toHaveBeenCalledTimes(1);
    expect(mocks.setDecoderPath).toHaveBeenCalledWith("/base/draco/");
    expect(mocks.setDRACOLoader).toHaveBeenCalledTimes(1);
    assets.dispose();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not hide another load error", async () => {
    mocks.loadAsync.mockRejectedValue(new Error("404"));
    await expect(new AssetLoader().preloadModels()).rejects.toThrow("404");
    expect(mocks.dracoCtor).not.toHaveBeenCalled();
  });
});
