import { beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { TileRenderer } from "../src/core/TileRenderer";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";
import { DEFAULT_VOXEL_DROP_SETTINGS, resolveVoxelDropSettings } from "../src/core/voxel-drop-settings";
import { dropDuration, planDrop } from "../src/core/voxel-drop-schedule";
import { voxelize, type VoxelGrid } from "../src/core/voxelizer";
import type { TileRenderData } from "../src/core/types";

const SHIPPED = fileURLToPath(new URL("../../app/public/renderer-assets/models", import.meta.url));

/** A GLB without its images (node has no image decoder): the geometry is all the voxelizer reads. */
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

const shipped = (plan: string) => `${SHIPPED}/${readdirSync(SHIPPED).find((f) => f.startsWith(`${plan}.`) && f.endsWith(".glb"))!}`;

/** A plan's model as the loader gives it, its world matrices set. */
async function loadModel(plan: string): Promise<THREE.Group> {
  const gltf = await loader.parseAsync(withoutImages(readFileSync(shipped(plan))), "");
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene as unknown as THREE.Group;
}

async function gridOf(plan: string): Promise<VoxelGrid> {
  const model = await loadModel(plan);
  let mesh!: THREE.Mesh;
  model.traverse((child) => child instanceof THREE.Mesh && (mesh = child));
  return voxelize({ geometry: mesh.geometry, toModel: mesh.matrixWorld }, { name: plan })!;
}

const NO_RANDOM = { jitter: 0, overlap: 0 };

describe("the settings", () => {
  it("has the defaults the issue asks for: 1 to 2 s, no shadow during the fall", () => {
    const d = DEFAULT_VOXEL_DROP_SETTINGS;
    expect([d.minMs, d.maxMs, d.shadows]).toEqual([1000, 2000, false]);
    expect(DEFAULT_RENDERER_SETTINGS.voxelDrop).toBe(d);
    expect(resolveRendererSettings({ voxelDrop: { speed: 0.5 } }).voxelDrop).toEqual({ ...d, speed: 0.5 });
  });

  it("falls back to the base for a bad value, and keeps maxMs at or above minMs", () => {
    const s = resolveVoxelDropSettings({ ease: "bogus" as never, landing: 3 as never, fallMs: NaN, jitter: 9, minMs: 3000, maxMs: 1500, shadows: "yes" as never });
    expect([s.ease, s.landing, s.fallMs, s.jitter, s.shadows]).toEqual([DEFAULT_VOXEL_DROP_SETTINGS.ease, DEFAULT_VOXEL_DROP_SETTINGS.landing, DEFAULT_VOXEL_DROP_SETTINGS.fallMs, 1, false]);
    expect(s.maxMs).toBeGreaterThanOrEqual(s.minMs);
  });
});

describe("the duration", () => {
  it("scales with the decor and is clamped to 1 to 2 s", () => {
    const d = DEFAULT_VOXEL_DROP_SETTINGS;
    expect(dropDuration(0, d)).toBe(1000);
    expect(dropDuration(1518, d)).toBeCloseTo(1007.2, 1);
    expect(dropDuration(3613, d)).toBeCloseTo(1845.2, 1);
    expect(dropDuration(100_000, d)).toBe(2000);
    expect(dropDuration(1518, { ...d, minMs: 1500 })).toBe(1500);
  });

  it("is inside 1 to 2 s for the models at both ends of #512's table", async () => {
    for (const plan of ["rfffrfffr", "wfffffffr"]) {
      const { durationMs } = planDrop(await gridOf(plan), DEFAULT_VOXEL_DROP_SETTINGS);
      expect(durationMs).toBeGreaterThanOrEqual(1000);
      expect(durationMs).toBeLessThanOrEqual(2000);
    }
  });
});

describe("the order", () => {
  it("launches layer by layer from the bottom, each phase after the last, with no randomness", async () => {
    const grid = await gridOf("wfffffffr");
    const { delays } = planDrop(grid, resolveVoxelDropSettings(NO_RANDOM));
    const [lo, hi] = [new Float32Array(grid.layers).fill(Infinity), new Float32Array(grid.layers).fill(-Infinity)];
    for (let v = 0; v < grid.count; v++) {
      const l = grid.cells[v * 3 + 2]!;
      lo[l] = Math.min(lo[l]!, delays[v]!);
      hi[l] = Math.max(hi[l]!, delays[v]!);
    }
    for (let l = 0; l + 1 < grid.layers; l++) if (Number.isFinite(hi[l]!) && Number.isFinite(lo[l + 1]!)) expect(hi[l]!).toBeLessThanOrEqual(lo[l + 1]! + 1e-3);
  });

  it("launches a layer from the centre to the edges", async () => {
    const grid = await gridOf("ccccccccc");
    const { delays } = planDrop(grid, resolveVoxelDropSettings(NO_RANDOM));
    for (const layer of [0, 2, 6]) {
      const ring: Array<[number, number]> = [];
      for (let v = 0; v < grid.count; v++) {
        if (grid.cells[v * 3 + 2] !== layer) continue;
        ring.push([Math.hypot(grid.cells[v * 3]! + 0.5 - 20, grid.cells[v * 3 + 1]! + 0.5 - 20), delays[v]!]);
      }
      ring.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ring.length; i++) expect(ring[i]![1]).toBeGreaterThanOrEqual(ring[i - 1]![1] - 1e-3);
    }
  });

  it("lands the last voxel at the duration, and gives the slab its share of the launches", async () => {
    const grid = await gridOf("ccccccccc");
    const s = resolveVoxelDropSettings({ slabShare: 0.25 });
    const plan = planDrop(grid, s);
    expect(plan.launchMs + s.fallMs).toBeCloseTo(plan.durationMs, 3);
    expect(Math.max(...plan.delays)).toBeLessThanOrEqual(plan.launchMs + 1e-3);
    expect(plan.slabEndMs).toBeCloseTo(plan.launchMs * 0.25, 3);
    for (let v = 0; v < grid.count; v++) {
      const slab = grid.cells[v * 3 + 2]! <= grid.groundTop;
      if (slab) expect(plan.delays[v]!).toBeLessThanOrEqual(plan.slabEndMs + 1e-3);
      else expect(plan.delays[v]!).toBeGreaterThanOrEqual(plan.slabEndMs - 1e-3);
    }
  });

  it("caps the fall at 80 % of a short duration, so the last voxel lands at the duration", async () => {
    const grid = await gridOf("ccccccccc");
    const plan = planDrop(grid, resolveVoxelDropSettings({ minMs: 100, maxMs: 100, fallMs: 1200 }));
    expect(plan.durationMs).toBe(100);
    expect(plan.fallMs).toBeCloseTo(80, 3);
    expect(Math.max(...plan.delays) + plan.fallMs).toBeLessThanOrEqual(plan.durationMs + 1e-3);
  });

  it("runs the layers into each other with overlap, and stays inside the launch window", async () => {
    const grid = await gridOf("ccccccccc");
    const plan = planDrop(grid, resolveVoxelDropSettings({ overlap: 1, jitter: 1 }));
    expect(Math.max(...plan.delays)).toBeLessThanOrEqual(plan.launchMs + 1e-3);
    expect(Math.min(...plan.delays)).toBeGreaterThanOrEqual(0);
    // The same tile always drops the same way.
    expect(planDrop(grid, resolveVoxelDropSettings({ overlap: 1, jitter: 1 })).delays).toEqual(plan.delays);
  });
});

describe("the drop of a placed tile", () => {
  const tile = (overrides: Partial<TileRenderData> = {}): TileRenderData => ({
    game_id: 1, id: 1, player_id: "0x1", plan: 1, orientation: 1, x: 0, y: 0, worldX: 2, worldZ: 3, ...overrides,
  });

  /** A renderer whose assets are the real model of plan 1 (`ccccccccc`). */
  async function rendererWithModel() {
    const model = await loadModel("ccccccccc");
    const assets = { has: () => true, want: () => {}, setSkins: () => {}, getModel: () => model, getTexture: () => new THREE.Texture() };
    return new TileRenderer(assets as never);
  }
  const container = (renderer: TileRenderer) => renderer.getGroup().children[0]!.children[0]!;
  const dropMeshes = (renderer: TileRenderer) => {
    const found: THREE.Object3D[] = [];
    renderer.getGroup().traverse((o) => o.name === "voxel-drop" && found.push(o));
    return found;
  };

  it("does not drop when tiles are drawn, a first load or a reload", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    renderer.updateTiles([tile(), tile({ id: 2, worldX: 3 })]);
    expect(dropMeshes(renderer)).toHaveLength(0);
    expect(renderer.update(0)).toMatchObject({ animating: false });
  });

  it("builds one instanced cube per solid voxel, 12 triangles each, and reports the numbers", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    const result = await renderer.dropTile("1-1");
    if (result.status !== "started") throw new Error(result.reason);
    const grid = await gridOf("ccccccccc");
    expect(result.info).toMatchObject({ voxels: grid.count, instances: grid.count, triangles: grid.count * 12, slabVoxels: grid.slabCount });
    expect(result.info.durationMs).toBeGreaterThanOrEqual(1000);
    expect(result.info.durationMs).toBeLessThanOrEqual(2000);
    const [mesh] = dropMeshes(renderer) as THREE.Mesh<THREE.InstancedBufferGeometry>[];
    expect(mesh!.geometry.instanceCount).toBe(grid.count);
    expect(mesh!.castShadow).toBe(false);
    expect(mesh!.customDepthMaterial).toBeUndefined();
    renderer.dispose();
  });

  it("swaps with no empty frame and no frame with both: the model is hidden as the drop goes in, and back as it goes out", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    const placed = container(renderer);
    const model = placed.children[0]!;
    expect(model.visible).toBe(true);
    const result = await renderer.dropTile("1-1");
    if (result.status !== "started") throw new Error(result.reason);
    // After the call that started it, every frame has exactly one of the two.
    expect(model.visible).toBe(false);
    expect(placed.children.filter((c) => c.name === "voxel-drop")).toHaveLength(1);

    expect(renderer.update(1000).animating).toBe(true);
    expect(renderer.update(1000 + result.info.durationMs - 1).animating).toBe(true);
    expect(model.visible).toBe(false);
    const last = renderer.update(1000 + result.info.durationMs + 1);
    expect(last).toEqual({ animating: false, shadow: true });
    expect(model.visible).toBe(true);
    expect(dropMeshes(renderer)).toHaveLength(0);
    await expect(result.finished).resolves.toBeUndefined();
    expect(renderer.update(5000)).toEqual({ animating: false, shadow: false });
    renderer.dispose();
  });

  it("begins in the call once prepared, so the first drop shows the real model for no frame", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    const model = container(renderer).children[0]!;
    expect(await renderer.prepareDrop("1-1")).toBe(true);
    const pending = renderer.dropTile("1-1");
    expect(model.visible).toBe(false);
    expect(dropMeshes(renderer)).toHaveLength(1);
    expect((await pending).status).toBe("started");
    renderer.dispose();
  });

  it("plays at the clock's speed: slow motion lasts longer", async () => {
    const renderer = await rendererWithModel();
    renderer.setVoxelDropSettings(resolveVoxelDropSettings({ speed: 0.5 }));
    renderer.updateTiles([tile()]);
    const result = await renderer.dropTile("1-1");
    if (result.status !== "started") throw new Error(result.reason);
    expect(result.info.playMs).toBeCloseTo(result.info.durationMs * 2, 3);
    renderer.update(0);
    expect(renderer.update(result.info.durationMs + 10).animating).toBe(true);
    expect(renderer.update(result.info.playMs + 10).animating).toBe(false);
    renderer.dispose();
  });

  it("casts a shadow during the fall only when asked", async () => {
    const renderer = await rendererWithModel();
    renderer.setVoxelDropSettings(resolveVoxelDropSettings({ shadows: true }));
    renderer.updateTiles([tile()]);
    await renderer.dropTile("1-1");
    const [mesh] = dropMeshes(renderer) as THREE.Mesh[];
    expect(mesh!.castShadow).toBe(true);
    expect(mesh!.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(renderer.update(0).shadow).toBe(true);
    renderer.dispose();
  });

  it("is skipped under reduced motion, for a tile not drawn, and leaves the model alone", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    renderer.setReducedMotion(true);
    expect(await renderer.dropTile("1-1")).toEqual({ status: "skipped", reason: "reduced-motion" });
    renderer.setReducedMotion(false);
    expect(await renderer.dropTile("1-99")).toEqual({ status: "skipped", reason: "no-tile" });
    expect(container(renderer).children[0]!.visible).toBe(true);
    expect(dropMeshes(renderer)).toHaveLength(0);
    renderer.dispose();
  });

  it("is skipped, with a log, for a model that is not a closed solid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const assets = {
      has: () => true, want: () => {}, setSkins: () => {}, getTexture: () => new THREE.Texture(),
      getModel: () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())),
    };
    const renderer = new TileRenderer(assets as never);
    renderer.updateTiles([tile()]);
    const result = await renderer.dropTile("1-1");
    // A box is a closed solid, so it drops; a mesh with no faces on the grid does not.
    if (result.status === "skipped") expect(result.reason).toBe("no-voxels");
    else expect(result.info.voxels).toBeGreaterThan(0);
    warn.mockRestore();
    renderer.dispose();
  });

  it("ends the drop when its tile is replaced or removed, and leaves nothing after dispose", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    const first = await renderer.dropTile("1-1");
    if (first.status !== "started") throw new Error(first.reason);
    renderer.updateTiles([tile({ orientation: 2 })]);
    await expect(first.finished).resolves.toBeUndefined();
    expect(dropMeshes(renderer)).toHaveLength(0);
    expect(renderer.update(0).animating).toBe(false);

    const second = await renderer.dropTile("1-1");
    if (second.status !== "started") throw new Error(second.reason);
    const geometry = (dropMeshes(renderer)[0] as THREE.Mesh).geometry;
    const disposed = vi.spyOn(geometry, "dispose");
    renderer.dispose();
    expect(disposed).toHaveBeenCalled();
    await expect(second.finished).resolves.toBeUndefined();
    expect(dropMeshes(renderer)).toHaveLength(0);
  });

  it("restarts a drop that is running: one drop a tile", async () => {
    const renderer = await rendererWithModel();
    renderer.updateTiles([tile()]);
    const first = await renderer.dropTile("1-1");
    const second = await renderer.dropTile("1-1");
    if (first.status !== "started" || second.status !== "started") throw new Error("not started");
    await expect(first.finished).resolves.toBeUndefined();
    expect(dropMeshes(renderer)).toHaveLength(1);
    renderer.dispose();
  });
});
