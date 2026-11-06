import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attackDeckSize, dayOf } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { mockRivalV2 } from "../src/data/mock/v2";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { discardTile, placeTile, preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// `/pvp` on PvP v2 (#740) on the mock's rules and ledger (#741): the search draws a rival village, the scout shows the deck
// the attack will have (ceil(1.15 x S)), the attack plays it on an unbounded board with the tile in hand and the next two, its
// marks at 80 / 90 / 100 %; the last tile ends it on its end screen (`/pvp/result/:id`, #790), whose Back goes to the league.

const WAIT = { timeout: slow(8000) };

async function open(path: string, prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  render(<App router={createTestRouter(path)} sources={s.sources} connector={wallet.load} />);
  return { ...s, me };
}

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-result"), import("../src/routes/pvp-v2-end"), import("../src/components/containers/final-board")]);
}, slow(60_000));
beforeEach(() => {
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

describe("/pvp on PvP v2 (#740)", { timeout: slow(30_000) }, () => {
  it("founds the village, searches, scouts the deck, opens the attack on an open board and places a tile", async () => {
    const s = await open("/pvp");
    // A fresh device has no v2 village: the search says so, and Search again founds it with its starter layout.
    expect(await screen.findByText(/Your village is not founded yet/, {}, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search again/ }));
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    const { match } = await s.ledger.attackV2(s.me);
    const rival = mockRivalV2(match!.opponent)!;
    const card = screen.getByRole("region", { name: "Attack" });
    expect(card.querySelector("[data-deck]")).toHaveTextContent(`${attackDeckSize(rival.slots)} tiles`);
    // The deck chip opens the village's tile list (#788): the rival's tiles, then the extras unknown.
    await userEvent.click(within(card).getByRole("button", { name: /the village's tile list$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Deck" }, WAIT);
    const extras = attackDeckSize(rival.slots) - rival.tiles.length;
    expect(sheet).toHaveTextContent(`${attackDeckSize(rival.slots)} tiles left of ${attackDeckSize(rival.slots)}`);
    expect(within(sheet).getByRole("heading", { name: `The village's tiles ${rival.tiles.length}` })).toBeInTheDocument();
    expect(within(sheet).queryAllByRole("img", { name: "Unknown tile" })).toHaveLength(extras);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Deck" })).toBeNull(), WAIT);
    const points = [80, 90, 100].map((p) => Math.floor((p * rival.score + 99) / 100).toLocaleString("en-US"));
    expect(within(screen.getByRole("list", { name: "Stars" })).getAllByRole("listitem").map((li) => li.textContent?.split("+")[0])).toEqual(points);

    await userEvent.click(within(card).getByRole("button", { name: /^Attack$/ }));
    expect(await screen.findByRole("heading", { name: `Attack: ${rival.name}` }, WAIT)).toBeInTheDocument();
    // The deck counter is the attack's deck; the stack shows the tile in hand and the next two; no territory on the board.
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(attackDeckSize(rival.slots)));
    expect(screen.getByTestId("coming-tiles").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "115");
    expect(document.querySelectorAll("[data-territory]")).toHaveLength(0);
    const slots = await screen.findAllByRole("button", { name: /^Slot / }, WAIT);
    fireEvent.click(slots[0]!);
    await placeTile();
    await waitFor(async () => expect((await s.ledger.attackV2(s.me)).attack!.moves).toHaveLength(1), WAIT);
    await waitFor(() => expect(document.querySelector('[aria-label^="Board of"]')?.getAttribute("aria-label")).toBe("Board of 2 tiles"), WAIT);
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(attackDeckSize(rival.slots) - 1));
  });

  it("resumes an open attack, and its last tile ends it on its end screen; League goes to the league", async () => {
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      const { attack } = await s.ledger.attackV2(me);
      for (let i = 0; i < attack!.deck - 1; i++) await writes.playAttackV2({ discard: true });
    });
    expect(await screen.findByRole("heading", { name: /^Attack: / }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent("1");
    expect(screen.queryByTestId("coming-tiles")).toBeNull();
    await discardTile();
    expect(await screen.findByRole("heading", { level: 1, name: "Attack over" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 of 3 stars" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Defeat" })).toBeInTheDocument();
    // No star: no chest to open.
    expect(screen.queryByRole("region", { name: "Chest" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Open the / })).toBeNull();
    expect((await s.ledger.attackV2(s.me)).attack!.status).toBe("finished");
    // No League on the window (the owner's ask of 2026-11-06): Home goes home.
    expect(screen.queryByRole("button", { name: "League" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Attack over" })).toBeNull(), WAIT);
  });

  it("shows a finished attack's end again on a reload of its route: a surrender, said with what it cost", async () => {
    await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
    });
    expect(await screen.findByRole("heading", { name: "Surrendered" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Attack over" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Crowns" })).toBeInTheDocument();
    // The cross shows the board, the Scores pill brings the scores back (the Board's place, the owner's ask of 2026-11-06).
    await userEvent.click(screen.getByRole("button", { name: "Close the scores" }));
    expect(screen.queryByRole("heading", { name: "Surrendered" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show the scores" }));
    expect(screen.getByRole("heading", { name: "Surrendered" })).toBeInTheDocument();
  });

  it("opens the attack's chest on its end (END-CHEST, the Chests page gone): Tap to open, the reveal, Take, Claim, the tile kept said", async () => {
    const s = await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
      // The attack made a finished one of two stars that won a rare chest: the chest waits, a PvP chest of the attack's day.
      const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
      for (const p of Object.values(state.players as Record<string, { v2: { attacks: { status: string; stars: number; chest: string | null; finishedAt: number }[]; chests: { pending: unknown[] } } }>)) {
        const attack = p.v2.attacks[0];
        if (!attack) continue;
        Object.assign(attack, { status: "finished", stars: 2, chest: "rare" });
        p.v2.chests.pending.push({ rank: "rare", league: 0, origin: { source: "pvp", day: dayOf(attack.finishedAt), slot: 0 } });
      }
      s.store.setItem(MOCK_KEY, JSON.stringify(state));
    });
    const chest = await screen.findByRole("region", { name: "Chest" }, WAIT);
    const before = (await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0);
    await userEvent.click(await within(chest).findByRole("button", { name: /^Open the rare chest/ }, WAIT));
    // The reveal over the end: its first card chosen, Take keeps it.
    const reveal = await screen.findByRole("dialog", { name: "Choose 1 of 2" }, WAIT);
    await userEvent.click(within(reveal).getByRole("button", { name: /^Take / }));
    const kept = await screen.findByRole("dialog", { name: "Added to your inventory" }, WAIT);
    expect(within(kept).getAllByRole("button").map((b) => b.textContent)).toEqual(["Claim"]);
    await userEvent.click(within(kept).getByRole("button", { name: "Claim" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Added to your inventory" })).toBeNull(), WAIT);
    // The end again, its panel saying the tile kept; the inventory holds it, no chest waits.
    expect(screen.getByRole("region", { name: "Chest" })).toHaveAttribute("data-state", "kept");
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("Added to your inventory");
    expect((await s.ledger.inventory(s.me)).reduce((a, b) => a + b, 0)).toBe(before + 1);
    expect((await s.ledger.chests(s.me)).pending).toEqual([]);
  }, slow(30_000));

  it("opens a revisited result's own chest after a later win of the same rank that day (#1038): its slot, not the newest", async () => {
    const s = await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      for (let i = 0; i < 2; i++) {
        await writes.drawOpponentV2("search");
        await writes.startAttackV2();
        await writes.surrenderAttackV2();
      }
      // Two finished attacks of two stars the same day, each a rare chest: slot 0 (attack 1), then slot 1 (attack 2).
      const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
      for (const p of Object.values(state.players as Record<string, { v2: { attacks: { finishedAt: number }[]; chests: { pending: unknown[] } } }>)) {
        p.v2.attacks.forEach((attack, slot) => {
          Object.assign(attack, { status: "finished", stars: 2, chest: "rare", chestSlot: slot });
          p.v2.chests.pending.push({ rank: "rare", league: 0, origin: { source: "pvp", day: dayOf(attack.finishedAt), slot } });
        });
      }
      s.store.setItem(MOCK_KEY, JSON.stringify(state));
    });
    const day = dayOf((await s.ledger.attackV2Of(s.me, 1))!.finishedAt);
    const chest = await screen.findByRole("region", { name: "Chest" }, WAIT);
    await userEvent.click(await within(chest).findByRole("button", { name: /^Open the rare chest/ }, WAIT));
    // The first attack's chest is drawn (slot 0); the second's still waits, for its own result.
    await screen.findByRole("dialog", { name: "Choose 1 of 2" }, WAIT);
    const read = await s.ledger.chests(s.me);
    expect(read.openOrigin).toEqual({ source: "pvp", day, slot: 0 });
    expect(read.origins).toEqual([{ source: "pvp", day, slot: 1 }]);
  }, slow(30_000));

  it("opens the own chest of a result saved before its slot was recorded (#1038): the slot read from the day's earlier wins", async () => {
    const s = await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      for (let i = 0; i < 2; i++) {
        await writes.drawOpponentV2("search");
        await writes.startAttackV2();
        await writes.surrenderAttackV2();
      }
      // Two rare wins the same day, slots 0 and 1; attack 1 in the save's shape from before `chestSlot`, attack 2 with it.
      const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
      for (const p of Object.values(state.players as Record<string, { v2: { attacks: { finishedAt: number }[]; chests: { pending: unknown[] } } }>)) {
        p.v2.attacks.forEach((attack, slot) => {
          Object.assign(attack, { status: "finished", stars: 2, chest: "rare", ...(slot > 0 && { chestSlot: slot }) });
          p.v2.chests.pending.push({ rank: "rare", league: 0, origin: { source: "pvp", day: dayOf(attack.finishedAt), slot } });
        });
      }
      s.store.setItem(MOCK_KEY, JSON.stringify(state));
    });
    expect(await s.ledger.attackV2Of(s.me, 1)).toMatchObject({ chestSlot: 0 });
    const day = dayOf((await s.ledger.attackV2Of(s.me, 1))!.finishedAt);
    const chest = await screen.findByRole("region", { name: "Chest" }, WAIT);
    await userEvent.click(await within(chest).findByRole("button", { name: /^Open the rare chest/ }, WAIT));
    await screen.findByRole("dialog", { name: "Choose 1 of 2" }, WAIT);
    const read = await s.ledger.chests(s.me);
    expect(read.openOrigin).toEqual({ source: "pvp", day, slot: 0 });
    expect(read.origins).toEqual([{ source: "pvp", day, slot: 1 }]);
  }, slow(30_000));

  it("says a failed chests' read on the end with Retry, the chest disabled until the read is back (#1038)", async () => {
    let failing = true;
    await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
      const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
      for (const p of Object.values(state.players as Record<string, { v2: { attacks: { finishedAt: number }[]; chests: { pending: unknown[] } } }>)) {
        const attack = p.v2.attacks[0];
        if (!attack) continue;
        Object.assign(attack, { status: "finished", stars: 2, chest: "rare", chestSlot: 0 });
        p.v2.chests.pending.push({ rank: "rare", league: 0, origin: { source: "pvp", day: dayOf(attack.finishedAt), slot: 0 } });
      }
      s.store.setItem(MOCK_KEY, JSON.stringify(state));
      // The chests' read refused while `failing`, the ledger's after.
      const views = s.sources.views;
      const chests = (playerId: string) => (failing ? Promise.reject(new Error("The RPC did not answer.")) : s.ledger.chests(playerId));
      s.sources.views = new Proxy(views, { get: (t, key) => (key === "chests" ? chests : Reflect.get(t, key)) });
    });
    const chest = await screen.findByRole("region", { name: "Chest" }, WAIT);
    // The read refused (its retry too): its message and Retry, no chest to tap.
    const alert = await within(chest).findByRole("alert", {}, WAIT);
    expect(alert).toHaveTextContent("Could not load your rare chest");
    expect(alert).toHaveTextContent("The RPC did not answer.");
    expect(chest).toHaveAttribute("data-state", "error");
    expect(within(chest).queryByRole("button", { name: /^Open the / })).toBeNull();
    // Retry reads the chests again: the chest is there to open.
    failing = false;
    await userEvent.click(within(chest).getByRole("button", { name: "Retry" }));
    expect(await within(screen.getByRole("region", { name: "Chest" })).findByRole("button", { name: /^Open the rare chest/ }, WAIT)).toBeEnabled();
  }, slow(30_000));

  it("keeps a result's link good after the next attack starts: the attack of that id, not the last", async () => {
    const s = await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
    });
    expect((await s.ledger.attackV2(s.me)).attack).toMatchObject({ id: 2, status: "open" });
    expect(await screen.findByRole("heading", { name: "Surrendered" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Attack over" })).toBeInTheDocument();
  });
});
