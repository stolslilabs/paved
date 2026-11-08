import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

export interface StarRowProps {
  /** Stars earned, 0 to 3. */
  stars: number;
  /** The accessible name; "2 of 3 stars" by default. */
  label?: string;
  className?: string;
}

/** A Story level's stars (Story mode): three, the earned ones in gold, 12 px (a best's line, a battle log's row); read as "2 of 3 stars". */
export function StarRow({ stars, label, className }: StarRowProps) {
  return (
    <span role="img" aria-label={label ?? `${stars} of 3 stars`} data-stars={stars} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3].map((n) => (
        <Icon key={n} name="star" size="xs" className={n <= stars ? "text-primary" : "text-muted-foreground/40"} />
      ))}
    </span>
  );
}
