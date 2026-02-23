import { create } from "zustand";

interface UIState {
  loading: boolean;
  takeScreenshot: (() => void) | null;
  setLoading: (loading: boolean) => void;
  setTakeScreenshot: (fn: (() => void) | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  loading: false,
  takeScreenshot: null,
  setLoading: (loading) => set({ loading }),
  setTakeScreenshot: (takeScreenshot) => set({ takeScreenshot }),
}));
