import { slow } from "../test-slow";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { completionLine, type CompletionToast } from "../src/components/containers/completion-toasts";
import { NOT_AVAILABLE_MESSAGE, ViewError, type QuestCobbles } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD, FakeClaimer } from "@paved/chain/testing";
import { TUTORIAL_STEPS, emptyTutorialCounts } from "@paved/game-core";
import { App } from "../src/App";
import { toast } from "../src/components/ui/sonner";
import type { GameSigner } from "../src/data";
import { useCompletionStore } from "../src/data/completion-memory";
import { queryKeys } from "../src/data/keys";
import { queryClient } from "../src/lib/query-client";
import { weekOfDay } from "../src/lib/quest-window";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { errorToastTexts, preloadPages } from "./route-helpers";

// `/missions` (P9, #832: one page, today only) on `@paved/chain`'s fakes: the fixture indexer (its clock is `now`), the Cobbles
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
// The balance is the Cobbles' plate of the balances (#620).
const balance = async (value: number) => (await screen.findAllByRole("button", { name: `${value} Cobbles: Buy packs` }, { timeout: slow(10000) }))[0];
const claimButton = (cobbles: number, title: string | RegExp) => screen.findByRole("button", { name: typeof title === "string" ? `Claim ${cobbles} Cobbles: ${title}` : title }, { timeout: slow(3000) });

preloadPages("missions", "vault");

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

/** A mission's icon (#832): a tap selects it, and the card at the top shows it. */
const tile = (title: string) => screen.findByRole("button", { name: new RegExp(`^${title}: `) }, { timeout: slow(5000) });
const card = () => within(screen.getByRole("region", { name: "Selected mission" }));
/** Selects `title` and returns its card's Claim. */
async function claimOn(title: string, cobbles: number) {
  await userEvent.click(await tile(title));
  return claimButton(cobbles, title);
}

describe("/missions (P9, #832)", () => {
  it("shows today's quests and the lifetime missions on one page, each reward in Cobbles, and the balance", async () => {
    open("/missions", setup());
    // The page's module is loaded with the first visit: in jsdom it can take longer than findBy's 1 s.
    expect(await screen.findByRole("heading", { level: 1, name: "Missions" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await balance(240)).toBeInTheDocument();
    const limited = within(screen.getByRole("region", { name: "Limited" }));
    const lifetime = within(screen.getByRole("region", { name: /^Lifetime/ }));
    expect(limited.getByRole("button", { name: "Daily Run: Cobbles to claim" })).toBeInTheDocument();
    // No tile shows Cobbles (#988): the card at the top is the one place that does.
    for (const tile of [...limited.getAllByRole("button", { name: /: (Cobbles to claim|Done|In progress|To do|Locked)$/ }), ...lifetime.getAllByRole("button")]) {
      expect(within(tile).queryByRole("img", { name: /Cobbles/ })).toBeNull();
    }
    expect(lifetime.getByRole("button", { name: /^Settler I: / })).toBeInTheDocument();
    // On arrival the first mission not done is selected: quest 2 (Daily Run is done).
    expect(card().getByRole("article")).toHaveAccessibleName("Mission #2");
    // No free games and no day picker (#832).
    expect(screen.queryByRole("region", { name: "Free games" })).not.toBeInTheDocument();
    expect(screen.queryByText(/free game/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous day" })).not.toBeInTheDocument();
    // The day's bar (#869): the chain serves no milestone before #738, so its steps and Cobbles show with no claim.
    expect(limited.getByRole("progressbar", { name: "Dailies done today" })).toHaveAttribute("aria-valuenow", "1");
    expect(limited.getByRole("img", { name: "10 Cobbles at 3 dailies done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dailies done$/ })).not.toBeInTheDocument();
  });

  it("a tap on an icon selects it; a claim from its card goes through the signer for today, and the balance follows", async () => {
    const s = setup();
    open("/missions", s);
    await userEvent.click(await claimOn("Daily Run", 5));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
    expect(await balance(245)).toBeInTheDocument();
    expect(await card().findByText("Cobbles claimed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily Run: Done" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a weekly the chain still pays (before #738) is claimed from its card for its week; no week's bonus tile any more (#976)", async () => {
    const s = setup({ counts: { 1: 1, 2: 6, 3: 1, 4: 3_000, 14: 3 }, weekly: true });
    open("/missions", s);
    // A weekly quest is claimed for its week number.
    await userEvent.click(await claimOn("Weekly Forester", 15));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 14, period: WEEK }]]));
    expect(screen.queryByRole("button", { name: /bonus/ })).not.toBeInTheDocument();
    // The week's bar shows, its gifts without a claim: the chain does not serve the week's milestones yet.
    expect(screen.getByRole("progressbar", { name: "Weeklies done this week" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.queryByRole("button", { name: /weeklies done$/ })).not.toBeInTheDocument();
  });

  it("an achievement is claimed from its card too", async () => {
    const s = setup({ achievements: { 2: 1, 3: 10 } });
    s.ada.account.games = 10;
    open("/missions", s);
    await userEvent.click(await claimOn("Settler I", 10));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "achievement", achievementId: 2 }]]));
    expect(await balance(250)).toBeInTheDocument();
    await userEvent.click(await claimOn("Settler II", 20));
    await waitFor(() => expect(s.claimer.sent[1]).toEqual([{ kind: "achievement", achievementId: 3 }]));
    expect(await balance(270)).toBeInTheDocument();
  });

  it.each(["/missions/lifetime", `/missions/${PAST}`, "/quests", `/quests/${PAST}`, "/achievements"])("%s lands on /missions, today's page", async (path) => {
    const s = setup();
    const router = open(path, s);
    await waitFor(() => expect(router.state.location.pathname).toBe("/missions"), { timeout: slow(5000) });
    expect(await screen.findByRole("heading", { level: 1, name: "Missions" }, { timeout: slow(5000) })).toBeInTheDocument();
    // Today's claim, never the old day's.
    await userEvent.click(await claimOn("Daily Run", 5));
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
  });

  it("a refused claim says why, and the reads are reconciled", async () => {
    const s = setup();
    s.ada.days.set(TODAY, { games: 0, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
    const error = vi.spyOn(toast, "custom");
    open("/missions", s);
    await userEvent.click(await claimOn("Daily Run", 5));
    await waitFor(() => expect(errorToastTexts(error)).toEqual([expect.stringMatching(/^The claim did not go through: .*Not completed yet/)]));
    expect(await balance(240)).toBeInTheDocument();
  });

  it("a failed ledger read leaves the missions shown, without their Cobbles", async () => {
    const s = setup();
    s.views.cobblesFail = new Error("Setup address is not configured");
    open("/missions", s);
    await userEvent.click(await tile("Daily Run"));
    expect(screen.queryByText("Could not load the missions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("a ledger not deployed on the network says so, the missions stay shown (#549)", async () => {
    const s = setup();
    s.views.cobblesFail = new ViewError("not-available", NOT_AVAILABLE_MESSAGE);
    open("/missions", s);
    expect(await tile("Daily Run")).toBeInTheDocument();
    expect(await screen.findByText("Rewards unavailable")).toBeInTheDocument();
    expect((await screen.findAllByText(NOT_AVAILABLE_MESSAGE)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Could not load the missions")).not.toBeInTheDocument();
  });

  it("with no signer: a guest, asked to connect, nothing to claim", async () => {
    open("/missions", setup({ signer: "none" }));
    expect(await screen.findByText("Connect to see your missions", {}, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("with a signer that cannot claim: read only, Connect to claim", async () => {
    open("/missions", setup({ signer: "board" }));
    expect(await screen.findByText("Connect to claim", {}, { timeout: slow(3000) })).toBeInTheDocument();
    await userEvent.click(await tile("Daily Run"));
    expect(card().getByText("Connect to claim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });
});

describe("the completion toast, once per completion (P9's note)", () => {
  it("survives a remount: a cached-then-fresh read toasts nothing twice, and a completion made away is announced on return", async () => {
    const s = setup();
    const success = vi.spyOn(toast, "success");
    const router = open("/missions", s);
    await tile("Daily Run");
    expect(success).not.toHaveBeenCalled();

    // Quest 4 completes: the next read (a focus, a claim's receipt) toasts it once.
    s.fixture.progress.get(FIXTURE_ADA)!.quests.set(4, { count: 3_000, completed_at: FIXTURE_HEAD.timestamp });
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));

    // Away and back: the cache answers first, then the fresh read; neither is news.
    await act(() => router.navigate("/vault"));
    await screen.findByRole("heading", { level: 1, name: "Vault" }, { timeout: slow(5000) });
    // Quest 3 completes while the page is closed.
    s.fixture.progress.get(FIXTURE_ADA)!.quests.set(3, { count: 1, completed_at: FIXTURE_HEAD.timestamp });
    await act(() => router.navigate("/missions"));
    await screen.findByRole("heading", { level: 1, name: "Missions" });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await new Promise((r) => setTimeout(r, 100));
    expect(success).toHaveBeenCalledTimes(2);
    expect(success.mock.calls.map(([title]) => title)).toEqual([expect.stringMatching(/^Mission completed/), expect.stringMatching(/^Mission completed/)]);
  });
});

describe("the completion toasts, app-wide (#595)", () => {
  it("toast on any page, the Vault here, with the reward, and once: the Missions page then adds nothing", async () => {
    const s = setup();
    const success = vi.spyOn(toast, "success");
    const router = open("/vault", s);
    // The tracker's first read is not news: Daily Run was done before.
    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.indexer.achievements(FIXTURE_ADA))).toBeDefined();
      expect(queryClient.getQueryData(queryKeys.indexer.quests(FIXTURE_ADA, TODAY))).toBeDefined();
    }, { timeout: slow(5000) });
    expect(success).not.toHaveBeenCalled();

    // A game over completes quest 4 and Settler II: the refresh after it toasts both, away from the Missions pages.
    s.fixture.progress.get(FIXTURE_ADA)!.quests.set(4, { count: 3_000, completed_at: FIXTURE_HEAD.timestamp });
    s.fixture.progress.get(FIXTURE_ADA)!.achievements.set(3, { count: 10, completed_at: FIXTURE_HEAD.timestamp });
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    // A reward's line is drawn with the Cobbles' icon (`CompletionReward`, #620); its words are `completionLine`'s.
    const line = (d: unknown) => (isValidElement<{ entry: CompletionToast }>(d) ? completionLine(d.props.entry) : d);
    const calls = Object.fromEntries(success.mock.calls.map(([title, options]) => [title, line((options as { description?: unknown }).description)]));
    expect(calls).toEqual({ "Mission completed: Mission #4": "+15 Cobbles to claim", "Lifetime mission earned: Settler II": "+20 pts · +20 Cobbles to claim" });

    await act(() => router.navigate("/missions"));
    await claimOn("Mission #4", 15);
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await new Promise((r) => setTimeout(r, 100));
    expect(success).toHaveBeenCalledTimes(2);
  }, slow(20_000));

  it("tracks nothing for a guest", async () => {
    const s = setup({ signer: "none" });
    const playerQuests = vi.spyOn(s.sources.indexer, "playerQuests");
    open("/vault", s);
    await screen.findByRole("heading", { level: 1 }, { timeout: slow(5000) });
    expect(playerQuests).not.toHaveBeenCalled();
  });
});

describe("/missions, the Tutorial (#977)", () => {
  /** The fakes with the Tutorial served, as the mock serves it: the counts and claims kept here, a claim's receipt as the mock's. */
  function tutorialSetup() {
    const s = setup();
    const state = { counts: { ...emptyTutorialCounts(), level: 1 }, claimed: 0 };
    Object.assign(s.views, { tutorialSteps: async () => ({ counts: { ...state.counts }, claimed: state.claimed }) });
    const claims: number[] = [];
    Object.assign(s.claimer, {
      claimTutorialStep: async (id: number) => {
        claims.push(id);
        state.claimed |= 1 << (id - 1);
        const cobbles = TUTORIAL_STEPS[id - 1]!.cobbles;
        s.ada.account = { ...s.ada.account, cobbles: s.ada.account.cobbles + cobbles };
        return { transactionHash: "0x1", events: [{ name: "TutorialStepClaimed", fields: { playerId: FIXTURE_ADA, step: id, cobbles, balance: s.ada.account.cobbles }, fromAddress: "0x3" }] };
      },
    });
    return { ...s, state, claims };
  }

  it("shows the open step on arrival; its Go opens the home in Edit", async () => {
    const s = tutorialSetup();
    const router = open("/missions", s);
    expect(await screen.findByRole("region", { name: /^Tutorial/ }, { timeout: slow(5000) })).toBeInTheDocument();
    await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Builder"));
    await userEvent.click(card().getByRole("button", { name: "Go: Builder" }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toMatch(/^\/\?edit/));
  });

  it("each open step's Go opens its place: Play, the PvP, the chests, the shop", async () => {
    const places: [number, string][] = [[1, "/play"], [2, "/pvp"], [4, "/village/chests"], [5, "/village/shop"]];
    const tasks = ["layout-saved", "challenge-finished", "attack-settled", "attack-won", "chest-opened"] as const;
    for (const [done, path] of places) {
      queryClient.clear();
      const s = tutorialSetup();
      for (const t of tasks.slice(0, done)) s.state.counts[t] = 1;
      const router = open("/missions", s);
      // The step open is the one after those done: Challenger, Raider, Treasure, Trader.
      await userEvent.click(await screen.findByRole("button", { name: /^Go: / }, { timeout: slow(5000) }));
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
      cleanup();
    }
  }, slow(30_000));

  it("a step completed toasts app-wide with the next step's title; its claim goes through the signer and the balance follows", async () => {
    const s = tutorialSetup();
    const success = vi.spyOn(toast, "success");
    open("/missions", s);
    await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Builder"), { timeout: slow(5000) });
    // A layout saved (the mock counts it as the write lands): the tracker reads the steps again after the indexer's next read.
    s.state.counts["layout-saved"] = 1;
    await act(() => queryClient.invalidateQueries({ queryKey: ["indexer"] }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Tutorial step done: Builder", expect.anything()), { timeout: slow(5000) });
    const [, options] = success.mock.calls.find(([title]) => title === "Tutorial step done: Builder")!;
    const description = (options as { description?: unknown }).description;
    expect(isValidElement<{ entry: CompletionToast }>(description) && completionLine(description.props.entry)).toBe("Next: Challenger · +10 Cobbles to claim");

    await userEvent.click(await screen.findByRole("button", { name: "Step 1, Builder: Cobbles to claim" }, { timeout: slow(5000) }));
    await userEvent.click(await claimButton(10, "Builder"));
    await waitFor(() => expect(s.claims).toEqual([1]));
    expect(await balance(250)).toBeInTheDocument();
    expect(await card().findByText("Cobbles claimed")).toBeInTheDocument();
    // Once: the claim's own reads toast nothing again.
    expect(success.mock.calls.filter(([title]) => String(title).startsWith("Tutorial step done"))).toHaveLength(1);
  }, slow(20_000));
});

describe("the home's missions tracker links to a mission (#978)", () => {
  function served() {
    const s = setup();
    const counts = { ...emptyTutorialCounts(), level: 1, "layout-saved": 1 };
    Object.assign(s.views, { tutorialSteps: async () => ({ counts, claimed: 0 }) });
    return s;
  }

  it("`?mission=` puts that mission on the card on arrival; a key not on the page, or not a key, falls back to the open step", async () => {
    open("/missions?mission=quest:3", served());
    await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Mission #3"), { timeout: slow(5000) });
    cleanup();
    queryClient.clear();
    open("/missions?mission=tutorial:1", served());
    await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Builder"), { timeout: slow(5000) });
    for (const bad of ["quest:99", "bonus:1"]) {
      cleanup();
      queryClient.clear();
      open(`/missions?mission=${bad}`, served());
      await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Challenger"), { timeout: slow(5000) });
    }
  }, slow(30_000));

  it("from the home: the Tutorial's step to claim first, then the open one; a tap opens the Missions page with it on the card", async () => {
    const router = open("/", served());
    const tracker = await screen.findByRole("navigation", { name: /^Missions/ }, { timeout: slow(10_000) });
    const lines = await within(tracker).findAllByRole("button", { name: /^(Builder|Challenger)/ }, { timeout: slow(10_000) });
    expect(lines.map((b) => b.getAttribute("aria-label"))).toEqual(["Builder: done, ready to claim", "Challenger: 0 of 1"]);
    await userEvent.click(lines[0]!);
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe("/missions?mission=tutorial:1"));
    await waitFor(() => expect(card().getByRole("article")).toHaveAccessibleName("Builder"), { timeout: slow(5000) });
    expect(card().getByRole("button", { name: "Claim 10 Cobbles: Builder" })).toBeInTheDocument();
  }, slow(30_000));
});
