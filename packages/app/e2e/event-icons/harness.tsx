/**
 * EVENT-ICONS-FIX (#1173): the harness of `event-icons.e2e.ts`, served by the Vite dev server (never built). Play's modes with the four
 * events at once (`PLAY_EVENTS`), in a phone's 16 px gutter, as the drawer lays them out.
 */
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { createRoot } from "react-dom/client";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import { PlayModes } from "../../src/components/containers/play-modes";
import { PLAY_EVENTS } from "../../src/mocks/play-events";

const no = () => {};

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">
      <div className="min-h-dvh bg-background px-4 py-4 text-foreground">
        <PlayModes {...PLAY_EVENTS} onChallenge={no} onTraining={no} onExpedition={no} onMasterpiece={no} onColossus={no} onTournament={no} />
      </div>
    </MotionConfig>
  </LazyMotion>,
);
