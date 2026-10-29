import { Suspense, lazy, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Score } from "../elements/score";
import { type TileArt } from "../elements/tile-chip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { GameIcon } from "../elements/game-icon";
import { Skeleton } from "../ui/skeleton";
import { LayoutBoard } from "../containers/layout-board";
import { LayoutEditorPanel, LeaveEditDialog, RandomDie, ResetAllHold, useLayoutEditor, type LayoutEditorOptions, type LayoutSaved } from "../containers/layout-editor";
import type { Inventory, Spot, VillageLayout } from "../containers/layout-rules";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TopBar } from "../containers/top-bar";

// The score's count after a save (issue 802, the balances' change): its own chunk, loaded by a save alone.
const LazyScoreCount = lazy(() => import("../elements/score-count").then((m) => ({ default: m.ScoreCount })));

/** Why the village is not shown: a guest (Connect), the reads on their way, a failed read (Retry). */
export type VillageLayoutStatus = SkinsStatus;

export type { LayoutHand, LayoutSaved } from "../containers/layout-editor";

export interface VillageLayoutSceneProps extends Pick<LayoutEditorOptions, "randomizer" | "randomSeed" | "slowRollMs" | "initialRolling"> {
  /** The village; omitted, `status` says why. */
  village?: VillageLayout;
  status?: VillageLayoutStatus | null;
  /** The collected tiles off the saved layout, per plan (own village). */
  inventory?: Inventory;
  /** The player's own village (edit, chests, shop), or someone else's, read-only. */
  mode?: "own" | "visit";
  /** The own village is founded; false: the starter alone, and Found (its starter layout comes with it). */
  founded?: boolean;
  /** The founding on its way. */
  founding?: boolean;
  /** The chests waiting to be opened (own village): a count on Chests. */
  chests?: number;
  /** The save on its way: the editor waits. */
  saving?: boolean;
  /** The last save landed: the editor closes, and back in view the score counts to the new one (#802), until edit mode opens again. */
  saved?: LayoutSaved | null;
  /** The save's refusal, until dismissed. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  /**
   * A visit's 3D board (#772, open point 5): the board module's, read only, in a rival's red void. Given the plan view
   * (`LayoutBoard`), which it draws where the 3D board cannot (no WebGL, the renderer failed). Unset: the plan view.
   */
  board3d?: (plan: ReactNode) => ReactNode;
  /** The hold's length on Reset all, ms (the stories and tests tune it). */
  holdMs?: number;
  /** Where the stories start: the editor open on this draft (the saved layout when unset), a tile in hand, set on a cell, the leave dialog. */
  initialEditing?: boolean;
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  onBack?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  /** Save the draft: always valid (the editor keeps it so), within the slots. */
  onSave?: (tiles: readonly BoardTile[]) => void;
  /** Found the village (own, not founded). */
  onFound?: () => void;
  /** The editor holds changes not saved (true), or none (false): the page asks before leaving it by any other way than Back. */
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
  onOpenChests?: () => void;
  onOpenShop?: () => void;
}

/**
 * The v2 village (#739, part of #732): a free layout of the player's collected tiles, rearranged at any time, capped by the
 * slots unlocked (8 + level). The view shows the layout under the fog, which lifts around its tiles, the score, the level
 * and the slots used ("21 / 28"), and leads to the chests and the shop. Edit opens the editor, where placing works as on the
 * board with no validation (#756): a card of the inventory's carousel puts its tile in hand, its legal cells light up, a tap
 * places it on one, and the bubble rotates it or sends it back to the inventory (in the bin's place); a tap on another lit cell
 * moves it. A placed tile is lifted with a tap, to move, turn or send back (Cancel puts it back where it was); a tile that
 * holds the village together shakes instead. The starter never moves. "Reset all", the eraser held beside the slots, brings
 * the village back to the starter alone. The layout stays valid at every step; its live score is the engine's. Save sends it
 * when something changed and shows the new score once confirmed; Back with changes asks first, the way to drop them. Data and the save come as props and
 * callbacks: the page wires them to the mock ledger (#741) and then the contracts (#733) in later tasks.
 */
export function VillageLayoutScene({ village, status, mode = "own", onBack, onConnect, onRetry, ...props }: VillageLayoutSceneProps) {
  if (village) return <LayoutView village={village} mode={mode} onBack={onBack} {...props} />;
  const own = mode === "own";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar title={own ? "My village" : "Village"} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        {status && (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to build your village"
            guestText="Your village is kept on your account: chests after your games and the daily shop fill your inventory, and others attack it."
            errorTitle="The village could not be read"
            skeleton={
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="aspect-square w-full rounded-2xl" />
              </div>
            }
            onConnect={onConnect}
            onRetry={onRetry}
          />
        )}
      </main>
    </div>
  );
}

function LayoutView({
  village,
  mode = "own",
  inventory = {},
  founded = true,
  founding = false,
  chests = 0,
  saving = false,
  saved = null,
  refusal = null,
  refusalDetail,
  tileArt,
  board3d,
  holdMs,
  initialEditing = false,
  initialDraft,
  initialHand = null,
  initialPending = null,
  initialLeaving = false,
  onBack,
  onSave,
  onFound,
  onDirtyChange,
  onDismissSaved,
  onDismissRefusal,
  onOpenChests,
  onOpenShop,
  ...die
}: Omit<VillageLayoutSceneProps, "village" | "status" | "onConnect" | "onRetry"> & { village: VillageLayout }) {
  const own = mode === "own";
  const editor = useLayoutEditor({ village, inventory, own, saving, saved, initialEditing, initialDraft, initialHand, initialPending, initialLeaving, onBack, onSave: onSave && ((tiles) => onSave(tiles)), onDismissSaved, onDirtyChange, ...die });
  const { editing, slots, used, score, pending, open, back } = editor;

  // The save that landed, edit mode closed: the score just saved, until the village's read has it too.
  const after = own && !editing ? saved : null;
  const shown = after?.score ?? score;
  const title = own ? "My village" : `${village.owner}'s village`;
  return (
    <div className="flex min-h-dvh flex-col bg-background desktop:h-dvh desktop:overflow-hidden">
      {/* The save's word for assistive technology (#802): the region stays, so the change is read once. */}
      <p role="status" className="sr-only">
        {after ? `Village saved: score ${formatInteger(after.score)}` : ""}
      </p>
      <TopBar
        title={editing ? "Edit layout" : title}
        onBack={back}
      />
      <div className="flex min-h-0 flex-1 flex-col desktop:flex-row desktop:gap-4 desktop:p-4 desktop:pt-0">
        <div className="flex min-h-0 flex-1 flex-col desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-border">
          <div className="flex items-end justify-between gap-3 border-b border-border px-4 pb-2 desktop:pt-2">
            <div className="flex shrink-0 items-end gap-3">
              {/* Back in view after a save (#802), the score counts from the one before, once. */}
              <Score
                value={shown}
                label={editing ? "Layout score" : "Village score"}
                size="sm"
                figure={
                  after && (
                    <Suspense fallback={formatInteger(after.previous)}>
                      <LazyScoreCount value={shown} from={after.previous} />
                    </Suspense>
                  )
                }
              />
              {editing && score !== village.score && (
                <span className="pb-0.5 text-xs text-muted-foreground">
                  saved <span className="numeric">{formatInteger(village.score)}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!own && (
                <Badge variant="outline">
                  <Icon name="user" size="xs" /> Visiting
                </Badge>
              )}
              <Badge variant="secondary" aria-label={`Level ${village.level}`}>
                Lv <span className="numeric">{village.level}</span>
              </Badge>
              <Badge variant="secondary" aria-label={`${used} of ${slots} slots used`}>
                <Icon name="table-cells-large" size="xs" />
                <span className="numeric">
                  {used} / {slots}
                </span>
              </Badge>
              {editing && <RandomDie editor={editor} />}
              {editing && <ResetAllHold editor={editor} holdMs={holdMs} />}
            </div>
          </div>
          {!own && board3d ? (
            // The visit's board in the plan view's place and size; the plan view inside it fills it where the 3D board cannot draw.
            <div data-visit-board className={cn("relative overflow-hidden flex-none desktop:min-h-0 desktop:flex-1", "h-[max(14rem,calc(100dvh-14rem))]", "desktop:h-auto")}>
              {board3d(<LayoutBoard tiles={editor.tiles} tileArt={tileArt} className="absolute inset-0 h-full" />)}
            </div>
          ) : (
          <LayoutBoard
            tiles={editor.tiles}
            editing={editing}
            plates={editor.plates}
            pending={pending}
            shaking={editor.shaking}
            tileArt={tileArt}
            onTile={editor.lift}
            onPlate={editor.choosePlate}
            onPending={editor.letGo}
            // On a phone the board takes what the header and the editor leave (the page scrolls only on a short screen); from
            // desktop it fills its card.
            className={cn("flex-none desktop:min-h-0 desktop:flex-1", editing ? "h-[max(14rem,calc(100dvh-30rem))]" : "h-[max(14rem,calc(100dvh-14rem))]", "desktop:h-auto")}
          />
          )}
          {own && refusal && (
            <div className="border-t border-border px-4 py-2">
              <InlineError
                title="Not saved"
                message={refusal}
                detail={refusalDetail}
                action={
                  onDismissRefusal && (
                    <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                      Dismiss
                    </Button>
                  )
                }
              />
            </div>
          )}
          {!own && <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">Read-only: the tiles stay as their owner laid them out.</p>}
          {own && !editing && !founded && (
            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:hidden">
              <FoundNotice founding={founding} onFound={onFound} />
            </div>
          )}
          {own && !editing && founded && (
            <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:hidden">
              <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
            </div>
          )}
        </div>
        {own && (
          <aside
            aria-label={editing ? "Editor" : "Village"}
            className={cn(
              "flex shrink-0 flex-col gap-3 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:max-h-full desktop:w-96 desktop:self-start desktop:rounded-2xl desktop:border desktop:p-4",
              !editing && "hidden desktop:flex",
            )}
          >
            {editing ? (
              <LayoutEditorPanel editor={editor} tileArt={tileArt} />
            ) : !founded ? (
              <FoundNotice founding={founding} onFound={onFound} />
            ) : (
              <>
                <h2 className="font-display text-lg">Your village</h2>
                <p className="text-sm text-muted-foreground">
                  <span className="numeric">{used}</span> of your <span className="numeric">{slots}</span> slots hold a tile; each level unlocks one more, up to 28.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      <LeaveEditDialog editor={editor} />
    </div>
  );
}

/** A village not founded yet: Found lays out its starter layout (8 tiles around the starter, picked by the address). */
function FoundNotice({ founding, onFound }: { founding: boolean; onFound?: () => void }) {
  return (
    <Notice
      icon={<GameIcon name="house-tree" size="sm" />}
      title="Found your village"
      action={
        <Button size="sm" loading={founding} onClick={onFound}>
          Found
        </Button>
      }
    >
      It is free: 8 tiles laid out around the starter come with it, and chests and the daily shop add more.
    </Notice>
  );
}

/** The view's three ways on: edit the layout, open the chests (their count), the shop. */
function ViewActions({ chests, onEdit, onOpenChests, onOpenShop }: { chests: number; onEdit: () => void; onOpenChests?: () => void; onOpenShop?: () => void }) {
  return (
    <>
      <Button onClick={onEdit}>Edit</Button>
      <Button variant="outline" onClick={onOpenChests} aria-label={chests > 0 ? `Chests, ${chests} waiting` : "Chests"} className="relative">
        <Icon name="treasure-chest" size="sm" /> Chests
        {chests > 0 && (
          <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {chests}
          </span>
        )}
      </Button>
      <Button variant="outline" onClick={onOpenShop}>
        Shop
      </Button>
    </>
  );
}
