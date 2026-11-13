import { describe, expect, it } from "vitest";
import { EXPEDITION_HAND, EXPEDITION_LEVEL, EXPEDITION_RATION, Expedition, OrientationType, expeditionEndsAt, expeditionSeasonOf, expeditionTierOf, expeditionWeekOf, expeditionWeekStart } from "@paved/game-core";
import type { ExpeditionPlay } from "../src/data/expedition-source";
import { claim, freshExpedition, open, play } from "../src/data/mock/expedition";
import { MockLedger } from "../src/data/mock/ledger";
import { mockExpedition } from "../src/data/mock/overlay";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { memoryStore } from "./data-fakes";

// The mock's Expedition (the weekly individual event, all on the client): the week's map, the board opened and its daily draw, the
// moves by game-core's rules, the result with its tier and its Cobbles the week after, and a new expedition each week.

const ME = "0x51a7";
/** A seeded player of level 3 or more: the claim's level. */
const VETERAN = SEEDED_PLAYERS.find((p) => p.level >= EXPEDITION_LEVEL)!.address;
const ORIENTATIONS = Object.values(OrientationType);
const WEEK = expeditionWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MONDAY = expeditionWeekStart(WEEK) + 3_600;
const DAY = 86_400;

function world(at = MONDAY) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, expedition: mockExpedition(ledger) };
}

/** The hand's best move on `board` (the most points, a landmark's bonus included); null when no tile of the hand goes anywhere. */
function bestMove(board: Expedition): ExpeditionPlay | null {
  let best: { move: ExpeditionPlay; points: number } | null = null;
  for (const tile of board.hand) {
    for (const p of board.legalPlacements(tile.plan)) {
      const points = board.clone().build(tile.card, p).points;
      if (!best || points > best.points) best = { move: { k: "build", card: tile.card, o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y }, points };
    }
  }
  return best?.move ?? null;
}

describe("the mock's Expedition: a week on the client", () => {
  it("shows the week's map before the first visit, and no board", async () => {
    const { expedition } = world();
    const state = await expedition.state(ME);
    expect(state).toMatchObject({ week: WEEK, season: expeditionSeasonOf(WEEK), day: 0, endsAt: expeditionEndsAt(WEEK), board: null, result: null, level: 1 });
    expect((await expedition.state(null)).level).toBeNull();
    await expect(expedition.board(ME)).rejects.toThrow("Expedition: board does not exist");
    await expect(expedition.play(ME, WEEK, { k: "discard", card: 0 })).rejects.toThrow("Expedition: board does not exist");
  });

  it("opens the board and draws once a day: six tiles, held up to twelve, the rest lost", async () => {
    const { expedition, clock } = world();
    const first = await expedition.open(ME);
    expect(first).toMatchObject({ week: WEEK, log: [{ k: "draw", day: 0 }], endsAt: expeditionEndsAt(WEEK) });
    // A second visit the same day draws nothing.
    expect((await expedition.open(ME)).log).toHaveLength(1);
    expect((await expedition.state(ME)).board).toMatchObject({ hand: EXPEDITION_RATION, toCome: 36, laid: 0, due: { drawn: 0, lost: 0 } });
    // Thursday, nothing laid since Monday: three rations due, six fit the hand, twelve are lost.
    clock.now = MONDAY + 3 * DAY;
    expect((await expedition.state(ME)).board).toMatchObject({ due: { drawn: 6, lost: 12 } });
    await expedition.open(ME);
    const board = (await expedition.state(ME)).board!;
    expect(board).toMatchObject({ hand: EXPEDITION_HAND, toCome: 18, due: { drawn: 0, lost: 0 } });
    expect(board.days[3]).toMatchObject({ drawn: 6, lost: 12 });
    // Two accounts draw the same bag in their own order.
    const other = await expedition.open(VETERAN);
    expect(other.seed).not.toBe(first.seed);
  });

  it("takes the hand's moves by the engine's rules, and refuses the others", async () => {
    const { expedition, clock } = world();
    const record = await expedition.open(ME);
    const board = Expedition.replay(record.week, BigInt(record.seed), record.log);
    const move = bestMove(board)!;
    await expedition.play(ME, WEEK, move);
    await expect(expedition.play(ME, WEEK, move)).rejects.toThrow("Expedition: not in hand");
    await expect(expedition.play(ME, WEEK, { k: "build", card: board.hand.find((c) => c.card !== move.card)!.card, o: 1, x: 5, y: 7 })).rejects.toThrow(/^(Tile|Expedition): /);
    expect((await expedition.board(ME)).log).toEqual([{ k: "draw", day: 0 }, move]);
    expect((await expedition.state(ME)).board).toMatchObject({ hand: 5, laid: 1 });
    // A discard frees the hand.
    await expedition.play(ME, WEEK, { k: "discard", card: board.hand.find((c) => c.card !== move.card)!.card });
    expect((await expedition.state(ME)).board).toMatchObject({ hand: 4, laid: 1 });
    // Past Sunday the board takes no tile.
    clock.now = expeditionEndsAt(WEEK);
    await expect(expedition.play(ME, WEEK, { k: "discard", card: 0 })).rejects.toThrow("Expedition: the week is over");
  });

  it("plays a whole week, pays the tier's Cobbles the week after, and starts a new expedition", async () => {
    const { expedition, clock, ledger } = world();
    let score = 0;
    for (let day = 0; day < 7; day++) {
      clock.now = MONDAY + day * DAY;
      const record = await expedition.open(VETERAN);
      const board = Expedition.replay(record.week, BigInt(record.seed), record.log);
      for (let move = bestMove(board); move; move = bestMove(board)) {
        board.apply(move);
        await expedition.play(VETERAN, WEEK, move);
      }
      score = board.score;
    }
    const tier = expeditionTierOf(score);
    expect(tier).not.toBeNull();
    const live = await expedition.state(VETERAN);
    expect(live.board).toMatchObject({ score, tier });
    expect(live.result).toBeNull();
    await expect(expedition.claim(VETERAN, WEEK)).rejects.toThrow("Expedition: the week is not over");

    // The next Monday: last week's result, its Cobbles claimed once, and this week's map waits.
    clock.now = expeditionEndsAt(WEEK) + 60;
    const next = await expedition.state(VETERAN);
    expect(next).toMatchObject({ week: WEEK + 1, season: expeditionSeasonOf(WEEK + 1), day: 0, board: null });
    expect(next.result).toMatchObject({ week: WEEK, score, tier, cobbles: tier!.cobbles, claimed: false });
    expect(next.result!.landmarks).toHaveLength(4);
    for (const landmark of next.result!.landmarks) expect(landmark.share).toBeGreaterThan(0);
    const before = (await ledger.account(VETERAN)).cobbles;
    expect(await expedition.claim(VETERAN, WEEK)).toEqual({ cobbles: tier!.cobbles });
    expect((await ledger.account(VETERAN)).cobbles).toBe(before + tier!.cobbles);
    expect((await expedition.state(VETERAN)).result).toMatchObject({ claimed: true });
    await expect(expedition.claim(VETERAN, WEEK)).rejects.toThrow("Expedition: already claimed");
    expect((await expedition.open(VETERAN)).log).toEqual([{ k: "draw", day: 0 }]);
  }, 60_000);

  it("asks level 3 for the claim, and a tier", () => {
    const stored = freshExpedition();
    const board = open(stored, ME, MONDAY);
    const game = Expedition.replay(board.week, BigInt(board.seed), board.log);
    play(stored, ME, WEEK, bestMove(game)!, MONDAY);
    const later = expeditionEndsAt(WEEK) + 60;
    expect(() => claim(stored, ME, WEEK, later, 3)).toThrow("Expedition: no tier reached");
    expect(() => claim(stored, "0xabc", WEEK, later, 3)).toThrow("Expedition: board does not exist");
  });
});
