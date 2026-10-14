import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Glyph, type GlyphName } from "../elements/glyph";

export interface ModeCardProps {
  title: string;
  description: string;
  icon: GlyphName;
  /** A short tag beside the title ("Paid", "Free", "Coming soon"). */
  badge?: string;
  /** Disabled: greyed, not clickable; `reason` says why under the description. */
  disabled?: boolean;
  reason?: string;
  /** The gold card that leads a list (Challenge). */
  featured?: boolean;
  /** Extra content under the description (a top 3, a stake line). */
  children?: ReactNode;
  onSelect?: () => void;
  className?: string;
}

/** A game mode as the mockups draw it: an icon tile, a title and a line, a chevron; the whole card is the button. */
export function ModeCard({ title, description, icon, badge, disabled, reason, featured, children, onSelect, className }: ModeCardProps) {
  return (
    <div
      data-slot="card"
      data-disabled={disabled || undefined}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground transition-colors",
        featured ? "border-gold-800 bg-gradient-to-br from-gold-950 to-card" : "border-border",
        disabled ? "opacity-60" : "hover:border-gold-700",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex cursor-pointer items-center gap-4 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-lg",
            featured ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
          )}
        >
          <Glyph name={disabled ? "lock" : icon} className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-base font-semibold">{title}</span>
            {badge && <Badge variant={disabled ? "secondary" : featured ? "default" : "outline"}>{badge}</Badge>}
          </span>
          <span className="text-sm text-muted-foreground">{description}</span>
          {disabled && reason && <span className="text-xs text-warning">{reason}</span>}
        </span>
        {!disabled && <Glyph name="chevron" className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
      </button>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
