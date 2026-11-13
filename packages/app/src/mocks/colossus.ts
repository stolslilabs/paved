import { COLOSSUS_DAY_S, colossusWeekOf, colossusWeekStart } from "@paved/game-core";
import type { ColossusBoardProps } from "../components/containers/colossus-board";
import type { ColossusPlaqueProps } from "../components/containers/colossus-plaque";
import type { ColossusCard, PlayModesProps } from "../components/containers/play-modes";
import type { ColossusSceneProps } from "../components/scenes/colossus-scene";
import type { ColossusPlaced, ColossusResult, ColossusState } from "../data/colossus-source";
import { boardOf, buildersOf, freshColossus, optionsOf, place, stateOf, type StoredColossus } from "../data/mock/colossus";
import { communityProfile } from "../data/mock/community";
import type { PublicProfile } from "../data/social-source";
import { MOCK_NOW } from "./clock";

// The Colossus's mocks (the weekly collective event, the design proposal of 2026-11-10), drawn from the mock's own week (the
// community's builders, `data/mock/colossus.ts`), so every figure holds together: a Thursday evening with the viewer nine tiles in,
// the same week on its Monday for a newcomer, the builders, a district with a tile picked, the heart, a tile just laid, last week's
// plaque claimed or not, and the Play card.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = colossusWeekOf(MOCK_NOW);
const START = colossusWeekStart(WEEK);
/** The mocks' clocks: Monday noon, and Thursday 18:00 (3 d 6 h left). */
export const COLOSSUS_MONDAY_NOW = START + 12 * 3_600;
export const COLOSSUS_NOW = START + 3 * COLOSSUS_DAY_S + 18 * 3_600;

/** The viewer: a device's account, named. */
export const COLOSSUS_ME = "0x51a7c0";
const people = (address: string): PublicProfile => communityProfile(address, MOCK_NOW) ?? { address, name: "Mason", look: null, level: 12, crowns: 640, league: 3, score: 4_210, lastSeen: MOCK_NOW };

/** The viewer's best placement of their first tile that fits, at `now`: the one that sets the most stones. */
function best(stored: StoredColossus, now: number) {
  const state = stateOf(stored, people, now, COLOSSUS_ME);
  for (const card of state.me!.hand) {
    let found: { card: number; board: number; x: number; y: number; orientation: number; stones: number } | null = null;
    for (const lot of state.lots) {
      if (lot.holes === 0 || (lot.heart && (!state.heartOpen || found))) continue;
      for (const p of optionsOf(stored, now, COLOSSUS_ME, lot.board, card.card).placements) if (!found || p.stones > found.stones) found = { card: card.card, board: lot.board, ...p };
    }
    if (found) return found;
  }
  return null;
}

/** The viewer's week so far: three tiles a day from Monday to Wednesday, each where it sets the most stones. */
const stored = freshColossus();
for (let day = 0; day < 3; day++) {
  for (let i = 0; i < 3; i++) {
    const now = START + day * COLOSSUS_DAY_S + 20 * 3_600 + i * 60;
    const tile = best(stored, now);
    if (tile) place(stored, COLOSSUS_ME, tile, now);
  }
}

const STATE: ColossusState = stateOf(stored, people, COLOSSUS_NOW, COLOSSUS_ME);
const BUILDERS = buildersOf(stored, people, COLOSSUS_NOW, COLOSSUS_ME);
/** The tile the viewer lays next, its board before and after, and what it did. */
const NEXT = best(stored, COLOSSUS_NOW)!;
const BOARD = boardOf(stored, COLOSSUS_NOW, COLOSSUS_ME, NEXT.board)!;
const OPTIONS = optionsOf(stored, COLOSSUS_NOW, COLOSSUS_ME, NEXT.board, NEXT.card);
const HEART = boardOf(stored, COLOSSUS_NOW, COLOSSUS_ME, 0)!;
const after = structuredClone(stored);
const PLACED: ColossusPlaced = place(after, COLOSSUS_ME, NEXT, COLOSSUS_NOW).placed;
const BOARD_AFTER = boardOf(after, COLOSSUS_NOW, COLOSSUS_ME, NEXT.board)!;
const NEWCOMER: ColossusState = stateOf(freshColossus(), people, COLOSSUS_MONDAY_NOW, COLOSSUS_ME);

/** Last week's Colossus with the viewer in it: 96th of the proposal's screen becomes the plaque's fourth here, tiers and place to claim. */
const RESULT: ColossusResult = {
  ...STATE.result,
  plaque: STATE.result.plaque.map((row, i) => (i === 3 ? { ...row, me: true } : row)),
  me: { place: 4, tiles: 15, stones: STATE.result.plaque[3]?.stones ?? 20, named: true, cobbles: 125, toClaim: 125 },
};

const at = { now: COLOSSUS_NOW } as const;

/** The scene's states, one key each. */
export const COLOSSUS = {
  loading: { state: null, ...at },
  failed: { state: null, error: "The Colossus could not be read.", ...at },
  site: { state: STATE, ...at },
  newcomer: { state: NEWCOMER, now: COLOSSUS_MONDAY_NOW },
  guest: { state: { ...NEWCOMER, me: null }, now: COLOSSUS_MONDAY_NOW },
  toClaim: { state: { ...STATE, result: RESULT }, ...at },
  claiming: { state: { ...STATE, result: RESULT }, busy: "claim", ...at },
  builders: { state: STATE, view: "builders", builders: BUILDERS, ...at },
  buildersLoading: { state: STATE, view: "builders", builders: null, ...at },
  board: { state: STATE, view: "board", board: BOARD, selected: null, options: null, ...at },
  picked: { state: STATE, view: "board", board: BOARD, selected: NEXT.card, options: OPTIONS, ...at },
  placed: { state: STATE, view: "board", board: BOARD_AFTER, selected: null, options: null, placed: PLACED, ...at },
  heart: { state: STATE, view: "board", board: HEART, selected: null, options: null, ...at },
} satisfies Record<string, Data<ColossusSceneProps>>;

/** The tile the `picked` state lays (the tests tap its cell). */
export const COLOSSUS_NEXT = NEXT;

/** The board's states (`ColossusBoard`). */
export const COLOSSUS_BOARD = {
  idle: { board: BOARD, day: STATE.day, selected: null, options: null },
  picked: { board: BOARD, day: STATE.day, selected: NEXT.card, options: OPTIONS },
  reading: { board: BOARD, day: STATE.day, selected: NEXT.card, options: null },
  busy: { board: BOARD, day: STATE.day, selected: NEXT.card, options: OPTIONS, busy: true },
  heart: { board: HEART, day: STATE.day, selected: null, options: null },
  emptyHand: { board: { ...BOARD, hand: [] }, day: STATE.day, selected: null, options: null },
} satisfies Record<string, Data<ColossusBoardProps>>;

/** Last week's plaque (`ColossusPlaque`): the viewer absent, with their Cobbles to claim, and claimed. */
export const COLOSSUS_PLAQUE = {
  absent: { result: { ...STATE.result, me: null } },
  toClaim: { result: RESULT },
  claimed: { result: { ...RESULT, me: { ...RESULT.me!, toClaim: 0 } } },
  short: { result: { ...RESULT, completedAt: null, capstone: null, stones: Math.floor(RESULT.cells * 0.83) } },
} satisfies Record<string, Data<ColossusPlaqueProps>>;

const card = (c: ColossusCard, now: number) => ({ colossusCard: c, now });

/** The Play card's states (`PlayModes`' Limited): the week with tiles in hand, and without an account. */
export const COLOSSUS_CARD = {
  week: card({ day: STATE.day, endsAt: STATE.endsAt, monument: STATE.monument, stones: STATE.stones, cells: STATE.cells, hand: STATE.me!.hand.length }, COLOSSUS_NOW),
  guest: card({ day: 0, endsAt: STATE.endsAt, monument: STATE.monument, stones: NEWCOMER.stones, cells: NEWCOMER.cells, hand: null }, COLOSSUS_MONDAY_NOW),
} satisfies Record<string, Pick<PlayModesProps, "colossusCard" | "now">>;
