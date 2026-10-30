import { Suspense, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { BoardTile } from "@paved/chain";
import { GameCanvas } from "@paved/renderer/react";
import { boardReveal } from "@paved/renderer";
import type { CameraMode, ClosedStructure, FogCell, GameScene, HoverState, RendererSettingsInput, TilePressListener, TileRenderData, TileSkins } from "@paved/renderer";
import { boardPlates, confirmHoldMs } from "../../data/placement";
import { cn } from "../../lib/utils";
import type { Hold } from "../../lib/use-hold";
import { PRESS_SHOW_MS, usePressAction } from "../../lib/use-press-action";
import { BoardCovered } from "./board-covered";
import { LazyPressBubble, LazyTileBubble, loadPressBubble } from "./lazy-tile-bubble";

export { PRESS_SHOW_MS };

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

/**
 * A renderer grid slot (x east, y south of the starter: the cell `onTileClick` names) as the contracts' absolute x and
 * y (y north). The move a page sends is built from this, so it is the slot the player sees (D1, #379).
 */
export function toChainSlot(gridX: number, gridY: number): { x: number; y: number } {
  return { x: gridX + CENTER, y: CENTER - gridY };
}

/** The contracts' x and y as the renderer's grid slot: the inverse of `toChainSlot`, and where `toRenderTiles` draws a tile. */
export function toGridSlot(x: number, y: number): { x: number; y: number } {
  return { x: x - CENTER, y: CENTER - y };
}

/** The session's tiles as the renderer draws them (world x east, world z south), as the removed legacy client's `toRenderBoard` drew them. */
export function toRenderTiles(tiles: BoardTile[], gameId: number): TileRenderData[] {
  return tiles.map((t) => {
    const grid = toGridSlot(t.x, t.y);
    return {
      game_id: gameId,
      id: t.id,
      player_id: "0x0",
      plan: t.plan,
      orientation: t.orientation,
      x: t.x,
      y: t.y,
      worldX: grid.x,
      worldZ: grid.y,
      ...(t.pending ? { pending: true } : {}),
    };
  });
}

/** The tile in hand drawn where it would go (the ghost), in the contracts' coordinates. */
export interface BoardGhost {
  x: number;
  y: number;
  plan: number;
  orientation: number;
  /** Placed on its slot, not yet sent (SLOTS): its tint turns yellow. Unset: a hover preview, blue at half opacity. */
  placed?: boolean;
  /** Its rotation fits the slot. False: red, and Confirm is disabled. Unset: it fits. */
  fits?: boolean;
}

export interface BoardViewportProps {
  tiles: BoardTile[];
  /**
   * Every structure closed so far, in closing order, as its areas on its tiles (`PageState.closed`, #722): one that closes
   * while the board is shown pulses bright yellow as its line appears in the closing feed, then shines for the rest of the
   * game; those already closed when the board opens (a reload, a resumed game) shine at once. Unset: none.
   */
  closed?: ReadonlyArray<ReadonlyArray<{ tileId: number; areas: number }>>;
  /** The game's id: with each tile's x and y, it picks the tile's skin variant (the same for every viewer and reload). */
  gameId?: number;
  /**
   * The theme of each plan (`useBoardSkins`: the active skins of the player whose board this is): skinned plans draw a
   * variant per tile, the others their base models. Unset: every tile on its base model.
   */
  skins?: TileSkins;
  /**
   * Where the renderer finds `manifest.json`, which lists its hashed models and tile images (`models/<plan>.glb` and
   * `assets/tiles/<plan>.png` without one, as in Storybook, which maps `asset-sources/`).
   */
  basePath?: string;
  /**
   * The legal slots of the tile in hand in any rotation (the contracts' coordinates): one playable plate each (`fits`, whether
   * the current rotation fits there, is the caller's, for its buttons). Every other free
   * cell next to a tile gets an invalid plate (`boardPlates`). Unset: no tile in hand, no plate; an empty list: a tile that
   * fits nowhere, invalid plates all around.
   */
  slots?: { x: number; y: number; fits?: boolean }[];
  ghost?: BoardGhost | null;
  /**
   * A move the session just accepted (`useConfirmFlash`): the tile drops voxel by voxel, then a green tint on it fades out
   * (`useDropThenConfirm`). A new `key` plays again.
   */
  confirmed?: (BoardGhost & { key: number }) | null;
  /**
   * The renderer's settings (`RendererSettingsInput`: the graphics quality). Keep the object between renders while the
   * settings do not change; a new one is applied to the open board at once (`GameScene.setSettings`), no reload.
   */
  settings?: RendererSettingsInput;
  /** Draw the hover preview (the tile under the pointer before it is placed). Default true; off: only a placed tile shows. */
  tilePreview?: boolean;
  /** Draw the plates. Default true; off: no plate is drawn. */
  placementHighlight?: boolean;
  /**
   * Every other free cell next to a tile gets an invalid plate (`boardPlates`). Default true; off: only `slots` get plates (a
   * village, whose plates are its own cells and parcels).
   */
  otherPlates?: boolean;
  /** A cell was clicked or tapped (the contracts' coordinates); the page decides whether it is a slot. */
  onCellClick?: (slot: { x: number; y: number }) => void;
  /**
   * A long press on a free legal cell (one of `slots`) shows the tile there, then holds Validate as a press on the shown tile
   * does: one press places and confirms (PRESS-PLACE, #680). Pass what a click does (the page's `choose`). Unset: a press is
   * a tap or a pan, as before (a village).
   */
  onCellPress?: (slot: { x: number; y: number }) => void;
  /** The pointer is over a cell, or (null) left the board. */
  onCellHover?: (slot: { x: number; y: number } | null) => void;
  /** The tile placed and not yet sent: the bubble (Cancel, Discard, Rotate, Validate) follows its corner. Unset: none. */
  bubble?: BoardBubble | null;
  /**
   * A long press on a tile opens this action (LONGPRESS-EDIT, #799: the village's Edit in view), through a one-button bubble by
   * the tile whose ring fills as the press goes on (`usePressAction`). Unset, or a tile bubble up: a press is a tap or a pan.
   */
  press?: BoardPress | null;
  /**
   * The camera's mode (`GameScene.setCameraMode`): `play` (the default, every game board's: the tilt and the turn locked) or
   * `free`, the home's Camera mode (#875: the tilt between 15 and 85 degrees, the turn free; back to `play`, it eases home).
   */
  cameraMode?: CameraMode;
  /** The scene is up (or gone, null): the season wheel reads the cycle from it. */
  onScene?: (scene: GameScene | null) => void;
  /** The renderer could not start (no WebGL, a model that does not load). */
  onError?: (error: unknown) => void;
  className?: string;
}

/** The action a long press on a tile opens (#799): its button's name and icon, and the action. */
export interface BoardPress {
  label: string;
  icon: string;
  onAct: () => void;
  /** The hold's length, ms (`HOLD_MS` by default; the stories tune it). */
  holdMs?: number;
}

/** The bubble on the placed tile (`TileBubble`): `cell` is the tile's, in the contracts' coordinates. */
export interface BoardBubble {
  cell: { x: number; y: number };
  rotations: number;
  onRotate: () => void;
  onClose: () => void;
  /** The end of the hold on Discard (#606): the tile in hand is discarded, wherever it stands. */
  onDiscard?: () => void;
  /** What a discard costs now (at most the score): its label says it. */
  discardCost?: number;
  /** The village editor's Back to the inventory (#756), in Discard's place. */
  onReturn?: () => void;
  /** The Cancel button shows (the default); off, Escape alone cancels (`TileBubble`). */
  cancelButton?: boolean;
  /** The end of the hold on Validate: the page sends the move (#568). Unset: no Validate (the village editor, #756). */
  onConfirm?: () => void;
  /** Validate is enabled: the rotation fits and the points are known. */
  canConfirm?: boolean;
  /** The move is on its way: Validate's spinner. */
  busy?: boolean;
  /** A Story coach mark points at the placement (Validate is ringed) or at Discard (the trash is). */
  coach?: boolean | "place" | "discard";
  /** The tile's rotation now: a change drops a hold on Validate under way. */
  orientation?: number;
}

/**
 * The confirm on the 3D board (PLACE-POLISH, #568): when the session accepts a move (a new `confirmed.key`), the landed tile
 * drops voxel by voxel (`GameScene.dropTile`), then the green tint fades on it, for the time `useConfirmFlash` holds it
 * after the drop. A skipped or failed drop (reduced motion, the model not in, its chunk not downloaded) goes straight to the
 * green; a tile gone when the drop ends (a refusal rolled the board back, which cuts the drop) gets no green. Nothing plays at the first frame or a reload:
 * only a key that changes while the board is up. The next tile is never held: the drop plays on while the player places it,
 * and a newer confirm's green wins over an older drop's.
 */
export function useDropThenConfirm(scene: GameScene | null, tiles: TileRenderData[], confirmed: (HoverState & { key: number }) | null | undefined, confirmMs?: number) {
  const [green, setGreen] = useState<(HoverState & { key: number }) | null>(null);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  // The key the board opened with is never played (a remount with a confirm still held).
  const seen = useRef(confirmed?.key ?? null);
  const latest = useRef(0);
  const holdMs = confirmHoldMs(confirmMs);
  useEffect(() => {
    if (!confirmed || confirmed.key === seen.current || !scene) return;
    seen.current = confirmed.key;
    const run = ++latest.current;
    const at = (t: TileRenderData) => t.worldX === confirmed.x && t.worldZ === confirmed.y;
    const tile = tilesRef.current.find(at);
    const toGreen = () => {
      if (run !== latest.current || !tilesRef.current.some(at)) return;
      setGreen(confirmed);
    };
    if (!tile) return toGreen();
    // The drop is optional: whatever becomes of it (skipped, cut short, failed), the move still gets its green.
    void scene
      .dropTile(tile)
      .then((drop) => (drop.status === "started" ? drop.finished : undefined))
      .catch(() => undefined)
      .then(toGreen);
  }, [confirmed, scene]);
  useEffect(() => {
    if (!green) return;
    const id = setTimeout(() => setGreen(null), holdMs);
    return () => clearTimeout(id);
  }, [green, holdMs]);
  return green;
}

/** Where a press may show the tile in hand (PRESS-PLACE, #680), in the renderer's grid. */
export interface PressPlace {
  /** The cell is a free legal one and nothing is on its way: a long press there shows the tile. */
  canShow(gridX: number, gridY: number): boolean;
  /** Shows the tile there, as a tap would (the page chooses the cell, in the rotation a tap picks). */
  show(gridX: number, gridY: number): void;
}

export interface TileHold {
  /** The renderer's press listener (`GameCanvas.onTilePress`). */
  onTilePress: TilePressListener;
  /** Validate's hold, as the bubble lends it while it is up (`TileBubble.holdRef`). */
  holdRef: RefObject<Hold | null>;
}

/**
 * The board's presses as a hold on the placed tile (TILE-HOLD, #630): a press down on `cell` (the bubble's, in the renderer's
 * grid) starts Validate's hold (the one the bubble lends to `holdRef`), so its ring fills as if Validate were held; the let go
 * releases it, a pan, a second finger or the pointer leaving cancels it (`PointerTap`). With Validate disabled or busy, it
 * holds nothing. A completed hold says it acted, so its let go does not also click the cell.
 *
 * Press and place (PRESS-PLACE, #680): a press on a cell `place` can show the tile on (a free legal one, the tile in hand
 * or shown elsewhere) shows it there once the press has lasted `showMs` without a pan, then starts the same hold as soon as
 * the bubble is up on it: one long press places and confirms. Let go or cancelled early, the tile stays shown, as after a
 * tap; a pan before `showMs` shows nothing; a press that showed the tile clicks nothing at its let go. Any other press is a
 * tap or a pan as before.
 */
export function useTileHold(cell: { x: number; y: number } | null, place?: PressPlace | null, showMs = PRESS_SHOW_MS): TileHold {
  // The hold the press under way started, kept to its end even if the bubble goes (the move was sent).
  const pressed = useRef<Hold | null>(null);
  // The press that may show the tile: its cell, its timer until the tile shows, `shown` after.
  const showing = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; shown: boolean } | null>(null);
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const placeRef = useRef(place);
  placeRef.current = place;
  // The bubble lending or taking back its hold renders the board again, so a press waiting for it (the bubble's chunk
  // still loading) starts it once it comes.
  const [, setLent] = useState(0);
  const [holdRef] = useState<RefObject<Hold | null>>(() => {
    let hold: Hold | null = null;
    return {
      get current() {
        return hold;
      },
      set current(next: Hold | null) {
        const changed = !hold !== !next;
        hold = next;
        if (changed) setLent((n) => n + 1);
      },
    };
  });
  const listener = useRef<TilePressListener>((gx, gy, phase) => {
    if (phase === "down") {
      const s = showing.current;
      if (s?.timer) clearTimeout(s.timer);
      showing.current = null;
      const at = cellRef.current;
      if (at && at.x === gx && at.y === gy) {
        const h = holdRef.current;
        pressed.current = h?.start() ? h : null;
        return;
      }
      pressed.current = null;
      if (!placeRef.current?.canShow(gx, gy)) return;
      const next = {
        x: gx,
        y: gy,
        shown: false,
        timer: setTimeout(() => {
          next.timer = null;
          next.shown = true;
          placeRef.current?.show(gx, gy);
          setLent((n) => n + 1);
        }, showMs) as ReturnType<typeof setTimeout> | null,
      };
      showing.current = next;
      return;
    }
    const s = showing.current;
    showing.current = null;
    if (s?.timer) clearTimeout(s.timer);
    const h = pressed.current;
    pressed.current = null;
    const acted = h?.completed() ?? false;
    if (h && phase === "released") h.release();
    else h?.cancel();
    if (phase === "released" && s?.shown) return true;
    if (!h) return;
    return phase === "released" && acted;
  });
  const onTilePress = listener.current;
  // The tile shown by the press under way: once the bubble is up on its cell with Validate enabled, its hold starts. This
  // runs after the bubble's own effects, so the hold is not dropped as the change of cell it follows.
  useEffect(() => {
    const s = showing.current;
    const at = cellRef.current;
    if (!s?.shown || pressed.current || !at || at.x !== s.x || at.y !== s.y) return;
    const h = holdRef.current;
    if (h?.start()) pressed.current = h;
  });
  useEffect(
    () => () => {
      const s = showing.current;
      if (s?.timer) clearTimeout(s.timer);
    },
    [],
  );
  return { onTilePress, holdRef };
}

/** A ghost as the renderer's hover: its grid cell, its state, and the cell its skin variant is picked for. */
function hoverOf(ghost: BoardGhost, gameId: number): HoverState {
  return {
    ...toGridSlot(ghost.x, ghost.y),
    valid: ghost.fits !== false,
    idle: true,
    placed: !!ghost.placed,
    planIndex: ghost.plan,
    orientation: ghost.orientation,
    cell: { x: ghost.x, y: ghost.y, gameId },
  };
}

/** The real renderer (`@paved/renderer`'s canvas) on a board: what the board scene puts under its overlays. */
/**
 * The fog of war's clear cells (FOG-EVERYWHERE, #648), in the renderer's grid: the board's tiles and their free slots, in every
 * mode (#739: the village's owned-cells variant left with the parcels); a cell new since the last reveal (the tile just
 * placed) is where the fog lifts from.
 */
export function useFogReveal(tiles: TileRenderData[]): { cells: FogCell[]; origin: FogCell[] } {
  const source: FogCell[] = tiles.map((t) => ({ x: t.worldX, y: t.worldZ }));
  const sourceKey = `tiles|${source.map((c) => `${c.x},${c.y}`).join(";")}`;
  // The cells of the reveal last shown (set once it is), to tell the new ones.
  const shown = useRef<string | null>(null);
  const reveal = useMemo(() => {
    const before = new Set(shown.current?.split("|")[1]?.split(";").filter(Boolean) ?? []);
    const origin = before.size ? source.filter((c) => !before.has(`${c.x},${c.y}`)) : [];
    return { cells: boardReveal(source), origin };
    // The reveal follows the cells, not each new array of the same ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  useEffect(() => {
    shown.current = sourceKey;
  }, [sourceKey]);
  return reveal;
}

/**
 * The closed structures as the renderer takes them (`GameScene.setClosedStructures`): each one's id is its areas (a structure
 * keeps them, and two structures never hold the same), so its clock survives a new state and a resync.
 */
export function toClosedStructures(closed: NonNullable<BoardViewportProps["closed"]>, gameId: number): ClosedStructure[] {
  return closed.map((areas) => ({
    id: areas.map((a) => `${a.tileId}:${a.areas}`).join(","),
    areas: areas.map((a) => ({ gameId, id: a.tileId, areas: a.areas })),
  }));
}

export function BoardViewport({ tiles, closed, gameId = 0, skins, basePath, slots, ghost, confirmed, settings, tilePreview = true, placementHighlight = true, bubble, press, otherPlates = true, cameraMode, onCellClick, onCellPress, onCellHover, onScene, onError, className }: BoardViewportProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  // A sheet or the score panel over the board: the ambient effects stop (`BoardCovered`).
  const covered = useContext(BoardCovered);
  useEffect(() => {
    onScene?.(scene);
    return () => onScene?.(null);
  }, [scene, onScene]);
  const renderTiles = useMemo(() => toRenderTiles(tiles, gameId), [tiles, gameId]);
  // A session gives a new list with each state: the renderer gets a new one only when a structure closes.
  const closedKey = JSON.stringify(closed ?? []);
  const closedStructures = useMemo(() => toClosedStructures(closed ?? [], gameId), [closedKey, gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const fogReveal = useFogReveal(renderTiles);
  // A plate on every free cell next to a tile: playable or invalid (`boardPlates`), in the renderer's grid.
  const gridSlots = useMemo(
    () =>
      placementHighlight
        ? boardPlates(otherPlates ? tiles : [], slots).map((p) => ({ ...toGridSlot(p.x, p.y), ...(p.state === "invalid" ? { legal: false } : {}) }))
        : [],
    [tiles, slots, placementHighlight, otherPlates],
  );
  // The ghost draws the variant the tile would have in the cell it hovers. The tile preview setting hides only the hover
  // preview: a placed tile is always drawn, with its tint (yellow, red: Confirm is disabled, the board says why).
  const hover = useMemo<HoverState | null>(() => (ghost && (tilePreview || ghost.placed) ? hoverOf(ghost, gameId) : null), [ghost, gameId, tilePreview]);
  const confirm = useMemo(() => (confirmed ? { ...hoverOf(confirmed, gameId), key: confirmed.key } : null), [confirmed, gameId]);
  const green = useDropThenConfirm(scene, renderTiles, confirm, settings?.placement?.motion?.confirmMs);
  // Validate's hold, lent by the bubble while it is up: holding the placed tile holds it too (#630); a long press on a free
  // legal cell shows the tile there first (#680), unless a move is on its way.
  const holdCell = bubble?.onConfirm ? toGridSlot(bubble.cell.x, bubble.cell.y) : null;
  const legal = useMemo(() => new Set((slots ?? []).map((s) => { const g = toGridSlot(s.x, s.y); return `${g.x},${g.y}`; })), [slots]);
  const pressPlace: PressPlace | null =
    onCellPress && !bubble?.busy ? { canShow: (gx, gy) => legal.has(`${gx},${gy}`), show: (gx, gy) => onCellPress(toChainSlot(gx, gy)) } : null;
  const { onTilePress: onHoldPress, holdRef: tileHold } = useTileHold(holdCell, pressPlace);
  // A long press on a tile into the page's action (#799), while no tile bubble is up; its bubble's chunk asked for beforehand.
  const pressing = !!press && !bubble;
  const pressAction = usePressAction<{ x: number; y: number }>({ onAct: () => press?.onAct(), enabled: pressing, holdMs: press?.holdMs });
  useEffect(() => {
    if (pressing) void loadPressBubble().catch(() => {});
  }, [pressing]);
  const tileCells = useMemo(() => new Set(renderTiles.map((t) => `${t.worldX},${t.worldZ}`)), [renderTiles]);
  const onTilePress: TilePressListener = (gx, gy, phase) => {
    let shown = false;
    if (phase === "down") {
      if (pressing && tileCells.has(`${gx},${gy}`)) pressAction.down({ x: gx, y: gy });
      else pressAction.dismiss();
    } else if (phase === "released") shown = pressAction.release();
    else pressAction.cancel();
    const held = onHoldPress(gx, gy, phase);
    return shown || held;
  };
  // The tile placed and not yet validated: the drop's chunk and its model's voxels load now, so the drop at the confirm
  // begins in the call (`GameScene.prepareDropAt`).
  const prepareKey = hover?.placed ? `${hover.planIndex}:${hover.cell?.x}:${hover.cell?.y}` : null;
  useEffect(() => {
    if (scene && hover?.placed) void scene.prepareDropAt(hover).catch(() => {});
  }, [scene, prepareKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // The canvas owns its pinch, pan and rotate (`touch-none`), and the browser's context menu stays off the board (APP-FEEL, P-69).
    // A long press on the tile holds it (#630): no text selection, loupe or iOS callout comes with it.
    <div className={cn("absolute inset-0 touch-none bg-board select-none [-webkit-touch-callout:none]", className)} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas
        tiles={renderTiles}
        closedStructures={closedStructures}
        basePath={basePath}
        skins={skins}
        settings={settings}
        cameraMode={cameraMode}
        covered={covered}
        fogReveal={fogReveal}
        availableSlots={gridSlots}
        hover={hover}
        confirmed={green}
        onReady={setScene}
        onError={onError}
        onTileClick={onCellClick && ((gx, gy) => onCellClick(toChainSlot(gx, gy)))}
        onTilePress={onTilePress}
        onTileHover={onCellHover && ((gx, gy) => onCellHover(toChainSlot(gx, gy)))}
        onHoverLeave={onCellHover && (() => onCellHover(null))}
      />
      {bubble && scene && (
        <Suspense fallback={null}>
          <LazyTileBubble
            scene={scene}
            cell={toGridSlot(bubble.cell.x, bubble.cell.y)}
            rotations={bubble.rotations}
            onRotate={bubble.onRotate}
            onClose={bubble.onClose}
            cancelButton={bubble.cancelButton}
            onDiscard={bubble.onDiscard}
            onReturn={bubble.onReturn}
            discardCost={bubble.discardCost}
            onConfirm={bubble.onConfirm}
            canConfirm={bubble.canConfirm}
            busy={bubble.busy}
            coach={bubble.coach}
            orientation={bubble.orientation}
            holdRef={tileHold}
          />
        </Suspense>
      )}
      {press && pressAction.shown && scene && (
        <Suspense fallback={null}>
          <LazyPressBubble
            scene={scene}
            cell={pressAction.shown.cell}
            label={press.label}
            icon={press.icon}
            hold={pressAction.hold}
            phase={pressAction.shown.phase}
            onTap={pressAction.act}
            onDismiss={pressAction.dismiss}
          />
        </Suspense>
      )}
    </div>
  );
}
