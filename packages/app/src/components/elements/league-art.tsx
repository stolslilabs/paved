import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { mix } from "./game-icon";
import { TONES, type Part, type Place, type Tone } from "./league-standards";

/** The relief's measures on a drawing's grid: the outline's width, the shadow's drop, the depth of the light along the upper edges. */
export interface Relief {
  outline: number;
  drop: number;
  rim: number;
}

/** A placed part's transform: from its own origin to its place on the grid. */
const transformOf = ({ x, y, s = 1, r = 0, flip }: Place) =>
  `translate(${x} ${y})${r ? ` rotate(${r})` : ""}${s !== 1 || flip ? ` scale(${flip ? -s : s} ${s})` : ""}`;

export interface ArtSvgProps {
  parts: readonly Part[];
  relief: Relief;
  viewBox: string;
  /** The SVG's size in em: its width and height. */
  width: number;
  height: number;
  /** A transform of the whole drawing (the icon form's, which fits the crest to its square). */
  frame?: string;
  /** The accessible name. Without it the drawing is decorative and hidden from assistive technology. */
  label?: string;
  slot: string;
  data?: Record<`data-${string}`, string | number | undefined>;
  className?: string;
  style?: CSSProperties;
  /** Drawn over the parts, with no relief (the plate's name). */
  children?: ReactNode;
}

/**
 * A drawing of toned parts in the game icons' relief (issue 844's codes): each part outlined in its own hue darkened, filled with a lit
 * gradient (its top toward the light, its foot toward the ink), a light along its upper edges, and the whole drawing's shadow under it.
 * A `flat` part is a groove in its tone's outline colour. One SVG of its own paths, sized in em.
 */
export function ArtSvg({ parts, relief, viewBox, width, height, frame, label, slot, data, className, style, children }: ArtSvgProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const drawn = parts.map((p) => ({ ...p, t: p.at && transformOf(p.at), k: (p.at?.s ?? 1) / (p.w ?? 1) }));
  const raised = drawn.flatMap((p, i) => (p.flat ? [] : [{ p, i }]));
  const base = (tone: Tone) => TONES[tone];
  return (
    <svg
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      viewBox={viewBox}
      width={`${width}em`}
      height={`${height}em`}
      overflow="visible"
      focusable="false"
      data-slot={slot}
      {...data}
      className={cn("inline-block shrink-0", className)}
      style={style}
    >
      <defs>
        {[...new Set(raised.map(({ p }) => p.tone))].map((t) => (
          <linearGradient key={t} id={`${id}${t}`} x2="0" y2="1">
            <stop style={{ stopColor: mix(base(t), "hi") }} />
            <stop offset="0.45" style={{ stopColor: mix(base(t), "mid") }} />
            <stop offset="1" style={{ stopColor: mix(base(t), "lo") }} />
          </linearGradient>
        ))}
        {raised.map(({ p, i }) => (
          // The light along the upper edges: the part, less itself moved down (on the grid, whatever the part's turn).
          <mask key={i} id={`${id}r${i}`} maskUnits="userSpaceOnUse" x="-512" y="-512" width="2048" height="2048">
            <path d={p.d} transform={p.t} fill="white" />
            <path d={p.d} transform={`translate(0 ${relief.rim})${p.t ? ` ${p.t}` : ""}`} fill="black" />
          </mask>
        ))}
      </defs>
      <g transform={frame}>
        {/* The shadow: the whole drawing, outline included, dropped; one layer at low opacity, so overlaps do not darken. */}
        <g transform={`translate(0 ${relief.drop})`} opacity={0.45} style={{ fill: "var(--game-ink)", stroke: "var(--game-ink)" }} strokeLinejoin="round">
          {raised.map(({ p, i }) => (
            <path key={i} d={p.d} transform={p.t} strokeWidth={relief.outline / p.k} />
          ))}
        </g>
        {drawn.map((p, i) =>
          p.flat ? (
            <path key={i} d={p.d} transform={p.t} style={{ fill: mix(base(p.tone), "edge") }} />
          ) : (
            <g key={i}>
              <path d={p.d} transform={p.t} style={{ fill: mix(base(p.tone), "edge"), stroke: mix(base(p.tone), "edge") }} strokeWidth={relief.outline / p.k} strokeLinejoin="round" />
              <path d={p.d} transform={p.t} fill={`url(#${id}${p.tone})`} />
              <g mask={`url(#${id}r${i})`} opacity={0.5}>
                <path d={p.d} transform={p.t} style={{ fill: "var(--game-light)" }} />
              </g>
            </g>
          ),
        )}
        {children}
      </g>
    </svg>
  );
}
