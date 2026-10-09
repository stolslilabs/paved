/** The economy client (P8) on its stub ABIs and the fake: `docs/architecture/client-economy.md`. */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import devnetFile from "../../../contracts/deployments/devnet.json";
import { ABIS, createCodecs, createEconomyCodecs, ECONOMY_ABIS } from "../src/abis";
import { AbiCodec, type Abi } from "../src/codec";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, ViewError, type GameView } from "../src/views";
import { WriteError } from "../src/writer";
import {
  DEFAULT_SLIPPAGE_BPS,
  ECONOMY_ABI_IS_STUB,
  ECONOMY_VIEW_FIELDS,
  PurchasePriceChangedError,
  RpcEconomyViews,
  STAKES,
  VaultAmountChangedError,
  boostBps,
  createEconomyClient,
  dayOver,
  formatBps,
  formatUnits,
  minOutFor,
  parseUnits,
  priceOf,
  referralOf,
  resolveEconomyDeployment,
} from "../src/economy";
import { FAKE_UNIT, FakeEconomy } from "../src/economy/fake";

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

function game(id: number, over: boolean): GameView {
  return {
    id, playerId: "0x9", mode: 1, seed: "0x0", score: 4000, over, tileCount: 38, placedCount: 38, discardedCount: 0,
    tileId: 0, plan: 0, remainingCount: 0, deckSize: 38, startTime: DAY * 86400, endTime: (DAY + 1) * 86400, tournamentId: DAY,
  };
}

function setup(options: { receiptEvents?: unknown[]; now?: number; execute?: () => Promise<{ transaction_hash: string }> } = {}) {
  const economy = new FakeEconomy();
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: options.receiptEvents ?? [spawnedEvent(9)] }),
  } as unknown as PavedRpc;
  const execute = vi.fn(options.execute ?? (async () => ({ transaction_hash: "0x1" })));
  const client = new PavedClient(base, rpc, createCodecs(), gameViews);
  const writer = client.writer({ address: PLAYER, execute });
  const econ = createEconomyClient(economyDeployment, client, economy)!;
  const econWriter = econ.writer(writer, { now: () => options.now ?? (DAY + 1) * 86400 });
  const sent = () => (execute.mock.calls as unknown as Array<[Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>]>).map((c) => c[0]);
  return { economy, gameViews, execute, writer, econWriter, sent };
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

  test("referral 5 % of the price; min_out the quote less 1 %", () => {
    expect(referralOf(20_000_000n)).toBe(1_000_000n);
    expect(DEFAULT_SLIPPAGE_BPS).toBe(100n);
    expect(minOutFor(1_000n)).toBe(990n);
    expect(minOutFor(999n)).toBe(989n); // rounded down
    expect(() => minOutFor(1n, 6_000n)).toThrow(RangeError);
  });

  test("parse and format without floats, 18 decimals included", () => {
    expect(parseUnits("1.000000000000000001", 18)).toBe(10n ** 18n + 1n);
    expect(parseUnits("0.1234567", 6)).toBeNull();
    expect(parseUnits("0", 6)).toBeNull();
    expect(parseUnits("1e3", 6)).toBeNull();
    expect(formatUnits(10n ** 18n + 1n, 18)).toBe("1.000000000000000001");
    expect(formatUnits(1_500_000n, 6, 2)).toBe("1.5");
  });

  test("a day is settled once it is over", () => {
    expect(dayOver(DAY, (DAY + 1) * 86400 - 1)).toBe(false);
    expect(dayOver(DAY, (DAY + 1) * 86400)).toBe(true);
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
  test("approves exactly the price to Daily, min_out from the quote less the slippage", async () => {
    const { economy, econWriter, sent } = setup();
    const result = await econWriter.purchase({ stake: 3, confirmedPrice: 6_000_000n, referrer: null });
    expect(result.gameId).toBe(9);
    const [calls] = sent();
    expect(calls.map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.usdc, "approve"], [ADDR.Daily, "spawn"]]);
    expect(calls[0].calldata).toEqual([ADDR.Daily, "0x5b8d80", "0x0"]); // 6_000_000 as u256
    const minOut = await economy.expectedMinOut(3);
    expect(typeof minOut).toBe("bigint");
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
    const { economy, gameViews, econWriter, sent } = setup({ receiptEvents: [settled] });
    economy.terms_.set(7, { stake: 2, reference: 10n ** 18n, day: DAY, score: 4000, settled: false, reward: 0n });
    gameViews.setGame({ mode: "daily", gameId: 7 }, { game: game(7, true), tiles: [], builder: {} as never, characters: [] });
    const result = await econWriter.settle([7]);
    expect(sent()[0]).toEqual([{ contractAddress: ECON.economy, entrypoint: "settle", calldata: ["0x1", "0x7"] }]);
    expect(result.events[0].name).toBe("Settled");
    expect(result.events[0].fields.reward).toBe(10n ** 18n);
  });

  test("refused, sending nothing: day running, game not over, already settled, not bought, failed read", async () => {
    const cases: Array<[string, (s: ReturnType<typeof setup>) => void, RegExp, number?]> = [
      ["day running", () => {}, /day of game 7 is not over/, (DAY + 1) * 86400 - 1],
      ["not over", (s) => s.gameViews.setGame({ mode: "daily", gameId: 7 }, { game: game(7, false), tiles: [], builder: {} as never, characters: [] }), /not over/],
      ["settled", (s) => s.economy.terms_.set(7, { stake: 2, reference: 1n, day: DAY, score: 1, settled: true, reward: 0n }), /already settled/],
      ["not bought", (s) => s.economy.terms_.set(7, { stake: 0, reference: 0n, day: 0, score: 0, settled: false, reward: 0n }), /not bought/],
      ["read fails", (s) => (s.economy.fail = "down"), /Cannot read the game/],
    ];
    for (const [, arrange, error, now] of cases) {
      const s = setup({ now });
      s.economy.terms_.set(7, { stake: 2, reference: 1n, day: DAY, score: 1, settled: false, reward: 0n });
      s.gameViews.setGame({ mode: "daily", gameId: 7 }, { game: game(7, true), tiles: [], builder: {} as never, characters: [] });
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

  test("not configured: a ViewError, no call", async () => {
    const callContract = vi.fn();
    const views = new RpcEconomyViews({ callContract }, resolveEconomyDeployment({ base }), createEconomyCodecs());
    await expect(views.quote(1)).rejects.toBeInstanceOf(ViewError);
    expect(callContract).not.toHaveBeenCalled();
  });
});
