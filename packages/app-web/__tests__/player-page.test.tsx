// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, configure, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { FakeGameViews, IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { PlayerPage } from "../src/pages/Player";
import { renderPage } from "./helpers/page-fixtures";

// A cold CI run is slow on the first render: the library's 1 s default is too tight.
configure({ asyncUtilTimeout: 5000 });

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
  describe("quests and achievements", () => {
    const withViews = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => {
      const views = new FakeGameViews();
      views.currentTournament = FIXTURE_TOURNAMENT;
      return player(FIXTURE_ADA, { views, ...opts });
    };
    const region = (name: string) => within(screen.getByRole("region", { name }));

    it("their quests of today and their achievements, from the indexer; the definitions list stays on the quests screen", async () => {
      withViews();
      await screen.findByRole("list", { name: "Daily quests" });
      expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT}`);
      expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/achievements`);
      expect(fixture.requests).not.toContain("/v1/definitions");
      expect(region("Daily quests").getByText("2,700 / 3,000 points")).toBeTruthy();
      await screen.findByTestId("achievement-points");
      expect(screen.getByTestId("achievement-points").textContent).toBe("Achievement points: 10");
      expect(screen.queryByText("What counts")).toBeNull();
      expect(screen.getByTestId("progress-lag").textContent).toContain("Up to date");
      // The page's own lag line is the profile's.
      expect(screen.getByTestId("lag").textContent).toContain("Up to date");
    });

    it("another player's progress is theirs: Bo has none", async () => {
      withViews({ path: `/player/${FIXTURE_BO}` });
      await screen.findByRole("list", { name: "Daily quests" });
      expect(fixture.requests).toContain(`/v1/players/${FIXTURE_BO}/quests?day=${FIXTURE_TOURNAMENT}`);
      expect(region("Daily quests").getByText("0 / 3,000 points")).toBeTruthy();
      expect(region("Daily quests").queryByText(/Completed/)).toBeNull();
      await screen.findByText("Achievement points: 0");
    });

    it("the day picker reads another day for this player, and a day with no quest says so", async () => {
      fixture.questsFromDay = FIXTURE_TOURNAMENT;
      withViews();
      await screen.findByRole("list", { name: "Daily quests" });
      fireEvent.change(screen.getByLabelText("Day"), { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
      await screen.findByText("No quest on this day.");
      expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT - 1}`);
    });

    it("quests unavailable do not hide the player: the profile still shows, the quests say why with Retry", async () => {
      withViews();
      await screen.findByRole("heading", { name: "Ada" });
      await screen.findByRole("list", { name: "Daily quests" });
      cleanup();
      fixture.state.status = "loading";
      withViews();
      expect((await screen.findAllByText("Quests unavailable: the indexer is starting")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Retry").length).toBeGreaterThan(0);
    });

    it("a stale refresh keeps the quests, marked stale next to the reason", async () => {
      withViews();
      await screen.findByRole("list", { name: "Daily quests" });
      fixture.state.down = true;
      await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
      await screen.findByTestId("progress-lag-stale");
      expect(screen.getByTestId("progress-lag-stale").textContent).toContain("Stale: Quests unavailable: the indexer cannot be reached");
      expect(region("Daily quests").getByText("2,700 / 3,000 points")).toBeTruthy();
    });

    it("no reward, prize or claim is shown with the quests", async () => {
      withViews();
      await screen.findByRole("list", { name: "Achievements list" });
      expect(region("Daily quests").queryByText(/reward|prize|claim/i)).toBeNull();
      expect(region("Achievements").queryByText(/reward|prize|claim/i)).toBeNull();
    });
  });
});
