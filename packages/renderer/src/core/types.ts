import type { TileData } from "@paved/game-core";
import type { RendererSettingsInput } from "./settings";
import type { AssetManifest } from "./AssetLoader";

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
  /**
   * The asset manifest, for a host that serves none at `<basePath>/manifest.json` but knows its files (a story that draws
   * skins): read instead of fetching it. Unset: the loader reads `<basePath>/manifest.json`.
   */
  manifest?: AssetManifest;
}

export interface SurfaceSize {
  width: number;
  height: number;
}

export type SurfaceInputEventType =
  | "pointerdown"
  | "pointerup"
  | "pointermove"
  | "pointerleave"
  | "pointercancel";

export interface SurfaceInputEvent {
  type: SurfaceInputEventType;
  x: number;
  y: number;
  button?: number;
  /** The buttons held (`PointerEvent.buttons`, 1 the left): a move with another one held is a chord (#630). Unset: unknown. */
  buttons?: number;
  /** The pointer's id (`PointerEvent.pointerId`): it tells a second finger from the first. Unset: one pointer. */
  pointerId?: number;
}

export interface RenderSurfaceAdapter {
  getSize(): SurfaceSize;
  getDevicePixelRatio(): number;
  /** Whether the main pointer is coarse (touch). Unset: not coarse. `maxPixelRatio: "auto"` reads it. */
  hasCoarsePointer?(): boolean;
  /**
   * The size, in CSS px, of the window or screen the surface is shown in (not the surface's own: a board panel can be
   * much smaller than its window). `maxPixelRatio: "auto"` reads it for the small-screen test; unset, `getSize()`.
   */
  getViewportSize?(): SurfaceSize;
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
  /** The tile's rotation fits the cell. Not drawn: the board offers only rotations that fit (#544). */
  valid: boolean;
  idle: boolean;
  /**
   * Placed on the cell, not yet confirmed (SLOTS): its tint turns yellow (pending). Unset: a hover preview, blue.
   */
  placed?: boolean;
  planIndex: number;
  orientation: number;
  /**
   * The hovered cell as a tile there would be (the contracts' x and y, the game's id): the ghost draws the skin variant
   * that cell's tile would (`setSkins`). Unset: the variant at the board's centre of game 0, as the hand's tile.
   */
  cell?: { x: number; y: number; gameId: number };
}
