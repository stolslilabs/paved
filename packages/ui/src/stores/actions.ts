import { create } from "zustand";

interface ActionsState {
  enabled: boolean;
  disabled: boolean;
  setEnabled: (enabled: boolean) => void;
  setDisabled: (disabled: boolean) => void;
}

export const useActionsStore = create<ActionsState>((set) => ({
  enabled: false,
  disabled: false,
  setEnabled: (enabled) => set({ enabled }),
  setDisabled: (disabled) => set({ disabled }),
}));
