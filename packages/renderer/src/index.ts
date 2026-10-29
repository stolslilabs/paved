// Core
export { GameScene } from "./core/GameScene";
export type { GameSceneDependencies, FrameObserver } from "./core/GameScene";
export type { CellCorner, TilePressPhase, TilePressListener } from "./core/interaction";
export { TileRenderer } from "./core/TileRenderer";
export type { LitTile } from "./core/TileRenderer";
export type { ClosedStructure, ClosedStructuresOptions } from "./core/closed-structures";
export {
  DEFAULT_CLOSING_SETTINGS,
  resolveClosingSettings,
  pulseLevel,
  sweepEase,
  sweepAxis,
  shineAllowed,
} from "./core/closing-settings";
export type { ClosingSettings, ClosingSettingsInput, ClosingPulseSettings, ClosingShineSettings } from "./core/closing-settings";
export { FEATURES } from "./core/feature-codes";
export type { FeatureName } from "./core/feature-codes";
export {
  CameraController,
  CLOSEST_DISTANCE,
  OPENING_DISTANCE_FACTOR,
  PLAY_DEFAULT_POLAR_ANGLE,
} from "./core/CameraController";
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
// The camera's opening frame (CAMERA-FIT, #678): its settings here; the fit itself (`core/camera-fit.ts`) is a chunk of its
// own, loaded by the scene.
export { frameFloorFor, frameInsetsFor, FRAME_FLOORS, FRAME_INSETS, FRAME_TABLET_PX, DEFAULT_CAMERA_FIT_SETTINGS } from "./core/camera-fit-settings";
export type { CameraFit, CameraFitInput, CameraFitLimit, CameraFitSettings, CellExtent, FrameFloor, FrameInsets } from "./core/camera-fit-settings";
export const loadCameraFit = (): Promise<typeof import("./core/camera-fit")> => import("./core/camera-fit");
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
  pendingPulseOpacity,
  pendingPulses,
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
// The square grid (SQUARE-GRID): Realms' hex board on square cells, its fog in Paved's colours and its allowed-moves highlight.
export {
  BACKDROP_PATTERNS,
  DEFAULT_SQUARE_GRID_SETTINGS,
  ETERNUM_SCALE,
  HIGHLIGHT_LAYERS,
  HIGHLIGHT_STYLES,
  HIGHLIGHT_Y,
  LAUNCH_GLOW,
  MX_NOISE_GLSL,
  ROLLOUT,
  SQUARE_GRID_GLSL,
  SquareGridRenderer,
  backdropLight,
  backdropShown,
  createHighlightGeometry,
  dimAt,
  dimmedPixel,
  distanceField,
  grayscaleAt,
  gridLineAt,
  gridLineColor,
  gridLineUniforms,
  highlightPulse,
  highlightShown,
  highlightTurns,
  highlightsOf,
  launchGlowAt,
  layerOpacities,
  resolveSquareGridSettings,
  rolloutScale,
  seasonVeil,
  squareEdgeDistance,
  stackedOpacity,
  upwardIrradiance,
} from "./core/square-grid";
export type { BackdropPattern, DistanceField, GhostCell, SurfaceLight, GridCell, GridLineUniforms, HighlightLayer, HighlightStyle, SquareGridSettings, SquareGridSettingsInput } from "./core/square-grid";
// What is drawn untouched by the look's tone map and grade (the square grid's highlight).
export { OverlayPass, createOverlayDepth, overlayDepthTest } from "./core/overlay-pass";
export type { Overlay, OverlayDepth } from "./core/overlay-pass";
// The day and night cycle's settings; the cycle itself (`core/daynight.ts`) is a chunk of its own, loaded by the scene.
export { DAY_PHASES, DAY_PHASE_AT, DEFAULT_DAYNIGHT_SETTINGS, DEFAULT_WINDOW_LIGHT, SEASONS, WINDOW_DETECTIONS, resolveDayNightSettings, resolveWindowLight } from "./core/daynight-settings";
export type { DayNightInput, DayNightSettings, DayPhase, Season, WindowDetection, WindowLightSettings } from "./core/daynight-settings";
// The voxel grid of a tile model, once per model type (VOXELIZER, P-84): the voxel drop and the night windows build on it.
export { PALETTE_SIZE, VoxelCache, cellIndex, paletteU, voxelize } from "./core/voxelizer";
export type { VoxelFailure, VoxelGrid, VoxelSource, VoxelizeOptions } from "./core/voxelizer";
export { DEFAULT_LIGHT_VOLUME, INSIDE_REACH, SPILL_LAYERS, WALL_DIRECTIONS, WindowCache, bakeWindows, buildLightVolume, detectWindows, findOpenings, lightOf, ownerAt, plantEntries, spillOf, windowCells, windowSwitch } from "./core/windows";
export type { BakedWindows, DropReason, Found, LightSpill, LightVolume, LightVolumeOptions, OpeningFilter, OpeningKind, VolumeMethod, Window } from "./core/windows";
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
// The ambient effects (#572): the one loop and the one setting every ambient effect shares. Each effect is a chunk of its own.
export { AMBIENT_FPS, DEFAULT_AMBIENT_SETTINGS, DEFAULT_CLOUD_SHADOWS, ambientAllowed, resolveAmbientSettings } from "./core/ambient-settings";
export type { AmbientSettings, AmbientSettingsInput, CloudShadowSettings } from "./core/ambient-settings";
export { AmbientLoop } from "./core/ambient-loop";
export type { AmbientEffect, AmbientPause } from "./core/ambient-loop";
// The birds (BIRDS, #574), stories only: the board does not call them yet. Their settings are small and eager; the effect is a chunk
// of its own, loaded by `loadBirds` (nothing in the app's board calls it, so the app's build has no such chunk).
export { DEFAULT_BIRD_SETTINGS, MAX_BIRDS, resolveBirdSettings } from "./core/bird-settings";
export type { BirdSettings, BirdSettingsInput } from "./core/bird-settings";
export type { BirdSource, BirdState, Birds } from "./core/birds";
export const loadBirds = (): Promise<typeof import("./core/birds")> => import("./core/birds");
// The chimneys (CHIMNEY-SMOKE-1 and -2, #770). The detection reads a model's voxel grid (smoking chimneys, with white smoke voxels,
// and bare ones): a chunk of its own, loaded by `loadChimneys` (the stories) or by the smoke's chunk, never re-exported here, so the
// board's eager chunk shares no group with it (it imports the classifier's palettes and the windows). The smoke's settings are
// small and eager (`RendererSettings.smoke`); the smoke is a chunk of its own, loaded by `GameScene` when a scene turns it on (the
// app's boards), or by `loadChimneySmoke` for a story.
export const loadChimneys = (): Promise<typeof import("./core/chimneys")> => import("./core/chimneys");
export type { CellBox, Chimney, ChimneyKind, ChimneyOptions, ChimneyOverride, ChimneyReject, FoundChimneys, HighPointReject, PlumeReject, RejectedCandidate } from "./core/chimneys";
export {
  DEFAULT_SMOKE_SETTINGS,
  MAX_SMOKE_CHIMNEYS,
  MAX_SMOKE_PUFFS,
  NO_SMOKE_VARIATION,
  SMOKE_LOOKS,
  SMOKE_VARIATION,
  plumeOf,
  plumeSeed,
  puffsPerChimney,
  resolveSmokeSettings,
  smokeLookOf,
  smokeMode,
} from "./core/chimney-smoke-settings";
export type { Plume, SmokeLook, SmokeLookInput, SmokeLookName, SmokeMode, SmokeSeason, SmokeSettings, SmokeSettingsInput, SmokeVariation } from "./core/chimney-smoke-settings";
export type { ChimneySmoke, SmokeFree, SmokeSource, SmokeStats } from "./core/chimney-smoke";
export const loadChimneySmoke = (): Promise<typeof import("./core/chimney-smoke")> => import("./core/chimney-smoke");
// The weather (WEATHER-STUDY, #607 PR 2; WEATHER-WIRE, #658): every board's scene shows it (`RendererSettings.weather`,
// `GameScene.getWeather`). Its settings are small and eager; the effect is a chunk of its own, which `GameScene` loads the first time
// it shows. The snow on the tops is a term of the tile shader (`TileRenderer.snowUniforms`), off until the weather sets it.
export {
  DEFAULT_WEATHER_SETTINGS,
  PARTICLE_FALL,
  PARTICLE_LAYERS,
  PARTICLE_MAX,
  PARTICLE_SIZE,
  SPLASH_MAX,
  resolveWeatherSettings,
  weatherCloudFactor,
  weatherMode,
} from "./core/weather-settings";
export type {
  AutumnSettings,
  GradeSettings,
  ParticleLayer,
  ParticleSettings,
  SpringSettings,
  SummerSettings,
  WeatherMode,
  WeatherSettings,
  WeatherSettingsInput,
  WinterSettings,
} from "./core/weather-settings";
export type { Weather, WeatherStats } from "./core/weather";
// The fog of war (FOG-STUDY, #633; FOG-EVERYWHERE, #648): every board's scene shows it with `RendererSettings.fog` on and a reveal
// (`GameScene.setFogReveal`). Its reveal logic and settings are small and eager; the fog is a chunk of its own, which `GameScene`
// loads the first time it shows (the stories load it with `loadFogOfWar`).
export {
  DEFAULT_FOG_SETTINGS,
  FIELD_REACH,
  FIELD_TEXELS,
  FOG_NEIGHBOURS,
  RevealTransition,
  boardReveal,
  buildRevealField,
  cellKey,
  fieldDistance,
  LANDSCAPE_FOG,
  MAX_CORNER_RADIUS,
  fogMode,
  freeSlots,
  liftedCells,
  resolveFogSettings,
} from "./core/fog-of-war-settings";
export type { FogCell, FogMode, FogSettings, FogSettingsInput, LandscapeSettings, RevealField, RevealedCell } from "./core/fog-of-war-settings";
export type { FogOfWar, FogStats } from "./core/fog-of-war";
export const loadFogOfWar = (): Promise<typeof import("./core/fog-of-war")> => import("./core/fog-of-war");
export { dropDuration, planDrop } from "./core/voxel-drop-schedule";
export type { DropSchedule, ScheduleGrid } from "./core/voxel-drop-schedule";
export type { DropInfo, DropResult, DropSkip } from "./core/tile-drops";
// The avatar (AVATAR-LOOK, #626 PR 1), stories only for now: its format and parts are small and eager; its rendering (the head
// in three.js, the cached stills of the menus, the creator's live preview) is a chunk of its own, loaded by `loadAvatarRender`.
export {
  AVATAR_FORMAT_VERSION,
  AVATAR_PARTS,
  AVATAR_PART_BITS,
  AVATAR_PART_KEYS,
  AVATAR_USED_BITS,
  AVATAR_VALUE_BITS,
  DEFAULT_AVATAR,
  avatarKey,
  decodeAvatar,
  encodeAvatar,
  randomAvatar,
  seededRandom,
  variantCount,
} from "./core/avatar/avatar-format";
export type { Avatar, AvatarPart } from "./core/avatar/avatar-format";
export type { AvatarObject, AvatarPreview, AvatarPreviewOptions, AvatarStillOptions, AvatarStillStats, AvatarStills, AvatarStyle } from "./core/avatar/avatar-render";
export const loadAvatarRender = (): Promise<typeof import("./core/avatar/avatar-render")> => import("./core/avatar/avatar-render");
// The first-person walk (V4-WALK-1, #876): its settings and inputs are small and eager (a host binds its keys and sticks with
// them); the walk itself (its ground, the walker, the camera's descent) is a chunk of its own, which `GameScene.startWalk` loads on
// the first walk.
export {
  DEFAULT_WALK_SETTINGS,
  WALK_KEYS,
  clampVector,
  isWalkKey,
  moveOfKeys,
  nearPlaneReach,
  resolveWalkSettings,
  stickLookRate,
} from "./core/walk-settings";
export type { WalkControl, WalkPhase, WalkSettings, WalkSettingsInput, WalkState, WalkVector } from "./core/walk-settings";
