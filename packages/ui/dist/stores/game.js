import { create } from "zustand";
const DEFAULTS = {
    gameId: null,
    builderId: null,
    orientation: 1,
    character: 0,
    spot: 0,
    x: 0,
    y: 0,
    selectedTile: null,
    hoveredTile: null,
    activeEntity: null,
    valid: false,
    strategyMode: false,
};
export const useGameStore = create((set) => ({
    ...DEFAULTS,
    setGameId: (gameId) => set({ gameId }),
    setBuilderId: (builderId) => set({ builderId }),
    setOrientation: (orientation) => {
        // Keep in range 1-4, wrapping
        const wrapped = ((orientation - 1) % 4 + 4) % 4 + 1;
        set({ orientation: wrapped });
    },
    setCharacter: (character) => set({ character }),
    setSpot: (spot) => set({ spot }),
    setX: (x) => set({ x }),
    setY: (y) => set({ y }),
    setSelectedTile: (selectedTile) => set({ selectedTile }),
    setHoveredTile: (hoveredTile) => set({ hoveredTile }),
    setActiveEntity: (activeEntity) => set({ activeEntity }),
    setValid: (valid) => set({ valid }),
    setStrategyMode: (strategyMode) => set({ strategyMode }),
    resetOrientation: () => set({ orientation: 1 }),
    resetCharacter: () => set({ character: 0 }),
    resetSpot: () => set({ spot: 0 }),
    resetAll: () => set({ ...DEFAULTS }),
}));
//# sourceMappingURL=game.js.map