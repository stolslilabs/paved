import type { WriteAccount, WriteResult } from "@paved/chain";
import type { GameSigner } from "../src/data";
import type { LoadConnector, WalletConnector } from "../src/wallet/wallet";

/**
 * A wallet connector in memory, for the tests. The real one (`src/wallet/connector.ts`, its own tests in
 * `wallet-connector.test.ts`) keeps a key and deploys its account on a node: what is faked is the key and its account;
 * the provider's state, the signer slot and the pages' use of them are real.
 */
export function fakeWallet(
  options: { address?: string; refuse?: string; restored?: boolean; claimEvents?: WriteResult["events"]; /** One account per connect, in turn. */ addresses?: string[] } = {},
) {
  const address = options.address ?? "0x5f1";
  const calls: string[] = [];
  const accountOf = (at: string): WriteAccount => ({ address: at, execute: async () => ({ transaction_hash: "0x1" }) });
  const account = accountOf(address);
  let connects = 0;
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
      const next = options.addresses?.[connects++];
      return next ? accountOf(next) : account;
    },
    disconnect: async () => void calls.push("disconnect"),
    reset: async () => {
      calls.push("reset");
      const next = options.addresses?.[connects++];
      return next ? accountOf(next) : account;
    },
    username: async () => null,
    signer,
  };
  const load: LoadConnector = async () => connector;
  return { load, connector, calls, address };
}
