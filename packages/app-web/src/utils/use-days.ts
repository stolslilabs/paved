import { useIndexerRead, usePaved, useRead } from "@paved/chain";
import { DAYS_LISTED } from "./indexer-view";

/**
 * The day a screen shows and the days it offers, as the leaderboard resolves them. `requested` is the day asked for
 * (`undefined`: today; `null`: an id that is not a day, nothing is read). Today's id is the contract's; with the node
 * unreachable the newest day the indexer lists stands in.
 */
export function useDays(requested: number | null | undefined) {
  const { client } = usePaved();
  const days = useIndexerRead((c) => c.tournaments({ limit: DAYS_LISTED }), [], { onVisible: true });
  const current = useRead((c) => c.views.currentTournamentId(), []);
  const waitingForToday = requested === undefined && client !== null && !current.loaded && !current.error;
  const newest = days.data?.data.tournaments[0]?.id ?? null;
  const id = requested === undefined ? (current.loaded ? current.data : newest) : requested;
  const listed = days.data?.data.tournaments ?? [];
  return { days, current, waitingForToday, id, listed };
}
