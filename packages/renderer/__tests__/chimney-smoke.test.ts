import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DEFAULT_SMOKE_SETTINGS, SMOKE_LOOKS, resolveSmokeSettings, smokeLookOf, smokeMode } from "../src/core/chimney-smoke-settings";
import { ChimneySmoke, smokeFreeIndex, smokeFreeSegments, withoutVoxels } from "../src/core/chimney-smoke";
import { chimneyOptionsOf, findChimneys } from "../src/core/chimneys";
import { voxelize } from "../src/core/voxelizer";
import { buildEdgesGeometry } from "../src/core/edges";
import { createOutline, createOutlineMaterial, isOutline } from "../src/core/outlines";
import { loadMesh, shipped, sourceOf } from "./helpers/model-meshes";

/** A model type as the loader gives it (its root, the mesh in it) and a tile of it on the board (a clone in a frame). */
async function typeOf(plan: string) {
  const mesh = await loadMesh(shipped(plan));
  // Its outline, as the tile renderer gives every type (`tileType`).
  mesh.add(createOutline(buildEdgesGeometry(mesh.geometry), createOutlineMaterial()));
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

describe("the smoke-free twins", () => {
  it("leave out the triangles inside the smoke boxes only, on the loader's own attributes", async () => {
    const { mesh, type } = await typeOf("sfrfrfffr");
    const grid = voxelize(sourceOf(mesh))!;
    const smoking = findChimneys(grid, chimneyOptionsOf("sfrfrfffr")).chimneys.filter((c) => c.kind === "smoking");
    const full = mesh.geometry.getIndex()!;
    const { index, dropped } = smokeFreeIndex(mesh.geometry, mesh.matrixWorld, grid, smoking);
    expect(dropped).toBeGreaterThan(0);
    expect(index.length).toBe(full.count - dropped * 3);
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("sfrfrfffr", type);
    const free = smoke.freeOf("sfrfrfffr")!;
    const twin = free.geometries.get(mesh.geometry)!;
    expect(twin.getIndex()!.count).toBe(index.length);
    expect(free.triangles).toBe(dropped);
    // No upload of its own: the loader's position, normal and uv, shared.
    for (const name of Object.keys(mesh.geometry.attributes)) expect(twin.getAttribute(name)).toBe(mesh.geometry.getAttribute(name));
    // The loader's geometry is untouched: the pending tile and the previews keep their white voxels.
    expect(mesh.geometry.getIndex()).toBe(full);
    // The outline's twin has fewer segments, and the loader's outline keeps its own.
    const outline = mesh.children.find(isOutline) as THREE.Mesh<THREE.InstancedBufferGeometry>;
    const before = outline.geometry.instanceCount;
    const outlineTwin = free.geometries.get(outline.geometry) as THREE.InstancedBufferGeometry;
    expect(outlineTwin.instanceCount).toBeLessThan(before);
    expect(outlineTwin.instanceCount).toBeGreaterThan(before - 400);
    expect(outlineTwin.getIndex()!.count).toBe(outline.geometry.getIndex()!.count);
    expect(outline.geometry.instanceCount).toBe(before);
    smoke.dispose();
  });

  it("cut an outline's piece out where it runs into the smoke, and keep the rest of it", () => {
    const grid = { origin: [0, 0, 0] as const, step: 1 };
    const chimney = { boxes: [{ x0: 2, y0: 2, layer0: 5, x1: 2, y1: 2, layer1: 7 }] } as any;
    // A vertical edge up a stack's corner (x 2, z 2), from layer 3 into the smoke and past it; and one beside it, far off.
    const segments = [2, 3, 2, 2, 10, 2, 9, 3, 9, 9, 6, 9];
    const kept = smokeFreeSegments(segments, new THREE.Matrix4(), grid, [chimney]);
    expect(kept.length).toBe(18);
    // The stack's part (up to the box, less its slack), the part above the smoke, and the far edge whole.
    expect(kept[1]).toBeCloseTo(3);
    expect(kept[4]).toBeCloseTo(4.98);
    expect(kept[7]).toBeCloseTo(8.02);
    expect(kept[10]).toBeCloseTo(10);
    expect(Array.from(kept.slice(12))).toEqual([9, 3, 9, 9, 6, 9]);
  });

  it("give the voxel drop the grid without the smoke's voxels (#770 item 3: they do not fall)", async () => {
    const { mesh, type } = await typeOf("sfrfrfffr");
    const grid = voxelize(sourceOf(mesh))!;
    const smoking = findChimneys(grid, chimneyOptionsOf("sfrfrfffr")).chimneys.filter((c) => c.kind === "smoking");
    const cells = smoking.flatMap((c) => c.smoke);
    const shown = withoutVoxels(grid, cells);
    expect(shown.count).toBe(grid.count - cells.length);
    expect(shown.cells.length).toBe(shown.count * 3);
    expect(shown.slabCount).toBe(grid.slabCount);
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("sfrfrfffr", type);
    const dropped = smoke.freeOf("sfrfrfffr")!.dropGrid(grid);
    expect(dropped.count).toBe(shown.count);
    // Once a grid.
    expect(smoke.freeOf("sfrfrfffr")!.dropGrid(grid)).toBe(dropped);
    smoke.dispose();
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
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle({ season: "summer", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    // The caps' draw only: the white voxels are hidden (the caller swaps the tiles to the twins), no puff shows.
    expect(smoke.stats()).toMatchObject({ presence: 0, puffs: 0, drawCalls: 1, voxelsHidden: true });
    expect(smoke.stats().hiddenTriangles).toBeGreaterThan(0);
    expect(smoke.hidesVoxels()).toBe(true);
    smoke.setMode("off");
    expect(smoke.stats()).toMatchObject({ mode: "off", puffs: 0, drawCalls: 0, voxelsHidden: false, hiddenTriangles: 0 });
    expect(smoke.hidesVoxels()).toBe(false);
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

  it("fades a tile's smoke in from its placement, and none of the tiles already on the board", async () => {
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const time = { value: 40 };
    const smoke = new ChimneySmoke(time, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle({ season: "winter", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile, id: "1-1" }], frame);
    const puffs = smoke.object.getObjectByName("chimney-smoke-puffs") as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    const born = puffs.geometry.getAttribute("aBorn") as THREE.InstancedBufferAttribute;
    const per = SMOKE_LOOKS.puffs.puffs * 2;
    expect(born.getX(0)).toBeLessThan(-1000);
    // A tile placed at 52 s: its chimneys' puffs start then, over `placeSeconds`; the first tile's stay as they were.
    time.value = 52;
    const second = type.clone();
    frame.add(second);
    smoke.setTiles([{ key: "rfffrfffr", type, tile, id: "1-1" }, { key: "rfffrfffr", type, tile: second, id: "1-2" }], frame);
    expect(puffs.geometry.instanceCount).toBe(2 * per);
    expect(born.getX(0)).toBeLessThan(-1000);
    expect(born.getX(per)).toBe(52);
    expect(puffs.material.uniforms.uPlace.value).toBe(DEFAULT_SMOKE_SETTINGS.placeSeconds);
    // The board emptied (a tile mid-drop is not the smoke's), then the tile back at 60 s: placed now, so it fades in.
    smoke.setTiles([], frame);
    time.value = 60;
    smoke.setTiles([{ key: "rfffrfffr", type, tile, id: "1-1" }], frame);
    expect(born.getX(0)).toBe(60);
    expect(DEFAULT_SMOKE_SETTINGS.placeSeconds).toBe(1);
    smoke.dispose();
  });

  it("disposes the twins it built", async () => {
    const { mesh, type } = await typeOf("sfrfrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("sfrfrfffr", type);
    const twin = smoke.freeOf("sfrfrfffr")!.geometries.get(mesh.geometry)!;
    const disposed = vi.fn();
    twin.addEventListener("dispose", disposed);
    smoke.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
