/**
 * The weather's settings (WEATHER-STUDY, #607 PR 2; wired by WEATHER-WIRE, #658): a weather tied to the season. No three here. The
 * board's scene hands these (`RendererSettings.weather`) to `Weather` (`weather.ts`, a chunk of its own, loaded the first time the
 * weather shows). The defaults are the owner's review of the study (2026-10-20, #607). Distances are in world units (a tile is
 * `TILE_SIZE`, 3; a voxel of a tile 0.075); speeds in world units a second.
 */
import type { Season } from "./daynight-settings";

/** Something that falls or drifts (the rain, the snow, the leaves, the petals): one instanced draw while it shows. */
export interface ParticleSettings {
  enabled: boolean;
  /** The share of the layer's most particles drawn (`PARTICLE_MAX`), 0 to 1. */
  density: number;
  /** The fall's speed, times the layer's own (`PARTICLE_FALL`). */
  speed: number;
  /** The particle's size, times the layer's own (`PARTICLE_SIZE`). */
  size: number;
  /** Its opacity at its fullest, 0 to 1. */
  opacity: number;
  /** The share of the cloud shadows' wind it takes (#573: the leaves and the rain blow along it). */
  wind: number;
}

/** A tint over the board: a colour it is multiplied by (sRGB hex), and how much of it, 0 (none) to 1. */
export interface GradeSettings {
  color: string;
  amount: number;
}

/**
 * Summer, a blazing sun: a warmer grade and a raised brightness, nothing more. The study's glare and heat shimmer were removed
 * (owner, 2026-10-20: no glow, no halo).
 */
export interface SummerSettings {
  enabled: boolean;
  grade: GradeSettings;
  /** The board's light raised by this share (0.1: a tenth stronger), multiplied in by the weather's grade. */
  brightness: number;
}

/** Autumn: the rain (fine streaks and a few splashes), the leaves blown along the wind, more clouds, a grey grade. */
export interface AutumnSettings {
  enabled: boolean;
  grade: GradeSettings;
  rain: ParticleSettings;
  /** The splashes where the rain lands, a share of their most (`SPLASH_MAX`); 0 none. */
  splashes: number;
  leaves: ParticleSettings;
  /** The cloud shadows' coverage, times this in autumn (the stories apply it to the clouds' settings). */
  clouds: number;
}

/**
 * Winter: the snow falling (slow, soft flakes) and a light veil of snow on the faces up (the tile shader), in soft rounded patches
 * so the tiles stay readable (owner, 2026-10-20: softer, and never squares).
 */
export interface WinterSettings {
  enabled: boolean;
  grade: GradeSettings;
  snow: ParticleSettings;
  /** The share of the faces up under a patch of snow (0 none, 1 every one). Static: it stays under reduced motion. */
  cover: number;
  /** How white a patch is at its heart, 0 (none) to 1 (the snow's colour): a veil, so the tile shows through. */
  veil: number;
}

/**
 * Spring: a raised brightness and a fresh grade, nothing more (owner, 2026-10-20: the sun rays were removed). The petals stay a
 * knob, off by default; the birds of #574 are not wired until the owner validates them.
 */
export interface SpringSettings {
  enabled: boolean;
  grade: GradeSettings;
  /** The board's light raised by this share, as summer's. */
  brightness: number;
  petals: ParticleSettings;
}

export interface WeatherSettings {
  /** The weather on. Even on, it is off on the Low tier and with the ambient effects off; under reduced motion only its static parts show (`weatherMode`). */
  enabled: boolean;
  /** The side of the square around the camera's target where the particles fall, world units (the 72-tile board spans about 30). */
  area: number;
  /** How fast the weather of one season fades into the next's, seconds (the cycle's own season change). */
  fadeSeconds: number;
  /** The weather's share at full night (the particles are lit by it; the grades and the brightness go with the sun). */
  night: number;
  summer: SummerSettings;
  autumn: AutumnSettings;
  winter: WinterSettings;
  spring: SpringSettings;
}

/** The layers that fall or drift. */
export const PARTICLE_LAYERS = ["rain", "leaves", "snow", "petals"] as const;
export type ParticleLayer = (typeof PARTICLE_LAYERS)[number];

/** The most particles of a layer (the instanced mesh's size): `density` 1 draws them all. */
export const PARTICLE_MAX: Record<ParticleLayer, number> = { rain: 2000, leaves: 160, snow: 1600, petals: 160 };
/** The layer's fall at `speed` 1, world units a second: the rain fast, the snow slow, the leaves and petals drifting. */
export const PARTICLE_FALL: Record<ParticleLayer, number> = { rain: 9, leaves: 0.45, snow: 0.7, petals: 0.35 };
/** The layer's size at `size` 1, world units: a streak's length (its width a twentieth of it), a flake's, a leaf's or a petal's side. */
export const PARTICLE_SIZE: Record<ParticleLayer, number> = { rain: 1, leaves: 0.16, snow: 0.07, petals: 0.1 };
/** The most splashes at once. */
export const SPLASH_MAX = 240;

const particles = (density: number, opacity: number, wind: number): ParticleSettings => ({ enabled: true, density, speed: 1, size: 1, opacity, wind });

/**
 * Subtle by default (the owner's word; the particles of #572 were removed for that), as the owner validated the study (2026-10-20,
 * #607): autumn's rain and leaves as they were, winter's snowfall as it was over a light veil on the tops, summer and spring a raised
 * brightness only. Tuned at a phone's play distance (375 x 812).
 */
export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  enabled: true,
  area: 48,
  fadeSeconds: 3,
  night: 0.35,
  summer: { enabled: true, grade: { color: "#ffd9a8", amount: 0.22 }, brightness: 0.12 },
  autumn: {
    enabled: true,
    grade: { color: "#c9d0d8", amount: 0.2 },
    rain: particles(0.3, 0.25, 4),
    splashes: 0.35,
    leaves: particles(0.25, 0.9, 2.5),
    clouds: 1.4,
  },
  winter: { enabled: true, grade: { color: "#d7e4f5", amount: 0.18 }, snow: particles(0.3, 0.75, 0.6), cover: 0.4, veil: 0.32 },
  spring: {
    enabled: true,
    grade: { color: "#f2ffe0", amount: 0.12 },
    brightness: 0.08,
    petals: { ...particles(0.2, 0.85, 2), enabled: false },
  },
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type WeatherSettingsInput = DeepPartial<WeatherSettings>;

const at = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const hex = (value: unknown, fallback: string): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

function resolveParticles(input: DeepPartial<ParticleSettings> = {}, base: ParticleSettings): ParticleSettings {
  return {
    enabled: flag(input.enabled, base.enabled),
    density: at(input.density, base.density, 0, 1),
    speed: at(input.speed, base.speed, 0, 10),
    size: at(input.size, base.size, 0.1, 10),
    opacity: at(input.opacity, base.opacity, 0, 1),
    wind: at(input.wind, base.wind, 0, 20),
  };
}

const resolveGrade = (input: DeepPartial<GradeSettings> = {}, base: GradeSettings): GradeSettings => ({ color: hex(input.color, base.color), amount: at(input.amount, base.amount, 0, 1) });

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveWeatherSettings(input: WeatherSettingsInput = {}, base: WeatherSettings = DEFAULT_WEATHER_SETTINGS): WeatherSettings {
  const su = input.summer ?? {};
  const au = input.autumn ?? {};
  const wi = input.winter ?? {};
  const sp = input.spring ?? {};
  return {
    enabled: flag(input.enabled, base.enabled),
    area: at(input.area, base.area, 4, 400),
    fadeSeconds: at(input.fadeSeconds, base.fadeSeconds, 0, 60),
    night: at(input.night, base.night, 0, 1),
    summer: {
      enabled: flag(su.enabled, base.summer.enabled),
      grade: resolveGrade(su.grade, base.summer.grade),
      brightness: at(su.brightness, base.summer.brightness, 0, 2),
    },
    autumn: {
      enabled: flag(au.enabled, base.autumn.enabled),
      grade: resolveGrade(au.grade, base.autumn.grade),
      rain: resolveParticles(au.rain, base.autumn.rain),
      splashes: at(au.splashes, base.autumn.splashes, 0, 1),
      leaves: resolveParticles(au.leaves, base.autumn.leaves),
      clouds: at(au.clouds, base.autumn.clouds, 0, 5),
    },
    winter: {
      enabled: flag(wi.enabled, base.winter.enabled),
      grade: resolveGrade(wi.grade, base.winter.grade),
      snow: resolveParticles(wi.snow, base.winter.snow),
      cover: at(wi.cover, base.winter.cover, 0, 1),
      veil: at(wi.veil, base.winter.veil, 0, 1),
    },
    spring: {
      enabled: flag(sp.enabled, base.spring.enabled),
      grade: resolveGrade(sp.grade, base.spring.grade),
      brightness: at(sp.brightness, base.spring.brightness, 0, 2),
      petals: resolveParticles(sp.petals, base.spring.petals),
    },
  };
}

/**
 * How the weather draws: "off" (the weather off, the ambient effects off, or the Low tier), "still" (reduced motion: nothing
 * falls, only the static parts show: the grades, the brightness, the snow on the tops) or "moving" (on the ambient loop).
 * `reducedMotion` is the ambient effects' setting: "auto" follows the device's.
 */
export type WeatherMode = "off" | "still" | "moving";

export function weatherMode(
  weather: Pick<WeatherSettings, "enabled">,
  ambient: { enabled: boolean; reducedMotion: boolean | "auto" },
  quality: string,
  deviceReducedMotion: boolean,
): WeatherMode {
  if (!weather.enabled || !ambient.enabled || quality === "low") return "off";
  const reduced = ambient.reducedMotion === "auto" ? deviceReducedMotion : ambient.reducedMotion;
  return reduced ? "still" : "moving";
}

/** The cloud shadows' coverage factor for a season under the weather: autumn's `clouds`, 1 in the others. */
export function weatherCloudFactor(settings: WeatherSettings, season: Season | null): number {
  return season === "autumn" && settings.enabled && settings.autumn.enabled ? settings.autumn.clouds : 1;
}

