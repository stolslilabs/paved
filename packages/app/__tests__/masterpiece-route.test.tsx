import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { masterpieceEndsAt, masterpieceWeekOf, masterpieceWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockMasterpiece } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Masterpiece (the weekly individual event) on its routes, on a mock ledger's Masterpiece: Play's card, the week's view and its
// gold button (the board created, its page opened), the ranking as a view, last week's result on Monday, and no card on the chain.
// The scenes' own states are `masterpiece.test.tsx`'s, the board's `masterpiece-board.test.tsx`'s.

/** The week of 2026-11-09: the crowned wonder's. */
const WEEK = masterpieceWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
/** Monday noon. `Date` alone is faked: the timers stay real for the waits. */
const MONDAY = new Date((masterpieceWeekStart(WEEK) + 43_200) * 1000);

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Masterpiece the ledger's (none: the chain's sources); the wallet restores the mocks' player. */
function open(path: string, ledger: MockLedger | null = newLedger()) {
  const masterpiece = ledger ? mockMasterpiece(ledger) : null;
  const f = fakeSources(masterpiece ? { masterpiece } : {});
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, masterpiece };
}

vi.mock("../src/routes/pages/masterpiece-board", () => ({ default: () => <h1>Masterpiece board</h1> }));
preloadPages("home", "play");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  // The app is unmounted and its reads are stopped before the cache is cleared (`joust-route.test.tsx`'s rule): a page still mounted
  // over a cleared cache would read again from its own test's ledger into the next test's page.
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/play: the Masterpiece's card in Limited", () => {
  it("shows the card where the network has a Masterpiece, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Masterpiece" }, { timeout: slow(5000) });
    await waitFor(() => expect(card).toHaveTextContent("One crowned wonder counts · open your board"), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/masterpiece"));
    expect(await screen.findByRole("button", { name: "Open your board" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Masterpiece" })).toBeInTheDocument();
  });

  it("shows no card on the chain's sources, and says so at the view's address", async () => {
    open("/play", null);
    expect(await screen.findByRole("button", { name: /Training/ }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Masterpiece/ })).toBeNull();
    cleanup();
    open("/play/masterpiece", null);
    expect(await screen.findByText("The Masterpiece is not on this network yet.", undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/play/masterpiece: the week", () => {
  it("opens the week's board: it is created, its twelve tiles wait, its page opened", async () => {
    const { router, masterpiece } = open("/play/masterpiece");
    expect(await screen.findByRole("heading", { name: "The crowned wonder" }, { timeout: slow(8000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open your board" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/masterpiece"), { timeout: slow(5000) });
    expect((await masterpiece!.state(PLAYER_ID)).board).toMatchObject({ played: 0, waiting: 12, toCome: 72 });
  });

  it("goes straight to a board already open, its tiles counted on the button", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    await mockMasterpiece(ledger).play(PLAYER_ID, WEEK, { k: "discard" });
    const { router } = open("/play/masterpiece", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Play 11 tiles" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/masterpiece"), { timeout: slow(5000) });
  });

  it("reads the week again at midnight UTC while it is open: the new day's twelve tiles wait (#1165)", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    await mockMasterpiece(ledger).play(PLAYER_ID, WEEK, { k: "discard" });
    // Two seconds before Tuesday: the timer to midnight is real, `Date` is moved past it once the button is shown.
    vi.setSystemTime(new Date((masterpieceWeekStart(WEEK) + 86_400 - 2) * 1000));
    open("/play/masterpiece", ledger);
    expect(await screen.findByRole("button", { name: "Play 11 tiles" }, { timeout: slow(8000) })).toBeInTheDocument();
    vi.setSystemTime(new Date((masterpieceWeekStart(WEEK) + 86_400 + 1) * 1000));
    expect(await screen.findByRole("button", { name: "Play 23 tiles" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("turns to the new week at Monday 00:00 UTC while it is open, and its gold button opens the new week's board (#1165)", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) - 2) * 1000));
    const { router, masterpiece } = open("/play/masterpiece", ledger);
    expect(await screen.findByRole("heading", { name: "The crowned wonder" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play 84 tiles" })).toBeInTheDocument();
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) + 1) * 1000));
    expect(await screen.findByRole("heading", { name: "The forest" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open your board" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/masterpiece"), { timeout: slow(5000) });
    expect((await masterpiece!.state(PLAYER_ID)).board).toMatchObject({ played: 0, waiting: 12, toCome: 72 });
  });

  it("opens the new week's board from a view still showing last week's (Monday's read not landed yet)", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    // Thirty seconds before Monday: the read at midnight is far off when the button is pressed just past it.
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) - 30) * 1000));
    const { router, masterpiece } = open("/play/masterpiece", ledger);
    const play = await screen.findByRole("button", { name: "Play 84 tiles" }, { timeout: slow(8000) });
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) + 1) * 1000));
    await userEvent.click(play);
    await waitFor(() => expect(router.state.location.pathname).toBe("/masterpiece"), { timeout: slow(5000) });
    expect((await masterpiece!.state(PLAYER_ID)).board).toMatchObject({ played: 0, waiting: 12 });
  });

  it("opens the ranking as a view, its Back returning to the week", async () => {
    const { router } = open("/play/masterpiece");
    await userEvent.click(await screen.findByRole("button", { name: "Ranking" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe("?view=ranking"));
    expect(await screen.findByRole("heading", { name: "Hall of Masterpieces" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Records by kind" })).getAllByRole("listitem")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(router.state.location.pathname).toBe("/play/masterpiece");
  });

  it("shows last week's result on Monday beside the new week", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) + 3_600) * 1000));
    open("/play/masterpiece", ledger);
    const result = await screen.findByRole("region", { name: "Last week's masterpiece" }, { timeout: slow(8000) });
    expect(result).toHaveTextContent("Last week · the crowned wonder");
    expect(result).toHaveTextContent("Not counted");
    expect(result).toHaveTextContent("You closed no crowned wonder: nothing to count.");
    expect(screen.getByRole("heading", { name: "The forest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open your board" })).toBeInTheDocument();
  });
});
