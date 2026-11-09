import { Suspense, lazy } from "react";
import { cn } from "../../lib/utils";
import { HUD_INSET_BOX, HUD_PLATES_NUDGE } from "../elements/hud-inset";
import { GameIcon } from "../elements/game-icon";
import { Button } from "../ui/button";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { PlayerBadge } from "../containers/player-badge";
import { HomeBar } from "./home-village-bar";
import { loadStage } from "./home-village-chunks";
import { HomeLeftColumn } from "./home-village-left-column";
import { useOverlayMeasures } from "./home-village-measures";
import type { HomeVillageSceneProps } from "./home-village-scene";

// The app's bar (#763) in its own chunk, shared with the tab pages: the home's first load stays as it was; a stand-in of its size
// holds its place meanwhile.
const LazyAppNav = lazy(() => import("../containers/app-nav").then((m) => ({ default: m.AppNav })));
// The Camera mode's button and its hint (#875), with the camera's icon: the stage's chunk carries them (FIRST-LOAD), and the button
// shows with the 3D village it draws, at the bottom right (nothing moves as it comes).
const LazyCameraControl = lazy(() => loadStage().then((m) => ({ default: m.CameraControl })));
// HOME-EDGES: the edges' buttons (the right column's tiles, the Chat tab, the mission in progress) in their own chunk, one import for
// the three; stand-ins of their sizes hold their places meanwhile (FIRST-LOAD).
const loadEdges = () => import("../containers/home-edges");
const LazyEdgeTiles = lazy(() => loadEdges().then((m) => ({ default: m.EdgeTiles })));
const LazyChatAndMission = lazy(() => loadEdges().then((m) => ({ default: m.ChatAndMission })));

/**
 * The bottom overlays' place: 8 px above the dock below `desktop` (its height, measured before the first paint); from it, the scene's
 * foot, beside the dock, centred and 34 rem wide (HOME-DOCK).
 */
const ABOVE_BAR = "bottom-[calc(var(--app-nav-h)+0.5rem)] desktop:bottom-4";

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

/** The right column's stand-in while its chunk arrives: four tiles' height (64 px square, 8 px apart), nothing under it moves. */
const TILES_STAND_IN = <span aria-hidden className="block w-16" style={{ height: 4 * 64 + 3 * 8 }} />;
/** The bottom left's stand-in: the Chat tab (56 x 64 px); the mission comes with its read, after the chunk. */
const CHAT_STAND_IN = <span aria-hidden className="block h-16 w-14" />;

/**
 * The view's overlays: the corners, the left column, the edges' buttons (HOME-EDGES), the bottom's controls, the chips.
 * Each piece the long press's Edit village keeps clear of (PRESS-BUILD, the tile actions' rules: `layoutTileActions`) is marked
 * `data-bubble-avoid` on its own box, so the room is the HUD's real edges: the profile, the balances and the capsules from the top; the
 * Chat tab, the mission, the bottom right's controls and the dock from the foot; the right column of tiles, which stands
 * across the middle, as a side (`data-bubble-avoid="side"`), from the right. Edit mode draws none of them.
 */
export function ViewOverlays({
  village,
  editable,
  onEdit,
  camera,
  onCameraChange,
  ...props
}: HomeVillageSceneProps & {
  editable: boolean;
  onEdit: () => void;
  /** The Camera mode on (#875); its button, while the stage draws the 3D village. */
  camera: boolean;
  onCameraChange?: (camera: boolean) => void;
}) {
  const { founded = true } = props;
  const measures = useOverlayMeasures();
  return (
    // The overlays' box (the scene's): the top row's measures and the bar's height are set on it, for the columns and the bottom.
    // In the Camera mode (`data-camera`, #875's open point 2) all but Exit camera leave the screen by their nearest edge, in three
    // waves (`data-out`, theme.css; CAMERA-EXPLORE), out of reach once gone; Exit goes down to the corner (`data-corner`). The box lets taps through to the village (`pointer-events-none`, #916's gestures): each
    // control's place takes them back (`pointer-events-auto`: the top row, the columns' children, the bottom row's children,
    // the phone's bar). HOME-BUTTONS (#856): Edit, Settings, Play and the bar had none since #910 and took no tap.
    <div ref={measures.box} data-slot="home-overlays" data-camera={camera || undefined} className="pointer-events-none absolute inset-0">
      {/*
        Top: the profile at the left, the balances at the right, both the HUD's inset (HOME-HUD-PADDING, `--hud-inset` in theme.css,
        the notch's safe area added) off the screen's top and sides.
      */}
      <div className={cn("absolute inset-x-0 top-0", HUD_INSET_BOX)}>
        <div className="relative flex items-start justify-between gap-2">
          <div ref={measures.profile} data-out="u2" data-bubble-avoid className="pointer-events-auto min-w-0">
            {/* The player card (#787): its rim the league of the crowns below it. */}
            <PlayerBadge league={props.league} />
          </div>
          {/*
            The home's own balances (#855: the Cobbles, PAVED, vPAVED while held; no USDC) at the top right, the same under a
            panel's page: one under the other at every width (HOME-UI-CAPSULES, the mockup's), the phone's plates below `desktop`, the larger ones from it.
            Out of the row's flow: only the profile's line stands beside them, so at 320 px the badge keeps its whole width.
          */}
          <div ref={measures.balances} data-out="u2" data-bubble-avoid className="pointer-events-auto absolute top-0 right-0 flex items-start">
            {/* HOME-HUD-PADDING: the phone's plates on the profile's painted edge (`HUD_PLATES_NUDGE`); Connect keeps the plain inset. */}
            <div data-slot="home-phone-balances" className={cn("relative desktop:hidden", HUD_PLATES_NUDGE)}>
              <BalancesSlot layout="pill" kinds={HOME_BALANCES} direction="column" beside={BESIDE_LEAGUE} />
            </div>
            <BalancesSlot layout="rail" kinds={HOME_BALANCES} direction="column" className="hidden desktop:flex" />
          </div>
        </div>
      </div>
      {/* The columns and the bottom left, in the box's frame, so they stand as in it; each leaves the screen in the Camera mode (`data-out`). */}
      <div className="absolute inset-0">
        {/*
          HOME-EDGES (the owner's asks of 2026-11-04, the Paved UX Book's main screen): the right column at every width, its four blue
          tiles (Missions, Vault, Friends, Tiles) centred in the band under the balances; taller than the band (a landscape phone),
          it starts at its top and wraps leftwards.
        */}
        <div data-out="r0" data-bubble-avoid="side" className="pointer-events-none absolute top-(--right-top) right-(--hud-inset-right) bottom-(--right-bottom) flex flex-col justify-center-safe [&>*]:pointer-events-auto">
          <Suspense fallback={TILES_STAND_IN}>
            <LazyEdgeTiles
              missions={props.missions}
              friends={props.friends}
              onMissions={props.onMissions}
              onVault={props.onVault}
              onFriends={props.onFriends}
              onTiles={props.onTiles}
              className="flex flex-col flex-wrap-reverse content-start items-center gap-2"
            />
          </Suspense>
        </div>
        {/*
          The left column under the profile (#829), from its band's top, 24 px under it (#929, which revises #856's centring), above the bottom left;
          clear of the right column's tiles (HOME-EDGES). Taller than its band (the score
          unfolded while shielded, on a short screen), it scrolls within it (its edge fading where more waits), never over the bottom left;
          its padding keeps the controls' shadows inside the scroll box. Its own box slides off in the Camera mode (`data-out`): the edge
          hint's transition (`scroll-hint`, a utility) would take the place of the slide's.
        */}
        <div data-out="l1" className="absolute inset-0">
          <div
            ref={leftColumnHint}
            data-slot="scroll-region"
            className="scroll-hint absolute top-(--left-top) right-20 bottom-(--left-bottom) left-0 flex flex-col items-start gap-3 overflow-y-auto overscroll-contain pl-(--hud-inset-left) tablet:right-24 [&>*]:pointer-events-auto"
          >
            <HomeLeftColumn {...props} village={village} editable={editable} onEdit={onEdit} />
          </div>
        </div>

        {/*
          The bottom left, from the dock up (HOME-EDGES): the mission in progress just above the dock (the owner's ask: at the left, not
          over the dock), then the Chat tab on the screen's edge. The left column stops above the two.
        */}
        <div ref={measures.bottomLeft} data-bottom-left data-out="l0" className={cn("pointer-events-none absolute left-0 flex flex-col items-start gap-2 [&>*]:pointer-events-auto", ABOVE_BAR)} style={{ marginBottom: "var(--dock-crest)" }}>
          <Suspense fallback={CHAT_STAND_IN}>
            <LazyChatAndMission chat={props.chat} mission={props.mission} onChat={props.onChat} onMissions={props.onMissions} />
          </Suspense>
        </div>
      </div>
      <div ref={measures.actions} data-corner data-bubble-avoid className={cn("absolute right-(--hud-inset-right) flex items-end gap-2 desktop:gap-4 [&>*]:pointer-events-auto", ABOVE_BAR)}>
        {/*
          The Camera mode's button (#875), at the bottom right; in the mode, Exit and the controls' hint, in the corner: Found
          leaves the row (`data-collapse`).
        */}
        {onCameraChange && (
          <Suspense fallback={null}>
            <LazyCameraControl on={camera} onChange={onCameraChange} />
          </Suspense>
        )}
        {/* Edit left with HOME-EDGES (the book's): the village score's capsule opens edit mode. */}
        {village && !props.readOnly && !founded && (
          <Button size="lg" variant="outline" data-collapse className="rounded-full bg-card/90 backdrop-blur" loading={props.founding} onClick={props.onFound}>
            <GameIcon name="house-tree" size="sm" /> Found
          </Button>
        )}
      </div>
      {/* The dock (#763, HOME-DOCK): its height on the scene (`--app-nav-h`), which the bottom overlays clear below `desktop`. */}
      <HomeBar>
        <LazyAppNav badges={{ guild: props.guild }} onNavigate={props.onNavigate} className="relative" />
      </HomeBar>
    </div>
  );
}
