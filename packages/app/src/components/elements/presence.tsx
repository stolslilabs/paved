import { formatAgo, isOnline } from "@paved/game-core";
import { cn } from "../../lib/utils";

export interface PresenceProps {
  /** When the player was last seen, in seconds since the epoch. */
  lastSeen: number;
  /** The clock, in seconds. */
  now: number;
  /** "3h ago" without its "Last seen", which screen readers still hear (FRIENDS-PAGE: the book's rows, "2 h ago"). */
  short?: boolean;
  className?: string;
}

/**
 * Whether another player is online (issue 952): a green dot and "Online" when seen within the last 5 minutes (`isOnline`,
 * game-core), else a grey dot and "Last seen 3h ago". The words say it, not the dot's colour alone.
 */
export function Presence({ lastSeen, now, short = false, className }: PresenceProps) {
  const online = isOnline(lastSeen, now);
  return (
    <span data-slot="presence" data-online={online} className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", online ? "text-foreground" : "text-muted-foreground", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />
      {online ? (
        "Online"
      ) : (
        <span>
          {short ? <span className="sr-only">Last seen </span> : "Last seen "}
          <time dateTime={new Date(lastSeen * 1000).toISOString()}>{formatAgo(lastSeen - now)}</time>
        </span>
      )}
    </span>
  );
}
