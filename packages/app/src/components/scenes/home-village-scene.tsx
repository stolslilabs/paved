import { Suspense, lazy, type ReactNode } from "react";
import type { BoardTile, GameView } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import type { BoardWheel } from "../../data/board-settings";
import { cn } from "../../lib/utils";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { type TileArt } from "../elements/tile-chip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "../containers/balances-context";
import { OverlayButton } from "../containers/home-overlays";
import { LayoutBoard, type LayoutBoardView } from "../containers/layout-board";
import { LayoutEditorPanel, LeaveEditDialog, useLayoutEditor, type LayoutSaved } from "../containers/layout-editor";
import type { Inventory, Spot, VillageLayout } from "../containers/layout-rules";
import { ProfileSlot } from "../containers/profile-context";

// The season wheel (#547) in its own chunk, as on the boards: its slot keeps its size meanwhile.
const LazySeasonWheel = lazy(() => import("../containers/board-season-wheel"));

export interface HomeVillageSceneProps {
  /** The village shown: the player's own, or a guest's starter village. Undefined: not read yet (the sky alone). */
  village?: VillageLayout;
  /** The own village's read failed: Retry. */
  error?: { message: string; detail?: ErrorDetail } | null;
  /** No wallet: the village shown is a starter one, nothing to edit; Connect at hand. */
  guest?: boolean;
  connecting?: boolean;
  /** The editor open (the page's URL, `?edit`): the editor's overlays instead of the view's. */
  editing?: boolean;
  /** Edit asked (true), or edit mode left (false): the page changes its URL. */
  onEditingChange?: (editing: boolean) => void;
  /** The collected tiles off the saved layout, per plan. */
  inventory?: Inventory;
  /** False: the starter alone, and Found (its starter layout comes with it). */
  founded?: boolean;
  founding?: boolean;
  /** The save on its way; the last save landed (the new score, until dismissed); the save's refusal. */
  saving?: boolean;
  saved?: LayoutSaved | null;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  holdMs?: number;
  /** Where the stories start: the editor on this draft, a tile in hand, set on a cell, the leave dialog. */
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  /** Chests waiting, missions to claim: the badges of the right column. */
  chests?: number;
  missions?: number;
  /** The viewer's Challenge game still running: the Resume chip. */
  activeGame?: GameView | null;
  /** `Challenge.spawn_paused`: the notice. */
  spawnPaused?: boolean;
  now: number;
  /** The season wheel of the scene (`useBoardSettings`); none: no wheel. */
  seasonWheel?: BoardWheel;
  /**
   * The village in 3D (the board's renderer, given by the page): drawn from the editor's state. Without it the scene draws the
   * plan view (`LayoutBoard`), as where WebGL is missing and in the render tests.
   */
  renderCanvas?: (view: LayoutBoardView) => ReactNode;
  onPlay?: () => void;
  onMissions?: () => void;
  onChests?: () => void;
  onShop?: () => void;
  onVault?: () => void;
  onLeague?: () => void;
  onDefence?: () => void;
  onSettings?: () => void;
  onResume?: (gameId: number) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onFound?: () => void;
  onSave?: (tiles: readonly BoardTile[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * Home (`/`, #753): the player's village full screen, a game scene like the boards (the renderer, its camera framed for the
 * screen, the fog, the weather, the day and night, the season dial at the bottom left), with Clash of Clans' overlays inside
 * the safe areas. In view: the avatar, its level ring and name at the top left; the balances and the gear at the top right; the
 * right column (Missions, Chests, Shop, Vault, League, Defence log) with their counts; Play, large, at the bottom right with
 * Edit (a hammer) beside it; today's home content as chips (Resume, the spawn pause, a guest's Connect). Edit switches the
 * overlays to the editor's (#739) in the same scene: its bar (Back, the live score, the slots), the inventory, Save, Discard and
 * Reset all; Back with changes asks first. No tab bar: the overlays replace it.
 */
export function HomeVillageScene(props: HomeVillageSceneProps) {
  const { village, guest = false, founded = true } = props;
  const editable = !!village && !guest && founded;
  return (
    <div className="relative flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-board text-foreground desktop:flex-row">
      <h1 className="sr-only">Home</h1>
      {village ? <VillageView {...props} village={village} editable={editable} /> : <Sky {...props} />}
    </div>
  );
}

/** The village not read yet (a placeholder sky under the overlays), or its read failed (Retry). */
function Sky({ error, onRetry, ...props }: HomeVillageSceneProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/40 to-board" />
      <ViewOverlays {...props} editable={false} onEdit={() => {}} />
      {error && (
        <div className="absolute inset-x-4 top-1/3 mx-auto max-w-md">
          <InlineError
            title="The village could not be read"
            message={error.message}
            detail={error.detail}
            action={
              onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              )
            }
            className="bg-card"
          />
        </div>
      )}
    </div>
  );
}

function VillageView({ village, editable, ...props }: HomeVillageSceneProps & { village: VillageLayout; editable: boolean }) {
  const editor = useLayoutEditor({
    village,
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
      <div className="relative min-h-0 flex-1">
        {props.renderCanvas ? props.renderCanvas(view) : <LayoutBoard {...view} tileArt={props.tileArt} className="absolute inset-0 bg-board" />}
        {editing ? <EditBar editor={editor} village={village} /> : <ViewOverlays {...props} village={village} editable={editable} onEdit={editor.open} />}
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

/** The view's overlays: the corners, the right column, Play and Edit, the chips. */
function ViewOverlays({ village, editable, onEdit, ...props }: HomeVillageSceneProps & { editable: boolean; onEdit: () => void }) {
  const { activeGame, now, guest, founded = true } = props;
  return (
    <>
      {/* Top: the avatar and its name at the left, the balances and the gear at the right; the chips below. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-1">
            <ProfileSlot withName />
            {village && (
              <span className="ml-1 flex items-center gap-1.5 rounded-md bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                <Icon name="house-chimney" size="xs" className="text-primary" />
                <span className="numeric font-semibold">{formatInteger(village.score)}</span>
                <span className="sr-only">village score</span>
              </span>
            )}
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <BalancesSlot layout="pill" className="desktop:hidden" />
            <BalancesSlot layout="rail" className="hidden desktop:flex" />
            <Button size="icon" variant="outline" onClick={props.onSettings} aria-label="Settings" className="rounded-full bg-card/90 backdrop-blur">
              <Icon name="gear" size="md" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 tablet:items-start">
          {activeGame && (
            <button
              type="button"
              onClick={() => props.onResume?.(activeGame.id)}
              aria-label={`Resume Challenge #${activeGame.id}`}
              className="state-layer pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-primary/50 bg-card/90 py-1.5 pr-3 pl-1.5 text-xs shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                <Icon name="play" size="xs" />
              </span>
              <span className="font-semibold">Resume #{activeGame.id}</span>
              <span className="numeric text-muted-foreground">{formatPoints(activeGame.score)} pts</span>
              <Countdown expiresAt={activeGame.expiresAt} now={now} hideLabel />
            </button>
          )}
          {props.spawnPaused && (
            <span role="status" className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-warning/50 bg-card/90 px-3 py-1.5 text-xs backdrop-blur">
              <Icon name="circle-pause" size="xs" className="text-warning" />
              New Challenge games are paused
            </span>
          )}
          {guest && (
            <span className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 py-1 pr-1 pl-3 text-xs backdrop-blur">
              Playing as a guest
              <Button size="sm" className="h-8 rounded-full" onClick={props.onConnect} loading={props.connecting}>
                Connect
              </Button>
            </span>
          )}
        </div>
      </div>

      {/* The right column, under the top row and over Play. */}
      <nav aria-label="Village" className="absolute top-[calc(max(0.5rem,env(safe-area-inset-top))+5.5rem)] right-1 flex flex-col items-center gap-1.5 tablet:right-3 tablet:gap-2.5">
        <OverlayButton icon="scroll" label="Missions" badge={props.missions} onClick={props.onMissions} />
        <OverlayButton icon="gift" label="Chests" badge={props.chests} onClick={props.onChests} />
        <OverlayButton icon="store" label="Shop" onClick={props.onShop} />
        <OverlayButton icon="piggy-bank" label="Vault" onClick={props.onVault} />
        <OverlayButton icon="trophy" label="League" onClick={props.onLeague} />
        <OverlayButton icon="shield-halved" label="Defence" onClick={props.onDefence} />
      </nav>

      {/* The bottom: the season dial at the left, Found or Edit and Play at the right. */}
      {props.seasonWheel && (
        <div data-dial-place className="absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 tablet:bottom-4 tablet:left-4">
          <Suspense fallback={<span aria-hidden className="block size-24 min-[24.375rem]:size-27 tablet:size-36" />}>
            <LazySeasonWheel state={props.seasonWheel.state} onNext={props.seasonWheel.onNext} read={props.seasonWheel.read} />
          </Suspense>
        </div>
      )}
      <div className={cn("absolute right-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex items-end gap-2 tablet:right-4 tablet:bottom-4", props.seasonWheel && "left-28 justify-end min-[24.375rem]:left-31 tablet:left-44")}>
        {village && !guest && !founded ? (
          <Button size="lg" variant="outline" className="rounded-full bg-card/90 backdrop-blur" loading={props.founding} onClick={props.onFound}>
            <Icon name="house" size="sm" /> Found
          </Button>
        ) : (
          editable && (
            <Button size="icon" variant="outline" onClick={onEdit} aria-label="Edit village" className="size-14 rounded-full bg-card/90 shadow-lg backdrop-blur">
              <Icon name="hammer" size="lg" />
            </Button>
          )
        )}
        <Button size="lg" onClick={props.onPlay} className="h-16 min-w-32 rounded-2xl px-6 font-display text-2xl shadow-lg tablet:min-w-40">
          Play <Icon name="play" size="md" />
        </Button>
      </div>
    </>
  );
}
