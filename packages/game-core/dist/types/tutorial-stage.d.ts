type Tile2DCoordinates = {
    x: number;
    y: number;
};
type MarkedTileTextPosition = {
    x: number;
    y: number;
};
type PresetTransaction = {
    orientation?: number;
    role?: number;
    spot?: number;
    tile_id: number;
    x: number;
    y: number;
};
export declare class TutorialStage {
    markedTile: Tile2DCoordinates;
    presetTransaction: PresetTransaction;
    interactionText: Map<string, string>;
    textboxText: string;
    initialOrientation?: number;
    markedTileTextPosition: MarkedTileTextPosition;
    constructor(markedTile: Tile2DCoordinates, presetTransaction: PresetTransaction, interactionText: Map<string, string>, textboxText: string, initialOrientation?: number, markedTileTextPosition?: MarkedTileTextPosition);
    compareTransaction(transaction: Partial<PresetTransaction>): boolean;
}
export declare const TUTORIAL_STAGES: TutorialStage[];
export {};
//# sourceMappingURL=tutorial-stage.d.ts.map