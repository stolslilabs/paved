import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_TOURNAMENT } from "@paved/chain/testing";
import { TRAINING_KEY } from "@paved/game-core";
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

describe("/ (#753): the village home on its data", () => {
  const resume = `Resume Challenge #${GAME_PLAYING.id}`;

  it("a connected player: the Resume chip of their open game, no ranking; Play opens the mode choice", async () => {
    const { router, fixture } = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    // The newest open game of the player's `GameSpawned` events, read with `game(id)`.
    const chip = await screen.findByRole("button", { name: resume }, { timeout: slow(5000) });
    expect(screen.queryByText(/Playing as a guest/)).toBeNull();
    // No day notion on Home (#538), and no ranking (#623): the leaderboard is never read.
    expect(screen.queryByText("Daily")).toBeNull();
    expect(fixture.requests.some((r) => r.includes("/leaderboard") || r.includes("/entry/"))).toBe(false);
    await userEvent.click(chip);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_PLAYING.id}`));
    await router.navigate(-1);
    // The phone's bar's Play (#763), the centre disc.
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Play" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
  });

  it("the player is the avatar and name at the top left (#624): its sheet names them and disconnects", async () => {
    const { wallet } = open("/");
    await screen.findByRole("button", { name: resume }, { timeout: slow(5000) });
    // One avatar: the home has no navigation rail.
    expect(screen.getAllByRole("button", { name: /^Profile: / })).toHaveLength(1);
    // The XP bar's seam (#625, #787): level 1 and 0 XP for everyone until the contracts define XP, and the XP left. The level
    // joins the name once the progress is read, after the home under load: waited for.
    const avatar = await screen.findByRole("button", { name: /^Profile: .*, level 1, 100 XP to level 2$/ }, { timeout: slow(5000) });
    await userEvent.click(avatar);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("To level 2")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /My village/ })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: /Disconnect/ }));
    expect(wallet.calls).toContain("disconnect");
    await waitFor(() => expect(screen.getByRole("button", { name: "Profile: guest" })).toBeInTheDocument());
  });

  it("no wallet: a starter village to look at, Connect, no game to resume, no Edit; Connect connects", async () => {
    const { wallet } = open("/", { guest: true });
    expect(await screen.findByText("Playing as a guest: connect to build your village", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /^Village layout of 9 tiles/ }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: resume })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    // Connect is the header's, with the balances.
    await userEvent.click((await screen.findAllByRole("button", { name: "Connect" }))[0]!);
    expect(await screen.findByRole("button", { name: resume })).toBeInTheDocument();
    expect(wallet.calls).toContain("connect");
  });

  it("spawn_paused: the notice; the running game still resumes", async () => {
    open("/", { paused: true });
    expect(await screen.findByText("New Challenge games are paused", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: resume })).toBeEnabled();
  });
});

describe("/play (P6): the mode choice", () => {
  const challenge = () => screen.getByText("Stake 1 to 10, beat the threshold, earn PAVED.");

  it("a guest: the Challenge connects first; Multiplayer is coming soon", async () => {
    const { router, wallet } = open("/play", { guest: true });
    expect(await screen.findByText("Connect a wallet to enter: tap to connect.", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    await userEvent.click(challenge());
    await waitFor(() => expect(wallet.calls).toContain("connect"));
    expect(router.state.location.pathname).toBe("/play");
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull());
  });

  it("connected: the Challenge opens the purchase", async () => {
    const { router } = open("/play");
    await waitFor(() => expect(screen.queryByText("Connect a wallet to enter: tap to connect.")).toBeNull(), { timeout: slow(5000) });
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" });
    await userEvent.click(challenge());
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
  });

  it("the Training card offers a new game, never a resume, even with an old save on the device (#718); it opens /training", async () => {
    const store = memoryStore({ [TRAINING_KEY]: JSON.stringify({ v: 2, seed: "0x5eed", moves: [{ k: "d" }] }) });
    const { router } = open("/play", { guest: true, overrides: { store: () => store } });
    const card = await screen.findByText("A full game for free.", {}, { timeout: slow(5000) });
    expect(screen.queryByText(/^Resume: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/saved on this device/)).not.toBeInTheDocument();
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });

  it("the Story card opens /story, the Attack card the PvP flow (#753)", async () => {
    const { router } = open("/play");
    await userEvent.click(await screen.findByText("Learn the rules level by level, then earn three stars on fixed decks.", {}, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/story"));
    await router.navigate("/play");
    await userEvent.click(await screen.findByText("Raid a rival village for stars, crowns and chests.", {}, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pvp"));
  });

  it("spawn_paused: the Challenge is disabled with its notice; Training and Story mode stay open", async () => {
    const { router } = open("/play", { paused: true });
    expect(await screen.findByText("New Challenge games are paused. Training and Story mode stay open.", {}, { timeout: slow(5000) })).toBeInTheDocument();
    await userEvent.click(screen.getByText("A full game for free."));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });
});
