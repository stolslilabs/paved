import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { STARTER_LAYOUTS, VillageDraft, attackDeckSize, attackStars, dayOf, layoutScore, rarityOf, slotsOf, starterLayout, type QueuedMove } from "@paved/game-core";
import { useClaims, useCobbleAccount, useQuestRewards } from "../src/data";
import { useBuyPack } from "../src/data/purchase";
import { useAttackV2, useAttackV2Writes, attackV2Board } from "../src/data/free-attack";
import { V2RefusedError, useChests, useFreeVillage, useFreeVillageWrites, useShop } from "../src/data/free-village";
import { useLayoutSlotWrites, useLayoutSlots } from "../src/data/layout-slots";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { RIVAL_SEEDS } from "../src/data/mock/rivals";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { usePlayerProgress } from "../src/data/player-progress";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation, playDailies } from "./mock-fakes";

// PvP v2 on the mock (#741, step 1 of #732): the whole loop through the hooks the screens (#739, #740) read, on the mock
// ledger's overlays, from a fresh device: found a village, edit and save it; attack rivals with the deck of ceil(1.15 x S) and
// the three-tile view; get chests by stars up to the day's cap; buy from the daily shop once per offer; see XP, level and
// slots follow. The mock's signer is `{ address }` alone, so a call that reached the chain would throw.

const PLAYER = FIXTURE_ADA;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);
const USDC = 1_000_000n;

const refusal = (e: unknown) => (e instanceof V2RefusedError ? e.reason : e);

/** Every hook of the loop, for one player. */
function useLoop() {
  return {
    village: useFreeVillage(PLAYER),
    chests: useChests(PLAYER),
    shop: useShop(PLAYER, dayOf(Date.now() / 1000)),
    writes: useFreeVillageWrites(PLAYER),
    attack: useAttackV2(PLAYER),
    fight: useAttackV2Writes(PLAYER),
    progress: usePlayerProgress(PLAYER),
    account: useCobbleAccount(PLAYER),
    quests: useQuestRewards(PLAYER, TODAY),
    claims: useClaims(PLAYER),
    pack: useBuyPack(PLAYER),
  };
}

/** The open attack's deck, rewritten in the stored state: `deck` and `target`, as a test fixes them. */
function rig(store: { data: Map<string, string> }, deck: number[], target: number) {
  const state = JSON.parse(store.data.get(MOCK_KEY)!);
  const player = Object.values(state.players as Record<string, { v2: { attacks: { deck: number[]; target: number }[] } }>)[0]!;
  Object.assign(player.v2.attacks.at(-1)!, { deck, target });
  store.data.set(MOCK_KEY, JSON.stringify(state));
}

/** The player's Cobbles, rewritten in the stored state, as a test gives them. */
function credit(store: { data: Map<string, string> }, cobbles: number) {
  const state = JSON.parse(store.data.get(MOCK_KEY)!);
  Object.values(state.players as Record<string, { cobbles: number }>)[0]!.cobbles = cobbles;
  store.data.set(MOCK_KEY, JSON.stringify(state));
}

/** Story's first level (`TUTORIAL` 1): two crossroads that close the starter's road, 321 points. Its line, as moves. */
const FIRST_STONE: QueuedMove[] = [
  { discard: false, orientation: 1, cell: { x: 1, y: 0 } },
  { discard: false, orientation: 1, cell: { x: -1, y: 0 } },
];

describe("PvP v2 on the mock", () => {
  it("a fresh device: no village yet, level 1 with 9 slots, no chest, the day's three offers", async () => {
    const { sources } = mockImplementation();
    const { result } = renderData(useLoop, sources);
    const village = await dataOf({ get current() { return result.current.village; } });
    expect(village).toMatchObject({ founded: false, level: 1, slots: 9, tiles: [], score: 0 });
    expect(village!.inventory.every((n) => n === 0)).toBe(true);
    expect(await dataOf({ get current() { return result.current.chests; } })).toEqual({ pending: [], origins: [], open: null, openOrigin: null, pvpToday: 0, pvpCap: 3 });
    const shop = await dataOf({ get current() { return result.current.shop; } });
    expect(shop!.offers).toHaveLength(3);
    expect(shop!.offers.every((o) => !o.bought)).toBe(true);
    expect(await dataOf({ get current() { return result.current.attack; } })).toEqual({ match: null, attack: null });
  });

  it("founds a village from its starter layout (it scores), edits it and saves the whole layout", async () => {
    const { sources } = mockImplementation();
    const { result } = renderData(useLoop, sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(false));
    await act(() => result.current.writes.found());
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));
    const village = result.current.village.data!;
    expect(village.tiles).toEqual(starterLayout(BigInt(PLAYER)));
    expect(village.score).toBeGreaterThan(0);
    expect(village.score).toBe(layoutScore(village.tiles));
    expect(village.inventory.reduce((a, b) => a + b, 0)).toBe(8);
    expect(village.free.every((n) => n === 0)).toBe(true);
    expect(refusal(await result.current.writes.found().catch((e: unknown) => e))).toBe("founded");

    // The editor's draft: an outer tile sent back to the inventory, then saved
    const draft = new VillageDraft({ slots: village.slots, inventory: village.inventory }, village.tiles);
    const outer = draft.tiles.find((t) => draft.liftRefusal(t.x, t.y) === null)!;
    draft.lift(outer.x, outer.y);
    await act(() => result.current.writes.save(draft.tiles));
    await waitFor(() => expect(result.current.village.data?.tiles).toHaveLength(7));
    expect(result.current.village.data!.score).toBe(draft.score);
    expect(result.current.village.data!.free.reduce((a, b) => a + b, 0)).toBe(1);

    // A layout the rules refuse leaves the saved one as it was
    const split = [...draft.tiles, { ...outer, x: outer.x + 30 }];
    expect(refusal(await result.current.writes.save(split).catch((e: unknown) => e))).toBe("not-connected");
    const doubled = [...draft.tiles, ...draft.tiles.slice(0, 1).map((t) => ({ ...t, x: t.x + 30 }))];
    expect(refusal(await result.current.writes.save(doubled).catch((e: unknown) => e))).toBe("not-held");
    await waitFor(() => expect(result.current.village.data?.tiles).toHaveLength(7));
  });

  it("attacks a rival with the deck of ceil(1.15 x S), seeing the tile in hand and the next two; XP and crowns follow the stars", async () => {
    const { sources, ledger } = mockImplementation();
    const { result } = renderData(useLoop, sources);
    await waitFor(() => expect(result.current.attack.data).toEqual({ match: null, attack: null }));
    expect(refusal(await result.current.fight.search().catch((e: unknown) => e))).toBe("not-joined");
    await act(() => result.current.writes.found());
    await act(() => result.current.fight.search());
    await waitFor(() => expect(result.current.attack.data?.match).not.toBeNull());
    const match = result.current.attack.data!.match!;
    expect(match.deck).toBe(attackDeckSize(match.slots));
    expect(match.slots).toBe(slotsOf(match.level));
    expect(refusal(await result.current.fight.search().catch((e: unknown) => e))).toBe("opponent-drawn");

    await act(() => result.current.fight.start());
    await waitFor(() => expect(result.current.attack.data?.attack?.status).toBe("open"));
    // The rival attacked is shielded for 8 hours, and the shield's read says so
    const shield = await ledger.pvpShield(match.opponent);
    expect(shield.up).toBe(true);
    expect(shield.until).toBeGreaterThan(Date.now() / 1000 + 8 * 3_600 - 60);
    expect(result.current.attack.data!.attack).toMatchObject({ defender: match.opponent, deck: match.deck, target: match.target, moves: [] });
    expect(result.current.attack.data!.attack!.view).toHaveLength(3);

    // Every tile played: built where it fits, else discarded; the view always shows the hand and the next two
    for (let played = 0; played < match.deck; played++) {
      const attack = result.current.attack.data!.attack!;
      expect(attack.view).toHaveLength(Math.min(3, match.deck - played));
      const board = attackV2Board(attack);
      const cell = board.slots(attack.view[0]!)[0];
      await act(() => result.current.fight.play(cell ? { discard: false, orientation: board.orientations(attack.view[0]!, cell)[0]!, cell } : { discard: true }));
      await waitFor(() => expect(result.current.attack.data?.attack?.moves).toHaveLength(played + 1));
    }
    const done = result.current.attack.data!.attack!;
    expect(done.status).toBe("finished");
    expect(done.view).toEqual([]);
    expect(done.stars).toBe(attackStars(done.score, done.target));
    expect(done.xp).toBe([0, 5, 10, 20][done.stars]);
    expect(result.current.attack.data!.match).toBeNull();
    await waitFor(() => expect(result.current.progress.data?.total).toBe(done.xp));
    expect(refusal(await result.current.fight.play({ discard: true }).catch((e: unknown) => e))).toBe("no-attack");
  });

  it("gives chests by stars, at most 3 PvP chests a day; Story's are outside the cap; an epic chest shows 3 tiles", async () => {
    const { sources, store } = mockImplementation();
    const { result } = renderData(useLoop, sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(false));
    await act(() => result.current.writes.found());
    // Four attacks played on the First stone's deck against its target: 3 stars each
    for (let n = 1; n <= 4; n++) {
      await act(() => result.current.fight.search());
      await act(() => result.current.fight.start());
      rig(store, [17, 17], 321);
      for (const move of FIRST_STONE) await act(() => result.current.fight.play(move));
      await waitFor(() => expect(result.current.attack.data?.attack).toMatchObject({ id: n, status: "finished", stars: 3, xp: 20 }));
      expect(result.current.attack.data!.attack!.chest).toBe(n <= 3 ? "epic" : null);
    }
    await waitFor(() => expect(result.current.chests.data).toMatchObject({ pending: ["epic", "epic", "epic"], pvpToday: 3 }));

    // Story: 3 stars the first time on the Open Country's first level (basic) and its last (epic), outside the cap
    await act(() => result.current.writes.reportStory({ campaign: 2, level: 1, stars: 3 }));
    await act(() => result.current.writes.reportStory({ campaign: 2, level: 1, stars: 3 }));
    await act(() => result.current.writes.reportStory({ campaign: 2, level: 12, stars: 3 }));
    await waitFor(() => expect(result.current.chests.data?.pending).toEqual(["epic", "epic", "epic", "basic", "epic"]));
    // Where each was won (#784): today's PvP slots, then Story, which takes none.
    const today = Math.floor(Date.now() / 86_400_000);
    const pvp = (slot: number) => ({ source: "pvp", day: today, slot });
    expect(result.current.chests.data!.origins).toEqual([pvp(0), pvp(1), pvp(2), { source: "story" }, { source: "story" }]);
    expect(refusal(await result.current.writes.reportStory({ campaign: 2, level: 13, stars: 3 }).catch((e: unknown) => e))).toBe("no-level");

    // 4 attacks x 20 XP and 2 levels x 15: 110 XP, level 2, 10 slots
    await waitFor(() => expect(result.current.progress.data).toEqual({ level: 2, xp: 10, xpForNext: 200, total: 110 }));
    await waitFor(() => expect(result.current.village.data).toMatchObject({ level: 2, slots: 10 }));

    // The chest picked (#784): the Story basic one, fourth in the list, before the older ones; one past the list is refused.
    expect(refusal(await result.current.writes.claimChest(0).catch((e: unknown) => e))).toBe("no-open-chest");
    expect(refusal(await result.current.writes.openChest(5).catch((e: unknown) => e))).toBe("no-chest");
    await act(() => result.current.writes.openChest(3));
    await waitFor(() => expect(result.current.chests.data?.open?.plans).toHaveLength(1));
    expect(result.current.chests.data!.open!.rank).toBe("basic");
    expect(result.current.chests.data!.openOrigin).toEqual({ source: "story" });
    expect(result.current.chests.data!.pending).toEqual(["epic", "epic", "epic", "epic"]);
    const basic = result.current.chests.data!.open!;
    await act(() => result.current.writes.claimChest(0));
    await waitFor(() => expect(result.current.chests.data?.open).toBeNull());

    // An epic chest, the oldest when none is picked: 3 tiles, one taken into the inventory
    await act(() => result.current.writes.openChest());
    await waitFor(() => expect(result.current.chests.data?.open?.plans).toHaveLength(3));
    const open = result.current.chests.data!.open!;
    expect(open.rank).toBe("epic");
    expect(result.current.chests.data!.openOrigin).toEqual({ source: "pvp", day: today, slot: 0 });
    expect(refusal(await result.current.writes.openChest().catch((e: unknown) => e))).toBe("chest-open");
    await act(() => result.current.writes.claimChest(2));
    await waitFor(() => expect(result.current.chests.data?.open).toBeNull());
    expect(result.current.chests.data!.pending).toHaveLength(3);
    await waitFor(() => expect(result.current.village.data?.free[open.plans[2]! - 1]).toBe(open.plans[2] === basic.plans[0] ? 2 : 1));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(basic.cobbles + open.cobbles));
  });

  it("pays the day's milestones, no bonus for the whole day (#869), and buys from the shop once per offer and day", async () => {
    const { sources, ledger, chain } = mockImplementation();
    // Both milestones of the day, the five dailies done: 10 and 15 Cobbles.
    playDailies(chain, [1, 2, 3, 4], 1);
    await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 0);
    await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 1);
    const { result } = renderData(useLoop, sources);
    await waitFor(() => expect(result.current.quests.data).toBeTruthy());
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(25));
    expect(await result.current.claims.claim("bonus:daily", [{ kind: "credit", credit: "daily", period: TODAY }]).catch((e: unknown) => (e as { reason?: string }).reason)).toBe("no-live-quest");
    expect(result.current.account.data!.credits).toBe(0);
    // A pack's 50 Cobbles: enough for any offer
    await act(() => result.current.pack.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(75));

    const shop = await dataOf({ get current() { return result.current.shop; } });
    const offer = [...shop!.offers].sort((a, b) => a.price - b.price)[0]!;
    expect(offer.price).toBe({ common: 10, uncommon: 20, mythic: 50 }[rarityOf(offer.plan)]);
    expect(refusal(await result.current.writes.buy({ day: shop!.day, slot: offer.slot, confirmedPrice: offer.price + 1 }).catch((e: unknown) => e))).toBe("price-changed");
    expect(refusal(await result.current.writes.buy({ day: shop!.day - 1, slot: offer.slot, confirmedPrice: offer.price }).catch((e: unknown) => e))).toBe("shop-closed");
    await act(() => result.current.writes.buy({ day: shop!.day, slot: offer.slot, confirmedPrice: offer.price }));
    await waitFor(() => expect(result.current.shop.data?.offers[offer.slot]?.bought).toBe(true));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(75 - offer.price));
    await waitFor(() => expect(result.current.village.data?.inventory[offer.plan - 1]).toBe(1));
    expect(refusal(await result.current.writes.buy({ day: shop!.day, slot: offer.slot, confirmedPrice: offer.price }).catch((e: unknown) => e))).toBe("bought");
  });

  it("keeps saved layouts in 3 slots (#804): the free one active, the others bought once with Cobbles; the active one is the village", async () => {
    const { sources, store, ledger } = mockImplementation();
    const { result } = renderData(() => ({ ...useLoop(), slots: useLayoutSlots(PLAYER), slotWrites: useLayoutSlotWrites(PLAYER) }), sources);
    await act(() => result.current.writes.found());
    await waitFor(() => expect(result.current.slots.data?.slots[0]?.tiles).toHaveLength(8));
    const village = result.current.village.data!;
    const starter = village.tiles;
    expect(result.current.slots.data).toMatchObject({ active: 0, slots: [{ open: true, price: 0, score: village.score, fits: true }, { open: false, price: 100, tiles: null }, { open: false, price: 250, tiles: null }] });

    // A locked slot takes no layout; a purchase at the price shown, with the Cobbles held, opens it empty, once
    const draft = new VillageDraft({ slots: village.slots, inventory: village.inventory }, starter);
    const outer = draft.tiles.find((t) => draft.liftRefusal(t.x, t.y) === null)!;
    draft.lift(outer.x, outer.y);
    expect(refusal(await result.current.slotWrites.saveTo(1, draft.tiles).catch((e: unknown) => e))).toBe("slot-locked");
    expect(refusal(await result.current.slotWrites.buy({ slot: 1, confirmedPrice: 100 }).catch((e: unknown) => e))).toBe("not-enough-cobbles");
    credit(store, 300);
    expect(refusal(await result.current.slotWrites.buy({ slot: 1, confirmedPrice: 50 }).catch((e: unknown) => e))).toBe("price-changed");
    await act(() => result.current.slotWrites.buy({ slot: 1, confirmedPrice: 100 }));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(200));
    expect(refusal(await result.current.slotWrites.buy({ slot: 1, confirmedPrice: 100 }).catch((e: unknown) => e))).toBe("slot-open");
    await waitFor(() => expect(result.current.slots.data?.slots[1]).toMatchObject({ open: true, tiles: null }));
    expect(refusal(await result.current.slotWrites.activate(1).catch((e: unknown) => e))).toBe("slot-empty");

    // A save into another slot leaves the village as it was
    await act(() => result.current.slotWrites.saveTo(1, draft.tiles));
    await waitFor(() => expect(result.current.slots.data?.slots[1]?.tiles).toHaveLength(7));
    expect(result.current.village.data!.tiles).toEqual(starter);
    expect(result.current.slots.data!.slots[1]!.score).toBe(draft.score);

    // Made active, it is the village (the one attackers face); the free slot back again, then a Save writes the active slot
    await act(() => result.current.slotWrites.activate(1));
    await waitFor(() => expect(result.current.village.data?.tiles).toHaveLength(7));
    expect(result.current.village.data!.score).toBe(draft.score);
    expect(result.current.slots.data!.active).toBe(1);
    await act(() => result.current.slotWrites.activate(0));
    await waitFor(() => expect(result.current.village.data?.tiles).toEqual(starter));
    await act(() => result.current.writes.save(draft.tiles));
    await waitFor(() => expect(result.current.slots.data?.slots[0]?.tiles).toHaveLength(7));
    expect(result.current.account.data!.cobbles).toBe(200);

    // A Save sent while an activation is on its way lands in the slot the editor showed active, never the one made active
    const backup = result.current.slots.data!.slots[1]!.tiles!;
    await act(async () => {
      await Promise.all([result.current.slotWrites.activate(1), result.current.writes.save(STARTER_LAYOUTS[0]!.slice(0, 0), 0)]);
    });
    await waitFor(() => expect(result.current.slots.data?.active).toBe(1));
    expect(result.current.slots.data!.slots[1]!.tiles).toEqual(backup);
    expect(result.current.slots.data!.slots[0]!.tiles).toEqual([]);
    expect(result.current.village.data!.tiles).toEqual(backup);
    await act(() => result.current.slotWrites.activate(0));

    // Kept on the device
    const again = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    expect((await again.layoutSlots(PLAYER)).slots.map((s) => s.open)).toEqual([true, true, false]);
    expect((await ledger.layoutSlots(PLAYER)).active).toBe(0);
    expect((await ledger.freeVillage(PLAYER)).tiles).toEqual([]);
  });

  it("keeps its state on the device: a new ledger on the same store reads the village", async () => {
    const first = mockImplementation();
    const { result } = renderData(() => useFreeVillageWrites(PLAYER), first.sources);
    await act(() => result.current.found());
    const again = new MockLedger({ store: () => first.store, seller: "0x3", latencyMs: 0 });
    expect((await again.freeVillage(PLAYER)).tiles).toEqual(starterLayout(BigInt(PLAYER)));
  });

  it("reads a save from before V4-CHEST-NAMES: its Bronze, Silver and Gold chests are Basic, Rare and Epic", async () => {
    const first = mockImplementation();
    const { result } = renderData(() => useFreeVillageWrites(PLAYER), first.sources);
    await act(() => result.current.found());
    const state = JSON.parse(first.store.data.get(MOCK_KEY)!);
    const v2 = Object.values(state.players as Record<string, { v2: { chests: { pending: object[]; open: object | null }; attacks: object[] } }>)[0]!.v2;
    v2.chests.pending = [{ rank: "gold", league: 0 }, { rank: "bronze", league: 0 }];
    v2.chests.open = { rank: "silver", plans: [1, 2], cobbles: 0 };
    first.store.data.set(MOCK_KEY, JSON.stringify(state));
    const again = new MockLedger({ store: () => first.store, seller: "0x3", latencyMs: 0 });
    const chests = await again.chests(PLAYER);
    expect(chests.pending).toEqual(["epic", "basic"]);
    expect(chests.open?.rank).toBe("rare");
  });

  it("is not served by a views double without the v2 reads: the hooks answer null, and write nothing", async () => {
    const { sources } = fakeSources();
    const { result } = renderData(() => ({ village: useFreeVillage(PLAYER), chests: useChests(PLAYER), attack: useAttackV2(PLAYER), writes: useFreeVillageWrites(PLAYER) }), sources);
    expect(result.current.village).toEqual({ data: null, isPending: false, error: null });
    expect(result.current.chests.data).toBeNull();
    expect(result.current.attack.data).toBeNull();
    expect(result.current.writes.signer).toBeNull();
    const slots = renderData(() => ({ read: useLayoutSlots(PLAYER), writes: useLayoutSlotWrites(PLAYER) }), sources).result;
    expect(slots.current.read).toEqual({ data: null, isPending: false, error: null });
    expect(slots.current.writes.signer).toBeNull();
  });
});

describe("the mock's rivals", () => {
  it("are 30 free villages from level 1 to 20, valid at their slots, the same at every load", () => {
    const rivals = mockRivalsV2();
    expect(rivals).toHaveLength(30);
    expect(rivals[0]!.level).toBe(1);
    expect(rivals.at(-1)!.level).toBe(20);
    rivals.forEach((r, i) => {
      expect(r.tiles.length + 1).toBeLessThanOrEqual(r.slots);
      expect(r.score).toBe(RIVAL_SEEDS[i]!.score);
      expect(r.score).toBeGreaterThan(0);
      expect(BigInt(r.address)).toBeGreaterThan(255n);
    });
    expect(new Set(rivals.map((r) => r.address)).size).toBe(30);
    expect(STARTER_LAYOUTS.length).toBe(64);
  });
});
