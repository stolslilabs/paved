interface GameState {
    gameId: number | null;
    builderId: string | null;
    orientation: number;
    character: number;
    spot: number;
    x: number;
    y: number;
    selectedTile: {
        col: number;
        row: number;
    } | null;
    hoveredTile: {
        col: number;
        row: number;
    } | null;
    activeEntity: string | null;
    valid: boolean;
    strategyMode: boolean;
    setGameId: (gameId: number | null) => void;
    setBuilderId: (builderId: string | null) => void;
    setOrientation: (orientation: number) => void;
    setCharacter: (character: number) => void;
    setSpot: (spot: number) => void;
    setX: (x: number) => void;
    setY: (y: number) => void;
    setSelectedTile: (tile: {
        col: number;
        row: number;
    } | null) => void;
    setHoveredTile: (tile: {
        col: number;
        row: number;
    } | null) => void;
    setActiveEntity: (entity: string | null) => void;
    setValid: (valid: boolean) => void;
    setStrategyMode: (strategyMode: boolean) => void;
    resetOrientation: () => void;
    resetCharacter: () => void;
    resetSpot: () => void;
    resetAll: () => void;
}
export declare const useGameStore: import("zustand").UseBoundStore<import("zustand").StoreApi<GameState>>;
export {};
//# sourceMappingURL=game.d.ts.map