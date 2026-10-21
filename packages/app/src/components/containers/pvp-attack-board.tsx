import type { PvpCell } from "../../lib/pvp-rules";
import { BoardViewport, type BoardViewportProps } from "./board-viewport";

export interface PvpAttackBoardProps extends Omit<BoardViewportProps, "fogOwned"> {
  /** The defender's owned cells (the contracts' coordinates): they and the cells next to them stay clear of the fog. */
  territory: readonly PvpCell[];
}

/**
 * The attack's 3D board (FOG-EVERYWHERE, #648), the canvas `PvpAttackScene` takes from the page: the real renderer on the
 * defender's village, the fog of war over everything but the territory and the cells next to it (`fogOwned`), as the village
 * draws it. The rest is the game's board (`BoardViewport`): the plates, the ghost, the bubble, the drop.
 */
export function PvpAttackBoard({ territory, ...board }: PvpAttackBoardProps) {
  return <BoardViewport {...board} fogOwned={territory} />;
}
