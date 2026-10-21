// #639: the cobbles a system `Setup` allows spends for a player (the matchmaker's "Next", `CobblesSpent`), in the same running
// ledger as the claims, the packs and the skins.
import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const PA = padded(A);
const MATCHMAKER = 0x3a7c4n;
/** `'MATCH_NEXT'`, the reason of the matchmaker's spends. */
const NEXT = 0x4d415443485f4e455854n;
const DAY = 100;

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

describe("the cobble spends", () => {
  test("a spend lowers the running balance, after a claim and before the next", async () => {
    const { indexer, queries, head } = await open((node) => {
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 10, 10)]);
      node.mine([ev.cobblesSpent(A, MATCHMAKER, NEXT, 1, 9)]);
      node.mine([ev.cobblesSpent(A, MATCHMAKER, NEXT, 1, 8), ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 13)]);
    });
    expect(indexer.status).not.toBe("halted");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 13 });
    expect(queries.playerCobbles(2, PA)).toMatchObject({ cobbles: 9 });
    expect(indexer.store.dump().cobble_spends.map((row) => [row.player_id, row.spender, row.reason, row.cobbles, row.balance])).toEqual([
      [PA, padded(MATCHMAKER), padded(NEXT), 1, 9],
      [PA, padded(MATCHMAKER), padded(NEXT), 1, 8],
    ]);
  });

  test("a spend whose balance the ledger does not give halts", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 10, 10)]);
      node.mine([ev.cobblesSpent(A, MATCHMAKER, NEXT, 1, 7)]);
    });
    expect(indexer.status).toBe("halted");
    expect(indexer.reason).toMatch(/CobblesSpent .*balance 7, the ledger before it gives 9/);
  });

  test("a reorg takes a spend back", async () => {
    const { node, indexer, queries } = await open((node) => {
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 10, 10)]);
      node.mine([ev.cobblesSpent(A, MATCHMAKER, NEXT, 1, 9)]);
    });
    node.reorg(1, [[]]);
    await settle(indexer);
    expect(indexer.store.dump().cobble_spends).toEqual([]);
    expect(queries.playerCobbles(node.tip, PA)).toMatchObject({ cobbles: 10 });
  });
});
