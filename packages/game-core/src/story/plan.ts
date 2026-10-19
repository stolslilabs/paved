// The Story mode plan (#546): campaigns of levels (each campaign its own count), each level a fixed deck. Every level starts from the usual starter
// tile `RFFFRFCFR` (a city to the north, a road east to west) and plays `deck` in this order (engine deck `story`: no
// withdrawal, no reseed), so its best score is one number. `docs/client/story-mode.md` describes the plan for the owner;
// a test keeps both in step and replays every stored line to its target.
//
// The targets: `exact` is the optimum of `engine/solver.ts` (exhaustive), `best-known` the higher of the designer's line
// (`engine/designer.ts`) and the best score `engine/beam.ts` finds from it (`scripts/story-search.ts`): a lower bound of
// the optimum, raised whenever a higher score is found.

import type { Placement } from "../engine/game";
import { OrientationType as O } from "../types/orientation";
import { PlanType as P } from "../types/plan";

/** How a level's target was set: the proven optimum, or the best score a search found so far. */
export type TargetMethod = "exact" | "best-known";

export interface StoryLevel {
  /** The level's index in its campaign, from 1. */
  readonly id: number;
  readonly title: string;
  /** What the level teaches or adds, one line. */
  readonly teaches: string;
  /** The intro the player reads before the level. */
  readonly intro: string;
  /** The deck after the starter, in draw order. */
  readonly deck: readonly P[];
  /** Tiles already on the board when the level starts, besides the starter (default none). */
  readonly placed?: readonly ({ plan: P } & Placement)[];
  /** The seed whose Challenge draw the deck is (`story/deck.ts`), for a deck taken from the simple deck. */
  readonly seed?: number;
  /** The score for 3 stars. */
  readonly target: number;
  readonly method: TargetMethod;
  /** One line that reaches `target` (`story/line.ts`). */
  readonly line: string;
  /**
   * The designer's line (`engine/designer.ts`: the team's way of playing a deck by hand, as written rules), for a
   * `best-known` level: the human reference beside the search. The target is never below it, and the search starts from it.
   */
  readonly designer?: string;
}

export interface StoryCampaign {
  /** The campaign's number, from 1 (the order they unlock in). */
  readonly id: number;
  readonly name: string;
  /** One sentence for the campaign list. */
  readonly summary: string;
  readonly levels: readonly StoryLevel[];
}

/** 2 stars: at least 70 % of the target, rounded up. */
export function twoStars(target: number): number {
  return Math.ceil((target * 70) / 100);
}

const TUTORIAL_LEVELS: readonly StoryLevel[] = [
  {
    id: 1,
    title: "First stone",
    teaches: "Placing a tile; edges must match; a road closes between two stops.",
    intro:
      "Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.",
    deck: [P.SFRFRFRFR, P.SFRFRFRFR],
    target: 321,
    method: "exact",
    line: "N1,0 N-1,0",
  },
  {
    id: 2,
    title: "Turn it around",
    teaches: "The rotate and cancel bubble; a city closes when no edge is open.",
    intro:
      "Tap a cell, then Rotate until the tile fits, or Cancel to pick another cell. Close the city at the top. One of your three tiles has nothing to do with it.",
    deck: [P.CFFFCFFFC, P.RFRFFFFFR, P.FFFFFFCFF],
    target: 643,
    method: "exact",
    line: "E0,1 N1,0 N0,2",
  },
  {
    id: 3,
    title: "Not this one",
    teaches: "Discarding: free while your score is 0.",
    intro:
      "Some tiles only get in the way. Discard throws the tile away and draws the next. While you have no points it costs nothing.",
    deck: [P.CCCCCCCCC, P.FFCFFFCFF, P.WFFFFFFFF],
    target: 419,
    method: "exact",
    line: "D N0,1 N0,-1",
  },
  {
    id: 4,
    title: "The price of a discard",
    teaches: "The discard penalty: 50 points once you have a score.",
    intro:
      "Once you have points, a discard costs 50 of them. Sometimes it is still the right call: count what the next tile is worth.",
    deck: [P.FFCFFFCFF, P.CCCCCCCCC, P.RFRFRFCFF, P.SFRFRFRFR],
    target: 788,
    method: "exact",
    line: "N0,1 D N0,2 N1,0",
  },
  {
    id: 5,
    title: "Under the trees",
    teaches: "Forests: a forest scores for the roads and cities around it once it is enclosed (adjacency).",
    intro:
      "Forests fill the gaps between roads and cities. When a forest is fully surrounded it scores for the roads and cities around it.",
    deck: [P.FFCFFFCFF, P.CFFFCFFFC, P.CFFFCFFFC],
    target: 740,
    method: "exact",
    line: "N0,1 E1,1 E-1,1",
  },
  {
    id: 6,
    title: "The long road",
    teaches: "The size bonus: the longer the road, the more each tile is worth.",
    intro:
      "A road of four tiles is worth more than two roads of two. Each tile in a structure raises its value by 2.35 %, so build long before you close.",
    deck: [P.SFRFRFRFR, P.RFFFRFFFR, P.CCCCCFRFC, P.WFFFFFFFR, P.FFFFFFCFF],
    target: 1066,
    method: "exact",
    line: "N1,0 N-1,0 E2,0 S-2,0 N0,1",
  },
  {
    id: 7,
    title: "Crossroads",
    teaches: "Junctions and stops: a crossroads ends every road that reaches it.",
    intro:
      "A junction splits a road in pieces, and each piece scores on its own. Plan so that one tile closes two roads at once.",
    deck: [P.SFRFRFCFR, P.RFRFRFCFF, P.WFFFFFFFR, P.FFFFCCCFF, P.SFRFRFRFR],
    target: 1285,
    method: "exact",
    line: "N1,0 E1,1 S-1,0 N0,1 N2,1",
  },
  {
    id: 8,
    title: "Hearth and field",
    teaches: "A road, a city and the forest between them, closed by the same tile.",
    intro:
      "One tile can close a road and the forest next to it together. Look for the tile that finishes two structures.",
    deck: [P.FFCFFFFFC, P.RFRFFFCFR, P.CCCCCFRFC, P.CCCCCFRFC, P.CCCCCCCCC],
    target: 1515,
    method: "exact",
    line: "S0,1 N1,0 W-1,0 N1,1 N1,-1",
  },
  {
    id: 9,
    title: "Patience",
    teaches: "Discarding twice to keep the board open for a big finish.",
    intro:
      "The best board is not always the fullest one. Throw away what does not belong, then finish with two tiles that close three structures.",
    deck: [P.RFFFRFFFR, P.CCCCCFFFC, P.WFFFFFFFF, P.CCCCCFRFC, P.CCCCCFRFC],
    target: 971,
    method: "exact",
    line: "D S0,-1 D E1,0 W-1,0",
  },
  {
    id: 10,
    title: "The monastery",
    teaches: "Wonders: a wonder scores 900 once all eight tiles around it are placed.",
    intro:
      "The monastery stands south of the starter, with most of its neighbours already built. Fill the three empty cells below it, rotating each tile so its edges match, and the wonder scores.",
    deck: [P.FFCFFFCFF, P.RFRFFFFFR, P.CCCCCFRFC],
    placed: [
      { plan: P.WFFFFFFFF, orientation: O.North, x: 0, y: -1 },
      { plan: P.RFRFFFFFR, orientation: O.East, x: -1, y: 0 },
      { plan: P.RFRFRFCFF, orientation: O.West, x: 1, y: 0 },
      { plan: P.FFFFCCCFF, orientation: O.East, x: -1, y: -1 },
      { plan: P.FFFFCCCFF, orientation: O.North, x: 1, y: -1 },
    ],
    target: 900,
    method: "exact",
    line: "N-1,-2 S0,-2 E1,-2",
  },
  {
    id: 11,
    title: "The first village",
    teaches: "Everything together: cities, roads, a junction and the size bonus.",
    intro:
      "Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.",
    deck: [P.FFFFCCCFF, P.SFRFRFCFR, P.FFCFFFFFC, P.SFRFRFRFR, P.FFCFFFFFC, P.CFFFCFFFC],
    target: 1578,
    method: "exact",
    line: "N0,-1 S1,0 S0,1 N-1,0 W1,1 E0,-2",
  },
];
const OPEN_COUNTRY_LEVELS: readonly StoryLevel[] = [
  {
    id: 1,
    title: "Open country",
    teaches: "Ten tiles, the whole deck on the sheet: planning a few tiles ahead.",
    intro:
      "Ten tiles this time, and the deck sheet lists every one of them. Look ahead before you place: the city you open now may close three tiles later.",
    seed: 1,
    deck: [P.FFFFCCCFF, P.FFCFFFFFC, P.FFCFFFFFC, P.FFFFCCCFF, P.CCCCCFRFC, P.RFRFCCCFR, P.RFRFRFCFF, P.SFRFRFCFR, P.FFFFFFCFF],
    target: 2805,
    method: "best-known",
    line: "N0,1 E0,2 S0,3 S1,1 W1,2 E1,3 W2,2 S2,3 E3,2",
    designer: "N0,1 N1,1 S1,2 S0,2 W-1,0 S-1,-1 E2,2 N-1,-2 S-1,-3",
  },
  {
    id: 2,
    title: "Road builders",
    teaches: "A deck rich in roads: long roads, and the junctions that end them.",
    intro:
      "Most of these tiles carry a road. Let a road run before you close it, and use the junctions to finish two roads with one tile.",
    seed: 2,
    deck: [P.RFFFRFFFR, P.RFRFRFCFF, P.RFFFRFCFR, P.RFRFCCCFR, P.RFRFCCCFR, P.CCCCCFFFC, P.RFRFRFCFF, P.SFRFRFFFR, P.RFFFRFFFR, P.RFRFFFFFR, P.RFRFFFCFR, P.RFRFFFFFR],
    target: 3126,
    method: "best-known",
    line: "N0,-1 N0,1 E-1,1 W-2,1 N-2,2 S0,-2 E-1,2 S0,2 N1,2 E-1,0 N1,0 W1,1",
    designer: "N1,0 N0,1 S1,1 E-1,0 N2,0 S0,-1 N1,2 S2,1 E-1,1 W0,2 S-1,2 N2,2",
  },
  {
    id: 3,
    title: "Three monasteries",
    teaches: "Wonders in a longer deck: leaving room around a monastery.",
    intro:
      "Three monasteries come early. Each scores 900 once its eight neighbours are placed, so give them space at the edge of what you build.",
    seed: 3,
    deck: [P.WFFFFFFFF, P.SFRFRFFFR, P.RFFFRFFFR, P.WFFFFFFFF, P.RFRFCCCFR, P.RFRFRFCFF, P.RFRFCCCFR, P.FFFFCCCFF, P.RFRFRFCFF, P.FFFFFFCFF, P.FFCFFFCFF, P.CCCCCFFFC, P.RFFFRFFFR, P.RFFFRFCFR, P.WFFFFFFFF],
    target: 3739,
    method: "best-known",
    line: "N0,-1 N-1,0 N0,-2 N-1,-1 N1,0 E-1,-2 W-2,-2 E-2,-1 S1,-2 W-3,-1 N1,-1 E0,1 N-2,0 E2,0 N0,-3",
    designer: "N0,-1 N1,0 N-1,0 N1,-1 N2,0 N0,1 W1,1 E-1,-1 E2,1 N1,2 N2,-1 S0,-2 E0,2 E3,0 N-1,1",
  },
  {
    id: 4,
    title: "Walls and fields",
    teaches: "Cities and the forests between them, closed in the right order.",
    intro:
      "A forest scores for the closed roads and cities around it, but only if they are closed before it is. Finish the walls first, then the fields.",
    seed: 4,
    deck: [P.CFFFCFFFC, P.FFCFFFFFC, P.RFFFRFFFR, P.RFFFRFCFR, P.RFRFFFFFR, P.SFRFRFFFR, P.RFRFFFFFR, P.CCCCCFRFC, P.RFFFRFCFR, P.RFRFFFCFR, P.FFCFFFCFF, P.RFRFFFFFR, P.FFFFFFCFF, P.FFFFFFCFF, P.CCCCCFFFC, P.CCCCCFFFC, P.RFRFFFFFR, P.RFFFRFFFR],
    target: 4567,
    method: "best-known",
    line: "E0,1 S0,2 E1,1 E1,2 E2,1 W1,0 N1,-1 N1,3 N0,-1 E-1,-1 N0,-2 S-1,0 W-2,-1 S0,-3 W-1,2 N0,3 S2,2 N3,1",
    designer: "E0,1 S0,2 N1,0 E1,2 E1,1 N-1,0 W-1,1 E2,0 N2,1 S1,3 N1,4 N3,1 N1,5 E0,3 S3,0 S0,-1 N2,3 E2,4",
  },
  {
    id: 5,
    title: "Market day",
    teaches: "A mixed deck: keeping a few structures open, not too many.",
    intro:
      "Everything at once. Keep two or three things open at a time: more, and the last tiles will not be enough to finish them.",
    seed: 5,
    deck: [P.WFFFFFFFR, P.WFFFFFFFF, P.RFRFCCCFR, P.RFRFFFFFR, P.CCCCCFFFC, P.CFFFCFFFC, P.RFRFRFCFF, P.CFFFCFFFC, P.RFRFCCCFR, P.SFRFRFCFR, P.RFRFRFCFF, P.RFRFFFCFR, P.SFRFRFCFR, P.FFFFFFCFF, P.RFFFRFFFR, P.SFRFRFFFR, P.CFFFCFFFC, P.FFFFCCCFF, P.RFFFRFFFR, P.WFFFFFFFF, P.RFRFFFFFR],
    target: 7118,
    method: "best-known",
    line: "N1,0 N1,1 S-1,0 E-1,-1 E2,0 E0,1 N0,2 E2,1 E2,2 S2,-1 W1,2 E3,0 W2,-2 E3,-2 N1,-1 S0,-1 E-1,1 E-2,1 N1,-2 N-1,-2 E0,-2",
    designer: "N1,0 N0,-1 E-1,0 S-1,1 W-1,-1 N1,1 N2,0 N0,-2 N0,1 E2,1 S2,-1 S0,2 N0,3 E-1,2 N1,2 S2,2 N1,-2 W-1,-2 N1,3 N-2,1 E-1,3",
  },
  {
    id: 6,
    title: "The cloister road",
    teaches: "Wonders and cities together on a bigger board.",
    intro:
      "Monasteries and cities share this deck. A wonder wants to be surrounded, a city wants to be closed: one tile can help both.",
    seed: 6,
    deck: [P.CCCCCFFFC, P.WFFFFFFFF, P.RFFFRFCFR, P.RFRFFFFFR, P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFCCCFR, P.RFRFFFFFR, P.RFRFCCCFR, P.RFFFRFFFR, P.CFFFCFFFC, P.CCCCCCCCC, P.RFFFRFFFR, P.SFRFRFCFR, P.FFFFFFCFF, P.RFRFRFCFF, P.FFFFFFCFF, P.FFFFCCCFF, P.FFCFFFCFF, P.FFCFFFFFC, P.CCCCCFFFC, P.WFFFFFFFR, P.FFFFCCCFF, P.CCCCCFRFC],
    target: 6967,
    method: "best-known",
    line: "W0,1 N1,1 N0,2 N1,2 N2,1 E2,2 N-1,1 W2,0 S-1,0 N1,0 E3,0 N3,-1 N3,2 W-2,0 N3,1 W2,-1 E4,-1 S3,-2 E2,-2 S1,-2 W0,-2 S1,-1 E0,-1 S-1,-1",
    designer: "E0,1 N-1,1 N-1,0 E-2,0 N-1,2 W-2,1 N1,0 E-3,1 S1,1 N2,1 E0,2 N0,3 N3,1 S-1,-1 E-2,2 E-2,-1 W-3,-1 W-1,3 E2,0 N-2,3 E1,2 E-2,-2 E-3,-2 N-3,2",
  },
  {
    id: 7,
    title: "Crossings",
    teaches: "Junctions everywhere: splitting roads on purpose.",
    intro:
      "This deck is full of junctions. A crossroads ends every road that reaches it, so a short road between two of them scores quickly.",
    seed: 7,
    deck: [P.RFRFRFCFF, P.RFFFRFCFR, P.SFRFRFCFR, P.FFFFFFCFF, P.RFFFRFFFR, P.FFFFCCCFF, P.CFFFCFFFC, P.RFRFFFCFR, P.FFFFCCCFF, P.RFRFFFFFR, P.CCCCCFFFC, P.RFFFRFFFR, P.FFCFFFCFF, P.RFRFFFFFR, P.CCCCCFFFC, P.RFRFFFFFR, P.RFFFRFCFR, P.RFRFFFFFR, P.SFRFRFFFR, P.RFFFRFFFR, P.WFFFFFFFF, P.FFCFFFCFF, P.RFFFRFFFR, P.CCCCCCCCC, P.CCCCCFRFC, P.RFFFRFFFR, P.RFRFFFCFR],
    target: 7268,
    method: "best-known",
    line: "E0,-1 N0,1 N1,1 E0,2 E1,2 N-1,-1 E-1,-2 S-1,-3 W-1,2 W2,1 W-2,-2 E1,3 N-1,3 W1,4 W-2,2 N2,0 S1,0 E-1,0 S-1,1 N0,4 N0,3 E-3,-2 E3,1 N-3,2 W-1,4 N1,-1 W-4,-2",
    designer: "N0,1 N1,0 S1,-1 N-1,1 N0,-1 N0,-2 N-1,2 S-1,0 E-2,0 E-1,-1 W-2,-1 N1,1 N0,-3 N2,0 N-3,0 W2,1 E1,-2 W2,-1 E1,-3 E2,-2 N-2,1 N0,-4 E1,-4 N-2,-2 N0,2 E1,-5 N2,-3",
  },
  {
    id: 8,
    title: "City walls",
    teaches: "A city-heavy deck: big cities and their size bonus.",
    intro:
      "Cities, and more cities. Each tile adds 2.35 % to a structure's value: a city of eight is worth far more than two cities of four.",
    seed: 8,
    deck: [P.RFRFFFCFR, P.SFRFRFCFR, P.RFFFRFFFR, P.CFFFCFFFC, P.FFCFFFCFF, P.FFFFFFCFF, P.RFRFFFFFR, P.RFFFRFCFR, P.RFRFFFCFR, P.RFFFRFFFR, P.RFRFCCCFR, P.CFFFCFFFC, P.RFRFRFCFF, P.RFRFCCCFR, P.RFFFRFFFR, P.CCCCCFFFC, P.SFRFRFFFR, P.FFCFFFFFC, P.RFRFFFFFR, P.RFRFCCCFR, P.RFRFFFFFR, P.RFRFFFFFR, P.FFFFFFCFF, P.RFRFFFFFR, P.RFRFFFFFR, P.CCCCCFRFC, P.RFFFRFFFR, P.CCCCCFFFC, P.FFFFCCCFF, P.RFRFFFFFR],
    target: 7865,
    method: "best-known",
    line: "N0,1 N1,0 E1,1 E1,-1 N2,-1 S1,-2 W1,2 N2,0 S2,-2 N-1,0 S0,2 E3,-1 W-1,2 N0,3 N-1,1 S1,-3 E-2,1 N1,3 E-2,0 N1,4 S-2,2 S-1,3 E2,4 E2,1 S0,4 N1,5 E4,-1 W0,-2 E0,-1 S2,2",
    designer: "N0,1 N1,0 E1,1 N0,-1 E0,-2 E1,-2 E-1,0 W-1,-2 S-1,1 E0,2 S0,3 N0,-3 W-1,-3 N1,3 E1,4 N1,-1 E1,5 W1,-3 N2,0 E-2,-3 W-2,-2 S2,1 N-1,2 E-3,-2 S-3,-1 E3,1 N-2,-1 S0,-4 S-2,0 S1,6",
  },
  {
    id: 9,
    title: "Pilgrims",
    teaches: "Three wonders in a long deck: when to start them, when to give up on one.",
    intro:
      "Three monasteries again, in a much longer deck. Not every one has to score: a discard costs 50, a wonder left open costs 900.",
    seed: 9,
    deck: [P.RFRFCCCFR, P.FFCFFFCFF, P.RFRFFFCFR, P.CCCCCFFFC, P.RFRFCCCFR, P.CCCCCFFFC, P.FFCFFFCFF, P.RFRFRFCFF, P.CFFFCFFFC, P.WFFFFFFFF, P.CFFFCFFFC, P.SFRFRFCFR, P.RFRFCCCFR, P.SFRFRFFFR, P.RFFFRFFFR, P.RFFFRFFFR, P.RFRFFFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.SFRFRFFFR, P.FFFFFFCFF, P.SFRFRFFFR, P.FFFFCCCFF, P.FFFFFFCFF, P.WFFFFFFFR, P.SFRFRFFFR, P.RFFFRFCFR, P.WFFFFFFFF, P.RFFFRFFFR, P.FFFFCCCFF, P.FFFFCCCFF],
    target: 10557,
    method: "best-known",
    line: "N0,1 E1,1 E2,1 N1,2 N3,1 S0,-1 N3,0 E4,1 E3,-1 N2,0 E3,-2 S3,-3 W4,-3 E4,-4 E3,-4 E3,-5 W2,-1 W1,0 E3,-6 E3,-7 N4,-7 N5,-7 E5,-3 E5,-6 N4,-2 E5,-2 E4,-5 S5,-4 W5,-5 N4,-6 N2,-3 N1,3 W4,-1",
    designer: "N1,0 N0,1 N0,2 S0,-1 E-1,0 N1,-1 E2,0 E3,0 N2,-1 N1,-2 N2,1 E3,-1 S0,3 N4,0 E-1,1 N4,-1 S-1,2 N1,3 E1,4 S1,5 N2,5 N5,-1 S0,-2 S5,0 N2,-2 N1,2 W4,1 N6,-1 E3,-2 N4,-2 E3,-3 S3,1 S2,-3",
  },
  {
    id: 10,
    title: "The long season",
    teaches: "Four wonders and a long deck: the board as a whole.",
    intro:
      "Thirty-six tiles and four monasteries. Build the board as a whole: where will the last ten tiles go?",
    seed: 10,
    deck: [P.FFFFCCCFF, P.FFFFFFCFF, P.RFRFFFFFR, P.CCCCCFRFC, P.RFFFRFFFR, P.FFFFCCCFF, P.WFFFFFFFF, P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFCCCFR, P.FFFFCCCFF, P.RFRFFFCFR, P.RFFFRFCFR, P.FFCFFFCFF, P.WFFFFFFFR, P.RFFFRFCFR, P.CFFFCFFFC, P.RFRFFFFFR, P.RFFFRFFFR, P.FFCFFFCFF, P.WFFFFFFFF, P.CFFFCFFFC, P.RFFFRFFFR, P.RFRFFFFFR, P.CCCCCFRFC, P.RFRFFFFFR, P.CCCCCCCCC, P.CCCCCFFFC, P.RFRFCCCFR, P.FFFFFFCFF, P.RFRFFFCFR, P.FFFFFFCFF, P.RFRFCCCFR, P.RFRFFFCFR, P.RFRFFFFFR],
    target: 9589,
    method: "best-known",
    line: "N0,1 E1,1 W1,0 W-1,0 E1,-1 E0,-1 N2,0 N2,-1 E3,0 E1,-2 N3,-1 S3,-2 W3,1 E4,-1 E2,1 E4,1 N5,-1 W2,-2 E2,2 E6,-1 N1,2 N5,0 E2,3 S3,2 S2,-3 N1,3 N2,-4 S5,-2 E0,3 S0,2 W-1,3 E7,-1 W0,-2 W1,4 S0,4",
    designer: "N0,1 E1,1 W1,0 W-1,0 E1,-1 E0,-1 N2,0 N2,1 N1,-2 S0,-2 N2,-1 N0,-3 S0,-4 N-1,1 S-1,-3 N-1,2 N-1,-2 S-1,-4 N0,2 N3,0 N1,-3 E3,1 N1,2 N2,2 N3,-1 W1,-4 N-2,-2 E3,2 E-2,2 S2,-2 E4,-1 S-2,-3 S2,3 N3,3 W-2,-4",
  },
  {
    id: 11,
    title: "A full road",
    teaches: "The Challenge's whole game: 38 tiles, the simple deck's played count.",
    intro:
      "This is a full game: 38 tiles, like a Challenge, but you know the deck. Use the deck sheet, and go for the best score there is.",
    seed: 11,
    deck: [P.FFFFCCCFF, P.FFCFFFCFF, P.CCCCCFRFC, P.SFRFRFFFR, P.CCCCCFFFC, P.WFFFFFFFF, P.RFFFRFCFR, P.RFRFFFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.WFFFFFFFR, P.RFRFFFCFR, P.SFRFRFRFR, P.RFFFRFFFR, P.RFRFFFFFR, P.RFRFFFFFR, P.RFRFRFCFF, P.CCCCCFRFC, P.FFCFFFFFC, P.WFFFFFFFF, P.SFRFRFFFR, P.RFFFRFFFR, P.SFRFRFFFR, P.RFRFCCCFR, P.WFFFFFFFF, P.FFCFFFCFF, P.FFFFCCCFF, P.FFFFCCCFF, P.RFRFCCCFR, P.SFRFRFCFR, P.FFFFFFCFF, P.RFRFCCCFR, P.CFFFCFFFC, P.FFFFCCCFF, P.CFFFCFFFC, P.WFFFFFFFR, P.RFRFRFCFF],
    target: 14374,
    method: "best-known",
    line: "N0,1 E1,1 W-1,0 S1,0 N1,2 N0,-1 E2,1 E1,-1 W0,-2 N-1,-2 S1,-2 N2,-1 N2,0 N1,-3 N2,-3 N3,0 S2,-2 N2,2 N-1,-1 N3,-1 N0,-3 N-1,-3 S-2,-2 E-2,-3 N3,-2 N-1,1 W4,-1 N4,-2 S4,-3 W-2,0 W3,-3 S5,-2 E4,0 E5,-1 E4,1 W3,1 N4,2",
    designer: "N0,1 E1,1 W-1,0 S1,0 W-1,1 N0,-1 E2,1 N2,0 E1,-1 N2,-1 W2,2 N3,-1 D E3,0 S3,1 N4,1 S3,-2 N4,2 E3,2 N1,2 S2,-2 N1,-2 S0,-2 E-1,-2 N0,2 N3,3 S2,3 W1,3 N3,-3 N2,-3 E0,3 N0,-3 E-1,2 N-1,3 E4,3 S4,0 S-1,-1",
  },
];

/** The first campaign: one rule per level, small decks, exact targets. */
export const TUTORIAL: StoryCampaign = {
  id: 1,
  name: "Tutorial",
  summary: "Eleven short levels, one rule each: placing, turning, discarding, roads, cities, forests and wonders.",
  levels: TUTORIAL_LEVELS,
};

/** The second campaign: the Challenge's deck, frozen, from 10 tiles to the full 38. */
export const OPEN_COUNTRY: StoryCampaign = {
  id: 2,
  name: "Open Country",
  summary: "Longer games on the Challenge's own deck, from 10 tiles to a full game of 38.",
  levels: OPEN_COUNTRY_LEVELS,
};

/** Every campaign, in the order they unlock. */
export const CAMPAIGNS: readonly StoryCampaign[] = [TUTORIAL, OPEN_COUNTRY];
