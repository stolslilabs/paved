import { create } from "zustand";
import { NetworkLayer } from "./dojo/createNetworkLayer";
import { PhaserLayer } from "./phaser";

export type Store = {
    networkLayer: NetworkLayer | null;
    phaserLayer: PhaserLayer | null;
};

export const store = create<Store>(() => ({
    networkLayer: null,
    phaserLayer: null,
}));

export const useUIStore = create((set) => ({
    loggedIn: false,
    setLoggedIn: () => set(() => ({ loggedIn: true })),
}));

export const useGameIdStore = create((set) => ({
    gameId: 0,
    setGameId: (gameId: number) => set(() => ({ gameId })),
}));