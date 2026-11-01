import type { League, LeagueId } from "../../lib/pvp-rules";

/**
 * The leagues' standards (issue 917, after the owner's design in `docs/design/league-standards.webp`, redrawn 2026-11-01: one
 * material and one colour a tier, the same shield for all, the division's numeral in its middle): for each of the ten tiers a crest,
 * its icon (the crest simplified to read at 16 to 40 px), a plate (its name), a banner and the avatar's rim, the ring of the tier's
 * material around the player's portrait. Images, not drawings: WebP copies
 * in `public/league-art/` of the masters in `league-sources/` (`scripts/compress-league-art.ts`). URLs only: nothing here imports
 * an image, and the module stays plain TypeScript so the script reads it under Node.
 */

/** The ten tiers: Unranked (a player outside the leagues, a client state) and the nine groups of `LeagueId`. */
export type LeagueTier = "unranked" | LeagueId;

/** The ten tiers up the ladder, with their names. */
export const LEAGUE_TIERS: readonly { id: LeagueTier; name: string }[] = [
  { id: "unranked", name: "Unranked" },
  { id: "wood", name: "Wood" },
  { id: "iron", name: "Iron" },
  { id: "bronze", name: "Bronze" },
  { id: "silver", name: "Silver" },
  { id: "gold", name: "Gold" },
  { id: "emerald", name: "Emerald" },
  { id: "diamond", name: "Diamond" },
  { id: "master", name: "Master" },
  { id: "grandmaster", name: "Grand Master" },
];

/** A league's tier; none (a player who has not entered the leagues) is Unranked. */
export const tierOf = (league: Pick<League, "id"> | null | undefined): LeagueTier => league?.id ?? "unranked";

/** A league's division, its numeral: III, II, I up a group. */
export type Division = "I" | "II" | "III";

/** A league's division (issue 917's open point 3, as numerals since 2026-10-30); none for Wood and Grand Master. */
export function divisionOf(league: Pick<League, "index">): Division | null {
  return league.index < 1 || league.index > 21 ? null : (["III", "II", "I"] as const)[(league.index - 1) % 3]!;
}

/** A standard's parts, each an image of its own. */
export type LeaguePart = "crest" | "icon" | "plate" | "banner" | "rim";

/** The tiers drawn once per division (the seven groups of three leagues): Unranked, Wood and Grand Master have none. */
export const DIVIDED: ReadonlySet<LeagueTier> = new Set(["iron", "bronze", "silver", "gold", "emerald", "diamond", "master"]);

interface Frame {
  /** The masters' size: every tier's file of a part has it, so an image takes its box before it loads. */
  width: number;
  height: number;
  /** The side the copies are sized on, and their sizes on it (the other side follows the frame). */
  side: "width" | "height";
  sizes: readonly number[];
  /** The part is drawn once per division of a divided tier too (the numeral in its middle), beside its plain version. */
  divisions: boolean;
}

/**
 * Each part's frame, every tier's file of a part put on it by one rule, so they swap without a layout change. The crest, the icon and
 * the rim on a square: the shield centred at 98% of its height in its own proportions (the owner's, 2026-11-01, in place of the 1:1
 * stretch of 2026-10-30: about 0.87 of its height wide), the rim's hole the same on every tier (`RIM_HOLE`). The plate and the banner
 * on frames of their own shape (not square, the owner's, 2026-11-01): the plate's end caps kept and its middle sized to the frame's
 * width; the banner's plain cloth sized to the frame, its numeral or emblem laid over it unstretched, at one size and place on every
 * tier. The copies cover 16 px icons to a 314 px crest on a 2x screen.
 */
export const LEAGUE_ART = {
  crest: { width: 512, height: 512, side: "height", sizes: [256, 512], divisions: true },
  icon: { width: 256, height: 256, side: "height", sizes: [64, 128], divisions: true },
  plate: { width: 768, height: 208, side: "width", sizes: [256, 512], divisions: false },
  banner: { width: 376, height: 512, side: "height", sizes: [256, 512], divisions: true },
  rim: { width: 512, height: 512, side: "height", sizes: [128, 256], divisions: false },
} as const satisfies Record<LeaguePart, Frame>;

/** Whether a tier's part has a version per division: the part is drawn so, and the tier has divisions. */
const divided = (part: LeaguePart, tier: LeagueTier) => LEAGUE_ART[part].divisions && DIVIDED.has(tier);

/** A part's versions for a tier: its plain one (none), and one per division where the part and the tier have them. */
export const versionsOf = (part: LeaguePart, tier: LeagueTier): readonly (Division | null)[] => (divided(part, tier) ? [null, "I", "II", "III"] : [null]);

/**
 * The rim's hole: the share of the frame's width inside the ring, the same on every tier. The portrait under it is a disc a little
 * wider (`RIM_PORTRAIT`), so its edge always hides under the ring.
 */
export const RIM_HOLE = 0.664;
export const RIM_PORTRAIT = 0.694;

/**
 * The plate's dark face: the share of the plate's width the name may take, inside the frame's end caps. The plates of 2026-11-01 have
 * wider faces (0.76 of the width at the narrowest, Master's, measured on the masters); the share is kept, so a name fits as before.
 */
export const PLATE_FACE = 0.62;

export const LEAGUE_ART_DIR = "/league-art";

/** A version's file name: the tier, and its division's numeral in lower case (`bronze-ii`); the plain version the tier alone. */
export const artName = (tier: LeagueTier, division: Division | null = null) => (division ? `${tier}-${division.toLowerCase()}` : tier);

/**
 * A part's copy at one of its sizes: `/league-art/<part>/<size>/<name>.webp`. A division asked of a part or a tier drawn without them
 * (the plate, the rim; Unranked, Wood, Grand Master) gives the plain version.
 */
export const artUrl = (part: LeaguePart, tier: LeagueTier, size: number, division: Division | null = null) =>
  `${LEAGUE_ART_DIR}/${part}/${size}/${artName(tier, divided(part, tier) ? division : null)}.webp`;

/** A copy's width and height in pixels. */
export function artSize(part: LeaguePart, size: number): { width: number; height: number } {
  const f: Frame = LEAGUE_ART[part];
  return f.side === "width" ? { width: size, height: Math.round((size * f.height) / f.width) } : { width: Math.round((size * f.width) / f.height), height: size };
}

/**
 * An `<img>`'s sources for a part shown `px` CSS pixels wide (none: as large as it gets): the largest copy as `src`, every copy
 * with its width in `srcSet`, and `sizes`, so a screen picks the smallest copy that stays sharp at its density.
 */
export function artSources(part: LeaguePart, tier: LeagueTier, px?: number, division: Division | null = null) {
  const { sizes } = LEAGUE_ART[part];
  return {
    src: artUrl(part, tier, sizes[sizes.length - 1]!, division),
    srcSet: sizes.map((s) => `${artUrl(part, tier, s, division)} ${artSize(part, s).width}w`).join(", "),
    sizes: `${Math.ceil(px ?? artSize(part, sizes[sizes.length - 1]!).width)}px`,
    width: LEAGUE_ART[part].width,
    height: LEAGUE_ART[part].height,
  };
}
