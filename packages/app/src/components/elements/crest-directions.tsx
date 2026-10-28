import type { LeagueId } from "../../lib/pvp-rules";
import {
  circle,
  coronet,
  CrestSvg,
  diamond,
  divisionParts,
  hasDivisions,
  resolveParts,
  star,
  type CrestArtProps,
  type CrestMaterial,
  type CrestPath,
  type Part,
} from "./crest-art";

/**
 * The second crest study (issue 854, after the owner's "à refaire" of the first): every league draws one object, the same base shape from
 * Wanderer to Sovereign, in a material that climbs with the groups (wood, iron, bronze, silver, gold) and with more ornaments at each
 * step. Three directions carry that ladder, one object each, for the owner to pick one.
 */
export type CrestDirection = "shield" | "helm" | "medal";

/** The directions, by the one word the owner answers with. */
export const DIRECTIONS: readonly { id: CrestDirection; name: string; object: string }[] = [
  { id: "shield", name: "Shield", object: "a heater shield" },
  { id: "helm", name: "Helm", object: "a knight's helm, seen from the front" },
  { id: "medal", name: "Medal", object: "a round medal" },
];

/**
 * A group's step on the ladder, the same in every direction: the object's own material (`body`) and its frame's (a rim, the helm's
 * bands, the medal's edge; none on Wanderer's bare wood), the league's colour as an enamel inlay, rivets, a boss (metal, or a cut gem
 * from Earl), a coronet or a crown on top, a laurel around it, and the Sovereign's burst and side gems.
 */
export interface Rank {
  body: CrestMaterial;
  frame?: CrestMaterial;
  enamel?: boolean;
  rivets?: boolean;
  boss?: "metal" | "gem";
  top?: "coronet" | "crown";
  laurel?: boolean;
  burst?: boolean;
  gems?: boolean;
}

/** The ladder (issue 854's second study): each step adds a material or an ornament the eye can read. */
export const RANKS: Record<LeagueId, Rank> = {
  // Bare wood.
  wanderer: { body: "wood" },
  // Wood in an iron frame.
  peasant: { body: "wood", frame: "iron" },
  // Iron, riveted, with a boss.
  yeoman: { body: "iron", frame: "iron", rivets: true, boss: "metal" },
  // Bronze, and the league's colour inlaid.
  squire: { body: "bronze", frame: "bronze", enamel: true, boss: "metal" },
  // Silver, riveted.
  knight: { body: "silver", frame: "silver", enamel: true, rivets: true, boss: "metal" },
  // Gold, under a coronet.
  baron: { body: "gold", frame: "gold", enamel: true, rivets: true, boss: "metal", top: "coronet" },
  // A ruby for the boss, a laurel around.
  earl: { body: "gold", frame: "gold", enamel: true, rivets: true, boss: "gem", top: "coronet", laurel: true },
  // A crown for the coronet.
  duke: { body: "gold", frame: "gold", enamel: true, rivets: true, boss: "gem", top: "crown", laurel: true },
  // A burst behind, sapphires at the sides.
  sovereign: { body: "gold", frame: "gold", enamel: true, rivets: true, boss: "gem", top: "crown", laurel: true, burst: true, gems: true },
};

/** A group's material, the one its name gives the eye: its frame's (the division's plate takes it too). */
export const materialOf = (league: LeagueId): CrestMaterial => RANKS[league].frame ?? RANKS[league].body;

const r = Math.round;

/** A leaf from (x, y), `l` long and `w` wide, along the angle `a` (radians, y down). */
function leaf(x: number, y: number, a: number, l = 78, w = 24): string {
  const [ux, uy, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
  const [mx, my] = [x + (ux * l) / 2, y + (uy * l) / 2];
  return `M${r(x)} ${r(y)}Q${r(mx + nx * w)} ${r(my + ny * w)} ${r(x + ux * l)} ${r(y + uy * l)}Q${r(mx - nx * w)} ${r(my - ny * w)} ${r(x)} ${r(y)}z`;
}

/** A laurel: five leaves up each side of a circle round (x, y), from its foot to its shoulders, each turned outward from the tangent. */
function laurel(x: number, y: number, radius: number): string {
  return [60, 36, 12, -12, -36]
    .flatMap((deg) => {
      const a = (deg * Math.PI) / 180;
      const [bx, by] = [radius * Math.cos(a), radius * Math.sin(a)];
      const up = a - Math.PI / 2 + 0.5;
      return [leaf(x + bx, y + by, up), leaf(x - bx, y + by, Math.PI - up)];
    })
    .join("");
}

/** A ring: a circle less a smaller one (a wood grain's year). */
const ring = (x: number, y: number, radius: number, width = 10) => circle(x, y, radius) + circle(x, y, radius - width, true);

/** A rounded bar from (x, y), `w` by `h`: a plank's groove, the helm's slit. */
const bar = (x: number, y: number, w: number, h: number) => {
  const q = Math.min(w, h) / 2;
  return w >= h ? `M${x + q} ${y}h${w - 2 * q}a${q} ${q} 0 0 1 0 ${h}h-${w - 2 * q}a${q} ${q} 0 0 1 0-${h}z` : `M${x} ${y + q}a${q} ${q} 0 0 1 ${w} 0v${h - 2 * q}a${q} ${q} 0 0 1-${w} 0z`;
};

/** Where a direction's shared ornaments sit: the object's centre (laurel, burst), its boss, its coronet's foot, its crown's centre. */
interface Frame {
  cx: number;
  cy: number;
  laurel: number;
  boss: { x: number; y: number };
  coronet: number;
  crown: number;
  gems: readonly [number, number][];
}

/** The ornaments behind the object: the Sovereign's burst, then the laurel. */
function behind(rank: Rank, f: Frame): Part[] {
  return [
    ...(rank.burst ? [{ d: star(14, 290, 244, f.cx, f.cy), tones: ["gold"] } as Part] : []),
    ...(rank.laurel ? [{ d: laurel(f.cx, f.cy, f.laurel), tones: ["green"] } as Part] : []),
  ];
}

/** The ornaments over it: the boss, the side gems, the coronet or the crown. */
function over(rank: Rank, f: Frame): Part[] {
  const metal = rank.frame ?? rank.body;
  const { x, y } = f.boss;
  return [
    ...(rank.boss === "metal" ? [{ d: circle(x, y, 34), tones: [metal], w: 0.6 } as Part] : []),
    ...(rank.boss === "gem" ? [{ d: diamond(x, y, 40), tones: ["red"], w: 0.6 } as Part] : []),
    ...(rank.gems ? [{ d: f.gems.map(([gx, gy]) => diamond(gx, gy, 26)).join(""), tones: ["blue"], w: 0.6 } as Part] : []),
    ...(rank.top === "coronet" ? [{ d: coronet(256, f.coronet, 150), tones: ["gold"] } as Part] : []),
    ...(rank.top === "crown" ? [{ shape: "crown", at: { x: 256, y: f.crown, s: 0.3 }, tones: ["gold"] } as Part] : []),
  ];
}

// Shield: a heater shield, its rim the frame, its field the body or the league's enamel; Wanderer's and Peasant's of planks.
const SHIELD = "M96 88q160-44 320 0v124c0 112-72 176-160 208c-88-32-160-96-160-208z";
const SHIELD_FIELD = "M148 132q108-30 216 0v84c0 80-50 128-108 154c-58-26-108-74-108-154z";
const SHIELD_RIVETS = [circle(124, 112, 14), circle(388, 112, 14), circle(124, 200, 14), circle(388, 200, 14), circle(178, 334, 14), circle(334, 334, 14)].join("");
const SHIELD_FRAME: Frame = { cx: 256, cy: 250, laurel: 206, boss: { x: 256, y: 238 }, coronet: 132, crown: 94, gems: [[124, 156], [388, 156]] };

function shield(rank: Rank): Part[] {
  const framed = rank.frame !== undefined;
  const grooves = framed ? bar(214, 130, 12, 202) + bar(286, 130, 12, 202) : bar(196, 84, 12, 284) + bar(304, 84, 12, 284);
  return [
    ...behind(rank, SHIELD_FRAME),
    { d: SHIELD, tones: [rank.frame ?? rank.body] },
    ...(framed && (rank.enamel || rank.body !== rank.frame) ? [{ d: SHIELD_FIELD, tones: [rank.enamel ? "league" : rank.body], w: 0.5 } as Part] : []),
    ...(rank.body === "wood" ? [{ d: grooves, tones: ["wood"], flat: true } as Part] : []),
    ...(rank.rivets ? [{ d: SHIELD_RIVETS, tones: [rank.frame!], w: 0.5 } as Part] : []),
    ...over(rank, SHIELD_FRAME),
  ];
}

// Helm: a great helm seen from the front, its eye slit and breaths cut in; the frame its brow band, comb and nasal; the enamel its plume.
const HELM = "M128 300V214C128 140 190 84 256 56c66 28 128 84 128 158v86c0 56-36 92-80 112H208c-44-20-80-56-80-112z";
const HELM_SLIT = bar(160, 236, 192, 32);
const HELM_BREATHS = [circle(186, 322, 10), circle(216, 344, 10), circle(326, 322, 10), circle(296, 344, 10)].join("");
const HELM_BANDS = "M124 176h264v44H124z" + bar(238, 62, 36, 116) + bar(238, 220, 36, 90);
const HELM_PLUME = "M318 136c-12-84 60-130 166-112-58 24-78 72-72 128z";
const HELM_RIVETS = [circle(152, 198, 12), circle(198, 198, 12), circle(314, 198, 12), circle(360, 198, 12)].join("");
const HELM_FRAME: Frame = { cx: 256, cy: 250, laurel: 196, boss: { x: 256, y: 198 }, coronet: 140, crown: 100, gems: [[176, 140], [336, 140]] };

function helm(rank: Rank): Part[] {
  return [
    ...behind(rank, HELM_FRAME),
    ...(rank.enamel ? [{ d: HELM_PLUME, tones: ["league"] } as Part] : []),
    { d: HELM, tones: [rank.body] },
    { d: HELM_SLIT + HELM_BREATHS + (rank.frame ? "" : bar(250, 72, 12, 148)), tones: [rank.body], flat: true },
    ...(rank.frame ? [{ d: HELM_BANDS, tones: [rank.frame], w: 0.5 } as Part] : []),
    ...(rank.rivets ? [{ d: HELM_RIVETS, tones: [rank.frame!], w: 0.5 } as Part] : []),
    ...over(rank, HELM_FRAME),
  ];
}

// Medal: a round medal, its edge the frame, its face the body or the league's enamel; a wooden one shows its grain.
const MEDAL = circle(256, 252, 160);
const MEDAL_FIELD = circle(256, 252, 110);
const MEDAL_RIVETS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
  .map((deg) => circle(r(256 + 136 * Math.cos((deg * Math.PI) / 180)), r(252 + 136 * Math.sin((deg * Math.PI) / 180)), 13))
  .join("");
const MEDAL_FRAME: Frame = { cx: 256, cy: 252, laurel: 184, boss: { x: 256, y: 252 }, coronet: 124, crown: 100, gems: [[120, 252], [392, 252]] };

function medal(rank: Rank): Part[] {
  const framed = rank.frame !== undefined;
  return [
    ...behind(rank, MEDAL_FRAME),
    { d: MEDAL, tones: [rank.frame ?? rank.body] },
    ...(framed && (rank.enamel || rank.body !== rank.frame) ? [{ d: MEDAL_FIELD, tones: [rank.enamel ? "league" : rank.body], w: 0.5 } as Part] : []),
    ...(rank.body === "wood" ? [{ d: framed ? ring(256, 252, 72) + ring(256, 252, 40) : ring(256, 252, 112) + ring(256, 252, 72) + ring(256, 252, 36), tones: ["wood"], flat: true } as Part] : []),
    ...(rank.rivets ? [{ d: MEDAL_RIVETS, tones: [rank.frame!], w: 0.5 } as Part] : []),
    ...(rank.boss === "metal" ? [{ d: star(5, 64, 28, 256, 256), tones: [rank.frame!], w: 0.6 } as Part] : []),
    ...over({ ...rank, boss: rank.boss === "gem" ? "gem" : undefined }, MEDAL_FRAME),
  ];
}

const DRAW: Record<CrestDirection, (rank: Rank) => Part[]> = { shield, helm, medal };

/** Each direction's base shape, the one every group draws (issue 854's one structure). */
export const BASE_SHAPES: Record<CrestDirection, string> = { shield: SHIELD, helm: HELM, medal: MEDAL };

/** A direction's crest of a group, its division's plate (in the group's material) at its foot, in drawing order. */
export function directionParts(direction: CrestDirection, league: LeagueId, division?: CrestArtProps["division"]): CrestPath[] {
  const parts = DRAW[direction](RANKS[league]);
  return resolveParts(division && hasDivisions(league) ? [...parts, ...divisionParts(league, division, materialOf(league))] : parts);
}

export interface CrestDirectionArtProps extends CrestArtProps {
  direction: CrestDirection;
}

/**
 * A league group's crest in one of the second study's directions (issue 854): the direction's one object in the group's material and
 * ornaments, the division's studs at its foot, in the game icons' relief (`CrestSvg`, as `CrestArt`). Storybook only, until the
 * owner picks a direction; `LeagueCrest` draws it in issue 854's second pull request.
 */
export function CrestDirectionArt({ direction, league, division, ...frame }: CrestDirectionArtProps) {
  return <CrestSvg {...frame} slot="crest-direction" league={league} division={division} data={{ "data-direction": direction }} parts={directionParts(direction, league, division)} />;
}
