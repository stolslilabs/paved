import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { useSidePanel } from "../../lib/side-panel";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { type TileArt } from "../elements/tile-chip";
import { VillageFog, type VillageArrival } from "../elements/village-fog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { LayoutBoard, type LayoutBoardView } from "./layout-board";
import { LayoutEditorPanel, LeaveEditDialog, ResetAllHold, useLayoutEditor, type LayoutEditor, type LayoutSaved } from "./layout-editor";
import { layoutPoints, type Inventory, type Spot, type VillageLayout } from "./layout-rules";
import { PointsFold, PointsPanel, type PointsPanelProps } from "./points-breakdown";

export interface VillageStageProps {
  /** The village shown; undefined: not read yet (a placeholder sky). */
  village?: VillageLayout;
  /** The player's own village, founded: the editor can open. */
  editable: boolean;
  /** The editor open (the page's URL); a change asks `onEditingChange`. */
  editing: boolean;
  onEditingChange?: (editing: boolean) => void;
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
  /**
   * The line of the points lit in view (#758, the scene's panel under the profile): its structure's key. Edit mode keeps its
   * own, in the editor's panel.
   */
  lit?: string | null;
  /** Where the stories start: the editor's points unfolded (on a phone; open from `desktop` anyway), a line lit. */
  initialPointsOpen?: boolean;
  initialLit?: string | null;
  /**
   * The village in 3D, drawn from the editor's state; without it, the plan view. `onDrawn` is its ready signal: called once its
   * first frame is drawn with every tile's model and every tile image in (`VillageLayoutCanvas`'s `onReady`).
   */
  renderCanvas?: (view: LayoutBoardView, onDrawn: () => void) => ReactNode;
  /**
   * How the 3D village arrives (#761): under a fog that clears once the canvas says it is drawn, or a short fade. Unset, or
   * the plan view: neither.
   */
  arrival?: VillageArrival;
  /** Save the draft, with the score the engine gives it. */
  onSave?: (tiles: readonly BoardTile[], score: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * The home's village (#753): the scene's box (the 3D canvas, else the plan view) and, in edit mode, the editor's overlays (#739):
 * its bar (Back, the live score, the slots, Reset all), its panel (the hint, the inventory, Save) beside or under the box, and the
 * leave dialog. The bubble of the tile in hand stands by the tile on the 3D scene, clear of the bar and the panel; the plan view
 * stands it still in the panel (#756). The view's overlays are the scene's, painted before this chunk (the editor, the board, the engine) arrives.
 */
const NONE: VillageLayout = { owner: "", level: 1, tiles: [], score: 0 };

/** The editor's points open from this width (`--breakpoint-desktop`), folded under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

export default function VillageStage({ village, editable, ...props }: VillageStageProps) {
  const editor = useLayoutEditor({
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
    onSave: props.onSave,
    onDismissSaved: props.onDismissSaved,
    onDirtyChange: props.onDirtyChange,
  });
  const { editing } = editor;
  const [drawn, setDrawn] = useState(false);
  const onDrawn = useCallback(() => setDrawn(true), []);
  const scene = !!props.renderCanvas;
  // The points by structure (#758): the saved layout's in view, the draft's live in edit mode, the tile under the bubble included.
  const points = useMemo(() => layoutPoints(editing ? editor.draft : (village ?? NONE).tiles), [editing, editor.draft, village]);
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
  const litKey = editing ? editLit : (props.lit ?? null);
  const litLine = litKey === null ? null : (points.lines.find((l) => l.key === litKey) ?? null);
  // A change to the draft keeps the light while the lit structure is still there, else turns it off (it does not come back).
  useEffect(() => {
    if (editing && editLit !== null && !points.lines.some((l) => l.key === editLit)) setEditLit(null);
  }, [editing, editLit, points]);
  const open = pointsOpen ?? wide;
  const foldPoints = (next: boolean) => {
    setPointsOpen(next);
    // Leaving the list turns the light off.
    if (!next) setEditLit(null);
  };
  const view: LayoutBoardView = { ...editor.view, bubble: scene ? editor.bubble : null, lit: litLine?.areas ?? null };
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
        {!editing && props.saved && (
          <div className="pointer-events-none absolute inset-x-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+4.5rem)] flex justify-center">
            <Notice
              icon="circle-check"
              title="Layout saved"
              className="pointer-events-auto w-full max-w-sm bg-card/95 backdrop-blur"
              action={
                props.onDismissSaved && (
                  <Button size="icon" variant="ghost" onClick={props.onDismissSaved} aria-label="Dismiss">
                    <Icon name="xmark" size="sm" />
                  </Button>
                )
              }
            >
              Your village scores <span className="numeric font-semibold">{formatInteger(props.saved.score)}</span>: attackers play against it now.
            </Notice>
          </div>
        )}
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
          <LayoutEditorPanel editor={editor} tileArt={props.tileArt} bubble={scene ? "scene" : "panel"} />
        </aside>
      )}
      <LeaveEditDialog editor={editor} />
    </>
  );
}

/**
 * The view's points panel (#758), drawn by the scene when its score chip is tapped: the saved layout's lines, computed here, in
 * the stage's chunk (the engine's). The scene mounts it in both places; it draws in one, `side` (under the chip) from `tablet`,
 * `bottom` (a bottom panel over Play) on a phone. Escape closes it, as a popover.
 */
export function VillagePoints({ tiles, place, ...panel }: Omit<PointsPanelProps, "breakdown"> & { tiles: VillageLayout["tiles"]; place: "side" | "bottom" }) {
  const side = useSidePanel();
  const shown = side === (place === "side");
  const breakdown = useMemo(() => layoutPoints(tiles), [tiles]);
  const { onClose } = panel;
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onClose]);
  if (!shown) return null;
  if (place === "side") return <PointsPanel breakdown={breakdown} {...panel} />;
  return (
    <div className="absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20">
      <PointsPanel breakdown={breakdown} {...panel} />
    </div>
  );
}

/**
 * Edit mode's bar over the scene: Back (out of edit mode, asking first with changes: it is the way to drop a draft), the live
 * score against the saved one (a tap unfolds the points, #758), the slots, and Reset all held beside them (#756).
 */
function EditBar({ editor, village, holdMs, onPoints }: { editor: LayoutEditor; village: VillageLayout; holdMs?: number; onPoints: () => void }) {
  return (
    <div data-bubble-avoid className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
      <header className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur">
        <Button size="icon" variant="ghost" onClick={editor.back} aria-label="Leave edit mode">
          <Icon name="chevron-left" size="md" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-lg leading-tight">Edit village</span>
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
          <Icon name="table-cells-large" size="xs" />
          <span className="numeric">
            {editor.used} / {editor.slots}
          </span>
        </Badge>
        <ResetAllHold editor={editor} holdMs={holdMs} />
      </header>
    </div>
  );
}

