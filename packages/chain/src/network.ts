export type ChainProfileKey = "local" | "slot" | "sepolia";

/** Addresses of the native contracts; an empty string means "not configured". */
export interface ContractAddresses {
  account: string;
  daily: string;
  tutorial: string;
  token: string;
}

export interface ChainProfile {
  key: ChainProfileKey;
  label: string;
  rpcUrl: string;
  toriiUrl: string;
  addresses: ContractAddresses;
  /** True when every contract address is set. */
  configured: boolean;
  supportsTokenMint: boolean;
}

export interface ResolveChainProfileInput {
  profile?: string;
  rpcUrl?: string;
  toriiUrl?: string;
  addresses?: Partial<ContractAddresses>;
  supportsTokenMint?: boolean | string;
}

const DEFAULTS: Record<ChainProfileKey, Omit<ChainProfile, "addresses" | "configured">> = {
  local: {
    key: "local",
    label: "Local Dev",
    rpcUrl: "http://localhost:5050",
    toriiUrl: "http://localhost:8080",
    supportsTokenMint: true,
  },
  slot: {
    key: "slot",
    label: "Slot Testnet",
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
    toriiUrl: "https://api.cartridge.gg/x/paved/torii",
    supportsTokenMint: false,
  },
  sepolia: {
    key: "sepolia",
    label: "Sepolia",
    rpcUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_8",
    toriiUrl: "",
    supportsTokenMint: false,
  },
};

function parseProfile(profile?: string): ChainProfileKey {
  if (!profile) return "local";
  if (profile === "slot" || profile === "sepolia" || profile === "local") return profile;
  return "local";
}

function parseMintSupport(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

export function resolveChainProfileConfig(input: ResolveChainProfileInput): ChainProfile {
  const key = parseProfile(input.profile);
  const defaults = DEFAULTS[key];
  const addresses: ContractAddresses = {
    account: input.addresses?.account || "",
    daily: input.addresses?.daily || "",
    tutorial: input.addresses?.tutorial || "",
    token: input.addresses?.token || "",
  };

  return {
    key,
    label: defaults.label,
    rpcUrl: input.rpcUrl || defaults.rpcUrl,
    toriiUrl: input.toriiUrl || defaults.toriiUrl,
    addresses,
    configured: Object.values(addresses).every(Boolean),
    supportsTokenMint: parseMintSupport(input.supportsTokenMint, defaults.supportsTokenMint),
  };
}
