// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { PlayerPage } from "../src/pages/Player";
import { renderPage } from "./helpers/page-fixtures";

afterEach(cleanup);

let fixture: FixtureIndexer;
let indexer: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  indexer = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
});

const player = (id: string, opts: Partial<Parameters<typeof renderPage>[0]> = {}) =>
  renderPage({ page: <PlayerPage />, path: `/player/${id}`, route: "/player/:playerId", indexer, ...opts });

describe("Player page", () => {
  it("no indexer URL: unavailable, nothing asked", () => {
    player(FIXTURE_ADA, { indexer: null });
    expect(screen.getByText("Leaderboard unavailable")).toBeTruthy();
    expect(fixture.requests).toEqual([]);
  });

  it("loading, then name, stats, tournaments and games", async () => {
    player(FIXTURE_ADA);
    expect(screen.getByText("Loading player…")).toBeTruthy();
    await screen.findByRole("heading", { name: "Ada" });
    expect(screen.getByText("Best score", { selector: "dt" }).nextElementSibling!.textContent).toBe("187");
    expect(screen.getByText("Tutorial games").nextElementSibling!.textContent).toBe("1");
    // games: the Daily one with its day, the Tutorial one without
    const games = (await screen.findAllByRole("table"))[1];
    const rows = within(games).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Daily")).toBeTruthy();
    expect(within(rows[1]).getByText("#912")).toBeTruthy();
    expect(within(rows[2]).getByText("Tutorial")).toBeTruthy();
    expect(within(rows[2]).getByText("–")).toBeTruthy();
  });

  it("their tournaments: rank, score, games and several prize slots, linking to the day", async () => {
    player(FIXTURE_ADA);
    const link = await screen.findByText(`Day ${FIXTURE_TOURNAMENT}`);
    expect(link.getAttribute("href")).toBe(`/leaderboard/${FIXTURE_TOURNAMENT}`);
    const row = link.closest("tr")!;
    await waitFor(() => expect(within(row).getByText("1st and 3rd (2 slots)")).toBeTruthy());
    expect(within(row).getByText("187")).toBeTruthy();
    expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/tournaments/${FIXTURE_TOURNAMENT}`);
  });

  it("says the Tournaments section looks only among the last 10 games", async () => {
    player(FIXTURE_ADA);
    expect(await screen.findByText("Among the last 10 games.")).toBeTruthy();
  });

  it("shows the indexer's lag", async () => {
    fixture.state.behind = 4;
    player(FIXTURE_ADA);
    await screen.findByRole("heading", { name: "Ada" });
    expect(screen.getByTestId("lag").textContent).toContain("Updated 4 blocks behind");
  });

  it("empty: a known player with no game, and an unknown one", async () => {
    player(FIXTURE_BO);
    await screen.findByText("No tournament played yet.");
    expect(screen.getByText("No games yet.")).toBeTruthy();
    cleanup();
    player("0x1234");
    expect(await screen.findByText("The indexer has no record of this player.")).toBeTruthy();
  });

  it("games page with before and next", async () => {
    // many games: one more than a page
    fixture.games = Array.from({ length: 12 }, (_, i) => ({
      contract: "daily", game_id: 100 - i, mode: 1, start_time: 1791869000 - i, tournament_id: 0, over: true, score: i, counted_tournament_id: 0, end_time: 0,
    }));
    player(FIXTURE_ADA);
    await screen.findByText("#100");
    expect(screen.queryByText("#90")).toBeNull();
    fireEvent.click(screen.getByText("Show more games"));
    await screen.findByText("#90");
    expect(screen.getByText("#89")).toBeTruthy();
    expect(screen.queryByText("Show more games")).toBeNull();
  });

  it("unreachable: unavailable with retry; halted: says so", async () => {
    fixture.state.down = true;
    player(FIXTURE_ADA);
    await screen.findAllByText(/the indexer cannot be reached/);
    cleanup();
    fixture.state.down = false;
    fixture.state.status = "halted";
    player(FIXTURE_ADA);
    await screen.findAllByText(/the indexer is halted/);
  });

  it("a malformed id asks nothing", () => {
    player("nope");
    expect(screen.getByText("Not a player id")).toBeTruthy();
    expect(fixture.requests).toEqual([]);
  });
});
