import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { UiIcon } from "./ui-icon";

/** `md`: 32 px, beside a name (a chat message, a conversation's head, the chat's list, the PvP search); `sm`: 28 px, in a list's row (Friends, Ranking). */
export type LevelStarSize = "sm" | "md";
const SIZES: Record<LevelStarSize, { box: string; px: number }> = { sm: { box: "size-7", px: 28 }, md: { box: "size-8", px: 32 } };

export interface LevelStarProps {
  level: number;
  size?: LevelStarSize;
  className?: string;
}

/**
 * A player's level as the HUD draws it (CHAT-PAGE, the owner's ask of 2026-11-05: the profile's blue star, not a "Lv" chip): the
 * level bar's star (`level-bar.tsx`, the player card's and the profile's) with the level in it, two figures at most ("99+" past
 * them), still: no level up's turn. Named for screen readers ("Level 14").
 * Sized so two figures (12 px, outlined, about 18 px wide) sit inside the drawing, which is 62 % of its box across them (LEVEL-STAR-SIZE): 32 px,
 * the bar's, or 28 px in a row. Its 2 px above and below overhang the line (`-my-0.5`): a row keeps the height it had with the smaller star.
 */
export function LevelStar({ level, size = "md", className }: LevelStarProps) {
  const { box, px } = SIZES[size];
  return (
    <span role="img" aria-label={`Level ${formatInteger(level)}`} data-slot="level-star" data-size={size} className={cn("relative -my-0.5 grid shrink-0 place-items-center", box, className)}>
      <UiIcon name="level-star" px={px} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
      <span aria-hidden className="text-outline relative text-xs leading-none font-bold text-foreground tabular-nums">
        {level > 99 ? "99+" : formatInteger(level)}
      </span>
    </span>
  );
}
