import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_PLACEMENT_SETTINGS,
  GRID_RINGS,
  PLATE_GAP_VOXELS,
  PLATE_Y,
  PlacementRenderer,
  colorProgress,
  confirmProgress,
  createPlateGeometry,
  gridFade,
  gridLineCoverage,
  gridLineOpacityAt,
  gridRingOpacity,
  pendingPlateScale,
  pendingPulse,
  tintEaseMs,
  tintForKind,
  tintKindOf,
  plateShapeOf,
  plateStateOf,
  resolvePlacementSettings,
  ringField,
  type PlacementSlot,
} from "../src/core/placement";
import { GROUND_VOXELS } from "../src/core/feature-codes";
import { DEFAULT_OUTLINE_SETTINGS, VOXEL_SIZE, outlineFade } from "../src/core/outlines";
import { resolveRendererSettings } from "../src/core/settings";
import { TileRenderer } from "../src/core/TileRenderer";
import { TILE_SIZE } from "../src/core/types";
import type { HoverState } from "../src/core/types";

const { motion } = DEFAULT_PLACEMENT_SETTINGS;

describe("the grid's ring fade (a setting, off by default since PLATES)", () => {
  it("is off by default", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.grid.enabled).toBe(false);
    const placement = new PlacementRenderer();
    placement.setTileCells([{ x: 0, y: 0 }]);
    expect(placement.group.children.some((c) => c.userData.grid)).toBe(false);
    placement.dispose();
  });


  it("is full at ring 1, half at ring 2, almost gone at ring 3, and off from ring 4 (SLOTS2)", () => {
    const rings = DEFAULT_PLACEMENT_SETTINGS.grid.rings;
    expect(rings).toEqual([1, 0.5, 0.1]);
    expect(gridRingOpacity(0)).toBe(1);
    expect(gridRingOpacity(1)).toBe(1);
    expect(gridRingOpacity(2)).toBe(0.5);
    expect(gridRingOpacity(3)).toBe(rings[2]);
    expect(gridRingOpacity(GRID_RINGS)).toBe(0);
    expect(gridRingOpacity(9)).toBe(0);
    expect(rings[2]).toBeGreaterThan(0);
    expect(rings[2]).toBeLessThanOrEqual(0.15);
  });

  it("draws each line at the farther ring of its two cells: 1 at the board's edge, 0.5, 0.1, then 0; linear along a line", () => {
    const rings = DEFAULT_PLACEMENT_SETTINGS.grid.rings;
    const field = ringField([{ x: 0, y: 0 }])!;
    // On the vertical lines east of the tile, on its row: x = 0.5 (tile and ring 1), 1.5 (ring 1 and 2), 2.5, 3.5, 4.5.
    expect(gridLineOpacityAt(field, 0.5, 0)).toBe(1);
    expect(gridLineOpacityAt(field, 1.5, 0)).toBe(rings[1]);
    expect(gridLineOpacityAt(field, 2.5, 0)).toBe(rings[2]);
    expect(gridLineOpacityAt(field, 3.5, 0)).toBe(0);
    expect(gridLineOpacityAt(field, 4.5, 0)).toBe(0);
    // Inside a ring, the lines between two of its cells take that ring: ring 1's full, ring 2's half, ring 3's almost gone.
    expect(gridLineOpacityAt(field, 0.5, 1)).toBe(1);
    expect(gridLineOpacityAt(field, 1.5, 2)).toBe(rings[1]);
    expect(gridLineOpacityAt(field, 2.5, 3)).toBe(rings[2]);
    // Nothing beyond ring 3: every line between cells of ring 4 or more is 0.
    for (let y = -4; y <= 4; y += 0.25) expect(gridLineOpacityAt(field, 3.5, y)).toBe(0);
    // The horizontal lines north of it, the same (the grid is square).
    expect(gridLineOpacityAt(field, 0, -1.5)).toBe(rings[1]);
    expect(gridLineOpacityAt(field, 0, -2.5)).toBe(rings[2]);
    // Along the line x = 1.5, from the row of ring 1 (y = 1) to the row of ring 2 (y = 2): linear.
    expect(gridLineOpacityAt(field, 1.5, 1)).toBe(rings[1]);
    expect(gridLineOpacityAt(field, 2.5, 2)).toBe(rings[2]);
    expect(gridLineOpacityAt(field, 2.5, 2.5)).toBeCloseTo(rings[2], 9);
    expect(gridLineOpacityAt(field, 0.5, 1.5)).toBeCloseTo((1 + rings[1]) / 2, 9);
    // Between lines: the nearest line, as the shader picks it (floor(x + 1), the line at L - 0.5).
    expect(gridLineOpacityAt(field, 1.2, 0)).toBe(rings[1]); // nearest x = 1.5
    expect(gridLineOpacityAt(field, 0.8, 0)).toBe(1); // nearest x = 0.5
    expect(gridLineOpacityAt(field, 2.3, 0)).toBe(rings[2]); // nearest x = 2.5, not 1.5
    expect(gridLineOpacityAt(field, 1.7, 0)).toBe(rings[1]); // nearest x = 1.5
    expect(gridLineOpacityAt(field, 0, 2.4)).toBe(rings[2]); // nearest y = 2.5
    // Nearer a horizontal line than a vertical one: the horizontal one. At (0, 1.45) the line y = 1.5 (rings 1 and 2) is
    // 0.05 away and reads 0.5; the vertical x = 0.5, 0.5 away, would read 1 * 0.55 + 0.5 * 0.45 there.
    expect(gridLineOpacityAt(field, 0, 1.45)).toBe(rings[1]);
    expect(gridLineOpacityAt(field, 0.47, 1.4)).toBeCloseTo(1 * 0.6 + rings[1] * 0.4, 9); // x = 0.5, 0.03 away
  });

  it("draws a hairline: about one device px at every zoom, antialiased, the same light whatever its offset", () => {
    const width = DEFAULT_PLACEMENT_SETTINGS.grid.widthDevicePx;
    expect(width).toBe(1);
    // The coverage of the pixels across a line, for a line at any sub-pixel offset from their centres: it never reaches
    // further than one px each side, and its sum (the light the line puts on screen) is the same, so a pan does not
    // flicker. Device px, so the zoom does not enter it: the same hairline zoomed in and out.
    for (let offset = 0; offset < 1; offset += 0.05) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const c = gridLineCoverage(Math.abs(k + offset), width);
        if (Math.abs(k + offset) >= 1) expect(c).toBe(0);
        sum += c;
      }
      expect(sum).toBeCloseTo(width, 9);
    }
    expect(gridLineCoverage(0)).toBe(1);
    expect(gridLineCoverage(0.5)).toBe(0.5);
    // A wider hairline, the same rule.
    expect(gridLineCoverage(0, 2)).toBe(1);
    expect(gridLineCoverage(1.25, 2)).toBeCloseTo(0.25, 9);
  });

  it("does not fade on zoom unless asked, and then on the outlines' curve, at the far end only", () => {
    const S = 60;
    const grid = DEFAULT_PLACEMENT_SETTINGS.grid;
    expect(grid.farFade).toBe(false);
    for (const px of [5, 0.5 * S, 0.85 * S, S, 2 * S, 30 * S]) expect(gridFade(px, S, grid, DEFAULT_OUTLINE_SETTINGS)).toBe(1);
    const far = { ...grid, farFade: true };
    // Fully on from the start (the opening view by default), off at the outlines' off point, their curve between.
    expect(gridFade(S, S, far, DEFAULT_OUTLINE_SETTINGS)).toBe(1);
    expect(gridFade(2 * S, S, far, DEFAULT_OUTLINE_SETTINGS)).toBe(1);
    expect(gridFade(0.85 * S, S, far, DEFAULT_OUTLINE_SETTINGS)).toBe(0);
    const mid = 0.92 * S;
    expect(gridFade(mid, S, far, DEFAULT_OUTLINE_SETTINGS)).toBe(outlineFade(mid, 0.85 * S, grid.farFadeStart * S, DEFAULT_OUTLINE_SETTINGS.fadeExponent));
    // Through the renderer: the grid's opacity holds at every zoom by default.
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ grid: { enabled: true } }));
    placement.setTileCells([{ x: 0, y: 0 }]);
    const material = () => (placement.group.children.find((c) => c.userData.grid) as THREE.Mesh).material as THREE.ShaderMaterial;
    for (const px of [0.5 * S, S, 10 * S]) {
      placement.setZoom(px, S);
      expect(material().uniforms.opacity.value).toBe(grid.opacity);
      expect(material().uniforms.widthPx.value).toBe(1);
    }
    placement.dispose();
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



describe("the plates' shape (PLACEMENT-TINTS)", () => {
  it("is flat, inset in its cell, in voxels: the defaults", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.plates).toEqual({ enabled: true, gap: 4, radius: 3, opacity: 0.55, invalidOpacity: 0.2, hideUnderTile: true, pendingColor: "#f0bf5b", pendingOpacity: 0, pendingOutset: 1.5 });
    // A smaller corner than the slab's 5 voxels, and more transparent plates (0.9 and 0.45 before).
    expect(DEFAULT_PLACEMENT_SETTINGS.plates.radius).toBeLessThan(5);
    expect(DEFAULT_PLACEMENT_SETTINGS.plates.opacity).toBeLessThan(0.9);
    expect(DEFAULT_PLACEMENT_SETTINGS.plates.invalidOpacity).toBeLessThan(0.45);
    const shape = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates);
    expect(shape.size).toBeCloseTo(TILE_SIZE - 4 * VOXEL_SIZE, 9);
    expect(shape.radius).toBeCloseTo(3 * VOXEL_SIZE, 9);
    const box = createPlateGeometry(shape).boundingBox!;
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBe(0);
    expect(box.max.x - box.min.x).toBeCloseTo(shape.size, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(shape.size, 6);
  });

  it("has rounded corners: the corner is cut, the middle of a side reaches the edge", () => {
    const shape = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates);
    const position = createPlateGeometry(shape).getAttribute("position");
    const half = shape.size / 2;
    let corner = 0;
    let side = 0;
    for (let i = 0; i < position.count; i++) {
      const [x, z] = [position.getX(i), position.getZ(i)];
      corner = Math.max(corner, Math.min(Math.abs(x), Math.abs(z)));
      side = Math.max(side, Math.abs(x));
    }
    expect(corner).toBeCloseTo(half - shape.radius + shape.radius * Math.SQRT1_2, 6);
    expect(side).toBeCloseTo(half, 6);
  });

  it("is one face looking up: every triangle's winding agrees with its normals, nothing faces down or sideways", () => {
    for (const plates of [DEFAULT_PLACEMENT_SETTINGS.plates, { gap: 2, radius: 0 }, { gap: 8, radius: 12 }]) {
      const geometry = createPlateGeometry(plateShapeOf(plates));
      const p = geometry.getAttribute("position");
      const n = geometry.getAttribute("normal");
      const index = geometry.getIndex()!;
      const v = (i: number) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      let faces = 0;
      for (let t = 0; t < index.count; t += 3) {
        const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
        const face = v(b).sub(v(a)).cross(v(c).sub(v(a)));
        if (face.lengthSq() < 1e-14) continue;
        expect(face.normalize().y).toBeCloseTo(1, 6);
        faces++;
      }
      expect(faces).toBeGreaterThan(0);
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBe(1);
    }
  });

  it("leaves a gap between two neighbouring plates at every setting the controls allow, and beyond them", () => {
    const gaps: number[] = [];
    for (let g = PLATE_GAP_VOXELS.min; g <= PLATE_GAP_VOXELS.max; g += 0.25) gaps.push(g);
    gaps.push(0, -4, Number.NaN, 0.1, 1000);
    for (const gap of gaps) {
      for (const radius of [0, 3, 40]) {
        const box = createPlateGeometry(plateShapeOf({ gap, radius })).boundingBox!;
        for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
          const other = box.clone().translate(new THREE.Vector3(dx * TILE_SIZE, 0, dz * TILE_SIZE));
          expect(box.intersectsBox(other)).toBe(false);
        }
        expect(TILE_SIZE - (box.max.x - box.min.x)).toBeGreaterThanOrEqual(PLATE_GAP_VOXELS.min * VOXEL_SIZE - 1e-9);
      }
    }
    expect(PLATE_GAP_VOXELS.min).toBeGreaterThan(0);
  });

  it("lies at the tiles' bottom, not the ground's top, the grid with it (#588)", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 2, y: 1 }], 0);
    const height = instances(placement).plateAt(2, 1)!.height;
    expect(height).toBeCloseTo(PLATE_Y, 6);
    // Level with a model's foot (y 0) to a tenth of a voxel, far under the ground's top (4 voxels).
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(0.1 * VOXEL_SIZE);
    expect(height).toBeLessThan(GROUND_VOXELS * VOXEL_SIZE);
    placement.setSettings(resolvePlacementSettings({ grid: { enabled: true } }));
    placement.setTileCells([{ x: 0, y: 0 }]);
    const grid = placement.group.children.find((c) => c.userData.grid)!;
    expect(grid.position.y).toBeCloseTo(PLATE_Y, 6);
    placement.dispose();
  });
});

function instances(placement: PlacementRenderer) {
  const plate = placement.getPlateMesh()!;
  const m = new THREE.Matrix4();
  const opacity = plate.geometry.getAttribute("aOpacity");
  const plates = Array.from({ length: plate.count }, (_, i) => {
    plate.getMatrixAt(i, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    return { x: Math.round(p.x / TILE_SIZE), y: Math.round(p.z / TILE_SIZE), height: p.y, color: plate.getColorAt(i, new THREE.Color()), opacity: opacity.getX(i) };
  });
  return { plates, plateAt: (x: number, y: number) => plates.find((p) => p.x === x && p.y === y) };
}

const close = (a: THREE.Color, hex: string, digits = 5) => {
  const b = new THREE.Color(hex);
  for (const k of ["r", "g", "b"] as const) expect(a[k]).toBeCloseTo(b[k], digits);
};

const SLOTS: PlacementSlot[] = [{ x: 1, y: 0 }, { x: 2, y: 0, legal: true }, { x: 3, y: 0, legal: false }];

describe("the plates' states", () => {
  it("are playable where some rotation fits and invalid where none does: valid and possible are one", () => {
    expect(plateStateOf({})).toBe("playable");
    expect(plateStateOf({ legal: true })).toBe("playable");
    expect(plateStateOf({ legal: false })).toBe("invalid");
  });

  it("draw one grey for both, the playable a little less transparent than the invalid: their opacity alone differs", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setSlots(SLOTS, 0);
    const { colors, plates } = DEFAULT_PLACEMENT_SETTINGS;
    const { plateAt } = instances(placement);
    close(plateAt(1, 0)!.color, colors.plate);
    close(plateAt(2, 0)!.color, colors.plate);
    close(plateAt(3, 0)!.color, colors.plate);
    expect(plateAt(1, 0)!.opacity).toBeCloseTo(plates.opacity, 6);
    expect(plateAt(2, 0)!.opacity).toBeCloseTo(plates.opacity, 6);
    expect(plateAt(3, 0)!.opacity).toBeCloseTo(plates.invalidOpacity, 6);
    expect(plates.invalidOpacity).toBeLessThan(plates.opacity);
    placement.dispose();
  });

  it("are the app's token: one grey with no hue (#588, no blue left)", () => {
    const { colors } = DEFAULT_PLACEMENT_SETTINGS;
    expect(colors).toEqual({ plate: "#c8c8c8" });
    const grey = new THREE.Color(colors.plate);
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });

  it("is one instanced mesh for the plates, whatever the number of slots, and no aura anywhere", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    for (const count of [1, 12, 80, 200]) {
      tiles.setAvailableSlots(Array.from({ length: count }, (_, i) => ({ x: i + 1, y: 0, legal: i % 3 !== 0 })));
      const empty = tiles.getGroup().children[1]!;
      expect(empty.children).toHaveLength(1);
      const mesh = empty.children[0] as THREE.InstancedMesh;
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.count).toBe(count);
      expect((tiles.getGroup().children[3]!.children as THREE.Object3D[]).filter((c) => c.userData.auras)).toHaveLength(0);
    }
    tiles.dispose();
  });
});

describe("the plates' changes", () => {
  it("ease over 150 ms as a plate changes state, and ask for frames only while they do", () => {
    expect(motion.colorMs).toBe(150);
    const placement = new PlacementRenderer();
    const t0 = 1000;
    placement.setSlots([{ x: 1, y: 0 }], t0);
    expect(placement.update(t0 + motion.colorMs).animating).toBe(true);
    expect(placement.update(t0 + motion.colorMs + 1).animating).toBe(false);
    const t1 = t0 + 1000;
    placement.setSlots([{ x: 1, y: 0, legal: false }], t1);
    expect(placement.update(t1 + motion.colorMs / 2).animating).toBe(true);
    const { plates } = DEFAULT_PLACEMENT_SETTINGS;
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo((plates.opacity + plates.invalidOpacity) / 2, 6);
    expect(placement.update(t1 + motion.colorMs).animating).toBe(true);
    expect(placement.update(t1 + motion.colorMs + 16).animating).toBe(false);
    placement.dispose();
  });

  it("change at once under reduced motion, with no frame asked for", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setSlots([{ x: 1, y: 0 }], 0);
    expect(placement.update(0).animating).toBe(false);
    placement.setSlots([{ x: 1, y: 0, legal: false }], 10);
    expect(placement.update(10).animating).toBe(false);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.invalidOpacity, 6);
    expect(colorProgress(0, motion, true)).toBe(1);
    placement.dispose();
  });

  it("fade a new plate in and a gone one out, then drop it: no pop", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0 }], 0);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBe(0);
    placement.update(motion.colorMs / 2);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.opacity / 2, 6);
    placement.update(motion.colorMs);
    placement.setSlots([], 500);
    placement.update(500 + motion.colorMs / 2);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.opacity / 2, 6);
    placement.update(500 + motion.colorMs);
    expect(placement.getPlateMesh()!.count).toBe(0);
    expect(placement.update(2000).animating).toBe(false);
    placement.dispose();
  });

  it("follow the eased smoothstep", () => {
    expect(colorProgress(0, motion, false)).toBe(0);
    expect(colorProgress(motion.colorMs / 2, motion, false)).toBeCloseTo(0.5, 9);
    expect(colorProgress(motion.colorMs, motion, false)).toBe(1);
  });
});

describe("the tile in hand's tints (PLACEMENT-TINTS)", () => {
  const { tints } = DEFAULT_PLACEMENT_SETTINGS;

  it("defaults to the owner's: no tint at 50 % on a hover, opaque and a faint yellow pending, a green confirm, no rim or aura setting left", () => {
    expect(tints.hoverOpacity).toBe(0.5);
    expect(tints.hoverStrength).toBe(0);
    expect(tintForKind("hover", tints).strength).toBe(0);
    expect(tints.pendingOpacity).toBe(1);
    expect(tintForKind("pending", tints).opacity).toBe(1);
    // #605: a faint yellow (0.4 before read as a yellow filter), held, no frame, no gold plate.
    expect(tints.pendingStrength).toBe(0.12);
    expect(tints.pendingPulseMs).toBe(0);
    expect(tints.pendingEdgeOpacity).toBe(0);
    expect(DEFAULT_PLACEMENT_SETTINGS.plates.pendingOpacity).toBe(0);
    const hue = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).h * 360;
    expect(hue(tints.hoverColor)).toBeGreaterThan(200);
    expect(hue(tints.hoverColor)).toBeLessThan(250);
    expect(hue(tints.pendingColor)).toBeGreaterThan(40);
    expect(hue(tints.pendingColor)).toBeLessThan(60);
    expect(hue(tints.confirmColor)).toBeGreaterThan(100);
    expect(hue(tints.confirmColor)).toBeLessThan(140);
    expect(Object.keys(DEFAULT_PLACEMENT_SETTINGS).sort()).toEqual(["colors", "grid", "motion", "plates", "tints"]);
  });

  it("placed is pending, else hover", () => {
    expect(tintKindOf({ placed: false })).toBe("hover");
    expect(tintKindOf({ placed: true })).toBe("pending");
    expect(tintForKind("hover", tints)).toMatchObject({ opacity: 0.5 });
    expect(tintForKind("pending", tints)).toMatchObject({ opacity: 1 });
  });

  it("eases between looks over 150 ms from where it was, and a newly drawn tile starts at its look", () => {
    const placement = new PlacementRenderer();
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    expect(placement.ghostTint(0)[4]).toBeCloseTo(0.5, 9);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 1000);
    expect(placement.ghostTint(1000)[4]).toBeCloseTo(0.5, 9);
    expect(placement.ghostTint(1000 + motion.colorMs / 2)[4]).toBeCloseTo(0.75, 6);
    expect(placement.update(1000 + motion.colorMs / 2).animating).toBe(true);
    expect(placement.ghostTint(1000 + motion.colorMs)[4]).toBeCloseTo(1, 9);
    placement.update(1000 + motion.colorMs);
    expect(placement.update(1000 + motion.colorMs + 16).animating).toBe(false);
    // Gone, then drawn again elsewhere: no ease from the old look.
    placement.setGhost(null, 3000);
    placement.setGhost({ x: 2, y: 0, kind: "hover" }, 4000);
    expect(placement.ghostTint(4000)[4]).toBeCloseTo(0.5, 9);
    placement.dispose();
  });

  it("eases into each look over its own time: hoverMs, pendingMs", () => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ tints: { pendingMs: 400 } }));
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 1000);
    // 200 ms of a 400 ms ease: halfway.
    expect(placement.ghostTint(1200)[4]).toBeCloseTo(0.75, 6);
    expect(placement.update(1399).animating).toBe(true);
    expect(placement.ghostTint(1400)[4]).toBeCloseTo(1, 9);
    // The default eases are the 150 ms of before.
    expect(DEFAULT_PLACEMENT_SETTINGS.tints.hoverMs).toBe(150);
    expect(tintEaseMs("hover", DEFAULT_PLACEMENT_SETTINGS.tints)).toBe(150);
    placement.dispose();
  });

  it("a tick past the end of an ease still asks for the frame that draws the final tint", () => {
    const placement = new PlacementRenderer();
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    placement.update(0);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 1000);
    // The next tick comes late, after the 150 ms ease: one frame follows, then none.
    expect(placement.update(1000 + motion.colorMs * 10).animating).toBe(true);
    expect(placement.update(1000 + motion.colorMs * 10 + 16).animating).toBe(false);
    placement.dispose();
  });

  it("is instant under reduced motion", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 10);
    expect(placement.ghostTint(10)[4]).toBeCloseTo(1, 9);
    expect(placement.update(10).animating).toBe(false);
    placement.dispose();
  });

  it("hides the plate under the tile in hand, or keeps it by setting", () => {
    for (const hide of [true, false]) {
      const placement = new PlacementRenderer();
      placement.setSettings(resolvePlacementSettings({ plates: { hideUnderTile: hide } }));
      placement.setReducedMotion(true);
      placement.setSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }], 0);
      placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
      const { plateAt } = instances(placement);
      expect(plateAt(1, 0)!.opacity).toBeCloseTo(hide ? 0 : DEFAULT_PLACEMENT_SETTINGS.plates.opacity, 6);
      expect(plateAt(2, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.opacity, 6);
      placement.dispose();
    }
  });

  it("stands on a plate even where no slot was given", () => {
    const placement = new PlacementRenderer();
    placement.setGhost({ x: 4, y: 4, kind: "pending" }, 0);
    expect(instances(placement).plateAt(4, 4)).toBeDefined();
    placement.dispose();
  });

  it("confirms with a green tint that fades to none in confirmMs, then goes", () => {
    const placement = new PlacementRenderer();
    placement.startConfirm({ x: 1, y: 0 }, 0);
    expect(placement.isConfirming()).toBe(true);
    const start = placement.confirmTint(0)!;
    close(new THREE.Color(start.tint.r, start.tint.g, start.tint.b), DEFAULT_PLACEMENT_SETTINGS.tints.confirmColor);
    expect(start.tint.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.tints.confirmOpacity, 9);
    expect(placement.confirmTint(motion.confirmMs / 2)!.tint.opacity).toBeCloseTo(0.5 * DEFAULT_PLACEMENT_SETTINGS.tints.confirmOpacity, 6);
    expect(placement.update(motion.confirmMs / 2).animating).toBe(true);
    expect(placement.update(motion.confirmMs).animating).toBe(true);
    expect(placement.isConfirming()).toBe(false);
    expect(placement.update(motion.confirmMs + 16).animating).toBe(false);
    expect(confirmProgress(motion.confirmMs, motion, false)).toEqual({ opacity: 0, done: true });
    placement.dispose();
  });

  it("fades the confirm briefly under reduced motion", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.startConfirm({ x: 1, y: 0 }, 0);
    expect(placement.confirmTint(motion.reducedConfirmMs)!.done).toBe(true);
    expect(confirmProgress(0, motion, true).opacity).toBe(1);
    placement.dispose();
  });
});

describe("the settings", () => {
  it("take each group's fields over the defaults, and ride in the renderer's settings", () => {
    const s = resolvePlacementSettings({ grid: { opacity: 0.5 }, plates: { gap: 6 }, tints: { hoverOpacity: 0.3 }, motion: { reducedMotion: true } });
    expect(s.grid.opacity).toBe(0.5);
    expect(s.grid.rings).toEqual(DEFAULT_PLACEMENT_SETTINGS.grid.rings);
    expect(s.plates.gap).toBe(6);
    expect(s.plates.radius).toBe(DEFAULT_PLACEMENT_SETTINGS.plates.radius);
    expect(s.tints.hoverOpacity).toBe(0.3);
    expect(s.tints.pendingOpacity).toBe(1);
    expect(s.motion.reducedMotion).toBe(true);
    expect(resolveRendererSettings({ placement: { tints: { pendingOpacity: 0.7 } } }).placement.tints.pendingOpacity).toBe(0.7);
    expect(resolveRendererSettings().placement).toEqual(DEFAULT_PLACEMENT_SETTINGS);
  });

  it("rebuild the plates at a new shape and colour, at once", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0 }], 0);
    placement.setSettings(resolvePlacementSettings({ plates: { gap: 10 }, colors: { plate: "#336699" } }));
    const box = placement.getPlateMesh()!.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(TILE_SIZE - 10 * VOXEL_SIZE, 6);
    close(instances(placement).plateAt(1, 0)!.color, "#336699");
    placement.dispose();
  });

  it("retarget a drawn tile's tint at once", () => {
    const placement = new PlacementRenderer();
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    placement.setSettings(resolvePlacementSettings({ tints: { hoverOpacity: 0.2 } }));
    expect(placement.ghostTint(0)[4]).toBeCloseTo(0.2, 9);
    placement.dispose();
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
const placementOf = (tiles: TileRenderer) => (tiles as any).placement as PlacementRenderer;

describe("the tile renderer's ghost", () => {
  it("is tinted: hover, then pending once placed; moved, the tint follows; gone, none", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setAvailableSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    tiles.setHover(ghostAt(1, 0));
    expect((tiles as any).previewContainer).not.toBeNull();
    expect(placementOf(tiles).getGhost()).toEqual({ x: 1, y: 0, kind: "hover" });
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 1, y: 0, kind: "pending" });
    tiles.setHover(ghostAt(2, 0, { placed: true }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 2, y: 0, kind: "pending" });
    tiles.setHover(null);
    expect(placementOf(tiles).getGhost()).toBeNull();
    tiles.dispose();
  });

  it("draws the ghost translucent behind a depth pre-pass, with no outline: no inner face shows through", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    // The tile material is patched as a tile's is, so the ghost takes its tint.
    const patched = (tiles as any).assets.material as THREE.MeshStandardMaterial;
    patched.onBeforeCompile = () => {};
    patched.customProgramCacheKey = () => "paved-tile";
    tiles.setHover(ghostAt(1, 0));
    const container = (tiles as any).previewContainer as THREE.Group;
    const meshes: THREE.Mesh[] = [];
    container.traverse((c) => c instanceof THREE.Mesh && meshes.push(c));
    // The edge outlines are hidden on a ghost.
    for (const m of meshes.filter((m) => m.userData.outline)) expect(m.visible).toBe(false);
    const colour = meshes.filter((m) => !m.userData.outline &&  (m.material as THREE.Material).transparent && (m.material as THREE.Material).depthWrite === false && (m.material as THREE.Material).colorWrite);
    const depth = meshes.filter((m) => (m.material as THREE.Material).colorWrite === false);
    expect(colour).toHaveLength(1);
    expect(depth).toHaveLength(1);
    expect(depth[0]!.renderOrder).toBeLessThan(colour[0]!.renderOrder);
    expect(depth[0]!.material).toHaveProperty("depthWrite", true);
    expect(depth[0]!.geometry).toBe(colour[0]!.geometry);
    expect((colour[0]!.material as THREE.Material).depthFunc).toBe(THREE.LessEqualDepth);
    tiles.dispose();
  });

  it("applies the tint's uniforms to the ghost's shader, and eases them in update", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    const patched = (tiles as any).assets.material as THREE.MeshStandardMaterial;
    patched.onBeforeCompile = () => {};
    patched.customProgramCacheKey = () => "paved-tile";
    tiles.setHover(ghostAt(1, 0));
    const look = (tiles as any).ghostLooks.hand;
    expect(look.alpha.value).toBeCloseTo(0.5, 6);
    expect(look.mix.value).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.tints.hoverStrength, 6);
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    tiles.update(performance.now() + 10_000);
    expect(look.alpha.value).toBeCloseTo(1, 6);
    tiles.dispose();
  });

  it("hovering a plan with no model and no image yet drops the last ghost's tint", () => {
    const assets = { ...fakeAssets(), has: (key: string) => key !== "missing", peekTexture: () => null };
    const tiles = new TileRenderer(assets as any);
    tiles.setAvailableSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 1, y: 0, kind: "pending" });
    (tiles as any).modelOf = () => null;
    tiles.setHover(ghostAt(2, 0, { placed: true, planIndex: 5 }));
    expect((tiles as any).previewContainer).toBeNull();
    expect(placementOf(tiles).getGhost()).toBeNull();
    tiles.update(performance.now() + 10_000);
    expect(tiles.update(performance.now() + 10_016).animating).toBe(false);
    tiles.dispose();
  });

  it("confirms at a cell: the same confirm again changes nothing, null removes it and its overlay", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    const spy = vi.spyOn(placementOf(tiles), "startConfirm");
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ x: 1, y: 0 });
    expect((tiles as any).confirmContainer).not.toBeNull();
    tiles.setConfirmed(null);
    expect(spy.mock.calls[1]![0]).toBeNull();
    expect(placementOf(tiles).isConfirming()).toBe(false);
    expect((tiles as any).confirmContainer).toBeNull();
    tiles.dispose();
  });

  it("confirms on the placeholder quad while the model is not in: the overlay is tinted too", () => {
    const assets = { ...fakeAssets(), has: () => false };
    const tiles = new TileRenderer(assets as any);
    (tiles as any).modelOf = () => null;
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    expect((tiles as any).confirmContainer).not.toBeNull();
    tiles.dispose();
  });

  it("removes the confirm's overlay when its fade ends", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    tiles.update(performance.now() + 10_000);
    expect((tiles as any).confirmContainer).toBeNull();
    tiles.dispose();
  });
});

describe("the placement's resources", () => {
  it("disposes what it made, once", () => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ grid: { enabled: true } }));
    placement.setTileCells([{ x: 0, y: 0 }]);
    placement.setSlots([{ x: 1, y: 0 }], 0);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 0);
    const plate = placement.getPlateMesh()!;
    const grid = placement.group.children.find((c) => c.userData.grid) as THREE.Mesh;
    const owned = [plate.geometry, plate.material as THREE.Material, grid.geometry, grid.material as THREE.Material];
    const spies = owned.map((r) => vi.spyOn(r, "dispose"));
    placement.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(placement.getPlateMesh()).toBeNull();
  });
});

describe("the pending look's proposals (#605)", () => {
  const pending = (input: Parameters<typeof resolvePlacementSettings>[0], reduced = false) => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings(input));
    placement.setReducedMotion(reduced);
    placement.setSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }], 0);
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 0);
    placement.setGhost({ x: 1, y: 0, kind: "pending" }, 1000);
    return placement;
  };

  it("breathes from 0 to 1 and back over a period, slow at both ends; held with none", () => {
    expect(pendingPulse(0, 2400)).toBeCloseTo(0, 9);
    expect(pendingPulse(1200, 2400)).toBeCloseTo(1, 9);
    expect(pendingPulse(600, 2400)).toBeCloseTo(0.5, 9);
    expect(pendingPulse(2400, 2400)).toBeCloseTo(0, 9);
    expect(pendingPulse(500, 0)).toBe(1);
    expect(pendingPulse(Number.NaN, 2400)).toBe(1);
  });

  it("pulses the pending tint between 0 and its strength, drawing every frame while it does", () => {
    const placement = pending({ tints: { pendingStrength: 0.12, pendingPulseMs: 2400 } });
    expect(placement.isPulsing()).toBe(true);
    expect(placement.ghostTint(1000 + 1200)[3]).toBeCloseTo(0.12, 6);
    expect(placement.ghostTint(1000 + 2400)[3]).toBeCloseTo(0, 6);
    expect(placement.update(1000 + 60_000).animating).toBe(true);
    // Its target, as the settings give it.
    expect(placement.ghostTint(Number.NaN)[3]).toBeCloseTo(0.12, 6);
    // A hover does not pulse, and render on demand holds again.
    placement.setGhost({ x: 1, y: 0, kind: "hover" }, 70_000);
    placement.update(70_000 + 200);
    expect(placement.update(70_000 + 300).animating).toBe(false);
    placement.dispose();
  });

  it("holds the faint tint under reduced motion: no pulse, no frame", () => {
    const placement = pending({ tints: { pendingStrength: 0.12, pendingPulseMs: 2400 } }, true);
    expect(placement.isPulsing()).toBe(false);
    expect(placement.ghostTint(1000 + 2400)[3]).toBeCloseTo(0.12, 6);
    placement.update(1001);
    expect(placement.update(1002).animating).toBe(false);
    placement.dispose();
  });

  it("carries the frame's opacity in the tint: 0 on a hover, the setting's once pending", () => {
    const placement = pending({ tints: { pendingEdgeOpacity: 0.9 } });
    expect(placement.ghostTint(Number.NaN)[5]).toBeCloseTo(0.9, 6);
    expect(tintForKind("hover", resolvePlacementSettings({ tints: { pendingEdgeOpacity: 0.9 } }).tints).edge).toBe(0);
    placement.dispose();
  });

  it("draws the plate under a pending tile gold and wider than the tile, within the gap; grey and hidden by default", () => {
    const plain = pending({});
    plain.update(3000);
    expect(instances(plain).plateAt(1, 0)!.opacity).toBe(0);
    plain.dispose();
    const gold = pending({ plates: { pendingOpacity: 0.9 } });
    gold.update(3000);
    const drawn = instances(gold);
    const plate = drawn.plateAt(1, 0)!;
    expect(plate.opacity).toBeCloseTo(0.9, 6);
    close(plate.color, "#f0bf5b");
    const m = new THREE.Matrix4();
    const mesh = gold.getPlateMesh()!;
    const index = drawn.plates.indexOf(plate);
    mesh.getMatrixAt(index, m);
    const scale = new THREE.Vector3().setFromMatrixScale(m);
    const side = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates).size * scale.x;
    // 1.5 voxels past each edge of the tile, under the gap's half (2 voxels): it never reaches a neighbour's plate.
    expect(side).toBeCloseTo(TILE_SIZE + 3 * VOXEL_SIZE, 6);
    expect(scale.y).toBe(1);
    // The neighbour stays grey, at its own size.
    close(instances(gold).plateAt(2, 0)!.color, DEFAULT_PLACEMENT_SETTINGS.colors.plate);
    // A hover over it: the plate hidden again.
    gold.setGhost({ x: 1, y: 0, kind: "hover" }, 5000);
    gold.update(5000 + 1000);
    expect(instances(gold).plateAt(1, 0)!.opacity).toBeCloseTo(0, 6);
    gold.dispose();
  });

  it("keeps the gold plate's outset within the gap", () => {
    const plates = DEFAULT_PLACEMENT_SETTINGS.plates;
    const size = plateShapeOf(plates).size;
    expect(pendingPlateScale({ ...plates, pendingOutset: 10 }) * size).toBeCloseTo(TILE_SIZE + 2 * 1.5 * VOXEL_SIZE, 6);
    expect(pendingPlateScale({ ...plates, pendingOutset: -1 }) * size).toBeCloseTo(TILE_SIZE, 6);
    expect(pendingPlateScale({ ...plates, gap: 8, pendingOutset: 2 }) * plateShapeOf({ gap: 8, radius: 3 }).size).toBeCloseTo(TILE_SIZE + 4 * VOXEL_SIZE, 6);
  });

  it("shows the gold frame on the pending tile only, with the outlines' stroke times its width, and disposes it", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setPlacementSettings(resolvePlacementSettings({ tints: { pendingEdgeOpacity: 1, pendingEdgeWidth: 2, pendingMs: 0 }, motion: { colorMs: 0 } }), DEFAULT_OUTLINE_SETTINGS);
    tiles.setOutlineStroke({ width: 1.5, opacity: 0.8 });
    tiles.setHover(ghostAt(1, 0));
    const frame = (tiles as any).pendingEdge as THREE.Mesh;
    expect(frame.userData.outline).toBe(true);
    expect(frame.visible).toBe(false);
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    tiles.update(performance.now() + 1000);
    expect(frame.visible).toBe(true);
    expect(frame.parent?.parent).toBe((tiles as any).previewContainer.parent);
    const material = frame.material as THREE.ShaderMaterial;
    expect(material).not.toBe((tiles as any).edgeMaterial);
    expect(material.uniforms.linewidth.value).toBeCloseTo(3, 6);
    expect(material.uniforms.opacity.value).toBeCloseTo(0.8, 6);
    const spies = [vi.spyOn(frame.geometry, "dispose"), vi.spyOn(material, "dispose")];
    tiles.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
