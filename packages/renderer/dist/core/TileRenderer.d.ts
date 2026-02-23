import * as THREE from "three";
import type { AssetLoader } from "./AssetLoader";
import type { TileRenderData, HoverState } from "./types";
export declare class TileRenderer {
    private group;
    private tileGroup;
    private emptyGroup;
    private previewGroup;
    private tileMeshes;
    private assets;
    private strategyMode;
    private squareSize;
    constructor(assets: AssetLoader);
    getGroup(): THREE.Group;
    updateTiles(tiles: TileRenderData[]): void;
    private createVoxelTile;
    private createStrategyTile;
    setHover(state: HoverState | null): void;
    setStrategyMode(on: boolean): void;
    private disposeMesh;
    dispose(): void;
}
//# sourceMappingURL=TileRenderer.d.ts.map