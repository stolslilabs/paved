import { useEffect, useMemo, useState } from "react";
import { formatBoundary, formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";

const MINUTE_MS = 60_000;

/**
 * The scene's clock, in seconds since the epoch, moving on once a minute (the interval is cleaned up on unmount). `now` is
 * the scene's own clock when it has one (stories and tests fix it): it moves on from there by the time elapsed since it was
 * given. Without it the clock is the browser's.
 */
export function useClock(now?: number): number {
  const [, setTick] = useState(0);
  const anchor = useMemo(() => Date.now(), [now]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), MINUTE_MS);
    return () => clearInterval(id);
  }, []);
  return now == null ? Math.floor(Date.now() / 1000) : now + Math.floor((Date.now() - anchor) / 1000);
}

export interface BoundaryProps {
  /** Seconds since the epoch. */
  at: number;
  /** Seconds since the epoch: the clock. */
  now: number;
  /** `ended 2 h ago` rather than `2 h ago` once past. */
  ended?: boolean;
  /** `dot`: "in 23 h 12 min · Thu, Oct 16, 17:00 UTC" (the default); `paren`: "in 23 h 12 min (Thu, Oct 16, 17:00 UTC)", inside a sentence. */
  join?: "dot" | "paren";
  className?: string;
}

/**
 * A game boundary as the player reads it (the PM's ruling, 2026-10-16): the relative time first ("in 23 h 12 min"), then the
 * absolute time in UTC with its label ("Thu, Oct 16, 17:00 UTC"), never local, and nothing only in a tooltip. One `<time>`
 * whose accessible name is the sentence without the dot.
 */
export function Boundary({ at, now, ended, join = "dot", className }: BoundaryProps) {
  const relative = formatRelative(at - now, { ended });
  const absolute = formatBoundary(at);
  return (
    <time dateTime={new Date(at * 1000).toISOString()} aria-label={join === "dot" ? `${relative}, ${absolute}` : `${relative} (${absolute})`} className={cn("text-foreground", className)}>
      {join === "paren" ? (
        `${relative} (${absolute})`
      ) : (
        <>
          {relative}{" "}
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>{" "}
          {absolute}
        </>
      )}
    </time>
  );
}

export interface DeadlineProps {
  /** Seconds since the epoch. */
  expiresAt: number;
  /** Seconds since the epoch: the scene's clock. */
  now: number;
  /** Ignored: a game boundary is always UTC. Kept so a scene that still passes it compiles. */
  timeZone?: string;
  className?: string;
}

/** When a game expires: "in 23 h 12 min · Thu, Oct 16, 17:00 UTC", the relative time moving on once a minute. */
export function Deadline({ expiresAt, now, className }: DeadlineProps) {
  const clock = useClock(now);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      {expiresAt > clock && <span>expires</span>}
      <Boundary at={expiresAt} now={clock} ended />
    </span>
  );
}
