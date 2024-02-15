import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Entity } from "@dojoengine/recs";

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
  resetOrientation: () => void;
  order: number;
  setOrder: (order: number) => void;
  character: number;
  setCharacter: (character: number) => void;
  resetCharacter: () => void;
  spot: number;
  setSpot: (spot: number) => void;
  resetSpot: () => void;
  x: number;
  setX: (x: number) => void;
  resetX: () => void;
  y: number;
  setY: (y: number) => void;
  resetY: () => void;
  selectedTile: Tile;
  setSelectedTile: (tile: Tile) => void;
  resetSelectedTile: () => void;
  activeEntity: undefined | Entity;
  setActiveEntity: (entity: Entity) => void;
  resetActiveEntity: () => void;
  hoveredTile: Tile;
  setHoveredTile: (tile: Tile) => void;
  resetHoveredTile: () => void;
  valid: boolean;
  setValid: (valid: boolean) => void;
  resetValid: () => void;
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
        // Keep orientation between 1 and 4
        if (orientation < 1) {
          orientation = 4;
        } else {
          orientation = ((orientation - 1) % 4) + 1;
        }
        set({ orientation });
      },
      resetOrientation: () => set({ orientation: 1 }),
      order: 1,
      setOrder: (order) => set({ order }),
      character: 0,
      setCharacter: (character) => set({ character }),
      resetCharacter: () => set({ character: 0 }),
      spot: 0,
      setSpot: (spot) => set({ spot }),
      resetSpot: () => set({ spot: 0 }),
      x: 0,
      setX: (x) => set({ x }),
      resetX: () => set({ x: 0 }),
      y: 0,
      setY: (y) => set({ y }),
      resetY: () => set({ y: 0 }),
      selectedTile: { col: 0, row: 0 },
      setSelectedTile: (tile) => set({ selectedTile: tile }),
      resetSelectedTile: () => set({ selectedTile: { col: 0, row: 0 } }),
      activeEntity: undefined,
      setActiveEntity: (entity) => set({ activeEntity: entity }),
      resetActiveEntity: () => set({ activeEntity: undefined }),
      hoveredTile: { col: 0, row: 0 },
      setHoveredTile: (tile) => set({ hoveredTile: tile }),
      resetHoveredTile: () => set({ hoveredTile: { col: 0, row: 0 } }),
      valid: false,
      setValid: (valid) => set({ valid }),
      resetValid: () => set({ valid: false }),
    }),
    {
      name: "game-storage", // name of the item in the storage (must be unique)
    }
  )
);
