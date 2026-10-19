import { cn } from "../../lib/utils";
import { ValueRow } from "./value-row";

export interface TilesLeftProps {
  /** Tiles still to draw (`GameView.remainingCount`): a discard spends one like a placement. */
  remaining: number;
  /** Opens the deck sheet: the figure becomes a button. */
  onClick?: () => void;
  className?: string;
}

/** The tiles left, discards counted as spent (P3): "Tiles left" above, the icon and the figure on one row. The discards are not shown. */
export function TilesLeft({ remaining, onClick, className }: TilesLeftProps) {
  const body = (
    <>
      <span className={cn("text-xs text-muted-foreground", onClick && "underline decoration-dotted underline-offset-2")}>Tiles left</span>
      <ValueRow icon="table-cells-large" iconClassName="hidden tablet:inline-flex">
        <span className="numeric text-xl leading-none font-semibold tablet:text-2xl" data-testid="tiles-left">{remaining}</span>
      </ValueRow>
    </>
  );
  if (!onClick) return <span className={cn("flex flex-col gap-1", className)}>{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Tiles left: ${remaining}. Show the deck`}
      className={cn("flex min-h-11 flex-col justify-center gap-1 rounded-md px-1.5 text-left outline-none state-layer focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {body}
    </button>
  );
}
