import { create } from "zustand";
import { ModeType } from "@paved/game-core";

interface ModesState {
  playerEntity: string | null;
  mode: ModeType;
  setPlayerEntity: (entity: string | null) => void;
  setMode: (mode: ModeType) => void;
}

export const useModesStore = create<ModesState>((set) => ({
  playerEntity: null,
  mode: ModeType.Daily,
  setPlayerEntity: (playerEntity) => set({ playerEntity }),
  setMode: (mode) => set({ mode }),
}));
