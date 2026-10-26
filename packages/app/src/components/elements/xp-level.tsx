import { formatInteger } from "@paved/game-core";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { PlayerProgress } from "./xp-ring";

/**
 * At the level cap (20, issue 734): the view's next level is its floor (`levelStatus`), so nothing is left to make. Read from the
 * view, not from `LEVEL_CAP`: a raised cap shows without a client change.
 */
export const isMaxLevel = ({ xpForNext }: PlayerProgress): boolean => xpForNext <= 0;

/** The XP the current level still needs; 0 at the cap. */
export const xpLeft = (progress: PlayerProgress): number => (isMaxLevel(progress) ? 0 : Math.max(0, progress.xpForNext - progress.xp));

/** What the XP bar (issue 787) says under it: "120 XP to Lv 8", or "Max level" at the cap. */
export function xpLeftText(progress: PlayerProgress): string {
  return isMaxLevel(progress) ? "Max level" : `${formatInteger(xpLeft(progress))} XP to Lv ${formatInteger(progress.level + 1)}`;
}

/** The same for the control's accessible name: "level 7, 120 XP to level 8", or "level 20, max level". */
export function levelLabel(progress: PlayerProgress): string {
  const level = `level ${formatInteger(progress.level)}`;
  return isMaxLevel(progress) ? `${level}, max level` : `${level}, ${formatInteger(xpLeft(progress))} XP to level ${formatInteger(progress.level + 1)}`;
}

/** The bar's layout (issue 787), shared by `XpBar` and its still: the level, the track with its fill, the XP left under it. */
export function XpBarFrame({ level, fill, children, left, className }: { level: ReactNode; fill: ReactNode; children?: ReactNode; left: string; className?: string }) {
  return (
    <span data-slot="xp-bar" aria-hidden className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1.5">
        <span data-slot="level" className="numeric shrink-0 overflow-hidden text-xs leading-none font-bold text-primary perspective-[200px]">
          {level}
        </span>
        <span className="relative h-2 min-w-0 flex-1 rounded-full bg-primary/25">
          <span className="absolute inset-0 overflow-hidden rounded-full">{fill}</span>
          {children}
        </span>
      </span>
      <span data-slot="xp-left" className="numeric truncate text-xs leading-4 text-muted-foreground">
        {left}
      </span>
    </span>
  );
}

/** The share the bar draws, from 0 to 1: full at the cap. */
export const barShare = (progress: PlayerProgress): number =>
  isMaxLevel(progress) ? 1 : Math.min(1, Math.max(0, progress.xp / progress.xpForNext));

/** The bar still, while `XpBar`'s chunk (the motion's) loads: the same box, so nothing moves when it comes. */
export function XpBarStill({ progress, className }: { progress: PlayerProgress | undefined; className?: string }) {
  return (
    <XpBarFrame
      level={progress ? `Lv ${formatInteger(progress.level)}` : "Lv"}
      fill={<span data-slot="xp-fill" className="absolute inset-0 origin-left rounded-full bg-primary" style={{ transform: `scaleX(${progress ? barShare(progress) : 0})` }} />}
      left={progress ? xpLeftText(progress) : " "}
      className={className}
    />
  );
}
