import {
  MASTERPIECE_FLOOR,
  MASTERPIECE_WEEK_S,
  Masterpiece,
  compareMasterpiece,
  masterpieceBars,
  masterpieceCounted,
  masterpieceDayOf,
  masterpieceEndsAt,
  masterpieceKindOf,
  masterpiecePlaceAmong,
  masterpieceSeasonOf,
  masterpieceTierOf,
  masterpieceWeekOf,
  masterpieceWeekStart,
  masterpieceWorth,
  poseidon,
  type MasterpieceEntry,
  type MasterpieceKind,
  type MasterpieceResult as Ranked,
} from "@paved/game-core";
import { playerName } from "../../lib/player-names";
import { addressKey } from "../keys";
import { MASTERPIECE_TOP, type MasterpieceBoardRecord, type MasterpieceBoardState, type MasterpieceRanking, type MasterpieceRecord, type MasterpieceResult, type MasterpieceRow, type MasterpieceShown, type MasterpieceState } from "../masterpiece-source";
import { SEEDED_PLAYERS } from "./players";

// The mock's Masterpiece (the weekly individual event, game-core's `masterpiece.ts`), the whole event on the device: an account opens
// its board of the week, lays and discards the tiles waiting by game-core's rules (`Masterpiece`, its log played again at each read
// and write) and claims its tier's Cobbles the week after. The other builders are drawn: a few hundred a week, each with a masterpiece
// closed at a time of the week (a modest one first, a larger one later), so the ranking lives while the week runs. Pure functions on
// the stored state: `MockLedger` runs them under its lock, as `joust.ts`'s.

/** The salt of a board's random (`'MPBOARD'`): on chain, the VRF's at its spawn. */
const BOARD_SALT = 0x4d50424f415244n;
/** The finished weeks the Hall reads: two of each kind. */
const HALL_WEEKS = 8;

/** A board as stored: its week, its player's address key, its random, its log, and when its masterpiece was last made (the tie's order). */
export interface StoredMasterpieceBoard {
  week: number;
  player: string;
  seed: string;
  log: MasterpieceEntry[];
  at: number | null;
}

/** The mock's Masterpiece as stored: the accounts' boards by `week:player`, each account's claimed weeks. */
export interface StoredMasterpiece {
  boards: Record<string, StoredMasterpieceBoard>;
  claims: Record<string, number[]>;
}

export const freshMasterpiece = (): StoredMasterpiece => ({ boards: {}, claims: {} });

const boardKey = (week: number, player: string): string => `${week}:${addressKey(player)}`;

/** The player's board of `week`; undefined: never opened. */
export const boardOf = (stored: StoredMasterpiece, player: string, week: number): StoredMasterpieceBoard | undefined => stored.boards[boardKey(week, player)];

/** A stored board on the engine, its log played again. */
export const replayOf = (board: StoredMasterpieceBoard): Masterpiece => Masterpiece.replay(board.week, BigInt(board.seed), board.log);

export const recordOf = (board: StoredMasterpieceBoard): MasterpieceBoardRecord => ({ week: board.week, player: board.player, seed: board.seed, log: [...board.log], endsAt: masterpieceEndsAt(board.week) });

/** Opens the player's board of the week of `now`, created on the first visit. */
export function open(stored: StoredMasterpiece, player: string, now: number): { board: StoredMasterpieceBoard; created: boolean } {
  const week = masterpieceWeekOf(now);
  const key = boardKey(week, player);
  const created = !stored.boards[key];
  const board = (stored.boards[key] ??= { week, player: addressKey(player), seed: `0x${poseidon(BOARD_SALT, BigInt(player), BigInt(week)).toString(16)}`, log: [], at: null });
  return { board, created };
}

/**
 * One move of the player's board of `week`, by the engine's rules (its refusal thrown): refused once the week is over, and while no
 * tile waits (today's twelve and the days' before are played). A move that makes the masterpiece dates it.
 */
export function play(stored: StoredMasterpiece, player: string, week: number, move: MasterpieceEntry, now: number): { score: number; improved: boolean; size: number } {
  const board = boardOf(stored, player, week);
  if (!board) throw new Error("Masterpiece: board does not exist");
  if (now >= masterpieceEndsAt(week)) throw new Error("Masterpiece: the week is over");
  if (move.k !== "build" && move.k !== "discard") throw new Error("Masterpiece: invalid move");
  const game = replayOf(board);
  if (game.waiting(masterpieceDayOf(now)) === 0) throw new Error("Masterpiece: no tile waiting");
  const outcome = game.apply(move);
  board.log.push(move);
  if (outcome.improved) board.at = now;
  return { score: game.score, improved: outcome.improved, size: outcome.piece?.size ?? 0 };
}

/** A draw in [0, 1) from whole numbers: a cheap mix (the mock draws every builder again at each read, Poseidon would be slow). */
function draw(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4_294_967_296;
}

/** A drawn builder's name: the community's seeded players first, then names drawn from the builder's place. */
function nameOf(index: number): string {
  const seeded = SEEDED_PLAYERS[index];
  if (seeded) return seeded.name;
  let k = 0;
  return playerName(() => draw(7, index, k++));
}

/** A masterpiece of `size` as the engine would score it for `kind` (a wonder: its nine tiles, crowned by a city of the rest). */
function shownOf(kind: MasterpieceKind, size: number): MasterpieceShown {
  if (kind === "wonder") return { kind, size: 9 + Math.max(0, size - MASTERPIECE_FLOOR), points: 900 + (size > MASTERPIECE_FLOOR ? masterpieceWorth("city", size - MASTERPIECE_FLOOR) : 0) };
  return { kind, size, points: masterpieceWorth(kind, size, Math.max(1, Math.round(size / 4))) };
}

/** A drawn builder's masterpiece as it stands at a time: its builder's place in the draw, its size, its score, when it was closed. */
interface Drawn extends Ranked {
  index: number;
}

/**
 * The week's drawn builders as they stand at `now`: 360 to 600 of them, four in five with a masterpiece the percentiles count. Sizes
 * from 8 up, most between 10 and 25 and a thin tail to 48 (the proposal's spread: its median near 14, its top 1 % near 45); the
 * larger ones close later in the week, a first piece of under half the size before it. Up to two discards each.
 */
export function fieldAt(week: number, now: number): Drawn[] {
  const kind = masterpieceKindOf(week);
  const start = masterpieceWeekStart(week);
  const count = 360 + Math.floor(draw(1, week) * 240);
  const out: Drawn[] = [];
  for (let index = 0; index < count; index++) {
    if (draw(2, week, index) < 0.2) continue;
    const size = Math.min(48, MASTERPIECE_FLOOR + Math.floor(-8 * Math.log(1 - draw(3, week, index))));
    const at = start + Math.floor(MASTERPIECE_WEEK_S * Math.min(0.995, 0.1 + 0.5 * (size / 48) + 0.4 * draw(4, week, index)));
    const firstSize = Math.round(size * 0.45);
    const firstAt = start + Math.floor((at - start) * (0.2 + 0.5 * draw(5, week, index)));
    const cost = 50 * Math.floor(draw(6, week, index) * 3);
    const standing = now >= at ? { size, at } : firstSize >= MASTERPIECE_FLOOR && now >= firstAt ? { size: firstSize, at: firstAt } : null;
    if (!standing) continue;
    const shown = shownOf(kind, standing.size);
    out.push({ index, size: shown.size, score: Math.max(0, shown.points - cost), at: standing.at });
  }
  return out;
}

/** A board as the ranking reads it: its masterpiece, its score, whether it is counted and where it ranks among `field`. */
function standingOf(board: StoredMasterpieceBoard, field: readonly Drawn[], now: number) {
  const game = replayOf(board);
  const piece = game.piece();
  const counted = masterpieceCounted(piece);
  const ranked: Ranked = { score: game.score, size: piece?.size ?? 0, at: board.at ?? now };
  const builders = field.length + (counted ? 1 : 0);
  const place = counted ? masterpiecePlaceAmong(ranked, field) : null;
  return { game, piece: piece && { kind: piece.kind, size: piece.size, points: piece.points }, counted, ranked, builders, place, tier: masterpieceTierOf(place, builders) };
}

const rowOf = (entry: Drawn, place: number): MasterpieceRow => ({ place, name: nameOf(entry.index), size: entry.size, score: entry.score, me: false });

/** The best of `field` and the viewer's own (`mine`, when counted): the week's first line. */
function masterOf(field: readonly Drawn[], mine: { ranked: Ranked; name: string } | null): MasterpieceRow | null {
  const best = [...field].sort(compareMasterpiece)[0];
  if (mine && (!best || compareMasterpiece(mine.ranked, best) < 0)) return { place: 1, name: mine.name, size: mine.ranked.size, score: mine.ranked.score, me: true };
  return best ? rowOf(best, 1) : null;
}

function resultOf(stored: StoredMasterpiece, player: string, week: number, name: string): MasterpieceResult | null {
  const board = boardOf(stored, player, week);
  if (!board) return null;
  const end = masterpieceEndsAt(week);
  const field = fieldAt(week, end);
  const mine = standingOf(board, field, end);
  return {
    week,
    season: masterpieceSeasonOf(week),
    kind: masterpieceKindOf(week),
    piece: mine.piece,
    score: mine.game.score,
    discards: mine.game.discards,
    place: mine.place,
    builders: mine.builders,
    tier: mine.tier,
    master: masterOf(field, mine.counted ? { ranked: mine.ranked, name } : null),
    cobbles: mine.tier?.cobbles ?? 0,
    claimed: (stored.claims[addressKey(player)] ?? []).includes(week),
  };
}

function boardStateOf(board: StoredMasterpieceBoard, field: readonly Drawn[], now: number): MasterpieceBoardState {
  const day = masterpieceDayOf(now);
  const mine = standingOf(board, field, now);
  const game = mine.game;
  return {
    piece: mine.piece,
    score: game.score,
    discards: game.discards,
    counted: mine.counted,
    prospect: game.prospect(),
    played: game.played,
    laid: game.laid,
    waiting: game.waiting(day),
    toCome: game.toCome(day),
    days: game.days(),
    place: mine.place,
    tier: mine.tier,
  };
}

/** The week of `now` as `viewer` (named `name`) sees it. */
export function stateOf(stored: StoredMasterpiece, now: number, viewer: string | null, name: string): MasterpieceState {
  const week = masterpieceWeekOf(now);
  const field = fieldAt(week, now);
  const board = viewer === null ? undefined : boardOf(stored, viewer, week);
  const state = board ? boardStateOf(board, field, now) : null;
  return {
    week,
    season: masterpieceSeasonOf(week),
    kind: masterpieceKindOf(week),
    day: masterpieceDayOf(now),
    endsAt: masterpieceEndsAt(week),
    builders: field.length + (state?.counted ? 1 : 0),
    board: state,
    result: viewer === null ? null : resultOf(stored, viewer, week - 1, name),
  };
}

/** The Hall's records: each kind's best masterpiece of the last finished weeks, the viewer's own boards among the drawn builders'. */
function hallOf(stored: StoredMasterpiece, week: number, viewer: string | null, name: string): MasterpieceRecord[] {
  const records = new Map<MasterpieceKind, MasterpieceRecord>();
  for (let past = week - 1; past >= week - HALL_WEEKS; past--) {
    const end = masterpieceEndsAt(past);
    const field = fieldAt(past, end);
    const board = viewer === null ? undefined : boardOf(stored, viewer, past);
    const mine = board ? standingOf(board, field, end) : null;
    const master = masterOf(field, mine?.counted ? { ranked: mine.ranked, name } : null);
    if (!master) continue;
    const kind = masterpieceKindOf(past);
    const held = records.get(kind);
    if (!held || master.score > held.score) records.set(kind, { kind, season: masterpieceSeasonOf(past), week: past, name: master.name, size: master.size, score: master.score, me: master.me });
  }
  return (["city", "road", "wonder", "forest"] as const).flatMap((kind) => records.get(kind) ?? []);
}

/** The live ranking of the week of `now`: its first places, the viewer's line, the bars so far, the Hall's records. */
export function rankingOf(stored: StoredMasterpiece, now: number, viewer: string | null, name: string): MasterpieceRanking {
  const week = masterpieceWeekOf(now);
  const field = fieldAt(week, now);
  const board = viewer === null ? undefined : boardOf(stored, viewer, week);
  const mine = board ? standingOf(board, field, now) : null;
  const rows: (Ranked & { name: string; me: boolean })[] = field.map((f) => ({ ...f, name: "", me: false }));
  if (mine?.counted) rows.push({ ...mine.ranked, name, me: true });
  rows.sort(compareMasterpiece);
  const line = (r: (typeof rows)[number], i: number): MasterpieceRow => ({ place: i + 1, name: r.me ? r.name : nameOf((r as unknown as Drawn).index), size: r.size, score: r.score, me: r.me });
  const own = rows.findIndex((r) => r.me);
  return {
    week,
    kind: masterpieceKindOf(week),
    builders: rows.length,
    top: rows.slice(0, MASTERPIECE_TOP).map(line),
    me: own >= MASTERPIECE_TOP ? line(rows[own]!, own) : null,
    bars: masterpieceBars(rows.map((r) => r.score)),
    hall: hallOf(stored, week, viewer, name),
  };
}

/** The Cobbles of the player's tier of a finished `week`, marked claimed. */
export function claim(stored: StoredMasterpiece, player: string, week: number, now: number): number {
  if (week >= masterpieceWeekOf(now)) throw new Error("Masterpiece: the week is not over");
  const result = resultOf(stored, player, week, "");
  if (!result) throw new Error("Masterpiece: board does not exist");
  if (!result.tier) throw new Error("Masterpiece: no counted masterpiece");
  if (result.claimed) throw new Error("Masterpiece: already claimed");
  (stored.claims[addressKey(player)] ??= []).push(week);
  return result.cobbles;
}
