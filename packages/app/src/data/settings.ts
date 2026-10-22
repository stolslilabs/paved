import { useMemo } from "react";
import type { BackdropPattern, HighlightStyle, QualityTier, RendererSettingsInput } from "@paved/renderer";
import { createDeviceStore, useDeviceStore, type DeviceStore } from "./device-store";

// The device settings (P11a, section 6.4): graphics quality, the day and night cycle, the ambient effects, the music and sound effects volumes, tile preview and
// placement highlight, kept on this device under one versioned key. The theme choice (`paved.theme.v1`, the viewer's skins opt-out) is `skins.ts`'s.

/**
 * `@paved/renderer`'s `SMALL_SCREEN_PX`, repeated: the renderer's barrel is one module that pulls three.js, and the `/settings`
 * chunk imports this one (measured at the build: it put three.js, 805 kB, in the settings data chunk). `device-settings.test.ts`
 * checks that this and `autoTier` agree with the renderer's `resolveQuality`; the renderer is a type-only import here.
 */
export const SMALL_SCREEN_PX = 600;

/** What "auto" resolves to: `resolveQuality("auto", coarseOrSmall)` of `@paved/renderer`, without `lowPowerDevice`. */
export const autoTier = (_coarseOrSmall: boolean): QualityTier => "medium";

/** Where this device keeps its settings: one key, one JSON object; a change of shape is a new key. */
export const SETTINGS_KEY = "paved.settings.v1";

/**
 * The graphics quality: "auto" or a tier of the renderer (`RendererSettings.quality`). The tiers were set from the GPU
 * figures (LIGHT-GPU): "auto" picks Medium on a phone and on a desktop (Low on a low-power device), High only by hand.
 */
export type GraphicsQuality = "auto" | QualityTier;

export const QUALITIES: readonly GraphicsQuality[] = ["auto", "low", "medium", "high"];

export interface DeviceSettings {
  quality: GraphicsQuality;
  /** The board's day and night cycle (DAYNIGHT, P-73): a moving sky, the sun's shadows, the city lights at night. */
  dayNight: boolean;
  /**
   * The ambient effects (#572 to #574): every effect on the renderer's one ambient loop.
   * The renderer keeps them off on the Low tier and under reduced motion, whatever this says.
   */
  ambient: boolean;
  /** The music volume, 0 to 1; 0 is muted. */
  musicVolume: number;
  /** The volume the music returns to when it is unmuted (above 0): the last level before the mute. */
  musicBefore: number;
  /** The sound effects' volume, 0 to 1; 0 is muted. */
  sfxVolume: number;
  /** The volume the sound effects return to when unmuted. */
  sfxBefore: number;
  /** Show the tile on a slot before it is placed (the board's ghost). */
  tilePreview: boolean;
  /** Outline the slots where the tile in hand fits. */
  placementHighlight: boolean;
  /**
   * The square grid on the board (SQUARE-GRID, the renderer's `squareGrid`): Realms' board on square cells, its fog with every
   * cell's border in the landscape's place, and the slots lit as an army's allowed moves in the plates' place. Off: the landscape
   * and the plates.
   */
  squareGrid: boolean;
}

/** The mockups' defaults: quality "auto", the day and night cycle on (the owner's, P-73), the ambient effects on (the owner's, #572), music at 0.4 (the owner's, P-81), sound effects at 0.7, preview and highlight on, the square grid on. */
export const DEFAULT_SETTINGS: DeviceSettings = {
  quality: "auto",
  dayNight: true,
  ambient: true,
  musicVolume: 0.4,
  musicBefore: 0.4,
  sfxVolume: 0.7,
  sfxBefore: 0.7,
  tilePreview: true,
  placementHighlight: true,
  squareGrid: true,
};

export type VolumeChannel = "music" | "sfx";
const FIELDS = { music: { volume: "musicVolume", before: "musicBefore" }, sfx: { volume: "sfxVolume", before: "sfxBefore" } } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A channel's volume set to `v` (0 to 1): above 0 it is also the level to return to; 0 is a mute and keeps the level before it. */
export function withVolume(s: DeviceSettings, channel: VolumeChannel, v: number): DeviceSettings {
  const f = FIELDS[channel];
  const next = Number.isFinite(v) ? clamp01(v) : 0;
  return { ...s, [f.volume]: next, [f.before]: next > 0 ? next : s[f.before] };
}

/** The channel muted if it sounds, back to the level before the mute if it is muted. */
export function withMuteToggled(s: DeviceSettings, channel: VolumeChannel): DeviceSettings {
  const f = FIELDS[channel];
  return withVolume(s, channel, s[f.volume] > 0 ? 0 : s[f.before]);
}

/**
 * The stored text as settings: each field that is missing or of the wrong kind takes its default; text that is not an object,
 * all defaults. The first shape (`sound` and `music` switches, `musicVolume`) migrates: a switch that was off is a mute (volume
 * 0, the level before it kept: `musicVolume` for the music). The new shape never writes the switches, so they only ever read as legacy.
 */
export function parseSettings(raw: string): DeviceSettings {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return DEFAULT_SETTINGS;
  const o = json as Record<string, unknown>;
  const flag = (k: "dayNight" | "ambient" | "tilePreview" | "placementHighlight" | "squareGrid") => (typeof o[k] === "boolean" ? o[k] : DEFAULT_SETTINGS[k]);
  const num = (k: string): number | null => (typeof o[k] === "number" && Number.isFinite(o[k]) ? clamp01(o[k]) : null);
  const channel = (volumeKey: string, beforeKey: string, legacyOn: unknown, fallback: number): { volume: number; before: number } => {
    const volume = num(volumeKey);
    const before = num(beforeKey);
    // The level to return to is above 0: a stored 0 or none takes the volume, then the default.
    const back = before && before > 0 ? before : volume && volume > 0 ? volume : fallback;
    if (legacyOn === false) return { volume: 0, before: back };
    return { volume: volume ?? back, before: back };
  };
  const music = channel("musicVolume", "musicBefore", o.music, DEFAULT_SETTINGS.musicBefore);
  const sfx = channel("sfxVolume", "sfxBefore", o.sound, DEFAULT_SETTINGS.sfxBefore);
  return {
    quality: QUALITIES.includes(o.quality as GraphicsQuality) ? (o.quality as GraphicsQuality) : DEFAULT_SETTINGS.quality,
    dayNight: flag("dayNight"),
    ambient: flag("ambient"),
    musicVolume: music.volume,
    musicBefore: music.before,
    sfxVolume: sfx.volume,
    sfxBefore: sfx.before,
    tilePreview: flag("tilePreview"),
    placementHighlight: flag("placementHighlight"),
    squareGrid: flag("squareGrid"),
  };
}

export function createSettingsStore(storage?: Parameters<typeof createDeviceStore>[4]): DeviceStore<DeviceSettings> {
  return createDeviceStore(SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings, JSON.stringify, storage);
}

/** The app's store, on `localStorage`. */
export const deviceSettings = createSettingsStore();

/** The device settings in a component, with a setter for one field. */
export function useDeviceSettings(): [DeviceSettings, <K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) => void] {
  const [settings, set] = useDeviceStore(deviceSettings);
  return [settings, (key, value) => set({ ...deviceSettings.get(), [key]: value })];
}

/**
 * The tier "auto" resolves to on this device, as the renderer does: Medium, on a coarse pointer or a small screen as
 * elsewhere (`autoTier`, `resolveQuality`'s). Read when the page draws; the renderer decides again by the board's own size.
 */
export function autoQuality(): QualityTier {
  const w = globalThis as { matchMedia?: (q: string) => { matches: boolean }; innerWidth?: number; innerHeight?: number };
  const coarse = w.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shorter = Math.min(w.innerWidth ?? 0, w.innerHeight ?? 0);
  return autoTier(coarse || (shorter > 0 && shorter <= SMALL_SCREEN_PX));
}

/**
 * The renderer's `HighlightStyle`s and `BackdropPattern`s, repeated (the renderer is a type-only import here, as for
 * `SMALL_SCREEN_PX`): the shapes of the square grid's highlight and backdrop a page's `?filler=` and `?void=` ask for, to compare
 * them on a board (SQUARE-GRID).
 */
const FILLER_STYLES: readonly HighlightStyle[] = ["plain", "twist", "diamond", "breathe", "frame"];
const VOID_PATTERNS: readonly BackdropPattern[] = ["realms", "cobbles", "contours", "voxels"];

/**
 * The square grid as the board draws it: on or off (the device setting), its highlight in the style `?filler=` names, its backdrop
 * in the pattern `?void=` names and its voxel blocks as fine as `?voxels=` (a cell's side, 1 to 80), if any.
 */
export function squareGridSettings(on: boolean, search: string = globalThis.location?.search ?? ""): NonNullable<RendererSettingsInput["squareGrid"]> {
  if (!on) return { enabled: false };
  const params = new URLSearchParams(search);
  const style = params.get("filler") as HighlightStyle | null;
  const pattern = params.get("void") as BackdropPattern | null;
  const voxels = Number(params.get("voxels"));
  const backdrop = {
    ...(pattern && VOID_PATTERNS.includes(pattern) ? { pattern } : {}),
    ...(Number.isInteger(voxels) && voxels >= 1 && voxels <= 80 ? { voxels } : {}),
  };
  return {
    enabled: true,
    ...(style && FILLER_STYLES.includes(style) ? { highlight: { style } } : {}),
    ...(Object.keys(backdrop).length > 0 ? { backdrop } : {}),
  };
}

/**
 * The fog of war on every board (FOG-EVERYWHERE, #648; the owner's choice of #633): the renderer's fog, the landscape beyond a
 * soft edge, every corner rounded. It stays on at every tier, still where the ambient effects cannot move it.
 */
export const BOARD_FOG = { enabled: true } as const;

/**
 * What the board takes of the settings: the renderer's settings (quality, the day and night cycle, the ambient effects, the fog, memoised so a change
 * applies and a render does not), and the two board switches.
 */
export function useBoardSettings(): { renderer: RendererSettingsInput; tilePreview: boolean; placementHighlight: boolean } {
  const [{ quality, dayNight, ambient, tilePreview, placementHighlight, squareGrid }] = useDeviceSettings();
  const renderer = useMemo<RendererSettingsInput>(
    () => ({ quality, dayNight: { enabled: dayNight }, ambient: { enabled: ambient }, fog: BOARD_FOG, squareGrid: squareGridSettings(squareGrid) }),
    [quality, dayNight, ambient, squareGrid],
  );
  return { renderer, tilePreview, placementHighlight };
}
