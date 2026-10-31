import type { BoardTile } from "@paved/chain";

/**
 * The PvP flow's rules as the screens read them (#647), the contracts' figures as literals: the star marks (#643,
 * `paved::matchmaker::stars`), the leagues and the season's rewards (#644, `paved::matchmaker::leagues`), the crowns at
 * stake (#639, `paved::matchmaker::crowns`). A value import of `@paved/chain` would bring starknet.js into the PvP chunk:
 * `__tests__/pvp.test.tsx` checks every table here against the chain's. Owner decisions (#637): an attack plays the
 * defender's placed tiles, drawn at random, in the defender's territory; crowns are the rating; an attacked village gets an
 * 8-hour shield, dropped if its owner attacks. The star marks (70 / 85 / 110 %) wait for the owner's ruling (#643, section 9).
 */

/** A cell of a territory, in the contracts' coordinates (x east, y north). */
export interface PvpCell {
  x: number;
  y: number;
}

/**
 * The three star marks in whole percent of the defender's score: 70 / 85 / 110 % (`STAR_PERCENTS` of `arena.ts`, #637 open
 * point 1). The rules count in integers: a share times a score in floating point lands just past a whole point (1.1 x 5,130
 * is 5,643.000...1) and would ask one point more.
 */
export const STAR_PERCENTS = [70, 85, 110] as const;

/** The same marks as shares of the target, for drawing them. */
export const STAR_MARKS = STAR_PERCENTS.map((p) => p / 100) as readonly number[];

/** The shield an attacked village gets: 8 hours (owner decision, `ATTACK_SHIELD`). */
export const SHIELD_S = 8 * 3_600;

/** The Cobbles of "Next" (`NEXT_PRICE`). */
export const NEXT_PRICE = 1;

/** The stars an attack's score earns against `target`, as `stars_of`: 0 for a score of 0, 3 for any score against 0. */
export function starsFor(score: number, target: number): number {
  if (score <= 0) return 0;
  return STAR_PERCENTS.filter((p) => score * 100 >= p * target).length;
}

/** The points each star needs against `target`: the least whole score at or past its share. */
export function starPoints(target: number): [number, number, number] {
  return STAR_PERCENTS.map((p) => Math.floor((p * target + 99) / 100)) as [number, number, number];
}

/** A score as a share of the target, 0 and up (1 is the target). */
export function shareOf(score: number, target: number): number {
  return target > 0 ? Math.max(0, score / target) : 0;
}

/** The crowns at stake in an attack, fixed at the draw (#639): gained per star reached (1, 2 or 3), lost when no star is. */
export interface CrownStakes {
  win: readonly [number, number, number];
  loss: number;
}

/** The stakes of a match's offer and cost: a third of the offer per star, rounded up (`prize_of`); the cost with none. */
export function stakesOf(offer: number, cost: number): CrownStakes {
  return { win: [1, 2, 3].map((stars) => Math.ceil((offer * stars) / 3)) as [number, number, number], loss: cost };
}

/** The crowns an attack ends with: `win[stars - 1]`, or `-loss` with no star. */
export function crownsFor(stakes: CrownStakes, stars: number): number {
  return stars > 0 ? stakes.win[Math.min(stars, 3) - 1]! : -stakes.loss;
}

/** A league's group: its crest's colour. Wood is under 400 crowns; Iron to Master have three divisions; Grand Master one. */
export type LeagueId = "wood" | "iron" | "bronze" | "silver" | "gold" | "emerald" | "diamond" | "master" | "grandmaster";

export interface League {
  /** The league's number on chain (`league_of`): 0 Wood, 1 to 21 Iron III to Master I, 22 Grand Master. */
  index: number;
  id: LeagueId;
  /** "Silver II". */
  name: string;
  /** The crowns it starts at. */
  from: number;
  /** The Cobbles a season ending in it gives (`reward_of`). */
  seasonCobbles: number;
}

/** The floors of leagues 1 to 22 (`LEAGUE_FLOORS`). */
export const LEAGUE_FLOORS = [400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3500, 3800, 4100, 4400, 4700, 5000] as const;
const GROUPS: readonly { id: LeagueId; name: string; reward: number }[] = [
  { id: "iron", name: "Iron", reward: 10 },
  { id: "bronze", name: "Bronze", reward: 20 },
  { id: "silver", name: "Silver", reward: 35 },
  { id: "gold", name: "Gold", reward: 50 },
  { id: "emerald", name: "Emerald", reward: 75 },
  { id: "diamond", name: "Diamond", reward: 100 },
  { id: "master", name: "Master", reward: 150 },
  { id: "grandmaster", name: "Grand Master", reward: 250 },
];
const DIVISIONS = ["III", "II", "I"] as const;

/** The 23 leagues, Wood first. */
export const LEAGUES: readonly League[] = [
  { index: 0, id: "wood", name: "Wood", from: 0, seasonCobbles: 0 },
  ...LEAGUE_FLOORS.map((from, i): League => {
    const group = i === 21 ? GROUPS[7]! : GROUPS[Math.floor(i / 3)]!;
    return { index: i + 1, id: group.id, name: i === 21 ? group.name : `${group.name} ${DIVISIONS[i % 3]}`, from, seasonCobbles: group.reward };
  }),
];

/** Each group's first league, Iron to Grand Master: the ladder of the league screen. */
export const LEAGUE_LADDER: readonly League[] = GROUPS.map((g) => {
  const first = LEAGUES.find((l) => l.id === g.id)!;
  return { ...first, name: g.name };
});

/** The league of a crown count (`league_of`). */
export function leagueOf(crowns: number): League {
  return LEAGUES[LEAGUE_FLOORS.filter((f) => f <= crowns).length]!;
}

/** The league after `league`, null at the top. */
export function nextLeague(league: League): League | null {
  return LEAGUES[league.index + 1] ?? null;
}

/** A player as the PvP screens show them: the name, the level, the crowns. */
export interface PvpPlayer {
  name: string | null;
  address: string;
  level: number;
  crowns: number;
  /** The avatar they saved (AVATAR-LOOK's value, #626), where known: the battle logs' cards show it (#834). Else their initial. */
  look?: bigint | null;
}

/** A village as an attack sees it: the defender's owned cells, placed tiles and score (#640's village). */
export interface PvpVillage {
  cells: readonly PvpCell[];
  tiles: readonly BoardTile[];
  /** The village's score: the attack's target. */
  score: number;
}
