import { hash, shortString } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { FAUCET_USDC_AMOUNT, LOBBY_ABI, MOCK_USDC_ABI, createCodecs } from "../src/abis";
import { AbiCodec } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import { EventReader, type EventProvider } from "../src/events";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, emptyTournament, type TournamentView } from "../src/views";
import { NoPrizeDayError, NothingToReclaimError, ReclaimAmountChangedError, WriteError } from "../src/writer";

const MOCK_USDC = "0x77";
const SPONSOR = "0x5";
const DAILY = "0x2";
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" }, mockUsdc: MOCK_USDC },
});
const codecs = createCodecs();
const u256 = (value: bigint) => [`0x${(value & ((1n << 128n) - 1n)).toString(16)}`, `0x${(value >> 128n).toString(16)}`];

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; views?: FakeGameViews; reclaimable?: bigint; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => ({ transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const client = new PavedClient(options.dep ?? deployment, rpc, codecs, options.views ?? new FakeGameViews());
  const writer = client.writer({ address: SPONSOR, execute });
  if (options.reclaimable !== undefined) {
    // The sponsorship the writer reads comes from the events: stand it in for the reader.
    vi.spyOn(client.events, "sponsorship").mockResolvedValue({ sponsored: options.reclaimable, reclaimed: 0n, reclaimable: options.reclaimable });
  }
  return { writer, execute, client };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0][0];

describe("the devnet faucet is MockUSDC.mint(self, N)", () => {
  test("mint() calls MockUSDC at contracts.MockUSDC, never the old Token", async () => {
    const { writer, execute } = writerWith();
    await writer.mint();
    const [call] = sent(execute);
    expect([BigInt(call.contractAddress), call.entrypoint]).toEqual([BigInt(MOCK_USDC), "mint"]);
    expect(call.calldata).toEqual(new AbiCodec(MOCK_USDC_ABI).encodeCall("mint", [SPONSOR, FAUCET_USDC_AMOUNT]));
    expect(BigInt(call.calldata[0])).toBe(BigInt(SPONSOR));
    expect(call.calldata.slice(1).map(BigInt)).toEqual(u256(FAUCET_USDC_AMOUNT).map(BigInt));
    expect(BigInt(call.contractAddress)).not.toBe(BigInt(deployment.addresses.Token));
  });

  test("createPlayer with mintTestToken mints USDC first, then creates the account", async () => {
    const { writer, execute } = writerWith();
    await writer.createPlayer("ada", { mintTestToken: true });
    const calls = sent(execute);
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(MOCK_USDC), "mint"], [BigInt("0x1"), "create"]]);
    await writer.createPlayer("ada", { mintTestToken: false });
    expect(execute.mock.calls[1][0].map((c) => c.entrypoint)).toEqual(["create"]);
  });

  test("a deployment with no MockUSDC offers no faucet: nothing is sent", async () => {
    const dep = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } } });
    expect(dep.mockUsdc).toBe("");
    const { writer, execute } = writerWith({ dep });
    await expect(writer.mint()).rejects.toThrow(WriteError);
    await expect(writer.createPlayer("ada", { mintTestToken: true })).rejects.toThrow(/No faucet/);
    expect(execute).not.toHaveBeenCalled();
  });

  test("the address comes from the deployments file's contracts.MockUSDC, the env first", () => {
    const file = { contracts: { MockUSDC: { address: "0x9" } } };
    const base = { network: "devnet", env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } } };
    expect(resolveDeployment({ ...base, file }).mockUsdc).toBe("0x9");
    expect(resolveDeployment({ ...base, file, env: { ...base.env, mockUsdc: "0xa" } }).mockUsdc).toBe("0xa");
    expect(resolveDeployment({ ...base, file: { contracts: { MockUSDC: { address: "0x0" } } } }).mockUsdc).toBe("");
  });
});

describe("a claim's known reverts are clear states", () => {
  const reverted = (reason: string): Receipt => ({ execution_status: "REVERTED", revert_reason: reason });
  const claim = (receipt: Receipt, rank: 1 | 2 | 3 = 1) => {
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...emptyTournament(5), over: true, prize: 0n });
    return writerWith({ receipt, views }).writer.claim(5, rank, { confirmedReward: 0n });
  };

  test("'Tournament: not found' (a top-3 claim on a day with no sponsor) is NoPrizeDayError", async () => {
    const error = await claim(reverted("Error in the called contract: 'Tournament: not found'")).catch((e) => e);
    expect(error).toBeInstanceOf(NoPrizeDayError);
    expect(error).toMatchObject({ transactionHash: "0x1", reverted: true });
    expect(error.message).toMatch(/nobody sponsored it/);
  });

  test("the node's hex short string reads the same", async () => {
    const error = await claim(reverted(shortString.encodeShortString("Tournament: not found"))).catch((e) => e);
    expect(error).toBeInstanceOf(NoPrizeDayError);
  });

  test("'Tournament: nothing to reclaim' on a claim is NothingToReclaimError", async () => {
    expect(await claim(reverted("Tournament: nothing to reclaim")).catch((e) => e)).toBeInstanceOf(NothingToReclaimError);
  });

  test("another revert stays as it is", async () => {
    const error = await claim(reverted("Tournament: already claimed")).catch((e) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).not.toBeInstanceOf(NoPrizeDayError);
    expect(error.message).toBe("Tournament: already claimed");
  });
});

describe("a sponsor reclaims a prize nobody ranked for (P-37)", () => {
  const unranked = (extra: Partial<TournamentView> = {}): FakeGameViews => {
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...emptyTournament(5), over: true, prize: 3_000_000n, ...extra });
    return views;
  };
  const reclaimed = (amount: bigint) => ({
    keys: [new AbiCodec(LOBBY_ABI).eventSelector("Reclaimed"), "0x5", SPONSOR],
    data: u256(amount),
    from_address: DAILY,
  });

  test("claim(day, 0) from the sponsor, after the confirm; the Reclaimed event of the receipt comes back", async () => {
    const receipt = { execution_status: "SUCCEEDED", events: [reclaimed(2_000_000n)] };
    const { writer, execute } = writerWith({ views: unranked(), reclaimable: 2_000_000n, receipt });
    const result = await writer.reclaim(5, { confirmedAmount: 2_000_000n });
    const [call] = sent(execute);
    expect([BigInt(call.contractAddress), call.entrypoint, call.calldata.map(BigInt)]).toEqual([BigInt(DAILY), "claim", [5n, 0n]]);
    expect(result.events.map((e) => [e.name, e.fields.amount])).toEqual([["Reclaimed", 2_000_000n]]);
  });

  test("a ranked day sends nothing: rank rewards are unchanged", async () => {
    const { writer, execute } = writerWith({ views: unranked({ top1PlayerId: "0xa1" }), reclaimable: 2_000_000n });
    await expect(writer.reclaim(5, { confirmedAmount: 2_000_000n })).rejects.toBeInstanceOf(NothingToReclaimError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("a day not over, nothing sponsored or already taken back: nothing sent", async () => {
    const open = writerWith({ views: unranked({ over: false }), reclaimable: 1n });
    await expect(open.writer.reclaim(5, { confirmedAmount: 1n })).rejects.toThrow(/not over/);
    const none = writerWith({ views: unranked(), reclaimable: 0n });
    await expect(none.writer.reclaim(5, { confirmedAmount: 0n })).rejects.toBeInstanceOf(NothingToReclaimError);
    expect(open.execute).not.toHaveBeenCalled();
    expect(none.execute).not.toHaveBeenCalled();
  });

  test("the part changed since the confirm (re-check at send): refused, nothing sent", async () => {
    const { writer, execute } = writerWith({ views: unranked(), reclaimable: 3_000_000n });
    const error = await writer.reclaim(5, { confirmedAmount: 2_000_000n }).catch((e) => e);
    expect(error).toBeInstanceOf(ReclaimAmountChangedError);
    expect(error).toMatchObject({ confirmed: 2_000_000n, current: 3_000_000n });
    expect(execute).not.toHaveBeenCalled();
  });

  test("a revert the pre-check missed (a race) is the clear state too", async () => {
    const receipt = { execution_status: "REVERTED", revert_reason: "Tournament: nothing to reclaim" };
    const { writer } = writerWith({ views: unranked(), reclaimable: 1n, receipt });
    expect(await writer.reclaim(5, { confirmedAmount: 1n }).catch((e) => e)).toBeInstanceOf(NothingToReclaimError);
  });

  test("a failed read sends nothing", async () => {
    const views = unranked();
    views.tournament = async () => {
      throw new Error("fetch failed");
    };
    const { writer, execute } = writerWith({ views, reclaimable: 1n });
    await expect(writer.reclaim(5, { confirmedAmount: 1n })).rejects.toThrow(/Cannot read the tournament/);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("what a sponsor can reclaim and what went back come from events", () => {
  const SPONSORED = hash.getSelectorFromName("Sponsored");
  const RECLAIMED = hash.getSelectorFromName("Reclaimed");
  const sponsored = (id: number, sponsor: string, amount: bigint) => ({
    keys: [SPONSORED, `0x${id.toString(16)}`],
    data: [sponsor, `0x${amount.toString(16)}`],
    from_address: DAILY,
  });
  const back = (id: number, sponsor: string, amount: bigint) => ({
    keys: [RECLAIMED, `0x${id.toString(16)}`, sponsor],
    data: u256(amount),
    from_address: DAILY,
  });

  function reader(events: Array<{ keys: string[]; data: string[]; from_address: string }>) {
    const filters: Array<{ keys: string[][] }> = [];
    const provider: EventProvider = {
      async getEvents(filter) {
        filters.push(filter);
        // The node filters by the keys: the selector and each key given.
        return { events: events.filter((e) => filter.keys.every((allowed, i) => allowed.length === 0 || allowed.some((k) => BigInt(k) === BigInt(e.keys[i] ?? "-1")))) };
      },
    };
    return { events: new EventReader(provider, deployment, codecs), filters };
  }

  test("sponsored less reclaimed, for this sponsor and this day only", async () => {
    const { events } = reader([
      sponsored(5, SPONSOR, 2_000_000n),
      sponsored(5, "0x6", 1_000_001n),
      sponsored(5, SPONSOR, 500_000n),
      sponsored(4, SPONSOR, 9n),
    ]);
    expect(await events.sponsorship(5, SPONSOR)).toEqual({ sponsored: 2_500_000n, reclaimed: 0n, reclaimable: 2_500_000n });
  });

  test("after a reclaim nothing is left to reclaim, though the day's prize keeps the historical total", async () => {
    const { events, filters } = reader([sponsored(5, SPONSOR, 2_500_000n), back(5, SPONSOR, 2_500_000n), back(5, "0x6", 1_000_001n)]);
    expect(await events.sponsorship(5, SPONSOR)).toEqual({ sponsored: 2_500_000n, reclaimed: 2_500_000n, reclaimable: 0n });
    // Reclaimed is read from Daily's address with Lobby's ABI, keyed by the day and the sponsor.
    expect(filters.map((f) => f.keys.length).sort()).toEqual([2, 3]);
  });

  test("what went back on a day, over all its sponsors", async () => {
    const { events } = reader([back(5, SPONSOR, 2_500_000n), back(5, "0x6", 1_000_001n), back(4, SPONSOR, 7n)]);
    expect(await events.reclaimedTotal(5)).toBe(3_500_001n);
    expect(await events.reclaimedTotal(9)).toBe(0n);
  });
});
