import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/** A Challenge game is valid 24 h from its start (S1 `GAME_VALIDITY`: `GameView.expiresAt` = start + 24 h). */
export const GAME_VALIDITY_S = 86_400;
/** Under this, the countdown turns to the warning colour. */
export const COUNTDOWN_WARN_S = 3_600;

/** `h:mm:ss` from seconds; 0 and below read as 0:00:00. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${mm}:${ss}`;
}

/**
 * The time left in two units at most, the Paved UX Book's (MISSIONS-PAGE): "4d 5h" from a day, "6h 12m" from an hour, "12m 30s"
 * under it; 0 and below read as "0s".
 */
export function formatShortRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s % 60}s` : `${s % 60}s`;
}

export interface CountdownProps {
  /** Seconds since the epoch. */
  expiresAt: number;
  /** Seconds since the epoch: the scene's clock, a prop so a story or a test stays still. */
  now: number;
  label?: string;
  /** Leaves the visible label out (the icon and the time stay); the timer's accessible name still carries it. */
  hideLabel?: boolean;
  /** The time in two units at most ("6h 12m", `formatShortRemaining`), the label left out: a chip's (the Missions' rows). */
  short?: boolean;
  className?: string;
}

/** The time left before a game expires (`expires_at`); amber under an hour, red once expired. */
export function Countdown({ expiresAt, now, label = "Expires in", hideLabel, short = false, className }: CountdownProps) {
  const left = expiresAt - now;
  const state = left <= 0 ? "expired" : left < COUNTDOWN_WARN_S ? "warning" : "ok";
  return (
    // The label is hidden on a phone: the wrapper carries the whole sentence for a screen reader.
    <span
      role="timer"
      aria-label={state === "expired" ? "Expired" : `${label} ${formatRemaining(left)}`}
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        state === "ok" && "text-muted-foreground",
        state === "warning" && "text-warning",
        state === "expired" && "text-destructive-text",
        className,
      )}
    >
      <Icon name="clock" size="sm" />
      {state === "expired" ? (
        <span className="font-semibold">Expired</span>
      ) : (
        <>
          {!hideLabel && !short && <span className="hidden tablet:inline">{label}</span>}
          <time dateTime={`PT${Math.max(0, left)}S`} className="numeric font-semibold">{short ? formatShortRemaining(left) : formatRemaining(left)}</time>
        </>
      )}
    </span>
  );
}
