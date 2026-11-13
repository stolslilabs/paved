import { MASTERPIECE_TIERS, masterpieceEndsAt, masterpieceWeekOf, masterpieceWeekStart } from "@paved/game-core";
import type { MasterpieceStripProps } from "../components/containers/masterpiece-strip";
import type { MasterpieceCard, PlayModesProps } from "../components/containers/play-modes";
import type { MasterpieceSceneProps } from "../components/scenes/masterpiece-scene";
import type { MasterpieceBoardState, MasterpieceRanking, MasterpieceResult, MasterpieceState } from "../data/masterpiece-source";
import { MOCK_NOW } from "./clock";

// The Masterpiece's mocks (the weekly individual event, the design proposal of 2026-11-09): the proposal's own winter week, the city's,
// on Wednesday: a city of 14 closed for 3,873 less a discard, an open city of 22 worth 7,327 if closed now, 31 tiles played, 5
// waiting, 48 to come; Saturday's city of 31; Monday's result (top 5 %, 212th of 5,840, Mira the week's master); the live ranking
// and the Hall; the Play card's states and the board's strip.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = masterpieceWeekOf(MOCK_NOW);
const ENDS = masterpieceEndsAt(WEEK);
/** The mocks' clock: Wednesday 20:00 UTC, 4 d 4 h left. */
export const MASTERPIECE_NOW = masterpieceWeekStart(WEEK) + 2 * 86_400 + 20 * 3_600;

const [TOP1, TOP5, TOP20, TOP50, COUNTED] = MASTERPIECE_TIERS as [(typeof MASTERPIECE_TIERS)[number], (typeof MASTERPIECE_TIERS)[number], (typeof MASTERPIECE_TIERS)[number], (typeof MASTERPIECE_TIERS)[number], (typeof MASTERPIECE_TIERS)[number]];
/** The longest name a player may take (20 characters): a row must hold it. */
const LONGEST = "WWWWWWWWWWWWWWWWWW88";

const BOARD: MasterpieceBoardState = {
  piece: { kind: "city", size: 14, points: 3_873 },
  score: 3_823,
  discards: 1,
  counted: true,
  prospect: { size: 22, open: 4, worth: 7_327 },
  played: 31,
  laid: 30,
  waiting: 5,
  toCome: 48,
  days: [12, 12, 7, 0, 0, 0, 0],
  place: 1_402,
  tier: TOP50,
};

const SATURDAY: MasterpieceBoardState = { piece: { kind: "city", size: 31, points: 12_721 }, score: 12_621, discards: 2, counted: true, prospect: null, played: 72, laid: 70, waiting: 0, toCome: 12, days: [12, 12, 12, 12, 12, 12, 0], place: 188, tier: TOP5 };

const RESULT: MasterpieceResult = {
  week: WEEK - 1,
  season: "winter",
  kind: "city",
  piece: { kind: "city", size: 31, points: 12_721 },
  score: 12_621,
  discards: 2,
  place: 212,
  builders: 5_840,
  tier: TOP5,
  master: { place: 1, name: "Mira", size: 46, score: 26_726, me: false },
  cobbles: TOP5.cobbles,
  claimed: false,
};

const WEEK_STATE: MasterpieceState = { week: WEEK, season: "winter", kind: "city", day: 2, endsAt: ENDS, builders: 3_120, board: BOARD, result: null };

const RANKING: MasterpieceRanking = {
  week: WEEK,
  kind: "city",
  builders: 5_112,
  top: (
    [
      ["Mira", 46, 26_726],
      ["CopperShire38", 44, 24_390],
      [LONGEST, 41, 21_300],
      ["StonyThistle23", 40, 20_260],
      ["HeartyQuay24", 38, 18_341],
      ["JauntyQuarry45", 37, 17_420],
      ["TopazBadger06", 36, 16_560],
      ["CraftyChapel37", 35, 15_770],
      ["LilacVillage66", 34, 14_950],
      ["MightyTinker46", 33, 14_210],
    ] as const
  ).map(([name, size, score], i) => ({ place: i + 1, name, size, score, me: false })),
  me: { place: 188, name: "Stonewright", size: 31, score: 12_621, me: true },
  bars: [
    { tier: TOP1, from: 20_100 },
    { tier: TOP5, from: 11_900 },
    { tier: TOP20, from: 7_000 },
    { tier: TOP50, from: 3_700 },
    { tier: COUNTED, from: 1_876 },
  ],
  hall: [
    { kind: "city", season: "winter", week: WEEK - 4, name: "Mira", size: 46, score: 26_726, me: false },
    { kind: "road", season: "spring", week: WEEK - 3, name: LONGEST, size: 39, score: 9_640, me: false },
    { kind: "wonder", season: "summer", week: WEEK - 2, name: "Stonewright", size: 33, score: 9_480, me: true },
    { kind: "forest", season: "autumn", week: WEEK - 1, name: "GustyPike69", size: 28, score: 11_500, me: false },
  ],
};

const at = { now: MASTERPIECE_NOW };

/** The Masterpiece's view (`MasterpieceScene`), one entry per state. */
export const MASTERPIECE = {
  loading: { state: null, ...at },
  failed: { state: null, error: "The week could not be read.", ...at },
  firstVisit: { state: { ...WEEK_STATE, board: null }, ...at },
  opening: { state: { ...WEEK_STATE, board: null }, busy: "open", ...at },
  board: { state: WEEK_STATE, ...at },
  nothingClosed: { state: { ...WEEK_STATE, day: 0, board: { ...BOARD, piece: null, score: 0, discards: 0, counted: false, prospect: { size: 3, open: 5, worth: 643 }, played: 4, laid: 4, waiting: 8, toCome: 72, days: [4, 0, 0, 0, 0, 0, 0], place: null, tier: null } }, ...at },
  notCounted: { state: { ...WEEK_STATE, board: { ...BOARD, piece: { kind: "city", size: 5, points: 1_123 }, score: 1_123, discards: 0, counted: false, place: null, tier: null } }, ...at },
  saturday: { state: { ...WEEK_STATE, day: 5, builders: 4_690, board: SATURDAY }, ...at },
  wonder: { state: { ...WEEK_STATE, season: "summer", kind: "wonder", board: { ...BOARD, piece: { kind: "wonder", size: 15, points: 2_279 }, score: 2_229, prospect: { size: 9, open: 2, worth: 900 } } }, ...at },
  result: { state: { ...WEEK_STATE, day: 0, board: null, result: RESULT }, ...at },
  claiming: { state: { ...WEEK_STATE, day: 0, board: null, result: RESULT }, busy: "claim", ...at },
  resultClaimed: { state: { ...WEEK_STATE, result: { ...RESULT, claimed: true } }, ...at },
  resultMaster: { state: { ...WEEK_STATE, day: 0, board: null, result: { ...RESULT, piece: { kind: "city", size: 47, points: 27_950 }, score: 27_950, discards: 0, place: 1, tier: TOP1, cobbles: TOP1.cobbles, master: { place: 1, name: "Stonewright", size: 47, score: 27_950, me: true } } }, ...at },
  resultNotCounted: { state: { ...WEEK_STATE, day: 0, board: null, result: { ...RESULT, piece: { kind: "city", size: 5, points: 1_123 }, score: 1_123, discards: 0, place: null, tier: null, cobbles: 0, master: { ...RESULT.master!, name: LONGEST } } }, ...at },
  resultNothing: { state: { ...WEEK_STATE, day: 0, board: null, result: { ...RESULT, piece: null, score: 0, discards: 3, place: null, tier: null, cobbles: 0 } }, ...at },
  ranking: { state: WEEK_STATE, view: "ranking", ranking: RANKING, ...at },
  rankingTop: { state: WEEK_STATE, view: "ranking", ranking: { ...RANKING, top: RANKING.top.map((r, i) => (i === 2 ? { ...r, name: "Stonewright", me: true } : r)), me: null }, ...at },
  rankingEmpty: { state: WEEK_STATE, view: "ranking", ranking: { ...RANKING, builders: 0, top: [], me: null, bars: RANKING.bars.map((b) => ({ ...b, from: null })), hall: [] }, ...at },
  rankingLoading: { state: WEEK_STATE, view: "ranking", ranking: null, ...at },
} satisfies Record<string, Data<MasterpieceSceneProps>>;

const card = (c: MasterpieceCard) => ({ masterpieceCard: c, now: MASTERPIECE_NOW });

/** The Play card's states (`PlayModes`' Limited): before the first visit, tiles waiting with nothing closed, with a piece, the day's tiles played. */
export const MASTERPIECE_CARD = {
  firstVisit: card({ kind: "city", day: 2, endsAt: ENDS, board: null }),
  nothingClosed: card({ kind: "city", day: 0, endsAt: ENDS, board: { waiting: 8, size: null, score: 0 } }),
  waiting: card({ kind: "city", day: 2, endsAt: ENDS, board: { waiting: 5, size: 14, score: 3_823 } }),
  played: card({ kind: "crowned wonder", day: 5, endsAt: ENDS, board: { waiting: 0, size: 31, score: 12_621 } }),
} satisfies Record<string, Pick<PlayModesProps, "masterpieceCard" | "now">>;

/** The board's strip (`MasterpieceStrip`): nothing closed, a piece and an open structure, a piece alone, the week's tiles played. */
export const MASTERPIECE_STRIP = {
  nothingClosed: { kind: "city", piece: null, prospect: { size: 3, open: 5, worth: 643 }, waiting: 8, toCome: 72 },
  growing: { kind: "city", piece: BOARD.piece, prospect: BOARD.prospect, waiting: 5, toCome: 48 },
  closed: { kind: "city", piece: SATURDAY.piece, prospect: null, waiting: 0, toCome: 12 },
  wonder: { kind: "wonder", piece: { kind: "wonder", size: 15, points: 2_279 }, prospect: { size: 9, open: 2, worth: 900 }, waiting: 12, toCome: 0 },
} satisfies Record<string, Data<MasterpieceStripProps>>;
