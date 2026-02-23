interface ActionsState {
    enabled: boolean;
    disabled: boolean;
    setEnabled: (enabled: boolean) => void;
    setDisabled: (disabled: boolean) => void;
}
export declare const useActionsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ActionsState>>;
export {};
//# sourceMappingURL=actions.d.ts.map