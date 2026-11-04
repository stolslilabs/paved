import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { missionPartSources } from "./medallion-art";

export interface CheckBadgeProps {
  /** Its width in CSS px, for the copy the screen takes (the box sizes it: `className` or `style`). */
  px: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The done badge (MISSIONS-PAGE, the Paved UX Book's Missions): the book's painted green check, its own dark rim, what a done
 * mission's medallion and a claimed gift wear. Decorative: the medallion's button, the card or the gift's tooltip says it is done.
 */
export function CheckBadge({ px, className, style }: CheckBadgeProps) {
  return (
    <img
      {...missionPartSources("check-badge", px)}
      alt=""
      decoding="async"
      draggable={false}
      data-slot="check-badge"
      className={cn("block", className)}
      style={style}
    />
  );
}
