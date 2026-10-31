import { useLayoutEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { artSources, LEAGUE_ART, PLATE_FACE, type LeagueTier } from "./league-standards";

/** The plate's sizes, as its name's font size (never under 12 px): 12, 14, 18 and 24 px; `inherit` takes the parent's. */
const PLATE_REM = { sm: 0.75, md: 0.875, lg: 1.125, xl: 1.5, inherit: null } as const;
export type LeaguePlateSize = keyof typeof PLATE_REM;

/** The plate's width in its name's em. */
const PLATE_EM = 10;
const { width: W, height: H } = LEAGUE_ART.plate;
/** The name's size and the face's width, in the frame's units (the plate is `W` wide, `PLATE_EM` names' em). */
const FONT = W / PLATE_EM;
const INNER = W * PLATE_FACE;

/**
 * Squeeze the name to the plate's face when its rendered width passes it (a count of letters cannot tell "WWWW" from "iiii"): measured
 * before paint without a squeeze, and again when a font finishes loading (Almendra may come after the first paint).
 */
function useFitText(name: string) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const text = ref.current;
    // No layout to measure (a test's DOM): the name stays as set.
    if (!text || typeof text.getComputedTextLength !== "function") return;
    const fit = () => {
      text.removeAttribute("textLength");
      text.removeAttribute("lengthAdjust");
      if (text.getComputedTextLength() > INNER) {
        text.setAttribute("textLength", String(INNER));
        text.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    };
    fit();
    const fonts = document.fonts;
    let live = true;
    fonts?.addEventListener("loadingdone", fit);
    void fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      fonts?.removeEventListener("loadingdone", fit);
    };
  }, [name]);
  return ref;
}

export interface LeaguePlateProps {
  tier: LeagueTier;
  /** The name it shows, with its division ("Iron II"). */
  name: string;
  /** 14 px (`md`) by default. */
  size?: LeaguePlateSize;
  className?: string;
}

/**
 * A league's nameplate (issue 917): the plate's image, a dark face in a frame of the tier's metal, and the name over it in the app's
 * display font (`font-display`, the owner's decision, not the design's lettering), its size the component's font size. The plate is
 * 10 names' em wide whatever the name; a name whose rendered width passes its face is squeezed to fit (`useFitText`).
 */
export function LeaguePlate({ tier, name, size = "md", className }: LeaguePlateProps) {
  const rem = PLATE_REM[size];
  const ref = useFitText(name);
  return (
    <span
      role="img"
      aria-label={name}
      data-slot="league-plate"
      data-tier={tier}
      className={cn("relative inline-block shrink-0", className)}
      style={{ ...(rem === null ? undefined : { fontSize: `${rem}rem` }), width: `${PLATE_EM}em`, height: `${(PLATE_EM * H) / W}em` }}
    >
      <img {...artSources("plate", tier, rem === null ? undefined : rem * 16 * PLATE_EM)} alt="" draggable={false} decoding="async" className="block" style={{ width: "100%", height: "100%" }} />
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" overflow="visible" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <text
          ref={ref}
          x={W / 2}
          y={H / 2 + 3}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={FONT}
          className="font-display"
          style={{ fill: "var(--game-light)", stroke: "var(--game-ink)" }}
          strokeWidth={12}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {name}
        </text>
      </svg>
    </span>
  );
}
