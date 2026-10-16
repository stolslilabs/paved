import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_PLACEMENT_SETTINGS,
  GRID_RINGS,
  PlacementRenderer,
  colorProgress,
  confirmProgress,
  createAuraGeometry,
  gridLineOpacity,
  gridRingOpacity,
  placementFade,
  placementTone,
  resolvePlacementSettings,
  ringField,
  slotDashBlend,
  slotDashCount,
  veilOf,
} from "../src/core/placement";
import { neonLineCoverage } from "../src/core/neon";
import { DEFAULT_OUTLINE_SETTINGS, createOutline, createOutlineMaterial, isOutline } from "../src/core/outlines";
import { buildEdgesGeometry } from "../src/core/edges";
import { resolveRendererSettings } from "../src/core/settings";
import { TileRenderer } from "../src/core/TileRenderer";
import { TILE_SIZE } from "../src/core/types";
import type { HoverState } from "../src/core/types";

const { motion } = DEFAULT_PLACEMENT_SETTINGS;

describe("the grid's ring fade", () => {
  it("is visible one ring from a tile, perceptible at two, almost gone at three, and off from four", () => {
    const rings = DEFAULT_PLACEMENT_SETTINGS.grid.rings;
    expect(gridRingOpacity(0)).toBe(1);
    expect(gridRingOpacity(1)).toBe(1);
    expect(gridRingOpacity(2)).toBe(rings[1]);
    expect(gridRingOpacity(3)).toBe(rings[2]);
    expect(gridRingOpacity(GRID_RINGS)).toBe(0);
    expect(gridRingOpacity(9)).toBe(0);
    expect(rings[1]).toBeGreaterThan(rings[2]);
    expect(rings[2]).toBeGreaterThan(0);
    expect(rings[2]).toBeLessThanOrEqual(0.15);
  });

  it("falls linearly from one ring to the next", () => {
    const rings = DEFAULT_PLACEMENT_SETTINGS.grid.rings;
    expect(gridLineOpacity(1.5)).toBeCloseTo((1 + rings[1]) / 2, 9);
    expect(gridLineOpacity(2.25)).toBeCloseTo(rings[1] * 0.75 + rings[2] * 0.25, 9);
    expect(gridLineOpacity(3.5)).toBeCloseTo(rings[2] / 2, 9);
    // Monotone and continuous outward.
    let previous = gridLineOpacity(1);
    for (let r = 1; r <= GRID_RINGS; r += 0.01) {
      const value = gridLineOpacity(r);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      expect(previous - value).toBeLessThan(0.01);
      previous = value;
    }
  });

  it("counts rings by Chebyshev distance: the diagonal neighbour is ring 1", () => {
    const field = ringField([{ x: 0, y: 0 }, { x: 1, y: 0 }])!;
    const at = (x: number, y: number) => field.rings[(y - field.minY) * field.width + (x - field.minX)];
    expect(at(0, 0)).toBe(0);
    expect(at(1, 1)).toBe(1);
    expect(at(-1, -1)).toBe(1);
    expect(at(-2, 2)).toBe(2);
    expect(at(4, 0)).toBe(3);
    expect(at(-4, 0)).toBe(GRID_RINGS);
    // The field spans the tiles and four rings each side.
    expect(field.width).toBe(2 + 2 * GRID_RINGS);
    expect(field.height).toBe(1 + 2 * GRID_RINGS);
    expect(ringField([])).toBeNull();
  });
});

describe("the slots' dashes", () => {
  it("are 2 a side on a small cell, 3 on a large one, blended so a zoom step never pops", () => {
    const { dashesAtTilePx, dashBlendPx } = DEFAULT_PLACEMENT_SETTINGS.slots;
    // A phone's opening (about 52 px a tile) and a desktop's (about 60): 2 a side.
    expect(slotDashCount(52)).toBe(2);
    expect(slotDashCount(60)).toBe(2);
    expect(slotDashCount(dashesAtTilePx + dashBlendPx)).toBe(3);
    expect(slotDashCount(400)).toBe(3);
    expect(slotDashBlend(dashesAtTilePx)).toBeCloseTo(0.5, 9);
    let previous = 0;
    for (let px = 20; px < 200; px += 0.5) {
      const blend = slotDashBlend(px);
      expect(blend).toBeGreaterThanOrEqual(previous);
      expect(blend - previous).toBeLessThanOrEqual(0.5 / dashBlendPx + 1e-9);
      previous = blend;
    }
    // No blend width: a step at the size.
    expect(slotDashBlend(79, { dashesAtTilePx: 80, dashBlendPx: 0 })).toBe(0);
    expect(slotDashBlend(80, { dashesAtTilePx: 80, dashBlendPx: 0 })).toBe(1);
  });
});

describe("the lines on zoom-out", () => {
  it("fade on OUT-FADE's curve, the slots' borders keeping their floor", () => {
    const S = 60;
    expect(placementFade(1.15 * S, S, DEFAULT_OUTLINE_SETTINGS)).toBe(1);
    expect(placementFade(0.85 * S, S, DEFAULT_OUTLINE_SETTINGS)).toBe(0);
    // At the opening view, the outlines' 0.556.
    expect(placementFade(S, S, DEFAULT_OUTLINE_SETTINGS)).toBeCloseTo(0.556, 3);
    const floor = DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor;
    expect(placementFade(0.5 * S, S, DEFAULT_OUTLINE_SETTINGS, floor)).toBe(floor);
  });

  it("keep a device-pixel floor: a line thinner than a pixel covers one pixel", () => {
    expect(neonLineCoverage(0, 0.2)).toBe(1);
    expect(neonLineCoverage(1, 0.2)).toBe(0);
    expect(neonLineCoverage(0.5, 1)).toBe(0.5);
    expect(neonLineCoverage(0, 3)).toBe(1);
    expect(neonLineCoverage(1.75, 3)).toBeCloseTo(0.25, 9);
  });
});

describe("the state colours", () => {
  it("yellow while the rotation fits, red while it does not", () => {
    expect(placementTone(true)).toBe("yellow");
    expect(placementTone(false)).toBe("red");
  });

  it("change over colorMs, at once under reduced motion", () => {
    expect(colorProgress(0, motion, false)).toBe(0);
    expect(colorProgress(motion.colorMs / 2, motion, false)).toBeCloseTo(0.5, 9);
    expect(colorProgress(motion.colorMs, motion, false)).toBe(1);
    expect(colorProgress(0, motion, true)).toBe(1);
  });

  it("confirm: green in the first third, a fade to nothing over 600 to 800 ms; short and instant under reduced motion", () => {
    expect(motion.confirmMs).toBeGreaterThanOrEqual(600);
    expect(motion.confirmMs).toBeLessThanOrEqual(800);
    const start = confirmProgress(0, motion, false);
    expect(start).toEqual({ color: 0, opacity: 1, done: false });
    expect(confirmProgress(motion.confirmMs / 3, motion, false).color).toBeCloseTo(1, 9);
    expect(confirmProgress(motion.confirmMs / 2, motion, false).opacity).toBeCloseTo(0.5, 9);
    expect(confirmProgress(motion.confirmMs, motion, false)).toEqual({ color: 1, opacity: 0, done: true });
    const reduced = confirmProgress(0, motion, true);
    expect(reduced.color).toBe(1);
    expect(motion.reducedConfirmMs).toBeLessThan(motion.confirmMs / 2);
    expect(confirmProgress(motion.reducedConfirmMs, motion, true).done).toBe(true);
  });

  it("are the Tailwind tokens: primary gold-300, ember-500, meadow-400; the grid a pale ink-200", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.colors).toEqual({ yellow: "#f0bf5b", red: "#f85e4d", green: "#6eca6f" });
    expect(DEFAULT_PLACEMENT_SETTINGS.grid.color).toBe("#d1d9df");
  });

  it("the aura's waves loop in 1.5 to 2 s", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.aura.periodMs).toBeGreaterThanOrEqual(1500);
    expect(DEFAULT_PLACEMENT_SETTINGS.aura.periodMs).toBeLessThanOrEqual(2000);
  });
});

describe("the settings", () => {
  it("take each group's fields over the defaults, and ride in the renderer's settings", () => {
    const s = resolvePlacementSettings({ grid: { opacity: 0.5 }, motion: { reducedMotion: true } });
    expect(s.grid.opacity).toBe(0.5);
    expect(s.grid.rings).toEqual(DEFAULT_PLACEMENT_SETTINGS.grid.rings);
    expect(s.motion.reducedMotion).toBe(true);
    expect(s.motion.confirmMs).toBe(motion.confirmMs);
    expect(resolveRendererSettings({ placement: { aura: { waves: 3 } } }).placement.aura.waves).toBe(3);
    expect(resolveRendererSettings().placement).toEqual(DEFAULT_PLACEMENT_SETTINGS);
  });
});

/** A loader with one box model for every plan, and an image. */
function fakeAssets() {
  const geometry = new THREE.BoxGeometry(1, 0.5, 1);
  const material = new THREE.MeshStandardMaterial();
  return {
    geometry,
    material,
    has: () => true,
    want: () => {},
    setSkins: () => {},
    getModel: () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry, material));
      return group;
    },
    getTexture: () => new THREE.Texture(),
    peekTexture: () => new THREE.Texture(),
  };
}

const ghostAt = (x: number, y: number, extra: Partial<HoverState> = {}): HoverState => ({ x, y, valid: true, idle: true, planIndex: 9, orientation: 1, ...extra });
const preview = (tiles: TileRenderer) => (tiles as any).previewContainer as THREE.Group;
const slotCells = (tiles: TileRenderer) => (tiles.getGroup().children[1]!.children as THREE.Mesh[]).map((m) => m.userData.slot);

describe("the tile placed on a slot", () => {
  it("is the tile under a veil; placed, it gets the aura and a solid border, and its slot's own border goes", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setAvailableSlots([{ x: 1, y: 0, fits: true }, { x: 2, y: 0, fits: false }]);
    tiles.setHover(ghostAt(1, 0));
    // A hover: the veil, no aura; the slot keeps its border.
    expect(preview(tiles).children.some((c) => c.userData.veil)).toBe(true);
    expect(preview(tiles).children.some((c) => c.userData.aura)).toBe(false);
    expect(slotCells(tiles)).toHaveLength(2);

    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(preview(tiles).children.some((c) => c.userData.aura)).toBe(true);
    expect(preview(tiles).children.some((c) => c.userData.auraBorder)).toBe(true);
    expect(slotCells(tiles)).toEqual([{ x: 2, y: 0, fits: false }]);

    // Moved to the other slot: that one's border goes, the first comes back.
    tiles.setHover(ghostAt(2, 0, { placed: true }));
    expect(slotCells(tiles)).toEqual([{ x: 1, y: 0, fits: true }]);
    tiles.setHover(null);
    expect(slotCells(tiles)).toHaveLength(2);
    tiles.dispose();
  });

  it("turns red over colorMs when its rotation does not fit, and back", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    const t0 = 1000;
    vi.spyOn(performance, "now").mockReturnValue(t0);
    tiles.setHover(ghostAt(0, 1, { placed: true }));
    const aura = () => (preview(tiles).children.find((c) => c.userData.aura) as THREE.Mesh).material as THREE.ShaderMaterial;
    const yellow = new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.yellow);
    const red = new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.red);
    expect(aura().uniforms.color.value.equals(yellow)).toBe(true);
    tiles.setHover(ghostAt(0, 1, { placed: true, valid: false }));
    // Halfway through the change: between the two.
    tiles.update(t0 + motion.colorMs / 2);
    const mid = aura().uniforms.color.value as THREE.Color;
    expect(mid.r).toBeGreaterThan(Math.min(yellow.r, red.r) - 1e-9);
    expect(mid.equals(yellow) || mid.equals(red)).toBe(false);
    tiles.update(t0 + motion.colorMs);
    for (const k of ["r", "g", "b"] as const) expect(aura().uniforms.color.value[k]).toBeCloseTo(red[k], 6);
    vi.restoreAllMocks();
    tiles.dispose();
  });

  it("asks for frames while its aura moves; none under reduced motion, where the aura is still", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    expect(tiles.update(0).animating).toBe(false);
    tiles.setHover(ghostAt(0, 1));
    // A hover has no aura: once its colour is set, nothing moves.
    expect(tiles.update(performance.now() + 10_000).animating).toBe(false);
    tiles.setHover(ghostAt(0, 1, { placed: true }));
    expect(tiles.update(performance.now() + 10_000).animating).toBe(true);
    tiles.setReducedMotion(true);
    expect(tiles.update(performance.now() + 20_000).animating).toBe(false);
    const aura = (preview(tiles).children.find((c) => c.userData.aura) as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(aura.uniforms.phase.value).toBe(0);
    tiles.dispose();
  });

  it("on confirm: the veil and aura over the placed tile turn green and fade out in confirmMs, then go", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    const t0 = 5000;
    vi.spyOn(performance, "now").mockReturnValue(t0);
    tiles.setHover(ghostAt(3, 0, { placed: true }));
    tiles.setHover(null);
    tiles.setConfirmed({ ...ghostAt(3, 0), key: 7 });
    const placement = tiles.getGroup().children[3]!;
    const confirm = () => placement.children.find((c) => c.children[0]?.userData.confirm)?.children[0];
    expect(confirm()).toBeDefined();
    // The tile's shape under the veil, not the tile: the board draws it.
    const meshes: THREE.Mesh[] = [];
    confirm()!.traverse((o) => o instanceof THREE.Mesh && !o.userData.aura && !o.userData.auraBorder && meshes.push(o));
    expect(meshes.every((m) => m.material instanceof THREE.MeshBasicMaterial)).toBe(true);
    const aura = (confirm()!.children.find((c) => c.userData.aura) as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(tiles.update(t0 + motion.confirmMs / 3).animating).toBe(true);
    const green = new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.green);
    for (const k of ["r", "g", "b"] as const) expect(aura.uniforms.color.value[k]).toBeCloseTo(green[k], 6);
    expect(aura.uniforms.opacity.value).toBeGreaterThan(0);
    // The same confirm again does not start over.
    tiles.setConfirmed({ ...ghostAt(3, 0), key: 7 });
    tiles.update(t0 + motion.confirmMs);
    expect(confirm()).toBeUndefined();
    vi.restoreAllMocks();
    tiles.dispose();
  });

  it("under reduced motion, confirms green at once with a short fade", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setReducedMotion(true);
    const t0 = 100;
    vi.spyOn(performance, "now").mockReturnValue(t0);
    tiles.setConfirmed({ ...ghostAt(0, 1), key: 1 });
    const placement = tiles.getGroup().children[3]!;
    tiles.update(t0 + 1);
    expect(placement.children.length).toBeGreaterThan(0);
    tiles.update(t0 + motion.reducedConfirmMs);
    expect(placement.children.some((c) => c.children[0]?.userData.confirm)).toBe(false);
    vi.restoreAllMocks();
    tiles.dispose();
  });
});

describe("the placement's resources", () => {
  it("draws the grid around the tiles, one shared frame geometry and two materials for every slot", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.updateTiles([{ game_id: 0, id: 1, player_id: "0x0", plan: 9, orientation: 1, x: 0, y: 0, worldX: 0, worldZ: 0 }]);
    const placement = tiles.getGroup().children[3]!;
    const grid = placement.children.find((c) => c.userData.grid) as THREE.Mesh;
    expect(grid.visible).toBe(true);
    // The tile and four rings on each side.
    const size = new THREE.Box3().setFromObject(grid).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo((1 + 2 * GRID_RINGS) * TILE_SIZE, 6);
    tiles.setAvailableSlots(Array.from({ length: 12 }, (_, i) => ({ x: i + 1, y: 0, fits: i % 2 === 0 })));
    const slots = tiles.getGroup().children[1]!.children as THREE.Mesh[];
    expect(new Set(slots.map((m) => m.geometry)).size).toBe(1);
    expect(new Set(slots.map((m) => m.material)).size).toBe(2);
    const spies = [grid.geometry, grid.material as THREE.Material, slots[0]!.geometry, slots[0]!.material as THREE.Material, slots[1]!.material as THREE.Material].map((r) =>
      vi.spyOn(r, "dispose"),
    );
    tiles.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("makes a veil of a model that shares its geometry, without its outlines or shadows", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.castShadow = true;
    mesh.add(createOutline(buildEdgesGeometry(geometry), createOutlineMaterial()));
    const model = new THREE.Group().add(mesh);
    const material = new THREE.MeshBasicMaterial();
    const veil = veilOf(model, material);
    const meshes: THREE.Mesh[] = [];
    veil.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.geometry).toBe(geometry);
    expect(meshes[0]!.material).toBe(material);
    expect(meshes[0]!.castShadow).toBe(false);
    expect(meshes.some(isOutline)).toBe(false);
    // The model keeps its own.
    expect(mesh.material).not.toBe(material);
    expect(mesh.children.some(isOutline)).toBe(true);
  });

  it("builds the aura from the cell's edge outward and up, with no hard far edge", () => {
    const geometry = createAuraGeometry(0.45, 0.2);
    const v = geometry.getAttribute("aV");
    const wall = geometry.getAttribute("aWall");
    // Four ground trapezoids and four walls, four corners each.
    expect(v.count).toBe(32);
    let walls = 0;
    for (let i = 0; i < v.count; i++) {
      expect([0, 1]).toContain(v.getX(i));
      walls += wall.getX(i);
    }
    expect(walls).toBe(16);
    const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute("position") as THREE.BufferAttribute);
    expect(box.max.y).toBeCloseTo(0.3 + 0.45 * TILE_SIZE, 6);
    expect(box.max.x).toBeCloseTo(TILE_SIZE / 2 + 0.2 * TILE_SIZE, 6);
  });

  it("disposes what it made, once", () => {
    const placement = new PlacementRenderer();
    placement.setTileCells([{ x: 0, y: 0 }]);
    placement.setSlots([{ x: 1, y: 0 }]);
    const container = new THREE.Group();
    placement.dressGhost(container, new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())), { x: 1, y: 0 }, true, true, 0);
    const owned = new Set<{ dispose(): void }>();
    for (const root of [placement.group, container]) {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && !(o.material instanceof THREE.MeshStandardMaterial)) {
          owned.add(o.material as THREE.Material);
          if (o.userData.aura || o.userData.grid || o.userData.auraBorder) owned.add(o.geometry);
        }
      });
    }
    const spies = [...owned].map((r) => vi.spyOn(r, "dispose"));
    placement.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
