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

/** The domain of the deck's hashes (`DECK_DOMAIN`, 'DECK'), apart from the reseeds of the draws. */
const DECK_DOMAIN = 0x4445434bn;

/** The draws one 128-bit lane gives (`LANE_DRAWS`). */
const LANE_DRAWS = 10;

/**
 * The deck bitmap once `Deck::tiles` withdrew, at random from `seed`, the cards a deck of `count`
 * cards out of `total` leaves out (G1: selection sampling, Knuth TAOCP 2, 3.4.2, algorithm S).
 *
 * Over the free indexes, in order, a free index is withdrawn when a draw uniform on `[0, free)`
 * falls below `need`, where `free` counts the free indexes from this one on and `need` the cards
 * still to withdraw. The draws are the digits of a lane in the mixed radix of the successive
 * `free`: a lane is one half of `Poseidon(seed, 'DECK' + batch)` (`low`, then `high`) and gives
 * 10 draws, so one hash serves 20 free indexes. Once `need == free`, every free index left goes,
 * with no draw.
 */
export function withdrawExtra(tiles: bigint, seed: bigint, total: number, count: number): bigint {
  const full = bit(total) - 1n;
  let free = BigInt(total - popcount(tiles & full));
  let need = BigInt(total - count);
  if (need > free) throw new Error("Deck: too small");
  let batch = 0n;
  let spare: bigint | undefined;
  const nextLane = (): bigint => {
    if (spare !== undefined) {
      const lane = spare;
      spare = undefined;
      return lane;
    }
    const hash = poseidon(seed, DECK_DOMAIN + batch);
    batch += 1n;
    spare = hash / TWO_POW_128;
    return hash % TWO_POW_128;
  };
  let lane = nextLane();
  let left = LANE_DRAWS;
  for (let index = 0; index < total; index++) {
    if (need === 0n) break;
    // Every free index left goes: the indexes from here on
    if (need === free) return tiles | (full - (bit(index) - 1n));
    if ((tiles & bit(index)) !== 0n) continue;
    if (left === 0) {
      lane = nextLane();
      left = LANE_DRAWS;
    }
    const draw = lane % free;
    lane /= free;
    left -= 1;
    if (draw < need) {
      tiles |= bit(index);
      need -= 1n;
    }
    free -= 1n;
  }
  return tiles;
}
