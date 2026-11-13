import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPEDITION_MAPS, expeditionEndsAt, expeditionSeasonOf, expeditionWeekOf, expeditionWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockExpedition } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Expedition (the weekly individual event) on its routes, on a mock ledger's Expedition: Play's card, the week's view and its
// gold button (the map opened, a day's tiles drawn), last week's result on Monday, and no card on the chain. The scenes' own states
// are `expedition.test.tsx`'s, the board's `expedition-board.test.tsx`'s.

const WEEK = expeditionWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MAP = EXPEDITION_MAPS[expeditionSeasonOf(WEEK)].name;
/** Monday and Tuesday noon. `Date` alone is faked: the timers stay real for the waits. */
const MONDAY = new Date((expeditionWeekStart(WEEK) + 43_200) * 1000);
const TUESDAY = new Date((expeditionWeekStart(WEEK) + 86_400 + 43_200) * 1000);

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Expedition the ledger's (none: the chain's sources); the wallet restores the mocks' player. */
function open(path: string, ledger: MockLedger | null = newLedger()) {
  const expedition = ledger ? mockExpedition(ledger) : null;
  const f = fakeSources(expedition ? { expedition } : {});
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, expedition };
}

vi.mock("../src/routes/pages/expedition-board", () => ({ default: () => <h1>Expedition board</h1> }));
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

describe("/play: the Expedition's card in Limited", () => {
  it("shows the card where the network has an Expedition, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Expedition" }, { timeout: slow(5000) });
    await waitFor(() => expect(card).toHaveTextContent(`${MAP} · open the map`), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/expedition"));
    expect(await screen.findByRole("button", { name: "Open the map" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Expedition" })).toBeInTheDocument();
  });

  it("shows no card on the chain's sources, and says so at the view's address", async () => {
    open("/play", null);
    expect(await screen.findByRole("button", { name: /Training/ }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Expedition/ })).toBeNull();
    cleanup();
    open("/play/expedition", null);
    expect(await screen.findByText("The Expedition is not on this network yet.", undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/play/expedition: the week", () => {
  it("opens the week's map: the board is created, its first six tiles drawn, its page opened", async () => {
    const { router, expedition } = open("/play/expedition");
    expect(await screen.findByRole("heading", { name: MAP }, { timeout: slow(8000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open the map" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/expedition"), { timeout: slow(5000) });
    expect((await expedition!.state(PLAYER_ID)).board).toMatchObject({ hand: 6, toCome: 36 });
  });

  it("draws a new day's tiles from the view, then opens the board", async () => {
    const ledger = newLedger();
    await mockExpedition(ledger).open(PLAYER_ID);
    vi.setSystemTime(TUESDAY);
    const { router, expedition } = open("/play/expedition", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Draw 6 tiles" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/expedition"), { timeout: slow(5000) });
    expect((await expedition!.state(PLAYER_ID)).board).toMatchObject({ hand: 12, toCome: 30, due: { drawn: 0, lost: 0 } });
  });

  it("shows last week's result on Monday beside the new week's map", async () => {
    const ledger = newLedger();
    await mockExpedition(ledger).open(PLAYER_ID);
    vi.setSystemTime(new Date((expeditionEndsAt(WEEK) + 3_600) * 1000));
    open("/play/expedition", ledger);
    const result = await screen.findByRole("region", { name: "Last week's expedition" }, { timeout: slow(8000) });
    expect(result).toHaveTextContent(`Last week · ${MAP}`);
    expect(result).toHaveTextContent("No tier reached");
    expect(within(result).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: EXPEDITION_MAPS[expeditionSeasonOf(WEEK + 1)].name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the map" })).toBeInTheDocument();
  });
});
