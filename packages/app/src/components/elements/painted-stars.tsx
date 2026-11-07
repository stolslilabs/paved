import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { UiIcon, type UiIconSize } from "./ui-icon";

/** A star still to win, the book's (`GameEnd`'s, `attack-end`): the painted star in greys, its outline and its relief alone. */
export const EMPTY_STAR: CSSProperties = { filter: "grayscale(1) brightness(0.72) contrast(1.15)" };

export interface PaintedStarsProps {
  /** Stars earned, 0 to 3. */
  stars: number;
  /** A star's size, `UiIcon`'s: 20 px (`xs`) by default. */
  size?: UiIconSize;
  /** The accessible name; "2 of 3 stars" by default. */
  label?: string;
  className?: string;
}

/**
 * A Story level's three stars (STORY-PAGE), the book's painted star (`UiIcon` "star", the ends' and the Attack's): the earned ones in
 * gold, the others in greys (`EMPTY_STAR`), never Font Awesome's; the icons' lip under all three. Read as "2 of 3 stars".
 */
export function PaintedStars({ stars, size = "xs", label, className }: PaintedStarsProps) {
  const won = Math.min(Math.max(stars, 0), 3);
  return (
    <span role="img" aria-label={label ?? `${won} of 3 stars`} data-stars={won} className={cn("drawer-icon inline-flex shrink-0 items-center", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} data-lit={i < won || undefined} style={i < won ? undefined : EMPTY_STAR} className="block">
          <UiIcon name="star" size={size} className="block" />
        </span>
      ))}
    </span>
  );
}
