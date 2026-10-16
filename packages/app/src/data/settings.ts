import { useMemo } from "react";
import { resolveQuality, SMALL_SCREEN_PX, type QualityTier, type RendererSettingsInput } from "@paved/renderer";
import { createDeviceStore, useDeviceStore, type DeviceStore } from "./device-store";

// The device settings (P11a, section 6.4): graphics quality, sound, music, tile preview and placement highlight, kept on
// this device under one versioned key. The theme choice (`paved.theme.v1`, the viewer's skins opt-out) is `skins.ts`'s.

/** Where this device keeps its settings: one key, one JSON object; a change of shape is a new key. */
export const SETTINGS_KEY = "paved.settings.v1";

/**
 * The graphics quality: "auto" or a tier of the renderer (`RendererSettings.quality`). The tiers are provisional until
 * LIGHT-GPU measures them on real GPUs: "auto" picks Low on a phone and Medium on a desktop, High only by hand.
 */
export type GraphicsQuality = "auto" | QualityTier;

export const QUALITIES: readonly GraphicsQuality[] = ["auto", "low", "medium", "high"];

export interface DeviceSettings {
  quality: GraphicsQuality;
  /** Stored only: the app plays no audio yet. */
  sound: boolean;
  /** Stored only: the app plays no audio yet. */
  music: boolean;
  /** Show the tile on a slot before it is placed (the board's ghost). */
  tilePreview: boolean;
  /** Outline the slots where the tile in hand fits. */
  placementHighlight: boolean;
}

/** The mockups' defaults: quality "auto", sound on, music off, preview and highlight on. */
export const DEFAULT_SETTINGS: DeviceSettings = { quality: "auto", sound: true, music: false, tilePreview: true, placementHighlight: true };

/** The stored text as settings: each field that is missing or of the wrong kind takes its default; text that is not an object, all defaults. */
export function parseSettings(raw: string): DeviceSettings {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return DEFAULT_SETTINGS;
  const o = json as Record<string, unknown>;
  const flag = (k: "sound" | "music" | "tilePreview" | "placementHighlight") => (typeof o[k] === "boolean" ? o[k] : DEFAULT_SETTINGS[k]);
  return {
    quality: QUALITIES.includes(o.quality as GraphicsQuality) ? (o.quality as GraphicsQuality) : DEFAULT_SETTINGS.quality,
    sound: flag("sound"),
    music: flag("music"),
    tilePreview: flag("tilePreview"),
    placementHighlight: flag("placementHighlight"),
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
 * The tier "auto" resolves to on this device, as the renderer does: Low on a coarse pointer or a small screen, else Medium
 * (`resolveQuality`). Read when the page draws; the renderer decides again by the board's own size.
 */
export function autoQuality(): QualityTier {
  const w = globalThis as { matchMedia?: (q: string) => { matches: boolean }; innerWidth?: number; innerHeight?: number };
  const coarse = w.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shorter = Math.min(w.innerWidth ?? 0, w.innerHeight ?? 0);
  return resolveQuality("auto", coarse || (shorter > 0 && shorter <= SMALL_SCREEN_PX));
}

/** What the board takes of the settings: the renderer's settings (quality, memoised so a change applies and a render does not), and the two board switches. */
export function useBoardSettings(): { renderer: RendererSettingsInput; tilePreview: boolean; placementHighlight: boolean } {
  const [{ quality, tilePreview, placementHighlight }] = useDeviceSettings();
  const renderer = useMemo<RendererSettingsInput>(() => ({ quality }), [quality]);
  return { renderer, tilePreview, placementHighlight };
}
