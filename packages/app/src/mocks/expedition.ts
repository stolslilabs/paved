import { EXPEDITION_MAPS, EXPEDITION_TIERS, PlanType, expeditionEndsAt, expeditionWeekOf, expeditionWeekStart, type ExpeditionProgress } from "@paved/game-core";
import type { ExpeditionHandProps } from "../components/containers/expedition-hand";
import type { ExpeditionCard, PlayModesProps } from "../components/containers/play-modes";
import type { ExpeditionSceneProps } from "../components/scenes/expedition-scene";
import type { ExpeditionBoardState, ExpeditionResult, ExpeditionState } from "../data/expedition-source";
import { MOCK_NOW } from "./clock";

// The Expedition's mocks (the weekly individual event, the design proposal of 2026-11-09): the proposal's own week on the autumn map,
// The Sacred Wood, on Wednesday: 15 tiles laid, 3 in hand, 24 to come, the villages linked, 3,223 points, 777 to go to Scout; the
// week's states (before the first visit, a new day's tiles waiting, the board, the last tier), last week's result (to claim, under
// level 3, claimed, no tier), the Play card's states and the board's strip.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = expeditionWeekOf(MOCK_NOW);
const ENDS = expeditionEndsAt(WEEK);
/** The mocks' clock: Wednesday 06:00 UTC, 4 d 18 h left. */
export const EXPEDITION_NOW = expeditionWeekStart(WEEK) + 2 * 86_400 + 6 * 3_600;

const MAP = EXPEDITION_MAPS.autumn;
const progress = (done: readonly string[], ruin: number): ExpeditionProgress[] => MAP.objectives.map((o) => ({ ...o, done: done.includes(o.id), ...(o.kind === "surround" ? { count: ruin, of: 8 } : {}) }));
const [SCOUT, , EXPLORER, CARTOGRAPHER] = EXPEDITION_TIERS as [(typeof EXPEDITION_TIERS)[number], (typeof EXPEDITION_TIERS)[number], (typeof EXPEDITION_TIERS)[number], (typeof EXPEDITION_TIERS)[number]];

const NO_DAY = { drawn: 0, lost: 0, laid: 0, discarded: 0 };
const BOARD: ExpeditionBoardState = {
  score: 3_223,
  boardScore: 2_323,
  bonus: 900,
  hand: 3,
  laid: 15,
  toCome: 24,
  due: { drawn: 0, lost: 0 },
  objectives: progress(["villages"], 3),
  days: [{ drawn: 6, lost: 0, laid: 6, discarded: 0 }, { drawn: 6, lost: 0, laid: 5, discarded: 0 }, { drawn: 6, lost: 0, laid: 4, discarded: 0 }, NO_DAY, NO_DAY, NO_DAY, NO_DAY],
  tier: null,
  next: SCOUT,
};

const RESULT: ExpeditionResult = {
  week: WEEK - 1,
  season: "summer",
  map: EXPEDITION_MAPS.summer.name,
  score: 8_412,
  boardScore: 6_612,
  bonus: 1_800,
  tier: EXPLORER,
  landmarks: [
    { id: "crossroads", title: "Reach the old crossroads", done: true, share: 0.78 },
    { id: "ruin", title: "Surround the ruin", done: true, share: 0.41 },
    { id: "villages", title: "Link the two villages", done: true, share: 0.27 },
    { id: "landmark", title: "Surround the great wonder", done: false, share: 0.09 },
  ],
  explorers: 3_912,
  cobbles: EXPLORER.cobbles,
  claimed: false,
};

const WEEK_STATE: ExpeditionState = { week: WEEK, season: "autumn", map: MAP.name, day: 2, endsAt: ENDS, board: BOARD, level: 7, result: null };
const at = { now: EXPEDITION_NOW };

/** The Expedition's view (`ExpeditionScene`), one entry per state. */
export const EXPEDITION = {
  loading: { state: null, ...at },
  failed: { state: null, error: "The week could not be read.", ...at },
  firstVisit: { state: { ...WEEK_STATE, board: null }, ...at },
  opening: { state: { ...WEEK_STATE, board: null }, busy: "open", ...at },
  board: { state: WEEK_STATE, ...at },
  newDay: { state: { ...WEEK_STATE, board: { ...BOARD, hand: 1, due: { drawn: 6, lost: 0 } } }, ...at },
  missedDays: { state: { ...WEEK_STATE, day: 5, board: { ...BOARD, hand: 2, due: { drawn: 10, lost: 8 }, days: BOARD.days.map((d, i) => (i === 4 ? { ...d, lost: 2 } : d)) } }, ...at },
  cartographer: { state: { ...WEEK_STATE, day: 6, board: { ...BOARD, score: 10_480, boardScore: 7_180, bonus: 3_300, hand: 0, laid: 40, toCome: 0, objectives: progress(["crossroads", "ruin", "villages", "landmark"], 8), tier: CARTOGRAPHER, next: null } }, ...at },
  result: { state: { ...WEEK_STATE, board: null, result: RESULT }, ...at },
  resultLocked: { state: { ...WEEK_STATE, board: null, level: 1, result: RESULT }, ...at },
  resultClaimed: { state: { ...WEEK_STATE, result: { ...RESULT, claimed: true } }, ...at },
  resultNoTier: { state: { ...WEEK_STATE, board: null, result: { ...RESULT, score: 2_140, boardScore: 1_840, bonus: 300, tier: null, cobbles: 0, landmarks: RESULT.landmarks.map((l, i) => ({ ...l, done: i === 0 })) } }, ...at },
} satisfies Record<string, Data<ExpeditionSceneProps>>;

const card = (c: ExpeditionCard) => ({ expeditionCard: c, now: EXPEDITION_NOW });

/** The Play card's states (`PlayModes`' Limited): before the first visit, a new day's tiles waiting, the board in play. */
export const EXPEDITION_CARD = {
  firstVisit: card({ map: MAP.name, day: 2, endsAt: ENDS, board: null }),
  newDay: card({ map: MAP.name, day: 2, endsAt: ENDS, board: { score: 1_500, hand: 1, due: 6 } }),
  playing: card({ map: MAP.name, day: 2, endsAt: ENDS, board: { score: 3_223, hand: 3, due: 0 } }),
} satisfies Record<string, Pick<PlayModesProps, "expeditionCard" | "now">>;

const plan = (p: PlanType) => Object.values(PlanType).indexOf(p);
const HAND = [PlanType.RFFFRFFFR, PlanType.RFFFRFFFR, PlanType.RFRFFFFFR, PlanType.FFFFFFCFF, PlanType.WFFFFFFFF].map((p, card) => ({ card, plan: plan(p) }));
const FULL = Array.from({ length: 12 }, (_, card) => ({ card, plan: plan([PlanType.RFFFRFFFR, PlanType.RFRFFFFFR, PlanType.FFFFCCCFF, PlanType.SFRFRFFFR][card % 4]!) }));

/** The board's strip (`ExpeditionHand`): five tiles with one picked, a full hand of twelve, an empty hand, the week's bag drawn, read only. */
export const EXPEDITION_HAND = {
  five: { hand: HAND, selected: 1, toCome: 24, objectives: progress(["villages"], 3), map: MAP.name },
  full: { hand: FULL, selected: 0, toCome: 18, objectives: progress([], 0) },
  empty: { hand: [], selected: null, toCome: 24, objectives: progress(["crossroads", "villages"], 5) },
  bagDrawn: { hand: [], selected: null, toCome: 0, objectives: progress(["crossroads", "ruin", "villages", "landmark"], 8) },
  readOnly: { hand: HAND, selected: null, toCome: 0, objectives: progress(["crossroads"], 2), disabled: true },
} satisfies Record<string, Data<ExpeditionHandProps>>;
