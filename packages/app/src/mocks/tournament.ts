import { TOURNAMENT_CHAMPION_COBBLES, TOURNAMENT_COBBLES, tournamentRoundEnd, tournamentRoundStart, tournamentWeekOf } from "@paved/game-core";
import type { PlayModesProps, TournamentCard } from "../components/containers/play-modes";
import type { TournamentEndProps } from "../components/containers/tournament-end";
import type { TournamentSceneProps } from "../components/scenes/tournament-scene";
import { community } from "../data/mock/community";
import type { TournamentGameResult, TournamentMatch, TournamentPlayed, TournamentPlayer, TournamentRun, TournamentState, TournamentStep } from "../data/tournament-source";
import { MOCK_NOW } from "./clock";

// The Tournament's mocks (the weekly individual event, the design proposal of 2026-11-09): the proposal's own week, a Gold league
// bracket of 50, the viewer through four duels from Tuesday to Friday and in Saturday's semi-final against Vael, who played at 09:12
// and scored 5,486. The week's states (Monday's registration, each state of a day's duel, a bye, out, not registered, last week's
// champion), the bracket, the Play card's states and a game's ends.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const WEEK = tournamentWeekOf(MOCK_NOW);
/** The mocks' two clocks: Monday 14:20 (the registration, 9 h 40 left) and Saturday 14:20 (the semi-final, 9 h 40 left). */
export const TOURNAMENT_MONDAY_NOW = tournamentRoundEnd(WEEK, 0) - 34_800;
export const TOURNAMENT_SATURDAY_NOW = tournamentRoundEnd(WEEK, 5) - 34_800;

/** The viewer: the community's fifth player. */
export const TOURNAMENT_ME = community()[4]!.address;
const ME: TournamentPlayer = { address: TOURNAMENT_ME, name: community()[4]!.name, profile: true };
/** The field's players have no profile; the community's do. */
const field = (name: string, i: number): TournamentPlayer => ({ address: `0x746f75726e${(0x400 + i).toString(16)}`, name, profile: false });
const VAEL = field("Vael", 1);
const MIRA: TournamentPlayer = { address: community()[0]!.address, name: community()[0]!.name, profile: true };
/** A name of the widest letters with no space to wrap at. */
const LONGEST = field("W".repeat(24), 9);

const played = (score: number, round: number, hour: number, over = true): TournamentPlayed => ({ score, at: tournamentRoundStart(WEEK, round) + hour * 3_600 + 720, over });
const won = (round: number, opponent: TournamentPlayer, own: number, theirs: number): TournamentStep => ({ round, kind: "duel", opponent, own: played(own, round, 18), theirs: played(theirs, round, 11), outcome: "won" });

/** Tuesday to Friday: four duels won. */
const PATH: TournamentStep[] = [won(1, field("Torin", 2), 4_910, 4_388), won(2, field("Kawen", 3), 5_204, 5_120), won(3, field("Elna", 4), 5_377, 4_902), won(4, field("Brulis", 5), 5_561, 5_340)];
const SEMI: TournamentStep = { round: 5, kind: "duel", opponent: VAEL, own: null, theirs: played(5_486, 5, 9), outcome: "pending" };

const side = (player: TournamentPlayer, score: number | null) => ({ player, score });
/** The last eight: the quarter-finals played, both semi-finals today. */
const QUARTERS: TournamentMatch[] = [
  { round: 4, a: side(MIRA, 5_902), b: side(field("Symund", 6), 5_411), winner: "a" },
  { round: 4, a: side(field("Orric", 7), 5_230), b: side(field("Hathe", 8), 5_644), winner: "b" },
  { round: 4, a: side(ME, 5_561), b: side(field("Brulis", 5), 5_340), winner: "a" },
  { round: 4, a: side(VAEL, 5_718), b: null, winner: "a" },
];
const SEMIS: TournamentMatch[] = [
  { round: 5, a: side(MIRA, null), b: side(field("Hathe", 8), 5_207), winner: null },
  { round: 5, a: side(ME, null), b: side(VAEL, 5_486), winner: null },
];

const RUN: TournamentRun = { week: WEEK, league: "Gold", registeredIn: "Gold", bracket: 2, brackets: 3, players: 50, path: [...PATH, SEMI], status: "to-play", reached: 5, firstDuel: 1, open: null, cobbles: TOURNAMENT_COBBLES[4], claimable: false, claimed: false, finals: [...QUARTERS, ...SEMIS] };
const step = (run: TournamentRun, change: Partial<TournamentStep>): TournamentStep[] => [...run.path.slice(0, -1), { ...run.path[run.path.length - 1]!, ...change }];

/** Last week's run, the champion's: six duels won, the final against Mira, 6,328 to 6,102. */
const CHAMPION: TournamentRun = {
  ...RUN,
  week: WEEK - 1,
  path: [...PATH, { ...SEMI, own: played(5_693, 5, 15), outcome: "won" }, { round: 6, kind: "duel", opponent: MIRA, own: played(6_328, 6, 16), theirs: played(6_102, 6, 10), outcome: "won" }],
  status: "champion",
  reached: 6,
  cobbles: TOURNAMENT_CHAMPION_COBBLES,
  claimable: true,
  finals: [...QUARTERS, { ...SEMIS[0]!, a: side(MIRA, 5_960), winner: "a" }, { ...SEMIS[1]!, a: side(ME, 5_693), winner: "a" }, { round: 6, a: side(MIRA, 6_102), b: side(ME, 6_328), winner: "b" }],
};
/** Out in the round of 16 on Thursday, the Cobbles to claim from Friday. */
const OUT: TournamentRun = { ...RUN, path: [...PATH.slice(0, 2), { round: 3, kind: "duel", opponent: field("Elna", 4), own: played(4_702, 3, 18), theirs: played(4_902, 3, 11), outcome: "lost" }], status: "out", reached: 3, cobbles: TOURNAMENT_COBBLES[2], claimable: true, finals: [...QUARTERS, ...SEMIS] };

const MONDAY: TournamentState = { week: WEEK, phase: "registration", round: 0, endsAt: tournamentRoundEnd(WEEK, 0), league: "Gold", registered: false, entrants: 142, deckSeed: null, run: null, last: null };
const SATURDAY: TournamentState = { week: WEEK, phase: "rounds", round: 5, endsAt: tournamentRoundEnd(WEEK, 5), league: "Gold", registered: true, entrants: 150, deckSeed: "0x7055a1e5eed", run: RUN, last: null };
/** Tuesday in a small bracket: the seat opposite is empty, the first duel is on Wednesday. */
const TUESDAY: TournamentState = {
  ...SATURDAY,
  round: 1,
  endsAt: tournamentRoundEnd(WEEK, 1),
  run: { ...RUN, players: 41, path: [{ round: 1, kind: "bye", opponent: null, own: null, theirs: null, outcome: "pending" }], status: "waiting", reached: 1, firstDuel: 2, cobbles: 0, finals: [] },
};

const monday = { now: TOURNAMENT_MONDAY_NOW, me: TOURNAMENT_ME } as const;
const saturday = { now: TOURNAMENT_SATURDAY_NOW, me: TOURNAMENT_ME } as const;
const tuesday = { now: tournamentRoundEnd(WEEK, 1) - 34_800, me: TOURNAMENT_ME } as const;

/** The Tournament view's states (`TournamentScene`). */
export const TOURNAMENT = {
  loading: { state: null, ...monday },
  failed: { state: null, error: "The Tournament could not be read.", ...monday },
  registration: { state: MONDAY, ...monday },
  registering: { state: MONDAY, busy: "register", ...monday },
  registered: { state: { ...MONDAY, registered: true, entrants: 143 }, ...monday },
  champion: { state: { ...MONDAY, last: CHAMPION }, ...monday },
  lastClaimed: { state: { ...MONDAY, registered: true, last: { ...OUT, week: WEEK - 1, claimable: false, claimed: true } }, ...monday },
  duel: { state: SATURDAY, ...saturday },
  duelFirst: { state: { ...SATURDAY, run: { ...RUN, path: step(RUN, { theirs: null }) } }, ...saturday },
  playing: { state: { ...SATURDAY, run: { ...RUN, status: "playing", open: { id: 7, score: 3_120 }, path: step(RUN, { own: played(3_120, 5, 14, false) }) } }, ...saturday },
  played: { state: { ...SATURDAY, run: { ...RUN, status: "played", path: step(RUN, { own: played(5_693, 5, 14) }) } }, ...saturday },
  walkover: { state: { ...SATURDAY, run: { ...RUN, path: step(RUN, { kind: "walkover", opponent: null, theirs: null }) } }, ...saturday },
  longName: { state: { ...SATURDAY, run: { ...RUN, path: step(RUN, { opponent: LONGEST }) } }, ...saturday },
  bye: { state: TUESDAY, ...tuesday },
  carried: { state: { ...SATURDAY, league: "Master", run: { ...RUN, league: "Emerald", registeredIn: "Master", brackets: 1, bracket: 1, players: 27 } }, ...saturday },
  out: { state: { ...SATURDAY, run: OUT }, ...saturday },
  outClaimed: { state: { ...SATURDAY, run: { ...OUT, claimable: false, claimed: true } }, ...saturday },
  notRegistered: { state: { ...SATURDAY, registered: false, run: null }, ...saturday },
  bracket: { state: SATURDAY, view: "bracket", ...saturday },
  bracketEarly: { state: TUESDAY, view: "bracket", ...tuesday },
  bracketChampion: { state: { ...MONDAY, last: CHAMPION }, view: "bracket", ...monday },
  bracketLongName: { state: { ...SATURDAY, run: { ...RUN, path: step(RUN, { opponent: LONGEST }), finals: [...QUARTERS, SEMIS[0]!, { ...SEMIS[1]!, b: side(LONGEST, 5_486) }] } }, view: "bracket", ...saturday },
  bracketNone: { state: MONDAY, view: "bracket", ...monday },
} satisfies Record<string, Data<TournamentSceneProps>>;

const card = (c: TournamentCard, now: number) => ({ tournamentCard: c, now });
const ROUNDS = { phase: "rounds", endsAt: SATURDAY.endsAt, registered: true, round: "Semi-final", playing: null } as const;
const running = (status: NonNullable<TournamentCard["run"]>["status"], opponent: string | null = "Vael") => ({ status, opponent, out: null, claimable: false });

/** The Play card's states (`PlayModes`' Limited): the registration open and done, today's duel, a game in play, played, a bye, out, the week drawn without the player. */
export const TOURNAMENT_CARD = {
  open: card({ phase: "registration", endsAt: MONDAY.endsAt, registered: false, round: null, run: null, playing: null }, TOURNAMENT_MONDAY_NOW),
  registered: card({ phase: "registration", endsAt: MONDAY.endsAt, registered: true, round: null, run: null, playing: null }, TOURNAMENT_MONDAY_NOW),
  duel: card({ ...ROUNDS, run: running("to-play") }, TOURNAMENT_SATURDAY_NOW),
  longName: card({ ...ROUNDS, run: running("to-play", LONGEST.name) }, TOURNAMENT_SATURDAY_NOW),
  playing: card({ ...ROUNDS, run: running("playing"), playing: { score: 3_120 } }, TOURNAMENT_SATURDAY_NOW),
  played: card({ ...ROUNDS, run: running("played") }, TOURNAMENT_SATURDAY_NOW),
  bye: card({ ...ROUNDS, round: "Round of 64", run: running("waiting", null) }, TOURNAMENT_SATURDAY_NOW),
  out: card({ ...ROUNDS, run: { status: "out", opponent: null, out: "Round of 16", claimable: true } }, TOURNAMENT_SATURDAY_NOW),
  outClaimed: card({ ...ROUNDS, run: { status: "out", opponent: null, out: "Round of 16", claimable: false } }, TOURNAMENT_SATURDAY_NOW),
  notRegistered: card({ ...ROUNDS, registered: false, run: null }, TOURNAMENT_SATURDAY_NOW),
} satisfies Record<string, Pick<PlayModesProps, "tournamentCard" | "now">>;

const result = (change: Partial<TournamentGameResult>): TournamentGameResult => ({ gameId: 7, score: 5_693, round: 5, opponent: VAEL, theirs: played(5_486, 5, 9), standing: "ahead", secures: TOURNAMENT_COBBLES[5], ...change });
const END = { closings: [] } as const;

/** A tournament game's ends (`TournamentEnd`): through, out, the opponent still to play or in play, a walkover, the day's verdicts, the champion. */
export const TOURNAMENT_END = {
  reading: { ...END, score: 5_693, result: null },
  through: { ...END, score: 5_693, result: result({}) },
  out: { ...END, score: 5_372, result: result({ score: 5_372, standing: "behind" }) },
  waiting: { ...END, score: 5_693, result: result({ theirs: null, standing: "waiting" }) },
  ahead: { ...END, score: 5_693, result: result({ theirs: played(4_120, 5, 14, false) }) },
  behind: { ...END, score: 5_372, result: result({ score: 5_372, theirs: played(5_486, 5, 14, false), standing: "behind" }) },
  walkover: { ...END, score: 5_693, result: result({ opponent: null, theirs: null }) },
  won: { ...END, score: 5_693, result: result({ standing: "won" }) },
  lost: { ...END, score: 5_372, result: result({ score: 5_372, standing: "lost" }) },
  champion: { ...END, score: 6_328, result: result({ score: 6_328, round: 6, opponent: MIRA, theirs: played(6_102, 6, 10), standing: "won", secures: TOURNAMENT_CHAMPION_COBBLES }) },
  longName: { ...END, score: 5_693, result: result({ opponent: LONGEST, theirs: null, standing: "waiting" }) },
} satisfies Record<string, Data<TournamentEndProps>>;
