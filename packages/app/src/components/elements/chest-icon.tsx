import { useId } from "react";
import { cn } from "../../lib/utils";
import { CHEST_NAME, type ChestRank } from "./chest-badge";
import { chestParts, TONE_BASE, type ChestDirection, type ChestPart } from "./chest-designs";
import { DROP, mix, OUTLINE, RIM } from "./game-icon";

/** A part's colour: its tone's base, its voxel face lit or shaded. */
function baseOf(part: Pick<ChestPart, "tone" | "face">): string {
  const base = TONE_BASE[part.tone];
  if (part.face === "top") return `color-mix(in oklab, ${base} 72%, var(--foreground))`;
  if (part.face === "side") return `color-mix(in oklab, ${base} 62%, var(--background))`;
  return base;
}
const keyOf = (part: Pick<ChestPart, "tone" | "face">) => `${part.tone}${part.face ?? ""}`;

/** The relief's measures, in the grid's units: the icon takes the game icons' (issue 844); the art, drawn larger, thinner ones. */
export interface ReliefScale {
  outline: number;
  rim: number;
  drop: number;
}
export const ICON_RELIEF: ReliefScale = { outline: OUTLINE, rim: RIM, drop: DROP };

/** The lit gradient of each tone (and face) the parts use, and each part's mask for the light along its upper edges. */
export function ReliefDefs({ id, parts, rim }: { id: string; parts: readonly ChestPart[]; rim: number }) {
  const tones = [...new Map(parts.filter((p) => !p.line && !p.flat).map((p) => [keyOf(p), p])).values()];
  return (
    <>
      {tones.map((p) => (
        <linearGradient key={keyOf(p)} id={`${id}${keyOf(p)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix(baseOf(p), "hi") }} />
          <stop offset="0.45" style={{ stopColor: mix(baseOf(p), "mid") }} />
          <stop offset="1" style={{ stopColor: mix(baseOf(p), "lo") }} />
        </linearGradient>
      ))}
      {parts.map((p, i) =>
        p.line || p.flat ? null : (
          <mask key={i} id={`${id}r${i}`} maskUnits="userSpaceOnUse" x="-256" y="-512" width="1152" height="1280">
            <path d={p.d} transform={p.t} fill="white" />
            <path d={p.d} transform={`translate(0 ${rim})${p.t ? ` ${p.t}` : ""}`} fill="black" />
          </mask>
        ),
      )}
    </>
  );
}

/** The shadow: the parts, outline included, dropped; one layer at low opacity, so overlaps do not darken. */
export function ReliefShadow({ parts, scale }: { parts: readonly ChestPart[]; scale: ReliefScale }) {
  return (
    <g transform={`translate(0 ${scale.drop})`} opacity={0.45} style={{ fill: "var(--background)", stroke: "var(--background)" }} strokeLinejoin="round">
      {parts.map((p, i) => (p.line || p.flat ? null : <path key={i} d={p.d} transform={p.t} strokeWidth={scale.outline / (p.k ?? 1)} />))}
    </g>
  );
}

/**
 * The parts in the game icons' relief (issue 844's codes): each in its tone, a thick dark outline of its own hue, a lit gradient, a light
 * along its upper edges. A line (a seam, an engraving, filigree) is a stroke with no relief; a flat part (a keyhole) a plain fill.
 * `index` numbers the parts as `ReliefDefs` did, when the parts are drawn in more than one group.
 */
export function ReliefParts({ id, parts, scale, index = 0 }: { id: string; parts: readonly ChestPart[]; scale: ReliefScale; index?: number }) {
  return (
    <>
      {parts.map((p, n) => {
        const i = index + n;
        if (p.line) {
          const ink = p.tone === "ink";
          return (
            <path
              key={i}
              d={p.d}
              transform={p.t}
              fill="none"
              style={{ stroke: ink ? "var(--background)" : mix(baseOf(p), "hi") }}
              opacity={ink ? 0.4 : 0.9}
              strokeWidth={p.line}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (p.flat) return <path key={i} d={p.d} transform={p.t} style={{ fill: baseOf(p) }} />;
        const k = p.k ?? 1;
        return (
          <g key={i}>
            <path d={p.d} transform={p.t} style={{ fill: mix(baseOf(p), "edge"), stroke: mix(baseOf(p), "edge") }} strokeWidth={scale.outline / k} strokeLinejoin="round" />
            <path d={p.d} transform={p.t} fill={`url(#${id}${keyOf(p)})`} />
            <g mask={`url(#${id}r${i})`} opacity={0.55}>
              <path d={p.d} transform={p.t} style={{ fill: "var(--foreground)" }} />
            </g>
          </g>
        );
      })}
    </>
  );
}

/** The sizes, as the em of the SVG's height (its width 1.25em, as `GameIcon`): 16 to 48 px, issue 874's range; `inherit` takes the parent's. */
const SIZE_REM = { xs: 0.75, sm: 1, md: 1.5, lg: 2, xl: 3, inherit: null } as const;
export type ChestIconSize = keyof typeof SIZE_REM;

export interface ChestIconProps {
  direction: ChestDirection;
  rank: ChestRank;
  /** 24 px (`md`) by default. */
  size?: ChestIconSize;
  /** The accessible name: the chest's ("Gold chest") by default; `null` makes the icon decorative, hidden from assistive technology. */
  label?: string | null;
  className?: string;
}

/**
 * A chest's simple version (issue 874's proposal 3), to show as an icon (the battle logs, the attack's end, `ChestBadge`, the
 * explanations): Font Awesome's `treasure-chest` (the voxel direction its own blocks) in the rank's tones, its ornaments simplified,
 * in the game icons' relief. One SVG of its own paths, `GameIcon`'s box (1.25em by 1em), crisp from 16 to 48 px. The ranks differ by
 * their ornaments as well as their colours: bronze plain, silver studded, gold jewelled with a glint.
 */
export function ChestIcon({ direction, rank, size = "md", label, className }: ChestIconProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const parts = chestParts(direction, rank, "icon");
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const rem = SIZE_REM[size];
  return (
    <svg
      {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      viewBox="-32 0 640 512"
      width="1.25em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="chest-icon"
      data-direction={direction}
      data-rank={rank}
      className={cn("inline-block shrink-0 align-[-0.125em]", className)}
      style={rem === null ? undefined : { fontSize: `${rem}rem` }}
    >
      <defs>
        <ReliefDefs id={id} parts={parts} rim={ICON_RELIEF.rim} />
      </defs>
      <ReliefShadow parts={parts} scale={ICON_RELIEF} />
      <ReliefParts id={id} parts={parts} scale={ICON_RELIEF} />
    </svg>
  );
}
