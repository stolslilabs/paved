// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeGameViews, IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { LeaderboardPage } from "../src/pages/Leaderboard";
import { renderPage } from "./helpers/page-fixtures";

afterEach(cleanup);

let fixture: FixtureIndexer;
let indexer: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  indexer = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
});

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

  it("a failed refresh keeps the last rows, marked stale", async () => {
    board();
    await screen.findByText("Ada");
    fixture.state.down = true;
    fireEvent.click(screen.getByText("Next"));
    await screen.findByTestId("stale");
    expect(screen.getByTestId("stale").textContent).toContain("Stale: Leaderboard unavailable: the indexer cannot be reached");
    expect(screen.getByText("Ada")).toBeTruthy();
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

  it("a malformed day in the route", async () => {
    board({ path: "/leaderboard/abc" });
    expect(await screen.findByText("Not a tournament")).toBeTruthy();
    expect(fixture.requests.every((r) => !r.includes("abc"))).toBe(true);
  });
});
