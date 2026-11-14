import { Suspense, lazy, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CENTER, OrientationType, PlanType, puzzleDeck } from "@paved/game-core";
import { toastError } from "../../components/containers/error-toast";
import { TournamentScene, type TournamentView as View } from "../../components/scenes/tournament-scene";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { useClaimTournament, useRegisterTournament, useTournamentState } from "../../data/tournament";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";
import { usePlayTournament } from "../tournament-play";

/** The deck sheet (#540), the board's own chunk: loaded at the first tap on the round's deck. */
const DeckSheet = lazy(() => import("../../components/containers/deck-sheet"));

/** The starter on the board before the first draw: the deck sheet counts it placed, as a game's board does. */
const STARTER = { id: 1, plan: Object.values(PlanType).indexOf(PlanType.RFFFRFCFR), orientation: Object.values(OrientationType).indexOf(OrientationType.South), x: CENTER, y: CENTER };

/** The Tournament's view named by `?view=`: the bracket; anything else, the week. */
export const tournamentViewOf = (param: string | null): View => (param === "bracket" ? param : "tournament");

/** The bracket view's week named by `?week=`: a whole number, else null (the run of this week, else of last week). */
export const tournamentWeekParam = (param: string | null): number | null => (param !== null && /^\d+$/.test(param) ? Number(param) : null);

/** A run's bracket: the view of its week, so last week's result opens its own bracket once this week's is drawn. */
export const tournamentBracketPath = (week: number): string => `/play/tournament?view=bracket&week=${week}`;

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Tournament", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Tournament (`/play/tournament`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as
 * the Joust's). The week as the current account sees it (`useTournamentState`); its writes: Register (on Monday), Play (the game
 * still open, else today's, `usePlayTournament`), Claim (a run's Cobbles once it is over). The bracket is a view of it
 * (`?view=bracket&week=`, the week of the run whose bracket was asked), pushed, so Back returns to the week. The round's deck opens the deck sheet on its 38 cards.
 */
export default function TournamentView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const view = tournamentViewOf(params.get("view"));
  const state = useTournamentState(me);
  const register = useRegisterTournament(me);
  const claim = useClaimTournament(me);
  const { play, busy: starting } = usePlayTournament(me);
  const openPlayer = useOpenPlayer();
  const [deckOpen, setDeckOpen] = useState(false);
  // Mounted from the first opening on, so the sheet slides out as it closes.
  const [deckWanted, setDeckWanted] = useState(false);
  const seed = state.data?.deckSeed ?? null;
  const deck = useMemo(() => (seed ? puzzleDeck(BigInt(seed)) : null), [seed]);
  const renders = useTileRenders(RENDERER_ASSETS);
  return (
    <>
      <TournamentScene
        state={state.data ?? null}
        view={view}
        bracketWeek={tournamentWeekParam(params.get("week"))}
        error={state.unavailable ? "The Tournament is not on this network yet." : (state.error?.message ?? null)}
        errorDetail={state.error ? errorDetail(state.error) : undefined}
        onRetry={state.unavailable ? undefined : state.refetch}
        now={now}
        me={me}
        busy={register.isPending ? "register" : starting ? "start" : claim.isPending ? "claim" : null}
        onRegister={() => register.mutate(undefined, { onError: refused })}
        onPlay={play}
        onClaim={(week) => claim.mutate(week, { onError: refused })}
        onBracket={(week) => go(tournamentBracketPath(week))}
        onDeck={() => {
          setDeckWanted(true);
          setDeckOpen(true);
        }}
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
