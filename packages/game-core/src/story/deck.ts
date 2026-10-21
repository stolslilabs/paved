// The fixed decks of the long Story levels: the Challenge's own draw, frozen. A seed gives the cards the simple deck
// withdraws (`withdrawExtra`: 34 of the 72, so 38 are played, the starter included) and the order the rest are drawn in
// when every tile is discarded (a discard reseeds from the centre, a build from its cell, so this is the one order that
// does not depend on the moves). A level takes the first `drawn` plans of that order; the withdrawn cards never appear.

import { EngineGame } from "../engine/game";
import type { PlanType } from "../types/plan";

/** The first `drawn` plans (at most 37) the simple deck of `seed` deals after the starter, every tile discarded. */
export function seededDeck(seed: bigint, drawn: number): PlanType[] {
  const game = EngineGame.start({ deck: "simple", seed });
  const plans: PlanType[] = [];
  while (plans.length < drawn && game.hand && !game.over) {
    plans.push(game.hand.plan);
    game.discard();
  }
  if (plans.length < drawn) throw new Error(`Story deck: the simple deck deals ${plans.length} tiles, not ${drawn}`);
  return plans;
}
