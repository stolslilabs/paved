import {
  EXPEDITION_LEVEL,
  EXPEDITION_MAPS,
  Expedition,
  expeditionDayOf,
  expeditionEndsAt,
  expeditionNextTier,
  expeditionSeasonOf,
  expeditionTierOf,
  expeditionWeekOf,
  poseidon,
  type ExpeditionEntry,
  type ExpeditionObjectiveId,
} from "@paved/game-core";
import { addressKey } from "../keys";
import type { ExpeditionBoardRecord, ExpeditionBoardState, ExpeditionPlay, ExpeditionResult, ExpeditionState } from "../expedition-source";

// The mock's Expedition (the weekly individual event, game-core's `expedition.ts`), the whole event on the device: an account opens
// its board of the week, draws its rations, lays and discards by game-core's rules (`Expedition`, its log played again at each read
// and write) and claims its tier's Cobbles the week after. No ranking, so no other explorer plays: the shares of a finished week's
// result are drawn from the week. Pure functions on the stored state: `MockLedger` runs them under its lock, as `joust.ts`'s.

/** The salt of a board's random (`'EXBOARD'`): on chain, the VRF's at its spawn. */
const BOARD_SALT = 0x4558424f415244n;

/** A board as stored: its week, its player's address key, its random and its log. */
export interface StoredExpeditionBoard {
  week: number;
  player: string;
  seed: string;
  log: ExpeditionEntry[];
}

/** The mock's Expedition as stored: the accounts' boards by `week:player`, each account's claimed weeks. */
export interface StoredExpedition {
  boards: Record<string, StoredExpeditionBoard>;
  claims: Record<string, number[]>;
}

export const freshExpedition = (): StoredExpedition => ({ boards: {}, claims: {} });

const boardKey = (week: number, player: string): string => `${week}:${addressKey(player)}`;

/** The player's board of `week`; undefined: never opened. */
export const boardOf = (stored: StoredExpedition, player: string, week: number): StoredExpeditionBoard | undefined => stored.boards[boardKey(week, player)];

/** A stored board on the engine, its log played again. */
export const replayOf = (board: StoredExpeditionBoard): Expedition => Expedition.replay(board.week, BigInt(board.seed), board.log);

export const recordOf = (board: StoredExpeditionBoard): ExpeditionBoardRecord => ({ ...board, log: [...board.log], endsAt: expeditionEndsAt(board.week) });

/** Opens the player's board of the week of `now` (created on the first visit) and draws the rations due today. */
export function open(stored: StoredExpedition, player: string, now: number): StoredExpeditionBoard {
  const week = expeditionWeekOf(now);
  const key = boardKey(week, player);
  const board = (stored.boards[key] ??= { week, player: addressKey(player), seed: `0x${poseidon(BOARD_SALT, BigInt(player), BigInt(week)).toString(16)}`, log: [] });
  const day = expeditionDayOf(now);
  if (replayOf(board).lastDay < day) board.log.push({ k: "draw", day });
  return board;
}

/** One move of the player's board of `week`, by the engine's rules (its refusal thrown); refused once the week is over. */
export function play(stored: StoredExpedition, player: string, week: number, move: ExpeditionPlay, now: number): { score: number; done: ExpeditionObjectiveId[] } {
  const board = boardOf(stored, player, week);
  if (!board) throw new Error("Expedition: board does not exist");
  if (now >= expeditionEndsAt(week)) throw new Error("Expedition: the week is over");
  if (move.k !== "build" && move.k !== "discard") throw new Error("Expedition: invalid move");
  const game = replayOf(board);
  const outcome = game.apply(move);
  board.log.push(move);
  return { score: game.score, done: outcome?.objectives.map((o) => o.id) ?? [] };
}

/** A draw in [0, 1) from whole numbers: a cheap mix, for the shares of a finished week. */
function draw(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/** The share of a week's explorers who did each landmark, the easy one first: drawn around the proposal's figures (78 % to 9 %). */
const SHARES: Record<ExpeditionObjectiveId, [number, number]> = { crossroads: [0.7, 0.16], ruin: [0.36, 0.14], villages: [0.2, 0.12], landmark: [0.06, 0.08] };

function resultOf(stored: StoredExpedition, player: string, week: number): ExpeditionResult | null {
  const board = boardOf(stored, player, week);
  if (!board) return null;
  const game = replayOf(board);
  const season = expeditionSeasonOf(week);
  const tier = expeditionTierOf(game.score);
  return {
    week,
    season,
    map: EXPEDITION_MAPS[season].name,
    score: game.score,
    boardScore: game.boardScore,
    bonus: game.bonus,
    tier,
    landmarks: game.objectives().map((o, i) => ({ id: o.id, title: o.title, done: o.done, share: Math.round((SHARES[o.id][0] + draw(week, i) * SHARES[o.id][1]) * 100) / 100 })),
    explorers: 3_000 + Math.floor(draw(week, 99) * 1_500),
    cobbles: tier?.cobbles ?? 0,
    claimed: (stored.claims[addressKey(player)] ?? []).includes(week),
  };
}

function boardStateOf(board: StoredExpeditionBoard, day: number): ExpeditionBoardState {
  const game = replayOf(board);
  return {
    score: game.score,
    boardScore: game.boardScore,
    bonus: game.bonus,
    hand: game.hand.length,
    laid: game.laid,
    toCome: game.toCome,
    due: game.due(day),
    objectives: game.objectives(),
    days: game.days.map((d) => ({ ...d })),
    tier: expeditionTierOf(game.score),
    next: expeditionNextTier(game.score),
  };
}

/** The week of `now` as `viewer` (their level `level`) sees it. */
export function stateOf(stored: StoredExpedition, now: number, viewer: string | null, level: number | null): ExpeditionState {
  const week = expeditionWeekOf(now);
  const season = expeditionSeasonOf(week);
  const day = expeditionDayOf(now);
  const board = viewer === null ? undefined : boardOf(stored, viewer, week);
  return {
    week,
    season,
    map: EXPEDITION_MAPS[season].name,
    day,
    endsAt: expeditionEndsAt(week),
    board: board ? boardStateOf(board, day) : null,
    level,
    result: viewer === null ? null : resultOf(stored, viewer, week - 1),
  };
}

/** The Cobbles of the player's tier of a finished `week`, marked claimed; refused under `EXPEDITION_LEVEL`. */
export function claim(stored: StoredExpedition, player: string, week: number, now: number, level: number): number {
  if (week >= expeditionWeekOf(now)) throw new Error("Expedition: the week is not over");
  const result = resultOf(stored, player, week);
  if (!result) throw new Error("Expedition: board does not exist");
  if (!result.tier) throw new Error("Expedition: no tier reached");
  if (result.claimed) throw new Error("Expedition: already claimed");
  if (level < EXPEDITION_LEVEL) throw new Error(`Expedition: level ${EXPEDITION_LEVEL} needed`);
  (stored.claims[addressKey(player)] ??= []).push(week);
  return result.cobbles;
}
