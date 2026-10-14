import type { ReactNode } from "react";
import type { BoardTile, ScoredStructure } from "@paved/chain";
import { Notice } from "../elements/notice";
import { BoardMap } from "../containers/board-map";
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
  /** `GameView.remainingCount`, and `discardedCount`: discards count against the tiles left (P3). */
  remaining: number;
  discarded: number;
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
  /**
   * The 3D board: the real renderer's canvas (`BoardViewport`), given by the page. Without it the scene draws the
   * plan view (`BoardMap`), as in the render tests where jsdom has no WebGL.
   */
  canvas?: ReactNode;
  onBack?: () => void;
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  onSurrender?: () => void;
}

/** The game board (`/game/:id`, `/training`, `/tutorial`): the scene full screen, its header, the closings, the hand. */
export function BoardScene(props: BoardSceneProps) {
  const { mode, gameId, tiles, hand, now } = props;
  const title = mode === "challenge" && gameId != null ? `Challenge #${gameId}` : TITLES[mode];
  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {props.canvas ?? <BoardMap tiles={tiles} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <GameHud
          title={title}
          score={props.score}
          delta={props.delta}
          remaining={props.remaining}
          discarded={props.discarded}
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
        <ClosingFeed closings={props.lastScored} className="mt-1" />
      </div>

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
          onSurrender={props.onSurrender}
        />
      </div>
    </div>
  );
}
