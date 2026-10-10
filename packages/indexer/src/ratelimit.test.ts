import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { RateLimiter, clientAddress, limiterOf } from "./ratelimit.ts";
import { serve } from "./server.ts";
import { FakeNode, ev } from "./testing/fake-node.ts";
import { indexerOf, settle } from "./testing/setup.ts";

describe("the token bucket", () => {
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };

  test("the burst is allowed, then refused with a wait, then refilled", () => {
    const c = clock();
    const limiter = new RateLimiter({ rate: 2, burst: 3, now: c.now });
    for (let i = 0; i < 3; i++) expect(limiter.take("a")).toEqual({ allowed: true });
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfter: 1 });
    c.advance(400); // 0.8 token
    expect(limiter.take("a")).toMatchObject({ allowed: false, retryAfter: 1 });
    c.advance(100); // 1.0 token
    expect(limiter.take("a")).toEqual({ allowed: true });
    expect(limiter.take("a").allowed).toBe(false);
    c.advance(60_000); // never above the burst
    for (let i = 0; i < 3; i++) expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
  });

  test("Retry-After is whole seconds, rounded up", () => {
    const c = clock();
    const limiter = new RateLimiter({ rate: 1, burst: 1, now: c.now });
    limiter.take("a");
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfter: 1 });
    const slow = new RateLimiter({ rate: 1 / 4, burst: 1, now: c.now });
    slow.take("a");
    expect(slow.take("a")).toEqual({ allowed: false, retryAfter: 4 });
  });

  test("addresses have their own buckets", () => {
    const limiter = new RateLimiter({ rate: 1, burst: 1, now: clock().now });
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("b").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
  });

  test("the cap holds, the oldest address goes first", () => {
    const c = clock();
    const limiter = new RateLimiter({ rate: 1, burst: 1, now: c.now, maxAddresses: 3 });
    for (const a of ["a", "b", "c"]) limiter.take(a);
    limiter.take("a"); // refused, but a is now the most recently used
    limiter.take("d"); // over the cap: b, the oldest, goes
    expect(limiter.size).toBe(3);
    expect(limiter.take("b").allowed).toBe(true); // forgotten: a fresh bucket
    expect(limiter.take("a").allowed).toBe(false); // kept
    for (let i = 0; i < 1000; i++) limiter.take(`flood-${i}`);
    expect(limiter.size).toBe(3);
  });

  test("an idle address is forgotten after the TTL", () => {
    const c = clock();
    const limiter = new RateLimiter({ rate: 1, burst: 1, now: c.now, idleTtlMs: 5000 });
    limiter.take("a");
    c.advance(2000);
    limiter.take("b");
    expect(limiter.size).toBe(2);
    c.advance(3000); // a idle 5 s, b 3 s
    limiter.take("b");
    expect(limiter.size).toBe(1);
  });

  test("rate 0 means no limiter", () => {
    expect(limiterOf({ rate: 0, burst: 20 })).toBeNull();
    expect(limiterOf(undefined)).toBeNull();
    expect(limiterOf({ rate: 1, burst: 1 })).toBeInstanceOf(RateLimiter);
  });
});

describe("the client address", () => {
  test("X-Forwarded-For is trusted from loopback only", () => {
    for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(clientAddress(peer, "203.0.113.7")).toBe("203.0.113.7");
      expect(clientAddress(peer, "203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
      expect(clientAddress(peer, ["2001:db8::1", "10.0.0.1"])).toBe("2001:db8::1");
    }
    expect(clientAddress("127.0.0.1", undefined)).toBe("127.0.0.1");
  });

  test("a spoofed header from a non-loopback peer is ignored", () => {
    expect(clientAddress("198.51.100.9", "203.0.113.7")).toBe("198.51.100.9");
    expect(clientAddress("::ffff:198.51.100.9", "127.0.0.1")).toBe("198.51.100.9");
    expect(clientAddress("2001:db8::2", "203.0.113.7")).toBe("2001:db8::2");
  });

  test("a malformed header falls back to the peer", () => {
    for (const header of ["", "garbage", "999.1.1.1", "1.2.3", "unknown, 203.0.113.7", ", 203.0.113.7"]) {
      expect(clientAddress("127.0.0.1", header)).toBe("127.0.0.1");
    }
  });

  test("an IPv4-mapped address is the IPv4 one", () => {
    expect(clientAddress("::ffff:198.51.100.9", undefined)).toBe("198.51.100.9");
  });
});

describe("the HTTP server", () => {
  let server: ReturnType<typeof serve> | undefined;
  afterEach(() => void server?.close());

  async function start(rate: number, burst: number, now: () => number) {
    const node = new FakeNode();
    node.mine([ev.created(0xa1n, 0x416461)]);
    const indexer = indexerOf(node);
    await settle(indexer);
    server = serve(indexer, {
      allowedOrigins: ["http://localhost:5173"],
      rateLimit: { rate, burst, now },
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return (headers: Record<string, string> = {}, method = "GET", path = "/v1/head") =>
      new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: any }>((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port, method, path, headers }, (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: text ? JSON.parse(text) : null }));
        });
        req.on("error", reject);
        req.end();
      });
  }

  test("the burst, then 429 with Retry-After and CORS headers, then a refill", async () => {
    let t = 0;
    const get = await start(1, 2, () => t);
    const origin = { origin: "http://localhost:5173" };
    expect((await get(origin)).status).toBe(200);
    expect((await get(origin)).status).toBe(200);
    const refused = await get(origin);
    expect(refused.status).toBe(429);
    expect(refused.headers["retry-after"]).toBe("1");
    expect(refused.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(refused.headers["access-control-expose-headers"]).toBe("Retry-After");
    expect(refused.headers["content-type"]).toBe("application/json");
    expect(refused.body).toMatchObject({ version: 1, status: "error", error: "too many requests", state: "ok" });
    expect(refused.body).toHaveProperty("head");
    t += 1000;
    expect((await get(origin)).status).toBe(200);
  });

  test("OPTIONS takes a token like a GET", async () => {
    const get = await start(1, 2, () => 0);
    expect((await get({}, "OPTIONS")).status).toBe(405); // no preflight support, but counted
    expect((await get({}, "OPTIONS")).status).toBe(405);
    expect((await get({}, "OPTIONS")).status).toBe(429);
    expect((await get()).status).toBe(429);
  });

  test("the header from a loopback peer names the client; each has its own bucket", async () => {
    const get = await start(1, 1, () => 0);
    expect((await get({ "x-forwarded-for": "203.0.113.1" })).status).toBe(200);
    expect((await get({ "x-forwarded-for": "203.0.113.1" })).status).toBe(429);
    expect((await get({ "x-forwarded-for": "203.0.113.2" })).status).toBe(200);
    // malformed: counted under the peer, 127.0.0.1
    expect((await get({ "x-forwarded-for": "nonsense" })).status).toBe(200);
    expect((await get()).status).toBe(429);
  });

  test("rate 0 disables the limit", async () => {
    const get = await start(0, 1, () => 0);
    for (let i = 0; i < 30; i++) expect((await get()).status).toBe(200);
  });
});
