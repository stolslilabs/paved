// Core
export { GameScene } from "./core/GameScene";
export type { GameSceneDependencies, FrameObserver } from "./core/GameScene";
export { TileRenderer } from "./core/TileRenderer";
export { CameraController } from "./core/CameraController";
export type { CameraConfig } from "./core/CameraController";
export { NativeCameraController } from "./core/NativeCameraController";
export { NativeInputMapper } from "./core/native-input-mapper";
export { NativeSurfaceAdapter } from "./core/NativeSurfaceAdapter";
export type { NativeSurfaceHost } from "./core/NativeSurfaceAdapter";
export { AssetLoader } from "./core/AssetLoader";
export { Effects } from "./core/Effects";
export type { EffectsConfig, EffectsPassName } from "./core/Effects";
export {
  LOOK_PRESETS,
  LOOK_PRESET_NAMES,
  DEFAULT_LOOK_PRESET,
  QUALITY_TIERS,
  TIER_EFFECTS,
  AUTO_QUALITY,
  TONE_MAPPING_MODES,
  mergeLookSettings,
  resolveLookSettings,
  resolveLook,
  resolveQuality,
} from "./core/look";
export type { LookSettings, LookSettingsInput, LookPreset, QualityTier, TierEffects, ToneMappingMode, LightSettings } from "./core/look";
export {
  DEFAULT_OUTLINE_SETTINGS,
  OUTLINE_DEPTH_BIAS,
  MIN_OUTLINE_OPACITY,
  TILE_VOXELS,
  VOXEL_SIZE,
  outlineStroke,
  openingTilePixels,
  detectSoftwareWebGL,
  isSoftwareRenderer,
  outlinesAllowed,
  DEFAULT_OPENING_TILE_PX,
  tilePixels,
  distanceForTilePixels,
} from "./core/outlines";
export type { OutlineSettings, OutlineStroke, WebGLDetection } from "./core/outlines";
export {
  DEFAULT_RENDERER_SETTINGS,
  DEFAULT_CAMERA_ZOOM_SETTINGS,
  resolveRendererSettings,
  cameraDistanceLimits,
  capPixelRatio,
  resolveMaxPixelRatio,
  PIXEL_RATIO_CAPS,
  SMALL_SCREEN_PX,
} from "./core/settings";
export type { RendererSettings, RendererSettingsInput, CameraZoomSettings, PixelRatioDevice } from "./core/settings";
export { BoxRainScene } from "./core/BoxRainScene";
export { WebSurfaceAdapter, createWebSurfaceAdapter } from "./core/WebSurfaceAdapter";

// Types
export { TILE_SIZE } from "./core/types";
export type {
  CameraMode,
  RenderProfile,
  BoardBounds,
  RendererConfig,
  EffectsCapabilities,
  RenderSurfaceAdapter,
  SurfaceInputEvent,
  SurfaceInputEventType,
  SurfaceSize,
  TileRenderData,
  HoverState,
} from "./core/types";
