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

/** The avatar's box in px where nothing is laid out (the render tests): the phone's, the season dial's 96 px (issue 856). */
export const DEFAULT_BOX = 96;
/** The 144 px avatar's (from `tablet`): the thicker bar and the larger tag. */
const LARGE = 144;

/** The badge's width for an avatar `box` px wide (issue 928): at most 1.5 times it, the level tag included. */
export const badgeWidth = (box: number): number => 1.5 * box;
/** The bar's thickness in px, the tag's height inside its outline (issue 928's open point 1: the whole path, arc and line). */
export const barHeight = (box: number): number => (box >= LARGE ? 18 : 14);
/** The bar's outline in px, the tag's border: opaque, the background's colour. */
export const BAR_OUTLINE = 2;
/** The tag's figures in px: 12 (never less, P-69) beside the phones' avatars, 14 beside the 144 px one. */
export const tagFont = (box: number): number => (box >= LARGE ? 14 : 12);
/**
 * The level tag's fixed width in px, its outline included (issue 928): "Lv 99" in tabular figures (`numeric`, Space Mono's 0.6 em
 * advance: 5 ch), its padding and its outline, so every level from 1 to 99 takes the same tag.
 */
export const tagWidth = (box: number): number => (box >= LARGE ? 64 : 52);
/** The tag's text: "Lv i", "Lv" alone while the XP is read; past 99 (never: the cap is 20) "99+", so it stays in its width. */
export const tagText = (level: number | undefined): string => (level === undefined ? "Lv" : level > 99 ? "99+" : `Lv ${formatInteger(level)}`);

/**
 * The level's path (issue 830, reshaped by issue 928) round an avatar `box` px wide, in px: an arc round the avatar from its right
 * (3 o'clock) clockwise to its top (12 o'clock), inside its box with the outline, then a straight line to the right that ends
 * square where the level tag starts. `halo` is the outline's path, begun a little before the arc so its square start is outlined
 * too.
 */
export function levelPath(box: number) {
  const thick = barHeight(box);
  const r = box / 2 - thick / 2 - BAR_OUTLINE;
  const c = box / 2;
  const tag = badgeWidth(box) - tagWidth(box);
  const line = tag - c;
  const arc = 1.5 * Math.PI * r;
  const d = `M ${c + r} ${c} A ${r} ${r} 0 1 1 ${c} ${c - r} h ${line}`;
  const a = BAR_OUTLINE / r;
  const halo = `M ${c + r * Math.cos(a)} ${c - r * Math.sin(a)} A ${r} ${r} 0 1 1 ${c} ${c - r} h ${line}`;
  return { d, halo, arc, line, length: arc + line, r, c, thick, tag };
}

/**
 * Where a share of the level ends on the path, in px: the share is laid on the path's whole length, so the arc fills first, then
 * the line, in proportion.
 */
export function pathPoint(share: number, box: number): { x: number; y: number } {
  const { arc, length, r, c } = levelPath(box);
  const along = Math.min(1, Math.max(0, share)) * length;
  if (along <= arc) {
    const angle = along / r;
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
  }
  return { x: c + along - arc, y: c - r };
}

/**
 * The level tag at the line's end (issue 928): the bar's height and outline, its left edge square against the bar, its right end
 * rounded, a fixed width, the figures centred in gold on the plate's dark face (open point 2). `children` plays over its face.
 */
export function LevelTag({ box, children, over }: { box: number; children: ReactNode; over?: ReactNode }) {
  const thick = barHeight(box);
  return (
    <span
      data-slot="level"
      aria-hidden
      className="numeric pointer-events-none absolute top-0 flex items-center justify-center overflow-hidden rounded-r-full border border-l-0 border-background bg-resource-plate leading-none font-bold whitespace-nowrap text-primary perspective-[200px]"
      style={{ left: levelPath(box).tag, width: tagWidth(box), height: thick + 2 * BAR_OUTLINE, borderWidth: BAR_OUTLINE, borderLeftWidth: 0, fontSize: tagFont(box) }}
    >
      {over}
      {children}
    </span>
  );
}

/**
 * The path's drawing (issue 830, reshaped by issue 928), shared by `XpPath` and its still, at the row's top left over an avatar
 * `box` px wide: an opaque outline, the background's, so the bar reads on the sky, the opaque track (`--level-track`) drawn in
 * full, then the fill (`fill`) and what plays over it (`children`, SVG). Every end is square: the line meets the tag edge to edge.
 * `over` is HTML laid over the same box (the "+N XP").
 */
export function XpPathFrame({ box = DEFAULT_BOX, fill, children, over, className }: { box?: number; fill: ReactNode; children?: ReactNode; over?: ReactNode; className?: string }) {
  const { d, halo, thick, tag } = levelPath(box);
  return (
    <span data-slot="xp-path" aria-hidden className={cn("pointer-events-none absolute top-0 left-0", className)} style={{ width: tag, height: box }}>
      <svg viewBox={`0 0 ${tag} ${box}`} width={tag} height={box} className="absolute inset-0 overflow-visible">
        <path data-slot="xp-outline" d={halo} fill="none" strokeWidth={thick + 2 * BAR_OUTLINE} strokeLinecap="butt" className="stroke-background" />
        <path data-slot="xp-track" d={d} fill="none" strokeWidth={thick} strokeLinecap="butt" className="stroke-level-track" />
        {fill}
        {children}
      </svg>
      {over}
    </span>
  );
}

/** The fill's stroke, for `XpPathFrame`'s `fill`, at the bar's thickness. */
export const fillPath = (box: number) => ({ fill: "none", strokeWidth: barHeight(box), strokeLinecap: "butt", className: "stroke-primary" }) as const;

/** The path still, while `XpPath`'s chunk (the motion's) loads: the same drawing and tag, so nothing moves when it comes. */
export function XpPathStill({ progress, box = DEFAULT_BOX }: { progress: PlayerProgress | undefined; box?: number }) {
  const share = progress ? pathShare(progress) : 0;
  return (
    <>
      <XpPathFrame box={box} fill={share > 0 && <path data-slot="xp-fill" d={levelPath(box).d} pathLength={1} strokeDasharray={`${share} 1`} {...fillPath(box)} />} />
      <LevelTag box={box}>{tagText(progress?.level)}</LevelTag>
    </>
  );
}
