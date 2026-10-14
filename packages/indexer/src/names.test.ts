import { describe, expect, test, vi } from "vitest";
import { padded } from "./events.ts";
import {
  BACKOFF_MS,
  LookupError,
  MAX_BATCH,
  MIN_INTERVAL_MS,
  NO_NAME_TTL_MS,
  NAME_TTL_MS,
  NameResolver,
  cartridgeLookup,
  parseLookup,
  type Lookup,
  namesEnabled,
  type ResolverOptions,
} from "./names.ts";
import { respond } from "./server.ts";
import { Store } from "./store.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

const id = (n: number) => padded(BigInt(n));

/** A resolver over a memory store with a fake lookup and clocks the test moves. */
function setup(lookup: Lookup, options: Partial<ResolverOptions> = {}) {
  const clock = { wall: 1_000_000, mono: 0 };
  const store = new Store(":memory:");
  const log = vi.fn();
  const resolver = new NameResolver({ store, lookup, now: () => clock.wall, mono: () => clock.mono, log, ...options });
  const advance = (ms: number) => {
    clock.wall += ms;
    clock.mono += ms;
  };
  return { resolver, store, clock, advance, log };
}

/** A fake lookup that knows `known` (address -> name) and records its calls. */
function fake(known: Record<string, string>) {
  const calls: string[][] = [];
  const lookup: Lookup = async (addresses) => {
    calls.push([...addresses]);
    return new Map(addresses.filter((a) => known[a]).map((a) => [a, known[a]!]));
  };
  return { lookup, calls };
}

describe("parseLookup", () => {
  const asked = [id(1), id(2)];
  test("an empty list is nobody (what the service answers for non-controllers)", () => {
    expect(parseLookup({ results: [] }, asked).size).toBe(0);
    expect(parseLookup([], asked).size).toBe(0);
  });
  test("items with addresses map by address, padded or not, in any order", () => {
    const found = parseLookup({ results: [{ address: "0x2", username: "bob" }, { address: id(1), name: "alice" }] }, asked);
    expect([...found]).toEqual([[id(2), "bob"], [id(1), "alice"]]);
  });
  test("the observed hit: {username, addresses: [unpadded]}, a miss omitted, in a batch of two", () => {
    const mine = padded("0x25145e3df97549d347388c6b7c5b3c604972399e67fe14a16b320a62c2eb43f");
    const miss = padded("0x1557182e4359a1f0c6301278e8f5b35a776ab58d39892581e357578fb287836");
    const body = { results: [{ username: "bal", addresses: ["0x25145e3df97549d347388c6b7c5b3c604972399e67fe14a16b320a62c2eb43f"] }] };
    expect([...parseLookup(body, [mine, miss])]).toEqual([[mine, "bal"]]);
    // One username may list several addresses; only those asked are taken.
    expect([...parseLookup({ results: [{ username: "x", addresses: ["0x1", "0x9"] }] }, asked)]).toEqual([[id(1), "x"]]);
  });
  test("an address that was not asked is ignored", () => {
    expect(parseLookup({ results: [{ address: id(9), name: "mallory" }] }, asked).size).toBe(0);
  });
  test("a bare array, and items without addresses map by position when as many as asked; null is none", () => {
    expect([...parseLookup([{ username: "alice" }, null], asked)]).toEqual([[id(1), "alice"]]);
    expect([...parseLookup({ results: [{ name: "alice" }, { name: "bob" }] }, asked)]).toEqual([[id(1), "alice"], [id(2), "bob"]]);
  });
  test("results without addresses and not as many as asked cannot be attributed: refused", () => {
    expect(() => parseLookup({ results: [{ name: "alice" }] }, asked)).toThrow(LookupError);
  });
  test("no results list is refused", () => {
    expect(() => parseLookup({ error: "x" }, asked)).toThrow(LookupError);
    expect(() => parseLookup("ok", asked)).toThrow(LookupError);
  });
  test("names are cleaned: control characters, blank, too long", () => {
    const body = [{ address: id(1), name: " al\u0000ice\n" }, { address: id(2), name: "x".repeat(65) }];
    expect([...parseLookup(body, asked)]).toEqual([[id(1), "alice"]]);
    expect(parseLookup([{ address: id(1), name: "  " }, { address: id(2), name: 7 }], asked).size).toBe(0);
  });
});

describe("cartridgeLookup", () => {
  test("posts the addresses as JSON and parses the answer", async () => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify({ results: [{ address: id(1), username: "alice" }] })));
    const found = await cartridgeLookup({ url: "https://names.test/lookup", fetch: doFetch as unknown as typeof fetch })([id(1)], new AbortController().signal);
    expect([...found]).toEqual([[id(1), "alice"]]);
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://names.test/lookup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ addresses: [id(1)] });
  });
  test("an HTTP error throws", async () => {
    const doFetch = vi.fn(async () => new Response("slow down", { status: 429 }));
    await expect(cartridgeLookup({ fetch: doFetch as unknown as typeof fetch })([id(1)], new AbortController().signal)).rejects.toThrow(/429/);
  });
});

describe("namesEnabled", () => {
  test("on for sepolia and mainnet only, off on devnet or a file with no network (fails closed), --no-names always off, --names forces it on", () => {
    expect(namesEnabled({ network: "sepolia" })).toBe(true);
    expect(namesEnabled({ network: "mainnet" })).toBe(true);
    expect(namesEnabled({ network: "devnet" })).toBe(false);
    // A deployment file with no `network` reads as "": not a known public network, so no lookup.
    expect(namesEnabled({ network: "" })).toBe(false);
    expect(namesEnabled({ network: "katana" })).toBe(false);
    expect(namesEnabled({ network: "", names: true })).toBe(true);
    expect(namesEnabled({ network: "sepolia", noNames: true })).toBe(false);
    expect(namesEnabled({ network: "devnet", names: true })).toBe(true);
    expect(namesEnabled({ network: "devnet", names: true, noNames: true })).toBe(false);
  });
});

describe("NameResolver", () => {
  test("addresses in flight are not queued again by a read before the answer lands", async () => {
    let release!: () => void;
    const calls: string[][] = [];
    const lookup: Lookup = (addresses) => {
      calls.push([...addresses]);
      if (calls.length > 1) return Promise.resolve(new Map());
      return new Promise((resolve) => {
        release = () => resolve(new Map([[addresses[0]!, "alice"]]));
      });
    };
    const { resolver, advance } = setup(lookup);
    resolver.read([id(1)]);
    const flying = resolver.flush();
    resolver.read([id(1), id(2)]);
    expect(resolver.queued).toBe(1); // id(2) only
    release();
    await flying;
    advance(MIN_INTERVAL_MS);
    await resolver.flush();
    expect(calls).toEqual([[id(1)], [id(2)]]);
  });

  test("read is the cache only: null for the unknown, which it queues; nothing is fetched", () => {
    const { lookup, calls } = fake({ [id(1)]: "alice" });
    const { resolver } = setup(lookup);
    expect([...resolver.read([id(1), id(2)])]).toEqual([[id(1), null], [id(2), null]]);
    expect(resolver.queued).toBe(2);
    expect(calls).toEqual([]);
  });

  test("a flush looks the queue up in one batch and the names are then served", async () => {
    const { lookup, calls } = fake({ [id(1)]: "alice" });
    const { resolver } = setup(lookup);
    resolver.read([id(1), id(2)]);
    await resolver.flush();
    expect(calls).toEqual([[id(1), id(2)]]);
    expect([...resolver.read([id(1), id(2)])]).toEqual([[id(1), "alice"], [id(2), null]]);
    expect(resolver.queued).toBe(0);
  });

  test("a batch is at most MAX_BATCH addresses; the rest wait for the budget", async () => {
    const { lookup, calls } = fake({});
    const { resolver, advance } = setup(lookup);
    resolver.read(Array.from({ length: MAX_BATCH + 10 }, (_, i) => id(i + 1)));
    await resolver.flush();
    expect(calls.map((c) => c.length)).toEqual([MAX_BATCH]);
    await resolver.flush();
    expect(calls.length).toBe(1);
    advance(MIN_INTERVAL_MS);
    await resolver.flush();
    expect(calls.map((c) => c.length)).toEqual([MAX_BATCH, 10]);
  });

  test("the budget: one request per interval, however often it is flushed or read", async () => {
    const { lookup, calls } = fake({});
    const { resolver, advance } = setup(lookup);
    for (let round = 0; round < 3; round++) {
      resolver.read([id(round + 1)]);
      await resolver.flush();
      await resolver.flush();
      advance(1000);
    }
    expect(calls.length).toBe(1);
    advance(MIN_INTERVAL_MS - 3000);
    await resolver.flush();
    expect(calls.length).toBe(2);
  });

  test("a found name is kept for the TTL, shown stale, and looked up again after it", async () => {
    const { lookup, calls } = fake({ [id(1)]: "alice" });
    const { resolver, advance } = setup(lookup);
    resolver.read([id(1)]);
    await resolver.flush();
    advance(NAME_TTL_MS - 1);
    expect(resolver.read([id(1)]).get(id(1))).toBe("alice");
    expect(resolver.queued).toBe(0);
    advance(1);
    expect(resolver.read([id(1)]).get(id(1))).toBe("alice"); // stale, still shown
    expect(resolver.queued).toBe(1);
    await resolver.flush();
    expect(calls.length).toBe(2);
  });

  test("the negative cache: no username is remembered for the shorter TTL only", async () => {
    const { lookup, calls } = fake({});
    const { resolver, advance } = setup(lookup);
    expect(NO_NAME_TTL_MS).toBeLessThan(NAME_TTL_MS);
    resolver.read([id(1)]);
    await resolver.flush();
    advance(MIN_INTERVAL_MS);
    for (let i = 0; i < 5; i++) resolver.read([id(1)]);
    await resolver.flush();
    expect(calls.length).toBe(1); // not asked again within the negative TTL
    advance(NO_NAME_TTL_MS);
    resolver.read([id(1)]);
    await resolver.flush();
    expect(calls.length).toBe(2);
  });

  test("a failing lookup leaves names null, caches nothing, and backs off (no retry storm)", async () => {
    let fail = true;
    const calls: number[] = [];
    const lookup: Lookup = async (addresses) => {
      calls.push(addresses.length);
      if (fail) throw new LookupError("HTTP 500");
      return new Map([[addresses[0]!, "alice"]]);
    };
    const { resolver, advance, log, store } = setup(lookup);
    resolver.read([id(1)]);
    await resolver.flush();
    expect(resolver.read([id(1)]).get(id(1))).toBeNull();
    expect(store.names([id(1)]).size).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/HTTP 500/));
    // Reads keep queuing it, but the backoff holds the requests back well past the normal interval.
    advance(MIN_INTERVAL_MS);
    await resolver.flush();
    advance(BACKOFF_MS - MIN_INTERVAL_MS - 1);
    await resolver.flush();
    expect(calls.length).toBe(1);
    advance(1);
    fail = false;
    await resolver.flush();
    expect(calls.length).toBe(2);
    expect(resolver.read([id(1)]).get(id(1))).toBe("alice");
  });

  test("consecutive failures double the wait", async () => {
    const calls: number[] = [];
    const lookup: Lookup = async () => {
      calls.push(1);
      throw new Error("down");
    };
    const { resolver, advance } = setup(lookup);
    const attempt = async (after: number) => {
      advance(after);
      resolver.read([id(1)]);
      await resolver.flush();
      return calls.length;
    };
    expect(await attempt(0)).toBe(1);
    expect(await attempt(BACKOFF_MS - 1)).toBe(1);
    expect(await attempt(1)).toBe(2);
    expect(await attempt(2 * BACKOFF_MS - 1)).toBe(2);
    expect(await attempt(1)).toBe(3);
  });

  test("a lookup that never answers is abandoned at the timeout, and the resolver goes on", async () => {
    let signal: AbortSignal | undefined;
    const lookup: Lookup = (_addresses, s) => {
      signal = s;
      return new Promise<never>(() => {});
    };
    const { resolver, log } = setup(lookup, { timeoutMs: 20 });
    resolver.read([id(1)]);
    const started = Date.now();
    await resolver.flush();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(signal?.aborted).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/no answer in 20 ms/));
    expect(resolver.read([id(1)]).get(id(1))).toBeNull();
  });

  test("only one request is in flight at a time", async () => {
    let release!: () => void;
    const calls: number[] = [];
    const lookup: Lookup = (addresses) => {
      calls.push(addresses.length);
      return new Promise((resolve) => {
        release = () => resolve(new Map());
      });
    };
    const { resolver, advance } = setup(lookup);
    resolver.read([id(1)]);
    const first = resolver.flush();
    resolver.read([id(2)]);
    advance(MIN_INTERVAL_MS);
    await resolver.flush();
    expect(calls).toEqual([1]);
    release();
    await first;
  });
});

describe("the routes", () => {
  const A = 0xa1n;
  const B = 0xb2n;
  const DAY = 100;
  async function served() {
    const node = new FakeNode();
    node.mine([], []);
    node.mine([ev.spawned("challenge", 1, A, { day: DAY })], [ev.spawned("challenge", 2, B, { day: DAY })]);
    node.mine([ev.over("challenge", 1, A, 50, { day: DAY, end: 77 })]);
    node.mine([ev.over("challenge", 2, B, 40, { day: DAY, end: 78 })]);
    const indexer = indexerOf(node);
    await settle(indexer);
    return indexer;
  }
  const board = (indexer: Awaited<ReturnType<typeof served>>, names?: NameResolver) =>
    respond(indexer, "GET", "/v1/tournaments/100/leaderboard", undefined, names);
  const named = (body: Record<string, unknown>) =>
    (body.entries as { player_id: string; name: string | null }[]).map((e) => [e.player_id, e.name]);

  test("without a resolver every name is null", async () => {
    const indexer = await served();
    expect(named(board(indexer).body)).toEqual([[padded(A), null], [padded(B), null]]);
  });

  test("names come from the cache, never from a request: null at first, filled after the background lookup", async () => {
    const indexer = await served();
    const { lookup, calls } = fake({ [padded(A)]: "alice" });
    const { resolver } = setup(lookup, { store: indexer.store });
    expect(named(board(indexer, resolver).body)).toEqual([[padded(A), null], [padded(B), null]]);
    expect(calls).toEqual([]);
    await resolver.flush();
    expect(calls).toEqual([[padded(A), padded(B)]]);
    expect(named(board(indexer, resolver).body)).toEqual([[padded(A), "alice"], [padded(B), null]]);
    // The player, and a player's entry, carry it too.
    expect(respond(indexer, "GET", `/v1/players/${padded(A)}`, undefined, resolver).body).toMatchObject({ player: { name: "alice" } });
    expect(respond(indexer, "GET", `/v1/players/${padded(B)}/tournaments/100`, undefined, resolver).body).toMatchObject({ entry: { name: null } });
    expect(respond(indexer, "GET", `/v1/players/${padded(0xeeen)}`, undefined, resolver).body).toMatchObject({ player: null });
  });

  test("a hanging resolver does not slow a route; a failing one does not fail it", async () => {
    const indexer = await served();
    const hanging = setup(() => new Promise<never>(() => {}), { store: indexer.store, timeoutMs: 20 }).resolver;
    const started = Date.now();
    const first = board(indexer, hanging);
    expect(first.code).toBe(200);
    expect(Date.now() - started).toBeLessThan(500);
    await hanging.flush(); // the abandoned lookup
    expect(board(indexer, hanging).code).toBe(200);
    const failing = setup(async () => {
      throw new Error("boom");
    }, { store: indexer.store }).resolver;
    const answer = board(indexer, failing);
    await failing.flush();
    expect(answer.code).toBe(200);
    expect(named(board(indexer, failing).body)).toEqual([[padded(A), null], [padded(B), null]]);
  });

  test("a name that arrives within a block shows at once: the answer cache keeps the unnamed rows", async () => {
    const indexer = await served();
    const { lookup } = fake({ [padded(B)]: "bob" });
    const { resolver } = setup(lookup, { store: indexer.store });
    board(indexer, resolver);
    await resolver.flush();
    // The same block, the answer cache holds the unnamed rows: the name still shows.
    expect(named(board(indexer, resolver).body)).toEqual([[padded(A), null], [padded(B), "bob"]]);
    expect(named(board(indexer).body)).toEqual([[padded(A), null], [padded(B), null]]);
  });
});
