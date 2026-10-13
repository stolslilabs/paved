import { create } from "zustand";

interface GameState {
  gameId: number | null;
  orientation: number;
  x: number;
  y: number;
  selectedTile: { col: number; row: number } | null;
  hoveredTile: { col: number; row: number } | null;
  activeEntity: string | null;
  valid: boolean;
  strategyMode: boolean;
  setGameId: (gameId: number | null) => void;
  setOrientation: (orientation: number) => void;
  setX: (x: number) => void;
  setY: (y: number) => void;
  setSelectedTile: (tile: { col: number; row: number } | null) => void;
  setHoveredTile: (tile: { col: number; row: number } | null) => void;
  setActiveEntity: (entity: string | null) => void;
  setValid: (valid: boolean) => void;
  setStrategyMode: (strategyMode: boolean) => void;
  resetOrientation: () => void;
  resetAll: () => void;
}

const DEFAULTS = {
  gameId: null as number | null,
  orientation: 1,
  x: 0,
  y: 0,
  selectedTile: null as { col: number; row: number } | null,
  hoveredTile: null as { col: number; row: number } | null,
  activeEntity: null as string | null,
  valid: false,
  strategyMode: false,
};

export const useGameStore = create<GameState>((set) => ({
  ...DEFAULTS,
  setGameId: (gameId) => set({ gameId }),
  setOrientation: (orientation) => {
    // Keep in range 1-4, wrapping
    const wrapped = ((orientation - 1) % 4 + 4) % 4 + 1;
    set({ orientation: wrapped });
  },
  setX: (x) => set({ x }),
  setY: (y) => set({ y }),
  setSelectedTile: (selectedTile) => set({ selectedTile }),
  setHoveredTile: (hoveredTile) => set({ hoveredTile }),
  setActiveEntity: (activeEntity) => set({ activeEntity }),
  setValid: (valid) => set({ valid }),
  setStrategyMode: (strategyMode) => set({ strategyMode }),
  resetOrientation: () => set({ orientation: 1 }),
  resetAll: () => set({ ...DEFAULTS }),
}));
