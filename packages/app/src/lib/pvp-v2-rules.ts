/**
 * The PvP v2 attack's rules as the screens read them (#740, step 1 of #732; owner decisions of 2026-10-24): an unbounded
 * board from the starter, a deck of ceil(1.15 x S) tiles (S the defender's slots, the starter included), the tile in hand and
 * the next two shown, stars at 80 / 90 / 100 % of the village's score. They are game-core's (#741, `rules/attack.ts`).
 */
export { ATTACK_DECK_PERCENT, ATTACK_STAR_PERCENTS, ATTACK_VIEW, attackDeck, attackDeckSize, attackExtras, attackStarPoints, attackStars } from "@paved/game-core";
