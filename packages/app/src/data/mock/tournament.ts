import {
  SeededChallenge,
  TOURNAMENT_BYE,
  TOURNAMENT_CHAMPION_COBBLES,
  TOURNAMENT_COBBLES,
  TOURNAMENT_DAY_S,
  TOURNAMENT_LEAGUES,
  TOURNAMENT_ROUNDS,
  TOURNAMENT_SEATS,
  TOURNAMENT_VACANT,
  poseidon,
  puzzleDayOf,
  tournamentBracketCount,
  tournamentCobbles,
  tournamentDraw,
  tournamentFirstRound,
  tournamentGroups,
  tournamentLeagueGroup,
  tournamentNextRound,
  tournamentPhaseOf,
  tournamentRoundEnd,
  tournamentRoundOf,
  tournamentRoundStart,
  tournamentWeekOf,
  tournamentWeekStart,
  tournamentWinner,
  type SeededMove,
  type TournamentGame,
} from "@paved/game-core";
import { addressKey } from "../keys";
import type { TournamentGameRecord, TournamentGameResult, TournamentMatch, TournamentPlayed, TournamentPlayer, TournamentRun, TournamentState, TournamentStatus, TournamentStep } from "../tournament-source";
import { community, leagueIndex } from "./community";

// The mock's Tournament (the weekly individual event, game-core's `tournament.ts`), the whole event on the device. The community's
// players and a field of the mock's own (drawn names, no profile) register by themselves on Monday and their games are drawn (never
// played); the device's accounts register, play their one game a round by game-core's rules (`SeededChallenge` on the round's deck)
// and claim their Cobbles. A week is played again from its registrations at each read: the groups, the draw, each round once its day
// is over. Pure functions on the stored state: `MockLedger` runs them under its lock, as `joust.ts`'s.

/** The salts of the mock's draws: a round's deck (`'TOURN'`) and a game's random (`'TNGAME'`). */
const ROUND_SALT = 0x544f55524en;
const GAME_SALT = 0x544e47414d45n;

/** One tournament game as stored: its week and round, its player's address key, its moves, and when its last move was played. */
export interface StoredTournamentGame {
  id: number;
  week: number;
  round: number;
  day: number;
  player: string;
  seed: string;
  moves: SeededMove[];
  score: number;
  over: boolean;
  start: number;
  end: number;
  last: number;
}

/** An account's registration: its league group then, and when. */
export interface StoredTournamentEntry {
  player: string;
  group: number;
  at: number;
}

/** The mock's Tournament as stored: the accounts' games, their registrations by week, and each account's claimed weeks. */
export interface StoredTournament {
  nextId: number;
  games: Record<string, StoredTournamentGame>;
  registrations: Record<string, StoredTournamentEntry[]>;
  claims: Record<string, number[]>;
}

export const freshTournament = (): StoredTournament => ({ nextId: 1, games: {}, registrations: {}, claims: {} });

/** An account's name on the device; null: none set. */
export type TournamentNames = (address: string) => string | null;

const hex = (value: bigint): string => `0x${value.toString(16)}`;

/** A round's deck seed on the mock: Poseidon on the week and the round (on chain, the VRF's): the same 38 cards for every player of the round. */
export const tournamentRoundSeed = (week: number, round: number): bigint => poseidon(ROUND_SALT, BigInt(week * 8 + round));

/** A draw in [0, 1) from whole numbers: a cheap mix (the mock plays a week again at each read, Poseidon would be slow). */
function draw(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4_294_967_296;
}

/** An address as a whole number for the draws. */
const numberOf = (address: string): number => Number(BigInt(address) & 0x7fffffffn);

/** The mock's field: the players it adds to each league group (Wood first) so that a bracket fills; the top groups stay small and are carried down. */
const FIELD = [34, 30, 26, 22, 18, 12, 8, 4, 2] as const;
const FIRST = ["Va", "Mi", "To", "Ka", "El", "Bru", "Sy", "Or", "Ha", "Ny", "Ge", "Lu", "Da", "Fe", "Ro", "Ti"] as const;
const SECOND = ["el", "ra", "rin", "dor", "wen", "na", "lis", "mund", "ric", "the", "van", "ko"] as const;
/** A field player's address: `'tourn'` over their group and number, no account's and no community member's. */
const fieldAddress = (group: number, i: number): string => `0x746f75726e${(group * 256 + i).toString(16).padStart(4, "0")}`;
const fieldName = (group: number, i: number): string => `${FIRST[(group * 7 + i) % FIRST.length]}${SECOND[(group * 5 + i * 5 + Math.floor(i / FIRST.length)) % SECOND.length]}`;

/** A registered player: who they are, their league group, when they registered, and their strength (crowns) for the drawn games. */
interface Entrant extends TournamentPlayer {
  group: number;
  at: number;
  /** Null: an account, whose games are stored. */
  strength: number | null;
}

/** Everyone registered in `week` by `now`: the community's (about six in seven), the field, and the accounts. */
function entrantsOf(t: StoredTournament, week: number, now: number, names: TournamentNames): Entrant[] {
  const opens = tournamentWeekStart(week);
  const drawn: Entrant[] = [];
  for (const m of community()) {
    const who = numberOf(m.address);
    if (draw(1, who, week) >= 0.85) continue;
    drawn.push({ address: addressKey(m.address), name: m.name, profile: true, group: tournamentLeagueGroup(leagueIndex(m.crowns)), at: opens + Math.floor(draw(2, who, week) * TOURNAMENT_DAY_S), strength: m.crowns });
  }
  FIELD.forEach((count, group) => {
    for (let i = 0; i < count; i++) {
      const address = fieldAddress(group, i);
      const who = numberOf(address);
      if (draw(1, who, week) >= 0.9) continue;
      drawn.push({ address, name: fieldName(group, i), profile: false, group, at: opens + Math.floor(draw(2, who, week) * TOURNAMENT_DAY_S), strength: Math.floor((group + draw(3, who)) * 600) });
    }
  });
  const accounts = (t.registrations[week] ?? []).map((e): Entrant => ({ address: e.player, name: names(e.player) ?? "Player", profile: true, group: e.group, at: e.at, strength: null }));
  return [...drawn, ...accounts].filter((e) => e.at <= now).sort((a, b) => a.at - b.at || (a.address < b.address ? -1 : 1));
}

/** The players registered in each league group. */
const countsOf = (entrants: readonly Entrant[]): number[] => TOURNAMENT_LEAGUES.map((_, g) => entrants.filter((e) => e.group === g).length);

/** A player's game of `round` as the bracket counts it at `upTo`: an account's stored one, else the mock's drawn one (about one in sixteen skips). */
function playedOf(t: StoredTournament, entrant: Entrant, week: number, round: number, upTo: number): TournamentPlayed | null {
  if (entrant.strength === null) {
    const game = Object.values(t.games).find((g) => g.week === week && g.round === round && g.player === entrant.address);
    return game ? { score: game.score, at: game.last, over: game.over } : null;
  }
  const who = numberOf(entrant.address);
  if (draw(5, who, week, round) >= 0.94) return null;
  const at = tournamentRoundStart(week, round) + Math.floor(draw(6, who, week, round) * TOURNAMENT_DAY_S);
  if (at > upTo) return null;
  return { score: Math.round((900 + entrant.strength * 0.5) * (0.8 + 0.4 * draw(7, who, week, round))), at, over: true };
}

/** A bracket at `now`: its group, its players by number, and its seats round by round, as far as the days are over. */
interface Bracket {
  week: number;
  /** The group it plays in, and how many brackets the group has. */
  group: number;
  index: number;
  count: number;
  players: Entrant[];
  /** `rounds[0]` is the draw (round 1's seats); `rounds[r]` the seats round `r` sent on, once its day is over. */
  rounds: number[][];
}

/**
 * The bracket of `player` in `week` at `now`, with their number in it; null: they are not registered, or the draw is not made.
 * The groups are carried (`tournamentGroups`), the group is drawn (`tournamentDraw`, a shuffle drawn for the week and the group),
 * and each round whose day is over sends its winners on (`tournamentNextRound`).
 */
function bracketOf(t: StoredTournament, week: number, player: string, now: number, names: TournamentNames): { bracket: Bracket; me: number } | null {
  if (now < tournamentRoundStart(week, 1)) return null;
  const entrants = entrantsOf(t, week, tournamentRoundStart(week, 1) - 1, names);
  const own = entrants.find((e) => e.address === player);
  if (!own) return null;
  const into = tournamentGroups(countsOf(entrants));
  const group = into[own.group]!;
  const members = entrants.filter((e) => into[e.group] === group);
  let k = 0;
  const placed = tournamentDraw(members.length, () => draw(4, week, group, k++));
  const index = placed[members.indexOf(own)]!.bracket;
  const players: Entrant[] = [];
  const seats = new Array<number>(TOURNAMENT_SEATS).fill(TOURNAMENT_BYE);
  members.forEach((e, i) => {
    if (placed[i]!.bracket !== index) return;
    seats[placed[i]!.seat] = players.length;
    players.push(e);
  });
  const rounds = [seats];
  for (let round = 1; round <= TOURNAMENT_ROUNDS && now >= tournamentRoundEnd(week, round); round++) {
    const ends = tournamentRoundEnd(week, round);
    rounds.push(tournamentNextRound(rounds[round - 1]!, (p) => gameOf(playedOf(t, players[p]!, week, round, ends))));
  }
  return { bracket: { week, group, index, count: tournamentBracketCount(members.length), players, rounds }, me: players.indexOf(own) };
}

const gameOf = (played: TournamentPlayed | null): TournamentGame | null => played && { score: played.score, at: played.at };
const shown = (e: Entrant): TournamentPlayer => ({ address: e.address, name: e.name, profile: e.profile });

/** A player's path through `bracket` at `now`: each round they were in, with its duel as far as it is known. */
function pathOf(t: StoredTournament, bracket: Bracket, me: number, now: number): TournamentStep[] {
  const { week, players, rounds } = bracket;
  const seat0 = rounds[0]!.indexOf(me);
  const path: TournamentStep[] = [];
  for (let round = 1; round <= Math.min(rounds.length, TOURNAMENT_ROUNDS); round++) {
    const seats = rounds[round - 1]!;
    const seat = seat0 >> (round - 1);
    if (seats[seat] !== me) break;
    const other = seats[seat ^ 1]!;
    const kind = other === TOURNAMENT_BYE ? "bye" : other === TOURNAMENT_VACANT ? "walkover" : "duel";
    const decided = rounds[round];
    path.push({
      round,
      kind,
      opponent: other >= 0 ? shown(players[other]!) : null,
      own: kind === "bye" ? null : playedOf(t, players[me]!, week, round, now),
      theirs: other >= 0 ? playedOf(t, players[other]!, week, round, now) : null,
      outcome: !decided ? "pending" : decided[seat >> 1] !== me ? "lost" : kind === "bye" ? "skipped" : "won",
    });
  }
  return path;
}

/** The last eight of `bracket` at `now`: the matches of the quarter-finals on, for the rounds whose seats are known. */
function finalsOf(t: StoredTournament, bracket: Bracket, now: number): TournamentMatch[] {
  const { week, players, rounds } = bracket;
  const matches: TournamentMatch[] = [];
  for (let round = 4; round <= Math.min(rounds.length, TOURNAMENT_ROUNDS); round++) {
    const seats = rounds[round - 1]!;
    const side = (p: number) => (p >= 0 ? { player: shown(players[p]!), score: playedOf(t, players[p]!, week, round, now)?.score ?? null } : null);
    for (let i = 0; i < seats.length; i += 2) {
      const through = rounds[round]?.[i / 2];
      matches.push({ round, a: side(seats[i]!), b: side(seats[i + 1]!), winner: through === undefined || through < 0 ? null : through === seats[i] ? "a" : "b" });
    }
  }
  return matches;
}

/** The games of an account in a week, the oldest first. */
export const gamesOf = (t: StoredTournament, player: string, week: number): StoredTournamentGame[] =>
  Object.values(t.games)
    .filter((g) => g.week === week && g.player === addressKey(player))
    .sort((a, b) => a.id - b.id);

/** `player`'s run of `week` at `now`; null: they were not in it. */
export function runOf(t: StoredTournament, week: number, player: string, now: number, names: TournamentNames): TournamentRun | null {
  const key = addressKey(player);
  const found = bracketOf(t, week, key, now, names);
  if (!found) return null;
  const { bracket, me } = found;
  const path = pathOf(t, bracket, me, now);
  const last = path[path.length - 1]!;
  const champion = bracket.rounds.length > TOURNAMENT_ROUNDS && bracket.rounds[TOURNAMENT_ROUNDS]![0] === me;
  const status: TournamentStatus = champion ? "champion" : last.outcome !== "pending" ? "out" : last.kind === "bye" ? "waiting" : !last.own ? "to-play" : last.own.over ? "played" : "playing";
  const open = gamesOf(t, key, week).find((g) => !g.over) ?? null;
  const cobbles = tournamentCobbles(last.round, champion, path.some((s) => s.own !== null));
  const over = status === "out" || status === "champion";
  const claimed = t.claims[key]?.includes(week) ?? false;
  return {
    week,
    league: TOURNAMENT_LEAGUES[bracket.group]!,
    registeredIn: TOURNAMENT_LEAGUES[bracket.players[me]!.group]!,
    bracket: bracket.index + 1,
    brackets: bracket.count,
    players: bracket.players.length,
    path,
    status,
    reached: last.round,
    firstDuel: tournamentFirstRound(bracket.rounds[0]!, bracket.rounds[0]!.indexOf(me)),
    open: open && { id: open.id, score: open.score },
    cobbles,
    claimable: over && cobbles > 0 && !claimed,
    claimed,
    finals: finalsOf(t, bracket, now),
  };
}

/** `TournamentSource.state`: the week at `now` as `viewer` sees it; `group` is their league group now (null: no viewer). */
export function stateOf(t: StoredTournament, now: number, viewer: string | null, group: number | null, names: TournamentNames): TournamentState {
  const week = tournamentWeekOf(now);
  const round = tournamentRoundOf(now);
  const phase = tournamentPhaseOf(now);
  const key = viewer === null ? null : addressKey(viewer);
  const closes = tournamentRoundStart(week, 1) - 1;
  const entrants = entrantsOf(t, week, Math.min(now, closes), names);
  const own = key === null ? undefined : entrants.find((e) => e.address === key);
  // From Tuesday the groups are carried: the viewer's is the one their league's players play in.
  const mine = own?.group ?? group ?? 0;
  const into = phase === "rounds" ? tournamentGroups(countsOf(entrants)) : null;
  return {
    week,
    phase,
    round,
    endsAt: tournamentRoundEnd(week, round),
    league: group === null && !own ? null : TOURNAMENT_LEAGUES[mine]!,
    registered: !!own,
    entrants: entrants.filter((e) => (into ? into[e.group] === into[mine] : e.group === mine)).length,
    deckSeed: round === 0 ? null : hex(tournamentRoundSeed(week, round)),
    run: key === null ? null : runOf(t, week, key, now, names),
    last: key === null ? null : runOf(t, week - 1, key, now, names),
  };
}

/** A stored game as the source answers it: its round's deck seed and end, and the opponent's score at `now` as its target. */
export function recordOf(t: StoredTournament, game: StoredTournamentGame, now: number, names: TournamentNames): TournamentGameRecord {
  const step = runOf(t, game.week, game.player, now, names)?.path.find((s) => s.round === game.round);
  const { id, week, round, day, player, seed, score, over, start, end } = game;
  return { id, week, round, day, player, seed, score, over, start, end, moves: game.moves.map((m) => ({ ...m })), deckSeed: hex(tournamentRoundSeed(game.week, game.round)), endsAt: tournamentRoundEnd(game.week, game.round), target: step?.theirs?.score ?? null };
}

/** The game's engine, its moves played again. */
export const replayOf = (game: StoredTournamentGame): SeededChallenge => SeededChallenge.replay(BigInt(game.seed), BigInt(game.player), game.moves, tournamentRoundSeed(game.week, game.round));

/**
 * Registers `player` in league group `group` for the week at `now` (each refusal thrown with the contract's text): on Monday, once.
 */
export function register(t: StoredTournament, player: string, group: number, now: number): { week: number; group: number } {
  const week = tournamentWeekOf(now);
  const key = addressKey(player);
  if (tournamentPhaseOf(now) !== "registration") throw new Error("Tournament: the registration is closed");
  if (t.registrations[week]?.some((e) => e.player === key)) throw new Error("Tournament: already registered");
  (t.registrations[week] ??= []).push({ player: key, group, at: Math.floor(now) });
  return { week, group };
}

/**
 * `player`'s game of today's round at `now`, by the Tournament's rules (each refusal thrown): the rounds are on, they are registered,
 * still in, with a game to play today (no bye), and have not played it. Its random is from its id, as the VRF's spawn random would
 * be. The caller stores it.
 */
export function newGame(t: StoredTournament, player: string, now: number, names: TournamentNames): StoredTournamentGame {
  const week = tournamentWeekOf(now);
  const round = tournamentRoundOf(now);
  const key = addressKey(player);
  if (tournamentPhaseOf(now) !== "rounds") throw new Error("Tournament: the rounds have not begun");
  const run = runOf(t, week, key, now, names);
  if (!run) throw new Error("Tournament: not registered");
  if (run.status === "out") throw new Error("Tournament: eliminated");
  if (run.status === "waiting") throw new Error("Tournament: no duel this round");
  if (run.status === "playing") throw new Error("Tournament: a game is open");
  if (run.status !== "to-play") throw new Error("Tournament: one game per round");
  const id = t.nextId;
  const at = Math.floor(now);
  const game: StoredTournamentGame = { id, week, round, day: puzzleDayOf(now), player: key, seed: hex(poseidon(GAME_SALT, BigInt(key), BigInt(id))), moves: [], score: 0, over: false, start: at, end: 0, last: at };
  t.nextId = id + 1;
  t.games[id] = game;
  return game;
}

/** `move` played on `game` (the engine's refusal thrown, nothing changed), its score and its last move's time kept, its end when the move ends it. */
export function playMove(game: StoredTournamentGame, move: SeededMove, now: number): void {
  const engine = replayOf(game);
  engine.play(move);
  game.moves.push({ ...move });
  game.score = engine.score;
  // A surrender past the round's end changes no score: the game stays played at its last move.
  if (now < tournamentRoundEnd(game.week, game.round)) game.last = Math.floor(now);
  if (engine.over) {
    game.over = true;
    game.end = Math.floor(now);
  }
}

/** `TournamentSource.result`: a finished game's standing in its duel, read at `now`. */
export function gameResultOf(t: StoredTournament, game: StoredTournamentGame, now: number, names: TournamentNames): TournamentGameResult {
  const step = runOf(t, game.week, game.player, now, names)?.path.find((s) => s.round === game.round);
  const own = { score: game.score, at: game.last };
  const standing = !step ? "lost" : step.outcome === "won" ? "won" : step.outcome === "lost" ? "lost" : step.kind === "duel" && !step.theirs ? "waiting" : tournamentWinner(own, gameOf(step.theirs ?? null)) === "a" ? "ahead" : "behind";
  return { gameId: game.id, score: game.score, round: game.round, opponent: step?.opponent ?? null, theirs: step?.theirs ?? null, standing, secures: game.round >= TOURNAMENT_ROUNDS ? TOURNAMENT_CHAMPION_COBBLES : TOURNAMENT_COBBLES[game.round]! };
}

/** The Cobbles `player` claims for `week` at `now` (each refusal thrown), the claim recorded: a run that is over, with Cobbles, once. */
export function claim(t: StoredTournament, player: string, week: number, now: number, names: TournamentNames): number {
  const key = addressKey(player);
  const run = runOf(t, week, key, now, names);
  if (!run) throw new Error("Tournament: not registered");
  if (run.claimed) throw new Error("Tournament: already claimed");
  if (run.status !== "out" && run.status !== "champion") throw new Error("Tournament: the run is not over");
  if (run.cobbles === 0) throw new Error("Tournament: nothing to claim");
  (t.claims[key] ??= []).push(week);
  return run.cobbles;
}
