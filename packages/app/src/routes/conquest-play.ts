import type { ConquestCard } from "../components/containers/play-modes";
import type { ConquestResultOf, ConquestView } from "../components/scenes/conquest-scene";
import { useConquestAvailable, useConquestState } from "../data/conquest";

// The Conquest's part of Play's route (the season's finale): its card, and the names of its views on the drawer's header. Here, not
// in the Conquest's own chunk: Play draws the card before the Conquest's page is fetched.

/** The zone named by `?zone=`; null: none, or not a number. */
export const conquestZoneOf = (param: string | null): number | null => (param !== null && /^\d{1,3}$/.test(param) ? Number(param) : null);

/** The Conquest's view named by `?view=`: the tree, the ranking, the members, the requests, the rules or a result; anything else, its page. */
export const conquestViewOf = (params: URLSearchParams): ConquestView => {
  const view = params.get("view");
  if (view === "result") return conquestResultOf(params) ? "result" : "hub";
  return view === "tree" || view === "ranking" || view === "members" || view === "requests" || view === "rules" ? view : "hub";
};

/** The result named by `?view=result&of=`: a phase's, the final one, the last Conquest's; null: none. */
export const conquestResultOf = (params: URLSearchParams): ConquestResultOf | null => {
  const of = params.get("of");
  return of === "foundation" || of === "awakening" || of === "frontiers" || of === "final" || of === "last" ? of : null;
};

/** The header's title of the Conquest's views; its own page has none (the drawer says "Conquest"). */
export const CONQUEST_TITLES: Record<ConquestView, string | undefined> = { hub: undefined, tree: "Knowledge tree", ranking: "Ranking", members: "Our members", requests: "Requests", rules: "Goals and rules", result: "Result" };

/**
 * The home's Conquest button: the requests of the player's allegiance whose tile they hold (its badge); null without a Conquest (the
 * chain) or while it is read: no button.
 */
export function useConquestBadge(me: string | null): number | null {
  const on = useConquestAvailable();
  const state = useConquestState(me, on).data ?? null;
  return state ? state.requests.filter((r) => r.held > 0).length : null;
}

/**
 * The Conquest's card of Play (Limited): the phase and its day, the allegiances registered, the player's allegiance's place with the
 * day's orders and the Offerings that wait; null without a Conquest (the chain) or while it is read: no card.
 */
export function useConquestCard(me: string | null): { card: ConquestCard | null; on: boolean } {
  const on = useConquestAvailable();
  const state = useConquestState(me, on).data ?? null;
  if (!state) return { card: null, on };
  return {
    on,
    card: {
      phase: state.phase,
      day: state.day,
      rest: state.rest,
      phaseEndsAt: state.phaseEndsAt,
      registered: state.registered.length,
      mine: state.allegiance ? { place: state.allegiance.place, orders: state.allegiance.orders.left, waiting: state.me?.waiting ?? 0 } : null,
    },
  };
}
