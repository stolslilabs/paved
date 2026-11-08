import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useReducedMotionConfig } from "motion/react";
import type { BoardTile } from "@paved/chain";
import type { LayoutBreakdown } from "@paved/game-core";
import type { FrameInsets } from "@paved/renderer";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { type TileArt } from "../elements/tile-chip";
import type { UiIconName } from "../elements/ui-art";
import { VillageFog, type VillageArrival } from "../elements/village-fog";
import { Button } from "../ui/button";
import { LayoutBoard, type LayoutBoardView } from "./layout-board";
import { EditBar, useDocked, type EditBarUse } from "./edit-bar";
import { LeaveEditDialog, useLayoutEditor, type LayoutEditorOptions, type LayoutSaved } from "./layout-editor";
import { layoutPoints, sameLayout, type Inventory, type Spot, type VillageLayout } from "./layout-rules";
import { LayoutSlotsStrip, SlotDialog, type LayoutSlotsProps } from "./layout-slots-strip";
import { LazyTileBubble } from "./lazy-tile-bubble";

/**
 * Edit mode's panel and its points (EDIT-VILLAGE), their own chunk, loaded as edit mode opens: the stage's chunk, which the home names in
 * its first load, stays as it was.
 */
const loadEditPanel = () => import("./edit-panel");
const LazyEditPanel = lazy(() => loadEditPanel().then((m) => ({ default: m.EditPanel })));
const LazyEditPoints = lazy(() => loadEditPanel().then((m) => ({ default: m.EditPoints })));

/** The home's left column takes its edge hint from this chunk, which carries it already (HOME-OVERLAYS, #856). */
export { scrollHintRef } from "../../lib/scroll-hint";
/** The home's Camera button (#875) comes with this chunk, which draws the 3D village it frees. */
export { CameraControl } from "./camera-control";

export interface VillageStageProps extends Pick<LayoutEditorOptions, "randomizer" | "randomSeed" | "slowRollMs" | "initialRolling"> {
  /** The village shown; undefined: not read yet (a placeholder sky). */
  village?: VillageLayout;
  /** The player's own village, founded: the editor can open. */
  editable: boolean;
  /** The editor open (the page's URL); a change asks `onEditingChange`. */
  editing: boolean;
  onEditingChange?: (editing: boolean) => void;
  /**
   * In view, a long press on a tile opens edit mode by this path, the Edit button's (#799): the press's bubble, Edit and its
   * ring, by the tile. Unset (a visit, a guest's or a read-only village): a press does nothing.
   */
  onEdit?: () => void;
  inventory?: Inventory;
  saving?: boolean;
  saved?: LayoutSaved | null;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  holdMs?: number;
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  /** Where the stories start: a line lit (the points at the top left are always shown since EDIT-VILLAGE; `initialPointsOpen` is kept for the mocks). */
  initialPointsOpen?: boolean;
  initialLit?: string | null;
  /**
   * The village in 3D, drawn from the editor's state; without it, the plan view. `onDrawn` is its ready signal: called once its
   * first frame is drawn with every tile's model and every tile image in (`VillageLayoutCanvas`'s `onReady`).
   */
  renderCanvas?: (view: LayoutBoardView, onDrawn: () => void) => ReactNode;
  /** The home's Camera mode (#875): in view, the 3D village's camera turns and tilts free. */
  camera?: boolean;
  /**
   * The stage draws the 3D village (true) or not (false: the plan view, or no village read yet), told as it mounts and on each
   * change: the Camera mode's button.
   */
  onCanvasChange?: (canvas: boolean) => void;
  /**
   * How the 3D village arrives (#761): under a fog that clears once the canvas says it is drawn, or a short fade. Unset, or
   * the plan view: neither.
   */
  arrival?: VillageArrival;
  /**
   * Save the draft, with the score the engine gives it, into `slot`: the saved layouts' active slot as the editor shows it (#804),
   * unset without them (the village's one layout).
   */
  onSave?: (tiles: readonly BoardTile[], score: number, slot?: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
  /** The saved layouts (#804): the panel's carousel above the inventory, Use in the editor's bar. Unset (not served): neither. */
  layoutSlots?: LayoutSlotsProps;
}

/**
 * The home's village (#753): the scene's box (the 3D canvas, else the plan view) and, in edit mode, the editor's overlays (#739), after
 * the Paved UX Book's "Edit my village" (EDIT-VILLAGE): its bar (`EditBar`, Save and its layouts' picker, #804), the points at the top
 * left (`EditPoints`), the inventory over the village (`EditPanel`: a phone's bottom sheet, a side menu from `tablet`) and the leave
 * dialog. The actions on the tile in hand (TILE-ACTIONS: Cancel, Back to the inventory, Rotate) stand out of its sides on the 3D
 * scene, clear of the bar and the panel, the camera framing the village in the room they leave; the plan view stands them still in a
 * row over the panel (#756). The view's overlays are the scene's, painted before this chunk (the editor, the
 * board, the engine) arrives.
 */
const NONE: VillageLayout = { owner: "", level: 1, tiles: [], score: 0 };
/** The points in view: none computed, nothing lit (the structure lines are edit mode's, #831). */
const NO_POINTS: LayoutBreakdown = { lines: [], other: 0, score: 0 };

/** The long press's Edit village (#799; PRESS-BUILD): the white hammer on the blue disc, one of the tile actions' painted set. */
const EDIT_ART: UiIconName = "tile-edit";


const NO_LAYOUTS: readonly (readonly BoardTile[])[] = [];

/** The room kept over the village under edit mode's bar for the tile's bubble (its height and tail), CSS px; from `desktop`, larger. */
const BUBBLE_ROOM_PX = 116;
const BUBBLE_ROOM_DESKTOP_PX = 132;
/** The gap kept between the village and the HUD's sides and the panel, CSS px. */
const FRAME_GAP_PX = 8;

/** The plan view's still bubble over the panel (`EditPanel`'s `above`: 44 px buttons, its padding and its 12 px gap), CSS px. */
const STILL_BUBBLE_PX = 64;

/**
 * What edit mode's overlays cover of the scene's box, CSS px from its edges: the floating bar at the top (0 docked in the side menu's
 * head), a phone's sheet at the foot, the side menu at the right, the points' column at the top left (`points`: its right edge);
 * `wide`: from `desktop`.
 */
interface EditCover {
  top: number;
  bottom: number;
  right: number;
  points: number;
  wide: boolean;
}

/** The 3D village's frame in the room the overlays leave (EDIT-VILLAGE): under the bar the room for the tile's bubble, a gap elsewhere. */
function frameOf(cover: EditCover | null): FrameInsets | null {
  if (!cover) return null;
  return {
    top: cover.top + (cover.wide ? BUBBLE_ROOM_DESKTOP_PX : BUBBLE_ROOM_PX),
    bottom: cover.bottom + FRAME_GAP_PX,
    left: FRAME_GAP_PX,
    right: cover.right + FRAME_GAP_PX,
  };
}

/**
 * What edit mode's bar and panel cover of the scene (EDIT-VILLAGE): from the box's top to under the bar, and from the panel's edge to
 * the box's (a phone's drawer at the foot, the side menu at the right), measured as they draw (the drawer folds and opens, a refusal
 * grows the panel), told once they settle; null in view. The 3D village frames its camera in the rest (`frameOf`); the plan view, which
 * has no camera, is confined to it (#1033), so no tile sits under them.
 */
function useEditCover(box: RefObject<HTMLDivElement | null>, editing: boolean): EditCover | null {
  const [cover, setCover] = useState<EditCover | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!editing || !el || typeof ResizeObserver === "undefined") return setCover(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const bar = el.querySelector("[data-edit-bar] header")?.getBoundingClientRect();
      const panel = el.querySelector("[data-edit-panel] > div")?.getBoundingClientRect();
      if (!bar || !panel || !(b.height > 0)) return;
      // The panel a side menu at the right (from `tablet`), not a phone's sheet; the bar docked in its head: nothing over the village
      // but the room for the tile's actions. Read from their marks, not their places (a tablet's menu is half the screen, to the pixel).
      const aside = el.querySelector("[data-edit-panel]")?.getAttribute("data-edit-panel") === "side";
      const docked = el.querySelector("[data-edit-bar]")?.getAttribute("data-edit-bar") === "docked";
      const points = el.querySelector("[data-edit-points]")?.getBoundingClientRect();
      const next: EditCover = {
        top: docked ? 0 : Math.max(0, Math.round(bar.bottom - b.top)),
        bottom: aside ? 0 : Math.max(0, Math.round(b.bottom - panel.top)),
        right: aside ? Math.max(0, Math.round(b.right - panel.left)) : 0,
        points: points ? Math.max(0, Math.round(points.right - b.left)) : 0,
        wide: b.width >= 1024,
      };
      setCover((f) => (f && f.top === next.top && f.bottom === next.bottom && f.right === next.right && f.points === next.points && f.wide === next.wide ? f : next));
    };
    // The first measure at once; then once the drawer's fold or a resize has settled.
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    };
    measure();
    const observer = new ResizeObserver(settle);
    observer.observe(el);
    // The bar and the panel, observed as they come (the panel is a chunk of its own, after the first measure).
    const seen = new Set<Element>();
    const watch = () => {
      for (const part of el.querySelectorAll("[data-edit-bar] header, [data-edit-panel] > div, [data-edit-points]")) {
        if (seen.has(part)) continue;
        seen.add(part);
        observer.observe(part);
        settle();
      }
    };
    watch();
    const arrivals = new MutationObserver(watch);
    arrivals.observe(el, { childList: true, subtree: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      arrivals.disconnect();
    };
  }, [box, editing]);
  return cover;
}

export default function VillageStage({ village, editable, ...props }: VillageStageProps) {
  const slotList = props.layoutSlots?.slots;
  // The layouts the slots keep: a draft equal to one is not lost by leaving (#804).
  const kept = useMemo(() => slotList?.flatMap((s) => (s.open && s.tiles ? [s.tiles] : [])) ?? NO_LAYOUTS, [slotList]);
  const editor = useLayoutEditor({
    kept,
    village: village ?? NONE,
    inventory: props.inventory,
    own: editable,
    saving: props.saving,
    saved: props.saved,
    editing: editable && (props.editing ?? false),
    onEditingChange: props.onEditingChange,
    // A story starting on another saved layout (`initialSelected`) edits that layout's tiles.
    initialDraft: props.initialDraft ?? props.layoutSlots?.slots.find((s) => s.slot === props.layoutSlots?.initialSelected && s.open)?.tiles ?? undefined,
    initialHand: props.initialHand,
    initialPending: props.initialPending,
    initialLeaving: props.initialLeaving,
    blocked: !!props.layoutSlots?.busy,
    onSave: (tiles, score) => props.onSave?.(tiles, score, props.layoutSlots?.active),
    onDismissSaved: props.onDismissSaved,
    onDirtyChange: props.onDirtyChange,
    randomizer: props.randomizer,
    randomSeed: props.randomSeed,
    slowRollMs: props.slowRollMs,
    initialRolling: props.initialRolling,
  });
  const { editing } = editor;
  const [drawn, setDrawn] = useState(false);
  const onDrawn = useCallback(() => setDrawn(true), []);
  const scene = !!props.renderCanvas;
  const { onCanvasChange } = props;
  const canvas = scene && !!village;
  useEffect(() => onCanvasChange?.(canvas), [canvas, onCanvasChange]);
  const camera = canvas && !editing && !!props.camera;
  // The points by structure (#758), edit mode's alone (the home's view has its kinds' sums, #831): the draft's live, the tile
  // under the bubble included.
  const points = useMemo(() => (editing ? layoutPoints(editor.shown) : NO_POINTS), [editing, editor.shown]);
  const [editLit, setEditLit] = useState<string | null>(props.initialLit ?? null);
  const layoutSlots = props.layoutSlots;
  const active = layoutSlots?.active ?? 0;
  // The layout edited (EDIT-VILLAGE): the one the draft came from, Save's target; the active one until another is picked (a story's
  // open slot picked first, `initialSelected`).
  const [picked, setEdited] = useState<number | null>(() => {
    const first = layoutSlots?.initialSelected;
    return first != null && layoutSlots!.slots.some((s) => s.slot === first && s.open) ? first : null;
  });
  const edited = picked ?? active;
  // Use asked (#804's Make active; a story may start on it).
  const [using, setUsing] = useState(layoutSlots?.initialAsk === "activate");
  // Leaving edit mode (or entering it) turns the editor's light off and edits the active layout again.
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    setEditLit(null);
    setEdited(null);
    setUsing(false);
  }
  const litKey = editing ? editLit : null;
  const litLine = litKey === null ? null : (points.lines.find((l) => l.key === litKey) ?? null);
  // A change to the draft keeps the light while the lit structure is still there, else turns it off (it does not come back).
  useEffect(() => {
    if (editing && editLit !== null && !points.lines.some((l) => l.key === editLit)) setEditLit(null);
  }, [editing, editLit, points]);
  const onEdit = props.onEdit;
  const press = useMemo(() => (editable && !editing && onEdit ? { label: "Edit village", art: EDIT_ART, onAct: onEdit, holdMs: props.holdMs } : null), [editable, editing, onEdit, props.holdMs]);
  const lit = litLine?.lit ?? null;
  // The tile's actions on the scene (TILE-ACTIONS: the boards' own, Back to the inventory in Discard's place).
  const bubble = scene ? editor.bubble : null;
  const boxRef = useRef<HTMLDivElement>(null);
  const cover = useEditCover(boxRef, editing && !!village);
  const frame = useMemo(() => (scene ? frameOf(cover) : null), [scene, cover]);
  // From `desktop` the bar is the side menu's head (the owner's asks of 2026-11-05).
  const docked = useDocked();
  const view: LayoutBoardView = useMemo(() => ({ ...editor.view, bubble, lit, press, camera, frame }), [editor.view, bubble, lit, press, camera, frame]);
  // Save into the layout edited: the active one is the village (the editor's Save, which closes edit mode on its way back); another
  // keeps the draft there, the village unchanged (#804's Save here), edit mode open.
  const target = layoutSlots?.slots.find((s) => s.slot === edited && s.open) ?? null;
  const intoActive = !layoutSlots || !target || edited === active;
  const slotBusy = !!layoutSlots?.busy;
  const save = intoActive
    ? { onSave: editor.save, disabled: !editor.changed || editor.over || editor.saving || editor.blocked, busy: editor.saving }
    : {
        onSave: () => {
          editor.cancelRoll();
          layoutSlots!.onSaveTo?.(edited, editor.draft);
        },
        disabled: (!!target!.tiles && sameLayout(editor.draft, target!.tiles)) || editor.over || editor.saving || slotBusy || editor.rolling,
        busy: layoutSlots!.busy?.kind === "save-to" && layoutSlots!.busy.slot === edited,
      };
  // Another layout edited (the carousel): the scene slides in from its side, the carousel's way (the owner's ask of 2026-11-05; not under
  // reduced motion). A transform on the scene's layer: the canvas stays as it is.
  const sceneRef = useRef<HTMLDivElement>(null);
  const calm = useReducedMotionConfig() ?? false;
  const pick = useCallback(
    (slot: number) => {
      const el = sceneRef.current;
      if (slot !== edited && el && !calm && typeof el.animate === "function") {
        const way = slot > edited ? 1 : -1;
        el.animate([{ transform: `translateX(${way * 18}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 360, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      setEdited(slot);
    },
    [edited, calm],
  );
  const picker = layoutSlots && <LayoutSlotsStrip editor={editor} {...layoutSlots} picked={edited} onPick={pick} />;
  // Use (#804's Make active): the layout edited as saved, made the village attackers face, asked first; off while it is empty, needs
  // tiles the player no longer holds, or holds changes not saved (Use takes the saved layout).
  const editedSlot = layoutSlots?.slots.find((s) => s.slot === edited && s.open) ?? null;
  const use: EditBarUse | undefined =
    layoutSlots && editedSlot
      ? {
          active: edited === active,
          disabled: !editedSlot.tiles || !editedSlot.fits || !sameLayout(editor.draft, editedSlot.tiles) || slotBusy || editor.saving || editor.rolling,
          busy: layoutSlots.busy?.kind === "activate" && layoutSlots.busy.slot === edited,
          onUse: () => setUsing(true),
        }
      : undefined;
  const still = !scene && editor.bubble;
  // The plan view in edit mode (#1033): its scroll region the room the bar and the panel leave, and above the still bubble over a
  // phone's sheet while a tile is in hand; the points' column (at the top left, over it) its padding, so the plan scrolls out from under it too. Every tile and
  // every lit cell can be scrolled into view and tapped.
  const planBox = editing && cover ? { top: cover.top, right: cover.right, bottom: cover.bottom + (still && !cover.right ? STILL_BUBBLE_PX : 0) } : undefined;
  const planPad = editing && cover ? cover.points : 0;
  return (
    <>
      {/*
        The scene's box: the whole screen, in view and in edit mode (EDIT-VILLAGE: the editor's bar and panel float over the village,
        as the book's). Its place in the tree never changes, so the canvas stays up across the modes.
      */}
      <div ref={boxRef} data-slot="village-scene" className="relative min-h-0 flex-1 overflow-hidden">
        {/* The scene's layer (the carousel's slide moves it alone). */}
        <div ref={sceneRef} className="absolute inset-0">
          {/* The village not read yet: a placeholder sky under the overlays (they paint first). */}
          {!village ? (
            <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/40 to-board" />
          ) : props.renderCanvas ? (
            props.renderCanvas(view, onDrawn)
          ) : (
            // In view nothing on the plan is tapped: it fits the screen. The editor keeps the touch floor, and scrolls past it, in the room
            // its bar and panel leave (#1033).
            <div className="absolute inset-0 bg-board">
              <div data-plan-room className="absolute inset-0" style={planBox}>
                <LayoutBoard {...view} fit={!editing} tileArt={props.tileArt} padLeft={planPad} />
              </div>
            </div>
          )}
        </div>
        {/* Over the canvas and under the editor's bar: the box alone, never the overlays nor the editor's panel. */}
        {props.arrival && props.renderCanvas && <VillageFog arrival={props.arrival} cleared={drawn} />}
        {editing && village && <EditBar editor={editor} holdMs={props.holdMs} save={save} use={use} docked={docked} />}
        {editing && village && (
          <Suspense fallback={null}>
            <LazyEditPoints breakdown={points} change={editor.score - (editedSlot?.tiles ? editedSlot.score : village.score)} selected={editLit} onSelect={setEditLit} />
          </Suspense>
        )}
        {editing && (
          <Suspense fallback={null}>
            <LazyEditPanel
              editor={editor}
              layouts={picker}
              tileArt={props.tileArt}
              refusal={
                props.refusal && (
                  <InlineError
                    title="Not saved"
                    message={props.refusal}
                    detail={props.refusalDetail}
                    action={
                      props.onDismissRefusal && (
                        <Button size="sm" variant="ghost" onClick={props.onDismissRefusal}>
                          Dismiss
                        </Button>
                      )
                    }
                  />
                )
              }
              above={
                // The plan view's actions: still, in a row over the panel (the 3D scene's stand out of the tile's sides); their own chunk, as the scene's.
                still && (
                  <Suspense fallback={null}>
                    <LazyTileBubble
                      rotations={still.rotations}
                      onRotate={still.onRotate}
                      onReturn={still.onReturn}
                      onClose={still.onClose}
                      cancelButton={still.cancelButton}
                      busy={still.busy}
                    />
                  </Suspense>
                )
              }
            />
          </Suspense>
        )}
      </div>
      <LeaveEditDialog editor={editor} look="hud" />
      {layoutSlots && editedSlot && (
        <SlotDialog
          ask={using ? "activate" : null}
          slot={editedSlot}
          onCancel={() => setUsing(false)}
          onConfirm={() => {
            setUsing(false);
            layoutSlots.onActivate?.(edited);
          }}
        />
      )}
    </>
  );
}
