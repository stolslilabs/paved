// Cobbles v1 part 3 (docs/architecture/cobbles-v1.md, section 5): the skins, priced by the owner, bought with cobbles and
// activated, from the events to the API.
import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, ev, skinWord } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const PA = padded(A);
const PB = padded(B);
const DAY = 100;

// The owner's prices in Forest (theme 1) and one plan of theme 2.
const PRICES = [ev.skinPriced(1, 1, 50), ev.skinPriced(1, 2, 60), ev.skinPriced(1, 19, 100), ev.skinPriced(2, 1, 70)];

/** `buy_pack` of 100 cobbles by A (Economy's Sold, then Setup's PackBought). */
const pack = (player: bigint, balance: number) => [
  ev.sold(player, { price: 9_000_000n }),
  ev.packBought(player, 2, 100, 9_000_000n, 0n, balance),
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

/**
 * A claims 100 (100), buys the 100-pack (200), buys Forest plan 1 (150) and plan 19 (50), claims 5 (55) and shows plan 1; then
 * re-activates in a batch (plan 1 back to the default, plan 19 shown). B only claims.
 */
const scenario = (node: FakeNode) => {
  node.mine([ev.packSet(2, 100, 9_000_000n), ...PRICES]);
  node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
  node.mine(pack(A, 200));
  node.mine([ev.skinBought(A, 1, 1, 50, 150)]);
  node.mine([ev.skinBought(A, 1, 19, 100, 50)]);
  node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 55), ev.cobblesClaimed(B, 1, 1, DAY, 5, 5)]);
  node.mine([ev.skinsActivated(A, skinWord([[1, 1]]))]);
  node.mine([ev.skinsActivated(A, skinWord([[19, 1]]))]);
};

describe("the skin prices", () => {
  test("the last SkinPriced of a (theme, plan) is the price; a skin withdrawn is kept at 0", async () => {
    const { queries, head } = await open((node) => {
      node.mine([...PRICES]);
      node.mine([ev.skinPriced(1, 2, 80), ev.skinPriced(1, 19, 0), ev.skinPriced(3, 5, 55)]);
    });
    expect(queries.skinPrices(head).map((p) => [p.theme, p.plan, p.cobbles])).toEqual([
      [1, 1, 50],
      [1, 2, 80],
      [1, 19, 0],
      [2, 1, 70],
      [3, 5, 55],
    ]);
    expect(queries.skinPrices(head, 2)).toEqual([{ theme: 2, plan: 1, cobbles: 70 }]);
    expect(queries.skinPrices(head, 9)).toEqual([]);
    // the price in force at an earlier block
    expect(queries.skinPrices(head - 1).find((p) => p.theme === 1 && p.plan === 2)?.cobbles).toBe(60);
    expect(queries.skinPrices(head - 1)).toHaveLength(4);
  });

  test("two prices in one block: the later event wins", async () => {
    const { queries, head } = await open((node) => node.mine([ev.skinPriced(1, 1, 50), ev.skinPriced(1, 1, 90)]));
    expect(queries.skinPrices(head)).toEqual([{ theme: 1, plan: 1, cobbles: 90 }]);
  });

  test("the route: all prices, or one theme", async () => {
    const { indexer } = await open(scenario);
    const all = respond(indexer, "GET", "/v1/skins");
    expect(all.code).toBe(200);
    expect(all.body).toMatchObject({ version: 1, theme: null });
    expect((all.body as { prices: unknown[] }).prices).toHaveLength(4);
    expect(respond(indexer, "GET", "/v1/skins?theme=2").body).toMatchObject({ theme: 2, prices: [{ theme: 2, plan: 1, cobbles: 70 }] });
    expect(respond(indexer, "GET", "/v1/skins?theme=0").code).toBe(400);
    expect(respond(indexer, "GET", "/v1/skins?theme=256").code).toBe(400);
    expect(respond(indexer, "GET", "/v1/skins?x=1").code).toBe(400);
    expect(respond(indexer, "GET", "/v1/skins/1").code).toBe(404);
  });
});

describe("buying a skin", () => {
  test("a buy moves the balance, in the one ledger of claims, packs and skins", async () => {
    const { queries, head, indexer } = await open(scenario);
    expect(indexer.status).toBe("ok");
    expect(queries.playerCobbles(head, PA)).toMatchObject({ cobbles: 55, skins_bought: 2, skins_spent: 150 });
    // at each block of the ledger
    expect(queries.playerCobbles(3, PA)).toMatchObject({ cobbles: 200, skins_bought: 0, skins_spent: 0 });
    expect(queries.playerCobbles(4, PA)).toMatchObject({ cobbles: 150, skins_bought: 1, skins_spent: 50 });
    expect(queries.playerCobbles(5, PA)).toMatchObject({ cobbles: 50, skins_bought: 2, skins_spent: 150 });
    expect(queries.playerCobbles(head, PB)).toMatchObject({ cobbles: 5, skins_bought: 0, skins_spent: 0 });
    expect(respond(indexer, "GET", `/v1/players/${PA}/cobbles`).body).toMatchObject({ cobbles: 55, skins_bought: 2, skins_spent: 150 });
  });

  test("the skins owned per theme, ascending, as of the served block", async () => {
    const { queries, head } = await open((node) => {
      scenario(node);
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 2, 100, 155)]);
      node.mine([ev.skinBought(A, 2, 1, 70, 85), ev.skinBought(A, 1, 2, 60, 25)]);
    });
    expect(queries.playerSkins(head, PA).owned).toEqual([
      { theme: 1, plans: [1, 2, 19] },
      { theme: 2, plans: [1] },
    ]);
    expect(queries.playerSkins(head - 1, PA).owned).toEqual([{ theme: 1, plans: [1, 19] }]);
    expect(queries.playerSkins(head, PB)).toEqual({ player_id: PB, owned: [], active: new Array(19).fill(0) });
  });

  test("a skin priced in the same block as its purchase is bought at that price", async () => {
    const { indexer } = await open((node) => {
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
      node.mine([ev.skinPriced(1, 1, 50), ev.skinBought(A, 1, 1, 50, 50)]);
    });
    expect(indexer.status).toBe("ok");
  });

  test("a skin withdrawn from sale stays owned and active", async () => {
    const { queries, head, indexer } = await open((node) => {
      scenario(node);
      node.mine([ev.skinPriced(1, 1, 0), ev.skinPriced(1, 19, 0)]);
      node.mine([ev.skinsActivated(A, skinWord([[1, 1], [19, 1]]))]);
    });
    expect(indexer.status).toBe("ok");
    expect(queries.playerSkins(head, PA).owned).toEqual([{ theme: 1, plans: [1, 19] }]);
  });

  test("the halts: a skin already owned, a price that is not the one in force, a skin not on sale, a balance that does not follow", async () => {
    await halts(
      (node) => {
        node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 0)]);
      },
      /already owned/,
    );
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinBought(A, 1, 2, 70, 30)]),
      /price 70, the price in force is 60/,
    );
    // the price in force is the last one: a repriced skin sells at the new price only
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinPriced(1, 2, 90)], [ev.skinBought(A, 1, 2, 60, 40)]),
      /price 60, the price in force is 90/,
    );
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinBought(A, 3, 1, 50, 50)]),
      /the skin is not on sale/,
    );
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinPriced(1, 1, 0)], [ev.skinBought(A, 1, 1, 50, 50)]),
      /the skin is not on sale/,
    );
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinBought(A, 1, 1, 50, 49)]),
      /balance 49, the ledger before it gives 50/,
    );
    // more cobbles than the player had: the balance cannot follow
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 5, 5)], [ev.skinBought(A, 1, 1, 50, 0)]),
      /balance 0, the ledger before it gives -45/,
    );
  });

  test("a claim after a skin buy is checked against the balance the skin left", async () => {
    await halts(
      (node) => {
        node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
        node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 105)]); // 55 expected: the skin was not counted
      },
      /balance 105, the claims before it sum to 55/,
    );
  });
});

describe("the active set", () => {
  test("the last SkinsActivated of a player is its set: 19 themes, plan 1 first, 0 the default", async () => {
    const { queries, head } = await open(scenario);
    expect(queries.playerSkins(head, PA).active).toEqual([0, ...new Array(17).fill(0), 1]);
    // after the first activation: plan 1 shown only
    expect(queries.playerSkins(head - 1, PA).active).toEqual([1, ...new Array(18).fill(0)]);
    // before any activation: all default
    expect(queries.playerSkins(head - 2, PA).active).toEqual(new Array(19).fill(0));
  });

  test("a batch sets several plans in one event; a later one replaces the whole word", async () => {
    const { queries, head } = await open((node) => {
      node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
      node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
      node.mine([ev.cobblesClaimed(A, 1, 1, DAY + 1, 100, 150)]);
      node.mine([ev.skinBought(A, 1, 2, 60, 90)], [ev.skinBought(A, 2, 1, 70, 20)]);
      // two activations in one block: the second is the whole word, it replaces the first
      node.mine([ev.skinsActivated(A, skinWord([[1, 1]]))], [ev.skinsActivated(A, skinWord([[1, 2], [2, 1]]))]);
    });
    expect(queries.playerSkins(head, PA).active).toEqual([2, 1, ...new Array(17).fill(0)]);
  });

  test("a skin owned in two themes shows either", async () => {
    const { queries, head, indexer } = await open((node) => {
      node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 200, 200)]);
      node.mine([ev.skinBought(A, 1, 1, 50, 150), ev.skinBought(A, 2, 1, 70, 80)]);
      node.mine([ev.skinsActivated(A, skinWord([[1, 2]]))], [ev.skinsActivated(A, skinWord([[1, 1]]))]);
    });
    expect(indexer.status).toBe("ok");
    expect(queries.playerSkins(head, PA).active[0]).toBe(1);
  });

  test("the player route: owned and active", async () => {
    const { indexer } = await open(scenario);
    const answer = respond(indexer, "GET", `/v1/players/${PA}/skins`);
    expect(answer.code).toBe(200);
    expect(answer.body).toMatchObject({
      version: 1,
      player_id: PA,
      owned: [{ theme: 1, plans: [1, 19] }],
      active: [0, ...new Array(17).fill(0), 1],
    });
    expect(respond(indexer, "GET", `/v1/players/${padded(0x777n)}/skins`).body).toMatchObject({ owned: [], active: new Array(19).fill(0) });
    expect(respond(indexer, "GET", `/v1/players/${PA}/skins?x=1`).code).toBe(400);
  });

  test("the halts: a theme the player does not own for a plan, in a plan the batch did not name too", async () => {
    // theme 1 for plan 2: priced, never bought
    await halts(
      (node) => {
        node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
        node.mine([ev.skinsActivated(A, skinWord([[2, 1]]))]);
      },
      /theme 1 for plan 2, which the player does not own/,
    );
    // another player's skin
    await halts(
      (node) => {
        node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
        node.mine([ev.skinsActivated(B, skinWord([[1, 1]]))]);
      },
      /theme 1 for plan 1, which the player does not own/,
    );
    // owned in theme 1, activated in theme 2
    await halts(
      (node) => {
        node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)]);
        node.mine([ev.skinBought(A, 1, 1, 50, 50)]);
        node.mine([ev.skinsActivated(A, skinWord([[1, 2]]))]);
      },
      /theme 2 for plan 1, which the player does not own/,
    );
    // a bought skin and the buy in the same block, in order: fine; the activation before the buy: halt
    await halts(
      (node) => node.mine([...PRICES, ev.cobblesClaimed(A, 1, 1, DAY, 100, 100)], [ev.skinsActivated(A, skinWord([[1, 1]])), ev.skinBought(A, 1, 1, 50, 50)]),
      /which the player does not own/,
    );
  });

  test("theme 0 is always allowed, for a player that owns nothing", async () => {
    const { indexer, queries, head } = await open((node) => node.mine([ev.skinsActivated(A, 0)]));
    expect(indexer.status).toBe("ok");
    expect(queries.playerSkins(head, PA).active).toEqual(new Array(19).fill(0));
  });
});

describe("a reorg takes back the skins", () => {
  test("the new chain is indexed as a fresh index of it", async () => {
    const { node, indexer } = await open(scenario);
    // the last four blocks (the plan 19 buy, the claims, the two activations) are replaced: plan 19 is not bought, plan 2 is
    node.reorg(
      4,
      [
        [[ev.skinBought(A, 1, 2, 60, 90)]],
        [[ev.cobblesClaimed(A, 1, 1, DAY + 1, 5, 95)]],
        [[ev.skinsActivated(A, skinWord([[2, 1]]))]],
      ],
    );
    await settle(indexer);
    const fresh = indexerOf(node);
    await settle(fresh);
    expect(indexer.status).toBe("ok");
    expect(indexer.rewindCount).toBe(1);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    const queries = new Queries(indexer.store);
    expect(queries.playerCobbles(node.tip, PA)).toMatchObject({ cobbles: 95, skins_bought: 2, skins_spent: 110 });
    expect(queries.playerSkins(node.tip, PA)).toMatchObject({ owned: [{ theme: 1, plans: [1, 2] }] });
    expect(queries.playerSkins(node.tip, PA).active[1]).toBe(1);
  });

  test("a price set on the replaced chain is back to the one before", async () => {
    const { node, indexer } = await open((node) => {
      node.mine([...PRICES]);
      node.mine([ev.skinPriced(1, 1, 99)]);
    });
    node.reorg(1, [[[ev.skinPriced(1, 2, 51)]]]);
    await settle(indexer);
    const queries = new Queries(indexer.store);
    expect(queries.skinPrices(node.tip, 1).map((p) => [p.plan, p.cobbles])).toEqual([[1, 50], [2, 51], [19, 100]]);
  });
});
