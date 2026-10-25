// No three here: the chimney smoke's settings, small and eager; the effect is a chunk of its own (`chimney-smoke.ts`, loaded by
// `GameScene.syncSmoke`). CHIMNEY-SMOKE-1 (#770 PR 1) made them the study's knobs; CHIMNEY-SMOKE-2 reads them as `RendererSettings.smoke`.
import type { QualityTier } from "./look";
import type { Season } from "./daynight-settings";

/**
 * How a plume looks: the study's two looks (#770, open point 2) are two sets of these (`SMOKE_LOOKS`). Lengths are world units
 * (a tile is 3, a voxel 0.075), times in seconds.
 */
export interface SmokeLook {
  /** The plume's lit colour and its shaded side (sRGB hex). */
  color: string;
  shade: string;
  /** A puff's opacity at its thickest, 0 to 1. */
  opacity: number;
  /** The puffs a chimney sends up at a time (one instance each). */
  puffs: number;
  /** How long a puff takes from the mouth to its fading out. */
  lifeSeconds: number;
  /** How high a puff rises before it is gone. */
  rise: number;
  /** A puff's size at the mouth and at the top. */
  sizeStart: number;
  sizeEnd: number;
  /** How far a puff sways from the plume's line, at the top. */
  swirl: number;
  /** How ragged a puff's edge is (the noise read in its shader), 0 round to 1 torn. */
  billow: number;
  /** A puff's height over its width (1 round; above 1 a wisp drawn upward). */
  stretch: number;
  /** How far the wind bends the plume at its top, a share of the wind's speed (world units a second) times its life. */
  drift: number;
}

export type SmokeLookName = "puffs" | "wisps";

/**
 * The study's two looks. "puffs" is the issue's default: a light grey plume of soft round puffs, about one tile high. "wisps": a
 * thinner, taller, fainter trail that sways more, closer to a wood fire's smoke seen from afar.
 */
export const SMOKE_LOOKS: Record<SmokeLookName, SmokeLook> = {
  puffs: { color: "#e4e7eb", shade: "#9ba3ad", opacity: 0.65, puffs: 9, lifeSeconds: 5, rise: 2.6, sizeStart: 0.14, sizeEnd: 0.5, swirl: 0.12, billow: 0.35, stretch: 1, drift: 0.5 },
  wisps: { color: "#d3d8df", shade: "#8b939e", opacity: 0.5, puffs: 16, lifeSeconds: 6.5, rise: 3.4, sizeStart: 0.1, sizeEnd: 0.42, swirl: 0.28, billow: 0.7, stretch: 1.7, drift: 0.8 },
};

/** A season's smoke: on or off, and how thick (1 the look as it is; winter's fires burn more). */
export interface SmokeSeason {
  enabled: boolean;
  amount: number;
}

export interface SmokeSettings {
  /** The smoke on at all. */
  enabled: boolean;
  look: SmokeLookName;
  /** Values over the look's (the stories' knobs). */
  custom: Partial<SmokeLook>;
  /** A change of season fades the smoke in or out over this (#770 item 5: about 2 s, never a pop). */
  fadeSeconds: number;
  /** A tile just placed: its smoke fades in over this, its white voxels gone at once (#770 item 3: about 1 s). */
  placeSeconds: number;
  /** The smoke's light at full night, a share of the day's (as the fog's: it takes the scene's light, not the hour). */
  night: number;
  /** Each season's smoke (owner, 2026-10-25: on in autumn, winter and spring, off in summer). */
  seasons: Record<Season, SmokeSeason>;
}

/**
 * The smoke's own defaults: on, the look "puffs" (#770 open point 2's default: the owner chose no other on PR 1). A scene's
 * `RendererSettings.smoke` is off until its owner turns it on; the chunk resolves it over these.
 */
export const DEFAULT_SMOKE_SETTINGS: SmokeSettings = {
  enabled: true,
  look: "puffs",
  custom: {},
  fadeSeconds: 2,
  placeSeconds: 1,
  night: 0.35,
  seasons: {
    summer: { enabled: false, amount: 1 },
    autumn: { enabled: true, amount: 1 },
    winter: { enabled: true, amount: 1.25 },
    spring: { enabled: true, amount: 0.85 },
  },
};

export type SmokeSettingsInput = Partial<Omit<SmokeSettings, "seasons">> & { seasons?: Partial<Record<Season, Partial<SmokeSeason>>> };

const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The settings, a partial input over the defaults (or `base`). */
export function resolveSmokeSettings(input: SmokeSettingsInput = {}, base: SmokeSettings = DEFAULT_SMOKE_SETTINGS): SmokeSettings {
  const seasons = { ...base.seasons };
  for (const season of Object.keys(seasons) as Season[]) {
    const given = input.seasons?.[season];
    seasons[season] = {
      enabled: typeof given?.enabled === "boolean" ? given.enabled : base.seasons[season].enabled,
      amount: Math.max(0, finite(given?.amount, base.seasons[season].amount)),
    };
  }
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    look: input.look === "puffs" || input.look === "wisps" ? input.look : base.look,
    custom: { ...base.custom, ...input.custom },
    fadeSeconds: Math.max(0, finite(input.fadeSeconds, base.fadeSeconds)),
    placeSeconds: Math.max(0, finite(input.placeSeconds, base.placeSeconds)),
    night: clamp01(finite(input.night, base.night)),
    seasons,
  };
}

/** The look a setting draws: its named look, under its custom values. */
export const smokeLookOf = (settings: SmokeSettings): SmokeLook => ({ ...SMOKE_LOOKS[settings.look], ...settings.custom });

/** Whether the smoke draws: "off" or "moving". There is no still smoke (owner, 2026-10-25: none under reduced motion, the white voxels shown). */
export type SmokeMode = "off" | "moving";

/**
 * The smoke's mode: an ambient effect, so none under the Low tier, under reduced motion or with "Ambient effects" off (#770 item
 * 6: the white voxels shown then); a paused loop freezes it (the loop's time stops), which is not a mode.
 */
export function smokeMode(input: { enabled: boolean; ambient: boolean; tier: QualityTier; reducedMotion: boolean }): SmokeMode {
  return input.enabled && input.ambient && input.tier !== "low" && !input.reducedMotion ? "moving" : "off";
}

/** The most chimneys one smoke mesh holds (its instances are `puffs` a chimney): a full Forest board has about 40. */
export const MAX_SMOKE_CHIMNEYS = 256;
