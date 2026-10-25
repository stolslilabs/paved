import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { COUNTDOWN_WARN_S, formatRemaining } from "./countdown";

export interface HeroCountdownProps {
  /** Seconds since the epoch. */
  expiresAt: number;
  /** Seconds since the epoch: the scene's clock, a prop so a story or a test stays still. */
  now: number;
  label: string;
  className?: string;
}

/**
 * `Countdown` as a page's hero (the Chests page's reset, issue 759): the label over a large figure, amber under an hour. Apart
 * from `Countdown`, which the home's first load carries, so that only the pages that show it take its markup.
 */
export function HeroCountdown({ expiresAt, now, label, className }: HeroCountdownProps) {
  const left = expiresAt - now;
  const state = left <= 0 ? "expired" : left < COUNTDOWN_WARN_S ? "warning" : "ok";
  return (
    <span
      role="timer"
      aria-label={state === "expired" ? "Expired" : `${label} ${formatRemaining(left)}`}
      data-state={state}
      className={cn(
        "inline-flex flex-col items-center gap-1 whitespace-nowrap",
        state === "ok" && "text-muted-foreground",
        state === "warning" && "text-warning",
        state === "expired" && "text-destructive-text",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Icon name="clock" size="xs" />
        {state === "expired" ? "Expired" : label}
      </span>
      <time dateTime={`PT${Math.max(0, left)}S`} className="numeric text-4xl font-bold text-foreground desktop:text-5xl">
        {formatRemaining(left)}
      </time>
    </span>
  );
}
