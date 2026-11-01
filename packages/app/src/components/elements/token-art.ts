/**
 * The balances' images (the owner's direction of 2026-11-01, `docs/design/balances.webp`, direction A): the four currencies' icons
 * and the balance plate in the player badge's rendering. The Cobbles a hewn paving stone of the badge ring's stone; PAVED one thick
 * gold coin with its "P"; vPAVED the same coin in silver; USDC the same coin with a silver rim and Circle's mark on its blue face. The
 * plate is the badge's name plate made small: a dark slate face between a row of bricks above and one below, a gold point closing
 * its open end, cut into a left cap, a tile repeated to the width and a right cap (under the icon). Images, not drawings: WebP copies
 * in `public/token-art/` of the masters in `token-sources/` (`scripts/compress-token-art.ts`). URLs and measures only: nothing here
 * imports an image, and the module stays plain TypeScript so the script reads it under Node.
 */
import type { TokenKind } from "./token-icon";

/** The plate's parts, each an image of its own (one per line: `css-sources.test.ts` reads these as members, not classes). */
export type PlatePart =
  | "cap-left"
  | "tile"
  | "cap-right";

interface Frame {
  /** The master's size: an image takes its box before it loads. */
  width: number;
  height: number;
  /** The side the copies are sized on, and their sizes on it (the other side follows the frame). */
  side: "width" | "height";
  sizes: readonly number[];
}

/**
 * The icons' frame: one square, each currency centred with the same margin (issue 668), so they stand alike in a row. The copies
 * cover the 16 px icon of a line of text on a 2x screen to the 64 px one on a 3x screen.
 */
const ICON: Frame = { width: 512, height: 512, side: "width", sizes: [32, 64, 128, 192] };

export const TOKEN_ART = {
  usdc: ICON,
  paved: ICON,
  vpaved: ICON,
  cobbles: ICON,
} as const satisfies Record<TokenKind, Frame>;

/**
 * The plate's parts share their height; each has one copy, the 36 px plate on a 3x screen (a tile is a CSS background, which takes
 * no `srcSet`; the badge's name plate does the same).
 */
export const PLATE_ART = {
  "cap-left": { width: 449, height: 410, side: "height", sizes: [108] },
  tile: { width: 495, height: 410, side: "height", sizes: [108] },
  "cap-right": { width: 194, height: 410, side: "height", sizes: [108] },
} as const satisfies Record<PlatePart, Frame>;

/**
 * Where the plate's slate face is, as shares of the plate's height, measured on the masters: between the rows of bricks (`top`,
 * `bottom`), from the left cap's left edge (`left`, past the gold point and the corner stones) and the right cap's right edge.
 */
export const PLATE_FACE = { top: 0.225, bottom: 0.22, left: 0.485, right: 0.24 } as const;

/**
 * How far the left cap's gold point reaches past the bricks' corner, as a share of the plate's height: it stands out of the plate's
 * box, as the icon does at the other end, so the face keeps the room a figure needs (issue 860's "9,999.99" on the phone's plate).
 */
export const PLATE_POINT = 0.305;

export const TOKEN_ART_DIR = "/token-art";

/** A currency's icon at one of its sizes: `/token-art/<kind>/<size>.webp`. */
export const tokenArtUrl = (kind: TokenKind, size: number) => `${TOKEN_ART_DIR}/${kind}/${size}.webp`;
/** A plate's part at its size: `/token-art/plate/<part>/<size>.webp`. */
export const plateArtUrl = (part: PlatePart) => `${TOKEN_ART_DIR}/plate/${part}/${PLATE_ART[part].sizes[0]}.webp`;

/**
 * An icon's `<img>` sources shown `px` CSS pixels wide: the largest copy as `src`, every copy with its width in `srcSet`, and
 * `sizes`, so a screen picks the smallest copy that stays sharp at its density.
 */
export function tokenIconSources(kind: TokenKind, px: number) {
  const { sizes } = TOKEN_ART[kind];
  return {
    src: tokenArtUrl(kind, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${tokenArtUrl(kind, s)} ${s}w`).join(", "),
    sizes: `${Math.ceil(px)}px`,
  };
}
