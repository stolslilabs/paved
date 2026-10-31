import { cn } from "../../lib/utils";
import { CHEST_NAME, type ChestRank } from "./chest-designs";
import { chestIconSources } from "./chest-images";

/** The sizes, as the rem of the icon's height (its width 1.25em, as `GameIcon`): 12 to 48 px; `inherit` takes the parent's. */
const SIZE_REM = { xs: 0.75, sm: 1, md: 1.5, lg: 2, xl: 3, inherit: null } as const;
export type ChestIconSize = keyof typeof SIZE_REM;
/** The height `inherit` picks its copy for: `ChestBadge`'s largest chest (3.75rem). */
const INHERIT_PX = 60;

export interface ChestIconProps {
  rank: ChestRank;
  /** 24 px (`md`) by default. */
  size?: ChestIconSize;
  /** The accessible name: the chest's ("Epic chest") by default; `null` makes the icon decorative, hidden from assistive technology. */
  label?: string | null;
  className?: string;
}

/**
 * A chest's icon (the battle logs, the attack's end, `ChestBadge`, the explanations): the closed chest seen from the front, its
 * shapes bolder and its outline thicker than the art's, so a rank reads at 16 px by its silhouette as well as its colour (basic oak
 * and iron, rare silver and sapphire, epic gold, crown and rubies). An image of `chest-images.ts` in `GameIcon`'s box (1.25em by
 * 1em), its copy picked for its height and the screen's density; it loads lazily, so a long battle log fetches only what it shows.
 */
export function ChestIcon({ rank, size = "md", label, className }: ChestIconProps) {
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const rem = SIZE_REM[size];
  return (
    <img
      {...chestIconSources(rank, rem === null ? INHERIT_PX : rem * 16)}
      alt={name ?? ""}
      aria-hidden={name ? undefined : true}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-slot="chest-icon"
      data-rank={rank}
      className={cn("inline-block shrink-0 select-none align-[-0.125em]", className)}
      style={{ width: "1.25em", height: "1em", ...(rem !== null && { fontSize: `${rem}rem` }) }}
    />
  );
}
