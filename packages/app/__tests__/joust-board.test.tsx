import { slow } from "../test-slow";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joustOpensAt, joustWeekOf, joustWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockJoust, mockSocial } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// A Joust game's board (`/joust/:gameId`, the real board page, a Puzzle game's with the Joust's header): its number, the week's boost,
// the tile in hand for its own player.

const WEEK = joustWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);

preloadPages("board");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date((joustWeekStart(WEEK) + 86_400) * 1000) });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  // The app is unmounted and its reads are stopped before the cache is cleared: a page still mounted over a cleared cache reads again
  // from its own test's ledger, and the next test's page, on the same key, would join that read and show its answer (the failure of
  // "registers the Leader's allegiance": the test before it left a ledger with no allegiance).
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/joust/:gameId: a joust game's board", () => {
  it("names the game's number and the boost, and gives its player the tile in hand", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const joust = mockJoust(ledger);
    await mockSocial(ledger).createGuild(PLAYER_ID, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } });
    await joust.register(PLAYER_ID);
    vi.setSystemTime(new Date((joustOpensAt(WEEK) + 3_600) * 1000));
    const game = await joust.start(PLAYER_ID);
    const f = fakeSources({ joust });
    const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
    render(<App router={createTestRouter(`/joust/${game.id}`)} sources={f.sources} connector={wallet.load} />);
    expect(await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Joust 1/3 · ${game.boost} ×2` })).toBeInTheDocument();
    expect(screen.queryByText("Another player's game")).toBeNull();
  });
});
