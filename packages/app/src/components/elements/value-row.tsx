import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

export interface ValueRowProps {
  /** The Font Awesome name of the icon before the value; none draws the value alone. */
  icon?: string;
  iconSize?: IconSize;
  /** On the icon's wrapper: its colour, or `hidden tablet:inline-flex` to leave it out on a phone. */
  iconClassName?: string;
  /** The value: its text sets the row's height (`leading-none`), and the icon centres on it. */
  children: ReactNode;
  className?: string;
}

/**
 * The one layout rule for an icon with a figure (Score, TilesLeft, StatRow, the amounts beside an icon): the title sits
 * above, and the icon shares one row with the value, centred on the value's line, so the title, the icon and the value
 * no longer have three baselines. The value brings `leading-none` so the row is exactly its line high.
 */
export function ValueRow({ icon, iconSize = "md", iconClassName, children, className }: ValueRowProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {icon && (
        <span className={cn("inline-flex shrink-0 text-muted-foreground", iconClassName)}>
          <Icon name={icon} size={iconSize} />
        </span>
      )}
      {children}
    </span>
  );
}
