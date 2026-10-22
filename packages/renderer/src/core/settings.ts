import { CLOSEST_DISTANCE } from "./CameraController";
import { DEFAULT_CAMERA_FIT_SETTINGS, type CameraFitSettings } from "./camera-fit-settings";
import { MSAA_SAMPLES } from "./Effects";
import { DEFAULT_OUTLINE_SETTINGS, type OutlineSettings } from "./outlines";
import { DEFAULT_DAYNIGHT_SETTINGS, resolveDayNightSettings, type DayNightInput, type DayNightSettings } from "./daynight-settings";
import { DEFAULT_PLACEMENT_SETTINGS, resolvePlacementSettings, type PlacementSettings, type PlacementSettingsInput } from "./placement";
import { DEFAULT_VOXEL_DROP_SETTINGS, resolveVoxelDropSettings, type VoxelDropSettings, type VoxelDropSettingsInput } from "./voxel-drop-settings";
import { DEFAULT_AMBIENT_SETTINGS, resolveAmbientSettings, type AmbientSettings, type AmbientSettingsInput } from "./ambient-settings";
import { DEFAULT_FOG_SETTINGS, LANDSCAPE_FOG, resolveFogSettings, type FogSettings, type FogSettingsInput } from "./fog-of-war-settings";
import { DEFAULT_WEATHER_SETTINGS, resolveWeatherSettings, type WeatherSettings, type WeatherSettingsInput } from "./weather-settings";
import {
  DEFAULT_LOOK_PRESET,
  LOOK_PRESETS,
  LOOK_PRESET_NAMES,
  QUALITY_TIERS,
  mergeLookSettings,
  type LookPreset,
  type LookSettings,
  type LookSettingsInput,
  type QualityTier,
} from "./look";

/**
 * The renderer's settings: one object with defaults, given to `GameScene` (`RendererConfig.settings`,
 * `GameScene.setSettings`) or to `GameCanvas` (`settings`). A partial object overrides only what it names.
 */
export interface RendererSettings {
  /** The tiles' outlines and how they follow the zoom (`outlines.ts`). */
  outlines: OutlineSettings;
  /**
   * How close and how far the camera may go. Applied to the web controller (`CameraController`) only:
   * `NativeCameraController` has no setter for its limits, so on React Native these limits and the zoom-out cap do
   * nothing.
   */
  camera: CameraZoomSettings;
  /**
   * The camera's opening frame (CAMERA-FIT, #678, `camera-fit-settings.ts`; the fit itself, `camera-fit.ts`, is a chunk of its own): the board and its free slots fill the screen less the
   * HUD, never farther than `OPENING_DISTANCE`. Web controller only, as `camera`.
   */
  cameraFit: CameraFitSettings;
  /**
   * The tile faces' antialiasing: on, MSAA (4 samples) where WebGL 2 multisamples on a GPU, SMAA otherwise
   * (`resolveFaceAntialiasing`, `Effects.ts`). `"auto"` (the default) takes the device's (`resolveMultisampling`): on on
   * a coarse pointer or a small screen, off elsewhere. MSAA costs about 3.5 ms of p95 on the Mac profile, which breaks
   * the 12 ms rule at cap 1.5; the phone-like profile stays far under 16.6 ms with it (P4, `docs/client/v2-architecture.md`
   * 5.2). The outlines antialias themselves and are stable without it. Memory (measured, Q3-GPU, 5.2): one target
   * multisamples, a 4-sample RGBA half-float colour buffer (32 B/px), a 4-sample depth buffer (16 B/px) and its resolve
   * (12 B/px: colour 8, depth 4): 61.0 MiB at a 720 x 1480 buffer (360 x 740 at DPR 2), 48.8 MiB more than without.
   */
  multisampling: boolean | "auto";
  /**
   * The samples of MSAA's scene target, 2 or 4 (Q3-GPU). MSAA is taken only where the context multisamples that many.
   * 4, the default: 2 saves 24 B/px (24.4 MiB at 720 x 1480) but shimmers under a zoom as much as no MSAA does.
   */
  msaaSamples: number;
  /**
   * The highest pixel ratio the board is drawn at: the renderer's is `min(devicePixelRatio, maxPixelRatio)`. Under the
   * screen's, the board is drawn at fewer pixels and upscaled, so a 1-device-pixel outline shows wider and soft.
   * `"auto"` (the default) takes the cap measured for the device (`resolveMaxPixelRatio`): 2 on a coarse pointer or a
   * small screen, 1.75 elsewhere (DPR, OUT-LOD, then Q3-GPU, `docs/client/v2-architecture.md` 5.3 and 5.5).
   */
  maxPixelRatio: number | "auto";
  /** The preset the look starts from (`LOOK_PRESETS`): "mockup" (the default), "soft" or "off". */
  lookPreset: LookPreset;
  /** The lighting and post-processing (`look.ts`): the preset's, with any field overridden. */
  look: LookSettings;
  /**
   * The graphics quality (P11a's settings row): which costly effects run (`TIER_EFFECTS`). `"auto"` (the default) takes
   * the device's (`resolveQuality`, `AUTO_QUALITY`): medium on every device, low on a low-power device; high only when
   * chosen (set from the GPU figures, LIGHT-GPU).
   */
  quality: QualityTier | "auto";
  /** The placement visuals (PLATES, `placement.ts`): the flat plates, the tile in hand's tints, the grid. */
  placement: PlacementSettings;
  /**
   * The day and night cycle (DAYNIGHT, `daynight-settings.ts`): off by default; the app's board turns it on from its
   * settings row ("Day/night cycle").
   */
  dayNight: DayNightSettings;
  /** The voxel drop of a placed tile (VOXEL-DROP, `voxel-drop-settings.ts`): used by `GameScene.dropTile` only. */
  voxelDrop: VoxelDropSettings;
  /**
   * The ambient effects (AMBIENT, `ambient-settings.ts`): the one ambient loop every ambient effect moves on.
   * Off by default; the app's board turns them on from its settings row ("Ambient effects").
   */
  ambient: AmbientSettings;
  /**
   * The fog of war (FOG-EVERYWHERE, `fog-of-war-settings.ts`): over the whole scene but the clear cells the board gives
   * (`GameScene.setFogReveal`). Off by default in the renderer; on, the owner's variant (#633): the landscape beyond a soft
   * edge, every corner rounded. The app's board turns it on.
   */
  fog: FogSettings;
  /**
   * The weather (WEATHER-WIRE, `weather-settings.ts`): on by default, it shows only with the ambient effects on and not on the Low
   * tier; its season is the day and night cycle's (the wheel's), summer's day with the cycle off; under reduced motion nothing falls.
   */
  weather: WeatherSettings;
}

/** The camera's zoom limits, as distances from its target in world units (a tile is 3). */
export interface CameraZoomSettings {
  /** Closest: fully zoomed in. */
  minDistance: number;
  /** Farthest: fully zoomed out. */
  maxDistance: number;
  /**
   * The fallback of the owner's guidance (2026-10-14): stop zooming out at `zoomOutCapDistance`, where the outlines are
   * still acceptable, instead of fading them out. Off by default: the fade is enough on the bench board.
   */
  capZoomOut: boolean;
  /** The farthest distance while `capZoomOut` is on. */
  zoomOutCapDistance: number;
}

export interface RendererSettingsInput {
  outlines?: Partial<OutlineSettings>;
  camera?: Partial<CameraZoomSettings>;
  cameraFit?: Partial<CameraFitSettings>;
  multisampling?: boolean | "auto";
  msaaSamples?: number;
  maxPixelRatio?: number | "auto";
  /** A preset: the look starts from it, then `look` overrides its fields. Unset, the base's look. */
  lookPreset?: LookPreset;
  look?: LookSettingsInput;
  quality?: QualityTier | "auto";
  /** The placement visuals: each group's fields over the defaults'. */
  placement?: PlacementSettingsInput;
  /** The day and night cycle: its fields over the defaults'. */
  dayNight?: DayNightInput;
  /** The voxel drop: its fields over the defaults'. */
  voxelDrop?: VoxelDropSettingsInput;
  /** The ambient effects: their fields over the defaults'. */
  ambient?: AmbientSettingsInput;
  /** The fog of war: its fields over the defaults'. */
  fog?: FogSettingsInput;
  /** The weather: its fields over the defaults'. */
  weather?: WeatherSettingsInput;
}

export const DEFAULT_CAMERA_ZOOM_SETTINGS: CameraZoomSettings = {
  // The near plane (5) plus the tallest tile at the play camera's steepest tilt (`CLOSEST_DISTANCE`).
  minDistance: CLOSEST_DISTANCE,
  maxDistance: 300,
  capZoomOut: false,
  // Where a tile is about 96 px wide in a 900 px high window, the bench's (the outlines are fully on there: S, the
  // opening tile size, is about 60 px in a 900 px high window).
  zoomOutCapDistance: 150,
};

export const DEFAULT_RENDERER_SETTINGS: RendererSettings = {
  outlines: DEFAULT_OUTLINE_SETTINGS,
  camera: DEFAULT_CAMERA_ZOOM_SETTINGS,
  cameraFit: DEFAULT_CAMERA_FIT_SETTINGS,
  multisampling: "auto",
  msaaSamples: MSAA_SAMPLES,
  maxPixelRatio: "auto",
  lookPreset: DEFAULT_LOOK_PRESET,
  look: LOOK_PRESETS[DEFAULT_LOOK_PRESET],
  quality: "auto",
  placement: DEFAULT_PLACEMENT_SETTINGS,
  dayNight: DEFAULT_DAYNIGHT_SETTINGS,
  voxelDrop: DEFAULT_VOXEL_DROP_SETTINGS,
  ambient: DEFAULT_AMBIENT_SETTINGS,
  fog: resolveFogSettings({ ...LANDSCAPE_FOG, enabled: false }, DEFAULT_FOG_SETTINGS),
  weather: DEFAULT_WEATHER_SETTINGS,
};

/**
 * The pixel-ratio caps of `"auto"`, set by a rule from measures on an M2 Max (headless Chrome, the 72-tile board):
 * on coarse pointers and small screens, the highest cap whose CPU + GPU p95 stays under 16.6 ms on the phone-like
 * profile (360 x 780 at DPR 3, CPU 4x): 2 (DPR); elsewhere, the highest cap under 12 ms on the Mac profile (1440 x 900
 * at DPR 2) at both views with the outlines on, at every quality tier: 1.75 (Q3-GPU, re-measured with the lighting tiers
 * and one composer target; 1.25 to 2 all pass, 2 in fewer rounds, so 1.75 is the highest cap measured in full).
 */
export const PIXEL_RATIO_CAPS = { coarse: 2, fine: 1.75 } as const;

/**
 * A window or screen whose shorter side is at most this many CSS px is a small screen (a phone, held either way). The
 * window's, not the board's: a short board panel in a large window is not a small screen.
 */
export const SMALL_SCREEN_PX = 600;

/** What `"auto"` reads of the device: a coarse (touch) pointer, and the window's or screen's size in CSS px. */
export interface PixelRatioDevice {
  coarsePointer: boolean;
  width: number;
  height: number;
}

/** A coarse pointer, or a window or screen whose shorter side is at most `SMALL_SCREEN_PX`: a phone or a tablet. */
export function coarseOrSmall(device: PixelRatioDevice): boolean {
  const shorter = Math.min(device.width, device.height);
  return device.coarsePointer || (shorter > 0 && shorter <= SMALL_SCREEN_PX);
}

/** The cap in effect: `maxPixelRatio` itself, or for `"auto"` the device's (`PIXEL_RATIO_CAPS`). */
export function resolveMaxPixelRatio(maxPixelRatio: number | "auto", device: PixelRatioDevice): number {
  if (maxPixelRatio !== "auto") return maxPixelRatio;
  return coarseOrSmall(device) ? PIXEL_RATIO_CAPS.coarse : PIXEL_RATIO_CAPS.fine;
}

/**
 * Whether the faces are antialiased: `multisampling` itself, or for `"auto"` the device's, on a coarse pointer or a
 * small screen (the phone-like profile passes 16.6 ms with MSAA at cap 2), off elsewhere (the Mac profile misses 12 ms).
 */
export function resolveMultisampling(multisampling: boolean | "auto", device: PixelRatioDevice): boolean {
  return multisampling === "auto" ? coarseOrSmall(device) : multisampling;
}

/** `input` over `base`, field by field. */
export function resolveRendererSettings(
  input: RendererSettingsInput = {},
  base: RendererSettings = DEFAULT_RENDERER_SETTINGS,
): RendererSettings {
  const outlines = { ...base.outlines, ...input.outlines };
  // A spread copies `force: undefined` over the default: an unset or unknown value is "auto", not a forced path.
  if (!OUTLINE_FORCES.includes(outlines.force)) outlines.force = "auto";
  const maxPixelRatio = input.maxPixelRatio ?? base.maxPixelRatio;
  const preset = LOOK_PRESET_NAMES.includes(input.lookPreset!) ? input.lookPreset! : null;
  const quality = input.quality === "auto" || QUALITY_TIERS.includes(input.quality!) ? input.quality! : base.quality;
  return {
    outlines,
    camera: { ...base.camera, ...input.camera },
    cameraFit: { ...base.cameraFit, ...input.cameraFit },
    multisampling: MULTISAMPLING_VALUES.includes(input.multisampling!) ? input.multisampling! : base.multisampling,
    msaaSamples: MSAA_SAMPLE_COUNTS.includes(input.msaaSamples!) ? input.msaaSamples! : base.msaaSamples,
    maxPixelRatio: maxPixelRatio === "auto" || maxPixelRatio > 0 ? maxPixelRatio : base.maxPixelRatio,
    lookPreset: preset ?? base.lookPreset,
    look: mergeLookSettings(preset ? LOOK_PRESETS[preset] : base.look, input.look),
    quality,
    placement: resolvePlacementSettings(input.placement, base.placement),
    dayNight: resolveDayNightSettings(input.dayNight, base.dayNight),
    voxelDrop: resolveVoxelDropSettings(input.voxelDrop, base.voxelDrop),
    ambient: resolveAmbientSettings(input.ambient, base.ambient),
    fog: resolveFogSettings(input.fog, base.fog),
    weather: resolveWeatherSettings(input.weather, base.weather),
  };
}

/** The sample counts `msaaSamples` takes: what WebGL 2 multisamples on every GPU that has MSAA. */
export const MSAA_SAMPLE_COUNTS: readonly number[] = [2, 4];

const MULTISAMPLING_VALUES: readonly RendererSettings["multisampling"][] = [true, false, "auto"];

const OUTLINE_FORCES: readonly OutlineSettings["force"][] = ["auto", "on", "off"];

/** The renderer's pixel ratio on a screen of `devicePixelRatio`: the screen's, at most `maxPixelRatio`. */
export function capPixelRatio(devicePixelRatio: number, maxPixelRatio: number): number {
  return Math.min(devicePixelRatio > 0 ? devicePixelRatio : 1, maxPixelRatio);
}

/** The distance limits the camera's controls get: the zoom-out cap applied when it is on. */
export function cameraDistanceLimits(camera: CameraZoomSettings): { min: number; max: number } {
  const max = camera.capZoomOut ? Math.min(camera.maxDistance, camera.zoomOutCapDistance) : camera.maxDistance;
  return { min: camera.minDistance, max: Math.max(max, camera.minDistance) };
}
