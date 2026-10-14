import { create } from "zustand";

/**
 * UI state (section 3.3): what the interface remembers, not what the chain says. Components read it with
 * selectors, so a change re-renders only the slice's readers. The skeleton holds one field; the board's
 * (rotation, hover cell, camera mode, open sheet) and the persisted settings come with their pages.
 */
export interface UiState {
  /** The sheet that is open, if any. */
  openSheet: string | null;
  openSheetById: (id: string) => void;
  closeSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  openSheet: null,
  openSheetById: (id) => set({ openSheet: id }),
  closeSheet: () => set({ openSheet: null }),
}));
