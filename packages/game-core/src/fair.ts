import { DECKS } from "./engine/decks";
import { PlanType } from "./types/plan";

// The Fair (the weekly individual event, the design proposal of 2026-11-09): the season's deck-building event. A try is a draft, then
// a game: twenty offers of three distinct tiles drawn from the base deck's 72 cards (the market), one of each offer from the season's
// stall; the tiles taken are the deck, played after the starter in an order the chain draws, by a Training game's rules. A mythic
// costs two picks: the offer after it passes. Three tries a day, the best of the week ranks, and the week pays in Cobbles by tier. The
// rules the client and the contracts will share: the calendar, the market, the draft, the ranking and the rewards. Every figure is the
// proposal's, to be calibrated before the contracts. The client runs one Fair every week (the owner's ask of 2026-11-10: a new one
// starts when one ends), in place of the proposal's one a season.

/** A Fair's week: Monday 00:00 UTC to the next. */
export const FAIR_WEEK_S = 7 * 86_400;
const DAY_S = 86_400;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The offers of a draft. */
export const FAIR_OFFERS = 20;
/** The tiles of an offer, each of a plan of its own. */
export const FAIR_OFFER_TILES = 3;
/** The tries a player may start in a UTC day; none is carried over. */
export const FAIR_TRIES = 3;
/** The least a week's best try must score to count in the ranking. */
export const FAIR_FLOOR = 1_000;

/** The Fair week of a time, in seconds since the epoch. */
export const fairWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / FAIR_WEEK_S);
/** When a week starts (Monday 00:00 UTC). */
export const fairWeekStart = (week: number): number => FIRST_MONDAY_S + week * FAIR_WEEK_S;
/** When a week ends (Sunday 24:00 UTC, the next week's start): a try counts only when its game ends before. */
export const fairEndsAt = (week: number): number => fairWeekStart(week + 1);
/** The UTC day of a time: the tries are counted by it. */
export const fairDayOf = (seconds: number): number => Math.floor(seconds / DAY_S);
/** A time's day of its week, 0 Monday to 6 Sunday. */
export const fairWeekDayOf = (seconds: number): number => fairDayOf(seconds) - fairDayOf(fairWeekStart(fairWeekOf(seconds)));

/** A season: its stall holds the plans that build its structure. */
export type FairSeason = "winter" | "spring" | "summer" | "autumn";
const SEASONS: readonly FairSeason[] = ["winter", "spring", "summer", "autumn"];
/** The season of a week's stall: the four in turn, a week each (on the client; the proposal's is the calendar's season). */
export const fairSeasonOf = (week: number): FairSeason => SEASONS[((week % 4) + 4) % 4]!;

const P = PlanType;
/** Each season's stall: its structure and the plans that build it (8, 4, 2 and 6 plans; 26, 22, 6 and 21 of the 72 cards). */
export const FAIR_STALLS: Record<FairSeason, { structure: string; line: string; plans: readonly PlanType[] }> = {
  winter: { structure: "cities", line: "A city on two sides or more.", plans: [P.CCCCCCCCC, P.CCCCCFFFC, P.CCCCCFRFC, P.CFFFCFFFC, P.FFCFFFCFF, P.FFCFFFFFC, P.FFFFCCCFF, P.RFRFCCCFR] },
  spring: { structure: "roads", line: "The roads with no city: straight, bend, junction, crossroads.", plans: [P.RFFFRFFFR, P.RFRFFFFFR, P.SFRFRFFFR, P.SFRFRFRFR] },
  summer: { structure: "wonders", line: "The two wonders. The market caps a deck at six.", plans: [P.WFFFFFFFF, P.WFFFFFFFR] },
  autumn: { structure: "forests", line: "A road and a city with a forest between them.", plans: [P.RFFFRFCFR, P.RFRFFFCFR, P.RFRFRFCFF, P.SFRFRFCFR, P.CCCCCFRFC, P.RFRFCCCFR] },
};

/** The market's cards: the base deck's 72, by their index (0 to 71). */
export const FAIR_MARKET = DECKS.simple.total;
const PLANS = Object.values(PlanType);
/** The plan of a market card (the base deck's: the engine's deck bit `card`). */
export const fairPlanOf = (card: number): PlanType => DECKS.simple.plan(card + 1);
/** A market card's plan as the chain's code (1 to 19). */
export const fairPlanCodeOf = (card: number): number => PLANS.indexOf(fairPlanOf(card));

const COPIES = new Map<PlanType, number>();
for (let card = 0; card < FAIR_MARKET; card++) COPIES.set(fairPlanOf(card), (COPIES.get(fairPlanOf(card)) ?? 0) + 1);
/** Whether a market card is a mythic: its plan has one or two copies among the 72 (4 plans, 6 cards). */
export const fairIsMythic = (card: number): boolean => (COPIES.get(fairPlanOf(card)) ?? 0) <= 2;
/** Whether a market card is of a season's stall. */
export const fairInStall = (card: number, season: FairSeason): boolean => FAIR_STALLS[season].plans.includes(fairPlanOf(card));

/** A deck's plans as a game plays them: the starter (on the board from the start), then the cards taken, in pick order. */
export const fairDeckPlans = (cards: readonly number[]): PlanType[] => [PlanType.RFFFRFCFR, ...cards.map(fairPlanOf)];

/** One offer: its number (1 to `FAIR_OFFERS`), its three cards, and whether the first is from the season's stall. */
export interface FairOffer {
  number: number;
  cards: number[];
  stall: boolean;
}

/** A draw of the draft in [0, 1): slot `slot` (0 to 2) of offer `offer`. On chain, the VRF's as the draft goes. */
export type FairRandom = (offer: number, slot: number) => number;

/**
 * The draws of a try from its seed, a cheap mix: the client's stand-in for the VRF's, so a try's offers are its own and a draft
 * replays the same from its seed and its picks.
 */
export function fairRandomOf(seed: bigint): FairRandom {
  const base = Number(seed & 0x7fffffffn) ^ Number((seed >> 31n) & 0x7fffffffn);
  return (offer, slot) => {
    let h = 0x9e3779b9;
    for (const part of [base, offer, slot]) {
      h = Math.imul(h ^ (part | 0), 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
    }
    return (h >>> 0) / 4_294_967_296;
  };
}

/**
 * A draft: twenty offers, one tile taken of each. The player sees the offer and the next one; a card taken leaves the market, so a deck
 * never holds more copies of a tile than the base deck. Each card is drawn among the cards left (the base deck's odds), each of an
 * offer of a plan of its own; the first of every offer among the season's stall while it has a card left. A mythic taken passes the
 * offer after it (already shown): the deck holds one tile fewer. The last offer shows no mythic (no offer is left to pass), and the
 * next offer never shows a card of the current one (it is drawn before the pick).
 */
export class FairDraft {
  /** The cards taken, in pick order: the deck. */
  readonly deck: number[] = [];
  /** The choices made (0 to 2), one per offer answered: with the seed, the whole draft. */
  readonly picks: number[] = [];
  /** The offers a mythic passed, by number. */
  readonly passed: number[] = [];
  private current: FairOffer | null;
  private upcoming: FairOffer | null;

  constructor(
    readonly season: FairSeason,
    private readonly random: FairRandom,
  ) {
    this.current = this.draw(1, []);
    this.upcoming = this.draw(2, this.current.cards);
  }

  /** The draft of `picks` played again, in order. Throws when a pick is not legal. */
  static replay(season: FairSeason, random: FairRandom, picks: readonly number[]): FairDraft {
    const draft = new FairDraft(season, random);
    for (const choice of picks) draft.pick(choice);
    return draft;
  }

  /** The offer to answer; null once the draft is over. */
  get offer(): FairOffer | null {
    return this.current;
  }
  /** The offer after it, already shown; null at the last one. */
  get next(): FairOffer | null {
    return this.upcoming;
  }
  get over(): boolean {
    return this.current === null;
  }

  /** Takes card `choice` (0 to 2) of the offer; a mythic passes the next offer. */
  pick(choice: number): void {
    const offer = this.current;
    if (!offer) throw new Error("Fair: the draft is over");
    const card = Number.isInteger(choice) ? offer.cards[choice] : undefined;
    if (card === undefined) throw new Error("Fair: not a tile of the offer");
    this.deck.push(card);
    this.picks.push(choice);
    if (fairIsMythic(card) && this.upcoming) {
      const skipped = this.upcoming.number;
      this.passed.push(skipped);
      this.current = skipped < FAIR_OFFERS ? this.draw(skipped + 1, []) : null;
    } else {
      this.current = this.upcoming;
    }
    this.upcoming = this.current && this.current.number < FAIR_OFFERS ? this.draw(this.current.number + 1, this.current.cards) : null;
  }

  /** Offer `number`, drawn among the cards neither taken nor in `shown` (the offer on the table). */
  private draw(number: number, shown: readonly number[]): FairOffer {
    const out = new Set([...this.deck, ...shown]);
    const cards: number[] = [];
    const fits = (card: number) => !out.has(card) && !cards.some((c) => fairPlanOf(c) === fairPlanOf(card)) && !(number === FAIR_OFFERS && fairIsMythic(card));
    const market = Array.from({ length: FAIR_MARKET }, (_, card) => card);
    let stall = false;
    for (let slot = 0; slot < FAIR_OFFER_TILES; slot++) {
      let pool = slot === 0 ? market.filter((card) => fairInStall(card, this.season) && fits(card)) : [];
      if (slot === 0) stall = pool.length > 0;
      if (pool.length === 0) pool = market.filter(fits);
      cards.push(pool[Math.min(pool.length - 1, Math.floor(this.random(number, slot) * pool.length))]!);
    }
    return { number, cards, stall };
  }
}

/** A reward tier: the share of the counted players it holds from the top, and the Cobbles each claims. No XP, no chest. */
export interface FairTier {
  name: string;
  share: number;
  cobbles: number;
}
/** The tiers, the best first (the Masterpiece's: the season's individual weeks pay alike); the last holds every counted try below. */
export const FAIR_TIERS: readonly FairTier[] = [
  { name: "Top 1%", share: 0.01, cobbles: 300 },
  { name: "Top 5%", share: 0.05, cobbles: 150 },
  { name: "Top 20%", share: 0.2, cobbles: 60 },
  { name: "Top 50%", share: 0.5, cobbles: 20 },
  { name: "Counted", share: 1, cobbles: 5 },
];

/** The last place of tier `tier` among `players` counted players: its share, rounded up (the first place is always of the first tier). */
export const fairTierLast = (tier: number, players: number): number => Math.ceil(players * FAIR_TIERS[tier]!.share);

/** The tier (an index of `FAIR_TIERS`) of place `place` (1 first) among `players` counted players. */
export function fairTierOf(place: number, players: number): number {
  const tier = FAIR_TIERS.findIndex((_, i) => place <= fairTierLast(i, players));
  return tier < 0 ? FAIR_TIERS.length - 1 : tier;
}

/** One player's week: their best try's score and when its game ended (seconds), which breaks a tie. */
export interface FairBest {
  score: number;
  at: number;
}
/** Whether a best counts in the ranking: `FAIR_FLOOR` points or more. */
export const fairCounts = (score: number): boolean => score >= FAIR_FLOOR;
/** The ranking's order, negative when `a` ranks above `b`: the score, then the earlier end. */
export const compareFair = (a: FairBest, b: FairBest): number => b.score - a.score || a.at - b.at;
/** A week's ranking: the bests that count, each with its place (1 first) and its tier. */
export function rankFair<T extends FairBest>(bests: readonly T[]): (T & { place: number; tier: number })[] {
  const counted = bests.filter((b) => fairCounts(b.score)).sort(compareFair);
  return counted.map((b, i) => ({ ...b, place: i + 1, tier: fairTierOf(i + 1, counted.length) }));
}
/** The least score of each tier in a ranking (`rankFair`'s), the bars; null for a tier nobody is in. */
export const fairBars = (ranking: readonly { score: number; tier: number }[]): (number | null)[] =>
  FAIR_TIERS.map((_, tier) => ranking.filter((r) => r.tier === tier).reduce<number | null>((least, r) => (least === null ? r.score : Math.min(least, r.score)), null));
