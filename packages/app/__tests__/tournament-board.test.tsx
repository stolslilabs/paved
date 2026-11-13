import { slow } from "../test-slow";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOURNAMENT_ROUNDS, tournamentRoundName, tournamentRoundStart, tournamentWeekOf, tournamentWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockTournament } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// A Tournament game's board (`/tournament/:gameId`, the real board page, a Puzzle game's with the Tournament's header): its round,
// the tile in hand for its own player.

const WEEK = tournamentWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);

preloadPages("board");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date((tournamentWeekStart(WEEK) + 43_200) * 1000) });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  // The app is unmounted and its reads are stopped before the cache is cleared (as `joust-route.test.tsx`).
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/tournament/:gameId: a tournament game's board", () => {
  it("names the game's round, and gives its player the tile in hand", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const tournament = mockTournament(ledger);
    await tournament.register(PLAYER_ID);
    // The player's first duel: the first day they have a game to play.
    let round = 1;
    for (; round <= TOURNAMENT_ROUNDS; round++) {
      vi.setSystemTime(new Date((tournamentRoundStart(WEEK, round) + 3_600) * 1000));
      if ((await tournament.state(PLAYER_ID)).run?.status === "to-play") break;
    }
    const game = await tournament.start(PLAYER_ID);
    expect(game.round).toBe(round);
    const f = fakeSources({ tournament });
    const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
    render(<App router={createTestRouter(`/tournament/${game.id}`)} sources={f.sources} connector={wallet.load} />);
    expect(await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Tournament · ${tournamentRoundName(round)}` })).toBeInTheDocument();
    expect(screen.queryByText("Another player's game")).toBeNull();
  });
});
