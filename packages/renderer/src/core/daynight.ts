// The day and night cycle (DAYNIGHT, P-73): its own chunk, loaded by `GameScene` once the cycle is on. Pure functions of
// time (no three, no DOM), and `drawDayNight`, which sets what they give on the scene's lights, its backdrop and the
// tiles' night lights (here, not in the board's chunk).
import type { AmbientLight, DirectionalLight, Fog, FogExp2, HemisphereLight } from "three";
import { lightDirection } from "./look";
import { DAY_PHASE_AT, SEASONS, type DayNightSettings, type DayPhase, type Season } from "./daynight-settings";

/** A colour in OKLab (L, a, b), or in linear sRGB (r, g, b). */
export type Vec3 = [number, number, number];

/** sRGB hex (`#rrggbb`) to linear sRGB, each channel 0 to 1. */
export function hexToLinear(hex: string): Vec3 {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [decode(((n >> 16) & 255) / 255), decode(((n >> 8) & 255) / 255), decode((n & 255) / 255)];
}

/** Linear sRGB to OKLab (Björn Ottosson's matrices). */
export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear sRGB, clamped to 0 and up (the backdrop's shader does the same, `FinishPass`). */
export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * One keyframe: a season at a phase. The backdrop's two ends (the screen's top and bottom, display colours: Tailwind
 * tokens where one fits), the sun (the key light, the shadows' light), the fill (the moon at night), the sky light, its
 * ambient term, and the night lights' level (0 off, 1 all on). Colours are sRGB hex; intensities those of the look's lights.
 */
export interface Keyframe {
  top: string;
  bottom: string;
  sun: string;
  sunIntensity: number;
  fill: string;
  fillIntensity: number;
  sky: string;
  ground: string;
  skyIntensity: number;
  ambient: number;
  lights: number;
}

/**
 * The 16 keyframes, season by season. The day of summer is the Mockup look's lights (`LOOK_PRESETS.mockup`); the others
 * shift their colour and strength. Token names in the comments (`packages/app/src/styles/theme.css`).
 */
export const KEYFRAMES: Record<Season, Record<DayPhase, Keyframe>> = {
  summer: {
    // river-800 to amber-400; the sun amber-300.
    dawn: { top: "#114c7c", bottom: "#f49848", sun: "#ffb57a", sunIntensity: 2.4, fill: "#8fb4ff", fillIntensity: 0.6, sky: "#c8c0e8", ground: "#3a3324", skyIntensity: 0.9, ambient: 0.22, lights: 0.3 },
    // river-700 to river-400.
    day: { top: "#1f65a1", bottom: "#6bb7ff", sun: "#ffd8a0", sunIntensity: 3.6, fill: "#8fb4ff", fillIntensity: 0.7, sky: "#bcd4ff", ground: "#3a3324", skyIntensity: 1.1, ambient: 0.25, lights: 0 },
    // river-900 to ember-500; the sun ember-400.
    dusk: { top: "#083559", bottom: "#f85e4d", sun: "#ff8b7b", sunIntensity: 2.4, fill: "#9a9cff", fillIntensity: 0.6, sky: "#c9a8c8", ground: "#2e2620", skyIntensity: 0.85, ambient: 0.2, lights: 0.6 },
    // ink-950 to river-900; the moon river-200.
    night: { top: "#0a141c", bottom: "#083559", sun: "#ffd8a0", sunIntensity: 0, fill: "#c2e0ff", fillIntensity: 1.2, sky: "#7f9cd0", ground: "#141a24", skyIntensity: 0.55, ambient: 0.14, lights: 1 },
  },
  autumn: {
    // ink-800 to amber-500; the sun amber-300.
    dawn: { top: "#23303a", bottom: "#e8892e", sun: "#ffb57a", sunIntensity: 2.2, fill: "#9aa8ff", fillIntensity: 0.55, sky: "#d0b8a0", ground: "#3a2a1a", skyIntensity: 0.85, ambient: 0.2, lights: 0.35 },
    // river-800 to amber-300.
    day: { top: "#114c7c", bottom: "#ffb57a", sun: "#ffc890", sunIntensity: 3.3, fill: "#8fa8e8", fillIntensity: 0.65, sky: "#d8ccb0", ground: "#3a2c1c", skyIntensity: 1, ambient: 0.24, lights: 0 },
    // ember-900 to amber-600.
    dusk: { top: "#5f110c", bottom: "#b66403", sun: "#ff9a60", sunIntensity: 2.2, fill: "#9090e0", fillIntensity: 0.55, sky: "#c09080", ground: "#2a1c14", skyIntensity: 0.8, ambient: 0.18, lights: 0.65 },
    // ink-950 to ember-950.
    night: { top: "#0a141c", bottom: "#3e0503", sun: "#ffc890", sunIntensity: 0, fill: "#b8c8f0", fillIntensity: 1.2, sky: "#8a86b0", ground: "#1a1410", skyIntensity: 0.5, ambient: 0.13, lights: 1 },
  },
  winter: {
    // ink-800 to river-200; the sun gold-100.
    dawn: { top: "#23303a", bottom: "#c2e0ff", sun: "#fbebcd", sunIntensity: 2, fill: "#a8c0ff", fillIntensity: 0.7, sky: "#d8e4f4", ground: "#50586a", skyIntensity: 0.95, ambient: 0.25, lights: 0.45 },
    // ink-700 to ink-400; the sun ink-50.
    day: { top: "#3e4c57", bottom: "#93a0ab", sun: "#f3f7fb", sunIntensity: 3, fill: "#a8c4ff", fillIntensity: 0.8, sky: "#e0ecff", ground: "#5a6270", skyIntensity: 1.2, ambient: 0.3, lights: 0 },
    // ink-900 to river-700.
    dusk: { top: "#172129", bottom: "#1f65a1", sun: "#ffb0a0", sunIntensity: 2, fill: "#a0b0ff", fillIntensity: 0.65, sky: "#a8b4d8", ground: "#3a4250", skyIntensity: 0.85, ambient: 0.2, lights: 0.7 },
    // ink-950 to ink-800; the moon ink-100.
    night: { top: "#0a141c", bottom: "#23303a", sun: "#f3f7fb", sunIntensity: 0, fill: "#e8ecef", fillIntensity: 1.2, sky: "#8ca0c8", ground: "#2a3240", skyIntensity: 0.6, ambient: 0.16, lights: 1 },
  },
  spring: {
    // river-800 to gold-200; the sun gold-200.
    dawn: { top: "#114c7c", bottom: "#f6d8a1", sun: "#f6d8a1", sunIntensity: 2.4, fill: "#9cb8ff", fillIntensity: 0.6, sky: "#d0dcf0", ground: "#34402a", skyIntensity: 0.9, ambient: 0.22, lights: 0.3 },
    // river-600 to meadow-300.
    day: { top: "#3180c5", bottom: "#95dc94", sun: "#fff0c8", sunIntensity: 3.5, fill: "#90b8ff", fillIntensity: 0.7, sky: "#c8e0ff", ground: "#34482a", skyIntensity: 1.15, ambient: 0.26, lights: 0 },
    // river-900 to ember-300.
    dusk: { top: "#083559", bottom: "#ffb0a4", sun: "#ffa890", sunIntensity: 2.3, fill: "#a0a8ff", fillIntensity: 0.6, sky: "#d0b0c8", ground: "#2a3020", skyIntensity: 0.85, ambient: 0.2, lights: 0.6 },
    // ink-950 to meadow-950.
    night: { top: "#0a141c", bottom: "#012604", sun: "#fff0c8", sunIntensity: 0, fill: "#c8e0d8", fillIntensity: 1.2, sky: "#7f9cc0", ground: "#142018", skyIntensity: 0.55, ambient: 0.14, lights: 1 },
  },
};

/** The sun's highest elevation in each season, degrees (its noon). */
export const SUN_ELEVATION: Record<Season, number> = { summer: 62, autumn: 42, winter: 28, spring: 50 };

/** The share of a cycle the sun is up: 0.625 of 120 s is 75 s of day (dawn and dusk included), then 45 s of night. */
export const DAY_SHARE = 0.625;

/**
 * Where each keyframe holds in a cycle (0 a dawn, 1 the next): between two holds the cycle eases from one keyframe to the
 * next (a smoothstep), and after the night it eases into the next season's dawn.
 */
export const HOLDS: ReadonlyArray<readonly [DayPhase, number, number]> = [
  ["dawn", 0, 0.03],
  ["day", 0.12, 0.46],
  ["dusk", 0.55, 0.59],
  ["night", 0.68, 0.93],
];

/** Where the cycle is: its season, the position in the cycle, and the keyframes it is between with the blend. */
export interface CyclePoint {
  /** The season of the day under way (the night eases into the next season's dawn). */
  season: Season;
  /** The phase it reads as: the nearer of the two keyframes it is between. */
  phase: DayPhase;
  /** 0 a dawn, 1 the next. */
  position: number;
  from: { season: Season; phase: DayPhase };
  to: { season: Season; phase: DayPhase };
  /** 0: at `from`, 1: at `to`. */
  blend: number;
}

const seasonAt = (index: number): Season => SEASONS[((index % 4) + 4) % 4];

/** The cycle at `seasons`, the seasons since a summer's dawn (`DayNightSettings.freezeAt`'s unit). */
export function cycleAt(seasons: number): CyclePoint {
  const index = Math.floor(seasons);
  const position = seasons - index;
  const season = seasonAt(index);
  for (let i = 0; i < HOLDS.length; i++) {
    const [phase, start, end] = HOLDS[i];
    if (position >= start && position <= end) return { season, phase, position, from: { season, phase }, to: { season, phase }, blend: 0 };
    const last = i === HOLDS.length - 1;
    const [nextPhase, nextStart] = last ? [HOLDS[0][0], 1] : [HOLDS[i + 1][0], HOLDS[i + 1][1]];
    if (position > end && position < nextStart) {
      const blend = smoothstep((position - end) / (nextStart - end));
      const to = { season: last ? seasonAt(index + 1) : season, phase: nextPhase };
      return { season, phase: blend < 0.5 ? phase : nextPhase, position, from: { season, phase }, to, blend };
    }
  }
  return { season, phase: "dawn", position, from: { season, phase: "dawn" }, to: { season, phase: "dawn" }, blend: 0 };
}

/** What the scene draws at one moment: linear sRGB colours, unit directions toward the light, OKLab backdrop ends. */
export interface DayNightFrame {
  point: CyclePoint;
  sun: { direction: Vec3; color: Vec3; intensity: number };
  fill: { direction: Vec3; color: Vec3; intensity: number };
  sky: { color: Vec3; ground: Vec3; intensity: number; ambient: number };
  backdrop: { top: Vec3; bottom: Vec3 };
  /** The fog's colour (linear): the backdrop's middle, so the far board fades toward it. */
  fog: Vec3;
  /** The night lights' level: 0 off, 1 all on (each switches on at its own level, the tile shader's stagger). */
  lights: number;
}

/** The keyframes' colours in OKLab, converted once: every blend is in OKLab, never in sRGB. */
const LAB = new Map<string, Vec3>();
const lab = (hex: string): Vec3 => {
  let value = LAB.get(hex);
  if (!value) LAB.set(hex, (value = linearToOklab(hexToLinear(hex))));
  return value;
};

/** The lowest elevation the shadows are drawn from: under it the sun has faded out (`sunUp`), the light stays put. */
const SHADOW_MIN_ELEVATION = 8;

/** The sun's compass angle and height at a position of the cycle (east at its rise, west at its set), and how up it is (0 to 1). */
export function sunAt(season: Season, position: number): { azimuth: number; elevation: number; up: number } {
  const u = Math.min(1, position / DAY_SHARE);
  const elevation = position < DAY_SHARE ? SUN_ELEVATION[season] * Math.sin(Math.PI * u) : 0;
  // Azimuth 90 is east (+X, the board's east), 0 the south (+Z, the screen's bottom), -90 the west.
  return { azimuth: 90 - 180 * u, elevation, up: smoothstep(elevation / 8) };
}

/** The fill's compass angle and height: opposite the sun by day, the moon's arc by night, eased at sunset and sunrise. */
export function fillAt(position: number): { azimuth: number; elevation: number } {
  if (position >= DAY_SHARE) {
    const v = (position - DAY_SHARE) / (1 - DAY_SHARE);
    return { azimuth: 90 - 180 * v, elevation: 20 + 25 * Math.sin(Math.PI * v) };
  }
  const sun = sunAt("summer", position);
  const rise = clamp01(position / 0.07);
  const set = clamp01((DAY_SHARE - position) / 0.075);
  return { azimuth: sun.azimuth + 180, elevation: mix(20, 40, Math.min(rise, set)) };
}

/**
 * The frame at `seasons` (`cycleAt`): the keyframes blended in OKLab (colours) and linearly (strengths), the sun on its
 * arc, the moon on its own, and the night's floor: the sky light and the ambient at least `floor` of the season's day.
 */
export function dayNightFrame(seasons: number, floor = 0): DayNightFrame {
  const point = cycleAt(seasons);
  const a = KEYFRAMES[point.from.season][point.from.phase];
  const b = KEYFRAMES[point.to.season][point.to.phase];
  const t = point.blend;
  const color = (key: "top" | "bottom" | "sun" | "fill" | "sky" | "ground") => mix3(lab(a[key]), lab(b[key]), t);
  const value = (key: "sunIntensity" | "fillIntensity" | "skyIntensity" | "ambient" | "lights") => mix(a[key], b[key], t);
  const day = KEYFRAMES[point.season].day;

  const sun = sunAt(point.season, point.position);
  // Under the horizon the light stays at its setting place: the shadow map is not drawn again until the next sunrise.
  const shadowFrom = point.position < DAY_SHARE ? sun : sunAt(point.season, DAY_SHARE);
  const fill = fillAt(point.position);
  const top = color("top");
  const bottom = color("bottom");
  return {
    point,
    sun: {
      direction: lightDirection(shadowFrom.azimuth, Math.max(SHADOW_MIN_ELEVATION, shadowFrom.elevation)),
      color: oklabToLinear(color("sun")),
      intensity: value("sunIntensity") * sun.up,
    },
    fill: { direction: lightDirection(fill.azimuth, fill.elevation), color: oklabToLinear(color("fill")), intensity: value("fillIntensity") },
    sky: {
      color: oklabToLinear(color("sky")),
      ground: oklabToLinear(color("ground")),
      intensity: Math.max(value("skyIntensity"), floor * day.skyIntensity),
      ambient: Math.max(value("ambient"), floor * day.ambient),
    },
    backdrop: { top, bottom },
    fog: oklabToLinear(mix3(top, bottom, 0.5)),
    lights: clamp01(value("lights")),
  };
}

/**
 * The season's ground colour at `point` (linear): its day's, steady through the day and the night, blended only across a change
 * of season (the night into the next season's dawn). The square grid's backdrop takes its hue from it.
 */
export function seasonGroundAt(point: CyclePoint): Vec3 {
  return oklabToLinear(mix3(lab(KEYFRAMES[point.from.season].day.ground), lab(KEYFRAMES[point.to.season].day.ground), point.blend));
}

/** A season from a seed (mulberry32's first draw): the same seed gives the same season everywhere. */
export function seededSeason(seed: number): Season {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const draw = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return SEASONS[Math.floor(draw * 4)];
}

/** The page's own season, drawn once when the chunk loads: every board of the page starts from it (`season` "random", no seed). */
const PAGE_SEASON: Season = SEASONS[Math.floor(Math.random() * 4)];

/** The first cycle's season for the settings: the one named, the seed's, or the page's. */
export function startSeason(season: Season | "random", seed: number | null): Season {
  if (season !== "random") return season;
  return seed === null ? PAGE_SEASON : seededSeason(seed);
}

/**
 * The cycle's clock: the time it has run, in cycle ms, advanced by the real time between two calls times the speed, so a
 * new speed carries on from where the cycle is. It moves in steps of `frameMs` of real time: between two steps the frame
 * does not change (the shadows are drawn at most once a step).
 */
export class DayNightClock {
  private elapsed: number;
  private last: number;
  private step = -1;

  /** `startMs`: the cycle time it starts at (the page's time, so a board opened later is further into the cycle). */
  constructor(now: number, startMs = 0) {
    this.elapsed = startMs;
    this.last = now;
  }

  /** Advances to `now`; true when a new step began (the frame changed). */
  advance(now: number, speed: number, frameMs: number): boolean {
    const step = Math.floor(now / frameMs);
    if (step === this.step) return false;
    this.step = step;
    this.elapsed += Math.max(0, now - this.last) * speed;
    this.last = now;
    return true;
  }

  /** The cycle time run, ms. */
  get time(): number {
    return this.elapsed;
  }
}

/** Where a page's cycle starts: the beginning of the day's keyframe, so a board opens in daylight. */
export const START_POSITION = HOLDS[1][1];

/** When the chunk loaded: the page's cycle runs from then, so every board of the page, opened when it may, shares it. */
const PAGE_START = typeof performance !== "undefined" ? performance.now() : 0;

/** The page's cycle time at `now` (ms), in cycles of `cycleMs` at real speed, from `START_POSITION` of its first cycle. */
export function pageCycleTime(now: number, cycleMs: number): number {
  return Math.max(0, now - PAGE_START) + START_POSITION * cycleMs;
}

/** The seasons since a summer's dawn after `elapsedMs` of cycles of `cycleMs` that started at `season`'s dawn. */
export function seasonsAt(elapsedMs: number, cycleMs: number, season: Season): number {
  return SEASONS.indexOf(season) + elapsedMs / cycleMs;
}

/**
 * What `drawDayNight` sets: the scene's lights (null for one the look turns off: it stays dark), its fog, and the
 * scene's hooks for the shadow map, the backdrop and the night lights' level.
 */
export interface DayNightTarget {
  key: DirectionalLight | null;
  fill: DirectionalLight | null;
  sky: HemisphereLight | null;
  ambient: AmbientLight | null;
  fog: Fog | FogExp2 | null;
  /** The key and fill lights' distance from the origin, their target. */
  distance: number;
  /**
   * The cycle moves: the sun's shadows crossfade between the key light and its twin. False (still, or held at a moment):
   * the key light alone, and the twin, if any, is released.
   */
  crossfade: boolean;
  shadowMoved(): void;
  backdrop(top: Vec3, bottom: Vec3): void;
  lights(level: number): void;
}

/** The steps the sun's shadows are held at: 1 degree of its 180 degree arc. */
export const SHADOW_STEP = 1 / 180;

/** The key light's twin (`drawDayNight`): a copy of it, its shadow included, in the same scene, made once a key. */
const TWINS = new WeakMap<DirectionalLight, DirectionalLight>();

function twinOf(key: DirectionalLight): DirectionalLight {
  let twin = TWINS.get(key);
  if (!twin) {
    twin = key.clone();
    twin.target = key.target;
    key.parent?.add(twin);
    TWINS.set(key, twin);
  }
  return twin;
}

/** Takes the key light's twin out of its scene and frees its shadow map: the cycle is off. */
export function releaseDayNight(key: DirectionalLight | null): void {
  const twin = key && TWINS.get(key);
  if (!twin) return;
  twin.removeFromParent();
  twin.shadow.dispose();
  TWINS.delete(key);
}

/** three's linear sRGB colour space: the frame's colours are linear. */
const LINEAR = "srgb-linear";

/**
 * Draws the cycle at `seasons` (`dayNightFrame`) on the scene: the key light (the sun, the shadows' light: a new direction
 * redraws the shadow map), the fill (the moon at night), the sky light and ambient, the fog, the backdrop and the night
 * lights' level. Only values change: no light, material or pass is made. Returns the point drawn.
 */
export function drawDayNight(target: DayNightTarget, seasons: number, floor: number): CyclePoint {
  const frame = dayNightFrame(seasons, floor);
  const { key, fill, sky, ambient, distance: d } = target;
  if (key && !target.crossfade) {
    // A still or held cycle: the key light alone, at the sun's own place (no twin, no second shadow map or lookup).
    releaseDayNight(key);
    key.color.setRGB(...frame.sun.color, LINEAR);
    key.intensity = frame.sun.intensity;
    const [x, y, z] = frame.sun.direction;
    if (key.position.x !== x * d || key.position.y !== y * d || key.position.z !== z * d) {
      key.position.set(x * d, y * d, z * d);
      target.shadowMoved();
    }
  } else if (key) {
    // The sun's shadows in steps of `SHADOW_STEP` of its arc, crossfaded between the key light and its twin (`twinOf`): a
    // shadow map drawn again from a light turned by a fraction of a degree re-aliases every small shadow's edge, and the
    // board boils. Each light holds one step (the key the even ones, the twin the odd ones), the weight moves linearly
    // from one to the next, and a light jumps two steps on only while its weight is 0. Under the horizon both are dark.
    const twin = twinOf(key);
    const { season, position } = frame.point;
    const q = Math.min(1, position / DAY_SHARE) / SHADOW_STEP;
    const k = Math.floor(q);
    const even = k % 2 === 0;
    const toTwin = even ? q - k : 1 - (q - k);
    twin.color.setRGB(...frame.sun.color, LINEAR);
    twin.shadow.radius = key.shadow.radius;
    twin.visible = key.visible;
    let moved = false;
    for (const [light, step, weight] of [[key, even ? k : k + 1, 1 - toTwin], [twin, even ? k + 1 : k, toTwin]] as const) {
      light.intensity = frame.sun.intensity * weight;
      const sun = sunAt(season, Math.min(1, step * SHADOW_STEP) * DAY_SHARE);
      const [x, y, z] = lightDirection(sun.azimuth, Math.max(SHADOW_MIN_ELEVATION, sun.elevation));
      if (light.position.x !== x * d || light.position.y !== y * d || light.position.z !== z * d) {
        light.position.set(x * d, y * d, z * d);
        moved = true;
      }
    }
    key.color.setRGB(...frame.sun.color, LINEAR);
    if (moved) target.shadowMoved();
  }
  if (fill) {
    fill.color.setRGB(...frame.fill.color, LINEAR);
    fill.intensity = frame.fill.intensity;
    fill.position.set(...frame.fill.direction).multiplyScalar(d);
  }
  if (sky) {
    sky.color.setRGB(...frame.sky.color, LINEAR);
    sky.groundColor.setRGB(...frame.sky.ground, LINEAR);
    sky.intensity = frame.sky.intensity;
  }
  if (ambient) ambient.intensity = frame.sky.ambient;
  target.fog?.color.setRGB(...frame.fog, LINEAR);
  target.backdrop(frame.backdrop.top, frame.backdrop.bottom);
  target.lights(frame.lights);
  return frame.point;
}

/**
 * The cycle's moment to draw for the settings, in seasons since a summer's dawn: the first season's noon when still (the
 * Low tier, reduced motion: a still scene never shows a night, so it wins over a frozen moment, except one frozen in a
 * day: the season wheel's fixed states, which a still scene shows as chosen), else `freezeAt` when frozen, else where
 * `elapsedMs` of the clock has run it to.
 */
export function momentOf(settings: DayNightSettings, elapsedMs: number, still: boolean): number {
  const start = startSeason(settings.season, settings.seed);
  if (still) {
    const held = settings.freezeAt !== null ? cycleAt(settings.freezeAt) : null;
    if (held && held.phase === "day" && held.blend === 0) return settings.freezeAt!;
    return SEASONS.indexOf(start) + DAY_PHASE_AT.day;
  }
  if (settings.freezeAt !== null) return settings.freezeAt;
  return seasonsAt(elapsedMs, settings.cycleMs, start);
}
