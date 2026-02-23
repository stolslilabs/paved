interface MusicState {
    track: any | null;
    muted: boolean;
    setTrack: (track: any | null) => void;
    setMuted: (muted: boolean) => void;
    toggleMuted: () => void;
}
export declare const useMusicStore: import("zustand").UseBoundStore<import("zustand").StoreApi<MusicState>>;
export {};
//# sourceMappingURL=music.d.ts.map