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
  /** The city and road lights at night (FEATURE-HL's labels): off, the night is lit by the moon and the floor alone. */
  nightLights: boolean;
  /** The night lights' colour (sRGB hex) and strength, an emissive radiance added to the lit voxels. */
  nightLightColor: string;
  nightLightIntensity: number;
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
  nightLightIntensity: 0.4,
  brightnessFloor: 0.85,
  frameMs: 33,
  reducedMotion: "auto",
};

/** `input` over `base`, field by field: a value of the wrong kind or out of range keeps the base's. */
export function resolveDayNightSettings(input: Partial<DayNightSettings> = {}, base: DayNightSettings = DEFAULT_DAYNIGHT_SETTINGS): DayNightSettings {
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
    nightLightIntensity: typeof input.nightLightIntensity === "number" && input.nightLightIntensity >= 0 ? input.nightLightIntensity : base.nightLightIntensity,
    brightnessFloor: share(input.brightnessFloor, base.brightnessFloor),
    frameMs: positive(input.frameMs, base.frameMs),
    reducedMotion: input.reducedMotion === "auto" || typeof input.reducedMotion === "boolean" ? input.reducedMotion : base.reducedMotion,
  };
}
