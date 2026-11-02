/**
 * The balances' images (the owner's direction of 2026-11-01, `docs/design/balances.webp`, direction A): the four currencies' icons.
 * The Cobbles a hewn paving stone; PAVED one thick gold coin with its "P"; vPAVED the same coin in silver; USDC the same coin with a
 * silver rim and Circle's mark on its blue face. (Their plate is the HUD's frame since HOME-UI-CAPSULES, `hud-frame.tsx`.) Images, not drawings: WebP copies
 * in `public/token-art/` of the masters in `token-sources/` (`scripts/compress-token-art.ts`). URLs and measures only: nothing here
 * imports an image, and the module stays plain TypeScript so the script reads it under Node.
 */
import type { TokenKind } from "./token-icon";

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

export const TOKEN_ART_DIR = "/token-art";

/** A currency's icon at one of its sizes: `/token-art/<kind>/<size>.webp`. */
export const tokenArtUrl = (kind: TokenKind, size: number) => `${TOKEN_ART_DIR}/${kind}/${size}.webp`;

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
