import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { WEEKLY_MILESTONES, WEEKLY_QUESTS } from "@paved/game-core";
import type { GameSigner } from "../src/data";
import { useMilestoneClaims, useWeeklyMilestoneClaims, useWeeklyMilestones } from "../src/data/milestones";
import { useMissionsReady } from "../src/data/missions-ready";
import { WeeklyMilestoneRefusedError, type WeeklyMilestoneViews, type WeeklyMilestoneWrites } from "../src/data/weekly-milestones";
import { MOCK_KEY, MockLedger, type TokenBalances } from "../src/data/mock/ledger";
import { MOCK_PVP_WEEKLIES, PVP_TASK, firstDayOfWeek, pvpCounts } from "../src/data/mock/weeklies";
import { MOCKED_GAME_READS, MOCKED_WRITES } from "../src/data/mock/overlay";
import { questPeriod, weekOfDay } from "../src/lib/quest-window";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation, playGame } from "./mock-fakes";

// The week's milestones on the mock (#976, PR 1 of 2): five weeklies a week, the two new ones counted from the player's
// settled PvP attacks by UTC week (Monday to Sunday), and the week's two gifts, 3 done for 50 Cobbles and 5 done for 100,
// each claimed once a week through the mock's signer, with game-core's typed refusals.

const PLAYER = FIXTURE_ADA;
const DAY = 86_400;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / DAY);
const WEEK = weekOfDay(TODAY)!;
/** Monday of the test's week, and its Sunday's last second. */
const MONDAY = firstDayOfWeek(WEEK);
const SUNDAY_END = (MONDAY + 7) * DAY - 1;
const WINNER: TokenBalances = { usdc: 100_000_000n, paved: 0n };

const clocked = (clock = { now: TODAY * DAY + 9 * 3_600 }) => ({ clock, ...mockImplementation(undefined, WINNER, () => clock.now) });

/** Settled PvP v2 attacks of the player, written into the stored state as the ledger keeps them (`StoredV2.attacks`). */
function settle(store: { data: Map<string, string> }, attacks: { stars: number; at: number; surrendered?: boolean }[]) {
  const state = JSON.parse(store.data.get(MOCK_KEY)!);
  const player = Object.values(state.players as Record<string, { v2?: { attacks: object[] } }>)[0]!;
  const list = player.v2!.attacks;
  for (const a of attacks) {
    const id = list.length + 1;
    list.push({ id, status: a.surrendered ? "surrendered" : "finished", defender: "0x7e2a0001", slots: 9, target: 900, offer: 0, cost: 0, deck: [], moves: [], openedAt: a.at - 120, score: 0, stars: a.stars, xp: 0, chest: null, gained: 0, lost: 0, finishedAt: a.at });
  }
  store.data.set(MOCK_KEY, JSON.stringify(state));
}

/** The week's weeklies done, as the mock's indexer serves them today: their ids. */
async function weekliesDoneToday(s: ReturnType<typeof clocked>): Promise<number[]> {
  const quests = (await s.sources.indexer.playerQuests(PLAYER, { day: Math.floor(s.clock.now / DAY) })).data.quests;
  return quests.filter((q) => q.completed && [14, 15, 16, 20, 21].includes(q.questId)).map((q) => q.questId);
}

/**
 * Three Challenge games played out, 10 minutes apart: on the test's clock they complete Daily Run, the four rotating dailies
 * (the fifth daily with the second game) and the three Challenge weeklies (5 forests, 30 roads and cities, 20,000 points).
 */
async function playChallengeWeek(s: ReturnType<typeof clocked>) {
  for (let i = 0; i < 3; i++) {
    if (i > 0) s.clock.now += 600;
    await playGame(s.ledger, PLAYER);
  }
  expect(await weekliesDoneToday(s)).toEqual([14, 15, 16]);
}

/** The two PvP weeklies done: 10 attacks settled this week, 15 stars among them. */
const PVP_WEEK = Array.from({ length: 10 }, (_, i) => ({ stars: i < 5 ? 3 : 0, at: MONDAY * DAY + i * 600 }));

const refusal = (e: unknown) => (e instanceof WeeklyMilestoneRefusedError ? e.reason : e);

describe("the PvP weeklies on the mock (#976)", () => {
  it("are Weekly Raider (10 attacks settled) and Weekly Stars (15 stars), live all week beside the three Challenge ones", async () => {
    const { sources } = clocked();
    expect(MOCK_PVP_WEEKLIES).toEqual([
      { questId: 20, taskId: PVP_TASK.attack, total: 10 },
      { questId: 21, taskId: PVP_TASK.stars, total: 15 },
    ]);
    const definitions = (await sources.indexer.definitions()).data;
    for (const day of [MONDAY, TODAY, MONDAY + 6]) {
      const quests = (await sources.indexer.playerQuests(PLAYER, { day })).data.quests;
      const weeklies = quests.filter((q) => {
        const d = definitions.quests.find((x) => x.questId === q.questId)!;
        return questPeriod({ start: d.startTime, interval: d.interval, duration: d.duration }) === "weekly";
      });
      expect(weeklies.map((q) => q.questId)).toEqual([14, 15, 16, 20, 21]);
      expect(weeklies).toHaveLength(WEEKLY_QUESTS);
      // The same week's window, whatever the day.
      expect(new Set(weeklies.map((q) => q.intervalId)).size).toBe(1);
    }
  });

  it("report an attack, its stars, a win and three stars as `Setup.report_pvp` does", () => {
    expect(pvpCounts(0)).toEqual({ 19: 1 });
    expect(pvpCounts(2)).toEqual({ 19: 1, 20: 2, 21: 1 });
    expect(pvpCounts(3)).toEqual({ 19: 1, 20: 3, 21: 1, 22: 1 });
  });

  it("count the settled attacks and their stars by UTC week, Monday to Sunday; a surrender counts with no star", async () => {
    const { sources, ledger, store } = clocked();
    await ledger.writesFor(PLAYER).foundFreeVillage();
    settle(store, [
      // Last week's Sunday, its last second: not this week's.
      { stars: 3, at: MONDAY * DAY - 1 },
      // This week, from Monday's first second to Sunday's last.
      { stars: 2, at: MONDAY * DAY },
      { stars: 3, at: TODAY * DAY + 3_600 },
      { stars: 0, at: TODAY * DAY + 3_700, surrendered: true },
      { stars: 1, at: SUNDAY_END },
      // Next week's Monday.
      { stars: 3, at: (MONDAY + 7) * DAY },
    ]);
    const counts = async (day: number) => Object.fromEntries((await sources.indexer.playerQuests(PLAYER, { day })).data.quests.map((q) => [q.questId, q.tasks[0]!.count]));
    const now = await counts(TODAY);
    expect([now[20], now[21]]).toEqual([4, 6]);
    const last = await counts(MONDAY - 1);
    expect([last[20], last[21]]).toEqual([1, 3]);
    const next = await counts(MONDAY + 7);
    expect([next[20], next[21]]).toEqual([1, 3]);
    // The Challenge's weeklies count no attack.
    expect([now[14], now[15], now[16]]).toEqual([0, 0, 0]);
  });

  it("count an attack the player surrenders through the mock's PvP v2 writes", async () => {
    const { sources, ledger } = clocked();
    const writes = ledger.writesFor(PLAYER);
    await writes.foundFreeVillage();
    await writes.drawOpponentV2("search");
    await writes.startAttackV2();
    const raider = async () => (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests.find((q) => q.questId === 20)!;
    expect((await raider()).tasks[0]!.count).toBe(0);
    await writes.surrenderAttackV2();
    expect(ledger.settledAttacks(PLAYER)).toEqual([{ finishedAt: TODAY * DAY + 9 * 3_600, stars: 0 }]);
    expect((await raider()).tasks[0]!.count).toBe(1);
  });

  it("complete with 10 attacks and 15 stars", async () => {
    const { sources, ledger, store } = clocked();
    await ledger.writesFor(PLAYER).foundFreeVillage();
    settle(store, Array.from({ length: 10 }, (_, i) => ({ stars: i < 5 ? 3 : 0, at: MONDAY * DAY + i * 600 })));
    const quests = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests;
    expect(quests.find((q) => q.questId === 20)).toMatchObject({ completed: true, completedAt: MONDAY * DAY + 9 * 600, tasks: [{ taskId: 19, total: 10, count: 10 }] });
    expect(quests.find((q) => q.questId === 21)).toMatchObject({ completed: true, completedAt: MONDAY * DAY + 4 * 600, tasks: [{ taskId: 20, total: 15, count: 15 }] });
  });
});

describe("the week's milestones on the mock (#976)", () => {
  it("are a read and a write of the mock's overlays", () => {
    expect(MOCKED_GAME_READS).toContain("weeklyMilestones");
    expect(MOCKED_WRITES).toContain("claimWeeklyMilestone");
  });

  it("pay 50 Cobbles at 3 weeklies done and 100 at 5, each once a week, through the signer and the views", async () => {
    const s = clocked();
    const { sources, ledger, store } = s;
    const views = sources.views as typeof sources.views & WeeklyMilestoneViews;
    const signer = sources.signer as GameSigner & WeeklyMilestoneWrites;
    expect(await views.weeklyMilestones(PLAYER, WEEK)).toEqual({ week: WEEK, claimed: 0 });
    const refused = async (step: number) => refusal(await signer.claimWeeklyMilestone(WEEK, step).catch((e: unknown) => e));
    // Nothing done: neither is reached.
    expect(await refused(0)).toBe("not-reached");
    expect(await refused(1)).toBe("not-reached");
    // The three Challenge weeklies done: three of five, the first gift reached.
    await playChallengeWeek(s);
    const balance = (await views.account(PLAYER)).cobbles;
    const first = await signer.claimWeeklyMilestone(WEEK, 0);
    expect(first.transactionHash.startsWith("0x6d6f636b")).toBe(true);
    expect(first.events).toEqual([{ name: "WeeklyMilestoneClaimed", fields: { playerId: PLAYER, week: WEEK, step: 0, cobbles: 50, balance: balance + 50 }, fromAddress: "0x3" }]);
    expect(await views.weeklyMilestones(PLAYER, WEEK)).toEqual({ week: WEEK, claimed: 0b01 });
    // Claimed once a week.
    const again = await signer.claimWeeklyMilestone(WEEK, 0).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(WeeklyMilestoneRefusedError);
    expect((again as WeeklyMilestoneRefusedError).reason).toBe("milestone-claimed");
    // Three done: the second waits for the fifth. One PvP weekly is not enough.
    expect(await refused(1)).toBe("not-reached");
    await ledger.writesFor(PLAYER).foundFreeVillage();
    settle(store, PVP_WEEK.map((a) => ({ ...a, stars: 0 })));
    expect(await weekliesDoneToday(s)).toEqual([14, 15, 16, 20]);
    expect(await refused(1)).toBe("not-reached");
    // The second PvP weekly (15 stars more): five of five, the second gift.
    settle(store, PVP_WEEK.slice(0, 5).map((a) => ({ ...a, at: a.at + 60 })));
    expect(await weekliesDoneToday(s)).toEqual([14, 15, 16, 20, 21]);
    const second = await signer.claimWeeklyMilestone(WEEK, 1);
    expect(second.events).toEqual([{ name: "WeeklyMilestoneClaimed", fields: { playerId: PLAYER, week: WEEK, step: 1, cobbles: 100, balance: balance + 150 }, fromAddress: "0x3" }]);
    expect(await views.weeklyMilestones(PLAYER, WEEK)).toEqual({ week: WEEK, claimed: 0b11 });
    expect(await refused(1)).toBe("milestone-claimed");
    // No such milestone.
    for (const step of [-1, 2, 1.5]) expect(await refused(step)).toBe("no-milestone");
    // 150 a week in all.
    expect((await views.account(PLAYER)).cobbles).toBe(balance + WEEKLY_MILESTONES.reduce((sum, m) => sum + m.cobbles, 0));
  });

  it("pays the second gift once every weekly is done: 150 a week in all", async () => {
    const { sources, ledger } = clocked();
    const writes = ledger.writesFor(PLAYER);
    let done = 5;
    // A ledger whose indexer says how many weeklies are done: the claims read only that count.
    ledger.countWeekliesWith(async () => done);
    await writes.claimWeeklyMilestone(WEEK, 1);
    await writes.claimWeeklyMilestone(WEEK, 0);
    expect(await ledger.weeklyMilestones(PLAYER, WEEK)).toEqual({ week: WEEK, claimed: 0b11 });
    expect((await sources.views.account(PLAYER)).cobbles).toBe(WEEKLY_MILESTONES.reduce((sum, m) => sum + m.cobbles, 0));
    expect((await sources.views.account(PLAYER)).cobbles).toBe(150);
    done = 0;
    expect(refusal(await writes.claimWeeklyMilestone(WEEK, 1).catch((e: unknown) => e))).toBe("milestone-claimed");
  });

  it("the week's reset: the next week's gifts are claimable again, the week before keeps its claims, and they survive a reload", async () => {
    const { ledger, store } = clocked();
    const writes = ledger.writesFor(PLAYER);
    const done = new Map<number, number>([[WEEK, 5], [WEEK + 1, 3]]);
    ledger.countWeekliesWith(async (_, week) => done.get(week) ?? 0);
    await writes.claimWeeklyMilestone(WEEK, 0);
    await writes.claimWeeklyMilestone(WEEK, 1);
    expect(await ledger.weeklyMilestones(PLAYER, WEEK + 1)).toEqual({ week: WEEK + 1, claimed: 0 });
    await writes.claimWeeklyMilestone(WEEK + 1, 0);
    expect(refusal(await writes.claimWeeklyMilestone(WEEK + 1, 1).catch((e: unknown) => e))).toBe("not-reached");
    const reloaded = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await reloaded.weeklyMilestones(PLAYER, WEEK)).toEqual({ week: WEEK, claimed: 0b11 });
    expect(await reloaded.weeklyMilestones(PLAYER, WEEK + 1)).toEqual({ week: WEEK + 1, claimed: 0b01 });
    expect((await reloaded.account(PLAYER)).cobbles).toBe(200);
    // The day's milestones are apart: none claimed.
    expect(await reloaded.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0 });
    // A week saved before the milestones (no `milestones` field) reads as none claimed, and keeps the claims made in it.
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    const player = Object.values(state.players as Record<string, { weeks: Record<string, object> }>)[0]!;
    player.weeks[WEEK + 2] = { claimed: (1n << 14n).toString(), credit: false };
    store.data.set(MOCK_KEY, JSON.stringify(state));
    const old = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await old.weeklyMilestones(PLAYER, WEEK + 2)).toEqual({ week: WEEK + 2, claimed: 0 });
    expect((await old.weekProgress(PLAYER, WEEK + 2)).claimed).toBe(1n << 14n);
  });

  it("without the indexer's count, every gift is refused as not reached", async () => {
    const ledger = new MockLedger({ starting: WINNER, store: () => null, seller: "0x3", latencyMs: 0 });
    for (const step of [0, 1]) expect(refusal(await ledger.writesFor(PLAYER).claimWeeklyMilestone(WEEK, step).catch((e: unknown) => e))).toBe("not-reached");
  });
});

describe("the week's milestones through the hooks (#976)", () => {
  it("read the week's claims and claim a gift into the cache", async () => {
    const { sources, ledger } = clocked();
    ledger.countWeekliesWith(async () => 3);
    const { result } = renderData(() => ({ week: useWeeklyMilestones(PLAYER, WEEK), claims: useWeeklyMilestoneClaims(PLAYER) }), sources);
    expect(await dataOf({ get current() { return result.current.week; } })).toEqual({ week: WEEK, claimed: 0 });
    expect(result.current.claims.claimer).not.toBeNull();
    await result.current.claims.claim(WEEK, 0);
    await waitFor(() => expect(result.current.week.data).toEqual({ week: WEEK, claimed: 0b01 }));
    expect((await sources.views.account(PLAYER)).cobbles).toBe(50);
  });

  it("read nothing where the views do not serve them (the chain before #738), and claim nothing without the signer's write", async () => {
    const { sources } = fakeSources();
    const { result } = renderData(() => ({ week: useWeeklyMilestones(PLAYER, WEEK), none: useWeeklyMilestones(null, WEEK), claims: useWeeklyMilestoneClaims(PLAYER) }), sources);
    expect(result.current.week).toEqual({ data: null, isPending: false, error: null });
    expect(result.current.none).toEqual({ data: null, isPending: false, error: null });
    expect(result.current.claims.claimer).toBeNull();
    await expect(result.current.claims.claim(WEEK, 0)).rejects.toThrow("Connect to claim");
  });
});

describe("the home's Missions count (#976)", () => {
  it("counts the gifts reached and not claimed, the day's and the week's, as no daily or weekly pays on its own", async () => {
    const s = clocked();
    const { result } = renderData(() => ({ ready: useMissionsReady(PLAYER), day: useMilestoneClaims(PLAYER), week: useWeeklyMilestoneClaims(PLAYER) }), s.sources);
    await waitFor(() => expect(result.current.ready).toBe(0));
    // The five dailies and the three Challenge weeklies done: the day's two gifts and the week's first are reached.
    await playChallengeWeek(s);
    const fresh = renderData(() => ({ ready: useMissionsReady(PLAYER), day: useMilestoneClaims(PLAYER), week: useWeeklyMilestoneClaims(PLAYER) }), s.sources);
    await waitFor(() => expect(fresh.result.current.ready).toBe(3));
    // A claim leaves it: the week's first gift, then the day's two.
    await fresh.result.current.week.claim(WEEK, 0);
    await waitFor(() => expect(fresh.result.current.ready).toBe(2));
    await fresh.result.current.day.claim(TODAY, 0);
    await fresh.result.current.day.claim(TODAY, 1);
    await waitFor(() => expect(fresh.result.current.ready).toBe(0));
  });

  it("counts no gift where the milestones are not served (the chain before #738)", async () => {
    const { sources } = fakeSources();
    const { result } = renderData(() => useMissionsReady(PLAYER), sources);
    await waitFor(() => expect(result.current).toBe(0));
  });
});
