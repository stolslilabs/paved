import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Glyph } from "../elements/glyph";
import { TileChip } from "../elements/tile-chip";

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
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  onSurrender?: () => void;
  className?: string;
}

/** The hand: the tile to place, rotate, confirm, discard, and surrender (the mockups' "Place tile" panel). */
export function HandPanel({ tile, state, slotChosen, preview, error, onRotate, onConfirm, onDiscard, onSurrender, className }: HandPanelProps) {
  const busy = state === "pending";
  const locked = state === "pending" || state === "expired" || state === "empty";
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
          <Glyph name="warning" className="size-4" />
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
          <TileChip
            plan={tile?.plan ?? 0}
            orientation={tile?.orientation}
            size="lg"
            state={busy ? "pending" : state === "refused" ? "refused" : tile ? "selected" : "default"}
          />
          <Button variant="ghost" size="sm" onClick={onRotate} disabled={locked || !tile} aria-label="Rotate tile">
            <Glyph name="rotate" className="size-4" /> Rotate
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Button size="lg" onClick={onConfirm} disabled={locked || !slotChosen} loading={busy}>
            {busy ? (
              "Placing…"
            ) : (
              <>
                <Glyph name="check" className="size-4" /> Place tile
                {slotChosen && preview != null && <span className="font-mono tabular-nums">+{preview}</span>}
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={onDiscard} disabled={locked || !tile}>
            <Glyph name="discard" className="size-4" /> Discard
          </Button>
          <Button
            variant={state === "expired" ? "destructive" : "ghost"}
            size="sm"
            onClick={onSurrender}
            disabled={busy || state === "empty"}
            className={cn(state !== "expired" && "text-destructive-text hover:text-destructive-text")}
          >
            <Glyph name="surrender" className="size-4" /> Surrender
          </Button>
        </div>
      </div>
      {state === "placing" && !slotChosen && <p className="text-center text-xs text-muted-foreground">Tap a lit slot on the board.</p>}
    </section>
  );
}
