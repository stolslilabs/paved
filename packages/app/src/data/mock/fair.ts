import {
  FAIR_OFFERS,
  FAIR_TIERS,
  FAIR_TRIES,
  FairDraft,
  SeededChallenge,
  compareFair,
  fairBars,
  fairCounts,
  fairDayOf,
  fairEndsAt,
  fairIsMythic,
  fairRandomOf,
  fairSeasonOf,
  fairWeekDayOf,
  fairWeekOf,
  fairWeekStart,
  poseidon,
  rankFair,
  type FairBest,
  type SeededMove,
} from "@paved/game-core";
import { FAIR_RANKING_LIMIT, type FairChampion, type FairEntry, type FairRanking, type FairTryLine, type FairResult, type FairStage, type FairState, type FairTryRecord, type FairTryResult } from "../fair-source";
import { addressKey } from "../keys";
import { community } from "./community";
import type { GuildPeople } from "./guilds";

// The mock's Fair (the weekly individual event, game-core's `fair.ts`), the whole event on the device: the device's accounts draft
// their decks (`FairDraft`, a mix of the try's seed in place of the VRF's draws), play them by game-core's rules (`SeededChallenge` on
// the drafted cards) and claim their Cobbles; the community's bests of each week are drawn (never played), a week's champion's deck
// drafted by a bot. Pure functions on the stored state: `MockLedger` runs them under its lock, as `puzzle.ts`'s.

/** The salt of a try's random (`'FRTRY'`): its offers and its game's draws. */
const TRY_SALT = 0x4652545259n;

/** One try as stored: its week, the UTC day it started (its tries' count), its player's address key, its draft's picks, its game. */
export interface StoredFairTry {
  id: number;
  week: number;
  day: number;
  player: string;
  seed: string;
  picks: number[];
  /** Left during its draft: spent, with no score. */
  abandoned: boolean;
  moves: SeededMove[];
  score: number;
  over: boolean;
  start: number;
  end: number;
}

/** The mock's Fair as stored: the accounts' tries by id, the next id, each account's claimed weeks. */
export interface StoredFair {
  nextId: number;
  tries: Record<string, StoredFairTry>;
  claims: Record<string, number[]>;
}

export const freshFair = (): StoredFair => ({ nextId: 1, tries: {}, claims: {} });

const hex = (value: bigint): string => `0x${value.toString(16)}`;

/** A draw in [0, 1) from whole numbers: a cheap mix (the community's weeks are drawn again at each read). */
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

const numberOf = (address: string): number => Number(BigInt(address) & 0x7fffffffn);

/** A try's draft, its picks played again. */
export const draftOf = (t: StoredFairTry): FairDraft => FairDraft.replay(fairSeasonOf(t.week), fairRandomOf(BigInt(t.seed)), t.picks);

const stageOf = (t: StoredFairTry, draft: FairDraft): FairStage => (t.abandoned ? "abandoned" : draft.over ? "game" : "draft");

/** The account's tries of a week, the oldest first. */
export const triesOf = (fair: StoredFair, player: string, week: number): StoredFairTry[] =>
  Object.values(fair.tries)
    .filter((t) => t.week === week && t.player === addressKey(player))
    .sort((a, b) => a.id - b.id);

/** A stored try as the source answers it: its stage, its deck so far, its number among its player's of its day. */
export function recordOf(fair: StoredFair, t: StoredFairTry): FairTryRecord {
  const draft = draftOf(t);
  const number = 1 + triesOf(fair, t.player, t.week).filter((o) => o.day === t.day && o.id < t.id).length;
  const { abandoned: _abandoned, ...rest } = t;
  return { ...rest, moves: t.moves.map((m) => ({ ...m })), picks: [...t.picks], deckSeed: t.seed, season: fairSeasonOf(t.week), try: number, stage: stageOf(t, draft), cards: [...draft.deck], endsAt: fairEndsAt(t.week) };
}

/** The try's game, its moves played again on its drafted deck. */
export const replayOf = (t: StoredFairTry): SeededChallenge => SeededChallenge.replay(BigInt(t.seed), BigInt(t.player), t.moves, undefined, undefined, draftOf(t).deck);

/** The tries of a community's member in a week: about nine in ten play, two to nine tries over the week, each at a drawn time. */
function drawnTries(address: string, crowns: number, week: number): FairBest[] {
  const who = numberOf(address);
  if (draw(1, who, week) >= 0.9) return [];
  const count = 2 + Math.floor(draw(2, who, week) * 8);
  const start = fairWeekStart(week);
  return Array.from({ length: count }, (_, k) => ({
    at: start + Math.floor(draw(3, who, week, k) * (fairEndsAt(week) - start)),
    // A drafted deck's score, by the member's crowns, to the ten: the proposal's bots average about 2,000, its champion 6,688.
    score: Math.round(((1_500 + Math.min(2_600, crowns * 1.1)) * (0.55 + 0.9 * draw(4, who, week, k))) / 10) * 10,
  }));
}

/** A player's best of a week (`FairBest`) with their address key. */
export interface WeekBest extends FairBest {
  address: string;
}

const bestOf = <T extends FairBest>(list: readonly T[]): T | null => [...list].sort(compareFair)[0] ?? null;

/** The account's tries of a week whose game ended in it, by `now`. */
const finishedOf = (fair: StoredFair, player: string, week: number, now: number): StoredFairTry[] => triesOf(fair, player, week).filter((t) => t.over && !t.abandoned && t.end < fairEndsAt(week) && t.end <= now);

/** Every player's best of `week` set by `now`: the community's drawn tries, the accounts' finished ones. */
export function bestsOf(fair: StoredFair, week: number, now: number): WeekBest[] {
  const bests: WeekBest[] = [];
  for (const member of community()) {
    const best = bestOf(drawnTries(member.address, member.crowns, week).filter((t) => t.at <= now));
    if (best) bests.push({ address: addressKey(member.address), ...best });
  }
  for (const player of new Set(Object.values(fair.tries).map((t) => t.player))) {
    const best = bestOf(finishedOf(fair, player, week, now).map((t) => ({ score: t.score, at: t.end })));
    if (best) bests.push({ address: player, ...best });
  }
  return bests;
}

/** `week`'s ranking at `now`: the bests that count, the best first (`rankFair`). */
export const rankingAt = (fair: StoredFair, week: number, now: number) => rankFair(bestsOf(fair, week, now));

/** The deck of a player's best of `week`: the account's own try's, or for the community a bot's draft (a mythic taken one time in three). */
function deckOf(fair: StoredFair, address: string, week: number, score: number): number[] {
  const own = finishedOf(fair, address, week, fairEndsAt(week)).find((t) => t.score === score);
  if (own) return draftOf(own).deck;
  const who = numberOf(address);
  const draft = new FairDraft(fairSeasonOf(week), (offer, slot) => draw(5, who, week, offer, slot));
  while (!draft.over) {
    const offer = draft.offer!;
    const mythic = offer.cards.findIndex(fairIsMythic);
    const plain = offer.cards.findIndex((card) => !fairIsMythic(card));
    draft.pick(mythic >= 0 && draw(6, who, week, offer.number) < 0.34 ? mythic : Math.max(0, plain));
  }
  return draft.deck;
}

/** The finished `week` as `viewer` lived it; null: they finished no try in it. */
function resultOf(fair: StoredFair, people: GuildPeople, viewer: string, week: number): FairResult | null {
  const ends = fairEndsAt(week);
  const own = bestOf(finishedOf(fair, viewer, week, ends).map((t) => ({ score: t.score, at: t.end })));
  if (!own) return null;
  const ranking = rankingAt(fair, week, ends);
  const mine = ranking.find((r) => r.address === viewer) ?? null;
  const first = ranking[0];
  const champion: FairChampion | null = first ? { profile: people(first.address), score: first.score, cards: deckOf(fair, first.address, week, first.score) } : null;
  return {
    week,
    season: fairSeasonOf(week),
    players: ranking.length,
    best: own.score,
    place: mine?.place ?? null,
    tier: mine?.tier ?? null,
    cobbles: mine ? FAIR_TIERS[mine.tier]!.cobbles : 0,
    claimed: fair.claims[viewer]?.includes(week) ?? false,
    champion,
  };
}

/** The account's try of the week still open (the newest), or null. */
export function openTryOf(fair: StoredFair, player: string, week: number): StoredFairTry | null {
  return (
    triesOf(fair, player, week)
      .filter((t) => !t.over)
      .pop() ?? null
  );
}

/** `FairSource.state`: the week at `now` as `viewer` sees it. */
export function stateOf(fair: StoredFair, people: GuildPeople, now: number, viewer: string | null): FairState {
  const week = fairWeekOf(now);
  const ranking = rankingAt(fair, week, now);
  const base = { week, season: fairSeasonOf(week), day: fairWeekDayOf(now), dayEndsAt: (fairDayOf(now) + 1) * 86_400, endsAt: fairEndsAt(week), players: ranking.length };
  if (viewer === null) return { ...base, me: null, result: null };
  const key = addressKey(viewer);
  const today = triesOf(fair, key, week).filter((t) => t.day === fairDayOf(now)).length;
  const open = openTryOf(fair, key, week);
  const draft = open ? draftOf(open) : null;
  const best = bestOf(finishedOf(fair, key, week, now).map((t) => ({ score: t.score, at: t.end })));
  const mine = ranking.find((r) => r.address === key) ?? null;
  return {
    ...base,
    me: {
      triesToday: today,
      triesLeft: Math.max(0, FAIR_TRIES - today),
      open: open && draft ? { id: open.id, stage: draft.over ? "game" : "draft", offers: draft.over ? FAIR_OFFERS : draft.offer!.number - 1, tiles: draft.deck.length, score: open.score } : null,
      best: best?.score ?? null,
      place: mine?.place ?? null,
      tier: mine?.tier ?? null,
    },
    result: resultOf(fair, people, key, week - 1),
  };
}

/**
 * `FairSource.ranking`: the week's ranking so far, its first places, the viewer's own and the places around it, each tier's bar, the
 * viewer among their `friends` (address keys), and their own tries of the week.
 */
export function rankingOf(fair: StoredFair, people: GuildPeople, now: number, viewer: string | null, friends: readonly string[] = []): FairRanking {
  const week = fairWeekOf(now);
  const ranking = rankingAt(fair, week, now);
  const key = viewer === null ? null : addressKey(viewer);
  const mine = key === null ? null : (ranking.find((r) => r.address === key) ?? null);
  const entryOf = (r: (typeof ranking)[number]): FairEntry => {
    const deck = deckOf(fair, r.address, week, r.score);
    return { profile: people(r.address), score: r.score, place: r.place, tier: r.tier, tiles: deck.length, mythics: deck.filter(fairIsMythic).length };
  };
  const circle = new Set(key === null ? [] : [key, ...friends.map(addressKey)]);
  const own = key === null ? [] : triesOf(fair, key, week);
  const best = key === null ? null : (bestOf(finishedOf(fair, key, week, now).map((t) => ({ score: t.score, at: t.end, id: t.id })))?.id ?? null);
  return {
    week,
    players: ranking.length,
    entries: ranking.slice(0, FAIR_RANKING_LIMIT).map(entryOf),
    around: mine && mine.place > FAIR_RANKING_LIMIT ? ranking.slice(mine.place - 2, mine.place + 1).map(entryOf) : [],
    me: mine && { place: mine.place, score: mine.score, tier: mine.tier },
    bars: fairBars(ranking),
    friends: ranking.filter((r) => circle.has(r.address)).map((r, i) => ({ ...entryOf(r), place: i + 1 })),
    tries: own.map((t): FairTryLine => {
      const draft = draftOf(t);
      return { id: t.id, day: fairWeekDayOf(t.start), try: 1 + own.filter((o) => o.day === t.day && o.id < t.id).length, stage: stageOf(t, draft), over: t.over, score: t.score, tiles: draft.deck.length, mythics: draft.deck.filter(fairIsMythic).length, best: t.id === best };
    }),
  };
}

/**
 * A new try for `player` at `now`, by the Fair's rules (each refusal thrown with the contract's text): none open, one left today. It is
 * spent from here: its first offer is drawn. Its random is from its id, as the VRF's would be. Stored.
 */
export function newTry(fair: StoredFair, player: string, now: number): StoredFairTry {
  const week = fairWeekOf(now);
  const key = addressKey(player);
  const tries = triesOf(fair, key, week);
  if (tries.some((t) => !t.over)) throw new Error("Fair: a try is open");
  if (tries.filter((t) => t.day === fairDayOf(now)).length >= FAIR_TRIES) throw new Error("Fair: no try left today");
  const id = fair.nextId;
  const t: StoredFairTry = { id, week, day: fairDayOf(now), player: key, seed: hex(poseidon(TRY_SALT, BigInt(key), BigInt(id))), picks: [], abandoned: false, moves: [], score: 0, over: false, start: Math.floor(now), end: 0 };
  fair.nextId = id + 1;
  fair.tries[id] = t;
  return t;
}

/** Takes tile `choice` of offer `offer` of the try's draft (each refusal thrown, nothing changed). */
export function pick(t: StoredFairTry, offer: number, choice: number, now: number): void {
  if (t.over) throw new Error("Fair: the try is over");
  if (now >= fairEndsAt(t.week)) throw new Error("Fair: the week is over");
  const draft = draftOf(t);
  if (draft.over) throw new Error("Fair: the draft is over");
  if (draft.offer!.number !== offer) throw new Error("Fair: not the offer on the table");
  draft.pick(choice);
  t.picks.push(choice);
}

/** Leaves the try during its draft: over, with no score (refused once its game has begun: a game is surrendered). */
export function abandon(t: StoredFairTry, now: number): void {
  if (t.over) throw new Error("Fair: the try is over");
  if (draftOf(t).over) throw new Error("Fair: the draft is over");
  t.abandoned = true;
  t.over = true;
  t.end = Math.floor(now);
}

/** `move` played on the try's game (the engine's refusal thrown, nothing changed), its score kept, its end when the move ends it. */
export function playMove(t: StoredFairTry, move: SeededMove, now: number): void {
  if (!draftOf(t).over) throw new Error("Fair: the draft is not over");
  const engine = replayOf(t);
  engine.play(move);
  t.moves.push({ ...move });
  t.score = engine.score;
  if (engine.over) {
    t.over = true;
    t.end = Math.floor(now);
  }
}

/** `FairSource.result`: what a finished try did to its player's best, and where that stands at `now`. */
export function tryResultOf(fair: StoredFair, t: StoredFairTry, now: number): FairTryResult {
  const ends = fairEndsAt(t.week);
  const late = t.end >= ends;
  const tries = triesOf(fair, t.player, t.week);
  const counted = (o: StoredFairTry) => o.over && !o.abandoned && o.end < ends;
  const best = (list: StoredFairTry[]) => (list.length ? Math.max(...list.map((o) => o.score)) : null);
  const bestBefore = best(tries.filter((o) => counted(o) && o.id < t.id));
  const bestAfter = best(tries.filter((o) => counted(o) && o.id <= t.id));
  const ranking = rankingAt(fair, t.week, Math.min(now, ends));
  const mine = bestAfter !== null && fairCounts(bestAfter) ? (ranking.find((r) => r.address === t.player) ?? null) : null;
  const today = tries.filter((o) => o.day === fairDayOf(now)).length;
  return {
    tryId: t.id,
    score: t.score,
    try: 1 + tries.filter((o) => o.day === t.day && o.id < t.id).length,
    left: fairWeekOf(now) === t.week ? Math.max(0, FAIR_TRIES - today) : 0,
    bestBefore,
    bestAfter,
    place: mine?.place ?? null,
    tier: mine?.tier ?? null,
    players: ranking.length,
    late,
  };
}

/** The Cobbles `player` claims for `week` at `now` (each refusal thrown), the claim recorded: a week over, a counted try in it, once. */
export function claim(fair: StoredFair, people: GuildPeople, player: string, week: number, now: number): number {
  const key = addressKey(player);
  if (now < fairEndsAt(week)) throw new Error("Fair: the week is not over");
  if (fair.claims[key]?.includes(week)) throw new Error("Fair: already claimed");
  const result = resultOf(fair, people, key, week);
  if (!result || result.cobbles === 0) throw new Error("Fair: nothing to claim");
  (fair.claims[key] ??= []).push(week);
  return result.cobbles;
}
