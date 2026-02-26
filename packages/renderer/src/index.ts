// Core
export { GameScene } from "./core/GameScene";
export type { GameSceneDependencies } from "./core/GameScene";
export { TileRenderer } from "./core/TileRenderer";
export { CharRenderer } from "./core/CharRenderer";
export { CameraController } from "./core/CameraController";
export type { CameraConfig } from "./core/CameraController";
export { NativeCameraController } from "./core/NativeCameraController";
export { NativeInputMapper } from "./core/native-input-mapper";
export { NativeSurfaceAdapter } from "./core/NativeSurfaceAdapter";
export type { NativeSurfaceHost } from "./core/NativeSurfaceAdapter";
export { AssetLoader } from "./core/AssetLoader";
export { Effects } from "./core/Effects";
export type { EffectsConfig } from "./core/Effects";
export { BoxRainScene } from "./core/BoxRainScene";
export { WebSurfaceAdapter, createWebSurfaceAdapter } from "./core/WebSurfaceAdapter";

// Types
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
  CharacterRenderData,
  HoverState,
} from "./core/types";
