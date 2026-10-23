import type { Decoded } from "./codec";
import { fromCell, toCell, type VillageCell } from "./village";
import { vrfSalt, withVrfRequest } from "./vrf";
import type { Call } from "./writer";

// The PvP attacks (#643, docs/architecture/pvp-attacks.md): the writes an attacker sends to `Arena` (start the attack on the
// opponent drawn in `Matchmaker`, play the tile in hand, surrender) and the shapes of its views, decoded from their ABI
// structs. Every tile of an attack is a VRF draw: `start` draws the first, each `play` but the last draws the next, so both
// put the provider's request first, with the salt of that draw. The last `play` replays the attack, gives the stars and
// settles the crowns. `Arena` is not deployed yet, as `Matchmaker`: the PvP flow's wiring (#647) takes its address from the
// deployment.

/** The kind of an attack's VRF draws (`ATTACK_KIND`). */
export const ATTACK_DRAW_KIND = "ATTACK";
/** The draws of one attack in a salt's index (`DRAWS_PER_ATTACK`): draw `n` of attack `id` is `id * 128 + n`. */
export const DRAWS_PER_ATTACK = 128;

/** `Arena.attack(attacker).status`: none, open (a tile in hand), finished by its last move, surrendered. */
export const ATTACK_STATUS = { none: 0, open: 1, finished: 2, surrendered: 3 } as const;

/** `Arena.attack(attacker)`: the attacker's last attack (id 0: none). */
export interface Attack {
  id: number;
  status: number;
  defender: string;
  npc: boolean;
  /** The snapshot: the defender's parcels and score at the start (the stars' target). */
  parcels: number;
  target: number;
  board: number;
  placed: number;
  startedAt: number;
  score: number;
  stars: number;
}

/** `Arena.deck(attacker, id)`: the deck's size, the tiles drawn, the plan in hand (0: none), the bitmap of the tiles drawn. */
export interface AttackDeck {
  size: number;
  drawn: number;
  hand: number;
  bitmap: bigint;
}

/** One move of `Arena.moves(attacker, id)`: the plan, and a discard or the tile built at a cell (relative to the starter). */
export type AttackMove =
  | { plan: number; discard: true }
  | { plan: number; discard: false; orientation: number; cell: VillageCell };

/** The struct fields of the views, in ABI order (camelCased); a test checks them against `contracts/abis/Arena.json`. */
export const ATTACK_FIELDS = ["id", "status", "defender", "npc", "parcels", "target", "board", "placed", "startedAt", "score", "stars"];
export const ATTACK_DECK_FIELDS = ["size", "drawn", "hand", "bitmap"];
export const ATTACK_MOVE_FIELDS = ["plan", "discard", "orientation", "x", "y"];

/** The stars' thresholds, in percent of the target (`paved::matchmaker::stars`; the owner rules on them, #637 point 1). */
export const STAR_PERCENTS = [70, 85, 110] as const;

/** The stars of `score` against `target`, as `stars_of` computes them: 0 for a score of 0. */
export function starsOf(score: number, target: number): number {
  if (score <= 0) return 0;
  let stars = 0;
  for (const percent of STAR_PERCENTS) if (score * 100 >= target * percent) stars += 1;
  return stars;
}

/** The salt index of draw `n` of attack `id`. */
export function drawIndex(id: number, n: number): number {
  if (!Number.isInteger(n) || n < 0 || n >= DRAWS_PER_ATTACK) throw new Error(`Not a draw of an attack: ${n}`);
  return id * DRAWS_PER_ATTACK + n;
}

const n = (value: Decoded | undefined): number => Number(value ?? 0);

export const attack = (s: Record<string, Decoded>): Attack => ({
  id: n(s.id),
  status: n(s.status),
  defender: String(s.defender ?? "0x0"),
  npc: Boolean(s.npc),
  parcels: n(s.parcels),
  target: n(s.target),
  board: n(s.board),
  placed: n(s.placed),
  startedAt: n(s.startedAt),
  score: n(s.score),
  stars: n(s.stars),
});

export const attackDeck = (s: Record<string, Decoded>): AttackDeck => ({
  size: n(s.size),
  drawn: n(s.drawn),
  hand: n(s.hand),
  bitmap: BigInt((s.bitmap as bigint | number | undefined) ?? 0),
});

export const attackMove = (s: Record<string, Decoded>): AttackMove =>
  s.discard
    ? { plan: n(s.plan), discard: true }
    : { plan: n(s.plan), discard: false, orientation: n(s.orientation), cell: toCell(n(s.x), n(s.y)) };

/**
 * `Arena.start()`, its VRF request first: the salt of draw 0 of the attacker's next attack (`attack(attacker).id + 1`), the
 * consumer `Arena`. The attacker has drawn its opponent in `Matchmaker` (`search` or `next`) in an earlier transaction: one
 * draw per transaction.
 */
export function startAttackCalls(arena: string, provider: string, attacker: string, lastId: number): Call[] {
  const call: Call = { contractAddress: arena, entrypoint: "start", calldata: [] };
  return withVrfRequest([call], { provider, consumer: arena, salt: vrfSalt(ATTACK_DRAW_KIND, attacker, drawIndex(lastId + 1, 0)) });
}

/** One play: the tile in hand discarded, or built turned to an orientation code (1 North to 4 West) at a cell. */
export type AttackPlay = { discard: true } | { discard: false; orientation: number; cell: VillageCell };

/** `Arena.play(discard, orientation, x, y)` alone: the calldata, with no VRF request (the last move draws nothing). */
export function playCall(arena: string, play: AttackPlay): Call {
  if (play.discard) return { contractAddress: arena, entrypoint: "play", calldata: ["0x1", "0x0", "0x0", "0x0"] };
  if (!Number.isInteger(play.orientation) || play.orientation < 1 || play.orientation > 4) {
    throw new Error(`Not an orientation code: ${play.orientation}`);
  }
  return { contractAddress: arena, entrypoint: "play", calldata: ["0x0", `0x${play.orientation.toString(16)}`, ...fromCell(play.cell)] };
}

/**
 * `Arena.play(...)` of the open attack `deck` belongs to: its VRF request first while a tile is left to draw (the salt of draw
 * `deck.drawn`), none for the last move, which replays and settles the attack.
 */
export function playCalls(arena: string, provider: string, attacker: string, id: number, deck: AttackDeck, play: AttackPlay): Call[] {
  const call = playCall(arena, play);
  if (deck.drawn >= deck.size) return [call];
  return withVrfRequest([call], { provider, consumer: arena, salt: vrfSalt(ATTACK_DRAW_KIND, attacker, drawIndex(id, deck.drawn)) });
}

/** `Arena.surrender()`: the open attack ended at 0 stars. */
export function surrenderCall(arena: string): Call {
  return { contractAddress: arena, entrypoint: "surrender", calldata: [] };
}
