import { create } from "zustand";
import { ModeType } from "@paved/game-core";
export const useLobbyStore = create((set) => ({
    playerEntity: null,
    mode: ModeType.Daily,
    setPlayerEntity: (playerEntity) => set({ playerEntity }),
    setMode: (mode) => set({ mode }),
}));
//# sourceMappingURL=lobby.js.map