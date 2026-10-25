import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_SMOKE_SETTINGS, SMOKE_LOOKS, resolveSmokeSettings, smokeLookOf, smokeMode } from "../src/core/chimney-smoke-settings";
import { ChimneySmoke, SmokeVoxels, smokeFreeIndex } from "../src/core/chimney-smoke";
import { chimneyOptionsOf, findChimneys } from "../src/core/chimneys";
import { voxelize } from "../src/core/voxelizer";
import { loadMesh, shipped, sourceOf } from "./helpers/model-meshes";

/** A model type as the loader gives it (its root, the mesh in it) and a tile of it on the board (a clone in a frame). */
async function typeOf(plan: string) {
  const mesh = await loadMesh(shipped(plan));
  const type = mesh.parent ?? mesh;
  const frame = new THREE.Group();
  const tile = type.clone();
  tile.position.set(3, 0, -3);
  frame.add(tile);
  return { mesh, type, frame, tile };
}

describe("the smoke's settings", () => {
  it("smokes in autumn, winter and spring, not in summer (owner, 2026-10-25), and fades a change of season over about 2 s", () => {
    const { seasons, fadeSeconds } = DEFAULT_SMOKE_SETTINGS;
    expect([seasons.summer.enabled, seasons.autumn.enabled, seasons.winter.enabled, seasons.spring.enabled]).toEqual([false, true, true, true]);
    expect(seasons.winter.amount).toBeGreaterThan(seasons.autumn.amount);
    expect(fadeSeconds).toBe(2);
  });

  it("takes a partial input over the defaults, and a look's knobs over the look", () => {
    const s = resolveSmokeSettings({ look: "wisps", custom: { opacity: 0.3 }, seasons: { spring: { enabled: false } }, fadeSeconds: -1 });
    expect(s.seasons.spring).toEqual({ enabled: false, amount: DEFAULT_SMOKE_SETTINGS.seasons.spring.amount });
    expect(s.seasons.winter).toEqual(DEFAULT_SMOKE_SETTINGS.seasons.winter);
    expect(s.fadeSeconds).toBe(0);
    expect(smokeLookOf(s)).toEqual({ ...SMOKE_LOOKS.wisps, opacity: 0.3 });
  });

  it("draws no smoke under the Low tier, under reduced motion or with the ambient effects off", () => {
    const on = { enabled: true, ambient: true, tier: "medium" as const, reducedMotion: false };
    expect(smokeMode(on)).toBe("moving");
    expect(smokeMode({ ...on, tier: "high" })).toBe("moving");
    expect(smokeMode({ ...on, tier: "low" })).toBe("off");
    expect(smokeMode({ ...on, reducedMotion: true })).toBe("off");
    expect(smokeMode({ ...on, ambient: false })).toBe("off");
    expect(smokeMode({ ...on, enabled: false })).toBe("off");
  });
});

describe("the smoke voxels' toggle", () => {
  it("leaves out the triangles inside the smoke boxes only, and gives the model back as it was", async () => {
    const { mesh } = await typeOf("sfrfrfffr");
    const grid = voxelize(sourceOf(mesh))!;
    const smoking = findChimneys(grid, chimneyOptionsOf("sfrfrfffr")).chimneys.filter((c) => c.kind === "smoking");
    const full = mesh.geometry.getIndex()!;
    const { index, dropped } = smokeFreeIndex(mesh.geometry, mesh.matrixWorld, grid, smoking);
    expect(dropped).toBeGreaterThan(0);
    expect(index.length).toBe(full.count - dropped * 3);
    const voxels = new SmokeVoxels(mesh, mesh.matrixWorld, grid, smoking);
    voxels.set(true);
    expect(mesh.geometry.getIndex()!.count).toBe(index.length);
    voxels.restore();
    expect(mesh.geometry.getIndex()).toBe(full);
  });
});

describe("the chimney smoke", () => {
  it("puts every chimney of the board's tiles, smoking and bare, in one instanced draw, with the smoking ones' caps in a second", async () => {
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    const chimneys = smoke.prepare("rfffrfffr", type);
    expect(chimneys.map((c) => c.kind).sort()).toEqual(["bare", "smoking"]);
    smoke.setCycle({ season: "autumn", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    const stats = smoke.stats();
    expect(stats).toMatchObject({ mode: "moving", season: "autumn", presence: 1, chimneys: 2, puffs: 2 * SMOKE_LOOKS.puffs.puffs, drawCalls: 2 });
    expect(stats.hiddenTriangles).toBeGreaterThan(0);
    // Every puff is an instance of one mesh, which the shader moves (no bounding sphere to cull it by).
    const puffs = smoke.object.getObjectByName("chimney-smoke-puffs") as THREE.Mesh<THREE.InstancedBufferGeometry>;
    expect(puffs.geometry.instanceCount).toBe(stats.puffs);
    expect(puffs.frustumCulled).toBe(false);
    // One draw each, as `drawCalls` counts them: three draws a transparent double-sided material twice (WebGLRenderer's
    // renderObject) unless it is forced to a single pass; the caps are opaque.
    const material = puffs.material as THREE.ShaderMaterial;
    expect(material.transparent && material.side === THREE.DoubleSide ? material.forceSinglePass : true).toBe(true);
    const caps = smoke.object.getObjectByName("chimney-caps") as THREE.InstancedMesh;
    const capMaterial = caps.material as THREE.Material;
    expect(capMaterial.transparent || capMaterial.side === THREE.DoubleSide).toBe(false);
    smoke.dispose();
  });

  it("in summer draws neither smoke nor white voxels; under the Low tier, reduced motion or the effects off, the white voxels and no smoke", async () => {
    const { mesh, type, frame, tile } = await typeOf("rfffrfffr");
    const full = mesh.geometry.getIndex();
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle({ season: "summer", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    expect(smoke.stats()).toMatchObject({ presence: 0, puffs: 0, drawCalls: 1 });
    expect(smoke.stats().hiddenTriangles).toBeGreaterThan(0);
    expect(mesh.geometry.getIndex()).not.toBe(full);
    smoke.setMode("off");
    expect(smoke.stats()).toMatchObject({ mode: "off", puffs: 0, drawCalls: 0, hiddenTriangles: 0 });
    expect(mesh.geometry.getIndex()).toBe(full);
    // A step while off moves nothing and asks for no frame.
    expect(smoke.step(1)).toBe(false);
    smoke.dispose();
  });

  it("fades a change of season over `fadeSeconds`, never a pop, and asks for frames while a puff shows", async () => {
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle({ season: "winter", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    expect(smoke.stats().presence).toBe(1);
    smoke.setCycle({ season: "summer", position: 0.3 });
    // The first step only reads the time; then a second at 0.1 s a step.
    expect(smoke.step(0)).toBe(true);
    for (let k = 1; k <= 10; k++) smoke.step(k * 0.1);
    expect(smoke.stats().presence).toBeCloseTo(0.5, 5);
    for (let k = 11; k <= 20; k++) smoke.step(k * 0.1);
    expect(smoke.stats().presence).toBe(0);
    expect(smoke.step(2.1)).toBe(false);
    // Back to autumn: it fades in again.
    smoke.setCycle({ season: "autumn", position: 0.3 });
    smoke.step(2.2);
    expect(smoke.stats().presence).toBeGreaterThan(0);
    expect(smoke.stats().presence).toBeLessThan(0.1);
    smoke.dispose();
  });

  it("takes summer's day with the cycle off: no smoke (#770, open point 1)", async () => {
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle(null);
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    expect(smoke.stats()).toMatchObject({ season: "summer", puffs: 0 });
    smoke.dispose();
  });

  it("gives the models back as they were when it is disposed", async () => {
    const { mesh, type, frame, tile } = await typeOf("sfrfrfffr");
    const full = mesh.geometry.getIndex();
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("sfrfrfffr", type);
    smoke.setTiles([{ key: "sfrfrfffr", type, tile }], frame);
    expect(mesh.geometry.getIndex()).not.toBe(full);
    smoke.dispose();
    expect(mesh.geometry.getIndex()).toBe(full);
  });
});
