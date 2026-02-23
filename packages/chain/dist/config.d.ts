export interface DojoConfig {
    rpcUrl: string;
    toriiUrl: string;
    relayUrl: string;
    masterAddress: string;
    masterPrivateKey: string;
    accountClassHash: string;
    feeTokenAddress: string;
    worldAddress: string;
    manifest: any;
}
export declare function createDojoConfig(overrides?: Partial<DojoConfig>): DojoConfig;
//# sourceMappingURL=config.d.ts.map