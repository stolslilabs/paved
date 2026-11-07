import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD, FIXTURE_TOURNAMENT, FakeClaimer } from "@paved/chain/testing";
import { App } from "../src/App";
import { useCompletionStore } from "../src/data/completion-memory";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";
import { FakeFreeSpawner, freeWallet } from "./free-fakes";

// No "Play free" on the home (#753) nor on Play since PLAY-PAGE, and the earlier wallet session on /missions (PLAYFREE), on the fakes.

const NEW_GAME = GAME_PLAYING.id + 1;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);

/** The app at `path`; the player has `credits` free games and a wallet restored unless `guest`. */
function open(path: string, options: { credits?: number; guest?: boolean; paused?: boolean; balance?: number } = {}) {
  const f = fakeSources();
  f.views.today = FIXTURE_TOURNAMENT;
  f.views.paused = options.paused ?? false;
  const player = f.views.cobblePlayer(PLAYER_ID);
  player.account = { ...player.account, cobbles: options.balance ?? 120, credits: options.credits ?? 0 };
  // The new game exists for its board to read.
  f.views.setGame({ mode: "challenge", gameId: NEW_GAME }, { ...f.views.games.get(`challenge:${GAME_PLAYING.id}`)!, game: { ...GAME_PLAYING, id: NEW_GAME } });
  const spawner = new FakeFreeSpawner(f.views, PLAYER_ID, NEW_GAME);
  const wallet = freeWallet({ address: PLAYER_ID, restored: !options.guest, spawner });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, wallet, spawner, ...f };
}

const freeCard = (name: string) => screen.queryByRole("button", { name: new RegExp(name) });

// The board a route opens is not under test here (this file asserts the route it opens; `challenge-route.test.tsx` runs the board):
// a stand-in keeps the renderer and three out of its first test.
vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("home", "play", "missions");

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  useCompletionStore.setState({ announced: {}, last: {} });
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("no free game on the home or on Play", () => {
  it("the home's village offers no free game", async () => {
    open("/", { credits: 2 });
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(freeCard("Free game")).toBeNull();
    expect(freeCard("Free Challenge")).toBeNull();
  });

  // PLAY-PAGE (the owner's ask of 2026-11-06): Free Challenge left Play, credits or not.
  it("Play offers no Free Challenge, even with credits", async () => {
    open("/play", { credits: 2 });
    await screen.findByRole("dialog", { name: "Play" }, { timeout: slow(5000) });
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull());
    expect(freeCard("Free Challenge")).toBeNull();
  });
});

describe("the earlier wallet session on /missions", () => {
  /** The fixture's Ada has done quest 1 today; her ledger holds it, and the wallet signs with a claimer. */
  function openClaims(path: string, options: { guest?: boolean } = {}) {
    const f = fakeSources();
    const rate = { questId: 1, cobbles: 5, kind: "daily" as const, task: 1, total: 1, start: 0, interval: 86_400 };
    f.views.questRates.set(1, rate);
    f.fixture.progress.set(FIXTURE_ADA, { quests: new Map([[1, { count: 1, completed_at: FIXTURE_HEAD.timestamp - 60 }]]), achievements: new Map() });
    const ada = f.views.cobblePlayer(FIXTURE_ADA);
    ada.account = { ...ada.account, cobbles: 240 };
    ada.days.set(TODAY, { games: 1, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
    const claimer = new FakeClaimer(f.views, FIXTURE_ADA);
    // The sources carry no signer: it can only come from the wallet's restored session.
    const wallet = freeWallet({ address: FIXTURE_ADA, restored: !options.guest, claimer });
    render(<App router={createTestRouter(path)} sources={f.sources} connector={wallet.load} />);
    return { wallet, claimer };
  }

  it("/missions: a session approved earlier comes back with no visit to Home, and the claim goes through", async () => {
    const { wallet, claimer } = openClaims("/missions");
    await userEvent.click(await screen.findByRole("button", { name: /^Daily Run: / }, { timeout: slow(5000) }));
    expect(await screen.findByRole("button", { name: "Claim 5 Cobbles: Daily Run" }, { timeout: slow(5000) })).toBeEnabled();
    expect(wallet.calls).toContain("probe");
    expect(screen.queryByText("Connect to see your missions")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Claim 5 Cobbles: Daily Run" }));
    await waitFor(() => expect(claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
    expect((await screen.findAllByRole("button", { name: "245 Cobbles: Buy packs" }, { timeout: slow(3000) })).length).toBeGreaterThan(0);
  });

  it("/missions: with no earlier session the account is made at start (NO-GUEST), the probe ran once, no Connect", async () => {
    const { wallet } = openClaims("/missions", { guest: true });
    await waitFor(() => expect(wallet.calls).toEqual(expect.arrayContaining(["probe", "connect"])), { timeout: slow(5000) });
    expect(wallet.calls.filter((c) => c === "probe")).toHaveLength(1);
    expect(screen.queryByText("Connect to see your missions")).toBeNull();
  });

  it("/missions/lifetime, now /missions (#832): the same session is found there", async () => {
    const { wallet } = openClaims("/missions/lifetime");
    expect((await screen.findAllByRole("button", { name: "240 Cobbles: Buy packs" }, { timeout: slow(10000) })).length).toBeGreaterThan(0);
    expect(wallet.calls).toContain("probe");
    expect(screen.queryByText(/^Connect to see/)).toBeNull();
  });
});
