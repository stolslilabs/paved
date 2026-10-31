import { resolveDeployment, resolveEconomyDeployment, type Deployment, type DeploymentFile, type EconomyDeployment, type EconomyDeploymentFile } from "@paved/chain";

// The deployment the build names (P5): `contracts/deployments/<VITE_NETWORK>.json` and the `VITE_*` values over it. No
// client here and nothing of starknet.js: the chain client (`chain-client.ts`) builds on it, and so does the mock's ledger
// (`mock/app.ts`, #927), which reads its `Setup` and builds no client.

/** `contracts/deployments/<network>.json`, keyed by path. */
const FILES = import.meta.glob<{ default: DeploymentFile & EconomyDeploymentFile }>("../../../../contracts/deployments/*.json", { eager: true });

const fileOf = (name: string) => Object.entries(FILES).find(([path]) => path.endsWith(`/${name}.json`))?.[1].default ?? null;

/**
 * The network of the build: `VITE_NETWORK`. The dev server defaults to devnet (as the legacy client did); a production build without
 * it has none, and the chain client refuses (`chainClient`) instead of falling back to devnet.
 */
export const network = (): string => import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : "");

/**
 * The deployment of `name`: its file, each `VITE_*` value set overriding it (`VITE_RPC_URL`, `VITE_CHALLENGE_ADDRESS`,
 * `VITE_SETUP_ADDRESS`, `VITE_DEPLOYED_BLOCK`).
 */
export function deploymentOf(name: string): Deployment {
  const file = fileOf(name);
  // Each value by its own static access: `import.meta.env` as a whole is every `VITE_*` value of the build's environment
  // in a literal, a devnet key included.
  return resolveDeployment({
    network: name,
    file,
    env: {
      rpcUrl: import.meta.env.VITE_RPC_URL,
      deployedBlock: import.meta.env.VITE_DEPLOYED_BLOCK,
      addresses: { Challenge: import.meta.env.VITE_CHALLENGE_ADDRESS, Setup: import.meta.env.VITE_SETUP_ADDRESS },
    },
  });
}

/** The economy's deployment over `base`: its addresses in the same file. */
export const economyDeploymentOf = (base: Deployment): EconomyDeployment => resolveEconomyDeployment({ base, file: fileOf(base.network) });
