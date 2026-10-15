import { useEffect, useState, type ReactNode } from "react";
import type { BoardTile, ScoredStructure } from "@paved/chain";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { BoardMap } from "../containers/board-map";
import type { BoardGhost } from "../containers/board-viewport";
import { ClosingFeed } from "../containers/closing-feed";
import { GameHud } from "../containers/game-hud";
import { HandPanel, type HandState } from "../containers/hand-panel";

export type BoardMode = "challenge" | "training" | "tutorial";

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
  };
  /** What the last move closed (`SessionState.lastScored`), shown as it arrives. */
  lastScored: ScoredStructure[];
  /** Where the board's tile art is served: the hand shows the same art as the board. */
  tileArt?: string;
  /** The hand's tile drawn by the renderer (`TileView`), given by the page like `canvas`; the art otherwise. */
  renderHandTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** `localStorage` refused: a Training or Tutorial game is not saved on this device. */
  storageDisabled?: boolean;
  /** Storage is there but the last move's save did not land (quota, a refusal): a reload resumes an older move. */
  saveDropped?: boolean;
  /** The legal slots of the tile in hand (the contracts' coordinates): the plan view draws them as buttons. */
  slots?: { x: number; y: number }[];
  /** The tile in hand on its chosen slot, as the plan view draws it (the page gives the canvas its own). */
  ghost?: BoardGhost | null;
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
  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {props.canvas ?? <BoardMap tiles={tiles} slots={props.slots} ghost={props.ghost} onSlotClick={props.onSlotClick} />}

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
            tileArt={props.tileArt}
            renderTile={props.renderHandTile}
            onRotate={props.onRotate}
            onConfirm={props.onConfirm}
            onDiscard={props.onDiscard}
            onSurrender={() => setSurrendering(true)}
            canSurrender={mode !== "tutorial"}
          />
        </div>
      )}

      {/* Radix closes it on Esc and on a click outside (P3); the game goes on. */}
      <Dialog open={surrendering} onOpenChange={setSurrendering}>
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>Surrender this game?</DialogTitle>
            <DialogDescription>
              {promptSurrender && "Its 24 hours are over: it takes no more moves, and only a surrender closes it. "}
              It ends now with your score of <span className="numeric">{formatPoints(props.score)}</span>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep playing</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setSurrendering(false);
                props.onSurrender?.();
              }}
            >
              Surrender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
