/**
 * The camera stops of the "Renderer/Outlines" story, and the tour through them: pure functions of the board's bounds
 * and of the elapsed time, so the live story and the before/after captures see the same positions.
 *
 * Distances are those of the `play` camera (`CameraController`: 5 to 300 units, polar angle up to 0.15 PI); the game
 * opens straight down at 240.
 */
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The centre of the tile nearest the board's centre: what the fully zoomed-in view looks at. */
  anchor: [number, number];
}

export interface Pose {
  target: [number, number, number];
  position: [number, number, number];
}

export const VIEWS = ["top", "pan", "default", "zoomed-out", "zoomed-in"] as const;
export type View = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<View, string> = {
  top: "Top view",
  pan: "Panning",
  default: "Default view",
  "zoomed-out": "Fully zoomed out",
  "zoomed-in": "Fully zoomed in",
};

/** The camera's distance limits (`CameraController`'s defaults) and the distance the game opens at. */
export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 300;
export const DEFAULT_DISTANCE = 240;
const TOP_DISTANCE = 110;
const MAX_POLAR = Math.PI * 0.15;
/** Straight down: the camera's own start has the same tiny offset (no gimbal lock). */
const DOWN = 0.0001;

interface Stop {
  distance: number;
  polar: number;
  /** Target, as a fraction of the board's half extents from its centre. */
  dx: number;
  dz: number;
  /** Look at the anchor tile instead (a board's centre may be a hole). */
  onAnchor?: boolean;
}

const STOPS: Record<View, Stop> = {
  top: { distance: TOP_DISTANCE, polar: DOWN, dx: 0, dz: 0 },
  pan: { distance: TOP_DISTANCE, polar: DOWN, dx: 0.45, dz: -0.2 },
  default: { distance: DEFAULT_DISTANCE, polar: DOWN, dx: 0, dz: 0 },
  "zoomed-out": { distance: MAX_DISTANCE, polar: MAX_POLAR, dx: 0, dz: 0 },
  "zoomed-in": { distance: MIN_DISTANCE, polar: MAX_POLAR, dx: 0, dz: 0, onAnchor: true },
};

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function poseOf(stop: Stop, bounds: Bounds, anchored = stop.onAnchor ? 1 : 0): Pose {
  const bx = (bounds.minX + bounds.maxX) / 2 + (stop.dx * (bounds.maxX - bounds.minX)) / 2;
  const bz = (bounds.minZ + bounds.maxZ) / 2 + (stop.dz * (bounds.maxZ - bounds.minZ)) / 2;
  const cx = lerp(bx, bounds.anchor[0], anchored);
  const cz = lerp(bz, bounds.anchor[1], anchored);
  return {
    target: [cx, 0, cz],
    position: [cx, stop.distance * Math.cos(stop.polar), cz + stop.distance * Math.sin(stop.polar)],
  };
}

/** The pose of a named view; `distance` replaces the view's own when given (the story's zoom control). */
export function viewPose(view: View, bounds: Bounds, distance?: number): Pose {
  const stop = STOPS[view];
  return poseOf(distance === undefined ? stop : { ...stop, distance }, bounds);
}

/** The tour, in order: each stop is held, then the camera eases to the next. */
const TOUR: View[] = ["default", "top", "pan", "top", "zoomed-out", "zoomed-in", "default"];
const HOLD_MS = 1500;
const MOVE_MS = 3000;
export const TOUR_MS = (TOUR.length - 1) * (HOLD_MS + MOVE_MS);


/** The tour's pose at `ms` from its start; it loops. Distances ease in log space, so zooming feels even. */
export function tourPose(ms: number, bounds: Bounds): Pose {
  const t = ((ms % TOUR_MS) + TOUR_MS) % TOUR_MS;
  const leg = Math.floor(t / (HOLD_MS + MOVE_MS));
  const within = t - leg * (HOLD_MS + MOVE_MS);
  const u = within < HOLD_MS ? 0 : ease((within - HOLD_MS) / MOVE_MS);
  const a = STOPS[TOUR[leg]];
  const b = STOPS[TOUR[leg + 1]];
  return poseOf(
    {
      distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), u)),
      polar: lerp(a.polar, b.polar, u),
      dx: lerp(a.dx, b.dx, u),
      dz: lerp(a.dz, b.dz, u),
    },
    bounds,
    lerp(a.onAnchor ? 1 : 0, b.onAnchor ? 1 : 0, u),
  );
}
