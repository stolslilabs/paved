import { poseidon } from "../engine/draw";
import { AttackRun, type AttackMoveCodes, type AttackStepResult } from "../sessions/attack";
import { basePlanOf } from "./rarity";

// The attack of PvP v2 (#732, owner decisions of 2026-10-24): an unbounded board from the starter, a deck of
// ceil(1.15 x S) tiles (S the defender's unlocked slots, not the tiles placed): every tile the defender placed, plus extras
// drawn from the base deck's odds, in an order drawn at random. The attacker sees the tile in hand and the next two, as in
// every mode, with no undo. Stars at 80 / 90 / 100 % of the village's score. The draws are a random's (the VRF's on chain,
// a Poseidon in the mock), so the deck follows from it.
//
// The starter is on the board from the start and is not in the deck: the deck counts the tiles the attacker draws.

/** The deck is `ATTACK_DECK_PERCENT` % of the defender's slots, rounded up (X = 15 %, #732 open point 1). */
export const ATTACK_DECK_PERCENT = 115;
/** The tiles the attacker sees: the one in hand and the next two. */
export const ATTACK_VIEW = 3;
/** The star marks, in whole percent of the village's score (#732 open point 1). */
export const ATTACK_STAR_PERCENTS = [80, 90, 100] as const;

/** The random's kinds, as felts: the extras' draws and the order's. */
const EXTRA = 0x4558545241n; // 'EXTRA'
const ORDER = 0x4f52444552n; // 'ORDER'

/** The deck of an attack on a village of `slots` slots: ceil(1.15 x S). */
export function attackDeckSize(slots: number): number {
  return Math.floor((ATTACK_DECK_PERCENT * Math.max(0, Math.floor(slots)) + 99) / 100);
}

/**
 * An attack's deck, in draw order: the defender's placed plans (the starter left out), then extras drawn from the base deck
 * (`basePlanOf(Poseidon(random, 'EXTRA', i))`) up to `attackDeckSize(slots)`, then shuffled (Fisher-Yates from the end, `j`
 * from `Poseidon(random, 'ORDER', i) % (i + 1)`). A village never holds more tiles than its slots, so the deck always has room
 * for them; if it did, every placed tile would still be in the deck.
 */
export function attackDeck(defenderPlans: readonly number[], slots: number, random: bigint): number[] {
  const size = Math.max(attackDeckSize(slots), defenderPlans.length);
  const deck = [...defenderPlans];
  for (let i = 0; deck.length < size; i++) deck.push(basePlanOf(poseidon(random, EXTRA, i)));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Number(poseidon(random, ORDER, i) % BigInt(i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** The extras of a deck of `slots` against `placed` defender tiles. */
export const attackExtras = (placed: number, slots: number): number => Math.max(0, attackDeckSize(slots) - placed);

/** The stars an attack's score earns against the village's `target`: 0 for a score of 0, else the marks reached (integers). */
export function attackStars(score: number, target: number): number {
  if (score <= 0) return 0;
  return ATTACK_STAR_PERCENTS.filter((p) => score * 100 >= p * target).length;
}

/** The least whole score of each star against `target`. */
export function attackStarPoints(target: number): [number, number, number] {
  return ATTACK_STAR_PERCENTS.map((p) => Math.floor((p * target + 99) / 100)) as [number, number, number];
}

/** A move of the attacker, the plan being the tile in hand's: built at a cell turned to an orientation code, or discarded. */
export type QueuedMove = { readonly discard: true } | { readonly discard: false; readonly orientation: number; readonly cell: { readonly x: number; readonly y: number } };

/**
 * An attack in play on the engine: the starter alone on an unbounded board, the deck drawn in its order, the tile in hand and
 * the next two shown. The engine is kept between moves (a move is applied, never replayed from the start).
 */
export class QueuedAttack {
  readonly run: AttackRun;

  constructor(readonly deck: readonly number[]) {
    this.run = new AttackRun({ territory: null });
  }

  /** An attack with `moves` already played (a resume, or a replay up to a move). */
  static replay(deck: readonly number[], moves: readonly QueuedMove[]): QueuedAttack {
    const attack = new QueuedAttack(deck);
    for (const move of moves) attack.apply(move);
    return attack;
  }

  /** The moves played. */
  get played(): number {
    return this.run.played.length;
  }

  /** The tile in hand's plan, or null once the deck is played out. */
  get hand(): number | null {
    return this.deck[this.played] ?? null;
  }

  /** The tiles the attacker sees: the one in hand and the next two (fewer at the deck's end). */
  get view(): number[] {
    return this.deck.slice(this.played, this.played + ATTACK_VIEW);
  }

  /** The tiles still to draw after the one in hand. */
  get left(): number {
    return Math.max(0, this.deck.length - this.played - 1);
  }

  get over(): boolean {
    return this.played >= this.deck.length;
  }

  get score(): number {
    return this.run.score;
  }

  /** Why building the tile in hand at `cell` turned to `orientation` is refused, or null (the engine's text). */
  refusal(orientation: number, cell: { x: number; y: number }): string | null {
    const plan = this.hand;
    if (plan === null) return "Game: is over";
    return this.run.refusal(plan, orientation, cell);
  }

  /** The cells where the tile in hand fits. */
  slots(): { x: number; y: number }[] {
    return this.hand === null ? [] : this.run.slots(this.hand);
  }

  /** The orientation codes the tile in hand fits at `cell`. */
  orientations(cell: { x: number; y: number }): number[] {
    return this.hand === null ? [] : this.run.orientations(this.hand, cell);
  }

  /** Plays the tile in hand: built (refused as `refusal` says) or discarded. */
  apply(move: QueuedMove): AttackStepResult {
    const plan = this.hand;
    if (plan === null) throw new Error("Game: is over");
    if (!move.discard) {
      const refused = this.run.refusal(plan, move.orientation, move.cell);
      if (refused) throw new Error(refused);
    }
    const codes: AttackMoveCodes = move.discard ? { plan, discard: true } : { plan, discard: false, orientation: move.orientation, cell: move.cell };
    return this.run.apply(codes);
  }

  /** The stars of the score so far against `target`. */
  stars(target: number): number {
    return attackStars(this.score, target);
  }
}
