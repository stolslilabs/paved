import { DEVICE_KEY, createLocalKeyConnector, localKey, type AccountProvider, type KeyStorage, type WriteAccount } from "@paved/chain";
import type { GameSigner } from "../data/sources";
import type { WalletConnector } from "./wallet";

// The wallet of the mock (#927, PR 2): the device's key in its storage, as the chain's connector keeps it (`DEVICE_KEY`, the
// same address for the same key), and its account the ledger's. Nothing reads a node and nothing is deployed: the key's
// connector runs on a provider that answers every account as there, and the account sends nothing. `mockConnector`
// (`data/mock/overlay.ts`) goes over it: the ledger's writes, the village founded and the name drawn at the connection.

/** What a write the mock does not answer yet reads: the device's account is the ledger's, it sends nothing to a node. */
export const MOCK_ACCOUNT_UNSENT = "This write is not on the mock yet: the account lives on this device only. Nothing was sent.";

/** The refusal of a send from the mock's account: before sending (the writer reads code 20 so), nothing moved. */
export class MockAccountError extends Error {
  readonly code = 20;
  constructor() {
    super(MOCK_ACCOUNT_UNSENT);
    this.name = "MockAccountError";
  }
}

/** The key connector's node on the mock: every account is there (none is deployed), and no transaction is ever waited for. */
const NO_NODE: AccountProvider = {
  getClassHashAt: async () => "0x0",
  waitForTransaction: () => Promise.reject(new MockAccountError()),
};

export interface MockKeyOptions {
  /** Where the key is kept: `localStorage` in the app. */
  storage: KeyStorage;
  /** The ledger's accounts: Reset forgets the old key's. */
  ledger: { forget(account: string): Promise<boolean> };
  /** The account's writes; the mock's overlay (`mockSigner`) answers the ledger's over them. */
  signer(account: WriteAccount): GameSigner;
}

/**
 * The mock's wallet connector: Connect makes the device's key on the first connect and connects its account, a reload finds
 * it, Disconnect keeps the key and stops the reconnect, Reset forgets the key and the ledger's account and connects a new one.
 * No username (the overlay answers the ledger's name).
 */
export function mockKeyConnector({ storage, ledger, signer }: MockKeyOptions): WalletConnector {
  const local = createLocalKeyConnector({
    storage,
    provider: NO_NODE,
    deploy: async () => undefined,
    account: (key) => ({ address: key.address, execute: () => Promise.reject(new MockAccountError()) }),
  });
  /** The address of the key kept now; null without one, or for a value that is not a key. */
  const keptAddress = (): string | null => {
    const privateKey = storage.getItem(DEVICE_KEY);
    if (!privateKey) return null;
    try {
      return localKey(privateKey).address;
    } catch {
      return null;
    }
  };
  return {
    probe: () => local.probe(),
    connect: () => local.connect(),
    disconnect: () => local.disconnect(),
    reset: async () => {
      const old = keptAddress();
      if (old) await ledger.forget(old);
      return local.reset();
    },
    username: async () => null,
    signer,
  };
}
