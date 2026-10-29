import { useId } from "react";
import type { LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { DROP, mix, OUTLINE, RIM, type GameTone } from "./game-icon";
import { GAME_ICON_SHAPES } from "./game-icon-shapes";
import { CREST_SHAPES, type CrestShapeName } from "./league-crest-shapes";

/** A part's tone: a game icon's, or `league`, the crest's own group colour (`--league-*`, theme.css 3d). */
export type CrestTone = Exclude<GameTone, "current"> | "league";

/** Where a Font Awesome shape sits: its centre, its scale (1 is 512 units high), a turn in degrees, a mirror. */
interface Place {
  x: number;
  y: number;
  s: number;
  r?: number;
  flip?: boolean;
}

/** A crest's part: a Font Awesome shape (its subpaths in `tones`, a missing tone repeating the last), or a path drawn for Paved. */
type Part = ({ shape: CrestShapeName | "swords"; at: Place } | { d: string }) & { tones: readonly CrestTone[] };

const shapeOf = (name: CrestShapeName | "swords") => (name === "swords" ? GAME_ICON_SHAPES.swords : CREST_SHAPES[name]);

// The drawn parts, on the crests' 512 grid. A circle: two half arcs; reversed (`hole`), it cuts a ring out of the one before.
const circle = (x: number, y: number, r: number, hole = false) => `M${x - r} ${y}a${r} ${r} 0 1 ${hole ? 1 : 0} ${2 * r} 0a${r} ${r} 0 1 ${hole ? 1 : 0}-${2 * r} 0z`;
/** A cut gem, a diamond of half-width `r` (the Sovereign's). */
const diamond = (x: number, y: number, r: number) => `M${x} ${y - r}l${r} ${r}-${r} ${r}-${r}-${r}z`;
/** A star of `n` points (`out` to the tips, `inner` to the notches), pointing up: the Sovereign's burst. */
function star(n: number, out: number, inner: number, x = 256, y = 240): string {
  const pts = Array.from({ length: 2 * n }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? inner : out;
    return `${Math.round(x + r * Math.cos(a))} ${Math.round(y + r * Math.sin(a))}`;
  });
  return `M${pts.join("L")}z`;
}
/** A small coronet, `w` wide with its foot at (x, y): a band, three points, a pearl on each (the Baron's, the Earl's). */
function coronet(x: number, y: number, w: number): string {
  const h = w / 4;
  const l = x - w / 2;
  const q = w / 4;
  const pearl = w / 11;
  const band = `M${l} ${y}v-${h}l${q / 2} -${h}l${q / 2} ${h}l${q / 2} -${h * 1.4}l${q / 2} ${h * 1.4}l${q / 2} -${h}l${q / 2} ${h}v${h}z`;
  return band + circle(l + q, y - 2 * h - pearl, pearl) + circle(x, y - 2.4 * h - pearl, pearl) + circle(l + 3 * q, y - 2 * h - pearl, pearl);
}

/**
 * The ground every crest stands on, a disc in its group's colour (issue 854's open point 2: the colour stays each crest's dominant
 * tone), growing richer up the ladder (issue 854's climb the eye can read): a rim behind it, steel for the armed, gold for the nobles.
 */
const DISC = circle(256, 240, 184);
const RIM_DISC = circle(256, 240, 240);
const commoner = (): Part[] => [{ d: DISC, tones: ["league"] }];
/** Squire and Knight: a steel rim. */
const armed = (): Part[] => [{ d: RIM_DISC, tones: ["steel"] }, ...commoner()];
/** Baron, Earl, Duke: a gold rim. */
const noble = (): Part[] => [{ d: RIM_DISC, tones: ["gold"] }, ...commoner()];

/**
 * The nine crests (issue 854), Wanderer to Sovereign, each its own drawing in the game icons' relief: the ground, then the motif
 * (issue 854's proposal). Font Awesome Pro shapes composed and toned, or drawn for Paved where none fits (the round shield, the plume,
 * the coronets, the gems, the burst).
 */
export const CRESTS: Record<LeagueId, readonly Part[]> = {
  // A walking staff and a bundle on it.
  wanderer: [...commoner(), { shape: "staff", at: { x: 214, y: 236, s: 0.72, r: -20 }, tones: ["wood"] }, { shape: "sack", at: { x: 316, y: 296, s: 0.4 }, tones: ["gold", "red"] }],
  // A sheaf of wheat: three ears, tied.
  peasant: [
    ...commoner(),
    { shape: "wheat", at: { x: 196, y: 236, s: 0.62, r: -70 }, tones: ["gold"] },
    { shape: "wheat", at: { x: 316, y: 236, s: 0.62, r: -20 }, tones: ["gold"] },
    { shape: "wheat", at: { x: 256, y: 220, s: 0.66, r: -45 }, tones: ["gold"] },
    { d: "M206 268h100v44H206z", tones: ["wood"] },
  ],
  // A longbow and its arrow.
  yeoman: [...commoner(), { shape: "bow-arrow", at: { x: 250, y: 246, s: 0.7 }, tones: ["wood", "steel"] }],
  // A round shield before a short sword.
  squire: [
    ...armed(),
    { shape: "sword", at: { x: 290, y: 200, s: 0.62 }, tones: ["steel", "gold"] },
    { d: circle(212, 290, 96), tones: ["wood"] },
    { d: circle(212, 290, 34), tones: ["steel"] },
  ],
  // A helm with a plume.
  knight: [
    ...armed(),
    { d: "M262 92c0-60 64-92 128-74-44 14-56 50-50 92z", tones: ["red"] },
    { shape: "helmet-battle", at: { x: 256, y: 262, s: 0.6 }, tones: ["steel"] },
  ],
  // A shield under a small coronet.
  baron: [...noble(), { shape: "shield", at: { x: 256, y: 284, s: 0.5 }, tones: ["blue"] }, { d: coronet(256, 158, 170), tones: ["gold"] }],
  // A banner under a coronet.
  earl: [...noble(), { shape: "flag-swallowtail", at: { x: 270, y: 284, s: 0.52 }, tones: ["red"] }, { d: coronet(256, 158, 170), tones: ["gold"] }],
  // Crossed swords under a ducal crown.
  duke: [
    ...noble(),
    { shape: "swords", at: { x: 256, y: 290, s: 0.56 }, tones: ["gold", "steel", "steel", "gold"] },
    { shape: "crown", at: { x: 256, y: 136, s: 0.34 }, tones: ["gold"] },
  ],
  // A royal crown with gems, on a burst.
  sovereign: [
    { d: star(12, 304, 252), tones: ["gold"] },
    ...noble(),
    { shape: "crown", at: { x: 256, y: 236, s: 0.62 }, tones: ["gold"] },
    { d: diamond(256, 292, 38), tones: ["red"] },
  ],
};

/** The divisions (issue 854): III, II, I as one to three studs on a plate at the crest's foot. Wanderer and Sovereign have none. */
export type CrestDivision = 1 | 2 | 3;
/** A division's studs: III one, II two, I three, so the climb adds a stud. */
export const STUDS: Record<CrestDivision, number> = { 3: 1, 2: 2, 1: 3 };
const PLATE_TONE: Record<LeagueId, CrestTone> = {
  wanderer: "wood",
  peasant: "wood",
  yeoman: "wood",
  squire: "steel",
  knight: "steel",
  baron: "gold",
  earl: "gold",
  duke: "gold",
  sovereign: "gold",
};
/** The division's plate and its studs: the plate as wide as its studs need. */
export function divisionParts(league: LeagueId, division: CrestDivision): Part[] {
  const n = STUDS[division];
  const gap = 92;
  const w = n * gap + 48;
  const plate = `M${256 - w / 2 + 46} 404h${w - 92}a46 46 0 0 1 0 92h-${w - 92}a46 46 0 0 1 0-92z`;
  const studs = Array.from({ length: n }, (_, i) => circle(256 + (i - (n - 1) / 2) * gap, 450, 30)).join("");
  return [
    { d: plate, tones: [PLATE_TONE[league]] },
    { d: studs, tones: [PLATE_TONE[league] === "gold" ? "red" : "light"] },
  ];
}

/** A part ready to draw: its path (one per tone run), its tone, its transform onto the crest's grid and that transform's scale. */
export interface CrestPath {
  d: string;
  tone: CrestTone;
  t?: string;
  k: number;
}

/** The crest's parts in drawing order. */
export function crestParts(league: LeagueId, division?: CrestDivision): CrestPath[] {
  const parts = division && league !== "wanderer" && league !== "sovereign" ? [...CRESTS[league], ...divisionParts(league, division)] : CRESTS[league];
  return parts.flatMap((part) => {
    if ("d" in part) return [{ d: part.d, tone: part.tones[0]!, k: 1 }];
    const shape = shapeOf(part.shape);
    const t = transformOf(part.at, shape.width);
    const out: CrestPath[] = [];
    shape.parts.forEach((d, i) => {
      const tone = part.tones[Math.min(i, part.tones.length - 1)]!;
      const last = out[out.length - 1];
      if (last && last.tone === tone) last.d += d;
      else out.push({ d, tone, t, k: part.at.s });
    });
    return out;
  });
}

/** The SVG transform of a placed shape: from its own box (width by 512) to its centre on the crest's grid. */
function transformOf(place: Place, width: number): string {
  const { x, y, s, r = 0, flip } = place;
  return `translate(${x} ${y}) rotate(${r}) scale(${flip ? -s : s} ${s}) translate(${-width / 2} -256)`;
}

/**
 * The sizes, as the em of the SVG (1em square): 16 to 96 px, issue 854's 24, 40 and 96 among them; `inherit` takes the parent's font size.
 * An inline font size, not a class: the stylesheet's budget gains nothing from the crests.
 */
const SIZE_REM = { sm: 1, md: 1.5, lg: 2.5, xl: 4, "2xl": 6, inherit: null } as const;
export type CrestArtSize = keyof typeof SIZE_REM;

export interface CrestArtProps {
  /** 24 px (`md`) by default. */
  size?: CrestArtSize;
  league: LeagueId;
  /** The division (Peasant to Duke): 3 for III, 2 for II, 1 for I. None draws the crest alone. */
  division?: CrestDivision;
  /** The accessible name. Without it the crest is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
}

/**
 * A league group's crest (issue 854): its own drawing, Wanderer's staff to the Sovereign's crown, in the game icons' relief (issue 844's codes:
 * each part in its tone, a thick dark outline, a lit gradient, a light along the upper edges, a shadow under it), and the division's
 * studs at its foot. One SVG of its own paths, 1em square, crisp from 24 to 96 px. The study of issue 854's first pull request (Storybook);
 * its second draws `LeagueCrest` with it.
 */
export function CrestArt({ league, division, size = "md", label, className }: CrestArtProps) {
  const rem = SIZE_REM[size];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const base = (tone: CrestTone) => (tone === "league" ? `var(--league-${league})` : tone === "light" ? "var(--game-light)" : `var(--game-${tone})`);
  const parts = crestParts(league, division);
  return (
    <svg
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      viewBox="0 0 512 512"
      width="1em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="crest-art"
      data-league={league}
      data-division={division}
      className={cn("inline-block shrink-0 align-[-0.125em]", className)}
      style={rem === null ? undefined : { fontSize: `${rem}rem` }}
    >
      <defs>
        {[...new Set(parts.map((p) => p.tone))].map((t) => (
          <linearGradient key={t} id={`${id}${t}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: mix(base(t), "hi") }} />
            <stop offset="0.45" style={{ stopColor: mix(base(t), "mid") }} />
            <stop offset="1" style={{ stopColor: mix(base(t), "lo") }} />
          </linearGradient>
        ))}
        {parts.map((p, i) => (
          // The light along the upper edges: the part, less itself moved down (on the crest's grid, whatever the shape's turn).
          <mask key={i} id={`${id}r${i}`} maskUnits="userSpaceOnUse" x="-256" y="-256" width="1024" height="1024">
            <path d={p.d} transform={p.t} fill="white" />
            <path d={p.d} transform={`translate(0 ${RIM})${p.t ? ` ${p.t}` : ""}`} fill="black" />
          </mask>
        ))}
      </defs>
      {/* The shadow: the whole crest, outline included, dropped; one layer at low opacity, so overlaps do not darken. */}
      <g transform={`translate(0 ${DROP})`} opacity={0.45} style={{ fill: "var(--game-ink)", stroke: "var(--game-ink)" }} strokeLinejoin="round">
        {parts.map((p, i) => (
          <path key={i} d={p.d} transform={p.t} strokeWidth={OUTLINE / p.k} />
        ))}
      </g>
      {parts.map((p, i) => (
        <g key={i}>
          <path d={p.d} transform={p.t} style={{ fill: mix(base(p.tone), "edge"), stroke: mix(base(p.tone), "edge") }} strokeWidth={OUTLINE / p.k} strokeLinejoin="round" />
          <path d={p.d} transform={p.t} fill={`url(#${id}${p.tone})`} />
          <g mask={`url(#${id}r${i})`} opacity={0.55}>
            <path d={p.d} transform={p.t} style={{ fill: "var(--game-light)" }} />
          </g>
        </g>
      ))}
    </svg>
  );
}
