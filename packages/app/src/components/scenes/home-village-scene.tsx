import { Suspense, lazy, type ReactNode } from "react";
import type { BoardTile, GameView } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import type { BoardWheel } from "../../data/board-settings";
import { cn } from "../../lib/utils";
import { leagueOf } from "../../lib/pvp-rules";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { formatPoints } from "../elements/score";
import { type TileArt } from "../elements/tile-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "../containers/balances-context";
import { OverlayButton } from "../containers/home-overlays";
import type { LayoutBoardView } from "../containers/layout-board";
import type { LayoutSaved } from "../containers/layout-editor";
import type { Inventory, Spot, VillageLayout } from "../containers/layout-rules";
import type { VillageStageProps } from "../containers/village-stage";
import { ProfileSlot } from "../containers/profile-context";

// The season wheel (#547) in its own chunk, as on the boards: its slot keeps its size meanwhile.
const LazySeasonWheel = lazy(() => import("../containers/board-season-wheel"));
// The village's stage (#753): the overlays paint first, the editor, the board and the engine come in their own chunk.
const LazyVillageStage = lazy(() => import("../containers/village-stage"));

export interface HomeVillageSceneProps {
  /** The village shown: the player's own, or a guest's starter village. Undefined: not read yet (the sky alone). */
  village?: VillageLayout;
  /** The own village's read failed: Retry. */
  error?: { message: string; detail?: ErrorDetail } | null;
  /** No wallet: the village shown is a starter one, nothing to edit (Connect is the header's, with the balances). */
  guest?: boolean;
  /** A village to look at, not to edit (a source that does not serve the v2 village yet: a starter one). */
  readOnly?: boolean;
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
  /**
   * The player's PvP standing (`Matchmaker.league`): the crowns and their league by the avatar, a tap to the league page (the
   * home's only way there, #755). None (no PvP played yet, or not read): Unranked with 0 crowns.
   */
  league?: { crowns: number } | null;
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
  /**
   * The stage as the page draws it (its lazy wrapper, which adds the tile art and the 3D canvas), from the props the scene hands
   * the stage. Unset: the scene's own (`VillageStage`), as in the stories and the render tests.
   */
  renderStage?: (stage: VillageStageProps) => ReactNode;
  onPlay?: () => void;
  onMissions?: () => void;
  onChests?: () => void;
  onShop?: () => void;
  onVault?: () => void;
  onLeague?: () => void;
  onSettings?: () => void;
  onResume?: (gameId: number) => void;
  onRetry?: () => void;
  onFound?: () => void;
  onSave?: (tiles: readonly BoardTile[], score: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * Home (`/`, #753): the player's village full screen, a game scene like the boards (the renderer, its camera framed for the
 * screen, the fog, the weather, the day and night, the season dial at the bottom left), with Clash of Clans' overlays inside
 * the safe areas. In view: the avatar, its level ring and name at the top left, the village score and the league badge under it
 * (#755); the balances and the gear at the top right; the right column (Missions, Chests, Shop, Vault, League) with their counts; Play
 * (a hammer, no text), large, at the bottom right with Edit (a pen) beside it; the defence log is the league page's; today's home content as chips (Resume, the spawn pause, a guest's Connect). Edit switches the
 * overlays to the editor's (#739) in the same scene: its bar (Back, the live score, the slots, Reset all held), the inventory and
 * Save, the bubble by the tile in hand (#756); Back with changes asks first. No tab bar: the overlays replace it.
 */
export function HomeVillageScene({ renderStage, ...props }: HomeVillageSceneProps) {
  const { village, guest = false, readOnly = false, founded = true, error, onRetry } = props;
  const editable = !!village && !guest && !readOnly && founded;
  const editing = editable && (props.editing ?? false);
  const stage: VillageStageProps = {
    village,
    editable,
    editing,
    onEditingChange: props.onEditingChange,
    inventory: props.inventory,
    saving: props.saving,
    saved: props.saved,
    refusal: props.refusal,
    refusalDetail: props.refusalDetail,
    tileArt: props.tileArt,
    holdMs: props.holdMs,
    initialDraft: props.initialDraft,
    initialHand: props.initialHand,
    initialPending: props.initialPending,
    initialLeaving: props.initialLeaving,
    renderCanvas: props.renderCanvas,
    onSave: props.onSave,
    onDirtyChange: props.onDirtyChange,
    onDismissSaved: props.onDismissSaved,
    onDismissRefusal: props.onDismissRefusal,
  };
  const edit = () => {
    props.onDismissSaved?.();
    props.onEditingChange?.(true);
  };
  return (
    // A game scene's frame, clipped as the boards' (the dial's ring included). In edit mode it clips vertically only: across, the
    // inventory's carousel clips its own track (its window), and the scene's box clips the canvas.
    <div className={cn("relative flex h-dvh min-h-[32rem] flex-col bg-board text-foreground desktop:flex-row", editing ? "overflow-x-visible overflow-y-clip" : "overflow-hidden")}>
      <h1 className="sr-only">Home</h1>
      {/* The village's stage, its own chunk (the editor, the board, the engine): a placeholder sky until it is in. */}
      <Suspense fallback={SKY}>{renderStage ? renderStage(stage) : <LazyVillageStage {...stage} />}</Suspense>
      {!editing && <ViewOverlays {...props} editable={editable} onEdit={edit} />}
      {error && !village && (
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

/** The sky while the stage's chunk arrives (the stage draws its own while the village is read). */
const SKY = <div aria-hidden className="min-h-0 flex-1 bg-gradient-to-b from-background/40 to-board" />;

/** The view's overlays: the corners, the right column, Play and Edit, the chips. */
function ViewOverlays({ village, editable, onEdit, ...props }: HomeVillageSceneProps & { editable: boolean; onEdit: () => void }) {
  const { activeGame, now, guest, founded = true } = props;
  const crowns = props.league?.crowns ?? 0;
  const standing = leagueOf(crowns);
  return (
    <>
      {/* Top: the avatar and its name at the left, the balances and the gear at the right; the chips below. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-1">
            <ProfileSlot withName />
            {/* By the avatar (#755): the village score, and the crowns and their league, a tap to the league (Unranked before PvP). */}
            <div className="ml-1 flex flex-wrap items-center gap-1.5">
              {village && (
                <span className="flex items-center gap-1.5 rounded-md bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                  <Icon name="house-chimney" size="xs" className="text-primary" />
                  <span className="numeric font-semibold">{formatInteger(village.score)}</span>
                  <span className="sr-only">village score</span>
                </span>
              )}
              <button
                type="button"
                onClick={props.onLeague}
                aria-label={`League: ${standing.name}, ${formatInteger(crowns)} ${crowns === 1 ? "crown" : "crowns"}`}
                className="state-layer flex items-center gap-2 rounded-full border border-border bg-card/90 px-2.5 py-1 backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LeagueCrest league={standing} size="sm" />
                <Crowns value={crowns} size="sm" />
              </button>
            </div>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <BalancesSlot layout="pill" className="desktop:hidden" />
            <BalancesSlot layout="rail" className="hidden desktop:flex" />
            <Button size="icon" variant="outline" onClick={props.onSettings} aria-label="Settings" className="rounded-full bg-card/90 backdrop-blur">
              <Icon name="gear" size="md" />
            </Button>
          </div>
        </div>
        {/* The chips under the avatar, clear of the right column. */}
        <div className="flex flex-col items-start gap-2 pr-[4.75rem] tablet:pr-24">
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
              <span className="numeric hidden text-muted-foreground min-[24.5rem]:inline">{formatPoints(activeGame.score)} pts</span>
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
            // Connect is the header's (the balances' place): the chip says why, once.
            <span role="status" className="pointer-events-auto rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs backdrop-blur">
              Playing as a guest: connect to build your village
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
        {/* League stays beside the badge, on purpose (#755): labelled "League", the badge shows which. */}
        <OverlayButton icon="trophy" label="League" onClick={props.onLeague} />
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
        {village && !guest && !props.readOnly && !founded ? (
          <Button size="lg" variant="outline" className="rounded-full bg-card/90 backdrop-blur" loading={props.founding} onClick={props.onFound}>
            <Icon name="house" size="sm" /> Found
          </Button>
        ) : (
          editable && (
            <Button size="icon" variant="outline" onClick={onEdit} aria-label="Edit village" className="size-14 rounded-full bg-card/90 shadow-lg backdrop-blur">
              <Icon name="pen" size="lg" />
            </Button>
          )
        )}
        {/* Play, the main action (#755): a hammer, no text, gold and large; the tab bar's Play disc takes the same icon. */}
        <Button size="icon" onClick={props.onPlay} aria-label="Play" className="size-16 rounded-2xl shadow-lg tablet:size-18">
          <Icon name="hammer" size="xl" />
        </Button>
      </div>
    </>
  );
}
