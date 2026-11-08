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
 *
 * `layoutTileActions` is the whole of it, as the tile's actions put their buttons: the places, the room (whose HUD limit is measured on
 * the places as the side edges leave them, #1078), the clamp, and the close-zoom fallback that keeps the gap when the clamp would put a
 * button on the tile.
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

/** The length of (`x`, `y`): `Math.hypot` without its cost (it runs in the close-zoom search's inner loops). */
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);

/** The distance from `p` to the segment `a`-`b`. */
function toSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return hyp(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
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
      const d = hyp(OUT[a].x * reach[a] - OUT[b].x * reach[b], OUT[a].y * reach[a] - OUT[b].y * reach[b]);
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

/** The places with their left and right edges of `room` minded only: the span the HUD, the hand panel and the bar are tested on. */
function across(places: ActionPlaces, room: Pick<BubbleLimits, "left" | "right">): ActionPlaces {
  return clampActions(places, { ...room, top: -Infinity, bottom: Infinity });
}

/** Every button wholly inside `room`. */
function inside(places: ActionPlaces, room: BubbleLimits): boolean {
  return ACTION_SIDES.every((s) => {
    const p = places[s];
    return p.x - R >= room.left - 0.5 && p.x + R <= room.right + 0.5 && p.y - R >= room.top - 0.5 && p.y + R <= room.bottom + 0.5;
  });
}

/** `p` is inside the convex outline (in either winding). */
function within(p: Point, outline: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/**
 * The least gap between a button's edge and the tile's outline, screen px; negative when a button's centre is on the tile. A tile of
 * fewer than three corners (a point, a line: far out) has no inside, only its distance.
 */
export function actionsClearance(places: ActionPlaces, outline: readonly Point[]): number {
  let least = Infinity;
  for (const side of ACTION_SIDES) {
    const p = places[side];
    const d = outline.length > 1 ? toOutline(p, outline) : outline.length ? hyp(p.x - outline[0]!.x, p.y - outline[0]!.y) : Infinity;
    least = Math.min(least, outline.length > 2 && within(p, outline) ? -d - R : d - R);
  }
  return least;
}

/** How many of the buttons stand `ACTION_GAP_PX` clear of the outline. */
function clearOf(places: ActionPlaces, outline: readonly Point[]): number {
  return ACTION_SIDES.filter((s) => {
    const p = places[s];
    return actionsClearance({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p }, outline) >= ACTION_GAP_PX - 1e-6;
  }).length;
}

/**
 * A centre `p` inside one of `blocks`: the parts of the screen the buttons avoid, each grown by the margin and a button's half, so a
 * centre on its edge puts the button's target `MARGIN_PX` clear of the part.
 */
function blocked(p: Point, blocks: readonly BubbleLimits[]): boolean {
  return blocks.some((k) => p.x > k.left + 1e-6 && p.x < k.right - 1e-6 && p.y > k.top + 1e-6 && p.y < k.bottom - 1e-6);
}

/** A curve the packing's critical places lie on: a segment, or a circle. */
type Curve = { a: Point; b: Point } | { c: Point; r: number };

/** Where two curves cross (the segments' ends included, the circles whole). */
function crossings(p: Curve, q: Curve): Point[] {
  if ("a" in p && "a" in q) {
    const d1 = { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
    const d2 = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-12) return [];
    const ax = q.a.x - p.a.x;
    const ay = q.a.y - p.a.y;
    const t = (ax * d2.y - ay * d2.x) / den;
    const u = (ax * d1.y - ay * d1.x) / den;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [{ x: p.a.x + t * d1.x, y: p.a.y + t * d1.y }] : [];
  }
  if ("c" in p && "a" in q) return crossings(q, p);
  if ("a" in p && "c" in q) {
    const d = { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
    const f = { x: p.a.x - q.c.x, y: p.a.y - q.c.y };
    const A = d.x * d.x + d.y * d.y;
    const B = 2 * (f.x * d.x + f.y * d.y);
    const C = f.x * f.x + f.y * f.y - q.r * q.r;
    const disc = B * B - 4 * A * C;
    if (A < 1e-12 || disc < 0) return [];
    const root = Math.sqrt(disc);
    return [(-B - root) / (2 * A), (-B + root) / (2 * A)].filter((t) => t >= -1e-9 && t <= 1 + 1e-9).map((t) => ({ x: p.a.x + t * d.x, y: p.a.y + t * d.y }));
  }
  if ("c" in p && "c" in q) {
    const dx = q.c.x - p.c.x;
    const dy = q.c.y - p.c.y;
    const d = hyp(dx, dy);
    if (d < 1e-9 || d > p.r + q.r || d < Math.abs(p.r - q.r)) return [];
    const along = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, p.r * p.r - along * along));
    const mx = p.c.x + (dx * along) / d;
    const my = p.c.y + (dy * along) / d;
    return [
      { x: mx - (dy * h) / d, y: my + (dx * h) / d },
      { x: mx + (dy * h) / d, y: my - (dx * h) / d },
    ];
  }
  return [];
}

/** The most nodes `criticalPacking`'s search visits. */
const CRITICAL_SEARCH_NODES = 5_000;
/** The slack `criticalPacking` keeps past each bound, screen px: its places rest on the bounds, so rounding never crosses one. */
const CRITICAL_SLACK_PX = 0.05;

/**
 * Up to four button centres outside the tile, `clear` from its outline, inside the centres' rectangle `x0`..`x1` by `y0`..`y1`, each
 * `ACTION_SPREAD_PX` from the others, found among the critical places of a tight packing: where two of the region's bounding curves
 * cross (the rectangle's sides; the tile's sides pushed out by `clear` and the circles of that radius round its corners; the circle of
 * `ACTION_SPREAD_PX` round each centre already placed). A packing pushed as far as it goes into a corner of the region rests on such
 * crossings, so a narrow region that holds four is packed exactly here where a grid would miss it. A depth-first search, bounded.
 */
function criticalPacking(outline: readonly Point[], box: { x0: number; x1: number; y0: number; y1: number }, clear: number, blocks: readonly BubbleLimits[]): Point[] {
  const { x0, x1, y0, y1 } = box;
  clear += CRITICAL_SLACK_PX;
  const spread = ACTION_SPREAD_PX + CRITICAL_SLACK_PX;
  const n = outline.length;
  const centre = { x: outline.reduce((s, p) => s + p.x, 0) / n, y: outline.reduce((s, p) => s + p.y, 0) / n };
  const curves: Curve[] = [
    { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
    { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
    { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
    { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
  ];
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const len = hyp(b.x - a.x, b.y - a.y);
    curves.push({ c: a, r: clear });
    if (len < 1e-9) continue;
    let nx = (b.y - a.y) / len;
    let ny = -(b.x - a.x) / len;
    if (nx * (centre.x - a.x) + ny * (centre.y - a.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
    curves.push({ a: { x: a.x + nx * clear, y: a.y + ny * clear }, b: { x: b.x + nx * clear, y: b.y + ny * clear } });
  }
  for (const k of blocks) {
    const c = [
      { x: k.left, y: k.top },
      { x: k.right, y: k.top },
      { x: k.right, y: k.bottom },
      { x: k.left, y: k.bottom },
    ];
    for (let i = 0; i < 4; i++) curves.push({ a: c[i]!, b: c[(i + 1) % 4]! });
  }
  const ok = (p: Point) =>
    p.x >= x0 - 1e-6 &&
    p.x <= x1 + 1e-6 &&
    p.y >= y0 - 1e-6 &&
    p.y <= y1 + 1e-6 &&
    !blocked(p, blocks) &&
    !within(p, outline) &&
    toOutline(p, outline) >= clear - 1e-6;
  const snap = (p: Point) => ({ x: Math.min(Math.max(p.x, x0), x1), y: Math.min(Math.max(p.y, y0), y1) });
  const base: Point[] = [];
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) for (const p of crossings(curves[i]!, curves[j]!)) if (ok(p)) base.push(snap(p));
  let best: Point[] = [];
  let nodes = 0;
  const taken: Point[] = [];
  const apart = (p: Point) => taken.every((q) => hyp(p.x - q.x, p.y - q.y) >= spread - 1e-6);
  const grow = (from: number) => {
    if (taken.length > best.length) best = [...taken];
    if (best.length === ACTION_SIDES.length || nodes >= CRITICAL_SEARCH_NODES) return;
    // The places this set makes: its circles across the region's curves and across each other.
    const made: Point[] = [];
    for (let k = 0; k < taken.length; k++) {
      const ring: Curve = { c: taken[k]!, r: spread };
      for (const curve of curves) for (const p of crossings(ring, curve)) if (ok(p)) made.push(snap(p));
      for (let m = k + 1; m < taken.length; m++) for (const p of crossings(ring, { c: taken[m]!, r: spread })) if (ok(p)) made.push(snap(p));
    }
    for (const p of made) {
      if (best.length === ACTION_SIDES.length || nodes >= CRITICAL_SEARCH_NODES) return;
      nodes++;
      if (!apart(p)) continue;
      taken.push(p);
      grow(from);
      taken.pop();
    }
    for (let i = from; i < base.length; i++) {
      if (best.length === ACTION_SIDES.length || nodes >= CRITICAL_SEARCH_NODES) return;
      nodes++;
      const p = base[i]!;
      if (!apart(p)) continue;
      taken.push(p);
      grow(i + 1);
      taken.pop();
    }
  };
  grow(0);
  return best;
}

/** The grid step of `searchActions`' places, screen px. */
const SPLIT_STEP_PX = 4;
/** The most places `searchActions`' exhaustive search tries, so a camera frame stays cheap. */
const SPLIT_SEARCH_NODES = 20_000;

/** `lo` to `hi` by `step`, `hi` included. */
function steps(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v < hi; v += step) out.push(v);
  out.push(hi);
  return out;
}

/** The rows of places along each side of the tile that `actionCandidates` slides on: at the gap, then one spread farther out. */
const SLIDE_ROWS = 2;

/**
 * The tile's candidate places close in, shared by the four actions (after the Overseer's steer of #1078): its four corners pushed out
 * to the gap, and places sliding along each of its sides on screen, at the gap and a spread farther out, every `SPLIT_STEP_PX`
 * (clipped to the centres' rectangle `room`).
 */
function tileCandidates(outline: readonly Point[], room: { x0: number; x1: number; y0: number; y1: number }, clear: number): { corners: Point[]; slides: Point[] } {
  const n = outline.length;
  const centre = { x: outline.reduce((s, p) => s + p.x, 0) / n, y: outline.reduce((s, p) => s + p.y, 0) / n };
  // A corner pushed out from the centre through it until it is `clear` from the outline.
  const corners = outline.map((v) => {
    const len = hyp(v.x - centre.x, v.y - centre.y) || 1;
    const dir = { x: (v.x - centre.x) / len, y: (v.y - centre.y) / len };
    let lo = len;
    let hi = len + clear * 4;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (toOutline({ x: centre.x + dir.x * mid, y: centre.y + dir.y * mid }, outline) < clear) lo = mid;
      else hi = mid;
    }
    return { x: centre.x + dir.x * hi, y: centre.y + dir.y * hi };
  });
  const slides: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const len = hyp(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let nx = uy;
    let ny = -ux;
    if (nx * (centre.x - a.x) + ny * (centre.y - a.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
    for (let row = 0; row < SLIDE_ROWS; row++) {
      const off = clear + CRITICAL_SLACK_PX + row * ACTION_SPREAD_PX;
      // The side's line pushed out, clipped to the room (its part on screen), sampled along.
      let lo = 0;
      let hi = len;
      const ox = a.x + nx * off;
      const oy = a.y + ny * off;
      for (const [o, u, min, max] of [
        [ox, ux, room.x0, room.x1],
        [oy, uy, room.y0, room.y1],
      ] as const) {
        if (Math.abs(u) < 1e-9) {
          if (o < min || o > max) hi = -1;
          continue;
        }
        const t0 = (min - o) / u;
        const t1 = (max - o) / u;
        lo = Math.max(lo, Math.min(t0, t1));
        hi = Math.min(hi, Math.max(t0, t1));
      }
      if (lo > hi) continue;
      // Snapped into the room: the clip's rounding never leaves a place a hair past its edge.
      for (const t of steps(lo, hi, SPLIT_STEP_PX))
        slides.push({ x: Math.min(Math.max(ox + ux * t, room.x0), room.x1), y: Math.min(Math.max(oy + uy * t, room.y0), room.y1) });
    }
  }
  return { corners, slides };
}

/**
 * Close in, where the clamp would put a button on the tile: the four placed again, after the Overseer's steer of #1078. Each place is
 * wholly in `room` (the screen less its margins and the side menu), clear of each of `blocks` (the HUD's pieces, the hand panel, the
 * editor's bar and sheet, each measured exactly, so a place may stand beside a part that does not span the screen), `ACTION_GAP_PX`
 * outside the real outline, and `ACTION_SPREAD_PX` from the places already taken.
 *
 * 1. Each action in reading order takes the first such candidate: the tile's four action places (`tileActionPlaces`, its own
 *    first), then the nearest of its four corners pushed out to the gap (to where the clamp put the action), then the nearest place
 *    sliding along a side of the tile on screen (`tileCandidates`) to the room's place nearest the tile's centre: along the nearest
 *    side on screen first, the four gathered round the middle of its part on screen.
 * 2. When that leaves one over, the room outside the tile is searched for more such places: three greedy rules on a grid, the exact
 *    places of a tight packing on the region's bounds (`criticalPacking`: a narrow corner holds four only so, off any grid), then a
 *    bounded exhaustive search of the grid. The most found is kept.
 * 3. Any action still over takes the closest place in the room outside the outline (nearer than the gap), else the closest in the
 *    room at all, apart from the others.
 *
 * The four are then named by their places on screen: the two on the left are the left column (Cancel above Rotate), the two on the
 * right the right one (Confirm above Discard). Null when no place outside the tile exists: the tile covers the room.
 */
function searchActions(outline: readonly Point[], room: BubbleLimits, free: ActionPlaces, clamped: ActionPlaces, blocks: readonly BubbleLimits[]): ActionPlaces | null {
  const clear = R + ACTION_GAP_PX;
  const x0 = room.left + R;
  const x1 = room.right - R;
  const y0 = room.top + R;
  const y1 = room.bottom - R;
  if (x0 > x1 || y0 > y1) return null;
  const dist = (p: Point, q: Point) => hyp(p.x - q.x, p.y - q.y);
  const onScreen = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !blocked(p, blocks);
  const fits = (p: Point) => onScreen(p) && !within(p, outline) && toOutline(p, outline) >= clear;
  const apart = (p: Point, taken: readonly Point[]) => taken.every((q) => dist(p, q) >= ACTION_SPREAD_PX - 1e-6);
  const box = { x0, x1, y0, y1 };

  // 1. Each action's own candidates.
  const tile = tileCandidates(outline, box, clear);
  const corners = tile.corners.filter(fits);
  const slides = tile.slides.filter(fits);
  const nearest = (from: readonly Point[], t: Point, taken: readonly Point[]) => {
    let found: Point | undefined;
    let least = Infinity;
    for (const p of from) {
      const d = dist(p, t);
      if (d < least && apart(p, taken)) {
        least = d;
        found = p;
      }
    }
    return found;
  };
  // Along a side, the four gather round one place: the room's nearest to the tile's centre (the middle of the side on screen).
  const n = outline.length;
  const centre = { x: outline.reduce((s, p) => s + p.x, 0) / n, y: outline.reduce((s, p) => s + p.y, 0) / n };
  const focus = { x: Math.min(Math.max(centre.x, x0), x1), y: Math.min(Math.max(centre.y, y0), y1) };
  let best: Point[] = [];
  for (const side of ACTION_SIDES) {
    const p =
      [free[side], ...ACTION_SIDES.filter((s) => s !== side).map((s) => free[s])].find((q) => fits(q) && apart(q, best)) ??
      nearest(corners, clamped[side], best) ??
      nearest(slides, focus, best);
    if (!p) break;
    best.push(p);
  }

  if (best.length === ACTION_SIDES.length) return byPlace(best as [Point, Point, Point, Point]);

  // 2. The room outside the tile searched for more.
  const all: Point[] = [];
  const room4: Point[] = [];
  const coarse: Point[] = [];
  steps(x0, x1, SPLIT_STEP_PX).forEach((x, i) =>
    steps(y0, y1, SPLIT_STEP_PX).forEach((y, j) => {
      const p = { x, y };
      if (blocked(p, blocks)) return;
      all.push(p);
      if (within(p, outline) || toOutline(p, outline) < clear) return;
      room4.push(p);
      if (i % 2 === 0 && j % 2 === 0) coarse.push(p);
    }),
  );
  if (best.length < ACTION_SIDES.length && room4.length + best.length > 0) {
    const pick = (from: readonly Point[], taken: readonly Point[], score: (p: Point) => number) => {
      let found: Point | null = null;
      let least = Infinity;
      for (const p of from) {
        if (!apart(p, taken)) continue;
        const v = score(p);
        if (v < least) {
          least = v;
          found = p;
        }
      }
      return found;
    };
    const rules: ((p: Point, side: ActionSide) => number)[] = [(p, side) => dist(p, clamped[side]), (p) => dist(p, centre), (p) => -dist(p, centre)];
    for (const rule of rules) {
      if (best.length === ACTION_SIDES.length) break;
      const taken: Point[] = [];
      for (const side of ACTION_SIDES) {
        const p = pick(room4, taken, (q) => rule(q, side));
        if (!p) break;
        taken.push(p);
      }
      if (taken.length > best.length) best = taken;
    }
    if (best.length < ACTION_SIDES.length) {
      const found = criticalPacking(outline, box, clear, blocks);
      if (found.length > best.length) best = found;
    }
    if (best.length < ACTION_SIDES.length) {
      const order = coarse.sort((p, q) => dist(q, centre) - dist(p, centre));
      let nodes = 0;
      const taken: Point[] = [];
      const grow = (from: number) => {
        if (taken.length > best.length) best = [...taken];
        for (let i = from; i < order.length && best.length < ACTION_SIDES.length && nodes < SPLIT_SEARCH_NODES; i++) {
          const p = order[i]!;
          nodes++;
          if (!apart(p, taken)) continue;
          taken.push(p);
          grow(i + 1);
          taken.pop();
        }
      };
      grow(0);
    }
  }
  if (best.length === 0) return null;

  // 3. The actions over: the closest place outside the outline, else the closest in the room.
  const chosen = [...best];
  for (const side of ACTION_SIDES.slice(chosen.length)) {
    const t = clamped[side];
    const p = nearest(all.filter((q) => !within(q, outline)), t, chosen) ?? nearest(all, t, chosen);
    if (!p) return null;
    chosen.push(p);
  }
  return byPlace(chosen as [Point, Point, Point, Point]);
}

/**
 * Four places named by where they stand on screen: in two columns (the left one Cancel above Rotate, the right one Confirm above
 * Discard), or, when they stand taller than wide, in two rows (the top one Cancel then Confirm, the bottom one Rotate then Discard).
 */
function byPlace(places: [Point, Point, Point, Point]): ActionPlaces {
  const xs = places.map((p) => p.x);
  const ys = places.map((p) => p.y);
  if (Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs)) {
    const [a, b, c, d] = [...places].sort((p, q) => p.y - q.y || p.x - q.x) as [Point, Point, Point, Point];
    const [tl, tr] = a.x <= b.x ? [a, b] : [b, a];
    const [bl, br] = c.x <= d.x ? [c, d] : [d, c];
    return { "top-left": tl, "top-right": tr, "bottom-left": bl, "bottom-right": br };
  }
  const [a, b, c, d] = [...places].sort((p, q) => p.x - q.x || p.y - q.y) as [Point, Point, Point, Point];
  const [tl, bl] = a.y <= b.y ? [a, b] : [b, a];
  const [tr, br] = c.y <= d.y ? [c, d] : [d, c];
  return { "top-left": tl, "top-right": tr, "bottom-left": bl, "bottom-right": br };
}

/**
 * Where the buttons stand around the tile whose outline on screen is `outline`, in `box`, clear of `avoid` (`data-bubble-avoid`):
 *
 * 1. their places out of the tile (`tileActionPlaces`);
 * 2. the room (`actionRoom`), its HUD and hand panel tested on the places as the box's sides and the side menu leave them: a tile
 *    panned far to one side brings its buttons back across, under the HUD it was not over (#1078);
 * 3. each button clamped into it (`clampActions`), the room tested again on where they ended;
 * 4. close in, where that clamp puts a button on the tile or nearer it than `ACTION_GAP_PX` (the tile larger than the room round it,
 *    or against an edge), each placed again by a search over its candidates, every part of the screen it avoids measured exactly
 *    (`searchActions`). When the tile covers the whole room there is no place outside it: the clamped ones stay.
 */
export function layoutTileActions(outline: readonly Point[], box: DOMRect, avoid: readonly BubbleAvoid[]): ActionPlaces {
  const free = tileActionPlaces(outline);
  const sides = actionRoom(box, avoid.filter((a) => a.side), 0, box.width);
  let at = across(free, sides);
  for (let i = 0; i < 3; i++) {
    const span = actionsSpan(at);
    const room = actionRoom(box, avoid, span.x, span.width);
    if (i > 0 && inside(at, room)) break;
    at = clampActions(free, room);
  }
  if (outline.length > 2 && actionsClearance(at, outline) < ACTION_GAP_PX - 1e-6) {
    // Each part of the screen the buttons avoid measured exactly, so a place may stand beside a part that does not span it.
    const open = actionRoom(box, avoid.filter((a) => a.side), 0, box.width);
    const grow = MARGIN_PX + R;
    const blocks = avoid
      .filter((a) => !a.side)
      .map(({ rect: r }) => ({ left: r.left - box.left - grow, right: r.left - box.left + r.width + grow, top: r.top - box.top - grow, bottom: r.top - box.top + r.height + grow }));
    const found = searchActions(outline, open, free, at, blocks);
    if (found && clearOf(found, outline) >= clearOf(at, outline)) at = found;
  }
  return at;
}
