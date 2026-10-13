// The draw of the contracts, bit-exact: `draw_from_bitmap` of `contracts/src/helpers/random_deck.cairo`
// (origami's deck, P-17 shortcut), the card removal of `Deck::tiles` (`contracts/src/types/deck.cairo`)
// and the reseeds of `Game` (`contracts/src/models/game.cairo`). Felts are `bigint`s; the hash is
// Cairo's `PoseidonTrait` sponge, which is `poseidonHashMany` over the same elements.

import { poseidonHashMany } from "@scure/starknet";

const TWO_POW_128 = 1n << 128n;

/** Poseidon of `values`, as `PoseidonTrait::new().update(a).update(b)...finalize()` gives it. */
export function poseidon(...values: (bigint | number)[]): bigint {
  return poseidonHashMany(values.map((value) => BigInt(value)));
}

/** The number of bits set in `x`. */
export function popcount(x: bigint): number {
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** The index of the highest bit set in `x` (`Bitmap::most_significant_bit`), or -1 for 0. */
export function mostSignificantBit(x: bigint): number {
  let index = -1;
  while (x > 0n) {
    x >>= 1n;
    index += 1;
  }
  return index;
}

/** `2^index`, the bit of a deck index (card `index + 1`). */
export function bit(index: number): bigint {
  return 1n << BigInt(index);
}

/** The card in slot `slot` once the withdrawals of rank below `tau` are done (`slot_card`). */
function slotCard(bitmap: bigint, number: number, slot: number, tau: number): number {
  let card = slot;
  for (;;) {
    const mask = bit(card - 1);
    if ((bitmap & mask) === 0n) break;
    const rank = popcount(bitmap & (mask - 1n + mask));
    if (rank >= tau) break;
    card = slotCard(bitmap, number, number - rank + 1, rank);
  }
  return card;
}

/**
 * The card (1-based) that a deck of `number` cards, the cards of `bitmap` withdrawn (bit `c - 1`
 * for card `c`), gives for `seed`, and the number of cards left once it is drawn.
 */
export function drawFromBitmap(
  seed: bigint,
  number: number,
  bitmap: bigint,
): { card: number; remaining: number } {
  if (number > 128) throw new Error("Deck: too many cards");
  // Only the cards of the deck are read, as `from_bitmap` does
  const cards = number === 128 ? bitmap % TWO_POW_128 : bitmap & (bit(number) - 1n);
  const withdrawn = popcount(cards);
  const remaining = number - withdrawn;
  if (remaining <= 0) throw new Error("Deck: no cards left");
  const random = poseidon(seed, 0, remaining);
  const key = Number(random % BigInt(remaining)) + 1;
  return { card: slotCard(cards, number, key, withdrawn + 1), remaining: remaining - 1 };
}

/**
 * The deck bitmap once `Deck::tiles` withdrew, at random from `seed`, the cards a deck of `count`
 * cards out of `total` leaves out: index by index, a free index is withdrawn when
 * `Poseidon(seed, index).low % 10000 <= to_remove * 10000 / (total - index)`.
 */
export function withdrawExtra(tiles: bigint, seed: bigint, total: number, count: number): bigint {
  const MULTIPLIER = 10_000n;
  let toRemove = BigInt(total - count);
  let index = 0;
  while (toRemove > 0n) {
    if ((tiles & bit(index)) !== 0n) {
      index += 1;
      continue;
    }
    const random = (poseidon(seed, index) % TWO_POW_128) % MULTIPLIER;
    const probability = (toRemove * MULTIPLIER) / BigInt(total - index);
    if (random <= probability) {
      toRemove -= 1n;
      tiles |= bit(index);
    }
    index += 1;
  }
  return tiles;
}
