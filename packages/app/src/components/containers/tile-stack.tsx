import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { TileChip, chipVariants, type TileArt } from "../elements/tile-chip";
import { COACH_RING, type CoachTarget } from "./coach";
import { DiscardHold } from "./discard-hold";

/**
 * Where the hand is: `placing` (choose a slot, confirm), `pending` (a move sent, its receipt awaited),
 * `refused` (the last move came back refused), `expired` (the 24 h passed: only surrender), `empty` (no tile: over).
 */
export type HandState = "placing" | "pending" | "refused" | "expired" | "empty";

/** The tile bodies drawn under the top one, at most: the stack reads as a pile without counting it. */
export const STACK_CAP = 5;
/** Each body under the top one shows this much of its side, px. */
const BODY_STEP_PX = 5;
/** The hint comes back after this long without a move or a cell chosen, ms. */
export const HINT_IDLE_MS = 20_000;
/** The next tile comes up: a short rise, ms. */
const RISE_MS = 220;

export interface TileStackProps {
  /** The tile to place (`SessionState.hand` with its orientation); null when there is none. */
  tile: { plan: number; orientation: number } | null;
  state: HandState;
  /** Tiles still to draw (`GameView.remainingCount`): the badge, and the bodies under the top up to `STACK_CAP`. */
  remaining: number;
  /** A cell is chosen on the board (the tile is on it, the bubble's): the top is dimmed and the stack's Discard goes. */
  cellChosen?: boolean;
  /** No cell takes the tile in any rotation: the stack's Discard says so. */
  fitsNowhere?: boolean;
  /** Why the move was refused. */
  error?: string | null;
  /** The refusal's detail for support (its typed name, hash, game, version, time): the page builds it. */
  errorDetail?: ErrorDetail;
  /** Where the board's tile art is served (`TileChip`'s `art`, from `useTileArt`). */
  tileArt?: TileArt;
  /** Draws the tile with the renderer (`TileView`), as the board does; the page gives it, tests leave it out (no WebGL). */
  renderTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** A tap on the stack: the deck sheet (#540). */
  onDeck?: () => void;
  /** The end of a hold on the stack's Discard. */
  onDiscard?: () => void;
  /** What a discard costs now (at most the score); 0 or none: free. */
  discardCost?: number;
  /** The Discard hold's length, ms (`HOLD_MS` by default; the stories tune it). */
  holdMs?: number;
  /** The expired banner's Surrender: the only move left. */
  onSurrender?: () => void;
  /** The Surrender dialog's module is on its way (BOARD-CHUNK): the banner's button shows it is busy. */
  surrenderPending?: boolean;
  /** A Story coach mark points at the deck (the stack is ringed) or at Discard (the stack's Discard is). */
  coach?: CoachTarget | null;
  /** A board the viewer does not play (another player's game, a Story level's intro or end): the tiles left and the deck only. */
  readOnly?: boolean;
  className?: string;
}

/** Whether the hint shows: at the start, then again after `HINT_IDLE_MS` without a move or a cell chosen. */
function useHint(active: boolean, moveKey: number, cellChosen: boolean): boolean {
  const [shown, setShown] = useState(true);
  // A move (the key changed) or a cell chosen hides it; a second run of the same effect (StrictMode) does not.
  const last = useRef({ moveKey, cellChosen });
  useEffect(() => {
    if (last.current.moveKey !== moveKey || last.current.cellChosen !== cellChosen) setShown(false);
    last.current = { moveKey, cellChosen };
    if (!active || cellChosen) return;
    const timer = setTimeout(() => setShown(true), HINT_IDLE_MS);
    return () => clearTimeout(timer);
  }, [active, moveKey, cellChosen]);
  return active && !cellChosen && shown;
}

/**
 * The hand as a tile stack (#606, after Dorfromantik's): bottom right, in the thumb's reach. Its top is the tile in hand,
 * as the board draws it and in its rotation (only that one: the stack never hints at the next); under it a few tile
 * bodies, as many as the tiles left up to `STACK_CAP`; on it a round badge with the tiles left. A tap opens the deck.
 * While no cell is chosen, a small bubble on the stack offers Discard, held as the bubble's (the player can always
 * discard, also when the tile fits nowhere); while the tile is on a cell the top is dimmed: the tile is on the board.
 * A refused move and the expired game show as a compact banner above it; the expired one carries Surrender. The hint
 * shows at the start and after a while without a move, never for good. No overlay of the stack blurs the board behind it:
 * a backdrop blur over the live canvas redraws as the board does, so a still board would not read as still (mobile-feel).
 */
export function TileStack({
  tile,
  state,
  remaining,
  cellChosen = false,
  fitsNowhere = false,
  error,
  errorDetail,
  tileArt,
  renderTile,
  onDeck,
  onDiscard,
  discardCost,
  holdMs,
  onSurrender,
  surrenderPending = false,
  coach,
  readOnly = false,
  className,
}: TileStackProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const busy = state === "pending";
  const canDiscard = tile !== null && (state === "placing" || state === "refused");
  // No lit slot to tap when the tile fits nowhere: the stack's Discard says so instead.
  const hint = useHint(state === "placing" && tile !== null && !fitsNowhere, remaining, cellChosen);
  const bodies = Math.max(0, Math.min(STACK_CAP, remaining));
  const top = useRef<HTMLSpanElement>(null);

  // The next tile comes up: a short rise from the pile (the Web Animations API, no frame of React's); none under reduced motion.
  const last = useRef(remaining);
  useEffect(() => {
    if (last.current === remaining) return;
    last.current = remaining;
    if (reduced || !top.current?.animate) return;
    top.current.animate(
      [
        { transform: `translateY(${BODY_STEP_PX * 2}px)`, opacity: 0.5 },
        { transform: "none", opacity: 1 },
      ],
      { duration: RISE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [remaining, reduced]);

  const chipState = busy ? "pending" : state === "refused" ? "refused" : "default";
  return (
    <section
      aria-label={readOnly ? "Deck" : "Your tile"}
      data-state={state}
      data-input-surface
      data-bubble-avoid
      className={cn("pointer-events-none flex max-w-[min(20rem,calc(100vw-1rem))] flex-col items-end gap-2", className)}
    >
      {/* Refused and expired say why in the one error component (P-67); always rendered, so its height animates. */}
      <InlineError
        title={state === "expired" ? "Game expired" : state === "refused" ? "Move refused" : undefined}
        message={state === "refused" ? (error ?? "Choose another slot.") : state === "expired" ? "24 h passed since its purchase. Surrender to close it." : null}
        detail={errorDetail}
        action={
          state === "expired" && onSurrender ? (
            <Button size="sm" variant="destructive" onClick={onSurrender} loading={surrenderPending}>
              <Icon name="flag" size="sm" /> Surrender
            </Button>
          ) : undefined
        }
        className="pointer-events-auto w-full rounded-xl bg-card shadow-lg"
      />
      {(hint || busy) && (
        <p data-testid="hand-hint" className="rounded-full bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow">
          {busy ? "Placing…" : "Tap a lit slot on the board."}
        </p>
      )}
      <div className="flex items-end gap-2">
        {/* The stack's Discard: while no cell is chosen (then it is the bubble's, on the tile). */}
        {canDiscard && !cellChosen && onDiscard && (
          <div data-testid="stack-discard" className="pointer-events-auto mb-3 flex items-center gap-2 rounded-full border bg-card p-1 shadow-lg">
            {fitsNowhere && <span className="pl-2 text-xs text-muted-foreground">This tile fits nowhere</span>}
            <DiscardHold onDiscard={onDiscard} cost={discardCost} holdMs={holdMs} className={cn("size-11 rounded-full focus-visible:ring-offset-card", coach === "discard" && cn(COACH_RING, "rounded-full"))} />
          </div>
        )}
        <button
          type="button"
          onClick={onDeck}
          disabled={!onDeck}
          aria-label={`Tiles left: ${remaining}. Show the deck`}
          data-coach={coach === "deck" ? "deck" : undefined}
          className={cn("pointer-events-auto relative cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", coach === "deck" && COACH_RING)}
          style={{ paddingBottom: bodies * BODY_STEP_PX }}
        >
          {/* The bodies: sides only, a small gap between them, the lowest first. */}
          {Array.from({ length: bodies }, (_, i) => (
            <span
              key={i}
              aria-hidden
              data-stack-body
              className="absolute inset-x-0 top-0 h-24 rounded-md border-2 border-input bg-muted shadow-md"
              style={{ transform: `translateY(${(bodies - i) * BODY_STEP_PX}px)` }}
            />
          ))}
          <span ref={top} data-stack-top className={cn("relative block transition-opacity duration-200 motion-reduce:transition-none", cellChosen && "opacity-40")}>
            {/* Each `GameCanvas` owns its canvas and frees its WebGL context on unmount (R-dispose, #397). */}
            {renderTile && tile ? (
              <span data-view="render" className={chipVariants({ size: "lg", state: chipState })}>
                {renderTile(tile)}
              </span>
            ) : (
              <TileChip plan={tile?.plan ?? 0} orientation={tile?.orientation} art={tileArt} size="lg" state={chipState} />
            )}
          </span>
          <span
            data-testid="tiles-left"
            className="numeric absolute -top-2.5 -left-2.5 flex size-8 items-center justify-center rounded-full border-2 border-card bg-foreground text-sm font-bold text-background shadow-md"
          >
            {remaining}
          </span>
        </button>
      </div>
    </section>
  );
}
