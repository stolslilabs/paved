// The decks of the contracts (`contracts/src/types/deck.cairo`, `elements/decks/{base,simple,tutorial}.cairo`):
// `simple` is the Challenge's (the 72 cards of the base deck, 38 played), `tutorial` is the scripted one.

import { Base } from "../elements/decks/base";
import { Tutorial } from "../elements/decks/tutorial";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";

export type EngineDeck = "simple" | "tutorial";

export interface DeckRules {
  /** Cards of the deck (`total_count`). */
  readonly total: number;
  /** Tiles a game plays, the starter included (`count`, the game's tile limit). */
  readonly count: number;
  /** The plan of a deck index (`plan(index)`, the index taken modulo `total`). */
  plan(index: number): PlanType;
  /** The index of the starter tile `RFFFRFCFR`, withdrawn at start (`indexes(plan)[0]`). */
  readonly starter: number;
  /** The scripted placement of the tile of deck index `index` (tutorial only). */
  placement(index: number): { orientation: OrientationType; x: number; y: number } | null;
}

export const DECKS: Record<EngineDeck, DeckRules> = {
  simple: {
    total: Base.total_count(),
    count: 38,
    plan: (index) => Base.plan(index),
    starter: 26,
    placement: () => null,
  },
  tutorial: {
    total: Tutorial.total_count(),
    count: Tutorial.count(),
    plan: (index) => Tutorial.plan(index),
    starter: 0,
    placement: (index) => {
      const parameters = Tutorial.parameters(index);
      return parameters.orientation === OrientationType.None ? null : parameters;
    },
  },
};
