import { CLOSEST_DISTANCE, OPENING_DISTANCE, PLAY_DEFAULT_POLAR_ANGLE } from "./CameraController";
import { TILE_SIZE } from "./types";

/**
 * The HUD's room at each edge of the board's surface, in CSS px: the board is framed in what is left (CAMERA-FIT, #678).
 * The top bar at the top; the tile stack and its bubble at the bottom.
 */
export interface FrameInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The game page's HUD (`BoardScene`): the top bar (and the season dial under it) and the tile stack. Below the `tablet`
 * breakpoint (640 px, `theme.css`) the phone's, from it the larger one's (their `tablet:` paddings and sizes).
 */
export const FRAME_INSETS = {
  phone: { top: 64, bottom: 120, left: 8, right: 8 },
  tablet: { top: 88, bottom: 136, left: 16, right: 16 },
} as const satisfies Record<string, FrameInsets>;

/** The width from which the larger HUD's insets apply: the app's `tablet` breakpoint, in CSS px. */
export const FRAME_TABLET_PX = 640;

/** The camera's opening frame (`RendererSettings.cameraFit`). */
export interface CameraFitSettings {
  /** Frame the board at the opening, on a resize while the player has not moved the camera, and on `recenter`. Off: the camera opens at `OPENING_DISTANCE` over the starter. */
  enabled: boolean;
  /** The frame is at least this many cells wide and deep (5: the starter, its slots and one more ring), so the starter alone never fills the screen. */
  floorCells: number;
  /** Free cells framed around the placed tiles: 1, the ring of their free slots. */
  ring: number;
  /** The HUD's room in CSS px, or `"auto"`: `FRAME_INSETS` by the surface's width. */
  insets: FrameInsets | "auto";
  /**
   * Re-fit after each move while the player has not moved the camera (the issue's open point, the owner's to rule). Off by
   * default: the frame is set at the opening, on a resize and on `recenter`.
   */
  followBoard: boolean;
}

export const DEFAULT_CAMERA_FIT_SETTINGS: CameraFitSettings = {
  enabled: true,
  floorCells: 5,
  ring: 1,
  insets: "auto",
  followBoard: false,
};

/** The tiles' extent, in grid cells (a tile's `worldX` and `worldZ`), inclusive. */
export interface CellExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CameraFitInput {
  /** The placed tiles' extent in cells; null for an empty board (framed around the starter's cell, 0 0). */
  cells: CellExtent | null;
  /** The surface's size in CSS px. */
  width: number;
  height: number;
  /** The camera's vertical field of view in degrees, and its zoom (the play camera's: 50 and 5). */
  fov?: number;
  zoom?: number;
  /** The tilt from straight down, in radians (`PLAY_DEFAULT_POLAR_ANGLE`); the camera leans towards +z. */
  polar?: number;
  insets?: FrameInsets;
  floorCells?: number;
  ring?: number;
  /** The closest and farthest the frame may put the camera (`CLOSEST_DISTANCE`, and today's opening, `OPENING_DISTANCE`). */
  minDistance?: number;
  maxDistance?: number;
}

/** What binds the distance: the frame's depth, its width, the ceiling (the board is larger than the screen) or the closest zoom. */
export type CameraFitLimit = "height" | "width" | "ceiling" | "closest";

export interface CameraFit {
  /** The point on the ground the camera looks at, in world units. */
  target: { x: number; z: number };
  /** The camera's distance from it, at the tilt given. */
  distance: number;
  /** The framed area on the ground, in world units: the tiles and their ring, widened to the floor, centred on them. */
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  limitedBy: CameraFitLimit;
}

/** The insets of a surface `width` px wide, for `"auto"`. */
export function frameInsetsFor(width: number): FrameInsets {
  return width >= FRAME_TABLET_PX ? FRAME_INSETS.tablet : FRAME_INSETS.phone;
}

/**
 * The screen's free band along one axis, in normalised device coordinates (-1 to 1), with `start` and `end` px taken at
 * its two ends. A band thinner than a fifth of the screen is widened around its centre, so huge insets never fold it.
 */
function band(sizePx: number, startPx: number, endPx: number): [number, number] {
  let lo = -1 + (2 * Math.max(startPx, 0)) / sizePx;
  let hi = 1 - (2 * Math.max(endPx, 0)) / sizePx;
  const min = 0.4;
  if (hi - lo < min) {
    const mid = Math.min(Math.max((lo + hi) / 2, -1 + min / 2), 1 - min / 2);
    lo = mid - min / 2;
    hi = mid + min / 2;
  }
  return [lo, hi];
}

/**
 * The camera's frame on the board (CAMERA-FIT, #678): the target and the distance at which the placed tiles and one ring of
 * free cells, at least `floorCells` x `floorCells`, fill the screen less the HUD, at the play tilt. Pure: no three object.
 *
 * The camera at distance d from target T, tilted θ towards +z, sees a ground point dz from T along z at the screen height
 * y = -dz cos θ / ((d - dz sin θ) t), t the tangent of half the field of view over the zoom. So the ground row shown at a
 * screen height y is dz = d k(y), k(y) = y t / (y t sin θ - cos θ): linear in d. With the area's centre put at the free
 * band's centre ym (T.z = cz - d k(ym)), its far edge stays under the band's top and its near edge over its bottom from
 * d = depth / 2 / (k(ym) - k(top)) and d = depth / 2 / (k(bottom) - k(ym)). The width binds at the near edge, the closest
 * to the camera, where the depth d - dz sin θ is the least: also linear in d. The distance is the largest of the three,
 * then kept between the closest zoom and the ceiling.
 */
export function computeCameraFit(input: CameraFitInput): CameraFit {
  const {
    cells,
    width,
    height,
    fov = 50,
    zoom = 5,
    polar = PLAY_DEFAULT_POLAR_ANGLE,
    insets = frameInsetsFor(width),
    floorCells = DEFAULT_CAMERA_FIT_SETTINGS.floorCells,
    ring = DEFAULT_CAMERA_FIT_SETTINGS.ring,
    minDistance = CLOSEST_DISTANCE,
    maxDistance = OPENING_DISTANCE,
  } = input;

  // The area, in world units: the tiles' cells and their ring, to the cells' outer edges, widened to the floor.
  const c = cells ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const half = TILE_SIZE / 2;
  const floor = Math.max(floorCells, 0) * TILE_SIZE;
  const extent = (lo: number, hi: number): [number, number] => {
    const min = (lo - ring) * TILE_SIZE - half;
    const max = (hi + ring) * TILE_SIZE + half;
    const grow = Math.max(floor - (max - min), 0) / 2;
    return [min - grow, max + grow];
  };
  const [minX, maxX] = extent(c.minX, c.maxX);
  const [minZ, maxZ] = extent(c.minZ, c.maxZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const depth = maxZ - minZ;

  const w0 = width > 0 ? width : 1;
  const h0 = height > 0 ? height : 1;
  const tv = Math.tan(((fov / 2) * Math.PI) / 180) / zoom;
  const th = tv * (w0 / h0);
  const sin = Math.sin(polar);
  const cos = Math.cos(polar);
  // Screen y grows upwards: the bottom inset is the band's start.
  const [yb, yt] = band(h0, insets.bottom, insets.top);
  const [xl, xr] = band(w0, insets.left, insets.right);
  const ym = (yb + yt) / 2;
  const xm = (xl + xr) / 2;
  const k = (y: number) => (y * tv) / (y * tv * sin - cos);
  const km = k(ym);

  const byHeight = Math.max(depth / 2 / (km - k(yt)), depth / 2 / (k(yb) - km));

  // At the near edge (dz = depth / 2 + d km), the depth is d (1 - km sin) - depth / 2 sin; the area's centre goes at the
  // band's x centre at the target's depth (T.x = cx - d th xm). Each side then needs a d (a d + b >= w / 2).
  const a = 1 - km * sin;
  const nearRight = { a: th * (a * xr - xm), b: -th * (depth / 2) * sin * xr };
  const nearLeft = { a: th * (xm - a * xl), b: th * (depth / 2) * sin * xl };
  const need = (side: { a: number; b: number }) => (side.a > 0 ? (w / 2 - side.b) / side.a : Infinity);
  const byWidth = Math.max(need(nearRight), need(nearLeft));

  const fitted = Math.max(byHeight, byWidth);
  const ceiling = Math.max(maxDistance, minDistance);
  let distance = fitted;
  let limitedBy: CameraFitLimit = byWidth > byHeight ? "width" : "height";
  if (!(distance <= ceiling)) {
    distance = ceiling;
    limitedBy = "ceiling";
  } else if (distance < minDistance) {
    distance = minDistance;
    limitedBy = "closest";
  }

  return {
    target: { x: cx - distance * th * xm, z: cz - distance * km },
    distance,
    area: { minX, maxX, minZ, maxZ },
    limitedBy,
  };
}

/**
 * Where a ground point lands on the screen, in normalised device coordinates, for a camera at `fit` (the projection
 * `computeCameraFit` inverts; the tests check the frame with it).
 */
export function projectGround(
  point: { x: number; z: number },
  fit: Pick<CameraFit, "target" | "distance">,
  view: { width: number; height: number; fov?: number; zoom?: number; polar?: number },
): { x: number; y: number } {
  const { fov = 50, zoom = 5, polar = PLAY_DEFAULT_POLAR_ANGLE } = view;
  const tv = Math.tan(((fov / 2) * Math.PI) / 180) / zoom;
  const th = tv * (view.width / view.height);
  const dz = point.z - fit.target.z;
  const depthAlong = fit.distance - dz * Math.sin(polar);
  return { x: (point.x - fit.target.x) / (depthAlong * th), y: (-dz * Math.cos(polar)) / (depthAlong * tv) };
}
