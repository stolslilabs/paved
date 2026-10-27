import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD, FIXTURE_TOURNAMENT, FakeClaimer } from "@paved/chain/testing";
import { App } from "../src/App";
import { toast } from "../src/components/ui/sonner";
import { useCompletionStore } from "../src/data/completion-memory";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { errorToastTexts, preloadPages } from "./route-helpers";
import { FakeFreeSpawner, freeWallet } from "./free-fakes";

// "Play free" on /play (the home's village has none, #753), and the earlier wallet session on /missions (PLAYFREE), on the fakes.

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

describe("Play free from the home (#753): the free game is Play's", () => {
  it("the home's village offers no free game", async () => {
    open("/", { credits: 2 });
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(freeCard("Free game")).toBeNull();
    expect(freeCard("Free Challenge")).toBeNull();
  });

  it("after the spend, the credits are one less (the cache follows the receipt)", async () => {
    const { router } = open("/play", { credits: 1 });
    await userEvent.click(await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    router.navigate("/play");
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, { timeout: slow(10000) });
    expect(freeCard("Free Challenge")).toBeNull();
  });

  it("a refusal (the chain says no credit) is told, the player stays on Play and the credits are read again", async () => {
    const error = vi.spyOn(toast, "custom");
    const { router, spawner, views } = open("/play", { credits: 1 });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) });
    // The page read one credit; by the time of the tap another tab has spent it.
    views.cobblePlayer(PLAYER_ID).account.credits = 0;
    await userEvent.click(card);
    await waitFor(() => expect(errorToastTexts(error)).toEqual([expect.stringContaining("The free game did not start: You have no free game left: earn one on the missions page.")]));
    expect(router.state.location.pathname).toBe("/play");
    expect(spawner.sent).toBe(1);
    await waitFor(() => expect(freeCard("Free Challenge")).toBeNull());
  });

  it("a rejected signature is told and nothing opens", async () => {
    const error = vi.spyOn(toast, "custom");
    const { router, spawner } = open("/play", { credits: 1 });
    spawner.failNext = new Error("User rejected the request");
    await userEvent.click(await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) }));
    await waitFor(() => expect(errorToastTexts(error)).toEqual([expect.stringContaining("The free game did not start: User rejected the request")]));
    expect(router.state.location.pathname).toBe("/play");
  });

  it("a second tap while the spawn is on its way sends nothing more", async () => {
    const { spawner, router } = open("/play", { credits: 2 });
    let release!: () => void;
    spawner.gate = new Promise((resolve) => (release = resolve));
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) });
    await userEvent.click(card);
    await userEvent.click(card);
    expect(spawner.sent).toBe(1);
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
  });
});

describe("two quick taps", () => {
  it("send one transaction and show no error, though the writer would refuse the second", async () => {
    const error = vi.spyOn(toast, "custom");
    const { router, spawner } = open("/play", { credits: 2 });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) });
    // Both taps in one tick: no render lands between them.
    fireEvent.click(card);
    fireEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    expect(spawner.sent).toBe(1);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("Play free on /play", () => {
  it("no credit: no entry", async () => {
    open("/play", { credits: 0 });
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, { timeout: slow(5000) });
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull());
    expect(freeCard("Free Challenge")).toBeNull();
  });

  it("a credit: the entry spends it and opens the board", async () => {
    const { router, spawner } = open("/play", { credits: 1 });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) });
    expect(card).toHaveTextContent("1 free game from your missions");
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    expect(spawner.sent).toBe(1);
  });

  it("spawn paused: disabled", async () => {
    const { spawner } = open("/play", { credits: 1, paused: true });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: slow(5000) });
    expect(card).toBeDisabled();
    await userEvent.click(card);
    expect(spawner.sent).toBe(0);
  });

  it("a guest: no entry", async () => {
    open("/play", { credits: 1, guest: true });
    expect(await screen.findByText("Connect a wallet to enter: tap to connect.", {}, { timeout: slow(5000) })).toBeInTheDocument();
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

  it("/missions: with no earlier session the page is a guest's, and the probe ran once", async () => {
    const { wallet } = openClaims("/missions", { guest: true });
    expect(await screen.findByText("Connect to see your missions", {}, { timeout: slow(5000) })).toBeInTheDocument();
    await waitFor(() => expect(wallet.calls.filter((c) => c === "probe")).toHaveLength(1));
  });

  it("/missions/lifetime, now /missions (#832): the same session is found there", async () => {
    const { wallet } = openClaims("/missions/lifetime");
    expect((await screen.findAllByRole("button", { name: "240 Cobbles: Buy packs" }, { timeout: slow(10000) })).length).toBeGreaterThan(0);
    expect(wallet.calls).toContain("probe");
    expect(screen.queryByText(/^Connect to see/)).toBeNull();
  });
});
