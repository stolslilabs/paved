/**
 * The closed structures' highlight (CLOSE-SHINE, #722): when a move closes a structure, its voxels pulse a bright yellow as
 * its line appears in the closing feed, then a band of light sweeps across it at spaced intervals for the rest of the game,
 * each structure on its own clock. The look of animate-ui's Shine (a band slanted at -15 degrees, 1.2 s a sweep,
 * `cubic-bezier(0.4, 0, 0.2, 1)`, 0.3 opacity, then a pause), the renderer's own: nothing is imported or fetched.
 *
 * The knobs and the clocks, no three here: the layer (`closed-structures.ts`) builds its maps and uniforms from them, and the
 * tile shader replays the same curves (`CLOSED_GLSL`).
 */
import { PLAY_DEFAULT_POLAR_ANGLE } from "./CameraController";

/** The pulse: the structure's voxels go to `color`, then fade back to no tint. The rest of the board is not dimmed. */
export interface ClosingPulseSettings {
  /** The pulse's colour (sRGB hex): FEATURE-HL's yellow by default. */
  color: string;
  /** How far the voxels' colour goes to `color` at the pulse's peak, 0 to 1 (about the confirm's green, 0.6). */
  strength: number;
  /** The light the pulse adds at its peak (an emissive term, times `color`): the "bright" of bright yellow. */
  glow: number;
  /** The pulse's length, ms: about the confirm's (`motion.confirmMs`, 700). */
  ms: number;
  /** Its length under reduced motion, ms: a short tint, the confirm's rule (`motion.reducedConfirmMs`, 150). */
  reducedMs: number;
  /** The delay between the pulses of the structures one move closes, ms: the closing feed's stagger (0.15 s a line). */
  staggerMs: number;
}

/** The shine: a band of light that sweeps across a closed structure, then waits; each structure has its own phase. */
export interface ClosingShineSettings {
  /** Off: no sweep. Never under reduced motion, on the Low tier or on software WebGL, whatever this says (`shineAllowed`). */
  enabled: boolean;
  /** The band's light (sRGB hex), added on top of the voxels' colour, never a flat fill. */
  color: string;
  /** The band's light at its centre (the reference's opacity, 0.3). */
  strength: number;
  /** The band's width across its sweep, world units (a tile is 3). */
  width: number;
  /**
   * The band's slant, degrees, as seen from the board's fixed camera angle (#719): 0 an upright band that sweeps from left to
   * right, -15 (the reference's `skewX(-15deg)`) its top leaning to the right.
   */
  angle: number;
  /** One sweep's length, ms (the reference's 1.2 s). */
  durationMs: number;
  /** The time from a sweep's start to the next one's, ms: each structure picks its own between the two. */
  intervalMinMs: number;
  intervalMaxMs: number;
}

export interface ClosingSettings {
  /** Off: no pulse and no shine (the closed structures are still tracked; on again, they shine). */
  enabled: boolean;
  pulse: ClosingPulseSettings;
  shine: ClosingShineSettings;
}

export type ClosingSettingsInput = Partial<Omit<ClosingSettings, "pulse" | "shine">> & {
  pulse?: Partial<ClosingPulseSettings>;
  shine?: Partial<ClosingShineSettings>;
};

/**
 * The defaults: the issue's starting points (#722), to be tuned in the story ("Renderer/Closing"). The pulse is FEATURE-HL's
 * `#ffc23d` at the confirm's strength and length; the shine one sweep of 1.2 s every 6 to 8 s, a warm white at the
 * reference's 0.3, slanted at -15 degrees, a tile wide.
 */
export const DEFAULT_CLOSING_SETTINGS: ClosingSettings = {
  enabled: true,
  pulse: { color: "#ffc23d", strength: 0.6, glow: 0.35, ms: 700, reducedMs: 150, staggerMs: 150 },
  shine: { enabled: true, color: "#fff4d6", strength: 0.3, width: 3, angle: -15, durationMs: 1200, intervalMinMs: 6000, intervalMaxMs: 8000 },
};

/** `input` over `base`, group by group. */
export function resolveClosingSettings(input: ClosingSettingsInput = {}, base: ClosingSettings = DEFAULT_CLOSING_SETTINGS): ClosingSettings {
  return {
    enabled: input.enabled ?? base.enabled,
    pulse: { ...base.pulse, ...input.pulse },
    shine: { ...base.shine, ...input.shine },
  };
}

/** Whether the shine runs: on in the settings, and not under reduced motion, on the Low tier or on software WebGL (#572's rule). */
export function shineAllowed(settings: ClosingSettings, reducedMotion: boolean, lowPower: boolean): boolean {
  return settings.enabled && settings.shine.enabled && !reducedMotion && !lowPower;
}

/** The share of the pulse spent rising to its peak; the rest fades back (a smoothstep). The shader uses the same. */
export const PULSE_RISE = 0.15;

/** The pulse's level at `elapsed` ms of a pulse `duration` ms long: 0 before and after, a quick rise to 1, a slow fade. */
export function pulseLevel(elapsed: number, duration: number): number {
  if (!(duration > 0) || elapsed < 0 || elapsed >= duration) return 0;
  const e = elapsed / duration;
  return e < PULSE_RISE ? e / PULSE_RISE : 1 - smoothstep(PULSE_RISE, 1, e);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The sweep's ease, `cubic-bezier(0.4, 0, 0.2, 1)` (the reference's): the curve's x solved for `t` by Newton's method (five
 * steps from `t = p`, as the shader does), then its y.
 */
export function sweepEase(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  let t = x;
  for (let i = 0; i < 5; i++) {
    const u = 1 - t;
    const bx = 3 * u * u * t * 0.4 + 3 * u * t * t * 0.2 + t * t * t;
    const dx = 3 * u * u * 0.4 + 6 * u * t * (0.2 - 0.4) + 3 * t * t * (1 - 0.2);
    if (Math.abs(dx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - (bx - x) / dx));
  }
  const u = 1 - t;
  return 3 * u * t * t + t * t * t;
}

/** A structure's own number from its id, 0 (inclusive) to 1 (exclusive): FNV-1a, so every viewer and reload gets the same. */
export function structureHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** A structure's time from a sweep's start to the next, ms: between the two settings, by its hash. */
export function shineInterval(hash: number, shine: ClosingShineSettings): number {
  const min = Math.max(shine.durationMs, Math.min(shine.intervalMinMs, shine.intervalMaxMs));
  const max = Math.max(min, shine.intervalMaxMs);
  return min + hash * (max - min);
}

/** Whether a sweep runs at `since` ms after a structure's shine began, sweeps `interval` ms apart, each `duration` long. */
export function sweepRunning(since: number, interval: number, duration: number): boolean {
  return since >= 0 && interval > 0 && since % interval < duration;
}

/**
 * The axis the band sweeps along, in the board's frame (x east, y up, z south): a point's place across the sweep is its dot
 * product with it. Seen from the camera's fixed angle (`polar` from straight down, azimuth 0: the camera south of its target),
 * the screen's right is +x and its up `(0, sin polar, -cos polar)`; a band slanted `angle` degrees is the set of points where
 * `right + tan(angle) * up` is constant, so the band stays slanted on screen, the voxels' height included.
 */
export function sweepAxis(angle: number, polar: number = PLAY_DEFAULT_POLAR_ANGLE): [number, number, number] {
  const k = Math.tan((angle * Math.PI) / 180);
  return [1, k * Math.sin(polar), -k * Math.cos(polar)];
}

/**
 * A structure's extent across the sweep: the least and the most of `axis` over its tiles' boxes (each cell `tileSize` wide,
 * centred on its cell, `height` high), so the band starts and ends off the structure.
 */
export function sweepExtent(cells: Iterable<readonly [number, number]>, axis: readonly [number, number, number], tileSize: number, height: number): [number, number] {
  let [min, max] = [Infinity, -Infinity];
  const half = tileSize / 2;
  for (const [x, z] of cells) {
    for (const dx of [-half, half]) {
      for (const dz of [-half, half]) {
        for (const y of [0, height]) {
          const s = (x * tileSize + dx) * axis[0] + y * axis[1] + (z * tileSize + dz) * axis[2];
          min = Math.min(min, s);
          max = Math.max(max, s);
        }
      }
    }
  }
  return min <= max ? [min, max] : [0, 0];
}
