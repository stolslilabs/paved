import type { BoardTile, ScoredStructure } from "@paved/chain";
import { CENTER, CategoryType, EngineGame, attackDeck, OrientationType, PlanType, type EnginePlacement } from "@paved/game-core";
import type { PvpCell, PvpVillage } from "../lib/pvp-rules";

/**
 * The PvP fakes' villages and attacks (#647), played on the off-chain engine, so every score on the screens is the rules':
 * a defender's village is a game built freely (a greedy builder on a Simple deck), its territory the cells its tiles stand
 * on; an attack is the defender's placed tiles drawn at random (a shuffle of the seed), each placed only on a cell of that
 * territory (the owner's rule: no border rule, a side facing a cell not owned stays open). Until #640 says otherwise the
 * village's score is the score of the game that built it.
 */

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** A seeded generator (mulberry32): the fakes are the same at every load. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function boardTiles(game: EngineGame): BoardTile[] {
  return game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
}

/**
 * The placement a plain player would pick: the most points now, then the cell with the most neighbours (a compact build),
 * then a coin. `allowed` keeps an attack in its territory.
 */
function pick(game: EngineGame, next: () => number, allowed?: ReadonlySet<string>): EnginePlacement | null {
  let best: EnginePlacement | null = null;
  let bestValue = -Infinity;
  for (const p of game.legalPlacements()) {
    if (allowed && !allowed.has(`${p.x},${p.y}`)) continue;
    const look = game.clone();
    const points = look.build(p).points;
    const neighbours = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ].filter(([dx, dy]) => game.tileAt(p.x + dx!, p.y + dy!)).length;
    const value = points * 10 + neighbours * 3 + next();
    if (value > bestValue) {
      bestValue = value;
      best = p;
    }
  }
  return best;
}

/** A village built freely on a Simple deck of `seed`: its tiles, the cells they stand on, the game's score. */
export function buildVillage(seed: number): PvpVillage {
  const game = EngineGame.start({ deck: "simple", seed: BigInt(seed) });
  const next = random(seed);
  while (!game.over) {
    const p = pick(game, next);
    if (p) game.build(p);
    else game.discard();
  }
  const tiles = boardTiles(game);
  return { cells: tiles.map(({ x, y }) => ({ x, y })), tiles, score: game.score };
}

/** One step of an attack: the board after it and what it did. */
export interface AttackStep {
  tiles: BoardTile[];
  score: number;
  /** Points the move added (a discard takes some: negative); null before the first move. */
  delta: number | null;
  lastScored: ScoredStructure[];
  /** The tile drawn next, null once the attack is over. */
  hand: { plan: number; orientation: number } | null;
  /** The legal cells of the tile in hand in the territory, in any rotation. */
  slots: { x: number; y: number }[];
  /** Where this step's tile went (the replay's last move): null for a discard or the start. */
  placed: BoardTile | null;
  /** The tiles left to draw, the one in hand included. */
  remaining: number;
  discarded: number;
}

/**
 * An attack on `village`: its tiles but the starter (which every board starts with, as the defender's did), shuffled by
 * `seed`, each placed by the same plain player inside the territory, or discarded where it fits nowhere. Every step is kept:
 * the attack screen's states and the defence log's replay.
 */
export function playAttack(village: PvpVillage, seed: number): AttackStep[] {
  const next = random(seed);
  const plans = shuffled(placedPlans(village), next);
  const territory = new Set(village.cells.map((c) => `${c.x - CENTER},${c.y - CENTER}`));
  return playDeck(plans, territory, next);
}

/** The village's placed plans but the starter's (which every board starts with), as chain plan ids, in board order. */
export function placedPlans(village: PvpVillage): number[] {
  return village.tiles.filter((t) => t.x !== CENTER || t.y !== CENTER).map((t) => t.plan);
}

/** `plans` shuffled by `next` (Fisher-Yates from the end). */
function shuffled(plans: readonly number[], next: () => number): number[] {
  const out = [...plans];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * A PvP v2 village (#740, the free village of #741): a game built freely on a Simple deck of `seed`, stopped once its `slots`
 * are filled, the starter's included (a village never holds more than its slots). Its score is the game's.
 */
export function buildFreeVillage(seed: number, slots: number): PvpVillage {
  const game = EngineGame.start({ deck: "simple", seed: BigInt(seed) });
  const next = random(seed);
  while (!game.over && game.placed().length < slots) {
    const p = pick(game, next);
    if (p) game.build(p);
    else game.discard();
  }
  const tiles = boardTiles(game);
  return { cells: tiles.map(({ x, y }) => ({ x, y })), tiles, score: game.score };
}

/**
 * A PvP v2 attack's deck (#740), game-core's `attackDeck` (#741): the village's placed tiles and extras from the base deck's
 * odds up to ceil(1.15 x `slots`), shuffled from the random `seed`. As plan codes, in draw order.
 */
export function attackDeckOf(village: PvpVillage, slots: number, seed: number): number[] {
  return attackDeck(placedPlans(village), slots, BigInt(seed));
}

/**
 * A PvP v2 attack (#740): `deck` played in its order by the plain player on an unbounded board from the starter (any cell
 * next to a tile), a tile discarded where it fits nowhere. Every step is kept.
 */
export function playAttackV2(deck: readonly number[], seed: number): AttackStep[] {
  return playDeck(deck, null, random(seed));
}

/** `plans` (chain plan ids) played in order from the starter, inside `territory` when one is given. */
function playDeck(plans: readonly number[], territory: ReadonlySet<string> | null, next: () => number): AttackStep[] {
  const sequence = plans.map((p) => PLANS[p] as PlanType);
  const inside = (p: { x: number; y: number }) => territory === null || territory.has(`${p.x},${p.y}`);
  const game = EngineGame.start({ deck: "story", seed: 0n, sequence });
  const snapshot = (delta: number | null, scored: ScoredStructure[], placed: BoardTile | null): AttackStep => {
    const hand = game.over ? null : game.hand;
    const slots = hand
      ? [...new Map(game.legalPlacements().filter(inside).map((p) => [`${p.x},${p.y}`, { x: CENTER + p.x, y: CENTER + p.y }])).values()]
      : [];
    return {
      tiles: boardTiles(game),
      score: game.score,
      delta,
      lastScored: scored,
      hand: hand ? { plan: PLANS.indexOf(hand.plan), orientation: 1 } : null,
      slots,
      placed,
      remaining: game.over ? 0 : game.tileLimit - game.tileCount + 1,
      discarded: game.discarded,
    };
  };
  const steps = [snapshot(null, [], null)];
  while (!game.over) {
    const p = pick(game, next, territory ?? undefined);
    const move = p ? game.build(p) : game.discard();
    const scored = move.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
    const placed = p ? (boardTiles(game).find((t) => t.id === move.tileId) ?? null) : null;
    steps.push(snapshot(move.action === "discard" ? -move.points : move.points, scored, placed));
  }
  return steps;
}

