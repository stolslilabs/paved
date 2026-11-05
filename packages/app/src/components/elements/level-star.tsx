import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { UiIcon } from "./ui-icon";

/**
 * A player's level in the HUD's blue star (the level bar's star, still: the owner's ask of 2026-11-05, in place of "Lv 12" in the
 * friends' lists): the star 24 px, the level outlined in its middle, two figures at most ("99+" past them). `role="img"`, named
 * "Level 12". FRIENDS-PAGE; the Chat page drew the same star (CHAT-PAGE): one of the two to keep.
 */
export function LevelStar({ level, className }: { level: number; className?: string }) {
  return (
    <span role="img" aria-label={`Level ${formatInteger(level)}`} data-slot="level-star" className={cn("relative grid size-6 shrink-0 place-items-center", className)}>
      <UiIcon name="level-star" px={24} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
      <span aria-hidden className="text-outline relative text-xs leading-none font-bold text-foreground tabular-nums">
        {level > 99 ? "99+" : formatInteger(level)}
      </span>
    </span>
  );
}
