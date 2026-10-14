import { cn } from "../../lib/utils";
import { Glyph } from "./glyph";

/** A paid game is valid 24 h from its purchase (`TermsView.time + 86400`, P-34). */
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

export interface CountdownProps {
  /** Seconds since the epoch. */
  expiresAt: number;
  /** Seconds since the epoch: the scene's clock, a prop so a story or a test stays still. */
  now: number;
  label?: string;
  className?: string;
}

/** The time left before a game expires (`expires_at`); amber under an hour, red once expired. */
export function Countdown({ expiresAt, now, label = "Expires in", className }: CountdownProps) {
  const left = expiresAt - now;
  const state = left <= 0 ? "expired" : left < COUNTDOWN_WARN_S ? "warning" : "ok";
  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        state === "ok" && "text-muted-foreground",
        state === "warning" && "text-warning",
        state === "expired" && "text-destructive-text",
        className,
      )}
    >
      <Glyph name="clock" className="size-3.5" />
      {state === "expired" ? (
        <span className="font-semibold">Expired</span>
      ) : (
        <>
          <span className="sr-only tablet:not-sr-only">{label}</span>
          <time dateTime={`PT${Math.max(0, left)}S`} className="font-mono font-semibold tabular-nums">{formatRemaining(left)}</time>
        </>
      )}
    </span>
  );
}
