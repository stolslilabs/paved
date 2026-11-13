import { useSearchParams } from "react-router";
import { toastError } from "../../components/containers/error-toast";
import { MasterpieceScene, type MasterpieceView as View } from "../../components/scenes/masterpiece-scene";
import { useClaimMasterpiece, useMasterpieceRanking, useMasterpieceState, useOpenMasterpiece } from "../../data/masterpiece";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** The Masterpiece's board. */
export const MASTERPIECE_BOARD_PATH = "/masterpiece";

/** The Masterpiece's view named by `?view=`: the ranking; anything else, the week. */
export const masterpieceViewOf = (param: string | null): View => (param === "ranking" ? "ranking" : "week");

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Masterpiece", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Masterpiece (`/play/masterpiece`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as
 * the Joust's). The week as the current account sees it (`useMasterpieceState`); its writes: the gold button opens the board (`open`
 * on the first visit, which creates it), then its page; Claim, last week's Cobbles. The ranking is a view of it (`?view=ranking`),
 * pushed, so Back returns to the week.
 */
export default function MasterpieceView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const view = masterpieceViewOf(params.get("view"));
  const state = useMasterpieceState(me);
  const ranking = useMasterpieceRanking(me, view === "ranking");
  const open = useOpenMasterpiece(me);
  const claim = useClaimMasterpiece(me);
  const failed = view === "ranking" ? ranking : state;
  return (
    <MasterpieceScene
      state={state.data ?? null}
      ranking={ranking.data ?? null}
      view={view}
      error={state.unavailable ? "The Masterpiece is not on this network yet." : (failed.error?.message ?? null)}
      errorDetail={failed.error ? errorDetail(failed.error) : undefined}
      onRetry={state.unavailable ? undefined : failed.refetch}
      now={now}
      busy={open.isPending ? "open" : claim.isPending ? "claim" : null}
      onOpen={() => {
        if (state.data?.board) go(MASTERPIECE_BOARD_PATH);
        else if (!open.isPending) open.mutate(undefined, { onSuccess: () => go(MASTERPIECE_BOARD_PATH), onError: refused });
      }}
      onClaim={(week) => claim.mutate(week, { onError: refused })}
      onRanking={() => go("/play/masterpiece?view=ranking")}
    />
  );
}
