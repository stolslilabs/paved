import type { BuilderView, DayView, DrawView, GameView, PlayerGame, PriceView, QuoteView, TermsView, TileView } from "@paved/chain";
import { SeededChallenge, dayAdd, dayAverage, dayMean, emaMean, emaPush, estimatedReference, newEma, rewardOf, thresholdOfMean, type MeanDay, type SeededMove, type SeededOutcome } from "@paved/game-core";
import { ENTRY_PRICE, GUARD_RATE, SPLIT_BPS, poolQuote } from "../../mocks/economy";

// The mock's Challenge and Economy (#927, PR 4 of 6): a game's purchase, spawn, moves, end and settlement on the device, by
// game-core's rules (`SeededChallenge`, the mean of `mean.cairo`, the curve of `curve.cairo`), with a random kept with each
// game in place of the VRF's (open point 3). Plain functions on the stored state: the ledger (`ledger.ts`) holds it, runs each
// write under its lock and moves the tokens. Nothing here reads the chain.

/** A day, in seconds (`DAY` of the contracts). */
export const DAY_S = 86_400;
/** A game expires 24 h after its start (S1; a paid game's 24 h, P-34). */
export const GAME_VALIDITY_S = 86_400;
/** The Challenge's mode code (`MODE_CODE.challenge`). */
const CHALLENGE_MODE = 1;
/** The kind of a game's random (open point 3): `poseidon(SPAWN, player, id, start)`, its spawn's stand-in for the VRF's. */
export const SPAWN_DRAW = 0x535041574en;
/** `Economy.config()` at the fresh deployment: no shift of the threshold, `c` 1.222, `H` 5 (economy.md section 2, P-46). */
export const MOCK_TERMS = { sigmaBps: 0, slopeBps: 12_220, cap: 5 } as const;
/** The supply factor `F` of the mock, bps: the supply is at its target (no PAVED supply to read). */
export const MOCK_FACTOR_BPS = 10_000;
/** The mock's `Economy.router()`: no router, no swap (the pool's quote is the mock's, `mocks/economy.ts`). */
const MOCK_ROUTER = "0x0";
const BPS = 10_000n;

/** One game, as stored: its record, its moves, and its terms when it was bought (`stake` 0: a free game, no terms). */
export interface StoredGame {
  id: number;
  /** `addressKey` of the player. */
  player: string;
  /** The random it spawned with (hex): its deck and every draw. */
  seed: string;
  /** Seconds: the spawn, and the end (0 while in play). */
  start: number;
  end: number;
  moves: SeededMove[];
  /** 1 to 10 for a bought game, 0 for a free one. */
  stake: number;
  /** Base units, as decimal strings (JSON has no bigint): USDC paid, `R` in PAVED, the reward minted. */
  price: string;
  reference: string;
  sigmaBps: number;
  slopeBps: number;
  cap: number;
  recorded: boolean;
  expired: boolean;
  settled: boolean;
  reward: string;
}

/** A day of the Economy, as stored: its prior and its games (`MeanDay`), and its mean once closed (0 until then). */
interface StoredDay {
  prior: number;
  sum: string;
  weight: number;
  mean: number;
}

/** The mock's Challenge and Economy: the games by id, the days, the EMA, the next id. */
export interface StoredChallenge {
  next: number;
  games: Record<string, StoredGame>;
  days: Record<string, StoredDay>;
  ema: { sum: string; weight: number };
}

export const freshChallenge = (): StoredChallenge => {
  const ema = newEma();
  return { next: 1, games: {}, days: {}, ema: { sum: ema.sum.toString(), weight: ema.weight } };
};

export const dayOfTime = (seconds: number): number => Math.floor(seconds / DAY_S);
export const expiryOf = (game: Pick<StoredGame, "start">): number => game.start + GAME_VALIDITY_S;

/** The games last replayed, by id and moves: a read replays a game once per move, not once per read. */
const replays = new Map<string, { moves: number; game: SeededChallenge }>();

/** A stored game on the engine, its moves played again (from the cache when it has them all). */
export function replayOf(game: StoredGame): SeededChallenge {
  const key = `${game.player}:${game.id}:${game.seed}`;
  const kept = replays.get(key);
  if (kept && kept.moves === game.moves.length) return kept.game;
  const played = SeededChallenge.replay(BigInt(game.seed), BigInt(game.player), game.moves);
  replays.set(key, { moves: game.moves.length, game: played });
  return played;
}

/** What a game over reports to the quests and achievements (`quests.cairo`'s `Tally`): its score and counters, clamped as stored. */
export interface GameTally {
  score: number;
  /** Roads and cities scored (task 2). */
  structures: number;
  /** Forests scored (task 4). */
  forests: number;
  /** Wonders scored (task 5). */
  wonders: number;
  /** Roads and cities of `BIG_SIZE` tiles or more scored (task 6). */
  big: number;
}

/** `Category` codes of the `Scored` events (`CategoryType`'s order). */
const FOREST = 1;
const ROAD = 2;
const CITY = 3;
const WONDER = 5;
/** `constants::BIG_SIZE`. */
const BIG_SIZE = 8;

/** The tallies counted, by game and moves: a game over never moves again. */
const tallies = new Map<string, { moves: number; tally: GameTally }>();

/**
 * The tally of a stored game (`quests::tally`): its moves played again and every `Scored` event counted, the counters clamped
 * to their widths in `GameState` (7, 6, 4 and 6 bits).
 */
export function tallyOf(game: StoredGame): GameTally {
  const key = `${game.player}:${game.id}:${game.seed}`;
  const kept = tallies.get(key);
  if (kept && kept.moves === game.moves.length) return kept.tally;
  const played = new SeededChallenge(BigInt(game.seed), BigInt(game.player));
  const counts = { structures: 0, forests: 0, wonders: 0, big: 0 };
  for (const move of game.moves) {
    for (const s of played.play(move).scored) {
      if (s.category === ROAD || s.category === CITY) {
        counts.structures += 1;
        if (s.size >= BIG_SIZE) counts.big += 1;
      } else if (s.category === FOREST) counts.forests += 1;
      else if (s.category === WONDER) counts.wonders += 1;
    }
  }
  const tally = { score: played.score, structures: Math.min(counts.structures, 0x7f), forests: Math.min(counts.forests, 0x3f), wonders: Math.min(counts.wonders, 0xf), big: Math.min(counts.big, 0x3f) };
  tallies.set(key, { moves: game.moves.length, tally });
  return tally;
}

/** `Challenge.game(id)` of a stored game. */
export function gameView(game: StoredGame): GameView {
  const view = replayOf(game).view();
  return { id: game.id, playerId: game.player, mode: CHALLENGE_MODE, ...view, startTime: game.start, endTime: game.end, dayId: dayOfTime(game.start), expiresAt: expiryOf(game) };
}

export const tilesOf = (game: StoredGame): TileView[] => replayOf(game).tiles();

/** `Challenge.draw(id)`: the queue of a VRF game; the mock never waits for a draw, so its salt is 0x0. */
export function drawOf(game: StoredGame): DrawView {
  return { gameId: game.id, ...replayOf(game).draw(), salt: "0x0" };
}

export function builderOf(game: StoredGame, playerId: string): BuilderView {
  const view = replayOf(game).view();
  return { gameId: game.id, playerId, tileId: BigInt(playerId) === BigInt(game.player) ? view.tileId : 0, plan: BigInt(playerId) === BigInt(game.player) ? view.plan : 0 };
}

/** `Challenge.entry_price()`: 2 USDC per stake; the token is the mock's USDC (the ledger's, no address). */
export const entryPrice = (): PriceView => ({ token: "0x0", amount: ENTRY_PRICE });

export const router = (): string => MOCK_ROUTER;

/** `Economy.rate()`: the guard's rate of the mocks, 80 PAVED per USDC. */
export const guardRate = (): bigint => GUARD_RATE;

/** The pool's `quote_swap`: 76 PAVED per USDC, the guard's rate less the pool's fee. */
export const quoteSwap = (usdcIn: bigint): bigint => poolQuote(usdcIn);

/** The mean a purchase of today is priced against: the day's prior once it has one, else the EMA's (`Economy.quote`). */
function meanOn(c: StoredChallenge, day: number): number {
  return c.days[day]?.prior || emaMean(emaOf(c));
}

const emaOf = (c: StoredChallenge) => ({ sum: BigInt(c.ema.sum), weight: c.ema.weight });

/** `Economy.quote(stake)`: the split of the mocks (`MOCK_SPLIT`), the mean of today. */
export function quoteOf(c: StoredChallenge, stake: number, now: number): QuoteView {
  const price = ENTRY_PRICE * BigInt(stake);
  const burnQuote = (price * BigInt(SPLIT_BPS.burn)) / BPS;
  const mean = meanOn(c, dayOfTime(now));
  return {
    price,
    burnQuote,
    referral: (price * BigInt(SPLIT_BPS.referral)) / BPS,
    margin: price - burnQuote,
    minOutHint: (burnQuote * GUARD_RATE) / 10n ** 18n,
    factor: MOCK_FACTOR_BPS,
    mean,
    threshold: thresholdOfMean(mean, MOCK_TERMS.sigmaBps),
    slope: MOCK_TERMS.slopeBps,
    cap: MOCK_TERMS.cap,
  };
}

/** `Economy.day(day)`: its sum, weight and mean stay 0 until it closes (P-34). */
export function dayView(c: StoredChallenge, day: number): DayView {
  const d = c.days[day];
  if (!d) return { prior: 0, sum: 0n, weight: 0, mean: 0, closed: false };
  const closed = d.mean !== 0;
  return { prior: d.prior, sum: closed ? BigInt(d.sum) : 0n, weight: closed ? d.weight : 0, mean: d.mean, closed };
}

/** `Economy.terms(id)`: a free game, or an id never bought, reads as not bought. */
export function termsOf(game: StoredGame | undefined): TermsView {
  if (!game || game.stake === 0) {
    return { player: "0x0", time: 0, day: 0, stake: 0, reference: 0n, sigmaBps: 0, slopeBps: 0, cap: 0, score: 0, recorded: false, expired: false, settled: false, reward: 0n };
  }
  return {
    player: game.player,
    time: game.start,
    day: dayOfTime(game.start),
    stake: game.stake,
    reference: BigInt(game.reference),
    sigmaBps: game.sigmaBps,
    slopeBps: game.slopeBps,
    cap: game.cap,
    score: game.recorded ? replayOf(game).score : 0,
    recorded: game.recorded,
    expired: game.expired,
    settled: game.settled,
    reward: BigInt(game.reward),
  };
}

/** The player's games as `EventReader.playerGames` lists them, newest first. */
export function playerGamesOf(c: StoredChallenge, player: string): PlayerGame[] {
  return Object.values(c.games)
    .filter((g) => g.player === player)
    .map((g): PlayerGame => {
      const over = g.end !== 0;
      const day = dayOfTime(g.start);
      return { mode: "challenge", gameId: g.id, startTime: g.start, dayId: day, over, score: over ? replayOf(g).score : null, countedDayId: over ? (dayOfTime(g.end) === day ? day : 0) : null };
    })
    .sort((a, b) => b.startTime - a.startTime || b.gameId - a.gameId);
}

/** What a purchase pays and stores: its price, the swap's PAVED (burn and Vault parts) and `R`. */
export interface PurchaseFigures {
  price: bigint;
  burnQuote: bigint;
  swapIn: bigint;
  poolOut: bigint;
  burned: bigint;
  vaultPaved: bigint;
  reference: bigint;
}

/** A purchase of `stake` now, with no referrer (the mock pays none, as its packs): the one swap of the price less nothing. */
export function purchaseFigures(c: StoredChallenge, stake: number, now: number): PurchaseFigures {
  const quote = quoteOf(c, stake, now);
  const swapIn = quote.price;
  const poolOut = quoteSwap(swapIn);
  // `curve::vault_split`: the burn quote's share of the PAVED bought, rounded up to the burn; the rest is the Vault's.
  const burned = poolOut - (poolOut * (swapIn - quote.burnQuote)) / swapIn;
  const reference = estimatedReference({ poolOut, swapIn, burnQuote: quote.burnQuote, rate: GUARD_RATE, stake, factorBps: quote.factor });
  return { price: quote.price, burnQuote: quote.burnQuote, swapIn, poolOut, burned, vaultPaved: poolOut - burned, reference };
}

/**
 * Spawns a game for `player` (`Challenge.spawn` after `Economy.purchase`, or `spawn_free` with `stake` 0): the next id, a
 * seed drawn from the spawn, and for a bought game its terms; today gets its prior at its first purchase.
 */
export function spawn(c: StoredChallenge, player: string, now: number, bought: { stake: number; figures: PurchaseFigures } | null, seed: bigint): StoredGame {
  const id = c.next;
  c.next += 1;
  const game: StoredGame = {
    id,
    player,
    seed: `0x${seed.toString(16)}`,
    start: now,
    end: 0,
    moves: [],
    stake: bought?.stake ?? 0,
    price: (bought?.figures.price ?? 0n).toString(),
    reference: (bought?.figures.reference ?? 0n).toString(),
    sigmaBps: bought ? MOCK_TERMS.sigmaBps : 0,
    slopeBps: bought ? MOCK_TERMS.slopeBps : 0,
    cap: bought ? MOCK_TERMS.cap : 0,
    recorded: false,
    expired: false,
    settled: false,
    reward: "0",
  };
  c.games[id] = game;
  const day = dayOfTime(now);
  if (bought && !c.days[day]) c.days[day] = { prior: emaMean(emaOf(c)), sum: "0", weight: 0, mean: 0 };
  return game;
}

/**
 * Plays `move` on `game` (`Challenge.build`, `discard`, `surrender`): the engine refuses an illegal move and nothing is kept.
 * A move that ends the game records it (`Economy.record`): before its 24 h a bought game's score enters its day, after them it
 * is expired.
 */
export function playMove(c: StoredChallenge, game: StoredGame, move: SeededMove, now: number): SeededOutcome {
  const played = SeededChallenge.replay(BigInt(game.seed), BigInt(game.player), game.moves);
  const outcome = played.play(move);
  game.moves = [...game.moves, move];
  replays.set(`${game.player}:${game.id}:${game.seed}`, { moves: game.moves.length, game: played });
  if (outcome.over) {
    game.end = now;
    if (game.stake > 0) {
      game.recorded = true;
      game.expired = now >= expiryOf(game);
      const day = c.days[dayOfTime(game.start)];
      if (!game.expired && day && day.mean === 0) {
        const added = dayAdd(storedDay(day), outcome.score, game.stake);
        day.sum = added.sum.toString();
        day.weight = added.weight;
      }
    }
  }
  return outcome;
}

const storedDay = (d: StoredDay): MeanDay => ({ prior: d.prior, sum: BigInt(d.sum), weight: d.weight });

/**
 * Settles a recorded game whose day may close (`Economy.settle`, the caller checked it): the day's mean is fixed at its first
 * settlement and folded into the EMA once, then the reward is the curve's against its threshold (0 for an expired game).
 */
export function settleGame(c: StoredChallenge, game: StoredGame): { day: number; score: number; threshold: number; reward: bigint } {
  const dayId = dayOfTime(game.start);
  const day = (c.days[dayId] ??= { prior: emaMean(emaOf(c)), sum: "0", weight: 0, mean: 0 });
  if (day.mean === 0) {
    const stored = storedDay(day);
    day.mean = dayMean(stored);
    const ema = emaPush(emaOf(c), dayAverage(stored), stored.weight);
    c.ema = { sum: ema.sum.toString(), weight: ema.weight };
  }
  const threshold = thresholdOfMean(day.mean, game.sigmaBps);
  const score = replayOf(game).score;
  const reward = game.expired ? 0n : rewardOf(BigInt(game.reference), score, threshold, game.slopeBps, game.cap);
  game.settled = true;
  game.reward = reward.toString();
  return { day: dayId, score, threshold, reward };
}
