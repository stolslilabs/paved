import {
  GUILD_RANK,
  JOUST_GAMES,
  JOUST_LOSS_COBBLES,
  JOUST_START_RATING,
  JOUST_TOP,
  JOUST_WIN_COBBLES,
  SeededChallenge,
  joustBoostOf,
  joustEndsAt,
  joustExpected,
  joustOpensAt,
  joustOutcome,
  joustPairs,
  joustPhaseOf,
  joustRatingChange,
  joustScore,
  joustWeekOf,
  joustWeekStart,
  poseidon,
  puzzleDayOf,
  type JoustOutcome,
  type JoustScore,
  type SeededMove,
} from "@paved/game-core";
import { addressKey } from "../keys";
import type { JoustGameRecord, JoustGameResult, JoustGuild, JoustRanking, JoustResult, JoustSide, JoustState } from "../joust-source";
import { communityMember } from "./community";
import type { GuildPeople, StoredGuild } from "./guilds";
import { SEEDED_FROM_DAY } from "./players";

// The mock's Joust (the weekly allegiance event, game-core's `joust.ts`), the whole event on the device: the seeded allegiances
// register by themselves and their members' games are drawn (never played), the device's accounts register, play their games by
// game-core's rules (`SeededChallenge` on the day's deck with the week's boost) and claim their Cobbles. Every week since the mock's
// first is played again from the guilds' world at each read: the draws, the totals, the ratings. Pure functions on the stored state
// and the guilds: `MockLedger` runs them under its lock, as `puzzle.ts`'s. A member counts for the weeks they joined before, by the
// guilds' world as it is now (the world keeps no history of who left): a departure moves the past weeks' totals, on the mock only.

/** The salts of the mock's draws: a day's deck (`'JOUST'`) and a game's random (`'JSGAME'`). */
const DAY_SALT = 0x4a4f555354n;
const GAME_SALT = 0x4a5347414d45n;

/** The first week the mock's allegiances jousted: the week after the seeded players' first day. */
export const JOUST_FIRST_WEEK = joustWeekOf(SEEDED_FROM_DAY * 86_400) + 1;

/** One joust game as stored: its week, the UTC day it started (its deck's), its allegiance, its player's address key, its moves. */
export interface StoredJoustGame {
  id: number;
  week: number;
  day: number;
  guild: number;
  player: string;
  seed: string;
  moves: SeededMove[];
  score: number;
  over: boolean;
  start: number;
  end: number;
}

/** The mock's Joust as stored: the accounts' games, the allegiances an account registered by week, each account's claimed weeks. */
export interface StoredJoust {
  nextId: number;
  games: Record<string, StoredJoustGame>;
  registrations: Record<string, number[]>;
  claims: Record<string, number[]>;
}

export const freshJoust = (): StoredJoust => ({ nextId: 1, games: {}, registrations: {}, claims: {} });

const hex = (value: bigint): string => `0x${value.toString(16)}`;

/** A day's deck seed on the mock: Poseidon on the day (on chain, the VRF's). */
export const joustDaySeed = (day: number): bigint => poseidon(DAY_SALT, BigInt(day));

/** A draw in [0, 1) from whole numbers: a cheap mix (the mock plays every week again at each read, Poseidon would be slow). */
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

const leaderOf = (guild: StoredGuild): string | null => guild.members.find((m) => m.rank === GUILD_RANK.leader)?.address ?? null;

/**
 * Whether `guild` is registered for `week` at `at`: an account registered it (`register`), or its leader is one of the community's,
 * whose part the mock plays: they register between Monday and Wednesday, at a time drawn for the week.
 */
export function registeredBy(joust: StoredJoust, guild: StoredGuild, week: number, at: number): boolean {
  if (guild.createdAt >= joustOpensAt(week)) return false;
  if (joust.registrations[week]?.includes(guild.id)) return true;
  const leader = leaderOf(guild);
  if (!leader || !communityMember(leader)) return false;
  return at >= joustWeekStart(week) + Math.floor(draw(1, guild.id, week) * 3 * 86_400);
}

/** The games the mock draws for a member of the community in a week: about six in seven joust, one to three games over the weekend. */
function drawnGames(address: string, week: number): { at: number; score: number }[] {
  const member = communityMember(address);
  if (!member) return [];
  const who = numberOf(address);
  if (draw(2, who, week) >= 0.85) return [];
  const count = 1 + Math.floor(draw(3, who, week) * JOUST_GAMES);
  const opens = joustOpensAt(week);
  const span = joustEndsAt(week) - opens;
  return Array.from({ length: count }, (_, k) => ({
    at: opens + Math.floor(draw(4, who, week, k) * span),
    // A Training game's score with one structure doubled, by the member's crowns, to the ten.
    score: Math.round(((1_100 + member.crowns * 0.55) * (0.8 + 0.4 * draw(5, who, week, k))) / 10) * 10,
  }));
}

/** A member who may joust in a week: their best game that counts by `now` (null: none yet) and the games they started. */
export interface Jouster {
  address: string;
  best: number | null;
  played: number;
}

/** The jousters of `guild` in `week` at `now`: its members since before Friday 00:00, the community's by their drawn games, the accounts by their stored ones. */
export function joustersOf(joust: StoredJoust, guild: StoredGuild, week: number, now: number): Jouster[] {
  const opens = joustOpensAt(week);
  const ends = joustEndsAt(week);
  return guild.members
    .filter((m) => m.joinedAt < opens)
    .map((m) => {
      if (communityMember(m.address)) {
        const games = drawnGames(m.address, week).filter((g) => g.at <= now);
        return { address: m.address, best: games.length ? Math.max(...games.map((g) => g.score)) : null, played: games.length };
      }
      const games = Object.values(joust.games).filter((g) => g.week === week && g.guild === guild.id && g.player === m.address);
      const counted = games.filter((g) => g.over && g.end < ends && g.end <= now);
      return { address: m.address, best: counted.length ? Math.max(...counted.map((g) => g.score)) : null, played: games.length };
    });
}

/** The jousters with a best, the best first. */
const ranked = (jousters: readonly Jouster[]) => jousters.filter((j): j is Jouster & { best: number } => j.best !== null).sort((a, b) => b.best - a.best);

const scoreOf = (jousters: readonly Jouster[]): JoustScore => joustScore(ranked(jousters).map((j) => j.best));

/** An allegiance's week: its opponent (null: a bye), its rating before, and once the week is over its totals, its outcome and its rating after. */
export interface JoustWeekEntry {
  opponent: number | null;
  before: number;
  after: number | null;
  outcome: JoustOutcome | "bye" | null;
  total: number | null;
  theirs: number | null;
}

/** Every week played again up to `now`: each allegiance's rating and peak, each week's draw and result, the jousts over. */
export interface JoustHistory {
  ratings: Map<number, number>;
  peaks: Map<number, number>;
  weeks: Map<number, Map<number, JoustWeekEntry>>;
  jousts: number;
}

/**
 * The Joust's history at `now`, from the mock's first week: each Friday the registered allegiances are drawn in their bands
 * (`joustPairs`, a shuffle drawn for the week), each Sunday's end the totals decide and the ratings move (a bye moves none).
 */
export function historyOf(joust: StoredJoust, guilds: readonly StoredGuild[], now: number): JoustHistory {
  const ratings = new Map<number, number>(guilds.map((g) => [g.id, JOUST_START_RATING]));
  const peaks = new Map(ratings);
  const weeks = new Map<number, Map<number, JoustWeekEntry>>();
  const byId = new Map(guilds.map((g) => [g.id, g] as const));
  let jousts = 0;
  for (let week = JOUST_FIRST_WEEK; now >= joustOpensAt(week); week++) {
    const opens = joustOpensAt(week);
    const ends = joustEndsAt(week);
    const entrants = guilds
      .filter((g) => registeredBy(joust, g, week, opens))
      .map((g) => ({ id: g.id, rating: ratings.get(g.id)! }))
      .sort((a, b) => a.id - b.id);
    let k = 0;
    const { pairs, bye } = joustPairs(entrants, () => draw(6, week, k++));
    const over = now >= ends;
    const entries = new Map<number, JoustWeekEntry>();
    for (const [a, b] of pairs) {
      if (!over) {
        entries.set(a.id, { opponent: b.id, before: a.rating, after: null, outcome: null, total: null, theirs: null });
        entries.set(b.id, { opponent: a.id, before: b.rating, after: null, outcome: null, total: null, theirs: null });
        continue;
      }
      const sa = scoreOf(joustersOf(joust, byId.get(a.id)!, week, ends));
      const sb = scoreOf(joustersOf(joust, byId.get(b.id)!, week, ends));
      const oa = joustOutcome(sa, sb);
      const ob = joustOutcome(sb, sa);
      entries.set(a.id, { opponent: b.id, before: a.rating, after: a.rating + joustRatingChange(a.rating, b.rating, oa), outcome: oa, total: sa.total, theirs: sb.total });
      entries.set(b.id, { opponent: a.id, before: b.rating, after: b.rating + joustRatingChange(b.rating, a.rating, ob), outcome: ob, total: sb.total, theirs: sa.total });
    }
    if (bye) entries.set(bye.id, { opponent: null, before: bye.rating, after: over ? bye.rating : null, outcome: over ? "bye" : null, total: over ? scoreOf(joustersOf(joust, byId.get(bye.id)!, week, ends)).total : null, theirs: null });
    weeks.set(week, entries);
    if (!over) break;
    if (entries.size > 0) jousts += 1;
    for (const [id, entry] of entries) {
      ratings.set(id, entry.after!);
      peaks.set(id, Math.max(peaks.get(id)!, entry.after!));
    }
  }
  return { ratings, peaks, weeks, jousts };
}

const shownGuild = (guild: StoredGuild): JoustGuild => ({ id: guild.id, name: guild.name, emblem: guild.settings.emblem });

/** The allegiance `player` is in, with their membership; null: none. */
export function guildOf(guilds: readonly StoredGuild[], player: string | null) {
  if (player === null) return null;
  const key = addressKey(player);
  for (const guild of guilds) {
    const member = guild.members.find((m) => m.address === key);
    if (member) return { guild, member };
  }
  return null;
}

function sideOf(joust: StoredJoust, guild: StoredGuild, rating: number, week: number, now: number, people: GuildPeople): JoustSide {
  const jousters = joustersOf(joust, guild, week, now);
  return {
    guild: shownGuild(guild),
    rating,
    total: scoreOf(jousters).total,
    jousters: jousters.filter((j) => j.played > 0).length,
    gamesLeft: jousters.reduce((sum, j) => sum + Math.max(0, JOUST_GAMES - j.played), 0),
    top: ranked(jousters)
      .slice(0, JOUST_TOP)
      .map((j) => ({ profile: people(j.address), best: j.best, played: Math.min(JOUST_GAMES, j.played) })),
  };
}

/** The Cobbles an outcome pays each jouster who played: a win's and a bye's, else the losers' (a draw's too: the proposal names none). */
export const cobblesOf = (outcome: JoustOutcome | "bye"): number => (outcome === "win" || outcome === "bye" ? JOUST_WIN_COBBLES : JOUST_LOSS_COBBLES);

/** Last week's joust of `guild` as `viewer` lived it; null: the allegiance did not joust. */
function resultOf(joust: StoredJoust, history: JoustHistory, guilds: readonly StoredGuild[], guild: StoredGuild, viewer: string, week: number, people: GuildPeople): JoustResult | null {
  const entry = history.weeks.get(week)?.get(guild.id);
  if (!entry || entry.outcome === null || entry.after === null) return null;
  const opponent = entry.opponent === null ? null : (guilds.find((g) => g.id === entry.opponent) ?? null);
  const top = ranked(joustersOf(joust, guild, week, joustEndsAt(week)));
  const place = top.findIndex((j) => j.address === viewer);
  const champion = top[0];
  const theirs = opponent ? history.weeks.get(week)?.get(opponent.id) : null;
  return {
    week,
    own: { guild: shownGuild(guild), total: entry.total ?? 0 },
    opponent: opponent ? { guild: shownGuild(opponent), total: entry.theirs ?? 0 } : null,
    outcome: entry.outcome,
    ratingBefore: entry.before,
    ratingAfter: entry.after,
    expected: theirs ? joustExpected(entry.before, theirs.before) : 1,
    best: place < 0 ? null : top[place]!.best,
    place: place < 0 ? null : place + 1,
    champion: champion ? { name: people(champion.address).name ?? "A jouster", score: champion.best } : null,
    cobbles: place < 0 ? 0 : cobblesOf(entry.outcome),
    claimed: joust.claims[viewer]?.includes(week) ?? false,
  };
}

/** The account's games of a week, the oldest first. */
export const gamesOf = (joust: StoredJoust, player: string, week: number): StoredJoustGame[] =>
  Object.values(joust.games)
    .filter((g) => g.week === week && g.player === addressKey(player))
    .sort((a, b) => a.id - b.id);

/** `JoustSource.state`: the week at `now` as `viewer` sees it. */
export function stateOf(joust: StoredJoust, guilds: readonly StoredGuild[], people: GuildPeople, now: number, viewer: string | null): JoustState {
  const week = joustWeekOf(now);
  const phase = joustPhaseOf(now);
  const base = { week, phase, boost: joustBoostOf(week), opensAt: joustOpensAt(week), endsAt: joustEndsAt(week), deckSeed: hex(joustDaySeed(puzzleDayOf(now))) };
  const mine = guildOf(guilds, viewer);
  if (!mine || viewer === null) return { ...base, guild: null, registered: false, match: null, me: null, result: null };
  const { guild, member } = mine;
  const key = addressKey(viewer);
  const history = historyOf(joust, guilds, now);
  const rating = history.ratings.get(guild.id) ?? JOUST_START_RATING;
  const registered = registeredBy(joust, guild, week, Math.min(now, base.opensAt));
  const entry = history.weeks.get(week)?.get(guild.id);
  const eligible = member.joinedAt < base.opensAt;
  let match: JoustState["match"] = null;
  let me: JoustState["me"] = null;
  if (phase === "live" && entry) {
    const opponent = entry.opponent === null ? null : (guilds.find((g) => g.id === entry.opponent) ?? null);
    const theirRating = opponent ? (history.ratings.get(opponent.id) ?? JOUST_START_RATING) : rating;
    match = { own: sideOf(joust, guild, rating, week, now, people), opponent: opponent ? sideOf(joust, opponent, theirRating, week, now, people) : null, expected: opponent ? joustExpected(rating, theirRating) : 1 };
    const games = gamesOf(joust, key, week);
    const top = ranked(joustersOf(joust, guild, week, now));
    const place = top.findIndex((j) => j.address === key);
    const open = games.find((g) => !g.over) ?? null;
    me = { eligible, played: games.length, left: eligible ? Math.max(0, JOUST_GAMES - games.length) : 0, best: place < 0 ? null : top[place]!.best, place: place < 0 ? null : place + 1, open: open && { id: open.id, score: open.score } };
  }
  return {
    ...base,
    guild: { ...shownGuild(guild), rating, members: guild.members.filter((m) => m.joinedAt < base.opensAt).length, canRegister: member.rank >= GUILD_RANK.officer },
    registered,
    match,
    me,
    result: resultOf(joust, history, guilds, guild, key, week - 1, people),
  };
}

/** `JoustSource.ranking`: the allegiances that jousted, by rating, each with its last joust's move. */
export function rankingOf(joust: StoredJoust, guilds: readonly StoredGuild[], now: number, viewer: string | null): JoustRanking {
  const history = historyOf(joust, guilds, now);
  const jousted = new Set([...history.weeks.values()].flatMap((entries) => [...entries.keys()]));
  // The last joust over: the current week's while its result is not out is the one before.
  const last = [...history.weeks.entries()].filter(([, entries]) => [...entries.values()].some((e) => e.after !== null)).pop()?.[1];
  const entries = guilds
    .filter((g) => jousted.has(g.id))
    .map((g) => {
      const move = last?.get(g.id);
      return { guild: shownGuild(g), rating: history.ratings.get(g.id)!, change: move && move.after !== null ? move.after - move.before : null };
    })
    .sort((a, b) => b.rating - a.rating || a.guild.id - b.guild.id)
    .map((e, i) => ({ place: i + 1, ...e }));
  const own = guildOf(guilds, viewer)?.guild.id ?? null;
  return { jousts: history.jousts, entries, own, peak: own === null ? null : (history.peaks.get(own) ?? null) };
}

/** A stored game as the source answers it: its day's deck seed, its week's boost and end, its number among its player's of the week. */
export function recordOf(joust: StoredJoust, game: StoredJoustGame): JoustGameRecord {
  const number = 1 + gamesOf(joust, game.player, game.week).findIndex((g) => g.id === game.id);
  return { ...game, moves: game.moves.map((m) => ({ ...m })), deckSeed: hex(joustDaySeed(game.day)), boost: joustBoostOf(game.week), game: Math.max(1, number), endsAt: joustEndsAt(game.week) };
}

/** The game's engine, its moves played again. */
export const replayOf = (game: StoredJoustGame): SeededChallenge => SeededChallenge.replay(BigInt(game.seed), BigInt(game.player), game.moves, joustDaySeed(game.day), joustBoostOf(game.week));

/**
 * A new game for `player` at `now`, by the Joust's rules (each refusal thrown with the contract's text): the joust is on, the player's
 * allegiance is registered and they were in it before Friday, they have a game left, none open, and none of this week for another
 * allegiance. Its random is from its id, as the VRF's spawn random would be. The caller stores it.
 */
export function newGame(joust: StoredJoust, guilds: readonly StoredGuild[], player: string, now: number): StoredJoustGame {
  const week = joustWeekOf(now);
  const key = addressKey(player);
  if (joustPhaseOf(now) !== "live") throw new Error("Joust: the joust has not begun");
  const mine = guildOf(guilds, key);
  if (!mine) throw new Error("Joust: not in an allegiance");
  if (!registeredBy(joust, mine.guild, week, joustOpensAt(week))) throw new Error("Joust: the allegiance is not registered");
  if (mine.member.joinedAt >= joustOpensAt(week)) throw new Error("Joust: joined after the draw");
  const games = gamesOf(joust, key, week);
  if (games.some((g) => g.guild !== mine.guild.id)) throw new Error("Joust: already jousting for another allegiance");
  if (games.some((g) => !g.over)) throw new Error("Joust: a game is open");
  if (games.length >= JOUST_GAMES) throw new Error("Joust: no game left");
  const id = joust.nextId;
  const game: StoredJoustGame = { id, week, day: puzzleDayOf(now), guild: mine.guild.id, player: key, seed: hex(poseidon(GAME_SALT, BigInt(key), BigInt(id))), moves: [], score: 0, over: false, start: Math.floor(now), end: 0 };
  joust.nextId = id + 1;
  joust.games[id] = game;
  return game;
}

/** `move` played on `game` (the engine's refusal thrown, nothing changed), its score kept, its end when the move ends it. */
export function playMove(game: StoredJoustGame, move: SeededMove, now: number): void {
  const engine = replayOf(game);
  engine.play(move);
  game.moves.push({ ...move });
  game.score = engine.score;
  if (engine.over) {
    game.over = true;
    game.end = Math.floor(now);
  }
}

/** `JoustSource.result`: what a finished game did to its player's best and to their allegiance's total, read at `now`. */
export function gameResultOf(joust: StoredJoust, guilds: readonly StoredGuild[], game: StoredJoustGame, now: number): JoustGameResult {
  const ends = joustEndsAt(game.week);
  const late = game.end >= ends;
  const games = gamesOf(joust, game.player, game.week);
  const counted = (g: StoredJoustGame) => g.over && g.end < ends;
  const best = (list: StoredJoustGame[]) => (list.length ? Math.max(...list.map((g) => g.score)) : null);
  const bestBefore = best(games.filter((g) => g.id !== game.id && counted(g) && g.id < game.id));
  const bestAfter = best(games.filter((g) => counted(g) && g.id <= game.id));
  const guild = guilds.find((g) => g.id === game.guild);
  const others = guild ? joustersOf(joust, guild, game.week, now).filter((j) => j.address !== game.player) : [];
  const total = (mine: number | null) => scoreOf([...others, { address: game.player, best: mine, played: 1 }]).total;
  return { gameId: game.id, score: game.score, game: 1 + games.findIndex((g) => g.id === game.id), left: Math.max(0, JOUST_GAMES - games.length), bestBefore, bestAfter, totalBefore: total(bestBefore), totalAfter: total(bestAfter), late };
}

/**
 * Registers `player`'s allegiance for the week at `now` (each refusal thrown): during the registration, by an Officer or the Leader,
 * once.
 */
export function register(joust: StoredJoust, guilds: readonly StoredGuild[], player: string, now: number): { week: number; guild: number } {
  const week = joustWeekOf(now);
  if (joustPhaseOf(now) !== "registration") throw new Error("Joust: the registration is closed");
  const mine = guildOf(guilds, player);
  if (!mine) throw new Error("Joust: not in an allegiance");
  if (mine.member.rank < GUILD_RANK.officer) throw new Error("Joust: only an Officer or the Leader registers");
  if (registeredBy(joust, mine.guild, week, now)) throw new Error("Joust: already registered");
  (joust.registrations[week] ??= []).push(mine.guild.id);
  return { week, guild: mine.guild.id };
}

/** The Cobbles `player` claims for `week` at `now` (each refusal thrown), the claim recorded: a joust over, that they played, once. */
export function claim(joust: StoredJoust, guilds: readonly StoredGuild[], people: GuildPeople, player: string, week: number, now: number): number {
  const key = addressKey(player);
  if (now < joustEndsAt(week)) throw new Error("Joust: the joust is not over");
  if (joust.claims[key]?.includes(week)) throw new Error("Joust: already claimed");
  const played = gamesOf(joust, key, week).find((g) => g.over && g.end < joustEndsAt(week));
  const guild = played && guilds.find((g) => g.id === played.guild);
  const result = guild ? resultOf(joust, historyOf(joust, guilds, now), guilds, guild, key, week, people) : null;
  if (!result || result.cobbles === 0) throw new Error("Joust: nothing to claim");
  (joust.claims[key] ??= []).push(week);
  return result.cobbles;
}
