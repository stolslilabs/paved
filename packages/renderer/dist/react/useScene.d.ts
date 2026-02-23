import { GameScene } from "../core/GameScene";
import type { RendererConfig } from "../core/types";
export declare function useScene(config?: Partial<RendererConfig>): {
    canvasRef: import("react").RefObject<HTMLCanvasElement | null>;
    scene: GameScene | null;
    ready: boolean;
};
//# sourceMappingURL=useScene.d.ts.map