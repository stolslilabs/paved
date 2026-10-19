import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { AmbientParticles, WATER_ENTRIES, findEmitters, layoutParticles, particlesFor, wonderEntriesOf, type EmitterTile } from "../src/core/ambient-particles";
import { DEFAULT_AMBIENT_PARTICLES, resolveAmbientSettings } from "../src/core/ambient-settings";
import { voxelize } from "../src/core/voxelizer";
import { FOREST, FOREST_FILES, loadForestVariant } from "./helpers/forest-variants";
import { PLANS, SOURCES, loadMesh, sourceOf } from "./helpers/model-meshes";
import { decodePng } from "./helpers/png";

/** Reading and voxelizing every model: well under a few seconds here, but CI runs every package's tests at once. */
const HEAVY_TEST_MS = 60_000;

/** The water's colours, in sRGB: `water-mask.test.ts`'s `WATER`. */
const WATER = new Set(["0,130,167", "56,113,149", "90,157,194", "73,125,158", "102,142,167"]);

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

const kind = DEFAULT_AMBIENT_PARTICLES.water;

afterEach(() => vi.restoreAllMocks());

describe("the ambient particles' emitters (AMBIENT-PARTICLES, #572)", () => {
  it("WATER_ENTRIES are the palette entries holding the water's colours, in the base palette and the Forest one", () => {
    const files = [...PLANS.map((p) => join(SOURCES, `${p}.glb`)), ...FOREST_FILES.map((f) => join(FOREST, f))];
    const found = new Set<string>();
    for (const file of files) {
      for (const png of glbImages(file)) {
        const { rgba, width } = decodePng(png);
        const entries: number[] = [];
        for (let i = 0; i < width; i++) if (WATER.has(`${rgba[i * 4]},${rgba[i * 4 + 1]},${rgba[i * 4 + 2]}`)) entries.push(i);
        found.add(entries.join(","));
      }
    }
    expect([...found]).toEqual([WATER_ENTRIES.join(",")]);
  });

  it("only the wonder plans emit sparkles, whatever their palette", () => {
    expect(wonderEntriesOf("wffffffff").length).toBeGreaterThan(0);
    expect(wonderEntriesOf("wfffffffr").length).toBeGreaterThan(0);
    expect(wonderEntriesOf("models/forest/wffffffff_HF_1.0123456789.glb")).toContain(140);
    expect(wonderEntriesOf("ccccccccc")).toEqual([]);
    expect(wonderEntriesOf("models/forest/ccccccccc_HF_1.0123456789.glb")).toEqual([]);
    expect(wonderEntriesOf("models/other/wffffffff_X_1.glb")).toEqual([]);
  });

  it(
    "finds the water's top voxels and the wonders' on the base models, once per type",
    async () => {
      const counts: Record<string, [number, number]> = {};
      for (const plan of PLANS) {
        const grid = voxelize(sourceOf(await loadMesh(join(SOURCES, `${plan}.glb`))))!;
        const e = findEmitters(grid, WATER_ENTRIES, wonderEntriesOf(plan));
        counts[plan] = [e.water.length / 3, e.wonder.length / 3];
        // On a voxel's top face: above the slab's top, within the model's height.
        for (let i = 1; i < e.water.length; i += 3) expect(e.water[i]!).toBeGreaterThan(grid.origin[1]);
      }
      // The rivers and ponds, the fountains of the cities; the two wonders.
      expect(counts.rfffrfcfr![0]).toBeGreaterThan(40);
      expect(counts.ccccccccc![0]).toBeGreaterThan(0);
      expect(counts.wffffffff![1]).toBeGreaterThan(50);
      expect(counts.wfffffffr![1]).toBeGreaterThan(50);
      // No sparkle off a wonder plan, no mote on a tile with no water.
      for (const plan of PLANS.filter((p) => !p.startsWith("w"))) expect(counts[plan]![1]).toBe(0);
      expect(counts.cfffcfffc).toEqual([0, 0]);
    },
    HEAVY_TEST_MS,
  );

  it(
    "finds the Forest variants' water and wonders, from their palette",
    async () => {
      let water = 0;
      let wonder = 0;
      for (const file of FOREST_FILES.filter((f) => /^(w|cccccfffc_HF_1)/.test(f))) {
        const { mesh } = await loadForestVariant(file);
        const e = findEmitters(voxelize(sourceOf(mesh))!, WATER_ENTRIES, wonderEntriesOf(`models/forest/${file}`));
        water += e.water.length;
        wonder += e.wonder.length;
      }
      expect(water).toBeGreaterThan(0);
      expect(wonder).toBeGreaterThan(0);
    },
    HEAVY_TEST_MS,
  );
});

describe("the particles' layout: caps per tile and for the board", () => {
  const emitters = (n: number) => ({ water: new Float32Array(n * 3).map((_, i) => i), wonder: new Float32Array(0) });
  const tile = (n: number, seed: number, x = 0): EmitterTile => ({ emitters: emitters(n), matrix: new THREE.Matrix4().makeTranslation(x, 0, 0), seed });

  it("a tile holds density x its emitters, at least one, at most perTile", () => {
    expect(particlesFor(0, kind)).toBe(0);
    expect(particlesFor(1, kind)).toBe(1);
    expect(particlesFor(20, { ...kind, density: 0.2 })).toBe(4);
    expect(particlesFor(1000, kind)).toBe(kind.perTile);
    expect(particlesFor(1000, { ...kind, enabled: false })).toBe(0);
  });

  it("is the same for a tile wherever and whenever it is laid out, and placed by its matrix", () => {
    const a = layoutParticles([tile(30, 7)], "water", kind, 1000);
    const b = layoutParticles([tile(30, 1), tile(30, 7, 3)], "water", kind, 1000);
    expect(a.seed.length).toBe(particlesFor(30, kind));
    expect(Array.from(b.seed.slice(a.seed.length))).toEqual(Array.from(a.seed));
    expect(b.position[a.position.length]).toBeCloseTo(a.position[0]! + 3);
    for (const s of a.seed) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThanOrEqual(1);
  });

  it("keeps an even share of the board past its cap", () => {
    const tiles = Array.from({ length: 50 }, (_, i) => tile(100, i, i * 3));
    const all = layoutParticles(tiles, "water", kind, 10_000);
    expect(all.seed.length).toBe(50 * kind.perTile);
    const capped = layoutParticles(tiles, "water", kind, 100);
    expect(capped.seed.length).toBe(100);
    // Spread over the board: the first and the last tiles keep particles.
    expect(Math.min(...Array.from({ length: 100 }, (_, k) => capped.position[k * 3]!))).toBeLessThan(3);
    expect(Math.max(...Array.from({ length: 100 }, (_, k) => capped.position[k * 3]!))).toBeGreaterThan(140);
  });
});

describe("AmbientParticles: one draw per kind for the board", () => {
  /** A board of `count` tiles of one model, each a clone in its container as `TileRenderer.placedModel` makes it. */
  async function board(plan: string, count: number) {
    const mesh = await loadMesh(join(SOURCES, `${plan}.glb`));
    const type = new THREE.Group();
    type.add(mesh);
    const frame = new THREE.Group();
    const sources = Array.from({ length: count }, (_, i) => {
      const container = new THREE.Group();
      container.position.set(i * 3, 0, 0);
      const tile = type.clone();
      container.add(tile);
      frame.add(container);
      return { key: plan, type, tile };
    });
    return { sources, frame };
  }

  it(
    "lays out every water and wonder tile in one Points a kind, set by uniforms, and frees what it made",
    async () => {
      vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
      const time = { value: 0 };
      const particles = new AmbientParticles(time, DEFAULT_AMBIENT_PARTICLES);
      const water = await board("rfffrfcfr", 3);
      const wonder = await board("wffffffff", 2);
      const changed = vi.fn();
      particles.onChange = changed;
      particles.setTiles([...water.sources, ...wonder.sources], water.frame);
      await particles.whenReady();
      expect(changed).toHaveBeenCalled();
      const stats = particles.stats();
      expect(stats.water).toBe(3 * DEFAULT_AMBIENT_PARTICLES.water.perTile);
      const wonders = particles.emittersOf("wffffffff")!.wonder.length / 3;
      expect(stats.wonder).toBe(2 * particlesFor(wonders, DEFAULT_AMBIENT_PARTICLES.wonder));
      expect(stats.wonder).toBeGreaterThan(0);
      expect(stats.drawCalls).toBe(2);
      const points = particles.object.children as THREE.Points[];
      expect(points).toHaveLength(2);
      for (const p of points) {
        const material = p.material as THREE.ShaderMaterial;
        // Every kind reads the loop's one time uniform: the CPU moves nothing a frame.
        expect(material.uniforms.uTime).toBe(time);
        expect(material.blending).toBe(THREE.AdditiveBlending);
        expect(material.depthWrite).toBe(false);
        expect(p.castShadow).toBe(false);
      }
      expect(particles.step()).toBe(true);

      // The zoom fade at 0: nothing moves, the board can stay idle.
      particles.setZoom(0);
      expect(particles.step()).toBe(false);
      particles.setZoom(1);

      // On screen: the world size at the camera's zoom, held between the floor and the cap in device px.
      particles.setViewport(1624, 50, 5, 2);
      const u = (points[0]!.material as THREE.ShaderMaterial).uniforms;
      expect(u.uScale.value).toBeCloseTo((1624 * 5) / (2 * Math.tan(THREE.MathUtils.degToRad(25))));
      expect(u.uPixels.value.toArray()).toEqual([DEFAULT_AMBIENT_PARTICLES.minPixels * 2, DEFAULT_AMBIENT_PARTICLES.maxPixels * 2]);

      // The night glow scales the light and the size, from the day's 1.
      particles.setNight(1);
      expect((points[0]!.material as THREE.ShaderMaterial).uniforms.uGlow.value).toBeCloseTo(1 + DEFAULT_AMBIENT_PARTICLES.nightGlow);

      // A kind off: its draw goes.
      particles.setSettings(resolveAmbientSettings({ particles: { wonder: { enabled: false } } }).particles);
      expect(particles.stats()).toMatchObject({ wonder: 0, drawCalls: 1 });

      const disposed = points.flatMap((p) => [vi.spyOn(p.geometry, "dispose"), vi.spyOn(p.material as THREE.Material, "dispose")]);
      particles.dispose();
      for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
      expect(particles.object.children).toHaveLength(0);
      particles.dispose();
      vi.unstubAllGlobals();
    },
    HEAVY_TEST_MS,
  );

  it(
    "builds a type's emitters once, however many tiles draw it",
    async () => {
      vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
      const particles = new AmbientParticles({ value: 0 }, DEFAULT_AMBIENT_PARTICLES);
      const { sources, frame } = await board("rfffrfcfr", 4);
      particles.setTiles(sources, frame);
      particles.setTiles(sources, frame);
      await particles.whenReady();
      const first = particles.emittersOf("rfffrfcfr");
      particles.setTiles(sources.slice(1), frame);
      expect(particles.emittersOf("rfffrfcfr")).toBe(first);
      expect(particles.stats().water).toBe(3 * DEFAULT_AMBIENT_PARTICLES.water.perTile);
      particles.dispose();
      vi.unstubAllGlobals();
    },
    HEAVY_TEST_MS,
  );
});
