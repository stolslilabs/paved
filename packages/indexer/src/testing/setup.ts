// Copied from Grim World, indexer/src/testing/setup.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: the four contracts and Paved's configuration. This copy is maintained by the Paved
// repository.
//
// The indexer over the fake node, as the unit tests of the store, the queries and the server use it.
import { Chain } from "../chain.ts";
import { Indexer } from "../indexer.ts";
import { Halt, Store } from "../store.ts";
import { ACCOUNT, CHAIN_ID, COLLECTION, DAILY, ECONOMY, FakeNode, TUTORIAL } from "./fake-node.ts";

export const CONFIG = {
  daily: DAILY,
  tutorial: TUTORIAL,
  account: ACCOUNT,
  economy: ECONOMY,
  collection: COLLECTION,
  from: 1,
  chainId: CHAIN_ID,
};

export function indexerOf(
  node: FakeNode,
  depth = 1000,
  recheck?: { depth: number; everyMs: number },
  afterServed?: ConstructorParameters<typeof Indexer>[0]["afterServed"],
  log?: (message: string) => void,
): Indexer {
  return new Indexer({
    recheck,
    afterServed,
    log,
    chain: new Chain(node.rpc, {
      daily: DAILY,
      tutorial: TUTORIAL,
      account: ACCOUNT,
      economy: ECONOMY,
      collection: COLLECTION,
    }),
    store: new Store(":memory:"),
    config: CONFIG,
    depth,
  });
}

/** Steps until idle or halted, as the process's loop does. */
export async function settle(subject: Indexer) {
  for (let i = 0; i < 1000; i++) {
    try {
      if (!(await subject.step())) return;
    } catch (error) {
      if (!(error instanceof Halt)) throw error;
      subject.halt(error.message);
      return;
    }
  }
  throw new Error("did not settle");
}
