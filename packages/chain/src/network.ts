export type ChainProfileKey = "local" | "slot" | "sepolia";

export interface ChainProfile {
  key: ChainProfileKey;
  label: string;
  rpcUrl: string;
  toriiUrl: string;
  worldAddress: string;
  manifest: any;
  supportsTokenMint: boolean;
}

export interface ResolveChainProfileInput {
  profile?: string;
  rpcUrl?: string;
  toriiUrl?: string;
  worldAddress?: string;
  supportsTokenMint?: boolean | string;
  manifests: Partial<Record<ChainProfileKey, any>>;
}

const DEFAULTS: Record<ChainProfileKey, Omit<ChainProfile, "worldAddress" | "manifest">> = {
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

  return {
    key,
    label: defaults.label,
    rpcUrl: input.rpcUrl || defaults.rpcUrl,
    toriiUrl: input.toriiUrl || defaults.toriiUrl,
    worldAddress: input.worldAddress || "",
    manifest: input.manifests[key] ?? null,
    supportsTokenMint: parseMintSupport(input.supportsTokenMint, defaults.supportsTokenMint),
  };
}
