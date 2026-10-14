// The tail read concurrently (I2, indexer.ts `ahead`): a window of blocks read in parallel and applied in order must leave
// the tables a fresh indexer makes of the final chain, whatever the node does during the window, and a rate limit must
// be waited out, never turned into a wrong answer or a skipped block.
import { describe, expect, test } from "vitest";
import { Chain, type Rpc } from "./chain.ts";
import { Indexer } from "./indexer.ts";
import { Halt, Store } from "./store.ts";
import { CHALLENGE, COLLECTION, ECONOMY, FakeNode, SETUP, ev } from "./testing/fake-node.ts";
import { CONFIG, settle } from "./testing/setup.ts";
import { MAX_WAIT_MS, RateLimited, Throttle } from "./throttle.ts";

const ADDRESSES = { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION };

/** A clock that only moves when the throttle sleeps: no real waits. */
function fakeClock() {
  const clock = { now: 0, sleeps: [] as number[] };
  return {
    clock,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.now += ms;
    },
    now: () => clock.now,
  };
}

/** An indexer at a numeric depth (block by block everywhere), `concurrency` blocks at once. */
function indexerOf(node: FakeNode, concurrency: number, rpc: Rpc = node.rpc, throttle?: Throttle) {
  return new Indexer({
    chain: new Chain(rpc, ADDRESSES, throttle ?? new Throttle({ max: concurrency })),
    store: new Store(":memory:"),
    config: CONFIG,
    depth: 1000,
    concurrency,
    recheck: { depth: 10, everyMs: 0 },
  });
}

/** Games and their events over `rounds` blocks pairs, with empty blocks between. */
function chainOf(node = new FakeNode(2), rounds = 12, firstGame = 1) {
  for (let round = 0; round < rounds; round++) {
    const id = firstGame + round;
    node.mine([ev.spawned("challenge", id, 0xa1n + BigInt(round % 3)), ev.purchased(id, 0xa1n + BigInt(round % 3))]);
    node.mine();
    node.mine([ev.over("challenge", id, 0xa1n + BigInt(round % 3), 10 + round)]);
  }
  return node;
}

/**
 * Steps until idle or halted as the process's loop does (Indexer.run): a step that fails (a block replaced between its
 * header and its events is read by a hash the node no longer has) is retried. Returns the failed steps.
 */
async function follow(subject: Indexer): Promise<number> {
  let failed = 0;
  for (let i = 0; i < 1000; i++) {
    try {
      if (!(await subject.step())) return failed;
    } catch (error) {
      if (error instanceof Halt) return subject.halt(error.message), failed;
      failed++;
    }
  }
  throw new Error("did not settle");
}

/** The tables a fresh indexer, one block after the other, makes of the node's chain now. */
async function fresh(node: FakeNode) {
  const reference = indexerOf(node, 1);
  await settle(reference);
  expect(reference.reason).toBe("");
  return reference.store.dump();
}

describe("the tail read concurrently", () => {
  test("concurrency 1 and 8 give the same tables, with the calls per block of block by block", async () => {
    const node = chainOf();
    const one = indexerOf(node, 1);
    const eight = indexerOf(node, 8);
    await settle(one);
    await settle(eight);
    expect(eight.store.dump()).toEqual(one.store.dump());
    expect(eight.served?.number).toBe(node.tip);
    expect(eight.chain.calls.starknet_getEvents).toBe(one.chain.calls.starknet_getEvents);
    expect(eight.chain.calls.starknet_getBlockWithTxHashes).toBeLessThanOrEqual(one.chain.calls.starknet_getBlockWithTxHashes! + 4);
  });

  test("the reads of a window are in flight together, at most `concurrency` of them", async () => {
    const node = chainOf();
    let inFlight = 0;
    let most = 0;
    const rpc: Rpc = async (method, params) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return node.rpc(method, params);
    };
    const indexer = indexerOf(node, 8, rpc);
    await settle(indexer);
    expect(indexer.store.dump()).toEqual(await fresh(node));
    expect(most).toBe(8);
  });

  for (const sameHash of [false, true]) {
    test(`a block replaced inside a window is rewound: nothing applied twice, nothing skipped${sameHash ? " (devnet: the same hashes)" : ""}`, async () => {
      for (const at of [35, 41, 60, 90]) { // getEvents calls: the first window (8 blocks, 4 each) is applied before 33
        const node = chainOf();
        const indexer = indexerOf(node, 8);
        let events = 0;
        let done = false;
        node.beforeCall = (method) => {
          if (done || method !== "starknet_getEvents" || ++events < at) return;
          done = true;
          // Every block from the stored tip's parent up is replaced, the window in flight among them.
          const from = Math.max(1, (indexer.store.tip()?.number ?? 1) - 1);
          node.reorg(
            node.tip - from + 1,
            Array.from({ length: node.tip - from + 3 }, (_, i) => (i % 2 ? [] : [[ev.spawned("challenge", 500 + i, 0xd4n)]])),
            sameHash,
          );
        };
        expect(await follow(indexer)).toBeLessThanOrEqual(1);
        expect(done).toBe(true);
        expect(indexer.rewindCount, `at ${at}`).toBe(1);
        expect(indexer.reason, `at ${at}`).toBe("");
        expect(indexer.served?.number, `at ${at}`).toBe(node.tip);
        expect(indexer.store.dump(), `at ${at}`).toEqual(await fresh(node));
      }
    });
  }

  test("the tip moving during a window: up (new blocks are read at the next step), and down (a block gone ends the window)", async () => {
    const node = chainOf();
    const indexer = indexerOf(node, 8);
    let events = 0;
    node.beforeCall = (method) => {
      if (method !== "starknet_getEvents") return;
      events++;
      if (events % 7 === 0 && events < 200) node.mine([ev.spawned("challenge", 200 + events, 0xe5n)]);
      if (events === 30) node.reorg(5, [[]]); // four blocks fewer, one of them in the window
    };
    await follow(indexer);
    node.beforeCall = null;
    await settle(indexer);
    expect(indexer.reason).toBe("");
    expect(indexer.served?.number).toBe(node.tip);
    expect(indexer.store.dump()).toEqual(await fresh(node));
  });

  test("a block above the node's tip is never asked for", async () => {
    const node = chainOf(new FakeNode(2), 2);
    const asked: number[] = [];
    node.beforeCall = (method, params) => {
      const id = (params as { block_id?: { block_number?: number } }).block_id;
      if (method === "starknet_getBlockWithTxHashes" && typeof id?.block_number === "number") asked.push(id.block_number);
    };
    const indexer = indexerOf(node, 8);
    await settle(indexer);
    expect(Math.max(...asked)).toBe(node.tip);
  });
});

describe("the node's rate limits", () => {
  test("a 429 with Retry-After is waited, then retried, with the same result", async () => {
    const node = chainOf();
    const { clock, sleep, now } = fakeClock();
    let calls = 0;
    const rpc: Rpc = async (method, params) => {
      if (++calls === 10) throw new RateLimited(method, "HTTP 429", 2_000);
      return node.rpc(method, params);
    };
    const throttle = new Throttle({ max: 8, sleep, now });
    const indexer = indexerOf(node, 8, rpc, throttle);
    await settle(indexer);
    expect(indexer.reason).toBe("");
    expect(indexer.store.dump()).toEqual(await fresh(node));
    expect(throttle.refusals).toBe(1);
    expect(clock.sleeps[0]).toBe(2_000);
    expect(throttle.limit).toBe(8); // lowered to 4, raised back by the successes after it
  });

  test("repeated 429s lower the reads in flight to one, every refusal is waited (no hot loop), and nothing is lost", async () => {
    const node = chainOf();
    const { clock, sleep, now } = fakeClock();
    let calls = 0;
    let inFlight = 0;
    const flights: number[] = [];
    const limits: number[] = [];
    const throttle = new Throttle({ max: 8, sleep, now });
    const rpc: Rpc = async (method, params) => {
      calls++;
      limits.push(throttle.limit);
      if (calls < 300 && calls % 4 === 0) throw new RateLimited(method, "JSON-RPC -32011");
      flights.push(++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
      return node.rpc(method, params);
    };
    const indexer = indexerOf(node, 8, rpc, throttle);
    await settle(indexer);
    expect(indexer.reason).toBe("");
    expect(indexer.store.dump()).toEqual(await fresh(node));
    expect(throttle.refusals).toBe(Math.floor(299 / 4));
    expect(Math.min(...limits)).toBe(1);
    expect(clock.sleeps.length).toBeGreaterThanOrEqual(throttle.refusals); // each refusal waited before its retry
    expect(clock.sleeps.every((ms) => ms > 0 && ms <= MAX_WAIT_MS)).toBe(true);
    expect(Math.max(...flights)).toBeLessThanOrEqual(8);
  });

  test("a call refused every time waits longer each time, at most 30 s, and fails after its attempts", async () => {
    const { clock, sleep, now } = fakeClock();
    const throttle = new Throttle({ max: 4, sleep, now, attempts: 9 });
    let sent = 0;
    await expect(
      throttle.run(async () => {
        sent++;
        throw new RateLimited("starknet_getEvents", "HTTP 429");
      }),
    ).rejects.toBeInstanceOf(RateLimited);
    expect(sent).toBe(9);
    // Each wait is the refused call's own sleep; the pause it set is over when it acquires again.
    expect(clock.sleeps).toEqual([500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(throttle.limit).toBe(1);
    const capped = new Throttle({ max: 1, sleep, now });
    clock.sleeps.length = 0;
    let first = true;
    expect(
      await capped.run(async () => {
        if (first) {
          first = false;
          throw new RateLimited("starknet_getEvents", "HTTP 429", 120_000);
        }
        return "read";
      }),
    ).toBe("read");
    expect(clock.sleeps).toEqual([MAX_WAIT_MS]);
  });

  test("another error is not retried", async () => {
    const throttle = new Throttle({ max: 2 });
    let sent = 0;
    await expect(
      throttle.run(async () => {
        sent++;
        throw new Error("starknet_getEvents: HTTP 500");
      }),
    ).rejects.toThrow("HTTP 500");
    expect(sent).toBe(1);
  });
});
