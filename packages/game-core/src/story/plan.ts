// The Story mode plan (#546, #721): campaigns of 12 levels, each level a fixed deck. Every level starts from the usual starter
// tile `RFFFRFCFR` alone (a city to the north, a road east to west; no tile placed before the first draw) and plays
// `deck` in this order (engine deck `story`: no withdrawal, no reseed), so its best score is one number. Outside the
// Tutorial a level deals 9 to 16 tiles, the starter included; each campaign is drawn in one tile theme (`theme`). `docs/client/story-mode.md` describes the plan for the owner;
// a test keeps both in step and replays every stored line to its target.
//
// The targets: `exact` is the optimum of `engine/solver.ts` (exhaustive), `best-known` the higher of the designer's line
// (`engine/designer.ts`) and the best score `engine/beam.ts` finds from it (`scripts/story-search.ts`): a lower bound of
// the optimum, raised whenever a higher score is found.

import type { Placement } from "../engine/game";
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
  /** One sentence shown with the intro that guides on this deck: never the whole line, never a star threshold. */
  readonly tip: string;
  /** The deck after the starter, in draw order. */
  readonly deck: readonly P[];
  /**
   * Tiles already on the board when the level starts, besides the starter (default none). The engine and the contract
   * keep the capability, but no level of the plan uses it: every level starts from the starter alone (#721).
   */
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
  /** The tile theme every tile of its levels is drawn in, the chain's `u8` theme code (0 Default, 1 Forest). */
  readonly theme: number;
  readonly levels: readonly StoryLevel[];
}

/** The chain's theme codes (`skins`, `active_skins`): 0 the default art, 1 the high-forest set (the shop's Forest). */
const DEFAULT_THEME = 0;
const FOREST_THEME = 1;

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
    tip: "Look where the starter's road runs out: that is where a crossroads closes it.",
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
    tip: "Turn the first tile so that its city carries the starter's city further up.",
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
    tip: "A city you cannot close is worth nothing, so a tile that only opens more of it can go.",
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
    tip: "Before you discard, count what the tile after it can close.",
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
    tip: "Close the city first: a forest only scores for what is closed around it.",
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
    tip: "Let the road reach four tiles before you close it.",
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
    tip: "A crossroads comes last: leave a road end waiting for it.",
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
    tip: "Look for the one cell where a single tile finishes the road and the forest beside it.",
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
    tip: "Only a few of these tiles matter for the finish: keep their cells free.",
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
      "A monastery scores 900 once all eight cells around it hold a tile. It comes first: build its seven other neighbours with the tiles that follow, rotating each so its edges match.",
    tip: "Put the monastery right next to the starter, so the starter is already one of its eight neighbours.",
    deck: [P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFRFCFF, P.FFFFCCCFF, P.FFFFCCCFF, P.FFCFFFCFF, P.RFRFFFFFR, P.CCCCCFRFC],
    target: 1543,
    method: "best-known",
    line: "N0,-1 E-1,0 N1,-1 S1,-2 E-1,-1 E0,-2 W1,0 N-1,-2",
    designer: "N0,-1 N1,0 N0,1 N1,-1 N0,-2 N-1,-1 W1,1 W-1,0",
  },
  {
    id: 11,
    title: "Look ahead",
    teaches: "Planning ahead: the deck sheet lists every tile to come, and a tile's best cell depends on the ones after it.",
    intro:
      "The deck sheet lists every tile this level deals, in order. Read it before your first move: the tile in hand could close the city at once, but the tiles after it can do far better.",
    tip: "The last two tiles carry city edges: leave the cities open for them.",
    deck: [P.SFRFRFCFR, P.CCCCCFRFC, P.CCCCCFRFC, P.FFCFFFFFC, P.FFFFCCCFF],
    target: 2250,
    method: "exact",
    line: "S1,0 W-1,0 E2,0 S0,1 E1,1",
  },
  {
    id: 12,
    title: "The first village",
    teaches: "Everything together: cities, roads, a junction and the size bonus.",
    intro:
      "Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.",
    tip: "Leave two small cities side by side: one tile can close both.",
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
    teaches: "Nine tiles, the whole deck on the sheet: planning a few tiles ahead.",
    intro:
      "Nine tiles this time, and the deck sheet lists every one of them. Look ahead before you place: the city you open now may close three tiles later.",
    tip: "Almost every tile carries a piece of city: grow one big city rather than closing small ones.",
    seed: 1,
    deck: [P.FFFFCCCFF, P.FFCFFFFFC, P.FFCFFFFFC, P.FFFFCCCFF, P.CCCCCFRFC, P.RFRFCCCFR, P.RFRFRFCFF, P.SFRFRFCFR],
    target: 2693,
    method: "best-known",
    line: "E0,1 N0,2 W0,3 W-1,1 E-1,2 N-1,3 S-2,1 N-2,2",
    designer: "N0,1 N1,1 S1,2 S0,2 W-1,0 S-1,-1 E2,2 N-1,-2",
  },
  {
    id: 2,
    title: "Road builders",
    teaches: "A deck rich in roads: long roads, and the junction that ends them.",
    intro:
      "Most of these tiles carry a road. Let a road run before you close it, and use the junction to finish two roads with one tile.",
    tip: "Grow one long road, and close it with a tile that ends a city too.",
    seed: 2,
    deck: [P.RFFFRFFFR, P.RFRFRFCFF, P.RFFFRFCFR, P.RFRFCCCFR, P.RFRFCCCFR, P.CCCCCFFFC, P.RFRFRFCFF, P.SFRFRFFFR, P.RFFFRFFFR],
    target: 1296,
    method: "best-known",
    line: "N0,-1 N0,1 N0,-2 S0,-3 N-1,-3 W-1,1 S-1,-4 N1,0 N1,-1",
    designer: "N1,0 N0,1 S1,1 E-1,0 N2,0 S0,-1 N1,2 S2,1 E-1,1",
  },
  {
    id: 3,
    title: "Two monasteries",
    teaches: "Wonders in a short deck: knowing when one cannot score.",
    intro:
      "Two monasteries come early, but nine tiles are not enough to surround one and build the rest. Decide what they are for.",
    tip: "A monastery that cannot be surrounded still fills a cell: let the cities around it score instead.",
    seed: 3,
    deck: [P.WFFFFFFFF, P.SFRFRFFFR, P.RFFFRFFFR, P.WFFFFFFFF, P.RFRFCCCFR, P.RFRFRFCFF, P.RFRFCCCFR, P.FFFFCCCFF, P.RFRFRFCFF],
    target: 1533,
    method: "best-known",
    line: "N0,-1 S0,-2 N-1,0 N-1,-1 N0,-3 E-1,-2 E-1,-3 N0,1 E1,1",
    designer: "N0,-1 N1,0 N-1,0 N1,-1 N2,0 N0,1 W1,1 E-1,-1 E2,1",
  },
  {
    id: 4,
    title: "Walls and fields",
    teaches: "Cities and the forests between them, closed in the right order.",
    intro:
      "A forest scores for the closed roads and cities around it, but only if they are closed before it is. Finish the walls first, then the fields.",
    tip: "Finish the starter's city first: the roads that follow have their own closers.",
    seed: 4,
    deck: [P.CFFFCFFFC, P.FFCFFFFFC, P.RFFFRFFFR, P.RFFFRFCFR, P.RFRFFFFFR, P.SFRFRFFFR, P.RFRFFFFFR, P.CCCCCFRFC, P.RFFFRFCFR, P.RFRFFFCFR],
    target: 2170,
    method: "best-known",
    line: "E0,1 S0,2 E1,1 E1,2 E2,1 W1,3 N1,0 W-1,0 N0,-1 S0,-2",
    designer: "E0,1 S0,2 N1,0 E1,2 E1,1 N-1,0 W-1,1 E2,0 N2,1 S1,3",
  },
  {
    id: 5,
    title: "Market day",
    teaches: "A mixed deck: keeping a few structures open, not too many.",
    intro:
      "Everything at once. Keep two or three things open at a time: more, and the last tiles will not be enough to finish them.",
    tip: "Of the two monasteries that come first, only one can be surrounded: build the deck around it.",
    seed: 5,
    deck: [P.WFFFFFFFR, P.WFFFFFFFF, P.RFRFCCCFR, P.RFRFFFFFR, P.CCCCCFFFC, P.CFFFCFFFC, P.RFRFRFCFF, P.CFFFCFFFC, P.RFRFCCCFR, P.SFRFRFCFR],
    target: 2826,
    method: "best-known",
    line: "N1,0 N0,-1 N0,1 S1,-1 E2,0 N1,1 S2,-1 N3,0 E2,1 E4,0",
    designer: "N1,0 N0,-1 E-1,0 S-1,1 W-1,-1 N1,1 N2,0 N0,-2 N0,1 E2,1",
  },
  {
    id: 6,
    title: "The cloister road",
    teaches: "Wonders and roads together on a bigger board.",
    intro:
      "Two monasteries and a long road share this deck. A wonder wants to be surrounded, a road wants to run: one tile can help both, and not every tile has to be placed.",
    tip: "Only one of the two monasteries can be surrounded, so let the road wrap around that one.",
    seed: 6,
    deck: [P.CCCCCFFFC, P.WFFFFFFFF, P.RFFFRFCFR, P.RFRFFFFFR, P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFCCCFR, P.RFRFFFFFR, P.RFRFCCCFR, P.RFFFRFFFR, P.CFFFCFFFC],
    target: 1319,
    method: "best-known",
    line: "D N0,-1 N0,1 S0,-2 N-1,-1 W-1,-2 W1,0 E-1,0 N1,-2 E1,-1 N0,2",
    designer: "E0,1 N-1,1 N-1,0 E-2,0 N-1,2 W-2,1 N1,0 E-3,1 S1,1 N2,1 E0,2",
  },
  {
    id: 7,
    title: "Hill town",
    teaches: "City pieces of every shape: fitting them into one wall.",
    intro:
      "Nine of these tiles carry a city edge. Fit them into a few big cities, and keep the caps for the end.",
    tip: "Two small cities pay early; the big one grows from the tiles in the middle of the deck.",
    seed: 7,
    deck: [P.RFRFRFCFF, P.RFFFRFCFR, P.SFRFRFCFR, P.FFFFFFCFF, P.RFFFRFFFR, P.FFFFCCCFF, P.CFFFCFFFC, P.RFRFFFCFR, P.FFFFCCCFF, P.RFRFFFFFR, P.CCCCCFFFC],
    target: 2029,
    method: "best-known",
    line: "N0,1 N0,-1 W0,2 S0,-2 N-1,2 S1,2 E1,3 N1,4 E-1,1 N1,0 E2,3",
    designer: "N0,1 N1,0 S1,-1 N-1,1 N0,-1 N0,-2 N-1,2 S-1,0 E-2,0 E-1,-1 W-2,-1",
  },
  {
    id: 8,
    title: "Roads by the walls",
    teaches: "Roads that run along cities: two structures on one tile.",
    intro:
      "Many of these tiles carry a road and a city edge together. Place each one so that both keep growing.",
    tip: "The city tiles come early: stack them above the starter before the roads take the room.",
    seed: 8,
    deck: [P.RFRFFFCFR, P.SFRFRFCFR, P.RFFFRFFFR, P.CFFFCFFFC, P.FFCFFFCFF, P.FFFFFFCFF, P.RFRFFFFFR, P.RFFFRFCFR, P.RFRFFFCFR, P.RFFFRFFFR, P.RFRFCCCFR, P.CFFFCFFFC],
    target: 2962,
    method: "best-known",
    line: "N0,1 S0,2 N-1,1 E0,3 N0,4 N0,5 E-2,1 S-1,2 S-2,2 N1,2 N1,0 E-1,3",
    designer: "N0,1 N1,0 E1,1 N0,-1 E0,-2 E1,-2 E-1,0 W-1,-2 S-1,1 E0,2 S0,3 N0,-3",
  },
  {
    id: 9,
    title: "City walls",
    teaches: "A city-heavy deck: big cities and their size bonus.",
    intro:
      "Cities, and more cities. Each tile adds 2.35 % to a structure's value: a city of eight is worth far more than two cities of four.",
    tip: "The lone monastery comes too late to be surrounded: put it out of the city's way.",
    seed: 9,
    deck: [P.RFRFCCCFR, P.FFCFFFCFF, P.RFRFFFCFR, P.CCCCCFFFC, P.RFRFCCCFR, P.CCCCCFFFC, P.FFCFFFCFF, P.RFRFRFCFF, P.CFFFCFFFC, P.WFFFFFFFF, P.CFFFCFFFC, P.SFRFRFCFR, P.RFRFCCCFR],
    target: 4385,
    method: "best-known",
    line: "S-1,0 N0,1 N0,2 W-1,1 N-2,1 N-2,0 E-3,0 N-1,2 E1,1 N0,-1 N-2,-1 S0,3 S-1,3",
    designer: "N1,0 N0,1 N0,2 S0,-1 E-1,0 N1,-1 E2,0 E3,0 N2,-1 N1,-2 N2,1 E3,-1 S0,3",
  },
  {
    id: 10,
    title: "Twin cloisters",
    teaches: "Two wonders back to back in a long deck.",
    intro:
      "Two monasteries arrive one after the other, in the middle of the deck. Build the board so that they have neighbours waiting.",
    tip: "Build your first tiles where the two monasteries can later sit in the middle of them.",
    seed: 10,
    deck: [P.FFFFCCCFF, P.FFFFFFCFF, P.RFRFFFFFR, P.CCCCCFRFC, P.RFFFRFFFR, P.FFFFCCCFF, P.WFFFFFFFF, P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFCCCFR, P.FFFFCCCFF, P.RFRFFFCFR, P.RFFFRFCFR],
    target: 2862,
    method: "best-known",
    line: "N0,1 E1,1 W-1,1 W-2,1 E2,1 S-1,2 N1,2 N0,2 E1,3 N-1,3 S0,3 S2,2 N2,3",
    designer: "N0,1 E1,1 W1,0 W-1,0 E1,-1 E0,-1 N2,0 N2,1 N1,-2 S0,-2 N2,-1 N0,-3 S0,-4",
  },
  {
    id: 11,
    title: "Crossings",
    teaches: "Junctions everywhere: splitting roads on purpose.",
    intro:
      "Two junctions, one of them a full crossroads, and ten road tiles. A crossroads ends every road that reaches it, so a short road between two of them scores quickly.",
    tip: "The full crossroads comes late: leave room for it where several roads meet.",
    seed: 11,
    deck: [P.FFFFCCCFF, P.FFCFFFCFF, P.CCCCCFRFC, P.SFRFRFFFR, P.CCCCCFFFC, P.WFFFFFFFF, P.RFFFRFCFR, P.RFRFFFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.WFFFFFFFR, P.RFRFFFCFR, P.SFRFRFRFR, P.RFFFRFFFR],
    target: 3641,
    method: "best-known",
    line: "N0,1 E1,1 W-1,0 N0,2 N2,1 N2,0 E3,1 S2,-1 W1,-1 E3,0 N1,0 N2,2 N3,-1 N0,-1",
    designer: "N0,1 E1,1 W-1,0 S1,0 W-1,1 N0,-1 E2,1 N2,0 E1,-1 N2,-1 W2,2 N3,-1 D E3,0",
  },
  {
    id: 12,
    title: "A long day",
    teaches: "Everything together, sixteen tiles: the campaign's longest game.",
    intro:
      "Sixteen tiles: three junctions, a monastery, cities and roads. Use the deck sheet, and go for the best score there is.",
    tip: "Three junctions come early and late: let the roads grow between them.",
    seed: 12,
    deck: [P.SFRFRFFFR, P.FFFFCCCFF, P.FFCFFFFFC, P.RFFFRFCFR, P.CCCCCFRFC, P.RFRFCCCFR, P.WFFFFFFFF, P.RFRFFFFFR, P.SFRFRFCFR, P.CFFFCFFFC, P.RFRFFFCFR, P.SFRFRFCFR, P.RFFFRFFFR, P.FFFFCCCFF, P.RFRFCCCFR],
    target: 4119,
    method: "best-known",
    line: "N1,0 E0,1 S-1,1 S-1,0 W-2,0 N2,0 N1,-1 W0,-1 S2,1 E2,-1 S1,1 N2,2 E0,-2 N1,-2 S2,-2",
    designer: "N1,0 N0,1 S0,-1 E1,1 W-1,0 S1,2 N2,1 N2,2 E2,3 N1,-1 E2,-1 S0,-2 N1,-2 N1,3 N0,-3",
  },
];
const DARK_FOREST_LEVELS: readonly StoryLevel[] = [
  {
    id: 1,
    title: "Under the canopy",
    teaches: "The same rules, in the deep woods: ten tiles to start.",
    intro:
      "The trees close in over the road. Ten tiles, the deck on the sheet: find the paths that the forest leaves open.",
    tip: "The monastery comes too late to be surrounded: keep the roads and the city open for the last tile.",
    seed: 13,
    deck: [P.RFRFFFFFR, P.CCCCCFFFC, P.RFFFRFFFR, P.SFRFRFFFR, P.FFFFFFCFF, P.WFFFFFFFF, P.RFFFRFFFR, P.FFFFCCCFF, P.RFRFRFCFF],
    target: 1122,
    method: "best-known",
    line: "S0,-1 E0,1 E-1,-1 W-1,1 N0,2 D E-1,-2 E1,1 S1,0",
    designer: "N1,0 E0,1 N-1,0 N-2,0 E-1,1 N0,-1 N-3,0 N1,-1 E1,1",
  },
  {
    id: 2,
    title: "The hermit",
    teaches: "A lone monastery and two junctions among the trees.",
    intro:
      "A hermit keeps a chapel deep in the wood. Two junctions split the old paths around it.",
    tip: "The hermit's monastery comes third: give it a quiet corner the next tiles can fill.",
    seed: 14,
    deck: [P.FFFFFFCFF, P.RFFFRFFFR, P.WFFFFFFFF, P.SFRFRFCFR, P.RFRFRFCFF, P.FFFFFFCFF, P.SFRFRFRFR, P.CCCCCFRFC, P.FFFFFFCFF, P.FFCFFFFFC],
    target: 2916,
    method: "best-known",
    line: "N0,1 N-1,0 N-1,1 E-2,0 S-2,1 N-2,2 N1,0 W-3,1 E0,2 E-1,2",
    designer: "N0,1 N1,0 N1,1 N2,0 S2,-1 E0,2 N-1,0 E3,0 W-1,2 E1,2",
  },
  {
    id: 3,
    title: "Woodcutters' track",
    teaches: "A long road through the trees, and the cities beside it.",
    intro:
      "The woodcutters cut one long track through the forest. Let it run, then close it where it pays most.",
    tip: "Nine tiles carry a road: one long track is worth more than three short ones.",
    seed: 15,
    deck: [P.RFFFRFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.CFFFCFFFC, P.CCCCCFRFC, P.RFRFFFFFR, P.CCCCCFRFC, P.FFFFCCCFF, P.WFFFFFFFR, P.SFRFRFCFR, P.RFFFRFCFR],
    target: 2231,
    method: "best-known",
    line: "N0,-1 N1,-1 N0,-2 E0,1 W-1,0 W1,0 W-1,-1 N0,2 N1,-2 S-1,-2 E1,2",
    designer: "N1,0 E-1,0 N2,0 E0,1 E3,0 W-1,1 W-2,1 W1,1 N0,-1 N0,2 N-1,-1",
  },
  {
    id: 4,
    title: "Twin shrines",
    teaches: "Two monasteries and a full city in a short deck.",
    intro:
      "Two shrines stand in a clearing, and a whole walled town comes late. Not all of them can have their room.",
    tip: "Of the two shrines, the second is the one the deck can surround: keep a quiet spot for it.",
    seed: 16,
    deck: [P.WFFFFFFFF, P.RFRFFFFFR, P.RFRFFFFFR, P.RFRFCCCFR, P.FFFFFFCFF, P.WFFFFFFFF, P.RFRFFFFFR, P.FFFFCCCFF, P.FFCFFFFFC, P.CCCCCCCCC, P.CCCCCFFFC],
    target: 1543,
    method: "best-known",
    line: "N0,-1 N1,0 S0,-2 E0,1 W-1,1 N1,-1 W1,-2 N2,0 E2,-2 N3,0 E2,-1",
    designer: "N0,-1 N1,0 E-1,0 S1,1 N1,-1 N-1,-1 S-1,1 N0,-2 N1,-2 N1,2 W-2,0",
  },
  {
    id: 5,
    title: "Charcoal burners",
    teaches: "Roads and cities woven together.",
    intro:
      "Smoke rises over the clearings. The burners' paths run between small towns: close them in turn.",
    tip: "Close the small cities as they come: the late tiles are mostly road.",
    seed: 17,
    deck: [P.RFRFFFFFR, P.RFRFCCCFR, P.RFFFRFFFR, P.CCCCCFRFC, P.FFFFCCCFF, P.SFRFRFCFR, P.FFFFCCCFF, P.RFFFRFFFR, P.CFFFCFFFC, P.RFFFRFFFR, P.FFFFCCCFF, P.RFRFFFFFR],
    target: 1443,
    method: "best-known",
    line: "S0,-1 E0,1 E-1,-1 E1,1 W-1,1 E0,2 N-1,2 E-2,-1 E-2,1 E-1,-2 E2,1 S-1,0",
    designer: "N1,0 E-1,0 E1,1 N-1,1 E0,1 E1,2 W0,2 E1,3 E-1,2 N2,2 N2,1 S1,4",
  },
  {
    id: 6,
    title: "Three chapels",
    teaches: "Three monasteries in thirteen tiles: not every one has to score.",
    intro:
      "Three chapels hide among the trees, and thirteen tiles will not surround them all. Choose the ones that can score.",
    tip: "Two chapels come close together: build them next to each other and let the third go if it must.",
    seed: 18,
    deck: [P.FFFFCCCFF, P.WFFFFFFFF, P.CCCCCFRFC, P.RFFFRFFFR, P.RFRFFFFFR, P.RFFFRFFFR, P.RFRFFFCFR, P.WFFFFFFFF, P.WFFFFFFFF, P.RFRFFFFFR, P.FFFFFFCFF, P.RFFFRFCFR],
    target: 2219,
    method: "best-known",
    line: "E0,1 N1,1 W-1,0 E2,1 N0,2 E2,0 S2,2 N1,2 N1,3 W1,0 N2,3 E0,3",
    designer: "N0,1 N-1,1 E1,0 N-1,0 E-2,0 E-2,1 S-2,2 N0,-1 N-1,-1 N-1,2 S0,2 N-2,3",
  },
  {
    id: 7,
    title: "Moss and stone",
    teaches: "Cities and wonders on mossy ground.",
    intro:
      "Old stone walls under the moss, and two monasteries. Close the walls, then fill the ground around the wonders.",
    tip: "The first monastery carries a road: put it at the end of one.",
    seed: 19,
    deck: [P.FFCFFFFFC, P.RFFFRFFFR, P.SFRFRFFFR, P.FFFFCCCFF, P.FFCFFFCFF, P.RFFFRFFFR, P.WFFFFFFFR, P.CCCCCFFFC, P.FFCFFFCFF, P.WFFFFFFFF, P.CCCCCFFFC, P.RFRFFFFFR, P.FFCFFFFFC],
    target: 3490,
    method: "best-known",
    line: "S0,1 E-1,1 E-1,2 S1,1 N1,2 E-1,3 N0,2 E2,1 N1,3 N0,3 S1,4 W-1,4 E0,4",
    designer: "S0,1 N1,0 N-1,0 S1,1 N1,2 E-1,1 N2,0 S1,-1 N1,3 N0,2 S2,-1 W-1,2 S1,4",
  },
  {
    id: 8,
    title: "The keep in the wood",
    teaches: "A city-heavy deck with a full city tile.",
    intro:
      "A keep rises in the middle of the wood. Most of these tiles carry its walls.",
    tip: "Close the keep with the caps that come early: the full city tile comes too late to help.",
    seed: 20,
    deck: [P.CCCCCFFFC, P.CFFFCFFFC, P.RFFFRFFFR, P.RFRFFFCFR, P.FFFFCCCFF, P.FFFFFFCFF, P.RFRFCCCFR, P.WFFFFFFFF, P.FFCFFFFFC, P.RFFFRFFFR, P.CCCCCCCCC, P.RFFFRFFFR, P.RFRFRFCFF],
    target: 2872,
    method: "best-known",
    line: "E0,1 N1,1 E-1,1 N0,2 S2,1 N2,2 S0,3 N1,2 S0,4 N2,3 D N1,3 W-1,3",
    designer: "E0,1 E0,2 N1,0 E-1,0 S1,1 W-2,0 N2,0 N0,-1 S1,-1 E-1,1 N2,-1 E-1,2 S1,-2",
  },
  {
    id: 9,
    title: "Wild hamlets",
    teaches: "Many small cities and two wonders.",
    intro:
      "Hamlets dot the forest, each behind its own wall. Two monasteries watch over them.",
    tip: "Ten tiles carry city edges: join hamlets into a town before you close them.",
    seed: 21,
    deck: [P.RFRFCCCFR, P.CCCCCFFFC, P.FFFFFFCFF, P.FFFFCCCFF, P.CFFFCFFFC, P.FFFFCCCFF, P.RFRFRFCFF, P.FFCFFFCFF, P.RFRFFFFFR, P.FFFFFFCFF, P.WFFFFFFFR, P.WFFFFFFFF, P.FFFFCCCFF, P.RFFFRFFFR],
    target: 4145,
    method: "best-known",
    line: "N0,1 N1,1 N1,2 E2,1 E2,0 W2,-1 E3,-1 E2,-2 W0,-1 W1,-2 N1,0 N1,-1 S1,3 E0,-2",
    designer: "N1,0 E0,1 N0,2 N0,-1 N2,0 S1,-1 E1,1 N0,-2 N2,1 E3,0 S-1,0 N-1,1 E-1,-1 E2,2",
  },
  {
    id: 10,
    title: "Lantern road",
    teaches: "A long deck of roads and cities.",
    intro:
      "Lanterns mark the road through the night wood. Roads and walls come in equal numbers.",
    tip: "The monastery comes second: put it beside the starter's road, where the deck will surround it.",
    seed: 22,
    deck: [P.CCCCCFRFC, P.WFFFFFFFF, P.FFFFCCCFF, P.RFRFCCCFR, P.FFCFFFFFC, P.RFRFRFCFF, P.SFRFRFFFR, P.RFRFCCCFR, P.RFFFRFFFR, P.RFRFFFFFR, P.FFFFCCCFF, P.RFRFFFFFR, P.FFFFCCCFF, P.RFRFCCCFR],
    target: 3748,
    method: "best-known",
    line: "W-1,0 N0,-1 E0,1 W1,0 S-1,1 S-1,-1 E1,-1 E1,-2 E-1,-2 N2,-2 N0,-2 W2,-1 S1,-3 W0,-3",
    designer: "E1,0 N0,-1 W1,-1 E-1,0 S0,1 S-1,1 N-2,1 S-2,2 N-3,1 E-4,1 S-1,-1 S-4,2 E1,1 N-1,2",
  },
  {
    id: 11,
    title: "The old city",
    teaches: "Sixteen tiles, a full city and two junctions: the largest walls of the campaign.",
    intro:
      "The forest has grown over an old city. Twelve tiles carry its walls: raise them again.",
    tip: "The full city tile comes fifth: build around it, and close the walls last.",
    seed: 23,
    deck: [P.RFRFCCCFR, P.CCCCCFRFC, P.CFFFCFFFC, P.FFFFFFCFF, P.CCCCCCCCC, P.RFRFFFCFR, P.RFRFFFCFR, P.CCCCCFFFC, P.SFRFRFCFR, P.FFFFCCCFF, P.FFFFCCCFF, P.RFRFFFFFR, P.SFRFRFFFR, P.CFFFCFFFC, P.RFFFRFFFR],
    target: 2716,
    method: "best-known",
    line: "N0,1 W-1,0 N1,1 E2,1 N-2,0 W1,0 E1,-1 N1,2 S2,-1 E2,0 N0,-1 N2,-2 S1,-2 E-1,-1 E3,1",
    designer: "N1,0 W-1,0 E0,1 N0,2 N2,0 S1,1 N2,1 W-1,1 E2,2 N1,2 E-1,2 S2,3 N3,3 E1,-1 N3,2",
  },
  {
    id: 12,
    title: "Heart of the forest",
    teaches: "Everything together, sixteen tiles: the campaign's finale.",
    intro:
      "At the heart of the forest, two monasteries, long roads and walled towns. Use the deck sheet, and go for the best score there is.",
    tip: "The two monasteries come in the middle of the deck: keep room for them near the centre.",
    seed: 24,
    deck: [P.RFRFFFFFR, P.FFFFCCCFF, P.RFFFRFFFR, P.FFCFFFFFC, P.RFRFFFFFR, P.WFFFFFFFF, P.RFRFCCCFR, P.WFFFFFFFF, P.CCCCCFFFC, P.RFRFFFFFR, P.FFFFCCCFF, P.RFFFRFFFR, P.RFRFCCCFR, P.RFRFFFCFR, P.FFCFFFCFF],
    target: 3086,
    method: "best-known",
    line: "S0,-1 E0,1 E-1,-1 E-1,1 W-2,-1 N-2,0 N-1,2 N-2,1 W-3,1 S-1,0 S-3,0 N-3,-1 N-3,2 E-2,2 E0,2",
    designer: "N1,0 N0,1 N-1,0 N-1,1 E-2,0 N0,-1 S1,1 N-1,-1 S0,-2 N2,1 N-1,-2 E2,2 W-2,1 N1,2 N-2,2",
  },
];

/** The first campaign: one rule per level, small decks, exact targets where the solver finishes. */
export const TUTORIAL: StoryCampaign = {
  id: 1,
  name: "Tutorial",
  summary: "Twelve short levels, one rule each: placing, turning, discarding, roads, cities, forests, wonders and planning ahead.",
  theme: DEFAULT_THEME,
  levels: TUTORIAL_LEVELS,
};

/** The second campaign: the Challenge's deck, frozen, from 9 tiles to 16. */
export const OPEN_COUNTRY: StoryCampaign = {
  id: 2,
  name: "Open Country",
  summary: "Longer games on the Challenge's own deck, from 9 tiles to 16.",
  theme: DEFAULT_THEME,
  levels: OPEN_COUNTRY_LEVELS,
};

/** The third campaign, the Forest theme's (theme 1): the Challenge's deck again, its own seeds, 10 to 16 tiles. */
export const DARK_FOREST: StoryCampaign = {
  id: 3,
  name: "Dark Forest",
  summary: "Twelve games in the deep woods, drawn in the Forest tiles: 10 to 16 tiles, chapels hidden among the trees.",
  theme: FOREST_THEME,
  levels: DARK_FOREST_LEVELS,
};

/** Every campaign, in the order they unlock. */
export const CAMPAIGNS: readonly StoryCampaign[] = [TUTORIAL, OPEN_COUNTRY, DARK_FOREST];
