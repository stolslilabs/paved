import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer } from "./TileRenderer";
import { CharRenderer } from "./CharRenderer";
import { CameraController } from "./CameraController";
import { Effects } from "./Effects";
import type { RendererConfig, TileRenderData, CharacterRenderData, HoverState } from "./types";
export declare class GameScene {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    tiles: TileRenderer;
    characters: CharRenderer;
    controls: CameraController;
    assets: AssetLoader;
    effects: Effects;
    private sceneGroup;
    private animationId;
    private needsRender;
    private isWebGPU;
    constructor();
    init(config: RendererConfig): Promise<void>;
    private setupLighting;
    /** Update placed tiles */
    updateTiles(tiles: TileRenderData[]): void;
    /** Update character meshes */
    updateCharacters(chars: CharacterRenderData[]): void;
    /** Set hover preview at grid position */
    setHoveredTile(state: HoverState | null): void;
    /** Switch between 3D voxel and 2D strategy rendering */
    setStrategyMode(on: boolean): void;
    /** Set compass rotation for scene group */
    setCompassRotation(angle: number): void;
    /** Request a re-render (demand mode — only renders when state changes) */
    requestRender(): void;
    /** Start the render loop */
    start(): void;
    /** Stop the render loop */
    stop(): void;
    /** Render a single frame */
    render(): void;
    /** Take a screenshot */
    screenshot(): string;
    /** Cleanup all resources */
    dispose(): void;
}
//# sourceMappingURL=GameScene.d.ts.map