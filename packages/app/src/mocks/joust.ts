import { GUILD_NAME_MAX, JOUST_GAMES, joustEndsAt, joustExpected, joustOpensAt, joustWeekOf } from "@paved/game-core";
import type { JoustCard, PlayModesProps } from "../components/containers/play-modes";
import type { JoustEndProps } from "../components/containers/joust-end";
import type { JoustSceneProps } from "../components/scenes/joust-scene";
import { community, communityProfile } from "../data/mock/community";
import type { JoustGuild, JoustJouster, JoustRanking, JoustResult, JoustSide, JoustState } from "../data/joust-source";
import type { PublicProfile } from "../data/social-source";
import { MOCK_NOW } from "./clock";

// The Joust's mocks (the weekly allegiance event, the design proposal of 2026-11-09): the proposal's own match, the Quarrymen
// (1,184) against Ironvale (1,196), 18,290 to 17,940, the viewer fourth of their side with one game played; the week's states
// (registration for an Officer and a member, registered, live, a bye, sat out, no game left, without an allegiance), last week's
// result, both top 10, the ranking, the Play card's states and a game's ends.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = joustWeekOf(MOCK_NOW);
const OPENS = joustOpensAt(WEEK);
const ENDS = joustEndsAt(WEEK);
/** The mocks' two clocks: Tuesday noon (the registration) and Saturday 18:00 (the joust, 1 d 6 h left). */
export const JOUST_REGISTRATION_NOW = OPENS - 2 * 86_400 - 6 * 3_600;
export const JOUST_LIVE_NOW = ENDS - 30 * 3_600;

const PLAYERS: readonly PublicProfile[] = community().map((m) => communityProfile(m.address, MOCK_NOW)!);
/** The viewer: the community's fifth player. */
export const JOUST_ME = PLAYERS[4]!.address;

const QUARRYMEN: JoustGuild = { id: 11, name: "The Quarrymen", emblem: { icon: 0, primary: 3, secondary: 5 } };
const IRONVALE: JoustGuild = { id: 12, name: "Ironvale", emblem: { icon: 1, primary: 10, secondary: 9 } };
/** A legal name of the most letters, of the widest letter and with no space to wrap at (#1156, point 3). */
const LONGEST = "W".repeat(GUILD_NAME_MAX);

const top = (players: readonly PublicProfile[], scores: readonly number[], played: readonly number[]): JoustJouster[] => scores.map((best, i) => ({ profile: players[i]!, best, played: played[i]! }));

/** The Quarrymen's ten best, the viewer fourth with 1,880 and one game played; Ironvale's. */
const OWN_ORDER = [PLAYERS[0]!, PLAYERS[1]!, PLAYERS[2]!, PLAYERS[4]!, PLAYERS[3]!, ...PLAYERS.slice(5, 10)];
const OWN: JoustSide = { guild: QUARRYMEN, rating: 1_184, total: 18_290, jousters: 23, gamesLeft: 31, top: top(OWN_ORDER, [2_140, 2_010, 1_960, 1_880, 1_850, 1_790, 1_720, 1_700, 1_640, 1_600], [3, 2, 3, 1, 2, 3, 1, 2, 1, 1]) };
const THEIRS: JoustSide = { guild: IRONVALE, rating: 1_196, total: 17_940, jousters: 27, gamesLeft: 24, top: top(PLAYERS.slice(10, 20), [2_200, 1_990, 1_910, 1_850, 1_800, 1_760, 1_700, 1_660, 1_580, 1_490], [3, 3, 2, 3, 3, 2, 3, 2, 3, 1]) };

const RESULT: JoustResult = {
  week: WEEK - 1,
  own: { guild: QUARRYMEN, total: 18_420 },
  opponent: { guild: IRONVALE, total: 18_010 },
  outcome: "win",
  ratingBefore: 1_184,
  ratingAfter: 1_201,
  expected: joustExpected(1_184, 1_196),
  best: 1_990,
  place: 3,
  champion: { name: "Mira", score: 2_140 },
  cobbles: 50,
  claimed: false,
};

const BASE = { week: WEEK, boost: "roads", opensAt: OPENS, endsAt: ENDS, deckSeed: "0x7055a1e5eed" } as const;
const GUILD = { ...QUARRYMEN, rating: 1_184, members: 31, canRegister: true };

const REGISTRATION: JoustState = { ...BASE, phase: "registration", guild: GUILD, registered: false, match: null, me: null, result: null };
const LIVE: JoustState = {
  ...BASE,
  phase: "live",
  guild: GUILD,
  registered: true,
  match: { own: OWN, opponent: THEIRS, expected: joustExpected(1_184, 1_196) },
  me: { eligible: true, played: 1, left: JOUST_GAMES - 1, best: 1_880, place: 4, open: null },
  result: null,
};

const RANKING: JoustRanking = {
  jousts: 2,
  own: QUARRYMEN.id,
  peak: 1_201,
  entries: (
    [
      ["Hollow Oak", 1_352, 21, { icon: 2, primary: 16, secondary: 2 }],
      ["Thistle Watch", 1_290, 15, { icon: 3, primary: 14, secondary: 13 }],
      ["Order of the Millstone", 1_244, -9, { icon: 4, primary: 7, secondary: 6 }],
      ["Saltmarsh", 1_226, 11, { icon: 5, primary: 4, secondary: 5 }],
      [QUARRYMEN.name, 1_201, 17, QUARRYMEN.emblem],
      [IRONVALE.name, 1_179, -17, IRONVALE.emblem],
      ["Ashford Lanterns", 1_166, null, { icon: 6, primary: 1, secondary: 6 }],
    ] as const
  ).map(([name, rating, change, emblem], i) => ({ place: i + 1, guild: { id: name === QUARRYMEN.name ? QUARRYMEN.id : name === IRONVALE.name ? IRONVALE.id : 20 + i, name, emblem }, rating, change })),
};

const live = { now: JOUST_LIVE_NOW, me: JOUST_ME } as const;
const registration = { now: JOUST_REGISTRATION_NOW, me: JOUST_ME } as const;

/** The Joust view's states (`JoustScene`). */
export const JOUST = {
  loading: { state: null, ...registration },
  failed: { state: null, error: "The Joust could not be read.", ...registration },
  guildless: { state: { ...REGISTRATION, guild: null }, ...registration },
  officer: { state: REGISTRATION, ...registration },
  registering: { state: REGISTRATION, busy: "register", ...registration },
  member: { state: { ...REGISTRATION, guild: { ...GUILD, canRegister: false } }, ...registration },
  registered: { state: { ...REGISTRATION, registered: true }, ...registration },
  officerLongName: { state: { ...REGISTRATION, guild: { ...GUILD, name: LONGEST } }, ...registration },
  memberLongName: { state: { ...REGISTRATION, guild: { ...GUILD, name: LONGEST, canRegister: false } }, ...registration },
  registeredLongName: { state: { ...REGISTRATION, registered: true, guild: { ...GUILD, name: LONGEST } }, ...registration },
  result: { state: { ...REGISTRATION, registered: true, guild: { ...GUILD, rating: 1_201 }, result: RESULT }, ...registration },
  defeat: { state: { ...REGISTRATION, guild: { ...GUILD, rating: 1_170 }, result: { ...RESULT, outcome: "loss", own: RESULT.opponent!, opponent: RESULT.own, ratingAfter: 1_170, cobbles: 15, claimed: true } }, ...registration },
  live: { state: LIVE, ...live },
  playing: { state: { ...LIVE, me: { ...LIVE.me!, played: 2, left: 1, open: { id: 7, score: 1_640 } } }, ...live },
  noGameLeft: { state: { ...LIVE, me: { ...LIVE.me!, played: 3, left: 0 } }, ...live },
  newcomer: { state: { ...LIVE, me: { eligible: false, played: 0, left: 0, best: null, place: null, open: null } }, ...live },
  bye: { state: { ...LIVE, match: { own: OWN, opponent: null, expected: 1 } }, ...live },
  satOut: { state: { ...LIVE, registered: false, match: null, me: null }, ...live },
  top: { state: LIVE, view: "top", ...live },
  ranking: { state: LIVE, view: "ranking", ranking: RANKING, ...live },
  rankingLoading: { state: LIVE, view: "ranking", ranking: null, ...live },
} satisfies Record<string, Data<JoustSceneProps>>;

const card = (c: JoustCard, now: number) => ({ joustCard: c, now });

/** The Play card's states (`PlayModes`' Limited): without an allegiance, the registration open and done, the live match, a game in play, a bye, the week sat out. */
export const JOUST_CARD = {
  guildless: card({ phase: "registration", endsAt: OPENS, guild: null, match: null, playing: null }, JOUST_REGISTRATION_NOW),
  open: card({ phase: "registration", endsAt: OPENS, guild: { emblem: QUARRYMEN.emblem, registered: false }, match: null, playing: null }, JOUST_REGISTRATION_NOW),
  registered: card({ phase: "registration", endsAt: OPENS, guild: { emblem: QUARRYMEN.emblem, registered: true }, match: null, playing: null }, JOUST_REGISTRATION_NOW),
  live: card({ phase: "live", endsAt: ENDS, guild: { emblem: QUARRYMEN.emblem, registered: true }, match: { total: 18_290, opponent: { name: IRONVALE.name, emblem: IRONVALE.emblem, total: 17_940 } }, playing: null }, JOUST_LIVE_NOW),
  playing: card({ phase: "live", endsAt: ENDS, guild: { emblem: QUARRYMEN.emblem, registered: true }, match: { total: 18_290, opponent: { name: IRONVALE.name, emblem: IRONVALE.emblem, total: 17_940 } }, playing: { score: 1_640 } }, JOUST_LIVE_NOW),
  bye: card({ phase: "live", endsAt: ENDS, guild: { emblem: QUARRYMEN.emblem, registered: true }, match: { total: 9_120, opponent: null }, playing: null }, JOUST_LIVE_NOW),
  satOut: card({ phase: "live", endsAt: ENDS, guild: { emblem: QUARRYMEN.emblem, registered: false }, match: null, playing: null }, JOUST_LIVE_NOW),
} satisfies Record<string, Pick<PlayModesProps, "joustCard" | "now">>;

const END = { guild: QUARRYMEN, closings: [] } as const;

/** A joust game's ends (`JoustEnd`): the first of the joust, a new best that lifts the total, below the best, the last game, too late. */
export const JOUST_END = {
  reading: { ...END, score: 1_640, result: null },
  first: { ...END, score: 1_880, result: { gameId: 5, score: 1_880, game: 1, left: 2, bestBefore: null, bestAfter: 1_880, totalBefore: 16_410, totalAfter: 18_290, late: false } },
  newBest: { ...END, score: 1_960, result: { gameId: 6, score: 1_960, game: 2, left: 1, bestBefore: 1_880, bestAfter: 1_960, totalBefore: 18_290, totalAfter: 18_370, late: false } },
  below: { ...END, score: 1_640, result: { gameId: 6, score: 1_640, game: 2, left: 1, bestBefore: 1_880, bestAfter: 1_880, totalBefore: 18_290, totalAfter: 18_290, late: false } },
  last: { ...END, score: 1_700, result: { gameId: 7, score: 1_700, game: 3, left: 0, bestBefore: 1_880, bestAfter: 1_880, totalBefore: 18_290, totalAfter: 18_290, late: false } },
  longName: { ...END, guild: { ...QUARRYMEN, name: LONGEST }, score: 1_880, result: { gameId: 5, score: 1_880, game: 1, left: 2, bestBefore: null, bestAfter: 1_880, totalBefore: 16_410, totalAfter: 18_290, late: false } },
  late: { ...END, score: 2_050, result: { gameId: 7, score: 2_050, game: 3, left: 0, bestBefore: 1_880, bestAfter: 1_880, totalBefore: 18_290, totalAfter: 18_290, late: true } },
} satisfies Record<string, Data<JoustEndProps>>;
