import { cva, type VariantProps } from "class-variance-authority";
// Files, not data URIs (`?no-inline`): the first bundle carries four URLs, and the browser caches the icons once.
import cobbles from "../../assets/tokens/cobbles.svg?no-inline";
import paved from "../../assets/tokens/paved.svg?no-inline";
import usdc from "../../assets/tokens/usdc.svg?no-inline";
import vpaved from "../../assets/tokens/vpaved.svg?no-inline";
import { cn } from "../../lib/utils";

/** The game's tokens and currencies (issue 620): USDC, PAVED, the Vault's vPAVED and the Cobbles. */
export type TokenKind = "usdc" | "paved" | "vpaved" | "cobbles";

/** Each kind's icon file (`src/assets/tokens/`) and its name. */
export const TOKEN_ICONS: Record<TokenKind, { src: string; name: string }> = {
  usdc: { src: usdc, name: "USDC" },
  paved: { src: paved, name: "PAVED" },
  vpaved: { src: vpaved, name: "vPAVED" },
  cobbles: { src: cobbles, name: "Cobbles" },
};

const tokenIconVariants = cva("inline-block shrink-0 select-none", {
  variants: {
    // In px: 16, 20, 24, 32, 48, 64. `em`: a little taller than the text it sits in, never under 16 px.
    size: { xs: "size-4", sm: "size-5", md: "size-6", lg: "size-8", xl: "size-12", "2xl": "size-16", em: "size-[max(1rem,1.25em)]" },
  },
  defaultVariants: { size: "md" },
});

export type TokenIconSize = NonNullable<VariantProps<typeof tokenIconVariants>["size"]>;

/**
 * The balances' spacing rule (issue 668), the same for every balance (`Amount`, `Cobbles`, `ResourcePlate`, so the resource bar, the
 * Vault and the shop): the gap between a token's icon and its figure is a quarter of the icon's size. In text the icon is
 * `em` (1.25em), so the gap is 0.3125em, never under 4 px. In a plate the icon sits at the same inset on every side, half of
 * the height left inside the border, and the figure ends one inset plus one gap before the rim (`ResourcePlate`).
 */
export const TOKEN_GAP = "gap-x-[max(0.25rem,0.3125em)]";

export interface TokenIconProps extends VariantProps<typeof tokenIconVariants> {
  kind: TokenKind;
  /** The accessible name; none means decorative (the figure beside it names the token). */
  label?: string;
  className?: string;
}

/**
 * A token's icon (issue 620), one file per kind: USDC's mark (Circle's, from Nums), PAVED's Almendra "P" in gold on a dark ink
 * coin with a gold rim (issue 711, vPAVED's coin of issue 668 with a smaller P), vPAVED the same coin in grayscale (issue 711: a
 * disabled token, the Vault's share is not transferable), and the Cobbles' cobblestone (issue 849, drawn for Paved in relief). The P and
 * the stone keep an even margin to the edge of the coin's box (issue 668). Drawn as an image: the colours are the file's own, the same
 * on every background.
 */
export function TokenIcon({ kind, size, label, className }: TokenIconProps) {
  return (
    <img
      src={TOKEN_ICONS[kind].src}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      data-slot="token-icon"
      data-token={kind}
      className={cn(tokenIconVariants({ size }), className)}
    />
  );
}
