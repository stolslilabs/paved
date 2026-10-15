import { render, screen, waitFor } from "@testing-library/react";
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
import { FakeFreeSpawner, freeWallet } from "./free-fakes";

// "Play free" on / and /play, and the earlier wallet session on /quests and /achievements (PLAYFREE), on the fakes.

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

describe("Play free on /", { timeout: 15_000 }, () => {
  it("no credit: the Cobbles balance shows, no Play free entry", async () => {
    open("/", { credits: 0 });
    expect(await screen.findByRole("img", { name: "120 Cobbles" }, { timeout: 5000 })).toBeInTheDocument();
    expect(freeCard("Free game")).toBeNull();
  });

  it("a credit: the entry says how many; a tap spends it and opens the new game's board", async () => {
    const { router, spawner } = open("/", { credits: 2 });
    const card = await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 });
    expect(card).toHaveTextContent("2 free Challenge games from your quests.");
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    expect(spawner.sent).toBe(1);
  });

  it("after the spend, the credits are one less (the cache follows the receipt)", async () => {
    const { router } = open("/", { credits: 1 });
    await userEvent.click(await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    router.navigate("/");
    expect(await screen.findByRole("img", { name: "120 Cobbles" }, { timeout: 5000 })).toBeInTheDocument();
    expect(freeCard("Free game")).toBeNull();
  });

  it("spawn paused: the entry is there and disabled; nothing is sent", async () => {
    const { spawner } = open("/", { credits: 1, paused: true });
    const card = await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 });
    expect(card).toBeDisabled();
    await userEvent.click(card);
    expect(spawner.sent).toBe(0);
  });

  it("a guest: no Play free, no balance", async () => {
    open("/", { credits: 3, guest: true });
    expect(await screen.findByText("Playing as a guest", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(freeCard("Free game")).toBeNull();
    expect(screen.queryByRole("img", { name: /Cobbles$/ })).toBeNull();
  });

  it("a refusal (the chain says no credit) is told, the player stays on home and the credits are read again", async () => {
    const error = vi.spyOn(toast, "error");
    const { router, spawner, views } = open("/", { credits: 1 });
    const card = await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 });
    // The page read one credit; by the time of the tap another tab has spent it.
    views.cobblePlayer(PLAYER_ID).account.credits = 0;
    await userEvent.click(card);
    await waitFor(() => expect(error).toHaveBeenCalledWith("The free game did not start", { description: "You have no free game left: earn one on the quests page." }));
    expect(router.state.location.pathname).toBe("/");
    expect(spawner.sent).toBe(1);
    await waitFor(() => expect(freeCard("Free game")).toBeNull());
  });

  it("a rejected signature is told and nothing opens", async () => {
    const error = vi.spyOn(toast, "error");
    const { router, spawner } = open("/", { credits: 1 });
    spawner.failNext = new Error("User rejected the request");
    await userEvent.click(await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("The free game did not start", { description: "User rejected the request" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("a second tap while the spawn is on its way sends nothing more", async () => {
    const { spawner, router } = open("/", { credits: 2 });
    let release!: () => void;
    spawner.gate = new Promise((resolve) => (release = resolve));
    const card = await screen.findByRole("button", { name: /Free game/ }, { timeout: 5000 });
    await userEvent.click(card);
    await userEvent.click(card);
    expect(spawner.sent).toBe(1);
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
  });
});

describe("Play free on /play", { timeout: 15_000 }, () => {
  it("no credit: no entry", async () => {
    open("/play", { credits: 0 });
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull());
    expect(freeCard("Free Challenge")).toBeNull();
  });

  it("a credit: the entry spends it and opens the board", async () => {
    const { router, spawner } = open("/play", { credits: 1 });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: 5000 });
    expect(card).toHaveTextContent("1 free game from your quests");
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${NEW_GAME}`));
    expect(spawner.sent).toBe(1);
  });

  it("spawn paused: disabled", async () => {
    const { spawner } = open("/play", { credits: 1, paused: true });
    const card = await screen.findByRole("button", { name: /Free Challenge/ }, { timeout: 5000 });
    expect(card).toBeDisabled();
    await userEvent.click(card);
    expect(spawner.sent).toBe(0);
  });

  it("a guest: no entry", async () => {
    open("/play", { credits: 1, guest: true });
    expect(await screen.findByText("Connect a wallet to enter: tap to connect.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(freeCard("Free Challenge")).toBeNull();
  });
});

describe("the earlier wallet session on /quests and /achievements", { timeout: 15_000 }, () => {
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

  it("/quests: a session approved earlier comes back with no visit to Home, and the claim goes through", async () => {
    const { wallet, claimer } = openClaims("/quests");
    expect(await screen.findByRole("button", { name: "Claim 5 Cobbles: Daily Run" }, { timeout: 5000 })).toBeEnabled();
    expect(wallet.calls).toContain("probe");
    expect(screen.queryByText("Connect to see your quests")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Claim 5 Cobbles: Daily Run" }));
    await waitFor(() => expect(claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
    expect(await screen.findByRole("img", { name: "245 Cobbles" }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("/quests: with no earlier session the page is a guest's, and the probe ran once", async () => {
    const { wallet } = openClaims("/quests", { guest: true });
    expect(await screen.findByText("Connect to see your quests", {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(wallet.calls.filter((c) => c === "probe")).toHaveLength(1));
  });

  it("/achievements: the same session is found there", async () => {
    const { wallet } = openClaims("/achievements");
    expect(await screen.findByRole("img", { name: "240 Cobbles" }, { timeout: 5000 })).toBeInTheDocument();
    expect(wallet.calls).toContain("probe");
    expect(screen.queryByText(/^Connect to see/)).toBeNull();
  });
});
