/** The economy client (P8) on its stub ABIs and the fake: `docs/architecture/client-economy.md`. */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import devnetFile from "../../../contracts/deployments/devnet.json";
import { ABIS, createCodecs, createEconomyCodecs, ECONOMY_ABIS } from "../src/abis";
import { AbiCodec, type Abi } from "../src/codec";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, ViewError } from "../src/views";
import { WriteError } from "../src/writer";
import {
  ECONOMY_ABI_IS_STUB,
  ECONOMY_VIEW_FIELDS,
  PurchaseOutcomeUnknownError,
  PurchasePriceChangedError,
  RpcEconomyViews,
  STAKES,
  VaultAmountChangedError,
  boostBps,
  createEconomyClient,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  POOL_QUOTE_CONFIRMED,
  expiresAt,
  minOutFor,
  settlesAfter,
  formatBps,
  formatUnits,
  parseUnits,
  priceOf,
  referralOf,
  resolveEconomyDeployment,
} from "../src/economy";
import { FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "../src/economy/fake";

const ADDR = { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const PLAYER = "0x5";
const REFERRER = "0x77";
const base = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: ADDR } });
const economyDeployment = resolveEconomyDeployment({ base, env: ECON });
const DAY = 20_000;

const spawnedEvent = (gameId: number) => ({
  from_address: ADDR.Daily,
  keys: [hash.getSelectorFromName("GameSpawned"), `0x${gameId.toString(16)}`, "0x9"],
  data: ["0x1", `0x${DAY.toString(16)}`, "0x1", "0x0"],
});

function setup(options: { receiptEvents?: unknown[]; now?: number; execute?: () => Promise<{ transaction_hash: string }>; wait?: () => Promise<unknown>; pool?: FakePoolQuoter | null } = {}) {
  const economy = new FakeEconomy();
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: options.wait ?? (async () => ({ execution_status: "SUCCEEDED", events: options.receiptEvents ?? [spawnedEvent(9)] })),
  } as unknown as PavedRpc;
  const execute = vi.fn(options.execute ?? (async () => ({ transaction_hash: "0x1" })));
  const client = new PavedClient(base, rpc, createCodecs(), gameViews);
  const writer = client.writer({ address: PLAYER, execute });
  const pool = options.pool === undefined ? new FakePoolQuoter() : options.pool;
  const econ = createEconomyClient(economyDeployment, client, economy, pool)!;
  const econWriter = econ.writer(writer, { now: () => options.now ?? settlesAfter(DAY) });
  const sent = () => (execute.mock.calls as unknown as Array<[Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>]>).map((c) => c[0]);
  return { economy, gameViews, execute, writer, econWriter, sent, pool };
}

describe("stub ABIs (until E2/E3)", () => {
  test("are marked as stubs, and the view field lists match them", () => {
    expect(ECONOMY_ABI_IS_STUB).toBe(true);
    const codec = new AbiCodec(ECONOMY_ABIS.Economy);
    for (const [struct, fields] of Object.entries(ECONOMY_VIEW_FIELDS)) expect(codec.structFields(struct)).toEqual(fields);
  });

  test("the paid spawn is E3's: the real Daily ABI still has none (this fails when E3 lands: wire it)", () => {
    const spawnOf = (abi: Abi) => abi.flatMap((e) => e.items ?? []).find((i) => i.name === "spawn");
    expect(spawnOf(ECONOMY_ABIS.DailyPaid)?.inputs?.map((i) => i.name)).toEqual(["stake", "referrer", "min_out"]);
    expect(spawnOf(ABIS.Daily)?.inputs).toEqual([]);
  });

  test("PavedToken and Vault are CORE's real ABIs (E1)", () => {
    const codecs = createEconomyCodecs();
    for (const f of ["stake", "unstake", "claim", "pending", "staked", "total_staked"]) expect(codecs.Vault.hasFunction(f)).toBe(true);
    for (const f of ["approve", "balance_of", "total_supply"]) expect(codecs.PavedToken.hasFunction(f)).toBe(true);
  });
});

describe("amounts: BigInt base units, never floats", () => {
  test("P = 2k USDC for k in 1..10, the boost 1 + k/100", () => {
    expect(STAKES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(STAKES.map((k) => priceOf(FAKE_UNIT, k))).toEqual(STAKES.map((k) => BigInt(k) * 2_000_000n));
    expect(formatUnits(priceOf(FAKE_UNIT, 10), 6)).toBe("20");
    expect(boostBps(1)).toBe(10_100n);
    expect(boostBps(10)).toBe(11_000n);
    expect(formatBps(boostBps(3))).toBe("1.03");
    expect(() => priceOf(FAKE_UNIT, 0)).toThrow(RangeError);
    expect(() => priceOf(FAKE_UNIT, 11)).toThrow(RangeError);
    expect(() => priceOf(FAKE_UNIT, 1.5)).toThrow(RangeError);
  });

  test("referral 5 % of the price", () => {
    expect(referralOf(20_000_000n)).toBe(1_000_000n);
  });

  test("parse and format without floats, 18 decimals included", () => {
    expect(parseUnits("1.000000000000000001", 18)).toBe(10n ** 18n + 1n);
    expect(parseUnits("0.1234567", 6)).toBeNull();
    expect(parseUnits("0", 6)).toBeNull();
    expect(parseUnits("1e3", 6)).toBeNull();
    expect(formatUnits(10n ** 18n + 1n, 18)).toBe("1.000000000000000001");
    expect(formatUnits(1_500_000n, 6, 2)).toBe("1.5");
  });

  test("min_out: the pool quote less 1 % by default, rounded down, the slippage capped at 5 %", () => {
    expect(DEFAULT_SLIPPAGE_BPS).toBe(100n);
    expect(MAX_SLIPPAGE_BPS).toBe(500n);
    expect(minOutFor(1_000n)).toBe(990n);
    expect(minOutFor(999n)).toBe(989n);
    expect(minOutFor(1_000n, 500n)).toBe(950n);
    expect(() => minOutFor(1_000n, 501n)).toThrow(RangeError);
  });

  test("P-34: a paid game expires 24 h after its purchase; day D settles after D+1 ends", () => {
    expect(expiresAt(1_000)).toBe(1_000 + 86_400);
    expect(settlesAfter(DAY)).toBe((DAY + 2) * 86_400);
  });
});

describe("deployment: the economy is not configured until CORE deploys it", () => {
  test("today's devnet.json has no economy address", () => {
    const fromFile = resolveDeployment({ network: "devnet", file: devnetFile as DeploymentFile });
    const economy = resolveEconomyDeployment({ base: fromFile, file: devnetFile as DeploymentFile });
    expect(economy.configured).toBe(false);
    expect(economy.missing).toEqual(["Economy address", "PavedToken address", "Vault address", "USDC address"]);
    expect(createEconomyClient(economy, new PavedClient(fromFile, {} as PavedRpc))).toBeNull();
  });

  test("the file's E3 keys (MockUSDC on devnet) and the env, the env first", () => {
    const file = { contracts: { Economy: { address: "0x20" }, PavedToken: { address: "0x21" }, Vault: { address: "0x22" }, MockUSDC: { address: "0x23" } } };
    expect(resolveEconomyDeployment({ base, file }).addresses).toEqual({ Economy: "0x20", PavedToken: "0x21", Vault: "0x22", USDC: "0x23" });
    expect(resolveEconomyDeployment({ base, file, env: { vault: "0x99" } }).addresses.Vault).toBe("0x99");
    expect(resolveEconomyDeployment({ base: resolveDeployment({ network: "devnet" }), env: ECON }).configured).toBe(false);
  });
});

describe("purchase: approve USDC, then Daily.spawn(stake, referrer, min_out), in one multicall", () => {
  test("approves exactly the price to Daily; min_out is the pool quote less 1 %, never the hint", async () => {
    const { economy, econWriter, sent } = setup();
    const result = await econWriter.purchase({ stake: 3, confirmedPrice: 6_000_000n, referrer: null });
    expect(result.gameId).toBe(9);
    const [calls] = sent();
    expect(calls.map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.usdc, "approve"], [ADDR.Daily, "spawn"]]);
    expect(calls[0].calldata).toEqual([ADDR.Daily, "0x5b8d80", "0x0"]); // 6_000_000 as u256
    const quote = await economy.quote(3);
    const poolOut = (quote.burnQuote * 95n * 80n * 10n ** 18n) / (100n * 1_000_000n); // the fee included
    const minOut = (poolOut * 9_900n) / 10_000n;
    expect(typeof minOut).toBe("bigint");
    expect(minOut).toBe(await economy.expectedMinOut(3));
    // The hint leaves the fee out: it sits above what the swap returns, and is never sent.
    expect(quote.minOutHint > poolOut).toBe(true);
    expect(calls[1].calldata).toEqual(["0x3", "0x0", `0x${minOut.toString(16)}`, "0x0"]);
  });

  test("the referral changes no amount the player pays", async () => {
    const without = await setup().econWriter.planPurchase({ stake: 10, confirmedPrice: 20_000_000n, referrer: null });
    const withRef = await setup().econWriter.planPurchase({ stake: 10, confirmedPrice: 20_000_000n, referrer: REFERRER });
    expect(withRef.price).toBe(without.price);
    expect(withRef.calls[0]).toEqual(without.calls[0]); // the same approve
    expect(withRef.minOut).toBe(without.minOut);
    expect(withRef.calls[1].calldata[1]).toBe(REFERRER);
    expect(without.calls[1].calldata[1]).toBe("0x0");
    // A self-referral is sent as none.
    expect((await setup().econWriter.planPurchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: PLAYER })).referrer).toBe("0x0");
  });

  test("a changed price sends nothing", async () => {
    const { economy, gameViews, econWriter, execute } = setup();
    gameViews.price = { token: ECON.usdc, amount: 3_000_000n };
    economy.unit = 3_000_000n;
    await expect(econWriter.purchase({ stake: 2, confirmedPrice: 4_000_000n, referrer: null })).rejects.toBeInstanceOf(PurchasePriceChangedError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("no pool quoter (today: quote_swap is a stub), a zero quote or a failed one: nothing sent", async () => {
    const request = { stake: 1, confirmedPrice: 2_000_000n, referrer: null };
    expect(POOL_QUOTE_CONFIRMED).toBe(false);
    const none = setup({ pool: null });
    await expect(none.econWriter.purchase(request)).rejects.toThrow("No pool quote: nothing was sent");
    const zero = setup();
    zero.pool!.zero = true;
    await expect(zero.econWriter.purchase(request)).rejects.toThrow("No pool quote: nothing was sent");
    const failed = setup();
    failed.pool!.fail = "down";
    await expect(failed.econWriter.purchase(request)).rejects.toThrow(/Cannot read the pool quote: down/);
    for (const s of [none, zero, failed]) expect(s.execute).not.toHaveBeenCalled();
    // A real client has no quoter until CORE confirms quote_swap.
    expect(createEconomyClient(economyDeployment, new PavedClient(base, {} as PavedRpc), new FakeEconomy())!.poolQuoter).toBeNull();
  });

  test("slippage: shown in bps, at most 5 %", async () => {
    const s = setup();
    const at5 = await s.econWriter.planPurchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null, slippageBps: 500n });
    expect(at5.minOut).toBe((at5.poolOut * 9_500n) / 10_000n);
    await expect(s.econWriter.planPurchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null, slippageBps: 600n })).rejects.toThrow(/Slippage is 0 to 500 bps/);
  });

  test("a malformed referrer is a WriteError, never a raw SyntaxError, and sends nothing", async () => {
    const { econWriter, execute } = setup();
    for (const referrer of ["abc", "0xzz", `0x${"f".repeat(64)}`]) {
      const error = await econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WriteError);
      expect((error as Error).message).toMatch(/Not a referrer address/);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  test("a receipt without GameSpawned is 'sent, outcome unknown' with its hash, not a failure", async () => {
    const { econWriter, execute } = setup({ receiptEvents: [] });
    const error = await econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PurchaseOutcomeUnknownError);
    expect((error as PurchaseOutcomeUnknownError).transactionHash).toBe("0x1");
    expect((error as Error).message).toBe("Purchase sent (0x1), outcome unknown: check your games before buying again");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("sent, then the receipt wait throws (timeout, RPC drop): outcome unknown with the hash; a revert stays a failure", async () => {
    const dropped = setup({ wait: async () => Promise.reject(new Error("socket hang up")) });
    const error = await dropped.econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PurchaseOutcomeUnknownError);
    expect((error as PurchaseOutcomeUnknownError).transactionHash).toBe("0x1");

    const reverted = setup({ wait: async () => ({ execution_status: "REVERTED", revert_reason: "Economy: slippage" }) });
    const revert = await reverted.econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null }).catch((e: unknown) => e);
    expect(revert).toBeInstanceOf(WriteError);
    expect(revert).not.toBeInstanceOf(PurchaseOutcomeUnknownError);
    expect((revert as WriteError).reverted).toBe(true);
    expect((revert as Error).message).toBe("Economy: slippage");
  });

  test("a failed read sends nothing", async () => {
    const { economy, econWriter, execute } = setup();
    economy.fail = "node down";
    await expect(econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null })).rejects.toThrow(/Cannot read the price: node down/);
    expect(execute).not.toHaveBeenCalled();
  });

  test("another entry token, a quote that disagrees, a bad stake, a free entry: nothing sent", async () => {
    const a = setup();
    a.gameViews.price = { token: "0x4", amount: FAKE_UNIT };
    await expect(a.econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null })).rejects.toThrow(/not paid in USDC/);
    const b = setup();
    b.economy.unit = 1n;
    await expect(b.econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null })).rejects.toThrow(/quote disagrees/);
    const c = setup();
    await expect(c.econWriter.purchase({ stake: 11, confirmedPrice: 22_000_000n, referrer: null })).rejects.toThrow(WriteError);
    const d = setup();
    d.gameViews.price = { token: ECON.usdc, amount: 0n };
    await expect(d.econWriter.purchase({ stake: 1, confirmedPrice: 0n, referrer: null })).rejects.toThrow(/no price/);
    for (const s of [a, b, c, d]) expect(s.execute).not.toHaveBeenCalled();
  });

  test("serialised with the game's writes: a second write while one is pending is refused", async () => {
    let release!: () => void;
    const { econWriter, writer, execute } = setup({ execute: () => new Promise((r) => (release = () => r({ transaction_hash: "0x1" }))) });
    const first = econWriter.purchase({ stake: 1, confirmedPrice: 2_000_000n, referrer: null });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    await expect(writer.discard({ mode: "daily", gameId: 1 })).rejects.toThrow(/Another write is pending/);
    await expect(econWriter.claimDividends({ confirmedAmount: 1n })).rejects.toThrow(/Another write is pending/);
    release();
    await first;
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("settle: the player's claim of PAVED, after the day", () => {
  const settled = {
    from_address: ECON.economy,
    keys: [hash.getSelectorFromName("Settled"), "0x7", "0x9"],
    data: [`0x${DAY.toString(16)}`, "0xfa0", "0xd19", "0xde0b6b3a7640000", "0x0"],
  };

  test("sends settle([ids]) and decodes Settled from the Economy", async () => {
    const { economy, econWriter, sent } = setup({ receiptEvents: [settled] });
    economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY, score: 4000 }));
    const result = await econWriter.settle([7]);
    expect(sent()[0]).toEqual([{ contractAddress: ECON.economy, entrypoint: "settle", calldata: ["0x1", "0x7"] }]);
    expect(result.events[0].name).toBe("Settled");
    expect(result.events[0].fields.reward).toBe(10n ** 18n);
  });

  test("several ids: [n, id...], duplicates sent once", async () => {
    const { economy, econWriter, sent } = setup({ receiptEvents: [] });
    for (const id of [7, 8, 300]) economy.terms_.set(id, fakeTerms({ stake: 1, day: DAY }));
    await econWriter.settle([7, 300, 7, 8, 300]);
    expect(sent()[0][0].calldata).toEqual(["0x3", "0x7", "0x12c", "0x8"]);
  });

  test("'now' is the latest block's timestamp when the provider has one, not the device clock", async () => {
    const economy = new FakeEconomy();
    economy.terms_.set(7, fakeTerms({ stake: 1, day: DAY }));
    const gameViews = new FakeGameViews();
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const block = { timestamp: settlesAfter(DAY) - 1 };
    const rpc = {
      callContract: async () => [],
      getEvents: async () => ({ events: [] }),
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
      getBlock: async () => block,
    } as unknown as PavedRpc;
    const client = new PavedClient(base, rpc, createCodecs(), gameViews);
    const writer = createEconomyClient(economyDeployment, client, economy, new FakePoolQuoter())!.writer(client.writer({ address: PLAYER, execute }));
    // The device clock (2026) is long past day 20,000; the chain's block is not.
    await expect(writer.settle([7])).rejects.toThrow(/Game 7 settles after/);
    block.timestamp += 1;
    await writer.settle([7]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("refused, sending nothing: day running, game not over, already settled, not bought, failed read", async () => {
    const cases: Array<[string, (s: ReturnType<typeof setup>) => void, RegExp, number?]> = [
      ["day D before D+1 ends", () => {}, /settles after/, settlesAfter(DAY) - 1],
      ["not over", (s) => s.economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY, recorded: false })), /not over, or expired: no reward/],
      ["settled", (s) => s.economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY, settled: true })), /already settled/],
      ["not bought", (s) => s.economy.terms_.delete(7), /not bought/],
      ["read fails", (s) => (s.economy.fail = "down"), /Cannot read the game/],
    ];
    for (const [, arrange, error, now] of cases) {
      const s = setup({ now });
      s.economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY }));
      arrange(s);
      await expect(s.econWriter.settle([7])).rejects.toThrow(error);
      expect(s.execute).not.toHaveBeenCalled();
    }
  });
});

describe("Vault: stake, unstake, dividends", () => {
  const P = 10n ** 18n;

  test("stake approves exactly the amount, then stakes", async () => {
    const { economy, econWriter, sent } = setup({ receiptEvents: [] });
    economy.setBalance("paved", PLAYER, 5n * P);
    await econWriter.stake(2n * P, { confirmedAmount: 2n * P });
    expect(sent()[0].map((c) => [c.contractAddress, c.entrypoint, c.calldata])).toEqual([
      [ECON.pavedToken, "approve", [ECON.vault, "0x1bc16d674ec80000", "0x0"]],
      [ECON.vault, "stake", ["0x1bc16d674ec80000", "0x0"]],
    ]);
  });

  test("a changed amount, too little, more than staked, or a failed read sends nothing", async () => {
    const s = setup({ receiptEvents: [] });
    s.economy.setBalance("paved", PLAYER, P);
    s.economy.setVault(PLAYER, { staked: P, pending: 3n });
    await expect(s.econWriter.stake(2n * P, { confirmedAmount: P })).rejects.toBeInstanceOf(VaultAmountChangedError);
    await expect(s.econWriter.stake(2n * P, { confirmedAmount: 2n * P })).rejects.toThrow(/Not enough PAVED/);
    await expect(s.econWriter.stake(0n, { confirmedAmount: 0n })).rejects.toThrow(/above 0/);
    await expect(s.econWriter.unstake(2n * P, { confirmedAmount: 2n * P })).rejects.toThrow(/More than is staked/);
    await expect(s.econWriter.claimDividends({ confirmedAmount: 2n })).rejects.toBeInstanceOf(VaultAmountChangedError);
    s.economy.fail = "down";
    await expect(s.econWriter.unstake(P, { confirmedAmount: P })).rejects.toThrow(/Cannot read the Vault position/);
    expect(s.execute).not.toHaveBeenCalled();
  });

  test("unstake and claim the confirmed dividends", async () => {
    const s = setup({ receiptEvents: [] });
    s.economy.setVault(PLAYER, { staked: P, pending: 3n });
    await s.econWriter.unstake(P, { confirmedAmount: P });
    await s.econWriter.claimDividends({ confirmedAmount: 3n });
    expect(s.sent().map((calls) => calls.map((c) => c.entrypoint))).toEqual([["unstake"], ["claim"]]);
    s.economy.setVault(PLAYER, { staked: P, pending: 0n });
    await expect(s.econWriter.claimDividends({ confirmedAmount: 0n })).rejects.toThrow(/No dividends/);
  });
});

describe("RpcEconomyViews decode the stub layouts", () => {
  test("quote and vault, bigints for amounts", async () => {
    const felts: Record<string, string[]> = {
      quote: ["0x1e8480", "0x0", "0x155cc0", "0x0", "0x186a0", "0x0", "0x927c0", "0x0", "0x5", "0x0", "0x2710", "0x332858", "0xd19", "0x46d2", "0x5"],
      staked: ["0x2", "0x0"],
      pending: ["0x3", "0x0"],
      total_staked: ["0x4", "0x0"],
    };
    const provider = { callContract: async (c: { entrypoint: string }) => felts[c.entrypoint] };
    const views = new RpcEconomyViews(provider, economyDeployment, createEconomyCodecs());
    const quote = await views.quote(1);
    expect(quote.price).toBe(2_000_000n);
    expect(quote.minOutHint).toBe(5n);
    expect(quote.threshold).toBe(3353);
    expect(await views.vault(PLAYER)).toEqual({ staked: 2n, pending: 3n, totalStaked: 4n });
  });

  test("terms: E2's layout, sigma_bps read as a signed i16 from its felt", async () => {
    const P = (1n << 251n) + 17n * (1n << 192n) + 1n;
    const felts = ["0x9", "0x4e20", "0x2", "0xde0b6b3a7640000", `0x${(P - 500n).toString(16)}`, "0x46d2", "0x5", "0xfa0", "0x1", "0x0", "0x0"];
    const views = new RpcEconomyViews({ callContract: async () => felts }, economyDeployment, createEconomyCodecs());
    expect(await views.terms(7)).toEqual({
      player: "0x9", day: 20_000, stake: 2, reference: 10n ** 18n, sigmaBps: -500, slopeBps: 18_130, cap: 5, score: 4000, recorded: true, settled: false, reward: 0n,
    });
  });

  test("not configured: a ViewError, no call", async () => {
    const callContract = vi.fn();
    const views = new RpcEconomyViews({ callContract }, resolveEconomyDeployment({ base }), createEconomyCodecs());
    await expect(views.quote(1)).rejects.toBeInstanceOf(ViewError);
    expect(callContract).not.toHaveBeenCalled();
  });
});
