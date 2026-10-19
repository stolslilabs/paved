import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

export interface StarRowProps {
  /** Stars earned, 0 to 3. */
  stars: number;
  size?: IconSize;
  /** The accessible name; "2 of 3 stars" by default. */
  label?: string;
  className?: string;
}

/** A Story level's stars (Story mode): three, the earned ones in gold; read as "2 of 3 stars". */
export function StarRow({ stars, size = "sm", label, className }: StarRowProps) {
  return (
    <span role="img" aria-label={label ?? `${stars} of 3 stars`} data-stars={stars} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3].map((n) => (
        <Icon key={n} name="star" size={size} className={n <= stars ? "text-primary" : "text-muted-foreground/40"} />
      ))}
    </span>
  );
}
