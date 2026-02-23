import { ModeType } from "@paved/game-core";
interface LobbyState {
    playerEntity: string | null;
    mode: ModeType;
    setPlayerEntity: (entity: string | null) => void;
    setMode: (mode: ModeType) => void;
}
export declare const useLobbyStore: import("zustand").UseBoundStore<import("zustand").StoreApi<LobbyState>>;
export {};
//# sourceMappingURL=lobby.d.ts.map