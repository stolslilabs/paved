// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeGameViews, IndexerClient, MAX_TOURNAMENT_ID } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { LeaderboardPage } from "../src/pages/Leaderboard";
import { renderPage } from "./helpers/page-fixtures";

afterEach(cleanup);

let fixture: FixtureIndexer;
let indexer: IndexerClient;
/** Requests whose path matches are held until `release()`; every other request goes straight through. */
let hold: { match: RegExp; release: () => void } | null;
beforeEach(() => {
  fixture = new FixtureIndexer();
  hold = null;
  const slow = async (input: RequestInfo | URL, init?: RequestInit) => {
    const gate = hold;
    if (gate && gate.match.test(String(input))) await new Promise<void>((resolve) => (gate.release = resolve));
    return fixture.fetch(input);
  };
  indexer = new IndexerClient({ url: "http://indexer.test", fetch: slow as typeof fetch });
});
const holdRequests = (match: RegExp) => {
  hold = { match, release: () => {} };
  return () => act(async () => hold!.release());
};

const board = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => {
  const views = new FakeGameViews();
  views.currentTournament = FIXTURE_TOURNAMENT;
  return renderPage({ page: <LeaderboardPage />, path: "/leaderboard", route: "/leaderboard/:tournamentId?", indexer, views, ...opts });
};

describe("Leaderboard page", () => {
  it("no indexer URL: says unavailable, asks nothing, shows no rows", async () => {
    board({ indexer: null });
    expect(screen.getByText("Leaderboard unavailable")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(fixture.requests).toEqual([]);
  });

  it("loading, then today's board with rank, name, best score, games and prize slots", async () => {
    board();
    expect(screen.getByText("Loading leaderboard…")).toBeTruthy();
    await screen.findByText("Ada");
    expect(fixture.requests).toContain(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard?limit=20&offset=0`);
    const rows = screen.getAllByRole("row");
    // header + 20 rows
    expect(rows).toHaveLength(21);
    const ada = within(rows[1]);
    expect(ada.getByText("1")).toBeTruthy();
    expect(ada.getByText("187")).toBeTruthy();
    expect(ada.getByText("3")).toBeTruthy();
    expect(screen.getByTestId("lag").textContent).toContain("Up to date");
    expect(screen.getByText("1–20 of 41")).toBeTruthy();
  });

  it("one player holding several prize slots shows both, another shows one, another none; no amount anywhere", async () => {
    board();
    await screen.findByText("Ada");
    expect(screen.getByText("1st and 3rd (2 slots)")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    const bo = screen.getByText("Bo").closest("tr")!;
    expect(within(bo).getByText("–")).toBeTruthy();
    // a player without a name shows a short id and links to their page
    const nameless = screen.getByText(/^0x000000…22ac$/);
    expect(nameless.getAttribute("href")).toMatch(/^\/player\/0x0{59}722ac$/);
    expect(screen.queryByText(/\$TILE/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/claim(?!s)/i);
    expect(screen.getByText(/Prizes and claims are read from the contract/)).toBeTruthy();
  });

  it("pages with limit and offset", async () => {
    board();
    await screen.findByText("Ada");
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("21–40 of 41");
    expect(fixture.requests).toContain(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard?limit=20&offset=20`);
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("41–41 of 41");
    expect((screen.getByText("Next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Previous"));
    await screen.findByText("21–40 of 41");
  });

  it("a past day through the day picker", async () => {
    board();
    await screen.findByText("Ada");
    const picker = screen.getByLabelText("Day") as HTMLSelectElement;
    expect(within(picker).getByText(/\(today\)/)).toBeTruthy();
    expect(picker.options).toHaveLength(3);
    fireEvent.change(picker, { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
    await screen.findByText("No finished games on this day yet.");
    expect(fixture.requests).toContain(`/v1/tournaments/${FIXTURE_TOURNAMENT - 1}/leaderboard?limit=20&offset=0`);
    expect(screen.getByTestId("where").textContent).toContain(`/leaderboard/${FIXTURE_TOURNAMENT - 1}`);
  });

  it("a day from the route is read as it is", async () => {
    board({ path: `/leaderboard/${FIXTURE_TOURNAMENT}` });
    await screen.findByText("Ada");
  });

  it("empty: a day nobody finished a game on", async () => {
    fixture.entries.clear();
    board();
    expect(await screen.findByText("No finished games on this day yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("behind by a few blocks: says how many, rows stay", async () => {
    fixture.state.behind = 3;
    board();
    await screen.findByText("Ada");
    expect(screen.getByTestId("lag").textContent).toContain("Updated 3 blocks behind");
    expect(screen.getByTestId("lag").textContent).not.toContain("late");
    fixture.state.behind = 1;
    cleanup();
    board();
    await screen.findByText("Ada");
    expect(screen.getByTestId("lag").textContent).toContain("Updated 1 block behind");
  });

  it("far behind: marked late", async () => {
    fixture.state.behind = 40;
    board();
    await screen.findByText("Ada");
    expect(screen.getByTestId("lag").textContent).toContain("Updated 40 blocks behind: scores may be late");
  });

  it.each([
    ["loading", /the indexer is starting/],
    ["rewinding", /catching up after a chain reorganisation/],
    ["halted", /the indexer is halted/],
  ] as const)("a %s indexer: unavailable, no rows", async (status, text) => {
    fixture.state.status = status;
    board();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("unreachable indexer: unavailable with a retry that reads again", async () => {
    fixture.state.down = true;
    board();
    expect(await screen.findByText(/the indexer cannot be reached/)).toBeTruthy();
    fixture.state.down = false;
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("Ada");
  });

  it("another API version: unavailable", async () => {
    fixture.state.version = 2;
    board();
    expect(await screen.findByText(/another API version/)).toBeTruthy();
  });

  it("a failed refresh of the same page keeps its rows, marked stale, and the next success clears it", async () => {
    board();
    await screen.findByText("Ada");
    fixture.state.down = true;
    // The page becoming visible again reads the same day and page again.
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    await screen.findByTestId("stale");
    expect(screen.getByTestId("stale").textContent).toContain("Stale: Leaderboard unavailable: the indexer cannot be reached");
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("1–20 of 41")).toBeTruthy();
    fixture.state.down = false;
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(screen.queryByTestId("stale")).toBeNull());
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("a page change shows no row of the other page while it loads", async () => {
    board();
    await screen.findByText("Ada");
    const release = holdRequests(/offset=20/);
    fireEvent.click(screen.getByText("Next"));
    expect(await screen.findByText("Loading leaderboard…")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("1–20 of 41")).toBeNull();
    await release();
    await screen.findByText("21–40 of 41");
    expect(screen.queryByText("Ada")).toBeNull();
  });

  it("a page change that fails shows the failure with Retry, not the other page's rows as stale", async () => {
    board();
    await screen.findByText("Ada");
    fixture.state.down = true;
    fireEvent.click(screen.getByText("Next"));
    expect(await screen.findByText(/the indexer cannot be reached/)).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByTestId("stale")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    fixture.state.down = false;
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("21–40 of 41");
  });

  it("a day change shows no row of the other day while it loads, and the picker keeps its labels", async () => {
    board();
    await screen.findByText("Ada");
    const release = holdRequests(new RegExp(`/tournaments/${FIXTURE_TOURNAMENT - 1}/leaderboard`));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
    expect(await screen.findByText("Loading leaderboard…")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("Day") as HTMLSelectElement).options).toHaveLength(3);
    await release();
    await screen.findByText("No finished games on this day yet.");
  });

  it("a day change that fails shows the failure, not the other day's rows as stale", async () => {
    board();
    await screen.findByText("Ada");
    fixture.state.down = true;
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
    expect(await screen.findByText(/the indexer cannot be reached/)).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByTestId("stale")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a day outside the list: its option is labelled by its own answer, never another day's", async () => {
    const outside = FIXTURE_TOURNAMENT + 5;
    const release = holdRequests(new RegExp(`/tournaments/${outside}/leaderboard`));
    board({ path: `/leaderboard/${outside}` });
    await waitFor(() => expect(within(screen.getByLabelText("Day")).getByText(`Day ${outside}`)).toBeTruthy());
    await release();
    await screen.findByText("No finished games on this day yet.");
    // Once its own answer is in, the label comes from that answer's start time, not "Day <id>".
    expect(within(screen.getByLabelText("Day")).queryByText(`Day ${outside}`)).toBeNull();
    expect(fixture.requests).toContain(`/v1/tournaments/${outside}/leaderboard?limit=20&offset=0`);
  });

  it("no day to show and the list of days failed: the failure with a Retry, not a loading text", async () => {
    const views = new FakeGameViews();
    views.currentTournamentId = () => Promise.reject(new Error("rpc down"));
    fixture.state.down = true;
    board({ views });
    expect(await screen.findByText(/the indexer cannot be reached/)).toBeTruthy();
    expect(screen.queryByText("Loading leaderboard…")).toBeNull();
    fixture.state.down = false;
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("Ada");
  });

  it("no day to show and the list of days is empty: No tournament yet", async () => {
    const views = new FakeGameViews();
    views.currentTournamentId = () => Promise.reject(new Error("rpc down"));
    fixture.tournaments = [];
    board({ views });
    expect(await screen.findByText("No tournament yet")).toBeTruthy();
    expect(screen.queryByText("Loading leaderboard…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the node down: today is the newest day the indexer lists", async () => {
    const views = new FakeGameViews();
    views.currentTournamentId = () => Promise.reject(new Error("rpc down"));
    board({ views });
    await screen.findByText("Ada");
    expect(fixture.requests.some((r) => r.startsWith(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard`))).toBe(true);
  });

  it("the player's own row is marked", async () => {
    board({ player: { id: FIXTURE_BO, name: "Bo", master: "0x1" } });
    await screen.findByText("Ada");
    expect(screen.getByText(/\(you\)/).closest("tr")!.textContent).toContain("Bo");
    void FIXTURE_ADA;
  });

  it("a day above what the API serves is not a tournament, and is never asked", async () => {
    board({ path: `/leaderboard/${MAX_TOURNAMENT_ID + 1}` });
    expect(await screen.findByText("Not a tournament")).toBeTruthy();
    expect(fixture.requests.every((r) => !r.includes(String(MAX_TOURNAMENT_ID + 1)))).toBe(true);
  });

  it("a malformed day in the route", async () => {
    board({ path: "/leaderboard/abc" });
    expect(await screen.findByText("Not a tournament")).toBeTruthy();
    expect(fixture.requests.every((r) => !r.includes("abc"))).toBe(true);
  });
});
