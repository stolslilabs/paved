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
   * Multisampled anti-aliasing of the scene (4 samples). Off by default: the outlines are stable without it (their
   * depth bias is what fixed the flicker), and it costs about 3 to 4 ms of GPU a frame at 1440x900 on an M2 Max.
   */
  multisampling: boolean;
  /**
   * The highest pixel ratio the board is drawn at: the renderer's is `min(devicePixelRatio, maxPixelRatio)`. Under the
   * screen's, the board is drawn at fewer pixels and upscaled, so a 1-device-pixel outline shows wider and soft.
   */
  maxPixelRatio: number;
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
  multisampling?: boolean;
  maxPixelRatio?: number;
}

export const DEFAULT_CAMERA_ZOOM_SETTINGS: CameraZoomSettings = {
  minDistance: 5,
  maxDistance: 300,
  capZoomOut: false,
  // Where a tile is about 96 px wide in a 900 px high window, the bench's (the outlines are fully on there: S, the
  // opening tile size, is about 60 px in a 900 px high window).
  zoomOutCapDistance: 150,
};

export const DEFAULT_RENDERER_SETTINGS: RendererSettings = {
  outlines: DEFAULT_OUTLINE_SETTINGS,
  camera: DEFAULT_CAMERA_ZOOM_SETTINGS,
  multisampling: false,
  maxPixelRatio: 1,
};

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
    multisampling: input.multisampling ?? base.multisampling,
    maxPixelRatio: maxPixelRatio > 0 ? maxPixelRatio : base.maxPixelRatio,
  };
}

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
