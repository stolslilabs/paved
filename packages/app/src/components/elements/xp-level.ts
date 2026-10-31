import { formatInteger } from "@paved/game-core";
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
export const LARGE = 144;

/** The badge's width for an avatar `box` px wide (issue 928): at most 1.5 times it, the level tag included. */
export const badgeWidth = (box: number): number => 1.5 * box;
/**
 * The level tag's fixed width in px, its outline included (issue 928): "Lv 99" in tabular figures (`numeric`, Space Mono's 0.6 em
 * advance: 5 ch), its padding and its outline, so every level from 1 to 99 takes the same tag.
 */
export const tagWidth = (box: number): number => (box >= LARGE ? 64 : 52);

/** The bar's thickness in px, the tag's height inside its outline (issue 928's open point 1: the whole path, arc and line). */
export const barHeight = (box: number): number => (box >= LARGE ? 18 : 14);
/** The bar's outline in px, the tag's border (`border-2`): opaque, the background's colour. */
export const BAR_OUTLINE = 2;

/**
 * The name's corner beside an avatar `box` px wide, in px (the owner on #928, 2026-10-31): between the bar's wrapping end (its round
 * cap at 3 o'clock, outline included) and its horizontal run, from the cap's left edge to the badge's end, under the tag. 78 to 144
 * and 21 px high beside the 96 px avatar, 90 to 162 and 27 beside the 108, 122 to 216 and 39 beside the 144.
 */
export function nameCorner(box: number): { left: number; top: number; height: number } {
  const edge = barHeight(box) + 2 * BAR_OUTLINE;
  // The arc's middle runs `edge / 2` inside the box: the run's underside is `edge` from the top, the cap's top `edge / 2` above the middle.
  return { left: box - edge, top: edge, height: box / 2 - 1.5 * edge };
}
