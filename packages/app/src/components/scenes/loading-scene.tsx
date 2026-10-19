import * as m from "motion/react-m";
import { Progress } from "../ui/progress";
import { Wordmark } from "../elements/wordmark";

export interface LoadingSceneProps {
  /** 0 to 100 while the board's assets load; null when the length is unknown (the app booting, a route's fallback). */
  progress: number | null;
  message?: string;
  /** A line under the bar while the player waits. */
  tip?: string;
}

/** The boot screen and every route's `Suspense` fallback, and the board's asset loading (section 6.1). */
export function LoadingScene({ progress, message = "Loading", tip }: LoadingSceneProps) {
  return (
    <main
      aria-busy="true"
      className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background bg-[radial-gradient(50%_35%_at_50%_45%,var(--glow),transparent)] px-6 text-foreground"
    >
      <Wordmark size="lg" tagline="Build · Connect · Score" />
      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        {progress == null ? (
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-input" role="progressbar" aria-label={message}>
            {/* A transform: under reduced motion (the app's `MotionConfig`) the bar holds still in the middle. */}
            <m.div
              className="absolute inset-y-0 left-1/3 w-1/3 rounded-full bg-primary"
              animate={{ x: ["-200%", "200%"] }}
              transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
            />
          </div>
        ) : (
          <Progress value={progress} aria-label={message} />
        )}
        <p className="flex w-full justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 wrap-anywhere">{message}…</span>
          {progress != null && <span className="numeric shrink-0">{Math.round(progress)}%</span>}
        </p>
      </div>
      {tip && <p className="max-w-xs text-center text-sm wrap-anywhere text-muted-foreground">{tip}</p>}
    </main>
  );
}
