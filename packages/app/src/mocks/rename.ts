import type { RenameViewProps } from "../components/containers/rename-view";
import { LONG_NAME } from "./stress";
import { PLAYER } from "./players";

// The profile's name view (PLAYER-RENAME), one entry per state, built on the scenes' player (`PLAYER`, the Cartridge username
// "bal7hazar"). The refusals are `@paved/chain`'s `RENAME_REFUSAL_TEXT` (a test keeps them equal: the mocks take no value of the chain).

/** What the chain says of a name taken, and of a rename's price changed under the player (`RENAME_REFUSAL_TEXT`). */
export const RENAME_TAKEN = "This name is taken: pick another one. Nothing was changed.";
export const RENAME_PRICE_CHANGED = "The price of a new name changed: check it and confirm again. No Cobbles were spent.";

const base = { current: PLAYER.name, address: PLAYER.playerId, balance: 240 } as const;

/** One entry per state of the view, in the order of its stories. */
export const RENAME = {
  /** The first change: free whatever the Cobbles; a name of two words. */
  free: { ...base, cost: 0, balance: 30, defaultName: "Quarry Queen" },
  /** A later change: 50 Cobbles; a Chinese name. */
  paid: { ...base, cost: 50, defaultName: "李小龙" },
  /** A later change with fewer Cobbles than its price: the field and the action held, the Cobbles missing said by the cost. */
  short: { ...base, cost: 50, balance: 20, defaultName: "" },
  /** The chain refused a name another player holds (any case). */
  taken: { ...base, cost: 0, defaultName: "SwiftCarter04", refused: RENAME_TAKEN, taken: true },
  /** Two spaces and a sign: its rules crossed, the action held. */
  invalid: { ...base, cost: 0, defaultName: "Mossy  Mason!" },
  /** The rename on its way: the field and the action held, the spinner. */
  pending: { ...base, cost: 50, defaultName: "Jean-Luc", pending: true },
  /** Another refusal: the price changed under the player. */
  refused: { ...base, cost: 50, defaultName: "Élodie", refused: RENAME_PRICE_CHANGED },
  /** Done: the new name is the player's, the next change at 50. */
  done: { ...base, current: "QuarryQueen", cost: 50, balance: 190, done: "QuarryQueen" },
  /** The cost and the Cobbles on their way: the action held. */
  loading: { ...base, cost: undefined, balance: undefined },
  /** The reads failed (after the query client's retry): the error and its Retry, the action held. */
  readFailed: { ...base, cost: undefined, balance: undefined, defaultName: "", error: "The chain did not answer: check your connection and try again." },
  /** No name set and no Cartridge username: the short address. */
  noName: { ...base, current: null, cost: 0, defaultName: "" },
  /** WRAP360: the longest username shown now, a name at the most characters typed (15 Chinese ones). */
  stress: { ...base, current: LONG_NAME, cost: 50, balance: 1_000_000, defaultName: "李小龙李小龙李小龙李小龙李小龙" },
} satisfies Record<string, Omit<RenameViewProps, "onBack">>;
