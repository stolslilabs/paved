/**
 * The ambient effects' settings (AMBIENT, #572 to #574): the one loop every ambient effect draws on (`ambient-loop.ts`) and the
 * effects' own knobs (the cloud shadows, #573). No three here: the board's chunk holds this module and the loop; each effect is a
 * chunk of its own, loaded the first time the effects are on.
 */
import { SEASONS, type Season } from "./daynight-settings";

/**
 * The cloud shadows (CLOUD-SHADOWS, #573): clouds that pass in front of the sun and dim its direct light on the board, never the
 * sky's or the ambient light. Subtle (the owner's word): a light, soft shade that drifts, never a dark patch.
 */
export interface CloudShadowSettings {
  enabled: boolean;
  /** The share of the board under a cloud, 0 to 1 (before the season's factor). */
  coverage: number;
  /** The world units one period of the cloud pattern spans (a tile is 3): larger, larger clouds. */
  scale: number;
  /** The width of a cloud's soft edge, as a share of the board (0 a hard edge, 1 a shade with no edge at all). */
  softness: number;
  /** The share of the sun's direct light a cloud takes at its core, 0 to 1. */
  darkness: number;
  /** Where the wind blows toward, in degrees on the board (0 along +x, 90 along +z). */
  windDirection: number;
  /** The wind's speed, world units a second. */
  windSpeed: number;
  /** The clouds' height over the board, world units: their shadow falls along the sun's direction from there. */
  height: number;
  /**
   * At night (the day and night cycle drawing it), the share of `darkness` the clouds take of the moon's light: 0, the clouds go
   * with the sun (the proposal), up to 1, as dark on the moon's light as on the sun's.
   */
  moon: number;
  /** The coverage's factor in each season, while the day and night cycle draws the board (a proposal: more in autumn and winter). */
  seasonCoverage: Record<Season, number>;
  /**
   * Visible wisps between the camera and the board, their opacity at a cloud's core: 0 (the default) draws none, since a cloud
   * over the board would hide it. Above 0, one more draw: a story's variant for the owner to judge.
   */
  wisps: number;
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
  /** The cloud shadows (#573). */
  clouds: CloudShadowSettings;
}

export type AmbientSettingsInput = Partial<Omit<AmbientSettings, "clouds">> & {
  clouds?: Partial<Omit<CloudShadowSettings, "seasonCoverage">> & { seasonCoverage?: Partial<Record<Season, number>> };
};

/** The rate the loop is capped at by default: about 30 frames a second, half a 60 Hz screen's. */
export const AMBIENT_FPS = 30;

/**
 * The defaults, tuned at the phone's camera distance (375 x 812): about two fifths of the board shaded at a time, clouds of four
 * to eight tiles with wide soft edges, a fifth of the sun's light taken at a cloud's core (#573: 15 to 25 %), a wind of a tile in
 * six seconds. Off at night (the sun is down), no visible wisps.
 */
export const DEFAULT_CLOUD_SHADOWS: CloudShadowSettings = {
  enabled: true,
  coverage: 0.4,
  scale: 30,
  softness: 0.5,
  darkness: 0.2,
  windDirection: 30,
  windSpeed: 0.5,
  height: 24,
  moon: 0,
  seasonCoverage: { summer: 0.8, autumn: 1.2, winter: 1.3, spring: 1 },
  wisps: 0,
};

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  enabled: false,
  fps: AMBIENT_FPS,
  reducedMotion: "auto",
  clouds: DEFAULT_CLOUD_SHADOWS,
};

const finite = (value: unknown, fallback: number, min = 0): number => (typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback);

const share = (value: unknown, fallback: number): number => Math.min(1, finite(value, fallback));

function resolveClouds(input: AmbientSettingsInput["clouds"] = {}, base: CloudShadowSettings): CloudShadowSettings {
  const seasons = input.seasonCoverage ?? {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    coverage: share(input.coverage, base.coverage),
    scale: finite(input.scale, base.scale, 1),
    softness: share(input.softness, base.softness),
    darkness: share(input.darkness, base.darkness),
    windDirection: typeof input.windDirection === "number" && Number.isFinite(input.windDirection) ? input.windDirection : base.windDirection,
    windSpeed: finite(input.windSpeed, base.windSpeed),
    height: finite(input.height, base.height),
    moon: share(input.moon, base.moon),
    seasonCoverage: Object.fromEntries(SEASONS.map((season) => [season, finite(seasons[season], base.seasonCoverage[season])])) as Record<Season, number>,
    wisps: share(input.wisps, base.wisps),
  };
}

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveAmbientSettings(input: AmbientSettingsInput = {}, base: AmbientSettings = DEFAULT_AMBIENT_SETTINGS): AmbientSettings {
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    // At least 1 a second, at most 60: a rate past the screen's draws nothing more.
    fps: Math.min(60, finite(input.fps, base.fps, 1)),
    reducedMotion: input.reducedMotion === "auto" || typeof input.reducedMotion === "boolean" ? input.reducedMotion : base.reducedMotion,
    clouds: resolveClouds(input.clouds, base.clouds),
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
