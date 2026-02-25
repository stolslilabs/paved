import type { TileData, CharacterData } from "@paved/game-core";

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
  canvas: HTMLCanvasElement;
  basePath?: string;
  pixelRatio?: [number, number];
  shadows?: boolean;
}

export interface TileRenderData extends TileData {
  // Position in world space (converted from grid)
  worldX: number;
  worldZ: number;
  // True for optimistic tiles awaiting tx confirmation
  pending?: boolean;
}

export interface CharacterRenderData {
  gameId: number;
  playerId: string;
  index: number;
  tileId: number;
  spot: number;
  weight: number;
  power: number;
  color: string;
  name?: string;
  worldX: number;
  worldZ: number;
}

export interface HoverState {
  x: number;
  y: number;
  valid: boolean;
  idle: boolean;
  planIndex: number;
  orientation: number;
}
