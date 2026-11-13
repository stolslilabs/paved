import { PUZZLE_TILES } from "./puzzle";

// The Tournament (the weekly individual event, the design proposal of 2026-11-09): knockout duels on the same cards. Registration on
// Monday, in the player's league; the brackets (64 seats each) are drawn on Tuesday 00:00 UTC, then one round a UTC day until
// Sunday's final. A duel is one game each of the round's 38 cards (the same for every player of the round, each game in an order of
// its own): the better score goes through. The rules the client and the contracts will share: the calendar, the leagues' groups, the
// draw, who goes through and the rewards. Every figure is the proposal's, to be calibrated before the contracts. The client runs one
// tournament every week (the owner's ask: a new one starts when one ends), in place of the proposal's weeks 3 and 8 of a season.

/** A tournament's week: Monday 00:00 UTC to the next. */
export const TOURNAMENT_WEEK_S = 7 * 86_400;
/** A round's length, and the registration's: one UTC day. */
export const TOURNAMENT_DAY_S = 86_400;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The seats of a bracket. The owner's 128 would need a seventh round; Monday's registration leaves six days. */
export const TOURNAMENT_SEATS = 64;
/** The rounds of a bracket, Tuesday (the round of 64) to Sunday (the final). */
export const TOURNAMENT_ROUNDS = 6;
/** The tiles of a tournament game, the starter included: a Training game's. */
export const TOURNAMENT_TILES = PUZZLE_TILES;
/** A league group with fewer registered players joins the group below. */
export const TOURNAMENT_MIN_GROUP = 16;
/** The Cobbles of the last round a player reached, the round of 64 first (they must have played a game); the champion's are their own. */
export const TOURNAMENT_COBBLES = [5, 10, 20, 40, 80, 150] as const;
export const TOURNAMENT_CHAMPION_COBBLES = 300;
/** The league groups, by name: a player registers in their village's league's. */
export const TOURNAMENT_LEAGUES = ["Wood", "Iron", "Bronze", "Silver", "Gold", "Emerald", "Diamond", "Master", "Grand Master"] as const;

/** The tournament week of a time, in seconds since the epoch. */
export const tournamentWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / TOURNAMENT_WEEK_S);
/** When a week starts (Monday 00:00 UTC): its registration opens. */
export const tournamentWeekStart = (week: number): number => FIRST_MONDAY_S + week * TOURNAMENT_WEEK_S;
/** The round of a time in its week: 0 on Monday (the registration), then 1 (Tuesday, the round of 64) to 6 (Sunday, the final). */
export const tournamentRoundOf = (seconds: number): number => Math.floor((seconds - tournamentWeekStart(tournamentWeekOf(seconds))) / TOURNAMENT_DAY_S);
/** When a week's round starts (00:00 UTC of its day); round 0 is the registration, round 1's start the draw. */
export const tournamentRoundStart = (week: number, round: number): number => tournamentWeekStart(week) + round * TOURNAMENT_DAY_S;
/** When a week's round ends (24:00 UTC of its day): a move after it is refused. */
export const tournamentRoundEnd = (week: number, round: number): number => tournamentRoundStart(week, round + 1);

/** A week's phase: the registration (Monday), then the rounds (Tuesday to Sunday). */
export type TournamentPhase = "registration" | "rounds";
export const tournamentPhaseOf = (seconds: number): TournamentPhase => (tournamentRoundOf(seconds) === 0 ? "registration" : "rounds");

/** The players a round holds in a full bracket: 64 in round 1, 2 in the final. */
export const tournamentPlayersIn = (round: number): number => TOURNAMENT_SEATS >> (round - 1);

const ROUND_NAMES: Record<number, string> = { 4: "Quarter-final", 5: "Semi-final", 6: "Final" };
/** A round's name: "Round of 64", then the quarter-final, the semi-final and the final. */
export const tournamentRoundName = (round: number): string => ROUND_NAMES[round] ?? `Round of ${tournamentPlayersIn(round)}`;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
/** The day a round is played: round 1 on Tuesday, the final on Sunday (0: Monday, the registration's). */
export const tournamentRoundDay = (round: number): string => DAYS[round] ?? "";

/** The league group (an index of `TOURNAMENT_LEAGUES`) of a league's number on chain (`league_of`: 0 Wood, 1 to 21 Iron III to Master I, 22 Grand Master). */
export const tournamentLeagueGroup = (league: number): number => (league <= 0 ? 0 : Math.min(TOURNAMENT_LEAGUES.length - 1, 1 + Math.floor((league - 1) / 3)));

/**
 * Where each league group plays, from the players registered in each (`counts`, Wood first): a group with fewer than
 * `TOURNAMENT_MIN_GROUP` players, those carried into it included, joins the group below (the strong go down rather than the weak up);
 * the lowest group keeps whoever it has. The answer names, for each group, the group its players play in.
 */
export function tournamentGroups(counts: readonly number[]): number[] {
  const into = counts.map((_, i) => i);
  let carried = 0;
  for (let i = counts.length - 1; i > 0; i--) {
    const here = counts[i]! + carried;
    if (here >= TOURNAMENT_MIN_GROUP) {
      carried = 0;
      continue;
    }
    carried = here;
    // Every group already carried into this one follows it down.
    for (let j = i; j < counts.length; j++) if (into[j] === i) into[j] = i - 1;
  }
  return into;
}

/** The brackets a group's players fill: as few as hold them, 64 seats each. */
export const tournamentBracketCount = (players: number): number => Math.max(1, Math.ceil(players / TOURNAMENT_SEATS));

/** The seat of a bracket's `position`-th player (0 first): the six bits of the position reversed, so the empty seats are spread out. */
export function tournamentSeatOf(position: number): number {
  let seat = 0;
  for (let bit = 0; bit < TOURNAMENT_ROUNDS; bit++) if (position & (1 << bit)) seat |= 1 << (TOURNAMENT_ROUNDS - 1 - bit);
  return seat;
}

/**
 * Tuesday's draw of a group of `players` (each named by their registration number, 0 first): they are shuffled (`random`, in [0, 1),
 * from a seed nobody knew on Monday), dealt in turn to the group's brackets (balanced: 150 players make 3 brackets of 50, 65 one of
 * 33 and one of 32), and seated by their turn in their bracket (`tournamentSeatOf`). The answer is each player's bracket and seat.
 * No seeding: a random draw within the group.
 */
export function tournamentDraw(players: number, random: () => number): { bracket: number; seat: number }[] {
  const order = Array.from({ length: players }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const brackets = tournamentBracketCount(players);
  const placed: { bracket: number; seat: number }[] = new Array(players);
  order.forEach((player, k) => {
    placed[player] = { bracket: k % brackets, seat: tournamentSeatOf(Math.floor(k / brackets)) };
  });
  return placed;
}

/** A seat nobody was drawn into: the player opposite skips the round. */
export const TOURNAMENT_BYE = -1;
/** A seat left empty by a match nobody played: the player opposite goes through only by playing the round's game. */
export const TOURNAMENT_VACANT = -2;

/** A player's game of a round: its score (an unfinished game's at its last move) and when it was played. */
export interface TournamentGame {
  score: number;
  at: number;
}

/**
 * Who a duel sends through, from both games (null: not played): the higher score; at an equal score the earlier game (the one who
 * played first gave the other a target, and keeps the tie); not playing loses to any game; null when nobody played.
 */
export function tournamentWinner(a: TournamentGame | null, b: TournamentGame | null): "a" | "b" | null {
  if (!a || !b) return a ? "a" : b ? "b" : null;
  const order = a.score - b.score || b.at - a.at;
  return order >= 0 ? "a" : "b";
}

/**
 * What a pair of seats sends to the next round: a player (0 or more), `TOURNAMENT_BYE` or `TOURNAMENT_VACANT`. Two players duel
 * (`tournamentWinner`; nobody played: the seat stays vacant). A player facing a bye skips the round. A player facing a vacant seat
 * goes through by playing the round's game: no title without playing every duel.
 */
export function tournamentDuel(a: number, b: number, game: (player: number) => TournamentGame | null): number {
  if (a < 0 && b < 0) return a === TOURNAMENT_BYE && b === TOURNAMENT_BYE ? TOURNAMENT_BYE : TOURNAMENT_VACANT;
  if (a >= 0 && b >= 0) {
    const winner = tournamentWinner(game(a), game(b));
    return winner === "a" ? a : winner === "b" ? b : TOURNAMENT_VACANT;
  }
  const player = a >= 0 ? a : b;
  const other = a >= 0 ? b : a;
  if (other === TOURNAMENT_BYE) return player;
  return game(player) ? player : TOURNAMENT_VACANT;
}

/** A round's seats from the round before's, two by two (`tournamentDuel`); `game` reads a player's game of that round. */
export function tournamentNextRound(seats: readonly number[], game: (player: number) => TournamentGame | null): number[] {
  return Array.from({ length: seats.length / 2 }, (_, i) => tournamentDuel(seats[2 * i]!, seats[2 * i + 1]!, game));
}

/** Whether a player in `seat` of `seats` (a round's) has a game to play that round: the seat opposite is not a bye. */
export const tournamentPlaysIn = (seats: readonly number[], seat: number): boolean => seats[seat ^ 1] !== TOURNAMENT_BYE;

/**
 * The round of a player's first duel, from the draw's seats (round 1's) and their own: the first round whose opposite side of the
 * bracket holds a player. With 17 players, 2 start in round 2 and 15 in round 3. Null: they are alone in their bracket.
 */
export function tournamentFirstRound(seats: readonly number[], seat: number): number | null {
  for (let round = 1; round <= TOURNAMENT_ROUNDS; round++) {
    const size = 1 << (round - 1);
    const from = ((seat >> (round - 1)) ^ 1) * size;
    for (let s = from; s < from + size; s++) if (seats[s]! >= 0) return round;
  }
  return null;
}

/**
 * The Cobbles of a run: by the last round reached (`TOURNAMENT_COBBLES`), the champion's their own; nothing for a player who never
 * played a game. No XP and no chest.
 */
export function tournamentCobbles(reached: number, champion: boolean, played: boolean): number {
  if (!played) return 0;
  return champion ? TOURNAMENT_CHAMPION_COBBLES : (TOURNAMENT_COBBLES[reached - 1] ?? 0);
}
