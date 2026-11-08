import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockPuzzle, mockSocial } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Puzzle (Play's Limited mode) on its routes, on a mock ledger's Puzzle: Play's card, the view and its Play, a game's end, and the
// prize's mail of the chat's Inbox. The scenes' own states are `puzzle.test.tsx`'s.

/** The app at `path` on the fakes, the Puzzle the ledger's; the wallet restores `account` (the mocks' player by default). */
function open(path: string, ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 }), account = PLAYER_ID) {
  const puzzle = mockPuzzle(ledger);
  // The chat's Inbox is the social source's tab: the same ledger's.
  const f = fakeSources({ puzzle, social: mockSocial(ledger) });
  const wallet = fakeWallet({ address: account, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, puzzle, ledger };
}

vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("home", "play", "chat");

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

describe("/play: the Puzzle's card in Limited", () => {
  it("shows the card where the network has a Puzzle, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Puzzle" }, { timeout: slow(5000) });
    expect(card).toHaveTextContent("One deck for all");
    expect(screen.queryByRole("button", { name: "Coming soon" })).toBeNull();
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/puzzle"));
  });
});

describe("/play/puzzle: the day's leaderboard and Play", () => {
  it("lists the day's players and starts a game of today, its board opened", async () => {
    const { router, puzzle } = open("/play/puzzle");
    await screen.findByRole("list", { name: "Today's leaderboard" }, { timeout: slow(8000) });
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/puzzle\/\d+$/), { timeout: slow(5000) });
    const id = Number(router.state.location.pathname.split("/").pop());
    expect(await puzzle.activeGame(PLAYER_ID)).toMatchObject({ id, over: false });
  });
});

describe("/puzzle/:gameId/over: a game's end", () => {
  it("shows a finished game's score and place", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const puzzle = mockPuzzle(ledger);
    const game = await puzzle.start(PLAYER_ID);
    await puzzle.play(PLAYER_ID, game.id, { kind: "surrender" });
    open(`/puzzle/${game.id}/over`, ledger);
    expect(await screen.findByText("GAME OVER", undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Placement" })).toHaveTextContent(/#\d+/);
    expect(screen.getByRole("button", { name: "Leaderboard" })).toBeInTheDocument();
  });

  it("plays again as the current account, never as the player of another account's game", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const puzzle = mockPuzzle(ledger);
    const game = await puzzle.start(PLAYER_ID);
    await puzzle.play(PLAYER_ID, game.id, { kind: "surrender" });
    const other = "0xabc456";
    const { router } = open(`/puzzle/${game.id}/over`, ledger, other);
    await screen.findByText("GAME OVER", undefined, { timeout: slow(8000) });
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/puzzle\/\d+$/), { timeout: slow(5000) });
    const id = Number(router.state.location.pathname.split("/").pop());
    expect(id).not.toBe(game.id);
    expect(await puzzle.activeGame(other)).toMatchObject({ id, player: other });
    expect(await puzzle.activeGame(PLAYER_ID)).toBeNull();
  });
});

describe("/chat/mail/:mail: a prize's mail in the Inbox", () => {
  it("lists the welcome prize in the Inbox, opens its mail, and claims its Cobbles with its gift", async () => {
    const { router, ledger } = open("/chat/private");
    const mail = await screen.findByRole("region", { name: "Mail" }, { timeout: slow(8000) });
    await userEvent.click(within(mail).getByRole("button", { name: /you won, 250 Cobbles waiting$/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/chat\/mail\/puzzle-\d+$/));
    await userEvent.click(await screen.findByRole("button", { name: "Open the gift: 250 Cobbles" }));
    await waitFor(async () => expect((await ledger.account(PLAYER_ID)).cobbles).toBe(250), { timeout: slow(5000) });
    expect(await screen.findByRole("button", { name: "250 Cobbles, claimed" })).toBeDisabled();
  });
});
