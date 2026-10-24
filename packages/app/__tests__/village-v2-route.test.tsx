import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_S, VillageDraft, dayOf, layoutScore, starterLayout } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The v2 village's routes (#739, PvP v2 step 1) on the mock ledger (#741), whose rules are game-core's: found the village, edit
// and save its whole layout (the score shown is game-core's), leave with changes only after asking, open the chests by rank, and
// buy from the daily shop once per offer. The chain path (no v2 views) keeps the v1 village: `village-route.test.tsx`.

const WAIT = { timeout: slow(8000) };

/** The mock's sources, the wallet restored; `prepare` runs on the ledger first. */
async function open(path: string, prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { ...s, me, router };
}

/** The player's stored v2 state and Cobbles, edited in place (a test's stand-in for what happened elsewhere). */
function editPlayer(store: ReturnType<typeof mockImplementation>["store"], change: (player: { cobbles: number; v2: { pvpChests: Record<string, number> } }) => void) {
  const state = JSON.parse(store.getItem(MOCK_KEY)!);
  for (const player of Object.values(state.players as Record<string, { cobbles: number; v2: { pvpChests: Record<string, number> } }>)) change(player);
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/village"), import("../src/routes/pages/village-chests"), import("../src/routes/pages/village-shop")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/village: the v2 village on the mock", () => {
  it("founds the village: its starter layout, 9 of 9 slots, game-core's score", async () => {
    const s = await open("/village");
    const found = await screen.findAllByRole("button", { name: "Found" }, WAIT);
    await userEvent.click(found[0]!);
    await waitFor(() => expect(screen.getAllByLabelText("9 of 9 slots used").length).toBeGreaterThan(0), WAIT);
    const layout = starterLayout(BigInt(s.me));
    expect((await s.ledger.freeVillage(s.me)).tiles).toEqual(layout);
    expect(screen.getByText(layoutScore(layout).toLocaleString("en-US"))).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
  }, slow(30_000));

  it("sends an outer tile back to the inventory and saves the whole layout at once", async () => {
    const s = await open("/village", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }, WAIT))[0]!);
    const village = await s.ledger.freeVillage(s.me);
    // An outer tile, by the rules: the editor lifts it.
    const draft = new VillageDraft({ slots: village.slots, inventory: await s.ledger.inventory(s.me) }, village.tiles);
    const outer = draft.tiles.find((t) => draft.liftRefusal(t.x, t.y) === null)!;
    const index = village.tiles.findIndex((t) => t.x === outer.x && t.y === outer.y);
    // The scene's ids: the starter 1, then the saved tiles in order from 2.
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${index + 2}"]`)!);
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getAllByLabelText("8 of 9 slots used").length).toBeGreaterThan(0);
    draft.lift(outer.x, outer.y);
    expect(screen.getByText(draft.score.toLocaleString("en-US"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(await screen.findByText("Layout saved", {}, WAIT)).toBeInTheDocument();
    const saved = await s.ledger.freeVillage(s.me);
    expect(saved.tiles).toHaveLength(7);
    expect(saved.score).toBe(draft.score);
    // The tile is back in the inventory: free to place again.
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(8);
  }, slow(30_000));

  it("leaving with unsaved changes asks first, by any way out, a reload too", async () => {
    const s = await open("/village", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }, WAIT))[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Hold to reset all/ }));
    expect(screen.getAllByLabelText("1 of 9 slots used").length).toBeGreaterThan(0);
    // A reload or a closed tab: the browser's prompt is asked for.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await s.router.navigate("/");
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" }, WAIT);
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(s.router.state.location.pathname).toBe("/village");
    await s.router.navigate("/");
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" }, WAIT)).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"));
    // Gone with the editor: a reload no longer asks.
    await waitFor(() => {
      const after = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
    }, WAIT);
    // Nothing was saved.
    expect((await s.ledger.freeVillage(s.me)).tiles).toHaveLength(8);
  }, slow(30_000));
});

describe("/village/chests", () => {
  it("opens a gold chest (1 of 3), keeps the tile chosen in the inventory, oldest first", async () => {
    const s = await open("/village/chests", async (s, me) => {
      const w = s.ledger.writesFor(me);
      await w.foundFreeVillage();
      // Story: 3 stars the first time on a campaign's last level is a gold chest, on its first a bronze one.
      await w.reportStory({ campaign: 2, level: 12, stars: 3 });
      await w.reportStory({ campaign: 2, level: 1, stars: 3 });
    });
    expect(await screen.findByText("Gold chest", {}, WAIT)).toBeInTheDocument();
    const opens = screen.getAllByRole("button", { name: /^Open the/ });
    expect(opens).toHaveLength(2);
    expect(opens[1]).toBeDisabled();
    await userEvent.click(opens[0]!);
    const tiles = within(await screen.findByRole("list", { name: "Chest tiles" }, WAIT)).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    const before = (await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0);
    await userEvent.click(tiles[2]!);
    await userEvent.click(screen.getByRole("button", { name: /^Keep / }));
    expect(await screen.findByText("Added to your inventory", {}, WAIT)).toBeInTheDocument();
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(before + 1);
    // The bronze one is next: one tile, no choice.
    await userEvent.click(screen.getByRole("button", { name: /^Open the bronze chest: one tile/ }));
    expect(within(await screen.findByRole("list", { name: "Chest tiles" }, WAIT)).getAllByRole("button")).toHaveLength(1);
  }, slow(30_000));
});

describe("/village/chests across midnight", () => {
  it("a new UTC day reads the day's PvP chests again: yesterday's 3 no longer count", async () => {
    // Only the clock is faked: the page's tick (each second) and the ledger both read it.
    vi.useFakeTimers({ toFake: ["Date"] });
    const today = dayOf(Date.now() / 1000);
    vi.setSystemTime((today + 1) * DAY_S * 1000 - 3_000);
    await open("/village/chests", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      editPlayer(s.store, (p) => void (p.v2.pvpChests = { [today]: 3 }));
    });
    expect(await screen.findByLabelText("0 of 3 left today", {}, WAIT)).toBeInTheDocument();
    vi.setSystemTime((today + 1) * DAY_S * 1000 + 2_000);
    expect(await screen.findByLabelText("3 of 3 left today", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/Today's PvP chests are won/)).toBeNull();
  }, slow(30_000));
});

describe("/village/shop", () => {
  it("buys each of the day's offers once", async () => {
    const s = await open("/village/shop", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      editPlayer(s.store, (p) => void (p.cobbles = 200));
    });
    const offers = within(await screen.findByRole("list", { name: "Today's offers" }, WAIT)).getAllByRole("listitem");
    expect(offers).toHaveLength(3);
    const buy = within(offers[0]!).getByRole("button", { name: /^Buy / });
    await userEvent.click(buy);
    expect(await within(offers[0]!).findByText("Bought today", {}, WAIT)).toBeInTheDocument();
    expect(within(offers[0]!).queryByRole("button", { name: /^Buy / })).toBeNull();
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(9);
  }, slow(30_000));
});
