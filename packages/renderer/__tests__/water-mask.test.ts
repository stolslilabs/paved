import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WATER_MASK_GLSL } from "../src/core/TileRenderer";
import { decodePng } from "./helpers/png";

/** The base models (the app's `asset-sources/`) and the Forest variants (the app's compressed copies): every palette the board draws. */
const FOLDERS = ["../../app/asset-sources/models", "../../app/public/renderer-assets/models/forest"].map((p) => fileURLToPath(new URL(p, import.meta.url)));

/** The palette entries that are water, in sRGB: brightened and glossier, and nothing else. */
const WATER = ["0,130,167", "56,113,149", "90,157,194", "73,125,158", "102,142,167"];

/** The PNG images embedded in a GLB, by their bytes. */
function glbImages(file: string): Uint8Array[] {
  const glb = readFileSync(file);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = glb.subarray(20 + jsonLength + 8);
  return (json.images ?? []).map((image: { bufferView: number }) => {
    const view = json.bufferViews[image.bufferView];
    return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  });
}

/** Every distinct colour of every distinct palette, in sRGB. */
function paletteColours(): Set<string> {
  const colours = new Set<string>();
  const seen = new Set<string>();
  for (const folder of FOLDERS) {
    for (const name of readdirSync(folder).filter((f) => f.endsWith(".glb"))) {
      for (const png of glbImages(join(folder, name))) {
        const key = Buffer.from(png).toString("base64");
        if (seen.has(key)) continue;
        seen.add(key);
        const { rgba } = decodePng(png);
        for (let i = 0; i < rgba.length; i += 4) colours.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
      }
    }
  }
  return colours;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const linear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);

/** The shader's mask in TypeScript, its two ramps read from `WATER_MASK_GLSL` itself (the texture is decoded to linear). */
function waterMask(srgb: string): number {
  const ramps = [...WATER_MASK_GLSL.matchAll(/smoothstep\(([\d.]+), ([\d.]+), diffuseColor\.(\w) \/ max\(diffuseColor\.(\w), 1e-4\)\)/g)];
  expect(ramps).toHaveLength(2);
  const [r, g, b] = srgb.split(",").map((c) => linear(Number(c)));
  const channel: Record<string, number> = { r, g, b };
  return ramps.reduce((mask, [, lo, hi, top, bottom]) => mask * smoothstep(Number(lo), Number(hi), channel[top] / Math.max(channel[bottom], 1e-4)), 1);
}

describe("the water mask over the palettes (WATER_MASK_GLSL)", () => {
  const colours = paletteColours();

  it("reads two palettes, the base models' and Forest's", () => {
    expect(colours.size).toBeGreaterThan(150);
    for (const water of WATER) expect(colours.has(water)).toBe(true);
  });

  it("takes every water entry fully", () => {
    for (const water of WATER) expect(waterMask(water), water).toBe(1);
  });

  it("leaves every other entry out, the dark slate-blues and the steel greys included", () => {
    const caught = [...colours].filter((c) => !WATER.includes(c) && waterMask(c) > 0);
    expect(caught).toEqual([]);
    // The two the former ramp (green over red from 1.5) caught: the darkest of `wfffffffr`'s stone shades, and its neighbour.
    expect(waterMask("64,82,115")).toBe(0);
    expect(waterMask("70,87,136")).toBe(0);
  });
});
