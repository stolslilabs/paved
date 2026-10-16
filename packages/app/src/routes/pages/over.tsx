import { useEffect } from "react";
import { useParams } from "react-router";
import type { GameView } from "@paved/chain";
import { OverScene, type OverSceneProps } from "../../components/scenes/over-scene";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError, type ErrorDetail } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { rewardOf, settleProps, useOverRead, useSettle, type OverReward } from "../../data/over";
import { useDataSources } from "../../data/sources";
import { remainingOf, useTrainingSession } from "../../data/training";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { useRoutePage } from "../handle";
import { useChainClock } from "../../data/clock";
import { Placeholder } from "../Placeholder";
import { useAppNavigate, useBack } from "../ref";

/** `/training/over` (P3) and `/game/:gameId/over` (P7a). */
export default function Page() {
  const page = useRoutePage();
  return page?.path === "training/over" ? <TrainingOver /> : page?.path === "game/:gameId/over" ? <ChallengeRoute /> : <Placeholder />;
}

/** `/game/:gameId/over`: a game id is digits; anything else is not a game. */
function ChallengeRoute() {
  const { gameId } = useParams();
  return gameId && /^\d+$/.test(gameId) ? <ChallengeOver key={gameId} gameId={Number(gameId)} /> : <NotFound />;
}

/** The scene's reward from the page's: the state, the amount and the threshold it was measured against. */
function rewardProps(reward: OverReward): Pick<OverSceneProps["reward"], "state" | "amount" | "threshold"> {
  switch (reward.kind) {
    case "rewarded":
      return { state: "rewarded", amount: reward.amount, threshold: reward.threshold ?? undefined };
    case "below":
      return { state: "below", threshold: reward.threshold ?? undefined };
    case "expired":
      return { state: "expired", threshold: reward.threshold ?? undefined };
    case "pending":
      return { state: "awaiting", threshold: reward.threshold ?? undefined };
    default:
      return { state: "free" };
  }
}

/**
 * The end of a Challenge game, on its data (section 6.4): the final score and counters from `Challenge.game(id)`, every
 * closing from the game's tiles replayed on the engine, the reward from `Economy.terms(id)` (the amount once settled, the
 * deadline of an expired game), `Economy.day(day)` (the threshold once the day is closed) and the indexer's record (a free
 * game, the threshold the contract used). Settle is `Economy.settle`: "Settles after <date>" until the end of the day after
 * the game's, then the player's button; a guest connects. A game still in play goes back to its board, an unknown one is
 * "Game not found", a failed read has Retry. Play again opens the purchase, keeping the link's `?ref=`.
 */
function ChallengeOver({ gameId }: { gameId: number }) {
  const go = useAppNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const { signer = null } = useDataSources();
  const read = useOverRead(gameId);
  const now = useChainClock();
  const viewer = signer?.address ?? null;
  const control = useSettle(gameId, viewer);
  const playing = read.status === "playing";

  useEffect(() => {
    if (playing) go(`/game/${gameId}`, { replace: true });
  }, [playing, gameId, go]);

  if (read.status === "not-found") return <NotFound />;
  if (read.status === "error") return <OverStatus error={read.error.message} detail={errorDetail(read.error, { gameId })} onBack={onBack} onRetry={read.retry} />;
  if (read.status === "loading") return <OverStatus error={null} onBack={onBack} />;
  if (read.status === "playing") return null;

  const { game, terms, day, indexed, closings } = read;
  const reward = rewardOf(terms, day, indexed);
  const free = reward.kind === "free";
  const settle = terms && !free ? settleProps(terms, game.playerId, now, viewer, control, { connect: () => void wallet.connect() }) : null;
  return (
    <OverScene
      mode="challenge"
      game={game}
      closings={closings.data ?? []}
      closingsNote={closings.isPending ? "Reading the game's closings…" : closings.error ? "The closings of this game could not be read." : undefined}
      reward={{ ...rewardProps(reward), stake: terms && terms.stake > 0 ? terms.stake : undefined }}
      freeGame={free}
      rewardUnavailable={reward.kind === "none"}
      deadline={reward.kind === "expired" ? reward.deadline : undefined}
      settle={settle ? (control.error && settle.state === "refused" ? { ...settle, detail: errorDetail(control.error, { gameId }) } : settle) : undefined}
      now={now}
      onPlayAgain={() => go("/play/challenge")}
      onHome={() => go("/")}
    />
  );
}

/** The page while the game and its terms are read, and when a read failed (Retry). */
function OverStatus({ error, detail, onBack, onRetry }: { error: string | null; detail?: ErrorDetail; onBack: () => void; onRetry?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Final score" onBack={onBack} />
      <main aria-busy={error === null} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        {error === null ? (
          <Notice title="Reading the game…">Its score, its reward and its day.</Notice>
        ) : (
          <>
            <InlineError title="The game cannot be read" message={error} detail={detail} />
            <Button onClick={onRetry}>Retry</Button>
          </>
        )}
      </main>
    </div>
  );
}

/** A game id the chain does not know, or one that is not a number. */
function NotFound() {
  const go = useAppNavigate();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Game over" onBack={() => go("/", { replace: true })} />
      <main data-testid="game-not-found" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        <Notice tone="warning" title="Game not found">
          This game does not exist.
        </Notice>
        <Button onClick={() => go("/")}>Back home</Button>
      </main>
    </div>
  );
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
