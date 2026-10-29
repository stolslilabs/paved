import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_S, VillageDraft, dayOf, layoutScore, starterLayout } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { READY_S } from "../src/components/containers/chest-slots";
import { markChestsSeen, resetChestsSeenForTests } from "../src/routes/chests-seen";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The v2 village's routes (#739, PvP v2 step 1) on the mock ledger (#741), whose rules are game-core's: on the home (`/`, #753),
// found the village, edit it (`?edit`) and save its whole layout (the score shown is game-core's), leave with changes only after asking, open the chests by rank, and
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
preloadPages("home", "home-panel", "missions", "vault", "settings", "play", "village-chests", "village-shop", "pvp-league", "page-sheets");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/village"), import("../src/routes/pages/village-chests"), import("../src/routes/pages/village-shop")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetChestsSeenForTests();
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
const editButton = () => screen.findByRole("button", { name: "Edit village" }, WAIT);

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
    // The bubble's Edit beside the scene's, its ring filling; at the hold's end, edit mode.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit village" })).toHaveLength(2), WAIT);
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
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getByLabelText("8 of 9 slots used")).toBeInTheDocument();
    draft.lift(outer.x, outer.y);
    expect(screen.getByRole("button", { name: `Score ${draft.score.toLocaleString("en-US")}: show the points` })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
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
      expect(screen.getByRole("button", { name: "Edit village" })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /^Hold to reset all/ }, WAIT));
    expect(screen.getByLabelText("1 of 9 slots used")).toBeInTheDocument();
    // A reload or a closed tab: the browser's prompt is asked for.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    // The system Back: asked, and Keep editing stays in edit mode.
    await s.router.navigate(-1);
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" }, WAIT);
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(s.router.state.location.search).toBe("?edit");
    expect(screen.getByLabelText("1 of 9 slots used")).toBeInTheDocument();
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

  it("each overlay reaches its page, and Back lands on the village", async () => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    for (const [name, path] of [
      [/^Chests/, "/village/chests"],
      ["Shop", "/village/shop"],
      [/^Missions/, "/missions"],
      ["Vault", "/vault"],
      ["League", "/pvp/league"],
      [/^League: /, "/pvp/league"],
      ["Settings", "/settings"],
      [/^Play/, "/play"],
    ] as const) {
      // The home is back, not the page left behind (the chests' page has a Shop of its own).
      await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
      // Under load the home's first frame can be replaced as it settles: the tap is made again while the router is idle on
      // the home, once at a time, until the page opens.
      await waitFor(() => {
        if (s.router.state.location.pathname === "/" && s.router.state.navigation.state === "idle") {
          // The overlay's column, else the phone's bar (#763: Settings and Play are the bar's below `desktop`).
          const column = screen.queryByRole("navigation", { name: "Village" });
          const bar = screen.queryByRole("navigation", { name: "Main" });
          fireEvent.click((column && within(column).queryByRole("button", { name })) ?? (bar && within(bar).queryByRole("button", { name })) ?? screen.getByRole("button", { name }));
        }
        expect(s.router.state.location.pathname).toBe(path);
      }, WAIT);
      await s.router.navigate(-1);
      await waitFor(() => expect(s.router.state.location.pathname).toBe("/"));
    }
  }, slow(60_000));

  // One test per page, each with its own ceiling: the seven trips in one test outlasted a single ceiling on a loaded machine.
  it.each([
    [/^Chests/, "/village/chests"],
    ["Shop", "/village/shop"],
    ["League", "/pvp/league"],
    [/^Play/, "/play"],
    [/^Missions/, "/missions"],
    ["Vault", "/vault"],
    ["Settings", "/settings"],
  ] as const)("the own Back of the overlay page %s (%s) lands on the village", async (name, path) => {
    const s = await open("/", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await waitFor(() => {
      if (s.router.state.location.pathname === "/" && s.router.state.navigation.state === "idle") {
        // The overlay's column, else the phone's bar (#763: Settings and Play are the bar's below `desktop`).
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
    expect(await screen.findByRole("heading", { level: 2, name: "Battle logs" }, WAIT)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"), WAIT);
  }, slow(30_000));

  it("/village redirects to / (its entry replaced), and a visit stays", async () => {
    const s = await open("/village");
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));
});

describe("/village/chests", () => {
  it("opens the chests in the modal on arrival, oldest first: keeps the tile chosen, greys its slot, brings the next (#784)", async () => {
    const today = dayOf(Date.now() / 1000);
    const s = await open("/village/chests", async (s, me) => {
      const w = s.ledger.writesFor(me);
      await w.foundFreeVillage();
      // Story: 3 stars the first time on a campaign's last level is a gold chest (it takes no slot).
      await w.reportStory({ campaign: 2, level: 12, stars: 3 });
      // A silver chest won in PvP today, before it: the day's first slot.
      editPlayer(s.store, (p) => {
        const v2 = p.v2 as unknown as { pvpChests: Record<string, number>; chests: { pending: unknown[] } };
        v2.pvpChests = { [today]: 1 };
        v2.chests.pending.unshift({ rank: "silver", league: 0, origin: { source: "pvp", day: today, slot: 0 } });
      });
    });
    const silver = await screen.findByRole("dialog", { name: "Silver chest" }, WAIT);
    await userEvent.click(within(silver).getByRole("button", { name: /^Open the silver chest: one of 2 tiles/ }));
    const tiles = within(await screen.findByRole("list", { name: "Chest tiles" }, WAIT)).getAllByRole("button");
    expect(tiles).toHaveLength(2);
    const before = (await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0);
    await userEvent.click(tiles[1]!);
    await userEvent.click(screen.getByRole("button", { name: /^Keep / }));
    const kept = await screen.findByRole("dialog", { name: "Added to your inventory" }, WAIT);
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(before + 1);
    // The Story gold one is next, in the same modal.
    await userEvent.click(within(kept).getByRole("button", { name: /Next chest/ }));
    expect(await screen.findByRole("dialog", { name: "Gold chest" }, WAIT)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    // The page: the slot opened is grey, no Waiting list, the gold one a tap away.
    const slots = within(screen.getByRole("list", { name: "Today's PvP slots" })).getAllByRole("listitem");
    expect(slots.map((li) => li.getAttribute("aria-label"))).toEqual(["Slot 1: opened", "Slot 2: free", "Slot 3: free"]);
    expect(screen.queryByRole("heading", { name: /Waiting/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Open your chests/ }));
    expect(await screen.findByRole("dialog", { name: "Gold chest" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));

  it("shows today's PvP chests before an older Story one, and opens the chest of the slot tapped (#784)", async () => {
    const today = dayOf(Date.now() / 1000);
    const s = await open("/village/chests", async (s, me) => {
      const w = s.ledger.writesFor(me);
      await w.foundFreeVillage();
      // A Story bronze chest won first, then two PvP chests today: a gold one (slot 1), a silver one (slot 2).
      await w.reportStory({ campaign: 2, level: 1, stars: 3 });
      editPlayer(s.store, (p) => {
        const v2 = p.v2 as unknown as { pvpChests: Record<string, number>; chests: { pending: unknown[] } };
        v2.pvpChests = { [today]: 2 };
        v2.chests.pending.push({ rank: "gold", league: 0, origin: { source: "pvp", day: today, slot: 0 } });
        v2.chests.pending.push({ rank: "silver", league: 0, origin: { source: "pvp", day: today, slot: 1 } });
      });
    });
    // On arrival: the PvP gold one, not the Story bronze one won before it.
    const first = await screen.findByRole("dialog", { name: "Gold chest" }, WAIT);
    expect(within(first).getByText("PvP")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    // Slot 2's silver chest, tapped: it is the one shown, and the one drawn.
    await userEvent.click(screen.getByRole("button", { name: "Open the silver chest of slot 2" }));
    const silver = await screen.findByRole("dialog", { name: "Silver chest" }, WAIT);
    await userEvent.click(within(silver).getByRole("button", { name: /^Open the silver chest: one of 2 tiles/ }));
    expect(within(await screen.findByRole("list", { name: "Chest tiles" }, WAIT)).getAllByRole("button")).toHaveLength(2);
    await waitFor(async () => expect((await s.ledger.chests(s.me)).open?.rank).toBe("silver"), WAIT);
    expect((await s.ledger.chests(s.me)).pending).toEqual(["bronze", "gold"]);
    // Closed before the choice: slot 1's gold chest does not open (the silver one waits for its tile, as the page says).
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    expect(screen.queryByRole("button", { name: "Open the gold chest of slot 1" })).toBeNull();
    expect(screen.getByText("Your silver chest is open: keep one of its tiles before the next chest.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back to the open chest/ }));
    expect(await screen.findByRole("dialog", { name: "Silver chest" }, WAIT)).toBeInTheDocument();
    // Kept, then Later: slot 2 is grey while slot 1 still waits, and slot 1's tap shows its gold chest, not the tile kept.
    await userEvent.click(within(screen.getByRole("list", { name: "Chest tiles" })).getAllByRole("button")[0]!);
    await userEvent.click(screen.getByRole("button", { name: /^Keep / }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Added to your inventory" }, WAIT)).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    const slots = within(screen.getByRole("list", { name: "Today's PvP slots" })).getAllByRole("listitem");
    expect(slots.map((li) => li.getAttribute("aria-label"))).toEqual(["Slot 1: won, gold chest", "Slot 2: opened", "Slot 3: free"]);
    await userEvent.click(screen.getByRole("button", { name: "Open the gold chest of slot 1" }));
    const gold = await screen.findByRole("dialog", { name: "Gold chest" }, WAIT);
    expect(within(gold).getByText("Tap to open")).toBeInTheDocument();
    // Closed again, Open your chests: the queue's first, the PvP gold one, before the Story bronze.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    await userEvent.click(screen.getByRole("button", { name: /Open your chests/ }));
    expect(await screen.findByRole("dialog", { name: "Gold chest" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));
});

/** The home's Chests in the overlay's column, and in the phone's bar (#763), which carries the same count. */
async function homeChests(name: string) {
  const column = await screen.findByRole("navigation", { name: "Village" }, WAIT);
  const bar = await screen.findByRole("navigation", { name: "Main" }, WAIT);
  return waitFor(() => {
    expect(within(bar).getByRole("button", { name: /^Chests/ })).toHaveAccessibleName(name);
    return within(column).getByRole("button", { name });
  }, WAIT);
}

describe("the home's Chests badge (#759)", () => {
  it("counts the day's free slots until the Chests page is seen that day", async () => {
    const s = await open("/", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      editPlayer(s.store, (p) => void (p.v2.pvpChests = { [dayOf(Date.now() / 1000)]: 1 }));
    });
    // No chest waiting, 2 of the day's 3 slots free, the page not seen today.
    await userEvent.click(await homeChests("Chests, 2 waiting"));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/village/chests"), WAIT);
    expect(await screen.findByLabelText("2 of 3 left today", {}, WAIT)).toBeInTheDocument();
    await s.router.navigate(-1);
    expect(await homeChests("Chests")).toBeInTheDocument();
  }, slow(30_000));
});

describe("the home's Chests badge across midnight (#759)", () => {
  it("a home left open across the reset counts the new day's free slots", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const today = dayOf(Date.now() / 1000);
    vi.setSystemTime((today + 1) * DAY_S * 1000 - 3_000);
    // Today's 3 slots won and the page seen today: no badge.
    markChestsSeen(today);
    await open("/", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      editPlayer(s.store, (p) => void (p.v2.pvpChests = { [today]: 3 }));
    });
    expect(await homeChests("Chests")).toBeInTheDocument();
    // Midnight: the 3 slots are free again, and the page is not seen on the new day.
    vi.setSystemTime((today + 1) * DAY_S * 1000 + 2_000);
    expect(await homeChests("Chests, 3 waiting")).toBeInTheDocument();
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
    // The reset reached on the page: "Ready" for a short while (#759), then the next day's countdown.
    expect(screen.getByText(/3 new chests to win today/)).toBeInTheDocument();
    vi.setSystemTime((today + 1) * DAY_S * 1000 + (READY_S + 2) * 1000);
    expect(await screen.findByRole("timer", { name: /^Slots reset in 23:59:/ }, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/3 new chests to win today/)).toBeNull();
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
