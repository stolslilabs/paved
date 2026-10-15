import type { IndexerClient, PavedClient } from "@paved/chain";
import type { DataSources } from "../data/sources";

/** Why an indexer read fails in a build without one. */
const NO_INDEXER = "No indexer: VITE_INDEXER_URL is not set in this build";

let indexerClient: IndexerClient | null = null;

/**
 * The indexer client on `VITE_INDEXER_URL` (P6: home's top 3), built at the first read from `@paved/chain`'s chunk, so
 * starknet.js stays out of the first bundle. Without the variable every read is refused with `NO_INDEXER`.
 */
function lazyIndexer(): IndexerClient {
  return new Proxy({} as IndexerClient, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : async (...args: unknown[]) => {
            const { createIndexerClient } = await import("@paved/chain");
            indexerClient ??= createIndexerClient(import.meta.env.VITE_INDEXER_URL);
            if (!indexerClient) throw new Error(NO_INDEXER);
            const target = indexerClient as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>;
            return target[key]!(...args);
          },
  });
}

/**
 * A part of the chain client whose reads load it on the first call (`data/chain-client.ts`, its own chunk): starknet.js
 * stays out of the first bundle. A deployment that is not configured refuses each read with a `not-configured` error.
 */
function lazyChain<T extends object>(part: (client: PavedClient) => T): T {
  return new Proxy({} as T, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : async (...args: unknown[]) => {
            const { chainClient } = await import("../data/chain-client");
            const target = part(chainClient()) as Record<PropertyKey, (...a: unknown[]) => unknown>;
            return target[key]!(...args);
          },
  });
}

/**
 * The sources the app's `DataProvider` gives. Training needs only its save, `localStorage` (`store` left out:
 * `trainingStore` falls back to it). The chain's views and events are `PavedClient`'s on the resolved deployment (P5),
 * loaded with the first read. The signer is `WalletProvider`'s (P6): null here, filled while a wallet is connected. The
 * indexer is the client on `VITE_INDEXER_URL` (P6); no economy deployment yet, so the economy's hooks answer null.
 */
export const APP_SOURCES: DataSources = {
  views: lazyChain((c) => c.views),
  events: lazyChain((c) => c.events),
  economy: null,
  pool: null,
  indexer: lazyIndexer(),
  signer: null,
};
