import { describe, expect, it } from "vitest";
import { MASTERPIECE_DAILY, MASTERPIECE_FLOOR, MASTERPIECE_TIERS, Masterpiece, OrientationType, masterpieceEndsAt, masterpieceKindOf, masterpieceSeasonOf, masterpieceWeekOf, masterpieceWeekStart, type MasterpieceEntry } from "@paved/game-core";
import type { MasterpieceSource } from "../src/data/masterpiece-source";
import { claim, fieldAt, freshMasterpiece, open, play } from "../src/data/mock/masterpiece";
import { MockLedger } from "../src/data/mock/ledger";
import { mockMasterpiece } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Masterpiece (the weekly individual event, all on the client): the week's kind, the board opened and its twelve tiles a
// day, the moves by game-core's rules, the drawn builders' live ranking, the result with its tier and its Cobbles the week after, and
// a new Masterpiece each week.

const ME = "0x51a7";
const ORIENTATIONS = Object.values(OrientationType);
/** The week of 2026-11-09: the crowned wonder's. */
const WEEK = masterpieceWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const MONDAY = masterpieceWeekStart(WEEK) + 3_600;
const DAY = 86_400;

function world(at = MONDAY) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, masterpiece: mockMasterpiece(ledger) };
}

/** The move a plain builder makes with the tile in hand: the placement that scores the most, then grows the most; a discard where it fits nowhere. */
function bestMove(board: Masterpiece): MasterpieceEntry {
  let best: { move: MasterpieceEntry; value: number } | null = null;
  for (const p of board.legalPlacements()) {
    const after = board.clone();
    after.build(p);
    const value = after.score * 1_000 + (after.prospect()?.worth ?? 0);
    if (!best || value > best.value) best = { move: { k: "build", o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y }, value };
  }
  return best?.move ?? { k: "discard" };
}

/** Plays `count` tiles of the player's board with `bestMove`, each sent to the source. */
async function playTiles(masterpiece: MasterpieceSource, count: number): Promise<Masterpiece> {
  const record = await masterpiece.board(ME);
  const board = Masterpiece.replay(record.week, BigInt(record.seed), record.log);
  for (let i = 0; i < count; i++) {
    const move = bestMove(board);
    board.apply(move);
    await masterpiece.play(ME, record.week, move);
  }
  return board;
}

describe("the mock's Masterpiece: a week on the client", () => {
  it("shows the week's kind before the first visit, and no board", async () => {
    const { masterpiece } = world();
    const state = await masterpiece.state(ME);
    expect(state).toMatchObject({ week: WEEK, season: masterpieceSeasonOf(WEEK), kind: "wonder", day: 0, endsAt: masterpieceEndsAt(WEEK), board: null, result: null });
    expect((await masterpiece.state(null)).board).toBeNull();
    await expect(masterpiece.board(ME)).rejects.toThrow("Masterpiece: board does not exist");
    await expect(masterpiece.play(ME, WEEK, { k: "discard" })).rejects.toThrow("Masterpiece: board does not exist");
  });

  it("opens the board once, and gives twelve tiles a day: a day's tiles played, the next waits for midnight", async () => {
    const { masterpiece, clock } = world();
    const first = await masterpiece.open(ME);
    expect(first).toMatchObject({ week: WEEK, log: [], endsAt: masterpieceEndsAt(WEEK) });
    expect((await masterpiece.open(ME)).seed).toBe(first.seed);
    expect((await masterpiece.state(ME)).board).toMatchObject({ piece: null, score: 0, played: 0, waiting: MASTERPIECE_DAILY, toCome: 72, place: null, tier: null });
    await playTiles(masterpiece, MASTERPIECE_DAILY);
    expect((await masterpiece.state(ME)).board).toMatchObject({ played: 12, waiting: 0, toCome: 72, days: [12, 0, 0, 0, 0, 0, 0] });
    await expect(masterpiece.play(ME, WEEK, { k: "discard" })).rejects.toThrow("Masterpiece: no tile waiting");
    expect((await masterpiece.board(ME)).log).toHaveLength(12);
    // Thursday: Tuesday's, Wednesday's and Thursday's tiles wait, in day order.
    clock.now = MONDAY + 3 * DAY;
    expect((await masterpiece.state(ME)).board).toMatchObject({ waiting: 36, toCome: 36 });
    await masterpiece.play(ME, WEEK, { k: "discard" });
    expect((await masterpiece.state(ME)).board).toMatchObject({ played: 13, discards: 1, days: [12, 1, 0, 0, 0, 0, 0] });
  });

  it("refuses an illegal move and leaves the board as it was", async () => {
    const { masterpiece } = world();
    await masterpiece.open(ME);
    await expect(masterpiece.play(ME, WEEK, { k: "build", o: 1, x: 9, y: 9 })).rejects.toThrow("Tile: no neighbors");
    expect((await masterpiece.board(ME)).log).toEqual([]);
  });

  it("plays the week, ranks the masterpiece among the builders, and pays its tier the week after", async () => {
    const { masterpiece, clock, ledger } = world();
    await masterpiece.open(ME);
    clock.now = MONDAY + 6 * DAY;
    const board = await playTiles(masterpiece, 84);
    const piece = board.piece()!;
    expect(piece.size).toBeGreaterThanOrEqual(MASTERPIECE_FLOOR);
    const live = await masterpiece.state(ME);
    expect(live.board).toMatchObject({ piece: { kind: "wonder", size: piece.size, points: piece.points }, score: board.score, counted: true, waiting: 0, toCome: 0, played: 84 });
    expect(live.board!.place).toBeGreaterThan(1);
    expect(live.builders).toBeGreaterThan(200);
    const ranking = await masterpiece.ranking(ME);
    expect(ranking.top).toHaveLength(10);
    expect(ranking.top.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranking.me).toMatchObject({ place: live.board!.place, score: board.score, me: true, name: "You" });
    expect(ranking.bars.map((b) => b.tier.id)).toEqual(["top1", "top5", "top20", "top50", "counted"]);
    const bars = ranking.bars.map((b) => b.from!);
    expect([...bars].sort((a, b) => b - a)).toEqual(bars);
    await expect(masterpiece.claim(ME, WEEK)).rejects.toThrow("Masterpiece: the week is not over");

    // Monday: the board is frozen, last week's result waits beside the new week.
    clock.now = masterpieceEndsAt(WEEK) + 3_600;
    await expect(masterpiece.play(ME, WEEK, { k: "discard" })).rejects.toThrow("Masterpiece: the week is over");
    const next = await masterpiece.state(ME);
    expect(next).toMatchObject({ week: WEEK + 1, kind: masterpieceKindOf(WEEK + 1), day: 0, board: null });
    const result = next.result!;
    expect(result).toMatchObject({ week: WEEK, kind: "wonder", score: board.score, piece: { size: piece.size }, claimed: false });
    expect(result.tier).not.toBeNull();
    expect(result.cobbles).toBe(result.tier!.cobbles);
    expect(result.master).toMatchObject({ place: 1, me: false });
    expect(result.master!.score).toBeGreaterThan(board.score);
    const before = (await ledger.account(ME)).cobbles;
    expect(await masterpiece.claim(ME, WEEK)).toEqual({ cobbles: result.cobbles });
    expect((await ledger.account(ME)).cobbles).toBe(before + result.cobbles);
    expect((await masterpiece.state(ME)).result).toMatchObject({ claimed: true });
    await expect(masterpiece.claim(ME, WEEK)).rejects.toThrow("Masterpiece: already claimed");
    // The Hall keeps the week's best among its records.
    expect((await masterpiece.ranking(ME)).hall.find((r) => r.kind === "wonder")).toMatchObject({ name: result.master!.name, score: result.master!.score });
    // Two weeks on: nothing of the week before last is shown.
    clock.now += 7 * DAY;
    expect((await masterpiece.state(ME)).result).toBeNull();
  });
});

describe("the mock's Masterpiece: the rules on the stored state", () => {
  it("pays nothing for a board with no counted masterpiece", () => {
    const stored = freshMasterpiece();
    open(stored, ME, MONDAY);
    play(stored, ME, WEEK, { k: "discard" }, MONDAY);
    const later = masterpieceEndsAt(WEEK) + 60;
    expect(() => claim(stored, ME, WEEK, later)).toThrow("Masterpiece: no counted masterpiece");
    expect(() => claim(stored, "0xabc", WEEK, later)).toThrow("Masterpiece: board does not exist");
  });

  it("draws the week's builders: the same at each read, more of them closed as the week goes, none under the floor", () => {
    const end = masterpieceEndsAt(WEEK);
    const field = fieldAt(WEEK, end);
    expect(fieldAt(WEEK, end)).toEqual(field);
    expect(field.length).toBeGreaterThan(250);
    expect(field.every((f) => f.size >= MASTERPIECE_FLOOR && f.at < end)).toBe(true);
    const wednesday = fieldAt(WEEK, MONDAY + 2 * DAY);
    expect(wednesday.length).toBeLessThan(field.length);
    expect(Math.max(...wednesday.map((f) => f.score))).toBeLessThanOrEqual(Math.max(...field.map((f) => f.score)));
    expect(fieldAt(WEEK + 1, end + 7 * DAY)).not.toEqual(field);
    expect(MASTERPIECE_TIERS).toHaveLength(5);
  });
});
