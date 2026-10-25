import type { ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { type TileArt } from "../elements/tile-chip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { LayoutBoard, type LayoutBoardView } from "./layout-board";
import { LayoutEditorPanel, LeaveEditDialog, useLayoutEditor, type LayoutSaved } from "./layout-editor";
import type { Inventory, Spot, VillageLayout } from "./layout-rules";

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
  /** The village in 3D, drawn from the editor's state; without it, the plan view. */
  renderCanvas?: (view: LayoutBoardView) => ReactNode;
  /** Save the draft, with the score the engine gives it. */
  onSave?: (tiles: readonly BoardTile[], score: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * The home's village (#753): the scene's box (the 3D canvas, else the plan view) and, in edit mode, the editor's overlays (#739):
 * its bar (Back, the live score, the slots), its panel (the inventory, Reset all, Discard, Save) beside or under the box, and the
 * leave dialog. The view's overlays are the scene's, painted before this chunk (the editor, the board, the engine) arrives.
 */
const NONE: VillageLayout = { owner: "", level: 1, tiles: [], score: 0 };

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
  const view: LayoutBoardView = { tiles: editor.tiles, editing, plates: editor.plates, pending: editor.pending, shaking: editor.shaking, onTile: editor.lift, onPlate: editor.choosePlate };
  return (
    <>
      {/* The scene's box: the whole screen in view, what the editor's panel leaves in edit mode. Its place in the tree never changes, so the canvas stays up across the modes. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* The village not read yet: a placeholder sky under the overlays (they paint first). */}
        {!village ? (
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/40 to-board" />
        ) : props.renderCanvas ? (
          props.renderCanvas(view)
        ) : (
          // In view nothing on the plan is tapped: it fits the screen. The editor keeps the touch floor, and scrolls past it.
          <LayoutBoard {...view} fit={!editing} tileArt={props.tileArt} className="absolute inset-0 bg-board" />
        )}
        {editing && village && <EditBar editor={editor} village={village} />}
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
          <LayoutEditorPanel editor={editor} tileArt={props.tileArt} holdMs={props.holdMs} />
        </aside>
      )}
      <LeaveEditDialog editor={editor} />
    </>
  );
}

/** Edit mode's bar over the scene: Back (out of edit mode, asking first with changes), the live score against the saved one, the slots. */
function EditBar({ editor, village }: { editor: ReturnType<typeof useLayoutEditor>; village: VillageLayout }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
      <header className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur">
        <Button size="icon" variant="ghost" onClick={editor.back} aria-label="Leave edit mode">
          <Icon name="chevron-left" size="md" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-lg leading-tight">Edit village</span>
          <span className="text-xs text-muted-foreground">
            Score <span className="numeric font-semibold text-foreground">{formatInteger(editor.score)}</span>
            {editor.score !== village.score && (
              <>
                {" "}
                · saved <span className="numeric">{formatInteger(village.score)}</span>
              </>
            )}
          </span>
        </div>
        <Badge variant="secondary" aria-label={`${editor.used} of ${editor.slots} slots used`}>
          <Icon name="table-cells-large" size="xs" />
          <span className="numeric">
            {editor.used} / {editor.slots}
          </span>
        </Badge>
      </header>
    </div>
  );
}

