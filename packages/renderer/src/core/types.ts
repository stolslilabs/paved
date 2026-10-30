import type { TileData } from "@paved/game-core";
import type { RendererSettingsInput } from "./settings";
import type { AssetManifest } from "./AssetLoader";

/** World units per grid cell — single source of truth */
export const TILE_SIZE = 3;

/**
 * The camera's modes: `play` (the boards' and the home's: the tilt and the turn locked, #719), `free` (the home's Camera mode,
 * #875: the tilt between 15 and 85 degrees, the turn free) and `showcase` (the stack view's).
 */
export type CameraMode = "play" | "free" | "showcase";
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
  /** How high the tile hovers above its cell, in world units (a tile is `TILE_SIZE`): the app's tile stack lifts its tiles. Unset: 0. */
  lift?: number;
  /** The tile's size, 1 its cell's (the tile stack draws the tile in hand larger). Unset: 1. */
  scale?: number;
  /** See-through, untinted (`FADED_OPACITY`): the tile stack's tile in hand while the board draws it on a cell. */
  faded?: boolean;
  /** A turn around its vertical on top of its orientation, radians (the tile stack's pile, a little askew). Unset: 0. */
  yaw?: number;
  /**
   * After its `yaw`, the tile leans `angle` radians toward the azimuth `toward` (radians around the vertical, 0 south, as
   * the camera's): the tile stack turns its tile in hand to face its view. Unset: flat.
   */
  lean?: { angle: number; toward: number };
  /** Drawn this thick, its model squashed to it, world units (the tile stack's pile, a slab per tile). Unset: its own height. */
  thickness?: number;
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
