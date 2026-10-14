import { cn } from "../../lib/utils";
import { Progress } from "../ui/progress";

export interface TaskProgressProps {
  /** What one unit is ("points", "forests scored"). */
  unit: string;
  count: number;
  total: number;
  className?: string;
}

const count = (n: number) => n.toLocaleString("en-US");

/** One task of a quest or an achievement: its count against its total, and the bar (the indexer's sum, saturated at the total). */
export function TaskProgress({ unit, count: done, total, className }: TaskProgressProps) {
  const value = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{unit}</span>
        <span className="numeric shrink-0">
          <span className={cn("font-semibold", done >= total ? "text-success" : "text-foreground")}>{count(done)}</span>
          <span className="text-muted-foreground"> / {count(total)}</span>
        </span>
      </div>
      <Progress value={value} aria-label={`${unit}: ${count(done)} of ${count(total)}`} className={cn(done >= total && "[&>[data-slot=progress-indicator]]:bg-success")} />
    </div>
  );
}
