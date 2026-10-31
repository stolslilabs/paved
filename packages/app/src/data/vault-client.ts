import { PavedWriter, type EconomyClient } from "@paved/chain";
import { economyClient } from "./economy-client";
import type { GameSigner, VaultWrites } from "./sources";

// The Vault's writes of the app (P10): the economy's writer on the signer's `PavedWriter`, so that the account's writes stay
// serialised. Imported only through a dynamic `import()` (`routes/sources.ts`), as `settle-client.ts`: starknet.js stays
// out of the first bundle and out of the vault page's chunk. The data source `chain` only: on `mock`, `mock/app.ts` (#927).

/** The Vault's writes of a signer on the build's economy client. Refused without an economy, or with a signer that is not a `PavedWriter`. */
export function vaultWritesOf(signer: GameSigner): VaultWrites {
  const economy = economyClient();
  if (!economy) throw new Error("The Vault is off: the economy is not deployed on this network");
  return vaultWritesFor(economy, signer);
}

/** The Vault's writes of a signer on a given economy client (`vaultWritesOf`; a test gives its own client on the fakes). */
export function vaultWritesFor(economy: EconomyClient, signer: GameSigner): VaultWrites {
  if (!(signer instanceof PavedWriter)) throw new Error("The Vault is off: this wallet cannot write to it");
  const writer = economy.writer(signer);
  return {
    deposit: (amount, options) => writer.deposit(amount, options),
    withdraw: (amount, options) => writer.withdraw(amount, options),
    withdrawAll: (options) => writer.withdrawAll(options),
  };
}
