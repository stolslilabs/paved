import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_TOURNAMENT } from "@paved/chain/testing";
import { LocalSession } from "@paved/game-core";
import { App } from "../src/App";
import type { DataSources } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

/** The app at `path` on the fakes; the wallet restores the mocks' player unless `guest`. */
function open(path: string, options: { guest?: boolean; paused?: boolean; overrides?: Partial<DataSources> } = {}) {
  const f = fakeSources(options.overrides);
  f.views.today = FIXTURE_TOURNAMENT;
  f.views.paused = options.paused ?? false;
  const wallet = fakeWallet({ address: PLAYER_ID, restored: !options.guest });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, wallet, ...f };
}

// The board a route opens is not under test here (this file asserts the route it opens; `challenge-route.test.tsx` runs the board):
// a stand-in keeps the renderer and three out of its first test.
vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("home", "play", "purchase");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  // The app's query client is the module's: each test reads its own fakes.
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/ (P6): home on its data", () => {
  it("a connected player: their open game to resume, today's top 3 from the indexer", async () => {
    const { router, fixture } = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: 5000 });
    // The newest open game of the player's `GameSpawned` events, read with `game(id)`.
    expect(await screen.findByText(`Challenge #${GAME_PLAYING.id} in progress`)).toBeInTheDocument();
    expect(screen.queryByText("Playing as a guest")).toBeNull();
    // The podium of the chain's day, from the indexer.
    expect(await screen.findByText(`Day ${FIXTURE_TOURNAMENT}`)).toBeInTheDocument();
    await waitFor(() => expect(fixture.requests.some((r) => r.startsWith(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard?`) && r.includes("limit=3"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_PLAYING.id}`));
  });

  it("no wallet: the guest's connect call, no game to resume; Connect connects", async () => {
    const { wallet } = open("/", { guest: true });
    expect(await screen.findByText("Playing as a guest", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/in progress/)).toBeNull();
    await userEvent.click(within(screen.getByText("Playing as a guest").closest("[data-slot=card]") as HTMLElement).getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(`Challenge #${GAME_PLAYING.id} in progress`)).toBeInTheDocument();
    expect(wallet.calls).toContain("connect");
  });

  it("spawn_paused: the purchases-paused notice; the running game still resumes", async () => {
    open("/", { paused: true });
    expect(await screen.findByText("New Challenge games are paused for now. A game already started still plays.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Resume" })).toBeEnabled();
  });

  it("the Training save on this device offers its resume; the card opens /training", async () => {
    const store = memoryStore();
    const session = LocalSession.start(0x5eedn, () => store);
    const remaining = session.state.game!.deckSize - session.state.game!.placedCount;
    const { router } = open("/", { guest: true, overrides: { store: () => store } });
    const card = await screen.findByText(`Resume: 0 pts, ${remaining} tiles left`, {}, { timeout: 5000 });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });

  it("without a save, Training is a new game; the Tutorial card opens /tutorial", async () => {
    const { router } = open("/", { guest: true });
    expect(await screen.findByText("A free game, saved on this device.", {}, { timeout: 5000 })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Learn the rules, one stage at a time."));
    await waitFor(() => expect(router.state.location.pathname).toBe("/tutorial"));
  });
});

describe("/play (P6): the mode choice", () => {
  const challenge = () => screen.getByText("The daily ranked game: stake 1 to 10, beat the threshold, earn PAVED.");

  it("a guest: the Challenge connects first; Multiplayer is coming soon", async () => {
    const { router, wallet } = open("/play", { guest: true });
    expect(await screen.findByText("Connect a wallet to enter: tap to connect.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    await userEvent.click(challenge());
    await waitFor(() => expect(wallet.calls).toContain("connect"));
    expect(router.state.location.pathname).toBe("/play");
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull());
  });

  it("connected: the Challenge opens the purchase", async () => {
    const { router } = open("/play");
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull(), { timeout: 5000 });
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" });
    await userEvent.click(challenge());
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
  });

  it("spawn_paused: the Challenge is disabled with its notice; Training and the Tutorial stay open", async () => {
    const { router } = open("/play", { paused: true });
    expect(await screen.findByText("New Challenge games are paused. Training and the Tutorial stay open.", {}, { timeout: 5000 })).toBeInTheDocument();
    await userEvent.click(screen.getByText("A full game for free, saved on this device."));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });
});
