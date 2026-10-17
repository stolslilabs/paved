import type { TileArt } from "../elements/tile-chip";
import { useEffect, useState, type ReactNode } from "react";
import type { BoardTile, ScoredStructure } from "@paved/chain";
import { toastError } from "../containers/error-toast";
import { errorDetail } from "../../routes/error-detail";
import { Notice } from "../elements/notice";
import { BoardMap } from "../containers/board-map";
import { useDeferred } from "../../lib/deferred";
import { prefetchAllowed, whenIdle } from "../../routes/prefetch";
import type { BoardGhost } from "../containers/board-viewport";
import { ClosingFeed } from "../containers/closing-feed";
import { GameHud } from "../containers/game-hud";
import type { ErrorDetail } from "../elements/inline-error";
import { HandPanel, type HandState } from "../containers/hand-panel";

export type BoardMode = "challenge" | "training" | "tutorial";

// The Surrender dialog (and Radix under it) is not the first frame's: its module loads at the first Surrender, and in the
// browser's idle time after the board is up (BOARD-CHUNK, `__tests__/board-modules.test.ts`). The plan view stays: it is
// the board where the canvas cannot start, and 1.6 KB gzip does not buy a second fetch there.
const loadSurrenderDialog = () => import("../containers/surrender-dialog");
const PREFETCH_AFTER_MS = 3000;

const TITLES: Record<BoardMode, string> = { challenge: "Challenge", training: "Training", tutorial: "Tutorial" };

export interface BoardSceneProps {
  mode: BoardMode;
  /** The Challenge game id, shown in the title. */
  gameId?: number;
  tiles: BoardTile[];
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** `GameView.remainingCount`: discards count against the tiles left (P3), and are not shown. */
  remaining: number;
  /** `GameView.expiresAt` (S1): a Challenge game's start + 24 h; past it only a surrender is accepted. */
  expiresAt?: number | null;
  now: number;
  hand: {
    tile: { plan: number; orientation: number } | null;
    state: HandState;
    slotChosen?: boolean;
    preview?: number | null;
    error?: string | null;
    /** The refusal's detail for support (`InlineError`). */
    errorDetail?: ErrorDetail;
  };
  /** What the last move closed (`SessionState.lastScored`), shown as it arrives. */
  lastScored: ScoredStructure[];
  /** The tiles' images (`useTileArt`): the hand shows the same art as the board. */
  tileArt?: TileArt;
  /** The hand's tile drawn by the renderer (`TileView`), given by the page like `canvas`; the art otherwise. */
  renderHandTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** `localStorage` refused: a Training or Tutorial game is not saved on this device. */
  storageDisabled?: boolean;
  /** Storage is there but the last move's save did not land (quota, a refusal): a reload resumes an older move. */
  saveDropped?: boolean;
  /** The legal slots of the tile in hand in any rotation (the contracts' coordinates), `fits` at the current one: the plan view draws them as buttons. */
  slots?: { x: number; y: number; fits?: boolean }[];
  /** The tile in hand on its chosen slot, as the plan view draws it (the page gives the canvas its own). */
  ghost?: BoardGhost | null;
  /** A move just sent: the plan view flashes its cell green. */
  confirmed?: (BoardGhost & { key: number }) | null;
  /** The player's placement highlight setting: off, the plan view draws its slots plain (they stay clickable). On when omitted. */
  placementHighlight?: boolean;
  /** A slot of the plan view was chosen. */
  onSlotClick?: (slot: { x: number; y: number }) => void;
  /**
   * The 3D board: the real renderer's canvas (`BoardViewport`), given by the page. Without it the scene draws the
   * plan view (`BoardMap`), as in the render tests where jsdom has no WebGL.
   */
  canvas?: ReactNode;
  onBack?: () => void;
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  /** Called once the player confirms in the Surrender dialog the hand's Surrender opens. */
  onSurrender?: () => void;
  /** No hand: the board of a game the viewer cannot play (no account, another player's game). */
  readOnly?: boolean;
  /** Lines under the header: "Connect to play", the dev-only prediction notice, the tutorial's stage and its end. */
  notices?: ReactNode;
  /** A line under the header that stays on screen: the D-15 notice, given by the page (the board routes have no footer). */
  footnote?: ReactNode;
  /** Opens the Surrender dialog when it turns true: an expired Challenge game closes only by a surrender (P5). */
  promptSurrender?: boolean;
}

/** The game board (`/game/:id`, `/training`, `/tutorial`): the scene full screen, its header, the closings, the hand. */
export function BoardScene(props: BoardSceneProps) {
  const { mode, gameId, tiles, hand, now } = props;
  const title = mode === "challenge" && gameId != null ? `Challenge #${gameId}` : TITLES[mode];
  const [surrendering, setSurrendering] = useState(false);
  const { promptSurrender } = props;
  useEffect(() => {
    if (promptSurrender) setSurrendering(true);
  }, [promptSurrender]);
  // Once the board has had its models and its first frame (`PREFETCH_AFTER_MS`), and the browser is idle: the module the
  // Surrender button would ask for. Sooner, its request would queue with the models'.
  useEffect(() => {
    if (!prefetchAllowed()) return;
    let cancel = () => {};
    const timer = setTimeout(() => (cancel = whenIdle(() => void loadSurrenderDialog().catch(() => {}))), PREFETCH_AFTER_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, []);
  const surrenderDialog = useDeferred(loadSurrenderDialog, surrendering, (e) => {
    setSurrendering(false);
    toastError({ title: "Surrender", message: "The Surrender dialog could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {props.canvas ?? <BoardMap tiles={tiles} slots={props.slots} ghost={props.ghost} confirmed={props.confirmed} onSlotClick={props.onSlotClick} highlight={props.placementHighlight ?? true} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <GameHud
          title={title}
          score={props.score}
          delta={props.delta}
          remaining={props.remaining}
          expiresAt={mode === "challenge" ? props.expiresAt : null}
          now={now}
          onBack={props.onBack}
          className="pointer-events-auto w-full max-w-2xl"
        />
        {props.storageDisabled && (
          <Notice tone="warning" title="Storage is off" className="pointer-events-auto w-full max-w-2xl">
            This browser refuses local storage: this game is not saved and ends if the page closes.
          </Notice>
        )}
        {!props.storageDisabled && props.saveDropped && (
          <Notice tone="warning" title="Last move not saved" className="pointer-events-auto w-full max-w-2xl">
            This browser refused to save the last move: if the page closes, the game resumes before it.
          </Notice>
        )}
        {props.notices}
        {props.footnote && (
          <div className="pointer-events-auto max-w-2xl rounded-md bg-ink-950 px-2 py-0.5 text-center text-xs text-muted-foreground">{props.footnote}</div>
        )}
        <ClosingFeed closings={props.lastScored} className="mt-1" />
      </div>

      {!props.readOnly && (
        <div className="absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] tablet:inset-x-auto tablet:right-4 tablet:bottom-4 tablet:w-96">
          <HandPanel
            tile={hand.tile}
            state={hand.state}
            slotChosen={hand.slotChosen}
            preview={hand.preview}
            error={hand.error}
            errorDetail={hand.errorDetail}
            tileArt={props.tileArt}
            renderTile={props.renderHandTile}
            onRotate={props.onRotate}
            onConfirm={props.onConfirm}
            onDiscard={props.onDiscard}
            onSurrender={() => setSurrendering(true)}
            canSurrender={mode !== "tutorial"}
            surrenderPending={surrendering && !surrenderDialog}
          />
        </div>
      )}

      {surrenderDialog && (
        <surrenderDialog.SurrenderDialog open={surrendering} onOpenChange={setSurrendering} expired={promptSurrender} score={props.score} onSurrender={() => props.onSurrender?.()} />
      )}
    </div>
  );
}
