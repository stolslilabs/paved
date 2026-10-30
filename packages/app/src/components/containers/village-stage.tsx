import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger, type LayoutBreakdown } from "@paved/game-core";
import { useSidePanel } from "../../lib/side-panel";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { type TileArt } from "../elements/tile-chip";
import { VillageFog, type VillageArrival } from "../elements/village-fog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { LayoutBoard, type LayoutBoardView } from "./layout-board";
import { LayoutEditorPanel, LeaveEditDialog, RandomDie, ResetAllHold, useLayoutEditor, type LayoutEditor, type LayoutEditorOptions, type LayoutSaved } from "./layout-editor";
import { layoutPoints, type Inventory, type Spot, type VillageLayout } from "./layout-rules";
import { LayoutSlotsStrip, type LayoutSlotsProps } from "./layout-slots-strip";
import { PointsFold } from "./points-breakdown";

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
  /** Where the stories start: the editor's points unfolded (on a phone; open from `desktop` anyway), a line lit. */
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
  /** The saved layouts (#804): their strip above the inventory in edit mode. Unset (not served): no strip. */
  layoutSlots?: LayoutSlotsProps;
}

/**
 * The home's village (#753): the scene's box (the 3D canvas, else the plan view) and, in edit mode, the editor's overlays (#739):
 * its bar (Back, the live score, the slots, Reset all), its panel (the saved layouts' strip, #804; the hint, the inventory, Save)
 * beside or under the box, and the leave dialog. The bubble of the tile in hand stands by the tile on the 3D scene, clear of the bar and the panel; the plan view
 * stands it still in the panel (#756). The view's overlays are the scene's, painted before this chunk (the editor, the board, the engine) arrives.
 */
const NONE: VillageLayout = { owner: "", level: 1, tiles: [], score: 0 };
/** The points in view: none computed, nothing lit (the structure lines are edit mode's, #831). */
const NO_POINTS: LayoutBreakdown = { lines: [], other: 0, score: 0 };

/** The Edit of the press bubble (#799): the hammer, as the home's Edit since #807. */
const EDIT_ICON = "hammer";

/** The editor's points open from this width (`--breakpoint-desktop`), folded under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

const NO_LAYOUTS: readonly (readonly BoardTile[])[] = [];

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
    initialDraft: props.initialDraft,
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
  const [pointsOpen, setPointsOpen] = useState<boolean | null>(props.initialPointsOpen ?? null);
  const wide = useSidePanel(DESKTOP_QUERY);
  // Leaving edit mode (or entering it) turns the editor's light off and folds the points back to the width's default.
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    setEditLit(null);
    setPointsOpen(null);
  }
  const litKey = editing ? editLit : null;
  const litLine = litKey === null ? null : (points.lines.find((l) => l.key === litKey) ?? null);
  // A change to the draft keeps the light while the lit structure is still there, else turns it off (it does not come back).
  useEffect(() => {
    if (editing && editLit !== null && !points.lines.some((l) => l.key === editLit)) setEditLit(null);
  }, [editing, editLit, points]);
  const open = pointsOpen ?? wide;
  const foldPoints = useCallback((next: boolean) => {
    setPointsOpen(next);
    // Leaving the list turns the light off.
    if (!next) setEditLit(null);
  }, []);
  const onEdit = props.onEdit;
  const press = useMemo(() => (editable && !editing && onEdit ? { label: "Edit village", icon: EDIT_ICON, onAct: onEdit, holdMs: props.holdMs } : null), [editable, editing, onEdit, props.holdMs]);
  const lit = litLine?.lit ?? null;
  const bubble = scene ? editor.bubble : null;
  const view: LayoutBoardView = useMemo(() => ({ ...editor.view, bubble, lit, press, camera }), [editor.view, bubble, lit, press, camera]);
  return (
    <>
      {/* The scene's box: the whole screen in view, what the editor's panel leaves in edit mode. Its place in the tree never changes, so the canvas stays up across the modes. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* The village not read yet: a placeholder sky under the overlays (they paint first). */}
        {!village ? (
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/40 to-board" />
        ) : props.renderCanvas ? (
          props.renderCanvas(view, onDrawn)
        ) : (
          // In view nothing on the plan is tapped: it fits the screen. The editor keeps the touch floor, and scrolls past it.
          <LayoutBoard {...view} fit={!editing} tileArt={props.tileArt} className="absolute inset-0 bg-board" />
        )}
        {/* Over the canvas and under the editor's bar: the box alone, never the overlays nor the editor's panel. */}
        {props.arrival && props.renderCanvas && <VillageFog arrival={props.arrival} cleared={drawn} />}
        {editing && village && <EditBar editor={editor} village={village} holdMs={props.holdMs} onPoints={() => setPointsOpen(true)} />}
      </div>
      {editing && (
        <aside
          aria-label="Editor"
          data-bubble-avoid
          className="flex shrink-0 flex-col gap-2 border-t border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur desktop:w-96 desktop:border-t-0 desktop:border-l desktop:p-4"
        >
          {props.refusal && (
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
          )}
          <PointsFold breakdown={points} selected={editLit} onSelect={setEditLit} open={open} onOpenChange={foldPoints} />
          {props.layoutSlots && <LayoutSlotsStrip editor={editor} {...props.layoutSlots} />}
          <LayoutEditorPanel editor={editor} tileArt={props.tileArt} bubble={scene ? "scene" : "panel"} />
        </aside>
      )}
      <LeaveEditDialog editor={editor} />
    </>
  );
}

/**
 * Edit mode's bar over the scene: Back (out of edit mode, asking first with changes: it is the way to drop a draft), the live
 * score against the saved one (a tap unfolds the points, #758), the slots, and the die (#803) and Reset all held beside them (#756).
 */
function EditBar({ editor, village, holdMs, onPoints }: { editor: LayoutEditor; village: VillageLayout; holdMs?: number; onPoints: () => void }) {
  return (
    <div data-bubble-avoid className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
      <header className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur">
        <Button size="icon" variant="ghost" onClick={editor.back} aria-label="Leave edit mode">
          <Icon name="chevron-left" size="md" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* On a phone the die and Reset all leave the title "Edit" (#803); "Edit village" from `tablet`. */}
          <span className="truncate font-display text-lg leading-tight">
            Edit<span className="hidden tablet:inline"> village</span>
          </span>
          <button
            type="button"
            onClick={onPoints}
            aria-label={`Score ${formatInteger(editor.score)}: show the points`}
            className="self-start rounded-sm text-left text-xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Score <span className="numeric font-semibold text-foreground">{formatInteger(editor.score)}</span>
            {editor.score !== village.score && (
              <>
                {" "}
                · saved <span className="numeric">{formatInteger(village.score)}</span>
              </>
            )}
          </button>
        </div>
        <Badge variant="secondary" aria-label={`${editor.used} of ${editor.slots} slots used`}>
          <span className="hidden tablet:contents">
            <Icon name="table-cells-large" size="xs" />
          </span>
          <span className="numeric">
            {editor.used} / {editor.slots}
          </span>
        </Badge>
        <RandomDie editor={editor} />
        <ResetAllHold editor={editor} holdMs={holdMs} />
      </header>
    </div>
  );
}

