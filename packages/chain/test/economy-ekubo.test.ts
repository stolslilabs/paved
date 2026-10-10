/** The pool quote off devnet: Ekubo's quoter behind `PoolQuoter`, with a fake fetch (no test touches the network). */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import { createCodecs, createEconomyCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";
import {
  EKUBO_NETWORKS,
  EKUBO_QUOTER_URL,
  EconomyPoolQuoter,
  EkuboPoolQuoter,
  EkuboQuoteError,
  MAX_SLIPPAGE_BPS,
  createEconomyClient,
  poolQuoterFor,
  resolveEconomyDeployment,
  type PoolQuoter,
} from "../src/economy";
import { FAKE_UNIT, FakeEconomy } from "../src/testing";

const ADDR = { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const USDC = ECON.usdc;
const PAVED = ECON.pavedToken;
const OTHER = "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const MAINNET = EKUBO_NETWORKS.mainnet;
const PLAYER = "0x5";

const economyOn = (network: string) => resolveEconomyDeployment({ base: resolveDeployment({ network, env: { rpcUrl: "http://x", addresses: ADDR } }), env: ECON });

/** A Starknet route node of the quoter, its pool key's tokens sorted as Ekubo sorts them. */
const node = (a: string, b: string) => {
  const [token0, token1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  const fee = "170141183460469235273462165868118016";
  return { pool_key: { token0, token1, fee, tick_spacing: 1000, extension: "0x0" }, sqrt_ratio_limit: "0x1", skip_ahead: 0 };
};

/** A quoter answer with one split per `[in, out, route]`, the total their sum unless given. */
const answer = (splits: Array<[string, string, unknown[]]>, total?: string) => ({
  block_number: 16184397,
  block_hash: "0x84c7",
  total_calculated: total ?? splits.reduce((sum, [, out]) => sum + BigInt(out), 0n).toString(),
  estimated_gas_cost: 4000000,
  price_impact: -0.00001,
  splits: splits.map(([amountIn, amountOut, route]) => ({ amount_specified: amountIn, amount_calculated: amountOut, route })),
});

/** 1.4 USDC (6 decimals) for 17.5 PAVED (18 decimals), through the PAVED/USDC pool. */
const IN = 1_400_000n;
const OUT = 17_500_000_000_000_000_000n;
const direct = () => answer([[IN.toString(), OUT.toString(), [node(USDC, PAVED)]]]);

function fakeFetch(reply: unknown | ((url: string) => unknown), init: { status?: number; json?: boolean } = {}) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const body = typeof reply === "function" ? (reply as (url: string) => unknown)(String(url)) : reply;
    const text = init.json === false ? "<html>" : JSON.stringify(body);
    return new Response(text, { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  });
}

const quoter = (fetch: typeof globalThis.fetch, timeoutMs?: number) => new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch, timeoutMs });

describe("EkuboPoolQuoter: an exact-input quote USDC -> PAVED", () => {
  test("asks <host>/<chain id>/<usdc in>/<USDC>/<PAVED> and returns total_calculated, BigInt, 6 decimals in and 18 out", async () => {
    const fetch = fakeFetch(direct());
    const out = await quoter(fetch).quoteSwap(IN);
    expect(typeof out).toBe("bigint");
    expect(out).toBe(OUT);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${EKUBO_QUOTER_URL}/23448594291968334/1400000/${USDC}/${PAVED}`);
  });

  test("amounts past 2^53 and 2^128 are exact", async () => {
    const big = (1n << 130n) + 7n;
    expect(await quoter(fakeFetch(answer([["1000000000", big.toString(), [node(USDC, PAVED)]]]))).quoteSwap(1_000_000_000n)).toBe(big);
  });

  test("split and multi-hop routes from USDC to PAVED are summed", async () => {
    const reply = answer([
      ["1000000", "12000000000000000000", [node(USDC, PAVED)]],
      ["400000", "5500000000000000000", [node(USDC, OTHER), node(OTHER, PAVED)]],
    ]);
    expect(await quoter(fakeFetch(reply)).quoteSwap(IN)).toBe(OUT);
  });

  test("never caches: each quote is a new request", async () => {
    const fetch = fakeFetch(direct());
    const q = quoter(fetch);
    await q.quoteSwap(IN);
    await q.quoteSwap(IN);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("addresses from the deployment are compared as numbers (the quoter drops leading zeros)", async () => {
    const padded = new EkuboPoolQuoter({ ...MAINNET, usdc: "0x0013", paved: "0x00011", fetch: fakeFetch(direct()) });
    expect(await padded.quoteSwap(IN)).toBe(OUT);
  });
});

describe("EkuboPoolQuoter: anything unexpected is no quote", () => {
  const rejects = async (fetch: typeof globalThis.fetch, pattern: RegExp, usdcIn = IN) => {
    const error = await quoter(fetch).quoteSwap(usdcIn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EkuboQuoteError);
    expect((error as Error).message).toMatch(pattern);
  };

  test("a non-2xx answer", async () => {
    await rejects(fakeFetch({ code: "route_not_found", error: "The URL is not a valid route" }, { status: 404 }), /HTTP 404/);
    await rejects(fakeFetch({ code: "insufficient_liquidity", error: "x" }, { status: 404 }), /HTTP 404/);
    await rejects(fakeFetch(direct(), { status: 503 }), /HTTP 503/);
  });

  test("a failed request", async () => {
    await rejects(vi.fn(async () => Promise.reject(new TypeError("fetch failed"))), /request failed: fetch failed/);
  });

  test("a timeout, even when fetch ignores the abort; the body counts", async () => {
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    const q = new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch: hang as unknown as typeof fetch, timeoutMs: 20 });
    await expect(q.quoteSwap(IN)).rejects.toThrow(/no answer within 20 ms/);
    const slowBody = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) as unknown as Response);
    const q2 = new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch: slowBody, timeoutMs: 20 });
    await expect(q2.quoteSwap(IN)).rejects.toThrow(/no answer within 20 ms/);
    // The abort reaches a fetch that listens.
    let signal: AbortSignal | undefined;
    const listening = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    await expect(new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch: listening, timeoutMs: 20 }).quoteSwap(IN)).rejects.toThrow(/no answer/);
    expect(signal?.aborted).toBe(true);
  });

  test("a malformed body", async () => {
    await rejects(fakeFetch(null, { json: false }), /not JSON/);
    await rejects(fakeFetch([]), /malformed quote/);
    await rejects(fakeFetch({ ...direct(), splits: [] }), /no split/);
    await rejects(fakeFetch({ ...direct(), splits: undefined }), /no split/);
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), []]])), /empty route/);
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [{ swap: {} }]]])), /malformed pool_key/);
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [{ pool_key: { token0: "USDC", token1: PAVED } }]]])), /malformed token0/);
  });

  test("an amount that is not a positive integer, or 0", async () => {
    for (const total of ["0", "-17", "1.5", "1e21", "", " 1"]) await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(USDC, PAVED)]]], total)), /total_calculated/);
    await rejects(fakeFetch({ ...direct(), total_calculated: 17 }), /total_calculated is not a positive integer/);
    await rejects(fakeFetch(answer([[IN.toString(), "0", [node(USDC, PAVED)]]], OUT.toString())), /amount_calculated is 0/);
    await rejects(fakeFetch(answer([["-1400000", OUT.toString(), [node(USDC, PAVED)]]])), /amount_specified is not a positive integer/);
  });

  test("an input amount other than the request's, or splits that do not add up", async () => {
    await rejects(fakeFetch(answer([["1399999", OUT.toString(), [node(USDC, PAVED)]]])), /for 1399999 USDC in, not 1400000/);
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(USDC, PAVED)]]], (OUT + 1n).toString())), /do not add up/);
  });

  test("a route whose first token in is not USDC, or whose last token out is not PAVED", async () => {
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(OTHER, PAVED)]]])), /does not start from USDC/);
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(USDC, OTHER)]]])), /does not end in PAVED/);
    // Swapped tokens: the request is USDC -> PAVED, so an answer for PAVED -> USDC ends in USDC.
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(USDC, PAVED), node(PAVED, USDC)]]])), /does not end in PAVED/);
    // A hop that does not hold the token in hand.
    await rejects(fakeFetch(answer([[IN.toString(), OUT.toString(), [node(USDC, OTHER), node(USDC, PAVED)]]])), /does not chain/);
    // One good split does not save a bad one.
    const mixed = answer([
      ["1000000", "12000000000000000000", [node(USDC, PAVED)]],
      ["400000", "5500000000000000000", [node(USDC, OTHER)]],
    ]);
    await rejects(fakeFetch(mixed), /does not end in PAVED/);
  });

  test("nothing to swap sends no request", async () => {
    const fetch = fakeFetch(direct());
    await rejects(fetch, /nothing to swap/, 0n);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the pool quoter per network", () => {
  const codec = createEconomyCodecs().Economy;
  const provider = { callContract: vi.fn() };

  test("devnet keeps Economy.quote_swap; sepolia and mainnet ask Ekubo with that network's chain id", async () => {
    expect(poolQuoterFor(economyOn("devnet"), provider, codec)).toBeInstanceOf(EconomyPoolQuoter);
    for (const [network, chainId] of [["mainnet", "23448594291968334"], ["sepolia", "393402133025997798000961"]]) {
      const fetch = fakeFetch(direct());
      const q = poolQuoterFor(economyOn(network), provider, codec, { fetch });
      expect(q).toBeInstanceOf(EkuboPoolQuoter);
      expect(await q!.quoteSwap(IN)).toBe(OUT);
      expect(fetch.mock.calls[0][0]).toBe(`${EKUBO_QUOTER_URL}/${chainId}/1400000/${USDC}/${PAVED}`);
    }
    expect(provider.callContract).not.toHaveBeenCalled();
  });

  test("an unknown network has no quoter (fail closed)", () => {
    for (const network of ["", "goerli", "katana", "constructor", "toString", "Mainnet"]) expect(poolQuoterFor(economyOn(network), provider, codec)).toBeNull();
  });

  test("the client picks it: no network but devnet calls Economy.quote_swap", () => {
    const client = (network: string) => createEconomyClient(economyOn(network), new PavedClient(economyOn(network).base, {} as PavedRpc), new FakeEconomy())!;
    expect(client("devnet").poolQuoter).toBeInstanceOf(EconomyPoolQuoter);
    expect(client("mainnet").poolQuoter).toBeInstanceOf(EkuboPoolQuoter);
    expect(client("sepolia").poolQuoter).toBeInstanceOf(EkuboPoolQuoter);
    expect(client("katana").poolQuoter).toBeNull();
  });
});

describe("a purchase on Ekubo's quote", () => {
  const spawned = {
    from_address: ADDR.Daily,
    keys: [hash.getSelectorFromName("GameSpawned"), "0x9", "0x9"],
    data: ["0x1", "0x4e20", "0x1", "0x0"],
  };

  function setup(pool: PoolQuoter | null, network = "mainnet") {
    const deployment = economyOn(network);
    const gameViews = new FakeGameViews();
    gameViews.price = { token: USDC, amount: FAKE_UNIT };
    const rpc = {
      callContract: async () => [],
      getEvents: async () => ({ events: [] }),
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [spawned] }),
    } as unknown as PavedRpc;
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const client = new PavedClient(deployment.base, rpc, createCodecs(), gameViews);
    const econ = createEconomyClient(deployment, client, new FakeEconomy(), pool)!;
    return { econWriter: econ.writer(client.writer({ address: PLAYER, execute }), { now: () => 0 }), execute };
  }

  const request = { stake: 1, confirmedPrice: 2_000_000n, referrer: null };

  test("min_out is Ekubo's quote of burn_quote less the slippage, capped at 5 %; fetched again at send", async () => {
    const burnQuote = (await new FakeEconomy().quote(1)).burnQuote;
    const fetch = fakeFetch(() => answer([[burnQuote.toString(), "10000", [node(USDC, PAVED)]]]));
    const pool = new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch });
    const { econWriter, execute } = setup(pool);
    expect((await econWriter.planPurchase(request)).minOut).toBe(9_900n);
    expect((await econWriter.planPurchase({ ...request, slippageBps: MAX_SLIPPAGE_BPS })).minOut).toBe(9_500n);
    await expect(econWriter.planPurchase({ ...request, slippageBps: MAX_SLIPPAGE_BPS + 1n })).rejects.toThrow(/Slippage is 0 to 500 bps/);
    expect(fetch.mock.calls.every(([url]) => String(url).includes(`/${burnQuote}/`))).toBe(true);
    const before = fetch.mock.calls.length;
    await econWriter.purchase(request);
    expect(fetch.mock.calls.length).toBe(before + 1);
    const [calls] = execute.mock.calls[0] as unknown as [Array<{ entrypoint: string; calldata: string[] }>];
    expect(calls[1].calldata).toEqual(["0x1", "0x0", `0x${(9_900n).toString(16)}`, "0x0"]);
  });

  test("each failure of the Ekubo path refuses the purchase with 'No pool quote: nothing was sent'", async () => {
    const burnQuote = (await new FakeEconomy().quote(1)).burnQuote;
    const ok = (out: string, route = [node(USDC, PAVED)]) => answer([[burnQuote.toString(), out, route]]);
    const hang = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const failures: Array<typeof fetch> = [
      fakeFetch(ok("10000"), { status: 500 }),
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
      hang,
      fakeFetch(null, { json: false }),
      fakeFetch({ ...ok("10000"), total_calculated: "0x2710" }),
      fakeFetch(ok("0")),
      fakeFetch(answer([[(burnQuote + 1n).toString(), "10000", [node(USDC, PAVED)]]])),
      fakeFetch(ok("10000", [node(OTHER, PAVED)])),
      fakeFetch(ok("10000", [node(USDC, OTHER)])),
      // A quote so small that min_out rounds to 0: no slippage protection.
      fakeFetch(ok("1")),
    ];
    for (const fetch of failures) {
      const { econWriter, execute } = setup(new EkuboPoolQuoter({ ...MAINNET, usdc: USDC, paved: PAVED, fetch, timeoutMs: 20 }));
      await expect(econWriter.purchase(request)).rejects.toThrow("No pool quote: nothing was sent");
      expect(execute).not.toHaveBeenCalled();
    }
  });

  test("an unknown network: no quoter, nothing sent", async () => {
    const { econWriter, execute } = setup(undefined as unknown as PoolQuoter, "katana");
    await expect(econWriter.purchase(request)).rejects.toThrow("No pool quote: nothing was sent");
    expect(execute).not.toHaveBeenCalled();
  });
});
