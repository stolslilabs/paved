import type { WriteAccount, WriteResult } from "@paved/chain";
import type { GameSigner } from "../src/data";
import type { LoadConnector, WalletConnector } from "../src/wallet/wallet";

/**
 * A wallet connector in memory, for the tests. The real one (`src/wallet/connector.ts`) opens Cartridge's keychain (an
 * iframe on Cartridge's service), which jsdom cannot run: what is faked is the controller's window and its account;
 * the provider's state, the signer slot and the pages' use of them are real.
 */
export function fakeWallet(options: { address?: string; refuse?: string; restored?: boolean; claimEvents?: WriteResult["events"] } = {}) {
  const address = options.address ?? "0x5f1";
  const calls: string[] = [];
  const account: WriteAccount = { address, execute: async () => ({ transaction_hash: "0x1" }) };
  const result = (events: WriteResult["events"] = []): WriteResult => ({ transactionHash: "0xabc", events });
  const signer = (from: WriteAccount): GameSigner =>
    ({
      address: from.address,
      build: async () => (calls.push("build"), result()),
      discard: async () => (calls.push("discard"), result()),
      surrender: async () => (calls.push("surrender"), result()),
      claimTutorial: async () => (calls.push("claimTutorial"), result(options.claimEvents)),
    }) as unknown as GameSigner;
  const connector: WalletConnector = {
    probe: async () => (calls.push("probe"), options.restored ? account : null),
    connect: async () => {
      calls.push("connect");
      if (options.refuse) throw new Error(options.refuse);
      return account;
    },
    disconnect: async () => void calls.push("disconnect"),
    username: async () => null,
    signer,
  };
  const load: LoadConnector = async () => connector;
  return { load, connector, calls, address };
}
