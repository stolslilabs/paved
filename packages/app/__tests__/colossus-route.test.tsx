import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { colossusEndsAt, colossusWeekOf, colossusWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockColossus } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Colossus (the weekly collective event) on its route, on a mock ledger's Colossus: Play's card, the site, a district where a
// tile of the hand is laid, the builders, and last week's Cobbles claimed. The scenes' own states are `colossus.test.tsx`'s.

const WEEK = colossusWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
/** Tuesday noon. `Date` alone is faked: the timers stay real for the waits. */
const TUESDAY = new Date((colossusWeekStart(WEEK) + 86_400 + 43_200) * 1000);

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Colossus the ledger's (none: the chain's sources, no Colossus); the wallet restores the mocks' player. */
function open(path: string, ledger: MockLedger | null = newLedger()) {
  const colossus = ledger ? mockColossus(ledger) : null;
  const f = fakeSources({ colossus });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, colossus, ledger };
}

preloadPages("home", "play");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TUESDAY });
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

describe("/play: the Colossus's card in Limited", () => {
  it("shows the card where the network has a Colossus, and opens its site", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Colossus" }, { timeout: slow(8000) });
    await waitFor(() => expect(card).toHaveTextContent(/· 6 tiles/), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/colossus"));
    expect(await screen.findByRole("region", { name: "The gauge" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Colossus" })).toBeInTheDocument();
  });

  it("shows no card on the chain's sources", async () => {
    open("/play", null);
    expect(await screen.findByRole("button", { name: /^Training/ }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Colossus" })).toBeNull();
  });
});

describe("/play/colossus: the week", () => {
  it("opens a district from the map, lays a tile of the hand there, and comes back to the site", async () => {
    const { router, colossus } = open("/play/colossus");
    await userEvent.click(await screen.findByRole("button", { name: "Build" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toMatch(/^\?lot=\d+$/));
    const lot = Number(router.state.location.search.slice(5));
    const grid = await screen.findByRole("grid", undefined, { timeout: slow(8000) });
    expect(screen.getByRole("heading", { name: /^District [A-D][1-4]$/ })).toBeInTheDocument();
    // The first tile of the hand that fits here: its marked holes come, one is tapped, Place lays it.
    const hand = within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button");
    expect(hand).toHaveLength(6);
    let option: Element | null = null;
    for (const tile of hand) {
      await userEvent.click(tile);
      await waitFor(() => expect(screen.queryByText("Looking where it fits…")).toBeNull(), { timeout: slow(5000) });
      option = grid.querySelector("[data-option]");
      if (option) break;
    }
    expect(option).not.toBeNull();
    await userEvent.click(option!);
    await userEvent.click(screen.getByRole("button", { name: /^Place/ }));
    await waitFor(() => expect(document.querySelector("[data-slot=colossus-placed]")).toHaveTextContent(/of \d+ builders/), { timeout: slow(8000) });
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button")).toHaveLength(5), { timeout: slow(5000) });
    expect((await colossus!.board(PLAYER_ID, lot)).tiles.filter((t) => t.mine)).toHaveLength(1);
    expect((await colossus!.state(PLAYER_ID)).me).toMatchObject({ tiles: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(await screen.findByRole("group", { name: "Your week" }, { timeout: slow(5000) })).toHaveTextContent("1tiles laid");
  });

  it("lists the builders at ?view=builders, named on the header", async () => {
    open("/play/colossus?view=builders");
    expect(await screen.findByRole("list", { name: "Builders by stones set" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Builders" })).toBeInTheDocument();
  });

  it("shows the closed heart at ?lot=0", async () => {
    open("/play/colossus?lot=0");
    expect(await screen.findByRole("grid", { name: "The heart, north-west quarter" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByText("The heart opens when the gauge reaches 50%.")).toBeInTheDocument();
  });

  it("shows last week's plaque on Monday, and claims its Cobbles", async () => {
    const ledger = newLedger();
    const colossus = mockColossus(ledger);
    // A tile laid this week, wherever one of the hand fits.
    const state = await colossus.state(PLAYER_ID);
    place: for (const card of state.me!.hand) {
      for (const l of state.lots.filter((x) => !x.heart && x.holes > 0)) {
        const [p] = (await colossus.options(PLAYER_ID, l.board, card.card)).placements;
        if (!p) continue;
        await colossus.place(PLAYER_ID, { card: card.card, board: l.board, x: p.x, y: p.y, orientation: p.orientation });
        break place;
      }
    }
    vi.setSystemTime(new Date((colossusEndsAt(WEEK) + 3_600) * 1000));
    open("/play/colossus", ledger);
    const plaque = await screen.findByRole("region", { name: "Last week's Colossus" }, { timeout: slow(8000) });
    const before = (await ledger.account(PLAYER_ID)).cobbles;
    await userEvent.click(await within(plaque).findByRole("button", { name: /^Claim \+\d+ Cobbles$/ }, { timeout: slow(5000) }));
    await waitFor(async () => expect((await ledger.account(PLAYER_ID)).cobbles).toBeGreaterThan(before), { timeout: slow(5000) });
    expect(await within(plaque).findByText(/Cobbles claimed/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
  });
});
