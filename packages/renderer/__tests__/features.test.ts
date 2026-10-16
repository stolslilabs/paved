import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { CategoryType, Plan, PlanType, SpotType } from "@paved/game-core";
import { FEATURE_CODE, labelTileGeometry, planKeyOfModel, type TileLabels } from "../src/core/features";
import { TileRenderer } from "../src/core/TileRenderer";
import { LOOK_PRESETS } from "../src/core/look";

const MODELS = fileURLToPath(new URL("../../app-web/public/models", import.meta.url));
const KEYS = readdirSync(MODELS)
  .filter((f) => f.endsWith(".glb"))
  .map((f) => f.slice(0, -4));

/**
 * A base tile model (GLB) as the loader gives it, without a loader: its one mesh (position, normal, uv, index) under its
 * node's rotation (Z up in the file, Y up in the scene), in a group.
 */
function readTileModel(key: string): THREE.Group {
  const glb = readFileSync(`${MODELS}/${key}.glb`);
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const bin = 20 + jsonLength + 8;
  const read = (index: number, Type: Float32ArrayConstructor | Uint32ArrayConstructor | Uint16ArrayConstructor, size: number) => {
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const start = glb.byteOffset + bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Type(glb.buffer.slice(start, start + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  const primitive = gltf.meshes[0].primitives[0];
  const indexType = gltf.accessors[primitive.indices].componentType === 5125 ? Uint32Array : Uint16Array;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(read(primitive.attributes.POSITION, Float32Array, 3), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(read(primitive.attributes.NORMAL, Float32Array, 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(read(primitive.attributes.TEXCOORD_0, Float32Array, 2), 2));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices, indexType, 1), 1));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const [x, y, z, w] = gltf.nodes[0].rotation ?? [0, 0, 0, 1];
  mesh.quaternion.set(x, y, z, w);
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

const meshOf = (model: THREE.Group) => model.children[0] as THREE.Mesh;

/** The area codes of a plan's spots of one category, from the layout (`@paved/game-core`). */
function planAreas(key: string, category: CategoryType): Set<number> {
  const plan = new Plan(key.toUpperCase() as PlanType);
  const spots = [SpotType.Center, SpotType.NorthWest, SpotType.North, SpotType.NorthEast, SpotType.East, SpotType.SouthEast, SpotType.South, SpotType.SouthWest, SpotType.West];
  const categories = plan.unpack().map((c) => c.value);
  return new Set(spots.filter((_, i) => categories[i] === category).map((spot) => " ABCDEFGHI".indexOf(plan.area(spot))));
}

/** The area codes the columns of one feature carry. */
const columnAreas = (labels: TileLabels, feature: number) =>
  new Set(Array.from(labels.columns.area).filter((_, k) => labels.columns.feature[k] === feature));

const labelled = new Map<string, TileLabels>();
const timings: number[] = [];
for (const key of KEYS) {
  const mesh = meshOf(readTileModel(key));
  const start = performance.now();
  labelled.set(key, labelTileGeometry(mesh.geometry, key, mesh.matrixWorld));
  timings.push(performance.now() - start);
}

describe("the voxels' features (labelTileGeometry) over the 19 base models", () => {
  it("reads the 19 base models", () => {
    expect(KEYS).toHaveLength(19);
  });

  it("finds each city of a plan, one area per city: two in ffcfffcff, none on a plan without one", () => {
    const counts: Record<string, number> = {};
    for (const key of KEYS) {
      const found = columnAreas(labelled.get(key)!, FEATURE_CODE.city);
      expect(found, key).toEqual(planAreas(key, CategoryType.City));
      counts[key] = found.size;
    }
    expect(counts.ffcfffcff).toBe(2);
    expect(Object.entries(counts).filter(([key, n]) => key.includes("c") && n === 0)).toEqual([]);
    expect(Object.values(counts).filter((n) => n > 0)).toHaveLength(13);
  });

  it("finds each road of a plan, and a wonder only on the wonder plans", () => {
    for (const key of KEYS) {
      const labels = labelled.get(key)!;
      expect(columnAreas(labels, FEATURE_CODE.road), key).toEqual(planAreas(key, CategoryType.Road));
      expect(columnAreas(labels, FEATURE_CODE.wonder), key).toEqual(planAreas(key, CategoryType.Wonder));
    }
  });

  it("gives every forest column one of the plan's forest areas, and leaves no column of a full model unlabelled", () => {
    for (const key of KEYS) {
      const labels = labelled.get(key)!;
      for (const area of columnAreas(labels, FEATURE_CODE.forest)) expect(planAreas(key, CategoryType.Forest).has(area), key).toBe(true);
      expect(Array.from(labels.columns.feature).filter((f) => f === FEATURE_CODE.none), key).toEqual([]);
    }
    // The full city is all city.
    expect(new Set(labelled.get("ccccccccc")!.columns.feature)).toEqual(new Set([FEATURE_CODE.city]));
  });

  it("gives each vertex its column's label: drawn flat from their last vertex, the faces show their columns' labels", () => {
    const shares: number[] = [];
    for (const key of KEYS) {
      const mesh = meshOf(readTileModel(key));
      const { geometry } = mesh;
      const labels = labelled.get(key)!;
      const count = geometry.getAttribute("position").count;
      expect(labels.feature).toHaveLength(count);
      expect(labels.area).toHaveLength(count);
      // The horizontal faces' area, column by column, against the label their triangle is drawn with (its last vertex's,
      // WebGL's provoking vertex for a flat varying): a merged face over columns of two labels shows one of them.
      const p = geometry.getAttribute("position").clone().applyMatrix4(mesh.matrixWorld);
      const index = geometry.getIndex()!.array;
      const { size, feature: columns } = labels.columns;
      let [all, wrong] = [0, 0];
      const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let t = 0; t < index.length; t += 3) {
        a.fromBufferAttribute(p, index[t]);
        b.fromBufferAttribute(p, index[t + 1]);
        c.fromBufferAttribute(p, index[t + 2]);
        if (Math.abs(a.y - b.y) > 1e-4 || Math.abs(a.y - c.y) > 1e-4) continue;
        const drawn = labels.feature[index[t + 2]];
        // The base models' footprint: x and z from -4 to 0 (the file's x, y), 0.1 a column.
        const cells = (v: number) => Math.min(size - 1, Math.max(0, Math.floor((v + 4) * 10)));
        for (let j = cells(Math.min(a.z, b.z, c.z)); j <= cells(Math.max(a.z, b.z, c.z) - 1e-6); j++) {
          for (let i = cells(Math.min(a.x, b.x, c.x)); i <= cells(Math.max(a.x, b.x, c.x) - 1e-6); i++) {
            const [x, z] = [-4 + (i + 0.5) / 10, -4 + (j + 0.5) / 10];
            const side = (p: THREE.Vector3, q: THREE.Vector3) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
            const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
            if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
            all++;
            if (columns[j * size + i] !== drawn) wrong++;
          }
        }
      }
      shares.push(wrong / all);
    }
    console.info(`[features] horizontal faces drawn with another label than their column's: mean ${((shares.reduce((x, y) => x + y, 0) / shares.length) * 100).toFixed(2)} %, worst ${(Math.max(...shares) * 100).toFixed(2)} %`);
    for (const share of shares) expect(share).toBeLessThan(0.05);
  });

  it("labels a model in a few milliseconds", () => {
    // Recorded, not a bound on the CI's machine: the mean and the slowest model.
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.info(`[features] labelTileGeometry: mean ${mean.toFixed(1)} ms, slowest ${Math.max(...timings).toFixed(1)} ms per model`);
    expect(mean).toBeGreaterThan(0);
  });
});

describe("planKeyOfModel", () => {
  it("reads a plan key, or a variant's path, and refuses what names no plan", () => {
    expect(planKeyOfModel("rfrfcccfr")).toBe("rfrfcccfr");
    expect(planKeyOfModel("models/forest/cccccfffc_HF_1.a081baf113.glb")).toBe("cccccfffc");
    expect(planKeyOfModel("models/ccccccccc.778825054e.glb")).toBe("ccccccccc");
    expect(planKeyOfModel("00")).toBeNull();
    expect(planKeyOfModel("none")).toBeNull();
  });
});

describe("the feature highlight in the tile shader", () => {
  /** A TileRenderer over a fake loader that serves the real base models. */
  function renderer() {
    const models = new Map(KEYS.map((key) => [key, readTileModel(key)]));
    const assets = {
      has: (key: string) => models.has(key),
      want: () => {},
      setSkins: () => {},
      getModel: (key: string) => {
        const model = models.get(key)!.clone(true);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) child.material = (child.material as THREE.Material).clone();
        });
        return model;
      },
    };
    return { tiles: new TileRenderer(assets as never), models };
  }
  const tile = (plan: string, id: number) => ({ game_id: 1, id, plan: Object.values(PlanType).indexOf(plan.toUpperCase() as PlanType), orientation: 1, x: id, y: 0, worldX: id, worldZ: 0 });
  const featureOn = { ...LOOK_PRESETS.mockup.featureHighlight, enabled: true };

  it("labels nothing while it is off, then the models drawn and those drawn after once it is on, once each", () => {
    const { tiles, models } = renderer();
    tiles.updateTiles([tile("rfrfcccfr", 1)] as never);
    const geometry = (key: string) => meshOf(models.get(key)!).geometry;
    expect(geometry("rfrfcccfr").getAttribute("feature")).toBeUndefined();
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, featureOn);
    const feature = geometry("rfrfcccfr").getAttribute("feature");
    expect(feature.count).toBe(geometry("rfrfcccfr").getAttribute("position").count);
    expect(geometry("rfrfcccfr").getAttribute("area").count).toBe(feature.count);
    tiles.updateTiles([tile("rfrfcccfr", 1), tile("ffcfffcff", 2)] as never);
    expect(geometry("ffcfffcff").getAttribute("feature")).toBeDefined();
    // Once each: drawing again, or turning it off and on, keeps the same attribute.
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, LOOK_PRESETS.mockup.featureHighlight);
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, featureOn);
    expect(geometry("rfrfcccfr").getAttribute("feature")).toBe(feature);
    tiles.dispose();
  });

  it("lights the chosen feature through shared uniforms, flat per triangle, with no recompile", () => {
    const { tiles } = renderer();
    tiles.updateTiles([tile("rfrfcccfr", 1)] as never);
    const material = ((tiles as any).tileTypes.get("rfrfcccfr") as THREE.Group).children[0] as THREE.Mesh;
    const standard = material.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as never;
    standard.onBeforeCompile(shader, {} as never);
    const { uniforms, vertexShader, fragmentShader } = shader as {
      uniforms: Record<string, { value: number | THREE.Color }>;
      vertexShader: string;
      fragmentShader: string;
    };
    expect(standard.customProgramCacheKey()).toBe("paved-tile");
    expect(vertexShader).toContain("attribute float feature;");
    expect(vertexShader).toContain("flat varying float vFeature;");
    expect(fragmentShader).toContain("flat varying float vFeature;");
    expect(fragmentShader).toContain("float featureLit");
    expect(fragmentShader).toContain("totalEmissiveRadiance += uFeatureColor * uFeatureGlow * featureLit;");
    // The water's patch is kept.
    expect(fragmentShader).toContain("waterMask");
    expect(uniforms.uFeatureOn.value).toBe(0);
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, { ...featureOn, feature: "road", dim: 0.3 });
    expect([uniforms.uFeatureOn.value, uniforms.uFeature.value, uniforms.uFeatureDim.value]).toEqual([1, FEATURE_CODE.road, 0.3]);
    expect((uniforms.uFeatureColor.value as THREE.Color).equals(new THREE.Color(featureOn.color))).toBe(true);
    tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, LOOK_PRESETS.mockup.featureHighlight);
    expect(uniforms.uFeatureOn.value).toBe(0);
    tiles.dispose();
  });
});
