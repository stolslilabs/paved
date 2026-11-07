import type { Point } from "../src/components/containers/tile-actions-layout";

/**
 * The production camera's projection of a cell (the renderer's `cellOutline`, through `projectCellOutline`), by hand: a 50 degree
 * field of view at zoom 5, the play view's 27 degree tilt, the camera south of its target at `distance`, the cell 3 units wide at the
 * slab's top (0.3), on a `width` by `height` surface. `target` is the camera's target on the board from the cell's centre, world units;
 * `compass` the board's turn, radians (the scene group's `rotation.y`).
 */
export function projectCell(distance: number, width: number, height: number, target = { x: 0, z: 0 }, compass = 0): Point[] {
  const polar = Math.PI * 0.15;
  const top = Math.tan((25 * Math.PI) / 180) / 5;
  const c = Math.cos(polar);
  const s = Math.sin(polar);
  const eye = { x: target.x, y: distance * c, z: target.z + distance * s };
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  return corners.map(([dx, dz]) => {
    const x = dx * 1.5 * Math.cos(compass) + dz * 1.5 * Math.sin(compass);
    const z = -dx * 1.5 * Math.sin(compass) + dz * 1.5 * Math.cos(compass);
    const v = { x: x - eye.x, y: 0.3 - eye.y, z: z - eye.z };
    const yc = v.y * s - v.z * c;
    const zc = v.y * c + v.z * s;
    return { x: ((v.x / (-zc * top * (width / height)) + 1) / 2) * width, y: ((1 - yc / (-zc * top)) / 2) * height };
  });
}
