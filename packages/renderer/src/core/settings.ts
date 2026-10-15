import { CLOSEST_DISTANCE } from "./CameraController";
import { DEFAULT_OUTLINE_SETTINGS, type OutlineSettings } from "./outlines";

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
   * The tile faces' antialiasing: on, MSAA (4 samples) where WebGL 2 multisamples on a GPU, SMAA otherwise
   * (`resolveFaceAntialiasing`, `Effects.ts`). `"auto"` (the default) takes the device's (`resolveMultisampling`): on on
   * a coarse pointer or a small screen, off elsewhere. MSAA costs about 3.5 ms of p95 on the Mac profile, which breaks
   * the 12 ms rule at cap 1.5; the phone-like profile stays far under 16.6 ms with it (P4, `docs/client/v2-architecture.md`
   * 5.2). The outlines antialias themselves and are stable without it.
   */
  multisampling: boolean | "auto";
  /**
   * The highest pixel ratio the board is drawn at: the renderer's is `min(devicePixelRatio, maxPixelRatio)`. Under the
   * screen's, the board is drawn at fewer pixels and upscaled, so a 1-device-pixel outline shows wider and soft.
   * `"auto"` (the default) takes the cap measured for the device (`resolveMaxPixelRatio`): 2 on a coarse pointer or a
   * small screen, 1.5 elsewhere (DPR, then OUT-LOD, `docs/client/v2-architecture.md` 5.3).
   */
  maxPixelRatio: number | "auto";
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
  multisampling?: boolean | "auto";
  maxPixelRatio?: number | "auto";
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
  multisampling: "auto",
  maxPixelRatio: "auto",
};

/**
 * The pixel-ratio caps of `"auto"`, set by a rule from measures on an M2 Max (headless Chrome, the 72-tile board):
 * on coarse pointers and small screens, the highest cap whose CPU + GPU p95 stays under 16.6 ms on the phone-like
 * profile (360 x 780 at DPR 3, CPU 4x): 2 (DPR); elsewhere, the highest cap under 12 ms on the Mac profile (1440 x 900
 * at DPR 2) at both views with the outlines on: 1.5 once the outline segments are cut by screen size (OUT-LOD; 2 misses).
 */
export const PIXEL_RATIO_CAPS = { coarse: 2, fine: 1.5 } as const;

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
function coarseOrSmall(device: PixelRatioDevice): boolean {
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
  return {
    outlines,
    camera: { ...base.camera, ...input.camera },
    multisampling: MULTISAMPLING_VALUES.includes(input.multisampling!) ? input.multisampling! : base.multisampling,
    maxPixelRatio: maxPixelRatio === "auto" || maxPixelRatio > 0 ? maxPixelRatio : base.maxPixelRatio,
  };
}

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
