/** The Cobbles of `Setup` (cobbles v1, part 1): the views through the codec, the four claims and their multicall, the typed refusals, the fakes. */
import { shortString } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { COBBLE_VIEW_FIELDS, weekOfDay, type QuestCobbles } from "../src/cobbles";
import { FakeClaimer } from "../src/cobbles-fake";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { ClaimRefusedError, WriteError, type ClaimRefusal } from "../src/writer";

const SETUP = "0x3";
const PLAYER = "0x5";
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: SETUP } } });
const codecs = createCodecs();

function views(answer: (entrypoint: string) => string[]) {
  const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
  const provider: CallProvider = {
    callContract: async (call) => {
      calls.push(call);
      return answer(call.entrypoint);
    },
  };
  return { views: new RpcGameViews(provider, deployment, codecs), calls };
}

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; execute?: () => Promise<{ transaction_hash: string }>; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => (options.execute ? options.execute() : { transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const writer = new PavedClient(options.dep ?? deployment, rpc, codecs, new FakeGameViews()).writer({ address: PLAYER, execute });
  return { writer, execute };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0][0].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)]);

describe("the Cobbles views follow Setup.json", () => {
  for (const [struct, fields] of Object.entries(COBBLE_VIEW_FIELDS)) {
    test(`${struct} has the ABI's fields, in order`, () => {
      expect(codecs.Setup.structFields(struct)).toEqual(fields);
    });
  }

  test("Setup has the four claims and the five views", () => {
    for (const fn of ["claim_quest", "claim_achievement", "claim_daily_credit", "claim_weekly_credit", "account", "day_progress", "week_progress", "quest_cobbles", "achievement_cobbles"]) {
      expect(codecs.Setup.hasFunction(fn), fn).toBe(true);
    }
  });

  test("account: the balance, the credits and the claimed bits as a bigint (bit 63 included)", async () => {
    const top = (1n << 63n) | (1n << 2n);
    const { views: v, calls } = views(() => ["0xf0", "0x2", "0x7", "0x3", "0x1", "0x0", "0x0", `0x${top.toString(16)}`, "0x8c"]);
    expect(await v.account(PLAYER)).toEqual({ cobbles: 240, credits: 2, games: 7, forests: 3, wonders: 1, big: 0, high: 0, achievementsClaimed: top, xp: 140 });
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([[3n, "account", [5]]]);
  });

  test("day_progress and week_progress: the sums, the claimed quests and the credit", async () => {
    const { views: v, calls } = views(() => ["0x2", "0x9", "0x1", "0x12c", `0x${(1n << 5n).toString(16)}`, "0x1"]);
    expect(await v.dayProgress(PLAYER, 20733)).toEqual({ games: 2, structures: 9, forests: 1, points: 300, claimed: 32n, credit: true });
    await v.weekProgress(PLAYER, 2961);
    expect(calls.map((c) => [c.entrypoint, c.calldata.map(Number)])).toEqual([["day_progress", [5, 20733]], ["week_progress", [5, 2961]]]);
  });

  test("quest_cobbles and achievement_cobbles: a kind only with Cobbles", async () => {
    expect(await views(() => ["0xf", "0x2", "0x1", "0x3", "0x54600", "0x93a80"]).views.questCobbles(14)).toEqual({
      questId: 14, cobbles: 15, kind: "weekly", task: 1, total: 3, start: 345600, interval: 604800,
    });
    expect((await views(() => ["0x5", "0x1", "0x1", "0x1", "0x0", "0x15180"]).views.questCobbles(1)).kind).toBe("daily");
    expect((await views(() => ["0x0", "0x0", "0x0", "0x0", "0x0", "0x0"]).views.questCobbles(2)).kind).toBeNull();
    expect(await views(() => ["0x28", "0x1", "0x32"]).views.achievementCobbles(4)).toEqual({ achievementId: 4, cobbles: 40, task: 1, total: 50 });
  });

  test("without Setup, a read is a not-configured ViewError; a failed call is a ViewError", async () => {
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const v = new RpcGameViews({ callContract: async () => [] }, none, codecs);
    await expect(v.account(PLAYER)).rejects.toMatchObject({ kind: "not-configured" });
    await expect(views(() => { throw new Error("rpc down"); }).views.dayProgress(PLAYER, 1)).rejects.toBeInstanceOf(ViewError);
  });
});

describe("the calendar", () => {
  test("a day's week: Monday to Sunday UTC from 1970-01-05; none before", () => {
    expect([0, 3].map(weekOfDay)).toEqual([null, null]);
    expect([4, 10, 11].map(weekOfDay)).toEqual([0, 0, 1]);
    // 2026-10-12 is a Monday (day 20738): it opens a week, and the Sunday before closes the previous one.
    expect(weekOfDay(20738)).toBe(weekOfDay(20737)! + 1);
    expect(weekOfDay(20744)).toBe(weekOfDay(20738));
  });
});

describe("the claims", () => {
  test("each claim is one call to Setup with its arguments", async () => {
    for (const [send, expected] of [
      [(w: ReturnType<typeof writerWith>["writer"]) => w.claimQuest(5, 20733), ["claim_quest", [5, 20733]]],
      [(w: ReturnType<typeof writerWith>["writer"]) => w.claimAchievement(4), ["claim_achievement", [4]]],
      [(w: ReturnType<typeof writerWith>["writer"]) => w.claimDailyCredit(20733), ["claim_daily_credit", [20733]]],
      [(w: ReturnType<typeof writerWith>["writer"]) => w.claimWeeklyCredit(2961), ["claim_weekly_credit", [2961]]],
    ] as const) {
      const { writer, execute } = writerWith();
      await send(writer);
      expect(sent(execute)).toEqual([[3n, ...expected]]);
    }
  });

  test("Claim all is one multicall, in the order given", async () => {
    const { writer, execute } = writerWith();
    await writer.claim([
      { kind: "quest", questId: 1, period: 20733 },
      { kind: "quest", questId: 14, period: 2961 },
      { kind: "credit", credit: "daily", period: 20733 },
      { kind: "achievement", achievementId: 2 },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sent(execute)).toEqual([
      [3n, "claim_quest", [1, 20733]],
      [3n, "claim_quest", [14, 2961]],
      [3n, "claim_daily_credit", [20733]],
      [3n, "claim_achievement", [2]],
    ]);
  });

  test("nothing is sent with no claim, or without Setup", async () => {
    const { writer, execute } = writerWith();
    await expect(writer.claim([])).rejects.toThrow(WriteError);
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const other = writerWith({ dep: none });
    await expect(other.writer.claimAchievement(1)).rejects.toThrow(/No Setup/);
    expect(execute).not.toHaveBeenCalled();
    expect(other.execute).not.toHaveBeenCalled();
  });

  const REVERTS: Array<[string, ClaimRefusal]> = [
    ["Setup: no cobbles", "no-cobbles"],
    ["Setup: not live", "not-live"],
    ["Setup: not completed", "not-completed"],
    ["Setup: claimed", "claimed"],
    ["Setup: no live quest", "no-live-quest"],
    ["Setup: credit claimed", "credit-claimed"],
  ];

  test.each(REVERTS)("'%s' is a ClaimRefusedError (%s), from the simulation, as text or as hex", async (reason, refusal) => {
    for (const message of [`Execution failed: ${reason}`, `Failure reason: ${shortString.encodeShortString(reason)}.`]) {
      const { writer } = writerWith({ execute: () => Promise.reject(new Error(message)) });
      const error = await writer.claimQuest(1, 2).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClaimRefusedError);
      expect(error).toMatchObject({ reason: refusal, transactionHash: undefined, reverted: false });
    }
  });

  test("a reverted receipt is a ClaimRefusedError with its hash", async () => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: "Setup: credit claimed" } });
    await expect(writer.claimDailyCredit(1)).rejects.toMatchObject({ name: "ClaimRefusedError", reason: "credit-claimed", transactionHash: "0x1", reverted: true });
  });

  test("another revert stays a WriteError", async () => {
    const { writer } = writerWith({ execute: () => Promise.reject(new Error("insufficient fee")) });
    const error = await writer.claimAchievement(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).not.toBeInstanceOf(ClaimRefusedError);
  });
});

describe("the fakes apply the contract's rules", () => {
  const DAY = 20733;
  const daily = (questId: number, task: number, total: number, cobbles: number): QuestCobbles => ({ questId, cobbles, kind: "daily", task, total, start: 0, interval: 86400 });
  function ledger() {
    const views = new FakeGameViews();
    views.questRates.set(1, daily(1, 1, 1, 5));
    views.questRates.set(5, daily(5, 4, 2, 10));
    views.achievementRates.set(2, { achievementId: 2, cobbles: 10, task: 1, total: 1 });
    views.achievementRates.set(1, { achievementId: 1, cobbles: 10, task: 10, total: 1 });
    const claimer = new FakeClaimer(views, PLAYER);
    return { views, claimer, player: views.cobblePlayer(PLAYER) };
  }

  test("a completed quest is claimed once; the balance and the claimed bit follow", async () => {
    const { views, claimer, player } = ledger();
    player.days.set(DAY, { games: 1, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
    const { events } = await claimer.claimQuest(1, DAY);
    expect(events).toEqual([{ name: "CobblesClaimed", fields: { playerId: PLAYER, kind: 1, id: 1, period: DAY, cobbles: 5, balance: 5 }, fromAddress: SETUP }]);
    expect((await views.account(PLAYER)).cobbles).toBe(5);
    expect((await views.dayProgress(PLAYER, DAY)).claimed).toBe(2n);
    await expect(claimer.claimQuest(1, DAY)).rejects.toMatchObject({ reason: "claimed" });
    await expect(claimer.claimQuest(5, DAY)).rejects.toMatchObject({ reason: "not-completed" });
    await expect(claimer.claimQuest(9, DAY)).rejects.toMatchObject({ reason: "no-cobbles" });
  });

  test("a multicall is atomic: one refusal keeps the ledger as it was", async () => {
    const { views, claimer, player } = ledger();
    player.days.set(DAY, { games: 1, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
    await expect(claimer.claim([{ kind: "quest", questId: 1, period: DAY }, { kind: "quest", questId: 5, period: DAY }])).rejects.toBeInstanceOf(ClaimRefusedError);
    expect((await views.account(PLAYER)).cobbles).toBe(0);
    expect((await views.dayProgress(PLAYER, DAY)).claimed).toBe(0n);
  });

  test("the day's free game needs every daily with Cobbles done; then once", async () => {
    const { views, claimer, player } = ledger();
    player.days.set(DAY, { games: 1, structures: 0, forests: 1, points: 0, claimed: 0n, credit: false });
    await expect(claimer.claimDailyCredit(DAY)).rejects.toMatchObject({ reason: "not-completed" });
    player.days.set(DAY, { games: 1, structures: 0, forests: 2, points: 0, claimed: 0n, credit: false });
    const { events } = await claimer.claimDailyCredit(DAY);
    expect(events[0]).toMatchObject({ name: "CreditClaimed", fields: { kind: 1, period: DAY, credits: 1 } });
    expect((await views.account(PLAYER)).credits).toBe(1);
    await expect(claimer.claimDailyCredit(DAY)).rejects.toMatchObject({ reason: "credit-claimed" });
    await expect(claimer.claimWeeklyCredit(1)).rejects.toMatchObject({ reason: "no-live-quest" });
  });

  test("achievements: the lifetime count, and First Stone from the tutorial claim", async () => {
    const { views, claimer, player } = ledger();
    await expect(claimer.claimAchievement(2)).rejects.toMatchObject({ reason: "not-completed" });
    await expect(claimer.claimAchievement(1)).rejects.toMatchObject({ reason: "not-completed" });
    player.account.games = 1;
    views.tutorialClaims.add(BigInt(PLAYER));
    await claimer.claim([{ kind: "achievement", achievementId: 2 }, { kind: "achievement", achievementId: 1 }]);
    expect(await views.account(PLAYER)).toMatchObject({ cobbles: 20, achievementsClaimed: 6n });
  });

  test("the views' reads are counted, and fail together when told to", async () => {
    const { views } = ledger();
    views.cobblesFail = new ViewError("rpc", "down");
    await expect(views.account(PLAYER)).rejects.toBeInstanceOf(ViewError);
    expect(views.calls).toEqual([`account ${BigInt(PLAYER)}`]);
  });
});
