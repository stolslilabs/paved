import type { ContractAddresses } from "./network";

export interface DojoConfig {
  rpcUrl: string;
  toriiUrl: string;
  relayUrl: string;
  masterAddress: string;
  masterPrivateKey: string;
  accountClassHash: string;
  feeTokenAddress: string;
  addresses: ContractAddresses;
  /** Manifest-shaped view of `addresses` (tag -> address) for DojoProvider; built here, not read from a file. */
  manifest: any;
  /** False while a contract address is missing: the app shows "not configured" instead of calling a chain. */
  configured: boolean;
  profile?: string;
  profileLabel?: string;
  supportsTokenMint?: boolean;
}

const DEFAULT_CONFIG: Partial<DojoConfig> = {
  rpcUrl: "http://localhost:5050",
  toriiUrl: "http://localhost:8080",
  relayUrl: "",
  masterAddress: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
  masterPrivateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  accountClassHash: "0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c",
  feeTokenAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

export function createDojoConfig(
  overrides: Partial<Omit<DojoConfig, "manifest" | "configured">> = {},
): DojoConfig {
  const config = { ...DEFAULT_CONFIG, ...overrides } as DojoConfig;
  const addresses: ContractAddresses = {
    account: "",
    daily: "",
    tutorial: "",
    token: "",
    ...overrides.addresses,
  };

  config.addresses = addresses;
  config.configured = Object.values(addresses).every(Boolean);
  config.manifest = {
    world: { address: "" },
    contracts: [
      { tag: "paved-Account", address: addresses.account },
      { tag: "paved-Daily", address: addresses.daily },
      { tag: "paved-Tutorial", address: addresses.tutorial },
      { tag: "paved-Token", address: addresses.token },
    ],
  };

  return config;
}
