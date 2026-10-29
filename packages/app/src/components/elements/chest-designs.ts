import type { ChestRank } from "./chest-badge";
import { CHEST_SHAPES } from "./chest-art-shapes";
import { CREST_SHAPES } from "./league-crest-shapes";

/**
 * The chests' study (#874, its first pull request): three directions for the owner to pick, each in the three ranks and in two
 * versions, the simple icon (`ChestIcon`) and the detailed art that opens (`ChestArt`). This file holds their drawings as parts on
 * one grid (576 wide, Font Awesome's `treasure-chest` box, its height 512), each part toned and on the lid or the body, so the
 * lid can swing apart. The ornaments grow with the rank (#874's proposal 2): bronze plain bands and a simple lock; silver studs,
 * corner guards and a keyhole plate; gold gems, engraved plating and a glow at rest (drawn by `ChestArt`).
 */
export type ChestDirection = "wood" | "coffer" | "voxel";

export const CHEST_DIRECTIONS: readonly { id: ChestDirection; letter: string; name: string; note: string }[] = [
  { id: "wood", letter: "A", name: "Wooden chests, metal bands", note: "Bronze iron bands on oak, silver studs and corners on darker wood, gold plating with engraved corners and a jewelled lock." },
  { id: "coffer", letter: "B", name: "Treasure coffers", note: "Rounded lids: bronze riveted, silver filigree, gold with gems set in the lid and a crown on the lock." },
  { id: "voxel", letter: "C", name: "Voxel chests", note: "The board's voxel look: bronze plain, silver trimmed, gold with gems, opened with voxels of light." },
];

export const CHEST_RANKS: readonly ChestRank[] = ["bronze", "silver", "gold"];

/**
 * A part's tone. The metals are the ranks' medal colours (theme.css); the gems are the game icons' tones; `ink` is the inside of a
 * keyhole, `light` a stud. The woods, the leather, the velvet and the enamel are mixed from the game icons' tones toward the ink, so
 * the stylesheet (and its budget) carries nothing for the chests: the bronze chest's oak darker than its bronze bands, so they part;
 * the darker wood of the silver and gold chests; the bronze coffer's leather, the silver's enamel, the gold's velvet.
 */
export type ChestTone =
  | "bronze"
  | "silver"
  | "gold"
  | "oak"
  | "walnut"
  | "leather"
  | "velvet"
  | "enamel"
  | "ruby"
  | "sapphire"
  | "emerald"
  | "ink"
  | "light";

export const TONE_BASE: Readonly<Record<ChestTone, string>> = {
  bronze: "var(--medal-3)",
  silver: "var(--medal-2)",
  gold: "var(--medal-1)",
  oak: "color-mix(in oklab, var(--game-wood) 78%, var(--background))",
  walnut: "color-mix(in oklab, var(--game-wood) 52%, var(--background))",
  leather: "color-mix(in oklab, var(--game-wood) 38%, var(--background))",
  velvet: "color-mix(in oklab, var(--game-red) 62%, var(--background))",
  enamel: "color-mix(in oklab, var(--game-blue) 68%, var(--background))",
  ruby: "var(--game-red)",
  sapphire: "var(--game-blue)",
  emerald: "var(--game-green)",
  ink: "var(--background)",
  light: "var(--foreground)",
};

/** Each rank's light (the opening's rays, the glow at rest): its medal colour. */
export const RANK_LIGHT: Readonly<Record<ChestRank, string>> = { bronze: "var(--medal-3)", silver: "var(--medal-2)", gold: "var(--medal-1)" };

export interface ChestPart {
  d: string;
  tone: ChestTone;
  /** The lid swings open; the body stays. */
  layer: "lid" | "body";
  /** In one version only: the simple icon or the detailed art. */
  only?: "icon" | "art";
  /** A voxel chest's face: its top lit, its side shaded. */
  face?: "top" | "side";
  /** Drawn as a line this wide, with no fill and no relief: the planks' seams, engravings, filigree. */
  line?: number;
  /** Filled plain, with no outline or light: a keyhole. */
  flat?: boolean;
  /** A placed shape (the coffer's crown): its transform, and that transform's scale for the outline's width. */
  t?: string;
  k?: number;
}

/** The hinge's height on the grid: the lid above, the body below; the light bursts from there. */
export const HINGE: Readonly<Record<ChestDirection, number>> = { wood: 272, coffer: 272, voxel: 288 };

// Shapes on the grid.
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}
const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const diamond = (x: number, y: number, r: number) => `M${x} ${y - r}l${r} ${r}-${r} ${r}-${r}-${r}z`;
const poly = (...pts: readonly (readonly [number, number])[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join("L")}z`;
/** A four-pointed sparkle, the gold icon's glint. */
const sparkle = (x: number, y: number, r: number) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z`;
/** A keyhole: a round head over a flared slot. */
const keyhole = (x: number, y: number, r: number) => `${circle(x, y, r)}M${x - r * 0.45} ${y}L${x - r * 0.8} ${y + 2.6 * r}h${1.6 * r}L${x + r * 0.45} ${y}z`;
/** The grid mirrored about its middle: a part drawn once on the left. */
const MIRROR = "matrix(-1 0 0 1 576 0)";

/** Font Awesome's `treasure-chest`, by part: the lid's left, middle and right panels, the body's, the keyhole. */
const [FA_LID_L, FA_BODY_L, FA_BODY_M, FA_BODY_R, FA_LID_R, FA_LID_M, FA_KEYHOLE] = CHEST_SHAPES["treasure-chest"].parts;

const METAL: Readonly<Record<ChestRank, ChestTone>> = { bronze: "bronze", silver: "silver", gold: "gold" };
const at = (rank: ChestRank, from: ChestRank) => CHEST_RANKS.indexOf(rank) >= CHEST_RANKS.indexOf(from);

/** The simple icon on Font Awesome's shape: its end panels in the rank's metal, its middle in `middle`, the lock in `lock`. */
function faIcon(metal: ChestTone, middle: ChestTone, lock: string): ChestPart[] {
  return [
    { d: FA_LID_L! + FA_LID_R!, tone: metal, layer: "lid", only: "icon" },
    { d: FA_LID_M!, tone: middle, layer: "lid", only: "icon" },
    { d: FA_BODY_L! + FA_BODY_R!, tone: metal, layer: "body", only: "icon" },
    { d: FA_BODY_M!, tone: middle, layer: "body", only: "icon" },
    // The lock straddles the lid and the body: drawn last, over both.
    { d: lock, tone: metal, layer: "lid", only: "icon" },
    { d: FA_KEYHOLE!, tone: "ink", layer: "lid", only: "icon", flat: true },
  ];
}
/** The icon's studs, one on each end panel (silver and gold): the lid's, the body's. */
const iconStuds = (tone: ChestTone): ChestPart[] => [
  { d: circle(64, 150, 26) + circle(512, 150, 26), tone, layer: "lid", only: "icon" },
  { d: circle(64, 384, 26) + circle(512, 384, 26), tone, layer: "body", only: "icon" },
];

/** A. Wooden chests, metal bands. */
function wood(rank: ChestRank): ChestPart[] {
  const metal = METAL[rank];
  const timber: ChestTone = rank === "bronze" ? "oak" : "walnut";
  const silver = at(rank, "silver");
  const gold = rank === "gold";
  const bw = gold ? 80 : 64;
  const bands = (y: number, h: number) => rect(136 - bw / 2, y, bw, h) + rect(440 - bw / 2, y, bw, h);
  const parts: ChestPart[] = [
    ...faIcon(metal, timber, rrect(224, 192, 128, 160, 32)),
    // The detailed art: a domed lid and a body of planks, iron-banded.
    { d: "M0 272V160C0 89 57 32 128 32H448c71 0 128 57 128 128v112z", tone: timber, layer: "lid", only: "art" },
    { d: "M6 152H570", tone: "ink", layer: "lid", only: "art", line: 6 },
    { d: "M0 272h576v168c0 22-18 40-40 40H40c-22 0-40-18-40-40z", tone: timber, layer: "body", only: "art" },
    { d: "M6 344H570M6 412H570", tone: "ink", layer: "body", only: "art", line: 6 },
    { d: bands(38, 194), tone: metal, layer: "lid", only: "art" },
    { d: rect(0, 232, 576, 40), tone: metal, layer: "lid", only: "art" },
    { d: bands(308, 172), tone: metal, layer: "body", only: "art" },
    { d: rect(0, 272, 576, 36), tone: metal, layer: "body", only: "art" },
    { d: rrect(256, 212, 64, 80, 16), tone: metal, layer: "lid", only: "art" },
    silver
      ? { d: "M226 296h124v60c0 44-32 66-62 80-30-14-62-36-62-80z", tone: metal, layer: "body", only: "art" }
      : { d: rrect(240, 296, 96, 100, 18), tone: metal, layer: "body", only: "art" },
    { d: keyhole(288, silver ? 334 : 326, 13), tone: "ink", layer: "body", only: "art", flat: true },
  ];
  if (silver) {
    parts.push(
      ...iconStuds(gold ? "gold" : "light"),
      // Corner guards: the lid's top corners, the body's foot.
      { d: "M0 214V160C0 89 57 32 128 32h48z", tone: metal, layer: "lid", only: "art" },
      { d: "M0 214V160C0 89 57 32 128 32h48z", tone: metal, layer: "lid", only: "art", t: MIRROR, k: 1 },
      { d: "M0 376V440c0 22 18 40 40 40h64z", tone: metal, layer: "body", only: "art" },
      { d: "M0 376V440c0 22 18 40 40 40h64z", tone: metal, layer: "body", only: "art", t: MIRROR, k: 1 },
      // Studs down the bands and at the rims' ends.
      {
        d: [80, 140, 196].map((y) => circle(136, y, 12) + circle(440, y, 12)).join("") + circle(40, 252, 12) + circle(536, 252, 12),
        tone: gold ? "gold" : "light",
        layer: "lid",
        only: "art",
      },
      { d: [350, 404, 456].map((y) => circle(136, y, 12) + circle(440, y, 12)).join("") + circle(40, 290, 12) + circle(536, 290, 12), tone: gold ? "gold" : "light", layer: "body", only: "art" },
    );
  }
  if (gold) {
    parts.push(
      { d: diamond(288, 112, 52), tone: "ruby", layer: "lid", only: "icon" },
      { d: sparkle(556, 44, 72), tone: "gold", layer: "lid", only: "icon" },
      // Engraved plating: scrolls on the corner guards, a lozenge on each band.
      { d: "M18 188C26 116 70 66 140 50M24 452c4 10 12 16 24 18", tone: "ink", layer: "lid", only: "art", line: 5 },
      { d: "M18 188C26 116 70 66 140 50", tone: "ink", layer: "lid", only: "art", line: 5, t: MIRROR, k: 1 },
      { d: "M136 110l28 30-28 30-28-30zM440 110l28 30-28 30-28-30z", tone: "ink", layer: "lid", only: "art", line: 5 },
      { d: "M136 366l28 30-28 30-28-30zM440 366l28 30-28 30-28-30z", tone: "ink", layer: "body", only: "art", line: 5 },
      // The jewels: the lid's medallion, the hasp's stone, the lock's ruby.
      { d: circle(288, 128, 48), tone: "gold", layer: "lid", only: "art" },
      { d: diamond(288, 128, 30), tone: "emerald", layer: "lid", only: "art" },
      { d: circle(288, 246, 14), tone: "sapphire", layer: "lid", only: "art" },
      { d: diamond(288, 398, 22), tone: "ruby", layer: "body", only: "art" },
    );
  }
  return parts;
}

/** A filigree scroll: a wave with a curl at each end, `w` wide, centred on (x, y). */
const filigree = (x: number, y: number, w: number) => {
  const h = w / 2;
  return `M${x - h} ${y}c${h / 3} ${-h / 2} ${(2 * h) / 3} ${-h / 2} ${h} 0s${(2 * h) / 3} ${h / 2} ${h} 0M${x - h} ${y}c-14-10-6-28 8-24M${x + h} ${y}c14 10 6 28-8 24`;
};

/** B. Treasure coffers: a rounded lid framed in metal, a body on a plinth. */
function coffer(rank: ChestRank): ChestPart[] {
  const metal = METAL[rank];
  const cloth: ChestTone = rank === "bronze" ? "leather" : rank === "silver" ? "enamel" : "velvet";
  const silver = at(rank, "silver");
  const gold = rank === "gold";
  const parts: ChestPart[] = [
    ...faIcon(metal, cloth, circle(288, 272, 64)),
    { d: "M16 272V200C16 104 140 40 288 40S560 104 560 200v72z", tone: cloth, layer: "lid", only: "art" },
    // The lid's frame: the arch and its foot, one ring (the inner path runs the other way).
    { d: "M16 272V200C16 104 140 40 288 40S560 104 560 200v72zM524 240V200C524 128 416 76 288 76S52 128 52 200v40z", tone: metal, layer: "lid", only: "art" },
    { d: rect(262, 72, 52, 172), tone: metal, layer: "lid", only: "art" },
    { d: rect(24, 272, 528, 168), tone: cloth, layer: "body", only: "art" },
    { d: rect(24, 272, 56, 168) + rect(496, 272, 56, 168) + rect(24, 272, 528, 30), tone: metal, layer: "body", only: "art" },
    { d: rrect(0, 432, 576, 48, 18), tone: metal, layer: "body", only: "art" },
    { d: rrect(262, 214, 52, 80, 14), tone: metal, layer: "lid", only: "art" },
    { d: circle(288, 362, 50), tone: metal, layer: "body", only: "art" },
    { d: keyhole(288, 352, 12), tone: "ink", layer: "body", only: "art", flat: true },
    // Rivets, from bronze up: along the lid's foot, the posts and the plinth.
    { d: [44, 108, 172, 404, 468, 532].map((x) => circle(x, 258, 9)).join(""), tone: metal, layer: "lid", only: "art" },
    { d: [326, 384].map((y) => circle(52, y, 9) + circle(524, y, 9)).join("") + [40, 112, 184, 392, 464, 536].map((x) => circle(x, 456, 9)).join(""), tone: metal, layer: "body", only: "art" },
  ];
  if (silver) {
    parts.push(
      ...iconStuds(gold ? "gold" : "light"),
      { d: filigree(160, 170, 120) + filigree(416, 170, 120), tone: metal, layer: "lid", only: "art", line: 8 },
      { d: filigree(160, 372, 110) + filigree(416, 372, 110), tone: metal, layer: "body", only: "art", line: 8 },
    );
  }
  if (gold) {
    const crown = CREST_SHAPES.crown;
    parts.push(
      { d: crown.parts.join(""), tone: "gold", layer: "lid", only: "icon", t: "translate(288 116) scale(0.3) translate(-288 -256)", k: 0.3 },
      { d: sparkle(556, 44, 72), tone: "gold", layer: "lid", only: "icon" },
      // Gems set in the lid, a crown on the lock.
      { d: diamond(288, 112, 24), tone: "emerald", layer: "lid", only: "art" },
      { d: diamond(288, 178, 30), tone: "ruby", layer: "lid", only: "art" },
      { d: circle(160, 170, 18) + circle(416, 170, 18), tone: "sapphire", layer: "lid", only: "art" },
      { d: crown.parts.join(""), tone: "gold", layer: "body", only: "art", t: "translate(288 306) scale(0.2) translate(-288 -256)", k: 0.2 },
    );
  }
  return parts;
}

/** The voxels' size: the voxel chests are 11 voxels wide, their side one deep (an oblique view, up and to the right). */
const V = 48;
/** A voxel's top face at column `c` over the front edge `y`. */
const topFace = (c: number, y: number, n = 1) => poly([c * V, y], [c * V + V, y - V], [(c + n) * V + V, y - V], [(c + n) * V, y]);

/** C. Voxel chests: the board's voxel look, a lid three voxels high on a body of four. */
function voxel(rank: ChestRank): ChestPart[] {
  const metal = METAL[rank];
  const timber: ChestTone = rank === "bronze" ? "oak" : "walnut";
  const silver = at(rank, "silver");
  const gold = rank === "gold";
  const seams = (y0: number, y1: number) =>
    Array.from({ length: 10 }, (_, i) => `M${(i + 1) * V} ${y0}V${y1}`).join("") +
    Array.from({ length: (y1 - y0) / V - 1 }, (_, i) => `M0 ${y0 + (i + 1) * V}H528`).join("");
  const parts: ChestPart[] = [
    { d: rect(0, 144, 528, 144), tone: timber, layer: "lid" },
    { d: topFace(0, 144, 10), tone: timber, layer: "lid", face: "top" },
    { d: poly([528, 144], [576, 96], [576, 240], [528, 288]), tone: timber, layer: "lid", face: "side" },
    { d: rect(0, 288, 528, 192), tone: timber, layer: "body" },
    { d: poly([528, 288], [576, 240], [576, 432], [528, 480]), tone: timber, layer: "body", face: "side" },
    { d: seams(144, 288), tone: "ink", layer: "lid", only: "art", line: 4 },
    { d: seams(288, 480), tone: "ink", layer: "body", only: "art", line: 4 },
    // The bands: columns 1 and 9, down the lid and the body, over the lid's top.
    { d: rect(V, 144, V, 144) + rect(9 * V, 144, V, 144), tone: metal, layer: "lid" },
    { d: topFace(1, 144) + topFace(9, 144), tone: metal, layer: "lid", face: "top" },
    { d: rect(V, 288, V, 192) + rect(9 * V, 288, V, 192), tone: metal, layer: "body" },
    // The lock: a hasp of one voxel, a block of two by two.
    { d: rect(240, 240, V, V), tone: metal, layer: "lid" },
    { d: rect(216, 288, 2 * V, 2 * V), tone: metal, layer: "body" },
    { d: rect(258, 306, 12, 12) + rect(261, 318, 6, 24), tone: "ink", layer: "body", flat: true },
  ];
  if (silver) {
    // Trimmed: the corners in the metal, studs on the bands.
    parts.push(
      { d: rect(0, 144, V, V) + rect(480, 144, V, V), tone: metal, layer: "lid" },
      { d: topFace(0, 144) + topFace(10, 144), tone: metal, layer: "lid", face: "top" },
      { d: rect(0, 288, V, V) + rect(480, 288, V, V) + rect(0, 432, V, V) + rect(480, 432, V, V), tone: metal, layer: "body" },
      { d: [168, 216].map((y) => rect(V + 16, y + 8, 16, 16) + rect(9 * V + 16, y + 8, 16, 16)).join(""), tone: "light", layer: "lid", only: "art" },
      { d: [312, 360, 408, 456].map((y) => rect(V + 16, y - 8, 16, 16) + rect(9 * V + 16, y - 8, 16, 16)).join(""), tone: "light", layer: "body", only: "art" },
    );
  }
  if (gold) {
    // Gold: the lid's foot and the plinth trimmed, gems set in the bands and the hasp, a glint.
    parts.push(
      { d: rect(0, 240, 528, V), tone: "gold", layer: "lid" },
      { d: rect(0, 432, 528, V), tone: "gold", layer: "body" },
      { d: rect(252, 252, 24, 24), tone: "ruby", layer: "lid" },
      { d: rect(V + 12, 180, 24, 24) + rect(9 * V + 12, 180, 24, 24), tone: "sapphire", layer: "lid", only: "art" },
      { d: rect(V + 12, 372, 24, 24) + rect(9 * V + 12, 372, 24, 24), tone: "emerald", layer: "body", only: "art" },
      { d: sparkle(540, 64, 64), tone: "gold", layer: "lid", only: "icon" },
    );
  }
  return parts;
}

const DESIGNS: Readonly<Record<ChestDirection, (rank: ChestRank) => ChestPart[]>> = { wood, coffer, voxel };

/** A chest's parts in drawing order, for one version: the body first, then the lid (which swings over it). */
export function chestParts(direction: ChestDirection, rank: ChestRank, version: "icon" | "art"): ChestPart[] {
  const parts = DESIGNS[direction](rank).filter((p) => !p.only || p.only === version);
  return [...parts.filter((p) => p.layer === "body"), ...parts.filter((p) => p.layer === "lid")];
}
