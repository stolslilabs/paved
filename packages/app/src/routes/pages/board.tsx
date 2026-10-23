import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { DISCARD_POINTS, MAX_UNCONFIRMED, type PredictedState } from "@paved/game-core";
import { BoardViewport } from "../../components/containers/board-viewport";
import { hasWebGL } from "../../components/containers/tile-view";
import { StackView, canDrawStack } from "../../components/containers/stack-view";
import { useTileArt } from "../../data/tile-art";
import { useTileRenders } from "../../data/tile-renders";
import { RENDERER_ASSETS, manifestBody } from "../../data/renderer-manifest";
import { provideManifest } from "@paved/renderer";
import type { HandState } from "../../components/containers/tile-stack";
import { InlineError } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { BoardScene } from "../../components/scenes/board-scene";
import { TopBar } from "../../components/containers/top-bar";
import { useBoardSkins } from "../../data/board-skins";
import { useBoardSettings } from "../../data/board-settings";
import { challengeQueue, useChallengeCurve, useChallengeSession } from "../../data/challenge";
import { remainingOf, useTrainingSession } from "../../data/training";
import { useDataSources } from "../../data/sources";
import { useErrorDetail } from "../error-detail";
import { useNow } from "../now";
import { useRoutePage } from "../handle";
import { Placeholder } from "../Placeholder";
import { useAppNavigate, useBack } from "../ref";
import { useAfterGameOver } from "../game-over";
import { usePlacement, type Slot } from "../../data/placement";

/**
 * The renderer reads the manifest the route asked for with this code (`data/renderer-manifest.ts`), not one of its own. If
 * a model does not load, or the browser has no WebGL, the board falls back to the plan view, which plays the same game.
 */
provideManifest(RENDERER_ASSETS, manifestBody(RENDERER_ASSETS));


/** `/training` (P3) and `/game/:gameId` (P5); Story levels have their own page (`story-board.tsx`). */
export default function Page() {
  const page = useRoutePage();
  if (page?.path === "training") return <TrainingBoard />;
  if (page?.path === "game/:gameId") return <ChallengeRoute />;
  return <Placeholder />;
}

/**
 * The Training board on its `LocalSession` (P3). The player picks a lit slot (a tap or a click; on a mouse, the hover
 * shows the ghost too), turns the tile, then places it: the move sent is built from the slot the ghost shows, through
 * `toChainSlot` (D1, #379). A finished game goes to `/training/over`, once its last move has played out on the board.
 */
function TrainingBoard() {
  const { game, snapshot, board, restart } = useTrainingSession();
  // The connected player's skins; a guest's board draws the base models.
  const skins = useBoardSkins(useDataSources().signer?.address ?? null);
  const boardSettings = useBoardSettings(game);
  const go = useAppNavigate();
  const onBack = useBack();
  // The 3D board, unless this browser has no WebGL or the renderer cannot start (its models not served): the plan view.
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));
  // The hand\'s tile chip draws the 256 px copy the manifest lists (the plan\'s areas until it is read).
  const tileArt = useTileArt(view === "3d" ? RENDERER_ASSETS : undefined);
  const renders = useTileRenders(RENDERER_ASSETS);

  const hand = board.hand;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  // The slots of every rotation, the slot chosen, the ghost (SLOTS). Another game (another tab's save followed, a new
  // game): the slot and orientation chosen for the old hand go. `snapshot` changes with every move.
  const placement = usePlacement({ plan: hand?.plan ?? null, slotsAt, orientationsAt, version: snapshot, resetKey: game, confirmMs: boardSettings.renderer?.placement?.motion?.confirmMs });
  const { orientation, move, ghost, slots } = placement;
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
      tiles={board.tiles}
      score={board.score}
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
      tileArt={tileArt}
      tileRenders={renders}
      skins={skins}
      renderHandStack={view === "3d" && canDrawStack() ? (v) => <StackView {...v} basePath={RENDERER_ASSETS} skins={skins} /> : undefined}
      storageDisabled={snapshot.storage === "off"}
      saveDropped={snapshot.storage === "dropped"}
      slots={slots}
      ghost={ghost}
      confirmed={placement.confirmed}
      bubble={bubble}
      onSlotClick={placement.choose}
      placementHighlight={boardSettings.placementHighlight}
      seasonWheel={boardSettings.wheel}
      canvas={
        view === "3d" ? (
          <BoardViewport
            settings={boardSettings.renderer}
            onScene={boardSettings.onScene}
            tilePreview={boardSettings.tilePreview}
            placementHighlight={boardSettings.placementHighlight}
            skins={skins}
            tiles={board.tiles}
            basePath={RENDERER_ASSETS}
            slots={slots}
            ghost={ghost}
            confirmed={placement.confirmed}
            bubble={bubble}
            onCellClick={placement.choose}
            onCellPress={placement.choose}
            onCellHover={placement.setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
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
  const boardSettings = useBoardSettings();
  const go = useAppNavigate();
  const onBack = useBack();
  const now = useNow();
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));
  // The hand\'s tile chip draws the 256 px copy the manifest lists (the plan\'s areas until it is read).
  const tileArt = useTileArt(view === "3d" ? RENDERER_ASSETS : undefined);
  const renders = useTileRenders(RENDERER_ASSETS);

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
  const placement = usePlacement({
    plan: playable && hand ? hand.plan : null,
    slotsAt,
    orientationsAt,
    version: state,
    resetKey: tileId,
    confirmMs: boardSettings.renderer?.placement?.motion?.confirmMs,
  });
  const { orientation, move, ghost, slots } = placement;
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
      {!playable && (
        <Notice title={senders ? "Another player's game" : "Connect to play"} className="pointer-events-auto w-full max-w-2xl">
          {senders ? "You are watching this game: only its player can move." : "This game is shown read only. Connect your wallet to play it."}
        </Notice>
      )}
      {state.stale && (
        <Notice
          tone="warning"
          title="The board may be out of date"
          className="pointer-events-auto w-full max-w-2xl"
          action={
            <Button size="sm" variant="secondary" onClick={() => void session?.retry()}>
              Retry
            </Button>
          }
        >
          The game could not be read again ({state.readError}). Your next move reads it first.
        </Notice>
      )}
      {import.meta.env.DEV && state.fallback && (
        <Notice tone="warning" title="Prediction off (dev)" className="pointer-events-auto w-full max-w-2xl">
          {state.fallback}
        </Notice>
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
      tiles={state.tiles}
      score={game?.score ?? 0}
      delta={state.delta}
      remaining={game ? remainingOf(game) : 0}
      discardedPlans={state.discardedPlans}
      expiresAt={state.expiresAt || null}
      // Past its 24 h a game earns nothing: the HUD shows no reward then.
      reward={expired ? null : curve}
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
      tileArt={tileArt}
      tileRenders={renders}
      skins={skins}
      renderHandStack={view === "3d" && canDrawStack() ? (v) => <StackView {...v} basePath={RENDERER_ASSETS} skins={skins} /> : undefined}
      slots={slots}
      ghost={ghost}
      confirmed={placement.confirmed}
      bubble={bubble}
      onSlotClick={placement.choose}
      readOnly={!playable}
      notices={notices}
      promptSurrender={playable && expired}
      placementHighlight={boardSettings.placementHighlight}
      seasonWheel={boardSettings.wheel}
      canvas={
        view === "3d" ? (
          <BoardViewport
            settings={boardSettings.renderer}
            onScene={boardSettings.onScene}
            tilePreview={boardSettings.tilePreview}
            placementHighlight={boardSettings.placementHighlight}
            skins={skins}
            tiles={state.tiles}
            gameId={gameId}
            basePath={RENDERER_ASSETS}
            slots={slots}
            ghost={ghost}
            confirmed={placement.confirmed}
            bubble={bubble}
            onCellClick={placement.choose}
            onCellPress={placement.choose}
            onCellHover={placement.setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onDiscard={discard}
      onSurrender={surrender}
    />
  );
}
