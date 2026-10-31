/**
 * The player badge's art (the owner's direction of 2026-10-31, `docs/design/player-badge.webp`): the avatar's ring of paving stones
 * and gold ornaments with its groove, the luminous level bar that runs in the groove from under the shield, the gold shield that holds the level, and
 * the name plate, a tile of bricks repeated to the name's length then a gold arrow cap. Images, not drawings: WebP copies in
 * `public/badge-art/` of the masters in `badge-sources/` (`scripts/compress-badge-art.ts`). URLs and measures only: nothing here
 * imports an image, and the module stays plain TypeScript so the script reads it under Node.
 */

/** The badge's parts, each an image of its own (one per line: `css-sources.test.ts` reads "ring" as a member, not a class). */
export type BadgePart =
  | "ring"
  | "bar"
  | "shield"
  | "plate-tile"
  | "plate-cap";

interface Frame {
  /** The master's size: an image takes its box before it loads. */
  width: number;
  height: number;
  /** The side the copies are sized on, and their sizes on it (the other side follows the frame). */
  side: "width" | "height";
  sizes: readonly number[];
}

/**
 * Each part's frame. The ring and the bar share theirs, one square centred on the portrait, so they lie one over the other; the
 * plate's tile and cap share their height. The copies cover the 96 px avatar on a 2x screen to the 144 px one on a 3x screen.
 */
export const BADGE_ART = {
  ring: { width: 1152, height: 1152, side: "width", sizes: [192, 288, 432] },
  bar: { width: 1152, height: 1152, side: "width", sizes: [288, 432] },
  shield: { width: 865, height: 952, side: "width", sizes: [64, 128] },
  "plate-tile": { width: 703, height: 358, side: "height", sizes: [160] },
  "plate-cap": { width: 248, height: 358, side: "height", sizes: [160] },
} as const satisfies Record<BadgePart, Frame>;

export const BADGE_ART_DIR = "/badge-art";

/** A part's copy at one of its sizes: `/badge-art/<part>/<size>.webp`. */
export const badgeArtUrl = (part: BadgePart, size: number) => `${BADGE_ART_DIR}/${part}/${size}.webp`;

/** A copy's width and height in pixels. */
export function badgeArtSize(part: BadgePart, size: number): { width: number; height: number } {
  const f: Frame = BADGE_ART[part];
  return f.side === "width" ? { width: size, height: Math.round((size * f.height) / f.width) } : { width: Math.round((size * f.width) / f.height), height: size };
}

/**
 * An `<img>`'s sources for a part sized on its width (the ring, the shield) shown `px` CSS pixels wide: the largest copy as `src`,
 * every copy with its width in `srcSet`, and `sizes`, so a screen picks the smallest copy that stays sharp at its density.
 */
export function badgeArtSources(part: Exclude<BadgePart, "bar" | "plate-tile" | "plate-cap">, px: number) {
  const { sizes } = BADGE_ART[part];
  return { src: badgeArtUrl(part, sizes[sizes.length - 1]!), srcSet: sizes.map((s) => `${badgeArtUrl(part, s)} ${s}w`).join(", "), sizes: `${Math.ceil(px)}px` };
}

/** The bar's copy for an avatar `box` px wide (an SVG `<image>` takes no `srcSet`): the larger from the 144 px avatar. */
export const barUrl = (box: number) => badgeArtUrl("bar", box >= 144 ? 432 : 288);


// The measures below are shares of the ring's box (its frame's side), measured on the masters.

/** The portrait's disc: a little wider than the ring's hole (0.635 of the box), so its edge (a guest's dashed one) lies under the groove. */
export const PORTRAIT = 0.68;
/** The ring's groove, between the portrait's hole and the stones, as radii. */
export const GROOVE = { inner: 0.3186, outer: 0.375 } as const;
/** The bar's middle, the groove's, as a radius; its band across, its glow included; its bright core across, inside the groove. */
export const BAR_RADIUS = 0.3468;
export const BAR_BAND = 0.1007;
export const BAR_CORE = 0.0512;
/** The shield's width, and how far it rises above the ring: the badge's box starts at its top. */
export const SHIELD_WIDTH = 0.3;
export const SHIELD_RISE = 0.08;
/** The shield's height, from its frame. */
export const SHIELD_HEIGHT = (SHIELD_WIDTH * BADGE_ART.shield.height) / BADGE_ART.shield.width;
/** The shield's dark face, where the level stands: its centre's height, as a share of the shield's. */
export const SHIELD_FACE_Y = 0.48;
/** The plate's height: half the ring's, centred on it. Its face, between the rows of bricks, is 0.59 of it, centred. */
export const PLATE_HEIGHT = 0.5;

/** The level's bar for a ring `box` px wide (`LevelRing`'s `bar`): its image, its radius and band, the level's place in the shield. */
export const levelBar = (box: number) => ({
  src: barUrl(box),
  radius: BAR_RADIUS * box,
  band: BAR_BAND * box,
  levelY: (SHIELD_FACE_Y * SHIELD_HEIGHT - SHIELD_RISE) * box,
});
