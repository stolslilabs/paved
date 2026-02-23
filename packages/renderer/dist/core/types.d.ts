import type { TileData } from "@paved/game-core";
export interface RendererConfig {
    canvas: HTMLCanvasElement;
    basePath?: string;
    pixelRatio?: [number, number];
    shadows?: boolean;
}
export interface TileRenderData extends TileData {
    worldX: number;
    worldZ: number;
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
//# sourceMappingURL=types.d.ts.map