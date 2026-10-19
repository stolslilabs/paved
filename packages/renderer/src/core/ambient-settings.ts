/**
 * The ambient effects' settings (AMBIENT, #572 to #574): the one loop every ambient effect draws on (`ambient-loop.ts`) and
 * the effects themselves. No three here: the board's chunk holds this module and the loop; each effect is a chunk of its own,
 * loaded the first time the effects are on (the particles: `ambient-particles.ts`).
 */

/** One kind of particle (the water's motes, the wonders' sparkles): what it looks like and how it moves. */
export interface ParticleKindSettings {
  enabled: boolean;
  /** Particles per emitter voxel of a tile (the water's top voxels, the wonder's free ones), before the caps. */
  density: number;
  /** At most this many particles on one tile. */
  perTile: number;
  /** A particle's diameter, in world units (a tile is 3, a voxel 0.075). */
  size: number;
  /** One rise, its life, in seconds: it fades in, rises and drifts, and fades out over it. */
  lifeSeconds: number;
  /** How high it rises over its life, in world units. */
  rise: number;
  /** How far it sways sideways, in world units. */
  drift: number;
  /** Its opacity at the top of its fade, 0 to 1 (additive: a low opacity is a faint light). */
  opacity: number;
  /** Its colour (CSS). */
  color: string;
}

export interface AmbientParticlesSettings {
  /** The motes over the water ("magic water"). */
  water: ParticleKindSettings;
  /** The sparkles over the wonders. */
  wonder: ParticleKindSettings;
  /** At most this many particles of one kind on the board. */
  boardCap: number;
  /**
   * The smallest and the largest a particle is drawn, in CSS px: its world size gives its size on screen in between, so it does
   * not vanish under a pixel at the play distance nor grow into a blob when zoomed in.
   */
  minPixels: number;
  maxPixels: number;
  /**
   * The night glow (a proposal for the owner): at night, while the day and night cycle draws the board, the particles are
   * brighter and a little larger, by up to this factor (0: as by day).
   */
  nightGlow: number;
  /** Fade out as the camera zooms out, with the outlines' curve (`outlineFadeOf`): the particles are gone where the outlines are. */
  zoomFade: boolean;
}

export interface AmbientSettings {
  /**
   * The ambient effects, on or off. Off by default in the renderer: the app's board turns them on from its setting
   * ("Ambient effects", on by default). Even on, they are off on the Low tier and under reduced motion (`ambientAllowed`).
   */
  enabled: boolean;
  /** The loop's rate cap, in frames a second: the ambient effects never ask for more frames than this. */
  fps: number;
  /** Reduced motion: "auto" follows the device (`prefers-reduced-motion`); true turns the effects off, false keeps them. */
  reducedMotion: boolean | "auto";
  particles: AmbientParticlesSettings;
}

export type AmbientSettingsInput = Partial<Omit<AmbientSettings, "particles">> & {
  particles?: Partial<Omit<AmbientParticlesSettings, "water" | "wonder">> & {
    water?: Partial<ParticleKindSettings>;
    wonder?: Partial<ParticleKindSettings>;
  };
};

/** The rate the loop is capped at by default: about 30 frames a second, half a 60 Hz screen's. */
export const AMBIENT_FPS = 30;

/**
 * The defaults, tuned at the phone's camera distance (375 x 812) to be almost unnoticed (the owner's, #572): a few pale cyan
 * motes over the water, fewer, slower gold sparkles over the wonders.
 */
export const DEFAULT_AMBIENT_PARTICLES: AmbientParticlesSettings = {
  water: { enabled: true, density: 0.2, perTile: 8, size: 0.1, lifeSeconds: 4.5, rise: 0.55, drift: 0.08, opacity: 0.55, color: "#bff4ff" },
  wonder: { enabled: true, density: 0.025, perTile: 6, size: 0.11, lifeSeconds: 6, rise: 0.8, drift: 0.05, opacity: 0.6, color: "#ffe6a3" },
  boardCap: 240,
  minPixels: 4,
  maxPixels: 14,
  nightGlow: 0.8,
  zoomFade: true,
};

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  enabled: false,
  fps: AMBIENT_FPS,
  reducedMotion: "auto",
  particles: DEFAULT_AMBIENT_PARTICLES,
};

const finite = (value: unknown, fallback: number, min = 0): number => (typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback);

function resolveKind(input: Partial<ParticleKindSettings> | undefined, base: ParticleKindSettings): ParticleKindSettings {
  const i = input ?? {};
  return {
    enabled: typeof i.enabled === "boolean" ? i.enabled : base.enabled,
    density: finite(i.density, base.density),
    perTile: Math.floor(finite(i.perTile, base.perTile)),
    size: finite(i.size, base.size),
    lifeSeconds: finite(i.lifeSeconds, base.lifeSeconds, 0.1),
    rise: finite(i.rise, base.rise),
    drift: finite(i.drift, base.drift),
    opacity: Math.min(1, finite(i.opacity, base.opacity)),
    color: typeof i.color === "string" ? i.color : base.color,
  };
}

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveAmbientSettings(input: AmbientSettingsInput = {}, base: AmbientSettings = DEFAULT_AMBIENT_SETTINGS): AmbientSettings {
  const p = input.particles ?? {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    // At least 1 a second, at most 60: a rate past the screen's draws nothing more.
    fps: Math.min(60, finite(input.fps, base.fps, 1)),
    reducedMotion: input.reducedMotion === "auto" || typeof input.reducedMotion === "boolean" ? input.reducedMotion : base.reducedMotion,
    particles: {
      water: resolveKind(p.water, base.particles.water),
      wonder: resolveKind(p.wonder, base.particles.wonder),
      boardCap: Math.floor(finite(p.boardCap, base.particles.boardCap)),
      minPixels: finite(p.minPixels, base.particles.minPixels),
      maxPixels: Math.max(finite(p.minPixels, base.particles.minPixels), finite(p.maxPixels, base.particles.maxPixels)),
      nightGlow: finite(p.nightGlow, base.particles.nightGlow),
      zoomFade: typeof p.zoomFade === "boolean" ? p.zoomFade : base.particles.zoomFade,
    },
  };
}

/**
 * Whether the ambient effects run: on in the settings, not on the Low tier, and not under reduced motion (the setting, or the
 * device's for "auto").
 */
export function ambientAllowed(settings: Pick<AmbientSettings, "enabled" | "reducedMotion">, quality: string, deviceReducedMotion: boolean): boolean {
  const reduced = settings.reducedMotion === "auto" ? deviceReducedMotion : settings.reducedMotion;
  return settings.enabled && quality !== "low" && !reduced;
}
