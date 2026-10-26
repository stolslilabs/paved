import { useMemo, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { CENTER } from "@paved/game-core";
import { useScoutCanvas } from "./attack-board";

/**
 * A visit to another player's village (`/village/:player`, #772 open point 5): its layout on the board module's 3D board, read
 * only, in a rival's red void, as the scout draws it. Its own chunk, loaded on a visit only, so the own village does not carry
 * the module. `plan` (the scene's `LayoutBoard`) where the 3D board cannot draw: no WebGL, or the renderer failed.
 */
export default function VillageVisitBoard({ player, tiles, plan }: { player: string; tiles: readonly BoardTile[]; plan: ReactNode }) {
  // The layout's cells count from the starter at 0, 0; the board's from the contracts' centre.
  const board = useMemo(() => tiles.map((t) => ({ ...t, x: CENTER + t.x, y: CENTER + t.y })), [tiles]);
  return <>{useScoutCanvas(player, board) ?? plan}</>;
}
