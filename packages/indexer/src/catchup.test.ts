// The catch-up by range (indexer.ts, `catchUp`): in the final zone it must leave every table as block-by-block does.
import { describe, expect, test } from "vitest";
import { Chain } from "./chain.ts";
import { Indexer } from "./indexer.ts";
import { Store } from "./store.ts";
import { CHALLENGE, COLLECTION, ECONOMY, FakeNode, SETUP, ev } from "./testing/fake-node.ts";
import { CONFIG, settle } from "./testing/setup.ts";

const DAY = 86400;
const ADA = 0xa1n;
const BO = 0xb2n;
const CY = 0xc3n;

const chainOf = (node: FakeNode) =>
  new Chain(node.rpc, { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION });

/**
 * An indexer at depth l1: `range` 0 reads block by block, else by ranges of up to `range` blocks; `concurrency` blocks
 * read at once above the L1 block (I2).
 */
const indexerOf = (node: FakeNode, range: number, concurrency = 1) =>
  new Indexer({ chain: chainOf(node), store: new Store(":memory:"), config: CONFIG, depth: "l1", range, concurrency });

/** The calls the indexer made through its Chain, all methods. */
const callsOf = (indexer: Indexer) => Object.values(indexer.chain.calls).reduce((a, b) => a + b, 0);

/**
 * A chain over several UTC days: paid games spawned (spawn, purchase and mint in one transaction, as Lobby.spawn), quests
 * progressed, games over on their day, empty blocks, a night with no block, and a gap of three days in one block.
 */
function history(node = new FakeNode(0), start = 100 * DAY - 400, firstGame = 1) {
  node.time = Math.max(node.time, start);
  node.interval = 37;
  if (node.blocks.length === 0) {
    node.mine();
    node.mine([ev.economySet()], [ev.collectionSet()], [ev.questDefined(1)]);
  }
  let game = firstGame - 1;
  const day = () => Math.floor(node.time / DAY);
  const play = (player: bigint, score: number) => {
    const id = ++game;
    node.mine([ev.spawned("challenge", id, player, { day: day() }), ev.purchased(id, player, { day: day() }), ev.minted(player, id)]);
    node.mine([ev.questProgressed(player, 1, 1)], [ev.over("challenge", id, player, score, { day: day() })]);
  };
  for (let round = 0; round < 6; round++) {
    play(ADA, 10 + round);
    play(BO, 30 - round);
    for (let i = 0; i < 5; i++) node.mine();
    play(CY, 20);
    node.time += round === 2 ? 3 * DAY : 9_000; // a gap of days in one block, else a night
    for (let i = 0; i < 4; i++) node.mine();
  }
  return node;
}

describe("the catch-up by range", () => {
  test("leaves every table as block by block does, whatever the span and the L1 block", async () => {
    for (const span of [1, 2, 7, 50, 10_000]) {
      for (const lag of [0, 3, 40]) {
        const node = history();
        node.l1Accepted = node.tip - lag;
        const blockwise = indexerOf(node, 0);
        const ranged = indexerOf(node, span);
        await settle(blockwise);
        await settle(ranged);
        expect(ranged.status, `span ${span}, lag ${lag}`).toBe("ok");
        expect(ranged.served?.number).toBe(node.tip);
        expect(ranged.store.dump(), `span ${span}, lag ${lag}`).toEqual(blockwise.store.dump());
        expect(blockwise.store.dump().podium.length).toBeGreaterThan(3);
        if (span >= 50 && lag === 0) expect(callsOf(ranged) * 4).toBeLessThan(callsOf(blockwise));
      }
    }
  });

  test("the handover: more blocks, the L1 block moving up, and a replaced tip above it", async () => {
    const node = history();
    node.l1Accepted = node.tip - 10;
    const blockwise = indexerOf(node, 0);
    const ranged = indexerOf(node, 25);
    await settle(blockwise);
    await settle(ranged);
    history(node, node.time + DAY, 100); // the same rounds again, a day later
    node.l1Accepted = node.tip - 5;
    await settle(blockwise);
    await settle(ranged);
    expect(ranged.store.dump()).toEqual(blockwise.store.dump());
    node.reorg(3, [[[ev.spawned("challenge", 999, ADA)]], [], []]);
    await settle(blockwise);
    await settle(ranged);
    expect([blockwise.reason, ranged.reason]).toEqual(["", ""]);
    expect(ranged.rewindCount).toBe(1);
    expect(ranged.store.dump()).toEqual(blockwise.store.dump());
    expect(ranged.store.dump().games.some((g) => g.game_id === 999)).toBe(true);
  });

  test("I2: concurrency 1 and 8 leave the same tables, by range and block by block, through a handover and a reorg", async () => {
    const node = history();
    node.l1Accepted = node.tip - 30;
    const subjects = [0, 25].flatMap((range) => [1, 8].map((concurrency) => indexerOf(node, range, concurrency)));
    const [reference, ...others] = subjects;
    const same = async (label: string) => {
      for (const subject of subjects) await settle(subject);
      for (const [index, subject] of others.entries()) {
        expect(subject.reason, `${label}, subject ${index + 1}`).toBe("");
        expect(subject.store.dump(), `${label}, subject ${index + 1}`).toEqual(reference!.store.dump());
      }
      expect(reference!.served?.number).toBe(node.tip);
    };
    await same("first catch-up");
    history(node, node.time + DAY, 100);
    node.l1Accepted = node.tip - 50;
    await same("more blocks");
    node.reorg(4, [[[ev.spawned("challenge", 999, ADA)]], [], [], [], []]);
    await same("a reorg above the L1 block");
    for (const subject of subjects) expect(subject.rewindCount).toBe(1);
    expect(reference!.store.dump().games.some((g) => g.game_id === 999)).toBe(true);
  });

  test("R1: a page boundary inside one block's events keeps the per-block order", async () => {
    const node = new FakeNode(2);
    // Block 2: five events of Challenge across three transactions, interleaved with Economy's; pages of 2 cut inside it.
    node.mine(
      [ev.spawned("challenge", 1, ADA), ev.purchased(1, ADA), ev.spawned("challenge", 2, BO)],
      [ev.purchased(2, BO), ev.spawned("challenge", 3, CY), ev.purchased(3, CY)],
      [ev.over("challenge", 1, ADA, 7), ev.over("challenge", 2, BO, 9)],
    );
    node.mine([ev.spawned("challenge", 4, ADA)]);
    node.l1Accepted = node.tip;
    const chain = chainOf(node);
    chain.rangeChunkSize = 2;
    const position = (e: { source: string; transactionIndex: number; eventIndex: number }) => [e.source, e.transactionIndex, e.eventIndex];
    const ranged = (await chain.rangeEvents(0, node.tip)).filter((e) => e.block === 2);
    const blockwise = await chain.events((await chain.header(2))!);
    expect(ranged.map(position)).toEqual(blockwise.map(position));
    expect(ranged.filter((e) => e.source === "challenge")).toHaveLength(5);
    const reference = indexerOf(node, 0);
    const paged = indexerOf(node, 10_000);
    paged.chain.rangeChunkSize = 2;
    await settle(reference);
    await settle(paged);
    expect(paged.store.dump()).toEqual(reference.store.dump());
  });

  test("R1: a page refusal is known by its text too, or by a refusal that persists at one block", async () => {
    for (const refusal of [
      { code: -32602, message: "Invalid params: requested page size is too big, the maximum is 100" },
      { code: -32603, message: "Internal error" }, // neither the code nor the text: the span of 1 says it
    ]) {
      const node = history();
      node.l1Accepted = node.tip;
      node.maxChunk = 100;
      node.pageRefusal = refusal;
      const logs: string[] = [];
      const reference = indexerOf(node, 0);
      const ranged = new Indexer({
        chain: chainOf(node),
        store: new Store(":memory:"),
        config: CONFIG,
        depth: "l1",
        range: 64,
        log: (message) => logs.push(message),
      });
      await settle(reference);
      await settle(ranged);
      expect(ranged.status, refusal.message).toBe("ok");
      expect(ranged.store.dump(), refusal.message).toEqual(reference.store.dump());
      expect(ranged.chain.rangeChunkSize).toBe(64);
      if (refusal.code === -32602) expect(logs.some((line) => line.includes("blocks at a time"))).toBe(false);
      else expect(logs.some((line) => line.includes("pages of 512 events"))).toBe(true);
    }
  });

  test("two contracts' events interleaved in one block keep the block's order", async () => {
    const node = new FakeNode(2);
    node.mine(
      [ev.questProgressed(ADA, 1, 1), ev.spawned("challenge", 1, ADA), ev.purchased(1, ADA), ev.minted(ADA, 1)],
      [ev.purchased(2, BO), ev.spawned("challenge", 2, BO), ev.questProgressed(BO, 1, 1), ev.minted(BO, 2)],
    );
    node.mine();
    const chain = chainOf(node);
    const ranged = await chain.rangeEvents(0, node.tip);
    const blockwise = await chain.events((await chain.header(2))!);
    const position = (e: { source: string; transactionIndex: number; eventIndex: number }) => [e.source, e.transactionIndex, e.eventIndex];
    expect(ranged.map(position)).toEqual(blockwise.map(position));
    expect(ranged.map(position)).toEqual([
      ["setup", 0, 0],
      ["challenge", 0, 1],
      ["economy", 0, 2],
      ["collection", 0, 3],
      ["economy", 1, 0],
      ["challenge", 1, 1],
      ["setup", 1, 2],
      ["collection", 1, 3],
    ]);
  });

  test("a day boundary inside a range: its close and podium, from a few headers", async () => {
    const node = new FakeNode(0);
    node.time = 100 * DAY - 2_000;
    node.interval = 10;
    node.mine();
    node.mine();
    node.mine([ev.spawned("challenge", 1, ADA, { day: 99 })]);
    node.mine([ev.over("challenge", 1, ADA, 42, { day: 99 })]);
    for (let i = 0; i < 1_000; i++) node.mine(); // day 100 starts 200 blocks in
    node.l1Accepted = node.tip;
    const blockwise = indexerOf(node, 0);
    const ranged = indexerOf(node, 10_000);
    await settle(blockwise);
    await settle(ranged);
    const dump = ranged.store.dump();
    expect(dump).toEqual(blockwise.store.dump());
    expect(dump.day_closes).toHaveLength(1);
    const close = dump.day_closes[0]!;
    expect(Number(close.prev_time)).toBeLessThan(100 * DAY);
    expect(Number(close.time)).toBeGreaterThanOrEqual(100 * DAY);
    expect(dump.podium).toEqual([{ day_id: 99, player_id: expect.any(String), rank: 1, day_end: 100 * DAY, close_block: close.block }]);
    // The edge, the first block, the two event blocks, and a binary search: far fewer than the 1,000 blocks.
    expect(ranged.chain.calls.starknet_getBlockWithTxHashes).toBeLessThan(40);
  });

  test("an empty range stores its edge only, and serves it", async () => {
    const node = new FakeNode(500);
    node.l1Accepted = node.tip;
    const ranged = indexerOf(node, 10_000);
    await settle(ranged);
    expect(ranged.served?.number).toBe(node.tip);
    expect(ranged.store.dump().blocks.map((b) => b.number)).toEqual([node.tip]);
    expect(ranged.chain.calls.starknet_getEvents).toBe(4);
    expect(callsOf(ranged)).toBeLessThan(20);
  });

  test("a continuation token: a range read across pages", async () => {
    const node = new FakeNode(2);
    for (let id = 1; id <= 9; id++) node.mine([ev.spawned("challenge", id, ADA)], [ev.purchased(id, ADA)]);
    node.l1Accepted = node.tip;
    const blockwise = indexerOf(node, 0);
    const ranged = indexerOf(node, 10_000);
    ranged.chain.rangeChunkSize = 2;
    await settle(blockwise);
    await settle(ranged);
    expect(ranged.store.dump()).toEqual(blockwise.store.dump());
    // Challenge's and Economy's 9 events in 5 pages each, one page each for Setup and Collection.
    expect(ranged.chain.calls.starknet_getEvents).toBe(5 + 1 + 5 + 1);
  });

  test("a range the node refuses as too many blocks is halved, not failed; a page too big is halved too", async () => {
    const node = history();
    node.l1Accepted = node.tip;
    node.maxSpan = 6;
    node.maxChunk = 100;
    const logs: string[] = [];
    const blockwise = indexerOf(node, 0);
    const ranged = new Indexer({
      chain: chainOf(node),
      store: new Store(":memory:"),
      config: CONFIG,
      depth: "l1",
      range: 64,
      log: (message) => logs.push(message),
    });
    await settle(blockwise);
    await settle(ranged);
    expect(ranged.status).toBe("ok");
    expect(ranged.store.dump()).toEqual(blockwise.store.dump());
    expect(ranged.chain.rangeChunkSize).toBe(64);
    expect(logs.some((line) => line.includes("reading 32 blocks at a time"))).toBe(true);
  });

  test("a numeric depth, or no L1 block yet, reads block by block", async () => {
    for (const depth of [1000, "l1"] as const) {
      const node = history();
      const indexer = new Indexer({ chain: chainOf(node), store: new Store(":memory:"), config: CONFIG, depth, range: 10_000 });
      await settle(indexer);
      expect(indexer.chain.calls.starknet_getEvents).toBe(4 * (node.tip - CONFIG.from + 1));
    }
  });
});
