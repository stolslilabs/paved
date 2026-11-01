import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { TUTORIAL_COBBLES, TUTORIAL_STEPS, dayOf, emptyTutorialCounts, shopOffers, tutorialFinished, tutorialStates, xpFloor, type QueuedMove } from "@paved/game-core";
import type { GameSigner } from "../src/data";
import { TutorialStepRefusedError, type TutorialViews, type TutorialWrites } from "../src/data/tutorial";
import { useTutorialClaims, useTutorialSteps } from "../src/data/tutorial-steps";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { MOCKED_GAME_READS, MOCKED_WRITES } from "../src/data/mock/overlay";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation, surrenderedGame } from "./mock-fakes";

// The Tutorial's steps on the mock (#977, PR 1 of 2): the ledger counts each step's first action as the player does it (a layout
// saved, a Challenge game finished, an attack settled and won, a chest opened, a plan bought, a gift of the day claimed) and reads
// the level from the XP; the steps open in order on game-core's rules, and each pays its Cobbles once through the mock's signer.

const PLAYER = FIXTURE_ADA;
const DAY = 86_400;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / DAY);

const clocked = () => {
  const clock = { now: TODAY * DAY + 9 * 3_600 };
  return { clock, ...mockImplementation(undefined, undefined, () => clock.now) };
};

type Store = { data: Map<string, string> };

/** The stored player, changed in place as a test sets it up (`change`), then saved. */
function edit(store: Store, change: (player: { cobbles: number; tutorial?: unknown; v2: { xp: number; attacks: { deck: number[]; target: number }[] } }) => void) {
  const state = JSON.parse(store.data.get(MOCK_KEY)!);
  change(Object.values(state.players as Record<string, never>)[0]!);
  store.data.set(MOCK_KEY, JSON.stringify(state));
}

/** Story's first level: two crossroads that close the starter's road, 321 points; an attack rigged on it takes 3 stars. */
const FIRST_STONE: QueuedMove[] = [
  { discard: false, orientation: 1, cell: { x: 1, y: 0 } },
  { discard: false, orientation: 1, cell: { x: -1, y: 0 } },
];

/** One PvP v2 attack played out: won with 3 stars on a rigged deck, or surrendered. */
async function attack(ledger: MockLedger, store: Store, won: boolean) {
  const writes = ledger.writesFor(PLAYER);
  await writes.drawOpponentV2("search");
  await writes.startAttackV2();
  if (!won) return writes.surrenderAttackV2();
  edit(store, (p) => Object.assign(p.v2.attacks.at(-1)!, { deck: [17, 17], target: 321 }));
  for (const move of FIRST_STONE) await writes.playAttackV2(move);
}

/** The cheapest of today's shop's offers, bought. */
async function buyCheapest(ledger: MockLedger, now: number) {
  const day = dayOf(now);
  const offers = shopOffers(day);
  const slot = offers.reduce((best, o, i) => (o.price < offers[best]!.price ? i : best), 0);
  await ledger.writesFor(PLAYER).buyTile({ day, slot, confirmedPrice: offers[slot]!.price });
}

const refusal = (e: unknown) => (e instanceof TutorialStepRefusedError ? e.reason : e);

describe("the Tutorial's steps on the mock (#977)", () => {
  it("are a read and a write of the mock's overlays", () => {
    expect(MOCKED_GAME_READS).toContain("tutorialSteps");
    expect(MOCKED_WRITES).toContain("claimTutorialStep");
  });

  it("a new player: nothing counted, level 1, step 1 open and steps 2 to 8 locked", async () => {
    const { sources } = clocked();
    const views = sources.views as typeof sources.views & TutorialViews;
    const view = await views.tutorialSteps(PLAYER);
    expect(view).toEqual({ counts: { ...emptyTutorialCounts(), level: 1 }, claimed: 0 });
    expect(tutorialStates(view.counts, view.claimed)).toEqual(["open", "locked", "locked", "locked", "locked", "locked", "locked", "locked"]);
  });

  it("leads the player through the eight steps in order; an action done early completes its step as it opens; each pays once", async () => {
    const { sources, ledger, store, clock } = clocked();
    const views = sources.views as typeof sources.views & TutorialViews;
    const signer = sources.signer as GameSigner & TutorialWrites;
    const writes = ledger.writesFor(PLAYER);
    const states = async () => {
      const v = await views.tutorialSteps(PLAYER);
      return tutorialStates(v.counts, v.claimed);
    };
    const refused = async (id: number) => refusal(await signer.claimTutorialStep(id).catch((e: unknown) => e));
    expect(await refused(1)).toBe("not-done");
    expect(await refused(2)).toBe("locked");

    // Step 1: founding the village is not saving it; a save is.
    await writes.foundFreeVillage();
    expect((await views.tutorialSteps(PLAYER)).counts["layout-saved"]).toBe(0);
    await writes.saveLayout((await ledger.freeVillage(PLAYER)).tiles);
    expect(await states()).toEqual(["done", "open", "locked", "locked", "locked", "locked", "locked", "locked"]);

    // A plan bought early (step 6): counted, but its step stays locked behind step 2.
    edit(store, (p) => (p.cobbles = 100));
    await buyCheapest(ledger, clock.now);
    expect((await views.tutorialSteps(PLAYER)).counts["shop-bought"]).toBe(1);
    expect(await refused(6)).toBe("locked");

    // Step 2: a Challenge game finished (a surrender ends it too).
    await surrenderedGame(ledger, PLAYER);
    expect((await states())[2]).toBe("open");

    // Step 3 then 4: a surrender settles an attack but does not win it; a 3-star attack wins.
    await attack(ledger, store, false);
    expect((await states()).slice(2, 5)).toEqual(["done", "open", "locked"]);
    await attack(ledger, store, true);
    expect((await views.tutorialSteps(PLAYER)).counts).toMatchObject({ "attack-settled": 2, "attack-won": 1 });

    // Step 5, a chest (the attack's epic one): step 6, done before, is completed as it opens; step 7 is the one open.
    expect((await states()).slice(4)).toEqual(["open", "locked", "locked", "locked"]);
    await writes.openChest();
    expect((await states()).slice(4)).toEqual(["done", "done", "open", "locked"]);

    // Step 7: a gift of the day's bar claimed (the indexer's count of dailies done stands at 3).
    ledger.countDailiesWith(async () => 3);
    await writes.claimDailyMilestone(TODAY, 0);
    expect((await states())[7]).toBe("open");

    // Step 8: level 3. Level 2 is short of it.
    edit(store, (p) => (p.v2.xp = xpFloor(3) - 1));
    expect(await refused(8)).toBe("not-done");
    edit(store, (p) => (p.v2.xp = xpFloor(3)));
    expect(await states()).toEqual(Array(8).fill("done"));

    // Each step's Cobbles, claimed in any order, at any time: once each, 170 in all.
    const before = (await views.account(PLAYER)).cobbles;
    const eighth = await signer.claimTutorialStep(8);
    expect(eighth.transactionHash.startsWith("0x6d6f636b")).toBe(true);
    expect(eighth.events).toEqual([{ name: "TutorialStepClaimed", fields: { playerId: PLAYER, step: 8, cobbles: 50, balance: before + 50 }, fromAddress: "0x3" }]);
    expect(await refused(8)).toBe("claimed");
    for (const s of TUTORIAL_STEPS.slice(0, 7)) await signer.claimTutorialStep(s.id);
    for (const s of TUTORIAL_STEPS) expect(await refused(s.id)).toBe("claimed");
    for (const id of [0, 9, 1.5]) expect(await refused(id)).toBe("no-step");
    expect((await views.account(PLAYER)).cobbles).toBe(before + TUTORIAL_COBBLES);
    expect(TUTORIAL_COBBLES).toBe(170);

    // Every step claimed: the section's end.
    const end = await views.tutorialSteps(PLAYER);
    expect(end.claimed).toBe(0b1111_1111);
    expect(tutorialFinished(end.claimed)).toBe(true);
  });

  it("does not complete Builder for an empty layout saved: no tile placed", async () => {
    const { ledger } = clocked();
    const writes = ledger.writesFor(PLAYER);
    await writes.foundFreeVillage();
    const starter = (await ledger.freeVillage(PLAYER)).tiles;
    // Both saves take an empty layout (the starter alone), and neither counts.
    await writes.saveLayout([]);
    await writes.saveLayoutTo(0, []);
    expect((await ledger.freeVillage(PLAYER)).tiles).toEqual([]);
    const view = await ledger.tutorialSteps(PLAYER);
    expect(view.counts["layout-saved"]).toBe(0);
    expect(tutorialStates(view.counts, view.claimed).slice(0, 2)).toEqual(["open", "locked"]);
    expect(refusal(await writes.claimTutorialStep(1).catch((e: unknown) => e))).toBe("not-done");
    // Tiles placed again, then saved, do.
    await writes.saveLayoutTo(0, starter);
    expect((await ledger.tutorialSteps(PLAYER)).counts["layout-saved"]).toBe(1);
  });

  it("refuses a claim and leaves the ledger as it was: no Cobbles, nothing claimed", async () => {
    const { ledger } = clocked();
    const writes = ledger.writesFor(PLAYER);
    const error = await writes.claimTutorialStep(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TutorialStepRefusedError);
    expect((error as TutorialStepRefusedError).transactionHash?.startsWith("0x6d6f636b")).toBe(true);
    expect(await ledger.tutorialSteps(PLAYER)).toMatchObject({ claimed: 0 });
    expect((await ledger.account(PLAYER)).cobbles).toBe(0);
  });

  it("keeps the counts and claims over a reload; a state saved before the Tutorial counts from then", async () => {
    const { ledger, store } = clocked();
    const writes = ledger.writesFor(PLAYER);
    await writes.foundFreeVillage();
    await writes.saveLayout((await ledger.freeVillage(PLAYER)).tiles);
    await writes.claimTutorialStep(1);
    const reload = () => new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, starting: { usdc: 0n, paved: 0n } });
    expect(await reload().tutorialSteps(PLAYER)).toEqual({ counts: { ...emptyTutorialCounts(), "layout-saved": 1, level: 1 }, claimed: 0b1 });
    // The same player saved before the Tutorial (no `tutorial`): the village and its XP are kept, nothing is counted yet.
    edit(store, (p) => {
      delete p.tutorial;
      p.v2.xp = xpFloor(4);
    });
    expect(await reload().tutorialSteps(PLAYER)).toEqual({ counts: { ...emptyTutorialCounts(), level: 4 }, claimed: 0 });
    await reload().writesFor(PLAYER).saveLayout((await ledger.freeVillage(PLAYER)).tiles);
    expect((await reload().tutorialSteps(PLAYER)).counts["layout-saved"]).toBe(1);
  });
});

describe("the Tutorial's steps through the hooks (#977)", () => {
  it("read the counts and claims, and claim a step into the cache", async () => {
    const { sources, ledger } = clocked();
    const writes = ledger.writesFor(PLAYER);
    await writes.foundFreeVillage();
    await writes.saveLayout((await ledger.freeVillage(PLAYER)).tiles);
    const { result } = renderData(() => ({ tutorial: useTutorialSteps(PLAYER), claims: useTutorialClaims(PLAYER) }), sources);
    expect(await dataOf({ get current() { return result.current.tutorial; } })).toEqual({ counts: { ...emptyTutorialCounts(), "layout-saved": 1, level: 1 }, claimed: 0 });
    expect(result.current.claims.claimer).not.toBeNull();
    await result.current.claims.claim(1);
    await waitFor(() => expect(result.current.tutorial.data?.claimed).toBe(0b1));
    expect((await sources.views.account(PLAYER)).cobbles).toBe(10);
    await expect(result.current.claims.claim(1)).rejects.toBeInstanceOf(TutorialStepRefusedError);
  });

  it("read nothing where the views do not serve them (the chain before #738), and claim nothing without the signer's write", async () => {
    const { sources } = fakeSources();
    const { result } = renderData(() => ({ tutorial: useTutorialSteps(PLAYER), none: useTutorialSteps(null), claims: useTutorialClaims(PLAYER) }), sources);
    expect(result.current.tutorial).toEqual({ data: null, isPending: false, error: null });
    expect(result.current.none).toEqual({ data: null, isPending: false, error: null });
    expect(result.current.claims.claimer).toBeNull();
    await expect(result.current.claims.claim(1)).rejects.toThrow("Connect to claim");
  });
});
