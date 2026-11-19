import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toastError } from "../../components/containers/error-toast";
import { FairScene, type FairDraftView, type FairRankingTab, type FairView as View } from "../../components/scenes/fair-scene";
import { draftOfTry, useAbandonFair, useClaimFair, useFairRanking, useFairState, useFairTry, usePickFair } from "../../data/fair";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { errorDetail } from "../error-detail";
import { fairGamePath, usePlayFair } from "../fair-play";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** The Fair's view named by `?view=`: the open try's draft or the ranking; anything else, the week. */
export const fairViewOf = (param: string | null): View => (param === "draft" || param === "ranking" ? param : "fair");

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Fair", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Fair (`/play/fair`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as the
 * Joust's). The week as the current account sees it (`useFairState`); its writes: Play (the try still open, else a new one,
 * `usePlayFair`), a pick of the draft (shown at once, `usePickFair`), Leave (the try spent), Claim (last week's Cobbles). The draft and
 * the ranking are views of it (`?view=draft`, `?view=ranking`), pushed, so Back returns to the week. The draft's last pick opens the
 * try's game once the source has taken it; the draft's view with no draft open goes to the game, or back to the week.
 */
export default function FairView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const view = fairViewOf(params.get("view"));
  const state = useFairState(me);
  const ranking = useFairRanking(me, view === "ranking");
  const open = state.data?.me?.open ?? null;
  const record = useFairTry(view === "draft" && open ? open.id : null);
  const pick = usePickFair(me);
  const abandon = useAbandonFair(me);
  const claim = useClaimFair(me);
  const { play, busy: starting } = usePlayFair(me);
  const openPlayer = useOpenPlayer();
  const renders = useTileRenders(RENDERER_ASSETS);
  const [rankingTab, setRankingTab] = useState<FairRankingTab>("week");

  const data = record.data ?? null;
  const draft = useMemo((): FairDraftView | null => {
    if (!data || data.stage !== "draft") return null;
    const d = draftOfTry(data);
    return d.offer ? { offer: d.offer, deck: d.deck, passed: d.passed, season: data.season } : null;
  }, [data]);

  // The draft's view with nothing to draft: the game once the deck is built (and no pick is on its way), else the week.
  const stale = view === "draft" && state.data !== undefined && !pick.isPending && !abandon.isPending;
  useEffect(() => {
    if (!stale) return;
    if (!open) go("/play/fair", { replace: true });
    else if (open.stage === "game" && (!data || data.stage === "game")) go(fairGamePath(open.id), { replace: true });
  }, [stale, open, data, go]);

  const failed = view === "ranking" ? ranking : view === "draft" && record.error ? record : state;
  return (
    <FairScene
      state={state.data ?? null}
      ranking={ranking.data ?? null}
      draft={draft}
      view={view}
      error={state.unavailable ? "The Fair is not on this network yet." : (failed.error?.message ?? null)}
      errorDetail={failed.error ? errorDetail(failed.error) : undefined}
      onRetry={state.unavailable ? undefined : failed.refetch}
      now={now}
      me={me}
      renders={renders}
      busy={starting ? "start" : abandon.isPending ? "abandon" : claim.isPending ? "claim" : null}
      onPlay={play}
      onPick={(choice) => data && pick.mutate({ record: data, choice }, { onError: refused })}
      onAbandon={() => open && abandon.mutate(open.id, { onSuccess: () => go("/play/fair", { replace: true }), onError: refused })}
      onClaim={(week) => claim.mutate(week, { onError: refused })}
      onRanking={() => go("/play/fair?view=ranking")}
      rankingTab={rankingTab}
      onRankingTab={setRankingTab}
      // One of the viewer's tries: its end; the one still open, its draft or its board.
      onOpenTry={(tryId) => go(open?.id === tryId ? (open.stage === "draft" ? "/play/fair?view=draft" : fairGamePath(tryId)) : `${fairGamePath(tryId)}/over`)}
      onOpenPlayer={openPlayer}
    />
  );
}
