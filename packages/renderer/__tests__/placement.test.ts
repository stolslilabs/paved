import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_PLACEMENT_SETTINGS,
  GRID_RINGS,
  PLATE_GAP_VOXELS,
  PlacementRenderer,
  auraAt,
  colorProgress,
  confirmProgress,
  createPlateGeometry,
  gridFade,
  gridLineCoverage,
  gridLineOpacityAt,
  gridRingOpacity,
  placementTone,
  plateShapeOf,
  plateStateOf,
  resolvePlacementSettings,
  ringField,
  type PlacementSlot,
} from "../src/core/placement";
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


describe("the plates' shape (PLATES)", () => {
  it("is a low slab inset in its cell, in voxels: the defaults", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.plates).toEqual({ enabled: true, gap: 4, height: 2, radius: 5, bevel: 1, opacity: 0.9, invalidOpacity: 0.45 });
    const shape = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates);
    expect(shape.size).toBeCloseTo(TILE_SIZE - 4 * VOXEL_SIZE, 9);
    expect(shape.height).toBeCloseTo(2 * VOXEL_SIZE, 9);
    expect(shape.radius).toBeCloseTo(5 * VOXEL_SIZE, 9);
    expect(shape.bevel).toBeCloseTo(VOXEL_SIZE, 9);
    const box = createPlateGeometry(shape).boundingBox!;
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBeCloseTo(shape.height, 6);
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
    // The farthest point along the diagonal is the arc's: (half - r) + r cos 45°.
    expect(corner).toBeCloseTo(half - shape.radius + shape.radius * Math.SQRT1_2, 6);
    expect(side).toBeCloseTo(half, 6);
  });

  it("faces outward and up, with smooth normals: every triangle's winding agrees with its vertices' normals", () => {
    for (const plates of [DEFAULT_PLACEMENT_SETTINGS.plates, { gap: 2, height: 4, radius: 0, bevel: 0 }, { gap: 8, height: 1, radius: 12, bevel: 3 }]) {
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
        const normal = new THREE.Vector3(n.getX(a) + n.getX(b) + n.getX(c), n.getY(a) + n.getY(b) + n.getY(c), n.getZ(a) + n.getZ(b) + n.getZ(c));
        expect(face.dot(normal)).toBeGreaterThan(0);
        faces++;
      }
      expect(faces).toBeGreaterThan(0);
      // No bottom face: nothing faces down.
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("leaves a gap between two neighbouring plates at every setting the controls allow, and beyond them", () => {
    const gaps: number[] = [];
    for (let g = PLATE_GAP_VOXELS.min; g <= PLATE_GAP_VOXELS.max; g += 0.25) gaps.push(g);
    // Out of the controls' range too: a 0, a negative, a non-number, a huge gap, all bounded.
    gaps.push(0, -4, Number.NaN, 0.1, 1000);
    for (const gap of gaps) {
      for (const radius of [0, 5, 40]) {
        for (const height of [0.5, 2, 6]) {
          const shape = plateShapeOf({ gap, height, radius, bevel: 1 });
          const box = createPlateGeometry(shape).boundingBox!;
          // Two plates a cell apart (side by side, and diagonally): the space between them is at least the least gap.
          for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
            const other = box.clone().translate(new THREE.Vector3(dx * TILE_SIZE, 0, dz * TILE_SIZE));
            expect(box.intersectsBox(other)).toBe(false);
          }
          expect(TILE_SIZE - (box.max.x - box.min.x)).toBeGreaterThanOrEqual(PLATE_GAP_VOXELS.min * VOXEL_SIZE - 1e-9);
        }
      }
    }
    expect(PLATE_GAP_VOXELS.min).toBeGreaterThan(0);
  });

  it("keeps the same inset under the placed tile: the plate under it is the same shape", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 0, y: 0 }]);
    placement.setGhost({ x: 0, y: 0, fits: true }, 0);
    const box = placement.getPlateMesh()!.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates).size, 6);
    placement.dispose();
  });
});

describe("the plates' aura", () => {
  const shape = plateShapeOf(DEFAULT_PLACEMENT_SETTINGS.plates);
  const falloff = DEFAULT_PLACEMENT_SETTINGS.aura.falloff * VOXEL_SIZE;

  it("over a plate: full inside, half on its edge, nothing past half the falloff, and no step anywhere", () => {
    expect(auraAt(0, 0, shape, falloff, 0)).toBe(1);
    expect(auraAt(shape.size / 2, 0, shape, falloff, 0)).toBeCloseTo(0.5, 6);
    expect(auraAt(shape.size / 2 + falloff / 2, 0, shape, falloff, 0)).toBe(0);
    // The default falloff keeps a plate's aura within its own cell.
    expect(shape.size / 2 + falloff / 2).toBeLessThanOrEqual(TILE_SIZE / 2 + 1e-9);
    let last = auraAt(0, 0, shape, falloff, 0);
    for (let x = 0; x <= TILE_SIZE; x += VOXEL_SIZE / 20) {
      const a = auraAt(x, 0.3 * x, shape, falloff, 0);
      expect(Math.abs(a - last)).toBeLessThan(0.05);
      last = a;
    }
  });

  it("placed: a rim on the tile's edge, falling off both ways, the tile's middle left alone", () => {
    const f = DEFAULT_PLACEMENT_SETTINGS.aura.placedFalloff * VOXEL_SIZE;
    expect(auraAt(TILE_SIZE / 2, 0, shape, f, 1)).toBeCloseTo(1, 6);
    expect(auraAt(0, 0, shape, f, 1)).toBeLessThan(1e-6);
    expect(auraAt(TILE_SIZE / 2 + f, 0, shape, f, 1)).toBeLessThan(0.02);
    expect(auraAt(TILE_SIZE / 2 - f, 0, shape, f, 1)).toBeLessThan(0.02);
  });
});

/** The plates' instances: each one's cell, colour, opacity, and its aura (strength, falloff, placed) when it has one. */
function instances(placement: PlacementRenderer) {
  const plate = placement.getPlateMesh()!;
  const aura = placement.getAuraMesh()!;
  const m = new THREE.Matrix4();
  const at = (mesh: THREE.InstancedMesh, i: number) => {
    mesh.getMatrixAt(i, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    return { x: Math.round(p.x / TILE_SIZE), y: Math.round(p.z / TILE_SIZE), height: p.y };
  };
  const opacity = plate.geometry.getAttribute("aOpacity");
  const plates = Array.from({ length: plate.count }, (_, i) => ({ ...at(plate, i), color: plate.getColorAt(i, new THREE.Color()), opacity: opacity.getX(i) }));
  const attr = aura.geometry.getAttribute("aAura");
  const auras = Array.from({ length: aura.count }, (_, i) => ({ ...at(aura, i), color: aura.getColorAt(i, new THREE.Color()), strength: attr.getX(i), falloff: attr.getY(i), placed: attr.getZ(i) }));
  return { plates, auras, plateAt: (x: number, y: number) => plates.find((p) => p.x === x && p.y === y), auraAt: (x: number, y: number) => auras.find((a) => a.x === x && a.y === y) };
}

const close = (a: THREE.Color, hex: string, digits = 5) => {
  const b = new THREE.Color(hex);
  for (const k of ["r", "g", "b"] as const) expect(a[k]).toBeCloseTo(b[k], digits);
};

const SLOTS: PlacementSlot[] = [
  { x: 1, y: 0, fits: true },
  { x: 2, y: 0, fits: false },
  { x: 3, y: 0, legal: false, fits: false },
];

describe("the plates' states", () => {
  it("are valid where the current rotation fits, possible where another does, invalid where none does", () => {
    expect(plateStateOf({})).toBe("valid");
    expect(plateStateOf({ fits: true })).toBe("valid");
    expect(plateStateOf({ fits: false })).toBe("possible");
    expect(plateStateOf({ legal: false })).toBe("invalid");
    expect(plateStateOf({ legal: false, fits: true })).toBe("invalid");
  });

  it("draw the base plate, the aura over a valid one, and the greyscale, more transparent invalid one", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setSlots(SLOTS, 0);
    const { colors, plates, aura } = DEFAULT_PLACEMENT_SETTINGS;
    const { plateAt, auras } = instances(placement);
    close(plateAt(1, 0)!.color, colors.plate);
    close(plateAt(2, 0)!.color, colors.plate);
    close(plateAt(3, 0)!.color, colors.invalid);
    expect(plateAt(1, 0)!.opacity).toBeCloseTo(plates.opacity, 6);
    expect(plateAt(3, 0)!.opacity).toBeCloseTo(plates.invalidOpacity, 6);
    expect(plates.invalidOpacity).toBeLessThan(plates.opacity);
    // One aura, over the valid plate, white and above its top.
    expect(auras).toHaveLength(1);
    expect(auras[0]).toMatchObject({ x: 1, y: 0, placed: 0 });
    expect(auras[0]!.strength).toBeCloseTo(aura.intensity, 6);
    close(auras[0]!.color, colors.aura);
    expect(auras[0]!.height).toBeCloseTo((plates.height + aura.height) * VOXEL_SIZE, 6);
    placement.dispose();
  });

  it("are the app's tokens: a pale neutral blue, a grey with no hue, a near white; the red and green of SLOTS", () => {
    const { colors } = DEFAULT_PLACEMENT_SETTINGS;
    expect(colors).toEqual({ plate: "#b7ccdc", invalid: "#929292", aura: "#f5f9fc", red: "#f85e4d", green: "#6eca6f" });
    const hsl = new THREE.Color(colors.plate).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
    expect(hsl.h * 360).toBeGreaterThan(190);
    expect(hsl.h * 360).toBeLessThan(230);
    expect(hsl.l).toBeGreaterThan(0.6);
    const grey = new THREE.Color(colors.invalid);
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });

  it("is one instanced mesh for the plates and one for the auras, whatever the number of slots", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    for (const count of [1, 12, 80, 200]) {
      tiles.setAvailableSlots(Array.from({ length: count }, (_, i) => ({ x: i + 1, y: 0, fits: i % 2 === 0, legal: i % 3 !== 0 })));
      const empty = tiles.getGroup().children[1]!;
      expect(empty.children).toHaveLength(1);
      const mesh = empty.children[0] as THREE.InstancedMesh;
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.count).toBe(count);
      const auras = (tiles.getGroup().children[3]!.children as THREE.Object3D[]).filter((c) => c.userData.auras);
      expect(auras).toHaveLength(1);
    }
    tiles.dispose();
  });
});

describe("the plates' changes", () => {
  it("ease over 150 ms as the tile in hand rotates, and ask for frames only while they do", () => {
    expect(motion.colorMs).toBe(150);
    const placement = new PlacementRenderer();
    const t0 = 1000;
    placement.setSlots([{ x: 1, y: 0, fits: true }], t0);
    expect(placement.update(t0 + motion.colorMs).animating).toBe(true);
    expect(placement.update(t0 + motion.colorMs + 1).animating).toBe(false);
    // Turned: the plate is possible now, its aura fades out.
    const t1 = t0 + 1000;
    placement.setSlots([{ x: 1, y: 0, fits: false }], t1);
    expect(placement.update(t1 + motion.colorMs / 2).animating).toBe(true);
    const half = instances(placement).auraAt(1, 0)!.strength;
    expect(half).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.aura.intensity / 2, 6);
    // Its end is drawn once more, then nothing moves.
    expect(placement.update(t1 + motion.colorMs).animating).toBe(true);
    expect(instances(placement).auraAt(1, 0)).toBeUndefined();
    expect(placement.update(t1 + motion.colorMs + 16).animating).toBe(false);
    placement.dispose();
  });

  it("change at once under reduced motion, with no frame asked for", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setSlots([{ x: 1, y: 0, fits: true }], 0);
    expect(placement.update(0).animating).toBe(false);
    placement.setSlots([{ x: 1, y: 0, legal: false }], 10);
    expect(placement.update(10).animating).toBe(false);
    close(instances(placement).plateAt(1, 0)!.color, DEFAULT_PLACEMENT_SETTINGS.colors.invalid);
    expect(colorProgress(0, motion, true)).toBe(1);
    placement.dispose();
  });

  it("fade a new plate in and a gone one out, then drop it: no pop", () => {
    const placement = new PlacementRenderer();
    const t0 = 0;
    placement.setSlots([{ x: 1, y: 0, fits: false }], t0);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBe(0);
    placement.update(t0 + motion.colorMs / 2);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.opacity / 2, 6);
    placement.update(t0 + motion.colorMs);
    placement.setSlots([], t0 + 500);
    placement.update(t0 + 500 + motion.colorMs / 2);
    expect(instances(placement).plateAt(1, 0)!.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.plates.opacity / 2, 6);
    placement.update(t0 + 500 + motion.colorMs);
    expect(placement.getPlateMesh()!.count).toBe(0);
    expect(placement.update(t0 + 2000).animating).toBe(false);
    placement.dispose();
  });

  it("follow the eased smoothstep, from the value they had when the change came", () => {
    expect(colorProgress(0, motion, false)).toBe(0);
    expect(colorProgress(motion.colorMs / 2, motion, false)).toBeCloseTo(0.5, 9);
    expect(colorProgress(motion.colorMs, motion, false)).toBe(1);
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0, fits: true }], 0);
    placement.update(1000);
    placement.setSlots([{ x: 1, y: 0, fits: false }], 1000);
    // Turned back before the end: it eases back from where it was, not from the end.
    placement.update(1000 + motion.colorMs / 2);
    placement.setSlots([{ x: 1, y: 0, fits: true }], 1000 + motion.colorMs / 2);
    placement.update(1000 + motion.colorMs / 2);
    expect(instances(placement).auraAt(1, 0)!.strength).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.aura.intensity / 2, 6);
    placement.dispose();
  });
});

describe("the tile placed on a plate", () => {
  it("is white while its rotation fits, red while it does not: its plate tinted, its aura a rim at the tiles' ground top", () => {
    expect(placementTone(true)).toBe("aura");
    expect(placementTone(false)).toBe("red");
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setSlots(SLOTS, 0);
    placement.setGhost({ x: 1, y: 0, fits: true }, 0);
    const { colors, aura } = DEFAULT_PLACEMENT_SETTINGS;
    let rim = instances(placement).auraAt(1, 0)!;
    expect(rim.placed).toBe(1);
    expect(rim.strength).toBeCloseTo(aura.placedIntensity, 6);
    expect(rim.falloff).toBeCloseTo(aura.placedFalloff * VOXEL_SIZE, 6);
    // Just over a tile's ground (4 voxels): over its own and its neighbours', under their features.
    expect(rim.height).toBeCloseTo(4.5 * VOXEL_SIZE, 6);
    close(rim.color, colors.aura);
    close(instances(placement).plateAt(1, 0)!.color, colors.plate);
    placement.setGhost({ x: 1, y: 0, fits: false }, 10);
    rim = instances(placement).auraAt(1, 0)!;
    close(rim.color, colors.red);
    close(instances(placement).plateAt(1, 0)!.color, colors.red);
    // The other plates keep their states.
    close(instances(placement).plateAt(3, 0)!.color, colors.invalid);
    placement.setGhost(null, 20);
    expect(instances(placement).auraAt(1, 0)!.placed).toBe(0);
    placement.dispose();
  });

  it("turns red over 150 ms, between the two colours halfway", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0 }], 0);
    placement.setGhost({ x: 1, y: 0, fits: true }, 0);
    placement.update(1000);
    placement.setGhost({ x: 1, y: 0, fits: false }, 1000);
    placement.update(1000 + motion.colorMs / 2);
    const mid = instances(placement).auraAt(1, 0)!.color;
    const [white, red] = [new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.aura), new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.red)];
    expect(mid.g).toBeCloseTo((white.g + red.g) / 2, 5);
    placement.update(1000 + motion.colorMs);
    close(instances(placement).auraAt(1, 0)!.color, DEFAULT_PLACEMENT_SETTINGS.colors.red);
    placement.dispose();
  });

  it("stands on a plate even where no slot was given", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(true);
    placement.setGhost({ x: 5, y: 5, fits: true }, 0);
    expect(instances(placement).plateAt(5, 5)).toBeDefined();
    expect(instances(placement).auraAt(5, 5)!.placed).toBe(1);
    placement.dispose();
  });

  it("on confirm: the rim turns green in the first third and fades out in confirmMs, then goes", () => {
    const placement = new PlacementRenderer();
    placement.setReducedMotion(false);
    placement.setSlots([{ x: 1, y: 0 }], 0);
    placement.setGhost({ x: 1, y: 0, fits: true }, 0);
    placement.update(500);
    // The move accepted: the slots go, the confirm rim stays at the cell.
    placement.setGhost(null, 1000);
    placement.setSlots([], 1000);
    placement.startConfirm({ x: 1, y: 0 }, 1000);
    expect(placement.isConfirming()).toBe(true);
    placement.update(1000 + motion.confirmMs / 3);
    const rims = instances(placement).auras.filter((a) => a.placed === 1);
    expect(rims).toHaveLength(1);
    close(rims[0]!.color, DEFAULT_PLACEMENT_SETTINGS.colors.green);
    const { opacity } = confirmProgress(motion.confirmMs / 3, motion, false);
    expect(rims[0]!.strength).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.aura.placedIntensity * opacity, 5);
    expect(placement.update(1000 + motion.confirmMs).animating).toBe(true);
    expect(placement.isConfirming()).toBe(false);
    expect(placement.update(1000 + motion.confirmMs + 16).animating).toBe(false);
    expect(placement.getAuraMesh()!.count).toBe(0);
    placement.dispose();
  });

  it("under reduced motion, confirms green at once with a short fade", () => {
    expect(confirmProgress(0, motion, true).color).toBe(1);
    expect(confirmProgress(motion.reducedConfirmMs, motion, true).done).toBe(true);
    expect(confirmProgress(motion.confirmMs / 3, motion, false).color).toBeCloseTo(1, 9);
    expect(confirmProgress(motion.confirmMs, motion, false)).toEqual({ color: 1, opacity: 0, done: true });
  });
});

describe("the settings", () => {
  it("take each group's fields over the defaults, and ride in the renderer's settings", () => {
    const s = resolvePlacementSettings({ grid: { opacity: 0.5 }, plates: { gap: 6 }, motion: { reducedMotion: true } });
    expect(s.grid.opacity).toBe(0.5);
    expect(s.grid.rings).toEqual(DEFAULT_PLACEMENT_SETTINGS.grid.rings);
    expect(s.plates.gap).toBe(6);
    expect(s.plates.height).toBe(DEFAULT_PLACEMENT_SETTINGS.plates.height);
    expect(s.motion.reducedMotion).toBe(true);
    expect(resolveRendererSettings({ placement: { aura: { intensity: 0.5 } } }).placement.aura.intensity).toBe(0.5);
    expect(resolveRendererSettings().placement).toEqual(DEFAULT_PLACEMENT_SETTINGS);
  });

  it("rebuild the plates at a new shape and colour, at once", () => {
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0, fits: false }], 0);
    placement.setSettings(resolvePlacementSettings({ plates: { gap: 10 }, colors: { plate: "#336699" } }));
    const box = placement.getPlateMesh()!.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(TILE_SIZE - 10 * VOXEL_SIZE, 6);
    close(instances(placement).plateAt(1, 0)!.color, "#336699");
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
  it("is the tile alone on a hover; placed, its plate's rim; moved, the rim follows; gone, no rim", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setAvailableSlots([{ x: 1, y: 0, fits: true }, { x: 2, y: 0, fits: false }]);
    tiles.setHover(ghostAt(1, 0));
    expect((tiles as any).previewContainer).not.toBeNull();
    expect(placementOf(tiles).getGhost()).toBeNull();
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 1, y: 0, fits: true });
    tiles.setHover(ghostAt(2, 0, { placed: true, valid: false }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 2, y: 0, fits: false });
    tiles.setHover(null);
    expect(placementOf(tiles).getGhost()).toBeNull();
    tiles.dispose();
  });

  it("hovering a plan with no model and no image yet drops the last ghost's rim", () => {
    const assets = { ...fakeAssets(), has: (key: string) => key !== "missing", peekTexture: () => null };
    const tiles = new TileRenderer(assets as any);
    tiles.setAvailableSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(placementOf(tiles).getGhost()).toEqual({ x: 1, y: 0, fits: true });
    (tiles as any).modelOf = () => null;
    tiles.setHover(ghostAt(2, 0, { placed: true, planIndex: 5 }));
    expect((tiles as any).previewContainer).toBeNull();
    expect(placementOf(tiles).getGhost()).toBeNull();
    // The plates' last change drawn, nothing moves: no frame is asked for.
    tiles.update(performance.now() + 10_000);
    expect(tiles.update(performance.now() + 10_016).animating).toBe(false);
    tiles.dispose();
  });

  it("confirms at a cell: the same confirm again changes nothing, null removes it", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    const spy = vi.spyOn(placementOf(tiles), "startConfirm");
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    tiles.setConfirmed({ ...ghostAt(1, 0), key: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ x: 1, y: 0 });
    tiles.setConfirmed(null);
    expect(spy.mock.calls[1]![0]).toBeNull();
    expect(placementOf(tiles).isConfirming()).toBe(false);
    tiles.dispose();
  });
});

describe("the placement's resources", () => {
  it("disposes what it made, once", () => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ grid: { enabled: true } }));
    placement.setTileCells([{ x: 0, y: 0 }]);
    placement.setSlots([{ x: 1, y: 0 }], 0);
    placement.setGhost({ x: 1, y: 0, fits: true }, 0);
    const plate = placement.getPlateMesh()!;
    const aura = placement.getAuraMesh()!;
    const grid = placement.group.children.find((c) => c.userData.grid) as THREE.Mesh;
    const owned = [plate.geometry, plate.material as THREE.Material, aura.geometry, aura.material as THREE.Material, grid.geometry, grid.material as THREE.Material];
    const spies = owned.map((r) => vi.spyOn(r, "dispose"));
    placement.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(placement.getPlateMesh()).toBeNull();
  });
});
