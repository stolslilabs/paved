import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { TileChip, chipVariants } from "../elements/tile-chip";

/**
 * Where the hand is: `placing` (choose a slot, rotate, confirm), `pending` (a move sent, its receipt awaited),
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
  /** Where the board's tile art is served (`TileChip`'s `artBase`): the hand shows the tile as the board draws it. */
  tileArt?: string;
  /** Draws the tile with the renderer (`TileView`), as the board does; the page gives it, tests leave it out (no WebGL). */
  renderTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  onSurrender?: () => void;
  className?: string;
}

/** The hand: the tile to place, rotate, confirm, discard, and surrender (the mockups' "Place tile" panel). */
export function HandPanel({ tile, state, slotChosen, preview, error, tileArt, renderTile, onRotate, onConfirm, onDiscard, onSurrender, className }: HandPanelProps) {
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
      {state === "refused" && (
        <p role="alert" className="flex items-center gap-2 text-xs text-destructive-text">
          <Icon name="triangle-exclamation" size="sm" />
          {error ?? "Move refused. Choose another slot."}
        </p>
      )}
      {state === "expired" && (
        <p role="alert" className="text-sm text-destructive-text">
          This game expired: 24 h passed since its purchase. Surrender to close it.
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1.5">
          {renderTile && tile ? (
            <span data-view="render" className={chipVariants({ size: "lg", state: chipState })}>
              {renderTile(tile)}
            </span>
          ) : (
            <TileChip plan={tile?.plan ?? 0} orientation={tile?.orientation} artBase={tileArt} size="lg" state={chipState} />
          )}
          <Button variant="ghost" size="sm" onClick={onRotate} disabled={locked || !tile} aria-label="Rotate tile">
            <Icon name="rotate-right" size="sm" /> Rotate
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Button size="lg" onClick={onConfirm} disabled={locked || !slotChosen} loading={busy}>
            {busy ? (
              "Placing…"
            ) : (
              <>
                <Icon name="check" size="sm" /> Place tile
                {slotChosen && preview != null && <span className="font-mono tabular-nums">+{preview}</span>}
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={onDiscard} disabled={locked || !tile}>
            <Icon name="trash" size="sm" /> Discard
          </Button>
          <Button
            variant={state === "expired" ? "destructive" : "ghost"}
            size="sm"
            onClick={onSurrender}
            disabled={busy || state === "empty"}
            className={cn(state !== "expired" && "text-destructive-text hover:text-destructive-text")}
          >
            <Icon name="flag" size="sm" /> Surrender
          </Button>
        </div>
      </div>
      {state === "placing" && !slotChosen && <p className="text-center text-xs text-muted-foreground">Tap a lit slot on the board.</p>}
    </section>
  );
}
