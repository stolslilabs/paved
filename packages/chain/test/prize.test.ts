import { describe, expect, test, vi } from "vitest";
import { ABIS, createCodecs } from "../src/abis";
import { AbiCodec } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import type { PlayerGame } from "../src/events";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { claimableRanks, countedTournamentIds, rewardOf } from "../src/prize";
import { FakeGameViews, emptyTournament, type TournamentView } from "../src/views";
import { RewardChangedError, SponsorAmountChangedError, WriteError } from "../src/writer";

const codecs = createCodecs();
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const rpc = { callContract: async () => [], getEvents: async () => ({ events: [] }), waitForTransaction: async () => ({ events: [] }) } as unknown as PavedRpc;

const over = (extra: Partial<TournamentView> = {}): TournamentView => ({
  ...emptyTournament(5),
  over: true,
  prize: 600n,
  top1PlayerId: "0xa1",
  top1Score: 9,
  top2PlayerId: "0xa2",
  top2Score: 8,
  top3PlayerId: "0xa3",
  top3Score: 7,
  ...extra,
});

describe("rewardOf mirrors Tournament::reward", () => {
  test("third a sixth, second a third of the rest, first the remainder", () => {
    const t = over();
    expect([rewardOf(t, 1), rewardOf(t, 2), rewardOf(t, 3)]).toEqual([334n, 166n, 100n]);
  });
  test("empty places pay 0 and leave their share to the winner", () => {
    expect([1, 2, 3].map((r) => rewardOf(over({ top2PlayerId: "0x0", top3PlayerId: "0x0" }), r as 1))).toEqual([600n, 0n, 0n]);
    expect([1, 2, 3].map((r) => rewardOf(over({ top3PlayerId: "0x0" }), r as 1))).toEqual([400n, 200n, 0n]);
  });
  test("the three rewards add up to the prize, with rounding dust to the winner", () => {
    const t = over({ prize: 1000n });
    expect(rewardOf(t, 1) + rewardOf(t, 2) + rewardOf(t, 3)).toBe(1000n);
  });
});

describe("claimableRanks", () => {
  test("a held, unclaimed rank of a closed tournament", () => {
    expect(claimableRanks(over(), "0xa2")).toEqual([{ rank: 2, reward: 166n }]);
  });
  test("not over, already claimed, not the holder, no reward: nothing", () => {
    expect(claimableRanks(over({ over: false }), "0xa2")).toEqual([]);
    expect(claimableRanks(over({ top2Claimed: true }), "0xa2")).toEqual([]);
    expect(claimableRanks(over(), "0xb0")).toEqual([]);
    expect(claimableRanks(over({ prize: 0n }), "0xa2")).toEqual([]);
    expect(claimableRanks(over({ top1PlayerId: "0x0" }), "0x0")).toEqual([]);
  });
  test("ids compare as numbers, not strings", () => {
    expect(claimableRanks(over({ top1PlayerId: "0x00a1" }), "0xA1").map((c) => c.rank)).toEqual([1]);
  });
});

describe("countedTournamentIds", () => {
  const g = (over: boolean, mode: "daily" | "tutorial", counted: number | null): PlayerGame => ({
    mode, gameId: 1, startTime: 1, tournamentId: 0, over, score: over ? 1 : null, countedTournamentId: counted,
  });
  test("distinct, newest first, finished Daily games that counted only", () => {
    expect(countedTournamentIds([g(true, "daily", 5), g(true, "daily", 7), g(true, "daily", 5), g(true, "daily", 0), g(false, "daily", null), g(true, "tutorial", 0)])).toEqual([7, 5]);
  });
});

describe("a claim sends only the reward the player confirmed", () => {
  const claimWith = (t: TournamentView, confirmedReward: bigint, rank: 1 | 2 | 3 = 2) => {
    const views = new FakeGameViews();
    views.tournaments.set(5, t);
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const result = new PavedClient(deployment, rpc, codecs, views).writer({ address: "0x5", execute }).claim(5, rank, { confirmedReward });
    return { result, execute };
  };

  test("the confirmed reward goes through", async () => {
    const { result, execute } = claimWith(over(), 166n);
    await result;
    const calls = (execute.mock.calls[0] as unknown as [Array<{ entrypoint: string }>])[0];
    expect(calls.map((c) => c.entrypoint)).toEqual(["claim"]);
  });
  test("the reward changed since the confirm: refused, nothing sent", async () => {
    const { result, execute } = claimWith(over({ prize: 900n }), 166n);
    const error = await result.catch((e) => e);
    expect(error).toBeInstanceOf(RewardChangedError);
    expect(error).toMatchObject({ confirmed: 166n, current: 250n });
    expect(execute).not.toHaveBeenCalled();
  });
  test("already claimed, or not over: refused, nothing sent", async () => {
    for (const [t, message] of [
      [over({ top2Claimed: true }), /already claimed/],
      [over({ over: false }), /not over/],
    ] as const) {
      const { result, execute } = claimWith(t, 166n);
      await expect(result).rejects.toThrow(message);
      expect(execute).not.toHaveBeenCalled();
    }
  });
  test("a failed tournament read sends nothing", async () => {
    const views = new FakeGameViews();
    views.tournament = async () => { throw new Error("fetch failed"); };
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    await expect(new PavedClient(deployment, rpc, codecs, views).writer({ address: "0x5", execute }).claim(5, 1, { confirmedReward: 1n })).rejects.toThrow(/Cannot read the tournament/);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("a sponsor approves exactly the amount the player confirmed", () => {
  const sponsorWith = (amount: bigint, confirmedAmount: bigint) => {
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const result = new PavedClient(deployment, rpc, codecs, new FakeGameViews()).writer({ address: "0x5", execute }).sponsor(amount, { confirmedAmount });
    return { result, execute };
  };
  test("approve + sponsor in one multicall", async () => {
    const { result, execute } = sponsorWith(5n, 5n);
    await result;
    const calls = (execute.mock.calls[0] as unknown as [Array<{ entrypoint: string; calldata: string[] }>])[0];
    expect(calls.map((c) => c.entrypoint)).toEqual(["approve", "sponsor"]);
    expect(calls[0].calldata[1]).toBe("0x5");
  });
  test("another amount than the confirmed one: refused, nothing sent", async () => {
    const { result, execute } = sponsorWith(6n, 5n);
    await expect(result).rejects.toBeInstanceOf(SponsorAmountChangedError);
    expect(execute).not.toHaveBeenCalled();
  });
  test("0 is refused", async () => {
    const { result, execute } = sponsorWith(0n, 0n);
    await expect(result).rejects.toBeInstanceOf(WriteError);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("hardening of #209's review", () => {
  test("missing token decimals in the deployment is null, never 18", () => {
    const env = { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } };
    expect(resolveDeployment({ network: "devnet", env }).tokenDecimals).toBeNull();
    expect(resolveDeployment({ network: "devnet", env, file: { token: { decimals: 6 } } }).tokenDecimals).toBe(6);
    expect(resolveDeployment({ network: "devnet", env, file: { token: { decimals: 300 } } }).tokenDecimals).toBeNull();
  });

  const withEnums = (variants: Array<{ name: string; type: string; kind?: string }>) =>
    new AbiCodec([
      ...ABIS.Daily,
      { type: "enum", name: "t::Mixed", variants },
      { type: "function", name: "which", inputs: [], outputs: [{ type: "t::Mixed" }] },
    ]);
  test("an unknown code of a unit-only enum is a bare number", () => {
    const unit = withEnums([{ name: "A", type: "()" }, { name: "B", type: "()" }]);
    expect(unit.decodeResult("which", ["0x7"])).toBe(7);
  });
  test("an unknown code of an enum with a payload variant throws", () => {
    const mixed = withEnums([{ name: "A", type: "()" }, { name: "B", type: "core::integer::u32" }]);
    expect(() => mixed.decodeResult("which", ["0x7"])).toThrow(/unknown/);
    expect(mixed.decodeResult("which", ["0x0"])).toBe(0);
  });
});
