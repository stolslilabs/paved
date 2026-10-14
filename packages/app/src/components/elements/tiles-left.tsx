import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

export interface TilesLeftProps {
  /** Tiles still to draw (`GameView.remainingCount`): a discard spends one like a placement. */
  remaining: number;
  /** Tiles discarded so far (`GameView.discardedCount`). */
  discarded: number;
  className?: string;
}

/** The tiles left, counting discards (the PM's P3 addition): "12 left", and how many of the spent ones were discarded. */
export function TilesLeft({ remaining, discarded, className }: TilesLeftProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="hidden text-muted-foreground tablet:inline">
        <Icon name="table-cells-large" size="md" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">Tiles left</span>
        <span className="font-mono text-base font-semibold tabular-nums" data-testid="tiles-left">{remaining}</span>
        {discarded > 0 && <span className="text-[11px] whitespace-nowrap text-muted-foreground">{discarded} discarded</span>}
      </span>
    </span>
  );
}
