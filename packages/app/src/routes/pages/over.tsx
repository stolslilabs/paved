import { useEffect } from "react";
import type { GameView } from "@paved/chain";
import { OverScene } from "../../components/scenes/over-scene";
import { remainingOf, useTrainingSession } from "../../data/training";
import { useRoutePage } from "../handle";
import { Placeholder } from "../Placeholder";
import { useAppNavigate } from "../ref";

/** `/training/over` (P3); the Challenge's end, with its reward and settle, is P7's. */
export default function Page() {
  const page = useRoutePage();
  return page?.path === "training/over" ? <TrainingOver /> : <Placeholder />;
}

/**
 * The end of a Training game: its final counters and every closing, from the game the board played (the same
 * `TrainingGame`, or the save replayed after a reload). A game still in play goes back to its board. "Play again" starts
 * a new seed.
 */
function TrainingOver() {
  const { snapshot, newGame } = useTrainingSession();
  const go = useAppNavigate();
  const game = snapshot.state.game;
  const over = game?.over ?? false;

  useEffect(() => {
    if (!over) go("/training", { replace: true });
  }, [over, go]);
  if (!game || !over) return null;

  // Training has no chain game: the view carries the session's counters, and zeros where the chain would have a value.
  const view: GameView = {
    id: 0,
    playerId: game.playerId,
    mode: 0,
    seed: "0x0",
    score: game.score,
    over: true,
    tileCount: game.placedCount + game.discardedCount,
    placedCount: game.placedCount,
    discardedCount: game.discardedCount,
    tileId: snapshot.state.hand?.tileId ?? 0,
    plan: snapshot.state.hand?.plan ?? 0,
    remainingCount: remainingOf(game),
    deckSize: game.deckSize,
    startTime: 0,
    endTime: 0,
    dayId: 0,
    expiresAt: 0,
  };
  return (
    <OverScene
      mode="training"
      game={view}
      closings={snapshot.closings}
      reward={{ state: "free" }}
      onPlayAgain={() => {
        newGame();
        go("/training", { replace: true });
      }}
      onHome={() => go("/")}
    />
  );
}
