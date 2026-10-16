import type { EconomyClient, IndexerClient, PavedClient } from "@paved/chain";
import type { DataSources, Purchases, Settlements } from "../data/sources";

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

/** Why an economy read fails in a deployment without the economy's contracts. */
const NO_ECONOMY = "Economy not deployed on this network";

/**
 * A part of the economy client (P7b: `data/economy-client.ts`, loaded with the chain's chunk) whose reads load it on the
 * first call. A deployment without the economy refuses each read with `NO_ECONOMY`.
 */
function lazyEconomy<T extends object>(part: (client: EconomyClient) => T | null): T {
  return new Proxy({} as T, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : async (...args: unknown[]) => {
            const { economyClient } = await import("../data/economy-client");
            const client = economyClient();
            const target = client ? (part(client) as Record<PropertyKey, (...a: unknown[]) => unknown> | null) : null;
            if (!target) throw new Error(NO_ECONOMY);
            return target[key]!(...args);
          },
  });
}

/** The purchases of a signer (P7b), built on the economy client at the first purchase. */
const lazyPurchases = (signer: Parameters<NonNullable<DataSources["purchases"]>>[0]): Purchases => ({
  purchase: async (request) => (await import("../data/economy-client")).purchasesOf(signer).purchase(request),
  buyPack: async (request) => (await import("../data/economy-client")).purchasesOf(signer).buyPack(request),
  referrer: async (kind, referrer) => (await import("../data/economy-client")).purchasesOf(signer).referrer(kind, referrer),
  receipt: async (hash) => (await import("../data/economy-client")).purchasesOf(signer).receipt(hash),
});

/** The settlement of a signer (P7a), built on the economy client at the first settle. */
const lazySettlements = (signer: Parameters<NonNullable<DataSources["settlements"]>>[0]): Settlements => ({
  settle: async (gameIds) => (await import("../data/settle-client")).settlementsOf(signer).settle(gameIds),
});

/**
 * The sources the app's `DataProvider` gives. Training needs only its save, `localStorage` (`store` left out:
 * `trainingStore` falls back to it). The chain's views and events are `PavedClient`'s on the resolved deployment (P5),
 * loaded with the first read. The signer is `WalletProvider`'s (P6): null here, filled while a wallet is connected. The
 * indexer is the client on `VITE_INDEXER_URL` (P6). The economy's views, its pool quote and the purchases are
 * `EconomyClient`'s on the same deployment (P7b), loaded with the first read.
 */
export const APP_SOURCES: DataSources = {
  views: lazyChain((c) => c.views),
  events: lazyChain((c) => c.events),
  economy: lazyEconomy((c) => c.views),
  pool: lazyEconomy((c) => c.poolQuoter),
  indexer: lazyIndexer(),
  signer: null,
  purchases: lazyPurchases,
  settlements: lazySettlements,
};
