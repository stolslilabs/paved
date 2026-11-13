import { toastError } from "../../components/containers/error-toast";
import { ExpeditionScene } from "../../components/scenes/expedition-scene";
import { useClaimExpedition, useExpeditionState, useOpenExpedition } from "../../data/expedition";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** The Expedition's board. */
export const EXPEDITION_BOARD_PATH = "/expedition";

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Expedition", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Expedition (`/play/expedition`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as
 * the Joust's). The week as the current account sees it (`useExpeditionState`); its writes: the gold button opens the board (`open`:
 * the first visit writes the map, a day's first visit draws its tiles), then its page; Claim, last week's Cobbles.
 */
export default function ExpeditionView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const state = useExpeditionState(me);
  const open = useOpenExpedition(me);
  const claim = useClaimExpedition(me);
  return (
    <ExpeditionScene
      state={state.data ?? null}
      error={state.unavailable ? "The Expedition is not on this network yet." : (state.error?.message ?? null)}
      errorDetail={state.error ? errorDetail(state.error) : undefined}
      onRetry={state.unavailable ? undefined : state.refetch}
      now={now}
      busy={open.isPending ? "open" : claim.isPending ? "claim" : null}
      onOpen={() => {
        if (!open.isPending) open.mutate(undefined, { onSuccess: () => go(EXPEDITION_BOARD_PATH), onError: refused });
      }}
      onClaim={(week) => claim.mutate(week, { onError: refused })}
    />
  );
}
