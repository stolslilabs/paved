import type { PvpCell, PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { StarMeter } from "../elements/star-meter";
import type { AttackDeckSheet } from "../../lib/attack-deck-sheet";
import { BoardScene, type BoardSceneProps } from "./board-scene";

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

/** What the attack takes of the board scene: all of it but what the attack sets itself (the mode, the title, the clock) or has not (a Challenge's expiry and reward, a Story level's deck and coach, Surrender and Restart). */
type AttackBoardProps = Omit<
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

/** The replay's controls: back a move, play or pause, on a move, and where it stands. */
function ReplayBar({ replay }: { replay: PvpReplay }) {
  return (
    <div role="group" aria-label="Replay" className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
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
 * A PvP attack (#647): the defender's village and the tiles placed on it, the tile in hand, the live score as a share of the
 * village's with its three star marks, the tiles left on the stack. Since #772 it is `BoardScene`'s attack mode: the same
 * board, stack, bubble, HUD, closing feed, season dial and sounds as a Training game, the attack's own pieces in its slots (the
 * star meter under the HUD, the replay's bar in place of the stack). With `replay` the same board steps through a finished
 * attack, read only, the defence log's replay.
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
      attack={{
        meter: (
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card/90 px-3 pt-1 pb-2 shadow-lg backdrop-blur">
            <StarMeter score={board.score} target={target} percents={starPercents} />
          </div>
        ),
        replay: replay ? <ReplayBar replay={replay} /> : null,
        territory: territory ?? undefined,
        deck: deck ?? undefined,
      }}
    />
  );
}
