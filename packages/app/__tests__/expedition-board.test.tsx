import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPEDITION_MAPS, expeditionSeasonOf, expeditionWeekOf, expeditionWeekStart } from "@paved/game-core";
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

// The Expedition's board (`/expedition`, the real page): the map's name, the hand's strip and its pick, a new day's draw, and the
// way to the week's page where no board is open.

const WEEK = expeditionWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MONDAY = new Date((expeditionWeekStart(WEEK) + 43_200) * 1000);

function open(ledger: MockLedger) {
  const f = fakeSources({ expedition: mockExpedition(ledger) });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  render(<App router={createTestRouter("/expedition")} sources={f.sources} connector={wallet.load} />);
}
const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

preloadPages("expedition-board");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/expedition: the week's board", () => {
  it("names the map, shows the whole hand with its first tile picked, and picks another", async () => {
    const ledger = newLedger();
    await mockExpedition(ledger).open(PLAYER_ID);
    open(ledger);
    const hand = await screen.findByRole("list", { name: "Hand" }, { timeout: slow(8000) });
    expect(screen.getByRole("heading", { name: "Expedition" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: EXPEDITION_MAPS[expeditionSeasonOf(WEEK)].name })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your tile" })).toBeInTheDocument();
    const tiles = within(hand).getAllByRole("button");
    expect(tiles.map((t) => t.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    await userEvent.click(tiles[2]!);
    await waitFor(() => expect(tiles[2]).toHaveAttribute("aria-pressed", "true"));
    expect(within(screen.getByRole("list", { name: "Landmarks" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText("A new day")).toBeNull();
  });

  it("offers a new day's draw on the board, and reads the hand again", async () => {
    const ledger = newLedger();
    await mockExpedition(ledger).open(PLAYER_ID);
    vi.setSystemTime(new Date(MONDAY.getTime() + 86_400_000));
    open(ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Draw" }, { timeout: slow(8000) }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button")).toHaveLength(12), { timeout: slow(5000) });
    expect(screen.queryByText("A new day")).toBeNull();
  });

  it("sends a player with no board to the week's page", async () => {
    open(newLedger());
    expect(await screen.findByText(/You have not opened this week's map yet/, undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
