import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DEFAULT_SMOKE_SETTINGS, NO_SMOKE_VARIATION, SMOKE_LOOKS, plumeOf, plumeSeed, puffsPerChimney, resolveSmokeSettings, smokeLookOf, smokeMode } from "../src/core/chimney-smoke-settings";
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

  it("keeps #770's look by default: no variation but the pace, today's roll and sway (#801 PR 1: the owner tunes before a default moves)", () => {
    for (const look of Object.values(SMOKE_LOOKS)) {
      expect(look.variation).toEqual(NO_SMOKE_VARIATION);
      expect([look.roll, look.swaySpeed]).toEqual([0.25, 1]);
    }
    expect(NO_SMOKE_VARIATION).toEqual({ direction: 0, drift: 0, shape: 0, tone: 0, puffTone: 0, opacity: 0, pace: 0.15 });
    expect(smokeLookOf(DEFAULT_SMOKE_SETTINGS)).toEqual(SMOKE_LOOKS.puffs);
  });

  it("takes a variation's knobs one by one over the look's", () => {
    const s = resolveSmokeSettings({ custom: { variation: { tone: 0.12 } } });
    expect(smokeLookOf(s).variation).toEqual({ ...NO_SMOKE_VARIATION, tone: 0.12 });
    const over = resolveSmokeSettings({ custom: { variation: { direction: 35 } } }, s);
    expect(smokeLookOf(over).variation).toEqual({ ...NO_SMOKE_VARIATION, tone: 0.12, direction: 35 });
  });

  it("gives every chimney the look as it is with no variation (#801: at 0 every chimney is alike)", () => {
    for (const seed of [0, 1, 770, plumeSeed(1.2, 2.4, -3.3)]) {
      expect(plumeOf(seed, SMOKE_LOOKS.puffs)).toEqual({ lean: 0, drift: 1, stretch: 1, billow: 1, swirl: 1, opacity: 1, tone: 0, puffs: SMOKE_LOOKS.puffs.puffs });
    }
    expect(puffsPerChimney(SMOKE_LOOKS.puffs)).toBe(SMOKE_LOOKS.puffs.puffs);
  });

  it("varies each chimney's plume within its ranges, the same for the same place, apart for two places", () => {
    const variation = { direction: 35, drift: 0.6, shape: 0.4, tone: 0.12, puffTone: 0.04, opacity: 0.2, pace: 0.25 };
    const look = { ...SMOKE_LOOKS.puffs, variation };
    const most = puffsPerChimney(look);
    expect(most).toBe(Math.round(SMOKE_LOOKS.puffs.puffs * 1.4));
    const plumes = Array.from({ length: 200 }, (_, i) => plumeOf(plumeSeed(i * 3, 0.6, -i * 1.5), look));
    for (const p of plumes) {
      expect(Math.abs(p.lean)).toBeLessThanOrEqual((35 * Math.PI) / 180);
      expect(p.drift).toBeGreaterThanOrEqual(0.4);
      expect(p.drift).toBeLessThanOrEqual(1.6);
      for (const f of [p.stretch, p.billow, p.swirl]) expect(Math.abs(f - 1)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(p.tone)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(p.opacity - 1)).toBeLessThanOrEqual(0.2);
      expect(p.puffs).toBeGreaterThanOrEqual(Math.round(SMOKE_LOOKS.puffs.puffs * 0.6));
      expect(p.puffs).toBeLessThanOrEqual(most);
    }
    // Spread over the ranges, both ways.
    expect(Math.min(...plumes.map((p) => p.lean))).toBeLessThan(-0.4);
    expect(Math.max(...plumes.map((p) => p.lean))).toBeGreaterThan(0.4);
    expect(Math.min(...plumes.map((p) => p.tone))).toBeLessThan(-0.08);
    expect(Math.max(...plumes.map((p) => p.tone))).toBeGreaterThan(0.08);
    // The same place, the same plume (every device, every load); two neighbouring chimneys apart.
    expect(plumeOf(plumeSeed(3, 0.6, -1.5), look)).toEqual(plumes[1]);
    expect(plumeSeed(3.001, 0.6, -1.5)).toBe(plumeSeed(3, 0.6, -1.5));
    expect(plumeOf(plumeSeed(3.075, 0.6, -1.5), look)).not.toEqual(plumes[1]);
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

  it("varies each chimney's plume in the same one draw, and lays the instances out again for a new variation (#801)", async () => {
    const { type, frame, tile } = await typeOf("rfffrfffr");
    const smoke = new ChimneySmoke({ value: 0 }, DEFAULT_SMOKE_SETTINGS);
    smoke.prepare("rfffrfffr", type);
    smoke.setCycle({ season: "autumn", position: 0.3 });
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    const puffs = smoke.object.getObjectByName("chimney-smoke-puffs") as THREE.Mesh<THREE.InstancedBufferGeometry>;
    const attribute = (name: string) => puffs.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
    const n = SMOKE_LOOKS.puffs.puffs;
    // No variation: every chimney's plume the look's, its puffs spread along the cycle as #770's.
    expect([attribute("aPlume").getX(0), attribute("aPlume").getY(0), attribute("aPlume").getZ(0), attribute("aPlume").getW(0)]).toEqual([0, 1, 0, 1]);
    expect(Array.from({ length: n }, (_, p) => attribute("aPuff").getX(p))).toEqual(Array.from({ length: n }, (_, p) => Math.fround(p / n)));

    const variation = { direction: 35, drift: 0.6, shape: 0.5, tone: 0.12, opacity: 0.2 };
    smoke.setSettings({ custom: { variation } });
    expect(smoke.needsTiles).toBe(true);
    smoke.setTiles([{ key: "rfffrfffr", type, tile }], frame);
    const look = smokeLookOf(resolveSmokeSettings({ custom: { variation } }));
    const room = puffsPerChimney(look);
    expect(smoke.stats()).toMatchObject({ chimneys: 2, puffs: 2 * room, drawCalls: 2 });
    // Each chimney's lean and tone apart; the puffs past its own count drawn as nothing.
    const [a, b] = [0, room].map((i) => [attribute("aPlume").getX(i), attribute("aPlume").getZ(i)]);
    expect(a).not.toEqual(b);
    for (const first of [0, room]) {
      const phases = Array.from({ length: room }, (_, p) => attribute("aPuff").getX(first + p));
      const drawn = phases.filter((x) => x >= 0).length;
      expect(drawn).toBeGreaterThanOrEqual(1);
      expect(phases.slice(drawn).every((x) => x === -1)).toBe(true);
    }
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
