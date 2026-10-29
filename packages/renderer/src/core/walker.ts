// No three here either: the walker moves on the walk's ground (`walk-map.ts`) in voxels, and is tested without a scene.
import { WALK_GROUND, type WalkMap } from "./walk-map";
import { clampVector, type WalkSettings, type WalkVector } from "./walk-settings";

/**
 * The walker (V4-WALK-1, #876): an upright cylinder of `radiusVoxels`, from the floor under its feet to its eye and the headroom
 * over it, that never holds a solid voxel. It moves in steps of at most `MAX_STEP` voxels; a step that would put a solid voxel in
 * it, or its centre off the walkable ground (a road, a city's ground), is tried again along each axis alone (it slides along a
 * wall), and dropped if neither fits. Its feet climb at most `stepVoxels` and drop onto any lower floor of the walkable ground.
 *
 * Places are in voxels from the walk map's corner (x and z) and in layers (the height); the eye's height and the head bob are
 * smoothed for the view, never for the collision.
 */

/** The longest move tested at once, in voxels: under half a voxel, so no wall is stepped through. */
const MAX_STEP = 0.4;
/** How far the feet may stand into a voxel's top, in layers: a rounding margin. */
const EPSILON = 1e-4;
/** The smoothing of the eye's height after a step up or down, and of the bob's ramp, in seconds. */
const EYE_SMOOTHING = 0.08;
const BOB_RAMP = 0.15;

export interface WalkerPlace {
  x: number;
  z: number;
  floor: number;
}

/** The columns a cylinder of `radius` at (x, z) covers: each column whose square comes closer than `radius` to its axis. */
export function footprint(x: number, z: number, radius: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = Math.floor(x - radius); i <= Math.floor(x + radius); i++) {
    for (let j = Math.floor(z - radius); j <= Math.floor(z + radius); j++) {
      const dx = Math.max(i - x, 0, x - (i + 1));
      const dz = Math.max(j - z, 0, z - (j + 1));
      if (dx * dx + dz * dz < radius * radius) out.push([i, j]);
    }
  }
  return out;
}

/**
 * The floor a walker stands on at (x, z) with its feet at `feet` (layers), or null when it cannot stand there: its centre off the
 * walkable ground, or a solid voxel within its body. The floor is the highest top of a solid voxel under its footprint that the
 * feet reach (at most `stepVoxels` above them).
 */
export function stanceAt(map: WalkMap, settings: WalkSettings, x: number, z: number, feet: number): number | null {
  if (map.groundAt(Math.floor(x), Math.floor(z)) === WALK_GROUND.none) return null;
  const columns = footprint(x, z, settings.radiusVoxels);
  const reach = Math.floor(feet + settings.stepVoxels + EPSILON);
  let floor = 0;
  for (const [i, j] of columns) {
    for (let layer = reach - 1; layer >= 0; layer--) {
      if (map.solidAt(i, j, layer)) {
        floor = Math.max(floor, layer + 1);
        break;
      }
    }
  }
  if (floor === 0) return null;
  const head = Math.ceil(floor + settings.eyeVoxels + settings.headroomVoxels - EPSILON);
  for (const [i, j] of columns) {
    for (let layer = floor; layer < head; layer++) if (map.solidAt(i, j, layer)) return null;
  }
  return floor;
}

/**
 * Where a walk starts near (x, z) (voxels from the map's corner): the nearest column centre of `prefer` ground the walker fits on,
 * standing on that column's surface; else the nearest of any walkable ground; null when there is none.
 */
export function findStart(map: WalkMap, settings: WalkSettings, x: number, z: number, prefer: number = WALK_GROUND.road): WalkerPlace | null {
  const candidates: { k: number; d: number }[] = [];
  for (let j = 0; j < map.sizeZ; j++) {
    for (let i = 0; i < map.sizeX; i++) {
      if (map.ground[i + map.sizeX * j] === WALK_GROUND.none) continue;
      const [dx, dz] = [i + 0.5 - x, j + 0.5 - z];
      candidates.push({ k: i + map.sizeX * j, d: dx * dx + dz * dz });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  const tryGround = (only: number | null): WalkerPlace | null => {
    for (const { k } of candidates) {
      if (only !== null && map.ground[k] !== only) continue;
      const [i, j] = [k % map.sizeX, Math.floor(k / map.sizeX)];
      const floor = stanceAt(map, settings, i + 0.5, j + 0.5, map.surfaceAt(i, j));
      if (floor !== null) return { x: i + 0.5, z: j + 0.5, floor };
    }
    return null;
  };
  return tryGround(prefer) ?? tryGround(null);
}

/** Eases `from` toward `to` over `dt` seconds with a time constant `tau` (0: at once). */
function follow(from: number, to: number, dt: number, tau: number): number {
  if (tau <= 0) return to;
  return to + (from - to) * Math.exp(-dt / tau);
}

export class Walker {
  /** The feet's place, in voxels from the map's corner, and the floor under them, in layers. */
  x: number;
  z: number;
  feet: number;
  /** The view's yaw (around the vertical, 0 looking to -z, positive turning left) and pitch (positive up), in radians. */
  yaw: number;
  pitch: number;
  private targetYaw: number;
  private targetPitch: number;
  /** The eye's smoothed floor, the bob's phase and its ramp (0 still, 1 walking). */
  private shownFeet: number;
  private bobPhase = 0;
  private bobLevel = 0;
  private settings: WalkSettings;

  constructor(
    private readonly map: WalkMap,
    settings: WalkSettings,
    start: WalkerPlace,
    yaw = 0,
  ) {
    this.settings = settings;
    this.x = start.x;
    this.z = start.z;
    this.feet = start.floor;
    this.shownFeet = start.floor;
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = 0;
  }

  setSettings(settings: WalkSettings): void {
    this.settings = settings;
  }

  /** Turns the view's target: `right` radians to the right, `up` radians up (the pitch kept within `maxPitch`). */
  turn(right: number, up: number): void {
    this.targetYaw -= right;
    const max = this.settings.maxPitch;
    this.targetPitch = Math.min(max, Math.max(-max, this.targetPitch + up));
  }

  /** Whether the view still eases toward its target, the eye toward its floor, or the bob toward rest. */
  get settling(): boolean {
    return Math.abs(this.targetYaw - this.yaw) > 1e-4 || Math.abs(this.targetPitch - this.pitch) > 1e-4 || Math.abs(this.shownFeet - this.feet) > 1e-3 || this.bobLevel > 1e-3;
  }

  /**
   * One frame of `dt` seconds: the look turns at `lookRate` (radians a second: `x` right, `y` up), the view eases toward its target,
   * and the walker moves by `move` (`x` right, `y` forward, at most 1) at `speed`. Returns the voxels walked.
   */
  step(dt: number, move: WalkVector, lookRate: WalkVector = { x: 0, y: 0 }, reducedMotion = false): number {
    const s = this.settings;
    if (lookRate.x || lookRate.y) this.turn(lookRate.x * dt, lookRate.y * dt);
    const tau = s.lookSmoothingMs / 1000;
    this.yaw = follow(this.yaw, this.targetYaw, dt, tau);
    this.pitch = follow(this.pitch, this.targetPitch, dt, tau);

    const v = clampVector(move);
    const [sin, cos] = [Math.sin(this.yaw), Math.cos(this.yaw)];
    // Forward is (-sin, -cos), right is (cos, -sin), in x and z.
    const dx = (v.x * cos - v.y * sin) * s.speed * dt;
    const dz = (-v.x * sin - v.y * cos) * s.speed * dt;
    const walked = this.moveBy(dx, dz);

    this.shownFeet = follow(this.shownFeet, this.feet, dt, reducedMotion ? 0 : EYE_SMOOTHING);
    const moving = walked > 1e-6 && !reducedMotion && s.bobVoxels > 0;
    this.bobLevel = follow(this.bobLevel, moving ? 1 : 0, dt, BOB_RAMP);
    if (this.bobLevel < 1e-3) this.bobLevel = 0;
    if (moving) this.bobPhase += (walked / s.strideVoxels) * 2 * Math.PI;
    return walked;
  }

  /** Moves by (dx, dz) voxels as far as the walker fits, sliding along what stops it; returns the voxels walked. */
  moveBy(dx: number, dz: number): number {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_STEP));
    const [sx, sz] = [dx / steps, dz / steps];
    let walked = 0;
    for (let n = 0; n < steps; n++) {
      const moved = this.tryMove(sx, sz) || this.tryMove(sx, 0) || this.tryMove(0, sz);
      if (!moved) break;
      walked += moved;
    }
    return walked;
  }

  /** One small move if the walker fits there; the voxels walked (0: it does not fit). */
  private tryMove(dx: number, dz: number): number {
    if (!dx && !dz) return 0;
    const floor = stanceAt(this.map, this.settings, this.x + dx, this.z + dz, this.feet);
    if (floor === null) return 0;
    this.x += dx;
    this.z += dz;
    this.feet = floor;
    return Math.hypot(dx, dz);
  }

  /** The eye's place: x and z in voxels from the map's corner, the height in layers (the smoothed floor, the eye, the bob). */
  eye(): { x: number; y: number; z: number } {
    const bob = this.bobLevel * this.settings.bobVoxels * Math.sin(this.bobPhase);
    return { x: this.x, y: this.shownFeet + this.settings.eyeVoxels + bob, z: this.z };
  }

  /** What the feet stand on (`WALK_GROUND`). */
  ground(): number {
    return this.map.groundAt(Math.floor(this.x), Math.floor(this.z));
  }
}
