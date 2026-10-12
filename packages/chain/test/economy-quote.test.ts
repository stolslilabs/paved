/**
 * The purchase's pool quote since E-9: `Economy.quote_swap(burn_quote)` on every network, the on-chain quote of the
 * purchase's own route. No quoter API, no fetch. A revert or a failed call sends nothing.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { hash, shortString } from "starknet";
import { createCodecs, createEconomyCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, ViewError } from "../src/views";
import {
  EconomyPoolQuoter,
  POOL_CANNOT_FILL,
  POOL_QUOTE_UNAVAILABLE,
  PoolCannotFillError,
  PoolPriceMovedError,
  PoolQuoteUnavailableError,
  isQuoteRevert,
  createEconomyClient,
  minOutFor,
  poolQuoterFor,
  resolveEconomyDeployment,
  type PoolQuoter,
} from "../src/economy";
import { FAKE_UNIT, FakeEconomy, FakePoolQuoter } from "../src/testing";

const ADDR = { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const PLAYER = "0x5";
const DAY = 20_000;

const economyOn = (network: string) => resolveEconomyDeployment({ base: resolveDeployment({ network, env: { rpcUrl: "http://x", addresses: ADDR } }), env: ECON });

type ContractCall = { contractAddress: string; entrypoint: string; calldata: string[] };

/** A provider whose `quote_swap` answers `answer(usdc_in)` as a u256, or throws what it returns when an Error. */
function quoteProvider(answer: (usdcIn: bigint) => bigint | Error) {
  return vi.fn(async (call: ContractCall) => {
    if (call.entrypoint !== "quote_swap") throw new Error(`unexpected ${call.entrypoint}`);
    const usdcIn = BigInt(call.calldata[0]) + (BigInt(call.calldata[1]) << 128n);
    const out = answer(usdcIn);
    if (out instanceof Error) throw out;
    return [`0x${(out & ((1n << 128n) - 1n)).toString(16)}`, `0x${(out >> 128n).toString(16)}`];
  });
}

/** How a node reports a contract's revert of a view: the reason as the hex of its short string, inside an RPC error. */
const revert = (reason: string) =>
  new Error(`RPC: starknet_call with params {...}\n 40: Contract error: {"revert_error":{"error":"${shortString.encodeShortString(reason)} ('${reason}')"}}`);

function setup(pool: PoolQuoter) {
  const economy = new FakeEconomy();
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const spawned = { from_address: ADDR.Daily, keys: [hash.getSelectorFromName("GameSpawned"), "0x9", "0x9"], data: ["0x1", `0x${DAY.toString(16)}`, "0x1", "0x0"] };
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [spawned] }),
  } as unknown as PavedRpc;
  const deployment = economyOn("devnet");
  const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
  const client = new PavedClient(deployment.base, rpc, createCodecs(), gameViews);
  const econ = createEconomyClient(deployment, client, economy, pool)!;
  const econWriter = econ.writer(client.writer({ address: PLAYER, execute }));
  const minOutSent = () => {
    const calls = (execute.mock.calls as unknown as Array<[ContractCall[]]>).at(-1)![0];
    const spawn = calls.find((c) => c.entrypoint === "spawn")!;
    return BigInt(spawn.calldata[2]) + (BigInt(spawn.calldata[3]) << 128n);
  };
  return { economy, econWriter, execute, minOutSent };
}

const realQuoter = (answer: (usdcIn: bigint) => bigint | Error) => {
  const callContract = quoteProvider(answer);
  return { callContract, quoter: new EconomyPoolQuoter({ callContract }, economyOn("devnet"), createEconomyCodecs().Economy) };
};

afterEach(() => vi.restoreAllMocks());

describe("one quoter, Economy.quote_swap, on every network (E-9)", () => {
  test.each(["devnet", "sepolia", "mainnet"])("%s: the client's quoter calls quote_swap on the deployed Economy, and nothing is fetched", async (network) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const deployment = economyOn(network);
    const callContract = quoteProvider((usdcIn) => usdcIn * 10n);
    const client = new PavedClient(deployment.base, { callContract } as unknown as PavedRpc);
    const quoter = createEconomyClient(deployment, client, new FakeEconomy())!.poolQuoter;
    expect(quoter).toBeInstanceOf(EconomyPoolQuoter);
    expect(await quoter!.quoteSwap(1_400_000n)).toBe(14_000_000n);
    expect(callContract).toHaveBeenCalledWith({ contractAddress: ECON.economy, entrypoint: "quote_swap", calldata: ["0x155cc0", "0x0"] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("an undeployed economy has no quoter (fail closed)", () => {
    const deployment = resolveEconomyDeployment({ base: resolveDeployment({ network: "mainnet", env: { rpcUrl: "http://x", addresses: ADDR } }) });
    expect(poolQuoterFor(deployment, { callContract: vi.fn() }, createEconomyCodecs().Economy)).toBeNull();
  });
});

describe("a quote_swap that reverts: the player reads that the pool cannot fill, nothing is sent", () => {
  const request = { stake: 10, confirmedPrice: 10n * FAKE_UNIT, confirmedMinOut: 1n, referrer: null };

  test.each([
    ["'Economy: partial fill'", revert("Economy: partial fill")],
    ["another router revert", revert("LIMIT_DIRECTION")],
    ["'Economy: wrong delta'", revert("Economy: wrong delta")],
    ["a CONTRACT_ERROR (code 40) whose text names no reason", Object.assign(new Error("RPC: starknet_call with params {}"), { code: 40 })],
  ])("%s", async (_name, error) => {
    const { quoter, callContract } = realQuoter(() => error);
    const { econWriter, execute } = setup(quoter);
    const refused = await econWriter.purchase(request).then(() => null, (e: unknown) => e);
    expect(refused).toBeInstanceOf(PoolCannotFillError);
    expect((refused as Error).message).toBe(`${POOL_CANNOT_FILL} Nothing was sent.`);
    expect(callContract).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  test("the message is plain: no revert text, no hex", () => {
    expect(POOL_CANNOT_FILL).toBe("The pool cannot fill this purchase right now. Try a smaller stake or later.");
    expect(new PoolCannotFillError("0x45636f6e6f6d79").message).not.toContain("0x");
  });
});

describe("a quote that cannot be read (transport, not a revert): 'cannot read the pool quote', nothing is sent", () => {
  const request = { stake: 10, confirmedPrice: 10n * FAKE_UNIT, confirmedMinOut: 1n, referrer: null };

  test.each([
    ["an RPC transport error", new Error("fetch failed: ECONNRESET")],
    ["a rate limit (-32011)", Object.assign(new Error("RPC: starknet_call with params {}\n -32011: Too many requests"), { code: -32011 })],
    ["an HTTP 429", new Error("Too Many Requests (429)")],
    ["a timeout", new Error("The operation was aborted due to timeout")],
  ])("%s", async (_name, error) => {
    const { quoter, callContract } = realQuoter(() => error);
    const { econWriter, execute } = setup(quoter);
    const refused = await econWriter.purchase(request).then(() => null, (e: unknown) => e);
    expect(refused).toBeInstanceOf(PoolQuoteUnavailableError);
    expect(refused).not.toBeInstanceOf(PoolCannotFillError);
    expect((refused as Error).message).toBe(`${POOL_QUOTE_UNAVAILABLE} Nothing was sent.`);
    expect(callContract).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  test("isQuoteRevert: the contract's refusals only, through the ViewError's cause", () => {
    expect(isQuoteRevert(revert("Economy: partial fill"))).toBe(true);
    expect(isQuoteRevert(new ViewError("rpc", "RPC failed", Object.assign(new Error("x"), { code: 40 })))).toBe(true);
    expect(isQuoteRevert(new ViewError("rpc", "fetch failed"))).toBe(false);
    expect(isQuoteRevert(Object.assign(new Error("rate limited"), { code: 429 }))).toBe(false);
  });
});

describe("the min_out the player confirmed is a floor: never sent below it", () => {
  const moved = (paved: bigint) => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved, usdc: 1_000_000n };
    return pool;
  };

  test("a send-time quote lower than the confirmed one: PoolPriceMovedError, nothing sent", async () => {
    const shown = new FakePoolQuoter();
    const { economy } = setup(shown);
    const confirmedMinOut = minOutFor(await shown.quoteSwap((await economy.quote(3)).burnQuote));
    const { econWriter, execute } = setup(moved(79n * 10n ** 18n)); // the pool moved down
    const refused = await econWriter.purchase({ stake: 3, confirmedPrice: 3n * FAKE_UNIT, confirmedMinOut, referrer: null }).then(() => null, (e: unknown) => e);
    expect(refused).toBeInstanceOf(PoolPriceMovedError);
    expect((refused as Error).message).toBe("The pool price moved: confirm again");
    expect((refused as PoolPriceMovedError).confirmed).toBe(confirmedMinOut);
    expect((refused as PoolPriceMovedError).current).toBeLessThan(confirmedMinOut);
    expect(execute).not.toHaveBeenCalled();
  });

  test("an equal or higher one sends, with min_out at least the confirmed one", async () => {
    const shown = new FakePoolQuoter();
    const { economy } = setup(shown);
    const confirmedMinOut = minOutFor(await shown.quoteSwap((await economy.quote(3)).burnQuote));
    for (const pool of [new FakePoolQuoter(), moved(81n * 10n ** 18n)]) {
      const { econWriter, minOutSent } = setup(pool);
      await econWriter.purchase({ stake: 3, confirmedPrice: 3n * FAKE_UNIT, confirmedMinOut, referrer: null });
      expect(minOutSent()).toBeGreaterThanOrEqual(confirmedMinOut);
    }
  });

  test.each([
    ["missing", undefined],
    ["0", 0n],
    ["negative", -1n],
    ["not a bigint", 5 as unknown as bigint],
  ])("a confirmed floor that is %s: refused before any quote, nothing sent", async (_name, confirmedMinOut) => {
    const pool = new FakePoolQuoter();
    const { econWriter, execute } = setup(pool);
    await expect(econWriter.purchase({ stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: confirmedMinOut as bigint, referrer: null })).rejects.toThrow("No confirmed minimum PAVED: confirm again");
    expect(pool.calls).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("min_out from a fresh quote of the purchase's own amount", () => {
  test("rounding: the quote less the slippage, rounded down, never up", async () => {
    expect(minOutFor(10_001n)).toBe(9_900n); // 9,900.99
    expect(minOutFor(101n)).toBe(99n); // 99.99
    expect(minOutFor(10_099n, 500n)).toBe(9_594n); // 9,594.05
    for (const [poolOut, expected] of [[10_001n, 9_900n], [101n, 99n], [3n, 2n]] as const) {
      const { econWriter, minOutSent } = setup(realQuoter(() => poolOut).quoter);
      await econWriter.purchase({ stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null });
      expect(minOutSent()).toBe(expected);
    }
  });

  test("a quote whose min_out rounds to 0 (a quote of 1) is refused, nothing sent", async () => {
    const { econWriter, execute } = setup(realQuoter(() => 1n).quoter);
    await expect(econWriter.purchase({ stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null })).rejects.toBeInstanceOf(PoolCannotFillError);
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([1, 4, 10])("stake %i: the quote is for exactly the burn part the purchase swaps (Economy.quote's burn_quote)", async (stake) => {
    const pool = new FakePoolQuoter();
    const { economy, econWriter, minOutSent } = setup(pool);
    await econWriter.purchase({ stake, confirmedPrice: BigInt(stake) * FAKE_UNIT, confirmedMinOut: 1n, referrer: null });
    const { burnQuote } = await economy.quote(stake);
    expect(pool.calls).toEqual([burnQuote]);
    expect(minOutSent()).toBe(minOutFor(await new FakePoolQuoter().quoteSwap(burnQuote)));
  });

  test("a burn part outside (0, price] is not this purchase's: refused before any quote", async () => {
    const pool = new FakePoolQuoter();
    const { economy, econWriter, execute } = setup(pool);
    const real = economy.quote.bind(economy);
    economy.quote = async (stake) => ({ ...(await real(stake)), burnQuote: 0n });
    await expect(econWriter.purchase({ stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null })).rejects.toThrow(/burn part/);
    economy.quote = async (stake) => {
      const q = await real(stake);
      return { ...q, burnQuote: q.price + 1n };
    };
    await expect(econWriter.purchase({ stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null })).rejects.toThrow(/burn part/);
    expect(pool.calls).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  test("a quote that changes between display and send: the send quotes again and takes min_out from that quote", async () => {
    const pool = new FakePoolQuoter();
    const { economy, econWriter, minOutSent } = setup(pool);
    const { burnQuote } = await economy.quote(2);
    const shown = minOutFor(await pool.quoteSwap(burnQuote)); // what the purchase screen displayed
    pool.rate = { paved: 40n * 10n ** 18n, usdc: 1_000_000n }; // the pool moved: half the PAVED per USDC
    await econWriter.purchase({ stake: 2, confirmedPrice: 2n * FAKE_UNIT, confirmedMinOut: 1n, referrer: null });
    expect(pool.calls).toEqual([burnQuote, burnQuote]); // the display's quote, then the send's own
    const moved = new FakePoolQuoter();
    moved.rate = pool.rate;
    expect(minOutSent()).toBe(minOutFor(await moved.quoteSwap(burnQuote)));
    expect(minOutSent()).toBeLessThan(shown);
    // Each send quotes again: nothing is cached between purchases.
    await econWriter.purchase({ stake: 2, confirmedPrice: 2n * FAKE_UNIT, confirmedMinOut: 1n, referrer: null });
    expect(pool.calls).toHaveLength(3);
  });
});
