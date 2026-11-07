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

  it("the player is the avatar and name at the top left (#624): its sheet names them; Disconnect is Settings' alone", async () => {
    const { wallet } = open("/");
    await screen.findByRole("button", { name: resume }, { timeout: slow(5000) });
    // One avatar: the home has no navigation rail.
    expect(screen.getAllByRole("button", { name: /^Profile: / })).toHaveLength(1);
    // The XP bar's seam (#625, #787): level 1 and 0 XP for everyone until the contracts define XP, and the XP left. The level
    // joins the name once the progress is read, after the home under load: waited for.
    const avatar = await screen.findByRole("button", { name: /^Profile: .*, level 1, 100 XP to level 2$/ }, { timeout: slow(5000) });
    await userEvent.click(avatar);
    // The sheet is its own chunk (#624): its content is drawn once loaded.
    const sheet = await screen.findByRole("dialog", {}, { timeout: slow(5000) });
    await waitFor(() => expect(sheet.querySelector("[data-slot=xp-left]")).toHaveTextContent("100 XP to level 2"), { timeout: slow(5000) });
    expect(within(sheet).queryByRole("button", { name: /My village/ })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /Disconnect/ })).toBeNull();
    expect(wallet.calls).not.toContain("disconnect");
  });

  it("a device with no account (NO-GUEST): the account made at start, no Connect, no guest's line; its game to resume", async () => {
    const { wallet } = open("/", { guest: true });
    expect(await screen.findByRole("button", { name: resume }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(wallet.calls).toEqual(expect.arrayContaining(["probe", "connect"]));
    expect(screen.queryByText(/Playing as a guest/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("spawn_paused: the notice; the running game still resumes", async () => {
    open("/", { paused: true });
    expect(await screen.findByText("New Challenge games are paused", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: resume })).toBeEnabled();
  });
});

describe("/play (P6, PLAY-PAGE): the modes, the HUD's drawer", () => {
  const challenge = () => screen.getByText("Beat the threshold");

  it("no Connect first (NO-GUEST): the Challenge opens the stake; no Multiplayer (the book has none), Limited's mode to come is off", async () => {
    const { router } = open("/play", { guest: true });
    await screen.findByRole("dialog", { name: "Play" }, { timeout: slow(5000) });
    expect(screen.queryByText(/Connect a wallet/)).toBeNull();
    expect(screen.queryByText(/Multiplayer/)).toBeNull();
    expect(screen.getByRole("button", { name: "Coming soon" })).toBeDisabled();
    await userEvent.click(challenge());
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
  });

  it("connected: the Challenge opens the stake", async () => {
    const { router } = open("/play");
    await screen.findByRole("dialog", { name: "Play" }, { timeout: slow(5000) });
    await userEvent.click(challenge());
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
  });

  it("a running Challenge: its time left and score on the Challenge's card, Resume opens its board", async () => {
    const { router } = open("/play");
    const resume = await screen.findByRole("button", { name: `Resume Challenge #${GAME_PLAYING.id}` }, { timeout: slow(5000) });
    // Its time left, or "Expired" past its 24 h (the fakes' game is dated by the fixture, the clock is the browser's).
    expect(screen.getAllByText(/ left$|^Expired$/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Score /)).toBeInTheDocument();
    await userEvent.click(resume);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_PLAYING.id}`));
  });

  it("the Training card offers a new game, never a resume, even with an old save on the device (#718); it opens /training", async () => {
    const store = memoryStore({ [TRAINING_KEY]: JSON.stringify({ v: 2, seed: "0x5eed", moves: [{ k: "d" }] }) });
    const { router } = open("/play", { guest: true, overrides: { store: () => store } });
    const card = await screen.findByRole("button", { name: /^Training/ }, { timeout: slow(5000) });
    expect(screen.queryByText(/^Resume: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/saved on this device/)).not.toBeInTheDocument();
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });

  it("the Story card opens /story, the Attack card the PvP flow (#753)", async () => {
    const { router } = open("/play");
    await userEvent.click(await screen.findByRole("button", { name: /^Story/ }, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/story"));
    await router.navigate("/play");
    await userEvent.click(await screen.findByText("Raid a rival village", {}, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pvp"));
  });

  it("spawn_paused: the Challenge is disabled with its notice; Training and Story mode stay open", async () => {
    const { router } = open("/play", { paused: true });
    expect(await screen.findByText("New Challenge games are paused. Training and Story mode stay open.", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /^Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
  });
});
