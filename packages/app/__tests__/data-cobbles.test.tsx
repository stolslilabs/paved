import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { weekOfDay as chainWeekOfDay, type Definitions, type GameViews, type QuestCobbles } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD, FakeClaimer } from "@paved/chain/testing";
import type { GameSigner } from "../src/data";
import {
  cobbleKeys,
  completionMemory,
  firstQuestDay,
  questCobbles,
  useAchievementRewards,
  useClaims,
  useCobbleAccount,
  useFreeCredits,
  useIndexerNow,
  useQuestRewards,
} from "../src/data";
import { weekOfDay } from "../src/lib/quest-window";
import { dataOf, fakeSources, renderData } from "./data-fakes";

const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);
const WEEK = weekOfDay(TODAY)!;
const daily = (questId: number, task: number, total: number, cobbles: number): QuestCobbles => ({ questId, cobbles, kind: "daily", task, total, start: 0, interval: 86_400 });

/** The fakes with Ada's ledger: the fixture's four dailies with Cobbles, 240 Cobbles, achievement 2 claimed, quest 1 done today. */
function ledger(options: { signer?: boolean } = {}) {
  const fakes = fakeSources();
  const { views } = fakes;
  for (const rate of [daily(1, 1, 1, 5), daily(2, 2, 6, 10), daily(3, 4, 1, 5), daily(4, 3, 3000, 15)]) views.questRates.set(rate.questId, rate);
  views.achievementRates.set(2, { achievementId: 2, cobbles: 10, task: 1, total: 1 });
  views.achievementRates.set(3, { achievementId: 3, cobbles: 20, task: 1, total: 10 });
  const ada = views.cobblePlayer(FIXTURE_ADA);
  ada.account = { ...ada.account, cobbles: 240, credits: 1, games: 1, achievementsClaimed: 1n << 2n };
  ada.days.set(TODAY, { games: 1, structures: 0, forests: 0, points: 2_700, claimed: 0n, credit: false });
  ada.weeks.set(WEEK, { games: 3, structures: 0, forests: 0, points: 0, claimed: 1n << 14n, credit: true });
  const claimer = new FakeClaimer(views, FIXTURE_ADA);
  if (options.signer) fakes.sources.signer = claimer as unknown as GameSigner;
  return { ...fakes, claimer, ada };
}

describe("the calendar", () => {
  it("the app's week of a day is the chain's (the ledger's weeks, Monday to Sunday from 1970-01-05)", () => {
    for (const day of [0, 3, 4, 10, 11, 20_737, 20_738, TODAY]) expect(weekOfDay(day), String(day)).toBe(chainWeekOfDay(day));
  });

  it("the first quest day is the first definition's", () => {
    const defs = { quests: [{ definedAt: 5 * 86_400 + 10, startTime: 0 }, { definedAt: 9 * 86_400, startTime: 12 * 86_400 }], achievements: [] } as unknown as Definitions;
    expect(firstQuestDay(defs)).toBe(5);
    expect(firstQuestDay({ quests: [], achievements: [] })).toBeNull();
  });
});

describe("the indexer's clock", () => {
  it("is the served block's time, ticking from its read", async () => {
    const { sources, fixture } = ledger();
    const { result } = renderData(() => useIndexerNow(), sources);
    await waitFor(() => expect(result.current.now).not.toBeNull());
    expect(result.current.now! - FIXTURE_HEAD.timestamp).toBeLessThanOrEqual(1);
    expect(fixture.requests).toEqual(["/v1/head"]);
  });
});

describe("useQuestRewards", () => {
  it("each quest's Cobbles from the definitions, the day's and the week's claims, the balance and the credits", async () => {
    const { sources, views } = ledger();
    const { result } = renderData(() => useQuestRewards(FIXTURE_ADA, TODAY), sources);
    expect(await dataOf(result)).toEqual({
      cobbles: [
        { questId: 1, cobbles: 5, kind: "daily" },
        { questId: 2, cobbles: 10, kind: "daily" },
        { questId: 3, cobbles: 5, kind: "daily" },
        { questId: 4, cobbles: 15, kind: "daily" },
      ],
      day: { claimed: 0n, credit: false },
      week: { claimed: 1n << 14n, credit: true },
      balance: 240,
      credits: 1,
    });
    const id = BigInt(FIXTURE_ADA);
    expect(views.calls.sort()).toEqual([`account ${id}`, `day_progress ${id} ${TODAY}`, `week_progress ${id} ${WEEK}`].sort());
  });

  it("a day before week 0 has no week to read: nothing claimed in it", async () => {
    const { sources, views } = ledger();
    const { result } = renderData(() => useQuestRewards(FIXTURE_ADA, 2), sources);
    expect((await dataOf(result))?.week).toEqual({ claimed: 0n, credit: false });
    expect(views.calls.some((c) => c.startsWith("week_progress"))).toBe(false);
  });

  it("null without the Cobbles views; disabled without a player or a day", async () => {
    const { sources } = ledger();
    const { game, tiles, builder, initialSeed, currentDay, entryPrice, spawnPaused, guardian, tutorialClaimed } = sources.views;
    const plain: GameViews = { game, tiles, builder, initialSeed, currentDay, entryPrice, spawnPaused, guardian, tutorialClaimed };
    const without = renderData(() => useQuestRewards(FIXTURE_ADA, TODAY), { ...sources, views: plain });
    expect(without.result.current).toMatchObject({ data: null, isPending: false });
    const guest = renderData(() => useQuestRewards(null, TODAY), sources);
    expect(guest.result.current.data).toBeUndefined();
  });

  it("stops pending when a read fails", async () => {
    const { sources, views } = ledger();
    views.cobblesFail = new Error("rpc down");
    const { result } = renderData(() => useQuestRewards(FIXTURE_ADA, TODAY), sources);
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isPending).toBe(false);
  });

  it("a quest whose Cobbles' kind disagrees with its duration is left out: no Claim for a period the scene does not show", () => {
    const def = (questId: number, duration: number, cobblesKind: "daily" | "weekly" | null, cobbles = 5) =>
      ({ questId, startTime: 0, endTime: 0, duration, interval: duration, tasks: [], conditions: [], definedAt: 0, retired: false, retiredAt: null, cobbles, cobblesKind });
    const defs: Definitions = { quests: [def(1, 86_400, "daily"), def(2, 604_800, "weekly"), def(3, 86_400, "weekly"), def(4, 86_400, null, 0)], achievements: [] };
    expect(questCobbles(defs).map((q) => [q.questId, q.kind])).toEqual([[1, "daily"], [2, "weekly"]]);
  });
});

describe("useAchievementRewards, useCobbleAccount, useFreeCredits", () => {
  it("the achievements with Cobbles (On the Podium has none), the claimed ones and the balance", async () => {
    const { sources } = ledger();
    const { result } = renderData(() => useAchievementRewards(FIXTURE_ADA), sources);
    const data = await dataOf(result);
    expect(data?.cobbles.map((a) => a.achievementId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(data?.cobbles.find((a) => a.achievementId === 4)?.cobbles).toBe(40);
    expect(data).toMatchObject({ claimed: 4n, balance: 240 });
  });

  it("the account, and the free games left", async () => {
    const { sources } = ledger();
    expect((await dataOf(renderData(() => useCobbleAccount(FIXTURE_ADA), sources).result))?.cobbles).toBe(240);
    expect(await dataOf(renderData(() => useFreeCredits(FIXTURE_ADA), sources).result)).toBe(1);
  });
});

describe("useClaims", () => {
  it("read only without a signer that claims", () => {
    const { sources } = ledger();
    expect(renderData(() => useClaims(FIXTURE_ADA), sources).result.current.claimer).toBeNull();
    const board = { address: FIXTURE_ADA, build: async () => ({}), discard: async () => ({}), surrender: async () => ({}) } as unknown as GameSigner;
    expect(renderData(() => useClaims(FIXTURE_ADA), { ...sources, signer: board }).result.current.claimer).toBeNull();
  });

  it("a claim's receipt goes into the cache, then one reconciling read of the ledger", async () => {
    const { sources, views, claimer } = ledger({ signer: true });
    const { result, client } = renderData(() => ({ rewards: useQuestRewards(FIXTURE_ADA, TODAY), claims: useClaims(FIXTURE_ADA) }), sources);
    await waitFor(() => expect(result.current.rewards.data).toBeTruthy());
    views.calls.length = 0;
    let release!: () => void;
    claimer.gate = new Promise((r) => (release = r));
    let sent!: Promise<unknown>;
    act(() => {
      sent = result.current.claims.claim(1, [{ kind: "quest", questId: 1, period: TODAY }]);
    });
    await waitFor(() => expect(result.current.claims.claiming).toBe(1));
    // Before the receipt the cache still says unclaimed.
    expect(client.getQueryData(cobbleKeys.account(FIXTURE_ADA))).toMatchObject({ cobbles: 240 });
    release();
    await act(() => sent);
    // The receipt's event: balance 245 and quest 1 claimed for the day.
    expect(client.getQueryData(cobbleKeys.account(FIXTURE_ADA))).toMatchObject({ cobbles: 245 });
    await waitFor(() => expect(result.current.rewards.data).toMatchObject({ balance: 245, day: { claimed: 2n } }));
    expect(claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]);
    // One reconciling read per ledger key, and no read after it: nothing polls.
    await waitFor(() => expect(views.calls.filter((c) => c.startsWith("account"))).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(views.calls.filter((c) => c.startsWith("account"))).toHaveLength(1);
    expect(result.current.claims.claiming).toBeNull();
  });

  it("a refusal is the hook's error, and the reads are reconciled", async () => {
    const { sources, views } = ledger({ signer: true });
    const { result } = renderData(() => useClaims(FIXTURE_ADA), sources);
    await act(async () => {
      await result.current.claim(2, [{ kind: "quest", questId: 2, period: TODAY }]).catch(() => {});
    });
    await waitFor(() => expect(result.current.error).toMatchObject({ name: "ClaimRefusedError", reason: "not-completed" }));
    expect((await views.account(FIXTURE_ADA)).cobbles).toBe(240);
  });
});

describe("the completion toasts' memory", () => {
  it("per player and kind: the last list of a scope, the keys announced", () => {
    const ada = completionMemory(FIXTURE_ADA, "quest");
    // The same player, written another way, shares the memory.
    const same = completionMemory(`0x${BigInt(FIXTURE_ADA).toString(16)}`, "quest");
    ada.remember(TODAY, [{ id: 1, intervalId: TODAY, completed: false }]);
    ada.announce(["quest:1:20739"]);
    expect(same.previous(TODAY)).toEqual([{ id: 1, intervalId: TODAY, completed: false }]);
    expect(same.previous(TODAY + 1)).toBeNull();
    expect(same.announced().has("quest:1:20739")).toBe(true);
    expect(completionMemory(FIXTURE_ADA, "achievement").previous(undefined)).toBeNull();
    expect(completionMemory("0x9", "quest").announced().size).toBe(0);
  });
});
