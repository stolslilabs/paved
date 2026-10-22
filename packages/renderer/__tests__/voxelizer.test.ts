import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GROUND_VOXELS } from "../src/core/feature-codes";
import { VoxelCache, cellIndex, paletteU, voxelize, type VoxelGrid } from "../src/core/voxelizer";

const APP = fileURLToPath(new URL("../../app", import.meta.url));
const SHIPPED = `${APP}/public/renderer-assets/models`;
const SOURCES = `${APP}/asset-sources/models`;
/** Reading and voxelizing every model: well under a second here, but CI runs every package's tests at once. */
const HEAVY_TEST_MS = 60_000;

/** A GLB without its images (node has no image decoder): the geometry and its UVs are all the voxelizer reads. */
function withoutImages(glb: Buffer): ArrayBuffer {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) delete material.pbrMetallicRoughness?.baseColorTexture;
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const head = Buffer.from(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = Buffer.alloc(20 + head.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(head.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  head.copy(out, 20);
  rest.copy(out, 20 + head.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

let loader: GLTFLoader;
beforeAll(async () => {
  await MeshoptDecoder.ready;
  loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
});

/** A model file as the renderer's loader gives it (meshopt decoded, images left out): its one mesh, world matrices set. */
async function loadMesh(file: string): Promise<THREE.Mesh> {
  const gltf = await loader.parseAsync(withoutImages(readFileSync(file)), "");
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) mesh = child;
  });
  return mesh!;
}

const sourceOf = (mesh: THREE.Mesh) => ({ geometry: mesh.geometry, toModel: mesh.matrixWorld });

/** The shipped file of a plan (`<plan>.<hash>.glb`). */
const shipped = (plan: string) => `${SHIPPED}/${readdirSync(SHIPPED).find((f) => f.startsWith(`${plan}.`) && f.endsWith(".glb"))!}`;
const PLANS = readdirSync(SOURCES)
  .filter((f) => f.endsWith(".glb"))
  .map((f) => f.slice(0, -4));
const FORESTS = readdirSync(`${SHIPPED}/forest`).filter((f) => f.endsWith(".glb"));

afterEach(() => vi.restoreAllMocks());

/**
 * #512's counts of the base models (its table, the unquantized sources before ASSET-SNAP): solid, visible once landed, slab, above the
 * slab, layers. `sfrfrfffr` is the model ASSET-SNAP (#516) changed: the table's figures are of the model before its fix, and the
 * fixed model counts 7,919 / 4,667 / 6,157; the other rows are the table's, to the voxel.
 */
const TABLE: Record<string, readonly [number, number, number, number, number]> = {
  ccccccccc: [8465, 4962, 6400, 2065, 15],
  cccccfrfc: [8736, 5164, 6340, 2396, 16],
  rfffrfffr: [7758, 4463, 6240, 1518, 14],
  rfrfffffr: [7870, 4688, 6179, 1691, 13],
  wffffffff: [9274, 4857, 6398, 2876, 30],
  wfffffffr: [9985, 5947, 6372, 3613, 35],
};

describe("the base models", () => {
  it.each(Object.entries(TABLE))("%s has #512's counts", async (plan, [solid, visible, slab, above, layers]) => {
    const grid = voxelize(sourceOf(await loadMesh(shipped(plan))), { name: plan })!;
    expect(grid).not.toBeNull();
    expect([grid.count, grid.visibleCount, grid.slabCount, grid.count - grid.slabCount]).toEqual([solid, visible, slab, above]);
    // `rfffrfffr` spans 15 layers here, the table says 14: its layer 13 is empty and layer 14 holds one voxel, and the table counts
    // the layers that hold something.
    expect(grid.layers).toBe(plan === "rfffrfffr" ? 15 : layers);
    expect(grid.groundTop).toBe(GROUND_VOXELS - 1);
    expect([grid.sizeX, grid.sizeY]).toEqual([40, 40]);
    expect(grid.step).toBeCloseTo(0.1, 6);
  });

  it(
    "every one of the 19 stays in #512's ranges, and the fixed sfrfrfffr gives a grid",
    async () => {
      expect(PLANS).toHaveLength(19);
      for (const plan of PLANS) {
        const grid = voxelize(sourceOf(await loadMesh(shipped(plan))), { name: plan })!;
        expect(grid, plan).not.toBeNull();
        expect(grid.count, plan).toBeGreaterThanOrEqual(7758);
        expect(grid.count, plan).toBeLessThanOrEqual(9985);
        expect(grid.slabCount, plan).toBeGreaterThanOrEqual(6084);
        expect(grid.slabCount, plan).toBeLessThanOrEqual(6400);
        expect(grid.visibleCount, plan).toBeGreaterThanOrEqual(4463);
        expect(grid.visibleCount, plan).toBeLessThanOrEqual(5947);
        expect(grid.layers, plan).toBeGreaterThanOrEqual(13);
        expect(grid.layers, plan).toBeLessThanOrEqual(35);
      }
    },
    HEAVY_TEST_MS,
  );

  it(
    "gives a grid for each of the 72 Forest variants (through the skin), none of them logged",
    async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(FORESTS).toHaveLength(72);
      for (const file of FORESTS) {
        const grid = voxelize(sourceOf(await loadMesh(`${SHIPPED}/forest/${file}`)), { name: file });
        expect(grid, file).not.toBeNull();
        expect(grid!.groundTop, file).toBe(GROUND_VOXELS - 1);
      }
      expect(warn).not.toHaveBeenCalled();
    },
    HEAVY_TEST_MS,
  );

  it(
    "quantized and unquantized geometry give the same grid",
    async () => {
      for (const plan of ["ccccccccc", "rfrfffffr", "wfffffffr"]) {
        const [quantized, plain] = [await loadMesh(shipped(plan)), await loadMesh(`${SOURCES}/${plan}.glb`)];
        // The shipped copy's positions are 8-bit integers (normalized) under a node scale; the source's are floats.
        expect(quantized.geometry.getAttribute("position").array).toBeInstanceOf(Int8Array);
        expect(plain.geometry.getAttribute("position").array).toBeInstanceOf(Float32Array);
        const [a, b] = [voxelize(sourceOf(quantized), { name: plan })!, voxelize(sourceOf(plain), { name: plan })!];
        expect(a.step).toBeCloseTo(b.step, 6);
        expect([a.sizeX, a.sizeY, a.layers, a.count, a.visibleCount, a.groundTop]).toEqual([b.sizeX, b.sizeY, b.layers, b.count, b.visibleCount, b.groundTop]);
        expect(a.cells).toEqual(b.cells);
        expect(a.entry).toEqual(b.entry);
        expect(a.visible).toEqual(b.visible);
      }
    },
    // Six models read and voxelized, as its neighbours: past the default 5 s on a loaded machine.
    HEAVY_TEST_MS,
  );
});

/** A voxel set as the models draw it: the faces between a solid cell and an air one, as quads of two triangles, and no other. */
interface Cell {
  x: number;
  y: number;
  layer: number;
}

/**
 * The closed mesh of a voxel set on the 40 x 40 footprint (Y up, a step of 0.1), its faces coloured by `paint(cell, face)`, where
 * face is 0 bottom, 1 top, 2 to 5 the sides. The `holes` are faces left out, to break the solid.
 */
function meshOf(solid: (c: Cell) => boolean, paint: (c: Cell, face: number) => number, size = 40, layers = 10, holes: number[] = []): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const quad = (corners: number[][], entry: number) => {
    const first = positions.length / 3;
    for (const [x, y, z] of corners) {
      positions.push(x! * 0.1, y! * 0.1, z! * 0.1);
      uvs.push(paletteU(entry), 0.5);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  const has = (x: number, y: number, layer: number) => x >= 0 && y >= 0 && layer >= 0 && x < size && y < size && layer < layers && solid({ x, y, layer });
  let face = 0;
  for (let layer = 0; layer < layers; layer++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!has(x, y, layer)) continue;
        const c = { x, y, layer };
        const faces: Array<[boolean, number, number[][]]> = [
          [!has(x, y, layer - 1), 0, [[x, layer, y], [x + 1, layer, y], [x + 1, layer, y + 1], [x, layer, y + 1]]],
          [!has(x, y, layer + 1), 1, [[x, layer + 1, y], [x, layer + 1, y + 1], [x + 1, layer + 1, y + 1], [x + 1, layer + 1, y]]],
          [!has(x - 1, y, layer), 2, [[x, layer, y], [x, layer, y + 1], [x, layer + 1, y + 1], [x, layer + 1, y]]],
          [!has(x + 1, y, layer), 3, [[x + 1, layer, y], [x + 1, layer + 1, y], [x + 1, layer + 1, y + 1], [x + 1, layer, y + 1]]],
          [!has(x, y - 1, layer), 4, [[x, layer, y], [x, layer + 1, y], [x + 1, layer + 1, y], [x + 1, layer, y]]],
          [!has(x, y + 1, layer), 5, [[x, layer, y + 1], [x + 1, layer, y + 1], [x + 1, layer + 1, y + 1], [x, layer + 1, y + 1]]],
        ];
        for (const [free, id, corners] of faces) {
          if (!free) continue;
          if (!holes.includes(face++)) quad(corners, paint(c, id));
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** The test model: a 40 x 40 slab of 4 layers, a 3 x 3 x 3 block on it, and a pillar of 2 more voxels on the block's corner. */
const block = (c: Cell) => c.layer < 4 || (c.x >= 10 && c.x < 13 && c.y >= 10 && c.y < 13 && c.layer < 7);
const pillar = (c: Cell) => block(c) || (c.x === 10 && c.y === 10 && c.layer < 9);
const topOf = (c: Cell) => (c.layer === 6 && c.x === 11 && c.y === 11 ? 77 : 1 + c.layer);
/** Every face of a cell takes its layer's entry (+10 per side kind), the top of the block's middle takes 77. */
const paint = (c: Cell, face: number) => (face === 1 ? topOf(c) : 100 + c.layer * 10 + face);

describe("voxelize", () => {
  const grid: VoxelGrid = voxelize({ geometry: meshOf(block, paint) }, { name: "block" })!;
  const at = (x: number, y: number, layer: number) => {
    for (let v = 0; v < grid.count; v++) if (grid.cells[v * 3] === x && grid.cells[v * 3 + 1] === y && grid.cells[v * 3 + 2] === layer) return v;
    return -1;
  };

  it("rebuilds the solid voxels, layer by layer from the bottom, and the grid's size and step", () => {
    expect(grid).not.toBeNull();
    expect([grid.sizeX, grid.sizeY, grid.layers]).toEqual([40, 40, 7]);
    expect(grid.step).toBeCloseTo(0.1, 6);
    expect(grid.count).toBe(40 * 40 * 4 + 27);
    expect(grid.groundTop).toBe(3);
    expect(grid.slabCount).toBe(40 * 40 * 4);
    expect(grid.cells).toBeInstanceOf(Uint8Array);
    expect(grid.cells).toHaveLength(grid.count * 3);
    const layerOf = Array.from({ length: grid.count }, (_, v) => grid.cells[v * 3 + 2]!);
    expect(layerOf).toEqual([...layerOf].sort((a, b) => a - b));
    expect(grid.occupied[cellIndex(grid, 11, 11, 6)]).toBe(1);
    expect(grid.occupied[cellIndex(grid, 14, 11, 6)]).toBe(0);
  });

  it("reads a colour from the UV alone: the palette entry of the face a voxel owns, a top face first", () => {
    // The slab's top layer (3) has its top face free everywhere but under the block: entry 1 + layer = 4.
    expect(grid.entry[at(0, 0, 3)!]).toBe(4);
    // The block's top: its middle voxel is painted 77, the others 1 + 6 = 7.
    expect(grid.entry[at(11, 11, 6)!]).toBe(77);
    expect(grid.entry[at(10, 10, 6)!]).toBe(7);
    // A voxel of the slab's side with no top face takes a side face (layer 0, face 2: west): 100 + 0 * 10 + 2.
    expect(grid.entry[at(0, 5, 0)!]).toBe(102);
    expect(paletteU(77)).toBeCloseTo(77.5 / 256, 9);
  });

  it("gives an interior voxel the colour of the voxel above it", () => {
    // (11, 11, 5) has solid on all six sides, no face: it takes the middle top's, through the voxel above (11, 11, 6).
    expect(grid.visible[at(11, 11, 5)!]).toBe(0);
    expect(grid.entry[at(11, 11, 5)!]).toBe(77);
    // Further down, (11, 11, 4) rests on the slab: its colour is the one above it again, through the column.
    expect(grid.entry[at(11, 11, 4)!]).toBe(77);
    // Deep in the slab, (20, 20, 1) has no face either and takes its column's colour from above: the slab's top, 4.
    expect(grid.entry[at(20, 20, 1)!]).toBe(4);
  });

  it("flags the voxels with a free face once landed", () => {
    expect(grid.visible[at(11, 11, 6)!]).toBe(1); // the top
    expect(grid.visible[at(10, 11, 5)!]).toBe(1); // a side, west of the block
    expect(grid.visible[at(20, 20, 0)!]).toBe(1); // the slab's bottom: the ground counts as a face, as #512's table does
    expect(grid.visible[at(20, 20, 3)!]).toBe(1); // the slab's top
    expect(grid.visible[at(20, 20, 1)!]).toBe(0); // inside the slab
    expect(grid.visible[at(11, 11, 4)!]).toBe(0); // inside the block, on the slab
    expect(grid.visible[at(11, 11, 5)!]).toBe(0);
    // The slab's bottom layer (1,600), the border of its two middle layers (156 each), its top layer less the 9 voxels under the
    // block (1,591), the block less its two inner voxels (25).
    expect(Array.from(grid.visible).reduce((n, v) => n + v, 0)).toBe(1600 + 312 + 1591 + 25);
    expect(grid.visibleCount).toBe(1600 + 312 + 1591 + 25);
  });

  it("returns nothing for a model whose columns do not alternate, and logs its name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The top face of the pillar's voxel (10, 10, 8): leaving its two triangles out opens its column.
    const open = meshOf(pillar, paint, 40, 10, [firstFace(pillar, (c, face) => c.x === 10 && c.y === 10 && c.layer === 8 && face === 1)]);
    expect(voxelize({ geometry: open }, { name: "broken-model" })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("broken-model");
    // The same model with all its faces is a grid.
    expect(voxelize({ geometry: meshOf(pillar, paint) }, { name: "whole" })?.count).toBe(40 * 40 * 4 + 27 + 2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an empty geometry", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(voxelize({ geometry: new THREE.BufferGeometry() })).toBeNull();
  });

  it("reads the same grid from 8-bit normalized positions under a scale, as the shipped copies are", () => {
    const plain = meshOf(pillar, paint);
    const position = plain.getAttribute("position");
    const quantized = new THREE.BufferGeometry();
    const ints = new Int8Array(position.count * 3);
    // One voxel per integer: the model's cells 0 to 40 become -20 to 20, about its centre, under a scale of 127 * 0.1.
    for (let i = 0; i < position.count; i++) {
      ints[i * 3] = Math.round(position.getX(i) * 10) - 20;
      ints[i * 3 + 1] = Math.round(position.getY(i) * 10);
      ints[i * 3 + 2] = Math.round(position.getZ(i) * 10) - 20;
    }
    quantized.setAttribute("position", new THREE.BufferAttribute(ints, 3, true));
    quantized.setAttribute("uv", new THREE.BufferAttribute(Uint16Array.from(Array.from(plain.getAttribute("uv").array, (u) => Math.round(u * 65535))), 2, true));
    quantized.setIndex(plain.getIndex()!.clone());
    const mesh = new THREE.Mesh(quantized);
    mesh.scale.setScalar(12.7);
    mesh.updateMatrixWorld(true);
    const [a, b] = [voxelize(sourceOf(mesh), { name: "q" })!, voxelize({ geometry: plain }, { name: "p" })!];
    expect(a.count).toBe(b.count);
    expect(a.cells).toEqual(b.cells);
    expect(a.entry).toEqual(b.entry);
  });
});

/** The index (among the faces `meshOf` draws) of the first face `pick` chooses, to leave it out. */
function firstFace(solid: (c: Cell) => boolean, pick: (c: Cell, face: number) => boolean): number {
  const seen: boolean[] = [];
  const has = (x: number, y: number, layer: number) => x >= 0 && y >= 0 && layer >= 0 && x < 40 && y < 40 && layer < 10 && solid({ x, y, layer });
  for (let layer = 0; layer < 10; layer++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        if (!has(x, y, layer)) continue;
        const free = [!has(x, y, layer - 1), !has(x, y, layer + 1), !has(x - 1, y, layer), !has(x + 1, y, layer), !has(x, y - 1, layer), !has(x, y + 1, layer)];
        for (let face = 0; face < 6; face++) {
          if (!free[face]) continue;
          if (pick({ x, y, layer }, face)) return seen.length;
          seen.push(true);
        }
      }
  throw new Error("no such face");
}

describe("VoxelCache", () => {
  const source = () => ({ geometry: meshOf(block, paint) });

  it("builds a type's grid once and shares it", () => {
    const cache = new VoxelCache();
    expect(cache.peek("a")).toBeUndefined();
    const grid = cache.get("a", source())!;
    expect(cache.get("a", source())).toBe(grid);
    expect(cache.peek("a")).toBe(grid);
    expect(cache.size).toBe(1);
    cache.forget("a");
    expect(cache.peek("a")).toBeUndefined();
    cache.get("a", source());
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("remembers a model that gave nothing: logged once, null after", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new VoxelCache();
    expect(cache.get("empty", { geometry: new THREE.BufferGeometry() })).toBeNull();
    expect(cache.get("empty", { geometry: new THREE.BufferGeometry() })).toBeNull();
    expect(cache.peek("empty")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("empty");
  });

  it("builds in an idle slice on request, one build for every caller of a type", async () => {
    const cache = new VoxelCache();
    const [a, b] = [cache.request("a", source()), cache.request("a", source())];
    expect(a).toBe(b);
    expect(cache.peek("a")).toBeUndefined(); // not yet: the build waits for the idle slice
    const grid = await a;
    expect(grid?.count).toBe(40 * 40 * 4 + 27);
    expect(cache.peek("a")).toBe(grid);
    expect(await cache.request("a", source())).toBe(grid);
  });

  it("does not reuse or keep a build requested before forget or clear", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new VoxelCache();
    const empty = { geometry: new THREE.BufferGeometry() };
    const [stale, , fresh] = [cache.request("a", source()), cache.forget("a"), cache.request("a", empty)] as const;
    expect(fresh).not.toBe(stale);
    expect((await stale)?.count).toBe(40 * 40 * 4 + 27); // its callers still get the grid of the source they gave
    expect(await fresh).toBeNull(); // the new request built the new source
    expect(cache.peek("a")).toBeNull();

    const cleared = cache.request("b", source());
    cache.clear();
    expect((await cleared)?.count).toBe(40 * 40 * 4 + 27);
    expect(cache.size).toBe(0); // the cache did not refill after clear
  });
});
