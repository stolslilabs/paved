import type { Attack, AttackDeck, AttackMove } from "./arena";
import type { Decoded } from "./codec";
import { vrfSalt, withVrfRequest } from "./vrf";
import type { Call } from "./writer";

// The PvP matchmaker (#639, docs/architecture/matchmaker.md) and its leagues and seasons (#644, docs/architecture/leagues.md):
// the writes an attacker sends to `Matchmaker` (draw an opponent, free, or "Next" for a Cobble), the shapes of its views
// decoded from their ABI structs, and the contracts' tables the screens show (the crown curves, the leagues). Every draw is a
// VRF draw of kind `MATCH`, its index the attacker's draw counter (`village(attacker).draws`). `PvpViews` reads `Matchmaker`
// and `Arena` (#643): the PvP flow's wiring (#647) takes their addresses from the deployment; a deployment without them reads
// `not-configured`.

/** The kind of the matchmaker's VRF draws (`MATCH_KIND`). */
export const MATCH_DRAW_KIND = "MATCH";
/** The Cobbles of "Next" (`NEXT_PRICE`), spent on `Setup`'s ledger. */
export const NEXT_PRICE = 1;
/** The shield of an attacked village, in seconds (`ATTACK_SHIELD`, owner decision: 8 hours). */
export const ATTACK_SHIELD_S = 8 * 3600;

/** `Matchmaker.village(v).status`: not joined, a player, an NPC village. */
export const MATCHMAKER_STATUS = { none: 0, player: 1, npc: 2 } as const;

/** `Matchmaker.current_match(attacker)`: the opponent drawn (0x0: none), the 3-star offer and the 0-star cost fixed at the draw. */
export interface PvpMatch {
  opponent: string;
  offer: number;
  cost: number;
  started: boolean;
}

/** `Matchmaker.village(v)`: joined or not (`MATCHMAKER_STATUS`), and the draws made (the next draw's salt index). */
export interface MatchmakerVillage {
  status: number;
  draws: number;
}

/**
 * `Matchmaker.league(v)`: the season now, the crowns (a hold of an open attack included, as the season's roll counts it), the
 * league, the highest league of the season, the attacks settled in it, and the Cobbles a roll would pay.
 */
export interface LeagueStatus {
  season: number;
  crowns: number;
  league: number;
  peak: number;
  attacks: number;
  pending: number;
}

/** `Matchmaker.shield(v)`: the queue it waits in, whether it is up, and until when (seconds since the epoch). */
export interface PvpShield {
  queue: number;
  up: boolean;
  seq: number;
  until: number;
}

/** `Arena.npc_level(npc_id)`: the Story level an NPC village plays (campaign 0: none). */
export interface NpcLevel {
  campaign: number;
  level: number;
}

/** The struct fields of the views, in ABI order (camelCased); a test checks them against `contracts/abis/Matchmaker.json`. */
export const MATCH_FIELDS = ["opponent", "offer", "cost", "started"];
export const MATCHMAKER_VILLAGE_FIELDS = ["status", "draws"];
export const LEAGUE_STATUS_FIELDS = ["season", "crowns", "league", "peak", "attacks", "pending"];
export const SHIELD_FIELDS = ["queue", "up", "seq", "until"];
export const NPC_LEVEL_FIELDS = ["campaign", "level"];

const n = (value: Decoded | undefined): number => Number(value ?? 0);
const address = (value: Decoded | undefined): string => `0x${BigInt((value as bigint | string | number | undefined) ?? 0).toString(16)}`;

export const pvpMatch = (s: Record<string, Decoded>): PvpMatch => ({ opponent: address(s.opponent), offer: n(s.offer), cost: n(s.cost), started: Boolean(s.started) });
export const matchmakerVillage = (s: Record<string, Decoded>): MatchmakerVillage => ({ status: n(s.status), draws: n(s.draws) });
export const leagueStatus = (s: Record<string, Decoded>): LeagueStatus => ({
  season: n(s.season),
  crowns: n(s.crowns),
  league: n(s.league),
  peak: n(s.peak),
  attacks: n(s.attacks),
  pending: n(s.pending),
});
export const pvpShield = (s: Record<string, Decoded>): PvpShield => ({ queue: n(s.queue), up: Boolean(s.up), seq: n(s.seq), until: n(s.until) });
export const npcLevel = (s: Record<string, Decoded>): NpcLevel => ({ campaign: n(s.campaign), level: n(s.level) });

/** An NPC village's address is its id, 1 to 255 (`is_npc_address`). */
export const isNpcAddress = (value: string): boolean => {
  const id = BigInt(value);
  return id >= 1n && id <= 255n;
};

/** No match: `current_match` of an attacker that drew nobody, or whose last attack settled. */
export const NO_MATCH: PvpMatch = { opponent: "0x0", offer: 0, cost: 0, started: false };

/** What `stars` (1 to 3) win of `offer`: a third per star, rounded up (`prize_of`). */
export function prizeOf(offer: number, stars: number): number {
  return Math.ceil((offer * stars) / 3);
}

/** The gaps at which the offer becomes 2, 3, ..., 59 (`OFFER_STEPS` of `paved::matchmaker::crowns`). */
const OFFER_STEPS = [
  -574, -504, -453, -412, -378, -349, -323, -299, -278, -258, -239, -222, -206, -190, -175, -160, -146, -133, -120, -107, -94, -82, -70, -58, -46, -35, -23,
  -11, 0, 12, 23, 35, 47, 59, 71, 83, 95, 108, 121, 134, 147, 161, 176, 191, 207, 224, 241, 260, 280, 302, 326, 353, 383, 418, 461, 514, 590, 719,
];
/** The gaps at which the 0-star cost becomes 38, 37, ..., 0 (`COST_STEPS`). */
const COST_STEPS = [
  -754, -559, -465, -402, -353, -313, -279, -249, -221, -196, -173, -151, -130, -110, -91, -72, -53, -35, -17, 1, 18, 36, 54, 73, 92, 111, 131, 152, 174, 197,
  222, 250, 280, 314, 354, 403, 466, 560, 755,
];

const gapOf = (attacker: number, defender: number): number => Math.max(-1000, Math.min(1000, defender - attacker));
const atOrBelow = (steps: readonly number[], gap: number): number => steps.filter((s) => s <= gap).length;

/** The 3-star offer at the crown gap, 1 to 59 (`offer_of`). */
export const offerOf = (attacker: number, defender: number): number => 1 + atOrBelow(OFFER_STEPS, gapOf(attacker, defender));
/** The 0-star cost at the crown gap, 39 to 0 (`cost_of`). */
export const costOf = (attacker: number, defender: number): number => 39 - atOrBelow(COST_STEPS, gapOf(attacker, defender));

/** The leagues (`paved::matchmaker::leagues`): 0 Wood, 1 to 21 Iron III to Master I (seven groups of three), 22 Grand Master. */
export const LEAGUE_COUNT = 23;
/** The floor of leagues 1 to 22, in crowns (`LEAGUE_FLOORS`). */
export const LEAGUE_FLOORS = [400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3500, 3800, 4100, 4400, 4700, 5000] as const;
/** The groups of three leagues, then Grand Master's (one league). */
export const LEAGUE_GROUPS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grand Master"] as const;
/** The bonus of reaching a league of each group the first time in a season, then Grand Master's (`GROUP_BONUSES`). */
export const LEAGUE_BONUSES = [5, 10, 15, 20, 25, 30, 40, 50] as const;
/** The season reward of a group, then Grand Master's (`GROUP_REWARDS`); Wood earns nothing. */
export const SEASON_REWARDS = [10, 20, 35, 50, 75, 100, 150, 250] as const;
/** The attacks a village settles in a season to earn that season's reward (`MIN_SEASON_ATTACKS`). */
export const MIN_SEASON_ATTACKS = 5;

/** The league of `crowns` (`league_of`). */
export const leagueOfCrowns = (crowns: number): number => LEAGUE_FLOORS.filter((f) => f <= crowns).length;
/** The first crown count of `league` (0 for Wood). */
export const floorOf = (league: number): number => (league <= 0 ? 0 : LEAGUE_FLOORS[league - 1]!);
/** The group of a league (0 Iron to 6 Master, 7 Grand Master); -1 for Wood. */
export const groupOf = (league: number): number => (league <= 0 ? -1 : league === LEAGUE_COUNT - 1 ? 7 : Math.floor((league - 1) / 3));
/** "Silver II", "Grand Master", "Wood". */
export function leagueName(league: number): string {
  const group = groupOf(league);
  if (group < 0) return "Wood";
  if (group === 7) return "Grand Master";
  return `${LEAGUE_GROUPS[group]} ${["III", "II", "I"][(league - 1) % 3]}`;
}
/** The Cobbles of ending a season in `league` (`reward_of`). */
export const seasonRewardOf = (league: number): number => (league <= 0 ? 0 : SEASON_REWARDS[groupOf(league)]!);
/** The Cobbles of reaching `league` the first time in a season (`bonus_of`). */
export const leagueBonusOf = (league: number): number => (league <= 0 ? 0 : LEAGUE_BONUSES[groupOf(league)]!);

/** The salt index of an attacker's next draw is its draw counter; `search` and `next` both draw. */
function matchDraw(matchmaker: string, provider: string, attacker: string, draws: number, entrypoint: "search" | "next"): Call[] {
  const call: Call = { contractAddress: matchmaker, entrypoint, calldata: [] };
  return withVrfRequest([call], { provider, consumer: matchmaker, salt: vrfSalt(MATCH_DRAW_KIND, attacker, draws) });
}

/** `Matchmaker.search()`, its VRF request first: the salt of the attacker's draw `draws` (`village(attacker).draws`). Free. */
export const searchCalls = (matchmaker: string, provider: string, attacker: string, draws: number): Call[] => matchDraw(matchmaker, provider, attacker, draws, "search");

/** `Matchmaker.next()`, its VRF request first: another opponent for `NEXT_PRICE` Cobbles. */
export const nextCalls = (matchmaker: string, provider: string, attacker: string, draws: number): Call[] => matchDraw(matchmaker, provider, attacker, draws, "next");

/** The PvP views: `Matchmaker`'s (#639, #644) and `Arena`'s (#643). */
export interface PvpViews {
  /** `Matchmaker.current_match(attacker)`: `opponent` 0x0 with none drawn. */
  pvpMatch(attacker: string): Promise<PvpMatch>;
  /** `Matchmaker.village(v)`: joined, and the draws made. */
  pvpVillage(village: string): Promise<MatchmakerVillage>;
  /** `Matchmaker.league(v)`: the crowns, the league and the season. */
  pvpLeague(village: string): Promise<LeagueStatus>;
  /** `Matchmaker.shield(v)`. */
  pvpShield(village: string): Promise<PvpShield>;
  /** `Matchmaker.season_start(season)`: its first second, 0 for a season the clock does not know (none set). */
  pvpSeasonStart(season: number): Promise<number>;
  /** `Arena.attack(attacker)`: the attacker's last attack (id 0: none). */
  pvpAttack(attacker: string): Promise<Attack>;
  /** `Arena.deck(attacker, id)`. */
  pvpDeck(attacker: string, id: number): Promise<AttackDeck>;
  /** `Arena.moves(attacker, id)`: the moves in order, the replay's source. */
  pvpMoves(attacker: string, id: number): Promise<AttackMove[]>;
  /** `Arena.npc_level(npc_id)`. */
  pvpNpcLevel(npcId: number): Promise<NpcLevel>;
}

/** A views double with the PvP views. */
export const hasPvpViews = <T extends object>(views: T): views is T & PvpViews =>
  typeof (views as Partial<PvpViews>).pvpMatch === "function" && typeof (views as Partial<PvpViews>).pvpAttack === "function";

/** The PvP state of `FakeGameViews`: the views' answers, edited in place by a test. */
export interface FakePvpState {
  matches: Map<string, PvpMatch>;
  villages: Map<string, MatchmakerVillage>;
  leagues: Map<string, LeagueStatus>;
  shields: Map<string, PvpShield>;
  seasonStarts: Map<number, number>;
  attacks: Map<string, Attack>;
  decks: Map<string, AttackDeck>;
  moves: Map<string, AttackMove[]>;
  npcLevels: Map<number, NpcLevel>;
}
