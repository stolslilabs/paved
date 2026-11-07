/**
 * TILE-ACTIONS: where the actions on a tile in hand stand, after the Paved UX Book's board screen (mockup 3 of "Resume a Challenge"):
 * one round button out of each side of the tile, Cancel up and left of it, Rotate down and left, Confirm up and right, Discard (or the
 * editor's Back to the inventory) down and right (the owner's order of 2026-11-07). Pure geometry in CSS px of the board's box, no DOM,
 * so the tests measure it.
 *
 * Every place is computed from the tile's outline on screen (the four corners of its cell at the slab's top, `projectCellOutline`) at
 * each camera notification: the gap between a button and the tile is a number of screen px, the same at every zoom. (The bubble before
 * it stood on a corner projected at the tallest tile's height, 2.625 world units above the board: a height in the scene, so its gap to
 * the tile grew as the player zoomed in and shrank as they zoomed out.)
 */

export interface Point {
  x: number;
  y: number;
}

/** Where the actions may stand, in CSS px of the board's box: the room the HUD, the hand panel and the side menu leave. */
export interface BubbleLimits {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The clearance kept from the box edge and from the HUD, the hand panel and the side menu. */
export const MARGIN_PX = 8;

/**
 * The four places, by where they stand on screen around the tile, in reading order (the DOM's, the keyboard's): Cancel, Confirm,
 * Rotate and Discard.
 */
export const ACTION_SIDES = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type ActionSide = (typeof ACTION_SIDES)[number];
export type ActionPlaces = Record<ActionSide, Point>;

/**
 * Each place's way out of the tile: a diagonal of the screen, whatever the compass or the camera, so Confirm stays at the top right
 * however the board turns. On the book's diamond these rays leave the tile at the middle of its sides; on the play view's square
 * (the camera looks at the board from the south, the cells square to the screen) at its corners.
 */
const OUT: Record<ActionSide, Point> = {
  "top-left": { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  "top-right": { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  "bottom-left": { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  "bottom-right": { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};

/** A button: 44 px round, the touch floor. */
export const ACTION_PX = 44;
/** The clearance between a button's edge and the tile's outline, screen px: the same at every zoom. */
export const ACTION_GAP_PX = 6;
/** The least distance between two buttons' centres, however small the tile is on screen: their 44 px targets 8 px apart. */
export const ACTION_SPREAD_PX = ACTION_PX + 8;

const R = ACTION_PX / 2;

/** The distance from `p` to the segment `a`-`b`. */
function toSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from `p` to the outline (its edges; a point inside is counted by its distance to them too). */
function toOutline(p: Point, outline: readonly Point[]): number {
  let d = Infinity;
  for (let i = 0; i < outline.length; i++) d = Math.min(d, toSegment(p, outline[i]!, outline[(i + 1) % outline.length]!));
  return d;
}

/** How far along `dir` from `from` the ray leaves the outline (0 when it is degenerate: a point, a line). */
function exitAlong(from: Point, dir: Point, outline: readonly Point[]): number {
  let t = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ax = a.x - from.x;
    const ay = a.y - from.y;
    const along = (ax * ey - ay * ex) / den;
    const on = (ax * dir.y - ay * dir.x) / den;
    if (along > 1e-9 && on >= -1e-9 && on <= 1 + 1e-9) t = Math.min(t, along);
  }
  return Number.isFinite(t) ? t : 0;
}

/**
 * The buttons' centres around a tile whose outline on screen is `outline` (its cell's corners, in any order around it), before any
 * room is minded:
 *
 * 1. from the tile's centre, along each place's diagonal, to where it leaves the outline;
 * 2. on outward until the button's edge is `ACTION_GAP_PX` from the outline (its nearest point: a side, or a corner);
 * 3. far out, where the tile is so small that two buttons would come closer than `ACTION_SPREAD_PX`, all four are spread from the
 *    centre together until none does. The four are placed even when an action is absent, so the others never move.
 */
export function tileActionPlaces(outline: readonly Point[]): ActionPlaces {
  const n = Math.max(outline.length, 1);
  const centre = { x: outline.reduce((s, p) => s + p.x, 0) / n, y: outline.reduce((s, p) => s + p.y, 0) / n };
  const clear = R + ACTION_GAP_PX;
  const reach = {} as Record<ActionSide, number>;
  for (const side of ACTION_SIDES) {
    const dir = OUT[side];
    const at = (t: number) => ({ x: centre.x + dir.x * t, y: centre.y + dir.y * t });
    const exit = outline.length > 1 ? exitAlong(centre, dir, outline) : 0;
    const off = (t: number) => (outline.length > 1 ? toOutline(at(t), outline) : t);
    // The distance to a convex outline grows along the ray past its exit: bracket the clearance, then halve the bracket.
    let lo = exit;
    let hi = exit + clear;
    for (let i = 0; i < 16 && off(hi) < clear; i++) hi = exit + (hi - exit) * 2;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (off(mid) < clear) lo = mid;
      else hi = mid;
    }
    reach[side] = hi;
  }
  // The spread: one factor for the four, so their shape is kept.
  let spread = 1;
  for (let i = 0; i < ACTION_SIDES.length; i++)
    for (let j = i + 1; j < ACTION_SIDES.length; j++) {
      const a = ACTION_SIDES[i]!;
      const b = ACTION_SIDES[j]!;
      const d = Math.hypot(OUT[a].x * reach[a] - OUT[b].x * reach[b], OUT[a].y * reach[a] - OUT[b].y * reach[b]);
      if (d > 0 && d < ACTION_SPREAD_PX) spread = Math.max(spread, ACTION_SPREAD_PX / d);
    }
  const places = {} as ActionPlaces;
  for (const side of ACTION_SIDES) places[side] = { x: centre.x + OUT[side].x * reach[side] * spread, y: centre.y + OUT[side].y * reach[side] * spread };
  return places;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Each button kept inside `room` (a button wholly in it), on its own: a tile under the HUD or the hand panel keeps its other buttons by
 * it. A left place keeps one spread clear of the room's right edge, a top place of its foot (and the other way round), so two buttons
 * pushed against the same edge never meet.
 */
export function clampActions(places: ActionPlaces, room: BubbleLimits): ActionPlaces {
  const left = room.left + R;
  const right = room.right - R;
  const top = room.top + R;
  const bottom = room.bottom - R;
  const out = {} as ActionPlaces;
  for (const side of ACTION_SIDES) {
    const west = side.endsWith("left");
    const north = side.startsWith("top");
    out[side] = {
      x: clamp(places[side].x, west ? left : left + ACTION_SPREAD_PX, west ? right - ACTION_SPREAD_PX : right),
      y: clamp(places[side].y, north ? top : top + ACTION_SPREAD_PX, north ? bottom - ACTION_SPREAD_PX : bottom),
    };
  }
  return out;
}

/** The buttons' span across the box: their left edge and width, for the room's horizontal test (`bubbleLimits`). */
export function actionsSpan(places: ActionPlaces): { x: number; width: number } {
  const xs = ACTION_SIDES.map((s) => places[s].x);
  const min = Math.min(...xs);
  return { x: min - R, width: Math.max(...xs) - min + ACTION_PX };
}

/**
 * The limits in `box`: its edges less a margin, then the elements marked `data-bubble-avoid` (the HUD, the hand panel) that the
 * buttons' span (`x`, `width`) would overlap horizontally push the top or the bottom limit in, by the side they are on.
 */
export function bubbleLimits(box: DOMRect, avoid: Iterable<DOMRect>, x: number, width: number): BubbleLimits {
  const limits: BubbleLimits = { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX };
  for (const r of avoid) {
    const left = r.left - box.left;
    if (left >= x + width || left + r.width <= x) continue;
    const top = r.top - box.top;
    if (top + r.height / 2 < box.height / 2) limits.top = Math.max(limits.top, top + r.height + MARGIN_PX);
    else limits.bottom = Math.min(limits.bottom, top - MARGIN_PX);
  }
  return limits;
}

/** A part of the screen the actions keep clear of: its box, and whether it is the editor's side menu (#1033). */
export interface BubbleAvoid {
  rect: DOMRect;
  side: boolean;
}

/** An element marked `data-bubble-avoid` as the actions keep clear of it: the side menu by its marks, not its place or size. */
export const avoidOf = (e: Element): BubbleAvoid => ({
  rect: e.getBoundingClientRect(),
  side: e.getAttribute("data-edit-panel") === "side" || e.getAttribute("data-edit-bar") === "docked",
});

/**
 * The actions' room in `box`: the editor's side menu from `tablet` (`data-edit-panel="side"`, its bar docked in its head:
 * `data-edit-bar="docked"`, #1033) narrows it from the right, wherever its edge falls (half a tablet's screen to the pixel, or its
 * 22 rem past the half of a narrow one); the HUD, the hand panel, the floating bar and a phone's sheet from the top and the foot
 * (`bubbleLimits`).
 */
export function actionRoom(box: DOMRect, avoid: readonly BubbleAvoid[], x: number, width: number): BubbleLimits {
  const room = bubbleLimits(
    box,
    avoid.filter((a) => !a.side).map((a) => a.rect),
    x,
    width,
  );
  for (const a of avoid) if (a.side) room.right = Math.min(room.right, a.rect.left - box.left - MARGIN_PX);
  return room;
}
