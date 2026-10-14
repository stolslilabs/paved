import { cn } from "../../lib/utils";
import { Glyph } from "./glyph";

export interface TilesLeftProps {
  /** Tiles still to draw (`GameView.remainingCount`): a discard spends one like a placement. */
  remaining: number;
  /** Tiles discarded so far (`GameView.discardedCount`). */
  discarded: number;
  className?: string;
}

/** The tiles left, counting discards (the PM's P3 addition): "7 left", and how many of the spent ones were discarded. */
export function TilesLeft({ remaining, discarded, className }: TilesLeftProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Glyph name="tiles" className="size-5 text-muted-foreground" />
      <span className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">Tiles left</span>
        <span className="font-mono text-base font-semibold tabular-nums" data-testid="tiles-left">{remaining}</span>
      </span>
      {discarded > 0 && (
        <span className="self-end rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {discarded} discarded
        </span>
      )}
    </span>
  );
}
