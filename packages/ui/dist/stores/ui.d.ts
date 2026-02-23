interface UIState {
    loading: boolean;
    takeScreenshot: (() => void) | null;
    setLoading: (loading: boolean) => void;
    setTakeScreenshot: (fn: (() => void) | null) => void;
}
export declare const useUIStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UIState>>;
export {};
//# sourceMappingURL=ui.d.ts.map