import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VillageDraft, layoutScore, starterLayout } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The v2 village's routes (#739, PvP v2 step 1) on the mock ledger (#741), whose rules are game-core's: on the home (`/`, #753),
// found the village, edit it (`?edit`) and save its whole layout (the score shown is game-core's), leave with changes only after asking, open the chests left over the home, and
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

// The overlay pages and the home's panel host (Missions, Vault and Settings are its panels, #762) too: the Back tests open
// them, each cold in its own wait otherwise.
preloadPages("home", "home-panel", "missions", "vault", "settings", "play", "shop", "pvp-league", "page-sheets");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/village"), import("../src/routes/pages/shop"), import("../src/routes/chest-prompt")]);
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

/** The home's Edit (a hammer, #753): edit mode, in the URL. */
// Edit mode's way in on the view: the village score's capsule (HOME-EDGES: the hammer left, the book's).
const editButton = () => screen.findByRole("button", { name: /^Edit village, score/ }, WAIT);

describe("/: the player's village is the home (#753), on the mock", () => {
  it("founds the village: its starter layout and game-core's score, then Edit", async () => {
    const s = await open("/");
    await userEvent.click(await screen.findByRole("button", { name: "Found" }, WAIT));
    expect(await editButton()).toBeInTheDocument();
    const layout = starterLayout(BigInt(s.me));
    expect((await s.ledger.freeVillage(s.me)).tiles).toEqual(layout);
    expect(screen.getByText(layoutScore(layout).toLocaleString("en-US"))).toBeInTheDocument();
    // The phone's bar is on the home (#763), and edit mode takes it away until it is left.
    expect(await screen.findByRole("navigation", { name: "Main" }, WAIT)).toBeInTheDocument();
    await userEvent.click(await editButton());
    await waitFor(() => expect(s.router.state.location.search).toBe("?edit"));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull(), WAIT);
    await userEvent.click(await screen.findByRole("button", { name: "Leave edit mode" }, WAIT));
    await waitFor(() => expect(s.router.state.location.search).toBe(""));
    expect(await screen.findByRole("navigation", { name: "Main" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));

  it("a long press on a tile of the village opens edit mode, in the URL, by Edit's path (#799)", async () => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await editButton();
    const plan = await screen.findByRole("img", { name: /^Village layout/ }, WAIT);
    const starter = plan.querySelector<HTMLElement>("[data-kind=starter]")!;
    fireEvent.pointerDown(starter, { button: 0, pointerId: 1 });
    // The bubble's Edit, its ring filling (the view's way in is the score's capsule since HOME-EDGES); at the hold's end, edit mode.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit village" })).toHaveLength(1), WAIT);
    await waitFor(() => expect(s.router.state.location.search).toBe("?edit"), WAIT);
    fireEvent.pointerUp(starter, { button: 0, pointerId: 1 });
    expect(await screen.findByRole("button", { name: "Leave edit mode" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));

  it("Edit switches to edit mode in the URL; an outer tile goes back to the inventory and the whole layout saves at once", async () => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click(await editButton());
    await waitFor(() => expect(s.router.state.location.search).toBe("?edit"));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Village" })).toBeNull());
    const village = await s.ledger.freeVillage(s.me);
    // An outer tile, by the rules: the editor lifts it.
    const draft = new VillageDraft({ slots: village.slots, inventory: await s.ledger.inventory(s.me) }, village.tiles);
    const outer = draft.tiles.find((t) => draft.liftRefusal(t.x, t.y) === null)!;
    const index = village.tiles.findIndex((t) => t.x === outer.x && t.y === outer.y);
    // The scene's ids: the starter 1, then the saved tiles in order from 2.
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${index + 2}"]`)!);
    // The tile's actions: their own chunk, as the inventory's.
    await userEvent.click(within(await screen.findByRole("toolbar", { name: "Tile" }, WAIT)).getByRole("button", { name: "Back to the inventory" }));
    expect(await screen.findByLabelText("8 of 9 slots used")).toBeInTheDocument();
    draft.lift(outer.x, outer.y);
    // The live score at the top left, against the saved one.
    expect(await screen.findByRole("img", { name: new RegExp(`^Score ${draft.score.toLocaleString("en-US")}(,|$)`) })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    // No notice (#802): the polite message, and the score chip on the new score.
    expect(await screen.findByText(`Village saved: score ${draft.score.toLocaleString("en-US")}`, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("Layout saved")).toBeNull();
    // The save closes edit mode: the entry Edit pushed goes, the view's overlays come back.
    await waitFor(() => expect(s.router.state.location.search).toBe(""));
    expect(screen.getByRole("navigation", { name: "Village" })).toBeInTheDocument();
    const saved = await s.ledger.freeVillage(s.me);
    expect(saved.tiles).toHaveLength(7);
    expect(saved.score).toBe(draft.score);
    // The tile is back in the inventory: free to place again.
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(8);
  }, slow(30_000));

  it("Back leaves edit mode first, and stays on the village", async () => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click(await editButton());
    await waitFor(() => expect(s.router.state.location.search).toBe("?edit"));
    await s.router.navigate(-1);
    await waitFor(() => expect(s.router.state.location.search).toBe(""));
    expect(s.router.state.location.pathname).toBe("/");
    // The view's overlays come back as the editor leaves: on a loaded machine they can mount twice, so the node found first may
    // be gone a moment later. Both are waited for together, as they stand once the view has settled.
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Village" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Edit village, score/ })).toBeInTheDocument();
    }, WAIT);
  }, slow(30_000));

  it("opened on /?edit, the editor's Back drops the mode in place", async () => {
    const s = await open("/?edit", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click(await screen.findByRole("button", { name: "Leave edit mode" }, WAIT));
    await waitFor(() => expect(s.router.state.location.search).toBe(""));
    expect(s.router.state.location.pathname).toBe("/");
  }, slow(30_000));

  it("leaving edit mode with unsaved changes asks first, by any way out, a reload too", async () => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await userEvent.click(await editButton());
    fireEvent.click(await screen.findByRole("button", { name: /^Hold to erase the layout/ }, WAIT));
    expect(await screen.findByLabelText("1 of 9 slots used")).toBeInTheDocument();
    // A reload or a closed tab: the browser's prompt is asked for.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    // The system Back: asked, and Keep editing stays in edit mode.
    await s.router.navigate(-1);
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" }, WAIT);
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(s.router.state.location.search).toBe("?edit");
    expect(await screen.findByLabelText("1 of 9 slots used")).toBeInTheDocument();
    // The editor's own Back: asked too; Leave goes back to the view, on the village.
    await userEvent.click(await screen.findByRole("button", { name: "Leave edit mode" }, WAIT));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" }, WAIT)).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(s.router.state.location.search).toBe(""));
    expect(s.router.state.location.pathname).toBe("/");
    // Gone with the editor: a reload no longer asks.
    await waitFor(() => {
      const after = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
    }, WAIT);
    // Nothing was saved.
    expect((await s.ledger.freeVillage(s.me)).tiles).toHaveLength(8);
  }, slow(30_000));

  // One test per trip, each with its own ceiling, as the own Back's below: the eight trips in one test outlasted one ceiling
  // under a check's load.
  it.each([
    ["Shop", "/village/shop"],
    [/^Missions/, "/missions"],
    ["Vault", "/vault"],
    [/^Allegiance/, "/guild"],
    [/^League: /, "/pvp/league"],
    ["Settings", "/settings"],
    [/^Play/, "/play"],
  ] as const)("the overlay %s reaches %s, and Back lands on the village", async (name, path) => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    // Under load the home's first frame can be replaced as it settles: the tap is made again while the router is idle on
    // the home, once at a time, until the page opens.
    await waitFor(() => {
      if (s.router.state.location.pathname === "/" && s.router.state.navigation.state === "idle") {
        // The overlay's column, else the dock (#763, HOME-DOCK: Shop, Play, Guild and Settings are the dock's).
        const column = screen.queryByRole("navigation", { name: "Village" });
        const bar = screen.queryByRole("navigation", { name: "Main" });
        fireEvent.click((column && within(column).queryByRole("button", { name })) ?? (bar && within(bar).queryByRole("button", { name })) ?? screen.getByRole("button", { name }));
      }
      expect(s.router.state.location.pathname).toBe(path);
    }, WAIT);
    await s.router.navigate(-1);
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"), WAIT);
    // The home is back, not the page left behind. Under a check's load the page left
    // behind stayed in place past 48 s after the League control's trip: the home's return has a wait of its own, as Settings'
    // Back below.
    expect(await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(20_000) })).toBeInTheDocument();
  }, slow(60_000));

  // One test per page, each with its own ceiling: the seven trips in one test outlasted a single ceiling on a loaded machine.
  it.each([
    ["Shop", "/village/shop"],
    [/^Allegiance/, "/guild"],
    [/^League: /, "/pvp/league"],
    [/^Play/, "/play"],
    [/^Missions/, "/missions"],
    ["Vault", "/vault"],
    ["Settings", "/settings"],
  ] as const)("the own Back of the overlay page %s (%s) lands on the village", async (name, path) => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await waitFor(() => {
      if (s.router.state.location.pathname === "/" && s.router.state.navigation.state === "idle") {
        // The overlay's column, else the dock (#763, HOME-DOCK: Shop, Play, Guild and Settings are the dock's).
        const column = screen.queryByRole("navigation", { name: "Village" });
        const bar = screen.queryByRole("navigation", { name: "Main" });
        fireEvent.click((column && within(column).queryByRole("button", { name })) ?? (bar && within(bar).queryByRole("button", { name })) ?? screen.getByRole("button", { name }));
      }
      expect(s.router.state.location.pathname).toBe(path);
    }, WAIT);
    // The page's own way back: its header's Back (#760); there is no header navigation any more (#762). Settings draws in 1.9 s
    // on a quiet machine, four times the other pages, and outlasted 48 s under a check's load: its Back has a wait of its own.
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, { timeout: slow(20_000) }));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"), WAIT);
  }, slow(45_000));

  it("the defence log's old link lands on the league, its matches (#786), whose Back is the village", async () => {
    const s = await open("/pvp/defence");
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/pvp/league"), WAIT);
    expect(await screen.findByRole("heading", { name: "Battle logs" }, WAIT)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"), WAIT);
  }, slow(30_000));

  it("/village redirects to / (its entry replaced), and a visit stays", async () => {
    const s = await open("/village");
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));
});

describe("a chest left to open, asked over the home (END-CHEST)", () => {
  it("comes back over the home when the app runs again, until a tile is taken", async () => {
    const s = await open("/", async (s, me) => {
      const w = s.ledger.writesFor(me);
      await w.foundFreeVillage();
      // A Story epic chest, opened (its draw in) and its tile not taken: the app was closed during its reveal.
      await w.reportStory({ campaign: 2, level: 12, stars: 3 });
      await w.openChest(0);
    });
    const reveal = await screen.findByRole("dialog", { name: "Choose 1 of 3" }, WAIT);
    expect(reveal).toHaveAttribute("data-phase", "reveal");
    expect(s.router.state.location.pathname).toBe("/");
    // No way out but a tile: Escape keeps it.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Choose 1 of 3" })).toBeInTheDocument();
    const before = (await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0);
    await userEvent.click(within(screen.getByRole("list", { name: "Chest tiles" })).getAllByRole("button")[2]!);
    await userEvent.click(screen.getByRole("button", { name: /^Take / }));
    const kept = await screen.findByRole("dialog", { name: "Added to your inventory" }, WAIT);
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(before + 1);
    expect((await s.ledger.chests(s.me)).open).toBeNull();
    // Claim: the home again, nothing left to open (END-CHEST: the Chests page gone).
    await userEvent.click(within(kept).getByRole("button", { name: "Claim" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Added to your inventory" })).toBeNull(), WAIT);
    expect(s.router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("dialog", { name: /^Choose / })).toBeNull();
  }, slow(30_000));

  it("asks a chest won and not opened (its game's end left before the tap) over the home: Tap to open, the reveal, Take, Claim, the next", async () => {
    const s = await open("/", async (s, me) => {
      const w = s.ledger.writesFor(me);
      await w.foundFreeVillage();
      // Two Story chests won, neither opened: the ends were left before their tap.
      await w.reportStory({ campaign: 2, level: 12, stars: 3 });
      await w.reportStory({ campaign: 1, level: 1, stars: 3 });
    });
    const waiting = (await s.ledger.chests(s.me)).pending.length;
    expect(waiting).toBeGreaterThan(0);
    const first = await screen.findByRole("dialog", { name: /chest$/ }, WAIT);
    expect(first).toHaveAttribute("data-phase", "closed");
    expect(within(first).getByText("Tap to open")).toBeInTheDocument();
    await userEvent.click(within(first).getByRole("button", { name: /^Open the / }));
    await screen.findByRole("list", { name: "Chest tiles" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /^Take / }));
    const kept = await screen.findByRole("dialog", { name: "Added to your inventory" }, WAIT);
    await userEvent.click(within(kept).getByRole("button", { name: "Claim" }));
    expect((await s.ledger.chests(s.me)).pending).toHaveLength(waiting - 1);
    if (waiting > 1) {
      // The next waits at once; its cross puts it off until the app runs again.
      const next = await screen.findByRole("dialog", { name: /chest$/ }, WAIT);
      expect(next).toHaveAttribute("data-phase", "closed");
      await userEvent.click(within(next).getByRole("button", { name: "Close" }));
    }
    await waitFor(() => expect(screen.queryAllByRole("dialog").filter((d) => d.dataset.phase)).toEqual([]), WAIT);
    expect(s.router.state.location.pathname).toBe("/");
  }, slow(30_000));
});

describe("/village/shop: the Shop's Tiles tab (SHOP-PAGE)", () => {
  it("buys each of the day's offers once", async () => {
    const s = await open("/village/shop", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      editPlayer(s.store, (p) => void (p.cobbles = 200));
    });
    const offers = within(await screen.findByRole("list", { name: "Today's tiles" }, WAIT)).getAllByRole("listitem");
    expect(offers).toHaveLength(3);
    const buy = within(offers[0]!).getByRole("button", { name: /^Buy / });
    await userEvent.click(buy);
    expect(await within(offers[0]!).findByText("Bought", {}, WAIT)).toBeInTheDocument();
    expect(within(offers[0]!).queryByRole("button", { name: /^Buy / })).toBeNull();
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(9);
  }, slow(30_000));
});
