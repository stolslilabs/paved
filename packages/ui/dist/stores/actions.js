import { create } from "zustand";
export const useActionsStore = create((set) => ({
    enabled: false,
    disabled: false,
    setEnabled: (enabled) => set({ enabled }),
    setDisabled: (disabled) => set({ disabled }),
}));
//# sourceMappingURL=actions.js.map