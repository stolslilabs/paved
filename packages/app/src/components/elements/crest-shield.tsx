import type { LeagueId } from "../../lib/pvp-rules";
import { circle, CrestSvg, diamond, type CrestArtProps, type CrestPath, type CrestTone } from "./crest-art";

/**
 * The third crest study (issue 854, after the owner turned down the second's Shield, Helm and Medal): a shield and swords for every
 * league. Wood and Iron a bare shield, Bronze one sword upright before it, Silver two crossed behind it, Gold both; from Platinum the
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
  // Platinum, the shield crenellated.
  platinum: { metal: "platinum", face: "platinum", swords: 3, top: "crenellated" },
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

// The shield, 232 wide on the crest's 512 grid, its sides falling to a point; its top by rank. The face sits 32 inside the rim.
const SIDES = "v156c0 96-56 156-116 188c-60-32-116-92-116-188z";
export const SHIELD_TOPS: Record<ShieldRank["top"], string> = {
  plain: "M140 120q116-28 232 0v128c0 96-56 156-116 188c-60-32-116-92-116-188z",
  crenellated: "M140 64h36v60h40v-60h80v60h40v-60h36" + SIDES.replace("v156", "v184"),
  crowned: "M140 56l29 68 29-68 29 68 29-84 29 84 29-68 29 68 29-68" + SIDES.replace("v156", "v192"),
};
const FACE = "M172 156q84-20 168 0v92c0 72-40 118-84 142c-44-24-84-70-84-142z";
const PLANKS = bar(212, 166, 14, 200) + bar(286, 166, 14, 200);

// A sword on its own grid, upright, its guard's centre at 0 0: the blade (a crossed one longer, so its tip passes the shield), the grip,
// the guard, the pommel.
const blade = (l: number) => `M-22 16h44v${l}l-22 36-22-36z`;
const GRIP = "M-14-66h28v68h-28z";
const GUARD = bar(-72, -15, 144, 30);
const KNOBS = circle(-76, 0, 21) + circle(76, 0, 21);
const POMMEL = circle(0, -88, 25);
const GEM = diamond(0, -92, 34);

/**
 * Where the swords stand, all point up: the upright one before the shield, its guard low on the face and its hilt under the shield's
 * point; the crossed pair behind it, their hilts past its lower sides, their tips past its upper corners.
 */
const UPRIGHT = { t: "translate(256 374) rotate(180)", blade: blade(170), k: 1 };
const CROSSED = [-36, 36].map((a) => ({ t: `translate(256 250) rotate(${180 + a}) translate(0 -180) scale(.9)`, blade: blade(430), k: 0.9 }));
/** The shield, a little under its drawn size so the crossed swords show past it. */
const SHIELD = { t: "translate(256 264) scale(.84) translate(-256 -264)", k: 0.84 };

/** A sword's outline, thinner than the shield's: the crest's silhouette keeps the thick one, its inner lines stay light. */
const K = 1.4;

function sword(rank: ShieldRank, { t, blade, k }: { t: string; blade: string; k: number }): CrestPath[] {
  return [
    { d: blade, tone: rank.metal, t, k: K * k },
    { d: GRIP, tone: "wood", t, k: K * k },
    { d: GUARD + (rank.knobs ? KNOBS : ""), tone: rank.metal, t, k: K * k },
    rank.gem ? { d: GEM, tone: rank.gem, t, k: K * k } : { d: POMMEL, tone: rank.metal, t, k: K * k },
  ];
}

/** A league's crest in drawing order: the crossed swords, the shield's rim and face (Wood's planks grooved in it), the upright sword. */
export function shieldParts(league: LeagueId): CrestPath[] {
  const rank = SHIELD_RANKS[league];
  return [
    ...(rank.swords >= 2 ? CROSSED.flatMap((t) => sword(rank, t)) : []),
    { d: SHIELD_TOPS[rank.top], tone: rank.metal, ...SHIELD },
    { d: FACE, tone: rank.face, t: SHIELD.t, k: 2.5 * SHIELD.k },
    ...(league === "wood" ? [{ d: PLANKS, tone: "wood", ...SHIELD, flat: true } as CrestPath] : []),
    ...(rank.swords % 2 ? sword(rank, UPRIGHT) : []),
  ];
}

/**
 * A league's crest in the third study (issue 854): a shield and up to three swords, flat materials with one light along their upper
 * edges, a thick dark outline and a shadow (`CrestSvg`'s flat finish). No division plate: the hilts fill the crest's foot, and the
 * name beside it ("Silver II") carries the division. Storybook only, until the owner's yes; `LeagueCrest` draws it in issue 854's
 * second pull request.
 */
export type ShieldCrestProps = Omit<CrestArtProps, "division">;

export function ShieldCrest({ league, ...frame }: ShieldCrestProps) {
  return <CrestSvg {...frame} flat slot="shield-crest" league={league} parts={shieldParts(league)} />;
}
