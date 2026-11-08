import type { PvpCell, PvpPlayer } from "../../lib/pvp-rules";
import { attackMeter } from "../../lib/score-meter";
import { cn } from "../../lib/utils";
import { Arrow } from "../elements/arrow";
import { HudFrame } from "../elements/hud-frame";
import { UiIcon } from "../elements/ui-icon";
import type { AttackDeckSheet } from "../../lib/attack-deck-sheet";
import { BoardScene, type BoardSceneProps } from "./board-scene";

/** A replay of an attack (a v1 match card's, or a match's build, #786): the moves stepped through instead of a hand. */
export interface PvpReplay {
  /** Who attacked. */
  attacker: PvpPlayer;
  /** The moves shown, 0 (the start) to `total`. */
  move: number;
  total: number;
  playing: boolean;
  /** Plays on from the move shown; at the end, from the start (a match's build opens whole, #786). */
  onPlay?: () => void;
  onPause?: () => void;
  /** One move back (-1) or on (+1). */
  onStep?: (by: -1 | 1) => void;
  /** To a move of the timeline (a match's, MATCH-PAGE): 0 the start to `total`. */
  onSeek?: (move: number) => void;
}

/** What the attack takes of the board scene: all of it but what the attack sets itself (the mode, the title, the clock) or has not (a Challenge's expiry and reward, a Story level's deck and coach, Surrender and Restart). */
export type AttackBoardProps = Omit<
  BoardSceneProps,
  "mode" | "title" | "now" | "attack" | "readOnly" | "gameId" | "deckOrder" | "onPresentDeck" | "coach" | "expiresAt" | "reward" | "discardedPlans" | "storageDisabled" | "onSurrender" | "onRestart" | "promptSurrender"
>;

export interface PvpAttackSceneProps extends AttackBoardProps {
  /** Whose village is attacked. */
  defender: PvpPlayer;
  /** The defender's village score: the stars are shares of it. */
  target: number;
  /**
   * The defender's owned cells, the only cells a tile goes on (v1, #647). Left out on PvP v2's unbounded board (#740): the
   * attack builds anywhere from the starter, and no territory is drawn.
   */
  territory?: readonly PvpCell[] | null;
  /** The star marks in whole percent of the target: v1's 70 / 85 / 110 % when left out, v2's 80 / 90 / 100 % (#740). */
  starPercents?: readonly number[];
  /** PvP v2's deck (#789, `attackDeckSheet`): the stack opens the deck sheet on it. None in v1. */
  deck?: AttackDeckSheet | null;
  /** A replay: no hand, the replay's controls instead, the board read only. */
  replay?: PvpReplay | null;
}

/** A replay's control: the HUD drawer's 44 px round target and its white states. */
const CONTROL = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none disabled:pointer-events-none disabled:opacity-40";

/**
 * The replay's controls (GAME-OVERLAY: on the HUD's frame): back a move and on a move with the thin arrows (the League's), play or pause
 * painted, and where it stands, outlined.
 */
export function ReplayBar({ replay }: { replay: PvpReplay }) {
  return (
    <div role="group" aria-label="Replay" className="pointer-events-auto relative isolate flex items-center gap-0.5 py-1 pr-3 pl-1">
      <HudFrame px={13} />
      <button type="button" className={cn(CONTROL, "text-muted-foreground hover:text-foreground")} aria-label="Previous move" disabled={replay.move <= 0} onClick={() => replay.onStep?.(-1)}>
        <Arrow to="left" />
      </button>
      {replay.playing ? (
        <button type="button" className={CONTROL} aria-label="Pause" onClick={replay.onPause}>
          <UiIcon name="pause" px={32} className="drawer-icon size-8" />
        </button>
      ) : (
        <button type="button" className={CONTROL} aria-label={replay.move >= replay.total ? "Play from the start" : "Play"} disabled={replay.total === 0} onClick={replay.onPlay}>
          <UiIcon name="play" px={32} className="drawer-icon size-8" />
        </button>
      )}
      <button type="button" className={cn(CONTROL, "text-muted-foreground hover:text-foreground")} aria-label="Next move" disabled={replay.move >= replay.total} onClick={() => replay.onStep?.(1)}>
        <Arrow to="right" />
      </button>
      <span className="text-outline px-1 text-sm font-bold">
        Move{" "}
        <span className="numeric">
          {replay.move}/{replay.total}
        </span>
      </span>
    </div>
  );
}

/**
 * A PvP attack (#647): the defender's village and the tiles placed on it, the tile in hand, the live score as a share of the
 * village's with its three star marks, the tiles left on the stack. Since #772 it is `BoardScene`'s attack mode: the same
 * board, stack, bubble, HUD, closing feed, season dial and sounds as a Training game, the attack's own pieces in its slots (the
 * replay's bar in place of the stack); its score meter is the Ranked's (`attackMeter`), under the HUD as every mode's. With
 * `replay` the same board steps through a finished attack, read only, the defence log's replay.
 *
 * PvP v2 (#740) is the same scene with no `territory` (an unbounded board from the starter), its marks at 80 / 90 / 100 %
 * (`starPercents`), the stack's next two tiles (`hand.coming`) and the attack's deck as the tiles left; the stack opens the
 * attack's deck sheet (`deck`, #789).
 */
export function PvpAttackScene({ defender, target, territory, starPercents, deck, replay, ...board }: PvpAttackSceneProps) {
  const title = replay ? `Replay: ${replay.attacker.name ?? "an attacker"}` : `Attack: ${defender.name ?? "a village"}`;
  return (
    <BoardScene
      {...board}
      mode="attack"
      title={title}
      now={0}
      readOnly={replay != null}
      meter={attackMeter(board.score, target, starPercents)}
      attack={{
        replay: replay ? <ReplayBar replay={replay} /> : null,
        territory: territory ?? undefined,
        deck: deck ?? undefined,
      }}
    />
  );
}
