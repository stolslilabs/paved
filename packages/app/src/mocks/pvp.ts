import { CENTER } from "@paved/game-core";
import type { CrownStakes, PvpPlayer } from "../lib/pvp-rules";
import { NEXT_PRICE, crownsFor, stakesOf, starsFor } from "../lib/pvp-rules";
import type { PvpAttackSceneProps } from "../components/scenes/pvp-attack-scene";
import type { DefenceEntry, PvpDefenceSceneProps } from "../components/scenes/pvp-defence-scene";
import type { PvpLeagueSceneProps } from "../components/scenes/pvp-league-scene";
import type { PvpResultSceneProps } from "../components/scenes/pvp-result-scene";
import type { PvpScoutSceneProps } from "../components/scenes/pvp-scout-scene";
import type { PvpSearchSceneProps } from "../components/scenes/pvp-search-scene";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER, PLAYER_ID } from "./players";
import { buildVillage, playAttack, type AttackStep } from "./pvp-attack";
import { REWARD, VILLAGE_GROWING } from "./village";

/**
 * The PvP flow's fakes (#647), nothing wired: the players, the villages and the attacks (played on the engine,
 * `pvp-attack.ts`), the crowns at stake, the defence log, the league. Shared with the village screen (#646) through
 * `PvpVillage`: its own fakes draw a village with `VillageBoard`, these with the game's board.
 */

/** The attacker: Silver II, 28 crowns short of Silver I (two stars keep them in Silver II, three take them up). */
export const ME: PvpPlayer = { name: PLAYER.name, address: PLAYER_ID, level: 6, crowns: 1_172 };

/** The defender drawn by the search. */
export const RIVAL: PvpPlayer = { name: "Rook of Ashford", address: "0x04b7e2a19c3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e1a", level: 7, crowns: 1_212 };

/** Other players, the attackers of the defence log. */
const ATTACKERS: PvpPlayer[] = [
  { name: "millstone_mara", address: "0x01c2", level: 5, crowns: 1_150 },
  { name: "Vael", address: "0x02d3", level: 8, crowns: 1_260 },
  { name: null, address: "0x0618c9d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8", level: 4, crowns: 1_102 },
  { name: "harbourwright", address: "0x03e4", level: 6, crowns: 1_199 },
  { name: "Old Tom Cobble", address: "0x04f5", level: 9, crowns: 1_301 },
];

/** The crowns at stake against the rival, 40 crowns above: the contracts' offer and cost at that gap (#639: 30 and 20). */
export const STAKES: CrownStakes = stakesOf(30, 20);

/** The rival's village: 38 tiles on 38 cells, 5,831 points. */
export const RIVAL_VILLAGE = buildVillage(23);
/** The player's own village, the defence log's: 6,124 points. */
export const MY_VILLAGE = buildVillage(42);

/** The attack played in the stories: 90 % of the village, two stars. */
export const ATTACK_STEPS = playAttack(RIVAL_VILLAGE, 3);

/**
 * The final scores of the other attacks, as the engine plays them (`playAttack(village, seed)`: `__tests__/pvp.test.tsx`
 * checks them), so the result and the log do not replay ten attacks at every load.
 */
export const ATTACK_SCORES = {
  rival: { 2: 4_138, 3: 5_220, 5: 3_916, 10: 6_757 },
  mine: { 1: 4_553, 2: 1_768, 3: 6_143, 8: 5_558, 10: 6_384 },
} as const;

/** The defence log's replay: the attack of seed 3 on the player's village (100 %, two stars). */
export const REPLAY_STEPS = playAttack(MY_VILLAGE, 3);

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

// Search

export const PVP_SEARCH = {
  searching: { state: "searching", player: ME },
  found: { state: "found", player: ME, opponent: RIVAL },
  none: { state: "none", player: ME },
  error: { state: "error", player: ME, error: "The matchmaker did not answer. Check your connection and try again.", errorDetail: { code: "MatchmakerError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 30) } },
} satisfies Record<string, Data<PvpSearchSceneProps>>;

// Scout

const scout = { defender: RIVAL, village: RIVAL_VILLAGE, stakes: STAKES, next: { price: NEXT_PRICE, balance: 640 }, now: MOCK_NOW };

export const PVP_SCOUT = {
  ready: scout,
  /** The attacker's village is shielded: attacking drops it. */
  shielded: { ...scout, shieldEndsAt: MOCK_NOW + 5 * HOUR + 12 * 60 },
  /** Not enough Cobbles for another village. */
  short: { ...scout, next: { price: NEXT_PRICE, balance: 0 } },
  nextPending: { ...scout, pending: "next" },
  attacking: { ...scout, pending: "attacking" },
  error: { ...scout, error: "The attack could not open: the village was attacked a moment ago and is now shielded.", errorDetail: { code: "Arena: village shielded", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 31) } },
} satisfies Record<string, Data<PvpScoutSceneProps>>;

// Attack

/** The deck an attack on the rival draws from: the village's tiles but the starter (`playAttack`), as chain plan ids. */
const RIVAL_DECK = RIVAL_VILLAGE.tiles.filter((t) => t.x !== CENTER || t.y !== CENTER).map((t) => t.plan);

/**
 * An attack scene at step `i` of `steps`: the board, the score, the hand and its legal cells in the territory, and the stack's
 * next two tiles. The fakes know their shuffle; how far a real attack knows ahead is the contracts' (#643).
 */
export function attackAt(steps: readonly AttackStep[], i: number): Data<PvpAttackSceneProps> {
  const at = Math.min(i, steps.length - 1);
  const step = steps[at]!;
  const coming = steps.slice(at + 1, at + 3).flatMap((s) => (s.hand ? [{ plan: s.hand.plan }] : []));
  return {
    defender: RIVAL,
    target: RIVAL_VILLAGE.score,
    territory: RIVAL_VILLAGE.cells,
    tiles: step.tiles,
    score: step.score,
    delta: step.delta,
    lastScored: step.lastScored,
    remaining: step.remaining,
    hand: { tile: step.hand, state: step.hand ? "placing" : "empty", coming, fitsNowhere: step.hand !== null && step.slots.length === 0 },
    slots: step.slots,
    pilePlans: RIVAL_DECK,
  };
}

/** The tile in hand at step `i` placed where the attack puts it next (its rotation fits there): the bubble on it. */
function placedAt(steps: readonly AttackStep[], i: number): Data<PvpAttackSceneProps> {
  const base = attackAt(steps, i);
  const next = steps[i + 1]!;
  const tile = next.placed!;
  return {
    ...base,
    hand: { ...base.hand, tile: { plan: tile.plan, orientation: tile.orientation }, slotChosen: true, preview: next.delta },
    ghost: { x: tile.x, y: tile.y, plan: tile.plan, orientation: tile.orientation, placed: true, fits: true },
    bubble: { cell: { x: tile.x, y: tile.y }, rotations: 1, onRotate: () => {}, onClose: () => {}, onDiscard: () => {}, onConfirm: () => {}, canConfirm: true },
  };
}

const firstIndex = (test: (s: AttackStep) => boolean) => ATTACK_STEPS.findIndex(test);
/** The first step past the first star's mark. */
const ONE_STAR = firstIndex((s) => starsFor(s.score, RIVAL_VILLAGE.score) >= 1);
/** The first step whose move closed two structures or more, past the halfway mark. */
const CLOSING = ATTACK_STEPS.findIndex((s, i) => i > 12 && s.lastScored.length >= 1 && (s.delta ?? 0) > 0);
/** A tile no cell of the territory takes. */
const NOWHERE = firstIndex((s) => s.hand !== null && s.slots.length === 0);
const MIDWAY = 18;

export const PVP_ATTACK = {
  /** The first tile: the starter alone on the defender's territory. */
  start: attackAt(ATTACK_STEPS, 0),
  midway: attackAt(ATTACK_STEPS, MIDWAY),
  /** A cell chosen: the bubble, the points over the score. */
  placed: placedAt(ATTACK_STEPS, MIDWAY),
  closing: attackAt(ATTACK_STEPS, CLOSING),
  oneStar: attackAt(ATTACK_STEPS, ONE_STAR),
  /** No cell of the territory takes the tile: the stack's Discard. */
  fitsNowhere: attackAt(ATTACK_STEPS, NOWHERE),
  lastTile: attackAt(ATTACK_STEPS, ATTACK_STEPS.length - 2),
  pending: { ...attackAt(ATTACK_STEPS, MIDWAY), hand: { tile: null, state: "pending" } },
  refused: { ...attackAt(ATTACK_STEPS, MIDWAY), hand: { ...attackAt(ATTACK_STEPS, MIDWAY).hand, state: "refused", error: "The move was refused: the cell is outside the territory." } },
} satisfies Record<string, Data<PvpAttackSceneProps>>;

/** A replay of `REPLAY_STEPS` at move `i`, the player's village defended. */
export function replayAt(i: number, playing = false): Data<PvpAttackSceneProps> {
  const step = REPLAY_STEPS[Math.min(i, REPLAY_STEPS.length - 1)]!;
  return {
    defender: ME,
    target: MY_VILLAGE.score,
    territory: MY_VILLAGE.cells,
    tiles: step.tiles,
    score: step.score,
    delta: step.delta,
    lastScored: step.lastScored,
    remaining: step.remaining,
    hand: { tile: null, state: "empty" },
    replay: { attacker: ATTACKERS[1]!, move: Math.min(i, REPLAY_STEPS.length - 1), total: REPLAY_STEPS.length - 1, playing },
  };
}

export const PVP_REPLAY = {
  start: replayAt(0),
  paused: replayAt(20),
  playing: replayAt(20, true),
  end: replayAt(REPLAY_STEPS.length),
} satisfies Record<string, Data<PvpAttackSceneProps>>;

// Result

function result(score: number, extra: Partial<Data<PvpResultSceneProps>> = {}): Data<PvpResultSceneProps> {
  const stars = starsFor(score, RIVAL_VILLAGE.score);
  const crowns = crownsFor(STAKES, stars);
  return {
    defender: RIVAL,
    stars,
    score,
    target: RIVAL_VILLAGE.score,
    crowns,
    crownsAfter: ME.crowns + crowns,
    // The reward is placed in the player's own village: #646's fakes (its growing village, its offer of three tiles).
    reward: stars > 0 ? { state: "offer", offer: REWARD } : { state: "none" },
    village: VILLAGE_GROWING,
    balance: 640,
    now: MOCK_NOW,
    ...extra,
  };
}

export const PVP_RESULT = {
  twoStars: result(ATTACK_SCORES.rival[3]),
  /** Three stars, and the crowns carry the attacker into Silver I. */
  threeStarsPromoted: result(ATTACK_SCORES.rival[10]),
  /** One star, the day's rewards already taken. */
  oneStarCapped: result(ATTACK_SCORES.rival[2], { reward: { state: "capped", resetsAt: MOCK_NOW + 7 * HOUR + 40 * 60 } }),
  /** The reward chosen on the sheet: a tile placed in the village. */
  rewardPlaced: result(ATTACK_SCORES.rival[3], { reward: { state: "taken", plan: REWARD.plans[0]!, cobbles: null } }),
  /** The Cobbles taken instead. */
  rewardCobbles: result(ATTACK_SCORES.rival[3], { reward: { state: "taken", plan: null, cobbles: REWARD.cobbles } }),
  defeat: result(ATTACK_SCORES.rival[5]),
  /** A defeat that drops the attacker out of Silver II. */
  defeatDropped: { ...result(ATTACK_SCORES.rival[5]), crownsAfter: 990 },
  pending: result(ATTACK_SCORES.rival[3], { pending: true }),
  error: result(ATTACK_SCORES.rival[3], { error: "The result is not recorded yet: the network did not answer.", errorDetail: { code: "RpcError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 52) } }),
} satisfies Record<string, Data<PvpResultSceneProps>>;

// Defence log

const defence = (i: number, seed: keyof typeof ATTACK_SCORES.mine, at: number): DefenceEntry => {
  const score = ATTACK_SCORES.mine[seed];
  const stars = starsFor(score, MY_VILLAGE.score);
  // What the attacker wins the defender loses; a defence held (no star) wins the defender a few crowns.
  return { id: 40 + i, attacker: ATTACKERS[i]!, stars, score, target: MY_VILLAGE.score, crowns: stars > 0 ? -STAKES.win[stars - 1]! : 6, at, replay: true };
};

/** Newest first: the latest attack 2 h 48 ago, which put the shield up. */
export const DEFENCE_LOG: DefenceEntry[] = [
  defence(1, 3, MOCK_NOW - 2 * HOUR - 48 * 60),
  defence(0, 1, MOCK_NOW - 14 * HOUR),
  { ...defence(2, 2, MOCK_NOW - DAY - 3 * HOUR), replay: false },
  defence(3, 8, MOCK_NOW - 2 * DAY),
  defence(4, 10, MOCK_NOW - 3 * DAY - 5 * HOUR),
];

export const PVP_DEFENCE = {
  shielded: { attacks: DEFENCE_LOG, shieldEndsAt: DEFENCE_LOG[0]!.at + 8 * HOUR, now: MOCK_NOW },
  open: { attacks: DEFENCE_LOG.slice(1), shieldEndsAt: null, now: MOCK_NOW },
  empty: { attacks: [], now: MOCK_NOW },
  loading: { attacks: null, now: MOCK_NOW },
  error: { attacks: null, now: MOCK_NOW, error: "The defence log could not load.", errorDetail: { code: "IndexerError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 30) } },
} satisfies Record<string, Data<PvpDefenceSceneProps>>;

// League

const SEASON = { name: "Season 3", endsAt: MOCK_NOW + 4 * DAY + 3 * HOUR };

export const PVP_LEAGUE = {
  gold: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW },
  lastDay: { crowns: ME.crowns, season: { ...SEASON, endsAt: MOCK_NOW + 5 * HOUR + 20 * 60 }, now: MOCK_NOW },
  legend: { crowns: 2_655, season: SEASON, now: MOCK_NOW },
  unranked: { crowns: 0, season: SEASON, now: MOCK_NOW, unranked: true },
  ended: { crowns: ME.crowns, season: { ...SEASON, endsAt: MOCK_NOW - 2 * HOUR }, now: MOCK_NOW },
} satisfies Record<string, Data<PvpLeagueSceneProps>>;
