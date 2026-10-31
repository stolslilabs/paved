import { PavedWriter, type EconomyClient } from "@paved/chain";
import { economyClient } from "./economy-client";
import type { GameSigner, Settlements } from "./sources";

// The settlement of the app (P7a): the economy's writer on the signer's `PavedWriter`, so that the account's writes stay
// serialised. Imported only through a dynamic `import()` (`routes/sources.ts`), as `economy-client.ts`: starknet.js stays
// out of the first bundle and out of the over page's chunk. The data source `chain` only: on `mock`, `mock/app.ts` (#927).

/** The settlement of a signer on the build's economy client. Refused without an economy, or with a signer that is not a `PavedWriter`. */
export function settlementsOf(signer: GameSigner): Settlements {
  const economy = economyClient();
  if (!economy) throw new Error("Settling is off: the economy is not deployed on this network");
  return settlementsFor(economy, signer);
}

/** The settlement of a signer on a given economy client (`settlementsOf`; a test gives its own client on the fakes). */
export function settlementsFor(economy: EconomyClient, signer: GameSigner): Settlements {
  if (!(signer instanceof PavedWriter)) throw new Error("Settling is off: this wallet cannot settle");
  return { settle: (gameIds) => economy.writer(signer).settle(gameIds) };
}
