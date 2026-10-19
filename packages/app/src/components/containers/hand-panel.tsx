import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { TileChip, chipVariants, type TileArt } from "../elements/tile-chip";
import { COACH_RING, type CoachTarget } from "./coach";

/**
 * Where the hand is: `placing` (choose a slot, confirm), `pending` (a move sent, its receipt awaited),
 * `refused` (the last move came back refused), `expired` (the 24 h passed: only surrender), `empty` (no tile: over).
 */
export type HandState = "placing" | "pending" | "refused" | "expired" | "empty";

export interface HandPanelProps {
  /** The tile to place (`SessionState.hand` with its orientation); null when there is none. */
  tile: { plan: number; orientation: number } | null;
  state: HandState;
  /** A slot is chosen on the board: Confirm is enabled. */
  slotChosen?: boolean;
  /** The points the placement would score (the engine's preview), shown on Confirm. */
  preview?: number | null;
  /** Why the move was refused. */
  error?: string | null;
  /** The refusal's detail for support (its typed name, hash, game, version, time): the page builds it. */
  errorDetail?: ErrorDetail;
  /** Where the board's tile art is served (`TileChip`'s `art`, from `useTileArt`): the hand shows the tile as the board draws it. */
  tileArt?: TileArt;
  /** Draws the tile with the renderer (`TileView`), as the board does; the page gives it, tests leave it out (no WebGL). */
  renderTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  onConfirm?: () => void;
  onDiscard?: () => void;
  onSurrender?: () => void;
  /** Surrender is offered: not in Story mode, where a level restarts instead (P6, #546). */
  canSurrender?: boolean;
  /** The Surrender dialog's module is on its way (BOARD-CHUNK): the button shows it is busy. */
  surrenderPending?: boolean;
  /** A Story coach mark points at Place or Discard: that button is ringed. */
  coach?: CoachTarget | null;
  className?: string;
}

const EXPIRED_TEXT = "24 h passed since its purchase. Surrender to close it.";

/** The hand: the tile to place, confirm, discard, and surrender; the rotation is the bubble's, on the tile (the mockups' "Place tile" panel). */
export function HandPanel({ tile, state, slotChosen, preview, error, errorDetail, tileArt, renderTile, onConfirm, onDiscard, onSurrender, canSurrender = true, surrenderPending = false, coach, className }: HandPanelProps) {
  const busy = state === "pending";
  const locked = state === "pending" || state === "expired" || state === "empty";
  const chipState = busy ? "pending" : state === "refused" ? "refused" : tile ? "selected" : "default";
  return (
    <section
      aria-label="Your tile"
      data-state={state}
      data-input-surface
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur",
        state === "refused" ? "border-ember-700" : "border-border",
        className,
      )}
    >
      {/* Refused and expired say why in the one error component (P-67); always rendered, so its height animates. */}
      <InlineError
        title={state === "expired" ? "Game expired" : state === "refused" ? "Move refused" : undefined}
        message={state === "refused" ? (error ?? "Choose another slot.") : state === "expired" ? EXPIRED_TEXT : null}
        detail={errorDetail}
      />
      <div className="flex items-center gap-3">
        {/* Each `GameCanvas` owns its canvas and frees its WebGL context on unmount (R-dispose, #397). */}
        {renderTile && tile ? (
          <span data-view="render" className={chipVariants({ size: "xl", state: chipState })}>
            {renderTile(tile)}
          </span>
        ) : (
          <TileChip plan={tile?.plan ?? 0} orientation={tile?.orientation} art={tileArt} size="xl" state={chipState} />
        )}
        {/* What to do next: the rotation and the cancel are the bubble's, on the tile. */}
        {state === "placing" && (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{slotChosen ? "Place it, or tap the cross on the tile to take it back." : "Tap a lit slot on the board."}</p>
        )}
      </div>
      <Button size="lg" onClick={onConfirm} disabled={locked || !slotChosen} loading={busy} className={cn("w-full", coach === "place" && COACH_RING)}>
        {busy ? (
          "Placing…"
        ) : (
          <>
            <Icon name="check" size="sm" /> Place tile
            {slotChosen && preview != null && <span className="numeric">+{preview}</span>}
          </>
        )}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onDiscard} disabled={locked || !tile} className={cn(!canSurrender && "col-span-2", coach === "discard" && COACH_RING)}>
          <Icon name="trash" size="sm" /> Discard
        </Button>
        {canSurrender && (
          <Button
            variant={state === "expired" ? "destructive" : "ghost"}
            onClick={onSurrender}
            disabled={busy || state === "empty"}
            loading={surrenderPending}
            className={cn(state !== "expired" && "text-destructive-text hover:text-destructive-text")}
          >
            <Icon name="flag" size="sm" /> Surrender
          </Button>
        )}
      </div>
    </section>
  );
}
