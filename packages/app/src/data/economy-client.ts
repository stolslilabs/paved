import {
  EconomyClient,
  PavedWriter,
  RefusedReferrerError,
  createEconomyClient,
  packBuyerOf,
  packReferrer,
  resolveEconomyDeployment,
  type EconomyDeploymentFile,
} from "@paved/chain";
import { chainClient, mockLedger } from "./chain-client";
import { DATA_SOURCE } from "./data-source";
import { mockEconomyViews, mockPool, mockPurchases } from "./mock/overlay";
import type { GameSigner, Purchases } from "./sources";

// The economy's client of the app (P7b): `EconomyClient` on the chain client of the build (`chain-client.ts`) and the
// economy's addresses of the same deployments file. Imported only through a dynamic `import()` (`routes/sources.ts`), as
// the chain client: starknet.js stays out of the first bundle.

/** `contracts/deployments/<network>.json`, keyed by path: the same files `chain-client.ts` reads. */
const FILES = import.meta.glob<{ default: EconomyDeploymentFile }>("../../../../contracts/deployments/*.json", { eager: true });

let client: EconomyClient | null | undefined;

/**
 * The economy client of the build's deployment, or null when its contracts are not in the deployments file (the economy's
 * reads answer null then). The chain client's refusal (no network, a deployment not configured) is thrown as it is.
 */
export function economyClient(): EconomyClient | null {
  if (client !== undefined) return client;
  const base = chainClient();
  const file = Object.entries(FILES).find(([path]) => path.endsWith(`/${base.deployment.network}.json`))?.[1].default ?? null;
  const real = createEconomyClient(resolveEconomyDeployment({ base: base.deployment, file }), base);
  // The data source `mock` (`data-source.ts`): the Vault's, the split's, the seller's, the tokens' balances' and the games' reads
  // (the quote, the days, the terms) and the pool's quote come from the device's ledger (#927).
  client = real && DATA_SOURCE === "mock" ? new EconomyClient(real.deployment, base, real.codecs, mockEconomyViews(real.views, mockLedger()), mockPool(mockLedger())) : real;
  return client;
}

/**
 * The purchases of a signer: the economy's writer and the pack buyer on the signer's `PavedWriter`, so that every write of
 * the account stays serialised. Refused without an economy, or with a signer that is not a `PavedWriter` (the wallet's
 * always is: `PavedClient.writer`).
 */
export function purchasesOf(signer: GameSigner): Purchases {
  const economy = economyClient();
  if (!economy) throw new Error("Purchases are off: the economy is not deployed on this network");
  return purchasesFor(economy, signer);
}

/** The purchases of a signer on a given economy client (`purchasesOf`; a test gives its own client on the fakes). */
export function purchasesFor(economy: EconomyClient, signer: GameSigner): Purchases {
  if (!(signer instanceof PavedWriter)) throw new Error("Purchases are off: this wallet cannot buy");
  const { deployment } = economy;
  const purchases: Purchases = {
    purchase: (request) => economy.writer(signer).purchase(request),
    buyPack: (request) => packBuyerOf(economy, signer).buy(request),
    // A game's purchase and a pack's go through the same `Economy.pay`, which ignores the same addresses: one rule for both.
    referrer: async (_kind, referrer) => {
      try {
        // The router and the seller (`Setup`), read now as the writers read them at send: both are sent as 0x0.
        const [router, seller] = await Promise.all([economy.views.router(), economy.views.seller()]);
        const sent = packReferrer(referrer, signer.address, deployment, { router, seller });
        return sent === "0x0" ? null : sent;
      } catch (error) {
        // A referrer the contract would not pay: dropped, never a refused purchase.
        if (error instanceof RefusedReferrerError) return null;
        throw error;
      }
    },
    receipt: (hash) => receiptOutcome(economy.base.provider, hash),
  };
  // The data source `mock`: the ledger sells the pack and the Challenge game (`mockPurchases`, #927).
  return DATA_SOURCE === "mock" ? mockPurchases(purchases, mockLedger(), signer.address) : purchases;
}

/** What `receiptOutcome` reads: starknet.js's `getTransactionReceipt` (its receipt keeps the node's `execution_status`). */
interface ReceiptReader {
  getTransactionReceipt?: (hash: string) => Promise<{ execution_status?: string }>;
}

/** The node does not know the hash (JSON-RPC error 29, `TXN_HASH_NOT_FOUND`): not a failed read. */
const hashNotFound = (error: unknown): boolean =>
  (error as { code?: unknown }).code === 29 || /TXN_HASH_NOT_FOUND|Transaction hash not found/i.test(error instanceof Error ? error.message : String(error));

/** A sent transaction's outcome from its receipt: `unknown` until the node knows it; any other failed read rejects. */
export async function receiptOutcome(provider: unknown, hash: string): Promise<"succeeded" | "reverted" | "unknown"> {
  const reader = provider as ReceiptReader;
  if (!reader.getTransactionReceipt) throw new Error("This network cannot read a receipt");
  try {
    const receipt = await reader.getTransactionReceipt(hash);
    return receipt.execution_status === "SUCCEEDED" ? "succeeded" : receipt.execution_status === "REVERTED" ? "reverted" : "unknown";
  } catch (error) {
    if (hashNotFound(error)) return "unknown";
    throw error;
  }
}
