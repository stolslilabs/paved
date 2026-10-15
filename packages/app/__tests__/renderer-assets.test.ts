import { describe, expect, it } from "vitest";
import { PlanType, getPlanKey } from "@paved/game-core";
import { isRendererAsset, rendererAssetFiles } from "../vite/renderer-assets";

const KEYS = Object.values(PlanType)
  .filter((p) => p !== PlanType.None)
  .map(getPlanKey);

describe("the renderer's assets the app serves (vite/renderer-assets.ts)", () => {
  const files = rendererAssetFiles();

  it("serves exactly what the renderer's AssetLoader requests: a model and a tile image per plan, the Draco decoder", () => {
    expect(KEYS).toHaveLength(19);
    for (const key of KEYS) {
      expect(files).toContain(`models/${key}.glb`);
      expect(files).toContain(`assets/tiles/${key}.png`);
    }
    expect(files.filter((f) => f.startsWith("draco/"))).toEqual(["draco/draco_decoder.js", "draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js"]);
    expect(files).toHaveLength(KEYS.length * 2 + 3);
  });

  it("leaves out what the renderer never requests", () => {
    for (const path of ["models/extended/rfrfffcfr_HF_2.glb", "assets/tiles/00.png", "THIRD_PARTY_NOTICES.txt", "draco/README.md", "models/../secret.glb"]) {
      expect(isRendererAsset(path)).toBe(false);
    }
  });
});
