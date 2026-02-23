import { create } from "zustand";
export const useMusicStore = create((set) => ({
    track: null,
    muted: false,
    setTrack: (track) => set({ track }),
    setMuted: (muted) => set({ muted }),
    toggleMuted: () => set((state) => ({ muted: !state.muted })),
}));
//# sourceMappingURL=music.js.map