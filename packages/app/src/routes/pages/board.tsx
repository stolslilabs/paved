import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { DISCARD_POINTS, MAX_UNCONFIRMED, puzzleDayEnd, type PredictedState } from "@paved/game-core";
import type { HandState } from "../../components/containers/tile-stack";
import { InlineError } from "../../components/elements/inline-error";
import { BoardNotice, NOTICE_ACTION } from "../../components/containers/board-notice";
import { BoardScene } from "../../components/scenes/board-scene";
import { TopBar } from "../../components/containers/top-bar";
import { useBoardSkins } from "../../data/board-skins";
import { challengeQueue, useChallengeSession } from "../../data/challenge";
import { useChallengeCurve } from "../../data/reward-curve";
import { boardOf, remainingOf, useTrainingSession } from "../../data/training";
import { PuzzleGame, usePuzzleSession, type PuzzleSnapshot } from "../../data/puzzle-game";
import { usePuzzleStanding } from "../../data/puzzle";
import { addressKey } from "../../data/keys";
import { trainingStore, useDataSources } from "../../data/sources";
import { useTrainingBest } from "../../data/training-best";
import { challengeMeter, puzzleMeter, trainingMeter } from "../../lib/score-meter";
import { useErrorDetail } from "../error-detail";
import { useNow } from "../now";
import { useRoutePage } from "../handle";
import { Placeholder } from "../Placeholder";
import { useAppNavigate, useBack } from "../ref";
import { useAfterGameOver } from "../game-over";
import type { Slot } from "../../data/placement";
import { useGameBoard } from "../game-board";

/** `/training` (P3), `/game/:gameId` (P5) and `/puzzle/:gameId` (Play's Limited mode); Story levels have their own page (`story-board.tsx`). */
export default function Page() {
  const page = useRoutePage();
  if (page?.path === "training") return <TrainingBoard />;
  if (page?.path === "game/:gameId") return <ChallengeRoute />;
  if (page?.path === "puzzle/:gameId") return <PuzzleRoute />;
  return <Placeholder />;
}

/** `/puzzle/:gameId`: a game id is digits; anything else is not a game. */
function PuzzleRoute() {
  const { gameId } = useParams();
  return gameId && /^\d+$/.test(gameId) ? <PuzzleBoard key={gameId} gameId={Number(gameId)} /> : <Placeholder />;
}

/**
 * A Puzzle game (Play's Limited mode) on its session (`usePuzzleSession`): read from the source, then played on the device, each move
 * sent in order. As Training's board: the player picks a lit slot, turns the tile and places it. The HUD shows the day's time left (its
 * end: a game ranks only when it ends before), the score meter the day's first place; Surrender ends it, no Restart (the game is on
 * chain). Past the day's end the hand takes only a surrender, its dialog open by itself. A refused move stops the board until it is read
 * again. A finished game goes to `/puzzle/:gameId/over` once its last move is taken.
 */
function PuzzleBoard({ gameId }: { gameId: number }) {
  const { game, snapshot, record, settled, reload } = usePuzzleSession(gameId);
  const onBack = useBack();
  const readErrorDetail = useErrorDetail(record.error, gameId);
  if (!game || !snapshot) {
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title="Puzzle" onBack={onBack} />
        <main aria-busy={!record.error} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          {record.error ? (
            <InlineError title="This game cannot be read" message={record.error.message} detail={readErrorDetail} />
          ) : record.unavailable ? (
            <p className="text-center text-sm text-muted-foreground">The Puzzle is not on this network yet.</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Reading the game…</p>
          )}
        </main>
      </div>
    );
  }
  return <PuzzlePlay game={game} snapshot={snapshot} settled={settled} onReload={reload} onBack={onBack} />;
}

function PuzzlePlay({ game, snapshot, settled, onReload, onBack }: { game: PuzzleGame; snapshot: PuzzleSnapshot; settled: boolean; onReload: () => void; onBack: () => void }) {
  const { record } = game;
  const skins = useBoardSkins(record.player);
  const go = useAppNavigate();
  const now = useNow();
  const standing = usePuzzleStanding(record.day, record.player);
  const board = boardOf(snapshot.state);
  const hand = board.hand;
  const endsAt = puzzleDayEnd(record.day);
  const dayOver = !board.over && now >= endsAt;
  const refused = snapshot.refused;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  const playable = !refused && !dayOver;
  const { placement, scene } = useGameBoard({ skins, resetKey: game, placement: { plan: playable ? (hand?.plan ?? null) : null, slotsAt, orientationsAt, version: snapshot, resetKey: game } });
  const { orientation, move, slots } = placement;
  const preview = useMemo(() => (move ? game.preview(move) : null), [game, snapshot, move]);
  const handErrorDetail = useErrorDetail(snapshot.state.writeError, record.id);

  // The scores once the last move has played out on the board and the source has taken every move.
  const [surrendered, setSurrendered] = useState(false);
  useAfterGameOver(board.over, () => go(`/puzzle/${record.id}/over`, { replace: true }), { settled, hold: !surrendered });

  const confirm = useCallback(() => {
    if (!placement.canConfirm || !move || preview === null) return;
    const ghost = placement.ghost;
    if (game.place(move)) {
      placement.accepted(ghost);
      placement.setOrientation(1);
    }
  }, [game, placement, move, preview]);

  const discard = useCallback(() => {
    placement.clear();
    game.discard();
  }, [game, placement]);

  const surrender = useCallback(() => {
    setSurrendered(true);
    if (!game.surrender()) setSurrendered(false);
  }, [game]);

  // The meter's goal: the day's first place (the player's own best when they hold it).
  const leader = standing.data?.entries[0] ?? null;
  const mine = leader !== null && addressKey(leader.profile.address) === addressKey(record.player);
  const state = snapshot.state;
  const handState: HandState = !hand || board.over ? "empty" : dayOver ? "expired" : state.writeError ? "refused" : "placing";
  const bubble =
    placement.chosen && playable
      ? {
          cell: placement.chosen,
          rotations: placement.rotations.length,
          onRotate: placement.rotate,
          onClose: placement.clear,
          onDiscard: discard,
          discardCost: Math.min(board.score, DISCARD_POINTS),
          orientation,
          onConfirm: confirm,
          canConfirm: placement.canConfirm && preview !== null,
          busy: false,
        }
      : null;
  const notices = refused ? (
    <BoardNotice
      tone="warning"
      title="This move was refused"
      className="pointer-events-auto w-full max-w-2xl"
      action={
        <button type="button" className={NOTICE_ACTION} onClick={onReload}>
          Reload
        </button>
      }
    >
      {refused}. The board reads the game again.
    </BoardNotice>
  ) : dayOver ? (
    <BoardNotice tone="warning" title="The day is over" className="pointer-events-auto w-full max-w-2xl">
      This game no longer ranks: surrender to end it, then play today's Puzzle.
    </BoardNotice>
  ) : null;
  return (
    <BoardScene
      mode="puzzle"
      score={board.score}
      meter={puzzleMeter(leader?.score ?? null, board.score, mine)}
      delta={snapshot.delta}
      remaining={board.remaining}
      discardedPlans={board.discardedPlans}
      expiresAt={endsAt}
      now={now}
      deckPlans={game.deck}
      hand={{
        tile: hand && { plan: hand.plan, orientation },
        state: handState,
        coming: board.coming,
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: hand !== null && slots?.length === 0,
        preview,
        error: state.writeError,
        errorDetail: handErrorDetail,
      }}
      lastScored={board.lastScored}
      {...scene({ tiles: board.tiles, closed: board.closed, bubble })}
      readOnly={!!refused}
      notices={notices}
      promptSurrender={dayOver}
      onBack={onBack}
      onDiscard={discard}
      onSurrender={surrender}
    />
  );
}

/**
 * The Training board on its `LocalSession` (P3). The player picks a lit slot (a tap or a click; on a mouse, the hover
 * shows the ghost too), turns the tile, then places it: the move sent is built from the slot the ghost shows, through
 * `toChainSlot` (D1, #379). A finished game goes to `/training/over`, once its last move has played out on the board.
 */
function TrainingBoard() {
  const { game, snapshot, board, restart } = useTrainingSession();
  // The connected player's skins; a guest's board draws the base models.
  const sources = useDataSources();
  const skins = useBoardSkins(sources.signer?.address ?? null);
  const go = useAppNavigate();
  const onBack = useBack();
  const best = useTrainingBest(trainingStore(sources), `0x${game.seed.toString(16)}`);

  const hand = board.hand;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  // The slots of every rotation, the slot chosen, the ghost (SLOTS). Another game (another tab's save followed, a new
  // game): the slot and orientation chosen for the old hand go. `snapshot` changes with every move.
  // The season wheel starts again with a new game.
  const { placement, scene } = useGameBoard({ skins, resetKey: game, placement: { plan: hand?.plan ?? null, slotsAt, orientationsAt, version: snapshot, resetKey: game } });
  const { orientation, move, slots } = placement;
  const preview = useMemo(() => (move ? game.preview(move) : null), [game, snapshot, move]);
  const handErrorDetail = useErrorDetail(snapshot.state.writeError);

  // The last move plays out on the board first (`GAME_OVER_HOLD_MS`), then the scores.
  useAfterGameOver(board.over, () => go("/training/over", { replace: true }));

  // Confirm only a placed tile whose rotation fits (red: disabled). The green flash once the session took the move;
  // refused, the tile stays placed (its error in the hand).
  const [placing, setPlacing] = useState(false);
  const confirm = useCallback(async () => {
    if (!placement.canConfirm || !move || preview === null) return;
    const ghost = placement.ghost;
    setPlacing(true);
    try {
      if (await game.place(move)) {
        placement.accepted(ghost);
        placement.setOrientation(1);
      }
    } finally {
      setPlacing(false);
    }
  }, [game, placement, move, preview]);

  const discard = useCallback(() => {
    placement.clear();
    void game.discard();
  }, [game, placement]);

  const state = snapshot.state;
  const handState = !hand || board.over ? "empty" : state.writeError ? "refused" : "placing";
  const bubble = placement.chosen
    ? {
        cell: placement.chosen,
        rotations: placement.rotations.length,
        onRotate: placement.rotate,
        onClose: placement.clear,
        onDiscard: discard,
        discardCost: Math.min(board.score, DISCARD_POINTS),
        orientation,
        onConfirm: () => void confirm(),
        canConfirm: placement.canConfirm && preview !== null,
        busy: placing,
      }
    : null;
  return (
    <BoardScene
      mode="training"
      score={board.score}
      // The score meter (GAME-OVERLAY): to the device's best; none on its first game.
      meter={trainingMeter(best, board.score)}
      delta={snapshot.delta}
      remaining={board.remaining}
      discardedPlans={board.discardedPlans}
      expiresAt={null}
      now={Math.floor(Date.now() / 1000)}
      hand={{
        tile: hand && { plan: hand.plan, orientation },
        state: handState,
        coming: board.coming,
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: hand !== null && slots?.length === 0,
        preview,
        error: state.writeError,
        errorDetail: handErrorDetail,
      }}
      lastScored={board.lastScored}
      {...scene({ tiles: board.tiles, closed: board.closed, bubble })}
      onBack={onBack}
      onDiscard={discard}
      onRestart={() => {
        placement.clear();
        restart();
      }}
    />
  );
}

/** `/game/:gameId`: a game id is digits; anything else is not a game. */
function ChallengeRoute() {
  const { gameId } = useParams();
  return gameId && /^\d+$/.test(gameId) ? <ChallengeBoard key={gameId} gameId={Number(gameId)} /> : <Placeholder />;
}

/** Where the hand of a Challenge game is, from the session's state and the clock. */
function challengeHand(state: PredictedState, expired: boolean): HandState {
  if (state.game?.over) return "empty";
  if (expired) return "expired";
  // The hand waits: for the chain without prediction, or with the queue of unconfirmed moves full.
  if (state.pending && (!state.hand || state.unconfirmed >= MAX_UNCONFIRMED)) return "pending";
  if (!state.hand) return "empty";
  return state.writeError ? "refused" : "placing";
}

/**
 * A Challenge game on its `PredictedSession` (P5). As Training's board: the player picks a lit slot, turns the tile and
 * places it; the engine shows the tile, its points and the next tile at once, and the move stays pending until the
 * chain confirms it. Without a signer the board is read only ("Connect to play"); a refused move rolls back and shows
 * its error; a result the chain does not share resyncs the board ("Board resynced"); past `expiresAt` the hand only
 * offers a surrender, and the Surrender dialog opens by itself. A finished game goes to `/game/:gameId/over`, once its last
 * move has played out on the board and the chain has confirmed it. The HUD shows the score to beat, then what the score earns
 * at the game's day's threshold (`useChallengeCurve`, #705).
 */
function ChallengeBoard({ gameId }: { gameId: number }) {
  const { session, state, senders } = useChallengeSession(gameId);
  const curve = useChallengeCurve(gameId);
  // The game's player's skins, for whoever views the game; the base models until the game and the read answer.
  const skins = useBoardSkins(state?.game?.playerId ?? null);
  const go = useAppNavigate();
  const onBack = useBack();
  const now = useNow();

  const ready = state?.status === "ready" ? state : null;
  const hand = ready?.hand ?? null;
  const handErrorDetail = useErrorDetail(ready?.writeError, gameId);
  const readErrorDetail = useErrorDetail(state?.status === "error" ? state : null, gameId);
  const tileId = hand?.tileId ?? null;
  const expired = ready !== null && ready.expiresAt !== 0 && !ready.game?.over && now >= ready.expiresAt;
  const playable = ready !== null && !ready.readonly && senders !== null;
  const slotsAt = useCallback((o: number) => (session ? session.slots(o) : []), [session]);
  const orientationsAt = useCallback((cell: Slot) => (session ? session.orientationsAt(cell) : []), [session]);
  // The slots of every rotation, the slot chosen, the ghost (SLOTS); a viewer who cannot play gets none. A new tile in
  // hand (a move predicted, a resync): the slot chosen for the last one goes. `state` changes with every move.
  const { placement, scene } = useGameBoard({ skins, placement: { plan: playable && hand ? hand.plan : null, slotsAt, orientationsAt, version: state, resetKey: tileId } });
  const { orientation, move, slots } = placement;
  const preview = useMemo(() => (session && move ? session.preview(move) : null), [session, state, move]);

  const resynced = ready?.resynced ?? 0;
  useEffect(() => {
    if (resynced > 0) toast("Board resynced", { description: "The chain's game differed from the prediction: the board now shows the chain's." });
  }, [resynced]);

  // The scores once the last move has played out on the board (`GAME_OVER_HOLD_MS`, from the move, predicted or not) and the
  // chain has confirmed every move. A surrender has nothing to watch: the scores once it is confirmed.
  const [surrendered, setSurrendered] = useState(false);
  useAfterGameOver(ready?.game ? ready.game.over : null, () => go(`/game/${gameId}/over`, { replace: true }), {
    settled: ready?.unconfirmed === 0,
    hold: !surrendered,
  });

  // Confirm only a placed tile whose rotation fits (red: disabled). The green flash when the move is accepted: with
  // prediction, at once when the engine takes it (`place` applies it before it resolves; the receipt can come seconds and
  // moves later, and a refusal then rolls the board back with its error); without, once the chain confirms it. Refused,
  // the tile stays placed.
  const confirm = useCallback(() => {
    if (!session || !senders || !placement.canConfirm || !move || preview === null) return;
    const ghost = placement.ghost;
    const done = session.place(move, () => senders.build(move));
    const now = session.state;
    if (now.status === "ready" && now.predicting) {
      if (!now.writeError && now.tiles.some((t) => t.x === move.x && t.y === move.y)) placement.accepted(ghost);
    } else {
      void done.then((ok) => ok && placement.accepted(ghost));
    }
  }, [session, senders, placement, move, preview]);

  const discard = useCallback(() => {
    if (!session || !senders) return;
    placement.clear();
    void session.discard(() => senders.discard());
  }, [session, senders, placement]);

  const surrender = useCallback(() => {
    if (!session || !senders) return;
    setSurrendered(true);
    void session.surrender(() => senders.surrender()).then((ok) => ok || setSurrendered(false));
  }, [session, senders]);

  if (!state || state.status !== "ready") {
    // Back stays offered while the game is read, and when it cannot be.
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title={`Challenge #${gameId}`} onBack={onBack} />
        <main aria-busy={state?.status !== "error"} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          {state?.status === "error" ? (
            <InlineError
              title={state.error === "game-not-found" ? "No such game" : "This game cannot be read"}
              message={state.error === "game-not-found" ? `There is no Challenge game #${gameId}.` : state.message}
              detail={readErrorDetail && { ...readErrorDetail, code: state.error ?? undefined }}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">Reading the game…</p>
          )}
        </main>
      </div>
    );
  }

  const game = state.game;
  const notices = (
    <>
      {/* Another player's game says so; the player's own waits for the account (NO-GUEST: made at start, none asked to connect). */}
      {!playable && senders && (
        <BoardNotice title="Another player's game" className="pointer-events-auto w-full max-w-2xl">
          You are watching this game: only its player can move.
        </BoardNotice>
      )}
      {state.stale && (
        <BoardNotice
          tone="warning"
          title="The board may be out of date"
          className="pointer-events-auto w-full max-w-2xl"
          action={
            <button type="button" className={NOTICE_ACTION} onClick={() => void session?.retry()}>
              Retry
            </button>
          }
        >
          The game could not be read again ({state.readError}). Your next move reads it first.
        </BoardNotice>
      )}
      {import.meta.env.DEV && state.fallback && (
        <BoardNotice tone="warning" title="Prediction off (dev)" className="pointer-events-auto w-full max-w-2xl">
          {state.fallback}
        </BoardNotice>
      )}
    </>
  );
  // The bubble stays while the move is on its way (no prediction, or the queue full): Validate shows its spinner.
  const handState = challengeHand(state, expired);
  const queue = challengeQueue(state);
  const bubble =
    placement.chosen && playable && handState !== "expired" && handState !== "empty"
      ? {
          cell: placement.chosen,
          rotations: placement.rotations.length,
          onRotate: placement.rotate,
          onClose: placement.clear,
          onDiscard: discard,
          discardCost: Math.min(game?.score ?? 0, DISCARD_POINTS),
          orientation,
          onConfirm: confirm,
          canConfirm: placement.canConfirm && preview !== null,
          busy: handState === "pending",
        }
      : null;
  return (
    <BoardScene
      mode="challenge"
      gameId={gameId}
      score={game?.score ?? 0}
      delta={state.delta}
      remaining={game ? remainingOf(game) : 0}
      discardedPlans={state.discardedPlans}
      expiresAt={state.expiresAt || null}
      // Past its 24 h a game earns nothing: the HUD shows no reward then.
      reward={expired ? null : curve}
      // The score meter (GAME-OVERLAY): to the score to beat, then to the cap; none once the game earns nothing.
      meter={expired || !curve ? null : challengeMeter(curve, game?.score ?? 0)}
      now={now}
      hand={{
        // The tile to place in its rotation; one waiting with the move is shown as drawn (#645).
        tile: queue.tile && { plan: queue.tile.plan, orientation: hand ? orientation : 1 },
        state: handState,
        coming: queue.coming,
        drawing: queue.drawing,
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: hand !== null && slots?.length === 0,
        preview,
        error: state.writeError,
        errorDetail: handErrorDetail,
      }}
      lastScored={state.lastScored}
      {...scene({ tiles: state.tiles, closed: state.closed, gameId, bubble })}
      readOnly={!playable}
      notices={notices}
      promptSurrender={playable && expired}
      onBack={onBack}
      onDiscard={discard}
      onSurrender={surrender}
    />
  );
}
