import * as m from "motion/react-m";
import { Wordmark } from "../elements/wordmark";

/** The boot screen and the route error's check (section 6.1): the length is unknown, so the bar runs back and forth. */
export function LoadingScene() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background bg-[radial-gradient(50%_35%_at_50%_45%,var(--glow),transparent)] px-6 text-foreground"
    >
      <Wordmark tagline="Build · Connect · Score" />
      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-input" role="progressbar" aria-label="Loading">
          {/* A transform: under reduced motion (the app's `MotionConfig`) the bar holds still in the middle. */}
          <m.div
            className="absolute inset-y-0 left-1/3 w-1/3 rounded-full bg-primary"
            animate={{ x: ["-200%", "200%"] }}
            transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
          />
        </div>
        <p className="w-full text-xs text-muted-foreground">Loading…</p>
      </div>
    </main>
  );
}
