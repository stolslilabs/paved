import { useCallback, useMemo } from "react";
import { CENTER, type AttackRun } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import { useBoardSkins } from "../data/board-skins";
import type { Slot } from "../data/placement";
import { READ_ONLY_PLACEMENT, useGameBoard } from "./game-board";

/** A board cell (the contracts' coordinates, as the board draws them) in the attack engine's, centred on the starter. */
export const fromBoard = (cell: Slot): Slot => ({ x: cell.x - CENTER, y: cell.y - CENTER });

/**
 * What an attack's placement reads (#772): the boards' `usePlacement` on the attack's rules. `AttackRun` keeps saying which
 * cells and rotations are legal for the tile in hand (`slots`, `orientations`), read once per tile and run, in the board's
 * coordinates; `empty` is a tile that fits nowhere. No run yet (the attack still read): nothing is legal.
 */
export function useAttackLegality(run: AttackRun | null, plan: number | null) {
  const legal = useMemo(() => {
    const cells = new Map<string, { cell: Slot; orientations: number[] }>();
    if (run === null || plan === null) return cells;
    for (const c of run.slots(plan)) cells.set(`${CENTER + c.x},${CENTER + c.y}`, { cell: { x: CENTER + c.x, y: CENTER + c.y }, orientations: run.orientations(plan, c) });
    return cells;
  }, [run, plan]);
  const slotsAt = useCallback((orientation: number) => [...legal.values()].filter((l) => l.orientations.includes(orientation)).map((l) => l.cell), [legal]);
  const orientationsAt = useCallback((cell: Slot) => legal.get(`${cell.x},${cell.y}`)?.orientations ?? [], [legal]);
  return { slotsAt, orientationsAt, empty: legal.size === 0 };
}

/**
 * The scout's board (#772): the rival's village on the 3D board of every game, read only, in the defender's skins and the
 * rival's red void; undefined where the plan view draws it (no WebGL, the renderer failed).
 */
export function useScoutCanvas(defender: string | null, tiles: BoardTile[]) {
  const skins = useBoardSkins(defender);
  const { scene } = useGameBoard({ skins, side: "rival", resetKey: defender, placement: READ_ONLY_PLACEMENT });
  return scene({ tiles, bubble: null }).canvas;
}
