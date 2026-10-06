/**
 * Scripted camera path of the frame-time bench: a pure function of the elapsed fraction
 * `u` in [0, 1], so a run is the same on every machine and every time.
 *
 * It stays inside what the `play` camera allows (azimuth locked, polar angle up to
 * 0.15 PI, distance 5..300) and combines what a player does: dolly in and out, pan
 * across the board and tilt a little.
 */
export interface PathBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CameraPose {
  target: [number, number, number];
  position: [number, number, number];
}

/** Distance of the default `play` camera (CameraController starts at maxDistance * 0.8). */
export const PATH_FAR = 240;
/** Closest distance reached: about four times closer than the default view. */
export const PATH_NEAR = 60;
const MAX_POLAR = Math.PI * 0.15;
/** Fraction of the half extent of the board the pan reaches. */
const PAN_REACH = 0.8;

export function cameraPose(u: number, bounds: PathBounds): CameraPose {
  const t = Math.min(Math.max(u, 0), 1);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const hx = (bounds.maxX - bounds.minX) / 2;
  const hz = (bounds.maxZ - bounds.minZ) / 2;

  // One full zoom in and out over the run.
  const distance = (PATH_FAR + PATH_NEAR) / 2 + ((PATH_FAR - PATH_NEAR) / 2) * Math.cos(2 * Math.PI * t);
  // Tilt from top-down to the steepest allowed angle, twice.
  const polar = 0.01 + (MAX_POLAR - 0.01) * (0.5 - 0.5 * Math.cos(4 * Math.PI * t));

  const tx = cx + PAN_REACH * hx * Math.sin(2 * Math.PI * t);
  const tz = cz + PAN_REACH * hz * Math.sin(4 * Math.PI * t);

  return {
    target: [tx, 0, tz],
    position: [tx, distance * Math.cos(polar), tz + distance * Math.sin(polar)],
  };
}
