import {
  COLOSSUS_DAYS,
  COLOSSUS_DAY_S,
  COLOSSUS_NAME_TILES,
  COLOSSUS_TIERS,
  COLOSSUS_TOP,
  Colossus,
  colossusDayOf,
  colossusEndsAt,
  colossusLots,
  colossusRingsFor,
  colossusTopCobbles,
  colossusWeekOf,
  colossusWeekStart,
  type ColossusBuilder,
} from "@paved/game-core";
import type { ColossusBoardState, ColossusBuilderRow, ColossusOptions, ColossusPlace, ColossusPlaced, ColossusResult, ColossusState, ColossusTierState } from "../colossus-source";
import { addressKey } from "../keys";
import type { PublicProfile } from "../social-source";
import { community } from "./community";

// The mock's Colossus (the weekly collective event, game-core's `colossus.ts`), the whole event on the device: the community's
// players are the server's builders, each laying some of their day's tiles where the site hints (`Colossus.suggest`), at a time of
// day of their own; the device's accounts lay theirs by game-core's rules and claim their Cobbles. A week's site is played again
// from its start (the builders' tiles by their times, the accounts' stored tiles among them) and kept in memory while the page
// lives, then moved on as the clock does. Pure functions on the stored state: `MockLedger` runs them under its lock, as `joust.ts`'s.

/** The community's players who build: with the device's own, the builders the smallest site is sized for. */
const MOCK_BUILDERS = 56;
/** The rings of the mock's site, from its builders (as the chain sizes a site from the last Colossus's). */
export const MOCK_COLOSSUS_RINGS = colossusRingsFor(MOCK_BUILDERS + 1);
/**
 * The share of their tiles a simulated builder tries to lay (each tried the day it comes and, where it fits nowhere, once more the
 * day after): set so that the site is complete around the weekend, as the proposal sizes it.
 */
const MOCK_PLAY_SHARE = 0.72;
/** The hard holes the state lists: the hardest first. */
const HARD_HOLES = 5;

/** A small generator in [0, 1) from a 32-bit seed (mulberry32): the builders' times and choices, thousands a week. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** One tile an account laid, as stored: its address key, its second, its card, its board, its turn and its cell. */
export interface StoredColossusMove {
  a: string;
  t: number;
  c: number;
  b: number;
  o: number;
  x: number;
  y: number;
}

/** The mock's Colossus as stored: the accounts' tiles by week, in order, and each account's claims by week. */
export interface StoredColossus {
  weeks: Record<string, StoredColossusMove[]>;
  claims: Record<string, Record<string, { tiers: number[]; top: boolean }>>;
}

export const freshColossus = (): StoredColossus => ({ weeks: {}, claims: {} });

const builderKeys = (): string[] => community().slice(0, MOCK_BUILDERS).map((m) => addressKey(m.address));

/** A simulated builder's try: their tile `card` at `t`. */
interface Try {
  t: number;
  builder: string;
  card: number;
}

/** The week's tries, by time: each builder's tiles they play, the day they come and once more the day after. */
function triesOf(week: number): Try[] {
  const random = mulberry(Math.imul(week, 0x9e3779b1));
  const start = colossusWeekStart(week);
  const tries: Try[] = [];
  for (const builder of builderKeys()) {
    for (let card = 0; card < COLOSSUS_DAYS * 3; card++) {
      const day = Math.floor(card / 3);
      const plays = random() < MOCK_PLAY_SHARE;
      const first = start + day * COLOSSUS_DAY_S + Math.floor(random() * COLOSSUS_DAY_S);
      const second = start + (day + 1) * COLOSSUS_DAY_S + Math.floor(random() * COLOSSUS_DAY_S);
      if (!plays) continue;
      tries.push({ t: first, builder, card });
      if (day + 1 < COLOSSUS_DAYS) tries.push({ t: second, builder, card });
    }
  }
  return tries.sort((a, b) => a.t - b.t);
}

/** A week's site in memory: played up to `time`, the accounts' stored tiles `applied` so far among the builders' tries. */
interface Run {
  site: Colossus;
  tries: Try[];
  cursor: number;
  applied: string[];
  time: number;
  random: () => number;
}
const RUNS = new Map<number, Run>();

/** The builders' tries up to `until`: each lays their tile where the site hints, or keeps it. */
function advance(run: Run, until: number): void {
  while (run.cursor < run.tries.length && run.tries[run.cursor]!.t <= until) {
    const { t, builder, card } = run.tries[run.cursor++]!;
    if (run.site.completedAt !== null) continue;
    const held = run.site.hand(builder, colossusDayOf(t)).find((c) => c.card === card);
    const where = held && run.site.suggest(held.plan, run.random);
    if (where) run.site.build(builder, card, where.board, where.placement, t);
  }
  run.time = Math.max(run.time, until);
}

/**
 * The site of `week` as it stands at `now` (its end, for a week over): the run in memory moved on, or played again from the start
 * when the stored tiles are no longer those it applied (another ledger, a write put back) or when the clock went back.
 */
function runOf(stored: StoredColossus, week: number, now: number): Run {
  const log = stored.weeks[String(week)] ?? [];
  const entries = log.map((m) => JSON.stringify(m));
  let run = RUNS.get(week);
  const next = log[run?.applied.length ?? 0];
  const until = Math.min(now, colossusEndsAt(week) - 1);
  if (!run || until < run.time || run.applied.length > entries.length || run.applied.some((e, i) => e !== entries[i]) || (next && next.t < run.time)) {
    run = { site: new Colossus(week, MOCK_COLOSSUS_RINGS), tries: triesOf(week), cursor: 0, applied: [], time: 0, random: mulberry(Math.imul(week, 0x85ebca6b)) };
    for (const kept of RUNS.keys()) if (kept < week - 1) RUNS.delete(kept);
    RUNS.set(week, run);
  }
  for (let i = run.applied.length; i < log.length; i++) {
    const m = log[i]!;
    advance(run, m.t);
    run.site.build(m.a, m.c, m.b, { orientation: m.o, x: m.x, y: m.y }, m.t);
    run.applied.push(entries[i]!);
  }
  advance(run, until);
  return run;
}

type People = (address: string) => PublicProfile;

/** The Cobbles a place pays: the top 10's, to a builder who set a stone. */
const payOf = (place: number, builder: ColossusBuilder): number => (builder.stones > 0 ? colossusTopCobbles(place) : 0);

function rowsOf(site: Colossus, people: People, viewer: string | null): ColossusBuilderRow[] {
  return site.ranking().map((b, i) => ({ place: i + 1, profile: people(b.address), tiles: b.tiles, stones: b.stones, cobbles: payOf(i + 1, b), me: b.address === viewer }));
}

const claimsOf = (stored: StoredColossus, key: string | null, week: number) => (key === null ? undefined : stored.claims[key]?.[String(week)]);

function tiersOf(site: Colossus, claimed: readonly number[] | undefined): ColossusTierState[] {
  return COLOSSUS_TIERS.map((tier, i) => ({ share: tier.share, stones: site.stonesFor(tier.share), cobbles: tier.cobbles, reachedAt: site.tierAt[i]!, claimed: claimed?.includes(i) ?? false }));
}

/** The Cobbles of the tiers reached and not claimed, for a participant. */
const tiersDue = (site: Colossus, key: string, claimed: readonly number[] | undefined): number =>
  site.builder(key) ? COLOSSUS_TIERS.reduce((sum, tier, i) => sum + (site.tierAt[i] !== null && !claimed?.includes(i) ? tier.cobbles : 0), 0) : 0;

const nameOf = (people: People, address: string): string => people(address).name ?? "A builder";

/** A finished week as `viewer` lived it. */
function resultOf(stored: StoredColossus, people: People, week: number, viewer: string | null): ColossusResult {
  const { site } = runOf(stored, week, colossusEndsAt(week));
  const rows = rowsOf(site, people, viewer);
  const claims = claimsOf(stored, viewer, week);
  const mine = rows.find((r) => r.me);
  return {
    week,
    season: site.monument.season,
    monument: site.monument.name,
    stone: site.monument.stone,
    stones: site.stones,
    cells: site.cells,
    builders: rows.length,
    completedAt: site.completedAt,
    capstone: site.capstone === null ? null : nameOf(people, site.capstone),
    plaque: rows.slice(0, COLOSSUS_TOP),
    tiers: tiersOf(site, claims?.tiers),
    me: mine
      ? {
          place: mine.place,
          tiles: mine.tiles,
          stones: mine.stones,
          named: mine.tiles >= COLOSSUS_NAME_TILES,
          cobbles: COLOSSUS_TIERS.reduce((sum, tier, i) => sum + (site.tierAt[i] !== null ? tier.cobbles : 0), 0) + mine.cobbles,
          toClaim: tiersDue(site, viewer!, claims?.tiers) + (claims?.top ? 0 : mine.cobbles),
        }
      : null,
  };
}

/** `ColossusSource.state`: the week as `viewer` sees it. */
export function stateOf(stored: StoredColossus, people: People, now: number, viewer: string | null): ColossusState {
  const key = viewer === null ? null : addressKey(viewer);
  const week = colossusWeekOf(now);
  const day = colossusDayOf(now);
  const { site } = runOf(stored, week, now);
  const rows = rowsOf(site, people, key);
  const lots = colossusLots(MOCK_COLOSSUS_RINGS);
  const claims = claimsOf(stored, key, week);
  const mine = rows.find((r) => r.me) ?? null;
  const hand = key === null ? [] : site.hand(key, day);
  const hands = [...builderKeys().map((b) => site.hand(b, day)), hand];
  const hardHoles = site.boards
    .flatMap((board, index) =>
      index === 0 && !site.heartOpen
        ? []
        : board.hardHoles().map((h) => ({
            board: index,
            lot: index === 0 ? "Heart" : lots.find((l) => l.board === index)!.name,
            x: h.x,
            y: h.y,
            cards: h.cards,
            holders: hands.filter((cards) => cards.some((c) => h.plans.includes(c.plan))).length,
            mine: hand.some((c) => h.plans.includes(c.plan)),
          })),
    )
    .sort((a, b) => a.cards - b.cards || a.holders - b.holders || a.board - b.board)
    .slice(0, HARD_HOLES);
  const tenth = rows[COLOSSUS_TOP - 1];
  return {
    week,
    day,
    endsAt: colossusEndsAt(week),
    nextDayAt: colossusWeekStart(week) + (day + 1) * COLOSSUS_DAY_S,
    season: site.monument.season,
    monument: site.monument.name,
    stone: site.monument.stone,
    side: site.size.lots,
    cells: site.cells,
    stones: site.stones,
    builders: rows.length,
    heartOpen: site.heartOpen,
    completedAt: site.completedAt,
    capstone: site.capstone === null ? null : nameOf(people, site.capstone),
    tiers: tiersOf(site, claims?.tiers),
    lots: lots.map((l) => ({ ...l, cells: site.boards[l.board]!.cellCount, stones: site.boards[l.board]!.stones, holes: site.boards[l.board]!.holes })),
    hardHoles,
    top: [...rows.slice(0, COLOSSUS_TOP), ...(mine && mine.place > COLOSSUS_TOP ? [mine] : [])],
    me:
      key === null
        ? null
        : {
            hand,
            tiles: mine?.tiles ?? 0,
            stones: mine?.stones ?? 0,
            place: mine?.place ?? null,
            behind: mine ? (mine.place <= COLOSSUS_TOP || !tenth ? 0 : tenth.stones - mine.stones) : null,
            named: (mine?.tiles ?? 0) >= COLOSSUS_NAME_TILES,
            toClaim: tiersDue(site, key, claims?.tiers),
          },
    result: resultOf(stored, people, week - 1, key),
  };
}

/** `ColossusSource.builders`: every builder of the week by stones set. */
export function buildersOf(stored: StoredColossus, people: People, now: number, viewer: string | null): ColossusBuilderRow[] {
  return rowsOf(runOf(stored, colossusWeekOf(now), now).site, people, viewer === null ? null : addressKey(viewer));
}

const openOf = (site: Colossus, board: number): boolean => site.completedAt === null && (board !== 0 || site.heartOpen);

/** `ColossusSource.board`: a board of this week's site; null for a board the site does not have. */
export function boardOf(stored: StoredColossus, now: number, viewer: string | null, board: number): ColossusBoardState | null {
  const key = viewer === null ? null : addressKey(viewer);
  const week = colossusWeekOf(now);
  const { site } = runOf(stored, week, now);
  const target = site.boards[board];
  if (!target) return null;
  const sealed: { x: number; y: number }[] = [];
  for (let y = 0; y < target.size; y++) for (let x = 0; x < target.size; x++) if (target.isSealed(x, y)) sealed.push({ x, y });
  return {
    week,
    board,
    name: board === 0 ? "Heart" : colossusLots(MOCK_COLOSSUS_RINGS).find((l) => l.board === board)!.name,
    heart: board === 0,
    size: target.size,
    open: openOf(site, board),
    tiles: target.tiles().map((t) => ({ x: t.x, y: t.y, plan: t.plan, orientation: t.orientation, stone: t.stone, prebuilt: t.by === null, mine: t.by !== null && t.by === key })),
    sealed,
    holes: target.holes,
    stones: target.stones,
    hand: key === null ? [] : site.hand(key, colossusDayOf(now)),
  };
}

/** `ColossusSource.options`: where the viewer's tile `card` may go on `board`, with the stones each placement would set. */
export function optionsOf(stored: StoredColossus, now: number, viewer: string, board: number, card: number): ColossusOptions {
  const { site } = runOf(stored, colossusWeekOf(now), now);
  const target = site.boards[board];
  const held = site.hand(addressKey(viewer), colossusDayOf(now)).find((c) => c.card === card);
  if (!target || !held || !openOf(site, board)) return { placements: [], refused: [] };
  const placements: ColossusOptions["placements"] = [];
  const refused = new Map<string, { x: number; y: number }>();
  for (const { sides: _sides, ...p } of target.candidates(held.plan)) {
    if (target.refusal(held.plan, p) === null) placements.push({ ...p, stones: target.preview(held.plan, p) });
    else refused.set(`${p.x},${p.y}`, { x: p.x, y: p.y });
  }
  for (const p of placements) refused.delete(`${p.x},${p.y}`);
  return { placements, refused: [...refused.values()] };
}

/** `ColossusSource.place`: lays a tile of the account's hand by game-core's rules (their refusal is thrown), and stores it. */
export function place(stored: StoredColossus, player: string, tile: ColossusPlace, now: number): { week: number; placed: ColossusPlaced } {
  const key = addressKey(player);
  const week = colossusWeekOf(now);
  const run = runOf(stored, week, now);
  const move = run.site.build(key, tile.card, tile.board, { orientation: tile.orientation, x: tile.x, y: tile.y }, now);
  const entry: StoredColossusMove = { a: key, t: now, c: tile.card, b: tile.board, o: tile.orientation, x: tile.x, y: tile.y };
  (stored.weeks[String(week)] ??= []).push(entry);
  run.applied.push(JSON.stringify(entry));
  const ranking = run.site.ranking();
  const mine = run.site.builder(key)!;
  return {
    week,
    placed: {
      stones: move.stones,
      before: move.before,
      after: move.after,
      cells: run.site.cells,
      tiers: move.tiers.map((i) => COLOSSUS_TIERS[i]!.share),
      heartOpened: move.heartOpened,
      completed: move.completed,
      sealed: move.sealed.length,
      mine: { tiles: mine.tiles, stones: mine.stones, place: ranking.findIndex((b) => b.address === key) + 1, builders: ranking.length },
    },
  };
}

/**
 * `ColossusSource.claim`: the Cobbles the account can claim for `week`, recorded: this week's tiers reached (from the tier's time),
 * or last week's tiers and top 10. Refused for a week older than the last, for a player who laid no tile, and when nothing is left.
 */
export function claim(stored: StoredColossus, player: string, week: number, now: number): number {
  const key = addressKey(player);
  const current = colossusWeekOf(now);
  if (week !== current && week !== current - 1) throw new Error("Colossus: nothing to claim");
  const { site } = runOf(stored, week, now);
  const builder = site.builder(key);
  if (!builder) throw new Error("Colossus: not a participant");
  const claims = ((stored.claims[key] ??= {})[String(week)] ??= { tiers: [], top: false });
  let cobbles = tiersDue(site, key, claims.tiers);
  const tiers = COLOSSUS_TIERS.flatMap((_, i) => (site.tierAt[i] !== null ? [i] : []));
  const top = week < current && !claims.top ? payOf(site.ranking().findIndex((b) => b.address === key) + 1, builder) : 0;
  cobbles += top;
  if (cobbles === 0) throw new Error("Colossus: nothing to claim");
  claims.tiers = tiers;
  if (week < current) claims.top = true;
  return cobbles;
}
