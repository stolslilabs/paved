import { describe, expect, it } from "vitest";
import { CENTER, FAIR_FLOOR, FAIR_OFFERS, FAIR_TIERS, FAIR_TRIES, FairDraft, OrientationType, SeededChallenge, fairEndsAt, fairIsMythic, fairRandomOf, fairSeasonOf, fairWeekOf, fairWeekStart, type SeededMove } from "@paved/game-core";
import type { FairTryRecord } from "../src/data/fair-source";
import { MockLedger } from "../src/data/mock/ledger";
import { mockFair } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Fair (the weekly individual event, all on the client): the week, a try from its draft to its game, the tries of a day,
// the ranking and its tiers, the result with its Cobbles, and a new week when one ends.

const ME = "0xfa17";
const OTHER = "0xfa18";
const ORIENTATIONS = Object.values(OrientationType);
const WEEK = fairWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const TUESDAY = fairWeekStart(WEEK) + 86_400 + 43_200;

function world(at = TUESDAY) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, fair: mockFair(ledger) };
}
type Fair = ReturnType<typeof mockFair>;

const draftOf = (record: FairTryRecord) => FairDraft.replay(record.season, fairRandomOf(BigInt(record.seed)), record.picks);

/** The whole draft of a try, each offer answered by `choose`; the try as the source then answers it. */
async function draftOut(fair: Fair, record: FairTryRecord, choose: (cards: number[]) => number = () => 0, player = ME): Promise<FairTryRecord> {
  let current = record;
  for (let draft = draftOf(current); !draft.over; draft = draftOf(current)) current = await fair.pick(player, current.id, draft.offer!.number, choose(draft.offer!.cards));
  return current;
}

/** A whole game on its record, the first legal placement each turn (a discard when none), every move sent. */
async function playOut(fair: Fair, record: FairTryRecord, player = ME): Promise<number> {
  const engine = new SeededChallenge(BigInt(record.seed), BigInt(record.player), undefined, undefined, record.cards);
  while (!engine.over) {
    const p = engine.rules.legalPlacements()[0];
    const move: SeededMove = p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
    engine.play(move);
    await fair.play(player, record.id, move);
  }
  return engine.score;
}

describe("the mock's Fair: a week on the client", () => {
  it("shows the week: its stall's season, its day, its end, three tries today", async () => {
    const { fair } = world();
    const state = await fair.state(ME);
    expect(state).toMatchObject({ week: WEEK, season: fairSeasonOf(WEEK), day: 1, endsAt: fairEndsAt(WEEK), result: null });
    expect(state.me).toEqual({ triesToday: 0, triesLeft: FAIR_TRIES, open: null, best: null, place: null, tier: null });
    expect((await fair.state(null)).me).toBeNull();
  });

  it("fills the ranking with the community's bests as the week goes, each in its tier", async () => {
    const { fair, clock } = world(fairWeekStart(WEEK) + 3_600);
    const early = await fair.ranking(null);
    clock.now = fairEndsAt(WEEK) - 60;
    const late = await fair.ranking(null);
    expect(late.players).toBeGreaterThan(early.players);
    expect(late.players).toBeGreaterThan(10);
    expect(late.entries.map((e) => e.score)).toEqual([...late.entries.map((e) => e.score)].sort((a, b) => b - a));
    expect(late.entries.every((e) => e.score >= FAIR_FLOOR)).toBe(true);
    expect(late.entries[0]).toMatchObject({ place: 1, tier: 0 });
    expect(late.bars[0]).toBe(late.entries[0]!.score);
    expect(late.me).toBeNull();
    // Each listed player's deck: twenty tiles less a tile per mythic.
    expect(late.entries.length).toBeLessThanOrEqual(10);
    for (const e of late.entries) expect(e.tiles).toBe(FAIR_OFFERS - e.mythics);
    expect(late).toMatchObject({ around: [], friends: [], tries: [] });
  });

  it("runs a try: twenty offers, the deck they build, then its game on that deck", async () => {
    const { fair } = world();
    const started = await fair.start(ME);
    expect(started).toMatchObject({ week: WEEK, try: 1, stage: "draft", picks: [], cards: [], over: false });
    expect((await fair.state(ME)).me).toMatchObject({ triesToday: 1, triesLeft: FAIR_TRIES - 1, open: { id: started.id, stage: "draft", offers: 0, tiles: 0 } });
    // The game does not start before the deck is built.
    await expect(fair.play(ME, started.id, { kind: "discard" })).rejects.toThrow("Fair: the draft is not over");

    const drafted = await draftOut(fair, started, (cards) => Math.max(0, cards.findIndex((card) => !fairIsMythic(card))));
    expect(drafted.stage).toBe("game");
    expect(drafted.cards).toHaveLength(FAIR_OFFERS);
    expect((await fair.state(ME)).me!.open).toMatchObject({ stage: "game", offers: FAIR_OFFERS, tiles: FAIR_OFFERS });
    await expect(fair.pick(ME, started.id, FAIR_OFFERS, 0)).rejects.toThrow("Fair: the draft is over");

    const score = await playOut(fair, drafted);
    const over = await fair.game(started.id);
    expect(over).toMatchObject({ over: true, score, stage: "game" });
    expect(over.moves).toHaveLength(FAIR_OFFERS);
    const result = await fair.result(started.id);
    expect(result).toMatchObject({ tryId: started.id, score, try: 1, left: FAIR_TRIES - 1, bestBefore: null, bestAfter: score, late: false });
    const state = await fair.state(ME);
    expect(state.me).toMatchObject({ open: null, best: score });
    // The ranking's own lists: the try in the player's tries, the best tagged; the player among their friends once it counts.
    const ranking = await fair.ranking(ME);
    expect(ranking.tries).toEqual([{ id: started.id, day: 1, try: 1, stage: "game", over: true, score, tiles: FAIR_OFFERS, mythics: 0, best: true }]);
    expect(ranking.friends.map((f) => f.place)).toEqual(score >= FAIR_FLOOR ? [1] : []);
    if (ranking.me && ranking.me.place > 10) expect(ranking.around.map((e) => e.place)).toContain(ranking.me.place);
    // A best under the floor counts nowhere; one over it has a place and a tier.
    if (score >= FAIR_FLOOR) expect(state.me!.place).not.toBeNull();
    else expect(state.me).toMatchObject({ place: null, tier: null });
  });

  it("makes a mythic cost two picks: the deck is one tile shorter, and so is the game", async () => {
    const { fair } = world();
    // A try whose offers show a mythic: the seeds are the ledger's, so tries are started until one does.
    for (let n = 0; n < FAIR_TRIES; n++) {
      const started = await fair.start(ME);
      const drafted = await draftOut(fair, started, (cards) => Math.max(0, cards.findIndex(fairIsMythic)));
      const mythics = drafted.cards.filter(fairIsMythic).length;
      expect(drafted.cards).toHaveLength(FAIR_OFFERS - mythics);
      await playOut(fair, drafted);
      expect((await fair.game(started.id)).moves).toHaveLength(FAIR_OFFERS - mythics);
    }
  });

  it("refuses a pick that does not answer the offer on the table, another player's try, and a second try while one is open", async () => {
    const { fair } = world();
    const started = await fair.start(ME);
    await expect(fair.pick(ME, started.id, 2, 0)).rejects.toThrow("Fair: not the offer on the table");
    await expect(fair.pick(ME, started.id, 1, 3)).rejects.toThrow("Fair: not a tile of the offer");
    await expect(fair.pick(OTHER, started.id, 1, 0)).rejects.toThrow("Fair: not the try's player");
    await expect(fair.start(ME)).rejects.toThrow("Fair: a try is open");
    expect((await fair.game(started.id)).picks).toEqual([]);
    await expect(fair.game(999)).rejects.toThrow("Fair: try does not exist");
    await expect(fair.result(started.id)).rejects.toThrow("Fair: the try is not over");
  });

  it("gives three tries a day, a try left during its draft spent, and three more the next day", async () => {
    const { fair, clock } = world();
    for (let n = 1; n <= FAIR_TRIES; n++) {
      const started = await fair.start(ME);
      expect(started.try).toBe(n);
      await fair.pick(ME, started.id, 1, 0);
      await fair.abandon(ME, started.id);
      expect(await fair.game(started.id)).toMatchObject({ stage: "abandoned", over: true, score: 0 });
    }
    expect((await fair.state(ME)).me).toMatchObject({ triesToday: FAIR_TRIES, triesLeft: 0, open: null, best: null });
    await expect(fair.start(ME)).rejects.toThrow("Fair: no try left today");
    clock.now += 86_400;
    expect((await fair.state(ME)).me).toMatchObject({ triesToday: 0, triesLeft: FAIR_TRIES });
    expect((await fair.start(ME)).try).toBe(1);
  });

  it("refuses to leave a try whose game has begun: a game is surrendered, and its score stands", async () => {
    const { fair } = world();
    const drafted = await draftOut(fair, await fair.start(ME));
    await expect(fair.abandon(ME, drafted.id)).rejects.toThrow("Fair: the draft is over");
    await fair.play(ME, drafted.id, { kind: "surrender" });
    expect(await fair.game(drafted.id)).toMatchObject({ over: true, stage: "game" });
  });

  it("closes the week on Sunday: a try still open counts nowhere, and a new week starts", async () => {
    const { fair, clock } = world(fairEndsAt(WEEK) - 600);
    const drafting = await fair.start(ME);
    clock.now = fairEndsAt(WEEK) + 60;
    await expect(fair.pick(ME, drafting.id, 1, 0)).rejects.toThrow("Fair: the week is over");
    const state = await fair.state(ME);
    expect(state).toMatchObject({ week: WEEK + 1, season: fairSeasonOf(WEEK + 1), result: null });
    expect(state.me).toMatchObject({ triesLeft: FAIR_TRIES, open: null });
    // Last week's try does not block the new week's.
    expect((await fair.start(ME)).week).toBe(WEEK + 1);
  });

  it("pays the week's tier on Monday, once, and names the champion with their deck", async () => {
    const { fair, clock, ledger } = world();
    const drafted = await draftOut(fair, await fair.start(ME));
    const score = await playOut(fair, drafted);
    await expect(fair.claim(ME, WEEK)).rejects.toThrow("Fair: the week is not over");
    clock.now = fairEndsAt(WEEK) + 3_600;
    const result = (await fair.state(ME)).result!;
    expect(result).toMatchObject({ week: WEEK, season: fairSeasonOf(WEEK), best: score, claimed: false });
    expect(result.champion!.score).toBeGreaterThanOrEqual(score);
    expect(result.champion!.cards.length).toBeGreaterThan(FAIR_OFFERS - 7);
    expect(result.champion!.cards.length).toBeLessThanOrEqual(FAIR_OFFERS);
    if (score < FAIR_FLOOR) {
      expect(result).toMatchObject({ place: null, tier: null, cobbles: 0 });
      await expect(fair.claim(ME, WEEK)).rejects.toThrow("Fair: nothing to claim");
      return;
    }
    expect(result.place).toBeLessThanOrEqual(result.players);
    expect(result.cobbles).toBe(FAIR_TIERS[result.tier!]!.cobbles);
    const before = (await ledger.account(ME)).cobbles;
    expect(await fair.claim(ME, WEEK)).toEqual({ cobbles: result.cobbles });
    expect((await ledger.account(ME)).cobbles).toBe(before + result.cobbles);
    expect((await fair.state(ME)).result).toMatchObject({ claimed: true });
    await expect(fair.claim(ME, WEEK)).rejects.toThrow("Fair: already claimed");
    // A player with no try in the week has no result and nothing to claim.
    expect((await fair.state(OTHER)).result).toBeNull();
    await expect(fair.claim(OTHER, WEEK)).rejects.toThrow("Fair: nothing to claim");
  });
});
