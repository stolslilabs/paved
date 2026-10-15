import type { TileData } from "@paved/game-core";
import type { RendererSettingsInput } from "./settings";

/** World units per grid cell — single source of truth */
export const TILE_SIZE = 3;

export type CameraMode = "play" | "showcase";
export type RenderProfile = "play" | "showcase" | "showcaseCinematic";

export interface BoardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RendererConfig {
  surface: RenderSurfaceAdapter;
  basePath?: string;
  shadows?: boolean;
  effectsCapabilities?: EffectsCapabilities;
  /** Outlines, camera zoom limits and the pixel-ratio cap (`settings.ts`); unnamed fields take the defaults. */
  settings?: RendererSettingsInput;
}

export interface SurfaceSize {
  width: number;
  height: number;
}

export type SurfaceInputEventType =
  | "pointerdown"
  | "pointerup"
  | "pointermove"
  | "pointerleave";

export interface SurfaceInputEvent {
  type: SurfaceInputEventType;
  x: number;
  y: number;
  button?: number;
}

export interface RenderSurfaceAdapter {
  getSize(): SurfaceSize;
  getDevicePixelRatio(): number;
  /** Whether the main pointer is coarse (touch). Unset: not coarse. `maxPixelRatio: "auto"` reads it. */
  hasCoarsePointer?(): boolean;
  onResize(cb: () => void): () => void;
  bindInput(handler: (event: SurfaceInputEvent) => void): void;
  unbindInput(): void;
  getRenderTarget?(): unknown;
}

export interface EffectsCapabilities {
  supportsBloom?: boolean;
  supportsVignette?: boolean;
  supportsSSAO?: boolean;
  lowPowerDevice?: boolean;
  /** Whether the device can multisample a render target (WebGL2); false keeps `multisampling` off. Default true. */
  supportsMultisampling?: boolean;
}

export interface TileRenderData extends TileData {
  // Position in world space (converted from grid)
  worldX: number;
  worldZ: number;
  // True for optimistic tiles awaiting tx confirmation
  pending?: boolean;
}

export interface HoverState {
  x: number;
  y: number;
  valid: boolean;
  idle: boolean;
  planIndex: number;
  orientation: number;
}
