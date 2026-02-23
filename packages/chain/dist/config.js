const DEFAULT_CONFIG = {
    rpcUrl: "http://localhost:5050",
    toriiUrl: "http://localhost:8080",
    relayUrl: "",
    accountClassHash: "0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c",
    feeTokenAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};
export function createDojoConfig(overrides = {}) {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    if (!config.worldAddress) {
        throw new Error("worldAddress is required in DojoConfig");
    }
    return config;
}
//# sourceMappingURL=config.js.map