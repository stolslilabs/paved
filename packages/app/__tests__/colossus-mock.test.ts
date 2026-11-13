import { describe, expect, it } from "vitest";
import { COLOSSUS_TIERS, colossusEndsAt, colossusWeekOf, colossusWeekStart } from "@paved/game-core";
import type { ColossusPlace, ColossusSource } from "../src/data/colossus-source";
import { MockLedger } from "../src/data/mock/ledger";
import { mockColossus } from "../src/data/mock/overlay";
import { memoryStore } from "./data-fakes";

// The mock's Colossus (the weekly collective event, all on the client): the week's site and its simulated builders, a tile laid by
// the rules, a refusal that leaves everything as it was, the tiers' and the top 10's Cobbles, and a new site each week.

const ME = "0x51a7";
const WEEK = colossusWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const START = colossusWeekStart(WEEK);
const MONDAY = START + 9 * 3_600;

function world(at = MONDAY, store = memoryStore()) {
  const clock = { now: at };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { clock, ledger, colossus: mockColossus(ledger), store };
}

/** The first tile of the hand that fits somewhere, where it sets the most stones. */
async function bestTile(colossus: ColossusSource): Promise<ColossusPlace & { stones: number }> {
  const state = await colossus.state(ME);
  let found: (ColossusPlace & { stones: number }) | null = null;
  for (const card of state.me!.hand) {
    for (const lot of state.lots) {
      if (lot.holes === 0 || (lot.heart && !state.heartOpen)) continue;
      for (const p of (await colossus.options(ME, lot.board, card.card)).placements) if (!found || p.stones > found.stones) found = { card: card.card, board: lot.board, ...p };
    }
    if (found) break;
  }
  if (!found) throw new Error("no tile of the hand fits");
  return found;
}

describe("the mock's Colossus: a week on the client", () => {
  it("shows the week's site: a heart and twelve districts, the tiers, the builders, three tiles in hand", async () => {
    const { colossus } = world();
    const state = await colossus.state(ME);
    expect(state).toMatchObject({ week: WEEK, day: 0, endsAt: colossusEndsAt(WEEK), nextDayAt: START + 86_400, side: 4, cells: 1_024, heartOpen: false, completedAt: null });
    expect(state.lots).toHaveLength(16);
    expect(state.lots.filter((l) => l.heart)).toHaveLength(4);
    expect(state.lots.filter((l) => !l.heart).map((l) => l.cells)).toEqual(Array(12).fill(64));
    expect(state.tiers.map((t) => [t.share, t.stones, t.cobbles])).toEqual([[25, 256, 10], [50, 512, 15], [75, 768, 20], [100, 1_024, 30]]);
    expect(state.me).toMatchObject({ tiles: 0, stones: 0, place: null, behind: null, named: false, toClaim: 0 });
    expect(state.me!.hand.map((c) => c.card)).toEqual([0, 1, 2]);
    // The community builds: by Monday 09:00 some have laid a tile.
    expect(state.builders).toBeGreaterThan(0);
    expect(state.top.length).toBeGreaterThan(0);
    expect(state.top.every((r, i) => r.place === i + 1 && (i === 0 || state.top[i - 1]!.stones >= r.stones))).toBe(true);
    // Without an account: the site alone.
    expect((await colossus.state(null)).me).toBeNull();
  });

  it("lays a tile of the hand: it is on its board, the hand is one short, the builder is ranked", async () => {
    const { colossus } = world();
    const tile = await bestTile(colossus);
    const placed = await colossus.place(ME, tile);
    expect(placed.stones).toBe(tile.stones);
    expect(placed.mine).toMatchObject({ tiles: 1, stones: tile.stones });
    expect(placed.after).toBeGreaterThanOrEqual(placed.before + tile.stones);
    const board = await colossus.board(ME, tile.board);
    expect(board.tiles.find((t) => t.x === tile.x && t.y === tile.y)).toMatchObject({ mine: true, prebuilt: false, orientation: tile.orientation });
    expect(board.hand.map((c) => c.card)).not.toContain(tile.card);
    const state = await colossus.state(ME);
    expect(state.me).toMatchObject({ tiles: 1, stones: tile.stones });
    expect(state.me!.place).not.toBeNull();
    expect((await colossus.builders(ME)).find((r) => r.me)).toMatchObject({ tiles: 1, stones: tile.stones });
    // Another account sees the tile as a builder's, not its own.
    expect((await colossus.board("0x51a8", tile.board)).tiles.find((t) => t.x === tile.x && t.y === tile.y)).toMatchObject({ mine: false, prebuilt: false });
  });

  it("refuses what the rules refuse, and leaves the hand and the board as they were", async () => {
    const { colossus } = world();
    const tile = await bestTile(colossus);
    const before = await colossus.board(ME, tile.board);
    const taken = before.tiles[0]!;
    await expect(colossus.place(ME, { ...tile, x: taken.x, y: taken.y })).rejects.toThrow("Colossus: not a hole");
    await expect(colossus.place(ME, { ...tile, card: 20 })).rejects.toThrow("Colossus: not in hand");
    await expect(colossus.place(ME, { ...tile, board: 0, x: 0, y: 0 })).rejects.toThrow("Colossus: the heart is not open");
    await expect(colossus.place(ME, { ...tile, board: 99 })).rejects.toThrow("Colossus: no such district");
    await expect(colossus.board(ME, 99)).rejects.toThrow("Colossus: no such district");
    expect(await colossus.board(ME, tile.board)).toEqual(before);
    // The tile is still in hand, and still goes where it went.
    await expect(colossus.place(ME, tile)).resolves.toMatchObject({ mine: { tiles: 1 } });
  });

  it("marks where a picked tile may go, with the stones it would set, and nothing on a closed heart", async () => {
    const { colossus } = world();
    const tile = await bestTile(colossus);
    const options = await colossus.options(ME, tile.board, tile.card);
    expect(options.placements.length).toBeGreaterThan(0);
    const board = await colossus.board(ME, tile.board);
    const taken = new Set(board.tiles.map((t) => `${t.x},${t.y}`));
    expect(options.placements.every((p) => !taken.has(`${p.x},${p.y}`) && p.orientation >= 1 && p.orientation <= 4 && p.stones >= 0)).toBe(true);
    expect(options.refused.every((r) => !options.placements.some((p) => p.x === r.x && p.y === r.y))).toBe(true);
    expect(await colossus.options(ME, 0, tile.card)).toEqual({ placements: [], refused: [] });
    expect((await colossus.board(ME, 0)).open).toBe(false);
  });

  it("pays the tiers to a builder who laid a tile, from the tier's time, once", async () => {
    const { colossus, clock, ledger } = world();
    await expect(colossus.claim(ME, WEEK)).rejects.toThrow("Colossus: not a participant");
    await colossus.place(ME, await bestTile(colossus));
    // Day after day until the first tier is reached.
    let state = await colossus.state(ME);
    while (state.tiers[0]!.reachedAt === null) {
      clock.now += 6 * 3_600;
      state = await colossus.state(ME);
    }
    const due = state.tiers.filter((t) => t.reachedAt !== null).reduce((sum, t) => sum + t.cobbles, 0);
    expect(state.me!.toClaim).toBe(due);
    const before = (await ledger.account(ME)).cobbles;
    expect(await colossus.claim(ME, WEEK)).toEqual({ cobbles: due });
    expect((await ledger.account(ME)).cobbles).toBe(before + due);
    state = await colossus.state(ME);
    expect(state.me!.toClaim).toBe(0);
    expect(state.tiers[0]!.claimed).toBe(true);
    await expect(colossus.claim(ME, WEEK)).rejects.toThrow("Colossus: nothing to claim");
    await expect(colossus.claim(ME, WEEK - 3)).rejects.toThrow("Colossus: nothing to claim");
  });

  it("opens the heart at 50%, and nearly completes the site by the week's end", async () => {
    const { colossus, clock } = world();
    clock.now = colossusEndsAt(WEEK) - 60;
    const state = await colossus.state(ME);
    expect(state.day).toBe(6);
    expect(state.heartOpen).toBe(true);
    expect(state.tiers[1]!.reachedAt).not.toBeNull();
    expect(state.stones / state.cells).toBeGreaterThan(0.85);
    // The hand on Sunday: Saturday's tiles and Sunday's.
    expect(state.me!.hand.map((c) => c.day)).toEqual([5, 5, 5, 6, 6, 6]);
    expect((await colossus.board(ME, 0)).size).toBe(16);
  });

  it("starts a new site on Monday, shows last week's result and pays its tiers and its place", async () => {
    const { colossus, clock, ledger } = world();
    const tile = await bestTile(colossus);
    await colossus.place(ME, tile);
    clock.now = colossusEndsAt(WEEK) + 3_600;
    const state = await colossus.state(ME);
    expect(state.week).toBe(WEEK + 1);
    expect(state.day).toBe(0);
    expect(state.me).toMatchObject({ tiles: 0, stones: 0 });
    expect(state.lots.filter((l) => !l.heart).reduce((sum, l) => sum + l.holes, 0)).toBeGreaterThan(300);
    const result = state.result;
    expect(result.week).toBe(WEEK);
    expect(result.plaque).toHaveLength(10);
    expect(result.plaque.map((r) => r.cobbles)).toEqual([150, 100, 75, 50, 50, 50, 50, 50, 50, 50]);
    expect(result.me).toMatchObject({ tiles: 1, stones: tile.stones });
    const tiers = result.tiers.filter((t) => t.reachedAt !== null).reduce((sum, t) => sum + t.cobbles, 0);
    const mine = result.plaque.find((r) => r.me)?.cobbles ?? 0;
    expect(result.me!.cobbles).toBe(tiers + mine);
    expect(result.me!.toClaim).toBe(tiers + mine);
    const before = (await ledger.account(ME)).cobbles;
    expect(await colossus.claim(ME, WEEK)).toEqual({ cobbles: tiers + mine });
    expect((await ledger.account(ME)).cobbles).toBe(before + tiers + mine);
    expect((await colossus.state(ME)).result.me!.toClaim).toBe(0);
    await expect(colossus.claim(ME, WEEK)).rejects.toThrow("Colossus: nothing to claim");
    // A builder who laid no tile last week is paid nothing.
    expect((await colossus.state("0x51a8")).result.me).toBeNull();
    await expect(colossus.claim("0x51a8", WEEK)).rejects.toThrow("Colossus: not a participant");
  });

  it("keeps the account's tiles: another ledger on the same store plays the week again to the same site", async () => {
    const first = world();
    const tile = await bestTile(first.colossus);
    await first.colossus.place(ME, tile);
    first.clock.now += 2 * 86_400;
    const seen = await first.colossus.state(ME);
    const second = world(first.clock.now, first.store);
    const again = await second.colossus.state(ME);
    expect(again).toEqual(seen);
    expect((await second.colossus.board(ME, tile.board)).tiles.find((t) => t.x === tile.x && t.y === tile.y)).toMatchObject({ mine: true });
  });

  it("pays every tier's Cobbles as the proposal lists them", () => {
    expect(COLOSSUS_TIERS.map((t) => t.cobbles)).toEqual([10, 15, 20, 30]);
  });
});
