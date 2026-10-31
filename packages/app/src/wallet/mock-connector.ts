import { appLedger, offlineSigner } from "../data/mock/app";
import { mockConnector } from "../data/mock/overlay";
import { mockKeyConnector } from "./mock-key";
import type { WalletConnector } from "./wallet";

// The connector of a mock build (#927), loaded with its own chunk by `WalletProvider` in place of `connector.ts`: the device's
// key and the ledger's account (`mockKeyConnector`), deployed nowhere, no node read; the ledger's writes over it
// (`mockConnector`), each account connected having its village founded and its name drawn with it. No chain client is built:
// a write the ledger does not answer is refused before anything is sent (`offlineSigner`).

/** The connector of a mock build, on the app's ledger and the device's `localStorage`. */
export async function mockAppConnector(): Promise<WalletConnector> {
  const ledger = appLedger();
  return mockConnector(mockKeyConnector({ storage: window.localStorage, ledger, signer: offlineSigner }), ledger);
}
