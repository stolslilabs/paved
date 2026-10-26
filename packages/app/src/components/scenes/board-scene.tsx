import type { TileArt } from "../elements/tile-chip";
import type { TileRenders } from "../elements/tile-render";
import type { TileSkins } from "@paved/renderer";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import type { BoardTile, ScoredStructure } from "@paved/chain";
import { DISCARD_POINTS, PlanType, baseDeckPlans, type DeckSheetOrder } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { toastError } from "../containers/error-toast";
import { errorDetail } from "../../routes/error-detail";
import { Notice } from "../elements/notice";
import { BoardMap } from "../containers/board-map";
import { BoardCovered } from "../containers/board-covered";
import { useSidePanel } from "../../lib/side-panel";
import { useDeferred } from "../../lib/deferred";
import { prefetchAllowed, whenIdle } from "../../routes/prefetch";
import type { BoardBubble, BoardGhost } from "../containers/board-viewport";
import { LazyTileBubble } from "../containers/lazy-tile-bubble";
import { ClosingFeed } from "../containers/closing-feed";
import { GameHud } from "../containers/game-hud";
import type { RewardCurve } from "../containers/reward-estimate";
import type { BoardWheel } from "../../data/board-settings";
import type { ErrorDetail } from "../elements/inline-error";
import { useBoardSounds } from "../containers/board-sounds";
import { useSfx } from "../containers/audio-provider";
import { TileStack, type HandState, type StackFrame } from "../containers/tile-stack";
import type { GameAction } from "../containers/device-settings-sheet";
import { COACH_RING, type CoachTarget } from "../containers/coach";
import type { AttackDeckSheet } from "../../lib/attack-deck-sheet";
export type { CoachTarget } from "../containers/coach";

export type BoardMode = "challenge" | "training" | "story" | "attack";

/**
 * An attack's own pieces (`mode: "attack"`, #772), in the board's slots; everything else is the boards': the HUD, the closing
 * feed, the bubble, the stack, the season dial and the sounds.
 */
export interface AttackSlots {
  /** Under the HUD: the star meter against the defender's village. */
  meter: ReactNode;
  /** A replay (#647): its bar in place of the stack, the board read only. */
  replay?: ReactNode;
  /** v1's territory (the defender's owned cells), drawn by the plan view; v2's open board has none. */
  territory?: readonly { x: number; y: number }[];
  /** PvP v2's deck (#789, `attackDeckSheet`): the stack opens the deck sheet on it. v1's attack has none, and no sheet. */
  deck?: AttackDeckSheet;
}

// The Surrender and Restart dialogs (and Radix under them) are not the first frame's: their module loads at the first
// Surrender or Restart, and in the browser's idle time after the board is up (BOARD-CHUNK, `__tests__/board-modules.test.ts`). The plan view stays: it is
// the board where the canvas cannot start, and 1.6 KB gzip does not buy a second fetch there.
const loadSurrenderDialog = () => import("../containers/surrender-dialog");
// The settings sheet (#541) is its own chunk too: loaded at the first tap on the gear, not with the board.
const loadSettingsSheet = () => import("../containers/device-settings-sheet");
// The season wheel (#547) is its own chunk, loaded after the first frame: its slot in the HUD keeps its size meanwhile.
const LazySeasonWheel = lazy(() => import("../containers/board-season-wheel"));
// The deck sheet (#540) too: its own chunk, loaded at the first tap on the tile stack.
const loadDeckSheet = () => import("../containers/deck-sheet");
const PREFETCH_AFTER_MS = 3000;
// The stack beside the dial (#682): it keeps to the right of the dial and a gap, its row wrapping (Discard and queue above
// the stack) where the two do not fit side by side. 8.25rem is the two side insets, the 108 px dial and the gap; 7.5rem
// the same with the 96 px dial under 390 px. From tablet up the stack's own 20rem keeps it clear of the 144 px dial.
const STACK_BESIDE_DIAL = "max-w-[min(20rem,calc(100vw-7.5rem))] min-[24.375rem]:max-w-[min(20rem,calc(100vw-8.25rem))]";

/** The base deck's plans (chain ids, a card each): the stack's pile draws its tiles from them. */
const BASE_DECK_PLANS = baseDeckPlans().map((plan) => Object.values(PlanType).indexOf(plan));

const TITLES: Record<BoardMode, string> = { challenge: "Challenge", training: "Training", story: "Story", attack: "Attack" };

export interface BoardSceneProps {
  mode: BoardMode;
  /** The Challenge game id, shown in the title. */
  gameId?: number;
  /** The header's title instead of the mode's (a Story level's name). */
  title?: string;
  /** A Story level's draw where it stands (`deckSheetOrder`): the deck sheet shows it in order (#613); the counted base deck otherwise. */
  deckOrder?: DeckSheetOrder;
  /** The attack's own pieces (`mode: "attack"`): the star meter, the replay's bar, v1's territory. */
  attack?: AttackSlots;
  /** The plans the stack's pile draws (chain ids): an attack's deck; the Story level's or the base deck when left out. */
  pilePlans?: readonly number[];
  /** A Story level: the deck sheet offers the level's deck presentation again (#593). */
  onPresentDeck?: () => void;
  /** The control a Story coach mark points at: ringed. */
  coach?: CoachTarget | null;
  tiles: BoardTile[];
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** `GameView.remainingCount`: discards count against the tiles left (P3), and are not shown. */
  remaining: number;
  /** Chain plan ids of the tiles discarded: the deck sheet crosses them out too. */
  discardedPlans?: number[];
  /** `GameView.expiresAt` (S1): a Challenge game's start + 24 h; past it only a surrender is accepted. */
  expiresAt?: number | null;
  /** A Challenge game's reward curve (#705): the HUD shows the score to beat, then what the score earns. */
  reward?: RewardCurve | null;
  now: number;
  hand: {
    tile: { plan: number; orientation: number } | null;
    state: HandState;
    /** The tiles known after the one to place, in draw order (#645, `PageState.coming`): beside the stack, read only. */
    coming?: readonly { plan: number }[];
    /** The chain draws the queue's last tile (`PageState.drawing`): its slot waits. */
    drawing?: boolean;
    slotChosen?: boolean;
    /** A cell is chosen (the tile is on it, valid or not): the stack dims its top and leaves Discard to the bubble. */
    cellChosen?: boolean;
    /** No cell takes the tile in any rotation: the stack's Discard says so. */
    fitsNowhere?: boolean;
    /** The points the placed tile would score: on the HUD's score while a slot is chosen ("(+154)" over it, #568). */
    preview?: number | null;
    error?: string | null;
    /** The refusal's detail for support (`InlineError`). */
    errorDetail?: ErrorDetail;
  };
  /** What the last move closed (`SessionState.lastScored`), shown as it arrives. */
  lastScored: ScoredStructure[];
  /** The tiles' images (`useTileArt`): the hand shows the same art as the board. */
  tileArt?: TileArt;
  /** The tiles' build-time renders (`useTileRenders`): the deck sheet's real view and the coming tiles draw their top-down ones (#606, #679). */
  tileRenders?: TileRenders;
  /** The board's skins (plan key to theme): the deck sheet and the coming tiles show each plan in the theme the board draws it in. */
  skins?: TileSkins;
  /** The stack's top drawn by the renderer (`TileView`), given by the page like `canvas`; the art otherwise. */
  renderHandTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** The stack's tiles drawn by the renderer in 3D (`StackView`), given by the page like `canvas`; before `renderHandTile`. */
  renderHandStack?: (view: StackFrame) => ReactNode;
  /** `localStorage` refused: Story progress is not saved on this device (Training saves nothing: #718). */
  storageDisabled?: boolean;
  /** The legal slots of the tile in hand in any rotation (the contracts' coordinates), `fits` at the current one: the plan view draws them as buttons. */
  slots?: { x: number; y: number; fits?: boolean }[];
  /** The tile in hand on its chosen slot, as the plan view draws it (the page gives the canvas its own). */
  ghost?: BoardGhost | null;
  /** A move just sent: the plan view flashes its cell green. */
  confirmed?: (BoardGhost & { key: number }) | null;
  /** The player's placement highlight setting: off, the plan view draws its slots plain (they stay clickable). On when omitted. */
  placementHighlight?: boolean;
  /** A slot of the plan view was chosen. */
  onSlotClick?: (slot: { x: number; y: number }) => void;
  /**
   * The 3D board: the real renderer's canvas (`BoardViewport`), given by the page. Without it the scene draws the
   * plan view (`BoardMap`), as in the render tests where jsdom has no WebGL.
   */
  canvas?: ReactNode;
  /**
   * The bubble of the tile placed and not yet sent: Cancel, Discard (held), Rotate and Validate (held, #568, #606), the only
   * way to place a tile. The page also gives it to the 3D canvas, where it follows the tile; the scene draws it itself only
   * in the plan view (no `canvas`), above the tile stack.
   */
  bubble?: BoardBubble | null;
  /** The season wheel of this game (`useBoardSettings`); none: no wheel (the stories without a cycle). */
  seasonWheel?: BoardWheel;
  onBack?: () => void;
  /** The end of a hold on the stack's Discard (the bubble's is the page's, in `bubble`). */
  onDiscard?: () => void;
  /** Called once the player confirms in the Surrender dialog (the settings' Surrender, or the expired banner's). Challenge only. */
  onSurrender?: () => void;
  /** Called once the player confirms Restart in the settings: Story mode restarts the level, Training the game. */
  onRestart?: () => void;
  /** The board of a game the viewer cannot play (no account, another player's game): the stack shows its tiles, nothing to play (#701). */
  readOnly?: boolean;
  /** Lines under the header: "Connect to play", the dev-only prediction notice, a Story level's intro, tip and end. */
  notices?: ReactNode;
  /** Opens the Surrender dialog when it turns true: an expired Challenge game closes only by a surrender (P5). */
  promptSurrender?: boolean;
}

/**
 * The game board (`/game/:id`, `/training`, `/story/:campaign/:level`, and PvP's attack and replay through `PvpAttackScene`):
 * the scene full screen, its header, the closings, the tile stack (the hand, bottom right, #606). The gear's settings carry the
 * game's Surrender (Challenge) or Restart (Story mode, Training), each confirmed by a dialog; an attack has neither. Its deck
 * sheet (#789) shows the defender's tiles and the extras drawn at random, never the order.
 */
export function BoardScene(props: BoardSceneProps) {
  const { mode, gameId, tiles, hand, now } = props;
  const title = props.title ?? (mode === "challenge" && gameId != null ? `Challenge #${gameId}` : TITLES[mode]);
  const [surrendering, setSurrendering] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  // On a phone the sheets come from the bottom and cover the board: its ambient effects stop meanwhile (#572). From tablet up
  // they are side panels, and the board stays in view.
  const sidePanels = useSidePanel();
  const covered = (settingsOpen || deckOpen) && !sidePanels;
  const play = useSfx();
  useBoardSounds({ ghost: props.ghost, error: hand.error, lastScored: props.lastScored });
  const { promptSurrender } = props;
  useEffect(() => {
    if (promptSurrender) setSurrendering(true);
  }, [promptSurrender]);
  // Once the board has had its models and its first frame (`PREFETCH_AFTER_MS`), and the browser is idle: the module the
  // Surrender button would ask for. Sooner, its request would queue with the models'.
  useEffect(() => {
    if (!prefetchAllowed()) return;
    let cancel = () => {};
    const timer = setTimeout(() => (cancel = whenIdle(() => void loadSurrenderDialog().catch(() => {}))), PREFETCH_AFTER_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, []);
  const surrenderDialog = useDeferred(loadSurrenderDialog, surrendering || restarting, (e) => {
    setSurrendering(false);
    setRestarting(false);
    toastError({ title: "Surrender", message: "The Surrender dialog could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const settingsSheet = useDeferred(loadSettingsSheet, settingsOpen, (e) => {
    setSettingsOpen(false);
    toastError({ title: "Settings", message: "The settings could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const deckSheet = useDeferred(loadDeckSheet, deckOpen, (e) => {
    setDeckOpen(false);
    toastError({ title: "Deck", message: "The deck could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const discardCost = Math.min(props.score, DISCARD_POINTS);
  // The pile's tiles come from the deck the game deals: a Story level's own (#701), the base deck otherwise.
  const pilePlans = props.pilePlans ?? (props.deckOrder?.slots.length ? props.deckOrder.slots.map((s) => s.plan) : BASE_DECK_PLANS);
  const attack = mode === "attack" ? props.attack : undefined;
  const openDeck = () => {
    play("tap");
    setDeckOpen(true);
  };
  // The game's row in the settings: Surrender (Challenge, while the game takes moves), Restart (Story mode and Training).
  const pick = (open: (on: boolean) => void) => () => {
    setSettingsOpen(false);
    open(true);
  };
  const gameAction: GameAction | undefined = props.readOnly || mode === "attack"
    ? undefined
    : mode === "challenge"
      ? { kind: "surrender", label: "Surrender", hint: "End this game now with its score.", onSelect: pick(setSurrendering), disabled: !props.onSurrender || hand.state === "pending" || hand.state === "empty" }
      : props.onRestart
        ? { kind: "restart", label: mode === "story" ? "Restart level" : "Restart", hint: mode === "story" ? "Play this level again from its first tile." : "Play this game again from its first tile, same deck.", onSelect: pick(setRestarting) }
        : undefined;
  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {props.canvas ? (
        <BoardCovered.Provider value={covered}>{props.canvas}</BoardCovered.Provider>
      ) : (
        <BoardMap tiles={tiles} slots={props.slots} ghost={props.ghost} confirmed={props.confirmed} onSlotClick={props.onSlotClick} highlight={props.placementHighlight ?? true} territory={attack?.territory} />
      )}

      <div data-bubble-avoid className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
        <GameHud
          title={title}
          score={props.score}
          delta={props.delta}
          preview={hand.slotChosen ? hand.preview : null}
          expiresAt={mode === "challenge" ? props.expiresAt : null}
          reward={mode === "challenge" ? props.reward : null}
          now={now}
          onBack={props.onBack}
          onSettings={() => {
            play("tap");
            setSettingsOpen(true);
          }}
          coach={props.coach}
          className="pointer-events-auto w-full max-w-2xl"
        />
        {attack?.meter}
        {props.storageDisabled && (
          <Notice tone="warning" title="Storage is off" className="pointer-events-auto w-full max-w-2xl">
            This browser refuses local storage: this game is not saved and ends if the page closes.
          </Notice>
        )}
        {props.notices}
        <ClosingFeed closings={props.lastScored} className="mt-1" />
      </div>

      {/* The season dial (#607) at the board's bottom left (#682), on the stack's bottom line, read-only boards too. */}
      {props.seasonWheel && (
        <div
          data-bubble-avoid
          data-dial-place
          data-coach={props.coach === "wheel" ? "wheel" : undefined}
          className={cn("pointer-events-auto absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 tablet:bottom-4 tablet:left-4", props.coach === "wheel" && COACH_RING)}
        >
          {/* The dial's size (`DIAL_SIZE`, written out: the element is the lazy chunk's). */}
          <Suspense fallback={<span aria-hidden className="block size-24 min-[24.375rem]:size-27 tablet:size-36" />}>
            <LazySeasonWheel state={props.seasonWheel.state} onNext={props.seasonWheel.onNext} read={props.seasonWheel.read} />
          </Suspense>
        </div>
      )}

      {/* One stack, read-only boards too (#701): the same tiles and deck, nothing to play there. */}
      <div className="pointer-events-none absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col items-end gap-2 tablet:right-4 tablet:bottom-4">
        {!props.readOnly && !props.canvas && props.bubble && (
          <Suspense fallback={null}>
            <LazyTileBubble
              rotations={props.bubble.rotations}
              onRotate={props.bubble.onRotate}
              onClose={props.bubble.onClose}
              onDiscard={props.bubble.onDiscard}
              discardCost={discardCost}
              onConfirm={props.bubble.onConfirm}
              canConfirm={props.bubble.canConfirm}
              busy={props.bubble.busy}
              coach={props.bubble.coach}
              orientation={props.bubble.orientation}
              className="self-center"
            />
          </Suspense>
        )}
        {/* A replay's bar takes the stack's place, beside the dial as the stack is. */}
        {attack?.replay ? (
          <div className={cn("flex justify-end", props.seasonWheel && STACK_BESIDE_DIAL)}>{attack.replay}</div>
        ) : (
          <TileStack
            tile={hand.tile}
            state={hand.state}
            remaining={props.remaining}
            coming={hand.coming}
            drawing={hand.drawing}
            cellChosen={hand.cellChosen ?? hand.slotChosen}
            fitsNowhere={hand.fitsNowhere}
            error={hand.error}
            errorDetail={hand.errorDetail}
            tileArt={props.tileArt}
            renders={props.tileRenders}
            skins={props.skins}
            renderTile={props.renderHandTile}
            renderStack={props.renderHandStack}
            pilePlans={pilePlans}
            onDeck={mode === "attack" && !attack?.deck ? undefined : openDeck}
            onDiscard={props.readOnly ? undefined : () => props.onDiscard?.()}
            discardCost={discardCost}
            onSurrender={!props.readOnly && mode === "challenge" ? () => setSurrendering(true) : undefined}
            surrenderPending={surrendering && !surrenderDialog}
            coach={props.coach}
            readOnly={props.readOnly}
            className={props.seasonWheel ? STACK_BESIDE_DIAL : undefined}
          />
        )}
      </div>

      {deckSheet && (
        <deckSheet.default open={deckOpen} onOpenChange={setDeckOpen} tiles={tiles} discardedPlans={props.discardedPlans} order={props.deckOrder}
          attack={attack?.deck}
          handPlan={hand.tile?.plan ?? null}
          tileArt={props.tileArt}
          renders={props.tileRenders}
          skins={props.skins}
          onPresent={
            props.onPresentDeck &&
            (() => {
              setDeckOpen(false);
              props.onPresentDeck?.();
            })
          }
        />
      )}

      {settingsSheet && <settingsSheet.default open={settingsOpen} onOpenChange={setSettingsOpen} game={gameAction} />}

      {surrenderDialog && (
        <surrenderDialog.SurrenderDialog open={surrendering} onOpenChange={setSurrendering} expired={promptSurrender} score={props.score} onSurrender={() => props.onSurrender?.()} />
      )}
      {surrenderDialog && (mode === "training" || mode === "story") && (
        <surrenderDialog.RestartDialog open={restarting} onOpenChange={setRestarting} mode={mode} onRestart={() => props.onRestart?.()} />
      )}
    </div>
  );
}
