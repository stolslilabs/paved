import { formatInteger } from "@paved/game-core";
import type { ReactNode, SVGProps } from "react";
import { cn } from "../../lib/utils";
import { BAR_OUTLINE, badgeWidth, barHeight, DEFAULT_BOX, LARGE, pathShare, tagWidth } from "./xp-level";
import type { PlayerProgress } from "./xp-ring";

// The level's path's drawing (issue 928): `XpPath`'s chunk, never the home's first load (FIRST-LOAD). The badge's width is
// fixed by its classes, so nothing moves while it loads; what the first load needs (the widths, the labels) is `xp-level.ts`'s.

export { BAR_OUTLINE, barHeight };
/** The tag's figures in px: 12 (never less, P-69) beside the phones' avatars, 14 beside the 144 px one. */
export const tagFont = (box: number): number => (box >= LARGE ? 14 : 12);
/** The tag's text: "Lv i", "Lv" alone while the XP is read; past 99 (never: the cap is 20) "99+", so it stays in its width. */
export const tagText = (level: number | undefined): string => (level === undefined ? "Lv" : level > 99 ? "99+" : `Lv ${formatInteger(level)}`);

/**
 * The level's path (issue 830, reshaped by issue 928) round an avatar `box` px wide, in px: an arc round the avatar from its right
 * (3 o'clock) clockwise to its top (12 o'clock), inside its box with the outline, then a straight line to the right that ends
 * square where the level tag starts. Its start, the end that hugs the avatar, is round (the owner on #928, 2026-10-31): `StartCap`.
 */
export function levelPath(box: number) {
  const thick = barHeight(box);
  const r = box / 2 - thick / 2 - BAR_OUTLINE;
  const c = box / 2;
  const tag = badgeWidth(box) - tagWidth(box);
  const line = tag - c;
  const arc = 1.5 * Math.PI * r;
  return { d: `M ${c + r} ${c} A ${r} ${r} 0 1 1 ${c} ${c - r} h ${line}`, arc, line, length: arc + line, r, c, thick, tag };
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
      className="numeric pointer-events-none absolute top-0 flex items-center justify-center overflow-hidden rounded-r-full border-2 border-l-0 border-background bg-resource-plate leading-none font-bold whitespace-nowrap text-primary perspective-[200px]"
      style={{ left: levelPath(box).tag, width: tagWidth(box), height: thick + 2 * BAR_OUTLINE, fontSize: tagFont(box) }}
    >
      {over}
      {children}
    </span>
  );
}

/**
 * The round cap of the path's start (3 o'clock), `width` px across: a disc there, as SVG caps both ends of a path alike and the
 * line's end stays square into the tag. Its lower half lies on the path, so only the upper one shows. Drawn as a circle's stroke
 * (half the width, round a quarter of it), so it takes the bar's own `stroke-*` classes and adds no CSS.
 */
export function StartCap({ box, width, ...rest }: { box: number; width: number } & Omit<SVGProps<SVGCircleElement>, "width">) {
  const { r, c } = levelPath(box);
  return <circle cx={c + r} cy={c} r={width / 4} fill="none" strokeWidth={width / 2} {...rest} />;
}

/**
 * The path's drawing (issue 830, reshaped by issue 928), shared by `XpPath` and its still, at the row's top left over an avatar
 * `box` px wide: an opaque outline, the background's, so the bar reads on the sky, the opaque track (`--level-track`) drawn in
 * full, then the fill (`fill`) and what plays over it (`children`, SVG). The start is round (`StartCap`), the line's end square: it
 * meets the tag edge to edge.
 * `over` is HTML laid over the same box (the "+N XP").
 */
export function XpPathFrame({ box = DEFAULT_BOX, fill, children, over, className }: { box?: number; fill: ReactNode; children?: ReactNode; over?: ReactNode; className?: string }) {
  const { d, thick, tag } = levelPath(box);
  return (
    <span data-slot="xp-path" aria-hidden className={cn("pointer-events-none absolute top-0 left-0", className)} style={{ width: tag, height: box }}>
      <svg viewBox={`0 0 ${tag} ${box}`} width={tag} height={box} className="absolute inset-0 overflow-visible">
        <path data-slot="xp-outline" d={d} fill="none" strokeWidth={thick + 2 * BAR_OUTLINE} strokeLinecap="butt" className="stroke-background" />
        <StartCap data-slot="xp-outline-cap" box={box} width={thick + 2 * BAR_OUTLINE} className="stroke-background" />
        <path data-slot="xp-track" d={d} fill="none" strokeWidth={thick} strokeLinecap="butt" className="stroke-level-track" />
        <StartCap data-slot="xp-track-cap" box={box} width={thick} className="stroke-level-track" />
        {fill}
        {children}
      </svg>
      {over}
    </span>
  );
}

/** The fill's stroke, for `XpPathFrame`'s `fill`, at the bar's thickness; its start's cap is `StartCap` with `fillCap`. */
export const fillPath = (box: number) => ({ fill: "none", strokeWidth: barHeight(box), strokeLinecap: "butt", className: "stroke-primary" }) as const;
/** The fill's round start, for `StartCap`. */
export const fillCap = (box: number) => ({ "data-slot": "xp-fill-cap", box, width: barHeight(box), className: "stroke-primary" }) as const;

/** The path still, while `XpPath`'s chunk (the motion's) loads: the same drawing and tag, so nothing moves when it comes. */
export function XpPathStill({ progress, box = DEFAULT_BOX }: { progress: PlayerProgress | undefined; box?: number }) {
  const share = progress ? pathShare(progress) : 0;
  return (
    <>
      <XpPathFrame
        box={box}
        fill={
          share > 0 && (
            <>
              <path data-slot="xp-fill" d={levelPath(box).d} pathLength={1} strokeDasharray={`${share} 1`} {...fillPath(box)} />
              <StartCap {...fillCap(box)} />
            </>
          )
        }
      />
      <LevelTag box={box}>{tagText(progress?.level)}</LevelTag>
    </>
  );
}
