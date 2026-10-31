import type { EconomyClient, IndexerClient, PavedClient } from "@paved/chain";
import { MOCKED } from "../data/data-source";
import type { DataSources, Purchases, Settlements, VaultWrites } from "../data/sources";

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
            indexerClient ??= (await import("@paved/chain")).createIndexerClient(import.meta.env.VITE_INDEXER_URL);
            if (!indexerClient) throw new Error(NO_INDEXER);
            const target = indexerClient as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>;
            return target[key]!(...args);
          },
  });
}

/**
 * A part of the chain client whose reads load it on the first call (`data/chain-client.ts`, its own chunk): starknet.js
 * stays out of the first bundle. A deployment that is not configured refuses each read with a `not-configured` error, and
 * so does a read the client does not have (`chainRead`): the proxy answers every name, so a hook's probe finds a function,
 * and the read's `not-configured` tells it the data is not served (PvP v2's before step 3, #741).
 */
function lazyChain<T extends object>(part: (client: PavedClient) => T): T {
  return new Proxy({} as T, {
    get: (_target, key) => (key === "then" ? undefined : async (...args: unknown[]) => (await import("../data/chain-client")).chainRead(part, key, args)),
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

/** The Vault's writes of a signer (P10), built on the economy client at the first deposit or withdraw. */
const lazyVault = (signer: Parameters<NonNullable<DataSources["vault"]>>[0]): VaultWrites => ({
  deposit: async (amount, options) => (await import("../data/vault-client")).vaultWritesOf(signer).deposit(amount, options),
  withdraw: async (amount, options) => (await import("../data/vault-client")).vaultWritesOf(signer).withdraw(amount, options),
  withdrawAll: async (options) => (await import("../data/vault-client")).vaultWritesOf(signer).withdrawAll(options),
});

/** The mock's sources (`data/mock/app.ts`, its own chunk), loaded with the first read or write. */
const mockApp = async () => (await import("../data/mock/app")).appMockSources();

type MockApp = Awaited<ReturnType<typeof mockApp>>;

/**
 * A part of the mock's sources whose reads load it on the first call, as `lazyChain` loads the chain's. `nested` names the
 * parts it holds as objects (the social source's `follows`, #954, and `chat`, #955), each lazy the same way. A `subscribe`
 * (the chat's, #955) answers its stop at once, as a socket's would: it subscribes once the mock is loaded, unless stopped before.
 */
function lazyMock<T extends object>(part: (app: MockApp) => object, nested: Record<string, (app: MockApp) => object> = {}): T {
  const inner = Object.fromEntries(Object.entries(nested).map(([key, pick]) => [key, lazyMock(pick)]));
  const target = async () => part(await mockApp()) as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>;
  return new Proxy({} as T, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : typeof key === "string" && key in inner
          ? inner[key]
          : key === "subscribe"
            ? (...args: unknown[]) => {
                let stop: (() => void) | null = null;
                let stopped = false;
                void target().then((t) => {
                  if (!stopped) stop = t[key]!(...args) as () => void;
                });
                return () => {
                  stopped = true;
                  stop?.();
                };
              }
            : async (...args: unknown[]) => (await target())[key]!(...args),
  });
}

/**
 * The data source `mock` (#549, #927): every read and write is the device's ledger's (`data/mock/app.ts`). No chain, economy
 * or indexer client is built, and neither the chain's chunk nor starknet.js is fetched: nothing leaves the app's origin.
 */
const MOCK_SOURCES: DataSources = {
  views: lazyMock((app) => app.views),
  events: lazyMock((app) => app.events),
  economy: lazyMock((app) => app.economy),
  pool: lazyMock((app) => app.pool),
  indexer: lazyMock((app) => app.indexer),
  social: lazyMock((app) => app.social, { follows: (app) => app.social.follows!, chat: (app) => app.social.chat! }),
  signer: null,
  purchases: (signer) => ({
    purchase: async (request) => (await mockApp()).purchases(signer).purchase(request),
    buyPack: async (request) => (await mockApp()).purchases(signer).buyPack(request),
    referrer: async (kind, referrer) => (await mockApp()).purchases(signer).referrer(kind, referrer),
    receipt: async (hash) => (await mockApp()).purchases(signer).receipt(hash),
  }),
  settlements: (signer) => ({ settle: async (gameIds) => (await mockApp()).settlements(signer).settle(gameIds) }),
  vault: (signer) => ({
    deposit: async (amount, options) => (await mockApp()).vault(signer).deposit(amount, options),
    withdraw: async (amount, options) => (await mockApp()).vault(signer).withdraw(amount, options),
    withdrawAll: async (options) => (await mockApp()).vault(signer).withdrawAll(options),
  }),
};

/**
 * The sources of the data source `chain`. Training needs only its save, `localStorage` (`store` left out:
 * `trainingStore` falls back to it). The chain's views and events are `PavedClient`'s on the resolved deployment (P5),
 * loaded with the first read. The signer is `WalletProvider`'s (P6): null here, filled while a wallet is connected. The
 * indexer is the client on `VITE_INDEXER_URL` (P6). The economy's views, its pool quote and the purchases are
 * `EconomyClient`'s on the same deployment (P7b), loaded with the first read; the settlement (P7a) and the Vault's writes
 * (P10) are its writer's, loaded with the first write.
 */
const CHAIN_SOURCES: DataSources = {
  views: lazyChain((c) => c.views),
  events: lazyChain((c) => c.events),
  economy: lazyEconomy((c) => c.views),
  pool: lazyEconomy((c) => c.poolQuoter),
  indexer: lazyIndexer(),
  // No `social`: the social features have no chain or service yet (#956), their hooks answer `unavailable`.
  signer: null,
  purchases: lazyPurchases,
  settlements: lazySettlements,
  vault: lazyVault,
};

/** The sources the app's `DataProvider` gives: the mock's on `mock`, the chain's else (`data/data-source.ts`). */
export const APP_SOURCES: DataSources = MOCKED ? MOCK_SOURCES : CHAIN_SOURCES;
