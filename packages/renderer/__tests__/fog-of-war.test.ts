import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { FogOfWar } from "../src/core/fog-of-war";
import {
  DEFAULT_FOG_SETTINGS,
  FIELD_REACH,
  FIELD_TEXELS,
  MAX_CORNER_RADIUS,
  RevealFieldBuilder,
  RevealTransition,
  boardReveal,
  buildRevealField,
  cellKey,
  easeLift,
  fieldDistance,
  fieldWindow,
  fogMode,
  freeSlots,
  liftedCells,
  resolveFogSettings,
  revealRects,
  type FogCell,
  type FogSettings,
  type RevealField,
  type RevealedCell,
} from "../src/core/fog-of-war-settings";

/** Where the field first reaches 0, walking from the cell coordinate `from` along `dir`, a thousandth of a cell a step. */
function crossingPoint(field: RevealField, from: [number, number], dir: [number, number]): [number, number] {
  const n = Math.hypot(dir[0], dir[1]);
  for (let t = 0; t < 3; t += 0.001) {
    const [x, y] = [from[0] + (dir[0] / n) * t, from[1] + (dir[1] / n) * t];
    if (fieldDistance(field, x, y) >= 0) return [x, y];
  }
  return [Number.NaN, Number.NaN];
}
const crossingAlong = (field: RevealField, from: [number, number], dir: [number, number]): number => crossingPoint(field, from, dir)[dir[0] !== 0 ? 0 : 1];

const keys = (cells: FogCell[]) => cells.map((c) => cellKey(c.x, c.y)).sort();
const clear = (cells: FogCell[]): RevealedCell[] => cells.map((c) => ({ ...c, value: 1, anchor: [0, 0] }));

describe("the fog of war: the cells it reveals", () => {
  it("reveals the placed tiles and the free slots next to them, each once", () => {
    const tiles = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(keys(freeSlots(tiles))).toEqual(keys([
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 2, y: 0 },
      { x: 1, y: -1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]));
    const revealed = boardReveal(tiles);
    expect(revealed).toHaveLength(3 + 7);
    expect(new Set(keys(revealed)).size).toBe(revealed.length);
    expect(keys(boardReveal([...tiles, tiles[0]!]))).toEqual(keys(revealed));
    expect(boardReveal([])).toEqual([]);
  });

  it("lifts the fog over a placed tile's new free neighbours, and only those", () => {
    const before = [{ x: 0, y: 0 }];
    const after = [...before, { x: 1, y: 0 }];
    // (1, 0) was a free slot already: placing there lifts the cells next to it that were under the fog.
    expect(keys(liftedCells(boardReveal(before), boardReveal(after)))).toEqual(keys([
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ]));
    // A tile placed in a corner of the board lifts fewer.
    const corner = [...after, { x: 1, y: 1 }];
    expect(keys(liftedCells(boardReveal(after), boardReveal(corner)))).toEqual(keys([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
    ]).filter((k) => k !== "0,1"));
  });
});

describe("the fog of war: a cell lifting", () => {
  it("shows the first reveal at once, then lifts a new cell over its seconds, eased", () => {
    const lift = new RevealTransition(0.8);
    lift.setTarget([{ x: 0, y: 0 }], 10);
    expect(lift.cells(10)).toEqual([{ x: 0, y: 0, value: 1, anchor: [0, 0] }]);
    expect(lift.step(10)).toBe(false);

    expect(lift.setTarget([{ x: 0, y: 0 }, { x: 1, y: 0 }], 20)).toBe(true);
    const valueAt = (t: number) => lift.cells(t).find((c) => c.x === 1)?.value ?? 0;
    expect(valueAt(20)).toBe(0);
    expect(valueAt(20.2)).toBeCloseTo(easeLift(0.25), 6);
    expect(valueAt(20.4)).toBeCloseTo(0.5, 6);
    expect(lift.step(20.4)).toBe(true);
    expect(valueAt(21)).toBe(1);
    expect(lift.step(21)).toBe(false);
    // The same reveal again changes nothing.
    expect(lift.setTarget([{ x: 1, y: 0 }, { x: 0, y: 0 }], 22)).toBe(false);
  });

  it("grows a new cell from the tile just placed, else from a cell already clear, else from its centre", () => {
    const lift = new RevealTransition(1);
    lift.setTarget([{ x: 0, y: 0 }, { x: 0, y: 1 }], 0);
    lift.setTarget([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: -1, y: 0 }], 1, { origin: [{ x: 0, y: 1 }] });
    const anchor = (x: number, y: number) => lift.cells(1.5).find((c) => c.x === x && c.y === y)?.anchor;
    expect(anchor(1, 1)).toEqual([-1, 0]);
    expect(anchor(-1, 0)).toEqual([1, 0]);
    expect(anchor(5, 5)).toEqual([0, 0]);
  });

  it("lifts at once when told (no motion), and finishes the lifts under way", () => {
    const lift = new RevealTransition(1);
    lift.setTarget([{ x: 0, y: 0 }], 0);
    lift.setTarget([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1);
    lift.setTarget([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 1.2, { instant: true });
    expect(lift.cells(1.2).map((c) => c.value)).toEqual([1, 1, 1]);
    expect(lift.step(1.2)).toBe(false);
  });

  it("fogs a dropped cell again, shrinking to its centre, then forgets it", () => {
    const lift = new RevealTransition(1);
    lift.setTarget([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0);
    lift.setTarget([{ x: 0, y: 0 }], 5);
    const dropped = () => lift.cells(5.5).find((c) => c.x === 1);
    expect(dropped()?.value).toBeCloseTo(0.5, 6);
    expect(dropped()?.anchor).toEqual([0, 0]);
    expect(lift.size).toBe(2);
    lift.step(6);
    expect(lift.size).toBe(1);
    expect(lift.cells(6)).toHaveLength(1);
  });

  it("draws a lifting cell as a band from its anchor's side, or a square from its centre", () => {
    const [band] = revealRects([{ x: 2, y: 3, value: 0.25, anchor: [-1, 0] }]);
    expect(band).toEqual({ x0: 1.5, x1: 1.75, y0: 2.5, y1: 3.5 });
    const [up] = revealRects([{ x: 2, y: 3, value: 0.5, anchor: [0, 1] }]);
    expect(up).toEqual({ x0: 1.5, x1: 2.5, y0: 3, y1: 3.5 });
    const [square] = revealRects([{ x: 0, y: 0, value: 0.5, anchor: [0, 0] }]);
    expect(square).toEqual({ x0: -0.25, x1: 0.25, y0: -0.25, y1: 0.25 });
    const [whole] = revealRects([{ x: 0, y: 0, value: 1, anchor: [1, 0] }]);
    expect(whole).toEqual({ x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5 });
    expect(revealRects([{ x: 0, y: 0, value: 0, anchor: [0, 0] }])).toEqual([]);
  });
});

describe("the fog of war: its field", () => {
  const cells = clear(boardReveal([{ x: 0, y: 0 }, { x: 1, y: 0 }]));
  const field = buildRevealField(cells);

  it("covers the cells and the reach around them, in steps of 8 cells, its origin on a cell's edge", () => {
    const w = fieldWindow(cells);
    expect(w.cellsX % 8).toBe(0);
    expect(w.cellsY % 8).toBe(0);
    expect(w.originX + 0.5).toBe(Math.round(w.originX + 0.5));
    expect(w.originX).toBeLessThanOrEqual(-1 - 0.5 - FIELD_REACH - 1);
    expect(w.originX + w.cellsX).toBeGreaterThanOrEqual(2 + 0.5 + FIELD_REACH + 1);
    expect(field.width).toBe(w.cellsX * FIELD_TEXELS);
    expect(field.data).toHaveLength(field.width * field.height);
  });

  it("is negative over the clear cells, the distance to them outside, and full fog past its reach", () => {
    // A cell's middle is half a cell from the fog when a side of it is fogged (bilinear reads a little less).
    for (const c of cells) expect(fieldDistance(field, c.x, c.y)).toBeLessThan(-0.35);
    // Two cells right of the free slot (2, 0): 1.5 cells from its border.
    expect(fieldDistance(field, 4, 0)).toBeCloseTo(1.5, 1);
    // Off a corner: (3, 2) is 1.5 cells right of the slot (1, 1)'s square and half a cell past its far side.
    expect(fieldDistance(field, 3, 2)).toBeCloseTo(Math.hypot(1.5, 0.5), 1);
    expect(fieldDistance(field, 12, 0)).toBe(FIELD_REACH);
    expect(fieldDistance(field, -40, 30)).toBe(FIELD_REACH);
  });

  it("crosses 0 on the cells' border, as the GPU filters it", () => {
    // Along the row y = 0, rightward from the slot (2, 0), whose border is at x = 2.5.
    const crossing = crossingAlong(field, [2, 0], [1, 0]);
    expect(crossing).toBeGreaterThan(2.5 - 0.02);
    expect(crossing).toBeLessThan(2.5 + 0.02);
  });

  it("stamps the cells once as a reveal starts and once as it ends, only the lifting ones at each step between", () => {
    // The window moves by 8 cells: one more ring of cells stays in it, so the clear cells' stamp is kept through the lift.
    const builder = new RevealFieldBuilder();
    const lift = new RevealTransition(1);
    lift.setTarget(boardReveal([{ x: 0, y: 0 }]), 0);
    builder.build(lift.cells(0));
    expect([builder.builds, builder.baseBuilds]).toEqual([1, 1]);
    lift.setTarget(boardReveal([{ x: 0, y: 0 }, { x: 1, y: 0 }]), 1, { origin: [{ x: 1, y: 0 }] });
    for (const t of [1.25, 1.5, 1.75]) builder.build(lift.cells(t));
    expect([builder.builds, builder.baseBuilds]).toEqual([4, 2]);
    // Halfway, the lifting cell (2, 0) is clear on its half next to (1, 0) only.
    const half = builder.build(lift.cells(1.5));
    expect(fieldDistance(half, 1.75, 0)).toBeLessThan(0);
    expect(fieldDistance(half, 2.25, 0)).toBeGreaterThan(0.15);
    const done = builder.build(lift.cells(2));
    expect(fieldDistance(done, 2.25, 0)).toBeLessThan(0);
    // Lifted, the new cells join the clear ones: stamped once more.
    expect(builder.baseBuilds).toBe(3);
  });
});

describe("the fog of war: its rounded corners", () => {
  const R = DEFAULT_FOG_SETTINGS.cornerRadius;
  const shapes: Record<string, FogCell[]> = {
    "one tile": [{ x: 0, y: 0 }],
    "an L": [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    "a diagonal pair": [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
  const sharp = (cells: FogCell[]) => buildRevealField(clear(cells));
  const round = (cells: FogCell[]) => buildRevealField(clear(cells), R);

  it("defaults to half a cell, and keeps it within the field", () => {
    expect(R).toBe(0.5);
    expect(resolveFogSettings({ cornerRadius: 0 }).cornerRadius).toBe(0);
    expect(resolveFogSettings({ cornerRadius: MAX_CORNER_RADIUS + 1 }).cornerRadius).toBe(R);
  });

  // A block of 3 x 3 cells around (0, 0): straight borders and outer corners away from any other corner.
  const block = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) - 1, y: Math.floor(i / 3) - 1 }));
  /** Where a circle of radius R in a right angle crosses its diagonal: R (1 - 1 / sqrt 2) in from the corner, each way. */
  const inset = R * (1 - Math.SQRT1_2);

  it("keeps a straight border on the cells' border", () => {
    expect(crossingAlong(round(block), [0, 0], [0, -1])).toBeCloseTo(-1.5, 2);
    expect(crossingAlong(round(shapes["an L"]!), [0, 0], [-1, 0])).toBeCloseTo(-0.5, 1);
  });

  it("rounds the clear area's outer corners as a circle of the radius", () => {
    // Bilinear filtering alone softens a sharp corner by a twentieth of a cell.
    expect(crossingPoint(sharp(block), [0, 0], [-1, -1])[0]).toBeLessThan(-1.5 + 0.06);
    const [x, y] = crossingPoint(round(block), [0, 0], [-1, -1]);
    expect(Math.abs(x - (-1.5 + inset))).toBeLessThan(0.02);
    expect(Math.abs(y - (-1.5 + inset))).toBeLessThan(0.02);
  });

  it("rounds a lone tile to about a circle, its corners well in", () => {
    const field = round(shapes["one tile"]!);
    const side = -crossingAlong(field, [0, 0], [0, -1]);
    const [corner] = crossingPoint(field, [0, 0], [1, 1]);
    expect(side).toBeGreaterThan(0.43);
    expect(corner).toBeLessThan(0.5 - inset + 0.02);
    expect(corner / side).toBeLessThan(0.78);
  });

  it("rounds the fog's corner inside an L, as a circle of the radius", () => {
    // Up-right along the diagonal from the middle of (0, 0): the L's inner corner (0.5, 0.5), where the fog comes in.
    expect(fieldDistance(sharp(shapes["an L"]!), 0.6, 0.6)).toBeGreaterThan(0);
    expect(fieldDistance(round(shapes["an L"]!), 0.6, 0.6)).toBeLessThan(0);
    const [x] = crossingPoint(round(shapes["an L"]!), [0, 0], [1, 1]);
    expect(Math.abs(x - (0.5 + inset))).toBeLessThan(0.02);
  });

  it("rounds a diagonal pair's corners, and the fog's beside their shared corner", () => {
    const field = round(shapes["a diagonal pair"]!);
    const [x] = crossingPoint(field, [1, 1], [1, 1]);
    expect(x).toBeLessThan(1.5 - inset + 0.02);
    // Beside the shared corner (0.5, 0.5), the fogged cell (1, 0)'s corner is pulled back: clearer than sharp.
    expect(fieldDistance(field, 0.6, 0.4)).toBeLessThan(fieldDistance(sharp(shapes["a diagonal pair"]!), 0.6, 0.4));
  });

  it("stamps the clear cells again when the radius changes, not at each step", () => {
    const builder = new RevealFieldBuilder();
    const cells = clear(shapes["an L"]!);
    builder.build(cells);
    builder.build(cells);
    builder.cornerRadius = 0.25;
    builder.build(cells);
    expect([builder.builds, builder.baseBuilds]).toEqual([3, 2]);
  });
});

describe("the fog of war: its settings and mode", () => {
  it("take the fields given over the base, and keep the base's for a value of the wrong kind or out of range", () => {
    const s = resolveFogSettings({ falloff: 0, billow: 9, color: "grey", landscape: { enabled: true, decor: 2 } });
    expect(s.falloff).toBe(0);
    expect(s.billow).toBe(DEFAULT_FOG_SETTINGS.billow);
    expect(s.color).toBe(DEFAULT_FOG_SETTINGS.color);
    expect(s.landscape).toEqual({ ...DEFAULT_FOG_SETTINGS.landscape, enabled: true, decor: 2 });
    expect(resolveFogSettings({ falloff: FIELD_REACH })).toEqual(DEFAULT_FOG_SETTINGS);
    // The falloff and the billow stay within the field's reach: past it the fog is whole.
    const wide = resolveFogSettings({ falloff: 3, billow: 1.5 });
    expect(wide.falloff + wide.billow).toBe(FIELD_REACH - 0.5);
  });

  it("stays on at every tier, still (no drift, an instant lift) on Low, under reduced motion or with the effects off", () => {
    const ambient = { enabled: true, reducedMotion: "auto" as const };
    expect(fogMode({ enabled: true }, ambient, "medium", false)).toBe("moving");
    expect(fogMode({ enabled: true }, ambient, "low", false)).toBe("still");
    expect(fogMode({ enabled: true }, ambient, "medium", true)).toBe("still");
    expect(fogMode({ enabled: true }, { ...ambient, enabled: false }, "high", false)).toBe("still");
    expect(fogMode({ enabled: true }, { ...ambient, reducedMotion: false }, "medium", true)).toBe("moving");
    expect(fogMode({ enabled: false }, ambient, "high", false)).toBe("off");
  });
});

describe("the fog of war: the effect", () => {
  const settings = (input: Parameters<typeof resolveFogSettings>[0] = {}): FogSettings => resolveFogSettings(input);
  const fogOf = (s: FogSettings = settings()) => {
    const time = { value: 0 };
    const fog = new FogOfWar(time, s);
    const onChange = vi.fn();
    fog.onChange = onChange;
    return { fog, time, onChange };
  };
  const board = boardReveal([{ x: 0, y: 0 }]);
  const placed = boardReveal([{ x: 0, y: 0 }, { x: 1, y: 0 }]);

  it("draws the fog's floor and its mist; the landscape draws the ground and its props instead of the floor", () => {
    const { fog } = fogOf();
    // Before any reveal, a field of fog alone.
    expect(fog.stats()).toMatchObject({ cells: 0, fieldBuilds: 1 });
    expect(fog.stats().field).not.toBe("none");
    fog.setRevealed(board);
    expect(fog.stats()).toMatchObject({ mode: "moving", cells: 5, drawCalls: 2, props: 0 });
    fog.setSettings(settings({ mist: 0, landscape: { enabled: true } }));
    const s = fog.stats();
    expect(s.props).toBeGreaterThan(0);
    expect(s.drawCalls).toBeGreaterThan(1);
    expect(s.drawCalls).toBeLessThanOrEqual(1 + 4);
    fog.setSettings(settings({ enabled: false }));
    expect(fog.stats()).toMatchObject({ mode: "off", drawCalls: 0 });
    expect(fog.object.visible).toBe(false);
  });

  it("puts no prop on a clear cell", () => {
    const { fog } = fogOf(settings({ landscape: { enabled: true, decor: 8 } }));
    fog.setRevealed(placed);
    const clearCells = new Set(placed.map((c) => cellKey(c.x, c.y)));
    const at = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let count = 0;
    fog.object.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, at);
        p.setFromMatrixPosition(at);
        expect(clearCells.has(cellKey(Math.round(p.x / 3), Math.round(p.z / 3)))).toBe(false);
        count++;
      }
    });
    expect(count).toBe(fog.stats().props);
  });

  it("lifts a placed tile's new neighbours on the loop, then lets the board idle unless it drifts", () => {
    const { fog, time, onChange } = fogOf(settings({ drift: 0 }));
    fog.setRevealed(board);
    expect(fog.step(0)).toBe(false);
    time.value = 1;
    fog.setRevealed(placed, [{ x: 1, y: 0 }]);
    expect(onChange).toHaveBeenCalled();
    expect(fog.stats().lifting).toBe(true);
    time.value = 1.4;
    expect(fog.step(1.4)).toBe(true);
    time.value = 2;
    expect(fog.step(2)).toBe(true);
    expect(fog.stats().lifting).toBe(false);
    expect(fog.step(2.1)).toBe(false);
    fog.setSettings(settings({ drift: 0.5 }));
    expect(fog.step(2.2)).toBe(true);
  });

  it("lifts at once and stands still when it cannot move (reduced motion, the Low tier)", () => {
    const { fog, time } = fogOf();
    fog.setMode("still");
    fog.setRevealed(board);
    time.value = 1;
    fog.setRevealed(placed, [{ x: 1, y: 0 }]);
    expect(fog.stats()).toMatchObject({ mode: "still", lifting: false, cells: placed.length });
    expect(fog.step(1.1)).toBe(false);
  });

  it("dims with the night", () => {
    const { fog } = fogOf();
    fog.setCycle({ season: "summer", position: 0.3125 });
    expect(fog.stats().daylight).toBeGreaterThan(0.9);
    fog.setCycle({ season: "summer", position: 0.8 });
    expect(fog.stats().daylight).toBe(0);
  });

  it("frees what it made, once", () => {
    const { fog } = fogOf(settings({ landscape: { enabled: true } }));
    fog.setRevealed(board);
    const parent = new THREE.Group();
    parent.add(fog.object);
    const freed: string[] = [];
    fog.object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.addEventListener("dispose", () => freed.push("geometry"));
      (o.material as THREE.Material).addEventListener("dispose", () => freed.push("material"));
    });
    fog.dispose();
    fog.dispose();
    // The floor's geometry (shared by the floor, the mist and the ground) and each prop's; the floor's, the mist's, the ground's
    // and the props' (shared) materials.
    expect(freed.filter((f) => f === "geometry").length).toBeGreaterThanOrEqual(2);
    expect(freed.filter((f) => f === "material").length).toBeGreaterThanOrEqual(4);
    expect(parent.children).toHaveLength(0);
  });
});
