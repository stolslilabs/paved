import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { tokenIconSources } from "./token-art";

/** The game's tokens and currencies (issue 620): USDC, PAVED, the Vault's vPAVED and the Cobbles. */
export type TokenKind = "usdc" | "paved" | "vpaved" | "cobbles";

/** Each kind's name (its images are `token-art.ts`'s). */
export const TOKEN_ICONS: Record<TokenKind, { name: string }> = {
  usdc: { name: "USDC" },
  paved: { name: "PAVED" },
  vpaved: { name: "vPAVED" },
  cobbles: { name: "Cobbles" },
};

const tokenIconVariants = cva("inline-block shrink-0 select-none", {
  variants: {
    // In px: 16, 20, 24, 32, 48, 64. `em`: a little taller than the text it sits in, never under 16 px.
    size: { xs: "size-4", sm: "size-5", md: "size-6", lg: "size-8", xl: "size-12", "2xl": "size-16", em: "size-[max(1rem,1.25em)]" },
  },
  defaultVariants: { size: "md" },
});

export type TokenIconSize = NonNullable<VariantProps<typeof tokenIconVariants>["size"]>;

/** Each size's width in CSS px, for the copy it loads; `em` at the largest text it sits in (a 24 px figure, so 30 px). */
const SIZE_PX: Record<TokenIconSize, number> = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48, "2xl": 64, em: 30 };

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
  /** The width it is drawn at in CSS px when `className` sizes it (a plate's end), so it loads a copy sharp at that size. */
  px?: number;
  className?: string;
}

/**
 * A token's icon (issue 620), an image per kind in the player badge's rendering (the owner's direction A of 2026-11-01,
 * `token-art.ts`): the Cobbles a hewn paving stone of the badge ring's stone, PAVED a thick gold coin with its "P", vPAVED the same
 * coin in silver, USDC the same coin with a silver rim and Circle's mark, unaltered, on its blue face. Each stands in the same square
 * with the same margin (issue 668); the screen loads the smallest copy sharp at its size and density. Drawn as an image: the colours
 * are the file's own, the same on every background.
 */
export function TokenIcon({ kind, size, label, px, className }: TokenIconProps) {
  return (
    <img
      {...tokenIconSources(kind, px ?? SIZE_PX[size ?? "md"])}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
      data-slot="token-icon"
      data-token={kind}
      className={cn(tokenIconVariants({ size }), className)}
    />
  );
}
