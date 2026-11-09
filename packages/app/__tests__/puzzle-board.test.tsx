import { slow } from "../test-slow";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockPuzzle } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// A Puzzle game's board (`/puzzle/:gameId`, the real board page) as the current account sees it (#1137): its own player plays it,
// another account only watches it. The moves' sending and a switch of account are `puzzle.test.tsx`'s (`usePuzzleSession`).

/** The board of a game of the mocks' player, opened by the wallet's `account`. */
async function openGame(account: string) {
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
  const puzzle = mockPuzzle(ledger);
  const game = await puzzle.start(PLAYER_ID);
  const f = fakeSources({ puzzle });
  const wallet = fakeWallet({ address: account, restored: true });
  render(<App router={createTestRouter(`/puzzle/${game.id}`)} sources={f.sources} connector={wallet.load} />);
  return { puzzle, game };
}

preloadPages("board");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/puzzle/:gameId: whose game it is", () => {
  it("lets its own player play it: the tile in hand, no notice", async () => {
    await openGame(PLAYER_ID);
    expect(await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.queryByText("Another player's game")).toBeNull();
  });

  it("shows another account's game read-only, with the Another player's game notice, nothing sent", async () => {
    const { puzzle, game } = await openGame("0xabc456");
    expect(await screen.findByText("Another player's game", undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your tile" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Discard/ })).toBeNull();
    expect(await puzzle.game(game.id)).toMatchObject({ moves: [], over: false });
  });
});
