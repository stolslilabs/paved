import type { BoardTile } from "@paved/chain";

/**
 * The PvP flow's rules as the screens read them (#647), until the contracts fix them: the star marks (#643), the leagues and
 * the season (#644), the crowns at stake (#639). Owner decisions (#637): an attack plays the defender's placed tiles, drawn at
 * random, in the defender's territory; crowns are the rating; an attacked village gets an 8-hour shield, dropped if its owner
 * attacks. Every figure below that is not one of those is a proposal.
 */

/** A cell of a territory, in the contracts' coordinates (x east, y north). */
export interface PvpCell {
  x: number;
  y: number;
}

/**
 * The three star marks in whole percent of the defender's score: 70 / 85 / 110 % (the measured proposal of #637, open point 1).
 * They give 1 star in about half the attacks, 2 in a quarter to a third, 3 in 7 to 14 %. The rules count in integers: a share
 * times a score in floating point lands just past a whole point (1.1 x 5,130 is 5,643.000...1) and would ask one point more.
 */
export const STAR_PERCENTS = [70, 85, 110] as const;

/** The same marks as shares of the target, for drawing them. */
export const STAR_MARKS = STAR_PERCENTS.map((p) => p / 100) as readonly number[];

/** The shield an attacked village gets: 8 hours (owner decision). */
export const SHIELD_S = 8 * 3_600;

/** The stars an attack's score earns against `target`: 0 to 3, each once `score` is at least its share of the target. */
export function starsFor(score: number, target: number): number {
  if (target <= 0) return 3;
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

/** The crowns at stake in an attack (#639 decides): gained per star reached (1, 2 or 3), lost when no star is. */
export interface CrownStakes {
  win: readonly [number, number, number];
  loss: number;
}

/** The crowns an attack ends with: `win[stars - 1]`, or `-loss` with no star. */
export function crownsFor(stakes: CrownStakes, stars: number): number {
  return stars > 0 ? stakes.win[Math.min(stars, 3) - 1]! : -stakes.loss;
}

export type LeagueId = "bronze" | "silver" | "gold" | "crystal" | "master" | "champion" | "legend";

export interface League {
  id: LeagueId;
  name: string;
  /** The crowns it starts at. */
  from: number;
  /** The Cobbles a season ending in it gives (#644 decides). */
  seasonCobbles: number;
}

/** The leagues by crowns (a proposal until #644): seven, 400 crowns apart, the last one open-ended. */
export const LEAGUES: readonly League[] = [
  { id: "bronze", name: "Bronze", from: 0, seasonCobbles: 20 },
  { id: "silver", name: "Silver", from: 400, seasonCobbles: 40 },
  { id: "gold", name: "Gold", from: 800, seasonCobbles: 70 },
  { id: "crystal", name: "Crystal", from: 1_200, seasonCobbles: 110 },
  { id: "master", name: "Master", from: 1_600, seasonCobbles: 160 },
  { id: "champion", name: "Champion", from: 2_000, seasonCobbles: 220 },
  { id: "legend", name: "Legend", from: 2_400, seasonCobbles: 300 },
];

/** The league of a crown count. */
export function leagueOf(crowns: number): League {
  return [...LEAGUES].reverse().find((l) => crowns >= l.from) ?? LEAGUES[0]!;
}

/** The league after `league`, null at the top. */
export function nextLeague(league: League): League | null {
  return LEAGUES[LEAGUES.indexOf(league) + 1] ?? null;
}

/** A player as the PvP screens show them: the name, the level, the crowns. */
export interface PvpPlayer {
  name: string | null;
  address: string;
  level: number;
  crowns: number;
}

/** A village as an attack sees it: the defender's owned cells, placed tiles and score (#640's village). */
export interface PvpVillage {
  cells: readonly PvpCell[];
  tiles: readonly BoardTile[];
  /** The village's score: the attack's target. */
  score: number;
}
