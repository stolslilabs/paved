import { resolveEconomyDeployment } from "@paved/chain";
import type { Deployment, EconomyDeployment, EconomyDeploymentFile } from "@paved/chain";

/** The `VITE_*` variables of the economy's addresses; each one set overrides `contracts/deployments/<network>.json`. */
export interface EconomyNetworkEnv {
  VITE_ECONOMY_ADDRESS?: string;
  VITE_PAVED_TOKEN_ADDRESS?: string;
  VITE_VAULT_ADDRESS?: string;
  VITE_USDC_ADDRESS?: string;
}

/** The economy's deployment for the game's: the same network's file (keyed by path), the env over it. */
export function resolveEconomyNetwork(base: Deployment, env: EconomyNetworkEnv, files: Record<string, unknown>): EconomyDeployment {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${base.network}.json`));
  const raw = (entry?.[1] as { default?: EconomyDeploymentFile } | EconomyDeploymentFile | undefined) ?? null;
  const file = raw && "default" in raw ? (raw.default ?? null) : (raw as EconomyDeploymentFile | null);
  return resolveEconomyDeployment({
    base,
    file,
    env: { economy: env.VITE_ECONOMY_ADDRESS, pavedToken: env.VITE_PAVED_TOKEN_ADDRESS, vault: env.VITE_VAULT_ADDRESS, usdc: env.VITE_USDC_ADDRESS },
  });
}

/** The economy of the app's build: the deployments files read at build time, as `main.tsx` does for the game's. */
export function appEconomy(base: Deployment): EconomyDeployment {
  const files = import.meta.glob("../../../../contracts/deployments/*.json", { eager: true });
  return resolveEconomyNetwork(base, import.meta.env as EconomyNetworkEnv, files);
}
