import { formatInteger } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

const crownsVariants = cva("inline-flex items-center gap-1 whitespace-nowrap", {
  variants: {
    size: { sm: "text-xs", md: "text-sm", lg: "text-2xl" },
    tone: { default: "text-foreground", gain: "text-success", loss: "text-warning", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

const ICON_SIZE: Record<NonNullable<VariantProps<typeof crownsVariants>["size"]>, IconSize> = { sm: "xs", md: "sm", lg: "lg" };

export interface CrownsProps extends VariantProps<typeof crownsVariants> {
  value: number;
  /** A change, not a total: "+20" or "−18", in the gain or loss colour unless `tone` says otherwise. */
  signed?: boolean;
  className?: string;
}

/**
 * A crown count (issue 647): the PvP rating (owner decision, issue 637), Font Awesome's `crown` in gold and the figure in the mono font.
 * Its accessible name says "1,240 crowns" (or "+20 crowns"); the icon is decorative.
 */
export function Crowns({ value, signed, size, tone, className }: CrownsProps) {
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "±") : "";
  const text = `${sign}${formatInteger(Math.abs(value))}`;
  const shown = tone ?? (signed ? (value > 0 ? "gain" : value < 0 ? "loss" : "muted") : "default");
  return (
    <span role="img" aria-label={`${value < 0 ? "-" : signed && value > 0 ? "+" : ""}${formatInteger(Math.abs(value))} ${Math.abs(value) === 1 ? "crown" : "crowns"}`} className={cn(crownsVariants({ size, tone: shown }), className)}>
      <Icon name="crown" size={ICON_SIZE[size ?? "md"]} className="text-crown" />
      <span aria-hidden className="numeric font-semibold">
        {text}
      </span>
    </span>
  );
}
