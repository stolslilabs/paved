import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tile {
  col: number;
  row: number;
}

interface GameState {
  gameId: number;
  setGameId: (gameId: number) => void;
  builderId: number;
  setBuilderId: (builderId: number) => void;
  orientation: number;
  setOrientation: (orientation: number) => void;
  order: number;
  setOrder: (order: number) => void;
  character: number;
  setCharacter: (character: number) => void;
  spot: number;
  setSpot: (spot: number) => void;
  x: number;
  setX: (x: number) => void;
  y: number;
  setY: (y: number) => void;
  selectedTile: Tile;
  setSelectedTile: (tile: Tile) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      gameId: 0,
      setGameId: (gameId) => set({ gameId }),
      builderId: 0,
      setBuilderId: (builderId) => set({ builderId }),
      orientation: 1,
      setOrientation: (orientation) => {
        orientation = ((orientation - 1) % 4) + 1;
        set({ orientation });
      },
      order: 1,
      setOrder: (order) => set({ order }),
      character: 0,
      setCharacter: (character) => set({ character }),
      spot: 0,
      setSpot: (spot) => set({ spot }),
      x: 0,
      setX: (x) => {
        x = x + 0x7fffffff;
        set({ x });
      },
      y: 0,
      setY: (y) => {
        y = y + 0x7fffffff;
        set({ y });
      },
      selectedTile: { col: 0, row: 0 },
      setSelectedTile: (tile) => set({ selectedTile: tile }),
    }),
    {
      name: "game-storage", // name of the item in the storage (must be unique)
    }
  )
);
