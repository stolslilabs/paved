import { cn } from "../../lib/utils";
import { ValueRow } from "./value-row";

export interface TilesLeftProps {
  /** Tiles still to draw (`GameView.remainingCount`): a discard spends one like a placement. */
  remaining: number;
  className?: string;
}

/** The tiles left, discards counted as spent (P3): "Tiles left" above, the icon and the figure on one row. The discards are not shown. */
export function TilesLeft({ remaining, className }: TilesLeftProps) {
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">Tiles left</span>
      <ValueRow icon="table-cells-large" iconClassName="hidden tablet:inline-flex">
        <span className="numeric text-xl leading-none font-semibold tablet:text-2xl" data-testid="tiles-left">{remaining}</span>
      </ValueRow>
    </span>
  );
}
