// The voxel drop's settings (VOXEL-DROP, #512): plain data, no three, so the settings and the schedule load with the renderer
// while the drop itself (`voxel-drop.ts`) is a chunk of its own.

/** How a voxel accelerates over its fall: linear, `t^2` (gravity-like), `t^3` (a harder snap onto the ground). */
export const DROP_EASES = ["linear", "quad", "cubic"] as const;
export type DropEase = (typeof DROP_EASES)[number];

/** What a voxel does as it lands: nothing, a squash (flatten and widen, then settle), or a small rebound. */
export const DROP_LANDINGS = ["none", "squash", "bounce"] as const;
export type DropLanding = (typeof DROP_LANDINGS)[number];

/**
 * The drop of a placed tile (`GameScene.dropTile`): its voxels fall from the sky and land layer by layer from the bottom, within
 * a layer from the tile's centre to its edges. The whole tile takes `baseMs + msPerVoxel * (voxels above the ground slab)`,
 * clamped to `minMs` .. `maxMs`; the ground slab (62 to 80 % of the voxels) gets `slabShare` of the time the launches take.
 */
export interface VoxelDropSettings {
  /** The fixed part of the duration, ms. */
  baseMs: number;
  /** Added per voxel above the ground slab (the decor), ms. */
  msPerVoxel: number;
  /** The duration's bounds, ms (the issue: 1 to 2 s). */
  minMs: number;
  maxMs: number;
  /** The share of the launch window the ground slab's voxels use (the decor gets the rest). */
  slabShare: number;
  /** One voxel's fall, from its launch to its landing, ms (the last voxel lands at the duration). */
  fallMs: number;
  /** The height the voxels fall from, in voxels. */
  fallVoxels: number;
  ease: DropEase;
  landing: DropLanding;
  /** How far a voxel's launch moves along its layer's window at random, 0 (none) to 1 (the whole window). */
  jitter: number;
  /** How far a layer's launches overlap the next layer's, 0 (strictly one layer after the other) to 1. */
  overlap: number;
  /** The falling voxels cast shadows (the whole board's shadow pass runs every frame of the drop). Off: the shadow comes at the swap. */
  shadows: boolean;
  /** Each falling cube has its dark outline, faded out as it lands. */
  outline: boolean;
  /** The clock's speed, 1 normal, below 1 slow motion (to inspect the order). */
  speed: number;
}

export type VoxelDropSettingsInput = Partial<VoxelDropSettings>;

export const DEFAULT_VOXEL_DROP_SETTINGS: VoxelDropSettings = {
  baseMs: 400,
  msPerVoxel: 0.4,
  minMs: 1000,
  maxMs: 2000,
  slabShare: 0.25,
  fallMs: 320,
  fallVoxels: 28,
  ease: "quad",
  landing: "squash",
  jitter: 0.35,
  overlap: 0.4,
  shadows: false,
  outline: true,
  speed: 1,
};

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** The settings: each field over the base's, a bad value (NaN, out of range, an unknown name) falling back to the base's. */
export function resolveVoxelDropSettings(input: VoxelDropSettingsInput = {}, base: VoxelDropSettings = DEFAULT_VOXEL_DROP_SETTINGS): VoxelDropSettings {
  const merged = { ...base, ...input };
  const minMs = clamp(merged.minMs, 100, 20_000, base.minMs);
  return {
    baseMs: clamp(merged.baseMs, 0, 20_000, base.baseMs),
    msPerVoxel: clamp(merged.msPerVoxel, 0, 20, base.msPerVoxel),
    minMs,
    maxMs: Math.max(minMs, clamp(merged.maxMs, 100, 20_000, base.maxMs)),
    slabShare: clamp(merged.slabShare, 0, 1, base.slabShare),
    fallMs: clamp(merged.fallMs, 50, 2000, base.fallMs),
    fallVoxels: clamp(merged.fallVoxels, 1, 200, base.fallVoxels),
    ease: DROP_EASES.includes(merged.ease) ? merged.ease : base.ease,
    landing: DROP_LANDINGS.includes(merged.landing) ? merged.landing : base.landing,
    jitter: clamp(merged.jitter, 0, 1, base.jitter),
    overlap: clamp(merged.overlap, 0, 1, base.overlap),
    shadows: typeof merged.shadows === "boolean" ? merged.shadows : base.shadows,
    outline: typeof merged.outline === "boolean" ? merged.outline : base.outline,
    speed: clamp(merged.speed, 0.05, 4, base.speed),
  };
}
