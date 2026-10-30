import { useId, type CSSProperties } from "react";
import type { LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { circle, crestBase, diamond, SIZE_REM, type CrestArtProps, type CrestTone } from "./crest-art";
import { DROP } from "./game-icon";

/**
 * The third crest study (issue 854, after the owner turned down the second's Shield, Helm and Medal): a shield and swords for every
 * league. Wood and Iron a bare shield, Bronze one sword upright before it, Silver two crossed behind it, Gold both; from Emerald the
 * four pieces stay and the look climbs: the material, the shield's top (crenellated, then crowned), the pommels (cut gems), the guards.
 */
export interface ShieldRank {
  /** The shield's rim and the swords' metal. */
  metal: CrestTone;
  /** The shield's face. */
  face: CrestTone;
  /** None, one upright before the shield, two crossed behind it, or the three. */
  swords: 0 | 1 | 2 | 3;
  /** The shield's top: a plain curve, three merlons, five crown points. */
  top: "plain" | "crenellated" | "crowned";
  /** A gem for each pommel, in its tone; none keeps a ball of the metal. */
  gem?: CrestTone;
  /** Knobs at the guards' ends. */
  knobs?: boolean;
}

/** The ladder (issue 854's third study, the owner's): each step adds a sword, a shape or a material the eye can read at 24 px. */
export const SHIELD_RANKS: Record<LeagueId, ShieldRank> = {
  // A wooden shield, its planks grooved.
  wood: { metal: "wood", face: "wood", swords: 0, top: "plain" },
  // An iron shield.
  iron: { metal: "iron", face: "iron", swords: 0, top: "plain" },
  // Bronze, one sword upright before it.
  bronze: { metal: "bronze", face: "bronze", swords: 1, top: "plain" },
  // Silver, two swords crossed behind it.
  silver: { metal: "silver", face: "silver", swords: 2, top: "plain" },
  // Gold, the three swords.
  gold: { metal: "gold", face: "gold", swords: 3, top: "plain" },
  // Emerald, platinum, the shield crenellated.
  emerald: { metal: "platinum", face: "platinum", swords: 3, top: "crenellated" },
  // A blue face in an ice rim, ice swords, diamonds for pommels.
  diamond: { metal: "ice", face: "blue", swords: 3, top: "crenellated", gem: "ice" },
  // Obsidian in gold, rubies for pommels, knobbed guards.
  master: { metal: "gold", face: "obsidian", swords: 3, top: "crenellated", gem: "red", knobs: true },
  // Red enamel in gold, a crowned top, sapphires for pommels.
  grandmaster: { metal: "gold", face: "red", swords: 3, top: "crowned", gem: "blue", knobs: true },
};

/** A rounded bar from (x, y), `w` by `h`: a guard, a plank's groove. */
const bar = (x: number, y: number, w: number, h: number) => {
  const q = Math.min(w, h) / 2;
  return w >= h ? `M${x + q} ${y}h${w - 2 * q}a${q} ${q} 0 0 1 0 ${h}h-${w - 2 * q}a${q} ${q} 0 0 1 0-${h}z` : `M${x} ${y + q}a${q} ${q} 0 0 1 ${w} 0v${h - 2 * q}a${q} ${q} 0 0 1-${w} 0z`;
};

/**
 * A piece of the crest: its path, its tone, its outline's width in its own units (the crest's 72 at 24 px, thinner on the swords so
 * the silhouette keeps the thick one), and its one highlight, a lit facet (its left half). A `groove` is cut in, ink with no outline.
 */
export interface Piece {
  d: string;
  tone: CrestTone;
  w: number;
  facet?: string;
  groove?: boolean;
}

// The shield, 232 wide on the crest's 512 grid, its sides falling to a point; its top by rank. The face sits 32 inside the rim, its
// left half lit.
const SIDES = "v156c0 96-56 156-116 188c-60-32-116-92-116-188z";
export const SHIELD_TOPS: Record<ShieldRank["top"], string> = {
  plain: "M140 120q116-28 232 0v128c0 96-56 156-116 188c-60-32-116-92-116-188z",
  crenellated: "M140 64h36v60h40v-60h80v60h40v-60h36" + SIDES.replace("v156", "v184"),
  crowned: "M140 56l29 68 29-68 29 68 29-84 29 84 29-68 29 68 29-68" + SIDES.replace("v156", "v192"),
};
const FACE = "M172 156q84-20 168 0v92c0 72-40 118-84 142c-44-24-84-70-84-142z";
const FACE_LIT = "M172 156Q214 146 256 146V390C212 366 172 320 172 248z";
const PLANKS = bar(212, 166, 14, 200) + bar(286, 166, 14, 200);
/** The shield, a little under its drawn size so the crossed swords show past it. */
const SHIELD_T = "translate(256 264) scale(.84) translate(-256 -264)";

// A sword on its own grid, upright, its guard's centre at 0 0: the blade (a crossed one longer, so its tip passes the shield), its
// left half lit; the hilt (the grip, the guard, the pommel), drawn once and used by every sword.
const SWORD_W = 54;
const blade = (l: number): Piece => ({ d: `M-22 16h44v${l}l-22 36-22-36z`, tone: "iron", w: SWORD_W, facet: `M-22 16h22v${l + 36}l-22-36z` });
const GRIP = "M-14-66h28v68h-28z";
const GUARD = bar(-72, -15, 144, 30);
// Drawn the guard's way round, so where they overlap it they fill rather than cut.
const KNOBS = circle(-76, 0, 21, true) + circle(76, 0, 21, true);
const POMMEL = circle(0, -88, 25);
const GEM = diamond(0, -92, 34);

/**
 * Where the swords stand, all point up: the upright one before the shield, its guard low on the face and its hilt under the shield's
 * point; the crossed pair behind it, their hilts past its lower sides, their tips past its upper corners.
 */
const UPRIGHT = { t: "translate(256 374) rotate(180)", l: 170 };
const CROSSED = [-36, 36].map((a) => ({ t: `translate(256 250) rotate(${180 + a}) translate(0 -180) scale(.9)`, l: 430 }));

/** A sword in place: its transform and its blade (the hilt is shared). */
export interface SwordPlace {
  t: string;
  blade: Piece;
}

/** A league's crest: the crossed swords behind, the shield (Wood's planks grooved in it), the upright sword before, and the hilt they share. */
export interface ShieldModel {
  behind: SwordPlace[];
  shield: Piece[];
  before: SwordPlace[];
  hilt: Piece[];
}

export function shieldModel(league: LeagueId): ShieldModel {
  const rank = SHIELD_RANKS[league];
  const place = ({ t, l }: { t: string; l: number }): SwordPlace => ({ t, blade: { ...blade(l), tone: rank.metal } });
  return {
    behind: rank.swords >= 2 ? CROSSED.map(place) : [],
    shield: [
      { d: SHIELD_TOPS[rank.top], tone: rank.metal, w: 86 },
      { d: FACE, tone: rank.face, w: 34, facet: FACE_LIT },
      ...(league === "wood" ? [{ d: PLANKS, tone: "wood", w: 0, groove: true } as Piece] : []),
    ],
    before: rank.swords % 2 ? [place(UPRIGHT)] : [],
    hilt:
      rank.swords === 0
        ? []
        : [
            { d: GRIP, tone: "wood", w: SWORD_W },
            { d: GUARD + (rank.knobs ? KNOBS : ""), tone: rank.metal, w: SWORD_W },
            rank.gem ? { d: GEM, tone: rank.gem, w: SWORD_W } : { d: POMMEL, tone: rank.metal, w: SWORD_W },
          ],
  };
}

export type ShieldCrestProps = Omit<CrestArtProps, "division">;

/**
 * A league's crest in the third study (issue 854): a shield and up to three swords in flat materials, each piece with one lit facet,
 * a thick ink outline and a shadow. Its own SVG, kept small (under 3 kB): each piece one path that paints its outline under its fill
 * (`paint-order`), the metal's colour named once (`--m`), the hilt drawn once and used by every sword, the shadow one `<use>` of
 * the whole crest, inked by the `--s` it hands down. No division plate: the hilts fill the crest's foot, and the name beside it ("Silver II") carries the division.
 * Storybook only, until the owner's yes; `LeagueCrest` draws it in issue 854's second pull request.
 */
export function ShieldCrest({ league, size = "md", label, className }: ShieldCrestProps) {
  const model = shieldModel(league);
  const { metal } = SHIELD_RANKS[league];
  const rem = SIZE_REM[size];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ink = (base: string) => ({ fill: `var(--s,${base})` });
  const draw = (p: Piece, i: number) =>
    p.groove ? (
      <path key={i} d={p.d} style={ink("var(--game-ink)")} stroke="none" opacity={0.4} />
    ) : (
      <g key={i}>
        <path d={p.d} style={ink(p.tone === metal ? "var(--m)" : crestBase(p.tone, league))} strokeWidth={p.w} />
        {p.facet && <path d={p.facet} style={ink("var(--game-light)")} stroke="none" opacity={0.3} />}
      </g>
    );
  const sword = ({ t, blade }: SwordPlace, i: number) => (
    <g key={i} transform={t}>
      {draw(blade, 0)}
      <use href={`#${id}h`} />
    </g>
  );
  return (
    <svg
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      viewBox="0 0 512 512"
      width="1em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="shield-crest"
      data-league={league}
      className={cn("inline-block shrink-0 align-[-0.125em]", className)}
      style={{ ...(rem !== null && { fontSize: `${rem}rem` }), "--m": crestBase(metal, league) } as CSSProperties}
    >
      {model.hilt.length > 0 && (
        <defs>
          <g id={`${id}h`}>{model.hilt.map(draw)}</g>
        </defs>
      )}
      {/* The shadow: the whole crest, outline included, inked and dropped; one layer at low opacity, so overlaps do not darken. */}
      <use href={`#${id}k`} transform={`translate(0 ${DROP})`} opacity={0.45} style={{ "--s": "var(--game-ink)" } as CSSProperties} />
      <g id={`${id}k`} style={{ stroke: "var(--s,color-mix(in oklab,var(--game-ink) 80%,var(--game-stone)))", strokeLinejoin: "round", paintOrder: "stroke" }}>
        {model.behind.map(sword)}
        <g transform={SHIELD_T}>{model.shield.map(draw)}</g>
        {model.before.map(sword)}
      </g>
    </svg>
  );
}
