import { CHEST_SHAPES } from "./chest-art-shapes";

/** A chest's rank (issue 732): basic one tile with no choice, rare one of 2, epic one of 3. */
export type ChestRank = "basic" | "rare" | "epic";

/** The tiles a chest of each rank shows: the player keeps one. */
export const CHEST_CHOICES: Readonly<Record<ChestRank, number>> = { basic: 1, rare: 2, epic: 3 };
export const CHEST_NAME: Readonly<Record<ChestRank, string>> = { basic: "Basic chest", rare: "Rare chest", epic: "Epic chest" };

/**
 * The chests (issue 874): the owner's pick of the study, direction A (2026-10-29), wooden chests with metal bands, in the three ranks
 * and in two versions, the simple icon (`ChestIcon`) and the detailed art that opens (`ChestArt`). This file holds their drawings
 * as parts on one grid (576 wide, Font Awesome's `treasure-chest` box, its height 512), each part toned and on the lid or the
 * body, so the lid can swing apart. The ornaments grow with the rank (issue 874's proposal 2): basic bronze iron bands on oak and a
 * simple lock; rare silver studs, corner guards and a keyhole plate on darker wood; epic gold plating with engraved corners, a
 * jewelled lock and a glow at rest (drawn by `ChestArt`).
 */
export const CHEST_RANKS: readonly ChestRank[] = ["basic", "rare", "epic"];

/** The detailed art's sizes, as the rem of its square box: the slots' chests (`xs` three in a row once won, `sm`), the modal's (`lg`, `xl`). */
export const CHEST_ART_REM = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 } as const;
export type ChestArtSize = keyof typeof CHEST_ART_REM;
/** The opened chest, grey and dimmed: inline, so the stylesheet gains nothing. */
export const CHEST_SPENT = { filter: "grayscale(1)", opacity: 0.6 } as const;

/**
 * A part's tone. The metals are the ranks' medal colours (theme.css); the gems are the game icons' tones; `ink` is the inside of a
 * keyhole, `light` a stud. The woods and the velvet are mixed from the game icons' tones toward the ink, so the stylesheet (and its
 * budget) carries nothing for the chests: the basic chest's oak darker than its bronze bands, so they part; the darker wood of the
 * rare and epic chests; the velvet that lines the epic chest's lid.
 */
export type ChestTone =
  | "bronze"
  | "silver"
  | "gold"
  | "oak"
  | "walnut"
  | "velvet"
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
  velvet: "color-mix(in oklab, var(--game-red) 62%, var(--background))",
  ruby: "var(--game-red)",
  sapphire: "var(--game-blue)",
  emerald: "var(--game-green)",
  ink: "var(--background)",
  light: "var(--foreground)",
};

/** Each rank's light (the opening's rays, the glow at rest): its medal colour. */
export const RANK_LIGHT: Readonly<Record<ChestRank, string>> = { basic: "var(--medal-3)", rare: "var(--medal-2)", epic: "var(--medal-1)" };

export interface ChestPart {
  d: string;
  tone: ChestTone;
  /** The lid swings open; the body stays. */
  layer: "lid" | "body";
  /** In one version only: the simple icon or the detailed art. */
  only?: "icon" | "art";
  /** Drawn as a line this wide, with no fill and no relief: the planks' seams, engravings. */
  line?: number;
  /** Filled plain, with no outline or light: a keyhole. */
  flat?: boolean;
  /** A placed shape (a mirrored corner guard): its transform, and that transform's scale for the outline's width. */
  t?: string;
  k?: number;
}

/** The seam's height on the grid: the lid above, the body below. The lid's hinges sit on it, at the chest's back. */
export const HINGE = 272;

// Shapes on the grid.
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}
const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const diamond = (x: number, y: number, r: number) => `M${x} ${y - r}l${r} ${r}-${r} ${r}-${r}-${r}z`;
/** A four-pointed sparkle, the epic icon's glint. */
const sparkle = (x: number, y: number, r: number) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z`;
/** A keyhole: a round head over a flared slot. */
const keyhole = (x: number, y: number, r: number) => `${circle(x, y, r)}M${x - r * 0.45} ${y}L${x - r * 0.8} ${y + 2.6 * r}h${1.6 * r}L${x + r * 0.45} ${y}z`;
/** The grid mirrored about its middle: a part drawn once on the left. */
const MIRROR = "matrix(-1 0 0 1 576 0)";

/** Font Awesome's `treasure-chest`, by part: the lid's left, middle and right panels, the body's, the keyhole. */
const [FA_LID_L, FA_BODY_L, FA_BODY_M, FA_BODY_R, FA_LID_R, FA_LID_M, FA_KEYHOLE] = CHEST_SHAPES["treasure-chest"].parts;

const METAL: Readonly<Record<ChestRank, ChestTone>> = { basic: "bronze", rare: "silver", epic: "gold" };
/** Each rank's wood, and the lining of its lid seen once it swings open: the basic chest's oak, the rare's walnut, the epic's velvet. */
export const CHEST_WOOD: Readonly<Record<ChestRank, { timber: ChestTone; lining: ChestTone }>> = {
  basic: { timber: "oak", lining: "oak" },
  rare: { timber: "walnut", lining: "walnut" },
  epic: { timber: "walnut", lining: "velvet" },
};
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
/** The icon's studs, one on each end panel (rare and epic): the lid's, the body's. */
const iconStuds = (tone: ChestTone): ChestPart[] => [
  { d: circle(64, 150, 26) + circle(512, 150, 26), tone, layer: "lid", only: "icon" },
  { d: circle(64, 384, 26) + circle(512, 384, 26), tone, layer: "body", only: "icon" },
];

/** Wooden chests, metal bands (the study's direction A). */
function wood(rank: ChestRank): ChestPart[] {
  const metal = METAL[rank];
  const { timber } = CHEST_WOOD[rank];
  const rare = at(rank, "rare");
  const epic = rank === "epic";
  const bw = epic ? 80 : 64;
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
    rare
      ? { d: "M226 296h124v60c0 44-32 66-62 80-30-14-62-36-62-80z", tone: metal, layer: "body", only: "art" }
      : { d: rrect(240, 296, 96, 100, 18), tone: metal, layer: "body", only: "art" },
    { d: keyhole(288, rare ? 334 : 326, 13), tone: "ink", layer: "body", only: "art", flat: true },
  ];
  if (rare) {
    parts.push(
      ...iconStuds(epic ? "gold" : "light"),
      // Corner guards: the lid's top corners, the body's foot.
      { d: "M0 214V160C0 89 57 32 128 32h48z", tone: metal, layer: "lid", only: "art" },
      { d: "M0 214V160C0 89 57 32 128 32h48z", tone: metal, layer: "lid", only: "art", t: MIRROR, k: 1 },
      { d: "M0 376V440c0 22 18 40 40 40h64z", tone: metal, layer: "body", only: "art" },
      { d: "M0 376V440c0 22 18 40 40 40h64z", tone: metal, layer: "body", only: "art", t: MIRROR, k: 1 },
      // Studs down the bands and at the rims' ends.
      {
        d: [80, 140, 196].map((y) => circle(136, y, 12) + circle(440, y, 12)).join("") + circle(40, 252, 12) + circle(536, 252, 12),
        tone: epic ? "gold" : "light",
        layer: "lid",
        only: "art",
      },
      { d: [350, 404, 456].map((y) => circle(136, y, 12) + circle(440, y, 12)).join("") + circle(40, 290, 12) + circle(536, 290, 12), tone: epic ? "gold" : "light", layer: "body", only: "art" },
    );
  }
  if (epic) {
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

/** A chest's parts in drawing order, for one version: the body first, then the lid (which swings over it). */
export function chestParts(rank: ChestRank, version: "icon" | "art"): ChestPart[] {
  const parts = wood(rank).filter((p) => !p.only || p.only === version);
  return [...parts.filter((p) => p.layer === "body"), ...parts.filter((p) => p.layer === "lid")];
}
