import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { formatHoursMinutes, shieldDuration, shieldEnd, shieldLabel, shieldUp } from "./shield-time";

export interface ShieldChipProps {
  /** The shield's end (seconds since the epoch), `PvpShield.until` while `up`; null without one. */
  endsAt: number | null | undefined;
  /** Seconds since the epoch: the page's clock, a prop so a story or a test stays still. */
  now: number;
  className?: string;
}

/**
 * The village's shield while it lasts (issue 806): the shield and its time left in `HH:MM`, the minutes rounded up, so it never
 * reads 00:00 while up. It changes each minute with the page's clock and leaves when the shield ends; nothing without one. A tap
 * opens a popover with the rule (until when, and that attacking drops it), whose fade is off under reduced motion. Loaded on its
 * own chunk by `PlayerBadge` (FIRST-LOAD): the popover's Radix parts only load for a shielded player.
 */
export function ShieldChip({ endsAt, now, className }: ShieldChipProps) {
  if (!shieldUp(endsAt, now)) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="shield-chip"
          aria-label={shieldLabel(endsAt, now)}
          className={cn(
            "state-layer flex min-h-7 items-center gap-1 rounded-full border border-info/40 bg-card/90 px-2 py-0.5 text-xs text-info backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Icon name="shield-halved" size="sm" />
          <time dateTime={shieldDuration(endsAt, now)} className="numeric font-semibold text-foreground">
            {formatHoursMinutes(endsAt - now)}
          </time>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Shield" data-slot="shield-popover">
        Your village is shielded until <span className="numeric font-semibold">{shieldEnd(endsAt)}</span>: no one can attack it. Attacking drops your shield.
      </PopoverContent>
    </Popover>
  );
}
