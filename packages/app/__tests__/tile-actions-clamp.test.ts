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
  layoutTileAction,
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

/**
 * The board's HUD and hand panel on a phone; the home editor's floating bar and sheet; and a board whose foot is two parts that do
 * not span it (a hand panel on the right, a dial on the left: the review's), so the buttons may stand between and above them.
 */
const ROOMS: Record<string, (w: number) => BubbleAvoid[]> = {
  "board, parted foot": (w) => [
    { rect: rect(0, 0, w, 96), side: false },
    { rect: rect(w - 175, 520, 167, 192), side: false },
    { rect: rect(8, 616, 96, 96), side: false },
  ],
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
const clearCount = (at: ActionPlaces, outline: Point[]) => ACTION_SIDES.filter((s) => clearAt(at[s], outline) >= ACTION_GAP_PX - 1e-6).length;

/**
 * The most buttons (up to four) a `step` px grid of the room holds the gap clear of the tile and `ACTION_SPREAD_PX` apart: every set of
 * its clear places, searched exhaustively. A lower bound of what the continuous room holds, independent of the layout's own search
 * (which also places buttons off the grid, on the bounds and on one another's spread): the layout must do at least as well.
 */
function mostOutside(outline: Point[], width: number, avoid: BubbleAvoid[], step = 2): number {
  // Each part avoided on its own: a target `MARGIN_PX` clear of it, whatever its width.
  const near = (p: Point) => avoid.some(({ rect: r }) => meets(p, rect(r.left - MARGIN_PX, r.top - MARGIN_PX, r.width + 2 * MARGIN_PX, r.height + 2 * MARGIN_PX)));
  const free: Point[] = [];
  for (let x = MARGIN_PX + R; x <= width - MARGIN_PX - R; x += step)
    for (let y = MARGIN_PX + R; y <= 720 - MARGIN_PX - R; y += step) if (!near({ x, y }) && clearAt({ x, y }, outline) >= ACTION_GAP_PX) free.push({ x, y });
  let most = 0;
  const taken: Point[] = [];
  const grow = (from: number) => {
    most = Math.max(most, taken.length);
    for (let i = from; i < free.length && most < 4; i++) {
      const p = free[i]!;
      if (taken.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < ACTION_SPREAD_PX)) continue;
      taken.push(p);
      grow(i + 1);
      taken.pop();
    }
  };
  grow(0);
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
          expect(actionsClearance(at, outline), JSON.stringify(target)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1e-6);
          onScreenClear(at);
          // Named by their places on screen: Cancel not right of Confirm nor below Rotate, Discard not left of Rotate nor above
          // Confirm (a column along the tile's side reads down: Cancel, Confirm, Rotate, Discard).
          expect(at["top-left"].x).toBeLessThanOrEqual(at["top-right"].x);
          expect(at["top-left"].y).toBeLessThanOrEqual(at["bottom-left"].y);
          expect(at["bottom-left"].x).toBeLessThanOrEqual(at["bottom-right"].x);
          expect(at["top-right"].y).toBeLessThanOrEqual(at["bottom-right"].y);
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
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1e-6);
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

  it("a narrow room by a turned tile: the four packed on its bounds, off any grid (the second review of #1078)", () => {
    // 320 x 720, distance 19.5, the compass at 41.5 degrees: the room outside the tile a corner by the hand panel.
    const avoid = ROOMS.board!(320);
    const outline = projectCell(19.5, 320, 720, { x: -0.67, z: 0.55 }, (41.5 * Math.PI) / 180);
    const at = layoutTileActions(outline, rect(0, 0, 320, 720), avoid);
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX);
    for (const a of ACTION_SIDES)
      for (const b of ACTION_SIDES) if (a < b) expect(Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y), `${a}/${b}`).toBeGreaterThanOrEqual(ACTION_SPREAD_PX);
    for (const side of ACTION_SIDES) {
      expect(at[side].x - R).toBeGreaterThanOrEqual(MARGIN_PX);
      expect(at[side].x + R).toBeLessThanOrEqual(320 - MARGIN_PX);
      for (const r of avoid) expect(meets(at[side], r.rect), side).toBe(false);
    }
  });

  it("beside parts that do not span the screen: the buttons between and above them, not on the tile (the third review of #1078)", () => {
    // 375 x 720, distance 10, the camera 0.9 down the board: the tile's foot at y 522.6, a dial and a hand panel below it.
    const avoid = ROOMS["board, parted foot"]!(375);
    const outline = projectCell(10, 375, 720, { x: 0, z: 0.9 });
    const at = layoutTileActions(outline, rect(0, 0, 375, 720), avoid);
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX);
    for (const a of ACTION_SIDES)
      for (const b of ACTION_SIDES) if (a < b) expect(Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y), `${a}/${b}`).toBeGreaterThanOrEqual(ACTION_SPREAD_PX - 1e-6);
    for (const side of ACTION_SIDES) {
      expect(at[side].x - R).toBeGreaterThanOrEqual(MARGIN_PX);
      expect(at[side].x + R).toBeLessThanOrEqual(375 - MARGIN_PX);
      expect(at[side].y + R).toBeLessThanOrEqual(720 - MARGIN_PX);
      for (const { rect: r } of avoid) expect(meets(at[side], rect(r.left - MARGIN_PX, r.top - MARGIN_PX, r.width + 2 * MARGIN_PX, r.height + 2 * MARGIN_PX)), side).toBe(false);
    }
  });

  it("close in, poses drawn at random (seeded): no button on the tile where a 2 px grid of the room outside holds the four", () => {
    let seed = 20261107;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 400; k++) {
      const width = PHONES[Math.floor(rnd() * PHONES.length)]!;
      const names = Object.keys(ROOMS);
      const name = names[Math.floor(rnd() * names.length)]!;
      const avoid = ROOMS[name]!(width);
      const pose = { distance: 10 + rnd() * 30, target: { x: (rnd() - 0.5) * 6, z: (rnd() - 0.5) * 6 }, deg: rnd() * 90 };
      const outline = projectCell(pose.distance, width, 720, pose.target, (pose.deg * Math.PI) / 180);
      const at = layoutTileActions(outline, rect(0, 0, width, 720), avoid);
      const label = `${name} ${width} ${JSON.stringify(pose)}`;
      for (const side of ACTION_SIDES) for (const a of avoid) expect(meets(at[side], a.rect), label).toBe(false);
      if (actionsClearance(at, outline) >= ACTION_GAP_PX - 1e-6) continue;
      expect(clearCount(at, outline), label).toBeGreaterThanOrEqual(mostOutside(outline, width, avoid));
    }
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
              if (actionsClearance(at, outline) >= ACTION_GAP_PX - 1e-6) continue;
              // Some on the tile: only where a 4 px grid of the room outside it holds no more (`mostOutside`; the random poses use 2 px).
              expect(clearCount(at, outline), label).toBeGreaterThanOrEqual(mostOutside(outline, width, avoid, 4));
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
    expect(actionsClearance(at, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1e-6);
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

describe("one action alone keeps the gap by a corner of the room (#1111)", () => {
  /**
   * The Codex review of PRESS-BUILD's figures at 375 x 812: the tile's outline on screen, the mission above the dock and the home's
   * right column of tiles (a side). The clamp left Edit village at (275, 645), 3.8 px from the tile, though (275, 641) keeps the gap.
   * At 320 and 360 px the outline and the column move with the right edge.
   */
  const OUTLINE: Point[] = [
    { x: 278.2632285902623, y: 670.5927862230449 },
    { x: 321.7367714097377, y: 670.5927862230449 },
    { x: 321.8357672085515, y: 709.4072137769549 },
    { x: 278.1642327914485, y: 709.4072137769549 },
  ];
  const MISSION = rect(10, 675, 285, 40);
  const one = (p: Point): ActionPlaces => ({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p });

  for (const width of PHONES) {
    it(`at ${width} px: the gap kept, the HUD clear, no farther from its own place than the review's (275, 641)`, () => {
      const dx = width - 375;
      const outline = OUTLINE.map((p) => ({ x: p.x + dx, y: p.y }));
      const column = rect(305 + dx, 270, 60, 275);
      const avoid: BubbleAvoid[] = [
        { rect: MISSION, side: false },
        { rect: column, side: true },
      ];
      const at = layoutTileAction("top-right", outline, rect(0, 0, width, 812), avoid);
      const known = { x: 275 + dx, y: 641 };
      expect(actionsClearance(one(known), outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX);
      expect(actionsClearance(one(at), outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1e-6);
      expect(meets(at, MISSION)).toBe(false);
      expect(at.x + R).toBeLessThanOrEqual(column.left - MARGIN_PX + 1e-6);
      expect(at.x - R).toBeGreaterThanOrEqual(MARGIN_PX - 1e-6);
      expect(at.y - R).toBeGreaterThanOrEqual(MARGIN_PX - 1e-6);
      const own = tileActionPlaces(outline)["top-right"];
      expect(Math.hypot(at.x - own.x, at.y - own.y)).toBeLessThanOrEqual(Math.hypot(known.x - own.x, known.y - own.y) + 1e-6);
    });
  }
});
