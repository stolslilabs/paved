import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

// The Masterpiece's board (`/masterpiece`, the real page): its strip, the tile in hand, a day's tiles played, the week over, and the
// way to the week's page where no board is open.

const WEEK = masterpieceWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MONDAY = new Date((masterpieceWeekStart(WEEK) + 43_200) * 1000);

function open(ledger: MockLedger) {
  const f = fakeSources({ masterpiece: mockMasterpiece(ledger) });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  render(<App router={createTestRouter("/masterpiece")} sources={f.sources} connector={wallet.load} />);
}
const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

preloadPages("masterpiece-board");

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

describe("/masterpiece: the week's board", () => {
  it("shows the strip and a tile in hand: nothing closed yet, twelve waiting", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    open(ledger);
    expect(await screen.findByRole("heading", { name: "No crowned wonder closed yet" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Masterpiece" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=masterpiece-strip]")).toHaveTextContent("12 waiting72 to come");
    expect(screen.getByRole("region", { name: "Your tile" })).toBeInTheDocument();
    expect(screen.queryByText("Today's tiles are played")).toBeNull();
  });

  it("waits for midnight once the day's twelve are played", async () => {
    const ledger = newLedger();
    const masterpiece = mockMasterpiece(ledger);
    await masterpiece.open(PLAYER_ID);
    for (let i = 0; i < 12; i++) await masterpiece.play(PLAYER_ID, WEEK, { k: "discard" });
    open(ledger);
    expect(await screen.findByText("Today's tiles are played", undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByText("Twelve new tiles at 00:00 UTC.")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=masterpiece-strip]")).toHaveTextContent("0 waiting72 to come");
  });

  it("freezes the board once the week is over", async () => {
    const ledger = newLedger();
    await mockMasterpiece(ledger).open(PLAYER_ID);
    open(ledger);
    await screen.findByRole("heading", { name: "No crowned wonder closed yet" }, { timeout: slow(8000) });
    // The week ends while the board is open: it reads the clock each second.
    vi.setSystemTime(new Date((masterpieceEndsAt(WEEK) + 60) * 1000));
    await waitFor(() => expect(screen.getByText("The week is over")).toBeInTheDocument(), { timeout: slow(5000) });
    expect(document.querySelector("[data-slot=masterpiece-strip]")).toHaveTextContent("0 waiting0 to come");
  });

  it("sends a player with no board to the week's page", async () => {
    open(newLedger());
    expect(await screen.findByText(/You have not opened this week's board yet/, undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
