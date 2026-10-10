import { hash } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { EventReader, SPONSORED_DAYS_LIMIT, SPONSORED_FALLBACK_BLOCKS, type EventProvider } from "../src/events";
import { IndexerClient, IndexerError, indexerPlayerId } from "../src/indexer";

const DAILY = "0x2";
const SPONSOR = "0x5";
const OTHER = "0x6";
const DEPLOYED = 7;
const SPONSORED = hash.getSelectorFromName("Sponsored");
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", deployedBlock: DEPLOYED, addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } },
});
const codecs = createCodecs();

const sponsored = (day: number, sponsor: string, amount = 1n) => ({
  keys: [SPONSORED, `0x${day.toString(16)}`],
  data: [sponsor, `0x${amount.toString(16)}`],
  from_address: DAILY,
});

type Filter = Parameters<EventProvider["getEvents"]>[0];

/** A node with `events` (all in one chain order) served in pages of `page`, and a latest block `latest`. */
function node(events: ReturnType<typeof sponsored>[], latest: number, page = 2) {
  const filters: Filter[] = [];
  const provider: EventProvider = {
    async getBlockNumber() {
      return latest;
    },
    async getEvents(filter) {
      filters.push(filter);
      const start = filter.continuation_token ? Number(filter.continuation_token) : 0;
      const chunk = events.slice(start, start + page);
      return start + page < events.length ? { events: chunk, continuation_token: String(start + page) } : { events: chunk };
    },
  };
  return { provider, filters };
}

/** The envelope the indexer wraps its rows in. */
const envelope = (rows: object, behind = 0) => ({ version: 1, status: "ok", head: { number: 50, hash: "0xabc", timestamp: 1000 }, behind, ...rows });
const clientWith = (respond: (url: string) => { status?: number; body: object }) => {
  const urls: string[] = [];
  const fetchFake = async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const { status = 200, body } = respond(url);
    return new Response(JSON.stringify(body), { status });
  };
  return { client: new IndexerClient({ url: "http://indexer.test", fetch: fetchFake as typeof fetch }), urls };
};

describe("IndexerClient.sponsorDays", () => {
  const id = indexerPlayerId(SPONSOR);

  test("asks the route with the padded sponsor id and a limit, and reads the days", async () => {
    const { client, urls } = clientWith(() => ({ body: envelope({ sponsor_id: id, days: [9, 8, 7], next: null }) }));
    const { data } = await client.sponsorDays(SPONSOR, { limit: 30 });
    expect(urls).toEqual([`http://indexer.test/v1/sponsors/${id}/days?limit=30`]);
    expect(data).toEqual({ sponsorId: id, days: [9, 8, 7], next: null });
  });

  test("a page carries `next` for the one after, `before` is sent", async () => {
    const { client, urls } = clientWith(() => ({ body: envelope({ sponsor_id: id, days: [9, 8], next: 8 }) }));
    expect((await client.sponsorDays(SPONSOR, { limit: 2 })).data.next).toBe(8);
    await client.sponsorDays(SPONSOR, { limit: 2, before: 8 });
    expect(urls[1]).toBe(`http://indexer.test/v1/sponsors/${id}/days?limit=2&before=8`);
  });

  test("an answer for another sponsor, unordered, too long or out of range is bad", async () => {
    const kind = async (rows: object, params: { limit?: number } = {}) => {
      const { client } = clientWith(() => ({ body: envelope(rows) }));
      return client.sponsorDays(SPONSOR, params).then(() => "none", (e: IndexerError) => e.kind);
    };
    expect(await kind({ sponsor_id: indexerPlayerId(OTHER), days: [], next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [7, 8], next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [8, 8], next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [9, 8, 7], next: null }, { limit: 2 })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [-1], next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [1e15], next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: "9", next: null })).toBe("bad-response");
    expect(await kind({ sponsor_id: id, days: [], next: "x" })).toBe("bad-response");
  });

  test("an indexer without the route is not-found; one that is not serving is unavailable", async () => {
    const missing = clientWith(() => ({ status: 404, body: { version: 1, status: "error", error: "not found", state: "ok", head: null } }));
    await expect(missing.client.sponsorDays(SPONSOR)).rejects.toMatchObject({ kind: "not-found" });
    const loading = clientWith(() => ({ status: 503, body: { version: 1, status: "loading", head: null } }));
    await expect(loading.client.sponsorDays(SPONSOR)).rejects.toMatchObject({ kind: "unavailable" });
  });

  test("refuses a sponsor that is not a felt and a before above the day bound, without a request", async () => {
    const { client, urls } = clientWith(() => ({ body: envelope({}) }));
    await expect(client.sponsorDays("nope")).rejects.toMatchObject({ kind: "rejected" });
    await expect(client.sponsorDays(SPONSOR, { before: -1 })).rejects.toMatchObject({ kind: "rejected" });
    expect(urls).toEqual([]);
  });
});

describe("EventReader.sponsoredDays", () => {
  test("uses the indexer when it answers, and reads no event", async () => {
    const { provider, filters } = node([], 1_000_000);
    const sponsorDays = vi.fn(async () => ({ data: { days: [9, 8] }, freshness: { kind: "ok" as const } }));
    const days = await new EventReader(provider, deployment, codecs).sponsoredDays(SPONSOR, { sponsorDays });
    expect(days).toEqual([9, 8]);
    expect(sponsorDays).toHaveBeenCalledWith(SPONSOR, { limit: SPONSORED_DAYS_LIMIT });
    expect(filters).toEqual([]);
  });

  test("keeps the first SPONSORED_DAYS_LIMIT days of an answer that is longer", async () => {
    const { provider } = node([], 1_000_000);
    const long = Array.from({ length: 50 }, (_, i) => 100 - i);
    const sponsorDays = async () => ({ data: { days: long }, freshness: { kind: "ok" as const } });
    expect(await new EventReader(provider, deployment, codecs).sponsoredDays(SPONSOR, { sponsorDays })).toEqual(long.slice(0, SPONSORED_DAYS_LIMIT));
  });

  test("falls back to the bounded scan on an indexer error, an indexer behind, or no indexer", async () => {
    const latest = DEPLOYED + SPONSORED_FALLBACK_BLOCKS + 500;
    const failing = async () => {
      throw new IndexerError("unavailable", "Indexer is halted");
    };
    const behind = async () => ({ data: { days: [1] }, freshness: { kind: "behind" as const } });
    for (const indexer of [{ sponsorDays: failing }, { sponsorDays: behind }, null, undefined]) {
      const { provider, filters } = node([sponsored(3, SPONSOR), sponsored(5, OTHER), sponsored(4, SPONSOR), sponsored(3, SPONSOR)], latest);
      const days = await new EventReader(provider, deployment, codecs).sponsoredDays(SPONSOR, indexer);
      expect(days).toEqual([4, 3]);
      expect(filters.length).toBeGreaterThan(0);
      for (const f of filters) expect(f.from_block.block_number).toBe(latest - SPONSORED_FALLBACK_BLOCKS);
    }
  });

  test("the scan never starts below head - range, and never before deployed_block", async () => {
    const reader = (latest: number) => {
      const { provider, filters } = node([], latest);
      return { reader: new EventReader(provider, deployment, codecs), filters };
    };
    const far = reader(5_000_000);
    await far.reader.sponsoredDays(SPONSOR);
    expect(far.filters[0]!.from_block.block_number).toBe(5_000_000 - SPONSORED_FALLBACK_BLOCKS);
    expect(far.filters[0]!.from_block.block_number).toBeGreaterThan(DEPLOYED);

    const young = reader(DEPLOYED + 40); // a network younger than the range: from its deployment
    await young.reader.sponsoredDays(SPONSOR);
    expect(young.filters[0]!.from_block.block_number).toBe(DEPLOYED);
  });

  test("no call ever reads Sponsored since deployed_block on a network older than the range", async () => {
    const { provider, filters } = node(
      Array.from({ length: 5 }, (_, i) => sponsored(i + 1, SPONSOR)),
      DEPLOYED + 10 * SPONSORED_FALLBACK_BLOCKS,
      2,
    );
    const reader = new EventReader(provider, deployment, codecs);
    for (const indexer of [undefined, { sponsorDays: async () => Promise.reject(new Error("down")) }]) {
      filters.length = 0;
      await reader.sponsoredDays(SPONSOR, indexer);
      expect(filters.length).toBe(3); // pages of 2 followed by the continuation token
      expect(filters.some((f) => f.from_block.block_number <= DEPLOYED)).toBe(false);
      expect(filters.map((f) => f.continuation_token)).toEqual([undefined, "2", "4"]);
    }
  });

  test("filters by the Sponsored selector on Daily and returns the newest SPONSORED_DAYS_LIMIT days", async () => {
    const events = Array.from({ length: 45 }, (_, i) => sponsored(i + 1, SPONSOR));
    const { provider, filters } = node(events, 1_000, 100);
    const days = await new EventReader(provider, deployment, codecs).sponsoredDays(SPONSOR);
    expect(days).toEqual(Array.from({ length: SPONSORED_DAYS_LIMIT }, (_, i) => 45 - i));
    expect(filters[0]).toMatchObject({ address: DAILY, to_block: "latest", keys: [[SPONSORED]] });
  });

  test("a provider that cannot say the latest block is refused: the scan is never left unbounded", async () => {
    const getEvents = vi.fn(async () => ({ events: [] }));
    await expect(new EventReader({ getEvents }, deployment, codecs).sponsoredDays(SPONSOR)).rejects.toThrow(/getBlockNumber/);
    expect(getEvents).not.toHaveBeenCalled();
  });

  test("the other reads still start at deployed_block (they are keyed by the day or the player)", async () => {
    const { provider, filters } = node([], 1_000_000);
    await new EventReader(provider, deployment, codecs).sponsorship(5, SPONSOR);
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((f) => f.from_block.block_number === DEPLOYED)).toBe(true);
  });
});
