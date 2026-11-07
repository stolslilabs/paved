/**
 * The actions on a tile being placed (TILE-ACTIONS, after the Paved UX Book's board screen): one round button out of each side of the
 * tile, placed from the tile's outline on screen, a constant gap in screen px at every zoom (the bubble before them stood on a corner
 * projected 2.625 world units above the board, so its gap grew as the player zoomed in), kept by their place on screen whatever the
 * compass, spread apart far out, and kept inside the room the HUD, the hand panel and the editor's side menu leave.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTION_GAP_PX,
  ACTION_PX,
  ACTION_SIDES,
  ACTION_SPREAD_PX,
  MARGIN_PX,
  actionRoom,
  actionsSpan,
  avoidOf,
  bubbleLimits,
  clampActions,
  tileActionPlaces,
  type ActionPlaces,
  type BubbleAvoid,
  type Point,
} from "../src/components/containers/tile-actions-layout";

const R = ACTION_PX / 2;
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** The play view's tile on screen: a square to the screen (the camera looks from the south), a little narrower at its far edge. */
function playTile(cx: number, cy: number, size: number): Point[] {
  const far = size * 0.92;
  return [
    { x: cx - far / 2, y: cy - size * 0.45 },
    { x: cx + far / 2, y: cy - size * 0.45 },
    { x: cx + size / 2, y: cy + size * 0.45 },
    { x: cx - size / 2, y: cy + size * 0.45 },
  ];
}

/** The outline turned by `angle` about its centre, its corners in another order (the compass hands them round). */
function turned(outline: Point[], angle: number, shift = 0): Point[] {
  const c = { x: outline.reduce((s, p) => s + p.x, 0) / 4, y: outline.reduce((s, p) => s + p.y, 0) / 4 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = outline.map((p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }));
  return [...out.slice(shift), ...out.slice(0, shift)];
}

/** The distance from `p` to the outline's edges. */
function gap(p: Point, outline: Point[]): number {
  let d = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return d;
}

const closest = (places: ActionPlaces) => {
  let d = Infinity;
  for (const a of ACTION_SIDES) for (const b of ACTION_SIDES) if (a !== b) d = Math.min(d, Math.hypot(places[a].x - places[b].x, places[a].y - places[b].y));
  return d;
};

describe("the tile's actions around it", () => {
  it("keep the same gap in screen px from the tile at every zoom (the zoom bug)", () => {
    for (const size of [40, 60, 120, 240, 480]) {
      const outline = playTile(180, 400, size);
      const places = tileActionPlaces(outline);
      // Each button's edge is ACTION_GAP_PX from the tile's outline, whatever its size on screen.
      for (const side of ACTION_SIDES) expect(gap(places[side], outline) - R, `${side} at ${size} px`).toBeCloseTo(ACTION_GAP_PX, 2);
    }
  });

  it("stand round the tile on screen's diagonals: Cancel up left, Confirm up right, Rotate down left, Discard down right", () => {
    const places = tileActionPlaces(playTile(180, 400, 120));
    expect(places["top-left"].x).toBeLessThan(180);
    expect(places["top-left"].y).toBeLessThan(400);
    expect(places["top-right"].x).toBeGreaterThan(180);
    expect(places["top-right"].y).toBeLessThan(400);
    expect(places["bottom-left"].x).toBeLessThan(180);
    expect(places["bottom-left"].y).toBeGreaterThan(400);
    expect(places["bottom-right"].x).toBeGreaterThan(180);
    expect(places["bottom-right"].y).toBeGreaterThan(400);
    // Outside the tile: on the play view's square, out of its corners.
    expect(places["top-left"].x).toBeLessThan(180 - 120 * 0.46);
    expect(places["bottom-right"].y).toBeGreaterThan(400 + 120 * 0.45);
  });

  it("on the book's diamond, each stands out of the middle of its side, along the side's normal", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const diamond = turned(square, Math.PI / 4);
    const places = tileActionPlaces(diamond);
    // The up-left side runs from the left corner to the top one; its middle and outward normal.
    const left = diamond.reduce((a, b) => (b.x < a.x ? b : a));
    const top = diamond.reduce((a, b) => (b.y < a.y ? b : a));
    const mid = { x: (left.x + top.x) / 2, y: (left.y + top.y) / 2 };
    const d = R + ACTION_GAP_PX;
    expect(places["top-left"].x).toBeCloseTo(mid.x - d * Math.SQRT1_2, 3);
    expect(places["top-left"].y).toBeCloseTo(mid.y - d * Math.SQRT1_2, 3);
  });

  it("keep their sides by their place on screen when the compass turns: Confirm stays at the top right, Discard at the bottom right", () => {
    const outline = playTile(200, 300, 150);
    const plain = tileActionPlaces(outline);
    for (const angle of [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, -Math.PI / 5]) {
      for (const shift of [0, 1, 2, 3]) {
        const places = tileActionPlaces(turned(outline, angle, shift));
        expect(places["bottom-right"].x, `${angle}/${shift}`).toBeGreaterThan(200);
        expect(places["bottom-right"].y, `${angle}/${shift}`).toBeGreaterThan(300);
        expect(places["top-left"].x).toBeLessThan(200);
        expect(places["top-left"].y).toBeLessThan(300);
        expect(places["top-right"].x).toBeGreaterThan(200);
        expect(places["top-right"].y).toBeLessThan(300);
        expect(places["bottom-left"].x).toBeLessThan(200);
        expect(places["bottom-left"].y).toBeGreaterThan(300);
      }
    }
    // A quarter turn of a square hands the same four corners round: the same four places.
    const square = playTile(200, 300, 150).map((p, i) => (i < 2 ? { ...p, x: 200 + (p.x - 200) / 0.92 } : p));
    const quarter = tileActionPlaces(turned(square, Math.PI / 2, 1));
    const still = tileActionPlaces(square);
    for (const side of ACTION_SIDES) {
      expect(quarter[side].x, side).toBeCloseTo(still[side].x, 0);
      expect(quarter[side].y, side).toBeCloseTo(still[side].y, 0);
    }
    expect(plain["bottom-right"]).toEqual(tileActionPlaces(outline)["bottom-right"]);
  });

  it("far out, spread apart so the 44 px targets never meet, their shape kept", () => {
    for (const size of [0, 2, 8, 12]) {
      const places = tileActionPlaces(playTile(180, 400, size));
      expect(closest(places), `${size} px`).toBeGreaterThanOrEqual(ACTION_SPREAD_PX - 1e-6);
      expect(places["top-left"].x).toBeLessThan(places["top-right"].x);
      expect(places["top-left"].y).toBeLessThan(places["bottom-left"].y);
    }
    // A tile of a single point (the outline collapsed): still four places, apart.
    expect(closest(tileActionPlaces([{ x: 50, y: 50 }]))).toBeGreaterThanOrEqual(ACTION_SPREAD_PX - 1e-6);
    // Large enough, no spread: the gap is the constant one.
    const near = playTile(180, 400, 60);
    expect(gap(tileActionPlaces(near)["top-left"], near) - R).toBeCloseTo(ACTION_GAP_PX, 2);
  });
});

describe("the actions kept inside the room", () => {
  const box = rect(0, 0, 375, 812);
  const free = { left: MARGIN_PX, right: 375 - MARGIN_PX, top: MARGIN_PX, bottom: 812 - MARGIN_PX };

  it("leaves the actions by a tile in the open where they are", () => {
    const places = tileActionPlaces(playTile(180, 400, 80));
    expect(clampActions(places, free)).toEqual(places);
  });

  it("pins each button against the edge it would cross, the others staying by the tile", () => {
    // The tile near the right edge: its right buttons would cross it, its left ones are a spread clear of them.
    const places = tileActionPlaces(playTile(340, 400, 80));
    const at = clampActions(places, free);
    expect(at["top-right"].x).toBe(375 - MARGIN_PX - R);
    expect(at["bottom-right"].x).toBe(375 - MARGIN_PX - R);
    // The left ones are not pushed: they still fit.
    expect(at["top-left"]).toEqual(places["top-left"]);
    expect(at["bottom-left"]).toEqual(places["bottom-left"]);
    // Nearer the edge, a left button comes with its pinned partner rather than meet it.
    const edge = clampActions(tileActionPlaces(playTile(360, 400, 80)), free);
    expect(edge["top-right"].x - edge["top-left"].x).toBe(ACTION_SPREAD_PX);
  });

  it("never lets two buttons pinned to one edge or corner meet", () => {
    // The tile off the screen's top right corner: all four pinned, each its own place.
    const at = clampActions(tileActionPlaces(playTile(500, -100, 80)), free);
    expect(closest(at)).toBeGreaterThanOrEqual(ACTION_SPREAD_PX);
    for (const side of ACTION_SIDES) {
      expect(at[side].x).toBeLessThanOrEqual(375 - MARGIN_PX - R);
      expect(at[side].y).toBeGreaterThanOrEqual(MARGIN_PX + R);
    }
    expect(at["top-left"].x).toBeLessThan(at["top-right"].x);
    expect(at["top-right"].y).toBeLessThan(at["bottom-right"].y);
  });

  it("never goes under the HUD or the hand panel", () => {
    const hud = rect(0, 0, 375, 96);
    const hand = rect(8, 520, 359, 284);
    // A tile just under the HUD: the top buttons under it, the bottom ones by the tile.
    const high = tileActionPlaces(playTile(180, 130, 80));
    const span = actionsSpan(high);
    const room = bubbleLimits(box, [hud, hand], span.x, span.width);
    expect(room.top).toBe(96 + MARGIN_PX);
    expect(room.bottom).toBe(520 - MARGIN_PX);
    const at = clampActions(high, room);
    expect(at["top-left"].y).toBe(96 + MARGIN_PX + R);
    expect(at["top-right"].y).toBe(96 + MARGIN_PX + R);
    expect(at["bottom-left"]).toEqual(high["bottom-left"]);
    // Higher, the bottom buttons come down with the pinned top ones rather than meet them.
    const higher = clampActions(tileActionPlaces(playTile(180, 100, 80)), room);
    expect(higher["bottom-left"].y - higher["top-left"].y).toBe(ACTION_SPREAD_PX);
    // A tile behind the hand panel: every button above it.
    const low = clampActions(tileActionPlaces(playTile(180, 700, 80)), room);
    for (const side of ACTION_SIDES) expect(low[side].y + R).toBeLessThanOrEqual(520 - MARGIN_PX);
  });

  it("ignores a panel the buttons do not overlap horizontally (the hand panel on the right from tablet)", () => {
    const room = bubbleLimits(rect(0, 0, 900, 812), [rect(500, 520, 384, 284)], 50, 150);
    expect(room.bottom).toBe(812 - MARGIN_PX);
  });

  it("spans the four places, absent actions included (the others never move)", () => {
    const places = tileActionPlaces(playTile(180, 400, 80));
    const span = actionsSpan(places);
    expect(span.x).toBeCloseTo(Math.min(places["top-left"].x, places["bottom-left"].x) - R, 6);
    expect(span.x + span.width).toBeCloseTo(Math.max(places["top-right"].x, places["bottom-right"].x) + R, 6);
  });
});

/**
 * The home editor's room (EDIT-VILLAGE, #1033): the side menu from `tablet` is told by its marks (`data-edit-panel="side"`, its bar
 * `data-edit-bar="docked"`), never by its place, so the actions keep left of it whether the menu is exactly half the screen (a 768 px
 * tablet) or its 22 rem minimum, past the half of a narrow one (640 px); the floating bar and a phone's sheet keep them from the top
 * and the foot.
 */
describe("the editor's actions keep left of the side menu (#1033)", () => {
  /** Where the actions land for a tile at `centre`, as `TileBubble`'s `place` puts them. */
  function placed(box: DOMRect, avoid: readonly BubbleAvoid[], centre: { x: number; y: number }, size = 80) {
    const free = tileActionPlaces(playTile(centre.x, centre.y, size));
    const span = actionsSpan(free);
    return { free, at: clampActions(free, actionRoom(box, avoid, span.x, span.width)) };
  }
  /** A tablet's dock: the bar docked at the top right (64 px), the menu under it to the foot, `width` wide. */
  function dock(screen: { width: number; height: number }, width: number): BubbleAvoid[] {
    const left = screen.width - width;
    return [
      { rect: rect(left, 0, width, 64), side: true },
      { rect: rect(left, 64, width, screen.height - 64), side: true },
    ];
  }

  it("at exactly half a 768 x 720 tablet: the right buttons end before the menu, the left ones by the tile", () => {
    const box = rect(0, 0, 768, 720);
    const { free, at } = placed(box, dock(box, 384), { x: 340, y: 300 });
    for (const side of ACTION_SIDES) expect(at[side].x + R).toBeLessThanOrEqual(384 - MARGIN_PX);
    // By the tile: not pushed under the docked bar's band.
    expect(at["top-left"]).toEqual(free["top-left"]);
    expect(at["top-right"].y).toBe(free["top-right"].y);
  });

  it("at the menu's 22 rem minimum, past the half of a 640 px tablet", () => {
    const box = rect(0, 0, 640, 720);
    const { free, at } = placed(box, dock(box, 352), { x: 260, y: 400 });
    for (const side of ACTION_SIDES) expect(at[side].x + R).toBeLessThanOrEqual(288 - MARGIN_PX);
    expect(at["bottom-left"].y).toBe(free["bottom-left"].y);
  });

  it("on a phone: the floating bar keeps them from the top, the sheet from the foot, the full width theirs", () => {
    const box = rect(0, 0, 375, 720);
    const avoid: BubbleAvoid[] = [
      { rect: rect(8, 8, 359, 56), side: false },
      { rect: rect(0, 439, 375, 281), side: false },
    ];
    // A tile under the bar: the top buttons under the bar.
    expect(placed(box, avoid, { x: 180, y: 60 }).at["top-left"].y - R).toBe(64 + MARGIN_PX);
    // A tile behind the sheet: the bottom buttons above it.
    expect(placed(box, avoid, { x: 180, y: 600 }).at["bottom-right"].y + R).toBe(439 - MARGIN_PX);
    // The right edge: the screen's.
    expect(placed(box, avoid, { x: 370, y: 300 }).at["top-right"].x + R).toBe(375 - MARGIN_PX);
  });
});

describe("the side menu is told by its marks", () => {
  afterEach(() => document.body.replaceChildren());

  it("reads data-edit-panel and data-edit-bar, whatever the element's place", () => {
    const mark = (attrs: Record<string, string>) => {
      const e = document.createElement("div");
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      document.body.append(e);
      return e;
    };
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-panel": "side" })).side).toBe(true);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-bar": "docked" })).side).toBe(true);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-panel": "sheet" })).side).toBe(false);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-bar": "float" })).side).toBe(false);
    expect(avoidOf(mark({ "data-bubble-avoid": "" })).side).toBe(false);
  });
});
