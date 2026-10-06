import { resolveChainProfileConfig } from "@paved/chain";
import type { ChainProfile } from "@paved/chain";

export interface AppNetworkProfile extends ChainProfile {
  supportsMint: boolean;
}

interface EnvLike {
  VITE_CHAIN_PROFILE?: string;
  VITE_RPC_URL?: string;
  VITE_TORII_URL?: string;
  VITE_ACCOUNT_ADDRESS?: string;
  VITE_DAILY_ADDRESS?: string;
  VITE_TUTORIAL_ADDRESS?: string;
  VITE_TOKEN_ADDRESS?: string;
  VITE_SUPPORTS_TOKEN_MINT?: string;
}

export function resolveAppNetworkProfile(env: EnvLike): AppNetworkProfile {
  const profile = resolveChainProfileConfig({
    profile: env.VITE_CHAIN_PROFILE,
    rpcUrl: env.VITE_RPC_URL,
    toriiUrl: env.VITE_TORII_URL,
    addresses: {
      account: env.VITE_ACCOUNT_ADDRESS,
      daily: env.VITE_DAILY_ADDRESS,
      tutorial: env.VITE_TUTORIAL_ADDRESS,
      token: env.VITE_TOKEN_ADDRESS,
    },
    supportsTokenMint: env.VITE_SUPPORTS_TOKEN_MINT,
  });

  return {
    ...profile,
    supportsMint: profile.supportsTokenMint,
  };
}
