import { Suspense, lazy, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CENTER, OrientationType, PlanType, puzzleDeck } from "@paved/game-core";
import { toastError } from "../../components/containers/error-toast";
import { JoustScene, type JoustView as View } from "../../components/scenes/joust-scene";
import { useClaimJoust, useJoustRanking, useJoustState, useRegisterJoust } from "../../data/joust";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { errorDetail } from "../error-detail";
import { usePlayJoust } from "../joust-play";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** The deck sheet (#540), the board's own chunk: loaded at the first tap on Today's deck. */
const DeckSheet = lazy(() => import("../../components/containers/deck-sheet"));

/** The starter on the board before the first draw: the deck sheet counts it placed, as a game's board does. */
const STARTER = { id: 1, plan: Object.values(PlanType).indexOf(PlanType.RFFFRFCFR), orientation: Object.values(OrientationType).indexOf(OrientationType.South), x: CENTER, y: CENTER };

/** The Joust's view named by `?view=`: both top 10 or the ranking; anything else, the week. */
export const joustViewOf = (param: string | null): View => (param === "top" || param === "ranking" ? param : "joust");

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Joust", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Joust (`/play/joust`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as the
 * Puzzle's). The week as the current account sees it (`useJoustState`); its writes: Register (an Officer's or the Leader's), Play
 * (the game still open, else a new one, `usePlayJoust`), Claim (last week's Cobbles). Both top 10 and the ranking are views of it
 * (`?view=top`, `?view=ranking`), pushed, so Back returns to the week. Today's deck opens the deck sheet on the day's 38 cards.
 */
export default function JoustView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const view = joustViewOf(params.get("view"));
  const state = useJoustState(me);
  const ranking = useJoustRanking(me, view === "ranking");
  const register = useRegisterJoust(me);
  const claim = useClaimJoust(me);
  const { play, busy: starting } = usePlayJoust(me);
  const openPlayer = useOpenPlayer();
  const [deckOpen, setDeckOpen] = useState(false);
  // Mounted from the first opening on, so the sheet slides out as it closes.
  const [deckWanted, setDeckWanted] = useState(false);
  const seed = state.data?.deckSeed ?? null;
  const deck = useMemo(() => (seed ? puzzleDeck(BigInt(seed)) : null), [seed]);
  const renders = useTileRenders(RENDERER_ASSETS);
  const failed = view === "ranking" ? ranking : state;
  return (
    <>
      <JoustScene
        state={state.data ?? null}
        ranking={ranking.data ?? null}
        view={view}
        error={state.unavailable ? "The Joust is not on this network yet." : (failed.error?.message ?? null)}
        errorDetail={failed.error ? errorDetail(failed.error) : undefined}
        onRetry={state.unavailable ? undefined : failed.refetch}
        now={now}
        me={me}
        busy={register.isPending ? "register" : starting ? "start" : claim.isPending ? "claim" : null}
        onRegister={() => register.mutate(undefined, { onError: refused })}
        onPlay={play}
        onClaim={(week) => claim.mutate(week, { onError: refused })}
        onTop={() => go("/play/joust?view=top")}
        onRanking={() => go("/play/joust?view=ranking")}
        onDeck={() => {
          setDeckWanted(true);
          setDeckOpen(true);
        }}
        onAllegiance={() => go("/guild")}
        onOpenPlayer={openPlayer}
      />
      {deck && deckWanted && (
        <Suspense fallback={null}>
          <DeckSheet open={deckOpen} onOpenChange={setDeckOpen} tiles={[STARTER]} plans={deck} renders={renders} edge="right" />
        </Suspense>
      )}
    </>
  );
}
