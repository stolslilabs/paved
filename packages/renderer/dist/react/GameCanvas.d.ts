import { GameScene } from "../core/GameScene";
import type { TileRenderData, CharacterRenderData, HoverState } from "../core/types";
export interface GameCanvasProps {
    tiles?: TileRenderData[];
    characters?: CharacterRenderData[];
    hover?: HoverState | null;
    strategyMode?: boolean;
    compassRotation?: number;
    basePath?: string;
    style?: React.CSSProperties;
    className?: string;
    onReady?: (scene: GameScene) => void;
}
export declare function GameCanvas({ tiles, characters, hover, strategyMode, compassRotation, basePath, style, className, onReady, }: GameCanvasProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GameCanvas.d.ts.map