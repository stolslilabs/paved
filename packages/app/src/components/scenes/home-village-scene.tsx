import { Suspense, lazy, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BoardTile, GameView } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import type { BoardWheel } from "../../data/board-settings";
import { cn } from "../../lib/utils";
import { Countdown } from "../elements/countdown";
import { GameIcon } from "../elements/game-icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { formatPoints } from "../elements/score";
import { type TileArt } from "../elements/tile-chip";
import type { VillageArrival } from "../elements/village-fog";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { OverlayButton } from "../containers/home-overlays";
import type { LayoutBoardView } from "../containers/layout-board";
import type { LayoutEditorOptions, LayoutSaved } from "../containers/layout-editor";
import type { Inventory, Spot, VillageLayout } from "../containers/layout-rules";
import type { VillageStageProps } from "../containers/village-stage";
import { PlayerBadge } from "../containers/player-badge";
import { VillageScore } from "../containers/village-score";
import type { Tab } from "../../routes/pages";

// The season wheel (#547) in its own chunk, as on the boards: its slot keeps its size meanwhile.
const LazySeasonWheel = lazy(() => import("../containers/board-season-wheel"));
// The app's bar (#763) in its own chunk, shared with the tab pages: the home's first load stays as it was; a stand-in of its size
// holds its place meanwhile.
const LazyAppNav = lazy(() => import("../containers/app-nav").then((m) => ({ default: m.AppNav })));
// The village's stage (#753): the overlays paint first, the editor, the board and the engine come in their own chunk. One import for
// its three uses (the stage, the left column's hint, the Camera button), so the first load names the chunk's files once.
const loadStage = () => import("../containers/village-stage");
const LazyVillageStage = lazy(loadStage);
// The League control (#829) and its plate in their own chunk: a stand-in of its height holds its place meanwhile (FIRST-LOAD).
const LazyLeagueControl = lazy(() => import("../containers/league-control").then((m) => ({ default: m.LeagueControl })));
// The shield's plate and its popover (#806, #829): their own chunk, loaded only while the village is shielded (FIRST-LOAD).
const LazyShieldPlate = lazy(() => import("../elements/shield-plate").then((m) => ({ default: m.ShieldPlate })));
// The Camera mode's button and its hint (#875), with the camera's icon: the stage's chunk carries them (FIRST-LOAD), and the button
// shows with the 3D village it draws, at Edit's left (nothing moves as it comes).
const LazyCameraControl = lazy(() => loadStage().then((m) => ({ default: m.CameraControl })));

export interface HomeVillageSceneProps extends Pick<LayoutEditorOptions, "randomizer" | "randomSeed" | "slowRollMs" | "initialRolling"> {
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
  /**
   * The village score's accordion unfolded as the home opens (#831): the device's last choice (the page keeps it, open point 2).
   * Default: folded. Each fold or unfold tells `onScoreOpenChange`.
   */
  initialScoreOpen?: boolean;
  onScoreOpenChange?: (open: boolean) => void;
  /** Where the stories start: in the Camera mode (#875), once the 3D village is drawn. */
  initialCamera?: boolean;
  /** Chests waiting, missions to claim: the badges of the right column (and of the phone's bar, Chests). */
  chests?: number;
  missions?: number;
  /** The viewer's Challenge game still running: the Resume chip. */
  activeGame?: GameView | null;
  /**
   * The player's PvP standing (`Matchmaker.league`): the crowns and their league's crest in the League control under the profile
   * (#829), a tap to the League page (the home's only way there, #755). None (no PvP played yet, or not read): Wood with 0 crowns.
   */
  league?: { crowns: number } | null;
  /**
   * The village's shield's end (`Matchmaker.shield`: `until` while `up`, seconds since the epoch), the League page's read: the
   * shield's mirrored plate and its `HHhMMm` under the League control while it lasts (#806, #829). Null without a shield, for a
   * guest or while not read.
   */
  shieldEndsAt?: number | null;
  /** `Challenge.spawn_paused`: the notice. */
  spawnPaused?: boolean;
  now: number;
  /** The season wheel of the scene (`useBoardSettings`); none: no wheel. */
  seasonWheel?: BoardWheel;
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
  onMissions?: () => void;
  onChests?: () => void;
  onShop?: () => void;
  onVault?: () => void;
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
 * screen, the fog, the weather, the day and night, the season dial at the bottom left), with Clash of Clans' overlays inside
 * the safe areas. In view: at the top left the profile (#787, #830: the avatar in the level's arc and line, "Lv i", the name), under it the League control (#829:
 * the League button, the crowns on a plate closed by the league's crest), the shield's mirrored plate while shielded, then the
 * village score (#755), an inline accordion (#831: the total, a tap unfolds the four kinds' sums in place), those stacked at the top,
 * 24 px under the profile (#929), above the season dial; the balances at the top right; the right column (Missions, Chests, Shop,
 * Vault) with their counts, centred vertically (#856); Play (the two swords, no text, #807), large, at the bottom right with Settings above it and Edit
 * (a hammer) beside it; the defence log is the league page's; today's home content as chips (Resume, the spawn pause, a guest's Connect). Edit switches the
 * overlays to the editor's (#739) in the same scene: its bar (Back, the live score, the slots, Reset all held), the inventory and
 * Save, the bubble by the tile in hand (#756); Back with changes asks first. A long press on a tile of the village opens edit mode
 * too, through a bubble by the tile with Edit and the hold's ring (LONGPRESS-EDIT, #799, the stage's `onEdit`).
 * PHONE-NAV (#763, the owner's decisions of 2026-10-25): below `desktop` the view has the app's bottom bar again (Shop, Chests
 * with its count, Play, League, Settings; no item current), so there is no right column (#929: Missions and Vault are the left
 * column's, under the village score, before the chips), and the gear and the
 * large Play go (the bar's Settings and centre disc); Edit and the season dial sit above the bar (its measured `--app-nav-h`).
 * Edit mode has no bar: the editor's panel takes the bottom.
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the navigation is this overlay, with no bar and no
 * header: the column of four (Missions, Chests, Shop, Vault; no League since #856, the League control is the way), Settings and Play. Each
 * opens its page in a side panel on the right, over the village, which stays in view (`routes/home-layout.tsx`); the profile
 * opens on the left.
 * CAMERA-MODE (#875, the owner's decisions of 2026-10-28): on the 3D village in view, a Camera button at Edit's left frees the
 * camera (the tilt from 15 to 85 degrees, the turn all the way round, gliding); the overlays fade to the profile, the balances and
 * Exit camera, which eases the camera back to the play view.
 */
export function HomeVillageScene({ renderStage, ...props }: HomeVillageSceneProps) {
  const { village, guest = false, readOnly = false, founded = true, error, onRetry } = props;
  const editable = !!village && !guest && !readOnly && founded;
  const editing = editable && (props.editing ?? false);
  // The village score's accordion (#831): kept here, so edit mode (which takes the view's overlays) leaves it as it was.
  const { onScoreOpenChange } = props;
  const [scoreOpen, setScoreOpen] = useState(props.initialScoreOpen ?? false);
  const foldScore = (open: boolean) => {
    setScoreOpen(open);
    onScoreOpenChange?.(open);
  };
  // The Camera mode (#875, open point 1: the home's village in view only): the 3D village's camera free, the overlays faded to the
  // profile, the balances and Exit camera (open point 2). Only while the stage draws the 3D village (`onCanvasChange`).
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
    // A game scene's frame, clipped as the boards' (the dial's ring included). In edit mode it clips vertically only: across, the
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
          scoreOpen={scoreOpen}
          onScoreOpenChange={foldScore}
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

/** The League control's box while its chunk arrives (its 44 px touch height at every width): nothing under it moves when it comes. */
const LEAGUE_STAND_IN = <span aria-hidden className="block h-11" />;

/** The sky while the stage's chunk arrives (the stage draws its own while the village is read). */
const SKY = <div aria-hidden className="min-h-0 flex-1 bg-gradient-to-b from-background/40 to-board" />;

/** The bottom overlays' place: 8 px above the bar below `desktop` (its height, measured before the first paint), the scene's foot from it. */
const ABOVE_BAR = "bottom-[calc(var(--app-nav-h)+0.5rem)] desktop:bottom-4";

/**
 * The home's bar below `desktop` (#763), fixed at the viewport's bottom, its height on the scene (`--app-nav-h`) for the bottom
 * overlays. While the bar's chunk loads, a stand-in of its box (`AppNav`'s sizes below `desktop`) holds its place, so nothing
 * above it moves when it comes.
 */
function HomeBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => el.parentElement!.style.setProperty("--app-nav-h", `${el.offsetHeight}px`);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  // The bar's box: its items' height, its padding and its top border; empty, so nothing for assistive technology.
  const standIn = <div className="box-content h-11 border-t bg-background/95 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] mobile:h-13" />;
  return (
    <div ref={ref} data-fade className="fixed inset-x-0 bottom-0 z-20 desktop:hidden">
      <Suspense fallback={standIn}>{children}</Suspense>
    </div>
  );
}

/**
 * The left column's edge hint (NO-SCROLLBARS, #609; HOME-OVERLAYS, #856): `ScrollRegion`'s, attached once the stage's chunk, which
 * carries it already (its plan and inventory scroll), is in: nothing more on the first load (FIRST-LOAD), and the column is the
 * same box from the first paint (it scrolls meanwhile, without the fade).
 */
function leftColumnHint(el: HTMLDivElement) {
  let off: (() => void) | undefined;
  let gone = false;
  void loadStage().then((m) => {
    if (!gone) off = m.scrollHintRef(el);
  });
  return () => {
    gone = true;
    off?.();
  };
}

/** The gap of both columns' buttons and of the bands' edges (#856), 12 px. */
const GAP_PX = 12;

/**
 * The overlays' measures, on their box. The profile beside the balances' first plate needs none since #928: the badge is at most
 * 1.5 times the avatar, so it stops short of the plate whatever the amounts (a 999,999 Cobbles plate at 320 px, #828).
 * HOME-OVERLAYS (#856, the owner's decisions of 2026-10-28): the bands of the two columns, a gap off their neighbours as they are drawn: the right one from under the
 * balances to above Edit (Settings and Play from `desktop`), the left one (the issue's second open point) from under the profile to
 * above the season dial (without it, the bottom row's foot, above the bar). HOME-STACK (#929, open point 1): the left band starts
 * twice the gap, 24 px, under the profile.
 */
function useOverlayMeasures(dial: boolean) {
  const refs = {
    box: useRef<HTMLDivElement>(null),
    balances: useRef<HTMLDivElement>(null),
    profile: useRef<HTMLDivElement>(null),
    actions: useRef<HTMLDivElement>(null),
    dial: useRef<HTMLDivElement>(null),
  };
  useLayoutEffect(() => {
    const els = [refs.box, refs.balances, refs.profile, refs.actions, refs.dial].map((ref) => ref.current);
    const [box] = els as HTMLElement[];
    // Its first notice comes before the first paint: the bands are in place when the overlays show.
    const observer = new ResizeObserver(() => {
      const [frame, balances, profile, foot, wheel] = els.map((el) => el?.getBoundingClientRect()) as DOMRect[];
      const edges = {
        "--right-top": balances!.bottom - frame!.top,
        "--right-bottom": frame!.bottom - foot!.top,
        "--left-top": profile!.bottom - frame!.top + GAP_PX,
        "--left-bottom": frame!.bottom - (wheel?.top ?? foot!.bottom),
      };
      for (const [name, px] of Object.entries(edges)) box.style.setProperty(name, `${px + GAP_PX}px`);
    });
    // The box and what the bands stand off (not the columns, which the bands size).
    for (const el of els) if (el) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs are stable; the dial comes and goes with the scene's wheel
  }, [dial]);
  return refs;
}

/**
 * The home's own set (#855): the Cobbles, PAVED, and vPAVED while held; no USDC. The home draws it at every width, also under a
 * panel's page, so it names it itself: the rule's row for the home (`routes/header-balances.ts`, checked equal by
 * header-balances.test), kept out of this chunk with the rest of the rule, which the first screen does not need.
 */
export const HOME_BALANCES: readonly ShownBalance[] = ["cobbles", "paved", "vpaved-held"];

/**
 * BALANCES-BY-PAGE (#855, the issue's second open point): below `desktop` the home's stack is the Cobbles, PAVED and vPAVED one under
 * the other, unless its widest plate does not fit beside the League control in the left column: then the Cobbles stand alone
 * (`beside`, `Balances`).
 */
const BESIDE_LEAGUE = ["[data-slot=home-overlays]", "[data-slot=league-control]"] as const;

/**
 * The right column, from `desktop` only, over Play, centred vertically in its band (#856): Missions, Chests, Shop and Vault, with
 * no League (#856: the League control on the left is the way in). On a short window its buttons wrap into a second column, to the
 * left, instead of running under Play. Below `desktop` there is none (#929): Chests and Shop are the bar's (#763), Missions and
 * Vault the left column's.
 */
function VillageNav(props: HomeVillageSceneProps) {
  return (
    <nav
      aria-label="Village"
      className={cn(
        // Centred in its band (`justify-center-safe`: taller than the band, it starts at the band's top, never over the balances).
        "pointer-events-none absolute top-(--right-top) right-3 bottom-(--right-bottom) hidden flex-col flex-wrap-reverse content-start items-center justify-center-safe gap-3 desktop:flex [&>*]:pointer-events-auto",
      )}
    >
      <OverlayButton icon="scroll" label="Missions" badge={props.missions} onClick={props.onMissions} />
      <OverlayButton icon="treasure-chest" label="Chests" badge={props.chests} onClick={props.onChests} />
      <OverlayButton icon="store" label="Shop" onClick={props.onShop} />
      <OverlayButton icon="piggy-bank" label="Vault" onClick={props.onVault} />
    </nav>
  );
}

/** The view's overlays: the corners, the two columns, Play, Settings and Edit, the chips. */
function ViewOverlays({
  village,
  editable,
  onEdit,
  scoreOpen,
  onScoreOpenChange,
  camera,
  onCameraChange,
  ...props
}: HomeVillageSceneProps & {
  editable: boolean;
  onEdit: () => void;
  scoreOpen: boolean;
  onScoreOpenChange: (open: boolean) => void;
  /** The Camera mode on (#875); its button, while the stage draws the 3D village. */
  camera: boolean;
  onCameraChange?: (camera: boolean) => void;
}) {
  const { activeGame, now, guest, founded = true } = props;
  // The score just saved, until the village's read has it too.
  const shown = props.saved?.score ?? village?.score ?? 0;
  const measures = useOverlayMeasures(!!props.seasonWheel);
  // The left column's controls (#829, #856).
  const leftColumn = (
    <>
      {/* The League control (the crowns and the crest, no name) and the shield's plate (#829). */}
      <Suspense fallback={LEAGUE_STAND_IN}>
        <LazyLeagueControl crowns={props.league?.crowns ?? 0} onLeague={props.onLeague} />
      </Suspense>
      {props.shieldEndsAt != null && props.shieldEndsAt > now && (
        <Suspense fallback={null}>
          <LazyShieldPlate endsAt={props.shieldEndsAt} now={now} />
        </Suspense>
      )}
      {village && (
        // Under it (#755), the village score (#831): the total, a tap unfolds the four kinds' sums in place.
        <VillageScore score={shown} tiles={village.tiles} saved={props.saved} open={scoreOpen} onOpenChange={onScoreOpenChange} className="ml-1" />
      )}
      {/*
        HOME-STACK (#929, the owner's decisions of 2026-10-30): below `desktop`, Missions and Vault under the village score and before
        the chips (open point 2), one under the other and aligned left (open point 3), the right column's look; from it, the right
        column's.
      */}
      <OverlayButton icon="scroll" label="Missions" badge={props.missions} onClick={props.onMissions} className="desktop:hidden" />
      <OverlayButton icon="piggy-bank" label="Vault" onClick={props.onVault} className="desktop:hidden" />
      {/* The chips, in the same column (#856), clear of the right column. */}
      <>
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
      </>
    </>
  );
  return (
    // The overlays' box (the scene's): the top row's measures and the bar's height are set on it, for the columns and the bottom.
    // In the Camera mode (`data-camera`, #875's open point 2) all but the profile, the balances and Exit camera fade out (`data-fade`,
    // theme.css), out of reach once faded.
    <div ref={measures.box} data-slot="home-overlays" data-camera={camera || undefined} className="pointer-events-none absolute inset-0">
      {/* Top: the profile at the left, the balances at the right. */}
      <div className="absolute inset-x-0 top-0 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <div className="relative flex items-start justify-between gap-2">
          <div
            ref={measures.profile}
            className="pointer-events-auto min-w-0"
          >
            {/* The profile (#787), the season dial's size (#856). */}
            <PlayerBadge />
          </div>
          {/*
            The home's own balances (#855: the Cobbles, PAVED, vPAVED while held; no USDC) at the top right, the same under a
            panel's page: below `desktop` the phone's plates one under the other (#828), from it the larger ones in a row (#856).
            Out of the row's flow: only the profile's line stands beside them, so at 320 px the badge keeps its whole width.
          */}
          <div ref={measures.balances} className="pointer-events-auto absolute top-0 right-0 flex items-start">
            <div data-slot="home-phone-balances" className="relative desktop:hidden">
              <BalancesSlot layout="pill" kinds={HOME_BALANCES} direction="column" beside={BESIDE_LEAGUE} />
            </div>
            <BalancesSlot layout="rail" kinds={HOME_BALANCES} direction="row" className="hidden desktop:flex" />
          </div>
        </div>
      </div>
      {/* The columns and the dial, which the Camera mode fades as one: the box's frame, so they stand as in it. */}
      <div data-fade className="absolute inset-0">
        <VillageNav {...props} />
        {/*
          The left column under the profile (#829), from its band's top, 24 px under it (#929, which revises #856's centring), above the dial;
          from `desktop` clear of the right column, below it (no right column) to the scene's edge. Taller than its band (the score
          unfolded while shielded, on a short screen), it scrolls within it (its edge fading where more waits), never over the dial;
          its padding keeps the controls' shadows inside the scroll box.
        */}
        <div
          ref={leftColumnHint}
          data-slot="scroll-region"
          className="scroll-hint absolute top-(--left-top) right-2 bottom-(--left-bottom) left-0 flex flex-col items-start gap-3 overflow-y-auto overscroll-contain pl-2 tablet:right-4 tablet:pl-4 desktop:right-24 [&>*]:pointer-events-auto"
        >
          {leftColumn}
        </div>

        {/* The bottom: the season dial at the left, Found or Edit and Play at the right. */}
        {props.seasonWheel && (
          <div ref={measures.dial} data-dial-place className={cn("absolute left-2 tablet:left-4", ABOVE_BAR)}>
            <Suspense fallback={<span aria-hidden className="block size-24 min-[24.375rem]:size-27 tablet:size-36" />}>
              <LazySeasonWheel state={props.seasonWheel.state} onNext={props.seasonWheel.onNext} read={props.seasonWheel.read} />
            </Suspense>
          </div>
        )}
      </div>
      <div ref={measures.actions} className={cn("absolute right-2 flex items-end gap-2 tablet:right-4 desktop:gap-4", ABOVE_BAR, props.seasonWheel && "left-28 justify-end min-[24.375rem]:left-31 tablet:left-44")}>
        {/*
          The Camera mode's button (#875), Edit's size at its left; in the mode, Exit camera and the controls' hint, in the corner: Edit,
          Found, Settings and Play leave the row (`data-collapse`).
        */}
        {onCameraChange && (
          <Suspense fallback={null}>
            <LazyCameraControl on={camera} onChange={onCameraChange} />
          </Suspense>
        )}
        {village && !guest && !props.readOnly && !founded ? (
          <Button size="lg" variant="outline" data-collapse className="rounded-full bg-card/90 backdrop-blur" loading={props.founding} onClick={props.onFound}>
            <GameIcon name="house-tree" size="sm" /> Found
          </Button>
        ) : (
          editable && (
            <Button size="icon" variant="outline" onClick={onEdit} aria-label="Edit village" data-collapse className="size-14 rounded-full bg-card/90 shadow-lg backdrop-blur">
              <GameIcon name="hammer" size="lg" />
            </Button>
          )
        )}
        {/*
          From `desktop` (below it both are the bar's, #763): Settings above Play, right-aligned, Edit's size (#856); Play, the main
          action (#755, #807), the two swords, no text, gold and large.
        */}
        <div data-collapse className="hidden flex-col items-end gap-3 desktop:flex">
          <Button size="icon" variant="outline" onClick={props.onSettings} aria-label="Settings" className="size-14 rounded-full bg-card/90 shadow-lg backdrop-blur">
            <GameIcon name="gear" size="lg" />
          </Button>
          <Button size="icon" onClick={props.onPlay} aria-label="Play" className="size-16 rounded-2xl shadow-lg tablet:size-18">
            <GameIcon name="swords" size="xl" />
          </Button>
        </div>
      </div>
      {/* The app's bar below `desktop` (#763): its height on the scene (`--app-nav-h`), which the bottom overlays clear. */}
      <HomeBar>
        <LazyAppNav active={null} badges={{ chests: props.chests }} onNavigate={props.onNavigate} className="relative" />
      </HomeBar>
    </div>
  );
}
