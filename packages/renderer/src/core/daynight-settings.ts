/**
 * The day and night cycle's settings (DAYNIGHT, P-73): what the board's scene and the stories set. The cycle itself (its
 * clock, its keyframes and colours, `daynight.ts`) is its own chunk, loaded by `GameScene` only once the cycle is on; this
 * module is the little the board's chunk needs to know of it.
 */

/** The seasons, in the order the cycle runs them: a cycle is one day and one night of one season, the next is the next season. */
export const SEASONS = ["summer", "autumn", "winter", "spring"] as const;
export type Season = (typeof SEASONS)[number];

/** The phases of a cycle: dawn, day, dusk, night (the keyframes of a season, `daynight.ts`). */
export const DAY_PHASES = ["dawn", "day", "dusk", "night"] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

/**
 * The windows' light (NIGHT-WINDOWS-2, #571; the board's night lights since NIGHT-WINDOWS-DEFAULT, #583): the windows and the
 * doors of the buildings, found in the models, and the light they cast. The strength, reach and falloff are the first pass's
 * (#513); the detection is the second's.
 */
export interface WindowLightSettings {
  /** The emissive strength of the windows, the doors and their pools of light. */
  intensity: number;
  /** How far a window's light reaches, in voxels (a tile is 40). */
  reach: number;
  /** The falloff's exponent: 1 is linear, above 1 it drops faster near the window. */
  falloff: number;
  /** How far past the tile's border the light goes, in voxels, onto the neighbours' ground (0: it stops at the border). */
  margin: number;
  /**
   * The spread of the windows' switch-on levels over the night's ramp (the hash of each window): at 1 every window is on by
   * full night and most of them at dusk.
   */
  stagger: number;
  /**
   * Which openings are found: "through" (#571), the recesses and the openings through a wall into a room (lit, its windows
   * switching on together); "recesses", the first pass's (#513), recesses only and no room. For the stories' comparison.
   */
  detection: WindowDetection;
}

/** The detections (`WindowLightSettings.detection`): the second pass's, or the first's. */
export const WINDOW_DETECTIONS = ["through", "recesses"] as const;
export type WindowDetection = (typeof WINDOW_DETECTIONS)[number];

/**
 * The layers over the slab whose light the windows' spill keeps past a tile's border (`windows.ts`), the brightest of them: the
 * ground and the foot of the walls there. The tile shader fades it out over the next 4 (`NIGHT_WINDOWS_GLSL`).
 */
export const WINDOW_SPILL_LAYERS = 4;

/**
 * The first pass's light (#513: 0.4, reach 6, falloff 1.5), now that the second pass finds every window and door (#583). The
 * margin keeps the light going past the tile's border as far as it reaches, so a pool is not cut at the seam between tiles.
 */
export const DEFAULT_WINDOW_LIGHT: WindowLightSettings = { intensity: 0.4, reach: 6, falloff: 1.5, margin: 6, stagger: 1, detection: "through" };

/** `input` over `base`, field by field: a value of the wrong kind or out of range keeps the base's. */
export function resolveWindowLight(input: Partial<WindowLightSettings> = {}, base: WindowLightSettings = DEFAULT_WINDOW_LIGHT): WindowLightSettings {
  const at = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  return {
    intensity: at(input.intensity, base.intensity, 0, 8),
    reach: at(input.reach, base.reach, 1, 32),
    falloff: at(input.falloff, base.falloff, 0.25, 8),
    margin: Math.round(at(input.margin, base.margin, 0, 20)),
    stagger: at(input.stagger, base.stagger, 0.05, 4),
    detection: WINDOW_DETECTIONS.includes(input.detection!) ? input.detection! : base.detection,
  };
}

export interface DayNightSettings {
  /**
   * The cycle on the board: a gradient behind it, the sun and moon moving over it, the night lights. Off (the renderer's
   * default; the app's board turns it on from its settings row), the look's fixed lights and flat background.
   */
  enabled: boolean;
  /** One cycle, a day then a night of one season, in ms: 120,000 (about 75 s of day with its dawn and dusk, 45 s of night). */
  cycleMs: number;
  /** How fast the cycle runs: 1 is real time, 10 the stories' fast forward. */
  speed: number;
  /** The first cycle's season; "random" picks one by `seed`, or once per page when there is none. */
  season: Season | "random";
  /** Pins the random season (a story, a capture); null: random once per page. */
  seed: number | null;
  /**
   * Holds the cycle at one moment: the seasons since a summer's dawn, so 0 is summer's dawn, 0.5 a summer night and 1.3
   * an autumn noon (`DAY_PHASE_AT` gives each phase's moment in a cycle). Null: the cycle runs.
   */
  freezeAt: number | null;
  /**
   * The night lights: the buildings' windows and doors, found in the models, with the light they cast baked per model type
   * (NIGHT-WINDOWS, #513, #571, #583). Off, the night is lit by the moon and the floor alone.
   */
  nightLights: boolean;
  /** The night lights' colour (sRGB hex), an emissive radiance added where the windows' light falls. */
  nightLightColor: string;
  /** The windows' light: strength, reach, falloff, margin past the border and stagger. */
  windowLight: WindowLightSettings;
  /**
   * The night's floor: the sky light and the ambient at night are at least this share of the day's, so the board stays
   * readable for play (0: as the keyframes say).
   */
  brightnessFloor: number;
  /** How often a moving cycle redraws the board, in ms (the sun, the colours, the shadows): 33, about 30 frames a second. */
  frameMs: number;
  /**
   * A still scene: a fixed day (the start season's noon), no moving shadow. "auto" follows `prefers-reduced-motion`; the
   * Low tier is always still.
   */
  reducedMotion: boolean | "auto";
}

/** The moment of each phase in a cycle (0 a dawn, 1 the next): where a frozen phase holds, the middle of its keyframe. */
export const DAY_PHASE_AT: Record<DayPhase, number> = { dawn: 0.025, day: 0.3125, dusk: 0.57, night: 0.805 };

export const DEFAULT_DAYNIGHT_SETTINGS: DayNightSettings = {
  enabled: false,
  cycleMs: 120_000,
  speed: 1,
  season: "random",
  seed: null,
  freezeAt: null,
  nightLights: true,
  // amber-300: a warm window.
  nightLightColor: "#ffb57a",
  windowLight: DEFAULT_WINDOW_LIGHT,
  brightnessFloor: 0.85,
  frameMs: 33,
  reducedMotion: "auto",
};

/** What a caller sets: any field, the windows' light by field too. */
export type DayNightInput = Partial<Omit<DayNightSettings, "windowLight">> & { windowLight?: Partial<WindowLightSettings> };

/** `input` over `base`, field by field: a value of the wrong kind or out of range keeps the base's. */
export function resolveDayNightSettings(input: DayNightInput = {}, base: DayNightSettings = DEFAULT_DAYNIGHT_SETTINGS): DayNightSettings {
  const positive = (value: number | undefined, fallback: number) => (typeof value === "number" && value > 0 && Number.isFinite(value) ? value : fallback);
  const share = (value: number | undefined, fallback: number) => (typeof value === "number" && value >= 0 && value <= 1 ? value : fallback);
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    cycleMs: positive(input.cycleMs, base.cycleMs),
    speed: positive(input.speed, base.speed),
    season: input.season === "random" || SEASONS.includes(input.season!) ? input.season! : base.season,
    seed: input.seed === null || Number.isFinite(input.seed) ? (input.seed as number | null) : base.seed,
    freezeAt: input.freezeAt === null || Number.isFinite(input.freezeAt) ? (input.freezeAt as number | null) : base.freezeAt,
    nightLights: typeof input.nightLights === "boolean" ? input.nightLights : base.nightLights,
    nightLightColor: typeof input.nightLightColor === "string" ? input.nightLightColor : base.nightLightColor,
    windowLight: resolveWindowLight(input.windowLight, base.windowLight),
    brightnessFloor: share(input.brightnessFloor, base.brightnessFloor),
    frameMs: positive(input.frameMs, base.frameMs),
    reducedMotion: input.reducedMotion === "auto" || typeof input.reducedMotion === "boolean" ? input.reducedMotion : base.reducedMotion,
  };
}
