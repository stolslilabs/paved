import { Suspense, type ReactNode } from "react";
import type { BoardTile, ScoredStructure } from "@paved/chain";
import { DISCARD_POINTS } from "@paved/game-core";
import type { PvpCell, PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import type { ErrorDetail } from "../elements/inline-error";
import { StarMeter } from "../elements/star-meter";
import type { TileArt } from "../elements/tile-chip";
import type { TileRenders } from "../elements/tile-render";
import type { TileSkins } from "@paved/renderer";
import { BoardMap } from "../containers/board-map";
import type { BoardBubble, BoardGhost } from "../containers/board-viewport";
import { ClosingFeed } from "../containers/closing-feed";
import { GameHud } from "../containers/game-hud";
import { LazyTileBubble } from "../containers/lazy-tile-bubble";
import { TileStack, type HandState, type StackFrame } from "../containers/tile-stack";

/** A replay of an attack (the defence log's): the moves stepped through instead of a hand. */
export interface PvpReplay {
  /** Who attacked. */
  attacker: PvpPlayer;
  /** The moves shown, 0 (the start) to `total`. */
  move: number;
  total: number;
  playing: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  /** One move back (-1) or on (+1). */
  onStep?: (by: -1 | 1) => void;
}

export interface PvpAttackSceneProps {
  /** Whose village is attacked. */
  defender: PvpPlayer;
  /** The defender's village score: the stars are shares of it. */
  target: number;
  /** The defender's owned cells: the only cells a tile goes on. */
  territory: readonly PvpCell[];
  tiles: BoardTile[];
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** What the last move closed, shown as it arrives. */
  lastScored: ScoredStructure[];
  /** The defender's tiles left to draw, the one in hand included. */
  remaining: number;
  hand: {
    tile: { plan: number; orientation: number } | null;
    state: HandState;
    /** The tiles the attack knows after the one in hand, in draw order (#701): as the board scene's, read only. */
    coming?: readonly { plan: number }[];
    /** The chain draws the queue's last tile: its slot waits. */
    drawing?: boolean;
    slotChosen?: boolean;
    fitsNowhere?: boolean;
    /** The points the placed tile would score, over the HUD's score. */
    preview?: number | null;
    error?: string | null;
    errorDetail?: ErrorDetail;
  };
  /** The legal cells of the tile in hand, inside the territory. */
  slots?: { x: number; y: number; fits?: boolean }[];
  ghost?: BoardGhost | null;
  bubble?: BoardBubble | null;
  tileArt?: TileArt;
  /** The tiles' build-time renders (`useTileRenders`): the coming tiles draw their top-down ones without the 3D view. */
  tileRenders?: TileRenders;
  /** The defender's skins (plan key to theme): the stack's tiles in the theme the board draws them in. */
  skins?: TileSkins;
  /** The defender's tiles, the deck the attack draws from (chain plan ids): the stack's pile draws its tiles from them. */
  pilePlans?: readonly number[];
  renderHandTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** The stack's tiles drawn by the renderer in 3D (`StackView`), given by the page as the board scene's. */
  renderHandStack?: (view: StackFrame) => ReactNode;
  /** The 3D board, given by the page; the plan view without it. */
  canvas?: ReactNode;
  /** A replay: no hand, the replay's controls instead. */
  replay?: PvpReplay | null;
  onBack?: () => void;
  onSlotClick?: (slot: { x: number; y: number }) => void;
  onDiscard?: () => void;
}

/** The replay's controls: back a move, play or pause, on a move, and where it stands. */
function ReplayBar({ replay }: { replay: PvpReplay }) {
  return (
    <div role="group" aria-label="Replay" className="pointer-events-auto flex items-center gap-1 self-center rounded-xl border border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
      <Button variant="ghost" size="icon" aria-label="Previous move" disabled={replay.move <= 0} onClick={() => replay.onStep?.(-1)}>
        <Icon name="backward-step" />
      </Button>
      {replay.playing ? (
        <Button variant="ghost" size="icon" aria-label="Pause" onClick={replay.onPause}>
          <Icon name="pause" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Play" disabled={replay.move >= replay.total} onClick={replay.onPlay}>
          <Icon name="play" />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Next move" disabled={replay.move >= replay.total} onClick={() => replay.onStep?.(1)}>
        <Icon name="forward-step" />
      </Button>
      <span className="px-2 text-xs text-muted-foreground">
        Move{" "}
        <span className="numeric font-semibold text-foreground">
          {replay.move}/{replay.total}
        </span>
      </span>
    </div>
  );
}

/**
 * A PvP attack (#647): the defender's territory and the tiles placed on it, the tile in hand (one of the defender's, drawn at
 * random), the live score as a share of the village's with its three star marks, the tiles left on the stack. The board is
 * the game's (`BoardMap`, or the page's 3D canvas), the hand and its bubble too; no character, no ability (owner decision).
 * With `replay` the same board steps through a finished attack, the defence log's replay.
 */
export function PvpAttackScene(props: PvpAttackSceneProps) {
  const { defender, hand, replay } = props;
  const discardCost = Math.min(props.score, DISCARD_POINTS);
  const title = replay ? `Replay: ${replay.attacker.name ?? "an attacker"}` : `Attack: ${defender.name ?? "a village"}`;
  return (
    // No `overflow-hidden` here: every layer is placed inside the screen and the board clips itself; a clip on the root would
    // cut the HUD score's screen-reader text, which sits at the right edge (WRAP360).
    <div className="relative h-dvh min-h-[32rem] bg-board text-foreground">
      {props.canvas ?? (
        <BoardMap
          tiles={props.tiles}
          territory={props.territory}
          fit
          slots={replay ? undefined : props.slots}
          ghost={replay ? null : props.ghost}
          onSlotClick={props.onSlotClick}
          highlight={!replay}
          className="pt-36 pb-28 tablet:pt-40"
        />
      )}

      <div data-bubble-avoid className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <GameHud
          title={title}
          score={props.score}
          delta={props.delta}
          preview={hand.slotChosen ? hand.preview : null}
          now={0}
          onBack={props.onBack}
          className="pointer-events-auto w-full max-w-2xl"
        />
        <div className="w-full max-w-2xl rounded-xl border border-border bg-card/90 px-3 pt-1 pb-2 shadow-lg backdrop-blur">
          <StarMeter score={props.score} target={props.target} />
        </div>
        <ClosingFeed closings={props.lastScored} className="mt-1" />
      </div>

      <div className="pointer-events-none absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col items-end gap-2 tablet:right-4 tablet:bottom-4">
        {replay ? (
          <ReplayBar replay={replay} />
        ) : (
          <>
            {!props.canvas && props.bubble && (
              <Suspense fallback={null}>
                <LazyTileBubble
                  rotations={props.bubble.rotations}
                  onRotate={props.bubble.onRotate}
                  onClose={props.bubble.onClose}
                  onDiscard={props.bubble.onDiscard}
                  discardCost={discardCost}
                  onConfirm={props.bubble.onConfirm}
                  canConfirm={props.bubble.canConfirm}
                  busy={props.bubble.busy}
                  orientation={props.bubble.orientation}
                  className="self-center"
                />
              </Suspense>
            )}
            <TileStack
              tile={hand.tile}
              state={hand.state}
              remaining={props.remaining}
              coming={hand.coming}
              drawing={hand.drawing}
              cellChosen={hand.slotChosen}
              fitsNowhere={hand.fitsNowhere}
              error={hand.error}
              errorDetail={hand.errorDetail}
              tileArt={props.tileArt}
              renders={props.tileRenders}
              skins={props.skins}
              renderTile={props.renderHandTile}
              renderStack={props.renderHandStack}
              pilePlans={props.pilePlans}
              onDiscard={() => props.onDiscard?.()}
              discardCost={discardCost}
            />
          </>
        )}
      </div>
    </div>
  );
}
