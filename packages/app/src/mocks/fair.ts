import { FairDraft, fairEndsAt, fairIsMythic, fairRandomOf, fairWeekOf, fairWeekStart } from "@paved/game-core";
import type { FairEndProps } from "../components/containers/fair-end";
import type { FairCard, PlayModesProps } from "../components/containers/play-modes";
import type { FairDraftView, FairSceneProps } from "../components/scenes/fair-scene";
import type { FairRanking, FairResult, FairState } from "../data/fair-source";
import { community, communityProfile } from "../data/mock/community";
import type { PublicProfile } from "../data/social-source";
import { MOCK_NOW } from "./clock";

// The Fair's mocks (the weekly individual event, the design proposal of 2026-11-09): the proposal's own week, a spring Fair on its
// Thursday, the viewer 172nd with a best of 4,932 and two tries left; the week's states (a first visit, a draft and a game open, no
// try left, a best under the floor), last week's result with its champion's deck, the draft (a plain offer, a mythic on the table,
// the last offer), the live ranking, the Play card's states and a try's ends.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = fairWeekOf(MOCK_NOW);
const ENDS = fairEndsAt(WEEK);
/** The mocks' clock: Thursday 15:00 UTC, 3 d 9 h left. */
export const FAIR_NOW = fairWeekStart(WEEK) + 3 * 86_400 + 15 * 3_600;

const PLAYERS: readonly PublicProfile[] = community().map((m) => communityProfile(m.address, MOCK_NOW)!);
/** The viewer: the community's fifth player. */
export const FAIR_ME = PLAYERS[4]!.address;
/** A legal name of the most and widest letters (WRAP360). */
const LONGEST: PublicProfile = { ...PLAYERS[0]!, name: "W".repeat(PLAYERS.reduce((max, p) => Math.max(max, p.name?.length ?? 0), 16)) };

/** A spring draft of `seed` answered to offer `until` (the whole draft by default): the stall's tile, a mythic when `mythics`. */
function drafted(seed: bigint, mythics: boolean, until = Infinity): FairDraft {
  const draft = new FairDraft("spring", fairRandomOf(seed));
  while (!draft.over && draft.offer!.number < until) {
    const mythic = draft.offer!.cards.findIndex(fairIsMythic);
    const plain = draft.offer!.cards.findIndex((card) => !fairIsMythic(card));
    draft.pick(mythics && mythic >= 0 ? mythic : Math.max(0, plain));
  }
  return draft;
}
const viewOf = (draft: FairDraft): FairDraftView => ({ offer: draft.offer!, next: draft.next, deck: [...draft.deck], passed: draft.passed.length, season: "spring" });

/** The first seed whose draft, answered to an offer of `until`, shows what `wanted` asks of it. */
function draftWhere(until: number, wanted: (draft: FairDraft) => boolean): FairDraft {
  for (let seed = 1n; seed < 500n; seed++) {
    const draft = drafted(seed, false, until);
    if (!draft.over && wanted(draft)) return draft;
  }
  return drafted(1n, false, until);
}

const CHAMPION_DECK = drafted(42n, true).deck;

const RESULT: FairResult = { week: WEEK - 1, season: "spring", players: 5_236, best: 4_932, place: 183, tier: 1, cobbles: 150, claimed: false, champion: { profile: PLAYERS[0]!, score: 6_688, cards: CHAMPION_DECK } };

const BASE = { week: WEEK, season: "spring", day: 3, dayEndsAt: fairWeekStart(WEEK) + 4 * 86_400, endsAt: ENDS, players: 3_410 } as const;
const WEEK_STATE: FairState = { ...BASE, me: { triesToday: 1, triesLeft: 2, open: null, best: 4_932, place: 172, tier: 1 }, result: null };
const FRESH: FairState = { ...BASE, me: { triesToday: 0, triesLeft: 3, open: null, best: null, place: null, tier: null }, result: null };

const SCORES = [6_688, 6_541, 6_412, 6_250, 6_190, 6_020, 5_980, 5_870, 5_760, 5_640, 5_530, 5_410];
const RANKING: FairRanking = {
  week: WEEK,
  players: 3_410,
  entries: SCORES.map((score, i) => ({ profile: i === 3 ? LONGEST : PLAYERS[i]!, score, place: i + 1, tier: i < 2 ? 0 : 1 })),
  me: { place: 172, score: 4_932, tier: 2 },
  bars: [6_420, 4_700, 3_650, 2_480, 1_000],
};

const base = { now: FAIR_NOW, me: FAIR_ME } as const;

/** The Fair view's states (`FairScene`). */
export const FAIR = {
  loading: { state: null, ...base },
  failed: { state: null, error: "The Fair could not be read.", ...base },
  first: { state: FRESH, ...base },
  week: { state: WEEK_STATE, ...base },
  starting: { state: WEEK_STATE, busy: "start", ...base },
  drafting: { state: { ...WEEK_STATE, me: { ...WEEK_STATE.me!, triesToday: 2, triesLeft: 1, open: { id: 7, stage: "draft", offers: 8, tiles: 8, score: 0 } } }, ...base },
  playing: { state: { ...WEEK_STATE, me: { ...WEEK_STATE.me!, triesToday: 2, triesLeft: 1, open: { id: 7, stage: "game", offers: 20, tiles: 19, score: 3_193 } } }, ...base },
  noTryLeft: { state: { ...WEEK_STATE, me: { ...WEEK_STATE.me!, triesToday: 3, triesLeft: 0 } }, ...base },
  underFloor: { state: { ...WEEK_STATE, me: { ...WEEK_STATE.me!, best: 840, place: null, tier: null } }, ...base },
  guest: { state: { ...BASE, me: null, result: null }, ...base, me: null },
  result: { state: { ...FRESH, day: 0, result: RESULT }, ...base },
  claiming: { state: { ...FRESH, day: 0, result: RESULT }, busy: "claim", ...base },
  claimed: { state: { ...FRESH, day: 0, result: { ...RESULT, claimed: true, champion: { ...RESULT.champion!, profile: LONGEST } } }, ...base },
  notCounted: { state: { ...FRESH, day: 0, result: { ...RESULT, best: 840, place: null, tier: null, cobbles: 0 } }, ...base },
  draft: { state: WEEK_STATE, view: "draft", draft: viewOf(draftWhere(9, (d) => !d.offer!.cards.some(fairIsMythic))), ...base },
  draftFirst: { state: WEEK_STATE, view: "draft", draft: viewOf(drafted(3n, false, 1)), ...base },
  draftMythic: { state: WEEK_STATE, view: "draft", draft: viewOf(draftWhere(11, (d) => d.offer!.cards.some(fairIsMythic))), ...base },
  draftLast: { state: WEEK_STATE, view: "draft", draft: viewOf(drafted(42n, true, 20)), ...base },
  draftLoading: { state: WEEK_STATE, view: "draft", draft: null, ...base },
  ranking: { state: WEEK_STATE, view: "ranking", ranking: RANKING, ...base },
  rankingEmpty: { state: FRESH, view: "ranking", ranking: { week: WEEK, players: 0, entries: [], me: null, bars: [null, null, null, null, null] }, ...base },
  rankingLoading: { state: WEEK_STATE, view: "ranking", ranking: null, ...base },
} satisfies Record<string, Data<FairSceneProps>>;

const card = (c: FairCard) => ({ fairCard: c, now: FAIR_NOW });
const CARD: FairCard = { day: 3, stall: "roads", endsAt: ENDS, me: { triesLeft: 2, best: 4_932 }, playing: null };

/** The Play card's states (`PlayModes`' Limited): the week, the last try of the day, none left, a draft open, a game in play, no account. */
export const FAIR_CARD = {
  week: card(CARD),
  lastTry: card({ ...CARD, me: { triesLeft: 1, best: 4_932 } }),
  noTryLeft: card({ ...CARD, me: { triesLeft: 0, best: 4_932 } }),
  drafting: card({ ...CARD, playing: { stage: "draft", offers: 8 } }),
  playing: card({ ...CARD, playing: { stage: "game", score: 3_193 } }),
  guest: card({ ...CARD, me: null }),
} satisfies Record<string, Pick<PlayModesProps, "fairCard" | "now">>;

const END = { closings: [] } as const;
const RESULT_BASE = { tryId: 7, try: 2, left: 1, players: 3_410, late: false } as const;

/** A try's ends (`FairEnd`): the week's first, a new best, below the best, under the floor, the day's last try, too late. */
export const FAIR_END = {
  reading: { ...END, score: 3_640, result: null },
  first: { ...END, score: 3_640, result: { ...RESULT_BASE, try: 1, left: 2, score: 3_640, bestBefore: null, bestAfter: 3_640, place: 682, tier: 2 } },
  newBest: { ...END, score: 4_932, result: { ...RESULT_BASE, score: 4_932, bestBefore: 3_640, bestAfter: 4_932, place: 172, tier: 1 } },
  below: { ...END, score: 3_193, result: { ...RESULT_BASE, score: 3_193, bestBefore: 3_640, bestAfter: 3_640, place: 682, tier: 2 } },
  underFloor: { ...END, score: 840, result: { ...RESULT_BASE, try: 1, left: 2, score: 840, bestBefore: null, bestAfter: 840, place: null, tier: null } },
  last: { ...END, score: 2_910, result: { ...RESULT_BASE, try: 3, left: 0, score: 2_910, bestBefore: 4_932, bestAfter: 4_932, place: 172, tier: 1 } },
  late: { ...END, score: 5_050, result: { ...RESULT_BASE, try: 3, left: 0, score: 5_050, bestBefore: 4_932, bestAfter: 4_932, place: 172, tier: 1, late: true } },
} satisfies Record<string, Data<FairEndProps>>;
