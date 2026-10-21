// The village (#640, docs/architecture/village-territory.md): the parcels a player buys and the demolitions it makes are
// paid on Setup's ledger (`ParcelPaid`, `DemolitionPaid`), in the one running balance of claims, packs and skins, from the
// events to the API.
import { describe, expect, test } from "vitest";
import { DecodeError, decode, padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const PA = padded(A);
const DAY = 100;

async function open(build: (node: FakeNode) => void) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerOf(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

const halts = async (build: (node: FakeNode) => void, reason: RegExp) => {
  const { indexer } = await open(build);
  expect(indexer.status).toBe("halted");
  expect(indexer.reason).toMatch(reason);
};

/** A claims 100, buys parcels 1 (10) and 2 (20), claims 5 (75). B claims 5. */
const scenario = (node: FakeNode) => {
  node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100), ev.cobblesClaimed(B, 1, 1, DAY, 5, 5)]);
  node.mine([ev.parcelPaid(A, 1, 10, 90)]);
  node.mine([ev.parcelPaid(A, 2, 20, 70)]);
  node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 75)]);
};

describe("ParcelPaid", () => {
  test("decodes the event of Setup", () => {
    const e = ev.parcelPaid(0x1234, 29, 290, 2 ** 40);
    expect(decode("setup", e.keys, e.data)).toEqual({ name: "ParcelPaid", playerId: 0x1234n, parcel: 29, cobbles: 290, balance: 2n ** 40n });
    // parcel 0 or 30, a free parcel, a balance above 2^53, a missing member
    for (const bad of [ev.parcelPaid(1, 0, 10, 5), ev.parcelPaid(1, 30, 10, 5), ev.parcelPaid(1, 1, 0, 5), ev.parcelPaid(1, 1, 10, 2 ** 60)]) {
      expect(() => decode("setup", bad.keys, bad.data)).toThrow(DecodeError);
    }
    expect(() => decode("setup", e.keys, [])).toThrow(DecodeError);
    expect(() => decode("economy", e.keys, e.data)).toThrow(/does not emit it/);
  });

  test("a parcel moves the balance, in the one ledger", async () => {
    const { queries, head, indexer } = await open(scenario);
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 75, parcels_bought: 2, parcels_spent: 30 });
    expect(queries.playerCobbles(2, PA)).toMatchObject({ cobbles: 90, parcels_bought: 1, parcels_spent: 10 });
    expect(queries.playerCobbles(head, padded(B))).toMatchObject({ cobbles: 5, parcels_bought: 0, parcels_spent: 0 });
    expect(respond(indexer, "GET", `/v1/players/${PA}/cobbles`).body).toMatchObject({ cobbles: 75, parcels_bought: 2 });
    expect(indexer.store.dump().parcel_purchases.map((row) => [row.parcel, row.cobbles, row.balance])).toEqual([
      [1, 10, 90],
      [2, 20, 70],
    ]);
  });

  test("the halts: a parcel out of order, a balance that does not follow", async () => {
    await halts((node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.parcelPaid(A, 2, 20, 80)]), /has 0 parcels before it/);
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.parcelPaid(A, 1, 10, 90)], [ev.parcelPaid(A, 1, 10, 80)]),
      /has 1 parcels before it/,
    );
    await halts((node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.parcelPaid(A, 1, 10, 91)]), /balance 91, the ledger before it gives 90/);
    // a claim after a parcel is checked against the balance the parcel left
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.parcelPaid(A, 1, 10, 90)], [ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 105)]),
      /balance 105/,
    );
  });

  test("a reorg takes the parcels back", async () => {
    const { node, indexer } = await open(scenario);
    // the last two blocks (parcel 2, the claim) are replaced: parcel 2 is not bought
    node.reorg(2, [[[ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 95)]]]);
    await settle(indexer);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.status).toBe("ok");
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    expect(new Queries(indexer.store).playerCobbles(node.tip, PA)).toMatchObject({ cobbles: 95, parcels_bought: 1, parcels_spent: 10 });
  });
});

describe("DemolitionPaid", () => {
  test("decodes the event of Setup, at the price of its rank in the day", () => {
    const e = ev.demolitionPaid(0x1234, 20_000, 3, 20, 80);
    expect(decode("setup", e.keys, e.data)).toEqual({ name: "DemolitionPaid", playerId: 0x1234n, day: 20_000n, count: 3, cobbles: 20n, balance: 80n });
    // count 0, a price that is not 5 x 2^(count - 1), a missing member
    for (const bad of [ev.demolitionPaid(1, 0, 0, 5, 5), ev.demolitionPaid(1, 0, 1, 10, 5), ev.demolitionPaid(1, 0, 2, 5, 5)]) {
      expect(() => decode("setup", bad.keys, bad.data)).toThrow(DecodeError);
    }
    expect(() => decode("setup", e.keys, [])).toThrow(DecodeError);
  });

  test("a day's demolitions move the balance; the next day counts from 1 again", async () => {
    const { queries, head, indexer } = await open((node) => {
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
      node.mine([ev.demolitionPaid(A, DAY, 1, 5, 95)], [ev.demolitionPaid(A, DAY, 2, 10, 85)]);
      node.mine([ev.demolitionPaid(A, DAY + 1, 1, 5, 80)]);
      node.mine([ev.parcelPaid(A, 1, 10, 70)]);
    });
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 70, demolitions: 3, demolitions_spent: 20, parcels_bought: 1 });
  });

  test("the halts: a demolition out of its day's order, a balance that does not follow", async () => {
    await halts((node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.demolitionPaid(A, DAY, 2, 10, 90)]), /made 0 that day before it/);
    await halts(
      (node) => node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.demolitionPaid(A, DAY, 1, 5, 96)]),
      /balance 96, the ledger before it gives 95/,
    );
  });
});
