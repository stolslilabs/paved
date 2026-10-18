import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestCobbles } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD, FakeClaimer } from "@paved/chain/testing";
import { App } from "../src/App";
import { toast } from "../src/components/ui/sonner";
import type { GameSigner } from "../src/data";
import { useCompletionStore } from "../src/data/completion-memory";
import { queryClient } from "../src/lib/query-client";
import { weekOfDay } from "../src/lib/quest-window";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { errorToastTexts, preloadPages } from "./route-helpers";

// `/quests/:day?` and `/achievements` (P9) on `@paved/chain`'s fakes: the fixture indexer (its clock is `now`), the Cobbles
// ledger of `FakeGameViews` and `FakeClaimer`'s claims, through the app's own query client and store.

const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);
const WEEK = weekOfDay(TODAY)!;
const PAST = TODAY - 2;
const daily = (questId: number, task: number, total: number, cobbles: number): QuestCobbles => ({ questId, cobbles, kind: "daily", task, total, start: 0, interval: 86_400 });
/** A weekly with Cobbles, Monday-start, as v2a defines them (quest 14, three games a week). */
const WEEKLY_DEF = {
  quest_id: 14, start_time: 345_600, end_time: 0, duration: 604_800, interval: 604_800, tasks: [{ task_id: 1, total: 3 }], conditions: [], defined_at: 1_791_000_000,
  retired: false, retired_at: null, cobbles: 15, cobbles_kind: "weekly",
};

type Counts = Record<number, number>;

/**
 * Ada's quests and achievements on the fixture indexer (`counts` by quest id; `done` achievement counts), the same sums in
 * the ledger, and a signer: the claimer (`claims`), a board's signer without claims (`board`), or none.
 */
function setup(options: { signer?: "claims" | "board" | "none"; counts?: Counts; weekly?: boolean; achievements?: Counts; claimedAchievements?: bigint } = {}) {
  const fakes = fakeSources();
  const { views, fixture } = fakes;
  const counts: Counts = options.counts ?? { 1: 1, 4: 2_700 };
  const achievements: Counts = options.achievements ?? { 2: 1, 3: 1 };
  const quests = new Map(Object.entries(counts).map(([id, count]) => [Number(id), { count, completed_at: FIXTURE_HEAD.timestamp - 60 }]));
  fixture.progress.set(FIXTURE_ADA, { quests, achievements: new Map(Object.entries(achievements).map(([id, count]) => [Number(id), { count, completed_at: FIXTURE_HEAD.timestamp - 60 }])) });
  if (options.weekly) fixture.quests = [...fixture.quests, WEEKLY_DEF];
  for (const rate of [daily(1, 1, 1, 5), daily(2, 2, 6, 10), daily(3, 4, 1, 5), daily(4, 3, 3000, 15)]) views.questRates.set(rate.questId, rate);
  if (options.weekly) views.questRates.set(14, { questId: 14, cobbles: 15, kind: "weekly", task: 1, total: 3, start: 345_600, interval: 604_800 });
  views.achievementRates.set(2, { achievementId: 2, cobbles: 10, task: 1, total: 1 });
  views.achievementRates.set(3, { achievementId: 3, cobbles: 20, task: 1, total: 10 });
  // The ledger counts what the indexer shows: the tasks of quests 1 to 4 are games, structures, forests, points.
  const sums = { games: Math.min(counts[1] ?? 0, 1), structures: counts[2] ?? 0, forests: counts[3] ?? 0, points: counts[4] ?? 0, claimed: 0n, credit: false };
  const ada = views.cobblePlayer(FIXTURE_ADA);
  ada.account = { ...ada.account, cobbles: 240, games: achievements[2] ?? 0, achievementsClaimed: options.claimedAchievements ?? 0n };
  ada.days.set(TODAY, { ...sums });
  ada.days.set(PAST, { ...sums });
  ada.weeks.set(WEEK, { ...sums, games: counts[14] ?? 0 });
  const claimer = new FakeClaimer(views, FIXTURE_ADA);
  const board = { address: FIXTURE_ADA, build: vi.fn(), discard: vi.fn(), surrender: vi.fn() };
  const signer = options.signer ?? "claims";
  fakes.sources.signer = (signer === "claims" ? claimer : signer === "board" ? board : null) as GameSigner | null;
  return { ...fakes, claimer, ada };
}

function open(path: string, s: ReturnType<typeof setup>) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} />);
  return router;
}

// The pill and the rail both hold the balance in the DOM (the breakpoint shows one).
const balance = async (value: number) => (await screen.findAllByRole("img", { name: `${value} Cobbles` }, { timeout: 3000 }))[0];
const claimButton = (cobbles: number, title: string | RegExp) => screen.findByRole("button", { name: typeof title === "string" ? `Claim ${cobbles} Cobbles: ${title}` : title }, { timeout: 3000 });

preloadPages("quests", "achievements");

beforeEach(() => {
  queryClient.clear();
  useCompletionStore.setState({ announced: {}, last: {} });
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("/quests/:day? (P9)", () => {
  it("shows the day's quests on the indexer's clock, each reward in Cobbles, and the balance", async () => {
    open("/quests", setup());
    // The page's module is loaded with the first visit: in jsdom it can take longer than findBy's 1 s.
    expect(await screen.findByRole("heading", { level: 1, name: "Quests" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await balance(240)).toBeInTheDocument();
    // Quest 1 done today, its 5 Cobbles to claim; quest 4 not done, its 15 shown.
    expect(await claimButton(5, "Daily Run")).toBeEnabled();
    expect(screen.getAllByRole("img", { name: "+15 Cobbles" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Free games" })).toBeInTheDocument();
  });

  it("a claim goes through the signer for today, and the balance follows its receipt", async () => {
    const s = setup();
    open("/quests", s);
    await userEvent.click(await claimButton(5, "Daily Run"));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
    expect(await balance(245)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim 5 Cobbles: Daily Run" })).not.toBeInTheDocument();
  });

  it("Claim all is one multicall of every completed, unclaimed quest of the page", async () => {
    const s = setup({ counts: { 1: 1, 3: 1, 4: 2_700 } });
    open("/quests", s);
    await userEvent.click(await screen.findByRole("button", { name: /^Claim all/ }, { timeout: 3000 }));
    await waitFor(() => expect(s.claimer.sent).toHaveLength(1));
    expect(s.claimer.sent[0]).toEqual([
      { kind: "quest", questId: 1, period: TODAY },
      { kind: "quest", questId: 3, period: TODAY },
    ]);
    expect(await balance(250)).toBeInTheDocument();
  });

  it("the daily and the weekly free games: claimed once every quest of the kind is done, then counted", async () => {
    const s = setup({ counts: { 1: 1, 2: 6, 3: 1, 4: 3_000, 14: 3 }, weekly: true });
    open("/quests", s);
    await userEvent.click(await screen.findByRole("button", { name: "Claim the daily free game" }, { timeout: 3000 }));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "credit", credit: "daily", period: TODAY }]]));
    expect(await screen.findByLabelText("1 free game left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim the weekly free game" }));
    await waitFor(() => expect(s.claimer.sent[1]).toEqual([{ kind: "credit", credit: "weekly", period: WEEK }]));
    expect(await screen.findByLabelText("2 free games left")).toBeInTheDocument();
    // A weekly quest is claimed for its week number.
    await userEvent.click(await claimButton(15, /^Claim 15 Cobbles: Weekly/));
    await waitFor(() => expect(s.claimer.sent[2]).toEqual([{ kind: "quest", questId: 14, period: WEEK }]));
  });

  it("a past day stays claimable: its claim names that day", async () => {
    const s = setup();
    open(`/quests/${PAST}`, s);
    expect(await screen.findByText("Closed day", {}, { timeout: 3000 })).toBeInTheDocument();
    await userEvent.click(await claimButton(5, "Daily Run"));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: PAST }]]));
    expect(await balance(245)).toBeInTheDocument();
  });

  it("a refused claim says why, and the reads are reconciled", async () => {
    const s = setup();
    s.ada.days.set(TODAY, { games: 0, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
    const error = vi.spyOn(toast, "custom");
    open("/quests", s);
    await userEvent.click(await claimButton(5, "Daily Run"));
    await waitFor(() => expect(errorToastTexts(error)).toEqual([expect.stringMatching(/^The claim did not go through: .*Not completed yet/)]));
    expect(await balance(240)).toBeInTheDocument();
  });

  it("a failed ledger read leaves the quests shown, without their Cobbles", async () => {
    const s = setup();
    s.views.cobblesFail = new Error("Setup address is not configured");
    open("/quests", s);
    expect(await screen.findByText("Daily Run", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Could not load the quests")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("with no signer: a guest, asked to connect, nothing to claim", async () => {
    open("/quests", setup({ signer: "none" }));
    expect(await screen.findByText("Connect to see your quests", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("with a signer that cannot claim: read only, Connect to claim", async () => {
    open("/quests", setup({ signer: "board" }));
    expect(await screen.findByText("Connect to claim", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await claimButton(5, "Daily Run")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Claim all/ })).not.toBeInTheDocument();
  });
});

describe("the completion toast, once per completion (P9's note)", () => {
  it("survives a remount: a cached-then-fresh read toasts nothing twice, and a completion made away is announced on return", async () => {
    const s = setup();
    const success = vi.spyOn(toast, "success");
    const router = open("/quests", s);
    await claimButton(5, "Daily Run");
    expect(success).not.toHaveBeenCalled();

    // Quest 4 completes: the next read (a focus, a claim's receipt) toasts it once.
    s.fixture.progress.get(FIXTURE_ADA)!.quests.set(4, { count: 3_000, completed_at: FIXTURE_HEAD.timestamp });
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));

    // Away and back: the cache answers first, then the fresh read; neither is news.
    await act(() => router.navigate("/achievements"));
    await screen.findByRole("heading", { level: 1, name: "Achievements" });
    // Quest 3 completes while the page is closed.
    s.fixture.progress.get(FIXTURE_ADA)!.quests.set(3, { count: 1, completed_at: FIXTURE_HEAD.timestamp });
    await act(() => router.navigate("/quests"));
    await screen.findByRole("heading", { level: 1, name: "Quests" });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await new Promise((r) => setTimeout(r, 100));
    expect(success).toHaveBeenCalledTimes(2);
    expect(success.mock.calls.map(([title]) => title)).toEqual([expect.stringMatching(/^Quest completed/), expect.stringMatching(/^Quest completed/)]);
  });
});

describe("/achievements (P9)", () => {
  it("shows each achievement's Cobbles; a claim, then Claim all as one multicall", async () => {
    const s = setup({ achievements: { 2: 1, 3: 10 } });
    s.ada.account.games = 10;
    open("/achievements", s);
    expect(await balance(240)).toBeInTheDocument();
    await userEvent.click(await claimButton(10, "Settler I"));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "achievement", achievementId: 2 }]]));
    expect(await balance(250)).toBeInTheDocument();
    // Only Settler II is left to claim: Claim all sends it alone.
    await userEvent.click(await screen.findByRole("button", { name: /^Claim all/ }));
    await waitFor(() => expect(s.claimer.sent[1]).toEqual([{ kind: "achievement", achievementId: 3 }]));
    expect(await balance(270)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Summary" })).queryByRole("button", { name: /^Claim all/ })).not.toBeInTheDocument();
  });

  it("with a signer that cannot claim: read only", async () => {
    open("/achievements", setup({ signer: "board" }));
    expect(await screen.findByText("Connect to claim", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await claimButton(10, "Settler I")).toBeDisabled();
  });
});
