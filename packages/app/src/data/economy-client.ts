import { PavedWriter, createEconomyClient, packBuyerOf, resolveEconomyDeployment, type EconomyClient, type EconomyDeploymentFile } from "@paved/chain";
import { chainClient } from "./chain-client";
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
  client = createEconomyClient(resolveEconomyDeployment({ base: base.deployment, file }), base);
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
  if (!(signer instanceof PavedWriter)) throw new Error("Purchases are off: this wallet cannot buy");
  return { purchase: (request) => economy.writer(signer).purchase(request), buyPack: (request) => packBuyerOf(economy, signer).buy(request) };
}
