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

/** The XP left as a line: "120 XP to Lv 8", or "Max level" at the cap. */
export function xpLeftText(progress: PlayerProgress): string {
  return isMaxLevel(progress) ? "Max level" : `${formatInteger(xpLeft(progress))} XP to Lv ${formatInteger(progress.level + 1)}`;
}

/** The same for the control's accessible name: "level 7, 120 XP to level 8", or "level 20, max level". */
export function levelLabel(progress: PlayerProgress): string {
  const level = `level ${formatInteger(progress.level)}`;
  return isMaxLevel(progress) ? `${level}, max level` : `${level}, ${formatInteger(xpLeft(progress))} XP to level ${formatInteger(progress.level + 1)}`;
}

/** The share the path draws, from 0 to 1: full at the cap. */
export const pathShare = (progress: PlayerProgress): number =>
  isMaxLevel(progress) ? 1 : Math.min(1, Math.max(0, progress.xp / progress.xpForNext));

/** The room over the avatar's box (the badge's `pt-3`), where the "Lv i" plate stands out over the line. */
const PLATE_ROOM = 12;

/** The avatar's box (`PlayerAvatar`'s `md`), the path's width in its band, and the arc's radius and centre. */
export const PATH_BOX = 44;
const STROKE = 3;
const R = (PATH_BOX - STROKE) / 2;
const C = PATH_BOX / 2;
/** Three quarters of a circle: from 3 o'clock, clockwise, to 12 o'clock. */
const ARC = 1.5 * Math.PI * R;

/**
 * The level's path (issue 830) for a name column `column` px wide: an arc round the avatar from its right (3 o'clock) clockwise to
 * its top (12 o'clock), then a straight line to the right, to the column's end (where "Lv i" stands). Its lengths in px.
 */
export function levelPath(column: number) {
  const line = C + Math.max(0, column);
  return { d: `M ${C + R} ${C} A ${R} ${R} 0 1 1 ${C} ${C - R} h ${line}`, arc: ARC, line, length: ARC + line };
}

/**
 * Where a share of the level ends on the path, in the avatar box's px: the share is laid on the path's whole length, so the arc
 * fills first, then the line, in proportion.
 */
export function pathPoint(share: number, column: number): { x: number; y: number } {
  const { arc, length } = levelPath(column);
  const along = Math.min(1, Math.max(0, share)) * length;
  if (along <= arc) {
    const angle = along / R;
    return { x: C + R * Math.cos(angle), y: C + R * Math.sin(angle) };
  }
  return { x: C + along - arc, y: C - R };
}

/** The "Lv i" plate at the line's end (issue 830): in the row's flow, its middle on the line. */
export function LevelPlate({ children }: { children: ReactNode }) {
  return (
    <span
      data-slot="level"
      className="numeric relative z-10 -mt-2 flex h-5 shrink-0 items-center rounded-md border border-primary/60 bg-resource-plate px-1.5 text-xs leading-none font-bold whitespace-nowrap text-primary shadow-[inset_0_2px_0_var(--resource-shade)] perspective-[200px]"
    >
      {children}
    </span>
  );
}

/**
 * The path's drawing (issue 830), shared by `XpPath` and its still, over the avatar's box at the row's top left, in the units of a
 * 44 px box scaled to `box` px (`column` in those units): a dark halo so the
 * track reads on the sky, the track drawn in full, then the fill (`fill`) and what plays over it (`children`, SVG). `over` is
 * HTML laid over the same box (the "+N XP").
 */
export function XpPathFrame({ column, box = PATH_BOX, fill, children, over, className }: { column: number; box?: number; fill: ReactNode; children?: ReactNode; over?: ReactNode; className?: string }) {
  const { d } = levelPath(column);
  const width = PATH_BOX + column;
  // Drawn at the avatar's size (issue 856: the season dial's on the home), the line's stroke with it.
  const k = box / PATH_BOX;
  return (
    <span data-slot="xp-path" aria-hidden className={cn("pointer-events-none absolute left-0", className)} style={{ top: PLATE_ROOM, width: width * k, height: box }}>
      <svg viewBox={`0 0 ${width} ${PATH_BOX}`} width={width * k} height={box} className="absolute inset-0 overflow-visible">
        <path d={d} fill="none" strokeWidth={STROKE + 2} strokeLinecap="round" className="stroke-background/70" />
        <path d={d} fill="none" strokeWidth={STROKE} strokeLinecap="round" className="stroke-primary/25" />
        {fill}
        {children}
      </svg>
      {over}
    </span>
  );
}

/** The fill's stroke, for `XpPathFrame`'s `fill`. */
export const FILL_PATH = { fill: "none", strokeWidth: STROKE, strokeLinecap: "round", className: "stroke-primary" } as const;

/** The path still, while `XpPath`'s chunk (the motion's) loads: the same drawing and plate, so nothing moves when it comes. */
export function XpPathStill({ progress, column, box }: { progress: PlayerProgress | undefined; column: number; box?: number }) {
  const share = progress ? pathShare(progress) : 0;
  return (
    <>
      <XpPathFrame column={column} box={box} fill={share > 0 && <path data-slot="xp-fill" d={levelPath(column).d} pathLength={1} strokeDasharray={`${share} 1`} {...FILL_PATH} />} />
      <LevelPlate>{progress ? `Lv ${formatInteger(progress.level)}` : "Lv"}</LevelPlate>
    </>
  );
}
