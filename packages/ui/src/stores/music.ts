import { create } from "zustand";

interface MusicState {
  track: any | null; // Howl instance (platform-specific)
  muted: boolean;
  setTrack: (track: any | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

export const useMusicStore = create<MusicState>((set) => ({
  track: null,
  muted: false,
  setTrack: (track) => set({ track }),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
}));
