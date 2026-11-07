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
