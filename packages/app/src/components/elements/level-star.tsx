import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { UiIcon } from "./ui-icon";

export interface LevelStarProps {
  level: number;
  className?: string;
}

/**
 * A player's level as the HUD draws it (CHAT-PAGE, the owner's ask of 2026-11-05: the profile's blue star, not a "Lv" chip): the
 * level bar's star (`level-bar.tsx`, the player card's and the profile's) with the level in it, two figures at most ("99+" past
 * them), still: no level up's turn. 28 px, the bar's. Named for screen readers ("Level 14").
 */
export function LevelStar({ level, className }: LevelStarProps) {
  return (
    <span role="img" aria-label={`Level ${formatInteger(level)}`} data-slot="level-star" className={cn("relative grid size-7 shrink-0 place-items-center", className)}>
      <UiIcon name="level-star" px={28} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
      <span aria-hidden className="text-outline relative text-xs leading-none font-bold text-foreground tabular-nums">
        {level > 99 ? "99+" : formatInteger(level)}
      </span>
    </span>
  );
}
