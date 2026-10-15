import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

const cobblesVariants = cva("inline-flex items-center gap-1 whitespace-nowrap", {
  variants: {
    size: { sm: "text-xs", md: "text-sm", lg: "text-2xl" },
    tone: { default: "text-foreground", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

const ICON_SIZE: Record<NonNullable<VariantProps<typeof cobblesVariants>["size"]>, IconSize> = { sm: "xs", md: "sm", lg: "lg" };

/** A Cobble count with a comma every three digits ("1,000"), as the packs are written. */
export function formatCobbles(cobbles: number): string {
  return Math.round(cobbles).toLocaleString("en-US");
}

export interface CobblesProps extends VariantProps<typeof cobblesVariants> {
  value: number;
  /** A sign before the count: `+` for a reward. */
  sign?: "+";
  /** On the icon; `text-foreground` (a light stone) is its default colour (on a gold button, `text-primary-foreground`). */
  iconClassName?: string;
  className?: string;
}

/**
 * A Cobble count (P-61): the cobblestone icon (Font Awesome's `cubes-stacked`) and the figure in the mono font, one cell wide per digit, never broken. Its accessible
 * name says "N Cobbles"; the icon is decorative.
 */
export function Cobbles({ value, sign, size, tone, iconClassName, className }: CobblesProps) {
  const text = `${sign ?? ""}${formatCobbles(value)}`;
  return (
    <span role="img" aria-label={`${text} ${value === 1 ? "Cobble" : "Cobbles"}`} className={cn(cobblesVariants({ size, tone }), className)}>
      <Icon name="cubes-stacked" size={ICON_SIZE[size ?? "md"]} className={cn("text-foreground", iconClassName)} />
      <span aria-hidden className="numeric font-semibold">
        {text}
      </span>
    </span>
  );
}
