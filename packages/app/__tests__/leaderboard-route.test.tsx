import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_ADA, FIXTURE_CY, FIXTURE_TOURNAMENT } from "@paved/chain/testing";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

// `/leaderboard/:day?` and `/player/:id` (P8) on `@paved/chain`'s fixture indexer, through the app's own query client.

const DAY = FIXTURE_TOURNAMENT;
const PAST = DAY - 1;
/** Rank 38 of the fixture's 41 players: not on the first page of 20. */
const FAR = `0x${(0x1000 + 34).toString(16).padStart(64, "0")}`;

function open(path: string, options: { address?: string | null } = {}) {
  const f = fakeSources();
  f.views.today = DAY;
  const address = options.address === undefined ? FIXTURE_ADA : options.address;
  f.fixture.names[FIXTURE_ADA] = "Ada";
  const wallet = fakeWallet({ address: address ?? undefined, restored: address !== null });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, ...f };
}

/** The "20 of 41 players ranked" line: its figures are in their own spans. */
const ranked = (text: string, timeout = 3000) => screen.findByText((_, el) => el?.tagName === "P" && el.textContent === text, {}, { timeout });

const ranking = async () => within(await screen.findByRole("list", { name: "Ranking" }, { timeout: 5000 }));

beforeEach(() => {
  // A memory router leaves the window's history entry as it was: a redirect of an earlier test would answer Back's check.
  window.history.replaceState(null, "");
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/leaderboard (P8)", { timeout: 15_000 }, () => {
  it("today, by the chain's day: the first page of 20, the connected player's row outlined", async () => {
    const { fixture } = open("/leaderboard");
    const list = await ranking();
    expect(list.getAllByRole("button")).toHaveLength(20);
    expect(await ranked("20 of 41 players ranked")).toBeInTheDocument();
    expect(fixture.requests.some((r) => r.startsWith(`/v1/tournaments/${DAY}/leaderboard?`) && r.includes("limit=20") && r.includes("offset=0"))).toBe(true);
    // Ada, the wallet's player: outlined, named by the indexer's cache.
    const ada = list.getByText("Ada").closest("button")!;
    expect(ada).toHaveAttribute("aria-current", "true");
    expect(ada).toHaveTextContent("(you)");
    expect(list.getAllByRole("button").filter((b) => b.hasAttribute("aria-current"))).toHaveLength(1);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("paging: Show more reads the next page, and the last page ends the button", async () => {
    const { fixture } = open("/leaderboard", { address: null });
    await ranking();
    const more = await screen.findByRole("button", { name: "Show more" });
    await userEvent.click(more);
    expect(await ranked("40 of 41 players ranked")).toBeInTheDocument();
    expect(fixture.requests.some((r) => r.startsWith(`/v1/tournaments/${DAY}/leaderboard?`) && r.includes("offset=20"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await ranked("41 of 41 players ranked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("a player below the page: their row is read apart and shown after it", async () => {
    const { fixture } = open("/leaderboard", { address: FAR });
    await ranking();
    const own = within(await screen.findByRole("list", { name: "Your rank" }));
    expect(own.getByText("(you)")).toBeInTheDocument();
    expect(fixture.requests.some((r) => r.includes(`/v1/players/${FAR}/tournaments/${DAY}`))).toBe(true);
  });

  it("a past day: its picker date, a closed notice; the picker steps back and forth through the route", async () => {
    const { fixture, router } = open(`/leaderboard/${PAST}`);
    fixture.entries.set(PAST, [
      { rank: 1, player_id: FIXTURE_CY, best_score: 150, best_game_id: 5, games_played: 1, games_finished: 1, finished_at: 1791840000, name: null },
    ]);
    expect(await screen.findByText(/This day is closed/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await ranked("1 of 1 players ranked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/leaderboard"));
    expect(await ranked("20 of 41 players ranked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/leaderboard/${PAST}`));
  });

  it("a day after today, or not a number, is today", async () => {
    open(`/leaderboard/${DAY + 5}`);
    expect(await ranked("20 of 41 players ranked", 5000)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("an empty day, closed and today", async () => {
    const closed = open(`/leaderboard/${PAST}`);
    expect(await screen.findByText("Nobody finished a game this day", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(closed.fixture.requests.some((r) => r.startsWith(`/v1/tournaments/${PAST}/leaderboard`))).toBe(true);
  });

  it("an empty today", async () => {
    const f = fakeSources();
    f.fixture.entries.delete(DAY);
    f.views.today = DAY;
    render(<App router={createTestRouter("/leaderboard")} sources={f.sources} connector={fakeWallet({ restored: false }).load} />);
    expect(await screen.findByText("No finished game today yet", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("a row opens the player's page", async () => {
    const { router } = open("/leaderboard", { address: null });
    const list = await ranking();
    await userEvent.click(list.getByText("Ada"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/player/${FIXTURE_ADA}`));
  });

  it("the Free mark follows the fixture indexer's `free` on a row (Cy's best game), and only there", async () => {
    open("/leaderboard", { address: null });
    const list = await ranking();
    const marks = list.getAllByText("Free");
    expect(marks).toHaveLength(1);
    expect(marks[0].closest("button")).toHaveTextContent("0x");
    expect(list.getByText("Ada").closest("button")).not.toHaveTextContent("Free");
  });

  it("no mark on a day of paid games", async () => {
    const { fixture } = open(`/leaderboard/${PAST}`, { address: null });
    fixture.entries.set(PAST, [{ rank: 1, player_id: FIXTURE_CY, best_score: 150, best_game_id: 5, games_played: 1, games_finished: 1, finished_at: 1791840000, free: false, name: null }]);
    await ranking();
    expect(screen.queryByText("Free")).toBeNull();
  });

  it("the lag notice: quiet when up to date, a warning once the indexer is behind", async () => {
    const quiet = open("/leaderboard", { address: null });
    expect(await screen.findByText("Up to date")).toBeInTheDocument();
    expect(screen.queryByText(/scores may be late/)).toBeNull();
    expect(quiet.fixture.requests).toContain("/v1/head");
  });

  it("the lag notice: behind by more than the client allows", async () => {
    const f = fakeSources();
    f.views.today = DAY;
    f.fixture.state.behind = 12;
    render(<App router={createTestRouter("/leaderboard")} sources={f.sources} connector={fakeWallet({ restored: false }).load} />);
    expect(await screen.findByText(/Updated 12 blocks behind: scores may be late/, {}, { timeout: 5000 })).toBeInTheDocument();
    // The rows are real, only late.
    expect(await ranked("20 of 41 players ranked")).toBeInTheDocument();
  });

  it("an indexer that is down: the error with Retry", async () => {
    const f = fakeSources();
    f.views.today = DAY;
    f.fixture.state.down = true;
    render(<App router={createTestRouter("/leaderboard")} sources={f.sources} connector={fakeWallet({ restored: false }).load} />);
    expect(await screen.findByText("Could not load the ranking", {}, { timeout: 8000 })).toBeInTheDocument();
    f.fixture.state.down = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await ranked("20 of 41 players ranked", 8000)).toBeInTheDocument();
  });
});

describe("/player/:id (P8)", { timeout: 15_000 }, () => {
  it("the stats, today's rank and the games of a player; Back with nothing before goes to the leaderboard", async () => {
    const { router, fixture } = open(`/player/${FIXTURE_ADA}`);
    expect(await screen.findByText("Ada", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(await screen.findByText("#1")).toBeInTheDocument();
    expect(await screen.findByText("Challenge games")).toBeInTheDocument();
    const games = within(await screen.findByRole("list", { name: "Games" }));
    expect(games.getAllByRole("listitem")).toHaveLength(2);
    expect(fixture.requests.some((r) => r.startsWith(`/v1/players/${FIXTURE_ADA}/games`))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/leaderboard"));
  });

  it("Back after the leaderboard goes back to it, on the same day", async () => {
    const { router } = open(`/leaderboard/${PAST}`, { address: null });
    await screen.findByRole("heading", { level: 1, name: "Leaderboard" }, { timeout: 5000 });
    await act(() => router.navigate(`/player/${FIXTURE_CY}`));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/leaderboard/${PAST}`));
  });

  it("the Free mark on a free game of the list (the fixture's #55), and not on the others", async () => {
    open(`/player/${FIXTURE_ADA}`);
    const games = within(await screen.findByRole("list", { name: "Games" }, { timeout: 5000 }));
    const items = games.getAllByRole("listitem");
    expect(within(items[0]).queryByText("Free")).toBeNull();
    expect(within(items[1]).getByText("Free")).toBeInTheDocument();
  });

  it("another player's page is not marked as the viewer's", async () => {
    open(`/player/${FIXTURE_CY}`);
    await screen.findByText("Playing since", { exact: false }, { timeout: 5000 });
    expect(screen.queryByText("You")).toBeNull();
  });

  it("an address the indexer has never seen", async () => {
    open(`/player/0x${"1".repeat(63)}`, { address: null });
    expect(await screen.findByText("The indexer has seen no game from this address yet.", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("an id that is not an address is not found", async () => {
    open("/player/nobody", { address: null });
    expect(await screen.findByText("Page not found", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("the lag notice, and a failed read with Retry", async () => {
    const f = fakeSources();
    f.views.today = DAY;
    f.fixture.state.behind = 9;
    render(<App router={createTestRouter(`/player/${FIXTURE_ADA}`)} sources={f.sources} connector={fakeWallet({ restored: false }).load} />);
    expect(await screen.findByText(/Updated 9 blocks behind: scores may be late/, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
