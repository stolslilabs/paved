import { CLOSEST_DISTANCE, OPENING_DISTANCE, PLAY_DEFAULT_POLAR_ANGLE } from "./CameraController";
import { TILE_SIZE } from "./types";
import { DEFAULT_CAMERA_FIT_SETTINGS, frameFloorFor, frameInsetsFor, type CameraFit, type CameraFitInput, type CameraFitLimit } from "./camera-fit-settings";

// The settings and types, for the tests and whoever loads this chunk.
export * from "./camera-fit-settings";


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
 * d = depth / 2 / (k(ym) - k(top)) and d = depth / 2 / (k(bottom) - k(ym)). The width binds at a corner of the near or the far
 * edge, whose depth d - dz sin θ is linear in d, so each corner gives a d too. The distance is the largest of these,
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
    floorCells = frameFloorFor(width).cells,
    marginCells = frameFloorFor(width).margin,
    ring = DEFAULT_CAMERA_FIT_SETTINGS.ring,
    minDistance = CLOSEST_DISTANCE,
    maxDistance = OPENING_DISTANCE,
  } = input;

  // The area, in world units: the tiles' cells and their ring, to the cells' outer edges, widened to the floor and its
  // margin (a board past the floor takes no margin).
  const c = cells ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const half = TILE_SIZE / 2;
  const floor = (Math.max(floorCells, 0) + 2 * Math.max(marginCells, 0)) * TILE_SIZE;
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

  // At the area's near and far edges (dz = d km -+ depth / 2) the depth is d (1 - km sin) +- depth / 2 sin; the area's
  // centre goes at the band's x centre at the target's depth (T.x = cx - d th xm). Each side, at each edge, then needs a
  // d (a d + b >= w / 2). The near edge binds a centred band; a band pushed to one side can be bound by the far edge.
  const a = 1 - km * sin;
  const sides = [-1, 1].flatMap((edge) => {
    const e = edge * (depth / 2) * sin;
    return [
      { a: th * (a * xr - xm), b: th * xr * e },
      { a: th * (xm - a * xl), b: -th * xl * e },
    ];
  });
  const need = (side: { a: number; b: number }) => (side.a > 0 ? (w / 2 - side.b) / side.a : Infinity);
  const byWidth = Math.max(...sides.map(need));

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
