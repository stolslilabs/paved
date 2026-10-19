/**
 * The ambient effects' settings (AMBIENT, #572 to #574): the one loop every ambient effect draws on (`ambient-loop.ts`). No three
 * here: the board's chunk holds this module and the loop; each effect is a chunk of its own, loaded the first time the effects
 * are on.
 */

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
}

export type AmbientSettingsInput = Partial<AmbientSettings>;

/** The rate the loop is capped at by default: about 30 frames a second, half a 60 Hz screen's. */
export const AMBIENT_FPS = 30;

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  enabled: false,
  fps: AMBIENT_FPS,
  reducedMotion: "auto",
};

const finite = (value: unknown, fallback: number, min = 0): number => (typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback);

/** `input` over `base`, field by field; a value of the wrong kind or out of range keeps the base's. */
export function resolveAmbientSettings(input: AmbientSettingsInput = {}, base: AmbientSettings = DEFAULT_AMBIENT_SETTINGS): AmbientSettings {
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    // At least 1 a second, at most 60: a rate past the screen's draws nothing more.
    fps: Math.min(60, finite(input.fps, base.fps, 1)),
    reducedMotion: input.reducedMotion === "auto" || typeof input.reducedMotion === "boolean" ? input.reducedMotion : base.reducedMotion,
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
