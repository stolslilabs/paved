// The Story mode level plan (#546), a proposal for the owner's validation. Every level starts from
// the usual starter tile `RFFFRFCFR` (a city to the north, a road east to west) and plays `deck` in
// this order, so the optimum is well defined (engine deck `story`, solved by `engine/solver.ts`).
// `docs/client/story-mode.md` describes the levels for the owner; a test keeps both in step.

import { PlanType as P } from "../types/plan";

export interface StoryLevel {
  readonly id: number;
  readonly title: string;
  /** What the level teaches, one line. */
  readonly teaches: string;
  /** The intro the player reads before the level. */
  readonly intro: string;
  /** The deck after the starter, in draw order. */
  readonly deck: readonly P[];
  /** The best score: 3 stars. */
  readonly optimum: number;
}

/** 2 stars: at least 70 % of the optimum, rounded up. */
export function twoStars(optimum: number): number {
  return Math.ceil((optimum * 70) / 100);
}

export const STORY_LEVELS: readonly StoryLevel[] = [
  {
    id: 1,
    title: "First stone",
    teaches: "Placing a tile; edges must match; a road closes between two stops.",
    intro:
      "Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.",
    deck: [P.SFRFRFRFR, P.SFRFRFRFR],
    optimum: 321,
  },
  {
    id: 2,
    title: "Turn it around",
    teaches: "The rotate and cancel bubble; a city closes when no edge is open.",
    intro:
      "Tap a cell, then Rotate until the tile fits, or Cancel to pick another cell. Close the city at the top. One of your three tiles has nothing to do with it.",
    deck: [P.CFFFCFFFC, P.RFRFFFFFR, P.FFFFFFCFF],
    optimum: 643,
  },
  {
    id: 3,
    title: "Not this one",
    teaches: "Discarding: free while your score is 0.",
    intro:
      "Some tiles only get in the way. Discard throws the tile away and draws the next. While you have no points it costs nothing.",
    deck: [P.CCCCCCCCC, P.FFCFFFCFF, P.WFFFFFFFF],
    optimum: 419,
  },
  {
    id: 4,
    title: "The price of a discard",
    teaches: "The discard penalty: 50 points once you have a score.",
    intro:
      "Once you have points, a discard costs 50 of them. Sometimes it is still the right call: count what the next tile is worth.",
    deck: [P.FFCFFFCFF, P.CCCCCCCCC, P.RFRFRFCFF, P.SFRFRFRFR],
    optimum: 788,
  },
  {
    id: 5,
    title: "Under the trees",
    teaches: "Forests: a forest scores for the roads and cities around it once it is enclosed (adjacency).",
    intro:
      "Forests fill the gaps between roads and cities. When a forest is fully surrounded it scores for the roads and cities around it.",
    deck: [P.FFCFFFCFF, P.CFFFCFFFC, P.CFFFCFFFC],
    optimum: 740,
  },
  {
    id: 6,
    title: "The long road",
    teaches: "The size bonus: the longer the road, the more each tile is worth.",
    intro:
      "A road of four tiles is worth more than two roads of two. Each tile in a structure raises its value by 2.35 %, so build long before you close.",
    deck: [P.SFRFRFRFR, P.RFFFRFFFR, P.CCCCCFRFC, P.WFFFFFFFR, P.FFFFFFCFF],
    optimum: 1066,
  },
  {
    id: 7,
    title: "Crossroads",
    teaches: "Junctions and stops: a crossroads ends every road that reaches it.",
    intro:
      "A junction splits a road in pieces, and each piece scores on its own. Plan so that one tile closes two roads at once.",
    deck: [P.SFRFRFCFR, P.RFRFRFCFF, P.WFFFFFFFR, P.FFFFCCCFF, P.SFRFRFRFR],
    optimum: 1285,
  },
  {
    id: 8,
    title: "Hearth and field",
    teaches: "A road, a city and the forest between them, closed by the same tile.",
    intro:
      "One tile can close a road and the forest next to it together. Look for the tile that finishes two structures.",
    deck: [P.FFCFFFFFC, P.RFRFFFCFR, P.CCCCCFRFC, P.CCCCCFRFC, P.CCCCCCCCC],
    optimum: 1515,
  },
  {
    id: 9,
    title: "Patience",
    teaches: "Discarding twice to keep the board open for a big finish.",
    intro:
      "The best board is not always the fullest one. Throw away what does not belong, then finish with two tiles that close three structures.",
    deck: [P.RFFFRFFFR, P.CCCCCFFFC, P.WFFFFFFFF, P.CCCCCFRFC, P.CCCCCFRFC],
    optimum: 971,
  },
  {
    id: 10,
    title: "The first village",
    teaches: "Everything together: cities, roads, a junction and the size bonus.",
    intro:
      "Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.",
    deck: [P.FFFFCCCFF, P.SFRFRFCFR, P.FFCFFFFFC, P.SFRFRFRFR, P.FFCFFFFFC, P.CFFFCFFFC],
    optimum: 1578,
  },
];
