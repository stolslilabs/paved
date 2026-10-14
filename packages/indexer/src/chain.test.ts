import { describe, expect, test } from "vitest";
import { BadAnswer, CHUNK_SIZE, Chain, RpcError, httpRpc, parseRpcUrl, redact, sameBlock } from "./chain.ts";
import { RateLimited, retryAfterMs } from "./throttle.ts";
import { COLLECTION, ECONOMY, CHALLENGE, FakeNode, SETUP, ev } from "./testing/fake-node.ts";

const chainOf = (node: FakeNode) => new Chain(node.rpc, { challenge: CHALLENGE, setup: SETUP, economy: ECONOMY, collection: COLLECTION });

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

  test("events of the four contracts, in block order, across pages", async () => {
    const node = new FakeNode();
    const many = Array.from({ length: CHUNK_SIZE + 5 }, (_, i) => ev.spawned("challenge", i + 1, 1));
    node.mine(
      many,
      [ev.economySet()],
      [ev.questProgressed(1, 3, 1), ev.tutorialClaimed(1)],
      [ev.spawned("challenge", 999, 1), ev.purchased(999, 1), ev.minted(1, 999)],
    );
    const chain = chainOf(node);
    const events = await chain.events((await chain.header(1))!);
    expect(events).toHaveLength(CHUNK_SIZE + 5 + 1 + 2 + 3);
    expect(events.slice(CHUNK_SIZE + 5).map((e) => [e.source, e.transactionIndex, e.eventIndex])).toEqual([
      ["setup", 1, 0],
      ["setup", 2, 0],
      ["setup", 2, 1],
      ["challenge", 3, 0],
      ["economy", 3, 1],
      ["collection", 3, 2],
    ]);
    expect(node.calls.filter((call) => call === "starknet_getEvents").length).toBe(2 + 1 + 1 + 1); // Challenge's two pages, then one per other contract
  });

  test("an event of another block, of another contract, or without its position is a BadAnswer", async () => {
    const node = new FakeNode();
    node.mine([ev.spawned("challenge", 1, 1)]);
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

describe("the transport's refusals", () => {
  /** A one-route HTTP server answering each POST with the next of `answers`. */
  async function serverOf(answers: { status: number; headers?: Record<string, string>; body: unknown }[]) {
    const { createServer } = await import("node:http");
    const server = createServer((request, response) => {
      request.resume().on("end", () => {
        const answer = answers.shift()!;
        response.writeHead(answer.status, { "content-type": "application/json", ...answer.headers });
        response.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    return { url: `http://127.0.0.1:${address.port}/`, close: () => server.close() };
  }

  test("HTTP 429 and JSON-RPC -32011 are RateLimited, with their Retry-After; the provider's text is never kept", async () => {
    const server = await serverOf([
      { status: 429, headers: { "retry-after": "2" }, body: { error: { code: 429, message: "slow down, key abc" } } },
      { status: 200, body: { jsonrpc: "2.0", id: 2, error: { code: -32011, message: "rate limit, key abc" } } },
      { status: 503, headers: { "retry-after": "7" }, body: { jsonrpc: "2.0", id: 3, error: { code: -32011 } } },
      { status: 200, body: { jsonrpc: "2.0", id: 4, error: { code: 31, message: "Requested page size is too big" } } },
      { status: 500, body: { error: "boom" } },
    ]);
    try {
      const rpc = httpRpc(server.url);
      const first = await rpc("starknet_getEvents", {}).catch((error: unknown) => error);
      expect(first).toBeInstanceOf(RateLimited);
      expect((first as RateLimited).retryAfterMs).toBe(2_000);
      expect((first as Error).message).toBe("starknet_getEvents: rate limited (HTTP 429)");
      const second = await rpc("starknet_getEvents", {}).catch((error: unknown) => error);
      expect(second).toBeInstanceOf(RateLimited);
      expect((second as RateLimited).retryAfterMs).toBeUndefined();
      expect((second as Error).message).not.toContain("abc");
      expect(((await rpc("starknet_getEvents", {}).catch((error: unknown) => error)) as RateLimited).retryAfterMs).toBe(7_000);
      const page = await rpc("starknet_getEvents", {}).catch((error: unknown) => error);
      expect(page).toBeInstanceOf(RpcError);
      expect((page as RpcError).pageSizeTooBig).toBe(true);
      await expect(rpc("starknet_getEvents", {})).rejects.toThrow("starknet_getEvents: HTTP 500");
    } finally {
      server.close();
    }
  });

  test("a page refusal is known by code 31, or by a text that says so, never kept", () => {
    expect(new RpcError("m", { code: 31 }).pageSizeTooBig).toBe(true);
    expect(new RpcError("m", { code: -32602, message: "Invalid params: chunk_size exceeds the maximum of 1024" }).pageSizeTooBig).toBe(true);
    expect(new RpcError("m", { code: -32602, message: "Page size too large" }).pageSizeTooBig).toBe(true);
    expect(new RpcError("m", { code: -32602, message: "Invalid block id" }).pageSizeTooBig).toBe(false);
    expect(new RpcError("m", { code: -32005, message: "Too many blocks in range" }).pageSizeTooBig).toBe(false);
    expect(new RpcError("m", { code: -32602, message: "Page size too large" }).message).toBe("m: JSON-RPC error -32602");
  });

  test("Retry-After: seconds or an HTTP date", () => {
    expect(retryAfterMs("3")).toBe(3_000);
    expect(retryAfterMs(" 0 ")).toBe(0);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(retryAfterMs("soon")).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});
