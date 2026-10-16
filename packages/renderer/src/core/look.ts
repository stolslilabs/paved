import type { EffectsCapabilities } from "./types";

/**
 * The board's lighting and post-processing (LIGHT): every light and effect is one switchable, tunable group of
 * `LookSettings`; a named preset (`LOOK_PRESETS`) gives them all, and a quality tier (`QualityTier`) turns off the
 * effects a device cannot afford (`resolveLook`). Colours are CSS hex strings (sRGB); angles are degrees.
 */

/** Tone-mapping curve of the final pass: AgX and ACES are the two filmic curves compared; "none" is a plain clamp. */
export type ToneMappingMode = "agx" | "aces" | "neutral" | "none";
export const TONE_MAPPING_MODES: readonly ToneMappingMode[] = ["agx", "aces", "neutral", "none"];

export interface LightSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  /** Compass angle of the light around the board, degrees: 0 from +Z (the screen's bottom at the opening view), 90 from +X (its right). */
  azimuth: number;
  /** Height of the light above the horizon, degrees: low gives long shadows. */
  elevation: number;
}

export interface LookSettings {
  /** The warm key light, the only shadow caster's light. */
  key: LightSettings & {
    /** Shadow softness: the PCF filter's radius in shadow-map texels. */
    shadowSoftness: number;
  };
  /** The cooler fill from the other side: no shadow, keeps the shadowed faces readable. */
  fill: LightSettings;
  /** Sky (hemisphere) light: blue from above, dark green-brown from below, plus a flat ambient term. */
  sky: { enabled: boolean; skyColor: string; groundColor: string; intensity: number; ambient: number };
  /** Contact shading in the crevices: screen-space ambient occlusion from the depth buffer (`AoPass`). */
  ao: {
    enabled: boolean;
    /** World units around a point that occlude it (a voxel is 0.075). */
    radius: number;
    /** 0: none, 1: full. */
    intensity: number;
    /** Share of the drawing buffer's size the AO is computed at (0.5: half width, half height). */
    resolution: number;
  };
  /** The tone-mapping curve and the exposure before it. */
  toneMapping: { mode: ToneMappingMode; exposure: number };
  /** A light grade after the tone map: 1 leaves each unchanged; warmth shifts red up and blue down (0: none). */
  grade: { enabled: boolean; saturation: number; contrast: number; warmth: number };
  /** Screen-space darkening toward the corners. */
  vignette: { enabled: boolean; offset: number; darkness: number };
  /** Distance fog toward the background colour (`FogExp2`). */
  fog: { enabled: boolean; density: number };
  /** The scene's background, the colour the board fades into. */
  background: string;
  /** Bloom on what is brighter than `threshold` (the emissive highlights, in practice), `UnrealBloomPass`. */
  bloom: { enabled: boolean; strength: number; radius: number; threshold: number };
  /** The empty slots' outlines and the placement ghost: emissive gold, brighter than 1 so the bloom picks them. */
  highlights: { slotColor: string; slotIntensity: number; ghostColor: string; ghostIntensity: number };
  /** Water texels of the tile palettes (blue), brightened and made glossier in the tile shader. */
  water: { enabled: boolean; brightness: number; roughness: number };
}

/** A partial look: each group may name only some of its fields. */
export type LookSettingsInput = { [K in keyof LookSettings]?: LookSettings[K] extends object ? Partial<LookSettings[K]> : LookSettings[K] };

export type LookPreset = "mockup" | "soft" | "off";
export const LOOK_PRESET_NAMES: readonly LookPreset[] = ["mockup", "soft", "off"];

/**
 * Quality tiers: which effects run (`TIER_EFFECTS`). The look's values are the same in every tier; a tier only turns
 * effects off. The settings page's "Graphics quality" row (P11a) sets it; "auto" picks by device (`resolveQuality`).
 */
export type QualityTier = "low" | "medium" | "high";
export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];

/** The effects a tier can turn off: those that cost a pass (AO, bloom) or a shadow filter wider than the default. */
export interface TierEffects {
  ao: boolean;
  bloom: boolean;
  /** Soft shadows (a PCF radius above 1); off, the shadow filter's radius is 1. */
  softShadows: boolean;
}

/**
 * What each tier runs. **Provisional until measured on the GPU** (LIGHT; the per-effect costs are the follow-up run on
 * the Mac): low runs no extra pass; medium adds the bloom; high adds the ambient occlusion.
 */
export const TIER_EFFECTS: Record<QualityTier, TierEffects> = {
  low: { ao: false, bloom: false, softShadows: false },
  medium: { ao: false, bloom: true, softShadows: true },
  high: { ao: true, bloom: true, softShadows: true },
};

/**
 * The tiers of "auto": conservative (the PM's ruling, 2026-10-15). **Provisional until measured on the GPU** (LIGHT-GPU):
 * phones get Low (no AO, no bloom), desktops Medium; High is only chosen by hand.
 */
export const AUTO_QUALITY = { coarse: "low", fine: "medium" } as const satisfies Record<string, QualityTier>;

const MOCKUP: LookSettings = {
  key: { enabled: true, color: "#ffd8a0", intensity: 3.6, azimuth: -60, elevation: 34, shadowSoftness: 3 },
  fill: { enabled: true, color: "#8fb4ff", intensity: 0.7, azimuth: 120, elevation: 40 },
  sky: { enabled: true, skyColor: "#bcd4ff", groundColor: "#3a3324", intensity: 1.1, ambient: 0.25 },
  ao: { enabled: true, radius: 0.35, intensity: 0.8, resolution: 0.5 },
  toneMapping: { mode: "aces", exposure: 1.05 },
  grade: { enabled: true, saturation: 1.08, contrast: 1.08, warmth: 0.06 },
  vignette: { enabled: true, offset: 1.0, darkness: 0.45 },
  fog: { enabled: true, density: 0.0018 },
  // ACES crushes the darks: this lands on the mockups' dark navy on screen.
  background: "#30363f",
  // 0.9: the gold slots (x 1.6, luminance about 0.96) glow; no tile glows at 0.8 or above (LIGHT-GPU, GPU captures).
  bloom: { enabled: true, strength: 0.15, radius: 0.2, threshold: 0.9 },
  highlights: { slotColor: "#ffc23d", slotIntensity: 1.6, ghostColor: "#ffc23d", ghostIntensity: 0.25 },
  water: { enabled: true, brightness: 1.25, roughness: 0.15 },
};

/** Named looks: "mockup" (the default, toward the mockups), "soft" (gentler), "off" (plain lights, no effect). */
export const LOOK_PRESETS: Record<LookPreset, LookSettings> = {
  mockup: MOCKUP,
  soft: {
    ...MOCKUP,
    key: { ...MOCKUP.key, color: "#ffe6c4", intensity: 2.8, elevation: 48, shadowSoftness: 4 },
    fill: { ...MOCKUP.fill, color: "#b4c8ff", intensity: 0.9 },
    sky: { ...MOCKUP.sky, intensity: 1.4, ambient: 0.4 },
    ao: { ...MOCKUP.ao, intensity: 0.5 },
    toneMapping: { mode: "agx", exposure: 1.1 },
    grade: { enabled: true, saturation: 1.05, contrast: 1.0, warmth: 0.03 },
    vignette: { enabled: true, offset: 1.0, darkness: 0.3 },
    fog: { enabled: true, density: 0.001 },
    background: "#1a2330",
    bloom: { ...MOCKUP.bloom, strength: 0.1 },
  },
  off: {
    key: { enabled: true, color: "#ffffff", intensity: 2.6, azimuth: -28, elevation: 34, shadowSoftness: 1 },
    fill: { ...MOCKUP.fill, enabled: false },
    sky: { enabled: true, skyColor: "#ffffff", groundColor: "#444444", intensity: 1.2, ambient: 0.4 },
    ao: { ...MOCKUP.ao, enabled: false },
    toneMapping: { mode: "neutral", exposure: 1 },
    grade: { ...MOCKUP.grade, enabled: false },
    vignette: { ...MOCKUP.vignette, enabled: false },
    fog: { ...MOCKUP.fog, enabled: false },
    background: "#141b26",
    bloom: { ...MOCKUP.bloom, enabled: false },
    highlights: { slotColor: "#ffc23d", slotIntensity: 1, ghostColor: "#ffc23d", ghostIntensity: 0.2 },
    water: { ...MOCKUP.water, enabled: false },
  },
};

export const DEFAULT_LOOK_PRESET: LookPreset = "mockup";

/** `input` over `base`, group by group. An unknown tone-mapping mode keeps the base's. */
export function mergeLookSettings(base: LookSettings, input: LookSettingsInput = {}): LookSettings {
  const look = {} as Record<keyof LookSettings, unknown>;
  for (const key of Object.keys(base) as (keyof LookSettings)[]) {
    const value = base[key];
    const over = input[key];
    look[key] = typeof value === "object" ? { ...value, ...(over as object | undefined) } : (over ?? value);
  }
  const merged = look as unknown as LookSettings;
  if (!TONE_MAPPING_MODES.includes(merged.toneMapping.mode)) merged.toneMapping.mode = base.toneMapping.mode;
  return merged;
}

/** `input` over the preset's look. An unknown preset is the default. */
export function resolveLookSettings(input: LookSettingsInput = {}, preset: LookPreset = DEFAULT_LOOK_PRESET): LookSettings {
  return mergeLookSettings(LOOK_PRESETS[preset] ?? LOOK_PRESETS[DEFAULT_LOOK_PRESET], input);
}

/** What "auto" reads of the device, as for the pixel-ratio cap: a coarse pointer or a small screen. */
export function resolveQuality(quality: QualityTier | "auto", coarseOrSmall: boolean, capabilities: EffectsCapabilities = {}): QualityTier {
  if (quality !== "auto") return QUALITY_TIERS.includes(quality) ? quality : "medium";
  if (capabilities.lowPowerDevice) return "low";
  return coarseOrSmall ? AUTO_QUALITY.coarse : AUTO_QUALITY.fine;
}

/**
 * The look as drawn: the tier's effects only (`TIER_EFFECTS`), and what the device's capabilities forbid turned off
 * (`EffectsCapabilities`: `supportsSSAO`, `supportsBloom`, `supportsVignette`). Every other field is the look's.
 */
export function resolveLook(look: LookSettings, tier: QualityTier, capabilities: EffectsCapabilities = {}): LookSettings {
  const allowed = TIER_EFFECTS[tier];
  return {
    ...look,
    key: { ...look.key, shadowSoftness: allowed.softShadows ? look.key.shadowSoftness : 1 },
    ao: { ...look.ao, enabled: look.ao.enabled && allowed.ao && capabilities.supportsSSAO !== false },
    bloom: { ...look.bloom, enabled: look.bloom.enabled && allowed.bloom && capabilities.supportsBloom !== false },
    vignette: { ...look.vignette, enabled: look.vignette.enabled && capabilities.supportsVignette !== false },
  };
}

/** The direction a light shines from, a unit vector for its compass angle and height (`LightSettings`). */
export function lightDirection(azimuth: number, elevation: number): [number, number, number] {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}
