import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import type { RendererSettingsInput, TileSkins } from "@paved/renderer";
import { BoardViewport } from "./board-viewport";
import type { VillageBoardProps } from "./village-board";
import { buyableCells, cellKey, type Cell } from "./village-rules";

/** The village's first cell on the contracts' board: a village's cells are counted from it (x east, y north). */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

export interface VillageViewportProps extends Pick<VillageBoardProps, "village" | "parcels" | "placing" | "onParcel" | "onPlace" | "onCopy" | "className"> {
  /** The renderer's settings (the board's, `useBoardSettings`): the fog shows with `fog` on. */
  settings?: RendererSettingsInput;
  basePath?: string;
  skins?: TileSkins;
  /** The renderer could not start: the page falls back to the plan (`VillageBoard`). */
  onError?: (error: unknown) => void;
}

/**
 * The village in 3D (FOG-EVERYWHERE, #648): the placed tiles on the real renderer's board, the fog of war over everything but
 * the owned cells and the cells next to them (`fogOwned`), the landscape beyond. Its plates are the village's own: the legal
 * cells of the reward's tile being placed, else the parcels that can be bought. A tap does what the plan's buttons do (place,
 * add a copy to a ringed tile of the plan, choose a parcel). The plan view (`VillageBoard`) stays the fallback without WebGL;
 * a drag from the reward's sheet needs it (the canvas has no cells under the pointer), a tap on a tile then on a cell works here.
 */
export function VillageViewport({ village, parcels = false, placing, settings, basePath, skins, onParcel, onPlace, onCopy, onError, className }: VillageViewportProps) {
  const tiles = useMemo<BoardTile[]>(() => village.tiles.map((t) => ({ ...t, ...toChain(t) })), [village.tiles]);
  const owned = useMemo(() => village.cells.map(toChain), [village.cells]);
  const buyable = useMemo(() => (parcels && !placing ? buyableCells(village.cells) : []), [parcels, placing, village.cells]);
  const slots = useMemo(() => {
    if (placing) return placing.legal.map((c) => ({ ...toChain(c), fits: c.orientations.includes(placing.orientation) }));
    return buyable.length ? buyable.map(toChain) : undefined;
  }, [placing, buyable]);
  const onCellClick = (chain: Cell) => {
    const cell = fromChain(chain);
    const key = cellKey(cell);
    if (placing) {
      if (placing.legal.some((c) => cellKey(c) === key)) return onPlace?.(cell);
      const tile = village.tiles.find((t) => cellKey(t) === key && placing.copies.includes(t.id));
      if (tile) onCopy?.(tile);
      return;
    }
    if (buyable.some((c) => cellKey(c) === key)) onParcel?.(cell);
  };
  return (
    <div className={className} style={{ position: "relative" }}>
      <BoardViewport
        tiles={tiles}
        basePath={basePath}
        skins={skins}
        settings={settings}
        slots={slots}
        otherPlates={false}
        tilePreview={false}
        fogOwned={owned}
        onCellClick={onCellClick}
        onError={onError}
      />
    </div>
  );
}
