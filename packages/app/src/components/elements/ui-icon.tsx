import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { uiIconSources, type UiIconName } from "./ui-art";

const uiIconVariants = cva("inline-block shrink-0 select-none", {
  variants: {
    // In px: 20, 24, 32, 40, 48, 64.
    size: { xs: "size-5", sm: "size-6", md: "size-8", lg: "size-10", xl: "size-12", "2xl": "size-16" },
  },
  defaultVariants: { size: "md" },
});

export type UiIconSize = NonNullable<VariantProps<typeof uiIconVariants>["size"]>;

/** Each size's width in CSS px, for the copy it loads. */
const SIZE_PX: Record<UiIconSize, number> = { xs: 20, sm: 24, md: 32, lg: 40, xl: 48, "2xl": 64 };

export interface UiIconProps extends VariantProps<typeof uiIconVariants> {
  name: UiIconName;
  /** The accessible name; none means decorative (the button's text names it). */
  label?: string;
  /** The width it is drawn at in CSS px when `className` sizes it, so it loads a copy sharp at that size. */
  px?: number;
  className?: string;
}

/**
 * A HUD icon (the owner's mobile direction of 2026-11-01, `ui-art.ts`): a full-colour image, chunky and outlined, in the rendering
 * of the home's buttons and dock. Every icon stands in the same square with the same margin, so one swaps for another without a
 * layout change; the screen loads the smallest copy sharp at its size and density. Its colours are the file's own, the same on every
 * background. Text-sized icons elsewhere stay `Icon`.
 */
export function UiIcon({ name, size, label, px, className }: UiIconProps) {
  return (
    <img
      {...uiIconSources(name, px ?? SIZE_PX[size ?? "md"])}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
      data-slot="ui-icon"
      data-icon={name}
      className={cn(uiIconVariants({ size }), className)}
    />
  );
}
