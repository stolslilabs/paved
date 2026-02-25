import { create } from "zustand";
import { ModeType } from "@paved/game-core";

interface LobbyState {
  playerEntity: string | null;
  mode: ModeType;
  setPlayerEntity: (entity: string | null) => void;
  setMode: (mode: ModeType) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  playerEntity: null,
  mode: ModeType.Daily,
  setPlayerEntity: (playerEntity) => set({ playerEntity }),
  setMode: (mode) => set({ mode }),
}));
