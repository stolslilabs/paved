import { Suspense, lazy, useState, type ReactNode } from "react";
import type { BoardTile, GameView } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { type TileArt } from "../elements/tile-chip";
import type { VillageArrival } from "../elements/village-fog";
import { Button } from "../ui/button";
import type { LayoutBoardView } from "../containers/layout-board";
import type { LayoutEditorOptions, LayoutSaved } from "../containers/layout-editor";
import type { Inventory, Spot, VillageLayout } from "../containers/layout-rules";
import type { VillageStageProps } from "../containers/village-stage";
import type { Tab } from "../../routes/pages";
import type { MissionProgress } from "../../data/mission-progress";
import { loadStage } from "./home-village-chunks";
import { ViewOverlays } from "./home-village-overlays";

// The home's overlays, each in its own file beside the scene: the view's (`home-village-overlays.tsx`), its left column
// (`home-village-left-column.tsx`), the dock's band (`home-village-bar.tsx`) and the overlays' measures (`home-village-measures.ts`).
export { HOME_BALANCES } from "./home-village-overlays";

// The village's stage (#753, its loader in `home-village-chunks.ts`, shared with the left column's hint and the Camera button).
const LazyVillageStage = lazy(loadStage);

/** What waits on each social page (#973), for the home's three buttons (`HomeVillageSceneProps`' `chat`, `guild` and `friends`). */
export type SocialCounts = Readonly<Record<"chat" | "guild" | "friends", number>>;

export interface HomeVillageSceneProps extends Pick<LayoutEditorOptions, "randomizer" | "randomSeed" | "slowRollMs" | "initialRolling"> {
  /** The village shown: the player's own, or a starter village (a source that does not serve it yet). Undefined: not read yet (the sky alone). */
  village?: VillageLayout;
  /** The own village's read failed: Retry. */
  error?: { message: string; detail?: ErrorDetail } | null;
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
  /**
   * The save on its way; the last save landed (its score and the one before, until edit mode opens again): back in view, the
   * village score's total counts to it once (#802), and a polite message says it; the save's refusal.
   */
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
  /** Where the stories start: in edit mode, the editor's points unfolded (#758), a line lit (its structure's key). */
  initialPointsOpen?: boolean;
  initialLit?: string | null;
  /** Where the stories start: in the Camera mode (#875), once the 3D village is drawn. */
  initialCamera?: boolean;
  /** Missions to claim: the right column's badge (Missions). */
  missions?: number;
  /** Today's first daily mission not done (HOME-EDGES): its tab above the dock, at the left; none, no tab. */
  mission?: MissionProgress | null;
  /**
   * What waits on the social pages (#973, in place of the Social page's total, #952), each on its own button: on Chat the guild's
   * and the private unread messages and the requests (#955, the World never counts); on Guild the invitations of a player in no
   * guild, the unread announcements and, for officers and the leader, the requests (#953); on Friends the new followers (#954).
   * None counted (a guest, or not read yet): 0.
   */
  chat?: number;
  guild?: number;
  friends?: number;
  /** The viewer's Challenge game still running: the Resume chip. */
  activeGame?: GameView | null;
  /**
   * The player's PvP standing (`Matchmaker.league`): the crowns and their league's crest in the League control under the profile
   * (#829), a tap to the League page (the home's only way there, #755): Unranked's crest (#917) before any crown and any attack
   * settled. None (not read, or no PvP on the network): Wood with 0 crowns.
   */
  league?: { crowns: number; attacks?: number } | null;
  /**
   * The village's shield's end (`Matchmaker.shield`: `until` while `up`, seconds since the epoch), the League page's read: the
   * shield's mirrored plate and its `HHhMMm` under the League control while it lasts (#806, #829). Null without a shield, for a
   * guest or while not read.
   */
  shieldEndsAt?: number | null;
  /** `Challenge.spawn_paused`: the notice. */
  spawnPaused?: boolean;
  now: number;
  /**
   * The village in 3D (the board's renderer, given by the page): drawn from the editor's state. Without it the scene draws the
   * plan view (`LayoutBoard`), as where WebGL is missing and in the render tests.
   */
  renderCanvas?: (view: LayoutBoardView, onDrawn: () => void) => ReactNode;
  /** With `renderCanvas`: the 3D village arrives under a fog that clears once it is drawn, or with a short fade (#761). */
  arrival?: VillageArrival;
  /**
   * The stage as the page draws it (its lazy wrapper, which adds the tile art and the 3D canvas), from the props the scene hands
   * the stage. Unset: the scene's own (`VillageStage`), as in the stories and the render tests.
   */
  renderStage?: (stage: VillageStageProps) => ReactNode;
  onPlay?: () => void;
  onChat?: () => void;
  onGuild?: () => void;
  onFriends?: () => void;
  onMissions?: () => void;
  onShop?: () => void;
  onVault?: () => void;
  /** The right column's Tiles (HOME-EDGES): the player's tiles. */
  onTiles?: () => void;
  onLeague?: () => void;
  onSettings?: () => void;
  /** A pick in the phone's bar (#763): Shop, Chests, Play, League or Settings, as the overlay's buttons lead. */
  onNavigate?: (tab: Tab) => void;
  onResume?: (gameId: number) => void;
  onRetry?: () => void;
  onFound?: () => void;
  /** Save the draft into `slot` (the active one shown, #804; unset without the saved layouts). */
  onSave?: (tiles: readonly BoardTile[], score: number, slot?: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * Home (`/`, #753): the player's village full screen, a game scene like the boards (the renderer, its camera framed for the
 * screen, the fog, the weather, the day and night), with Clash of Clans' overlays inside
 * the safe areas. In view: at the top left the profile (#787, #830: the avatar in the level's arc and line, "Lv i", the name), under it the League control (#829:
 * the crowns' capsule, the crown capping it), the village score (#755, a capsule whose tap opens edit mode since HOME-UI-CAPSULES),
 * then the shield's capsule while shielded, those stacked at the top,
 * 24 px under the profile (#929), above the Chat tab; the balances at the top right; today's home content as chips (Resume, the
 * spawn pause); the defence log is the league page's. HOME-EDGES (the owner's asks of 2026-11-04, the Paved UX
 * Book's main screen), at every width: the right column's four tiles (Missions, Vault, Friends, Tiles) with their counts,
 * centred under the balances; at the bottom left the Chat tab on the screen's edge and the mission in
 * progress, just above the dock; no Edit button (the village score's capsule opens edit mode). Edit mode switches the
 * overlays to the editor's (#739) in the same scene, after the Paved UX Book's "Edit my village" (EDIT-VILLAGE): its bar (Back, the
 * title, the die, Erase held, Save, Use; from `desktop` the side menu's band), the points at the top left, its panel (a phone's bottom
 * sheet, a side menu from `tablet`: the layouts' carousel above the inventory), the tile's actions by the tile in hand (#756); Back
 * with changes asks first. A long press on a tile of the village opens edit mode
 * too, through a bubble by the tile with Edit and the hold's ring (LONGPRESS-EDIT, #799, the stage's `onEdit`).
 * The dock (#763, HOME-DOCK: Shop, Chests with its count, Play, Guild, Settings; no item current) at every width; the bottom
 * overlays sit above it (its measured `--app-nav-h`). Edit mode has no dock: the editor's panel takes the bottom.
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` each button opens its page in a side panel on the right,
 * over the village, which stays in view (`routes/home-layout.tsx`); the profile opens on the left.
 * CAMERA-MODE (#875, the owner's decisions of 2026-10-28): on the 3D village in view, a button at the bottom right (Explore since
 * CAMERA-EXPLORE) frees the camera (the tilt from 15 to 85 degrees, the turn all the way round, gliding); the overlays leave the screen
 * by their nearest edges in three waves (CAMERA-EXPLORE, the owner's asks of 2026-11-04: the profile and the balances too), all but
 * Exit, in the screen's corner, which eases the camera back to the play view and brings them back in the reverse order.
 */
export function HomeVillageScene({ renderStage, ...props }: HomeVillageSceneProps) {
  const { village, readOnly = false, founded = true, error, onRetry } = props;
  const editable = !!village && !readOnly && founded;
  const editing = editable && (props.editing ?? false);
  // The Camera mode (#875, open point 1: the home's village in view only): the 3D village's camera free, the overlays gone but Exit
  // (open point 2; CAMERA-EXPLORE). Only while the stage draws the 3D village (`onCanvasChange`).
  const [cameraAsked, setCamera] = useState(props.initialCamera ?? false);
  const [canvas, setCanvas] = useState(false);
  const camera = cameraAsked && canvas;
  const edit = () => {
    setCamera(false);
    props.onDismissSaved?.();
    props.onEditingChange?.(true);
  };
  const stage: VillageStageProps = {
    village,
    editable,
    editing,
    onEditingChange: props.onEditingChange,
    onEdit: editable && !editing ? edit : undefined,
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
    initialPointsOpen: editing ? props.initialPointsOpen : undefined,
    initialLit: editing ? props.initialLit : undefined,
    renderCanvas: props.renderCanvas,
    camera,
    onCanvasChange: setCanvas,
    arrival: props.arrival,
    onSave: props.onSave,
    onDirtyChange: props.onDirtyChange,
    onDismissSaved: props.onDismissSaved,
    onDismissRefusal: props.onDismissRefusal,
    randomizer: props.randomizer,
    randomSeed: props.randomSeed,
    slowRollMs: props.slowRollMs,
    initialRolling: props.initialRolling,
  };
  return (
    // A game scene's frame, clipped as the boards'. In edit mode it clips vertically only: across, the
    // inventory's carousel clips its own track (its window), and the scene's box clips the canvas.
    <div className={cn("relative flex h-dvh min-h-[32rem] flex-col bg-board text-foreground desktop:flex-row", editing ? "overflow-x-visible overflow-y-clip" : "overflow-hidden")}>
      <h1 className="sr-only">Home</h1>
      {/* The save's word for assistive technology (#802), once edit mode has closed: the region stays, so the change is read. */}
      <p role="status" className="sr-only">
        {props.saved && !editing ? `Village saved: score ${formatInteger(props.saved.score)}` : ""}
      </p>
      {/* The village's stage, its own chunk (the editor, the board, the engine): a placeholder sky until it is in. */}
      <Suspense fallback={SKY}>{renderStage ? renderStage(stage) : <LazyVillageStage {...stage} />}</Suspense>
      {!editing && (
        <ViewOverlays
          {...props}
          editable={editable}
          onEdit={edit}
          camera={camera}
          onCameraChange={canvas ? setCamera : undefined}
        />
      )}
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
