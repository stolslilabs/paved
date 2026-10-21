import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import type { GameScene, RendererSettingsInput, TileSkins } from "@paved/renderer";
import { BoardViewport, toChainSlot, type BoardGhost } from "./board-viewport";
import { registerCellPicker } from "./cell-picker";
import type { VillageBoardProps } from "./village-board";
import { buyableCells, cellKey, type Cell } from "./village-rules";

/** The village's first cell on the contracts' board: a village's cells are counted from it (x east, y north). */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

export interface VillageViewportProps extends Pick<VillageBoardProps, "village" | "parcels" | "placing" | "over" | "onParcel" | "onPlace" | "onCopy" | "className"> {
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
 * add a copy to a ringed tile of the plan, choose a parcel). A drag from the reward's sheet finds its cell through the board's
 * picker (`registerCellPicker`, the renderer's `gridAt`): over a legal cell the tile shows there, and a drop places it, or adds a
 * copy on a ringed tile. The plan view (`VillageBoard`) stays the fallback without WebGL.
 */
export function VillageViewport({ village, parcels = false, placing, over, settings, basePath, skins, onParcel, onPlace, onCopy, onError, className }: VillageViewportProps) {
  const tiles = useMemo<BoardTile[]>(() => village.tiles.map((t) => ({ ...t, ...toChain(t) })), [village.tiles]);
  const owned = useMemo(() => village.cells.map(toChain), [village.cells]);
  const buyable = useMemo(() => (parcels && !placing ? buyableCells(village.cells) : []), [parcels, placing, village.cells]);
  const slots = useMemo(() => {
    if (placing) return placing.legal.map((c) => ({ ...toChain(c), fits: c.orientations.includes(placing.orientation) }));
    return buyable.length ? buyable.map(toChain) : undefined;
  }, [placing, buyable]);
  // A drop names its cell through the board's picker: the renderer's cell under the point, and what a drop does there.
  const [scene, setScene] = useState<GameScene | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const kindAt = useRef<(cell: Cell) => string>(() => "");
  kindAt.current = (cell) => {
    const key = cellKey(cell);
    if (!placing) return "";
    if (placing.legal.some((c) => cellKey(c) === key)) return "legal";
    return village.tiles.some((t) => cellKey(t) === key && placing.copies.includes(t.id)) ? "copy" : "";
  };
  useEffect(() => {
    const el = root.current;
    if (!el || !scene) return;
    return registerCellPicker(el, (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      const at = scene.gridAt({ x: clientX - rect.left, y: clientY - rect.top });
      if (!at) return null;
      const cell = fromChain(toChainSlot(at.x, at.y));
      return { ...cell, kind: kindAt.current(cell) };
    });
  }, [scene]);
  // Over a legal cell, the tile being dragged shows there, in a rotation that fits.
  const spot = placing && over ? placing.legal.find((c) => cellKey(c) === cellKey(over)) : undefined;
  const ghost = useMemo<BoardGhost | null>(
    () =>
      placing && spot
        ? { ...toChain(spot), plan: placing.plan, orientation: spot.orientations.includes(placing.orientation) ? placing.orientation : spot.orientations[0]!, fits: true }
        : null,
    [placing, spot],
  );
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
    <div ref={root} className={className} style={{ position: "relative" }}>
      <BoardViewport
        tiles={tiles}
        basePath={basePath}
        skins={skins}
        settings={settings}
        slots={slots}
        otherPlates={false}
        ghost={ghost}
        fogOwned={owned}
        onScene={setScene}
        onCellClick={onCellClick}
        onError={onError}
      />
    </div>
  );
}
