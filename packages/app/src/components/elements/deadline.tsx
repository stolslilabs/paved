import { formatDate } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** "23 h 12 min", "45 min", "0 min": the time left, cut to the minute. */
export function formatRelative(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/**
 * A moment as the player reads it: "Thu, Oct 15, 17:00" in `timeZone` (the viewer's own when omitted). The locale is
 * fixed (en-US, with a 24 h clock) so a story reads the same everywhere once its time zone is fixed too.
 */
export function formatLocal(seconds: number, timeZone?: string): string {
  return formatDate(seconds * 1000, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** The same moment in UTC, for the tooltip: "2026-10-15 15:00 UTC". */
export function formatUtc(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export interface DeadlineProps {
  /** Seconds since the epoch. */
  expiresAt: number;
  /** Seconds since the epoch: the scene's clock. */
  now: number;
  /** An IANA zone; the viewer's own when omitted. Stories and tests fix it. */
  timeZone?: string;
  className?: string;
}

/**
 * When a game expires (the PM's ruling, 2026-10-14): "expires in 23 h 12 min" and the player's local time, with UTC in a
 * tooltip.
 */
export function Deadline({ expiresAt, now, timeZone, className }: DeadlineProps) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span>expires in {formatRelative(expiresAt - now)}</span>
      <span aria-hidden>·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            dateTime={new Date(expiresAt * 1000).toISOString()}
            tabIndex={0}
            className="cursor-help underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {formatLocal(expiresAt, timeZone)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{formatUtc(expiresAt)}</TooltipContent>
      </Tooltip>
    </span>
  );
}
