import { resolveChainProfileConfig } from "@paved/chain";
import type { ChainProfile } from "@paved/chain";
import devManifest from "../../../../contracts/manifests/dev/deployment/manifest.json";
import slotManifest from "../../../../contracts/manifests/slot/deployment/manifest.json";

export interface AppNetworkProfile extends ChainProfile {
  supportsMint: boolean;
}

interface EnvLike {
  VITE_CHAIN_PROFILE?: string;
  VITE_RPC_URL?: string;
  VITE_TORII_URL?: string;
  VITE_WORLD_ADDRESS?: string;
  VITE_SUPPORTS_TOKEN_MINT?: string;
}

export function resolveAppNetworkProfile(env: EnvLike): AppNetworkProfile {
  const profile = resolveChainProfileConfig({
    profile: env.VITE_CHAIN_PROFILE,
    rpcUrl: env.VITE_RPC_URL,
    toriiUrl: env.VITE_TORII_URL,
    worldAddress: env.VITE_WORLD_ADDRESS,
    supportsTokenMint: env.VITE_SUPPORTS_TOKEN_MINT,
    manifests: {
      local: devManifest,
      slot: slotManifest,
      sepolia: slotManifest,
    },
  });

  return {
    ...profile,
    supportsMint: profile.supportsTokenMint,
  };
}
