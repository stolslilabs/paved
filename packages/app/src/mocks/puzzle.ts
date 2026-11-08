import { puzzleDayEnd, puzzleDayOf } from "@paved/game-core";
import type { PuzzleEndProps } from "../components/containers/puzzle-end";
import type { MailSectionProps, PrizeMailProps } from "../components/containers/inbox-mail";
import type { PlayModesProps, PuzzleCard } from "../components/containers/play-modes";
import type { PuzzleSceneProps } from "../components/scenes/puzzle-scene";
import { community, communityProfile } from "../data/mock/community";
import type { PuzzleEntry, PuzzleStanding } from "../data/puzzle-source";
import type { PublicProfile } from "../data/social-source";
import { HOUR, MOCK_NOW } from "./clock";
import { LONG_ADDRESS, LONG_NAME } from "./stress";

// The Puzzle's mocks (Play's Limited mode, the owner's approved mockups of 2026-11-08): the mocks' day, its leaderboard from the mock
// community, the viewer fourth, the Play card's states, the view's, the game's ends (first, a new best, below the best, too late), the
// Inbox's prize mails.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** The mocks' Puzzle day, the clock's: 5 h 12 min left at `MOCK_NOW` would be the owner's mockups' (the fixtures read the clock's own). */
export const PUZZLE_DAY = puzzleDayOf(MOCK_NOW);
const ENDS = puzzleDayEnd(PUZZLE_DAY);

/** The community's players at `MOCK_NOW`: the leaderboard's rows. */
const PLAYERS: readonly PublicProfile[] = community().map((m) => communityProfile(m.address, MOCK_NOW)!);

/** The viewer: the community's fifth player, ranked fourth today. */
export const PUZZLE_ME = PLAYERS[4]!.address;
const ME = PLAYERS[4]!;

/** The day's best scores, the viewer's 1,270 fourth. */
const SCORES = [1_640, 1_585, 1_512, 1_270, 1_244, 1_190, 1_121, 1_060, 1_002, 940, 905, 870];

/** The leaderboard of `players`, their scores in order. */
function ranked(players: readonly PublicProfile[], scores: readonly number[]): PuzzleEntry[] {
  return scores.map((score, i) => ({ profile: players[i]!, score, place: i + 1 }));
}

/** The other players first, the viewer at the fourth place. */
const ORDER = [PLAYERS[0]!, PLAYERS[1]!, PLAYERS[2]!, ME, ...PLAYERS.slice(5, 13)];

const standing = (entries: PuzzleEntry[], me: PuzzleStanding["me"], players = entries.length): PuzzleStanding => ({ day: PUZZLE_DAY, endsAt: ENDS, seed: "0x7055a1e5eed", entries, players, me });

/** Today's leaderboard, the viewer fourth of 128 (the list shows the first twelve). */
export const PUZZLE_STANDING = standing(ranked(ORDER, SCORES), { place: 4, score: 1_270 }, 128);
/** No one has played today yet. */
const EMPTY = standing([], null, 0);
/** The viewer first. */
const LEADING = standing(
  ranked([ME, ...ORDER.filter((p) => p !== ME)], [1_670, ...SCORES.slice(0, 11)]),
  { place: 1, score: 1_670 },
  128,
);
/** The viewer past the list: 57th. */
const PAST = standing(ranked(ORDER.filter((p) => p !== ME), SCORES.filter((s) => s !== 1_270)), { place: 57, score: 640 }, 128);
/** WRAP360: the longest name and address, the largest figures. */
const STRESS_PROFILE: PublicProfile = { address: LONG_ADDRESS, name: LONG_NAME, look: null, level: 120, crowns: 123_456, league: 22, score: 0, lastSeen: MOCK_NOW };
const STRESS = standing([{ profile: STRESS_PROFILE, score: 99_999, place: 1 }, ...ranked(ORDER, SCORES).map((e) => ({ ...e, place: e.place + 1 }))], { place: 5, score: 1_270 }, 12_345);

const now = ENDS - (5 * HOUR + 12 * 60);

/** The Puzzle view's states (`PuzzleScene`), one story each. */
export const PUZZLE = {
  today: { standing: PUZZLE_STANDING, now, me: PUZZLE_ME },
  firstVisit: { standing: { ...PUZZLE_STANDING, me: null, entries: PUZZLE_STANDING.entries.filter((e) => e.profile !== ME), players: 127 }, now, me: PUZZLE_ME },
  leading: { standing: LEADING, now, me: PUZZLE_ME },
  pastList: { standing: PAST, now, me: PUZZLE_ME },
  playing: { standing: PUZZLE_STANDING, now, me: PUZZLE_ME, playing: { score: 860 } },
  starting: { standing: PUZZLE_STANDING, now, me: PUZZLE_ME, starting: true },
  empty: { standing: EMPTY, now, me: PUZZLE_ME },
  lastHour: { standing: PUZZLE_STANDING, now: ENDS - 38 * 60, me: PUZZLE_ME },
  loading: { standing: null, now, me: PUZZLE_ME },
  failed: { standing: null, now, me: PUZZLE_ME, error: "Today's leaderboard could not be read: the source did not answer." },
  stress: { standing: STRESS, now, me: PUZZLE_ME },
} satisfies Record<string, Data<PuzzleSceneProps>>;

const card = (best: PuzzleCard["best"], playing: PuzzleCard["playing"] = null): PuzzleCard => ({ endsAt: ENDS, best, playing });

/** The Play card's states (`PlayModes`' Limited): not played, played (its PB and place), first, a game in play, the last hour. */
export const PUZZLE_CARD = {
  notPlayed: { spawnPaused: false, now, puzzleCard: card(null) },
  played: { spawnPaused: false, now, puzzleCard: card({ score: 1_270, place: 28 }) },
  first: { spawnPaused: false, now, puzzleCard: card({ score: 1_670, place: 1 }) },
  playing: { spawnPaused: false, now, puzzleCard: card({ score: 1_270, place: 28 }, { score: 860 }) },
  lastHour: { spawnPaused: false, now: ENDS - 38 * 60, puzzleCard: card(null) },
} satisfies Record<string, Data<PlayModesProps>>;

const endBase = { dayLabel: "Wed, Oct 14", closings: [] };

/** A Puzzle game's ends (`PuzzleEnd`): first place, a new best below it, below the best, too late. */
export const PUZZLE_END = {
  victory: { ...endBase, score: 1_670, firstPlace: 1_640, result: { bestBefore: 1_270, bestAfter: 1_670, placeBefore: 4, placeAfter: 1, players: 128, late: false } },
  newBest: { ...endBase, score: 1_270, firstPlace: 1_640, result: { bestBefore: 1_180, bestAfter: 1_270, placeBefore: 41, placeAfter: 28, players: 128, late: false } },
  firstToday: { ...endBase, score: 1_270, firstPlace: 1_640, result: { bestBefore: null, bestAfter: 1_270, placeBefore: null, placeAfter: 28, players: 128, late: false } },
  belowBest: { ...endBase, score: 1_120, firstPlace: 1_640, result: { bestBefore: 1_270, bestAfter: 1_270, placeBefore: 28, placeAfter: 28, players: 128, late: false } },
  late: { ...endBase, score: 1_310, firstPlace: 1_640, result: { bestBefore: null, bestAfter: null, placeBefore: null, placeAfter: null, players: 127, late: true } },
  reading: { ...endBase, score: 1_270, firstPlace: 1_640, result: null },
} satisfies Record<string, Data<PuzzleEndProps>>;

const YESTERDAY = PUZZLE_DAY - 1;
/** Yesterday's final first ten, the viewer first. */
const TOP = ranked([ME, ...ORDER.filter((p) => p !== ME)].slice(0, 10), [1_812, 1_790, 1_702, 1_655, 1_610, 1_548, 1_503, 1_466, 1_420, 1_391]);

/** The Inbox's Mail (`MailSection`): one prize waiting, two (Claim all), one claimed under them. */
export const INBOX_MAIL = {
  one: { mails: [{ id: `puzzle-${YESTERDAY}`, day: YESTERDAY, at: puzzleDayEnd(YESTERDAY), claimed: false }], now },
  stacked: {
    mails: [
      { id: `puzzle-${YESTERDAY}`, day: YESTERDAY, at: puzzleDayEnd(YESTERDAY), claimed: false },
      { id: `puzzle-${YESTERDAY - 1}`, day: YESTERDAY - 1, at: puzzleDayEnd(YESTERDAY - 1), claimed: false },
      { id: `puzzle-${YESTERDAY - 5}`, day: YESTERDAY - 5, at: puzzleDayEnd(YESTERDAY - 5), claimed: true },
    ],
    now,
  },
  claiming: { mails: [{ id: `puzzle-${YESTERDAY}`, day: YESTERDAY, at: puzzleDayEnd(YESTERDAY), claimed: false }], now, claiming: true },
  refused: { mails: [{ id: `puzzle-${YESTERDAY}`, day: YESTERDAY, at: puzzleDayEnd(YESTERDAY), claimed: false }], now, error: "The claim was refused: Puzzle: already claimed." },
} satisfies Record<string, Data<MailSectionProps>>;

/** A prize's mail (`PrizeMail`): its gift waiting, its claim on its way, claimed, refused. */
export const PRIZE_MAIL = {
  waiting: { day: YESTERDAY, score: 1_812, players: 141, top: TOP, me: PUZZLE_ME, claimed: false },
  claiming: { day: YESTERDAY, score: 1_812, players: 141, top: TOP, me: PUZZLE_ME, claimed: false, claiming: true },
  claimed: { day: YESTERDAY, score: 1_812, players: 141, top: TOP, me: PUZZLE_ME, claimed: true },
  refused: { day: YESTERDAY, score: 1_812, players: 141, top: TOP, me: PUZZLE_ME, claimed: false, error: "The claim was refused: the network did not answer." },
} satisfies Record<string, Data<PrizeMailProps>>;
