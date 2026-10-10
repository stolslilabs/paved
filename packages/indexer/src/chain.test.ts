import { describe, expect, test } from "vitest";
import { BadAnswer, CHUNK_SIZE, Chain, RpcError, parseRpcUrl, redact, sameBlock } from "./chain.ts";
import { ACCOUNT, COLLECTION, ECONOMY, DAILY, FakeNode, TUTORIAL, ev } from "./testing/fake-node.ts";

const chainOf = (node: FakeNode) => new Chain(node.rpc, { daily: DAILY, tutorial: TUTORIAL, account: ACCOUNT, economy: ECONOMY, collection: COLLECTION });

describe("the URL", () => {
  test("only http(s) is accepted, and a log never holds any part of it", () => {
    expect(parseRpcUrl("https://rpc.example.com/key")).not.toBeNull();
    expect(parseRpcUrl("ws://x")).toBeNull();
    expect(parseRpcUrl("nope")).toBeNull();
    const text = redact("https://secret-key.rpc.example.com/v1/secret");
    expect(text).toMatch(/^rpc [0-9a-f]{8}$/);
    expect(text).not.toContain("secret");
  });
});

describe("the reader", () => {
  test("the tip, the headers, the chain id and the L1 block", async () => {
    const node = new FakeNode(3);
    const chain = chainOf(node);
    expect((await chain.tip()).number).toBe(2);
    expect((await chain.header(1))?.parent).toBe((await chain.header(0))?.hash);
    expect(await chain.header(9)).toBeNull();
    expect(await chain.chainId()).toBe("0x534e5f5345504f4c4941");
    expect(await chain.l1Accepted()).toBeNull();
    node.l1Accepted = 1;
    expect(await chain.l1Accepted()).toBe(1);
  });

  test("an accepted block without its commitments, its parent or its time is a BadAnswer", async () => {
    const node = new FakeNode(2);
    const chain = chainOf(node);
    for (const field of ["transaction_commitment", "parent_hash", "timestamp"]) {
      node.tamper = (method, _params, result) =>
        method === "starknet_getBlockWithTxHashes" ? { ...(result as object), [field]: null } : result;
      await expect(chain.header(1)).rejects.toBeInstanceOf(BadAnswer);
    }
    node.tamper = (method, _params, result) =>
      method === "starknet_getBlockWithTxHashes" ? { ...(result as object), block_number: 7 } : result;
    await expect(chain.header(1)).rejects.toBeInstanceOf(BadAnswer);
    node.tamper = (method, _params, result) =>
      method === "starknet_getBlockWithTxHashes" ? { ...(result as object), status: "PRE_CONFIRMED" } : result;
    expect(await chain.header(1)).toBeNull();
  });

  test("events of the five contracts, in block order, across pages", async () => {
    const node = new FakeNode();
    const many = Array.from({ length: CHUNK_SIZE + 5 }, (_, i) => ev.spawned("daily", i + 1, 1));
    node.mine(
      many,
      [ev.created(1, 2)],
      [ev.spawned("tutorial", 1, 1), ev.built("tutorial", 1)],
      [ev.spawned("daily", 999, 1), ev.purchased(999, 1), ev.minted(1, 999)],
    );
    const chain = chainOf(node);
    const events = await chain.events((await chain.header(1))!);
    expect(events).toHaveLength(CHUNK_SIZE + 5 + 1 + 2 + 3);
    expect(events.slice(CHUNK_SIZE + 5).map((e) => [e.source, e.transactionIndex, e.eventIndex])).toEqual([
      ["account", 1, 0],
      ["tutorial", 2, 0],
      ["tutorial", 2, 1],
      ["daily", 3, 0],
      ["economy", 3, 1],
      ["collection", 3, 2],
    ]);
    expect(node.calls.filter((call) => call === "starknet_getEvents").length).toBe(2 + 1 + 1 + 1 + 1); // Daily's two pages, then one per other contract
  });

  test("an event of another block, of another contract, or without its position is a BadAnswer", async () => {
    const node = new FakeNode();
    node.mine([ev.spawned("daily", 1, 1)]);
    const chain = chainOf(node);
    const block = (await chain.header(1))!;
    const tamper = (change: (event: Record<string, unknown>) => void) => {
      node.tamper = (method, _params, result) => {
        if (method !== "starknet_getEvents") return result;
        const page = structuredClone(result) as { events: Record<string, unknown>[] };
        page.events.forEach(change);
        return page;
      };
    };
    tamper((event) => (event.block_number = 9));
    await expect(chain.events(block)).rejects.toBeInstanceOf(BadAnswer);
    tamper((event) => (event.from_address = "0x9999"));
    await expect(chain.events(block)).rejects.toBeInstanceOf(BadAnswer);
    tamper((event) => delete event.event_index);
    await expect(chain.events(block)).rejects.toBeInstanceOf(BadAnswer);
  });

  test("a view call is read at a block hash, and an RPC error carries its code only", async () => {
    const node = new FakeNode(2);
    const chain = chainOf(node);
    await expect(chain.view("daily", "0x1", [], (await chain.header(1))!.hash)).rejects.toBeInstanceOf(RpcError);
    node.views = (address, selector, calldata, blockHash) => [address, selector, ...calldata, blockHash];
    const hash = (await chain.header(1))!.hash;
    expect(await chain.view("daily", "0x2", ["0x3"], hash)).toEqual([BigInt(DAILY), 2n, 3n, BigInt(hash)]);
  });

  test("two blocks of one hash differ by their commitments", async () => {
    const node = new FakeNode(2);
    const chain = chainOf(node);
    const before = (await chain.header(1))!;
    node.reorg(1, [[]], true);
    const after = (await chain.header(1))!;
    expect(after.hash).toBe(before.hash);
    expect(sameBlock(before, after)).toBe(false);
  });
});
