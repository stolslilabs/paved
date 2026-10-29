/**
 * The first-person walk's settings and inputs (V4-WALK-1, #876): small and eager, so a host can bind its keys and sticks before
 * the walk's chunk (`walk.ts`, loaded by `GameScene.startWalk`) is in. Lengths are in voxels (a tile is 40 voxels across,
 * `TILE_VOXELS`, 0.075 world units each), times in ms, angles in radians.
 */

export interface WalkSettings {
  /** The eye above the floor the feet stand on, in voxels. Default 5: about a third of a model's height (13 to 16 layers). */
  eyeVoxels: number;
  /** The walker's radius, in voxels: nothing solid comes closer to the eye's vertical. */
  radiusVoxels: number;
  /** Free voxels kept over the eye: the body is the floor to `eyeVoxels + headroomVoxels`. */
  headroomVoxels: number;
  /** The highest step the feet climb, in voxels (a road's kerb, a city's paving). */
  stepVoxels: number;
  /** Walking speed at full tilt, in voxels a second. */
  speed: number;
  /** The camera's vertical field of view while walking, in degrees. */
  fov: number;
  /** The camera's near plane while walking, in world units (restored on the way out). */
  near: number;
  /** Mouse look: radians per CSS px the mouse moves. */
  mouseRadiansPerPx: number;
  /** The look stick at full tilt, in radians a second (the speed grows with the tilt's square). */
  stickRadiansPerSecond: number;
  /** The look's smoothing: the time constant the view follows its target with, in ms (0: none). */
  lookSmoothingMs: number;
  /** The head bob's height, in voxels (none under reduced motion). */
  bobVoxels: number;
  /** The head bob's stride: voxels walked per bob. */
  strideVoxels: number;
  /** The eased descent from the orbit view and the lift back, in ms (a cut under reduced motion). */
  easeMs: number;
  /** The highest the view looks up or down, in radians. */
  maxPitch: number;
}

export const DEFAULT_WALK_SETTINGS: WalkSettings = {
  eyeVoxels: 5,
  radiusVoxels: 1.2,
  headroomVoxels: 2,
  stepVoxels: 1,
  speed: 12,
  fov: 70,
  near: 0.02,
  mouseRadiansPerPx: 0.0025,
  stickRadiansPerSecond: 2.2,
  lookSmoothingMs: 60,
  bobVoxels: 0.15,
  strideVoxels: 7,
  easeMs: 1200,
  maxPitch: (80 * Math.PI) / 180,
};

export type WalkSettingsInput = Partial<WalkSettings>;

export function resolveWalkSettings(input: WalkSettingsInput = {}): WalkSettings {
  return { ...DEFAULT_WALK_SETTINGS, ...input };
}

/** A move: `x` to the right, `y` forward, each -1 to 1 (a stick's, or the keys' at full tilt). */
export interface WalkVector {
  x: number;
  y: number;
}

/**
 * The movement keys by their physical place (`KeyboardEvent.code`): W, A, S, D on a QWERTY keyboard are Z, Q, S, D on an AZERTY
 * one; the arrows too.
 */
export const WALK_KEYS: Readonly<Record<string, WalkVector>> = {
  KeyW: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** Whether a key moves the walker (`WALK_KEYS`). */
export const isWalkKey = (code: string): boolean => code in WALK_KEYS;

/** The move the keys held give: their sum, each axis within -1 to 1, the length at most 1 (a diagonal is no faster). */
export function moveOfKeys(held: Iterable<string>): WalkVector {
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (const code of held) {
    const key = WALK_KEYS[code];
    if (!key || seen.has(code)) continue;
    seen.add(code);
    x += key.x;
    y += key.y;
  }
  return clampVector({ x: Math.sign(x), y: Math.sign(y) });
}

/** A vector cut to length 1 at most. */
export function clampVector(v: WalkVector): WalkVector {
  const length = Math.hypot(v.x, v.y);
  return length > 1 ? { x: v.x / length, y: v.y / length } : { x: v.x, y: v.y };
}

/**
 * The look stick's turn rate, in radians a second on each axis: its tilt (clamped to 1) times its tilt's length, so a small tilt
 * turns slowly and a full one at `stickRadiansPerSecond`. `x` turns right, `y` looks up.
 */
export function stickLookRate(tilt: WalkVector, settings: Pick<WalkSettings, "stickRadiansPerSecond">): WalkVector {
  const v = clampVector(tilt);
  const length = Math.hypot(v.x, v.y);
  return { x: v.x * length * settings.stickRadiansPerSecond, y: v.y * length * settings.stickRadiansPerSecond };
}

/**
 * The farthest point of the near plane from the eye, in world units, for a vertical field of view `fovDegrees` and an `aspect`
 * (width over height): the walker's radius and headroom keep every solid voxel farther than this, so nothing close is cut.
 */
export function nearPlaneReach(near: number, fovDegrees: number, aspect: number): number {
  const halfHeight = near * Math.tan((fovDegrees * Math.PI) / 360);
  const halfWidth = halfHeight * aspect;
  return Math.hypot(near, halfHeight, halfWidth);
}

/** What the walk is doing: easing down to the streets, walking, or easing back to the view it came from. */
export type WalkPhase = "entering" | "walking" | "leaving";

/** The walk's state, for a host's readout. */
export interface WalkState {
  phase: WalkPhase;
  /** The feet's place on the board, in world units (the board's frame), and the floor's height under them. */
  x: number;
  z: number;
  floor: number;
  /** Where the view looks: the yaw around the vertical and the pitch, in radians. */
  yaw: number;
  pitch: number;
  /** What the feet stand on: a road, or a city's ground. */
  ground: "road" | "city";
  /** How long the walk's ground took to build, in ms, and how many columns are walkable. */
  buildMs: number;
  walkable: number;
}

/** What a host drives a walk with (`GameScene.startWalk`): the keys' or the move stick's move, the look stick's rate, the mouse. */
export interface WalkControl {
  /** The move held now (`x` right, `y` forward, at most 1): the keys (`moveOfKeys`) or the move stick; zero to stop. */
  setMove(move: WalkVector): void;
  /** The look stick's turn rate (`stickLookRate`), in radians a second; zero to stop. */
  setLookRate(rate: WalkVector): void;
  /** A mouse move under the pointer lock, in CSS px (`movementX`, `movementY`). */
  look(dxPx: number, dyPx: number): void;
  state(): WalkState;
}
