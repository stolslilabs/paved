import { Suspense, lazy, useMemo, useState } from "react";
import { CENTER, OrientationType, PlanType, puzzleDayOf, puzzleDeck } from "@paved/game-core";
import { PuzzleScene } from "../../components/scenes/puzzle-scene";
import { usePuzzleStanding, usePuzzleVisit } from "../../data/puzzle";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePlayPuzzle, usePuzzleViewer } from "../puzzle-play";

/** The deck sheet (#540), the board's own chunk: loaded at the first tap on Today's deck. */
const DeckSheet = lazy(() => import("../../components/containers/deck-sheet"));

/** The starter on the board before the first draw: the deck sheet counts it placed, as a game's board does. */
const STARTER = { id: 1, plan: Object.values(PlanType).indexOf(PlanType.RFFFRFCFR), orientation: Object.values(OrientationType).indexOf(OrientationType.South), x: CENTER, y: CENTER };

/**
 * The Puzzle (`/play/puzzle`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as Story's
 * campaigns). Today's leaderboard by the source's clock (`usePuzzleStanding`), the player's visit recorded (the mock's welcome prize),
 * Play: the player's game of today still open, else a new one (`usePlayPuzzle`). Today's deck opens the deck sheet on the day's 38 cards
 * (`puzzleDeck` of the day's seed). A player's row opens their profile over the drawer (`?player=`).
 */
export default function PuzzleView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const day = puzzleDayOf(now);
  usePuzzleVisit(me);
  const standing = usePuzzleStanding(day, me);
  const { play, busy, open } = usePlayPuzzle(me);
  const openPlayer = useOpenPlayer();
  const [deckOpen, setDeckOpen] = useState(false);
  // Mounted from the first opening on, so the sheet slides out as it closes.
  const [deckWanted, setDeckWanted] = useState(false);
  const seed = standing.data?.seed ?? null;
  const deck = useMemo(() => (seed ? puzzleDeck(BigInt(seed)) : null), [seed]);
  const renders = useTileRenders(RENDERER_ASSETS);
  return (
    <>
      <PuzzleScene
        standing={standing.data ?? null}
        error={standing.unavailable ? "The Puzzle is not on this network yet." : (standing.error?.message ?? null)}
        errorDetail={standing.error ? errorDetail(standing.error) : undefined}
        onRetry={standing.unavailable ? undefined : standing.refetch}
        now={now}
        me={me}
        playing={open ? { score: open.score } : null}
        starting={busy}
        onPlay={play}
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
