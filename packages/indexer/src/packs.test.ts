// Cobbles v1 part 2 (docs/architecture/cobbles-v1.md, section 2): the packs, their sales and the balance they move, from the
// events to the API.
import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const R = 0xe5n; // a referrer
const PA = padded(A);
const PB = padded(B);
const PR = padded(R);
const DAY = 100;

// The owner's four packs (cobbles-v1.md, 2.1), USDC base units.
const PACKS = [
  ev.packSet(1, 50, 5_000_000n),
  ev.packSet(2, 100, 9_000_000n),
  ev.packSet(3, 500, 40_000_000n),
  ev.packSet(4, 1000, 70_000_000n),
];

/** `buy_pack`: Economy's Sold, then Setup's PackBought, one transaction. */
const buy = (player: bigint, pack: number, cobbles: number, price: bigint, referrer: bigint, referral: bigint, balance: number) => [
  ev.sold(player, { price, referrer, referral }),
  ev.packBought(player, pack, cobbles, price, referrer, balance),
];

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

/** A claims 5 cobbles, buys the 100-pack with R as referrer (105), buys the 50-pack (155), then claims 10 more (165). */
const scenario = (node: FakeNode) => {
  node.mine([ev.questDefined(1), ev.achievementDefined(2), ev.questCobblesSet(1, 5), ev.achievementCobblesSet(2, 10), ...PACKS]);
  node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)]);
  node.mine(buy(A, 2, 100, 9_000_000n, R, 450_000n, 105));
  node.mine(buy(A, 1, 50, 5_000_000n, 0n, 0n, 155), buy(B, 4, 1000, 70_000_000n, R, 3_500_000n, 1000));
  node.mine([ev.cobblesClaimed(A, 2, 2, 0, 10, 165)]);
};

describe("the packs", () => {
  test("the last PackSet of an id is the pack; a pack stopped is kept, inactive", async () => {
    const { queries, head } = await open((node) => {
      node.mine([...PACKS]);
      node.mine([ev.packSet(2, 120, 9_000_000n), ev.packSet(3, 500, 40_000_000n, false)]);
    });
    expect(queries.packs(head)).toEqual([
      { pack_id: 1, cobbles: 50, price: "5000000", active: true },
      { pack_id: 2, cobbles: 120, price: "9000000", active: true },
      { pack_id: 3, cobbles: 500, price: "40000000", active: false },
      { pack_id: 4, cobbles: 1000, price: "70000000", active: true },
    ]);
    // read at the block before: the first set
    expect(queries.packs(head - 1)[1]).toMatchObject({ pack_id: 2, cobbles: 100 });
    expect(queries.packs(head - 2)).toEqual([]);
  });

  test("the route", async () => {
    const { indexer } = await open((node) => node.mine([...PACKS]));
    const answer = respond(indexer, "GET", "/v1/packs");
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({ version: 1, status: "ok", packs: [{ pack_id: 1, cobbles: 50, price: "5000000", active: true }, {}, {}, {}] });
    expect(respond(indexer, "GET", "/v1/packs?x=1").code).toBe(400);
    expect(respond(indexer, "GET", "/v1/packs/1").code).toBe(404);
  });
});

describe("a pack purchase moves the balance", () => {
  test("the balance follows the claims and the purchases in the order of the chain", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 165, achievements_claimed: [2] });
    expect(queries.playerCobbles(head, PB)).toMatchObject({ cobbles: 1000, credits: 0 });
    // read at the earlier blocks (the scenario's block 2 is the claim, 3 the first pack, 4 the second)
    expect(queries.playerCobbles(2, PA).cobbles).toBe(5);
    expect(queries.playerCobbles(3, PA).cobbles).toBe(105);
    expect(queries.playerCobbles(4, PA).cobbles).toBe(155);
    expect(queries.playerCobbles(1, PA).cobbles).toBe(0);
  });

  test("the claim halt still holds with purchases in the ledger: a claim's balance is the purchases' plus its cobbles", async () => {
    await halts(
      (node) => {
        scenario(node);
        node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 10)]); // the claims alone would give 20, the purchases are missed
      },
      /balance 10, the claims before it sum to 170/,
    );
  });

  test("a purchase's balance is checked against the ledger before it", async () => {
    await halts(
      (node) => {
        node.mine([...PACKS]);
        node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)]);
        node.mine(buy(A, 1, 50, 5_000_000n, 0n, 0n, 50)); // 55 expected
      },
      /balance 50, the ledger before it gives 55/,
    );
  });
});

describe("the PackBought and Sold pairing", () => {
  test("a pack purchase is its PackBought joined to the Sold before it, with the referral of the Sold", async () => {
    const { queries, head } = await open(scenario);
    const mine = queries.playerPacks(head, PA, 10, undefined);
    expect(mine.next).toBeNull();
    expect(mine.purchases.map((p) => [p.pack_id, p.cobbles, p.price, p.balance, p.referrer, p.referral])).toEqual([
      [1, 50, "5000000", 155, null, "0"],
      [2, 100, "9000000", 105, PR, "450000"],
    ]);
    expect(mine.purchases[0]).toMatchObject({ block: 4, tx: 0, idx: 1 });
    expect(queries.playerPacks(head, PB, 10, undefined).purchases).toMatchObject([{ pack_id: 4, tx: 1, referrer: PR, referral: "3500000" }]);
    // the pairing is kept in the tables: two Sold, two PackBought for A, one each for B... three of each
    const dump = (await open(scenario)).indexer.store.dump();
    expect(dump.sales).toHaveLength(3);
    expect(dump.pack_purchases).toHaveLength(3);
    expect(dump.packs).toHaveLength(4);
  });

  test("two buys in one transaction pair each PackBought with the Sold just before it", async () => {
    const { queries, head } = await open((node) => {
      node.mine([...PACKS]);
      node.mine([...buy(A, 1, 50, 5_000_000n, 0n, 0n, 50), ...buy(A, 2, 100, 9_000_000n, R, 450_000n, 150)]);
    });
    expect(queries.playerPacks(head, PA, 10, undefined).purchases.map((p) => [p.pack_id, p.referral])).toEqual([
      [2, "450000"],
      [1, "0"],
    ]);
  });

  test("pages by the position", async () => {
    const { queries, head } = await open(scenario);
    const first = queries.playerPacks(head, PA, 1, undefined);
    expect(first.purchases).toHaveLength(1);
    expect(first.next).toBe("4:0:1");
    const second = queries.playerPacks(head, PA, 1, { block: 4, tx: 0, idx: 1 });
    expect(second.purchases.map((p) => p.pack_id)).toEqual([2]);
    expect(second.next).toBeNull();
  });

  test("the route", async () => {
    const { indexer } = await open(scenario);
    const answer = respond(indexer, "GET", `/v1/players/${PA}/packs?limit=1`);
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({ version: 1, player_id: PA, next: "4:0:1", purchases: [{ pack_id: 1, balance: 155 }] });
    expect(respond(indexer, "GET", `/v1/players/${PA}/packs?before=4:0:1`).body).toMatchObject({ next: null, purchases: [{ pack_id: 2 }] });
    expect(respond(indexer, "GET", `/v1/players/${PA}/packs?before=x`).code).toBe(400);
    expect(respond(indexer, "GET", `/v1/players/${PA}/cobbles`).body).toMatchObject({ cobbles: 165 });
    expect(respond(indexer, "GET", `/v1/players/${padded(0x777n)}/packs`).body).toMatchObject({ purchases: [], next: null });
  });

  test("a PackBought with no Sold, or with another's, or in another transaction, halts", async () => {
    await halts((node) => node.mine([...PACKS], [ev.packBought(A, 1, 50, 5_000_000n, 0n, 50)]), /no Sold before it/);
    await halts(
      (node) => node.mine([...PACKS], [ev.sold(B, { price: 5_000_000n }), ev.packBought(A, 1, 50, 5_000_000n, 0n, 50)]),
      /its Sold is another player's/,
    );
    await halts(
      (node) => node.mine([...PACKS, ev.sold(A, { price: 5_000_000n })], [ev.packBought(A, 1, 50, 5_000_000n, 0n, 50)]),
      /its Sold is not in the same transaction/,
    );
    await halts(
      (node) => node.mine([...PACKS], [ev.sold(A, { price: 4_000_000n }), ev.packBought(A, 1, 50, 5_000_000n, 0n, 50)]),
      /its Sold is for 4000000/,
    );
    await halts(
      (node) => node.mine([...PACKS], [ev.sold(A, { price: 5_000_000n, referrer: R, referral: 1n }), ev.packBought(A, 1, 50, 5_000_000n, 0n, 50)]),
      /its Sold has/,
    );
  });

  test("a Sold that no PackBought took halts at the next Sold", async () => {
    await halts(
      (node) => node.mine([...PACKS], [ev.sold(A, { price: 5_000_000n })], [...buy(B, 1, 50, 5_000_000n, 0n, 0n, 50)]),
      /an earlier Sold has no PackBought/,
    );
  });

  test("a pack never set, not on sale, or not as the pack is set, halts", async () => {
    await halts((node) => node.mine(buy(A, 1, 50, 5_000_000n, 0n, 0n, 50)), /the pack was never set/);
    await halts((node) => node.mine([...PACKS, ev.packSet(1, 50, 5_000_000n, false)], buy(A, 1, 50, 5_000_000n, 0n, 0n, 50)), /not on sale/);
    await halts((node) => node.mine([...PACKS], buy(A, 1, 60, 5_000_000n, 0n, 0n, 60)), /cobbles 60 for 5000000, the pack is 50 for 5000000/);
  });

  test("a pack changed in the block before the purchase sells as changed", async () => {
    const { queries, head } = await open((node) => {
      node.mine([...PACKS]);
      node.mine([ev.packSet(1, 60, 5_000_000n)]);
      node.mine(buy(A, 1, 60, 5_000_000n, 0n, 0n, 60));
    });
    expect(queries.playerCobbles(head, PA).cobbles).toBe(60);
  });
});

describe("the referral totals sum Purchased and Sold", () => {
  const referred = (node: FakeNode) => {
    scenario(node);
    node.mine([ev.purchased(1, A, { referrer: R, referral: 100_000n }), ev.purchased(2, B, { referrer: R, referral: 40_000n })]);
    node.mine([ev.purchased(3, A, { referrer: B, referral: 7_000n }), ev.purchased(4, A)]);
  };

  test("a referrer's total is its games' referrals and its packs' referrals", async () => {
    const { queries, head } = await open(referred);
    expect(queries.playerReferrals(head, PR)).toEqual({
      player_id: PR,
      total: String(140_000n + 450_000n + 3_500_000n),
      games: { count: 2, total: "140000" },
      packs: { count: 2, total: "3950000" },
    });
    expect(queries.playerReferrals(head, PB)).toMatchObject({ total: "7000", games: { count: 1, total: "7000" }, packs: { count: 0, total: "0" } });
    // a player that referred nobody, and a purchase with no referrer, count for nothing
    expect(queries.playerReferrals(head, PA)).toMatchObject({ total: "0", games: { count: 0 }, packs: { count: 0 } });
    expect(queries.playerReferrals(head, padded(0n)).total).toBe("0");
  });

  test("read at an earlier block: only what had happened", async () => {
    const { queries, head } = await open(referred);
    expect(queries.playerReferrals(3, PR).total).toBe("450000"); // the first pack only
    expect(queries.playerReferrals(4, PR).total).toBe("3950000"); // and B's pack
    expect(queries.playerReferrals(head - 1, PR).total).toBe(String(3_950_000n + 140_000n));
  });

  test("the route", async () => {
    const { indexer } = await open(referred);
    const answer = respond(indexer, "GET", `/v1/players/${PR}/referrals`);
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({ version: 1, player_id: PR, total: "4090000", games: { count: 2 }, packs: { count: 2 } });
    expect(respond(indexer, "GET", `/v1/players/${PR}/referrals?x=1`).code).toBe(400);
  });
});

describe("a reorg takes back the packs", () => {
  test("the new chain is indexed as a fresh index of it", async () => {
    const { node, indexer } = await open(scenario);
    node.reorg(3, [[buy(B, 3, 500, 40_000_000n, 0n, 0n, 500)], [[ev.packSet(3, 600, 40_000_000n)]]]);
    await settle(indexer);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.status).toBe("ok");
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    const queries = new Queries(indexer.store);
    expect(queries.playerCobbles(node.tip, PA).cobbles).toBe(5);
    expect(queries.packs(node.tip)[2]).toMatchObject({ pack_id: 3, cobbles: 600 });
  });
});
