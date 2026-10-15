import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { CENTER, MAX_UNCONFIRMED, WRONG_SQUARE, initialOrientation, orientationName, type PlaceMove, type PredictedState } from "@paved/game-core";
import { BoardViewport } from "../../components/containers/board-viewport";
import { TileView, hasWebGL } from "../../components/containers/tile-view";
import type { HandState } from "../../components/containers/hand-panel";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { BoardScene } from "../../components/scenes/board-scene";
import { TopBar } from "../../components/containers/top-bar";
import { useChallengeSession } from "../../data/challenge";
import { remainingOf, useTrainingSession } from "../../data/training";
import { trainingStore, useDataSources } from "../../data/sources";
import { useTutorialClaim, useTutorialClaimed, useTutorialRun } from "../../data/tutorial";
import { useAccount } from "../../wallet/wallet";
import { useNow } from "../now";
import { useRoutePage } from "../handle";
import { Placeholder } from "../Placeholder";
import { useAppNavigate, useBack } from "../ref";

/**
 * Where the renderer finds its assets, at this path in dev, preview and the build (`vite/renderer-assets.ts`): the app's own
 * `public/renderer-assets/` holds the meshopt-compressed models under content-hashed names, and the plugin serves (dev) or
 * writes (build) the `manifest.json` that lists them, which the renderer's `AssetLoader` reads; the tile art still comes
 * from app-web's `public/`. If a model does not load, or the browser has no WebGL, the board falls back to the plan view,
 * which plays the same game.
 */
const RENDERER_ASSETS = `${import.meta.env.BASE_URL}renderer-assets`;

type Slot = { x: number; y: number };
const same = (a: Slot | null, b: Slot | null) => a !== null && b !== null && a.x === b.x && a.y === b.y;

/** `/training` (P3), `/game/:gameId` (P5) and `/tutorial` (P6). */
export default function Page() {
  const page = useRoutePage();
  if (page?.path === "training") return <TrainingBoard />;
  if (page?.path === "game/:gameId") return <ChallengeRoute />;
  if (page?.path === "tutorial") return <TutorialBoard />;
  return <Placeholder />;
}

/**
 * The Training board on its `LocalSession` (P3). The player picks a lit slot (a tap or a click; on a mouse, the hover
 * shows the ghost too), turns the tile, then places it: the move sent is built from the slot the ghost shows, through
 * `toChainSlot` (D1, #379). A finished game goes to `/training/over`.
 */
function TrainingBoard() {
  const { game, snapshot, board } = useTrainingSession();
  const go = useAppNavigate();
  const onBack = useBack();
  const [orientation, setOrientation] = useState(1);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [hovered, setHovered] = useState<Slot | null>(null);
  // The 3D board, unless this browser has no WebGL or the renderer cannot start (its models not served): the plan view.
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));

  const hand = board.hand;
  // `snapshot` changes with every move: the slots are those of the tile now in hand.
  const slots = useMemo(() => (hand ? game.slots(orientation) : []), [game, snapshot, hand, orientation]);
  const target = chosen ?? (hovered && slots.some((s) => same(s, hovered)) ? hovered : null);
  const move = useMemo<PlaceMove | null>(() => (target && hand ? { orientation, x: target.x, y: target.y } : null), [target, hand, orientation]);
  const preview = useMemo(() => (move ? game.preview(move) : null), [game, snapshot, move]);
  const ghost = move && hand && preview !== null ? { ...move, plan: hand.plan } : null;

  // Another game (another tab's save followed, a new game): the slot and orientation chosen for the old hand go.
  useEffect(() => {
    setChosen(null);
    setOrientation(1);
  }, [game]);

  useEffect(() => {
    if (board.over) go("/training/over", { replace: true });
  }, [board.over, go]);

  // A cell is chosen in any orientation the tile fits there: the first one, unless the current one fits.
  const choose = useCallback(
    (cell: Slot) => {
      const fits = game.orientationsAt(cell);
      if (fits.length === 0) return;
      setChosen(cell);
      if (!fits.includes(orientation)) setOrientation(fits[0]!);
    },
    [game, orientation],
  );

  // On a chosen slot the tile turns through the orientations that fit there; otherwise through all four.
  const rotate = useCallback(() => {
    const fits = chosen ? game.orientationsAt(chosen) : [1, 2, 3, 4];
    const next = fits.find((o) => o > orientation) ?? fits[0];
    if (next !== undefined) setOrientation(next);
  }, [game, chosen, orientation]);

  const confirm = useCallback(async () => {
    if (!move || preview === null) return;
    setChosen(null);
    if (await game.place(move)) setOrientation(1);
  }, [game, move, preview]);

  const discard = useCallback(() => {
    setChosen(null);
    void game.discard();
  }, [game]);

  const surrender = useCallback(() => void game.surrender(), [game]);

  const state = snapshot.state;
  const handState = !hand || board.over ? "empty" : state.writeError ? "refused" : "placing";
  return (
    <BoardScene
      mode="training"
      tiles={board.tiles}
      score={board.score}
      delta={snapshot.delta}
      remaining={board.remaining}
      expiresAt={null}
      now={Math.floor(Date.now() / 1000)}
      hand={{ tile: hand && { plan: hand.plan, orientation }, state: handState, slotChosen: move !== null && preview !== null, preview, error: state.writeError }}
      lastScored={board.lastScored}
      tileArt={view === "3d" ? RENDERER_ASSETS : undefined}
      renderHandTile={view === "3d" ? (t) => <TileView {...t} basePath={RENDERER_ASSETS} /> : undefined}
      storageDisabled={snapshot.storage === "off"}
      saveDropped={snapshot.storage === "dropped"}
      slots={slots}
      ghost={ghost}
      onSlotClick={choose}
      canvas={
        view === "3d" ? (
          <BoardViewport
            tiles={board.tiles}
            basePath={RENDERER_ASSETS}
            slots={slots}
            ghost={ghost}
            onCellClick={choose}
            onCellHover={setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onRotate={rotate}
      onConfirm={confirm}
      onDiscard={discard}
      onSurrender={surrender}
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
 * offers a surrender, and the Surrender dialog opens by itself. A finished game goes to `/game/:gameId/over`.
 */
function ChallengeBoard({ gameId }: { gameId: number }) {
  const { session, state, senders } = useChallengeSession(gameId);
  const go = useAppNavigate();
  const onBack = useBack();
  const now = useNow();
  const [orientation, setOrientation] = useState(1);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [hovered, setHovered] = useState<Slot | null>(null);
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));

  const ready = state?.status === "ready" ? state : null;
  const hand = ready?.hand ?? null;
  const tileId = hand?.tileId ?? null;
  // The slots are those of the tile now in hand: `state` changes with every move.
  const slots = useMemo(() => (session && hand ? session.slots(orientation) : []), [session, state, hand, orientation]);
  const target = chosen ?? (hovered && slots.some((s) => same(s, hovered)) ? hovered : null);
  const move = useMemo<PlaceMove | null>(() => (target && hand ? { orientation, x: target.x, y: target.y } : null), [target, hand, orientation]);
  const preview = useMemo(() => (session && move ? session.preview(move) : null), [session, state, move]);
  const ghost = move && hand && preview !== null ? { ...move, plan: hand.plan } : null;
  const expired = ready !== null && ready.expiresAt !== 0 && !ready.game?.over && now >= ready.expiresAt;
  const playable = ready !== null && !ready.readonly && senders !== null;

  // A new tile in hand (a move predicted, a resync): the slot chosen for the last one goes.
  useEffect(() => {
    setChosen(null);
    setOrientation(1);
  }, [tileId]);

  const resynced = ready?.resynced ?? 0;
  useEffect(() => {
    if (resynced > 0) toast("Board resynced", { description: "The chain's game differed from the prediction: the board now shows the chain's." });
  }, [resynced]);

  const over = ready?.game?.over ?? false;
  useEffect(() => {
    if (over && ready?.unconfirmed === 0) go(`/game/${gameId}/over`, { replace: true });
  }, [over, ready?.unconfirmed, gameId, go]);

  const choose = useCallback(
    (cell: Slot) => {
      if (!session) return;
      const fits = session.orientationsAt(cell);
      if (fits.length === 0) return;
      setChosen(cell);
      if (!fits.includes(orientation)) setOrientation(fits[0]!);
    },
    [session, orientation],
  );

  const rotate = useCallback(() => {
    const fits = chosen && session ? session.orientationsAt(chosen) : [1, 2, 3, 4];
    const next = fits.find((o) => o > orientation) ?? fits[0];
    if (next !== undefined) setOrientation(next);
  }, [session, chosen, orientation]);

  const confirm = useCallback(() => {
    if (!session || !senders || !move || preview === null) return;
    setChosen(null);
    void session.place(move, () => senders.build(move));
  }, [session, senders, move, preview]);

  const discard = useCallback(() => {
    if (!session || !senders) return;
    setChosen(null);
    void session.discard(() => senders.discard());
  }, [session, senders]);

  const surrender = useCallback(() => {
    if (session && senders) void session.surrender(() => senders.surrender());
  }, [session, senders]);

  if (!state || state.status !== "ready") {
    // Back stays offered while the game is read, and when it cannot be.
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title={`Challenge #${gameId}`} onBack={onBack} />
        <main aria-busy={state?.status !== "error"} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4">
          {state?.status === "error" ? (
            <Notice tone="danger" title={state.error === "game-not-found" ? "No such game" : "This game cannot be read"}>
              {state.error === "game-not-found" ? `There is no Challenge game #${gameId}.` : state.message}
            </Notice>
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
  return (
    <BoardScene
      mode="challenge"
      gameId={gameId}
      tiles={state.tiles}
      score={game?.score ?? 0}
      delta={state.delta}
      remaining={game ? remainingOf(game) : 0}
      expiresAt={state.expiresAt || null}
      now={now}
      hand={{
        tile: hand && { plan: hand.plan, orientation },
        state: challengeHand(state, expired),
        slotChosen: move !== null && preview !== null,
        preview,
        error: state.writeError,
      }}
      lastScored={state.lastScored}
      tileArt={view === "3d" ? RENDERER_ASSETS : undefined}
      renderHandTile={view === "3d" ? (t) => <TileView {...t} basePath={RENDERER_ASSETS} /> : undefined}
      slots={playable ? slots : []}
      ghost={ghost}
      onSlotClick={choose}
      readOnly={!playable}
      notices={notices}
      promptSurrender={playable && expired}
      canvas={
        view === "3d" ? (
          <BoardViewport
            tiles={state.tiles}
            basePath={RENDERER_ASSETS}
            slots={playable ? slots : []}
            ghost={ghost}
            onCellClick={choose}
            onCellHover={setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onRotate={rotate}
      onConfirm={confirm}
      onDiscard={discard}
      onSurrender={surrender}
    />
  );
}

/** Whether the store refuses to save (private mode, blocked site data): the tutorial's progress then lives in memory. */
function storageOff(store: ReturnType<typeof trainingStore>): boolean {
  try {
    return store() === null;
  } catch {
    return true;
  }
}

/**
 * `/tutorial` (P6): the scripted game (D-21, P-49) on the board scene, on game-core's `TutorialRun` kept for the page's
 * life (`useTutorialRun`). Each build step lights one slot, the stage's; the player turns the tile to match the example
 * and places it, and any other move is refused with its reason in the hand. A burn step asks for a discard. The stage's
 * text, Back and Restart sit under the header; at the end, the final score and the claim of First Stone (D-21), which
 * needs a connected wallet. No chain is read before the end.
 */
function TutorialBoard() {
  const { view, board, index, steps, play, back, restart } = useTutorialRun();
  const sources = useDataSources();
  const onBack = useBack();
  const step = view.step;
  const [orientation, setOrientation] = useState(() => initialOrientation(step));
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [hovered, setHovered] = useState<Slot | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [view3d, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));

  // A new step (played, Back, Restart): its own orientation, no slot chosen, no refusal.
  useEffect(() => {
    setOrientation(initialOrientation(step));
    setChosen(null);
    setRefusal(null);
  }, [index, step]);

  const preset = step?.kind === "build" && step.placement ? { x: CENTER + step.placement.x, y: CENTER + step.placement.y } : null;
  const slots = useMemo(() => (preset ? [preset] : []), [preset?.x, preset?.y]);
  const hand = board.hand;
  const target = chosen ?? (hovered && same(hovered, preset) ? hovered : null);
  const move = useMemo<PlaceMove | null>(() => (target && hand ? { orientation, x: target.x, y: target.y } : null), [target, hand, orientation]);
  // Where the tile may go in this orientation (the engine's rules), and its points when it is the step's own placement
  // (the tutorial's engine builds only that one): a legal but wrong orientation is refused on Place, with its reason.
  const placement = move && { orientation: orientationName(move.orientation), x: move.x - CENTER, y: move.y - CENTER };
  const legal = useMemo(() => placement !== null && view.game.canPlace(placement), [view, placement?.orientation, placement?.x, placement?.y]);
  const scripted = placement !== null && step?.placement?.orientation === placement.orientation;
  const preview = useMemo(() => (legal && scripted ? view.game.clone().build(placement!).points : null), [view, legal, scripted]);
  const ghost = move && hand && legal ? { ...move, plan: hand.plan } : null;

  const choose = useCallback(
    (cell: Slot) => {
      if (!same(cell, preset)) {
        setRefusal(WRONG_SQUARE);
        return;
      }
      setRefusal(null);
      setChosen(cell);
    },
    [preset?.x, preset?.y],
  );
  const rotate = useCallback(() => setOrientation((o) => (o % 4) + 1), []);
  const confirm = useCallback(() => {
    if (!move) return;
    setRefusal(play({ kind: "build", orientation: move.orientation, x: move.x - CENTER, y: move.y - CENTER }));
  }, [move, play]);
  const discard = useCallback(() => setRefusal(play({ kind: "discard" })), [play]);

  const stage = (
    <section aria-label="Tutorial stage" data-slot="card" className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-border bg-card/95 p-3 text-sm shadow-lg backdrop-blur">
      {view.over ? (
        <TutorialComplete score={board.score} />
      ) : (
        <>
          <span className="text-xs text-muted-foreground">
            Step {index + 1} of {steps}
          </span>
          <p role="status" aria-live="polite" className="wrap-anywhere">
            {step?.text}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={back} disabled={index === 0}>
          Previous step
        </Button>
        <Button size="sm" variant="ghost" onClick={restart} disabled={index === 0}>
          Restart
        </Button>
      </div>
    </section>
  );

  return (
    <BoardScene
      mode="tutorial"
      tiles={board.tiles}
      score={board.score}
      remaining={board.remaining}
      now={0}
      hand={{
        tile: hand && { plan: hand.plan, orientation },
        state: !hand || view.over ? "empty" : refusal ? "refused" : "placing",
        slotChosen: legal,
        preview,
        error: refusal,
      }}
      lastScored={board.lastScored}
      tileArt={view3d === "3d" ? RENDERER_ASSETS : undefined}
      renderHandTile={view3d === "3d" ? (t) => <TileView {...t} basePath={RENDERER_ASSETS} /> : undefined}
      storageDisabled={storageOff(trainingStore(sources))}
      slots={slots}
      ghost={ghost}
      onSlotClick={choose}
      readOnly={view.over}
      notices={stage}
      canvas={
        view3d === "3d" ? (
          <BoardViewport
            tiles={board.tiles}
            basePath={RENDERER_ASSETS}
            slots={slots}
            ghost={ghost}
            onCellClick={choose}
            onCellHover={setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onRotate={rotate}
      onConfirm={confirm}
      onDiscard={discard}
    />
  );
}

/**
 * The tutorial's end: the final score, then First Stone claimed on chain with one `Setup.claim_tutorial()` (D-21). The
 * claim needs a connected wallet (Connect is offered); a claim made before is read first (`tutorial_claimed`), so it
 * needs no transaction. Nothing checks on chain that the tutorial was played (P-49): the claim is the player's word.
 */
function TutorialComplete({ score }: { score: number }) {
  const go = useAppNavigate();
  const wallet = useAccount();
  const claimed = useTutorialClaimed(wallet.address);
  const claim = useTutorialClaim();
  const outcome = claim.data?.outcome ?? null;

  let body;
  if (!wallet.address) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Connect a wallet to claim the achievement First Stone.</span>
        <Button size="sm" onClick={() => void wallet.connect()} loading={wallet.status === "connecting"}>
          Connect
        </Button>
      </div>
    );
  } else if (outcome === "claimed") {
    body = <p role="status">Claimed: First Stone is yours.</p>;
  } else if (outcome === "already-claimed" || (claim.isIdle && claimed.data === true)) {
    body = <p role="status">Already claimed: this account had First Stone before.</p>;
  } else if (claim.isIdle && claimed.isPending) {
    body = <p role="status">Checking your claim…</p>;
  } else {
    // An unreadable claim is still offered: the write says what the chain thinks.
    body = (
      <div className="flex flex-col gap-2">
        <Button size="sm" className="self-start" onClick={() => claim.mutate()} loading={claim.isPending}>
          Claim First Stone
        </Button>
        {claim.error && (
          <p role="alert" className="text-destructive-text wrap-anywhere">
            The claim was refused: {claim.error.message}
          </p>
        )}
      </div>
    );
  }
  return (
    <div data-testid="tutorial-complete" className="flex flex-col gap-2">
      <h2 className="font-display text-base font-semibold">Tutorial complete</h2>
      <p>
        Final score: <span className="numeric">{score}</span>. You know how roads, cities, forests and wonders score.
      </p>
      {body}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => go("/training")}>
          Play Training
        </Button>
        <Button size="sm" variant="ghost" onClick={() => go("/")}>
          Home
        </Button>
      </div>
    </div>
  );
}
