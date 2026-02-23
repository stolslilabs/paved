export interface ControllerConfig {
    rpc: string;
    policies?: Array<{
        target: string;
        method: string;
        description?: string;
    }>;
}
export declare function createControllerConnector(config: ControllerConfig): {
    id: string;
    name: string;
    config: ControllerConfig;
};
//# sourceMappingURL=controller.d.ts.map