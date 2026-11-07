/**
 * The tile's actions as they finally stand (#1078, the review of TILE-ACTIONS): the HUD minded on the places the screen's sides leave,
 * not on the free ones (a tile panned far to one side), and the gap to the tile kept close in, where the clamp alone would put the
 * buttons on the tile. The tiles are projected as the production camera projects a cell.
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_GAP_PX,
  ACTION_PX,
  ACTION_SIDES,
  ACTION_SPREAD_PX,
  MARGIN_PX,
  actionsClearance,
  actionsSpan,
  clampActions,
  layoutTileActions,
  tileActionPlaces,
  type ActionPlaces,
  type BubbleAvoid,
  type Point,
} from "../src/components/containers/tile-actions-layout";
import { projectCell } from "./camera-fakes";

const R = ACTION_PX / 2;
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** A 44 px target meets the rect. */
const meets = (p: Point, r: DOMRect) => p.x + R > r.left && p.x - R < r.right && p.y + R > r.top && p.y - R < r.bottom;
const PHONES = [320, 360, 375] as const;

describe("the HUD minded where the buttons end, not where they were free (#1078)", () => {
  it("projects a cell as the renderer does (the review's figures)", () => {
    const at10 = projectCell(10, 375, 720);
    expect(at10[0]!.x).toBeCloseTo(-368.5, 1);
    expect(at10[0]!.y).toBeCloseTo(-185.9, 1);
    expect(at10[2]!.x).toBeCloseTo(827.2, 1);
    expect(at10[2]!.y).toBeCloseTo(871.9, 1);
  });

  for (const width of PHONES)
    it(`a tile panned off a ${width} px screen's side: no target under the HUD`, () => {
      const box = rect(0, 0, width, 720);
      const hud = rect(0, 0, width, 96);
      // The review's cell ((495,0) to (575,80) on a 375 px screen), as far past each screen's edge.
      const left = width + 120;
      const outline = [
        { x: left, y: 0 },
        { x: left + 80, y: 0 },
        { x: left + 80, y: 80 },
        { x: left, y: 80 },
      ];
      // The free places miss the HUD's span: the bug's premise.
      expect(actionsSpan(tileActionPlaces(outline)).x).toBeGreaterThan(width);
      for (const tile of [outline, outline.map((p) => ({ x: width - p.x, y: p.y }))]) {
        const at = layoutTileActions(tile, box, [{ rect: hud, side: false }]);
        for (const side of ACTION_SIDES) {
          expect(meets(at[side], hud), `${side} at ${width}`).toBe(false);
          expect(at[side].x - R).toBeGreaterThanOrEqual(MARGIN_PX);
          expect(at[side].x + R).toBeLessThanOrEqual(width - MARGIN_PX);
        }
      }
    });

  it("the editor's floating bar the same", () => {
    const bar = rect(8, 8, 359, 56);
    const outline = [
      { x: 495, y: 0 },
      { x: 575, y: 0 },
      { x: 575, y: 60 },
      { x: 495, y: 60 },
    ];
    const at = layoutTileActions(outline, rect(0, 0, 375, 720), [{ rect: bar, side: false }]);
    for (const side of ACTION_SIDES) expect(meets(at[side], bar), side).toBe(false);
  });
});

/** The board's HUD and hand panel on a phone; the home editor's floating bar and sheet. */
const ROOMS: Record<string, (w: number) => BubbleAvoid[]> = {
  board: (w) => [
    { rect: rect(0, 0, w, 96), side: false },
    { rect: rect(8, 520, w - 16, 200), side: false },
  ],
  "home editor": (w) => [
    { rect: rect(8, 8, w - 16, 56), side: false },
    { rect: rect(0, 439, w, 281), side: false },
  ],
};

const clearAt = (p: Point, outline: Point[]) => actionsClearance({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p }, outline);
/** How many buttons stand the gap clear of the tile. */
const clearCount = (at: ActionPlaces, outline: Point[]) => ACTION_SIDES.filter((s) => clearAt(at[s], outline) >= ACTION_GAP_PX - 0.5).length;

/**
 * The most buttons (up to four) the room outside the tile holds the gap clear of it and `ACTION_SPREAD_PX` apart: every set of the
 * clear places of an 8 px grid of the room, searched exhaustively.
 */
function mostOutside(outline: Point[], width: number, avoid: BubbleAvoid[]): number {
  const room = { top: MARGIN_PX, bottom: 720 - MARGIN_PX };
  for (const a of avoid)
    if (a.rect.top + a.rect.height / 2 < 360) room.top = Math.max(room.top, a.rect.bottom + MARGIN_PX);
    else room.bottom = Math.min(room.bottom, a.rect.top - MARGIN_PX);
  const free: Point[] = [];
  for (let x = MARGIN_PX + R; x <= width - MARGIN_PX - R; x += 8)
    for (let y = room.top + R; y <= room.bottom - R; y += 8) if (clearAt({ x, y }, outline) >= ACTION_GAP_PX) free.push({ x, y });
  let most = 0;
  const grow = (from: number, taken: Point[]) => {
    most = Math.max(most, taken.length);
    if (most === 4) return;
    for (let i = from; i < free.length && most < 4; i++)
      if (taken.every((q) => Math.hypot(free[i]!.x - q.x, free[i]!.y - q.y) >= ACTION_SPREAD_PX)) grow(i + 1, [...taken, free[i]!]);
  };
  grow(0, []);
  return most;
}

describe("the gap kept close in (#1078)", () => {
  for (const [name, avoidFor] of Object.entries(ROOMS))
    for (const width of PHONES) {
      const box = rect(0, 0, width, 720);
      const avoid = avoidFor(width);
      const onScreenClear = (at: ActionPlaces) => {
        for (const side of ACTION_SIDES) {
          expect(at[side].x - R).toBeGreaterThanOrEqual(MARGIN_PX - 0.5);
          expect(at[side].x + R).toBeLessThanOrEqual(width - MARGIN_PX + 0.5);
          for (const a of avoid) expect(meets(at[side], a.rect), side).toBe(false);
        }
      };

      it(`${name}, ${width} px, distance 300: the gap, clear of the HUD`, () => {
        const outline = projectCell(300, width, 720);
        const at = layoutTileActions(outline, box, avoid);
        expect(actionsClearance(at, outline)).toBeCloseTo(ACTION_GAP_PX, 1);
        onScreenClear(at);
      });

      it(`${name}, ${width} px, distance 10, the tile's edge on screen: the gap, out of the tile, on screen`, () => {
        for (const target of [
          { x: 1.5, z: 0 },
          { x: -1.5, z: 0 },
          { x: 0, z: -2 },
          { x: 1.6, z: -1.6 },
        ]) {
          const outline = projectCell(10, width, 720, target);
          const at = layoutTileActions(outline, box, avoid);
          expect(actionsClearance(at, outline), JSON.stringify(target)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 0.5);
          onScreenClear(at);
          // Each still at its corner of the group: Cancel left of Confirm, not below Rotate.
          expect(at["top-left"].x).toBeLessThan(at["top-right"].x);
          expect(at["top-left"].y).toBeLessThanOrEqual(at["bottom-left"].y);
        }
      });

      it(`${name}, ${width} px, distance 10, the tile centred: it fills the screen; the clamped places stay on screen`, () => {
        const outline = projectCell(10, width, 720);
        // Every corner of the screen is on the tile: no place outside it exists (only the camera could make one).
        for (const p of [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: 0, y: 720 },
          { x: width, y: 720 },
        ])
          expect(actionsClearance({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p }, outline)).toBeLessThan(0);
        onScreenClear(layoutTileActions(outline, box, avoid));
      });
    }

  it("a turned tile whose corner splits the room in two: each button on its own outside it (the review of #1078)", () => {
    // 375 x 720, distance 15, the compass at 45 degrees, the camera a unit up the board: the tile's top corner under the HUD.
    const avoid = ROOMS.board!(375);
    const outline = projectCell(15, 375, 720, { x: 0, z: -1 }, Math.PI / 4);
    const at = layoutTileActions(outline, rect(0, 0, 375, 720), avoid);
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 0.5);
    for (const a of ACTION_SIDES)
      for (const b of ACTION_SIDES) if (a < b) expect(Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y), `${a}/${b}`).toBeGreaterThanOrEqual(ACTION_SPREAD_PX);
    for (const side of ACTION_SIDES) {
      expect(at[side].x - R).toBeGreaterThanOrEqual(MARGIN_PX);
      expect(at[side].x + R).toBeLessThanOrEqual(375 - MARGIN_PX);
      for (const r of avoid) expect(meets(at[side], r.rect), side).toBe(false);
    }
    // Named by their places: the left column left of the right one, each top above its bottom.
    expect(Math.max(at["top-left"].x, at["bottom-left"].x)).toBeLessThanOrEqual(Math.min(at["top-right"].x, at["bottom-right"].x));
    expect(at["top-left"].y).toBeLessThanOrEqual(at["bottom-left"].y);
    expect(at["top-right"].y).toBeLessThanOrEqual(at["bottom-right"].y);
  });

  it("close in, whatever the compass and the pan: the gap kept wherever the room outside the tile can hold the four", () => {
    for (const [name, avoidFor] of Object.entries(ROOMS))
      for (const width of PHONES) {
        const box = rect(0, 0, width, 720);
        const avoid = avoidFor(width);
        for (const distance of [10, 15, 20, 30])
          for (const deg of [0, 15, 30, 45, 60, 75])
            for (const target of [
              { x: 0, z: 0 },
              { x: 0, z: -1 },
              { x: 1, z: 0 },
              { x: -1.5, z: 1 },
              { x: 2, z: -2 },
            ]) {
              const outline = projectCell(distance, width, 720, target, (deg * Math.PI) / 180);
              const at = layoutTileActions(outline, box, avoid);
              const label = `${name} ${width} d${distance} ${deg}deg ${JSON.stringify(target)}`;
              for (const side of ACTION_SIDES) {
                expect(at[side].x - R, label).toBeGreaterThanOrEqual(MARGIN_PX - 0.5);
                expect(at[side].x + R, label).toBeLessThanOrEqual(width - MARGIN_PX + 0.5);
                for (const a of avoid) expect(meets(at[side], a.rect), label).toBe(false);
              }
              for (const a of ACTION_SIDES)
                for (const b of ACTION_SIDES) if (a < b) expect(Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y), label).toBeGreaterThanOrEqual(ACTION_SPREAD_PX - 0.5);
              if (actionsClearance(at, outline) >= ACTION_GAP_PX - 0.5) continue;
              // Some on the tile: only where the room outside it holds fewer, the most it holds found by an exhaustive search.
              expect(clearCount(at, outline), label).toBeGreaterThanOrEqual(mostOutside(outline, width, avoid));
            }
      }
  });

  it("a small tile against the screen's side: the clamp would put a button on it, the four stand beside it instead", () => {
    const box = rect(0, 0, 375, 812);
    const outline = [
      { x: 303, y: 364 },
      { x: 377, y: 364 },
      { x: 380, y: 436 },
      { x: 300, y: 436 },
    ];
    expect(actionsClearance(clampActions(tileActionPlaces(outline), { left: 8, right: 367, top: 8, bottom: 804 }), outline)).toBeLessThan(ACTION_GAP_PX);
    const at = layoutTileActions(outline, box, []);
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 0.5);
    for (const side of ACTION_SIDES) expect(at[side].x + R).toBeLessThanOrEqual(375 - MARGIN_PX + 0.5);
  });

  it("a tile in the open: the places out of its sides, untouched", () => {
    const outline = [
      { x: 143, y: 364 },
      { x: 217, y: 364 },
      { x: 220, y: 436 },
      { x: 140, y: 436 },
    ];
    expect(layoutTileActions(outline, rect(0, 0, 375, 812), [])).toEqual(tileActionPlaces(outline));
  });
});
