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
    // The page's loaders share their models (`AssetLoader`): let them go, so the next test loads its own.
    assets.dispose();
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

  it("never leaves a loader hanging on a shared Draco load whose owner was disposed mid-decode (LOAD-FAST)", async () => {
    let ownerDisposed = false;
    mocks.loadAsync.mockImplementation(async () => {
      if (!mocks.setDRACOLoader.mock.calls.length) throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");
      // The owner's decode never ends: its Draco workers are terminated with it.
      if (!ownerDisposed) return new Promise(() => {});
      return model();
    });
    const owner = new AssetLoader("/shared-draco");
    void owner.preloadModels();
    await vi.waitFor(() => expect(mocks.setDRACOLoader).toHaveBeenCalled());
    // A second scene's loader joins the owner's pending loads.
    const joiner = new AssetLoader("/shared-draco");
    const joined = joiner.preloadModels();
    await new Promise((done) => setTimeout(done, 0));
    ownerDisposed = true;
    owner.dispose();
    // The joiner stops waiting on the abandoned loads and loads its own: it settles, and has every model.
    await expect(joined).resolves.toBeUndefined();
    expect(() => joiner.getModel("ccccccccc")).not.toThrow();
    joiner.dispose();
  });

  it("does not hide another load error", async () => {
    mocks.loadAsync.mockRejectedValue(new Error("404"));
    await expect(new AssetLoader().preloadModels()).rejects.toThrow("404");
    expect(mocks.dracoCtor).not.toHaveBeenCalled();
  });
});
