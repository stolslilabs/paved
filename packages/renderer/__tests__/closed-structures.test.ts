import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CLOSED_LIST_WIDTH, ClosedStructuresLayer, closedGlsl, type ClosedStructure } from "../src/core/closed-structures";
import {
  DEFAULT_CLOSING_SETTINGS,
  PULSE_RISE,
  pulseLevel,
  resolveClosingSettings,
  shineAllowed,
  shineInterval,
  structureHash,
  sweepAxis,
  sweepEase,
  sweepExtent,
  sweepRunning,
} from "../src/core/closing-settings";
import { PLAY_DEFAULT_POLAR_ANGLE } from "../src/core/CameraController";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";

const S = DEFAULT_CLOSING_SETTINGS;
const T0 = 10_000;

/** Two roads one tile closed (#722): the closing tile (id 2, cell (1, 0)) holds area 5 of one and area 7 of the other. */
const ROADS: ClosedStructure[] = [
  { id: "a", areas: [{ gameId: 1, id: 1, areas: 1 << 4 }, { gameId: 1, id: 2, areas: 1 << 4 }] },
  { id: "b", areas: [{ gameId: 1, id: 2, areas: 1 << 6 }, { gameId: 1, id: 3, areas: 1 << 6 }] },
];
const CELLS = new Map<string, readonly [number, number]>([
  ["1-1", [0, 0]],
  ["1-2", [1, 0]],
  ["1-3", [2, 0]],
]);

/**
 * The layer's maps as the shader reads them: the structures (from 1) of an area of a cell (`slots`; `at`, the first), and a
 * structure's two texels.
 */
function readMaps(layer: ClosedStructuresLayer) {
  const u = layer.uniforms;
  const rect = u.uClosedRect.value.toArray();
  const map = u.uClosedMap.value.image as { width: number; height: number; data: Float32Array };
  const list = u.uClosedList.value.image as { width: number; height: number; data: Float32Array };
  const data = u.uClosedData.value.image as { width: number; height: number; data: Float32Array };
  return {
    rect,
    // The area's run in the list (its start and length in the map's RG texel), as the shader walks it.
    slots: (x: number, z: number, area: number) => {
      const o = ((z - rect[1]!) * map.width + (x - rect[0]!) * 9 + area - 1) * 2;
      const [start, count] = [map.data[o]!, map.data[o + 1]!];
      return [...list.data.slice(start, start + count)];
    },
    at: (x: number, z: number, area: number) => {
      const o = ((z - rect[1]!) * map.width + (x - rect[0]!) * 9 + area - 1) * 2;
      return map.data[o + 1] ? list.data[map.data[o]!] : 0;
    },
    clock: (index: number) => [...data.data.slice((index - 1) * 8, (index - 1) * 8 + 4)],
    extent: (index: number) => [...data.data.slice((index - 1) * 8 + 4, (index - 1) * 8 + 6)],
  };
}

function layerWith(structures: readonly ClosedStructure[], now = T0, settings = S, reduced = false, lowPower = false) {
  const layer = new ClosedStructuresLayer(0);
  layer.setSettings(settings, reduced, lowPower);
  layer.set(structures, now);
  layer.build(CELLS);
  return layer;
}

describe("the closing settings and clocks (CLOSE-SHINE, #722)", () => {
  it("defaults to the issue's starting points, and resolves a partial input group by group", () => {
    expect(S.pulse).toMatchObject({ color: "#ffc23d", strength: 0.6, ms: 700, reducedMs: 150, staggerMs: 150 });
    expect(S.shine).toMatchObject({ enabled: true, strength: 0.3, angle: -15, durationMs: 1200, intervalMinMs: 6000, intervalMaxMs: 8000 });
    expect(DEFAULT_RENDERER_SETTINGS.closing).toBe(S);
    const resolved = resolveRendererSettings({ closing: { shine: { durationMs: 900 } } }).closing;
    expect(resolved.shine).toEqual({ ...S.shine, durationMs: 900 });
    expect(resolved.pulse).toEqual(S.pulse);
    expect(resolveClosingSettings({ enabled: false }).enabled).toBe(false);
  });

  it("pulses with a quick rise and a slow fade, nothing before or after", () => {
    expect(pulseLevel(-1, 700)).toBe(0);
    expect(pulseLevel(0, 700)).toBe(0);
    expect(pulseLevel(700 * PULSE_RISE, 700)).toBeCloseTo(1, 6);
    expect(pulseLevel(700 * (PULSE_RISE + 1) / 2, 700)).toBeCloseTo(0.5, 6);
    expect(pulseLevel(699, 700)).toBeLessThan(0.001);
    expect(pulseLevel(700, 700)).toBe(0);
  });

  it("eases the sweep as cubic-bezier(0.4, 0, 0.2, 1)", () => {
    // The curve by bisection on its x, the reference.
    const reference = (p: number) => {
      const bx = (t: number) => 3 * (1 - t) ** 2 * t * 0.4 + 3 * (1 - t) * t * t * 0.2 + t ** 3;
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 60; i++) [lo, hi] = bx((lo + hi) / 2) < p ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
      const t = (lo + hi) / 2;
      return 3 * (1 - t) * t * t + t ** 3;
    };
    for (let p = 0; p <= 1.0001; p += 0.05) expect(sweepEase(p)).toBeCloseTo(reference(Math.min(1, p)), 3);
    expect(sweepEase(0)).toBe(0);
    expect(sweepEase(1)).toBeCloseTo(1, 9);
    expect(sweepEase(0.5)).toBeGreaterThan(0.7);
  });

  it("gives each structure its own interval in the settings' range, and runs a sweep only in its first duration", () => {
    const hashes = ["a", "b", "c", "0-12", "0-13"].map(structureHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const h of hashes) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      const interval = shineInterval(h, S.shine);
      expect(interval).toBeGreaterThanOrEqual(6000);
      expect(interval).toBeLessThanOrEqual(8000);
    }
    expect(structureHash("a")).toBe(structureHash("a"));
    expect([sweepRunning(-1, 7000, 1200), sweepRunning(0, 7000, 1200), sweepRunning(1199, 7000, 1200), sweepRunning(1200, 7000, 1200), sweepRunning(7100, 7000, 1200)]).toEqual([false, true, true, false, true]);
  });

  it("slants the band on the board as seen from the fixed camera, and spans a structure's tiles", () => {
    expect(sweepAxis(0)).toEqual([1, 0, -0]);
    const [x, y, z] = sweepAxis(-15);
    // Seen from the camera (right +x, up (0, sin, -cos)): the band's top leans to the right, `tan(15°)` of its height.
    const up = [0, Math.sin(PLAY_DEFAULT_POLAR_ANGLE), -Math.cos(PLAY_DEFAULT_POLAR_ANGLE)];
    const along = (dx: number, dup: number) => x * dx + (y * up[1]! + z * up[2]!) * dup;
    expect(along(Math.tan((15 * Math.PI) / 180), 1)).toBeCloseTo(0, 9);
    expect(along(1, 0)).toBe(1);
    // A flat tile at the origin, an upright band: from -1.5 to 1.5; two tiles side by side reach 4.5.
    expect(sweepExtent([[0, 0]], [1, 0, 0], 3, 2)).toEqual([-1.5, 1.5]);
    expect(sweepExtent([[0, 0], [1, 0]], [1, 0, 0], 3, 2)).toEqual([-1.5, 4.5]);
    expect(sweepExtent([], [1, 0, 0], 3, 2)).toEqual([0, 0]);
  });

  it("allows the shine only with motion and power: off under reduced motion, on the Low tier and software WebGL", () => {
    expect(shineAllowed(S, false, false)).toBe(true);
    expect(shineAllowed(S, true, false)).toBe(false);
    expect(shineAllowed(S, false, true)).toBe(false);
    expect(shineAllowed({ ...S, shine: { ...S.shine, enabled: false } }, false, false)).toBe(false);
    expect(shineAllowed({ ...S, enabled: false }, false, false)).toBe(false);
  });
});

describe("the closed structures' layer: its masks", () => {
  it("maps each area of each cell to its structure: one tile that closed two roads holds one area of each", () => {
    const layer = layerWith(ROADS);
    const { rect, at } = readMaps(layer);
    expect(rect).toEqual([0, 0, 3, 1]);
    expect(layer.uniforms.uClosedOn.value).toBe(1);
    expect([at(0, 0, 5), at(1, 0, 5), at(1, 0, 7), at(2, 0, 7)]).toEqual([1, 1, 2, 2]);
    // Nothing else: the other areas hold no structure.
    expect([at(0, 0, 7), at(1, 0, 1), at(2, 0, 5)]).toEqual([0, 0, 0]);
  });

  it("gives a structure's extent across the sweep from its own tiles, and leaves out a tile not given yet", () => {
    const layer = new ClosedStructuresLayer(0);
    layer.setSettings({ ...S, shine: { ...S.shine, angle: 0 } }, false, false);
    layer.set([...ROADS, { id: "late", areas: [{ gameId: 1, id: 9, areas: 1 }] }], T0);
    layer.build(CELLS);
    const { extent, rect } = readMaps(layer);
    expect(extent(1)).toEqual([-1.5, 4.5]);
    expect(extent(2)).toEqual([1.5, 7.5]);
    expect(rect).toEqual([0, 0, 3, 1]);
    // Its tile comes: the map is built again with it.
    layer.build(new Map([...CELLS, ["1-9", [0, 2] as const]]));
    expect(readMaps(layer).rect).toEqual([0, 0, 3, 3]);
    expect(readMaps(layer).at(0, 2, 1)).toBe(3);
  });

  it("keeps every structure that holds a (tile, area): a road under a wonder's whole tiles keeps its own clock", () => {
    const wonder: ClosedStructure = { id: "w", areas: [1, 2, 3].map((id) => ({ gameId: 1, id, areas: 0x1ff })) };
    const { slots } = readMaps(layerWith([...ROADS, wonder]));
    expect([slots(1, 0, 5), slots(1, 0, 7), slots(1, 0, 1), slots(0, 0, 5)]).toEqual([[1, 3], [2, 3], [3], [1, 3]]);
    // Closed by one move: the road pulses on its own line, the wonder on its later one, both on the shared area.
    const layer = layerWith([]);
    layer.set([ROADS[0]!, wonder], T0);
    expect(layer.pulseAt("a", T0 + 105)).toBeCloseTo(1, 6);
    expect(layer.pulseAt("w", T0 + 105)).toBe(0);
    expect(layer.pulseAt("w", T0 + 150 + 105)).toBeCloseTo(1, 6);
    // The shader walks every slot of the area and keeps the brightest pulse and band.
    const glsl = closedGlsl("int labelArea = 1;");
    expect(glsl).toContain("for (int k = 0; k < closedCount; k++)");
    expect(glsl).toContain(`texelFetch(uClosedList, ivec2(closedAt % ${CLOSED_LIST_WIDTH}, closedAt / ${CLOSED_LIST_WIDTH}), 0)`);
    expect(glsl).toContain("closedPulse = max(closedPulse,");
    expect(glsl).toContain("closedShine = max(closedShine,");
  });

  it("keeps every structure of an area, however many: none is left out", () => {
    // Ten holders of one area (its own structure and the nine wonders whose rings can reach a tile), and more.
    const many: ClosedStructure[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, areas: [{ gameId: 1, id: 1, areas: 1 }] }));
    const layer = layerWith([]);
    layer.set(many, T0);
    layer.build(CELLS);
    expect(readMaps(layer).slots(0, 0, 1)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // The first still pulses on its own line, the last on its own, later one.
    expect(layer.pulseAt("s0", T0 + 105)).toBeCloseTo(1, 6);
    expect(layer.pulseAt("s11", T0 + 11 * 150 + 105)).toBeCloseTo(1, 6);
  });

  it("lays the runs out over several rows of the list when they pass a row", () => {
    // 300 structures over one area each of 300 tiles in a row, then one more holding them all: 600 entries, three rows.
    const cells = new Map<string, readonly [number, number]>(Array.from({ length: 300 }, (_, i) => [`1-${i + 1}`, [i, 0] as const]));
    const own: ClosedStructure[] = Array.from({ length: 300 }, (_, i) => ({ id: `o${i}`, areas: [{ gameId: 1, id: i + 1, areas: 1 }] }));
    const all: ClosedStructure = { id: "all", areas: Array.from({ length: 300 }, (_, i) => ({ gameId: 1, id: i + 1, areas: 1 })) };
    const layer = new ClosedStructuresLayer(0);
    layer.set([...own, all], T0);
    layer.build(cells);
    const { slots } = readMaps(layer);
    expect(slots(0, 0, 1)).toEqual([1, 301]);
    expect(slots(299, 0, 1)).toEqual([300, 301]);
    expect((layer.uniforms.uClosedList.value.image as { height: number }).height).toBe(Math.ceil(600 / CLOSED_LIST_WIDTH));
  });

  it("empties its maps and turns off when no structure is left; frees its textures", () => {
    const layer = layerWith(ROADS);
    const map = layer.uniforms.uClosedMap.value as THREE.DataTexture;
    let freed = 0;
    map.addEventListener("dispose", () => freed++);
    layer.set([], T0 + 1);
    layer.build(CELLS);
    expect(freed).toBe(1);
    expect(layer.uniforms.uClosedOn.value).toBe(0);
    expect(layer.uniforms.uClosedRect.value.toArray()).toEqual([0, 0, 0, 0]);
    layer.dispose();
  });
});

describe("the closed structures' layer: its clocks", () => {
  it("shines a board's first structures at once, each at its own phase, with no pulse", () => {
    const layer = layerWith(ROADS);
    const { clock } = readMaps(layer);
    expect([layer.pulseAt("a", T0), layer.pulseAt("b", T0 + 100)]).toEqual([0, 0]);
    expect([clock(1)[3], clock(2)[3]]).toEqual([0, 0]);
    // Each began somewhere in its first interval before now, not both at once.
    const starts = [clock(1)[1]!, clock(2)[1]!];
    for (const [i, start] of starts.entries()) {
      expect(start).toBeLessThanOrEqual(T0 / 1000);
      expect(T0 / 1000 - start).toBeLessThan(clock(i + 1)[2]!);
    }
    expect(starts[0]).not.toBe(starts[1]);
  });

  it("pulses a structure that closes later, staggered as the feed's lines, then shines from the pulse's end", () => {
    const layer = layerWith([]);
    layer.set(ROADS, T0);
    layer.build(CELLS);
    const { clock } = readMaps(layer);
    // (Float textures: to the float's precision.)
    const near = (got: number[], want: number[]) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 5));
    near(clock(1), [T0 / 1000, (T0 + 700) / 1000]);
    near(clock(2), [(T0 + 150) / 1000, (T0 + 150 + 700) / 1000]);
    expect([clock(1)[3], clock(2)[3]]).toEqual([1, 1]);
    // The second waits for its line; at its peak the first is fading.
    expect(layer.pulseAt("b", T0 + 100)).toBe(0);
    expect(layer.pulseAt("a", T0 + 0.15 * 700)).toBeCloseTo(1, 6);
    expect(layer.pulseAt("b", T0 + 150 + 0.15 * 700)).toBeCloseTo(1, 6);
    // Then its sweep, from the pulse's end, every few seconds.
    expect(layer.sweepingAt("a", T0 + 699)).toBe(false);
    expect(layer.sweepingAt("a", T0 + 700)).toBe(true);
    expect(layer.sweepingAt("a", T0 + 700 + 1200)).toBe(false);
  });

  it("keeps a known structure's clock from one call to the next, and drops one no longer listed", () => {
    const layer = layerWith([ROADS[0]!]);
    layer.set(ROADS, T0 + 5000);
    expect(layer.pulseAt("a", T0 + 5100)).toBe(0);
    expect(layer.pulseAt("b", T0 + 5100)).toBeGreaterThan(0);
    layer.set([ROADS[1]!], T0 + 6000);
    expect(layer.size).toBe(1);
    expect(layer.sweepingAt("a", T0 + 6000)).toBe(false);
  });

  it("asks for frames only while a pulse or a sweep runs, and one more to clear it", () => {
    const layer = layerWith([]);
    layer.set([ROADS[0]!], T0);
    const id = "a";
    const interval = shineInterval(structureHash(id), S.shine);
    let last = 0;
    const frames = (from: number, to: number) => {
      const wanted: number[] = [];
      for (let t = from; t < to; t += 50) {
        if (layer.update(t)) wanted.push(t);
        last = t;
      }
      return wanted;
    };
    // Before the move: nothing.
    expect(layer.update(T0 - 100)).toBe(false);
    // The pulse (700 ms), then the first sweep (1200 ms): one run of frames, then one to clear, then none until the next.
    const first = frames(T0, T0 + interval);
    expect(first[0]).toBe(T0);
    expect(first.at(-1)).toBe(T0 + 700 + 1200);
    expect(first).toHaveLength((700 + 1200) / 50 + 1);
    // The uniform follows the layer's clock (seconds from its start).
    expect(layer.uniforms.uClosedTime.value).toBeCloseTo(last / 1000, 9);
    // The next sweep, one interval after the first.
    const next = frames(T0 + interval, T0 + 2 * interval);
    expect(next[0]).toBeGreaterThanOrEqual(T0 + 700 + interval);
    expect(next.length).toBeLessThanOrEqual(1200 / 50 + 2);
  });

  it("under reduced motion: a short pulse (the confirm's 150 ms) and no shine", () => {
    const layer = layerWith([], T0, S, true);
    layer.set([ROADS[0]!], T0);
    expect(layer.pulseAt("a", T0 + 0.15 * 150)).toBeCloseTo(1, 6);
    expect(layer.pulseAt("a", T0 + 150)).toBe(0);
    expect(layer.uniforms.uShineOn.value).toBe(0);
    expect(layer.uniforms.uPulseDuration.value).toBeCloseTo(0.15, 9);
    for (let t = T0 + 200; t < T0 + 20_000; t += 100) expect(layer.sweepingAt("a", t)).toBe(false);
  });

  it("on the Low tier or software WebGL: the pulse, and no shine", () => {
    const layer = layerWith([], T0, S, false, true);
    layer.set([ROADS[0]!], T0);
    expect(layer.pulseAt("a", T0 + 105)).toBeCloseTo(1, 6);
    expect(layer.uniforms.uShineOn.value).toBe(0);
    expect(layer.update(T0 + 100)).toBe(true);
    expect(layer.update(T0 + 800)).toBe(true); // the frame that clears the pulse
    expect(layer.update(T0 + 850)).toBe(false);
  });

  it("writes its settings to the shader: colours, strengths, the band's width, length and axis", () => {
    const layer = new ClosedStructuresLayer(0);
    layer.setSettings(resolveClosingSettings({ pulse: { color: "#ff0000", strength: 0.4 }, shine: { width: 2, durationMs: 1000, angle: 0 } }), false, false);
    const u = layer.uniforms;
    expect(u.uPulseColor.value.getHexString()).toBe("ff0000");
    expect([u.uPulseStrength.value, u.uShineOn.value, u.uShineWidth.value, u.uShineDuration.value]).toEqual([0.4, 1, 2, 1]);
    expect(u.uShineAxis.value.toArray()).toEqual([1, 0, -0]);
    layer.setSettings({ ...S, enabled: false }, false, false);
    expect([u.uPulseStrength.value, u.uPulseGlow.value, u.uShineOn.value]).toEqual([0, 0, 0]);
  });
});
