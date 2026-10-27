import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Plate, PLATE_FIGURE, PlateDisc, plateIconClass, type PlateSize } from "./resource-plate";
import { formatHoursMinutes, shieldDuration, shieldEnd, shieldLabel, shieldUp } from "./shield-time";

export interface ShieldPlateProps {
  /** The shield's end (seconds since the epoch), `PvpShield.until` while `up`; null without one. */
  endsAt: number | null | undefined;
  /** Seconds since the epoch: the page's clock, a prop so a story or a test stays still. */
  now: number;
  /** The balances' sizes (issue 828); `auto` (the home's), `sm` on a phone and `md` from `desktop`. */
  size?: PlateSize;
  className?: string;
}

/**
 * The village's shield while it lasts (issues 806, 829): the balances' plate mirrored, the shield over its left end, and the time
 * left in `HHhMMm`, the minutes rounded up, so it never reads 00h00m while up. It changes each minute with the page's clock and
 * leaves when the shield ends; nothing without one. A tap opens a popover with the rule (until when, and that attacking drops it),
 * whose fade is off under reduced motion. Loaded on its own chunk by the home (FIRST-LOAD): the popover's Radix parts only load for
 * a shielded player.
 */
export function ShieldPlate({ endsAt, now, size = "auto", className }: ShieldPlateProps) {
  if (!shieldUp(endsAt, now)) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="shield-plate"
          aria-label={shieldLabel(endsAt, now)}
          className={cn("flex min-h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <Plate
            side="left"
            size={size}
            icon={
              <PlateDisc size={size}>
                <Icon name="shield-halved" className={cn("relative text-info", plateIconClass(size))} />
              </PlateDisc>
            }
          >
            <time dateTime={shieldDuration(endsAt, now)} className={cn(PLATE_FIGURE, "text-foreground")}>
              {formatHoursMinutes(endsAt - now)}
            </time>
          </Plate>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Shield" data-slot="shield-popover">
        Your village is shielded until <span className="numeric font-semibold">{shieldEnd(endsAt)}</span>: no one can attack it. Attacking drops your shield.
      </PopoverContent>
    </Popover>
  );
}
