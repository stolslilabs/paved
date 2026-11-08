import { SeededChallenge, poseidon, puzzleDayEnd, puzzleDayOf, rankPuzzle, type SeededMove } from "@paved/game-core";
import { addressKey } from "../keys";
import type { PuzzleGameRecord } from "../puzzle-source";
import { SEEDED_PLAYERS } from "./players";

// The mock's Puzzle (Play's Limited mode, `docs/architecture/puzzle-mode.md`): the day's seed, the games of the device's accounts
// played by game-core's rules (`SeededChallenge` with the day's deck, a seeded random in place of the VRF's), the seeded players'
// results of each day, the day's ranking, and the prizes claimed. Pure functions on the stored state: `MockLedger` runs them under
// its lock and stores the result, as `challenge.ts` the Challenge's.

/** The salts of the mock's draws: a day's seed (`'PUZZLE'`), a game's random (`'PZGAME'`), a seeded player's day (`'PZPLAY'`). */
const DAY_SALT = 0x50555a5a4c45n;
const GAME_SALT = 0x505a47414d45n;
const PLAY_SALT = 0x505a504c4159n;

/** One Puzzle game as stored: its player's address key, its random as hex, its moves, its score and its end (0 while open). */
export interface StoredPuzzleGame {
  id: number;
  day: number;
  player: string;
  seed: string;
  moves: SeededMove[];
  score: number;
  over: boolean;
  start: number;
  end: number;
}

/** The mock's Puzzle as stored: its games by id, the next id, each account's claimed days and its first visit's day. */
export interface StoredPuzzle {
  nextId: number;
  games: Record<string, StoredPuzzleGame>;
  /** The days each account claimed, by address key. */
  claims: Record<string, number[]>;
  /** The day of each account's first visit (`visit`): the mock's welcome prize is the day before. */
  visits: Record<string, number>;
}

export const freshPuzzle = (): StoredPuzzle => ({ nextId: 1, games: {}, claims: {}, visits: {} });

/**
 * A day's seed on the mock: Poseidon on the day. On chain it is the VRF's, drawn by the day's first game (the spec's "the day's
 * seed"); the mock has it from the day's start, as if a seeded player had opened the day.
 */
export const mockDaySeed = (day: number): bigint => poseidon(DAY_SALT, BigInt(day));

const hex = (value: bigint): string => `0x${value.toString(16)}`;

/** One player's result of a day: their address key, their best score and when it was set. */
export interface DayResult {
  address: string;
  score: number;
  at: number;
}

/** The k-th draw of a seeded player's Puzzle day, in [0, 1). */
const draw = (index: number, day: number, k: number): number => Number(poseidon(PLAY_SALT, BigInt(index), BigInt(day) * 8n + BigInt(k)) % 1_000_000n) / 1_000_000;

/**
 * The seeded players' results of `day` set by `now`: about three in four play each day, at a time of the day drawn for them, their
 * best around a third of their skill (a Challenge game's score, `players.ts`), to the ten. A result set after `now` is not there yet,
 * so the day's leaderboard fills as the day goes.
 */
export function seededResults(day: number, now: number): DayResult[] {
  const start = day * 86_400;
  return SEEDED_PLAYERS.flatMap((p) => {
    if (draw(p.index, day, 0) >= 0.75) return [];
    const at = start + Math.floor(draw(p.index, day, 1) * 86_400);
    if (at > now) return [];
    const score = Math.round((p.skill * (0.35 + 0.3 * draw(p.index, day, 2))) / 10) * 10;
    return [{ address: addressKey(p.address), score, at }];
  });
}

/** The ranked games of `day` (finished before its end), each account's best: the earliest of its best scores. */
function accountResults(puzzle: StoredPuzzle, day: number): DayResult[] {
  const best = new Map<string, DayResult>();
  for (const g of Object.values(puzzle.games)) {
    if (g.day !== day || !g.over || g.end >= puzzleDayEnd(day)) continue;
    const now = best.get(g.player);
    if (!now || g.score > now.score || (g.score === now.score && g.end < now.at)) best.set(g.player, { address: g.player, score: g.score, at: g.end });
  }
  return [...best.values()];
}

/**
 * The mock's welcome prize (as its starting rewards, `MOCK_STARTING_REWARDS`): an account visiting the Puzzle or the mailbox for the
 * first time finds the day before its visit won, ten points above that day's best seeded score, so the mailbox's gift can be tried at
 * once. Never on chain.
 */
function welcomeResults(puzzle: StoredPuzzle, day: number): DayResult[] {
  return Object.entries(puzzle.visits).flatMap(([address, visited]) => {
    if (visited - 1 !== day) return [];
    const top = Math.max(0, ...seededResults(day, puzzleDayEnd(day)).map((r) => r.score));
    return [{ address, score: top + 10, at: day * 86_400 + 43_200 }];
  });
}

/** Every result of `day` set by `now`: the seeded players', the welcome prizes and the accounts' (an account's best of them all). */
export function dayResults(puzzle: StoredPuzzle, day: number, now: number): DayResult[] {
  const best = new Map<string, DayResult>();
  for (const r of [...seededResults(day, now), ...welcomeResults(puzzle, day), ...accountResults(puzzle, day)]) {
    if (r.at > now) continue;
    const held = best.get(r.address);
    if (!held || r.score > held.score || (r.score === held.score && r.at < held.at)) best.set(r.address, r);
  }
  return [...best.values()];
}

/** `day`'s ranking at `now`, the best first (`rankPuzzle`). */
export const dayRanking = (puzzle: StoredPuzzle, day: number, now: number) => rankPuzzle(dayResults(puzzle, day, now));

/** A stored game as the source answers it, its player's address and its day's seed with it. */
export function recordOf(game: StoredPuzzleGame): PuzzleGameRecord {
  return { ...game, moves: game.moves.map((m) => ({ ...m })), deckSeed: hex(mockDaySeed(game.day)) };
}

/** The game's engine, its moves played again. */
export const replayOf = (game: StoredPuzzleGame): SeededChallenge => SeededChallenge.replay(BigInt(game.seed), BigInt(game.player), game.moves, mockDaySeed(game.day));

/** The account's game of today still open (the newest), or null. */
export function openGameOf(puzzle: StoredPuzzle, player: string, now: number): StoredPuzzleGame | null {
  const today = puzzleDayOf(now);
  const open = Object.values(puzzle.games).filter((g) => g.player === addressKey(player) && g.day === today && !g.over);
  return open.sort((a, b) => b.id - a.id)[0] ?? null;
}

/** A new game of today for `player`: its random from its id, as the VRF's spawn random would be. The caller stores it. */
export function newGame(puzzle: StoredPuzzle, player: string, now: number): StoredPuzzleGame {
  const id = puzzle.nextId;
  const key = addressKey(player);
  const game: StoredPuzzleGame = { id, day: puzzleDayOf(now), player: key, seed: hex(poseidon(GAME_SALT, BigInt(key), BigInt(id))), moves: [], score: 0, over: false, start: Math.floor(now), end: 0 };
  puzzle.nextId = id + 1;
  puzzle.games[id] = game;
  return game;
}

/** `move` played on `game` (the engine's refusal thrown, nothing changed), its score and its end kept. */
export function playMove(game: StoredPuzzleGame, move: SeededMove, now: number): void {
  const engine = replayOf(game);
  engine.play(move);
  game.moves.push({ ...move });
  game.score = engine.score;
  if (engine.over) {
    game.over = true;
    game.end = Math.floor(now);
  }
}
