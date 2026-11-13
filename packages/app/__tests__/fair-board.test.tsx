import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FairDraft, fairRandomOf, fairWeekOf, fairWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockFair } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// A Fair try's game's board (`/fair/:gameId`, the real board page, a Puzzle game's with the Fair's header): the try's number, the
// tile in hand for its own player; a try still in its draft has no board yet.

const WEEK = fairWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);

preloadPages("board", "play");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date((fairWeekStart(WEEK) + 86_400) * 1000) });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  // The app is unmounted and its reads are stopped before the cache is cleared (as `joust-board.test.tsx`).
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

function open(path: string, ledger: MockLedger) {
  const f = fakeSources({ fair: mockFair(ledger) });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return router;
}

describe("/fair/:gameId: a try's game's board", () => {
  it("names the try's number, and gives its player the first tile of their drafted deck", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const fair = mockFair(ledger);
    let record = await fair.start(PLAYER_ID);
    for (let draft = FairDraft.replay(record.season, fairRandomOf(BigInt(record.seed)), record.picks); !draft.over; draft = FairDraft.replay(record.season, fairRandomOf(BigInt(record.seed)), record.picks)) {
      record = await fair.pick(PLAYER_ID, record.id, draft.offer!.number, 0);
    }
    open(`/fair/${record.id}`, ledger);
    expect(await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fair · try 1/3" })).toBeInTheDocument();
    expect(screen.queryByText("Another player's game")).toBeNull();
  });

  it("sends a try still in its draft to the draft's view", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
    const record = await mockFair(ledger).start(PLAYER_ID);
    const router = open(`/fair/${record.id}`, ledger);
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe("/play/fair?view=draft"), { timeout: slow(8000) });
  });
});
