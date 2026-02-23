import { create } from "zustand";
export const useUIStore = create((set) => ({
    loading: false,
    takeScreenshot: null,
    setLoading: (loading) => set({ loading }),
    setTakeScreenshot: (takeScreenshot) => set({ takeScreenshot }),
}));
//# sourceMappingURL=ui.js.map