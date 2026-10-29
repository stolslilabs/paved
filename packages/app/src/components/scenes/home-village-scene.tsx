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
import { BalancesSlot, HOME_BALANCES } from "../containers/balances-context";
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
// The village's stage (#753): the overlays paint first, the editor, the board and the engine come in their own chunk.
const LazyVillageStage = lazy(() => import("../containers/village-stage"));
// The League control (#829) and its plate in their own chunk: a stand-in of its height holds its place meanwhile (FIRST-LOAD).
const LazyLeagueControl = lazy(() => import("../containers/league-control").then((m) => ({ default: m.LeagueControl })));
// The shield's plate and its popover (#806, #829): their own chunk, loaded only while the village is shielded (FIRST-LOAD).
const LazyShieldPlate = lazy(() => import("../elements/shield-plate").then((m) => ({ default: m.ShieldPlate })));

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
  /** Chests waiting, missions to claim: the badges of the right column (and of the phone's bar, Chests). */
  chests?: number;
  missions?: number;
  /** The viewer's Challenge game still running: the Resume chip. */
  activeGame?: GameView | null;
  /**
   * The player's PvP standing (`Matchmaker.league`): the crowns and their league's crest in the League control under the profile
   * (#829), a tap to the League page (the home's only way there, #755). None (no PvP played yet, or not read): Wanderer with 0 crowns.
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
 * village score (#755), an inline accordion (#831: the total, a tap unfolds the four kinds' sums in place); the balances and the gear at the top right; the right column (Missions, Chests, Shop, Vault, League) with their counts; Play
 * (the two swords, no text, #807), large, at the bottom right with Edit (a hammer) beside it; the defence log is the league page's; today's home content as chips (Resume, the spawn pause, a guest's Connect). Edit switches the
 * overlays to the editor's (#739) in the same scene: its bar (Back, the live score, the slots, Reset all held), the inventory and
 * Save, the bubble by the tile in hand (#756); Back with changes asks first. A long press on a tile of the village opens edit mode
 * too, through a bubble by the tile with Edit and the hold's ring (LONGPRESS-EDIT, #799, the stage's `onEdit`).
 * PHONE-NAV (#763, the owner's decisions of 2026-10-25): below `desktop` the view has the app's bottom bar again (Shop, Chests
 * with its count, Play, League, Settings; no item current), so the right column keeps Missions and Vault, and the gear and the
 * large Play go (the bar's Settings and centre disc); Edit and the season dial sit above the bar (its measured `--app-nav-h`).
 * Edit mode has no bar: the editor's panel takes the bottom.
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the navigation is this overlay, with no bar and no
 * header: the column of five (Missions, Chests, Shop, Vault, League; League beside the badge on purpose), the gear and Play. Each
 * opens its page in a side panel on the right, over the village, which stays in view (`routes/home-layout.tsx`); the profile
 * opens on the left.
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
  const edit = () => {
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

/** The right column's buttons whose place is the bar below `desktop` (#763). */
const BAR_ONLY_BELOW_DESKTOP = "hidden desktop:flex";
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
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-20 desktop:hidden">
      <Suspense fallback={standIn}>{children}</Suspense>
    </div>
  );
}

/**
 * The balances' width at the home's top right, as `--balances-w` on the top row: the plates stand out of the row's flow (#828), and
 * the profile's line beside them stops short of them whatever the amounts (a 999,999 Cobbles plate at 320 px).
 */
function useBalancesWidth() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cell = ref.current;
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const write = () => row.style.setProperty("--balances-w", `${cell.offsetWidth}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(cell);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * BALANCES-BY-PAGE (#855, the issue's second open point): below `desktop` the home's stack is the Cobbles, PAVED and vPAVED one under
 * the other, unless it would crowd the overlay: when its widest plate (a large PAVED balance) does not fit beside the League control
 * under the profile, the Cobbles stand alone (`data-crowded`, its rule in theme.css). The other plates leave the flow, hidden, but
 * keep their width, so the measure does not change with the answer. Their amounts stay on the Vault, a tap away.
 */
function useCrowdedStack() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stack = ref.current;
    const row = stack?.closest<HTMLElement>("[data-slot=home-top-row]");
    if (!stack || !row) return;
    const sizes = new ResizeObserver(() => {
      const plates = [...stack.querySelectorAll<HTMLElement>("[data-kind]")];
      const league = row.querySelector("[data-slot=league-control]");
      // A plate's width follows its amount: each is watched once it has arrived (the stack grows as they do). An 8 px gap.
      for (const plate of plates) sizes.observe(plate);
      const free = league ? row.getBoundingClientRect().right - league.getBoundingClientRect().right - 8 : Infinity;
      stack.toggleAttribute("data-crowded", plates.length > 1 && Math.max(...plates.map((plate) => plate.offsetWidth)) > free);
    });
    // The row, the stack as its plates arrive, and the left column as the League control does (their own chunks).
    for (const box of [row, stack, row.firstElementChild!]) sizes.observe(box);
    return () => sizes.disconnect();
  }, []);
  return ref;
}

/**
 * The right column, over Play: under the balances (#828), as far down as the stack reaches, and never above 5.5 rem from the
 * screen's top (5 rem in the top row's padding from `tablet`), where it stood before the stack. From `desktop` it stops above Play
 * (the top row's 1 rem, its own top, Play's 4.5 rem, its 1 rem margin and a 0.5 rem gap): on a short window its buttons wrap into
 * a second column, to the left, instead of running under Play.
 */
function VillageNav(props: HomeVillageSceneProps) {
  return (
    <nav
      aria-label="Village"
      className="absolute top-[max(calc(100%+0.5rem),5.5rem)] -right-1 flex flex-col items-center gap-1.5 tablet:top-[max(calc(100%+0.5rem),5rem)] tablet:gap-2.5 desktop:max-h-[calc(100dvh-max(100%+0.5rem,5rem)-7rem)] desktop:flex-wrap-reverse desktop:content-start"
    >
      <OverlayButton icon="scroll" label="Missions" badge={props.missions} onClick={props.onMissions} />
      {/* Below `desktop` Chests, Shop and League are the bar's (#763): the column keeps Missions and Vault. */}
      <OverlayButton icon="gift" label="Chests" badge={props.chests} onClick={props.onChests} className={BAR_ONLY_BELOW_DESKTOP} />
      <OverlayButton icon="store" label="Shop" onClick={props.onShop} className={BAR_ONLY_BELOW_DESKTOP} />
      <OverlayButton icon="piggy-bank" label="Vault" onClick={props.onVault} />
      {/* League stays beside the badge, on purpose (#755): labelled "League", the badge shows which. */}
      <OverlayButton icon="trophy" label="League" onClick={props.onLeague} className={BAR_ONLY_BELOW_DESKTOP} />
    </nav>
  );
}

/** The view's overlays: the corners, the right column, Play and Edit, the chips. */
function ViewOverlays({
  village,
  editable,
  onEdit,
  scoreOpen,
  onScoreOpenChange,
  ...props
}: HomeVillageSceneProps & { editable: boolean; onEdit: () => void; scoreOpen: boolean; onScoreOpenChange: (open: boolean) => void }) {
  const { activeGame, now, guest, founded = true } = props;
  // The score just saved, until the village's read has it too.
  const shown = props.saved?.score ?? village?.score ?? 0;
  const balancesRef = useBalancesWidth();
  const stackRef = useCrowdedStack();
  return (
    <>
      {/* Top: the avatar and its name at the left, the balances and the gear at the right; the chips below. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <div data-slot="home-top-row" className="relative flex items-start justify-between gap-2">
          <div
            className={cn(
              "pointer-events-auto flex max-w-[calc(100%-4.75rem)] min-w-0 flex-col items-start gap-1 tablet:max-w-[calc(100%-6rem)]",
              // The profile's line gives way to the balances beside it (`--balances-w`): its name column and the level's line narrow, never under a wide plate.
              "[&_[data-slot=player-badge]>button]:max-w-[calc(100vw-1.5rem-var(--balances-w,0px))] tablet:[&_[data-slot=player-badge]>button]:max-w-[calc(100vw-2.5rem-var(--balances-w,0px))]",
            )}
          >
            {/* The profile (#787), then under it (#829) the League control (the crowns and the crest, no name) and the shield's plate. */}
            <PlayerBadge />
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
          </div>
          {/*
            The home's own balances (#855: the Cobbles, PAVED, vPAVED while held; no USDC), one under the other at the top right
            (#828), at every width, the phone's plates below `desktop` and the larger ones from it; the same under a panel's page. Out of the row's
            flow: only the profile's line stands beside them (the League control under it passes below the plate), so at 320 px the
            badge keeps its whole width; the left column stops short of the right column (the chips' clearance) and wraps.
          */}
          <div ref={balancesRef} className="pointer-events-auto absolute top-0 right-0 flex items-start gap-2">
            {/* Below `desktop` Settings is the bar's (#763); from it, beside the stack's first plate. */}
            <Button size="icon" variant="outline" onClick={props.onSettings} aria-label="Settings" className="hidden rounded-full bg-card/90 backdrop-blur desktop:inline-flex">
              <GameIcon name="gear" size="md" />
            </Button>
            <div ref={stackRef} data-slot="home-phone-balances" className="relative desktop:hidden">
              <BalancesSlot layout="pill" kinds={HOME_BALANCES} direction="column" />
            </div>
            <BalancesSlot layout="rail" kinds={HOME_BALANCES} direction="column" className="hidden desktop:flex" />
            <VillageNav {...props} />
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

      {/* The bottom: the season dial at the left, Found or Edit and Play at the right. */}
      {props.seasonWheel && (
        <div data-dial-place className={cn("absolute left-2 tablet:left-4", ABOVE_BAR)}>
          <Suspense fallback={<span aria-hidden className="block size-24 min-[24.375rem]:size-27 tablet:size-36" />}>
            <LazySeasonWheel state={props.seasonWheel.state} onNext={props.seasonWheel.onNext} read={props.seasonWheel.read} />
          </Suspense>
        </div>
      )}
      <div className={cn("absolute right-2 flex items-end gap-2 tablet:right-4 desktop:gap-4", ABOVE_BAR, props.seasonWheel && "left-28 justify-end min-[24.375rem]:left-31 tablet:left-44")}>
        {village && !guest && !props.readOnly && !founded ? (
          <Button size="lg" variant="outline" className="rounded-full bg-card/90 backdrop-blur" loading={props.founding} onClick={props.onFound}>
            <GameIcon name="house" size="sm" /> Found
          </Button>
        ) : (
          editable && (
            <Button size="icon" variant="outline" onClick={onEdit} aria-label="Edit village" className="size-14 rounded-full bg-card/90 shadow-lg backdrop-blur">
              <GameIcon name="hammer" size="lg" />
            </Button>
          )
        )}
        {/* Play, the main action (#755, #807): the two swords, no text, gold and large, from `desktop`; below it the bar's centre disc (#763). */}
        <Button size="icon" onClick={props.onPlay} aria-label="Play" className="hidden size-16 rounded-2xl shadow-lg tablet:size-18 desktop:inline-flex">
          <GameIcon name="swords" size="xl" />
        </Button>
      </div>
      {/* The app's bar below `desktop` (#763): its height on the scene (`--app-nav-h`), which the bottom overlays clear. */}
      <HomeBar>
        <LazyAppNav active={null} badges={{ chests: props.chests }} onNavigate={props.onNavigate} className="relative" />
      </HomeBar>
    </>
  );
}
