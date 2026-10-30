import { CENTER, levelStatus, pvpXp } from "@paved/game-core";
import { sideSettings } from "../data/board-side";
import { BOARD_FOG, squareGridSettings } from "../data/settings";
import { APP_ASSETS, appRenders } from "./assets";
import type { CrownStakes, PvpPlayer } from "../lib/pvp-rules";
import { NEXT_PRICE, crownsFor, leagueOf, stakesOf, starsFor } from "../lib/pvp-rules";
import type { PvpAttackSceneProps } from "../components/scenes/pvp-attack-scene";
import type { PvpEndSceneProps } from "../components/scenes/pvp-end-scene";
import type { MatchCardData, MatchListProps } from "../components/containers/match-list";
import type { PvpLeagueSceneProps } from "../components/scenes/pvp-league-scene";
import type { PvpResultSceneProps } from "../components/scenes/pvp-result-scene";
import type { PvpScoutSceneProps } from "../components/scenes/pvp-scout-scene";
import type { PvpSearchSceneProps } from "../components/scenes/pvp-search-scene";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER, PLAYER_ID } from "./players";
import { buildVillage, playAttack, type AttackStep } from "./pvp-attack";
import { REWARD, VILLAGE_GROWING } from "./village";
import { generatedLook } from "./avatar";

/**
 * The PvP flow's fakes (#647), nothing wired: the players, the villages and the attacks (played on the engine,
 * `pvp-attack.ts`), the crowns at stake, the matches, the league. Shared with the village screen (#646) through
 * `PvpVillage`: its own fakes draw a village with `VillageBoard`, these with the game's board.
 */

/** The attacker: Bronze II, 28 crowns short of Bronze I (two stars keep them in Bronze II, three take them up). */
export const ME: PvpPlayer = { name: PLAYER.name, address: PLAYER_ID, level: 6, crowns: 1_172 };

/** The defender drawn by the search. */
export const RIVAL: PvpPlayer = { name: "Rook of Ashford", address: "0x04b7e2a19c3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e1a", level: 7, crowns: 1_212 };

/** Other players, the attackers of the matches' defences. */
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
/** The player's own village, the defences': 6,124 points. */
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

/** A defence's replay: the attack of seed 3 on the player's village (100 %, two stars). */
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
  /** Three stars, and the crowns carry the attacker into Bronze I. */
  threeStarsPromoted: result(ATTACK_SCORES.rival[10]),
  /** One star, the day's rewards already taken. */
  oneStarCapped: result(ATTACK_SCORES.rival[2], { reward: { state: "capped", resetsAt: MOCK_NOW + 7 * HOUR + 40 * 60 } }),
  /** The reward chosen on the sheet: a tile placed in the village. */
  rewardPlaced: result(ATTACK_SCORES.rival[3], { reward: { state: "taken", plan: REWARD.plans[0]!, cobbles: null } }),
  /** The Cobbles taken instead. */
  rewardCobbles: result(ATTACK_SCORES.rival[3], { reward: { state: "taken", plan: null, cobbles: REWARD.cobbles } }),
  /** The reward is being read. */
  rewardLoading: result(ATTACK_SCORES.rival[3], { reward: { state: "loading" } }),
  /** The reward's read failed: said, with Try again, never a capped day. */
  rewardError: result(ATTACK_SCORES.rival[3], { reward: { state: "error", message: "Your reward could not be read: the network did not answer.", detail: { code: "RpcError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 52) } } }),
  defeat: result(ATTACK_SCORES.rival[5]),
  /** A defeat that drops the attacker out of Bronze II. */
  defeatDropped: { ...result(ATTACK_SCORES.rival[5]), crownsAfter: 990 },
  pending: result(ATTACK_SCORES.rival[3], { pending: true }),
  error: result(ATTACK_SCORES.rival[3], { error: "The result is not recorded yet: the network did not answer.", errorDetail: { code: "RpcError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 52) } }),
} satisfies Record<string, Data<PvpResultSceneProps>>;

// Matches (#786): the latest attacks and defences, in place of the defence log

/** A match's rival with a face (#834): the mock's players saved no avatar, so each shows one seeded by its address. */
const faced = (player: PvpPlayer): PvpPlayer => ({ ...player, look: generatedLook(player.address) });

/** A defence: an attacker's attack of `seed` on the player's village (its snapshot, `MY_VILLAGE`). */
const defence = (i: number, seed: keyof typeof ATTACK_SCORES.mine, at: number): MatchCardData => {
  const score = ATTACK_SCORES.mine[seed];
  const stars = starsFor(score, MY_VILLAGE.score);
  // What the attacker wins the defender loses; a defence held (no star) wins the defender a few crowns.
  return { id: `d${40 + i}`, side: "defence", rival: faced(ATTACKERS[i]!), league: leagueOf(ATTACKERS[i]!.crowns), village: MY_VILLAGE.tiles, stars, score, target: MY_VILLAGE.score, crowns: stars > 0 ? -STAKES.win[stars - 1]! : 6, at };
};

/** An attack of the player's, of `seed`, on the rival's village (its snapshot, `RIVAL_VILLAGE`): its rewards too. */
const attackMade = (id: number, seed: keyof typeof ATTACK_SCORES.rival, at: number, extra: Partial<MatchCardData> = {}): MatchCardData => {
  const score = ATTACK_SCORES.rival[seed];
  const stars = starsFor(score, RIVAL_VILLAGE.score);
  const chest = ([null, "basic", "rare", "epic"] as const)[stars]!;
  return { id: `a${id}`, side: "attack", village: RIVAL_VILLAGE.tiles, stars, score, target: RIVAL_VILLAGE.score, crowns: crownsFor(STAKES, stars), xp: pvpXp(stars), chest, at, ...extra, rival: faced(extra.rival ?? RIVAL), league: leagueOf((extra.rival ?? RIVAL).crowns) };
};

/** Newest first, attacks and defences mixed: the latest attack on the village 2 h 48 ago, which put the shield up. */
export const MATCHES: MatchCardData[] = [
  attackMade(12, 3, MOCK_NOW - 40 * 60),
  defence(1, 3, MOCK_NOW - 2 * HOUR - 48 * 60),
  attackMade(11, 10, MOCK_NOW - 5 * HOUR, { rival: ATTACKERS[3]! }),
  defence(0, 1, MOCK_NOW - 14 * HOUR),
  attackMade(10, 5, MOCK_NOW - 20 * HOUR, { rival: ATTACKERS[2]! }),
  attackMade(9, 2, MOCK_NOW - DAY - HOUR, { rival: ATTACKERS[4]!, chest: null }),
  defence(2, 2, MOCK_NOW - DAY - 3 * HOUR),
  defence(3, 8, MOCK_NOW - 2 * DAY),
  attackMade(8, 5, MOCK_NOW - 2 * DAY - 4 * HOUR, { rival: ATTACKERS[1]!, surrendered: true, score: 1_204, stars: 0, crowns: -STAKES.loss, xp: 0, chest: null }),
  defence(4, 10, MOCK_NOW - 3 * DAY - 5 * HOUR),
];

/** One card per state (#834): its illustration in colour or grayscale, its corners. */
export const MATCH_CARDS = {
  /** Two stars on the rival: crowns won, XP and a rare chest. */
  attackWon: MATCHES[0]!,
  /** No star: crowns lost, the illustration grey, no chest. */
  attackLost: MATCHES[4]!,
  /** The attack on the village held (no star): a few crowns won. */
  defenceWon: MATCHES[6]!,
  /** The attacker took stars: crowns lost. */
  defenceLost: MATCHES[1]!,
  surrender: MATCHES[8]!,
  /** Three stars: an epic chest. */
  chest: MATCHES[2]!,
  /** A star, but no chest (the day's chests taken). */
  noChest: MATCHES[5]!,
} satisfies Record<string, MatchCardData>;

/** 26 matches: "Show more" past the first 20 (open point 3). */
const MANY: MatchCardData[] = Array.from({ length: 26 }, (_, i) => {
  const m = MATCHES[i % MATCHES.length]!;
  return { ...m, id: `${m.id}-${i}`, at: MOCK_NOW - (i + 1) * 3 * HOUR };
});

/** The League page's matches (a section of the page, BACK-RULE #783), on the page's clock, the cards' backgrounds the app's renders (#857). */
export const PVP_MATCHES = {
  latest: { matches: MATCHES, renders: appRenders },
  many: { matches: MANY, renders: appRenders },
  /** v1 (the chain before step 3): no snapshot is kept, so no village behind the cards, and no rewards nor rival's league known. */
  noSnapshot: { matches: MATCHES.map(({ xp: _xp, chest: _chest, league: _league, ...m }) => ({ ...m, village: null })), renders: appRenders },
  empty: { matches: [] },
  loading: { matches: null },
  error: { matches: null, error: "The matches could not load.", errorDetail: { code: "IndexerError", version: "0.1.0", at: Date.UTC(2026, 9, 20, 9, 30) } },
} satisfies Record<string, Data<Omit<MatchListProps, "now">>>;

// League

const SEASON = { name: "Season 3", endsAt: MOCK_NOW + 4 * DAY + 3 * HOUR };

export const PVP_LEAGUE = {
  bronze: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.latest },
  // The season's reward (#859): the attacks still needed below `MIN_SEASON_ATTACKS` (5), none past it.
  attacksBelow: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, attacks: 2, matches: PVP_MATCHES.latest },
  attacksOneLeft: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, attacks: 4 },
  attacksAbove: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, attacks: 7, matches: PVP_MATCHES.latest },
  // The matches' states (#786), a section of the page (BACK-RULE #783).
  matchesMany: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.many },
  matchesNoSnapshot: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.noSnapshot },
  matchesEmpty: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.empty },
  matchesLoading: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.loading },
  matchesFailed: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.error },
  lastDay: { crowns: ME.crowns, season: { ...SEASON, endsAt: MOCK_NOW + 5 * HOUR + 20 * 60 }, now: MOCK_NOW },
  // The first-time bonus of Bronze II paid on reaching it and not yet celebrated (#833, open point 1): its icon is active.
  bonusReady: { crowns: ME.crowns, best: 1_180, bonusesToSee: [5], season: SEASON, now: MOCK_NOW, matches: PVP_MATCHES.latest },
  // The carousel on a league above the player's (Silver II) and one below (Iron II): the header's League control brings it back.
  higher: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, opensOn: 8 },
  lower: { crowns: ME.crowns, best: 1_240, season: SEASON, now: MOCK_NOW, opensOn: 2 },
  grandmaster: { crowns: 5_320, season: SEASON, now: MOCK_NOW },
  wood: { crowns: 0, season: SEASON, now: MOCK_NOW, unranked: true },
  // Dropped to Wood after reaching Bronze I this season: the bonuses up to Bronze I stay had.
  demoted: { crowns: 200, best: 1_240, season: SEASON, now: MOCK_NOW, opensOn: 5 },
  ended: { crowns: ME.crowns, season: { ...SEASON, endsAt: MOCK_NOW - 2 * HOUR }, now: MOCK_NOW },
} satisfies Record<string, Data<PvpLeagueSceneProps>>;

// End (#790): PvP v2's end screen

/** The rival village's score, the v2 attack's target: 80 / 90 / 100 % of it are the stars. */
const END_TARGET = RIVAL_VILLAGE.score;
const endScore = (percent: number) => Math.round((END_TARGET * percent) / 100);

/** The attack's final board in the rival's red void (#772), on the app's compressed models (the plan view without WebGL). */
const END_BOARD = {
  tiles: ATTACK_STEPS.at(-1)!.tiles,
  basePath: APP_ASSETS,
  settings: sideSettings("rival", squareGridSettings(true, ""), BOARD_FOG),
} as const;

/** Every closing of the stories' attack, with the move that closed it. */
const END_CLOSINGS = ATTACK_STEPS.flatMap((s, i) => s.lastScored.map((c) => ({ ...c, move: i })));

/** The player's XP after an attack that gave `gained`: level 5, near 6. */
function endXp(gained: number, xp = 1_480) {
  const after = levelStatus(xp);
  return { gained, xp: after.xp, level: after.level, floor: after.floor, next: after.next, levelBefore: levelStatus(xp - gained).level };
}

function end(stars: number, percent: number, crowns: number, extra: Partial<Data<PvpEndSceneProps>> = {}): Data<PvpEndSceneProps> {
  const rank = (["basic", "rare", "epic"] as const)[stars - 1];
  return {
    defender: RIVAL,
    stars,
    score: endScore(percent),
    target: END_TARGET,
    crowns,
    crownsAfter: ME.crowns + crowns,
    xp: endXp(pvpXp(stars)),
    chest: rank ? { state: "won", rank } : { state: "none" },
    closings: END_CLOSINGS,
    board: END_BOARD,
    now: MOCK_NOW,
    ...extra,
  };
}

/** The day's PvP chest slots full: the next one at the next UTC day, 5 h away. */
const CAPPED_AT = MOCK_NOW + 4 * HOUR + 40 * 60;

export const PVP_END = {
  /** Under 80 %: no star, crowns lost, no chest. */
  zeroStars: end(0, 72, -STAKES.loss),
  /** 80 %: a basic chest. */
  oneStar: end(1, 84, STAKES.win[0]),
  /** 95 %: a rare chest, still in Bronze II. */
  twoStars: end(2, 95, STAKES.win[1]),
  /** Past the village's score: an epic chest, and the crowns carry the attacker into Bronze I. */
  threeStars: end(3, 104, STAKES.win[2]),
  /** A defeat that drops the attacker out of Bronze II. */
  dropped: { ...end(0, 64, -STAKES.loss), crownsAfter: 990 },
  /** Stars won, but the day's 3 PvP chest slots are full: the chest grey and disabled, with the wait. */
  chestCapped: end(2, 92, STAKES.win[1], { chest: { state: "capped", rank: "rare", resetsAt: CAPPED_AT } }),
  /** A level reached with the attack's XP. */
  levelUp: end(3, 101, STAKES.win[2], { xp: endXp(pvpXp(3), levelStatus(1_480).floor + 10) }),
  /** The attack given up: 0 stars and what it cost. */
  surrendered: end(0, 40, -STAKES.loss, { surrendered: true }),
  /** The level still being read. */
  xpLoading: end(2, 95, STAKES.win[1], { xp: null }),
} satisfies Record<string, Data<PvpEndSceneProps>>;
