/**
 * The purchase's two mainnet gates (E-9b, CORE's rulings, economy.md "For CLIENT"): the sanity floor against the guard
 * rate, a warning and never a refusal; and the router pin, `Economy.router()` read in the same prepare as the quote.
 */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import devnetFile from "../../../contracts/deployments/devnet.json";
import sepoliaFile from "../../../contracts/deployments/sepolia.json";
import { createCodecs, createEconomyCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";
import {
  CHAIN_MISMATCH,
  CHAIN_UNKNOWN,
  ChainMismatchError,
  MAINNET_ROUTER,
  RATE_UNAVAILABLE,
  RateUnavailableError,
  rateProblem,
  PoolQuoteBelowFloorError,
  RATE_SCALE,
  ROUTER_NOT_PINNED,
  ROUTER_UNKNOWN,
  RouterNotPinnedError,
  RpcEconomyViews,
  SANITY_FLOOR_BPS,
  createEconomyClient,
  impliedPaved,
  minOutFor,
  quoteBelowFloor,
  resolveEconomyDeployment,
  routerProblem,
  type EconomyDeploymentFile,
} from "../src/economy";
import { FAKE_CHAIN_ID, FAKE_ROUTER, FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter } from "../src/testing";

const ADDR = { Challenge: "0x2", Setup: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const PLAYER = "0x5";
/** Nums' Router V3.0.3: no `quote_swap`, never to be used (economy.md). */
const NUMS_ROUTER = "0x04505a9f06f2bd639b6601f37a4dc0908bb70e8e0e0c34b1220827d64f4fc066";
const SN_MAIN = "0x534e5f4d41494e";

/** Stake 1: a price of 2 USDC, a burn of 70 %. At this rate the burn's guard-rate value is exactly 112 PAVED. */
const BURN = 1_400_000n;
const RATE = 80n * 10n ** 30n;
const IMPLIED = 112n * 10n ** 18n;
const AT_FLOOR = (IMPLIED * 9_000n) / 10_000n; // 100.8 PAVED, exactly 90 %

const economyOn = (network: string, file?: EconomyDeploymentFile) =>
  resolveEconomyDeployment({ base: resolveDeployment({ network, file, env: { rpcUrl: "http://x", addresses: ADDR } }), file, env: ECON });

/** A pool that quotes `out` for any amount. */
class FixedPool extends FakePoolQuoter {
  constructor(public out: bigint) {
    super();
  }
  override async quoteSwap(usdcIn: bigint): Promise<bigint> {
    this.calls.push(usdcIn);
    return this.out;
  }
}

function setup(options: { network?: string; file?: EconomyDeploymentFile; router?: string; rate?: bigint; pool?: FakePoolQuoter; rpcChain?: string } = {}) {
  const economy = new FakeEconomy();
  economy.router_ = options.router ?? FAKE_ROUTER;
  economy.guardRate_ = options.rate ?? RATE;
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const spawned = { from_address: ADDR.Challenge, keys: [hash.getSelectorFromName("GameSpawned"), "0x9", "0x9"], data: ["0x1", "0x4e20", "0x1", "0x0"] };
  const rpc = {
    callContract: async () => [],
    getChainId: async () => options.rpcChain ?? FAKE_CHAIN_ID,
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [spawned] }),
  } as unknown as PavedRpc;
  const deployment = economyOn(options.network ?? "devnet", "file" in options ? options.file : FAKE_ROUTER_FILE);
  const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
  const client = new PavedClient(deployment.base, rpc, createCodecs(), gameViews);
  const pool = options.pool ?? new FixedPool(IMPLIED);
  const econWriter = createEconomyClient(deployment, client, economy, pool)!.writer(client.writer({ address: PLAYER, execute }));
  return { economy, econWriter, execute, pool, deployment };
}

const buy = (extra: { acceptedLowQuote?: boolean; confirmedMinOut?: bigint } = {}) => ({
  stake: 1,
  confirmedPrice: FAKE_UNIT,
  confirmedMinOut: 1n,
  referrer: null,
  ...extra,
});

describe("the sanity floor: implied = burn_quote x rate / RATE_SCALE, a warning below 90 % (ruling 1)", () => {
  test("the constants: Economy's RATE_SCALE (curve.cairo, 1e18) and a floor of 90 %", () => {
    expect(RATE_SCALE).toBe(10n ** 18n);
    expect(SANITY_FLOOR_BPS).toBe(9_000n);
    expect(impliedPaved(BURN, RATE)).toBe(IMPLIED);
  });

  test("implied rounds down", () => {
    expect(impliedPaved(3n, RATE_SCALE / 2n)).toBe(1n); // 1.5
    expect(impliedPaved(1n, RATE_SCALE - 1n)).toBe(0n); // 0.999…
  });

  test("89.99 % warns; exactly 90 % does not; one base unit below 90 % does", () => {
    expect(quoteBelowFloor((IMPLIED * 8_999n) / 10_000n, BURN, RATE)).toBe(true);
    expect(quoteBelowFloor(AT_FLOOR, BURN, RATE)).toBe(false);
    expect(quoteBelowFloor(AT_FLOOR - 1n, BURN, RATE)).toBe(true);
  });

  test("the comparison is exact, not on the rounded implied figure", () => {
    // implied = 1.5 base units, rounded down to 1 when shown; 90 % of 1.5 is 1.35, so a quote of 1 is below the floor.
    expect(quoteBelowFloor(1n, 3n, RATE_SCALE / 2n)).toBe(true);
    expect(quoteBelowFloor(2n, 3n, RATE_SCALE / 2n)).toBe(false);
  });

  test("a quote above implied needs no client check (the on-chain guard caps R)", () => {
    expect(quoteBelowFloor(IMPLIED * 3n, BURN, RATE)).toBe(false);
  });

  test("a rate of 0 (no guard on chain): no implied figure, no warning", () => {
    expect(impliedPaved(BURN, 0n)).toBeNull();
    expect(quoteBelowFloor(1n, BURN, 0n)).toBe(false);
  });
});

describe("the sanity floor at send: never a refusal on its own, never skipped", () => {
  test("89.99 % without the player's acceptance: PoolQuoteBelowFloorError with both figures, nothing sent", async () => {
    const low = (IMPLIED * 8_999n) / 10_000n;
    const { econWriter, execute } = setup({ pool: new FixedPool(low) });
    const error = await econWriter.purchase(buy()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PoolQuoteBelowFloorError);
    expect(error).toMatchObject({ quote: low, implied: IMPLIED, message: "The pool quote is far below the guard rate: confirm again" });
    expect(execute).not.toHaveBeenCalled();
  });

  test("89.99 % with the player's acceptance: sent, min_out from that quote", async () => {
    const low = (IMPLIED * 8_999n) / 10_000n;
    const { econWriter, execute } = setup({ pool: new FixedPool(low) });
    const plan = await econWriter.planPurchase(buy({ acceptedLowQuote: true }));
    expect(plan).toMatchObject({ poolOut: low, implied: IMPLIED, minOut: minOutFor(low) });
    await econWriter.purchase(buy({ acceptedLowQuote: true }));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("exactly 90 % and above implied: sent without any acceptance", async () => {
    for (const out of [AT_FLOOR, IMPLIED * 2n]) {
      const { econWriter, execute } = setup({ pool: new FixedPool(out) });
      await econWriter.purchase(buy());
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });

  test("confirmed without the warning, below 90 % at send: 'confirm again', nothing sent", async () => {
    const pool = new FixedPool(IMPLIED);
    const { econWriter, execute } = setup({ pool });
    // At the confirm: 100 %, no warning, so no acceptance.
    expect((await econWriter.planPurchase(buy())).implied).toBe(IMPLIED);
    pool.out = AT_FLOOR - 1n;
    await expect(econWriter.purchase(buy())).rejects.toBeInstanceOf(PoolQuoteBelowFloorError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("the guard rate rose since the confirm (same quote): the floor uses the send-time rate", async () => {
    const { economy, econWriter, execute } = setup({ pool: new FixedPool(AT_FLOOR) });
    economy.guardRate_ = RATE + RATE / 100n;
    await expect(econWriter.purchase(buy())).rejects.toBeInstanceOf(PoolQuoteBelowFloorError);
    expect(execute).not.toHaveBeenCalled();
    expect(economy.calls.filter((c) => c === "rate")).toHaveLength(1);
  });

  test("a rate of 0: any quote sends (slippage and the confirmed floor still apply)", async () => {
    const { econWriter, execute } = setup({ rate: 0n, pool: new FixedPool(10_000n) });
    expect((await econWriter.planPurchase(buy())).implied).toBeNull();
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("a rate that cannot be read: nothing sent, the pool not even quoted", async () => {
    const { economy, econWriter, execute, pool } = setup();
    economy.guardRate = async () => {
      throw new Error("rpc down");
    };
    await expect(econWriter.purchase(buy())).rejects.toThrow("Cannot read the price: rpc down");
    expect(pool.calls).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  test("the acceptance never lowers the confirmed floor", async () => {
    const pool = new FixedPool(IMPLIED);
    const { econWriter, execute } = setup({ pool });
    const confirmedMinOut = minOutFor(IMPLIED);
    pool.out = AT_FLOOR - 1n;
    await expect(econWriter.purchase(buy({ acceptedLowQuote: true, confirmedMinOut }))).rejects.toThrow("The pool price moved: confirm again");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("the router pin: Economy.router() checked in the purchase's own prepare (ruling 2)", () => {
  test("the pinned address is Ekubo's Router V3.0.13", () => {
    expect(MAINNET_ROUTER).toBe("0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e");
  });

  test("mainnet with the pinned router: the purchase is sent", async () => {
    const { econWriter, execute, deployment } = setup({ network: "mainnet", file: { chain_id: SN_MAIN }, router: MAINNET_ROUTER, rpcChain: SN_MAIN });
    expect(deployment.expectedRouter).toBe(MAINNET_ROUTER);
    expect((await econWriter.planPurchase(buy())).router).toBe(MAINNET_ROUTER);
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("the pinned router whatever its padding: still the same address", async () => {
    const { econWriter, execute } = setup({ network: "mainnet", file: { chain_id: SN_MAIN }, router: "0x199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e", rpcChain: SN_MAIN });
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["Nums' router", NUMS_ROUTER],
    ["a mock router", FAKE_ROUTER],
    ["the zero address", "0x0"],
  ])("mainnet with %s: refused with the plain message, the pool not quoted, nothing sent", async (_name, router) => {
    const { econWriter, execute, pool } = setup({ network: "mainnet", file: FAKE_ROUTER_FILE, router });
    const error = await econWriter.purchase(buy()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RouterNotPinnedError);
    expect((error as Error).message).toBe(`${ROUTER_NOT_PINNED} Nothing was sent.`);
    expect(pool.calls).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  test("mainnet by its chain id, whatever the network's name: the pin applies", () => {
    const deployment = economyOn("production", { ...FAKE_ROUTER_FILE, chain_id: SN_MAIN });
    expect(deployment.expectedRouter).toBe(MAINNET_ROUTER);
  });

  test.each(["devnet", "sepolia"])("%s: the file's MockRouter is accepted, any other router refused", async (network) => {
    const ok = setup({ network });
    await ok.econWriter.purchase(buy());
    expect(ok.execute).toHaveBeenCalledTimes(1);
    for (const router of [MAINNET_ROUTER, "0xbad"]) {
      const other = setup({ network, router });
      await expect(other.econWriter.purchase(buy())).rejects.toThrow(`${ROUTER_NOT_PINNED} Nothing was sent.`);
      expect(other.execute).not.toHaveBeenCalled();
    }
  });

  test("a mock network whose file has no MockRouter: no router is known, every purchase refused", async () => {
    const { econWriter, execute, deployment } = setup({ network: "sepolia", file: { chain_id: FAKE_CHAIN_ID, contracts: { Faucet: { address: "0x13" } } } });
    expect(deployment.expectedRouter).toBe("");
    await expect(econWriter.purchase(buy())).rejects.toThrow(`${ROUTER_UNKNOWN} Nothing was sent.`);
    expect(execute).not.toHaveBeenCalled();
  });

  test("any other network: no router is known (a MockRouter in its file is not one)", () => {
    expect(economyOn("katana", FAKE_ROUTER_FILE).expectedRouter).toBe("");
    expect(routerProblem({ expectedRouter: "" }, FAKE_ROUTER)).toBe(ROUTER_UNKNOWN);
    expect(routerProblem({ expectedRouter: FAKE_ROUTER }, "not an address")).toBe(ROUTER_NOT_PINNED);
  });

  test("the committed devnet and Sepolia files pin their own MockRouter", () => {
    const base = (network: string) => resolveDeployment({ network, env: { rpcUrl: "http://x", addresses: ADDR } });
    expect(resolveEconomyDeployment({ base: base("devnet"), file: devnetFile }).expectedRouter).toBe(devnetFile.contracts.MockRouter.address);
    expect(resolveEconomyDeployment({ base: base("sepolia"), file: sepoliaFile }).expectedRouter).toBe(sepoliaFile.contracts.MockRouter.address);
  });

  test("the committed Sepolia file configures the economy on its Faucet, with its MockRouter as the router", () => {
    const base = resolveDeployment({ network: "sepolia", file: sepoliaFile, env: { rpcUrl: "http://x" } });
    const economy = resolveEconomyDeployment({ base, file: sepoliaFile });
    expect(economy.configured).toBe(true);
    expect(economy.addresses.USDC).toBe(sepoliaFile.contracts.Faucet.address);
    expect(economy.addresses.Economy).toBe(sepoliaFile.contracts.Economy.address);
    expect(economy.expectedRouter).toBe(sepoliaFile.contracts.MockRouter.address);
  });

  test("read at every send, with the quote: a router changed since the last purchase refuses the next one", async () => {
    const { economy, econWriter, execute } = setup();
    await econWriter.purchase(buy());
    economy.router_ = "0xbad";
    await expect(econWriter.purchase(buy())).rejects.toBeInstanceOf(RouterNotPinnedError);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(economy.calls.filter((c) => c === "router")).toHaveLength(2);
  });

  test("a router that cannot be read (a class without router()): nothing sent", async () => {
    const { economy, econWriter, execute, pool } = setup();
    economy.router = async () => {
      throw new Error("Requested entrypoint does not exist in the contract");
    };
    await expect(econWriter.purchase(buy())).rejects.toThrow("Cannot read the price");
    expect(pool.calls).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("RpcEconomyViews: Economy.rate() and Economy.router() from the committed ABI", () => {
  test("rate is a u256 (two felts); router an address as 0x-hex", async () => {
    const callContract = vi.fn(async (call: { entrypoint: string }) => {
      if (call.entrypoint === "rate") return ["0x3bf380fb2442b45e9416c9f6d1a", "0x0"];
      if (call.entrypoint === "router") return ["0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e"];
      throw new Error(`unexpected ${call.entrypoint}`);
    });
    const views = new RpcEconomyViews({ callContract }, economyOn("devnet", FAKE_ROUTER_FILE), createEconomyCodecs());
    expect(await views.guardRate()).toBe(75_997_157_987_455_519_998_088_182_721_818n);
    expect(BigInt(await views.router())).toBe(BigInt(MAINNET_ROUTER));
    expect(callContract).toHaveBeenCalledWith({ contractAddress: ECON.economy, entrypoint: "router", calldata: [] });
  });
});

describe("the chain check: the RPC's chain id is the deployment's, once, before any purchase (audit t-0116, note 1)", () => {
  test("a match: checked once, then every purchase sends", async () => {
    const getChainId = vi.fn(async () => FAKE_CHAIN_ID);
    const { econWriter, execute } = setupChain(getChainId, FAKE_CHAIN_ID);
    await econWriter.purchase(buy());
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(2);
    expect(getChainId).toHaveBeenCalledTimes(1);
  });

  test("another chain: refused with the plain message, nothing read for the purchase, nothing sent, and it stays refused", async () => {
    const getChainId = vi.fn(async () => SN_MAIN);
    const { econWriter, execute, economy, pool } = setupChain(getChainId, FAKE_CHAIN_ID);
    const error = await econWriter.purchase(buy()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChainMismatchError);
    expect((error as Error).message).toBe(`${CHAIN_MISMATCH} Nothing was sent.`);
    await expect(econWriter.purchase(buy())).rejects.toBeInstanceOf(ChainMismatchError);
    expect(getChainId).toHaveBeenCalledTimes(1);
    expect(economy.calls).toHaveLength(0);
    expect(pool.calls).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  test("the same chain written another way (padding, case): a match", async () => {
    const { econWriter, execute } = setupChain(async () => "0x0534E5F5345504F4C4941", FAKE_CHAIN_ID);
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("fails closed: a deployment without chain_id, or an RPC without getChainId, refuses every purchase", async () => {
    const noId = setupChain(async () => FAKE_CHAIN_ID, "");
    await expect(noId.econWriter.purchase(buy())).rejects.toThrow(`${CHAIN_UNKNOWN} Nothing was sent.`);
    const noReader = setupChain(null, FAKE_CHAIN_ID);
    await expect(noReader.econWriter.purchase(buy())).rejects.toThrow(`${CHAIN_UNKNOWN} Nothing was sent.`);
    expect(noId.execute).not.toHaveBeenCalled();
    expect(noReader.execute).not.toHaveBeenCalled();
  });

  test("an RPC that fails to answer: refused now, asked again at the next purchase", async () => {
    const getChainId = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue(FAKE_CHAIN_ID);
    const { econWriter, execute } = setupChain(getChainId, FAKE_CHAIN_ID);
    await expect(econWriter.purchase(buy())).rejects.toThrow("Cannot read the network: fetch failed");
    expect(execute).not.toHaveBeenCalled();
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

/** A devnet economy whose deployment names `chainId` and whose RPC answers `getChainId` (none when null). */
function setupChain(getChainId: (() => Promise<string>) | null, chainId: string) {
  const economy = new FakeEconomy();
  economy.guardRate_ = RATE;
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const spawned = { from_address: ADDR.Challenge, keys: [hash.getSelectorFromName("GameSpawned"), "0x9", "0x9"], data: ["0x1", "0x4e20", "0x1", "0x0"] };
  const rpc = {
    callContract: async () => [],
    ...(getChainId ? { getChainId } : {}),
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [spawned] }),
  } as unknown as PavedRpc;
  const deployment = economyOn("devnet", { ...FAKE_ROUTER_FILE, chain_id: chainId });
  const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
  const client = new PavedClient(deployment.base, rpc, createCodecs(), gameViews);
  const pool = new FixedPool(IMPLIED);
  const econWriter = createEconomyClient(deployment, client, economy, pool)!.writer(client.writer({ address: PLAYER, execute }));
  return { economy, econWriter, execute, pool };
}

describe("mainnet, rate 0 (unexpected): refused; devnet and Sepolia unchanged (E-9c, ruling 3)", () => {
  const mainnet = { network: "mainnet", file: { chain_id: SN_MAIN }, router: MAINNET_ROUTER, rpcChain: SN_MAIN };

  test("mainnet, rate 0 (unexpected): refused, the pool not quoted, nothing sent", async () => {
    const { econWriter, execute, pool } = setup({ ...mainnet, rate: 0n });
    const error = await econWriter.purchase(buy()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateUnavailableError);
    expect((error as Error).message).toBe("Price rate unavailable; purchases are paused. Nothing was sent.");
    expect(RATE_UNAVAILABLE).toBe("Price rate unavailable; purchases are paused");
    expect(pool.calls).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  test("mainnet by chain id under another name, rate 0 (unexpected): refused", async () => {
    const { econWriter, execute } = setup({ ...mainnet, network: "production", file: { ...FAKE_ROUTER_FILE, chain_id: SN_MAIN }, rate: 0n });
    await expect(econWriter.purchase(buy())).rejects.toBeInstanceOf(RateUnavailableError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("mainnet at a rate above 0: as before", async () => {
    const { econWriter, execute } = setup({ ...mainnet, rate: 1n });
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test.each(["devnet", "sepolia"])("%s at a rate of 0: no warning, the purchase proceeds", async (network) => {
    const { econWriter, execute } = setup({ network, rate: 0n, pool: new FixedPool(1_000n) });
    expect((await econWriter.planPurchase(buy())).implied).toBeNull();
    await econWriter.purchase(buy());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("rateProblem: mainnet and 0 only", () => {
    expect(rateProblem({ mainnet: true }, 0n)).toBe(RATE_UNAVAILABLE);
    expect(rateProblem({ mainnet: true }, 1n)).toBeNull();
    expect(rateProblem({ mainnet: false }, 0n)).toBeNull();
  });
});
