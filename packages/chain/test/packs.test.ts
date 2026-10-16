/** The packs of Cobbles (cobbles v1, part 2, CORE #453): `Setup.pack`, `PavedWriter.buyPack` and `PackBuyer`, on fakes. */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { PACK_IDS, PackNotOnSaleError, PackPriceChangedError, packBuyerOf, packReferrer, packSwapInput, readPacks } from "../src/packs";
import { FakeGameViews, MAX_PACK_ID, PACK_VIEW_FIELDS, RpcGameViews, type CallProvider } from "../src/views";
import { PackOutcomeUnknownError, PackRefusedError, WriteError, buyPackArgs, type PackRefusal } from "../src/writer";
import {
  ChainMismatchError,
  PoolCannotFillError,
  PoolPriceMovedError,
  PoolQuoteBelowFloorError,
  PoolQuoteUnavailableError,
  RefusedReferrerError,
  RouterNotPinnedError,
  createEconomyClient,
  minOutFor,
  resolveEconomyDeployment,
} from "../src/economy";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FakeEconomy, FakePoolQuoter } from "../src/testing";

const ADDR = { Challenge: "0x2", Setup: "0x3" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const PLAYER = "0x5";
const REFERRER = "0x77";
const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } });
const economyDeployment = resolveEconomyDeployment({ base: { ...base, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: ECON });

/** The default packs (CORE #453): 50 for $5, 100 for $9, 500 for $40, 1,000 for $70. */
const DEFAULT_PACKS = [
  { packId: 1, cobbles: 50, price: 5_000_000n, active: true },
  { packId: 2, cobbles: 100, price: 9_000_000n, active: true },
  { packId: 3, cobbles: 500, price: 40_000_000n, active: true },
  { packId: 4, cobbles: 1_000, price: 70_000_000n, active: true },
];

const hex = (n: number | bigint) => `0x${n.toString(16)}`;

/** `Setup`'s `PackBought` as a receipt holds it: the player id a key, then pack_id, cobbles, price, referrer, balance. */
const packBought = (packId: number, cobbles: number, price: bigint, referrer: string, balance: number) => ({
  from_address: ADDR.Setup,
  keys: [hash.getSelectorFromName("PackBought"), PLAYER],
  data: [hex(packId), hex(cobbles), hex(price), referrer, hex(balance)],
});

function setup(options: { receipt?: () => Promise<unknown>; execute?: () => Promise<{ transaction_hash: string }>; pool?: FakePoolQuoter | null; chainId?: string } = {}) {
  const economy = new FakeEconomy();
  const gameViews = new FakeGameViews();
  for (const pack of DEFAULT_PACKS) gameViews.packs.set(pack.packId, { ...pack });
  const rpc = {
    callContract: async () => [],
    getChainId: async () => options.chainId ?? FAKE_CHAIN_ID,
    getEvents: async () => ({ events: [] }),
    waitForTransaction: options.receipt ?? (async () => ({ execution_status: "SUCCEEDED", events: [packBought(2, 100, 9_000_000n, "0x0", 340)] })),
  } as unknown as PavedRpc;
  const execute = vi.fn(options.execute ?? (async () => ({ transaction_hash: "0xab" })));
  const client = new PavedClient(base, rpc, createCodecs(), gameViews);
  const writer = client.writer({ address: PLAYER, execute });
  const pool = options.pool === undefined ? new FakePoolQuoter() : options.pool;
  const econ = createEconomyClient(economyDeployment, client, economy, pool)!;
  const buyer = packBuyerOf(econ, writer);
  const sent = () => (execute.mock.calls as unknown as Array<[Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>]>).map((c) => c[0]);
  return { economy, gameViews, writer, buyer, pool, sent, execute };
}

/** The `min_out` the buyer computes for a pack with the fake pool: the quote of its swap less 1 %. */
async function expectedMinOut(price: bigint, referred = false): Promise<bigint> {
  return minOutFor(await new FakePoolQuoter().quoteSwap(packSwapInput(price, { referral: 500 }, referred)));
}

describe("Setup.pack", () => {
  test("Pack has the ABI's fields, in order; Setup has buy_pack and pack", () => {
    const codecs = createCodecs();
    expect(codecs.Setup.structFields("paved::systems::setup::Pack")).toEqual(PACK_VIEW_FIELDS);
    expect(codecs.Setup.hasFunction("buy_pack")).toBe(true);
    expect(codecs.Setup.hasFunction("pack")).toBe(true);
  });

  test("the RPC view decodes a pack: its Cobbles, its u128 price and whether it is on sale", async () => {
    const calls: Array<{ entrypoint: string; calldata: string[] }> = [];
    const provider: CallProvider = { callContract: async (call) => (calls.push(call), ["0x3e8", "0x42c1d80", "0x1"]) };
    const views = new RpcGameViews(provider, base, createCodecs());
    expect(await views.pack(4)).toEqual({ packId: 4, cobbles: 1_000, price: 70_000_000n, active: true });
    expect(calls).toEqual([expect.objectContaining({ contractAddress: ADDR.Setup, entrypoint: "pack", calldata: ["0x4"] })]);
  });

  test("readPacks reads ids 1 to 8 and keeps the packs on sale, cheapest first", async () => {
    const views = new FakeGameViews();
    views.packs.set(7, { packId: 7, cobbles: 10, price: 1_000_000n, active: true });
    views.packs.set(2, { packId: 2, cobbles: 100, price: 9_000_000n, active: true });
    views.packs.set(3, { packId: 3, cobbles: 500, price: 40_000_000n, active: false });
    expect(PACK_IDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(MAX_PACK_ID).toBe(8);
    expect((await readPacks(views)).map((p) => p.packId)).toEqual([7, 2]);
    expect(views.calls.filter((c) => c.startsWith("pack "))).toHaveLength(8);
  });

  test("a failed read fails the list", async () => {
    const views = new FakeGameViews();
    views.cobblesFail = new Error("node down");
    await expect(readPacks(views)).rejects.toThrow("node down");
  });
});

describe("PavedWriter.buyPack: approve Setup for exactly the price, then Setup.buy_pack(pack_id, referrer, min_out)", () => {
  test("buyPackArgs lists the entry point's arguments in ABI order (main's ABI, db6c6bc4)", () => {
    const request = { packId: 2, referrer: REFERRER, minOut: 123n, price: 9_000_000n };
    expect(buyPackArgs(request)).toEqual([2, REFERRER, 123n]);
    expect(createCodecs().Setup.encodeCall("buy_pack", buyPackArgs(request))).toEqual(["0x2", REFERRER, "0x7b", "0x0"]);
  });

  test("one multicall of two calls, and the receipt's PackBought", async () => {
    const { writer, sent } = setup();
    const result = await writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc);
    expect(sent()).toEqual([
      [
        { contractAddress: ECON.usdc, entrypoint: "approve", calldata: [ADDR.Setup, hex(9_000_000), "0x0"] },
        { contractAddress: ADDR.Setup, entrypoint: "buy_pack", calldata: ["0x2", "0x0", "0x5", "0x0"] },
      ],
    ]);
    expect(result.bought).toEqual({ playerId: PLAYER, packId: 2, cobbles: 100, price: 9_000_000n, referrer: "0x0", balance: 340 });
  });

  test("refuses before sending: no Setup, no USDC, a bad id, a price or min_out of 0", async () => {
    const { writer, execute } = setup();
    const request = { packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n };
    await expect(writer.buyPack(request, "")).rejects.toThrow(/No USDC/);
    await expect(writer.buyPack({ ...request, packId: 0 }, ECON.usdc)).rejects.toThrow(/Not a pack id/);
    await expect(writer.buyPack({ ...request, price: 0n }, ECON.usdc)).rejects.toThrow(/price must be above 0/);
    await expect(writer.buyPack({ ...request, minOut: 0n }, ECON.usdc)).rejects.toThrow(/No minimum PAVED/);
    const noSetup = new PavedClient(resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } }), {} as PavedRpc).writer({ address: PLAYER, execute });
    await expect(noSetup.buyPack(request, ECON.usdc)).rejects.toThrow(/No Setup/);
    expect(execute).not.toHaveBeenCalled();
  });

  const REVERTS: Array<[string, PackRefusal]> = [
    ["Setup: pack not on sale", "not-on-sale"],
    ["Setup: economy not set", "no-economy"],
    ["Setup: payment failed", "payment-failed"],
    ["Economy: swap below min_out", "price-moved"],
    ["ERC20: insufficient allowance", "no-allowance"],
    ["ERC20: insufficient balance", "no-balance"],
  ];
  for (const [reason, refusal] of REVERTS) {
    test(`'${reason}' is a PackRefusedError (${refusal}), from the receipt and from the fee estimation`, async () => {
      const reverted = setup({ receipt: async () => ({ execution_status: "REVERTED", revert_reason: `Failure reason: '${reason}'.` }) });
      const error = await reverted.writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PackRefusedError);
      expect(error).toMatchObject({ reason: refusal, transactionHash: "0xab", reverted: true });
      const estimated = setup({ execute: async () => Promise.reject(new Error(`execution reverted: ${reason}`)) });
      const early = await estimated.writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc).catch((e: unknown) => e);
      expect(early).toMatchObject({ reason: refusal, transactionHash: undefined });
    });
  }

  test("a receipt that cannot be read, or without PackBought, is an unknown outcome, not a failure", async () => {
    const dropped = setup({ receipt: async () => Promise.reject(new Error("timeout")) });
    const error = await dropped.writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackOutcomeUnknownError);
    expect((error as PackOutcomeUnknownError).transactionHash).toBe("0xab");
    const empty = setup({ receipt: async () => ({ execution_status: "SUCCEEDED", events: [] }) });
    await expect(empty.writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc)).rejects.toBeInstanceOf(PackOutcomeUnknownError);
  });

  test("an unknown revert stays a WriteError", async () => {
    const other = setup({ receipt: async () => ({ execution_status: "REVERTED", revert_reason: "something else" }) });
    const error = await other.writer.buyPack({ packId: 2, referrer: "0x0", minOut: 5n, price: 9_000_000n }, ECON.usdc).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).not.toBeInstanceOf(PackRefusedError);
  });
});

describe("PackBuyer: the fresh reads and checks before buyPack", () => {
  test("buys at the confirmed price, with min_out from a fresh quote of the pack's swap less 1 %", async () => {
    const { buyer, sent, pool } = setup();
    const minOut = await expectedMinOut(9_000_000n);
    await buyer.buy({ packId: 2, confirmedPrice: 9_000_000n, confirmedMinOut: minOut, referrer: null });
    expect(pool.calls).toEqual([9_000_000n]);
    expect(sent()[0][1].calldata).toEqual(["0x2", "0x0", hex(minOut), "0x0"]);
  });

  test("with a referrer the swap takes the price less the referral (5 %), and the referrer is sent", async () => {
    const { buyer, sent, pool } = setup();
    const minOut = await expectedMinOut(9_000_000n, true);
    await buyer.buy({ packId: 2, confirmedPrice: 9_000_000n, confirmedMinOut: minOut, referrer: REFERRER });
    expect(pool.calls).toEqual([8_550_000n]);
    expect(sent()[0][1].calldata).toEqual(["0x2", REFERRER, hex(minOut), "0x0"]);
  });

  test("a referrer the contract ignores (Setup, the Vault, the router) is sent as 0x0; the payer, Challenge and Economy are refused", () => {
    for (const ignored of [ADDR.Setup, ECON.vault, "0xd3de"]) expect(packReferrer(ignored, PLAYER, economyDeployment, { router: "0xd3de", seller: "0x0" })).toBe("0x0");
    for (const refused of [PLAYER, ADDR.Challenge, ECON.economy]) expect(() => packReferrer(refused, PLAYER, economyDeployment, { router: "0xd3de", seller: "0x0" })).toThrow(RefusedReferrerError);
    expect(packReferrer(null, PLAYER, economyDeployment, { router: "0xd3de", seller: "0x0" })).toBe("0x0");
    // The seller read from the chain (`Economy.seller()`) is ignored too, whatever the deployment names.
    expect(packReferrer(REFERRER, PLAYER, economyDeployment, { router: "0xd3de", seller: REFERRER })).toBe("0x0");
  });

  test("each refusal before sending is typed, and nothing is sent", async () => {
    const request = { packId: 2, confirmedPrice: 9_000_000n, confirmedMinOut: 1n, referrer: null };
    const price = setup();
    await expect(price.buyer.buy({ ...request, confirmedPrice: 5_000_000n })).rejects.toBeInstanceOf(PackPriceChangedError);
    const off = setup();
    off.gameViews.packs.set(2, { ...DEFAULT_PACKS[1], active: false });
    await expect(off.buyer.buy(request)).rejects.toBeInstanceOf(PackNotOnSaleError);
    await expect(off.buyer.buy({ ...request, packId: 6 })).rejects.toBeInstanceOf(PackNotOnSaleError);
    const moved = setup();
    await expect(moved.buyer.buy({ ...request, confirmedMinOut: 10n ** 30n })).rejects.toBeInstanceOf(PoolPriceMovedError);
    const router = setup();
    router.economy.router_ = "0xbad";
    await expect(router.buyer.buy(request)).rejects.toBeInstanceOf(RouterNotPinnedError);
    const zero = setup({ pool: Object.assign(new FakePoolQuoter(), { zero: true }) });
    await expect(zero.buyer.buy(request)).rejects.toBeInstanceOf(PoolCannotFillError);
    const down = setup({ pool: Object.assign(new FakePoolQuoter(), { fail: "rate limited" }) });
    await expect(down.buyer.buy(request)).rejects.toBeInstanceOf(PoolQuoteUnavailableError);
    const low = setup();
    low.pool.rate = { paved: 1n, usdc: 1_000_000n };
    await expect(low.buyer.buy(request)).rejects.toBeInstanceOf(PoolQuoteBelowFloorError);
    const chain = setup({ chainId: "0x1" });
    await expect(chain.buyer.buy(request)).rejects.toBeInstanceOf(ChainMismatchError);
    const unread = setup();
    unread.economy.fail = "node down";
    await expect(unread.buyer.buy(request)).rejects.toThrow(/Cannot read the price: node down/);
    await expect(unread.buyer.buy({ ...request, packId: 9 })).rejects.toThrow(/Not a pack id/);
    for (const s of [price, off, moved, router, zero, down, low, chain, unread]) expect(s.execute).not.toHaveBeenCalled();
  });

  test("a low quote the player accepted is sent", async () => {
    const low = setup();
    low.pool.rate = { paved: 1n, usdc: 1_000_000n };
    await low.buyer.buy({ packId: 2, confirmedPrice: 9_000_000n, confirmedMinOut: 1n, referrer: null, acceptedLowQuote: true });
    expect(low.execute).toHaveBeenCalledTimes(1);
  });
});
