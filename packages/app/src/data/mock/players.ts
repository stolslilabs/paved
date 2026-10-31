import { poseidon } from "@paved/game-core";

// The mock's seeded players (#927, open point 2's default): twenty players of other devices, so that the leaderboard, the
// player pages and the PvP's league have rivals. Each has a name drawn by #926's generator (`playerName` on
// `seededRandom(index)`, checked by the tests: the word lists stay out of this chunk), the avatar the mock gives every player it
// did not see (`generatedLook`), a level, crowns and a skill. Their Challenge days are drawn from Poseidon on their index and
// the day (`seededDay`), the same on every device and at every load; they play no day before `SEEDED_FROM_DAY`.

/** The kind of the seeded players' draws ('PLAYER'). */
const PLAYER_DRAW = 0x504c41594552n;
/** A day, in seconds. */
const DAY_S = 86_400;

/**
 * The first day the seeded players play: the mock's season clock's start (the September 2026 equinox, day 20,718,
 * `MOCK_SEASON_STARTS[0]`).
 */
export const SEEDED_FROM_DAY = 20_718;

/** A seeded player: its name, level, crowns, and the score its best game of a day is drawn around (`skill`). */
export interface SeededPlayer {
  readonly address: string;
  /** Its position among them, 1 to 20: the seed of its draws. */
  readonly index: number;
  readonly name: string;
  readonly level: number;
  readonly crowns: number;
  readonly skill: number;
}

/** The names, as `playerName(seededRandom(index))` draws them; the levels, crowns and skills spread over the first leagues. */
const SEEDS: readonly { name: string; level: number; crowns: number; skill: number }[] = [
  { name: "ChillyNewt46", level: 1, crowns: 30, skill: 1_900 },
  { name: "BreezyThatcher66", level: 2, crowns: 85, skill: 2_300 },
  { name: "IcyFern60", level: 3, crowns: 140, skill: 2_100 },
  { name: "FerventCrown28", level: 3, crowns: 210, skill: 2_800 },
  { name: "TawnyMoth11", level: 4, crowns: 260, skill: 2_500 },
  { name: "HeroicVane10", level: 5, crowns: 330, skill: 3_100 },
  { name: "DistantPioneer36", level: 6, crowns: 395, skill: 2_900 },
  { name: "WinterTrack79", level: 7, crowns: 420, skill: 3_400 },
  { name: "GladWell16", level: 8, crowns: 480, skill: 3_300 },
  { name: "GustyPike69", level: 9, crowns: 530, skill: 3_700 },
  { name: "BubblyGardener34", level: 10, crowns: 590, skill: 3_600 },
  { name: "ThriftyMilestone48", level: 11, crowns: 640, skill: 4_000 },
  { name: "MightyTinker46", level: 12, crowns: 720, skill: 3_900 },
  { name: "FriendlyCarver50", level: 13, crowns: 810, skill: 4_300 },
  { name: "CraftyChapel37", level: 14, crowns: 880, skill: 4_100 },
  { name: "TopazBadger06", level: 15, crowns: 960, skill: 4_600 },
  { name: "JauntyQuarry45", level: 16, crowns: 1_050, skill: 4_400 },
  { name: "HeartyQuay24", level: 17, crowns: 1_130, skill: 4_900 },
  { name: "StonyThistle23", level: 18, crowns: 1_240, skill: 5_100 },
  { name: "ZealousBramble13", level: 20, crowns: 1_380, skill: 5_400 },
];

/** A number in [0, 1) for each call, from Poseidon on `seed`: the k-th call's is `poseidon('PLAYER', seed, k)`. */
export function seededRandom(seed: bigint): () => number {
  let k = 0n;
  return () => Number(poseidon(PLAYER_DRAW, seed, k++) % 1_000_000n) / 1_000_000;
}

/** The k-th draw of a player's day, in [0, 1). */
const drawOf = (index: number, day: number, k: number): number => Number(poseidon(PLAYER_DRAW, BigInt(index), BigInt(day) * 16n + BigInt(k)) % 1_000_000n) / 1_000_000;

/** The seeded players' addresses: above 255 (never an NPC's) and apart from the PvP's rivals (`pvp.ts`, `v2.ts`). */
export const SEEDED_PLAYERS: readonly SeededPlayer[] = SEEDS.map((s, i) => ({ address: `0x${(0x7e3a0000 + i + 1).toString(16)}`, index: i + 1, ...s }));

/** A seeded player by address, or null. */
export function seededPlayer(address: string | bigint): SeededPlayer | null {
  let id: bigint;
  try {
    id = BigInt(address);
  } catch {
    return null;
  }
  return SEEDED_PLAYERS.find((p) => BigInt(p.address) === id) ?? null;
}

/** One Challenge game of a seeded player: finished on the day it started, as a ranked game is. */
export interface SeededGame {
  /** Unique among every player's: `10^9 + index * 10^6 + (day - SEEDED_FROM_DAY) * 4 + k`, never a game of the device's. */
  gameId: number;
  startTime: number;
  endTime: number;
  score: number;
}

/** The first id of the seeded games: the device's games count up from 1. */
export const SEEDED_GAME_IDS = 1_000_000_000;

/**
 * A seeded player's games of `day` (seconds since the epoch / 86,400), in play order: none on four days in ten, else one to
 * three games, each scored around its skill (0.6 to 1.25 of it), each over within the day. Only those over by `now` count: a
 * day in progress shows the games played so far.
 */
export function seededDay(player: SeededPlayer, day: number, now: number): SeededGame[] {
  if (day < SEEDED_FROM_DAY) return [];
  // A day over is the same at every read: drawn once.
  const past = (day + 1) * DAY_S <= now;
  const key = `${player.index}:${day}`;
  const kept = past ? days.get(key) : undefined;
  if (kept) return [...kept];
  const games = drawDay(player, day, now);
  if (past) days.set(key, games);
  return [...games];
}

/** The past days drawn, by player index and day. */
const days = new Map<string, SeededGame[]>();

function drawDay(player: SeededPlayer, day: number, now: number): SeededGame[] {
  if (drawOf(player.index, day, 0) < 0.4) return [];
  const count = 1 + Math.floor(drawOf(player.index, day, 1) * 3);
  const games: SeededGame[] = [];
  for (let k = 0; k < count; k++) {
    // Between 06:00 and 23:00 UTC, in order; a game lasts 8 to 20 minutes.
    const startTime = day * DAY_S + 6 * 3_600 + Math.floor(((k + drawOf(player.index, day, 2 + 2 * k)) / count) * 17 * 3_600);
    const endTime = startTime + 480 + Math.floor(drawOf(player.index, day, 3 + 2 * k) * 720);
    if (endTime > now) break;
    const score = Math.round((player.skill * (0.6 + 0.65 * drawOf(player.index, day, 9 + k))) / 10) * 10;
    games.push({ gameId: SEEDED_GAME_IDS + player.index * 1_000_000 + (day - SEEDED_FROM_DAY) * 4 + k, startTime, endTime, score });
  }
  return games;
}

/** The seeded game of `gameId` with its player and day, or null for an id no seeded player has (or will have by `now`). */
export function seededGame(gameId: number, now: number): { player: SeededPlayer; day: number; game: SeededGame } | null {
  if (!Number.isSafeInteger(gameId) || gameId < SEEDED_GAME_IDS) return null;
  const rest = gameId - SEEDED_GAME_IDS;
  const player = SEEDED_PLAYERS[Math.floor(rest / 1_000_000) - 1];
  if (!player) return null;
  const day = SEEDED_FROM_DAY + Math.floor((rest % 1_000_000) / 4);
  const game = seededDay(player, day, now).find((g) => g.gameId === gameId);
  return game ? { player, day, game } : null;
}
