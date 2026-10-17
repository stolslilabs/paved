import { ViewError, createPavedClient, resolveDeployment, type DeploymentFile, type PavedClient } from "@paved/chain";

// The chain client of the app (P5): `PavedClient` on the deployment the build names. Imported only through a dynamic
// `import()` (`routes/sources.ts`), so starknet.js is fetched with the first page that reads the chain, never in the
// first bundle.

/** `contracts/deployments/<network>.json`, keyed by path. */
const FILES = import.meta.glob<{ default: DeploymentFile }>("../../../../contracts/deployments/*.json", { eager: true });

/**
 * The network of the build: `VITE_NETWORK`. The dev server defaults to devnet (as the legacy client did); a production build without
 * it has none, and the chain client refuses (`chainClient`) instead of falling back to devnet.
 */
export const network = (): string => import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : "");

let client: PavedClient | null = null;

/**
 * The client on `contracts/deployments/<VITE_NETWORK>.json`, each `VITE_*` value set overriding the file (`VITE_RPC_URL`,
 * `VITE_CHALLENGE_ADDRESS`, `VITE_SETUP_ADDRESS`, `VITE_DEPLOYED_BLOCK`). A deployment that is not configured throws
 * `createPavedClient`'s `not-configured` view error, which the pages show.
 */
export function chainClient(): PavedClient {
  if (client) return client;
  const name = network();
  if (!name) throw new ViewError("not-configured", "Not connected: this build names no network (set VITE_NETWORK)");
  const file = Object.entries(FILES).find(([path]) => path.endsWith(`/${name}.json`))?.[1].default ?? null;
  // Each value by its own static access: `import.meta.env` as a whole is every `VITE_*` value of the build's environment
  // in a literal, a devnet key included.
  const deployment = resolveDeployment({
    network: name,
    file,
    env: {
      rpcUrl: import.meta.env.VITE_RPC_URL,
      deployedBlock: import.meta.env.VITE_DEPLOYED_BLOCK,
      addresses: { Challenge: import.meta.env.VITE_CHALLENGE_ADDRESS, Setup: import.meta.env.VITE_SETUP_ADDRESS },
    },
  });
  client = createPavedClient(deployment);
  return client;
}
