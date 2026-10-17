import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_PLACEMENT_SETTINGS,
  GRID_RINGS,
  PLACEMENT_PULSES,
  PlacementRenderer,
  colorProgress,
  confirmProgress,
  createAuraGeometry,
  gridFade,
  gridLineCoverage,
  gridLineOpacityAt,
  gridRingOpacity,
  placementFade,
  placementTone,
  resolvePlacementSettings,
  ringField,
  slotDashBlend,
  slotDashCount,
  veilOf,
} from "../src/core/placement";
import { NEON_FRAME_MARGIN, neonFrameAt, neonFrameMargin, neonLineCoverage } from "../src/core/neon";
import { DEFAULT_OUTLINE_SETTINGS, outlineFade, createOutline, createOutlineMaterial, isOutline } from "../src/core/outlines";
import { buildEdgesGeometry } from "../src/core/edges";
import { resolveRendererSettings } from "../src/core/settings";
import { TileRenderer } from "../src/core/TileRenderer";
import { TILE_SIZE } from "../src/core/types";
import type { HoverState } from "../src/core/types";

const { motion } = DEFAULT_PLACEMENT_SETTINGS;

describe("the grid's ring fade", () => {
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
    placement.setTileCells([{ x: 0, y: 0 }]);
    const material = () => (placement.group.children.find((c) => c.userData.grid) as THREE.Mesh).material as THREE.ShaderMaterial;
    for (const px of [0.5 * S, S, 10 * S]) {
      placement.setZoom(px, S, 2);
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
  it("fade on the outlines' curve (OUT-FADE2), the slots' borders keeping their floor", () => {
    // A non-finite exponent is the default's: never a NaN opacity on the slot lines.
    for (const fadeExponent of [Number.NaN, Infinity, -Infinity]) {
      expect(placementFade(1.1 * 60, 60, { ...DEFAULT_OUTLINE_SETTINGS, fadeExponent })).toBe(placementFade(1.1 * 60, 60, DEFAULT_OUTLINE_SETTINGS));
    }
    const S = 60;
    expect(placementFade(1.5 * S, S, DEFAULT_OUTLINE_SETTINGS)).toBe(1);
    expect(placementFade(0.85 * S, S, DEFAULT_OUTLINE_SETTINGS)).toBe(0);
    // At the opening view, the outlines' 0.490 (start 1.5 S, square).
    expect(placementFade(S, S, DEFAULT_OUTLINE_SETTINGS)).toBeCloseTo(0.4904, 3);
    const floor = DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor;
    expect(placementFade(0.5 * S, S, DEFAULT_OUTLINE_SETTINGS, floor)).toBe(floor);
  });

  it("share the outlines' fade: a custom exponent and the eased end reach the slot lines", () => {
    const S = 60;
    const px = 1.1 * S;
    const at = (o: Partial<typeof DEFAULT_OUTLINE_SETTINGS>) => placementFade(px, S, { ...DEFAULT_OUTLINE_SETTINGS, ...o });
    // The same number as the outlines' own, whatever the exponent, start and eased end.
    for (const o of [{}, { fadeExponent: 1 }, { fadeExponent: 3.5 }, { fadeEasedEnd: true }, { fadeFullFactor: 30, fadeExponent: 4 }]) {
      const s = { ...DEFAULT_OUTLINE_SETTINGS, ...o };
      expect(at(o)).toBe(outlineFade(px, s.fadeOffFactor * S, s.fadeFullFactor * S, s.fadeExponent, s.fadeEasedEnd));
    }
    expect(at({ fadeExponent: 1 })).toBeLessThan(at({ fadeExponent: 3 }));
    const near = placementFade(0.86 * S, S, { ...DEFAULT_OUTLINE_SETTINGS, fadeEasedEnd: true });
    expect(near).toBeLessThan(placementFade(0.86 * S, S, DEFAULT_OUTLINE_SETTINGS));
    // An unset exponent and eased end are the default's.
    expect(placementFade(px, S, { fadeOffFactor: 0.85, fadeFullFactor: 1.5 })).toBe(at({}));

    // Through the renderers: PlacementRenderer and TileRenderer.setPlacementSettings take the outlines' whole fade.
    const lines = (r: PlacementRenderer) => ({ grid: (r as any).fade as number, border: (r as any).borderFade as number });
    const placement = new PlacementRenderer();
    const custom = { ...DEFAULT_OUTLINE_SETTINGS, fadeExponent: 3.5, fadeEasedEnd: true };
    placement.setSettings(DEFAULT_PLACEMENT_SETTINGS, custom);
    placement.setZoom(0.86 * S, S, 1);
    expect(lines(placement).border).toBe(placementFade(0.86 * S, S, custom, DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor));
    expect(lines(placement).border).not.toBe(placementFade(0.86 * S, S, DEFAULT_OUTLINE_SETTINGS, DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor));
    // The grid, with its far fade on, takes the same exponent and eased end.
    const farGrid = resolvePlacementSettings({ grid: { farFade: true } });
    placement.setSettings(farGrid, custom);
    placement.setZoom(0.9 * S, S, 1);
    expect(lines(placement).grid).toBe(gridFade(0.9 * S, S, farGrid.grid, custom));
    expect(lines(placement).grid).not.toBe(gridFade(0.9 * S, S, farGrid.grid, DEFAULT_OUTLINE_SETTINGS));
    // TileRenderer.setPlacementSettings takes the outlines' whole fade (OutlineFadeSettings).
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setPlacementSettings(DEFAULT_PLACEMENT_SETTINGS, custom);
    (tiles as any).placement.setZoom(px, S, 1);
    expect(lines((tiles as any).placement).border).toBe(placementFade(px, S, custom, DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor));
    expect(lines((tiles as any).placement).border).not.toBe(placementFade(px, S, DEFAULT_OUTLINE_SETTINGS, DEFAULT_PLACEMENT_SETTINGS.slots.fadeFloor));
  });

  it("keep a device-pixel floor: a line thinner than a pixel covers one pixel", () => {
    expect(neonLineCoverage(0, 0.2)).toBe(1);
    expect(neonLineCoverage(1, 0.2)).toBe(0);
    expect(neonLineCoverage(0.5, 1)).toBe(0.5);
    expect(neonLineCoverage(0, 3)).toBe(1);
    expect(neonLineCoverage(1.75, 3)).toBeCloseTo(0.25, 9);
  });
});

describe("the slots' neon (SLOTS2)", () => {
  const { slots } = DEFAULT_PLACEMENT_SETTINGS;
  const frame = (dashed: boolean) => ({ lineWidth: slots.width, glowWidth: slots.glow, minPx: slots.minWidthDevicePx, inset: slots.inset, gap: slots.gap, dashed });
  // A tile 60 CSS px wide at DPR 2: a device px is 1/120 of a cell.
  const px = 1 / 120;

  it("is inscribed in its cell: the line and its glow are clipped to the cell, nothing lights a neighbour", () => {
    for (const dashed of [false, true]) {
      for (const n of [2, 3] as const) {
        for (let t = -0.5; t <= 0.5; t += 0.01) {
          // Just outside the cell's edge (by a device px or more), on every side: nothing.
          for (const out of [0.5 + px, 0.5 + 2 * px, 0.5 + slots.glow, 0.5 + NEON_FRAME_MARGIN]) {
            for (const [x, y] of [[out, t], [-out, t], [t, out], [t, -out]] as const) {
              const at = neonFrameAt(x, y, frame(dashed), px, n);
              expect(at.line).toBe(0);
              expect(at.glow).toBe(0);
            }
          }
        }
      }
    }
    // The line's own antialiased edge ends at the cell's edge: its coverage there is 0, so the clip never cuts it.
    expect(neonFrameAt(0.5, 0, frame(false), px).line).toBeCloseTo(0, 9);
    expect(neonFrameAt(0.5 - 0.5 * px, 0, frame(false), px).line).toBeCloseTo(0.5 * neonFrameAt(0.5 - 0.5 * px, 0, frame(false), px).cell, 9);
    // The line itself is fully drawn inside the cell, its core one line width in.
    const core = neonFrameAt(0.5 - 0.5 * px - 0.5 * Math.max(slots.width, px), 0, frame(false), px);
    expect(core.line).toBe(1);
    // The quad's margin, for the clip's antialiasing, covers at least half a device px (one, for the perspective) at every
    // zoom: the farthest on a desktop or a portrait phone (42 to 48 CSS px a tile), a landscape phone (19 CSS px), and a
    // short window at DPR 1 (under 20), where the fixed 0.02 alone would not.
    for (const [tilePx, ratio] of [[48.25, 1.75], [42.9, 1], [41.8, 2], [19.3, 2], [26.8, 1], [12, 1], [5, 1]] as const) {
      const margin = neonFrameMargin(tilePx, ratio);
      expect(margin).toBeGreaterThanOrEqual(NEON_FRAME_MARGIN);
      expect(margin).toBeGreaterThanOrEqual(1 / (tilePx * ratio));
    }
    expect(neonFrameMargin(12, 1)).toBeGreaterThan(NEON_FRAME_MARGIN);
    expect(neonFrameMargin(Number.NaN, 1)).toBe(NEON_FRAME_MARGIN);
    // Through the renderer: the slots' and the placed border's margin follow the zoom.
    const placement = new PlacementRenderer();
    placement.setSlots([{ x: 1, y: 0 }]);
    placement.dressGhost(new THREE.Group(), null, { x: 2, y: 0 }, true, true, 0);
    placement.setZoom(12, 54, 1);
    const slotMaterial = (placement.group.children[0]!.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(slotMaterial.uniforms.margin.value).toBeCloseTo(1 / 12, 9);
    expect((placement as any).ghostBorder.uniforms.margin.value).toBeCloseTo(1 / 12, 9);
    placement.setZoom(60, 54, 2);
    expect(slotMaterial.uniforms.margin.value).toBe(NEON_FRAME_MARGIN);
    placement.dispose();
  });

  it("draws round-capped dashes with a glow that wraps their ends: no glow cut square at a gap", () => {
    const f = frame(true);
    const r = 0.5 * Math.max(f.lineWidth, f.minPx * px);
    const s = 0.5 - f.inset - r - 0.5 * px;
    // On the east side (x = s), along it. Two dashes a side: a period of s, a gap centred in each (y = -s/2 and s/2),
    // the corners and the middle dashed.
    const along = (y: number, x = s) => neonFrameAt(x, y, f, px, 2);
    const c = -s / 2;
    const gapHalf = 0.5 * (f.gap * s + 2 * r);
    // In the middle of the gap, on the line: no line, and the glow is the end caps' (a distance of half the gap).
    expect(along(c).line).toBe(0);
    expect(along(c).distance).toBeCloseTo(gapHalf, 9);
    expect(along(0).distance).toBe(0);
    // The glow falls continuously from the dash end into the gap: no step (a glow normal to the dash only would drop to 0).
    let previous = along(c - gapHalf - 0.02).glow;
    for (let y = c - gapHalf - 0.02; y <= c; y += 0.001) {
      const g = along(y).glow;
      expect(Math.abs(g - previous)).toBeLessThan(0.05);
      expect(g).toBeLessThanOrEqual(previous + 1e-12);
      previous = g;
    }
    expect(along(c - gapHalf + 0.25 * f.glowWidth).glow).toBeGreaterThan(0.5);
    // A round cap: past the dash's end, the distance is the distance to its end point (a capsule), off the line too.
    const end = c - gapHalf;
    for (const [dy, dx] of [[0.01, 0], [0.01, 0.01], [0.02, -0.005]]) {
      expect(along(end + dy!, s + dx!).distance).toBeCloseTo(Math.hypot(dy!, dx!), 9);
    }
    // The visible gap is the setting's share of a period: the caps do not shorten it.
    const visible = 2 * gapHalf - 2 * r;
    expect(visible).toBeCloseTo(f.gap * s, 9);
    // The corners stay whole L shapes: the corner point is on the line.
    expect(neonFrameAt(s, s, f, px, 2).distance).toBe(0);
    expect(neonFrameAt(s, s, f, px, 3).distance).toBe(0);
  });

  it("solid, is a closed square inside the cell with its glow all along", () => {
    const f = frame(false);
    const r = 0.5 * Math.max(f.lineWidth, f.minPx * px);
    const s = 0.5 - f.inset - r - 0.5 * px;
    for (let t = -s; t <= s; t += 0.01) {
      expect(neonFrameAt(s, t, f, px).line).toBe(1);
      expect(neonFrameAt(t, -s, f, px).line).toBe(1);
    }
  });

  it("sets the material from the settings: the floor, the inset, a frame quad with only the clip's margin", () => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ slots: { inset: 0.02, minWidthDevicePx: 1.5 } }));
    placement.setSlots([{ x: 1, y: 0, fits: false }, { x: 2, y: 0 }]);
    const meshes = placement.group.children[0]!.children as THREE.Mesh[];
    const material = meshes[0]!.material as THREE.ShaderMaterial;
    expect(material.uniforms.inset.value).toBe(0.02);
    expect(material.uniforms.minPx.value).toBe(1.5);
    const box = new THREE.Box3().setFromBufferAttribute(meshes[0]!.geometry.getAttribute("position") as THREE.BufferAttribute);
    expect(box.max.x).toBeCloseTo(0.5 + NEON_FRAME_MARGIN, 6);
    placement.dispose();
  });
});

describe("the aura's pulse (SLOTS2)", () => {
  const auraOf = (tiles: TileRenderer) => (preview(tiles).children.find((c) => c.userData.aura) as THREE.Mesh).material as THREE.ShaderMaterial;

  it("rotates around the cell by default; the presets are rotating, rotating with noise, and SLOTS' radial", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.aura.pulse).toBe("rotating");
    expect(PLACEMENT_PULSES).toEqual(["rotating", "rotating-noise", "radial"]);
    const tiles = new TileRenderer(fakeAssets() as any);
    const period = DEFAULT_PLACEMENT_SETTINGS.aura.periodMs;
    vi.spyOn(performance, "now").mockReturnValue(1000);
    tiles.setHover(ghostAt(0, 1, { placed: true }));
    tiles.update(1000 + period / 4);
    const aura = auraOf(tiles);
    expect(aura.uniforms.pulse.value).toBe(1);
    expect(aura.uniforms.arcs.value).toBe(1);
    // The phase runs over the period: a quarter of the way round after a quarter of it.
    expect(aura.uniforms.phase.value).toBeCloseTo(((1000 + period / 4) % period) / period, 9);
    const codes: Record<string, number> = { rotating: 1, "rotating-noise": 2, radial: 0 };
    for (const pulse of PLACEMENT_PULSES) {
      tiles.setPlacementSettings(resolvePlacementSettings({ aura: { pulse, arcs: 2.4 } }), DEFAULT_OUTLINE_SETTINGS);
      tiles.setHover(ghostAt(0, 1, { placed: true }));
      tiles.update(5000);
      expect(auraOf(tiles).uniforms.pulse.value).toBe(codes[pulse]);
      // A whole number of arcs: the wave meets itself at the turn.
      expect(auraOf(tiles).uniforms.arcs.value).toBe(2);
    }
    // The noise moves on its own long loop, never jumping within it.
    tiles.setPlacementSettings(resolvePlacementSettings({ aura: { pulse: "rotating-noise" } }), DEFAULT_OUTLINE_SETTINGS);
    tiles.setHover(ghostAt(0, 1, { placed: true }));
    tiles.update(period * 3);
    const n1 = auraOf(tiles).uniforms.noisePhase.value as number;
    tiles.update(period * 3 + 16);
    const n2 = auraOf(tiles).uniforms.noisePhase.value as number;
    expect(n2).toBeGreaterThan(n1);
    expect(n2 - n1).toBeLessThan(0.001);
    vi.restoreAllMocks();
    tiles.dispose();
  });

  it("under reduced motion, keeps a still aura, even all around", () => {
    const tiles = new TileRenderer(fakeAssets() as any);
    tiles.setReducedMotion(true);
    tiles.setPlacementSettings(resolvePlacementSettings({ aura: { pulse: "rotating-noise" } }), DEFAULT_OUTLINE_SETTINGS);
    tiles.setHover(ghostAt(0, 1, { placed: true }));
    expect(tiles.update(performance.now() + 1234).animating).toBe(false);
    const aura = auraOf(tiles);
    expect(aura.uniforms.phase.value).toBe(0);
    expect(aura.uniforms.noisePhase.value).toBe(0);
    expect(aura.uniforms.waveAmount.value).toBe(0);
    expect(aura.uniforms.opacity.value).toBe(1);
    tiles.dispose();
  });
});

describe("the veil (SLOTS2)", () => {
  it("is the state's own colour, the neon's, at a low opacity: yellow, red and green", () => {
    expect(DEFAULT_PLACEMENT_SETTINGS.veil.whiten).toBe(0);
    expect(DEFAULT_PLACEMENT_SETTINGS.veil.opacity).toBeLessThanOrEqual(0.2);
    const tiles = new TileRenderer(fakeAssets() as any);
    const t0 = 100;
    vi.spyOn(performance, "now").mockReturnValue(t0);
    const veil = () => {
      let material: THREE.MeshBasicMaterial | null = null;
      preview(tiles).traverse((o) => o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && (material = o.material));
      return material! as THREE.MeshBasicMaterial;
    };
    for (const [valid, tone] of [[true, "yellow"], [false, "red"]] as const) {
      tiles.setHover(null);
      tiles.setHover(ghostAt(0, 1, { placed: true, valid }));
      tiles.update(t0 + 10_000);
      const want = new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors[tone]);
      for (const k of ["r", "g", "b"] as const) expect(veil().color[k]).toBeCloseTo(want[k], 6);
      expect(veil().opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.veil.opacity, 9);
    }
    // Green: the confirm's veil, once its colour has turned (the first third of confirmMs), at 0.14 times the fade.
    tiles.setHover(null);
    tiles.setConfirmed({ ...ghostAt(0, 1), key: 3 });
    tiles.update(t0 + motion.confirmMs / 3);
    const confirm = tiles.getGroup().children[3]!.children.find((c) => c.children[0]?.userData.confirm)!;
    const veils: THREE.MeshBasicMaterial[] = [];
    confirm.traverse((o) => o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && veils.push(o.material));
    const green = veils[0]!;
    const want = new THREE.Color(DEFAULT_PLACEMENT_SETTINGS.colors.green);
    for (const k of ["r", "g", "b"] as const) expect(green.color[k]).toBeCloseTo(want[k], 6);
    const { opacity } = confirmProgress(motion.confirmMs / 3, motion, false);
    expect(green.opacity).toBeCloseTo(DEFAULT_PLACEMENT_SETTINGS.veil.opacity * opacity, 9);
    vi.restoreAllMocks();
    tiles.dispose();
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

  it("hovering a plan with no model and no image yet drops the last ghost's aura, veil and cell", () => {
    const assets = { ...fakeAssets(), has: (key: string) => key !== "missing", peekTexture: () => null };
    const tiles = new TileRenderer(assets as any);
    tiles.setAvailableSlots([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    tiles.setHover(ghostAt(1, 0, { placed: true }));
    expect(slotCells(tiles)).toEqual([{ x: 2, y: 0, fits: true }]);
    expect((tiles as any).placement.ghostCell).toEqual({ x: 1, y: 0 });
    // A plan whose model is not in (and whose image is not either): no ghost at all.
    (tiles as any).modelOf = () => null;
    tiles.setHover(ghostAt(2, 0, { placed: true, planIndex: 5 }));
    expect(preview(tiles)).toBeNull();
    expect(tiles.getGroup().children[2]!.children).toHaveLength(0);
    expect((tiles as any).placement.ghostCell).toBeNull();
    expect((tiles as any).placement.ghostTone).toBeNull();
    // Both slots draw their borders again; nothing moves, so no frame is asked for.
    expect(slotCells(tiles)).toHaveLength(2);
    expect(tiles.update(performance.now() + 10_000).animating).toBe(false);
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
