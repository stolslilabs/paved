/**
 * The birds' settings (BIRDS, #574): a flight from tree to tree now and then, one bird or a small flock. No three here. The board
 * does not call the birds yet: the stories (`Renderer/Birds`) hand these to `Birds` to judge the effect first. Distances are in
 * world units (a tile is `TILE_SIZE`, 3; a voxel of a tile 0.075).
 */
export interface BirdSettings {
  /** A flight every this many seconds on average (the gaps are random, an exponential law around this mean). */
  intervalSeconds: number;
  /** The share of the flights that are a flock (0: always one bird, 1: always a flock). */
  flockShare: number;
  /** The birds of a flock (a flight draws between two and this many). */
  flockSize: number;
  /** Cruise speed, world units a second. */
  speed: number;
  /** How high the birds fly over the higher of the two trees, world units. */
  flightHeight: number;
  /** How long a bird takes to rise out of the crown to its cruise, and to glide down onto the other tree, seconds. */
  takeoffSeconds: number;
  landingSeconds: number;
  /** The farthest a flight goes, in tiles (a tree this far at most; the nearest other tree when none is). */
  rangeTiles: number;
  /** The bird's length, world units (its wingspan is about the same). */
  size: number;
  /** The bird's colour (sRGB hex). */
  color: string;
  /** The birds cast shadows (the board's shadow map is then redrawn on every step a bird flies). */
  shadows: boolean;
  /** Wingbeats a second while flapping. */
  flapHz: number;
}

export type BirdSettingsInput = Partial<BirdSettings>;

/**
 * Subtle by default (the owner's word): a flight about every 14 s, mostly one bird, flying low and not far. A pale bird about four
 * voxels long: at a phone's play distance a dark one of 0.2 was lost over the foliage (captured in software WebGL), this one reads
 * as a bird without drawing the eye.
 */
export const DEFAULT_BIRD_SETTINGS: BirdSettings = {
  intervalSeconds: 14,
  flockShare: 0.35,
  flockSize: 5,
  speed: 2.4,
  flightHeight: 0.9,
  takeoffSeconds: 0.9,
  landingSeconds: 1.1,
  rangeTiles: 3,
  size: 0.28,
  color: "#d8d2c4",
  shadows: false,
  flapHz: 7,
};

/** The most birds in the air at once: the instanced mesh's size. A flight that would pass it waits for the next. */
export const MAX_BIRDS = 24;

const finite = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveBirdSettings(input: BirdSettingsInput = {}, base: BirdSettings = DEFAULT_BIRD_SETTINGS): BirdSettings {
  return {
    intervalSeconds: finite(input.intervalSeconds, base.intervalSeconds, 0.5, 3600),
    flockShare: finite(input.flockShare, base.flockShare, 0, 1),
    flockSize: Math.round(finite(input.flockSize, base.flockSize, 2, MAX_BIRDS)),
    speed: finite(input.speed, base.speed, 0.1, 50),
    flightHeight: finite(input.flightHeight, base.flightHeight, 0, 50),
    takeoffSeconds: finite(input.takeoffSeconds, base.takeoffSeconds, 0.1, 10),
    landingSeconds: finite(input.landingSeconds, base.landingSeconds, 0.1, 10),
    rangeTiles: finite(input.rangeTiles, base.rangeTiles, 0.5, 50),
    size: finite(input.size, base.size, 0.01, 5),
    color: typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : base.color,
    shadows: typeof input.shadows === "boolean" ? input.shadows : base.shadows,
    flapHz: finite(input.flapHz, base.flapHz, 0, 30),
  };
}
