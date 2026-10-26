import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewError } from "@paved/chain";
import { startTerritory } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { STARTER } from "../src/data/village";
import { queryClient } from "../src/lib/query-client";
import { resetManifestBodies } from "../src/data/renderer-manifest";
import { resetTileRenders } from "../src/data/tile-renders";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";
import { FakeVillageWriter } from "./village-fakes";
import { fakeWallet } from "./wallet-fakes";

// The village's route (#646 PR 2) on `@paved/chain`'s fakes: `Village`'s and `Rewards`' views on `FakeGameViews`, the writes on
// `FakeVillageWriter` (with their checks, the placement on game-core's engine), the player restored by the wallet.

const RIVAL = "0x99";
/** The own village of v1 (a source without the v2 village): `/village` is the home since #753, a visit to one's own address is the own village. */
const OWN = `/village/${PLAYER_ID}`;

/** The line over Open: "2 rewards wait: ...", its count in a span of its own. */
const waiting = (n: number) => (_: string, el: Element | null) => el?.tagName === "P" && (el.textContent ?? "").startsWith(`${n} ${n === 1 ? "reward waits" : "rewards wait"}`);

/** One chain (the fakes): the player with `cobbles` and `pending` rewards waiting. */
function chain(cobbles = 50, pending = 2) {
  const fakes = fakeSources();
  const ledger = fakes.views.cobblePlayer(PLAYER_ID);
  ledger.account = { ...ledger.account, cobbles };
  fakes.views.villagePlayer(PLAYER_ID).grants = { day: 1, today: 1, pending, opened: 0 };
  const writer = new FakeVillageWriter(fakes.views, PLAYER_ID);
  return { ...fakes, writer };
}

function open(c: ReturnType<typeof chain>, path: string, options: { guest?: boolean } = {}) {
  const wallet = fakeWallet({ address: PLAYER_ID, restored: !options.guest });
  wallet.connector.signer = () => c.writer as unknown as GameSigner;
  const router = createTestRouter(path);
  const view = render(<App router={router} sources={c.sources} connector={wallet.load} />);
  return { router, wallet, ...view };
}

preloadPages("home", "welcome");

beforeEach(async () => {
  await import("../src/routes/pages/village");
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/village/<own address>: the own village", () => {
  it("founds the village, opens a reward and places one of its tiles", async () => {
    const c = chain();
    open(c, OWN);
    await userEvent.click(await screen.findByRole("button", { name: "Found" }, { timeout: 5000 }));
    expect(await screen.findByText(waiting(2), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(c.views.villagePlayer(PLAYER_ID).info.gameId).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: /Open/ }));
    const tiles = within(await screen.findByRole("list", { name: "Reward tiles" }, { timeout: 5000 })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    const playable = tiles.find((t) => !t.hasAttribute("disabled"))!;
    await userEvent.click(playable);
    await userEvent.click(screen.getAllByRole("button", { name: /^Place it at/ })[0]!);
    await waitFor(() => expect(c.views.villagePlayer(PLAYER_ID).tiles).toHaveLength(2));
    // The offer is claimed: the next reward waits to be opened.
    expect(await screen.findByText(waiting(1), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(c.writer.sent).toEqual(["found", "open 0", "claim place"]);
  });

  it("takes the Cobbles instead of a tile", async () => {
    const c = chain(50, 1);
    await c.writer.foundVillage();
    c.views.villagePlayer(PLAYER_ID).offer = { index: 1, plans: [18, 18, 13] };
    open(c, OWN);
    await userEvent.click(await screen.findByRole("button", { name: "Take 5 Cobbles instead" }, { timeout: 5000 }));
    await waitFor(() => expect(c.views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(55));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Reward tiles" })).toBeNull());
  });

  it("a refusal of the chain shows on the page, until dismissed, and nothing changed", async () => {
    const c = chain(50, 0);
    await c.writer.foundVillage();
    const v = c.views.villagePlayer(PLAYER_ID);
    v.offer = { index: 1, plans: [18, 18, 13] };
    open(c, OWN);
    const take = await screen.findByRole("button", { name: "Take 5 Cobbles instead" }, { timeout: 5000 });
    // Claimed on another device meanwhile: the chain has no offer open any more.
    v.offer = { index: 0, plans: [0, 0, 0] };
    await userEvent.click(take);
    expect(await screen.findByText("Not done", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(c.views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(50);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("Not done")).toBeNull());
  });

  // ONE-HEADER (#781): the village draws no Cobbles plate of its own, the header's balances (the home's) show them, so the page
  // does not wait on nor fail with the Cobbles' read.
  it("the village shows whatever the Cobbles' read does, with no plate of its own", async () => {
    const c = chain(85, 0);
    await c.writer.foundVillage();
    c.views.account = () => Promise.reject(new Error("account RPC unavailable"));
    open(c, OWN);
    expect(await screen.findByLabelText(/^Village of 9 cells/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^\d+ Cobbles$/ })).toBeNull();
  });

  it("Retry reads the owner's level again after it failed, and the village shows", async () => {
    const c = chain(50, 0);
    await c.writer.foundVillage();
    const level = c.views.playerLevel.bind(c.views);
    let fail = true;
    c.views.playerLevel = (player: string) => (fail ? Promise.reject(new Error("level down")) : level(player));
    open(c, OWN);
    expect(await screen.findByText("level down", {}, { timeout: 5000 })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText(/^Village of 9 cells/, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("a failed read of the reward says so with Retry, never as no reward; Retry shows the rewards waiting", async () => {
    const c = chain(50, 2);
    await c.writer.foundVillage();
    const grants = c.views.rewardGrants.bind(c.views);
    let fail = true;
    c.views.rewardGrants = (player: string) => (fail ? Promise.reject(new Error("rewards down")) : grants(player));
    open(c, OWN);
    expect(await screen.findByText("Your rewards could not be read", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("rewards down")).toBeInTheDocument();
    expect(screen.queryByText(/No reward waits/)).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(waiting(2), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("Your rewards could not be read")).toBeNull();
  });

  it("draws each tile in its owner's active skin; a visit too", async () => {
    // The manifest: the starter's (RFFFRFCFR) top-down render in the base models (0) and in Forest (1).
    resetTileRenders();
    resetManifestBodies();
    const manifest = { models: {}, renders: { "0": { "rfffrfcfr-top": "renders/rfffrfcfr-top.0.base.webp" }, "1": { "rfffrfcfr-top": "renders/rfffrfcfr-top.1.forest.webp" } }, themes: {} };
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(String(url).endsWith("manifest.json") ? new Response(JSON.stringify(manifest)) : new Response("", { status: 404 })));
    try {
      const c = chain(50, 0);
      await c.writer.foundVillage();
      c.views.skinPlayer(PLAYER_ID).active.fill(1);
      const v = c.views.villagePlayer(RIVAL);
      v.cells = startTerritory();
      v.tiles = [{ ...STARTER }];
      v.info = { gameId: 7, cells: 9, tiles: 0, score: 0, nextParcel: 1, nextPrice: 10, nextLevel: 1 };
      const first = open(c, OWN);
      const board = await screen.findByLabelText(/^Village of 9 cells/, {}, { timeout: 5000 });
      await waitFor(() => expect(board.querySelector('img[src$="rfffrfcfr-top.1.forest.webp"]')).not.toBeNull());
      first.unmount();
      // Another player's village, in their skins: the rival has none active, so the base models.
      queryClient.clear();
      open(c, `/village/${RIVAL}`);
      const visited = await screen.findByLabelText(/^Village of 9 cells/, {}, { timeout: 5000 });
      await waitFor(() => expect(visited.querySelector('img[src$="rfffrfcfr-top.0.base.webp"]')).not.toBeNull());
      expect(visited.querySelector('img[src$="forest.webp"]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      resetTileRenders();
      resetManifestBodies();
    }
  });

  it("draws no tier's base and no parcel any more (#739)", async () => {
    const c = chain(50, 0);
    await c.writer.foundVillage();
    c.views.villagePlayer(PLAYER_ID).copies[8] = 4;
    open(c, OWN);
    const board = await screen.findByLabelText(/^Village of 9 cells and 1 tiles$/, {}, { timeout: 5000 });
    expect(board.querySelector("[data-tier]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Parcel at/ })).toBeNull();
    expect(screen.getByText(/No reward waits/)).toBeInTheDocument();
  });

  it("a network without Village says so", async () => {
    const c = chain();
    c.views.villageFail = new ViewError("not-configured", "Village address is not configured");
    open(c, OWN);
    expect(await screen.findByText("Villages are coming", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("/village is the home now (#753): its old link lands on /, and the profile sheet offers no My village", async () => {
    const c = chain();
    const { router } = open(c, "/village");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: 5000 });
    await userEvent.click((await screen.findAllByRole("button", { name: /^Profile: / }, { timeout: 5000 }))[0]!);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: /My village/ })).toBeNull();
  });
});

describe("/village/:player: a visit", () => {
  it("shows another player's village read-only, from the scout", async () => {
    const c = chain();
    const v = c.views.villagePlayer(RIVAL);
    v.cells = startTerritory();
    v.tiles = [{ ...STARTER }];
    v.info = { gameId: 7, cells: 9, tiles: 0, score: 42, nextParcel: 1, nextPrice: 10, nextLevel: 1 };
    open(c, `/village/${RIVAL}?from=scout`);
    expect(await screen.findByText("Scouting", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Parcel at/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Found" })).toBeNull();
  });

  it("a visit to one's own address is the own village; a path that is no address is not found", async () => {
    const c = chain();
    open(c, `/village/${PLAYER_ID}`);
    expect(await screen.findByRole("button", { name: "Found" }, { timeout: 5000 })).toBeInTheDocument();
  });
});
