import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

const gemsVariants = cva("inline-flex items-center gap-1 whitespace-nowrap", {
  variants: {
    size: { sm: "text-xs", md: "text-sm", lg: "text-2xl" },
    tone: { default: "text-foreground", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

const ICON_SIZE: Record<NonNullable<VariantProps<typeof gemsVariants>["size"]>, IconSize> = { sm: "xs", md: "sm", lg: "lg" };

/** A gem count with a comma every three digits ("1,000"), as the packs are written. */
export function formatGems(gems: number): string {
  return Math.round(gems).toLocaleString("en-US");
}

export interface GemsProps extends VariantProps<typeof gemsVariants> {
  value: number;
  /** A sign before the count: `+` for a reward. */
  sign?: "+";
  /** On the icon; `text-info` is its default colour (on a gold button, `text-primary-foreground`). */
  iconClassName?: string;
  className?: string;
}

/**
 * A gem count (P-61): the gem icon and the figure in the mono font, one cell wide per digit, never broken. Its accessible
 * name says "N gems"; the icon is decorative.
 */
export function Gems({ value, sign, size, tone, iconClassName, className }: GemsProps) {
  const text = `${sign ?? ""}${formatGems(value)}`;
  return (
    <span role="img" aria-label={`${text} ${value === 1 ? "gem" : "gems"}`} className={cn(gemsVariants({ size, tone }), className)}>
      <Icon name="gem" size={ICON_SIZE[size ?? "md"]} className={cn("text-info", iconClassName)} />
      <span aria-hidden className="numeric font-semibold">
        {text}
      </span>
    </span>
  );
}
