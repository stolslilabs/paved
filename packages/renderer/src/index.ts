// Core
export { GameScene } from "./core/GameScene";
export type { GameSceneDependencies, FrameObserver } from "./core/GameScene";
export { TileRenderer } from "./core/TileRenderer";
export type { LitTile } from "./core/TileRenderer";
export { FEATURES } from "./core/feature-codes";
export type { FeatureName } from "./core/feature-codes";
export { CameraController, OPENING_DISTANCE_FACTOR } from "./core/CameraController";
export type { CameraConfig } from "./core/CameraController";
export { NativeCameraController } from "./core/NativeCameraController";
export { NativeInputMapper } from "./core/native-input-mapper";
export { NativeSurfaceAdapter } from "./core/NativeSurfaceAdapter";
export type { NativeSurfaceHost } from "./core/NativeSurfaceAdapter";
export { AssetLoader, modelPath, provideManifest, skinModelPath } from "./core/AssetLoader";
export type { AssetManifest } from "./core/AssetLoader";
export { NO_SKINS, skinsOf, skinRef, variantHash, variantIndex } from "./core/skins";
export type { TileSkins, SkinRef } from "./core/skins";
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
  OUTLINE_CLOSEST_FACTOR,
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
export {
  DEFAULT_PLACEMENT_SETTINGS,
  GRID_RINGS,
  PLATE_GAP_VOXELS,
  PlacementRenderer,
  colorProgress,
  confirmProgress,
  createPlateGeometry,
  gridFade,
  gridLineCoverage,
  gridLineOpacityAt,
  gridRingOpacity,
  placementFade,
  tintEaseMs,
  tintForKind,
  tintKindOf,
  plateShapeOf,
  plateStateOf,
  prefersReducedMotion,
  resolvePlacementSettings,
  ringField,
} from "./core/placement";
export type { PlacementSettings, PlacementSettingsInput, GhostTint, PlacementSlot, PlateShape, PlateState, RingField, TintKind } from "./core/placement";
// The day and night cycle's settings; the cycle itself (`core/daynight.ts`) is a chunk of its own, loaded by the scene.
export { DAY_PHASES, DAY_PHASE_AT, DEFAULT_DAYNIGHT_SETTINGS, NIGHT_LIGHT_SOURCES, SEASONS, resolveDayNightSettings } from "./core/daynight-settings";
export type { DayNightSettings, DayPhase, NightLightSource, Season } from "./core/daynight-settings";
// The voxel grid of a tile model, once per model type (VOXELIZER, P-84): the voxel drop and the night windows build on it.
export { PALETTE_SIZE, VoxelCache, cellIndex, paletteU, voxelize } from "./core/voxelizer";
export type { VoxelFailure, VoxelGrid, VoxelSource, VoxelizeOptions } from "./core/voxelizer";
export { DEFAULT_LIGHT_VOLUME, WALL_DIRECTIONS, WindowCache, bakeWindows, buildLightVolume, detectWindows, findOpenings, lightOf, ownerAt, windowCells } from "./core/windows";
export type { BakedWindows, LightVolume, LightVolumeOptions, OpeningKind, VolumeMethod, Window } from "./core/windows";
export { PALETTE_CLASSES, labelTileColumns } from "./core/features";
export { paletteOfModel, planKeyOfModel, planLayout } from "./core/feature-layout";
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

// The voxel drop of a placed tile (VOXEL-DROP, #512): its settings and schedule are eager and small; the mesh is a chunk of its own,
// loaded on the first `GameScene.dropTile`.
export { DEFAULT_VOXEL_DROP_SETTINGS, DROP_EASES, DROP_LANDINGS, resolveVoxelDropSettings } from "./core/voxel-drop-settings";
export type { DropEase, DropLanding, VoxelDropSettings, VoxelDropSettingsInput } from "./core/voxel-drop-settings";
export { dropDuration, planDrop } from "./core/voxel-drop-schedule";
export type { DropSchedule, ScheduleGrid } from "./core/voxel-drop-schedule";
export type { DropInfo, DropResult, DropSkip } from "./core/tile-drops";
