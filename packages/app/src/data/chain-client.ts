import { ViewError, createPavedClient, type PavedClient } from "@paved/chain";
import { deploymentOf, network } from "./deployment";

// The chain client of the app (P5): `PavedClient` on the deployment the build names. Imported only through a dynamic
// `import()` (`routes/sources.ts`), so starknet.js is fetched with the first page that reads the chain, never in the
// first bundle. The data source `chain` only: on `mock` no page loads this module (`mock/app.ts` serves every read, #927).

let client: PavedClient | null = null;

/** Calls the read `key` of `target`; a read it does not have is refused as a deployment without it is (`not-configured`). */
export function readOf(target: object, key: PropertyKey, args: unknown[]): unknown {
  const read = (target as Record<PropertyKey, unknown>)[key];
  if (typeof read !== "function") throw new ViewError("not-configured", `${String(key)}: not a read of this deployment's client`);
  return (read as (...a: unknown[]) => unknown).apply(target, args);
}

/** The read `key` of a part of the chain client (`routes/sources.ts`' lazy views and events), as `readOf` calls it. */
export const chainRead = <T extends object>(part: (client: PavedClient) => T, key: PropertyKey, args: unknown[]): unknown => readOf(part(chainClient()), key, args);

/**
 * The client on `contracts/deployments/<VITE_NETWORK>.json`, each `VITE_*` value set overriding the file (`deploymentOf`). A
 * deployment that is not configured throws `createPavedClient`'s `not-configured` view error, which the pages show.
 */
export function chainClient(): PavedClient {
  if (client) return client;
  const name = network();
  if (!name) throw new ViewError("not-configured", "Not connected: this build names no network (set VITE_NETWORK)");
  client = createPavedClient(deploymentOf(name));
  return client;
}
