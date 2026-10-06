import { existsSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PlanType, getCharacterPath, getPlanKey, getTilePath } from "@paved/game-core";

// Every static path the packages build from a key must exist under public/, which is what the app
// serves and what `vite build` copies to dist (the bench build copies it too, same base config).
const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));
const publicFile = (urlPath: string) => `${PUBLIC}${urlPath}`;

const planTypes = Object.values(PlanType).filter((v) => v !== PlanType.None);

describe("public assets", () => {
  it("are real files of this package, not a link into the deprecated app/", () => {
    for (const dir of ["assets", "models"]) {
      expect(lstatSync(publicFile(`/${dir}`)).isSymbolicLink()).toBe(false);
    }
  });

  it("hold the model and the texture of every tile (renderer AssetLoader)", () => {
    expect(planTypes.length).toBeGreaterThan(0);
    const missing = planTypes.flatMap((plan) => [`/models/${getPlanKey(plan)}.glb`, `/assets/tiles/${getPlanKey(plan)}.png`]).filter((p) => !existsSync(publicFile(p)));
    expect(missing).toEqual([]);
  });

  it("hold the tile preview image of every plan, the empty one included (ui TilePreview)", () => {
    const missing = [PlanType.None, ...planTypes].map((plan) => getTilePath(plan)).filter((p) => !existsSync(publicFile(p)));
    expect(missing).toEqual([]);
  });

  it("hold the portrait of every character (ui ActionBar)", () => {
    const missing = [1, 2, 3, 4, 5, 6, 7].map((i) => getCharacterPath(i)).filter((p) => !existsSync(publicFile(p)));
    expect(missing).toEqual([]);
  });
});
