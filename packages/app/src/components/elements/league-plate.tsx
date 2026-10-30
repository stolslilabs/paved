import { ArtSvg, type Relief } from "./league-art";
import { PLATE, plateParts, type LeagueTier } from "./league-standards";

/** The plate's sizes, as its name's font size (never under 12 px): 12, 14, 18 and 24 px; `inherit` takes the parent's. */
const PLATE_REM = { sm: 0.75, md: 0.875, lg: 1.125, xl: 1.5, inherit: null } as const;
export type LeaguePlateSize = keyof typeof PLATE_REM;

const RELIEF: Relief = { outline: 8, drop: 5, rim: 4 };
/** Almendra Bold's mean advance, in em: how wide a name will set, to squeeze one that would pass the plate's face. */
const ADVANCE = 0.56;

export interface LeaguePlateProps {
  tier: LeagueTier;
  /** The name it shows, with its division ("Iron II"). */
  name: string;
  /** 14 px (`md`) by default. */
  size?: LeaguePlateSize;
  className?: string;
}

/**
 * A league's nameplate (issue 917): a dark face in a frame of the tier's metal with a stud at each end, the name in the app's display
 * font (`font-display`, the owner's decision, not the design's lettering), its size the component's font size. The plate is 10 names'
 * em wide whatever the name; a name too long for its face is squeezed to fit.
 */
export function LeaguePlate({ tier, name, size = "md", className }: LeaguePlateProps) {
  const rem = PLATE_REM[size];
  const squeeze = name.length * ADVANCE * PLATE.font > PLATE.inner;
  return (
    <ArtSvg
      parts={plateParts(tier)}
      relief={RELIEF}
      viewBox={`0 0 ${PLATE.width} ${PLATE.height}`}
      width={PLATE.width / PLATE.font}
      height={PLATE.height / PLATE.font}
      label={name}
      slot="league-plate"
      data={{ "data-tier": tier }}
      className={className}
      style={rem === null ? undefined : { fontSize: `${rem}rem` }}
    >
      <text
        x={PLATE.width / 2}
        y={PLATE.height / 2 + 2}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={PLATE.font}
        className="font-display"
        style={{ fill: "var(--game-light)", stroke: "var(--game-ink)" }}
        strokeWidth={8}
        strokeLinejoin="round"
        paintOrder="stroke"
        {...(squeeze && { textLength: PLATE.inner, lengthAdjust: "spacingAndGlyphs" })}
      >
        {name}
      </text>
    </ArtSvg>
  );
}
