import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";

export interface ModeCardProps {
  title: string;
  description: string;
  icon: string;
  /** A short tag beside the title ("Paid", "Free", "Coming soon"). */
  badge?: string;
  /** Disabled: greyed, not clickable; `reason` says why under the description. */
  disabled?: boolean;
  reason?: string;
  /** The card that leads a list (Challenge): a gold edge and a gold icon key. */
  featured?: boolean;
  /** A render of the mode (direction D, #537) on the left, in place of the icon key: the mockups' Play list. */
  art?: string;
  /** A render across the top of the card, as a banner: the mockups' Daily Challenge. */
  banner?: string;
  /** Extra content under the description (a connect hint, a stake line). */
  children?: ReactNode;
  onSelect?: () => void;
  className?: string;
}

/**
 * A game mode as the mockups draw it (direction D, #537): an icon key or a render on the left, a title and a line, a chevron;
 * the whole card is the button and takes the white states (`state-layer`) of every button. A banner render may lead it.
 */
export function ModeCard({ title, description, icon, badge, disabled, reason, featured, art, banner, children, onSelect, className }: ModeCardProps) {
  return (
    <div
      data-slot="card"
      data-disabled={disabled || undefined}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground transition-colors",
        featured ? "border-primary/40" : "border-border",
        disabled ? "opacity-60" : "state-layer",
        className,
      )}
    >
      {banner && <img src={banner} alt="" width={320} height={200} draggable={false} loading="lazy" decoding="async" className="h-36 w-full rounded-lg bg-secondary object-cover" />}
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex cursor-pointer items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring disabled:cursor-not-allowed"
      >
        {art ? (
          <img src={art} alt="" width={320} height={200} draggable={false} loading="lazy" decoding="async" className="h-20 w-28 shrink-0 self-start rounded-lg bg-secondary object-cover" />
        ) : (
          <span className={cn("grid size-11 shrink-0 place-items-center self-start rounded-lg", featured ? "bg-primary text-primary-foreground" : "bg-secondary text-primary")}>
            <Icon name={disabled ? "lock" : icon} size="md" />
          </span>
        )}
        {/* The text wraps (WRAP360); the key stays at the top, the chevron at the card's middle. */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{title}</span>
            {badge && <Badge variant={disabled ? "secondary" : featured ? "default" : "outline"}>{badge}</Badge>}
          </span>
          <span className="text-sm text-muted-foreground">{description}</span>
          {disabled && reason && <span className="text-xs text-warning">{reason}</span>}
        </span>
        {!disabled && <Icon name="chevron-right" className="self-center text-muted-foreground transition-transform group-hover:translate-x-0.5" size="sm" />}
      </button>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
